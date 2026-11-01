import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
const source=await readFile(new URL('../src/office/world.ts',import.meta.url),'utf8');
const start=source.indexOf('  private applyQueued ='),end=source.indexOf('  private sceneBox:',start);
assert.ok(start>=0&&end>start,'camera queue methods must be available');
const compiled=(await transformWithOxc(`class CameraQueue {${source.slice(start,end)}}`,'camera-queue.ts')).code;
let serial=0;const frames=new Map();
const CameraQueue=new Function('requestAnimationFrame',`${compiled};return CameraQueue`)(fn=>{frames.set(++serial,fn);return serial});
const camera=new CameraQueue(),commits=[];let focusChecks=0;
camera.input=0;camera.apply=()=>commits.push(camera.input);camera.keepFocus=()=>focusChecks++;
const frame=now=>{assert.equal(frames.size,1,'only one camera callback may be pending');const [id,fn]=frames.entries().next().value;frames.delete(id);fn(now)};
for(let i=1;i<=200;i++){camera.input=i;camera.applySoon()}
assert.equal(commits.length,0,'input bursts must wait for the display frame');
frame(1000);assert.deepEqual(commits,[200],'the display commit must consume the newest input');
assert.equal(frames.size,0,'a settled camera must not spin another frame');
for(let i=1;i<=24;i++){
  for(let input=0;input<20;input++){camera.input++;camera.applySoon()}
  frame(1000+i*1000/144);
  assert.equal(commits.length,i+1,'a high-refresh display frame must not be skipped by a separate 60 Hz deadline');
  assert.equal(commits.at(-1),camera.input);
  assert.equal(frames.size,0);
}
assert.equal(focusChecks,commits.length,'focus bookkeeping must run once per displayed commit');

// Run the real wheel/setup/restore/fly-to methods with counted viewport reads.
const restoreStart=source.indexOf('  restoreCamera('),restoreEnd=source.indexOf('  private size =',restoreStart);
const controlsStart=source.indexOf('  stopCameraMotion()'),controlsEnd=source.indexOf('  // Coalesce fast mouse input',controlsStart);
const clampStart=source.indexOf('  private cameraZoomBounds()'),clampEnd=source.indexOf('  private apply()',clampStart);
const flyStart=source.indexOf('  private fitTarget('),flyEnd=source.indexOf('  onFocus:',flyStart);
const harnessCode=(await transformWithOxc(`class CameraHarness { cam={x:-100,y:-80,s:1}; ${source.slice(restoreStart,restoreEnd)} ${source.slice(controlsStart,controlsEnd)} ${source.slice(start,end)} ${source.slice(clampStart,clampEnd)} ${source.slice(flyStart,flyEnd)} }`,'camera-input.ts')).code;
const observers=[],tweens=[];
class Surface {
  listeners=new Map();classList={add(){},remove(){}};clientWidth=1200;clientHeight=800;reads=0;left=100;top=60;
  addEventListener(name,callback){const list=this.listeners.get(name)??[];list.push(callback);this.listeners.set(name,list)}
  getBoundingClientRect(){this.reads++;return{left:this.left,top:this.top,width:this.clientWidth,height:this.clientHeight,right:this.left+this.clientWidth,bottom:this.top+this.clientHeight}}
  dispatch(name,event){for(const callback of this.listeners.get(name)??[])callback(event)}
  listenerCount(){return[...this.listeners.values()].reduce((n,list)=>n+list.length,0)}
}
const window=new Surface(),document=new Surface();document.hidden=false;
class ResizeObserver { constructor(callback){this.callback=callback;observers.push(this)}observe(){} }
const gsap={to(target,options){const tween={target,options,kills:0,kill(){this.kills++}};tweens.push(tween);return tween}};
const CameraHarness=new Function('requestAnimationFrame','window','document','ResizeObserver','gsap',`${harnessCode};return CameraHarness`)(fn=>{frames.set(++serial,fn);return serial},window,document,ResizeObserver,gsap);
const view=new CameraHarness();view.scene=new Surface();view.root=new Surface();view.sceneBox=null;
// The extracted methods use the campus dimensions initialized by the real World.
view.campusRight=0;view.campusHeight=0;
let applied=0,focused=0;view.apply=()=>{applied++;view.clampCam()};view.keepFocus=()=>focused++;
view.stopFollow=()=>{view.followEl=null};view.camera();
const listeners=view.scene.listenerCount(),windowListeners=window.listenerCount(),observerCount=observers.length;
for(let n=0;n<30;n++)view.restoreCamera({x:-100-n,y:-80+n,s:1});
assert.equal(view.scene.listenerCount(),listeners,'Restoring saved cameras must never add another wheel/pointer handler');
assert.equal(window.listenerCount(),windowListeners,'Restoring cameras must not accumulate global pointer handlers');
assert.equal(observers.length,observerCount,'Restoring cameras must not allocate another resize observer');
assert.equal(applied,30,'Restoring a camera applies it immediately');
assert.equal(focused,30);

