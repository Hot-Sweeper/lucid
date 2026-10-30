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

## When Lucid asks you to review a finished thread
1. Read it: \`"${cli}" thread show <thread id> --messages 6 --json\`
2. Compare the result with memory.md. Only intervene when something clearly goes against a
   remembered preference or is plainly unfinished.
3. If needed, send the robot specific, brief feedback by piping text to
   \`"${cli}" thread send <thread id> -\`
4. Reply with one line: "OK" or what you sent.

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

function readMemory(dir) {
  try { return fs.readFileSync(path.join(dir, "memory.md"), "utf8"); } catch { return ""; }
}

module.exports = { ensureFolder, readMemory };
