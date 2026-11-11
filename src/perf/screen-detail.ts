import { screenDetail, SCREEN_DETAIL_WIDTHS, type ScreenDetail } from './screen-detail-budget';
import { paintDetailScene } from './detail-scene';
import './screen-detail.css';

type Reduced = Exclude<ScreenDetail, 'full'>;
type State = { host: HTMLElement; tier: ScreenDetail; visible: boolean; logicalWidth: number; dpr: number; observer: MutationObserver };
type Cached = { nodes: Node[]; dpr: number; logicalWidth: number; revision: number };
type Capture = { run: Generator<void, void, void>; bounds: DOMRect; tier: Reduced; revision: number; dpr: number; logicalWidth: number };
type Cache = { views: Map<Reduced, Cached>; lastPaint: number; width: number; height: number; revision: number; shellStyle: string };
const states = new WeakMap<HTMLElement, State>();
/** Every live host, so a theme change can recapture what each one shows. */
const live = new Set<State>();
const caches = new WeakMap<HTMLElement, Cache>();
const pending = new Map<HTMLElement, { state: State; due: number; urgent: boolean; capture?: Capture }>();
let timer = 0, idle = 0, frame = 0;
const CAPTURE_NODES = 64, CAPTURE_MS = 2;

// Derive simplified shell marks from existing SVG artwork, never per-app profiles.
let shellIcons = new WeakMap<HTMLElement, string>();
export function syncShellMark(item: HTMLElement) {
  const icon = item.querySelector('svg, img');
  if (!icon) return;
  const key = icon.outerHTML;
  if (shellIcons.get(item) === key) return;
  shellIcons.set(item, key);
  const shapes = Array.from(icon.querySelectorAll('path, rect, circle, ellipse, polygon'));
  const stops = Array.from(icon.querySelectorAll('stop')).map(el => el.getAttribute('stop-color')).filter((color): color is string => !!color);
  const fills = shapes.map(el => el.getAttribute('fill')).map(fill => fill?.startsWith('url(') ? stops[Math.floor((stops.length - 1) / 2)] : fill).filter((fill): fill is string => !!fill && !['none', 'currentColor', 'transparent'].includes(fill) && !fill.startsWith('url('));
  const colorful = (fill: string) => {
    const hex = fill.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
    if (!hex) return false;
    const rgb = hex.length === 3 ? [...hex].map(c => parseInt(c + c, 16)) : [0,2,4].map(i => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(...rgb) - Math.min(...rgb) > 35;
  };
  const color = fills.find(colorful) ?? fills[0] ?? getComputedStyle(icon).color;
  const silhouette = shapes[0];
  const round = silhouette && (['circle', 'ellipse'].includes(silhouette.tagName.toLowerCase()) ||
    silhouette.tagName.toLowerCase() === 'rect' && Number(silhouette.getAttribute('rx')) >= Number(silhouette.getAttribute('width')) * .4);
  item.style.setProperty('--detail-mark-color', color);
  item.style.setProperty('--detail-mark-radius', round ? '50%' : '3px');
}
function syncShell(host: HTMLElement) {
  host.querySelectorAll<HTMLElement>('.dock-item, .toast').forEach(syncShellMark);
}

function cacheFor(win: HTMLElement) {
  let cache = caches.get(win);
  if (!cache) { cache = { views: new Map(), lastPaint: -Infinity, width: 0, height: 0, revision: 0, shellStyle: '' }; caches.set(win, cache); }
  return cache;
}
function overlayFor(win: HTMLElement) {
  let overlay = win.querySelector<HTMLElement>(':scope > .screen-detail');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.className = 'screen-detail';
    overlay.setAttribute('aria-hidden', 'true'); win.append(overlay);
  }
  return overlay;
}
function showCached(win: HTMLElement, tier: Reduced, state: State) {
  const cached = cacheFor(win).views.get(tier);
  if (!cached || tier !== 'icon' && cached.dpr / cached.logicalWidth < state.dpr / state.logicalWidth) return false;
  const nodes = cached.nodes;
  const overlay = overlayFor(win);
  if (overlay.firstChild !== nodes[0]) overlay.replaceChildren(...nodes);
  overlay.dataset.detailTier = tier;
  if (win.dataset.detailReady !== '1') win.dataset.detailReady = '1';
  // Retain the last valid view during refresh instead of rebuilding in a camera event.
  return cached.revision === cacheFor(win).revision;
}
function enqueue(win: HTMLElement, state: State, transition = false) {
  if (!state.visible || state.tier === 'full' || win.dataset.renderHidden === '1') return;
  if (showCached(win, state.tier, state)) { pending.delete(win); return; }
  // Content refreshes are throttled; the overview refreshes least often (it is the cheapest to
  // leave a moment behind, and there are the most monitors in view).
  const interval = state.tier === 'lines' ? 750 : state.tier === 'shapes' ? 1500 : 4000;
  const due = transition ? 0 : cacheFor(win).lastPaint + interval;
  const previous = pending.get(win);
  pending.set(win, { state, due: Math.min(previous?.due ?? Infinity, due), urgent: transition || !!previous?.urgent, capture: previous?.capture?.tier === state.tier ? previous.capture : undefined });
  // A zoom transition must not wait behind a throttled content refresh.
  if (transition && timer) { clearTimeout(timer); timer = 0; }
  if (transition && idle) { window.cancelIdleCallback(idle); idle = 0; }
  pump();
}
function pump() {
  if (timer || idle || frame || !pending.size || document.hidden) return;
  // An uncached tier is visible feedback to zoom input. Do not leave the old
  // icon view onscreen while a busy renderer keeps postponing idle callbacks.
  // The same node/time limits apply on each frame; content refreshes stay idle.
  if ([...pending.values()].some(job => job.urgent) && window.requestAnimationFrame) frame = window.requestAnimationFrame(() => flush());
  else if (window.requestIdleCallback) idle = window.requestIdleCallback(flush, { timeout: 80 });
  else timer = window.setTimeout(() => flush(), 0);
}
function later(ms: number) { timer = window.setTimeout(() => { timer = 0; pump(); }, ms); }
// Cold captures yield between nodes; a large app cannot monopolize a wheel frame.
function flush(deadline?: IdleDeadline) {
  timer = idle = frame = 0;
  if (document.hidden) return;
  let soonest = Infinity;
  const now = performance.now();
  for (const [win, job] of pending) {
    const { state } = job;
    if (!win.isConnected || !state.visible || state.tier === 'full' || win.dataset.renderHidden === '1') { pending.delete(win); continue; }
    if (job.due > now) { soonest = Math.min(soonest, job.due); continue; }
    if (showCached(win, state.tier, state)) { pending.delete(win); pump(); return; }
    let capture = job.capture;
    if (!capture || capture.tier !== state.tier || capture.dpr / capture.logicalWidth < state.dpr / state.logicalWidth) {
      const cache = cacheFor(win);
      capture = { run: null!, bounds: win.getBoundingClientRect(), tier: state.tier,
        revision: cache.revision, dpr: state.dpr, logicalWidth: state.logicalWidth };
      capture.run = paint(win, state.tier, state, capture); job.capture = capture;
    }
    // Re-normalize after camera moves between idle chunks.
    capture.bounds = win.getBoundingClientRect();
    const until = performance.now() + Math.min(CAPTURE_MS, Math.max(.5, deadline?.timeRemaining() ?? CAPTURE_MS));
    let complete = false;
    for (let nodes = 0; nodes < CAPTURE_NODES; nodes++) {
      if (nodes && performance.now() >= until) break;
      if (capture.run.next().done) { complete = true; break; }
    }
    if (complete) {
      pending.delete(win);
      const overlay = win.querySelector<HTMLElement>(':scope > .screen-detail');
      if (overlay?.firstChild) {
        const cache = cacheFor(win);
        cache.views.set(capture.tier, { nodes: Array.from(overlay.childNodes), dpr: capture.dpr,
          logicalWidth: capture.logicalWidth, revision: capture.revision }); cache.lastPaint = now;
        if (capture.revision !== cache.revision) enqueue(win, state);
      }
    } else {
      pending.delete(win); pending.set(win, job); // round-robin across visible apps
    }
    if (pending.size) pump();
    return;
  }
  if (pending.size && Number.isFinite(soonest)) later(Math.max(16, soonest - now));
}

