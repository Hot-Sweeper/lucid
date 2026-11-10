// Exercise the real retained-group renderer with analytic source-over colors.
// This software fixture checks active-rectangle copies and canvas resets without
// depending on a native GPU or claiming a browser pixel comparison.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const operations = { clears: 0, copies: 0 };

class PixelCanvas {
  constructor() { this.w = 300; this.h = 150; this.resets = 0; this.context = new PixelContext(this); this.reset(); }
  get width() { return this.w; }
  set width(value) { this.w = value; this.resets++; this.reset(); }
  get height() { return this.h; }
  set height(value) { this.h = value; this.resets++; this.reset(); }
  reset() { this.pixels = new Float64Array(this.w * this.h * 4); this.context?.reset(); }
  getContext() { return this.context; }
  remove() {}
  sample(x, y) { return [...this.pixels.slice((y * this.w + x) * 4, (y * this.w + x) * 4 + 4)]; }
}
class PixelContext {
  constructor(canvas) { this.canvas = canvas; this.reset(); }
  reset() { this.globalAlpha = 1; this.matrix = [1, 0, 0, 1, 0, 0]; this.fillStyle = '#000000'; }
  setTransform(...values) { this.matrix = values; }
  each(x, y, width, height, callback) {
    for (let yy = Math.max(0, Math.ceil(y)); yy < Math.min(this.canvas.height, y + height); yy++)
      for (let xx = Math.max(0, Math.ceil(x)); xx < Math.min(this.canvas.width, x + width); xx++) callback((yy * this.canvas.width + xx) * 4, xx, yy);
  }
  clearRect(x, y, width, height) { operations.clears++; this.each(x, y, width, height, index => this.canvas.pixels.fill(0, index, index + 4)); }
  blend(index, premultiplied, alpha) {
    const pixels = this.canvas.pixels, remain = 1 - alpha;
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = premultiplied[channel] + pixels[index + channel] * remain;
    pixels[index + 3] = alpha + pixels[index + 3] * remain;
  }
  fillRect(x, y, width, height) {
    const [a, , , d, e, f] = this.matrix;
    const rgb = [1, 3, 5].map(start => parseInt(this.fillStyle.slice(start, start + 2), 16) / 255 * this.globalAlpha);
    this.each(x * a + e, y * d + f, width * a, height * d, index => this.blend(index, rgb, this.globalAlpha));
  }
  fill(path) { this.fillRect(path.x, path.y, path.w, path.h); }
  drawImage(source, ...args) {
    operations.copies++;
    let sx = 0, sy = 0, sw = source.width, sh = source.height, dx, dy, dw = sw, dh = sh;
    if (args.length === 2) [dx, dy] = args;
    else { assert.equal(args.length, 8); [sx, sy, sw, sh, dx, dy, dw, dh] = args; }
    this.each(dx, dy, dw, dh, (index, x, y) => {
      const ox = Math.floor(sx + (x - dx) * sw / dw), oy = Math.floor(sy + (y - dy) * sh / dh);
      const sourceIndex = (oy * source.width + ox) * 4, pixels = source.pixels;
      this.blend(index, [pixels[sourceIndex], pixels[sourceIndex + 1], pixels[sourceIndex + 2]].map(value => value * this.globalAlpha), pixels[sourceIndex + 3] * this.globalAlpha);
    });
  }
}