const wheel=(deltaY,clientX=700,clientY=460)=>({deltaY,clientX,clientY,preventDefault(){this.prevented=true}});
const initialTween=gsap.to(view.cam,{});view.cameraTween=initialTween;
const beforeApplies=applied;
for(let n=0;n<200;n++){
  const event=wheel(n<100?-2:2,600+n%9,400+n%7),prior={...view.cam};
  const px=event.clientX-view.scene.left,py=event.clientY-view.scene.top;
  const anchor={x:(px-prior.x)/prior.s,y:(py-prior.y)/prior.s};
  view.scene.dispatch('wheel',event);
  assert.equal(event.prevented,true);
  assert.ok(Math.abs((px-view.cam.x)/view.cam.s-anchor.x)<1e-8&&Math.abs((py-view.cam.y)/view.cam.s-anchor.y)<1e-8,
    'Every queued wheel delta preserves its own cursor anchor');
}
assert.equal(view.scene.reads,1,'A 200-event wheel burst reuses one scene geometry read');
assert.equal(initialTween.kills,1,'Wheel control cancels the owned fly-to exactly once');
assert.equal(applied,beforeApplies,'Wheel bursts do not commit before the display frame');
frame(2000);assert.equal(applied,beforeApplies+1,'All wheel deltas commit together on the next display frame');
assert.ok(Math.abs(view.cam.s-1)<1e-10,'Wheel reversals must preserve every accumulated zoom delta');

view.scene.left=180;observers[0].callback();
view.scene.dispatch('wheel',wheel(-5));frame(2010);
assert.equal(view.scene.reads,2,'A resize invalidates the cached cursor geometry');
view.cam.s=5;const clampedApplies=applied;
for(let n=0;n<100;n++)view.scene.dispatch('wheel',wheel(-120));
assert.equal(frames.size,0,'Repeated wheel input at maximum scale must not queue redundant camera work');
assert.equal(applied,clampedApplies);

const first=tweens.length;
for(let n=0;n<50;n++)view.flyTo({x:n*10,y:n*8,w:800,h:600});
for(const tween of tweens.slice(first,-1))assert.equal(tween.kills,1,'A newer focus target cancels its previous camera tween');
assert.equal(tweens.at(-1).kills,0,'Only the newest focus motion remains active');
view.scene.dispatch('wheel',wheel(5));assert.equal(tweens.at(-1).kills,1,'Direct wheel input takes camera ownership immediately');
frame(2020);

view.grounds={bounds:{x:-500,y:-300,w:4000,h:3000},lawn:{w:3000,h:2000}};
for(const scale of [.000001,.2,1,5]){
  view.cam={x:-1e6,y:1e6,s:scale};view.clampCam();
  const g=view.grounds.bounds,c=view.cam;
  assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.s));
  assert.ok(c.x+g.x*c.s<=.001&&c.x+(g.x+g.w)*c.s>=view.scene.clientWidth-.001,'Clamped horizontal viewport stays on the grounds');
  assert.ok(c.y+g.y*c.s<=.001&&c.y+(g.y+g.h)*c.s>=view.scene.clientHeight-.001,'Clamped vertical viewport stays on the grounds');
}
console.log('PASS: latest-input coalescing, uninterrupted 144 Hz commits, 200 wheel events sharing one geometry read, cursor anchors/reversals, bounded zoom, newest fly-to ownership, and repeated restore without listener/observer leaks');
