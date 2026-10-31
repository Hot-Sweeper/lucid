// The outdoors around the building, seen from above: grass, trees, a path from the
// entrance, and a small park next door with a pond, benches and lamps. The look follows the
// season (leaf colours, blossoms, bare trees, flower beds) and how much snow lies.
// The layout never changes with the season: the park robots walk to the same benches, pond
// and picnic spots all year.

import { seasonPalette, type Season, type SeasonPalette } from "../weather/season";

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

// What one drawing pass needs to know about the season.
type Look = { pal: SeasonPalette; snow: number; season: Season };

function crown(x: number, y: number, r: number, g: string[], L: Look) {
  const s = L.snow;
  return `<ellipse cx="${x + r * 0.35}" cy="${y + r * 0.55}" rx="${r * 1.05}" ry="${r * 0.7}" fill="${L.pal.shadow}" opacity="0.28"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${g[0]}"/>
    <circle cx="${x - r * 0.25}" cy="${y - r * 0.2}" r="${r * 0.72}" fill="${mix(g[1], SNOW, s * 0.55)}"/>
    <circle cx="${x - r * 0.38}" cy="${y - r * 0.38}" r="${r * 0.36}" fill="${mix(g[2], SNOW, s * 0.9)}"/>`;
}

// A leafless tree from above: a trunk with branches spreading out like a star.
function bareTree(x: number, y: number, r: number, seed: number, L: Look) {
  const q = rnd(seed * 7919 + 13);
  const n = 6 + Math.floor(q() * 3);
  let shade = "", wood = "", snow = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + q() * 0.6, len = r * (0.7 + q() * 0.3);
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    const mx = x + Math.cos(a) * len * 0.55, my = y + Math.sin(a) * len * 0.55;
    const b = a + (q() < 0.5 ? 0.6 : -0.6), bl = len * 0.42;
    const d = `M${x} ${y} L${ex} ${ey} M${mx} ${my} l${Math.cos(b) * bl} ${Math.sin(b) * bl}`;
    shade += `<path d="${d}" transform="translate(${r * 0.3} ${r * 0.45})"/>`;
    wood += `<path d="${d}"/>`;
    if (L.snow > 0) snow += `<path d="M${x + Math.cos(a) * len * 0.25} ${y + Math.sin(a) * len * 0.25} L${ex - Math.cos(a) * 4} ${ey - Math.sin(a) * 4}" transform="translate(-1.5 -2)"/>`;
  }
  return `<g stroke-linecap="round" fill="none">
    <g stroke="${L.pal.shadow}" stroke-width="${r * 0.09}" opacity="0.2">${shade}</g>
    <g stroke="${L.pal.branch}" stroke-width="${r * 0.09}">${wood}</g>
    ${snow ? `<g stroke="${SNOW}" stroke-width="${r * 0.05}" opacity="${0.4 + L.snow * 0.6}">${snow}</g>` : ""}
    <circle cx="${x}" cy="${y}" r="${r * 0.14}" fill="${mix(L.pal.branch, "#3e3128", 0.3)}" stroke="none"/>
    ${L.snow > 0 ? `<circle cx="${x - 2}" cy="${y - 2}" r="${r * 0.09}" fill="${SNOW}" stroke="none" opacity="${L.snow}"/>` : ""}
  </g>`;
}

