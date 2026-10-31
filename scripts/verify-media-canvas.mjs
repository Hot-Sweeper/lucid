import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { transformWithOxc } from 'vite';

// Exercise the reel's real lifecycle and frame gate with a deterministic resize adapter.
let ratio = .25, now = 1000, tick, stopped = 0, paints = [];
const sized = new WeakMap(), observers = [];
function fitCanvas(canvas, w, h, density = 2) {
  canvas.width = Math.ceil(w * density); canvas.height = Math.ceil(h * density);
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  sized.set(canvas, { w, h, ratio: density });
  return canvas.getContext('2d');
}
class LiveCanvases {
  entries = new Set();
  add(canvas) { this.entries.add(canvas); }
  prepare() {
    for (const canvas of this.entries) if (canvas.isConnected) {
      const size = sized.get(canvas);
      if (size.ratio !== ratio) fitCanvas(canvas, size.w, size.h, ratio);
    }
  }
  clear() { this.entries.clear(); }
}
const canvas = () => {
  const ctx = { setTransform(...values) { this.transform = values; }, clearRect() { this.cleared = true; } };
  return { width: 0, height: 0, style: {}, isConnected: true, getContext: () => ctx };
};
const saved = { performance: globalThis.performance, document: globalThis.document, IntersectionObserver: globalThis.IntersectionObserver, getComputedStyle: globalThis.getComputedStyle };
globalThis.performance = { now: () => now };
globalThis.document = { fonts: { ready: new Promise(() => {}) } };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'Lexend' });
globalThis.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe() {} unobserve() {} disconnect() { this.disconnected = true; }
};
globalThis.__mediaTest = {
  VW: 240, VH: 180, setFamily() {}, setPxScale() {},
  drawGifFrame(ctx, kind, time) { paints.push({ kind, time, scale: ctx.transform[0], cleared: ctx.cleared }); },
  posterTime: () => 2, LiveCanvases, fitCanvas, canvasPixelRatio: canvas => sized.get(canvas).ratio,
};
try {
  const source = await fs.readFile(new URL('../src/life/gifreel.ts', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'gifreel.ts');
  const body = 'const {VW,VH,setFamily,setPxScale,drawGifFrame,posterTime,LiveCanvases,fitCanvas,canvasPixelRatio}=globalThis.__mediaTest;\n' + code.replace(/^import .*;\r?$/gm, '');
  const { GifReel } = await import('data:text/javascript;base64,' + Buffer.from(body).toString('base64'));
  const reel = new GifReel(fn => { tick = fn; return () => stopped++; }, { still: false });
  const cv = canvas(); reel.add(cv, 'drake', 240);
  assert.equal(cv.width, 60); assert.equal(paints.length, 1); assert.equal(paints[0].scale, .25);
  now += 5; tick(now); assert.equal(paints.length, 1, 'same animation frame should reuse pixels');
  ratio = 3; now += 5; tick(now);
  assert.equal(cv.width, 720); assert.equal(paints.length, 2, 'density change must repaint despite unchanged GIF frame');
  assert.equal(paints[1].time, paints[0].time, 'resize must preserve the original animation clock');
  assert.equal(paints[1].scale, 3, 'virtual geometry must use the new actual density');
  now += 40; tick(now); assert.ok(paints.at(-1).time > 0, 'visible GIF animation must continue');
  observers[0].callback([{ target: cv, isIntersecting: false }]);
  const beforeHidden = paints.length; ratio = 5; now += 100; tick(now);
  assert.equal(paints.length, beforeHidden); assert.equal(cv.width, 720, 'hidden GIFs must keep their last buffer without resizing');
  observers[0].callback([{ target: cv, isIntersecting: true }]);
  now += 5; tick(now); assert.equal(cv.width, 1200); assert.equal(paints.length, beforeHidden + 1);
  cv.isConnected = false; tick(now); assert.equal(reel.playing, 0); assert.equal(stopped, 1, 'detached GIFs must release their scheduler');
  reel.stop(); assert.ok(observers[0].disconnected);

  paints = []; ratio = 1;
  const still = new GifReel(fn => { tick = fn; return () => stopped++; }, { still: true });
  const frozen = canvas(); still.add(frozen, 'fine', 240);
  const poster = paints[0].time;
  now += 500; tick(now); assert.equal(paints.length, 1, 'reduced-motion GIFs must not repaint at unchanged density');
  ratio = 3; tick(now); assert.equal(paints.length, 2); assert.equal(paints[1].time, poster, 'a sharp reduced-motion resize must retain the same poster');
  still.stop(); const afterStop = paints.length; tick(now + 100); assert.equal(paints.length, afterStop);
  console.log('PASS: live GIF density, same-frame resize, logical geometry, animation continuity, hidden/resume, disposal and reduced-motion posters');
} finally {
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  delete globalThis.__mediaTest;
}
