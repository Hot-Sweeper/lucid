// Bounded history reads with stable keyset pagination, including equal timestamps.
const { answerArtifacts } = require("./answer-artifacts.cjs");
const { historyEvents } = require("./chat-history.cjs");
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

// T3's work log: what each turn did (commands, edits, searches, tools), read with
// json_extract so large tool outputs never leave SQLite. Finished turns never change, so
// their summaries are cached; only the live turn is read again.
const WORK_TYPES = ["command_execution", "file_change", "web_search", "dynamic_tool", "subagent", "error"];
const workCache = new Map();
// Codex runs everything as /bin/bash -lc "..."; show the command itself, first line only.
function shellCommand(text) {
  let t = String(text).trim();
  const m = /^(?:\/usr)?(?:\/bin\/)?(?:bash|zsh|sh)\s+-l?c\s+(['"])/.exec(t);
  if (m) { t = t.slice(m[0].length); if (t.endsWith(m[1])) t = t.slice(0, -1); }
  return t.split("\n")[0].trim();
}
const LINES = 200;
function turnWork(db, threadId, runs) {
  const out = new Map(), need = [];
  for (const r of runs) {
    const hit = workCache.get(r.runId);
    if (hit && hit.status === r.status) out.set(r.runId, hit.work); else need.push(r);
  }
  if (!need.length) return out;
  const rows = db.prepare(`select run_id as runId, type, status,
      substr(case when type = 'command_execution' then json_extract(payload_json, '$.input') end, 1, 240) as input,
      json_extract(payload_json, '$.fileName') as file, json_extract(payload_json, '$.title') as title,
      json_extract(payload_json, '$.toolName') as tool, json_extract(payload_json, '$.patterns[0]') as pattern,
      json_extract(payload_json, '$.toolSource.name') as source,
      substr(json_extract(payload_json, '$.message'), 1, 200) as message,
      coalesce(json_extract(payload_json, '$.startedAt'), updated_at) as at
    from orchestration_v2_projection_turn_items where thread_id = ? and run_id in (${need.map(() => "?").join(",")})
      and type in (${WORK_TYPES.map(() => "?").join(",")}) order by ordinal asc`)
    .all(threadId, ...need.map((r) => r.runId), ...WORK_TYPES);
  const byRun = new Map();
  for (const row of rows) { if (!byRun.has(row.runId)) byRun.set(row.runId, []); byRun.get(row.runId).push(row); }
  for (const r of need) {
    const items = byRun.get(r.runId) || [];
    if (!items.length) { out.set(r.runId, null); continue; }
    const files = new Set(), count = { commands: 0, edits: 0, searches: 0, tools: 0, agents: 0, failed: 0 };
    const lines = items.map((it) => ({ ...line(it), a: it.at || undefined }));
    function line(it) {
      if (it.status === "failed" || it.type === "error") count.failed++;
      if (it.type === "command_execution") { count.commands++; return { k: "cmd", t: shellCommand(it.input || it.title || "command"), s: it.status }; }
      if (it.type === "file_change") { files.add(it.file || ""); return { k: "edit", t: it.file || it.title || "file", s: it.status }; }
      if (it.type === "web_search") { count.searches++; return { k: "search", t: it.pattern || it.title || "web search", s: it.status }; }
      if (it.type === "subagent") { count.agents++; return { k: "agent", t: it.title || "subagent", s: it.status }; }
      if (it.type === "error") return { k: "error", t: it.message || it.title || "error", s: "failed" };
      count.tools++; return { k: "tool", t: it.title || String(it.tool || "tool").split(".").pop(), s: it.status, ...(it.source ? { src: it.source } : {}) };
    }
    count.edits = files.size;
    const work = { status: r.status, startedAt: r.startedAt || null, completedAt: r.completedAt || null, ...count, total: lines.length, lines: lines.slice(-LINES) };
    work.sig = [r.status, work.total, count.failed, work.completedAt, lines.at(-1)?.s].join("|");
    out.set(r.runId, work);
    if (!["running", "starting", "preparing", "queued"].includes(r.status)) {
      workCache.set(r.runId, { status: r.status, work });
      if (workCache.size > 600) workCache.delete(workCache.keys().next().value);
    }
  }
  return out;
}
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
  const runMeta = new Map();
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
    if (rp?.userMessageId && run.status !== "queued" && !runMeta.has(rp.userMessageId)) runMeta.set(rp.userMessageId, { runId: run.runId, status: run.status, startedAt: rp.startedAt, completedAt: rp.completedAt });
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
  // Memory-learning batches are the app's housekeeping, not messages from the
  // human. Keep raw rows as pagination boundaries so hidden batches cannot
  // strand older conversation history.
  const messages = ordered.filter((r) => !(r.role === "user" && /^\s*New messages the user wrote to robots\. Learn lasting preferences from them and update memory\.md:/.test(safeJson(r.p)?.text || ""))).map((r) => {
    const p = safeJson(r.p) || {};
    return {
      id: r.id, role: r.role, at: r.at, orderAt: key(r), sourceOrder: r.rowid, streaming: !!r.streaming, text: p.text || "", run: runs.get(r.id) || null, queue: queuePos.get(r.id) || null,
      // queued messages: their run, the live turn to steer into, and whether T3 lets you change them
      ...(queueRun.has(r.id) ? { queueRunId: queueRun.get(r.id), steerTarget: liveRunId, queueFixed: !!(p.delegatedCompletion || p.notification), queueGuest: !!p.context?.guest } : {}),
      attachments: (p.attachments || []).map((a) => ({ type: a.type, name: a.name, mime: a.mimeType, size: a.sizeBytes, path: attachmentPath(a) })),
    };
  });
  // One work row per turn, right after the message that started it.
  const turns = !options.work ? [] : messages.filter((m) => m.role === "user" && runMeta.has(m.id)).map((m) => ({ m, ...runMeta.get(m.id) }));
  const work = turnWork(db, threadId, turns);
  // Placed like T3's: a live turn's log stays at the bottom of that turn; a finished turn's
  // log sits just above its final reply, with the earlier progress updates above it.
  const userAt = messages.filter((m) => m.role === "user").map((m) => m.orderAt).sort();
  const LIVE_RUN = ["running", "starting", "preparing"];
  for (const t of turns) {
    const w = work.get(t.runId);
    if (!w) continue;
    const next = userAt.find((at) => at > t.m.orderAt);
    const replies = messages.filter((m) => m.role === "assistant" && m.orderAt > t.m.orderAt && (!next || m.orderAt < next));
    const last = replies.at(-1);
    // "~" sorts after the same timestamp and before any later one
    const orderAt = !last ? t.m.orderAt : LIVE_RUN.includes(t.status) ? `${last.orderAt}~` : last.orderAt;
    messages.push({ id: `work:${t.runId}`, role: "work", at: t.startedAt || t.m.at, orderAt, sourceOrder: t.m.sourceOrder, streaming: false, text: "", attachments: [], work: w });
  }
  const since = hasMore ? boundary?.at : undefined;
  const events = historyEvents(db, threadId, since).filter((m) => !before || m.at <= before.at);
  messages.push(...answerArtifacts(db, threadId, { since, before: before?.at }));
  const rank = (m) => m.role === "user" ? 0 : m.role === "work" ? 1 : m.role === "event" ? 2 : 3;
  return { messages: [...messages, ...events].sort((a, b) => a.orderAt.localeCompare(b.orderAt) || rank(a) - rank(b)),
    cursor: boundary ? { at: boundary.at, rowid: boundary.rowid } : null, hasMore };
}

module.exports = { readConversation };
