import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await readFile(new URL('../src/perf/screen-detail-budget.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source, 'screen-detail-budget.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const detail = new Function(`${code}; return screenDetail`)();
for (const [width, level] of [[0,'icon'],[159,'icon'],[160,'shapes'],[244,'shapes'],[245,'lines'],[339,'lines'],[340,'full'],[600,'full']]) {
  assert.equal(detail(width), level);
  for (const previous of ['full','lines','shapes','icon']) assert.equal(detail(width, previous), level);
}
// A wheel step and its inverse must restore exactly the starting representation.
for (let width=50; width<700; width+=.5) {
  const initial = detail(width);
  const away = detail(width * .9, initial);
  assert.equal(detail(width, away), initial);
}
console.log('Symmetric LOD cutoffs and 1300 wheel round trips passed.');
for (const width of [160,245,340]) {
  const restored = width * Math.exp(-120 * .0015) * Math.exp(120 * .0015);
  assert.equal(detail(restored), detail(width), 'Inverse physical wheel deltas preserve boundary tier');
}
