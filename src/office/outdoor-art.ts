// Drawing helpers for the outdoors (src/office/outside.ts) and the weather on the ground:
// seeded randomness, colour mixing, merged flat shapes and the trees seen from above.

import type { Season, SeasonPalette } from "../weather/season";
import type { GroundWx } from "../weather/ground";
import { currentTheme } from "../themes/registry";

export const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const SNOW = "#eef4f8";
export const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
export const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

export function mix(a: string, b: string, t: number) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// Animation timing: durations and negative delays are seeded, so a redraw keeps the same timing.
export function timing(q: () => number, dur: number, spread = 0.3, extra = "") {
  const d = dur * (1 - spread + q() * spread * 2);
  return `animation-duration:${n2(d)}s;animation-delay:${n2(-q() * d)}s${extra}`;
}
export const seedAt = (x: number, y: number) => rnd(Math.abs(Math.round(x * 7.31 + y * 13.7)) % 2147483646 + 1);

/** What one drawing pass needs to know about the season. */
export type Look = { pal: SeasonPalette; snow: number; season: Season; /** what the weather does to the ground (wet, frost, heat) */ wx?: GroundWx; /** the interface theme's art settings (themes/registry.ts): moonlit palette, map edge colour */ art?: ThemeArt };
export type ThemeArt = { shade: number; edge?: string };

/** Moonlit art: the same colours sunk toward black by `k`, for every hex colour in a palette. */
export function moonlit<T>(v: T, k: number): T {
  if (typeof v === "string") return (/^#[0-9a-f]{6}$/i.test(v) ? mix(v, "#000000", k) : v) as T;
  if (Array.isArray(v)) return v.map((x) => moonlit(x, k)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([a, b]) => [a, moonlit(b, k)])) as T;
  return v;
}
/** The current interface theme's outdoor art settings, or nothing for the plain season art. */
export function themeArt(): ThemeArt | undefined {
  const w = currentTheme().world;
  return w.artShade > 0 || w.mapEdge ? { shade: w.artShade, edge: w.mapEdge } : undefined;
}

export const fill = (c: string, o?: number) => `fill="${c}"${o == null ? "" : ` opacity="${o}"`}`;
// stroke widths are rounded to half pixels, so branches of similar trees share a path
export const stroke = (c: string, w: number, o?: number) => `fill="none" stroke="${c}" stroke-width="${Math.max(1, Math.round(w * 2) / 2)}" stroke-linecap="round"${o == null ? "" : ` opacity="${o}"`}`;

/**
 * Many flat shapes collected into one path per look (fill, stroke, opacity). Every svg element
 * costs time, so a belt of trees drawn as a few dozen paths stays cheap. With a `cell` size
 * the shapes are also grouped by area, so the browser can skip the paths far from what it draws.
 */
