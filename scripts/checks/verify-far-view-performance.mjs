// Zoomed out over a campus with linked computers, the office must stay smooth. Guards the fixes
// from measuring it: camera-driven variables never inherit from an office root, a pan moves a
// held compositor animation instead of the inline transform, the Follow T3 check only relights on
// a real palette change, and per-frame paths never search or measure the whole campus.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const read = (file) => readFile(new URL(`../../src/${file}`, import.meta.url), 'utf8');
async function load(file, names, fakes = {}) {
  const code = (await transformWithOxc((await read(file)).replace(/^import\s[^;]+;\r?\n/gm, ''), file)).code
    .replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
  const keys = Object.keys(fakes);
  return new Function(...keys, `${code}\nreturn { ${names.join(', ')} };`)(...keys.map((k) => fakes[k]));
}

// --- the camera: a pan at an unchanged zoom moves compositor keyframes -----------------------
{
  const timers = new Map(); let timerId = 0;
  globalThis.window = { setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id) };
  const noop = () => {};
  const { WorldCameraView } = await load('office/world/camera-view.ts', ['WorldCameraView'], {
    canvasRobotsWanted: () => false, syncRobotCanvases: noop, LOD_PX: { full: 440, tiny: 70 }, monitorPx: (s) => s * 414,
    gsap: {}, setZoom: noop, setCameraMoving: noop, UNIT_W: 400, UNIT_H: 380, footprintCovers: () => false,
    updateOutside: noop, setRenderView: noop, beginSystem: () => -1, endSystem: noop, updateStaticArt: noop,
  });
  const animations = [];
  const root = {
    style: { transform: '' }, inlineWrites: 0, classList: { add: noop, remove: noop, toggle: noop },
    animate(frames, options) {
      const anim = { frames, options, cancelled: false, effect: { setKeyframes: (next) => { anim.frames = next; anim.updates++; } }, updates: 0, cancel() { this.cancelled = true; } };
      animations.push(anim); return anim;
    },
  };
  let transform = '';
  Object.defineProperty(root.style, 'transform', { get: () => transform, set: (v) => { transform = v; root.inlineWrites++; } });
  const world = Object.assign(Object.create(WorldCameraView.prototype), {
    hostWorld: null, scene: { inert: false, classList: { toggle: noop } }, root, cam: { x: 0, y: 0, s: 0.2 },
    lastScale: 0.2, lastX: 0, lastY: 0, zooming: false, glideAnim: null, glideSpan: null, panAnim: null, resharpen: 0, rasterScale: 0.2,
    chatThread: '', canvasRobots: false, near: false, overviewLayers: true, zoomEnd: 0,
    clampCam: noop, hidePlateCard: noop, cancelOutsideWarm: noop, applyView: noop, scheduleOutsideWarm: noop, syncPlates: noop,
  });
  world.redrawSharp = noop;
  globalThis.document = { hidden: false };
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  const t = (c) => `translate(${c.x}px, ${c.y}px) scale(${c.s})`;

  world.cam.x = 10; world.apply();
  assert.equal(world.zooming, true, 'the first move starts camera motion');
  assert.equal(animations.length, 0, 'the first move of a gesture still uses the inline transform');
  assert.equal(transform, t(world.cam));
  const writes = root.inlineWrites;
  world.cam.x = 20; world.apply();
  world.cam.y = 30; world.apply();
  assert.equal(root.inlineWrites, writes, 'a pan never rewrites the inline transform');
  assert.equal(animations.length, 1, 'one held animation carries the whole pan');
  assert.deepEqual(animations[0].options, { duration: 1e9, fill: 'both' });
  assert.equal(animations[0].updates, 1, 'later pan frames only move its keyframes');
  assert.deepEqual(animations[0].frames, [{ transform: t(world.cam) }, { transform: t(world.cam) }]);
  world.cam.s = 0.25; world.apply();
  assert.equal(animations[0].cancelled, true, 'a zoom step drops the pan animation');
  assert.equal(world.panAnim, null);
  assert.equal(transform, t(world.cam), 'zoom steps keep the inline transform, so rasterization follows the scale');
  world.glideAnim = {}; world.lastScale = world.cam.s; world.cam.x = 40; world.apply();
  assert.equal(animations.length, 1, 'a running wheel glide is never covered by a pan animation');
  world.glideAnim = null; world.cam.x = 50; world.apply();
  assert.equal(animations.length, 2);
  for (const fn of [...timers.values()]) fn();
  assert.equal(world.zooming, false, 'the camera settles');
  assert.equal(animations[1].cancelled, true, 'the settled camera returns to the inline transform');
  assert.equal(transform, t(world.cam));
  delete globalThis.window; delete globalThis.document;
}

