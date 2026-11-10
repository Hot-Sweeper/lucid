// The office's grounds, seen from above: a lawn round the building inside a trimmed hedge, a
// planted walk from the entrance past the shop to a small park with a pond, benches and lamps,
// a round plaza, and a belt of trees and meadow that fades softly into the backdrop.
// The look follows the season (leaf colours, blossoms, bare trees, flower beds) and how much
// snow lies. The layout never changes with the season: the park robots walk to the same
// benches, pond and picnic spots all year.

import { seasonPalette, type Season } from "../weather/season";
import { Grove, Shapes, SNOW, bushInto, fill, mix, moonlit, n1, n2, themeArt, themedArt, rnd, seedAt, timing, treeInto, type Look } from "./outdoor-art";
import { groundsLayout, FADE, MEADOW, PARK_K, PARK_BASE_W, PARK_BASE_H, type Grounds, type Rect } from "./grounds";
import { puddleSvg, snowman, sprinkler, weatherPal, type GroundWx, type Puddle } from "../weather/ground";
import type { BuildingFootprint } from "./building-footprint";
import "./ambient.css";
import "../weather/weather.css";

export { groundsLayout, type Grounds } from "./grounds";

export const PARK_W = PARK_BASE_W * PARK_K, PARK_H = PARK_BASE_H * PARK_K;
/** Lamps, at the same scale as the robots. */
const LAMP_K = 1.7;

// One of the park's big trees, with its own sway: the crown top leans, bare branches twist round the trunk.
// `still` (fallen leaves, shadow, lower crown) goes into the still image, only `live` sways.
function tree(x: number, y: number, r: number, shade: number, L: Look, seed = shade + 1) {
  const G = new Grove(), bare = treeInto(G, x, y, r, shade, L, seed), q = seedAt(x, y);
  const sway = bare ? `class="amb-bare" style="${timing(q, 8, 0.3, `;transform-origin:${n2(x)}px ${n2(y)}px`)}"`
    : `class="amb-tree" style="${timing(q, 7, 0.3, `;--a:${n2(r * (0.035 + q() * 0.025))}px`)}"`;
  return { still: `${G.under}${G.still()}`, live: `<g ${sway}>${G.moving()}</g>` };
}

// A park bush that rustles on its own (its shadow stays in the still image).
function bush(x: number, y: number, r: number, L: Look) {
  const G = new Grove();
  bushInto(G, x, y, r, L);
  return { still: `${G.shadow}`, live: `<g class="amb-bush" style="${timing(seedAt(x, y), 3.6, 0.35)}">${G.low}${G.top}</g>` };
}

// A flower bed: the bed itself stays, the flowers on it nod (bed and blooms are drawn apart).
function flowers(x: number, y: number, w: number, h: number, seed: number, L: Look): { bed: string; blooms: string } {
  const r = rnd(seed);
  const f = L.pal.flowers;
  const rim = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#7a5a3a"/>`;
  if (f.covered) {
    // put to bed for the winter: mulch and straw, under snow when it lies
    let straw = "";
    for (let i = 0; i < w / 9; i++) {
      const sx = x + 8 + r() * (w - 16), sy = y + 8 + r() * (h - 16);
      straw += `<path d="M${sx} ${sy} l${4 + r() * 6} ${r() * 4 - 2}"/>`;
    }
    return { blooms: "", bed: `${rim}<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="${(h - 6) / 2}" fill="#8a6a48"/>
      <g stroke="#c9a86a" stroke-width="2" stroke-linecap="round" opacity="0.8">${straw}</g>
      ${L.snow > 0 ? `<rect x="${x + 2}" y="${y + 1}" width="${w - 4}" height="${h - 5}" rx="${(h - 5) / 2}" fill="${SNOW}" opacity="${Math.min(1, L.snow * 1.2)}"/>` : ""}` };
  }
  const bed = L.season === "autumn" ? "#6f7d45" : "#5b8f4e";
  const s = `${rim}<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="${(h - 6) / 2}" fill="${mix(bed, SNOW, L.snow * 0.8)}"/>`;
  const fl: [number, number, number, string][] = [];
  // the same random walk as always, so summer looks exactly as before; sparser seasons skip some
  for (let i = 0; i < (w * h) / 220; i++) {
    const cx = x + 8 + r() * (w - 16), cy = y + 7 + r() * (h - 14), rr = 2.4 + r() * 1.6, c = r();
    if (((i * 0.618) % 1) >= f.density) continue;
    fl.push([cx, cy, rr, f.colors[Math.floor(c * f.colors.length)]]);
  }
  if (f.density > 1) {
    const q = rnd(seed + 99);
    for (let i = 0; i < ((w * h) / 220) * (f.density - 1); i++) fl.push([x + 8 + q() * (w - 16), y + 7 + q() * (h - 14), 2.4 + q() * 1.6, f.colors[Math.floor(q() * f.colors.length)]]);
  }
  // the bed's flowers nod together, drawn as one path per colour
  const qt = rnd(seed * 31 + 5), n = fl.length;
  const group = (part: typeof fl) => { const sh = new Shapes(); for (const [cx, cy, rr, c] of part) sh.circle(cx, cy, rr, fill(c)); return String(sh); };
  return { bed: s, blooms: [0].map((k) => `<g class="amb-fl" style="${timing(qt, 2.8, 0.3)}">${group(fl.slice(k * n, k * n + n))}</g>`).join("") };
}

function bench(x: number, y: number, L: Look) {
  const snow = L.snow > 0.2 ? `<rect x="${x + 2}" y="${y + 1}" width="66" height="7" rx="3" fill="${SNOW}" opacity="${L.snow}"/><rect x="${x + 2}" y="${y + 14}" width="66" height="7" rx="3" fill="${SNOW}" opacity="${L.snow}"/>` : "";
  return `<g transform="translate(${x} ${y}) scale(1.5) translate(${-x} ${-y})"><rect x="${x - 2}" y="${y + 20}" width="74" height="8" rx="4" fill="#2b1d10" opacity="0.2"/>
    <rect x="${x}" y="${y}" width="70" height="10" rx="3" fill="#a4723f"/><rect x="${x}" y="${y + 13}" width="70" height="10" rx="3" fill="#b9854c"/>${snow}
    <rect x="${x + 6}" y="${y - 2}" width="5" height="27" rx="2" fill="#3a3f4f"/><rect x="${x + 59}" y="${y - 2}" width="5" height="27" rx="2" fill="#3a3f4f"/></g>`;
}
function picnic(x: number, y: number, L: Look) {
  let checks = "";
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) checks += `<rect x="${x + i * 30}" y="${y + j * 30}" width="30" height="30" fill="#ffffff" opacity="0.75"/>`;
  const dust = L.snow > 0.2 ? `<rect x="${x}" y="${y}" width="120" height="90" rx="6" fill="${SNOW}" opacity="${L.snow * 0.45}"/>` : "";
  return `<g transform="rotate(-8 ${x + 60} ${y + 45})"><rect x="${x + 6}" y="${y + 8}" width="120" height="90" rx="6" fill="${L.pal.shadow}" opacity="0.18"/>
    <rect x="${x}" y="${y}" width="120" height="90" rx="6" fill="#e2626b"/>${checks}${dust}
    <rect x="${x + 72}" y="${y + 18}" width="34" height="24" rx="5" fill="#b9854c"/><rect x="${x + 76}" y="${y + 14}" width="26" height="6" rx="3" fill="#8a5f33"/>
    <circle cx="${x + 30}" cy="${y + 62}" r="9" fill="#ffd27a"/><circle cx="${x + 52}" cy="${y + 66}" r="7" fill="#ff9f5a"/></g>`;
}
// A lamp seen from above: the post's head stays in the still image; the light it gives at
// night (glow and bulb) is live, all lamps together in two paths whose opacity follows --lamp.
function lampHead(x: number, y: number) {
  const k = LAMP_K;
  return `<circle cx="${n1(x + 3 * k)}" cy="${n1(y + 4 * k)}" r="${n1(9 * k)}" fill="#1f2a1a" opacity="0.25"/><circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(8 * k)}" fill="#3a3f4f"/>`;
}
function lampLights(spots: [number, number][]) {
  const glow = new Shapes(), bulb = new Shapes();
  for (const [x, y] of spots) { glow.ellipse(x, y, 70 * LAMP_K, 52 * LAMP_K, ""); bulb.circle(x, y, 4.5 * LAMP_K, ""); }
  const d = (sh: Shapes) => String(sh).match(/ d="([^"]*)"/)?.[1] ?? "";
  return `<path d="${d(glow)}" fill="#ffe6b0" style="opacity:calc(var(--lamp, 0) * (0.32 + var(--fog, 0) * 0.25))"/>
    <path d="${d(bulb)}" fill="#fff3c9" style="opacity:calc(0.35 + var(--lamp, 0) * 0.65)"/>`;
}

