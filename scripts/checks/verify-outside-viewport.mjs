import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const compile = async (file) => (await transformWithOxc((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, ''), file)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const { outsideView, outsideProjection, outsideOverviewDensity } = new Function(`${await compile('../../src/office/outside-view.ts')};return {outsideView,outsideProjection,outsideOverviewDensity}`)();
const { setSvgAttribute } = new Function(`${await compile('../../src/perf/svg-write.ts')};return {setSvgAttribute}`)();

for (const [w,h] of [[4170,4920],[25827,16662],[4920,4170],[4000,4000],[400,90000],[90000,400],[1,1],[1600,900]]) {
  const density=outsideOverviewDensity(w,h),width=Math.max(1,Math.ceil(w*density)),height=Math.max(1,Math.ceil(h*density));
  assert.ok(width<=3200&&height<=3200,`${w}x${h} overview axis exceeded`);
  assert.ok(width*height<=6_000_000,`${w}x${h} overview pixel allocation exceeded`);
  assert.ok(density>0&&density<=1);
}
assert.equal(outsideOverviewDensity(0,100),0);

for (const s of [.02, .042028, .23, .65, 1, 2, 6]) for (const [x,y] of [[0,0],[-1234.5,-655.25],[250.75,400.125]]) {
  const cam = { x, y, s }, left = -3947, top = -5000, width = 1285, height = 837;
  const view = outsideView(cam, width, height, left, top);
  assert.ok(Math.abs(cam.x + (left + view.x) * s) < 1e-8);
  assert.ok(Math.abs(cam.y + (top + view.y) * s) < 1e-8);
  const p = outsideProjection({x:0,y:0,w:25827,h:16662},view,s);
  if (p) {
    assert.ok(p.dx >= -1e-8 && p.dy >= -1e-8);
    assert.ok(p.dx + p.dw <= width + 1e-8 && p.dy + p.dh <= height + 1e-8);
    const pointX = left + p.sx, pointY = top + p.sy;
    assert.ok(Math.abs(cam.x + pointX * s - p.dx) < 1e-8);
    assert.ok(Math.abs(cam.y + pointY * s - p.dy) < 1e-8);
  }
}
assert.equal(outsideView({x:0,y:0,s:0},100,100,0,0),null);
assert.equal(outsideProjection({x:0,y:0,w:10,h:10},{x:20,y:20,w:10,h:10},1),null);

// Deterministic DOM and decoder ownership fixture. Raster pixels are checked in
// the native browser artwork fixture; this exercises allocation/queue invariants.
const { planRasterTiles,snapTileCore }=new Function(`${await compile('../../src/perf/tile-grid.ts')};return {planRasterTiles,snapTileCore}`)();
let contextLossApi=true,missingContext=false,clock=1000,decodeGate=null,pngDecodeGate=null,encodeGate=null,consumerGate=null,failDecodes=0,failEncodes=0,activeDecodes=0,maxDecodes=0;
const quietTimers=new Map();let quietSerial=0;
const setQuietTimer=(callback,delay)=>{const id=++quietSerial;quietTimers.set(id,{callback,due:clock+delay});return id;};
const runQuietTimers=()=>{for(const[id,timer]of [...quietTimers])if(timer.due<=clock){quietTimers.delete(id);timer.callback();}};
class Element {
  constructor(kind){this.kind=kind;this.children=[];this.parent=null;this.style={};this.attributes={};this.dataset={};this.width=300;this.height=150;this.events=new Map();this.contextLost=false;this.draws=[];this.ctx={drawImage:(...args)=>this.draws.push(args),setTransform(){},isContextLost:()=>this.contextLost};}
  get isConnected(){return this.connected||!!this.parent?.isConnected;}
  get parentElement(){return this.parent;}
  setAttribute(k,v){this.attributes[k]=v;if(this.kind==='image'&&k==='href'){const ready=consumerGate||Promise.resolve();void ready.then(()=>{if(this.attributes.href===v)this.dispatch('load')});}}removeAttribute(k){delete this.attributes[k];}getAttribute(k){return this.attributes[k]??null;}
  attachShadow(){this.shadowRoot=new Element('shadow');this.shadowRoot.parent=this;return this.shadowRoot;}
  append(...children){for(const c of children){c.remove();c.parent=this;this.children.push(c);}}
  replaceChildren(...children){for(const child of [...this.children])child.remove();this.append(...children);}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}}
  querySelector(selector){return this.children.find(c=>selector==='.outside-live'&&c.className==='outside-live')||this.children.map(c=>c.querySelector(selector)).find(Boolean)||null;}
  querySelectorAll(selector){return this.children.flatMap(c=>[...(c.kind===selector?[c]:[]),...c.querySelectorAll(selector)]);}
  closest(){return this.inert?this:null;}
  getContext(){if(missingContext)return null;if(!contextLossApi)delete this.ctx.isContextLost;return this.ctx;}
  toBlob(callback){const finish=()=>{if(failEncodes){failEncodes--;callback(null);}else{this.encodedBlob=new Blob(['fixture-png'],{type:'image/png'});callback(this.encodedBlob);}};if(encodeGate)encodeGate.then(finish);else finish();}
  addEventListener(type,fn){const set=this.events.get(type)||new Set();set.add(fn);this.events.set(type,set);}
  removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
  dispatch(type){const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const fn of [...this.events.get(type)||[]])fn(event);return event;}
  get listenerCount(){return [...this.events.values()].reduce((sum,set)=>sum+set.size,0);}
}
const allocated=[],consumers=[],docEvents=new Map(),document={hidden:false,addEventListener:(type,fn)=>{const set=docEvents.get(type)||new Set();set.add(fn);docEvents.set(type,set);},removeEventListener:(type,fn)=>docEvents.get(type)?.delete(fn),dispatch:type=>{for(const fn of [...docEvents.get(type)||[]])fn();},createElement:kind=>{const e=new Element(kind);if(kind==='canvas')allocated.push(e);return e;},createElementNS:(_ns,kind)=>{const e=new Element(kind);if(kind==='image')consumers.push(e);return e;},importNode:node=>node};
class MutationObserver{constructor(callback){this.callback=callback;this.disconnected=false;}observe(){}disconnect(){this.disconnected=true;}fire(){if(!this.disconnected)this.callback();}}
class DOMParser{parseFromString(source){const node=new Element('svg');node.sourceMarkup=source;return{documentElement:node};}}
const urls=new Map(),blobs=[],fakeURL={createObjectURL(blob){const url='fixture:'+blobs.length;urls.set(url,blob);blobs.push(blob);return url;},revokeObjectURL(url){urls.delete(url);}};
const images=[];class Image{constructor(){images.push(this);}async decode(){activeDecodes++;maxDecodes=Math.max(maxDecodes,activeDecodes);try{if(decodeGate)await decodeGate;if(pngDecodeGate&&urls.get(this.src)?.type==='image/png')await pngDecodeGate;if(failDecodes){failDecodes--;throw Error('fixture decode failed');}}finally{activeDecodes--;}}removeAttribute(name){if(name==='src')this.src='';}}
const display={dpr:1.5};
const api=new Function('document','display','Image','URL','Blob','beginSystem','endSystem','outsideView','outsideProjection','setSvgAttribute','DOMParser','planRasterTiles','snapTileCore','Date','MutationObserver','performance','setTimeout','clearTimeout',
 `${await compile('../../src/perf/raster-quiet.ts')}\n${await compile('../../src/office/outside-cull.ts')}\n${(await compile('../../src/office/outside-zoom.ts')).replace(/\bdevicePixelRatio\b/g,'display.dpr')};return {paintOutside,updateOutside,caches}`)(document,display,Image,fakeURL,Blob,()=>0,()=>{},outsideView,outsideProjection,setSvgAttribute,DOMParser,planRasterTiles,snapTileCore,{now:()=>clock},MutationObserver,{now:()=>clock},setQuietTimer,id=>quietTimers.delete(id));