export class Shapes {
  private m = new Map<string, string[]>();
  count = 0;
  /** Drawing order: shapes added with a higher z are drawn over those with a lower one, whatever their colour. */
  z = 0;
  constructor(private cell = 0) {}
  private key(attrs: string, x: number, y: number) { return `${this.z}|${attrs}|${this.cell ? `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}` : ""}`; }
  add(attrs: string, d: string, x = 0, y = 0) {
    const k = this.key(attrs, x, y), a = this.m.get(k);
    if (a) a.push(d); else this.m.set(k, [d]);
    this.count++;
  }
  circle(cx: number, cy: number, r: number, attrs: string) { this.add(attrs, `M${n1(cx - r)} ${n1(cy)}a${n1(r)} ${n1(r)} 0 1 0 ${n1(2 * r)} 0a${n1(r)} ${n1(r)} 0 1 0 ${n1(-2 * r)} 0`, cx, cy); }
  ellipse(cx: number, cy: number, rx: number, ry: number, attrs: string, rot = 0) {
    if (!rot) { this.add(attrs, `M${n1(cx - rx)} ${n1(cy)}a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(2 * rx)} 0a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(-2 * rx)} 0`, cx, cy); return; }
    const c = Math.cos((rot * Math.PI) / 180) * rx, s = Math.sin((rot * Math.PI) / 180) * rx;
    this.add(attrs, `M${n1(cx - c)} ${n1(cy - s)}a${n1(rx)} ${n1(ry)} ${Math.round(rot)} 1 0 ${n1(2 * c)} ${n1(2 * s)}a${n1(rx)} ${n1(ry)} ${Math.round(rot)} 1 0 ${n1(-2 * c)} ${n1(-2 * s)}`, cx, cy);
  }
  rect(x: number, y: number, w: number, h: number, attrs: string, r = 0) {
    if (w <= 0 || h <= 0) return;
    r = Math.min(r, w / 2, h / 2);
    if (!r) { this.add(attrs, `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`, x + w / 2, y + h / 2); return; }
    this.add(attrs, `M${n1(x + r)} ${n1(y)}h${n1(w - 2 * r)}a${n1(r)} ${n1(r)} 0 0 1 ${n1(r)} ${n1(r)}v${n1(h - 2 * r)}a${n1(r)} ${n1(r)} 0 0 1 ${n1(-r)} ${n1(r)}h${n1(-(w - 2 * r))}a${n1(r)} ${n1(r)} 0 0 1 ${n1(-r)} ${n1(-r)}v${n1(-(h - 2 * r))}a${n1(r)} ${n1(r)} 0 0 1 ${n1(r)} ${n1(-r)}z`, x + w / 2, y + h / 2);
  }
  line(x1: number, y1: number, x2: number, y2: number, attrs: string) { this.add(attrs, `M${n1(x1)} ${n1(y1)}L${n1(x2)} ${n1(y2)}`, (x1 + x2) / 2, (y1 + y2) / 2); }
  toString() {
    return [...this.m].map(([k, d], i) => ({ z: Number(k.slice(0, k.indexOf("|"))), i, a: k.split("|")[1], d }))
      .sort((p, q) => p.z - q.z || p.i - q.i).map((e) => `<path ${e.a} d="${e.d.join("")}"/>`).join("");
  }
}

/** One sway group's drawing, back to front: shadows and lower crowns stay, the rest leans. */
export class Grove {
  shadow: Shapes; low: Shapes; top: Shapes; snow: Shapes; hi: Shapes; bloom: Shapes; under: Shapes;
  constructor(cell = 0) {
    this.shadow = new Shapes(cell); this.low = new Shapes(cell); this.top = new Shapes(cell); this.snow = new Shapes(cell);
    this.hi = new Shapes(cell); this.bloom = new Shapes(cell); this.under = new Shapes(cell);
  }
  still() { return `${this.shadow}${this.low}`; }
  moving() { return `${this.top}${this.snow}${this.hi}${this.bloom}`; }
  all() { return `${this.under}${this.still()}${this.moving()}`; }
  get count() { return this.shadow.count + this.low.count + this.top.count + this.snow.count + this.hi.count + this.bloom.count + this.under.count; }
}

export function crown(G: Grove, x: number, y: number, r: number, g: string[], L: Look) {
  const s = L.snow;
  G.shadow.ellipse(x + r * 0.35, y + r * 0.55, r * 1.05, r * 0.7, fill(L.pal.shadow, 0.28));
  G.low.circle(x, y, r, fill(g[0]));
  G.top.circle(x - r * 0.25, y - r * 0.2, r * 0.72, fill(mix(g[1], SNOW, s * 0.55)));
  G.hi.circle(x - r * 0.38, y - r * 0.38, r * 0.36, fill(mix(g[2], SNOW, s * 0.9)));
}

