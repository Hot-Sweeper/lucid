import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const compile = async (file) => (await transformWithOxc((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, ''), file)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const { outsideView, outsideProjection, outsideOverviewDensity } = new Function(`${await compile('../src/office/outside-view.ts')};return {outsideView,outsideProjection,outsideOverviewDensity}`)();

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

class Element {
  constructor(kind) { this.kind=kind;this.children=[];this.parent=null;this.style={};this.attributes={};this.dataset={};this.width=300;this.height=150;this.ctx={drawImage(){},setTransform(){},clearRect(){}}; }
  get isConnected() { return this.connected || !!this.parent?.isConnected; }
  setAttribute(k,v){this.attributes[k]=v;}
  append(...children){for(const c of children){c.remove();c.parent=this;this.children.push(c);}}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}}
  querySelector(selector){return this.children.find(c=>selector==='.outside-live'&&c.className==='outside-live')||this.children.map(c=>c.querySelector(selector)).find(Boolean)||null;}
  getContext(){return this.ctx;}
}
const document={createElement:kind=>new Element(kind)},timers=new Map();let next=0;
const window={setTimeout:fn=>{timers.set(++next,fn);return next;}};
const layer=new Element('div');layer.connected=true;layer.style={width:'25827px',height:'16662px',left:'-3947px',top:'-5000px'};
const live=new Element('svg');live.className='outside-live';layer.append(live);
const urls=new Set(),fakeURL={createObjectURL(){const url='fixture:'+Math.random();urls.add(url);return url;},revokeObjectURL(url){urls.delete(url);}};
class Image { async decode(){} }
const api=new Function('document','window','clearTimeout','devicePixelRatio','Image','URL','Blob','beginSystem','endSystem','outsideView','outsideProjection','outsideOverviewDensity',
  `${await compile('../src/office/outside-zoom.ts')};return {paintOutside,updateOutside,caches}`)(document,window,id=>timers.delete(id),1.5,Image,fakeURL,Blob,()=>0,()=>{},outsideView,outsideProjection,outsideOverviewDensity);
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
api.paintOutside(layer,'<svg viewBox="0 0 25827 16662" width="25827" height="16662"></svg>');
api.updateOutside(layer,{x:25,y:385,s:.042028},1285,837);await settle();
const cache=api.caches.get(layer),canvasNodes=()=>layer.children.flatMap(c=>c.children).filter(c=>c.kind==='canvas');
assert.equal(canvasNodes().length,2);
for(const canvas of canvasNodes()) { assert.equal(canvas.width,1928);assert.equal(canvas.height,1256);assert.equal(canvas.style.width,'1285px');assert.equal(canvas.style.height,'837px'); }
assert.equal(live.attributes.width,'1285');assert.equal(live.attributes.height,'837');
assert.equal(cache.overview.parent,null,'the full grounds bitmap must remain off DOM');
assert.ok(cache.overview.width<=3200&&cache.overview.height<=3200&&cache.overview.width*cache.overview.height<=6_000_000);
assert.equal(cache.overviewDensity,Math.min(cache.overview.width/25827,cache.overview.height/16662));
assert.ok(cache.plane.style.cssText.includes('width:1285px;height:837px'));
api.updateOutside(layer,{x:-4200,y:-2200,s:2},1285,837);
for(const [id,fn]of [...timers]){timers.delete(id);fn();}await settle();
assert.ok(cache.sharp && !cache.sharp.parent,'sharp crop source must remain off DOM');
assert.equal(cache.detail.dataset.sharp,'1'); assert.equal(Number(cache.detail.dataset.sourceDensity),3);
assert.equal(canvasNodes().length,2);
for(const canvas of canvasNodes()) assert.equal(canvas.width,1928);
const captured=cache.snapshot();assert.equal(captured.width,1928);
cache.destroy();assert.equal(layer.children.length,0);assert.equal(urls.size,0);assert.equal(cache.history.length,0);
const portrait=new Element('div');portrait.connected=true;portrait.style={width:'4170px',height:'4920px',left:'-50px',top:'-70px'};
api.paintOutside(portrait,'<svg viewBox="0 0 4170 4920" width="4170" height="4920"></svg>');
api.updateOutside(portrait,{x:0,y:0,s:.5},1285,837);await settle();
for(const [id,fn]of [...timers]){timers.delete(id);fn();}await settle();
const pc=api.caches.get(portrait);
assert.ok(pc.overview.width<=3200&&pc.overview.height<=3200&&pc.overview.width*pc.overview.height<=6_000_000);
assert.ok(pc.overviewDensity<.75,'fixture must exceed capped portrait preview density');
assert.equal(pc.detail.dataset.sharp,'1','an insufficient overview must trigger a full-density sharp crop');
assert.equal(Number(pc.detail.dataset.sourceDensity),.75);pc.destroy();assert.equal(urls.size,0);
console.log('PASS: fractional-camera mapping, viewport DPR canvases, bounded live SVG, overview axis/pixel budgets, full-density portrait detail and cleanup');
