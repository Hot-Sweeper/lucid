import { canvasText, canvasLines } from "../localization-canvas";
// Shared flat vector drawing helpers for games and videos. No strokes around shapes:
// lines are only used for limbs, cables and light streaks.

export type Ctx = CanvasRenderingContext2D;

export const C = {
  night: "#141a33",
  night2: "#1b2246",
  night3: "#252d5c",
  deep: "#0e1233",
  orange: "#ff9f5a",
  orange2: "#ff8f5a",
  mint: "#4ff0a0",
  sky: "#4fb6ff",
  pink: "#ff6f91",
  lilac: "#b07cff",
  cream: "#f6ecdc",
  ink: "#eef0ff",
};

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)));
}

export function fillRR(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function circle(ctx: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function rad(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][], r0 = 0) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(1, r));
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 0.5) {
  circle(ctx, x, y, r, rad(ctx, x, y, r, [[0, withAlpha(color, alpha)], [1, withAlpha(color, 0)]]));
}

export function limb(ctx: Ctx, pts: [number, number][], width: number, color: string | CanvasGradient) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
}

export function poly(ctx: Ctx, pts: [number, number][], fill: string | CanvasGradient) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

const hexCache = new Map<string, [number, number, number]>();
export function rgb(hex: string): [number, number, number] {
  let v = hexCache.get(hex);
  if (!v) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(hex, v);
  }
  return v;
}
export function withAlpha(hex: string, a: number) {
  if (!hex.startsWith("#")) return hex;
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** Blend two hex colors. Returns hex so the result can be faded with withAlpha. */
export function mix(a: string, b: string, t: number) {
  const A = rgb(a), B = rgb(b);
  const c = A.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (B[i] - v) * t))));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function shade(hex: string, amt: number) {
  return amt >= 0 ? mix(hex, "#ffffff", amt) : mix(hex, "#0b0e26", -amt);
}

export function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.28) {
  ellipse(ctx, x, y, rx, ry, 0, `rgba(5,7,25,${a})`);
}

/** Scene frame: a square "core" of 100 units centered in any aspect ratio. */
export function core(w: number, h: number, cy = 0.5) {
  const s = Math.min(w, h) / 100;
  return { s, cx: w / 2, cy: h * cy, X: (u: number) => w / 2 + u * s, Y: (u: number) => h * cy + u * s };
}

/** Darken the frame near the loop seam so loops do not visibly jump. */
export function loopFade(ctx: Ctx, w: number, h: number, t: number, L: number, edge = 0.35) {
  const p = ((t % L) + L) % L;
  const a = Math.max(0, 1 - p / edge, 1 - (L - p) / edge);
  if (a <= 0) return;
  ctx.fillStyle = `rgba(14,18,51,${Math.min(1, a)})`;
  ctx.fillRect(0, 0, w, h);
}

export function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, opts: { weight?: number; align?: CanvasTextAlign; mono?: boolean; base?: CanvasTextBaseline; maxW?: number } = {}) {
  ctx.font = `${opts.weight ?? 500} ${size}px ${opts.mono ? '"JetBrains Mono Variable", ui-monospace, monospace' : '"Lexend Variable", system-ui, sans-serif'}`;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = opts.base ?? "middle";
  ctx.fillStyle = color;
  const shown = canvasText(s);
  const maxW = opts.maxW ?? (shown !== s ? Math.max(1, ctx.measureText(s).width) : undefined);
  if (maxW !== undefined) ctx.fillText(shown, x, y, maxW);
  else ctx.fillText(shown, x, y);
}

export function wrap(ctx: Ctx, s: string, maxW: number): string[] {
  return canvasLines(ctx, canvasText(s), maxW);
}

// --- robot ------------------------------------------------------------------
export interface Bot {
  body?: string;
  visor?: string;
  eye?: string;
  armL?: number; armR?: number; // radians from straight down, positive = outward
  elbowL?: number; elbowR?: number;
  legL?: number; legR?: number; // radians, positive = forward (to +x)
  kneeL?: number; kneeR?: number;
  tilt?: number; // head tilt
  lean?: number; // upper body lean around the hips
  eyes?: "open" | "happy" | "closed" | "wide" | "angry" | "dizzy";
  look?: number; // -1..1 horizontal eye offset
  squash?: number; // 1 = normal
  antenna?: boolean;
  blush?: boolean;
  wheel?: boolean; // wheel instead of legs
}

