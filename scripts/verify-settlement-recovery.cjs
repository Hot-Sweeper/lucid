const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createReports,parseVerdict} = require('../electron/reports.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-settlement-recovery-'));
(async () => {
  assert.equal(parseVerdict('{"report":"other"} then {"report":"right","summary":"A } and \\"quote\\""}', 'right')?.report, 'right');
  assert.equal(parseVerdict('x'.repeat(300000)),null);
  let run = 'one', settled = false, fail = true, replies = [], scanRelease;
  const config = {threadId:'boss',review:true,paused:false};
  const sends = [], dispatches = [];
  let usageCalls = 0;
  const facts = () => ({run:{id:run,status:'completed'},title:'Completed task',pendingRuns:0,pendingRequests:0,pinned:false,settled,messages:[{role:'assistant',text:'Actual completion'}],sessions:[]});
  const deps = {dir:path.join(root,'papers'),settings:()=>config,robots:()=>[],
    t3:{world:()=>({threads:[{id:'worker',runStatus:'completed'}]}),reportState:facts,reportFacts:facts,repliesSince:()=>({messages:replies}),sendMessage:async m=>sends.push(m)},
    usage:{getSessionUsage:async()=>{usageCalls++;if(scanRelease) await new Promise(resolve=>{scanRelease=resolve});return {available:false};}},
    server:{settleThread:async(id, options)=>{dispatches.push(options);if(fail)throw Error('Temporary disconnect');settled=true;}}};
  let service = createReports(deps);
  // No renderer and no arrived robot: work must still reach review.
  await service.supervise();
  assert.equal(sends.length,1);
  assert.equal(service.list()[0].status,'reviewing');
  assert.equal(service.list()[0].delivered,false);
  const id = service.list()[0].id;
  replies = [{streaming:false,text:JSON.stringify({report:id,decision:'approve',summary:'Verified',visualChanged:false,checks:['Actual checks']})}];
  await service.supervise();
  assert.equal(service.list()[0].status,'approved','approval waits on the desk for Collect');
  assert.equal(dispatches.length,0,'approval alone never settles');
  await service.supervise();assert.equal(dispatches.length,0,'repeated supervision does not settle before Collect');
  await assert.rejects(service.manual(id,'collect'),/Temporary disconnect/);
  assert.equal(service.list()[0].status,'approved','collect transport failure retains approval');
  assert.match(service.list()[0].error,/Temporary disconnect/);
  service = createReports(deps);
  assert.equal(service.list()[0].status,'approved','approval survives restart');
  // Older versions downgraded an approved verdict to manual review on disconnect.
  const legacy = service.list();legacy[0].status='manual-review';
  fs.writeFileSync(path.join(deps.dir,'index.json'),JSON.stringify(legacy));
  service=createReports(deps);
  const now = Date.now;
  Date.now = () => now()+10000;
  fail=false;
  try { await service.supervise(); } finally { Date.now=now; }
  assert.equal(service.list()[0].status,'settled');
  assert.equal(sends.length,1,'settlement recovery does not ask for another review');
  assert.equal(dispatches[1].expectedRunId,'one');
  await service.supervise();assert.equal(dispatches.length,2,'confirmed settlement does not repeat');
  // A new run during evidence collection cannot enter the review queue.
  settled=false;run='two';
  deps.usage.getSessionUsage=async()=>{run='three';return {available:false};};
  assert.equal(await service.submit('worker'),null);
  // One background scan at a time, even with repeated wakeups.
  deps.usage.getSessionUsage=async()=>{usageCalls++;await new Promise(resolve=>{scanRelease=resolve});return {available:false};};
  const first=service.supervise();
  await Promise.resolve();await Promise.resolve();
  const count=usageCalls;
  const more=Array.from({length:100},()=>service.supervise());
  assert.equal(usageCalls,count);
  scanRelease();await Promise.all([first,...more]);
  config.paused=true;run='four';const before=service.list().length;
  await service.supervise();assert.equal(service.list().length,before,'paused supervisor does not submit work');
  // A completion alone is never a settlement authorization.
  deps.usage.getSessionUsage=async()=>({available:false});
  const unreviewed=await service.submit('worker');
  await service.manual(unreviewed.id,'approve',{summary:'Looks done',visualChanged:false,checks:['Checks pass']});
  assert.equal(unreviewed.status,'manual-review');
  assert.match(unreviewed.error,/orchestrator/);
  assert.equal(dispatches.length,2,'unreviewed report cannot dispatch settlement');
  const originalState=deps.t3.reportState;
  // A separate service captures a live pinned state for manual paths too.
  deps.t3.reportState=()=>({...facts(),pinned:true});
  const protectedService=createReports(deps);
  await protectedService.manual(unreviewed.id,'approve',{summary:'Checked',visualChanged:false,checks:['Pass']});
  assert.equal(protectedService.list()[0].status,'manager-excluded');
  assert.equal(dispatches.length,2,'manual approval cannot settle a pinned thread');
  deps.t3.reportState=originalState;
  // T3 reconnect must validate the reviewed run immediately before settlement.
  const source=fs.readFileSync(require.resolve('../electron/t3server.cjs'),'utf8');
  const fn=source.slice(source.indexOf('async function settleThread('),source.indexOf('function unsettleThread('));
  let bridgeDispatches=0;
  const vm=require('node:vm'),ctx={connect:async()=>{},require:()=>({reportState:()=>({run:{id:'new-run',status:'completed'}})}),dispatch:()=>bridgeDispatches++,T3ServerError:class extends Error{constructor(m,code){super(m);this.code=code;}}};
  vm.runInNewContext(fn+';this.settle=settleThread',ctx);
  await assert.rejects(ctx.settle('worker',{expectedRunId:'old-run'}),e=>e.code==='stale-review');
  assert.equal(bridgeDispatches,0);
  console.log('PASS: renderer-independent review, automatic settlement retry/restart, confirmation, run fencing, stale snapshots, pause and single-flight supervision.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(root).startsWith('lucid-settlement-recovery-'))throw Error('Unexpected cleanup target');
  fs.rmSync(root,{recursive:true,force:true});
});
