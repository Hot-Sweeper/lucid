// Wires the orchestrator, the daily writer and the delegate, and their controls in the sidebar.
import { showReport, showReportArchive } from "../office/report";
import { DailyWriter } from "../office/daily-writer";
import { QuestionLine } from "../world/queue";
import { latestSourceReport } from "../office/chat-review";
import { Delegate, showDecisions } from "../office/delegate";
import { openChair } from "../office/chair";
import { Orchestrator } from "../office/orchestrator";
import { openOrchestratorControls } from "../office/orchestrator-controls";
import { openOrchestratorSetup } from "../office/orchestrator-setup";
import { renderOrchestratorPanel } from "../office/orchestrator-panel";
import { api, $ } from "./dom";
import type { App } from "./context";

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineOrchestrator(app: App) {
  app.renderOrch = function renderOrch() {
    const s = app.settings.orch;
    app.world.orchPresence = s?.paused ? (s.presence === "away" ? "away" : "sleep") : "awake";
    (app.world.ext.queue as QuestionLine | undefined)?.setPresence(app.world.orchPresence);
    // Opt-in: until it is set up, the top bar offers setup instead of a dead switch.
    const power = $<HTMLInputElement>("orch-power-toggle");
    power.disabled = !s; power.checked = !!s && !s.paused;
    power.closest<HTMLElement>("label")!.querySelector<HTMLElement>(".track")!.hidden = !s;
    $("orch-power-status").textContent = !s ? "" : s.paused ? "Off" : "On";
    $("orch-controls-open").textContent = s ? "Settings" : "Set up";
    $("orch-controls-open").setAttribute("aria-label", s ? "Orchestrator settings" : "Set up the orchestrator");
    const waiting = s && !app.currentEnvironment ? app.orch.waiting.length : 0, attention = $<HTMLButtonElement>("orch-power-attention");
    attention.hidden = !waiting;
    attention.textContent = `${waiting} for you`;
    attention.setAttribute("aria-label", `${waiting} ${waiting === 1 ? "report needs" : "reports need"} your review`);
    renderOrchestratorPanel($("orch-body"), s ?? null, app.orch, app.delegate.log, !!app.currentEnvironment, {
      setup: app.openSetup, settings: app.openControls, chair: app.takeChair, archive: () => void showReportArchive(app.openThread), chat: app.openThread,
      notebook: () => void app.orch.showNotebook(), paper: p => void showReport(p.threadId, p.title, () => app.openThread(p.threadId), p.id, app.openThread),
      decisions: () => showDecisions(app.delegate, (v) => { if (app.settings.orch) { app.settings.orch = { ...app.settings.orch, threshold: v }; app.saveSettings(); } }),
      setReview: on => app.orch.setReview(on), setAuto: on => app.orch.setAuto(on),
    });
  };

  app.openSetup = function openSetup() {
    if (app.currentEnvironment) return;
    openOrchestratorSetup(app.orch, async id => {
      await app.refresh();
      const d = app.world.deskFor(id);
      if (d) { app.world.select(d); app.world.focusOn(d); }
    });
  };

  app.openControls = function openControls() {
    openOrchestratorControls(app.orch, () => app.settings.orch ?? null, () => void showReportArchive(app.openThread), app.openSetup, () => app.takeChair());
  };

  app.takeChair = function takeChair() {
    if (app.inChair || !app.settings.orch || app.currentEnvironment) return;
    app.inChair = true;
    const before = app.settings.orch.paused ? app.settings.orch.presence ?? "sleep" : "awake";
    app.orch.setPresence("away");
    openChair({
      papers: () => app.orch.papers,
      refresh: async () => { app.orch.papers = await (api as any).reportsList(); return app.orch.papers; },
      robotFor: p => app.world.roster.robots.find(r => r.id === p.robot?.id) ?? app.world.roster.byThread(p.threadId),
      decide: async (p, action, values) => { await (api as any).reportsManual(p.id, action, values); app.orch.papers = await (api as any).reportsList(); void app.refresh(); },
      openChat: id => app.world.onSelectThread(id),
      onLeave: () => { app.inChair = false; if (app.settings.orch) app.orch.setPresence(before); },
    });
  };
}

export function mountOrchestrator(app: App) {
  app.orch = new Orchestrator(api as any, app.world, () => app.settings.orch ?? null, (s) => { app.settings.orch = s; app.saveSettings(); });
  app.dailyWriter = new DailyWriter(app.world, () => app.settings.dailyLines ?? {}, s => { app.settings.dailyLines = s; app.saveSettings(); });
  app.orch.onChange = () => {
    app.renderOrch();
    if (!document.hidden) app.renderThreads();
    if (!document.hidden && !app.currentEnvironment && app.chat.threadId && app.chat.threadId !== app.settings.orch?.threadId) app.chat.setSourceReport(latestSourceReport(app.orch.papers, app.chat.threadId));
  };
  (window as any).__orch = app.orch;
   // debug handle for test runs
  // questions go to the orchestrator first; it answers what it is sure about and passes the rest to you
  app.delegate = new Delegate(api as any, (window as any).lucidT3, () => app.settings.orch ?? null, (p) => { if (app.settings.orch) { app.settings.orch = { ...app.settings.orch, ...p }; app.saveSettings(); } });
  app.delegate.onPhase = (id, phase, text) => { app.world.bossDecision(id, phase, text); app.answer.ping(id); };
  app.delegate.onChange = () => app.renderOrch();
  (window as any).__delegate = app.delegate;
  (window as any).__chat = app.chat;
  (window as any).__refresh = () => app.refresh();
  app.renderOrch();
  $("orch-power-toggle").addEventListener("change", e => {
    const enabled = (e.target as HTMLInputElement).checked;
    app.orch.setPresence(enabled ? "awake" : "sleep");
  });
  $("orch-controls-open").addEventListener("click", () => app.settings.orch ? app.openControls() : app.openSetup());
  $("orch-power-attention").addEventListener("click", () => app.takeChair());
  // You in the orchestrator's chair: the AI orchestrator rests until you leave.
  app.inChair = false;
}
