// A shared geometry source for embedded/remote pages and canvas-based apps.
// Coordinates come from the real rendered page, not a second app-specific UI.
export type DetailShape = { x: number; y: number; w: number; h: number; color: string; radius?: number; text?: boolean; opacity?: number };
export type DetailScene = { width: number; height: number; background: string; shapes: DetailShape[] };
const scenes = new WeakMap<Element, DetailScene>();
export function setDetailScene(el: HTMLElement, scene: DetailScene) {
  scenes.set(el, scene);
  // Existing window invalidation observes style without a separate per-app observer.
  el.style.setProperty('--detail-scene-revision', String((Number(el.style.getPropertyValue('--detail-scene-revision')) || 0) + 1));
}
export function clearDetailScene(el: Element) { scenes.delete(el); }
export function paintDetailScene(ctx: CanvasRenderingContext2D, el: Element, rect: { x: number; y: number; w: number; h: number }, tier: string) {
  const scene = scenes.get(el);
  if (!scene || !(scene.width > 0 && scene.height > 0)) return false;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.translate(rect.x, rect.y); ctx.scale(rect.w / scene.width, rect.h / scene.height);
  ctx.fillStyle = scene.background; ctx.fillRect(0, 0, scene.width, scene.height);
  for (const shape of scene.shapes.slice(0, 550)) {
    if (shape.text && tier !== 'lines') continue;
    if (![shape.x, shape.y, shape.w, shape.h].every(Number.isFinite) || shape.w <= 0 || shape.h <= 0) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, shape.opacity ?? 1)); ctx.fillStyle = shape.color;
    ctx.beginPath(); ctx.roundRect(shape.x, shape.y, shape.w, shape.h, Math.max(0, Math.min(shape.radius || 0, shape.w / 2, shape.h / 2))); ctx.fill();
  }
  ctx.restore(); return true;
}
