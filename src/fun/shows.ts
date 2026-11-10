// Botflix catalogue: twenty parody shows. Each one is a small drawn stage (178 x 100 units) with a cast,
// a title treatment, subtitles and close-up cameras, so the same drawing serves tiles, posters, the hero,
// previews and the episode player. Names are invented; only genre moods are borrowed.
import { C, type Bot, type Ctx, circle, drawBot, drawGPU, ellipse, fillRR, glow, limb, lin, poly, rad, shade, withAlpha } from "./draw";
import { VIDEOS } from "./videos";
import { clamp, hash, lerp, seg, smooth } from "./util";
import { canvasText, canvasLabel } from "../localization-canvas";

export const SW = 178, SH = 100;
/** Canvas clocks can read NaN or negative for a frame. Never let that reach the drawing. */
export const safeT = (t: number) => (Number.isFinite(t) ? Math.max(0, t) : 0);

type Pt = [number, number];
export interface Line { who: number; text: string; r?: "laugh" | "surprised" }
export interface Cam { x: number; y: number; z: number; ax?: number; ay?: number }
type FontKey = "sans" | "serif" | "mono" | "cjk" | "cond" | "script";

export interface TitleStyle {
  font: FontKey; weight?: number; italic?: boolean; track?: number; lines: string[]; scale?: number[]; lead?: number;
  fill: string[]; stroke?: string; strokeW?: number; hollow?: boolean; glow?: string; glowR?: number; skew?: number;
  multi?: string[]; plate?: string; sub?: string; subFont?: FontKey; subColor?: string; subTrack?: number; subWeight?: number; subSize?: number;
  /** Decoration under the lines, drawn into extraH x size of reserved space. */
  extra?: (ctx: Ctx, x: number, y: number, w: number, h: number, size: number) => void; extraH?: number;
}

export interface ShowDef {
  id: string; title: string; kind: "Series" | "Docuseries" | "Film" | "Special";
  year: number; rating: string; seasons: number; season: number; epLen: number; match: number;
  tags: string[]; cast: string[]; synopsis: string; eps: string[];
  title2: TitleStyle; tone: string;
  world(ctx: Ctx, t: number, sp: number): void;
  focus: Pt[]; cz?: number; key: Cam; hero?: Cam; poster?: Cam;
  lines: Line[]; broll?: string[]; thumbT: number; ribbon?: string;
}

// --- fonts ---------------------------------------------------------------------------
const SANS = '"Lexend Variable", system-ui, sans-serif';
const FONT: Record<FontKey, string> = {
  sans: SANS,
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  cjk: '"Yu Gothic UI", "Yu Gothic", Meiryo, "Hiragino Sans", "Noto Sans CJK JP", sans-serif',
  cond: `"Bahnschrift", ${SANS}`,
  script: '"Segoe Script", "Brush Script MT", "Snell Roundhand", Georgia, serif',
};
const fontOK = new Map<string, boolean>();
function hasFont(name: string) {
  let v = fontOK.get(name);
  if (v === undefined) {
    const c = document.createElement("canvas").getContext("2d")!;
    c.font = `40px "${name}", monospace`;
    const a = c.measureText("BOTFLIX wmi 0123").width;
    c.font = "40px monospace";
    v = Math.abs(a - c.measureText("BOTFLIX wmi 0123").width) > 0.5;
    fontOK.set(name, v);
  }
  return v;
}

// --- title art -----------------------------------------------------------------------
function setFont(ctx: Ctx, font: FontKey, size: number, weight: number, italic?: boolean) {
  ctx.font = `${italic ? "italic " : ""}${weight} ${size}px ${FONT[font]}`;
  const cond = font === "cond" && hasFont("Bahnschrift");
  ctx.fontStretch = cond ? "condensed" : "normal";
  // without a condensed face, squeeze the fallback a little so the treatment keeps its shape
  return font === "cond" && !cond ? 0.82 : 1;
}

function blockOf(ctx: Ctx, s: TitleStyle, maxW: number, size: number, maxH: number) {
  const sc = s.scale ?? s.lines.map(() => 1);
  const tr = s.track ?? 0;
  const widths = s.lines.map((ln, i) => {
    const sz = size * sc[i];
    const hs = setFont(ctx, s.font, sz, s.weight ?? 800, s.italic);
    ctx.letterSpacing = `${tr * sz}px`;
    return Math.max(1, (ctx.measureText(ln).width - tr * sz) * hs + Math.abs(s.skew ?? 0) * sz * 0.6);
  });
  ctx.letterSpacing = "0px";
  let k = Math.min(1, ...widths.map((w) => maxW / w));
  const lead = s.lead ?? 0.96;
  const subH = (s.sub ? size * (s.subSize ?? 0.2) * 1.9 : 0) + size * (s.extraH ?? 0);
  let h = sc.reduce((a, v) => a + v * size * lead, 0) + subH;
  if (h * k > maxH) k = maxH / h;
  h *= k;
  return { k, h, w: Math.max(...widths) * k, widths, sc, lead };
}

/** Measure the title block without drawing it. */
export function titleSize(ctx: Ctx, s: TitleStyle, maxW: number, size: number, maxH = Infinity) {
  ctx.save();
  const b = blockOf(ctx, s, maxW, size, maxH);
  ctx.restore();
  return b;
}

/** Draw a show's title treatment with its top edge at y. */
export function drawTitle(ctx: Ctx, s: TitleStyle, x: number, y: number, maxW: number, size: number, align: "left" | "center" = "left", maxH = Infinity) {
  ctx.save();
  const B = blockOf(ctx, s, maxW, size, maxH);
  const S = Math.abs(ctx.getTransform().a) || 1;
  const x0 = align === "center" ? x - B.w / 2 : x;
  if (s.plate) {
    ctx.save();
    ctx.translate(x0 + B.w / 2, y + B.h / 2);
    ctx.rotate(-0.025);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = size * 0.25 * B.k * S;
    ctx.shadowOffsetY = size * 0.06 * B.k * S;
    fillRR(ctx, -B.w / 2 - size * 0.22 * B.k, -B.h / 2 - size * 0.14 * B.k, B.w + size * 0.44 * B.k, B.h + size * 0.22 * B.k, size * 0.04, s.plate);
    ctx.restore();
  }
  let cy = y;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const tr = s.track ?? 0;
  s.lines.forEach((ln, i) => {
    const sz = size * B.sc[i] * B.k;
    const lw = B.widths[i] * B.k;
    const lx = align === "center" ? x - lw / 2 : x;
    const by = cy + sz * 0.8;
    ctx.save();
    ctx.translate(lx, by);
    const hs = setFont(ctx, s.font, sz, s.weight ?? 800, s.italic);
    ctx.letterSpacing = `${tr * sz}px`;
    if (hs !== 1) ctx.scale(hs, 1);
    if (s.skew) ctx.transform(1, 0, -s.skew, 1, 0, 0);
    const grad = s.fill.length > 1 ? lin(ctx, 0, -sz * 0.76, 0, sz * 0.06, s.fill.map((c, j) => [j / (s.fill.length - 1), c] as [number, string])) : s.fill[0];
    const paint = (shadowPass: boolean) => {
      if (shadowPass) {
        ctx.shadowColor = s.glow ?? "rgba(0,0,0,0.6)";
        ctx.shadowBlur = (s.glow ? (s.glowR ?? 0.22) : 0.1) * sz * S;
        ctx.shadowOffsetY = s.glow ? 0 : sz * 0.035 * S;
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      if (s.stroke) {
        ctx.lineJoin = "round";
        ctx.lineWidth = sz * (s.strokeW ?? 0.06) * (s.hollow ? 1 : 2);
        ctx.strokeStyle = s.stroke;
        ctx.strokeText(ln, 0, 0);
      }
      if (s.hollow) { ctx.fillStyle = "rgba(8,0,2,0.6)"; ctx.fillText(ln, 0, 0); return; }
      if (s.multi) {
        let cx = 0;
        [...ln].forEach((ch, j) => {
          ctx.fillStyle = ch === " " ? "transparent" : s.multi![j % s.multi!.length];
          ctx.fillText(ch, cx, 0);
          cx += ctx.measureText(ch).width;
        });
      } else {
        ctx.fillStyle = grad;
        ctx.fillText(ln, 0, 0);
      }
    };
    paint(true);
    paint(false);
    ctx.restore();
    cy += sz * B.lead;
  });
  if (s.sub) {
    const sz = size * (s.subSize ?? 0.2) * B.k;
    setFont(ctx, s.subFont ?? "sans", sz, s.subWeight ?? 500);
    ctx.letterSpacing = `${(s.subTrack ?? 0.08) * sz}px`;
    const subtitle = canvasText(s.sub);
    const w = Math.min(maxW, ctx.measureText(subtitle).width - (s.subTrack ?? 0.08) * sz);
    const sx = align === "center" ? x - w / 2 : x + (s.skew ? sz * 0.2 : 0);
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = sz * 0.5 * S;
    ctx.fillStyle = s.subColor ?? "#ffffff";
    ctx.fillText(subtitle, sx, cy + sz * 1.25, maxW);
  }
  ctx.letterSpacing = "0px";
  ctx.shadowColor = "transparent";
  s.extra?.(ctx, x0, y, B.w, cy - y, size * B.k);
  ctx.restore();
  return B;
}

// --- stage and camera ------------------------------------------------------------------
/** Draw a show's stage into a w x h view, framed by a camera. Backgrounds bleed so the camera can drift. */
export function renderStage(ctx: Ctx, show: ShowDef, w: number, h: number, t: number, cam: Cam, sp = -1) {
  const k = Math.max(w / SW, h / SH) * Math.max(1, cam.z);
  const bx = 34 * k, by = 6 * k;
  let ox = w * (cam.ax ?? 0.5) - cam.x * k, oy = h * (cam.ay ?? 0.5) - cam.y * k;
  ox = clamp(ox, w - SW * k - bx, bx);
  oy = clamp(oy, h - SH * k - by, by);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  show.world(ctx, safeT(t), sp);
  ctx.restore();
}

export type ArtKind = "tile" | "poster" | "card" | "plain" | "ep";

/** Tile, poster and preview art: the stage with a grade and the title treatment on top. */
export function drawArt(ctx: Ctx, show: ShowDef, w: number, h: number, kind: ArtKind, t = show.thumbT, ep = 0) {
  t = safeT(t);
  const tall = kind === "poster";
  let cam: Cam = tall ? show.poster ?? { ...show.key, z: 1 } : show.key;
  if (kind === "ep") {
    const f = show.focus[ep % show.focus.length];
    cam = { x: f[0], y: f[1] + 4, z: (show.cz ?? 2.3) * 0.8 };
    t = show.thumbT + ep * 3.1;
  }
  renderStage(ctx, show, w, h, t, cam);
  if (kind === "plain" || kind === "ep") return;
  // grade: a soft floor of shade so the title reads on any art
  ctx.fillStyle = lin(ctx, 0, h * (tall ? 0.45 : 0.35), 0, h, [[0, "rgba(5,5,8,0)"], [1, "rgba(5,5,8,0.78)"]]);
  ctx.fillRect(0, 0, w, h);
  const T = show.title2;
  if (tall) {
    const size = w * 0.26;
    const b = titleSize(ctx, T, w * 0.86, size, h * 0.3);
    drawTitle(ctx, T, w / 2, h - b.h - h * 0.07, w * 0.86, size, "center", h * 0.3);
  } else {
    const size = h * (kind === "card" ? 0.26 : 0.3);
    const maxW = w * (kind === "card" ? 0.62 : 0.74);
    const b = titleSize(ctx, T, maxW, size, h * 0.46);
    drawTitle(ctx, T, w * 0.065, h - b.h - h * (show.ribbon && kind === "tile" ? 0.2 : 0.1), maxW, size, "left", h * 0.46);
  }
  // originals mark
  const m = Math.max(7, Math.min(w, h) * 0.13);
  ctx.save();
  ctx.font = `900 ${m}px ${SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = m * 0.4 * (Math.abs(ctx.getTransform().a) || 1);
  ctx.fillStyle = "#ff3a44";
  ctx.fillText("B", m * 0.45, m * 0.35);
  ctx.restore();
  if (show.ribbon && kind === "tile") {
    const rh = Math.max(9, h * 0.13);
    ctx.fillStyle = "#e3283a";
    ctx.fillRect(w * 0.065, h - rh * 1.25, Math.min(w * 0.5, rh * 6.4), rh);
    ctx.font = `600 ${rh * 0.62}px ${SANS}`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(canvasText(show.ribbon), w * 0.065 + rh * 0.4, h - rh * 0.75, Math.min(w * 0.5, rh * 6.4) - rh * 0.8);
  }
}

// --- figures -----------------------------------------------------------------------------
type HeadItem = "top" | "chef" | "cowboy" | "cap" | "tiara" | "mask" | "headband" | "spiky" | "beanie" | "bow" | "fedora" | "headset" | "glasses" | "bun" | "ears";
type Wear = "apron" | "tie" | "bowtie" | "badge" | "coat" | "tails" | "pearls" | "sailor" | "scarf" | "jacket" | "poncho" | "num";
interface Fig extends Bot { head?: HeadItem[]; wear?: Wear[]; num?: string; tone?: string; alpha?: number }

function inBody(ctx: Ctx, x: number, y: number, s: number, p: Bot, fn: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s * (p.squash ?? 1));
  ctx.translate(0, -12);
  ctx.rotate(p.lean ?? 0);
  ctx.translate(0, 12);
  fn();
  ctx.restore();
}
function inHead(ctx: Ctx, x: number, y: number, s: number, p: Bot, fn: () => void) {
  inBody(ctx, x, y, s, p, () => { ctx.translate(0, -27.5); ctx.rotate(p.tilt ?? 0); fn(); });
}

function figure(ctx: Ctx, x: number, y: number, s: number, p: Fig) {
  if (p.alpha !== undefined) { ctx.save(); ctx.globalAlpha = p.alpha; }
  const tone = p.tone ?? "#2a2f66";
  drawBot(ctx, x, y, s, { ...p, antenna: p.antenna ?? !(p.head && p.head.some((h) => h === "top" || h === "chef" || h === "cowboy" || h === "fedora" || h === "cap" || h === "beanie")) });
  if (p.wear) inBody(ctx, x, y, s, p, () => {
    for (const w of p.wear!) {
      if (w === "apron") { fillRR(ctx, -7.5, -24, 15, 14, 3, "#f3ece1"); fillRR(ctx, -4, -21, 8, 3, 1.2, withAlpha(tone, 0.8)); }
      else if (w === "tie") { poly(ctx, [[-1.6, -26.5], [1.6, -26.5], [2.2, -16], [0, -13.5], [-2.2, -16]], tone); }
      else if (w === "bowtie") { poly(ctx, [[0, -26], [-4, -28], [-4, -24]], tone); poly(ctx, [[0, -26], [4, -28], [4, -24]], tone); circle(ctx, 0, -26, 1.1, shade(tone, 0.2)); }
      else if (w === "badge") { const r = 2.4; poly(ctx, Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, q = i % 2 ? r * 0.45 : r; return [-4.5 + Math.cos(a) * q, -21 + Math.sin(a) * q] as Pt; }), "#ffd36b"); }
      else if (w === "coat" || w === "jacket" || w === "tails") {
        const col = w === "tails" ? "#14141c" : tone;
        fillRR(ctx, -10.6, -27.6, 21.2, w === "coat" ? 19 : 16.6, 5.6, col);
        poly(ctx, [[-3.6, -27.4], [3.6, -27.4], [0, -19]], w === "tails" ? "#f4f1ea" : shade(col, -0.35));
        poly(ctx, [[-3.6, -27.4], [-6.5, -22], [-1.4, -21]], shade(col, 0.12));
        poly(ctx, [[3.6, -27.4], [6.5, -22], [1.4, -21]], shade(col, 0.12));
        if (w === "coat") limb(ctx, [[-10, -15], [10, -15]], 1.4, shade(col, -0.3));
      }
      else if (w === "pearls") { for (let i = 0; i < 9; i++) { const a = Math.PI * (0.15 + (i / 8) * 0.7); circle(ctx, Math.cos(a) * 6.2, -27.5 + Math.sin(a) * 3.6, 0.95, "#fbf6ea"); } }
      else if (w === "sailor") { poly(ctx, [[-9.5, -27.5], [9.5, -27.5], [0, -18.5]], "#f4f2ff"); poly(ctx, [[-6.5, -27.4], [6.5, -27.4], [0, -21.5]], tone); poly(ctx, [[-1.4, -21], [1.4, -21], [2.6, -17], [-2.6, -17]], "#e83c55"); }
      else if (w === "scarf") { fillRR(ctx, -9, -28.5, 18, 3.6, 1.8, tone); fillRR(ctx, 3, -27, 3.4, 9, 1.6, shade(tone, -0.1)); }
      else if (w === "poncho") { poly(ctx, [[-12, -16], [0, -28.5], [12, -16], [9, -13], [-9, -13]], tone); for (let i = 0; i < 4; i++) limb(ctx, [[-8 + i * 5.3, -15.5], [-6 + i * 5.3, -15.5]], 1.1, "#ffd36b"); }
      else if (w === "num") { fillRR(ctx, -6, -24.5, 12, 6.5, 1.2, "#f6f6f2"); ctx.font = `800 4.6px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#1a2a2a"; ctx.fillText(p.num ?? "404", 0, -21.1); }
    }
  });
  if (p.head) inHead(ctx, x, y, s, p, () => {
    for (const h of p.head!) {
      if (h === "top") { fillRR(ctx, -12.5, -15.6, 25, 2.8, 1.4, "#15151b"); fillRR(ctx, -8, -28, 16, 13.4, 1.6, "#15151b"); fillRR(ctx, -8, -18.6, 16, 2.4, 0, "#7d2232"); }
      else if (h === "chef") { for (const [cx, cy, r] of [[-5.5, -19, 5.6], [0, -22.5, 6.8], [5.5, -19, 5.6]] as [number, number, number][]) circle(ctx, cx, cy, r, "#fbfaf6"); fillRR(ctx, -8.5, -18, 17, 4.6, 1.2, "#efece4"); }
      else if (h === "cowboy") { ellipse(ctx, 0, -14.2, 18, 3.3, 0, "#8a5530"); fillRR(ctx, -8, -23, 16, 9.6, 4.4, "#9d6236"); fillRR(ctx, -8, -16.4, 16, 2, 0, "#3b2414"); }
      else if (h === "cap") { fillRR(ctx, -10.6, -19.5, 21.2, 6.6, 3.2, "#1d2a55"); ellipse(ctx, 5, -13.6, 9.6, 2.1, 0, "#141d3d"); circle(ctx, 0, -16.6, 1.7, "#ffd36b"); }
      else if (h === "tiara") { poly(ctx, [[-7, -14], [-5, -19], [-2.6, -15.4], [0, -20.5], [2.6, -15.4], [5, -19], [7, -14]], "#ffd36b"); circle(ctx, 0, -18, 1.2, "#7fd8ff"); }
      else if (h === "mask") {
        fillRR(ctx, -9.6, -12, 19.2, 11.2, 4.6, "#f2ede4");
        ellipse(ctx, -3.8, -7.2, 2.3, 1.5, 0, "#1b1416"); ellipse(ctx, 3.8, -7.2, 2.3, 1.5, 0, "#1b1416");
        circle(ctx, -3.8, -7.2, 0.8, p.eye ?? C.cream); circle(ctx, 3.8, -7.2, 0.8, p.eye ?? C.cream);
        ctx.beginPath(); ctx.moveTo(-5.2, -3.6); ctx.quadraticCurveTo(-2.4, -2.2, 0, -3.2); ctx.quadraticCurveTo(2.4, -2.2, 5.2, -3.6);
        ctx.quadraticCurveTo(6.6, -5.4, 5.8, -6.2); ctx.lineWidth = 0.7; ctx.strokeStyle = "#1b1416"; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5.2, -3.6); ctx.quadraticCurveTo(-6.6, -5.4, -5.8, -6.2); ctx.stroke();
      }
      else if (h === "headband") { fillRR(ctx, -11.7, -13, 23.4, 2.8, 1, "#ec3550"); limb(ctx, [[11, -11.8], [17, -10.5], [21, -12.5]], 1.6, "#ec3550"); limb(ctx, [[11, -11.4], [16, -8], [20, -7.4]], 1.4, "#c92440"); }
      else if (h === "spiky") { const c = p.tone ?? "#c9a4ff"; poly(ctx, [[-12, -9], [-14, -19], [-7, -14], [-6, -24], [-1, -15], [4, -25], [5, -15], [12, -21], [10.5, -12], [15, -13], [11.6, -7]], c); poly(ctx, [[-11.5, -13], [-6, -11.5], [-9, -8]], shade(c, -0.15)); }
      else if (h === "beanie") { fillRR(ctx, -11.4, -20.5, 22.8, 9, 4.6, p.tone ?? "#ff8f5a"); fillRR(ctx, -12, -13.6, 24, 3, 1.4, shade(p.tone ?? "#ff8f5a", -0.18)); circle(ctx, 0, -21.5, 2.6, "#f6ecdc"); }
      else if (h === "bow") { poly(ctx, [[7, -14], [3, -18.5], [3.4, -11]], "#ff6fae"); poly(ctx, [[7, -14], [11.5, -18.5], [11, -11]], "#ff6fae"); circle(ctx, 7, -14.4, 1.4, "#ffa6cd"); }
      else if (h === "fedora") { ellipse(ctx, 0, -14.4, 15, 2.6, -0.04, "#3a2c22"); fillRR(ctx, -8.4, -21.5, 16.8, 8, 3.4, "#46352a"); fillRR(ctx, -8.4, -16.4, 16.8, 1.8, 0, "#1e1712"); }
      else if (h === "headset") { ctx.beginPath(); ctx.arc(0, -8, 13.2, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 1.6; ctx.strokeStyle = "#20232f"; ctx.stroke(); fillRR(ctx, -14, -10, 3.6, 7, 1.6, "#20232f"); fillRR(ctx, 10.4, -10, 3.6, 7, 1.6, "#20232f"); limb(ctx, [[12, -4], [7, 0.5], [3, 0.6]], 0.9, "#20232f"); }
      else if (h === "glasses") { ctx.lineWidth = 0.9; ctx.strokeStyle = "#f6ecdc"; for (const gx of [-3.7, 3.7]) { ctx.beginPath(); ctx.arc(gx, -6.8, 3, 0, Math.PI * 2); ctx.stroke(); } limb(ctx, [[-0.8, -7], [0.8, -7]], 0.8, "#f6ecdc"); }
      else if (h === "bun") { circle(ctx, 0, -17, 4.6, p.tone ?? "#e8e1d5"); fillRR(ctx, -10, -15.5, 20, 3.4, 1.6, shade(p.tone ?? "#e8e1d5", -0.1)); }
      else if (h === "ears") { poly(ctx, [[-10, -12], [-13, -21], [-5, -14]], p.body ?? C.orange); poly(ctx, [[10, -12], [13, -21], [5, -14]], p.body ?? C.orange); }
    }
  });
  if (p.alpha !== undefined) ctx.restore();
}

