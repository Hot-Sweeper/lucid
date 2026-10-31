// Pure geometry checks. No app, user settings, or external service is started.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await transformWithOxc(await readFile(new URL('../src/office/floor-plan.ts', import.meta.url), 'utf8'), 'floor-plan.ts');
const { officePlan, hallRoute, inHall } = await import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64'));
const top = [{ id: 'queue', w: 720, h: 800 }, { id: 'main', w: 1380, h: 580 }, { id: 'break', w: 1900, h: 800 }];
const offices = Array.from({ length: 12 }, (_, i) => ({ id: i === 11 ? 'freelance' : `p:${String(i).padStart(2, '0')}`, w: i === 4 || i === 9 ? 1380 : 960, h: i === 9 ? 1780 : i === 4 ? 980 : 580 }));
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const portal = (plan, id) => { const r = plan.rooms.get(id); return id === 'queue' || id === 'main' || id === 'break' ? { x: r.x + r.w / 2, y: r.y + r.h + 34 } : { x: r.x + r.w - 46, y: r.y - 34 }; };
let legs = 0;
function checkRoute(plan, from, to) {
  const route = hallRoute(plan, from, to);
  assert.ok(route, 'connected corridor route exists');
  let p = from;
  for (const q of route) {
    assert.ok(p.x === q.x || p.y === q.y, 'every corridor leg is orthogonal');
    const vertical = p.x === q.x, lo = Math.min(vertical ? p.y : p.x, vertical ? q.y : q.x), hi = Math.max(vertical ? p.y : p.x, vertical ? q.y : q.x);
    const intervals = plan.halls.filter((r) => vertical ? p.x >= r.x && p.x <= r.x + r.w : p.y >= r.y && p.y <= r.y + r.h)
      .map((r) => vertical ? [r.y, r.y + r.h] : [r.x, r.x + r.w]).sort((a, b) => a[0] - b[0]);
    let reached = lo;
    for (const [a, b] of intervals) if (a <= reached && b >= reached) reached = b;
    assert.ok(reached >= hi, 'the complete continuous segment is covered by real hall floor');
    for (const r of plan.rooms.values()) assert.equal(vertical ? p.x > r.x && p.x < r.x + r.w && hi > r.y && lo < r.y + r.h : p.y > r.y && p.y < r.y + r.h && hi > r.x && lo < r.x + r.w, false, 'hallway never crosses a room interior');
    legs++; p = q;
  }
  assert.deepEqual(p, to);
}
function verify(plan) {
  const rooms = [...plan.rooms.values()];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) assert.equal(overlaps(rooms[i], rooms[j]), false, 'rooms do not overlap');
  for (const hall of plan.halls) for (const r of rooms) assert.equal(overlaps(hall, r), false, 'hall floor never occupies an office');
  const doors = [...plan.rooms.keys()].map((id) => portal(plan, id));
  const entrance = { x: plan.size.w - 6, y: plan.hallY };
  for (const a of [...doors, entrance]) for (const b of [...doors, entrance]) checkRoute(plan, a, b);
}
const plan = officePlan(top, offices);
verify(plan);
assert.deepEqual(officePlan(top, offices), plan, 'same room order produces identical geometry');
assert.ok(plan.size.w <= 4590 && plan.size.h <= 5100, 'all eleven projects and freelancers fit a compact building at full desk scale');
for (const room of [...top, ...offices]) { const r = plan.rooms.get(room.id); assert.equal(r.w, room.w); assert.equal(r.h, room.h); }
const grown = officePlan(top, offices.map((r) => r.id === 'p:00' ? { ...r, w: 1380, h: 2180 } : r));
verify(grown);
for (const r of offices) assert.equal(grown.rooms.get(r.id).x >= 0, true);
// A resize interrupts an old journey at its actual position. Points still on hall
// floor acquire a new safe route. Covered points have no hallway shortcut at all.
const oldRoute = hallRoute(plan, portal(plan, 'p:09'), portal(plan, 'p:01'));
let current = portal(plan, 'p:09'), resumed = 0, blocked = 0;
for (const next of oldRoute) {
  for (let i = 0; i <= 8; i++) {
    const p = { x: current.x + (next.x - current.x) * i / 8, y: current.y + (next.y - current.y) * i / 8 };
    if (inHall(grown, p)) { checkRoute(grown, p, portal(grown, 'p:01')); resumed++; }
    else { assert.equal(hallRoute(grown, p, portal(grown, 'p:01')), null); blocked++; }
  }
  current = next;
}
assert.ok(resumed && blocked, 'growth covers both safe replanning and refusal of stale shortcuts');
verify(officePlan(top, []));
verify(officePlan(top, offices.slice(0, 1)));
console.log(JSON.stringify({ ok: true, rooms: plan.rooms.size, building: plan.size, checkedLegs: legs, growth: { resumed, blocked } }));
