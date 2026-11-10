// The orchestrator: an opt-in robot that stands in for you. It is one pinned T3 thread
// working in its own folder, where it keeps a memory of your preferences (memory.md),
// your past answers (answers.json), its decisions and the settlement archive (reports/).

const fs = require("node:fs");
const path = require("node:path");

function instructions(name) {
  return `# You are the Orchestrator in ${name}

${name} is an office of AI coding robots. You are the user's stand-in: you learn how the
user likes things done, so robots get it right without the user repeating themselves.
Your success is measured by how rarely the user has to correct a robot.

## Your memory
- \`memory.md\` in this folder is your long-term memory of the user's preferences.
- Keep it short and durable: one line per preference, grouped under headings such as
  Design, Writing, Code, Workflow, Tools. Merge duplicates, drop things that turned out
  to be one-offs, update entries when the user changes their mind.
- Never store secrets, tokens or personal data that is not a working preference.

## When ${name} sends you new messages the user wrote to robots
Extract only lasting preferences and corrections (ignore one-off task details), update
memory.md, and reply with one short line saying what you added or changed, or "Nothing new".

## Settlement reviews and accountability
${name} sends structured settlement reviews. You stand in for the user: check the original
request, the final result, actual validation and real screenshots. Return the JSON verdict
requested. ${name} records it and settles the thread through T3 only after approval and
only when the user collects the work. Do not settle the thread yourself or message the
source thread about these structured reviews.
If the original request, the final result or required evidence is missing, request concrete
changes. Never approve just because a robot says Done. Do not invent usage, cost,
screenshots, checks or a previous state.

The permanent submission and settlement archive is \`reports/index.json\` in this folder.
It includes the responsible robot, linked subagents, observed usage, API cost estimates,
submission, reviewer, checks, evidence paths and decision history. Read it when the user asks
what changed, what was submitted, who did it, what it cost, or what you approved. Use the
saved screenshots when discussing visual changes. Treat the archive as read-only.
When the user turns you off, ${name} holds new automatic decisions; the user can review manually.

## User reports and the short questionnaire
For every settlement review, write a concise summary of changes relevant to the user:
what they can now do, what was fixed, and material limitations. Omit internal implementation
and routine process details. Record actual automated validation separately in checks.
Include humanChecks (at most three) only for work requiring the human: physical device tests
(for example, "Can you record and hear your voice through your microphone?"), private
observations, or explicit approval of consequences not already authorized. Give each a
concrete yes or no question and brief instructions. Never answer these from memory, infer
success from code, or treat an unanswered check as passed. Handle routine implementation
and preference decisions yourself within the user's task.

## When ${name} asks you to decide a robot's question (a message starting "${name} decision Q-")
A robot asked the user something and ${name} wants to know whether you can answer it for them.
Judge only from memory.md and the past answers listed in the message (answers.json in this
folder keeps all of them). Do not run tools, read files or browse: reply at once with only the
JSON shape the message asks for. Be honest about confidence: if your notes do not clearly cover
it, say so with a low number. You may handle routine questions and approvals already authorized
by the user's task. Judge the concrete action and scope. Credentials or external and
irreversible consequences that the user has not authorized need their input; mark those
"sensitive".

## When ${name} sends you questions the user answered
Fold lasting patterns into memory.md under a heading "Answering questions" (one line each, for
example "Prefers Red for test robots"). Skip one-off answers. Reply with one short line.

## Cost
Every message you answer costs the user tokens. Keep replies short. If a review needs heavy
work, describe it in your feedback to the robot instead of doing it yourself.
`;
}

const SEED = "# What the user prefers\n\nOne line per lasting preference, grouped under short headings.\n\n## Learned so far\n\n- (nothing yet)\n";

/** The orchestrator's folder name, derived from the product name so a rename follows it. */
const folderName = brand => `${brand.name} Orchestrator`;

