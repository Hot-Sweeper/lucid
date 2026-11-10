// The coin ledger: the main-process calendar keeps the fullest real reading per day and thread,
// and the renderer's numbers (streaks, usual pace, personal records, heat levels, breakdowns)
// come only from those readings and the wallet's older daily totals.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformWithOxc } from 'vite';

const require = createRequire(import.meta.url);
const { mergeCalendar, normalize, createCoinCalendar } = require('../../electron/coin-calendar.cjs');
const source = await transformWithOxc(await readFile(new URL('../../src/stats/coin-calendar.ts', import.meta.url), 'utf8'), 'coin-calendar.ts');
const cal = await import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64'));
const { mergeDays, summarize, heatScale, breakdown, addDays, weekStart, weekday } = cal;

// ---- main process merge -------------------------------------------------------------------
const doc = normalize(null);
const src = (threadId, days, extra = {}) => ({ key: `codex:${threadId}:${Object.keys(days)[0] ?? 'x'}`, threadId, title: `Task ${threadId}`, projectId: 'p1', project: 'Alpha', status: 'running', costUsd: 1, days, ...extra });
assert.equal(mergeCalendar(doc, [src('t1', { '2026-11-09': 1.5 }), src('t1', { '2026-11-09': .5, '2026-11-10': 2 })]), true);
assert.equal(doc.days['2026-11-09'].t1, 2, 'sessions of one thread add up per day');
assert.equal(doc.days['2026-11-10'].t1, 2);
assert.equal(doc.threads.t1.project, 'Alpha');
const rev = doc.rev;
assert.equal(mergeCalendar(doc, [src('t1', { '2026-11-09': 1 })]), false, 'a shrinking log window never lowers a day');
assert.equal(doc.days['2026-11-09'].t1, 2);
assert.equal(doc.rev, rev, 'unchanged readings do not bump the revision');
assert.equal(mergeCalendar(doc, [src('t2', {}, { title: 'Idle' })]), false, 'threads without work are not recorded');
assert.equal(doc.threads.t2, undefined);
assert.equal(mergeCalendar(doc, [src('t1', { 'not-a-day': 5, '2026-11-11': -1 })]), false, 'invalid days and amounts are ignored');
assert.equal(mergeCalendar(doc, [src('t1', {}, { title: 'Renamed' })]), true, 'a renamed thread keeps its days');
assert.equal(doc.threads.t1.title, 'Renamed');
assert.deepEqual(Object.keys(normalize({ days: { bad: { t: 1 }, '2026-01-01': { t: 'x', u: 2 } } }).days['2026-01-01']), ['u']);

const dir = await mkdtemp(join(tmpdir(), 'coin-calendar-'));
try {
  const file = join(dir, 'coin-calendar.json');
  const a = createCoinCalendar(file);
  a.observe([src('t1', { '2026-11-01': 3 })]);
  await a.flush();
  assert.equal(createCoinCalendar(file).read().days['2026-11-01'].t1, 3, 'the calendar survives a restart');
} finally { await rm(dir, { recursive: true, force: true }); }

// ---- renderer numbers ---------------------------------------------------------------------
const today = '2026-11-12'; // a Thursday
assert.equal(weekday(today), 3); assert.equal(weekStart(today), '2026-11-09');
assert.equal(addDays('2026-03-28', 2), '2026-03-30', 'daylight saving does not skip days');