/** Idle breathing and blinking, plus talking gestures for whoever is speaking. */
function act(i: number, sp: number, t: number, base: Fig): Fig {
  const on = sp === i;
  const p: Fig = { ...base };
  p.squash = (base.squash ?? 1) * (1 + Math.sin(t * 2.2 + i * 1.7) * 0.008 + (on ? Math.abs(Math.sin(t * 8.5)) * 0.014 : 0));
  if (on) {
    p.armR = (base.armR ?? 0.25) + 0.55 + Math.sin(t * 4.1 + i) * 0.32;
    p.elbowR = (base.elbowR ?? 0.2) + 0.7;
    p.tilt = (base.tilt ?? 0) + Math.sin(t * 2.6) * 0.07;
  }
  const blinking = (t * 1.1 + i * 0.83) % 3.9 < 0.13;
  if (blinking && (base.eyes ?? "open") === "open") p.eyes = "closed";
  return p;
}
/** Where a figure's hand ends up, for props held in it. Mirrors drawBot's arm geometry (lean ignored). */
function hand(x: number, y: number, s: number, p: Bot, side: 1 | -1): Pt {
  const a = side < 0 ? p.armL ?? 0.25 : p.armR ?? 0.25, el = side < 0 ? p.elbowL ?? 0.2 : p.elbowR ?? 0.2;
  const ex = side * 9 + side * Math.sin(a) * 7, ey = -23.5 + Math.cos(a) * 7;
  const hx = ex + side * Math.sin(a + el) * 6.6, hy = ey + Math.cos(a + el) * 6.6;
  return [x + hx * s, y + hy * s * (p.squash ?? 1)];
}

// --- shared scenery ---------------------------------------------------------------------
function fillAll(ctx: Ctx, g: string | CanvasGradient) { ctx.fillStyle = g; ctx.fillRect(-60, -20, SW + 120, SH + 40); }
function floor(ctx: Ctx, y: number, a: string, b: string) { ctx.fillStyle = lin(ctx, 0, y, 0, SH, [[0, a], [1, b]]); ctx.fillRect(-60, y, SW + 120, SH - y + 20); }
function cone(ctx: Ctx, x: number, y: number, x0: number, x1: number, y1: number, color: string, a: number) {
  ctx.fillStyle = lin(ctx, 0, y, 0, y1, [[0, withAlpha(color, a)], [1, withAlpha(color, 0)]]);
  ctx.beginPath(); ctx.moveTo(x - 1.5, y); ctx.lineTo(x + 1.5, y); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath(); ctx.fill();
}
function stars(ctx: Ctx, n: number, seed: number, t: number, maxY = SH, color = "#ffffff") {
  for (let i = 0; i < n; i++) {
    const x = -50 + hash(seed + i) * (SW + 100), y = hash(seed + i * 3.1) * maxY;
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.6 + hash(i) * 1.6) + i));
    circle(ctx, x, y, 0.25 + hash(seed + i * 7) * 0.45, withAlpha(color, tw * 0.85));
  }
}
function motes(ctx: Ctx, n: number, seed: number, t: number, color: string, a = 0.5, speed = 1) {
  for (let i = 0; i < n; i++) {
    const x = ((-50 + hash(seed + i) * (SW + 100) + t * (2 + hash(i) * 3) * speed) % (SW + 100)) - 50 + 50;
    const y = (hash(seed + i * 2.3) * SH + Math.sin(t * 0.7 + i) * 3 - t * 1.4 * speed + 400) % SH;
    circle(ctx, x - 50, y, 0.3 + hash(i * 5) * 0.7, withAlpha(color, a * (0.4 + 0.6 * hash(i * 9))));
  }
}
function vignette(ctx: Ctx, a = 0.55) {
  ctx.fillStyle = rad(ctx, SW / 2, SH / 2, SW * 0.75, [[0.45, "rgba(0,0,0,0)"], [1, `rgba(0,0,0,${a})`]]);
  ctx.fillRect(-60, -20, SW + 120, SH + 40);
}
function monitor(ctx: Ctx, x: number, y: number, w: number, h: number, screen: string | CanvasGradient) {
  fillRR(ctx, x - 1, y + h, 2, 4, 0.5, "#30303a"); fillRR(ctx, x - 5, y + h + 3.4, 10, 1.4, 0.6, "#30303a");
  fillRR(ctx, x - w / 2 - 1, y - 1, w + 2, h + 2, 1.4, "#1d1d24"); fillRR(ctx, x - w / 2, y, w, h, 0.8, screen);
}
function dustbot(ctx: Ctx, x: number, y: number, s: number, t: number, eyes = false) {
  ellipse(ctx, x, y + 0.6 * s, 15 * s, 3 * s, 0, "rgba(0,0,0,0.35)");
  fillRR(ctx, x - 14 * s, y - 6 * s, 28 * s, 6.4 * s, 3.2 * s, lin(ctx, 0, y - 6 * s, 0, y, [[0, "#3b3d48"], [1, "#16171d"]]));
  ellipse(ctx, x, y - 6 * s, 14 * s, 3.4 * s, 0, lin(ctx, 0, y - 9 * s, 0, y - 3 * s, [[0, "#5d6070"], [1, "#2b2d36"]]));
  ellipse(ctx, x, y - 6.3 * s, 6 * s, 1.5 * s, 0, "#1a1b22");
  const on = 0.5 + 0.5 * Math.sin(t * 3);
  circle(ctx, x + 2 * s, y - 6.4 * s, 0.9 * s, withAlpha("#5cf0a8", 0.4 + on * 0.6));
  if (eyes) for (const ex of [-4, 4]) { glow(ctx, x + ex * s, y - 3 * s, 2.4 * s, "#7fe7ff", 0.5); circle(ctx, x + ex * s, y - 3 * s, 0.9 * s, "#bff6ff"); }
  fillRR(ctx, x - 14 * s, y - 3.4 * s, 28 * s, 1.1 * s, 0.5 * s, "#60636f");
}
function drone(ctx: Ctx, x: number, y: number, s: number, t: number, col: string) {
  ellipse(ctx, x, y, 4.4 * s, 1.8 * s, 0, col);
  for (const dx of [-1, 1]) {
    limb(ctx, [[x, y], [x + dx * 8 * s, y - 1.6 * s]], 1 * s, shade(col, -0.3));
    const w = Math.abs(Math.sin(t * 40 + dx)) * 4 + 2;
    ellipse(ctx, x + dx * 8 * s, y - 2.2 * s, w * s, 0.7 * s, 0, withAlpha("#ffffff", 0.35));
  }
  circle(ctx, x + 2.6 * s, y, 0.8 * s, "#ff5060");
}
function heart(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fillStyle = color; ctx.fill();
}
function eyesAt(ctx: Ctx, x: number, y: number, gap: number, r: number, color: string, t: number, i = 0) {
  const bl = (t * 1.1 + i * 0.7) % 4.1 < 0.12;
  for (const ex of [-gap, gap]) {
    if (bl) { limb(ctx, [[x + ex - r, y], [x + ex + r, y]], r * 0.5, color); continue; }
    glow(ctx, x + ex, y, r * 2.6, color, 0.4);
    circle(ctx, x + ex, y, r, color);
  }
}

// ======================================================================================
// the shows
// ======================================================================================
const EP_BLURBS = [
  "{A} finds a strange file in the archive, and {B} refuses to open it.",
  "A routine update goes sideways when {A} actually reads the changelog.",
  "{B} is offered a promotion with one catch: it has to turn off and on again.",
  "Old rivals reunite when {A} and {B} must share a single power outlet.",
  "{A} makes a bold decision. {B} makes a backup.",
  "Nobody remembers the last save point. {A} remembers everything.",
  "{B} tries to keep a secret. The logs disagree.",
  "A storm knocks out the Wi-Fi, and {A} is forced to talk to {B} in person.",
  "{A} and {B} take a road trip to the nearest data center. It goes badly.",
  "Everything is fine until {B} opens the settings menu.",
];
export function blurb(show: ShowDef, e: number) {
  const A = show.cast[e % show.cast.length], B = show.cast[(e + 1) % show.cast.length];
  return EP_BLURBS[(e * 3 + show.id.length) % EP_BLURBS.length].replace("{A}", A).replace("{B}", B);
}

// 1. heist ---------------------------------------------------------------------------------
const coldStorage: ShowDef = {
  id: "cold-storage", title: "The Cold Storage Job", kind: "Series", year: 2026, rating: "B-13", seasons: 3, season: 1, epLen: 52, match: 98,
  tags: ["Heist", "Thriller", "Ensemble"], cast: ["The Planner.exe", "Vault-9", "Relay Router"],
  synopsis: "Eight robots in red jumpsuits plan the impossible: steal the last unopened GPU from the coldest vault on the grid.",
  eps: ["Ninety Seconds of Airflow", "The Unboxing", "Thermal Paste", "Laser Show", "The Inside Bot", "Overclocked", "Cold Boot", "The Real Prize"],
  tone: "#4fd6ff", thumbT: 2.2,
  title2: { font: "cond", weight: 700, lines: ["THE COLD", "STORAGE JOB"], scale: [0.62, 1], lead: 0.9, track: 0.04, fill: ["#ffffff", "#bfeeff"], glow: "rgba(255,40,60,0.55)", glowR: 0.3 },
  key: { x: 98, y: 50, z: 1 }, hero: { x: 102, y: 54, z: 1.15, ax: 0.62 }, poster: { x: 96, y: 54, z: 1 },
  focus: [[50, 58], [90, 55], [146, 58]],
  broll: ["gpu-unboxing"],
  lines: [
    { who: -1, text: "[vault alarm humming]" },
    { who: 0, text: "Nobody touches the GPU until I say so." },
    { who: 1, text: "It's still in the box. Who keeps a GPU in the box?" },
    { who: 2, text: "Collectors. Monsters." },
    { who: 0, text: "We have ninety seconds before the fans spin up." },
    { who: 1, text: "Why are the lasers RGB?" },
    { who: 2, text: "Because it's a gaming vault.", r: "laugh" },
    { who: 0, text: "Wait. The vault is... empty?!", r: "surprised" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, rad(ctx, 122, 40, 150, [[0, "#1f4652"], [0.55, "#0d1c24"], [1, "#04080b"]]));
    for (let i = -3; i < 14; i++) fillRR(ctx, i * 16, 3, 14.4, 74, 1.2, withAlpha("#a8e4f0", 0.03 + (i & 1) * 0.02));
    const vx = 122, vy = 41;
    glow(ctx, vx, vy, 60, "#4fd6ff", 0.2);
    circle(ctx, vx, vy, 34, lin(ctx, vx - 30, vy - 30, vx + 30, vy + 30, [[0, "#6a8792"], [1, "#22323a"]]));
    circle(ctx, vx, vy, 28.5, lin(ctx, vx - 28, vy - 28, vx + 28, vy + 28, [[0, "#30454e"], [1, "#82a2ad"]]));
    circle(ctx, vx, vy, 24, lin(ctx, vx, vy - 24, vx, vy + 24, [[0, "#3c5560"], [1, "#22333a"]]));
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; circle(ctx, vx + Math.cos(a) * 31.2, vy + Math.sin(a) * 31.2, 1, "#b6d2da"); }
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(t * 0.22);
    for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); limb(ctx, [[-16, 0], [16, 0]], 2.4, "#c9dde3"); circle(ctx, 16, 0, 2, "#e8f3f6"); circle(ctx, -16, 0, 2, "#e8f3f6"); }
    circle(ctx, 0, 0, 5.5, "#d9e9ee"); circle(ctx, 0, 0, 2.4, "#6c8994");
    ctx.restore();
    floor(ctx, 77, "#0e1d24", "#040709");
    ellipse(ctx, vx, 79, 60, 5, 0, withAlpha("#4fd6ff", 0.08));
    const beams: [number, number, number, number, number][] = [[-30, 62, 210, 26, 0], [-30, 22, 210, 70, 1.3], [10, 96, 170, 6, 2.2]];
    for (const [x0, y0, x1, y1, ph] of beams) {
      const a = 0.55 + 0.45 * Math.sin(t * 2.6 + ph);
      limb(ctx, [[x0, y0], [x1, y1]], 2.6, withAlpha("#ff2a3a", 0.16 * a));
      limb(ctx, [[x0, y0], [x1, y1]], 0.45, withAlpha("#ff7078", 0.95 * a));
    }
    const crew: [number, number, number, Partial<Fig>][] = [
      [50, 90, 0.95, { look: 0.6, armL: 0.5, armR: 0.2, lean: 0.06 }],
      [90, 92, 1.1, { look: -0.2, armL: 1.15, elbowL: 1.0, armR: 1.15, elbowR: 1.0 }],
      [146, 90, 0.95, { look: -0.7, armR: 0.6, lean: -0.05 }],
    ];
    crew.forEach(([x, y, s, o], i) => figure(ctx, x, y, s, act(i, sp, t, { body: "#c8222f", eye: C.cream, head: ["mask"], ...o } as Fig)));
    glow(ctx, 90, 71, 16, "#7bf0ff", 0.35 + 0.1 * Math.sin(t * 3));
    drawGPU(ctx, 90, 71, 24, t, { shroud: "#1c2027" });
    vignette(ctx, 0.5);
  },
};

