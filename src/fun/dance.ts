// Robot dance trends for the phone feed. Cute cartoon dancers in a practice-room vibe,
// choreographed with keyframed poses on a beat grid. Wholesome only: no suggestive poses or framing.
import { C, type Ctx, circle, ellipse, fillRR, glow, lin, limb, poly, rad, shade, text, withAlpha, wrap } from "./draw";
import type { VideoDef } from "./videos";
import { backOut, clamp, easeInOut, easeOut, hash, lerp, seg, smooth } from "./util";

const BPS = 2; // 120 bpm
/** The clock can read negative or NaN for a frame; never let that reach the drawing. */
const safe = (t: number) => (Number.isFinite(t) ? Math.max(0, t) : 0);
let mq: MediaQueryList | null | undefined;
/** prefers-reduced-motion: dancers keep dancing, but with less bounce, no flashing lights and no camera pulse. */
export const calm = () => {
  if (mq === undefined) mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  return !!mq?.matches;
};

// --- poses ---------------------------------------------------------------------------
export type Eyes = "sparkle" | "happy" | "closed" | "wide" | "dizzy" | "wink" | "dot";
export type Mouth = "smile" | "open" | "o" | "flat" | "none";
const NUM = { hx: 0, hy: 0, lean: 0, tilt: 0, aL: 0.22, eL: 0.2, aR: 0.22, eR: 0.2, fL: 0, fR: 0, uL: 0, uR: 0, sq: 0, turn: 0, spin: 0, fall: 0 };
type NumKey = keyof typeof NUM;
const KEYS = Object.keys(NUM) as NumKey[];
/**
 * hx/hy: hip sway and height (+ is up, high enough and the feet leave the floor).
 * aL/aR: shoulder angle from straight down, + is outward. eL/eR: elbow bend. fL/fR: foot x offset. uL/uR: foot lift.
 * sq: squash (+) or stretch (-). spin: turns, always forward. fall: tip over around the feet.
 */
export type Pose = Partial<Record<NumKey, number>> & { eyes?: Eyes; mouth?: Mouth };
export type Full = Record<NumKey, number> & { eyes: Eyes; mouth: Mouth };
type Ease = "snap" | "pop" | "smooth" | "lin";
export type Key = [number, Pose, Ease?];

const EASE: Record<Ease, (u: number) => number> = {
  snap: (u) => (u < 0.4 ? easeOut(u / 0.4) : 1),
  pop: (u) => backOut(clamp(u / 0.6), 2.2),
  smooth: easeInOut,
  lin: clamp,
};
const full = (p: Pose): Full => ({ ...NUM, eyes: "sparkle", mouth: "smile", ...p });

/** Keyframes on a beat grid (beat, pose, ease into it). The last key flows back into the first. */
export function chor(keys: Key[], len: number) {
  const ks = keys.map(([b, p, e]) => ({ b, p: full(p), e: e ?? "snap" })).sort((a, b) => a.b - b.b);
  return (beat: number): Full => {
    const x = ((beat % len) + len) % len;
    let i = ks.length - 1;
    for (let k = 0; k < ks.length; k++) if (ks[k].b <= x) i = k;
    const a = ks[i], b = ks[(i + 1) % ks.length];
    let span = b.b - a.b; if (span <= 0) span += len;
    let d = x - a.b; if (d < 0) d += len;
    const u = EASE[b.e](clamp(d / span));
    const o = {} as Full;
    for (const k of KEYS) o[k] = a.p[k] + (b.p[k] - a.p[k]) * u;
    let ds = b.p.spin - a.p.spin;
    if (ds < 0) ds += Math.ceil(-ds);
    o.spin = a.p.spin + ds * u;
    o.eyes = u > 0.45 ? b.p.eyes : a.p.eyes;
    o.mouth = u > 0.45 ? b.p.mouth : a.p.mouth;
    return o;
  };
}

export function mirrorPose(p: Full): Full {
  return { ...p, hx: -p.hx, lean: -p.lean, tilt: -p.tilt, turn: -p.turn, fall: -p.fall, aL: p.aR, eL: p.eR, aR: p.aL, eR: p.eL, fL: -p.fR, fR: -p.fL, uL: p.uR, uR: p.uL };
}

// Arm shapes (right arm values, the left mirrors them)
const A = {
  clap: { aL: -0.2, eL: -1.4, aR: -0.2, eR: -1.4 },
  chest: { aL: -0.35, eL: -1.45, aR: -0.35, eR: -1.45 },
  up: { aL: 2.6, eL: 0.35, aR: 2.6, eR: 0.35 },
  v: { aL: 2.25, eL: 0.1, aR: 2.25, eR: 0.1 },
  out: { aL: 1.57, eL: 0, aR: 1.57, eR: 0 },
  hips: { aL: 0.9, eL: -1.6, aR: 0.9, eR: -1.6 },
  low: { aL: 0.75, eL: 0, aR: 0.75, eR: 0 },
};
const R = { hip: { aR: 0.9, eR: -1.6 }, up: { aR: 2.4, eR: 0 }, side: { aR: 1.57, eR: 0 }, down: { aR: 0.8, eR: 0 }, self: { aR: 0.15, eR: -2.3 } };
const Lh = { hip: { aL: 0.9, eL: -1.6 }, up: { aL: 2.4, eL: 0 }, side: { aL: 1.57, eL: 0 }, down: { aL: 0.8, eL: 0 }, self: { aL: 0.15, eL: -2.3 } };

// --- the dancer ------------------------------------------------------------------------
export interface Look {
  shell: string; trim: string; eye: string; visor?: string;
  hair?: "panels" | "bob" | "buns";
  top?: "bow" | "ribbons" | "cap" | "phones" | "antenna";
  skirt?: boolean; lashes?: boolean; blush?: boolean;
  chest?: "heart" | "eq" | "bolt";
}

export const LOOKS = {
  rosa: { shell: "#ffc4d8", trim: "#ff6f91", eye: "#7ff2ff", top: "ribbons", skirt: true, lashes: true, blush: true, chest: "heart" },
  lila: { shell: "#ddd0ff", trim: "#a070f0", eye: "#ff9fd2", hair: "panels", top: "bow", lashes: true, blush: true, chest: "eq" },
  mochi: { shell: "#fff0d8", trim: "#ff9f5a", eye: "#58c4ff", hair: "buns", top: "bow", skirt: true, lashes: true, blush: true, chest: "heart" },
  menta: { shell: "#c4f5de", trim: "#28b884", eye: "#ff7fae", hair: "bob", lashes: true, blush: true, chest: "eq" },
  sky: { shell: "#b2dcff", trim: "#3d6ad6", eye: "#4ff0a0", top: "cap", chest: "bolt" },
  dj: { shell: "#ffd2a4", trim: "#6a48c8", eye: "#4ff0a0", top: "phones", chest: "eq" },
  tin: { shell: "#c8d0ea", trim: "#ff9f5a", eye: "#4ff0a0", top: "antenna", chest: "bolt" },
} satisfies Record<string, Look>;

export function heart(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.45, y - r * 0.1, x - r * 0.8, y - r * 1.2, x, y - r * 0.42);
  ctx.bezierCurveTo(x + r * 0.8, y - r * 1.2, x + r * 1.45, y - r * 0.1, x, y + r * 0.9);
  ctx.fillStyle = color;
  ctx.fill();
}

function star(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const i = r * 0.3;
  poly(ctx, [[x, y - r], [x + i, y - i], [x + r, y], [x + i, y + i], [x, y + r], [x - i, y + i], [x - r, y], [x - i, y - i]], color);
}

type Lag = { d1: [number, number]; d2: [number, number] };
const HIP = 14, L1 = 7.4, L2 = 7.2, SHY = 12.6, NECK = 15.5, HEAD = 9.5;

function headAt(p: Full) {
  const hy = -HIP - p.hy;
  return { x: p.hx + Math.sin(p.lean) * 25, y: hy - Math.cos(p.lean) * 25 };
}

