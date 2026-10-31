// Never hand Chromium a grounds-sized SVG image. At close zoom it rasterized that image
// repeatedly during middle-button pans, stalling the GPU for hundreds of milliseconds.
// Keep a small overview bitmap and rasterize only the visible rectangle at screen density.
// The overview covers camera motion until an asynchronous sharp crop is ready.

type Camera = { x: number; y: number; s: number };
type Crop = { x: number; y: number; w: number; h: number; density: number };
const caches = new WeakMap<HTMLElement, OutsideRaster>();
const PREVIEW_WIDTH = 3200;
const MARGIN = 256; // screen pixels of overscan, so ordinary pans reuse the same crop
const SETTLE_MS = 220;

export function paintOutside(layer: HTMLElement, svg: string) {
  caches.get(layer)?.destroy();
  const cache = new OutsideRaster(layer, svg);
  caches.set(layer, cache);
}

export function updateOutside(layer: HTMLElement | null, cam: Camera, width: number, height: number) {
  if (layer) caches.get(layer)?.update(cam, width, height);
}

class OutsideRaster {
  private preview = document.createElement("canvas");
  private detail = document.createElement("canvas");
  private crop: Crop | null = null;
  private pending: Crop | null = null;
  private cam: Camera = { x: 0, y: 0, s: 0 };
  private width = 0;
  private height = 0;
  private timer = 0;
  private dead = false;
  private urls = new Set<string>();
  private w: number;
  private h: number;
  constructor(private layer: HTMLElement, private svg: string) {
    this.w = parseFloat(layer.style.width);
    this.h = parseFloat(layer.style.height);
    this.preview.className = "outside-quick";
    this.detail.className = "outside-detail";
    for (const cv of [this.preview, this.detail]) {
      cv.setAttribute("aria-hidden", "true");
      cv.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;visibility:hidden";
    }
    this.preview.style.width = "100%";
    this.preview.style.height = "100%";
    layer.prepend(this.preview, this.detail);
    const density = Math.min(1, PREVIEW_WIDTH / this.w);
    void this.raster({ x: 0, y: 0, w: this.w, h: this.h, density }, this.preview).then((ok) => {
      if (ok) this.preview.style.visibility = "visible";
    });
  }

  update(cam: Camera, width: number, height: number) {
    const scaling = cam.s !== this.cam.s;
    const resizing = width !== this.width || height !== this.height;
    this.cam = { ...cam }; this.width = width; this.height = height;
    if (scaling || resizing) {
      clearTimeout(this.timer);
      // Keep the old crop in place while scaling. Only render at the final resolution.
      this.timer = window.setTimeout(() => { this.timer = 0; this.sharpen(); }, SETTLE_MS);
    } else if (!this.timer) this.sharpen();
  }

  private view(): Crop | null {
    const { x, y, s } = this.cam;
    if (!(s > 0) || !this.width || !this.height) return null;
    const left = -x / s - parseFloat(this.layer.style.left);
    const top = -y / s - parseFloat(this.layer.style.top);
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
    if (!view || view.density <= Math.min(1, PREVIEW_WIDTH / this.w)) {
      this.detail.style.visibility = "hidden";
      return;
    }
    if (this.covers(this.crop, view)) { this.detail.style.visibility = "visible"; return; }
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
      next.className = "outside-detail";
      next.setAttribute("aria-hidden", "true");
      next.style.cssText = `position:absolute;left:${crop.x}px;top:${crop.y}px;width:${crop.w}px;height:${crop.h}px;pointer-events:none`;
      this.detail.replaceWith(next);
      this.detail = next;
      this.crop = crop;
      if (!this.timer) this.sharpen();
    });
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
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      return true;
    } catch { return false; }
    finally { URL.revokeObjectURL(url); this.urls.delete(url); }
  }

  destroy() {
    this.dead = true;
    clearTimeout(this.timer);
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.preview.remove(); this.detail.remove();
  }
}
