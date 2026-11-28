/**
 * Work mode's two pure parts, for the pet page (pet-app.js) and its tests: the phases the pet goes through as work mode
 * starts and ends (`createWorkMachine`), and the hands, keys and mouse drawn from the window's input messages
 * (`createWorkHands`, host/work-input.cjs). Nothing here touches the page.
 *
 * Phases: `off`; `ground` (work mode was turned on while the body stood on a ledge, a window's or an icon's top: the body
 * is asked to come down to the floor first, `work: { phase: 'prepare' }`, and the props wait for it, at most
 * WORK_GROUND_MAX; a body that does not come down by then gets its props where its feet are); `walk` (work mode was turned on with the body too near an edge for the desk: it walks to `target`
 * first); `enter` (the desk, chair, keyboard and mouse come out around the standing body, for `enterMs`); `on` (the
 * body sits at the desk); `away` (the body was picked up or thrown: the props are packed away and come out again where it
 * lands); `leave` (work mode was turned off: the props are packed away for `leaveMs` while the body stands up).
 */

import { workKey, workZoneKeys } from './kit/work-keys.js';

/** Seconds a walk to the desk's spot may take before the desk comes out where the body is. */
export const WORK_WALK_MAX = 6;
/** Body modes in which it is carried or in the air (web/kit/body.js): no desk under it then. */
/** Seconds a body on a ledge may take to come down to the floor before the props come out where it stands. */
export const WORK_GROUND_MAX = 8;
const AWAY_MODES = new Set(['drag', 'air', 'crouch', 'land']);

/**
 * `step(on, body, room, now)` advances the phase and returns `{ phase, changed, target }`: `on` is whether work mode is
 * wanted, `body` the body's layout (`{ x, mode, ledge }`, or null with no body), `room` `{ minX, maxX }` the stage x the
 * body's middle must stand within for the props to fit, `now` in seconds. `target` is the x to walk to in `walk`.
 * `enterMs` and `leaveMs` are read on each step (0 at low motion).
 */
export function createWorkMachine({ enterMs = () => 0, leaveMs = () => 0 } = {}) {
  let phase = 'off', since = 0, target = null;
  const go = (p, now) => { phase = p; since = now; };
  /** When the body first stood on a ledge since work mode was turned on (null: it has not). */
  let groundSince = null;
  /**
   * The phase after `off` or `away`: down from a ledge first (`ground`), then walk first when the body stands where the
   * props do not fit. A body still on a ledge after WORK_GROUND_MAX (counted from when it was first asked) stays there.
   */
  const start = (body, room, now) => {
    if (body.ledge) {
      if (groundSince == null) groundSince = now;
      if (now - groundSince < WORK_GROUND_MAX) { target = null; go('ground', now); return; }
    }
    groundSince = null;
    const x = Math.min(room.maxX, Math.max(room.minX, body.x));
    if (Math.abs(x - body.x) > 2 && room.minX <= room.maxX) { target = x; go('walk', now); } else { target = null; go('enter', now); }
  };
  return {
    get phase() { return phase; },
    step(on, body, room, now) {
      const was = phase;
      const away = !body || AWAY_MODES.has(body.mode);
      if (!on) {
        groundSince = null;
        if (phase === 'enter' || phase === 'on') go('leave', now);
        else if (phase === 'walk' || phase === 'away' || phase === 'ground') go('off', now);
        else if (phase === 'leave' && (now - since) * 1000 >= leaveMs()) go('off', now);
      } else if (phase === 'off' || phase === 'leave') {
        if (!away) start(body, room, now);
      } else if (away && phase !== 'away') {
        go('away', now);
      } else if (phase === 'away') {
        if (!away) start(body, room, now);
      } else if (phase === 'ground') {
        if (!body.ledge || now - groundSince >= WORK_GROUND_MAX) start(body, room, now);
      } else if (phase === 'walk') {
        if (Math.abs(body.x - target) <= 3 || now - since >= WORK_WALK_MAX) go('enter', now);
      } else if (phase === 'enter' && (now - since) * 1000 >= enterMs()) {
        go('on', now);
      }
      return { phase, changed: phase !== was, target };
    },
  };
}

/**
 * Milliseconds a key stays lit after a press whose key the window does not name, a key the window names stays lit for
 * after its release (fading out), and a hand stays down on a key at the least (it stays while the key is held).
 */
