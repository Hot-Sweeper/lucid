// Discover context items once, then read their current projections by primary key.
// This uses existing native indexes and never changes T3's schema or database.
const FIELDS = `turn_item_id as id, run_id as runId, ordinal, type, status,
  coalesce(json_extract(payload_json, '$.startedAt'), updated_at) as at,
  json_extract(payload_json, '$.fromProviderInstanceIds[0]') as fromProvider,
  json_extract(payload_json, '$.fromModelSelections[0].model') as fromModel,
  json_extract(payload_json, '$.toProviderInstanceId') as toProvider,
  json_extract(payload_json, '$.toModel') as toModel`;
const TABLE = 'orchestration_v2_projection_turn_items';
const CONTEXT = "type in ('compaction', 'handoff') and parent_item_id is null";

function createHistoryItemReader({ now = Date.now, maxThreads = 64, reconcileMs = 15000 } = {}) {
  const connections = new WeakMap();
  function stateFor(db) {
    const schema = db.prepare('pragma schema_version').get().schema_version;
    let state = connections.get(db);
    if (state?.schema === schema) return state;
    state = { schema, feed: null, threads: new Map() };
    const tables = new Set(db.prepare("select name from sqlite_master where type='table'").all().map(r => r.name));
    for (const table of ['orchestration_events', 'orchestration_v2_events']) {
      if (!tables.has(table)) continue;
      const columns = new Set(db.prepare(`pragma table_info(${table})`).all().map(r => r.name));
      if (!['aggregate_kind', 'stream_id', 'sequence', 'event_type', 'payload_json'].every(c => columns.has(c))) continue;
      const indexed = db.prepare(`pragma index_list(${table})`).all().some(index => {
        const cols = db.prepare(`pragma index_info("${index.name.replace(/"/g, '""')}")`).all().map(c => c.name);
        return !index.partial && (cols.slice(0, 3).join(',') === 'aggregate_kind,stream_id,sequence' || cols.slice(0, 2).join(',') === 'stream_id,sequence');
      });
      if (indexed) { state.feed = table; break; }
    }
    connections.set(db, state);
    return state;
  }
  return function readHistoryItems(db, threadId) {
    const state = stateFor(db), table = state.feed;
    const head = table ? Number(db.prepare(`select max(sequence) as n from ${table} where aggregate_kind='thread' and stream_id=?`).get(threadId).n || 0) : 0;
    const cached = state.threads.get(threadId);
    let discover = !cached || !head || head < cached.head || now() - cached.checkedAt >= reconcileMs;
    if (!discover && head !== cached.head) {
      // Read only the changed part of this thread's indexed event stream. Normal
      // reasoning/message updates cannot force another full turn-item scan.
      const events = db.prepare(`select event_type as eventType, json_extract(payload_json, '$.type') as type,
        json_extract(payload_json, '$.id') as id from ${table}
        where aggregate_kind='thread' and stream_id=? and sequence>? and sequence<=?
        and (event_type like 'turn-item.%' or event_type in ('run.created','run.updated',
          'thread.model-selection-updated','thread.provider-switched','context-handoff.updated'))
        order by sequence limit 513`).all(threadId, cached.head, head);
      const known = new Set(cached.ids);
      discover = events.length > 512 || events.some(e => !e.eventType.startsWith('turn-item.') ||
        e.type === 'compaction' || e.type === 'handoff' || known.has(e.id) || !e.type);
    }
    let items;
    if (discover) {
      items = db.prepare(`select ${FIELDS} from ${TABLE} where thread_id=? and ${CONTEXT} order by ordinal`).all(threadId);
    } else {
      // These are current payloads, not cached status/timestamp snapshots. Same-
      // ordinal updates, retyping and deletions are visible on the very next read.
      // A large IN list plus ORDER BY can make SQLite choose its thread/ordinal
      // index again. Unique single-ID probes guarantee bounded primary-key work.
      const item = db.prepare(`select ${FIELDS} from ${TABLE} where turn_item_id=? and thread_id=? and ${CONTEXT}`);
      items = cached.ids.map(id => item.get(id, threadId)).filter(Boolean).sort((a, b) => a.ordinal - b.ordinal);
    }
    state.threads.delete(threadId);
    if (head && items.length <= 4096) {
      state.threads.set(threadId, { ids: items.map(i => i.id), head, checkedAt: discover ? now() : cached.checkedAt });
      while (state.threads.size > maxThreads) state.threads.delete(state.threads.keys().next().value);
    }
    return items;
  };
}
module.exports = { createHistoryItemReader, readHistoryItems: createHistoryItemReader() };
