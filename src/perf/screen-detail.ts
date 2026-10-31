import { screenDetail, type ScreenDetail } from './screen-detail-budget';
import './screen-detail.css';

type Reduced = Exclude<ScreenDetail, 'full'>;
type State = { host: HTMLElement; tier: ScreenDetail; visible: boolean; observer: MutationObserver };
type Cache = { views: Map<Reduced, Node[]>; lastPaint: number };
const states = new WeakMap<HTMLElement, State>();
const caches = new WeakMap<HTMLElement, Cache>();
const pending = new Map<HTMLElement, { state: State; due: number }>();
let timer = 0;

function cacheFor(win: HTMLElement) {
  let cache = caches.get(win);
  if (!cache) { cache = { views: new Map(), lastPaint: -Infinity }; caches.set(win, cache); }
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
function showCached(win: HTMLElement, tier: Reduced) {
  const nodes = cacheFor(win).views.get(tier);
  if (!nodes) return false;
  const overlay = overlayFor(win);
  if (overlay.firstChild !== nodes[0]) overlay.replaceChildren(...nodes);
  win.dataset.detailReady = '1';
  return true;
}
function enqueue(win: HTMLElement, state: State, transition = false) {
  if (!state.visible || state.tier === 'full' || win.dataset.renderHidden === '1') return;
  if (showCached(win, state.tier)) { pending.delete(win); return; }
  const interval = state.tier === 'lines' ? 750 : 1500;
  const due = transition ? 0 : cacheFor(win).lastPaint + interval;
  const previous = pending.get(win);
  pending.set(win, { state, due: Math.min(previous?.due ?? Infinity, due) });
  // A zoom transition must not wait behind a throttled content refresh.
  if (transition && timer) { clearTimeout(timer); timer = 0; }
  pump();
}
function pump() {
  if (timer || !pending.size || document.hidden) return;
  timer = window.setTimeout(flush, 0);
}
// Global work queue: never synchronously snapshot an entire office on a zoom tick.
// At most one window is measured per task, with cached tiers restored immediately.
function flush() {
  timer = 0;
  if (document.hidden) return;
  let soonest = Infinity;
  const now = performance.now();
  for (const [win, job] of pending) {
    const { state } = job;
    if (!win.isConnected || !state.visible || state.tier === 'full' || win.dataset.renderHidden === '1') { pending.delete(win); continue; }
    if (job.due > now) { soonest = Math.min(soonest, job.due); continue; }
    pending.delete(win);
    if (!showCached(win, state.tier)) {
      paint(win, state.tier);
      const overlay = win.querySelector<HTMLElement>(':scope > .screen-detail');
      if (overlay?.firstChild) {
        const cache = cacheFor(win);
        cache.views.set(state.tier, Array.from(overlay.childNodes)); cache.lastPaint = now;
      }
    }
    if (pending.size) timer = window.setTimeout(flush, 16);
    return;
  }
  if (pending.size && Number.isFinite(soonest)) timer = window.setTimeout(flush, Math.max(16, soonest - now));
}

/** Automatic geometry-based LOD shared by all current and future WM apps.
 * Keep the source DOM mounted for robot targeting and application continuity.
 */
export function setScreenDetail(host: HTMLElement, visible: boolean, width: number) {
  let state = states.get(host);
  if (!state) {
    const observer = new MutationObserver(records => {
      const changed = new Map<HTMLElement, boolean>();
      for (const record of records) {
        // Newly opened windows are reported on the shared layer, outside .win.
        if (record.type === 'childList') for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.matches('.win')) changed.set(node, true);
        }
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (!target || target.closest('.screen-detail')) continue;
        // Adding/removing our own overlay is not an application content change.
        if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(n => n instanceof Element && n.matches('.screen-detail'))) continue;
        const win = target.closest<HTMLElement>('.win');
        if (!win) continue; // Cursor, dock, wallpaper and clock cannot dirty app snapshots.
        const body = win.querySelector('.win-body');
        // The icon tier depends only on the shell, body surface and app icon.
        const shell = !body?.contains(target) || target === body || target.parentElement === body && record.type === 'attributes';
        changed.set(win, (changed.get(win) ?? false) || shell);
      }
      for (const [win, shell] of changed) {
        const cache = cacheFor(win);
        cache.views.delete('lines'); cache.views.delete('shapes');
        if (shell) cache.views.delete('icon');
        enqueue(win, state!);
      }
    });
    state = { host, tier: 'full', visible, observer }; states.set(host, state);
    observer.observe(host, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'src', 'data-render-hidden'] });
  }
  const tier = screenDetail(width);
  const transition = tier !== state.tier, appeared = visible && !state.visible;
  state.tier = tier; state.visible = visible;
  if (!visible) { for (const [win, job] of pending) if (job.state === state) pending.delete(win); return; }
  if (tier === 'full') {
    if (!host.dataset.screenDetail) return;
    delete host.dataset.screenDetail;
    host.querySelectorAll<HTMLElement>('[data-detail-ready]').forEach(win => { delete win.dataset.detailReady; pending.delete(win); });
    return;
  }
  if (host.dataset.screenDetail !== tier) host.dataset.screenDetail = tier;
  if (transition || appeared) host.querySelectorAll<HTMLElement>('.win').forEach(win => enqueue(win, state!, true));
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

function paint(win: HTMLElement, tier: ScreenDetail) {
  const width = win.offsetWidth, height = win.offsetHeight, bounds = win.getBoundingClientRect();
  if (!width || !height || !bounds.width || !bounds.height) return;
  const overlay = overlayFor(win);
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
    overlay.replaceChildren(surface); win.dataset.detailReady = '1'; return;
  }
  const canvas = document.createElement('canvas');
  // Bounded raster size independent of the full app's canvas density.
  const scale = tier === 'lines' ? .4 : .25;
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = getComputedStyle(win).backgroundColor; ctx.fillRect(0, 0, width, height);
  const sx = width / bounds.width, sy = height / bounds.height;
  const rect = (r: DOMRect) => ({ x: (r.left - bounds.left) * sx, y: (r.top - bounds.top) * sy, w: r.width * sx, h: r.height * sy });
  const colored = (color: string) => color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)';
  let count = 0;
  const walk = (el: Element, clip: { x: number; y: number; w: number; h: number }) => {
    if (++count > (tier === 'lines' ? 450 : 250) || el === overlay) return;
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
    for (const child of el.children) walk(child, nextClip);
    ctx.restore();
  };
  walk(win, { x: 0, y: 0, w: width, h: height });
  overlay.replaceChildren(canvas);
  if (tier === 'shapes') {
    const icon = appIcon(win, width, height, false);
    if (icon) overlay.append(icon);
  }
  win.dataset.detailReady = '1';
}
