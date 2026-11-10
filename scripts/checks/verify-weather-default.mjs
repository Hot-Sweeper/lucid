// Weather and seasons are part of the office from the first launch: no setting turns them off by
// default, live weather is requested at startup, and the season shows before (or without) a report.
// The only off switch is the session-only performance diagnostic, which is never saved.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const main = await read('src/main.ts');
assert.match(main, /^void pollWeather\(\);$/m, 'live weather is requested unconditionally at startup');
assert.match(main, /^setInterval\(pollWeather, /m, 'and kept current');
const settingsType = main.match(/^const settings: \{([^\n]*)\} = /m)?.[1] ?? '';
assert.ok(settingsType, 'saved settings type found');
assert.doesNotMatch(settingsType, /weather(?!Fix)|season/i, 'no saved setting can disable weather or seasons; weatherFix only corrects the sky for two hours');

const diagnostics = await read('src/perf/diagnostics.ts');
assert.doesNotMatch(diagnostics, /localStorage|settingsSave/, 'the weather diagnostic is session-only');

const season = await transformWithOxc((await read('src/weather/season.ts')).replace(/^(import|export) type .*;\r?\n/gm, ''), 'season.ts');
const { outdoorLook } = await import('data:text/javascript;base64,' + Buffer.from(season.code).toString('base64'));
assert.equal(outdoorLook(new Date(2026, 6, 1), null).season, 'summer', 'seasons follow the date without a weather report');
assert.equal(outdoorLook(new Date(2026, 10, 10), null).season, 'autumn');
const deepWinter = outdoorLook(new Date(2027, 0, 10), null);
assert.equal(deepWinter.season, 'winter'); assert.equal(deepWinter.frozen, true); assert.ok(deepWinter.snowCover > 0, 'deep winter shows snow before the first report');
console.log('PASS: weather is requested from the first launch, no saved setting disables it, and seasons show without a report.');