/** Automatic geometry-based LOD shared by all current and future WM apps.
 * Keep the source DOM mounted for robot targeting and application continuity.
 */
export function setScreenDetail(host: HTMLElement, visible: boolean, width: number, logicalWidth = 0) {
  let state = states.get(host);
  if (!state) {
    const observer = new MutationObserver(records => {
      const changed = new Map<HTMLElement, { motionOnly: boolean }>();
      let shellChanged = false;
      for (const record of records) {
        // Newly opened windows are reported on the shared layer, outside .win.
        if (record.type === 'childList') for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.matches('.win')) changed.set(node, { motionOnly: false });
        }
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (!target || target.closest('.screen-detail')) continue;
        // Adding/removing our own overlay is not an application content change.
        if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(n => n instanceof Element && n.matches('.screen-detail'))) continue;
        const win = target.closest<HTMLElement>('.win');
        if (!win) {
          // New/rebranded dock icons and toasts inherit the active shell tier.
          if ((record.type === 'childList' && target.closest('.dock, .toast-layer')) || (target.closest('.dock-item, .toast') && target.tagName.toLowerCase() === 'svg')) shellChanged = true;
          continue;
        }
        const previous = changed.get(win);
        changed.set(win, { motionOnly: (previous?.motionOnly ?? true) && record.target === win && record.type === 'attributes' && record.attributeName === 'style' });
      }
      if (shellChanged && state!.tier !== 'full') syncShell(host);
      for (const [win, { motionOnly }] of changed) {
        const cache = cacheFor(win);
        const shellStyle = [win.style.width, win.style.height, win.style.background, win.style.backgroundColor, win.style.color, win.style.borderRadius].join('|');
        if (motionOnly && cache.shellStyle === shellStyle) continue;
        cache.shellStyle = shellStyle;
        // WM resizing changes inline dimensions. Do not stretch an old capture
        // until the normal content-refresh throttle expires, or measure on zoom.
        const width = parseFloat(win.style.width), height = parseFloat(win.style.height);
        const resized = cache.width > 0 && (width > 0 && width !== cache.width || height > 0 && height !== cache.height);
        cache.revision++;
        // Keep the last complete frame on screen during the urgent replacement.
        // Clearing here leaves both the preview and its hidden source blank.
        if (resized) { cache.views.clear(); pending.delete(win); }
        enqueue(win, state!, resized);
      }
    });
    state = { host, tier: 'full', visible, logicalWidth: logicalWidth || host.clientWidth || host.offsetWidth || 820, dpr: window.devicePixelRatio || 1, observer }; states.set(host, state); live.add(state);
    observer.observe(host, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'src', 'data-render-hidden'] });
  }
  const tier = screenDetail(width);
  const transition = tier !== state.tier, appeared = visible && !state.visible;
  const dpr = window.devicePixelRatio || 1, nextWidth = logicalWidth || state.logicalWidth;
  const sharper = dpr / nextWidth > state.dpr / state.logicalWidth;
  state.tier = tier; state.visible = visible; state.logicalWidth = nextWidth; state.dpr = dpr;
  // Tier is a presentation choice even when drawing is paused (arriving/away
  // robots can leave an onscreen desktop behind). Never leave those at full text.
  if (tier === 'full') {
    if (!host.dataset.screenDetail) return;
    delete host.dataset.screenDetail;
    host.querySelectorAll<HTMLElement>('[data-detail-ready]').forEach(win => { delete win.dataset.detailReady; pending.delete(win); });
    return;
  }
  if (host.dataset.screenDetail !== tier) host.dataset.screenDetail = tier;
  if (transition) syncShell(host);
  if (!visible) { for (const [win, job] of pending) if (job.state === state) pending.delete(win); return; }
  if (transition || appeared || sharper) host.querySelectorAll<HTMLElement>('.win').forEach(win => enqueue(win, state!, true));
}
export function releaseScreenDetail(host: HTMLElement) {
  const state = states.get(host);
  if (state) { state.observer.disconnect(); states.delete(host); live.delete(state); }
  for (const [win, job] of pending) if (job.state === state) pending.delete(win);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pump(); });
