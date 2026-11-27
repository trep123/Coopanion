/**
 * Work mode's props, drawn by the pet page for every figure pack: a chair behind the body, and in front of it a desk
 * with a keyboard and a mouse on it, seen from the front, plus two paws that do the typing for a body whose pack does not
 * draw its own hands (manifest `can.work`). Keys light up as they are pressed (by zone: the window never says which key),
 * the mouse's buttons as they are held, and the mouse slides after the cursor.
 *
 * Everything is in the body's logo units (web/kit/body.js: the body's middle at x=128, the floor at y=256, screen right
 * to +x) and placed over the body each frame (`place`). The props come out and are packed away through `showHide`
 * (`.entering`, `.leaving` in pet.css, timed by `--work-in` and `--work-out`), which follows the motion levels.
 */
import { showHide } from './show-hide.js';
import { KEY_ROWS, KEYS_PER_HAND } from './work-state.js';

/**
 * The desk in logo units: its top runs from `top` (back edge) to `front`; the keyboard spans `keys` on it, the mouse rests
 * at `mouse`, and a hand resting on either is at `rest.left`, `rest.right` and `mouse` ([x, y]). `reach` is how far the
 * props reach left and right of the body's middle, for keeping them on the stage.
 */
export const DESK = {
  top: 176, front: 212, x0: -40, x1: 296,
  keys: { x0: 68, x1: 188, y0: 180, y1: 207 },
  mouse: [226, 196],
  rest: { left: [100, 207], right: [156, 207] },
  reach: 172,
};
/** The SVG's window onto logo space: [x, y, w, h]. */
const VIEW = [-56, 60, 368, 206];
const SVGNS = 'http://www.w3.org/2000/svg';
const f = (n) => Math.round(n * 10) / 10;

/** The chair's back at its widest and tallest: posts at `x0` and `x1`, their knobs' middles at `top` (logo units). */
const CHAIR_MAX = { x0: 44, x1: 212, top: 108 };
/**
 * Where the chair's two posts stand for a body whose box is `box` (`{ x0, x1, y0 }` in logo units, facing right; null
 * for none): `{ x0, x1, top }`. The posts keep inside the body's sides, so they stay behind it and never stick up beside
 * a body narrower than the chair; their knobs keep below the body's top and inside the stage (`minY`, the stage's top in
 * logo units). A body as wide as the whole chair keeps it as drawn.
 */
export function chairFit(box, minY = -Infinity) {
  const inset = 12;
  let x0 = CHAIR_MAX.x0, x1 = CHAIR_MAX.x1, top = CHAIR_MAX.top;
  if (box && Number.isFinite(box.x0) && Number.isFinite(box.x1)) {
    x0 = Math.min(Math.max(x0, box.x0 + inset), 128 - inset);
    x1 = Math.max(Math.min(x1, box.x1 - inset), 128 + inset);
  }
  if (box && Number.isFinite(box.y0)) top = Math.max(top, box.y0 + 24);
  top = Math.min(Math.max(top, minY + 10), 160);
  return { x0, x1, top };
}
/** The chair behind the body: two posts with knobs, and a back mostly hidden behind the body and the desk. */
const CHAIR = `<g class="w-part w-chair" style="--i:0">
  <rect class="w-wood w-seat" x="44" y="166" width="168" height="40" rx="10"/>
  <path class="w-post" d="M44 112V250M212 112V250"/>
  <circle class="w-knob" cx="44" cy="108" r="9"/><circle class="w-knob" cx="212" cy="108" r="9"/>
</g>`;

/**
 * Key `col` of `hand`'s half in keyboard row `row` (0 the back row): `{ x, y, w, h }`, its top left corner and size. The
 * keyboard is a tray narrower at the back, KEY_ROWS rows of keys, each hand's half KEYS_PER_HAND keys wide.
 */
function keyRect(hand, row, col) {
  const k = DESK.keys, rowH = (k.y1 - k.y0 - 4) / KEY_ROWS;
  const back = 1 - (KEY_ROWS - row) / (KEY_ROWS * 6);
  const half = (k.x1 - k.x0 - 6) / 2 * back, mid = (k.x0 + k.x1) / 2, w = half / KEYS_PER_HAND;
  const c = (hand === 'right' ? KEYS_PER_HAND : 0) + col;
  return { x: mid - half + c * w + (hand === 'right' ? 1.5 : -1.5), y: k.y0 + 2 + row * rowH, w, h: rowH };
}

/**
 * The desk in two layers: `top`, its top as a band seen a little from above with the keyboard and the mouse on it; `front`,
 * its front edge, its front panel and its legs.
 */