/** One dancer, feet at (x, y), about 52 units tall. */
export function drawDancer(ctx: Ctx, x: number, y: number, s: number, k: Look, p: Full, lag: Lag, t: number, seed = 0) {
  const shell = k.shell, dark = shade(shell, -0.34), lite = shade(shell, 0.32), trim = k.trim;
  const beat = t * BPS, fr = beat - Math.floor(beat);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const air = Math.max(0, p.hy - 0.5);
  ellipse(ctx, 0, 0.6, Math.max(5, 12.5 - air * 0.9), 2.6, 0, `rgba(5,7,25,${Math.max(0.1, 0.28 - air * 0.02)})`);
  if (p.fall) {
    const f = Math.abs(Math.sin(p.fall));
    ctx.translate(Math.sign(p.fall) * f * 3, -f * 9.5);
    ctx.rotate(p.fall);
  }
  ctx.scale(1 + p.sq * 0.6, 1 - p.sq);
  const sc = Math.cos(p.spin * Math.PI * 2);
  const back = sc < 0;
  ctx.scale(Math.max(0.28, Math.abs(sc)), 1);

  // legs: two-bone IK from the hips to planted feet, knees bend outward
  const hipX = p.hx, hipY = -HIP - p.hy;
  for (const side of [-1, 1]) {
    const jx = hipX + side * 4.1, jy = hipY + 1;
    let fx = side * 5.4 + (side < 0 ? p.fL : p.fR), fy = -(side < 0 ? p.uL : p.uR);
    let dx = fx - jx, dy = fy - jy, d = Math.max(0.01, Math.hypot(dx, dy));
    const L = L1 + L2 - 0.05;
    if (d > L) { fx = jx + (dx / d) * L; fy = jy + (dy / d) * L; dx = fx - jx; dy = fy - jy; d = L; }
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dx / d, uy = dy / d;
    let px = -uy, py = ux;
    if (px * side < 0) { px = -px; py = -py; }
    limb(ctx, [[jx, jy], [jx + ux * a + px * hh, jy + uy * a + py * hh], [fx, fy]], 3.7, dark);
    fillRR(ctx, fx - 3.4 + side * 0.6, fy - 1.7, 6.8, 3.3, 1.6, shade(trim, -0.15));
  }

  ctx.save();
  ctx.translate(hipX, hipY);
  ctx.rotate(p.lean);
  // head-local follow-through: undo the body rotation so ribbons trail in world space
  const ra = -(p.lean + p.tilt), cr = Math.cos(ra), sr = Math.sin(ra);
  const rot = ([vx, vy]: [number, number]): [number, number] => [clamp(vx * cr - vy * sr, -7, 7), clamp(vx * sr + vy * cr, -7, 7)];
  const v1 = rot(lag.d1), v2 = rot(lag.d2);
  const headFrame = (fn: () => void) => { ctx.save(); ctx.translate(0, -NECK - HEAD); ctx.rotate(p.tilt); fn(); ctx.restore(); };
  const wob = Math.sin(t * 5.3 + seed) * 0.35;

  // back layer: hair panels, buns, ribbon streamers, antenna
  headFrame(() => {
    if (k.hair === "panels") for (const side of [-1, 1]) {
      const top: [number, number] = [side * 10.6, -3];
      const mid: [number, number] = [top[0] + side * 1.3 + v1[0] * 0.32, top[1] + 6.4 + v1[1] * 0.2];
      const bot: [number, number] = [mid[0] + side * 0.7 + v2[0] * 0.5 + wob * side, mid[1] + 6.2 + v2[1] * 0.3];
      limb(ctx, [top, mid, bot], 6, trim);
      limb(ctx, [[mid[0] - 2.6, mid[1]], [mid[0] + 2.6, mid[1]]], 1.6, lite);
    }
    if (k.hair === "buns") for (const side of [-1, 1]) {
      const bx = side * 8.8 + v1[0] * 0.08, by = -9.2 + v1[1] * 0.12;
      circle(ctx, bx, by, 4.7, trim);
      circle(ctx, bx - side * 1.2, by - 1.3, 1.3, withAlpha("#ffffff", 0.35));
    }
    if (k.top === "ribbons") for (const side of [-1, 1]) {
      const tx = side * 6.8, ty = -14.8;
      limb(ctx, [[side * 4.4, -9.2], [tx, ty]], 1.3, dark);
      const pts: [number, number][] = [[tx, ty]];
      let qx = tx, qy = ty;
      for (let i = 1; i <= 4; i++) {
        const lv = i <= 2 ? v1 : v2, wgt = 0.16 + i * 0.07;
        qx += side * 1.7 + lv[0] * wgt + Math.sin(t * 6 + i * 0.9 + side) * 0.3;
        qy += 1.3 + lv[1] * wgt * 0.7;
        pts.push([qx, qy]);
      }
      // a tapered ribbon strip
      const L: [number, number][] = [], Rr: [number, number][] = [];
      pts.forEach(([px2, py2], i) => {
        const [ax, ay] = pts[Math.max(0, i - 1)], [bx2, by2] = pts[Math.min(pts.length - 1, i + 1)];
        const nx = -(by2 - ay), ny = bx2 - ax, nl = Math.hypot(nx, ny) || 1;
        const wd = 1.25 - i * 0.18;
        L.push([px2 + (nx / nl) * wd, py2 + (ny / nl) * wd]);
        Rr.push([px2 - (nx / nl) * wd, py2 - (ny / nl) * wd]);
      });
      poly(ctx, [...L, ...Rr.reverse()], trim);
      heart(ctx, tx, ty, 2.1, shade(trim, 0.15));
    }
    if (k.top === "antenna") {
      const ax = v1[0] * 0.35, ay = -16 + v1[1] * 0.2;
      limb(ctx, [[0, -9.4], [ax * 0.5, -12.5], [ax, ay]], 1.4, dark);
      glow(ctx, ax, ay, 4.5, k.eye, 0.25 + 0.3 * (1 - fr));
      circle(ctx, ax, ay, 2, k.eye);
    }
  });

  // torso with a little chest screen
  fillRR(ctx, -8.6, -16, 17.2, 17.5, 6.5, lin(ctx, -8, -16, 8, 1.5, [[0, lite], [1, shell]]));
  fillRR(ctx, -4.8, -12.6, 9.6, 6.6, 2.4, withAlpha("#0b0e26", back ? 0.12 : 0.34));
  if (!back) {
    if (k.chest === "heart") heart(ctx, 0, -9.3, 2 + 0.35 * Math.max(0, 1 - fr * 3), k.eye);
    else if (k.chest === "bolt") poly(ctx, [[0.8, -12], [-2, -8.8], [-0.1, -8.8], [-0.8, -6.8], [2, -10], [0.1, -10]], k.eye);
    else for (let i = 0; i < 3; i++) {
      const hgt = 1.2 + 3.6 * Math.abs(Math.sin(beat * Math.PI * (i === 1 ? 1 : 0.5) + i * 1.3));
      fillRR(ctx, -3.3 + i * 2.4, -6.9 - hgt, 1.7, hgt, 0.6, withAlpha(k.eye, 0.9));
    }
  }
  if (k.skirt) {
    const sw = clamp(v1[0] * 0.22, -1.8, 1.8);
    poly(ctx, [[-8.8, -2.6], [8.8, -2.6], [11.4 + sw, 4.2], [-11.4 + sw, 4.2]], trim);
    for (const px2 of [-4.4, 0, 4.4]) limb(ctx, [[px2, -2], [px2 * 1.28 + sw * 0.8, 3.6]], 0.7, withAlpha("#ffffff", 0.3));
  }

  // arms in front of the body
  const arm = (side: number, a: number, e: number) => {
    const sx = side * 8.4, sy = -SHY;
    const ex = sx + side * Math.sin(a) * 7.2, ey = sy + Math.cos(a) * 7.2;
    const b = a + e;
    const hx = ex + side * Math.sin(b) * 6.8, hy = ey + Math.cos(b) * 6.8;
    limb(ctx, [[sx, sy], [ex, ey], [hx, hy]], 3.5, dark);
    circle(ctx, sx, sy, 2.4, shell);
    circle(ctx, hx, hy, 2.55, lite);
  };
  const raised = (a: number) => a > 2.15;
  if (!raised(p.aL)) arm(-1, p.aL, p.eL);
  if (!raised(p.aR)) arm(1, p.aR, p.eR);
  fillRR(ctx, -2.6, -18.6, 5.2, 3.4, 1.2, dark);

  // head
  headFrame(() => {
    fillRR(ctx, -12, -9.5, 24, 19, 8, lin(ctx, -11, -9.5, 11, 9.5, [[0, lite], [1, shell]]));
    if (back) {
      for (const vy of [-1.5, 1.5]) fillRR(ctx, -5, vy, 10, 1.3, 0.65, withAlpha(dark, 0.6));
    } else {
      fillRR(ctx, -9.7, -6, 19.4, 11.4, 5.2, k.visor ?? "#161b3d");
      const lk = p.turn * 1.8;
      const blink = (t + seed * 0.77) % 3.4 < 0.11;
      let eyes = p.eyes;
      if (blink && (eyes === "sparkle" || eyes === "wide" || eyes === "dot")) eyes = "closed";
      for (const side of [-1, 1]) {
        const ex = side * 4.2 + lk, ey = -0.8;
        const kind: Eyes = eyes === "wink" ? (side > 0 ? "happy" : "sparkle") : eyes;
        if (kind === "sparkle" || kind === "wide") {
          const r = kind === "wide" ? 2.9 : 2.45;
          glow(ctx, ex, ey, r * 2.2, k.eye, 0.3);
          circle(ctx, ex, ey, r, k.eye);
          circle(ctx, ex - 0.8, ey - 0.9, r * 0.36, "#ffffff");
          star(ctx, ex + 0.9, ey + 0.8, 0.8 + 0.25 * Math.sin(t * 6 + side), withAlpha("#ffffff", 0.85));
        } else if (kind === "dot") {
          glow(ctx, ex, ey, 4, k.eye, 0.3);
          fillRR(ctx, ex - 1.6, ey - 1.6, 3.2, 3.2, 0.6, k.eye);
        } else if (kind === "happy") {
          ctx.beginPath(); ctx.arc(ex, ey + 1.1, 2.1, Math.PI * 1.12, Math.PI * 1.88);
          ctx.lineWidth = 1.4; ctx.lineCap = "round"; ctx.strokeStyle = k.eye; ctx.stroke();
        } else if (kind === "closed") {
          limb(ctx, [[ex - 1.9, ey + 0.3], [ex + 1.9, ey + 0.3]], 1.2, k.eye);
        } else {
          ctx.beginPath();
          for (let i = 0; i <= 16; i++) { const a = i * 0.75 + t * 8 * side, r = 0.3 + i * 0.13; ctx.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r); }
          ctx.lineWidth = 0.8; ctx.strokeStyle = k.eye; ctx.stroke();
        }
        if (k.lashes && kind !== "closed" && kind !== "dizzy") {
          limb(ctx, [[ex + side * 2.1, ey - 1.9], [ex + side * 3.2, ey - 2.9]], 0.7, k.eye);
          limb(ctx, [[ex + side * 0.9, ey - 2.6], [ex + side * 1.3, ey - 3.7]], 0.7, k.eye);
        }
      }
      const my = 3.1;
      ctx.lineCap = "round";
      if (p.mouth === "smile") { ctx.beginPath(); ctx.arc(lk, my - 1.3, 1.5, Math.PI * 0.18, Math.PI * 0.82); ctx.lineWidth = 0.9; ctx.strokeStyle = k.eye; ctx.stroke(); }
      else if (p.mouth === "open") { ctx.beginPath(); ctx.arc(lk, my - 0.6, 1.6, 0, Math.PI); ctx.closePath(); ctx.fillStyle = withAlpha(k.eye, 0.9); ctx.fill(); }
      else if (p.mouth === "o") { ctx.beginPath(); ctx.arc(lk, my, 0.95, 0, Math.PI * 2); ctx.lineWidth = 0.8; ctx.strokeStyle = k.eye; ctx.stroke(); }
      else if (p.mouth === "flat") limb(ctx, [[lk - 1.2, my], [lk + 1.2, my]], 0.8, k.eye);
      if (k.blush) for (const side of [-1, 1]) ellipse(ctx, side * 7.6 + lk * 0.5, 2.6, 1.6, 0.9, 0, withAlpha(C.pink, 0.6));
    }
    // front layer: bangs, bob flaps, bow, cap, headphones
    if (k.hair === "panels" || k.hair === "bob") {
      fillRR(ctx, -12.5, -10.3, 25, 6.2, 6, trim);
      for (const bx of [-7.6, -2.5, 2.5, 7.6]) circle(ctx, bx, -4.7, 2.4, trim);
      if (k.hair === "bob") for (const side of [-1, 1]) limb(ctx, [[side * 11.3, -6], [side * 11.9 + v1[0] * 0.22, 6.4 + v1[1] * 0.1]], 4.8, trim);
      fillRR(ctx, -8, -9.2, 7, 1.3, 0.65, withAlpha("#ffffff", 0.22));
    }
    if (k.top === "bow") {
      ctx.save();
      ctx.translate(back ? -7 : 7, -9.6);
      ctx.rotate(0.32 + clamp(v1[0] * 0.04, -0.25, 0.25));
      const puff = 1 + clamp(Math.hypot(v1[0], v1[1]) * 0.03, 0, 0.15);
      poly(ctx, [[-0.5, 0.6], [-2.4, 5], [-0.6, 4.4]], shade(trim, -0.1));
      poly(ctx, [[0.5, 0.6], [2.6, 4.8], [0.9, 4.6]], shade(trim, -0.1));
      ellipse(ctx, -3.3, 0, 3.4 * puff, 2.4 * puff, 0.35, trim);
      ellipse(ctx, 3.3, 0, 3.4 * puff, 2.4 * puff, -0.35, trim);
      circle(ctx, 0, 0, 1.6, shade(trim, -0.18));
      ctx.restore();
    }
    if (k.top === "cap") {
      ctx.beginPath(); ctx.ellipse(0, -4.4, 12.9, 7.2, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = trim; ctx.fill();
      fillRR(ctx, back ? 10 : -18.5, -5.6, 8.5, 2.6, 1.3, shade(trim, -0.2));
      circle(ctx, 0, -11.3, 1.2, shade(trim, 0.25));
    }
    if (k.top === "phones") {
      ctx.beginPath(); ctx.arc(0, -0.5, 13.6, Math.PI * 1.08, Math.PI * 1.92);
      ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.strokeStyle = shade(trim, -0.2); ctx.stroke();
      for (const side of [-1, 1]) { fillRR(ctx, side * 13.2 - 2.4, -4.4, 4.8, 8.6, 2.2, trim); fillRR(ctx, side * 13.2 - 1, -2.6, 2, 5, 1, withAlpha(k.eye, 0.5 + 0.4 * (1 - fr))); }
    }
  });
  // arms raised beside the head stay in front of it
  if (raised(p.aL)) arm(-1, p.aL, p.eL);
  if (raised(p.aR)) arm(1, p.aR, p.eR);
  ctx.restore();
  ctx.restore();
}

