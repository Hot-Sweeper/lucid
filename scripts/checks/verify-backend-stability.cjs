const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createJsonStore } = require('../../electron/json-store.cjs');
const { runCliProcess } = require('../../electron/cli-runner.cjs');

async function storage() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-storage-'));
  try {
    const file = path.join(dir, 'settings.json');
    await fs.writeFile(file, '{"version":0}');
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const began = new Promise(resolve => { entered = resolve; });
    let renames = 0, fail = false;
    const io = { ...fs, async rename(from, to) {
      renames++;
      if (renames === 1) { entered(); await gate; }
      if (fail) throw Error('disk unavailable');
      return fs.rename(from, to);
    } };
    const store = createJsonStore(file, { fallback: '{}', io });
    const first = store.save('{"version":1}');
    const second = store.save('{"version":2}');
    await began;
    assert.equal(renames, 1, 'newer save must wait for the previous write');
    assert.equal(store.load(), '{"version":0}', 'readers see complete old data during replacement');
    let flushed = false;
    const flush = store.flush().then(() => { flushed = true; });
    await Promise.resolve(); assert.equal(flushed, false);
    release(); await Promise.all([first, second, flush]);
    assert.equal(store.load(), '{"version":2}'); assert.equal(store.pending, false);
    fail = true;
    await assert.rejects(store.save('{"version":3}'), /disk unavailable/);
    assert.equal(store.load(), '{"version":2}', 'failed replacement preserves saved user edits');
    fail = false;
    await store.save('{"version":4}'); await store.flush();
    assert.equal(store.load(), '{"version":4}', 'failure does not poison future saves');
    await assert.rejects(store.save('not json'));
    await assert.rejects(store.save('[]'));
    await assert.rejects(store.save('null'));
    assert.equal(store.load(), '{"version":4}');
    assert.deepEqual(await fs.readdir(dir), ['settings.json'], 'failed writes clean up temporary files');
    const roster = createJsonStore(path.join(dir, 'roster.json'), { fallback: '[]', array: true });
    await roster.save('[{"name":"kept"}]'); await roster.flush();
    assert.deepEqual(JSON.parse(roster.load()), [{ name: 'kept' }]);
    await assert.rejects(roster.save('{}'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function childFixture() {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = data => { child.input = data; };
  child.kill = () => { child.killed = true; };
  let expired, cancellations = 0;
  return { child, options: { spawnProcess: () => child, timeout: fn => { expired = fn; return 1; }, cancelTimeout: () => cancellations++ },
    expire: () => expired(), cancellations: () => cancellations };
}

async function cli() {
  let f = childFixture();
  let pending = runCliProcess('t3', ['thread', 'send'], { ...f.options, input: 'preserved prompt' });
  assert.equal(f.child.input, 'preserved prompt');
  f.child.stdout.emit('data', Buffer.from('{"ok":true}')); f.child.emit('close', 0);
  assert.equal(await pending, '{"ok":true}'); assert.equal(f.cancellations(), 1);
  f = childFixture(); pending = runCliProcess('t3', [], f.options);
  f.expire(); await assert.rejects(pending, /may have reached T3 Code/);
  assert.equal(f.child.killed, true); assert.equal(f.cancellations(), 1);
  f.child.emit('close', 0); assert.equal(f.cancellations(), 1, 'late close cannot resolve a timed out action');
  f = childFixture(); pending = runCliProcess('t3', [], f.options);
  f.child.stdin.emit('error', Error('EPIPE')); await assert.rejects(pending, /EPIPE/);
  assert.equal(f.child.killed, true);
  f = childFixture(); pending = runCliProcess('t3', [], { ...f.options, maxOutputBytes: 4 });
  f.child.stdout.emit('data', Buffer.from('12345')); await assert.rejects(pending, /too much output/);
  assert.equal(f.child.killed, true);
  f = childFixture(); pending = runCliProcess('t3', [], f.options);
  f.child.emit('error', Error('ENOENT')); await assert.rejects(pending, /ENOENT/);
  assert.equal(f.cancellations(), 1);
}

async function reportWithoutRun() {
  // Exercise the real report fact reader against a schema fixture. Existing
  // imported/native threads can legitimately have no projected run yet.
  const { DatabaseSync } = require('node:sqlite');
  const vm = require('node:vm');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT, payload_json TEXT);
      CREATE TABLE orchestration_v2_projection_provider_threads(thread_id TEXT, provider TEXT, payload_json TEXT);
      CREATE TABLE orchestration_v2_projection_messages(thread_id TEXT, role TEXT, created_at TEXT, payload_json TEXT);
      CREATE TABLE orchestration_v2_projection_runs(thread_id TEXT, run_id TEXT, status TEXT, payload_json TEXT);`);
    db.prepare('INSERT INTO orchestration_v2_projection_threads VALUES (?,?)').run('empty', '{"title":"New robot"}');
    const source = await fs.readFile(path.join(__dirname, '../../electron/t3.cjs'), 'utf8');
    const start = source.indexOf('function reportFacts(');
    const end = source.indexOf('// Messages you wrote to robots', start);
    const context = { getDb: () => db, threadInfo: () => ({ id: 'empty', run: null }), safeJson: text => { try { return JSON.parse(text); } catch { return null; } },
      pendingRequests: () => [], effortOf: () => null, require: name => require(path.join(__dirname, '../../electron', name)) };
    vm.runInNewContext(source.slice(start, end) + ';this.read = reportFacts;', context);
    const result = context.read('empty', false);
    assert.equal(result.run, null); assert.equal(result.pendingRuns, 0); assert.equal(result.pinned, false);
  } finally { db.close(); }
}

(async () => {
  await storage(); await cli(); await reportWithoutRun();
  console.log('PASS: queued atomic office saves, retained data during/failing writes, retry, validation, flush, CLI timeout, output bounds, stdin errors, late close and reports without projected runs.');
})().catch(error => { console.error(error); process.exitCode = 1; });
