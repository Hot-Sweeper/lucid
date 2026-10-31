// The outdoors around the building, seen from above: grass, trees, a path from the
// entrance, and a small park next door with a pond, benches and lamps. The look follows the
// season (leaf colours, blossoms, bare trees, flower beds) and how much snow lies.
// The layout never changes with the season: the park robots walk to the same benches, pond
// and picnic spots all year.

import { seasonPalette, type Season, type SeasonPalette } from "../weather/season";
import "./ambient.css";

export const PARK_W = 1300;

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const SNOW = "#eef4f8";

function mix(a: string, b: string, t: number) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// Ambient motion (ambient.css). Every animated element costs main-thread time each frame, so the
// hundreds of trees share a handful of sway groups (PHASES), while the park's few creatures get
// their own loops. Durations and negative delays are seeded, so a redraw keeps the same timing.
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
function timing(q: () => number, dur: number, spread = 0.3, extra = "") {
  const d = dur * (1 - spread + q() * spread * 2);
  return `animation-duration:${n2(d)}s;animation-delay:${n2(-q() * d)}s${extra}`;
}
const seedAt = (x: number, y: number) => rnd(Math.abs(Math.round(x * 7.31 + y * 13.7)) % 2147483646 + 1);
const PHASES = 10;

// What one drawing pass needs to know about the season.
type Look = { pal: SeasonPalette; snow: number; season: Season };

// Many flat shapes collected into one path per look (fill, stroke, opacity): an animated svg costs
// time per element on every frame, so a forest drawn as a few dozen paths stays cheap.
class Shapes {
  private m = new Map<string, string[]>();
  add(attrs: string, d: string) { const a = this.m.get(attrs); if (a) a.push(d); else this.m.set(attrs, [d]); }
  circle(cx: number, cy: number, r: number, attrs: string) { this.add(attrs, `M${n2(cx - r)} ${n2(cy)}a${n2(r)} ${n2(r)} 0 1 0 ${n2(2 * r)} 0a${n2(r)} ${n2(r)} 0 1 0 ${n2(-2 * r)} 0`); }
  ellipse(cx: number, cy: number, rx: number, ry: number, attrs: string) { this.add(attrs, `M${n2(cx - rx)} ${n2(cy)}a${n2(rx)} ${n2(ry)} 0 1 0 ${n2(2 * rx)} 0a${n2(rx)} ${n2(ry)} 0 1 0 ${n2(-2 * rx)} 0`); }
  toString() { return [...this.m].map(([a, d]) => `<path ${a} d="${d.join("")}"/>`).join(""); }
}
// One sway group's drawing, back to front: shadows and lower crowns stay, the rest leans.
class Grove {
  shadow = new Shapes(); low = new Shapes(); top = new Shapes(); snow = new Shapes(); hi = new Shapes(); bloom = new Shapes();
  under = "";
  still() { return `${this.shadow}${this.low}`; }
  moving() { return `${this.top}${this.snow}${this.hi}${this.bloom}`; }
}
const fill = (c: string, o?: number) => `fill="${c}"${o == null ? "" : ` opacity="${o}"`}`;
// stroke widths are rounded to half pixels, so branches of similar trees share a path
const stroke = (c: string, w: number, o?: number) => `fill="none" stroke="${c}" stroke-width="${Math.max(1, Math.round(w * 2) / 2)}" stroke-linecap="round"${o == null ? "" : ` opacity="${o}"`}`;

function crown(G: Grove, x: number, y: number, r: number, g: string[], L: Look) {
  const s = L.snow;
  G.shadow.ellipse(x + r * 0.35, y + r * 0.55, r * 1.05, r * 0.7, fill(L.pal.shadow, 0.28));
  G.low.circle(x, y, r, fill(g[0]));
  G.top.circle(x - r * 0.25, y - r * 0.2, r * 0.72, fill(mix(g[1], SNOW, s * 0.55)));
  G.hi.circle(x - r * 0.38, y - r * 0.38, r * 0.36, fill(mix(g[2], SNOW, s * 0.9)));
}

