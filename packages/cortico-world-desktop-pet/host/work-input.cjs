/**
 * What the pet's work mode reads of the keyboard and the mouse, for its hands to follow (web/work-mode.js).
 *
 * What leaves this file: for each key that went down, the hand that types it and its row (`KEY_ZONES`); how many keys
 * each hand holds; which mouse buttons are down; the direction the cursor moved. With `showKeys` on (config
 * `window.workShowKeys`, which the page passes in `petHost.watchWork`), also which key it was and the keys held now, by
 * their place on a standard keyboard (`KEY_IDS`, the ids of web/kit/work-keys.js), so the page can light that key and
 * reach for it. These go to the pet page only (`pet:work`): never to the World, a log, the model or telemetry, and no
 * text is ever put together from them here. While the focused control is a password box (`password`), no key reaches the
 * page at all, neither its zone nor its id.
 *
 * - Windows: the keys and the buttons are polled with `GetAsyncKeyState` (no hook, no DLL injected into other
 *   processes), each time `poll` is called, which the window process does only while work mode is on, the window is
 *   shown and no fullscreen window covers its display. Its low bit (pressed since the last call) is shared by every
 *   caller, so it only adds taps that came and went between two polls. Mouse buttons read as the physical ones, before
 *   a left-handed swap. A password box is a classic `Edit` control with `ES_PASSWORD` that has the keyboard focus
 *   (`GetGUIThreadInfo`); one drawn by a browser or a UWP app is not recognized.
 * - macOS and Linux: no keys and no buttons (`available.keys` false); the cursor's movement alone moves the mouse.
 *
 * `koffi` may be a fake (tests/work-input.test.ts): the calls are bound by their signatures below and nothing else of
 * koffi is used.
 */

/** Milliseconds a tracker holds key presses and cursor moves before the next message, at the least. */
const SEND_EVERY_MS = 16;
/** Most key presses one message carries; more between two messages are dropped. */
const PRESSES_MAX = 8;
/** Cursor pixels between two messages that count as a full step of the mouse (`move` of ±1). */
const MOVE_FULL_PX = 24;
/** Milliseconds between two checks of the focused control for a password box. */
const PASSWORD_EVERY_MS = 250;

/**
 * Windows virtual-key codes by the hand that types them on a QWERTY keyboard and their row (0 the number and function
 * rows, 1 the top letter row, 2 the home row, 3 the bottom row with the space bar and the modifiers). The space bar
 * goes to the left hand: the right one is often on the mouse. Arrows, the editing block and the number pad go to the
 * right hand. The generic Shift, Ctrl and Alt codes repeat their left and right ones and are left out.
 */
const KEY_ZONES = new Map([
  // left hand
  ...[0x1b, 0xc0, 0x31, 0x32, 0x33, 0x34, 0x35, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75].map((vk) => [vk, { hand: 'left', row: 0 }]),
  ...[0x09, 0x51, 0x57, 0x45, 0x52, 0x54].map((vk) => [vk, { hand: 'left', row: 1 }]),
  ...[0x14, 0x41, 0x53, 0x44, 0x46, 0x47].map((vk) => [vk, { hand: 'left', row: 2 }]),
  ...[0xa0, 0x5a, 0x58, 0x43, 0x56, 0x42, 0xa2, 0x5b, 0xa4, 0x20].map((vk) => [vk, { hand: 'left', row: 3 }]),
  // right hand
  ...[0x36, 0x37, 0x38, 0x39, 0x30, 0xbd, 0xbb, 0x08, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x2d, 0x2e, 0x24, 0x23, 0x21, 0x22].map((vk) => [vk, { hand: 'right', row: 0 }]),
  ...[0x59, 0x55, 0x49, 0x4f, 0x50, 0xdb, 0xdd, 0xdc, 0x67, 0x68, 0x69, 0x6d].map((vk) => [vk, { hand: 'right', row: 1 }]),
  ...[0x48, 0x4a, 0x4b, 0x4c, 0xba, 0xde, 0x0d, 0x64, 0x65, 0x66, 0x6b].map((vk) => [vk, { hand: 'right', row: 2 }]),
  ...[0x4e, 0x4d, 0xbc, 0xbe, 0xbf, 0xa1, 0xa3, 0xa5, 0x5c, 0x5d, 0x25, 0x26, 0x27, 0x28, 0x60, 0x61, 0x62, 0x63, 0x6e, 0x6a, 0x6f, 0x90].map((vk) => [vk, { hand: 'right', row: 3 }]),
]);
/**
 * Windows virtual-key codes by the id of their key on the page's keyboard (web/kit/work-keys.js, the names of
 * `KeyboardEvent.code`). Keys the page's 60% keyboard does not have (Esc, the function row, arrows, the editing block,
 * the number pad) have none and come through as their zone only. The number pad's Enter reads as Enter.
 */
