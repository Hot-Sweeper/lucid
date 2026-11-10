// Far robots drawn on a canvas instead of as live SVG.
//
// A seated robot is ~240 SVG elements. In a large office Chromium regroups every drawn element
// of the page into GPU layers on each frame that repaints anything (Layerize), so the cost of
// every frame grew with the number of robots. Zoomed out, each robot is instead one canvas:
// updating a canvas does not trigger that regrouping at all.
//
// Nothing about the robot changes: its rig keeps writing to its own (now undrawn) SVG, and this
// mirror draws that SVG's current state. Parts that never change shape are pictures made from
// the robot's own SVG once (shared between robots that look alike); parts whose shape changes
// every frame (arm strokes, contact shadows, chair spokes) are drawn as vector shapes. Close up,
// the real SVG is shown again.
import { pixelRatioBucket } from "../perf/render";
import { LOD_PX, monitorPx } from "../perf/lod";

const NS = "http://www.w3.org/2000/svg";
/** Space around the robot's box that its arms and props may reach into (SVG units). */
const MARGIN = 60;
/** Simple shapes drawn live each frame. Anything else is a picture. */
const PRIMS = new Set(["path", "ellipse", "circle", "rect"]);

type Group = { kind: "group"; el: SVGElement; children: Node[]; clip: Path2D | null };
type Pic = { kind: "pic"; el: SVGElement | null; els: SVGElement[]; key: string; box: Box; markup: string };
type Prim = { kind: "prim"; el: SVGGraphicsElement };
type Text = { kind: "text"; el: SVGTextElement };
type Node = Group | Pic | Prim | Text;
type Box = { x: number; y: number; w: number; h: number };

let enabled = true;
try { enabled = localStorage.getItem("lucid.canvasRobots") !== "0"; } catch { /* storage blocked: keep the default */ }
/** Whether robots at this zoom are drawn on their canvas: once a desk's monitor shows only its
 * app icon (perf/lod.ts), where robots are small and many are in view. localStorage
 * lucid.canvasRobots=0 turns it off. */
export const canvasRobotsWanted = (scale: number) => enabled && monitorPx(scale) < LOD_PX.icon;

/** Every robot canvas, so a zoom change can switch them all at once (a resting robot does not
 * redraw, and used to stay on a blurry canvas after zooming in). */
const all = new Set<RobotCanvas>();
/** The camera crossed a level or settled: switch and resharpen every robot now. */
export function syncRobotCanvases(scale: number) { for (const r of all) r.sync(scale); }

// ---- shared caches ---------------------------------------------------------------------------
const matrices = new Map<string, DOMMatrix>();
const paths = new Map<string, Path2D>();
/** Pictures by markup and density; robots that look alike share them. */
const pictures = new Map<string, { bitmap: ImageBitmap | null; promise: Promise<ImageBitmap | null>; used: number }>();
const boxes = new Map<string, Box>();
const MAX_PICTURES = 1200;

function trimShared() {
  if (matrices.size > 2000) matrices.clear();
  if (paths.size > 2000) paths.clear();
  if (pictures.size > MAX_PICTURES) {
    const old = [...pictures].sort((a, b) => a[1].used - b[1].used).slice(0, pictures.size - MAX_PICTURES);
    for (const [k, p] of old) { p.bitmap?.close(); pictures.delete(k); }
  }
}

/** An SVG transform attribute as a matrix (translate, rotate with centre, scale, matrix, skew). */
export function svgMatrix(value: string | null) {
  if (!value) return null;
  let m = matrices.get(value);
  if (m) return m;
  m = new DOMMatrix();
  for (const [, fn, raw] of value.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = raw.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === "translate") m.translateSelf(a[0] || 0, a[1] || 0);
    else if (fn === "scale") m.scaleSelf(a[0] ?? 1, a[1] ?? a[0] ?? 1);
    else if (fn === "rotate") {
      if (a.length >= 3) m.translateSelf(a[1], a[2]).rotateSelf(a[0]).translateSelf(-a[1], -a[2]);
      else m.rotateSelf(a[0] || 0);
    } else if (fn === "matrix" && a.length === 6) m.multiplySelf(new DOMMatrix(a));
    else if (fn === "skewX") m.skewXSelf(a[0] || 0);
    else if (fn === "skewY") m.skewYSelf(a[0] || 0);
  }
  matrices.set(value, m);
  return m;
}
const path2d = (d: string) => { let p = paths.get(d); if (!p) { p = new Path2D(d); paths.set(d, p); } return p; };

