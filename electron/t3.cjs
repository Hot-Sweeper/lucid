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

// Reasoning effort from a model selection's options: [{ id: "effort", value }] (Claude),
// "reasoningEffort" (Codex), or another thinking-level option; an object map works too.
const EFFORT_IDS = ["effort", "reasoningEffort", "reasoning_effort", "reasoning", "thinkingLevel", "thinking", "variant"];
function effortOf(options) {
  if (!options) return null;
  if (Array.isArray(options)) {
    for (const id of EFFORT_IDS) {
      const o = options.find((x) => x && x.id === id);
      if (o && o.value != null && typeof o.value !== "boolean") return String(o.value);
    }
    return null;
  }
  for (const id of EFFORT_IDS) if (options[id] != null && typeof options[id] !== "boolean") return String(options[id]);
  return null;
}

// a queued message as a to-do line: its words, with attachments as a short note
function queuedText(m) {
  const raw = String(m?.text || "");
  const files = (raw.match(/^\s*-\s*(image|file):/gim) || []).length + (m?.attachments?.length || 0);
  const words = raw.replace(/\s*Attached:[\s\S]*$/, "").replace(/\s+/g, " ").trim().slice(0, 140);
  return words + (files ? `${words ? " " : ""}(+ ${files > 1 ? files + " attachments" : "attachment"})` : "");
}


