// The campus landscape: woodland, lawns, meadows, a creek, trails and paths round the offices.
// planLandscape() turns the campus geometry into a fixed list of things (it does not depend on
// the season), paintLandscape() draws any world rectangle of it onto a canvas in the colours of
// the current season, weather and ground. Drawing is deterministic, so neighbouring tiles meet
// without seams and a redraw for new weather keeps every tree where it was.

import { mix, moonlit, rnd, SNOW, type Look } from "./outdoor-art";

export type LRect = { x: number; y: number; w: number; h: number };
type P = [number, number];
export type LandInput = {
  /** The whole drawn area, in world coordinates. */
  bounds: LRect;
  /** Buildings and parks: kept free of trees, each with a lawn round it. */
  areas: LRect[];
  /** Parks (one per computer), each with its own lawn. */
  parks: LRect[];
  /** The paved walks robots use (polylines). */
  paved: P[][];
  /** Walking corridors that must stay clear. */
  routes: LRect[];
};
type Line = { pts: P[]; w: number; box: LRect };
export type LTree = { x: number; y: number; r: number; kind: 0 | 1 | 2; seed: number; i: number };
type PropKind = "bush" | "rock" | "log" | "fern" | "stump" | "mushrooms";
export type LProp = { x: number; y: number; r: number; kind: PropKind; seed: number; i: number };
type Meadow = { x: number; y: number; rx: number; ry: number; seed: number; i: number };
type Blob = { x: number; y: number; r: number; t: number; i: number };

/** Clear grass round each building before the woods begin. */
const CLEAR = 230;
/** The lawn reaches this far round buildings. */
const LAWN = 95;
const CELL = 512;

class Grid<T extends { x: number; y: number; i: number }> {
  private cells = new Map<number, T[]>();
  constructor(private reach: number) {}
  private key(i: number, j: number) { return (i + 4096) * 8192 + (j + 4096); }
  add(t: T) {
    const k = this.key(Math.floor(t.x / CELL), Math.floor(t.y / CELL)), a = this.cells.get(k);
    if (a) a.push(t); else this.cells.set(k, [t]);
  }
  /** Everything whose drawing may touch r, in the order it was added. */
  query(r: LRect) {
    const p = this.reach, out: T[] = [];
    const i0 = Math.floor((r.x - p) / CELL), i1 = Math.floor((r.x + r.w + p) / CELL);
    const j0 = Math.floor((r.y - p) / CELL), j1 = Math.floor((r.y + r.h + p) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.cells.get(this.key(i, j)); if (a) for (const t of a) out.push(t); }
    return out.sort((a, b) => a.i - b.i);
  }
}

export type LandPlan = ReturnType<typeof planLandscape>;