/** Replace var(--x, fallback) with the robot's own colors, innermost first. */
export function resolveVars(text: string, lookup: (name: string) => string) {
  let prev = "";
  while (prev !== text && text.includes("var(")) {
    prev = text;
    text = text.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name: string, fallback?: string) => lookup(name) || (fallback ?? "").trim());
  }
  return text;
}

// One hidden SVG where picture bounds are measured (the robot's own SVG is not drawn).
let measure: SVGSVGElement | null = null;
function measureBox(markup: string, defs: string): Box | null {
  const hit = boxes.get(markup);
  if (hit) return hit;
  if (!measure) {
    measure = document.createElementNS(NS, "svg");
    measure.setAttribute("aria-hidden", "true");
    measure.style.cssText = "position:fixed;left:-10000px;top:0;width:10px;height:10px;visibility:hidden;pointer-events:none;contain:strict";
    document.body.append(measure);
  }
  measure.innerHTML = `<defs>${defs}</defs><g>${markup}</g>`;
  let b: DOMRect | null = null;
  try { b = (measure.lastElementChild as SVGGElement).getBBox(); } catch { b = null; }
  measure.replaceChildren();
  if (!b || !(b.width > 0) || !(b.height > 0)) return null;
  // strokes and soft edges reach past the geometric box
  const widest = Math.max(0, ...[...markup.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1])));
  const pad = 4 + widest;
  const box = { x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad };
  boxes.set(markup, box);
  return box;
}

