// The city around the office, as plain geometry (no drawing): a grid of streets around one
// big "campus" block that holds the office, the green walk past the shop and the park; city
// blocks around it with neighbouring buildings, pocket parks and empty plots; a green belt at
// the edge. Everything is in world coordinates and depends only on where the office, the shop
// and the park are, so the same building always gets the same city.
//
// The game can use the plots (stable ids, see PLOT_IDS) to put new buildings on later.

export type Rect = { x: number; y: number; w: number; h: number };

/** A street, sidewalks included (STREET wide). `axis` "h" runs west to east, "v" north to south. */
export type Street = Rect & { id: string; axis: "h" | "v"; avenue: boolean };
/** Where two streets meet; `arms` says which way streets leave it (for crosswalks). */
export type Crossing = Rect & { arms: { n: boolean; s: boolean; w: boolean; e: boolean } };
export type PlotKind = "fenced" | "for-sale";
/** An empty plot the game can build on. `id` stays the same however the office grows. */
export type Plot = Rect & { id: string; kind: PlotKind };
export type NeighbourKind = "cafe" | "library" | "datacenter" | "apartments" | "houses" | "greenroof" | "solar";
/** A city block (between streets) and what stands on it. */
export type Block = Rect & {
  id: string;
  use: "campus" | "plot" | "neighbour" | "pocket-park" | "greenbelt";
  kind?: NeighbourKind;
  /** whether a planted footpath crosses the block (north to south or west to east) */
  passage?: "v" | "h";
};
/** A loop a car drives round, as an SVG path in world coordinates, and its length. */
export type DriveLoop = { id: string; d: string; len: number };

export type CityLayout = {
  /** The suggested outdoor rect: the whole city plus a green belt at its edge. */
  bounds: Rect;
  /** The office's own block (office, the walk to the park, the shop and the park). */
  campus: Rect;
  streets: Street[];
  crossings: Crossing[];
  blocks: Block[];
  plots: Plot[];
  /** The planted walk from the office entrance past the shop to the park. */
  greenway: Rect;
  /** Footpaths inside the campus that lead out to the streets (north, south, east). */
  paths: Rect[];
  loops: DriveLoop[];
};

export const STREET = 200;          // street width: sidewalk, two lanes, sidewalk
export const SIDEWALK = 38;
const BW = 1250, BH = 960;          // block pitch (street to street)
const EDGE = 560;                   // green belt beyond the outer streets
const MARGIN = 280;                 // lawn between the office and the campus edge

/** Stable ids of the empty plots, in the order they are handed out. */
export const PLOT_IDS = ["campus-north", "north-1", "north-2", "south-1", "east-1", "west-1"] as const;

export type CityInput = {
  building: Rect;
  entranceY: number;
  park: Rect;
  /** The shop building (just east of the entrance, south of the walk). */
  shop?: Rect | null;
};

