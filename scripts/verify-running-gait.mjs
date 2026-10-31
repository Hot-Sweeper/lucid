import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

// Exercise the renderer's actual foot trajectories through a full gait cycle.
const walker = await readFile(new URL('../src/world/walker.ts', import.meta.url), 'utf8');
const start = walker.indexOf('    const foot = (off: number) =>');
const end = walker.indexOf('    const fl = foot(0)', start);
assert(start > 0 && end > start);
const bobStart=walker.indexOf('    const bob = stride *');
const bobEnd=walker.indexOf('\n',bobStart);
const source = `const STEP=25; const TAU=Math.PI*2; const lerp=(a,b,t)=>a+(b-a)*t;
export function feet(u0,run) { ${walker.slice(start,end)} return [foot(0),foot(0.5)]; }
export function hip(u0,run) { const stride=1; ${walker.slice(bobStart,bobEnd)} return 852+bob; }`;
const { code } = await transformWithOxc(source, 'gait.ts');
const { feet, hip } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
let flight = 0, maxWalkLift = 0, maxRunLift = 0, maxRunReach = 0;
for (let i=0;i<1000;i++) {
  const phase=i/1000, walk=feet(phase,0), run=feet(phase,1);
  assert(walk.some(f=>f.lift===0), 'walking always has a planted foot');
  if(run.every(f=>f.lift>0)) flight++;
  for(const f of run) assert(Number.isFinite(f.z) && Number.isFinite(f.lift) && f.lift>=0);
  for(const f of run) if(f.lift===0) assert(Math.hypot(926-hip(phase,1),f.z)<=75*1.05, 'planted running feet remain within leg reach instead of floating');
  maxWalkLift=Math.max(maxWalkLift,...walk.map(f=>f.lift));
  maxRunLift=Math.max(maxRunLift,...run.map(f=>f.lift));
  maxRunReach=Math.max(maxRunReach,...run.map(f=>Math.abs(f.z)));
}
assert(flight>200 && flight<400, 'running has a distinct, bounded airborne phase');
assert(maxRunLift>maxWalkLift*2, 'running folds the legs with a higher recovery');
assert(maxRunReach>40, 'running uses a longer stride');
for(const run of [0,.5,1]) for(const boundary of [0,.5-run*.16,1]) {
  const a=feet((boundary+1-1e-7)%1,run)[0],b=feet((boundary+1+1e-7)%1,run)[0];
  assert(Math.hypot(a.z-b.z,a.lift-b.lift)<.01, 'foot positions stay continuous at contact and wrap');
}
console.log(JSON.stringify({ok:true,flightSamples:flight,maxWalkLift,maxRunLift,maxRunReach}));
