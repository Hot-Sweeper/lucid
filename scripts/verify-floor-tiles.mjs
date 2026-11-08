// Checker parity must survive odd/even widths and width changes at partial tiles.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const input = (await readFile(new URL('../src/perf/floor-paths.ts', import.meta.url), 'utf8')).replace(/^import .*$/gm, '');
const source = await transformWithOxc(input, 'floor-paths.ts');
const { cafeTiles } = await import('data:text/javascript;base64,' + Buffer.from(source.code).toString('base64'));
let cases = 0;
for (const w of [47, 48, 49, 95, 96, 97, 420, 540, 960, 1380, 1800, 2220, 2640]) {
  for (const top of [0, 90]) {
    const cols = Math.ceil(w / 48);
    const tiles = [...cafeTiles(w, 580, top, '#light', '#dark').matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="46" height="46" rx="3" fill="([^"]+)" opacity="0.9"\/>/g)];
    assert.equal(tiles.length, cols * Math.ceil(580 / 48));
    for (let i = 0; i < tiles.length; i++) {
      const [, x, y, color] = tiles[i];
      const col = (+x - 1) / 48, row = (+y - top - 1) / 48;
      assert.equal(color, (col + row) % 2 ? '#light' : '#dark');
      if (col) assert.notEqual(color, tiles[i - 1][3], `horizontal neighbors at width ${w}`);
      if (row) assert.notEqual(color, tiles[i - cols][3], `vertical neighbors at width ${w}`);
    }
    cases++;
  }
}
console.log(`Floor checkerboard: ${cases} widths/offsets retain alternating neighbors and stable origin.`);