// A leafless tree from above: a trunk with branches spreading out like a star.
function bareTree(G: Grove, x: number, y: number, r: number, seed: number, L: Look) {
  const q = rnd(seed * 7919 + 13);
  const n = 6 + Math.floor(q() * 3);
  const sx = r * 0.3, sy = r * 0.45;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + q() * 0.6, len = r * (0.7 + q() * 0.3);
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    const mx = x + Math.cos(a) * len * 0.55, my = y + Math.sin(a) * len * 0.55;
    const b = a + (q() < 0.5 ? 0.6 : -0.6), bl = len * 0.42;
    const d = (ox: number, oy: number) => `M${n2(x + ox)} ${n2(y + oy)}L${n2(ex + ox)} ${n2(ey + oy)}M${n2(mx + ox)} ${n2(my + oy)}l${n2(Math.cos(b) * bl)} ${n2(Math.sin(b) * bl)}`;
    G.shadow.add(stroke(L.pal.shadow, r * 0.09, 0.2), d(sx, sy));
    G.top.add(stroke(L.pal.branch, r * 0.09), d(0, 0));
    if (L.snow > 0) G.snow.add(stroke(SNOW, r * 0.05, 0.4 + L.snow * 0.6), `M${n2(x + Math.cos(a) * len * 0.25 - 1.5)} ${n2(y + Math.sin(a) * len * 0.25 - 2)}L${n2(ex - Math.cos(a) * 4 - 1.5)} ${n2(ey - Math.sin(a) * 4 - 2)}`);
  }
  G.hi.circle(x, y, r * 0.14, fill(mix(L.pal.branch, "#3e3128", 0.3)));
  if (L.snow > 0) G.hi.circle(x - 2, y - 2, r * 0.09, fill(SNOW, L.snow));
}

function blossoms(G: Grove, x: number, y: number, r: number, seed: number, cols: string[]) {
  const q = rnd(seed * 4241 + 7);
  for (let i = 0, n = Math.round(10 + r * 0.25); i < n; i++) {
    const a = q() * Math.PI * 2, d = Math.sqrt(q()) * r * 0.85;
    const cx = x + Math.cos(a) * d - r * 0.12, cy = y + Math.sin(a) * d - r * 0.1, rr = 2.6 + q() * 2.8;
    G.bloom.circle(cx, cy, rr, fill(cols[Math.floor(q() * cols.length)]));
  }
}

function litter(x: number, y: number, r: number, seed: number, cols: string[]) {
  const q = rnd(seed * 911 + 3);
  let s = "";
  for (let i = 0; i < 14; i++) {
    const a = q() * Math.PI * 2, d = r * (0.85 + q() * 0.9);
    s += `<ellipse cx="${x + Math.cos(a) * d}" cy="${y + Math.sin(a) * d * 0.9 + r * 0.2}" rx="${3 + q() * 2}" ry="${1.8 + q()}" transform="rotate(${q() * 180} ${x + Math.cos(a) * d} ${y + Math.sin(a) * d * 0.9 + r * 0.2})" fill="${cols[Math.floor(q() * cols.length)]}" opacity="0.85"/>`;
  }
  return s;
}

// Adds one tree to a grove; returns whether it stands bare. `seed` keeps each tree's seasonal
// variant stable between redraws, `shade` picks its colours.
function treeInto(G: Grove, x: number, y: number, r: number, shade: number, L: Look, seed = shade + 1) {
  const q = rnd(seed * 104729 + 1)();
  const pal = L.pal;
  if (pal.litter.length) G.under += litter(x, y, r, seed, pal.litter);
  if (q < pal.bare) { bareTree(G, x, y, r, seed, L); return true; }
  crown(G, x, y, r, pal.trees[(shade + (L.season === "autumn" ? seed : 0)) % pal.trees.length], L);
  if (q > 1 - pal.blossom.share) blossoms(G, x, y, r, seed, pal.blossom.colors);
  return false;
}
// One of the park's big trees, with its own sway: the crown top leans, bare branches twist round the trunk.
function tree(x: number, y: number, r: number, shade: number, L: Look, seed = shade + 1) {
  const G = new Grove(), bare = treeInto(G, x, y, r, shade, L, seed), q = seedAt(x, y);
  const sway = bare ? `class="amb-bare" style="${timing(q, 8, 0.3, `;transform-origin:${n2(x)}px ${n2(y)}px`)}"`
    : `class="amb-tree" style="${timing(q, 7, 0.3, `;--a:${n2(r * (0.035 + q() * 0.025))}px`)}"`;
  return `<g>${G.under}${G.still()}<g ${sway}>${G.moving()}</g></g>`;
}