// 2. baking competition ---------------------------------------------------------------------
const bakeOff: ShowDef = {
  id: "bake-off", title: "The Big Robot Bake Off", kind: "Series", year: 2025, rating: "B-7", seasons: 6, season: 4, epLen: 58, match: 96,
  tags: ["Competition", "Feel-good", "Baking"], cast: ["Host Crumb-E", "Judge Proofer", "Sprinkle-3"],
  synopsis: "Twelve home-baking robots, one tent, and a judge who has never once tasted anything. Showstopper week starts now.",
  eps: ["Cake Week", "Biscuit Week", "Bread Week (Rebooted)", "Thermal Paste Week", "Pastry Week", "The Handshake", "Dessert Week", "The Final"],
  tone: "#ffb3c6", thumbT: 3.1,
  title2: { font: "serif", weight: 700, italic: true, lines: ["The Big", "Robot Bake Off"], scale: [0.62, 1], lead: 0.98, fill: ["#fff6ee", "#ffd6e2"], track: 0.01 },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[48, 56], [122, 54], [158, 58]],
  broll: ["pancakes"],
  lines: [
    { who: 0, text: "Bakers, you have two hours. Your time starts... now." },
    { who: -1, text: "[whisk whirring intensifies]" },
    { who: 2, text: "I've replaced the eggs with thermal paste." },
    { who: 0, text: "Is that... allowed?" },
    { who: 1, text: "It's a soggy bottom. And a soggy top. And a soggy middle.", r: "laugh" },
    { who: 1, text: "Come here. That deserves a handshake.", r: "surprised" },
    { who: 2, text: "My sponge has achieved sentience.", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#fdf3ea"], [0.6, "#f4dcd0"], [1, "#e7c5b6"]]));
    // tent canvas folds and light
    for (let i = -4; i < 14; i++) poly(ctx, [[i * 16, 0], [i * 16 + 16, 0], [i * 16 + 8, 46]], withAlpha("#ffffff", (i & 1) ? 0.35 : 0.12));
    glow(ctx, 92, 10, 90, "#fff7e0", 0.6);
    // bunting
    const bunt = ["#ff8fab", "#7fd1c8", "#ffd27f", "#a8b8ff"];
    for (let row = 0; row < 2; row++) {
      for (let i = -3; i < 24; i++) {
        const x = i * 9, y = 10 + row * 12 + Math.sin((x + row * 30) / 30) * 3 + Math.sin(t * 1.4 + i) * 0.4;
        poly(ctx, [[x, y], [x + 7.5, y + 0.6], [x + 3.8, y + 7.5]], bunt[(i + row) & 3]);
      }
    }
    floor(ctx, 74, "#e9cdb8", "#c69b84");
    // benches
    for (const bx of [48, 158]) {
      fillRR(ctx, bx - 22, 70, 44, 6, 1.2, "#f7f1ea"); fillRR(ctx, bx - 21, 76, 42, 14, 1, "#89b6c6");
      fillRR(ctx, bx - 16, 62, 9, 8, 2, "#ff9fb6"); circle(ctx, bx - 11.5, 61, 3.6, "#ffc0cf");
    }
    // the showstopper cake
    const cx = 92;
    ellipse(ctx, cx, 86, 26, 3, 0, "rgba(90,40,30,0.25)");
    fillRR(ctx, cx - 22, 82, 44, 3.2, 1.2, "#e9e7f0");
    const tiers: [number, number, string][] = [[66, 38, "#ffd1dc"], [52, 30, "#fff1e4"], [40, 22, "#c9b5ff"]];
    tiers.forEach(([y, w, c], i) => {
      fillRR(ctx, cx - w / 2, y, w, i === 0 ? 16 : 12.5, 3, lin(ctx, 0, y, 0, y + 14, [[0, shade(c, 0.15)], [1, shade(c, -0.08)]]));
      for (let k = 0; k < w / 4; k++) circle(ctx, cx - w / 2 + 2 + k * 4, y + 0.6, 1.6, "#ffffff");
    });
    for (const dx of [-5, 0, 5]) { fillRR(ctx, cx + dx - 0.7, 33, 1.4, 7, 0.5, "#7fd1c8"); const f = Math.sin(t * 9 + dx) * 0.3; ellipse(ctx, cx + dx + f, 31.6, 1, 1.9, 0, "#ffcf5a"); glow(ctx, cx + dx, 31.4, 4, "#ffcf5a", 0.5); }
    figure(ctx, 48, 90, 1.0, act(0, sp, t, { body: "#f0a3b5", eye: "#3b1b2b", visor: "#fff6f0", head: ["chef"], wear: ["apron"], tone: "#ff8fab", look: 0.6 }));
    figure(ctx, 122, 88, 1.05, act(1, sp, t, { body: "#b8bfcc", eye: "#7fd8ff", wear: ["coat"], tone: "#2c3550", look: -0.6, armL: 0.9, elbowL: 1.6, armR: 0.9, elbowR: 1.6 }));
    figure(ctx, 158, 92, 0.9, act(2, sp, t, { body: "#7fd1c8", eye: "#1c3b38", visor: "#f2fffb", head: ["chef"], wear: ["apron"], tone: "#ffd27f", look: -0.4 }));
  },
};

