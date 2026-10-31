import { beginSystem, endSystem } from "./metrics";

// One clock for screen apps. Geometry arrives from the camera/IntersectionObserver, never
// from layout reads in a draw callback. Logical events and real thread data keep running.
type Surface = { visible: boolean; fps: number; explicit: boolean; refs: number; el: HTMLElement };
type Loop = { owner?: HTMLElement; surface?: Surface; win: HTMLElement | null; cb: (now: number, dt: number) => void; last: number; due: number; fps: number; once: boolean; bound: boolean; stop: () => void };
const surfaces = new WeakMap<HTMLElement, Surface>();
const loops = new Set<Loop>();
const contexts = new WeakMap<HTMLElement, { host: HTMLElement; win: HTMLElement | null }>();
let raf = 0;
const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
  for (const e of entries) {
    const s = surfaces.get(e.target as HTMLElement);
    if (s && !s.explicit) { s.visible = e.isIntersecting; s.fps = e.boundingClientRect.width < 40 ? 0 : e.boundingClientRect.width < 200 ? 20 : 60; }
  }
  wake();
});
function surface(el: HTMLElement) {
  let s = surfaces.get(el);
  if (!s) { s = { visible: !io, fps: 60, explicit: false, refs: 0, el }; surfaces.set(el, s); io?.observe(el); }
  return s;
}
export function setRenderView(el: HTMLElement, visible: boolean, screenWidth: number) {
  const s = surface(el), fps = screenWidth < 80 ? 0 : screenWidth < 200 ? 15 : screenWidth < 450 ? 30 : 60;
  const changed = s.visible !== visible || s.fps !== fps;
  s.explicit = true; s.visible = visible; s.fps = fps;
  if (changed) { el.classList.toggle("render-paused", !visible || !fps); wake(); }
}
export function releaseRenderView(el: HTMLElement) { io?.unobserve(el); surfaces.delete(el); }
export function wakeRender() { wake(); }
export function renderFps(owner: HTMLElement) {
  if (document.hidden || !owner.isConnected) return 0;
  let context = contexts.get(owner);
  if (!context) {
    context = { host: owner.closest<HTMLElement>(".screen, .phone-screen") ?? owner, win: owner.closest<HTMLElement>(".win") };
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
  const loop: Loop = { owner, surface: s, win: owner?.closest<HTMLElement>(".win") ?? null, cb, last: 0, due: 0, fps: 0, once, bound: !owner || owner.isConnected, stop };
  loops.add(loop); wake();
  return stop;
}
export function deferRender(owner: HTMLElement, cb: () => void) { return renderLoop(owner, cb, true); }
function active(l: Loop) {
  if (!l.bound && l.owner?.isConnected) {
    const host = l.once ? l.owner : l.owner.closest<HTMLElement>(".screen, .phone-screen") ?? l.owner;
    const next = surface(host), old = l.surface;
    if (next !== old) {
      if (old && --old.refs === 0 && !old.explicit) { io?.unobserve(old.el); surfaces.delete(old.el); }
      next.refs++; l.surface = next;
    }
    l.win = l.owner.closest<HTMLElement>(".win"); l.bound = true;
  }
  return (!l.owner || l.owner.isConnected) && l.win?.dataset.renderHidden !== "1" && (!l.surface || l.surface.visible && l.surface.fps > 0) && (!l.owner || renderFps(l.owner) > 0);
}
function wake() { if (!raf && !document.hidden && loops.size) raf = requestAnimationFrame(frame); }
function frame(now: number) {
  raf = 0;
  if (document.hidden) return;
  let running = false;
  let paintedStatic = false;
  for (const l of loops) {
    if (!active(l)) { l.last = 0; continue; }
    running = true;
    if (l.once && paintedStatic) continue; // amortize expensive poster/thumbnail construction
    const fps = Math.min(l.surface?.fps ?? 60, l.owner ? renderFps(l.owner) : 60), interval = 1000 / fps;
    if (fps !== l.fps) { l.fps = fps; l.last = l.due = 0; }
    if (l.last && now < l.due - .5) continue;
    const dt = l.last ? Math.min(.05, (now - l.last) / 1000) : 1 / 60;
    l.due = !l.last || now - l.due > interval ? now + interval : l.due + interval;
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
  for (const l of loops) { if (active(l)) activeLoops++; if (l.once) pendingImages++; }
  return { loops: loops.size, active: activeLoops, pendingImages };
};
