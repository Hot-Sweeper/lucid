// Drawing kit for the Botcord meme GIFs: flat shapes, soft gradients, no outlines,
// and robots that look like Lucid's own (rounded head, dark visor, glowing eyes,
// antenna with a bulb, cream or white shells). Everything is drawn in a virtual
// 240x180 space; the player scales it to whatever size the canvas has.

export type Ctx = CanvasRenderingContext2D;
export type Pt = { x: number; y: number };
export const VW = 240, VH = 180;
export const TAU = Math.PI * 2;

export type Pal = { shell: string; shade: string; deep: string; glow: string; visor: string; trim: string };
export const CREAM: Pal = { shell: "#f6ecdc", shade: "#e2cfb4", deep: "#b99c7b", glow: "#ffa477", visor: "#1d1410", trim: "#d97757" };
export const WHITE: Pal = { shell: "#f2f4fa", shade: "#c9cee3", deep: "#8f98bd", glow: "#7cf2ff", visor: "#10142c", trim: "#3a3f5a" };
export const tint = (p: Pal, o: Partial<Pal>): Pal => ({ ...p, ...o });

// --- canvas state the scenes share ----------------------------------------------
let family = `"Lexend Variable", Lexend, system-ui, sans-serif`;
let pxk = 1; // device pixels per virtual pixel, for shadow blur (which ignores transforms)
export function setFamily(f: string) { if (f && f.trim()) family = f.trim(); }
export function setPxScale(k: number) { pxk = k; }
export const font = (px: number, w = 700) => `${w} ${px}px ${family}`;

// --- math -----------------------------------------------------------------------
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
// Sine that loops seamlessly over p in [0,1] when n is a whole number.
export const wave = (p: number, n = 1, ph = 0) => Math.sin((p * n + ph) * TAU);
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const io = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const out = (x: number) => 1 - Math.pow(1 - x, 3);
export const back = (x: number, k = 2.2) => 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2);
// 0 -> 1 over [a,b], holds, then 1 -> 0 over [c,d]
export const env = (p: number, a: number, b: number, c: number, d: number, f = io) => (p < c ? f(seg(p, a, b)) : 1 - f(seg(p, c, d)));

// --- shapes ---------------------------------------------------------------------
type Fill = string | CanvasGradient;
export function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: Fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  c.fill();
}
export function dot(c: Ctx, x: number, y: number, r: number, fill: Fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, TAU);
  c.fill();
}
export function oval(c: Ctx, x: number, y: number, rx: number, ry: number, fill: Fill, rot = 0) {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU);
  c.fill();
}
export function poly(c: Ctx, pts: number[], fill: Fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fill();
}
export function line(c: Ctx, pts: number[], w: number, col: string) {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.stroke();
}
export function lin(c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
export function rad(c: Ctx, x: number, y: number, r: number, stops: [number, string][], r0 = 0) {
  const g = c.createRadialGradient(x, y, r0, x, y, Math.max(r0 + 0.01, r));
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
// Soft light: a radial fade from color to transparent.
export function halo(c: Ctx, x: number, y: number, r: number, col: string, a = 1) {
  dot(c, x, y, r, rad(c, x, y, r, [[0, rgba(col, a)], [1, rgba(col, 0)]]));
}
export function sky(c: Ctx, top: string, bottom: string, x = 0, y = 0, w = VW, h = VH) {
  rr(c, x, y, w, h, 0, lin(c, 0, y, 0, y + h, [[0, top], [1, bottom]]));
}
export function vignette(c: Ctx, a = 0.28, x = 0, y = 0, w = VW, h = VH) {
  const cx = x + w / 2, cy = y + h / 2;
  const g = c.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, "rgba(10,8,30,0)");
  g.addColorStop(1, `rgba(10,8,30,${a})`);
  rr(c, x, y, w, h, 0, g);
}

export function rgba(col: string, a: number) {
  if (col.startsWith("rgb")) {
    const n = col.match(/[\d.]+/g)!.map(Number);
    return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
  }
  const v = parseInt(col.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
}
export function shade(col: string, k: number) {
  const v = parseInt(col.slice(1), 16);
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x + (k < 0 ? x * k : (255 - x) * k))));
  const h = (x: number) => f(x).toString(16).padStart(2, "0");
  return `#${h(v >> 16)}${h((v >> 8) & 255)}${h(v & 255)}`;
}

