import { screenDetail, SCREEN_DETAIL_WIDTHS, type ScreenDetail } from './screen-detail-budget';
import { paintDetailScene } from './detail-scene';
import './screen-detail.css';

type Reduced = Exclude<ScreenDetail, 'full'>;
type State = { host: HTMLElement; tier: ScreenDetail; visible: boolean; logicalWidth: number; dpr: number; observer: MutationObserver };
type Cached = { nodes: Node[]; dpr: number; logicalWidth: number; revision: number };
type Capture = { run: Generator<void, void, void>; bounds: DOMRect; tier: Reduced; revision: number; dpr: number; logicalWidth: number };
type Cache = { views: Map<Reduced, Cached>; lastPaint: number; width: number; height: number; revision: number; iconRevision: number; shellStyle: string };
const states = new WeakMap<HTMLElement, State>();
const caches = new WeakMap<HTMLElement, Cache>();
const pending = new Map<HTMLElement, { state: State; due: number; capture?: Capture }>();
let timer = 0, idle = 0;
const CAPTURE_NODES = 64, CAPTURE_MS = 2;

// Derive simplified shell marks from existing SVG artwork, never per-app profiles.
const shellIcons = new WeakMap<HTMLElement, string>();
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
  if (!cache) { cache = { views: new Map(), lastPaint: -Infinity, width: 0, height: 0, revision: 0, iconRevision: 0, shellStyle: '' }; caches.set(win, cache); }
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
  if (win.dataset.detailReady !== '1') win.dataset.detailReady = '1';
  // Retain the last valid view during refresh instead of rebuilding in a camera event.
  return cached.revision === (tier === 'icon' ? cacheFor(win).iconRevision : cacheFor(win).revision);
}
function enqueue(win: HTMLElement, state: State, transition = false) {
  if (!state.visible || state.tier === 'full' || win.dataset.renderHidden === '1') return;
  if (showCached(win, state.tier, state)) { pending.delete(win); return; }
  const interval = state.tier === 'lines' ? 750 : 1500;
  const due = transition ? 0 : cacheFor(win).lastPaint + interval;
  const previous = pending.get(win);
  pending.set(win, { state, due: Math.min(previous?.due ?? Infinity, due), capture: previous?.capture?.tier === state.tier ? previous.capture : undefined });
  // A zoom transition must not wait behind a throttled content refresh.
  if (transition && timer) { clearTimeout(timer); timer = 0; }
  pump();
}
function pump() {
  if (timer || idle || !pending.size || document.hidden) return;
  if (window.requestIdleCallback) idle = window.requestIdleCallback(flush, { timeout: 80 });
  else timer = window.setTimeout(() => flush(), 0);
}
function later(ms: number) { timer = window.setTimeout(() => { timer = 0; pump(); }, ms); }
// Cold captures yield between nodes; a large app cannot monopolize a wheel frame.
function flush(deadline?: IdleDeadline) {
  timer = idle = 0;
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
        revision: state.tier === 'icon' ? cache.iconRevision : cache.revision, dpr: state.dpr, logicalWidth: state.logicalWidth };
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
        if (capture.revision !== (capture.tier === 'icon' ? cache.iconRevision : cache.revision)) enqueue(win, state);
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
      const changed = new Map<HTMLElement, { shell: boolean; motionOnly: boolean }>();
      let shellChanged = false;
      for (const record of records) {
        // Newly opened windows are reported on the shared layer, outside .win.
        if (record.type === 'childList') for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.matches('.win')) changed.set(node, { shell: true, motionOnly: false });
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
        const body = win.querySelector('.win-body');
        // The icon tier depends only on the shell, body surface and app icon.
        const shell = !body?.contains(target) || target === body || target.parentElement === body && record.type === 'attributes';
        const previous = changed.get(win);
        changed.set(win, { shell: (previous?.shell ?? false) || shell, motionOnly: (previous?.motionOnly ?? true) && record.target === win && record.type === 'attributes' && record.attributeName === 'style' });
      }
      if (shellChanged && state!.tier !== 'full') syncShell(host);
      for (const [win, { shell, motionOnly }] of changed) {
        const cache = cacheFor(win);
        const shellStyle = [win.style.width, win.style.height, win.style.background, win.style.backgroundColor, win.style.color, win.style.borderRadius].join('|');
        if (motionOnly && cache.shellStyle === shellStyle) continue;
        cache.shellStyle = shellStyle;
        // WM resizing changes inline dimensions. Do not stretch an old capture
        // until the normal content-refresh throttle expires, or measure on zoom.
        const width = parseFloat(win.style.width), height = parseFloat(win.style.height);
        const resized = cache.width > 0 && (width > 0 && width !== cache.width || height > 0 && height !== cache.height);
        cache.revision++;
        if (shell) cache.iconRevision++;
        if (resized) { cache.views.clear(); pending.delete(win); overlayFor(win).replaceChildren(); }
        enqueue(win, state!, resized);
      }
    });
    state = { host, tier: 'full', visible, logicalWidth: logicalWidth || host.clientWidth || host.offsetWidth || 820, dpr: window.devicePixelRatio || 1, observer }; states.set(host, state);
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
  if (state) { state.observer.disconnect(); states.delete(host); }
  for (const [win, job] of pending) if (job.state === state) pending.delete(win);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pump(); });

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

