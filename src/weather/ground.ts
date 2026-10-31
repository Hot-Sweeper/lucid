// What the weather does to the ground, as opposed to what falls from the sky (effects.ts):
// puddles that dry up after the rain, wet dark paths, frost, snowmen, a summer heat look.
//
// Everything here is drawn into the outdoors' still image (src/office/outside.ts), so it only
// costs time when the weather changes class. groundWx() says which class we are in; its values
// are coarse on purpose (puddles in quarters) so the still image is redrawn only a few times
// while the puddles dry.

import type { Weather } from "./types";
import { PARK_K, type Grounds, type Rect } from "../office/grounds";
import { Shapes, fill, mix, n1, rnd } from "../office/outdoor-art";

export type GroundWx = {
  /** How much of the puddles is left, 0 (dry) to 1 (just rained), in quarters. */
  puddles: number;
  /** Rain is falling right now: ripples, umbrellas. */
  raining: boolean;
  /** Below 3 degrees: frosted lawns, breath puffs, scarves. */
  frost: boolean;
  /** At or below 0 degrees: puddles turn to ice. */
  ice: boolean;
  /** Above 26 degrees: sprinklers, sun hats, heat shimmer, sun-bleached grass. */
  hot: boolean;
  /** Enough snow lies to build a snowman. */
  snowmen: boolean;
};

export const DRY_MS = 20 * 60 * 1000;
const WET = new Set(["rain", "drizzle", "storm"]);
export const isWet = (w: Weather | null) => !!w && WET.has(w.kind);

/** dry: when the rain stopped and how much puddle there was then (null if it has not rained). */
export function groundWx(w: Weather | null, snowCover: number, dry: { at: number; level: number } | null, now = Date.now()): GroundWx {
  const raining = isWet(w);
  const t = w?.tempC;
  let puddles = 0;
  if (raining) puddles = w!.kind === "drizzle" ? 0.5 : 1;
  else if (dry && w?.kind !== "snow") {
    const left = dry.level * (1 - (now - dry.at) / DRY_MS);
    puddles = left > 0 ? Math.ceil(left * 4) / 4 : 0;
  }
  return {
    puddles,
    raining,
    frost: t != null && t < 3,
    ice: t != null && t <= 0,
    hot: t != null && t > 26 && w?.kind !== "snow",
    snowmen: snowCover >= 0.5,
  };
}

/** A string that changes only when the ground has to be drawn again. */
export const groundSig = (g: GroundWx) => `${g.puddles}|${+g.raining}|${+g.frost}|${+g.ice}|${+g.hot}|${+g.snowmen}`;

/** The season palette as the weather leaves the ground: darker when wet, rimed in frost, bleached in heat. */
export function weatherPal<P extends { ground: string; tuft: string; park: [string, string]; path: string; plaza: string }>(pal: P, g: GroundWx | undefined, snow: number): P {
  if (!g) return pal;
  let k = 0, to = "";
  if (g.puddles > 0) { k = 0.12 + g.puddles * 0.1; to = "#3f6a48"; }
  else if (g.hot) { k = 0.26; to = "#c2b562"; }
  else if (g.frost && snow < 0.3) { k = 0.3; to = "#c8d8d4"; }
  if (!k) return pal;
  const wetPath = g.puddles > 0 ? 0.12 + g.puddles * 0.14 : 0;
  return {
    ...pal,
    ground: mix(pal.ground, to, k), tuft: mix(pal.tuft, to, k * 0.6),
    park: [mix(pal.park[0], to, k), mix(pal.park[1], to, k)],
    path: wetPath ? mix(pal.path, "#8d8170", wetPath) : pal.path,
    plaza: wetPath ? mix(pal.plaza, "#857a6a", wetPath) : pal.plaza,
  };
}

// --- puddles -----------------------------------------------------------------------------------

/** A puddle spot. `on`: 0 deep (a hollow by the paving), 1 paving or path, 2 grass. `keep` decides which ones dry up first. */
export type Puddle = { x: number; y: number; r: number; rot: number; on: 0 | 1 | 2; keep: number; seed: number };

