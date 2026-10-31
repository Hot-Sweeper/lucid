const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mergeProviderLimits } = require("../electron/provider-limits.cjs");
const now = Date.parse("2026-10-31T12:00:00Z"), at = new Date(now).toISOString();
const usage = { windows: { today: { tokens: 7, costUsd: 1 } }, limits: { codex: { source: "Local logs", windows: [{ id: "old", usedPercent: 10 }] }, claude: null }, errors: [] };
const window = (id, extra = {}) => ({ id, kind: "session", label: "5 hour", usedPercent: 25, windowDurationMins: 300, resetsAt: new Date(now + 3600000).toISOString(), ...extra });

test("T3 snapshots preserve every provider instance and model window without merging equal durations", () => {
  const result = mergeProviderLimits(usage, { fetchedAt: at, providers: [
    { instanceId: "codex", driver: "codex", name: "Codex", usageLimits: { checkedAt: at, windows: [window("main"), window("model", { label: "Model pool", usedPercent: 90 })] } },
    { instanceId: "work-codex", driver: "codex", name: "Work", usageLimits: { checkedAt: at, windows: [window("main", { usedPercent: 60 })] } },
    { instanceId: "claudeAgent", driver: "claudeAgent", name: "Claude", usageLimits: { checkedAt: at, windows: [window("session"), window("weekly", { kind: "weekly", windowDurationMins: undefined })] } },
    { instanceId: "pi", driver: "pi", name: "Pi", usageLimits: { checkedAt: at, windows: [window("api", { usedPercent: null })] } },
  ] }, now);
  assert.equal(result.limits.codex, null);
  assert.equal(result.limits["t3:codex"].windows.length, 2);
  assert.equal(result.limits["t3:work-codex"].windows[0].usedPercent, 60);
  assert.notEqual(result.limits["t3:codex"].windows[0].id, result.limits["t3:work-codex"].windows[0].id);
  assert.equal(result.limits["t3:claudeAgent"].secondary.windowMinutes, 10080);
  assert.equal(result.limits["t3:pi"].windows[0].usedPercent, null);
  assert.equal(result.windows, usage.windows); assert.equal(result.limitSource.status, "current");
  assert.equal(usage.limits.codex.windows[0].id, "old", "merge does not mutate cached log totals/readings");
});

test("old and reset T3 readings remain stale, with current local readings retained", () => {
  const old = new Date(now - 20 * 60000).toISOString();
  const result = mergeProviderLimits(usage, { providers: [{ instanceId: "codex", driver: "codex", usageLimits: { checkedAt: old, windows: [window("old")] } }] }, now);
  assert.equal(result.limits.codex, usage.limits.codex);
  assert.equal(result.limits["t3:codex"].windows[0].stale, true);
  assert.match(result.limits["t3:codex"].windows[0].staleReason, /out of date/);
  const reset = mergeProviderLimits(usage, { providers: [{ instanceId: "codex", driver: "codex", usageLimits: { checkedAt: at, windows: [window("reset", { resetsAt: new Date(now - 1000).toISOString() })] } }] }, now);
  assert.equal(reset.limits["t3:codex"].windows[0].stale, true); assert.equal(reset.limits.codex, usage.limits.codex);
});

test("offline and unsupported quota sources preserve local fallback and expose their provenance", () => {
  const result = mergeProviderLimits(usage, { providers: [{ instanceId: "claudeAgent", driver: "claudeAgent", name: "Claude", usageLimits: null }], error: "T3 limits could not be refreshed." }, now);
  assert.equal(result.limits.codex, usage.limits.codex);
  assert.equal(result.limitSource.status, "cached");
  assert.match(result.limitSource.detail, /T3 limits could not be refreshed/);
  assert.match(result.limitSource.detail, /Claude/);
  assert.equal(mergeProviderLimits(usage, null), usage);
});
