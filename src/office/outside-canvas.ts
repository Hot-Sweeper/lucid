// Retain the original static SVG's geometry once, then paint only the camera's
// visible pixels. No SVG viewport changes, image decoding or layout in draw().
type View = { x: number; y: number; w: number; h: number };
type Bounds = { x: number; y: number; w: number; h: number };
type Paint = { color: string } | { pattern: string } | null;
type Shape = {
  kind: 'shape'; path: Path2D; matrix: DOMMatrix; stretch: number; bounds: Bounds | null;
  fill: Paint; stroke: Paint; fillOpacity: number; strokeOpacity: number;
  rule: CanvasFillRule; width: number; cap: CanvasLineCap; join: CanvasLineJoin;
  miter: number; dash: number[]; offset: number;
};
type Group = { kind: 'group'; opacity: number; children: Command[]; bounds: Bounds | null };
type Command = Shape | Group;
type Pattern = { x: number; y: number; w: number; h: number; commands: Command[]; density: number; value: CanvasPattern | null };
type Frame = { x: number; y: number; density: number; densityY?: number; width: number; height: number; scratch: HTMLCanvasElement[] };
type Tile = { canvas: HTMLCanvasElement; x: number; y: number; core: { x: number; y: number; w: number; h: number } };
type CachedView = { crop: View & { density: number }; tiles: Tile[]; width: number; height: number };

const number = (value: string | null, fallback = 0) => value == null || value === '' ? fallback : Number(value);
const alpha = (value: string) => Math.max(0, Math.min(1, parseFloat(value) || 0));
const identity = () => new DOMMatrix();
function norm(m: DOMMatrix) {
  const a = m.a * m.a + m.b * m.b, b = m.c * m.c + m.d * m.d, c = m.a * m.c + m.b * m.d;
  return Math.sqrt((a + b + Math.sqrt((a - b) ** 2 + 4 * c * c)) / 2);
}

function opacityGroup(opacity: number, children: Command[]): Group {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const child of children) {
    if (child.kind === 'group' && !child.children.length) continue;
    const b = child.bounds;
    // Missing bounds must keep the whole group drawable. Child shape bounds
    // already include conservative stroke padding and their world transforms.
    if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) return { kind: 'group', opacity, children, bounds: null };
    x = Math.min(x, b.x); y = Math.min(y, b.y);
    right = Math.max(right, b.x + b.w); bottom = Math.max(bottom, b.y + b.h);
  }
  return { kind: 'group', opacity, children, bounds: x < Infinity ? { x, y, w: right - x, h: bottom - y } : null };
}

/** Unsupported SVG features leave the existing native SVG fallback available. */
export class OutsideVectorCanvas {
  readonly canvas = document.createElement('canvas');
  readonly element = document.createElement('div');
  private context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  private tiles: Tile[] = [];
  private history: CachedView[] = [];
  private commands: Command[] = [];
  private patterns = new Map<string, Pattern>();
  private scratch: HTMLCanvasElement[] = [];
  private supported = true;
  private patternBuild = new Set<string>();
  private crop: (View & { density: number }) | null = null;
  get available() { return this.supported; }
  private paints = 0;

  constructor(svg: SVGSVGElement, private onUnavailable: () => void = () => {}) {
    this.canvas.className = 'outside-vector-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transform-origin:0 0;will-change:transform';
    this.element.className = 'outside-vector-canvas';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transform-origin:0 0';
    const restored: { el: HTMLElement; css: string }[] = [];
    let parent: HTMLElement | null = svg.parentElement ?? (svg.getRootNode() as ShadowRoot).host as HTMLElement | null;
    while (parent) {
      if (getComputedStyle(parent).display === 'none') {
        restored.push({ el: parent, css: parent.style.cssText });
        parent.style.setProperty('opacity', '0', 'important');
        parent.style.setProperty('display', 'block', 'important');
      }
      parent = parent.parentElement ?? (parent.getRootNode() as ShadowRoot).host as HTMLElement | null;
    }
    try {
      for (const pattern of svg.querySelectorAll('defs pattern')) {
        if (pattern.getAttribute('patternUnits') !== 'userSpaceOnUse'
          || pattern.hasAttribute('patternTransform') || pattern.hasAttribute('viewBox')
          || pattern.hasAttribute('href') || pattern.getAttribute('patternContentUnits') === 'objectBoundingBox') {
          this.supported = false; continue;
        }
        const w = number(pattern.getAttribute('width')), h = number(pattern.getAttribute('height'));
        if (!(w > 0 && h > 0) || !pattern.id) { this.supported = false; continue; }
        this.patterns.set(pattern.id, {
          x: number(pattern.getAttribute('x')), y: number(pattern.getAttribute('y')), w, h,
          commands: this.readChildren(pattern, identity()), density: 0, value: null,
        });
      }
      this.commands = this.readChildren(svg, identity());
      const style = getComputedStyle(svg);
      if (style.opacity !== '1') this.commands = [opacityGroup(alpha(style.opacity), this.commands)];
    } catch { this.supported = false; }
    finally { for (const entry of restored.reverse()) entry.el.style.cssText = entry.css; }
  }

