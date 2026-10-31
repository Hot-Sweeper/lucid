// Local token usage, API-price cost and plan limits for Claude Code, Codex and Pi.
// Reads the harnesses' own session logs (read-only). Incremental: each file is
// remembered by path, size and mtime, and only appended bytes are read again.
// Files not modified in the last 8 days are ignored. Big files are entered with a
// binary search on timestamps so only the last days are read.

const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const os = require("node:os");

const HOME = os.homedir();
const T3_HOME = process.env.T3CODE_HOME || path.join(HOME, ".t3");
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects") : path.join(HOME, ".claude", "projects");
const CODEX_DIR = path.join(process.env.CODEX_HOME || path.join(HOME, ".codex"), "sessions");
const PI_DIR = path.join(process.env.PI_CODING_AGENT_DIR || path.join(HOME, ".pi", "agent"), "sessions");
const DB_PATH = path.join(T3_HOME, "userdata", "statev2.sqlite");
const RATES_PATH = path.join(T3_HOME, "userdata", "usage-model-rates.json");

const DAY = 86400000;
const FILE_AGE = 8 * DAY;          // files modified longer ago are skipped
const KEEP = 7 * DAY + 2 * 3600000; // records older than this are dropped
const SEEK_MIN = 16 * 1024 * 1024; // files bigger than this are entered by timestamp search
const CHUNK = 8 * 1024 * 1024;

const SOURCES = [
  { harness: "claude", dir: CLAUDE_DIR, patterns: ['"usage":{', '"rateLimitType"'] },
  { harness: "codex", dir: CODEX_DIR, patterns: ['"type":"token_count"', '"type":"turn_context"', '"type":"session_meta"'] },
  { harness: "pi", dir: PI_DIR, patterns: ['"usage":{', '"type":"session"'] },
];

// ---------------------------------------------------------------- state

const files = new Map(); // path -> { harness, size, mtimeMs, offset, records: [], ctx }
let rates = { mtimeMs: -1, doc: {} };
let inflight = null;

// ---------------------------------------------------------------- helpers

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const NL = 0x0a;

async function readAt(fh, pos, len) {
  const buf = Buffer.allocUnsafe(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return bytesRead === len ? buf : buf.subarray(0, bytesRead);
}

// Full line starting at `start` (up to maxLen bytes), or null at EOF.
async function readLine(fh, start, size, maxLen = 32 * 1024 * 1024) {
  let len = 64 * 1024;
  while (start < size) {
    const buf = await readAt(fh, start, Math.min(len, size - start));
    const nl = buf.indexOf(NL);
    if (nl >= 0) return { text: buf.toString("utf8", 0, nl), end: start + nl + 1 };
    if (start + buf.length >= size) return { text: buf.toString("utf8"), end: size, partial: true };
    if (len >= maxLen) return null;
    len *= 4;
  }
  return null;
}

const TS_RE = /"timestamp":"(\d{4}-\d\d-\d\dT[^"]+)"/;

// Timestamp of the first line that starts after `pos` (or at 0) and has one. Returns { ts, lineStart } or null.
async function timeAfter(fh, pos, size) {
  let start = pos;
  if (pos > 0) {
    let p = pos;
    for (;;) {
      if (p >= size) return null;
      const buf = await readAt(fh, p, Math.min(1024 * 1024, size - p));
      const nl = buf.indexOf(NL);
      if (nl >= 0) { start = p + nl + 1; break; }
      p += buf.length;
    }
  }
  for (let i = 0; i < 40 && start < size; i++) {
    const head = await readAt(fh, start, Math.min(64 * 1024, size - start));
    const nl = head.indexOf(NL);
    let m = TS_RE.exec(head.toString("utf8", 0, nl >= 0 ? nl : head.length));
    let next = nl >= 0 ? start + nl + 1 : -1;
    if (!m && nl < 0) {
      // long line: Claude puts the timestamp after the message body
      const line = await readLine(fh, start, size);
      if (!line) return null;
      m = TS_RE.exec(line.text.length > 400000 ? line.text.slice(-400000) : line.text);
      next = line.end;
    }
    if (m) {
      const ts = Date.parse(m[1]);
      if (Number.isFinite(ts)) return { ts, lineStart: start };
    }
    if (next < 0) return null;
    start = next;
  }
  return null;
}

