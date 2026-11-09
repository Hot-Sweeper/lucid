// Office decoration pack: floors, wall colors and unlockable decorations, drawn as SVG strings
// for the fake top-down rooms in src/office/world.ts (north wall face at the top, floor below).
//
// Conventions
// - Every function returns SVG elements without an <svg> wrapper, in room pixels.
// - Wall items (spot "wall") are anchored at the wall base: (x, wallFace) is the bottom center,
//   and they are drawn upward on the wall face.
// - Standing items (spot "corner") are anchored at their front bottom center, the point where
//   they touch the floor, so items further down the room are drawn later and overlap correctly.
// - Flat floor items (spot "floor") are anchored at their center.
// - scale 1 is the natural size next to a 400x380 desk unit.
// - Glows get stronger at night through the room's --lamp variable (0 by day, 1 at night).
// - Optional motion uses classes prefixed dc- (see decor.css). Nothing depends on it.

export type FloorId = "wood" | "oak" | "carpet" | "tiles" | "concrete" | "terrazzo";
export type WallId = "warm" | "cool" | "mint" | "lilac" | "dusk" | "brick";
export type DecorId = "plants" | "rug" | "posters" | "bookshelf" | "coffee" | "water" | "arcade" | "aquarium" | "neon" | "beanbags" | "pingpong" | "trophies"
  | "pumpkins" | "leafwreath" | "xmastree" | "stringlights" | "snowglobe" | "tulips" | "kite" | "deskfan" | "palm" | "beachposter";
export type DecorSeason = "spring" | "summer" | "autumn" | "winter";
type Spot = "wall" | "corner" | "floor";
type Rect = { x: number; y: number; w: number; h: number };

export const FLOORS: Record<FloorId, { name: string }> = {
  wood: { name: "Honey planks" },
  oak: { name: "Oak parquet" },
  carpet: { name: "Carpet tiles" },
  tiles: { name: "Ceramic tiles" },
  concrete: { name: "Polished concrete" },
  terrazzo: { name: "Terrazzo" },
};

export const WALLS: Record<WallId, { name: string; face: string; trim: string }> = {
  warm: { name: "Warm white", face: "#ece6da", trim: "#d8cfbf" },
  cool: { name: "Cool grey", face: "#e4e7ee", trim: "#cdd2dc" },
  mint: { name: "Mint", face: "#dcebe1", trim: "#bfd6c7" },
  lilac: { name: "Lilac", face: "#e7dff0", trim: "#cfc3de" },
  dusk: { name: "Dusk blue", face: "#4d5675", trim: "#3c4460" },
  brick: { name: "Brick", face: "#c47a5a", trim: "#e6dccb" },
};

// Seasonal items (with `season`) are sold only in their season; they need no company level.
export const DECOR: Record<DecorId, { name: string; unlockAt: number; spot: Spot; season?: DecorSeason }> = {
  plants: { name: "Potted plants", unlockAt: 0, spot: "corner" },
  rug: { name: "Rug", unlockAt: 0, spot: "floor" },
  posters: { name: "Robot posters", unlockAt: 1, spot: "wall" },
  coffee: { name: "Coffee machine", unlockAt: 2, spot: "corner" },
  water: { name: "Water cooler", unlockAt: 3, spot: "corner" },
  bookshelf: { name: "Bookshelf", unlockAt: 4, spot: "corner" },
  beanbags: { name: "Beanbags", unlockAt: 5, spot: "floor" },
  trophies: { name: "Trophy shelf", unlockAt: 6, spot: "wall" },
  arcade: { name: "Arcade cabinet", unlockAt: 8, spot: "corner" },
  neon: { name: "Neon sign", unlockAt: 9, spot: "wall" },
  aquarium: { name: "Aquarium", unlockAt: 10, spot: "corner" },
  pingpong: { name: "Ping pong table", unlockAt: 10, spot: "floor" },
  pumpkins: { name: "Pumpkins", unlockAt: 0, spot: "corner", season: "autumn" },
  leafwreath: { name: "Leaf wreath", unlockAt: 0, spot: "wall", season: "autumn" },
  xmastree: { name: "Christmas tree", unlockAt: 0, spot: "corner", season: "winter" },
  stringlights: { name: "String lights", unlockAt: 0, spot: "wall", season: "winter" },
  snowglobe: { name: "Snow globe", unlockAt: 0, spot: "corner", season: "winter" },
  tulips: { name: "Tulip planter", unlockAt: 0, spot: "corner", season: "spring" },
  kite: { name: "Kite", unlockAt: 0, spot: "wall", season: "spring" },
  deskfan: { name: "Standing fan", unlockAt: 0, spot: "corner", season: "summer" },
  palm: { name: "Potted palm", unlockAt: 0, spot: "corner", season: "summer" },
  beachposter: { name: "Beach poster", unlockAt: 0, spot: "wall", season: "summer" },
};

/** Every decoration, seasonal ones included, in unlock order. */
export const DECOR_IDS = (Object.keys(DECOR) as DecorId[]).sort((a, b) => DECOR[a].unlockAt - DECOR[b].unlockAt);
/** The regular (non-seasonal) decorations unlocked at a company level (0..10). */
export function unlockedDecor(level: number): DecorId[] { return DECOR_IDS.filter((id) => !DECOR[id].season && DECOR[id].unlockAt <= level); }
/** Seasonal decorations, all of them or those of one season. */
export function seasonalDecor(season?: DecorSeason): DecorId[] { return DECOR_IDS.filter((id) => DECOR[id].season && (!season || DECOR[id].season === season)); }

// ---------------------------------------------------------------------------------------------
// small helpers

let seq = 0;
const uid = (p: string) => `dc${p}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const f = (v: number) => (Math.round(v * 10) / 10).toString();
const op = (o?: number) => (o == null || o === 1 ? "" : ` opacity="${o}"`);
// Theme tokens (var(...)) cannot sit in a fill attribute, so they go in a style.
const paint = (fill: string) => fill.startsWith("var(") ? `style="fill:${fill}"` : `fill="${fill}"`;
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0, o?: number, extra = "") =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ""} ${paint(fill)}${op(o)}${extra}/>`;
const ell = (cx: number, cy: number, rx: number, ry: number, fill: string, o?: number, extra = "") =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${op(o)}${extra}/>`;
const circ = (cx: number, cy: number, r: number, fill: string, o?: number, extra = "") =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${op(o)}${extra}/>`;
const path = (d: string, fill: string, o?: number, extra = "") => `<path d="${d}" fill="${fill}"${op(o)}${extra}/>`;
const line = (d: string, color: string, width: number, o?: number) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${op(o)}/>`;
const SH = "#2b1d10"; // shadow tint, as used by desks and plants in world.ts
const nightGlow = (base: number) => ` style="opacity:calc(${base} + var(--lamp, 0.15) * ${f(1 - base)})"`;
// A loop's own pivot (in item pixels) and a random start, so several items never move in step.
const pivot = (x: number, y: number, dur?: number) =>
  ` style="transform-origin:${f(x)}px ${f(y)}px;animation-delay:${f(-Math.random() * 6)}s${dur ? `;animation-duration:${f(dur)}s` : ""}"`;
const FONT = ` style="font-family:var(--font, system-ui, sans-serif)"`;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A leaf pointing up from its base, split in a light and a shaded half.
function leaf(bx: number, by: number, ang: number, len: number, wid: number, fill: string, shade: string) {
  const L = `M0 0 C${f(-wid)} ${f(-len * 0.22)} ${f(-wid * 0.85)} ${f(-len * 0.78)} 0 ${f(-len)} Z`;
  const R = `M0 0 C${f(wid)} ${f(-len * 0.22)} ${f(wid * 0.85)} ${f(-len * 0.78)} 0 ${f(-len)} Z`;
  return `<g transform="translate(${f(bx)} ${f(by)}) rotate(${f(ang)})">${path(L, fill)}${path(R, shade)}</g>`;
}

function star(cx: number, cy: number, r: number, inner = 0.45) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
    pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join(" L")} Z`;
}

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${f(x + r)} ${f(y)} H${f(x + w - r)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} V${f(y + h - r)} Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} H${f(x + r)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;

// ---------------------------------------------------------------------------------------------
// floors

/** Floor pattern for the room area below the wall face (x 0..w, y top..h). */
// Purchased floors and walls keep their pattern; a theme can lay its shade over them
// (--wd-bought-shade, 0 by default). The free starters follow the theme tokens instead.
const boughtShade = (y: number, w: number, h: number) => `<rect x="0" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#000" style="opacity:var(--wd-bought-shade, 0)"/>`;
export function drawFloor(id: FloorId, w: number, h: number, top: number): string {
  return floorArt(id, w, h, top) + (id === "wood" ? "" : boughtShade(top, w, h - top));
}
function floorArt(id: FloorId, w: number, h: number, top: number): string {
  const p = uid("f");
  const area = (fill: string) => rect(0, top, w, h - top, fill);
  const pat = (pw: number, ph: number, body: string) =>
    `<defs><pattern id="${p}" patternUnits="userSpaceOnUse" x="0" y="${f(top)}" width="${pw}" height="${ph}">${body}</pattern></defs>`;
  const r = rng(id.length * 7919 + 13);

  if (id === "wood") {
    // honey planks, 26px rows, staggered seams, a few planks lighter or darker. The free
    // starter floor follows the interface theme's default floor (--wd-floor, --wd-seam).
    const tones = ["#c9a274", "#cda779", "#c49d6e", "#d0ab7e", "#c69f71"].map((t) => `var(--wd-floor, ${t})`);
    let body = rect(0, 0, 540, 78, "var(--wd-floor, #c9a274)");
    for (let row = 0; row < 3; row++) {
      const off = (row * 97) % 180;
      for (let k = -1; k < 4; k++) {
        const x = k * 180 + off;
        body += rect(x, row * 26, 180, 25, tones[(row * 3 + k + 5) % tones.length]);
        body += rect(x + 30 + ((row + k) % 3) * 30, row * 26 + 8 + ((k + row) % 2) * 6, 70, 1.6, "var(--wd-seam, #b88f61)", 0.8, 0.8);
        body += rect(x, row * 26, 1.2, 25, "var(--wd-seam, #b38a5c)", 0, 0.7);
      }
      body += rect(0, row * 26 + 25, 540, 1.2, "var(--wd-seam, #b38a5c)", 0, 0.7);
    }
    return pat(540, 78, body) + area(`url(#${p})`);
  }

  if (id === "oak") {
    // pale oak parquet, basket weave: 4 strips per square, squares alternate direction
    const S = 72, n = 4, sw = S / n;
    const tones = ["#dcc196", "#d6ba8d", "#e0c79e", "#d3b688"];
    let body = rect(0, 0, S * 2, S * 2, "#c5a77a");
    for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
      const horiz = (gx + gy) % 2 === 0;
      for (let i = 0; i < n; i++) {
        const t = tones[(i + gx * 2 + gy) % tones.length];
        body += horiz
          ? rect(gx * S + 0.6, gy * S + i * sw + 0.6, S - 1.2, sw - 1.2, t, 1)
          : rect(gx * S + i * sw + 0.6, gy * S + 0.6, sw - 1.2, S - 1.2, t, 1);
      }
      // a soft grain streak per square
      body += horiz ? rect(gx * S + 10, gy * S + sw * 1.5, S - 26, 1, "#c4a679", 0, 0.6) : rect(gx * S + sw * 2.5, gy * S + 12, 1, S - 28, "#c4a679", 0, 0.6);
    }
    return pat(S * 2, S * 2, body) + area(`url(#${p})`);
  }

  if (id === "carpet") {
    // office carpet tiles, pile direction alternating, faint seams
    const S = 80;
    let body = rect(0, 0, S * 2, S * 2, "#525c78");
    for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
      const a = (gx + gy) % 2 === 0;
      body += rect(gx * S + 0.8, gy * S + 0.8, S - 1.6, S - 1.6, a ? "#5d6886" : "#58637f");
      for (let i = 4; i < S - 2; i += 6)
        body += a ? rect(gx * S + 3, gy * S + i, S - 6, 1.6, "#ffffff", 0, 0.035) : rect(gx * S + i, gy * S + 3, 1.6, S - 6, "#ffffff", 0, 0.035);
    }
    for (let i = 0; i < 26; i++) body += circ(r() * S * 2, r() * S * 2, 0.8 + r() * 0.8, r() > 0.5 ? "#6d7898" : "#4a536d", 0.6);
    return pat(S * 2, S * 2, body) + area(`url(#${p})`);
  }

  if (id === "tiles") {
    // cream ceramic tiles with grout gaps and a soft sheen on each tile
    const S = 56;
    let body = rect(0, 0, S * 2, S * 2, "#cfc8bb");
    for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
      const t = (gx + gy) % 2 ? "#ebe6dc" : "#efebe3";
      body += rect(gx * S + 1.5, gy * S + 1.5, S - 3, S - 3, t, 2.5);
      body += path(`M${gx * S + 4} ${gy * S + 4} h${S * 0.45} l-${S * 0.3} ${S * 0.3} h-${S * 0.15} Z`, "#ffffff", 0.22);
    }
    return pat(S * 2, S * 2, body) + area(`url(#${p})`);
  }

  if (id === "concrete") {
    // polished concrete: soft mottling, specks of aggregate, saw-cut joints
    const PW = 360, PH = 270;
    let body = rect(0, 0, PW, PH, "#b5b8bf");
    for (let i = 0; i < 14; i++) {
      const cx = r() * PW, cy = r() * PH, rx = 30 + r() * 70, ry = 20 + r() * 40, c = r() > 0.5 ? "#bdc0c7" : "#adb0b8";
      for (const dx of [-PW, 0, PW]) for (const dy of [-PH, 0, PH]) {
        if (cx + dx + rx < 0 || cx + dx - rx > PW || cy + dy + ry < 0 || cy + dy - ry > PH) continue;
        body += ell(cx + dx, cy + dy, rx, ry, c, 0.55);
      }
    }
    for (let i = 0; i < 60; i++) body += circ(4 + r() * (PW - 8), 4 + r() * (PH - 8), 0.6 + r() * 1.1, r() > 0.5 ? "#9ea2ab" : "#c9ccd2", 0.8);
    body += rect(0, 0, PW, 1.6, "#9fa3ac") + rect(0, 0, 1.6, PH, "#9fa3ac");
    body += rect(0, 1.6, PW, 1, "#c8cbd1", 0, 0.7) + rect(1.6, 0, 1, PH, "#c8cbd1", 0, 0.7);
    return pat(PW, PH, body) + area(`url(#${p})`) + rect(0, top, w, h - top, "#ffffff", 0, 0.04);
  }

  // terrazzo: cream base with chips in the office palette and greys, wrapped at the tile edges
  const P = 150;
  const chips = ["#ff9f5a", "#4fb6ff", "#ff6f91", "#ffd27a", "#b07cff", "#4ff0a0", "#8f95a6", "#8f95a6", "#ffffff", "#c49a6c", "#6a7394"];
  let body = rect(0, 0, P, P, "#eee6d9");
  for (let i = 0; i < 34; i++) {
    const cx = r() * P, cy = r() * P, s = 2 + r() * (i < 8 ? 6 : 3.5), c = chips[Math.floor(r() * chips.length)];
    const k = 3 + Math.floor(r() * 3), a0 = r() * Math.PI;
    const pts = Array.from({ length: k }, (_, j) => { const a = a0 + (j / k) * Math.PI * 2 + r() * 0.6, d = s * (0.65 + r() * 0.5); return [Math.cos(a) * d, Math.sin(a) * d]; });
    for (const dx of [-P, 0, P]) for (const dy of [-P, 0, P]) {
      if (cx + dx + s * 1.3 < 0 || cx + dx - s * 1.3 > P || cy + dy + s * 1.3 < 0 || cy + dy - s * 1.3 > P) continue;
      body += path(`M${pts.map(([x, y]) => `${f(cx + dx + x)} ${f(cy + dy + y)}`).join(" L")} Z`, c, c === "#ffffff" ? 0.9 : 0.5);
    }
  }
  return pat(P, P, body) + area(`url(#${p})`);
}

