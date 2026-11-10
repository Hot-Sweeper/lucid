// A thread's status comes from a run still in progress before newer runs that ended. Queued
// messages cancelled while the robot works must not make a working desk look stopped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const source = fs.readFileSync(require.resolve('../electron/t3.cjs'), 'utf8');
const queries = [...source.matchAll(/\(select status from orchestration_v2_projection_runs r where r\.thread_id = t\.thread_id ([^)]*\)[^)]*)\) as runStatus/g)].map(m => m[0]);
assert.ok(queries.length >= 3, 'every thread list reads run status the same way');
const db = new DatabaseSync(':memory:');
db.exec("create table orchestration_v2_projection_threads(thread_id text); create table orchestration_v2_projection_runs(thread_id text, ordinal integer, status text);");
const status = (runs) => {
  db.exec('delete from orchestration_v2_projection_threads; delete from orchestration_v2_projection_runs;');
  db.prepare('insert into orchestration_v2_projection_threads values (?)').run('t');
  for (const [ordinal, s] of runs) db.prepare('insert into orchestration_v2_projection_runs values (?,?,?)').run('t', ordinal, s);
  return queries.map(q => db.prepare(`select ${q} from orchestration_v2_projection_threads t`).get().runStatus);
};
const same = (runs, want, why) => assert.deepEqual(status(runs), queries.map(() => want), why);
same([[8, 'running'], [9, 'cancelled'], [10, 'cancelled'], [11, 'cancelled']], 'running', 'cancelled queued messages do not hide the run still working');
same([[8, 'completed'], [9, 'cancelled']], 'cancelled', 'with nothing active, the newest run decides');
same([[8, 'completed'], [9, 'completed']], 'completed');
same([[8, 'completed'], [9, 'queued']], 'queued', 'queued work counts as active');
same([[8, 'waiting'], [9, 'failed']], 'waiting', 'a run waiting on you outranks a newer failure');
console.log(`PASS: run status prefers active runs over newer ended ones (${queries.length} queries).`);
