// The orchestrator's folder, setup and status for the renderer. The folder name follows the
// brand; an older folder moves once (see orchestrator.cjs locateFolder) and T3's project is
// pointed at the new place through T3's own project.meta.update command.

const fs = require("node:fs");
const path = require("node:path");
const orch = require("./orchestrator.cjs");

const LEGACY = ["Lucid Orchestrator"];
const INTRO = name => `You are now the Orchestrator for ${name}. Read AGENTS.md and memory.md in this folder, then reply with two short lines: what you know about the user, and how you will help.`;

function registerOrchestrator({ ipcMain, t3, t3s, brand, base, userData, usage, shot = false, roster = () => [] }) {
  const name = orch.folderName(brand);
  const recordFile = path.join(userData, "orchestrator-folder.json");
  let record = {};
  try { record = JSON.parse(fs.readFileSync(recordFile, "utf8")) || {}; } catch {}
  const recorded = typeof record.dir === "string" ? record.dir : null;
  const located = shot ? { dir: path.join(userData, "orchestrator") } : orch.locateFolder({ base, name, legacy: LEGACY, recorded });
  const dir = located.dir;
  // Every folder it ever lived in, so T3 can be repointed even after an interrupted move.
  const legacyDirs = [...new Set([...(Array.isArray(record.previous) ? record.previous : []), recorded, located.movedFrom, ...LEGACY.map(n => path.join(base, n))].filter(d => typeof d === "string" && d && d !== dir))];
  if (!shot) try { fs.writeFileSync(recordFile, JSON.stringify({ dir, previous: legacyDirs.slice(0, 20) })); } catch {}
  // Keep the instructions current (they gain duties over time). memory.md is never touched.
  try { if (fs.existsSync(dir)) orch.ensureFolder(dir, brand.name); } catch {}

  // Point T3 projects that still name the old folder at the moved one. Idempotent: it only
  // acts on projects whose root no longer exists, and retries until T3 accepts.
  let repair = null, repairError = null, repairTimer = null;
  function repairRoots() {
    if (shot || repair) return repair || Promise.resolve();
    repair = (async () => {
      try {
        const stale = orch.staleRoots({ dir, legacyDirs, projects: t3.listProjects() });
        for (const p of stale) await t3s.dispatch({ type: "project.meta.update", projectId: p.id, workspaceRoot: dir, title: name });
        repairError = null;
        return stale.length;
      } catch (error) {
        repairError = `T3 still points at the old orchestrator folder: ${error.message || error}`;
        clearTimeout(repairTimer); repairTimer = setTimeout(() => void repairRoots(), 30_000);
      } finally { repair = null; }
    })();
    return repair;
  }

  let setup = null;
  async function init(choice = {}) {
    if (shot) throw Error("Setup is disabled in test runs.");
    if (typeof choice.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(choice.requestId)) throw Error("Reopen setup and try again.");
    const config = await t3s.hireConfig({});
    const selection = orch.setupSelection(config, choice);
    await repairRoots();
    orch.ensureFolder(dir, brand.name);
    const find = () => t3.listProjects().find(p => path.resolve(String(p.root || "")).toLowerCase() === path.resolve(dir).toLowerCase());
    let project = find();
    if (!project) { await t3.addProject({ path: dir, title: name }); project = find(); }
    if (!project) throw Error("T3 did not register the orchestrator folder as a project.");
    const payload = require("./hire-runtime.cjs").launchPayload({ project: project.id, message: INTRO(brand.name), requestId: choice.requestId, ...selection }, config.runtimeMode);
    const { threadId } = await t3s.call("orchestration.launchThread", { ...payload, title: "Orchestrator", generateTitle: false }, { timeout: 60_000 });
    let pinned = true;
    try { await t3s.dispatch({ type: "thread.pin", threadId }); } catch { pinned = false; }
    return { threadId, projectId: project.id, dir, pinned };
  }

  /** What the panel shows: where it lives, whether its T3 thread is healthy, and what it costs. */
  async function status(threadId) {
    void repairRoots();
    const out = { dir, folderError: located.error || null, repairError, thread: null, usage: null };
    if (typeof threadId !== "string" || !threadId) return out;
    try { out.thread = t3.threadHealth(threadId); } catch (error) { out.thread = { exists: false, error: String(error.message || error) }; }
    if (out.thread?.exists) {
      try {
        const sessions = t3.reportState(threadId).sessions;
        const day = new Date(); day.setHours(0, 0, 0, 0);
        const [today, week] = await Promise.all([usage.getSessionUsage(sessions, { from: day.getTime() }), usage.getSessionUsage(sessions, { from: Date.now() - 7 * 86400_000 })]);
        out.usage = { today, week };
      } catch {}
    }
    return out;
  }

  /** Usage of the orchestrator's own sessions during one stretch (a review or a question). */
  async function spent(threadId, from, to) {
    if (typeof threadId !== "string" || !Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
    try { return await usage.getSessionUsage(t3.reportState(threadId).sessions, { from, to }); } catch { return null; }
  }

  ipcMain.handle("orch:init", (_e, choice) => {
    if (!setup) setup = init(choice).finally(() => { setup = null; });
    return setup;
  });
  ipcMain.handle("orch:status", (_e, threadId) => status(threadId));
  ipcMain.handle("orch:spent", (_e, threadId, from, to) => spent(threadId, from, to));
  ipcMain.handle("orch:pin", async (_e, threadId) => {
    if (typeof threadId !== "string" || !threadId || threadId.includes("::")) throw Error("Choose the orchestrator's thread.");
    await t3s.dispatch({ type: "thread.pin", threadId });
    return true;
  });
  ipcMain.handle("orch:memory", () => orch.readMemory(dir));
  ipcMain.handle("orch:dialogs", () => orch.readDialogs(dir));
  // answering robots' questions for the user (see src/office/delegate.ts)
  ipcMain.handle("orch:answers", () => orch.readAnswers(dir));
  ipcMain.handle("orch:record", (_e, list) => orch.recordAnswers(dir, list));
  ipcMain.handle("orch:decisions", () => orch.readDecisions(dir));
  ipcMain.handle("orch:approval-papers", () => orch.readApprovalPapers(dir));
  ipcMain.handle("orch:log", (_e, d) => {
    if (!d || typeof d.requestId !== "string") throw Error("A decision needs its request.");
    const robot = roster().find(r => r.threadId === d.threadId);
    return orch.logDecision(dir, { ...d, robot: robot ? { id: robot.id, name: robot.name, provider: robot.provider, look: robot.look } : null });
  });

  return { dir, repairRoots, spent };
}

module.exports = { registerOrchestrator };
