// Limits can be read as used (the bar fills up) or left (the bar counts down). Both views show the
// same reading: bar, percentage words, pace mark and accessible text change together, and the
// choice is saved in settings.ui.limitView.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const source = await transformWithOxc(await read('src/stats/limit-pace.ts'), 'limit-pace.ts');
const { limitReading, pace } = await import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64'));

// 58% used, half the window gone: even pace is 50% used, or 50% left.
const used = limitReading(58, 0.5, 'used'), left = limitReading(58, 0.5, 'left');
assert.deepEqual([used.fill, used.value, used.mark, used.text], [58, 58, 50, '58% used']);
assert.deepEqual([left.fill, left.value, left.mark, left.text], [42, 42, 50, '42% left']);
assert.equal(used.pace, 'Even pace would be 50% used by now');
assert.equal(left.pace, 'Even pace would leave 50% by now');
// The pace word is about spending, so it does not flip with the view.
assert.equal(pace(58, 0.5), 'ahead');
// The two views always add up to 100, even when the reading rounds at .5.
for (const u of [0, 0.5, 12.5, 41.5, 58.5, 99.4, 100]) {
  assert.equal(limitReading(u, null, 'used').value + limitReading(u, null, 'left').value, 100, `views add up for ${u}`);
}
// On the countdown bar the mark sits where even pace would leave the remainder.
assert.equal(limitReading(10, 0.25, 'left').mark, 75);
assert.equal(limitReading(10, 0.25, 'used').mark, 25);
assert.equal(limitReading(10, null, 'left').mark, null, 'no reset time, no pace mark');
assert.equal(limitReading(10, null, 'left').pace, '');

// The row, the header control and the setting are wired to the same reading.
const stats = await read('src/stats/stats.ts');
for (const piece of ['limitReading(used, elapsed, view)', 'r.fill.style.width = `${reading.fill}%`', 'setText(r.pct, reading.text)',
  'r.tick.style.left = `${reading.mark}%`', '"aria-valuenow", String(known && !l.stale ? reading.value : 0)', '"aria-valuetext"', 'setLimitView(next)']) {
  assert.ok(stats.includes(piece), `stats.ts: ${piece}`);
}
const section = await read('src/office/limits-section.ts');
assert.ok(section.includes('role="radiogroup" aria-label="Show limits as"') && section.includes('role="radio"'), 'Used / Left is a labelled radio group');
assert.ok(/ArrowLeft/.test(section) && section.includes("b.tabIndex = on ? 0 : -1"), 'arrow keys and roving focus');
const usage = await read('src/app/usage.ts');
assert.ok(usage.includes('limitView: app.ui.limitView') && usage.includes('app.ui.limitView = view') && usage.includes('app.saveSettings()'), 'the choice is saved and restored');
console.log('PASS: limits read as used or left with matching bar, words, pace mark and accessible text.');