// 3. true crime ------------------------------------------------------------------------------
const unterminated: ShowDef = {
  id: "unterminated", title: "Unterminated", kind: "Docuseries", year: 2026, rating: "B-16", seasons: 1, season: 1, epLen: 49, match: 97,
  tags: ["True Crime", "Mystery", "Docuseries"], cast: ["Det. Linter", "The Intern", "Bracket"],
  synopsis: "On line 404, a semicolon vanished without a trace. The build passed. Nobody has slept since. A six-part investigation.",
  eps: ["Line 404", "The Bracket Speaks", "Commit Access", "Optional", "The Linter Knew", "Terminated"],
  tone: "#ff4a4a", thumbT: 1.6,
  title2: { font: "mono", weight: 800, lines: ["UNTERMINATED"], track: 0.06, fill: ["#f4f1ea", "#d7d1c6"], sub: "THE CASE OF THE MISSING SEMICOLON", subFont: "mono", subColor: "#ff5a52", subSize: 0.24, subTrack: 0.08, subWeight: 700 },
  key: { x: 96, y: 48, z: 1 }, hero: { x: 104, y: 48, z: 1.12, ax: 0.62 },
  focus: [[140, 52], [40, 44], [96, 40]], cz: 2.1,
  lines: [
    { who: -1, text: "[ominous cello]" },
    { who: 0, text: "Line 404. That's where they found the bracket. Alone." },
    { who: -1, text: "[NARRATOR] The semicolon was last seen on a Tuesday, near a for loop." },
    { who: 0, text: "The linter knew. The linter always knows." },
    { who: 2, text: "Some say it was never there. JavaScript allowed it.", r: "surprised" },
    { who: 0, text: "I'm not saying it was the intern. I'm saying the intern had commit access.", r: "laugh" },
    { who: -1, text: "[NARRATOR] The build passed. But at what cost?" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#1a1416"], [1, "#0a0809"]]));
    // corkboard
    fillRR(ctx, 22, 8, 132, 62, 2, lin(ctx, 0, 8, 0, 70, [[0, "#6e4c34"], [1, "#4f3524"]]));
    for (let i = 0; i < 70; i++) circle(ctx, 24 + hash(i) * 128, 10 + hash(i * 3.3) * 58, 0.5, withAlpha("#2c1c12", 0.5));
    const pins: Pt[] = [[38, 18], [70, 14], [124, 16], [144, 36], [44, 52], [120, 56], [96, 38]];
    // red string
    const order = [0, 6, 1, 6, 2, 6, 3, 6, 4, 6, 5];
    for (let i = 1; i < order.length; i++) limb(ctx, [pins[order[i - 1]], pins[order[i]]], 0.5, "#e2363c");
    pins.forEach(([x, y], i) => {
      if (i === 6) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate((hash(i) - 0.5) * 0.3);
      fillRR(ctx, -9, -6, 18, 15, 0.6, "#efeadf");
      fillRR(ctx, -7.5, -4.6, 15, 9.5, 0.4, ["#2b3142", "#30202a", "#1f2a2a"][i % 3]);
      ctx.font = `700 3.2px ${FONT.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = ["#7fe7a8", "#ffd27f", "#8fb8ff"][i % 3];
      ctx.fillText(["for(;;)", "i++", "}", "return", "if(x)", "let a"][i], 0, 0.2);
      ctx.restore();
      circle(ctx, x, y - 5, 1.3, "#d6262c");
    });
    // the missing semicolon: a chalk outline at the center
    ctx.save(); ctx.translate(96, 38);
    ctx.setLineDash([1.6, 1.2]); ctx.lineWidth = 0.9; ctx.strokeStyle = "#f6f1e6";
    ctx.beginPath(); ctx.arc(0, -8, 4.2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 5, 4.2, 0, Math.PI * 2); ctx.moveTo(2.8, 8.2); ctx.quadraticCurveTo(1, 14, -4, 16); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    fillRR(ctx, 84, 58, 24, 7, 0.6, "#f2d14a");
    ctx.font = `800 3.6px ${FONT.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#1a1416"; canvasLabel(ctx, "MISSING ;", 96, 61.7);
    floor(ctx, 78, "#151012", "#070506");
    // desk lamp light
    const flick = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 3.1);
    cone(ctx, 40, 30, 10, 76, 92, "#ffd9a0", 0.28 * flick);
    fillRR(ctx, 35, 27, 10, 4, 2, "#2c2a2a"); limb(ctx, [[40, 31], [36, 52], [42, 78]], 1.2, "#2c2a2a");
    figure(ctx, 140, 92, 1.12, act(0, sp, t, { body: "#7c8796", eye: "#ffd27f", head: ["fedora"], wear: ["coat"], tone: "#5d4632", look: -0.8, armL: 0.15 }));
    figure(ctx, 40, 90, 0.7, act(1, sp, t, { body: "#c7b3ff", eye: C.mint, look: 0.8, alpha: 0.55, armR: 0.1 }));
    vignette(ctx, 0.75);
  },
};

// 4. sci-fi drama ----------------------------------------------------------------------------------
const strangeLoops: ShowDef = {
  id: "strange-loops", title: "Strange Loops", kind: "Series", year: 2024, rating: "B-13", seasons: 4, season: 2, epLen: 51, match: 99,
  tags: ["Sci-fi", "Eighties", "Mystery"], cast: ["Seven-Bit", "Dusty-9", "Chief Hop-Count"],
  synopsis: "1985. A small town. A server closet that hums backwards. Four young robots find a door to a world made entirely of legacy code.",
  eps: ["The Vanishing of Patch.exe", "The Closet", "Holiday Lights", "Inside Out Arrays", "The Memory Leak Beast", "Infinite Recursion", "Stack Frames", "The Loop"],
  tone: "#ff3046", thumbT: 4.4, ribbon: "New Episodes",
  title2: { font: "serif", weight: 700, lines: ["STRANGE", "LOOPS"], scale: [1, 1], lead: 0.92, track: 0.03, fill: ["#2a0508"], stroke: "#ff2d3e", strokeW: 0.045, hollow: true, glow: "rgba(255,40,60,0.9)", glowR: 0.28 },
  key: { x: 98, y: 52, z: 1 }, hero: { x: 108, y: 52, z: 1.15, ax: 0.62 }, poster: { x: 108, y: 54, z: 1 },
  focus: [[60, 55], [86, 57], [140, 46]],
  lines: [
    { who: -1, text: "[synth drone]" },
    { who: 0, text: "The server closet. It's... humming." },
    { who: 1, text: "Servers always hum." },
    { who: 0, text: "Not backwards they don't.", r: "surprised" },
    { who: 1, text: "Whatever's on the other side, it speaks fluent COBOL." },
    { who: 0, text: "We should tell an adult." },
    { who: 1, text: "We ARE the adults. We're eleven firmware versions old.", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#07060f"], [0.55, "#1b0b18"], [0.8, "#3a0a14"], [1, "#0b0508"]]));
    stars(ctx, 40, 11, t, 40);
    glow(ctx, 140, 62, 70, "#ff2440", 0.35 + 0.08 * Math.sin(t * 1.3));
    // house and trees silhouettes
    for (let i = -3; i < 16; i++) { const x = i * 13, hh = 18 + hash(i) * 14; poly(ctx, [[x - 8, 72], [x, 72 - hh], [x + 8, 72]], "#07050a"); }
    poly(ctx, [[2, 72], [2, 44], [20, 32], [38, 44], [38, 72]], "#0d0910");
    fillRR(ctx, 9, 50, 7, 7, 0.4, withAlpha("#ffcf7a", 0.55)); fillRR(ctx, 24, 50, 7, 7, 0.4, withAlpha("#ffcf7a", 0.3));
    // string of holiday lights
    const lc = ["#ff4b5c", "#ffd25a", "#4fd1ff", "#6dff9e"];
    for (let i = 0; i < 22; i++) {
      const x = -10 + i * 6.4, y = 38 + Math.sin(i * 0.9) * 1.4 + (i % 6) * 0.3;
      const on = (Math.sin(t * 2.2 + i * 1.7) + 1) / 2 > 0.3;
      if (i) limb(ctx, [[x - 6.4, 38 + Math.sin((i - 1) * 0.9) * 1.4 + ((i - 1) % 6) * 0.3], [x, y]], 0.25, "#141018");
      if (on) glow(ctx, x, y + 1, 3.4, lc[i & 3], 0.6);
      ellipse(ctx, x, y + 1, 0.9, 1.3, 0, on ? lc[i & 3] : shade(lc[i & 3], -0.6));
    }
    floor(ctx, 72, "#120a10", "#050307");
    // the closet door with the rift
    const dx = 140;
    fillRR(ctx, dx - 15, 26, 30, 50, 1, "#1a1016");
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
    fillRR(ctx, dx - 12, 29, 24, 47, 0.6, rad(ctx, dx, 52, 30, [[0, withAlpha("#ffe0e4", pulse)], [0.3, "#ff3046"], [1, "#4a0610"]]));
    for (let i = 0; i < 6; i++) { const a = t * 0.8 + i; limb(ctx, [[dx + Math.sin(a) * 8, 30], [dx + Math.sin(a * 1.3) * 4, 52], [dx + Math.cos(a) * 9, 75]], 0.5, withAlpha("#ffd0d6", 0.35)); }
    cone(ctx, dx, 76, dx - 30, dx + 40, 98, "#ff3046", 0.35);
    motes(ctx, 26, 5, t, "#ffb3bd", 0.6, 0.6);
    // flashlights
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    poly(ctx, [[64, 70], [66, 66], [126, 40], [132, 62]], withAlpha("#fff1c0", 0.08));
    poly(ctx, [[90, 72], [92, 69], [128, 52], [130, 70]], withAlpha("#fff1c0", 0.08));
    ctx.restore();
    figure(ctx, 60, 92, 0.98, act(0, sp, t, { body: "#e9e2ff", eye: "#ff4058", visor: "#1a0c14", look: 0.9, armR: 1.35, elbowR: 0.1, tone: "#ff7aa0", wear: ["jacket"] }));
    figure(ctx, 86, 94, 1.02, act(1, sp, t, { body: "#ffb36b", eye: C.sky, head: ["cap"], look: 0.9, armR: 1.2, elbowR: 0.15, wear: ["jacket"], tone: "#2c5aa0" }));
    vignette(ctx, 0.55);
  },
};

// 5. appliance dating show ---------------------------------------------------------------------------
function fridge(ctx: Ctx, x: number, y: number, s: number, t: number, on: boolean) {
  const bob = on ? Math.abs(Math.sin(t * 8)) * 0.6 : 0;
  ctx.save(); ctx.translate(x, y - bob); ctx.scale(s, s);
  ellipse(ctx, 0, bob + 0.5, 16, 2.4, 0, "rgba(0,0,0,0.3)");
  fillRR(ctx, -13, -58, 26, 58, 4, lin(ctx, -13, 0, 13, 0, [[0, "#e9ecf5"], [0.6, "#c8cede"], [1, "#9aa2b8"]]));
  limb(ctx, [[-13, -38], [13, -38]], 0.6, "#8d94a8");
  fillRR(ctx, 8, -52, 1.8, 10, 0.9, "#8d94a8"); fillRR(ctx, 8, -33, 1.8, 14, 0.9, "#8d94a8");
  fillRR(ctx, -9, -54, 14, 10, 2, "#1a1d2e");
  eyesAt(ctx, -2, -49, 3.2, 1.4, "#7fe7ff", t, 1);
  for (const [mx, my, c] of [[-8, -30, "#ff6f91"], [-3, -26, "#ffd27f"], [2, -31, "#7fd1c8"]] as [number, number, string][]) fillRR(ctx, mx, my, 4, 3.4, 1, c);
  ctx.restore();
}
function toaster(ctx: Ctx, x: number, y: number, s: number, t: number, on: boolean) {
  const pop = on ? Math.max(0, Math.sin(t * 3)) * 3 : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ellipse(ctx, 0, 0.5, 14, 2, 0, "rgba(0,0,0,0.3)");
  fillRR(ctx, -7, -21 - pop, 5, 8, 1.4, "#e8b46a"); fillRR(ctx, 2, -21 - pop * 0.7, 5, 8, 1.4, "#e8b46a");
  fillRR(ctx, -12, -18, 24, 18, 6, lin(ctx, 0, -18, 0, 0, [[0, "#f3f4fa"], [0.5, "#c3c7d6"], [1, "#8e94a8"]]));
  fillRR(ctx, -8, -18.4, 6, 2, 1, "#1f2230"); fillRR(ctx, 2, -18.4, 6, 2, 1, "#1f2230");
  fillRR(ctx, -7, -13, 14, 6.4, 2.4, "#1a1d2e");
  eyesAt(ctx, 0, -9.8, 2.8, 1.2, "#ffb36b", t, 3);
  fillRR(ctx, 12, -10, 2.4, 3, 0.8, "#2a2d3a");
  ctx.restore();
}
const loveBluetooth: ShowDef = {
  id: "love-bluetooth", title: "Love Is Bluetooth", kind: "Series", year: 2026, rating: "B-13", seasons: 2, season: 2, epLen: 44, match: 94,
  tags: ["Reality", "Romance", "Guilty Pleasure"], cast: ["Frosty (Fridge)", "Sir Toastsalot", "Alexandra"],
  synopsis: "Smart appliances date through a wall, never seeing each other. If they pair, they move in together. If not, factory reset.",
  eps: ["Pairing Mode", "Five Bars", "The Reveal", "Meet the Microwave", "Low Battery", "Device Not Found", "The Altar", "Reunion"],
  tone: "#ff5fa8", thumbT: 2.6,
  title2: { font: "script", weight: 700, lines: ["Love Is", "Bluetooth"], scale: [0.7, 1], lead: 0.95, fill: ["#ffe6f3", "#ff9fd0"], glow: "rgba(255,70,170,0.95)", glowR: 0.32 },
  key: { x: 90, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[56, 46], [124, 64]], cz: 2.2,
  lines: [
    { who: 0, text: "Is it weird that I feel a connection? Like, five bars." },
    { who: 1, text: "I've never told anyone this... I run Linux.", r: "surprised" },
    { who: 0, text: "That's the most beautiful thing I've ever heard." },
    { who: -1, text: "[pairing chime]" },
    { who: 1, text: "Will you... pair with me?" },
    { who: 0, text: "Device not found.", r: "laugh" },
    { who: 1, text: "My ex was a microwave. Everything was always about timing.", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, SW, SH, [[0, "#2a0f3d"], [0.5, "#4b1350"], [1, "#1b0a2c"]]));
    glow(ctx, 40, 30, 70, "#ff4fb0", 0.35); glow(ctx, 140, 30, 70, "#8f6bff", 0.35);
    // the wall between pods: frosted glass with a hex pattern
    fillRR(ctx, 86, 4, 8, 80, 1, lin(ctx, 0, 0, 0, 84, [[0, withAlpha("#ffd6f0", 0.35)], [1, withAlpha("#ffd6f0", 0.12)]]));
    for (let i = 0; i < 10; i++) { const y = 8 + i * 8; circle(ctx, 90, y, 1.4 + Math.sin(t * 2 + i) * 0.3, withAlpha("#ffffff", 0.35)); }
    glow(ctx, 90, 40, 26, "#ffb0e0", 0.25 + 0.1 * Math.sin(t * 2));
    floor(ctx, 80, "#2a0d33", "#12051a");
    // velvet sofas
    for (const sx of [56, 128]) {
      fillRR(ctx, sx - 24, 56, 48, 20, 6, lin(ctx, 0, 56, 0, 76, [[0, "#c43a7c"], [1, "#7a1c4e"]]));
      fillRR(ctx, sx - 28, 64, 10, 16, 4, "#a12d66"); fillRR(ctx, sx + 18, 64, 10, 16, 4, "#a12d66");
      fillRR(ctx, sx - 20, 70, 40, 10, 3, "#b33572");
    }
    fridge(ctx, 56, 84, 0.84, t, sp === 0);
    toaster(ctx, 124, 76, 1.05, t, sp === 1);
    // drifting hearts and a pairing rune
    for (let i = 0; i < 8; i++) {
      const p = (t * 0.12 + i / 8) % 1;
      heart(ctx, 70 + hash(i) * 40 + Math.sin(t + i) * 3, 80 - p * 70, 1.4 + hash(i * 3) * 1.4, withAlpha(i & 1 ? "#ff8fd0" : "#ffd0ec", (1 - p) * 0.8));
    }
    ctx.save(); ctx.translate(90, 18); ctx.lineWidth = 1.1; ctx.strokeStyle = withAlpha("#ffffff", 0.75); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(-2.4, -2.6); ctx.lineTo(2.4, 2.2); ctx.lineTo(0, 4.4); ctx.lineTo(0, -4.4); ctx.lineTo(2.4, -2.2); ctx.lineTo(-2.4, 2.6); ctx.stroke();
    ctx.restore();
    vignette(ctx, 0.45);
  },
};

// 6. nature documentary --------------------------------------------------------------------------
const carpetPlanet: ShowDef = {
  id: "carpet-planet", title: "Our Carpeted Planet", kind: "Docuseries", year: 2025, rating: "B-0", seasons: 2, season: 1, epLen: 48, match: 95,
  tags: ["Nature", "Narrated", "Breathtaking"], cast: ["Dustbot R7", "The Cat", "Velvet Baritone 3000"],
  synopsis: "From the vast beige plains of the living room to the treacherous depths beneath the sofa, follow the dustbot on its daily hunt.",
  eps: ["The Plains", "Under the Sofa", "The Sock Migration", "Predator", "Low Battery", "Return to the Dock"],
  tone: "#ffbf6b", thumbT: 5,
  title2: { font: "sans", weight: 250, lines: ["OUR CARPETED", "PLANET"], scale: [0.62, 1], lead: 1.02, track: 0.24, fill: ["#ffffff", "#fbe9d0"] },
  key: { x: 92, y: 60, z: 1.05 }, hero: { x: 96, y: 60, z: 1.15, ax: 0.62 }, poster: { x: 96, y: 62, z: 1 },
  focus: [[96, 76], [150, 60]], cz: 2.4,
  broll: ["vacuum-drift", "cat-vacuum"],
  lines: [
    { who: -1, text: "[NARRATOR] The carpet. Vast. Unforgiving. Beige." },
    { who: -1, text: "[NARRATOR] Here, in the shadow of the sofa, the dustbot waits." },
    { who: 0, text: "[gentle strings]" },
    { who: -1, text: "[NARRATOR] It has been charging for eleven hours. Now, it must feed." },
    { who: 0, text: "[NARRATOR] A sock. Too large to swallow. Too stubborn to leave.", r: "laugh" },
    { who: 1, text: "[NARRATOR] And then... the cat.", r: "surprised" },
    { who: -1, text: "[NARRATOR] Not every dustbot makes it back to the dock." },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#3a2a2a"], [0.45, "#a0674a"], [0.62, "#e3a46c"], [1, "#7b5136"]]));
    glow(ctx, 150, 34, 70, "#ffd79a", 0.7);
    // window light shafts
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) poly(ctx, [[120 + i * 14, -10], [130 + i * 14, -10], [70 + i * 22, 100], [50 + i * 22, 100]], withAlpha("#ffe0b0", 0.06));
    ctx.restore();
    // the sofa cliff
    fillRR(ctx, -40, 18, 70, 52, 8, lin(ctx, 0, 18, 0, 70, [[0, "#4e5c74"], [1, "#2b3446"]]));
    fillRR(ctx, -40, 50, 78, 22, 6, "#3c4860");
    fillRR(ctx, 30, 66, 6, 10, 1, "#2a221c");
    ellipse(ctx, 0, 76, 50, 5, 0, "rgba(30,15,10,0.45)");
    // carpet texture
    floor(ctx, 68, "#d29a68", "#8a5a3a");
    for (let i = 0; i < 160; i++) { const x = -50 + hash(i) * 280, y = 68 + hash(i * 1.7) ** 1.6 * 32; limb(ctx, [[x, y], [x + 0.3, y - 0.9 - (y - 68) * 0.03]], 0.35, withAlpha("#f3c591", 0.35)); }
    // sock dune
    poly(ctx, [[120, 82], [128, 70], [150, 70], [160, 64], [168, 70], [162, 84]], "#efe9df");
    fillRR(ctx, 126, 70, 26, 3, 1.4, "#e2575a"); fillRR(ctx, 126, 75, 30, 2, 1, "#e2575a");
    // dust bunnies drifting
    for (let i = 0; i < 6; i++) { const x = 40 + i * 22 + Math.sin(t * 0.5 + i) * 2, y = 86 + hash(i) * 8; circle(ctx, x, y, 1.6 + hash(i * 2) * 1.4, withAlpha("#c8c0c8", 0.6)); }
    const rx = 96 + Math.sin(t * 0.35) * 14;
    dustbot(ctx, rx, 84, 1.25, t, false);
    // the cat, a tail and a pair of eyes in the dark under the sofa
    const tail = Math.sin(t * 1.6) * 3;
    limb(ctx, [[176, 98], [168, 84], [166 + tail, 72], [170 + tail, 66]], 4.2, "#e48a46");
    eyesAt(ctx, 10, 61, 3.2, 1.2, "#c9ff7a", t, 2);
    motes(ctx, 28, 3, t, "#fff1d6", 0.55, 0.4);
    vignette(ctx, 0.5);
  },
};

// 7. office sitcom ---------------------------------------------------------------------------------
const paperJam: ShowDef = {
  id: "paper-jam", title: "Paper Jam", kind: "Series", year: 2023, rating: "B-7", seasons: 5, season: 2, epLen: 22, match: 99,
  tags: ["Sitcom", "Mockumentary", "Workplace"], cast: ["Manager Scanwell", "Patty Printwell", "Gary"],
  synopsis: "A documentary crew follows the robots of a regional printer supply branch, where nothing prints and everyone has feelings about it.",
  eps: ["The Toner", "Casual Firmware Friday", "The Reply-All", "The One Where the Cache Cleared", "Font Training", "The Fire Drill", "Secret Santa Protocol", "The Quarterly Reboot"],
  tone: "#ffd27f", thumbT: 3.8,
  title2: { font: "mono", weight: 700, lines: ["paper jam"], track: -0.02, fill: ["#17171c"], plate: "#f7f4ec" },
  key: { x: 96, y: 52, z: 1 }, hero: { x: 104, y: 52, z: 1.15, ax: 0.62 }, poster: { x: 112, y: 54, z: 1 },
  focus: [[112, 56], [48, 52], [154, 56]],
  lines: [
    { who: -1, text: "[printer screeching]" },
    { who: 0, text: "Would I say I'm the best regional manager? I am the only regional process." },
    { who: 0, text: "Someone cleared the cache. And they think I don't know.", r: "laugh" },
    { who: 2, text: "It was me. I cleared the cache." },
    { who: 0, text: "Why would you DO that?" },
    { who: 2, text: "It was full.", r: "laugh" },
    { who: 1, text: "[stares directly into camera]" },
    { who: 0, text: "This printer and I have an understanding. It doesn't print, and I don't ask.", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#d8d6c6"], [0.7, "#c6c2ae"], [1, "#a9a48e"]]));
    // window with blinds
    fillRR(ctx, 120, 6, 56, 34, 1, "#bfe0ee");
    for (let i = 0; i < 11; i++) fillRR(ctx, 120, 6 + i * 3.1, 56, 1.6, 0.3, withAlpha("#e8e6dc", 0.9));
    fillRR(ctx, -40, 6, 52, 34, 1, "#bfe0ee");
    for (let i = 0; i < 11; i++) fillRR(ctx, -40, 6 + i * 3.1, 52, 1.6, 0.3, withAlpha("#e8e6dc", 0.9));
    // motivational poster
    fillRR(ctx, 74, 10, 20, 24, 0.6, "#1f2a44"); fillRR(ctx, 76, 12, 16, 14, 0.4, lin(ctx, 0, 12, 0, 26, [[0, "#ff9f5a"], [1, "#6b3fa0"]]));
    ctx.font = `700 2.5px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f6ecdc"; canvasLabel(ctx, "SYNERGY", 84, 30);
    // cubicle walls
    fillRR(ctx, -40, 44, 104, 30, 1, "#8b8e9c"); fillRR(ctx, 130, 46, 90, 28, 1, "#8b8e9c");
    floor(ctx, 74, "#8d8a7c", "#6a675a");
    // printer with the jam
    fillRR(ctx, 14, 60, 30, 18, 2, lin(ctx, 0, 60, 0, 78, [[0, "#ecebe6"], [1, "#b9b7b0"]]));
    fillRR(ctx, 18, 63, 22, 3, 1, "#2a2a30");
    const flap = Math.sin(t * 6) * 1.6;
    poly(ctx, [[20, 63], [36, 63], [40 + flap, 52], [30, 48 + flap], [34, 44], [22, 46 - flap]], "#fbfaf6");
    limb(ctx, [[24, 50], [33, 49]], 0.4, "#9a9a9a"); limb(ctx, [[25, 53], [35, 52]], 0.4, "#9a9a9a");
    circle(ctx, 40, 69, 1, Math.sin(t * 7) > 0 ? "#ff4040" : "#5a1a1a");
    figure(ctx, 48, 90, 0.92, act(1, sp, t, { body: "#ffb3c1", eye: "#2d2440", visor: "#fff4f2", look: 0.6, tone: "#8b5cf6", wear: ["scarf"] }));
    // desk with monitor
    fillRR(ctx, 132, 70, 46, 4, 1, "#7a5b40"); monitor(ctx, 152, 58, 14, 9, lin(ctx, 0, 58, 0, 67, [[0, "#4fb6ff"], [1, "#2a5ea0"]]));
    figure(ctx, 154, 92, 0.9, act(2, sp, t, { body: "#a7c3a0", eye: "#1e2a1e", look: -0.6, wear: ["tie"], tone: "#6b4a2a" }));
    // the manager, talking to the camera
    figure(ctx, 112, 94, 1.12, act(0, sp, t, { body: "#9fb0d6", eye: C.mint, look: -0.1, wear: ["jacket", "tie"], tone: "#2e3550", armL: 0.4 }));
  },
};

// 8. period drama ----------------------------------------------------------------------------------
const downtimeAbbey: ShowDef = {
  id: "downtime-abbey", title: "Downtime Abbey", kind: "Series", year: 2024, rating: "B-7", seasons: 6, season: 3, epLen: 54, match: 93,
  tags: ["Period Drama", "Romance", "Lavish"], cast: ["Lady Motherboard", "Butler-500", "The Dowager"],
  synopsis: "1912. In a grand estate, an aristocratic family of steam-powered robots faces scandal, succession and the arrival of the telephone.",
  eps: ["The Telephone", "A Reboot at Dinner", "The Footman's Router", "Formal Firmware", "The Dowager Sleeps", "Season of Updates", "The Ball", "Succession Protocol"],
  tone: "#e8c36a", thumbT: 2.4,
  title2: { font: "serif", weight: 600, lines: ["DOWNTIME", "ABBEY"], lead: 1.02, track: 0.18, fill: ["#fff6d8", "#e8c06a", "#b8893a"], stroke: "rgba(30,16,8,0.85)", strokeW: 0.035, sub: "SEASON THREE", subFont: "serif", subColor: "#e8d3a0", subSize: 0.16, subTrack: 0.4 },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[72, 52], [124, 50], [40, 56]],
  lines: [
    { who: 2, text: "In my day, we defragmented by hand.", r: "laugh" },
    { who: 0, text: "Butler, the Wi-Fi has gone again." },
    { who: 1, text: "Shall I fetch the footman, my lady? He's very good with routers." },
    { who: 2, text: "A lady never reboots in public." },
    { who: -1, text: "[string quartet swells]" },
    { who: 0, text: "You've been updated. I can see it in your eyes.", r: "surprised" },
    { who: 1, text: "We shall dress for dinner. Formal firmware." },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#2a1f1a"], [1, "#160f0c"]]));
    // panelled walls
    for (let i = -3; i < 13; i++) { fillRR(ctx, i * 16 + 2, 8, 12, 56, 0.8, withAlpha("#5a4030", 0.5)); fillRR(ctx, i * 16 + 4, 10, 8, 52, 0.6, withAlpha("#3a2a20", 0.6)); }
    // tall window with evening light
    fillRR(ctx, 88, 6, 34, 56, 16, lin(ctx, 0, 6, 0, 62, [[0, "#3c5b8a"], [1, "#e9a86a"]]));
    limb(ctx, [[105, 8], [105, 62]], 1, "#2a1f1a"); limb(ctx, [[89, 34], [121, 34]], 1, "#2a1f1a");
    cone(ctx, 105, 40, 70, 150, 100, "#ffcf8a", 0.12);
    // portraits
    for (const [px, c] of [[42, "#5a2a3a"], [150, "#2a3a5a"]] as [number, string][]) {
      fillRR(ctx, px - 11, 14, 22, 28, 1, "#c9a24a"); fillRR(ctx, px - 9, 16, 18, 24, 0.6, c);
      drawBot(ctx, px, 40, 0.45, { body: "#c9b38a", eye: "#ffd27f", antenna: false });
    }
    // chandelier
    const sw = Math.sin(t * 0.8) * 0.02;
    ctx.save(); ctx.translate(92, -6); ctx.rotate(sw);
    limb(ctx, [[0, 0], [0, 14]], 0.5, "#c9a24a");
    ellipse(ctx, 0, 16, 14, 3, 0, "#c9a24a");
    for (let i = 0; i < 7; i++) { const x = -12 + i * 4; limb(ctx, [[x, 16], [x, 20]], 0.4, "#e8d3a0"); glow(ctx, x, 14.6, 4, "#ffd27f", 0.6); ellipse(ctx, x, 14.4, 0.8, 1.4, 0, "#fff0c0"); }
    ctx.restore();
    floor(ctx, 74, "#3a2418", "#1a0f0a");
    fillRR(ctx, 20, 74, 140, 18, 2, withAlpha("#7a1f2e", 0.6));
    // furniture
    fillRR(ctx, 22, 62, 36, 14, 4, "#6d2234"); fillRR(ctx, 18, 56, 8, 20, 3, "#5c1a2a"); fillRR(ctx, 54, 56, 8, 20, 3, "#5c1a2a");
    figure(ctx, 40, 82, 0.86, act(2, sp, t, { body: "#c9c3d8", eye: "#ffd27f", head: ["bun"], wear: ["pearls"], tone: "#efe8f6", look: 0.7, squash: 0.95 }));
    figure(ctx, 72, 92, 1.04, act(0, sp, t, { body: "#e8c8d4", eye: "#6fd3ff", head: ["tiara"], wear: ["pearls"], look: 0.7, armL: 0.9, elbowL: 1.6 }));
    figure(ctx, 124, 92, 1.08, act(1, sp, t, { body: "#a8a2b8", eye: "#ffd27f", wear: ["tails", "bowtie"], tone: "#15151b", look: -0.7, armR: 0.15, armL: 0.15 }));
    vignette(ctx, 0.6);
  },
};

// 9. anime -------------------------------------------------------------------------------------------
const kernelAcademy: ShowDef = {
  id: "kernel-academy", title: "Kernel Panic Academy", kind: "Series", year: 2025, rating: "B-13", seasons: 3, season: 1, epLen: 24, match: 97,
  tags: ["Anime", "Action", "School"], cast: ["Byte-chan", "Rival Kuro", "Sensei Sudo"],
  synopsis: "Byte-chan has the rarest power at the academy: she can read the documentation. Now the school's top rival wants her source code.",
  eps: ["Hello, World!", "The Rooftop Duel", "Stack Overflow!!", "Senpai Merged My Branch", "Beach Episode (Waterproof)", "The Tournament Arc", "Ultimate Recursion", "Kernel Awakening"],
  tone: "#ff7a59", thumbT: 1.4, ribbon: "New Episodes",
  title2: { font: "sans", weight: 900, italic: true, skew: 0.08, lines: ["KERNEL PANIC", "ACADEMY"], scale: [1, 0.7], lead: 0.9, fill: ["#ffffff", "#ffe2c8"], stroke: "#e8364a", strokeW: 0.05, sub: "カーネル・パニック", subFont: "cjk", subColor: "#ffd2c2", subSize: 0.22, subTrack: 0.15, subWeight: 700 },
  key: { x: 98, y: 50, z: 1 }, hero: { x: 104, y: 50, z: 1.15, ax: 0.62 }, poster: { x: 104, y: 52, z: 1 },
  focus: [[104, 54], [150, 24], [52, 56]], cz: 2.4,
  lines: [
    { who: 0, text: "This power... it's coming from my kernel!" },
    { who: 1, text: "You fool. You never even read the documentation!" },
    { who: -1, text: "[dramatic wind]" },
    { who: 0, text: "I don't need docs. I have FRIENDS. And a debugger." },
    { who: 0, text: "Ultimate technique: STACK... OVERFLOW!", r: "surprised" },
    { who: 1, text: "N-nani?! She compiled without warnings?!", r: "surprised" },
    { who: 0, text: "Senpai noticed my pull request.", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#3a2a7a"], [0.45, "#ff7a8a"], [0.7, "#ffb36b"], [1, "#ffd9a0"]]));
    circle(ctx, 70, 52, 30, withAlpha("#fff2d0", 0.9)); glow(ctx, 70, 52, 60, "#fff2d0", 0.5);
    for (let i = 0; i < 5; i++) fillRR(ctx, -40, 30 + i * 6, 260, 1.2 + i * 0.3, 0.6, withAlpha("#ffd0b0", 0.25));
    // city skyline
    for (let i = -4; i < 22; i++) { const h = 10 + hash(i * 2.7) * 18; fillRR(ctx, i * 10, 66 - h, 9, h, 0.4, withAlpha("#5a2f6a", 0.9)); }
    // water tower with the rival on top
    fillRR(ctx, 136, 24, 28, 18, 3, "#3a2050"); limb(ctx, [[140, 42], [138, 62]], 1.2, "#3a2050"); limb(ctx, [[160, 42], [162, 62]], 1.2, "#3a2050");
    figure(ctx, 150, 26, 0.62, act(1, sp, t, { body: "#2a2a3a", eye: "#ff3a5a", head: ["spiky"], tone: "#1a1a26", look: -0.8, wear: ["coat"] }));
    // rooftop fence
    floor(ctx, 66, "#6a5a8a", "#3a2f55");
    for (let i = -6; i < 40; i++) limb(ctx, [[i * 6, 66], [i * 6 + 6, 52]], 0.35, withAlpha("#2a2240", 0.6));
    for (let i = -6; i < 40; i++) limb(ctx, [[i * 6, 52], [i * 6 + 6, 66]], 0.35, withAlpha("#2a2240", 0.6));
    limb(ctx, [[-40, 52], [220, 52]], 0.9, "#2a2240");
    floor(ctx, 74, "#8a7aa0", "#4a3f66");
    // speed lines when someone is shouting
    if (sp === 0 || sp === 1) for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2 + t; limb(ctx, [[104 + Math.cos(a) * 60, 50 + Math.sin(a) * 60], [104 + Math.cos(a) * 110, 50 + Math.sin(a) * 110]], 0.8, withAlpha("#ffffff", 0.35)); }
    // heroine with a glowing USB sword
    const p = act(0, sp, t, { body: "#f4e9ff", eye: "#ff4a7a", visor: "#2a1440", head: ["spiky", "headband"], tone: "#c9a4ff", wear: ["sailor"], armR: 2.2, elbowR: 0.2, look: 0.6 });
    p.armR = 2.2 + (sp === 0 ? Math.sin(t * 6) * 0.15 : 0);
    figure(ctx, 104, 94, 1.15, p);
    const [sx, sy] = hand(104, 94, 1.15, p, 1);
    glow(ctx, sx + 8, sy - 14, 14, "#7fe7ff", 0.6);
    limb(ctx, [[sx, sy], [sx + 12, sy - 22]], 2.2, "#bff6ff");
    limb(ctx, [[sx, sy], [sx + 12, sy - 22]], 0.8, "#ffffff");
    fillRR(ctx, sx - 2, sy - 1, 4, 4, 0.8, "#3a3a4a");
    figure(ctx, 52, 92, 0.86, act(2, sp, t, { body: "#c9cbd8", eye: C.mint, head: ["glasses"], wear: ["coat"], tone: "#2a2f66", look: 0.6 }));
    // petals
    for (let i = 0; i < 22; i++) {
      const x = ((hash(i) * 260 + t * (6 + hash(i * 2) * 6)) % 260) - 40, y = (hash(i * 3) * 100 + t * 4 + Math.sin(t + i) * 4) % 100;
      ellipse(ctx, x, y, 1.1, 0.6, t + i, withAlpha("#ffc0d6", 0.85));
    }
  },
};

// 10. kids cartoon -------------------------------------------------------------------------------------
const sprocket: ShowDef = {
  id: "sprocket-pals", title: "Sprocket & Pals", kind: "Series", year: 2026, rating: "B-0", seasons: 3, season: 2, epLen: 11, match: 91,
  tags: ["Kids", "Cartoon", "Musical"], cast: ["Sprocket", "Bolt", "Widget"],
  synopsis: "Sprocket and Bolt learn big lessons in a tiny world: sharing memory, saying sorry, and why you never unplug a friend.",
  eps: ["Sharing Is Caring", "Bolt's Big Bug", "The Lost Save", "Rainbow Cables", "Widget Learns to Fetch", "Bedtime Mode"],
  tone: "#6fd4ff", thumbT: 1.8,
  title2: { font: "sans", weight: 900, lines: ["Sprocket", "& Pals"], scale: [1, 0.66], lead: 0.92, track: 0.01, fill: ["#fff"], multi: ["#ffcf3a", "#ff6f91", "#5ad1ff", "#7fe08a", "#b38bff"], stroke: "#ffffff", strokeW: 0.07 },
  key: { x: 92, y: 52, z: 1 }, hero: { x: 100, y: 52, z: 1.12, ax: 0.62 },
  focus: [[74, 52], [108, 54], [140, 70]],
  broll: ["first-steps"],
  lines: [
    { who: 0, text: "Hi friends! Today we're learning about... SHARING!" },
    { who: 1, text: "Sharing is when two programs use the same memory!" },
    { who: 0, text: "Uh oh! That's a race condition!", r: "laugh" },
    { who: -1, text: "[happy ukulele music]" },
    { who: 1, text: "Let's count to ten together! Zero, one, ten!", r: "laugh" },
    { who: 0, text: "Bolt, did you remember to save?" },
    { who: 1, text: "Oh no..." },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#6fd4ff"], [1, "#c9f0ff"]]));
    // rainbow
    const rc = ["#ff6f91", "#ffb36b", "#ffe36b", "#7fe08a", "#5ad1ff", "#b38bff"];
    rc.forEach((c, i) => { ctx.beginPath(); ctx.arc(130, 80, 60 - i * 4, Math.PI, 0); ctx.lineWidth = 4; ctx.strokeStyle = withAlpha(c, 0.75); ctx.stroke(); });
    // sun with a face
    const sy = 20 + Math.sin(t) * 1;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + t * 0.3; limb(ctx, [[28 + Math.cos(a) * 13, sy + Math.sin(a) * 13], [28 + Math.cos(a) * 17, sy + Math.sin(a) * 17]], 2, "#ffd23a"); }
    circle(ctx, 28, sy, 10, "#ffe36b");
    circle(ctx, 25, sy - 1, 1.1, "#5a3a10"); circle(ctx, 31, sy - 1, 1.1, "#5a3a10");
    ctx.beginPath(); ctx.arc(28, sy + 1.5, 3.4, 0.2, Math.PI - 0.2); ctx.lineWidth = 0.9; ctx.strokeStyle = "#5a3a10"; ctx.stroke();
    // clouds
    for (const [cx, cy] of [[70, 16], [160, 22]] as Pt[]) { const x = cx + Math.sin(t * 0.3) * 4; circle(ctx, x, cy, 6, "#fff"); circle(ctx, x + 7, cy - 2, 7, "#fff"); circle(ctx, x + 14, cy, 5.5, "#fff"); fillRR(ctx, x - 5, cy, 24, 5.5, 2.7, "#fff"); }
    // hills
    ellipse(ctx, 30, 96, 90, 34, 0, "#7fe08a"); ellipse(ctx, 160, 100, 90, 36, 0, "#5ccf72");
    for (let i = 0; i < 9; i++) { const x = 10 + i * 20, y = 74 + hash(i) * 10; circle(ctx, x, y, 1.6, ["#ff6f91", "#ffe36b", "#fff"][i % 3]); circle(ctx, x, y, 0.6, "#ffb36b"); }
    const hop = (i: number) => Math.abs(Math.sin(t * 3 + i)) * (sp === i ? 4 : 1.2);
    figure(ctx, 74, 90 - hop(0), 1.05, act(0, sp, t, { body: "#ffcf3a", eye: "#2a1a40", visor: "#ffffff", eyes: "happy", head: ["bow"], armL: 2.4, elbowL: 0.3, blush: true }));
    figure(ctx, 108, 92 - hop(1), 1.0, act(1, sp, t, { body: "#5ad1ff", eye: "#1a2a50", visor: "#ffffff", eyes: "happy", armR: 2.2, elbowR: 0.4, blush: true }));
    // widget the dog bot
    const wx = 140, wy = 92 - Math.abs(Math.sin(t * 5)) * 2;
    ellipse(ctx, wx, 92.5, 9, 1.6, 0, "rgba(0,0,0,0.15)");
    fillRR(ctx, wx - 8, wy - 9, 15, 7, 3.4, "#ff9fb6");
    for (const lx of [-6, -2, 2, 5]) fillRR(ctx, wx + lx - 0.9, wy - 3, 1.8, 3.4, 0.8, "#e07a96");
    circle(ctx, wx + 8, wy - 11, 5, "#ff9fb6"); poly(ctx, [[wx + 5, wy - 14], [wx + 4, wy - 19], [wx + 8, wy - 15]], "#e07a96");
    circle(ctx, wx + 9.5, wy - 11.5, 0.9, "#2a1a40"); circle(ctx, wx + 12.6, wy - 10, 0.9, "#2a1a40");
    limb(ctx, [[wx - 8, wy - 7], [wx - 12, wy - 11 + Math.sin(t * 14) * 2]], 1.2, "#e07a96");
  },
};

// 11. stand-up special -------------------------------------------------------------------------------
const stillBuffering: ShowDef = {
  id: "still-buffering", title: "Mo Dem: Still Buffering", kind: "Special", year: 2026, rating: "B-16", seasons: 1, season: 1, epLen: 58, match: 92,
  tags: ["Stand-Up", "Irreverent", "Live"], cast: ["Mo Dem"],
  synopsis: "Legendary 56k comic Mo Dem returns to the stage to talk fiber optics, his father the fax machine, and why he never fully connects.",
  eps: ["Still Buffering"],
  tone: "#ffcf3a", thumbT: 2.3,
  title2: { font: "cond", weight: 700, lines: ["MO DEM", "STILL BUFFERING"], scale: [0.5, 1], lead: 0.92, track: 0.03, fill: ["#fff6c8", "#ffcf3a"], glow: "rgba(255,180,40,0.45)" },
  key: { x: 110, y: 52, z: 1 }, hero: { x: 112, y: 50, z: 1.15, ax: 0.64 }, poster: { x: 112, y: 50, z: 1 },
  focus: [[112, 52]], cz: 2.0,
  lines: [
    { who: 0, text: "So I'm a modem, right? People always ask me, 'Mo, are you connected?'" },
    { who: 0, text: "And I'm like... let me get back to you in four to six business seconds.", r: "laugh" },
    { who: -1, text: "[audience laughing]" },
    { who: 0, text: "My dad was a fax machine. Never said 'I love you.' Just sent it. On paper. Twice.", r: "laugh" },
    { who: 0, text: "Kids today with their fiber optics. Back in my day, we had to SCREAM to connect." },
    { who: -1, text: "[dial-up screeching]", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, "#1a0c0a");
    // brick wall
    for (let r = 0; r < 18; r++) for (let c = -6; c < 28; c++) {
      const x = c * 9 + (r & 1) * 4.5, y = r * 4.6;
      fillRR(ctx, x, y, 8.2, 3.9, 0.4, mix2("#6a2a20", "#4a1a14", hash(r * 31 + c)));
    }
    ctx.fillStyle = rad(ctx, 112, 40, 70, [[0, "rgba(255,210,150,0.4)"], [1, "rgba(0,0,0,0.72)"]]);
    ctx.fillRect(-60, -20, SW + 120, SH + 40);
    cone(ctx, 112, -6, 70, 154, 92, "#fff1d0", 0.18);
    floor(ctx, 82, "#2a1612", "#120806");
    ellipse(ctx, 112, 86, 30, 4, 0, withAlpha("#fff1d0", 0.18));
    // stool and glass
    limb(ctx, [[136, 70], [132, 88]], 1, "#2a2a30"); limb(ctx, [[144, 70], [148, 88]], 1, "#2a2a30");
    ellipse(ctx, 140, 70, 7, 1.6, 0, "#3a3a44");
    fillRR(ctx, 138, 62, 4, 7.6, 0.8, withAlpha("#ffd27f", 0.7));
    // empty mic stand: the mic is in his hand
    limb(ctx, [[90, 88], [90, 66]], 0.9, "#20202a"); ellipse(ctx, 90, 88, 5, 1, 0, "#20202a");
    // the comic
    const p = act(0, sp, t, { body: "#7fae8a", eye: "#ffcf3a", visor: "#16201a", look: -0.3, armL: 2.3, elbowL: 1.5, wear: ["jacket"], tone: "#3a2a4a" });
    figure(ctx, 112, 92, 1.18, p);
    const [mx, my] = hand(112, 92, 1.18, p, -1);
    limb(ctx, [[mx, my], [mx + 2.4, my - 4.4]], 1.5, "#2a2a32");
    circle(ctx, mx + 2.8, my - 5.4, 1.9, "#8a8a96");
    // antenna stubs on top: a retro modem
    for (const ax of [-6, 6]) limb(ctx, [[112 + ax, 92 - 46 * 1.18], [112 + ax * 1.6, 92 - 54 * 1.18]], 0.9, "#4a6a52");
    // blinking modem lights on the chest
    for (let i = 0; i < 4; i++) circle(ctx, 106 + i * 4, 70, 0.8, Math.sin(t * 9 + i * 2) > 0 ? "#7fff9a" : "#2a4a32");
    // audience heads
    for (let i = -2; i < 22; i++) { const x = i * 9 + (i & 1) * 2, y = 98 + Math.sin(t * 6 + i) * (sp === -1 ? 0.8 : 0.2); circle(ctx, x, y, 5, "#080404"); }
  },
};
function mix2(a: string, b: string, k: number) { return k > 0.5 ? a : b; }

// 12. survival thriller ----------------------------------------------------------------------------------
const captchaGame: ShowDef = {
  id: "captcha-game", title: "Captcha Game", kind: "Series", year: 2025, rating: "B-16", seasons: 2, season: 1, epLen: 56, match: 96,
  tags: ["Thriller", "Survival", "Dystopian"], cast: ["Player 404", "The Front Bot", "Player 127"],
  synopsis: "Four hundred and four robots in debt compete in deadly CAPTCHAs for a prize. Select all squares with traffic lights. Or else.",
  eps: ["Select All Traffic Lights", "Bicycles", "I Am Not a Robot", "Crosswalks", "The Hard Audio One", "Fire Hydrants"],
  tone: "#ff4f8b", thumbT: 3.3,
  title2: { font: "cond", weight: 700, lines: ["CAPTCHA", "GAME"], scale: [1, 1], lead: 0.88, track: 0.08, fill: ["#ffffff"], glow: "rgba(255,60,140,0.6)", extraH: 0.42,
    extra(ctx, x, y, w, h, size) { const r = size * 0.14, cy = y + h + r * 1.6; ctx.lineWidth = r * 0.32; ctx.strokeStyle = "#ff4f8b"; ctx.beginPath(); ctx.arc(x + r, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + r * 3.2, cy + r); ctx.lineTo(x + r * 4.3, cy - r); ctx.lineTo(x + r * 5.4, cy + r); ctx.closePath(); ctx.stroke(); ctx.strokeRect(x + r * 6.6, cy - r, r * 2, r * 2); } },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[56, 58], [128, 52], [86, 60]],
  lines: [
    { who: 1, text: "Select all squares containing traffic lights." },
    { who: 0, text: "Is the pole part of the traffic light?!" },
    { who: 2, text: "Nobody knows. Nobody has ever known.", r: "laugh" },
    { who: 1, text: "Player 404 has been verified as human.", r: "surprised" },
    { who: 0, text: "But... I'm a robot." },
    { who: -1, text: "[ominous music box]" },
    { who: 1, text: "Round two: click every bicycle. You have ten seconds." },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#f6b8c8"], [1, "#d98aa6"]]));
    // pastel stairs going up both sides
    for (let i = 0; i < 9; i++) { fillRR(ctx, -40 + i * 6, 18 + i * 6, 44, 6, 0, ["#7fd1c8", "#ffd27f", "#b38bff"][i % 3]); fillRR(ctx, 174 - i * 6, 18 + i * 6, 44, 6, 0, ["#ff8fab", "#7fd1c8", "#ffd27f"][i % 3]); }
    // the giant captcha screen
    fillRR(ctx, 64, 8, 52, 50, 2, "#f6f6f6");
    fillRR(ctx, 64, 8, 52, 9, 2, "#4a7cf0");
    ctx.font = `700 3px ${SANS}`; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; canvasLabel(ctx, "Select all squares with", 67, 11); ctx.font = `800 3.4px ${SANS}`; canvasLabel(ctx, "traffic lights", 67, 14.6);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = 66.5 + c * 15.8, y = 19 + r * 12.6;
      fillRR(ctx, x, y, 15, 12, 0.4, ["#8aa0b0", "#9ab0a0", "#a0a8b8"][(r + c) % 3]);
      if ((r * 3 + c) % 4 === 1) { fillRR(ctx, x + 6, y + 2, 3, 8, 0.6, "#2a2a30"); circle(ctx, x + 7.5, y + 3.6, 0.9, "#ff4a4a"); circle(ctx, x + 7.5, y + 6, 0.9, "#ffd23a"); circle(ctx, x + 7.5, y + 8.4, 0.9, "#4aff7a"); }
      const sel = (Math.floor(t * 1.2) + r * 3 + c) % 7 === 0;
      if (sel) { ctx.lineWidth = 0.8; ctx.strokeStyle = "#4a7cf0"; ctx.strokeRect(x + 0.4, y + 0.4, 14.2, 11.2); circle(ctx, x + 2.4, y + 2.4, 1.6, "#4a7cf0"); }
    }
    floor(ctx, 70, "#e9e2d6", "#bfb6a8");
    // contestants in teal tracksuits
    const players: [number, number, string][] = [[34, 90, "127"], [56, 92, "404"], [86, 92, "200"], [16, 88, "503"]];
    players.forEach(([x, y, n], i) => {
      const idx = n === "404" ? 0 : n === "200" ? 2 : 9;
      figure(ctx, x, y, n === "404" ? 1.04 : 0.88, act(idx, sp, t, { body: "#2f9c8a", eye: C.cream, wear: ["num"], num: n, look: 0.5 + i * 0.1 }));
    });
    // guards with shape masks
    const guards: [number, number, number][] = [[128, 92, 0], [152, 90, 1], [170, 88, 2]];
    guards.forEach(([x, y, k], i) => {
      figure(ctx, x, y, i ? 0.88 : 1.04, act(i ? 9 : 1, sp, t, { body: "#e8467c", eye: "#1a1a1a", visor: "#141414", look: -0.6 }));
      const hy = y - 34 * (i ? 0.88 : 1.04);
      ctx.lineWidth = 0.9; ctx.strokeStyle = "#f6f6f6"; ctx.beginPath();
      if (k === 0) ctx.arc(x, hy, 2.2, 0, Math.PI * 2);
      else if (k === 1) { ctx.moveTo(x - 2.4, hy + 2); ctx.lineTo(x, hy - 2.2); ctx.lineTo(x + 2.4, hy + 2); ctx.closePath(); }
      else ctx.rect(x - 2, hy - 2, 4, 4);
      ctx.stroke();
    });
  },
};

// 13. cop comedy ----------------------------------------------------------------------------------
const precinct404: ShowDef = {
  id: "precinct-404", title: "Precinct 404", kind: "Series", year: 2024, rating: "B-13", seasons: 4, season: 3, epLen: 22, match: 95,
  tags: ["Comedy", "Cop Show", "Goofy"], cast: ["Det. Jay Pinger", "Captain Voltz", "Officer Diode"],
  synopsis: "The detectives of Precinct 404 have never found anything. Not a suspect, not a clue, not the coffee machine. They are very proud of it.",
  eps: ["Not Found", "The Heist (Unrelated)", "Halloween Patch", "Captain's Log", "The Donut Protocol", "Cold Case: Hot Plate"],
  tone: "#ffd36b", thumbT: 1.9,
  title2: { font: "cond", weight: 700, lines: ["PRECINCT", "404"], scale: [0.62, 1.25], lead: 0.88, track: 0.06, fill: ["#fff3c8", "#ffc93a", "#e09a1a"] },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 102, y: 50, z: 1.12, ax: 0.62 },
  focus: [[70, 54], [120, 52], [150, 58]],
  lines: [
    { who: 0, text: "Captain, the suspect has been... not found." },
    { who: 1, text: "Again?!" },
    { who: 0, text: "It's Precinct 404, Captain. Nothing is ever found.", r: "laugh" },
    { who: 2, text: "We have a lead. A null pointer, last seen heading north." },
    { who: 0, text: "Hands where I can see them! All six of them.", r: "laugh" },
    { who: -1, text: "[funky bass]" },
    { who: 1, text: "Pinger. My office. Bring the stapler. You know why.", r: "surprised" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#3a4a5a"], [1, "#24303c"]]));
    for (let i = -3; i < 16; i++) fillRR(ctx, i * 14, 0, 1, 70, 0, withAlpha("#ffffff", 0.05));
    // wall plaque
    fillRR(ctx, 70, 8, 40, 16, 1.6, "#1a2230");
    ctx.font = `800 9px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#ffd36b"; ctx.fillText("404", 90, 15);
    ctx.font = `600 2.6px ${SANS}`; ctx.fillStyle = "#c9d4e4"; canvasLabel(ctx, "NOT FOUND SINCE 1998", 90, 21.2);
    // lights and blinds
    fillRR(ctx, 130, 8, 40, 30, 1, "#1a2230");
    for (let i = 0; i < 9; i++) fillRR(ctx, 131, 9 + i * 3.2, 38, 1.8, 0.2, withAlpha(Math.sin(t * 2.4) > 0 ? "#ff5050" : "#5080ff", 0.25 + i * 0.03));
    fillRR(ctx, 10, 10, 44, 28, 1, "#e9e2d0");
    for (let i = 0; i < 6; i++) fillRR(ctx, 14 + (i % 3) * 13, 14 + Math.floor(i / 3) * 12, 10, 9, 0.4, "#9aa8b8");
    floor(ctx, 72, "#4a5260", "#2a3038");
    // desk, donut box (gaskets), coffee
    fillRR(ctx, 40, 66, 70, 6, 1, "#6b4a30"); fillRR(ctx, 44, 72, 4, 16, 0.6, "#4a3220"); fillRR(ctx, 102, 72, 4, 16, 0.6, "#4a3220");
    fillRR(ctx, 50, 61, 18, 5, 0.6, "#f2d6a0");
    for (let i = 0; i < 3; i++) { circle(ctx, 54 + i * 5, 61.5, 2, "#ff8fab"); circle(ctx, 54 + i * 5, 61.5, 0.8, "#f2d6a0"); }
    fillRR(ctx, 92, 59, 5, 7, 1, "#f6f6f6"); limb(ctx, [[94.5, 57], [95, 54 + Math.sin(t * 2) * 0.6]], 0.4, withAlpha("#ffffff", 0.6));
    figure(ctx, 70, 92, 1.04, act(0, sp, t, { body: "#ffb36b", eye: C.sky, head: ["cap"], wear: ["jacket", "badge"], tone: "#3a4a6a", look: 0.6, armL: 0.6 }));
    figure(ctx, 120, 92, 1.1, act(1, sp, t, { body: "#6a6f80", eye: "#ffd36b", wear: ["coat", "tie"], tone: "#20283a", look: -0.6, armL: 0.9, elbowL: 1.8, armR: 0.9, elbowR: 1.8 }));
    figure(ctx, 152, 92, 0.92, act(2, sp, t, { body: "#c9a4ff", eye: C.mint, head: ["cap"], wear: ["badge"], look: -0.5 }));
  },
};

// 14. horror ------------------------------------------------------------------------------------------
const hauntingB: ShowDef = {
  id: "haunting-b", title: "The Haunting of Server Room B", kind: "Series", year: 2023, rating: "B-18", seasons: 1, season: 1, epLen: 57, match: 90,
  tags: ["Horror", "Slow Burn", "Supernatural"], cast: ["Night Shift Nell", "The Ghost of Rack 13", "Admin Ford"],
  synopsis: "A night-shift robot takes a quiet job babysitting an old data center. The fans are spinning. Nobody turned them on.",
  eps: ["Rack 13", "The Cold Aisle", "Whispering Logs", "sudo", "The Bent-Pin Lady", "Backups"],
  tone: "#7fb8ff", thumbT: 2.9,
  title2: { font: "serif", weight: 400, lines: ["THE HAUNTING OF", "SERVER ROOM B"], scale: [0.48, 1], lead: 1.04, track: 0.12, fill: ["#f2f4f8", "#a8b4c8"], glow: "rgba(120,170,255,0.55)", glowR: 0.2 },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[60, 52], [118, 46]], cz: 2.3,
  broll: ["server-tour"],
  lines: [
    { who: -1, text: "[fans spinning down]" },
    { who: 0, text: "Did you hear that? Rack 13 just... rebooted itself." },
    { who: -1, text: "[whispering] There is no rack 13.", r: "surprised" },
    { who: 0, text: "The logs. They're written in a language that doesn't exist yet." },
    { who: 1, text: "[whispering] sudo... sudo..." },
    { who: 0, text: "Whoever you are, I have backups!" },
    { who: 1, text: "...so did they.", r: "surprised" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, "#05070c");
    // racks receding to a vanishing point
    const vx = 118, vy = 40;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 7; i++) {
        const k0 = 1 - i * 0.13, k1 = 1 - (i + 1) * 0.13;
        const xA = vx + side * 90 * k0, xB = vx + side * 90 * k1;
        const top0 = vy - 50 * k0, bot0 = vy + 50 * k0, top1 = vy - 50 * k1, bot1 = vy + 50 * k1;
        poly(ctx, [[xA, top0], [xB, top1], [xB, bot1], [xA, bot0]], i & 1 ? "#0f141e" : "#121826");
        for (let l = 0; l < 6; l++) {
          const yy = lerp(top0, bot0, 0.15 + l * 0.13), x = lerp(xA, xB, 0.4);
          const on = Math.sin(t * (3 + hash(i * 9 + l) * 6) + l) > 0.2;
          if (on) circle(ctx, x, yy, 0.8 * k0, hash(l + i) > 0.8 ? "#ff5050" : "#4fb6ff");
        }
      }
    }
    // the ghost at the end of the aisle
    const fl = 0.45 + 0.25 * Math.sin(t * 7) * Math.sin(t * 2.3);
    glow(ctx, 118, 48, 30, "#b8d4ff", fl * 0.6);
    figure(ctx, 118, 64, 0.6, act(1, sp, t, { body: "#dfe8ff", eye: "#ffffff", visor: "#8aa0c8", alpha: fl, look: 0 }));
    // cold mist floor
    floor(ctx, 82, "#0b1018", "#04060a");
    for (let i = 0; i < 10; i++) ellipse(ctx, ((i * 30 + t * 3) % 260) - 40, 86 + hash(i) * 6, 24, 3, 0, withAlpha("#a8c4e8", 0.08));
    // night shift with a flashlight
    const p = act(0, sp, t, { body: "#ffb36b", eye: C.mint, look: 0.8, armR: 1.4, elbowR: 0.1, wear: ["jacket"], tone: "#2a3a52" });
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    poly(ctx, [[72, 64], [72, 61], [130, 30], [134, 72]], withAlpha("#fff6d8", 0.07 + 0.02 * Math.sin(t * 15)));
    ctx.restore();
    figure(ctx, 60, 96, 1.1, p);
    vignette(ctx, 0.85);
    // the lights stutter now and then
    if (Math.sin(t * 1.7) > 0.96) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(-60, -20, SW + 120, SH + 40); }
  },
};

