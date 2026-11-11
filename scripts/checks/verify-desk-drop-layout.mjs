// A dropped desk stays where it was dropped: its reservation survives every later layout pass,
// refresh and restart, the user's move is promoted at once instead of waiting for robots walking
// elsewhere, and walkers on changed floor are carried along with their room or hall.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { worldSource } from './world-source.mjs';
const load = async (name) => { const source = await transformWithOxc(await readFile(new URL(`../../src/office/${name}.ts`, import.meta.url), 'utf8'), `${name}.ts`); return import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64')); };
const { reserveRoomSeats, projectRoomSeats, insertSeat, reorderPhysicalSeats } = await load('room-policy');
const { officePlan, carryPoint, inHall } = await load('floor-plan');

// Reservations: what the drop wrote is what every later pass (each refresh) and a restart
// (the saved JSON) give back.
const working = (id) => ({ id, runStatus: 'running' });
const threads = ['a', 'b', 'c', 'x'].map(working);
const settle = (seats, claims = threads) => { for (let i = 0; i < 5; i++) seats = reserveRoomSeats(JSON.parse(JSON.stringify(seats)), claims); return seats; };
assert.deepEqual(insertSeat(['a', 'b', 'c'], 'x', 1), ['a', 'x', 'b', 'c'], 'a drop goes in at the dropped-on place');
assert.deepEqual(insertSeat(['a', 'b', null], 'x', 9), ['a', 'b', 'x'], 'never beyond the next free place');
assert.deepEqual(insertSeat(['a', 'x', 'b'], 'x', 0), ['x', 'a', 'b'], 'a desk already in the office moves, it is not cloned');
assert.deepEqual(insertSeat(['a', null, null], 'x', 0), ['x', 'a', null], 'desks added by hand stay at the end');
assert.deepEqual(settle(insertSeat(['a', 'b', 'c'], 'x', 1)), ['a', 'x', 'b', 'c'], 'the dropped place survives every refresh');
const reordered = reorderPhysicalSeats(['a', 'b', 'c'], ['a', 'b', 'c'], ['c', 'a', 'b']);
assert.deepEqual(settle(reordered, threads.slice(0, 3)), ['c', 'a', 'b'], 'a same-room reorder survives every refresh');
assert.deepEqual(projectRoomSeats(settle(reordered, threads.slice(0, 3)), threads, true, null).threads.map(t => t.id), ['c', 'a', 'b'], 'and becomes the physical desk order');

// The layout pass: a forced pass (a drop or menu move) never holds the old floor, so the moved
// desk cannot slide back to its source while robots elsewhere finish walking.
const world = await worldSource();
const holdCode = world.slice(world.indexOf('    const indoorJourney ='), world.indexOf('    const classifiedRoom = new Map'));
const hold = new Function('forced', 'retiringIds', `${(await transformWithOxc(holdCode, 'hold.ts')).code}; return { wasHeld, holdPhysical };`);
const busy = { transit: new Map([['walker', { x: 10, y: 10 }]]), exits: new Map([['resting', { from: 'break' }]]), outside: () => false,
  hasLayout: true, physicalPlans: [{}], layoutParticipants: new Set(['walker']), physicalLayoutHeld: true };
assert.deepEqual(hold.call(busy, false, new Set(['moving'])), { wasHeld: true, holdPhysical: true }, 'automatic changes still wait for walkers');
assert.deepEqual(hold.call(busy, true, new Set(['moving'])), { wasHeld: false, holdPhysical: false }, 'a user move is promoted at once and ends any hold');
assert(world.includes('if (!forced && this.hasLayout && departingResidents.size) holdPhysical = true;'), 'departing residents never re-hold a forced pass');
const drag = world.slice(world.indexOf('  wireDeskDrag('), world.indexOf('  threadDropZone('));
assert(/if \(commit\) this\.forceLayout = true;/.test(drag), 'a committed drop forces its layout pass');
const place = world.slice(world.indexOf('  placeThread('), world.indexOf('\n  select('));
assert(place.indexOf('this.forceLayout = true') >= 0 && place.indexOf('this.forceLayout = true') < place.indexOf('this.update('), 'placeThread forces the pass it runs');

// Carrying walkers: Main office grows by a row, which moves the entrance hall and every office
// below it. Robots move with the room or hall strip they were on and stay on real floor.
const top = (mainH) => [{ id: 'queue', w: 720, h: 800 }, { id: 'main', w: 1380, h: mainH }, { id: 'break', w: 1900, h: 800 }];
const offices = [{ id: 'p:a', w: 540, h: 580 }, { id: 'freelance', w: 1380, h: 980 }];
const before = officePlan(top(580), offices), after = officePlan(top(980), offices);
assert.notEqual(before.topH, after.topH, 'the fixture really moves the hall');
const fr0 = before.rooms.get('freelance'), fr1 = after.rooms.get('freelance');
assert.deepEqual(carryPoint({ x: fr0.x + 300, y: fr0.y + 400 }, before, after), { x: fr1.x + 300, y: fr1.y + 400 }, 'a robot in a moved office moves with it');
const hall0 = before.halls[0], hall1 = after.halls[0];
const inHallPoint = carryPoint({ x: 3000, y: hall0.y + 75 }, before, after);
assert.deepEqual(inHallPoint, { x: 3000, y: hall1.y + 75 }, 'a robot in the entrance hall moves with the hall');
assert(inHall(after, inHallPoint), 'and stands on hall floor');
const main0 = before.rooms.get('main'), main1 = after.rooms.get('main');
const q = carryPoint({ x: main0.x + 100, y: main0.y + main0.h - 5 }, before, after);
assert(q.x >= main1.x && q.x <= main1.x + main1.w && q.y >= main1.y && q.y <= main1.y + main1.h, 'a robot in the resized office stays inside it');
const shrunk = carryPoint({ x: main1.x + 100, y: main1.y + main1.h - 5 }, after, before);
assert(shrunk.y <= main0.y + main0.h - 30, 'a shrinking office keeps its robots inside its walls');
assert.deepEqual(carryPoint({ x: before.size.w + 400, y: 50 }, before, after), { x: before.size.w + 400, y: 50 }, 'outdoors is unchanged');
for (const spine of before.halls.filter(h => h.axis === 'y')) {
  const p = carryPoint({ x: spine.x + spine.w / 2, y: spine.y + spine.h - 10 }, before, after);
  assert(inHall(after, p), 'a robot in a column spine stays on hall floor');
}
console.log('PASS: dropped places and reorders survive refreshes and restarts; user moves are promoted at once; walkers are carried with their floor');