const hash = (a: number, b: number, c = 0) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 2147483646 + 1;
};
const rectDist = (x: number, y: number, r: LRect) => {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return dx || dy ? Math.hypot(dx, dy) : -Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y);
};
function segDist(x: number, y: number, a: P, b: P) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy;
  const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l)) : 0;
  return Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t);
}
const lineDist = (x: number, y: number, l: Line) => {
  if (x < l.box.x - 400 || y < l.box.y - 400 || x > l.box.x + l.box.w + 400 || y > l.box.y + l.box.h + 400) return Infinity;
  let d = Infinity;
  for (let i = 1; i < l.pts.length; i++) d = Math.min(d, segDist(x, y, l.pts[i - 1], l.pts[i]));
  return d;
};
const line = (pts: P[], w: number): Line => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { pts, w, box: { x: x - w, y: y - w, w: Math.max(...xs) - x + 2 * w, h: Math.max(...ys) - y + 2 * w } };
};
const hits = (a: LRect, b: LRect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function crossing(a: P, b: P, c: P, d: P): P | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (!den) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

export function planLandscape(o: LandInput) {
  const B = o.bounds, areas = o.areas;
  const clear = (x: number, y: number) => { let d = Infinity; for (const a of areas) d = Math.min(d, rectDist(x, y, a)); return d - CLEAR; };
  const U = areas.reduce((u, a) => ({ x: Math.min(u.x, a.x), y: Math.min(u.y, a.y), r: Math.max(u.r, a.x + a.w), b: Math.max(u.b, a.y + a.h) }), { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity });
  const same = (a: LRect, b: LRect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const isPark = (a: LRect) => o.parks.some((p) => same(a, p));
  const paved = o.paved.filter((p) => p.length > 1).map((p) => line(p, 108));

  // A creek meanders through the widest side of the woods.
  let stream: Line | null = null;
  const leftBand = U.x - CLEAR - B.x, rightBand = B.x + B.w - (U.r + CLEAR);
  const band = Math.max(leftBand, rightBand);
  if (band > 320) {
    const cx = rightBand >= leftBand ? U.r + CLEAR + band * 0.5 : B.x + leftBand * 0.5, amp = band * 0.16;
    const pts: P[] = [];
    for (let y = B.y - 60; y <= B.y + B.h + 60; y += 36) pts.push([cx + Math.sin(y * 0.0034) * amp + Math.sin(y * 0.0013 + 2) * amp * 0.7, y]);
    stream = line(pts, 46);
  }
  // A woodland trail runs round the campus, with spurs from the parks.
  const trails: Line[] = [];
  {
    const off = CLEAR + 150, x0 = U.x - off, y0 = U.y - off, x1 = U.r + off, y1 = U.b + off, rad = 260;
    if (x0 > B.x + 140 && y0 > B.y + 140 && x1 < B.x + B.w - 140 && y1 < B.y + B.h - 140) {
      const corner = (cx: number, cy: number, a0: number) => Array.from({ length: 7 }, (_, k) => [cx + Math.cos(a0 + (k / 6) * Math.PI / 2) * rad, cy + Math.sin(a0 + (k / 6) * Math.PI / 2) * rad] as P);
      const ring: P[] = [];
      const edge = (ax: number, ay: number, bx: number, by: number) => { const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 60)); for (let k = 0; k < n; k++) ring.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); };
      edge(x0 + rad, y0, x1 - rad, y0); ring.push(...corner(x1 - rad, y0 + rad, -Math.PI / 2));
      edge(x1, y0 + rad, x1, y1 - rad); ring.push(...corner(x1 - rad, y1 - rad, 0));
      edge(x1 - rad, y1, x0 + rad, y1); ring.push(...corner(x0 + rad, y1 - rad, Math.PI / 2));
      edge(x0, y1 - rad, x0, y0 + rad); ring.push(...corner(x0 + rad, y0 + rad, Math.PI));
      ring.push(ring[0]);
      let s = 0;
      const wob = ring.map((p, k) => {
        const q = ring[Math.min(ring.length - 1, k + 1)], pr = ring[Math.max(0, k - 1)];
        const tx = q[0] - pr[0], ty = q[1] - pr[1], tl = Math.hypot(tx, ty) || 1;
        if (k) s += Math.hypot(p[0] - ring[k - 1][0], p[1] - ring[k - 1][1]);
        const n = k === ring.length - 1 ? 0 : Math.sin(s * 0.0041) * 42 + Math.sin(s * 0.013 + 1) * 13;
        return [p[0] - (ty / tl) * n, p[1] + (tx / tl) * n] as P;
      });
      wob[wob.length - 1] = wob[0];
      trails.push(line(wob, 34));
      const spur = (a: P, b: P, own: LRect | null) => {
        const box = { x: Math.min(a[0], b[0]) - 40, y: Math.min(a[1], b[1]) - 40, w: Math.abs(a[0] - b[0]) + 80, h: Math.abs(a[1] - b[1]) + 80 };
        if (areas.some((r) => r !== own && hits(box, r))) return;
        const pts: P[] = [], n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 50));
        for (let k = 0; k <= n; k++) { const t = k / n, w = Math.sin(t * Math.PI) * 18 * Math.sin(k * 1.3); pts.push([a[0] + (b[0] - a[0]) * t + (a[1] === b[1] ? 0 : w), a[1] + (b[1] - a[1]) * t + (a[1] === b[1] ? w : 0)]); }
        trails.push(line(pts, 30));
      };
      for (const p of o.parks) spur([p.x + p.w - 40, p.y + p.h / 2], [x1, p.y + p.h / 2], areas.find((a) => same(a, p)) ?? null);
      // a path leaves the map across the creek, so the woods seem to go on
      if (stream) {
        const right = stream.pts[0][0] > x1, y = Math.round((y0 + y1) / 2 + 140);
        spur([right ? x1 : x0, y], [right ? B.x + B.w + 60 : B.x - 60, y], null);
      }
    }
  }
  const bridges: { x: number; y: number; a: number; len: number }[] = [];
  if (stream) for (const t of trails) for (let i = 1; i < t.pts.length; i++) for (let j = 1; j < stream.pts.length; j++) {
    const c = crossing(t.pts[i - 1], t.pts[i], stream.pts[j - 1], stream.pts[j]);
    if (c) bridges.push({ x: c[0], y: c[1], a: Math.atan2(t.pts[i][1] - t.pts[i - 1][1], t.pts[i][0] - t.pts[i - 1][0]), len: 96 });
  }
  const blocked = (x: number, y: number, r: number, lean = 1) => {
    for (const q of o.routes) if (rectDist(x, y, q) < r * 0.6 * lean) return true;
    for (const l of paved) if (lineDist(x, y, l) < l.w / 2 + r * 0.75 * lean) return true;
    for (const l of trails) if (lineDist(x, y, l) < l.w / 2 + r * 0.5 * lean) return true;
    if (stream && lineDist(x, y, stream) < stream.w / 2 + r * 0.55 * lean + 8) return true;
    for (const b of bridges) if (Math.hypot(x - b.x, y - b.y) < 70 + r) return true;
    return false;
  };

  // Woodland: denser and taller with distance from the buildings, a few specimen trees on the grass.
  const trees: LTree[] = [], TC = 116;
  for (let gy = Math.floor(B.y / TC); gy <= Math.ceil((B.y + B.h) / TC); gy++) for (let gx = Math.floor(B.x / TC); gx <= Math.ceil((B.x + B.w) / TC); gx++) {
    const q = rnd(hash(gx, gy, 11));
    const x = (gx + 0.5) * TC + (q() - 0.5) * 92, y = (gy + 0.5) * TC + (q() - 0.5) * 92;
    const d = clear(x, y), roll = q();
    let p = d < 0 ? (d > -150 ? 0.025 : 0) : 0.05 + Math.min(1, d / 280) * 0.9;
    if (roll > p) continue;
    const deep = Math.min(1, Math.max(0, d / 500)), k = q();
    const kind: 0 | 1 | 2 = k < 0.22 + deep * 0.3 ? 1 : k > 0.86 ? 2 : 0;
    let r = kind === 1 ? 56 + q() * 30 : kind === 2 ? 44 + q() * 22 : 66 + q() * 44;
    if (d < 140) r *= 0.86;
    if (d < 0 && areas.some((a) => rectDist(x, y, a) < LAWN + r + 30)) continue;
    if (blocked(x, y, r)) continue;
    trees.push({ x, y, r, kind, seed: hash(gx, gy, 5), i: 0 });
  }
  trees.sort((a, b) => a.y - b.y || a.x - b.x).forEach((t, i) => (t.i = i));

  // Undergrowth: bushes on the woodland edge, ferns, rocks, logs, stumps and mushrooms inside.
  const props: LProp[] = [], PC = 88;
  for (let gy = Math.floor(B.y / PC); gy <= Math.ceil((B.y + B.h) / PC); gy++) for (let gx = Math.floor(B.x / PC); gx <= Math.ceil((B.x + B.w) / PC); gx++) {
    const q = rnd(hash(gx, gy, 23));
    const x = (gx + 0.5) * PC + (q() - 0.5) * 70, y = (gy + 0.5) * PC + (q() - 0.5) * 70;
    const d = clear(x, y), roll = q();
    let kind: PropKind | null = null, r = 0;
    if (d > -50 && d < 170 && roll < 0.34) { kind = "bush"; r = 20 + q() * 18; }
    else if (d > 60 && roll < 0.16) { kind = "fern"; r = 15 + q() * 9; }
    else if (d > -70 && roll < 0.2) { kind = "rock"; r = 10 + q() * 22; }
    else if (d > 220 && roll < 0.215) { kind = "log"; r = 40 + q() * 26; }
    else if (d > 90 && roll < 0.23) { kind = "stump"; r = 12 + q() * 7; }
    else if (d > 70 && roll < 0.26) { kind = "mushrooms"; r = 12; }
    if (!kind || blocked(x, y, r + 10, 1.4) || areas.some((a) => rectDist(x, y, a) < LAWN + r)) continue;
    props.push({ x, y, r, kind, seed: hash(gx, gy, 29), i: 0 });
  }
  props.sort((a, b) => a.y - b.y).forEach((t, i) => (t.i = i));

  // Meadows of longer grass and wild flowers between the lawns and the woods.
  const meadows: Meadow[] = [], MC = 240;
  for (let gy = Math.floor(B.y / MC); gy <= Math.ceil((B.y + B.h) / MC); gy++) for (let gx = Math.floor(B.x / MC); gx <= Math.ceil((B.x + B.w) / MC); gx++) {
    const q = rnd(hash(gx, gy, 41));
    const x = (gx + 0.5) * MC + (q() - 0.5) * 120, y = (gy + 0.5) * MC + (q() - 0.5) * 120;
    const d = clear(x, y);
    if (d > 180 || d < -150 || q() > 0.62) continue;
    const rx = 70 + q() * 90, ry = 38 + q() * 40;
    if (areas.some((a) => rectDist(x, y, a) < LAWN + rx * 0.4) || paved.some((l) => lineDist(x, y, l) < l.w / 2 + ry)) continue;
    meadows.push({ x, y, rx, ry, seed: hash(gx, gy, 43), i: meadows.length });
  }
  // Broad, soft variation in the grass colour.
  const blobs: Blob[] = [], BC = 640;
  for (let gy = Math.floor(B.y / BC) - 1; gy <= Math.ceil((B.y + B.h) / BC); gy++) for (let gx = Math.floor(B.x / BC) - 1; gx <= Math.ceil((B.x + B.w) / BC); gx++) {
    const q = rnd(hash(gx, gy, 53));
    blobs.push({ x: (gx + 0.5) * BC + (q() - 0.5) * 400, y: (gy + 0.5) * BC + (q() - 0.5) * 400, r: 300 + q() * 360, t: q() * 3 | 0, i: blobs.length });
  }
  // Lamp posts along the paved walks.
  const lamps: P[] = [];
  for (const l of paved) {
    let next = 160, walked = 0;
    for (let i = 1; i < l.pts.length; i++) {
      const [ax, ay] = l.pts[i - 1], [bx, by] = l.pts[i], len = Math.hypot(bx - ax, by - ay);
      if (!len) continue;
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (; next < walked + len; next += 380) {
        const t = (next - walked) / len, x = ax + (bx - ax) * t - nx * 76, y = ay + (by - ay) * t - ny * 76;
        if (areas.every((a) => rectDist(x, y, a) > 24) && paved.every((p) => lineDist(x, y, p) > 60)) lamps.push([x, y]);
      }
      walked += len;
    }
  }
  const treeGrid = new Grid<LTree>(200), propGrid = new Grid<LProp>(80), meadowGrid = new Grid<Meadow>(200), blobGrid = new Grid<Blob>(700);
  trees.forEach((t) => treeGrid.add(t)); props.forEach((t) => propGrid.add(t)); meadows.forEach((t) => meadowGrid.add(t)); blobs.forEach((t) => blobGrid.add(t));
  const lawns = areas.map((a) => (isPark(a) ? { x: a.x + 30, y: a.y + 30, w: a.w - 60, h: a.h - 60, r: 210, park: true } : { x: a.x - LAWN, y: a.y - LAWN, w: a.w + 2 * LAWN, h: a.h + 2 * LAWN, r: 80, park: false }));
  return { bounds: B, areas, lawns, paved, trails, stream, bridges, trees, props, meadows, lamps, treeGrid, propGrid, meadowGrid, blobGrid, counts: { trees: trees.length, props: props.length } };
}