function deskMarkup() {
  const { top, front, x0, x1, keys: k } = DESK;
  const inset = 14;
  const rows = [];
  for (let r = 0; r < KEY_ROWS; r++) {
    for (const hand of ['left', 'right']) {
      for (let col = 0; col < KEYS_PER_HAND; col++) {
        const { x, y, w, h } = keyRect(hand, r, col);
        rows.push(`<rect class="w-key" data-k="${hand}-${r}-${col}" x="${f(x + .6)}" y="${f(y + .5)}" width="${f(w - 1.2)}" height="${f(h - 1)}" rx="1"/>`);
      }
    }
  }
  return { top: `<g class="w-part w-desk" style="--i:1">
  <path class="w-wood" d="M${x0 + inset} ${top}H${x1 - inset}L${x1} ${front}H${x0}Z"/>
</g>
<g class="w-part w-keyboard" style="--i:2">
  <path class="w-device" d="M${k.x0 + 5} ${k.y0}H${k.x1 - 5}L${k.x1} ${k.y1}H${k.x0}Z"/>
  ${rows.join('')}
</g>
<g class="w-part w-mouse" style="--i:3"><g class="w-mouse-body">
  <path class="w-device" d="M${DESK.mouse[0] - 9} ${DESK.mouse[1] - 4}a9 10 0 0 1 18 0v6a9 9 0 0 1-18 0z"/>
  <path class="w-button" data-b="left" d="M${DESK.mouse[0] - 8} ${DESK.mouse[1] - 4}a8 9 0 0 1 7.5-8.9V${DESK.mouse[1] - 1}H${DESK.mouse[0] - 8}z"/>
  <path class="w-button" data-b="right" d="M${DESK.mouse[0] + 8} ${DESK.mouse[1] - 4}a8 9 0 0 0-7.5-8.9V${DESK.mouse[1] - 1}H${DESK.mouse[0] + 8}z"/>
  <rect class="w-button" data-b="middle" x="${DESK.mouse[0] - 1.3}" y="${DESK.mouse[1] - 11}" width="2.6" height="6" rx="1.3"/>
</g></g>`, front: `<g class="w-part w-desk" style="--i:1">
  <rect class="w-wood w-edge" x="${x0}" y="${front}" width="${x1 - x0}" height="9" rx="3"/>
  <rect class="w-panel" x="${x0 + 12}" y="${front + 9}" width="${x1 - x0 - 24}" height="28"/>
  <path class="w-post" d="M${x0 + 10} ${front + 9}V254M${x1 - 10} ${front + 9}V254"/>
</g>` };
}

/** The two paws, each a round pad with two creases; `.down` presses one onto what it rests on. */
const PAWS = `<g class="w-part w-paws" style="--i:4">
  <g class="w-paw" data-hand="left"><ellipse rx="9.5" ry="6.5"/><path d="M-3 -1.5v3M3 -1.5v3"/></g>
  <g class="w-paw" data-hand="right"><ellipse rx="9.5" ry="6.5"/><path d="M-3 -1.5v3M3 -1.5v3"/></g>
</g>`;

function layer(doc, cls, inner) {
  const el = doc.createElement('div');
  el.className = `work ${cls}`;
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', VIEW.join(' '));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = inner;
  el.appendChild(svg);
  return el;
}

/**
 * Builds the props into `stage`, the chair before `figureLayer` (under the body) and the desk after it (over the body);
 * the desk's top, keyboard and mouse go under the body instead while `draw` is told the pack draws its own hands.
 * `enterMs()` is the length of the coming out (0 at low motion). Returns:
 * `show()`, `hide(ms)` (packed away over `ms`, at once when 0), `hidden`, `place(x, floorY, S, body)` (the body's middle and
 * floor in stage pixels, its scale, and its box in stage pixels, which the chair's back keeps inside: `chairFit`), `draw(view, paws)` (a `createWorkHands` view; `paws` false hides the page's paws
 * for a pack that draws its own hands), and `dispose()`.
 */
