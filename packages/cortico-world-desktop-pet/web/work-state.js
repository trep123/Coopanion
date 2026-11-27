/**
 * Work mode's two pure parts, for the pet page (pet-app.js) and its tests: the phases the pet goes through as work mode
 * starts and ends (`createWorkMachine`), and the hands, keys and mouse drawn from the window's input messages
 * (`createWorkHands`, host/work-input.cjs). Nothing here touches the page.
 *
 * Phases: `off`; `walk` (work mode was turned on with the body too near an edge for the desk: it walks to `target`
 * first); `enter` (the desk, chair, keyboard and mouse come out around the standing body, for `enterMs`); `on` (the
 * body sits at the desk); `away` (the body was picked up or thrown: the props are packed away and come out again where it
 * lands); `leave` (work mode was turned off: the props are packed away for `leaveMs` while the body stands up).
 */

/** Seconds a walk to the desk's spot may take before the desk comes out where the body is. */
export const WORK_WALK_MAX = 6;
/** Body modes in which it is carried or in the air (web/kit/body.js): no desk under it then. */
const AWAY_MODES = new Set(['drag', 'air', 'crouch', 'land']);

/**
 * `step(on, body, room, now)` advances the phase and returns `{ phase, changed, target }`: `on` is whether work mode is
 * wanted, `body` the body's layout (`{ x, mode }`, or null with no body), `room` `{ minX, maxX }` the stage x the
 * body's middle must stand within for the props to fit, `now` in seconds. `target` is the x to walk to in `walk`.
 * `enterMs` and `leaveMs` are read on each step (0 at low motion).
 */
export function createWorkMachine({ enterMs = () => 0, leaveMs = () => 0 } = {}) {
  let phase = 'off', since = 0, target = null;
  const go = (p, now) => { phase = p; since = now; };
  /** The phase after `off` or `away`: walk first when the body stands where the props do not fit. */
  const start = (body, room, now) => {
    const x = Math.min(room.maxX, Math.max(room.minX, body.x));
    if (Math.abs(x - body.x) > 2 && room.minX <= room.maxX) { target = x; go('walk', now); } else { target = null; go('enter', now); }
  };
  return {
    get phase() { return phase; },
    step(on, body, room, now) {
      const was = phase;
      const away = !body || AWAY_MODES.has(body.mode);
      if (!on) {
        if (phase === 'enter' || phase === 'on') go('leave', now);
        else if (phase === 'walk' || phase === 'away') go('off', now);
        else if (phase === 'leave' && (now - since) * 1000 >= leaveMs()) go('off', now);
      } else if (phase === 'off' || phase === 'leave') {
        if (!away) start(body, room, now);
      } else if (away && phase !== 'away') {
        go('away', now);
      } else if (phase === 'away') {
        if (!away) start(body, room, now);
      } else if (phase === 'walk') {
        if (Math.abs(body.x - target) <= 3 || now - since >= WORK_WALK_MAX) go('enter', now);
      } else if (phase === 'enter' && (now - since) * 1000 >= enterMs()) {
        go('on', now);
      }
      return { phase, changed: phase !== was, target };
    },
  };
}

/** Milliseconds a key stays lit after a press, and a hand stays down on it at the least (it stays while the key is held). */
export const KEY_LIT_MS = 220, PAW_DOWN_MS = 90;
/** Keyboard rows and keys a row for each hand, as the desk draws them (web/work-desk.js). */
export const KEY_ROWS = 4, KEYS_PER_HAND = 6;
/** Most keys lit at once. */
const LIT_MAX = 12;
/** How far the mouse slides on the desk for a full step of the cursor (`move` ±1), and the most, in logo units. */
const MOUSE_STEP = 3, MOUSE_MAX = 7;
/** Seconds the mouse's slide takes to ease back to its rest, as a rate (1/s). */
const MOUSE_RETURN = 3;

