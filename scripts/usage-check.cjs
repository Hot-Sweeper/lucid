// Prints getUsage() as JSON and times a cold and a warm call.
// Usage: node scripts/usage-check.cjs [--brief]
const { getUsage } = require("../electron/usage.cjs");

(async () => {
  const brief = process.argv.includes("--brief");
  const t0 = performance.now();
  const cold = await getUsage();
  const t1 = performance.now();
  const warm = await getUsage();
  const t2 = performance.now();
  const out = brief
    ? { ...warm, windows: Object.fromEntries(Object.entries(warm.windows).map(([k, v]) => [k, { ...v, byModel: Object.fromEntries(Object.entries(v.byModel).slice(0, 6)) }])) }
    : warm;
  console.log(JSON.stringify(out, null, 2));
  console.log(`\ncold ${(t1 - t0).toFixed(0)} ms, warm ${(t2 - t1).toFixed(0)} ms, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  if (JSON.stringify(cold.windows.week.tokens) !== JSON.stringify(warm.windows.week.tokens)) console.log("note: week tokens changed between calls (logs still being written)");
})();