export function glowOn(c: Ctx, col: string, blur: number) { c.shadowColor = col; c.shadowBlur = blur * pxk; c.shadowOffsetX = 0; c.shadowOffsetY = 0; }
export function glowOff(c: Ctx) { c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0; }

// --- text -----------------------------------------------------------------------
function wrap(c: Ctx, s: string, maxW: number) {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let cur = "";
    for (const w of para.split(" ")) {
      const t = cur ? cur + " " + w : w;
      if (cur && c.measureText(t).width > maxW) { out.push(cur); cur = w; } else cur = t;
    }
    out.push(cur);
  }
  return out;
}

type CapOpts = { align?: CanvasTextAlign; maxW?: number; from?: "top" | "bottom" | "middle"; color?: string; shadow?: boolean; weight?: number; lh?: number };
// Bold rounded meme caption: white, soft dark shadow, no stroke.
export function caption(c: Ctx, s: string, x: number, y: number, px: number, o: CapOpts = {}) {
  c.save();
  c.font = font(px, o.weight ?? 700);
  c.textAlign = o.align ?? "center";
  c.textBaseline = "alphabetic";
  const lines = wrap(c, s, o.maxW ?? 220);
  const lh = px * (o.lh ?? 1.08);
  const asc = px * 0.74;
  const total = lh * (lines.length - 1) + asc;
  let top = o.from === "bottom" ? y - total : o.from === "middle" ? y - total / 2 : y;
  if (o.shadow !== false) {
    c.shadowColor = "rgba(10,8,28,0.62)";
    c.shadowBlur = px * 0.42 * pxk;
    c.shadowOffsetY = px * 0.08 * pxk;
  }
  c.fillStyle = o.color ?? "#ffffff";
  const passes = o.shadow === false ? 1 : 2;
  for (let k = 0; k < passes; k++) lines.forEach((l, i) => c.fillText(l, x, top + asc + i * lh));
  c.restore();
  return top + total;
}

// --- robot ----------------------------------------------------------------------
export type Eyes = "pill" | "dot" | "happy" | "wide" | "smug" | "angry" | "squeeze" | "flat" | "sad" | "star";
export type Mouth = "none" | "o" | "smile" | "open" | "flat" | "grin" | "wavy" | "yell";
export type Face = {
  eyes?: Eyes; right?: Eyes;      // right overrides the right eye (viewer's right)
  lx?: number; ly?: number;       // look direction, -1..1
  blink?: number;                 // 0 open .. 1 closed
  open?: number;                  // eye size multiplier
  rOpen?: number; rDy?: number;   // right eye only: size and vertical jitter
  mouth?: Mouth; mo?: number;     // mouth and its openness
  turn?: number;                  // -1 looking to viewer's left .. 1 to the right
  blush?: number;
  bulb?: number;                  // antenna glow 0..1
  noAntenna?: boolean;
};