/** A dancer driven by a pose function: adds the beat groove, squash on hits and follow-through. */
function dancer(ctx: Ctx, x: number, y: number, s: number, look: Look, fn: (b: number) => Full, beat: number, t: number, o: { groove?: number; seed?: number; mirror?: boolean } = {}) {
  const quiet = calm();
  const g = (quiet ? 0.35 : 1) * (o.groove ?? 1.2);
  const at = (b: number) => {
    let p = fn(b);
    if (o.mirror) p = mirrorPose(p);
    const f = ((b % 1) + 1) % 1;
    p.hy += -g * (0.5 + 0.5 * Math.cos(f * Math.PI * 2));
    if (!quiet) p.sq += 0.055 * g * Math.max(0, 1 - f * 5) - 0.02 * g * Math.sin(Math.min(1, f * 2) * Math.PI);
    return p;
  };
  const now = at(beat), h0 = headAt(now), h1 = headAt(at(beat - 0.22)), h2 = headAt(at(beat - 0.45));
  drawDancer(ctx, x, y, s, look, now, { d1: [h1.x - h0.x, h1.y - h0.y], d2: [h2.x - h0.x, h2.y - h0.y] }, t, o.seed ?? 0);
}

// --- sets ----------------------------------------------------------------------------------
type Scene = "studio" | "neon" | "sunset" | "bedroom" | "office";
const GLOW = [C.pink, C.sky, C.lilac, C.mint];

