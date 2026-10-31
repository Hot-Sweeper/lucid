import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (name) => { const source = await transformWithOxc(await readFile(new URL(`../src/office/${name}.ts`, import.meta.url), 'utf8'), `${name}.ts`); return import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64')); };
const { hasOfficeWork, reserveRoomSeats, projectRoomSeats, reorderPhysicalSeats, physicalSeatIndices, layoutMeeting, layoutWaitingSpots, FOLDED_OFFICE } = await load('room-policy');
const { officePlan, hallRoute, inHall } = await load('floor-plan');
const thread = (id, runStatus = null, question = null) => ({ id, runStatus, question, pinned: true, settled: false });
for (const status of ['running', 'queued', 'waiting', 'starting', 'preparing', 'pending', 'waiting_for_approval', 'awaiting-approval', 'Waiting For Input']) assert.equal(hasOfficeWork(thread('x', status)), true, status);
for (const status of [null, 'completed', 'complete', 'done', 'idle', 'interrupted', 'error', 'paused', 'cancelled']) assert.equal(hasOfficeWork(thread('x', status)), false, 'inactivity ignores pin/unsettled state: ' + status);
assert.equal(hasOfficeWork(thread('x', null, 'Permission needed')), true);
const ids = ['a', 'b', 'c', 'old'], all = ids.map((id) => thread(id));
const reservations = reserveRoomSeats(['old', null, 'b', 'a', 'b', 'c', null], ids);
assert.deepEqual(reservations, ['old', null, 'b', 'a', null, 'c', null]);
assert.deepEqual(reserveRoomSeats(reservations, [...ids].reverse()), reservations, 'refresh order preserves every historical reservation');
const snapshot = JSON.stringify(reservations);
let projection = projectRoomSeats(reservations, all, false, null, 10);
assert.deepEqual({ slots: projection.slots, collapsed: projection.collapsed, threads: projection.threads }, { slots: 0, collapsed: true, threads: [] }, 'quiet offices instantiate no reserved/free desks');
const working = all.map((t) => t.id === 'b' || t.id === 'c' ? { ...t, runStatus: 'running' } : t);
projection = projectRoomSeats(reservations, working, false, null, 10);
assert.equal(projection.slots, 2, 'automatic physical desks equal active work, regardless of historical free capacity');
assert.deepEqual(projection.threads.map((t) => t?.id), ['b', 'c']);
assert.equal(projectRoomSeats(reservations, all, false, null).collapsed, true, 'complete transition folds again');
assert.equal(JSON.stringify(reservations), snapshot, 'completion and folding never mutate saved assignments');
assert.deepEqual(projectRoomSeats(reservations, working, false, null).threads.map((t) => t?.id), ['b', 'c'], 'reactivation returns to stable reservation order');
projection = projectRoomSeats(reservations, all, false, 'a');
assert.deepEqual(projection.threads.map((t) => t?.id), ['a'], 'selection opens exactly one historical desk');
assert.equal(projectRoomSeats(reservations, all, true, null).slots, 1, 'manual empty expansion offers one deliberate free desk');
projection = projectRoomSeats(reservations, working, true, null, 1);
assert.deepEqual(projection.threads.map((t) => t?.id ?? null), [null, 'b', 'c'], 'manual capacity retains a deliberate free-seat position');
const reordered = reorderPhysicalSeats(reservations, [null, 'b', 'c'], ['c', null, 'b']);
assert.equal(reordered.indexOf('old'), reservations.indexOf('old'));
assert.equal(reordered.indexOf('a'), reservations.indexOf('a'));
assert.deepEqual(projectRoomSeats(reordered, working, true, null, 1).threads.map((t) => t?.id ?? null), ['c', null, 'b'], 'desk reorder preserves inactive reservations and deliberate free slots');
assert.deepEqual(physicalSeatIndices(['old', 'a'], [null]), [2], 'new free capacity maps after durable historical reservations');
assert.deepEqual(reorderPhysicalSeats(['old', 'a'], [null], [null]), ['old', 'a', null]);

let routes = 0;
const previousFloor = officePlan([{ id: 'main', w: 1380, h: 800 }], [{ id: 'a', w: 960, h: 580 }]);
for (const topH of [180, 800, 840, 980, 2180]) for (const width of [420, 1380, 4590]) {
  const nextFloor = officePlan([{ id: 'main', w: width, h: topH }], [{ id: 'a', ...FOLDED_OFFICE }]);
  const point = layoutMeeting(previousFloor, nextFloor);
  for (const count of [3, 12, 80]) {
    const ids = Array.from({length:count}, (_,i)=>'robot'+i);
    const spots = layoutWaitingSpots(previousFloor, nextFloor, ids);
    assert.deepEqual([...spots], [...layoutWaitingSpots(previousFloor, nextFloor, [...ids].reverse())], 'refresh order preserves waiting places');
    for (const [id, a] of spots) {
      if (!a.outside) assert(inHall(previousFloor,a) && inHall(nextFloor,a), 'waiting spot survives both floor plans');
      else assert(a.x > Math.max(previousFloor.size.w,nextFloor.size.w), 'overflow waits beyond both buildings');
      for (const [other,b] of spots) if (id!==other) assert(Math.hypot(a.x-b.x,a.y-b.y)>=76, 'waiting robots never share a spot');
    }
  }
  if (point.outside) {
    assert.ok(point.x > previousFloor.size.w + 100 && point.x > nextFloor.size.w + 100, 'fallback meeting is outside both current and future walls');
    assert.equal(point.y, previousFloor.hallY, 'outdoor meeting follows the old entrance path');
  } else {
    assert.ok(inHall(previousFloor, point) && inHall(nextFloor, point), 'shared meeting is real hallway floor in both layouts');
    for (const plan of [previousFloor, nextFloor]) for (const r of plan.rooms.values()) assert.equal(point.x > r.x && point.x < r.x + r.w && point.y > r.y && point.y < r.y + r.h, false, 'new walls never cover a standing meeting participant');
  }
}
for (const active of [0, 1, 7]) {
  const roomThreads = Array.from({ length: 7 }, (_, i) => thread(`t${i}`, i < active ? 'running' : null));
  const seats = reserveRoomSeats([], roomThreads.map((t) => t.id));
  const policy = projectRoomSeats(seats, roomThreads, false, null);
  const size = policy.collapsed ? FOLDED_OFFICE : { w: 120 + 420 * Math.min(3, policy.slots), h: 180 + 400 * Math.ceil(policy.slots / 3) };
  const top = [{ id: 'queue', w: 720, h: 800 }, { id: 'main', ...FOLDED_OFFICE }, { id: 'break', w: 1900, h: 800 }];
  const bottom = Array.from({ length: 11 }, (_, i) => ({ id: `p:${i}`, ...(i === 4 ? size : FOLDED_OFFICE) }));
  const plan = officePlan(top, bottom);
  const doors = bottom.map((r) => { const p = plan.rooms.get(r.id); return { x: p.x + p.w - 46, y: p.y - 34 }; });
  for (const a of doors) for (const b of doors) {
    const path = hallRoute(plan, a, b); assert.ok(path, 'folded/active doors remain connected');
    let p = a;
    for (const q of path) {
      assert.ok(p.x === q.x || p.y === q.y);
      for (let k = 0; k <= 12; k++) assert.equal(inHall(plan, { x: p.x + (q.x - p.x) * k / 12, y: p.y + (q.y - p.y) * k / 12 }), true, 'status-transition route stays on physical hallway');
      p = q;
    }
    routes++;
  }
  assert.equal(policy.slots, active);
}
console.log(JSON.stringify({ ok: true, statuses: 20, statusTransitionRoutes: routes, durableSeats: reservations.length }));
