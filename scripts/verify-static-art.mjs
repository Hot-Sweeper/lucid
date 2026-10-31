import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const code = (await transformWithOxc(await readFile(new URL('../src/perf/static-art.ts', import.meta.url), 'utf8'), 'static-art.ts')).code
  .replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
let color = '#112233';
const api = new Function('getComputedStyle', 'document', 'devicePixelRatio', 'window', `${code};return {StaticRun,updateStaticArt}`)(
  () => ({ getPropertyValue: () => color }), {}, 1.5, {});
const stale = { refs: 2 }, svg = { isConnected: true, parentElement: null };
const surface = Object.create(api.StaticRun.prototype);
const events = [];
Object.assign(surface, {
  svg, dependencies: ['--floor'], dependency: color, generation: 7, request: 'old-request', failedUntil: Infinity,
  asset: stale, crop: { x: 0, y: 0, w: 400, h: 300, density: 1.5 },
  image: { removeAttribute: key => events.push(['remove', key]) },
  fallback: () => events.push(['native']),
  serialize() { this.dependency = color; events.push(['serialize', color]); },
  update(immediate) { events.push(['update', immediate]); assert.equal(this.asset, null); assert.equal(this.crop, null); },
});
surface.invalidate();
assert.equal(events.length, 0, 'unchanged inherited variables must not cause redraws');
color = '#abcdef';
surface.invalidate();
assert.deepEqual(events, [['native'], ['remove', 'href'], ['serialize', color], ['update', true]]);
assert.equal(stale.refs, 1, 'invalidating one owner must release its stale asset without affecting another owner');
assert.equal(surface.generation, 8, 'old asynchronous raster jobs must be invalidated');
assert.equal(surface.request, ''); assert.equal(surface.failedUntil, 0);

// Exercise the actual update path with a valid cache and a camera density change.
api.updateStaticArt({ x: 0, y: 0, s: 1 }, 300, 200);
const native = Object.create(api.StaticRun.prototype);
let shown = 0, restored = 0;
Object.assign(native, {
  svg, dead: false, ready: true, loading: true, bounds: { x: 0, y: 0, w: 800, h: 600 },
  crop: { x: 0, y: 0, w: 600, h: 500, density: 1.5 },
  show() { shown++; }, fallback() { restored++; },
});
native.update(); assert.equal(shown, 1); assert.equal(restored, 0);
api.updateStaticArt({ x: 0, y: 0, s: 1.2 }, 300, 200);
native.update(); assert.equal(shown, 1); assert.equal(restored, 1, 'magnifying cached art must immediately restore native vectors');
api.updateStaticArt({ x: -750, y: 0, s: 1 }, 300, 200);
native.update(); assert.equal(shown, 1); assert.equal(restored, 2, 'an uncovered pan must immediately restore native vectors');
console.log('PASS: inherited-source invalidation releases stale pixels, rejects old jobs, retains shared owners, skips unchanged colors and restores native vectors immediately on zoom or uncovered movement');