function* paint(win: HTMLElement, tier: ScreenDetail, state: State, capture: Capture): Generator<void, void, void> {
  const width = win.offsetWidth, height = win.offsetHeight, bounds = win.getBoundingClientRect();
  if (!width || !height || !bounds.width || !bounds.height) return;
  const cache = cacheFor(win); cache.width = width; cache.height = height;
  cache.shellStyle = [win.style.width, win.style.height, win.style.background, win.style.backgroundColor, win.style.color, win.style.borderRadius].join('|');
  const overlay = win.querySelector<HTMLElement>(':scope > .screen-detail');
  if (tier === 'icon') {
    const surface = document.createElement('div'); surface.className = 'screen-detail-surface';
    surface.style.backgroundColor = getComputedStyle(win).backgroundColor;
    for (const selector of ['.win-body', '.win-body > :first-child']) {
      const el = win.querySelector(selector); if (!el) continue;
      const color = getComputedStyle(el).backgroundColor;
      if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') surface.style.backgroundColor = color;
    }
    const icon = appIcon(win, width, height, true);
    if (icon) surface.append(icon);
    overlayFor(win).replaceChildren(surface); win.dataset.detailReady = '1'; return;
  }
  const canvas = document.createElement('canvas');
  // Both raster tiers cover the largest reduced view. A transition can keep
  // showing the previous shapes while its queued line view is built, still sharp.
  const required = SCREEN_DETAIL_WIDTHS.lines / state.logicalWidth * state.dpr;
  const scale = 2 ** (Math.ceil(Math.log2(Math.max(required, 1 / 1024)) * 4) / 4);
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  canvas.dataset.sourceDensity = String(scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = getComputedStyle(win).backgroundColor; ctx.fillRect(0, 0, width, height);
  const rect = (r: DOMRect) => ({ x: (r.left - capture.bounds.left) * width / capture.bounds.width, y: (r.top - capture.bounds.top) * height / capture.bounds.height, w: r.width * width / capture.bounds.width, h: r.height * height / capture.bounds.height });
  const colored = (color: string) => color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)';
  let count = 0;
  const walk = function* (el: Element, clip: { x: number; y: number; w: number; h: number }): Generator<void, void, void> {
    if (count >= (tier === 'lines' ? 450 : 250) || el === overlay) return;
    yield;
    count++;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.opacity === '0') return;
    const r = rect(el.getBoundingClientRect());
    if (r.w <= 0 || r.h <= 0 || r.x > clip.x + clip.w || r.y > clip.y + clip.h || r.x + r.w < clip.x || r.y + r.h < clip.y) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip();
    if (colored(style.backgroundColor)) {
      ctx.fillStyle = style.backgroundColor;
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(parseFloat(style.borderRadius) || 0, r.w / 2, r.h / 2)); ctx.fill();
    }
    if (paintDetailScene(ctx, el, r, tier)) { ctx.restore(); return; }
    if (['svg', 'IMG', 'CANVAS', 'VIDEO'].includes(el.tagName)) {
      ctx.fillStyle = style.color; ctx.globalAlpha = .18; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore(); return;
    }
    if (tier === 'lines') for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      ctx.fillStyle = style.color;
      for (const line of range.getClientRects()) { const t = rect(line); ctx.globalAlpha = .45; ctx.fillRect(t.x, t.y + t.h * .45, t.w, Math.max(1.5, t.h * .16)); }
    }
    const nextClip = /hidden|clip|auto|scroll/.test(style.overflow + style.overflowY) ? { x: Math.max(clip.x, r.x), y: Math.max(clip.y, r.y), w: Math.max(0, Math.min(clip.x + clip.w, r.x + r.w) - Math.max(clip.x, r.x)), h: Math.max(0, Math.min(clip.y + clip.h, r.y + r.h) - Math.max(clip.y, r.y)) } : clip;
    ctx.globalAlpha = 1;
    for (const child of el.children) {
      if (count >= (tier === 'lines' ? 450 : 250)) break;
      yield* walk(child, nextClip);
    }
    ctx.restore();
  };
  yield* walk(win, { x: 0, y: 0, w: width, h: height });
  const layer = overlayFor(win);
  layer.replaceChildren(canvas);
  if (tier === 'shapes') {
    const icon = appIcon(win, width, height, false);
    if (icon) layer.append(icon);
  }
  win.dataset.detailReady = '1';
}
