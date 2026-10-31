// Never hand Chromium a grounds-sized SVG image. At close zoom it rasterized that image
// repeatedly during middle-button pans, stalling the GPU for hundreds of milliseconds.
// Keep a small overview bitmap and rasterize only viewport crops at screen density.
// Two recent crops are retained for backtracking instead of rebuilding the same pixels.
// The overview covers camera motion until an asynchronous sharp crop is ready.
import { beginSystem, endSystem } from "../perf/metrics";
import { outsideView, outsideProjection, outsideOverviewDensity } from "./outside-view";

type Camera = { x: number; y: number; s: number };
type Crop = { x: number; y: number; w: number; h: number; density: number };
const caches = new WeakMap<HTMLElement, OutsideRaster>();
const MARGIN = 256; // screen pixels of overscan, so ordinary pans reuse the same crop
const SETTLE_MS = 220;

export function paintOutside(layer: HTMLElement, svg: string) {
  const previous = caches.get(layer), fallback = previous?.snapshot();
  previous?.destroy();
  const cache = new OutsideRaster(layer, svg, fallback);
  caches.set(layer, cache);
}

export function updateOutside(layer: HTMLElement | null, cam: Camera, width: number, height: number) {
  if (layer) caches.get(layer)?.update(cam, width, height);
}

class OutsideRaster {
  private plane = document.createElement("div");
  private preview = document.createElement("canvas");
  private detail = document.createElement("canvas");
  private overview = document.createElement("canvas");
  private overviewReady = false;
  private overviewDensity = 0;
  private sharp: HTMLCanvasElement | null = null;
  private live: SVGSVGElement | null;
  private crop: Crop | null = null;
  private history: { crop: Crop; canvas: HTMLCanvasElement }[] = [];
  private pending: Crop | null = null;
  private cam: Camera = { x: 0, y: 0, s: 0 };
  private width = 0;
  private height = 0;
  private timer = 0;
  private dead = false;
  private urls = new Set<string>();
  private w: number;
  private h: number;
  constructor(private layer: HTMLElement, private svg: string, fallback?: HTMLCanvasElement) {
    this.w = parseFloat(layer.style.width);
    this.h = parseFloat(layer.style.height);
    this.preview.className = "outside-quick";
    this.detail.className = "outside-detail";
    this.plane.className = "outside-viewport";
    this.plane.style.cssText = "position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;pointer-events:none";
    this.live = layer.querySelector<SVGSVGElement>(".outside-live");
    for (const cv of [this.preview, this.detail]) {
      cv.setAttribute("aria-hidden", "true");
      cv.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;visibility:hidden";
    }
    this.plane.append(this.preview, this.detail);
    if (this.live) this.plane.append(this.live);
    layer.append(this.plane);
    if (fallback) { this.preview.width = fallback.width; this.preview.height = fallback.height; this.preview.getContext("2d")!.drawImage(fallback, 0, 0); this.preview.style.visibility = "visible"; }
    const density = this.overviewDensity = outsideOverviewDensity(this.w, this.h);
    void this.raster({ x: 0, y: 0, w: this.w, h: this.h, density }, this.overview).then((ok) => {
      if (ok) {
        this.overviewDensity = Math.min(this.overview.width / this.w, this.overview.height / this.h);
        this.overviewReady = true; this.paint();
      }
    });
  }

