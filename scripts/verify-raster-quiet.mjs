import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const code = (await transformWithOxc(await readFile(new URL('../src/perf/raster-quiet.ts', import.meta.url), 'utf8'), 'raster-quiet.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
let now = 0, serial = 0, callbacks = 0;
const timers = new Map();
const Gate = new Function('performance', 'setTimeout', 'clearTimeout', `${code};return RasterQuietGate`)(
  { now: () => now }, (callback, delay) => { const id = ++serial; timers.set(id, { callback, due: now + delay }); return id; }, id => timers.delete(id));
const advance = async ms => {
  now += ms;
  for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); callbacks++; timer.callback(); }
  await Promise.resolve();
};
const gate = new Gate(); gate.changed();
let ready = null;
const job = gate.wait(() => true).then(value => { ready = value; });
for (let i = 0; i < 100; i++) {
  await advance(8); gate.changed();
  assert.equal(ready, null, 'Continuous camera input cannot start scratch drawing/readback');
  assert.equal(timers.size, 1, 'Input cannot allocate a timer per event');
}
assert.ok(callbacks <= 7, 'The gate sleeps between quiet deadlines instead of polling every frame');
await advance(119); assert.equal(ready, null);
await advance(1); await job; assert.equal(ready, true); assert.equal(timers.size, 0);

gate.changed(); let visible = true;
const hidden = gate.wait(() => visible);
visible = false; gate.prune();
assert.equal(await hidden, false); assert.equal(timers.size, 0, 'Hiding cancels its owned timer immediately');
visible = true; const resumed = gate.wait(() => visible);
assert.equal(timers.size, 1); await advance(120); assert.equal(await resumed, true);

gate.changed(); let alive = true;
const obsolete = gate.wait(() => alive), survivor = gate.wait(() => true);
alive = false; gate.prune(); assert.equal(await obsolete, false);
assert.equal(timers.size, 1, 'An obsolete owner cannot cancel another valid owner');
gate.cancel(); assert.equal(await survivor, false); assert.equal(timers.size, 0);
await advance(1000); assert.equal(timers.size, 0, 'Teardown cannot restart canceled work');
assert.equal(await gate.wait(() => false), false); assert.equal(timers.size, 0);
assert.equal(await gate.wait(() => true), true, 'Already quiet work needs no timer');
console.log('Raster quiet gate: continuous input, one sleeping timer, exact120ms quiet boundary, owner cancellation, visibility resume and teardown passed.');