// The pond's moving glint (it pulses, so it is drawn with the live parts).
function pondShine(cx: number, cy: number, frozen: boolean) {
  return frozen
    ? `<path class="pond-shine" d="M${cx - 110} ${cy - 50} q60 -22 120 -6 M${cx + 10} ${cy + 40} q40 -12 90 -2" stroke="#ffffff" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.85"/>`
    : `<path class="pond-shine" d="M${cx - 90} ${cy - 50} q40 -14 80 0" stroke="#e8f8ff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>`;
}

// The pond, open water or frozen over with a pale sheen and a few cracks.
function pond(cx: number, cy: number, L: Look, frozen: boolean) {
  if (frozen) {
    return `<ellipse cx="${cx}" cy="${cy}" rx="190" ry="120" fill="#9cc3d6"/>
    <ellipse cx="${cx}" cy="${cy}" rx="172" ry="104" fill="#d3ebf5"/>
    <ellipse cx="${cx - 30}" cy="${cy - 20}" rx="120" ry="62" fill="#e6f5fb" opacity="0.8"/>
    <path d="M${cx - 40} ${cy + 10} l30 -14 l26 8 l22 -20 M${cx - 10} ${cy - 4} l-12 30 M${cx + 60} ${cy - 30} l40 -16" stroke="#a9cfe0" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${L.snow > 0.3 ? `<ellipse cx="${cx + 120}" cy="${cy + 50}" rx="54" ry="24" fill="${SNOW}" opacity="${L.snow * 0.9}"/><ellipse cx="${cx - 140}" cy="${cy + 20}" rx="30" ry="40" fill="${SNOW}" opacity="${L.snow * 0.8}"/>` : ""}`;
  }
  const cold = L.season === "winter";
  return `<ellipse cx="${cx}" cy="${cy}" rx="190" ry="120" fill="${cold ? "#5f98b4" : "#6aa9c9"}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="172" ry="104" fill="${cold ? "#71b0cc" : "#7cc1de"}"/>
    <path d="M${cx + 40} ${cy + 30} q30 -10 60 0" stroke="#e8f8ff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.5"/>
    ${L.pal.lily ? `<circle cx="${cx + 70}" cy="${cy - 20}" r="16" fill="${L.pal.lily}"/><circle cx="${cx - 60}" cy="${cy + 30}" r="12" fill="${L.pal.lily}"/>` : ""}
    ${L.season === "autumn" ? `<ellipse cx="${cx - 20}" cy="${cy + 52}" rx="4" ry="2.4" fill="#e08a3c"/><ellipse cx="${cx + 110}" cy="${cy - 30}" rx="4" ry="2.4" fill="#c95a3c" transform="rotate(40 ${cx + 110} ${cy - 30})"/><ellipse cx="${cx - 100}" cy="${cy + 6}" rx="4" ry="2.4" fill="#e2b941"/>` : ""}`;
}

// --- ambient life: fountain spray and animals --------------------------------------------------

// Droplets arc out of the jet and fall back into the basin; each landing sends out a small ring,
// and slow rings spread from the middle.
function spray(cx: number, cy: number) {
  const q = rnd(4711);
  let s = "";
  for (let i = 0, n = 6; i < n; i++) {
    const a = (i / n) * 360 + q() * 22, r1 = 31 + q() * 11;
    const t = timing(q, 1.5, 0.18);
    s += `<g transform="translate(${n2(cx)} ${n2(cy)}) rotate(${n2(a)})">
      <circle class="amb-ripple" cx="${n2(r1)}" cy="0" r="5" fill="none" stroke="#e8f8ff" stroke-width="1.4" style="${t}"/>
      <circle class="amb-drop" cx="0" cy="0" r="${n2(1.7 + q() * 1.1)}" fill="#ffffff" style="${t};--r1:${n2(r1)}px"/></g>`;
  }
  for (const d of [0, -1.6]) s += `<circle class="amb-ring" cx="${n2(cx)}" cy="${n2(cy)}" r="50" fill="none" stroke="#e8f8ff" stroke-width="2" style="animation-delay:${d}s"/>`;
  return s;
}