// ---- colours ------------------------------------------------------------------------------

export type LandLook = Look & { frozen: boolean };
const EVERGREEN: [string, string, string] = ["#245a40", "#327452", "#4f9468"];
const EVERGREEN_WINTER: [string, string, string] = ["#21503b", "#2c6148", "#467c5e"];

export function landColors(L: LandLook) {
  const { pal, snow, wx } = L;
  let grass = pal.ground;
  if (wx?.hot) grass = mix(grass, "#b5ad62", 0.2);
  if (wx && (wx.puddles > 0 || wx.raining)) grass = mix(grass, "#3f6e48", 0.16);
  if (wx?.frost && snow < 0.3) grass = mix(grass, "#cfe2df", 0.22);
  grass = mix(grass, SNOW, snow * 0.86);
  const lawn = mix(mix(pal.ground, "#9ed27a", 0.16), SNOW, snow * 0.9);
  const autumn = L.season === "autumn";
  const floor = snow > 0.3 ? mix(SNOW, "#9db0c8", 0.32) : mix(mix(grass, "#2c4a2c", 0.36), "#7a5a30", autumn ? 0.18 : 0);
  // A moonlit theme: the palette is already shaded (lookFor); fixed colours sink the same way.
  const night = <T,>(v: T) => L.art?.shade ? moonlit(v, L.art.shade) : v;
  const ground = (c: string) => L.art?.shade ? moonlit(c, 0.45) : c;
  const ever = night(L.season === "winter" ? EVERGREEN_WINTER : EVERGREEN);
  // A theme can choose the colour the woodland fades into at the map edge (OLED: true black).
  const edge = L.art?.edge ?? mix(mix(ever[0], "#16301f", 0.35), "#8d9fb3", snow * 0.45);
  return {
    // A moonlit theme: the ground sinks a step further than the trees, and the light meadow,
    // tuft and blob tones (mixed with fixed pale greens) sink too, so no grass glows.
    grass: ground(grass), lawn: ground(lawn), floor: ground(floor), ever, edge,
    stripe: snow > 0.6 ? "rgba(255,255,255,0)" : L.art?.shade ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.075)",
    blob: night([mix(grass, "#2f5f36", 0.32), mix(grass, "#d6e39a", 0.3), mix(grass, "#8fae4e", 0.3)]),
    tuftDark: night(mix(pal.tuft, "#2d5a32", 0.25)), tuftLight: night(mix(grass, "#d8eaa0", 0.4)),
    meadow: night(mix(mix(grass, "#c7c46a", autumn ? 0.45 : 0.22), SNOW, snow * 0.8)),
    path: mix(pal.path, SNOW, snow * 0.42), pathEdge: night(mix(mix(pal.path, "#6e5c44", 0.38), "#a9b4c2", snow * 0.5)), stone: night(mix(pal.path, "#fff6e0", 0.28)),
    trail: night(mix(mix("#b39368", grass, 0.12), "#d6dce4", snow * 0.6)), trailEdge: night(mix(mix("#7f6646", grass, 0.25), "#aeb8c6", snow * 0.5)),
    water: night(L.frozen ? "#cfe5ef" : snow > 0.3 ? "#6aa7c4" : "#5aa9cc"), waterDeep: night(L.frozen ? "#b4d4e2" : "#3f8db4"), bank: night(mix(mix("#7d8f55", "#6b5a3e", 0.4), SNOW, snow * 0.7)),
    shadow: snow > 0 ? mix(pal.shadow, "#3a4a68", snow) : pal.shadow,
    rock: night(["#8c929a", "#a9aeb5", "#c9ccd0"]), wood: night(["#6e5038", "#8a6648", "#b48b62"]),
    bush: pal.bush,
  };
}
type Colors = ReturnType<typeof landColors>;