function blossoms(x: number, y: number, r: number, seed: number, cols: string[]) {
  const q = rnd(seed * 4241 + 7);
  let s = "";
  for (let i = 0, n = Math.round(10 + r * 0.25); i < n; i++) {
    const a = q() * Math.PI * 2, d = Math.sqrt(q()) * r * 0.85;
    s += `<circle cx="${x + Math.cos(a) * d - r * 0.12}" cy="${y + Math.sin(a) * d - r * 0.1}" r="${2.6 + q() * 2.8}" fill="${cols[Math.floor(q() * cols.length)]}"/>`;
  }
  return s;
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

// `seed` keeps each tree's seasonal variant stable between redraws, `shade` picks its colours.
function tree(x: number, y: number, r: number, shade: number, L: Look, seed = shade + 1) {
  const q = rnd(seed * 104729 + 1)();
  const pal = L.pal;
  const under = pal.litter.length ? litter(x, y, r, seed, pal.litter) : "";
  if (q < pal.bare) return `<g>${under}${bareTree(x, y, r, seed, L)}</g>`;
  const g = pal.trees[(shade + (L.season === "autumn" ? seed : 0)) % pal.trees.length];
  const bloom = q > 1 - pal.blossom.share ? blossoms(x, y, r, seed, pal.blossom.colors) : "";
  return `<g>${under}${crown(x, y, r, g, L)}${bloom}</g>`;
}

function bush(x: number, y: number, r: number, L: Look) {
  const [a, b, c] = L.pal.bush, s = L.snow;
  return `<ellipse cx="${x + 4}" cy="${y + 5}" rx="${r * 1.1}" ry="${r * 0.7}" fill="${L.pal.shadow}" opacity="0.22"/>
    <circle cx="${x - r * 0.4}" cy="${y}" r="${r * 0.7}" fill="${a}"/><circle cx="${x + r * 0.4}" cy="${y + 2}" r="${r * 0.65}" fill="${b}"/><circle cx="${x}" cy="${y - r * 0.3}" r="${r * 0.62}" fill="${mix(c, SNOW, s * 0.85)}"/>`;
}

function flowers(x: number, y: number, w: number, h: number, seed: number, L: Look) {
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
    return `${rim}<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="${(h - 6) / 2}" fill="#8a6a48"/>
      <g stroke="#c9a86a" stroke-width="2" stroke-linecap="round" opacity="0.8">${straw}</g>
      ${L.snow > 0 ? `<rect x="${x + 2}" y="${y + 1}" width="${w - 4}" height="${h - 5}" rx="${(h - 5) / 2}" fill="${SNOW}" opacity="${Math.min(1, L.snow * 1.2)}"/>` : ""}`;
  }
  const bed = L.season === "autumn" ? "#6f7d45" : "#5b8f4e";
  let s = `${rim}<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="${(h - 6) / 2}" fill="${mix(bed, SNOW, L.snow * 0.8)}"/>`;
  // the same random walk as always, so summer looks exactly as before; sparser seasons skip some
  for (let i = 0; i < (w * h) / 220; i++) {
    const cx = x + 8 + r() * (w - 16), cy = y + 7 + r() * (h - 14), rr = 2.4 + r() * 1.6, c = r();
    if (((i * 0.618) % 1) >= f.density) continue;
    s += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${f.colors[Math.floor(c * f.colors.length)]}"/>`;
  }
  if (f.density > 1) {
    const q = rnd(seed + 99);
    for (let i = 0; i < ((w * h) / 220) * (f.density - 1); i++) s += `<circle cx="${x + 8 + q() * (w - 16)}" cy="${y + 7 + q() * (h - 14)}" r="${2.4 + q() * 1.6}" fill="${f.colors[Math.floor(q() * f.colors.length)]}"/>`;
  }
  return s;
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
  return `<g><ellipse cx="${x}" cy="${y}" rx="70" ry="52" fill="#ffe6b0" style="opacity:calc(var(--lamp) * 0.32)"/>
    <circle cx="${x + 3}" cy="${y + 4}" r="9" fill="#1f2a1a" opacity="0.25"/><circle cx="${x}" cy="${y}" r="8" fill="#3a3f4f"/>
    <circle cx="${x}" cy="${y}" r="4.5" fill="#fff3c9" style="opacity:calc(0.35 + var(--lamp) * 0.65)"/></g>`;
}

