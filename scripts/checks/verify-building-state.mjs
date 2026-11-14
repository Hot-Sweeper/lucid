// The sign and roof of a linked computer say only what is true: connected (and how), still
// connecting, could not connect, offline, or not shared. Offline roofs keep their lights off.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (name) => {
  const text = (await readFile(new URL(`../../src/office/${name}.ts`, import.meta.url), 'utf8')).replace(/^import\s+["'][^"']+\.css["'];?$/m, '');
  const source = await transformWithOxc(text, `${name}.ts`);
  return import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64'));
};
const { buildingState, buildingDetail, buildingMood } = await load('environments');
const { closedBuildingSvg, CLOSED_BUILDING } = await load('closed-building');

const base = { id: 'ares', label: 'ARES', local: false, status: 'unknown', canOpen: true, reason: null };
const cases = [
  [{ ...base, local: true, link: 'local' }, 'This computer', 'open', null],
  [{ ...base, status: 'reachable', link: 'authenticated', route: 'lan' }, 'Connected over the local network', 'open', null],
  [{ ...base, status: 'reachable', link: 'authenticated', route: 'tailscale' }, 'Connected over Tailscale', 'open', null],
  [{ ...base, status: 'reachable', link: 'authenticated', route: 'relay' }, 'Connected through T3 Connect', 'open', null],
  [{ ...base, link: 'configured' }, 'Connecting', 'connecting', null],
  [{ ...base, link: 'failed', linkError: 'T3 Connect is not signed in.' }, 'Could not connect', 'closed', 'T3 Connect is not signed in.'],
  [{ ...base, status: 'unreachable', link: 'failed', linkError: 'It does not answer.' }, 'Offline', 'offline', 'It does not answer.'],
  [{ ...base, status: 'expired', link: 'configured' }, 'Link expired in T3 Code', 'offline', null],
  [{ ...base, canOpen: false, link: 'linked', reason: 'T3 keeps this link to itself.' }, 'Linked in T3 Code, sessions not shared', 'closed', 'T3 keeps this link to itself.'],
];
for (const [building, state, mood, detail] of cases) {
  assert.equal(buildingState(building), state);
  assert.equal(buildingMood(building), mood, state);
  assert.equal(buildingDetail(building), detail, state);
}
// A read that worked is the truth even if an earlier probe saw nothing.
assert.equal(buildingMood({ ...base, status: 'unreachable', link: 'authenticated' }), 'open');
for (const text of cases.map(c => c[1])) assert(!/[–—]/.test(text), 'no dashes as punctuation');

const lit = closedBuildingSvg(true), dark = closedBuildingSvg(false);
assert.match(lit, new RegExp(`viewBox="0 0 ${CLOSED_BUILDING.w} ${CLOSED_BUILDING.h}"`));
assert(lit.includes('url(#cb-sky)') && !dark.includes('url(#cb-sky)'), 'an offline roof keeps its skylights dark');
assert(!/<text/.test(lit), 'the name lives on the HTML sign, not baked into the art');
console.log('PASS: building signs, details and moods for every link state; roofs stay dark offline');
