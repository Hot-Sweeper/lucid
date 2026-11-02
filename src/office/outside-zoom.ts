// Static grounds use world-aligned, independently decoded tiles. Camera movement
// transforms retained pixels instead of starving a viewport raster until release.
// Missing pixels retain the exact original SVG, clipped to those tile cores.
import { beginSystem, endSystem } from "../perf/metrics";
import { setSvgAttribute } from "../perf/svg-write";
import { planRasterTiles, snapTileCore, type RasterTile } from "../perf/tile-grid";
import { outsideView } from "./outside-view";
import { RasterQuietGate } from "../perf/raster-quiet";
import { mountNativeContourCull } from "./outside-cull";

type Camera = { x: number; y: number; s: number };
type Crop = { x: number; y: number; w: number; h: number; density: number };
type Tile = { plan: RasterTile; image: SVGImageElement; group: SVGGElement; rect: SVGRectElement; clip: SVGClipPathElement; url: string; used: number; off: () => void };
const caches = new WeakMap<HTMLElement, OutsideRaster>();
let clipSerial = 0;
const NS = "http://www.w3.org/2000/svg";
const PAUSED = Symbol("outside-paused");
const densityBucket = (required: number) => Math.max(required, 2 ** (Math.ceil(Math.log2(Math.max(required, 1 / 1024)) * 4) / 4));
const pixels = (plan: RasterTile) => Math.round(plan.crop.w * plan.density) * Math.round(plan.crop.h * plan.density);

export function paintOutside(layer: HTMLElement, svg: string) {
  // The next update immediately presents exact original vectors. Copying a
  // viewport snapshot here only allocates pixels that would be discarded there.
  caches.get(layer)?.destroy();
  caches.set(layer, new OutsideRaster(layer, svg));
}

export function updateOutside(layer: HTMLElement | null, cam: Camera, width: number, height: number, reserveCss = 0, origin = { x: 0, y: 0 }) {
  if (layer) caches.get(layer)?.update(cam, width, height, reserveCss, origin);
}

