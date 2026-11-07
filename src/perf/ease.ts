/** Camera glide timing shared by the office (office/world.ts) and the weather particle worker. */
export const GLIDE_MS = 200;
export const GLIDE_EASING = "cubic-bezier(.2,.75,.3,1)";
/** The same curve as GLIDE_EASING, so code can tell where a running glide is shown. */
export const GLIDE_EASE = cubicBezier(.2, .75, .3, 1);
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  const slope = (a: number, b: number, t: number) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
  return (x: number) => {
    if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const d = at(x1, x2, t) - x, m = slope(x1, x2, t); if (Math.abs(d) < 1e-6) break; if (Math.abs(m) < 1e-6) break; t -= d / m; }
    if (Math.abs(at(x1, x2, t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { if (at(x1, x2, t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return at(y1, y2, t);
  };
}
/** A camera glide: from/to cameras and its start on the shared clock (performance.timeOrigin + now). */
export type Glide = { from: { x: number; y: number; s: number }; to: { x: number; y: number; s: number }; start: number; ms: number };
export function glideCamera(g: Glide, at: number) {
  const p = GLIDE_EASE(Math.min(1, Math.max(0, (at - g.start) / g.ms)));
  return { x: g.from.x + (g.to.x - g.from.x) * p, y: g.from.y + (g.to.y - g.from.y) * p, s: g.from.s + (g.to.s - g.from.s) * p };
}
