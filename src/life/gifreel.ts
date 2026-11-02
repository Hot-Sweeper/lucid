import { VW, VH, setFamily, setPxScale } from "./gifkit";
import { drawGifFrame, posterTime, type GifKind } from "./gifs";
import { LiveCanvases, fitCanvas, canvasPixelRatio } from "../perf/canvas";

// Plays meme GIFs on canvases. One frame loop drives every canvas; a canvas is
// skipped while scrolled out of view and dropped once it leaves the DOM. When
// nothing is left to play, the loop stops on its own. stop() ends everything.

type Sched = (fn: (now: number) => void) => () => void;
type Item = { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; kind: GifKind; w: number; buffers: LiveCanvases; k: number; fps: number; t0: number; frame: number; vis: boolean; seen: boolean; born: number };

const rafSched: Sched = (fn) => {
  let id = requestAnimationFrame(function loop(now) { id = requestAnimationFrame(loop); fn(now); });
  return () => cancelAnimationFrame(id);
};

export class GifReel {
  private items = new Map<Element, Item>();
  private io: IntersectionObserver | null = null;
  private unsub: (() => void) | null = null;
  private dead = false;
  private still: boolean;
  private freeze: number | null;

  // still: draw one frame and never animate (reduced motion). freezeAt: show this time, for screenshots.
  constructor(private sched: Sched = rafSched, opts: { still?: boolean; freezeAt?: number } = {}) {
    this.freeze = opts.freezeAt ?? null;
    this.still = this.freeze !== null || (opts.still ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches));
    if (typeof IntersectionObserver === "function") {
      this.io = new IntersectionObserver((es) => {
        for (const e of es) { const it = this.items.get(e.target); if (it) it.vis = e.isIntersecting; }
      });
    }
  }

  // Size the canvas (css px, 4:3), draw the first frame and start playing it.
  add(cv: HTMLCanvasElement, kind: GifKind, w: number, opts: { fps?: number; at?: number } = {}) {
    if (this.dead) return;
    const h = Math.round((w * VH) / VW);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    fitCanvas(cv, w, h);
    const buffers = new LiveCanvases(cv);
    buffers.add(cv);
    const fam = getComputedStyle(cv).getPropertyValue("--font");
    if (fam) setFamily(fam);
    const now = performance.now();
    const it: Item = { cv, ctx, kind, w, buffers, k: (w * 2) / VW, fps: opts.fps ?? 30, t0: now - (opts.at ?? 0) * 1000, frame: -1, vis: true, seen: cv.isConnected, born: now };
    this.items.set(cv, it);
    this.io?.observe(cv);
    this.paint(it, now, true);
    // webfonts may land after the first paint
    document.fonts?.ready.then(() => { if (!this.dead && this.items.has(cv)) this.paint(it, performance.now(), true); });
    // A still frame also responds to camera/DPR changes, without advancing time.
    if (!this.unsub) this.unsub = this.sched(this.tick);
  }

  remove(cv: Element) {
    const it = this.items.get(cv);
    if (!it) return;
    this.items.delete(cv);
    it.buffers.clear();
    this.io?.unobserve(cv);
    if (!this.items.size && this.unsub) { this.unsub(); this.unsub = null; }
  }

  private tick = (now: number) => {
    if (this.dead) return;
    for (const it of this.items.values()) {
      if (!it.cv.isConnected) {
        // a canvas that was shown and is now gone, or never made it into the page
        if (it.seen || now - it.born > 1500) this.remove(it.cv);
        continue;
      }
      it.seen = true;
      if (it.vis) this.paint(it, now, false);
    }
  };

  private paint(it: Item, now: number, force: boolean) {
    const t = this.freeze ?? (this.still ? posterTime(it.kind) : (now - it.t0) / 1000);
    const frame = Math.floor(t * it.fps);
    const width = it.cv.width, height = it.cv.height;
    // GIF boxes are painted before their containing message enters the screen.
    // Do not bind density to that detached canvas as if it were its own surface.
    if (it.cv.isConnected) it.buffers.prepare();
    const resized = width !== it.cv.width || height !== it.cv.height;
    if (!force && frame === it.frame && !resized) return;
    it.frame = frame;
    it.k = (it.w * canvasPixelRatio(it.cv)) / VW;
    const c = it.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, it.cv.width, it.cv.height);
    c.setTransform(it.k, 0, 0, it.k, 0, 0);
    setPxScale(it.k);
    drawGifFrame(c, it.kind, frame / it.fps);
  }

  get playing() { return this.items.size; }

  stop() {
    if (this.dead) return;
    this.dead = true;
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.io?.disconnect();
    for (const it of this.items.values()) it.buffers.clear();
    this.items.clear();
  }
}
