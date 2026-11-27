import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * Work mode's pure parts: the window process's key zones and input tracker (`host/work-input.cjs`, CommonJS, through
 * this facade, its Win32 calls against a fake koffi bound by signature), and the page's phases and hands
 * (`web/work-state.js`, a browser module loaded by URL).
 */
const require_ = createRequire(import.meta.url);
type Hand = 'left' | 'right';
interface Zone { hand: Hand; row: number }
interface Reading { keys?: number[]; buttons?: { left?: boolean; right?: boolean; middle?: boolean }; cursor?: { x: number; y: number } | null; password?: boolean }
interface Message { held: { left: number; right: number }; presses: Zone[]; buttons: { left: boolean; right: boolean; middle: boolean }; move: { dx: number; dy: number } | null; password: boolean }
const input = require_('../host/work-input.cjs') as {
  KEY_ZONES: Map<number, Zone>;
  zoneOf(vk: number): Zone | null;
  createWorkTracker(): { update(r: Reading, now: number): Message | null; reset(): void };
  createWorkInput(o: { cursor?: () => { x: number; y: number } | null; platform?: string; loadKoffi?: () => unknown }): { available: { keys: boolean }; poll(now: number): Message | null; reset(): void };
  SEND_EVERY_MS: number;
  PRESSES_MAX: number;
  MOVE_FULL_PX: number;
};

interface Phase { phase: string; changed: boolean; target: number | null }
interface Machine { phase: string; step(on: boolean, body: { x: number; mode: string } | null, room: { minX: number; maxX: number }, now: number): Phase }
interface HandsView {
  lit: Array<{ hand: Hand; row: number; col: number }>;
  hands: { left: { down: boolean }; right: { down: boolean; onMouse: boolean } };
  mouse: { x: number; y: number; buttons: { left: boolean; right: boolean; middle: boolean } };
  held: { left: boolean; right: boolean };
  hand: Hand | null; taps: number; password: boolean; paused: boolean; keys: boolean;
}
const state = await import(new URL('../web/work-state.js', import.meta.url).href) as {
  createWorkMachine(o?: { enterMs?: () => number; leaveMs?: () => number }): Machine;
  createWorkHands(): { feed(m: unknown, now: number): void; step(dt: number): void; view(now: number): HandsView };
  WORK_WALK_MAX: number;
  KEY_LIT_MS: number;
  PAW_DOWN_MS: number;
  KEY_ROWS: number;
  KEYS_PER_HAND: number;
};

const VK = { A: 0x41, J: 0x4a, Q: 0x51, P: 0x50, SPACE: 0x20, ENTER: 0x0d, ONE: 0x31, LSHIFT: 0xa0, F13: 0x7c } as const;
const idle = { held: { left: 0, right: 0 }, buttons: { left: false, right: false, middle: false }, password: false };

describe('zoneOf', () => {
  it('puts each key under the hand that types it on a QWERTY keyboard, with its row', () => {
    expect(input.zoneOf(VK.A)).toEqual({ hand: 'left', row: 2 });
    expect(input.zoneOf(VK.Q)).toEqual({ hand: 'left', row: 1 });
    expect(input.zoneOf(VK.ONE)).toEqual({ hand: 'left', row: 0 });
    expect(input.zoneOf(VK.LSHIFT)).toEqual({ hand: 'left', row: 3 });
    expect(input.zoneOf(VK.J)).toEqual({ hand: 'right', row: 2 });
    expect(input.zoneOf(VK.P)).toEqual({ hand: 'right', row: 1 });
    expect(input.zoneOf(VK.ENTER)).toEqual({ hand: 'right', row: 2 });
    expect(input.zoneOf(VK.SPACE)?.hand).toBe('left');
  });

  it('shows no key it has no zone for, the generic modifiers and mouse buttons among them', () => {
    for (const vk of [VK.F13, 0x10, 0x11, 0x12, 0x01, 0x02, 0x04]) expect(input.zoneOf(vk)).toBeNull();
  });

  it('gives every zone a hand and a row the page draws', () => {
    for (const z of input.KEY_ZONES.values()) {
      expect(['left', 'right']).toContain(z.hand);
      expect(z.row).toBeGreaterThanOrEqual(0);
      expect(z.row).toBeLessThan(state.KEY_ROWS);
    }
  });
});

