// Landscape layout: deterministic, and woodland never covers buildings, walks or robot routes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (file, swap = s => s) => 'data:text/javascript;base64,' + Buffer.from(swap((await transformWithOxc(await readFile(file, 'utf8'), file)).code)).toString('base64');
const themes = await load('src/themes/registry.ts', s => s.replace(/^import ["'].*\.css["'];?$/gm, ''));
const art = await load('src/office/outdoor-art.ts', s => s.replace(/from\s*["']\.\.\/themes\/registry["']/, `from "${themes}"`));
const { planLandscape } = await import(await load('src/office/landscape.ts', s => s.replace(/from\s*["']\.\/outdoor-art["']/, `from "${art}"`)));
const building = { x: 0, y: 0, w: 2600, h: 1300 }, park = { x: 2850, y: 0, w: 1300, h: 1000 }, neighbor = { x: 0, y: 1700, w: 2600, h: 1300 };
const areas = [building, park, neighbor];
const paved = [[[2600, 300], [2664, 300], [2664, 500], [3500, 500]]];
const routes = [{ x: 2560, y: 210, w: 1500, h: 220 }];
const input = { bounds: { x: -1000, y: -1000, w: 6200, h: 5000 }, areas, parks: [park], paved, routes };
const a = planLandscape(input), b = planLandscape(structuredClone(input));
assert.deepEqual(a.trees.map(t => [t.x, t.y, t.r, t.kind]), b.trees.map(t => [t.x, t.y, t.r, t.kind]), 'same geometry gives the same woodland');
assert(a.trees.length > 300, `woodland is dense enough (${a.trees.length})`);
assert(a.trails.length >= 2 && a.lamps.length >= 1 && a.stream && a.bridges.length >= 1, 'trail, lamp, creek and footbridge exist');
for (const t of a.trees) for (const g of a.bridges) assert(Math.hypot(t.x - g.x, t.y - g.y) > 60, 'bridge kept clear');
const inside = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
for (const t of a.trees) {
  for (const r of areas) assert(!inside(t.x, t.y, r, t.r * 0.6), `tree trunk clear of ${JSON.stringify(r)}`);
  for (const r of routes) assert(!inside(t.x, t.y, r, t.r * 0.5), 'tree clear of robot route');
}
for (const p of a.props) for (const r of areas) assert(!inside(p.x, p.y, r), 'undergrowth stays off buildings');
for (const [x, y] of a.lamps) for (const r of areas) assert(!inside(x, y, r), 'lamps stand outside buildings');
console.log(`Landscape: ${a.trees.length} trees, ${a.props.length} props, ${a.lamps.length} lamps; deterministic and clear of buildings and routes.`);
