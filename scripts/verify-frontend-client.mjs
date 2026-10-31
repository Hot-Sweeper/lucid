import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { transformWithOxc } from 'vite';
const source=(await readFile(new URL('../src/os/frontend.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const code=(await transformWithOxc(source,'frontend.ts')).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
const host={dataset:{}},timers=new Map(),requests=[];let next=0,active=true,drawAllowed=true,scenes=0,clears=0,resolveFrame;
class Element {
  constructor(){this.isConnected=false;this.children=[];this.style={};this.dataset={};this.hidden=false;}
  append(...children){this.children.push(...children);}
  closest(){return host;}
  removeAttribute(name){delete this[name];}
}
const document={createElement:()=>new Element()};
class ResizeObserver{constructor(callback){this.callback=callback;}observe(){this.callback([{contentRect:{width:960,height:540}}]);}disconnect(){this.disconnected=true;}}
const api={async frontendFrame(req){requests.push(req);if(req.close||req.mode==='paused')return {ok:true};return new Promise(resolve=>resolveFrame=resolve);}};
const window={lucid:api,setTimeout(fn){const id=++next;timers.set(id,fn);return id;}};
const {FrontendView}=new Function('document','window','crypto','ResizeObserver','renderFps','renderPixelRatio','setDetailScene','clearDetailScene','clearTimeout','performance',`${code};return {FrontendView}`)(document,window,{randomUUID},ResizeObserver,()=>drawAllowed?60:0,()=>1,()=>scenes++,()=>clears++,id=>timers.delete(id),{now:()=>10});
const tick=async()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await new Promise(resolve=>setImmediate(resolve));};
const frame={ok:true,width:960,height:540,background:'#fff',shapes:[],title:'Actual page',image:'data:image/png;base64,real'};
const view=new FrontendView({url:'http://localhost:5173/'},()=>active,()=>{});view.root.isConnected=true;
await tick();assert.equal(requests.length,1);assert.equal(timers.size,0,'No next request while capture is pending');
resolveFrame(frame);await new Promise(resolve=>setImmediate(resolve));assert.equal(scenes,1);assert.equal(timers.size,1);
host.dataset.screenDetail='lines';await tick();assert.equal(requests.at(-1).mode,'lines');resolveFrame({...frame,image:undefined});await new Promise(resolve=>setImmediate(resolve));assert.equal(scenes,1,'Unchanged geometry does not invalidate every LOD cache');
host.dataset.screenDetail='icon';await tick();assert.equal(requests.at(-1).mode,'paused');const paused=requests.length;await tick();assert.equal(requests.length,paused,'Icon views stop capture requests');
delete host.dataset.screenDetail;await tick();assert.equal(requests.at(-1).mode,'full');
view.stop();resolveFrame(frame);await new Promise(resolve=>setImmediate(resolve));assert.ok(requests.some(r=>r.close));assert.equal(timers.size,0);assert.equal(clears,1,'Disposal releases the geometry source');assert.ok(view['resize'].disconnected);
console.log('Frontend client: serial polling, geometry caching, icon suspension, full resume and in-flight disposal passed.');