describe('the input tracker', () => {
  it('reports a press when a key goes down, once while it is held, and nothing of which key it was', () => {
    const tr = input.createWorkTracker();
    expect(tr.update({ keys: [] }, 0)).toEqual({ ...idle, presses: [], move: null });
    const down = tr.update({ keys: [VK.A] }, 100)!;
    expect(down.presses).toEqual([{ hand: 'left', row: 2 }]);
    expect(down.held).toEqual({ left: 1, right: 0 });
    expect(JSON.stringify(down)).not.toMatch(/65|0x41|"A"/);
    expect(tr.update({ keys: [VK.A] }, 200)).toBeNull();
    expect(tr.update({ keys: [] }, 300)).toEqual({ ...idle, presses: [], move: null });
  });

  it('takes the first reading only as what is down, so a stale tap bit makes no press', () => {
    const tr = input.createWorkTracker();
    expect(tr.update({ keys: [VK.A, VK.J] }, 0)!.presses).toEqual([]);
    tr.reset();
    expect(tr.update({ keys: [VK.J] }, 1000)!.presses).toEqual([]);
  });

  it('holds presses back until SEND_EVERY_MS have passed and sends them together, at most PRESSES_MAX', () => {
    const tr = input.createWorkTracker();
    tr.update({ keys: [] }, 0);
    expect(tr.update({ keys: [VK.A] }, input.SEND_EVERY_MS - 1)).toBeNull();
    const m = tr.update({ keys: [VK.A, VK.J] }, input.SEND_EVERY_MS)!;
    expect(m.presses).toEqual([{ hand: 'left', row: 2 }, { hand: 'right', row: 2 }]);
    let at = input.SEND_EVERY_MS;
    for (let i = 0; i < input.PRESSES_MAX + 4; i++) { tr.update({ keys: [] }, at += .1); tr.update({ keys: [VK.Q] }, at += .1); }
    expect(tr.update({ keys: [VK.Q] }, at + input.SEND_EVERY_MS)!.presses).toHaveLength(input.PRESSES_MAX);
  });

  it('sends no keys while a password box has the focus', () => {
    const tr = input.createWorkTracker();
    tr.update({ keys: [] }, 0);
    const m = tr.update({ keys: [VK.A, VK.J], password: true }, 100)!;
    expect(m).toMatchObject({ presses: [], held: { left: 0, right: 0 }, password: true });
    // a key held from before the box is no press once it is left
    expect(tr.update({ keys: [VK.A, VK.J], password: false }, 200)!.presses).toEqual([]);
  });

  it('turns cursor movement into a direction, clamped at a full step, and reports buttons as they change', () => {
    const tr = input.createWorkTracker();
    tr.update({ cursor: { x: 100, y: 100 } }, 0);
    expect(tr.update({ cursor: { x: 100 + input.MOVE_FULL_PX / 2, y: 100 } }, 100)!.move).toEqual({ dx: .5, dy: 0 });
    expect(tr.update({ cursor: { x: 0, y: 0 } }, 200)!.move).toEqual({ dx: -1, dy: -1 });
    expect(tr.update({ cursor: { x: 0, y: 0 } }, 300)).toBeNull();
    expect(tr.update({ cursor: { x: 0, y: 0 }, buttons: { right: true } }, 400)).toMatchObject({ buttons: { left: false, right: true, middle: false }, move: null });
  });
});

