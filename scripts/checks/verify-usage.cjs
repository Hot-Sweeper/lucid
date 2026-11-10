// Deterministic usage fixtures only. Does not read the user's sessions or database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const NOW = Date.parse("2026-10-31T12:00:00Z");
const iso = (offset = 0) => new Date(NOW + offset).toISOString();
const hour = 3600000;
const source = fs.readFileSync(path.join(__dirname, "../../electron/usage.cjs"), "utf8");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lucid-usage-test-"));
  const userdata = path.join(root, ".t3", "userdata");
  fs.mkdirSync(userdata, { recursive: true });
  const db = new DatabaseSync(path.join(userdata, "statev2.sqlite"));
  db.exec(`create table projection_projects(project_id text, title text, workspace_root text);
    create table projection_threads(thread_id text, project_id text, worktree_path text);
    create table orchestration_v2_projection_threads(thread_id text, project_id text);
    create table orchestration_v2_projection_provider_threads(provider text, thread_id text, payload_json text);
    create table projection_thread_sessions(provider_name text, provider_session_id text, provider_thread_id text, thread_id text);`);
  const project = db.prepare("insert into projection_projects values(?,?,?)");
  project.run("alpha", "Alpha", "C:\\work\\alpha");
  project.run("beta", "Beta", "C:\\work\\beta");
  project.run("nested", "Nested", "C:\\work\\alpha\\nested");
  db.exec(`insert into projection_threads values('ta','alpha','C:\\worktrees\\alpha-branch'),('tb','beta',null);
    insert into orchestration_v2_projection_threads values('ta','alpha'),('tb','beta');
    insert into projection_thread_sessions values('claudeAgent','claude-native',null,'tb');`);
  const bind = db.prepare("insert into orchestration_v2_projection_provider_threads values(?,?,?)");
  const native = (id) => JSON.stringify({ nativeThreadRef: { nativeId: id, strength: "strong" } });
  bind.run("codex", "ta", native("codex-native"));
  bind.run("codex", "ta", native("ambiguous"));
  bind.run("codex", "tb", native("ambiguous"));
  db.close();
  fs.writeFileSync(path.join(userdata, "usage-model-rates.json"), JSON.stringify({ document: {
    m: { input_cost_per_token: 0.000001, output_cost_per_token: 0.000004, cache_read_input_token_cost: 0.0000001, cache_creation_input_token_cost: 0.000002 },
  } }));
  let readCalls = 0, readBytes = 0;
  const trackedFs = Object.create(fs);
  Object.defineProperty(trackedFs, "promises", { value: Object.create(fs.promises) });
  trackedFs.promises.open = async (...args) => {
    const fh = await fs.promises.open(...args);
    const read = fh.read.bind(fh);
    fh.read = async (...readArgs) => { readCalls++; const result = await read(...readArgs); readBytes += result.bytesRead; return result; };
    return fh;
  };
  const module = { exports: {} };
  class Clock extends Date { static now() { return NOW; } }
  vm.runInNewContext(source, {
    require: (name) => name === "node:os" ? { homedir: () => root } : name === "node:fs" ? trackedFs : require(name),
    process: { env: {} }, module, Buffer, Date: Clock,
  }, { filename: "usage.cjs" });
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), "lucid-usage-test-")));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const log = (kind, name, lines) => {
    const dirs = { codex: [".codex", "sessions"], claude: [".claude", "projects"], pi: [".pi", "agent", "sessions"] };
    const p = path.join(root, ...dirs[kind], `${name}.jsonl`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, lines.map((l) => typeof l === "string" ? l : JSON.stringify(l)).join("\n") + "\n");
    fs.utimesSync(p, new Date(NOW), new Date(NOW));
    return p;
  };
  return { root, log, getUsage: module.exports.getUsage, getCoinSources: module.exports.getCoinSources, reads: () => ({ calls: readCalls, bytes: readBytes }) };
}