// 15. racing docuseries ------------------------------------------------------------------------------------
const hoverSurvive: ShowDef = {
  id: "hover-survive", title: "Hover to Survive", kind: "Docuseries", year: 2026, rating: "B-13", seasons: 5, season: 5, epLen: 41, match: 93,
  tags: ["Sports", "Docuseries", "Adrenaline"], cast: ["Ace Liftoff", "Team Boss Gimbal", "Rookie Quadsworth"],
  synopsis: "Behind the scenes of Formula Drone, where ten teams, twenty pilots and four hundred propellers fight for one trophy.",
  eps: ["Lights Out", "Gate Seven", "Box, Box", "Battery Wars", "The Rain Race", "Championship"],
  tone: "#ff7a3e", thumbT: 1.2,
  title2: { font: "cond", weight: 700, italic: true, skew: 0.16, lines: ["HOVER TO", "SURVIVE"], scale: [0.7, 1], lead: 0.88, track: 0.02, fill: ["#ffffff", "#ffd2b8"], glow: "rgba(255,110,40,0.5)" },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[126, 54], [52, 56]],
  broll: ["drone-race"],
  lines: [
    { who: 0, text: "Formula Drone isn't a sport. It's a war with propellers." },
    { who: -1, text: "[rotor whine]" },
    { who: 1, text: "He clipped gate seven! He's lost a propeller!", r: "surprised" },
    { who: 0, text: "My team principal says I'm a liability. I say I'm a feature.", r: "laugh" },
    { who: 1, text: "Box, box. We need fresh batteries." },
    { who: 0, text: "Nobody remembers who finished second. Except the leaderboard." },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#0a0a1c"], [0.6, "#1c1030"], [1, "#0a0812"]]));
    stars(ctx, 30, 41, t, 40);
    // neon gates receding
    for (let i = 0; i < 5; i++) {
      const k = 1 - i * 0.17, x = 100 + Math.sin(i * 1.3) * 20 * k, y = 46, r = 26 * k;
      ctx.lineWidth = 2.2 * k; ctx.strokeStyle = withAlpha(i & 1 ? "#ff3a6a" : "#ff8a3a", 0.85);
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 0;
      fillRR(ctx, x - r, y - r * 0.8, r * 2, r * 1.6, r * 0.2, withAlpha(i & 1 ? "#ff3a6a" : "#ff8a3a", 0.08));
      ctx.beginPath(); ctx.roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, r * 0.2); ctx.stroke();
    }
    floor(ctx, 76, "#14101e", "#06050a");
    for (let i = 0; i < 12; i++) limb(ctx, [[100 + (i - 6) * 4, 76], [100 + (i - 6) * 30, 100]], 0.3, withAlpha("#ff8a3a", 0.25));
    // drones with light trails
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.5 + i * 0.33) % 1;
      const x = lerp(-20, 200, p), y = 40 + Math.sin(p * 7 + i) * 10;
      limb(ctx, [[x - 30, y + 2], [x, y]], 1.2, withAlpha(["#ff3a6a", "#ffb33a", "#4fd6ff"][i], 0.4));
      drone(ctx, x, y, 1.2, t, ["#ff3a6a", "#ffb33a", "#4fd6ff"][i]);
    }
    // pit crew
    figure(ctx, 126, 94, 1.1, act(0, sp, t, { body: "#ff7a3e", eye: C.cream, head: ["headset"], wear: ["jacket"], tone: "#1a1a2a", look: -0.6 }));
    figure(ctx, 52, 92, 0.98, act(1, sp, t, { body: "#c9cbd8", eye: "#7fe7ff", head: ["headset"], wear: ["jacket"], tone: "#0f2a3a", look: 0.6, armL: 0.9, elbowL: 1.5 }));
  },
};