const created = [];
const document = { createElement(tag) { assert.equal(tag, 'canvas'); const canvas = new PixelCanvas(); created.push(canvas); return canvas; } };
const transformed = await transformWithOxc(await readFile(new URL('../../src/office/outside-canvas.ts', import.meta.url), 'utf8'), 'outside-canvas.ts');
const code = transformed.code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
class Matrix {
  constructor([a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = []) { Object.assign(this, { a, b, c, d, e, f }); }
  multiply(m) { return new Matrix([this.a*m.a+this.c*m.b,this.b*m.a+this.d*m.b,this.a*m.c+this.c*m.d,this.b*m.c+this.d*m.d,this.a*m.e+this.c*m.f+this.e,this.b*m.e+this.d*m.f+this.f]); }
  transformPoint({ x, y }) { return { x: this.a*x+this.c*y+this.e, y: this.b*x+this.d*y+this.f }; }
}
class Path { rect(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
const style = { display: 'block', visibility: 'visible', filter: 'none', clipPath: 'none', maskImage: 'none', mixBlendMode: 'normal', vectorEffect: 'none', paintOrder: 'normal', strokeLinejoin: 'miter', transform: 'none', opacity: '1', fill: '#ff0000', stroke: 'none', fillOpacity: '1', strokeOpacity: '1', fillRule: 'nonzero', strokeWidth: '4', strokeMiterlimit: '10', strokeLinecap: 'butt', strokeDasharray: 'none', strokeDashoffset: '0' };
const { Class, opacityGroup } = new Function('document', 'DOMMatrix', 'Path2D', 'getComputedStyle', `${code};return {Class:OutsideVectorCanvas,opacityGroup}`)(document, Matrix, Path, node => ({ ...style, ...node.style }));
const renderer = Object.create(Class.prototype), scratch = [];
Object.assign(renderer, { scratch, supported: true, commands: [], patterns: new Map(), history: [], tiles: [], canvas: new PixelCanvas(), element: { remove() {} } });
const shape = (color, x, y, w, h) => ({ kind: 'shape', matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, path: { x, y, w, h }, bounds: null, fill: { color }, stroke: null, fillOpacity: 1 });
const group = { kind: 'group', opacity: .5, children: [shape('#ff0000', 0, 0, 800, 800), { kind: 'group', opacity: .5, children: [shape('#00ff00', 0, 0, 64, 800)] }] };
const pixel = (canvas, x, y, expected) => canvas.sample(x, y).forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-12, `unexpected pixel at ${x},${y}, channel ${index}: ${value}`));
function draw(width, height, commands = [group]) {
  const canvas = new PixelCanvas(); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d'); context.fillStyle = '#0000ff'; context.fillRect(0, 0, 512, 512);
  renderer.render(commands, context, { x: 0, y: 0, density: 1, width, height, scratch }, 0);
  pixel(canvas, 4, 4, commands[0]?.children.length ? [.25, .25, .5, 1] : [0, 0, 1, 1]);
  if (width > 100) pixel(canvas, 100, 4, commands[0]?.children.length ? [.5, 0, .5, 1] : [0, 0, 1, 1]);
  if (width < 512) pixel(canvas, width, 4, [0, 0, 1, 1]);
  if (height < 512) pixel(canvas, 4, height, [0, 0, 1, 1]);
}

draw(512, 512);
assert.equal(scratch.length, 2, 'nested opacity uses exactly one scratch buffer per depth');
const warmResets = scratch.reduce((sum, canvas) => sum + canvas.resets, 0), warmCanvases = created.length;
for (let row = 0; row < 3; row++) for (const [width, height] of [[511, 511], [512, 511], [73, 511], [511, 37], [512, 37], [73, 37]]) draw(width, height);
assert.equal(scratch.reduce((sum, canvas) => sum + canvas.resets, 0), warmResets, 'warm edge and partial tiles must cause zero backing-store resets');
assert.equal(created.length, warmCanvases, 'warm tiles must allocate zero additional scratch canvases');
assert.ok(scratch.every(canvas => canvas.width <= 512 && canvas.height <= 512), 'scratch allocation stays bounded to the largest tile');
draw(73, 37, [{ kind: 'group', opacity: .5, children: [] }]);

// Read the actual shape/group construction path, including its transformed
// stroke/miter padding. The outer and inner opacity groups must preserve it.
const node = (tag, attributes = {}, children = [], overrides = {}) => ({ localName: tag, children, style: {}, getAttribute: name => attributes[name] == null ? null : String(attributes[name]), hasAttribute: name => attributes[name] != null, ...overrides });
const stroked = node('rect', { x: 10, y: 20, width: 30, height: 40 }, [], { style: { stroke: '#ffffff' }, getBBox: () => ({ x: 10, y: 20, width: 30, height: 40 }) });
const inner = node('g', {}, [stroked], { style: { opacity: '.5' } });
const outer = node('g', {}, [inner], { style: { opacity: '.5' }, transform: { baseVal: { numberOfItems: 1, getItem: () => ({ matrix: new Matrix([2, 0, 0, 3, 100, 200]) }) } } });
const parsed = renderer.readChildren({ children: [outer] }, new Matrix());
assert.deepEqual(parsed[0].bounds, { x: 80, y: 200, w: 140, h: 240 }, 'nested unions retain transformed conservative stroke and miter extent');
assert.deepEqual(parsed[0].children[0].bounds, parsed[0].bounds);
stroked.getBBox = () => { throw Error('unavailable bounds'); };
const unknown = renderer.readChildren({ children: [outer] }, new Matrix());
assert.equal(unknown[0].bounds, null); assert.equal(unknown[0].children[0].bounds, null, 'unknown descendant bounds must keep each ancestor unbounded');

const far = shape('#00ff00', 5000, 5000, 20, 20); far.bounds = { x: 5000, y: 5000, w: 20, h: 20 };
const offscreen = opacityGroup(.5, [opacityGroup(.5, [far])]);
const target = new PixelCanvas(); target.width = target.height = 512;
const context = target.getContext('2d'); context.fillStyle = '#0000ff'; context.fillRect(0, 0, 512, 512);
const beforeCull = { ...operations }, createdBeforeCull = created.length;
renderer.render([offscreen, opacityGroup(.5, [])], context, { x: 0, y: 0, density: 1, width: 512, height: 512, scratch }, 0);
assert.equal(operations.clears, beforeCull.clears, 'offscreen and empty groups must not clear scratch buffers');
assert.equal(operations.copies, beforeCull.copies, 'offscreen and empty groups must not composite full tiles');
assert.equal(created.length, createdBeforeCull); pixel(target, 4, 4, [0, 0, 1, 1]);
const unbounded = opacityGroup(.5, [shape('#ff0000', 0, 0, 800, 800), offscreen]);
assert.equal(unbounded.bounds, null);
renderer.render([unbounded], context, { x: 0, y: 0, density: 1, width: 512, height: 512, scratch }, 0);
pixel(target, 4, 4, [.5, 0, .5, 1]);
assert.equal(operations.copies, beforeCull.copies + 1, 'an unknown child remains drawable while its known offscreen sibling is culled');
const retained = [...scratch]; renderer.destroy();
assert.ok(retained.every(canvas => canvas.width === 0 && canvas.height === 0), 'destroy releases retained scratch backing stores');
console.log(JSON.stringify({ partialTileCases: 18, nestedOpacityGoldenColors: true, activeRectangleClipped: true, stalePixelsCleared: true, warmScratchResets: 0, warmScratchAllocations: 0, scratchBound: 512, offscreenGroupClears: 0, offscreenGroupCopies: 0, transformedStrokeBounds: true, unknownBoundsDraw: true, cleanup: true }));