export function cityLayout(o: CityInput): CityLayout {
  const { building: b, park: p } = o;
  const shop = o.shop ?? null;
  const S = STREET;
  // the campus block: the office with a lawn round it, the walk, the shop and the park
  const x0 = b.x - MARGIN, x1 = p.x + p.w + 170;
  const y0 = Math.min(b.y, p.y) - MARGIN;
  const y1 = Math.max(b.y + b.h, p.y + p.h, shop ? shop.y + shop.h : -Infinity) + MARGIN;
  const campus = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

  // street lines (left or top edge of each street)
  const Lr = x0 - S, Rr = x1, Tr = y0 - S, Br = y1;
  const outerX = [Lr - 2 * BW, Lr - BW, Lr, Rr, Rr + BW, Rr + 2 * BW];
  const outerY = [Tr - 2 * BH, Tr - BH, Tr, Br, Br + BH, Br + 2 * BH];
  // streets north and south of the campus split it into blocks about BW wide; west and east of it, BH tall
  const n = Math.max(1, Math.round((x1 - x0 + S) / BW)), P = (x1 - x0 + S) / n;
  const m = Math.max(1, Math.round((y1 - y0 + S) / BH)), Q = (y1 - y0 + S) / m;
  const innerX = Array.from({ length: n - 1 }, (_, i) => Math.round(Lr + (i + 1) * P));
  const innerY = Array.from({ length: m - 1 }, (_, j) => Math.round(Tr + (j + 1) * Q));
  const bounds = { x: Lr - 2 * BW - EDGE, y: Tr - 2 * BH - EDGE, w: 0, h: 0 };
  bounds.w = Rr + 2 * BW + S + EDGE - bounds.x;
  bounds.h = Br + 2 * BH + S + EDGE - bounds.y;
  const R = bounds.x + bounds.w, B = bounds.y + bounds.h;

  // avenues: the ring round the campus and the two streets through the city's middle get rows of trees
  const avenueX = new Set([Lr, Rr]), avenueY = new Set([Tr, Br]);
  const streets: Street[] = [];
  outerY.forEach((y, i) => streets.push({ id: `h${i}`, axis: "h", x: bounds.x, y, w: bounds.w, h: S, avenue: avenueY.has(y) }));
  outerX.forEach((x, i) => streets.push({ id: `v${i}`, axis: "v", x, y: bounds.y, w: S, h: bounds.h, avenue: avenueX.has(x) }));
  innerY.forEach((y, j) => {
    streets.push({ id: `hw${j}`, axis: "h", x: bounds.x, y, w: Lr - bounds.x, h: S, avenue: false });
    streets.push({ id: `he${j}`, axis: "h", x: Rr + S, y, w: R - Rr - S, h: S, avenue: false });
  });
  innerX.forEach((x, i) => {
    streets.push({ id: `vn${i}`, axis: "v", x, y: bounds.y, w: S, h: Tr - bounds.y, avenue: false });
    streets.push({ id: `vs${i}`, axis: "v", x, y: Br + S, w: S, h: B - Br - S, avenue: false });
  });

  // crossings: wherever a north-south street meets a west-east one
  const crossings: Crossing[] = [];
  const hs = streets.filter((s) => s.axis === "h"), vs = streets.filter((s) => s.axis === "v");
  for (const v of vs) for (const h of hs) {
    const cx = v.x, cy = h.y;
    const inH = cx >= h.x - 1 && cx + S <= h.x + h.w + 1, inV = cy >= v.y - 1 && cy + S <= v.y + v.h + 1;
    // a T junction: the side street ends at the ring, so it touches it without overlapping
    const touchV = cy + S >= v.y - 1 && cy <= v.y + v.h + 1 && (Math.abs(v.y - (cy + S)) < 2 || Math.abs(v.y + v.h - cy) < 2);
    const touchH = cx + S >= h.x - 1 && cx <= h.x + h.w + 1 && (Math.abs(h.x - (cx + S)) < 2 || Math.abs(h.x + h.w - cx) < 2);
    if (!((inH && (inV || touchV)) || (inV && touchH))) continue;
    const arms = {
      n: v.y < cy - 1, s: v.y + v.h > cy + S + 1,
      w: h.x < cx - 1, e: h.x + h.w > cx + S + 1,
    };
    // a side street that stops at this crossing (T junction) leaves only on its own side
    if (touchV && !inV) { arms.n = Math.abs(v.y + v.h - cy) < 2; arms.s = Math.abs(v.y - (cy + S)) < 2; }
    if (touchH && !inH) { arms.w = Math.abs(h.x + h.w - cx) < 2; arms.e = Math.abs(h.x - (cx + S)) < 2; }
    if (!crossings.some((c) => c.x === cx && c.y === cy)) crossings.push({ x: cx, y: cy, w: S, h: S, arms });
  }

  // blocks: the spaces between streets, named by column and row counted outward from the campus
  type Band = { id: string; a: number; b: number };
  const bandsBetween = (lines: number[], lo: number, hi: number, name: (i: number, k: number) => string): Band[] => {
    const edges = [lo, ...lines.flatMap((l) => [l, l + S]), hi];
    const out: Band[] = [];
    for (let i = 0; i < edges.length; i += 2) out.push({ id: name(i / 2, edges.length / 2), a: edges[i], b: edges[i + 1] });
    return out;
  };
  const westCols = bandsBetween([Lr - 2 * BW, Lr - BW], bounds.x, Lr, (i, k) => `w${k - i}`);
  const eastCols = bandsBetween([Rr + BW, Rr + 2 * BW], Rr + S, R, (i) => `e${i + 1}`);
  const northRows = bandsBetween([Tr - 2 * BH, Tr - BH], bounds.y, Tr, (i, k) => `n${k - i}`);
  const southRows = bandsBetween([Br + BH, Br + 2 * BH], Br + S, B, (i) => `s${i + 1}`);
  const midCols = bandsBetween(innerX, Lr + S, Rr, (i) => `c${i + 1}`);
  const midRows = bandsBetween(innerY, Tr + S, Br, (i) => `m${i + 1}`);
  const cells: Block[] = [];
  const add = (c: Band, r: Band) => cells.push({ id: `${c.id}-${r.id}`, x: c.a, y: r.a, w: c.b - c.a, h: r.b - r.a, use: "neighbour" });
  for (const r of [...northRows, ...southRows]) for (const c of [...westCols, ...midCols, ...eastCols]) add(c, r);
  for (const r of midRows) for (const c of [...westCols, ...eastCols]) add(c, r);

  // what stands where. Fixed picks first (stable ids), then a seeded mix for the rest.
  const mid = (k: number) => `m${Math.min(m, k)}`;
  // the row east of the park where its footpath comes out: the cafe stands there, the east plot next to it
  const eyRow = midRows.findIndex((r) => o.entranceY >= r.a - S && o.entranceY < r.b + S) + 1 || 1;
  const eastPlotRow = eyRow === 1 ? Math.min(m, 2) : 1;
  const at = (id: string) => cells.find((c) => c.id === id);
  const plotCells: [string, string, PlotKind][] = [
    ["north-1", "c2-n1", "fenced"], ["north-2", `c${Math.min(n, 4)}-n1`, "for-sale"], ["south-1", "c2-s1", "for-sale"],
    ["east-1", `e1-m${eastPlotRow}`, "fenced"], ["west-1", `w1-${mid(2)}`, "for-sale"],
  ];
  const plots: Plot[] = [];
  // the first plot is on the campus itself, north of the park: room for the company to grow
  const top = y0 + 130, bottom = p.y - 90;
  if (bottom - top >= 260) plots.push({ id: "campus-north", kind: "for-sale", x: p.x + 30, y: top, w: p.w - 60, h: bottom - top });
  for (const [id, cid, kind] of plotCells) {
    const c = at(cid);
    if (!c || c.use !== "neighbour") continue;
    c.use = "plot";
    plots.push({ id, kind, x: c.x + 70, y: c.y + 70, w: c.w - 140, h: c.h - 140 });
  }
  const pin = (cid: string, kind: NeighbourKind) => { const c = at(cid); if (c && c.use === "neighbour" && !c.kind) c.kind = kind; };
  pin(`e1-m${eyRow}`, "cafe");
  pin(`c${Math.min(n, 3)}-n1`, "library");
  pin(`w1-${mid(1)}`, "datacenter");
  const mixKinds: (NeighbourKind | "pocket-park")[] = ["apartments", "pocket-park", "houses", "greenroof", "apartments", "solar", "pocket-park", "houses"];
  let k = 0;
  for (const c of cells) {
    const edge = /^(w3|e3)-|-(n3|s3)$/.test(c.id);
    if (edge) { c.use = "greenbelt"; continue; }
    if (c.use !== "neighbour" || c.kind) continue;
    const pick = mixKinds[(k++ * 5 + (c.id.length * 3)) % mixKinds.length];
    if (pick === "pocket-park") c.use = "pocket-park"; else c.kind = pick;
  }
  for (const c of cells) {
    if (c.use === "pocket-park" || c.kind === "apartments" || c.kind === "houses") c.passage = c.w >= c.h ? "v" : "h";
  }
  const blocks: Block[] = [{ ...campus, id: "campus", use: "campus" }, ...cells];

  // the walk from the entrance to the park, and footpaths from it out to the streets
  const ey = o.entranceY;
  const greenway = { x: b.x + b.w + 36, y: ey - 62, w: p.x - (b.x + b.w + 36) + 40, h: 124 };
  const gx = Math.round((b.x + b.w + p.x) / 2);
  const paths: Rect[] = [
    { x: gx - 30, y: y0, w: 60, h: greenway.y - y0 },                       // north to the ring street
    { x: p.x + p.w, y: ey - 30, w: x1 - (p.x + p.w), h: 60 },               // east, out of the park
  ];
  const southX = shop ? shop.x + shop.w + 50 : gx;
  if (shop) paths.push({ x: southX, y: greenway.y + greenway.h, w: 60, h: y1 - greenway.y - greenway.h });

  // cars drive clockwise round blocks in the right-hand lane (the block on their right)
  const lane = SIDEWALK + (S - 2 * SIDEWALK) * 0.25;            // middle of the lane next to the block
  const far = SIDEWALK + (S - 2 * SIDEWALK) * 0.75;             // middle of the other lane
  const loopAround = (id: string, r: Rect, off: number, cw = true): DriveLoop => {
    // r is the block; the loop runs `off` outside its edge
    const a = { x: r.x - off, y: r.y - off, w: r.w + 2 * off, h: r.h + 2 * off };
    const rr = Math.min(70, off * 1.2);
    const P2 = (x: number, y: number) => `${Math.round(x)} ${Math.round(y)}`;
    const L = a.x, T = a.y, Rt = a.x + a.w, Bt = a.y + a.h;
    const d = cw
      ? `M${P2(L + rr, T)}L${P2(Rt - rr, T)}Q${P2(Rt, T)} ${P2(Rt, T + rr)}L${P2(Rt, Bt - rr)}Q${P2(Rt, Bt)} ${P2(Rt - rr, Bt)}L${P2(L + rr, Bt)}Q${P2(L, Bt)} ${P2(L, Bt - rr)}L${P2(L, T + rr)}Q${P2(L, T)} ${P2(L + rr, T)}Z`
      : `M${P2(L + rr, T)}Q${P2(L, T)} ${P2(L, T + rr)}L${P2(L, Bt - rr)}Q${P2(L, Bt)} ${P2(L + rr, Bt)}L${P2(Rt - rr, Bt)}Q${P2(Rt, Bt)} ${P2(Rt, Bt - rr)}L${P2(Rt, T + rr)}Q${P2(Rt, T)} ${P2(Rt - rr, T)}Z`;
    return { id, d, len: 2 * (a.w + a.h) - rr * 1.7 };
  };
  const loops: DriveLoop[] = [loopAround("ring", campus, lane), loopAround("ring-out", campus, far, false)];
  const union = (...ids: string[]) => {
    const cs = ids.map(at).filter((c): c is Block => !!c);
    if (cs.length < ids.length) return null;
    const ux = Math.min(...cs.map((c) => c.x)), uy = Math.min(...cs.map((c) => c.y));
    return { x: ux, y: uy, w: Math.max(...cs.map((c) => c.x + c.w)) - ux, h: Math.max(...cs.map((c) => c.y + c.h)) - uy };
  };
  const south = union("c2-s1", "c3-s1"), east = union(`e1-m${eastPlotRow}`), west = union("w1-n1", "w1-m1"), north = union(`c${n}-n1`, `c${n}-n2`);
  if (south) loops.push(loopAround("south", south, lane));
  if (east) loops.push(loopAround("east", east, lane));
  if (west) loops.push(loopAround("west", west, lane));
  if (north) loops.push(loopAround("north", north, lane));
  return { bounds, campus, streets, crossings, blocks, plots, greenway, paths, loops };
}
