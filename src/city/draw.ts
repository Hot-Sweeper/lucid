// Drawing the city of layout.ts, seen from above in the flat style of the office: streets with
// sidewalks, crosswalks and tree-lined avenues, neighbouring rooftops, pocket parks, empty plots,
// the green walk from the office past the shop to the park, and robot cars.
//
// Two parts, like the rest of the outdoors:
//  - still: everything that never moves, drawn as few merged paths (it becomes one image).
//  - live: what moves or depends on the hour (cars and scooters, lamp glow, lit skylights, the
//    data center's blinking lights, the plot signs, the trees of the green walk). It is small:
//    every animated svg element costs time on every frame.

import { STREET as S, SIDEWALK as SW, type Block, type CityLayout, type Rect } from "./layout";
import { Grove, Shapes, SNOW, bushInto, fill, mix, n1, n2, rnd, seedAt, stroke, timing, treeInto, type Look } from "./art";

const CELL = 1800;   // shapes are grouped by area in cells this big
// set the drawing order for the next shapes (see Shapes.z)
const Z = (s: Shapes, z: number) => { s.z = z; return s; };

export type CityArt = {
  /** patterns, to go inside the svg's <defs> */
  defs: string;
  /** the city's ground, streets and blocks: under the office shell and the park */
  ground: string;
  /** street trees, rooftops and lamps: over the ground */
  still: string;
  /** moving and night-lit parts, in svg coordinates */
  live: string;
  /** number of flat shapes in the still part (each subpath counts) */
  shapes: number;
  /** shapes per layer and the number of trees, for tuning */
  stats: Record<string, number>;
};

type View = { ox: number; oy: number; w: number; h: number };
type Opts = { building: Rect; entranceY: number; park: Rect; shop: Rect | null; frozen: boolean };

const CAR_COLS = ["#f2f4fa", "#f6ecdc", "#f2f4fa", "#4fb6ff", "#ff9f5a", "#f6ecdc", "#3fbf86", "#ffd27a", "#b07cff"];