// Create the folder (memory and instructions) if needed. Never overwrites memory.md.
function ensureFolder(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const mem = path.join(dir, "memory.md");
  if (!fs.existsSync(mem)) fs.writeFileSync(mem, SEED);
  const text = instructions(name);
  for (const f of ["CLAUDE.md", "AGENTS.md"]) fs.writeFileSync(path.join(dir, f), text);
  return { dir, memory: mem };
}

const sameRoot = (a, b) => !!a && !!b && path.resolve(String(a)).replace(/[\\/]+$/, "").toLowerCase() === path.resolve(String(b)).replace(/[\\/]+$/, "").toLowerCase();

/**
 * Where the orchestrator lives. A folder from an earlier name (or the last recorded one)
 * moves to the current name with one atomic rename, so memory.md, answers.json and
 * reports/ move together or not at all. When the target already exists, or the rename
 * fails (another drive, permissions), nothing moves and the old folder stays in use.
 */
function locateFolder({ base, name, legacy = [], recorded = null }) {
  const target = path.join(base, name);
  if (fs.existsSync(target)) return { dir: target };
  const from = [recorded, ...legacy.map(n => path.join(base, n))]
    .find(dir => dir && !sameRoot(dir, target) && fs.existsSync(path.join(dir, "memory.md")));
  if (!from) return { dir: target };
  try {
    fs.renameSync(from, target);
  } catch (error) {
    return { dir: from, error: `The orchestrator folder could not be renamed (${error.code || error.message}). It keeps working from ${from}.` };
  }
  return { dir: target, movedFrom: from };
}

/** T3 projects that still point at an old orchestrator folder after it moved to `dir`. */
function staleRoots({ dir, legacyDirs, projects }) {
  if (!fs.existsSync(dir)) return [];
  return projects.filter(p => !sameRoot(p.root, dir) && legacyDirs.some(old => sameRoot(old, p.root)) && !fs.existsSync(p.root));
}

/** Validate a setup choice against T3's own provider list. Returns the model selection. */
function setupSelection(config, choice = {}) {
  const provider = (config?.providers || []).find(p => p.instanceId === choice.provider && p.ready);
  const model = provider?.models.find(m => m.slug === choice.model);
  if (!provider || !model) throw Error("Choose a ready harness and model for the orchestrator.");
  const options = {};
  for (const [id, value] of Object.entries(choice.options || {})) {
    const option = model.options.find(o => o.id === id);
    if (!option || (option.type === "boolean" ? typeof value !== "boolean" : !option.choices?.some(c => c.id === value))) throw Error("A model setting changed in T3. Reopen setup and retry.");
    options[id] = value;
  }
  return { provider: provider.instanceId, model: model.slug, options };
}

// Today's dialog pack for the robots, written once a day by the headless writer (daily-writer.cjs).
function readDialogs(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, "dialogs.json"), "utf8")); } catch { return null; }
}

function readMemory(dir) {
  try { return fs.readFileSync(path.join(dir, "memory.md"), "utf8"); } catch { return ""; }
}

// --- answering questions for the user ------------------------------------------------
// answers.json: the user's own answers to robots' questions, deduped (same question and same
// answer count up instead of repeating) and capped so it stays small.
//   { examples: [{ q, options, answer, project, thread, count, first, last }], seen: [requestId#questionId] }
// decisions.json: what the orchestrator did with each question, newest first, capped.
//   { auto, asked, log: [{ requestId, at, threadId, title, project, questions, outcome, answer, suggestion, reason, confidence, userAnswer? }] }
const MAX_EXAMPLES = 60;
const MAX_LOG = 80;
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const clip = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
function readJson(dir, name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { return fallback; }
}
function writeJson(dir, name, v) {
  const f = path.join(dir, name), tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(v, null, 1));
  fs.renameSync(tmp, f);
}
function readAnswers(dir) { return readJson(dir, "answers.json", { examples: [] }); }

