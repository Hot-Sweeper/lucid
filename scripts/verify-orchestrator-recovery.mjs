import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {transformWithOxc} from 'vite';

const backend=fs.readFileSync(new URL('../electron/t3.cjs',import.meta.url),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(`create table orchestration_v2_projection_messages(thread_id text,created_at text,role text,streaming integer,payload_json text);
create table orchestration_v2_projection_runs(thread_id text,ordinal integer,status text);
create table orchestration_v2_projection_threads(thread_id text,archived_at text,deleted_at text);
insert into orchestration_v2_projection_threads values('boss',null,null);
insert into orchestration_v2_projection_runs values('boss',1,'completed');`);
const put=db.prepare('insert into orchestration_v2_projection_messages values(?,?,?,?,?)');
for(let n=0;n<60;n++)put.run('boss',new Date(1700000000000+n*1000).toISOString(),'assistant',0,JSON.stringify({text:'Progress '+n}));
put.run('boss',new Date(1700000060000).toISOString(),'assistant',0,JSON.stringify({text:'{"request":"Q-late","answers":[]}'}));
put.run('boss',new Date(1700000061000).toISOString(),'user',0,JSON.stringify({text:'Do not include user prompts'}));
const ctx={getDb:()=>db,safeJson:JSON.parse};vm.createContext(ctx);
const start=backend.indexOf('function repliesSince('),end=backend.indexOf('/** Questions and approvals',start);
vm.runInContext(backend.slice(start,end)+';this.read=repliesSince',ctx);
const recent=ctx.read('boss',new Date(1700000000000).toISOString());
assert.equal(recent.messages.length,20);
assert.match(recent.messages.at(-1).text,/Q-late/,'a late answer survives more than 20 progress updates');
assert(recent.messages.every((m,i,a)=>!i||m.at>=a[i-1].at),'latest bounded page remains chronological');
assert.equal(recent.exists,true);db.close();

const source=fs.readFileSync(new URL('../src/office/delegate.ts',import.meta.url),'utf8');
const code=(await transformWithOxc(source.replace(/^import .*;\r?$/gm,'').replace(/^export /gm,''),'delegate.ts')).code.replace(/export\s*\{[\s\S]*?\};?\s*$/,'');
const {Delegate,tagOf}=new Function('answerFor','location','window',code+';return {Delegate,tagOf}')(()=>null,{search:'?app=1'},{});
const state={threadId:'boss',auto:true,paused:false},r={id:'req',type:'input',answerable:true,questions:[{id:'0',question:'Run the private checks?',header:'Checks',options:[{label:'Yes'}]}]},t={id:'worker',projectId:'p',title:'Worker',question:true};
function make(outcome='failed',attempts=1,at=new Date(Date.now()-31000).toISOString()){
  const d=Object.create(Delegate.prototype);
  Object.assign(d,{get:()=>state,appWindow:true,ready:Promise.resolve(),seen:new Set(['req']),queue:[],projects:new Map(),phases:new Map(),advice:new Map(),log:{auto:0,asked:0,log:[{requestId:'req',outcome,attempts,at}]},onChange(){},onPhase(){},work(){},api:{pendingRequests:async()=>[r]}});
  return d;
}
let d=make();await d.observe([t],[]);await d.observe([t],[]);assert.equal(d.queue.length,1,'an eligible failure is queued once');
d=make('failed',3);await d.observe([t],[]);assert.equal(d.queue.length,0,'bounded attempts survive reload via the log');
d=make('failed',1,new Date().toISOString());await d.observe([t],[]);assert.equal(d.queue.length,0,'backoff prevents hot retries');
d=make('asked');await d.observe([t],[]);assert.equal(d.queue.length,0,'human-only or uncertain answers are never auto-retried');
d=make();d.activeRequest='req';await d.observe([t],[]);assert.equal(d.queue.length,0,'in-flight requests are never duplicated');
d=make();state.paused=true;await d.observe([t],[]);assert.equal(d.queue.length,0,'pause suppresses retries');state.paused=false;

// Recover a tagged answer that arrived after the prior timeout, without another model ask.
d=make();let sends=0,responds=0;
Object.assign(d,{phase(){},judge:()=>({send:true,confidence:1,reason:'Authorized',answers:{'0':'Yes'},answerText:'Yes'}),t3:{respond:async()=>{responds++}},api:{pendingRequests:async()=>[r],repliesSince:async()=>({exists:true,messages:[{streaming:false,text:JSON.stringify({request:tagOf(r.id),answers:[]})}]}),sendMessage:async()=>{sends++},orchLog:async record=>({auto:1,asked:0,log:[record]})}});
await d.decide(r,t);assert.equal(sends,0);assert.equal(responds,1);assert.equal(d.log.log[0].attempts,2);
d=make();Object.assign(d,{phase(){},judge:()=>({send:false,confidence:0,reason:'Requires human fact'}),api:{pendingRequests:async()=>[r],repliesSince:async()=>({exists:true,messages:[{streaming:false,text:JSON.stringify({request:tagOf(r.id),answers:[]})}]}),orchLog:async record=>({auto:0,asked:1,log:[record]})},t3:{respond:async()=>{throw Error('must not answer uncertain facts')}}});
await d.decide(r,t);assert.equal(d.log.log[0].outcome,'asked','late low-confidence replies retain the human gate');

// The selected orchestrator can change while the last live-request check waits.
// Its predecessor's verdict must not be sent under the replacement's ownership.
d=make();let releasePending,enteredPending,staleAnswers=0;
const requestGate=new Promise(resolve=>{releasePending=resolve;}),requestEntered=new Promise(resolve=>{enteredPending=resolve;});
Object.assign(d,{phase(){},judge:()=>({send:true,confidence:1,reason:'Authorized',answers:{'0':'Yes'}}),t3:{respond:async()=>{staleAnswers++;}},api:{
  repliesSince:async()=>({exists:true,messages:[{streaming:false,text:JSON.stringify({request:tagOf(r.id),answers:[]})}]}),
  pendingRequests:async()=>{enteredPending();await requestGate;return[r];},orchLog:async record=>({auto:0,asked:0,log:[record]})}});
const deciding=d.decide(r,t);await requestEntered;state.threadId='replacement-boss';releasePending();await deciding;
assert.equal(staleAnswers,0,'a replaced orchestrator cannot send its delayed verdict');
assert.equal(d.seen.has(r.id),false,'the replacement can reconsider the unresolved request');state.threadId='boss';
d=make();Object.assign(d,{phase(){},api:{
  repliesSince:async()=>({exists:true,messages:[{streaming:false,text:JSON.stringify({request:tagOf(r.id),answers:[]})}]}),
  pendingRequests:async()=>{throw Error('temporary transport failure');},orchLog:async record=>({auto:0,asked:0,log:[record]})}});
await d.decide(r,t);
assert.equal(d.log.log[0].outcome,'failed','a failed live read cannot be reported as a user answer');
assert.equal(d.log.log[0].attempts,2,'a failed live read retains the bounded retry mechanism');
assert.match(d.log.log[0].reason,/could not verify/);
console.log('PASS: busy-thread reply window, chronological order, bounded/backoff retries, queue deduplication, pause, late-response reuse, human-confidence gate, final recheck ownership and transient read failure.');
