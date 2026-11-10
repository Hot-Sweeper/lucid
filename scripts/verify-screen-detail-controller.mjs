// Exercise the real LOD controller with deterministic layout and mutation delivery.
// Counts expensive work rather than relying on wall-clock timing on the test machine.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const compile = async name => (await transformWithOxc((await readFile(new URL(`../src/perf/${name}.ts`, import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''), `${name}.ts`)).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
const { screenDetail: detail, SCREEN_DETAIL_WIDTHS } = new Function(`${await compile('screen-detail-budget')};return {screenDetail,SCREEN_DETAIL_WIDTHS}`)();
const { paintDetailScene } = new Function(`${await compile('detail-scene')};return {paintDetailScene}`)();
let now=0, nextId=0, reads=0, canvases=0;
const timers=new Map(), observers=[];
const window={devicePixelRatio:1,setTimeout(fn,delay=0){const id=++nextId;timers.set(id,{fn,due:now+delay});return id;}};
const drain=()=>{let count=0;while(timers.size){assert.ok(++count<100,'Queue must settle');const [id,job]=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];timers.delete(id);now=Math.max(now,job.due);job.fn();}};
class Element {
  constructor(cls=''){this.className=cls;this.dataset={};this.style={setProperty(key,value){this[key]=value;}};this.attributes={};this.childNodes=[];this.parentElement=null;this.isConnected=true;this.tagName='DIV';this.offsetWidth=600;this.offsetHeight=360;}
  get outerHTML(){return JSON.stringify([this.tagName,this.className,this.attributes,this.children.map(c=>c.outerHTML)]);}
  getAttribute(name){return this.attributes[name]??null;}
  get children(){return this.childNodes.filter(n=>n instanceof Element);}
  get firstChild(){return this.childNodes[0];}
  matches(s){return s.split(',').some(part=>{const selector=part.trim();return selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):this.tagName.toLowerCase()===selector;});}
  cloneNode(){const copy=new Element(this.className);copy.tagName=this.tagName;return copy;}
  closest(s){for(let n=this;n;n=n.parentElement)if(n.matches(s))return n;return null;}
  contains(target){for(let n=target;n;n=n.parentElement)if(n===this)return true;return false;}
  querySelectorAll(s){const result=[];for(const child of this.children){if(s==='[data-detail-ready]'?child.dataset.detailReady:child.matches(s))result.push(child);result.push(...child.querySelectorAll(s));}return result;}
  querySelector(s){if(s===':scope > .screen-detail')return this.children.find(n=>n.matches('.screen-detail'))??null;if(s==='.win-body > :first-child')return this.querySelector('.win-body')?.children[0]??null;return this.querySelectorAll(s)[0]??null;}
  append(...nodes){for(const n of nodes){if(n.parentElement){n.parentElement.childNodes=n.parentElement.childNodes.filter(c=>c!==n);}n.parentElement=this;this.childNodes.push(n);}}
  replaceChildren(...nodes){for(const n of this.childNodes)n.parentElement=null;this.childNodes=[];this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=value;}
  getBoundingClientRect(){reads++;return {left:0,top:0,width:this.offsetWidth,height:this.offsetHeight};}
  getContext(){return new Proxy({}, {get:()=>()=>{}});}
}
const document={hidden:false,addEventListener(){},createElement(tag){if(tag==='canvas')canvases++;return new Element();},createRange(){return {selectNodeContents(){},getClientRects(){return [];}};}};
class Observer{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
const styles={display:'block',opacity:'1',backgroundColor:'#202030',color:'#eeeeff',borderRadius:'4',overflow:'hidden',overflowY:'hidden'};
const api=new Function('screenDetail','document','window','Element','HTMLElement','MutationObserver','performance','getComputedStyle','Node','clearTimeout','SCREEN_DETAIL_WIDTHS','paintDetailScene',`${await compile('screen-detail')};return {setScreenDetail,releaseScreenDetail}`)(detail,document,window,Element,Element,Observer,{now:()=>now},()=>{reads++;return styles;},{TEXT_NODE:3},id=>timers.delete(id),SCREEN_DETAIL_WIDTHS,paintDetailScene);
const host=new Element('screen'),layer=new Element('win-layer'),cursor=new Element('cursor');host.append(layer,cursor);
const dock=new Element('dock'),dockItem=new Element('dock-item'),dockSvg=new Element();dockSvg.tagName='svg';
const circle=new Element();circle.tagName='circle';circle.setAttribute('fill','#2fb5ff');dockSvg.append(circle);dockItem.append(dockSvg);dock.append(dockItem);host.append(dock);
const toastLayer=new Element('toast-layer');host.append(toastLayer);

const makeWin=(target=layer)=>{const w=new Element('win'),bar=new Element('win-bar'),body=new Element('win-body'),content=new Element('content'),message=new Element('message');const icon=new Element('ico authentic-app-icon');icon.tagName='svg';bar.append(icon);body.append(content);content.append(message);w.append(bar,body);target.append(w);return {w,body,message};};
const a=makeWin(),b=makeWin();
const mutation=(target,type='attributes',addedNodes=[])=>observers[0].cb([{target,type,addedNodes,removedNodes:[]}]);
api.setScreenDetail(host,true,320);
assert.equal(canvases,0,'Zoom callback must not synchronously traverse apps');
assert.equal(dockItem.style['--detail-mark-color'],'#2fb5ff','Dock inherits the existing icon primary color');
assert.equal(dockItem.style['--detail-mark-radius'],'50%','Round icon silhouette becomes a circle');
const toast=new Element('toast'),toastIcon=new Element();toastIcon.tagName='svg';const rect=new Element();rect.tagName='rect';rect.setAttribute('fill','#ffb84d');rect.setAttribute('width','24');rect.setAttribute('rx','3');toastIcon.append(rect);toast.append(toastIcon);toastLayer.append(toast);
mutation(toastLayer,'childList',[toast]);assert.equal(toast.style['--detail-mark-color'],'#ffb84d','New notifications automatically inherit shell LOD');
assert.equal(toast.style['--detail-mark-radius'],'3px','Square icon silhouette stays square');
const stop=new Element();stop.tagName='stop';stop.setAttribute('stop-color','#ff4f7b');toastIcon.append(stop);rect.setAttribute('fill','url(#brand-gradient)');
mutation(toastLayer,'childList',[toast]);assert.equal(toast.style['--detail-mark-color'],'#ff4f7b','Gradient icons use their own brand stop color');

// Each queue task may capture at most one window.
let job=[...timers][0];timers.delete(job[0]);job[1].fn();assert.equal(canvases,1);drain();assert.equal(canvases,2);
const baseCanvas=a.w.querySelector('.screen-detail').firstChild;
// A window can maximize immediately after opening. Its old-sized snapshot must
// not stretch for the ordinary 750ms content cadence.
a.w.style.width='800px';a.w.offsetWidth=800;
mutation(a.w);
assert.equal(a.w.querySelector('.screen-detail').firstChild,baseCanvas,'Resize retains its complete previous preview until the replacement is ready');
assert.ok([...timers.values()].some(t=>t.due===now),'Window resize bypasses content refresh throttle');
drain();
assert.ok(a.w.querySelector('.screen-detail').firstChild.width>baseCanvas.width,'Resizing repaints enough source pixels');
const resizedCanvas=a.w.querySelector('.screen-detail').firstChild;
const density=Number(resizedCanvas.dataset.sourceDensity);
api.setScreenDetail(host,true,420);drain();assert.equal(a.w.querySelector('.screen-detail').firstChild,resizedCanvas,'Same-tier zoom reuses maximum-tier density');
window.devicePixelRatio=2;api.setScreenDetail(host,true,420);drain();
assert.ok(Number(a.w.querySelector('.screen-detail').firstChild.dataset.sourceDensity)>=density,'Reduced views are sized in device pixels, so a DPR change keeps enough backing pixels');
api.setScreenDetail(host,true,320);drain();
const afterDensityCanvases=canvases;
const baselineReads=reads;mutation(cursor);drain();assert.equal(reads,baselineReads,'Cursor must cause zero captures');
mutation(a.message,'characterData');drain();assert.equal(canvases,afterDensityCanvases+1,'Typing refreshes only its own window');
mutation(a.message,'characterData');
job=[...timers][0];timers.delete(job[0]);job[1].fn();
assert.ok([...timers.values()].some(t=>t.due>now),'Content refresh is throttled');
api.setScreenDetail(host,true,160);
assert.ok([...timers.values()].some(t=>t.due===now),'Zoom bypasses a pending content throttle');
drain();assert.equal(canvases,afterDensityCanvases+1,'Icons allocate no canvas');
const overview=a.w.querySelector('.screen-detail-surface');
assert.equal(overview.children.length,1,'Farthest view contains only app color and icon, with no title bar');
const overviewIcon=overview.querySelector('.screen-detail-icon');
assert.ok(overviewIcon.querySelector('.authentic-app-icon'),'Overview preserves the real app icon');
assert.equal(overviewIcon.style['--screen-detail-icon-size'],'176px','Overview icon is substantially larger');
const iconReads=reads;for(let i=0;i<100;i++)mutation(a.message,'characterData');drain();assert.equal(reads,iconReads,'Icon tier ignores text updates');
api.setScreenDetail(host,true,240);drain();
const shapeIcon=a.w.querySelector('.screen-detail-icon');
assert.ok(shapeIcon.querySelector('.authentic-app-icon'),'Text-free core UI already shows the app icon');
assert.equal(shapeIcon.style['--screen-detail-icon-size'],'128px','Core UI icon is larger too');
const shapeReads=reads;
api.setScreenDetail(host,true,160);drain();api.setScreenDetail(host,true,240);drain();assert.equal(reads,shapeReads,'Returning to cached tiers requires zero layout/style reads');
api.setScreenDetail(host,true,520);assert.equal(host.dataset.screenDetail,undefined);assert.equal(a.w.dataset.detailReady,undefined);
api.setScreenDetail(host,true,160);drain();const c=makeWin();mutation(layer,'childList',[c.w]);drain();assert.equal(c.w.dataset.detailReady,'1','New apps inherit LOD automatically');
const beforeHidden=reads;api.setScreenDetail(host,false,160);mutation(c.w);drain();assert.equal(reads,beforeHidden,'Offscreen apps do no capture work');
// A paused/arriving desk can still be visibly on screen. It must receive the same
// visual tier without forcing background captures or leaking full-text app DOM.
const pausedHost=new Element('screen');api.setScreenDetail(pausedHost,false,320);
assert.equal(pausedHost.dataset.screenDetail,'lines');
const readAtPause=reads;drain();assert.equal(reads,readAtPause,'Paused tier updates require no snapshot');
api.setScreenDetail(pausedHost,false,160);assert.equal(pausedHost.dataset.screenDetail,'icon');
api.setScreenDetail(pausedHost,false,520);assert.equal(pausedHost.dataset.screenDetail,undefined);
api.releaseScreenDetail(pausedHost);
api.releaseScreenDetail(host);assert.ok(observers[0].disconnected);
const css=await readFile(new URL('../src/perf/screen-detail.css',import.meta.url),'utf8');
assert.ok(css.includes('[data-screen-detail] .win[data-detail-ready="1"] > :not(.screen-detail)'),'Detailed children hide only after their replacement is ready');
assert.ok(css.includes('.win:not([data-detail-ready="1"]) { -webkit-text-fill-color: currentColor; }'),'Cold captures retain readable source text');
assert.ok(css.includes('[data-screen-detail] .os-clock { visibility: hidden; }'));
assert.ok(css.includes('[data-screen-detail] .toast span { position: relative; visibility: hidden; }'));

console.log(JSON.stringify({cursorCaptures:0,typingWindowsRefreshed:1,iconCanvasAllocations:0,iconTypingLayoutReads:0,cachedTierLayoutReads:0,newAppsInherit:true,offscreenCaptures:0}));

// First-time transitions across a busy office must yield rather than walking every
// app in one task. Subsequent forward/reverse transitions reuse those exact nodes.
const busyHost=new Element('screen'),busyLayer=new Element('win-layer');busyHost.append(busyLayer);
const busyWins=[];
for(let i=0;i<8;i++) {
  const win=new Element('win'),bar=new Element('win-bar'),body=new Element('win-body');
  for(let j=0;j<480;j++)body.append(new Element('row'));
  win.append(bar,body);busyLayer.append(win);busyWins.push(win);
}
const coldReads=reads;api.setScreenDetail(busyHost,true,320);assert.equal(reads,coldReads,'Cold boundary changes perform no synchronous layout reads');
let maxReadsPerTask=0,tasks=0;
while(timers.size){const [id,job]=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];timers.delete(id);now=Math.max(now,job.due);const before=reads;job.fn();maxReadsPerTask=Math.max(maxReadsPerTask,reads-before);assert.ok(++tasks<100);}
assert.ok(tasks>8,'Large apps are captured across multiple cooperative tasks');
assert.ok(maxReadsPerTask<=140,`Bounded capture reads per task, got ${maxReadsPerTask}`);
for(const width of [240,160,240,320]){api.setScreenDetail(busyHost,true,width);drain();}
const warmReads=reads,warmCanvases=canvases;
for(let i=0;i<100;i++)for(const width of [240,160,240,320,520,320])api.setScreenDetail(busyHost,true,width);
drain();assert.equal(reads,warmReads,'600 cached boundary reversals must do zero layout/style reads');assert.equal(canvases,warmCanvases,'Warm reversals allocate zero canvases');
const retained=busyWins[0].querySelector('.screen-detail').firstChild;
const observer=observers.at(-1);
observer.cb([{target:busyWins[0].querySelector('.win-body').children[0],type:'characterData'}]);
assert.equal(busyWins[0].querySelector('.screen-detail').firstChild,retained,'Dirty content keeps its prior snapshot visible until refresh');drain();
const beforeMove=reads;busyWins[0].style.transform='translateX(20px)';observer.cb([{target:busyWins[0],type:'attributes',attributeName:'style'}]);drain();assert.equal(reads,beforeMove,'Composited window motion does not invalidate any app capture');
api.releaseScreenDetail(busyHost);drain();
console.log(JSON.stringify({coldCaptureTasks:tasks,maxLayoutStyleReadsPerTask:maxReadsPerTask,warmBoundaryChanges:600,warmLayoutReads:0,warmCanvasAllocations:0,staleViewRetained:true,windowMotionRecaptures:0}));