const settle=async(n=16)=>{clock+=120;runQuietTimers();for(let i=0;i<n;i++)await Promise.resolve();};
const drain=async cache=>{for(let i=0;i<3000;i++){await Promise.resolve();if(!cache.pending)return;if(quietTimers.size){clock=Math.max(clock,Math.min(...[...quietTimers.values()].map(t=>t.due)));runQuietTimers();}}throw Error('Tile queue did not drain');};
const source='<svg viewBox="0 0 25827 16662" width="25827" height="16662"></svg>';
function mount(width=390,height=844,dpr=3,cam={x:-3000,y:-4000,s:1}){display.dpr=dpr;const layer=new Element('div');layer.connected=true;layer.style={width:'25827px',height:'16662px',left:'0px',top:'0px'};const live=new Element('svg');live.className='outside-live';layer.append(live);api.paintOutside(layer,source);const cache=api.caches.get(layer);api.updateOutside(layer,cam,width,height);return{layer,live,cache};}
function assertCoverage(cache){
 const missing=cache.plans.filter(p=>!cache.tiles.has(p.key));assert.equal(cache.missingClip.children.length,missing.length);
 const view=outsideView(cache.cam,cache.width,cache.height,parseFloat(cache.layer.style.left),parseFloat(cache.layer.style.top)),cam={x:-view.x*cache.cam.s,y:-view.y*cache.cam.s,s:cache.cam.s};
 assert.deepEqual(cache.missingClip.children.map(r=>[+r.attributes.x,+r.attributes.y,+r.attributes.width,+r.attributes.height]).sort(),missing.map(p=>{const r=snapTileCore(p.core,cam,cache.dpr,cache.origin).world;return[r.x,r.y,r.w,r.h]}).sort());
 for(const [key,tile]of cache.tiles){assert.ok(tile.plan.width<=514&&tile.plan.height<=514);assert.equal(tile.image.getAttribute('href'),tile.url);assert.ok(urls.has(tile.url));assert.equal(tile.group.parent,cache.tileHost);assert.equal(tile.clip.parent,cache.tileDefs);assert.equal(tile.group.getAttribute('clip-path'),`url(#${tile.clip.getAttribute('id')})`);if(cache.wanted.has(key)){assert.equal(tile.group.style.display,'');assert.ok(tile.plan.density>=cache.cam.s*display.dpr*(1-1e-10));const r=snapTileCore(tile.plan.core,cam,cache.dpr,cache.origin).world;for(const field of ['x','y','w','h']){assert.equal(+tile.rect.getAttribute(field==='w'?'width':field==='h'?'height':field),r[field]);assert.equal(+tile.image.getAttribute(field==='w'?'width':field==='h'?'height':field),tile.plan.crop[field]);}}else assert.equal(tile.group.style.display,'none');}
 assert.ok(cache.retainedPixels()<=cache.pixelBudget());
 if(cache.plans.length){assert.notEqual(cache.nativeHost.style.display,'none');assert.ok(cache.nativeCrop.density>=cache.cam.s*display.dpr*(1-1e-10));assert.equal(cache.nativeContent.style.display,missing.length?'':'none');assert.equal(cache.nativeContent.getAttribute('clip-path'),`url(#${cache.clipId})`);}
 else assert.equal(cache.nativeHost.style.display,'none');
 if(!missing.length)assert.equal(cache.plane.dataset.presentation,cache.plans.length?'tiles':'empty');
 assert.equal(cache.preview.width*cache.preview.height,0);
}
function assertReleased(cache){assert.equal(cache.tiles.size,0);assert.equal(cache.images.size,0);assert.equal(cache.urls.size,0);assert.equal(cache.canvasEvents.size,0);assert.equal(cache.lostCanvases.size,0);assert.equal(cache.plane.parent,null);assert.equal(cache.gateObserver,null);assert.equal(cache.cancelConsumer,null);assert.equal(cache.rasterQuiet.waiting.size,0);assert.equal(cache.rasterQuiet.timer,null);}

