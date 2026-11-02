export type BuildingRect = { x: number; y: number; w: number; h: number };
export type BuildingFootprint = { path: string; cells: BuildingRect[]; bounds: BuildingRect };
type Edge = { x: number; y: number; x2: number; y2: number; direction: number };

// Compute the occupied union once per layout. Its outline has no internal walls,
// and its disjoint cells make indoor viewport checks cheap during camera motion.
export function buildingFootprint(rectangles: BuildingRect[]): BuildingFootprint {
  const rects = rectangles.filter((r) => r.w > 0 && r.h > 0);
  if (!rects.length) return { path: "", cells: [], bounds: { x: 0, y: 0, w: 0, h: 0 } };
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  const width = xs.length - 1, height = ys.length - 1;
  const floor = new Uint8Array(width * height);
  for (const r of rects) {
    const x0 = xs.indexOf(r.x), x1 = xs.indexOf(r.x + r.w), y0 = ys.indexOf(r.y), y1 = ys.indexOf(r.y + r.h);
    for (let y = y0; y < y1; y++) floor.fill(1, y * width + x0, y * width + x1);
  }
  const occupied = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && !!floor[y * width + x];
  const edges = new Set<Edge>(), outgoing = new Map<string, Edge[]>();
  const edge = (x: number, y: number, x2: number, y2: number, direction: number) => {
    const e = { x, y, x2, y2, direction }, key = `${x},${y}`;
    edges.add(e); const list = outgoing.get(key) ?? []; list.push(e); outgoing.set(key, list);
  };
  const cells: BuildingRect[] = [];
  let previous = new Map<string, BuildingRect>();
  for (let y = 0; y < height; y++) {
    const current = new Map<string, BuildingRect>();
    for (let x = 0; x < width; x++) if (occupied(x, y)) {
      if (!occupied(x, y - 1)) edge(xs[x], ys[y], xs[x + 1], ys[y], 0);
      if (!occupied(x + 1, y)) edge(xs[x + 1], ys[y], xs[x + 1], ys[y + 1], 1);
      if (!occupied(x, y + 1)) edge(xs[x + 1], ys[y + 1], xs[x], ys[y + 1], 2);
      if (!occupied(x - 1, y)) edge(xs[x], ys[y + 1], xs[x], ys[y], 3);
      if (occupied(x - 1, y)) continue;
      let end = x + 1;
      while (occupied(end, y)) end++;
      const key = `${xs[x]},${xs[end]}`, old = previous.get(key);
      const cell = old ?? { x: xs[x], y: ys[y], w: xs[end] - xs[x], h: 0 };
      cell.h += ys[y + 1] - ys[y]; current.set(key, cell);
      if (!old) cells.push(cell);
    }
    previous = current;
  }
  const rings: string[] = [];
  const turnRank = [1, 0, 3, 2];
  while (edges.size) {
    const start = edges.values().next().value!, points = [{ x: start.x, y: start.y }];
    let e = start, previousDirection = -1;
    while (true) {
      edges.delete(e);
      const point = { x: e.x2, y: e.y2 };
      if (e.direction === previousDirection) points[points.length - 1] = point; else points.push(point);
      previousDirection = e.direction;
      if (e.x2 === start.x && e.y2 === start.y) break;
      const candidates = outgoing.get(`${e.x2},${e.y2}`)?.filter((q) => edges.has(q)) ?? [];
      const direction = e.direction;
      candidates.sort((a, b) => turnRank.indexOf((a.direction - direction + 4) % 4) - turnRank.indexOf((b.direction - direction + 4) % 4));
      if (!candidates.length) throw Error("Open building footprint boundary");
      e = candidates[0];
    }
    rings.push(`M${points.map((p) => `${p.x} ${p.y}`).join("L")}Z`);
  }
  return { path: rings.join(""), cells, bounds: { x: xs[0], y: ys[0], w: xs.at(-1)! - xs[0], h: ys.at(-1)! - ys[0] } };
}

export function footprintCovers(footprint: BuildingFootprint, view: BuildingRect) {
  if (!(view.w > 0 && view.h > 0)) return false;
  const b = footprint.bounds;
  if (view.x < b.x || view.y < b.y || view.x + view.w > b.x + b.w || view.y + view.h > b.y + b.h) return false;
  let covered = 0;
  for (const r of footprint.cells) {
    const w = Math.min(r.x + r.w, view.x + view.w) - Math.max(r.x, view.x);
    const h = Math.min(r.y + r.h, view.y + view.h) - Math.max(r.y, view.y);
    if (w > 0 && h > 0) covered += w * h;
  }
  const area = view.w * view.h;
  return covered >= area - Math.max(0.00001, area * 1e-10);
}
