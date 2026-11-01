import type { HarnessLimits, Limit, Usage } from "../stats/stats";

export type Battery = {
  remaining: number | null;
  charging: boolean;
  name: string;
  windows: { label: string; resetsAt: number | null; startedAt: number }[];
};
const canonical = (p: string) => /^(claudeAgent|claude-code|claude)$/i.test(p) ? "claude" : p;
const timestamp = (s?: string | null) => s && Number.isFinite(Date.parse(s)) ? Date.parse(s) : null;
const label = (l: Limit) => l.label || (l.windowMinutes === 10080 ? "Weekly" : l.windowMinutes ? `${l.windowMinutes / 60} hour` : "Subscription");
const windows = (h: HarnessLimits) => h.windows?.length ? h.windows : [h.primary, h.secondary].filter((l): l is Limit => !!l);
export const UNKNOWN_BATTERY: Battery = { remaining: null, charging: false, name: "Subscription", windows: [] };

/** Quota is shared by provider instance, never by a robot's species or appearance. */
export class SubscriptionBatteries {
  private enabled = true;
  private usage: Pick<Usage, "limits"> = { limits: {} };
  private blocked = new Map<string, Map<string, { limit: Limit; startedAt: number }>>();
  private providerKeys = new Map<string, string>();
  private listeners = new Set<() => void>();
  setUsage(usage: Pick<Usage, "limits">) { this.usage = usage; for (const f of this.listeners) f(); }
  setEnabled(enabled: boolean) { if (enabled !== this.enabled) { this.enabled = enabled; for (const f of this.listeners) f(); } }
  subscribe(fn: () => void) { this.listeners.add(fn); fn(); return () => { this.listeners.delete(fn); }; }
  get(provider: string, now = Date.now()): Battery {
    if (!this.enabled) return UNKNOWN_BATTERY;
    const entries = Object.entries(this.usage.limits).filter((e): e is [string, HarnessLimits] => !!e[1]);
    const exact = entries.find(([key, h]) => key === `t3:${provider}` || windows(h).some(l => l.pool === provider));
    const fallback = entries.filter(([key, h]) => canonical(h.harness || key) === canonical(provider));
    // Legacy driver names may use a single matching account. Never guess between accounts.
    const found = exact || (fallback.length === 1 ? fallback[0] : undefined);
    const key = found?.[0] || this.providerKeys.get(provider) || provider;
    if (found) this.providerKeys.set(provider, key);
    const held = this.blocked.get(key) || new Map<string, { limit: Limit; startedAt: number }>();
    let remaining: number | null = null;
    if (found) for (const [i, l] of windows(found[1]).entries()) {
      const id = l.id || `${l.pool || key}:${i}`;
      const prior = held.get(id);
      if (prior && (timestamp(l.observedAt || found[1].observedAt) ?? 0) < (timestamp(prior.limit.observedAt) ?? 0)) continue;
      const reset = timestamp(l.resetsAt);
      const fresh = !l.stale && !(reset !== null && reset <= now) && (timestamp(l.observedAt || found[1].observedAt) ?? now) >= now - 10 * 60000;
      if (l.usedPercent !== null && Number.isFinite(l.usedPercent)) {
        if (fresh) remaining = Math.min(remaining ?? 100, Math.max(0, 100 - l.usedPercent));
        // An exhausted reading remains a blocker through an outage or reset, until
        // the provider confirms capacity. A countdown alone is not confirmation.
        if (l.usedPercent >= 100) {
          const prev = held.get(id);
          held.set(id, { limit: { ...l, observedAt: l.observedAt || found[1].observedAt }, startedAt: prev?.limit.resetsAt === l.resetsAt ? prev.startedAt : Math.min(now, timestamp(l.observedAt || found[1].observedAt) ?? now) });
        } else if (fresh) held.delete(id);
      }
    }
    this.blocked.set(key, held);
    return { remaining: held.size ? 0 : remaining, charging: held.size > 0, name: found?.[1].name || provider,
      windows: [...held.values()].map(({ limit, startedAt }) => ({ label: label(limit), resetsAt: timestamp(limit.resetsAt), startedAt })) };
  }
}

export const subscriptionBatteries = new SubscriptionBatteries();
export const batteryWeakness = (remaining: number | null) => remaining === null ? 0 : Math.max(0, Math.min(1, (30 - remaining) / 30));
export function recovery(battery: Battery, now = Date.now()) {
  if (!battery.windows.length) return { progress: null, text: "No exhausted subscriptions" };
  if (battery.windows.some(w => w.resetsAt === null)) return { progress: null, text: "Reset time unavailable" };
  const last = battery.windows.reduce((a, b) => a.resetsAt! > b.resetsAt! ? a : b);
  const seconds = Math.max(0, Math.ceil((last.resetsAt! - now) / 1000));
  if (!seconds) return { progress: 1, text: "Checking subscription availability" };
  const d = Math.floor(seconds / 86400), h = Math.floor(seconds / 3600) % 24, m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  return { progress: Math.max(0, Math.min(1, (now - last.startedAt) / Math.max(1, last.resetsAt! - last.startedAt))),
    text: `${d ? `${d}d ` : ""}${d || h ? `${h}h ` : ""}${m}m ${String(s).padStart(2, "0")}s until reset` };
}