/** A small rounded robot, about 42 units tall, feet at (x, y). */
export function drawBot(ctx: Ctx, x: number, y: number, s: number, p: Bot = {}) {
  const body = p.body ?? C.orange;
  const dark = shade(body, -0.35);
  const lite = shade(body, 0.28);
  const visor = p.visor ?? "#141a33";
  const eye = p.eye ?? C.mint;
  const sq = p.squash ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s * sq);
  shadow(ctx, 0, 0.5, 13, 2.6, 0.25);

  const hipY = -12;
  const leg = (side: number, a: number, knee: number) => {
    const hx = side * 4.6;
    const kx = hx + Math.sin(a) * 6.2, ky = hipY + Math.cos(a) * 6.2;
    const fx = kx + Math.sin(a - knee) * 6, fy = ky + Math.cos(a - knee) * 6;
    limb(ctx, [[hx, hipY], [kx, ky], [fx, fy]], 3.8, dark);
    fillRR(ctx, fx - 3.2, fy - 1.2, 6.4, 2.8, 1.4, shade(body, -0.45));
  };
  if (p.wheel) {
    circle(ctx, 0, -5, 5.5, shade(body, -0.5));
    circle(ctx, 0, -5, 2.4, lite);
    limb(ctx, [[0, hipY], [0, -6]], 4, dark);
  } else {
    leg(-1, p.legL ?? 0, p.kneeL ?? 0);
    leg(1, p.legR ?? 0, p.kneeR ?? 0);
  }

  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(p.lean ?? 0);
  ctx.translate(0, -hipY);

  const arm = (side: number, a: number, elbow: number) => {
    const sx = side * 9, sy = -23.5;
    const ex = sx + side * Math.sin(a) * 7, ey = sy + Math.cos(a) * 7;
    const b = a + elbow;
    const hx = ex + side * Math.sin(b) * 6.6, hy = ey + Math.cos(b) * 6.6;
    limb(ctx, [[sx, sy], [ex, ey], [hx, hy]], 3.6, dark);
    circle(ctx, hx, hy, 2.5, lite);
  };
  arm(-1, p.armL ?? 0.25, p.elbowL ?? 0.2);
  arm(1, p.armR ?? 0.25, p.elbowR ?? 0.2);

  // torso
  fillRR(ctx, -10, -27, 20, 16, 5.5, lin(ctx, -10, -27, 10, -11, [[0, lite], [1, body]]));
  fillRR(ctx, -6, -22.5, 12, 6.5, 2.4, withAlpha("#0b0e26", 0.22));
  circle(ctx, -2.6, -19.3, 1.2, withAlpha(eye, 0.85));
  circle(ctx, 1.4, -19.3, 1.2, withAlpha(C.cream, 0.6));

  // head
  ctx.save();
  ctx.translate(0, -27.5);
  ctx.rotate(p.tilt ?? 0);
  if (p.antenna !== false) {
    limb(ctx, [[3, -13], [5, -17.5]], 1.4, dark);
    circle(ctx, 5.2, -18, 1.9, C.pink);
  }
  fillRR(ctx, -11.5, -14, 23, 14.5, 6, lin(ctx, -11, -14, 11, 0, [[0, lite], [1, body]]));
  fillRR(ctx, -8.8, -11.2, 17.6, 8.8, 4, visor);
  const lk = (p.look ?? 0) * 1.6;
  const ey = -6.8;
  const eyes = p.eyes ?? "open";
  for (const sx of [-3.7, 3.7]) {
    const ex = sx + lk;
    if (eyes === "open" || eyes === "wide") {
      const r = eyes === "wide" ? 2.3 : 1.85;
      glow(ctx, ex, ey, r * 2.4, eye, 0.35);
      circle(ctx, ex, ey, r, eye);
    } else if (eyes === "happy") {
      ctx.beginPath();
      ctx.arc(ex, ey + 0.9, 1.8, Math.PI * 1.1, Math.PI * 1.9);
      ctx.lineWidth = 1.3; ctx.lineCap = "round"; ctx.strokeStyle = eye; ctx.stroke();
    } else if (eyes === "closed") {
      limb(ctx, [[ex - 1.7, ey], [ex + 1.7, ey]], 1.2, eye);
    } else if (eyes === "angry") {
      circle(ctx, ex, ey + 0.4, 1.6, C.pink);
      limb(ctx, [[ex - 2.2 * Math.sign(sx), ey - 2.6], [ex + 1.8 * Math.sign(sx), ey - 1.4]], 1.1, C.pink);
    } else {
      limb(ctx, [[ex - 1.4, ey - 1.4], [ex + 1.4, ey + 1.4]], 1.1, eye);
      limb(ctx, [[ex - 1.4, ey + 1.4], [ex + 1.4, ey - 1.4]], 1.1, eye);
    }
  }
  if (p.blush) {
    ellipse(ctx, -7.5, -2.2, 2, 1.1, 0, withAlpha(C.pink, 0.75));
    ellipse(ctx, 7.5, -2.2, 2, 1.1, 0, withAlpha(C.pink, 0.75));
  }
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

