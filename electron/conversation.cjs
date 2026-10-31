// Bounded history reads with stable keyset pagination, including equal timestamps.
const { historyEvents } = require("./chat-history.cjs");
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
function readConversation(db, threadId, options = {}, attachmentPath = () => null) {
  const safeJson = parse;
  const limit = Math.max(1, Math.min(200, Math.floor(Number(options.limit) || 80)));
  const before = options.before && typeof options.before.at === "string" && Number.isSafeInteger(options.before.rowid)
    ? options.before : null;
  const rows = db.prepare(`select rowid, message_id as id, role, created_at as at, streaming, payload_json as p
    from orchestration_v2_projection_messages where thread_id = ?
    ${before ? "and (created_at < ? or (created_at = ? and rowid < ?))" : ""}
    order by created_at desc, rowid desc limit ?`)
    .all(threadId, ...(before ? [before.at, before.at, before.rowid] : []), limit + 1);
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();
  const boundary = rows.at(-1);
  rows.reverse();
  // Queued messages are often older than the newest messages (they wait while the robot
  // replies to others), so they are loaded on their own: the whole queue, however old.
  const queuedRuns = db.prepare("select run_id as runId, status, ordinal, payload_json as p from orchestration_v2_projection_runs where thread_id = ? and status = 'queued'").all(threadId);
  const have = new Set(rows.map((r) => r.id));
  const missing = queuedRuns.map((q) => safeJson(q.p)?.userMessageId).filter((id) => id && !have.has(id));
  if (!before && missing.length) {
    const extra = db
      .prepare(`select rowid, message_id as id, role, created_at as at, streaming, payload_json as p from orchestration_v2_projection_messages where thread_id = ? and message_id in (${missing.map(() => "?").join(",")})`)
      .all(threadId, ...missing);
    rows.unshift(...extra.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)));
  }
  const runs = new Map();
  const started = new Map();
  const queuePos = new Map();
  const queueRun = new Map();
  const queued = [];
  let liveRunId = null;
  const recent = db.prepare("select run_id as runId, status, ordinal, payload_json as p from orchestration_v2_projection_runs where thread_id = ? and status != 'queued' order by ordinal desc limit 60").all(threadId);
  // Only an explicit older-page request needs historical run metadata. Keep this
  // JSON lookup off the frequently refreshed latest-page path.
  if (before && rows.length) {
    const haveRuns = new Set(recent.map((r) => r.runId));
    const olderRuns = db.prepare(`select run_id as runId, status, ordinal, payload_json as p from orchestration_v2_projection_runs
      where thread_id = ? and status != 'queued' and json_extract(payload_json, '$.userMessageId') in (${rows.map(() => "?").join(",")})`)
      .all(threadId, ...rows.map((r) => r.id));
    recent.push(...olderRuns.filter((r) => !haveRuns.has(r.runId)));
  }
  for (const run of [...queuedRuns.sort((a, b) => b.ordinal - a.ordinal), ...recent].sort((a, b) => b.ordinal - a.ordinal)) {
    const rp = safeJson(run.p);
    if (rp?.userMessageId) runs.set(rp.userMessageId, run.status);
    if (rp?.userMessageId && rp.startedAt) started.set(rp.userMessageId, rp.startedAt);
    if (run.status === "queued" && rp?.userMessageId) queued.push({ id: rp.userMessageId, runId: run.runId, ordinal: run.ordinal, pos: rp.queuePosition ?? run.ordinal });
    // the turn a queued message can be steered into
    if (!liveRunId && ["running", "starting", "preparing"].includes(run.status)) liveRunId = run.runId;
  }
  // T3 delivers by queuePosition (set when you reorder), then by ordinal
  queued.sort((a, b) => a.pos - b.pos || a.ordinal - b.ordinal).forEach((q, i) => { queuePos.set(q.id, i + 1); queueRun.set(q.id, q.runId); });
  // A message that waited in the queue belongs where the robot picked it up, not where it was
  // typed, so it never lands behind replies that came while it waited. Ties keep the
  // database order, so messages with the same timestamp stay in the order they were written.
  const key = (r) => (r.role === "user" && started.get(r.id) > r.at ? started.get(r.id) : r.at);
  const ordered = rows.map((r, i) => ({ r, i, k: key(r) })).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i)).map((x) => x.r);
  const messages = ordered.map((r) => {
    const p = safeJson(r.p) || {};
    return {
      id: r.id, role: r.role, at: r.at, orderAt: key(r), sourceOrder: r.rowid, streaming: !!r.streaming, text: p.text || "", run: runs.get(r.id) || null, queue: queuePos.get(r.id) || null,
      // queued messages: their run, the live turn to steer into, and whether T3 lets you change them
      ...(queueRun.has(r.id) ? { queueRunId: queueRun.get(r.id), steerTarget: liveRunId, queueFixed: !!(p.delegatedCompletion || p.notification), queueGuest: !!p.context?.guest } : {}),
      attachments: (p.attachments || []).map((a) => ({ type: a.type, name: a.name, mime: a.mimeType, size: a.sizeBytes, path: attachmentPath(a) })),
    };
  });
  const since = hasMore ? boundary?.at : undefined;
  const events = historyEvents(db, threadId, since).filter((m) => !before || m.at <= before.at);
  const rank = (m) => m.role === "user" ? 0 : m.role === "event" ? 1 : 2;
  return { messages: [...messages, ...events].sort((a, b) => a.orderAt.localeCompare(b.orderAt) || rank(a) - rank(b)),
    cursor: boundary ? { at: boundary.at, rowid: boundary.rowid } : null, hasMore };
}

module.exports = { readConversation };
