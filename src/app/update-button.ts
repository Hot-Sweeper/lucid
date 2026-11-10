// The one-click update button for source checkouts and installed builds.
import { showMenu } from "../office/menus";
import { BRAND } from "../brand";
import { api, $ } from "./dom";
import type { App } from "./context";
let updateBusy: boolean = false;

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineUpdateButton(app: App) {
  app.updateTimeout = function updateTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${BRAND.name} did not answer. Close and reopen it, then retry the update.`)), milliseconds);
    })]).finally(() => clearTimeout(timer));
  };

  app.checkUpdate = async function checkUpdate() {
    if (updateBusy || app.updateChecking) return;
    app.updateChecking = true;
    const btn = $<HTMLButtonElement>("update");
    try {
      app.updateCheckError = "";
      const u = await app.updateTimeout(api.checkUpdate(), 15000);
      if (updateBusy) return;
      app.updateState = u;
      if (app.lastUpdateFailure && u.available) {
        btn.textContent = app.lastUpdateFailure.kind === 'not-ready' ? 'Changes not ready' : 'Retry update';
        btn.title = app.lastUpdateFailure.message;
        return;
      }
      app.lastUpdateFailure = null;
      const count = (u.local || 0) + (u.behind || 0);
      btn.textContent = u.available ? `Update${count ? ` (${count})` : ""}` : "Check updates";
      btn.title = [u.local ? `${u.local} changed files since the loaded build` : "", u.behind ? `${u.behind} remote commits` : "", u.legacy ? "Rebuild the current checkout" : "", ...(u.changes || []), ...(u.files || []).slice(0, 15), u.reason || (!u.available ? "You're up to date" : "Click to build and restart")].filter(Boolean).join("\n");
    } catch (err: any) {
      btn.textContent = app.updateState?.available ? "Update" : "Retry update check";
      app.updateCheckError = String(err?.message || err);
      btn.title = app.updateCheckError;
    } finally { app.updateChecking = false; }
  };
}

export function mountUpdateButton(app: App) {
  // --- one-click update --------------------------------------------------------------------
  app.updateState = null;
  app.updateChecking = false;
  app.updateCheckError = "";
  app.lastUpdateFailure = null;
  $("update").addEventListener("click", async () => {
    if (updateBusy || app.updateChecking) return;
    const btn = $<HTMLButtonElement>("update");
    if (!app.updateState?.available) {
      btn.textContent = "Checking updates";
      await app.checkUpdate();
      if (!app.updateState?.available) {
        const r = btn.getBoundingClientRect();
        showMenu(r.left, r.bottom, app.updateCheckError || app.updateState?.reason || "You're up to date", [{ label: "Check again", run: app.checkUpdate }]);
        return;
      }
    }
    updateBusy = true;
    btn.disabled = true;
    btn.textContent = "Preparing update";
    app.lastUpdateFailure = null;
    let off = () => {};
    try {
      off = api.onUpdateStep((s) => (btn.textContent = s));
      const res = await app.updateTimeout(api.applyUpdate(), 600000);
      if (!res.ok) {
        app.lastUpdateFailure = { message: res.error || "Update failed. Try again.", details: res.details || res.error || '', kind: res.kind };
        throw new Error(app.lastUpdateFailure.message);
      }
      btn.textContent = "Check updates";
      btn.title = "You're up to date";
    } catch (err: any) {
      app.lastUpdateFailure ??= { message: String(err?.message || err), details: String(err?.message || err) };
      btn.textContent = app.lastUpdateFailure.kind === 'not-ready' ? 'Changes not ready' : 'Retry update';
      btn.title = app.lastUpdateFailure.message;
      const r = btn.getBoundingClientRect();
      const details = app.lastUpdateFailure.details;
      showMenu(r.left, r.bottom, app.lastUpdateFailure.message, [{ label: "Copy error details", run: async () => {
        try { await navigator.clipboard.writeText(details); }
        catch { showMenu(r.left, r.bottom, "Could not copy the error details. Try again from the update button.", [{ label: "Close", run: () => btn.focus() }]); }
      } }], { wrapTitle: true });
    } finally {
      try { off(); } catch { /* Cleanup must not leave the update button disabled. */ }
      updateBusy = false; btn.disabled = false;
    }
  });
}
