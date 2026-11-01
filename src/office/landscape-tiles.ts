// Draws the landscape (landscape.ts) into reusable bitmap tiles. Panning only moves finished
// pixels; nothing is redrawn until the view reaches new ground or the zoom asks for sharper
// pixels. A small overview bitmap of the whole map always lies underneath, so a tile that is
// not drawn yet shows a softer version of the same ground, never a hole.
//
// - Only tiles near the view exist. Tiles out of view are hidden and the least recently used
//   are handed to new positions (same canvas, no new allocation).
// - Tile density follows the camera in quarter-octave steps, at least the displayed density.
// - Drawing runs in small time slices on animation frames, so a gesture never waits for it.
// - New weather or season repaints tiles in place: the old pixels stay until replaced.

import { paintLandscape, landColors, type LandPlan, type LandLook, type LRect } from "./landscape";

const TILE = 512;
const OVERVIEW_PX = 2048;
const MAX_DENSITY = 3;
const level = (d: number) => Math.min(MAX_DENSITY, 2 ** (Math.ceil(Math.log2(d) * 4) / 4));

type Tile = { key: string; level: number; i: number; j: number; canvas: HTMLCanvasElement; version: number; used: number; shown: boolean; lost: boolean };

export class LandscapeTiles {
  readonly el = document.createElement("div");
  private overview = document.createElement("canvas");
  /** The next overview, painted in strips while the current one stays on screen. */
  private spare: HTMLCanvasElement | null = null;
  private strips: { canvas: HTMLCanvasElement; y: number; x: number; d: number; origin: { x: number; y: number }; size: { w: number; h: number } } | null = null;
  private painted = false;
  /** Running estimate of one overview strip's paint time (ms). */
  private stripCost = 1;
  private plan: LandPlan | null = null;
  private look: LandLook | null = null;
  private colors: ReturnType<typeof landColors> | null = null;
  private origin = { x: 0, y: 0 };
  private size = { w: 0, h: 0 };
  private overviewDensity = 0;
  private tiles = new Map<string, Tile>();
  private pool: HTMLCanvasElement[] = [];
  private queue: Tile[] = [];
  private version = 0;
  private current = 0;
  private view: LRect | null = null;
  private wanted = 0;
  private tick = 0;
  private raf = 0;
  private movedAt = 0;
  private shownLevel = 0;
  private lastDensity = 0;
  private settle = 0;
  private dead = false;
  /** Paint time of the last overview and tiles, for profiling (ms). */
  stats = { overviewMs: 0, tilesPainted: 0, tileMs: 0, maxSliceMs: 0, slices: 0, maxTileMs: 0, maxStripMs: 0 };

  constructor() {
    this.el.className = "landscape";
    this.el.style.cssText = "position:absolute;left:0;top:0;z-index:0;pointer-events:none;overflow:hidden";
    this.overview.className = "landscape-overview";
    this.overview.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%";
    this.el.append(this.overview);
  }

  /** New geometry or new colours. Keeps finished tiles on screen until each is repainted. */
  setScene(plan: LandPlan, look: LandLook, origin: { x: number; y: number }, size: { w: number; h: number }) {
    if (this.dead) return;
    this.plan = plan; this.look = look; this.colors = landColors(look); this.version++;
    this.el.dataset.trees = String(plan.counts.trees);
    this.el.style.width = `${size.w}px`; this.el.style.height = `${size.h}px`; this.size = { ...size };
    if (origin.x !== this.origin.x || origin.y !== this.origin.y) {
      this.origin = { ...origin };
      for (const t of this.tiles.values()) this.place(t);
    }
    // the overview: the whole map, small enough to stay cheap
    const d = Math.min(0.25, OVERVIEW_PX / Math.max(size.w, size.h));
    const w = Math.max(1, Math.round(size.w * d)), h = Math.max(1, Math.round(size.h * d));
    this.overviewDensity = d;
    if (!this.painted) {
      // first paint: nothing to show meanwhile, so draw it at once
      this.overview.width = w; this.overview.height = h;
      const started = performance.now();
      this.paintStrip(this.overview, 0, 0, w, h, d, origin, size);
      this.stats.overviewMs = performance.now() - started;
      this.painted = true; this.strips = null;
    } else {
      // later paints (new weather, season, layout) go into a second canvas in small slices
      const canvas = this.strips?.canvas ?? this.spare ?? document.createElement("canvas");
      this.spare = null;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      this.strips = { canvas, y: 0, x: 0, d, origin: { ...origin }, size: { ...size } };
      this.schedule();
    }
    if (this.view) this.update(this.view, this.current || d, true);
  }