class OutsideRaster {
  private plane = document.createElement("div");
  private tileHost = document.createElementNS(NS, "g");
  private tileDefs = document.createElementNS(NS, "defs");
  private preview = document.createElement("canvas");
  private nativeHost = document.createElement("div");
  private native: SVGSVGElement;
  private nativeCull: ReturnType<typeof mountNativeContourCull>;
  private rasterSource: ReturnType<ReturnType<typeof mountNativeContourCull>["prepareSource"]>;
  private nativeContent = document.createElementNS(NS, "g");
  private missingClip = document.createElementNS(NS, "clipPath");
  private missingRects = new Map<string, SVGRectElement>();
  private clipId = `outside-missing-${++clipSerial}`;
  private clipKey = "";
  private nativeCrop: Crop | null = null;
  private liveCrop: Crop | null = null;
  private live: SVGSVGElement | null;
  private liveViews = 0;
  private tiles = new Map<string, Tile>();
  private plans: RasterTile[] = [];
  private requests: RasterTile[] = [];
  private wanted = new Set<string>();
  private protected = new Set<string>();
  private pending: { plan: RasterTile; canvas: HTMLCanvasElement } | null = null;
  private rasterQuiet = new RasterQuietGate(120);
  private cancelConsumer: (() => void) | null = null;
  private gateObserver: MutationObserver | null = null;
  private stopGates = () => {};
  private failed = new Map<string, number>();
  private cam: Camera = { x: 0, y: 0, s: 0 };
  private width = 0;
  private height = 0;
  private dpr = 0;
  private origin = { x: 0, y: 0 };
  private tick = 0;
  private budgetPixels = 0;
  private paints = 0;
  private dead = false;
  private urls = new Set<string>();
  private images = new Set<HTMLImageElement>();
  private canvasEvents = new Map<HTMLCanvasElement, () => void>();
  private lostCanvases = new Set<HTMLCanvasElement>();
  private w: number;
  private h: number;
  constructor(private layer: HTMLElement, private svg: string) {
    this.w = parseFloat(layer.style.width); this.h = parseFloat(layer.style.height);
    this.preview.width = this.preview.height = 0;
    this.preview.className = "outside-quick";
    this.preview.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;visibility:hidden";
    this.plane.className = "outside-viewport";
    this.plane.style.cssText = "position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;pointer-events:none";
    this.tileHost.setAttribute("class", "outside-vector-canvas outside-tiles");
    this.tileDefs.setAttribute("data-outside-tile-defs", "1");
    this.nativeContent.setAttribute("data-outside-source", "1");
    this.live = layer.querySelector<SVGSVGElement>(".outside-live");
    if (this.live) this.live.style.transformOrigin = "0 0";
    this.nativeHost.className = "outside-native";
    this.nativeHost.style.cssText = "position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;display:none";
    this.native = document.importNode(new DOMParser().parseFromString(svg, "image/svg+xml").documentElement, true) as unknown as SVGSVGElement;
    this.native.setAttribute("aria-hidden", "true");
    this.native.setAttribute("width", "1"); this.native.setAttribute("height", "1");
    this.native.style.cssText = "display:block;overflow:hidden";
    // Local fragment IDs also isolate source styles from room and robot SVGs.
    this.missingClip.setAttribute("id", this.clipId); this.missingClip.setAttribute("clipPathUnits", "userSpaceOnUse");
    // Clipping the SVG root uses its outer viewport coordinate space in some
    // engines. A child group shares the artwork's unambiguous world coordinates.
    for (const child of [...this.native.children]) if (child.localName !== "defs" && child.localName !== "style") this.nativeContent.append(child);
    const defs = document.createElementNS(NS, "defs"); defs.append(this.missingClip); this.native.append(this.nativeContent, defs, this.tileDefs, this.tileHost);
    this.nativeContent.setAttribute("clip-path", `url(#${this.clipId})`);
    this.nativeHost.attachShadow({ mode: "open" }).append(this.native);
    this.plane.append(this.preview, this.nativeHost);
    if (this.live) this.plane.append(this.live);
    layer.append(this.plane);
    this.nativeCull = mountNativeContourCull(this.native, this.nativeContent);
    this.rasterSource = this.nativeCull.prepareSource(this.svg);
    this.watchCanvas(this.preview);
    const gate = () => { if (this.dead) return; if (!this.layer.isConnected) this.destroy(); else { this.rasterQuiet.prune(); if (!this.active()) this.cancelConsumer?.(); else this.kick(); } };
    document.addEventListener?.("visibilitychange", gate);
    if (typeof MutationObserver !== "undefined") {
      this.gateObserver = new MutationObserver(gate);
      for (let element: HTMLElement | null = layer; element; element = element.parentElement) this.gateObserver.observe(element, { attributes: true, attributeFilter: ["inert"], childList: true });
    }
    this.stopGates = () => { document.removeEventListener?.("visibilitychange", gate); this.gateObserver?.disconnect(); this.gateObserver = null; };
  }