export function head(c: Ctx, x: number, y: number, s: number, pal: Pal, f: Face = {}, tilt = 0) {
  const hh = s * 0.86, turn = f.turn ?? 0, at = Math.abs(turn);
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  // antenna
  if (!f.noAntenna) {
    const ax = turn * s * 0.1, top = -hh / 2 - s * 0.27;
    rr(c, ax - s * 0.032, top, s * 0.064, s * 0.32, s * 0.032, pal.deep);
    const b = f.bulb ?? 1;
    halo(c, ax, top, s * 0.24, pal.glow, 0.55 * b);
    dot(c, ax, top, s * 0.078, b > 0.05 ? pal.glow : shade(pal.deep, -0.2));
    dot(c, ax - s * 0.025, top - s * 0.025, s * 0.026, "rgba(255,255,255,0.85)");
  }
  // ears, behind the shell; the far one tucks away as the head turns
  for (const side of [-1, 1]) {
    const far = side * turn > 0;
    const ex = side * s * (0.5 - (far ? at * 0.22 : -at * 0.02));
    dot(c, ex, s * 0.05, s * 0.15, pal.deep);
    dot(c, ex + side * s * 0.015, s * 0.05, s * 0.105, pal.shade);
  }
  // shell
  rr(c, -s / 2, -hh / 2, s, hh, s * 0.36, lin(c, 0, -hh / 2, 0, hh / 2, [[0, pal.shell], [0.62, pal.shell], [1, pal.shade]]));
  rr(c, -s * 0.3 + turn * s * 0.08, -hh / 2 + s * 0.055, s * 0.36, s * 0.05, s * 0.025, "rgba(255,255,255,0.7)");
  // visor
  const vx = turn * s * 0.17, vy = s * 0.05, vw = s * 0.78 * (1 - at * 0.22), vh = s * 0.5;
  rr(c, vx - vw / 2, vy - vh / 2, vw, vh, s * 0.22, pal.visor);
  rr(c, vx - vw / 2 + s * 0.06, vy - vh / 2 + s * 0.04, vw - s * 0.12, s * 0.06, s * 0.03, "rgba(255,255,255,0.07)");
  // eyes
  const spread = s * 0.165 * (1 - at * 0.25);
  const lx = (f.lx ?? 0) * s * 0.075, ly = (f.ly ?? 0) * s * 0.055;
  c.save();
  glowOn(c, pal.glow, s * 0.14);
  for (const side of [-1, 1]) {
    const kind = side > 0 && f.right ? f.right : f.eyes ?? "pill";
    const k = side > 0 && f.rOpen !== undefined ? f.rOpen : f.open ?? 1;
    eye(c, kind, vx + side * spread + lx, vy - s * 0.01 + ly + (side > 0 ? f.rDy ?? 0 : 0), s, side, k, f.blink ?? 0, pal.glow);
  }
  if (f.mouth && f.mouth !== "none") mouth(c, f.mouth, vx + lx * 0.5, vy + s * 0.15 + ly * 0.5, s, f.mo ?? 1, pal.glow);
  c.restore();
  if (f.blush) {
    for (const side of [-1, 1]) oval(c, vx + side * spread * 1.25, vy + s * 0.2, s * 0.08, s * 0.035, rgba("#ff7aa8", 0.75 * f.blush));
  }
  c.restore();
}