export function drawCity(C: CityLayout, L: Look, V: View, o: Opts): CityArt {
  const snow = L.snow, pal = L.pal;
  const inView = (x: number, y: number, pad = 0) => x > V.ox - pad && x < V.ox + V.w + pad && y > V.oy - pad && y < V.oy + V.h + pad;
  const rectInView = (r: Rect) => r.x < V.ox + V.w && r.x + r.w > V.ox && r.y < V.oy + V.h && r.y + r.h > V.oy;

  // --- colours --------------------------------------------------------------------------------
  const sidewalk = mix("#cdc5b3", SNOW, snow * 0.75);
  const curb = mix("#aaa293", SNOW, snow * 0.45);
  const asphalt = mix("#575d6c", "#7f8796", snow * 0.3);
  const marking = "#eee8d8";
  const paveC = mix(pal.plaza, SNOW, snow * 0.5), pathC = mix(pal.path, SNOW, snow * 0.55);
  const hedge = L.pal.bush;
  const shadowC = pal.shadow;
  const roofSnow = (c: string) => mix(c, SNOW, snow * 0.85);

  // --- layers (back to front) -----------------------------------------------------------------
  const base = new Shapes(CELL);      // ground details: plots, paths, plazas, courtyards
  const road = new Shapes(CELL);      // sidewalks, curbs, asphalt
  const mark = new Shapes(CELL);      // lane markings and crosswalks
  const low = new Shapes(CELL);       // shadows of buildings, hedges, planters, benches, parked cars
  const roofs = new Shapes(CELL);     // rooftops and their details
  const trees = new Grove(CELL);      // all still trees
  const top = new Shapes(CELL);       // lamp heads, things over the trees
  const glow = new Shapes(4000), core = new Shapes(4000), lit = new Shapes(4000);   // night light (live)
  let liveExtra = "";                 // signs, string lights, blinking lights
  let treeN = 0;

  const tree = (x: number, y: number, r: number, light = true) => {
    if (!inView(x, y, r)) return;
    treeInto(trees, x, y, r, treeN % 3, L, 500 + treeN, light);
    treeN++;
  };
  const planter = (x: number, y: number, r = 20) => {
    Z(low, 1).circle(x, y, r - 2.5, `fill="${mix("#6b5646", SNOW, snow * 0.8)}" stroke="${mix("#b3a893", SNOW, snow * 0.6)}" stroke-width="5"`);
  };
  // a low hedge strip with its shadow and a lighter top
  const hedgeRect = (x: number, y: number, w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    Z(low, 1).rect(x, y, w, h, fill(hedge[1]), 9);
    Z(low, 2).rect(x + 3, y + 2, w - 6, h * 0.55, fill(mix(hedge[2], SNOW, snow * 0.85)), 7);
  };
  // hedges round a rect, leaving gaps (lists of [from, to] along each side)
  type Gaps = Partial<Record<"n" | "s" | "w" | "e", [number, number][]>>;
  const hedgeAround = (r: Rect, inset: number, gaps: Gaps = {}, t = 18) => {
    const run = (a: number, b: number, g: [number, number][] = [], put: (a: number, b: number) => void) => {
      let s = a;
      for (const [ga, gb] of [...g].sort((p, q) => p[0] - q[0])) { if (ga > s) put(s, Math.min(ga, b)); s = Math.max(s, gb); }
      if (s < b) put(s, b);
    };
    const x0 = r.x + inset, y0 = r.y + inset, x1 = r.x + r.w - inset, y1 = r.y + r.h - inset;
    run(x0, x1, gaps.n, (a, b) => hedgeRect(a, y0, b - a, t));
    run(x0, x1, gaps.s, (a, b) => hedgeRect(a, y1 - t, b - a, t));
    run(y0 + t, y1 - t, gaps.w, (a, b) => hedgeRect(x0, a, t, b - a));
    run(y0 + t, y1 - t, gaps.e, (a, b) => hedgeRect(x1 - t, a, t, b - a));
  };
  const bench = (x: number, y: number, vertical = false) => {
    const w = vertical ? 22 : 64, h = vertical ? 64 : 22;
    Z(low, 0).rect(x + 3, y + 5, w, h, fill(shadowC, 0.2), 4);
    Z(low, 1).rect(x, y, w, h, fill(snow > 0.3 ? mix("#b9854c", SNOW, snow * 0.7) : "#b9854c"), 4);
    Z(low, 2).rect(x, y, vertical ? 8 : w, vertical ? h : 8, fill("#a4723f"), 3);
  };
  const lamp = (x: number, y: number, bx: number, by: number) => {
    if (!inView(x, y, 60)) return;
    Z(top, 0).add(`fill="none" stroke="#3a3f4f" stroke-width="9" stroke-linecap="round"`, `M${n1(x)} ${n1(y)}L${n1(bx)} ${n1(by)}`, x, y);
    Z(top, 1).circle(bx, by, 3.4, fill("#fff3c9"));
    glow.ellipse(bx, by + 4, 58, 44, "");
    core.circle(bx, by, 12, "");
  };

  // --- ground patterns ------------------------------------------------------------------------
  const tuftOp = pal.tuftOpacity * (1 - snow);
  const qg = rnd(7);
  let tufts = "";
  for (let i = 0; i < 9; i++) {
    const x = 6 + qg() * 128, y = 8 + qg() * 124;
    tufts += `M${n1(x)} ${n1(y)}l2 -6l2 6`;
  }
  const qs = rnd(321);
  let lumps = "";
  for (let i = 0; i < 7; i++) {
    const x = qs() * 700, y = qs() * 700, size = 30 + qs() * 60;
    for (let j = 0, m = 3 + Math.floor(qs() * 3); j < m; j++) {
      const a = qs() * Math.PI * 2, d = qs() * size, cx = x + Math.cos(a) * d * 1.4, cy = y + Math.sin(a) * d * 0.6;
      const rx = size * (0.5 + qs() * 0.5), ry = size * (0.35 + qs() * 0.25);
      // drawn three times over the tile edges so the pattern wraps without seams
      for (const [dx, dy] of [[0, 0], [-700, 0], [0, -700], [700, 0], [0, 700]]) if (cx + dx + rx > 0 && cx + dx - rx < 700 && cy + dy + ry > 0 && cy + dy - ry < 700)
        lumps += `<ellipse cx="${n1(cx + dx)}" cy="${n1(cy + dy)}" rx="${n1(rx)}" ry="${n1(ry)}"/>`;
    }
  }
  const mown = [mix(pal.park[1], SNOW, snow * 0.6), mix(pal.park[0], SNOW, snow * 0.6)];
  const defs = `
    <pattern id="lc-grass" width="140" height="140" patternUnits="userSpaceOnUse"><path d="${tufts}" stroke="${pal.tuft}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="${n2(0.5 * tuftOp)}"/></pattern>
    <pattern id="lc-snow" width="700" height="700" patternUnits="userSpaceOnUse"><g fill="${SNOW}">${lumps}</g></pattern>
    <pattern id="lc-pave" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="${paveC}"/><path d="M0 0.75H44M0.75 0V44" stroke="${mix(paveC, "#7a6a50", 0.16)}" stroke-width="1.5"/></pattern>
    <pattern id="lc-solar" width="26" height="18" patternUnits="userSpaceOnUse"><rect width="26" height="18" fill="#3b5a8f"/><rect x="1.5" y="1.5" width="23" height="15" fill="#4a6fa8"/><path d="M13 1.5V16.5M1.5 9H24.5" stroke="#3b5a8f" stroke-width="1.2"/></pattern>
    <pattern id="lc-mown" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="${mown[0]}"/><rect width="60" height="120" fill="${mown[1]}"/></pattern>
    <pattern id="lc-dirt" width="90" height="90" patternUnits="userSpaceOnUse"><rect width="90" height="90" fill="${mix("#c4a77a", SNOW, snow * 0.8)}"/><circle cx="20" cy="30" r="3" fill="#a88b60"/><circle cx="64" cy="14" r="2.4" fill="#a88b60"/><circle cx="52" cy="70" r="3.4" fill="#d9c39a"/><circle cx="10" cy="76" r="2" fill="#a88b60"/></pattern>`;
  const groundSvg = `<rect x="${V.ox}" y="${V.oy}" width="${V.w}" height="${V.h}" fill="url(#lc-grass)"/>` +
    (snow > 0 && snow < 0.95 ? `<rect x="${V.ox}" y="${V.oy}" width="${V.w}" height="${V.h}" fill="url(#lc-snow)" opacity="${n2(Math.min(1, snow * 1.4) * 0.9)}"/>` : "");

  // --- streets --------------------------------------------------------------------------------
  const roadOf = (s: { axis: "h" | "v" } & Rect) => s.axis === "h" ? { x: s.x, y: s.y + SW, w: s.w, h: S - 2 * SW } : { x: s.x + SW, y: s.y, w: S - 2 * SW, h: s.h };
  const clipR = (r: Rect): Rect | null => {
    const x = Math.max(r.x, V.ox - 50), y = Math.max(r.y, V.oy - 50), x2 = Math.min(r.x + r.w, V.ox + V.w + 50), y2 = Math.min(r.y + r.h, V.oy + V.h + 50);
    return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
  };
  const sideFill = fill(sidewalk), curbFill = fill(curb), roadFill = fill(asphalt);
  for (const s of C.streets) {
    const r = clipR(s);
    if (!r) continue;
    road.rect(r.x, r.y, r.w, r.h, sideFill);
  }
  for (const s of C.streets) {
    const rr = clipR(roadOf(s));
    if (!rr) continue;
    road.rect(rr.x - (s.axis === "v" ? 5 : 0), rr.y - (s.axis === "h" ? 5 : 0), rr.w + (s.axis === "v" ? 10 : 0), rr.h + (s.axis === "h" ? 10 : 0), curbFill);
  }
  for (const s of C.streets) { const rr = clipR(roadOf(s)); if (rr) road.rect(rr.x, rr.y, rr.w, rr.h, roadFill); }
  for (const c of C.crossings) {
    if (!rectInView(c)) continue;
    const a = c.arms;
    if (a.n || a.s) road.rect(c.x + SW, a.n ? c.y : c.y + SW, S - 2 * SW, S - (a.n ? 0 : SW) - (a.s ? 0 : SW), roadFill);
    if (a.w || a.e) road.rect(a.w ? c.x : c.x + SW, c.y + SW, S - (a.w ? 0 : SW) - (a.e ? 0 : SW), S - 2 * SW, roadFill);
  }
  // lane markings: a dashed centre line between crossings; zebra crossings in line with the sidewalks
  const dash = `fill="none" stroke="${marking}" stroke-width="5" stroke-dasharray="38 30" opacity="${n2(0.85 - snow * 0.6)}"`;
  const zebra = (w: number) => `fill="none" stroke="${marking}" stroke-width="${w}" stroke-dasharray="11 10" opacity="${n2(0.92 - snow * 0.55)}"`;
  for (const s of C.streets) {
    const along = s.axis === "h";
    const a0 = along ? s.x : s.y, a1 = along ? s.x + s.w : s.y + s.h, mid = along ? s.y + S / 2 : s.x + S / 2;
    const stops = C.crossings.filter((c) => along ? c.y === s.y && c.x >= s.x - S && c.x <= s.x + s.w : c.x === s.x && c.y >= s.y - S && c.y <= s.y + s.h)
      .map((c) => (along ? c.x : c.y)).sort((p, q) => p - q);
    let from = a0;
    for (const at of [...stops, Infinity]) {
      const to = Math.min(a1, at - 26);
      const f = Math.max(from, along ? V.ox - 40 : V.oy - 40), t = Math.min(to, along ? V.ox + V.w + 40 : V.oy + V.h + 40);
      const crossOk = along ? mid > V.oy - 100 && mid < V.oy + V.h + 100 : mid > V.ox - 100 && mid < V.ox + V.w + 100;
      if (t - f > 60 && crossOk) {
        if (along) mark.line(f + 20, mid, t, mid, dash); else mark.line(mid, f + 20, mid, t, dash);
      }
      if (at === Infinity) break;
      from = at + S + 26;
    }
  }
  for (const c of C.crossings) {
    if (!rectInView(c)) continue;
    const z = zebra(SW - 8), a = c.arms;
    if (a.n) mark.line(c.x + SW + 6, c.y + SW / 2, c.x + S - SW - 6, c.y + SW / 2, z);
    if (a.s) mark.line(c.x + SW + 6, c.y + S - SW / 2, c.x + S - SW - 6, c.y + S - SW / 2, z);
    if (a.w) mark.line(c.x + SW / 2, c.y + SW + 6, c.x + SW / 2, c.y + S - SW - 6, z);
    if (a.e) mark.line(c.x + S - SW / 2, c.y + SW + 6, c.x + S - SW / 2, c.y + S - SW - 6, z);
  }
  // mid-block zebra crossings where the campus footpaths meet the ring streets
  const camp = C.campus;
  const crossAt: { x: number; y: number; axis: "h" | "v" }[] = [];
  for (const p of C.paths) {
    if (p.y <= camp.y + 1 && p.w < p.h) crossAt.push({ x: p.x + p.w / 2, y: camp.y - S, axis: "h" });
    if (p.y + p.h >= camp.y + camp.h - 1 && p.w < p.h) crossAt.push({ x: p.x + p.w / 2, y: camp.y + camp.h, axis: "h" });
    if (p.x + p.w >= camp.x + camp.w - 1 && p.w > p.h) crossAt.push({ x: camp.x + camp.w, y: p.y + p.h / 2, axis: "v" });
  }
  for (const z of crossAt) {
    if (z.axis === "h") mark.line(z.x, z.y + SW + 4, z.x, z.y + S - SW - 4, zebra(64));
    else mark.line(z.x + SW + 4, z.y, z.x + S - SW - 4, z.y, zebra(64));
  }
  // the avenue: the ring of streets round the office's block
  const onRing = (x: number, y: number) => x > C.campus.x - S - 10 && x < C.campus.x + C.campus.w + S + 10 && y > C.campus.y - S - 10 && y < C.campus.y + C.campus.h + S + 10;
  const nearCrossing = (x: number, y: number, pad: number) =>
    C.crossings.some((c) => x > c.x - pad && x < c.x + S + pad && y > c.y - pad && y < c.y + S + pad) ||
    crossAt.some((z) => z.axis === "h" ? Math.abs(x - z.x) < 80 && y > z.y - 20 && y < z.y + S + 20 : Math.abs(y - z.y) < 80 && x > z.x - 20 && x < z.x + S + 20);

  // street trees in round planters (rows on the avenues, a few on side streets) and street lamps
  for (const s of C.streets) {
    const along = s.axis === "h";
    const len = along ? s.w : s.h, start = along ? s.x : s.y;
    const sides = [SW / 2, S - SW / 2];
    const treeGap = s.avenue ? 220 : 0, lampGap = s.avenue ? 480 : 820;
    sides.forEach((off, si) => {
      if (treeGap) for (let t = start + (si ? treeGap / 2 : 0) + 60; t < start + len - 40; t += treeGap) {
        const x = along ? t : s.x + off, y = along ? s.y + off : t;
        if (!inView(x, y, 80) || nearCrossing(x, y, 70) || !onRing(x, y)) continue;
        planter(x, y);
        tree(x, y, 24 + ((Math.round(t) >> 3) % 3) * 4);
      }
      for (let t = start + lampGap / 2 + (si ? lampGap / 2 : 0) + 105; t < start + len - 40; t += lampGap) {
        const x = along ? t : s.x + off, y = along ? s.y + off : t;
        if (!inView(x, y, 80) || nearCrossing(x, y, 40)) continue;
        const toward = si ? -1 : 1;   // the lamp's head leans over the road
        lamp(x, y, along ? x : x + toward * 16, along ? y + toward * 16 : y);
      }
    });
  }

  // --- rooftops ---------------------------------------------------------------------------------
  // a flat roof with a parapet and a drop shadow; returns the roof's inner face
  const roof = (x: number, y: number, w: number, h: number, color: string, rim = 10) => {
    Z(low, 0).rect(x + 18, y + 26, w, h, fill(shadowC, 0.3), 6);
    Z(roofs, 0).rect(x, y, w, h, fill(mix(mix(color, "#3a3f4f", 0.22), SNOW, snow * 0.6)), 6);
    Z(roofs, 1).rect(x + rim, y + rim, w - 2 * rim, h - 2 * rim, fill(roofSnow(color)), 3);
    return { x: x + rim, y: y + rim, w: w - 2 * rim, h: h - 2 * rim };
  };
  const hvac = (x: number, y: number) => {
    Z(roofs, 4).rect(x + 3, y + 4, 46, 34, fill(shadowC, 0.18), 4);
    Z(roofs, 5).rect(x, y, 46, 34, fill(mix("#b4bcc8", SNOW, snow * 0.7)), 4);
    Z(roofs, 6).circle(x + 23, y + 17, 12, fill("#7d8696"));
    Z(roofs, 7).circle(x + 23, y + 17, 4, fill("#5a6175"));
  };
  const skylight = (x: number, y: number, w: number, h: number) => {
    Z(roofs, 6).rect(x, y, w, h, fill(mix("#8fc9e2", SNOW, snow * 0.5)), 3);
    Z(roofs, 7).add(stroke("#e8f8ff", 3, 0.7), `M${n1(x + w * 0.2)} ${n1(y + h * 0.75)}L${n1(x + w * 0.5)} ${n1(y + h * 0.25)}`, x, y);
    lit.rect(x - 2, y - 2, w + 4, h + 4, "", 4);
  };
  const solar = (x: number, y: number, w: number, h: number) => {
    Z(roofs, 2).rect(x + 3, y + 4, w, h, fill(shadowC, 0.18), 2);
    Z(roofs, 3).rect(x, y, w, h, `fill="url(#lc-solar)"`, 2);
    if (snow > 0.3) Z(roofs, 4).rect(x, y, w, h * 0.5, fill(SNOW, snow * 0.8), 2);
  };
  const roofGarden = (x: number, y: number, w: number, h: number, q: () => number) => {
    Z(roofs, 2).rect(x, y, w, h, fill(mix(pal.park[1], SNOW, snow * 0.7)), 8);
    for (let i = 0; i < 3; i++) {
      const bx = x + 26 + q() * (w - 52), by = y + 22 + q() * (h - 44);
      Z(roofs, 3).circle(bx, by, 14, fill(mix(hedge[0], SNOW, snow * 0.6)));
      Z(roofs, 4).circle(bx - 4, by - 5, 8, fill(mix(hedge[2], SNOW, snow * 0.85)));
    }
  };
  const ROOF_COLS = ["#e9dcc6", "#d6c3a5", "#c9d3dc", "#d8c4dc", "#f0c9a8", "#b9d2cf", "#e3d5b8"];
  // an apartment or office roof with a few things on it
  const busyRoof = (x: number, y: number, w: number, h: number, q: () => number) => {
    const f = roof(x, y, w, h, ROOF_COLS[Math.floor(q() * ROOF_COLS.length)]);
    const k = q();
    if (k < 0.34 && f.w > 160 && f.h > 120) roofGarden(f.x + 20, f.y + 20, f.w * 0.55, f.h - 40, q);
    else if (k < 0.67 && f.w > 140) solar(f.x + 18, f.y + 18, Math.min(f.w - 120, 26 * Math.floor((f.w - 120) / 26)), 18 * Math.max(1, Math.floor((f.h - 50) / 18 / 1.6)));
    else for (let i = 0; i < Math.min(4, Math.floor(f.w / 90)); i++) skylight(f.x + 24 + i * 80, f.y + 22, 50, 30);
    if (f.w > 130 && f.h > 90) hvac(f.x + f.w - 66, f.y + f.h - 54);
    if (q() < 0.5 && f.w > 200 && f.h > 120) { Z(roofs, 5).circle(f.x + f.w - 46, f.y + 40, 20, fill(mix("#9aa3b1", SNOW, snow * 0.7))); Z(roofs, 6).circle(f.x + f.w - 46, f.y + 40, 13, fill(mix("#b4bcc8", SNOW, snow * 0.8))); }
    for (let i = 0; i < 3; i++) lit.rect(f.x + 20 + q() * (f.w - 70), f.y + 20 + q() * (f.h - 60), 26, 18, "", 3);
  };
  // a house with a pitched roof (ridge along its long side)
  const HOUSE = [["#e0805c", "#bf6142"], ["#8a96ad", "#6b7690"], ["#e2bd7e", "#c39a5c"], ["#c97a8a", "#a65f70"]];
  const house = (x: number, y: number, w: number, h: number, k: number, chimney: boolean) => {
    const [a, b] = HOUSE[k % HOUSE.length];
    Z(low, 0).rect(x + 14, y + 20, w, h, fill(shadowC, 0.28), 4);
    Z(roofs, 1);
    if (w >= h) { roofs.rect(x, y, w, h / 2, fill(roofSnow(a)), 3); roofs.rect(x, y + h / 2, w, h / 2, fill(roofSnow(b)), 3); }
    else { roofs.rect(x, y, w / 2, h, fill(roofSnow(a)), 3); roofs.rect(x + w / 2, y, w / 2, h, fill(roofSnow(b)), 3); }
    Z(roofs, 2).line(w >= h ? x + 6 : x + w / 2, w >= h ? y + h / 2 : y + 6, w >= h ? x + w - 6 : x + w / 2, w >= h ? y + h / 2 : y + h - 6, stroke(mix(b, "#3a3f4f", 0.25), 3));
    if (chimney) { Z(roofs, 3).rect(x + w * 0.7, y + h * 0.18, 18, 18, fill(mix("#8a5f4a", SNOW, snow * 0.5)), 2); lit.rect(x + w * 0.25, y + h * 0.3, 16, 12, "", 2); }
  };
  const parked = (x: number, y: number, vertical: boolean, color: string) => {
    const w = vertical ? 34 : 66, h = vertical ? 66 : 34;
    Z(low, 0).rect(x + 4, y + 5, w, h, fill(shadowC, 0.22), 11);
    Z(roofs, 1).rect(x, y, w, h, fill(mix(color, SNOW, snow * 0.5)), 11);
    if (vertical) { Z(roofs, 2).rect(x + 5, y + 12, w - 10, 22, fill("#2d3142"), 6); Z(roofs, 3).circle(x + w / 2, y + 44, 5, fill("#eef0ff")); }
    else { Z(roofs, 2).rect(x + 12, y + 5, 22, h - 10, fill("#2d3142"), 6); Z(roofs, 3).circle(x + 44, y + h / 2, 5, fill("#eef0ff")); }
  };

  // --- blocks -------------------------------------------------------------------------------------
  // a planted footpath through the middle of a block, splitting it into two lots
  const passage = (c: Block) => {
    const v = c.passage === "v", mid = v ? c.x + c.w / 2 : c.y + c.h / 2;
    const path = v ? { x: mid - 34, y: c.y, w: 68, h: c.h } : { x: c.x, y: mid - 34, w: c.w, h: 68 };
    Z(base, 0).rect(path.x, path.y, path.w, path.h, fill(pathC));
    const len = v ? c.h : c.w;
    for (let t = 90, i = 0; t < len - 60; t += 150, i++) {
      const side = i % 2 ? 1 : -1;
      const x = v ? mid + side * 70 : c.x + t, y = v ? c.y + t : mid + side * 70;
      if ((v ? y : x) > (v ? c.y + c.h - 60 : c.x + c.w - 60)) continue;
      tree(x, y, 30 + ((t >> 4) % 3) * 4);
    }
    const lots = v ? [{ x: c.x, y: c.y, w: c.w / 2 - 105, h: c.h }, { x: mid + 105, y: c.y, w: c.w / 2 - 105, h: c.h }]
      : [{ x: c.x, y: c.y, w: c.w, h: c.h / 2 - 105 }, { x: c.x, y: mid + 105, w: c.w, h: c.h / 2 - 105 }];
    return lots;
  };
  const inset = (r: Rect, d: number) => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });

  const drawBlock = (c: Block) => {
    if (!rectInView(c)) return;
    const q = rnd(Math.abs(Math.round(c.x * 3.1 + c.y * 7.7)) % 2147483646 + 1);
    if (c.use === "greenbelt") {
      const n = 2 + Math.floor(q() * 2);
      for (let i = 0; i < n; i++) {
        const cx = c.x + 140 + q() * (c.w - 280), cy = c.y + 140 + q() * (c.h - 280);
        tree(cx, cy, 46 + q() * 22, true);
        if (q() < 0.5) tree(cx + 80 + q() * 30, cy + 30 - q() * 60, 32 + q() * 14, true);
      }
      bushInto(trees, c.x + 100 + q() * (c.w - 200), c.y + 100 + q() * (c.h - 200), 26, L);
      return;
    }
    if (c.use === "plot") return;   // drawn with the plots
    if (c.use === "pocket-park") { pocketPark(c, q); return; }
    const k = c.kind;
    if (k === "cafe") { cafe(c, q); return; }
    if (k === "library") { library(c, q); return; }
    if (k === "datacenter") { datacenter(c, q); return; }
    if (k === "greenroof" || k === "solar") {
      hedgeAround(c, 14, { s: [[c.x + c.w / 2 - 50, c.x + c.w / 2 + 50]] });
      const b = inset(c, 90);
      const f = roof(b.x, b.y, b.w, b.h - 60, k === "greenroof" ? "#c9c2b0" : "#c9d3dc");
      if (k === "greenroof") {
        Z(roofs, 2).rect(f.x + 16, f.y + 16, f.w - 32, f.h - 32, fill(mix(pal.park[0], SNOW, snow * 0.75)), 10);
        for (let i = 0; i < 4; i++) Z(roofs, 3).rect(f.x + 40 + i * ((f.w - 80) / 4), f.y + 40, (f.w - 80) / 4 - 26, f.h - 80, fill(mix(hedge[0], SNOW, snow * 0.6)), 12);
        Z(roofs, 4).rect(f.x + f.w / 2 - 70, f.y + f.h / 2 - 34, 140, 68, fill(paveC), 8);
        for (let i = 0; i < 4; i++) skylight(f.x + f.w / 2 - 60 + i * 32, f.y + f.h / 2 - 22, 24, 44);
      } else {
        const cols = Math.floor((f.w - 60) / 26 / 4), rows = Math.floor((f.h - 40) / 18 / 3);
        for (let i = 0; i < 4; i++) solar(f.x + 24 + i * (cols * 26 + 14), f.y + 22, cols * 26, rows * 18 * 2 + 18);
        hvac(f.x + f.w - 70, f.y + f.h - 50);
      }
      Z(base, 0).rect(c.x + c.w / 2 - 50, b.y + b.h - 60, 100, c.y + c.h - (b.y + b.h - 60), fill(pathC));
      tree(c.x + 60, c.y + c.h - 60, 34); tree(c.x + c.w - 60, c.y + c.h - 60, 34);
      return;
    }
    // apartments and houses: two lots on either side of a planted footpath
    const lots = c.passage ? passage(c) : [c];
    lots.forEach((lot, li) => {
      if (k === "houses") {
        const v = c.passage === "v", n = Math.max(2, Math.floor((v ? lot.h : lot.w) / 230));
        for (let i = 0; i < n; i++) {
          const step = (v ? lot.h - 60 : lot.w - 60) / n;
          const hw = v ? Math.min(240, lot.w - 150) : step - 50, hh = v ? step - 50 : Math.min(200, lot.h - 120);
          const hx = v ? (li ? lot.x + lot.w - hw - 50 : lot.x + 50) : lot.x + 30 + i * step + 25;
          const hy = v ? lot.y + 30 + i * step + 25 : (li ? lot.y + lot.h - hh - 50 : lot.y + 50);
          house(hx, hy, hw, hh, Math.floor(q() * 4), q() < 0.5);
          // garden behind the house, toward the footpath
          const gx = v ? (li ? lot.x + 40 : hx + hw + 50) : hx + hw / 2, gy = v ? hy + hh / 2 : (li ? lot.y + 40 : hy + hh + 50);
          if (q() < 0.7) tree(gx, gy, 26 + q() * 8);
          else bushInto(trees, gx, gy, 20, L);
        }
        hedgeAround(lot, 10);
      } else {
        const b = inset(lot, 60);
        const bh = Math.max(140, b.h * 0.66);
        busyRoof(b.x, b.y, b.w, bh, q);
        // courtyard garden with a bench and a tree, a bike rack and a parked car
        if (b.h - bh > 120) {
          Z(base, 1).rect(b.x + 20, b.y + bh + 50, Math.min(220, b.w - 40), 70, fill(paveC), 10);
          bench(b.x + 40, b.y + bh + 74);
          tree(b.x + b.w - 70, b.y + bh + (b.h - bh) / 2 + 20, 32);
          if (q() < 0.6) parked(b.x + Math.min(220, b.w - 40) + 40, b.y + bh + 52, false, CAR_COLS[Math.floor(q() * CAR_COLS.length)]);
        }
        hedgeAround(lot, 14, { s: [[lot.x + 40, lot.x + 140]] });
      }
    });
  };

  const pocketPark = (c: Block, q: () => number) => {
    const b = inset(c, 40);
    hedgeAround(c, 12, { n: [[c.x + c.w / 2 - 50, c.x + c.w / 2 + 50]], s: [[c.x + c.w / 2 - 50, c.x + c.w / 2 + 50]], w: [[c.y + c.h / 2 - 50, c.y + c.h / 2 + 50]], e: [[c.y + c.h / 2 - 50, c.y + c.h / 2 + 50]] });
    Z(base, 0).add(`fill="none" stroke="${pathC}" stroke-width="46" stroke-linecap="round"`, `M${n1(c.x + c.w / 2)} ${n1(c.y)}V${n1(c.y + c.h)}M${n1(c.x)} ${n1(c.y + c.h / 2)}H${n1(c.x + c.w)}`, c.x + c.w / 2, c.y + c.h / 2);
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    Z(base, 1).circle(cx, cy, 110, fill(paveC));
    Z(base, 2).circle(cx, cy, 62, fill(mix(L.season === "autumn" ? "#6f7d45" : "#5b8f4e", SNOW, snow * 0.8)));
    // flowers round the plaza's tree (covered for the winter)
    const fl = pal.flowers;
    if (!fl.covered && fl.colors.length) for (let i = 0; i < 14 * fl.density; i++) {
      const a = (i / (14 * fl.density)) * Math.PI * 2;
      Z(base, 3).circle(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50, 5, fill(fl.colors[i % fl.colors.length]));
    }
    tree(cx, cy, 52);
    bench(cx - 32, cy - 150); bench(cx - 32, cy + 128); bench(cx - 150, cy - 32, true); bench(cx + 128, cy - 32, true);
    // a playground in one quarter, trees in the others
    const qx = q() < 0.5 ? b.x + 60 : cx + 80, qy = q() < 0.5 ? b.y + 50 : cy + 70;
    Z(base, 1).rect(qx, qy, 220, 150, fill(mix("#e8d3a0", SNOW, snow * 0.8)), 30);
    Z(low, 1).circle(qx + 60, qy + 60, 26, fill(mix("#ff9f5a", SNOW, snow * 0.6)));
    Z(low, 1).circle(qx + 150, qy + 90, 20, fill(mix("#4fb6ff", SNOW, snow * 0.6)));
    Z(low, 1).rect(qx + 120, qy + 26, 70, 20, fill(mix("#ffd27a", SNOW, snow * 0.6)), 10);
    const spots = [[b.x + 80, b.y + 80], [b.x + b.w - 80, b.y + 80], [b.x + 80, b.y + b.h - 80], [b.x + b.w - 80, b.y + b.h - 80], [cx - 220, cy + 160], [cx + 230, cy - 170]];
    for (const [x, y] of spots) if (!(x > qx - 40 && x < qx + 260 && y > qy - 40 && y < qy + 190)) tree(x, y, 36 + q() * 14);
  };

  const cafe = (c: Block, q: () => number) => {
    // the cafe faces the footpath that comes out of the park; its terrace looks onto the street
    const ey = Math.max(c.y + 170, Math.min(c.y + c.h - 170, o.entranceY));
    const bx = c.x + 230, bw = Math.min(380, c.w * 0.4), bh = 250, by = ey - bh / 2;
    Z(base, 0).rect(c.x, ey - 32, 230, 64, fill(pathC));
    Z(base, 1).rect(c.x + 20, by - 30, 200, bh + 60, `fill="url(#lc-pave)"`, 14);
    const f = roof(bx, by, bw, bh, "#f0c9a8");
    // the coffee cup on the roof
    const ux = f.x + f.w / 2 + 20, uy = f.y + f.h / 2;
    Z(roofs, 2).circle(ux + 4, uy + 6, 50, fill(shadowC, 0.12));
    Z(roofs, 3).add(stroke(roofSnow("#fffaf3"), 12), `M${n1(ux + 40)} ${n1(uy - 18)}a22 22 0 0 1 0 36`, ux, uy);
    Z(roofs, 3).circle(ux, uy, 48, fill(roofSnow("#fffaf3")));
    Z(roofs, 4).circle(ux, uy, 36, fill(snow > 0.5 ? "#c9b39a" : "#8a5f33"));
    Z(roofs, 5).ellipse(ux - 10, uy - 8, 12, 7, fill("#c9935a", 0.8), -30);
    hvac(f.x + 14, f.y + f.h - 50);
    // awning along the front (one dashed stroke makes the stripes)
    Z(roofs, 2).line(bx - 4, by + 12, bx - 4, by + bh - 12, `fill="none" stroke="#fffaf3" stroke-width="40"`);
    Z(roofs, 3).line(bx - 4, by + 12, bx - 4, by + bh - 12, `fill="none" stroke="#e2626b" stroke-width="40" stroke-dasharray="16 16"`);
    // tables under parasols on the terrace
    const tables: [number, number, string][] = [[c.x + 75, by + 20, "#ffd27a"], [c.x + 165, by + 70, "#4fb6ff"], [c.x + 75, by + 130, "#e2626b"], [c.x + 165, by + 190, "#3fbf86"], [c.x + 75, by + 240, "#ffd27a"]];
    for (const [x, y, col] of tables) {
      if (snow > 0.4) { Z(low, 1).circle(x, y, 18, fill(mix("#9aa3b1", SNOW, snow * 0.6))); continue; }   // parasols are put away in the snow
      Z(low, 0).circle(x + 6, y + 8, 30, fill(shadowC, 0.2));
      Z(roofs, 1).circle(x, y, 30, fill("#fffaf3"));
      Z(roofs, 2).circle(x, y, 15, `fill="none" stroke="${col}" stroke-width="30" stroke-dasharray="11.8 11.8"`);
      Z(roofs, 3).circle(x, y, 4, fill("#3a3f4f"));
    }
    // string lights over the terrace, lit at night
    let d = "";
    for (let i = 0; i < 4; i++) d += `M${n1(c.x + 30)} ${n1(by - 14 + i * 85)}Q${n1(c.x + 120)} ${n1(by + 20 + i * 85)} ${n1(bx - 30)} ${n1(by - 14 + i * 85)}`;
    liveExtra += `<path d="${d}" fill="none" stroke="#3a3f4f" stroke-width="1.5" opacity="0.5"/><path d="${d}" fill="none" stroke="#ffe08a" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 20" style="opacity:calc(0.25 + var(--lamp, 0) * 0.75)"/>`;
    for (let i = 0; i < 3; i++) lit.rect(f.x + 30 + i * 70, f.y + 24, 40, 24, "", 4);
    // the rest of the block: an apartment house and a garden
    const rest = { x: bx + bw + 90, y: c.y + 70, w: c.x + c.w - (bx + bw + 90) - 70, h: c.h - 140 };
    if (rest.w > 160) busyRoof(rest.x, rest.y, rest.w, rest.h * 0.62, q);
    tree(bx + bw / 2, c.y + 70, 34); tree(bx + bw / 2, c.y + c.h - 70, 38);
    hedgeAround(c, 14, { w: [[by - 40, by + bh + 40]] });
  };

  const library = (c: Block, q: () => number) => {
    // a sandstone building with two wings, a domed reading room facing the campus, and a reading garden
    const b = inset(c, 100), wingH = b.h - 140;
    Z(base, 1).rect(c.x + c.w / 2 - 230, c.y + c.h - 190, 460, 190, `fill="url(#lc-pave)"`);
    const f = roof(b.x, b.y, b.w, wingH, "#e3cfa6");
    // skylight bands over the stacks
    for (const side of [0, 1]) {
      const x0 = side ? f.x + f.w / 2 + 150 : f.x + 30, x1 = side ? f.x + f.w - 30 : f.x + f.w / 2 - 150;
      if (x1 - x0 < 60) continue;
      Z(roofs, 2).add(`fill="none" stroke="${mix("#8fc9e2", SNOW, snow * 0.6)}" stroke-width="${n1(f.h - 80)}" stroke-dasharray="18 26"`, `M${n1(x0)} ${n1(f.y + f.h / 2)}H${n1(x1)}`, (x0 + x1) / 2, f.y);
      for (let x = x0; x < x1; x += 88) lit.rect(x, f.y + 40, 18, f.h - 80, "", 2);
    }
    const cx = c.x + c.w / 2, cy = b.y + wingH - 10;
    Z(roofs, 3).circle(cx + 16, cy + 22, 130, fill(shadowC, 0.3));
    Z(roofs, 4).circle(cx, cy, 130, fill(mix(mix("#c9b48a", "#3a3f4f", 0.15), SNOW, snow * 0.6)));
    Z(roofs, 5).circle(cx, cy, 116, fill(roofSnow("#9cc3b8")));
    Z(roofs, 6).circle(cx - 26, cy - 28, 70, fill(roofSnow("#b5d6cc")));
    let ribs = "";
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ribs += `M${n1(cx + Math.cos(a) * 30)} ${n1(cy + Math.sin(a) * 30)}L${n1(cx + Math.cos(a) * 114)} ${n1(cy + Math.sin(a) * 114)}`; }
    Z(roofs, 7).add(stroke(mix("#7fa89c", SNOW, snow * 0.6), 4), ribs, cx, cy);
    Z(roofs, 8).circle(cx, cy, 28, fill(mix("#8fc9e2", SNOW, snow * 0.5)));
    lit.circle(cx, cy, 30, "");
    // the columned porch in front
    for (let i = 0; i < 8; i++) { const x = cx - 175 + i * 50; if (Math.abs(x - cx) < 120) continue; Z(low, 1).circle(x + 3, c.y + c.h - 172, 11, fill(shadowC, 0.25)); Z(roofs, 1).circle(x, c.y + c.h - 175, 10, fill("#fffaf3")); }
    bench(c.x + 90, c.y + c.h - 120); bench(c.x + c.w - 160, c.y + c.h - 120);
    tree(c.x + 80, c.y + c.h - 60, 40); tree(c.x + c.w - 80, c.y + c.h - 60, 40); tree(c.x + 60, c.y + 60, 34); tree(c.x + c.w - 60, c.y + 60, 34);
    hedgeAround(c, 14, { s: [[c.x + c.w / 2 - 240, c.x + c.w / 2 + 240]] });
    void q;
  };

  const datacenter = (c: Block, q: () => number) => {
    // a long low hall with rows of chillers on the roof, a fenced yard and a small car park
    const b = inset(c, 80);
    const hh = Math.max(240, b.h * 0.6);
    const f = roof(b.x, b.y, b.w, hh, "#c9d3dc");
    const cols = Math.max(2, Math.floor((f.w - 40) / 70)), rows = Math.max(1, Math.floor((f.h - 40) / 70));
    const leds: Shapes[] = [new Shapes(), new Shapes(), new Shapes()];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = f.x + 20 + 35 + i * ((f.w - 40) / cols), y = f.y + 20 + 35 + j * ((f.h - 40) / rows);
      Z(roofs, 2).circle(x + 3, y + 4, 25, fill(shadowC, 0.16));
      Z(roofs, 3).circle(x, y, 25, fill(mix("#9aa3b1", SNOW, snow * 0.5)));
      Z(roofs, 4).circle(x, y, 9, `fill="none" stroke="#6d7586" stroke-width="18" stroke-dasharray="7.07 7.07"`);
      Z(roofs, 5).circle(x, y, 4, fill("#4a5063"));
      leds[(i + j * 2) % 3].circle(x + 19, y - 19, 3.2, "");
    }
    const ledCols = ["#4ff0a0", "#7cf2ff", "#4ff0a0"];
    const qb = seedAt(c.x, c.y);
    liveExtra += leds.map((s, i) => `<g class="amb-blink" style="${timing(qb, 2.4 + i * 0.7, 0.3)}"><path ${fill(ledCols[i])} d="${String(s).match(/ d="([^"]*)"/)?.[1] ?? ""}"/></g>`).join("");
    // the yard: generators behind a fence
    const yy = f.y + f.h + 40, yh = c.y + c.h - 60 - yy;
    if (yh > 90) {
      const yw = Math.min(360, b.w * 0.45);
      Z(base, 1).rect(b.x, yy, yw, yh, fill(mix("#b9b3a5", SNOW, snow * 0.7)), 6);
      for (let i = 0; i < Math.floor((yw - 30) / 90); i++) { Z(low, 1).rect(b.x + 24 + i * 90, yy + 24, 66, Math.min(44, yh - 40), fill(mix("#6d8a76", SNOW, snow * 0.5)), 5); }
      Z(low, 2).rect(b.x, yy, yw, yh, `fill="none" stroke="#8a94a6" stroke-width="4" stroke-dasharray="20 6"`, 6);
      // car park
      const px = b.x + yw + 50, pw = b.x + b.w - px;
      if (pw > 160) {
        Z(base, 1).rect(px, yy, pw, yh, fill(asphalt), 6);
        const n = Math.floor((pw - 20) / 54);
        for (let i = 0; i <= n; i++) mark.line(px + 10 + i * 54, yy + 8, px + 10 + i * 54, yy + Math.min(84, yh - 8), `fill="none" stroke="${marking}" stroke-width="3" opacity="${n2(0.8 - snow * 0.5)}"`);
        for (let i = 0; i < n; i++) if (q() < 0.6) parked(px + 20 + i * 54, yy + 12, true, CAR_COLS[Math.floor(q() * CAR_COLS.length)]);
      }
    }
    hedgeAround(c, 14, { s: [[b.x + b.w * 0.5, b.x + b.w * 0.5 + 120]] });
    tree(c.x + 50, c.y + 50, 30); tree(c.x + c.w - 50, c.y + 50, 30);
  };

  for (const c of C.blocks) if (c.use !== "campus") drawBlock(c);

  // --- empty plots ----------------------------------------------------------------------------
  for (const p of C.plots) {
    if (!rectInView(p)) continue;
    const q = seedAt(p.x, p.y);
    if (p.kind === "fenced") {
      Z(base, 1).rect(p.x, p.y, p.w, p.h, `fill="url(#lc-dirt)"`, 8);
      // a few heaps, a site cabin and pallets, behind a fence with a gate
      Z(base, 2).ellipse(p.x + p.w * 0.3, p.y + p.h * 0.4, 70, 40, fill(mix("#a88b60", SNOW, snow * 0.8)));
      Z(base, 3).ellipse(p.x + p.w * 0.3 - 10, p.y + p.h * 0.4 - 10, 40, 20, fill(mix("#b99c70", SNOW, snow * 0.85)));
      Z(low, 0).rect(p.x + p.w - 190, p.y + 40, 140, 64, fill(shadowC, 0.25), 4);
      Z(roofs, 0).rect(p.x + p.w - 196, p.y + 32, 140, 64, fill(roofSnow("#ffd27a")), 4);
      Z(roofs, 1).rect(p.x + p.w - 190, p.y + 38, 128, 52, fill(roofSnow("#f0bd5a")), 3);
      for (let i = 0; i < 3; i++) Z(roofs, 1).rect(p.x + 40 + i * 54, p.y + p.h - 90, 44, 44, fill(mix("#c9935a", SNOW, snow * 0.7)), 3);
      const gate = p.x + p.w / 2;
      Z(low, 2).add(`fill="none" stroke="#7d8696" stroke-width="5" stroke-dasharray="24 6"`, `M${n1(gate - 60)} ${n1(p.y + p.h)}H${n1(p.x)}V${n1(p.y)}H${n1(p.x + p.w)}V${n1(p.y + p.h)}H${n1(gate + 60)}`, p.x + p.w / 2, p.y + p.h / 2);
      void q;
    } else {
      Z(base, 1).rect(p.x, p.y, p.w, p.h, `fill="url(#lc-mown)"`, 8);
      // corner posts with a rope between them
      Z(low, 2).add(`fill="none" stroke="#c9b48a" stroke-width="3" opacity="0.9"`, `M${n1(p.x)} ${n1(p.y)}H${n1(p.x + p.w)}V${n1(p.y + p.h)}H${n1(p.x)}Z`, p.x + p.w / 2, p.y + p.h / 2);
      for (const [x, y] of [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]]) Z(top, 0).circle(x, y, 7, fill("#8a5f33"));
    }
    // the sign faces the viewer, like the walls of the rooms (text is drawn on the live layer, so it uses the app's font)
    const sx = p.x + 40, sy = p.y + p.h - 120;
    const text = p.kind === "for-sale" ? "For sale" : "Building site";
    const tw = text.length * 13 + 36;
    liveExtra += `<g class="city-sign" data-plot="${p.id}" transform="translate(${n1(sx)} ${n1(sy)})">
      <rect x="10" y="44" width="6" height="36" fill="#3a3f4f"/><rect x="${tw - 16}" y="44" width="6" height="36" fill="#3a3f4f"/>
      <rect x="4" y="76" width="${tw - 8}" height="10" rx="5" fill="#1f2a1a" opacity="0.18"/>
      <rect width="${tw}" height="52" rx="7" fill="#fffaf3"/>${snow > 0.3 ? `<rect width="${tw}" height="9" rx="4.5" fill="${SNOW}"/>` : ""}
      <text x="${tw / 2}" y="34" text-anchor="middle" font-family="Lexend Variable, Lexend, system-ui, sans-serif" font-size="22" font-weight="600" fill="#2d3142">${text}</text></g>`;
  }

  // --- the campus: hedges, the green walk past the shop, footpaths and a round plaza ------------
  const b = o.building, ey = o.entranceY, p = o.park, shop = o.shop;
  const gw = C.greenway;
  const gaps: Gaps = { n: [], s: [], e: [], w: [] };
  for (const pa of C.paths) {
    if (pa.y <= camp.y + 1) gaps.n!.push([pa.x - 10, pa.x + pa.w + 10]);
    if (pa.y + pa.h >= camp.y + camp.h - 1) gaps.s!.push([pa.x - 10, pa.x + pa.w + 10]);
    if (pa.x + pa.w >= camp.x + camp.w - 1) gaps.e!.push([pa.y - 10, pa.y + pa.h + 10]);
  }
  hedgeAround(camp, 16, gaps, 20);
  for (const pa of C.paths) Z(base, 0).rect(pa.x, pa.y, pa.w, pa.h, fill(pathC));
  // the walk: paving, a planted edge on both sides, benches; the shop's forecourt opens off it
  Z(base, 1).rect(gw.x, gw.y, gw.w, gw.h, `fill="url(#lc-pave)"`, 30);
  if (shop) Z(base, 1).rect(shop.x - 30, gw.y + gw.h - 30, shop.w + 60, shop.y - (gw.y + gw.h) + 50, `fill="url(#lc-pave)"`, 14);
  const walkTrees: [number, number][] = [];
  for (let x = gw.x + 150; x < gw.x + gw.w - 90; x += 165) {
    walkTrees.push([x, gw.y - 6]);
    if (!shop || x < shop.x - 60 || x > shop.x + shop.w + 60) walkTrees.push([x + 80, gw.y + gw.h + 6]);
    else if (x + 80 < shop.x + shop.w - 60) bench(x + 48, gw.y + gw.h - 4);
  }
  for (const [x, y] of walkTrees) planter(x, y, 22);
  for (let x = gw.x + 210; x < gw.x + gw.w - 140; x += 330) bench(x, gw.y - 40);
  // scooters parked by the entrance
  for (let i = 0; i < 4; i++) {
    const x = gw.x + 40 + i * 22, y = gw.y - 70;
    Z(low, 0).rect(x + 2, y + 3, 9, 34, fill(shadowC, 0.2), 4);
    Z(roofs, 1).rect(x, y, 9, 34, fill(["#4fb6ff", "#ff9f5a", "#3fbf86", "#ffd27a"][i]), 4);
    Z(roofs, 2).rect(x - 4, y + 2, 17, 4, fill("#3a3f4f"), 2);
  }
  // the round plaza on the footpath north of the walk: a big tree inside a ring bench
  const north = C.paths[0];
  const plaza = north && north.h > 520 ? { x: north.x + north.w / 2, y: gw.y - Math.min(330, north.h / 2) } : null;
  if (plaza) {
    Z(base, 2).circle(plaza.x, plaza.y, 130, `fill="url(#lc-pave)"`);
    Z(low, 0).circle(plaza.x + 4, plaza.y + 6, 72, `fill="none" stroke="${shadowC}" stroke-width="16" opacity="0.2"`);
    Z(low, 1).circle(plaza.x, plaza.y, 72, `fill="none" stroke="${snow > 0.3 ? mix("#b9854c", SNOW, snow * 0.7) : "#b9854c"}" stroke-width="16"`);
    Z(base, 3).circle(plaza.x, plaza.y, 60, fill(mix(L.season === "autumn" ? "#6f7d45" : "#5b8f4e", SNOW, snow * 0.8)));
  }
  // a few trees on the campus lawns
  const lawnTrees: [number, number, number][] = [];
  const ox1 = b.x + b.w + 120, ox2 = p.x - 120;
  for (const [x, y, r] of [[ox1, camp.y + 120, 44], [ox2, camp.y + 160, 40], [ox1 + 40, camp.y + camp.h - 130, 46], [p.x + p.w + 70, p.y + p.h - 40, 40],
    [p.x + 150, camp.y + camp.h - 110, 42], [p.x + p.w - 200, camp.y + camp.h - 120, 38], [b.x - 150, camp.y + 160, 42], [b.x - 150, camp.y + camp.h - 160, 44], [b.x + b.w * 0.5, camp.y + camp.h - 120, 40], [b.x + b.w * 0.25, camp.y + 110, 38], [b.x + b.w * 0.75, camp.y + 110, 40]] as [number, number, number][]) {
    if (shop && x > shop.x - 60 && x < shop.x + shop.w + 60 && y > shop.y - 60 && y < shop.y + shop.h + 60) continue;
    if (C.plots.some((pl) => x > pl.x - 40 && x < pl.x + pl.w + 40 && y > pl.y - 40 && y < pl.y + pl.h + 40)) continue;
    if (x > p.x - 40 && x < p.x + p.w + 40 && y > p.y - 40 && y < p.y + p.h + 40) continue;
    if (x > b.x - 40 && x < b.x + b.w + 40 && y > b.y - 40 && y < b.y + b.h + 40) continue;
    lawnTrees.push([x, y, r]);
  }
  for (const [x, y, r] of lawnTrees) tree(x, y, r);
  // a hedge round the shop's lot (not along its front)
  if (shop) {
    hedgeRect(shop.x - 46, shop.y + 40, 18, shop.h - 20);
    hedgeRect(shop.x + shop.w + 28, shop.y + 40, 18, shop.h - 20);
    hedgeRect(shop.x - 46, shop.y + shop.h + 40, shop.w + 92, 18);
  }

  // --- the green walk's trees and the plaza tree sway (live) ----------------------------------
  const sway = [new Grove(), new Grove(), new Grove()];
  walkTrees.forEach(([x, y], i) => treeInto(sway[i % 3], x - V.ox, y - V.oy, 30 + (i % 3) * 3, i % 3, L, 900 + i));
  if (plaza) treeInto(sway[1], plaza.x - V.ox, plaza.y - V.oy, 56, 0, L, 77);
  const qs2 = rnd(1234);
  const swayLive = sway.map((G) => `${G.under}${G.still()}<g class="amb-tree" style="${timing(qs2, 7, 0.35, `;--a:${n2(1.4 + qs2() * 1)}px`)}">${G.moving()}</g>`).join("");

  // --- robot cars and scooters (live) --------------------------------------------------------
  const shift = (d: string) => { let i = 0; return d.replace(/-?\d+(\.\d+)?/g, (v) => String(Math.round(Number(v) - (i++ % 2 ? V.oy : V.ox)))); };
  const qc = rnd(99);
  let cars = "";
  const loopById = new Map(C.loops.map((l) => [l.id, l]));
  const fleet: [string, number, "car" | "scooter"][] = [["ring", 0.05, "car"], ["ring", 0.38, "car"], ["ring", 0.7, "scooter"], ["ring-out", 0.2, "car"], ["ring-out", 0.62, "car"],
    ["south", 0.3, "car"], ["east", 0.6, "scooter"], ["west", 0.1, "car"], ["north", 0.5, "car"]];
  fleet.forEach(([id, at, kind], i) => {
    const lp = loopById.get(id);
    if (!lp) return;
    const speed = kind === "car" ? 95 + qc() * 40 : 70 + qc() * 20;
    const dur = lp.len / speed;
    cars += `<g class="amb-path city-car" style="offset-path:path('${shift(lp.d)}');offset-distance:${n2(at * 100)}%;animation-duration:${n2(dur)}s;animation-delay:${n2(-at * dur)}s">${kind === "car" ? robotCar(CAR_COLS[i % CAR_COLS.length], snow) : scooter(i)}</g>`;
  });

  // one path per area and kind of light; their opacity follows --lamp, so nothing redraws until the hour changes
  const light = (sh: Shapes, a: string) => pathsOf(sh).map((d) => `<path ${a} d="${d}"/>`).join("");
  const lightPaths = light(glow, `fill="#ffd98a" style="opacity:calc(var(--lamp, 0) * 0.42)"`) +
    light(core, `fill="#fff3c9" style="opacity:calc(var(--lamp, 0) * 0.85)"`) +
    light(lit, `fill="#ffd58a" style="opacity:calc(var(--lamp, 0) * 0.8 - 0.1)"`);
  const live = `<g transform="translate(${-V.ox} ${-V.oy})">${lightPaths}${liveExtra}</g>${swayLive}${cars}`;

  const ground = `<g transform="translate(${-V.ox} ${-V.oy})">${groundSvg}${base}${road}${mark}</g>`;
  const still = `<g transform="translate(${-V.ox} ${-V.oy})">${low}${roofs}${trees.all()}${top}</g>`;
  const shapes = base.count + road.count + mark.count + low.count + roofs.count + trees.count + top.count + 30;
  const stats = { base: base.count, road: road.count, mark: mark.count, low: low.count, roofs: roofs.count, trees: trees.count, top: top.count, treeN, glow: glow.count, lit: lit.count };
  return { defs, ground, still, live, shapes, stats };
}

