// Opt-in diagnostics. Disabled means no sampling loop, DOM or per-frame sample allocation.
export type System = "robots" | "apps" | "weather" | "scenery" | "camera" | "ui" | "chat";
const names: System[] = ["robots", "apps", "weather", "scenery", "camera", "ui", "chat"];
const costs = names.map(() => ({ total: 0, calls: 0, max: 0 }));
const frames = new Float32Array(600);
let enabled = false, count = 0, used = 0, next = 0, last = 0, raf = 0, paintAt = 0;
let hud: HTMLPreElement | null = null;
export function beginSystem() { return enabled ? performance.now() : -1; }
export function endSystem(system: System, start: number) {
  if (start < 0) return;
  const ms = performance.now() - start, c = costs[names.indexOf(system)];
  c.total += ms; c.calls++; if (ms > c.max) c.max = ms;
}
function reset() {
  count = used = next = last = 0;
  for (const c of costs) c.total = c.calls = c.max = 0;
}
function snapshot() {
  const sorted = Array.from(frames.subarray(0, used)).sort((a, b) => a - b);
  const mean = used ? sorted.reduce((sum, n) => sum + n, 0) / used : 0;
  return { enabled, frames: count, mean, p95: sorted[Math.floor(used * .95)] || 0,
    systems: Object.fromEntries(names.map((name, i) => [name, {
      msPerFrame: costs[i].total / Math.max(1, count), calls: costs[i].calls, max: costs[i].max,
    }])) };
}
function frame(now: number) {
  if (!enabled) return;
  if (last) { frames[next] = now - last; next = (next + 1) % frames.length; used = Math.min(used + 1, frames.length); count++; }
  last = now;
  if (hud && now - paintAt > 500) {
    paintAt = now;
    const s = snapshot();
    hud.textContent = `Frame ${s.mean.toFixed(1)} ms  p95 ${s.p95.toFixed(1)} ms\n60 fps budget: 16.7 ms\n` + names.map((n) => `${n.padEnd(8)} ${s.systems[n].msPerFrame.toFixed(2)} ms/frame`).join("\n") + "\nJS work only; paint/GPU need a trace.";
  }
  raf = requestAnimationFrame(frame);
}
function enable(on = true, overlay = false) {
  if (on !== enabled) {
    enabled = on; cancelAnimationFrame(raf); reset();
    if (enabled) raf = requestAnimationFrame(frame);
  }
  if (!on || !overlay) { hud?.remove(); hud = null; }
  else if (!hud) {
    hud = document.createElement("pre");
    hud.id = "lucid-perf";
    hud.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:10000;pointer-events:none;margin:0;padding:10px 12px;background:#141a33ee;color:#eef0ff;font:12px/1.5 monospace;white-space:pre";
    document.body.append(hud);
  }
}
if (typeof window !== "undefined") {
  (window as any).__lucidPerf = { enable, reset, snapshot };
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === "F8") { e.preventDefault(); enable(!hud, !hud); }
  });
  if (new URLSearchParams(location.search).has("perf")) window.addEventListener("DOMContentLoaded", () => enable(true, true), { once: true });
}
