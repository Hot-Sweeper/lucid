import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/office/touch-camera.ts', import.meta.url), 'utf8');
const compiled = (await transformWithOxc(source, 'touch-camera.ts')).code.replace('export function', 'function');
class Surface {
  listeners = new Map(); captures = new Set(); classes = new Set(); hidden = false;
  classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) };
  addEventListener(name, fn) { const list = this.listeners.get(name) || []; list.push(fn); this.listeners.set(name, list); }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(value => value !== fn)); }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  fire(type, input = {}) {
    const event = { type, pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100, detail: 1,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...input };
    for (const fn of [...this.listeners.get(type) || []]) { fn(event); if (event.stopped) break; }
    return event;
  }
  count() { return [...this.listeners.values()].reduce((n, list) => n + list.length, 0); }
}
const window = new Surface(), document = new Surface(), scene = new Surface();
let now = 0;
const mount = new Function('window', 'document', 'performance', `${compiled}; return mountTouchCamera;`)(window, document, { now: () => now });
const camera = { x: -100, y: -80, s: 1 };
let starts = 0, changes = 0, ends = 0;
const options = { camera: () => camera, viewport: () => ({ left: 20, top: 30 }),
  start: () => starts++, change: () => changes++, end: () => ends++ };
let destroy = mount(scene, options);
assert.equal(scene.fire('pointerdown', { pointerType: 'mouse' }).stopped, undefined, 'mouse controls retain ownership');
const tap = scene.fire('pointerdown');
assert.equal(tap.stopped, true, 'touch does not start a workstation/room/toy drag');
assert.equal(tap.prevented, undefined, 'stationary down keeps native button focus and click');
window.fire('pointermove', { clientX: 104, clientY: 102 });
assert.equal(starts, 0); assert.equal(changes, 0);
window.fire('pointerup', { clientX: 104, clientY: 102 });
assert.equal(scene.fire('click').prevented, undefined, 'tap activation survives');

scene.fire('pointerdown');
window.fire('pointermove', { clientX: 120, clientY: 110 });
assert.deepEqual(camera, { x: -80, y: -70, s: 1 });
assert.equal(starts, 1); assert.ok(scene.classes.has('panning')); assert.ok(scene.captures.has(1));
for (let x = 121; x <= 300; x++) window.fire('pointermove', { clientX: x, clientY: 110 });
assert.deepEqual(camera, { x: 100, y: -70, s: 1 }, 'all high-rate input deltas reach the existing camera queue');
const release = window.fire('pointerup', { clientX: 300, clientY: 110 });
assert.equal(release.prevented, true); assert.equal(ends, 1); assert.equal(scene.captures.size, 0);
assert.equal(scene.fire('click').prevented, true, 'swipe release cannot open an unintended desk');
assert.equal(scene.fire('click', { detail: 0 }).prevented, undefined, 'keyboard activation is preserved');

// A fresh touch is immediately usable without waiting for delayed-click suppression.
scene.fire('pointerdown'); window.fire('pointerup');
assert.equal(scene.fire('click').prevented, undefined);

Object.assign(camera, { x: -100, y: -80, s: 1 });
scene.fire('pointerdown', { pointerId: 1, clientX: 120, clientY: 130 });
scene.fire('pointerdown', { pointerId: 2, clientX: 220, clientY: 130 });
assert.equal(starts, 2, 'a pinch claims camera motion immediately');
const anchor = { x: (170 - 20 - camera.x) / camera.s, y: (130 - 30 - camera.y) / camera.s };
window.fire('pointermove', { pointerId: 2, clientX: 320, clientY: 130 });
assert.equal(camera.s, 2);
assert.equal((220 - 20 - camera.x) / camera.s, anchor.x, 'pinch holds the world point under the moving centroid');
assert.equal((130 - 30 - camera.y) / camera.s, anchor.y);
window.fire('pointerup', { pointerId: 2, clientX: 320, clientY: 130 });
const prior = { ...camera };
window.fire('pointermove', { pointerId: 1, clientX: 140, clientY: 145 });
assert.deepEqual(camera, { ...prior, x: prior.x + 20, y: prior.y + 15 }, 'lifting one pinch finger resumes panning without a jump');
window.fire('pointercancel', { pointerId: 1 });
assert.equal(ends, 2); assert.equal(scene.captures.size, 0);
const cancelled = { ...camera }; window.fire('pointermove', { clientX: 500 });
assert.deepEqual(camera, cancelled, 'cancelled touches cannot keep moving the camera');

