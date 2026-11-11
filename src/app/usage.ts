// Usage and limits in the sidebar.
import { mountLimitsSection } from "../office/limits-section";
import { mountStats } from "../stats/stats";
import { $ } from "./dom";
import type { App } from "./context";

export function mountUsage(app: App) {
  const stats = mountStats(document.getElementById("usage-body")!, async () => {
    const u = await (window as any).lucid.usage();
    app.world.setUsage(u);
    if (u?.windows) app.wallet.observe(u);
    return u;
  }, {
    background: true,
    useResetCredit: (window as any).lucidT3?.useResetCredit ? (instanceId) => (window as any).lucidT3.useResetCredit({ instanceId }) : undefined,
    canManageProviders: async () => !!(await (window as any).lucidT3.status({}))?.scopes?.includes("providers:manage"),
    limitView: app.ui.limitView,
  });
  // Limits retains the real usage owner, but has its own saved disclosure on every layout.
  mountLimitsSection($("side-panel"), $("usage-body"), !app.folded.has("limits"), app.ui.limitView, (view) => {
    stats.setLimitView(view);
    app.ui.limitView = view;
    void app.saveSettings();
  });
}