/**
 * The hands and the devices on the desk, from the window's messages: `feed(msg, now)` takes one (host/work-input.cjs:
 * `{ paused, keys }`, or `{ held, presses, buttons, move, password }`), `step(dt)` eases the mouse, and `view(now)`
 * gives what to draw (`now` in milliseconds):
 * `{ lit: [{ hand, row, col }], hands: { left: { down, key }, right: { down, key, onMouse } }, mouse: { x, y, buttons }, held, hand,
 * taps, password, paused, keys }` (`key`: the `{ row, col }` the hand pressed last, or null; `held`: whether each hand holds a
 * key down now). `hand` is the hand that pressed last, `taps` counts presses; the right hand is on the mouse
 * from the mouse's last use until its next key press. `keys` is false where the window cannot read keys, so nothing types.
 */
export function createWorkHands() {
  let lit = [], downAt = { left: -Infinity, right: -Infinity }, last = { left: null, right: null }, hand = null, taps = 0, seq = 0;
  let held = { left: false, right: false }, onMouse = true, buttons = { left: false, right: false, middle: false }, password = false, paused = false, keys = true;
  let slide = { x: 0, y: 0 };
  return {
    feed(msg, now) {
      if (!msg || typeof msg !== 'object') return;
      if (typeof msg.paused === 'boolean') {
        paused = msg.paused;
        if (typeof msg.keys === 'boolean') keys = msg.keys;
        if (paused) { lit = []; held = { left: false, right: false }; buttons = { left: false, right: false, middle: false }; }
        return;
      }
      password = msg.password === true;
      if (msg.held && typeof msg.held === 'object') held = { left: msg.held.left > 0, right: msg.held.right > 0 };
      if (msg.buttons && typeof msg.buttons === 'object') {
        const b = { left: msg.buttons.left === true, right: msg.buttons.right === true, middle: msg.buttons.middle === true };
        if (b.left || b.right || b.middle) onMouse = true;
        buttons = b;
      }
      if (msg.move && Number.isFinite(msg.move.dx) && Number.isFinite(msg.move.dy)) {
        onMouse = true;
        slide = {
          x: Math.max(-MOUSE_MAX, Math.min(MOUSE_MAX, slide.x + msg.move.dx * MOUSE_STEP)),
          y: Math.max(-MOUSE_MAX, Math.min(MOUSE_MAX, slide.y + msg.move.dy * MOUSE_STEP)),
        };
      }
      if (password) { lit = []; return; }
      for (const p of Array.isArray(msg.presses) ? msg.presses : []) {
        if ((p?.hand !== 'left' && p?.hand !== 'right') || !Number.isInteger(p.row)) continue;
        const row = Math.max(0, Math.min(KEY_ROWS - 1, p.row));
        // a key of the zone, spread over it in turn: the window never says which one it was
        seq = (seq + 1) % 997;
        const col = (seq * 5 + row * 3) % KEYS_PER_HAND;
        lit.push({ hand: p.hand, row, col, until: now + KEY_LIT_MS });
        downAt[p.hand] = now;
        last[p.hand] = { row, col };
        hand = p.hand;
        taps++;
        if (p.hand === 'right') onMouse = false;
      }
      if (lit.length > LIT_MAX) lit = lit.slice(-LIT_MAX);
    },
    step(dt) {
      const k = Math.exp(-MOUSE_RETURN * Math.max(0, dt));
      slide = { x: slide.x * k, y: slide.y * k };
    },
    view(now) {
      lit = lit.filter((l) => l.until > now);
      const pressed = (h) => now - downAt[h] < PAW_DOWN_MS;
      return {
        lit: lit.map(({ hand: h, row, col }) => ({ hand: h, row, col })),
        hands: {
          left: { down: pressed('left') || held.left, key: last.left },
          right: { down: onMouse ? buttons.left || buttons.right || buttons.middle : pressed('right') || held.right, key: last.right, onMouse },
        },
        mouse: { x: slide.x, y: slide.y, buttons: { ...buttons } },
        held: { ...held }, hand, taps, password, paused, keys,
      };
    },
  };
}
