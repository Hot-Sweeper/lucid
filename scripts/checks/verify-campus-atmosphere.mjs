import assert from 'node:assert/strict';
import { worldSource } from './world-source.mjs';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await readFile('src/office/campus-light.ts','utf8');
const { campusNight } = await import('data:text/javascript;base64,'+Buffer.from((await transformWithOxc(source,'campus-light.ts')).code).toString('base64'));
const date = (month,hour) => new Date(2026,month,1,hour);
for(const month of [0,3,6,10]) {
  assert.equal(campusNight(date(month,0),null),.82);
  assert.equal(campusNight(date(month,12),null),0);
  assert.equal(campusNight(date(month,23),null),.82);
}
const now=date(10,18),weather={sunrise:date(10,7).toISOString(),sunset:date(10,16).toISOString(),isDay:true,observedAt:now.toISOString()};
assert.equal(campusNight(now,weather),.82,'actual sunset overrides stale-looking day flag');
assert.equal(campusNight(date(10,12),weather),0);
assert(campusNight(new Date(2026,10,1,16,20),weather)>.3&&campusNight(new Date(2026,10,1,16,20),weather)<.6,'twilight is gradual');
assert.equal(campusNight(now,{...weather,sunrise:null,sunset:null,isDay:false}),.82);
assert.equal(campusNight(date(10,23),{...weather,stale:true,sunrise:null,sunset:null,isDay:true}),.82,'outdated daytime flag cannot keep late night bright');
const world=await worldSource();
const start=world.indexOf('  cameraExtent(this: World)'),end=world.indexOf('  apply(this: World)',start);
const code=(await transformWithOxc(`class Camera {${world.slice(start,end)}}`,'camera.ts')).code;
const Camera=new Function(`${code};return Camera`)();
for(const [width,height] of [[390,844],[1100,800],[2100,1000]]) {
  const camera=Object.assign(new Camera(),{grounds:{bounds:{x:-770,y:-800,w:8000,h:6000}},campusRight:15000,campusHeight:11000,sceneBox:{width,height},cam:{s:1,x:0,y:0}});
  const bounds=camera.cameraExtent();assert.equal(bounds.x+bounds.w,15000);assert.equal(bounds.y+bounds.h,11000);
  const min=camera.cameraZoomBounds().min;assert(min<Math.min(width/bounds.w,height/bounds.h),'overview permits margin');
  for(const direction of [-1,1]) {
    camera.cam={x:direction*1e8,y:direction*1e8,s:.7};camera.clampCam();
    const edgeX=direction===1?bounds.x:bounds.x+bounds.w,edgeY=direction===1?bounds.y:bounds.y+bounds.h;
    const x=camera.cam.x+edgeX*.7,y=camera.cam.y+edgeY*.7;
    assert(direction===1?x>=99:x<=width-99,'pan can expose complete horizontal edge with gutter');
    assert(direction===1?y>=99:y<=height-99,'pan can expose complete vertical edge with gutter');
  }
}
console.log('Campus atmosphere: local solar/night/freshness/twilight and full-campus camera reach passed.');