// A line boundary at or before the first line with timestamp >= cutoff (log lines are appended in time order).
async function seekTime(fh, size, cutoff) {
  const first = await timeAfter(fh, 0, size);
  if (!first || first.ts >= cutoff) return 0;
  let lo = 0, hi = size;
  while (hi - lo > 2 * 1024 * 1024) {
    const mid = Math.floor((lo + hi) / 2);
    const t = await timeAfter(fh, mid, size);
    if (!t || t.ts >= cutoff || t.lineStart >= hi) hi = mid; else lo = t.lineStart;
  }
  return lo;
}

async function lineStartBefore(fh, abs) {
  let end = abs;
  while (end > 0) {
    const start = Math.max(0, end - 1024 * 1024);
    const buf = await readAt(fh, start, end - start);
    const i = buf.lastIndexOf(NL);
    if (i >= 0) return start + i + 1;
    end = start;
  }
  return 0;
}

// Last complete line before `pos` that contains `needle`, parsed. Searches back at most `maxBack` bytes.
async function findPrev(fh, pos, needle, maxBack = 256 * 1024 * 1024) {
  const nb = Buffer.from(needle);
  const stop = Math.max(0, pos - maxBack);
  let end = pos;
  while (end > stop) {
    const start = Math.max(stop, end - CHUNK);
    const buf = await readAt(fh, start, end - start);
    for (let i = buf.lastIndexOf(nb); i >= 0; i = i > 0 ? buf.lastIndexOf(nb, i - 1) : -1) {
      const ls = await lineStartBefore(fh, start + i);
      const line = await readLine(fh, ls, pos);
      if (line && !line.partial) { try { return JSON.parse(line.text); } catch { /* keep looking */ } }
    }
    if (start === stop) break;
    end = start + nb.length - 1; // overlap so a needle split across chunks is still found
  }
  return null;
}

// Calls onLine(text) for every complete line in [from, size) that contains one of the patterns,
// in file order. Returns the offset just after the last complete line.
async function scanLines(fh, from, size, patterns, onLine) {
  const pats = patterns.map((p) => Buffer.from(p));
  let pos = from;
  let carry = null;
  while (pos < size) {
    let buf = await readAt(fh, pos, Math.min(CHUNK, size - pos));
    if (!buf.length) break;
    const base = pos - (carry ? carry.length : 0);
    pos += buf.length;
    if (carry) buf = Buffer.concat([carry, buf]);
    const last = buf.lastIndexOf(NL);
    if (last < 0) { carry = buf; continue; }
    const hits = [];
    for (const p of pats) {
      for (let i = buf.indexOf(p); i >= 0 && i < last; i = buf.indexOf(p, i + p.length)) hits.push(i);
    }
    if (hits.length) {
      hits.sort((a, b) => a - b);
      let prevStart = -1;
      for (const h of hits) {
        const s = buf.lastIndexOf(NL, h) + 1;
        if (s === prevStart) continue;
        prevStart = s;
        const e = buf.indexOf(NL, h);
        onLine(buf.toString("utf8", s, e), base + s);
      }
    }
    carry = last + 1 < buf.length ? buf.subarray(last + 1) : null;
    if (carry) carry = Buffer.from(carry); // detach from the big chunk
  }
  return pos - (carry ? carry.length : 0);
}

async function walk(dir, out) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  await Promise.all(entries.map(async (e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p, out);
    if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }));
}

// ---------------------------------------------------------------- prices

function loadRates(errors) {
  try {
    const st = fs.statSync(RATES_PATH);
    if (st.mtimeMs !== rates.mtimeMs) {
      const json = JSON.parse(fs.readFileSync(RATES_PATH, "utf8"));
      rates = { mtimeMs: st.mtimeMs, doc: json.document || json || {} };
      priceCache.clear();
    }
  } catch (err) {
    if (rates.mtimeMs === -1) errors.push(`No price list found at ${RATES_PATH}, costs are 0.`);
    rates.mtimeMs = -2;
  }
}