/** Where puddles form: on the walk and the shop's forecourt, the plaza, the lawns and in the park. Stable for a layout. */
export function puddleSpots(G: Grounds, building: Rect, park: Rect, entranceY: number): Puddle[] {
  const q = rnd(4242);
  const out: Puddle[] = [];
  const put = (x: number, y: number, r: number, on: 0 | 1 | 2, rot = q() * 40 - 20) => out.push({ x, y, r, rot, on, keep: q(), seed: Math.floor(q() * 1e6) });
  // the walk: along its length, and the deeper ones where the paving dips at its edges
  const w = G.walk;
  for (let t = 90 + q() * 80; t < w.w - 60; t += 190 + q() * 170) put(w.x + t, w.y + w.h / 2 + (q() - 0.5) * w.h * 0.5, 13 + q() * 10, 1, q() * 16 - 8);
  for (let t = 160 + q() * 120; t < w.w - 100; t += 420 + q() * 260) put(w.x + t, q() < 0.5 ? w.y + 14 : w.y + w.h - 14, 18 + q() * 10, 0, q() * 10 - 5);
  if (G.forecourt) { const f = G.forecourt; put(f.x + f.w * (0.2 + q() * 0.2), f.y + f.h * 0.55, 16 + q() * 8, 1); put(f.x + f.w * (0.65 + q() * 0.2), f.y + f.h * 0.4, 12 + q() * 6, 1); }
  if (G.plazaPath) put(G.plazaPath.x + 30, G.plazaPath.y + G.plazaPath.h * 0.6, 12 + q() * 6, 1, 90);
  if (G.plaza) put(G.plaza.x + 92, G.plaza.y + 40, 16 + q() * 8, 1, 30);
  // hollows in the lawn round the building, clear of the walls and the walk
  const L = G.lawn;
  for (let i = 0, n = 0; i < 80 && n < 9; i++) {
    const x = L.x + 80 + q() * (L.w - 160), y = L.y + 80 + q() * (L.h - 160);
    const inside = (r: Rect, pad: number) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
    if (inside(building, 90) || inside(park, 40) || inside(w, 60) || (G.forecourt && inside(G.forecourt, 80)) || (G.plaza && Math.hypot(x - G.plaza.x, y - G.plaza.y) < G.plaza.r + 60)) continue;
    put(x, y, 22 + q() * 18, 2); n++;
  }
  // the park: on its paths and in hollows of the lawn, away from the pond, fountain, benches and beds.
  // The park is drawn on a plan PARK_K times smaller (outside.ts): place them on the plan, then scale out.
  const from = out.length;
  const pcx = park.x + park.w / 2, pcy = park.y + park.h / 2;
  const cx = pcx, cy = pcy;
  park = { x: pcx - park.w / PARK_K / 2, y: pcy - park.h / PARK_K / 2, w: park.w / PARK_K, h: park.h / PARK_K };
  entranceY = pcy + (entranceY - pcy) / PARK_K;
  for (const y of [park.y + 130, park.y + 260, cy + 190, cy + 330, park.y + park.h - 110]) put(cx + (q() - 0.5) * 10, y, 13 + q() * 7, 1, 90 + q() * 20 - 10);
  for (const t of [0.22, 0.5, 0.78]) {
    const u = 1 - t, x0 = park.x, y0 = entranceY;
    const x = u * u * u * x0 + 3 * u * u * t * (cx - 300) + 3 * u * t * t * (cx - 200) + t * t * t * cx;
    const y = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * cy + t * t * t * cy;
    put(x, y, 14 + q() * 6, 1);
  }
  const blocked = (x: number, y: number) => Math.hypot((x - (cx + 260)) / 230, (y - (cy - 120)) / 160) < 1 || Math.hypot(x - cx, y - cy) < 130 ||
    Math.abs(x - cx) < 60 || (x > cx - 460 && x < cx - 220 && y > cy + 260 && y < cy + 420) || (x > cx - 360 && x < cx - 110 && y > cy + 140 && y < cy + 240) ||
    (x > cx + 100 && x < cx + 400 && (y > cy + 300 && y < cy + 400 || y > cy - 330 && y < cy - 240)) || (x > cx - 190 && x < cx + 180 && Math.abs(y - cy) < 170 && Math.abs(Math.abs(y - cy) - 120) < 40);
  for (let i = 0, n = 0; i < 60 && n < 7; i++) {
    const x = park.x + 120 + q() * (park.w - 240), y = park.y + 120 + q() * (park.h - 240);
    if (blocked(x, y) || Math.abs(y - entranceY) < 50) continue;
    put(x, y, 20 + q() * 18, 2); n++;
  }
  for (const d of out.slice(from)) { d.x = pcx + (d.x - pcx) * PARK_K; d.y = pcy + (d.y - pcy) * PARK_K; d.r *= PARK_K; }
  return out;
}