// Construction keeps exact vectors. Expensive decode/readback work waits until
// the camera is quiet, without allocating a decoder or backing during input.
const first=mount(),cache=first.cache;assert.equal(images.length,0);assert.ok(cache.pending);assert.equal(cache.preview.width,0);assert.equal(allocated.filter(c=>c.width*c.height>0).length,0);assertCoverage(cache);
const originalHoles=[...cache.missingClip.children],originalHoleKeys=cache.plans.map(p=>p.key);
api.updateOutside(first.layer,{...cache.cam,x:cache.cam.x+.1},390,844);
assert.deepEqual(cache.plans.map(p=>p.key),originalHoleKeys);
assert.deepEqual(cache.missingClip.children,originalHoles,'moving the camera retains the existing native-hole clip nodes');
assertCoverage(cache);
api.updateOutside(first.layer,{x:-3000,y:-4000,s:1},390,844);
await drain(cache);assertCoverage(cache);assert.equal(cache.tiles.size,cache.plans.length);assert.equal(maxDecodes,1);
const warmImages=images.length,warmCanvases=allocated.length,warmTiles=new Map(cache.tiles),warmFirst=cache.tiles.values().next().value,warmOffset=warmFirst.rect.getAttribute('x');
for(let i=1;i<=100;i++){api.updateOutside(first.layer,{x:-3000+Math.sin(i)*.1,y:-4000+Math.cos(i)*.1,s:1},390,844);await settle(1);assertCoverage(cache);}
await drain(cache);assert.equal(images.length,warmImages);assert.equal(allocated.length,warmCanvases);assert.notEqual(warmFirst.rect.getAttribute('x'),warmOffset);for(const [key,tile]of warmTiles)assert.equal(cache.tiles.get(key),tile);
// Crossing an edge adds just the missing world-aligned column. Reversing a
// short pan reuses the retained columns, without rerendering the whole view.
api.updateOutside(first.layer,{x:-3020,y:-4000,s:1},390,844);await drain(cache);assertCoverage(cache);const edgeImages=images.length;
api.updateOutside(first.layer,{x:-3000,y:-4000,s:1},390,844);assertCoverage(cache);await drain(cache);assert.equal(images.length,edgeImages);
const sameLevel=images.length;api.updateOutside(first.layer,{x:-3000.3,y:-4000.4,s:1.00001},390,844);await drain(cache);assert.equal(images.length,sameLevel);assertCoverage(cache);
api.updateOutside(first.layer,cache.cam,390,844,0,{x:31.125,y:47.3});assertCoverage(cache);assert.equal(images.length,sameLevel);
// An upward LOD transition never displays the previous lower-density canvases.
const oldDensity=cache.plans[0].density;api.updateOutside(first.layer,{x:-3000,y:-4000,s:oldDensity/3*1.0001},390,844);assertCoverage(cache);assert.ok(cache.plans[0].density>oldDensity);await drain(cache);assertCoverage(cache);
assert.ok(allocated.every(c=>c.width*c.height===0),'retained PNG tiles keep no duplicate source canvas backing');
// A tile loss restores original vectors immediately, and a fresh independent
// tile replaces it. Stale image events cannot restart disposed owners.
const lost=cache.tiles.get(cache.plans[0].key).image,lostUrl=lost.getAttribute('href'),lostImages=images.length;lost.dispatch('error');assert.equal(lost.getAttribute('href'),null);assert.equal(lost.listenerCount,0);assert.equal(urls.has(lostUrl),false);assertCoverage(cache);clock+=1001;api.updateOutside(first.layer,cache.cam,390,844);await drain(cache);assertCoverage(cache);assert.equal(images.length,lostImages+2);lost.dispatch('error');await settle();assert.equal(images.length,lostImages+2);
// Fractional camera, all supported display densities and resize preserve sharp
// tiles and a viewport-derived retained pixel budget, including the guard.
for(const [W,H,dpr,s]of [[414,896,2,.23],[390,844,3,.65001],[320,240,.75,2.13],[1285,837,1.5,6],[390,844,3,.02]]){display.dpr=dpr;api.updateOutside(first.layer,{x:-912.123*s,y:-2301.456*s,s},W,H);assertCoverage(cache);await drain(cache);assertCoverage(cache);}
const backingPixels=cache.retainedPixels();cache.destroy();assertReleased(cache);