// all subpaths of a Shapes, whatever their attributes (used for the light layers)
function pathsOf(s: Shapes) { return [...String(s).matchAll(/ d="([^"]*)"/g)].map((m) => m[1]); }

// A robot car from above, facing +x: a rounded shell, a dark visor for a windscreen with two
// glowing eyes, a sensor dome on the roof. Headlights reach ahead of it at night.
function robotCar(color: string, snow: number) {
  const trim = color === "#f6ecdc" ? "#d97757" : color === "#f2f4fa" ? "#3a3f5a" : "#2d3142";
  const eye = color === "#f6ecdc" ? "#ffa477" : "#7cf2ff";
  return `<path d="M30 -10L132 -46Q142 0 132 46L30 10Z" fill="#fff3c9" style="opacity:calc(var(--lamp, 0) * 0.32)"/>
    <rect x="-30" y="-14" width="66" height="34" rx="12" fill="#1f2a1a" opacity="0.22"/>
    <rect x="-33" y="-17" width="66" height="34" rx="12" fill="${color}"/>
    <path d="M4 -13h12a7 7 0 0 1 7 7v12a7 7 0 0 1 -7 7h-12a3 3 0 0 1 -3 -3v-20a3 3 0 0 1 3 -3zM-26 -11h12a3 3 0 0 1 3 3v16a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-16a3 3 0 0 1 3 -3z" fill="${trim}"/>
    <path d="M14 -6a2.4 2.4 0 1 0 0.01 0M14 6a2.4 2.4 0 1 0 0.01 0" fill="none" stroke="${eye}" stroke-width="4.8" stroke-linecap="round"/>
    <circle cx="-6" cy="0" r="6" fill="${snow > 0.5 ? "#ffffff" : "#e3e7f2"}"/><circle cx="-6" cy="0" r="2.4" fill="${eye}"/>
    <path d="M31 -12a2.6 2.6 0 1 0 0.01 0M31 12a2.6 2.6 0 1 0 0.01 0" fill="none" stroke="#fff8e0" stroke-width="5.4" stroke-linecap="round"/>
    <path d="M-32 -12h3v5h-3zM-32 7h3v5h-3z" fill="#ff5a6b" style="opacity:calc(0.45 + var(--lamp, 0) * 0.55)"/>`;
}

// A delivery robot on an e-scooter, from above, facing +x.
function scooter(i: number) {
  const col = ["#4fb6ff", "#ff9f5a", "#3fbf86"][i % 3];
  return `<path d="M16 -4L70 -20Q76 0 70 20L16 4Z" fill="#fff3c9" style="opacity:calc(var(--lamp, 0) * 0.28)"/>
    <rect x="-16" y="-3" width="34" height="10" rx="5" fill="#1f2a1a" opacity="0.2"/>
    <rect x="-18" y="-5" width="34" height="10" rx="5" fill="${col}"/>
    <path d="M12 -10V10" stroke="#3a3f4f" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="-2" cy="0" r="9" fill="#f2f4fa"/><rect x="1" y="-5" width="6" height="10" rx="3" fill="#10142c"/>
    <path d="M5 -2.4a1.2 1.2 0 1 0 0.01 0M5 2.4a1.2 1.2 0 1 0 0.01 0" fill="none" stroke="#7cf2ff" stroke-width="2.4" stroke-linecap="round"/>`;
}