// Captures hold resolved colours. A theme or T3 palette change restyles every app without a DOM
// mutation, so each reduced view is captured again (the old one stays up until the new one is done).
window.addEventListener('lucid:interface-theme', () => {
  for (const state of live) {
    if (!state.host.isConnected) continue;
    shellIcons = new WeakMap(); // marks drawn in currentColor follow the theme too
    syncShell(state.host);
    state.host.querySelectorAll<HTMLElement>('.win').forEach(win => {
      cacheFor(win).revision++;
      enqueue(win, state, true);
    });
  }
});

// Reuse the window manager's real app identity at both text-free tiers.
function appIcon(win: HTMLElement, width: number, height: number, overview: boolean) {
  const header = win.querySelector('.win-bar');
  const icon = header?.querySelector('svg, img, .ico');
  if (!icon) return null;
  const badge = document.createElement('div');
  badge.className = overview ? 'screen-detail-icon screen-detail-icon-overview' : 'screen-detail-icon';
  const size = overview
    ? Math.min(176, width * .42, height * .55)
    : Math.min(128, width * .32, Math.max(0, height - 26) * .42);
  badge.style.setProperty('--screen-detail-icon-size', `${size}px`);
  badge.style.color = getComputedStyle(header!).color;
  badge.append(icon.cloneNode(true));
  return badge;
}