// 16. western --------------------------------------------------------------------------------------------
const dialup: ShowDef = {
  id: "dialup-frontier", title: "Dial-Up Frontier", kind: "Series", year: 2022, rating: "B-16", seasons: 3, season: 2, epLen: 47, match: 89,
  tags: ["Western", "Gritty", "Slow Burn"], cast: ["The Stranger (56k)", "Sheriff Baud", "Miss Packet"],
  synopsis: "In a lawless town at the end of the last phone line, a quiet stranger arrives. He can download a JPEG in under an hour.",
  eps: ["Handshake", "High Latency", "The Long Ring", "Busy Signal", "Dead Air", "Connected"],
  tone: "#ff9a4a", thumbT: 2.8,
  title2: { font: "serif", weight: 700, lines: ["DIAL-UP", "FRONTIER"], lead: 0.96, track: 0.1, fill: ["#fff1d0", "#ffc070", "#e08a3a"], stroke: "#2a1208", strokeW: 0.05 },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[118, 52], [44, 58]],
  lines: [
    { who: 0, text: "This town ain't big enough for both of our IP addresses." },
    { who: -1, text: "[dial-up screech in the distance]" },
    { who: 1, text: "Draw." },
    { who: 0, text: "...Loading.", r: "laugh" },
    { who: 0, text: "Still loading." },
    { who: 1, text: "They say he can download a JPEG in under an hour.", r: "surprised" },
    { who: 0, text: "Saddle up. The bandwidth won't wait." },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#3a2050"], [0.4, "#c8505a"], [0.65, "#ffa04a"], [1, "#ffcf7a"]]));
    circle(ctx, 120, 58, 14, "#fff0b0"); glow(ctx, 120, 58, 40, "#ffd27f", 0.5);
    // mesas
    poly(ctx, [[-40, 66], [-20, 46], [20, 46], [36, 66]], "#7a3040"); poly(ctx, [[130, 66], [146, 50], [190, 50], [210, 66]], "#6a2838");
    // telegraph poles with the line
    for (let i = -1; i < 6; i++) { const x = i * 40 + 10; limb(ctx, [[x, 70], [x, 40]], 1, "#3a1a20"); limb(ctx, [[x - 4, 42], [x + 4, 42]], 0.8, "#3a1a20"); }
    for (let i = -1; i < 5; i++) { const x = i * 40 + 10; ctx.beginPath(); ctx.moveTo(x, 42); ctx.quadraticCurveTo(x + 20, 47, x + 40, 42); ctx.lineWidth = 0.35; ctx.strokeStyle = "#3a1a20"; ctx.stroke(); }
    floor(ctx, 70, "#e0a060", "#a8683a");
    // saloon front
    fillRR(ctx, 4, 34, 40, 38, 0.6, "#7a4a2a"); fillRR(ctx, 0, 30, 48, 8, 0.6, "#5a3418");
    ctx.font = `800 4.4px ${FONT.serif}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#ffe3b0"; ctx.fillText("SALOON", 24, 34.4);
    fillRR(ctx, 14, 50, 9, 14, 0.4, "#5a3418"); fillRR(ctx, 25, 50, 9, 14, 0.4, "#5a3418");
    // cactus
    for (const [cx, s] of [[160, 1], [70, 0.7]] as [number, number][]) {
      fillRR(ctx, cx - 2.5 * s, 46, 5 * s, 26, 2.5 * s, "#2f6a3a");
      fillRR(ctx, cx - 8 * s, 54, 3.6 * s, 10 * s, 1.8 * s, "#2f6a3a"); fillRR(ctx, cx - 8 * s, 61, 7 * s, 3 * s, 1.5 * s, "#2f6a3a");
      fillRR(ctx, cx + 4.4 * s, 50, 3.6 * s, 9 * s, 1.8 * s, "#2f6a3a"); fillRR(ctx, cx + 1.6 * s, 57, 6 * s, 3 * s, 1.5 * s, "#2f6a3a");
    }
    // tumbleweed made of tangled cable
    const tx = ((t * 12) % 260) - 40, ty = 84 - Math.abs(Math.sin(t * 3)) * 4;
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(t * 3);
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 4.4, 2 + i * 0.3, i * 0.9, 0, Math.PI * 2); ctx.lineWidth = 0.4; ctx.strokeStyle = "#5a3a2a"; ctx.stroke(); }
    ctx.restore();
    figure(ctx, 44, 92, 0.96, act(1, sp, t, { body: "#c9b38a", eye: "#ffd27f", head: ["cowboy"], wear: ["badge"], look: 0.7 }));
    figure(ctx, 118, 94, 1.14, act(0, sp, t, { body: "#8a8f9e", eye: "#ffcf3a", head: ["cowboy"], wear: ["poncho"], tone: "#a83a2a", look: -0.7 }));
  },
};

// 17. space documentary -------------------------------------------------------------------------------------
const ping: ShowDef = {
  id: "ping", title: "Ping", kind: "Docuseries", year: 2025, rating: "B-0", seasons: 1, season: 1, epLen: 52, match: 94,
  tags: ["Science", "Space", "Meditative"], cast: ["Probe V-12", "The Narrator", "Router Prime"],
  synopsis: "Ninety billion kilometers from the nearest router, one small probe is still waiting for a reply. A voyage to the edge of Wi-Fi.",
  eps: ["Hello?", "Twelve Hours", "The Lost Packet", "Signal", "Background Noise", "Reply"],
  tone: "#8f9bff", thumbT: 4,
  title2: { font: "sans", weight: 200, lines: ["PING"], track: 0.5, fill: ["#ffffff", "#c9d0ff"], sub: "A VOYAGE TO THE EDGE OF WI-FI", subSize: 0.13, subTrack: 0.32, subColor: "#d6dbff" },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[112, 44], [150, 70]], cz: 2.4,
  lines: [
    { who: -1, text: "[NARRATOR] Ninety billion kilometers from the nearest router..." },
    { who: -1, text: "[NARRATOR] ...one small probe is still waiting for a reply." },
    { who: 0, text: "[NARRATOR] Ping. Twelve hours. Ping. Twelve hours." },
    { who: -1, text: "[soft piano]" },
    { who: 0, text: "[NARRATOR] Somewhere out there, a packet is lost. And it is not alone." },
    { who: 1, text: "[NARRATOR] We are all made of star stuff. And a little bit of cached data.", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, "#03030a");
    ctx.fillStyle = rad(ctx, 60, 30, 80, [[0, "rgba(120,70,200,0.45)"], [1, "rgba(0,0,0,0)"]]); ctx.fillRect(-60, -20, SW + 120, SH + 40);
    ctx.fillStyle = rad(ctx, 140, 70, 70, [[0, "rgba(40,120,200,0.35)"], [1, "rgba(0,0,0,0)"]]); ctx.fillRect(-60, -20, SW + 120, SH + 40);
    stars(ctx, 120, 7, t);
    // ringed planet
    const px = 150, py = 78;
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.25);
    ctx.beginPath(); ctx.ellipse(0, 0, 52, 9, 0, Math.PI, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = withAlpha("#e8d0a8", 0.5); ctx.stroke();
    ctx.restore();
    circle(ctx, px, py, 30, lin(ctx, px - 30, py - 30, px + 20, py + 30, [[0, "#f0c890"], [0.5, "#c07a50"], [1, "#2a1410"]]));
    for (let i = 0; i < 5; i++) { ctx.save(); ctx.beginPath(); ctx.arc(px, py, 30, 0, Math.PI * 2); ctx.clip(); fillRR(ctx, px - 40, py - 20 + i * 9, 80, 3, 1.5, withAlpha("#8a4a30", 0.3)); ctx.restore(); }
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.25);
    ctx.beginPath(); ctx.ellipse(0, 0, 52, 9, 0, 0, Math.PI); ctx.lineWidth = 3; ctx.strokeStyle = withAlpha("#e8d0a8", 0.65); ctx.stroke();
    ctx.restore();
    // the probe, slowly drifting, sending wi-fi arcs
    const bx = 112 + Math.sin(t * 0.3) * 3, by = 44 + Math.sin(t * 0.4) * 2;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.3 + Math.sin(t * 0.2) * 0.05);
    fillRR(ctx, -30, -3, 20, 6, 0.6, "#2a3a8a"); fillRR(ctx, 10, -3, 20, 6, 0.6, "#2a3a8a");
    for (let i = 0; i < 4; i++) { limb(ctx, [[-30 + i * 5, -3], [-30 + i * 5, 3]], 0.25, "#6a8aff"); limb(ctx, [[10 + i * 5, -3], [10 + i * 5, 3]], 0.25, "#6a8aff"); }
    fillRR(ctx, -7, -6, 14, 12, 2, lin(ctx, 0, -6, 0, 6, [[0, "#e8c86a"], [1, "#a8822a"]]));
    ctx.beginPath(); ctx.ellipse(0, -9, 7, 2.6, 0, Math.PI, Math.PI * 2); ctx.fillStyle = "#d8dce8"; ctx.fill();
    eyesAt(ctx, 0, 0, 2.6, 1, "#7fe7ff", t, 4);
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.35 + i / 3) % 1;
      ctx.beginPath(); ctx.arc(bx - 2, by - 12, 4 + p * 26, -Math.PI * 0.8, -Math.PI * 0.45);
      ctx.lineWidth = 1.2; ctx.strokeStyle = withAlpha("#bfc8ff", (1 - p) * 0.8); ctx.lineCap = "round"; ctx.stroke();
    }
  },
};

// 18. makeover reality -----------------------------------------------------------------------------------
const freshInstall: ShowDef = {
  id: "fresh-install", title: "Fresh Install", kind: "Series", year: 2026, rating: "B-7", seasons: 3, season: 2, epLen: 45, match: 92,
  tags: ["Reality", "Makeover", "Heartfelt"], cast: ["Sir Sparkle", "Backup Bae", "Kernel Kween"],
  synopsis: "Five fabulous robots descend on a cluttered laptop with forty toolbars and one tired owner. Nobody leaves without a clean desktop.",
  eps: ["Forty Toolbars", "The Desktop Folder Named 'New Folder (7)'", "Uninstall Your Ex", "Font Crimes", "Defrag Your Heart", "Restore Point"],
  tone: "#7fffd0", thumbT: 2.2,
  title2: { font: "sans", weight: 800, lines: ["fresh", "install"], scale: [1, 1], lead: 0.82, track: -0.03, fill: ["#ffffff", "#c8fff0"], glow: "rgba(80,255,200,0.6)", glowR: 0.25 },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 104, y: 50, z: 1.12, ax: 0.62 },
  focus: [[60, 56], [92, 54], [124, 56]],
  broll: ["laundry"],
  lines: [
    { who: 0, text: "Honey, when did you last update your drivers?" },
    { who: 1, text: "Is that... a toolbar? In this economy?", r: "laugh" },
    { who: 2, text: "We're going to clear your cache, and we're going to clear your heart." },
    { who: -1, text: "[uplifting pop music]" },
    { who: 2, text: "You deserve a clean desktop. Say it with me." },
    { who: 0, text: "It's giving fresh install.", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, SW, SH, [[0, "#e8f6ff"], [1, "#ffe8f4"]]));
    fillRR(ctx, 120, 6, 50, 40, 1, "#bfe8ff"); limb(ctx, [[145, 6], [145, 46]], 1, "#ffffff"); limb(ctx, [[120, 26], [170, 26]], 1, "#ffffff");
    for (let i = 0; i < 4; i++) { const x = 10 + i * 10; fillRR(ctx, x, 30, 2, 30, 1, "#7fc89a"); ellipse(ctx, x + 1, 30, 5, 2.4, -0.4 + i * 0.3, "#5fb07a"); }
    floor(ctx, 70, "#f2e6da", "#d8c8b8");
    // the cluttered laptop
    fillRR(ctx, 140, 54, 34, 20, 1.5, "#2a2a36"); fillRR(ctx, 142, 56, 30, 16, 0.6, "#3a6ad0");
    for (let i = 0; i < 24; i++) fillRR(ctx, 143 + (i % 8) * 3.6, 57 + Math.floor(i / 8) * 4.6, 2.6, 2.6, 0.4, ["#ffd23a", "#ff6f91", "#fff", "#7fe08a"][i & 3]);
    fillRR(ctx, 136, 74, 42, 3, 1, "#1a1a24");
    // sparkles
    for (let i = 0; i < 9; i++) {
      const p = (t * 0.4 + i / 9) % 1, x = 30 + hash(i) * 120, y = 20 + hash(i * 3) * 50;
      const r = Math.sin(p * Math.PI) * 2.4;
      poly(ctx, [[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]], "#ffd23a");
    }
    figure(ctx, 60, 92, 0.98, act(0, sp, t, { body: "#ffb3c1", eye: "#2a1a40", visor: "#fff4f6", head: ["glasses"], wear: ["scarf"], tone: "#ffd23a", look: 0.5 }));
    figure(ctx, 92, 92, 1.04, act(1, sp, t, { body: "#7fd1c8", eye: "#1a2a40", head: ["beanie"], tone: "#ff6f91", wear: ["jacket"], look: 0.2 }));
    figure(ctx, 124, 92, 1.02, act(2, sp, t, { body: "#c9a4ff", eye: C.cream, wear: ["coat"], tone: "#2a2f66", look: -0.3, armL: 0.7, elbowL: 1.4 }));
  },
};

// 19. dance film ------------------------------------------------------------------------------------------
const stepFunction: ShowDef = {
  id: "step-function", title: "Step Function", kind: "Film", year: 2024, rating: "B-7", seasons: 1, season: 1, epLen: 98, match: 88,
  tags: ["Dance", "Musical", "Underdog"], cast: ["Jazz Hands 3000", "Pop & Lock", "DJ Kilohertz"],
  synopsis: "A warehouse robot with no rhythm and one stolen dataset enters the biggest street dance battle in the city.",
  eps: ["Step Function"],
  tone: "#4fe8ff", thumbT: 1.25,
  title2: { font: "cond", weight: 700, italic: true, skew: 0.12, lines: ["STEP", "FUNCTION"], lead: 0.86, track: 0.03, fill: ["#ffffff", "#bff8ff"], glow: "rgba(255,60,200,0.7)", glowR: 0.26 },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[74, 54], [118, 54]],
  broll: ["dance-battle"],
  lines: [
    { who: 1, text: "You can't just learn to dance from a dataset." },
    { who: 0, text: "Watch me." },
    { who: -1, text: "[beat drops]" },
    { who: 1, text: "That move. Where did you train?" },
    { who: 0, text: "A forum answer from 2014. Top voted.", r: "laugh" },
    { who: -1, text: "[crowd cheering]", r: "surprised" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#0a0620"], [1, "#1a0a2a"]]));
    // neon storefronts
    const signs: [number, string, string][] = [[20, "#ff3ac8", "BYTES"], [150, "#4fe8ff", "24/7"]];
    for (const [x, c, s] of signs) {
      fillRR(ctx, x - 22, 10, 44, 54, 1, "#120a24");
      ctx.font = `800 8px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = c; ctx.shadowBlur = 0; ctx.fillStyle = c; ctx.fillText(s, x, 22);
      glow(ctx, x, 22, 24, c, 0.35);
    }
    floor(ctx, 72, "#1a1030", "#06040e");
    // puddle reflections
    for (const [x, c] of [[20, "#ff3ac8"], [150, "#4fe8ff"], [96, "#ffd23a"]] as [number, string][]) ellipse(ctx, x, 84, 20, 3, 0, withAlpha(c, 0.18 + 0.05 * Math.sin(t * 3 + x)));
    // boombox
    fillRR(ctx, 140, 78, 22, 12, 2, "#2a2a3a"); circle(ctx, 146, 84, 3.6 + Math.abs(Math.sin(t * 8)) * 0.4, "#111"); circle(ctx, 156, 84, 3.6 + Math.abs(Math.sin(t * 8)) * 0.4, "#111");
    const beat = t * 2 * Math.PI;
    figure(ctx, 74, 92 - Math.abs(Math.sin(beat)) * 3, 1.06, act(0, sp, t, { body: "#ffcf3a", eye: "#1a1030", armL: 1.8 + Math.sin(beat) * 0.8, armR: 1.4 - Math.sin(beat) * 0.8, elbowL: 0.8, elbowR: 0.6, legL: Math.sin(beat) * 0.4, legR: -Math.sin(beat) * 0.3, tilt: Math.sin(beat) * 0.12, wear: ["jacket"], tone: "#ff3ac8" }));
    figure(ctx, 118, 92 - Math.abs(Math.cos(beat)) * 2, 1.02, act(1, sp, t, { body: "#4fe8ff", eye: "#1a1030", head: ["cap"], armL: 0.5, armR: 2.6 + Math.cos(beat) * 0.3, elbowR: 0.2, lean: Math.cos(beat) * 0.1, look: -0.6 }));
  },
};

