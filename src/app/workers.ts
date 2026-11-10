// Workers up close: a robot's profile and the staff wall.
import { openCustomize } from "../office/customize";
import { openWorkerFocus, openStaffWall } from "../office/worker-focus";
import { robotFocus } from "../office/interact";
import { hasOfficeWork } from "../office/room-policy";
import type { RobotProfile } from "../robot";
import type { App } from "./context";

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineWorkers(app: App) {
  app.openWorkerProfile = function openWorkerProfile(r: RobotProfile, anchor: Element | null) {
    const t = r.threadId ? app.world.lastData?.threads.find(t => t.id === r.threadId) : null;
    const free = app.world.roster.freeTeam(app.settledNow()).includes(r);
    const job = t && !t.settled ? { title: t.title, status: t.question ? "Needs your answer" : hasOfficeWork(t) ? "Working on" : app.orch.approvedPaper(t.id) ? "Ready to collect" : app.world.reports.has(t.id) ? "Waiting for review" : "Finished" } : null;
    const projectId = t?.projectId || app.world.lastData?.projects.find(p => !p.scratch)?.id || "";
    const view = openWorkerFocus({
      robot: r, anchor, job, free,
      loadRuntime: () => (window as any).lucidT3.hireConfig({ projectId }),
      onOpenChat: t ? () => app.world.onSelectThread(t.id) : undefined,
      onCustomize: () => openCustomize({ name: r.name, provider: r.provider, look: r.look, onSave: (look, name) => { app.world.roster.setLook(r.id, look); app.world.roster.rename(r.id, name); view.refresh(); if (app.world.lastData) app.world.update(app.world.lastData); } }),
      onRetrain: (provider, model) => { app.world.roster.retrain(r.id, provider, model, app.settledNow()); if (app.world.lastData) app.world.update(app.world.lastData); },
      onRetire: () => { app.world.roster.retire(r.id, app.settledNow()); void app.refresh(); },
      onStaffWall: () => app.openWall(),
    });
  };

  app.openWall = function openWall() {
    openStaffWall({ robots: app.world.roster.robots, onFocus: r => app.openWorkerProfile(r, null), onRehire: r => { app.world.roster.rehire(r.id); void app.refresh(); } });
  };
}

export function mountWorkers(app: App) {
  // --- workers up close --------------------------------------------------------------------
  app.settledNow = () => new Set((app.world.lastData?.threads ?? []).filter(t => t.settled && !t.pinned).map(t => t.id));
  app.world.onRobotFocus = (threadId, anchor) => { const r = app.world.roster.byThread(threadId); if (r) app.openWorkerProfile(r, anchor); };
  robotFocus.open = (id, el) => { const r = app.world.roster.byThread(id); if (!r) return false; app.openWorkerProfile(r, el); return true; };
}
