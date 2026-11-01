// T3 Code's server.getConfig provider snapshots are the same source as its
// subscription-limits UI. Preserve provider instances and every reported window.
const canonical = driver => driver === "claudeAgent" || driver === "claude-code" ? "claude" : driver;
const asIso = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

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
    // A partial provider snapshot must not erase an exhausted local window.
    // Local logs cannot identify an account, so use them only for a single instance.
    const peers = (snapshot.providers || []).filter(p => canonical(p.driver) === harness);
    const local = usage.limits[harness];
    if (peers.length === 1 && local) {
      const reportedIds = new Set((data?.windows || []).map(w => w.id));
      for (const limit of local.windows || [local.primary, local.secondary].filter(Boolean)) {
        if (limit.usedPercent < 100 || limit.usedPercent === null || reportedIds.has(limit.id)) continue;
        windows.push({ ...limit, id: `${provider.instanceId}:${limit.id}`, pool: provider.instanceId });
      }
    }
    if (windows.length) {
      if (windows.some(w => !w.stale)) covered.add(harness);
      limits[`t3:${provider.instanceId}`] = { harness, name: provider.name || provider.instanceId, source: "T3 Code", observedAt: checkedAt || snapshot.fetchedAt || "",
        primary: windows.find(w => w.windowMinutes === 300) || windows[0], secondary: windows.find(w => w.windowMinutes === 10080) || null, windows };
    } else notes.push(`${provider.name || provider.instanceId}: ${data?.unavailable?.message || "limits unavailable in T3 Code"}`);
  }
  for (const harness of covered) limits[harness] = null;
  if (snapshot.error) notes.unshift(`${snapshot.error}${snapshot.providers?.length ? " Showing the last reported readings." : " Local log readings remain available."}`);
  return { ...usage, limits, limitSource: { source: "T3 Code", status: snapshot.error ? "cached" : "current", detail: notes.join(" ") } };
}

module.exports = { mergeProviderLimits };
