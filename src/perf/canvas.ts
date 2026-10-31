import { pixelRatioBucket, renderPixelRatio } from "./render";

type SizedCanvas = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number; ratio: number };
const sized = new WeakMap<HTMLCanvasElement, SizedCanvas>();

/** Static image sources keep their declared density until their owner redraws them. */
export function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number, pixelRatio = 2) {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 2;
  canvas.width = Math.max(1, Math.ceil(w * ratio));
  canvas.height = Math.max(1, Math.ceil(h * ratio));
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  sized.set(canvas, { canvas, ctx, w, h, ratio });
  return ctx;
}

export function canvasPixelRatio(canvas: HTMLCanvasElement) { return sized.get(canvas)?.ratio ?? 2; }
export function canvasLogicalSize(canvas: HTMLCanvasElement) {
  const entry = sized.get(canvas);
  return entry ? { w: entry.w, h: entry.h } : { w: canvas.width / 2, h: canvas.height / 2 };
}

// Resizing resets the entire context. Preserve logical drawing state for the next
// complete redraw, including gradients, text and line dashes. Persistent clip/save
// stacks require their own explicit redraw and must not opt into live resizing.
const paintKeys = [
  "direction", "fillStyle", "filter", "font", "fontKerning", "fontStretch", "fontVariantCaps",
  "globalAlpha", "globalCompositeOperation", "imageSmoothingEnabled", "imageSmoothingQuality",
  "letterSpacing", "lineCap", "lineDashOffset", "lineJoin", "lineWidth", "miterLimit",
  "shadowBlur", "shadowColor", "shadowOffsetX", "shadowOffsetY", "strokeStyle", "textAlign",
  "textBaseline", "textRendering", "wordSpacing",
] as const;
function resize(entry: SizedCanvas, ratio: number) {
  const { canvas, ctx, w, h } = entry;
  const width = Math.max(1, Math.ceil(w * ratio)), height = Math.max(1, Math.ceil(h * ratio));
  if (width === canvas.width && height === canvas.height) return;
  const transform = ctx.getTransform(), dash = ctx.getLineDash();
  const values = paintKeys.map(key => ctx[key]);
  const scale = ratio / entry.ratio;
  canvas.width = width; canvas.height = height;
  for (let i = 0; i < paintKeys.length; i++) (ctx as any)[paintKeys[i]] = values[i];
  // Canvas shadow distances are backing pixels, unlike transformed path geometry.
  ctx.shadowBlur *= scale; ctx.shadowOffsetX *= scale; ctx.shadowOffsetY *= scale;
  ctx.setLineDash(dash);
  ctx.setTransform(transform.a * scale, transform.b * scale, transform.c * scale, transform.d * scale, transform.e * scale, transform.f * scale);
  entry.ratio = ratio;
}

/** Only buffers redrawn in full by this scope's next callback are registered here. */
export class LiveCanvases {
  private entries = new Set<HTMLCanvasElement>();
  constructor(private owner?: HTMLElement) {}
  add(canvas: HTMLCanvasElement) {
    if (!sized.has(canvas)) throw new Error("A live canvas must be sized with fitCanvas before registration");
    this.entries.add(canvas);
    return canvas;
  }
  remove(canvas: HTMLCanvasElement) { this.entries.delete(canvas); }
  prepare() {
    if (!this.entries.size) return;
    const required = renderPixelRatio(this.owner);
    // Quarter-octave buckets never undersample the displayed pixels. Retain a sharp
    // buffer during small reversals instead of reallocating on each wheel event.
    const ratio = pixelRatioBucket(required);
    for (const canvas of this.entries) {
      const entry = sized.get(canvas);
      if (!entry || !canvas.isConnected) continue;
      if (ratio > entry.ratio || ratio < entry.ratio / 2) resize(entry, ratio);
    }
  }
  clear() { this.entries.clear(); }
}