function eye(c: Ctx, kind: Eyes, x: number, y: number, s: number, side: number, k: number, blink: number, col: string) {
  c.fillStyle = col;
  c.strokeStyle = col;
  c.lineCap = "round";
  c.lineJoin = "round";
  const sq = 1 - blink * 0.9;
  switch (kind) {
    case "pill": { const w = s * 0.1 * k, h = s * 0.2 * k * sq; rr(c, x - w / 2, y - h / 2, w, h, w / 2, col); break; }
    case "dot": oval(c, x, y, s * 0.066 * k, s * 0.066 * k * sq, col); break;
    case "wide": {
      const r = s * 0.12 * k;
      oval(c, x, y, r, r * sq, col);
      oval(c, x, y, r * 0.42, r * 0.42 * sq, "rgba(20,16,40,0.85)");
      dot(c, x - r * 0.35, y - r * 0.38, r * 0.2, "rgba(255,255,255,0.95)");
      break;
    }
    case "happy":
      c.lineWidth = s * 0.055 * k;
      c.beginPath();
      c.moveTo(x - s * 0.072 * k, y + s * 0.03);
      c.quadraticCurveTo(x, y - s * 0.085 * k, x + s * 0.072 * k, y + s * 0.03);
      c.stroke();
      break;
    case "smug": {
      const r = s * 0.075 * k;
      c.beginPath();
      c.moveTo(x - r, y - side * s * 0.012);
      c.lineTo(x + r, y + side * s * 0.012);
      c.arc(x, y, r, 0, Math.PI);
      c.closePath();
      c.fill();
      break;
    }
    case "angry": {
      const w = s * 0.085 * k, h = s * 0.15 * k * sq, d = s * 0.06;
      // inner edge (toward the face center) sits lower
      const ix = x - side * w, ox = x + side * w;
      c.beginPath();
      c.moveTo(ox, y - h / 2);
      c.lineTo(ix, y - h / 2 + d);
      c.lineTo(ix, y + h / 2 - s * 0.02);
      c.quadraticCurveTo(x, y + h / 2 + s * 0.02, ox, y + h / 2 - s * 0.02);
      c.closePath();
      c.fill();
      break;
    }
    case "sad": {
      const w = s * 0.08 * k, h = s * 0.15 * k * sq, d = s * 0.05;
      const ix = x - side * w, ox = x + side * w;
      c.beginPath();
      c.moveTo(ix, y - h / 2);
      c.lineTo(ox, y - h / 2 + d);
      c.lineTo(ox, y + h / 2);
      c.lineTo(ix, y + h / 2);
      c.closePath();
      c.fill();
      break;
    }
    case "squeeze": {
      c.lineWidth = s * 0.05;
      const w = s * 0.06, h = s * 0.06;
      c.beginPath();
      c.moveTo(x + side * w, y - h);
      c.lineTo(x - side * w, y);
      c.lineTo(x + side * w, y + h);
      c.stroke();
      break;
    }
    case "flat": rr(c, x - s * 0.07, y - s * 0.02, s * 0.14, s * 0.04, s * 0.02, col); break;
    case "star": {
      const r = s * 0.1 * k;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2, rr2 = i % 2 ? r * 0.42 : r;
        c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
      }
      c.closePath();
      c.fill();
      break;
    }
  }
}

function mouth(c: Ctx, kind: Mouth, x: number, y: number, s: number, k: number, col: string) {
  c.fillStyle = col;
  c.strokeStyle = col;
  c.lineWidth = s * 0.035;
  switch (kind) {
    case "o": oval(c, x, y, s * 0.04 * k, s * 0.05 * k, col); break;
    case "open": rr(c, x - s * 0.09, y - s * 0.045 * k, s * 0.18, s * 0.09 * k + s * 0.01, s * 0.04, col); break;
    case "yell": {
      const h = s * (0.05 + 0.075 * k), w = s * 0.24;
      rr(c, x - w / 2, y - h * 0.2, w, h, Math.min(h, w) * 0.45, col);
      rr(c, x - w * 0.3, y + h * 0.45, w * 0.6, h * 0.22, h * 0.11, "rgba(20,10,30,0.45)");
      break;
    }
    case "smile":
      c.beginPath();
      c.moveTo(x - s * 0.08, y - s * 0.015);
      c.quadraticCurveTo(x, y + s * 0.05 * k, x + s * 0.08, y - s * 0.015);
      c.stroke();
      break;
    case "grin":
      c.beginPath();
      c.moveTo(x - s * 0.09, y - s * 0.025);
      c.lineTo(x + s * 0.09, y - s * 0.025);
      c.quadraticCurveTo(x, y + s * 0.08 * k, x - s * 0.09, y - s * 0.025);
      c.fill();
      break;
    case "flat": rr(c, x - s * 0.06, y - s * 0.012, s * 0.12, s * 0.024, s * 0.012, col); break;
    case "wavy":
      c.beginPath();
      for (let i = 0; i <= 6; i++) c.lineTo(x - s * 0.09 + i * s * 0.03, y + (i % 2 ? -1 : 1) * s * 0.014);
      c.stroke();
      break;
  }
}

// Two-bone limb from a to b, elbow on the bend side. Returns the joint and the clamped end.
export function ik(a: Pt, b: Pt, l1: number, l2: number, bend: number) {
  let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (d > max) { b = { x: a.x + (dx / d) * max, y: a.y + (dy / d) * max }; dx = b.x - a.x; dy = b.y - a.y; d = max; }
  d = Math.max(d, Math.abs(l1 - l2) + 0.01);
  const th = Math.atan2(dy, dx);
  const ang = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  return { e: { x: a.x + l1 * Math.cos(th + bend * ang), y: a.y + l1 * Math.sin(th + bend * ang) }, b };
}