/** A leafless tree from above: a trunk with branches spreading out like a star. `simple` drops the forks. */
export function bareTree(G: Grove, x: number, y: number, r: number, seed: number, L: Look, simple = false) {
  const q = rnd(seed * 7919 + 13);
  const n = simple ? 4 : 6 + Math.floor(q() * 3);
  const sx = r * 0.3, sy = r * 0.45;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + q() * 0.6, len = r * (0.7 + q() * 0.3);
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    const mx = x + Math.cos(a) * len * 0.55, my = y + Math.sin(a) * len * 0.55;
    const b = a + (q() < 0.5 ? 0.6 : -0.6), bl = len * 0.42;
    const d = (ox: number, oy: number) => simple ? `M${n1(x + ox)} ${n1(y + oy)}L${n1(ex + ox)} ${n1(ey + oy)}`
      : `M${n1(x + ox)} ${n1(y + oy)}L${n1(ex + ox)} ${n1(ey + oy)}M${n1(mx + ox)} ${n1(my + oy)}l${n1(Math.cos(b) * bl)} ${n1(Math.sin(b) * bl)}`;
    if (!simple) G.shadow.add(stroke(L.pal.shadow, r * 0.09, 0.2), d(sx, sy), x, y);
    G.top.add(stroke(L.pal.branch, r * 0.09), d(0, 0), x, y);
    if (L.snow > 0 && !simple) G.snow.add(stroke(SNOW, r * 0.05, 0.4 + L.snow * 0.6), `M${n1(x + Math.cos(a) * len * 0.25 - 1.5)} ${n1(y + Math.sin(a) * len * 0.25 - 2)}L${n1(ex - Math.cos(a) * 4 - 1.5)} ${n1(ey - Math.sin(a) * 4 - 2)}`, x, y);
  }
  G.hi.circle(x, y, r * 0.14, fill(mix(L.pal.branch, "#3e3128", 0.3)));
  if (L.snow > 0) G.hi.circle(x - 2, y - 2, r * 0.09, fill(SNOW, L.snow));
}

export function blossoms(G: Grove, x: number, y: number, r: number, seed: number, cols: string[], few = false) {
  const q = rnd(seed * 4241 + 7);
  for (let i = 0, n = few ? 6 : Math.round(10 + r * 0.25); i < n; i++) {
    const a = q() * Math.PI * 2, d = Math.sqrt(q()) * r * 0.85;
    const cx = x + Math.cos(a) * d - r * 0.12, cy = y + Math.sin(a) * d - r * 0.1, rr = (few ? 3.4 : 2.6) + q() * 2.8;
    G.bloom.circle(cx, cy, rr, fill(cols[Math.floor(q() * cols.length)]));
  }
}

// fallen leaves round a tree (autumn)
export function litter(G: Grove, x: number, y: number, r: number, seed: number, cols: string[], count = 14) {
  const q = rnd(seed * 911 + 3);
  for (let i = 0; i < count; i++) {
    const a = q() * Math.PI * 2, d = r * (0.85 + q() * 0.9);
    G.under.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9 + r * 0.2, 3 + q() * 2, 1.8 + q(), fill(cols[Math.floor(q() * cols.length)], 0.85), q() * 180);
  }
}

/**
 * Adds one tree to a grove; returns whether it stands bare. `seed` keeps each tree's seasonal
 * variant stable between redraws, `shade` picks its colours. `light` draws a cheaper tree for the
 * tree belt round the grounds: fewer fallen leaves, blossoms and branches.
 */
export function treeInto(G: Grove, x: number, y: number, r: number, shade: number, L: Look, seed = shade + 1, light = false) {
  const q = rnd(seed * 104729 + 1)();
  const pal = L.pal;
  if (pal.litter.length) litter(G, x, y, r, seed, pal.litter, light ? 2 : 14);
  if (q < pal.bare) { bareTree(G, x, y, r, seed, L, light); return true; }
  crown(G, x, y, r, pal.trees[(shade + (L.season === "autumn" ? seed : 0)) % pal.trees.length], L);
  if (q > 1 - pal.blossom.share) blossoms(G, x, y, r, seed, pal.blossom.colors, light);
  return false;
}

export function bushInto(G: Grove, x: number, y: number, r: number, L: Look) {
  const [a, b, c] = L.pal.bush;
  G.shadow.ellipse(x + 4, y + 5, r * 1.1, r * 0.7, fill(L.pal.shadow, 0.22));
  G.low.circle(x - r * 0.4, y, r * 0.7, fill(a));
  G.low.circle(x + r * 0.4, y + 2, r * 0.65, fill(b));
  G.top.circle(x, y - r * 0.3, r * 0.62, fill(mix(c, SNOW, L.snow * 0.85)));
}
