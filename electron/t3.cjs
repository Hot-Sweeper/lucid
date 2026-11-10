// Read-only bridge to the local T3 Code server state.
// T3 writes every agent action (commands, file edits, searches, tool calls)
// into its SQLite projection tables. We poll those tables and never write.
// Starting threads and sending messages goes through the official `t3` CLI.

const { DatabaseSync } = require("node:sqlite");
const { runCliProcess } = require("./cli-runner.cjs");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const T3_HOME = process.env.T3CODE_HOME || path.join(os.homedir(), ".t3");
const DB_PATH = path.join(T3_HOME, "userdata", "statev2.sqlite");
const CLI = path.join(T3_HOME, "bin", process.platform === "win32" ? "t3.cmd" : "t3");

let db = null, dbIdentity = "", checkDbAt = 0;
function getDb() {
  if (db && Date.now() < checkDbAt) return db;
  if (!fs.existsSync(DB_PATH)) throw new Error(`T3 Code data not found at ${DB_PATH}. Open T3 Code once, then try again.`);
  const stat = fs.statSync(DB_PATH), identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
  checkDbAt = Date.now() + 15000;
  if (db && identity === dbIdentity) return db;
  if (db) db.close();
  db = new DatabaseSync(DB_PATH, { readOnly: true });
  dbIdentity = identity;
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

// A thread's run status: a run still in progress outranks newer ones that ended, such as queued
// messages cancelled while the robot kept working; otherwise the newest run decides.
function listThreads(limit = 60) {
  const rows = getDb()
    .prepare(`select t.thread_id as id, t.project_id as projectId, t.title, t.updated_at as updatedAt,
                     coalesce(t.provider_instance_id, t.default_provider) as provider, p.title as projectTitle,
                     (select status from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by case when r.status in ('running','starting','preparing','waiting','awaiting_input','queued') then 0 else 1 end, r.ordinal desc limit 1) as runStatus
              from orchestration_v2_projection_threads t
              left join projection_projects p on p.project_id = t.project_id
              where t.archived_at is null and t.deleted_at is null
              order by (json_extract(t.payload_json, '$.pinnedAt') is not null) desc, t.updated_at desc limit ?`)
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
    if (/^\s*(Delegated task node:|<task-notification>|New messages the user wrote to robots)/.test(raw) || /delegated-task:command/.test(raw.slice(0, 200))) continue;
    const files = (raw.match(/^\s*-\s*(image|file):/gim) || []).length + (m?.attachments?.length || 0);
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
    .prepare(`select t.thread_id as id, t.project_id as projectId, t.title, coalesce(t.provider_instance_id, t.default_provider) as provider, t.payload_json as payload,
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
    projectId: t.projectId,
    queued,
    title: t.title,
    provider: t.provider,
    model: payload.modelSelection?.model || payload.model || null,
    effort: effortOf(payload.modelSelection?.options),
    projectTitle: t.projectTitle,
    root: payload.worktreePath || t.root,
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
const itemWatcher = require("./watch-items.cjs").createItemWatcher({ getDb, normalize, threadInfo });
function watchThread(...args) { return itemWatcher.watch(...args); }

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
  if (!fs.existsSync(CLI)) return Promise.reject(new Error("The t3 command was not found. Open T3 Code once so it installs it."));
  const l = cliLauncher();
  return runCliProcess(l.cmd, [...l.pre, ...args], { input: stdin, env: { ...process.env, ...l.env } });
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
    return `lucid-file://local/${encodeURIComponent(path.resolve(file))}?v=${st.mtimeMs}-${st.size}`;
  } catch {
    return null;
  }
}

// The project's own logo or favicon, if it has one.
const iconPaths = new Map();
function projectIcon(root, faviconPath) {
  if (!root) return null;
  const key = `${root}\0${faviconPath || ""}`, cached = iconPaths.get(key);
  if (cached && cached.until > Date.now()) {
    if (!cached.file) return null;
    const url = readIcon(cached.file);
    if (url) return url;
  }
  const found = (file) => {
    const url = file ? readIcon(file) : null;
    if (url || !file) {
      iconPaths.set(key, { file, until: Date.now() + 30000 });
      while (iconPaths.size > 256) iconPaths.delete(iconPaths.keys().next().value);
    }
    return url;
  };
  if (faviconPath) {
    const d = found(path.isAbsolute(faviconPath) ? faviconPath : path.join(root, faviconPath));
    if (d) return d;
  }
  try {
    const cfg = safeJson(fs.readFileSync(path.join(root, "t3.json"), "utf8"));
    if (cfg?.iconPath) { const d = found(path.join(root, cfg.iconPath)); if (d) return d; }
  } catch {}
  for (const c of ICON_CANDIDATES) { const d = found(path.join(root, c)); if (d) return d; }
  for (const folder of ["", "assets", "src/assets", "public", "resources/branding"]) {
    try {
      const dir = path.join(root, folder);
      const names = fs.readdirSync(dir).filter(name => /(?:^|[-_])(logo|icon)(?:[-_.]|$)/i.test(name) && /\.(svg|png|ico)$/i.test(name)).sort();
      for (const name of names) { const d = found(path.join(dir, name)); if (d) return d; }
    } catch {}
  }
  return found(null);
}

function office(projectId, limit = 6) {
  const p = getDb()
    .prepare("select project_id as id, title, workspace_root as root, favicon_path as favicon from projection_projects where project_id = ?")
    .get(projectId);
  if (!p) return null;
  const threads = getDb()
    .prepare(`select t.thread_id as id, t.title, t.updated_at as updatedAt, coalesce(t.provider_instance_id, t.default_provider) as provider,
                     (select status from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by case when r.status in ('running','starting','preparing','waiting','awaiting_input','queued') then 0 else 1 end, r.ordinal desc limit 1) as runStatus
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
function coinBindings() {
  // Archived sessions also belong in the baseline, so reopening old work
  // cannot mint coins for usage credited before manual collection existed.
  const rows = getDb().prepare(`select p.provider, p.thread_id as threadId, p.payload_json as binding,
    t.title, (select r.status from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by case when r.status in ('running','starting','preparing','waiting','awaiting_input','queued') then 0 else 1 end, r.ordinal desc limit 1) as status,
    (select count(*) from orchestration_v2_projection_runtime_requests q where q.thread_id = t.thread_id and q.status not in ('resolved','cancelled','expired','failed')) as pending
    from orchestration_v2_projection_provider_threads p join orchestration_v2_projection_threads t on t.thread_id = p.thread_id`).all();
  return rows.flatMap(r => {
    const ref = safeJson(r.binding)?.nativeThreadRef;
    return ref?.strength === 'strong' && typeof ref.nativeId === 'string'
      ? [{ harness: r.provider, sessionId: ref.nativeId, threadId: r.threadId, title: r.title, status: r.pending ? 'waiting' : r.status }] : [];
  });
}
function world(limit = 40) {
  const db = getDb();
  const rows = db
    .prepare(`select t.thread_id as id, t.project_id as projectId, t.title, t.updated_at as updatedAt, t.payload_json as payload,
                     coalesce(t.provider_instance_id, t.default_provider) as provider,
                     (select status from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by case when r.status in ('running','starting','preparing','waiting','awaiting_input','queued') then 0 else 1 end, r.ordinal desc limit 1) as runStatus,
                     (select json_extract(r.payload_json, '$.startedAt') from orchestration_v2_projection_runs r where r.thread_id = t.thread_id order by case when r.status in ('running','starting','preparing','waiting','awaiting_input','queued') then 0 else 1 end, r.ordinal desc limit 1) as runStartedAt,
                     (select count(*) from orchestration_v2_projection_runtime_requests q where q.thread_id = t.thread_id and q.status not in ('resolved','cancelled','expired','failed')) as pending
              from orchestration_v2_projection_threads t
              where t.archived_at is null and t.deleted_at is null and t.thread_id not like 'thread:%'
              order by (json_extract(t.payload_json, '$.pinnedAt') is not null) desc, t.updated_at desc`)
    .all();
  const latestActivity = itemWatcher.latestActivity(rows.map(r => r.id));
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
  const activeSelection = db.prepare("select payload_json as p from orchestration_v2_projection_runs where thread_id = ? and status in ('running','starting','preparing','waiting','awaiting_input') order by ordinal desc limit 1");
  const secretQuestion = db.prepare("select json_extract(payload_json, '$.label') as label from orchestration_v2_projection_turn_items where thread_id = ? and type = 'secret_request' and json_extract(payload_json, '$.secretStatus') = 'pending' order by ordinal desc limit 1");
  const threads = rows.map((r) => {
    r.lastItemAt = latestActivity.get(r.id);
    const p = safeJson(r.payload) || {};
    const settled = p.settledOverride === "settled" || (!!p.settledAt && !p.unsettledAt && p.settledOverride !== "unsettled");
    let question = null;
    if (r.pending > 0 || r.runStatus === "waiting" || r.runStatus === "awaiting_input") {
      const q = questionStmt.get(r.id);
      const qp = q ? safeJson(q.p) : null;
      question = qp?.questions?.map((x) => x.question).join(" ") || (approvalStmt.get(r.id) ? "Needs your approval" : "Needs your answer");
    }
    const secure = secretQuestion.get(r.id);
    if (secure) question = secure.label || 'Needs secure input';
    // Explicit completion wins over recent output. Activity is only a fallback
    // for native sessions that have no projected run state yet.
    const busy = r.runStatus === "running" || r.runStatus === "queued" || (!r.runStatus && r.lastItemAt && Date.now() - Date.parse(r.lastItemAt) < 90000);
    return {
      id: r.id, projectId: r.projectId, title: r.title, updatedAt: r.updatedAt, provider: r.provider, runStatus: busy ? "running" : r.runStatus,
      pinned: !!p.pinnedAt, settled, question, model: p.modelSelection?.model || null,
      ...require("./robot-mode.cjs").robotMode(safeJson(activeSelection.get(r.id)?.p)?.modelSelection || p.modelSelection),
      createdAt: p.createdAt, unsettledAt: p.unsettledAt, settledAt: p.settledAt,
      pinOrderKey: p.pinOrderKey ?? null, activeOrderKey: p.activeOrderKey ?? null,
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
  return { nativeEnvironmentId: fs.readFileSync(path.join(T3_HOME, "userdata", "environment-id"), "utf8").trim(), projects, threads: require('./thread-order.cjs').sortThreads(threads), models, prices: modelPrices(Object.values(models).flat()) };
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
  return require("./conversation.cjs").readConversation(getDb(), threadId, { limit }, attachmentPath).messages;
}
function conversationPage(threadId, options = {}) {
  return require("./conversation.cjs").readConversation(getDb(), threadId, options, attachmentPath);
}

// Immutable submission facts used by the settlement archive. No projection writes.
function reportFacts(threadId, withEvidence = true) {
  const db = getDb(), info = threadInfo(threadId);
  if (!info) throw new Error("This thread is no longer available.");
  const rows = db.prepare("select thread_id as id, payload_json as p from orchestration_v2_projection_threads").all();
  const family = new Set([threadId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rows) {
      const p = safeJson(r.p);
      if (p?.lineage?.relationshipToParent === "subagent" && family.has(p.lineage.parentThreadId) && !family.has(r.id)) { family.add(r.id); changed = true; }
    }
  }
  const children = rows.filter(r => r.id !== threadId && family.has(r.id)).map(r => { const p = safeJson(r.p); return { id: r.id, title: p.title, provider: p.providerInstanceId, model: p.modelSelection?.model, effort: effortOf(p.modelSelection?.options), parentThreadId: p.lineage?.parentThreadId }; });
  const sessions = [];
  for (const id of family) {
    for (const r of db.prepare("select provider, payload_json as p from orchestration_v2_projection_provider_threads where thread_id = ?").all(id)) {
      const p = safeJson(r.p);
      if (p?.nativeThreadRef?.strength === "strong") sessions.push({ harness: r.provider, sessionId: p.nativeThreadRef.nativeId, threadId: id });
    }
  }
  let page = withEvidence ? conversationPage(threadId, { limit: 200 }) : { messages: [], hasMore: false };
  let messages = page.messages;
  while (page.hasMore && page.cursor) {
    page = conversationPage(threadId, { limit: 200, before: page.cursor });
    messages = page.messages.concat(messages);
  }
  const original = db.prepare("select payload_json as p from orchestration_v2_projection_messages where thread_id = ? and role = 'user' order by created_at asc limit 1").get(threadId);
  let pendingRuns = 0, openRequests = 0;
  for (const id of family) {
    pendingRuns += db.prepare("select count(*) as n from orchestration_v2_projection_runs where thread_id = ? and status in ('running','queued','starting','preparing','waiting','awaiting_input')").get(id).n;
    openRequests += pendingRequests(id).length;
  }
  const threadPayload = safeJson(rows.find(r => r.id === threadId)?.p) || {};
  const runPayload = info.run?.id ? safeJson(db.prepare("select payload_json as p from orchestration_v2_projection_runs where run_id = ?").get(info.run.id)?.p) : null;
  const teamRows = [];
  if (withEvidence) for (const id of family) {
    const title = safeJson(rows.find(r => r.id === id)?.p)?.title || "";
    for (const run of db.prepare("select run_id as id, status, payload_json as p from orchestration_v2_projection_runs where thread_id = ? order by ordinal").all(id)) teamRows.push({ id: run.id, status: run.status, threadId: id, title, payload: safeJson(run.p) });
  }
  const team = require("./report-team.cjs").reportTeam(threadId, teamRows, effortOf);
  for (const child of children) if (!team.some(member => member.threadId === child.id)) team.push({ threadId: child.id, title: child.title, role: "Subagent", provider: child.provider, model: child.model, effort: child.effort, runIds: [] });
  const requested = runPayload?.userMessageId ? safeJson(db.prepare("select payload_json as p from orchestration_v2_projection_messages where message_id = ?").get(runPayload.userMessageId)?.p)?.text : null;
  return { ...info, provider: runPayload?.providerInstanceId || info.provider, model: runPayload?.modelSelection?.model || info.model, effort: effortOf(runPayload?.modelSelection?.options), team, pinned: !!threadPayload.pinnedAt, settled: threadPayload.settledOverride === "settled" || (!!threadPayload.settledAt && !threadPayload.unsettledAt && threadPayload.settledOverride !== "active"), settledAt: threadPayload.settledAt, originalRequest: requested || safeJson(original?.p)?.text || "", initialRequest: safeJson(original?.p)?.text || "", messages, children, sessions, pendingRuns, pendingRequests: openRequests };
}

// Messages you wrote to robots since a moment, newest last (the orchestrator learns from them).
function userMessagesSince(since, exclude) {
  return getDb()
    .prepare(`select m.thread_id as threadId, m.created_at as at, m.payload_json as p, t.title as title
              from orchestration_v2_projection_messages m left join orchestration_v2_projection_threads t on t.thread_id = m.thread_id
              where m.role = 'user' and m.created_at > ? and m.thread_id != ? and m.thread_id not like 'thread:%'
                and coalesce(json_extract(m.payload_json, '$.createdBy'), 'user') = 'user'
                and json_extract(m.payload_json, '$.senderThreadId') is null
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
  const regular = rows.map((r) => {
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
  const secrets = db.prepare("select turn_item_id as id, updated_at as at, payload_json as p from orchestration_v2_projection_turn_items where thread_id = ? and type = 'secret_request' and json_extract(payload_json, '$.secretStatus') = 'pending' order by ordinal").all(threadId);
  return [...regular, ...secrets.map(row => { const p = safeJson(row.p) || {}; return {id:row.id,type:'input',sensitive:true,label:p.label || 'Secret',detail:p.reason || '',placeholder:p.placeholder || '',questions:[],at:row.at,answerable:true,reason:null}; })];
}

// --- the orchestrator deciding questions ---------------------------------------------------

/** A short picture of a thread for the orchestrator: title, project, what was last said. */
function requestContext(threadId) {
  const db = getDb();
  const t = db.prepare(`select t.title, p.title as project from orchestration_v2_projection_threads t
                        left join projection_projects p on p.project_id = t.project_id where t.thread_id = ?`).get(threadId);
  const last = (role) => safeJson(db.prepare("select payload_json as p from orchestration_v2_projection_messages where thread_id = ? and role = ? order by created_at desc limit 1").get(threadId, role)?.p)?.text || "";
  return { title: t?.title || "", project: t?.project || "", user: last("user").slice(0, 8000), robot: last("assistant").slice(-6000) };
}

/** The orchestrator's replies since a moment, plus how its latest run is doing. */
function repliesSince(threadId, since) {
  const db = getDb();
  const messages = db.prepare("select created_at as at, streaming, payload_json as p from orchestration_v2_projection_messages where thread_id = ? and role = 'assistant' and created_at > ? order by created_at desc limit 20")
    .all(threadId, since).reverse().map((r) => ({ at: r.at, streaming: !!r.streaming, text: safeJson(r.p)?.text || "" }));
  const run = db.prepare("select status from orchestration_v2_projection_runs where thread_id = ? order by ordinal desc limit 1").get(threadId);
  const exists = !!db.prepare("select 1 from orchestration_v2_projection_threads where thread_id = ? and archived_at is null and deleted_at is null").get(threadId);
  return { messages, runStatus: run?.status || null, exists };
}

/** Whether a message containing `marker` reached a thread since a moment, and how its run went. */
function sentSince(threadId, since, marker) {
  const row = getDb().prepare(`select m.run_id as runId, r.status from orchestration_v2_projection_messages m
                               left join orchestration_v2_projection_runs r on r.run_id = m.run_id
                               where m.thread_id = ? and m.role = 'user' and m.created_at > ? and instr(m.payload_json, ?) > 0
                               order by m.created_at desc limit 1`).get(threadId, since, String(marker));
  return { sent: !!row, runStatus: row?.status || null };
}

/** The orchestrator's own thread in T3: whether it still exists, is pinned, and its latest run. */
function threadHealth(threadId) {
  const db = getDb();
  const t = db.prepare("select archived_at as archived, deleted_at as deleted, payload_json as p from orchestration_v2_projection_threads where thread_id = ?").get(threadId);
  const run = db.prepare("select status from orchestration_v2_projection_runs where thread_id = ? order by ordinal desc limit 1").get(threadId);
  return { exists: !!t && !t.archived && !t.deleted, archived: !!t?.archived, pinned: !!safeJson(t?.p)?.pinnedAt, runStatus: run?.status || null };
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

// Each live thread's own folder (T3's worktreePath), for matching jobs it left running.
function threadFolders() {
  return getDb().prepare("select thread_id as id, json_extract(payload_json, '$.worktreePath') as path from orchestration_v2_projection_threads where archived_at is null and deleted_at is null and json_extract(payload_json, '$.worktreePath') is not null").all();
}

module.exports = { sentSince, threadHealth, threadFolders, coinBindings, reportState: id => reportFacts(id, false), reportFacts, officeTasks, requestContext, repliesSince, resolvedRequestsSince, requestOutcome, pendingRequests, userMessagesSince, itemsSince, recentItems, addProject, removeProject, conversation, conversationPage, attachmentPath, world, listProjects, listProjectsWithCounts, listThreads, threadInfo, watchThread, startThread, sendMessage, office, DB_PATH };