export function limb(c: Ctx, a: Pt, b: Pt, l1: number, l2: number, bend: number, w: number, col: string, hi?: string) {
  const r = ik(a, b, l1, l2, bend);
  line(c, [a.x, a.y, r.e.x, r.e.y, r.b.x, r.b.y], w, col);
  if (hi) {
    c.save();
    c.translate(-w * 0.13, -w * 0.16);
    line(c, [a.x, a.y, r.e.x, r.e.y, r.b.x, r.b.y], w * 0.42, hi);
    c.restore();
  }
  return { e: r.e, b: r.b, ang: Math.atan2(r.b.y - r.e.y, r.b.x - r.e.x) };
}

export type Hand = "ball" | "point" | "palm" | "thumb" | "fist" | "open";
export function hand(c: Ctx, x: number, y: number, ang: number, r: number, pal: Pal, kind: Hand = "ball") {
  c.save();
  c.translate(x, y);
  switch (kind) {
    case "ball":
      dot(c, 0, 0, r, pal.shade);
      dot(c, -r * 0.2, -r * 0.25, r * 0.66, pal.shell);
      break;
    case "point":
      c.rotate(ang);
      rr(c, 0, -r * 0.62, r * 2.1, r * 0.6, r * 0.3, pal.shell);
      rr(c, -r * 0.95, -r * 0.95, r * 1.8, r * 1.8, r * 0.7, pal.shade);
      rr(c, -r * 0.8, -r * 0.95, r * 1.3, r * 1.1, r * 0.55, pal.shell);
      break;
    case "palm":
      c.rotate(ang);
      rr(c, -r * 0.6, -r * 1.05, r * 1.9, r * 2.1, r * 0.75, pal.shade);
      rr(c, -r * 0.5, -r * 0.95, r * 1.45, r * 1.6, r * 0.6, pal.shell);
      rr(c, r * 0.1, -r * 1.55, r * 0.55, r * 0.9, r * 0.27, pal.shell);
      break;
    case "open":
      c.rotate(ang);
      rr(c, -r * 0.7, -r * 0.8, r * 2.2, r * 1.5, r * 0.7, pal.shade);
      rr(c, -r * 0.55, -r * 0.8, r * 1.9, r * 1.1, r * 0.55, pal.shell);
      break;
    case "thumb":
      rr(c, -r * 0.42, -r * 2.0, r * 0.8, r * 1.5, r * 0.4, pal.shell);
      rr(c, -r, -r * 0.85, r * 2, r * 1.75, r * 0.7, pal.shade);
      rr(c, -r * 0.85, -r * 0.85, r * 1.5, r * 1.2, r * 0.55, pal.shell);
      break;
    case "fist":
      // upright, knuckles on top, thumb across the front (ang is ignored)
      rr(c, -r, -r * 0.85, r * 2, r * 1.85, r * 0.6, pal.shade);
      for (let i = 0; i < 4; i++) dot(c, -r * 0.66 + i * r * 0.44, -r * 0.62, r * 0.3, pal.shell);
      rr(c, -r * 0.92, -r * 0.08, r * 1.45, r * 0.56, r * 0.28, pal.shell);
      break;
  }
  c.restore();
}

