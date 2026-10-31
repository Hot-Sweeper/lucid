import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const compile = async file => (await transformWithOxc((await readFile(new URL(`../src/perf/${file}.ts`, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, ''), `${file}.ts`)).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
let requested = .1;
const renderCode=await compile('render');
const window={devicePixelRatio:1.5};
const render=new Function('window','document','IntersectionObserver','requestAnimationFrame','screenFrameRate',`${renderCode};return {setRenderView,renderPixelRatio,pixelRatioBucket}`)(window,{addEventListener(){}},undefined,()=>1,()=>60);
const bucket=render.pixelRatioBucket;
const api = new Function('renderPixelRatio', 'pixelRatioBucket', `${await compile('canvas')};return {fitCanvas,canvasPixelRatio,canvasLogicalSize,LiveCanvases}`)(() => requested,bucket);
class Canvas {
  constructor() {
    this.style={};this.isConnected=true;this.w=300;this.h=150;this.writes=0;
    this.ctx={canvas:this,getTransform:()=>({...this.transform}),getLineDash:()=>[...this.dash],setLineDash:dash=>this.dash=[...dash],setTransform:(a,b,c,d,e,f)=>this.transform={a,b,c,d,e,f}};
    this.reset();
  }
  reset(){this.transform={a:1,b:0,c:0,d:1,e:0,f:0};this.dash=[];Object.assign(this.ctx,{fillStyle:'#000000',font:'10px sans-serif',lineWidth:1,globalAlpha:1,shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0});}
  get width(){return this.w;}set width(value){this.w=value;this.writes++;this.reset();}
  get height(){return this.h;}set height(value){this.h=value;this.writes++;this.reset();}
  getContext(){return this.ctx;}
}
const live=new Canvas(),staticSource=new Canvas(),detached=new Canvas();
const ctx=api.fitCanvas(live,400,200);
api.fitCanvas(staticSource,400,200);api.fitCanvas(detached,400,200);detached.isConnected=false;
ctx.setTransform(2,0,0,2,20,30);ctx.fillStyle='#aabbcc';ctx.font='bold 18px Lexend';ctx.globalAlpha=.75;ctx.setLineDash([2,4]);
ctx.shadowBlur=8;ctx.shadowOffsetX=2;ctx.shadowOffsetY=4;
const scope=new api.LiveCanvases({});scope.add(live);scope.add(detached);
scope.prepare();
const tinyRatio=api.canvasPixelRatio(live);
assert.ok(tinyRatio>=requested && tinyRatio<requested*1.2,'Live density must cover every displayed physical pixel');
assert.ok(live.width>=400*requested && live.height>=200*requested);
assert.equal(ctx.fillStyle,'#aabbcc');assert.equal(ctx.font,'bold 18px Lexend');assert.equal(ctx.globalAlpha,.75);assert.deepEqual(ctx.getLineDash(),[2,4]);
assert.equal(ctx.getTransform().a,tinyRatio);assert.equal(ctx.getTransform().e,10*tinyRatio);assert.equal(ctx.getTransform().f,15*tinyRatio);
assert.equal(ctx.shadowBlur,4*tinyRatio);assert.equal(ctx.shadowOffsetX,tinyRatio);assert.equal(ctx.shadowOffsetY,2*tinyRatio);
assert.equal(staticSource.width,800,'An unregistered static image source must retain its pixels');
assert.equal(detached.width,800,'Detached cached artwork must never be resized or cleared');
const writes=live.writes;for(let i=0;i<120;i++)scope.prepare();assert.equal(live.writes,writes,'Stable frames must not reset the canvas');
requested=3.1;scope.prepare();
assert.ok(live.width>=400*requested,'Close high-DPR views must grow above the former hardcoded2x density');
const closeRatio=api.canvasPixelRatio(live),closeWrites=live.writes;
requested=3;scope.prepare();assert.equal(live.writes,closeWrites,'A small wheel reversal reuses the existing sharp buffer');
assert.ok(api.canvasPixelRatio(live)>=requested);
assert.deepEqual(api.canvasLogicalSize(live),{w:400,h:200},'Backing density must not change logical game coordinates');
scope.remove(live);requested=6;scope.prepare();assert.equal(live.writes,closeWrites,'Unregistering releases resizing ownership');
scope.clear();detached.isConnected=true;scope.prepare();assert.equal(detached.width,800,'Disposal does not clear retained presentation');
assert.throws(()=>scope.add(new Canvas()),/sized with fitCanvas/);

class Element {
  constructor(kind,parent=null){this.kind=kind;this.parentElement=parent;this.isConnected=true;this.dataset={};this.classList={toggle(){}};}
  closest(selector){for(let p=this;p;p=p.parentElement)if(selector.includes(`.${p.kind}`))return p;return null;}
  contains(other){for(let p=other;p;p=p.parentElement)if(p===this)return true;return false;}
}
const screen=new Element('screen'),owner=new Element('canvas',screen);
render.setRenderView(screen,true,276*.2);assert.equal(render.renderPixelRatio(owner),276*.2/820*1.5);
render.setRenderView(screen,true,276*2);assert.equal(render.renderPixelRatio(owner),276*2/820*1.5);
window.devicePixelRatio=3;assert.equal(render.renderPixelRatio(owner),276*2/820*3,'Changing displays updates density without forcing layout');
const phone=new Element('phone-screen');render.setRenderView(phone,true,53.6,134);assert.ok(Math.abs(render.renderPixelRatio(phone)-1.2)<1e-10);
const wrapper=new Element('wrapper'),nested=new Element('canvas',wrapper);
nested.isConnected=false;wrapper.isConnected=false;
assert.equal(render.renderPixelRatio(nested),3,'Detached construction starts without a screen scale');
wrapper.parentElement=screen;wrapper.isConnected=nested.isConnected=true;
assert.equal(render.renderPixelRatio(nested),276*2/820*3,'Attaching an ancestor must bind the actual screen even when the canvas parent stays unchanged');
console.log(JSON.stringify({densityCoversDisplay:true,tinyRatio,closeRatio,statePreserved:true,staticArtworkUnchanged:true,disposalSafe:true,cameraAndDprTracked:true}));