export function createWorkDesk(stage, figureLayer, { enterMs = () => 0 } = {}) {
  const doc = stage.ownerDocument;
  const markup = deskMarkup();
  const back = layer(doc, 'work-back', CHAIR);
  const top = layer(doc, 'work-top', markup.top);
  const front = layer(doc, 'work-front', markup.front + PAWS);
  stage.insertBefore(back, figureLayer);
  figureLayer.after(top, front);
  /** Whether the desk's top is under the body: for a pack that draws its own hands on it (`draw`'s `ownPaws`). */
  let topUnder = false;
  const shows = [back, top, front].map((el) => showHide(el, { enterMs }));
  const keys = new Map([...top.querySelectorAll('.w-key')].map((el) => [el.dataset.k, el]));
  const buttons = Object.fromEntries([...top.querySelectorAll('.w-button')].map((el) => [el.dataset.b, el]));
  const mouseBody = top.querySelector('.w-mouse-body');
  const paws = front.querySelector('.w-paws');
  const paw = Object.fromEntries([...front.querySelectorAll('.w-paw')].map((el) => [el.dataset.hand, el]));
  const chair = { seat: back.querySelector('.w-seat'), post: back.querySelector('.w-post'), knobs: [...back.querySelectorAll('.w-knob')] };
  let placed = '', chairAt = '', drawn = { lit: new Set(), buttons: '', mouse: '', paws: null };
  /** Fits the chair's back to the body (`chairFit`). */
  function fitChair(c) {
    const key = `${f(c.x0)},${f(c.x1)},${f(c.top)}`;
    if (key === chairAt) return;
    chairAt = key;
    chair.seat.setAttribute('x', f(c.x0)); chair.seat.setAttribute('width', f(c.x1 - c.x0));
    chair.post.setAttribute('d', `M${f(c.x0)} ${f(c.top + 4)}V250M${f(c.x1)} ${f(c.top + 4)}V250`);
    chair.knobs.forEach((k, i) => { k.setAttribute('cx', f(i ? c.x1 : c.x0)); k.setAttribute('cy', f(c.top)); });
  }
  return {
    get hidden() { return shows[0].hidden; },
    show() { for (const s of shows) s.show(); },
    hide(ms) { for (const s of shows) s.hide(ms, ms <= 0); },
    place(x, floorY, S, body) {
      // the body's box (stage pixels) in logo units, for the chair's back
      if (S > 0) fitChair(chairFit(body ? { x0: 128 + (body.x - x) / S, x1: 128 + (body.x + body.w - x) / S, y0: 256 + (body.y - floorY) / S } : null, 256 - floorY / S));
      const at = `${f(x)},${f(floorY)},${S.toFixed(4)}`;
      if (at === placed) return;
      placed = at;
      const box = { left: `${f(x + (VIEW[0] - 128) * S)}px`, top: `${f(floorY + (VIEW[1] - 256) * S)}px`, width: `${f(VIEW[2] * S)}px`, height: `${f(VIEW[3] * S)}px` };
      for (const el of [back, top, front]) Object.assign(el.style, box);
    },
    draw(view, ownPaws) {
      // a pack that draws its own hands gets the desk's top under its body, the front still over it: the body hides
      // what of itself is below the desk's back edge, and its hands lie on the keyboard and the mouse
      if (!!ownPaws !== topUnder) { topUnder = !!ownPaws; if (topUnder) figureLayer.before(top); else figureLayer.after(top); }
      const lit = new Set(view.lit.map((l) => `${l.hand}-${l.row}-${l.col}`));
      for (const k of drawn.lit) if (!lit.has(k)) keys.get(k)?.classList.remove('lit');
      for (const k of lit) if (!drawn.lit.has(k)) keys.get(k)?.classList.add('lit');
      drawn.lit = lit;
      const b = view.mouse.buttons, bk = `${b.left}${b.right}${b.middle}`;
      if (bk !== drawn.buttons) { for (const id of ['left', 'right', 'middle']) buttons[id].classList.toggle('lit', b[id]); drawn.buttons = bk; }
      const mk = `${f(view.mouse.x)},${f(view.mouse.y * .5)}`;
      if (mk !== drawn.mouse) { mouseBody.setAttribute('transform', `translate(${mk})`); drawn.mouse = mk; }
      // the page's paws: each rests at the keyboard's near edge and reaches up to just below the key it pressed while it is down;
      // the right one rests on the mouse's near end from the mouse's last use
      const h = view.hands;
      const spot = (hand) => {
        const k = h[hand].key;
        if (!h[hand].down || !k) return DESK.rest[hand];
        const r = keyRect(hand, k.row, k.col);
        // just below the key, which stays in sight lit
        return [r.x + r.w / 2, r.y + r.h + 4];
      };
      const left = spot('left'), right = h.right.onMouse ? [DESK.mouse[0] + view.mouse.x, DESK.mouse[1] + 6 + view.mouse.y * .5] : spot('right');
      const pk = ownPaws ? '' : `${h.left.down}|${h.right.down}|${left.map(f)}|${right.map(f)}`;
      if (pk !== drawn.paws) {
        paws.style.display = ownPaws ? 'none' : '';
        if (!ownPaws) {
          const at = (el, p, down) => { el.setAttribute('transform', `translate(${f(p[0])} ${f(p[1])}) scale(${down ? 1.05 : 1} ${down ? .8 : 1})`); el.classList.toggle('down', down); };
          at(paw.left, left, h.left.down);
          at(paw.right, right, h.right.down);
        }
        drawn.paws = pk;
      }
    },
    dispose() { back.remove(); top.remove(); front.remove(); },
  };
}
