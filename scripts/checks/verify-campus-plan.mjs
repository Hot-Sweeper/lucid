import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const compiled = await transformWithOxc(await readFile('src/office/campus-plan.ts', 'utf8'), 'campus-plan.ts');
const { campusPlan, districtPlan } = await import('data:text/javascript;base64,' + Buffer.from(compiled.code).toString('base64'));
const park = { w: 2340, h: 1872 };
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
let checked = 0;
for (const count of [0, 1, 2, 3, 6, 12, 25]) {
  const buildings = Array.from({ length: count }, (_, i) => ({ id: `pc-${i}`, w: 1500 + i % 4 * 900, h: 800 + i % 5 * 700, entranceY: 600 + i % 3 * 350 }));
  const result = campusPlan(buildings, park);
  assert.deepEqual(result, campusPlan(buildings, park), 'stable geometry independent of camera and panel widths');
  assert.equal(result.districts.size, count);
  const districts = [...result.districts.values()];
  for (let i = 0; i < districts.length; i++) {
    const d = districts[i], b = buildings[i];
    assert.equal(d.building.w, b.w); assert.equal(d.building.h, b.h);
    assert.equal(d.park.x - (d.building.x + b.w), 180, 'park beside its own entrance');
    assert.equal(d.park.w, park.w); assert.equal(d.park.h, park.h);
    assert(d.park.y <= d.building.y + b.entranceY && d.park.y + park.h >= d.building.y + b.entranceY, 'entrance aligns with park');
    for (const a of [d.building, d.park]) {
      assert(a.x >= 0 && a.y >= 0 && a.x + a.w <= result.bounds.w && a.y + a.h <= result.bounds.h, 'overview contains every destination');
      for (const other of [d.building, d.park]) if (a !== other) assert(!overlaps(a, other));
    }
    for (const other of districts.slice(i + 1)) assert(!overlaps(d.bounds, other.bounds), 'districts and routes have separate footprints');
    checked++;
  }
  if (count >= 6) {
    const horizontalWidth = districts.reduce((sum, d) => sum + d.bounds.w + 180, -180);
    const horizontalHeight = Math.max(...districts.map(d => d.bounds.h));
    assert(Math.max(result.bounds.w / 1.6, result.bounds.h) < Math.max(horizontalWidth / 1.6, horizontalHeight), 'wrapping increases fitted overview scale');
    assert(new Set(districts.map(d => d.building.y)).size > 1, 'large campuses wrap into rows');
  }
}
const small = { id: 'small', w: 1500, h: 800, entranceY: 600 };
assert.deepEqual(districtPlan(small, park), campusPlan([small, { id: 'huge', w: 9000, h: 18000, entranceY: 900 }], park).districts.get('small'), 'another building height never pushes local park away');
console.log(`Campus geometry passed: ${checked} districts, stable placement, adjacency, artwork scale, clear footprints, complete overview and row packing.`);

const mixed = campusPlan([small, {...small,id:'preview',outdoors:false}],park);
assert.equal(mixed.districts.get('preview').bounds.w, small.w, 'connected previews reserve only visible buildings');
assert.equal(mixed.districts.get('preview').bounds.h, small.h);
