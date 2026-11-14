// Desk nameplates and other world labels: one line of topic that fits by meaning (never wrapped,
// never an ellipsis), the same plate in every state (hover, focus and the open chat only add a
// ring), readable plates at every zoom, and the full title in the hover card.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const read = (path) => readFile(path, 'utf8');
const load = async (path) => import('data:text/javascript;base64,' + Buffer.from((await transformWithOxc(await read(path), path)).code).toString('base64'));
const { topicLabel, cleanTitle, estimateWidth } = await load('src/office/topic-label.ts');
const { plateView, DESK_TOPIC } = await load('src/office/plate-view.ts');

const ELLIPSIS = /…|\.\.\./;
const words = (s) => s.toLowerCase().split(/[\s,:]+/).filter(Boolean);
// Every label is made of the title's own words (no rewriting, so it keeps its language).
const fromTitle = (label, title) => {
  const pool = new Set(words(cleanTitle(title).replace(/[-_./]/g, ' ')).concat(words(cleanTitle(title))));
  return words(label).every((w) => pool.has(w) || /^(and|or|und|oder|&|\+)$/.test(w));
};

// The user's real thread titles at desk width.
const real = {
  'Polish Office Cards and Device Offices': 'Office Cards',
  'Fix Codex Integration Failure': 'Codex Integration',
  'Free Up Full Linux System Drive': 'Linux System Drive',
  'Native CorelDRAW Performance on Linux': 'CorelDRAW on Linux',
  'Troubleshoot CachyOS Desktop Setup': 'CachyOS Desktop',
  'Fix Codex Provider Startup Failure': 'Codex Startup',
  'Polish Lucid for Public Release': 'Lucid Release',
};
for (const [title, want] of Object.entries(real)) assert.equal(topicLabel(title, DESK_TOPIC).text, want, title);
const more = ['Run CorelDRAW Natively on CachyOS KDE', 'M3 MAX WP Water Video for Hall 7', 'Fix Linux Desktop Effects and Behavior', 'Fix Herr Niess Website Bugs',
  'FL Studio Linux Performance and Plugins', 'M3 MAX WP Hall 7 Trade Show Video', 'Make the sidebar remember its width across restarts and windows',
  'Fix Sidebar: Thread Order and Pins', '[WIP] Investigate memory leak in WebGL renderer', 'Add i18n support for the onboarding (German, French)', 'refactor verify-chat-robot-marks.mjs'];
// German titles keep German words: the imperative or trailing infinitive goes, the topic stays.
const german = {
  'Verbessere die Ladezeit der Startseite': 'Ladezeit Startseite',
  'Neue Rechnungsvorlage für Kunden erstellen': 'Rechnungsvorlage',
  'Fehler im Login-Formular beheben': 'Login-Formular',
};
for (const [title, want] of Object.entries(german)) assert.equal(topicLabel(title, DESK_TOPIC).text, want, title);
assert.equal(topicLabel('Fix Herr Niess Website Bugs', 110).text, 'Niess Website', 'honorifics go before the name does');
assert.equal(topicLabel('Run CorelDRAW Natively on CachyOS KDE', 190).text, 'CorelDRAW on CachyOS KDE', 'adverbs go first');
assert.equal(topicLabel('Run CorelDRAW Natively on CachyOS KDE', 150).text, 'CorelDRAW on CachyOS', 'a preposition stays with the name after it');
assert.ok(!/WIP|Investigate/.test(topicLabel('[WIP] Investigate memory leak in WebGL renderer', DESK_TOPIC).text), 'tags and the leading verb go');

// Short titles stay exactly as written; the empty desk keeps its words.
assert.equal(topicLabel('Add dark mode', DESK_TOPIC).text, 'Add dark mode');
assert.equal(topicLabel('Free desk', DESK_TOPIC, estimateWidth, { task: false }).text, 'Free desk');
assert.equal(topicLabel('fix the website header', 100).text, 'website header', 'a lowercase title stays lowercase');
assert.equal(topicLabel('Fix the website header', 100).text, 'Website header', 'a capitalized title starts with a capital');
assert.equal(topicLabel('Fix the thing…', DESK_TOPIC).text, 'Fix the thing', 'an ellipsis in a title is dropped, not shown');
assert.equal(topicLabel('   ', DESK_TOPIC).text, '');

// Every title, every width: one line of whole words that fits, never an ellipsis, deterministic.
const titles = [...Object.keys(real), ...more, ...Object.keys(german), 'Datenbankmigrationsskriptoptimierung', 'x'.repeat(80), 'A very long title… that already ends in dots...'];
for (const title of titles) for (const width of [DESK_TOPIC, 110, 90, 72]) {
  const fit = topicLabel(title, width);
  assert.ok(!ELLIPSIS.test(fit.text), `no ellipsis: ${title} @${width} -> ${fit.text}`);
  assert.ok(!/\n/.test(fit.text) && fit.text === fit.text.trim(), 'one clean line');
  assert.deepEqual(topicLabel(title, width), fit, 'deterministic');
  if (fit.fits) assert.ok(estimateWidth(fit.text) <= width, `fits: ${title} @${width} -> ${fit.text}`);
  assert.ok(fromTitle(fit.text, title), `whole words of the title: ${title} -> ${fit.text}`);
  if (estimateWidth(cleanTitle(title)) > width) assert.ok(words(fit.text).filter((w) => !/^(and|or|&|for|on|in|of|with|für|im|mit)$/.test(w)).length <= 4, `a short topic: ${fit.text}`);
}
// One compound wider than the plate is reported (the plate fades it out) instead of chopped with dots.
const compound = topicLabel('Datenbankmigrationsskriptoptimierung', 90);
assert.equal(compound.fits, false); assert.equal(compound.text, 'Datenbankmigrationsskriptoptimierung');
assert.equal(topicLabel('refactor verify-chat-robot-marks.mjs', 72).text.split(' ').length <= 3, true, 'file names split into their words');
console.log('PASS: topic labels for real and German titles, short titles kept, no ellipsis, whole words, fit and determinism');