// --- Follow T3: a reordered answer is not a theme change ---------------------------------------
{
  const palette = Object.fromEntries(['canvas', 'sidebar', 'surface', 'surfaceRaised', 'surfaceOverlay', 'text', 'textMuted', 'border', 'accent', 'accentText', 'accentForeground', 'secondary', 'codeBackground', 'toolbarControl', 'toolbarControlHover', 'sidebarRowHover', 'sidebarRowSelected', 'sidebarForeground', 'sidebarMutedForeground', 'messageSurface', 'terminalBackground'].map((k) => [k, '#123456']));
  const stored = { themeId: 'system', label: 'T3 Code', mode: 'system', source: 'T3 default', light: palette, dark: null };
  const store = new Map([['lucid.t3Theme', JSON.stringify(stored)]]);
  const timers = [];
  let answer = { themeId: 'system', label: 'T3 Code', mode: 'system', light: palette, dark: null, source: 'T3 default' };
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  globalThis.window = { lucid: { t3Theme: async () => structuredClone(answer) }, setTimeout: (fn) => timers.push(fn), clearTimeout: () => {}, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: { style: { setProperty() {} }, dataset: {} } };
  const { followT3 } = await load('themes/t3-theme.ts', ['followT3'], { setT3Look: () => {} });
  let changes = 0;
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  followT3(true, () => changes++); await settle();
  for (let i = 0; i < 3; i++) { timers.shift()?.(); await settle(); }
  assert.equal(changes, 0, 'the same palette with `source` listed last is not a change (it relit the office every 8 s)');
  answer = { ...answer, light: { ...palette, accent: '#abcdef' } };
  timers.shift()?.(); await settle();
  assert.equal(changes, 1, 'a real palette change still applies');
  timers.shift()?.(); await settle();
  assert.equal(changes, 1, 'and only once');
  delete globalThis.window; delete globalThis.document; delete globalThis.localStorage;
}

// --- per-frame paths ---------------------------------------------------------------------------
const plates = await read('office/world/plates.ts'), campus = await read('office/world/campus.ts');
assert(!/root\.style\.setProperty\(\s*["']--plate-zoom/.test(plates), 'the plate zoom is never inherited from the office root');
assert(/d\.setPlateZoom\(zoom\)/.test(plates) && /room-far-label/.test(plates), 'plates and room labels carry their own zoom');
assert(!/root\.style\.setProperty\(\s*["']--sign-scale/.test(campus), 'the sign scale is never inherited from the campus root');
assert(/paintSigns\(this: World\)/.test(campus), 'the signs carry their own scale');
const view = await read('office/world/camera-view.ts');
assert(!/this\.root\.querySelector\(["']\.outside-live/.test(view), 'camera frames never search the campus for the live grounds');
const chatMark = await read('office/world/chat-mark.ts');
assert(!/querySelectorAll\(["']\.desk-unit\.chat-open/.test(chatMark), 'camera frames never search the campus for the open chat desk');
const power = await read('robot/render/power.ts');
assert(!/\.getBoundingClientRect\(/.test(power) && /new IntersectionObserver/.test(power), 'Ultra and Fast effects learn visibility from an observer, never by measuring on the ticker');
const walker = await read('robot/walker/body.ts');
assert(/this\.stepping && farCamera\(\) && !ambientBeat\(\)/.test(walker), 'far walking steps are presented on ambient beats');
assert(/if \(this\.el\.style\.transform !== transform\)/.test(walker) && /if \(this\.el\.style\.zIndex !== z\)/.test(walker), 'unchanged walker positions are not rewritten');

console.log('PASS: pans move compositor keyframes, Follow T3 ignores key order, and per-frame paths stay local');
