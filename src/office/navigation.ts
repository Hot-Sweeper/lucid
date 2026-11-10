import type { Pt } from "../robot";

export type Footprint = { x: number; y: number; w: number; h: number };
export function crosses(a: Pt, b: Pt, r: Footprint) {
  let lo = 0, hi = 1;
  for (const [p, q] of [[a.x - b.x, a.x - r.x], [b.x - a.x, r.x + r.w - a.x], [a.y - b.y, a.y - r.y], [b.y - a.y, r.y + r.h - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo > hi) return false;
  }
  return true;
}

/** Shortest visible path around padded floor footprints. Failure never becomes a straight shortcut. */
export function furniturePath(from: Pt, to: Pt, furniture: Footprint[], bounds: Footprint): Pt[] | null {
  const blocks = furniture.map((r) => ({ x: r.x - 16, y: r.y - 8, w: r.w + 32, h: r.h + 16 }));
  const inside = (p: Pt, r: Footprint) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const clear = (a: Pt, b: Pt) => !blocks.some((r) => crosses(a, b, r));
  if (clear(from, to)) return [to];
  const nodes = [from, to];
  for (const r of blocks) for (const x of [r.x - 1, r.x + r.w + 1]) for (const y of [r.y - 1, r.y + r.h + 1]) {
    const p = { x, y };
    if (inside(p, bounds) && !blocks.some((b) => inside(p, b))) nodes.push(p);
  }
  const distance = nodes.map(() => Infinity), previous = nodes.map(() => -1), open = new Set(nodes.map((_, i) => i));
  distance[0] = 0;
  while (open.size) {
    let best = -1;
    for (const i of open) if (best < 0 || distance[i] < distance[best]) best = i;
    if (best < 0 || !Number.isFinite(distance[best])) return null;
    if (best === 1) {
      const path: Pt[] = [];
      for (let i = 1; i !== 0; i = previous[i]) path.unshift(nodes[i]);
      return path;
    }
    open.delete(best);
    for (const i of open) {
      const d = distance[best] + Math.hypot(nodes[i].x - nodes[best].x, nodes[i].y - nodes[best].y);
      if (d < distance[i] && clear(nodes[best], nodes[i])) { distance[i] = d; previous[i] = best; }
    }
  }
  return null;
}
