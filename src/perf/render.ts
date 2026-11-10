import { ambientBeat, nextBeat } from "./beat";
import { isAsleep, onCalmChange } from "../world/budget";
import { diagnosticOff, onDiagnosticsChange } from "./diagnostics";
import { setScreenDetail, releaseScreenDetail } from "./screen-detail";
import { beginSystem, endSystem } from "./metrics";
import { screenFrameRate } from "./screen-budget";

// One clock for screen apps. Geometry arrives from the camera/IntersectionObserver, never
// from layout reads in a draw callback. Logical events and real thread data keep running.
type Surface = { visible: boolean; detailVisible?: boolean; fps: number; scale: number; phase: number; explicit: boolean; refs: number; el: HTMLElement; width?: number; logicalWidth?: number; dpr?: number };
type Loop = { owner?: HTMLElement; surface?: Surface; win: HTMLElement | null; parent: HTMLElement | null; cb: (now: number, dt: number) => void; last: number; due: number; fps: number; density: number; once: boolean; bound: boolean; stop: () => void };
const surfaces = new WeakMap<HTMLElement, Surface>();
const loops = new Set<Loop>();
const wakeListeners = new Set<() => void>();
export function onRenderWake(callback: () => void) { wakeListeners.add(callback); return () => { wakeListeners.delete(callback); }; }
const contexts = new WeakMap<HTMLElement, { host: HTMLElement; win: HTMLElement | null; parent: HTMLElement | null; connected: boolean }>();
let officeCovered = false;
const coveredOwner = (owner?: HTMLElement) => officeCovered && !!owner?.closest('#scene');
window.addEventListener('lucid:mobile-view', (event) => {
  const detail = (event as CustomEvent<{mobile: boolean; view: string}>).detail;
  officeCovered = !!detail?.mobile && detail.view !== 'office';
  wakeRender();
});
let raf = 0;
let surfaceSequence = 0;
let timer = 0;
const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
  let visibilityChanged = false;
  for (const e of entries) {
    const s = surfaces.get(e.target as HTMLElement);
    if (s && !s.explicit) {
      visibilityChanged ||= s.visible !== e.isIntersecting;
      s.visible = e.isIntersecting; s.fps = screenFrameRate(e.boundingClientRect.width);
      // Observer delivery is outside drawing. A standalone/phone surface supplies
      // its logical width here; draw callbacks never force a layout measurement.
      const logicalWidth = e.isIntersecting ? s.el.clientWidth : 0;
      setScreenDetail(s.el, s.visible, e.boundingClientRect.width, logicalWidth);
      if (logicalWidth > 0) s.scale = e.boundingClientRect.width / logicalWidth;
    }
  }
  wake();
  if (visibilityChanged) for (const callback of wakeListeners) callback();
});
function surface(el: HTMLElement) {
  let s = surfaces.get(el);
  if (!s) { s = { visible: !io, fps: 60, scale: 1, phase: (++surfaceSequence * .61803398875) % 1, explicit: false, refs: 0, el }; surfaces.set(el, s); io?.observe(el); }
  return s;
}
/** visible: the screen's apps should run. detailVisible: the screen is in view, so its
 * zoomed-out preview must exist even while the apps are paused (a robot away from its desk);
 * otherwise that monitor shows its text-less raw window, a dark screen beside lit ones. */
