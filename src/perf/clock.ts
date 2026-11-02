import { renderFps, onRenderWake } from "./render";

type Clock = { owner: HTMLElement; paint: (date: Date) => void; cadence: number; last: number };
const clocks = new Set<Clock>();
let timer = 0;

function schedule() {
  if (timer || document.hidden || !clocks.size) return;
  let cadence = Infinity;
  for (const clock of clocks) {
    if (renderFps(clock.owner)) cadence = Math.min(cadence, clock.cadence);
  }
  if (!Number.isFinite(cadence)) return;
  timer = window.setTimeout(tick, cadence - Date.now() % cadence + 1);
}
function tick() {
  timer = 0;
  if (document.hidden) return;
  const date = new Date();
  for (const clock of clocks) {
    const stamp = Math.floor(date.getTime() / clock.cadence);
    if (stamp === clock.last || !renderFps(clock.owner)) continue;
    clock.last = stamp;
    try { clock.paint(date); }
    catch (error) { clocks.delete(clock); reportError(error); }
  }
  schedule();
}

/** One wall clock for cosmetic timestamps. App and supervision timers are independent. */
export function watchClock(owner: HTMLElement, paint: Clock["paint"], cadence = 60000) {
  const date = new Date();
  const clock = { owner, paint, cadence, last: Math.floor(date.getTime() / cadence) };
  paint(date);
  clocks.add(clock);
  clearTimeout(timer); timer = 0; schedule();
  return () => { clocks.delete(clock); clearTimeout(timer); timer = 0; schedule(); };
}

// Bring timestamps current immediately after the camera uncovers a desktop. The
// shared scheduler notifies only visibility changes, never each pan/zoom frame.
export function refreshClocks() { clearTimeout(timer); timer = 0; tick(); }
document.addEventListener("visibilitychange", refreshClocks);
let queued = false;
onRenderWake(() => {
  if (queued || !clocks.size) return;
  queued = true;
  queueMicrotask(() => { queued = false; refreshClocks(); });
});

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
export const clockTime = (date: Date) => time.format(date);
export const clockDate = (date: Date) => day.format(date);