function bushInto(G: Grove, x: number, y: number, r: number, L: Look) {
  const [a, b, c] = L.pal.bush;
  G.shadow.ellipse(x + 4, y + 5, r * 1.1, r * 0.7, fill(L.pal.shadow, 0.22));
  G.low.circle(x - r * 0.4, y, r * 0.7, fill(a));
  G.low.circle(x + r * 0.4, y + 2, r * 0.65, fill(b));
  G.top.circle(x, y - r * 0.3, r * 0.62, fill(mix(c, SNOW, L.snow * 0.85)));
}
// A park bush that rustles on its own.
function bush(x: number, y: number, r: number, L: Look) {
  const G = new Grove();
  bushInto(G, x, y, r, L);
  return `${G.shadow}<g class="amb-bush" style="${timing(seedAt(x, y), 3.6, 0.35)}">${G.low}${G.top}</g>`;
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
  const fl: string[] = [];
  // the same random walk as always, so summer looks exactly as before; sparser seasons skip some
  for (let i = 0; i < (w * h) / 220; i++) {
    const cx = x + 8 + r() * (w - 16), cy = y + 7 + r() * (h - 14), rr = 2.4 + r() * 1.6, c = r();
    if (((i * 0.618) % 1) >= f.density) continue;
    fl.push(`<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${f.colors[Math.floor(c * f.colors.length)]}"/>`);
  }
  if (f.density > 1) {
    const q = rnd(seed + 99);
    for (let i = 0; i < ((w * h) / 220) * (f.density - 1); i++) fl.push(`<circle cx="${x + 8 + q() * (w - 16)}" cy="${y + 7 + q() * (h - 14)}" r="${2.4 + q() * 1.6}" fill="${f.colors[Math.floor(q() * f.colors.length)]}"/>`);
  }
  // the flowers nod in three groups (runs of the random walk, so each group is spread over the bed)
  const qt = rnd(seed * 31 + 5), n = Math.ceil(fl.length / 3);
  return { bed: s, blooms: [0, 1, 2].map((k) => `<g class="amb-fl" style="${timing(qt, 2.8, 0.3)}">${fl.slice(k * n, k * n + n).join("")}</g>`).join("") };
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
function lamp(x: number, y: number) {
  return `<g><ellipse class="amb-glow" cx="${x}" cy="${y}" rx="70" ry="52" fill="#ffe6b0" style="opacity:calc(var(--lamp) * 0.32);${timing(seedAt(x, y), 4.6, 0.25)}"/>
    <circle cx="${x + 3}" cy="${y + 4}" r="9" fill="#1f2a1a" opacity="0.25"/><circle cx="${x}" cy="${y}" r="8" fill="#3a3f4f"/>
    <circle cx="${x}" cy="${y}" r="4.5" fill="#fff3c9" style="opacity:calc(0.35 + var(--lamp) * 0.65)"/></g>`;
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
  for (let i = 0, n = 10; i < n; i++) {
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
      `<g transform="translate(${cx + dx} ${cy + dy}) rotate(${a})"><g class="amb-sit" style="${timing(q, 4, 0.3)}">${duck(k, true, "#5a7f99")}</g></g>`).join("");
  }
  const q = rnd(L.season === "winter" ? 31 : 17);
  const wake = (k: number) => `<g><path d="M${-12 * k} ${-3 * k} Q${-24 * k} ${-8 * k} ${-38 * k} ${-14 * k} M${-12 * k} ${3 * k} Q${-24 * k} ${8 * k} ${-38 * k} ${14 * k}" stroke="#e8f8ff" stroke-width="${n2(1.8 * Math.max(0.7, k))}" fill="none" stroke-linecap="round"/></g>`;
  const one = (kind: DuckKind, d: string, dur: number, at: number) =>
    `<g ${along(d, dur, at)}>${wake(kind === "chick" ? 0.45 : 1)}<g class="amb-rock" style="${timing(q, 2.6, 0.3)}">${duck(kind)}</g></g>`;
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
  return `<g><g class="amb-flap" style="animation-duration:${n2(0.16 + q() * 0.1)}s">
    <ellipse cx="1.5" cy="-4.6" rx="4" ry="5" fill="${color}"/><ellipse cx="1.5" cy="4.6" rx="4" ry="5" fill="${color}"/>
    <ellipse cx="-3" cy="-3.6" rx="3" ry="3.8" fill="${shade}"/><ellipse cx="-3" cy="3.6" rx="3" ry="3.8" fill="${shade}"/></g>
    <ellipse cx="0" cy="0" rx="5.5" ry="1.2" fill="#3a3f4f"/></g>`;
}