// The camera's stable-input shortcut must retain the detail observer. Windows
// opened after an unchanged pan still inherit the current presentation tier.
window.addEventListener=()=>{};
let detailUpdates=0;
const render=new Function('document','window','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','clearTimeout','beginSystem','endSystem','reportError','screenFrameRate','setScreenDetail','releaseScreenDetail',
  `${await compile('diagnostics')};const isAsleep=()=>false,onCalmChange=()=>()=>{};${await compile('render')};return {setRenderView,releaseRenderView}`)(document,window,undefined,()=>1,()=>{},id=>timers.delete(id),()=>-1,()=>{},error=>{throw error},()=>20,(...args)=>{detailUpdates++;api.setScreenDetail(...args)},api.releaseScreenDetail);
const observedHost=new Element('screen'),observedLayer=new Element('win-layer');observedHost.append(observedLayer);observedHost.classList={toggle(){}};
render.setRenderView(observedHost,true,140,820);
for(let i=0;i<120;i++)render.setRenderView(observedHost,true,140,820);
assert.equal(detailUpdates,1,'Stable pans enter the real detail controller only once');
const late=makeWin(observedLayer);
observers.at(-1).cb([{target:observedLayer,type:'childList',addedNodes:[late.w],removedNodes:[]}]);drain();
assert.equal(late.w.dataset.detailReady,'1','A new window inherits detail without another camera pipeline call');
assert.ok(late.w.querySelector('.authentic-app-icon'),'New reduced windows retain their actual app artwork');
render.releaseRenderView(observedHost);drain();
console.log(JSON.stringify({stablePans:120,detailControllerCalls:detailUpdates,newWindowObserverRetained:true}));

