import { beginSystem, endSystem } from "./metrics";
import { screenFrameRate } from "./screen-budget";

// One clock for screen apps. Geometry arrives from the camera/IntersectionObserver, never
// from layout reads in a draw callback. Logical events and real thread data keep running.
type Surface = { visible: boolean; fps: number; phase: number; explicit: boolean; refs: number; el: HTMLElement };
type Loop = { owner?: HTMLElement; surface?: Surface; win: HTMLElement | null; parent: HTMLElement | null; cb: (now: number, dt: number) => void; last: number; due: number; fps: number; once: boolean; bound: boolean; stop: () => void };
const surfaces = new WeakMap<HTMLElement, Surface>();
const loops = new Set<Loop>();
const contexts = new WeakMap<HTMLElement, { host: HTMLElement; win: HTMLElement | null; parent: HTMLElement | null }>();
let raf = 0;
let surfaceSequence = 0;
const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
  for (const e of entries) {
    const s = surfaces.get(e.target as HTMLElement);
    if (s && !s.explicit) { s.visible = e.isIntersecting; s.fps = screenFrameRate(e.boundingClientRect.width); }
  }
  wake();
});
function surface(el: HTMLElement) {
  let s = surfaces.get(el);
  if (!s) { s = { visible: !io, fps: 60, phase: (++surfaceSequence * .61803398875) % 1, explicit: false, refs: 0, el }; surfaces.set(el, s); io?.observe(el); }
  return s;
}
export function setRenderView(el: HTMLElement, visible: boolean, screenWidth: number) {
  const s = surface(el), fps = screenFrameRate(screenWidth);
  const changed = !s.explicit || s.visible !== visible || s.fps !== fps;
  s.explicit = true; s.visible = visible; s.fps = fps;
  if (changed) {
    el.classList.toggle("render-paused", !visible);
    el.dataset.renderFps = String(visible ? fps : 0);
    wake();
  }
}
export function releaseRenderView(el: HTMLElement) { io?.unobserve(el); surfaces.delete(el); }
export function wakeRender() { wake(); }
export function renderFps(owner: HTMLElement) {
  if (document.hidden || !owner.isConnected) return 0;
  let context = contexts.get(owner);
  if (!context || context.parent !== owner.parentElement || !context.host.contains(owner) || context.win && !context.win.contains(owner)) {
    context = { host: owner.closest<HTMLElement>(".screen, .phone-screen") ?? owner, win: owner.closest<HTMLElement>(".win"), parent: owner.parentElement };
    contexts.set(owner, context);
  }
  const s = surfaces.get(context.host);
  return context.win?.dataset.renderHidden === "1" || s?.visible === false ? 0 : s?.fps ?? 60;
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
  };
  const loop: Loop = { owner, surface: s, win: owner?.closest<HTMLElement>(".win") ?? null, parent: owner?.parentElement ?? null, cb, last: 0, due: 0, fps: 0, once, bound: !owner || owner.isConnected, stop };
  loops.add(loop); wake();
  return stop;
}
export function deferRender(owner: HTMLElement, cb: () => void) { return renderLoop(owner, cb, true); }
function loopFrameRate(l: Loop) {
  if (document.hidden) return 0;
  if (l.owner && !l.owner.isConnected) return 0;
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
  // Continuous loops are already bound to their screen. Only a deferred thumbnail has
  // its own IntersectionObserver surface in addition to its containing desktop.
  return Math.min(l.surface?.fps ?? 60, l.once && l.owner ? renderFps(l.owner) : 60);
}
function wake() { if (!raf && !document.hidden && loops.size) raf = requestAnimationFrame(frame); }
function frame(now: number) {
  raf = 0;
  if (document.hidden) return;
  let running = false;
  let paintedStatic = false;
  for (const l of loops) {
    // A 144 Hz display must not re-walk every app's ancestors 144 times a second
    // for a desktop drawing at 20 Hz. Visibility is checked before its next draw.
    if (l.last && l.surface?.fps === l.fps && now < l.due - .5) { running = true; continue; }
    const fps = loopFrameRate(l);
    if (!fps) { l.last = 0; continue; }
    running = true;
    if (l.once && paintedStatic) continue; // amortize expensive poster/thumbnail construction
    const interval = 1000 / fps;
    if (fps !== l.fps) { l.fps = fps; l.last = l.due = 0; }
    if (l.last && now < l.due - .5) continue;
    const dt = l.last ? Math.min(.05, (now - l.last) / 1000) : 1 / 60;
    // Each workstation owns a stable clock phase. Zooming out must not synchronize
    // every visible canvas into one expensive repaint burst every 50 ms.
    const phase = (l.surface?.phase ?? 0) * interval;
    // The eligibility tolerance also belongs in the slot calculation. Otherwise a
    // frame just before its slot gets scheduled into that same slot again and draws
    // twice within a single display tick on high refresh rate monitors.
    l.due = (Math.floor((now + .5 - phase) / interval) + 1) * interval + phase;
    l.last = now;
    const start = beginSystem();
    try { l.cb(now, dt); } catch (error) { l.stop(); reportError(error); } finally { endSystem("apps", start); }
    if (l.once) { l.stop(); paintedStatic = true; }
  }
  if (running) wake();
}
document.addEventListener("visibilitychange", wake);
if ((window as any).__lucidPerf) (window as any).__lucidPerf.render = () => {
  let activeLoops = 0, pendingImages = 0;
  for (const l of loops) { if (loopFrameRate(l)) activeLoops++; if (l.once) pendingImages++; }
  return { loops: loops.size, active: activeLoops, pendingImages };
};
