const assert = require('node:assert/strict');
const { createCompanionFrames } = require('../electron/companion-frames.cjs');
async function main() {
  let now = 0, reads = 0, fail = false;
  const state = { settings: '{"wallet":{"spent":20}}', roster: '[{"id":"pip"}]' };
  const local = { state, world: { projects: [{ id:'p' }], threads:[{id:'t',title:'Working'}] }, tasks:[] };
  const remote = { state, world: { environmentId:'remote', projects:[{id:'remote::p'}], threads:[] }, tasks:[] };
  const reader = createCompanionFrames({ now:()=>now, read:async key=>{reads++;await Promise.resolve();if(fail)throw Error('offline');return key==='local'?local:remote;} });
  const [a,b] = await Promise.all([reader.frame('local'),reader.frame('local')]);
  assert.equal(reads,1,'Concurrent phones share the same coherent source read');
  assert.deepEqual(a,b);assert.equal(a.world.threads[0].title,'Working');
  assert.deepEqual(await reader.frame('local',a.revisions),{revisions:a.revisions},'Unchanged refresh sends only revisions');
  assert.ok(JSON.stringify({revisions:a.revisions}).length<300);
  now=200;local.world.threads[0].title='Needs your input';
  const changed=await reader.frame('local',a.revisions);
  assert.equal(changed.world.threads[0].title,'Needs your input');assert.ok(!changed.state && !changed.tasks,'Unchanged roster and task list are not retransmitted');
  assert.equal(a.world.threads[0].title,'Working','A later source mutation cannot alter a cached frame');
  const other=await reader.frame('remote',changed.revisions);
  assert.equal(other.world.environmentId,'remote');assert.notEqual(other.revisions.world,changed.revisions.world);
  now+=200;local.state.roster='[{"id":"pip","name":"Bolt"}]';local.tasks.push({id:'answer'});
  const newest=await reader.frame('local',changed.revisions);
  assert.equal(newest.state.roster,local.state.roster);assert.equal(newest.tasks.length,1);assert.ok(!newest.world);
  now+=200;fail=true;await assert.rejects(reader.frame('local'),/offline/);fail=false;
  assert.ok((await reader.frame('local')).world,'Failed reads do not poison retry');
  local.world.threads[0].title='Submitted now';reader.invalidate();
  assert.equal((await reader.frame('local')).world.threads[0].title,'Submitted now','An action invalidates even a fresh cached frame');
  console.log('Companion frames: coalesced reads, revision-only idle refresh, changed-field delivery, building isolation, immutable snapshots and retry passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
