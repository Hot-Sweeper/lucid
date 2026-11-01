import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source=await readFile(new URL('../src/office/world.ts',import.meta.url),'utf8');
const start=source.indexOf('  private apply() {'),end=source.indexOf('  /** Moves the view at once',start);
const warmStart=source.indexOf('  private outsideWarmIdle ='),warmEnd=source.indexOf('  private cameraZoomBounds()',warmStart);
const code=(await transformWithOxc(`class CameraPresentation { ${source.slice(warmStart,warmEnd)} ${source.slice(start,end)} }`,'camera-presentation.ts')).code;
let outside=0,roomArt=0,zooms=0,weather=0,lastReserve=0;
const timers=new Map(),warmJobs=new Map();let serial=0;
const win={setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);},requestIdleCallback(fn){warmJobs.set(++serial,fn);return serial;},cancelIdleCallback(id){warmJobs.delete(id);}};
const doc={hidden:false};
const Harness=new Function('window','document','beginSystem','endSystem','setZoom','updateOutside','updateStaticArt','clearTimeout',`${code};return CameraPresentation;`)(win,doc,()=>-1,()=>{},()=>zooms++,(layer,cam,w,h,reserve=0)=>{assert.equal(w,390);assert.equal(h,786);assert.equal(layer.id,'grounds');outside++;lastReserve=reserve;},()=>roomArt++,id=>timers.delete(id));
const camera=new Harness();
camera.cam={x:-100,y:-100,s:.65};camera.scene={inert:false,classList:{toggle(){}}};camera.sceneBox={width:390,height:786};camera.size={w:4000,h:3000};
camera.root={isConnected:true,style:{},classList:{add(){},remove(){},toggle(){}},querySelector(){return{id:'grounds'}}};
camera.syncBuildings=()=>{};camera.clampCam=()=>{};camera.recull=()=>{};camera.viewIndoors=true;camera.fx={setCamera(){weather++;}};
for(let i=0;i<100;i++){camera.cam.x-=2;camera.cam.s+=.001;camera.apply();}
assert.equal(outside,0,'A fully covered ground plane cannot redraw during an indoor pan/pinch');
assert.equal(roomArt,100,'Visible room artwork keeps following every camera frame');assert.equal(zooms,100);assert.equal(weather,100);
assert.match(camera.root.style.transform,/translate\(-300px/);
camera.viewIndoors=false;camera.apply();assert.equal(outside,1,'The first exposed frame updates scenery at the current camera before presentation');
camera.viewIndoors=true;camera.apply();assert.equal(outside,1,'Returning indoors reuses the parked scenery');
assert.equal(timers.size,1,'Camera settle timers remain bounded');
for(const [id,fn]of timers){timers.delete(id);fn();}
assert.equal(warmJobs.size,1,'A settled indoor camera queues one sharp scenery preparation');
for(const [id,fn]of warmJobs){warmJobs.delete(id);fn();}
assert.equal(outside,2,'Cold first-exposure pixels are prepared after the gesture');
assert.equal(lastReserve,96,'Settled preparation reserves room for the next pan');
camera.viewIndoors=false;camera.scheduleOutsideWarm();
for(const [id,fn]of warmJobs){warmJobs.delete(id);fn();}
assert.equal(outside,3,'An exposed settled crop also renews a shallow edge reserve');
camera.scheduleOutsideWarm();assert.equal(warmJobs.size,1);camera.dragged=true;camera.cancelOutsideWarm();
assert.equal(warmJobs.size,0,'A new gesture cancels pending preparation');camera.dragged=false;
doc.hidden=true;camera.apply();assert.equal(outside,3);assert.equal(camera.presentationDirty,true);

const holdStart=source.indexOf('  private cancelTouchLayoutFlush()'),holdEnd=source.indexOf('  private homeForThread',holdStart);
const updateStart=source.indexOf('  update(data: WorldData)'),updateEnd=source.indexOf('    const seatsBefore',updateStart);
const holdCode=(await transformWithOxc(`class GestureLayout {${source.slice(holdStart,holdEnd)} ${source.slice(updateStart,updateEnd)} this.applied.push(data.version); } }`,'gesture-layout.ts')).code;
const idle=new Map();let idleId=0;
const holdWin={requestIdleCallback(fn){idle.set(++idleId,fn);return idleId;},cancelIdleCallback(id){idle.delete(id);}};
const Layout=new Function('window','clearTimeout','subscriptionBatteries',`${holdCode};return GestureLayout;`)(holdWin,()=>{}, {setEnabled(){}});
const layout=Object.assign(new Layout(),{hasLayout:true,reports:new Map(),coinHolds:new Set(),neighbors:new Map(),applied:[]});
layout.holdTouchLayout(true);layout.update({threads:[],version:1});layout.update({threads:[],version:2});
assert.equal(layout.lastData.version,2,'Authoritative data keeps updating during a gesture');assert.deepEqual(layout.applied,[],'Physical reconciliation stays out of the pointer path');
layout.holdTouchLayout(false);assert.equal(idle.size,1,'Release owns one deferred reconciliation');
layout.holdTouchLayout(true);assert.equal(idle.size,0,'Another gesture cancels the stale release task');layout.update({threads:[],version:3});layout.holdTouchLayout(false);
for(const [id,fn]of idle){idle.delete(id);fn();}
assert.deepEqual(layout.applied,[3],'Only the newest source snapshot is reconciled after release');
assert.equal(layout.touchLayoutPending,false);
console.log('Camera presentation: covered scenery skips, immediate exposure, retained sharp room updates, bounded settle work and latest-only post-gesture layout reconciliation passed.');