const KEY_IDS = new Map([
  [0xc0, 'Backquote'], ...[...'1234567890'].map((d) => [d.charCodeAt(0), `Digit${d}`]), [0xbd, 'Minus'], [0xbb, 'Equal'], [0x08, 'Backspace'],
  [0x09, 'Tab'], ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => [c.charCodeAt(0), `Key${c}`]), [0xdb, 'BracketLeft'], [0xdd, 'BracketRight'], [0xdc, 'Backslash'],
  [0x14, 'CapsLock'], [0xba, 'Semicolon'], [0xde, 'Quote'], [0x0d, 'Enter'],
  [0xa0, 'ShiftLeft'], [0xbc, 'Comma'], [0xbe, 'Period'], [0xbf, 'Slash'], [0xa1, 'ShiftRight'],
  [0xa2, 'ControlLeft'], [0x5b, 'MetaLeft'], [0xa4, 'AltLeft'], [0x20, 'Space'], [0xa5, 'AltRight'], [0x5c, 'MetaRight'], [0x5d, 'ContextMenu'], [0xa3, 'ControlRight'],
]);
const VK_LBUTTON = 0x01, VK_RBUTTON = 0x02, VK_MBUTTON = 0x04;

/** The zone of virtual-key `vk`, `{ hand, row }`, or null for a key work mode does not show. */
function zoneOf(vk) {
  return KEY_ZONES.get(vk) ?? null;
}

/** The id of virtual-key `vk`'s key on the page's keyboard, or null for a key it does not draw. */
function keyIdOf(vk) {
  return KEY_IDS.get(vk) ?? null;
}

const clamp1 = (v) => Math.max(-1, Math.min(1, v));

/**
 * Turns readings into the messages the page gets: `update(reading, now)` takes `{ keys, buttons, cursor, password }`
 * (`keys` the virtual-key codes down or tapped since the last reading, `buttons` `{ left, right, middle }`, `cursor`
 * `{ x, y }` in screen pixels or null, `password` whether the focus is a password box) and returns a message when
 * something changed and SEND_EVERY_MS have passed since the last one, else null:
 * `{ held: { left, right }, presses: [{ hand, row, id? }], buttons, move: { dx, dy } | null, password, down? }`.
 * `presses` are the keys that went down since the last message, oldest first; `held` counts the keys down now per hand.
 * With `showKeys` (`setShowKeys`), a press of a key the page draws carries its `id` (KEY_IDS) and `down` lists the ids
 * held now; without it neither comes. During a password box `held` is zero, `presses` empty and no `down` comes.
 */
function createWorkTracker({ showKeys = false } = {}) {
  let ids = !!showKeys;
  // the first reading after a start or a reset only learns what is down: the low bit of GetAsyncKeyState may carry a
  // press from long before
  let primed = false, down = new Set(), presses = [], sentAt = -Infinity, last = '', moved = { x: 0, y: 0 }, at = null;
  let state = { held: { left: 0, right: 0 }, buttons: { left: false, right: false, middle: false }, password: false };
  return {
    update({ keys = [], buttons = {}, cursor = null, password = false }, now) {
      const next = new Set();
      const held = { left: 0, right: 0 };
      for (const vk of keys) {
        const zone = zoneOf(vk);
        if (!zone) continue;
        next.add(vk);
        held[zone.hand]++;
        if (primed && !down.has(vk) && !password && presses.length < PRESSES_MAX) {
          const id = ids ? keyIdOf(vk) : null;
          presses.push(id ? { ...zone, id } : { ...zone });
        }
      }
      down = next;
      primed = true;
      if (cursor && at) { moved.x += cursor.x - at.x; moved.y += cursor.y - at.y; }
      at = cursor;
      state = {
        held: password ? { left: 0, right: 0 } : held,
        buttons: { left: !!buttons.left, right: !!buttons.right, middle: !!buttons.middle },
        password: !!password,
      };
      if (ids && !password) state.down = [...next].map(keyIdOf).filter(Boolean);
      if (now - sentAt < SEND_EVERY_MS) return null;
      const move = Math.hypot(moved.x, moved.y) >= 1 ? { dx: clamp1(moved.x / MOVE_FULL_PX), dy: clamp1(moved.y / MOVE_FULL_PX) } : null;
      const key = JSON.stringify(state);
      if (!presses.length && !move && key === last) return null;
      const msg = { ...state, presses, move };
      presses = []; moved = { x: 0, y: 0 }; last = key; sentAt = now;
      return msg;
    },
    /** Whether presses carry their key's id and messages the ids held (config `window.workShowKeys`). */
    setShowKeys(on) { ids = !!on; if (!ids) presses = presses.map(({ hand, row }) => ({ hand, row })); },
    /** Forgets what was down and where the cursor was, as after a pause: the next reading starts afresh. */
    reset() { primed = false; down = new Set(); presses = []; moved = { x: 0, y: 0 }; at = null; last = ''; sentAt = -Infinity; },
  };
}

