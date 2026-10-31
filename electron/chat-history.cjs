// Chat history uses the same persisted run selections and turn items as T3 Code.
// Never infer a compaction or handoff from assistant prose.
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

function historyEvents(db, threadId, since) {
  const runs = db.prepare(`select run_id as id, ordinal, payload_json as p
    from orchestration_v2_projection_runs where thread_id = ? order by ordinal`).all(threadId);
  const selections = new Map();
  const switches = [];
  let previous = null;
  for (const r of runs) {
    const p = parse(r.p) || {};
    if (!p.startedAt) continue; // queued/cancelled requests never switched the running harness
    const selection = { provider: p.modelSelection?.instanceId || p.providerInstanceId || p.provider,
      model: p.modelSelection?.model || p.model };
    selections.set(r.id, { previous, current: selection });
    if (previous && selection.provider && selection.model &&
        (previous.provider !== selection.provider || previous.model !== selection.model)) {
      switches.push({ id: `selection:${r.id}`, runId: r.id, at: p.startedAt,
        kind: previous.provider !== selection.provider ? "harness" : "model", from: previous, to: selection });
    }
    if (selection.provider && selection.model) previous = selection;
  }
  const items = db.prepare(`select turn_item_id as id, run_id as runId, type, status,
    coalesce(json_extract(payload_json, '$.startedAt'), updated_at) as at,
    json_extract(payload_json, '$.fromProviderInstanceIds[0]') as fromProvider,
    json_extract(payload_json, '$.fromModelSelections[0].model') as fromModel,
    json_extract(payload_json, '$.toProviderInstanceId') as toProvider,
    json_extract(payload_json, '$.toModel') as toModel
    from orchestration_v2_projection_turn_items where thread_id = ?
    and type in ('compaction', 'handoff') and parent_item_id is null order by ordinal`).all(threadId);
  const handedOff = new Set(items.filter((i) => i.type === "handoff").map((i) => i.runId));
  const out = switches.filter((s) => !handedOff.has(s.runId));
  for (const i of items) {
    const s = selections.get(i.runId);
    out.push({ id: i.id, at: i.at, kind: i.type === "handoff" ? "handoff" : "compaction", status: i.status,
      ...(i.type === "handoff" ? {
        from: { provider: i.fromProvider || s?.previous?.provider, model: i.fromModel || s?.previous?.model },
        to: { provider: i.toProvider || s?.current?.provider, model: i.toModel || s?.current?.model },
      } : {}) });
  }
  return out.filter((e) => !since || e.at >= since).map((event) => ({
    id: event.id, role: "event", at: event.at, orderAt: event.at, event, streaming: false, text: "", attachments: [],
  }));
}

module.exports = { historyEvents };
