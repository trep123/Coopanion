/**
 * The keyboard work mode draws and names its keys by: a standard ANSI 60% layout, five rows fifteen units wide, row 0 the
 * number row at the back. The window process (host/work-input.cjs) names each key it reads by an id from here (the
 * names of `KeyboardEvent.code`); the page lights that key on its desk (web/work-desk.js) and hands its place to the body
 * (`frame.work.keys`, the kit's `workKeyLayout`). Keys with no place here (Esc, the function row, arrows, the editing
 * block, the number pad) come through as their hand and row only.
 *
 * Each key: `{ id, label, row, hand, x, y, w, h, cx, cy }`, with `x`, `y`, `w`, `h` its box and `cx`, `cy` its middle,
 * all 0..1 over the keyboard (x to the right, y from the back row to the front one). `hand` is the hand that types it by
 * the usual touch-typing split (6, Y, H and N go to the right hand); the space bar has `hand: null`, for the thumb of
 * whichever hand is nearer. Nothing here touches the page.
 */

/** The keyboard's width in key units and its rows. */
export const WORK_KEY_UNITS = 15, WORK_KEY_ROWS = 5;

/** Rows of `[id, label, width in units, hand]`; hand 'l', 'r' or '' (the space bar). */
const ROWS = [
  [['Backquote', '`', 1, 'l'], ['Digit1', '1', 1, 'l'], ['Digit2', '2', 1, 'l'], ['Digit3', '3', 1, 'l'], ['Digit4', '4', 1, 'l'], ['Digit5', '5', 1, 'l'],
    ['Digit6', '6', 1, 'r'], ['Digit7', '7', 1, 'r'], ['Digit8', '8', 1, 'r'], ['Digit9', '9', 1, 'r'], ['Digit0', '0', 1, 'r'], ['Minus', '-', 1, 'r'], ['Equal', '=', 1, 'r'], ['Backspace', '', 2, 'r']],
  [['Tab', '', 1.5, 'l'], ['KeyQ', 'Q', 1, 'l'], ['KeyW', 'W', 1, 'l'], ['KeyE', 'E', 1, 'l'], ['KeyR', 'R', 1, 'l'], ['KeyT', 'T', 1, 'l'],
    ['KeyY', 'Y', 1, 'r'], ['KeyU', 'U', 1, 'r'], ['KeyI', 'I', 1, 'r'], ['KeyO', 'O', 1, 'r'], ['KeyP', 'P', 1, 'r'], ['BracketLeft', '[', 1, 'r'], ['BracketRight', ']', 1, 'r'], ['Backslash', '\\', 1.5, 'r']],
  [['CapsLock', '', 1.75, 'l'], ['KeyA', 'A', 1, 'l'], ['KeyS', 'S', 1, 'l'], ['KeyD', 'D', 1, 'l'], ['KeyF', 'F', 1, 'l'], ['KeyG', 'G', 1, 'l'],
    ['KeyH', 'H', 1, 'r'], ['KeyJ', 'J', 1, 'r'], ['KeyK', 'K', 1, 'r'], ['KeyL', 'L', 1, 'r'], ['Semicolon', ';', 1, 'r'], ['Quote', "'", 1, 'r'], ['Enter', '', 2.25, 'r']],
  [['ShiftLeft', '', 2.25, 'l'], ['KeyZ', 'Z', 1, 'l'], ['KeyX', 'X', 1, 'l'], ['KeyC', 'C', 1, 'l'], ['KeyV', 'V', 1, 'l'], ['KeyB', 'B', 1, 'l'],
    ['KeyN', 'N', 1, 'r'], ['KeyM', 'M', 1, 'r'], ['Comma', ',', 1, 'r'], ['Period', '.', 1, 'r'], ['Slash', '/', 1, 'r'], ['ShiftRight', '', 2.75, 'r']],
  [['ControlLeft', '', 1.25, 'l'], ['MetaLeft', '', 1.25, 'l'], ['AltLeft', '', 1.25, 'l'], ['Space', '', 6.25, ''],
    ['AltRight', '', 1.25, 'r'], ['MetaRight', '', 1.25, 'r'], ['ContextMenu', '', 1.25, 'r'], ['ControlRight', '', 1.25, 'r']],
];

const r4 = (n) => Math.round(n * 1e4) / 1e4;

/** Every key of the layout, row by row, left to right. */
export const WORK_KEYS = Object.freeze(ROWS.flatMap((row, r) => {
  let u = 0;
  return row.map(([id, label, w, hand]) => {
    const x = u / WORK_KEY_UNITS;
    u += w;
    return Object.freeze({
      id, label, row: r, hand: hand === 'l' ? 'left' : hand === 'r' ? 'right' : null,
      x: r4(x), y: r4(r / WORK_KEY_ROWS), w: r4(w / WORK_KEY_UNITS), h: r4(1 / WORK_KEY_ROWS),
      cx: r4(x + w / WORK_KEY_UNITS / 2), cy: r4((r + .5) / WORK_KEY_ROWS),
    });
  });
}));

/** The keys by id. */
export const WORK_KEY_BY_ID = new Map(WORK_KEYS.map((k) => [k.id, k]));

/** The key named `id`, or null. */
export function workKey(id) {
  return (typeof id === 'string' && WORK_KEY_BY_ID.get(id)) || null;
}

/**
 * The keys a hand's coarse zone covers (host/work-input.cjs `KEY_ZONES`: row 0 the number row, 3 the bottom rows), for
 * lighting a key in it when the window does not say which one: that hand's keys of that row; for row 3, of the two
 * bottom rows (the space bar counted with the left hand).
 */
export function workZoneKeys(hand, row) {
  const rows = row >= 3 ? [3, 4] : [Math.max(0, row)];
  return WORK_KEYS.filter((k) => rows.includes(k.row) && (k.hand === hand || (k.hand === null && hand === 'left')));
}