function codex(id, cwd, total = 15, limits) {
  return [
    { type: "session_meta", timestamp: iso(-hour), payload: { id, cwd } },
    { type: "turn_context", timestamp: iso(-hour), payload: { model: "m", cwd } },
    { type: "event_msg", timestamp: iso(-hour), payload: { type: "token_count", info: { total_token_usage: { total_tokens: total }, last_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 } }, ...(limits ? { rate_limits: limits } : {}) } },
  ];
}
function claude(output, extra = {}) {
  return { type: "assistant", timestamp: iso(-hour), cwd: "C:\\work\\alpha", sessionId: "claude-native", requestId: "request", message: { id: "message", model: "m", usage: { input_tokens: 3, output_tokens: output, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 } }, ...extra };
}
const pool = (id, percent, reset = NOW + hour) => ({ limit_id: id, primary: { used_percent: percent, window_minutes: 300, resets_at: reset / 1000 }, secondary: null });
function reconcile(u) {
  for (const totals of Object.values(u.windows)) {
    const projects = Object.values(totals.byProject);
    assert.equal(projects.reduce((sum, p) => sum + p.tokens, 0), totals.tokens);
    assert.equal(projects.reduce((sum, p) => sum + Math.round(p.costUsd * 1e6), 0), Math.round(totals.costUsd * 1e6));
    for (const p of projects) assert.equal(p.sources.session + p.sources.cwd + p.sources.unassigned, p.tokens);
  }
}

test("native sessions, cwd/worktree boundaries and Unassigned reconcile after streaming dedup", async (t) => {
  const f = fixture(t);
  const c = codex("codex-native", "C:\\work\\beta");
  f.log("codex", "main", [...c, c[2]]); // repeated streaming/limits refresh
  f.log("codex", "ambiguous", codex("ambiguous", "C:\\work\\alpha", 16));
  f.log("claude", "stream", [claude(4), claude(9)]);
  f.log("claude", "resume-copy", [claude(9)]);
  f.log("pi", "nested", [{ type: "session", id: "pi-native", cwd: "c:/WORK/alpha/nested/src" }, { type: "message", timestamp: iso(), message: { role: "assistant", model: "m", usage: { input: 2, output: 3 } } }]);
  f.log("pi", "worktree", [{ type: "session", id: "pi-worktree", cwd: "C:\\worktrees\\alpha-branch\\src" }, { type: "message", timestamp: iso(), message: { role: "assistant", model: "m", usage: { input: 1, output: 2 } } }]);
  f.log("pi", "unmatched", [{ type: "session", cwd: "C:\\work\\alphabet" }, { type: "message", timestamp: iso(), message: { role: "assistant", model: "unknown", usage: { input: 1 } } }]);
  const u = await f.getUsage();
  assert.equal(u.windows.today.tokens, 54);
  assert.equal(u.windows.today.byProject.alpha.tokens, 18);
  assert.equal(u.windows.today.byProject.alpha.sources.session, 15);
  assert.equal(u.windows.today.byProject.beta.tokens, 15);
  assert.equal(u.windows.today.byProject.nested.tokens, 5);
  assert.equal(u.windows.today.byProject.unassigned.tokens, 16);
  assert.equal(u.windows.today.byProject.unassigned.priced, false);
  assert.ok(u.errors.some((e) => e.includes('No API price for model "unknown"')));
  reconcile(u);
});

test("every same-duration Codex pool and Claude model window survives; stale and absent readings stay honest", async (t) => {
  const f = fixture(t);
  const lines = codex("codex-native", "C:\\work\\alpha", 15, pool("codex", 24));
  lines.push({ ...lines[2], payload: { ...lines[2].payload, rate_limits: pool("model-side", 82) } });
  lines.push({ ...lines[2], payload: { ...lines[2].payload, rate_limits: pool("stale-model", 96, NOW - 1000) } });
  lines.push({ ...lines[2], payload: { ...lines[2].payload, rate_limits: pool("no-reading", null) } });
  lines.push({ ...lines[2], payload: { ...lines[2].payload, rate_limits: { limit_id: "unavailable-pool", primary: null, secondary: null } } });
  // More than 50 refreshes must not discard a different pool's last reading.
  for (let i = 0; i < 60; i++) lines.push({ ...lines[2], payload: { ...lines[2].payload, rate_limits: pool("codex", 25) } });
  f.log("codex", "limits", lines);
  const rejection = (type, reset, extra = {}) => claude(0, { message: { model: "<synthetic>" }, apiErrorParams: { rate_limit_info: { rateLimitType: type, resetsAt: reset / 1000, ...extra } } });
  f.log("claude", "limits", [rejection("five_hour", NOW - 1000, { status: "rejected" }), rejection("seven_day_opus", NOW + hour, { status: "rejected" }), rejection("seven_day_sonnet", NOW + hour, { utilization: 0.45 }), rejection("extra_window", NOW + hour), rejection("missing_reset", 0, { status: "rejected" })]);
  const u = await f.getUsage();
  assert.equal(u.limits.codex.windows.length, 5);
  assert.equal(u.limits.codex.primary.usedPercent, 25);
  assert.equal(u.limits.codex.windows.find((w) => w.pool === "model-side").usedPercent, 82);
  assert.equal(u.limits.codex.windows.find((w) => w.pool === "stale-model").stale, true);
  assert.equal(u.limits.codex.windows.find((w) => w.pool === "no-reading").usedPercent, null);
  assert.equal(u.limits.codex.windows.find((w) => w.pool === "unavailable-pool").usedPercent, null);
  assert.equal(new Set(u.limits.codex.windows.map((w) => w.id)).size, 5);
  assert.equal(u.limits.claude.windows.length, 5);
  assert.equal(u.limits.claude.windows.find((w) => w.id === "missing_reset").usedPercent, null);
  assert.equal(u.limits.claude.primary.stale, true);
  assert.equal(u.limits.claude.windows.find((w) => w.id === "seven_day_sonnet").usedPercent, 45);
  assert.equal(u.limits.claude.windows.find((w) => w.id === "extra_window").usedPercent, null);
  assert.equal(u.windows.today.tokens, 15);
  reconcile(u);
});