const priceCache = new Map();
function priceFor(model) {
  if (priceCache.has(model)) return priceCache.get(model);
  const d = rates.doc;
  const m = String(model || "");
  const bare = m.includes("/") ? m.slice(m.lastIndexOf("/") + 1) : m;
  const candidates = [m, bare, bare.replace(/-\d{8}$/, ""), bare.replace(/@.*$/, ""), `openai/${bare}`, `anthropic/${bare}`];
  let r = null;
  for (const c of candidates) if (d[c] && typeof d[c].input_cost_per_token === "number") { r = d[c]; break; }
  priceCache.set(model, r);
  return r;
}

// Price for one rate kind, honouring "_above_Nk_tokens" tiers (by prompt size) and a service tier suffix.
function rate(r, key, prompt, tier) {
  let best = null, bestN = -1;
  const re = new RegExp(`^${key}_above_(\\d+)k_tokens${tier ? `_${tier}` : ""}$`);
  for (const k in r) {
    const m = re.exec(k);
    if (m && prompt > +m[1] * 1000 && +m[1] > bestN && typeof r[k] === "number") { best = r[k]; bestN = +m[1]; }
  }
  if (best !== null) return best;
  const t = tier ? r[`${key}_${tier}`] : undefined;
  if (typeof t === "number") return t;
  return typeof r[key] === "number" ? r[key] : null;
}

const TIER_ALIASES = { fast: "ultrafast", priority: "priority", ultrafast: "ultrafast", flex: "flex" };

// rec: { input, output, cacheRead, cacheWrite, cacheWrite1h, prompt, tier }
function costOf(rec, r) {
  if (!r) return 0;
  const tier = rec.tier && TIER_ALIASES[rec.tier] ? TIER_ALIASES[rec.tier] : null;
  const p = rec.prompt;
  const inp = rate(r, "input_cost_per_token", p, tier) || 0;
  const out = rate(r, "output_cost_per_token", p, tier) || 0;
  const cr = rate(r, "cache_read_input_token_cost", p, tier) ?? inp;
  const cw = rate(r, "cache_creation_input_token_cost", p, tier) ?? inp;
  const cw1h = rate(r, "cache_creation_input_token_cost_above_1hr", p, tier) ?? cw;
  const w1h = rec.cacheWrite1h || 0;
  return rec.input * inp + rec.output * out + rec.cacheRead * cr + (rec.cacheWrite - w1h) * cw + w1h * cw1h;
}

// ---------------------------------------------------------------- project attribution

// Native session IDs are the only exact cross-source link. A shared provider session
// can bind several projects, so ambiguous IDs never resolve to an arbitrary project.
let projectIndex = { signature: null, projects: new Map(), sessions: new Map(), roots: [], error: null };
const harnessOf = (p) => p === "claudeAgent" || p === "claude-code" ? "claude" : p;
const normalizedPath = (p) => {
  if (typeof p !== "string" || !p.trim()) return null;
  const windows = /^[a-z]:[\\/]/i.test(p) || p.startsWith("\\\\");
  const value = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return windows ? value.toLowerCase() : value;
};

