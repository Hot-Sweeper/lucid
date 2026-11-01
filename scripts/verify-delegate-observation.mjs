import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { transformWithOxc } from 'vite';

const source = await fs.readFile(new URL('../src/office/delegate.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source.replace(/^import .*;\r?$/gm, '').replace(/^export /gm, ''), 'delegate.ts')).code.replace(/export\s*\{[\s\S]*?\};?\s*$/, '');
const { Delegate } = new Function('answerFor', 'location', 'window', code + ';return {Delegate}')(() => null, { search: '?app=1' }, {});
const make = () => {
  const delegate = Object.create(Delegate.prototype);
  Object.assign(delegate, { observationFlight: null, pendingObservation: null });
  return delegate;
};
const gate = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Exercise the real polling implementation with a blocked T3 response.
const d = make(), blocked = gate(), started = gate(), calls = [], worked = [];
const state = { threadId: 'boss', auto: true };
const thread = n => ({ id: `worker-${n}`, projectId: 'p', title: `Worker ${n}`, question: true });
Object.assign(d, { get: () => state, appWindow: true, ready: Promise.resolve(), seen: new Set(), queue: [], projects: new Map(), phases: new Map(),
  advice: new Map(), log: { log: [] }, onPhase() {}, work() { worked.push(this.queue.map(q => q.r.id)); },
  api: { async pendingRequests(id) {
    calls.push(id);
    if (id === 'worker-0') { started.resolve(); await blocked.promise; }
    return [{ id: `request-${id}`, answerable: true }];
  } } });
const first = d.observe([thread(0)], [{ id: 'p', title: 'Initial' }]);
await started.promise;
for (let n = 1; n <= 1000; n++) assert.equal(d.observe([thread(n)], [{ id: 'p', title: `Project ${n}` }]), first);
assert.deepEqual(calls, ['worker-0'], 'only one request poll can be active');
assert.equal(d.pendingObservation.threads[0].id, 'worker-1000');
blocked.resolve(); await first;
assert.deepEqual(calls, ['worker-0', 'worker-1000'], 'only the latest pending world is polled');
assert.equal(d.projects.get('p'), 'Project 1000', 'the latest project snapshot accompanies its threads');
assert.equal(d.observationFlight, null); assert.equal(d.pendingObservation, null);
await d.observe([thread(1000)], [{ id: 'p', title: 'Project 1000' }]);
assert.equal(d.queue.length, 2, 'existing request deduplication remains authoritative');
assert.equal(worked.length, 3);

// Unexpected failures release the flight and still drain its latest observation.
const failing = make(), failureGate = gate(), failureStarted = gate(), recovered = [];
failing.runObservation = async threads => {
  recovered.push(threads[0].id);
  if (threads[0].id === 'worker-0') { failureStarted.resolve(); await failureGate.promise; }
};
const failed = failing.observe([thread(0)], []);
const expectedFailure = assert.rejects(failed, /temporary failure/);
await failureStarted.promise;
assert.equal(failing.observe([thread(1000)], []), failed);
failureGate.reject(Error('temporary failure')); await expectedFailure;
assert.deepEqual(recovered, ['worker-0', 'worker-1000']);
assert.equal(failing.observationFlight, null); assert.equal(failing.pendingObservation, null);
await failing.observe([thread(1001)], []);
assert.equal(recovered.at(-1), 'worker-1001', 'a later observation retries after an error');

const completing = make(), completionCalls = [];
let duringCompletion;
completing.runObservation = async threads => {
  completionCalls.push(threads[0].id);
  if (threads[0].id === 'worker-0') queueMicrotask(() => queueMicrotask(() => {
    duringCompletion = completing.observe([thread(1)], []);
  }));
};
await completing.observe([thread(0)], []); await duringCompletion;
assert.deepEqual(completionCalls, ['worker-0', 'worker-1'], 'an observation during promise completion must not get stranded');

// A synchronous parser regression must fail this check instead of freezing the
// entire update verifier, as it did the actual renderer with unrelated replies.
await new Promise((resolve, reject) => {
  const worker = new Worker(String.raw`
    const assert = require('node:assert/strict');
    const { parentPort, workerData } = require('node:worker_threads');
    const { Delegate, parseReply, tagOf } = new Function('answerFor', 'location', 'window', workerData + ';return {Delegate,parseReply,tagOf}')(() => null, {search:'?app=1'}, {});
    const tag = 'Q-expected';
    const reply = {request:tag, answers:[{answer:'Yes'}]};
    assert.deepEqual(parseReply(JSON.stringify(reply), tag), reply, 'matching object at offset zero');
    assert.deepEqual(parseReply('Reply for ' + tag + ':\n' + JSON.stringify(reply), tag), reply, 'a prose tag before the answer does not hide its JSON');
    assert.deepEqual(parseReply(JSON.stringify(reply) + '\nThat is the answer for ' + tag + '.', tag), reply, 'a prose tag after the answer still finds its JSON');
    assert.equal(parseReply('{"request":"Q-other","answer":"Yes"}', tag), null, 'unrelated object at offset zero');
    assert.equal(parseReply('{"answer":"Yes"}', tag), null, 'missing request tag');
    assert.equal(parseReply('{"request":"Q-other","reason":"Q-expected"}', tag), null, 'tag mentioned in an unrelated object');
    assert.equal(parseReply('{"request":"Q-expected",broken}', tag), null, 'malformed object at offset zero');
    assert.equal(parseReply('{"request":"Q-expected"', tag), null, 'incomplete object at offset zero');
    assert.equal(parseReply('No object, just Q-expected', tag), null, 'tag without an object');
    assert.deepEqual(parseReply('Answer follows:\n\x60\x60\x60json\n' + JSON.stringify(reply) + '\n\x60\x60\x60', tag), reply, 'prose and fenced replies');
    assert.deepEqual(parseReply(JSON.stringify({envelope:reply}), tag), reply, 'nested tagged reply');
    const quoted = {reason:'literal { brace, } brace, "quote" and \\ slash', request:tag, nested:{note:'} {'}};
    assert.deepEqual(parseReply(JSON.stringify(quoted), tag), quoted, 'quoted braces and escapes do not alter nesting');
    const state = {threadId:'boss',auto:true,paused:false};
    const request = {id:'req',type:'input',answerable:true,questions:[{id:'0',question:'Run the checks?',header:'Checks',options:[{label:'Yes'}]}]};
    const thread = {id:'worker',projectId:'p',title:'Worker',question:true};
    async function replay(retry, unrelatedNewest = true) {
      const delegate = Object.create(Delegate.prototype);
      let sends = 0, responds = 0;
      const right = {streaming:false,text:JSON.stringify({request:tagOf(request.id),answers:[]})};
      const other = {streaming:false,text:JSON.stringify({request:'Q-other',reason:'Prior question, not ' + tagOf(request.id)})};
      Object.assign(delegate, {get:()=>state,appWindow:true,seen:new Set([request.id]),projects:new Map(),phases:new Map(),advice:new Map(),
        log:{auto:0,asked:0,log:retry?[{requestId:request.id,outcome:'failed',attempts:1,at:new Date(Date.now()-31000).toISOString()}]:[]},
        phase(){},onChange(){},prompt:async()=> 'Synthetic request',
        judge:()=>({send:true,confidence:1,reason:'Authorized',answers:{'0':'Yes'},answerText:'Yes'}),
        t3:{respond:async()=>{responds++;}},api:{
          pendingRequests:async()=>[request],
          repliesSince:async()=>({exists:true,messages:unrelatedNewest?[right,other]:[other,right]}),
          sendMessage:async()=>{sends++;},orchLog:async record=>({auto:1,asked:0,log:[record]})}});
      await delegate.decide(request,thread);
      assert.equal(responds,1,'unrelated newest JSON does not block a valid decision');
      assert.equal(sends,retry?0:1,'late replies are reused and new decisions ask once');
      assert.equal(delegate.log.log[0].outcome,'answered');
    }
    (async()=>{await replay(false);await replay(true);await replay(true,false);parentPort.postMessage('passed');})().catch(error=>{throw error;});
  `, { eval: true, workerData: code });
  const timeout = setTimeout(() => {
    void worker.terminate();
    reject(Error('Reply parsing or decision replay exceeded 3 seconds, possible synchronous renderer freeze.'));
  }, 3000);
  worker.once('error', error => { clearTimeout(timeout); reject(error); });
  worker.once('message', message => {
    clearTimeout(timeout);
    void worker.terminate().then(() => message === 'passed' ? resolve() : reject(Error('Unexpected parser worker result.')));
  });
});

console.log('PASS: coalesced observations, failure recovery, bounded JSON reply parsing, and normal/retried decisions skip unrelated JSON without freezing.');
