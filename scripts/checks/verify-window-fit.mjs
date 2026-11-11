// Windows that show real content with a known size (the agent's captured browser window,
// photos, sprite sheet frames) keep that content's exact shape: no letterbox bars when they
// open, maximize, snap, restore or when the content changes shape. Pure math first, then the
// production window manager with a fake tween clock.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const load = async (file, names, args = {}) => {
  const source = await readFile(new URL(`../../src/os/${file}`, import.meta.url), 'utf8');
  const code = (await transformWithOxc(source.replace(/^import .*;\r?\n/gm, ''), file)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
  return new Function(...Object.keys(args), `${code};return {${names.join(',')}}`)(...Object.values(args));
};
const fit = await load('window-fit.ts', ['fitWindow', 'maximizedFrame', 'snappedFrame', 'refitFrame', 'placeAround']);
const { fitWindow, maximizedFrame, snappedFrame, refitFrame } = fit;

const AREA = { x: 4, y: 4, w: 812, h: 403 }, PREFER = { w: 740, h: 390 };
const BAR = { w: 0, h: 26 }, BARE = { w: 0, h: 0 };
// Rounding each side to whole pixels may leave at most one pixel of difference.
const exactShape = (frame, inset, content, label) => {
  const bw = frame.w - inset.w, bh = frame.h - inset.h, r = content.w / content.h;
  // object-fit: contain leaves a bar along the side that is too long.
  const bar = bw / bh > r ? bw - bh * r : bh - bw / r;
  assert.ok(bar <= 1, `${label}: content box ${bw}x${bh} keeps ${content.w}x${content.h} (bar ${bar.toFixed(2)}px)`);
};
const inside = (frame, area, label) => assert.ok(frame.x >= area.x && frame.y >= area.y && frame.x + frame.w <= area.x + area.w + 0.01 && frame.y + frame.h <= area.y + area.h + 0.01, `${label}: ${JSON.stringify(frame)} stays inside ${JSON.stringify(area)}`);

const shapes = { wide: { w: 1785, h: 1110 }, tall: { w: 751, h: 1080 }, square: { w: 1080, h: 1080 }, banner: { w: 2400, h: 400 }, phone: { w: 390, h: 2400 } };
for (const [name, content] of Object.entries(shapes)) {
  for (const inset of [BARE, BAR, { w: 24, h: 126 }]) {
    const label = `${name} inset ${inset.w}x${inset.h}`;
    const size = fitWindow({ content, inset, prefer: PREFER }, AREA);
    exactShape(size, inset, content, label);
    assert.ok(size.w <= AREA.w && size.h <= AREA.h, `${label}: fits the desktop`);
    const max = maximizedFrame({ content, inset }, AREA);
    exactShape(max, inset, content, `${label} maximized`); inside(max, AREA, `${label} maximized`);
    const r = content.w / content.h; // whole pixels: the long side may be short by up to one step of the ratio
    assert.ok(max.w >= AREA.w - Math.max(1, r) || max.h >= AREA.h - Math.max(1, 1 / r), `${label}: maximized fills one dimension`);
    assert.ok(Math.abs((max.x - AREA.x) - (AREA.x + AREA.w - max.x - max.w)) <= 1 && Math.abs((max.y - AREA.y) - (AREA.y + AREA.h - max.y - max.h)) <= 1, `${label}: maximized is centred`);
    for (const side of ['left', 'right']) {
      const half = { x: side === 'left' ? 4 : 412, y: 4, w: 404, h: 407 };
      const snapped = snappedFrame({ content, inset }, half, side);
      exactShape(snapped, inset, content, `${label} ${side}`); inside(snapped, half, `${label} ${side}`);
      assert.equal(side === 'left' ? snapped.x : snapped.x + snapped.w, side === 'left' ? half.x : half.x + half.w, `${label}: snapped against the ${side} edge`);
    }
  }
}
// Shape follows content: tall content gives a tall window, wide content a wide one, with
// comparable presence (area) instead of a sliver inside a fixed frame.
const wide = fitWindow({ content: shapes.wide, inset: BARE, prefer: PREFER }, AREA), tall = fitWindow({ content: shapes.tall, inset: BARE, prefer: PREFER }, AREA);
assert.ok(wide.w > wide.h && tall.h > tall.w, 'Window orientation follows the content');
assert.ok(tall.h >= AREA.h - 1, 'A tall capture uses the full desktop height instead of a sliver in a wide frame');
// Never larger than the content allows.
const small = fitWindow({ content: { w: 200, h: 100 }, inset: BARE, prefer: PREFER, maxScale: 1 }, AREA);
assert.deepEqual(small, { w: 200, h: 100 }, 'maxScale keeps a small picture at its own pixels');
// A floating window refits around its centre.
const current = { x: 200, y: 100, w: 300, h: 200 };
const refit = refitFrame({ content: shapes.tall, inset: BAR }, current, AREA);
exactShape(refit, BAR, shapes.tall, 'refit'); inside(refit, AREA, 'refit');
assert.ok(Math.abs(refit.x + refit.w / 2 - 350) <= 1 && Math.abs(refit.y + refit.h / 2 - 200) <= 1, 'Refit keeps the window centre');