export function setRenderView(el: HTMLElement, visible: boolean, screenWidth: number, logicalWidth = 820, detailVisible = visible) {
  const s = surface(el), dpr = window.devicePixelRatio || 1;
  // Pure translation leaves the monitor's rendering inputs unchanged. The detail
  // controller keeps observing new windows/content, so it needs no camera replay.
  // A zero logical width requests DOM-derived sizing and must still be resolved.
  if (s.explicit && logicalWidth > 0 && s.visible === visible && s.detailVisible === detailVisible && s.width === screenWidth && s.logicalWidth === logicalWidth && s.dpr === dpr) return;
  const fps = screenFrameRate(screenWidth);
  const appeared = visible && (!s.explicit || !s.visible);
  const visibilityChanged = appeared || s.visible !== visible;
  setScreenDetail(el, detailVisible, screenWidth, logicalWidth);
  s.detailVisible = detailVisible;
  const changed = !s.explicit || s.visible !== visible || s.fps !== fps;
  const scale = screenWidth / logicalWidth, densityChanged = s.scale !== scale || s.dpr !== dpr;
  const logicalChanged = s.logicalWidth !== logicalWidth;
  s.explicit = true; s.visible = visible; s.fps = fps;
  s.width = screenWidth; s.logicalWidth = logicalWidth; s.dpr = dpr;
  if (Number.isFinite(scale) && scale > 0) s.scale = scale;
  if (changed) {
    el.classList.toggle("render-paused", !visible);
    el.dataset.renderFps = String(visible ? fps : 0);
    wake();
  }
  else if (densityChanged || logicalChanged) wake();
  if (visibilityChanged) for (const callback of wakeListeners) callback();
}
export function releaseRenderView(el: HTMLElement) { releaseScreenDetail(el); io?.unobserve(el); surfaces.delete(el); }
export function wakeRender() { wake(); for (const callback of wakeListeners) callback(); }
function contextFor(owner: HTMLElement) {
  let context = contexts.get(owner);
  if (!context || !context.connected && owner.isConnected || context.parent !== owner.parentElement || !context.host.contains(owner) || context.win && !context.win.contains(owner)) {
    context = { host: owner.closest<HTMLElement>(".screen, .phone-screen") ?? owner, win: owner.closest<HTMLElement>(".win"), parent: owner.parentElement, connected: owner.isConnected };
    contexts.set(owner, context);
  }
  else context.connected = owner.isConnected;
  return context;
}
export function renderFps(owner: HTMLElement) {
  if (diagnosticOff("screens") || document.hidden || !owner.isConnected || coveredOwner(owner)) return 0;
  const context = contextFor(owner);
  const s = surfaces.get(context.host);
  return context.win?.dataset.renderHidden === "1" || s?.visible === false ? 0 : s?.fps ?? 60;
}
/** Physical pixels per app coordinate, using camera/observer data rather than layout. */
export function renderPixelRatio(owner?: HTMLElement) {
  const dpr = Math.max(.1, window.devicePixelRatio || 1);
  if (!owner) return dpr;
  const host = contextFor(owner).host;
  return (surfaces.get(host)?.scale ?? 1) * dpr;
}
export function pixelRatioBucket(required: number) {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(required, 1 / 1024)) * 4) / 4);
}
export function presentationFrame(owner: HTMLElement) {
  const fps = renderFps(owner);
  return new Promise<void>((resolve) => setTimeout(resolve, fps ? 1000 / fps : 250));
}
export function renderLoop(owner: HTMLElement | undefined, cb: Loop["cb"], once = false) {
  const host = once ? owner : owner?.closest<HTMLElement>(".screen, .phone-screen") ?? owner;
  const s = host ? surface(host) : undefined;
  if (s) s.refs++;
  const stop = () => {
    if (!loops.delete(loop)) return;
    const current = loop.surface;
    if (current && --current.refs === 0 && !current.explicit) { io?.unobserve(current.el); surfaces.delete(current.el); }
    if (!loops.size) cancelFrame();
  };
  const loop: Loop = { owner, surface: s, win: owner?.closest<HTMLElement>(".win") ?? null, parent: owner?.parentElement ?? null, cb, last: 0, due: 0, fps: 0, density: 0, once, bound: !owner || owner.isConnected, stop };
  loops.add(loop); wake();
  return stop;
}
export function deferRender(owner: HTMLElement, cb: () => void) { return renderLoop(owner, cb, true); }
function loopFrameRate(l: Loop) {
  if (diagnosticOff("screens")) return 0;
  if (document.hidden) return 0;
  if (l.owner && (!l.owner.isConnected || coveredOwner(l.owner))) return 0;
  if (l.owner && (!l.bound || l.parent !== l.owner.parentElement || l.surface && !l.surface.el.contains(l.owner) || l.win && !l.win.contains(l.owner))) {
    const host = l.once ? l.owner : l.owner.closest<HTMLElement>(".screen, .phone-screen") ?? l.owner;
    const next = surface(host), old = l.surface;
    if (next !== old) {
      if (old && --old.refs === 0 && !old.explicit) { io?.unobserve(old.el); surfaces.delete(old.el); }
      next.refs++; l.surface = next;
    }
    l.win = l.owner.closest<HTMLElement>(".win"); l.parent = l.owner.parentElement; l.bound = true;
  }
  if (l.win?.dataset.renderHidden === "1" || l.surface?.visible === false) return 0;
  // Reduced window geometry is refreshed by the shared LOD layer. Keep app
  // logic alive while skipping continuous canvas paints hidden by that layer.
  if (!l.once && l.win && l.surface?.el.dataset.screenDetail) return 0;
  // Continuous loops are already bound to their screen. Only a deferred thumbnail has
  // its own IntersectionObserver surface in addition to its containing desktop.
  return Math.min(l.surface?.fps ?? 60, l.once && l.owner ? renderFps(l.owner) : 60);
}
function cancelFrame() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  if (timer) { clearTimeout(timer); timer = 0; }
}
function wake() {
  // Camera, observer and window changes must interrupt a sleeping screen clock.
  if (timer) { clearTimeout(timer); timer = 0; }
  if (!raf && !document.hidden && !isAsleep() && loops.size) raf = requestAnimationFrame(frame);
}
function scheduleFrame(now: number, due: number) {
  if (raf || !Number.isFinite(due) || document.hidden || isAsleep() || !loops.size) return;
  // Leave one 60 Hz display frame of lead time, then align to the display clock.
  // Distant 20 Hz screens should not scan all app owners on every 144 Hz tick.
  // Close-up screens and staggered desktops keep their existing RAF cadence.
  const delay = due - now - 1000 / 60;
  if (delay > 1) timer = window.setTimeout(() => { timer = 0; wake(); }, delay);
  else wake();
}
function frame(now: number) {
  raf = 0;
  if (document.hidden || isAsleep()) return; // asleep: monitors keep their last frame (world/budget.ts)
  // Screens draw only on ambient beat frames (perf/beat.ts), still staggered among them.
  // A screen that must get sharper after a zoom does not wait for the beat.
  const beat = ambientBeat(now);
  const started = performance.now();
  let nextDue = Infinity;
  let paintedStatic = false;
  for (const l of loops) {
    const requiredDensity = (l.surface?.scale ?? 1) * (window.devicePixelRatio || 1);
    const sharper = requiredDensity > l.density;
    // A 144 Hz display must not re-walk every app's ancestors 144 times a second
    // for a desktop drawing at 20 Hz. Visibility is checked before its next draw.
    // Zooming beyond the current sharp density bypasses that delay, so the very
    // next display frame resizes and redraws rather than stretching stale pixels.
    if (!sharper && l.last && l.surface?.fps === l.fps && now < l.due - .5) { nextDue = Math.min(nextDue, l.due); continue; }
    if (!beat && !sharper) { nextDue = Math.min(nextDue, nextBeat(now)); continue; }
    const fps = loopFrameRate(l);
    if (!fps) { l.last = 0; continue; }
    if (l.once && paintedStatic) { nextDue = now; continue; } // amortize expensive poster/thumbnail construction
    const interval = 1000 / fps;
    if (fps !== l.fps) { l.fps = fps; l.last = l.due = 0; }
    if (!sharper && l.last && now < l.due - .5) { nextDue = Math.min(nextDue, l.due); continue; }
    const dt = l.last ? Math.min(.05, (now - l.last) / 1000) : 1 / 60;
    // Each workstation owns a stable clock phase. Zooming out must not synchronize
    // every visible canvas into one expensive repaint burst every 50 ms.
    const phase = (l.surface?.phase ?? 0) * interval;
    // The eligibility tolerance also belongs in the slot calculation. Otherwise a
    // frame just before its slot gets scheduled into that same slot again and draws
    // twice within a single display tick on high refresh rate monitors.
    l.due = (Math.floor((now + .5 - phase) / interval) + 1) * interval + phase;
    l.last = now;
    l.density = pixelRatioBucket(requiredDensity);
    const start = beginSystem();
    try { l.cb(now, dt); } catch (error) { l.stop(); reportError(error); } finally { endSystem("apps", start); }
    if (l.once) { l.stop(); paintedStatic = true; }
    else if (loops.has(l)) nextDue = Math.min(nextDue, l.due);
  }
  scheduleFrame(now + performance.now() - started, nextDue);
}
document.addEventListener("visibilitychange", () => { if (document.hidden) cancelFrame(); else wake(); });
onCalmChange(() => { if (isAsleep()) cancelFrame(); else wake(); });
window.addEventListener("resize", wake);
if ((window as any).__lucidPerf) (window as any).__lucidPerf.render = () => {
  let activeLoops = 0, pendingImages = 0;
  for (const l of loops) { if (loopFrameRate(l)) activeLoops++; if (l.once) pendingImages++; }
  return { loops: loops.size, active: activeLoops, pendingImages };
};

onDiagnosticsChange(wakeRender);
