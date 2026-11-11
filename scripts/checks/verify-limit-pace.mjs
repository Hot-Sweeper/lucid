// Pace marker and reset countdowns for the Limits cards, matching T3 Code's usage panel: the
// footnote form, the short form in the bar's chip and the spoken form in the meter's value.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await transformWithOxc(await readFile(new URL('../../src/stats/limit-pace.ts', import.meta.url), 'utf8'), 'limit-pace.ts');
const { elapsedShare, pace, resetCountdown, duration, chipCountdown, spokenCountdown } = await import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64'));

const now = Date.parse('2026-11-10T12:00:00Z');
const week = 10080, inDays = d => new Date(now + d * 86400000).toISOString();
// A weekly window resetting in 3.5 days is half over.
assert.equal(elapsedShare(inDays(3.5), week, now), 0.5);
assert.equal(elapsedShare(inDays(8), week, now), 0, 'a reset beyond the window length clamps to the start');
assert.equal(elapsedShare(inDays(-1), week, now), 1, 'a passed reset clamps to the end');
assert.equal(elapsedShare(null, week, now), null, 'no reset time, no pace');
assert.equal(elapsedShare(inDays(1), null, now), null, 'no duration, no pace');
// T3: more than 5 points over even pace is ahead, more than 5 under is under.
assert.equal(pace(58, 0.5), 'ahead');
assert.equal(pace(54, 0.5), 'on');
assert.equal(pace(46, 0.5), 'on');
assert.equal(pace(15, 0.5), 'under');
assert.equal(resetCountdown(inDays(2 + 4 / 24), now), 'resets in 2d 4h');
assert.equal(resetCountdown(new Date(now + (3 * 60 + 12) * 60000).toISOString(), now), 'resets in 3h 12m');
assert.equal(resetCountdown(new Date(now + 8 * 60000 + 30000).toISOString(), now), 'resets in 8m');
assert.equal(resetCountdown(new Date(now + 20000).toISOString(), now), 'resets in a moment');
assert.equal(resetCountdown(new Date(now - 1).toISOString(), now), 'resets now');
assert.equal(resetCountdown(null, now), null);
assert.equal(duration(21 * 86400000), '21d 0h');
// The chip is compact; the meter speaks whole words.
assert.equal(chipCountdown(new Date(now + 4 * 86400000 + 3600000).toISOString(), now), '4d 1h');
assert.equal(chipCountdown(new Date(now + (3 * 60 + 12) * 60000).toISOString(), now), '3h 12m');
assert.equal(chipCountdown(new Date(now + 20000).toISOString(), now), '<1m');
assert.equal(chipCountdown(new Date(now - 1).toISOString(), now), 'now');
assert.equal(chipCountdown(null, now), null, 'no reset time, no countdown in the chip');
assert.equal(spokenCountdown(new Date(now + 4 * 86400000 + 3600000).toISOString(), now), 'resets in 4 days 1 hour');
assert.equal(spokenCountdown(inDays(2), now), 'resets in 2 days');
assert.equal(spokenCountdown(new Date(now + (60 + 1) * 60000).toISOString(), now), 'resets in 1 hour 1 minute');
assert.equal(spokenCountdown(new Date(now + 8 * 60000 + 30000).toISOString(), now), 'resets in 8 minutes');
assert.equal(spokenCountdown(new Date(now + 20000).toISOString(), now), 'resets in a moment');
assert.equal(spokenCountdown(new Date(now - 1).toISOString(), now), 'resets now');
assert.equal(spokenCountdown(undefined, now), null);
console.log('PASS: limit pace marker, ahead/on/under thresholds and reset countdowns (footnote, chip and spoken).');