function backdrop(ctx: Ctx, w: number, h: number, kind: Scene, floorY: number, beat: number, t: number, s: number) {
  const quiet = calm();
  const b = Math.floor(beat), fr = beat - b;
  const pulse = quiet ? 0.3 : 1 - fr;
  if (kind === "studio") {
    ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, "#3c3384"], [1, "#56479f"]]);
    ctx.fillRect(0, 0, w, floorY);
    const pw = Math.max(40, w / 3.1);
    for (let x = -pw * 0.3; x < w; x += pw) {
      fillRR(ctx, x + 2, h * 0.1, pw - 4, floorY - h * 0.1 - 5 * s, 2 * s, withAlpha("#c9d6ff", 0.1));
      const sh = x + pw * (0.2 + 0.1 * Math.sin(t * 0.3));
      poly(ctx, [[sh, h * 0.1], [sh + pw * 0.16, h * 0.1], [sh - pw * 0.1, floorY - 5 * s], [sh - pw * 0.26, floorY - 5 * s]], withAlpha("#ffffff", 0.05));
    }
    ctx.fillStyle = withAlpha("#ffffff", 0.18); ctx.fillRect(0, h * 0.04, w, Math.max(2, h * 0.012));
    limb(ctx, [[0, floorY - 16 * s], [w, floorY - 16 * s]], 1.6 * s, withAlpha("#e9d7ff", 0.35));
  } else if (kind === "neon") {
    ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, "#10142e"], [1, "#1d1f4c"]]);
    ctx.fillRect(0, 0, w, floorY);
    const cx = w / 2, cy = floorY - Math.min(w, h) * 0.42;
    const on = quiet || (b % 4 !== 3 || fr > 0.15);
    const ring = (r: number, col: string, a: number) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 2.2 * s; ctx.strokeStyle = withAlpha(col, a); ctx.stroke(); };
    glow(ctx, cx, cy, 46 * s, C.pink, 0.22 * (on ? 1 : 0.4));
    ring(30 * s, C.pink, on ? 0.9 : 0.35);
    ring(22 * s, C.sky, 0.25 + 0.5 * pulse);
    for (const side of [-1, 1]) {
      const zx = cx + side * Math.min(w * 0.38, 70 * s);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(zx + (i % 2 ? 4 : -4) * s, h * 0.12 + i * 7 * s);
      ctx.lineWidth = 1.8 * s; ctx.strokeStyle = withAlpha(side < 0 ? C.mint : C.lilac, 0.8); ctx.stroke();
    }
    ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, "rgba(176,124,255,0)"], [1, "rgba(176,124,255,0.12)"]]);
    ctx.fillRect(0, 0, w, floorY);
  } else if (kind === "sunset") {
    ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, "#5a3f9e"], [0.55, "#d76f9a"], [1, "#ffae6a"]]);
    ctx.fillRect(0, 0, w, floorY);
    circle(ctx, w * 0.68, floorY - 8 * s, 18 * s, withAlpha("#ffe0a0", 0.85));
    for (let i = 0; i < 9; i++) {
      const bw = (10 + hash(i) * 12) * s, bh = (14 + hash(i + 9) * 30) * s, bx = (i / 9) * w * 1.1 - 6 * s;
      fillRR(ctx, bx, floorY - bh, bw, bh + 2, 1.5 * s, "#3d2a6e");
      for (let k = 0; k < 3; k++) if (hash(i * 5 + k) > 0.5) fillRR(ctx, bx + 2.5 * s, floorY - bh + (4 + k * 6) * s, 2.2 * s, 2.6 * s, 0.6 * s, withAlpha("#ffd28a", 0.7));
    }
    // string lights, bulbs alternate on the beat
    const y0 = h * 0.08, sag = h * 0.06;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.quadraticCurveTo(w / 2, y0 + sag * 2, w, y0);
    ctx.lineWidth = 0.8 * s; ctx.strokeStyle = withAlpha("#2a1d4f", 0.8); ctx.stroke();
    for (let i = 1; i < 10; i++) {
      const u = i / 10, bx = u * w, by = y0 + sag * 2 * 2 * u * (1 - u) + 1.5 * s;
      const lit = quiet ? 0.7 : (i + b) % 2 ? 1 - fr * 0.6 : 0.35;
      glow(ctx, bx, by, 6 * s, "#ffd28a", 0.4 * lit);
      circle(ctx, bx, by, 1.5 * s, withAlpha("#fff2c8", 0.5 + 0.5 * lit));
    }
  } else if (kind === "bedroom") {
    ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, "#8f6ac4"], [1, "#b48ad6"]]);
    ctx.fillRect(0, 0, w, floorY);
    const led = GLOW[Math.floor(beat / 4) % 4];
    ctx.fillStyle = lin(ctx, 0, 0, 0, h * 0.2, [[0, withAlpha(led, 0.55)], [1, withAlpha(led, 0)]]);
    ctx.fillRect(0, 0, w, h * 0.2);
    fillRR(ctx, 0, 0, w, Math.max(2, h * 0.012), 0, led);
    // posters
    const py = floorY - (h > w ? 50 : 34) * s;
    fillRR(ctx, w * 0.08, py, 14 * s, 18 * s, 1.5 * s, "#f6ecdc");
    heart(ctx, w * 0.08 + 7 * s, py + 9 * s, 4 * s, C.pink);
    fillRR(ctx, w * 0.08 + 17 * s, py + 3 * s, 13 * s, 13 * s, 1.5 * s, "#2a2f66");
    star(ctx, w * 0.08 + 23.5 * s, py + 9.5 * s, 4 * s, C.orange);
    // ring light
    const rx = w * 0.88, ry = floorY - 34 * s;
    limb(ctx, [[rx, ry + 9 * s], [rx, floorY]], 1.2 * s, "#2a2f66");
    ctx.beginPath(); ctx.arc(rx, ry, 8 * s, 0, Math.PI * 2); ctx.lineWidth = 2.6 * s; ctx.strokeStyle = "#fff6e0"; ctx.stroke();
    glow(ctx, rx, ry, 18 * s, "#fff6e0", 0.25);
  } else {
    ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, "#39418a"], [1, "#4a53a6"]]);
    ctx.fillRect(0, 0, w, floorY);
    const bw = Math.min(w * 0.36, 50 * s), bh = bw * 0.6, bx = w * 0.08, by = floorY - bh - (h > w ? 26 : 5) * s;
    fillRR(ctx, bx, by, bw, bh, 2 * s, "#eef0ff");
    text(ctx, "SPRINT 42", bx + bw * 0.08, by + bh * 0.18, Math.max(5, bw * 0.08), "#3d4590", { align: "left", weight: 700 });
    ctx.beginPath(); ctx.moveTo(bx + bw * 0.1, by + bh * 0.4);
    for (let i = 0; i <= 6; i++) ctx.lineTo(bx + bw * (0.1 + i * 0.13), by + bh * (0.4 + i * 0.07 + (i % 2) * 0.04));
    ctx.lineWidth = 1 * s; ctx.strokeStyle = C.pink; ctx.stroke();
    // water cooler and plant
    const wx = w * 0.86;
    fillRR(ctx, wx - 6 * s, floorY - 22 * s, 12 * s, 22 * s, 2 * s, "#dfe2f7");
    fillRR(ctx, wx - 5 * s, floorY - 34 * s, 10 * s, 12 * s, 4 * s, withAlpha(C.sky, 0.7));
    ellipse(ctx, w * 0.06, floorY - 10 * s, 6 * s, 9 * s, -0.3, "#2fa874");
    fillRR(ctx, w * 0.06 - 4 * s, floorY - 7 * s, 8 * s, 7 * s, 1.5 * s, "#ff8f5a");
  }

  // floor
  const fA = kind === "neon" ? "#151a3c" : kind === "sunset" ? "#46366e" : kind === "bedroom" ? "#6a5299" : kind === "office" ? "#2e3577" : "#6e4c72";
  const fB = kind === "neon" ? "#0b0e26" : kind === "sunset" ? "#2c2252" : kind === "bedroom" ? "#4f3b80" : kind === "office" ? "#232a63" : "#3c2b5a";
  ctx.fillStyle = lin(ctx, 0, floorY, 0, h, [[0, fA], [1, fB]]);
  ctx.fillRect(0, floorY, w, h - floorY);
  const vx = w / 2, vy = floorY - h * 0.6;
  for (let i = -10; i <= 10; i++) {
    const x0 = vx + (i * w) / 9;
    const xa = lerp(vx, x0, (floorY - vy) / (h - vy));
    limb(ctx, [[xa, floorY], [x0, h]], 0.6, "rgba(255,255,255,0.05)");
  }
  for (let k = 1; k < 6; k++) { const y = floorY + (h - floorY) * (k / 6) ** 1.6; ctx.fillStyle = "rgba(255,255,255,0.035)"; ctx.fillRect(0, y, w, 1); }
  if (kind === "bedroom") ellipse(ctx, w / 2, floorY + (h - floorY) * 0.42, w * 0.4, (h - floorY) * 0.16, 0, withAlpha("#ffb8d8", 0.22));
  // LED strip where the wall meets the floor, steps color on every beat
  const ledC = GLOW[b & 3];
  ctx.fillStyle = withAlpha(ledC, quiet ? 0.6 : 0.5 + 0.5 * pulse);
  ctx.fillRect(0, floorY - 1.2 * s, w, 1.4 * s);
  ctx.fillStyle = lin(ctx, 0, floorY, 0, floorY + 8 * s, [[0, withAlpha(ledC, 0.25 * pulse)], [1, withAlpha(ledC, 0)]]);
  ctx.fillRect(0, floorY, w, 8 * s);
}

/** Colored light pools under the dancers, pulsing on the beat. */
function pools(ctx: Ctx, xs: number[], y: number, s: number, beat: number, r = 15) {
  const b = Math.floor(beat), fr = beat - b, pulse = calm() ? 0.4 : 1 - fr;
  xs.forEach((x, i) => {
    const col = GLOW[(i + b) & 3];
    ellipse(ctx, x, y + 1 * s, r * s * (1 + 0.12 * pulse), 3.6 * s, 0, rad(ctx, x, y, r * s, [[0, withAlpha(col, 0.15 + 0.4 * pulse)], [1, withAlpha(col, 0)]]));
  });
}

function noteGlyph(ctx: Ctx, x: number, y: number, r: number, color: string, double: boolean) {
  ellipse(ctx, x, y, r * 1.15, r * 0.85, -0.4, color);
  fillRR(ctx, x + r * 0.8, y - r * 3.6, r * 0.4, r * 3.6, r * 0.2, color);
  if (double) {
    ellipse(ctx, x + r * 3.2, y - r * 0.6, r * 1.15, r * 0.85, -0.4, color);
    fillRR(ctx, x + r * 4, y - r * 4.2, r * 0.4, r * 3.6, r * 0.2, color);
    poly(ctx, [[x + r * 0.8, y - r * 3.6], [x + r * 4.4, y - r * 4.2], [x + r * 4.4, y - r * 3.3], [x + r * 0.8, y - r * 2.7]], color);
  } else poly(ctx, [[x + r * 1.2, y - r * 3.6], [x + r * 2.6, y - r * 2.4], [x + r * 2.4, y - r * 1.8], [x + r * 1.2, y - r * 2.7]], color);
}

/** Music notes drift up and bounce on every beat. */
function notes(ctx: Ctx, w: number, h: number, s: number, t: number, beat: number, n = 5, top = 0.25, bottom = 0.7) {
  const fr = beat - Math.floor(beat);
  const bounce = calm() ? 0 : Math.max(0, 1 - fr * 3.5);
  for (let i = 0; i < n; i++) {
    const p = (t * 0.1 + hash(i * 7 + 1)) % 1;
    const x = w * (0.08 + 0.84 * hash(i * 3 + 2)) + Math.sin(t * 1.4 + i) * 3 * s;
    const y = h * lerp(bottom, top, p) - bounce * 2.2 * s;
    const a = Math.sin(p * Math.PI);
    noteGlyph(ctx, x, y, (1.7 + bounce * 0.35) * s, withAlpha(i % 2 ? "#ffffff" : GLOW[i & 3], 0.75 * a), i % 3 === 0);
  }
}

/** Trend text the way short-video apps overlay it, with hashtags under it. */
function caption(ctx: Ctx, w: number, h: number, s: number, line: string, tags: string, y = h > w ? h * 0.2 : h * 0.13) {
  const fs = Math.max(6, Math.min(w * 0.065, 6.4 * s));
  ctx.font = `700 ${fs}px "Lexend Variable", system-ui, sans-serif`;
  const lines = wrap(ctx, line, w * 0.8);
  const lw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const lh = fs * 1.3, th = lines.length * lh;
  fillRR(ctx, w / 2 - lw / 2 - fs * 0.6, y - fs * 0.55, lw + fs * 1.2, th + fs * 0.3, fs * 0.45, "rgba(11,14,38,0.62)");
  lines.forEach((l, i) => text(ctx, l, w / 2, y + i * lh + fs * 0.12, fs, "#ffffff", { weight: 700 }));
  text(ctx, tags, w / 2, y + th + fs * 0.62, fs * 0.72, withAlpha("#f6ecdc", 0.92), { weight: 600 });
}

/** Tiny camera punch on every other downbeat. */
function cam(ctx: Ctx, w: number, h: number, beat: number, amt = 0.014) {
  if (calm()) return;
  const b = Math.floor(beat), fr = beat - b;
  const k = 1 + (b % 2 === 0 ? amt * Math.max(0, 1 - fr * 2.5) : 0);
  ctx.translate(w / 2, h * 0.6); ctx.scale(k, k); ctx.translate(-w / 2, -h * 0.6);
}

/** Layout shared by the group videos: unit scale, floor line and feet line. */
function frame(w: number, h: number) {
  const portrait = h > w * 1.05;
  const s = Math.min(w / 100, h / 118);
  const feetY = portrait ? h * 0.79 : h * 0.88;
  const floorY = feetY - (portrait ? 30 : 22) * s;
  const spread = portrait ? 1 : Math.min(1.7, w / s / 100);
  return { portrait, s, feetY, floorY, spread };
}

