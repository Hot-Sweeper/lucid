// Prints getUsage() as JSON and times a cold and a warm call.
// Usage: node scripts/review/usage-check.cjs [--brief | --summary]
const { getUsage } = require("../../electron/usage.cjs");

(async () => {
  const brief = process.argv.includes("--brief");
  const t0 = performance.now();
  const cold = await getUsage();
  const t1 = performance.now();
  const warm = await getUsage();
  const t2 = performance.now();
  for (const [name, totals] of Object.entries(warm.windows)) {
    const projects = Object.values(totals.byProject || {});
    if (projects.reduce((sum, p) => sum + p.tokens, 0) !== totals.tokens || projects.reduce((sum, p) => sum + Math.round(p.costUsd * 1e6), 0) !== Math.round(totals.costUsd * 1e6)) throw new Error(`${name} project totals do not reconcile`);
  }
  const summary = process.argv.includes("--summary");
  const out = summary ? {
    updatedAt: warm.updatedAt,
    windows: Object.fromEntries(Object.entries(warm.windows).map(([name, t]) => [name, { tokens: t.tokens, costUsd: t.costUsd, projects: Object.keys(t.byProject).length, unassignedTokens: t.byProject.unassigned?.tokens || 0, reconciles: true }])),
    limits: Object.fromEntries(Object.entries(warm.limits).map(([h, l]) => [h, l ? { windows: l.windows?.length || 0, observedAt: l.observedAt } : null])), errors: warm.errors,
  } : brief
    ? { ...warm, windows: Object.fromEntries(Object.entries(warm.windows).map(([k, v]) => [k, { ...v, byModel: Object.fromEntries(Object.entries(v.byModel).slice(0, 6)) }])) }
    : warm;
  console.log(JSON.stringify(out, null, 2));
  console.log(`\ncold ${(t1 - t0).toFixed(0)} ms, warm ${(t2 - t1).toFixed(0)} ms, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  if (JSON.stringify(cold.windows.week.tokens) !== JSON.stringify(warm.windows.week.tokens)) console.log("note: week tokens changed between calls (logs still being written)");
})();