// --- the offices' to-do lists ----------------------------------------------------------
// Every message you sent to a robot is a task with the status T3 gives its run: queued,
// running (or waiting on you), done, or stopped. Running tasks carry the robot's own plan
// counts (steps finished of steps written), which is the only progress that is real.
const OPEN_RUN = "('queued','running','starting','preparing','waiting','awaiting_input')";
const ENDED_RUN = "('completed','failed','interrupted')";
function officeTasks() {
  const db = getDb();
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const rows = db
    .prepare(`select r.run_id as id, r.thread_id as threadId, t.project_id as projectId, r.status, r.ordinal, r.payload_json as p, m.payload_json as mp
              from orchestration_v2_projection_runs r
              join orchestration_v2_projection_threads t on t.thread_id = r.thread_id
              left join orchestration_v2_projection_messages m on m.message_id = json_extract(r.payload_json, '$.userMessageId')
              where t.archived_at is null and t.deleted_at is null and t.thread_id not like 'thread:%'
                and (r.status in ${OPEN_RUN} or (r.status in ${ENDED_RUN} and json_extract(r.payload_json, '$.completedAt') >= ?))`)
    .all(midnight.toISOString());
  const planStmt = db.prepare("select payload_json as p from orchestration_v2_projection_turn_items where thread_id = ? and run_id = ? and type = 'todo_list' order by ordinal desc limit 1");
  const todoStmt = db.prepare("select payload_json as p from orchestration_v2_projection_turn_items where thread_id = ? and run_id = ? and type = 'dynamic_tool' and json_extract(payload_json, '$.toolName') like '%TodoWrite' order by ordinal desc limit 1");
  const tasks = [];
  for (const r of rows) {
    const p = safeJson(r.p) || {};
    const m = safeJson(r.mp);
    // helper reports and system notes are not things you asked for
    if (m && (m.delegatedCompletion || m.notification)) continue;
    const raw = String(m?.text || "");
    if (/^s*(Delegated task node:|<task-notification>|New messages the user wrote to robots)/.test(raw) || /delegated-task:command/.test(raw.slice(0, 200))) continue;
    const files = (raw.match(/^s*-s*(image|file):/gim) || []).length + (m?.attachments?.length || 0);
    let steps = null;
    if (r.status === "running") {
      // Codex writes a plan item, Claude calls TodoWrite
      const list = safeJson(planStmt.get(r.threadId, r.id)?.p)?.steps || safeJson(todoStmt.get(r.threadId, r.id)?.p)?.input?.todos;
      if (Array.isArray(list) && list.length) steps = { done: list.filter((s) => /complete|done|finish|success/i.test(String(s?.status || ""))).length, total: list.length };
    }
    tasks.push({
      id: r.id, threadId: r.threadId, projectId: r.projectId, ordinal: r.ordinal,
      status: r.status === "queued" ? "queued" : r.status === "completed" ? "done" : r.status === "failed" || r.status === "interrupted" ? "stopped" : "running",
      asking: r.status === "waiting" || r.status === "awaiting_input",
      pos: p.queuePosition ?? r.ordinal,
      at: p.requestedAt || null, startedAt: p.startedAt || null, endedAt: p.completedAt || null,
      text: raw.slice(0, 2400), files, steps,
    });
  }
  return tasks;
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
  // your queued messages, in the order T3 will deliver them (for the robot's to-do app)
  const queued = getDb()
    .prepare("select r.run_id as id, r.ordinal, r.payload_json as p, m.payload_json as mp from orchestration_v2_projection_runs r left join orchestration_v2_projection_messages m on m.message_id = json_extract(r.payload_json, '$.userMessageId') where r.thread_id = ? and r.status = 'queued'")
    .all(threadId)
    .map((r) => ({ id: r.id, pos: safeJson(r.p)?.queuePosition ?? r.ordinal, ordinal: r.ordinal, text: queuedText(safeJson(r.mp)) }))
    .sort((a, b) => a.pos - b.pos || a.ordinal - b.ordinal)
    .map(({ id, text }) => ({ id, text }));
  return {
    id: t.id,
    queued,
    title: t.title,
    provider: t.provider,
    model: payload.modelSelection?.model || payload.model || null,
    effort: effortOf(payload.modelSelection?.options),
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

async function addProject({ path: root, title }) {
  const args = ["project", "add", String(root)];
  if (title) args.push("--title", String(title));
  return { output: (await runCli(args)).trim() };
}

// Never forces: T3 refuses when the project still has threads, and that message is shown as is.
async function removeProject({ id }) {
  return { output: (await runCli(["project", "remove", String(id)])).trim() };
}

async function sendMessage({ threadId, message }) {
  await runCli(["thread", "send", String(threadId), "-"], message);
  return { ok: true };
}

// --- offices ---------------------------------------------------------------

const ICON_CANDIDATES = [
  "favicon.svg", "favicon.png", "favicon.ico", "logo.svg", "logo.png", "icon.svg", "icon.png",
  "public/favicon.svg", "public/favicon.png", "public/favicon.ico", "public/logo.svg", "public/logo.png", "public/icon.png",
  "static/favicon.svg", "static/favicon.png", "static/favicon.ico", "app/favicon.ico", "app/icon.png", "app/icon.svg",
  "src/assets/logo.svg", "src/assets/logo.png", "src/assets/icon.png", "assets/logo.svg", "assets/logo.png", "assets/icon.png",
  "build/icon.png", "resources/icon.png", "src/app/favicon.ico", "src-tauri/icons/icon.png",
];
const MIME = { svg: "image/svg+xml", png: "image/png", ico: "image/x-icon", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

function readIcon(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 2 * 1024 * 1024) return null;
    const type = MIME[path.extname(file).slice(1).toLowerCase()];
    if (!type) return null;
    return `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
  } catch {
    return null;
  }
}

// The project's own logo or favicon, if it has one.
function projectIcon(root, faviconPath) {
  if (!root) return null;
  if (faviconPath) {
    const d = readIcon(path.isAbsolute(faviconPath) ? faviconPath : path.join(root, faviconPath));
    if (d) return d;
  }
  try {
    const cfg = safeJson(fs.readFileSync(path.join(root, "t3.json"), "utf8"));
    if (cfg?.iconPath) { const d = readIcon(path.join(root, cfg.iconPath)); if (d) return d; }
  } catch {}
  for (const c of ICON_CANDIDATES) { const d = readIcon(path.join(root, c)); if (d) return d; }
  return null;
}

function office(projectId, limit = 6) {
  const p = getDb()
    .prepare("select project_id as id, title, workspace_root as root, favicon_path as favicon from projection_projects where project_id = ?")
    .get(projectId);
  if (!p) return null;
  const threads = getDb()
    .prepare(`select t.thread_id as id, t.title, t.updated_at as updatedAt, coalesce(t.provider_instance_id, t.default_provider) as provider,
                     (select status from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by r.ordinal desc limit 1) as runStatus
              from orchestration_v2_projection_threads t
              where t.project_id = ? and t.archived_at is null and t.deleted_at is null
              order by t.updated_at desc limit ?`)
    .all(projectId, limit);
  return { project: { id: p.id, title: p.title, root: p.root, icon: projectIcon(p.root, p.favicon) }, threads };
}

function listProjectsWithCounts() {
  return getDb()
    .prepare(`select p.project_id as id, p.title, p.workspace_root as root,
                     (select count(*) from orchestration_v2_projection_threads t where t.project_id = p.project_id and t.archived_at is null and t.deleted_at is null) as threads,
                     (select max(updated_at) from orchestration_v2_projection_threads t where t.project_id = p.project_id) as lastActive
              from projection_projects p where p.deleted_at is null order by lastActive desc`)
    .all();
}

// Every recent thread with what decides its room: pinned, running, settled, waiting on a question.
function world(limit = 40) {
  const db = getDb();
  const rows = db
    .prepare(`select t.thread_id as id, t.project_id as projectId, t.title, t.updated_at as updatedAt, t.payload_json as payload,
                     coalesce(t.provider_instance_id, t.default_provider) as provider,
                     (select status from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by r.ordinal desc limit 1) as runStatus,
                     (select json_extract(r.payload_json, '$.startedAt') from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by r.ordinal desc limit 1) as runStartedAt,
                     (select count(*) from orchestration_v2_projection_runtime_requests q where q.thread_id = t.thread_id and q.status not in ('resolved','cancelled','expired','failed')) as pending,
                     (select max(i.updated_at) from orchestration_v2_projection_turn_items i where i.thread_id = t.thread_id) as lastItemAt
              from orchestration_v2_projection_threads t
              where t.archived_at is null and t.deleted_at is null and t.thread_id not like 'thread:%'
              order by t.updated_at desc limit ?`)
    .all(limit);
  const questionStmt = db.prepare(`select payload_json as p from orchestration_v2_projection_turn_items
                                   where thread_id = ? and type = 'user_input_request' and status in ('running','pending','waiting') order by ordinal desc limit 1`);
  const approvalStmt = db.prepare(`select 1 from orchestration_v2_projection_runtime_requests where thread_id = ? and kind != 'user_input' and status not in ('resolved','cancelled','expired','failed') limit 1`);
  // Scheduled threads: when their next run is, and how often they run.
  const schedules = new Map();
  try {
    for (const s of db.prepare("select thread_id as id, schedule_json as sj, next_run_at as nextRunAt from scheduled_tasks where enabled = 1 and thread_id is not null").all()) {
      const sj = safeJson(s.sj) || {};
      schedules.set(s.id, { nextRunAt: s.nextRunAt, everyMs: sj.everyMs || null });
    }
  } catch {}
  const threads = rows.map((r) => {
    const p = safeJson(r.payload) || {};
    const settled = p.settledOverride === "settled" || (!!p.settledAt && !p.unsettledAt && p.settledOverride !== "unsettled");
    let question = null;
    if (r.pending > 0 || r.runStatus === "waiting" || r.runStatus === "awaiting_input") {
      const q = questionStmt.get(r.id);
      const qp = q ? safeJson(q.p) : null;
      question = qp?.questions?.map((x) => x.question).join(" ") || (approvalStmt.get(r.id) ? "Needs your approval" : "Needs your answer");
    }
    // T3 can show a live turn as "queued"; recent activity is the most honest signal.
    const busy = r.runStatus === "running" || r.runStatus === "queued" || (r.lastItemAt && Date.now() - Date.parse(r.lastItemAt) < 90000);
    return {
      id: r.id, projectId: r.projectId, title: r.title, updatedAt: r.updatedAt, provider: r.provider, runStatus: busy ? "running" : r.runStatus,
      pinned: !!p.pinnedAt, settled, question, model: p.modelSelection?.model || null,
      schedule: schedules.get(r.id) || null,
      folder: p.worktreePath || null,
      // for the T3-style thread list
      branch: p.branch || null, lastStatus: r.runStatus || null, runStartedAt: r.runStartedAt || null,
      unseen: !!(r.updatedAt && (!p.lastVisitedAt || Date.parse(r.updatedAt) > Date.parse(p.lastVisitedAt))),
    };
  });
  const projects = db
    .prepare("select project_id as id, title, workspace_root as root, favicon_path as favicon, project_icon_json as iconJson from projection_projects where deleted_at is null")
    .all()
    .map((p) => ({ id: p.id, title: p.title, root: p.root, icon: projectIcon(p.root, p.favicon), scratch: /[\\/]\.t3[\\/]scratch$/i.test(p.root || "") }));
  // Models you have used per harness, most recent first, for the hiring screen.
  const models = {};
  for (const r of db.prepare("select coalesce(provider_instance_id, default_provider) as pv, payload_json as p from orchestration_v2_projection_threads order by updated_at desc limit 300").all()) {
    const m = safeJson(r.p)?.modelSelection?.model;
    if (!m) continue;
    (models[r.pv] ??= []);
    if (!models[r.pv].includes(m)) models[r.pv].push(m);
  }
  for (const [pv, extra] of [["claudeAgent", ["claude-sonnet-5-5", "claude-haiku-5-5"]], ["codex", ["gpt-6-luna", "gpt-6.1-terra"]]]) {
    (models[pv] ??= []);
    for (const m of extra) if (!models[pv].includes(m)) models[pv].push(m);
  }
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const shippedRow = db.prepare(`select count(*) as total, sum(case when completed_at >= ? then 1 else 0 end) as today
                                 from orchestration_v2_projection_runs where status = 'completed'`).get(midnight.toISOString());
  return { projects, threads, models, prices: modelPrices(Object.values(models).flat()), shipped: { total: shippedRow.total || 0, today: shippedRow.today || 0 } };
}

let rateDoc = null;
function modelPrices(list) {
  try {
    rateDoc ??= safeJson(fs.readFileSync(path.join(T3_HOME, "userdata", "usage-model-rates.json"), "utf8"))?.document || {};
  } catch { rateDoc = {}; }
  const out = {};
  for (const m of list) {
    const r = rateDoc[m] || rateDoc[`openai/${m}`] || rateDoc[`anthropic/${m}`];
    if (r && (r.input_cost_per_token || r.output_cost_per_token)) out[m] = { input: (r.input_cost_per_token || 0) * 1e6, output: (r.output_cost_per_token || 0) * 1e6 };
  }
  return out;
}

const ATTACH_DIR = path.join(T3_HOME, "userdata", "attachments");
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "application/pdf": "pdf", "text/plain": "txt" };

function attachmentPath(a) {
  const ext = EXT[a.mimeType] || (a.name && path.extname(a.name).slice(1)) || "";
  const direct = path.join(ATTACH_DIR, ext ? `${a.id}.${ext}` : a.id);
  if (fs.existsSync(direct)) return direct;
  try {
    const hit = fs.readdirSync(ATTACH_DIR).find((f) => f.startsWith(a.id));
    if (hit) return path.join(ATTACH_DIR, hit);
  } catch {}
  return null;
}

// The chat between you and one robot, oldest first, with attachments resolved to files.
function conversation(threadId, limit = 80) {
  const rows = getDb()
    .prepare("select message_id as id, role, created_at as at, streaming, payload_json as p from orchestration_v2_projection_messages where thread_id = ? order by created_at desc, rowid desc limit ?")
    .all(threadId, limit)
    .reverse();
  // Queued messages are often older than the newest messages (they wait while the robot
  // replies to others), so they are loaded on their own: the whole queue, however old.
  const queuedRuns = getDb().prepare("select run_id as runId, status, ordinal, payload_json as p from orchestration_v2_projection_runs where thread_id = ? and status = 'queued'").all(threadId);
  const have = new Set(rows.map((r) => r.id));
  const missing = queuedRuns.map((q) => safeJson(q.p)?.userMessageId).filter((id) => id && !have.has(id));
  if (missing.length) {
    const extra = getDb()
      .prepare(`select message_id as id, role, created_at as at, streaming, payload_json as p from orchestration_v2_projection_messages where thread_id = ? and message_id in (${missing.map(() => "?").join(",")})`)
      .all(threadId, ...missing);
    rows.unshift(...extra.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)));
  }
  const runs = new Map();
  const started = new Map();
  const queuePos = new Map();
  const queueRun = new Map();
  const queued = [];
  let liveRunId = null;
  const recent = getDb().prepare("select run_id as runId, status, ordinal, payload_json as p from orchestration_v2_projection_runs where thread_id = ? and status != 'queued' order by ordinal desc limit 60").all(threadId);
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
      id: r.id, role: r.role, at: r.at, orderAt: key(r), streaming: !!r.streaming, text: p.text || "", run: runs.get(r.id) || null, queue: queuePos.get(r.id) || null,
      // queued messages: their run, the live turn to steer into, and whether T3 lets you change them
      ...(queueRun.has(r.id) ? { queueRunId: queueRun.get(r.id), steerTarget: liveRunId, queueFixed: !!(p.delegatedCompletion || p.notification), queueGuest: !!p.context?.guest } : {}),
      attachments: (p.attachments || []).map((a) => ({ type: a.type, name: a.name, mime: a.mimeType, size: a.sizeBytes, path: attachmentPath(a) })),
    };
  });
  const since = messages.find((m) => m.run !== "queued")?.orderAt;
  const events = require("./chat-history.cjs").historyEvents(getDb(), threadId, since);
  const rank = (m) => m.role === "user" ? 0 : m.role === "event" ? 1 : 2;
  return [...messages, ...events].sort((a, b) => a.orderAt.localeCompare(b.orderAt) || rank(a) - rank(b));
}

// Messages you wrote to robots since a moment, newest last (the orchestrator learns from them).
function userMessagesSince(since, exclude) {
  return getDb()
    .prepare(`select m.thread_id as threadId, m.created_at as at, m.payload_json as p, t.title as title
              from orchestration_v2_projection_messages m left join orchestration_v2_projection_threads t on t.thread_id = m.thread_id
              where m.role = 'user' and m.created_at > ? and m.thread_id != ? and m.thread_id not like 'thread:%'
              order by m.created_at asc limit 40`)
    .all(since, exclude || "")
    .map((r) => ({ threadId: r.threadId, title: r.title, at: r.at, text: (safeJson(r.p)?.text || "").slice(0, 1500) }))
    // only what you wrote yourself: helper reports and system notes are not your preferences
    .filter((m) => m.text.trim() && !/^(Delegated task node:|<task-notification>|New messages the user wrote to robots)/.test(m.text.trim()) && !/delegated-task:command/.test(m.text.slice(0, 200)));
}

// Open questions and approval requests of one thread, oldest first, with what the agent asked.
// The answer goes back through the paired T3 session (t3server.cjs respondToRequest).
const DONE_REQUEST = "('resolved','cancelled','expired','failed')";
function pendingRequests(threadId) {
  const db = getDb();
  const rows = db
    .prepare(`select runtime_request_id as id, kind, status, created_at as at, payload_json as p from orchestration_v2_projection_runtime_requests
              where thread_id = ? and status not in ${DONE_REQUEST} order by created_at asc`)
    .all(threadId);
  const itemStmt = db.prepare(`select payload_json as p from orchestration_v2_projection_turn_items
                               where thread_id = ? and type in ('user_input_request','approval_request') and json_extract(payload_json, '$.requestId') = ?
                               order by ordinal desc limit 1`);
  return rows.map((r) => {
    const rp = safeJson(r.p) || {};
    const item = safeJson(itemStmt.get(threadId, r.id)?.p) || {};
    const cap = rp.responseCapability || {};
    const base = { id: r.id, kind: r.kind, at: r.at, answerable: cap.type !== "not_resumable", reason: cap.type === "not_resumable" ? cap.reason || null : null };
    if (r.kind === "user_input" || item.type === "user_input_request") {
      const questions = (item.questions || rp.questions || []).map((q) => ({
        id: String(q.id), header: q.header || "", question: q.question || "",
        options: (q.options || []).map((o) => ({ label: o.label, description: o.description || "", value: o.value ?? null })),
        multiSelect: !!q.multiSelect, allowCustomAnswer: q.allowCustomAnswer !== false, initialAnswer: q.initialAnswer ?? null,
      }));
      return { ...base, type: "input", questions };
    }
    return {
      ...base, type: "approval", requestKind: item.requestKind || r.kind, prompt: item.prompt || "", detail: item.reason || "",
      options: (item.options || []).map((o) => ({ decision: o.decision, label: o.label, warning: o.warning || null })),
    };
  });
}

// --- the orchestrator deciding questions ---------------------------------------------------

/** A short picture of a thread for the orchestrator: title, project, what was last said. */
function requestContext(threadId) {
  const db = getDb();
  const t = db.prepare(`select t.title, p.title as project from orchestration_v2_projection_threads t
                        left join projection_projects p on p.project_id = t.project_id where t.thread_id = ?`).get(threadId);
  const last = (role) => safeJson(db.prepare("select payload_json as p from orchestration_v2_projection_messages where thread_id = ? and role = ? order by created_at desc limit 1").get(threadId, role)?.p)?.text || "";
  return { title: t?.title || "", project: t?.project || "", user: last("user").slice(0, 400), robot: last("assistant").slice(-600) };
}

/** The orchestrator's replies since a moment, plus how its latest run is doing. */
function repliesSince(threadId, since) {
  const db = getDb();
  const messages = db.prepare("select created_at as at, streaming, payload_json as p from orchestration_v2_projection_messages where thread_id = ? and role = 'assistant' and created_at > ? order by created_at asc limit 20")
    .all(threadId, since).map((r) => ({ at: r.at, streaming: !!r.streaming, text: safeJson(r.p)?.text || "" }));
  const run = db.prepare("select status from orchestration_v2_projection_runs where thread_id = ? order by ordinal desc limit 1").get(threadId);
  const exists = !!db.prepare("select 1 from orchestration_v2_projection_threads where thread_id = ? and archived_at is null and deleted_at is null").get(threadId);
  return { messages, runStatus: run?.status || null, exists };
}

/** Questions and approvals that were answered since a moment (by anyone), with what was asked and the answer. */
function resolvedRequestsSince(since) {
  const db = getDb();
  const rows = db.prepare(`select q.runtime_request_id as id, q.thread_id as threadId, q.kind, q.resolved_at as at, q.payload_json as p, t.title, pr.title as project
                           from orchestration_v2_projection_runtime_requests q
                           left join orchestration_v2_projection_threads t on t.thread_id = q.thread_id
                           left join projection_projects pr on pr.project_id = t.project_id
                           where q.status = 'resolved' and q.resolved_at > ? order by q.resolved_at asc limit 40`).all(since);
  const itemStmt = db.prepare(`select payload_json as p from orchestration_v2_projection_turn_items
                               where thread_id = ? and type in ('user_input_request','approval_request') and json_extract(payload_json, '$.requestId') = ?
                               order by ordinal desc limit 1`);
  return rows.map((r) => {
    const rp = safeJson(r.p) || {};
    const item = safeJson(itemStmt.get(r.threadId, r.id)?.p) || {};
    const questions = (item.questions || rp.questions || []).map((q) => ({ id: String(q.id), question: q.question || q.header || "", options: (q.options || []).map((o) => o.label) }));
    return { id: r.id, threadId: r.threadId, title: r.title || "", project: r.project || "", at: r.at, kind: r.kind,
      questions, answers: rp.answers || null, decision: rp.decision || null, prompt: item.prompt || "" };
  });
}

// How a request ended: its status and, for an approval, what was decided (accept, decline, ...).
function requestOutcome(threadId, requestId) {
  const row = getDb()
    .prepare("select status, payload_json as p from orchestration_v2_projection_runtime_requests where thread_id = ? and runtime_request_id = ?")
    .get(threadId, requestId);
  if (!row) return null;
  return { status: row.status, decision: safeJson(row.p)?.decision || null };
}

module.exports = { officeTasks, requestContext, repliesSince, resolvedRequestsSince, requestOutcome, pendingRequests, userMessagesSince, itemsSince, recentItems, addProject, removeProject, conversation, attachmentPath, world, listProjects, listProjectsWithCounts, listThreads, threadInfo, watchThread, startThread, sendMessage, office, DB_PATH };
