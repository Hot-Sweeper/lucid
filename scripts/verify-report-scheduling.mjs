import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformWithOxc} from 'vite';
const source = fs.readFileSync(new URL('../src/office/orchestrator.ts',import.meta.url),'utf8')
  .replace('import gsap from "gsap";', 'const gsap = {};')
const code = (await transformWithOxc(source,'orchestrator.ts')).code;
const originalInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
globalThis.window = {setTimeout:()=>0,lucid:{}};
globalThis.location = {search:'?app=1'};
try {
  const {Orchestrator} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  let state = {threadId:'boss',review:false,paused:true};
  let animations = 0;
  const world = {reports:new Map(),lastData:{threads:[]},bossDecision:()=>animations++,queueReport:()=>animations++};
  const orch = new Orchestrator({}, world, () => state, value => {state=value;});
  await orch.reportsFlight;
  const originalSync = orch.runReportSync.bind(orch);
  const calls = [], releases = [];
  orch.runReportSync = async threads => {
    calls.push(threads);
    await new Promise(resolve => releases.push(resolve));
  };
  const first = orch.observe([{id:'first'}]);
  for (let n=0;n<1000;n++) assert.equal(orch.observe([{id:String(n)}]), first);
  assert.equal(calls.length,1,'only one report operation in flight');
  releases.shift()(); await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length,2,'one follow-up for all observations');
  assert.equal(calls[1][0].id,'999','follow-up uses latest observation');
  releases.shift()(); await first; await Promise.resolve();
  assert.equal(orch.reportsFlight,null,'settled work releases its owner');
  assert.equal(orch.pendingReportThreads,null);
  orch.runReportSync = originalSync;
  let releaseTick;
  window.lucid = {reportsList:async()=>[],reportsTick:()=>new Promise(resolve=>{releaseTick=resolve;})};
  const pending = orch.observe([]);
  await Promise.resolve(); await Promise.resolve();
  world.lastData = {threads:[{id:'worker',runStatus:'running'}]};
  releaseTick([{id:'paper',threadId:'worker',status:'reviewing'}]);
  await pending;
  assert.equal(animations,0,'late review cannot animate a robot that resumed work');
  const switched = orch.observe([]);
  await Promise.resolve(); await Promise.resolve();
  world.lastData = {environmentId:'remote',threads:[{id:'worker',runStatus:'completed'}]};
  releaseTick([{id:'paper',threadId:'worker',status:'reviewing'}]);
  await switched;
  assert.equal(animations,0,'local report cannot animate the remote building');
  console.log('Report scheduling: 1000 observations coalesced; latest snapshot, stale reports, environment switch and cleanup passed.');
} finally {globalThis.setInterval = originalInterval;}