const colored = (color: string) => color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)' && color !== 'none';
type Rect = { x: number; y: number; w: number; h: number };

/** A picture element's own pixels (canvas, image, video frame), placed like object-fit does. */
function paintMedia(ctx: CanvasRenderingContext2D, el: Element, r: Rect, style: CSSStyleDeclaration) {
  // Tag names rather than instanceof, so the headless check can drive this module.
  const media = el as HTMLCanvasElement & HTMLImageElement & HTMLVideoElement;
  let w = 0, h = 0;
  if (el.tagName === 'CANVAS') { w = media.width; h = media.height; }
  else if (el.tagName === 'IMG' && media.complete) { w = media.naturalWidth; h = media.naturalHeight; }
  else if (el.tagName === 'VIDEO' && media.readyState >= 2) { w = media.videoWidth; h = media.videoHeight; }
  if (!(w > 0 && h > 0)) return false;
  const source: CanvasImageSource = media;
  const fit = el.tagName === 'CANVAS' ? 'fill' : style.objectFit;
  let dx = r.x, dy = r.y, dw = r.w, dh = r.h;
  if (fit === 'contain' || fit === 'cover' || fit === 'scale-down') {
    const k = fit === 'cover' ? Math.max(r.w / w, r.h / h) : Math.min(r.w / w, r.h / h);
    dw = w * k; dh = h * k; dx = r.x + (r.w - dw) / 2; dy = r.y + (r.h - dh) / 2;
  }
  try {
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.drawImage(source, dx, dy, dw, dh); ctx.restore(); return true;
  } catch { ctx.restore(); return false; }
}