/** The puddles for the still image, in world coordinates. `level` 0 to 1 shrinks them and dries the small ones first. */
export function puddleSvg(list: Puddle[], g: GroundWx, view: Rect): string {
  const level = g.puddles;
  if (level <= 0) return "";
  const water = new Shapes(1800), hi = new Shapes(1800), mud = new Shapes(1800);
  const ice = g.ice;
  const body = [
    fill(ice ? "#dfeef6" : "#7f93ab", ice ? 0.85 : 0.62),
    fill(ice ? "#e4f1f7" : "#90a6bd", ice ? 0.85 : 0.6),
    fill(ice ? "#e1eff5" : "#7fa1b6", ice ? 0.85 : 0.66),
  ];
  const shine = `fill="none" stroke="#f4f9ff" stroke-width="3" stroke-linecap="round" opacity="${ice ? 0.95 : 0.55}"`;
  for (const p of list) {
    if (p.keep > level + 0.2) continue;   // the small, shallow ones are gone first
    if (p.x < view.x - 60 || p.x > view.x + view.w + 60 || p.y < view.y - 60 || p.y > view.y + view.h + 60) continue;
    const q = rnd(p.seed + 1);
    const r = p.r * (0.45 + 0.55 * level);
    const a = (p.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const lobes = 2 + Math.floor(q() * 2);
    // a puddle is a few overlapping lobes along its long side
    if (p.on === 2) mud.ellipse(p.x + 2, p.y + 2, r * 1.5, r * 0.8, fill("#4f5a3a", 0.22), p.rot);
    for (let i = 0; i < lobes; i++) {
      const d = (i - (lobes - 1) / 2) * r * 0.75 + (q() - 0.5) * r * 0.3, side = (q() - 0.5) * r * 0.35;
      water.ellipse(p.x + ca * d - sa * side, p.y + sa * d + ca * side, r * (0.65 + q() * 0.25), r * (0.42 + q() * 0.18), body[p.on], p.rot + (q() - 0.5) * 30);
    }
    // the sky's glint on the water
    const hx = p.x - ca * r * 0.4 - sa * -r * 0.12, hy = p.y - sa * r * 0.4 + ca * -r * 0.12;
    hi.add(shine, `M${n1(hx)} ${n1(hy)}l${n1(ca * r * 0.55)} ${n1(sa * r * 0.55)}`, hx, hy);
  }
  return `${mud}${water}${hi}`;
}

// --- snowmen and sprinklers --------------------------------------------------------------------

const SCARF = ["#e2626b", "#4fb6ff", "#ffd27a", "#3fbf86", "#b07cff"];
/** A snowman seen from above and a little from the front, like the trees: three balls, a carrot, a scarf. */
export function snowman(x: number, y: number, seed: number) {
  const q = rnd(seed * 31 + 7), scarf = SCARF[Math.floor(q() * SCARF.length)], hat = q() < 0.5;
  const lean = (q() - 0.5) * 8;
  return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(lean)})">
    <ellipse cx="10" cy="14" rx="30" ry="14" fill="#3a4a68" opacity="0.2"/>
    <circle cx="0" cy="0" r="24" fill="#dfe8f0"/><circle cx="-4" cy="-4" r="19" fill="#f6f9fc"/>
    <path d="M-14 -20 L-40 -34 M-36 -32 l-6 -6 M14 -20 L40 -32 M36 -30 l5 -7" stroke="#6b5646" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="0" cy="-22" r="17" fill="#dfe8f0"/><circle cx="-3" cy="-25" r="13" fill="#f6f9fc"/>
    <circle cx="0" cy="-17" r="2" fill="#3a3f4f"/><circle cx="0" cy="-26" r="2" fill="#3a3f4f"/>
    <path d="M-15 -34 Q0 -28 15 -34 L14 -40 Q0 -35 -14 -40 Z" fill="${scarf}"/><path d="M8 -36 l4 16 l6 -1 l-3 -15 Z" fill="${mix(scarf, "#000000", 0.15)}"/>
    <circle cx="0" cy="-44" r="12" fill="#dfe8f0"/><circle cx="-2" cy="-46" r="9.5" fill="#f6f9fc"/>
    <circle cx="-4" cy="-46" r="1.7" fill="#3a3f4f"/><circle cx="4" cy="-46" r="1.7" fill="#3a3f4f"/>
    <path d="M-1 -42 L10 -39 L-1 -40 Z" fill="#ff8a3c"/>
    ${hat ? `<rect x="-11" y="-58" width="22" height="5" rx="2" fill="#2d3142"/><rect x="-7" y="-70" width="14" height="13" rx="2" fill="#2d3142"/><rect x="-7" y="-61" width="14" height="3" fill="${scarf}"/>`
      : `<path d="M-11 -52 Q0 -68 11 -52 Z" fill="${scarf}"/><circle cx="0" cy="-64" r="4" fill="#ffffff"/>`}
  </g>`;
}

/** A lawn sprinkler, live: its fan of water swings back and forth (CSS, see weather.css). */
export function sprinkler(x: number, y: number, seed: number) {
  const q = rnd(seed * 17 + 3);
  let drops = "";
  for (let i = 0; i < 9; i++) {
    const d = 30 + i * 11, w = (q() - 0.5) * 8;
    drops += `M${n1(d)} ${n1(w - 1.6)}a1.6 1.6 0 1 0 0.01 0`;
  }
  return `<g transform="translate(${n1(x)} ${n1(y)})">
    <circle r="70" fill="#4f8f5a" opacity="0.16"/>
    <g class="wx-sprinkle" style="animation-duration:${n1(2.6 + q() * 1.2)}s;animation-delay:${n1(-q() * 3)}s">
      <path d="M8 -3 Q50 -12 118 -4 L118 4 Q50 12 8 3 Z" fill="#e8f6ff" opacity="0.4"/>
      <path d="${drops}" fill="none" stroke="#f2fbff" stroke-width="3.2" stroke-linecap="round"/>
    </g>
    <circle r="7" fill="#3a3f4f"/><circle r="3.4" fill="#ffd27a"/>
  </g>`;
}
