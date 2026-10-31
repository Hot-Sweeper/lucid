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
console.log('PASS: latest-input coalescing, one queued callback, no idle frame loop and uninterrupted 144 Hz display commits');