// Idle reserve requests warm nearby aligned cores after visible coverage, using
// only the existing history pixels. Camera movement cancels unstarted fringe.
const warm=mount();await drain(warm.cache);const warmVisible=warm.cache.plans.length;
api.updateOutside(warm.layer,warm.cache.cam,390,844,96);assert.ok(warm.cache.requests.length>warmVisible);assert.ok(warm.cache.requests.reduce((sum,p)=>sum+Math.round(p.crop.w*p.density)*Math.round(p.crop.h*p.density),0)<=warm.cache.pixelBudget());await drain(warm.cache);assertCoverage(warm.cache);assert.ok(warm.cache.tiles.size>warmVisible);
api.updateOutside(warm.layer,{...warm.cache.cam,x:warm.cache.cam.x+.1},390,844);assert.equal(warm.cache.requests.length,warm.cache.plans.length);warm.cache.destroy();assertReleased(warm.cache);

// Chromium emulation can report a tiny float DPR error while physical capture
// is exactly2x. Clip dimensions and inverse mapping must use one canonical grid;
// source density continues to satisfy the original, unrounded reported DPR.
const paired=[];
for(const rawDpr of [2,2+6e-8]){const pair=mount(390,844,rawDpr,{x:-3000.173,y:-4000.619,s:.65});await drain(pair.cache);assertCoverage(pair.cache);paired.push(pair.cache.plans.map(plan=>{const t=pair.cache.tiles.get(plan.key);assert.ok(plan.density>=rawDpr*.65);return[plan.key,...['x','y','width','height'].map(k=>t.rect.getAttribute(k)),...['x','y','width','height'].map(k=>t.image.getAttribute(k))]}));pair.cache.destroy();assertReleased(pair.cache);}
assert.deepEqual(paired[0],paired[1]);

