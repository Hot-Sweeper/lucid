// Live data from T3: thread items and info, watched threads, the periodic refresh and switching buildings.
import type { WorldData } from "../office/world";
import { mountEnvironments } from "../office/environments";
import { observeOfficeActivity } from "../leisure/botcoin";
import { api, $ } from "./dom";
import type { App } from "./context";
let refreshQueued: boolean = false;

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineRefresh(app: App) {
  app.desiredWatches = function desiredWatches() {
    const ids = app.world.campusDesks.map(row => row.id);
    if (app.world.orchThread) ids.push(app.world.orchThread);
    if (app.chat.threadId) ids.push(app.chat.threadId);
    return [...new Set(ids)].sort();
  };

  app.syncWatches = async function syncWatches() {
    if (app.watchBusy) return;
    if (app.switchingBuilding) return;
    const ids = app.desiredWatches(), key = ids.join(',');
    if (key === app.watched) return;
    const epoch = app.buildingEpoch;
    app.watchBusy = true;
    try {
      if (await api.watchSet(ids) && epoch === app.buildingEpoch) app.watched = key;
    } catch (error) { console.error('Thread watch refresh failed', error); }
    finally { app.watchBusy = false; }
  };

  app.refresh = async function refresh() {
    if (app.switchingBuilding) return;
    if (app.refreshBusy) { refreshQueued = true; return; }
    const epoch = app.buildingEpoch, environment = app.currentEnvironment;
    const current = () => !app.switchingBuilding && epoch === app.buildingEpoch && environment === app.currentEnvironment;
    app.refreshBusy = true;
    try {
      const data = await api.world();
      if (!current() || !data || data.environmentId !== environment) return;
      if (!data.environmentId) {
        // Supervision can wait on external tools. It must never hold the office
        // snapshot, camera or refresh loop hostage to a slow review request.
        void app.orch.observe(data.threads);
        void app.delegate.observe(data.threads, data.projects).catch(error => console.error('Question refresh failed', error));
      }
      app.monitorTasks.prepare(data);
      app.coinRewards?.prepare(data);
      app.threadLines.observe(data);
      if (!data.environmentId) observeOfficeActivity(data.threads, app.settings.wallet?.ledger);
      for (const p of data.projects) app.projectTitles.set(p.id, p.title);
      app.world.orchThread = data.environmentId ? '' : app.settings.orch?.threadId || '';
      app.world.update(data);
      app.paintSelectedStatus();
      if (!document.hidden) app.renderThreads();
      app.coinRewards?.render();
      // Settled work keeps no desk just to hold its coins: they are collected (and fly to the
      // counter) as soon as the thread is settled, here or in T3, and the desk is released.
      if (app.coinRewards && !data.environmentId) {
        for (const reward of [...app.wallet.rewards]) {
          const t = data.threads.find(t => t.id === reward.id);
          if (t?.settled && !t.pinned) { app.keepDesk(t.id); app.coinRewards.collect(t.id, app.world.deskFor(t.id)?.el ?? $("coin-bank"), false); }
        }
      }
      // a kept desk goes when its session is reopened or gone, or new work took that desk
      if (!data.environmentId && app.world.keptDesks.size) {
        for (const id of [...app.world.keptDesks]) {
          const t = data.threads.find(t => t.id === id);
          if (!t || !t.settled || !app.world.deskFor(id)) app.removeKeptDesk(id);
        }
      }
      app.monitorTasks.sync();
      for (const d of app.world.desks.values()) {
        d.onActivity = (t) => { if (d.threadId === app.chat.threadId) app.pushStatus(d); };
      }
      void app.syncWatches();
      if (app.firstLoad) {
        app.firstLoad = false;
        const want = new URLSearchParams(location.search).get("thread");
        const d = want ? app.world.deskFor(want) : null;
        if (d) { app.world.select(d); requestAnimationFrame(() => { if (current()) app.world.showDesk(d); }); }
        else requestAnimationFrame(() => { if (current()) app.world.overview(); });
      }
    } catch (err) {
      console.error("world refresh failed", err, String((err as any)?.stack || "").split("\n").slice(1, 3).join(" < "));
    } finally {
      app.refreshBusy = false;
      // Coalesce actions made during a refresh into one immediate follow-up.
      if (refreshQueued) { refreshQueued = false; void app.refresh(); }
    }
  };

  app.selectBuilding = async function selectBuilding(id: string) {
    if (app.switchingBuilding) throw Error('Another building is still opening.');
    app.buildingCameras.set(app.currentEnvironment || 'local', app.world.cameraState());
    app.switchingBuilding = true; app.buildingEpoch++;
    try {
      const building = await (api as any).selectEnvironment(id) as { label: string; local: boolean; world: WorldData };
      app.chat.close(); app.world.unfocus(); app.world.revealThread(null);
      app.currentEnvironment = building.local ? undefined : id;
      app.watched = '';
      app.world.orchThread = building.local ? app.settings.orch?.threadId || '' : '';
      app.monitorTasks.prepare(building.world);
      app.world.update(building.world);
      app.coinRewards?.render();
      app.monitorTasks.sync();
      app.world.building = building.label;
      const label = app.world.root.querySelector(".building-plate b");
      if (label) label.textContent = building.label;
      const saved = app.buildingCameras.get(app.currentEnvironment || 'local');
      if (saved) app.world.restoreCamera(saved); else app.world.overview();
    } finally { app.switchingBuilding = false; }
    await app.refresh();
  };
}

export function wireLiveData(app: App) {
  // --- live data -------------------------------------------------------------------------
  api.onItems(({ threadId, items, initial }) => { app.world.activityDeskFor(threadId)?.director.push(items, initial); app.chat.ping(threadId); app.answer.ping(threadId); });
  api.onInfo(({ threadId, info }) => {
    const d = app.world.activityDeskFor(threadId);
    if (info.error) return;
    if (d) {
      d.setInfo(info);
    }
    if (app.chat.threadId === threadId) {
      if (d && !d.el.classList.contains("arriving")) app.pushStatus(d);
      else app.openDetachedChat(threadId, info);
    }
  });
  app.watched = "";
  // Later refreshes pick up any change made while a watch update was in flight.
  app.watchBusy = false;
  app.world.onCampusChange = () => { void app.syncWatches(); };
  app.firstLoad = true;
  app.refreshBusy = false;
  app.buildingEpoch = 0;
  app.switchingBuilding = false;

  app.buildingCameras = new Map<string, { x: number; y: number; s: number }>();
}

export function mountBuildings(app: App) {
  // A read on the campus can change a computer's link state; the signs follow it right away.
  const buildings = mountEnvironments($("environment-body"), (fresh) => (api as any).environments(fresh), app.selectBuilding,
    data => app.world.setBuildings(data.buildings, app.selectBuilding, id => (api as any).buildingWorld(id), () => void buildings.refresh()));
  // T3 Code linked, removed or disabled a computer.
  (api as any).onEnvironmentsChanged?.(() => void buildings.refresh(true));
}
