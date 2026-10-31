// How often robots redraw their bodies. Every robot rebuilds its arms and joints each frame,
// which is most of the app's work. Robots off screen do not need it at all, and when the camera
// is zoomed far out a robot is a few pixels tall, so fewer redraws look the same.
// Only drawing is skipped: movement, typing and timers keep running every frame.

import gsap from "gsap";

const visible = new WeakMap<Element, boolean>();
const io = typeof IntersectionObserver === "undefined" ? null
  : new IntersectionObserver((es) => { for (const e of es) visible.set(e.target, e.isIntersecting); }, { rootMargin: "120px" });

/** Start tracking whether a robot is on screen. */
export function watch(el: Element) { io?.observe(el); }
export function unwatch(el: Element) { io?.unobserve(el); visible.delete(el); }

// The whole animation clock (gsap: robots, walking, props, glows) also runs slower when zoomed
// out, so every change lands in the same frames and the ones in between cost nothing. While
// the camera moves it runs at full speed, so zooming and panning stay smooth.
let scale = 1, lastCam = "", fast = 0, tickerFps = 60;
const clockFps = () => (performance.now() < fast ? 60 : scale < 0.3 ? 20 : scale < 0.55 ? 30 : 60);
function setClock() {
  const f = clockFps();
  if (f !== tickerFps) { tickerFps = f; gsap.ticker.fps(f); }
}
let settle = 0;
/** The camera's zoom (1 = normal size) and position. */
export function setZoom(s: number, x = 0, y = 0) {
  scale = s;
  const cam = `${s.toFixed(4)}|${x.toFixed(1)}|${y.toFixed(1)}`;
  if (cam !== lastCam && lastCam) {
    fast = performance.now() + 500;
    window.clearTimeout(settle);
    settle = window.setTimeout(setClock, 520);
  }
  lastCam = cam;
  setClock();
}

const lastDraw = new WeakMap<object, number>();
const lastSlot = new WeakMap<object, number>();
/** Should this robot redraw its body now? Throttled robots all draw in the same frames, so the
 *  frames in between have nothing to repaint. */
export function drawNow(owner: object, el: Element, now: number) {
  // off screen: no redraw, except a slow one now and then in case the visibility news was missed
  if (visible.get(el) === false && now - (lastDraw.get(owner) ?? 0) < 2000) return false;
  const fps = scale < 0.3 ? 12 : scale < 0.5 ? 20 : scale < 0.75 ? 30 : 60;
  if (fps < 60) {
    const slot = Math.floor(now / (1000 / fps));
    if (lastSlot.get(owner) === slot) return false;
    lastSlot.set(owner, slot);
  }
  lastDraw.set(owner, now);
  return true;
}
/** Seconds since this robot last drew (for its springs), capped so they stay stable. */
export function sinceDraw(owner: object, now: number, max = 0.05) {
  const l = lastDraw.get(owner);
  return l == null ? 1 / 60 : Math.min(max, Math.max(0.001, (now - l) / 1000));
}
