const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:');
db.exec(`create table orchestration_v2_projection_runtime_requests(runtime_request_id text,thread_id text,kind text,status text,created_at text,payload_json text);create table orchestration_v2_projection_turn_items(turn_item_id text,thread_id text,type text,updated_at text,ordinal int,payload_json text);`);
const insert=db.prepare('insert into orchestration_v2_projection_turn_items values(?,?,?,?,?,?)');
for(const [id,thread,status]of[['open','a','pending'],['closed','a','saved'],['remote','b','pending']])insert.run(id,thread,'secret_request','now',1,JSON.stringify({label:'Password',reason:'Install requested packages',secretStatus:status,secret:'must-not-be-projected'}));
const src=fs.readFileSync('electron/t3.cjs','utf8');const code=src.slice(src.indexOf('function pendingRequests('),src.indexOf('// --- the orchestrator deciding questions'));
const c={getDb:()=>db,safeJson:v=>v?JSON.parse(v):null,DONE_REQUEST:"('resolved','cancelled','expired','failed')"};vm.runInNewContext(code+';globalThis.read=pendingRequests',c);
const rows=c.read('a');assert.equal(rows.length,1);assert.equal(rows[0].id,'open');assert.equal(rows[0].sensitive,true);assert(!JSON.stringify(rows).includes('must-not-be-projected'));
const s=fs.readFileSync('electron/t3server.cjs','utf8');const fn=s.slice(s.indexOf('function respondToRequest('),s.indexOf('// Explicit settlement'));
const calls=[];const t={T3ServerError:class extends Error{},DECISIONS:[],call:async(tag,payload)=>{calls.push({tag,payload})},remoteSecret:async(...args)=>calls.push({remote:args}),dispatch:()=>{throw Error('Secrets must not use orchestration chat dispatch')}};vm.runInNewContext(fn+';globalThis.respond=respondToRequest',t);
(async()=>{await t.respond('a','open',{secret:'throwaway-fixture'});assert.equal(calls[0].tag,'secrets.answerRequest');assert.equal(calls[0].payload.turnItemId,'open');assert.equal(calls[0].payload.answer.type,'save');await t.respond('env::a','open',{declineSecret:true});assert.equal(calls[1].remote[0],'env::a');assert.equal(calls[1].remote[2].type,'decline');t.call=async()=>{throw Error('throwaway-fixture')};await assert.rejects(t.respond('a','open',{secret:'throwaway-fixture'}),e=>!e.message.includes('throwaway-fixture'));console.log('PASS: secret request isolation, metadata allowlist, dedicated secure RPC, remote routing, decline and redacted failures.');})().catch(e=>{console.error(e);process.exitCode=1});

(async()=>{
  const {createRemoteBuilding}=require('../electron/remote-building.cjs');
  const calls=[];
  const projection={runtimeRequests:[{id:'q',kind:'user_input',createdAt:'now',status:'open',responseCapability:{type:'resumable'}},{id:'deny',kind:'command',status:'open',responseCapability:{type:'not_resumable',reason:'Expired session'}}],turnItems:[{id:'q-item',type:'user_input_request',requestId:'q',questions:[{id:'choice',question:'Choose a color',options:[{label:'Blue'}]}]},{id:'s',type:'secret_request',secretStatus:'pending',label:'Password',secret:'must-not-be-projected'},{id:'done',type:'secret_request',secretStatus:'saved'}]};
  const remote=createRemoteBuilding({fetch:async(env)=>{assert.equal(env,'ares');return {projection}},rpc:async(...args)=>calls.push(args)});
  const rows=await remote.pending('ares::thread');
  assert.equal(rows.length,3);assert.equal(rows[0].type,'input');assert.equal(rows[0].questions[0].id,'choice');assert.equal(rows[1].answerable,false);assert.equal(rows[2].sensitive,true);assert(!JSON.stringify(rows).includes('must-not-be-projected'));
  await remote.answerSecret('ares::thread','s',{type:'decline'});
  assert.deepEqual(calls,[['ares','secrets.answerRequest',{threadId:'thread',turnItemId:'s',answer:{type:'decline'}}]]);
  remote.destroy?.();
  console.log('PASS: remote questions, non-resumable approvals and secret metadata use the owning environment.');
})().catch(e=>{console.error(e);process.exitCode=1});
