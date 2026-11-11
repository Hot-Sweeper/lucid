// Canvas robots (src/robot/render/canvas.ts): SVG transforms become the same matrices the
// browser would use, robot colors resolve through nested var() fallbacks, and the zoom switch
// can be turned off.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { transformWithOxc } from 'vite';

// A minimal 2D DOMMatrix, enough for the parser (Node has none).
class M {
  constructor(v) { [this.a, this.b, this.c, this.d, this.e, this.f] = v ?? [1, 0, 0, 1, 0, 0]; }
  multiplySelf(o) {
    const { a, b, c, d, e, f } = this;
    this.a = a * o.a + c * o.b; this.b = b * o.a + d * o.b;
    this.c = a * o.c + c * o.d; this.d = b * o.c + d * o.d;
    this.e = a * o.e + c * o.f + e; this.f = b * o.e + d * o.f + f;
    return this;
  }
  translateSelf(x, y) { return this.multiplySelf(new M([1, 0, 0, 1, x, y])); }
  scaleSelf(x, y = x) { return this.multiplySelf(new M([x, 0, 0, y, 0, 0])); }
  rotateSelf(deg) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return this.multiplySelf(new M([c, s, -s, c, 0, 0])); }
  skewXSelf(deg) { return this.multiplySelf(new M([1, 0, Math.tan(deg * Math.PI / 180), 1, 0, 0])); }
  skewYSelf(deg) { return this.multiplySelf(new M([1, Math.tan(deg * Math.PI / 180), 0, 1, 0, 0])); }
}
globalThis.DOMMatrix = M;

let source = await fs.readFile(new URL('../../src/robot/render/canvas.ts', import.meta.url), 'utf8');
source = source.replace(/^import .*$/gm, '').replace(/^/, 'const pixelRatioBucket = (x: number) => x; const LOD_PX = { icon: 190 }; const monitorPx = (s: number) => 276 * s;\n');
const { code } = await transformWithOxc(source, 'robot-canvas.ts');
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const near = (m, want) => ['a', 'b', 'c', 'd', 'e', 'f'].forEach((k, i) => assert.ok(Math.abs(m[k] - want[i]) < 1e-9, `${k}: ${m[k]} vs ${want[i]}`));
near(mod.svgMatrix('translate(10 20)'), [1, 0, 0, 1, 10, 20]);
near(mod.svgMatrix('translate(5)'), [1, 0, 0, 1, 5, 0]);
near(mod.svgMatrix('scale(2)'), [2, 0, 0, 2, 0, 0]);
near(mod.svgMatrix('rotate(90)'), [0, 1, -1, 0, 0, 0]);
// rotate around a point keeps that point fixed
const r = mod.svgMatrix('rotate(90 10 0)');
assert.ok(Math.abs(r.a * 10 + r.c * 0 + r.e - 10) < 1e-9 && Math.abs(r.b * 10 + r.d * 0 + r.f) < 1e-9, 'rotation centre stays put');
// the rig's own composite: translate, then rotate, then scale (applied right to left)
near(mod.svgMatrix('translate(3,4) rotate(0) scale(1.5)'), [1.5, 0, 0, 1.5, 3, 4]);
near(mod.svgMatrix('matrix(1 2 3 4 5 6)'), [1, 2, 3, 4, 5, 6]);
assert.equal(mod.svgMatrix(null), null);

const vars = { '--shell': '#ecdfcc', '--glow': '#ff9d6c', '--ear': '' };
const look = (n) => vars[n] ?? '';
assert.equal(mod.resolveVars('var(--shell)', look), '#ecdfcc');
assert.equal(mod.resolveVars('var(--ear, var(--glow))', look), '#ff9d6c', 'an empty variable falls back, through nested fallbacks');
assert.equal(mod.resolveVars('var(--missing, #123)', look), '#123');
assert.equal(mod.resolveVars('<rect fill="var(--shell)" stroke="var(--cap, var(--glow))"/>', look), '<rect fill="#ecdfcc" stroke="#ff9d6c"/>');

// Gradient parts are keyed by the robot's resolved defs: a theme, brand or look change draws a new
// head instead of reusing the first one (dark heads stayed on light bodies). Plain parts still share.
const head = '<rect fill="url(#r1-hs)"/>';
const lightDefs = '<linearGradient id="r1-hs"><stop stop-color="#c9d3e6"/></linearGradient>';
const darkDefs = '<linearGradient id="r1-hs"><stop stop-color="#121214"/></linearGradient>';
assert.notEqual(mod.pictureKey(head, lightDefs), mod.pictureKey(head, darkDefs));
assert.equal(mod.pictureKey(head, lightDefs), mod.pictureKey(head, lightDefs));
assert.equal(mod.pictureKey('<rect fill="#fff"/>', lightDefs), mod.pictureKey('<rect fill="#fff"/>', darkDefs));
const src = await fs.readFile(new URL('../../src/robot/render/canvas.ts', import.meta.url), 'utf8');
assert.ok(src.includes('addEventListener("lucid:interface-theme"') && src.includes('r.restyle()'), 'every canvas robot rebuilds on a theme change');
assert.equal(mod.canvasRobotsWanted(0.3), true, 'zoomed out (monitor shows only its icon): canvas');
assert.equal(mod.canvasRobotsWanted(1), false, 'close up: the real SVG');
console.log('PASS: canvas robots parse SVG transforms, resolve robot colors and switch by zoom');