  private readChildren(parent: Element, parentMatrix: DOMMatrix): Command[] {
    const out: Command[] = [];
    for (const node of parent.children) {
      const tag = node.localName;
      if (['defs', 'style', 'title', 'desc', 'metadata'].includes(tag)) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (style.filter !== 'none' || style.clipPath !== 'none' || style.maskImage !== 'none'
        || style.mixBlendMode !== 'normal' || style.vectorEffect !== 'none'
        || !['normal', 'fill stroke markers'].includes(style.paintOrder)
        || !['miter', 'round', 'bevel'].includes(style.strokeLinejoin)
        || node.hasAttribute('marker-start') || node.hasAttribute('marker-mid') || node.hasAttribute('marker-end')) {
        this.supported = false; continue;
      }
      const graphic = node as SVGGraphicsElement;
      let matrix = parentMatrix;
      const transforms = graphic.transform?.baseVal;
      if (transforms?.numberOfItems) {
        let local = identity();
        for (let i = 0; i < transforms.numberOfItems; i++) local = local.multiply(transforms.getItem(i).matrix);
        matrix = parentMatrix.multiply(local);
      } else if (style.transform !== 'none') { this.supported = false; continue; }
      const opacity = alpha(style.opacity);
      if (!opacity) continue;
      if (tag === 'g') {
        const children = this.readChildren(node, matrix);
        if (opacity < 1) out.push(opacityGroup(opacity, children)); else out.push(...children);
        continue;
      }
      const path = this.path(node);
      if (!path) { this.supported = false; continue; }
      const fill = this.paint(style.fill), stroke = this.paint(style.stroke);
      let bounds: Bounds | null = null;
      try {
        const b = graphic.getBBox(), pad = stroke ? parseFloat(style.strokeWidth) * Math.max(1, parseFloat(style.strokeMiterlimit) || 4) / 2 : 0;
        const points = [[b.x - pad, b.y - pad], [b.x + b.width + pad, b.y - pad], [b.x - pad, b.y + b.height + pad], [b.x + b.width + pad, b.y + b.height + pad]]
          .map(([x, y]) => matrix.transformPoint({ x, y }));
        const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
        if (b.width > 0 || b.height > 0) bounds = { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
      } catch { /* Culling is optional; the canvas still clips every command. */ }
      const shape: Shape = {
        kind: 'shape', path, matrix, stretch: norm(matrix), bounds, fill, stroke,
        fillOpacity: alpha(style.fillOpacity), strokeOpacity: alpha(style.strokeOpacity),
        rule: style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', width: parseFloat(style.strokeWidth),
        cap: style.strokeLinecap as CanvasLineCap, join: style.strokeLinejoin as CanvasLineJoin,
        miter: parseFloat(style.strokeMiterlimit),
        dash: style.strokeDasharray === 'none' ? [] : style.strokeDasharray.split(/[ ,]+/).filter(Boolean).map(parseFloat),
        offset: parseFloat(style.strokeDashoffset),
      };
      if (opacity < 1) {
        if (fill && stroke) out.push(opacityGroup(opacity, [shape]));
        else { shape.fillOpacity *= opacity; shape.strokeOpacity *= opacity; out.push(shape); }
      } else out.push(shape);
    }
    return out;
  }

  private paint(value: string): Paint {
    if (value === 'none') return null;
    const ref = value.match(/^url\(["']?(?:[^#)]*#)([^"')]+)["']?\)$/);
    if (ref) return { pattern: ref[1] };
    if (/url\(|context-|var\(/.test(value)) { this.supported = false; return null; }
    return { color: value };
  }

  private path(node: Element): Path2D | null {
    const n = (name: string, fallback = 0) => number(node.getAttribute(name), fallback), path = new Path2D();
    switch (node.localName) {
      case 'path': return new Path2D(node.getAttribute('d') || '');
      case 'rect': {
        const x = n('x'), y = n('y'), w = n('width'), h = n('height');
        const rx = Math.min(w / 2, n('rx', n('ry'))), ry = Math.min(h / 2, n('ry', n('rx')));
        if (w <= 0 || h <= 0) return path;
        if (rx > 0 && ry > 0) path.roundRect(x, y, w, h, { x: rx, y: ry }); else path.rect(x, y, w, h);
        return path;
      }
      case 'circle': if (n('r') > 0) path.arc(n('cx'), n('cy'), n('r'), 0, 2 * Math.PI); return path;
      case 'ellipse': if (n('rx') > 0 && n('ry') > 0) path.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, 2 * Math.PI); return path;
      case 'line': path.moveTo(n('x1'), n('y1')); path.lineTo(n('x2'), n('y2')); return path;
      case 'polygon': case 'polyline': {
        const points = (node.getAttribute('points') || '').trim().split(/[ ,]+/).map(Number);
        for (let i = 0; i + 1 < points.length; i += 2) i ? path.lineTo(points[i], points[i + 1]) : path.moveTo(points[i], points[i + 1]);
        if (node.localName === 'polygon') path.closePath();
        return path;
      }
      default: return null;
    }
  }

  private resolve(paint: Paint, density: number): string | CanvasPattern | null {
    if (!paint) return null;
    if ('color' in paint) return paint.color;
    const p = this.patterns.get(paint.pattern);
    if (!p || this.patternBuild.has(paint.pattern)) { this.supported = false; return null; }
    if (p.value && p.density >= density) return p.value;
    const bucket = 2 ** (Math.ceil(Math.log2(Math.max(1 / 1024, density)) * 4) / 4);
    const width = Math.max(1, Math.ceil(p.w * bucket)), height = Math.max(1, Math.ceil(p.h * bucket));
    if (width > 8192 || height > 8192 || width * height > 16e6) { this.supported = false; return null; }
    const tile = document.createElement('canvas'); tile.width = width; tile.height = height;
    const ctx = tile.getContext('2d', { willReadFrequently: true });
    if (!ctx || !this.context) return null;
    this.patternBuild.add(paint.pattern);
    // Round backing pixels upward without changing the repeating tile's logical
    // period. Both axes still meet or exceed the requested screen density.
    this.render(p.commands, ctx, { x: p.x, y: p.y, density: width / p.w, densityY: height / p.h, width, height, scratch: [] }, 0);
    this.patternBuild.delete(paint.pattern);
    const value = this.context.createPattern(tile, 'repeat');
    if (!value) return null;
    value.setTransform(new DOMMatrix([p.w / width, 0, 0, p.h / height, p.x, p.y]));
    p.value = value; p.density = bucket;
    return value;
  }

  private render(commands: Command[], ctx: CanvasRenderingContext2D, f: Frame, depth: number) {
    const right = f.x + f.width / f.density, bottom = f.y + f.height / (f.densityY ?? f.density);
    for (const command of commands) {
      const b = command.bounds;
      if (b && (b.x > right || b.y > bottom || b.x + b.w < f.x || b.y + b.h < f.y)) continue;
      if (command.kind === 'group') {
        if (!command.children.length) continue;
        const layer = f.scratch[depth] ??= document.createElement('canvas');
        // Edge tiles vary by a pixel or leave a partial final row. Keep the
        // backing store large enough instead of reallocating it at every edge.
        if (layer.width < f.width) layer.width = f.width;
        if (layer.height < f.height) layer.height = f.height;
        const buffer = layer.getContext('2d', { willReadFrequently: true }); if (!buffer) { this.supported = false; continue; }
        buffer.setTransform(1, 0, 0, 1, 0, 0); buffer.clearRect(0, 0, f.width, f.height);
        this.render(command.children, buffer, f, depth + 1);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = command.opacity;
        ctx.drawImage(layer, 0, 0, f.width, f.height, 0, 0, f.width, f.height); ctx.globalAlpha = 1;
        continue;
      }
      const c = command;
      const m = c.matrix, d = f.density, dy = f.densityY ?? d;
      ctx.setTransform(d * m.a, dy * m.b, d * m.c, dy * m.d, d * (m.e - f.x), dy * (m.f - f.y));
      const fill = this.resolve(c.fill, Math.max(d, dy) * c.stretch);
      if (fill && c.fillOpacity) { ctx.fillStyle = fill; ctx.globalAlpha = c.fillOpacity; ctx.fill(c.path, c.rule); }
      const stroke = this.resolve(c.stroke, Math.max(d, dy) * c.stretch);
      if (stroke && c.width > 0 && c.strokeOpacity) {
        ctx.strokeStyle = stroke; ctx.globalAlpha = c.strokeOpacity; ctx.lineWidth = c.width;
        ctx.lineCap = c.cap; ctx.lineJoin = c.join; ctx.miterLimit = c.miter;
        ctx.setLineDash(c.dash); ctx.lineDashOffset = c.offset; ctx.stroke(c.path);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Cull the retained grounds once for the entire crop. Each small backing tile
   * then walks only nearby geometry, preserving opacity groups and painter order. */
  private cropCommands(commands: Command[], view: View): Command[] {
    const right = view.x + view.w, bottom = view.y + view.h;
    const result: Command[] = [];
    for (const command of commands) {
      const b = command.bounds;
      if (b && (b.x > right || b.y > bottom || b.x + b.w < view.x || b.y + b.h < view.y)) continue;
      if (command.kind === 'shape') result.push(command);
      else {
        const children = this.cropCommands(command.children, view);
        if (children.length) result.push(children.length === command.children.length && children.every((child, i) => child === command.children[i]) ? command : { ...command, children });
      }
    }
    return result;
  }

  draw(view: View, scale: number, width: number, height: number, dpr: number, reserveCss = 0): boolean {
    if (!this.supported || !this.context || !(scale > 0 && width > 0 && height > 0 && dpr > 0)) return false;
    const needed = scale * dpr;
    const covers = (old: typeof this.crop, reserve = 0) => !!old && old.density >= needed * (1 - 1e-10)
      && old.x <= view.x - reserve && old.y <= view.y - reserve
      && old.x + old.w >= view.x + view.w + reserve && old.y + old.h >= view.y + view.h + reserve;
    let covered = covers(this.crop, reserveCss / scale);
    if (!covered) {
      // A historical crop near an edge is sharp for this frame but makes the next
      // small pan rebuild everything. Reuse it only with a useful movement reserve.
      // The current crop still remains valid right up to its actual coverage edge.
      const found = this.history.findIndex(entry => covers(entry.crop, Math.max(96, reserveCss) / scale));
      if (found >= 0) {
        const entry = this.history.splice(found, 1)[0]; this.remember();
        this.crop = entry.crop; this.tiles = entry.tiles;
        this.canvas.width = entry.width; this.canvas.height = entry.height;
        this.element.replaceChildren(...this.tiles.map(t => t.canvas));
        covered = true;
      }
    }
    if (!covered) {
      this.remember(); this.tiles = []; this.element.replaceChildren();
      const margin = 192 / scale;
      this.crop = { x: view.x - margin, y: view.y - margin, w: view.w + margin * 2, h: view.h + margin * 2,
        density: 2 ** (Math.ceil(Math.log2(needed) * 4) / 4) };
      const maxDensity = Math.sqrt(24e6 / (this.crop.w * this.crop.h));
      // Anticipation pays off for wide woodland views. Close crops have much less
      // geometry; keep their density tight and preserve exact 1:1 pixel alignment.
      const ahead = 2 ** ((Math.ceil(Math.log2(needed) * 4) + (needed < .75 ? 1 : 0)) / 4);
      this.crop.density = Math.max(this.crop.density, Math.min(ahead, 2 ** (Math.floor(Math.log2(maxDensity) * 4) / 4)));
      const c = this.crop, w = Math.max(1, Math.ceil(c.w * c.density)), h = Math.max(1, Math.ceil(c.h * c.density));
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
      c.w = w / c.density; c.h = h / c.density;
    }
    const crop = this.crop!;
    // Keep the surface's layout size stable. Resizing its CSS box on every
    // wheel event makes Chromium rebuild large graphics tiles despite cached pixels.
    const factor = scale / crop.density;
    const cssWidth = `${this.canvas.width}px`, cssHeight = `${this.canvas.height}px`;
    if (this.canvas.style.width !== cssWidth) this.canvas.style.width = cssWidth;
    if (this.canvas.style.height !== cssHeight) this.canvas.style.height = cssHeight;
    this.canvas.style.transform = `translate(${(crop.x - view.x) * scale}px,${(crop.y - view.y) * scale}px) scale(${factor})`;
    this.element.style.width = cssWidth; this.element.style.height = cssHeight;
    this.element.style.transform = this.canvas.style.transform;
    for (const [key, value] of Object.entries({ sourceX: crop.x, sourceY: crop.y, sourceDensity: crop.density })) {
      const text = String(value);
      if (this.canvas.dataset[key] !== text) this.canvas.dataset[key] = text;
      if (this.element.dataset[key] !== text) this.element.dataset[key] = text;
    }
    if (covered) return true;
    const w = this.canvas.width, h = this.canvas.height;
    try {
      const commands = this.cropCommands(this.commands, crop);
      let index = 0;
      for (let y = 0; y < h; y += 510) for (let x = 0; x < w; x += 510) {
        const cw = Math.min(510, w - x), ch = Math.min(510, h - y);
        const left = x > 0 ? 1 : 0, top = y > 0 ? 1 : 0;
        const tw = cw + left + (x + cw < w ? 1 : 0), th = ch + top + (y + ch < h ? 1 : 0);
        let tile = this.tiles[index++];
        if (!tile) {
          tile = { canvas: document.createElement('canvas'), x, y, core: { x, y, w: cw, h: ch } };
          tile.canvas.style.cssText = 'position:absolute;pointer-events:none;contain:strict';
          tile.canvas.addEventListener('contextlost', () => {
            // A lost backing store can leave a whole rectangular tile blank even
            // though the retained crop still claims full coverage. Immediately
            // return presentation to the original, bounded SVG in that case.
            if (!this.supported) return;
            this.destroy();
            this.onUnavailable();
          });
          this.tiles.push(tile); this.element.append(tile.canvas);
        }
        tile.x = x - left; tile.y = y - top; tile.core = { x, y, w: cw, h: ch };
        if (tile.canvas.width !== tw) tile.canvas.width = tw;
        if (tile.canvas.height !== th) tile.canvas.height = th;
        tile.canvas.style.cssText = `position:absolute;pointer-events:none;contain:strict;left:${tile.x}px;top:${tile.y}px;width:${tw}px;height:${th}px`;
        const ctx = tile.canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx || typeof ctx.isContextLost === 'function' && ctx.isContextLost()) { this.supported = false; return false; }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, tw, th);
        this.render(commands, ctx, { x: crop.x + tile.x / crop.density, y: crop.y + tile.y / crop.density, density: crop.density, width: tw, height: th, scratch: this.scratch }, 0);
      }
      while (this.tiles.length > index) { const old = this.tiles.pop()!; old.canvas.remove(); old.canvas.width = old.canvas.height = 0; }
      this.canvas.dataset.paints = this.element.dataset.paints = String(++this.paints);
      this.trim();
      return this.supported;
    } catch { this.supported = false; return false; }
  }

  private remember() {
    if (this.crop && this.tiles.length) this.history.push({ crop: this.crop, tiles: this.tiles, width: this.canvas.width, height: this.canvas.height });
  }

  private trim() {
    const pixels = () => [...this.tiles, ...this.history.flatMap(e => e.tiles)].reduce((n, t) => n + t.canvas.width * t.canvas.height, 0);
    while (this.history.length > 2 || this.history.length && pixels() > 40e6) {
      // Wide crops are useful on zoom reversal. Release the narrower historical
      // view first rather than repainting the entire landscape on the way out.
      const index = this.history.reduce((best, e, i, a) => e.crop.w * e.crop.h < a[best].crop.w * a[best].crop.h ? i : best, 0);
      const [old] = this.history.splice(index, 1);
      for (const tile of old.tiles) { tile.canvas.remove(); tile.canvas.width = tile.canvas.height = 0; }
    }
  }

  snapshot() {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); for (const tile of this.tiles) ctx.drawImage(tile.canvas, tile.x, tile.y); }
    return this.canvas;
  }

  destroy() {
    this.canvas.remove(); this.canvas.width = this.canvas.height = 0;
    this.element.remove();
    for (const tile of this.tiles) tile.canvas.width = tile.canvas.height = 0;
    this.tiles.length = 0;
    for (const old of this.history) for (const tile of old.tiles) tile.canvas.width = tile.canvas.height = 0;
    this.history.length = 0;
    for (const canvas of this.scratch) canvas.width = canvas.height = 0;
    this.scratch.length = 0; this.patterns.clear(); this.commands.length = 0;
    this.crop = null; this.supported = false;
  }
}
