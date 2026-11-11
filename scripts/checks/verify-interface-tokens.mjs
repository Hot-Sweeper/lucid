// The interface keeps one accent and one radius scale, and Follow T3 never darkens the office:
// - interface stylesheets use --accent / --accent-ink instead of hardcoded peach,
// - their corner radii come from the --radius-* tokens (2 and 3px details excepted),
// - the Follow T3 entry keeps the warm, time-of-day world under every T3 palette,
// - OLED's moonlit materials and dark robots stay OLED's own choice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// Interface stylesheets only: robot computers, games, world art and monitor content keep their own art.
const INTERFACE = ['src/ui/controls.css', 'src/titlebar.css', 'src/stats/ledger-panel.css', 'src/stats/stats.css',
  'src/office/panels.css', 'src/office/answer.css', 'src/office/hire.css', 'src/office/music-controls.css',
  'src/office/thread-list.css', 'src/office/orchestrator-controls.css', 'src/office/new-project.css',
  'src/office/media-player.css', 'src/office/worker-focus.css', 'src/office/chat-work.css', 'src/office/limits-section.css'];
for (const path of INTERFACE) {
  const css = await read(path);
  assert.doesNotMatch(css, /rgba\(255, ?159, ?90/, `${path}: peach is hardcoded; use color-mix with var(--accent)`);
  assert.doesNotMatch(css, /color: ?#2a14/, `${path}: ink on the accent is hardcoded; use var(--accent-ink)`);
  for (const [, px] of css.matchAll(/border-radius: ?(\d+)px\s*[;}!]/g)) {
    assert(Number(px) <= 3, `${path}: border-radius ${px}px; use a --radius-* token`);
  }
}

// Follow T3 maps the accent and its ink, and keeps the office warm.
const t3 = await read('src/themes/t3.css');
assert.match(t3, /--accent: var\(--t3-accent\)/);
assert.match(t3, /--accent-ink: var\(--t3-accent-ink\)/);
const registry = await read('src/themes/registry.ts');
const t3Entry = registry.slice(registry.indexOf('const WARM_WORLD'), registry.indexOf('export const THEMES'));
assert.match(t3Entry, /WARM_WORLD: WorldLook = \{ alwaysMidnight: false, artShade: 0 \}/, 'Follow T3 keeps real time-of-day light and the season palette');
assert.doesNotMatch(t3Entry, /alwaysMidnight: true|mapEdge/, 'Follow T3 must not lock the office to midnight or black out the map edge');

// Only OLED black takes the moonlit materials and dark robots.
const oled = await read('src/themes/oled.css');
const darkOffice = oled.slice(oled.indexOf('/* The dark office'), oled.indexOf('/* The robots\' computers in their dark look'));
assert.match(darkOffice, /^:root\[data-theme="oled"\] \{/m);
assert.doesNotMatch(darkOffice, /data-theme="t3"/, 'a dark T3 palette must not take the OLED office');
assert.match(darkOffice, /--robot-dark: 100%/);

console.log('Interface tokens passed: one accent, token radii, a warm office under Follow T3, OLED keeps its moonlit office.');