function loadProjects(errors) {
  let db;
  try {
    const signature = [DB_PATH, `${DB_PATH}-wal`].map((p) => {
      try { const s = fs.statSync(p); return `${s.size}:${s.mtimeMs}`; } catch { return "missing"; }
    }).join("|");
    if (signature === projectIndex.signature) {
      if (projectIndex.error) errors.push(projectIndex.error);
      return;
    }
    const { DatabaseSync } = require("node:sqlite");
    db = new DatabaseSync(DB_PATH, { readOnly: true });
    const index = { signature, projects: new Map(), sessions: new Map(), roots: [], error: null };
    const tables = new Set(db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => r.name));
    const rows = (table, sql) => tables.has(table) ? db.prepare(sql).all() : [];
    for (const p of rows("projection_projects", "select project_id, title, workspace_root from projection_projects")) {
      index.projects.set(p.project_id, { id: p.project_id, name: p.title });
      if (normalizedPath(p.workspace_root)) index.roots.push({ path: normalizedPath(p.workspace_root), id: p.project_id });
    }
    const threads = new Map();
    for (const table of ["projection_threads", "orchestration_v2_projection_threads"]) {
      for (const t of rows(table, `select thread_id, project_id${table === "projection_threads" ? ", worktree_path" : ""} from ${table}`)) {
        threads.set(t.thread_id, t.project_id);
        if (index.projects.has(t.project_id) && normalizedPath(t.worktree_path)) index.roots.push({ path: normalizedPath(t.worktree_path), id: t.project_id });
      }
    }
    const bind = (harness, nativeId, thread) => {
      const id = threads.get(thread);
      if (!nativeId || !id || !index.projects.has(id)) return;
      const key = `${harnessOf(harness)}:${nativeId}`;
      const ids = index.sessions.get(key) || new Set(); ids.add(id); index.sessions.set(key, ids);
    };
    for (const t of rows("orchestration_v2_projection_provider_threads", `select provider, thread_id,
      json_extract(payload_json, '$.nativeThreadRef.nativeId') as native_id,
      json_extract(payload_json, '$.nativeThreadRef.strength') as strength
      from orchestration_v2_projection_provider_threads`)) {
      if (t.strength === "strong") bind(t.provider, t.native_id, t.thread_id);
    }
    for (const t of rows("projection_thread_sessions", "select provider_name, provider_session_id, provider_thread_id, thread_id from projection_thread_sessions")) {
      bind(t.provider_name, t.provider_session_id, t.thread_id);
      bind(t.provider_name, t.provider_thread_id, t.thread_id);
    }
    index.roots.sort((a, b) => b.path.length - a.path.length);
    projectIndex = index;
  } catch {
    // Drop a failed index rather than keep attributing to a possibly changed project.
    projectIndex = { signature: null, projects: new Map(), sessions: new Map(), roots: [], error: "Project mapping unavailable; usage is grouped as Unassigned." };
    errors.push(projectIndex.error);
  } finally { if (db) db.close(); }
}

function projectFor(r) {
  const exact = r.sessionId && projectIndex.sessions.get(`${r.harness}:${r.sessionId}`);
  if (exact) {
    if (exact.size === 1) return { ...projectIndex.projects.get([...exact][0]), source: "session" };
    return { id: "unassigned", name: "Unassigned", source: "unassigned" };
  }
  const cwd = normalizedPath(r.cwd);
  if (cwd) {
    const matches = projectIndex.roots.filter((root) => cwd === root.path || cwd.startsWith(`${root.path}/`));
    const ids = new Set(matches.filter((root) => root.path.length === matches[0]?.path.length).map((root) => root.id));
    if (ids.size === 1) return { ...projectIndex.projects.get([...ids][0]), source: "cwd" };
  }
  return { id: "unassigned", name: "Unassigned", source: "unassigned" };
}

function logContext(o, ctx, harness) {
  const meta = harness === "codex" ? o.payload || {} : o;
  if (typeof meta.cwd === "string") ctx.cwd = meta.cwd;
  const id = harness === "claude" ? meta.sessionId : (o.type === "session_meta" || o.type === "session" ? meta.id : null);
  if (typeof id === "string") ctx.sessionId = id;
}

// ---------------------------------------------------------------- parsers

function claudeLine(text, st) {
  if (!text.includes('"type":"assistant"')) return;
  let o;
  try { o = JSON.parse(text); } catch { return; }
  if (o.type !== "assistant" || !o.message) return;
  const ts = Date.parse(o.timestamp);
  if (!Number.isFinite(ts)) return;
  logContext(o, st.ctx, "claude");
  const msg = o.message;
  // Limit info only appears when a request was rejected by a plan limit.
  const rl = o.apiErrorParams?.rate_limit_info || o.quotaLimits;
  if (rl && (rl.rateLimitType || rl.resetsAt)) {
    st.limits.push({ ts, type: rl.rateLimitType || null, status: rl.status || null, resetsAt: num(rl.resetsAt) ? rl.resetsAt * 1000 : null, utilization: rl.utilization });
  }
  const u = msg.usage;
  if (!u || !msg.model || msg.model === "<synthetic>") return;
  const input = num(u.input_tokens), output = num(u.output_tokens);
  const cacheRead = num(u.cache_read_input_tokens), cacheWrite = num(u.cache_creation_input_tokens);
  if (!input && !output && !cacheRead && !cacheWrite) return;
  st.records.push({
    ts, harness: "claude", model: msg.model, cwd: o.cwd || st.ctx.cwd, sessionId: o.sessionId || st.ctx.sessionId,
    key: msg.id ? `${msg.id}:${o.requestId || ""}` : null,
    input, output, cacheRead, cacheWrite,
    cacheWrite1h: num(u.cache_creation?.ephemeral_1h_input_tokens),
    prompt: input + cacheRead + cacheWrite,
    tier: u.speed && u.speed !== "standard" ? u.speed : null,
  });
}

