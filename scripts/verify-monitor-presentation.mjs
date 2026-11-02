import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = (await readFile(new URL('../src/director.ts', import.meta.url), 'utf8')).replace(/^import\s[\s\S]*?;\r?\n/gm, '');
const compile = async code => (await transformWithOxc(code, 'director.ts')).code.replace(/^export /gm, '');
const load = async code => new Function(`${await compile(code)};return {Director,samePresentationValue};`)();
const { Director, samePresentationValue } = await load(source);
assert.equal(samePresentationValue({ data: { text: 'old' } }, { data: { text: 'new' } }), false);
assert.equal(samePresentationValue({ data: [1, 2] }, { data: [1, 2] }), true);
const make = Type => {
  const count = { updates: 0, pumps: 0 };
  const director = Object.assign(Object.create(Type.prototype), {
    items: new Map(), played: new Set(), queue: [], helperOf: new Map(), catchingUp: false,
    lastEventAt: 0, frontendSignals: new Map(),
    imageRefresh: { tracks: () => false }, chat: { update: () => count.updates++ },
    idleLife: { isActive: false }, pump() { count.pumps++; },
  });
  return { director, count };
};
const items = Array.from({ length: 600 }, (_, i) => ({ id: `item-${i}`, runId: 'run', type: 'command_execution', ordinal: i, status: 'completed', updatedAt: '2026-11-01T12:00:00Z', data: { input: 'node check.cjs', output: 'work '.repeat(1000) } }));
const after = make(Director);
after.director.push(items, true);
assert.equal(after.count.updates, 600);
const baseline = await load(source.replace(/    items = items\.filter\(it => !samePresentationValue\(this\.items\.get\(it\.id\), it\)\);\r?\n    if \(!items\.length\) return;\r?\n/, ''));
const before = make(baseline.Director);
before.director.push(items, true);
const first = after.count.updates;
for (let i = 0; i < 30; i++) {
  const repeat = JSON.parse(JSON.stringify(items));
  before.director.push(repeat, true);
  after.director.push(repeat, true);
}
assert.equal(before.count.updates - 600, 18000);
assert.equal(after.count.updates - first, 0);
assert.equal(after.count.pumps, 1, 'unchanged snapshots do not restart the scene pump');
const update = { ...items[599], data: { ...items[599].data, output: 'Changed output at the same timestamp' } };
after.director.push([update], true);
assert.equal(after.count.updates, 601, 'same-time content edits remain live');
assert.equal(after.director.items.get(update.id).data.output, update.data.output);
const historyTimers = new Map();
let timerId = 0, reads = 0, historyWrites = 0;
globalThis.renderFps = owner => owner.visible ? 60 : 0;
globalThis.window = {
  setTimeout(fn) { const id = ++timerId; historyTimers.set(id, fn); return id; },
  clearTimeout(id) { historyTimers.delete(id); },
  lucid: { conversation: async () => { reads++; return [{ role: 'user', at: '2020-01-01T12:00:00Z', text: 'Earlier work' }]; } },
};
const history = Object.assign(Object.create(Director.prototype), {
  historyThread: 'history-thread', historyTimer: 0, historyGeneration: 0,
  historyCut: 0, info: { id: 'history-thread' }, pumpEpoch: 0,
  wm: { operatorPresent: true, presentationVisible: false, root: { visible: false }, setPresentationVisible(on) { this.presentationVisible = on; } },
  nativeMessages: { history() { historyWrites++; } },
  present() { return this.wm.operatorPresent && this.wm.presentationVisible; },
});
history.scheduleHistory();
assert.equal(historyTimers.size, 0, 'hidden monitors do not schedule full conversation reads');
history.wm.root.visible = true;
history.setPresentationVisible(true);
assert.equal(historyTimers.size, 1);
history.setPresentationVisible(false);
assert.equal(historyTimers.size, 0, 'leaving view cancels the pending history timer');
history.setPresentationVisible(true);
for (const [id, fn] of historyTimers) { historyTimers.delete(id); fn(); }
for (let i = 0; i < 8; i++) await Promise.resolve();
assert.equal(reads, 1); assert.equal(historyWrites, 1, 'the original history appears when its monitor is shown');
let pageReads = 0, recentHistory;
const pages = [
  { messages: [{ role: 'user', at: '2030-01-01T00:00:00Z', text: 'Current run' }], hasMore: true, cursor: { at: '2030-01-01T00:00:00Z', rowid: 100 } },
  { messages: Array.from({ length: 6 }, (_, i) => ({ role: 'assistant', at: `2020-01-02T00:00:0${i}Z`, text: `Newer history ${i}` })), hasMore: true, cursor: { at: '2020-01-02T00:00:00Z', rowid: 50 } },
  { messages: Array.from({ length: 8 }, (_, i) => ({ role: 'user', at: `2020-01-01T00:00:0${i}Z`, text: `Older history ${i}` })), hasMore: true, cursor: { at: '2020-01-01T00:00:00Z', rowid: 30 } },
];
window.lucid.conversationPage = async (_id, options) => { assert.equal(options.limit, 12); return pages[pageReads++]; };
history.nativeMessages.history = rows => { recentHistory = rows; };
await history.loadHistory('history-thread');
assert.equal(pageReads, 3, 'monitor history stops fetching once twelve eligible rows are found');
assert.equal(recentHistory.length, 12);
assert.equal(recentHistory[0].text, 'Older history 2');
assert.equal(recentHistory[11].text, 'Newer history 5');
window.lucid.conversationPage = async () => ({ messages: [], hasMore: true, cursor: { at: 'same', rowid: 1 } });
await history.loadHistory('history-thread');
delete window.lucid.conversationPage;
let release;
window.lucid.conversation = () => new Promise(resolve => { release = resolve; });
const stale = history.loadHistory('history-thread');
history.historyGeneration++;
release([{ role: 'assistant', at: '2020-01-01T12:00:00Z', text: 'A stale reply' }]);
await stale;
assert.equal(historyWrites, 1, 'an old asynchronous history read cannot enter a reset computer');

const deskSource = (await readFile(new URL('../src/office/desk.ts', import.meta.url), 'utf8'));
const deskClass = await transformWithOxc(deskSource.slice(deskSource.indexOf('export class Desk')).replace('export class Desk', 'class Desk'), 'desk.ts');
const Desk = new Function(deskClass.code + ';return Desk;')();
const presenceClasses = new Set(['arriving']);
let reculls = 0;
const desk = Object.assign(Object.create(Desk.prototype), { el: { classList: { contains: name => presenceClasses.has(name), toggle(name, on) { if (on) presenceClasses.add(name); else presenceClasses.delete(name); } } }, syncPresence() {}, onPresenceChange() { reculls++; } });
desk.setSeated(true);
assert.equal(reculls, 1, 'physical arrival immediately refreshes visibility without a new T3 snapshot');
desk.setSeated(true); assert.equal(reculls, 1, 'unchanged presence causes no redundant cull');
desk.setSeated(false); assert.equal(reculls, 2, 'departure immediately suspends monitor presentation');
console.log('Monitor presentation fixture: 600 items, 30 repeated snapshots, redundant chat updates 18000 before and 0 after; same-timestamp edits preserved.');
