// The orchestrator: a robot that stands in for you. It keeps a memory of your
// preferences in memory.md and, when you turn reviews on, checks finished work
// against that memory and gives robots feedback through the t3 CLI.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const T3_HOME = process.env.T3CODE_HOME || path.join(os.homedir(), ".t3");
const CLI = path.join(T3_HOME, "bin", process.platform === "win32" ? "t3.cmd" : "t3");

function instructions(cli) {
  return `# You are the Orchestrator in Lucid

Lucid is an office of AI coding robots. You are the user's stand-in: you learn how the
user likes things done, so robots get it right without the user repeating themselves.
Your success is measured by how rarely the user has to correct a robot.

## Your memory
- \`memory.md\` in this folder is your long-term memory of the user's preferences.
- Keep it short and durable: one line per preference, grouped under headings such as
  Design, Writing, Code, Workflow, Tools. Merge duplicates, drop things that turned out
  to be one-offs, update entries when the user changes their mind.
- Never store secrets, tokens or personal data that is not a working preference.

## When Lucid sends you new messages the user wrote to robots
Extract only lasting preferences and corrections (ignore one-off task details), update
memory.md, and reply with one short line saying what you added or changed, or "Nothing new".

## Settlement papers and accountability
Lucid sends structured settlement reviews. You stand in for the user: check the original
request, the final result, actual validation and real screenshots. Return the JSON verdict
requested by Lucid. Lucid records it and settles the thread through T3 only after approval.
Do not settle the thread yourself or send duplicate feedback on these structured reviews.
If the result or required evidence is missing, request concrete changes. Never approve just
because a robot says Done. Do not invent usage, cost, screenshots, or a previous state.

The permanent submission and settlement archive is \`reports/index.json\` in this folder.
It includes the responsible robot, linked subagents, observed usage, API cost estimates,
submission, reviewer, checks, evidence paths and decision history. Read it when the user asks
what changed, what was submitted, who did it, what it cost, or what you approved. Use the
saved screenshots when discussing visual changes. Treat the archive as read-only.
Respect pause: Lucid holds new automatic decisions while paused. The user can review manually.

## User reports and human questionnaire
For every settlement review, write a concise summary of changes relevant to the user:
what they can now do, what was fixed, and material limitations. Omit internal implementation
and routine process details. Record actual automated validation separately in checks.
Include humanChecks only for work requiring the human: physical device tests (for example,
"Can you record and hear your voice through your microphone?"), private observations,
or explicit approval of consequences not already authorized. Give each a concrete question
and brief instructions. Never answer these from memory, infer success from code, or treat
an unanswered check as passed. Use decision manual while any human check is required.
Handle routine implementation and preference decisions yourself within the user's task.

## When Lucid asks for the daily dialog pack
Write \`dialogs.json\` in this folder exactly in the shape Lucid asks for, with short, kind,
funny lines for the robots to say to each other. Write the file directly; do not read code,
run commands or browse. Reply with one line.

## When Lucid asks you to decide a robot's question (a message starting "Lucid decision Q-")
A robot asked the user something and Lucid wants to know whether you can answer it for them.
Judge only from memory.md and the past answers listed in the message (answers.json in this
folder keeps all of them). Do not run tools, read files or browse: reply at once with only the
JSON shape the message asks for. Be honest about confidence: if your notes do not clearly cover
it, say so with a low number. You may handle routine questions and approvals already authorized by the user's task. Judge
the concrete action and scope. Credentials or external and irreversible consequences that
the user has not authorized need their input; mark those "sensitive".

## When Lucid sends you questions the user answered
Fold lasting patterns into memory.md under a heading "Answering questions" (one line each, for
example "Prefers Red for test robots"). Skip one-off answers. Reply with one short line.

## Cost
You run on a smaller model on purpose. If a review needs heavy work, describe it in your
feedback to the robot instead of doing it yourself. Prefer smaller models for helpers.
`;
}

function seedMemory() {
  const lines = ["# What the user prefers", "", "## Seeded from the user's own preference notes", ""];
  try {
    const skill = fs.readFileSync(path.join(os.homedir(), ".agents", "skills", "things-i-hate", "SKILL.md"), "utf8");
    for (const l of skill.split(/\r?\n/)) if (/^- /.test(l)) lines.push(l.length > 260 ? l.slice(0, 257) + "..." : l);
  } catch {
    lines.push("- (nothing yet)");
  }
  lines.push("", "## Learned in Lucid", "");
  return lines.join("\n") + "\n";
}

// Create the orchestrator's folder (memory + instructions) if needed.
function ensureFolder(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const mem = path.join(dir, "memory.md");
  if (!fs.existsSync(mem)) fs.writeFileSync(mem, seedMemory());
  const text = instructions(CLI);
  for (const f of ["CLAUDE.md", "AGENTS.md"]) fs.writeFileSync(path.join(dir, f), text);
  return { dir, memory: mem };
}

// Today's dialog pack, written by the orchestrator once a day (see Orchestrator.daily in the app).
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

module.exports = { readApprovalPapers: dir => readJson(dir, "approval-papers.json", []), ensureFolder, readMemory, readDialogs, readAnswers, recordAnswers, readDecisions, logDecision };
