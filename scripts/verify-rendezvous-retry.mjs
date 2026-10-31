// CPU regression for the actual World navigation methods. No Electron or DOM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const world = await readFile(new URL('../src/office/world.ts', import.meta.url), 'utf8');
const method = (start, end) => {
  const a = world.indexOf(start), b = world.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'World method extraction markers remain valid');
  return world.slice(a, b);
};
const navigation = await transformWithOxc(await readFile(new URL('../src/office/navigation.ts', import.meta.url), 'utf8'), 'navigation.ts');
const { furniturePath } = await import('data:text/javascript;base64,' + Buffer.from(navigation.code).toString('base64'));
const source = `
  const gsap={killTweensOf(){}};
  const whenFree=w=>globalThis.__rendezvousAudit.whenFree(w);
  const pause=seconds=>new Promise(resolve=>setTimeout(resolve,seconds*1000));
  const furniturePath=(...args)=>globalThis.__rendezvousAudit.furniturePath(...args);
  const IN_FRONT=300000;
  export class AuditWorld {
    ${method('  private async walkLegs(', '  private furniture(')}
    ${method('  private async travel(', '  private handOver(')}
    ${method('  private reconcilePhysicalLayout(', '  // A robot only changes rooms once')}
  }
`;
const transformed = await transformWithOxc(source, 'audit-world.ts');
const { AuditWorld } = await import('data:text/javascript;base64,' + Buffer.from(transformed.code).toString('base64'));

async function verify(dragged) {
  const world = new AuditWorld(), id = 'blocked-trip', start = { x: 40, y: 140 }, target = { x: 300, y: 140 };
  let blocked = true, held = dragged, release;
  const free = new Promise((resolve) => { release = resolve; });
  let routes = 0, updates = 0, walks = 0, timerRan = false, frameTurns = 0, tripStarts = 0, firstTrip, destroyed = 0, arrived = 0;
  let beforeRelease;
  const deskLayer = {}, parkLayer = {};
  const walker = {
    ...start, el: { style: {}, parentElement: deskLayer }, zBias: 0,
    stop() {},
    async walkPath(points) {
      assert.equal(blocked, false, 'blocked aisle never becomes a direct walking shortcut');
      assert.equal(world.transit.get(id), walker, 'the original walker owns the resumed route');
      assert.equal(world.trips.get(id), firstTrip, 'the original trip owns the resumed route');
      walks++;
      Object.assign(this, points.at(-1));
    },
    destroy() { assert.equal(world.transit.get(id), walker); destroyed++; },
  };
  world.trips = new Map();
  const setTrip = world.trips.set.bind(world.trips);
  world.trips.set = (id, trip) => { firstTrip ??= trip; tripStarts++; return setTrip(id, trip); };
  world.transit = new Map([[id, walker]]);
  world.wakeRoutes = () => {};
  world.layoutRevision = 1;
  world.physicalLayoutHeld = true;
  world.layoutUpdateQueued = false;
  world.lastData = {};
  world.deskDragActive = false;
  world.slidingDesks = new Set();
  world.park = { layer: parkLayer };
  world.outside = () => false;
  world.rooms = [{ id: 'source', kind: 'project', x: 0, y: 0, w: 400, h: 400 }];
  world.furniture = () => blocked ? [{ x: 80, y: -20, w: 140, h: 460 }] : [];
  world.walkBounds = () => ({ x: 0, y: 0, w: 400, h: 400 });
  world.spawn = () => { throw Error('Retry must never replace the walker'); };
  world.route = () => {
    // Bound the old regression so a broken implementation fails this test rather
    // than starving the test process forever with its uncapped microtask loop.
    if (++routes > 25) throw Error('Rendezvous retries starved the event loop');
    return { pts: [target], desk: null, deskAt: null, blocked: false, revision: world.layoutRevision, rendezvous: world.physicalLayoutHeld };
  };
  world.update = () => {
    updates++;
    assert.deepEqual({ x: walker.x, y: walker.y }, target, 'only an actual checkpoint arrival reconciles layout');
    assert.equal(world.transit.get(id), walker);
    assert.equal(world.trips.get(id), firstTrip);
    world.physicalLayoutHeld = false;
    world.layoutRevision++;
  };
  world.waitForRoute = () => { throw Error('A blocked leg must yield, not wait for a checkpoint it has not reached'); };
  world.roomById = () => ({ x: 0, y: 0 });
  world.ext = { break: { enterFrom(threadId, point) { assert.equal(threadId, id); assert.deepEqual(point, target); arrived++; } } };
  world.pushExt = () => {};
  globalThis.__rendezvousAudit = { furniturePath, whenFree: async (w) => { assert.equal(w, walker); if (held) await free; } };
  const timer = setTimeout(() => { timerRan = true; }, 0);
  const frames = setInterval(() => { frameTurns++; }, 16);
  const unblock = setTimeout(() => {
    beforeRelease = { updates, routes, timerRan, frameTurns, x: walker.x, y: walker.y };
    blocked = false; held = false; release();
  }, 160);
  try {
    await world.travel({ id }, { walker }, 'break');
    assert.ok(beforeRelease?.timerRan && beforeRelease.frameTurns > 0, 'timer and frame-like callbacks run while navigation is blocked');
    assert.equal(beforeRelease.updates, 0, 'failed legs do not repeatedly update the world');
    assert.ok(beforeRelease.routes <= 4 && routes <= 8, 'blocked retries are bounded by the macrotask backoff');
    assert.deepEqual({ x: beforeRelease.x, y: beforeRelease.y }, start, 'blocked/held actor stays at its physical position');
    assert.equal(updates, 1, 'one completed checkpoint performs one layout reconciliation');
    assert.equal(tripStarts, 1, 'unblocking or releasing never starts a replacement trip');
    assert.equal(walks, 2, 'same walker reaches the checkpoint and finishes its destination');
    assert.equal(destroyed, 1);
    assert.equal(arrived, 1);
    assert.equal(world.transit.has(id), false);
    return { dragged, routes, updates, frameTurns, tripStarts };
  } finally { clearTimeout(timer); clearInterval(frames); clearTimeout(unblock); delete globalThis.__rendezvousAudit; }
}

const results = [await verify(false), await verify(true)];
console.log(JSON.stringify({ ok: true, methods: ['World.travel', 'World.walkLegs', 'World.reconcilePhysicalLayout'], results }));
