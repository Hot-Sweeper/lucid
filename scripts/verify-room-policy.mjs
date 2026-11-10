import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (name) => { const source = await transformWithOxc(await readFile(new URL(`../src/office/${name}.ts`, import.meta.url), 'utf8'), `${name}.ts`); return import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64')); };
const { hasOfficeWork, reserveRoomSeats, snakeSeat, projectRoomSeats, reorderPhysicalSeats, physicalSeatIndices, layoutMeeting, layoutWaitingSpots, layoutClearAt, layoutSafeAt, FOLDED_OFFICE } = await load('room-policy');
const { officePlan, hallRoute, inHall } = await load('floor-plan');
const { hasOfficeDesk } = await load('room-policy');
const settledWorker = { id: 'settled', runStatus: 'completed', settled: true };
assert.equal(hasOfficeDesk(settledWorker, 'settled'), false, 'opening settled history must not recreate a desk');
assert.equal(hasOfficeDesk({ ...settledWorker, runStatus: 'running' }), false, 'settled metadata wins over stale run state');
assert.equal(hasOfficeDesk({ ...settledWorker, pinned: true }), false, 'a pin alone does not designate a manager');
const manager = { ...settledWorker, pinned: true, manager: { projectId: 'project', role: 'Uploads' } };
assert.equal(hasOfficeDesk(manager), true, 'explicit persistent manager keeps its workstation');
// Collected work keeps its desk until removed; new work takes that desk first, and a desk
// taken over this way is never recreated.
assert.equal(hasOfficeDesk({ ...settledWorker, kept: true }), true, 'a kept desk stays after collection');
assert.equal(hasOfficeDesk({ ...settledWorker, kept: false }), false, 'removing it releases the desk');
{
  const keptDesk = { id: 'done', runStatus: 'completed', settled: true, kept: true };
  const busy = { id: 'busy', runStatus: 'running' }, newer = { id: 'next', runStatus: 'running', settled: false };
  assert.deepEqual(reserveRoomSeats(['busy', 'done'], [busy, keptDesk]), ['busy', 'done'], 'a kept desk holds its place');
  assert.deepEqual(reserveRoomSeats(['busy', 'done'], [busy, keptDesk, newer]), ['busy', 'next'], 'new work takes the kept desk instead of adding one');
  assert.deepEqual(reserveRoomSeats(['busy', 'next'], [busy, keptDesk, newer]), ['busy', 'next'], 'a kept desk that was taken is not recreated');
}
assert.equal(projectRoomSeats(['settled'], [settledWorker], false, 'settled').slots, 0);
assert.equal(projectRoomSeats(['settled'], [manager], false, null).slots, 1);
// Exercise the real held-floor slot loop: retiring a worker must remove its entire
// desk while retaining the floor and an adjacent active manager's exact position.
const worldSource = await readFile(new URL('../src/office/world.ts', import.meta.url), 'utf8');
const slotSource = worldSource.slice(worldSource.indexOf('    const slots: { key:'), worldSource.indexOf('    const wanted = new Set(slots'));
const slotCode = (await transformWithOxc(slotSource, 'slots.ts')).code;
const heldSlots = new Function('plans', 'rooms', 'columnsForRoom', 'SLOT_W', 'SLOT_H', 'WALL_FACE', 'hasOfficeDesk', 'snakeSeat', `${slotCode};return slots;`)(
  [{ id: 'p:project', slots: 2, threads: [settledWorker, { ...manager, id: 'manager' }] }],
  [{ x: 0, y: 0 }], () => 2, 400, 380, 80, hasOfficeDesk, snakeSeat);
assert.deepEqual(heldSlots.map(s => [s.key, s.t.id, s.x]), [['p:project#1', 'manager', 470]]);
const thread = (id, runStatus = null, question = null) => ({ id, runStatus, question, pinned: true, settled: false });
for (const status of ['running', 'queued', 'waiting', 'starting', 'preparing', 'pending', 'waiting_for_approval', 'awaiting-approval', 'Waiting For Input']) assert.equal(hasOfficeWork(thread('x', status)), true, status);
for (const status of [null, 'completed', 'complete', 'done', 'idle', 'interrupted', 'error', 'paused', 'cancelled']) assert.equal(hasOfficeWork(thread('x', status)), false, 'inactivity ignores pin/unsettled state: ' + status);
assert.equal(hasOfficeWork(thread('x', null, 'Permission needed')), true);
const ids = ['a', 'b', 'c', 'old'], all = ids.map((id) => thread(id));
const reservations = reserveRoomSeats(['old', null, 'b', 'a', 'b', 'c', null], ids);
assert.deepEqual(reservations, ['old', null, 'b', 'a', null, 'c', null]);
assert.deepEqual(reserveRoomSeats(reservations, [...ids].reverse()), reservations, 'refresh order preserves every reservation');
const snapshot = JSON.stringify(reservations);
let projection = projectRoomSeats(reservations, all, false, null, 10);
assert.deepEqual({ slots: projection.slots, collapsed: projection.collapsed, threads: projection.threads }, { slots: 6, collapsed: false, threads: [all[3], null, all[1], all[0], null, all[2]] }, 'idle unsettled sessions keep their workstations');
const working = all.map((t) => t.id === 'b' || t.id === 'c' ? { ...t, runStatus: 'running' } : t);
projection = projectRoomSeats(reservations, working, false, null, 10);
assert.deepEqual(projection.threads.map((t) => t?.id ?? null), ['old', null, 'b', 'a', null, 'c'], 'every desk stays at its own fixed place');
const onlyC = all.map((t) => t.id === 'c' ? { ...t, runStatus: 'running' } : t);
assert.equal(projectRoomSeats(reservations, onlyC, false, null).threads.findIndex((t) => t?.id === 'c'), 5, 'clearing an earlier desk never moves a later one');
assert.equal(JSON.stringify(reservations), snapshot, 'completion and folding never mutate saved assignments');
projection = projectRoomSeats(reservations, all, false, 'a');
assert.deepEqual(projection.threads.map((t) => t?.id ?? null), ['old', null, 'b', 'a', null, 'c'], 'opening an idle session leaves all reserved desks in place');
assert.equal(projectRoomSeats(reservations, all, true, null).slots, 6, 'manual empty expansion offers one deliberate free desk');
projection = projectRoomSeats(reservations, working, true, null, 1);
assert.deepEqual(projection.threads.map((t) => t?.id ?? null), ['old', null, 'b', 'a', null, 'c', null], 'manual capacity adds free desks after the last one');
// New work takes the first empty place, without displacing idle or active sessions.
const fresh = { id: 'new', runStatus: 'running', settled: false };
assert.deepEqual(reserveRoomSeats(['busy', 'quiet'], [{ id: 'busy', runStatus: 'running' }, { id: 'quiet', runStatus: null }, fresh]), ['busy', 'quiet', 'new']);
assert.deepEqual(reserveRoomSeats(['busy', null, 'later'], [{ id: 'busy', runStatus: 'running' }, { id: 'later', runStatus: 'running' }, fresh]), ['busy', 'new', 'later'], 'a hole is filled in place');
// Collecting settles the job, which clears the desk and releases the place.
assert.deepEqual(reserveRoomSeats(['done', 'busy'], [{ id: 'done', runStatus: 'completed', settled: true }, { id: 'busy', runStatus: 'running' }]), ['busy', null]);
assert.deepEqual(reserveRoomSeats(['boss'], [{ id: 'boss', runStatus: null, settled: true, pinned: true, manager: { projectId: 'p', role: 'Lead' } }]), ['boss'], 'managers keep their desk');
assert.deepEqual(reserveRoomSeats([], [{ id: 'history', runStatus: 'completed', settled: true }]), [], 'history never takes a place');
assert.deepEqual(reserveRoomSeats(['quiet', 'busy'], [{ id: 'quiet', runStatus: 'completed' }, { id: 'busy', runStatus: 'running' }]), ['quiet', 'busy'], 'only settlement releases an idle session workstation');
const reordered = reorderPhysicalSeats(reservations, [null, null, 'b'], ['b', null, null]);
assert.deepEqual(projectRoomSeats(reordered, working, false, null).threads.map((t) => t?.id ?? null), ['b', null, null, 'a', null, 'c'], 'dragging moves only the dragged desks');
assert.deepEqual(physicalSeatIndices(['old', 'a'], [null, null, null]), [0, 1, 2], 'physical desk k is reservation k');

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
  assert.equal(policy.slots, 7);  // newcomers fill from the front
}
// Settled work leaves no empty computer behind when an idle desk can take its place.
{
  const done = { id: 'done', runStatus: 'completed', settled: true }, quiet = { id: 'quiet', runStatus: 'completed' }, busy = { id: 'busy', runStatus: 'running' };
  assert.deepEqual(reserveRoomSeats(['busy', 'done', 'quiet'], [busy, done, quiet]), ['busy', 'quiet', null], 'the last idle desk moves into the gap');
  assert.deepEqual(reserveRoomSeats(['done', 'busy'], [done, busy]), ['busy', null], 'running work shifts forward with its workstation');
  const asking = { id: 'asking', runStatus: 'completed', question: 'Which one?' };
  assert.deepEqual(reserveRoomSeats(['done', 'asking'], [done, asking]), ['asking', null], 'a question moves with its existing workstation');
  const boss = { id: 'boss', runStatus: null, pinned: true, manager: { projectId: 'p', role: 'Lead' } };
  assert.deepEqual(reserveRoomSeats(['done', 'boss'], [done, boss]), ['boss', null], 'manager workstations participate in ordered compaction');
  assert.deepEqual(reserveRoomSeats(['done', 'hired'], [done, 'hired']), [null, 'hired'], 'a desk just reserved for a hire stays where it was promised');
  const q2 = { id: 'q2', runStatus: 'interrupted' };
  assert.deepEqual(reserveRoomSeats(['done', 'busy', 'quiet', 'q2'], [done, busy, quiet, q2]), ['busy', 'quiet', 'q2', null], 'later desks shift forward without reversing their order');
  assert.deepEqual(projectRoomSeats(reserveRoomSeats(['busy', 'done', 'quiet'], [busy, done, quiet]), [busy, quiet], false, null).slots, 2, 'the room shrinks once its gap is closed');
}
console.log(JSON.stringify({ ok: true, statuses: 20, statusTransitionRoutes: routes, durableSeats: reservations.length }));