// --- hardware -------------------------------------------------------------
/** Fan seen from the front: hub plus rotating blades. */
export function drawFan(ctx: Ctx, x: number, y: number, r: number, angle: number, color = "#3a4380", blade = "#56609f") {
  circle(ctx, x, y, r, color);
  circle(ctx, x, y, r * 0.92, shade(color, -0.3));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  for (let i = 0; i < 7; i++) {
    ctx.rotate((Math.PI * 2) / 7);
    ellipse(ctx, r * 0.47, r * 0.12, r * 0.43, r * 0.17, 0.5, blade);
  }
  ctx.restore();
  circle(ctx, x, y, r * 0.26, shade(color, 0.15));
  circle(ctx, x - r * 0.06, y - r * 0.06, r * 0.1, withAlpha("#ffffff", 0.25));
}

/** A graphics card, w wide, centered at (x, y). */
export function drawGPU(ctx: Ctx, x: number, y: number, w: number, t: number, o: { fans?: number; shroud?: string; rgb?: boolean; glowHot?: number } = {}) {
  const h = w * 0.36;
  const fans = o.fans ?? 3;
  const shroud = o.shroud ?? "#2b3270";
  const x0 = x - w / 2, y0 = y - h / 2;
  for (let i = 0; i < 14; i++) fillRR(ctx, x0 + w * 0.2 + i * w * 0.028, y0 + h * 0.96, w * 0.018, h * 0.1, 1, "#ffc987");
  fillRR(ctx, x0 - w * 0.035, y0 - h * 0.05, w * 0.05, h * 1.08, w * 0.012, "#8b93c9");
  fillRR(ctx, x0, y0, w, h, h * 0.16, lin(ctx, x0, y0, x0, y0 + h, [[0, shade(shroud, 0.22)], [1, shade(shroud, -0.25)]]));
  if (o.glowHot) fillRR(ctx, x0, y0, w, h, h * 0.16, withAlpha(C.orange2, 0.45 * o.glowHot));
  if (o.rgb !== false) {
    fillRR(ctx, x0 + w * 0.05, y0 + h * 0.06, w * 0.9, h * 0.06, h * 0.03,
      lin(ctx, x0, 0, x0 + w, 0, [[0, C.mint], [(Math.sin(t * 2) + 1) / 4 + 0.25, C.sky], [1, C.lilac]]));
  }
  const fr = Math.min(h * 0.38, (w * 0.86) / fans / 2.15);
  for (let i = 0; i < fans; i++) {
    const fx = x0 + w * 0.07 + fr + i * ((w * 0.86 - fr * 2) / Math.max(1, fans - 1));
    drawFan(ctx, fx, y0 + h * 0.56, fr, t * (9 + i * 0.7) + i, "#20265b", "#4b5598");
  }
}
