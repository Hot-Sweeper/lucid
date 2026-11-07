export type RoutePoint = { x: number; y: number };
export type RouteView = { x: number; y: number; w: number; h: number };

/** First intersection with a conservative, whole-body viewport. Includes grazing edges. */
function entry(a: RoutePoint, b: RoutePoint, view: RouteView): number | null {
  let lo = 0, hi = 1;
  for (const [p, d, min, max] of [
    [a.x, b.x - a.x, view.x, view.x + view.w],
    [a.y, b.y - a.y, view.y, view.y + view.h],
  ]) {
    if (Math.abs(d) < 1e-9) { if (p < min || p > max) return null; continue; }
    const t0 = (min - p) / d, t1 = (max - p) / d;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    if (lo > hi) return null;
  }
  return lo;
}

/** Advance only over the hidden prefix of an already collision-checked route.
 * Never skip a visible crossing, even when both segment endpoints are hidden. */
export function hiddenRoutePrefix(at: RoutePoint, points: readonly RoutePoint[], index: number, view: RouteView) {
  let p = at, i = index;
  while (i < points.length) {
    const q = points[i], t = entry(p, q, view);
    if (t !== null) return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, index: i };
    p = q; i++;
  }
  return { ...p, index: i };
}