// A smooth closed loop through n points wobbling around an ellipse, as an SVG path, with its rough length.
function loop(cx: number, cy: number, rx: number, ry: number, q: () => number, n = 7, dir = 1) {
  const a0 = q() * Math.PI * 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = a0 + dir * (i / n) * Math.PI * 2, k = 0.62 + q() * 0.38;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
  const P = (v: number[]) => `${n2(v[0])} ${n2(v[1])}`;
  let d = `M${P(pts[0])}`, len = 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${P([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${P([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${P(p2)}`;
    len += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 1.04;
  }
  return { d: `${d} Z`, len };
}
// Attributes for an element travelling along a path (offset-path), starting `at` (0..1) of the way round.
const along = (d: string, dur: number, at: number, cls = "amb-path") =>
  `class="${cls}" style="offset-path:path('${d}');animation-duration:${n2(dur)}s;animation-delay:${n2(-(((at % 1) + 1) % 1) * dur)}s"`;

type DuckKind = "mallard" | "white" | "hen" | "chick";
const DUCK: Record<Exclude<DuckKind, "chick">, { body: string; wing: string; tail: string; head: string; ring?: string }> = {
  mallard: { body: "#bba78e", wing: "#8f7a62", tail: "#3a3f4f", head: "#2f8f5f", ring: "#ffffff" },
  white: { body: "#f6f3ec", wing: "#e3ddd1", tail: "#e3ddd1", head: "#fbf9f4" },
  hen: { body: "#b39070", wing: "#8f6f50", tail: "#7a5c42", head: "#9a7a5a" },
};
// Animals inside the park are drawn on the park's plan, which is shown PARK_K times bigger:
// shrink them back so a duck or a bird stays small next to a robot.
const SMALL = n2(1.15 / PARK_K);
// A duck from above, facing +x. `tucked` is a duck resting with its head drawn in.
function duck(kind: DuckKind, tucked = false, shadow = "#1f3a4a") {
  if (kind === "chick") {
    return `<ellipse cx="0.6" cy="1" rx="5.4" ry="4" fill="${shadow}" opacity="0.15"/><ellipse cx="0" cy="0" rx="5" ry="3.8" fill="#ffd27a"/>
      <circle cx="3.8" cy="0" r="2.8" fill="#ffe08a"/><path d="M6.2 -0.9 L8.4 0 L6.2 0.9 Z" fill="#ff9f5a"/>`;
  }
  const c = DUCK[kind], hx = tucked ? 4.5 : 7.5;
  return `<ellipse cx="1" cy="1.8" rx="12" ry="7.6" fill="${shadow}" opacity="0.16"/>
    <path d="M-13 0 L-8 -3.6 L-8 3.6 Z" fill="${c.tail}"/>
    <ellipse cx="-1" cy="0" rx="${tucked ? 10.5 : 11}" ry="${tucked ? 7.8 : 7}" fill="${c.body}"/>
    <ellipse cx="-3" cy="0" rx="7" ry="${tucked ? 5.6 : 5}" fill="${c.wing}"/>
    ${c.ring ? `<circle cx="${hx - 0.4}" cy="0" r="4.7" fill="${c.ring}"/>` : ""}
    <circle cx="${hx}" cy="0" r="4.2" fill="${c.head}"/><circle cx="${hx - 1.2}" cy="-1.4" r="1.4" fill="#ffffff" opacity="0.25"/>
    <ellipse cx="${hx + 4.4}" cy="0" rx="2.8" ry="1.7" fill="#ffb347"/>`;
}

// Ducks paddle slow loops round the pond leaving small V wakes; on ice they sit, in deep snow they are gone.
function ducks(cx: number, cy: number, L: Look, frozen: boolean) {
  if (frozen) {
    if (L.snow >= 0.85) return "";
    const q = rnd(77);
    return ([[-118, 46, 20, "mallard"], [-88, 62, -150, "hen"]] as const).map(([dx, dy, a, k]) =>
      `<g transform="translate(${cx + dx} ${cy + dy}) rotate(${a}) scale(${SMALL})"><g class="amb-sit" style="${timing(q, 4, 0.3)}">${duck(k, true, "#5a7f99")}</g></g>`).join("");
  }
  const q = rnd(L.season === "winter" ? 31 : 17);
  const wake = (k: number) => `<path d="M${-12 * k} ${-3 * k} Q${-24 * k} ${-8 * k} ${-38 * k} ${-14 * k} M${-12 * k} ${3 * k} Q${-24 * k} ${8 * k} ${-38 * k} ${14 * k}" stroke="#e8f8ff" stroke-width="${n2(1.8 * Math.max(0.7, k))}" fill="none" stroke-linecap="round"/>`;
  const one = (kind: DuckKind, d: string, dur: number, at: number) =>
    `<g ${along(d, dur, at)} transform="scale(${SMALL})">${wake(kind === "chick" ? 0.45 : 1)}<g class="amb-rock" style="${timing(q, 2.6, 0.3)}">${duck(kind)}</g></g>`;
  const kinds: DuckKind[] = L.season === "winter" ? ["mallard", "hen"] : L.season === "spring" ? ["hen", "mallard"] : ["mallard", "white", "hen"];
  let s = "";
  kinds.forEach((kind, i) => {
    const path = loop(cx + (q() - 0.5) * 30, cy + (q() - 0.5) * 16, 150, 84, q, 7, i % 2 ? -1 : 1);
    const dur = path.len / (6 + q() * 3), at = q();
    // in spring the duck hen leads three ducklings
    if (L.season === "spring" && kind === "hen") for (let c = 3; c >= 1; c--) s += one("chick", path.d, dur, at - (c * 17 + 4) / path.len);
    s += one(kind, path.d, dur, at);
  });
  return s;
}

function butterfly(color: string, q: () => number) {
  const shade = color === "#ffffff" ? "#e8e3d8" : mix(color, "#000000", 0.16);
  return `<g transform="scale(${SMALL})"><g class="amb-flap" style="animation-duration:${n2(0.16 + q() * 0.1)}s">
    <ellipse cx="1.5" cy="-4.6" rx="4" ry="5" fill="${color}"/><ellipse cx="1.5" cy="4.6" rx="4" ry="5" fill="${color}"/>
    <ellipse cx="-3" cy="-3.6" rx="3" ry="3.8" fill="${shade}"/><ellipse cx="-3" cy="3.6" rx="3" ry="3.8" fill="${shade}"/></g>
    <ellipse cx="0" cy="0" rx="5.5" ry="1.2" fill="#3a3f4f"/></g>`;
}

type BirdKind = "sparrow" | "blackbird" | "tit";
const BIRD: Record<BirdKind, { body: string; wing: string; head: string; beak: string; cheek?: string }> = {
  sparrow: { body: "#b08a68", wing: "#7d5f44", head: "#6b5040", beak: "#4a3a2c" },
  blackbird: { body: "#3f4452", wing: "#2e3242", head: "#3a3f4f", beak: "#ffb347" },
  tit: { body: "#ffd27a", wing: "#4fb6ff", head: "#3a8fd0", beak: "#3a3f4f", cheek: "#ffffff" },
};
// A small bird from above, facing +x; `t` is its hop timing (it pecks in the pauses).
function bird(kind: BirdKind, t: string) {
  const c = BIRD[kind];
  return `<g class="amb-hop" style="${t}"><ellipse cx="0.8" cy="1.4" rx="6.6" ry="4.4" fill="#1f2a1a" opacity="0.18"/>
    <path d="M-5 0 L-11 -2.6 L-11 2.6 Z" fill="${c.wing}"/><ellipse cx="0" cy="0" rx="6.2" ry="4.2" fill="${c.body}"/><ellipse cx="-1.6" cy="0" rx="4" ry="3" fill="${c.wing}"/>
    <g><circle cx="5" cy="0" r="2.9" fill="${c.head}"/>${c.cheek ? `<circle cx="5.4" cy="0" r="1.3" fill="${c.cheek}"/>` : ""}<path d="M7.5 -0.8 L9.8 0 L7.5 0.8 Z" fill="${c.beak}"/></g></g>`;
}

// Soft irregular snow patches for partial cover, so thin snow reads as patchy, not grey.
function snowPatches(x0: number, y0: number, w: number, h: number, cover: number, seed = 321, avoid?: { x: number; y: number; w: number; h: number }) {
  if (cover <= 0 || cover >= 0.95) return "";
  const q = rnd(seed);
  let s = "";
  for (let i = 0, n = Math.round((w * h) / 70000); i < n; i++) {
    const x = x0 + q() * w, y = y0 + q() * h, size = 30 + q() * 70, keep = q() < cover;
    // each drift is a cluster of round lumps, drawn as one flat shape
    let lumps = "";
    for (let j = 0, m = 3 + Math.floor(q() * 4); j < m; j++) {
      const a = q() * Math.PI * 2, d = q() * size;
      lumps += `<ellipse cx="${x + Math.cos(a) * d * 1.4}" cy="${y + Math.sin(a) * d * 0.6}" rx="${size * (0.5 + q() * 0.5)}" ry="${size * (0.35 + q() * 0.25)}"/>`;
    }
    const hit = avoid && x > avoid.x - size * 1.6 && x < avoid.x + avoid.w + size * 1.6 && y > avoid.y - size && y < avoid.y + avoid.h + size;
    if (keep && !hit) s += lumps;
  }
  return `<g fill="${SNOW}" opacity="0.88">${s}</g>`;
}


/**
 * Which part of the outdoors to draw:
 * - "all" (default): everything in one svg, animated parts included.
 * - "still": what never moves: the meadow and its soft edge, the tree belt, the hedge, the lawn,
 *   the building shell, the walk, the plaza, the park's lawn, paths, pond, fountain basin,
 *   benches, flower beds, picnic blanket, puddles and snowmen. No animation and nothing that
 *   depends on the hour, so it can be shown as one static image.
 * - "live": what moves or lights up at night (the walk's and the park's trees, flowers, the
 *   pond's glint, ducks, fountain spray, lamps, birds and insects), as a transparent svg of the
 *   same size with `position:absolute;left:0;top:0`, to lay over the "still" one as live page
 *   elements. It stays light (about 150 elements): trees share a few sway groups and similar
 *   shapes are merged into one path.
 * "still" under "live" looks like "all".
 */
export type OutsideLayer = "all" | "still" | "live";

// Draw the whole outdoor area. The building occupies (bx, by, bw, bh) in world coordinates;
// the outdoor svg is placed at (ox, oy) and is (w x h) big.
// season: defaults to "summer" (the original look). snowCover: 0 (none) to 1 (fully white).
// frozen: whether the pond is iced over; defaults to winter with at least some snow.
export type OutsideOpts = {
  ox: number; oy: number; w: number; h: number;
  building: Rect;
  /** Actual occupied rooms and corridors. The bounding rect still anchors the grounds. */
  footprint?: BuildingFootprint;
  entranceY: number;
  park: Rect;
  season?: Season; snowCover?: number; frozen?: boolean;
  /** Extra areas kept free of lawn trees (other buildings). */
  avoid?: Rect[];
  campusAreas?: Rect[];
  campusRoutes?: Rect[];
  /** Which part to draw, see OutsideLayer. Default "all". */
  layer?: OutsideLayer;
  /** A layout from groundsLayout() with the same building and park (saves computing it again). */
  grounds?: Grounds;
  /** What the weather does to the ground (puddles, frost, heat, snowmen); see weather/ground.ts. */
  wx?: GroundWx;
  /** Lamp posts drawn in the landscape: their light pools at night. */
  glows?: [number, number][];
  /** Parks of connected computers: drawn with the same furniture. */
  otherParks?: Rect[];
  /** Where puddles form (puddleSpots), drawn when wx has puddles. */
  puddles?: Puddle[];
};

/** The season palette as the weather and the snow leave it. */
export function lookFor(o: Pick<OutsideOpts, "season" | "snowCover" | "wx">): Look {
  const season = o.season ?? "summer";
  const snow = Math.max(0, Math.min(1, o.snowCover ?? 0));
  const pal0 = weatherPal(seasonPalette(season), o.wx, snow);
  // shadows on snow look cool blue-grey, not green
  const pal = snow > 0 ? { ...pal0, shadow: mix(pal0.shadow, "#3a4a68", snow) } : pal0;
  // A theme can draw a moonlit version of the same season, hues kept (themes/registry.ts).
  const art = themeArt();
  return { pal: art?.shade ? moonlit(pal, art.shade) : pal, snow, season, wx: o.wx, art };
}

/** The woodland's crown colours (dark, mid, light): the season's trees with evergreens among them. */
function woodsPal(L: Look) {
  return [...L.pal.trees, ["#2f5f4a", "#3d7259", "#558a6c"], ["#2a5644", "#376651", "#4d7f63"]];
}

/**
 * The calm colour round the grounds, where the woodland fades out: the deep shade under the
 * canopy (pale blue-grey under snow). The scene behind the outdoors uses it too, so the edge of
 * the drawing never shows.
 */
export function backdropColor(o: Pick<OutsideOpts, "season" | "snowCover" | "wx">) {
  const L = lookFor(o);
  if (L.art?.edge) return L.art.edge;
  return mix("#1e3b33", "#a9b8c6", L.snow * 0.7);
}

// set the drawing order for the next shapes (see Shapes.z)
const Z = (s: Shapes, z: number) => { s.z = z; return s; };

/** The grounds without the park: woodland, meadow, hedge, lawn, walk, plaza, kitchen garden and lawn trees. */
function drawGrounds(G: Grounds, L: Look, o: OutsideOpts) {
  const { pal, snow } = L;
  const b = o.building, p = o.park;
  const lawnC = mix(pal.ground, SNOW, snow >= 0.95 ? 0.8 : snow * 0.45);
  const back = backdropColor(o);
  const meadow = mix(lawnC, back, 0.28);
  const paveC = mix(pal.plaza, SNOW, snow * 0.5), pathC = mix(pal.path, SNOW, snow * 0.55);
  const hedge = pal.bush, shadowC = pal.shadow;
  const B = G.bounds, LW = G.lawn;

  const base = new Shapes(1800), low = new Shapes(1800), trees = new Grove(1800), top = new Shapes(1800);
  let treeN = 0;
  const tree = (x: number, y: number, r: number, light = false) => { treeInto(trees, x, y, r, treeN % 3, L, 500 + treeN, light); treeN++; };
  const planter = (x: number, y: number, r = 38) => Z(low, 1).circle(x, y, r - 4, `fill="${mix("#6b5646", SNOW, snow * 0.8)}" stroke="${mix("#b3a893", SNOW, snow * 0.6)}" stroke-width="8"`);
  const hedgeRect = (x: number, y: number, w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    Z(low, 1).rect(x, y, w, h, fill(hedge[1]), 14);
    Z(low, 2).rect(x + 5, y + 3, w - 10, h * 0.55, fill(mix(hedge[2], SNOW, snow * 0.85)), 11);
  };
  // a bench for two robots, (x, y) its top left corner
  const BW = 130, BH = 42;
  const bench = (x: number, y: number) => {
    Z(low, 0).rect(x + 5, y + 8, BW, BH, fill(shadowC, 0.2), 6);
    Z(low, 1).rect(x, y, BW, BH, fill(snow > 0.3 ? mix("#b9854c", SNOW, snow * 0.7) : "#b9854c"), 6);
    Z(low, 2).rect(x, y, BW, 15, fill("#a4723f"), 5);
  };
  const rr = (r: Rect, d: number, rad: number) => { const x = r.x + d, y = r.y + d, w = r.w - 2 * d, h = r.h - 2 * d, k = Math.max(4, rad);
    return `M${n1(x + k)} ${n1(y)}H${n1(x + w - k)}A${k} ${k} 0 0 1 ${n1(x + w)} ${n1(y + k)}V${n1(y + h - k)}A${k} ${k} 0 0 1 ${n1(x + w - k)} ${n1(y + h)}H${n1(x + k)}A${k} ${k} 0 0 1 ${n1(x)} ${n1(y + h - k)}V${n1(y + k)}A${k} ${k} 0 0 1 ${n1(x + k)} ${n1(y)}Z`; };

  // --- ground: the woodland floor, the meadow round the hedge, the lawn inside it ---------------
  const clear = { x: LW.x - MEADOW, y: LW.y - MEADOW, w: LW.w + 2 * MEADOW, h: LW.h + 2 * MEADOW };
  const floor = mix(back, meadow, 0.35);
  let ground = `<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" fill="${floor}"/>
    <path d="${rr(clear, -30, 260)}" fill="${mix(meadow, floor, 0.5)}"/><path d="${rr(clear, 0, 240)}" fill="${meadow}"/>
    <path d="${rr(LW, 0, 150)}" fill="${lawnC}"/>
    <path d="${rr(clear, 0, 240)}" fill="url(#lc-grass)"/>`;
  if (snow > 0 && snow < 0.95) ground += `<rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" fill="url(#lc-snow)" opacity="${n2(Math.min(1, snow * 1.4) * 0.9)}"/>`;

  // wild flowers in the meadow in the warm months
  const fl = pal.flowers, qf = rnd(61);
  const onRing = (a: number, d: number): [number, number] => {
    const W = LW.w, H = LW.h;
    return a < W ? [LW.x + a, LW.y - d] : a < W + H ? [LW.x + W + d, LW.y + a - W] : a < 2 * W + H ? [LW.x + W - (a - W - H), LW.y + H + d] : [LW.x - d, LW.y + H - (a - 2 * W - H)];
  };
  if (!fl.covered && fl.colors.length) {
    for (let i = 0; i < 90 * fl.density; i++) {
      const [x, y] = onRing(qf() * 2 * (LW.w + LW.h), 30 + qf() * (MEADOW - 30));
      Z(base, 0).circle(x, y, 3 + qf() * 2, fill(fl.colors[i % fl.colors.length], 0.9));
    }
  }

  // --- the hedge round the lawn -------------------------------------------------------------------
  const hd = rr(LW, 26, 140);
  const hedgeSvg = `<path d="${hd}" fill="none" stroke="${shadowC}" stroke-width="58" opacity="0.2" transform="translate(9 13)"/>
    <path d="${hd}" fill="none" stroke="${mix(hedge[0], SNOW, snow * 0.5)}" stroke-width="56"/>
    <path d="${hd}" fill="none" stroke="${mix(hedge[2], SNOW, snow * 0.85)}" stroke-width="24" transform="translate(-5 -6)"/>`;

  // --- the woodland round the clearing: flat overlapping crowns, a ragged edge, fading out ------
  const canopy = new Shapes(1800), qw = rnd(909), cols = woodsPal(L);
  const STEP = 150;
  for (let y = B.y + 40; y < B.y + B.h; y += STEP * 0.86) {
    const row = Math.round((y - B.y) / STEP);
    for (let x = B.x + (row % 2 ? STEP / 2 : 0); x < B.x + B.w; x += STEP) {
      const tx = x + (qw() - 0.5) * STEP * 0.8, ty = y + (qw() - 0.5) * STEP * 0.8;
      // how far outside the clearing, against a wobbly edge
      const dx = Math.max(clear.x - tx, tx - (clear.x + clear.w), 0), dy = Math.max(clear.y - ty, ty - (clear.y + clear.h), 0);
      const out = Math.hypot(dx, dy), edge = 40 + Math.sin(tx * 0.011 + ty * 0.007) * 30 + qw() * 40;
      // the season's trees grow in clumps among the evergreens (a slow wave decides where)
      const clump = Math.sin(tx * 0.0031 + Math.cos(ty * 0.0043) * 2.2) + Math.sin(ty * 0.0057 - tx * 0.0013) * 0.7;
      const ever = clump < 0.15 || qw() < 0.25;
      const r = 75 + qw() * 44, g = ever ? cols[cols.length - 1 - (qw() < 0.5 ? 1 : 0)] : cols[Math.floor(qw() * (cols.length - 2))];
      if (out < edge) continue;
      // far in the fade nothing shows anyway
      if (Math.min(tx - B.x, B.x + B.w - tx, ty - B.y, B.y + B.h - ty) < FADE * 0.25) continue;
      if (out < edge + 160) Z(canopy, 0).ellipse(tx + r * 0.3, ty + r * 0.45, r * 1.02, r * 0.68, fill(shadowC, 0.3));
      Z(canopy, 1).circle(tx, ty, r, fill(g[0]));
      Z(canopy, 2).circle(tx - r * 0.24, ty - r * 0.2, r * 0.7, fill(mix(g[1], SNOW, snow * 0.6)));
      if (qw() < 0.3) Z(canopy, 3).circle(tx - r * 0.36, ty - r * 0.36, r * 0.32, fill(mix(g[2], SNOW, snow * 0.9)));
    }
  }
  // the fade: rings of the backdrop colour, each a little further in, stacked into a soft edge
  let fade = "";
  const RINGS = 10;
  for (let i = 0; i < RINGS; i++) {
    const d = FADE * (1 - i / RINGS);
    fade += `<path fill-rule="evenodd" d="M${B.x - 2} ${B.y - 2}h${B.w + 4}v${B.h + 4}h${-B.w - 4}Z${rr(B, d, 500 - d)}" fill="${back}" opacity="0.28"/>`;
  }
  fade += `<path fill-rule="evenodd" d="M${B.x - 2} ${B.y - 2}h${B.w + 4}v${B.h + 4}h${-B.w - 4}Z${rr(B, FADE * 0.08, 480)}" fill="${back}"/>`;
  ground += `${canopy}${fade}`;

  // --- the walk: paving, planters with trees, benches -------------------------------------------
  const gw = G.walk;
  Z(base, 1).rect(gw.x, gw.y, gw.w, gw.h, `fill="url(#lc-pave)"`, 30);
  // planted trees along both edges; between them on the north edge a bench or a lamp
  const walkTrees: [number, number][] = [];
  const lampsAt: [number, number][] = [];
  const PSTEP = 300, pathX = G.plazaPath ? G.plazaPath.x + G.plazaPath.w / 2 : -1e9;
  const north: number[] = [];
  for (let x = gw.x + 160; x < gw.x + gw.w - 120; x += PSTEP) if (Math.abs(x - pathX) > 120) north.push(x);
  let slot = 0;
  north.forEach((x, i) => {
    walkTrees.push([x, gw.y - 30]);
    const m = x + PSTEP / 2;
    if (i === north.length - 1 || Math.abs(m - pathX) < 150 || m > gw.x + gw.w - 150) return;
    if (slot++ % 2 === 0) bench(m - BW / 2, gw.y - BH - 26); else lampsAt.push([m, gw.y - 50]);
  });
  for (let x = gw.x + 160 + PSTEP / 2; x < gw.x + gw.w - 120; x += PSTEP) walkTrees.push([x, gw.y + gw.h + 8]);
  for (const [x, y] of walkTrees) planter(x, y);

  // --- the round plaza: a big tree inside a ring bench, a path down to the walk ------------------
  const pz = G.plaza;
  if (pz && G.plazaPath) {
    Z(base, 0).rect(G.plazaPath.x, G.plazaPath.y, G.plazaPath.w, G.plazaPath.h, fill(pathC));
    Z(base, 2).circle(pz.x, pz.y, pz.r, `fill="url(#lc-pave)"`);
    Z(low, 0).circle(pz.x + 6, pz.y + 9, 128, `fill="none" stroke="${shadowC}" stroke-width="30" opacity="0.2"`);
    Z(low, 1).circle(pz.x, pz.y, 128, `fill="none" stroke="${snow > 0.3 ? mix("#b9854c", SNOW, snow * 0.7) : "#b9854c"}" stroke-width="30"`);
    Z(base, 3).circle(pz.x, pz.y, 106, fill(mix(L.season === "autumn" ? "#6f7d45" : "#5b8f4e", SNOW, snow * 0.8)));
    if (!fl.covered && fl.colors.length) for (let i = 0; i < 14 * fl.density; i++) {
      const a = (i / (14 * fl.density)) * Math.PI * 2;
      Z(base, 4).circle(pz.x + Math.cos(a) * 88, pz.y + Math.sin(a) * 88, 8, fill(fl.colors[i % fl.colors.length]));
    }
  }

  // --- a kitchen garden of raised beds on the south lawn ----------------------------------------
  const KG = 1.4, kg = { x: b.x + b.w - 1060, y: b.y + b.h + 130 };
  if (LW.y + LW.h - kg.y > 130 + 84 * KG) {
    const qv = rnd(33), winter = L.season === "winter", soil = mix("#7a5a3a", SNOW, snow * 0.8);
    for (let i = 0; i < 3; i++) {
      const x = kg.x + i * 230 * KG, y = kg.y;
      Z(low, 0).rect(x + 7, y + 10, 190 * KG, 84 * KG, fill(shadowC, 0.2), 11);
      Z(low, 1).rect(x, y, 190 * KG, 84 * KG, fill(mix("#b9854c", SNOW, snow * 0.6)), 11);
      Z(low, 2).rect(x + 11, y + 11, 174 * KG, 68 * KG, fill(soil), 7);
      if (winter || snow >= 0.95) continue;
      for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
        const cx = x + (24 + k * 28) * KG, cy = y + (22 + row * 21) * KG;
        Z(low, 3).circle(cx, cy, (8 + qv() * 2) * KG, fill(mix(L.season === "autumn" ? "#8a8f3c" : "#5f9e4f", SNOW, snow * 0.75)));
        if (i === 1 && L.season === "summer" && qv() < 0.4) Z(low, 4).circle(cx + 4, cy + 3, 3.4 * KG, fill("#e2626b"));
        if (i === 2 && L.season === "autumn" && qv() < 0.3) Z(low, 4).circle(cx + 3, cy + 4, 6 * KG, fill("#e8892f"));
      }
    }
    Z(low, 1).rect(kg.x + 700 * KG, kg.y + 22 * KG, 34 * KG, 44 * KG, fill("#4f8f8a"), 8);   // a watering can
    Z(low, 2).circle(kg.x + 717 * KG, kg.y + 30 * KG, 7 * KG, fill("#6fb2ad"));
  }

  // --- trees on the lawn round the building ---------------------------------------------------
  const lawnTrees: [number, number, number][] = [];
  const nRow = Math.max(2, Math.round(b.w / 700));
  for (let i = 0; i < nRow; i++) {
    const x = b.x + (b.w * (i + 0.5)) / nRow;
    lawnTrees.push([x, b.y - 210, 74 + (i % 3) * 7]);
    lawnTrees.push([x + 120, b.y + b.h + 215, 76 + ((i + 1) % 3) * 7]);
  }
  lawnTrees.push([b.x - 200, b.y + b.h * 0.3, 80], [b.x - 205, b.y + b.h * 0.78, 76], [gw.x + 120, LW.y + 170, 80], [p.x - 170, LW.y + 190, 72],
    [p.x + p.w + 190, p.y + 160, 76], [p.x + p.w + 180, p.y + p.h - 140, 82], [p.x + 220, LW.y + LW.h - 150, 76], [p.x + p.w - 280, LW.y + LW.h - 160, 70]);
  const hit = (x: number, y: number, r: Rect, pad: number) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  for (const [x, y, r] of lawnTrees) {
    if (!hit(x, y, LW, -90)) continue;
    if (hit(x, y, b, 100) || hit(x, y, p, 80) || hit(x, y, gw, 90)) continue;
    if (pz && Math.hypot(x - pz.x, y - pz.y) < pz.r + 100) continue;
    if (hit(x, y, { x: kg.x, y: kg.y, w: 740 * KG, h: 84 * KG }, 90)) continue;
    if (o.avoid?.some((a) => hit(x, y, a, 40))) continue;
    tree(x, y, r);
  }

  // --- what sways: the walk's trees and the plaza tree (live) ----------------------------------
  const ox = o.ox, oy = o.oy;
  const sway = [new Grove(), new Grove(), new Grove()];
  walkTrees.forEach(([x, y], i) => treeInto(sway[i % 3], x - ox, y - oy, 54 + (i % 3) * 5, i % 3, L, 900 + i));
  if (pz) treeInto(sway[1], pz.x - ox, pz.y - oy, 96, 0, L, 77);
  const qs2 = rnd(1234);
  const stillLocal = sway.map((Gr) => `${Gr.under}${Gr.still()}`).join("");
  const live = sway.map((Gr) => `<g class="amb-tree" style="${timing(qs2, 7, 0.35, `;--a:${n2(1.4 + qs2() * 1)}px`)}">${Gr.moving()}</g>`).join("");
  const lamps: [number, number][] = lampsAt.map(([x, y]) => [x - ox, y - oy]);
  if (pz) lamps.push([pz.x + 150 - ox, pz.y - 110 - oy]);

  const snowmen = o.wx?.snowmen && pz ? snowman(pz.x - 300, pz.y + 40, 7) : "";
  return {
    ground: `<g transform="translate(${-ox} ${-oy})">${ground}${base}</g>`,
    still: `<g transform="translate(${-ox} ${-oy})"><g>${hedgeSvg}</g>${low}${trees.all()}${top}${snowmen}</g>${stillLocal}${lamps.map(([x, y]) => lampHead(x, y)).join("")}`,
    live,
    lamps,
    trees: treeN,
  };
}

function patterns(L: Look) {
  const { pal, snow } = L;
  const tuftOp = pal.tuftOpacity * (1 - snow);
  const qg = rnd(7);
  let tufts = "";
  for (let i = 0; i < 9; i++) tufts += `M${n1(6 + qg() * 128)} ${n1(8 + qg() * 124)}l2 -6l2 6`;
  const qs = rnd(321);
  let lumps = "";
  for (let i = 0; i < 7; i++) {
    const x = qs() * 700, y = qs() * 700, size = 30 + qs() * 60;
    for (let j = 0, m = 3 + Math.floor(qs() * 3); j < m; j++) {
      const a = qs() * Math.PI * 2, d = qs() * size, cx = x + Math.cos(a) * d * 1.4, cy = y + Math.sin(a) * d * 0.6;
      const rx = size * (0.5 + qs() * 0.5), ry = size * (0.35 + qs() * 0.25);
      // drawn again across the tile edges so the pattern wraps without seams
      for (const [dx, dy] of [[0, 0], [-700, 0], [0, -700], [700, 0], [0, 700]]) if (cx + dx + rx > 0 && cx + dx - rx < 700 && cy + dy + ry > 0 && cy + dy - ry < 700)
        lumps += `<ellipse cx="${n1(cx + dx)}" cy="${n1(cy + dy)}" rx="${n1(rx)}" ry="${n1(ry)}"/>`;
    }
  }
  const paveC = mix(pal.plaza, SNOW, snow * 0.5);
  return `
    <pattern id="lc-grass" width="140" height="140" patternUnits="userSpaceOnUse"><path d="${tufts}" stroke="${pal.tuft}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="${n2(0.5 * tuftOp)}"/></pattern>
    <pattern id="lc-snow" width="700" height="700" patternUnits="userSpaceOnUse"><g fill="${SNOW}">${lumps}</g></pattern>
    <pattern id="lc-pave" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="${paveC}"/><path d="M0 0.75H44M0.75 0V44" stroke="${mix(paveC, "#7a6a50", 0.16)}" stroke-width="1.5"/></pattern>`;
}

// The outdoor overlay: building shell, the park objects robots use, and the light (dusk, night,
// lamp and window glows). Terrain and woodland are bitmap tiles underneath (landscape-tiles.ts).
export const PLAIN_GROUND = "#78b066";
export function campusGround(o: Pick<OutsideOpts, "season" | "snowCover" | "wx">) { const L = lookFor(o); return mix(L.pal.ground, SNOW, L.snow * .8); }
/** Where things stand in the park, in park plan units (centre 0,0; drawn PARK_K times bigger).
 * Shared by the drawing below and the click reactions (park-toys.ts). */
export const PARK_LAYOUT = {
  trees: [[-540, -410, 66], [530, 400, 70], [-320, -200, 58], [540, -220, 54], [-575, 410, 52], [400, -400, 62]] as [number, number, number][],
  bushes: [[-470, 230, 40], [-200, 420, 34], [420, 220, 38], [470, 260, 30], [-480, -340, 38]] as [number, number, number][],
  /** low bush rows either side of the main path */
  hedge: ([-50, 50] as number[]).flatMap(y => Array.from({ length: 12 }, (_, i) => -500 + i * 30).filter(x => x < -335 || x > -305).map(x => [x, y + (x % 60 ? 2 : -2), 16] as [number, number, number])),
  beds: [[-175, -262, 95, 40, 31], [250, 190, 85, 32, 47], [-190, 214, 72, 30, 63]] as [number, number, number, number, number][],
  lamps: [[-65, -35], [60, 160], [-470, 290]] as [number, number][],
  pond: { x: 260, y: -120, rx: 190, ry: 120 },
  fountain: { x: 0, y: 0, r: 70 },
  gazebo: { x: 250, y: 320, r: 62 },
};
const PARK_LAMPS = PARK_LAYOUT.lamps;
export function plainOutsideSvg(o: OutsideOpts) {
  const { ox, oy, w, h, building: b, park: p } = o, L = lookFor(o);
  const { snow, season, pal } = L;
  const frozen = o.frozen ?? (season === "winter" && snow >= 0.4);
  const shell = o.footprint
    ? `<path d="${o.footprint.path}" transform="translate(24 34)" fill="#1f2a1a" opacity="0.32"/>
      <path d="${o.footprint.path}" fill="${mix("#4a4f5c", "#c9d3dc", snow * 0.8)}" stroke="${mix("#4a4f5c", "#c9d3dc", snow * 0.8)}" stroke-width="44" stroke-linejoin="round"/>
      <path d="${o.footprint.path}" fill="${mix("#5d6373", SNOW, snow * 0.85)}" stroke="${mix("#5d6373", SNOW, snow * 0.85)}" stroke-width="28" stroke-linejoin="round"/>`
    : `<rect x="${b.x + 24}" y="${b.y + 34}" width="${b.w}" height="${b.h}" rx="14" fill="#1f2a1a" opacity="0.32"/>
      <rect x="${b.x - 22}" y="${b.y - 22}" width="${b.w + 44}" height="${b.h + 44}" rx="16" fill="#4a4f5c"/>
      <rect x="${b.x - 14}" y="${b.y - 14}" width="${b.w + 28}" height="${b.h + 28}" rx="12" fill="#5d6373"/>`;
  const plaza = mix(pal.plaza, SNOW, snow * 0.45);
  const garden = new Grove();
  // A small finite garden uses the existing artwork, frozen into static paths.
  // Every tree and bush is its own group so a click can sway just that one (park-toys.ts).
  const sway = (key: string, x: number, y: number, draw: (G: Grove) => void) => {
    const G = new Grove(); draw(G);
    return `<g class="park-sway" data-sway="${key}" style="transform-origin:${x}px ${y}px">${G.all()}</g>`;
  };
  const plants = [
    ...PARK_LAYOUT.hedge.map(([x, y, r], i) => sway(`h${i}`, x, y + r, G => bushInto(G, x, y, r, L))),
    ...PARK_LAYOUT.bushes.map(([x, y, r], i) => sway(`b${i}`, x, y + r * 0.6, G => bushInto(G, x, y, r, L))),
    ...PARK_LAYOUT.trees.map(([x, y, r], i) => sway(`t${i}`, x, y + r * 0.7, G => treeInto(G, x, y, r, i % 3, L, 71 + i * 13))),
  ].join("");
  const flowerColors = pal.flowers.colors;

  // Park life: flower beds with stone borders, bush rows along the main path, reeds and stones
  // round the pond and a gazebo. Static: painted once with the park, no per-frame cost.
  const bloom = snow < 0.5 && flowerColors.length > 0;
  const stone = mix("#a39b8c", SNOW, snow * 0.7), soil = mix("#5a3f2b", SNOW, snow * 0.85);
  const leafA = mix(L.pal.bush[0], SNOW, snow * 0.7), leafB = mix(L.pal.bush[1], SNOW, snow * 0.7);
  const bed = (cx: number, cy: number, rx: number, ry: number, seed: number) => {
    const q = rnd(seed); let leaves = "", blooms = "";
    for (let i = 0; i < Math.round(rx * ry / 210); i++) {
      const a = q() * 6.283, d = Math.sqrt(q()) * 0.86;
      leaves += `<circle cx="${n1(cx + Math.cos(a) * rx * d)}" cy="${n1(cy + Math.sin(a) * ry * d)}" r="${n1(7 + q() * 5)}" fill="${q() < 0.5 ? leafA : leafB}"/>`;
    }
    // flowers grow in drifts of one colour, not as confetti
    if (bloom) for (let c = 0; c < Math.max(4, Math.round(rx / 15)); c++) {
      const a = q() * 6.283, d = Math.sqrt(q()) * 0.62, ccx = cx + Math.cos(a) * rx * d, ccy = cy + Math.sin(a) * ry * d;
      const col = flowerColors[(c + seed) % flowerColors.length];
      for (let k = 0; k < 11; k++) {
        const b = q() * 6.283, e = Math.sqrt(q()) * 16, x = ccx + Math.cos(b) * e, y = ccy + Math.sin(b) * e * 0.7;
        blooms += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(4.2 + q() * 2)}" fill="${col}"/>`;
      }
      blooms += `<circle cx="${n1(ccx)}" cy="${n1(ccy)}" r="2.4" fill="#fff3c4" opacity=".8"/>`;
    }
    return `<ellipse cx="${cx}" cy="${cy + 4}" rx="${rx + 13}" ry="${ry + 13}" fill="#2a3424" opacity=".16"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx + 11}" ry="${ry + 11}" fill="${stone}"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx + 4}" ry="${ry + 4}" fill="${mix(stone, "#5d574d", 0.35)}"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${soil}"/>${leaves}${blooms}`;
  };
  const reeds = (() => {
    const q = rnd(424); let out = "";
    for (const [a0, a1] of [[2.3, 3.4], [0.2, 0.9], [4.4, 4.9]]) for (let i = 0; i < 9; i++) {
      const a = a0 + (a1 - a0) * q(), x = 260 + Math.cos(a) * 196, y = -120 + Math.sin(a) * 126, h = 16 + q() * 14;
      out += `<path d="M${n1(x)} ${n1(y)} q${n1(-3 + q() * 6)} ${n1(-h * 0.6)} ${n1(-4 + q() * 8)} ${n1(-h)}" stroke="${mix("#5c7a3a", SNOW, snow * 0.5)}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      if (q() < 0.35) out += `<ellipse cx="${n1(x)}" cy="${n1(y - h)}" rx="2.6" ry="6" fill="#7a5233"/>`;
    }
    for (const [x, y, r] of [[78, -60, 14], [96, -20, 10], [440, -150, 12], [300, 8, 11]]) out += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="${mix("#8b8f96", SNOW, snow * 0.6)}"/>`;
    return out;
  })();
  const roofA = mix("#a8573c", SNOW, snow * 0.85), roofB = mix("#c4704c", SNOW, snow * 0.85);
  const gazebo = `<g transform="translate(250 320)">
    <ellipse cy="14" rx="74" ry="30" fill="#2a3424" opacity=".22"/>
    <circle r="62" fill="${mix(plaza, "#8a785c", 0.15)}"/><circle r="54" fill="${plaza}"/>
    ${[0, 1, 2, 3, 4, 5].map(i => { const a = i * Math.PI / 3; return `<circle cx="${n1(Math.cos(a) * 46)}" cy="${n1(Math.sin(a) * 46)}" r="6" fill="#6e4a30"/>`; }).join("")}
    ${[0, 1, 2, 3, 4, 5].map(i => { const a = i * Math.PI / 3 + Math.PI / 6, b = a + Math.PI / 3; return `<polygon points="0,-10 ${n1(Math.cos(a) * 58)},${n1(Math.sin(a) * 58 - 10)} ${n1(Math.cos(b) * 58)},${n1(Math.sin(b) * 58 - 10)}" fill="${i % 2 ? roofA : roofB}"/>`; }).join("")}
    <circle cy="-10" r="7" fill="#6e4a30"/>
  </g>`;
  const parkLife = `${PARK_LAYOUT.beds.map(([x, y, rx, ry, seed], i) => `<g class="park-sway" data-sway="f${i}" style="transform-origin:${x}px ${y}px">${bed(x, y, rx, ry, seed)}</g>`).join("")}${reeds}
    <path d="M24 330 Q130 334 194 324" fill="none" stroke="${mix(plaza,'#8a785c',.2)}" stroke-width="36" stroke-linecap="round"/>
    <path d="M24 330 Q130 334 194 324" fill="none" stroke="${plaza}" stroke-width="28" stroke-linecap="round"/>${gazebo}`;
  const lamp = (x:number,y:number) => `<g transform="translate(${x} ${y})"><ellipse cy="12" rx="22" ry="10" fill="#334332" opacity=".18"/><path d="M0 0v-62" stroke="#46534c" stroke-width="9"/><path class="lamp-head" d="M-15-70h30l-4 23h-22z" fill="#ffe6ac"/><path d="M-19-72h38l-10-10h-18z" fill="#48564c"/><circle class="lamp-halo" cy="-59" r="44" fill="url(#lc-halo)"/></g>`;
  const parkArt = `
        <path d="M-520 0H0V390H-320M0 0H300M0 0V-340M-70-110H-114M0 110H120" fill="none" stroke="${mix(plaza,'#8a785c',.2)}" stroke-width="59" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M-520 0H0V390H-320M0 0H300M0 0V-340M-70-110H-114M0 110H120" fill="none" stroke="${plaza}" stroke-width="47" stroke-linecap="round" stroke-linejoin="round"/>
        <circle r="110" fill="${plaza}"/><circle r="97" fill="none" stroke="${mix(plaza,'#8a785c',.25)}" stroke-width="3"/>
        ${pond(260, -120, L, frozen)}
        ${parkLife}
        ${garden.all()}${plants}

        <circle r="76" fill="${mix(plaza,'#6f6a60',.3)}"/><circle r="70" fill="${plaza}"/><circle r="56" fill="${mix(plaza,'#6f6a60',.35)}"/><circle r="52" fill="${frozen ? "#d3ebf5" : season === "winter" ? "#86bcd4" : "#8fc9e2"}"/><circle r="16" fill="${plaza}"/>
        ${bench(-150, -110, L)}${bench(80, 110, L)}${bench(-150, 120, L)}${picnic(-380, 300, L)}
      `;
  // Ground, paths and woodland are painted by the landscape tiles underneath (landscape-tiles.ts).
  // Night glows: warm light from the lamp posts and from every lit window wall.
  const glows = (o.glows ?? []).map(([x,y]) => `<ellipse cx="${n1(x-ox)}" cy="${n1(y-oy)}" rx="120" ry="92" fill="url(#lc-glow)"/>`).join("");
  // The dusk and night tints are plain coloured boxes, not rects inside this SVG. The SVG spans
  // the whole padded map (tens of thousands of pixels); Chromium rasterizes it in tiles and,
  // when a zoom outruns its tile budget, skips some. A tint inside it then went missing in
  // blocks, showing daylight forest around a dark rectangle. A plain box is drawn as one flat
  // colour, with nothing to rasterize. Lamp glows and posts stay above the tint.
  const box = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;pointer-events:none;z-index:1`;
  return `<svg class="outside outside-plain" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" style="position:relative;z-index:1">
    <g transform="translate(${-ox} ${-oy})">
      ${shell}
      <rect x="${b.x + b.w - 4}" y="${o.entranceY - 60}" width="40" height="120" fill="#b9a27e"/>
      <rect x="${b.x + b.w + 36}" y="${o.entranceY - 70}" width="60" height="140" rx="10" fill="${plaza}"/>
      ${[p, ...(o.otherParks ?? [])].map(q => `<g transform="translate(${q.x + q.w / 2} ${q.y + q.h / 2}) scale(${PARK_K})">${themedArt(parkArt, 0.8)}</g>`).join("")}
    </g>
  </svg><div class="outside-tint" aria-hidden="true" style="${box};background:#ff8f5a;opacity:calc(var(--outdoor-dusk,0) * .16)"></div><div class="outside-tint" aria-hidden="true" style="${box};background:#0a1236;opacity:calc(var(--outdoor-night,0) * .84)"></div><svg class="outside outside-lights" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" style="${box}">
    <defs><radialGradient id="lc-pool"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".42"/><stop offset=".45" stop-color="#ffc98a" stop-opacity=".2"/><stop offset="1" stop-color="#ffc98a" stop-opacity="0"/></radialGradient><radialGradient id="lc-halo"><stop offset="0" stop-color="#fff1cc" stop-opacity=".7"/><stop offset=".35" stop-color="#ffe0a3" stop-opacity=".25"/><stop offset="1" stop-color="#ffe0a3" stop-opacity="0"/></radialGradient><radialGradient id="lc-glow"><stop offset="0" stop-color="#ffd58e" stop-opacity=".55"/><stop offset=".55" stop-color="#ffc677" stop-opacity=".2"/><stop offset="1" stop-color="#ffc677" stop-opacity="0"/></radialGradient></defs>
    <g style="opacity:calc((var(--lamp,0) - .25) * 1.3)">${glows}</g>
    ${[p, ...(o.otherParks ?? [])].map(q => `<g transform="translate(${q.x+q.w/2-ox} ${q.y+q.h/2-oy}) scale(${PARK_K})">
      ${PARK_LAMPS.map(([x, y], i) => `<g class="park-lamp" data-lamp="${i}"><ellipse class="lamp-pool" cx="${x}" cy="${y + 8}" rx="108" ry="74" fill="url(#lc-pool)"/>${lamp(x, y)}</g>`).join("")}
    </g>`).join("")}
  </svg>`;
}

export function outsideSvg(o: OutsideOpts) {
  const { ox, oy, w, h, building: b, park: p } = o;
  const L = lookFor(o);
  const { season, snow, pal } = L;
  const frozen = o.frozen ?? (season === "winter" && snow >= 0.4);
  const X = (x: number) => x - ox, Y = (y: number) => y - oy;
  const G = o.grounds ?? groundsLayout({ building: b, entranceY: o.entranceY, park: p });
  const grounds = drawGrounds(G, L, o);
  // the park: pond, paths, benches, lamps, flower beds, a few big trees. It is laid out on its
  // plan (PARK_BASE_W x PARK_BASE_H round the same middle) and drawn PARK_K times bigger, so its
  // furniture is at the robots' scale; inPark() wraps plan drawing in that one transform.
  const pcx = X(p.x + p.w / 2), pcy = Y(p.y + p.h / 2), K = PARK_K;
  const pw = p.w / K, ph = p.h / K, px0 = pcx - pw / 2, py0 = pcy - ph / 2, pey = pcy + (Y(o.entranceY) - pcy) / K;
  const inPark = (svg: string) => `<g transform="translate(${n2(pcx)} ${n2(pcy)}) scale(${K}) translate(${n2(-pcx)} ${n2(-pcy)})">${svg}</g>`;
  const toWorld = ([x, y]: [number, number]): [number, number] => [pcx + (x - pcx) * K, pcy + (y - pcy) * K];
  const path = mix(pal.path, SNOW, snow * 0.55), plaza = mix(pal.plaza, SNOW, snow * 0.45);
  const fountainWater = frozen ? "#d3ebf5" : season === "winter" ? "#86bcd4" : "#8fc9e2";
  // the fountain is switched off for the winter
  const jet = season === "winter" ? `<circle cx="${pcx}" cy="${pcy}" r="5" fill="#bcd3dc"/>` : `${spray(pcx, pcy)}<circle class="fountain" cx="${pcx}" cy="${pcy}" r="8" fill="#ffffff" opacity="0.85"/>`;
  // animals: birds hop on the paths now and then (asleep at night), insects come out in the warm
  // months (hiding at night and in strong wind), fireflies glow on summer nights
  const ql = rnd(2024);
  const entrancePath = (t: number): [number, number, number] => {
    const P = [[px0, pey], [pcx - 300, pey], [pcx - 200, pcy], [pcx, pcy]];
    const at = (i: number, u: number) => (1 - u) ** 3 * P[0][i] + 3 * (1 - u) ** 2 * u * P[1][i] + 3 * (1 - u) * u * u * P[2][i] + u ** 3 * P[3][i];
    return [at(0, t), at(1, t), (Math.atan2(at(1, t + 0.01) - at(1, t), at(0, t + 0.01) - at(0, t)) * 180) / Math.PI];
  };
  const birdSpots: [number, number, number, BirdKind][] = [
    [pcx - 8, pcy + 220, 90, "sparrow"], [pcx + 6, pcy - 340, -90, "tit"], [...entrancePath(0.42), "blackbird"],
  ];
  const birds = `<g style="opacity:calc(1.4 - var(--night, 0) * 4.5)">${birdSpots.map(([x, y, a, k]) => {
    const t = timing(ql, 14, 0.25);
    return `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) scale(${SMALL})"><g class="amb-occ" style="${timing(ql, 75, 0.3)}">${bird(k, t)}</g></g>`;
  }).join("")}</g>`;
  let fliers = "";
  if (season === "spring" || season === "summer") {
    // butterflies round the flower beds
    const beds = [[pcx - 235, pcy + 193], [pcx + 265, pcy + 352]];
    const cols = ["#ffd27a", "#4fb6ff"];
    fliers += beds.map(([x, y], i) => {
      const path = loop(x, y, 170, 110, ql, 6, i % 2 ? 1 : -1);
      return `<g class="amb-occ" style="${timing(ql, 55, 0.3)}"><g ${along(path.d, path.len / (16 + ql() * 8), ql())}>${butterfly(cols[i], ql)}</g></g>`;
    }).join("");
  }
  fliers = fliers ? `<g style="opacity:calc(1.4 - var(--night, 0) * 3.4 - var(--wind, 0.2) * 2)">${fliers}</g>` : "";
  if (season === "summer") {
    // two swarms of eight, each drifting and blinking in its own rhythm, spread over the park
    let ff = "";
    for (let g = 0; g < 2; g++) {
      const dots = new Shapes();
      for (let i = 0; i < 8; i++) {
        const x = px0 + 70 + ql() * (pw - 140), y = py0 + 70 + ql() * (ph - 140);
        dots.circle(x, y, 9, fill("#fff3a0", 0.3)); dots.circle(x, y, 2.6, fill("#fffde6"));
      }
      ff += `<g class="amb-ffly" style="${timing(ql, 9, 0.35, `;--fx:${n2((ql() - 0.5) * 50)}px;--fy:${n2((ql() - 0.5) * 40)}px`)}"><g class="amb-blink" style="${timing(ql, 3, 0.4)}">${dots}</g></g>`;
    }
    fliers += `<g style="opacity:calc((var(--lamp, 0) - 0.45) * 2)">${ff}</g>`;
  }
  // the park: its ground and furniture stay still, the rest lives
  const parkTrees = [tree(px0 + 110, py0 + 110, 64, 0, L, 1), tree(px0 + pw - 120, py0 + ph - 120, 70, 1, L, 2), tree(pcx - 320, pcy - 200, 58, 2, L, 3), tree(px0 + pw - 110, py0 + 300, 54, 0, L, 4)];
  const bushes = [bush(pcx - 470, pcy + 230, 40, L), bush(pcx - 200, pcy + 420, 34, L), bush(pcx + 420, pcy + 220, 38, L), bush(pcx + 470, pcy + 260, 30, L)];
  // the lamps stand at the robots' scale, so they are placed in world terms, outside the plan
  const parkLamps = ([[pcx - 60, pcy - 170], [pcx + 60, pcy + 190], [px0 + 120, pey - 110]] as [number, number][]).map(toWorld);
  const beds = [flowers(pcx - 330, pcy + 170, 190, 46, 3, L), flowers(pcx + 120, pcy - 300, 160, 40, 5, L), flowers(pcx + 160, pcy + 330, 210, 44, 9, L)];
  const parkGround = `
    <rect x="${px0}" y="${py0}" width="${pw}" height="${ph}" rx="60" fill="${mix(pal.park[0], SNOW, snow >= 0.95 ? 0.8 : snow * 0.45)}"/>
    <rect x="${px0 + 14}" y="${py0 + 14}" width="${pw - 28}" height="${ph - 28}" rx="50" fill="${mix(pal.park[1], SNOW, snow >= 0.95 ? 0.85 : snow * 0.45)}"/>
    ${snowPatches(px0 + 90, py0 + 90, pw - 180, ph - 180, snow, 99)}
    <path d="M${px0} ${pey} C ${pcx - 300} ${pey} ${pcx - 200} ${pcy} ${pcx} ${pcy}" stroke="${path}" stroke-width="44" fill="none" stroke-linecap="round"/>
    <path d="M${pcx} ${py0 + 40} L${pcx} ${py0 + ph - 40}" stroke="${path}" stroke-width="36" fill="none" stroke-linecap="round"/>
    ${pond(pcx + 260, pcy - 120, L, frozen)}
    <circle cx="${pcx}" cy="${pcy}" r="70" fill="${plaza}"/><circle cx="${pcx}" cy="${pcy}" r="52" fill="${fountainWater}"/><circle cx="${pcx}" cy="${pcy}" r="16" fill="${plaza}"/>
    ${bench(pcx - 150, pcy - 110, L)}${bench(pcx + 80, pcy + 110, L)}${bench(pcx - 150, pcy + 120, L)}
    ${beds.map((b) => b.bed).join("")}
    ${picnic(pcx - 380, pcy + 300, L)}
    ${bushes.map((q) => q.still).join("")}
    ${o.wx?.snowmen ? snowman(pcx - 260, pcy - 360, 1) + snowman(pcx + 520, pcy + 60, 2) : ""}`;
  const park = `${inPark(`
    ${pondShine(pcx + 260, pcy - 120, frozen)}${ducks(pcx + 260, pcy - 120, L, frozen)}
    ${jet}
    ${beds.map((b) => b.blooms).join("")}
    ${bushes.map((q) => q.live).join("")}
    ${birds}
    ${parkTrees.map((q) => q.live).join("")}
    ${fliers}`)}
    ${lampLights([...parkLamps, ...grounds.lamps])}
    ${o.wx?.hot ? `<g style="opacity:calc(1.2 - var(--lamp, 0) * 2)">${inPark(sprinkler(pcx - 430, pcy - 260, 1) + sprinkler(pcx + 420, pcy + 420, 2))}${sprinkler(X(G.walk.x) + 260, Y(G.walk.y) - 230, 3)}</g>` : ""}`;
  // the building: thick outer wall, a shadow, an entrance with steps toward the park
  const bx = X(b.x), by = Y(b.y);
  const shellBody = o.footprint ? `<g transform="translate(${-ox} ${-oy})">
    <path d="${o.footprint.path}" transform="translate(24 34)" fill="#1f2a1a" opacity="0.32"/>
    <path d="${o.footprint.path}" fill="${mix("#4a4f5c", "#c9d3dc", snow * 0.8)}" stroke="${mix("#4a4f5c", "#c9d3dc", snow * 0.8)}" stroke-width="44" stroke-linejoin="round"/>
    <path d="${o.footprint.path}" fill="${mix("#5d6373", SNOW, snow * 0.85)}" stroke="${mix("#5d6373", SNOW, snow * 0.85)}" stroke-width="28" stroke-linejoin="round"/>
    </g>` : `
    <rect x="${bx + 24}" y="${by + 34}" width="${b.w}" height="${b.h}" rx="14" fill="#1f2a1a" opacity="0.32"/>
    <rect x="${bx - 22}" y="${by - 22}" width="${b.w + 44}" height="${b.h + 44}" rx="16" fill="${mix("#4a4f5c", "#c9d3dc", snow * 0.8)}"/>
    <rect x="${bx - 14}" y="${by - 14}" width="${b.w + 28}" height="${b.h + 28}" rx="12" fill="${mix("#5d6373", SNOW, snow * 0.85)}"/>`;
  const shell = `${shellBody}
    <rect x="${bx + b.w - 4}" y="${Y(o.entranceY) - 60}" width="40" height="120" fill="#b9a27e"/>
    <rect x="${bx + b.w + 36}" y="${Y(o.entranceY) - 70}" width="60" height="140" rx="10" fill="${plaza}"/>`;
  const still = `<defs>${patterns(L)}</defs>
    ${grounds.ground}
    ${shell}
    ${inPark(parkGround)}${parkLamps.map(([x, y]) => lampHead(x, y)).join("")}
    ${o.wx && o.puddles ? `<g transform="translate(${-ox} ${-oy})">${puddleSvg(o.puddles, o.wx, { x: ox, y: oy, w, h })}</g>` : ""}
    ${grounds.still}
    ${inPark(parkTrees.map((q) => q.still).join(""))}`;
  const live = `${grounds.live}${park}`;
  const layer = o.layer ?? "all";
  const open = `<svg class="outside season-${season}${layer === "live" ? " outside-live" : ""}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"`;
  if (layer === "still") return `${open}>${still}</svg>`;
  if (layer === "live") return `${open} style="position:absolute;left:0;top:0">${live}</svg>`;
  return `${open}>${still}${live}</svg>`;
}