// Upper body seen from the front: neck at (x,y), w shoulder width, h height.
export function torso(c: Ctx, x: number, y: number, w: number, h: number, pal: Pal, body?: Fill) {
  rr(c, x - w * 0.14, y - w * 0.06, w * 0.28, w * 0.2, w * 0.08, pal.deep);
  const top = y + w * 0.06;
  c.fillStyle = body ?? lin(c, 0, top, 0, top + h, [[0, pal.shell], [0.7, pal.shell], [1, pal.shade]]);
  c.beginPath();
  c.moveTo(x - w * 0.42, top + w * 0.05);
  c.quadraticCurveTo(x - w * 0.42, top, x - w * 0.3, top);
  c.lineTo(x + w * 0.3, top);
  c.quadraticCurveTo(x + w * 0.42, top, x + w * 0.42, top + w * 0.05);
  c.lineTo(x + w * 0.36, top + h);
  c.lineTo(x - w * 0.36, top + h);
  c.closePath();
  c.fill();
  if (!body) for (let i = 0; i < 3; i++) rr(c, x - w * 0.17, top + h * 0.34 + i * w * 0.075, w * 0.34, w * 0.04, w * 0.02, pal.shade);
}
export function shoulder(c: Ctx, x: number, y: number, r: number, pal: Pal) {
  dot(c, x, y, r, pal.shade);
  dot(c, x - r * 0.1, y - r * 0.12, r * 0.74, pal.shell);
}

// A mug, held or on a table. (x,y) is the bottom center.
export function mug(c: Ctx, x: number, y: number, s: number, col = "#f6ecdc", steamP = -1) {
  rr(c, x + s * 0.32, y - s * 0.85, s * 0.42, s * 0.5, s * 0.2, shade(col, -0.18));
  rr(c, x + s * 0.4, y - s * 0.75, s * 0.2, s * 0.3, s * 0.1, "rgba(0,0,0,0)");
  rr(c, x - s * 0.45, y - s, s * 0.9, s, s * 0.18, lin(c, x - s * 0.45, 0, x + s * 0.45, 0, [[0, col], [1, shade(col, -0.12)]]));
  rr(c, x - s * 0.38, y - s * 0.96, s * 0.76, s * 0.12, s * 0.06, "#5a3424");
  if (steamP >= 0) {
    for (let i = 0; i < 2; i++) {
      const q = (steamP * 2 + i * 0.5) % 1;
      oval(c, x - s * 0.15 + i * s * 0.3 + Math.sin(q * TAU) * s * 0.08, y - s * 1.15 - q * s * 0.9, s * 0.09, s * 0.16, `rgba(255,255,255,${0.35 * Math.sin(q * Math.PI)})`);
    }
  }
}

// Teardrop flame with a lighter core, flickering with f in [0,1).
export function flame(c: Ctx, x: number, y: number, w: number, h: number, f: number, seed = 0) {
  const k = 1 + 0.12 * wave(f, 3, seed) + 0.06 * wave(f, 5, seed * 2);
  const sway = wave(f, 2, seed * 1.7) * w * 0.18;
  const drop = (ww: number, hh: number, col: Fill) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x - ww / 2, y);
    c.bezierCurveTo(x - ww / 2, y - hh * 0.55, x + sway * 0.4, y - hh * 0.6, x + sway, y - hh);
    c.bezierCurveTo(x + ww * 0.25, y - hh * 0.55, x + ww / 2, y - hh * 0.4, x + ww / 2, y);
    c.quadraticCurveTo(x, y + ww * 0.18, x - ww / 2, y);
    c.fill();
  };
  drop(w, h * k, "#ff6a3d");
  drop(w * 0.72, h * k * 0.74, "#ff9f5a");
  drop(w * 0.42, h * k * 0.46, "#ffe08a");
}

export function sweat(c: Ctx, x: number, y: number, r: number, col = "#7fd0ff") {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - r * 1.8);
  c.quadraticCurveTo(x + r * 1.1, y - r * 0.2, x, y + r);
  c.quadraticCurveTo(x - r * 1.1, y - r * 0.2, x, y - r * 1.8);
  c.fill();
  dot(c, x - r * 0.3, y - r * 0.1, r * 0.25, "rgba(255,255,255,0.7)");
}

export function sparkle(c: Ctx, x: number, y: number, r: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

export function check(c: Ctx, x: number, y: number, s: number, col: string) {
  line(c, [x - s * 0.45, y, x - s * 0.12, y + s * 0.32, x + s * 0.5, y - s * 0.35], s * 0.22, col);
}
