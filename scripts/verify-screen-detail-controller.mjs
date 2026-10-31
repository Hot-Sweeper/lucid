// Exercise the real LOD controller with deterministic layout and mutation delivery.
// Counts expensive work rather than relying on wall-clock timing on the test machine.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const compile = async name => (await transformWithOxc((await readFile(new URL(`../src/perf/${name}.ts`, import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''), `${name}.ts`)).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
const detail = new Function(`${await compile('screen-detail-budget')};return screenDetail`)();
let now=0, nextId=0, reads=0, canvases=0;
const timers=new Map(), observers=[];
const window={setTimeout(fn,delay=0){const id=++nextId;timers.set(id,{fn,due:now+delay});return id;}};
const drain=()=>{let count=0;while(timers.size){assert.ok(++count<100,'Queue must settle');const [id,job]=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];timers.delete(id);now=Math.max(now,job.due);job.fn();}};
class Element {
  constructor(cls=''){this.className=cls;this.dataset={};this.style={setProperty(key,value){this[key]=value;}};this.childNodes=[];this.parentElement=null;this.isConnected=true;this.tagName='DIV';this.offsetWidth=600;this.offsetHeight=360;}
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
  setAttribute(){}
  getBoundingClientRect(){reads++;return {left:0,top:0,width:this.offsetWidth,height:this.offsetHeight};}
  getContext(){return new Proxy({}, {get:()=>()=>{}});}
}
const document={hidden:false,addEventListener(){},createElement(tag){if(tag==='canvas')canvases++;return new Element();},createRange(){return {selectNodeContents(){},getClientRects(){return [];}};}};
class Observer{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
const styles={display:'block',opacity:'1',backgroundColor:'#202030',color:'#eeeeff',borderRadius:'4',overflow:'hidden',overflowY:'hidden'};
const api=new Function('screenDetail','document','window','Element','HTMLElement','MutationObserver','performance','getComputedStyle','Node','clearTimeout',`${await compile('screen-detail')};return {setScreenDetail,releaseScreenDetail}`)(detail,document,window,Element,Element,Observer,{now:()=>now},()=>{reads++;return styles;},{TEXT_NODE:3},id=>timers.delete(id));
const host=new Element('screen'),layer=new Element('win-layer'),cursor=new Element('cursor');host.append(layer,cursor);
const makeWin=()=>{const w=new Element('win'),bar=new Element('win-bar'),body=new Element('win-body'),content=new Element('content'),message=new Element('message');const icon=new Element('ico authentic-app-icon');icon.tagName='svg';bar.append(icon);body.append(content);content.append(message);w.append(bar,body);layer.append(w);return {w,body,message};};
const a=makeWin(),b=makeWin();
const mutation=(target,type='attributes',addedNodes=[])=>observers[0].cb([{target,type,addedNodes,removedNodes:[]}]);
api.setScreenDetail(host,true,250);
assert.equal(canvases,0,'Zoom callback must not synchronously traverse apps');
// Each queue task may capture at most one window.
let job=[...timers][0];timers.delete(job[0]);job[1].fn();assert.equal(canvases,1);drain();assert.equal(canvases,2);
const baselineReads=reads;mutation(cursor);drain();assert.equal(reads,baselineReads,'Cursor must cause zero captures');
mutation(a.message,'characterData');drain();assert.equal(canvases,3,'Typing refreshes only its own window');
mutation(a.message,'characterData');
job=[...timers][0];timers.delete(job[0]);job[1].fn();
assert.ok([...timers.values()].some(t=>t.due>now),'Content refresh is throttled');
api.setScreenDetail(host,true,140);
assert.ok([...timers.values()].some(t=>t.due===now),'Zoom bypasses a pending content throttle');
drain();assert.equal(canvases,3,'Icons allocate no canvas');
const overview=a.w.querySelector('.screen-detail-surface');
assert.equal(overview.children.length,1,'Farthest view contains only app color and icon, with no title bar');
const overviewIcon=overview.querySelector('.screen-detail-icon');
assert.ok(overviewIcon.querySelector('.authentic-app-icon'),'Overview preserves the real app icon');
assert.equal(overviewIcon.style['--screen-detail-icon-size'],'176px','Overview icon is substantially larger');
const iconReads=reads;for(let i=0;i<100;i++)mutation(a.message,'characterData');drain();assert.equal(reads,iconReads,'Icon tier ignores text updates');
api.setScreenDetail(host,true,190);drain();
const shapeIcon=a.w.querySelector('.screen-detail-icon');
assert.ok(shapeIcon.querySelector('.authentic-app-icon'),'Text-free core UI already shows the app icon');
assert.equal(shapeIcon.style['--screen-detail-icon-size'],'128px','Core UI icon is larger too');
const shapeReads=reads;
api.setScreenDetail(host,true,140);drain();api.setScreenDetail(host,true,190);drain();assert.equal(reads,shapeReads,'Returning to cached tiers requires zero layout/style reads');
api.setScreenDetail(host,true,400);assert.equal(host.dataset.screenDetail,undefined);assert.equal(a.w.dataset.detailReady,undefined);
api.setScreenDetail(host,true,140);drain();const c=makeWin();mutation(layer,'childList',[c.w]);drain();assert.equal(c.w.dataset.detailReady,'1','New apps inherit LOD automatically');
const beforeHidden=reads;api.setScreenDetail(host,false,140);mutation(c.w);drain();assert.equal(reads,beforeHidden,'Offscreen apps do no capture work');
api.releaseScreenDetail(host);assert.ok(observers[0].disconnected);
console.log(JSON.stringify({cursorCaptures:0,typingWindowsRefreshed:1,iconCanvasAllocations:0,iconTypingLayoutReads:0,cachedTierLayoutReads:0,newAppsInherit:true,offscreenCaptures:0}));