/** Top-level comma-separated parts of a CSS value (commas inside functions stay). */
function splitTop(value: string) {
  const out: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '(') depth++; else if (ch === ')') depth--;
    else if (ch === ',' && !depth) { out.push(value.slice(start, i).trim()); start = i + 1; }
  }
  out.push(value.slice(start).trim());
  return out.filter(Boolean);
}
const SIDES: Record<string, number> = { top: 0, 'top right': 45, 'right top': 45, right: 90, 'bottom right': 135, 'right bottom': 135, bottom: 180, 'bottom left': 225, 'left bottom': 225, left: 270, 'top left': 315, 'left top': 315 };
/** Background images: CSS gradients drawn as canvas gradients (app headers, art tiles and
 * buttons are often gradients, which backgroundColor alone left as an empty block). */
function paintBackgroundImage(ctx: CanvasRenderingContext2D, value: string, r: Rect, radius: number) {
  for (const layer of splitTop(value).reverse()) {
    const fn = layer.match(/^(repeating-)?(linear|radial)-gradient\((.*)\)$/s);
    if (!fn) continue;
    const args = splitTop(fn[3]);
    let angle = 180;
    if (fn[2] === 'linear' && args.length) {
      const first = args[0];
      const deg = first.match(/^(-?[\d.]+)(deg|turn|rad|grad)$/);
      if (deg) { angle = Number(deg[1]) * ({ deg: 1, turn: 360, rad: 180 / Math.PI, grad: .9 } as Record<string, number>)[deg[2]]; args.shift(); }
      else if (first.startsWith('to ')) { angle = SIDES[first.slice(3).trim()] ?? 180; args.shift(); }
    } else if (fn[2] === 'radial' && args.length && !/^(rgb|hsl|color|#|oklch|oklab|lab|lch|[a-z]+$)/i.test(args[0])) args.shift();
    const stops = args.map(arg => { const m = arg.match(/^(.*?)\s+(-?[\d.]+)%$/); return m ? { color: m[1], at: Number(m[2]) / 100 } : { color: arg, at: NaN }; });
    if (stops.length < 1) continue;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let gradient: CanvasGradient;
    if (fn[2] === 'linear') {
      const a = angle * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
      const half = (Math.abs(r.w * dx) + Math.abs(r.h * dy)) / 2;
      gradient = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    } else gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r.w, r.h) / 2);
    stops.forEach((stop, i) => {
      const at = Number.isFinite(stop.at) ? stop.at : stops.length === 1 ? 0 : i / (stops.length - 1);
      try { gradient.addColorStop(Math.max(0, Math.min(1, at)), stop.color); } catch { /* a colour the canvas cannot parse */ }
    });
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, radius); ctx.fill();
  }
}

