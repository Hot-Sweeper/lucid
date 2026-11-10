import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

async function code(file) {
  const source = (await readFile(new URL(`../../src/${file}`, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  return (await transformWithOxc(source, file)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
}

// A cold app can finish loading after its robot was interrupted or reassigned.
// Share concurrent loads, retry failed loads, and check cancellation on both sides.
class Cancelled extends Error {}
const { lazyActivity } = new Function('Cancelled', `${await code('os/lazy-activity.ts')};return {lazyActivity}`)(Cancelled);
let loads = 0, runs = 0, resolve;
const play = async (body, host, opts) => { runs++; return { body, opts }; };
const lazy = lazyActivity(() => { loads++; return new Promise(r => { resolve = r; }); });
const host = { stopped: false }, body = {}, opts = { maxMs: 123 };
const first = lazy(body, host, opts), second = lazy(body, host, opts);
assert.equal(loads, 1);
resolve(play);
assert.deepEqual(await first, { body, opts }); await second;
assert.equal(runs, 2);
const stopped = { stopped: true };
await assert.rejects(lazy(body, stopped, opts), Cancelled);
assert.equal(runs, 2);
const cold = lazyActivity(() => new Promise(r => { resolve = r; }));
const pending = cold(body, host, opts);
host.stopped = true; resolve(play);
await assert.rejects(pending, Cancelled); assert.equal(runs, 2);
host.stopped = false;
let attempts = 0;
const retry = lazyActivity(async () => { if (++attempts === 1) throw Error('temporary load failure'); return play; });
await assert.rejects(retry(body, host, opts), /temporary/);
await retry(body, host, opts); assert.equal(attempts, 2);

// Exercise the actual shared clock with a virtual wall clock and visibility.
let now = 0, timerId = 0, wake;
const timers = new Map(), microtasks = [], events = new Map();
class DateClock extends Date { constructor() { super(now); } static now() { return now; } }
const document = { hidden: false, addEventListener: (name, cb) => events.set(name, cb) };
const window = { setTimeout: (cb, delay) => { const id = ++timerId; timers.set(id, { cb, at: now + delay }); return id; } };
const clearTimeout = id => timers.delete(id);
const api = new Function('document', 'window', 'Date', 'renderFps', 'onRenderWake', 'clearTimeout', 'queueMicrotask', 'reportError',
  `${await code('perf/clock.ts')};return {watchClock,refreshClocks}`)(document, window, DateClock,
    owner => !document.hidden && owner.isConnected && owner.visible ? 60 : 0,
    cb => { wake = cb; }, clearTimeout, cb => microtasks.push(cb), error => { throw error; });
const advance = ms => {
  const end = now + ms;
  for (;;) {
    const entry = [...timers].sort((a,b) => a[1].at-b[1].at)[0];
    if (!entry || entry[1].at > end) break;
    now = entry[1].at; timers.delete(entry[0]); entry[1].cb();
  }
  now = end;
};
const flush = () => { while (microtasks.length) microtasks.shift()(); };
const owners = Array.from({length:25}, () => ({ isConnected: true, visible: true }));
let paints = 0;
const stops = owners.map(owner => api.watchClock(owner, () => paints++));
assert.equal(timers.size, 1, '25 desks share one timer');
advance(120001);
assert.equal(paints, 75, 'minute clocks only repaint at minute boundaries');
owners.forEach(o => { o.visible = false; }); advance(120000);
assert.equal(paints, 75, 'offscreen clocks do not paint');
assert.equal(timers.size, 0, 'offscreen clocks release the cosmetic timer');
owners.forEach(o => { o.visible = true; }); wake(); wake();
assert.equal(microtasks.length, 1, 'batch a camera visibility pass into one refresh');
flush(); assert.equal(paints, 100, 'returning desktops immediately show current time');
document.hidden = true; events.get('visibilitychange')();
assert.equal(timers.size, 0, 'hidden app has no cosmetic clock timer');
advance(120000); assert.equal(paints, 100);
document.hidden = false; events.get('visibilitychange')();
assert.equal(paints, 125);
owners[0].isConnected = false; advance(60000);
const detached = paints;
owners[0].isConnected = true; wake(); flush();
assert.equal(paints, detached + 1, 'stashed app clocks resume after reattachment');
let seconds = 0;
const stopSeconds = api.watchClock(owners[0], () => seconds++, 1000);
advance(3000); assert.equal(seconds, 4, 'elapsed counters retain one-second updates');
owners[0].visible = false; wake(); flush();
assert.equal(timers.size, 1);
assert.ok([...timers.values()][0].at - now > 1000, 'hidden seconds clock does not force visible minute clocks to wake each second');
advance(3000); assert.equal(seconds, 4);
owners[0].visible = true; wake(); flush();
assert.equal(seconds, 5, 'seconds clock immediately catches up on return');
stopSeconds(); stops.forEach(stop => stop());
assert.equal(timers.size, 0, 'destroying every owner releases the shared timer');
console.log('PASS: shared lazy loads, cancellation before/after loading, load retry; 25 clock owners share one timer, unchanged/offscreen/hidden paints skipped, immediate resume, reattachment, seconds and disposal');
