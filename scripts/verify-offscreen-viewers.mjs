import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
const compile=async name=>(await transformWithOxc((await readFile(new URL('../src/'+name,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),name)).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
const events=[],rafs=new Map(),listeners=new Map(),timers=new Map();let next=0,now=0;
const raf=fn=>{rafs.set(++next,fn);return next};
const document={hidden:false,addEventListener:(type,fn)=>listeners.set(type,fn)};
const window={addEventListener:(type,fn)=>listeners.set(type,fn),setTimeout:(fn,delay)=>{timers.set(++next,{fn,due:now+delay});return next}};
const budget=new Function(`${await compile('perf/screen-budget.ts')};return screenFrameRate`)();
const render=new Function('document','window','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','clearTimeout','beginSystem','endSystem','reportError','screenFrameRate','setScreenDetail','releaseScreenDetail',`${await compile('perf/diagnostics.ts')};${await compile('perf/render.ts')};return {renderLoop,renderFps,setRenderView,wakeRender,loopCount:()=>loops.size}`)(document,window,undefined,raf,id=>rafs.delete(id),id=>timers.delete(id),()=>0,()=>{},e=>{throw e},budget,()=>{},()=>{});
const scheduleLayout=new Function('requestAnimationFrame','reportError',`${await compile('harness/layout.ts')};return scheduleLayout`)(raf,e=>{throw e});
class Observer{constructor(fn){this.fn=fn;this.dead=false}observe(){}disconnect(){this.dead=true}}
const {followPromptScroll}=new Function('renderLoop','renderFps','scheduleLayout','ResizeObserver',`${await compile('os/prompt-scroll.ts')};return {followPromptScroll}`)(render.renderLoop,render.renderFps,scheduleLayout,Observer);
class Element{
  constructor(kind,parent=null){this.kind=kind;this.parentElement=parent;this.isConnected=true;this.dataset={};this.style={};this.classList={toggle(){}};this.textContent='';this.top=0;this.height=400;this.client=80;this.reads=0;this.writes=0;this.id=kind;}
  contains(other){for(let p=other;p;p=p.parentElement)if(p===this)return true;return false}
  closest(selector){for(let p=this;p;p=p.parentElement)if(selector.includes('.'+p.kind))return p;return null}
  get scrollHeight(){this.reads++;events.push('read-'+this.id);return this.height}
  get clientHeight(){this.reads++;events.push('read-'+this.id);return this.client}
  get scrollTop(){this.reads++;events.push('read-'+this.id);return this.top}
  set scrollTop(n){this.writes++;events.push('write-'+this.id);this.top=n}
  setAttribute(k,v){this[k]=v}
}
const step=()=>{
  const target=now+1000/60;
  while(timers.size){const[id,job]=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];if(job.due>target)break;timers.delete(id);now=job.due;job.fn();}
  now=target;const batch=[...rafs.values()];rafs.clear();for(const fn of batch)fn(now);
};
const frames=n=>{for(let i=0;i<n;i++)step()};
const screen=new Element('screen'),win=new Element('win',screen),typed=new Element('prompt',win);
render.setRenderView(screen,false,50);
let epoch=1;
typed.textContent='Exact prompt: Grüße, robot 🤖\nsecond line';
const text=typed.textContent,follow=followPromptScroll(typed,()=>epoch===1);
frames(12);assert.equal(typed.reads,0,'hidden prompts must perform zero geometry reads');
render.setRenderView(screen,true,50);frames(10);
assert.equal(typed.top,320);assert.equal(typed.textContent,text,'scrolling must preserve the exact prompt');
const reads=typed.reads,writes=typed.writes;frames(30);
assert.equal(typed.reads,reads,'unchanged prompts must not poll layout');assert.equal(typed.writes,writes);
win.dataset.renderHidden='1';render.wakeRender();typed.textContent+='\nfinal hidden text';typed.height=760;
frames(10);follow.finish();frames(5);assert.equal(typed.reads,reads,'covered prompts must not read layout');
win.dataset.renderHidden='0';render.wakeRender();frames(10);
assert.equal(typed.top,680,'the final changed prompt must scroll to its end when uncovered');
assert.equal(render.loopCount(),0,'finished prompts must release their scheduler loop');

// Document backgrounding also suspends geometry and resumes the latest prompt.
const background=new Element('prompt',win);background.textContent='background text';
document.hidden=true;const bg=followPromptScroll(background,()=>true);frames(8);assert.equal(background.reads,0);
background.textContent+=' latest';document.hidden=false;listeners.get('visibilitychange')();frames(10);
assert.equal(background.top,320);bg.finish();frames(5);assert.equal(render.loopCount(),0);

// Two simultaneous prompts share the actual all-reads-before-writes batch.
render.setRenderView(screen,true,600);events.length=0;
const a=new Element('prompt',win),b=new Element('prompt',win);a.id='a';b.id='b';a.textContent='A';b.textContent='B';
const fa=followPromptScroll(a,()=>true),fb=followPromptScroll(b,()=>true);frames(2);
const firstWrite=events.findIndex(e=>e.startsWith('write-'));
assert.ok(firstWrite>0&&events.slice(firstWrite).every(e=>e.startsWith('write-')),'all prompt geometry must be read before either scroll write');
fa.cancel();fb.cancel();frames(2);

// Cancellation after queuing must invalidate the later layout read and write.
const stale=new Element('prompt',win);stale.textContent='must never scroll';epoch=1;
const canceled=followPromptScroll(stale,()=>epoch===1);frames(1);epoch=2;frames(2);
assert.equal(stale.reads,0);assert.equal(stale.writes,0);assert.equal(render.loopCount(),0);
canceled.cancel();
const detached=new Element('prompt',win),disposed=followPromptScroll(detached,()=>true);frames(1);detached.isConnected=false;disposed.cancel();frames(3);
assert.equal(detached.writes,0);assert.equal(render.loopCount(),0);

class SheetBody extends Element{
  constructor(){super('body',win);this.nodes=new Map();for(const key of ['.sheet','.sh-stage','canvas','.sh-play','.sh-bar i','.sh-time b'])this.nodes.set(key,new Element(key,this));this.thumbs=Array.from({length:8},(_,n)=>{const el=new Element('thumb',this);el.dataset.n=String(n);return el});this.canvas=this.nodes.get('canvas');this.canvas.width=80;this.canvas.height=80;this.draws=[];this.canvas.getContext=()=>({clearRect(){},drawImage:(...args)=>this.draws.push({now,args})});}
  querySelector(key){return this.nodes.get(key)}querySelectorAll(){return this.thumbs}
}
const gsap={fromTo(){},ticker:{add(){throw Error('Sprite playback must not use the raw GSAP ticker')},remove(){}}};
const {playSheet}=new Function('gsap','renderLoop','performance',`${await compile('os/sheet.ts')};return {playSheet}`)(gsap,render.renderLoop,{now:()=>now});
const sheet={cols:4,rows:2,frames:8,fw:80,fh:80,fps:8,score:1},img={},body=new SheetBody();
let sleeps=0,startAt=0,pauseAt=0;
const wm={epoch:10,robot:{setPose(){}},check(e){if(e!==this.epoch)throw Error('epoch canceled')},async pointAt(el){if(startAt&&el===body.nodes.get('.sh-play'))pauseAt=now},async click(){},async sleep(ms,e){this.check(e);sleeps++;if(sleeps===1)startAt=now;const visible=sleeps>3,covered=sleeps>=4&&sleeps<=9;render.setRenderView(screen,visible,50);win.dataset.renderHidden=covered?'1':'0';render.wakeRender();const before=body.draws.length;frames(Math.ceil(ms/(1000/60)));if(!visible||covered)assert.equal(body.draws.length,before,'hidden or covered sprite playback must not draw');this.check(e)}};
await playSheet(wm,body,{img,sheet},'source-sheet.png',{loops:2});
assert.ok(pauseAt-startAt<2700,'logical sprite passes must finish on the absolute clock while hidden');
assert.equal(render.loopCount(),0,'completed playback must release its loop');
for(const draw of body.draws.slice(1,-1)){
  const frame=Math.floor((draw.now-startAt)/1000*sheet.fps)%sheet.frames;
  assert.equal(draw.args[0],img,'the actual source image must be retained');
  assert.equal(draw.args[1],(frame%sheet.cols)*sheet.fw);assert.equal(draw.args[2],Math.floor(frame/sheet.cols)*sheet.fh);
}
assert.ok(body.draws.length>1,'resuming sprite playback must draw its current absolute-clock frame');

// Epoch cancellation during playback tears down the real scheduler registration.
render.setRenderView(screen,true,600);win.dataset.renderHidden='0';const aborted=new SheetBody();
const stopWM={...wm,epoch:20,async sleep(){this.epoch++;frames(2);throw Error('epoch canceled')}};
await assert.rejects(playSheet(stopWM,aborted,{img,sheet},'source-sheet.png'),/epoch canceled/);
assert.equal(render.loopCount(),0);const drawn=aborted.draws.length;frames(10);assert.equal(aborted.draws.length,drawn);
console.log('PASS: exact prompt text, zero hidden/covered layout, unchanged-text reuse, batched writes, final resume scroll, original sprite frames/absolute clock, and epoch/disposal cleanup');