// Crossing down through a density bucket keeps a complete sharper plan when
// its aligned cores still cover the viewport within the original pixel budget.
const reversal=mount(100,100,3,{x:-26,y:-26,s:1});await drain(reversal.cache);const reversalImages=images.length,reversalDensity=reversal.cache.plans[0].density;
api.updateOutside(reversal.layer,{x:50-76*.9,y:50-76*.9,s:.9},100,100);assertCoverage(reversal.cache);await drain(reversal.cache);assert.equal(images.length,reversalImages);assert.equal(reversal.cache.plans[0].density,reversalDensity);assert.equal(reversal.cache.plane.dataset.presentation,'tiles');reversal.cache.destroy();assertReleased(reversal.cache);

// A sharper complete plan may consume nearly all of the history allowance.
// An obsolete in-flight tile must not temporarily exceed that pixel ceiling.
document.hidden=true;const tight=mount(520,520,1,{x:-420*1.18,y:0,s:1.18});tight.cache.h=300;tight.layer.style.height='300px';document.hidden=false;
api.updateOutside(tight.layer,tight.cache.cam,520,520);await drain(tight.cache);api.updateOutside(tight.layer,{x:-500*1.18,y:0,s:1.18},520,520);await drain(tight.cache);assert.equal(tight.cache.tiles.size,3);
let releaseTight;decodeGate=new Promise(resolve=>releaseTight=resolve);api.updateOutside(tight.layer,{x:-4000,y:0,s:1},520,520);const obsolete=tight.cache.pending.canvas;
api.updateOutside(tight.layer,{x:-420,y:0,s:1},520,520);assert.equal(tight.cache.plane.dataset.presentation,'tiles');assert.ok(tight.cache.retainedPixels()+514**2>tight.cache.pixelBudget());
releaseTight();decodeGate=null;await drain(tight.cache);assert.equal(obsolete.width,0);assertCoverage(tight.cache);tight.cache.destroy();assertReleased(tight.cache);

