import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (name) => { const src = await transformWithOxc(await readFile(new URL(`../../src/office/${name}.ts`, import.meta.url), 'utf8'), `${name}.ts`); return import('data:text/javascript;base64,' + Buffer.from(src.code).toString('base64')); };
const { buildingFootprint, footprintCovers } = await load('building-footprint');
const { officePlan } = await load('floor-plan');
let samples = 0;
function verify(rects) {
  const footprint = buildingFootprint(rects);
  const rings = [...footprint.path.matchAll(/M([^Z]+)Z/g)].map((m) => m[1].split('L').map((p) => p.split(' ').map(Number)));
  const pathInside = (x, y) => {
    let winding = 0;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (a[0] !== b[0] && a[1] !== b[1]) assert.fail('footprint boundary must be orthogonal');
      if (a[0] > x && b[0] > x) { if (a[1] <= y && b[1] > y) winding++; if (b[1] <= y && a[1] > y) winding--; }
    }
    return winding !== 0;
  };
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b), ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  let expectedArea = 0, courtyard = null;
  for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) {
    const x = (xs[i - 1] + xs[i]) / 2, y = (ys[j - 1] + ys[j]) / 2;
    const expected = rects.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
    assert.equal(pathInside(x, y), expected, 'SVG union path covers exactly the occupied rooms and halls');
    assert.equal(footprintCovers(footprint, { x: x - 0.1, y: y - 0.1, w: 0.2, h: 0.2 }), expected, 'indoor culling agrees with actual occupied footprint');
    if (expected) expectedArea += (xs[i] - xs[i - 1]) * (ys[j] - ys[j - 1]);
    else courtyard ??= { x, y };
    samples++;
  }
  for (let i = 0; i < footprint.cells.length; i++) for (let j = i + 1; j < footprint.cells.length; j++) {
    const a = footprint.cells[i], b = footprint.cells[j];
    assert.equal(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y, false, 'cached coverage cells are disjoint');
  }
  const area = footprint.cells.reduce((n, r) => n + r.w * r.h, 0);
  const pathArea = rings.reduce((total, ring) => total + ring.reduce((n, a, i) => { const b = ring[(i + 1) % ring.length]; return n + a[0] * b[1] - b[0] * a[1]; }, 0) / 2, 0);
  assert.equal(area, expectedArea, 'cached cells preserve union area');
  assert.equal(pathArea, expectedArea, 'outer and courtyard ring windings preserve exact area');
  for (const r of rects) assert.equal(footprintCovers(footprint, r), true, 'every occupied room and corridor is fully indoors');
  return { footprint, area, courtyard };
}
verify([{ x: 0, y: 0, w: 10, h: 10 }]);
verify([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }]);
verify([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 10, h: 10 }]);
verify([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 }]);
verify([{ x: 0, y: 0, w: 30, h: 10 }, { x: 0, y: 20, w: 30, h: 10 }, { x: 0, y: 0, w: 10, h: 30 }, { x: 20, y: 0, w: 10, h: 30 }]);
assert.equal(footprintCovers(buildingFootprint([]), { x: 0, y: 0, w: 10, h: 10 }), false);
const top = [{ id: 'queue', w: 720, h: 800 }, { id: 'main', w: 1380, h: 580 }, { id: 'break', w: 1900, h: 800 }];
const offices = Array.from({ length: 12 }, (_, i) => ({ id: `p:${i}`, w: i === 4 || i === 9 ? 1380 : 960, h: i === 9 ? 1780 : i === 4 ? 980 : 580 }));
const plan = officePlan(top, offices), result = verify([...plan.rooms.values(), ...plan.halls]);
assert.ok(result.courtyard, 'uneven room columns leave honest outdoor courtyard space');
assert.equal(footprintCovers(result.footprint, { x: 0, y: 0, ...plan.size }), false, 'a bounding rectangle containing courtyards is never treated as entirely indoors');
console.log(JSON.stringify({ ok: true, samples, coveredArea: result.area, boundingArea: plan.size.w * plan.size.h, courtyard: result.courtyard, outlineRings: [...result.footprint.path.matchAll(/M/g)].length, coverageCells: result.footprint.cells.length }));