test("cold/warm getUsage shares in-flight scans, skips unchanged bodies and reads appended complete lines once", async (t) => {
  const f = fixture(t);
  const lines = codex("codex-native", "C:\\work\\alpha");
  const p = f.log("codex", "incremental", lines);
  const [cold, concurrent] = await Promise.all([f.getUsage(), f.getUsage()]);
  assert.equal(cold, concurrent);
  assert.equal(cold.windows.today.tokens, 15);
  const reads = f.reads();
  assert.ok(reads.calls > 0);
  const warm = await f.getUsage();
  assert.deepEqual(f.reads(), reads);
  assert.equal(JSON.stringify(warm.windows), JSON.stringify(cold.windows));
  const appended = { ...lines[2], timestamp: iso(), payload: { ...lines[2].payload, info: { total_token_usage: { total_tokens: 30 }, last_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 } } } };
  fs.appendFileSync(p, JSON.stringify(appended));
  const partial = await f.getUsage();
  assert.equal(partial.windows.today.tokens, 15);
  fs.appendFileSync(p, "\n");
  const updated = await f.getUsage();
  assert.equal(updated.windows.today.tokens, 30);
  const stable = await f.getUsage();
  assert.equal(stable.windows.today.tokens, 30);
  assert.ok(f.reads().bytes - reads.bytes < 2048);
  reconcile(updated);
});

test("large-file timestamp seeking restores header attribution and previous token counter", async (t) => {
  const f = fixture(t);
  const header = codex("unmapped-native", "C:\\work\\alpha");
  const old = NOW - 10 * 86400000;
  const filler = JSON.stringify({ type: "response_item", timestamp: new Date(old).toISOString(), payload: { text: "x".repeat(32768) } });
  const oldCounter = { ...header[2], timestamp: new Date(old).toISOString() };
  const repeatedRecent = { ...header[2], timestamp: iso(-hour) };
  const newRecent = { ...header[2], timestamp: iso(), payload: { ...header[2].payload, info: { ...header[2].payload.info, total_token_usage: { total_tokens: 30 } } } };
  f.log("codex", "large", [{ ...header[0], timestamp: new Date(old).toISOString() }, { ...header[1], timestamp: new Date(old).toISOString() }, ...Array(520).fill(filler), { ...header[1], timestamp: new Date(old).toISOString(), payload: { model: "m" } }, oldCounter, repeatedRecent, newRecent]);
  const u = await f.getUsage();
  assert.equal(u.windows.today.tokens, 15);
  assert.equal(u.windows.today.byProject.alpha.sources.cwd, 15);
  assert.ok(f.reads().bytes < 48 * 1024 * 1024, `bounded seek read ${f.reads().bytes} bytes`);
  const reads = f.reads(); await f.getUsage(); assert.deepEqual(f.reads(), reads);
  reconcile(u);
});