const calendar = { days: {}, threads: {} };
const put = (day, thread, usd) => { (calendar.days[day] ??= {})[thread] = usd; calendar.threads[thread] = { title: `Task ${thread}`, projectId: thread.startsWith('a') ? 'pa' : 'pb', project: thread.startsWith('a') ? 'Alpha' : 'Beta' }; };
// Two full weeks before this one: 2 coins Mon to Wed each week.
for (const w of ['2026-10-26', '2026-11-02']) for (let i = 0; i < 3; i++) put(addDays(w, i), 'a1', 2);
put('2026-11-09', 'a1', 1); put('2026-11-10', 'b1', 3); put('2026-11-11', 'a2', 1.5);
const legacy = { '2026-10-20': 4, '2026-11-10': 99, welcome: 10 };
let days = mergeDays(calendar, legacy);
assert.equal(days.get('2026-10-20').coins, 4, 'older wallet totals fill days the calendar never saw');
assert.equal(days.get('2026-10-20').threads, null);
assert.equal(days.get('2026-11-10').coins, 3, 'thread readings win over an older total for the same day');
assert.equal(days.has('welcome'), false);

let s = summarize(days, today);
assert.equal(s.first, '2026-10-20');
assert.equal(s.streak, 3, 'an open today keeps yesterday\'s streak alive');
assert.equal(s.todayCoins, 0);
assert.equal(s.week, 5.5);
assert.equal(s.bestDay.coins, 4);
assert.equal(s.usualByNow, 6, 'usual pace compares the same weekdays of earlier full weeks');
assert.equal(s.bestWeek.coins, 6);
const rec = Object.fromEntries(s.records.map(r => [r.kind, r]));
assert.equal(rec.day.eligible, true); assert.equal(rec.day.beaten, false);
assert.equal(rec.streak.best, 3, 'the longest earlier streak');

// Today beats the best day, this week beats the best week, the streak beats the longest one.
put(today, 'b2', 4.5);
days = mergeDays(calendar, legacy);
s = summarize(days, today);
const now = Object.fromEntries(s.records.map(r => [r.kind, r]));
assert.equal(now.day.beaten, true, 'more coins than any earlier day is a new best day');
assert.equal(now.week.beaten, true);
assert.equal(now.streak.current, 4);
assert.equal(now.streak.beaten, true);
assert.equal(now.day.usual, Math.round((4 + 12 + 1 + 3 + 1.5) / 10 * 1e6) / 1e6, 'the usual day is the mean of earlier days with coins');
assert.notEqual(now.streak.key, rec.streak.key, 'each longer streak is its own record');

// A new user: nothing to compare, so nothing is celebrated.
const fresh = summarize(mergeDays({ days: { [today]: { x: 50 } }, threads: {} }), today);
assert.ok(fresh.records.every(r => !r.eligible && !r.beaten), 'records need history first');
assert.equal(fresh.usualByNow, null);
assert.equal(summarize(mergeDays(null), today).first, null);

// Heat levels follow the user's own spread: light users fill the scale too.
const light = heatScale(mergeDays({ days: { a: {}, '2026-01-01': { t: .01 }, '2026-01-02': { t: .02 }, '2026-01-03': { t: .05 }, '2026-01-04': { t: .2 } } }));
assert.deepEqual([0, .01, .02, .05, .2].map(light), [0, 1, 2, 3, 4]);

// Breakdown by project, robot and thread, with earlier totals reported separately.
const robots = { a1: { id: 'r1', name: 'Pip' }, a2: { id: 'r1', name: 'Pip' }, b1: { id: 'r2', name: 'Bolt' } };
const b = breakdown(days, calendar.threads, '2026-11-09', today, id => robots[id] ?? null);
assert.deepEqual(b.projects.map(p => [p.name, p.coins]), [['Beta', 7.5], ['Alpha', 2.5]]);
assert.deepEqual(b.robots.map(r => [r.name, r.coins]), [['Bolt', 3], ['Pip', 2.5], ['No robot on record', 4.5]].sort((x, y) => y[1] - x[1]));
assert.equal(b.threads[0].name, 'Task b2');
assert.equal(b.total, 10);
assert.equal(breakdown(days, calendar.threads, '2026-10-01', '2026-10-31', () => null).unattributed, 4);

console.log('PASS: coin calendar keeps the fullest real reading per day and thread, survives restarts, and the ledger derives streaks, usual pace, records, heat levels and breakdowns only from real days.');