// Exact rendezvous arrival must not hold safe hallway actors behind a delayed peer.
const oldFloor = {topH:800,size:{w:4000}}, newFloor = {topH:800,size:{w:3000}};
for (let i=0;i<36;i++) assert(layoutClearAt({x:100+i*76,y:875},oldFloor,newFloor));
assert(!layoutClearAt({x:100,y:810},oldFloor,newFloor), 'body still overlaps the old rooms');
assert(!layoutClearAt({x:3500,y:875},oldFloor,newFloor), 'old hallway is not surviving floor');
assert(!layoutClearAt({x:100,y:875},oldFloor,{topH:1000,size:{w:3000}}), 'no shared hallway during height change');
assert(layoutClearAt({x:4141,y:875},oldFloor,newFloor), 'outside both buildings is safe');
assert(!layoutClearAt({x:4020,y:875},oldFloor,newFloor), 'outside actor must clear the wall with its body');

// Folding one project office waits only for floor that actually changes. Robots in an
// unchanged room or in a hall that survives may stay put; nobody queues outside.
{
  const top = [{id:'queue',w:720,h:800},{id:'main',w:1380,h:980},{id:'break',w:1900,h:800}];
  const open = officePlan(top, [{id:'p:a',w:1380,h:980},{id:'p:b',w:1380,h:2580},{id:'freelance',w:1380,h:980}]);
  const folded = officePlan(top, [{id:'p:a',w:1380,h:980},{id:'p:b',...FOLDED_OFFICE},{id:'freelance',w:1380,h:980}]);
  const b = open.rooms.get('p:b'), brk = open.rooms.get('break'), a = open.rooms.get('p:a');
  assert(!layoutSafeAt({x:b.x+b.w/2,y:b.y+b.h/2},open,folded), 'robot inside the folding office holds the fold');
  assert(!layoutSafeAt({x:b.x+b.w/2,y:b.y-20},open,folded), 'robot body still at the folding door holds the fold');
  assert(layoutSafeAt({x:brk.x+brk.w/2,y:brk.y+brk.h/2},open,folded), 'robot in the unchanged break room never holds the fold');
  assert(layoutSafeAt({x:a.x+a.w/2,y:a.y+a.h/2},open,folded), 'robot at an unchanged desk never holds the fold');
  assert(layoutSafeAt({x:2200,y:open.hallY},open,folded), 'robot in the surviving entrance hall never holds the fold');
  assert(layoutSafeAt({x:2200,y:open.hallY},folded,open), 'robot in the surviving entrance hall never holds expansion');
  assert(!layoutSafeAt({x:b.x+b.w/2,y:b.y+b.h/2},folded,open), 'expansion waits for floor that becomes the office');
}

