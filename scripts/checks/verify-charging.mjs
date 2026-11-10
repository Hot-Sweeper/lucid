import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = async file => readFile(new URL(`../../src/${file}.ts`, import.meta.url), 'utf8');
const compile = async (file, input = null) => (await transformWithOxc((input ?? await source(file)).replace(/^import\s[^;]+;\r?\n/gm, ''), `${file}.ts`)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const { SubscriptionBatteries, recovery, batteryWeakness, needsCharge } = new Function(`${await compile('office/battery')};return {SubscriptionBatteries,recovery,batteryWeakness,needsCharge}`)();
const now = Math.floor(Date.now() / 1000) * 1000, iso = ms => new Date(ms).toISOString();
const window = (id, usedPercent, minutes = 60, resetsAt = now + 3600000) => ({ id, usedPercent, windowMinutes: minutes, resetsAt: resetsAt === null ? null : iso(resetsAt), observedAt: iso(now) });
const group = (harness, list) => ({ harness, name: harness, observedAt: iso(now), windows: list, primary: list[0], secondary: list[1] || null });
const bank = new SubscriptionBatteries();
bank.setUsage({ limits: { 't3:claudeAgent': group('claude', [window('hour', 100), window('weekly', 100, 10080, now + 2 * 86400000)]), 't3:work-claude': group('claude', [window('work', 20)]) } });
for (let i = 0; i < 25; i++) assert.equal(bank.get('claudeAgent', now).charging, true, 'every robot on the exhausted subscription charges');
assert.equal(bank.get('work-claude', now).charging, false, 'independent accounts stay independent');
assert.equal(bank.get('claude', now).remaining, null, 'ambiguous legacy driver must not guess an account');
assert.equal(bank.get('codex', now).remaining, null);
const exhausted = bank.get('claudeAgent', now);
assert.equal(exhausted.windows.length, 2);
assert.match(recovery(exhausted, now).text, /^2d 0h 0m 00s/);
assert.match(recovery(exhausted, now + 1000).text, /59s/);
assert.equal(recovery(exhausted, now).progress, 0);
assert.equal(recovery(exhausted, now + 86400000).progress, .5, 'progress is elapsed reset wait, not invented remaining quota');
assert.match(recovery(exhausted, now + 3 * 86400000).text, /Checking/);
assert.equal(bank.get('claudeAgent', now + 3 * 86400000).charging, true, 'time alone cannot confirm capacity');
bank.setUsage({ limits: {} });
assert.equal(bank.get('claudeAgent', now + 1000).charging, true, 'missing readings retain known exhausted windows');
bank.setUsage({ limits: { 't3:claudeAgent': group('claude', [window('hour', 0), window('weekly', 100, 10080, now + 2 * 86400000)]) } });
assert.equal(bank.get('claudeAgent', now + 1000).windows.length, 1, 'hourly recovery must not clear a depleted weekly limit');
bank.setUsage({ limits: { 't3:claudeAgent': group('claude', [{ ...window('weekly', 0), stale: true }]) } });
assert.equal(bank.get('claudeAgent', now + 1000).charging, true, 'stale low usage cannot release a depleted robot');
bank.setUsage({ limits: { 't3:claudeAgent': group('claude', [window('weekly', 10, 10080, now + 2 * 86400000)]) } });
assert.equal(bank.get('claudeAgent', now + 1000).charging, false);
assert.equal(bank.get('claudeAgent', now + 1000).remaining, 90);
bank.setUsage({ limits: { codex: group('codex', [window('primary', 81), window('secondary', 95)]) } });
assert.equal(bank.get('codex', now).remaining, 5, 'most constrained quota determines energy');
assert.equal(batteryWeakness(30), 0); assert.equal(batteryWeakness(0), 1); assert.ok(batteryWeakness(5) > batteryWeakness(20)); assert.equal(batteryWeakness(null), 0);
bank.setUsage({ limits: { codex: group('codex', [window('primary', null)]) } });
assert.equal(bank.get('codex', now).remaining, null);
bank.setUsage({ limits: { codex: group('codex', [window('primary', 100, null, null)]) } });
assert.deepEqual(recovery(bank.get('codex', now), now), { progress: null, text: 'Reset time unavailable' });
bank.setEnabled(false); assert.equal(bank.get('codex', now).charging, false, 'local quota never gets applied to another building');
bank.setEnabled(true); assert.equal(bank.get('codex', now).charging, true);
let notifications = 0; const off = bank.subscribe(() => notifications++); off(); bank.setUsage({ limits: {} }); assert.equal(notifications, 1, 'destroyed robot observers unsubscribe');

// Exercise production room routing, including the layout barrier and pinned robots.
const policy = new Function(`${await compile('office/room-policy')};return {hasOfficeWork,hasOfficeDesk}`)();
const worldSource = await source('office/world');
const World = new Function('UNIT_W', 'UNIT_H', 'hasOfficeWork', `${await compile('office/world')};return World`)(400, 380, policy.hasOfficeWork);
const context = { placed: new Map(), collapsedRooms: new Set(), revealedThread: null };
context.settleRoom = World.prototype.settleRoom;
context.placed.set('one', { room: 'p:project' });
assert.equal(context.settleRoom({ id: 'one', runStatus: 'running' }, 'charging'), 'charging');
assert.equal(context.settleRoom({ id: 'one', runStatus: 'running' }, 'p:project'), 'p:project');
const classification = worldSource.slice(worldSource.indexOf('    const classifiedRoom ='), worldSource.indexOf('    const seatOrder ='));
const classify = new Function('subscriptionBatteries', 'needsCharge', 'data', 'wasHeld', 'holdPhysical', 'retiringIds', 'previousPhysical', 'hasOfficeWork', 'hasOfficeDesk', `${(await transformWithOxc(classification, 'classification.ts')).code};return {charging,queue,main,brk,orchT,classifiedRoom}`);
const routingBank = new SubscriptionBatteries();
routingBank.setUsage({ limits: { 't3:claudeAgent': group('claude', [window('primary', 100, 60, Date.now() + 3600000)]), 't3:codex': group('codex', [window('primary', 25, 60, Date.now() + 3600000)]) } });
const threads = ['busy', 'question', 'resting', 'historical', 'boss', 'other'].map(id => ({ id, provider: id === 'other' ? 'codex' : 'claudeAgent', runStatus: id === 'busy' || id === 'other' ? 'running' : null, settled: id === 'resting' || id === 'historical', question: id === 'question' ? 'Approval?' : null, pinned: id === 'boss' }));
Object.assign(context, { orchThread: 'boss', reports: new Map(), roomOf: new Map(threads.map(t => [t.id, 'main'])), transit: new Map(), exits: new Map(), roster: { byThread: id => id === 'historical' ? null : { id } }, homeForThread: () => 'main' });
const routed = classify.call(context, routingBank, t => needsCharge(t, routingBank), { threads, projects: [] }, true, true, new Set(), new Map(), policy.hasOfficeWork, policy.hasOfficeDesk);
assert.deepEqual(routed.charging.map(t => t.id), ['question', 'resting', 'boss'], 'exhausted idle, approval, resting and boss robots bypass layout debounce; historical threads do not create duplicates');
assert.equal(routed.classifiedRoom.get('busy'), 'main', 'a running thread past its subscription limit keeps working at its desk on API credits');
assert.equal(routed.classifiedRoom.get('other'), 'main', 'other subscriptions keep working');
assert.equal(routed.orchT, null, 'depleted boss leaves the service desk');

// Real room lifecycle with controlled walking, no Electron/GPU or live subscriptions.
class Element {
  children = []; style = {}; hidden = false; listeners = {}; textContent = '';
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  setAttribute() {} closest() { return null; } remove() { this.removed = true; }
  querySelector(selector) { return this.children.find(n => n.className === selector.slice(1)); }
}
let interval = null, removedListener = false, deadWalkers = 0;
const document = { hidden: false, createElement: () => new Element(), addEventListener() {}, removeEventListener() { removedListener = true; } };
const windowTimers = { setInterval(fn) { interval = fn; return 1; } };
class Walker {
  el = new Element(); x = 0; y = 0; walks = []; facing = 'down';
  constructor(_layer, info) { this.id = info.id; }
  setPos(x, y) { this.x = x; this.y = y; }
  walkPath(points) { return new Promise(resolve => this.walks.push(() => { Object.assign(this, points.at(-1)); resolve(); })); }
  stop() { for (const finish of this.walks.splice(0)) finish(); }
  face(dir) { this.facing = dir; } do(activity, opts) { this.activity = activity; this.opts = opts; } calm() {} destroy() { deadWalkers++; this.stop(); }
}
class RoomStage { el = new Element(); layer = new Element(); prop() {} destroy() { this.destroyed = true; } }
const { ChargingRoom, chargingSize } = new Function('RoomStage', 'PAL', 'Walker', 'recovery', 'subscriptionBatteries', 'document', 'window', 'clearInterval', `${await compile('world/charging')};return {ChargingRoom,chargingSize}`)(RoomStage, {}, Walker, recovery, routingBank, document, windowTimers, () => { interval = null; });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const size = chargingSize(25), room = new ChargingRoom(new Element(), size.w, size.h);
const list = Array.from({ length: 25 }, (_, i) => ({ id: `bot${i}`, provider: 'claudeAgent', title: `Robot ${i}`, battery: exhausted }));
room.setThreads([]); room.setThreads(list); room.setThreads(list);
assert.ok([...room.residents.values()].every(r => r.w.x === room.spot(r.slot).x && r.w.y === room.spot(r.slot).y && r.w.walks.length === 0), 'startup residents are already docked, even after an empty initial snapshot');
assert.equal(room.residents.size, 25, 'no eight-robot leisure cap or duplicate arrivals');
assert.ok([...room.residents.values()].every(r => room.spot(r.slot).y < size.h - 80));
for (const r of room.residents.values()) r.w.stop(); await flush();
assert.ok([...room.residents.values()].every(r => r.w.activity === 'charge' && r.w.opts.quota && !r.label.hidden));
const first = room.residents.get('bot0');
assert.match(first.time.textContent, /until reset/); assert.equal(first.meter.hidden, false);
let departures = 0; room.onDeparture = (id, actor) => { assert.equal(actor.id, id); departures++; };
let exits = 0; room.onExit = () => { exits++; return true; };
room.setThreads(list.slice(1)); assert.equal(first.leaving, true); assert.equal(departures, 1, 'departure setup runs before the first walk');
room.setThreads(list); first.w.stop(); await flush();
assert.equal(exits, 0, 're-exhaustion cancels an in-flight departure');
room.setThreads(list.slice(1)); first.w.stop(); await flush();
assert.equal(exits, 1); assert.equal(room.residents.has('bot0'), false);
const before = list[1].battery = { ...exhausted, windows: [{ label: 'Weekly', resetsAt: null, startedAt: now }] };
room.setThreads(list.slice(1)); assert.equal(room.residents.get('bot1').meter.hidden, true, 'unknown reset time never fabricates progress');
document.hidden = true; const text = room.residents.get('bot1').time.textContent; room.residents.get('bot1').info.battery = exhausted; interval(); assert.equal(room.residents.get('bot1').time.textContent, text, 'hidden cosmetics do not repaint');
room.destroy(); assert.equal(interval, null); assert.equal(removedListener, true); assert.equal(deadWalkers, 25); assert.equal(room.stage.destroyed, true);
console.log('Charging checks passed: account isolation, multiple windows, verified recovery, seconds/progress, stale and unknown readings, weakness, routing/boss/history, uncapped residents, cancel/retry handoffs and resource cleanup.');