// ---- painting -----------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const circle = (c: Ctx, x: number, y: number, r: number) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };
function polyline(c: Ctx, pts: P[]) { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); }
function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Crown lobes of a broadleaf tree: a lumpy silhouette, the same on every redraw. */
function lobes(t: LTree) {
  const q = rnd(t.seed), n = 5 + (t.seed % 3), out: [number, number, number][] = [[t.x, t.y, t.r * 0.66]];
  const a0 = q() * TAU;
  for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU + (q() - 0.5) * 0.5, d = t.r * (0.36 + q() * 0.12); out.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, t.r * (0.44 + q() * 0.14)]); }
  return out;
}
function star(c: Ctx, x: number, y: number, r: number, n: number, inner: number, rot: number) {
  for (let k = 0; k <= n * 2; k++) { const a = rot + (k / (n * 2)) * TAU, d = k % 2 ? r * inner : r; k ? c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
  c.closePath();
}

/**
 * Paints the world rectangle `view` at `density` canvas pixels per world unit. The context's
 * transform must already map world coordinates onto the canvas.
 */
export function paintLandscape(c: Ctx, plan: LandPlan, L: LandLook, C: Colors, view: LRect, density: number) {
  // Fine texture (grass blades, tall grass, flowers) fades in over a zoom range instead of
  // switching on at one density, so a tile changing resolution does not make it pop.
  const fineAmount = Math.min(1, Math.max(0, (density - 0.26) / 0.24)), fine = fineAmount > 0, pad = 220;
  const near = { x: view.x - pad, y: view.y - pad, w: view.w + 2 * pad, h: view.h + 2 * pad };
  const snow = L.snow;
  c.fillStyle = C.grass; c.fillRect(view.x, view.y, view.w, view.h);
  // beyond the planned woodland the forest goes on as a repeating canopy, so a zoomed-out view has no frame
  const B = plan.bounds;
  if (view.x < B.x || view.y < B.y || view.x + view.w > B.x + B.w || view.y + view.h > B.y + B.h) {
    c.fillStyle = canopy(c, L, C);
    const far = 1e5;
    for (const [x, y, w, h] of [[B.x - far, B.y - far, B.w + 2 * far, far], [B.x - far, B.y + B.h, B.w + 2 * far, far], [B.x - far, B.y, far, B.h], [B.x + B.w, B.y, far, B.h]])
      if (hits({ x, y, w, h }, view)) { const x0 = Math.max(x, view.x), y0 = Math.max(y, view.y); c.fillRect(x0, y0, Math.min(x + w, view.x + view.w) - x0, Math.min(y + h, view.y + view.h) - y0); }
  }
  // broad colour variation
  for (const b of plan.blobGrid.query(view)) {
    const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, C.blob[b.t]); g.addColorStop(1, C.blob[b.t] + "00");
    c.globalAlpha = (b.t === 0 ? 0.42 : 0.3) * (1 - snow * 0.7);
    c.fillStyle = g; c.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
  c.globalAlpha = 1;
  const trees = plan.treeGrid.query(view);
  // the forest floor darkens under the canopy and joins up where trees stand close
  c.fillStyle = C.floor; c.globalAlpha = 0.5; c.beginPath();
  for (const t of trees) circle(c, t.x + t.r * 0.15, t.y + t.r * 0.2, t.r * 1.45);
  c.fill(); c.globalAlpha = 0.45; c.beginPath();
  for (const t of trees) circle(c, t.x + t.r * 0.1, t.y + t.r * 0.15, t.r * 1.05);
  c.fill(); c.globalAlpha = 1;
  // meadows
  const meadows = plan.meadowGrid.query(view);
  for (const m of meadows) {
    // soft-edged patches of longer grass
    c.save(); c.translate(m.x, m.y); c.scale(1, m.ry / m.rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, m.rx);
    g.addColorStop(0, C.meadow); g.addColorStop(0.6, C.meadow + "cc"); g.addColorStop(1, C.meadow + "00");
    c.fillStyle = g; c.fillRect(-m.rx, -m.rx, m.rx * 2, m.rx * 2); c.restore();
  }
  // lawns, with mowing stripes
  for (const l of plan.lawns) {
    if (!hits(l, near)) continue;
    c.beginPath(); roundRect(c, l.x - 6, l.y - 6, l.w + 12, l.h + 12, l.r + 6);
    c.fillStyle = l.park ? mix(C.lawn, L.pal.bush[1], 0.45) : mix(C.lawn, C.grass, 0.55); c.fill();
    c.beginPath(); roundRect(c, l.x, l.y, l.w, l.h, l.r);
    c.fillStyle = l.park ? mix(mix(L.pal.park[1], "#9ed27a", 0.1), SNOW, snow * 0.85) : C.lawn; c.fill();
    // Mowing stripes are large and cheap: drawn at every density, the background map included,
    // so they never appear or vanish as tiles and zoom levels swap during a pan or zoom.
    if (snow < 0.6) {
      c.save(); c.clip(); c.fillStyle = C.stripe;
      const x0 = Math.max(l.x, view.x - 80), x1 = Math.min(l.x + l.w, view.x + view.w + 80);
      for (let x = l.x + 30 + Math.ceil((x0 - l.x - 30) / 140) * 140; x < x1; x += 140) c.fillRect(x, Math.max(l.y, view.y - 10), 70, Math.min(l.h, view.h + 20));
      c.restore();
    }
  }
  // grass blades and flowers, generated per 256-unit cell so they never seam between tiles
  if (fine) {
    const S = 256, i0 = Math.floor(view.x / S), i1 = Math.floor((view.x + view.w) / S), j0 = Math.floor(view.y / S), j1 = Math.floor((view.y + view.h) / S);
    const dark = new Path2D(), light = new Path2D();
    const blade = Math.max(1.4, 1 / density);
    if (snow < 0.7) for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if ((i + 1) * S < B.x || i * S > B.x + B.w || (j + 1) * S < B.y || j * S > B.y + B.h) continue;
      const q = rnd(hash(i, j, 61));
      for (let k = 0; k < 30; k++) {
        const x = (i + q()) * S, y = (j + q()) * S, p = k & 1 ? dark : light, s = 5 + q() * 5;
        p.moveTo(x - 3, y); p.lineTo(x - 5, y - s); p.moveTo(x, y); p.lineTo(x + 1, y - s - 2); p.moveTo(x + 3, y); p.lineTo(x + 6, y - s * 0.8);
      }
    }
    c.lineCap = "round"; c.lineWidth = blade;
    c.globalAlpha = 0.55 * (1 - snow) * fineAmount; c.strokeStyle = C.tuftDark; c.stroke(dark);
    c.globalAlpha = 0.45 * (1 - snow) * fineAmount; c.strokeStyle = C.tuftLight; c.stroke(light);
    c.globalAlpha = 1;
    // tall grass in the meadows
    if (meadows.length && snow < 0.6) {
      const tall = new Path2D();
      for (const m of meadows) {
        const q = rnd(m.seed + 17);
        for (let k = 0; k < 26; k++) {
          const a = q() * TAU, d = Math.sqrt(q()) * 0.8, x = m.x + Math.cos(a) * m.rx * d, y = m.y + Math.sin(a) * m.ry * d, h = 9 + q() * 7;
          tall.moveTo(x - 4, y); tall.quadraticCurveTo(x - 5, y - h * 0.6, x - 8, y - h); tall.moveTo(x, y); tall.lineTo(x + 1, y - h - 3); tall.moveTo(x + 4, y); tall.quadraticCurveTo(x + 5, y - h * 0.6, x + 9, y - h * 0.9);
        }
      }
      c.strokeStyle = mix(C.meadow, "#5e7a34", 0.45); c.lineWidth = Math.max(1.6, 1 / density); c.globalAlpha = 0.7 * (1 - snow) * fineAmount; c.stroke(tall); c.globalAlpha = 1;
    }
    // wild flowers in the meadows
    const flowers = L.pal.flowers;
    if (meadows.length && flowers.colors.length && snow < 0.4) {
      for (const m of meadows) {
        const q = rnd(m.seed), n = Math.round(18 * flowers.density);
        for (let k = 0; k < n; k++) {
          const a = q() * TAU, d = Math.sqrt(q()) * 0.85, x = m.x + Math.cos(a) * m.rx * d, y = m.y + Math.sin(a) * m.ry * d;
          c.fillStyle = flowers.colors[Math.floor(q() * flowers.colors.length)];
          c.beginPath(); circle(c, x, y, 3.2 + q() * 2); c.fill();
          c.fillStyle = "#fff4c2"; c.beginPath(); circle(c, x, y, 1.2); c.fill();
        }
      }
    }
  }
  // the creek
  const s = plan.stream;
  if (s && hits(s.box, near)) {
    c.lineCap = c.lineJoin = "round";
    c.beginPath(); polyline(c, s.pts);
    c.strokeStyle = C.bank; c.lineWidth = s.w + 26; c.stroke();
    c.strokeStyle = C.water; c.lineWidth = s.w; c.stroke();
    c.strokeStyle = C.waterDeep; c.lineWidth = s.w * 0.4; c.globalAlpha = 0.5; c.stroke(); c.globalAlpha = 1;
    if (fine && !L.frozen) {
      // ripples catching the light
      c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 2.2; c.beginPath();
      for (let i = 2; i < s.pts.length; i += 3) { const [x, y] = s.pts[i], q = rnd(hash(i, 7, 71)); const o = (q() - 0.5) * s.w * 0.5; c.moveTo(x + o - 7, y + q() * 10); c.lineTo(x + o + 5, y + q() * 10 - 2); }
      c.stroke();
    }
    // pebbles along the banks
    if (fine) {
      c.fillStyle = mix(C.rock[1], SNOW, snow * 0.7); c.beginPath();
      for (let i = 0; i < s.pts.length; i += 2) { const q = rnd(hash(i, 3, 73)), side = q() < 0.5 ? -1 : 1; circle(c, s.pts[i][0] + side * (s.w / 2 + 6 + q() * 6), s.pts[i][1] + q() * 20, 3 + q() * 4); }
      c.fill();
    }
  }
  // trails and paved walks
  const stroke = (l: Line, edge: string, body: string, ew: number) => {
    if (!hits(l.box, near)) return;
    c.lineCap = c.lineJoin = "round"; c.beginPath(); polyline(c, l.pts);
    c.strokeStyle = edge; c.lineWidth = l.w + ew; c.stroke();
    c.strokeStyle = body; c.lineWidth = l.w; c.stroke();
  };
  for (const t of plan.trails) {
    stroke(t, C.trailEdge, C.trail, 8);
    if (fine && hits(t.box, near)) {
      c.fillStyle = C.trailEdge; c.globalAlpha = 0.55; c.beginPath();
      for (let i = 0; i < t.pts.length; i++) { const q = rnd(hash(i, t.pts.length, 79)); circle(c, t.pts[i][0] + (q() - 0.5) * t.w * 0.7, t.pts[i][1] + (q() - 0.5) * t.w * 0.7, 2 + q() * 2.4); }
      c.fill(); c.globalAlpha = 1;
    }
  }
  for (const l of plan.paved) {
    stroke(l, C.pathEdge, C.path, 22);
    if (fine && hits(l.box, near)) {
      // flagstones
      c.save(); c.fillStyle = C.stone; c.globalAlpha = 0.5;
      for (let i = 1; i < l.pts.length; i++) {
        const [ax, ay] = l.pts[i - 1], [bx, by] = l.pts[i], len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
        for (let d = 20; d < len - 10; d += 46) {
          const x = ax + ux * d, y = ay + uy * d;
          if (x < near.x || y < near.y || x > near.x + near.w || y > near.y + near.h) continue;
          const q = rnd(hash(Math.round(x), Math.round(y), 83));
          for (let k = -1; k <= 1; k++) {
            const ox = -uy * k * 32 + (q() - 0.5) * 8, oy = ux * k * 32 + (q() - 0.5) * 8;
            c.beginPath(); roundRect(c, x + ox - 17, y + oy - 14, 34 + q() * 6, 26 + q() * 6, 7); c.fill();
          }
        }
      }
      c.restore();
    }
  }
  // puddles on the walks after rain
  const wx = L.wx;
  if (wx && wx.puddles > 0 && fine) {
    for (const l of [...plan.paved, ...plan.trails]) {
      if (!hits(l.box, near)) continue;
      for (let i = 1; i < l.pts.length; i += 3) {
        const q = rnd(hash(i, l.pts.length, 89)); if (q() > 0.4 * wx.puddles + 0.1) continue;
        const x = l.pts[i][0] + (q() - 0.5) * l.w * 0.4, y = l.pts[i][1] + (q() - 0.5) * l.w * 0.3, rx = (10 + q() * 16) * (0.5 + wx.puddles * 0.5) * (l.w / 60);
        c.fillStyle = wx.ice ? "#d9ecf4" : "#7a96a8"; c.globalAlpha = 0.75; c.beginPath(); c.ellipse(x, y, rx, rx * 0.55, q(), 0, TAU); c.fill();
        c.fillStyle = wx.ice ? "#ffffff" : "#c4dbe8"; c.globalAlpha = 0.6; c.beginPath(); c.ellipse(x - rx * 0.25, y - rx * 0.15, rx * 0.4, rx * 0.16, q(), 0, TAU); c.fill();
        c.globalAlpha = 1;
      }
    }
  }
  // footbridges
  for (const b of plan.bridges) {
    if (b.x < near.x || b.y < near.y || b.x > near.x + near.w || b.y > near.y + near.h) continue;
    c.save(); c.translate(b.x, b.y); c.rotate(b.a);
    c.fillStyle = C.shadow; c.globalAlpha = 0.3; c.fillRect(-b.len / 2 + 8, -18, b.len, 46); c.globalAlpha = 1;
    c.fillStyle = mix(C.wood[1], SNOW, snow * 0.6); c.fillRect(-b.len / 2, -24, b.len, 48);
    c.strokeStyle = C.wood[0]; c.lineWidth = 2;
    c.beginPath(); for (let x = -b.len / 2 + 12; x < b.len / 2; x += 12) { c.moveTo(x, -24); c.lineTo(x, 24); } c.stroke();
    c.fillStyle = C.wood[0]; c.fillRect(-b.len / 2 - 4, -30, b.len + 8, 8); c.fillRect(-b.len / 2 - 4, 22, b.len + 8, 8);
    c.restore();
  }
  // undergrowth below the trees
  const props = plan.propGrid.query(view);
  paintProps(c, props, L, C, true);
  // fallen leaves round the trees in autumn
  if (fine && L.pal.litter.length) {
    const cols = L.pal.litter;
    c.globalAlpha = 0.85;
    for (const t of trees) {
      if (t.kind === 1) continue;
      const q = rnd(t.seed * 13 + 5);
      for (let k = 0; k < 9; k++) {
        const a = q() * TAU, d = t.r * (1 + q() * 0.75);
        c.fillStyle = cols[Math.floor(q() * cols.length)];
        c.beginPath(); c.ellipse(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d * 0.9 + t.r * 0.2, 4.2, 2.3, q() * 3, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1;
  }
  // tree shadows, as one shape so overlaps stay even
  c.fillStyle = C.shadow; c.globalAlpha = 0.3; c.beginPath();
  for (const t of trees) {
    const dx = t.r * 0.32, dy = t.r * 0.42;
    if (t.kind === 1) star(c, t.x + dx, t.y + dy, t.r * 0.98, 9 + (t.seed % 3), 0.8, t.seed);
    else for (const [x, y, r] of lobes(t)) circle(c, x + dx, y + dy, r);
  }
  c.fill(); c.globalAlpha = 1;
  paintProps(c, props, L, C, false);
  for (const t of trees) paintTree(c, t, L, C, fine);
  // lamp posts
  for (const [x, y] of plan.lamps) {
    if (x < near.x || y < near.y || x > near.x + near.w || y > near.y + near.h) continue;
    c.fillStyle = C.shadow; c.globalAlpha = 0.25; c.beginPath(); c.ellipse(x + 16, y + 14, 22, 10, 0.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    c.fillStyle = "#3d4a44"; c.beginPath(); circle(c, x, y, 13); c.fill();
    c.fillStyle = "#ffe6ac"; c.beginPath(); circle(c, x, y, 8.5); c.fill();
    c.fillStyle = "#56645c"; c.beginPath(); circle(c, x - 1.5, y - 1.5, 4); c.fill();
  }
  // the woodland deepens toward the edge of the map and stays that deep beyond it
  const F = 420, A = L.art?.edge ? "ff" : "99";
  const fade = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    if (!hits({ x: rx, y: ry, w: rw, h: rh }, view)) return;
    const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, C.edge + A); g.addColorStop(1, C.edge + "00");
    c.fillStyle = g; c.fillRect(rx, ry, rw, rh);
  };
  fade(B.x, 0, B.x + F, 0, B.x, B.y, F, B.h); fade(B.x + B.w, 0, B.x + B.w - F, 0, B.x + B.w - F, B.y, F, B.h);
  fade(0, B.y, 0, B.y + F, B.x, B.y, B.w, F); fade(0, B.y + B.h, 0, B.y + B.h - F, B.x, B.y + B.h - F, B.w, F);
  c.fillStyle = C.edge + A;
  // With a theme's opaque map edge, the fill beyond the map overlaps its fade slightly. Edges that
  // only meet antialias at fractional pixels, and the grass under them showed as a thin line.
  const far = 1e5, o = L.art?.edge ? 6 : 0;
  for (const [x, y, w, h] of [[B.x - far, B.y - far, B.w + 2 * far, far + o], [B.x - far, B.y + B.h - o, B.w + 2 * far, far + o], [B.x - far, B.y, far + o, B.h], [B.x + B.w - o, B.y, far + o, B.h]])
    if (hits({ x, y, w, h }, view)) { const x0 = Math.max(x, view.x), y0 = Math.max(y, view.y); c.fillRect(x0, y0, Math.min(x + w, view.x + view.w) - x0, Math.min(y + h, view.y + view.h) - y0); }
}

/** A seamless patch of dense treetops (1024 world units), cached per colour set and context. */
const canopies = new WeakMap<Ctx, { C: Colors; pattern: CanvasPattern }>();
function canopy(c: Ctx, L: LandLook, C: Colors): CanvasPattern | string {
  const hit = canopies.get(c);
  if (hit && hit.C === C) return hit.pattern;
  const k = 0.5, size = 1024, el = document.createElement("canvas");
  el.width = el.height = size * k;
  const g = el.getContext("2d");
  if (!g) return C.edge;
  g.scale(k, k); g.fillStyle = mix(C.floor, C.edge, 0.5); g.fillRect(0, 0, size, size);
  const q = rnd(9173), trees: LTree[] = [];
  for (let i = 0; i < 70; i++) trees.push({ x: q() * size, y: q() * size, r: 60 + q() * 46, kind: q() < 0.45 ? 1 : 0, seed: 1 + Math.floor(q() * 99999), i });
  trees.sort((a, b) => a.y - b.y);
  for (const dy of [-size, 0, size]) for (const dx of [-size, 0, size]) for (const t of trees) {
    if (t.x + dx + t.r < 0 || t.x + dx - t.r > size || t.y + dy + t.r < 0 || t.y + dy - t.r > size) continue;
    paintTree(g, { ...t, x: t.x + dx, y: t.y + dy }, L, C, false);
  }
  const pattern = c.createPattern(el, "repeat");
  if (!pattern) return C.edge;
  pattern.setTransform(new DOMMatrix().scale(1 / k));
  el.width = el.height = 0;
  canopies.set(c, { C, pattern });
  return pattern;
}

function paintProps(c: Ctx, props: LProp[], L: LandLook, C: Colors, under: boolean) {
  const snow = L.snow, autumn = L.season === "autumn";
  for (const p of props) {
    const q = rnd(p.seed), { x, y, r } = p;
    if (under) {
      if (p.kind === "fern" && snow < 0.6) {
        c.strokeStyle = autumn ? "#a8833c" : mix(L.pal.bush[0], "#2f6a3a", 0.3); c.lineWidth = 3; c.lineCap = "round"; c.beginPath();
        const n = 6, a0 = q() * TAU;
        for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU; c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.3) * r * 0.6, y + Math.sin(a + 0.3) * r * 0.6, x + Math.cos(a) * r, y + Math.sin(a) * r); }
        c.stroke();
      } else if (p.kind === "mushrooms" && (autumn || L.season === "spring") && snow < 0.3) {
        for (let k = 0; k < 3; k++) {
          const mx = x + (q() - 0.5) * 22, my = y + (q() - 0.5) * 16;
          c.fillStyle = "#c8443a"; c.beginPath(); circle(c, mx, my, 5 + q() * 2); c.fill();
          c.fillStyle = "#fff4e6"; c.beginPath(); circle(c, mx - 1.5, my - 1.5, 1.3); circle(c, mx + 2, my + 1, 1); c.fill();
        }
      } else if (p.kind === "log") {
        const a = q() * Math.PI;
        c.save(); c.translate(x, y); c.rotate(a);
        c.fillStyle = C.shadow; c.globalAlpha = 0.28; c.beginPath(); roundRect(c, -r + 6, -6, r * 2, 22, 10); c.fill(); c.globalAlpha = 1;
        c.fillStyle = C.wood[0]; c.beginPath(); roundRect(c, -r, -11, r * 2, 22, 10); c.fill();
        c.fillStyle = C.wood[1]; c.beginPath(); roundRect(c, -r + 4, -9, r * 2 - 8, 8, 4); c.fill();
        c.fillStyle = C.wood[2]; c.beginPath(); c.ellipse(r - 2, 0, 6, 10, 0, 0, TAU); c.fill();
        if (snow > 0.2) { c.fillStyle = SNOW; c.globalAlpha = snow; c.beginPath(); roundRect(c, -r + 2, -12, r * 2 - 4, 8, 4); c.fill(); c.globalAlpha = 1; }
        c.restore();
      } else if (p.kind === "stump") {
        c.fillStyle = C.shadow; c.globalAlpha = 0.28; c.beginPath(); circle(c, x + 5, y + 6, r); c.fill(); c.globalAlpha = 1;
        c.fillStyle = C.wood[0]; c.beginPath(); circle(c, x, y, r); c.fill();
        c.fillStyle = snow > 0.3 ? SNOW : C.wood[2]; c.beginPath(); circle(c, x, y, r * 0.75); c.fill();
        c.strokeStyle = C.wood[1]; c.lineWidth = 1.5; c.beginPath(); circle(c, x, y, r * 0.42); c.stroke();
      }
      continue;
    }
    if (p.kind === "rock") {
      const n = 7, pts: P[] = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU, d = r * (0.78 + q() * 0.3); pts.push([x + Math.cos(a) * d * 1.15, y + Math.sin(a) * d * 0.85]); }
      c.fillStyle = C.shadow; c.globalAlpha = 0.3; c.beginPath(); c.ellipse(x + r * 0.3, y + r * 0.4, r * 1.2, r * 0.8, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.fillStyle = C.rock[0]; c.beginPath(); polyline(c, pts); c.closePath(); c.fill();
      c.fillStyle = mix(C.rock[1], SNOW, snow); c.beginPath(); c.ellipse(x - r * 0.2, y - r * 0.2, r * 0.75, r * 0.5, -0.3, 0, TAU); c.fill();
      c.fillStyle = mix(C.rock[2], SNOW, snow); c.beginPath(); circle(c, x - r * 0.38, y - r * 0.32, r * 0.22); c.fill();
      if (snow < 0.5 && q() < 0.5) { c.fillStyle = "#6f9a52"; c.globalAlpha = 0.7; c.beginPath(); circle(c, x + r * 0.35, y + r * 0.2, r * 0.3); c.fill(); c.globalAlpha = 1; }
    } else if (p.kind === "bush") {
      const [a, b, cc] = C.bush;
      c.fillStyle = C.shadow; c.globalAlpha = 0.25; c.beginPath(); c.ellipse(x + 5, y + 7, r * 1.1, r * 0.7, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.fillStyle = a; c.beginPath(); circle(c, x - r * 0.4, y, r * 0.7); circle(c, x + r * 0.4, y + 2, r * 0.66); c.fill();
      c.fillStyle = b; c.beginPath(); circle(c, x, y - r * 0.25, r * 0.6); c.fill();
      c.fillStyle = mix(cc, SNOW, snow * 0.85); c.beginPath(); circle(c, x - r * 0.2, y - r * 0.45, r * 0.32); c.fill();
      const berries = L.season === "autumn" || L.season === "winter";
      if (q() < 0.3 && (berries || L.season === "spring")) {
        c.fillStyle = berries ? "#d2433a" : "#ffd7e6"; c.beginPath();
        for (let k = 0; k < 5; k++) circle(c, x + (q() - 0.5) * r * 1.3, y + (q() - 0.5) * r * 0.9, 2.6);
        c.fill();
      }
    }
  }
}