// Source replacement must not copy a viewport snapshot that its first update
// would immediately discard. Original sharp SVG is present before tile decode.
const hand=mount();await drain(hand.cache);let snapshotCalls=0;hand.cache.snapshot=()=>{snapshotCalls++;throw Error('Discarded viewport copy');};const handoffCanvases=allocated.length;
api.paintOutside(hand.layer,source);const replacement=api.caches.get(hand.layer);assert.equal(snapshotCalls,0);assert.ok(allocated.slice(handoffCanvases).every(c=>c.width*c.height===0));
api.updateOutside(hand.layer,{x:-3000,y:-4000,s:1},390,844);assert.equal(replacement.plane.dataset.presentation,'vectors');assert.notEqual(replacement.nativeHost.style.display,'none');assert.ok(allocated.slice(handoffCanvases).every(c=>c.width*c.height===0));await drain(replacement);replacement.destroy();assertReleased(replacement);
// Only one old decode may survive a burst. All subsequent requests use the
// latest camera; no queue of obsolete intermediate viewports is retained.
let release;decodeGate=new Promise(resolve=>release=resolve);const late=mount(),pending=late.cache.pending.canvas;await settle();for(let i=0;i<100;i++)api.updateOutside(late.layer,{x:-6000-i*3,y:-7000,s:1},390,844);assert.equal(late.cache.images.size,1);assert.equal(pending.width,0);release();decodeGate=null;await drain(late.cache);assert.equal(pending.draws.length,0,'A superseded source decode must not draw or encode obsolete pixels');assert.equal(pending.encodedBlob,undefined);assert.equal(late.cache.failed.size,0,'Camera cancellation is not a failed tile');assertCoverage(late.cache);assert.equal(late.cache.plans.filter(p=>late.cache.tiles.has(p.key)).length,late.cache.plans.length);late.cache.destroy();assertReleased(late.cache);
// Moving during encoding must not create or decode a PNG for the old viewport.
let staleEncodeDone;encodeGate=new Promise(resolve=>staleEncodeDone=resolve);const staleEncode=mount();await settle();const staleEncodeCanvas=staleEncode.cache.pending.canvas;assert.ok(staleEncodeCanvas.draws.length);api.updateOutside(staleEncode.layer,{x:-8000,y:-9000,s:1},390,844);encodeGate=null;staleEncodeDone();await drain(staleEncode.cache);assert.ok(staleEncodeCanvas.encodedBlob);assert.equal(blobs.includes(staleEncodeCanvas.encodedBlob),false,'An obsolete encoded tile must not start another PNG decode');assert.equal(staleEncode.cache.failed.size,0);assertCoverage(staleEncode.cache);staleEncode.cache.destroy();assertReleased(staleEncode.cache);
// Decode failure leaves a precise fallback hole and a retryable key. It neither
// blocks the other tiles nor spins indefinitely on the failed image.
failDecodes=1;const retry=mount();await drain(retry.cache);assert.equal(retry.cache.plans.filter(p=>!retry.cache.tiles.has(p.key)).length,1);assertCoverage(retry.cache);clock+=1001;api.updateOutside(retry.layer,retry.cache.cam,390,844);await drain(retry.cache);assertCoverage(retry.cache);assert.equal(retry.cache.failed.size,0);retry.cache.destroy();assertReleased(retry.cache);
// A lost/unavailable context must leave finite retryable native holes. In
// particular, activation after a hidden startup cannot microtask-spin on them.
document.hidden=true;missingContext=true;const noContext=mount(),beforeNoContext=images.length;assert.equal(noContext.cache.pending,null);document.hidden=false;api.updateOutside(noContext.layer,noContext.cache.cam,390,844);await drain(noContext.cache);const failedContextImages=images.length;assert.equal(failedContextImages-beforeNoContext,noContext.cache.plans.length);assert.equal(noContext.cache.failed.size,noContext.cache.plans.length);await settle(500);for(let i=0;i<100;i++)api.updateOutside(noContext.layer,noContext.cache.cam,390,844);await settle(100);assert.equal(images.length,failedContextImages);assert.equal(noContext.cache.pending,null);assertCoverage(noContext.cache);missingContext=false;clock+=1001;api.updateOutside(noContext.layer,noContext.cache.cam,390,844);await drain(noContext.cache);assertCoverage(noContext.cache);assert.equal(noContext.cache.failed.size,0);noContext.cache.destroy();assertReleased(noContext.cache);
// Safari's missing optional isContextLost method must permit successful tiles.
contextLossApi=false;const safariStart=allocated.length,safari=mount();await drain(safari.cache);assertCoverage(safari.cache);assert.ok(allocated.slice(safariStart).filter(c=>c.draws.length).every(c=>typeof c.ctx.isContextLost==='undefined'));safari.cache.destroy();assertReleased(safari.cache);contextLossApi=true;
// Encoding owns no SVG decoder. A context loss during that asynchronous phase
// rejects the PNG, releases its canvas, and leaves a retryable exact native hole.
let encodeDone;encodeGate=new Promise(resolve=>encodeDone=resolve);const encoding=mount();await settle();const encodingCanvas=encoding.cache.pending.canvas;assert.ok(encodingCanvas.width>0);assert.equal(encoding.cache.images.size,0);assert.ok([...encoding.cache.urls].some(url=>urls.get(url).type==='image/svg+xml'),'source bytes remain alive through deferred encoding without retaining its decoder');const lossEvent=encodingCanvas.dispatch('contextlost');assert.equal(lossEvent.defaultPrevented,false);encodeGate=null;encodeDone();await drain(encoding.cache);assert.equal(encodingCanvas.width,0);assert.equal(encodingCanvas.listenerCount,0);assert.equal(encoding.cache.plans.filter(p=>!encoding.cache.tiles.has(p.key)).length,1);clock+=1001;api.updateOutside(encoding.layer,encoding.cache.cam,390,844);await drain(encoding.cache);assertCoverage(encoding.cache);encoding.cache.destroy();assertReleased(encoding.cache);
// PNG decoding starts only after source canvas/decoder release. Destroying the
// owner during that decode cancels its URL and cannot install a late tile.
let pngDone;pngDecodeGate=new Promise(resolve=>pngDone=resolve);const decoding=mount();await settle();assert.ok(decoding.cache.pending);assert.equal(decoding.cache.pending.canvas.width,0);assert.equal(decoding.cache.images.size,1);assert.ok([...decoding.cache.urls].every(url=>urls.get(url).type==='image/png'));decoding.cache.destroy();pngDecodeGate=null;pngDone();await settle(40);assertReleased(decoding.cache);
failEncodes=1;const badPng=mount();await drain(badPng.cache);assert.equal(badPng.cache.plans.filter(p=>!badPng.cache.tiles.has(p.key)).length,1);clock+=1001;api.updateOutside(badPng.layer,badPng.cache.cam,390,844);await drain(badPng.cache);assertCoverage(badPng.cache);badPng.cache.destroy();assertReleased(badPng.cache);
// Hidden presentation does not start jobs; a normal update resumes the queue.
document.hidden=true;const beforeHidden=images.length,hidden=mount();await settle();assert.equal(images.length,beforeHidden);document.hidden=false;api.updateOutside(hidden.layer,hidden.cache.cam,390,844);await drain(hidden.cache);assertCoverage(hidden.cache);hidden.cache.destroy();assertReleased(hidden.cache);
// A started decode which finishes after hiding/inerting must not draw, encode,
// commit or create a failure cooldown that would strand rapid resume.
for(const kind of ['hidden','inert']){let resume;decodeGate=new Promise(resolve=>resume=resolve);const paused=mount(),job=paused.cache.pending.canvas;if(kind==='hidden')document.hidden=true;else paused.layer.inert=true;decodeGate=null;resume();await drain(paused.cache);assert.equal(job.width,0);assert.equal(paused.cache.tiles.size,0);assert.equal(paused.cache.failed.size,0);assert.equal(paused.cache.urls.size,0);document.hidden=false;paused.layer.inert=false;api.updateOutside(paused.layer,paused.cache.cam,390,844);await drain(paused.cache);assertCoverage(paused.cache);paused.cache.destroy();assertReleased(paused.cache);}
// Decoder readiness does not prove that the actual connected SVG consumer is
// ready. A delayed consumer has an empty core while original vectors cover it.
// Hide, inert, camera replacement and destroy all cancel that wait promptly.
for(const kind of ['hidden','inert','camera','destroy','disconnect']){
 let consumeDone;consumerGate=new Promise(resolve=>consumeDone=resolve);const waiting=mount();await settle(50);assert.ok(waiting.cache.cancelConsumer);assert.ok(waiting.cache.pending);assert.equal(waiting.cache.pending.canvas.width,0);assert.equal(waiting.cache.tiles.size,0);assert.equal(waiting.cache.nativeContent.style.display,'');const group=waiting.cache.tileHost.children[0],image=group.children[0],clip=waiting.cache.tileDefs.children[0];assert.equal(clip.children[0].getAttribute('width'),'0');assert.equal(clip.children[0].getAttribute('height'),'0');
 if(kind==='hidden'){document.hidden=true;document.dispatch('visibilitychange');}
 if(kind==='inert'){waiting.layer.inert=true;waiting.cache.gateObserver.fire();}
 if(kind==='camera'){consumerGate=null;api.updateOutside(waiting.layer,{x:-8000,y:-9000,s:1},390,844);}
 if(kind==='destroy')waiting.cache.destroy();
 if(kind==='disconnect'){waiting.layer.connected=false;waiting.cache.gateObserver.fire();}
 await drain(waiting.cache);assert.equal(image.getAttribute('href'),null);assert.equal(image.listenerCount,0);assert.equal(group.parent,null);assert.equal(waiting.cache.cancelConsumer,null);assert.equal(waiting.cache.failed.size,0);
 consumerGate=null;consumeDone();document.hidden=false;waiting.layer.inert=false;
 if(kind==='hidden'||kind==='inert'||kind==='camera'){api.updateOutside(waiting.layer,waiting.cache.cam,390,844);await drain(waiting.cache);assertCoverage(waiting.cache);waiting.cache.destroy();}
 assertReleased(waiting.cache);
}
let finish;decodeGate=new Promise(resolve=>finish=resolve);const dying=mount();await settle();const dyingImage=images.at(-1),dyingCanvas=dying.cache.pending.canvas;dying.cache.destroy();assert.equal(dyingImage.src,'');assert.equal(dyingCanvas.width,0);assert.equal(dyingCanvas.listenerCount,0);finish();decodeGate=null;await settle();assertReleased(dying.cache);
// Continuous real camera changes must not decode, draw, or encode fresh tiles.
// Cached pixels remain reusable and exact native holes remain present throughout.
const cold=mount(),coldImages=images.length;
for(let i=0;i<100;i++){
 clock+=8;api.updateOutside(cold.layer,{x:-3000-i*3,y:-4000,s:1},390,844);runQuietTimers();
 for(let turn=0;turn<25;turn++)await Promise.resolve();
 assert.equal(images.length,coldImages);assert.equal(cold.cache.paints,0);assert.equal(cold.cache.urls.size,0);assert.ok(quietTimers.size<=1);assert.ok(cold.cache.canvasEvents.size<=2,'A canceled quiet job releases its canvas listeners immediately');assertCoverage(cold.cache);
}
clock+=119;runQuietTimers();for(let i=0;i<25;i++)await Promise.resolve();assert.equal(images.length,coldImages);
clock++;runQuietTimers();await drain(cold.cache);assert.ok(images.length>coldImages);assertCoverage(cold.cache);cold.cache.destroy();assertReleased(cold.cache);
// Hiding cancels a sleeping queue; showing can resume without another camera event.
const sleeping=mount();assert.equal(quietTimers.size,1);document.hidden=true;document.dispatch('visibilitychange');
for(let i=0;i<25;i++)await Promise.resolve();assert.equal(sleeping.cache.pending,null);assert.equal(quietTimers.size,0);
document.hidden=false;document.dispatch('visibilitychange');await drain(sleeping.cache);assertCoverage(sleeping.cache);sleeping.cache.destroy();assertReleased(sleeping.cache);
const abandoned=mount();assert.equal(quietTimers.size,1);abandoned.cache.destroy();
for(let i=0;i<25;i++)await Promise.resolve();assert.equal(quietTimers.size,0);assertReleased(abandoned.cache);
// A quiet waiter can resolve immediately before its owner's destruction. The
// resumed microtask must not touch the released canonical source or allocate a
// decoder after teardown, even though the prior wait resolved successfully.
const resolved=mount(),resolvedImages=images.length;clock+=120;runQuietTimers();resolved.cache.destroy();
for(let i=0;i<25;i++)await Promise.resolve();
assert.equal(images.length,resolvedImages);assert.equal(resolved.cache.pending,null);assertReleased(resolved.cache);
assert.throws(()=>resolved.cache.rasterSource.sourceFor({x:0,y:0,w:1,h:1},1),/destroyed/);
for(const blob of blobs.filter(b=>b.type==='image/svg+xml')){const root=(await blob.text()).match(/<svg\b[^>]*>/)[0];assert.ok(+root.match(/\bwidth="([^"]+)"/)[1]<=514);assert.ok(+root.match(/\bheight="([^"]+)"/)[1]<=514);}
assert.equal(urls.size,0);assert.equal(activeDecodes,0);assert.equal(maxDecodes,1);assert.ok(images.every(i=>i.src===''));assert.ok(allocated.every(c=>c.width*c.height===0));
assert.ok(consumers.every(image=>image.listenerCount===0));assert.ok([...docEvents.values()].every(set=>set.size===0));
console.log(JSON.stringify({continuousWarmPanEvents:100,warmPanRasterDecodes:0,maxConcurrentDecodes:maxDecodes,maxTileAxis:514,wholeWorldRasterJobs:0,retainedBeforeDestroy:backingPixels,images:images.length}));
console.log('PASS: world-aligned outdoor tiles, full-DPR upward LOD, moving cache reuse, exact missing-core fallback, guard-inclusive viewport budget, bounded decode queue, retry/context loss/Safari compatibility and cleanup');