// Keep the renderer continuously busy: idle callbacks are deliberately withheld.
// Every first-time zoom tier must still appear, with bounded work on each frame.
const frames=new Map(),idles=new Map();
window.requestAnimationFrame=fn=>{const id=++nextId;frames.set(id,fn);return id;};
window.requestIdleCallback=fn=>{const id=++nextId;idles.set(id,fn);return id;};
window.cancelIdleCallback=id=>idles.delete(id);
const frameDrain=()=>{let count=0;while(frames.size){assert.ok(++count<30,'Urgent captures must complete in bounded frames');const [id,fn]=frames.entries().next().value;frames.delete(id);now+=16;const before=reads;fn(now);assert.ok(reads-before<=140,'Urgent frames preserve the capture work bound');}};
const responsiveHost=new Element('screen'),responsiveLayer=new Element('win-layer');responsiveHost.append(responsiveLayer);
const responsive=makeWin(responsiveLayer);for(let i=0;i<480;i++)responsive.body.append(new Element('row'));
const responsiveReads=reads;
for(const [width,tier] of [[160,'icon'],[240,'shapes'],[320,'lines'],[520,'full'],[320,'lines'],[240,'shapes'],[160,'icon']]){
  api.setScreenDetail(responsiveHost,true,width);frameDrain();
  assert.equal(responsiveHost.dataset.screenDetail,tier==='full'?undefined:tier);
  if(tier!=='full')assert.equal(responsive.w.querySelector('.screen-detail').dataset.detailTier,tier,'Displayed pixels follow the middle tier, not only the host attribute');
}
assert.ok(reads>responsiveReads,'Uncached middle tiers were actually captured');
assert.equal(idles.size,0,'Zoom tiers do not wait for idle time');
api.setScreenDetail(responsiveHost,true,320);frameDrain();
observers.at(-1).cb([{target:responsive.message,type:'characterData'}]);now+=2000;drain();
assert.equal(idles.size,1,'Ordinary content refresh still uses idle time');
assert.equal(frames.size,0,'Background content does not request urgent frames');
api.setScreenDetail(responsiveHost,true,240);assert.equal(idles.size,0,'A zoom transition cancels the pending idle wait');frameDrain();
assert.equal(responsive.w.querySelector('.screen-detail').dataset.detailTier,'shapes');
api.releaseScreenDetail(responsiveHost);drain();
console.log(JSON.stringify({busyRendererAllFourTiers:true,middleTierPixelsRestored:true,contentRefreshStaysIdle:true}));