function codexContext(o, ctx) {
  const p = o.payload || {};
  logContext(o, ctx, "codex");
  const model = p.model || p.collaboration_mode?.settings?.model;
  if (model) ctx.model = model;
  if (p.service_tier !== undefined) ctx.tier = p.service_tier && p.service_tier !== "default" ? p.service_tier : null;
}

function codexLine(text, st) {
  let o;
  try { o = JSON.parse(text); } catch { return; }
  const ctx = st.ctx;
  if (o.type === "turn_context" || o.type === "session_meta") return codexContext(o, ctx);
  const p = o.payload;
  if (o.type !== "event_msg" || !p || p.type !== "token_count") return;
  const ts = Date.parse(o.timestamp);
  if (!Number.isFinite(ts)) return;
  if (p.rate_limits) st.limits.push({ ts, rl: p.rate_limits });
  const info = p.info;
  const total = info?.total_token_usage?.total_tokens;
  const last = info?.last_token_usage;
  if (!last || typeof total !== "number") return;
  // Codex repeats a token_count without new usage (for example after a limits refresh).
  if (total === ctx.prevTotal) return;
  ctx.prevTotal = total;
  const inTotal = num(last.input_tokens);
  const cacheRead = num(last.cached_input_tokens);
  const cacheWrite = num(last.cache_write_input_tokens);
  const output = num(last.output_tokens); // includes reasoning tokens
  st.records.push({
    ts, harness: "codex", model: ctx.model || "unknown", cwd: ctx.cwd, sessionId: ctx.sessionId,
    key: `codex:${ctx.sessionId || st.path}:${o.timestamp}:${total}`,
    input: Math.max(0, inTotal - cacheRead - cacheWrite), output, cacheRead, cacheWrite, cacheWrite1h: 0,
    prompt: inTotal,
    tier: ctx.tier || null,
  });
}

function piLine(text, st) {
  let o;
  try { o = JSON.parse(text); } catch { return; }
  logContext(o, st.ctx, "pi");
  const m = o.message;
  if (o.type !== "message" || !m || m.role !== "assistant" || !m.usage) return;
  const ts = Date.parse(o.timestamp) || num(m.timestamp);
  if (!ts) return;
  const u = m.usage;
  const input = num(u.input), output = num(u.output), cacheRead = num(u.cacheRead), cacheWrite = num(u.cacheWrite);
  if (!input && !output && !cacheRead && !cacheWrite) return;
  st.records.push({
    ts, harness: "pi", model: m.model || "unknown", key: null, cwd: st.ctx.cwd, sessionId: st.ctx.sessionId,
    input, output, cacheRead, cacheWrite, cacheWrite1h: 0, prompt: input + cacheRead + cacheWrite, tier: null,
  });
}

const PARSERS = { claude: claudeLine, codex: codexLine, pi: piLine };

// ---------------------------------------------------------------- scanning