  private watchCanvas(canvas: HTMLCanvasElement) {
    if (this.canvasEvents.has(canvas)) return;
    const lost = () => {
      if (this.dead) return;
      this.lostCanvases.add(canvas); canvas.style.visibility = "hidden";
      this.paint(); this.kick();
    };
    const restored = () => {
      if (this.dead) return;
      this.lostCanvases.delete(canvas); this.failed.clear(); this.paint(); this.kick();
    };
    canvas.addEventListener("contextlost", lost); canvas.addEventListener("contextrestored", restored);
    this.canvasEvents.set(canvas, () => { canvas.removeEventListener("contextlost", lost); canvas.removeEventListener("contextrestored", restored); });
  }
  private releaseCanvas(canvas: HTMLCanvasElement) {
    this.canvasEvents.get(canvas)?.(); this.canvasEvents.delete(canvas); this.lostCanvases.delete(canvas);
    canvas.width = canvas.height = 0;
  }
  private releaseTile(key: string, tile: Tile) {
    this.tiles.delete(key); tile.off(); tile.image.removeAttribute("href"); tile.group.remove(); tile.clip.remove();
    URL.revokeObjectURL(tile.url); this.urls.delete(tile.url);
  }
  private padding() { return { x: Math.min(256, this.width / 4), y: Math.min(256, this.height / 4) }; }
  private viewportPixels() { return Math.ceil(this.width * this.dpr) * Math.ceil(this.height * this.dpr); }
  private pixelBudget() { return this.budgetPixels; }
  private retainedPixels() { return [...this.tiles.values()].reduce((sum, tile) => sum + pixels(tile.plan), 0); }
  private trim(reserve = 0) {
    let count = this.retainedPixels() + reserve;
    const limit = this.pixelBudget();
    for (const [key, tile] of [...this.tiles].sort((a, b) => a[1].used - b[1].used)) {
      if (count <= limit) break;
      if (this.protected.has(key)) continue;
      count -= pixels(tile.plan); this.releaseTile(key, tile);
    }
  }
  private view() {
    const view = outsideView(this.cam, this.width, this.height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top));
    if (!view) return null;
    const x = Math.max(0, view.x), y = Math.max(0, view.y), right = Math.min(this.w, view.x + view.w), bottom = Math.min(this.h, view.y + view.h);
    return right > x && bottom > y ? { x, y, w: right - x, h: bottom - y, density: this.cam.s * this.dpr } : null;
  }
  private covers(crop: Crop | null, view: Crop) {
    return !!crop && crop.density >= view.density * (1 - 1e-10) && crop.x <= view.x + .000001 && crop.y <= view.y + .000001
      && crop.x + crop.w >= view.x + view.w - .000001 && crop.y + crop.h >= view.y + view.h - .000001;
  }
  private active() { return !this.dead && this.layer.isConnected && !document.hidden && !this.layer.closest?.("[inert]"); }

  update(cam: Camera, width: number, height: number, reserveCss = 0, origin = { x: 0, y: 0 }) {
    if (this.dead || !(cam.s > 0) || !(width > 0) || !(height > 0)) return;
    const dpr = devicePixelRatio || 1, resizing = width !== this.width || height !== this.height || dpr !== this.dpr;
    if (resizing || cam.x !== this.cam.x || cam.y !== this.cam.y || cam.s !== this.cam.s) this.rasterQuiet.changed();
    this.cam = { ...cam }; this.width = width; this.height = height; this.dpr = dpr; this.origin = { ...origin };
    if (resizing) { this.liveCrop = null; this.nativeCrop = null; }
    const view = outsideView(cam, width, height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top))!;
    if (resizing) { this.plane.style.width = `${width}px`; this.plane.style.height = `${height}px`; }
    this.plane.style.transform = `translate(${view.x}px, ${view.y}px) scale(${1 / cam.s})`;
    const current = this.view();
    const bounds = { x: 0, y: 0, w: this.w, h: this.h };
    this.plans = current ? planRasterTiles(bounds, current, current.density) : [];
    this.budgetPixels = this.plans.reduce((sum, plan) => sum + pixels(plan), 0) + this.viewportPixels();
    if (current && this.plans.some(plan => !this.tiles.has(plan.key))) {
      // A small zoom-out can cross a bucket while every sharper tile still
      // covers it. Keep that complete plan if it fits the same viewport budget.
      for (const density of [...new Set([...this.tiles.values()].map(tile => tile.plan.density))].sort((a, b) => a - b)) {
        if (density < current.density * (1 - 1e-10)) continue;
        const sharper = planRasterTiles(bounds, current, density);
        if (sharper.length && sharper.every(plan => this.tiles.has(plan.key)) && sharper.reduce((sum, plan) => sum + pixels(plan), 0) <= this.budgetPixels) { this.plans = sharper; break; }
      }
    }
    this.wanted = new Set(this.plans.map(plan => plan.key));
    const centerX = view.x + view.w / 2, centerY = view.y + view.h / 2;
    const distance = (plan: RasterTile) => (plan.core.x + plan.core.w / 2 - centerX) ** 2 + (plan.core.y + plan.core.h / 2 - centerY) ** 2;
    this.plans.sort((a, b) => distance(a) - distance(b));
    this.requests = [...this.plans];
    if (current && reserveCss > 0 && this.plans.length) {
      // Idle prewarming uses the existing history allowance, never an extra
      // atlas. Visible cores stay first; only a bounded nearby fringe follows.
      let spare = this.pixelBudget() - this.plans.reduce((sum, plan) => sum + pixels(plan), 0);
      const fringe = planRasterTiles(bounds, current, this.plans[0].density, reserveCss / cam.s).filter(plan => !this.wanted.has(plan.key)).sort((a, b) => distance(a) - distance(b));
      for (const plan of fringe) if (pixels(plan) <= spare) { this.requests.push(plan); spare -= pixels(plan); }
    }
    this.protected = new Set(this.requests.map(plan => plan.key));
    this.rasterQuiet.prune();
    if (this.pending && !this.protected.has(this.pending.plan.key)) this.cancelConsumer?.();
    for (const key of this.failed.keys()) if (!this.protected.has(key)) this.failed.delete(key);
    for (const key of this.wanted) { const tile = this.tiles.get(key); if (tile) tile.used = ++this.tick; }
    if (this.live) {
      const visible = { ...view, density: cam.s * dpr };
      if (!this.covers(this.liveCrop, visible)) {
        const pad = this.padding(), px = pad.x / cam.s, py = pad.y / cam.s;
        this.liveCrop = { x: view.x - px, y: view.y - py, w: view.w + 2 * px, h: view.h + 2 * py, density: densityBucket(visible.density) };
        this.live.setAttribute("viewBox", `${this.liveCrop.x} ${this.liveCrop.y} ${this.liveCrop.w} ${this.liveCrop.h}`);
        this.plane.dataset.liveViews = String(++this.liveViews);
      }
      const crop = this.liveCrop!, sourceScale = crop.density / dpr;
      setSvgAttribute(this.live, "width", String(crop.w * sourceScale)); setSvgAttribute(this.live, "height", String(crop.h * sourceScale));
      this.live.style.transform = `translate(${(crop.x - view.x) * cam.s}px,${(crop.y - view.y) * cam.s}px) scale(${cam.s / sourceScale})`;
    }
    this.trim(this.pending ? pixels(this.pending.plan) : 0); this.paint(); this.kick();
  }

  private paint() {
    if (this.dead || !(this.width > 0) || !(this.height > 0)) return;
    const viewport = outsideView(this.cam, this.width, this.height, parseFloat(this.layer.style.left), parseFloat(this.layer.style.top))!;
    // Cull against the actual view, even while its larger native crop remains
    // reusable. The canonical SVG used by raster jobs remains untouched.
    this.nativeCull.update(viewport, this.cam.s * this.dpr);
    const missing = this.plans.filter(plan => !this.tiles.has(plan.key));
    const localCamera = { x: -viewport.x * this.cam.s, y: -viewport.y * this.cam.s, s: this.cam.s };
    const snaps = new Map(this.plans.map(plan => [plan.key, snapTileCore(plan.core, localCamera, this.dpr, this.origin)]));
    for (const [key, tile] of this.tiles) {
      const visible = this.wanted.has(key);
      tile.group.style.display = visible ? "" : "none";
      if (visible) {
        // All ready pixels and native holes share one SVG paint context. Separate
        // HTML/foreignObject surfaces round translucent edges independently.
        const { world } = snaps.get(key)!;
        for (const field of ["x", "y", "w", "h"] as const) setSvgAttribute(tile.rect, field === "w" ? "width" : field === "h" ? "height" : field, String(world[field]));
      }
    }
    const clipKey = missing.length ? missing.map(plan => plan.key).sort().join("|") + `:${localCamera.x}:${localCamera.y}:${localCamera.s}:${this.dpr}:${this.origin.x}:${this.origin.y}` : "";
    if (clipKey !== this.clipKey) {
      this.clipKey = clipKey;
      const keys = new Set(missing.map(plan => plan.key));
      for (const [key, rect] of this.missingRects) if (!keys.has(key)) { rect.remove(); this.missingRects.delete(key); }
      for (const plan of missing) {
        let rect = this.missingRects.get(plan.key);
        if (!rect) {
          rect = document.createElementNS(NS, "rect");
          rect.setAttribute("shape-rendering", "crispEdges");
          this.missingRects.set(plan.key, rect); this.missingClip.append(rect);
        }
        const { world } = snaps.get(plan.key)!;
        for (const key of ["x", "y", "w", "h"] as const) setSvgAttribute(rect, key === "w" ? "width" : key === "h" ? "height" : key, String(world[key]));
      }
    }
    const current = this.view();
    this.nativeContent.style.display = missing.length ? "" : "none";
    if (current) {
      if (!this.covers(this.nativeCrop, { ...viewport, density: current.density })) {
        const pad = this.padding(), px = pad.x / this.cam.s, py = pad.y / this.cam.s;
        this.nativeCrop = { x: viewport.x - px, y: viewport.y - py, w: viewport.w + 2 * px, h: viewport.h + 2 * py, density: densityBucket(current.density) };
        const crop = this.nativeCrop;
        setSvgAttribute(this.native, "viewBox", `${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
      }
      const crop = this.nativeCrop!, sourceScale = crop.density / this.dpr;
      setSvgAttribute(this.native, "width", String(crop.w * sourceScale)); setSvgAttribute(this.native, "height", String(crop.h * sourceScale));
      this.nativeHost.style.transform = `translate(${(crop.x - viewport.x) * this.cam.s}px,${(crop.y - viewport.y) * this.cam.s}px) scale(${this.cam.s / sourceScale})`;
      this.nativeHost.style.display = "";
    } else {
      this.nativeHost.style.display = "none";
      setSvgAttribute(this.native, "width", "1"); setSvgAttribute(this.native, "height", "1");
    }
    this.preview.style.visibility = "hidden";
    if (this.preview.width || this.preview.height) this.preview.width = this.preview.height = 0;
    this.plane.dataset.presentation = missing.length ? missing.length === this.plans.length ? "vectors" : "mixed" : this.plans.length ? "tiles" : "empty";
    this.plane.dataset.visibleTiles = String(this.plans.length); this.plane.dataset.missingTiles = String(missing.length);
    this.plane.dataset.queuedTiles = String(this.requests.length);
    this.plane.dataset.cachePixels = String(this.retainedPixels()); this.plane.dataset.pixelBudget = String(this.pixelBudget());
    this.plane.dataset.paints = String(this.paints);
    this.tileHost.dataset.sourceDensity = String(this.plans[0]?.density ?? 0);
    this.tileHost.dataset.sharp = missing.length ? "0" : "1";
    this.tileHost.dataset.sourceX = String(current?.x ?? 0); this.tileHost.dataset.sourceY = String(current?.y ?? 0);
  }

  private kick() {
    if (!this.active() || this.pending) return;
    const plan = this.requests.find(plan => !this.tiles.has(plan.key) && (this.failed.get(plan.key) ?? 0) <= Date.now());
    if (!plan) return;
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 0; canvas.className = "outside-raster-job"; this.watchCanvas(canvas);
    this.pending = { plan, canvas };
    this.plane.dataset.pending = "1";
    void this.raster(plan, canvas).then(async result => {
      let tile: Tile | null = null, paused = result === PAUSED;
      const url = typeof result === "string" ? result : null;
      if (url && this.active() && this.protected.has(plan.key)) {
        const consumed = await this.consume(plan, url);
        if (consumed === PAUSED) paused = true;
        else tile = consumed;
      } else if (url) paused = true;
      this.pending = null;
      this.plane.dataset.pending = "0";
      if (!tile || !this.active() || !this.protected.has(plan.key)) {
        if (tile) this.disposeTile(tile);
        if (url) { URL.revokeObjectURL(url); this.urls.delete(url); }
        if (!paused && !this.dead) this.failed.set(plan.key, Date.now() + 1000);
      } else {
        tile.group.dataset.pending = "0"; this.tiles.set(plan.key, tile); this.failed.delete(plan.key);
      }
      this.trim(); if (this.active()) { this.paint(); this.kick(); }
    });
  }

  private consume(plan: RasterTile, url: string): Promise<Tile | typeof PAUSED | null> {
    const clip = document.createElementNS(NS, "clipPath"), rect = document.createElementNS(NS, "rect"), group = document.createElementNS(NS, "g"), image = document.createElementNS(NS, "image");
    const id = `outside-core-${++clipSerial}`;
    clip.setAttribute("id", id); clip.setAttribute("clipPathUnits", "userSpaceOnUse"); rect.setAttribute("shape-rendering", "crispEdges"); rect.setAttribute("width", "0"); rect.setAttribute("height", "0"); clip.append(rect);
    group.setAttribute("class", "outside-tile"); group.setAttribute("clip-path", `url(#${id})`); group.dataset.pending = "1";
    for (const field of ["x", "y", "w", "h"] as const) image.setAttribute(field === "w" ? "width" : field === "h" ? "height" : field, String(plan.crop[field]));
    image.setAttribute("class", "outside-detail"); image.setAttribute("preserveAspectRatio", "none");
    image.dataset.sourceDensity = String(plan.density); image.dataset.sourceWidth = String(plan.width); image.dataset.sourceHeight = String(plan.height);
    return new Promise(resolve => {
      let done = false, ready = false;
      const finish = (result: Tile | typeof PAUSED | null) => {
        if (done) return; done = true; this.cancelConsumer = null; image.removeEventListener("load", load);
        if (result !== tile) this.disposeTile(tile);
        resolve(result);
      };
      const load = () => { if (!this.active() || !this.protected.has(plan.key)) finish(PAUSED); else { ready = true; finish(tile); } };
      const error = () => {
        if (!ready) { finish(null); return; }
        if (this.dead || this.tiles.get(plan.key)?.image !== image) return;
        this.releaseTile(plan.key, tile); this.failed.set(plan.key, Date.now() + 1000); this.paint();
      };
      const tile: Tile = { plan, image, group, rect, clip, url, used: ++this.tick, off: () => { image.removeEventListener("load", load); image.removeEventListener("error", error); } };
      this.cancelConsumer = () => finish(PAUSED); image.addEventListener("load", load); image.addEventListener("error", error);
      // Connect a zero-core consumer before assigning href. Native vectors keep
      // every pixel until this actual SVG image has loaded, not just its decoder.
      this.tileDefs.append(clip); group.append(image); this.tileHost.append(group); image.setAttribute("href", url);
    });
  }

  private disposeTile(tile: Tile) {
    tile.off(); tile.image.removeAttribute("href"); tile.group.remove(); tile.clip.remove(); URL.revokeObjectURL(tile.url); this.urls.delete(tile.url);
  }

  private async raster(plan: RasterTile, canvas: HTMLCanvasElement) {
    const needed = () => this.active() && this.protected.has(plan.key);
    if (!await this.rasterQuiet.wait(needed) || !needed()) { this.releaseCanvas(canvas); return PAUSED; }
    const crop = plan.crop, width = Math.round(crop.w * plan.density), height = Math.round(crop.h * plan.density);
    const svg = this.rasterSource.sourceFor(crop, plan.density).svg.replace(/<svg\b[^>]*>/, root => root
      .replace(/\bviewBox="[^"]*"/, `viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}"`)
      .replace(/\bwidth="[^"]*"/, `width="${width}"`)
      .replace(/\bheight="[^"]*"/, `height="${height}"`)
      .replace(/\s+preserveAspectRatio="[^"]*"/, "")
      .replace(/>$/, ' preserveAspectRatio="none">'));
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); this.urls.add(url);
    const image = new Image(); this.images.add(image);
    let png = "", decoder: HTMLImageElement | null = null, retained = false;
    try {
      image.src = url; await image.decode();
      if (!await this.rasterQuiet.wait(needed)) return PAUSED;
      // A small tile can still become obsolete while SVG decoding is pending.
      // Avoid its GPU readback/PNG encoding when the camera no longer needs it.
      if (!needed()) return PAUSED;
      if (this.lostCanvases.has(canvas)
        || !this.wanted.has(plan.key) && width * height > this.viewportPixels()) return null;
      this.trim(width * height);
      if (this.retainedPixels() + width * height > this.pixelBudget()) return null;
      const started = beginSystem();
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx || typeof ctx.isContextLost === "function" && ctx.isContextLost()) return null;
      ctx.drawImage(image, 0, 0, width, height); endSystem("scenery", started); this.paints++;
      // No permanent canvas+PNG pair. Release the SVG decoder before encoding,
      // and the source canvas before decoding the retained lossless PNG.
      image.removeAttribute("src"); this.images.delete(image);
      if (typeof ctx.isContextLost === "function" && ctx.isContextLost() || this.lostCanvases.has(canvas)) return null;
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      const lost = this.lostCanvases.has(canvas) || typeof ctx.isContextLost === "function" && ctx.isContextLost(); this.releaseCanvas(canvas);
      // Deferred SVG paint records can still reference these source bytes while
      // the encoder runs. The decoder is released above; revoke bytes afterward.
      URL.revokeObjectURL(url); this.urls.delete(url);
      if (!await this.rasterQuiet.wait(needed)) return PAUSED;
      if (!needed()) return PAUSED;
      if (!blob || lost) return null;
      png = URL.createObjectURL(blob); this.urls.add(png); decoder = new Image(); this.images.add(decoder); decoder.src = png; await decoder.decode();
      if (!needed()) return PAUSED;
      this.trim(width * height);
      if (this.retainedPixels() + width * height > this.pixelBudget()) return null;
      retained = true; return png;
    } catch { return null; }
    finally {
      image.removeAttribute("src"); this.images.delete(image); URL.revokeObjectURL(url); this.urls.delete(url); this.releaseCanvas(canvas);
      if (decoder) { decoder.removeAttribute("src"); this.images.delete(decoder); }
      if (png && !retained) { URL.revokeObjectURL(png); this.urls.delete(png); }
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.rasterQuiet.cancel();
    this.nativeCull.destroy();
    this.rasterSource.destroy();
    this.stopGates(); this.cancelConsumer?.(); this.cancelConsumer = null;
    for (const image of this.images) image.removeAttribute("src"); this.images.clear();
    for (const url of this.urls) URL.revokeObjectURL(url); this.urls.clear();
    this.plane.remove();
    for (const [key, tile] of [...this.tiles]) this.releaseTile(key, tile);
    for (const canvas of [...this.canvasEvents.keys()]) this.releaseCanvas(canvas);
    this.tiles.clear(); this.plans = []; this.requests = []; this.wanted.clear(); this.protected.clear(); this.failed.clear();
    this.missingRects.clear();
  }
}