/** Windows: `{ keys(), buttons(), password() }` bound from user32 through `koffi`. */
function openWin32Input(koffi) {
  const user32 = koffi.load('user32.dll');
  const GetAsyncKeyState = user32.func('int16_t __stdcall GetAsyncKeyState(int vk)');
  const GetGUIThreadInfo = user32.func('int __stdcall GetGUIThreadInfo(uint32_t thread, void *info)');
  const GetClassNameW = user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *buf, int max)');
  const GetWindowLongW = user32.func('int32_t __stdcall GetWindowLongW(intptr_t hwnd, int index)');
  const GWL_STYLE = -16, ES_PASSWORD = 0x0020;
  // GUITHREADINFO: cbSize and flags, six window handles, the caret's RECT; hwndFocus is the second handle
  const PTR = process.arch === 'ia32' || process.arch === 'arm' ? 4 : 8;
  const INFO_BYTES = 8 + 6 * PTR + 16, FOCUS_AT = 8 + PTR;
  const vks = [...KEY_ZONES.keys()];
  const isDown = (vk) => (GetAsyncKeyState(vk) & 0x8001) !== 0;
  return {
    keys: () => vks.filter(isDown),
    buttons: () => ({ left: isDown(VK_LBUTTON), right: isDown(VK_RBUTTON), middle: isDown(VK_MBUTTON) }),
    password() {
      const info = Buffer.alloc(INFO_BYTES);
      info.writeUInt32LE(INFO_BYTES, 0);
      if (!GetGUIThreadInfo(0, info)) return false;
      const focus = PTR === 8 ? info.readBigInt64LE(FOCUS_AT) : BigInt(info.readInt32LE(FOCUS_AT));
      if (focus === 0n) return false;
      const name = Buffer.alloc(128);
      const n = GetClassNameW(focus, name, 64);
      if (n <= 0 || !/^(Edit|RichEdit\w*)$/i.test(name.toString('utf16le', 0, n * 2))) return false;
      return (GetWindowLongW(focus, GWL_STYLE) & ES_PASSWORD) !== 0;
    },
  };
}

/**
 * The work mode's input: `poll(now)` reads the keyboard, the mouse buttons and `cursor()` (screen pixels, or null) and
 * returns the tracker's message or null; `showKeys` (and `setShowKeys`) names the keys in it, see createWorkTracker. `available.keys` is whether keys and buttons are read here (Windows with koffi);
 * where they are not, `poll` still reports the cursor's movement. `reset()` after a pause.
 */
function createWorkInput({ cursor = () => null, platform = process.platform, loadKoffi = () => require('koffi'), showKeys = false } = {}) {
  let input = null;
  if (platform === 'win32') {
    try { input = openWin32Input(loadKoffi()); } catch { input = null; }
  }
  const tracker = createWorkTracker({ showKeys });
  let passwordAt = -Infinity, password = false;
  return {
    available: { keys: !!input },
    poll(now) {
      let keys = [], buttons = {};
      if (input) {
        try {
          if (now - passwordAt >= PASSWORD_EVERY_MS) { passwordAt = now; password = input.password(); }
          keys = input.keys();
          buttons = input.buttons();
        } catch { keys = []; buttons = {}; }
      }
      return tracker.update({ keys, buttons, cursor: cursor(), password }, now);
    },
    reset() { tracker.reset(); passwordAt = -Infinity; password = false; },
    /** Config `window.workShowKeys`: whether the messages name the keys (createWorkTracker). */
    setShowKeys(on) { tracker.setShowKeys(on); },
  };
}

module.exports = { KEY_ZONES, KEY_IDS, zoneOf, keyIdOf, createWorkTracker, createWorkInput, openWin32Input, SEND_EVERY_MS, PRESSES_MAX, MOVE_FULL_PX };