assert.deepEqual(projectRoomSeats(reservations, working, false, null, 0, true), {threads:[],slots:0,collapsed:true}, "explicit collapse hides desks without changing sessions or reservations");

// Every removal closes a continuous snake, including turns at both row ends.
for (const count of [1, 2, 3, 4, 5, 6, 7, 9, 12]) {
  const claims = Array.from({ length: count }, (_, i) => ({ id: `snake${i}`, runStatus: i % 2 ? 'running' : 'completed' }));
  for (let removed = 0; removed < count; removed++) {
    const before = claims.map(t => t.id), remaining = claims.filter((_, i) => i !== removed);
    const seats = reserveRoomSeats(before, remaining);
    assert.deepEqual(seats.filter(Boolean), remaining.map(t => t.id), 'removal preserves the order of every surviving session');
    assert.deepEqual(reserveRoomSeats(seats, [...remaining].reverse()), seats, 'poll ordering and reloads do not shuffle the snake');
    assert.equal(projectRoomSeats(seats, remaining, false, null).slots, Math.max(0, count - 1));
  }
}
assert.deepEqual(Array.from({ length: 9 }, (_, i) => snakeSeat(i, 3)), [
  { c: 0, row: 0 }, { c: 1, row: 0 }, { c: 2, row: 0 },
  { c: 2, row: 1 }, { c: 1, row: 1 }, { c: 0, row: 1 },
  { c: 0, row: 2 }, { c: 1, row: 2 }, { c: 2, row: 2 },
]);
for (const cols of [1, 2, 3]) for (let i = 1; i < 36; i++) {
  const a = snakeSeat(i - 1, cols), b = snakeSeat(i, cols);
  assert.equal(Math.abs(a.c - b.c) + Math.abs(a.row - b.row), 1, 'consecutive desks are adjacent, including row turns');
}
console.log('PASS: stable compaction after every desk removal, running sessions, reload order, partial rows and snake turns');
