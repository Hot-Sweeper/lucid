// One read-only change cursor for all desks. T3's event sequence is indexed; each
// desk's updated_at filter is not. Coalesce streaming revisions before loading a
// projection row, rather than scanning every desk's entire history every 350 ms.
const { createHash } = require("node:crypto");
const ROW = "select turn_item_id as id,thread_id as threadId,run_id as runId,ordinal,type,status,updated_at as updatedAt,payload_json as payload from orchestration_v2_projection_turn_items";
const fingerprint = (r) => createHash("sha256").update(r.updatedAt || "").update(r.status || "").update(r.payload || "").digest("base64");

function createItemWatcher({ getDb, normalize, threadInfo, now = Date.now, interval = setInterval, cancel = clearInterval, reconcileMs = 15000 }) {
  const subscribers = new Map();
  let database, feed, cursor = 0, version = -1, timer = null, reconcileAt = 0, pending = false, activities = null, reconciliation = [];

  function setup() {
    const db = getDb();
    if (db === database) return db;
    database = db; feed = null; cursor = 0; version = -1; pending = false; activities = null; reconciliation = [];
    reconcileAt = subscribers.size ? 0 : now() + reconcileMs;
    const tables = new Set(db.prepare("select name from sqlite_master where type='table'").all().map(r => r.name));
    for (const table of ["orchestration_events", "orchestration_v2_events"]) {
      if (!tables.has(table)) continue;
      const head = Number(db.prepare(`select max(sequence) as n from ${table}`).get()?.n || 0);
      if (head || !feed) { feed = table; cursor = head; }
      if (head) break;
    }
    // A recreated connection/database must not retain its predecessor's watermarks.
    for (const set of subscribers.values()) for (const s of set) { s.since = ""; s.seen.clear(); }
    return db;
  }

  function remember(s, rows, initial = false) {
    const changed = [];
    for (const row of rows) {
      const key = fingerprint(row);
      if (initial || s.seen.get(row.id) !== key) changed.push(normalize(row));
      s.seen.delete(row.id); s.seen.set(row.id, key);
      if (row.updatedAt > s.since) s.since = row.updatedAt;
    }
    while (s.seen.size > 2048) s.seen.delete(s.seen.keys().next().value);
    if (initial || changed.length) s.onItems(changed, initial);
  }

  function activity(row) {
    if (activities && row.updatedAt > (activities.get(row.threadId) || "")) activities.set(row.threadId, row.updatedAt);
  }

  function reconcile(db, ids) {
    const latest = db.prepare("select max(updated_at) as at from orchestration_v2_projection_turn_items where thread_id=?");
    for (const id of ids) {
      if (activities?.has(id)) activities.set(id, latest.get(id).at || "");
      for (const s of subscribers.get(id) || []) {
      // Include the boundary itself: native revisions may share an ISO timestamp.
      const rows = db.prepare(`${ROW} where thread_id=? and updated_at>=? order by ordinal`).all(id, s.since);
      remember(s, rows);
      }
    }
  }

  function poll(force = false) {
    const db = setup();
    const nextVersion = Number(db.prepare("pragma data_version").get().data_version);
    const changed = version !== nextVersion;
    if (!changed && !force && !pending && !reconciliation.length && now() < reconcileAt) return;
    version = nextVersion;
    if (feed && (changed || pending || force)) {
      const head = Number(db.prepare(`select max(sequence) as n from ${feed}`).get()?.n || 0);
      if (head < cursor) {
        cursor = 0; activities = null;
        for (const set of subscribers.values()) for (const s of set) { s.since = ""; s.seen.clear(); }
        reconcileAt = 0;
        reconciliation = [];
      }
      const rows = db.prepare(`select sequence,json_extract(payload_json,'$.id') as id,json_extract(payload_json,'$.threadId') as threadId from ${feed} where sequence>? and sequence<=? and event_type in ('turn-item.created','turn-item.updated') order by sequence limit 512`).all(cursor, head);
      cursor = rows.length === 512 ? Number(rows.at(-1).sequence) : head;
      pending = cursor < head;
      const ids = new Map(rows.filter(r => r.id && r.threadId).map(r => [r.id, r.threadId]));
      const batches = new Map();
      const latest = db.prepare(`${ROW} where turn_item_id=? and thread_id=?`);
      const metadata = db.prepare("select thread_id as threadId,updated_at as updatedAt from orchestration_v2_projection_turn_items where turn_item_id=? and thread_id=?");
      for (const [id, threadId] of ids) {
        const row = subscribers.has(threadId) ? latest.get(id, threadId) : metadata.get(id, threadId);
        if (!row) continue;
        activity(row);
        if (subscribers.has(threadId)) { const batch = batches.get(threadId) || []; batch.push(row); batches.set(threadId, batch); }
      }
      for (const [id, batch] of batches) {
        batch.sort((a, b) => a.ordinal - b.ordinal);
        for (const s of subscribers.get(id) || []) remember(s, batch);
      }
    }
    // Reconcile direct projection edits, old schemas and event retention/rebuilds.
    if (!feed && changed) {
      reconcile(db, new Set([...subscribers.keys(), ...(activities?.keys() || [])]));
      reconcileAt = now() + reconcileMs;
    } else {
      if (now() >= reconcileAt && !reconciliation.length) {
        reconciliation = [...new Set([...subscribers.keys(), ...(activities?.keys() || [])])];
        reconcileAt = now() + reconcileMs;
      }
      // A safety pass must not become one 40-desk, synchronous history scan.
      if (reconciliation.length) reconcile(db, reconciliation.splice(0, 2));
    }
    if (changed || force) for (const [id, set] of subscribers) {
      const info = threadInfo(id), key = JSON.stringify(info);
      for (const s of set) if (key !== s.info) { s.info = key; s.onInfo(info); }
    }
  }

  function tick() {
    try { poll(); } catch (error) {
      for (const set of subscribers.values()) for (const s of set) s.onInfo({ error: String(error.message || error) });
    }
  }

  function watch(threadId, onItems, onInfo, { backlog = 14 } = {}) {
    const db = setup();
    // Cursor setup precedes the initial read, so intervening writes are replayed.
    const s = { onItems, onInfo, seen: new Map(), since: "", info: "" };
    remember(s, db.prepare(`${ROW} where thread_id=? order by ordinal desc limit ?`).all(threadId, backlog).reverse(), true);
    const info = threadInfo(threadId); s.info = JSON.stringify(info); onInfo(info);
    const set = subscribers.get(threadId) || new Set(); set.add(s); subscribers.set(threadId, set);
    if (!timer) timer = interval(tick, 350);
    return () => { set.delete(s); if (!set.size) subscribers.delete(threadId); if (!subscribers.size && timer) { cancel(timer); timer = null; } };
  }

  function latestActivity(ids = []) {
    poll();
    if (!activities) activities = new Map();
    const latest = database.prepare("select max(updated_at) as at from orchestration_v2_projection_turn_items where thread_id=?");
    for (const id of ids) if (!activities.has(id)) activities.set(id, latest.get(id).at || "");
    return activities;
  }

  return { watch, latestActivity, poll };
}

module.exports = { createItemWatcher };
