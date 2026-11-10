import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

async function code(file) {
  return (await transformWithOxc((await readFile(file, 'utf8')).replace(/^import .*;\r?\n/gm, ''), file)).code
    .replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
}
let locale = 'en', listener;
const api = new Function('getLocale', 'onLocaleChange', 'uiText', (await code('src/localization-canvas.ts')) + ';return {canvasText,canvasLines,canvasLabel,redrawCanvasOnLocale};')(
  () => locale, fn => { listener = fn; }, text => text,
);
const ctx = { measureText: text => ({ width: [...text].length * 6 }), fillText(...args) { this.last = args; } };
assert.equal(api.canvasText('this is fine'), 'this is fine');
locale = 'de';
assert.equal(api.canvasText('this is fine'), 'Alles bestens');
assert.equal(api.canvasText('when the tests go green'), 'wenn alle Tests grün sind');
assert.equal(api.canvasText('Spaces look the same everywhere.'), 'Leerzeichen sehen überall gleich aus.');
assert.equal(api.canvasText('open ports: 10,000'), 'offene Ports: 10.000');
for (const [source, expected] of [
  ['AI CLOTH', 'KI-STOFF'], ['IS PERFECT', 'IST PERFEKT'], ['duet with @bun.bun', 'Duett mit @bun.bun'],
  ['robot dance fails part 7', 'Roboter-Tanzpannen, Teil 7'], ['tutorial 0.5x mirrored', 'Tutorial, 0,5-fach gespiegelt'],
  ['full speed', 'volles Tempo'], ['heart hands trend with my best bot', 'Herzhände mit meinem besten Bot'],
  ['Fail #2: the spin', 'Panne #2: die Drehung'], ['12/12 passing', '12/12 bestanden'],
]) assert.equal(api.canvasText(source), expected);
for (const literal of ['@bun.bun', '@capt.cache', '#duet #robotdance', 'rm -rf', ':wq', 'SnackDB', 'BoltCache', 'JavaScript', 'VIM']) {
  assert.equal(api.canvasText(literal), literal, 'handles, hashtags, commands and brands stay authored');
}
for (const literal of ['BotTube', 'UNTERMINATED', 'Kernel Panic Academy', 'index.html', 'for(;;)', 'return', 'O(n²)', 'gpt-6-luna']) {
  assert.equal(api.canvasText(literal), literal, 'identities, code and technical notation remain literal');
}
for (const text of ['Nutzungsbedingungen', 'Tests schreiben und wiederholen', 'erste Zeile\nzweite Zeile']) {
  const lines = api.canvasLines(ctx, text, 66);
  assert.ok(lines.every(line => ctx.measureText(line).width <= 66), 'German compounds fit the declared width');
  assert.equal(lines.join('').replaceAll(' ', ''), text.replaceAll(/\s/g, ''), 'wrapping retains every character');
}
api.canvasLabel(ctx, 'Select all squares with', 1, 2, 90);
assert.deepEqual(ctx.last, ['Wähle alle Felder mit', 1, 2, 90]);
api.canvasLabel(ctx, 'unknown authored text', 1, 2);
assert.deepEqual(ctx.last, ['unknown authored text', 1, 2]);
let draws = 0;
const canvas = { isConnected: true };
api.redrawCanvasOnLocale(canvas, () => { draws++; });
listener(); assert.equal(draws, 1);
api.redrawCanvasOnLocale(canvas, () => { draws += 2; });
listener(); assert.equal(draws, 3, 'reused thumbnail canvases repaint their latest video');
canvas.isConnected = false; listener(); assert.equal(draws, 3, 'removed canvases release repaint ownership');
locale = 'en';
assert.equal(api.canvasText('this is fine'), 'this is fine', 'switching back restores canonical English');

const drawSource = (await readFile('src/fun/draw.ts', 'utf8')).replace(/^import .*;\r?\n/gm, '');
const drawCode = (await transformWithOxc(drawSource, 'draw.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const drawText = new Function('canvasText', 'canvasLines', drawCode + ';return text;')(api.canvasText, api.canvasLines);
locale = 'de'; drawText(ctx, 'Attention', 30, 40, 12, '#fff');
assert.equal(ctx.last[0], 'Aufmerksamkeit');
assert.equal(ctx.last[3], ctx.measureText('Attention').width, 'single-line labels retain their artwork footprint');
console.log('Canvas localization passed: authored captions, code/name preservation, measured German wrapping, fitted labels, reused canvas repaint and detached-owner cleanup.');