function picture(markup: string, defs: string, box: Box, density: number) {
  const key = `${density}|${markup}`;
  let p = pictures.get(key);
  if (p) { p.used = performance.now(); return p; }
  const w = Math.max(1, Math.ceil(box.w * density)), h = Math.max(1, Math.ceil(box.h * density));
  const svg = `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}"><defs>${defs}</defs>${markup}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = new Image(w, h);
  img.decoding = "async";
  img.src = url;
  const entry = { bitmap: null as ImageBitmap | null, used: performance.now(), promise: null as unknown as Promise<ImageBitmap | null> };
  entry.promise = img.decode().then(() => createImageBitmap(img, { resizeWidth: w, resizeHeight: h })).then((bitmap) => (entry.bitmap = bitmap), () => null).finally(() => URL.revokeObjectURL(url));
  pictures.set(key, entry);
  trimShared();
  return entry;
}

const INHERITED = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-opacity", "stroke-opacity", "fill-rule", "font-family", "font-size", "font-weight", "color"];
/** Presentation attributes an element would inherit from its ancestors inside the robot. */
function inheritedFrom(parent: Element | null, stop: Element) {
  const out: Record<string, string> = {};
  for (let e = parent; e && e !== stop.parentElement; e = e.parentElement) {
    for (const a of INHERITED) if (!(a in out)) { const v = e.getAttribute(a); if (v != null) out[a] = v; }
    if (e === stop) break;
  }
  return out;
}

/** Elements seen moving on their own; they become live nodes. */
const learned = new WeakSet<Element>();
// ---- one robot -------------------------------------------------------------------------------
export class RobotCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tree: Node[] | null = null;
  private pics: Pic[] = [];
  private defs = "";
  private vars = new Map<string, string>();
  private colors = new Map<string, string>();
  private dirty = true;
  private building = false;
  private density = 0;
  private ready = false;
  private active = false;
  private dead = false;
  private failed = false;
  private live = new WeakSet<Element>();
  private inherit = new WeakMap<Element, Record<string, string>>();
  private structure: MutationObserver;
  private statics: MutationObserver;
  private root: MutationObserver;

  /** Set by the robot: false while it may not use the canvas (walking in to its desk). */
  allowed: () => boolean = () => true;

  constructor(private svg: SVGSVGElement, private host: HTMLElement) {
    all.add(this);
    this.canvas = document.createElement("canvas");
    this.canvas.className = "robot-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    const vb = svg.viewBox.baseVal;
    this.canvas.style.cssText = `position:absolute;left:${-MARGIN}px;top:${-MARGIN}px;width:${vb.width + 2 * MARGIN}px;height:${vb.height + 2 * MARGIN}px;pointer-events:none;display:none`;
    // CPU-backed on purpose: a GPU canvas gets its own compositor layer, and dozens of them
    // (plus the desk parts they overlap, promoted too) made layer building slower than the SVG.
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    const invalidate = () => { this.dirty = true; };
    this.structure = new MutationObserver(invalidate);
    this.structure.observe(svg, { childList: true, subtree: true, characterData: true });
    this.root = new MutationObserver(() => { this.vars.clear(); this.colors.clear(); invalidate(); });
    this.root.observe(svg, { attributes: true, attributeFilter: ["style", "class"] });
    this.statics = new MutationObserver((records) => {
      for (const r of records) {
        // a picture's own position and fade are applied live; anything else redraws it
        if (r.type === "attributes" && this.live.has(r.target as Element) && /^(transform|opacity|fill-opacity|stroke-opacity|display|style)$/.test(r.attributeName || "")) continue;
        // a part inside a picture that moves or fades on its own (an accessory's sway) is drawn
        // live from the next rebuild on, instead of being redrawn as a picture every time
        if (r.type === "attributes" && /^(transform|opacity|fill-opacity|stroke-opacity)$/.test(r.attributeName || "")) learned.add(r.target as Element);
        this.dirty = true; return;
      }
    });
    host.append(this.canvas);
  }

  /** Called after the rig has drawn: show and paint the canvas when zoomed out, else the SVG. */
  frame(wanted: boolean, scale: number) {
    if (this.dead) return;
    if (!wanted || this.failed) { this.show(false); return; }
    const density = pixelRatioBucket(scale * (window.devicePixelRatio || 1));
    if (this.dirty && !this.building) void this.build(density);
    else if (density !== this.density && !this.building && this.tree) void this.resample(density);
    if (!this.ready || !this.tree) { this.show(false); return; }
    this.paint();
    this.show(true);
  }

  /** Switch to match the zoom without waiting for the robot's next draw: show the SVG right away
   * when zoomed in, or paint the current pose at the right resolution when zoomed out. */
  sync(scale: number) {
    if (this.dead) return;
    const wanted = canvasRobotsWanted(scale) && this.allowed() && !this.failed;
    if (!wanted) { this.show(false); return; }
    const density = pixelRatioBucket(scale * (window.devicePixelRatio || 1));
    if (this.dirty && !this.building) { void this.build(density); return; }
    if (!this.ready || !this.tree) return;
    if (density !== this.density && !this.building) void this.resample(density);
    if (!this.active) { this.paint(); this.show(true); }
  }

  /** Whether the canvas (not the SVG) is what is on screen. */
  get shown() { return this.active; }

  private show(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    this.canvas.style.display = on ? "" : "none";
    this.host.classList.toggle("canvas-robot", on);
  }

  // ---- building the display list --------------------------------------------------------------
  private lookup = (name: string) => {
    let v = this.vars.get(name);
    if (v === undefined) { v = getComputedStyle(this.svg).getPropertyValue(name).trim(); this.vars.set(name, v); }
    return v;
  };
  private color(value: string | null) {
    if (!value) return value;
    let c = this.colors.get(value);
    if (c === undefined) {
      c = resolveVars(value, this.lookup);
      if (c === "currentColor") c = getComputedStyle(this.svg).color;
      this.colors.set(value, c);
    }
    return c;
  }

  /** A copy of these elements that stands alone: shared vectors inlined, colors resolved. */
  private markupOf(els: Element[], stripOwn = false) {
    const parts: string[] = [];
    for (const el of els) {
      const copy = el.cloneNode(true) as Element;
      // a part's own position and fade (svg-write.ts may move a fade into fill-/stroke-opacity) are applied live
      if (stripOwn) for (const at of ["transform", "opacity", "fill-opacity", "stroke-opacity"]) copy.removeAttribute(at);
      if (stripOwn) (copy as SVGElement).style?.removeProperty("display");
      for (const use of [copy, ...copy.querySelectorAll("use")].filter((u) => u.localName === "use")) {
        const ref = (use.getAttribute("href") || use.getAttribute("xlink:href") || "").slice(1);
        const target = ref && (this.svg.querySelector(`[id="${ref}"]`) || document.getElementById(ref));
        if (!target) continue;
        const g = document.createElementNS(NS, "g");
        const x = Number(use.getAttribute("x") || 0), y = Number(use.getAttribute("y") || 0);
        const own = use.getAttribute("transform");
        const t = `${own || ""}${x || y ? ` translate(${x} ${y})` : ""}`.trim();
        if (t) g.setAttribute("transform", t);
        for (const a of ["opacity", "fill", "stroke", "class"]) { const v = use.getAttribute(a); if (v) g.setAttribute(a, v); }
        g.innerHTML = target.localName === "symbol" || target.localName === "g" ? target.innerHTML : target.outerHTML;
        if (use === copy) parts.push(g.outerHTML);
        else use.replaceWith(g);
      }
      if (copy.localName !== "use") parts.push(copy.outerHTML);
    }
    let text = resolveVars(parts.join(""), this.lookup);
    if (text.includes("currentColor")) text = text.replaceAll("currentColor", getComputedStyle(this.svg).color);
    // Pictures are drawn on a plain canvas: page fonts are not available inside them.
    return text.replace(/ xmlns="[^"]*"/g, "");
  }

  private async build(density: number) {
    this.building = true;
    this.dirty = false;
    try {
      this.statics.disconnect();
      this.live = new WeakSet();
      const defsEl = this.svg.querySelector(":scope > defs");
      this.defs = defsEl ? resolveVars(defsEl.innerHTML, this.lookup).replace(/ xmlns="[^"]*"/g, "") : "";
      this.pics = [];
      const tree = this.walk(this.svg);
      if (!tree) { this.failed = true; return; }
      for (const pic of this.pics) {
        for (const el of pic.el ? [pic.el] : pic.els) this.statics.observe(el, { attributes: true, subtree: true, characterData: true, childList: true });
        if (pic.el) this.live.add(pic.el);
      }
      await this.load(this.pics, density);
      if (this.dead) return;
      this.tree = tree;
      this.density = density;
      this.ready = true;
      this.resize();
    } finally { this.building = false; }
  }
  private async resample(density: number) {
    this.building = true;
    try {
      await this.load(this.pics, density);
      if (this.dead || this.dirty) return;
      this.density = density;
      this.resize();
    } finally { this.building = false; }
  }
  private async load(pics: Pic[], density: number) {
    const results = await Promise.all(pics.map((p) => picture(p.markup, this.defs, p.box, density).promise));
    if (results.some((r) => !r)) this.failed = true;   // something only the SVG can draw: keep showing it
  }
  private resize() {
    const vb = this.svg.viewBox.baseVal;
    const w = Math.ceil((vb.width + 2 * MARGIN) * this.density), h = Math.ceil((vb.height + 2 * MARGIN) * this.density);
    if (this.canvas.width === w && this.canvas.height === h) return;
    // resizing wipes the canvas: draw the current pose straight away, never leave it blank
    this.canvas.width = w; this.canvas.height = h;
    if (this.tree && this.active) this.paint();
  }

  private dynamic(el: Element) { return el.hasAttribute("data-r") || el.hasAttribute("data-spoke") || learned.has(el); }
  private hasDynamic(el: Element): boolean {
    if (el.querySelector("[data-r], [data-spoke]")) return true;
    for (const c of el.querySelectorAll("*")) if (learned.has(c)) return true;
    return false;
  }

  /** The SVG's children in paint order: moving groups, live shapes and still pictures. */
  private walk(parent: Element): Node[] | null {
    const out: Node[] = [];
    let run: SVGElement[] = [];
    const flush = () => {
      if (!run.length) return true;
      const pic = this.makePic(null, run);
      run = [];
      if (pic === false) return false;
      if (pic) out.push(pic);
      return true;
    };
    for (const el of Array.from(parent.children) as SVGElement[]) {
      const tag = el.localName;
      if (tag === "defs" || tag === "title" || tag === "desc" || tag === "metadata") continue;
      if (tag === "foreignObject") return null;
      const dyn = this.dynamic(el);
      if (!dyn && !this.hasDynamic(el)) { run.push(el); continue; }
      if (!flush()) return null;
      if (tag === "g" || tag === "svg" || tag === "a") {
        const children = this.walk(el);
        if (!children) return null;
        const clipRef = el.getAttribute("clip-path");
        let clip: Path2D | null = null;
        if (clipRef) { clip = this.clipPath(clipRef); if (!clip) return null; }
        if (el.hasAttribute("mask") || el.hasAttribute("filter")) return null;
        out.push({ kind: "group", el, children, clip });
      } else if (tag === "text") {
        this.inherit.set(el, inheritedFrom(el.parentElement, this.svg));
        out.push({ kind: "text", el: el as SVGTextElement });
      } else if (PRIMS.has(tag) && !el.hasAttribute("mask") && !el.hasAttribute("clip-path") && !el.hasAttribute("filter")
        && !/url\(/.test(`${el.getAttribute("fill") || ""}${el.getAttribute("stroke") || ""}`) && !el.firstElementChild) {
        this.inherit.set(el, inheritedFrom(el.parentElement, this.svg));
        out.push({ kind: "prim", el: el as SVGGraphicsElement });
      } else {
        const pic = this.makePic(el, [el]);
        if (pic === false) return null;
        if (pic) out.push(pic);
      }
    }
    return flush() ? out : null;
  }
  private makePic(el: SVGElement | null, els: SVGElement[]): Pic | null | false {
    const inherit = inheritedFrom(els[0].parentElement, this.svg);
    const attrs = Object.entries(inherit).map(([k, v]) => ` ${k}="${resolveVars(v, this.lookup).replace(/"/g, "&quot;")}"`).join("");
    const inner = this.markupOf(els, !!el);
    const markup = attrs && inner.trim() ? `<g${attrs}>${inner}</g>` : inner;
    if (!markup.trim()) return null;
    if (/<image[^>]*href="(?!data:)/.test(markup) || markup.includes("<foreignObject")) return false;
    const box = measureBox(markup, this.defs);
    if (!box) return null;   // nothing visible (for now); a change rebuilds
    const pic: Pic = { kind: "pic", el, els, key: markup, box, markup };
    this.pics.push(pic);
    return pic;
  }
  /** A clipPath made of simple shapes, as a canvas path. */
  private clipPath(ref: string) {
    const id = ref.match(/url\(#([^)]+)\)/)?.[1];
    const cp = id ? this.svg.querySelector(`[id="${id}"]`) : null;
    if (!cp || cp.getAttribute("clipPathUnits") === "objectBoundingBox") return null;
    const out = new Path2D();
    for (const s of Array.from(cp.children)) {
      const p = this.shapePath(s);
      if (!p) return null;
      const m = svgMatrix(s.getAttribute("transform"));
      out.addPath(p, m ?? undefined);
    }
    return out;
  }
  private shapePath(el: Element): Path2D | null {
    const n = (a: string) => Number(el.getAttribute(a) || 0);
    switch (el.localName) {
      case "path": { const d = el.getAttribute("d"); return d ? path2d(d) : null; }
      case "circle": { const p = new Path2D(); p.arc(n("cx"), n("cy"), Math.max(0, n("r")), 0, Math.PI * 2); return p; }
      case "ellipse": { const p = new Path2D(); p.ellipse(n("cx"), n("cy"), Math.max(0, n("rx")), Math.max(0, n("ry")), 0, 0, Math.PI * 2); return p; }
      case "rect": {
        const p = new Path2D(), w = n("width"), h = n("height");
        let rx = el.hasAttribute("rx") ? n("rx") : n("ry"), ry = el.hasAttribute("ry") ? n("ry") : rx;
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        if (rx || ry) p.roundRect(n("x"), n("y"), w, h, [{ x: rx, y: ry }] as unknown as number[]); else p.rect(n("x"), n("y"), w, h);
        return p;
      }
    }
    return null;
  }

  // ---- painting ------------------------------------------------------------------------------
  private hidden(el: SVGElement) {
    return el.getAttribute("display") === "none" || el.style.display === "none" || el.getAttribute("visibility") === "hidden" || el.style.visibility === "hidden";
  }
  private opacityOf(el: Element, name: string) {
    const v = this.attr(el, name);
    const n = v == null || v === "" ? 1 : parseFloat(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
  }
  private alpha(el: Element, attr = "opacity") {
    const v = el.getAttribute(attr);
    if (v == null || v === "") return 1;
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
  }

  private attr(el: Element, name: string) { return el.getAttribute(name) ?? this.inherit.get(el)?.[name] ?? null; }

  private paint() {
    const ctx = this.ctx, d = this.density;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(d, 0, 0, d, MARGIN * d, MARGIN * d);
    ctx.globalAlpha = 1;
    this.paintList(this.tree!, 1);
  }
  private paintList(list: Node[], alpha: number) {
    const ctx = this.ctx;
    for (const n of list) {
      if (n.kind === "pic" && !n.el) { this.paintPic(n); continue; }
      const el = n.kind === "pic" ? n.el! : n.el;
      if (this.hidden(el)) continue;
      const a = alpha * this.alpha(el);
      if (a <= 0) continue;
      const m = svgMatrix(el.getAttribute("transform"));
      ctx.save();
      if (m) ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.globalAlpha = a;
      if (n.kind === "group") { if (n.clip) ctx.clip(n.clip); this.paintList(n.children, a); }
      else if (n.kind === "pic") { ctx.globalAlpha = a * this.alpha(el, "fill-opacity") * this.alpha(el, "stroke-opacity"); this.paintPic(n); }
      else if (n.kind === "prim") this.paintPrim(n.el);
      else this.paintText(n.el);
      ctx.restore();
    }
  }
  private paintPic(p: Pic) {
    const entry = pictures.get(`${this.density}|${p.markup}`) ?? null;
    const bitmap = entry?.bitmap ?? this.anyDensity(p);
    if (!bitmap) return;
    if (entry) entry.used = performance.now();
    this.ctx.drawImage(bitmap, p.box.x, p.box.y, p.box.w, p.box.h);
  }
  /** While a new resolution loads, draw the picture from any resolution that exists. */
  private anyDensity(p: Pic) {
    for (const [key, entry] of pictures) if (entry.bitmap && key.endsWith(`|${p.markup}`)) return entry.bitmap;
    return null;
  }
  private paintPrim(el: SVGGraphicsElement) {
    const path = this.shapePath(el);
    if (!path) return;
    const ctx = this.ctx;
    const fill = this.color(this.attr(el, "fill") ?? "black");
    const stroke = this.color(this.attr(el, "stroke"));
    const base = ctx.globalAlpha;
    if (fill && fill !== "none" && fill !== "transparent") {
      ctx.globalAlpha = base * this.opacityOf(el, "fill-opacity");
      ctx.fillStyle = fill;
      ctx.fill(path, (this.attr(el, "fill-rule") as CanvasFillRule) || "nonzero");
    }
    if (stroke && stroke !== "none" && stroke !== "transparent") {
      const w = Number(this.attr(el, "stroke-width") ?? 1);
      if (w > 0) {
        ctx.globalAlpha = base * this.opacityOf(el, "stroke-opacity");
        ctx.strokeStyle = stroke;
        ctx.lineWidth = w;
        ctx.lineCap = (this.attr(el, "stroke-linecap") as CanvasLineCap) || "butt";
        ctx.lineJoin = (this.attr(el, "stroke-linejoin") as CanvasLineJoin) || "miter";
        ctx.stroke(path);
      }
    }
    ctx.globalAlpha = base;
  }
  private paintText(el: SVGTextElement) {
    const text = el.textContent?.trim();
    if (!text) return;
    const ctx = this.ctx;
    const size = parseFloat(this.attr(el, "font-size") || "12");
    const family = this.color(this.attr(el, "font-family")) || "sans-serif";
    ctx.font = `${this.attr(el, "font-weight") || "400"} ${size}px ${family}`;
    const anchor = el.getAttribute("text-anchor");
    ctx.textAlign = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = this.color(this.attr(el, "fill")) || "black";
    ctx.fillText(text, Number(el.getAttribute("x") || 0), Number(el.getAttribute("y") || 0));
  }

  destroy() {
    this.dead = true;
    all.delete(this);
    this.structure.disconnect(); this.statics.disconnect(); this.root.disconnect();
    this.canvas.width = this.canvas.height = 0;
    this.canvas.remove();
    this.host.classList.remove("canvas-robot");
  }
}