for (const exit of ['blur', 'visibilitychange', 'lostpointercapture']) {
  scene.fire('pointerdown'); window.fire('pointermove', { clientX: 180 });
  if (exit === 'visibilitychange') { document.hidden = true; document.fire(exit); document.hidden = false; }
  else (exit === 'blur' ? window : scene).fire(exit);
  assert.equal(scene.captures.size, 0); assert.equal(scene.classes.has('panning'), false);
}
scene.fire('pointerdown', { pointerId: 1, clientX: 100 });
scene.fire('pointerdown', { pointerId: 2, clientX: 200 });
window.fire('pointermove', { pointerId: 2, clientX: 20000 });
assert.equal(camera.s, 5, 'pinch shares the desktop maximum zoom');
window.fire('pointermove', { pointerId: 2, clientX: 100 });
assert.ok(camera.s >= .08 && Number.isFinite(camera.x) && Number.isFinite(camera.y), 'collapsed fingers never produce invalid scale');
window.fire('pagehide', { persisted: true });
assert.equal(scene.captures.size, 0, 'back-forward cache suspends a held gesture');
const sceneListeners = scene.count(), windowListeners = window.count(), documentListeners = document.count();
assert.ok(sceneListeners && windowListeners && documentListeners);
destroy(); destroy();
assert.equal(scene.count() + window.count() + document.count(), 0, 'destroy removes all owned global and local listeners');
destroy = mount(scene, options);
assert.equal(scene.count(), sceneListeners); assert.equal(window.count(), windowListeners); assert.equal(document.count(), documentListeners);
window.fire('pagehide', { persisted: false });
assert.equal(scene.count() + window.count() + document.count(), 0, 'unloading releases input resources');
now += 1000;
console.log('PASS: touch tap/swipe isolation, high-rate pan deltas, pinch centroid anchoring and bounds, pinch-to-pan continuity, cancel/capture/blur/visibility recovery, click suppression and complete input cleanup');

// Render scheduling must not change the same physical pinch at a zoom boundary.
const minimum=Math.max(Math.min(390/4000,786/3000),Math.min(390/3520,786/2720));
function boundedPinch(eventsPerFrame) {
  const boundedScene=new Surface(), model={x:-100,y:-80,s:.15};
  const constrain=()=>{
    model.s=Math.max(minimum,model.s);
    const fit=(offset,size,start,length)=>length*model.s<=size?(size-length*model.s)/2-start*model.s:Math.min(-start*model.s,Math.max(size-(start+length)*model.s,offset));
    model.x=fit(model.x,390,-500,4000);model.y=fit(model.y,786,-300,3000);
  };
  const cleanup=mount(boundedScene,{camera:()=>model,viewport:()=>({left:0,top:0}),zoomBounds:()=>({min:minimum,max:5}),constrain,start(){},end(){},change(){}});
  boundedScene.fire('pointerdown',{pointerId:1,clientX:95,clientY:300});boundedScene.fire('pointerdown',{pointerId:2,clientX:295,clientY:300});
  const distances=[170,140,110,80,110,140,170,200];
  distances.forEach((distance,i)=>{window.fire('pointermove',{pointerId:2,clientX:95+distance,clientY:300});if((i+1)%eventsPerFrame===0)constrain();});
  constrain();cleanup();return model;
}
const expected=boundedPinch(1);
for(const batching of [2,3,4,8])assert.deepEqual(boundedPinch(batching),expected,`Identical pinch endpoints must not depend on ${batching} inputs per render frame`);
assert.ok(expected.s>=minimum);
console.log('PASS: synchronous camera constraints keep pinch reversals and pan bounds independent of render batching.');
