// Read-only bridge to the local T3 Code server state.
// T3 writes every agent action (commands, file edits, searches, tool calls)
// into its SQLite projection tables. We poll those tables and never write.
// Starting threads and sending messages goes through the official `t3` CLI.

const { DatabaseSync } = require("node:sqlite");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const T3_HOME = process.env.T3CODE_HOME || path.join(os.homedir(), ".t3");
const DB_PATH = path.join(T3_HOME, "userdata", "statev2.sqlite");
const CLI = path.join(T3_HOME, "bin", process.platform === "win32" ? "t3.cmd" : "t3");

let db = null;
function getDb() {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) throw new Error(`T3 Code data not found at ${DB_PATH}. Open T3 Code once, then try again.`);
  db = new DatabaseSync(DB_PATH, { readOnly: true });
  return db;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function listProjects() {
  return getDb()
    .prepare("select project_id as id, title, workspace_root as root from projection_projects where deleted_at is null order by updated_at desc")
    .all();
}

function listThreads(limit = 60) {
  const rows = getDb()
    .prepare(`select t.thread_id as id, t.project_id as projectId, t.title, t.updated_at as updatedAt,
                     coalesce(t.provider_instance_id, t.default_provider) as provider, p.title as projectTitle,
                     (select status from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by r.ordinal desc limit 1) as runStatus
              from orchestration_v2_projection_threads t
              left join projection_projects p on p.project_id = t.project_id
              where t.archived_at is null and t.deleted_at is null
              order by t.updated_at desc limit ?`)
    .all(limit);
  return rows;
}

function threadInfo(threadId) {
  const t = getDb()
    .prepare(`select t.thread_id as id, t.title, coalesce(t.provider_instance_id, t.default_provider) as provider, t.payload_json as payload,
                     p.title as projectTitle, p.workspace_root as root
              from orchestration_v2_projection_threads t left join projection_projects p on p.project_id = t.project_id
              where t.thread_id = ?`)
    .get(threadId);
  if (!t) return null;
  const run = getDb()
    .prepare("select run_id as id, status, payload_json as payload from orchestration_v2_projection_runs where thread_id = ? order by ordinal desc limit 1")
    .get(threadId);
  const payload = safeJson(t.payload) || {};
  return {
    id: t.id,
    title: t.title,
    provider: t.provider,
    model: payload.modelSelection?.model || payload.model || null,
    projectTitle: t.projectTitle,
    root: t.root,
    run: run ? { id: run.id, status: run.status } : null,
  };
}

const ITEM_SQL = `select turn_item_id as id, run_id as runId, ordinal, type, status, updated_at as updatedAt, payload_json as payload
                  from orchestration_v2_projection_turn_items where thread_id = ?`;

function normalize(row) {
  const p = safeJson(row.payload) || {};
  delete p.threadId; delete p.nodeId; delete p.providerThreadId; delete p.providerTurnId; delete p.nativeItemRef;
  return { id: row.id, runId: row.runId, ordinal: row.ordinal, type: row.type, status: row.status, updatedAt: row.updatedAt, data: p };
}

// Latest items of the thread, oldest first.
function recentItems(threadId, count) {
  const rows = getDb().prepare(`${ITEM_SQL} order by ordinal desc limit ?`).all(threadId, count);
  return rows.reverse().map(normalize);
}

function itemsSince(threadId, since) {
  return getDb().prepare(`${ITEM_SQL} and updated_at > ? order by ordinal asc`).all(threadId, since).map(normalize);
}

// Watch one thread. Calls onItems with new or changed items.
function watchThread(threadId, onItems, onInfo, { backlog = 14 } = {}) {
  let since = "";
  let lastInfo = "";
  const seen = new Map();
  const initial = recentItems(threadId, backlog);
  for (const it of initial) { seen.set(it.id, it.updatedAt); if (it.updatedAt > since) since = it.updatedAt; }
  onItems(initial, true);
  const tick = () => {
    try {
      const fresh = itemsSince(threadId, since).filter((it) => seen.get(it.id) !== it.updatedAt);
      for (const it of fresh) { seen.set(it.id, it.updatedAt); if (it.updatedAt > since) since = it.updatedAt; }
      if (fresh.length) onItems(fresh, false);
      const info = threadInfo(threadId);
      const key = JSON.stringify(info);
      if (key !== lastInfo) { lastInfo = key; onInfo(info); }
    } catch (err) {
      onInfo({ error: String(err.message || err) });
    }
  };
  tick();
  const timer = setInterval(tick, 350);
  return () => clearInterval(timer);
}

// --- CLI actions -----------------------------------------------------------

// On Windows, t3.cmd wraps T3's bundled runtime. Calling that runtime directly
// avoids cmd.exe quoting, which mangles paths and quotes in arguments.
function cliLauncher() {
  if (process.platform === "win32") {
    try {
      const text = fs.readFileSync(CLI, "utf8");
      const m = text.match(/^"([^"]+\.exe)"\s+"([^"]+)"\s+%\*/m);
      if (m && fs.existsSync(m[1])) {
        return {
          cmd: m[1],
          pre: [m[2]],
          env: { T3CODE_HOME: T3_HOME, T3CODE_CLI_PATH: CLI, ELECTRON_RUN_AS_NODE: "1", T3CODE_DESKTOP_CLI_LAUNCHER: "1" },
        };
      }
    } catch {}
  }
  return { cmd: CLI, pre: [], env: {} };
}

function runCli(args, stdin) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLI)) return reject(new Error("The t3 command was not found. Open T3 Code once so it installs it."));
    const l = cliLauncher();
    const child = spawn(l.cmd, [...l.pre, ...args], { windowsHide: true, env: { ...process.env, ...l.env } });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `t3 exited with code ${code}`))));
    if (stdin != null) child.stdin.end(stdin); else child.stdin.end();
  });
}

// The model this provider was last used with, so new threads match your usual setup.
function lastModelFor(provider) {
  const rows = getDb()
    .prepare("select payload_json as p from orchestration_v2_projection_threads where coalesce(provider_instance_id, default_provider) = ? order by updated_at desc limit 20")
    .all(provider);
  for (const r of rows) {
    const m = safeJson(r.p)?.modelSelection?.model;
    if (m) return m;
  }
  return null;
}

async function startThread({ project, message, provider, model }) {
  if (provider && !model) model = lastModelFor(provider);
  if (provider && !model) provider = undefined; // fall back to the project's default harness
  const args = ["thread", "start", String(project), "-", "--json"];
  if (provider) args.push("--provider", String(provider));
  if (model) args.push("--model", String(model));
  const out = await runCli(args, message);
  const parsed = safeJson(out.trim());
  const id = parsed?.threadId || parsed?.thread?.threadId || parsed?.id || out.trim().split(/\s+/).pop();
  return { threadId: id };
}

async function sendMessage({ threadId, message }) {
  await runCli(["thread", "send", String(threadId), "-"], message);
  return { ok: true };
}

module.exports = { listProjects, listThreads, threadInfo, watchThread, startThread, sendMessage, DB_PATH };