// The pond, open water or frozen over with a pale sheen and a few cracks.
function pond(cx: number, cy: number, L: Look, frozen: boolean) {
  if (frozen) {
    return `<ellipse cx="${cx}" cy="${cy}" rx="190" ry="120" fill="#9cc3d6"/>
    <ellipse cx="${cx}" cy="${cy}" rx="172" ry="104" fill="#d3ebf5"/>
    <ellipse cx="${cx - 30}" cy="${cy - 20}" rx="120" ry="62" fill="#e6f5fb" opacity="0.8"/>
    <path class="pond-shine" d="M${cx - 110} ${cy - 50} q60 -22 120 -6 M${cx + 10} ${cy + 40} q40 -12 90 -2" stroke="#ffffff" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.85"/>
    <path d="M${cx - 40} ${cy + 10} l30 -14 l26 8 l22 -20 M${cx - 10} ${cy - 4} l-12 30 M${cx + 60} ${cy - 30} l40 -16" stroke="#a9cfe0" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${L.snow > 0.3 ? `<ellipse cx="${cx + 120}" cy="${cy + 50}" rx="54" ry="24" fill="${SNOW}" opacity="${L.snow * 0.9}"/><ellipse cx="${cx - 140}" cy="${cy + 20}" rx="30" ry="40" fill="${SNOW}" opacity="${L.snow * 0.8}"/>` : ""}`;
  }
  const cold = L.season === "winter";
  return `<ellipse cx="${cx}" cy="${cy}" rx="190" ry="120" fill="${cold ? "#5f98b4" : "#6aa9c9"}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="172" ry="104" fill="${cold ? "#71b0cc" : "#7cc1de"}"/>
    <path class="pond-shine" d="M${cx - 90} ${cy - 50} q40 -14 80 0" stroke="#e8f8ff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M${cx + 40} ${cy + 30} q30 -10 60 0" stroke="#e8f8ff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.5"/>
    ${L.pal.lily ? `<circle cx="${cx + 70}" cy="${cy - 20}" r="16" fill="${L.pal.lily}"/><circle cx="${cx - 60}" cy="${cy + 30}" r="12" fill="${L.pal.lily}"/>` : ""}
    ${L.season === "autumn" ? `<ellipse cx="${cx - 20}" cy="${cy + 52}" rx="4" ry="2.4" fill="#e08a3c"/><ellipse cx="${cx + 110}" cy="${cy - 30}" rx="4" ry="2.4" fill="#c95a3c" transform="rotate(40 ${cx + 110} ${cy - 30})"/><ellipse cx="${cx - 100}" cy="${cy + 6}" rx="4" ry="2.4" fill="#e2b941"/>` : ""}`;
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
    (y > o.entranceY - 120 && y < o.entranceY + 120 && x > b.x + b.w - 40 && x < p.x + 40);
  let trees = "";
  const rt = rnd(42);
  for (let i = 0, n = Math.round((w * h) / 52000); i < n; i++) {
    const x = ox + rt() * w, y = oy + rt() * h, rr = 34 + rt() * 34;
    if (blocked(x, y, rr + 60)) continue;
    trees += rt() < 0.25 ? bush(X(x), Y(y), rr * 0.6, L) : tree(X(x), Y(y), rr, Math.floor(rt() * 3), L, i + 11);
  }
  // the park: pond, paths, benches, lamps, flower beds, a few big trees
  const pcx = X(p.x + p.w / 2), pcy = Y(p.y + p.h / 2);
  const path = mix(pal.path, SNOW, snow * 0.55), plaza = mix(pal.plaza, SNOW, snow * 0.45);
  const fountainWater = frozen ? "#d3ebf5" : season === "winter" ? "#86bcd4" : "#8fc9e2";
  // the fountain is switched off for the winter
  const jet = season === "winter" ? `<circle cx="${pcx}" cy="${pcy}" r="5" fill="#bcd3dc"/>` : `<circle class="fountain" cx="${pcx}" cy="${pcy}" r="8" fill="#ffffff" opacity="0.85"/>`;
  const park = `
    <rect x="${X(p.x)}" y="${Y(p.y)}" width="${p.w}" height="${p.h}" rx="60" fill="${mix(pal.park[0], SNOW, snow >= 0.95 ? 0.8 : snow * 0.45)}"/>
    <rect x="${X(p.x) + 14}" y="${Y(p.y) + 14}" width="${p.w - 28}" height="${p.h - 28}" rx="50" fill="${mix(pal.park[1], SNOW, snow >= 0.95 ? 0.85 : snow * 0.45)}"/>
    ${snowPatches(X(p.x) + 90, Y(p.y) + 90, p.w - 180, p.h - 180, snow, 99)}
    <path d="M${X(p.x)} ${Y(o.entranceY)} C ${pcx - 300} ${Y(o.entranceY)} ${pcx - 200} ${pcy} ${pcx} ${pcy}" stroke="${path}" stroke-width="44" fill="none" stroke-linecap="round"/>
    <path d="M${pcx} ${Y(p.y) + 40} L${pcx} ${Y(p.y + p.h) - 40}" stroke="${path}" stroke-width="36" fill="none" stroke-linecap="round"/>
    ${pond(pcx + 260, pcy - 120, L, frozen)}
    <circle cx="${pcx}" cy="${pcy}" r="70" fill="${plaza}"/><circle cx="${pcx}" cy="${pcy}" r="52" fill="${fountainWater}"/><circle cx="${pcx}" cy="${pcy}" r="16" fill="${plaza}"/>
    ${jet}
    ${bench(pcx - 150, pcy - 110, L)}${bench(pcx + 80, pcy + 110, L)}${bench(pcx - 150, pcy + 120, L)}
    ${flowers(pcx - 330, pcy + 170, 190, 46, 3, L)}${flowers(pcx + 120, pcy - 300, 160, 40, 5, L)}
    ${picnic(pcx - 380, pcy + 300, L)}${flowers(pcx + 160, pcy + 330, 210, 44, 9, L)}
    ${bush(pcx - 470, pcy + 230, 40, L)}${bush(pcx - 200, pcy + 420, 34, L)}${bush(pcx + 420, pcy + 220, 38, L)}${bush(pcx + 470, pcy + 260, 30, L)}
    ${lamp(pcx - 60, pcy - 170)}${lamp(pcx + 60, pcy + 190)}${lamp(X(p.x) + 120, Y(o.entranceY) - 60)}
    ${tree(X(p.x) + 110, Y(p.y) + 110, 64, 0, L, 1)}${tree(X(p.x + p.w) - 120, Y(p.y + p.h) - 120, 70, 1, L, 2)}${tree(pcx - 320, pcy - 200, 58, 2, L, 3)}${tree(X(p.x + p.w) - 110, Y(p.y) + 300, 54, 0, L, 4)}`;
  // the building: thick outer wall, a shadow, an entrance with steps toward the park
  const bx = X(b.x), by = Y(b.y);
  const shell = `
    <rect x="${bx + 24}" y="${by + 34}" width="${b.w}" height="${b.h}" rx="14" fill="#1f2a1a" opacity="0.32"/>
    <rect x="${bx - 22}" y="${by - 22}" width="${b.w + 44}" height="${b.h + 44}" rx="16" fill="${mix("#4a4f5c", "#c9d3dc", snow * 0.8)}"/>
    <rect x="${bx - 14}" y="${by - 14}" width="${b.w + 28}" height="${b.h + 28}" rx="12" fill="${mix("#5d6373", SNOW, snow * 0.85)}"/>
    <rect x="${bx + b.w - 4}" y="${Y(o.entranceY) - 60}" width="40" height="120" fill="#b9a27e"/>
    <rect x="${bx + b.w + 36}" y="${Y(o.entranceY) - 70}" width="60" height="140" rx="10" fill="${plaza}"/>
    <rect x="${bx + b.w + 96}" y="${Y(o.entranceY) - 22}" width="${X(p.x) - bx - b.w - 96}" height="44" fill="${path}"/>`;
  return `<svg class="outside season-${season}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <rect width="${w}" height="${h}" fill="${ground}"/>
    ${snowPatches(0, 0, w, h, snow, 321, { x: X(p.x), y: Y(p.y), w: p.w, h: p.h })}
    ${grass}
    ${shell}
    ${park}
    ${trees}
  </svg>`;
}