// --- 1. synchronized group choreography ----------------------------------------------------
const syncChor = chor([
  [0, {}],
  [1, { hx: 2.5, fR: 4, fL: 1, ...A.clap, ...R.side, lean: 0.05, tilt: -0.1 }],
  [2, { ...A.clap }],
  [3, { hx: -2.5, fL: -4, fR: -1, ...A.clap, ...Lh.side, lean: -0.05, tilt: 0.1 }],
  [4, { ...A.clap }],
  [5, { ...A.v, hy: 2, uL: 0.8, uR: 0.8, eyes: "happy", mouth: "open" }, "pop"],
  [6, { ...A.low, hy: -3.5, fL: -2, fR: 2, aL: 0.15, aR: 0.15 }],
  [7, { hx: 3, lean: -0.1, tilt: 0.15, ...R.hip, ...Lh.up }],
  [8, { hx: -3, lean: 0.1, tilt: -0.15, ...Lh.hip, ...R.up }],
  [9, { ...A.chest, spin: 0 }],
  [10, { ...A.chest, spin: 1, mouth: "o" }, "smooth"],
  [11, { ...A.v, hy: 4.5, sq: -0.06, eyes: "happy", mouth: "open" }, "pop"],
  [12, { ...A.out, hy: -3, sq: 0.1 }],
  [12.5, { ...A.out, aL: 1.9, eL: 0.6, aR: 1.25, eR: -0.6 }, "smooth"],
  [13, { ...A.out, aL: 1.25, eL: -0.6, aR: 1.9, eR: 0.6 }, "smooth"],
  [13.5, { ...A.out, aL: 1.9, eL: 0.6, aR: 1.25, eR: -0.6 }, "smooth"],
  [14, { hx: -2, lean: -0.06, tilt: 0.18, aL: 2.3, eL: 0.6, ...R.hip, eyes: "wink" }, "pop"],
  [15.4, { hx: -2, lean: -0.06, tilt: 0.18, aL: 2.3, eL: 0.6, ...R.hip, eyes: "wink" }],
], 16);

const sync: VideoDef = {
  id: "dn-sync", title: "Practice room choreo, four bots in sync", channel: "Servo Squad", views: "4.1M views", durationLabel: "0:16", loop: 8, thumbT: 2.55,
  color: "#ff6f91",
  post: { user: "servo.squad", caption: "Practice room, take 47. Finally in sync #robotdance #practice #servosquad" },
  comments: ["The canon at the end gave my capacitors chills.", "Mint in the headphones is carrying the back row.", "Take 47 and still cleaner than my code."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 8, beat = t * BPS;
    const { s, feetY, floorY, spread } = frame(w, h);
    ctx.save();
    cam(ctx, w, h, beat);
    backdrop(ctx, w, h, "studio", floorY, beat, t, s);
    notes(ctx, w, h, s, t, beat, 4, 0.28, 0.55);
    // formation: line, then a V on beats 8 to 12 (outer bots step back), then the line again
    const v = smooth(seg(beat, 7.6, 8.6)) * (1 - smooth(seg(beat, 11.6, 12.4)));
    const crew = [
      { look: LOOKS.rosa, x: -36, back: 1 },
      { look: LOOKS.lila, x: -12, back: 0 },
      { look: LOOKS.sky, x: 12, back: 0 },
      { look: LOOKS.dj, x: 36, back: 1 },
    ];
    const items = crew.map((c, i) => ({ ...c, i, x: w / 2 + c.x * s * spread * (1 - v * 0.12), y: feetY - c.back * v * 9 * s, k: 0.8 * (1 - c.back * v * 0.08) }));
    pools(ctx, items.map((d) => d.x), feetY, s, beat, 13);
    for (const d of [...items].sort((a, b) => a.y - b.y)) {
      // canon on beats 12 to 14: the arm wave ripples left to right
      const delay = d.i * 0.25 * smooth(seg(beat, 11.8, 12.2)) * (1 - smooth(seg(beat, 13.8, 14.2)));
      dancer(ctx, d.x, d.y, s * d.k, d.look, syncChor, beat - delay, t, { seed: d.i * 3 });
    }
    ctx.restore();
    caption(ctx, w, h, s, "practice room, take 47", "#robotdance #kpop #practice");
  },
};

// --- 2. point and step trend -----------------------------------------------------------------
const pointChor = chor([
  [0, { ...R.up, ...Lh.hip, fR: 4.5, hx: 1.5, lean: 0.04, tilt: -0.12 }],
  [1, { ...R.down, ...Lh.hip, hy: -2, tilt: 0.06 }],
  [2, { ...Lh.up, ...R.hip, fL: -4.5, hx: -1.5, lean: -0.04, tilt: 0.12 }],
  [3, { ...Lh.down, ...R.hip, hy: -2, tilt: -0.06 }],
  [4, { ...A.v, hy: 3, uL: 0.6, uR: 0.6, eyes: "happy", mouth: "open" }, "pop"],
  [5, { aL: -0.35, eL: -1.45, aR: 0.1, eR: -2.1, hy: -1 }],
  [5.5, { aL: 0.1, eL: -2.1, aR: -0.35, eR: -1.45, hy: -1.5 }, "smooth"],
  [6, { ...R.self, ...Lh.hip, hx: 2.5, lean: -0.08, tilt: 0.1 }],
  [7, { aR: 1.3, eR: -0.5, ...Lh.hip, hx: -1, tilt: -0.14, eyes: "wink" }, "pop"],
], 8);

const pointStep: VideoDef = {
  id: "dn-point", title: "Point and step trend, robot edition", channel: "Point Step Trio", views: "7.3M views", durationLabel: "0:12", loop: 4, thumbT: 0.3,
  color: "#b07cff",
  post: { user: "pointstep.trio", caption: "Point and step trend, robot edition. Unit 3 points at the ceiling every time #pointandstep #fyp", funny: true },
  comments: ["Unit 3 is pointing at the cloud. Where the data lives.", "Learned this in four epochs.", "The wink at the end got me rebooted."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 4, beat = t * BPS;
    const { s, feetY, floorY, spread } = frame(w, h);
    ctx.save();
    cam(ctx, w, h, beat);
    backdrop(ctx, w, h, "neon", floorY, beat, t, s);
    notes(ctx, w, h, s, t, beat, 4, 0.3, 0.6);
    const crew = [LOOKS.mochi, LOOKS.rosa, LOOKS.menta];
    const xs = [-30, 0, 30].map((x) => w / 2 + x * s * spread);
    pools(ctx, xs, feetY, s, beat, 15);
    crew.forEach((look, i) => {
      // unit 3 always points straight at the ceiling instead of the diagonal
      const fn = i === 2 ? (b: number) => {
        const p = pointChor(b);
        const ph = ((b % 8) + 8) % 8;
        if (ph < 1) { p.aR = 2.6; p.eR = 0.62; p.eyes = "wide"; p.tilt = -0.2; }
        else if (ph >= 2 && ph < 3) { p.aL = 2.6; p.eL = 0.62; p.eyes = "wide"; p.tilt = 0.2; }
        return p;
      } : pointChor;
      dancer(ctx, xs[i], feetY, s * 0.88, look, fn, beat, t, { seed: i * 5 });
    });
    ctx.restore();
    caption(ctx, w, h, s, "point and step but make it robots", "#pointandstep #robotdance");
  },
};

// --- 3. hand wave trend: a wave travels across five dancers and back -------------------------
const bump = (x: number, wd = 0.2) => Math.exp(-(x / wd) * (x / wd));
function waveFn(i: number, n: number) {
  return (beat: number): Full => {
    const b = ((beat % 8) + 8) % 8;
    const T = b < 4.2 ? 0.4 + i * 0.6 : 4.6 + (n - 1 - i) * 0.6;
    const dir = b < 4.2 ? 1 : -1;
    const u = b - T;
    const j = (k: number) => bump(u - dir * k * 0.1);
    // the wave enters through one hand and leaves through the other
    const first = dir > 0 ? -1 : 1;
    const rL = first < 0 ? [j(0), j(1), j(2)] : [j(4), j(5), j(6)];
    const rR = first < 0 ? [j(4), j(5), j(6)] : [j(0), j(1), j(2)];
    const head = j(3);
    const p = full({ ...A.out });
    p.aL = 1.45 + rL[2] * 0.45 - rL[0] * 0.15; p.eL = rL[0] * 1.1 - rL[1] * 0.6;
    p.aR = 1.45 + rR[0] * 0.45 - rR[2] * 0.15; p.eR = rR[2] * 1.1 - rR[1] * 0.6;
    p.hy = head * 2; p.tilt = head * 0.15 * dir; p.lean = head * 0.04 * dir;
    p.eyes = head > 0.4 ? "happy" : "sparkle";
    // last beat: everyone waves hello
    if (b > 7) { const wv = Math.sin((b - 7) * Math.PI * 4); p.aR = 2.4; p.eR = 0.5 + wv * 0.55; p.aL = 0.25; p.eL = 0.2; p.eyes = "happy"; p.mouth = "open"; }
    return p;
  };
}
const WAVE_FNS = [0, 1, 2, 3, 4].map((i) => waveFn(i, 5));

const wave: VideoDef = {
  id: "dn-wave", title: "The hand wave trend, five bots one clock", channel: "Wave Function", views: "2.8M views", durationLabel: "0:08", loop: 4, thumbT: 1.1,
  color: "#4fb6ff",
  post: { user: "wave.function", caption: "Five bots, one shared clock. Zero dropped frames #wavetrend #sync" },
  comments: ["That wave has lower latency than my router.", "Second from the left was 2 ms late and I noticed.", "Rooftop at golden hour is unfair."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 4, beat = t * BPS;
    const { s, feetY, floorY, spread } = frame(w, h);
    ctx.save();
    cam(ctx, w, h, beat, 0.01);
    backdrop(ctx, w, h, "sunset", floorY, beat, t, s);
    const crew = [LOOKS.lila, LOOKS.tin, LOOKS.rosa, LOOKS.sky, LOOKS.menta];
    const xs = [-40, -20, 0, 20, 40].map((x) => w / 2 + x * s * spread);
    pools(ctx, xs, feetY, s, beat, 10);
    crew.forEach((look, i) => dancer(ctx, xs[i], feetY, s * 0.66, look, WAVE_FNS[i], beat, t, { seed: i * 2, groove: 0.9 }));
    notes(ctx, w, h, s, t, beat, 3, 0.3, 0.5);
    ctx.restore();
    caption(ctx, w, h, s, "the wave trend but we share one clock", "#wavetrend #robotdance");
  },
};