// The production window manager.
const tweens = [];
const gsap = { to: (target, vars) => { const tween = { target, vars }; tweens.push(tween); return tween; } };
const { WM } = await load('wm.ts', ['WM'], { gsap, ICONS: {}, wakeRender: () => {}, renderFps: () => 60, CHAT_TITLE: 'Chat', ...fit });
const el = (frame, z) => {
  const classes = new Set();
  return { style: { left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.w}px`, height: `${frame.h}px`, zIndex: String(z) }, dataset: {}, querySelector: () => null, classList: { contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c), add: c => classes.add(c), remove: c => classes.delete(c) } };
};
const wm = Object.create(WM.prototype);
Object.assign(wm, { wins: new Map(), movingWindows: new Map(), unmax: new Map(), contents: new Map(), modes: new Map(), localizationStops: new Map(), speed: 1, windowTitles: new WeakMap() });
wm.pointAt = async () => {}; wm.click = async () => {}; wm.sleep = async () => {}; wm.moveTo = async () => {};
wm.robot = { click() {} }; wm.cursor = { x: 0, y: 0 };
const finish = () => {
  while (tweens.length) {
    const tween = tweens.shift();
    for (const k of ['left', 'top', 'width', 'height']) if (tween.vars[k] != null) tween.target.style[k] = typeof tween.vars[k] === 'number' ? `${tween.vars[k]}px` : tween.vars[k];
    tween.vars.onComplete?.();
  }
};
const frameOf = w => wm.frameOf(w);
const live = { id: 'livebrowser', el: el({ x: 40, y: 12, w: 740, h: 390 }, 10), title: { textContent: '' } };
const notes = { id: 'notes', el: el({ x: 470, y: 30, w: 330, h: 300 }, 9), title: { textContent: '' } };
wm.wins.set(live.id, live); wm.wins.set(notes.id, notes);

// The first capture arrives: the open window takes its shape in place, with no title bar inset.
wm.fitContent('livebrowser', shapes.tall); finish();
exactShape(frameOf(live), BARE, shapes.tall, 'live window after its first capture'); inside(frameOf(live), AREA, 'live window');
// The same shape again does nothing (a capture arrives every second).
wm.fitContent('livebrowser', { w: 1502, h: 2160 }); assert.equal(tweens.length, 0, 'An unchanged shape never animates the window');
// Maximize, then the real browser is resized while maximized, then restore.
await wm.maximize('livebrowser'); finish();
exactShape(frameOf(live), BARE, shapes.tall, 'maximized live window'); inside(frameOf(live), AREA, 'maximized live window');
wm.fitContent('livebrowser', shapes.wide); finish();
const maxWide = frameOf(live);
exactShape(maxWide, BARE, shapes.wide, 'maximized window follows a new shape');
assert.ok(maxWide.w >= AREA.w - 1 || maxWide.h >= AREA.h - 1, 'It stays maximized');
await wm.unmaximize('livebrowser'); finish();
exactShape(frameOf(live), BARE, shapes.wide, 'restored window takes the new shape'); inside(frameOf(live), AREA, 'restored window');
// Snapping: both the content window and a normal window take their halves.
wm.dragTo = async () => {};
wm.wins.get('notes').lastUsed = 1; live.lastUsed = 2;
const random = Math.random; Math.random = () => 0;
await wm.snap('livebrowser', 'right'); finish();
Math.random = random;
const snapped = frameOf(live);
exactShape(snapped, BARE, shapes.wide, 'snapped live window'); inside(snapped, { x: 412, y: 4, w: 404, h: 407 }, 'snapped live window');
assert.deepEqual(frameOf(notes), { x: 4, y: 4, w: 404, h: 407 }, 'A window without real content fills its half as before');
wm.fitContent('livebrowser', shapes.square); finish();
exactShape(frameOf(live), BARE, shapes.square, 'snapped window follows a new shape'); inside(frameOf(live), { x: 412, y: 4, w: 404, h: 407 }, 'snapped square');
// A floating window that changes shape takes the app's preferred presence again, rather than
// shrinking a little more with every change (square, then wide, must not leave it small).
const floating = { id: 'livebrowser', el: el({ x: 54, y: 8, w: 403, h: 403 }, 12), title: { textContent: '' } };
wm.wins.set('livebrowser', floating); wm.modes.clear(); wm.contents.set('livebrowser', { content: shapes.square, inset: BARE });
wm.fitContent('livebrowser', shapes.wide); finish();
const regrown = frameOf(floating), expected = fitWindow({ content: shapes.wide, inset: BARE, prefer: PREFER }, AREA);
assert.deepEqual({ w: regrown.w, h: regrown.h }, expected, 'Refit uses the preferred size, not the previous shape');
// Photos keep the title bar: the content box under it has the picture's shape.
const photos = { id: 'photos', el: el({ x: 470, y: 228, w: 330, h: 170 }, 11), title: { textContent: '' } };
wm.wins.set(photos.id, photos);
wm.fitContent('photos', { w: 1887, h: 1224 }, { prefer: { w: 440, h: 300 }, maxScale: 2 }); finish();
exactShape(frameOf(photos), BAR, { w: 1887, h: 1224 }, 'photo window under its title bar'); inside(frameOf(photos), AREA, 'photo window');
// Closing forgets the content, so the next window of that app starts fresh.
wm.leaveDock = () => {}; wm.dock = { querySelector: () => null, classList: { remove() {} } }; wm.pos = () => ({ x: 0, y: 0 });
const gsapClose = tweens.length; wm.close('photos'); tweens.length = gsapClose;
assert.equal(wm.contents.has('photos'), false, 'Closing a window drops its content size');
console.log('window fit: exact content shapes when opening, refitting, maximizing, restoring and snapping');