// ---------------------------------------------------------------------------------------------
// walls

/** The window openings world.ts draws on the north wall face (x range including frame and sill). */
export function windowSlots(w: number): { x: number; w: number }[] {
  const n = Math.max(1, Math.floor((w - 240) / 300));
  const out: { x: number; w: number }[] = [];
  for (let i = 0; i < n; i++) {
    const wx = 200 + i * ((w - 260) / n), ww = Math.min(220, (w - 260) / n - 40);
    out.push({ x: wx - 10, w: ww + 20 });
  }
  return out;
}

/** The north wall face (0..wallFace) with its baseboard trim, plus brick texture for "brick". */
export function drawWall(id: WallId, w: number, wallFace: number): string {
  // The free starter wall follows the interface theme's default wall (--wd-wall, --wd-trim).
  const c = id === "warm" ? { ...WALLS[id], face: `var(--wd-wall, ${WALLS[id].face})`, trim: `var(--wd-trim, ${WALLS[id].trim})` } : WALLS[id];
  let out = rect(0, 0, w, wallFace, c.face);
  if (id === "brick") {
    const p = uid("b");
    let body = rect(0, 0, 64, 24, "#d49e84");
    const tones = ["#c47a5a", "#bd7253", "#ca8262", "#c07656"];
    body += rect(1, 1, 30, 10, tones[0], 1.5) + rect(33, 1, 30, 10, tones[1], 1.5);
    body += rect(-15, 13, 30, 10, tones[2], 1.5) + rect(17, 13, 30, 10, tones[3], 1.5) + rect(49, 13, 30, 10, tones[2], 1.5);
    body += rect(4, 2.5, 12, 1.4, "#ffffff", 0, 0.12) + rect(37, 2.5, 9, 1.4, "#ffffff", 0, 0.12) + rect(21, 14.5, 10, 1.4, "#ffffff", 0, 0.1);
    out += `<defs><pattern id="${p}" patternUnits="userSpaceOnUse" width="64" height="24">${body}</pattern></defs>`;
    out += rect(0, 0, w, wallFace, `url(#${p})`);
  } else if (id === "dusk") {
    out += rect(0, wallFace - 46, w, 36, "#454d6a"); // a darker lower band, like wainscot paint
  } else {
    out += rect(0, wallFace - 46, w, 36, "#000000", 0, 0.025);
  }
  out += rect(0, wallFace - 10, w, 10, c.trim);
  return id === "warm" ? out : out + boughtShade(0, w, wallFace);
}

// ---------------------------------------------------------------------------------------------
// decorations

function plants() {
  const pot = `
    ${ell(4, 1, 38, 9, SH, 0.18)}
    ${path("M-22 -30 H22 L18 -3 Q17.5 0 15 0 H-15 Q-17.5 0 -18 -3 Z", "#e07a52")}
    ${path("M7 -30 H22 L18 -3 Q17.5 0 15 0 H5 Z", "#c9663f")}
    ${rect(-21, -21, 41, 5, "#f0a274", 0, 0.55)}
    ${rect(-26, -37, 52, 9, "#f29a6c", 4.5)}
    ${rect(6, -37, 20, 9, "#e08458", 4.5)}
    ${ell(0, -34.5, 21, 4, "#5a3b2a")}`;
  const L = (a: number, l: number, wd: number, c: string, s: string) => leaf(0, -35, a, l, wd, c, s);
  const back = L(-36, 80, 19, "#2f7f58", "#276d4b") + L(10, 88, 20, "#2f7f58", "#276d4b") + L(44, 74, 18, "#2f7f58", "#276d4b");
  const mid = L(-60, 66, 17, "#3f9b6e", "#358a60") + L(-16, 76, 19, "#3f9b6e", "#358a60") + L(28, 72, 18, "#3f9b6e", "#358a60") + L(62, 60, 16, "#3f9b6e", "#358a60");
  const front = L(-82, 48, 14, "#53b884", "#47a674") + L(80, 50, 14, "#53b884", "#47a674") + L(-32, 54, 16, "#5cc48e", "#4fb380") + L(14, 52, 15, "#5cc48e", "#4fb380");
  // a small succulent in a white pot beside it
  const small = `
    ${ell(46, 1, 16, 5, SH, 0.18)}
    ${path("M34 -18 H58 L55 -2 Q54.5 0 52.5 0 H39.5 Q37.5 0 37 -2 Z", "#f1ece3")}
    ${path("M49 -18 H58 L55 -2 Q54.5 0 52.5 0 H48 Z", "#ddd6ca")}
    ${rect(33, -22, 26, 6, "#f8f5ef", 3)}
    ${ell(46, -20, 11, 2.6, "#5a3b2a")}
    ${[[-50, 13], [-20, 15], [10, 15], [40, 13], [70, 11], [-80, 10]].map(([a, l]) => leaf(46, -20, a, l, 5.5, "#7fd4a6", "#62bf8d")).join("")}
    ${leaf(46, -20, -5, 9, 4, "#9be6bd", "#7fd4a6")}`;
  return `${pot}<g class="dc-sway"${pivot(0, -35)}>${back + mid + front}</g>${small}`;
}

function rug() {
  const W = 290, H = 150;
  const fringe = (x: number) => Array.from({ length: 14 }, (_, i) => rect(x, -H / 2 + 10 + i * ((H - 20) / 13) - 1.5, 9, 3, "#efe3c8", 1.5)).join("");
  const diamond = (cx: number, cy: number, rx: number, ry: number, c: string) => path(`M${cx} ${cy - ry} L${cx + rx} ${cy} L${cx} ${cy + ry} L${cx - rx} ${cy} Z`, c);
  // woven end panels: stripes across the short ends, a zigzag between them
  const ends = [-1, 1].map((sd) => {
    const x = (o: number) => sd * (W / 2 - o);
    const zig = Array.from({ length: 7 }, (_, i) => {
      const y = -H / 2 + 8 + i * ((H - 16) / 7), hh = (H - 16) / 7;
      return path(`M${x(40)} ${f(y)} L${x(52)} ${f(y + hh / 2)} L${x(40)} ${f(y + hh)} Z`, "#ff6f91");
    }).join("");
    return rect(Math.min(x(18), x(28)), -H / 2, 10, H, "#ffd27a") + rect(Math.min(x(32), x(38)), -H / 2, 6, H, "#ff9f5a") + zig;
  }).join("");
  const dots = [-1, 1].map((sd) => circ(sd * 74, -42, 3, "#ffd27a") + circ(sd * 74, 42, 3, "#ffd27a")).join("");
  return `
    ${fringe(-W / 2 - 7)}${fringe(W / 2 - 2)}
    ${rect(-W / 2, -H / 2 + 3, W, H, "#3a4670", 14)}
    ${rect(-W / 2, -H / 2, W, H, "#4f5f9a", 14)}
    ${ends}${dots}
    ${diamond(0, 0, 56, 38, "#ff9f5a")}${diamond(0, 0, 38, 25, "#ffd27a")}${diamond(0, 0, 22, 14, "#ff6f91")}${diamond(0, 0, 8, 5, "#4f5f9a")}
    ${diamond(-74, 0, 12, 9, "#ff6f91")}${diamond(74, 0, 12, 9, "#ff6f91")}
    ${rect(-W / 2 + 10, -H / 2 + 5, W - 20, 6, "#ffffff", 3, 0.08)}`;
}