function paintTree(c: Ctx, t: LTree, L: LandLook, C: Colors, fine: boolean) {
  const { pal, snow } = L, q = rnd(t.seed * 7 + 3), roll = q();
  const { x, y, r } = t;
  if (t.kind === 1) {
    // a conifer from above: layered, pointed rings
    const n = 9 + (t.seed % 3), rot = (t.seed % 100) / 16;
    const [a, b, cc] = C.ever;
    c.fillStyle = a; c.beginPath(); star(c, x, y, r, n, 0.78, rot); c.fill();
    c.fillStyle = mix(b, SNOW, snow * 0.55); c.beginPath(); star(c, x - r * 0.06, y - r * 0.08, r * 0.7, n, 0.74, rot + 0.3); c.fill();
    c.fillStyle = mix(cc, SNOW, snow * 0.85); c.beginPath(); star(c, x - r * 0.1, y - r * 0.12, r * 0.38, n - 2, 0.7, rot + 0.6); c.fill();
    c.fillStyle = mix(a, "#1a3a28", 0.4); c.beginPath(); circle(c, x - r * 0.1, y - r * 0.12, r * 0.07); c.fill();
    return;
  }
  const birch = t.kind === 2;
  if (roll < pal.bare * (birch ? 1.2 : 1)) {
    // bare branches spreading out like a star
    const n = 6 + (t.seed % 3), stroke = birch ? "#bdb5a6" : pal.branch;
    c.strokeStyle = stroke; c.lineCap = "round"; c.lineWidth = Math.max(1.5, r * 0.08); c.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + q() * 0.6, len = r * (0.7 + q() * 0.3), ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      c.moveTo(x, y); c.lineTo(ex, ey);
      if (fine) { const mx = x + Math.cos(a) * len * 0.55, my = y + Math.sin(a) * len * 0.55, b = a + (q() < 0.5 ? 0.6 : -0.6); c.moveTo(mx, my); c.lineTo(mx + Math.cos(b) * len * 0.4, my + Math.sin(b) * len * 0.4); }
    }
    c.stroke();
    if (snow > 0) { c.strokeStyle = SNOW; c.globalAlpha = 0.4 + snow * 0.6; c.lineWidth = Math.max(1, r * 0.035); c.stroke(); c.globalAlpha = 1; }
    c.fillStyle = mix(stroke, "#3e3128", 0.3); c.beginPath(); circle(c, x, y, r * 0.13); c.fill();
    return;
  }
  let tri = pal.trees[(t.seed + (L.season === "autumn" ? (t.seed >> 3) : 0)) % pal.trees.length];
  if (birch) tri = [mix(tri[0], "#8fbf5a", 0.3), mix(tri[1], "#b4d872", 0.3), mix(tri[2], "#d8ef9a", 0.3)];
  const L0 = lobes(t);
  c.fillStyle = tri[0]; c.beginPath(); for (const [lx, ly, lr] of L0) circle(c, lx, ly, lr); c.fill();
  c.fillStyle = mix(tri[1], SNOW, snow * 0.55); c.beginPath();
  for (const [lx, ly, lr] of L0) circle(c, x + (lx - x) * 0.66 - r * 0.14, y + (ly - y) * 0.66 - r * 0.16, lr * 0.72);
  c.fill();
  c.fillStyle = mix(tri[2], SNOW, snow * 0.9); c.beginPath();
  circle(c, x - r * 0.3, y - r * 0.34, r * 0.3); circle(c, x + r * 0.05, y - r * 0.44, r * 0.18); circle(c, x - r * 0.48, y - r * 0.02, r * 0.16);
  c.fill();
  if (fine && roll > 1 - pal.blossom.share && pal.blossom.colors.length) {
    for (let k = 0; k < 14; k++) {
      const a = q() * TAU, d = Math.sqrt(q()) * r * 0.85;
      c.fillStyle = pal.blossom.colors[Math.floor(q() * pal.blossom.colors.length)];
      c.beginPath(); circle(c, x + Math.cos(a) * d - r * 0.1, y + Math.sin(a) * d - r * 0.1, 3 + q() * 2.6); c.fill();
    }
  }
}
