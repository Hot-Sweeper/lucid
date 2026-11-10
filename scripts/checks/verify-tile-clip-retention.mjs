import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const compile = async file => (await transformWithOxc((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, ''), file)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
class Node {
  attributes = new Map(); children = []; dataset = {}; parentNode = null; writes = 0; fragment = false;
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.writes++; this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...nodes) {
    for (const node of nodes) {
      if (node.fragment) { this.append(...node.children); continue; }
      node.remove(); this.children.push(node); node.parentNode = this;
    }
  }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
}
const document = { addEventListener() {}, createElementNS: () => new Node() };
const code = await compile('../../src/perf/raster-quiet.ts') + '\n' + await compile('../../src/perf/tile-grid.ts') + '\n' + await compile('../../src/perf/static-art.ts');
const api = new Function('document', 'window', 'devicePixelRatio', code + ';return {TiledStaticRun,updateStaticArt,planRasterTiles,snapTileCore}') (document, {}, 1.5);
const plans = api.planRasterTiles({ x: 0, y: 0, w: 1024, h: 512 }, { x: 0, y: 0, w: 1024, h: 512 }, 1);
assert.equal(plans.length, 2);
const rect = new Node(), nativeClip = new Node(), nativeGroup = new Node(), originals = new Node(); originals.fragment = true; nativeClip.id = 'native-fixture';
const run = Object.create(api.TiledStaticRun.prototype);
Object.assign(run, { tiles: new Map([[plans[0].key, { tile: plans[0], rect }]]), visibleTiles: plans, nativeRects: new Map(), nativeClip, nativeGroup,
  nodes: [], originals, holder: new Node(), painted: '', clipCamera: '', position: () => ({ x: 0, y: 0 }) });
api.updateStaticArt({ x: .1, y: .3, s: 1 }, 1024, 512);
run.paintTiles();
const hole = nativeClip.children[0]; assert.ok(hole); assert.equal(nativeClip.children.length, 1);
const initialWrites = rect.writes;
run.positionTile(run.tiles.get(plans[0].key));
assert.equal(rect.writes, initialWrites, 'identical snapped tile coordinates cause no SVG attribute writes');
for (let n = 0; n < 100; n++) {
  const cam = { x: .1 + Math.sin(n) * .2, y: .3 + Math.cos(n) * .2, s: 1 };
  api.updateStaticArt(cam, 1024, 512); run.paintTiles();
  assert.equal(nativeClip.children[0], hole, 'the same missing tile keeps its original clip node');
  const expected = api.snapTileCore(plans[1].core, cam, 1.5).world;
  for (const [key, value] of Object.entries(expected)) assert.equal(Number(hole.getAttribute(key === 'w' ? 'width' : key === 'h' ? 'height' : key)), value);
}
run.tiles.set(plans[1].key, { tile: plans[1], rect: new Node() }); run.paintTiles();
assert.equal(nativeClip.children.length, 0, 'loaded tiles release their native-hole nodes');
run.tiles.delete(plans[0].key); run.paintTiles();
assert.equal(nativeClip.children.length, 1); assert.notEqual(nativeClip.children[0], hole);
run.visibleTiles = []; run.paintTiles();
assert.equal(nativeClip.children.length, 0); assert.equal(run.nativeRects.size, 0);
console.log('PASS: native-hole clip identity across 100 camera changes, exact physical-pixel snapping, no redundant ready-tile writes, tile arrival/removal cleanup.');
