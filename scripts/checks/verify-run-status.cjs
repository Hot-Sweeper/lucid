// A thread's status comes from a run still in progress before messages waiting in the queue, and
// both before newer runs that ended. Messages removed from the queue never ran and a queue T3
// holds after a stop waits for you, so neither makes a desk look working or stopped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const source = fs.readFileSync(require.resolve('../../electron/t3.cjs'), 'utf8');
const constant = (name) => JSON.parse(source.match(new RegExp(`const ${name} = ("[^\\n]*");`))[1]);
const fill = (q) => q.replace('${STATUS_RUN}', constant('STATUS_RUN')).replace('${STATUS_ORDER}', constant('STATUS_ORDER'));
const queries = [...source.matchAll(/\(select status from orchestration_v2_projection_runs r where r\.thread_id = t\.thread_id and \$\{STATUS_RUN\} order by \$\{STATUS_ORDER\} limit 1\) as runStatus/g)].map(m => fill(m[0]));
assert.ok(queries.length >= 2, 'every thread list reads run status the same way');
assert.match(source, /orchestration_v2_projection_runs r where r\.thread_id = \? and \$\{STATUS_RUN\} order by \$\{STATUS_ORDER\} limit 1/, "a robot's own run (threadInfo) is picked the same way");
const db = new DatabaseSync(':memory:');
db.exec("create table orchestration_v2_projection_threads(thread_id text); create table orchestration_v2_projection_runs(thread_id text, ordinal integer, status text, payload_json text);");
const status = (runs) => {
  db.exec('delete from orchestration_v2_projection_threads; delete from orchestration_v2_projection_runs;');
  db.prepare('insert into orchestration_v2_projection_threads values (?)').run('t');
  for (const [ordinal, s, p = { startedAt: s === 'queued' ? null : '2026-11-14T10:00:00Z' }] of runs) db.prepare('insert into orchestration_v2_projection_runs values (?,?,?,?)').run('t', ordinal, s, JSON.stringify(p));
  return queries.map(q => db.prepare(`select ${q} from orchestration_v2_projection_threads t`).get().runStatus);
};
const same = (runs, want, why) => assert.deepEqual(status(runs), queries.map(() => want), why);
const removed = { startedAt: null };
same([[8, 'running'], [9, 'cancelled', removed], [10, 'cancelled', removed]], 'running', 'messages removed from the queue do not hide the run still working');
same([[8, 'completed'], [9, 'cancelled', removed]], 'completed', 'a message removed from the queue never ran, so finished work stays finished');
same([[8, 'completed'], [9, 'cancelled']], 'cancelled', 'with nothing active, the newest run that ran decides');
same([[8, 'completed'], [9, 'completed']], 'completed');
same([[8, 'completed'], [9, 'queued']], 'queued', 'waiting messages count as active');
same([[8, 'running'], [9, 'queued'], [10, 'queued']], 'running', 'the run working outranks the messages waiting behind it');
same([[8, 'interrupted'], [9, 'queued', { startedAt: null, queueHeld: true }]], 'interrupted', 'a queue T3 holds after a stop waits for you: the thread is not working');
same([[8, 'waiting'], [9, 'failed']], 'waiting', 'a run waiting on you outranks a newer failure');
console.log(`PASS: run status prefers live runs, then waiting messages, over newer ended ones, ignoring removed and held queue entries (${queries.length} queries).`);
