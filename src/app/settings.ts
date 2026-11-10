// Loading the saved settings into the office and saving them back (debounced through the bridge).
import { movableRoom } from "../office/room-order";
import { api, esc, $ } from "./dom";
import type { App } from "./context";
let settingsWriteFlight: Promise<void> = Promise.resolve();

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineSettings(app: App) {
  app.renderHidden = function renderHidden() {
    const box = $("hidden-offices");
    const ids = [...app.world.hidden];
    box.hidden = !ids.length;
    box.innerHTML = ids.length ? `<h3>Hidden offices</h3>${ids.map((id) => `<button type="button" class="link-btn" data-show="${id}">Show ${esc(app.projectTitles.get(id) || "office")}</button>`).join("")}` : "";
  };
}

export function loadSettings(app: App) {
  app.settings = (() => { try { return JSON.parse(api.settingsLoad() || "{}"); } catch { return {}; } })();
  // Keys of removed features (company levels, milestones, the managers group).
  for (const key of ["level", "milestones", "nightRuns"]) delete (app.settings as Record<string, unknown>)[key];
  app.world.hidden = new Set(app.settings.hidden ?? []);
  app.world.keptDesks = new Set(app.settings.keptDesks ?? []);
  app.world.roomOrder = Array.isArray(app.settings.roomOrder) ? app.settings.roomOrder.filter((id) => typeof id === "string" && movableRoom(id)) : [];
  app.world.collapsedRooms = new Set(app.settings.collapsedRooms ?? []);
  app.world.expandedRooms = new Set(Array.isArray(app.settings.expandedRooms) ? app.settings.expandedRooms.filter((id) => typeof id === "string") : []);
  app.world.extra = new Map(Object.entries(app.settings.extra ?? {}));
  app.world.themes = new Map(Object.entries(app.settings.themes ?? {}));
  app.world.homes = new Map(Object.entries(app.settings.homes ?? {}));
  app.world.seats = new Map(Object.entries(app.settings.seats ?? {}).filter(([, seats]) => Array.isArray(seats)));
  app.world.restoreLayouts(app.settings.buildingLayouts ?? {});
}

export function wireSettings(app: App) {
  app.saveSettings = () => {
    app.settings.buildingLayouts = app.world.exportLayouts();
    const local = app.settings.buildingLayouts.local;
    if (local) Object.assign(app.settings, local);
    const json = JSON.stringify(app.settings);
    const write = settingsWriteFlight.then(() => api.settingsSave(json));
    settingsWriteFlight = write.catch(() => {});
    app.renderHidden();
    return write;
  };
  app.world.onLayoutChange = app.saveSettings;
  app.world.onRoomOrder = () => { app.saveSettings(); app.world.onRooms(app.world.rooms); };
  $("hidden-offices").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-show]") as HTMLElement | null;
    if (!b) return;
    app.world.hidden.delete(b.dataset.show!);
    app.saveSettings();
    void app.refresh();
  });
}
