import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await readFile(new URL('../../src/office/outside-canvas.ts', import.meta.url), 'utf8');
const compiled = (await transformWithOxc(source, 'outside-canvas.ts')).code.replace(/^export /gm, '');
const OutsideVectorCanvas = new Function(compiled + ';return OutsideVectorCanvas;')();
const renderer = Object.create(OutsideVectorCanvas.prototype);
const shape = (id, bounds) => ({ kind: 'shape', id, bounds });
const inside = shape('inside', { x: 10, y: 10, w: 10, h: 10 });
const boundary = shape('stroke-boundary', { x: 100, y: 50, w: 3, h: 3 });
const unknown = shape('unknown', null);
const far = shape('far', { x: 1000, y: 1000, w: 10, h: 10 });
const group = { kind: 'group', opacity: .4, bounds: null, children: [inside, far, unknown] };
const commands = renderer.cropCommands([far, inside, group, boundary, unknown], { x: 0, y: 0, w: 100, h: 100 });
assert.equal(commands[0], inside);
assert.equal(commands[1].opacity, .4);
assert.deepEqual(commands[1].children, [inside, unknown]);
assert.equal(commands[2], boundary, 'stroke bounds touching the viewport remain drawable');
assert.equal(commands[3], unknown, 'missing bounds never discard original artwork');
assert.deepEqual(group.children, [inside, far, unknown], 'crop culling cannot mutate retained source geometry');
const unchanged = { kind: 'group', opacity: .3, bounds: null, children: [inside, unknown] };
assert.equal(renderer.cropCommands([unchanged], { x: 0, y: 0, w: 100, h: 100 })[0], unchanged, 'fully visible groups retain identity');
const many = Array.from({ length: 10000 }, (_, i) => shape(String(i), { x: i * 10, y: 10, w: 5, h: 5 }));
assert.equal(renderer.cropCommands(many, { x: 0, y: 0, w: 100, h: 100 }).length, 11);

// Run the real cache selection and draw path with tiny inert canvas stand-ins.
// A history entry may be sharp while leaving only twelve CSS pixels before its
// edge. Rejecting that entry should buy a full small-pan gesture of reuse.
const canvas = () => ({ width: 1, height: 1, style: {}, dataset: {}, addEventListener() {}, remove() {}, getContext: () => ({ setTransform() {}, clearRect() {}, isContextLost: () => false }) });
globalThis.document = { createElement: () => canvas() };
const surface = history => Object.assign(Object.create(OutsideVectorCanvas.prototype), {
  supported: true, context: {}, crop: null, history, tiles: [], commands: [], scratch: [], paints: 0,
  canvas: canvas(), element: { style: {}, dataset: {}, replaceChildren() {}, append() {} },
});
const scale = .23, width = 390, height = 844, dpr = 3;
const view = { x: 1000, y: 2000, w: width / scale, h: height / scale };
const historical = (left, right = 192) => {
  const crop = { x: view.x - left / scale, y: view.y - 192 / scale, w: view.w + (left + right) / scale, h: view.h + 384 / scale, density: scale * dpr * 1.1 };
  return { crop, width: Math.ceil(crop.w * crop.density), height: Math.ceil(crop.h * crop.density), tiles: [{ canvas: canvas(), x: 0, y: 0, core: { x: 0, y: 0, w: 1, h: 1 } }] };
};
const offcenter = historical(12, 372), fresh = surface([offcenter]);
assert.equal(fresh.draw(view, scale, width, height, dpr), true);
assert.notEqual(fresh.crop, offcenter.crop, 'an off-center historical crop must not become the current crop');
assert.equal(fresh.paints, 1, 'rejecting edge history builds one centered full-density crop');
assert.ok(fresh.crop.density >= scale * dpr);
for (const dx of [-120, 0, 120]) for (const dy of [-120, 0, 120]) {
  fresh.draw({ ...view, x: view.x + dx / scale, y: view.y + dy / scale }, scale, width, height, dpr);
}
assert.equal(fresh.paints, 1, 'the fresh crop covers the entire plus/minus120px pan without another paint');
const centered = historical(192), restored = surface([centered]);
restored.draw(view, scale, width, height, dpr);
assert.equal(restored.crop, centered.crop, 'well-centered sharp history is still reused');
assert.equal(restored.paints, 0);
restored.draw({ ...view, x: centered.crop.x + centered.crop.w - view.w }, scale, width, height, dpr);
assert.equal(restored.crop, centered.crop);
assert.equal(restored.paints, 0, 'the active crop remains reusable at its exact coverage edge');
const shallow = historical(12, 372), settled = surface([]);
Object.assign(settled, { crop: shallow.crop, tiles: shallow.tiles });
settled.canvas.width = shallow.width; settled.canvas.height = shallow.height;
settled.draw(view, scale, width, height, dpr);
assert.equal(settled.paints, 0, 'an active shallow crop is kept during camera movement');
settled.draw(view, scale, width, height, dpr, 96);
assert.equal(settled.paints, 1, 'an explicit settled request rebuilds shallow current coverage once');
settled.draw(view, scale, width, height, dpr, 96);
assert.equal(settled.paints, 1, 'repeated settled requests reuse the prepared movement reserve');
for (const dx of [-120, 0, 120]) for (const dy of [-120, 0, 120]) settled.draw({ ...view, x: view.x + dx / scale, y: view.y + dy / scale }, scale, width, height, dpr);
assert.equal(settled.paints, 1, 'idle preparation covers the next plus/minus120px pan without another paint');
console.log('Scenery commands: crop culling retains painter order, opacity groups, edge strokes and unknown bounds; 10000 source commands reduce to11 candidates before per-tile painting.');
