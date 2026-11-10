import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await readFile('src/office/landscape-tiles.ts', 'utf8');
const code = (await transformWithOxc(source.replace(/^import .*;\r?\n/gm, ''), 'landscape-tiles.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
let clock = 1000;
const element = () => ({ style: {}, dataset: {}, append() {}, addEventListener() {}, remove() {}, getContext: () => ({setTransform() {}}) });
const { LandscapeTiles } = new Function('document', 'requestAnimationFrame', 'performance', 'paintLandscape', code + ';return {LandscapeTiles}')({ createElement: element }, () => 1, {now:()=>clock}, ()=>{clock+=2});
const land = new LandscapeTiles();
Object.assign(land, { plan: {}, version: 1, tick: 1, wanted: 4, current: 1, lastDensity: 1, shownLevel: 1, overviewDensity: .1, origin: { x: -2048, y: 0 }, size: { w: 20000, h: 20000 } });
const records = [];
for (const i of [0, 1, 2, 3, ...Array.from({ length: 12 }, (_, n) => n + 100)]) {
  const tile = { key: `1:${i}:0`, level: 1, i, j: 0, canvas: element(), version: 1, used: 1, shown: true, lost: false };
  land.tiles.set(tile.key, tile); records.push(tile);
}
// Enter new ground on the left before traversing cells already on screen.
land.update({ x: -512, y: 0, w: 1024, h: 400 }, 1);
for (const record of records.slice(0, 2)) {
  assert.equal(land.tiles.get(record.key), record, 'a still-visible painted tile must survive a leftward pan at the cache cap');
  assert(!land.queue.includes(record), 'retained pixels must not be queued for repaint');
}
assert.equal(land.tiles.size, 16, 'recycling stays within the existing allocation cap');
assert(land.queue.length > 0, 'newly exposed ground is still painted');
console.log('PASS: full-view tile reservation preserves visible pixels during reverse pans at the cache cap.');

const paced = new LandscapeTiles();
Object.assign(paced, { plan: {}, look: {}, colors: {}, version: 1, movedAt: 0 });
for (let i=0;i<4;i++) {
  const t = { key: `1:${i}:0`, level: 1, i, j: 0, canvas: element(), version: -1, used: 1, shown: false, lost: false };
  paced.tiles.set(t.key,t); paced.queue.push(t);
}
paced.work();
assert.equal(paced.stats.tilesPainted,2,'resting terrain work must yield before consuming a 144 Hz frame');
assert.equal(paced.queue.length,2,'remaining terrain keeps its queue for later frames');
assert(paced.stats.maxSliceMs<=5,'the scheduler leaves time for compositor and presentation');
console.log('PASS: resting terrain yields within the display budget and preserves unfinished work.');

// Reproduce the screenshot's hard sharp/blurry boundary while a new zoom level loads.
const atomic = new LandscapeTiles();
Object.assign(atomic, { version: 1, view: {x:0,y:0,w:1024,h:512}, origin:{x:0,y:0},size:{w:1024,h:512},tick:2,presentedLevel:1 });
for(const level of [1,2])for(let j=0;j<level;j++)for(let i=0;i<2*level;i++){
 const t={key:`${level}:${i}:${j}`,level,i,j,canvas:element(),version:level===1||i===0&&j===0?1:-1,used:level===2?2:1,shown:false,lost:false};
 atomic.tiles.set(t.key,t);if(t.version<0)atomic.queue.push(t);
}
const displayed=()=>[...new Set([...atomic.tiles.values()].filter(t=>t.shown).map(t=>t.level))];
atomic.present(2);assert.deepEqual(displayed(),[1],'partly painted new LOD must not patch over the previous complete grid');
for(const t of atomic.tiles.values())t.version=1;
atomic.present(2);assert.deepEqual(displayed(),[2],'completed visible grids swap together without waiting for reserve tiles');
const lost=atomic.tiles.get('2:0:0');lost.lost=true;
atomic.present(2);assert.deepEqual(displayed(),[1],'a lost backing must never leave a visible hole in the current LOD');
atomic.tiles.get('1:0:0').version=0;
atomic.present(2);assert.deepEqual(displayed(),[1],'retain the valid part of the current level when neither complete grid covers the view');
assert(!atomic.tiles.get('1:0:0').shown,'stale scene pixels are never displayed');
console.log('PASS: atomic zoom-level transitions, complete retained fallback, context-loss fallback and scene-version isolation.');

for(const density of [.176776695, .713, 1, Math.SQRT2, 3]){
 const left={i:2,j:1,level:density,canvas:element(),shown:true},right={i:3,j:1,level:density,canvas:element(),shown:true};
 atomic.place(left);atomic.place(right);
 const value=(tile,key)=>Number(tile.canvas.style.cssText.match(new RegExp(key+':([-\\d.]+)px'))[1]);
 assert(Math.abs((value(left,'left')+value(left,'width')-value(right,'left'))*density-6)<1e-9,'adjacent opaque tiles overlap by six source pixels at fractional densities');
}
console.log('PASS: guarded terrain has overlapping coverage at fractional zoom densities.');

const pan = new LandscapeTiles();
Object.assign(pan,{version:1,view:{x:450,y:0,w:1024,h:400},origin:{x:0,y:0},size:{w:2048,h:512},presentedLevel:1,tick:2});
for(let i=0;i<3;i++)pan.tiles.set(`1:${i}:0`,{key:`1:${i}:0`,level:1,i,j:0,canvas:element(),version:i<2?1:-1,used:2,shown:i<2,lost:false});
pan.queue=[pan.tiles.get('1:2:0')];pan.present(1);
assert.equal([...pan.tiles.values()].filter(t=>t.shown).length,2,'one pending edge tile must not blank the entire visible terrain grid');
pan.tiles.get('1:2:0').version=1;pan.present(1);
assert.equal([...pan.tiles.values()].filter(t=>t.shown).length,3,'new edge pixels join the retained level when ready');
console.log('PASS: panning retains existing terrain while an exposed edge loads, without full-scene flashing.');
