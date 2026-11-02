import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
const load=async(path,replacements=[])=>{
  let source=await readFile(new URL(path,import.meta.url),'utf8');
  for(const[a,b]of replacements)source=source.replace(a,b);
  const {code}=await transformWithOxc(source,path);
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
};
const interval=globalThis.setInterval;
globalThis.setInterval=()=>0;
globalThis.window={setTimeout:()=>0,lucid:{}};
globalThis.location={search:'?autoScope=(none)'};
globalThis.matchMedia=()=>({matches:true});
try{
  const {Orchestrator}=await load('../src/office/orchestrator.ts', [['import gsap from "gsap";','const gsap={};']]);
  let state={threadId:'boss',review:false,paused:false,learned:0,seenUntil:'',lastSentAt:0};
  let resolveMessages,resolveSend,sends=0;
  const api={userMessagesSince:()=>new Promise(r=>resolveMessages=r),sendMessage:async()=>{sends++;await new Promise(r=>resolveSend=r);}};
  const orch=new Orchestrator(api,{},()=>state,s=>state=s);
  assert.equal(state.review,false,'migration preserves manual review');
  orch.setPresence('away');assert.equal(state.paused,true);assert.equal(state.presence,'away');
  orch.setReview(true);assert.equal(state.paused,true,'review preference never wakes a resting orchestrator');
  orch.setAuto(false);assert.equal(state.auto,false);
  orch.setPresence('awake');assert.equal(state.paused,false);assert.equal(state.review,true);
  const pending=orch.learn(true);orch.setPresence('sleep');resolveMessages([{at:'now',text:'Preference',title:'Task'}]);await pending;
  assert.equal(sends,0,'sleep during a pending read prevents a new learning request');
  orch.setPresence('awake');const inFlight=orch.learn(true);resolveMessages([{at:'now',text:'Preference',title:'Task'}]);await Promise.resolve();
  orch.setPresence('away');orch.setReview(false);resolveSend();await inFlight;
  assert.equal(state.paused,true);assert.equal(state.presence,'away');assert.equal(state.review,false,'completed background work cannot overwrite newer controls');
  const el=()=>({classList:{add(){}},setAttribute(){},addEventListener(){},style:{}});
  class Walker{constructor(){this.el=el();this.activity='idle';}setPos(){}face(){}setDeskEdge(){}do(a){this.activity=a;}destroy(){this.destroyed=true;}setExpression(){} }
  globalThis.__ControlWalker=Walker;
  const {Boss}=await load('../src/world/boss.ts',[
    ['import gsap from "gsap";','const gsap={set(){},to(){return{kill(){}}},delayedCall(){return{kill(){}}}};'],
    ['import { Walker } from "./walker";','const Walker=globalThis.__ControlWalker;'],
  ]);
  const boss=new Boss({}, {seat:{x:0,y:0},edge:0,z:0});
  const info={id:'boss',provider:'codex',running:false};boss.set(info);
  boss.setPresence('sleep');assert.equal(boss.w.activity,'nap');
  boss.set({...info,running:true});assert.equal(boss.w.activity,'nap','refreshes cannot wake sleeping robot');
  const old=boss.w;boss.setPresence('away');assert.equal(boss.w,null);assert.equal(old.destroyed,true,'away leaves the desk empty');
  boss.setPresence('awake');assert.equal(boss.w.activity,'type','wake restores the robot at its desk');
  boss.clear();console.log(JSON.stringify({ok:true,checks:['manual migration','presence/pause','independent preferences','pending-read pause','in-flight preference race','sleep refresh','away','wake']}));
}finally{globalThis.setInterval=interval;delete globalThis.__ControlWalker;}