// --- 4. duet: side by side, the right half mirrors the left, high five across the line -------
const duetChor = chor([
  [0, {}],
  [1, { hy: 1.5, aL: 0.35, eL: 0.6, aR: 0.35, eR: 0.6, tilt: 0.1 }, "pop"],
  [2, { hy: -2.5, tilt: -0.05 }],
  [3, { ...R.up, aL: 0.4, eL: 0.4, hx: 1.5, tilt: -0.1 }],
  [4, { ...Lh.up, aR: 0.4, eR: 0.4, hx: -1.5, tilt: 0.1 }],
  [5, { uL: 3.2, fL: 1, aL: 1, eL: -1.4, aR: 0.2, eR: 1.4, hy: 0.5 }],
  [5.5, { uR: 3.2, fR: -1, aR: 1, eR: -1.4, aL: 0.2, eL: 1.4, hy: 0.5 }],
  [6, { uL: 3.2, fL: 1, aL: 1, eL: -1.4, aR: 0.2, eR: 1.4, hy: 0.5 }],
  [6.5, { uR: 3.2, fR: -1, aR: 1, eR: -1.4, aL: 0.2, eL: 1.4, hy: 0.5 }],
  [7, { aL: -0.55, eL: -0.9, aR: -0.55, eR: -0.9, mouth: "flat", tilt: 0.12 }, "pop"],
  [9, { ...A.v, hy: 2.5, eyes: "happy", mouth: "open" }, "pop"],
  [10, { ...A.hips, hx: 2.5, lean: -0.08 }],
  [11, { ...A.hips, hx: -2.5, lean: 0.08 }],
  [12, { ...A.hips, hx: 2.5, lean: -0.08 }],
  [13, { ...A.chest, tilt: 0.14, eyes: "happy" }],
  [14, { ...R.side, aL: 0.4, eL: 0.3, hx: 3.5, fR: 3, lean: 0.12, tilt: -0.1 }, "smooth"],
  [15, { ...R.side, aL: 0.4, eL: 0.3, hx: 3.5, fR: 3, lean: 0.12, tilt: -0.1, eyes: "happy", mouth: "open" }],
], 16);

const duet: VideoDef = {
  id: "dn-duet", title: "Duet with a mirror twin, high five finish", channel: "Capt Cache", views: "1.9M views", durationLabel: "0:16", loop: 8, thumbT: 7.2,
  color: "#3d6ad6",
  post: { user: "capt.cache", caption: "Duet with @bun.bun. I mirrored it, that still counts #duet #robotdance", funny: true },
  comments: ["The high five across the split line. Peak engineering.", "He mirrored it and called it a feature.", "bun.bun's bow has better follow-through than my career."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 8, beat = t * BPS;
    const { s, feetY, floorY } = frame(w, h);
    const half = w / 2;
    const side = (i: number) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(i * half, 0, half, h); ctx.clip();
      ctx.translate(i * half, 0);
      backdrop(ctx, half, h, i ? "sunset" : "studio", floorY, beat, t, s);
      // close enough to the split line that the outstretched hands meet on it
      const k = i ? 0.95 : 0.86, reach = 27 * s * k + 1 * s;
      const x = i ? reach : half - reach;
      pools(ctx, [x], feetY, s, beat + i, 13);
      dancer(ctx, x, feetY, s * k, i ? LOOKS.sky : LOOKS.mochi, duetChor, beat, t, { seed: i * 7, mirror: i === 1 });
      text(ctx, i ? "@capt.cache" : "@bun.bun", half * 0.5, h > w ? h * 0.36 : h * 0.3, Math.max(5, 4.4 * s), withAlpha("#ffffff", 0.85), { weight: 600 });
      ctx.restore();
    };
    side(0); side(1);
    ctx.fillStyle = "rgba(11,14,38,0.7)"; ctx.fillRect(half - 0.75 * s, 0, 1.5 * s, h);
    // the high five spark where the hands meet
    const hit = seg(beat, 14.25, 14.4) * (1 - seg(beat, 15, 15.8));
    if (hit > 0) {
      const y = feetY - 24 * s;
      glow(ctx, half, y, 14 * s, "#fff2c8", 0.6 * hit);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; star(ctx, half + Math.cos(a) * 7 * s * hit, y + Math.sin(a) * 7 * s * hit, 1.6 * s, withAlpha("#ffffff", hit)); }
    }
    caption(ctx, w, h, s, "duet with @bun.bun", "#duet #robotdance");
  },
};

// --- 5. a robot doing the robot -----------------------------------------------------------
const ROB = { aL: 1.57, eL: -1.57, aR: 1.57, eR: -1.57, eyes: "dot" as Eyes, mouth: "flat" as Mouth };
const robotChor = chor([
  [0, { ...ROB }],
  [1, { ...ROB, eR: 1.57 }],
  [2, { ...ROB, eL: 1.57 }],
  [3, { ...ROB, eL: 1.57, eR: 1.57, turn: 1, tilt: 0.0 }],
  [4, { ...ROB, eL: 1.57, eR: 1.57, turn: -1 }],
  [5, { ...ROB, aL: 1.57, eL: 0, aR: 1.57, eR: 0, turn: 0 }],
  [6, { ...ROB, aL: 1.57, eL: 0, aR: 2.4, eR: 0, lean: 0.12 }],
  [7, { ...ROB, aL: 2.4, eL: 0, aR: 1.57, eR: 0, lean: -0.12 }],
  [8, { ...ROB, hx: 3, fL: 3, fR: 3 }],
  [9, { ...ROB, hx: 6, fL: 6, fR: 6, eR: 1.57 }],
  [10, { ...ROB, hx: 3, fL: 3, fR: 3, eL: 1.57 }],
  [11, { ...ROB, hx: 3, fL: 3, fR: 3, eL: 1.57 }],
  [12, { aL: 0.08, eL: 0.05, aR: 0.08, eR: 0.05, hy: -3.5, lean: 0.12, tilt: 0.35, eyes: "closed", mouth: "flat" }, "smooth"],
  [12.8, { aL: 0.08, eL: 0.05, aR: 0.08, eR: 0.05, hy: -3.5, lean: 0.12, tilt: 0.35, eyes: "closed", mouth: "flat" }],
  [13, { ...ROB, hy: 1.5, sq: -0.08, eyes: "wide", mouth: "o" }, "pop"],
  [14, { aR: 2.6, eR: 1.75, ...Lh.hip, eyes: "happy", mouth: "smile", tilt: -0.08 }, "pop"],
  [15.5, { aR: 2.6, eR: 1.75, ...Lh.hip, eyes: "happy", mouth: "smile", tilt: -0.08 }],
], 16);
// mechanical: transitions take a fraction of the beat, then hold dead still
// (except the slow power-down slump on beats 11 to 13)
const tick = (b: number) => {
  const x = ((b % 16) + 16) % 16;
  if (x >= 11 && x < 13) return b;
  const i = Math.floor(b);
  return i + clamp((b - i) / 0.18);
};

const theRobot: VideoDef = {
  id: "dn-robot", title: "They asked me to do the robot", channel: "Unit Robot", views: "11M views", durationLabel: "0:16", loop: 8, thumbT: 2.2,
  color: "#c8d0ea",
  post: { user: "unit.robot", caption: "They asked me to do the robot. I am the robot #therobot #literally", funny: true },
  comments: ["The low battery dip is the most relatable thing I have seen.", "Every tick landed on the beat. Hardware timer?", "He did not do the robot. He did himself."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 8, beat = t * BPS;
    const { s, feetY, floorY } = frame(w, h);
    ctx.save();
    cam(ctx, w, h, beat, 0.01);
    backdrop(ctx, w, h, "office", floorY, beat, t, s);
    const x = w / 2;
    pools(ctx, [x], feetY, s, beat, 20);
    const k = h > w ? 1.25 : 1.05;
    dancer(ctx, x, feetY, s * k, LOOKS.tin, (b) => robotChor(tick(b)), beat, t, { groove: 0.15, seed: 1 });
    // little servo sparks on every hit, battery and reboot callouts
    const b = Math.floor(beat), fr = beat - b;
    const headY = feetY - 44 * s * k;
    if (b < 11 && fr < 0.25 && !calm()) for (let i = 0; i < 3; i++) {
      const a = hash(b * 3 + i) * Math.PI * 2;
      star(ctx, x + Math.cos(a) * (14 + fr * 30) * s, headY + 12 * s + Math.sin(a) * (10 + fr * 20) * s, 1.4 * s * (1 - fr * 3), withAlpha("#fff2c8", 0.9));
    }
    const fs = Math.max(5, 4.6 * s);
    if (beat >= 11 && beat < 13) {
      const bx = x - 6.5 * s, by = headY - 24 * s * k;
      fillRR(ctx, bx, by, 13 * s, 6.5 * s, 1.5 * s, "#eef0ff");
      fillRR(ctx, bx + 13 * s, by + 2 * s, 1.6 * s, 2.5 * s, 0.6 * s, "#eef0ff");
      fillRR(ctx, bx + 1.2 * s, by + 1.2 * s, 2.6 * s * (1 - seg(beat, 11, 12.5)) + 0.6 * s, 4.1 * s, 0.8 * s, C.pink);
      fillRR(ctx, bx + 6.5 * s - fs * 3.4, by + 10.5 * s - fs * 0.75, fs * 6.8, fs * 1.5, fs * 0.5, "rgba(11,14,38,0.6)");
      text(ctx, "low battery", bx + 6.5 * s, by + 10.5 * s, fs, "#ffffff", { weight: 600 });
    } else if (beat >= 13 && beat < 14.5) {
      text(ctx, "rebooting", x, headY - 10 * s, fs, C.mint, { weight: 700, mono: true });
    } else if (beat < 11 && fr < 0.5 && b % 2 === 0) {
      text(ctx, b % 4 ? "bzzt" : "beep", x + (b % 4 ? -20 : 20) * s, headY - 4 * s, fs, withAlpha("#ffffff", 0.8 * (1 - fr * 2)), { weight: 700, mono: true });
    }
    ctx.restore();
    caption(ctx, w, h, s, "they asked me to do the robot", "#therobot #iamtherobot");
  },
};

