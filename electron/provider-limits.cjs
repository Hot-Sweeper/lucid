// T3 Code's server.getConfig provider snapshots are the same source as its
// subscription-limits UI. Preserve provider instances and every reported window.
const canonical = driver => driver === "claudeAgent" || driver === "claude-code" ? "claude" : driver;
const asIso = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

// Logs and T3 use different IDs for the same quota. Match known aliases only:
// equal durations alone do not identify the same account or model pool.
function quotaKey(limit) {
  const id = String(limit.id || "").toLowerCase().replace(/_/g, "-").replace(/^(?:codex|claude(?:agent|-code)?)[-:]/, "");
  const match = /^(weekly|seven-day|secondary|session|five-hour|primary)(?:[:.-](.+))?$/.exec(id);
  if (!match) return `id:${id}`;
  const kind = /^(weekly|seven-day|secondary)$/.test(match[1]) ? "weekly" : "session";
  const label = typeof limit.label === "string" ? /^(?:weekly|5 hour)\s*[·:]\s*(.+)$/i.exec(limit.label) : null;
  return `${kind}:${match[2] || label?.[1]?.toLowerCase() || "all"}`;
}
const known = limit => typeof limit.usedPercent === "number" && Number.isFinite(limit.usedPercent);
const expired = (limit, now) => !!limit.stale || !!(asIso(limit.resetsAt) && Date.parse(limit.resetsAt) <= now);

function mergeProviderLimits(usage, snapshot, now = Date.now()) {
  if (!snapshot) return usage;
  const limits = { ...usage.limits }, notes = [], covered = new Set();
  for (const provider of snapshot.providers || []) {
    if (!provider?.instanceId || !provider.driver) continue;
    const harness = canonical(provider.driver), data = provider.usageLimits, checkedAt = asIso(data?.checkedAt);
    const windows = (data?.windows || []).filter(w => w && typeof w.id === "string").map(w => {
      const resetsAt = asIso(w.resetsAt), tooOld = !checkedAt || now - Date.parse(checkedAt) > 10 * 60000;
      return {
        id: `${provider.instanceId}:${w.id}`, pool: provider.instanceId, label: w.label || null, labelIsComplete: true,
        usedPercent: typeof w.usedPercent === "number" && Number.isFinite(w.usedPercent) ? w.usedPercent : null,
        windowMinutes: typeof w.windowDurationMins === "number" ? w.windowDurationMins : w.kind === "weekly" ? 10080 : w.kind === "monthly" ? null : null,
        resetsAt, observedAt: checkedAt || undefined, stale: tooOld || !!(resetsAt && Date.parse(resetsAt) <= now),
        staleReason: tooOld ? "T3 reading is out of date" : undefined,
      };
    });
    // Only a single instance can safely use account-ambiguous local logs. Merge
    // into that instance instead of rendering the two sources as separate plans.
    const peers = (snapshot.providers || []).filter(p => canonical(p.driver) === harness);
    const local = usage.limits[harness];
    if (windows.length && peers.length === 1 && local) {
      const reported = new Map(windows.map((limit, index) => [quotaKey({ ...limit, id: limit.id.slice(provider.instanceId.length + 1) }), index]));
      for (const limit of local.windows || [local.primary, local.secondary].filter(Boolean)) {
        const index = reported.get(quotaKey(limit));
        if (index !== undefined) {
          const official = windows[index];
          const observed = Date.parse(limit.observedAt || local.observedAt || "");
          const usable = known(limit) && !expired(limit, now) && (limit.usedPercent >= 100 || observed >= now - 10 * 60000);
          if ((official.stale || !known(official)) && usable) {
            windows[index] = { ...official, usedPercent: limit.usedPercent, resetsAt: limit.resetsAt,
              observedAt: limit.observedAt || local.observedAt, stale: false, staleReason: undefined, source: "Local logs" };
          }
        } else if (known(limit) && limit.usedPercent >= 100) {
          windows.push({ ...limit, id: `${provider.instanceId}:${limit.id}`, pool: provider.instanceId, source: "Local logs" });
          reported.set(quotaKey(limit), windows.length - 1);
        }
      }
    }
    if (windows.length) {
      covered.add(harness);
      limits[`t3:${provider.instanceId}`] = { harness, name: provider.name || provider.instanceId, source: "T3 Code", observedAt: checkedAt || snapshot.fetchedAt || "",
        primary: windows.find(w => w.windowMinutes === 300) || windows[0], secondary: windows.find(w => w.windowMinutes === 10080) || null, windows };
    } else notes.push(`${provider.name || provider.instanceId}: ${data?.unavailable?.message || "limits unavailable in T3 Code"}`);
  }
  for (const harness of covered) limits[harness] = null;
  if (snapshot.error) notes.unshift(`${snapshot.error}${snapshot.providers?.length ? " Showing the last reported readings." : " Local log readings remain available."}`);
  return { ...usage, limits, limitSource: { source: "T3 Code", status: snapshot.error ? "cached" : "current", detail: notes.join(" ") } };
}

module.exports = { mergeProviderLimits };