export const KEY_LIT_MS = 220, KEY_FADE_MS = 120, PAW_DOWN_MS = 90;
/** Keyboard rows the coarse zones count (host/work-input.cjs `KEY_ZONES`), and keys a row for each hand, as before. */
export const KEY_ROWS = 4, KEYS_PER_HAND = 6;
/** Most keys lit at once. */
const LIT_MAX = 12;
/** How far the mouse slides on the desk for a full step of the cursor (`move` ±1), and the most, in logo units. */
const MOUSE_STEP = 3, MOUSE_MAX = 7;
/** Seconds the mouse's slide takes to ease back to its rest, as a rate (1/s). */
const MOUSE_RETURN = 3;
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * The hands and the devices on the desk, from the window's messages: `feed(msg, now)` takes one (host/work-input.cjs:
 * `{ paused, keys }`, or `{ held, presses, buttons, move, password, down? }`), `step(dt)` eases the mouse, and `view(now)`
 * gives what to draw (`now` in milliseconds):
 * `{ lit, pressed, hands: { left: { down, key }, right: { down, key, onMouse } }, mouse: { x, y, buttons }, held, hand,
 * taps, password, paused, keys }`.
 * - `lit`: the keys lit on the page's keyboard, `{ id, k, down, named }` (web/kit/work-keys.js ids; `k` how lit, 1 down to
 *   0 faded; `named` false for a key picked in its press's zone, in turn, when the window does not say which it was).
 * - `pressed`: the named ones only, for the body (`frame.work.keys`): `{ id, x, y, hand, down, k }`, `x`, `y` the key's
 *   middle 0..1 over the keyboard and `hand` the hand that reaches for it (the space bar: the nearer thumb).
 * - `key`: the `{ id, x, y }` a hand pressed last, or null; `held`: whether each hand holds a key down now. `hand` is the
 *   hand that pressed last, `taps` counts presses; the right hand is on the mouse from the mouse's last use until its next
 *   key press. `keys` is false where the window cannot read keys, so nothing types.
 * A named key stays lit while it is held (the message's `down`) and fades over KEY_FADE_MS after its release.
 */
export function createWorkHands() {
  /** Lit keys by id: `{ at, named, hand, up }` (`up`: when it was seen released, or null while held). */
  let lit = new Map();
  let downAt = { left: -Infinity, right: -Infinity }, last = { left: null, right: null }, hand = null, taps = 0, seq = 0;
  let held = { left: false, right: false }, onMouse = true, buttons = { left: false, right: false, middle: false }, password = false, paused = false, keys = true;
  let heldIds = new Set();
  let slide = { x: 0, y: 0 };
  /** The hand that reaches for key `k`: its own, or for the space bar the thumb nearer it (the right one if it typed last and is not on the mouse). */
  const handFor = (k, zoneHand) => k.hand ?? (zoneHand === 'right' && !onMouse ? 'right' : hand === 'right' && !onMouse ? 'right' : 'left');
  const press = (k, named, zoneHand, now) => {
    const h = named ? handFor(k, zoneHand) : zoneHand;
    lit.delete(k.id);
    lit.set(k.id, { at: now, named, hand: h, up: named && !heldIds.has(k.id) ? now : null });
    downAt[h] = now;
    last[h] = { id: k.id, x: k.cx, y: k.cy };
    hand = h;
    taps++;
    if (h === 'right') onMouse = false;
  };
  return {
    feed(msg, now) {
      if (!msg || typeof msg !== 'object') return;
      if (typeof msg.paused === 'boolean') {
        paused = msg.paused;
        if (typeof msg.keys === 'boolean') keys = msg.keys;
        if (paused) { lit = new Map(); heldIds = new Set(); held = { left: false, right: false }; buttons = { left: false, right: false, middle: false }; }
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
      if (password) { lit = new Map(); heldIds = new Set(); return; }
      // the keys held now (named only with window.workShowKeys); one let go starts fading
      heldIds = new Set(Array.isArray(msg.down) ? msg.down.filter((id) => workKey(id)) : []);
      for (const [id, l] of lit) if (l.named && l.up == null && !heldIds.has(id)) l.up = now;
      for (const p of Array.isArray(msg.presses) ? msg.presses : []) {
        if ((p?.hand !== 'left' && p?.hand !== 'right') || !Number.isInteger(p.row)) continue;
        const k = workKey(p.id);
        if (k) { press(k, true, p.hand, now); continue; }
        // a key of the zone, spread over it in turn: the window did not say which one it was
        const zone = workZoneKeys(p.hand, Math.max(0, Math.min(KEY_ROWS - 1, p.row)));
        seq = (seq + 1) % 997;
        if (zone.length) press(zone[(seq * 5 + p.row * 3) % zone.length], false, p.hand, now);
      }
      while (lit.size > LIT_MAX) lit.delete(lit.keys().next().value);
    },
    step(dt) {
      const k = Math.exp(-MOUSE_RETURN * Math.max(0, dt));
      slide = { x: slide.x * k, y: slide.y * k };
    },
    view(now) {
      const shown = [];
      for (const [id, l] of lit) {
        let k = 1;
        if (!l.named) k = now - l.at < KEY_LIT_MS ? 1 : 0;
        else if (l.up != null) k = 1 - (now - Math.max(l.up, l.at + PAW_DOWN_MS)) / KEY_FADE_MS;
        if (k <= 0) { lit.delete(id); continue; }
        shown.push({ id, k: r2(Math.min(1, k)), down: l.named ? l.up == null || now - l.at < PAW_DOWN_MS : now - l.at < PAW_DOWN_MS, named: l.named, hand: l.hand });
      }
      const pressedNow = (h) => now - downAt[h] < PAW_DOWN_MS;
      return {
        lit: shown.map(({ id, k, down, named }) => ({ id, k, down, named })),
        pressed: shown.filter((l) => l.named).map(({ id, k, down, hand: h }) => { const key = workKey(id); return { id, x: key.cx, y: key.cy, hand: h, down, k }; }),
        hands: {
          left: { down: pressedNow('left') || held.left, key: last.left },
          right: { down: onMouse ? buttons.left || buttons.right || buttons.middle : pressedNow('right') || held.right, key: last.right, onMouse },
        },
        mouse: { x: slide.x, y: slide.y, buttons: { ...buttons } },
        held: { ...held }, hand, taps, password, paused, keys,
      };
    },
  };
}