// --- 6. dance challenge with a mirrored, slowed tutorial ------------------------------------
const tutChor = chor([
  [0, { ...R.up, ...Lh.hip, hx: 1.5, fR: 3.5, tilt: -0.1 }],
  [1, { ...Lh.up, ...R.hip, hx: -1.5, fL: -3.5, tilt: 0.1 }],
  [2, { ...A.clap, hy: -1 }],
  [2.5, { ...A.low, aL: 0.5, aR: 0.5 }, "smooth"],
  [3, { ...A.clap, hy: -1 }],
  [4, { hy: -3, lean: 0.1, ...A.low, tilt: 0.1 }, "smooth"],
  [4.5, { hy: 0, lean: -0.1, ...A.low, tilt: -0.1 }, "smooth"],
  [5, { ...A.v, hy: 4.5, sq: -0.06, eyes: "happy", mouth: "open" }, "pop"],
  [6, { ...A.chest, spin: 0, hy: -1 }],
  [7, { ...A.chest, spin: 1, mouth: "o" }, "smooth"],
  [7.5, { ...A.chest, eyes: "wink", tilt: 0.15 }, "pop"],
], 8);
const STEPS = ["point", "point", "clap", "clap", "roll", "hop", "spin", "pose"];

const tutorial: VideoDef = {
  id: "dn-tutorial", title: "Servo Challenge tutorial, mirrored and slowed", channel: "Ribbon RX", views: "3.6M views", durationLabel: "0:24", loop: 8, thumbT: 5.1,
  color: "#a070f0",
  post: { user: "ribbon.rx", caption: "Servo Challenge tutorial. Top is mirrored at half speed, bottom is the real thing #servochallenge #tutorial" },
  comments: ["Finally a tutorial slow enough for my old firmware.", "Step 6 is just a hop and I still fell over.", "Mirrored tutorials should be the default, thank you."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 8;
    const portrait = h > w * 1.05;
    const s = Math.min(w / 100, h / 118);
    // two panes: tutorial (half speed, mirrored) and full speed
    const pane = (i: number) => {
      const r = portrait ? { x: 0, y: i * h / 2, w, h: h / 2 } : { x: i * w / 2, y: 0, w: w / 2, h };
      const beat = i === 0 ? t : t * BPS;
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.translate(r.x, r.y);
      const ps = Math.min(r.w / 70, r.h / 66);
      const feetY = r.h * 0.92, floorY = feetY - 14 * ps;
      backdrop(ctx, r.w, r.h, i ? "neon" : "studio", floorY, beat, t, ps);
      pools(ctx, [r.w / 2], feetY, ps, beat, 15);
      dancer(ctx, r.w / 2, feetY, ps * (portrait ? 0.68 : 0.62), LOOKS.lila, tutChor, beat, i === 0 ? t * 0.5 : t, { mirror: i === 0, seed: 4 });
      const fs = Math.max(5, 5 * ps);
      text(ctx, i ? "full speed" : "tutorial 0.5x mirrored", fs * 0.8, fs * 1.3, fs, "#ffffff", { align: "left", weight: 700 });
      if (i === 0) {
        // the counts, current step highlighted, with its name
        const step = Math.floor(beat) % 8;
        for (let k = 0; k < 8; k++) {
          const cx = r.w / 2 + (k - 3.5) * fs * 1.7, cy = r.h * 0.2;
          const on = k === step;
          circle(ctx, cx, cy, fs * (on ? 0.78 : 0.62), on ? C.orange : "rgba(11,14,38,0.55)");
          text(ctx, String(k + 1), cx, cy + fs * 0.04, fs * 0.72, on ? "#2a1407" : "#eef0ff", { weight: 700 });
        }
        text(ctx, STEPS[step], r.w / 2, r.h * 0.2 + fs * 1.7, fs * 1.05, C.orange, { weight: 700 });
      }
      ctx.restore();
    };
    pane(0); pane(1);
    ctx.fillStyle = "rgba(11,14,38,0.8)";
    if (portrait) ctx.fillRect(0, h / 2 - 0.75 * s, w, 1.5 * s); else ctx.fillRect(w / 2 - 0.75 * s, 0, 1.5 * s, h);
  },
};

// --- 7. fail compilation: one dancer is always a little off --------------------------------
const failChor = chor([
  [0, { ...A.clap }],
  [1, { ...R.up, ...Lh.hip, hx: 1.5, fR: 4 }],
  [2, { ...Lh.up, ...R.hip, hx: -1.5, fL: -4 }],
  [3, { ...A.v, hy: 2.5, eyes: "happy", mouth: "open" }, "pop"],
  [4, { ...A.chest, spin: 0 }],
  [5, { ...A.chest, spin: 1, mouth: "o" }, "smooth"],
  [6, { ...A.hips, hx: 2, lean: -0.06 }],
  [7, { aL: 2.3, eL: 0.6, ...R.hip, tilt: 0.15, eyes: "wink" }, "pop"],
], 8);
const FAILS = ["one beat behind", "the spin", "wrong way"];

const fails: VideoDef = {
  id: "dn-fail", title: "Robot dance fails, part 7", channel: "Oops All Bots", views: "16M views", durationLabel: "0:12", loop: 12, thumbT: 6.6,
  color: "#ff9f5a",
  post: { user: "oops.allbots", caption: "Dance fails part 7. No robots were harmed, one was rebooted #fail #robotdance", funny: true },
  comments: ["Clip two, the dizzy eyes. I am crying oil.", "One beat behind is my entire personality.", "The bonk sound I imagined was perfect."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 12, clip = Math.min(2, Math.floor(t / 4)), lt = t - clip * 4, beat = lt * BPS;
    const { s, feetY, floorY, spread } = frame(w, h);
    ctx.save();
    cam(ctx, w, h, beat);
    backdrop(ctx, w, h, (["studio", "neon", "sunset"] as Scene[])[clip], floorY, beat, lt, s);
    const crew = [LOOKS.menta, LOOKS.dj, LOOKS.rosa];
    const xs = [-28, 0, 28].map((x) => w / 2 + x * s * spread);
    pools(ctx, xs, feetY, s, beat, 13);
    let bonk = 0;
    crew.forEach((look, i) => {
      let fn: (b: number) => Full = failChor;
      let x = xs[i];
      if (clip === 0 && i === 2) {
        // always exactly one beat late, then notices
        fn = (b) => { const p = failChor(b - 1); if (b > 7) { p.eyes = "wide"; p.mouth = "o"; p.turn = -1; } return p; };
      } else if (clip === 1 && i === 1) {
        // keeps spinning, gets dizzy, tips over, gets back up
        fn = (b) => {
          const p = failChor(Math.min(b, 4.6));
          if (b > 4) { p.spin = (b - 4) * 1.6; p.eyes = "dizzy"; p.mouth = "o"; }
          if (b > 5.8) { p.spin = 0; p.fall = easeOut(seg(b, 5.8, 6.3)) * 1.5 * (1 - smooth(seg(b, 7.2, 7.9))); p.aL = 2.2; p.aR = 2.2; }
          return p;
        };
      } else if (clip === 2 && i === 0) {
        // steps the wrong way and bonks into the next dancer
        fn = (b) => { const p = mirrorPose(failChor(b)); if (b > 2.1 && b < 3.6) { p.eyes = "dizzy"; p.lean = -0.2 * bump(b - 2.3, 0.4); } return p; };
        bonk = bump(beat - 2.15, 0.25);
        x += bonk * 6 * s;
      } else if (clip === 2 && i === 1) {
        x += bump(beat - 2.25, 0.3) * 3 * s;
      }
      dancer(ctx, x, feetY, s * 0.86, look, fn, beat, lt, { seed: i * 4 + clip });
    });
    if (clip === 2 && bonk > 0.05) {
      const bx = (xs[0] + xs[1]) / 2, by = feetY - 40 * s;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + lt * 4; star(ctx, bx + Math.cos(a) * 9 * s, by + Math.sin(a) * 4 * s, 2 * s, withAlpha("#fff2c8", bonk)); }
      text(ctx, "bonk", bx, by - 9 * s, 6 * s, withAlpha("#ffffff", bonk), { weight: 800 });
    }
    if (clip === 1 && beat > 6.2 && beat < 7.6) {
      const hx = xs[1] + 30 * s, hy = feetY - 8 * s;
      for (let i = 0; i < 4; i++) { const a = lt * 5 + i * 1.57; star(ctx, hx + Math.cos(a) * 7 * s, hy - 5 * s + Math.sin(a) * 2.5 * s, 1.8 * s, "#fff2c8"); }
    }
    ctx.restore();
    // title card at the start of every clip
    const card = 1 - smooth(seg(lt, 1.1, 1.5));
    if (card > 0) {
      const fs = Math.max(6, 6 * s), y = h > w ? h * 0.32 : h * 0.3;
      const slide = calm() ? 0 : (1 - easeOut(seg(lt, 0, 0.35))) * w;
      ctx.globalAlpha = card;
      fillRR(ctx, w * 0.1 - slide, y - fs * 1.1, w * 0.8, fs * 2.2, fs * 0.5, C.orange);
      text(ctx, `Fail #${clip + 1}: ${FAILS[clip]}`, w / 2 - slide, y, fs, "#2a1407", { weight: 800 });
      ctx.globalAlpha = 1;
    }
    caption(ctx, w, h, s, "robot dance fails part 7", "#fail #robotdance #oops");
    if (lt < 0.25 || lt > 3.8) { ctx.fillStyle = `rgba(14,18,51,${lt < 0.25 ? 1 - lt / 0.25 : (lt - 3.8) / 0.2})`; ctx.fillRect(0, 0, w, h); }
  },
};