async function scanFile(p, harness, stat, now, errors) {
  let st = files.get(p);
  if (st && stat.size === st.size && stat.mtimeMs === st.mtimeMs) return;
  if (st && stat.size === st.offset && stat.size >= st.size) { st.size = stat.size; st.mtimeMs = stat.mtimeMs; return; }
  const fresh = !st || stat.size < st.offset;
  if (fresh) {
    st = { harness, path: p, size: 0, mtimeMs: 0, offset: 0, records: [], limits: [], ctx: { model: null, tier: null, prevTotal: null } };
    files.set(p, st);
  }
  const src = SOURCES.find((s) => s.harness === harness);
  let fh;
  try {
    fh = await fsp.open(p, "r");
    let from = st.offset;
    // The session header lies before a timestamp seek. Read it once, not the old body.
    if (fresh && (harness === "codex" || harness === "pi")) {
      const header = await readLine(fh, 0, stat.size, 256 * 1024);
      if (header) { try { const o = JSON.parse(header.text); logContext(o, st.ctx, harness); if (harness === "codex") codexContext(o, st.ctx); } catch { /* malformed header */ } }
    }
    if (fresh && stat.size > SEEK_MIN) {
      from = await seekTime(fh, stat.size, now - KEEP);
      if (from > 0 && harness === "codex") {
        // Restore the model and the running total that were in effect at the seek point.
        const tc = await findPrev(fh, from, '"type":"turn_context"');
        if (tc) codexContext(tc, st.ctx);
        else {
          const meta = await readLine(fh, 0, stat.size);
          try { const m = JSON.parse(meta.text).payload; if (m?.model) st.ctx.model = m.model; } catch { /* ignore */ }
        }
        const tk = await findPrev(fh, from, '"type":"token_count"', 64 * 1024 * 1024);
        const t = tk?.payload?.info?.total_token_usage?.total_tokens;
        if (typeof t === "number") st.ctx.prevTotal = t;
      }
    }
    const parse = PARSERS[harness];
    st.offset = await scanLines(fh, from, stat.size, src.patterns, (text) => parse(text, st));
    st.size = stat.size;
    st.mtimeMs = stat.mtimeMs;
  } catch (err) {
    errors.push(`Could not read ${p}: ${err.message || err}`);
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

async function scanAll(now, errors) {
  const jobs = [];
  const seen = new Set();
  for (const src of SOURCES) {
    const list = [];
    await walk(src.dir, list);
    for (const p of list) jobs.push({ p, harness: src.harness });
  }
  // stat everything, keep recent files
  const recent = [];
  await Promise.all(jobs.map(async (j) => {
    try {
      const stat = await fsp.stat(j.p);
      if (now - stat.mtimeMs <= FILE_AGE) { recent.push({ ...j, stat }); seen.add(j.p); }
    } catch { /* file vanished */ }
  }));
  for (const p of files.keys()) if (!seen.has(p)) files.delete(p);
  // small files first, a few at a time
  recent.sort((a, b) => a.stat.size - b.stat.size);
  let i = 0;
  const worker = async () => { while (i < recent.length) { const j = recent[i++]; await scanFile(j.p, j.harness, j.stat, now, errors); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  // drop old records
  const cut = now - KEEP;
  for (const st of files.values()) {
    if (st.records.length && st.records[0].ts < cut) st.records = st.records.filter((r) => r.ts >= cut);
    // Keep the latest observation for each pool, including model side pools.
    const latest = new Map();
    for (const l of st.limits) latest.set(harnessLimitKey(st.harness, l), l);
    st.limits = [...latest.values()];
  }
}

// ---------------------------------------------------------------- aggregation

function emptyTotals() {
  return { tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, byHarness: {}, byModel: {}, byProject: {} };
}

function addTo(t, r, cost, project) {
  const tokens = r.input + r.output + r.cacheRead + r.cacheWrite;
  t.tokens += tokens; t.input += r.input; t.output += r.output; t.cacheRead += r.cacheRead; t.cacheWrite += r.cacheWrite; t.costUsd += cost;
  const h = (t.byHarness[r.harness] ||= { tokens: 0, costUsd: 0 });
  h.tokens += tokens; h.costUsd += cost;
  let key = r.model;
  if (t.byModel[key] && t.byModel[key].harness !== r.harness) key = `${r.model} (${r.harness})`;
  const m = (t.byModel[key] ||= { tokens: 0, costUsd: 0, harness: r.harness, priced: true });
  m.tokens += tokens; m.costUsd += cost;
  if (!priceFor(r.model)) m.priced = false;
  const p = (t.byProject[project.id] ||= { name: project.name, tokens: 0, costUsd: 0, priced: true, sources: { session: 0, cwd: 0, unassigned: 0 } });
  p.tokens += tokens; p.costUsd += cost; p.sources[project.source] += tokens;
  if (!priceFor(r.model)) p.priced = false;
}

function roundTotals(t) {
  const r = (v) => Math.round(v * 1e6) / 1e6;
  t.costUsd = r(t.costUsd);
  for (const v of Object.values(t.byHarness)) v.costUsd = r(v.costUsd);
  const sorted = Object.entries(t.byModel).sort((a, b) => b[1].tokens - a[1].tokens);
  t.byModel = Object.fromEntries(sorted.map(([k, v]) => [k, { ...v, costUsd: r(v.costUsd) }]));
  // Round using fractional remainders, keeping every row nonnegative and the
  // project micro-dollar sum exactly equal to the rounded headline total.
  const projects = Object.entries(t.byProject).sort((a, b) => b[1].costUsd - a[1].costUsd || b[1].tokens - a[1].tokens);
  const shares = projects.map(([, p]) => ({ p, units: Math.floor(p.costUsd * 1e6), fraction: p.costUsd * 1e6 % 1 }));
  let residue = Math.round(t.costUsd * 1e6) - shares.reduce((sum, p) => sum + p.units, 0);
  for (const share of [...shares].sort((a, b) => b.fraction - a.fraction)) if (residue > 0) { share.units++; residue--; }
  shares.forEach(({ p, units }) => { p.costUsd = units / 1e6; });
  t.byProject = Object.fromEntries(projects);
  return t;
}

function aggregate(now, errors) {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const cuts = { last5h: now - 5 * 3600000, today: midnight.getTime(), week: now - 7 * DAY };
  const windows = { last5h: emptyTotals(), today: emptyTotals(), week: emptyTotals() };
  // Claude repeats a message once per content block (and copies it into resumed or subagent
  // files); the usage grows while it streams, so keep the largest copy of each message.
  const best = new Map();
  const attribution = new Map();
  const loose = [];
  for (const st of files.values()) {
    for (const r of st.records) {
      if (r.ts < cuts.week && r.ts < cuts.today) continue;
      if (!r.key) { loose.push(r); continue; }
      const project = projectFor(r);
      const rank = project.source === "session" ? 2 : project.source === "cwd" ? 1 : 0;
      const candidate = attribution.get(r.key);
      if (!candidate || rank > candidate.rank) attribution.set(r.key, { rank, project });
      else if (rank === candidate.rank && candidate.project.id !== project.id) candidate.project = { id: "unassigned", name: "Unassigned", source: "unassigned" };
      const prev = best.get(r.key);
      if (!prev || r.output > prev.output || (r.output === prev.output && r.input + r.cacheRead + r.cacheWrite > prev.input + prev.cacheRead + prev.cacheWrite)) best.set(r.key, r);
    }
  }
  const unknown = new Set();
  const all = loose.concat([...best.values()]);
  for (const r of all) {
    const pr = priceFor(r.model);
    if (!pr) unknown.add(r.model);
    if (r._c === undefined || r._v !== rates.mtimeMs) { r._c = costOf(r, pr); r._v = rates.mtimeMs; }
    const project = r.key ? attribution.get(r.key).project : projectFor(r);
    for (const k of Object.keys(cuts)) if (r.ts >= cuts[k] && r.ts <= now + 60000) addTo(windows[k], r, r._c, project);
  }
  for (const m of unknown) errors.push(`No API price for model "${m}": its tokens are counted, its cost is 0.`);
  for (const k of Object.keys(windows)) roundTotals(windows[k]);
  return windows;
}

function iso(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function harnessLimitKey(harness, l) {
  return harness === "codex" ? (l.rl.limit_id || "codex") : (l.type || "unknown");
}

function codexLimits(now) {
  const pools = new Map();
  for (const st of files.values()) {
    if (st.harness !== "codex") continue;
    for (const l of st.limits) {
      const id = harnessLimitKey("codex", l);
      if (!pools.has(id) || l.ts >= pools.get(id).ts) pools.set(id, l);
    }
  }
  if (!pools.size) return null;
  const windows = [];
  const convert = (w, id, slot, observed) => {
    if (!w) return null;
    const resetsAt = num(w.resets_at) ? w.resets_at * 1000 : null;
    const out = { id: `${id}:${slot}`, pool: id, label: observed.rl.limit_name || (id === "codex" ? null : id),
      usedPercent: typeof w.used_percent === "number" && Number.isFinite(w.used_percent) ? w.used_percent : null,
      windowMinutes: num(w.window_minutes) || null, resetsAt: iso(resetsAt), observedAt: iso(observed.ts),
      stale: !!(resetsAt && resetsAt <= now) };
    windows.push(out);
    return out;
  };
  let primary = null, secondary = null;
  for (const [id, l] of pools) {
    const p = convert(l.rl.primary, id, "primary", l);
    const s = convert(l.rl.secondary, id, "secondary", l);
    if (id === "codex") { primary = p; secondary = s; }
    // Preserve a reported pool even when its utilization is unavailable.
    if (!p && !s) windows.push({ id: `${id}:unknown`, pool: id, label: l.rl.limit_name || (id === "codex" ? null : id), usedPercent: null, windowMinutes: null, resetsAt: null, observedAt: iso(l.ts) });
  }
  const main = pools.get("codex");
  return { primary, secondary, windows, observedAt: iso(Math.max(...[...pools.values()].map((l) => l.ts))), ...(main?.rl.plan_type ? { plan: main.rl.plan_type } : {}) };
}

function claudeLimits(now) {
  // Rejections prove a full window only until its reported reset. No reading is 0%.
  const latest = new Map();
  for (const st of files.values()) {
    if (st.harness !== "claude") continue;
    for (const l of st.limits) {
      const id = harnessLimitKey("claude", l);
      if (!latest.has(id) || l.ts >= latest.get(id).ts) latest.set(id, l);
    }
  }
  if (!latest.size) return null;
  const windows = [...latest].map(([id, l]) => {
    const used = l.status === "rejected" ? (l.resetsAt ? 100 : null) : typeof l.utilization === "number" && Number.isFinite(l.utilization) ? (l.utilization <= 1 ? l.utilization * 100 : l.utilization) : null;
    return { id, pool: id, label: id === "five_hour" || id === "seven_day" ? null : id.replace(/_/g, " "),
      usedPercent: used, windowMinutes: id === "five_hour" ? 300 : id.startsWith("seven_day") ? 10080 : null,
      resetsAt: iso(l.resetsAt), observedAt: iso(l.ts), stale: !!(l.resetsAt && l.resetsAt <= now) };
  });
  const weekly = windows.filter((w) => w.windowMinutes === 10080).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  return { primary: windows.find((w) => w.id === "five_hour") || null, secondary: weekly[0] || null,
    windows, observedAt: iso(Math.max(...[...latest.values()].map((l) => l.ts))) };
}

// ---------------------------------------------------------------- API
let providerLimitsReader = null;
function setProviderLimitsReader(reader) { providerLimitsReader = reader; }

async function compute() {
  const errors = [];
  const reportedLimits = providerLimitsReader ? Promise.resolve().then(providerLimitsReader).catch(() => ({ providers: [], error: "T3 limits could not be refreshed." })) : null;
  const now = Date.now();
  let windows = { last5h: emptyTotals(), today: emptyTotals(), week: emptyTotals() };
  const limits = { codex: null, claude: null };
  try { loadRates(errors); } catch (err) { errors.push(String(err.message || err)); }
  try { loadProjects(errors); } catch { errors.push("Project mapping unavailable."); }
  try { await scanAll(now, errors); } catch (err) { errors.push(`Scan failed: ${err.message || err}`); }
  try { windows = aggregate(now, errors); } catch (err) { errors.push(`Totals failed: ${err.message || err}`); }
  try { limits.codex = codexLimits(now); } catch (err) { errors.push(`Codex limits failed: ${err.message || err}`); }
  try { limits.claude = claudeLimits(now); } catch (err) { errors.push(`Claude limits failed: ${err.message || err}`); }
  const usage = { updatedAt: new Date(now).toISOString(), windows, limits, errors };
  return reportedLimits ? require("./provider-limits.cjs").mergeProviderLimits(usage, await reportedLimits) : usage;
}

async function getUsage() {
  if (inflight) return inflight;
  inflight = compute()
    .catch((err) => ({ updatedAt: new Date().toISOString(), windows: { last5h: emptyTotals(), today: emptyTotals(), week: emptyTotals() }, limits: { codex: null, claude: null }, errors: [String(err?.message || err)] }))
    .finally(() => { inflight = null; });
  return inflight;
}

module.exports = { getUsage, setProviderLimitsReader };