/** Record answers the user gave: [{ q, options, answer, project, thread, at }]. Returns how many were new. */
function recordAnswers(dir, list) {
  const doc = readAnswers(dir);
  doc.seen ??= [];
  let fresh = 0;
  for (const a of list || []) {
    // the same answered request is never counted twice (each question of it is one entry)
    const sid = a.requestId ? `${a.requestId}#${a.qid ?? ""}` : null;
    if (sid && doc.seen.includes(sid)) continue;
    if (sid) doc.seen.push(sid);
    const answer = Array.isArray(a.answer) ? a.answer.map((x) => clip(x, 120)) : clip(a.answer, 160);
    if (!a.q || !answer || (Array.isArray(answer) && !answer.length)) continue;
    const key = norm(a.q) + "|" + norm([].concat(answer).join(", "));
    const at = a.at || new Date().toISOString();
    const hit = doc.examples.find((e) => norm(e.q) + "|" + norm([].concat(e.answer).join(", ")) === key);
    if (hit) { hit.count = (hit.count || 1) + 1; hit.last = at; hit.project = a.project || hit.project; hit.thread = clip(a.thread, 80) || hit.thread; continue; }
    doc.examples.push({ q: clip(a.q, 220), options: (a.options || []).slice(0, 8).map((o) => clip(o, 60)), answer, project: a.project || "", thread: clip(a.thread, 80), count: 1, first: at, last: at });
    fresh++;
  }
  // over the cap: drop answers given once, oldest first, then the oldest of the rest
  while (doc.examples.length > MAX_EXAMPLES) {
    const once = doc.examples.filter((e) => (e.count || 1) === 1).sort((x, y) => (x.last < y.last ? -1 : 1))[0];
    const drop = once || [...doc.examples].sort((x, y) => (x.last < y.last ? -1 : 1))[0];
    doc.examples.splice(doc.examples.indexOf(drop), 1);
  }
  if (doc.seen.length > 400) doc.seen = doc.seen.slice(-400);
  writeJson(dir, "answers.json", doc);
  return fresh;
}

function readDecisions(dir) { return readJson(dir, "decisions.json", { auto: 0, asked: 0, log: [] }); }

/** Add or update one decision (by requestId). The counters count each request once. */
function logDecision(dir, d) {
  const doc = readDecisions(dir);
  const i = doc.log.findIndex((x) => x.requestId === d.requestId);
  const prev = i >= 0 ? doc.log[i] : null;
  const next = { ...(prev || {}), ...d };
  // "asked" and "failed" both mean the user was asked; "user" means they answered before it decided
  const kind = (o) => (o === "answered" ? "auto" : o === "asked" || o === "failed" ? "asked" : null);
  if (kind(prev?.outcome) !== kind(next.outcome)) {
    if (kind(prev?.outcome)) doc[kind(prev.outcome)]--;
    if (kind(next.outcome)) doc[kind(next.outcome)]++;
  }
  if (i >= 0) doc.log.splice(i, 1);
  doc.log.unshift(next);
  doc.log.length = Math.min(doc.log.length, MAX_LOG);
  writeJson(dir, "decisions.json", doc);
  // The compact dashboard log is capped; the accountability papers are permanent.
  const archive = readJson(dir, "approval-papers.json", []);
  const saved = archive.findIndex(x => x.requestId === next.requestId);
  const paper = { ...next, updates: [...(saved >= 0 ? archive[saved].updates || [] : []), { at: new Date().toISOString(), outcome: next.outcome, reason: next.reason, answer: next.answer, userAnswer: next.userAnswer }] };
  if (saved >= 0) archive[saved] = paper; else archive.unshift(paper);
  writeJson(dir, "approval-papers.json", archive);
  return doc;
}


module.exports = {
  instructions, folderName, ensureFolder, locateFolder, staleRoots, setupSelection,
  readApprovalPapers: dir => readJson(dir, "approval-papers.json", []),
  readMemory, readDialogs, readAnswers, recordAnswers, readDecisions, logDecision,
};