function posters() {
  // "HANG IN THERE": a little robot dangling from its own power cable
  const a = `
    ${rect(-49, -85, 44, 58, "#000000", 3, 0.08)}
    ${rect(-50, -87, 44, 58, "#ffd27a", 3)}
    ${rect(-50, -87, 44, 22, "#ffe3a3", 3)}${rect(-50, -70, 44, 6, "#ffe3a3")}
    ${line("M-28 -87 C-28 -80 -27 -76 -28 -69", "#3a3f4f", 1.4)}
    ${rect(-31.5, -71, 2, 9, "#c9cfdb", 1, 1, ` transform="rotate(16 -30.5 -66.5)"`)}
    ${rect(-26.5, -71, 2, 9, "#c9cfdb", 1, 1, ` transform="rotate(-16 -25.5 -66.5)"`)}
    ${rect(-34, -68, 12, 9, "#e9edf5", 3)}
    ${rect(-32, -66, 8, 4.5, "#3a3f4f", 2)}
    ${circ(-30, -63.8, 1.1, "#4ff0a0")}${circ(-26, -63.8, 1.1, "#4ff0a0")}
    ${rect(-33, -58, 10, 9, "#c9cfdb", 2.5)}${rect(-30, -56, 4, 2, "#ff9f5a", 1)}
    ${rect(-31.5, -49.5, 2.4, 6, "#a9b0bf", 1.2, 1, ` transform="rotate(8 -30.3 -49.5)"`)}
    ${rect(-27, -49.5, 2.4, 6, "#a9b0bf", 1.2, 1, ` transform="rotate(-12 -25.8 -49.5)"`)}
    <text x="-28" y="-37.5" text-anchor="middle" font-size="6.2" font-weight="700" letter-spacing="0.3" fill="#3a3f4f"${FONT}>HANG IN</text>
    <text x="-28" y="-31" text-anchor="middle" font-size="6.2" font-weight="700" letter-spacing="0.3" fill="#3a3f4f"${FONT}>THERE</text>
    ${circ(-28, -87, 2.2, "#ff6f91")}${circ(-28.7, -87.7, 0.8, "#ffffff", 0.6)}`;
  // "I AM NOT A ROBOT": a captcha box ticked by a slightly nervous robot
  const b = `
    ${rect(7, -80, 42, 52, "#000000", 3, 0.08)}
    ${rect(6, -82, 42, 52, "#b07cff", 3)}
    ${rect(6, -40, 42, 10, "#9a64ee", 0)}${rect(6, -34, 42, 4, "#9a64ee", 3)}
    ${rect(11, -76, 32, 14, "#ffffff", 2.5)}
    ${rect(14, -73, 8, 8, "#e9edf5", 1.6)}
    ${line("M15.6 -69 L17.6 -66.8 L21 -71.6", "#2fb37a", 1.8)}
    ${rect(25, -71.5, 15, 2, "#c9cfdb", 1)}${rect(25, -67.5, 10, 2, "#c9cfdb", 1)}
    <text x="27" y="-53" text-anchor="middle" font-size="6" font-weight="700" letter-spacing="0.3" fill="#ffffff"${FONT}>I AM NOT</text>
    <text x="27" y="-46.5" text-anchor="middle" font-size="6" font-weight="700" letter-spacing="0.3" fill="#ffffff"${FONT}>A ROBOT</text>
    ${rect(21, -42, 12, 9, "#e9edf5", 3)}
    ${rect(23, -40, 8, 4.5, "#3a3f4f", 2)}
    ${circ(25, -37.8, 1, "#4ff0a0")}${circ(29, -37.8, 1, "#4ff0a0")}
    ${path("M35.5 -43 Q37.5 -40 35.5 -38.6 Q33.5 -40 35.5 -43 Z", "#4fb6ff")}
    ${circ(27, -82, 2.2, "#4fb6ff")}${circ(26.3, -82.7, 0.8, "#ffffff", 0.6)}`;
  return a + b;
}

