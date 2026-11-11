const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mergeProviderLimits } = require("../../electron/provider-limits.cjs");
const now = Date.parse("2026-10-31T12:00:00Z"), at = new Date(now).toISOString();
const usage = { windows: { today: { tokens: 7, costUsd: 1 } }, limits: { codex: { source: "Local logs", windows: [{ id: "old", usedPercent: 10, observedAt: at }] }, claude: null }, errors: [] };
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

test("stale T3 readings use the local fallback in the same provider group", () => {
  const old = new Date(now - 20 * 60000).toISOString();
  const result = mergeProviderLimits(usage, { providers: [{ instanceId: "codex", driver: "codex", usageLimits: { checkedAt: old, windows: [window("old")] } }] }, now);
  assert.equal(result.limits.codex, null);
  assert.equal(result.limits["t3:codex"].windows[0].stale, false);
  assert.equal(result.limits["t3:codex"].windows[0].usedPercent, 10);
  assert.equal(result.limits["t3:codex"].windows[0].source, "Local logs");
  const reset = mergeProviderLimits(usage, { providers: [{ instanceId: "codex", driver: "codex", usageLimits: { checkedAt: at, windows: [window("reset", { resetsAt: new Date(now - 1000).toISOString() })] } }] }, now);
  assert.equal(reset.limits["t3:codex"].windows[0].stale, true); assert.equal(reset.limits.codex, null);
});

test("an old T3 reading without local logs stays visible as stale, with the reason the card shows", () => {
  const old = new Date(now - 20 * 60000).toISOString();
  const result = mergeProviderLimits({ limits: {} }, { providers: [{ instanceId: "codex", driver: "codex", name: "Codex", usageLimits: { checkedAt: old, windows: [window("weekly", { usedPercent: 40 })], resetCredits: { availableCount: 1, nextExpiresAt: null } } }] }, now);
  const w = result.limits["t3:codex"].windows[0];
  assert.equal(w.stale, true);
  assert.equal(w.staleReason, "T3 reading is out of date");
  assert.equal(w.usedPercent, 40, "the old value is kept, but the card never shows it as current");
  assert.deepEqual(result.limits["t3:codex"].resetCredits, { availableCount: 1, nextExpiresAt: null }, "credits stay usable while the reading is stale");
});

test("offline and unsupported quota sources preserve local fallback and expose their provenance", () => {
  const result = mergeProviderLimits(usage, { providers: [{ instanceId: "claudeAgent", driver: "claudeAgent", name: "Claude", usageLimits: null }], error: "T3 limits could not be refreshed." }, now);
  assert.equal(result.limits.codex, usage.limits.codex);
  assert.equal(result.limitSource.status, "cached");
  assert.match(result.limitSource.detail, /T3 limits could not be refreshed/);
  assert.match(result.limitSource.detail, /Claude/);
  assert.equal(mergeProviderLimits(usage, null), usage);
});

test("weekly log aliases and cached T3 windows render once per actual quota", () => {
  const resetsAt = new Date(now + 86400000).toISOString(), old = new Date(now - 20 * 60000).toISOString();
  const local = { limits: {
    claude: { windows: [{ id: 'seven_day', usedPercent: 100, windowMinutes: 10080, resetsAt, observedAt: at }] },
    codex: { windows: [{ id: 'codex:secondary', usedPercent: 100, windowMinutes: 10080, resetsAt, observedAt: at }] },
  } };
  const providers = [
    { instanceId: 'claudeAgent', driver: 'claudeAgent', usageLimits: { checkedAt: old, windows: [
      window('weekly', { label: 'Weekly', kind: 'weekly', windowDurationMins: 10080, usedPercent: null, resetsAt }),
      window('weekly:fable', { label: 'Weekly · Fable', kind: 'weekly', windowDurationMins: 10080, usedPercent: null, resetsAt }),
    ] } },
    { instanceId: 'codex', driver: 'codex', usageLimits: { checkedAt: old, windows: [window('weekly', { label: 'Weekly', windowDurationMins: 10080, resetsAt })] } },
  ];
  const result = mergeProviderLimits(local, { providers }, now);
  assert.equal(result.limits.claude, null); assert.equal(result.limits.codex, null);
  assert.equal(result.limits['t3:claudeAgent'].windows.length, 2, 'weekly and Fable are distinct, without a duplicate weekly plan');
  assert.equal(result.limits['t3:codex'].windows.length, 1);
  assert.equal(result.limits['t3:claudeAgent'].windows[0].usedPercent, 100);
  assert.equal(result.limits['t3:claudeAgent'].windows[1].usedPercent, null, 'overall quota must not invent Fable usage');
  assert.equal(result.limits['t3:codex'].windows[0].usedPercent, 100);
  providers[0].usageLimits.checkedAt = at;
  providers[0].usageLimits.windows[0].usedPercent = 12;
  assert.equal(mergeProviderLimits(local, { providers }, now).limits['t3:claudeAgent'].windows[0].usedPercent, 12, 'current provider reading supersedes local exhaustion');
  local.limits.codex.windows[0].resetsAt = new Date(now - 1000).toISOString();
  assert.equal(mergeProviderLimits(local, { providers }, now).limits['t3:codex'].windows[0].stale, true, 'expired local usage cannot make a stale quota current');
});

test("ambiguous local logs never become another account's quota", () => {
  const exhausted = { limits: { codex: { windows: [{ id: 'codex:secondary', usedPercent: 100 }] } } };
  const provider = instanceId => ({ instanceId, driver: 'codex', usageLimits: { checkedAt: at, windows: [window('weekly', { windowDurationMins: 10080, usedPercent: 20 })] } });
  const result = mergeProviderLimits(exhausted, { providers: [provider('personal'), provider('work')] }, now);
  assert.equal(result.limits.codex, null);
  for (const key of ['t3:personal', 't3:work']) {
    assert.equal(result.limits[key].windows.length, 1);
    assert.equal(result.limits[key].windows[0].usedPercent, 20);
  }
});

test("banked reset credits travel with their provider instance", () => {
  const expires = new Date(now + 21 * 86400000).toISOString();
  const result = mergeProviderLimits(usage, { providers: [
    { instanceId: "codex", driver: "codex", name: "Codex", usageLimits: { checkedAt: at, windows: [window("weekly", { kind: "weekly", windowDurationMins: 10080 })], resetCredits: { availableCount: 2, nextExpiresAt: expires } } },
    { instanceId: "claudeAgent", driver: "claudeAgent", usageLimits: { checkedAt: at, windows: [window("session")] } },
  ] }, now);
  assert.deepEqual(result.limits["t3:codex"].resetCredits, { availableCount: 2, nextExpiresAt: expires });
  assert.equal(result.limits["t3:codex"].instanceId, "codex", "the reset RPC needs the instance id");
  assert.equal(result.limits["t3:claudeAgent"].resetCredits, undefined, "no credits reported means none shown");
});