  /** The camera's world rectangle and the displayed density (CSS scale times device pixel ratio). */
  update(view: LRect, density: number, quiet = false) {
    if (this.dead || !this.plan) return;
    if (!quiet) this.movedAt = performance.now();
    this.view = view;
    let lv = density <= this.overviewDensity * 1.08 ? 0 : level(density);
    // During a zoom gesture keep the current tiles (at most one octave off) and sharpen once it rests.
    const zooming = !quiet && this.lastDensity > 0 && density !== this.lastDensity;
    this.lastDensity = density;
    if (zooming && this.shownLevel && lv && lv !== this.shownLevel && lv / this.shownLevel <= 2 && lv / this.shownLevel >= 0.5) {
      lv = this.shownLevel;
      clearTimeout(this.settle);
      this.settle = window.setTimeout(() => { this.settle = 0; if (this.view) this.update(this.view, this.current, true); }, 220);
    }
    this.shownLevel = lv;
    this.current = density;
    this.tick++;
    const want: Tile[] = [];
    if (lv) {
      const size = TILE / lv, m = Math.min(view.w, view.h) * 0.15, B = { ...this.origin, ...this.size };
      const x0 = Math.max(view.x - m, B.x), y0 = Math.max(view.y - m, B.y), x1 = Math.min(view.x + view.w + m, B.x + B.w), y1 = Math.min(view.y + view.h + m, B.y + B.h);
      for (let j = Math.floor(y0 / size); j * size < y1; j++) for (let i = Math.floor(x0 / size); i * size < x1; i++) {
        const key = `${lv}:${i}:${j}`;
        let t = this.tiles.get(key);
        if (!t) { const canvas = this.canvas(want.length); if (!canvas) continue; t = { key, level: lv, i, j, canvas, version: -1, used: 0, shown: false, lost: false }; this.tiles.set(key, t); this.place(t); this.el.append(canvas); }
        t.used = this.tick; want.push(t);
      }
    }
    this.wanted = want.length;
    // Queue unfinished tiles nearest the middle of the view first.
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    this.queue = want.filter((t) => t.version !== this.version).sort((a, b) => this.dist(a, cx, cy) - this.dist(b, cx, cy));
    this.present(lv);
    if (this.queue.length) this.schedule();
  }

  private paintStrip(canvas: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number, d: number, origin: { x: number; y: number }, size: { w: number; h: number }) {
    const c = canvas.getContext("2d", { alpha: false });
    if (!c || !this.plan || !this.look || !this.colors) return;
    const kx = canvas.width / size.w, ky = canvas.height / size.h;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    c.setTransform(kx, 0, 0, ky, -origin.x * kx, -origin.y * ky);
    paintLandscape(c, this.plan, this.look, this.colors, { x: origin.x + x0 / kx, y: origin.y + y0 / ky, w: (x1 - x0) / kx, h: (y1 - y0) / ky }, d);
    c.restore();
  }

  private dist(t: Tile, cx: number, cy: number) { const s = TILE / t.level; return Math.hypot((t.i + 0.5) * s - cx, (t.j + 0.5) * s - cy); }

  /**
   * Shows the current level's finished tiles over the overview. While the current level is
   * still incomplete, finished tiles of other levels stay underneath it, so zooming never
   * drops back to the soft overview.
   */
  private present(lv: number) {
    const done = this.queue.length === 0;
    for (const t of this.tiles.values()) {
      const inView = t.used === this.tick, ready = t.version >= 0 && !t.lost;
      const show = ready && (inView ? t.level === lv || !done : false) || (ready && !done && t.level !== lv && this.overlaps(t));
      if (show !== t.shown) { t.shown = show; t.canvas.style.display = show ? "" : "none"; }
      const z = t.level === lv ? "2" : "1";
      if (t.canvas.style.zIndex !== z) t.canvas.style.zIndex = z;
    }
  }
  private overlaps(t: Tile) {
    const v = this.view; if (!v) return false;
    const s = TILE / t.level, x = t.i * s, y = t.j * s;
    return x < v.x + v.w && x + s > v.x && y < v.y + v.h && y + s > v.y;
  }

