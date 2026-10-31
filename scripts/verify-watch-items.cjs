const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createItemWatcher } = require("../electron/watch-items.cjs");

function fixture(events = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lucid-watch-"));
  const file = path.join(dir, "state.sqlite"), writer = new DatabaseSync(file);
  writer.exec(`pragma journal_mode=wal;
    create table orchestration_v2_projection_turn_items (turn_item_id text primary key,thread_id text,run_id text,ordinal integer,type text,status text,updated_at text,payload_json text);
    create index items_thread on orchestration_v2_projection_turn_items(thread_id,ordinal);
    ${events ? "create table orchestration_events(sequence integer primary key autoincrement,event_type text,payload_json text);" : ""}`);
  let reader = new DatabaseSync(file, { readOnly: true }), clock = 1000, ticks = [], queries = [];
  const wrap = db => ({ prepare(sql) { queries.push(sql); return db.prepare(sql); } });
  let current = wrap(reader);
  const watcher = createItemWatcher({ getDb: () => current, normalize: r => ({ id: r.id, thread: r.threadId, at: r.updatedAt, text: JSON.parse(r.payload).text }), threadInfo: id => ({ id }),
    now: () => clock, interval: fn => { ticks.push(fn); return fn; }, cancel: fn => { ticks = ticks.filter(t => t !== fn); } });
  const put = (id, thread, text, at = "2026-10-31T12:00:00Z", ordinal = 1, event = events) => {
    writer.prepare("insert or replace into orchestration_v2_projection_turn_items values (?,?,?,?,?,?,?,?)").run(id, thread, "run", ordinal, "assistant_message", "running", at, JSON.stringify({ text }));
    if (event) writer.prepare("insert into orchestration_events(event_type,payload_json) values ('turn-item.updated',?)").run(JSON.stringify({ id, threadId: thread }));
  };
  return { watcher, writer, put, queries, get ticks() { return ticks; }, advance(ms) { clock += ms; },
    replace() { reader.close(); const next = new DatabaseSync(":memory:"); next.exec("create table orchestration_v2_projection_turn_items (turn_item_id text primary key,thread_id text,run_id text,ordinal integer,type text,status text,updated_at text,payload_json text);create table orchestration_events(sequence integer primary key,event_type text,payload_json text)"); next.prepare("insert into orchestration_v2_projection_turn_items values ('replacement','a','run',1,'assistant_message','completed','2026-10-31T13:00:00Z','{\"text\":\"replacement\"}')").run(); reader = next; current = wrap(next); },
    close() { reader.close(); writer.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test("one cursor coalesces native revisions, preserves same-timestamp updates and isolates watched threads", () => {
  const f = fixture(), a = [], b = [];
  try {
    f.put("one", "a", "initial");
    const stopA = f.watcher.watch("a", (items, initial) => { a.push({ items, initial }); if (initial) f.put("race", "a", "arrived during initial callback", undefined, 2); }, () => {});
    const stopB = f.watcher.watch("b", (items, initial) => b.push({ items, initial }), () => {});
    assert.equal(f.ticks.length, 1);
    f.put("one", "a", "first revision"); f.put("one", "a", "latest revision"); f.put("two", "b", "other thread");
    f.watcher.poll();
    assert.deepEqual(a.at(-1).items.map(r => r.text), ["latest revision", "arrived during initial callback"]);
    assert.deepEqual(b.at(-1).items.map(r => r.text), ["other thread"]);
    const countA = a.length, countB = b.length; f.watcher.poll();
    assert.equal(a.length, countA); assert.equal(b.length, countB);
    stopA(); assert.equal(f.ticks.length, 1); stopB(); assert.equal(f.ticks.length, 0);
  } finally { f.close(); }
});

test("unchanged ticks never rescan histories; activity updates include unwatched native items", () => {
  const f = fixture();
  try {
    f.put("one", "a", "initial"); const stop = f.watcher.watch("a", () => {}, () => {}); f.watcher.poll();
    const initial = f.watcher.latestActivity(["a"]); assert.equal(initial.get("a"), "2026-10-31T12:00:00Z");
    f.queries.length = 0;
    for (let i = 0; i < 50; i++) f.watcher.poll();
    assert.ok(f.queries.every(sql => sql === "pragma data_version"));
    f.put("other", "unwatched", "activity", "2026-10-31T13:00:00Z");
    assert.equal(f.watcher.latestActivity(["unwatched"]).get("unwatched"), "2026-10-31T13:00:00Z"); stop();
  } finally { f.close(); }
});

test("old schemas fall back to projection changes with same-timestamp fingerprints", () => {
  const f = fixture(false), seen = [];
  try {
    f.put("one", "a", "initial"); const stop = f.watcher.watch("a", items => seen.push(items), () => {}); f.watcher.poll();
    f.put("one", "a", "changed without events"); f.watcher.poll();
    assert.equal(seen.at(-1)[0].text, "changed without events"); stop();
  } finally { f.close(); }
});

test("periodic reconciliation repairs direct projection edits without native events", () => {
  const f = fixture(), seen = [];
  try {
    f.put("one", "a", "initial"); const stop = f.watcher.watch("a", items => seen.push(items), () => {}); f.watcher.poll();
    f.put("one", "a", "direct projection revision", undefined, 1, false); f.watcher.poll();
    assert.equal(seen.length, 1); f.advance(15001); f.watcher.poll();
    assert.equal(seen.at(-1)[0].text, "direct projection revision"); stop();
  } finally { f.close(); }
});

test("connection replacement and sequence rewind reset old watermarks", () => {
  const f = fixture(), seen = [];
  try {
    f.put("one", "a", "initial"); const stop = f.watcher.watch("a", items => seen.push(items), () => {}); f.watcher.poll();
    f.writer.exec("delete from orchestration_events;delete from sqlite_sequence where name='orchestration_events'");
    f.watcher.poll(); f.put("one", "a", "after sequence rewind"); f.watcher.poll(); assert.equal(seen.at(-1)[0].text, "after sequence rewind");
    f.replace(); f.watcher.poll(); assert.equal(seen.at(-1)[0].text, "replacement"); stop();
  } finally { f.close(); }
});

test("the safety reconciliation is spread over ticks instead of scanning every desk in one turn", () => {
  const f = fixture(), stops = [];
  try {
    for (let i = 0; i < 20; i++) { f.put(`item-${i}`, `thread-${i}`, "initial"); stops.push(f.watcher.watch(`thread-${i}`, () => {}, () => {})); }
    f.watcher.poll(); f.queries.length = 0; f.advance(15001); f.watcher.poll();
    assert.equal(f.queries.filter(q => q.includes("updated_at>=?")).length, 2);
    f.queries.length = 0; f.watcher.poll();
    assert.equal(f.queries.filter(q => q.includes("updated_at>=?")).length, 2);
  } finally { stops.forEach(stop => stop()); f.close(); }
});