const SVG_SHAPES = 'path, rect, circle, ellipse, line, polyline, polygon, text';
/** An inline SVG drawn from its own shapes and resolved colours, in the window's coordinates. */
function paintSvg(ctx: CanvasRenderingContext2D, svg: SVGSVGElement, toLocal: () => DOMMatrix, tier: ScreenDetail, budget: number) {
  const n = (el: Element, a: string) => Number(el.getAttribute(a)) || 0;
  let drawn = 0;
  for (const el of svg.querySelectorAll<SVGGraphicsElement>(SVG_SHAPES)) {
    if (drawn >= budget) break;
    if (el.closest('defs, clipPath, mask, symbol, pattern, marker')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.opacity === '0') continue;
    const ctm = el.getScreenCTM();
    if (!ctm) continue;
    drawn++;
    const m = toLocal().multiply(ctm);
    ctx.save();
    ctx.setTransform(ctx.getTransform().multiply(m));
    const alpha = Number(style.opacity) || 1;
    if (el.localName === 'text') {
      if (colored(style.fill)) {
        const b = el.getBBox(), thin = tier === 'lines';
        ctx.globalAlpha = (thin ? .45 : .3) * alpha; ctx.fillStyle = style.fill;
        ctx.fillRect(b.x, b.y + b.height * (thin ? .45 : .3), b.width, Math.max(1, b.height * (thin ? .16 : .4)));
      }
      ctx.restore(); continue;
    }
    const path = new Path2D();
    switch (el.localName) {
      case 'path': { const d = el.getAttribute('d'); if (d) path.addPath(new Path2D(d)); break; }
      case 'rect': { const w = n(el, 'width'), h = n(el, 'height'); const rx = Math.min(n(el, 'rx') || n(el, 'ry'), w / 2, h / 2); path.roundRect(n(el, 'x'), n(el, 'y'), w, h, rx); break; }
      case 'circle': path.arc(n(el, 'cx'), n(el, 'cy'), Math.max(0, n(el, 'r')), 0, Math.PI * 2); break;
      case 'ellipse': path.ellipse(n(el, 'cx'), n(el, 'cy'), Math.max(0, n(el, 'rx')), Math.max(0, n(el, 'ry')), 0, 0, Math.PI * 2); break;
      case 'line': path.moveTo(n(el, 'x1'), n(el, 'y1')); path.lineTo(n(el, 'x2'), n(el, 'y2')); break;
      default: {
        const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) i ? path.lineTo(pts[i], pts[i + 1]) : path.moveTo(pts[i], pts[i + 1]);
        if (el.localName === 'polygon') path.closePath();
      }
    }
    // Gradient fills use their first stop: the hue survives, the sheen does not need to.
    const paint = (value: string) => {
      const ref = value.match(/url\("?#([^")]+)"?\)/)?.[1];
      if (!ref) return value;
      const stop = svg.ownerDocument.getElementById(ref)?.querySelector('stop');
      return stop ? getComputedStyle(stop).stopColor : 'none';
    };
    const fill = paint(style.fill), stroke = paint(style.stroke);
    if (colored(fill) && el.localName !== 'line') {
      ctx.globalAlpha = alpha * (Number(style.fillOpacity) || 0); ctx.fillStyle = fill;
      ctx.fill(path, style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
    }
    const width = parseFloat(style.strokeWidth) || 0;
    if (colored(stroke) && width > 0) {
      ctx.globalAlpha = alpha * (Number(style.strokeOpacity) || 0); ctx.strokeStyle = stroke; ctx.lineWidth = width;
      ctx.lineCap = style.strokeLinecap as CanvasLineCap; ctx.lineJoin = style.strokeLinejoin as CanvasLineJoin;
      ctx.stroke(path);
    }
    ctx.restore();
  }
  return drawn;
}

// Node budgets per tier (the overview is captured only when its windows change).
const NODE_BUDGET: Record<Reduced, number> = { lines: 450, shapes: 250, icon: 250 };