function dragonfly(q: () => number) {
  const wing = (a: number, x: number, sy: number) => `<ellipse cx="${x}" cy="${sy * 6.5}" rx="2.2" ry="6.5" fill="#e6f7ff" transform="rotate(${a * sy} ${x} 0)"/>`;
  return `<g class="amb-buzz" style="animation-duration:${n2(0.07 + q() * 0.04)}s">${wing(-14, 1.5, -1)}${wing(-14, 1.5, 1)}${wing(12, -2.5, -1)}${wing(12, -2.5, 1)}</g>
    <rect x="-13" y="-1" width="16" height="2" rx="1" fill="#2f86d6"/><circle cx="4.5" cy="0" r="2.4" fill="#3a8fd0"/>`;
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
 * - "still": what never moves (grass, snow, fallen leaves, the building shell, the park's lawn,
 *   paths, pond, fountain basin, benches, flower beds and picnic blanket). No animation at all, so
 *   it can be shown as one static image.
 * - "live": what moves (all trees and bushes, flowers, the pond's glint, ducks, fountain spray,
 *   lamps, birds and insects), as a transparent svg of the same size with
 *   `position:absolute;left:0;top:0`, to lay over the "still" one as live page elements. It stays
 *   light (a few hundred elements, about 130 to 200 animations): the trees share PHASES sway groups
 *   and are drawn as a few merged paths per group.
 * "still" under "live" looks like "all".
 */
export type OutsideLayer = "all" | "still" | "live";

// Draw the whole outdoor area. The building occupies (bx, by, bw, bh) in world coordinates;
// the outdoor svg is placed at (ox, oy) and is (w x h) big.
// season: defaults to "summer" (the original look). snowCover: 0 (none) to 1 (fully white).
// frozen: whether the pond is iced over; defaults to winter with at least some snow.
export function outsideSvg(o: {
  ox: number; oy: number; w: number; h: number;
  building: { x: number; y: number; w: number; h: number };
  entranceY: number;
  park: { x: number; y: number; w: number; h: number };
  season?: Season; snowCover?: number; frozen?: boolean;
  /** Extra areas kept free of trees and bushes (other buildings, like the shop). */
  avoid?: { x: number; y: number; w: number; h: number }[];
  /** Which part to draw, see OutsideLayer. Default "all". */
  layer?: OutsideLayer;
}) {
  const { ox, oy, w, h, building: b, park: p } = o;
  const season = o.season ?? "summer";
  const snow = Math.max(0, Math.min(1, o.snowCover ?? 0));
  const frozen = o.frozen ?? (season === "winter" && snow >= 0.4);
  // shadows on snow look cool blue-grey, not green
  const pal0 = seasonPalette(season);
  const pal = snow > 0 ? { ...pal0, shadow: mix(pal0.shadow, "#3a4a68", snow) } : pal0;
  const L: Look = { pal, snow, season };
  const ground = mix(pal.ground, SNOW, snow >= 0.95 ? 0.8 : snow * 0.45);
  const X = (x: number) => x - ox, Y = (y: number) => y - oy;
  const r = rnd(7);
  let grass = "";
  const tuftOp = pal.tuftOpacity * (1 - snow);
  for (let i = 0; i < (w * h) / 5200; i++) {
    const x = r() * w, y = r() * h, op = (0.35 + r() * 0.3) * tuftOp;
    if (op > 0.02) grass += `<path d="M${x} ${y} l2 -6 l2 6" stroke="${pal.tuft}" stroke-width="1.6" fill="none" opacity="${op}" stroke-linecap="round"/>`;
  }
  // trees around the building, never on it, the path or the park
  const blocked = (x: number, y: number, pad: number) =>
    (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) ||
    (x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad) ||
    (y > o.entranceY - 120 && y < o.entranceY + 120 && x > b.x + b.w - 40 && x < p.x + 40) ||
    (o.avoid ?? []).some((a) => x > a.x - pad && x < a.x + a.w + pad && y > a.y - pad && y < a.y + a.h + pad);
  // Each tree joins one of PHASES sway groups: per group, the still bases first, then the leaning
  // tops. Trees of different groups still overlap each other naturally, and the whole forest costs
  // only PHASES animations however many trees there are.
  const groves = Array.from({ length: PHASES }, () => new Grove());
  const rt = rnd(42);
  for (let i = 0, n = Math.round((w * h) / 52000); i < n; i++) {
    const x = ox + rt() * w, y = oy + rt() * h, rr = 34 + rt() * 34;
    if (blocked(x, y, rr + 60)) continue;
    const k = i % PHASES;
    if (rt() < 0.25) {
      bushInto(groves[k], X(x), Y(y), rr * 0.6, L);
    } else {
      treeInto(groves[k], X(x), Y(y), rr, Math.floor(rt() * 3), L, i + 11);
    }
  }
  const qp = rnd(99);
  const trees = groves.map((G) => `${G.still()}<g class="amb-tree" style="${timing(qp, 7, 0.35, `;--a:${n2(1.5 + qp() * 1.1)}px`)}">${G.moving()}</g>`).join("");
  const litterAll = groves.map((G) => G.under).join("");
  // the park: pond, paths, benches, lamps, flower beds, a few big trees
  const pcx = X(p.x + p.w / 2), pcy = Y(p.y + p.h / 2);
  const path = mix(pal.path, SNOW, snow * 0.55), plaza = mix(pal.plaza, SNOW, snow * 0.45);
  const fountainWater = frozen ? "#d3ebf5" : season === "winter" ? "#86bcd4" : "#8fc9e2";
  // the fountain is switched off for the winter
  const jet = season === "winter" ? `<circle cx="${pcx}" cy="${pcy}" r="5" fill="#bcd3dc"/>` : `${spray(pcx, pcy)}<circle class="fountain" cx="${pcx}" cy="${pcy}" r="8" fill="#ffffff" opacity="0.85"/>`;
  // animals: birds hop on the paths now and then (asleep at night), insects come out in the warm
  // months (hiding at night and in strong wind), fireflies glow on summer nights
  const ql = rnd(2024);
  const entrancePath = (t: number): [number, number, number] => {
    const P = [[X(p.x), Y(o.entranceY)], [pcx - 300, Y(o.entranceY)], [pcx - 200, pcy], [pcx, pcy]];
    const at = (i: number, u: number) => (1 - u) ** 3 * P[0][i] + 3 * (1 - u) ** 2 * u * P[1][i] + 3 * (1 - u) * u * u * P[2][i] + u ** 3 * P[3][i];
    return [at(0, t), at(1, t), (Math.atan2(at(1, t + 0.01) - at(1, t), at(0, t + 0.01) - at(0, t)) * 180) / Math.PI];
  };
  const birdSpots: [number, number, number, BirdKind][] = [
    [pcx - 8, pcy + 220, 90, "sparrow"], [pcx + 6, pcy - 340, -90, "tit"], [...entrancePath(0.42), "blackbird"], [pcx - 360, pcy + 412, 186, "sparrow"],
  ];
  const birds = `<g style="opacity:calc(1.4 - var(--night, 0) * 4.5)">${birdSpots.map(([x, y, a, k]) => {
    const t = timing(ql, 14, 0.25);
    return `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)})"><g class="amb-occ" style="${timing(ql, 75, 0.3)}">${bird(k, t)}</g></g>`;
  }).join("")}</g>`;
  let fliers = "";
  if (season === "spring" || season === "summer") {
    // butterflies round the flower beds
    const beds = [[pcx - 235, pcy + 193], [pcx - 235, pcy + 193], [pcx + 265, pcy + 352], [pcx + 265, pcy + 352], [pcx + 200, pcy - 280]];
    const cols = ["#ffd27a", "#ffffff", "#ff9f5a", "#b07cff", "#4fb6ff"];
    fliers += beds.map(([x, y], i) => {
      const path = loop(x, y, 170, 110, ql, 6, i % 2 ? 1 : -1);
      return `<g class="amb-occ" style="${timing(ql, 55, 0.3)}"><g ${along(path.d, path.len / (16 + ql() * 8), ql())}>${butterfly(cols[i], ql)}</g></g>`;
    }).join("");
  }
  if (season === "summer") {
    fliers += [0, 1].map((i) => {
      const path = loop(pcx + 260, pcy - 120, 160, 92, ql, 6, i ? 1 : -1);
      return `<g ${along(path.d, 20 + ql() * 10, ql(), "amb-dart")}>${dragonfly(ql)}</g>`;
    }).join("");
  }
  fliers = fliers ? `<g style="opacity:calc(1.4 - var(--night, 0) * 3.4 - var(--wind, 0.2) * 2)">${fliers}</g>` : "";
  if (season === "summer") {
    // six swarms of five, each drifting and blinking in its own rhythm, spread over the whole park
    let ff = "";
    for (let g = 0; g < 6; g++) {
      let dots = "";
      for (let i = 0; i < 5; i++) {
        const x = X(p.x) + 70 + ql() * (p.w - 140), y = Y(p.y) + 70 + ql() * (p.h - 140);
        dots += `<circle cx="${n2(x)}" cy="${n2(y)}" r="9" fill="#fff3a0" opacity="0.3"/><circle cx="${n2(x)}" cy="${n2(y)}" r="2.6" fill="#fffde6"/>`;
      }
      ff += `<g class="amb-ffly" style="${timing(ql, 9, 0.35, `;--fx:${n2((ql() - 0.5) * 50)}px;--fy:${n2((ql() - 0.5) * 40)}px`)}"><g class="amb-blink" style="${timing(ql, 3, 0.4)}">${dots}</g></g>`;
    }
    fliers += `<g style="opacity:calc((var(--lamp, 0) - 0.45) * 2)">${ff}</g>`;
  }
  // the park: its ground and furniture stay still, the rest lives
  const beds = [flowers(pcx - 330, pcy + 170, 190, 46, 3, L), flowers(pcx + 120, pcy - 300, 160, 40, 5, L), flowers(pcx + 160, pcy + 330, 210, 44, 9, L)];
  const parkGround = `
    <rect x="${X(p.x)}" y="${Y(p.y)}" width="${p.w}" height="${p.h}" rx="60" fill="${mix(pal.park[0], SNOW, snow >= 0.95 ? 0.8 : snow * 0.45)}"/>
    <rect x="${X(p.x) + 14}" y="${Y(p.y) + 14}" width="${p.w - 28}" height="${p.h - 28}" rx="50" fill="${mix(pal.park[1], SNOW, snow >= 0.95 ? 0.85 : snow * 0.45)}"/>
    ${snowPatches(X(p.x) + 90, Y(p.y) + 90, p.w - 180, p.h - 180, snow, 99)}
    <path d="M${X(p.x)} ${Y(o.entranceY)} C ${pcx - 300} ${Y(o.entranceY)} ${pcx - 200} ${pcy} ${pcx} ${pcy}" stroke="${path}" stroke-width="44" fill="none" stroke-linecap="round"/>
    <path d="M${pcx} ${Y(p.y) + 40} L${pcx} ${Y(p.y + p.h) - 40}" stroke="${path}" stroke-width="36" fill="none" stroke-linecap="round"/>
    ${pond(pcx + 260, pcy - 120, L, frozen)}
    <circle cx="${pcx}" cy="${pcy}" r="70" fill="${plaza}"/><circle cx="${pcx}" cy="${pcy}" r="52" fill="${fountainWater}"/><circle cx="${pcx}" cy="${pcy}" r="16" fill="${plaza}"/>
    ${bench(pcx - 150, pcy - 110, L)}${bench(pcx + 80, pcy + 110, L)}${bench(pcx - 150, pcy + 120, L)}
    ${beds.map((b) => b.bed).join("")}
    ${picnic(pcx - 380, pcy + 300, L)}`;
  const park = `
    ${pondShine(pcx + 260, pcy - 120, frozen)}${ducks(pcx + 260, pcy - 120, L, frozen)}
    ${jet}
    ${beds.map((b) => b.blooms).join("")}
    ${bush(pcx - 470, pcy + 230, 40, L)}${bush(pcx - 200, pcy + 420, 34, L)}${bush(pcx + 420, pcy + 220, 38, L)}${bush(pcx + 470, pcy + 260, 30, L)}
    ${lamp(pcx - 60, pcy - 170)}${lamp(pcx + 60, pcy + 190)}${lamp(X(p.x) + 120, Y(o.entranceY) - 60)}
    ${birds}
    ${tree(X(p.x) + 110, Y(p.y) + 110, 64, 0, L, 1)}${tree(X(p.x + p.w) - 120, Y(p.y + p.h) - 120, 70, 1, L, 2)}${tree(pcx - 320, pcy - 200, 58, 2, L, 3)}${tree(X(p.x + p.w) - 110, Y(p.y) + 300, 54, 0, L, 4)}
    ${fliers}`;
  // the building: thick outer wall, a shadow, an entrance with steps toward the park
  const bx = X(b.x), by = Y(b.y);
  const shell = `
    <rect x="${bx + 24}" y="${by + 34}" width="${b.w}" height="${b.h}" rx="14" fill="#1f2a1a" opacity="0.32"/>
    <rect x="${bx - 22}" y="${by - 22}" width="${b.w + 44}" height="${b.h + 44}" rx="16" fill="${mix("#4a4f5c", "#c9d3dc", snow * 0.8)}"/>
    <rect x="${bx - 14}" y="${by - 14}" width="${b.w + 28}" height="${b.h + 28}" rx="12" fill="${mix("#5d6373", SNOW, snow * 0.85)}"/>
    <rect x="${bx + b.w - 4}" y="${Y(o.entranceY) - 60}" width="40" height="120" fill="#b9a27e"/>
    <rect x="${bx + b.w + 36}" y="${Y(o.entranceY) - 70}" width="60" height="140" rx="10" fill="${plaza}"/>
    <rect x="${bx + b.w + 96}" y="${Y(o.entranceY) - 22}" width="${X(p.x) - bx - b.w - 96}" height="44" fill="${path}"/>`;
  const still = `
    <rect width="${w}" height="${h}" fill="${ground}"/>
    ${snowPatches(0, 0, w, h, snow, 321, { x: X(p.x), y: Y(p.y), w: p.w, h: p.h })}
    ${grass}
    ${litterAll}
    ${shell}
    ${parkGround}`;
  const layer = o.layer ?? "all";
  const open = `<svg class="outside season-${season}${layer === "live" ? " outside-live" : ""}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"`;
  if (layer === "still") return `${open}>${still}</svg>`;
  if (layer === "live") return `${open} style="position:absolute;left:0;top:0">${park}${trees}</svg>`;
  return `${open}>${still}${park}${trees}</svg>`;
}