// Plates stay readable at every zoom: at least 11px of topic on screen, never wider than a
// workstation in the far view, and stepping back when even a short topic would not fit.
let last = Infinity;
for (let s = 5; s >= 0.05; s *= 0.93) {
  const v = plateView(s);
  assert.ok(v.zoom >= 1, 'never smaller than its own size');
  if (v.form !== 'hidden') assert.ok(v.zoom * s * 12 >= 11 - 0.1, `readable at zoom ${s.toFixed(3)}`);
  if (v.form === 'desk') assert.equal(v.budget, DESK_TOPIC);
  if (v.form === 'far') { assert.ok((v.budget + 16) * v.zoom <= 380 + 1, 'no wider than a workstation'); assert.ok(v.budget <= last, 'fewer words as the camera pulls back'); last = v.budget; }
  if (s > 1) assert.deepEqual(plateView(s), { form: 'desk', zoom: 1, budget: DESK_TOPIC });
}
assert.equal(plateView(0.6).form, 'desk'); assert.equal(plateView(0.3).form, 'far'); assert.equal(plateView(0.1).form, 'hidden');
console.log('PASS: plate zoom keeps topics readable, within a workstation, in a few stable widths');

// Same plate in every state: only the ring (box-shadow) changes, there is no hover-only content.
const css = (await read('src/office/plates.css')).replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
for (const r of rules.filter((r) => /robot-hover|chat-open|:hover|:focus/.test(r.sel) && /desk-plate/.test(r.sel)))
  assert.deepEqual(r.body.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean), ['box-shadow'], `state rule only rings the plate: ${r.sel}`);
const plate = rules.find((r) => r.sel === '.desk-plate').body;
assert.ok(/white-space: nowrap/.test(plate) && /width: max-content/.test(plate) && /scale: var\(--plate-zoom/.test(plate), 'one line, sized to its words, zoomed by the camera');
assert.ok(!/line-clamp|text-overflow|ellipsis/.test(css), 'no clamping or ellipsis on plates');
const office = await read('src/office/office.css');
assert.ok(!/label-detail|compact-title/.test(office) && !/\.desk-plate/.test(office), 'the old compact/hover swap is gone');
assert.ok(!/\.room-name \{[^}]*line-clamp/.test(office), 'room names are one line');
const desk = await read('src/office/desk.ts');
assert.ok(!/…|shortTitle|compactTitle/.test(desk) && /fitTopic\(/.test(desk), 'desks label through the shortener');
assert.ok(!/plate\.title\s*=/.test(desk), 'no native tooltip that differs from the card');
const roomArt = await read('src/office/world/room-art.ts');
assert.ok(/roomSign\(/.test(roomArt) && !/foreignObject[^>]*><div[^>]*class="room-name"/.test(roomArt), 'room signs are one fitted line');
const camera = await read('src/office/world/camera-view.ts');
assert.ok(/this\.syncPlates\(\)/.test(camera) && /this\.hidePlateCard\(\)/.test(camera), 'plates follow the settled camera and the card hides when it moves');
const plates = await read('src/office/world/plates.ts');
assert.ok(/role", "tooltip"/.test(plates) && /aria-describedby/.test(plates) && /focusin/.test(plates) && /statusBadge\(/.test(plates), 'the card is a tooltip for pointer and keyboard with the shared status');
assert.ok(/This chat is open/.test(plates) && /Click to open this chat/.test(plates));
console.log('PASS: nameplate states only add a ring, no clamping, one-line room signs, hover card for pointer and keyboard');

// Question cards in the question line: whole sentences or clauses, never an ellipsis.
const queue = await read('src/world/queue.ts');
const fn = queue.slice(queue.indexOf('export function shortQuestion'), queue.indexOf('\n}\n', queue.indexOf('export function shortQuestion')) + 2).replace('export ', '');
const shortQuestion = new Function(`${(await transformWithOxc(fn, 'q.ts')).code};return shortQuestion`)();
assert.equal(shortQuestion('Should I keep the old API? It is used by two clients.'), 'Should I keep the old API?');
const long = 'Which of the three migration strategies should I use for the billing tables, given that the reporting jobs read from them every night and cannot be paused';
assert.equal(shortQuestion(long), 'Which of the three migration strategies should I use for the billing tables');
assert.equal(shortQuestion('x'.repeat(200), 'Billing tables'), 'Billing tables');
for (const q of [long, 'a '.repeat(120), 'Short one…', 'Is this fine...']) assert.ok(!ELLIPSIS.test(shortQuestion(q)), q);
assert.ok(!/line-clamp/.test((await read('src/world/world.css')).match(/\.world-card span \{[^}]*\}/)[0]), 'question cards are not clamped');
console.log('PASS: question cards show whole sentences or clauses, never an ellipsis');
