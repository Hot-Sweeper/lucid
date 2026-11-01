import { diagnosticOff } from "../perf/diagnostics";
// How often robots redraw their bodies. Every robot rebuilds its arms and joints each frame,
// which is most of the app's work. Robots off screen do not need it at all, and when the camera
// is zoomed far out a robot is a few pixels tall, so fewer redraws look the same.
// Only drawing is skipped: movement, typing and timers keep running every frame.

import gsap from "gsap";

let officeCovered = false;
document.addEventListener('lucid:mobile-view', (event) => {
  const detail = (event as CustomEvent<{mobile: boolean; view: string}>).detail;
  officeCovered = !!detail?.mobile && detail.view !== 'office';
});
const visible = new WeakMap<Element, boolean>();
const owners = new WeakMap<Element, object>();
const overdue = new Set<object>(), queued = new Set<object>();
const io = typeof IntersectionObserver === "undefined" ? null
  : new IntersectionObserver((es) => { for (const e of es) visible.set(e.target, e.isIntersecting); }, { rootMargin: "120px" });

/** Start tracking whether a robot is on screen. */
export function watch(el: Element) { io?.observe(el); }
export function unwatch(el: Element) { io?.unobserve(el); visible.delete(el); const owner = owners.get(el); if (owner) { overdue.delete(owner); queued.delete(owner); } owners.delete(el); }

// Follow the visible display for movement and camera/panel tweens. Hidden windows keep
// the existing logic cadence; no extra interval or independent animation clock is needed.
// Body painting has its own unchanged per-second ceiling below.
let scale = 1;
const syncTicker = () => gsap.ticker.fps(document.hidden ? 60 : 240);
syncTicker();
document.addEventListener("visibilitychange", syncTicker);
/** The camera's zoom (1 = normal size) and position. */
export function setZoom(s: number, x = 0, y = 0) {
  scale = s;
}

const lastDraw = new WeakMap<object, number>();
const lastSlot = new WeakMap<object, number>();
const phase = new WeakMap<object, number>();
let serial = 0;
// Eight bodies and 2 ms per 60 Hz interval retain the same paint ceiling on fast
// displays. Resetting this budget for every 144 Hz tick would multiply SVG work.
const BODY_BUDGET_MS = 2;
const MAX_BODIES_PER_TICK = 8; // preserve the existing paint ceiling, which JS timing cannot measure
let tick = -1, drawn = 0, spent = 0, drawStarted = 0;
/** Should this robot redraw its body now? Spread distant SVG work across frame slots. */
export function drawNow(owner: object, el: Element, now: number, paintable = true) {
  // Visibility observers resume drawing when the actor re-enters the scene.
  if (diagnosticOff("bodies") || !paintable || document.hidden || officeCovered && !!el.closest('#scene') || visible.get(el) === false) { overdue.delete(owner); queued.delete(owner); return false; }
  if (!owners.has(el)) owners.set(el, owner);
  const budgetTick = Math.floor((now + .001) * 60 / 1000);
  if (tick !== budgetTick) {
    tick = budgetTick; drawn = 0; spent = 0;
    // Keep old debt ahead of newly due bodies. Among queued actors, draw the
    // longest-waiting first so phase offsets cannot favor one callback cohort.
    overdue.clear();
    const waiting = [...queued].sort((a, b) => (lastDraw.get(a) ?? -Number.MAX_VALUE) - (lastDraw.get(b) ?? -Number.MAX_VALUE));
    for (const next of waiting) {
      overdue.add(next);
      if (overdue.size >= MAX_BODIES_PER_TICK) break;
    }
  }
  const fps = scale < 0.3 ? 12 : scale < 0.5 ? 20 : scale < 0.75 ? 30 : 60;
  let offset = phase.get(owner);
  if (offset == null) { offset = (serial++ * .61803398875) % 1; phase.set(owner, offset); }
  const slot = Math.floor((now + .001) * fps / 1000 + offset);
  if (lastSlot.get(owner) === slot) return false;
  // Slot-gate close bodies too, so a high refresh display cannot repaint them at 144 Hz.
  // Do not mark a skipped draw complete. Old debt gets first choice next interval.
  if (drawn >= MAX_BODIES_PER_TICK || spent >= BODY_BUDGET_MS || overdue.size && !overdue.has(owner)) { queued.add(owner); return false; }
  lastSlot.set(owner, slot);
  // Keep the selected cohort for this tick even after its last member draws;
  // late ticker callbacks must not jump ahead of bodies already waiting.
  queued.delete(owner); drawn++;
  lastDraw.set(owner, now);
  drawStarted = performance.now();
  return true;
}
/** Finish one body's synchronous work, whether or not diagnostic sampling is enabled. */
export function finishDraw() { spent += Math.max(0, performance.now() - drawStarted); }
/** Seconds since this robot last drew (for its springs), capped so they stay stable. */
export function sinceDraw(owner: object, now: number, max = 0.05) {
  const l = lastDraw.get(owner);
  return l == null ? 1 / 60 : Math.min(max, Math.max(0.001, (now - l) / 1000));
}
