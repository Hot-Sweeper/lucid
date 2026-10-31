import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
const source=(await readFile(new URL('../src/weather/effects.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const compiled=(await transformWithOxc(source,'effects.ts')).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
class Element {
  constructor(kind){this.kind=kind;this.style={};this.dataset={};this.children=[];this.width=300;this.height=150;this.calls=[];const node=this;this.ctx=new Proxy({drawImage(...args){node.calls.push({kind:'draw',args})},setTransform(...args){node.calls.push({kind:'transform',args})},createRadialGradient(){return{addColorStop(){}}}},{get:(o,k)=>o[k]??(()=>{})});}
  setAttribute(){} append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n)}} appendChild(n){this.append(n)} querySelector(){return null} getContext(){return this.ctx} remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)}
}
const document={hidden:false,createElement:kind=>new Element(kind),addEventListener(){},removeEventListener(){}};
const motion={matches:false,addEventListener(){},removeEventListener(){}};
const rafs=new Map(),timers=new Map();let serial=0;
const window={setTimeout:fn=>{timers.set(++serial,fn);return serial}};
const requestAnimationFrame=fn=>{rafs.set(++serial,fn);return serial};
const {mountWeather}=new Function('document','window','requestAnimationFrame','cancelAnimationFrame','clearTimeout','matchMedia','devicePixelRatio','beginSystem','endSystem','outdoorLook',`${compiled};return {mountWeather}`)(document,window,requestAnimationFrame,id=>rafs.delete(id),id=>timers.delete(id),()=>motion,1.5,()=>0,()=>{},()=>({season:'summer',frozen:false}));
const host=new Element('div'),rect={x:-3000,y:-5000,w:25000,h:16000},weather=mountWeather(host,rect),root=host.children[0],sky=root.children[0];
const viewport={left:0,top:0,width:1285,height:837},q=Math.min(1.5,Math.sqrt(1.6e6/(viewport.width*viewport.height)));
for(const scale of [.042,.23,.65,2,3.932]){
  const cam={x:200,y:300,s:scale};weather.setCamera(cam,viewport,20000);
  assert.equal(Number(sky.dataset.sourceDensity),q,'retention must preserve the existing sky presentation density');
  assert.ok(sky.width<=Math.ceil((viewport.width+256)*q)+1&&sky.height<=Math.ceil((viewport.height+256)*q)+1,'sky buffer must stay viewport bounded');
  const before=Number(root.dataset.skyPresents),draws=sky.calls.filter(c=>c.kind==='draw').length;
  for(let i=1;i<=80;i++)weather.setCamera({...cam,x:cam.x+i},viewport,20000);
  assert.equal(Number(root.dataset.skyPresents),before,'a covered pan must not present sky pixels again');
  assert.equal(sky.calls.filter(c=>c.kind==='draw').length,draws);
  const [tx,ty]=sky.style.transform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g).map(Number);
  const cx=Number(sky.dataset.sourceX),cy=Number(sky.dataset.sourceY),cw=Number(sky.dataset.sourceW),ch=Number(sky.dataset.sourceH);
  assert.ok(Math.abs(tx-(cam.x+80+cx*scale))<1e-8&&Math.abs(ty-(cam.y+cy*scale))<1e-8,'retained pixels must follow original world coordinates');
  assert.ok(tx<=0&&ty<=0&&tx+cw*scale>=viewport.width&&ty+ch*scale>=viewport.height,'retained pixels must cover the complete viewport');
  weather.setCamera({...cam,x:cam.x+110},viewport,20000);
  assert.equal(Number(root.dataset.skyPresents),before+1,'newly exposed sky pixels must refresh before overscan runs out');
}
const before=Number(root.dataset.skyPresents),[id,frame]=rafs.entries().next().value;rafs.delete(id);frame(1000);
assert.ok(Number(root.dataset.skyPresents)>before,'the weather clock must continue presenting actual source changes');
weather.setCamera({x:0,y:0,s:1},{...viewport,width:500,height:400},20000);
assert.ok(sky.width<=Math.ceil((500+256)*1.5)+1&&sky.height<=Math.ceil((400+256)*1.5)+1,'shrinking the viewport must resize overscan buffers');
weather.destroy();assert.equal(host.children.length,0);assert.equal(rafs.size,0);assert.equal(timers.size,0);
console.log('PASS: unchanged sky density, covered-pan reuse, world mapping, edge renewal, live weather clock, resize bounds and cleanup');