function neon() {
  const g = uid("n");
  const tube = (d: string, color: string, core: string) =>
    line(d, color, 10, 0.2) + line(d, color, 5, 0.55) + line(d, core, 2.2);
  const head = rr(-40, -79, 36, 28, 8);
  const heart = "M22 -50 C9 -58 5 -67 11 -73 C15.5 -77.5 20.5 -75.5 22 -71 C23.5 -75.5 28.5 -77.5 33 -73 C39 -67 35 -58 22 -50 Z";
  return `
    <defs><radialGradient id="${g}"><stop offset="0" stop-color="#ff6f91" stop-opacity="0.42"/><stop offset="0.55" stop-color="#b07cff" stop-opacity="0.16"/><stop offset="1" stop-color="#b07cff" stop-opacity="0"/></radialGradient></defs>
    <g${nightGlow(0.45)}>${ell(0, -60, 70, 46, `url(#${g})`)}</g>
    ${rect(-49, -90, 98, 60, "#000000", 10, 0.14, ` transform="translate(2 3)"`)}
    ${rect(-49, -90, 98, 60, "#262b45", 10)}
    ${rect(-49, -90, 98, 22, "#2d3352", 10)}${rect(-49, -76, 98, 8, "#2d3352")}
    ${circ(-43, -84, 1.6, "#5a6177")}${circ(43, -84, 1.6, "#5a6177")}${circ(-43, -36, 1.6, "#5a6177")}${circ(43, -36, 1.6, "#5a6177")}
    ${line("M40 -30 C46 -22 38 -10 45 0", "#2e3242", 1.6, 0.9)}
    <g class="dc-neon">
      ${tube(head, "#4fb6ff", "#d9f1ff")}
      ${tube("M-22 -79 V-85", "#4fb6ff", "#d9f1ff")}
      ${circ(-22, -87.5, 3.4, "#4fb6ff", 0.4)}${circ(-22, -87.5, 2, "#d9f1ff")}
      ${circ(-29, -67, 4.5, "#4fb6ff", 0.35)}${circ(-15, -67, 4.5, "#4fb6ff", 0.35)}
      ${circ(-29, -67, 2.3, "#d9f1ff")}${circ(-15, -67, 2.3, "#d9f1ff")}
      ${tube("M-29 -59 Q-22 -54.5 -15 -59", "#4fb6ff", "#d9f1ff")}
      <g class="dc-neon-heart">${tube(heart, "#ff6f91", "#ffd6e0")}</g>
    </g>`;
}

function trophies() {
  const cup = `
    ${rect(-10, -40, 20, 7, "#4a5063", 2)}${rect(-5, -38.5, 10, 3, "#ffd27a", 1)}
    ${rect(-6, -44, 12, 4, "#e8b75a", 1.5)}
    ${rect(-2.5, -52, 5, 8, "#e8b75a")}
    ${line("M-12 -70 C-21 -70 -20 -58 -9 -58", "#f0bf5f", 3)}
    ${line("M12 -70 C21 -70 20 -58 9 -58", "#e8b75a", 3)}
    ${path("M-13 -73 H13 Q13 -54 0 -51 Q-13 -54 -13 -73 Z", "#ffd27a")}
    ${path("M2 -73 H13 Q13 -54 0 -51 Q4 -58 2 -73 Z", "#f0bf5f")}
    ${path("M-9 -71 H-5 Q-5 -60 -1 -55 Q-9 -58 -9 -71 Z", "#fff3cf", 0.7)}
    ${ell(0, -73, 13, 2.4, "#e8b75a")}`;
  const starT = `
    ${rect(-38, -38, 16, 5, "#4a5063", 1.5)}
    ${rect(-31.5, -46, 3, 8, "#c4cad8")}
    ${path(star(-30, -53, 10), "#dfe4ee")}
    ${path(star(-30, -53, 5.2), "#ffffff", 0.5)}`;
  const bot = `
    ${rect(22, -38, 16, 5, "#4a5063", 1.5)}
    ${rect(25, -47, 10, 9, "#d9905a", 2.5)}
    ${rect(23.5, -56, 13, 9, "#e4a06c", 3)}
    ${rect(25.5, -54, 9, 4, "#b8743f", 2)}
    ${rect(21, -54, 2.6, 9, "#d9905a", 1.3, 1, ` transform="rotate(-28 22.3 -46)"`)}
    ${rect(36.4, -54, 2.6, 9, "#d9905a", 1.3, 1, ` transform="rotate(28 37.7 -46)"`)}
    ${rect(29.2, -60, 1.6, 4, "#d9905a")}${circ(30, -61, 1.8, "#ffd27a")}`;
  return `
    ${rect(-44, -26, 88, 5, "#000000", 2.5, 0.08)}
    ${path("M-34 -28 h7 l-7 9 Z", "#4a5063")}${path("M34 -28 h-7 l7 9 Z", "#4a5063")}
    ${rect(-46, -35, 92, 5, "#d7b48a", 2)}
    ${rect(-46, -31, 92, 5, "#b48a5e", 2)}
    ${starT}${cup}${bot}
    ${line("M-46 -82 L-41 -70 M-36 -82 L-41 -70", "#ff6f91", 2.6)}
    ${circ(-41, -67, 5, "#e8b75a")}${circ(-41, -67, 3.2, "#ffd27a")}`;
}

function bookshelf() {
  const colors = ["#ff6f91", "#4fb6ff", "#ffd27a", "#3fbf8a", "#b07cff", "#ff9f5a", "#e9e4da", "#6a7394", "#f2b8c6"];
  let ci = 0;
  const book = (x: number, base: number, w: number, h: number, tilt = 0) => {
    const c = colors[ci++ % colors.length];
    const t = tilt ? ` transform="rotate(${tilt} ${f(tilt > 0 ? x : x + w)} ${f(base)})"` : "";
    return `<g${t}>${rect(x, base - h, w, h, c, 1)}${rect(x, base - h + 3, w, 1.6, "#ffffff", 0, 0.35)}${rect(x + w - 1.4, base - h, 1.4, h, "#000000", 0, 0.12)}</g>`;
  };
  const row = (base: number, items: string) => items;
  const r1 = -44, r2 = -20, r3 = 4; // shelf bases
  let x = -39;
  const run = (base: number, specs: [number, number][], tiltLast = 0) => {
    let s = "";
    specs.forEach(([w, h], i) => { s += book(x, base, w, h, i === specs.length - 1 ? tiltLast : 0); x += w + 0.6; });
    return s;
  };
  x = -39; const b1 = run(r1, [[6, 18], [7, 20], [5, 16], [8, 19], [6, 17], [7, 20]], 0);
  x = -39 + 41; const b1b = book(x + 1, r1, 6, 18, 16);
  const pot1 = `${rect(24, r1 - 10, 13, 10, "#f1ece3", 2)}${rect(31, r1 - 10, 6, 10, "#ddd6ca", 2)}${leaf(30.5, r1 - 10, -30, 10, 4, "#53b884", "#47a674")}${leaf(30.5, r1 - 10, 20, 11, 4, "#3f9b6e", "#358a60")}${leaf(30.5, r1 - 10, -2, 12, 4, "#5cc48e", "#4fb380")}`;
  const stack = `${rect(-39, r2 - 4, 24, 4, "#4fb6ff", 1)}${rect(-38, r2 - 8, 22, 4, "#ff9f5a", 1)}${rect(-39.5, r2 - 12, 23, 4, "#e9e4da", 1)}`;
  x = -13; const b2 = run(r2, [[6, 19], [8, 17], [6, 20], [7, 18]], 0);
  const globe = `${rect(24, r2 - 3, 10, 3, "#4a5063", 1)}${rect(28.2, r2 - 6, 1.6, 4, "#4a5063")}${circ(29, r2 - 12, 7, "#4fb6ff")}${path(`M25 ${r2 - 16} q4 -2 6 1 q-1 3 -4 3 q-3 2 -2 -4 Z`, "#3fbf8a")}${path(`M30 ${r2 - 9} q3 -1 4 1 q-2 3 -4 2 Z`, "#3fbf8a")}`;
  const box = `${rect(-39, r3 - 16, 28, 16, "#4fb6ff", 2)}${rect(-39, r3 - 16, 28, 4, "#7cc6ff", 2)}${rect(-29, r3 - 10, 8, 3, "#3a8fd0", 1.5)}`;
  x = -9; const b3 = run(r3, [[7, 18], [6, 20], [8, 17], [5, 19], [7, 18]], 0);
  const b3b = book(29, r3, 6, 17, -14);
  const vine = `
    ${line("M36 -80 C42 -72 40 -62 44 -52 C46 -44 42 -36 44 -28", "#2f7f58", 1.2)}
    ${[[40, -74, -40], [42, -66, 30], [41, -58, -30], [45, -50, 35], [43, -42, -25], [44, -33, 30]].map(([lx, ly, a], i) => leaf(lx, ly, a + 90, 8, 3.6, i % 2 ? "#3f9b6e" : "#53b884", i % 2 ? "#358a60" : "#47a674")).join("")}`;
  const top = `
    ${rect(-36, -84, 22, 4, "#ff6f91", 1)}${rect(-35, -88, 20, 4, "#ffd27a", 1)}
    ${rect(24, -86, 14, 9, "#f1ece3", 2)}${rect(32, -86, 6, 9, "#ddd6ca", 2)}
    ${leaf(31, -86, -40, 7, 3.4, "#53b884", "#47a674")}${leaf(31, -86, 40, 7, 3.4, "#3f9b6e", "#358a60")}${leaf(31, -86, 0, 7, 3.4, "#5cc48e", "#4fb380")}`;
  return `<g transform="translate(0 -12)">
    ${ell(0, 13, 52, 6, SH, 0.2)}
    ${rect(-46, -78, 92, 90, "#b48a5e", 3)}
    ${rect(-46, -82, 92, 9, "#d7b48a", 3)}
    ${rect(-40, -66, 80, 22, "#7c5a3c", 1.5)}${rect(-40, -42, 80, 22, "#7c5a3c", 1.5)}${rect(-40, -18, 80, 22, "#7c5a3c", 1.5)}
    ${rect(-40, -66, 80, 3, "#000000", 0, 0.12)}${rect(-40, -42, 80, 3, "#000000", 0, 0.12)}${rect(-40, -18, 80, 3, "#000000", 0, 0.12)}
    ${row(r1, b1 + b1b + pot1)}${row(r2, stack + b2 + globe)}${row(r3, box + b3 + b3b)}
    ${rect(-46, 6, 92, 6, "#8f6a47", 2)}
    ${rect(-44, -76, 3, 80, "#ffffff", 1.5, 0.1)}
    ${top}${vine}</g>`;
}

function coffee() {
  return `
    ${ell(2, 2, 52, 7, SH, 0.2)}
    ${rect(-44, -42, 88, 42, "#d6cdbd", 3)}
    ${rect(-40, -36, 38, 31, "#e4dccd", 2)}${rect(2, -36, 38, 31, "#e4dccd", 2)}
    ${rect(-7, -26, 2.6, 11, "#a59d8e", 1.3)}${rect(4.4, -26, 2.6, 11, "#a59d8e", 1.3)}
    ${rect(-42, -4, 84, 4, "#b8ae9c", 2)}
    ${rect(-47, -66, 94, 26, "#f1ebe0", 4)}
    ${rect(-47, -44, 94, 5, "#cfc5b2", 2.5)}
    ${ell(-10, -49, 24, 3.5, SH, 0.18)}
    ${rect(-20, -121, 20, 12, "#c3cddd", 2.5)}${rect(-20, -116, 20, 7, "#7a4b30", 2)}${rect(-17, -114, 3, 2, "#9a6646", 1)}${rect(-10, -112, 3, 2, "#9a6646", 1)}${rect(-17, -120, 3, 8, "#ffffff", 1.5, 0.45)}${rect(-21, -124, 22, 5, "#4a5063", 2.5)}
    ${rect(-31, -109, 42, 60, "#3a3f4f", 6)}
    ${rect(-31, -112, 42, 9, "#4a5063", 4.5)}
    ${rect(1, -109, 10, 60, "#323646", 0, 0.9)}${rect(-31, -103, 4, 50, "#ffffff", 2, 0.06)}
    ${rect(-26, -100, 30, 15, "#4a5063", 3)}
    ${rect(-23, -97, 13, 9, "#4ff0a0", 2, 0.9)}${rect(-21.5, -95.5, 6, 1.6, "#2b7a58", 0.8)}${rect(-21.5, -92.5, 9, 1.6, "#2b7a58", 0.8)}
    ${circ(-4, -94.5, 2.2, "#ffd27a")}${circ(1.5, -94.5, 2.2, "#ff6f91")}
    ${rect(-25, -80, 28, 26, "#22263a", 3)}
    ${rect(-14.5, -80, 7, 6, "#5a6177", 1.5)}
    ${rect(-18, -65, 14, 11, "#ff6f91", 3)}${ell(-11, -64.5, 6, 1.8, "#5a2b1e")}
    ${rect(-26, -55, 30, 4, "#5a6177", 2)}
    ${ell(23, -51, 10, 2.6, SH, 0.18)}
    ${line("M30 -60 q5 0 5 4 q0 4 -5 4", "#3fa9ec", 2.6)}
    ${rect(16, -64, 15, 13, "#4fb6ff", 3.5)}${rect(16, -64, 5, 13, "#7cc6ff", 2.5, 0.8)}
    ${ell(23.5, -63.5, 6.5, 2, "#5a2b1e")}
    ${rect(34, -62, 9, 11, "#e9edf5", 2.5)}${rect(34, -64, 9, 3, "#c49a6c", 1.5)}
    <g class="dc-steam">
      ${line("M22 -68 C17 -74 27 -79 22 -86 C18 -91 25 -95 22 -100", "#8d97ad", 4.6, 0.18)}
      ${line("M26.5 -69 C30 -74 23 -78 27 -84", "#8d97ad", 3.8, 0.16)}
      ${line("M22 -68 C17 -74 27 -79 22 -86 C18 -91 25 -95 22 -100", "#ffffff", 2.4, 0.85)}
      ${line("M26.5 -69 C30 -74 23 -78 27 -84", "#ffffff", 1.8, 0.7)}
    </g>`;
}

function water() {
  return `
    ${ell(4, 2, 30, 6, SH, 0.2)}
    ${rect(-20, -64, 40, 64, "#eef1f6", 5)}
    ${rect(8, -64, 12, 64, "#d9dee8", 5)}${rect(8, -64, 6, 64, "#d9dee8")}
    ${rect(-21, -68, 42, 9, "#f8f9fc", 4.5)}
    ${rect(-14, -52, 28, 24, "#c7cedb", 3)}
    ${rect(-10, -50, 7, 7, "#4fb6ff", 2)}${rect(3, -50, 7, 7, "#ff6f91", 2)}
    ${rect(-7.5, -43.5, 2, 3, "#3a8fd0")}${rect(5.5, -43.5, 2, 3, "#e05578")}
    ${rect(-12, -33, 24, 4, "#9aa3b5", 2)}
    ${rect(-11, -16, 22, 2, "#d4d9e3", 1)}${rect(-11, -11, 22, 2, "#d4d9e3", 1)}
    ${rect(20, -60, 8, 30, "#cfd5e0", 3)}${path("M20.5 -30 h7 l-1.5 7 h-4 Z", "#ffffff")}
    ${rect(-6, -74, 12, 8, "#6fc0f5", 2)}
    ${rect(-17, -110, 34, 40, "#c7eaff", 13)}
    ${rect(-17, -98, 34, 28, "#62bbf5", 12)}${rect(-17, -98, 34, 14, "#62bbf5")}
    ${rect(-17, -98, 34, 3, "#8fd0ff")}
    ${rect(4, -106, 13, 34, "#000000", 6, 0.06)}
    ${rect(-12, -104, 4, 26, "#ffffff", 2, 0.6)}
    ${rect(-17, -84, 34, 2.5, "#4fa8e6", 0, 0.7)}
    <g class="dc-bubbles">
      ${circ(3, -80, 2, "#ffffff", 0.75, ` class="dc-bubble" style="animation-delay:-0.4s"`)}
      ${circ(-3, -88, 1.4, "#ffffff", 0.7, ` class="dc-bubble" style="animation-delay:-1.3s"`)}
      ${circ(6, -92, 1.2, "#ffffff", 0.7, ` class="dc-bubble" style="animation-delay:-2.1s"`)}
    </g>`;
}

function arcade() {
  const g = uid("a"), s = uid("s");
  const alien = (x: number, y: number, c: string) =>
    `<g class="dc-alien">${rect(x, y, 6, 3, c)}${rect(x - 1.5, y + 1.5, 9, 2, c)}${rect(x + 1, y + 1, 1.2, 1.2, "#1d2140")}${rect(x + 3.8, y + 1, 1.2, 1.2, "#1d2140")}${rect(x - 1.5, y + 3.5, 1.5, 1.5, c)}${rect(x + 6, y + 3.5, 1.5, 1.5, c)}</g>`;
  return `
    <defs>
      <linearGradient id="${s}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f45"/><stop offset="1" stop-color="#2c2266"/></linearGradient>
      <radialGradient id="${g}"><stop offset="0" stop-color="#4fb6ff" stop-opacity="0.38"/><stop offset="1" stop-color="#4fb6ff" stop-opacity="0"/></radialGradient>
    </defs>
    <g${nightGlow(0.35)}>${ell(0, 12, 58, 16, `url(#${g})`)}</g>
    ${ell(2, 2, 40, 6, SH, 0.22)}
    ${rect(-33, -140, 66, 140, "#8a5ad9", 5)}
    ${rect(-33, -144, 66, 10, "#c9a2ff", 4)}
    ${rect(-28, -138, 56, 16, "#2e3242", 3)}
    ${rect(-25, -135.5, 50, 11, "#ffd27a", 2.5)}
    ${rect(-25, -135.5, 50, 4, "#ffe6ad", 2)}
    ${alien(-3, -132.5, "#3a3f4f")}${rect(-19, -131, 9, 3, "#ff6f91", 1)}${rect(10, -131, 9, 3, "#4fb6ff", 1)}
    ${rect(-28, -120, 56, 52, "#a374f2", 3)}
    ${rect(-25, -116, 50, 44, "#22263a", 4)}
    ${rect(-22, -113, 44, 37, `url(#${s})`, 3)}
    <g class="dc-screen">
      ${[[-18, -110], [-6, -106], [9, -111], [18, -104], [-14, -96], [14, -92]].map(([x, y]) => rect(x, y, 1.1, 1.1, "#ffffff", 0, 0.7)).join("")}
      ${alien(-15, -107, "#4ff0a0")}${alien(-3, -107, "#4ff0a0")}${alien(9, -107, "#4ff0a0")}
      ${alien(-9, -100, "#ff6f91")}${alien(3, -100, "#ff6f91")}
      ${rect(-0.6, -93, 1.4, 5, "#ffd27a")}
      ${rect(-4, -84, 8, 2.5, "#4fb6ff")}${rect(-1.2, -86.5, 2.4, 2.5, "#4fb6ff")}${rect(-6, -82, 12, 1.5, "#4fb6ff")}
      ${rect(-20, -79.5, 40, 1.2, "#4ff0a0", 0, 0.5)}
    </g>
    ${path("M-22 -113 H-6 L-22 -90 Z", "#ffffff", 0.07)}
    <g${nightGlow(0.25)}>${rect(-26, -117, 52, 46, "#4fb6ff", 6, 0.12)}</g>
    ${path("M-31 -70 H31 L36 -56 H-36 Z", "#3a3f4f")}
    ${rect(-36, -57, 72, 6, "#2e3242", 2)}
    ${ell(-17, -62, 5, 2, "#22263a")}${rect(-18.2, -71, 2.4, 9, "#22263a", 1)}${circ(-17, -72, 4.4, "#ff6f91")}${circ(-18.4, -73.4, 1.4, "#ffffff", 0.5)}
    ${ell(3, -62, 3.6, 2.2, "#ffd27a")}${ell(12, -63.5, 3.6, 2.2, "#4fb6ff")}${ell(21, -62, 3.6, 2.2, "#4ff0a0")}
    ${rect(-29, -51, 58, 47, "#a374f2", 3)}
    ${rect(-8, -44, 16, 20, "#3a3f4f", 2.5)}
    ${rect(-4, -40, 2.4, 6, "#ffd27a", 1)}${rect(1.6, -40, 2.4, 6, "#ffd27a", 1)}${rect(-4, -30, 8, 2, "#ff6f91", 1)}
    ${rect(-29, -15, 58, 4, "#ff9f5a")}${rect(-29, -10, 58, 3, "#ffd27a")}
    ${rect(-31, -4, 62, 4, "#2e3242", 2)}
    ${rect(-33, -134, 4, 130, "#ffffff", 2, 0.08)}`;
}

function fish(x: number, y: number, s: number, body: string, fin: string, dir: 1 | -1, delay: number, stripes = false) {
  const t = `translate(${f(x)} ${f(y)}) scale(${f(dir * s)} ${f(s)})`;
  return `<g class="dc-fish" style="animation-delay:${delay}s"><g transform="${t}">
    ${path("M-5 0 L-11 -4.5 Q-9.5 0 -11 4.5 Z", fin)}
    ${ell(0, 0, 7, 4.3, body)}
    ${path("M-1 -4 Q2 -7.5 4 -3.6 Z", fin)}
    ${stripes ? rect(-1.6, -4, 2, 8, "#ffffff", 1, 0.9) + rect(3.2, -3.4, 1.6, 6.8, "#ffffff", 0.8, 0.9) : ""}
    ${ell(1, 1.6, 4.5, 1.6, "#ffffff", 0.18)}
    ${circ(4.6, -1, 1.25, "#ffffff")}${circ(4.9, -1, 0.65, "#1d2140")}
  </g></g>`;
}

function aquarium() {
  const wg = uid("w"), hg = uid("h");
  const bubble = (x: number, y: number, r: number, d: number) => circ(x, y, r, "#ffffff", 0.65, ` class="dc-bubble" style="animation-delay:${d}s"`);
  const weed = (x: number, h: number, c: string, sh: string, bend: number) =>
    path(`M${x - 3} -44 C${x - 6 + bend} ${-44 - h * 0.35} ${x + 4 + bend} ${-44 - h * 0.6} ${x + bend * 0.6} ${-44 - h} C${x + 5 + bend} ${-44 - h * 0.6} ${x + 3 + bend * 0.4} ${-44 - h * 0.3} ${x + 3} -44 Z`, c) +
    path(`M${x} -44 C${x + 1 + bend * 0.5} ${-44 - h * 0.4} ${x + 3 + bend} ${-44 - h * 0.6} ${x + bend * 0.6} ${-44 - h} C${x + 5 + bend} ${-44 - h * 0.6} ${x + 3 + bend * 0.4} ${-44 - h * 0.3} ${x + 3} -44 Z`, sh);
  return `
    <defs>
      <linearGradient id="${wg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd6ff"/><stop offset="1" stop-color="#2f86d6"/></linearGradient>
      <radialGradient id="${hg}"><stop offset="0" stop-color="#4fb6ff" stop-opacity="0.32"/><stop offset="1" stop-color="#4fb6ff" stop-opacity="0"/></radialGradient>
    </defs>
    <g${nightGlow(0.4)}>${ell(0, -72, 86, 48, `url(#${hg})`)}</g>
    ${ell(2, 2, 62, 7, SH, 0.2)}
    ${rect(-56, -38, 112, 38, "#a87e54", 3)}
    ${rect(-51, -33, 49, 28, "#b88d60", 2)}${rect(2, -33, 49, 28, "#b88d60", 2)}
    ${circ(-6, -19, 1.8, "#6b4f3a")}${circ(6, -19, 1.8, "#6b4f3a")}
    ${rect(-58, -42, 116, 7, "#c49a6c", 2.5)}
    ${rect(-54, -110, 108, 70, `url(#${wg})`, 3)}
    ${rect(-54, -110, 108, 12, "#a8e6ff", 3)}
    ${rect(-54, -101, 108, 3, "#c9f0ff", 0, 0.8)}
    ${rect(-56, -114, 112, 6, "#3a3f4f", 3)}${rect(-40, -112.5, 80, 2, "#ffd27a", 1, 0.85)}
    ${path("M-36 -98 L-24 -98 L-40 -46 L-52 -46 Z", "#ffffff", 0.07)}${path("M8 -98 L16 -98 L4 -46 L-4 -46 Z", "#ffffff", 0.05)}
    ${path("M-54 -50 C-36 -56 -20 -48 0 -52 C18 -56 34 -49 54 -53 V-43 H-54 Z", "#ffd27a")}
    ${path("M-54 -46 C-30 -50 -10 -45 10 -48 C30 -51 42 -46 54 -48 V-43 H-54 Z", "#e8b75a")}
    ${circ(-30, -47, 1, "#c9952f")}${circ(14, -46, 1, "#c9952f")}${circ(38, -48, 1, "#c9952f")}
    ${weed(-44, 34, "#3f9b6e", "#358a60", -4)}${weed(-37, 24, "#4ff0a0", "#3fd18a", 4)}
    ${weed(40, 40, "#3f9b6e", "#358a60", 5)}${weed(46, 26, "#4ff0a0", "#3fd18a", -3)}
    ${ell(-20, -49, 9, 6, "#7a8299")}${ell(-16, -51, 5, 3, "#8f97ad")}${ell(28, -48, 6, 4, "#5f6780")}
    ${rect(4, -60, 12, 11, "#c9cfdb", 3)}${rect(7, -57, 6, 2.5, "#ff9f5a", 1.2)}
    ${circ(10, -66, 7, "#dfe4ee")}${circ(10.8, -66, 4.6, "#4fb6ff")}${circ(9, -67.8, 1.5, "#ffffff", 0.8)}
    ${rect(9.2, -75, 1.6, 3, "#c9cfdb")}${circ(10, -75.6, 1.4, "#ff6f91")}
    ${rect(-1, -58, 6, 2.5, "#c9cfdb", 1.2, 1, ` transform="rotate(-30 4 -57)"`)}${rect(15, -58, 6, 2.5, "#c9cfdb", 1.2, 1, ` transform="rotate(30 16 -57)"`)}
    ${fish(-24, -84, 1.15, "#ff9f5a", "#f07f3a", 1, -0.5, true)}
    ${fish(24, -76, 1, "#ff6f91", "#e8557a", -1, -1.7)}
    ${fish(-4, -92, 0.85, "#ffd27a", "#f0bf5f", -1, -2.6)}
    ${fish(32, -94, 0.7, "#b07cff", "#9562e8", 1, -3.4)}
    <g class="dc-bubbles">
      ${bubble(14, -82, 1.6, -0.3)}${bubble(12, -90, 1.2, -1.1)}${bubble(15, -96, 0.9, -1.9)}
      ${bubble(-46, -60, 2.2, -0.8)}${bubble(-44, -72, 1.6, -1.6)}${bubble(-47, -84, 1.2, -2.4)}${bubble(-45, -94, 0.9, -3.2)}
    </g>
    ${rect(-54, -44, 108, 4, "#3a3f4f", 1.5)}
    ${rect(-54, -99, 108, 2, "#3a3f4f", 1, 0.55)}`;
}

function beanbag(cx: number, cy: number, c: string, dark: string, light: string, flip = 1) {
  return `<g transform="translate(${cx} ${cy}) scale(${flip} 1)">
    ${ell(4, 26, 38, 8, SH, 0.18)}
    ${path("M-37 6 C-39 -15 -24 -31 0 -31 C25 -31 39 -16 37 5 C35 22 19 29 0 29 C-19 29 -35 24 -37 6 Z", dark)}
    ${path("M-33 0 C-34 -19 -20 -29 0 -29 C20 -29 34 -19 32 -2 C30 13 16 18 0 18 C-17 18 -32 14 -33 0 Z", c)}
    ${path("M-16 -4 C-14 -15 10 -17 16 -6 C18 3 6 8 -2 7 C-11 6 -17 2 -16 -4 Z", dark, 0.55)}
    ${path("M-12 -4 C-9 -11 8 -12 12 -5 C6 -8 -6 -8 -12 -4 Z", light, 0.5)}
    ${path("M-25 -12 C-21 -23 -9 -27 3 -26 C-7 -23 -17 -19 -21 -10 Z", "#ffffff", 0.28)}
    ${path("M-30 10 C-20 18 14 20 30 9 C20 22 -16 24 -30 10 Z", "#000000", 0.08)}
  </g>`;
}

function beanbags() {
  return `
    ${beanbag(-48, -2, "#ff9f5a", "#e57f3d", "#ffc08f")}
    ${beanbag(50, 4, "#4fb6ff", "#3a96e0", "#9ad4ff", -1)}
    <g transform="translate(4 26) rotate(-12)">
      ${ell(1, 4, 13, 3, SH, 0.18)}
      ${path("M-11 -3 C-11 -7 -6 -7 -3 -6 H3 C6 -7 11 -7 11 -3 C12 3 9 6 6 4 L3 2 H-3 L-6 4 C-9 6 -12 3 -11 -3 Z", "#3a3f4f")}
      ${circ(-6, -2, 1.6, "#4a5063")}${circ(5, -3.4, 1.1, "#ff6f91")}${circ(7.5, -1.5, 1.1, "#4ff0a0")}${circ(5, 0.4, 1.1, "#4fb6ff")}${circ(2.5, -1.5, 1.1, "#ffd27a")}
    </g>`;
}

function pingpong() {
  const W = 230, D = 120;
  const x0 = -W / 2, y0 = -D / 2 - 4;
  const paddle = (x: number, y: number, a: number, face: string, back: string) => `<g transform="translate(${x} ${y}) rotate(${a})">
    ${ell(2, 3, 11, 9, "#000000", 0.14)}
    ${rect(-2.4, 7, 4.8, 13, "#c49a6c", 2)}${rect(-2.4, 7, 2, 13, "#d8b48a", 1)}
    ${ell(0, 0, 11, 10, back)}${ell(0, -1, 10.4, 9.4, face)}${ell(-3, -4, 4, 2.6, "#ffffff", 0.18)}</g>`;
  return `
    ${ell(0, 78, 130, 10, SH, 0.2)}
    ${rect(x0 + 8, D / 2 + 4, W - 16, 16, "#000000", 6, 0.1)}
    ${rect(x0 + 14, D / 2 + 2, 8, 18, "#3a3f4f", 2)}${rect(-x0 - 22, D / 2 + 2, 8, 18, "#3a3f4f", 2)}
    ${rect(x0 + 52, D / 2 + 2, 7, 12, "#2e3242", 2)}${rect(-x0 - 59, D / 2 + 2, 7, 12, "#2e3242", 2)}
    ${rect(x0, y0 + 4, W, D + 6, "#2a5e9e", 5)}
    ${rect(x0, y0, W, D, "#3d7fd0", 5)}
    ${rect(x0 + 3, y0 + 3, W - 6, 2.2, "#ffffff", 0, 0.85)}${rect(x0 + 3, y0 + D - 5.2, W - 6, 2.2, "#ffffff", 0, 0.85)}
    ${rect(x0 + 3, y0 + 3, 2.2, D - 6, "#ffffff", 0, 0.85)}${rect(-x0 - 5.2, y0 + 3, 2.2, D - 6, "#ffffff", 0, 0.85)}
    ${rect(x0 + 3, y0 + D / 2 - 0.8, W - 6, 1.6, "#ffffff", 0, 0.7)}
    ${rect(x0 + 6, y0 + 7, W / 2 - 12, 6, "#ffffff", 3, 0.07)}
    ${paddle(-62, -18, -28, "#ff6f91", "#3a3f4f")}
    ${paddle(66, 22, 150, "#4a5063", "#ff6f91")}
    ${ell(31, -24, 4, 1.6, "#000000", 0.18)}${circ(28, -29, 3.4, "#ffffff")}${circ(27, -30, 1.2, "#ffd27a", 0.5)}
    ${rect(2, y0 + 2, 6, D - 2, "#000000", 2, 0.14)}
    ${rect(-2, y0 - 10, 4, D + 8, "#e8ecf3", 1.5, 0.92)}
    ${rect(-2, y0 - 10, 4, 2.4, "#3a3f4f", 1.2)}
    ${rect(-3, y0 - 14, 6, 8, "#3a3f4f", 2)}${rect(-3, y0 + D - 4, 6, 8, "#3a3f4f", 2)}`;
}

// ---------------------------------------------------------------------------------------------
// seasonal decorations (DECOR[id].season)

const LIGHTS = ["#ffd27a", "#ff6f91", "#4fb6ff", "#4ff0a0", "#ff9f5a", "#b07cff"];
// A small light bulb that twinkles and glows brighter at night; (x, y) is the bulb's center.
const bulb = (x: number, y: number, c: string, r = 2.4) =>
  `<g class="dc-twinkle" style="animation-delay:${f(-Math.random() * 2.4)}s;animation-duration:${f(1.8 + Math.random() * 1.4)}s">${circ(x, y, r * 2.4, c, undefined, ` fill-opacity="0.32"${nightGlow(0.08)}`)}${circ(x, y, r, c)}${circ(x - r * 0.3, y - r * 0.3, r * 0.34, "#ffffff", 0.75)}</g>`;

// A pumpkin on the floor: ribbed halves, a light middle, a stem. (cx, base) is its bottom center.
function pumpkin(cx: number, base: number, w: number, h: number, tones: [string, string, string], stem = "#6b8f3a") {
  const ry = h / 2, cy = base - ry, top = base - h;
  return `
    ${ell(cx + 3, base + 1, w * 0.56, 4, SH, 0.18)}
    ${ell(cx - w * 0.27, cy, w * 0.27, ry * 0.93, tones[0])}${ell(cx + w * 0.27, cy, w * 0.27, ry * 0.93, tones[0])}
    ${ell(cx - w * 0.13, cy, w * 0.28, ry, tones[1])}${ell(cx + w * 0.13, cy, w * 0.28, ry, tones[1])}
    ${ell(cx, cy, w * 0.19, ry * 1.01, tones[2])}
    ${ell(cx + w * 0.32, cy + ry * 0.08, w * 0.16, ry * 0.78, "#000000", 0.08)}
    ${ell(cx - w * 0.19, cy - ry * 0.42, w * 0.06, ry * 0.28, "#ffffff", 0.22)}
    ${path(`M${f(cx - 2.2)} ${f(top + 2)} Q${f(cx - 3)} ${f(top - 5)} ${f(cx + 1.5)} ${f(top - 8)} L${f(cx + 4)} ${f(top - 6)} Q${f(cx + 1)} ${f(top - 3)} ${f(cx + 2.4)} ${f(top + 2)} Z`, stem)}`;
}

function pumpkins() {
  const g = uid("p");
  // the carved face of the front pumpkin: dark cut-outs by day, a flickering candle glow at night
  const face = (fill: string) => [
    "M-13 -24 L-6 -24 L-9.5 -30.5 Z", "M2 -24 L9 -24 L5.5 -30.5 Z", "M-4.2 -19 L0.2 -19 L-2 -22.6 Z",
    "M-15 -15 Q-2 -4 11 -15 L8 -13 L5 -15.6 L2 -12.6 L-1 -15.6 L-4 -12.6 L-7 -15.6 L-10 -13 Z",
  ].map((d) => path(d, fill)).join("");
  const fallen = [[-50, 4, 30, "#c95a3c"], [46, 6, -20, "#e2b941"], [-36, 9, 70, "#e08a3c"]]
    .map(([x, y, a, c]) => ell(x as number, y as number, 4.4, 2.2, c as string, 0.9, ` transform="rotate(${a} ${x} ${y})"`)).join("");
  return `
    <defs><radialGradient id="${g}"><stop offset="0" stop-color="#ffb347" stop-opacity="0.5"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>
    <g${nightGlow(0)}>${ell(-2, -8, 62, 26, `url(#${g})`)}</g>
    ${fallen}
    ${pumpkin(-20, -8, 56, 42, ["#d9692a", "#ec7f34", "#f6974a"])}
    ${pumpkin(35, -1, 32, 24, ["#e2a23a", "#efb64a", "#f8cb67"], "#7a8f3a")}
    ${pumpkin(-2, 0, 50, 38, ["#e06f2c", "#f2873a", "#ff9f5a"])}
    ${face("#7a3412")}
    <g${nightGlow(0.12)}><g class="dc-flicker">${face("#ffd27a")}</g></g>`;
}

function leafwreath() {
  const cy = -58, R = 17;
  const tones = [["#e2622f", "#c9512a"], ["#f2a03c", "#d98a2e"], ["#e8c14a", "#cfa83a"], ["#b5452e", "#9a3a26"], ["#c97a3a", "#ad6630"]];
  const ring = (n: number, r: number, len: number, wid: number, off: number, tilt: number) => Array.from({ length: n }, (_, i) => {
    const th = ((i + off) / n) * Math.PI * 2, t = tones[(i * 3 + Math.round(off * 2)) % tones.length];
    return leaf(Math.cos(th) * r, cy + Math.sin(th) * r, (th * 180) / Math.PI + 90 + tilt, len, wid, t[0], t[1]);
  }).join("");
  const acorn = (x: number, y: number, a: number) => `<g transform="rotate(${a} ${x} ${y})">${ell(x, y + 1.2, 2.8, 3.6, "#b07a40")}${ell(x - 0.8, y, 0.9, 1.6, "#ffffff", 0.25)}${ell(x, y - 2, 3.3, 1.9, "#6b4f3a")}${rect(x - 0.5, y - 5, 1, 2.4, "#6b4f3a")}</g>`;
  return `
    ${line(`M0 -92 L-6 ${cy - R - 3} M0 -92 L6 ${cy - R - 3}`, "#c9763a", 1.6)}${circ(0, -92, 1.9, "#4a5063")}
    <circle cx="0" cy="${cy + 2}" r="${R}" fill="none" stroke="#000000" stroke-opacity="0.08" stroke-width="8"/>
    <circle cx="0" cy="${cy}" r="${R}" fill="none" stroke="#8a6a48" stroke-width="7"/>
    ${ring(16, R, 13, 6, 0, 28)}${ring(12, R - 1, 10, 5, 0.5, 34)}
    ${acorn(10, cy + R + 1, -20)}${acorn(15, cy + R - 4, 15)}${acorn(5, cy + R + 3, 5)}
    ${path(`M0 ${cy - R - 3} L-7 ${cy - R - 7} L-7 ${cy - R + 1} Z`, "#c9452e")}${path(`M0 ${cy - R - 3} L7 ${cy - R - 7} L7 ${cy - R + 1} Z`, "#b03c28")}${circ(0, cy - R - 3, 2, "#e2622f")}`;
}

function xmastree() {
  const tiers: [number, number, number][] = [[-80, -24, 52], [-104, -58, 42], [-128, -86, 32], [-150, -110, 21]]; // top, bottom, half width
  const tier = ([top, bot, hw]: [number, number, number], i: number) => {
    const full = `M0 ${top} L${hw} ${bot} Q${f(hw * 0.5)} ${bot + 5} 0 ${bot + 2} Q${f(-hw * 0.5)} ${bot + 5} ${-hw} ${bot} Z`;
    const right = `M0 ${top} L${hw} ${bot} Q${f(hw * 0.5)} ${bot + 5} 0 ${bot + 2} Z`;
    return (i ? path(full, "#1f5e40", 0.55, ` transform="translate(0 4)"`) : "") + path(full, "#3f9b6e") + path(right, "#358a60");
  };
  // a garland of lights draped across each tier
  const garland = ([top, bot, hw]: [number, number, number], i: number) => {
    const k = 0.66, y0 = top + (bot - top) * k, w = hw * k, n = Math.max(3, Math.round(hw / 9));
    const a = [-w, y0 - 4], c = [0, y0 + 9], b = [w, y0 + 3];
    let s = line(`M${f(a[0])} ${f(a[1])} Q${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}`, "#ffe6ad", 1, 0.55);
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n, u = 1 - t;
      s += bulb(u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], LIGHTS[(j + i * 2) % LIGHTS.length], 2.3);
    }
    return s;
  };
  const ball = (x: number, y: number, c: string) => circ(x, y, 4.4, c) + circ(x + 1.4, y + 1, 2.6, "#000000", 0.12) + circ(x - 1.4, y - 1.4, 1.3, "#ffffff", 0.6) + rect(x - 1.2, y - 6, 2.4, 2, "#ffd27a", 0.6);
  return `
    ${ell(3, 1, 50, 7, SH, 0.2)}
    ${rect(-5, -30, 10, 8, "#8f6a47")}
    ${tiers.map(tier).join("")}
    ${ball(-24, -38, "#e2626b")}${ball(20, -44, "#ffd27a")}${ball(-12, -66, "#b07cff")}${ball(16, -92, "#e2626b")}${ball(-9, -118, "#4fb6ff")}${ball(30, -32, "#4fb6ff")}
    ${tiers.map(garland).join("")}
    ${path("M-15 -22 H15 L12 0 H-12 Z", "#e2626b")}${path("M5 -22 H15 L12 0 H4 Z", "#c94f5a")}${rect(-17, -26, 34, 6, "#f07a82", 3)}
    ${rect(-48, -17, 22, 17, "#4fb6ff", 2)}${rect(-32, -17, 6, 17, "#3a96e0", 2)}${rect(-38.5, -17, 3, 17, "#ffd27a")}${ell(-40.5, -18.5, 3.6, 2.2, "#ffd27a")}${ell(-33.5, -18.5, 3.6, 2.2, "#ffd27a")}
    ${rect(28, -13, 19, 13, "#ffd27a", 2)}${rect(42, -13, 5, 13, "#f0bf5f", 2)}${rect(36, -13, 2.6, 13, "#ff6f91")}${ell(34.5, -14.4, 3, 1.9, "#ff6f91")}${ell(40, -14.4, 3, 1.9, "#ff6f91")}
    <g${nightGlow(0.15)}>${circ(0, -152, 17, "#ffd27a", undefined, ` fill-opacity="0.3"`)}</g>
    <g class="dc-star"${pivot(0, -152)}>${path(star(0, -152, 11), "#ffd27a")}${path(star(0, -152, 5.5), "#fff3cf", 0.75)}</g>`;
}

function stringlights() {
  const sags: [number[], number[], number[]][] = [[[-54, -86], [-27, -62], [0, -84]], [[0, -84], [27, -62], [54, -86]]];
  let wire = "", bulbs = "", k = 0;
  for (const [a, c, b] of sags) {
    wire += `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]} `;
    for (const t of [0.14, 0.38, 0.62, 0.86]) {
      const u = 1 - t, x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
      bulbs += rect(x - 1.4, y - 0.5, 2.8, 3.2, "#3a3f4f", 0.8) + bulb(x, y + 5.6, LIGHTS[k++ % LIGHTS.length], 2.6);
    }
  }
  return `${line(wire, "#000000", 1.6, 0.08).replace("<path", `<path transform="translate(1 2)"`)}${line(wire, "#3a3f4f", 1.3)}
    ${circ(-54, -86, 1.9, "#4a5063")}${circ(0, -84, 1.9, "#4a5063")}${circ(54, -86, 1.9, "#4a5063")}${bulbs}`;
}

function snowglobe() {
  const flakes = [[-8, -88], [4, -92], [10, -84], [-3, -80], [7, -76], [-11, -78], [1, -86], [-5, -93], [12, -91]]
    .map(([x, y], i) => circ(x, y, 0.9 + (i % 3) * 0.25, "#ffffff", 0.95, ` class="dc-flake" style="animation-delay:${f(-i * 0.47)}s"`)).join("");
  return `
    ${ell(3, 1, 26, 5, SH, 0.2)}
    ${ell(0, -3, 15, 4, "#8f6a47")}${ell(0, -4.5, 12.5, 3, "#a87e54")}
    ${rect(-3, -50, 6, 46, "#a87e54")}${rect(0.6, -50, 2.4, 46, "#8f6a47")}
    ${rect(-27, -56, 54, 7, "#b48a5e", 3)}${ell(0, -56, 27, 5, "#d7b48a")}${ell(-8, -57, 10, 1.6, "#ffffff", 0.16)}
    ${ell(1, -57, 14, 2.6, SH, 0.18)}
    ${path("M-13 -57 L13 -57 L10.5 -65 L-10.5 -65 Z", "#b5452e")}${path("M5 -57 L13 -57 L10.5 -65 L4 -65 Z", "#9a3a26")}${rect(-12, -62, 24, 2.2, "#ffd27a", 1)}
    ${circ(0, -82, 18, "#dff1fb")}
    ${ell(0, -68, 13.5, 5, "#ffffff")}
    ${path("M-6 -88 L-1 -72 L-11 -72 Z", "#3f9b6e")}${path("M-6 -88 L-1 -72 L-6 -72 Z", "#358a60")}${rect(-7, -72, 2, 3, "#8f6a47")}
    ${rect(2, -76, 8, 7, "#e9edf5", 2)}${rect(2, -84, 8, 7, "#e9edf5", 2.2)}${rect(3.2, -82.6, 5.6, 3, "#3a3f4f", 1.2)}
    ${circ(4.6, -81.1, 0.7, "#4ff0a0")}${circ(7.4, -81.1, 0.7, "#4ff0a0")}${rect(1.6, -77, 8.8, 1.8, "#e2626b", 0.9)}${rect(8.4, -77, 1.8, 4, "#e2626b", 0.9)}
    ${flakes}
    <circle cx="0" cy="-82" r="18" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.2"/>
    ${line("M-12.5 -90 A14 14 0 0 1 -3 -96", "#ffffff", 2.4, 0.7)}${circ(9, -94, 1.4, "#ffffff", 0.6)}`;
}

function tulips() {
  const cols = [["#ff6f91", "#e8557a"], ["#ffd27a", "#f0bf5f"], ["#e2626b", "#c94f5a"], ["#b07cff", "#9562e8"], ["#ff9f5a", "#f07f3a"], ["#f7a6c4", "#e88fb0"], ["#ffffff", "#e9e4da"]];
  const xs = [-34, -23, -12, -1, 10, 21, 32], hs = [44, 54, 47, 58, 46, 55, 41];
  const flowers = xs.map((x, i) => {
    const h = hs[i], bend = i % 2 ? 3 : -3, tx = x + bend, ty = -28 - h, [c, s] = cols[i];
    const cup = `M${tx - 6} ${ty} C${tx - 7.5} ${ty - 8} ${tx - 5} ${ty - 12} ${tx - 3.5} ${ty - 13} L${tx - 1.5} ${ty - 9} L${tx} ${ty - 14} L${tx + 1.5} ${ty - 9} L${tx + 3.5} ${ty - 13} C${tx + 5} ${ty - 12} ${tx + 7.5} ${ty - 8} ${tx + 6} ${ty} Q${tx} ${ty + 4} ${tx - 6} ${ty} Z`;
    const half = `M${tx} ${ty - 14} L${tx + 1.5} ${ty - 9} L${tx + 3.5} ${ty - 13} C${tx + 5} ${ty - 12} ${tx + 7.5} ${ty - 8} ${tx + 6} ${ty} Q${tx + 3} ${ty + 2.4} ${tx} ${ty + 2.4} Z`;
    return `<g class="dc-sway"${pivot(x, -28, 4.5 + (i % 3) * 0.7)}>
      ${line(`M${x} -28 Q${f(x + bend * 0.2)} ${f(-28 - h * 0.5)} ${tx} ${ty + 1}`, "#3f9b6e", 2.2)}
      ${leaf(x, -28, i % 2 ? 16 : -16, 20 + (i % 3) * 3, 4.6, "#53b884", "#47a674")}
      ${path(cup, c)}${path(half, s)}${ell(tx - 2.6, ty - 6, 1.1, 3, "#ffffff", 0.3)}</g>`;
  }).join("");
  return `
    ${ell(3, 1, 50, 7, SH, 0.2)}
    ${ell(0, -29, 43, 3.4, "#5a3b2a")}
    ${flowers}
    ${rect(-44, -27, 88, 27, "#f1ece3", 3)}${rect(22, -27, 22, 27, "#ddd6ca", 3)}${rect(22, -27, 8, 27, "#ddd6ca")}
    ${rect(-44, -12, 88, 3, "#000000", 0, 0.04)}
    ${rect(-47, -31, 94, 6, "#f8f5ef", 3)}`;
}

function kite() {
  const d = "M0 -90 L19 -70 L0 -36 L-19 -70 Z";
  const bow = (x: number, y: number, c: string) => path(`M${x} ${y} L${x - 3.6} ${y - 2.4} L${x - 3.6} ${y + 2.4} Z M${x} ${y} L${x + 3.6} ${y - 2.4} L${x + 3.6} ${y + 2.4} Z`, c) + circ(x, y, 1, c);
  return `${circ(0, -92, 1.9, "#4a5063")}
    <g transform="rotate(-14 0 -66)">
      ${path(d, "#000000", 0.09, ` transform="translate(2 3)"`)}
      ${path("M0 -90 L-19 -70 L0 -70 Z", "#ff6f91")}${path("M0 -90 L19 -70 L0 -70 Z", "#ffd27a")}
      ${path("M-19 -70 L0 -36 L0 -70 Z", "#4fb6ff")}${path("M19 -70 L0 -36 L0 -70 Z", "#ff9f5a")}
      ${path("M0 -90 L-19 -70 L-15 -70 L0 -85 Z", "#ffffff", 0.25)}
      ${line("M0 -89 L0 -37 M-18 -70 L18 -70", "#8f6a47", 1.2, 0.85)}
      <g class="dc-tail"${pivot(0, -36)}>
        ${line("M0 -36 C7 -31 -5 -27 2 -22 C8 -18 1 -15 6 -12", "#3a3f4f", 1)}
        ${bow(3, -31, "#ff6f91")}${bow(1, -24, "#4fb6ff")}${bow(4.5, -17, "#ffd27a")}
      </g>
    </g>`;
}

function deskfan() {
  const H = -108;
  const spokes = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `M${f(Math.cos(a) * 6)} ${f(H + Math.sin(a) * 6)} L${f(Math.cos(a) * 29)} ${f(H + Math.sin(a) * 29)}`; }).join(" ");
  const blade = (a: number) => `<g transform="rotate(${a})">${path("M0 0 C-9 -6 -10 -22 0 -25.5 C10 -22 9 -6 0 0 Z", "#7cc6ff")}${path("M0 0 C9 -6 10 -22 0 -25.5 C3 -18 3 -8 0 0 Z", "#a8dcff")}</g>`;
  return `
    ${ell(2, 1, 26, 5, SH, 0.2)}
    ${ell(0, -4, 22, 6, "#3a3f4f")}${ell(0, -6, 20, 5, "#4a5063")}${ell(-6, -7.5, 7, 1.6, "#ffffff", 0.12)}
    ${rect(-2.5, -86, 5, 82, "#c9cfdb", 2)}${rect(0.6, -86, 1.9, 82, "#a9b0bf", 1)}
    ${rect(-6, -92, 12, 10, "#4a5063", 3)}
    <g class="dc-turn"${pivot(0, H)}>
      ${circ(0, H, 30, "#ffffff", 0.14)}
      ${circ(0, H, 25, "#7cc6ff", 0.14)}
      <g transform="translate(0 ${H})"><g class="dc-spin">${blade(0)}${blade(120)}${blade(240)}</g></g>
      ${circ(0, H, 6, "#ff6f91")}${circ(-1.6, H - 1.6, 2, "#ffffff", 0.45)}
      <g fill="none" stroke="#c9cfdb"><circle cx="0" cy="${H}" r="20" stroke-width="1" stroke-opacity="0.55"/><circle cx="0" cy="${H}" r="11" stroke-width="1" stroke-opacity="0.45"/>
        <path d="${spokes}" stroke-width="0.8" stroke-opacity="0.4"/><circle cx="0" cy="${H}" r="29" stroke-width="2.6"/></g>
    </g>`;
}

function palm() {
  const cx = 2, cy = -100; // where the fronds leave the trunk
  // one frond: an arching midrib with leaflets on both sides
  const frond = (a: number, L: number, droop: number, c: string, s: string) => {
    const r = (a * Math.PI) / 180;
    const tip = [cx + Math.cos(r) * L, cy + Math.sin(r) * L * 0.6 + droop], ctl = [cx + Math.cos(r) * L * 0.55, cy + Math.sin(r) * L * 0.75 - 16];
    const at = (t: number) => { const u = 1 - t; return [u * u * cx + 2 * u * t * ctl[0] + t * t * tip[0], u * u * cy + 2 * u * t * ctl[1] + t * t * tip[1]]; };
    let out = line(`M${cx} ${cy} Q${f(ctl[0])} ${f(ctl[1])} ${f(tip[0])} ${f(tip[1])}`, s, 2.4);
    for (let t = 0.14; t < 0.96; t += 0.135) {
      const [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.02));
      const dir = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI, len = 19 * (1 - t * 0.6);
      out += leaf(x, y, dir + 90 - 42, len, 4.4, c, s) + leaf(x, y, dir + 90 + 42, len, 4.4, s, c);
    }
    return out;
  };
  let trunk = "";
  for (let k = 0; k < 7; k++) {
    const y0 = -34 - k * 9.6, x = k * k * 0.05;
    trunk += path(`M${f(x - 5)} ${f(y0)} L${f(x + 5)} ${f(y0)} L${f(x + 4.2)} ${f(y0 - 10.4)} L${f(x - 4.2)} ${f(y0 - 10.4)} Z`, k % 2 ? "#a87e54" : "#b88d60") + rect(x + 1.2, y0 - 10.4, 3, 10.4, "#000000", 0, 0.1);
  }
  return `
    ${ell(4, 1, 36, 7, SH, 0.2)}
    ${trunk}
    <g class="dc-sway"${pivot(cx, cy, 6.5)}>
      ${frond(-150, 54, 16, "#2f7f58", "#276d4b")}${frond(-30, 56, 16, "#2f7f58", "#276d4b")}${frond(-90, 42, 0, "#3f9b6e", "#358a60")}
      ${frond(-178, 58, 30, "#53b884", "#47a674")}${frond(-2, 58, 30, "#53b884", "#47a674")}${frond(-118, 50, 6, "#5cc48e", "#4fb380")}${frond(-62, 50, 6, "#5cc48e", "#4fb380")}
      ${circ(cx - 4, cy + 3, 4, "#8f6a47")}${circ(cx + 4, cy + 4, 4, "#7a5a3c")}${circ(cx, cy + 6, 3.6, "#a87e54")}
    </g>
    ${path("M-22 -34 H22 L18 -3 Q17.5 0 15 0 H-15 Q-17.5 0 -18 -3 Z", "#d9b27c")}${path("M7 -34 H22 L18 -3 Q17.5 0 15 0 H5 Z", "#c49a63")}
    ${rect(-21, -26, 42, 3, "#b8874f", 0, 0.6)}${rect(-20, -15, 39, 3, "#b8874f", 0, 0.6)}
    ${rect(-25, -40, 50, 8, "#e6c48f", 4)}${rect(6, -40, 19, 8, "#d4b07a", 4)}${ell(0, -37.5, 20, 3.4, "#5a3b2a")}`;
}

function beachposter() {
  const x0 = -38, y0 = -90, W = 76, H = 56;
  return `
    ${rect(x0 + 1, y0 + 2, W, H, "#000000", 3, 0.08)}
    ${rect(x0, y0, W, H, "#8fd6ff", 3)}
    ${circ(22, -78, 10, "#ffd27a", 0.3)}${circ(22, -78, 7, "#ffd27a")}
    ${rect(x0, -66, W, 10, "#4fb6ff")}${rect(x0, -66, W, 1.6, "#c4ecff")}${rect(x0 + 8, -61, 14, 1.2, "#c4ecff", 0.6, 0.8)}${rect(x0 + 44, -59, 10, 1.2, "#c4ecff", 0.6, 0.8)}
    ${path(`M${x0} -57 Q0 -60 ${x0 + W} -56 V-44 H${x0} Z`, "#ffe3a3")}
    ${line("M-27 -46 Q-30 -60 -24 -74", "#8f6a47", 2.4)}
    ${[-70, -30, 10, 50, 90].map((a, i) => leaf(-24, -74, a, 11, 3, i % 2 ? "#3f9b6e" : "#53b884", i % 2 ? "#358a60" : "#47a674")).join("")}
    ${line("M15 -46 L19 -65", "#3a3f4f", 1.2)}
    ${path("M6 -63 Q18 -77 32 -67 Z", "#ff6f91")}${path("M15 -65 Q19 -74 23 -69 L24 -66 Z", "#ffffff", 0.9)}
    ${rect(-12, -51, 25, 6, "#4fb6ff", 1.5)}${rect(-7, -51, 3, 6, "#ffffff", 0, 0.8)}${rect(3, -51, 3, 6, "#ffffff", 0, 0.8)}
    ${rect(-8, -54, 11, 5, "#e9edf5", 2)}${rect(3, -57.5, 7.5, 6.5, "#e9edf5", 2)}${rect(4, -55.8, 5.6, 2.2, "#3a3f4f", 1)}
    ${line("M6.7 -57.5 L6.7 -60", "#a9b0bf", 0.8)}${circ(6.7, -60.6, 1, "#ff6f91")}
    ${rect(x0, -44, W, 10, "#ff6f91", 3)}${rect(x0, -44, W, 4, "#ff6f91")}
    <text x="0" y="-36.8" text-anchor="middle" font-size="6" font-weight="700" letter-spacing="0.4" fill="#ffffff"${FONT}>OUT OF OFFICE</text>
    ${circ(0, -90, 2.2, "#ff9f5a")}${circ(-0.7, -90.7, 0.8, "#ffffff", 0.6)}`;
}

const ART: Record<DecorId, () => string> = {
  plants, rug, posters, bookshelf, coffee, water, arcade, aquarium, neon, beanbags, pingpong, trophies,
  pumpkins, leafwreath, xmastree, stringlights, snowglobe, tulips, kite, deskfan, palm, beachposter,
};

// Natural size multiplier per item, and its drawn extent around the anchor at scale 1
// (before the multiplier): [x0, y0, x1, y1]. Used for placement and collision.
const NAT: Record<DecorId, number> = {
  plants: 1.2, rug: 1.1, posters: 1.04, bookshelf: 1.25, coffee: 1.25, water: 1.3, arcade: 1.3, aquarium: 1.3, neon: 1, beanbags: 1.3, pingpong: 1.2, trophies: 1.08,
  pumpkins: 1.15, leafwreath: 1, xmastree: 0.94, stringlights: 1, snowglobe: 1.2, tulips: 1.15, kite: 1, deskfan: 1.15, palm: 1.12, beachposter: 1.04,
};
const BOX: Record<DecorId, [number, number, number, number]> = {
  plants: [-70, -124, 62, 10],
  rug: [-155, -76, 155, 79],
  posters: [-52, -90, 52, -22],
  bookshelf: [-52, -108, 52, 6],
  coffee: [-50, -124, 50, 8],
  water: [-26, -112, 32, 8],
  arcade: [-38, -146, 38, 14],
  aquarium: [-60, -116, 60, 9],
  neon: [-50, -93, 50, -24],
  beanbags: [-90, -36, 92, 38],
  pingpong: [-122, -78, 122, 88],
  trophies: [-50, -84, 50, -18],
  pumpkins: [-56, -60, 58, 9],
  leafwreath: [-34, -94, 34, -24],
  xmastree: [-54, -169, 54, 8],
  stringlights: [-58, -92, 58, -56],
  snowglobe: [-28, -101, 30, 7],
  tulips: [-50, -103, 53, 8],
  kite: [-28, -95, 34, -9],
  deskfan: [-31, -140, 31, 6],
  palm: [-62, -142, 66, 8],
  beachposter: [-40, -93, 40, -32],
};
// How far a standing item reaches back from its front edge (its floor depth), so it can stand against the north wall.
const DEPTH: Partial<Record<DecorId, number>> = { plants: 16, bookshelf: 14, coffee: 26, water: 12, arcade: 20, aquarium: 18, pumpkins: 22, xmastree: 24, snowglobe: 12, tulips: 14, deskfan: 14, palm: 18 };

/** One decoration drawn at (x, y) as its anchor. See the conventions at the top of the file. */
export function drawDecor(id: DecorId, x: number, y: number, scale = 1): string {
  const k = scale * NAT[id];
  return `<g class="dc dc-${id}" transform="translate(${f(x)} ${f(y)}) scale(${(Math.round(k * 1000) / 1000).toString()})">${ART[id]()}</g>`;
}

// ---------------------------------------------------------------------------------------------
// placement

type B = { x0: number; y0: number; x1: number; y1: number };
const boxAt = (id: DecorId, x: number, y: number, s: number): B => {
  const k = s * NAT[id], b = BOX[id];
  return { x0: x + b[0] * k, y0: y + b[1] * k, x1: x + b[2] * k, y1: y + b[3] * k };
};
const hit = (a: B, b: B, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;
const gapBetween = (a: B, b: B) => {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1), dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1);
  return Math.hypot(dx, dy);
};
const toB = (r: Rect): B => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });

export type PlacedDecor = { id: DecorId; x: number; y: number; scale: number };
/** Floor collision, shared with office navigation. Wall art and rugs do not block walking. */
export function decorFootprint(p: PlacedDecor): Rect | null {
  if (["rug", "posters", "neon", "trophies", "leafwreath", "stringlights", "kite", "beachposter"].includes(p.id)) return null;
  const b = boxAt(p.id, p.x, p.y, p.scale), depth = DEPTH[p.id];
  const top = depth == null ? b.y0 : p.y - depth * p.scale * NAT[p.id];
  return { x: b.x0, y: top, w: b.x1 - b.x0, h: b.y1 - top };
}
export type PlaceOptions = {
  /** Extra areas to keep clear, in room coordinates. Defaults to the room sign (top left) and the wall clock (top right) of world.ts. */
  avoid?: Rect[];
  /** Window openings on the wall face. Defaults to windowSlots(w). */
  windows?: { x: number; w: number }[];
  /** Wall top thickness. Default 16. */
  wallTop?: number;
};

/**
 * Where decorations go in a room of size w x h. Wall items hang on the north wall face between
 * windows; standing items prefer corners and walls; flat items take open floor. Nothing overlaps
 * a desk, the south door or another item (beanbags may sit on the rug). Items that do not fit,
 * even at 72% size, are left out. Draw the result in the returned order (back to front).
 */
export function placeDecor(items: DecorId[], w: number, h: number, wallFace: number, deskRects: Rect[], opts: PlaceOptions = {}): PlacedDecor[] {
  const T = opts.wallTop ?? 16;
  const wins = (opts.windows ?? windowSlots(w)).map((r) => ({ x0: r.x, y0: T + 10, x1: r.x + r.w, y1: wallFace - 6 }));
  const avoid = (opts.avoid ?? [{ x: 30, y: T, w: 148, h: wallFace - T }, { x: w - 112, y: T, w: 64, h: 66 }]).map(toB);
  const desks = deskRects.map(toB);
  const door: B = { x0: w / 2 - 80, y0: h - T - 64, x1: w / 2 + 80, y1: h };
  const want = [...new Set(items)];
  const placed: { id: DecorId; x: number; y: number; s: number; b: B }[] = [];
  const SCALES = [1, 0.85, 0.72];

  const blocked = (id: DecorId, b: B) => {
    if (b.y0 < T || b.x0 < T || b.x1 > w - T || b.y1 > h - T) return true;
    for (const d of desks) if (hit(b, d, 8)) return true;
    for (const a of avoid) if (hit(b, a, 4)) return true;
    for (const p of placed) {
      if (id === "beanbags" && p.id === "rug") continue;
      if (hit(b, p.b, 6)) return true;
    }
    return false;
  };
  const obstacles = () => [...desks, ...avoid, door, ...placed.filter((p) => p.id !== "rug").map((p) => p.b), ...placed.filter((p) => p.id === "rug").map((p) => p.b)];

  const put = (id: DecorId, score: (x: number, y: number, s: number, b: B) => number | null, xs: (s: number) => number[], ys: (s: number) => number[], scales = SCALES) => {
    for (const s of scales) {
      let best: { x: number; y: number; v: number } | null = null;
      for (const y of ys(s)) for (const x of xs(s)) {
        const b = boxAt(id, x, y, s);
        if (blocked(id, b)) continue;
        const v = score(x, y, s, b);
        if (v == null) continue;
        if (!best || v > best.v) best = { x, y, v };
      }
      if (best) { placed.push({ id, x: Math.round(best.x), y: Math.round(best.y), s, b: boxAt(id, best.x, best.y, s) }); return; }
    }
  };
  const range = (a: number, b: number, step: number) => { const out: number[] = []; for (let v = a; v <= b + 0.01; v += step) out.push(v); return out; };
  const k = (id: DecorId, s: number) => s * NAT[id];
  const xsFor = (id: DecorId, step: number) => (s: number) => range(T + 4 - BOX[id][0] * k(id, s), w - T - 4 - BOX[id][2] * k(id, s), step);
  // the items of one spot in placing order: the listed ones first, then any others (seasonal ones) as asked for
  const ofSpot = (spot: Spot, first: DecorId[]) => [...first.filter((i) => want.includes(i)), ...want.filter((i) => DECOR[i]?.spot === spot && !first.includes(i))];

  // 1. wall items: centered in the widest free stretch of wall, shrinking a little to fit narrow gaps
  for (const id of ofSpot("wall", ["neon", "posters", "trophies"])) {
    put(id, (_x, _y, _s, b) => {
      if (wins.some((wn) => hit(b, wn, 3))) return null;
      let left = b.x0 - T, right = w - T - b.x1;
      for (const o of [...wins, ...avoid, ...placed.map((p) => p.b)]) {
        if (o.y1 < b.y0 || o.y0 > b.y1) continue;
        if (o.x1 <= b.x0) left = Math.min(left, b.x0 - o.x1);
        if (o.x0 >= b.x1) right = Math.min(right, o.x0 - b.x1);
      }
      return Math.min(left, right) - Math.abs(left - right) * 0.02;
    }, xsFor(id, 3), () => [wallFace], [1, 0.92, 0.85, 0.78, 0.72]);
  }

  // open-floor score: distance to the nearest thing, capped, with a gentle pull to the middle
  const clearance = (b: B, cap: number) => {
    let c = Math.min(b.x0 - T, w - T - b.x1, b.y0 - wallFace, h - T - b.y1);
    for (const o of obstacles()) c = Math.min(c, gapBetween(b, o));
    return Math.min(c, cap);
  };
  const floorY = (id: DecorId) => (s: number) => range(wallFace + 8 - BOX[id][1] * k(id, s), h - T - 4 - BOX[id][3] * k(id, s), 8);
  const centerPull = (b: B) => -0.01 * Math.hypot((b.x0 + b.x1) / 2 - w / 2, (b.y0 + b.y1) / 2 - (wallFace + h) / 2);
  const flat = (id: DecorId, cap: number) => put(id, (_x, _y, _s, b) => (hit(b, door, 0) ? null : clearance(b, cap) + centerPull(b)), xsFor(id, 8), floorY(id));

  // 2. the ping pong table needs the most open floor
  if (want.includes("pingpong")) flat("pingpong", 140);

  // 3. standing items: corners first (north ones preferred, where we see their fronts), then along a wall
  const standY = (id: DecorId) => (s: number) => {
    const kk = k(id, s);
    const lo = Math.max(wallFace + (DEPTH[id] ?? 12) * kk + 2, T + 2 - BOX[id][1] * kk);
    return range(lo, h - T - 4 - BOX[id][3] * kk, 6);
  };
  for (const id of ofSpot("corner", ["aquarium", "arcade", "bookshelf", "coffee", "water", "plants"])) {
    put(id, (_x, y, s, b) => {
      if (hit(b, door, 0)) return null;
      const back = y - (DEPTH[id] ?? 12) * k(id, s);
      const dx = Math.min(b.x0 - T, w - T - b.x1), dy = Math.min(back - wallFace, h - T - b.y1 + 40);
      let v = -(dx + dy);
      if (wins.some((wn) => hit(b, wn, 0))) v -= 400;
      // a little air between standing pieces so they read as separate things
      for (const p of placed) if (p.id !== "rug" && gapBetween(b, p.b) < 12) v -= 25;
      return v;
    }, xsFor(id, 6), standY(id));
  }

  // 4. the rug takes the most open floor that is left
  if (want.includes("rug")) flat("rug", 90);

  // 5. beanbags gather on the rug, or find open floor
  if (want.includes("beanbags")) {
    const rugP = placed.find((p) => p.id === "rug");
    put("beanbags", (_x, _y, _s, b) => {
      if (hit(b, door, 0)) return null;
      if (rugP) {
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        return -Math.hypot(cx - (rugP.b.x0 + rugP.b.x1) / 2, cy - (rugP.b.y0 + rugP.b.y1) / 2 + 4);
      }
      return clearance(b, 70) + centerPull(b);
    }, xsFor("beanbags", 6), floorY("beanbags"), rugP ? [rugP.s, rugP.s * 0.9, rugP.s * 0.8].filter((v) => v >= 0.6) : SCALES);
  }

  // back to front: the rug first, then by where each item meets the floor
  const foot = (p: (typeof placed)[number]) => (p.id === "rug" ? -1e9 : DECOR[p.id].spot === "wall" ? wallFace - 1000 + p.x * 1e-3 : p.b.y1);
  return placed.sort((a, b) => foot(a) - foot(b)).map((p) => ({ id: p.id, x: p.x, y: p.y, scale: p.s }));
}
