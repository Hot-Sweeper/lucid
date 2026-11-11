// The Working ring's dashes are perfectly even at every size it is drawn at, and it turns about
// its centre (or not at all with reduced motion). Pure geometry on the real icon markup.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const read = (name) => readFile(new URL(`../../src/ui/${name}`, import.meta.url), 'utf8');
const source = (await read('icons.ts')).replace(/^import "\.\/icons\.css";$/m, '');
const { icon, WORKING_RING } = await import('data:text/javascript;base64,' + Buffer.from((await transformWithOxc(source, 'icons.ts')).code).toString('base64'));

const STROKE = 1.5; // px, non-scaling (src/ui/icons.css)
// The sizes it is drawn at: chat header 14, thread rows 16, monitor chip 18, plus a large one.
for (const size of [14, 16, 18, 28]) {
  const svg = icon('statusWorking', size);
  const r = Number(svg.match(/ r="([\d.]+)"/)[1]);
  const pathLength = Number(svg.match(/pathLength="([\d.]+)"/)[1]);
  const [dash, gap] = svg.match(/stroke-dasharray="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
  assert.equal(r, WORKING_RING.r);
  const periods = pathLength / (dash + gap);
  assert.equal(periods, Math.round(periods), `${size}px: the dash pattern repeats a whole number of times, so no gap is longer or shorter`);
  assert.equal(periods, WORKING_RING.count);
  // What is seen: a round cap adds half the stroke to both ends of every dash alike.
  const px = (size / 16) * (2 * Math.PI * r) / pathLength;
  const seenDash = dash * px + STROKE, seenGap = gap * px - STROKE;
  assert(seenGap >= 1, `${size}px: caps never close a gap (${seenGap.toFixed(2)}px)`);
  assert(seenDash > seenGap, `${size}px: it reads as dashes, not dots (${seenDash.toFixed(2)} / ${seenGap.toFixed(2)})`);
}
assert(/vector-effect: non-scaling-stroke/.test(await read('icons.css')), 'the stroke the math assumes is non-scaling');
const css = await read('status.css');
const turn = css.match(/\.status-icon\[data-icon="statusWorking"\] \{([^}]*)\}/)[1];
assert(/transform-origin: 50% 50%/.test(turn), 'turns about its centre');
assert(/linear infinite/.test(turn), 'a spinner runs at a constant speed');
assert(/will-change: transform/.test(turn), 'turns on its own layer, never re-snapped to the pixel grid');
assert(/@media \(prefers-reduced-motion: reduce\) \{ \.status-icon\[data-icon="statusWorking"\] \{ animation: none; \} \}/.test(css), 'reduced motion stops it');
console.log('PASS: the Working ring has even dashes at 14 to 28px, turns about its centre and stops for reduced motion');