test("copied streaming usage prefers an exact session; conflicting exact projects stay Unassigned", async (t) => {
  const f = fixture(t);
  // Same message duplicated in a resumed file without a binding. The exact T3
  // binding on the original wins over a working-directory-only copy.
  f.log("claude", "original", [claude(9)]);
  f.log("claude", "copy", [claude(9, { sessionId: "unmapped", cwd: "C:\\work\\alpha" })]);
  let u = await f.getUsage();
  assert.equal(u.windows.today.tokens, 15);
  assert.equal(u.windows.today.byProject.beta.tokens, 15);
  const db = new DatabaseSync(path.join(f.root, ".t3", "userdata", "statev2.sqlite"));
  db.exec("insert into projection_thread_sessions values('claudeAgent','different-project',null,'ta')"); db.close();
  f.log("claude", "conflict", [claude(9, { sessionId: "different-project" })]);
  u = await f.getUsage();
  assert.equal(u.windows.today.tokens, 15);
  assert.equal(u.windows.today.byProject.unassigned.tokens, 15);
  reconcile(u);
});

test("missing project database leaves real usage Unassigned without creating a database", async (t) => {
  const f = fixture(t);
  const dbPath = path.join(f.root, ".t3", "userdata", "statev2.sqlite");
  fs.unlinkSync(dbPath);
  f.log("codex", "usage", codex("codex-native", "C:\\work\\alpha"));
  const u = await f.getUsage();
  assert.equal(u.windows.today.byProject.unassigned.tokens, 15);
  assert.ok(u.errors.includes("Project mapping unavailable; usage is grouped as Unassigned."));
  assert.equal(fs.existsSync(dbPath), false);
  assert.equal(u.limits.codex, null);
  reconcile(u);
});


test("coin sources use exact sessions, deduplicate streaming and exclude ambiguous ownership", async (t) => {
  const f = fixture(t);
  f.log("codex", "main", codex("codex-native", "C:/work/alpha"));
  f.log("claude", "stream", [claude(4), claude(9)]);
  f.log("claude", "copy", [claude(9)]);
  f.log("codex", "ambiguous", codex("ambiguous", "C:/work/alpha"));
  const result = await f.getCoinSources([
    { harness: 'codex', sessionId: 'codex-native', threadId: 'ta', title: 'Parent', status: 'completed' },
    { harness: 'claudeAgent', sessionId: 'claude-native', threadId: 'child', title: 'Helper', status: 'running' },
    { harness: 'codex', sessionId: 'ambiguous', threadId: 'ta' },
    { harness: 'codex', sessionId: 'ambiguous', threadId: 'tb' },
    { harness: 'codex', sessionId: 'missing', threadId: 'empty' },
  ]);
  assert.equal(result.sources.length, 3);
  assert.ok(!result.sources.some(s => s.key.endsWith(':ambiguous')));
  assert.ok(Math.abs(result.sources.find(s => s.threadId === 'ta').costUsd - .0000282) < 1e-12);
  assert.ok(Math.abs(result.sources.find(s => s.threadId === 'child').costUsd - .0000412) < 1e-12);
  assert.equal(result.sources.find(s => s.threadId === 'empty').costUsd, null);
  assert.equal(result.sources.find(s => s.threadId === 'child').status, 'running');
});


test("partial T3 limits preserve exhausted local windows without crossing accounts", () => {
  const { mergeProviderLimits } = require('../../electron/provider-limits.cjs');
  const now = Date.now(), resetsAt = new Date(now + 3600000).toISOString();
  const local = { id: 'seven_day', usedPercent: 100, resetsAt, windowMinutes: 10080 };
  const usage = { limits: { claude: { windows: [local] } } };
  const provider = { instanceId: 'claudeAgent', driver: 'claudeAgent', usageLimits: { checkedAt: new Date(now).toISOString(), windows: [{ id: 'five_hour', usedPercent: 20, resetsAt }] } };
  const merged = mergeProviderLimits(usage, { providers: [provider] }, now);
  assert.equal(merged.limits['t3:claudeAgent'].windows.find(w => w.id.endsWith(':seven_day')).usedPercent, 100);
  const recovered = structuredClone(provider);
  recovered.usageLimits.windows.push({ id: 'seven_day', usedPercent: 10, resetsAt });
  assert.equal(mergeProviderLimits(usage, { providers: [recovered] }, now).limits['t3:claudeAgent'].windows.find(w => w.id.endsWith(':seven_day')).usedPercent, 10);
  const other = { ...provider, instanceId: 'work' };
  assert.equal(mergeProviderLimits(usage, { providers: [provider, other] }, now).limits['t3:claudeAgent'].windows.length, 1);
});