function* paint(win: HTMLElement, tier: Reduced, state: State, capture: Capture): Generator<void, void, void> {
  const width = win.offsetWidth, height = win.offsetHeight, bounds = win.getBoundingClientRect();
  if (!width || !height || !bounds.width || !bounds.height) return;
  const cache = cacheFor(win); cache.width = width; cache.height = height;
  cache.shellStyle = [win.style.width, win.style.height, win.style.background, win.style.backgroundColor, win.style.color, win.style.borderRadius].join('|');
  const overlay = win.querySelector<HTMLElement>(':scope > .screen-detail');
  const canvas = document.createElement('canvas');
  // The line and shape views share one density that covers the largest reduced view, so a
  // transition can keep showing the previous shapes while its line view is built, still sharp.
  // The overview only needs to cover the icon cutoff. The widths are device pixels already.
  const required = SCREEN_DETAIL_WIDTHS[tier === 'icon' ? 'icon' : 'lines'] / state.logicalWidth;
  const scale = 2 ** (Math.ceil(Math.log2(Math.max(required, 1 / 1024)) * 4) / 4);
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  canvas.dataset.sourceDensity = String(scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = getComputedStyle(win).backgroundColor; ctx.fillRect(0, 0, width, height);
  // capture.bounds is measured again for every chunk, since the camera may move in between.
  const rect = (r: DOMRect): Rect => { const b = capture.bounds, kx = width / b.width, ky = height / b.height; return { x: (r.left - b.left) * kx, y: (r.top - b.top) * ky, w: r.width * kx, h: r.height * ky }; };
  const budget = NODE_BUDGET[tier];
  let count = 0;
  const walk = function* (el: Element, clip: Rect): Generator<void, void, void> {
    if (count >= budget || el === overlay) return;
    yield;
    count++;
    const style = getComputedStyle(el);
    // Visibility is not checked: a finished capture hides the app it covers (screen-detail.css).
    if (style.display === 'none' || style.opacity === '0') return;
    const r = rect(el.getBoundingClientRect());
    if (r.w <= 0 || r.h <= 0 || r.x > clip.x + clip.w || r.y > clip.y + clip.h || r.x + r.w < clip.x || r.y + r.h < clip.y) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip();
    const radius = Math.min(parseFloat(style.borderRadius) || 0, r.w / 2, r.h / 2);
    if (colored(style.backgroundColor)) {
      ctx.fillStyle = style.backgroundColor;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, radius); ctx.fill();
    }
    if (style.backgroundImage?.includes('gradient(')) paintBackgroundImage(ctx, style.backgroundImage, r, radius);
    if (paintDetailScene(ctx, el, r, tier)) { ctx.restore(); return; }
    if (['IMG', 'CANVAS', 'VIDEO'].includes(el.tagName) && paintMedia(ctx, el, r, style)) { ctx.restore(); return; }
    if (el.tagName === 'svg') {
      const b = capture.bounds, kx = width / b.width, ky = height / b.height;
      const toLocal = () => new DOMMatrix([kx, 0, 0, ky, -b.left * kx, -b.top * ky]);
      const drawn = paintSvg(ctx, el as SVGSVGElement, toLocal, tier, Math.min(160, Math.max(8, budget - count)));
      count += drawn;
      if (drawn) { ctx.restore(); return; }
    }
    if (['svg', 'IMG', 'CANVAS', 'VIDEO'].includes(el.tagName)) {
      ctx.fillStyle = style.color; ctx.globalAlpha = .18; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore(); return;
    }
    // Text becomes thin lines, and from further away soft bars, so a text app (chat, plan,
    // notes) keeps its recognisable rhythm instead of turning into an empty panel.
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      ctx.fillStyle = style.color;
      for (const line of range.getClientRects()) {
        const t = rect(line);
        if (tier === 'lines') { ctx.globalAlpha = .45; ctx.fillRect(t.x, t.y + t.h * .45, t.w, Math.max(1.5, t.h * .16)); }
        else { ctx.globalAlpha = .3; ctx.beginPath(); ctx.roundRect(t.x, t.y + t.h * .3, t.w, Math.max(2, t.h * .4), t.h * .2); ctx.fill(); }
      }
    }
    const nextClip = /hidden|clip|auto|scroll/.test(style.overflow + style.overflowY) ? { x: Math.max(clip.x, r.x), y: Math.max(clip.y, r.y), w: Math.max(0, Math.min(clip.x + clip.w, r.x + r.w) - Math.max(clip.x, r.x)), h: Math.max(0, Math.min(clip.y + clip.h, r.y + r.h) - Math.max(clip.y, r.y)) } : clip;
    ctx.globalAlpha = 1;
    for (const child of el.children) {
      if (count >= budget) break;
      yield* walk(child, nextClip);
    }
    ctx.restore();
  };
  yield* walk(win, { x: 0, y: 0, w: width, h: height });
  const layer = overlayFor(win);
  layer.replaceChildren(canvas);
  layer.dataset.detailTier = tier;
  if (tier !== 'lines') {
    const icon = appIcon(win, width, height, tier === 'icon');
    if (icon) layer.append(icon);
  }
  win.dataset.detailReady = '1';
}
