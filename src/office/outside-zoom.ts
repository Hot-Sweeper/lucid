// Never hand Chromium a grounds-sized SVG image. At close zoom it rasterized that image
// repeatedly during middle-button pans, stalling the GPU for hundreds of milliseconds.
// Keep a small overview bitmap and rasterize only viewport crops at screen density.
// Two recent crops are retained for backtracking instead of rebuilding the same pixels.
// Retained geometry paints small sharp tiles during camera motion. Unsupported
// sources retain the bounded native SVG and settled image fallback below.
import { beginSystem, endSystem } from "../perf/metrics";
import { setSvgAttribute } from "../perf/svg-write";
import { outsideView, outsideProjection, outsideOverviewDensity } from "./outside-view";
import { OutsideVectorCanvas } from "./outside-canvas";

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
  private nativeHost = document.createElement("div");
  private native: SVGSVGElement;
  private vector: OutsideVectorCanvas | null = null;
  private nativeCrop: Crop | null = null;
  private previewCrop: Crop | null = null;
  private liveCrop: Crop | null = null;
  private paintCount = 0;
  private liveViewCount = 0;
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
    // The source is the exact self-contained SVG used for rasterization. A shadow
    // tree keeps its stylesheet and fragment IDs local, including svg{} variable
    // declarations that would otherwise alter every robot and room in the app.
    this.nativeHost.className = "outside-native";
    this.nativeHost.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;display:none";
    this.native = document.importNode(new DOMParser().parseFromString(svg, "image/svg+xml").documentElement, true) as unknown as SVGSVGElement;
    this.native.setAttribute("aria-hidden", "true");
    this.native.setAttribute("width", "1"); this.native.setAttribute("height", "1");
    this.native.style.cssText = "display:block;overflow:hidden";
    this.nativeHost.attachShadow({ mode: "open" }).append(this.native);
    for (const cv of [this.preview, this.detail]) {
      cv.setAttribute("aria-hidden", "true");
      cv.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;visibility:hidden";
    }
    this.plane.append(this.preview, this.detail, this.nativeHost);
    if (this.live) this.plane.append(this.live);
    layer.append(this.plane);
    // Build retained geometry after mounting. No scene traversal or image decode
    // is needed on later wheel events, and hidden paths can be culled correctly.
    window.setTimeout(() => { if (!this.dead && this.layer.isConnected) this.prepareVector(); }, 0);
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
    if (!scaling && !resizing && cam.x === this.cam.x && cam.y === this.cam.y) return;
    if (resizing) { this.previewCrop = null; this.liveCrop = null; }
    this.cam.x = cam.x; this.cam.y = cam.y; this.cam.s = cam.s;
    this.width = width; this.height = height;
    const view = outsideView(cam, width, height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top));
    if (view) {
      // The parent still pans with the world. An inverse camera plane keeps its
      // actual display boxes at viewport dimensions, rather than 25k world pixels.
      if (resizing) { this.plane.style.width = `${width}px`; this.plane.style.height = `${height}px`; }
      this.plane.style.transform = `translate(${view.x}px, ${view.y}px) scale(${1 / cam.s})`;
      if (this.live) {
        // Keep an original-vector viewport with overscan. Moving it inside the
        // clipped camera plane avoids rerasterizing the entire live SVG per pixel.
        const current = { ...view, density: cam.s * (devicePixelRatio || 1) };
        if (!this.covers(this.liveCrop, current)) {
          const pad = MARGIN / cam.s;
          this.liveCrop = { x: view.x - pad, y: view.y - pad, w: view.w + 2 * pad, h: view.h + 2 * pad, density: current.density };
          this.live.setAttribute("viewBox", `${this.liveCrop.x} ${this.liveCrop.y} ${this.liveCrop.w} ${this.liveCrop.h}`);
          this.liveViewCount++;
          this.plane.dataset.liveViews = String(this.liveViewCount);
        }
        const crop = this.liveCrop!;
        setSvgAttribute(this.live, "width", String(crop.w * cam.s)); setSvgAttribute(this.live, "height", String(crop.h * cam.s));
        this.live.style.transform = `translate(${(crop.x - view.x) * cam.s}px,${(crop.y - view.y) * cam.s}px)`;
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
    if (this.vector?.available) return;
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
    canvas.className = "outside-detail";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;visibility:hidden";
    this.detail.replaceWith(canvas);
    this.detail = canvas;
    this.sharp = canvas; this.crop = crop;
    this.paint();
  }

  private paint() {
    if (this.dead || !(this.width > 0) || !(this.height > 0)) return;
    const viewport = outsideView(this.cam, this.width, this.height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top));
    if (!viewport) return;
    const dpr = devicePixelRatio || 1;
    const place = (canvas: HTMLCanvasElement, crop: Crop) => {
      canvas.style.width = `${crop.w * this.cam.s}px`; canvas.style.height = `${crop.h * this.cam.s}px`;
      canvas.style.transform = `translate(${(crop.x - viewport.x) * this.cam.s}px,${(crop.y - viewport.y) * this.cam.s}px)`;
      canvas.style.visibility = outsideProjection(crop, viewport, this.cam.s) ? "visible" : "hidden";
    };
    const current = this.view(), density = this.cam.s * dpr;
    const sharp = !!current && !!this.crop && this.crop.density >= density * (1 - 1e-9)
      && this.crop.x <= current.x + .01 && this.crop.y <= current.y + .01
      && this.crop.x + this.crop.w >= current.x + current.w - .01 && this.crop.y + this.crop.h >= current.y + current.h - .01;
    const overview = this.overviewReady && this.overviewDensity >= density * (1 - 1e-9);
    if (current && !overview) {
      const vector = this.prepareVector();
      if (vector.draw(viewport, this.cam.s, this.width, this.height, dpr)) {
        vector.element.style.display = "";
        vector.element.dataset.sharp = "1";
        this.nativeHost.style.display = "none";
        this.preview.style.visibility = this.detail.style.visibility = "hidden";
        this.plane.dataset.presentation = "vector-canvas";
        return;
      }
    }
    if (this.vector) this.vector.element.style.display = "none";
    if (current && !sharp && !overview) {
      // Never magnify an undersized bitmap or leave an uncovered strip while the
      // asynchronous crop is pending. The original vectors remain screen-bounded.
      if (!this.nativeCrop || this.nativeCrop.density !== density || !this.covers(this.nativeCrop, current)) {
        const pad = MARGIN / this.cam.s;
        this.nativeCrop = { x: viewport.x - pad, y: viewport.y - pad, w: viewport.w + 2 * pad, h: viewport.h + 2 * pad, density };
        const crop = this.nativeCrop;
        setSvgAttribute(this.native, "viewBox", `${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
        setSvgAttribute(this.native, "width", String(crop.w * this.cam.s)); setSvgAttribute(this.native, "height", String(crop.h * this.cam.s));
      }
      const crop = this.nativeCrop;
      this.nativeHost.style.transform = `translate(${(crop.x - viewport.x) * this.cam.s}px,${(crop.y - viewport.y) * this.cam.s}px)`;
      this.nativeHost.style.display = "";
      this.preview.style.visibility = this.detail.style.visibility = "hidden";
      this.detail.dataset.sharp = "0";
      this.plane.dataset.presentation = "vectors";
      return;
    }
    this.nativeHost.style.display = "none";
    if (sharp && this.crop && !overview) {
      place(this.detail, this.crop);
      this.detail.dataset.sourceDensity = String(this.crop.density);
      this.detail.dataset.sharp = "1";
      this.preview.style.visibility = "hidden";
      this.plane.dataset.presentation = "detail";
      return;
    }
    this.plane.dataset.presentation = "overview";
    if (this.overviewReady) {
      const view = { ...viewport, density: this.cam.s * dpr };
      if (!this.covers(this.previewCrop, view)) {
        const pad = MARGIN / this.cam.s;
        const crop = this.previewCrop = { x: view.x - pad, y: view.y - pad, w: view.w + 2 * pad, h: view.h + 2 * pad, density: view.density };
        this.preview.width = Math.max(1, Math.ceil(crop.w * crop.density));
        this.preview.height = Math.max(1, Math.ceil(crop.h * crop.density));
        const ctx = this.preview.getContext("2d")!, p = outsideProjection({ x: 0, y: 0, w: this.w, h: this.h }, crop, this.cam.s);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (p) ctx.drawImage(this.overview, p.sx * this.overview.width / this.w, p.sy * this.overview.height / this.h, p.sw * this.overview.width / this.w, p.sh * this.overview.height / this.h, p.dx, p.dy, p.dw, p.dh);
        this.paintCount++; this.plane.dataset.paints = String(this.paintCount);
      }
      place(this.preview, this.previewCrop!);
    } else if (this.preview.style.visibility === "visible") {
      // A source replacement may temporarily carry a viewport snapshot from the
      // previous source, rather than a grounds crop. Preserve its DPR sizing.
      this.preview.style.width = `${this.width}px`; this.preview.style.height = `${this.height}px`;
      this.preview.style.transform = "";
    }
    this.detail.style.visibility = "hidden";
    this.detail.dataset.sourceDensity = ""; this.detail.dataset.sharp = "0";
  }

  private prepareVector() {
    if (!this.vector) {
      this.vector = new OutsideVectorCanvas(this.native);
      this.vector.element.style.display = "none";
      this.plane.insertBefore(this.vector.element, this.nativeHost);
    }
    return this.vector;
  }

  snapshot() {
    if (this.vector && this.vector.element.style.display !== "none") return undefined;
    if (this.nativeHost.style.display !== "none") return undefined;
    if (!this.preview.width || !this.preview.height) return undefined;
    const dpr = devicePixelRatio || 1;
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.ceil(this.width * dpr)); canvas.height = Math.max(1, Math.ceil(this.height * dpr));
    const ctx = canvas.getContext("2d")!;
    const viewport = outsideView(this.cam, this.width, this.height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top));
    if (!viewport) return undefined;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const copy = (source: HTMLCanvasElement, crop: Crop | null) => {
      if (!crop || source.style.visibility !== "visible") return;
      const p = outsideProjection(crop, viewport, this.cam.s);
      if (p) ctx.drawImage(source, p.sx * source.width / crop.w, p.sy * source.height / crop.h, p.sw * source.width / crop.w, p.sh * source.height / crop.h, p.dx, p.dy, p.dw, p.dh);
    };
    if (!this.previewCrop && this.preview.style.visibility === "visible") ctx.drawImage(this.preview, 0, 0, this.width, this.height);
    else copy(this.preview, this.previewCrop);
    copy(this.detail, this.crop);
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
      .replace(/\bheight="[^"]*"/, `height="${height}"`)
      .replace(/\s+preserveAspectRatio="[^"]*"/, "")
      .replace(/>$/, ' preserveAspectRatio="none">'));
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
    this.vector?.destroy(); this.vector = null;
    this.overview.width = this.overview.height = 0;
    if (this.sharp) this.sharp.width = this.sharp.height = 0;
    for (const entry of this.history) entry.canvas.width = entry.canvas.height = 0;
    this.history.length = 0;
  }
}
