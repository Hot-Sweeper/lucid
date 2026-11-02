import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const tileCode = (await transformWithOxc(await readFile(new URL('../src/perf/tile-grid.ts', import.meta.url), 'utf8'), 'tile-grid.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const quietCode = (await transformWithOxc(await readFile(new URL('../src/perf/raster-quiet.ts', import.meta.url), 'utf8'), 'raster-quiet.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const code = quietCode+'\n'+tileCode+'\n'+(await transformWithOxc((await readFile(new URL('../src/perf/static-art.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm,''), 'static-art.ts')).code
  .replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
let color = '#112233';
const api = new Function('getComputedStyle', 'document', 'devicePixelRatio', 'window', `${code};return {StaticRun,updateStaticArt}`)(
  () => ({ getPropertyValue: () => color }), { addEventListener() {} }, 1.5, {});
const stale = { refs: 2 }, svg = { isConnected: true, parentElement: null };
const surface = Object.create(api.StaticRun.prototype);
const events = [];
Object.assign(surface, {
  svg, dependencies: ['--floor'], dependency: color, generation: 7, request: 'old-request', failedUntil: Infinity,
  asset: stale, crop: { x: 0, y: 0, w: 400, h: 300, density: 1.5 },
  image: { removeAttribute: key => events.push(['remove', key]) },
  fallback: () => events.push(['native']),
  serialize() { this.dependency = color; events.push(['serialize', color]); },
  update(immediate) { events.push(['update', immediate]); assert.equal(this.asset, null); assert.equal(this.crop, null); },
});
surface.invalidate();
assert.equal(events.length, 0, 'unchanged inherited variables must not cause redraws');
color = '#abcdef';
surface.invalidate();
assert.deepEqual(events, [['native'], ['remove', 'href'], ['serialize', color], ['update', true]]);
assert.equal(stale.refs, 1, 'invalidating one owner must release its stale asset without affecting another owner');
assert.equal(surface.generation, 8, 'old asynchronous raster jobs must be invalidated');
assert.equal(surface.request, ''); assert.equal(surface.failedUntil, 0);

// Exercise the actual update path with a valid cache and a camera density change.
api.updateStaticArt({ x: 0, y: 0, s: 1 }, 300, 200);
const native = Object.create(api.StaticRun.prototype);
let shown = 0, restored = 0;
Object.assign(native, {
  svg, dead: false, ready: true, loading: true, bounds: { x: 0, y: 0, w: 800, h: 600 },
  crop: { x: 0, y: 0, w: 600, h: 500, density: 1.5 },
  show() { shown++; }, fallback() { restored++; },
});
native.update(); assert.equal(shown, 1); assert.equal(restored, 0);
api.updateStaticArt({ x: 0, y: 0, s: .8 }, 300, 200);
native.update(); assert.equal(shown, 2); assert.equal(restored, 0, 'zooming out must reuse sharper pixels when their geometry still covers the view');
assert.equal(native.covers(native.crop, { x: 0, y: 0, w: 375, h: 250, density: 1.2 }, 80), true, 'overscan reuse must also accept sharper density');
assert.equal(native.covers(native.crop, { x: 0, y: 0, w: 700, h: 250, density: 1.2 }), false, 'lower density cannot compensate for missing geometry');
assert.equal(native.covers(native.crop, { x: 0, y: 0, w: 300, h: 200, density: 1.50001 }), false, 'even small magnification must preserve displayed pixel density');
api.updateStaticArt({ x: 0, y: 0, s: 1.2 }, 300, 200);
native.update(); assert.equal(shown, 2); assert.equal(restored, 1, 'magnifying cached art must immediately restore native vectors');
api.updateStaticArt({ x: -750, y: 0, s: 1 }, 300, 200);
native.update(); assert.equal(shown, 2); assert.equal(restored, 2, 'an uncovered pan must immediately restore native vectors');
console.log('PASS: inherited-source invalidation releases stale pixels, rejects old jobs, retains shared owners, skips unchanged colors, reuses sharper zoom-out crops and restores native vectors immediately on magnification or uncovered movement');

// Model decoder/backing ownership, not process RAM. A phone's active cache must
// respect admission even when every existing image is referenced by the DOM.
function rasterFixture(failure = '') {
  let sequence = 0, decodes = 0, sourcePixels = 0, pngPixels = 0, canvasPixels = 0;
  const urls = new Map(), canvases = [], timers = new Map();
  let timerNumber = 0, clock = 0;
  let decodeRelease=null;
  class Blob {
    constructor(parts, options) { this.text = parts.join(''); this.type = options.type; }
  }
  const URL = {
    createObjectURL(blob) { const url = `blob:${++sequence}`; urls.set(url, blob); return url; },
    revokeObjectURL(url) { urls.delete(url); },
  };
  class Image {
    value = ''; pixels = 0; kind = '';
    set src(value) {
      if (this.kind === 'image/svg+xml') sourcePixels -= this.pixels; else pngPixels -= this.pixels;
      this.value = value; this.pixels = 0; this.kind = '';
      const blob = urls.get(value); if (!blob) return;
      this.kind = blob.type;
      this.pixels = blob.pixels ?? Number(blob.text.match(/width="(\d+)"/)[1]) * Number(blob.text.match(/height="(\d+)"/)[1]);
      if (this.kind === 'image/svg+xml') sourcePixels += this.pixels; else pngPixels += this.pixels;
    }
    get src() { return this.value; }
    async decode() {
      decodes++;
      if(failure==='defer-source'&&this.kind==='image/svg+xml')await new Promise(resolve=>{decodeRelease=resolve;});
      if (failure === 'decode' || failure === 'png' && this.kind === 'image/png') throw Error('fixture decode');
      if (this.kind === 'image/png') { assert.equal(sourcePixels, 0, 'Source decoder releases before PNG decoding'); assert.equal(canvasPixels, 0, 'Encoding canvas releases before PNG decoding'); }
    }
  }
  let displayedLoads=0;
  const document = { hidden:false,addEventListener() {},querySelectorAll: () => [],createElementNS(namespace,tag){
    return {style:{},dataset:{},attributes:new Map(),children:[],getAttribute(name){return this.attributes.get(name)??null;},setAttribute(name,value){this.attributes.set(name,value);if(tag==='image'&&name==='href')queueMicrotask(()=>{if(this.attributes.get(name)===value){displayedLoads++;this.onload?.();}});},removeAttribute(name){this.attributes.delete(name);},append(...nodes){this.children.push(...nodes);},remove(){}};
  }, createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { w: 0, h: 0, get width() { return this.w; }, set width(v) { canvasPixels -= this.w * this.h; this.w = v; canvasPixels += this.w * this.h; },
      get height() { return this.h; }, set height(v) { canvasPixels -= this.w * this.h; this.h = v; canvasPixels += this.w * this.h; },
      getContext: () => ({ drawImage() { if (failure === 'draw') throw Error('fixture draw'); } }),
      toBlob(callback) {
        assert.equal(sourcePixels, 0, 'Source decoder releases before asynchronous PNG encoding');
        if (failure === 'encode') throw Error('fixture encoding');
        const blob = new Blob([], { type: 'image/png' }); blob.pixels = this.w * this.h;
        queueMicrotask(() => callback(blob));
      },
    }; canvases.push(canvas); return canvas;
  } };
  const window = { setTimeout: (callback, delay=0) => { const id = ++timerNumber; timers.set(id, {callback,due:clock+delay}); return id; } };
  const module = new Function('getComputedStyle', 'document', 'devicePixelRatio', 'window', 'Image', 'URL', 'Blob', 'performance', 'clearTimeout', 'setTimeout', `${code};return {StaticRun,TiledStaticRun,updateStaticArt,raster,assets,surfaces,staticArtStats,enableStaticArt,BUDGET_BLOCKED,CAMERA_MOVED,densityBucket,overscan}`)(
    () => ({}), document, 3, window, Image, URL, Blob, {now:()=>clock}, id=>timers.delete(id), window.setTimeout);
  module.updateStaticArt({ x: 0, y: 0, s: 1 }, 390, 844);
  clock=200;
  return { module, urls, timers, document,displayedLoads:()=>displayedLoads,releaseDecode(){const release=decodeRelease;decodeRelease=null;assert.ok(release,'A source decode is pending');release();}, advance:ms=>{clock+=ms}, runDue(){for(const [id,job]of[...timers])if(job.due<=clock){timers.delete(id);job.callback()}}, counts: () => ({ decodes, sourcePixels, pngPixels, canvasPixels, canvases: canvases.length }) };
}
const memory = rasterFixture(), cache = memory.module;
const margin = cache.overscan();
assert.deepEqual(margin, { x: 97.5, y: 211 }, 'Overscan is bounded to one quarter of each visible viewport dimension');
const crop = { x: 0, y: 0, w: 390 + margin.x * 2, h: 844 + margin.y * 2, density: cache.densityBucket(3) };
const first = await cache.raster('first scene', crop, () => true);
assert.ok(first && first !== cache.BUDGET_BLOCKED); first.refs = 1;
assert.equal(cache.staticArtStats().budgetBytes, 390 * 3 * 844 * 3 * 16);
assert.ok(cache.staticArtStats().bytes <= cache.staticArtStats().budgetBytes);
const attempts = memory.counts().decodes;
assert.equal(await cache.raster('another overlapping scene', crop, () => true), cache.BUDGET_BLOCKED, 'Referenced images cannot bypass the resident pixel budget');
assert.equal(memory.counts().decodes, attempts, 'An over-budget job allocates no decoder or canvas');
assert.deepEqual(memory.counts(), { decodes: 2, sourcePixels: 0, pngPixels: 0, canvasPixels: 0, canvases: 1 }, 'Successful jobs release every temporary backing');
first.refs = 0;
const second = await cache.raster('another overlapping scene', crop, () => true);
assert.ok(second && second !== cache.BUDGET_BLOCKED); second.refs = 1;
assert.equal(memory.urls.has(first.url), false, 'Admitting another raster evicts unused blob ownership first');
assert.ok(cache.staticArtStats().bytes <= cache.staticArtStats().budgetBytes);
const owner = { boundRaster() {}, update() {}, releaseRaster(asset) { if (asset === second) second.refs--; } };
cache.surfaces.add(owner);
cache.updateStaticArt({ x: 0, y: 0, s: 1 }, 100, 100);
cache.surfaces.delete(owner);
assert.equal(cache.staticArtStats().assets, 0, 'Viewport shrinking releases referenced caches which exceed its new budget');
assert.equal(memory.urls.size, 0, 'Shrinking releases all unneeded object URLs');
assert.equal(cache.staticArtStats().sources,0,'The final image releases its SVG source-key identity');
const tiledFixture=rasterFixture(),tiledApi=tiledFixture.module,tiledOwner=Object.create(tiledApi.TiledStaticRun.prototype);
let tiledHrefs=0,tiledGroups=0,tiledClips=0;
Object.assign(tiledOwner,{tiled:true,tiles:new Map(),displaying:null,paintTiles(){},update(){}});
for(let i=0;i<7;i++){
  const crop={x:i*512,y:0,w:514,h:514,density:1},asset=await tiledApi.raster('shared tiled source',crop,()=>true,{width:514,height:514});
  assert.ok(asset&&asset!==tiledApi.BUDGET_BLOCKED);asset.refs++;
  tiledOwner.tiles.set(String(i),{asset,image:{removeAttribute(key){assert.equal(key,'href');tiledHrefs++;}},group:{remove(){tiledGroups++;}},clip:{remove(){tiledClips++;}}});
}
tiledApi.surfaces.add(tiledOwner);tiledApi.updateStaticArt({x:0,y:0,s:1},100,100);tiledApi.surfaces.delete(tiledOwner);
assert.ok(tiledApi.staticArtStats().bytes<=tiledApi.staticArtStats().budgetBytes,'Viewport shrinking releases actual tiled SVG owners before retaining too many pixels');
assert.equal(tiledOwner.tiles.size,1);assert.equal(tiledHrefs,6);assert.equal(tiledGroups,6);assert.equal(tiledClips,6);
tiledOwner.releaseRaster();tiledApi.enableStaticArt(false);
assert.equal(tiledHrefs,7);assert.equal(tiledApi.staticArtStats().sources,0);assert.equal(tiledFixture.urls.size,0,'Final tiled teardown releases every image URL and shared source identity');
for (const failure of ['decode', 'draw', 'encode', 'png']) {
  const fixture = rasterFixture(failure);
  assert.equal(await fixture.module.raster('failure scene', crop, () => true), null);
  const counters = fixture.counts();
  assert.equal(counters.sourcePixels + counters.pngPixels + counters.canvasPixels, 0, `${failure} failure releases all temporary backings`);
  assert.equal(fixture.urls.size, 0, `${failure} failure revokes every temporary URL`);
  assert.equal(fixture.module.staticArtStats().rasterBytes, 0);
  assert.equal(fixture.module.staticArtStats().sources,0,'Failed jobs release their source-key identity');
}
const cancelled = rasterFixture('defer-source');
let current = true;
const cancelledJob = cancelled.module.raster('cancel during decode', crop, () => current);
for(let i=0;i<25;i++)await Promise.resolve();
assert.equal(cancelled.counts().decodes,1);
current=false;cancelled.releaseDecode();
assert.equal(await cancelledJob,cancelled.module.CAMERA_MOVED);
assert.deepEqual(cancelled.counts(), { decodes: 1, sourcePixels: 0, pngPixels: 0, canvasPixels: 0, canvases: 0 }, 'A cancelled decoder never allocates an encoding canvas');
assert.equal(cancelled.urls.size, 0);

const blocked = rasterFixture(), blockedApi = blocked.module;
const occupied = await blockedApi.raster('referenced raster', crop, () => true); occupied.refs = 1;
const delayed = Object.create(blockedApi.StaticRun.prototype);
const delayedView = { x: 2000, y: 2000, w: 390, h: 844, density: 3 };
Object.assign(delayed, { svg: { isConnected: true }, dead: false, ready: true, loading: false, generation: 0, failedUntil: 0, blockedRevision: -1, request: '', source: 'budget delayed scene',
  bounds: { x: 0, y: 0, w: 10000, h: 10000 }, asset: null, crop: null, density: 0, timer: 0,
  view: () => ({ ...delayedView }), show() {}, fallback() {}, image: { removeAttribute() {} },
});
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
const runTimers = async () => { blocked.advance(120); blocked.runDue(); await settle(); };
delayed.update(); await runTimers();
assert.equal(blocked.timers.size, 0);
for (let i = 0; i < 120; i++) delayed.update();
assert.equal(blocked.timers.size, 0, 'A stable over-budget surface must not enqueue a raster every camera frame');
assert.equal(blocked.counts().decodes, 2, 'Budget pressure causes no repeated decode work');
delayedView.w = 40;
delayed.update(); await runTimers();
assert.ok(delayed.asset, 'A smaller visible crop retries and fits without another owner releasing its pinned asset');
assert.equal(occupied.refs, 1);
assert.equal(blocked.counts().decodes, 4);
delayedView.w = 390;
delayed.update(); await runTimers();
assert.equal(delayed.asset, null, 'A larger crop cannot bypass pinned admission after a smaller crop succeeded');
const occupiedOwner = Object.create(blockedApi.StaticRun.prototype);
Object.assign(occupiedOwner, { asset: occupied, crop, image: { removeAttribute() {} }, fallback() {} });
occupiedOwner.releaseRaster();
delayed.update(); await runTimers();
assert.ok(delayed.asset, 'A deferred surface retries when a referenced owner releases its budget');
assert.equal(blocked.counts().decodes, 6);
assert.ok(blockedApi.staticArtStats().bytes <= blockedApi.staticArtStats().budgetBytes);
const detached = Object.create(cache.StaticRun.prototype), image = { style: {}, href: 'blob:old', removeAttribute() { this.href = ''; } };
const shared = { refs: 2 }, originalNodes = { childNodes: [{}] };
Object.assign(detached, { image, originals: originalNodes, holder: { dataset: {}, insertBefore() { originalNodes.childNodes = []; } }, asset: shared, crop, showing: true });
detached.releaseRaster();
assert.equal(image.href, '', 'Native fallback removes the connected image href rather than only hiding its decoded backing');
assert.equal(shared.refs, 1, 'Releasing an offscreen raster preserves another actual owner');

const moving = rasterFixture(), movingApi = moving.module, movingSurface = Object.create(movingApi.StaticRun.prototype);
Object.assign(movingSurface, { svg: { isConnected: true, parentElement: null }, dead: false, ready: true, loading: false, generation: 0, failedUntil: 0, blockedRevision: -1, request: '', source: 'latest moving scene',
  bounds: { x: 0, y: 0, w: 10000, h: 10000 }, asset: null, crop: null, density: 0, timer: 0, show() {}, fallback() {}, image: { removeAttribute() {} },
});
movingApi.surfaces.add(movingSurface);
for (let i=1;i<=100;i++) {
  moving.advance(16);
  movingApi.updateStaticArt({ x: -i*20, y: -500, s: 1 },390,844);
  moving.runDue(); await settle();
}
assert.equal(moving.counts().decodes,0,'One hundred ongoing pan movements start no SVG/PNG decoding');
assert.equal(moving.counts().canvases,0,'Moving camera allocates no raster backing');
moving.advance(119);moving.runDue();await settle();assert.equal(moving.counts().decodes,0);
moving.advance(1);moving.runDue();await settle();
assert.equal(moving.counts().decodes,2,'Settling starts exactly one source/PNG job for the latest camera');
assert.equal(movingSurface.crop.x,2000-97.5);assert.equal(movingSurface.crop.y,500-211);
assert.ok(movingSurface.asset);
const staleQueue = rasterFixture();
const oldRequest=staleQueue.module.raster('queued before movement',crop,()=>true);
staleQueue.module.updateStaticArt({x:-30,y:0,s:1},390,844);
assert.equal(await oldRequest,staleQueue.module.CAMERA_MOVED,'Queued work rechecks the camera revision before decoding');
assert.equal(staleQueue.counts().decodes,0);assert.equal(staleQueue.urls.size,0);
const hiddenQueue=rasterFixture('defer-source'),cell={x:0,y:0,w:514,h:514,density:1},tile={width:514,height:514};
const inFlight=hiddenQueue.module.raster('visible source enters decode',cell,()=>true,tile);await settle();
assert.equal(hiddenQueue.counts().decodes,1);
const queued=hiddenQueue.module.raster('queued before hide',{...cell,x:512},()=>true,tile);
hiddenQueue.document.hidden=true;hiddenQueue.releaseDecode();
assert.equal(await inFlight,hiddenQueue.module.CAMERA_MOVED);assert.equal(await queued,hiddenQueue.module.CAMERA_MOVED);
assert.deepEqual(hiddenQueue.counts(),{decodes:1,sourcePixels:0,pngPixels:0,canvasPixels:0,canvases:0},'Hiding cancels post-decode work and queued jobs before allocating a backing');
assert.equal(hiddenQueue.urls.size,0);assert.equal(hiddenQueue.module.staticArtStats().sources,0);
hiddenQueue.document.hidden=false;
const resumed=hiddenQueue.module.raster('queued before hide',{...cell,x:512},()=>true,tile);await settle();
assert.equal(hiddenQueue.counts().decodes,2,'A visibility wake immediately retries the unconsumed source');hiddenQueue.releaseDecode();
assert.ok(await resumed);hiddenQueue.module.enableStaticArt(false);assert.equal(hiddenQueue.urls.size,0);

const covered=rasterFixture('defer-source'),coveredOwner=Object.create(covered.module.TiledStaticRun.prototype);let inert=false,paints=0;
Object.assign(coveredOwner,{svg:{isConnected:true,closest:()=>inert?{}:null},dead:false,tiled:true,ready:true,generation:0,source:'covered owner source',bounds:{x:0,y:0,w:2000,h:1600},tiles:new Map(),wanted:new Map(),visibleTiles:[],blocked:new Map(),tileFailures:new Map(),tileLoading:false,displaying:null,view:()=>({x:300,y:90,w:390,h:844,density:3}),paintTiles(){paints++;},fallback(){throw Error('Hiding must preserve the existing source/fallback state');}});
coveredOwner.update();covered.document.hidden=true;await settle();
const wanted=coveredOwner.wanted.size,priorPaints=paints;
assert.ok(wanted>0);assert.equal(coveredOwner.tileLoading,false);assert.equal(covered.counts().decodes,0);
for(let i=0;i<100;i++)coveredOwner.update();await settle();
assert.equal(coveredOwner.wanted.size,wanted);assert.equal(paints,priorPaints);assert.equal(covered.module.staticArtStats().pending,0,'Hidden completion cannot restart the wanted queue');
covered.document.hidden=false;coveredOwner.update();inert=true;await settle();
assert.equal(covered.counts().decodes,0,'A job queued before its owner becomes inert must stop before decoding');assert.equal(coveredOwner.tileLoading,false);
inert=false;coveredOwner.update();await settle();
assert.equal(covered.counts().decodes,1,'The existing presentation update resumes wanted tiles after visibility returns');
inert=true;covered.releaseDecode();await settle();
assert.equal(coveredOwner.tileLoading,false);assert.equal(coveredOwner.tileFailures.size,0,'An inert cancellation is not a failed decode with a retry penalty');
assert.equal(covered.counts().canvases,0);const inertPaints=paints;
for(let i=0;i<100;i++)coveredOwner.update();await settle();assert.equal(paints,inertPaints);assert.equal(covered.counts().decodes,1);
inert=false;coveredOwner.update();await settle();assert.equal(covered.counts().decodes,2,'Uncovering resumes without camera movement or a five-second retry delay');
coveredOwner.dead=true;covered.releaseDecode();await settle();
assert.equal(covered.urls.size,0);assert.equal(covered.module.staticArtStats().pending,0);assert.equal(covered.module.staticArtStats().sources,0);
const pressure=rasterFixture(),pressureApi=pressure.module,pressureOwners=[];
pressureApi.updateStaticArt({x:0,y:0,s:1},100,100);
const drain=async()=>{pressure.advance(120);pressure.runDue();for(let i=0;i<1500;i++)await Promise.resolve();};
for(let i=0;i<3;i++){
  const owner=Object.create(pressureApi.TiledStaticRun.prototype);
  Object.assign(owner,{svg:{isConnected:true,parentElement:null},dead:false,tiled:true,ready:true,generation:0,source:i<2?'shared pressure source':'independent pressure source',bounds:{x:0,y:0,w:2000,h:1600},tiles:new Map(),wanted:new Map(),visibleTiles:[],blocked:new Map(),tileFailures:new Map(),tileLoading:false,displaying:null,definitions:pressure.document.createElementNS('','defs'),tileGroup:pressure.document.createElementNS('','g'),tileOwner:`pressure-${i}`,tileSerial:0,view:()=>({x:0,y:0,w:150,h:150,density:3}),paintTiles(){},fallback(){}});
  pressureOwners.push(owner);pressureApi.surfaces.add(owner);owner.update();
}
await drain();
assert.equal(pressureApi.staticArtStats().pending,0,'Shared cache-hit and budget-block finally paths must reach a finite idle state');
assert.deepEqual(pressureOwners.map(owner=>owner.tiles.size),[1,1,0]);assert.equal(pressure.counts().decodes,2,'The second owner shares the pinned tile without rerasterizing');
assert.equal(pressure.displayedLoads(),2);assert.ok(pressureOwners.every(owner=>!owner.tileLoading));
for(let i=0;i<100;i++)for(const owner of pressureOwners)owner.update();await drain();
assert.equal(pressure.counts().decodes,2);assert.equal(pressure.displayedLoads(),2);assert.equal(pressureApi.staticArtStats().pending,0,'A fixed covered view cannot spin cache-hit or blocked microtasks');
pressureOwners[0].releaseRaster();pressureOwners[2].update();await drain();
assert.equal(pressure.counts().decodes,2,'One shared owner releasing cannot bypass the remaining pinned reference');
pressureOwners[1].releaseRaster();pressureOwners[2].update();await drain();
assert.equal(pressureOwners[2].tiles.size,1);assert.equal(pressure.counts().decodes,4,'The blocked owner resumes exactly one source/PNG job after the last shared reference releases');
assert.equal(pressureApi.staticArtStats().pending,0);assert.ok(pressureApi.staticArtStats().bytes<=pressureApi.staticArtStats().budgetBytes);
for(const owner of pressureOwners){owner.dead=true;owner.releaseRaster();pressureApi.surfaces.delete(owner);}pressureApi.enableStaticArt(false);assert.equal(pressure.urls.size,0);
// Tile jobs share the same quiet deadline as viewport crops. The exact source
// may remain needed across a pan, but its scratch readback cannot run mid-input.
const movingTile=rasterFixture(),movingTileApi=movingTile.module;
movingTileApi.updateStaticArt({x:-1,y:0,s:1},390,844);
let tileReady=false;
const tileJob=movingTileApi.raster('moving stable tile',cell,()=>true,tile).then(result=>{tileReady=!!result&&result!==movingTileApi.CAMERA_MOVED;return result;});
for(let i=0;i<100;i++){
 movingTile.advance(8);movingTileApi.updateStaticArt({x:-2-i,y:0,s:1},390,844);movingTile.runDue();await settle();
 assert.equal(movingTile.counts().decodes,0);assert.equal(movingTile.counts().canvases,0);assert.ok(movingTile.timers.size<=1);assert.equal(tileReady,false);
}
movingTile.advance(119);movingTile.runDue();await settle();assert.equal(tileReady,false);
movingTile.advance(1);movingTile.runDue();await tileJob;assert.equal(tileReady,true);assert.equal(movingTile.counts().decodes,2);assert.equal(movingTile.timers.size,0);
movingTileApi.enableStaticArt(false);assert.equal(movingTile.urls.size,0);
console.log(JSON.stringify({sharedCachePressureIdle:true,stableUpdates:100,initialSourceAndPngDecodes:2,resumedSourceAndPngDecodes:2,pendingAfterEachPhase:0,finalURLs:0,tilePanEvents:100,movingTileDecodes:0,quietDeadlineMs:120}));
console.log(JSON.stringify({phoneViewport:[390,844],dpr:3,residentBudgetBytes:390*3*844*3*16,maximumCrop:[Math.ceil(crop.w*crop.density),Math.ceil(crop.h*crop.density)],referencedAdmissionBounded:true,temporaryDecodersReleased:true,exceptionBackingsReleased:true,offscreenHrefReleased:true,blockedFrameRetries:0,budgetReleaseResumes:true,smallerCropResumes:true,cancelledDecodeAllocations:0,panMovements:100,movingDecodes:0,settledRasterJobs:1,staleQueuedDecodes:0,hiddenQueuedDecodes:0,inertBackingAllocations:0,visibilityAndInertResume:true}));