/** A koffi whose user32 answers from `keys` (virtual keys down), `focus` (a handle, its class and its style). */
function fakeKoffi(world: { keys: Set<number>; focus: { hwnd: bigint; cls: string; style: number } | null }) {
  const calls: Record<string, (...args: never[]) => unknown> = {
    GetAsyncKeyState: (vk: number) => (world.keys.has(vk) ? -32768 : 0),
    GetGUIThreadInfo: (_thread: number, info: Buffer) => { info.writeBigInt64LE(world.focus?.hwnd ?? 0n, 16); return 1; },
    GetClassNameW: (hwnd: bigint, buf: Buffer) => {
      if (!world.focus || BigInt(hwnd) !== world.focus.hwnd) return 0;
      buf.write(world.focus.cls, 'utf16le');
      return world.focus.cls.length;
    },
    GetWindowLongW: (hwnd: bigint) => (world.focus && BigInt(hwnd) === world.focus.hwnd ? world.focus.style : 0),
  };
  return {
    load: (lib: string) => {
      expect(lib).toBe('user32.dll');
      return { func: (sig: string) => calls[/(\w+)\(/.exec(sig)![1]!]! };
    },
  };
}

describe('the work input on Windows', () => {
  it('reads the keys and the mouse buttons through GetAsyncKeyState', () => {
    const world = { keys: new Set<number>(), focus: null };
    const w = input.createWorkInput({ platform: 'win32', loadKoffi: () => fakeKoffi(world) });
    expect(w.available.keys).toBe(true);
    w.poll(0);
    world.keys.add(VK.J).add(0x01);
    expect(w.poll(100)).toMatchObject({ presses: [{ hand: 'right', row: 2 }], buttons: { left: true, right: false, middle: false } });
  });

  it('keeps the keys from the page while the focus is a classic password box', () => {
    const world = { keys: new Set<number>(), focus: { hwnd: 42n, cls: 'Edit', style: 0x0020 } as { hwnd: bigint; cls: string; style: number } | null };
    const w = input.createWorkInput({ platform: 'win32', loadKoffi: () => fakeKoffi(world) });
    expect(w.poll(0)).toMatchObject({ password: true });
    world.keys.add(VK.A);
    // the key goes down unseen: nothing changed that the page may hear
    expect(w.poll(100)).toBeNull();
    // a plain box: the check runs again after a quarter second
    world.focus = { hwnd: 42n, cls: 'Edit', style: 0 };
    world.keys.clear();
    w.poll(400);
    world.keys.add(VK.A);
    expect(w.poll(500)).toMatchObject({ presses: [{ hand: 'left', row: 2 }], password: false });
  });

  it('elsewhere reads no keys and still follows the cursor', () => {
    let at = { x: 0, y: 0 };
    const w = input.createWorkInput({ platform: 'darwin', cursor: () => at, loadKoffi: () => { throw new Error('not here'); } });
    expect(w.available.keys).toBe(false);
    w.poll(0);
    at = { x: 0, y: input.MOVE_FULL_PX };
    expect(w.poll(100)).toMatchObject({ presses: [], move: { dx: 0, dy: 1 } });
  });

  it('reads no keys where koffi does not load', () => {
    const w = input.createWorkInput({ platform: 'win32', loadKoffi: () => { throw new Error('no koffi'); } });
    expect(w.available.keys).toBe(false);
  });
});

describe('the work phases', () => {
  const room = { minX: 100, maxX: 900 };
  const standing = (x = 500) => ({ x, mode: 'idle' });

  it('brings the props out where the body stands, then sits it down once they are out', () => {
    const m = state.createWorkMachine({ enterMs: () => 500 });
    expect(m.step(true, standing(), room, 0)).toMatchObject({ phase: 'enter', changed: true });
    expect(m.step(true, standing(), room, .4).phase).toBe('enter');
    expect(m.step(true, standing(), room, .5)).toMatchObject({ phase: 'on', changed: true });
    expect(m.step(true, { x: 500, mode: 'sit' }, room, 1).changed).toBe(false);
  });

  it('walks a body clear of the edge first, and brings the desk out when it gets there or runs out of time', () => {
    const m = state.createWorkMachine();
    expect(m.step(true, standing(20), room, 0)).toMatchObject({ phase: 'walk', target: 100 });
    expect(m.step(true, { x: 60, mode: 'walk' }, room, 1).phase).toBe('walk');
    expect(m.step(true, { x: 98, mode: 'walk' }, room, 2).phase).toBe('enter');
    const late = state.createWorkMachine();
    late.step(true, standing(980), room, 0);
    expect(late.step(true, { x: 950, mode: 'walk' }, room, state.WORK_WALK_MAX).phase).toBe('enter');
  });

  it('packs the props away while the body is carried or thrown, and brings them out where it lands', () => {
    const m = state.createWorkMachine();
    m.step(true, standing(), room, 0);
    m.step(true, standing(), room, 0);
    expect(m.phase).toBe('on');
    expect(m.step(true, { x: 600, mode: 'drag' }, room, 1)).toMatchObject({ phase: 'away', changed: true });
    expect(m.step(true, { x: 700, mode: 'air' }, room, 2).phase).toBe('away');
    expect(m.step(true, { x: 700, mode: 'land' }, room, 2.1).phase).toBe('away');
    expect(m.step(true, standing(700), room, 2.3).phase).toBe('enter');
  });

  it('packs up for leaveMs when turned off, and is off after; turned on again meanwhile, it comes back out', () => {
    const m = state.createWorkMachine({ leaveMs: () => 200 });
    m.step(true, standing(), room, 0);
    m.step(true, standing(), room, 0);
    expect(m.step(false, { x: 500, mode: 'sit' }, room, 1)).toMatchObject({ phase: 'leave', changed: true });
    expect(m.step(false, standing(), room, 1.1).phase).toBe('leave');
    expect(m.step(false, standing(), room, 1.25)).toMatchObject({ phase: 'off', changed: true });
    m.step(true, standing(), room, 2);
    m.step(false, standing(), room, 2.1);
    expect(m.step(true, standing(), room, 2.15).phase).toBe('enter');
  });

  it('goes straight off from a walk or a carry, and waits for a body that is not there or in the air', () => {
    const m = state.createWorkMachine();
    m.step(true, standing(20), room, 0);
    expect(m.step(false, standing(40), room, .1).phase).toBe('off');
    expect(m.step(true, null, room, .2).phase).toBe('off');
    expect(m.step(true, { x: 500, mode: 'air' }, room, .3).phase).toBe('off');
  });
});

describe('the hands at the desk', () => {
  it('lights a key in the pressed zone for KEY_LIT_MS and puts that hand down for PAW_DOWN_MS', () => {
    const h = state.createWorkHands();
    h.feed({ held: { left: 1, right: 0 }, presses: [{ hand: 'left', row: 2 }], buttons: {}, move: null, password: false }, 1000);
    const v = h.view(1000);
    expect(v.lit).toHaveLength(1);
    expect(v.lit[0]).toMatchObject({ hand: 'left', row: 2 });
    expect(v.lit[0]!.col).toBeLessThan(state.KEYS_PER_HAND);
    expect(v).toMatchObject({ hand: 'left', taps: 1, held: { left: true, right: false }, hands: { left: { down: true } } });
    expect(h.view(1000 + state.PAW_DOWN_MS).hands.left.down).toBe(true); // still held
    h.feed({ held: { left: 0, right: 0 } }, 1000 + state.PAW_DOWN_MS);
    expect(h.view(1000 + state.PAW_DOWN_MS).hands.left.down).toBe(false);
    expect(h.view(1000 + state.KEY_LIT_MS).lit).toEqual([]);
  });

  it('moves the right hand to the keyboard on its key press and back to the mouse when the mouse is used', () => {
    const h = state.createWorkHands();
    expect(h.view(0).hands.right.onMouse).toBe(true);
    h.feed({ presses: [{ hand: 'right', row: 1 }] }, 10);
    expect(h.view(10).hands.right.onMouse).toBe(false);
    h.feed({ presses: [], move: { dx: 1, dy: 0 } }, 20);
    expect(h.view(20).hands.right.onMouse).toBe(true);
    expect(h.view(20).mouse.x).toBeGreaterThan(0);
    h.feed({ presses: [{ hand: 'right', row: 1 }] }, 30);
    h.feed({ presses: [], buttons: { left: true } }, 40);
    expect(h.view(40)).toMatchObject({ hands: { right: { onMouse: true, down: true } }, mouse: { buttons: { left: true, right: false } } });
  });

  it('eases the mouse back to its rest', () => {
    const h = state.createWorkHands();
    h.feed({ move: { dx: 1, dy: -1 } }, 0);
    const x0 = h.view(0).mouse.x;
    h.step(1);
    expect(h.view(0).mouse.x).toBeLessThan(x0 / 2);
  });

  it('lights nothing during a password or while reading is paused, and says when keys are not read here', () => {
    const h = state.createWorkHands();
    h.feed({ presses: [{ hand: 'left', row: 0 }] }, 0);
    h.feed({ presses: [{ hand: 'left', row: 0 }], password: true }, 1);
    expect(h.view(1)).toMatchObject({ lit: [], password: true, taps: 1 });
    h.feed({ presses: [{ hand: 'right', row: 0 }] }, 2);
    h.feed({ paused: true, keys: false }, 3);
    expect(h.view(3)).toMatchObject({ lit: [], paused: true, keys: false });
  });
});

const desk = await import(new URL('../web/work-desk.js', import.meta.url).href) as {
  chairFit(box: { x0: number; x1: number; y0: number } | null, minY?: number): { x0: number; x1: number; top: number };
};

describe('chairFit', () => {
  it('keeps the chair as drawn behind a body as wide as it, and when the body names no box', () => {
    expect(desk.chairFit({ x0: 20, x1: 236, y0: 12 })).toEqual({ x0: 44, x1: 212, top: 108 });
    expect(desk.chairFit(null)).toEqual({ x0: 44, x1: 212, top: 108 });
  });

  it('keeps the posts inside a narrow body, so none sticks up beside it, and the knobs inside the stage', () => {
    const c = desk.chairFit({ x0: 76, x1: 180, y0: 36 });
    expect(c.x0).toBeGreaterThanOrEqual(76 + 12);
    expect(c.x1).toBeLessThanOrEqual(180 - 12);
    expect(c.x0).toBeLessThan(c.x1);
    expect(desk.chairFit({ x0: 120, x1: 136, y0: 200 }).top).toBeLessThanOrEqual(160);
    expect(desk.chairFit({ x0: 20, x1: 236, y0: 12 }, 120).top).toBe(130);
  });
});