  /** A canvas for a new tile: from the pool, or the least recently used tile out of view. */
  private canvas(wantedSoFar: number) {
    const pooled = this.pool.pop();
    if (pooled) return pooled;
    // Enough for the view plus a small pan reserve; everything else is reused.
    const cap = Math.max(16, Math.min(56, Math.max(this.wanted, wantedSoFar + 1) + 12));
    if (this.tiles.size < cap) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = TILE;
      canvas.className = "landscape-tile";
      canvas.addEventListener("contextlost", () => { for (const t of this.tiles.values()) if (t.canvas === canvas) { t.lost = true; t.version = -1; } });
      canvas.addEventListener("contextrestored", () => { for (const t of this.tiles.values()) if (t.canvas === canvas) t.lost = false; if (this.view) this.update(this.view, this.current, true); });
      return canvas;
    }
    let old: Tile | null = null;
    for (const t of this.tiles.values()) if (t.used !== this.tick && (!old || t.used < old.used)) old = t;
    if (!old) return null;
    this.tiles.delete(old.key);
    old.canvas.style.display = "none";
    return old.canvas;
  }

  private place(t: Tile) {
    const s = TILE / t.level, st = t.canvas.style;
    st.cssText = `position:absolute;left:${t.i * s - this.origin.x}px;top:${t.j * s - this.origin.y}px;width:${s}px;height:${s}px;display:${t.shown ? "" : "none"}`;
  }

  private schedule() { if (!this.raf && !this.dead) this.raf = requestAnimationFrame(this.work); }

  private work = () => {
    this.raf = 0;
    if (this.dead || !this.plan || !this.look || !this.colors) return;
    // A moving camera keeps most of the frame; a resting one sharpens quickly.
    const moving = performance.now() - this.movedAt < 160, budget = moving ? 3 : 9, start = performance.now();
    // A resting camera always makes progress, even when one piece costs more than the budget.
    let first = !moving;
    let painted = false;
    // Start a piece of work only when its usual cost still fits the frame's budget.
    const tileCost = this.stats.tilesPainted ? this.stats.tileMs / this.stats.tilesPainted : 1;
    while (this.queue.length && (first || (performance.now() - start) + tileCost < budget)) {
      first = false;
      const t = this.queue.shift()!;
      if (!this.tiles.has(t.key) || t.version === this.version) continue;
      const c = t.canvas.getContext("2d", { alpha: false });
      if (!c) continue;
      const s = TILE / t.level;
      c.setTransform(t.level, 0, 0, t.level, -t.i * TILE, -t.j * TILE);
      const began = performance.now();
      paintLandscape(c, this.plan, this.look, this.colors, { x: t.i * s, y: t.j * s, w: s, h: s }, t.level);
      const cost = performance.now() - began;
      this.stats.tilesPainted++; this.stats.tileMs += cost; this.stats.maxTileMs = Math.max(this.stats.maxTileMs, cost);
      t.version = this.version; t.lost = false; painted = true;
    }
    // then the next overview, a strip at a time, swapped in once complete
    const job = this.strips;
    while (job && job.y < job.canvas.height && (first || (performance.now() - start) + this.stripCost < budget)) {
      first = false;
      const C = 224, x1 = Math.min(job.canvas.width, job.x + C), y1 = Math.min(job.canvas.height, job.y + C);
      const began = performance.now();
      this.paintStrip(job.canvas, job.x, job.y, x1, y1, job.d, job.origin, job.size);
      const spent = performance.now() - began;
      this.stats.maxStripMs = Math.max(this.stats.maxStripMs, spent);
      this.stats.overviewMs += spent; this.stripCost = this.stripCost * 0.7 + spent * 0.3;
      if (x1 >= job.canvas.width) { job.x = 0; job.y = y1; } else job.x = x1;
    }
    if (job && job.y >= job.canvas.height) {
      job.canvas.className = this.overview.className; job.canvas.style.cssText = this.overview.style.cssText;
      this.overview.replaceWith(job.canvas);
      this.spare = this.overview; this.overview = job.canvas; this.strips = null;
      // keep the element for the next repaint, but not its pixels
      this.spare.width = this.spare.height = 0;
    }
    this.stats.slices++; this.stats.maxSliceMs = Math.max(this.stats.maxSliceMs, performance.now() - start);
    if (painted) this.present(this.shownLevel);
    if (this.queue.length || this.strips) this.schedule();
  };

  /** Metrics for checks: tiles that exist, are visible, and still need painting. */
  metrics() {
    let shown = 0;
    for (const t of this.tiles.values()) if (t.shown) shown++;
    return { tiles: this.tiles.size, shown, queued: this.queue.length + (this.strips ? 1 : 0), pooled: this.pool.length, overview: [this.overview.width, this.overview.height], trees: this.plan?.counts.trees ?? 0 };
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.settle);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const t of this.tiles.values()) { t.canvas.width = t.canvas.height = 0; t.canvas.remove(); }
    for (const c of this.pool) c.width = c.height = 0;
    this.tiles.clear(); this.pool = []; this.queue = [];
    for (const c of [this.overview, this.spare, this.strips?.canvas]) if (c) c.width = c.height = 0;
    this.spare = null; this.strips = null;
    this.el.remove();
  }
}