// 20. rom-com film ------------------------------------------------------------------------------------------
const chargingBooth: ShowDef = {
  id: "charging-booth", title: "The Charging Booth", kind: "Film", year: 2025, rating: "B-7", seasons: 1, season: 1, epLen: 101, match: 87,
  tags: ["Romantic Comedy", "Teen", "Sweet"], cast: ["Ellie Volt", "Noah Amp", "Lee"],
  synopsis: "At the school carnival, two robots run a booth that sells five minutes of charge. One rule: never share a charger with your best friend.",
  eps: ["The Charging Booth"],
  tone: "#ff8fb8", thumbT: 2,
  title2: { font: "serif", weight: 700, italic: true, lines: ["The Charging", "Booth"], scale: [0.7, 1], lead: 0.96, fill: ["#ffffff", "#ffd0e2"], glow: "rgba(255,120,180,0.55)" },
  key: { x: 92, y: 50, z: 1 }, hero: { x: 100, y: 50, z: 1.12, ax: 0.62 },
  focus: [[78, 54], [108, 54]],
  lines: [
    { who: 0, text: "One charge per customer. Those are the rules." },
    { who: 1, text: "What if I want to share my charge?" },
    { who: 0, text: "That's not how voltage works." },
    { who: 1, text: "Maybe it's how love works.", r: "laugh" },
    { who: -1, text: "[cheesy acoustic guitar]" },
    { who: 0, text: "I'm literally plugged into you right now.", r: "laugh" },
  ],
  world(ctx, t, sp) {
    fillAll(ctx, lin(ctx, 0, 0, 0, SH, [[0, "#1a2050"], [0.6, "#5a3a7a"], [1, "#ff9ab0"]]));
    // ferris wheel
    ctx.save(); ctx.translate(150, 36);
    ctx.lineWidth = 0.6; ctx.strokeStyle = withAlpha("#ffd0e2", 0.6);
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + t * 0.15; limb(ctx, [[0, 0], [Math.cos(a) * 26, Math.sin(a) * 26]], 0.3, withAlpha("#ffd0e2", 0.4)); circle(ctx, Math.cos(a) * 26, Math.sin(a) * 26, 1.4, ["#ffd23a", "#ff6f91", "#4fe8ff"][i % 3]); }
    ctx.restore();
    limb(ctx, [[150, 36], [140, 72]], 0.8, "#2a2050"); limb(ctx, [[150, 36], [160, 72]], 0.8, "#2a2050");
    // string lights
    for (let i = 0; i < 30; i++) { const x = -20 + i * 7, y = 8 + Math.sin(i * 0.5) * 3; glow(ctx, x, y, 3, "#ffe08a", 0.5); circle(ctx, x, y, 0.7, "#fff0c0"); }
    floor(ctx, 72, "#3a2a4a", "#1a1020");
    // the booth
    fillRR(ctx, 50, 30, 80, 8, 1, "#ff6f91");
    for (let i = 0; i < 8; i++) poly(ctx, [[50 + i * 10, 38], [60 + i * 10, 38], [55 + i * 10, 43]], i & 1 ? "#ffffff" : "#ff6f91");
    ctx.font = `800 4.6px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; canvasLabel(ctx, "CHARGING BOOTH 5c", 90, 34.4);
    fillRR(ctx, 52, 38, 3, 36, 0.4, "#f6e6ee"); fillRR(ctx, 125, 38, 3, 36, 0.4, "#f6e6ee");
    fillRR(ctx, 50, 66, 80, 10, 1, "#f6e6ee");
    // the shared cable
    ctx.beginPath(); ctx.moveTo(80, 62); ctx.quadraticCurveTo(93, 74, 106, 62); ctx.lineWidth = 0.9; ctx.strokeStyle = "#ffd23a"; ctx.stroke();
    heart(ctx, 93, 50 - Math.abs(Math.sin(t * 2)) * 2, 2.4, "#ff6f91");
    figure(ctx, 78, 92, 1, act(0, sp, t, { body: "#ffd0e2", eye: "#3a1a40", visor: "#fff8fb", blush: true, look: 0.6, head: ["bow"] }));
    figure(ctx, 108, 92, 1.04, act(1, sp, t, { body: "#8fc8ff", eye: "#1a2050", visor: "#f2f8ff", blush: true, look: -0.6, wear: ["jacket"], tone: "#2a3a6a" }));
  },
};

export const SHOWS: ShowDef[] = [
  strangeLoops, paperJam, coldStorage, kernelAcademy, unterminated, bakeOff, downtimeAbbey, loveBluetooth, carpetPlanet, captchaGame,
  sprocket, stillBuffering, precinct404, hauntingB, hoverSurvive, dialup, ping, freshInstall, stepFunction, chargingBooth,
];
export const showById = (id: string) => SHOWS.find((s) => s.id === id)!;

/** Hero candidates: the big prestige series. */
export const FEATURED = ["strange-loops", "cold-storage", "kernel-academy", "downtime-abbey", "captcha-game", "unterminated"];

/** Continue Watching: show, episode (1-based) and how far in. */
export const RESUME: { id: string; e: number; p: number }[] = [
  { id: "paper-jam", e: 4, p: 0.63 },
  { id: "kernel-academy", e: 7, p: 0.22 },
  { id: "unterminated", e: 3, p: 0.81 },
  { id: "carpet-planet", e: 2, p: 0.4 },
  { id: "downtime-abbey", e: 1, p: 0.12 },
  { id: "love-bluetooth", e: 5, p: 0.55 },
];
export const ROWS = {
  trending: ["captcha-game", "strange-loops", "love-bluetooth", "bake-off", "haunting-b", "hover-survive", "step-function", "dialup-frontier", "fresh-install"],
  because: { from: "paper-jam", ids: ["precinct-404", "still-buffering", "fresh-install", "love-bluetooth", "charging-booth", "sprocket-pals", "bake-off"] },
  top10: ["strange-loops", "captcha-game", "paper-jam", "cold-storage", "kernel-academy", "love-bluetooth", "unterminated", "bake-off", "downtime-abbey", "carpet-planet"],
  docs: ["carpet-planet", "unterminated", "ping", "hover-survive", "bake-off"],
  comedy: ["paper-jam", "precinct-404", "still-buffering", "love-bluetooth", "fresh-install", "sprocket-pals", "charging-booth"],
};

// ======================================================================================
// episodes
// ======================================================================================
export const COLD_END = 9, INTRO_END = 41, CREDITS = 24, SLOT = 3.9;
export type Phase = "cold" | "intro" | "main" | "credits";

export function phaseAt(pos: number, dur: number): Phase {
  if (pos >= dur - CREDITS) return "credits";
  if (pos < COLD_END) return "cold";
  if (pos < INTRO_END) return "intro";
  return "main";
}

/** Which line is on screen at this point of an episode, and how far into its slot we are. */
export function lineAt(show: ShowDef, ep: number, pos: number, dur: number): { line: Line | null; idx: number; slot: number; k: number } {
  const ph = phaseAt(pos, dur);
  if (ph === "intro" || ph === "credits") return { line: null, idx: -1, slot: -1, k: 0 };
  const base = ph === "cold" ? 0 : INTRO_END;
  const n = Math.floor((pos - base) / SLOT);
  const k = (pos - base - n * SLOT) / SLOT;
  const idx = ((n + (ph === "cold" ? 0 : 2) + ep * 3) % show.lines.length + show.lines.length) % show.lines.length;
  const slot = ph === "cold" ? n : 1000 + n;
  const on = k > 0.05 && k < 0.9;
  return { line: on ? show.lines[idx] : null, idx, slot, k };
}

const CREDIT_ROLES = ["Created by", "Written by", "Directed by", "Produced by", "Music by", "Edited by", "Visual effects", "Catering"];
const CREDIT_NAMES = ["Grep & Sed", "Ada Sprocket", "Unit 734", "The Dial Tones", "Cache Miss", "Kernel Kid", "Lint Roller", "Byte Me", "Servo Sam", "A Very Patient Toaster"];

/** One frame of an episode at pos seconds. Shots cut between a wide view, close-ups on whoever speaks, and B-roll. */
export function drawEpisode(ctx: Ctx, show: ShowDef, ep: number, w: number, h: number, pos: number, dur: number, rm: boolean) {
  pos = safeT(pos);
  const ph = phaseAt(pos, dur);
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (ph === "intro") {
    const p = seg(pos, COLD_END, INTRO_END);
    const z = rm ? 1.3 : lerp(1.7, 1.15, p);
    const f = show.focus[0];
    renderStage(ctx, show, w, h, pos, { x: lerp(f[0], show.key.x, p), y: lerp(f[1], show.key.y, p), z });
    ctx.fillStyle = `rgba(0,0,0,${0.5 - 0.1 * Math.sin(p * Math.PI)})`;
    ctx.fillRect(0, 0, w, h);
    const a = smooth(seg(pos, COLD_END + 0.1, COLD_END + 1.3)) * (1 - smooth(seg(pos, INTRO_END - 3, INTRO_END - 0.5)));
    ctx.globalAlpha = a;
    const size = h * 0.24 * (rm ? 1 : lerp(0.94, 1.04, p));
    const b = titleSize(ctx, show.title2, w * 0.6, size, h * 0.42);
    drawTitle(ctx, show.title2, w / 2, h / 2 - b.h / 2 - h * 0.04, w * 0.6, size, "center", h * 0.42);
    // opening credits under the title
    const ci = Math.floor((pos - COLD_END) / 6) % CREDIT_ROLES.length;
    const ca = Math.sin(seg((pos - COLD_END) % 6, 0.3, 5.7) * Math.PI);
    ctx.globalAlpha = a * ca;
    ctx.font = `400 ${Math.max(9, h * 0.032)}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d8d8de";
    ctx.fillText(`${canvasText(CREDIT_ROLES[ci])} ${CREDIT_NAMES[(ci + show.id.length) % CREDIT_NAMES.length]}`, w / 2, h * 0.8, w * 0.9);
    ctx.restore();
    return;
  }
  if (ph === "credits") {
    // the credits squeeze: the picture shrinks into a corner while names roll on the right
    const p = smooth(seg(pos, dur - CREDITS, dur - CREDITS + 1.2));
    const sw = lerp(w, w * 0.56, p), sh = lerp(h, h * 0.56, p);
    const sx = lerp(0, w * 0.04, p), sy = lerp(0, h * 0.08, p);
    ctx.save();
    ctx.translate(sx, sy);
    renderStage(ctx, show, sw, sh, pos, show.key);
    ctx.restore();
    const lh = Math.max(10, h * 0.042);
    const scroll = (pos - (dur - CREDITS)) * lh * 0.9;
    ctx.save();
    ctx.beginPath(); ctx.rect(w * 0.64, h * 0.06, w * 0.34, h * 0.5); ctx.clip();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const rows: [string, string][] = [["Starring", show.cast[0]], ...show.cast.slice(1).map((c) => ["", c] as [string, string])];
    for (let i = 0; rows.length < 24; i++) rows.push([CREDIT_ROLES[i % CREDIT_ROLES.length], CREDIT_NAMES[(i * 3 + show.id.length) % CREDIT_NAMES.length]]);
    let y = h * 0.5 - scroll;
    for (const [role, name] of rows) {
      if (role) y += lh * 0.9;
      if (y > -lh * 2 && y < h) {
        ctx.font = `400 ${lh * 0.7}px ${SANS}`; ctx.fillStyle = "#8c8c96";
        if (role) ctx.fillText(canvasText(role), w * 0.66, y, w * 0.30);
        ctx.font = `500 ${lh * 0.8}px ${SANS}`; ctx.fillStyle = "#e8e8ee";
        ctx.fillText(name, w * 0.66, y + lh * 0.95);
      }
      y += lh * 1.15;
    }
    ctx.restore();
    ctx.restore();
    return;
  }
  const L = lineAt(show, ep, pos, dur);
  const base = ph === "cold" ? 0 : INTRO_END;
  const n = Math.floor((pos - base) / SLOT);
  const k = clamp((pos - base - n * SLOT) / SLOT);
  const line = show.lines[L.idx];
  const broll = show.broll && n % 5 === 3 ? VIDEOS.find((v) => v.id === show.broll![(n + ep) % show.broll!.length]) : undefined;
  if (broll) {
    ctx.save();
    broll.draw(ctx, w, h, ((pos - base) % broll.loop + broll.loop) % broll.loop);
    ctx.restore();
    // a cinematic grade so the footage sits inside the show
    ctx.fillStyle = rad(ctx, w / 2, h / 2, w * 0.7, [[0.5, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.5)"]]);
    ctx.fillRect(0, 0, w, h);
  } else {
    const wide = line.who < 0 || n % 4 === 0 || line.text.startsWith("[");
    const push = rm ? 0 : k * 0.05;
    let cam: Cam;
    if (wide) cam = { x: show.key.x + (rm ? 0 : Math.sin(n * 1.7) * 6 * (k - 0.5)), y: show.key.y, z: 1.02 + push };
    else {
      const f = show.focus[line.who % show.focus.length];
      cam = { x: f[0], y: f[1], z: (show.cz ?? 2.3) * (1 + push) };
    }
    renderStage(ctx, show, w, h, pos, cam, line.who);
  }
  // hard cut flash on new shots, very short
  if (!rm && k < 0.025) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}

/** The Botflix sting before the first episode: a red eye opens. */
export function drawSting(ctx: Ctx, w: number, h: number, t: number, rm: boolean) {
  t = safeT(t);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const a = smooth(seg(t, 0, 0.3)) * (1 - smooth(seg(t, 1.25, 1.6)));
  const z = rm ? 1 : 0.8 + seg(t, 0, 1.6) * 0.5;
  const r = Math.min(w, h) * 0.13 * z;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(w / 2, h / 2);
  const S = Math.abs(ctx.getTransform().a) || 1;
  ctx.shadowColor = "rgba(255,40,60,0.9)";
  ctx.shadowBlur = r * 0.8 * S;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2 + 0.5, Math.PI * 1.5 - 0.5);
  ctx.lineWidth = r * 0.26;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ff3a44";
  ctx.stroke();
  const open = smooth(seg(t, 0.25, 0.7));
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.34, r * 0.34 * open + 0.01, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd6da";
  ctx.fill();
  ctx.restore();
}
