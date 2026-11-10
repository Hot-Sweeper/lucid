import { ambientBeat, setAmbientRate, nextBeat, AMBIENT_HZ, CALM_HZ, CALM_AWAY_HZ } from "../perf/beat";
import { diagnosticOff } from "../perf/diagnostics";
import { LOD_PX, zoomForMonitorPx } from "../perf/lod";
// How often robots redraw their bodies. Every robot rebuilds its arms and joints each frame,
// which is most of the app's work. Robots off screen do not need it at all, and when the camera
// is zoomed far out a robot is a few pixels tall, so fewer redraws look the same.
// Only drawing is skipped: movement, typing and timers keep running every frame.

import gsap from "gsap";

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
/** The camera's current zoom (1 = normal size). */
export const cameraScale = () => scale;
// Calm mode: after a moment with no mouse, keys, wheel or camera movement, every background
// animation (GSAP tweens and per-frame robot/walker callbacks, robot bodies, monitors, weather)
// moves together on one beat frame in three. Idle on screen, the app redrew something on nearly
// every 144 Hz frame and kept a CPU core busy; any input or camera move restores full rate.
const CALM_AFTER_MS = 1500;
let calm = false, lastActive = performance.now(), calmRaf = 0, calmTimer = 0, lastHold = 0;
const calmRate = () => document.hasFocus() ? CALM_HZ : CALM_AWAY_HZ;
// Zoomed far out, a robot is a few pixels tall and its small movements look the same at a
// lower rate. Each ambient frame makes Chromium regroup the whole office into layers, which
// grows with the number of desks, so a large office drew far too much at the full rate.
const FAR_HZ = 30, FAR_CALM_HZ = 15;
// where a monitor is only a few pixels wide (perf/lod.ts)
const farZoom = () => zoomForMonitorPx(LOD_PX.tiny);
const ambientRate = () => {
  const base = calm ? calmRate() : AMBIENT_HZ;
  return scale < farZoom() ? Math.min(base, calm ? FAR_CALM_HZ : FAR_HZ) : base;
};
const calmListeners = new Set<(calm: boolean) => void>();
export const isCalm = () => calm;
// Asleep: calm and the window not focused (you are working elsewhere with the app beside it).
// Nothing animates and no frames are made; real changes (finished work, questions) still show,
// and hovering or focusing the app wakes everything at once.
let asleep = false;
export const isAsleep = () => asleep;
export function onCalmChange(fn: (calm: boolean) => void) { calmListeners.add(fn); return () => { calmListeners.delete(fn); }; }
const syncTicker = () => gsap.ticker.fps(document.hidden ? 60 : calm ? 1 : 240);
// Looping CSS animations (fish, bubbles, clock hands, steam in the office; spinners and pulses in
// the sidebar) make Chromium update style on every display frame: those on parts inside SVG
// drawings cannot run on the GPU at all. In calm mode they are paused and stepped to the right
// time on beat frames only, like everything else.
const decor = new Map<Animation, number>(); // animation -> timeline time at its zero
const timelineNow = () => (document.timeline?.currentTime as number | null) ?? performance.now();
function holdDecor(sceneOnly = false) {
  const now = timelineNow();
  for (const a of document.getAnimations()) {
    if (sceneOnly && !(a.effect as KeyframeEffect | null)?.target?.closest("#scene")) continue;
    // looping CSS animations only: one-shot effects and the camera's own glides finish normally
    if (a.playState !== "running" || typeof a.currentTime !== "number" || !(a instanceof CSSAnimation)) continue;
    if (a.effect?.getTiming().iterations !== Infinity) continue;
    decor.set(a, now - a.currentTime / (a.playbackRate || 1));
    a.pause();
  }
}
function stepDecor() {
  const now = timelineNow();
  for (const [a, zero] of decor) {
    if (a.playState === "idle" || !(a.effect as KeyframeEffect | null)?.target?.isConnected) { decor.delete(a); continue; }
    a.currentTime = (now - zero) * (a.playbackRate || 1);
  }
}
function releaseDecor() {
  stepDecor();
  for (const a of decor.keys()) if (a.playState === "paused") a.play();
  decor.clear();
}
// Calm frames happen only on beats: the loop sleeps in between and GSAP's own loop sleeps too,
// so Chromium has no frame to make (no style, layout or GPU frame) between beats.
function scheduleCalm() {
  if (!calm || asleep || document.hidden || calmRaf || calmTimer) return;
  // Wake just after the beat starts: waking early let the next frame land before it, which then
  // asked for one more frame, so calm still drew every frame on a 60 Hz screen.
  const now = performance.now(), wait = nextBeat(now) - now + 1;
  if (wait <= 1) calmRaf = requestAnimationFrame(calmFrame);
  else calmTimer = window.setTimeout(() => { calmTimer = 0; calmRaf = requestAnimationFrame(calmFrame); }, wait);
}
function calmFrame(t: number) {
  calmRaf = 0;
  if (!calm || asleep || document.hidden) return;
  if (ambientBeat(t)) {
    gsap.ticker.tick();
    // animations that started since (a redrawn sidebar row, a new desk) join the beat too
    if (t - lastHold > 1000) { lastHold = t; holdDecor(); }
    stepDecor();
  }
  gsap.ticker.sleep(); // new tweens may wake it; it is put back to sleep on the next beat
  scheduleCalm();
}
// GSAP wakes its own frame loop whenever a tween starts (robots start them often). While asleep
// that would bring back a frame on every refresh, so its wake is held until the app wakes up.
const tickerWake = gsap.ticker.wake.bind(gsap.ticker);
function holdTicker(hold: boolean) { (gsap.ticker as any).wake = hold ? () => {} : tickerWake; }
function syncSleep() {
  const next = calm && !document.hasFocus();
  if (next === asleep) return;
  asleep = next;
  if (asleep) {
    if (calmRaf) cancelAnimationFrame(calmRaf);
    if (calmTimer) clearTimeout(calmTimer);
    calmRaf = calmTimer = 0;
    stepDecor(); gsap.ticker.sleep(); holdTicker(true);
  } else { holdTicker(calm); if (calm) { setAmbientRate(ambientRate()); scheduleCalm(); } }
  for (const fn of calmListeners) fn(calm);
}
function setCalm(on: boolean) {
  if (on === calm) return;
  calm = on;
  if (!on && asleep) asleep = false;
  // Calm frames tick GSAP themselves on beats, so a tween starting in between (robots start
  // them often) must not restart GSAP's own loop: that brought back a frame on every vsync.
  holdTicker(on);
  setAmbientRate(ambientRate());
  syncTicker();
  if (on) holdDecor(); else releaseDecor();
  if (on) { scheduleCalm(); syncSleep(); }
  else {
    if (calmRaf) cancelAnimationFrame(calmRaf);
    if (calmTimer) clearTimeout(calmTimer);
    calmRaf = calmTimer = 0;
    gsap.ticker.wake();
  }
  for (const fn of calmListeners) fn(on);
}
/** Something moved or was touched: full frame rate for a while. */
export function markActive() {
  lastActive = performance.now();
  if (calm) setCalm(false);
}
if (typeof window !== "undefined") {
  for (const type of ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"]) window.addEventListener(type, markActive, { capture: true, passive: true });
  window.setInterval(() => { if (!calm && !document.hidden && performance.now() - lastActive > CALM_AFTER_MS) setCalm(true); }, 400);
  // asleep: hold any animation that started since, so nothing keeps the compositor ticking
  window.setInterval(() => { if (asleep && !document.hidden) holdDecor(); }, 2000);
  // working in another window with the app beside it: calmer still
  const refocus = () => { if (calm) setAmbientRate(ambientRate()); syncSleep(); };
  window.addEventListener("focus", refocus); window.addEventListener("blur", refocus);
}
syncTicker();
document.addEventListener("visibilitychange", () => { if (!document.hidden) markActive(); syncTicker(); });
// Hold looping decorations during camera motion. Robot bodies continue using the same
// visibility, cadence and paint budgets as they do when the camera is stationary.
let cameraMoving = false;
export function setCameraMoving(on: boolean) {
  if (on === cameraMoving) return;
  cameraMoving = on;
  // looping decorations (fish, bubbles, signs, spinners) hold too, as calm mode does
  if (on) holdDecor(true); else if (!calm) releaseDecor();
}
/** The camera's zoom (1 = normal size) and position. */
export function setZoom(s: number, x = 0, y = 0) {
  if (s !== scale || x !== lastX || y !== lastY) markActive();
  const crossed = (s < farZoom()) !== (scale < farZoom());
  scale = s; lastX = x; lastY = y;
  if (crossed) setAmbientRate(ambientRate());
}
let lastX = 0, lastY = 0;

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
  if (diagnosticOff("bodies") || !paintable || document.hidden || visible.get(el) === false) { overdue.delete(owner); queued.delete(owner); return false; }
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
  // Bodies draw only on ambient beat frames (perf/beat.ts), still staggered among them.
  if (!ambientBeat()) return false;
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
