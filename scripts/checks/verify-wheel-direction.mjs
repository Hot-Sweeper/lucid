import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await readFile(process.argv[2] || new URL('../../src/office/world.ts', import.meta.url), 'utf8');
const ease = await readFile(new URL('../../src/perf/ease.ts', import.meta.url), 'utf8');
const timing = (await transformWithOxc(ease.replaceAll('export ', ''), 'ease.ts')).code;
const methods = source.slice(source.indexOf('  private cancelCameraTween()'), source.indexOf('  /** Wheel zoom eases'));
const start = source.indexOf('  private camera()');
const wheel = source.slice(start, source.indexOf('    let start:', start)) + '\n}';
const code = (await transformWithOxc(`class Camera {${methods}\n${wheel}}`, 'camera.ts')).code;
let now = 0;
class DOMRect { constructor(left, top, width, height) { Object.assign(this, { left, top, width, height }); } }
const Camera = new Function('performance', 'DOMRect', 'cancelAnimationFrame', 'document', `${timing}\n${code}\nreturn Camera;`)(
  { now: () => now, timeOrigin: 0 }, DOMRect, () => {}, { timeline: { get currentTime() { return now - 750; } } });
const view = new Camera();
view.cam = { x: -100, y: -80, s: 1 };
view.fx = { setGlide: glide => { if (glide) structuredClone(glide); } };
view.root = { style: {}, animate: () => ({ cancel() {}, onfinish: null }) };
view.scene = { getBoundingClientRect: () => new DOMRect(0, 0, 1200, 800), addEventListener: (_, fn) => { view.wheel = fn; } };
view.clampCam = () => { view.cam.s = Math.max(.1, Math.min(5, view.cam.s)); };
view.cameraZoomBounds = () => ({ min: .1, max: 5 });
view.apply = view.applySoon = () => {};
view.camera();
const dispatch = (deltaY, deltaMode = 0) => view.wheel({ deltaY, deltaMode, clientX: 600, clientY: 400, preventDefault() {} });
const reset = () => { view.stopGlide(); view.cam = { x: -100, y: -80, s: 1, _gsap: { get() {} } }; now = 0; };
for (const direction of [-1, 1]) {
  reset();
  dispatch(direction * 120);
  assert.equal(view.glideAnim.startTime, now - 750, 'Compositor start uses the document timeline, not the performance clock');
  now = 20;
  const shown = view.shownCam();
  const anchor = { x: (600 - shown.x) / shown.s, y: (400 - shown.y) / shown.s };
  dispatch(-direction * 40);
  assert.equal(Math.sign(view.cam.s - shown.s), direction, 'Opposite wheel notch must reverse from the visible scale');
  assert.ok(Math.abs((600 - view.cam.x) / view.cam.s - anchor.x) < 1e-8, 'Reversal preserves the cursor anchor');
  for (const delta of [2, 25, 39]) {
    reset(); dispatch(direction * 120); now = 20;
    const before = view.shownCam();
    dispatch(-direction * delta);
    assert.ok(Math.abs(view.cam.s / before.s - Math.exp(direction * delta * .0015)) < 1e-10,
      'Touchpad input must use its own delta from the visible scale without inheriting wheel travel');
    assert.equal(view.glideAnim, null, 'Touchpad input takes over directly');
  }
  reset(); dispatch(direction * 120); const goal = view.cam.s; now = 20;
  dispatch(direction * 120);
  assert.ok(Math.abs(view.cam.s / goal - Math.exp(-direction * 120 * .0015)) < 1e-10,
    'Same-direction mouse notches retain accumulated distance');
}
reset();
for (let n = 0; n < 120; n++) {
  now += 8;
  const delta = n % 2 ? 40 : -120, before = view.shownCam();
  dispatch(delta);
  assert.equal(Math.sign(view.cam.s - before.s), -Math.sign(delta), 'Every rapid reversal follows the newest input');
}
console.log('PASS: wheel reversals in both directions, wheel-to-touchpad takeover, cursor anchoring, accumulated notches and 120 rapid reversals');