  update(cam: Camera, width: number, height: number) {
    const scaling = cam.s !== this.cam.s;
    const resizing = width !== this.width || height !== this.height;
    this.cam.x = cam.x; this.cam.y = cam.y; this.cam.s = cam.s;
    this.width = width; this.height = height;
    const view = outsideView(cam, width, height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top));
    if (view) {
      // The parent still pans with the world. An inverse camera plane keeps its
      // actual display boxes at viewport dimensions, rather than 25k world pixels.
      this.plane.style.cssText = `position:absolute;left:${view.x}px;top:${view.y}px;width:${width}px;height:${height}px;transform:scale(${1 / cam.s});transform-origin:0 0;overflow:hidden;pointer-events:none`;
      if (this.live) {
        this.live.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
        this.live.setAttribute("width", String(width)); this.live.setAttribute("height", String(height));
      }
      this.paint();
    }
    if (scaling || resizing) {
      clearTimeout(this.timer);
      // Keep the old crop in place while scaling. Only render at the final resolution.
      this.timer = window.setTimeout(() => { this.timer = 0; this.sharpen(); }, SETTLE_MS);
    } else if (!this.timer) this.sharpen();
  }

  private view(): Crop | null {
    const { s } = this.cam;
    const viewport = outsideView(this.cam, this.width, this.height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top));
    if (!viewport) return null;
    const left = viewport.x, top = viewport.y;
    const x0 = Math.max(0, left), y0 = Math.max(0, top);
    const x1 = Math.min(this.w, left + this.width / s), y1 = Math.min(this.h, top + this.height / s);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, density: s * devicePixelRatio };
  }

  private covers(crop: Crop | null, view: Crop) {
    if (!crop || Math.abs(crop.density / view.density - 1) > 0.01) return false;
    // Renew before the viewport reaches the crop's edge. Grounds edges need no overscan.
    const pad = 64 / this.cam.s;
    const epsilon = 0.01; // avoid repeated jobs from float rounding at the grounds' edges
    return crop.x <= Math.max(0, view.x - pad) + epsilon && crop.y <= Math.max(0, view.y - pad) + epsilon
      && crop.x + crop.w >= Math.min(this.w, view.x + view.w + pad) - epsilon
      && crop.y + crop.h >= Math.min(this.h, view.y + view.h + pad) - epsilon;
  }

  private sharpen() {
    if (this.dead || !this.layer.isConnected) return;
    const view = this.view();
    if (!view || view.density <= this.overviewDensity) {
      this.detail.style.visibility = "hidden";
      return;
    }
    if (this.covers(this.crop, view)) { this.paint(); return; }
    const cached = this.history.findIndex((entry) => this.covers(entry.crop, view));
    if (cached >= 0) {
      const entry = this.history.splice(cached, 1)[0];
      this.install(entry.crop, entry.canvas);
      return;
    }
    if (this.pending) return; // one raster job at a time, never one per pointer event
    const pad = MARGIN / this.cam.s;
    const x = Math.max(0, view.x - pad), y = Math.max(0, view.y - pad);
    const crop = { x, y, w: Math.min(this.w, view.x + view.w + pad) - x, h: Math.min(this.h, view.y + view.h + pad) - y, density: view.density };
    this.pending = crop;
    // Paint off-DOM, then replace the old pixels atomically, without flashing a blank buffer.
    const next = document.createElement("canvas");
    void this.raster(crop, next).then((ok) => {
      this.pending = null;
      if (!ok) return;
      const current = this.view();
      if (!current || Math.abs(current.density / crop.density - 1) > 0.01) { if (!this.timer) this.sharpen(); return; }
      // Do not replace a usable image with a job the camera has already moved away from.
      if (this.covers(crop, current)) this.install(crop, next);
      else this.remember(crop, next);
      if (!this.timer) this.sharpen();
    });
  }

  private remember(crop: Crop, canvas: HTMLCanvasElement) {
    this.history.push({ crop, canvas });
    if (this.history.length > 2) {
      const old = this.history.shift()!;
      old.canvas.width = old.canvas.height = 0;
    }
  }
  private install(crop: Crop, canvas: HTMLCanvasElement) {
    if (this.crop && this.sharp) this.remember(this.crop, this.sharp);
    this.sharp = canvas; this.crop = crop;
    this.paint();
  }

  private paint() {
    if (this.dead || !(this.width > 0) || !(this.height > 0)) return;
    const viewport = outsideView(this.cam, this.width, this.height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top));
    if (!viewport) return;
    const dpr = devicePixelRatio || 1;
    const width = Math.max(1, Math.ceil(this.width * dpr)), height = Math.max(1, Math.ceil(this.height * dpr));
    for (const canvas of [this.preview, this.detail]) {
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      canvas.style.width = `${this.width}px`; canvas.style.height = `${this.height}px`;
    }
    const draw = (target: HTMLCanvasElement, source: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number }) => {
      const ctx = target.getContext("2d")!, p = outsideProjection(rect, viewport, this.cam.s);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
      if (p) ctx.drawImage(source, p.sx * source.width / rect.w, p.sy * source.height / rect.h, p.sw * source.width / rect.w, p.sh * source.height / rect.h, p.dx, p.dy, p.dw, p.dh);
      target.style.visibility = p ? "visible" : "hidden";
    };
    if (this.overviewReady) draw(this.preview, this.overview, { x: 0, y: 0, w: this.w, h: this.h });
    const needsSharp = this.cam.s * dpr > this.overviewDensity;
    if (this.sharp && this.crop && needsSharp) {
      draw(this.detail, this.sharp, this.crop);
      this.detail.dataset.sourceDensity = String(this.crop.density);
      const current = this.view();
      this.detail.dataset.sharp = current && this.covers(this.crop, current) ? "1" : "0";
    } else {
      this.detail.style.visibility = "hidden";
      this.detail.dataset.sourceDensity = ""; this.detail.dataset.sharp = "0";
    }
  }

  snapshot() {
    if (!this.preview.width || !this.preview.height) return undefined;
    const canvas = document.createElement("canvas"); canvas.width = this.preview.width; canvas.height = this.preview.height;
    const ctx = canvas.getContext("2d")!;
    if (this.preview.style.visibility === "visible") ctx.drawImage(this.preview, 0, 0);
    if (this.detail.style.visibility === "visible") ctx.drawImage(this.detail, 0, 0);
    return canvas;
  }

  private async raster(crop: Crop, canvas: HTMLCanvasElement) {
    const width = Math.max(1, Math.ceil(crop.w * crop.density));
    const height = Math.max(1, Math.ceil(crop.h * crop.density));
    // Change the SVG viewport itself. Cropping a giant <img> with drawImage still asks
    // Chromium to allocate its enormous intrinsic raster before applying the crop.
    const svg = this.svg.replace(/<svg\b[^>]*>/, (root) => root
      .replace(/\bviewBox="[^"]*"/, `viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}"`)
      .replace(/\bwidth="[^"]*"/, `width="${width}"`)
      .replace(/\bheight="[^"]*"/, `height="${height}"`));
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    this.urls.add(url);
    try {
      const img = new Image(); img.src = url;
      await img.decode();
      if (this.dead || !this.layer.isConnected) return false;
      const started = beginSystem();
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      endSystem("scenery", started);
      return true;
    } catch { return false; }
    finally { URL.revokeObjectURL(url); this.urls.delete(url); }
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.timer);
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.plane.remove();
    this.overview.width = this.overview.height = 0;
    if (this.sharp) this.sharp.width = this.sharp.height = 0;
    for (const entry of this.history) entry.canvas.width = entry.canvas.height = 0;
    this.history.length = 0;
  }
}