// --- 8. heart hands trend ----------------------------------------------------------------------
const heartChor = (inner: 1 | -1) => chor([
  [0, { hx: 2, tilt: -0.08, ...A.low }, "smooth"],
  [1, { ...A.chest, tilt: 0.1, eyes: "happy" }, "pop"],
  [2, { hx: -2, tilt: 0.08, ...A.low }, "smooth"],
  [3, { ...A.chest, tilt: -0.1, eyes: "happy" }, "pop"],
  // inner arm arches toward the partner: two halves make one big heart
  [4, inner > 0 ? { aR: 2.3, eR: 0.45, ...Lh.hip, lean: 0.06, tilt: 0.12, hx: 1.5 } : { aL: 2.3, eL: 0.45, ...R.hip, lean: -0.06, tilt: -0.12, hx: -1.5 }, "smooth"],
  [5.6, inner > 0 ? { aR: 2.3, eR: 0.45, ...Lh.hip, lean: 0.06, tilt: 0.12, hx: 1.5, eyes: "happy" } : { aL: 2.3, eL: 0.45, ...R.hip, lean: -0.06, tilt: -0.12, hx: -1.5, eyes: "happy" }],
  [6, { ...A.chest, hy: 2, eyes: "wink" }, "pop"],
  [7.5, { ...A.chest, hy: 0, eyes: "wink" }],
], 8);
const HEART_L = heartChor(1), HEART_R = heartChor(-1);

const hearts: VideoDef = {
  id: "dn-heart", title: "Heart hands trend with my best bot", channel: "Pixel Pals", views: "5.2M views", durationLabel: "0:08", loop: 4, thumbT: 2.5,
  color: "#ff6f91",
  post: { user: "pixel.pals", caption: "Heart hands trend with my best bot. We practiced on the same clock cycle #hearthands #bff" },
  comments: ["The big heart between them, my fans spun up.", "Best bots forever.", "The ring light really sells it."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 4, beat = t * BPS;
    const { s, feetY, floorY } = frame(w, h);
    ctx.save();
    cam(ctx, w, h, beat);
    backdrop(ctx, w, h, "bedroom", floorY, beat, t, s);
    const gap = 19 * s; // close enough that the two inner arms meet over the middle
    const xs = [w / 2 - gap, w / 2 + gap];
    pools(ctx, xs, feetY, s, beat, 14);
    const k = h > w ? 0.95 : 0.9;
    dancer(ctx, xs[0], feetY, s * k, LOOKS.mochi, HEART_L, beat, t, { seed: 2 });
    dancer(ctx, xs[1], feetY, s * k, LOOKS.menta, HEART_R, beat, t, { seed: 6 });
    // the shared heart glows once both arms are up
    const big = smooth(seg(beat, 4.4, 4.8)) * (1 - smooth(seg(beat, 5.6, 6)));
    if (big > 0) {
      const hy = feetY - 43 * s * k;
      glow(ctx, w / 2, hy, 22 * s, C.pink, 0.45 * big);
      heart(ctx, w / 2, hy, 7 * s * (0.6 + 0.4 * backOut(big)), withAlpha(C.pink, 0.9 * big));
    }
    // little finger hearts pop on beats 1, 3 and 6
    for (const [b0, xi] of [[1, 0], [3, 1], [6, 0], [6, 1]] as [number, number][]) {
      const p = seg(beat, b0, b0 + 1.4);
      if (p <= 0 || p >= 1) continue;
      heart(ctx, xs[xi] + Math.sin(p * 6 + xi) * 3 * s, feetY - (22 + p * 30) * s * k, (2.2 + p) * s, withAlpha(xi ? C.pink : "#ff9fd2", 1 - p));
    }
    notes(ctx, w, h, s, t, beat, 3, 0.3, 0.55);
    ctx.restore();
    caption(ctx, w, h, s, "heart hands trend with my best bot", "#hearthands #bff #robotdance");
  },
};

// --- 9. the reflection has lag -------------------------------------------------------------------
const mirrorChor = chor([
  [0, { ...A.clap }],
  [1, { ...R.up, ...Lh.hip, hx: 1.5, tilt: -0.1 }],
  [2, { ...A.clap }],
  [3, { ...Lh.up, ...R.hip, hx: -1.5, tilt: 0.1 }],
  [4, { ...A.v, hy: 3, eyes: "happy", mouth: "open" }, "pop"],
  [5, { ...A.hips, hy: -2.5 }],
  [6, { aL: 1.57, eL: 1.2, aR: 1.57, eR: -1.2, hx: 2, lean: -0.05 }],
  [7, { aL: 1.57, eL: -1.2, aR: 1.57, eR: 1.2, hx: -2, lean: 0.05 }],
  [8, { ...A.clap }],
  [9, { ...R.side, ...Lh.side, hy: -1 }],
  [10, { ...A.v, hy: 2.5 }, "pop"],
  [11, { ...A.chest, tilt: 0.1 }],
  [12, { ...A.hips, turn: -1, eyes: "wide", mouth: "o" }],
  [13.6, { ...A.hips, turn: -1, eyes: "wide", mouth: "o", tilt: -0.15 }],
  [14.2, { ...A.out, eyes: "happy", mouth: "open" }, "pop"],
  [15, { aR: 2.3, eR: 0.6, ...Lh.hip, eyes: "wink" }, "pop"],
], 16);
/** Reflection beat: half a beat behind, freezes to buffer, then catches up at double speed. */
const reflBeat = (b: number) => (b < 10.5 ? b - 0.5 : b < 12.5 ? 10 : b < 14 ? 10 + (b - 12.5) * 2.33 : b - 0.5);

const lagMirror: VideoDef = {
  id: "dn-mirror", title: "My reflection is on hotel wifi", channel: "Lag Queen", views: "9.4M views", durationLabel: "0:16", loop: 8, thumbT: 5.9,
  color: "#28b884",
  post: { user: "lag.queen", caption: "My reflection is on hotel wifi. 250 ms ping and it still buffered #mirror #lag", funny: true },
  comments: ["The buffering wheel inside the mirror. Genius.", "My reflection has never caught up.", "Imagine your reflection needing a better router."],
  draw(ctx, w, h, t0) {
    const t = safe(t0) % 8, beat = t * BPS;
    const { s, feetY, floorY, portrait } = frame(w, h);
    ctx.save();
    cam(ctx, w, h, beat, 0.01);
    backdrop(ctx, w, h, "studio", floorY, beat, t, s);
    // mirror on the left, dancer on the right
    const mx = w * 0.05, mw = w * (portrait ? 0.5 : 0.44), my = portrait ? h * 0.36 : h * 0.12, mh = feetY + 3 * s - my;
    fillRR(ctx, mx - 1.6 * s, my - 1.6 * s, mw + 3.2 * s, mh + 3.2 * s, 3 * s, "#2a2f66");
    fillRR(ctx, mx, my, mw, mh, 2.2 * s, lin(ctx, mx, my, mx + mw, my + mh, [[0, "#6c6ac4"], [1, "#4a4aa0"]]));
    const k = portrait ? 0.8 : 0.82;
    const rb = reflBeat(beat), buffering = beat >= 10.5 && beat < 12.5;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 2.2 * s); ctx.clip();
    ctx.translate(mx + mw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(mx + mw / 2), 0);
    ctx.globalAlpha = 0.85;
    dancer(ctx, mx + mw / 2, feetY - 1 * s, s * k * 0.94, LOOKS.menta, mirrorChor, rb, rb / BPS, { seed: 3 });
    ctx.globalAlpha = 1;
    ctx.restore();
    poly(ctx, [[mx + mw * 0.12, my], [mx + mw * 0.3, my], [mx, my + mh * 0.4], [mx, my + mh * 0.15]], withAlpha("#ffffff", 0.1));
    const fs = Math.max(5, 4.2 * s);
    text(ctx, buffering ? "ping 9999 ms" : "ping 250 ms", mx + mw - fs * 0.6, my + fs * 1.2, fs, buffering ? C.pink : C.mint, { align: "right", weight: 700, mono: true });
    if (buffering) {
      const cx = mx + mw / 2, cy = my + mh * 0.42;
      ctx.beginPath(); ctx.arc(cx, cy, 6 * s, 0, Math.PI * 2); ctx.lineWidth = 1.6 * s; ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.stroke();
      const a0 = calm() ? 0 : t * 7;
      ctx.beginPath(); ctx.arc(cx, cy, 6 * s, a0, a0 + 1.6); ctx.strokeStyle = "#ffffff"; ctx.lineCap = "round"; ctx.stroke();
    }
    const dx = w * (portrait ? 0.76 : 0.72);
    pools(ctx, [dx], feetY, s, beat, 14);
    dancer(ctx, dx, feetY, s * k, LOOKS.menta, mirrorChor, beat, t, { seed: 3 });
    ctx.restore();
    caption(ctx, w, h, s, "my reflection is on hotel wifi", "#mirror #lag #robotdance");
  },
};

export const DANCE_VIDEOS: VideoDef[] = [sync, pointStep, wave, duet, theRobot, tutorial, fails, hearts, lagMirror];
