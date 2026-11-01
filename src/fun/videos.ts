import {
  C, type Ctx, circle, core, drawBot, drawGPU, ellipse, fillRR, glow, lin, limb, loopFade, mix, poly, rad, rr, shade, shadow, text, withAlpha, wrap,
} from "./draw";
import { backOut, clamp, easeIn, easeInOut, easeOut, hash, lerp, seg, smooth } from "./util";
import { PARODY_VIDEOS } from "./parody";
import { DANCE_VIDEOS } from "./dance";
import { redrawCanvasOnLocale } from "../localization-canvas";

export interface VideoDef {
  id: string;
  title: string;
  channel: string;
  views: string;
  durationLabel: string;
  /** Seconds after which the animation repeats exactly. */
  loop: number;
  /** Time used for the thumbnail frame. */
  thumbT?: number;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  /** Channel avatar color in the feed. */
  color?: string;
  /** Handle and caption when the video shows up in the phone feed. */
  post?: { user: string; caption: string; funny?: boolean };
  /** Channel-specific comments shown first under the video. */
  comments?: string[];
}

// --- small shared pieces -----------------------------------------------------------
export function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const i = r * 0.28;
  poly(ctx, [[x, y - r], [x + i, y - i], [x + r, y], [x + i, y + i], [x, y + r], [x - i, y + i], [x - r, y], [x - i, y - i]], color);
}

function room(ctx: Ctx, w: number, h: number, floorY: number, wallA: string, wallB: string, floorA: string, floorB: string) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, wallA], [1, wallB]]);
  ctx.fillRect(0, 0, w, floorY);
  ctx.fillStyle = lin(ctx, 0, floorY, 0, h, [[0, floorA], [1, floorB]]);
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, floorY, w, Math.max(1.5, (h - floorY) * 0.03));
}

function cat(ctx: Ctx, x: number, y: number, s: number, o: { crouch?: number; look?: number; smug?: boolean; tail?: number; dir?: number; stretch?: number }) {
  const body = C.orange, dark = shade(C.orange, -0.25), belly = C.cream;
  const cr = o.crouch ?? 0, st = o.stretch ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * (o.dir ?? 1), s);
  shadow(ctx, 0, 0.5, 12, 2.2, 0.22);
  ctx.scale(1 / Math.sqrt(st), st);
  const tailA = o.tail ?? 0;
  limb(ctx, [[-8, -6], [-14, -10 + Math.sin(tailA) * 2], [-15 + Math.sin(tailA) * 3, -18 + cr * 4]], 3, dark);
  // legs
  for (const lx of [-5, 4]) fillRR(ctx, lx - 1.8, -5 + cr * 1.5, 3.6, 5 - cr * 1.5, 1.6, dark);
  ellipse(ctx, 0, -8 + cr * 2.5, 10 + cr * 1.5, 6.5 - cr * 1.5, 0, lin(ctx, 0, -14, 0, -2, [[0, shade(body, 0.12)], [1, body]]));
  ellipse(ctx, 1.5, -6 + cr * 2.5, 6, 3.2 - cr, 0, withAlpha(belly, 0.8));
  // stripes
  for (const sx of [-5, -1.5, 2]) ellipse(ctx, sx, -12.5 + cr * 3, 1.1, 2.6, 0.2, dark);
  const hx = 8 + cr * 1.5, hy = -15 + cr * 5;
  poly(ctx, [[hx - 5, hy - 3], [hx - 4, hy - 10 + cr * 2], [hx - 0.5, hy - 5]], body);
  poly(ctx, [[hx + 5, hy - 3], [hx + 4, hy - 10 + cr * 2], [hx + 0.5, hy - 5]], body);
  poly(ctx, [[hx - 4.2, hy - 4], [hx - 3.8, hy - 8 + cr * 2], [hx - 1.6, hy - 5]], C.pink);
  poly(ctx, [[hx + 4.2, hy - 4], [hx + 3.8, hy - 8 + cr * 2], [hx + 1.6, hy - 5]], C.pink);
  circle(ctx, hx, hy, 6, lin(ctx, 0, hy - 6, 0, hy + 6, [[0, shade(body, 0.15)], [1, body]]));
  ellipse(ctx, hx + 1, hy + 2.6, 3.2, 2, 0, belly);
  const lk = (o.look ?? 0) * 0.8;
  for (const ex of [-2.3, 2.3]) {
    if (o.smug) limb(ctx, [[hx + ex - 1.3 + lk, hy - 0.6], [hx + ex + 1.3 + lk, hy - 0.6]], 1, "#2a1a33");
    else { circle(ctx, hx + ex + lk, hy - 0.6, 1.5, "#2a1a33"); circle(ctx, hx + ex + lk + 0.4, hy - 1.1, 0.5, "#fff"); }
  }
  circle(ctx, hx + 1 + lk, hy + 1.6, 0.8, C.pink);
  ctx.restore();
}

function vacuum(ctx: Ctx, x: number, y: number, s: number, t: number) {
  shadow(ctx, x, y + 0.5 * s, 16 * s, 2.4 * s, 0.3);
  fillRR(ctx, x - 15 * s, y - 7 * s, 30 * s, 7 * s, 3.5 * s, lin(ctx, 0, y - 7 * s, 0, y, [[0, "#dfe2f7"], [1, "#a5a9d1"]]));
  fillRR(ctx, x - 12 * s, y - 8.4 * s, 24 * s, 2.4 * s, 1.2 * s, "#2a2f66");
  circle(ctx, x + 9 * s, y - 4 * s, 1.2 * s, Math.sin(t * 5) > 0 ? C.mint : withAlpha(C.mint, 0.3));
  for (const wx of [-9, 9]) circle(ctx, x + wx * s, y, 1.6 * s, "#2a2f66");
}

// --- the videos -----------------------------------------------------------------------
const dance: VideoDef = {
  id: "dance-battle", title: "Robot dance battle, round three", channel: "Servo Moves", views: "2.4M views", durationLabel: "3:12", loop: 8, thumbT: 1.25,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    const beat = t * 2, b = Math.floor(beat), ph = beat - b;
    const turn = Math.floor(t / 4) % 2;
    ctx.fillStyle = rad(ctx, w / 2, h * 0.35, Math.max(w, h) * 0.8, [[0, "#3a2f7a"], [0.6, "#1b2246"], [1, "#0e1233"]]);
    ctx.fillRect(0, 0, w, h);
    const floorY = Y(26);
    // spotlights
    for (const [i, col] of [[0, C.pink], [1, C.sky]] as [number, string][]) {
      const sway = Math.sin(t * 1.3 + i * 2) * 18;
      const topX = X(i ? 35 : -35), botX = X((i ? 22 : -22) + sway);
      poly(ctx, [[topX - 3 * s, -5], [topX + 3 * s, -5], [botX + 26 * s, floorY + 6 * s], [botX - 26 * s, floorY + 6 * s]],
        lin(ctx, 0, 0, 0, floorY, [[0, withAlpha(col, 0.32)], [1, withAlpha(col, 0.04)]]));
    }
    // disco floor
    ctx.fillStyle = "#141a33";
    ctx.fillRect(0, floorY, w, h - floorY);
    const tile = 13 * s;
    const cols = Math.ceil(w / tile) + 1;
    for (let r = 0; r * tile * 0.55 < h - floorY; r++) {
      for (let c = -1; c < cols; c++) {
        const lit = hash(c * 7 + r * 13 + b * 3) > 0.62;
        const col = [C.pink, C.sky, C.lilac, C.mint][(c + r + b) & 3];
        const x = c * tile + (r % 2) * tile * 0.5 - ((w / 2) % tile);
        fillRR(ctx, x + 1, floorY + 2 + r * tile * 0.55, tile - 2, tile * 0.55 - 2, 2 * s, lit ? withAlpha(col, 0.55 * (1 - ph * 0.6)) : "rgba(255,255,255,0.04)");
      }
    }
    const bounce = Math.abs(Math.sin(Math.PI * beat));
    const snap = (v: number) => v < 0.5 ? easeOut(v * 2) : 1;
    // orange: robot dance, sharp snaps
    {
      const on = turn === 0;
      const p = snap(ph);
      const a1 = on ? (b % 2 ? lerp(0.4, 2.7, p) : lerp(2.7, 0.4, p)) : 0.3 + bounce * 0.1;
      const a2 = on ? (b % 2 ? lerp(2.2, 0.6, p) : lerp(0.6, 2.2, p)) : 0.3 + bounce * 0.1;
      drawBot(ctx, X(-24), floorY - (on ? bounce * 3 * s : bounce * s), s * 1.15, {
        body: C.orange, armL: a1, armR: a2, elbowL: on ? 1.2 : 0.3, elbowR: on ? -0.6 : 0.3,
        legL: on ? Math.sin(beat * Math.PI) * 0.3 : 0, legR: on ? -Math.sin(beat * Math.PI) * 0.3 : 0,
        tilt: on ? (b % 2 ? 0.15 : -0.15) : 0.05, eyes: on ? "happy" : "open", look: on ? 0 : 1, lean: on ? (b % 2 ? 0.08 : -0.08) * p : 0,
      });
    }
    // sky blue: smooth wave and spin
    {
      const on = turn === 1;
      const wv = beat * Math.PI;
      drawBot(ctx, X(24), floorY - (on ? bounce * 3 * s : bounce * s), s * 1.15, {
        body: C.sky, eye: C.cream, armL: on ? 1.6 + Math.sin(wv) * 0.6 : 0.3, armR: on ? 1.6 + Math.sin(wv + 1.4) * 0.6 : 0.3,
        elbowL: on ? Math.sin(wv + 0.8) * 0.9 : 0.3, elbowR: on ? Math.sin(wv + 2.2) * 0.9 : 0.3,
        lean: on ? Math.sin(wv) * 0.12 : 0, tilt: on ? Math.sin(wv + 1) * 0.18 : -0.05,
        legL: on ? Math.max(0, Math.sin(wv)) * 0.5 : 0, kneeL: on ? Math.max(0, Math.sin(wv)) * 0.9 : 0,
        eyes: on ? "happy" : "open", look: on ? 0 : -1,
      });
    }
    // sparkles around whoever is dancing
    for (let i = 0; i < 5; i++) {
      const a = t * 1.4 + i * 1.26;
      const x = X((turn ? 24 : -24) + Math.cos(a) * 22), y = Y(-6 + Math.sin(a * 1.3) * 18);
      sparkle(ctx, x, y, (2 + Math.sin(t * 6 + i) * 1.2) * s, withAlpha(i % 2 ? C.cream : C.orange, 0.85));
    }
    loopFade(ctx, w, h, t, 8, 0.25);
  },
};

const roomba: VideoDef = {
  id: "roomba-drift", title: "Roomba drifts the kitchen corner", channel: "Dust Kings", views: "880K views", durationLabel: "0:48", loop: 4.6, thumbT: 2.0,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    // kitchen floor tiles
    ctx.fillStyle = "#2a3166";
    ctx.fillRect(0, 0, w, h);
    const ts = 16 * s;
    const ox = (w / 2) % ts, oy = (h / 2) % ts;
    for (let y = oy - ts; y < h + ts; y += ts) for (let x = ox - ts; x < w + ts; x += ts) {
      const odd = (Math.round((x - ox) / ts) + Math.round((y - oy) / ts)) & 1;
      fillRR(ctx, x + 0.8, y + 0.8, ts - 1.6, ts - 1.6, 2 * s, odd ? "#323a78" : "#2b336c");
    }
    // walls (top and right), with soft shadow on the floor
    const wallY = Y(-50), wallX = X(48);
    ctx.fillStyle = lin(ctx, 0, wallY, 0, wallY + 14 * s, [[0, "rgba(8,10,35,0.45)"], [1, "rgba(8,10,35,0)"]]);
    ctx.fillRect(0, wallY, wallX, 14 * s);
    ctx.fillStyle = lin(ctx, wallX, 0, wallX - 14 * s, 0, [[0, "rgba(8,10,35,0.45)"], [1, "rgba(8,10,35,0)"]]);
    ctx.fillRect(wallX - 14 * s, wallY, 14 * s, h);
    ctx.fillStyle = "#3d4590"; ctx.fillRect(0, 0, w, wallY);
    ctx.fillRect(wallX, 0, w - wallX, h);
    ctx.fillStyle = "#4a54a8"; ctx.fillRect(0, wallY - 3 * s, wallX + 3 * s, 3 * s);
    ctx.fillRect(wallX, wallY - 3 * s, 3 * s, h);
    // the path: in from the left, a drift around the corner, out the bottom
    const R = 20, A = 140, ARC = (Math.PI / 2) * R, B = 110;
    const total = A + ARC + B;
    const at = (d: number) => {
      if (d < A) return { x: -130 + d, y: -30, hd: 0 };
      if (d < A + ARC) { const a = (d - A) / R; return { x: 10 + Math.sin(a) * R, y: -10 - Math.cos(a) * R, hd: a }; }
      return { x: 30, y: -10 + (d - A - ARC), hd: Math.PI / 2 };
    };
    const drift = (d: number) => 0.75 * Math.sin(Math.PI * clamp((d - A + 12) / (ARC + 50)));
    const d = ((t % 4.6) / 4.6) * total;
    // skid marks and dust
    for (let k = 1; k < 46; k++) {
      const dd = d - k * 1.6;
      if (dd < 0) break;
      const dr = drift(dd);
      if (dr < 0.12) continue;
      const p = at(dd), hd = p.hd + dr;
      for (const side of [-1, 1]) {
        const ox = -Math.sin(hd) * 8 * side, oy = Math.cos(hd) * 8 * side;
        ellipse(ctx, X(p.x + ox), Y(p.y + oy), 1.6 * s, 1.1 * s, hd, `rgba(8,10,35,${0.35 * dr * (1 - k / 46)})`);
      }
    }
    for (let k = 1; k < 8; k++) {
      const dd = d - k * 6;
      if (dd < 0 || drift(dd) < 0.2) continue;
      const p = at(dd);
      const age = k / 8;
      circle(ctx, X(p.x - 6 + hash(k + Math.floor(d / 6)) * 4), Y(p.y + 6 + age * 6), (2 + age * 7) * s, withAlpha(C.cream, 0.18 * (1 - age)));
    }
    const p = at(d), hd = p.hd + drift(d);
    const x = X(p.x), y = Y(p.y);
    shadow(ctx, x + 1.5 * s, y + 2 * s, 12 * s, 12 * s, 0.35);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(hd);
    circle(ctx, 0, 0, 11.5 * s, lin(ctx, -11 * s, -11 * s, 11 * s, 11 * s, [[0, "#f6f7ff"], [1, "#b4b9e0"]]));
    ellipse(ctx, 3.5 * s, 0, 8 * s, 10.6 * s, 0, withAlpha("#ffffff", 0.35));
    circle(ctx, -2 * s, 0, 4.6 * s, "#3d4590");
    circle(ctx, -2 * s, 0, 1.6 * s, "#8a91c4");
    fillRR(ctx, 4.5 * s, -5 * s, 2.2 * s, 10 * s, 1.1 * s, "#2a2f66");
    circle(ctx, 8.4 * s, 0, 1.1 * s, Math.sin(t * 8) > 0 ? C.mint : withAlpha(C.mint, 0.35));
    // spinning side brush
    for (let i = 0; i < 3; i++) {
      const a = t * 18 + (i * Math.PI * 2) / 3;
      limb(ctx, [[8 * s, 8 * s], [8 * s + Math.cos(a) * 4.5 * s, 8 * s + Math.sin(a) * 4.5 * s]], 0.7 * s, withAlpha(C.cream, 0.7));
    }
    ctx.restore();
    // speed streaks
    if (drift(d) > 0.3) for (let i = 0; i < 3; i++) {
      const a = p.hd + Math.PI + (i - 1) * 0.35;
      limb(ctx, [[x + Math.cos(a) * 14 * s, y + Math.sin(a) * 14 * s], [x + Math.cos(a) * 22 * s, y + Math.sin(a) * 22 * s]], 1.2 * s, withAlpha(C.cream, 0.35));
    }
  },
};

const unbox: VideoDef = {
  id: "gpu-unboxing", title: "Unboxing the new GPU (it is huge)", channel: "Unbox Unit", views: "1.1M views", durationLabel: "12:40", loop: 7, thumbT: 4.2,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    const reveal = seg(t, 1.8, 3.2);
    ctx.fillStyle = rad(ctx, w / 2, Y(-10), Math.max(w, h), [[0, mix("#252d5c", "#4a3a8a", reveal)], [1, "#0e1233"]]);
    ctx.fillRect(0, 0, w, h);
    // rays
    ctx.save();
    ctx.translate(X(0), Y(-18));
    ctx.rotate(t * 0.25);
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      poly(ctx, [[0, 0], [Math.max(w, h), -40 * s], [Math.max(w, h), 40 * s]], withAlpha(C.cream, 0.035 + reveal * 0.05));
    }
    ctx.restore();
    const tableY = Y(28);
    ctx.fillStyle = "#1b2246"; ctx.fillRect(0, tableY, w, h - tableY);
    ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(0, tableY, w, 2 * s);
    const wob = t < 0.8 ? Math.sin(t * 22) * 0.03 * (1 - t / 0.8) : 0;
    const bx = X(0), bTop = Y(-2), bw = 64 * s, bh = 30 * s;
    shadow(ctx, bx, tableY, 38 * s, 4 * s, 0.35);
    // GPU rising out of the box (drawn first, the box front hides it)
    const rise = easeInOut(seg(t, 1.8, 3.2));
    const hover = t > 3.2 ? Math.sin((t - 3.2) * 2.4) * 2 * s : 0;
    const gy = lerp(Y(14), Y(-28), rise) + hover;
    if (rise > 0) {
      glow(ctx, bx, gy, 50 * s * (0.5 + reveal * 0.5), C.sky, 0.35 * reveal);
      ctx.save();
      ctx.translate(bx, gy);
      ctx.rotate(t > 3.2 ? Math.sin((t - 3.2) * 1.7) * 0.05 : 0);
      drawGPU(ctx, 0, 0, 58 * s, t, { fans: 3 });
      ctx.restore();
    }
    ctx.save();
    ctx.translate(bx, tableY);
    ctx.rotate(wob);
    ctx.translate(-bx, -tableY);
    // back flaps (inside)
    const open = backOut(seg(t, 0.8, 1.8), 1.4);
    fillRR(ctx, bx - bw / 2, bTop - 3 * s, bw, 6 * s, 2 * s, "#7a3f26");
    // box front
    fillRR(ctx, bx - bw / 2, bTop, bw, bh, 3 * s, lin(ctx, 0, bTop, 0, bTop + bh, [[0, "#ffb27a"], [1, "#e07a45"]]));
    fillRR(ctx, bx - bw / 2, bTop, bw, 4 * s, 2 * s, "#ffc79c");
    fillRR(ctx, bx - 8 * s, bTop + 9 * s, 16 * s, 12 * s, 3 * s, "#c4602f");
    fillRR(ctx, bx - 5 * s, bTop + 12 * s, 10 * s, 6 * s, 2 * s, "#ffb27a");
    fillRR(ctx, bx - bw / 2 + 4 * s, bTop + bh - 6 * s, 14 * s, 2 * s, 1 * s, "rgba(255,255,255,0.25)");
    // flaps
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(bx + (side * bw) / 2, bTop);
      ctx.rotate(side * -open * 2.1);
      fillRR(ctx, side < 0 ? 0 : -bw / 2, -2 * s, bw / 2, 4 * s, 2 * s, side < 0 ? "#ffa66b" : "#f39459");
      ctx.restore();
    }
    ctx.restore();
    if (t > 3) for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + t * 0.6;
      const r = (26 + (i % 3) * 8) * s;
      sparkle(ctx, bx + Math.cos(a) * r * 1.3, gy + Math.sin(a) * r * 0.6, (1.5 + Math.abs(Math.sin(t * 3 + i)) * 2.5) * s, withAlpha(C.cream, 0.9 * seg(t, 3, 3.6)));
    }
    loopFade(ctx, w, h, t, 7, 0.45);
  },
};

const TOKENS = ["The", "robot", "fixed", "the", "bug"];
const ATT: number[][] = [
  [0.1, 0.0, 0.62, 0.08, 0.2], // robot
  [0.05, 0.55, 0.0, 0.1, 0.3], // bug
  [0.04, 0.48, 0.0, 0.08, 0.4], // fixed
  [0.0, 0.7, 0.12, 0.08, 0.1], // The
];
const QIDX = [1, 4, 2, 0];
const attention: VideoDef = {
  id: "attention", title: "Attention, explained with arrows", channel: "Neural Notes", views: "640K views", durationLabel: "8:05", loop: 8, thumbT: 0.9,
  draw(ctx, w, h, t) {
    const { s } = core(w, h, 0.5);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#1b2246"], [1, "#141a33"]]);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) glow(ctx, hash(i) * w, hash(i + 3) * h, 40 * s, i % 2 ? C.lilac : C.sky, 0.08);
    // the clock can read slightly negative (or NaN) at the start of a loop; keep the index valid
    const tt = Number.isFinite(t) ? Math.max(0, t) : 0;
    const qi = Math.floor(tt / 2) % 4, f = smooth(seg(tt % 2, 0, 0.5));
    const prev = ATT[(qi + 3) % 4], cur = ATT[qi];
    const wts = cur.map((v, i) => lerp(prev[i], v, f));
    const q = QIDX[qi];
    const portrait = w < h * 0.9;
    const n = TOKENS.length;
    const pos = TOKENS.map((_, i) => portrait
      ? { x: w * 0.34, y: h * 0.22 + (i * h * 0.6) / (n - 1) }
      : { x: w * 0.12 + (i * w * 0.76) / (n - 1), y: h * 0.64 });
    const tw = portrait ? w * 0.42 : (w * 0.76) / n * 0.84, th = portrait ? (h * 0.6) / n * 0.62 : 15 * s;
    const fs = Math.min(th * 0.42, tw * 0.22);
    // arcs from the query token to every other token
    for (let j = 0; j < n; j++) {
      if (j === q || wts[j] < 0.02) continue;
      const a = pos[q], b = pos[j];
      const dist = portrait ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
      const lift = Math.max(16 * s, dist * 0.45);
      const p0 = portrait ? { x: a.x + tw / 2, y: a.y } : { x: a.x, y: a.y - th / 2 };
      const p2 = portrait ? { x: b.x + tw / 2, y: b.y } : { x: b.x, y: b.y - th / 2 };
      const p1 = portrait ? { x: Math.max(p0.x, p2.x) + lift, y: (p0.y + p2.y) / 2 } : { x: (p0.x + p2.x) / 2, y: Math.min(p0.y, p2.y) - lift };
      const col = [C.orange, C.mint, C.sky, C.pink, C.lilac][j];
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
      ctx.lineWidth = (0.8 + wts[j] * 5) * s; ctx.lineCap = "round"; ctx.strokeStyle = withAlpha(col, 0.25 + wts[j] * 0.7); ctx.stroke();
      // flowing dots along the arc
      for (let k = 0; k < 3; k++) {
        const u = ((t * 0.8 + k / 3 + j * 0.13) % 1);
        const x = (1 - u) * (1 - u) * p0.x + 2 * u * (1 - u) * p1.x + u * u * p2.x;
        const y = (1 - u) * (1 - u) * p0.y + 2 * u * (1 - u) * p1.y + u * u * p2.y;
        circle(ctx, x, y, (1 + wts[j] * 2.4) * s, withAlpha(C.cream, 0.4 + wts[j] * 0.6));
      }
      // arrow head
      const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x), al = (2.5 + wts[j] * 3) * s;
      poly(ctx, [[p2.x, p2.y], [p2.x - Math.cos(ang - 0.5) * al, p2.y - Math.sin(ang - 0.5) * al], [p2.x - Math.cos(ang + 0.5) * al, p2.y - Math.sin(ang + 0.5) * al]], withAlpha(col, 0.9));
    }
    // tokens
    TOKENS.forEach((tk, i) => {
      const { x, y } = pos[i];
      const isQ = i === q;
      const wv = isQ ? 1 : wts[i];
      const col = isQ ? C.orange : mix("#2e3577", [C.orange, C.mint, C.sky, C.pink, C.lilac][i], clamp(wv * 1.3));
      const bump = isQ ? 1 + Math.sin(seg(t % 2, 0, 0.4) * Math.PI) * 0.08 : 1;
      fillRR(ctx, x - (tw / 2) * bump, y - (th / 2) * bump, tw * bump, th * bump, th * 0.3, col);
      text(ctx, tk, x, y + 0.5, fs, isQ || wv > 0.4 ? "#141a33" : C.ink, { weight: 600 });
      if (!portrait) {
        const bh = wv * 22 * s;
        fillRR(ctx, x - tw * 0.18, y + th / 2 + 6 * s, tw * 0.36, Math.max(1.5 * s, bh), 1.5 * s, withAlpha(isQ ? C.orange : C.cream, 0.4 + wv * 0.5));
      }
    });
    text(ctx, "Attention", portrait ? w / 2 : w * 0.12 - tw / 2, portrait ? h * 0.09 : h * 0.16, Math.max(9, 7 * s), C.cream, { weight: 650, align: portrait ? "center" : "left" });
  },
};

const pancakes: VideoDef = {
  id: "pancakes", title: "Robot learns to flip pancakes", channel: "Chef Byte", views: "3.9M views", durationLabel: "5:27", loop: 9, thumbT: 7.35,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.52);
    const counterY = Y(20);
    room(ctx, w, h, counterY, "#252d5c", "#2e3577", "#e9874f", "#b85a33");
    // wall tiles
    const ts = 10 * s;
    for (let y = counterY - ts; y > -ts; y -= ts) for (let x = ((w / 2) % ts) - ts; x < w; x += ts) fillRR(ctx, x + 0.8, y + 0.8, ts - 1.6, ts - 1.6, 1.6 * s, "rgba(255,255,255,0.035)");
    // window glow
    fillRR(ctx, X(-46), Y(-44), 26 * s, 20 * s, 3 * s, withAlpha(C.sky, 0.18));
    const cyc = Math.floor(t / 3), ct = t % 3;
    const sc = s * 1.2;
    const botX = X(-6), botY = Y(28);
    // pan lift and arm
    const dip = seg(ct, 0.55, 0.75), jerk = seg(ct, 0.75, 0.9);
    const lift = -dip * 0.25 + easeOut(jerk) * 0.6 - seg(ct, 0.9, 1.4) * 0.35;
    const a = 1.05 - lift;
    const shX = botX + 9 * sc, shY = botY - 23.5 * sc;
    const hx = shX + Math.sin(a) * 13.6 * sc, hy = shY + Math.cos(a) * 13.6 * sc;
    const panX = hx + 13 * sc, panY = hy - 1 * sc;
    // pancake flight: two land back in the pan, the third lands on its head
    const onHead = cyc === 2;
    const fl = seg(ct, 0.85, 1.9);
    const headX = botX, headY = botY - 41.5 * sc;
    let px = panX, py = panY - 2 * sc, prot = 0;
    const plated = cyc + (cyc < 2 && ct > 2.6 ? 1 : 0);
    if (fl > 0 && fl < 1) {
      const tx = onHead ? headX : panX, ty = onHead ? headY : panY - 2 * sc;
      px = lerp(panX, tx, fl);
      py = lerp(panY, ty, fl) - Math.sin(fl * Math.PI) * 38 * s;
      prot = fl * Math.PI * (onHead ? 1.5 : 1);
    } else if (fl >= 1) {
      if (onHead) { px = headX; py = headY; prot = 0; }
      else if (ct > 2.1) {
        const f2 = seg(ct, 2.1, 2.6);
        px = lerp(panX, X(-36), f2); py = lerp(panY - 2 * sc, Y(17 - plated * 2.2), f2) - Math.sin(f2 * Math.PI) * 12 * s;
        if (f2 >= 1) px = NaN;
      }
    }
    const surprised = onHead && fl >= 1;
    drawBot(ctx, botX, botY, sc, {
      body: C.cream, eye: C.sky, armR: a, elbowR: 0, armL: surprised ? 2.6 : 0.4, elbowL: surprised ? 0.6 : 0.3,
      eyes: surprised ? "wide" : fl > 0 && fl < 1 ? "open" : "happy", look: surprised ? 0 : 0.6, tilt: surprised ? Math.sin(t * 9) * 0.06 : 0.05,
    });
    // pan
    limb(ctx, [[hx, hy], [panX - 7 * sc, panY]], 2.2 * sc, "#3d4590");
    ellipse(ctx, panX, panY + 1 * sc, 9 * sc, 2.6 * sc, 0, "#232a5e");
    ellipse(ctx, panX, panY, 8 * sc, 1.8 * sc, 0, "#3d4590");
    const cake = (x: number, y: number, rot: number, r: number) => {
      if (Number.isNaN(x)) return;
      const ry = Math.max(0.6, Math.abs(Math.cos(rot)) * 2.6) * (r / 7);
      ellipse(ctx, x, y, r, ry + 0.9 * s, 0, "#c9773a");
      ellipse(ctx, x, y - 0.6 * s, r * 0.96, ry, 0, Math.cos(rot) > 0 ? "#ffcf8a" : "#e8a25c");
      if (Math.cos(rot) > 0) ellipse(ctx, x + r * 0.2, y - 0.8 * s, r * 0.25, ry * 0.3, 0, "rgba(255,255,255,0.35)");
    };
    // counter front
    fillRR(ctx, -10, counterY, w + 20, 4 * s, 1.5 * s, "#ffd9b8");
    // plate and stack
    ellipse(ctx, X(-36), Y(19), 11 * s, 2.6 * s, 0, "#eef0ff");
    for (let i = 0; i < plated; i++) cake(X(-36), Y(17.6 - i * 2.2), 0, 8 * s);
    cake(px, py, prot, 7 * sc);
    if (surprised) for (let i = 0; i < 3; i++) sparkle(ctx, headX + Math.cos(t * 4 + i * 2.1) * 12 * sc, headY - 6 * sc + Math.sin(t * 4 + i * 2.1) * 3 * sc, 1.6 * s, C.cream);
    loopFade(ctx, w, h, t, 9, 0.3);
  },
};

const drones: VideoDef = {
  id: "drone-race", title: "Drone race finals, neon track", channel: "Prop Wash", views: "1.7M views", durationLabel: "4:44", loop: 4, thumbT: 1.1,
  draw(ctx, w, h, t) {
    const hz = h * 0.44, f = Math.min(w, h) * 0.9;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.sin(t * Math.PI * 0.5) * 0.06);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = lin(ctx, 0, -h * 0.1, 0, hz, [[0, "#141a33"], [1, "#3a2f7a"]]);
    ctx.fillRect(-w * 0.2, -h * 0.2, w * 1.4, hz + h * 0.2);
    glow(ctx, w / 2, hz, w * 0.6, C.pink, 0.25);
    // distant mesas
    for (let i = 0; i < 9; i++) {
      const mx = (i / 8) * w * 1.3 - w * 0.15, mh = (0.04 + hash(i) * 0.08) * h;
      fillRR(ctx, mx - w * 0.08, hz - mh, w * 0.16, mh + 4, 6, "#231f55");
    }
    ctx.fillStyle = "#141a33";
    ctx.fillRect(-w * 0.2, hz, w * 1.4, h * 1.2);
    // ground grid
    const camH = 1.6;
    for (let i = -10; i <= 10; i++) {
      const x0 = w / 2 + (i * 2.2 * f) / 1.2, x1 = w / 2 + (i * 2.2 * f) / 60;
      ctx.beginPath(); ctx.moveTo(x0, hz + (camH * f) / 1.2); ctx.lineTo(x1, hz + (camH * f) / 60);
      ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(C.lilac, 0.18); ctx.stroke();
    }
    const V = 25;
    for (let k = 0; k < 20; k++) {
      const z = 2.5 * 20 - ((t * V + k * 2.5) % 50);
      if (z < 0.8) continue;
      const y = hz + (camH * f) / z;
      ctx.fillStyle = withAlpha(C.lilac, Math.min(0.3, 3 / z));
      ctx.fillRect(-w * 0.2, y, w * 1.4, Math.max(0.6, 6 / z));
    }
    // gates
    const N = 10, Zs = 10;
    const gates: { z: number; i: number }[] = [];
    for (let i = 0; i < N; i++) gates.push({ i, z: ((i * Zs - t * V) % (N * Zs) + N * Zs) % (N * Zs) });
    gates.sort((a, b) => b.z - a.z);
    for (const g of gates) {
      if (g.z < 0.6) continue;
      const sc = f / g.z;
      const gx = Math.sin(g.i * 1.7) * 2.2, gy = 1.2 + Math.cos(g.i * 1.3) * 0.6;
      const cx = w / 2 + gx * sc, cy = hz + (camH - gy) * sc;
      const gw = 4.4 * sc, gh = 3 * sc, th = 0.45 * sc;
      const col = [C.orange, C.mint, C.pink, C.sky][g.i % 4];
      const fade = clamp(g.z < 3 ? (g.z - 0.6) / 2.4 : (100 - g.z) / 30);
      glow(ctx, cx, cy, gw * 0.9, col, 0.22 * fade);
      ctx.beginPath();
      ctx.roundRect(cx - gw / 2, cy - gh / 2, gw, gh, th * 1.4);
      ctx.roundRect(cx - gw / 2 + th, cy - gh / 2 + th, gw - th * 2, gh - th * 2, th);
      ctx.fillStyle = withAlpha(col, 0.95 * fade);
      ctx.fill("evenodd");
      // posts to the ground
      ctx.fillStyle = withAlpha("#2e3577", fade);
      ctx.fillRect(cx - gw / 2 + th * 0.3, cy + gh / 2, th * 0.4, hz + camH * sc - (cy + gh / 2));
      ctx.fillRect(cx + gw / 2 - th * 0.7, cy + gh / 2, th * 0.4, hz + camH * sc - (cy + gh / 2));
    }
    // rival drone ahead
    const rz = 5.5 + Math.sin(t * Math.PI) * 0.8;
    const rs = f / rz, rx = w / 2 + Math.sin(t * Math.PI * 0.5 * 2) * 1.2 * rs, ry = hz + (camH - 1.3 - Math.cos(t * Math.PI) * 0.3) * rs;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(Math.cos(t * Math.PI) * 0.25);
    const d = rs * 0.12;
    for (const sx of [-1, 1]) {
      limb(ctx, [[0, 0], [sx * 3 * d, -1.2 * d]], d * 0.6, "#3d4590");
      ellipse(ctx, sx * 3 * d, -1.6 * d, 2.4 * d, 0.45 * d, 0, withAlpha(C.cream, 0.6));
    }
    fillRR(ctx, -2 * d, -1.2 * d, 4 * d, 2.4 * d, d, C.orange);
    circle(ctx, -1.6 * d, 0, 0.5 * d, Math.sin(t * 20) > 0 ? C.pink : withAlpha(C.pink, 0.3));
    ctx.restore();
    // speed streaks
    for (let i = 0; i < 14; i++) {
      const a = hash(i) * Math.PI * 2, ph2 = (t * 2 + hash(i + 9)) % 1;
      const r0 = (0.25 + ph2 * 0.9) * Math.max(w, h) * 0.6, r1 = r0 + 18 + ph2 * 30;
      limb(ctx, [[w / 2 + Math.cos(a) * r0, hz + Math.sin(a) * r0 * 0.7], [w / 2 + Math.cos(a) * r1, hz + Math.sin(a) * r1 * 0.7]], 1.2, withAlpha(C.cream, 0.18 * ph2));
    }
    ctx.restore();
  },
};

const catVac: VideoDef = {
  id: "cat-vacuum", title: "Cat vs. robot vacuum, final round", channel: "Whisker Lab", views: "5.2M views", durationLabel: "2:03", loop: 8, thumbT: 4.0,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    const floorY = Y(26);
    room(ctx, w, h, floorY, "#2e3577", "#3d4590", "#252d5c", "#1b2246");
    // sofa and lamp
    fillRR(ctx, X(-70), Y(-6), 50 * s, 26 * s, 8 * s, "#5a3f8a");
    fillRR(ctx, X(-74), Y(4), 58 * s, 22 * s, 7 * s, "#6b4c9e");
    fillRR(ctx, X(-66), Y(0), 18 * s, 10 * s, 4 * s, "#7d5cb4");
    limb(ctx, [[X(50), floorY], [X(50), Y(-30)]], 1.6 * s, "#4a54a8");
    poly(ctx, [[X(42), Y(-30)], [X(58), Y(-30)], [X(54), Y(-42)], [X(46), Y(-42)]], "#ffd9b8");
    glow(ctx, X(50), Y(-26), 30 * s, C.orange, 0.25);
    // vacuum path
    let vx: number;
    if (t < 2.2) vx = lerp(80, 14, easeOut(t / 2.2));
    else if (t < 2.8) vx = 14;
    else if (t < 5) vx = lerp(14, -40, easeInOut(seg(t, 2.8, 5)));
    else vx = lerp(-40, 100, easeIn(seg(t, 5.2, 7.6)));
    const vy = floorY;
    vacuum(ctx, X(vx), vy, s, t);
    // cat: sits, crouches, jumps aboard, rides it
    const jump = seg(t, 2.2, 2.8);
    const riding = t >= 2.8;
    let cx = -12, cy = 26, crouch = 0, dir = 1, stretch = 1;
    if (t < 2.2) { crouch = smooth(seg(t, 1.4, 2.1)) * 0.8; }
    else if (!riding) {
      cx = lerp(-12, 14, jump); cy = lerp(26, 17.5, jump) - Math.sin(jump * Math.PI) * 18;
      stretch = 1 + Math.sin(jump * Math.PI) * 0.25;
    } else { cx = vx; cy = 17.5; dir = t < 5.1 ? -1 : 1; }
    cat(ctx, X(cx), Y(cy), s * 1.15, { crouch, dir, stretch, look: t < 2.2 ? 1 : 0, smug: riding, tail: t * 3 });
    if (riding && t > 3.2) for (let i = 0; i < 3; i++) {
      const p = (t * 1.2 + i / 3) % 1;
      circle(ctx, X(vx - (dir * -1) * (16 + p * 18)), vy - (2 + p * 4) * s, (1 + p * 2.5) * s, withAlpha(C.cream, 0.25 * (1 - p)));
    }
    loopFade(ctx, w, h, t, 8, 0.35);
  },
};

const servers: VideoDef = {
  id: "server-tour", title: "Server room tour at 3 a.m.", channel: "Rack Life", views: "420K views", durationLabel: "18:22", loop: 5, thumbT: 0.6,
  draw(ctx, w, h, t) {
    const cx = w / 2, cy = h * 0.47, f = Math.min(w, h) * 0.8;
    const W = 1.6, Hc = 1.3, Hf = 1.1;
    const P = (x: number, y: number, z: number) => [cx + (x * f) / z, cy + (y * f) / z] as [number, number];
    ctx.fillStyle = "#0e1233"; ctx.fillRect(0, 0, w, h);
    // floor and ceiling
    poly(ctx, [P(-W, Hf, 0.3), P(W, Hf, 0.3), P(W, Hf, 30), P(-W, Hf, 30)], lin(ctx, 0, cy, 0, h, [[0, "#141a33"], [1, "#2e3577"]]));
    poly(ctx, [P(-W, -Hc, 0.3), P(W, -Hc, 0.3), P(W, -Hc, 30), P(-W, -Hc, 30)], lin(ctx, 0, cy, 0, 0, [[0, "#0e1233"], [1, "#1b2246"]]));
    const D = 2, V = 4, N = 10;
    const items: { z: number; i: number }[] = [];
    for (let i = 0; i < N; i++) items.push({ i, z: ((i * D - t * V) % (N * D) + N * D) % (N * D) + 0.35 });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      const z0 = it.z, z1 = it.z + D * 0.92;
      const fog = clamp(1 - z0 / 20);
      // floor tile seam and ceiling light
      poly(ctx, [P(-W, Hf, z0), P(W, Hf, z0), P(W, Hf, z0 + 0.06), P(-W, Hf, z0 + 0.06)], withAlpha(C.lilac, 0.18 * fog));
      poly(ctx, [P(-0.25, -Hc, z0 + 0.3), P(0.25, -Hc, z0 + 0.3), P(0.25, -Hc, z0 + 1.2), P(-0.25, -Hc, z0 + 1.2)], withAlpha(C.cream, 0.6 * fog));
      for (const side of [-1, 1]) {
        const x = side * W;
        poly(ctx, [P(x, -Hc * 0.95, z0), P(x, -Hc * 0.95, z1), P(x, Hf, z1), P(x, Hf, z0)], mix("#0e1233", side < 0 ? "#2b3270" : "#252d5c", fog));
        // LEDs
        for (let r = 0; r < 9; r++) {
          const y = -Hc * 0.85 + r * ((Hc * 0.85 + Hf * 0.9) / 9);
          for (let c = 0; c < 4; c++) {
            const zz = z0 + 0.2 + c * 0.12;
            const on = Math.sin(t * (2 + ((it.i + r + c) % 4)) * Math.PI * 0.5 + hash(it.i * 31 + r * 7 + c) * 6.28) > 0.2;
            const [lx, ly] = P(x, y, zz);
            const col = c === 3 ? C.orange : r % 3 ? C.mint : C.sky;
            circle(ctx, lx, ly, Math.max(0.5, (0.025 * f) / zz), withAlpha(col, (on ? 0.95 : 0.15) * fog));
          }
          const [ax, ay] = P(x, y + 0.04, z0 + 0.8), [bx] = P(x, y + 0.04, z1 - 0.1);
          ctx.fillStyle = withAlpha("#ffffff", 0.05 * fog);
          ctx.fillRect(Math.min(ax, bx), ay, Math.abs(bx - ax), Math.max(0.5, (0.02 * f) / z0));
        }
      }
    }
    // cool fog toward the end of the aisle
    ctx.fillStyle = rad(ctx, cx, cy, Math.min(w, h) * 0.3, [[0, withAlpha(C.sky, 0.25)], [1, withAlpha(C.sky, 0)]]);
    ctx.fillRect(0, 0, w, h);
  },
};

const laundry: VideoDef = {
  id: "laundry", title: "Robot tries to fold a T-shirt", channel: "Home Unit", views: "2.9M views", durationLabel: "1:36", loop: 7, thumbT: 5.2,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    const tableY = Y(14);
    room(ctx, w, h, tableY, "#2e3577", "#3a4392", "#5a3f8a", "#3a2f7a");
    fillRR(ctx, X(-58), Y(-46), 18 * s, 22 * s, 3 * s, withAlpha(C.cream, 0.12));
    const crumple = easeInOut(seg(t, 3.6, 4.3));
    const confused = t > 4.3 && t < 6.4;
    const sc = s * 1.15;
    const reachL = seg(t, 0.9, 1.3) * (1 - seg(t, 1.8, 2.1)), reachR = seg(t, 1.9, 2.3) * (1 - seg(t, 2.8, 3.1));
    drawBot(ctx, X(0), Y(22), sc, {
      body: C.mint, eye: C.cream, armL: 0.5 + reachL * 0.9 + (confused ? 1.8 : 0), elbowL: confused ? 1.6 : 0.6, armR: 0.5 + reachR * 0.9 + seg(t, 3.2, 3.6) * 0.6, elbowR: 0.6,
      tilt: confused ? 0.25 + Math.sin(t * 2) * 0.05 : 0.08, look: confused ? -0.4 : 0, eyes: confused ? "wide" : "open",
    });
    // table
    fillRR(ctx, -10, tableY, w + 20, 3.5 * s, 1.5 * s, "#ffd9b8");
    ctx.fillStyle = "#e9874f"; ctx.fillRect(-10, tableY + 3.5 * s, w + 20, h);
    // shirt on the table, seen from above-front
    const sx = X(0), sy = Y(6);
    if (crumple < 1) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(1 - crumple * 0.7, 1 - crumple * 0.7);
      const half = 1 - easeInOut(seg(t, 3.0, 3.6)) * 0.9;
      const col = C.pink, dk = shade(C.pink, -0.18);
      // sleeves fold in, one after another
      for (const side of [-1, 1]) {
        const fold = easeInOut(side < 0 ? seg(t, 1.1, 1.7) : seg(t, 2.1, 2.7));
        ctx.save();
        ctx.translate(side * 11 * s, -6 * s * half);
        ctx.scale(side * (1 - fold * 2), 1);
        poly(ctx, [[0, -3 * s], [10 * s, 1 * s], [7 * s, 8 * s], [0, 6 * s]], fold > 0.5 ? dk : col);
        ctx.restore();
      }
      rr(ctx, -11 * s, -9 * s * half, 22 * s, 22 * s * half, 3 * s);
      ctx.fillStyle = lin(ctx, 0, -9 * s, 0, 13 * s, [[0, shade(col, 0.1)], [1, col]]);
      ctx.fill();
      ellipse(ctx, 0, -9 * s * half, 4 * s, 2.2 * s * half, 0, dk);
      ctx.restore();
    }
    if (crumple > 0) {
      const r = 9 * s * crumple;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const rr2 = r * (1 + 0.14 * Math.sin(a * 5 + 1) + 0.08 * Math.sin(a * 9));
        const px = sx + Math.cos(a) * rr2, py = sy + 2 * s + Math.sin(a) * rr2 * 0.8;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.fillStyle = lin(ctx, 0, sy - r, 0, sy + r, [[0, shade(C.pink, 0.1)], [1, shade(C.pink, -0.2)]]);
      ctx.fill();
      for (let i = 0; i < 4; i++) ellipse(ctx, sx + Math.cos(i * 1.7) * r * 0.5, sy + 2 * s + Math.sin(i * 2.3) * r * 0.4, r * 0.25, r * 0.08, i, withAlpha(shade(C.pink, -0.35), 0.6));
    }
    if (confused) {
      const p = backOut(seg(t, 4.3, 4.7));
      text(ctx, "?", X(16), Y(-36) - Math.sin(t * 3) * 1.5 * s, 14 * s * p, C.cream, { weight: 700 });
    }
    loopFade(ctx, w, h, t, 7, 0.35);
  },
};

const LINES: { who: 0 | 1; text: string }[] = [
  { who: 0, text: "Tabs." },
  { who: 1, text: "Spaces." },
  { who: 0, text: "Tabs are one character." },
  { who: 1, text: "Spaces look the same everywhere." },
  { who: 0, text: "Source?" },
  { who: 1, text: "Trust me." },
  { who: 0, text: "I was trained on more code." },
  { who: 1, text: "I was trained on better code." },
];
const chat: VideoDef = {
  id: "chatbots", title: "Two chatbots argue about tabs and spaces", channel: "Prompt Fight", views: "760K views", durationLabel: "6:58", loop: 12.5, thumbT: 7.6,
  draw(ctx, w, h, t) {
    const { s } = core(w, h, 0.5);
    ctx.fillStyle = lin(ctx, 0, 0, w, h, [[0, "#1b2246"], [1, "#252d5c"]]);
    ctx.fillRect(0, 0, w, h);
    const per = 1.45, start = 0.4;
    const shown = Math.min(LINES.length, Math.max(0, Math.floor((t - start) / per) + 1));
    const local = (t - start) % per;
    const fs = Math.max(6.5, 4.4 * s);
    ctx.font = `500 ${fs}px "Lexend Variable", system-ui, sans-serif`;
    const maxW = w * 0.56;
    const botY = h - 6 * s;
    const bubbleBottom = botY - 30 * s;
    // layout bubbles bottom-up
    const items: { who: number; lines: string[]; bh: number; bw: number; age: number }[] = [];
    for (let i = 0; i < shown; i++) {
      ctx.font = `500 ${fs}px "Lexend Variable", system-ui, sans-serif`;
      const lines = wrap(ctx, LINES[i].text, maxW - fs * 1.6);
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + fs * 1.6;
      const bh = lines.length * fs * 1.35 + fs * 1.1;
      items.push({ who: LINES[i].who, lines, bh, bw, age: i === shown - 1 ? local : 9 });
    }
    let y = bubbleBottom;
    const typing = shown < LINES.length && local > per - 0.55 && t > start;
    if (typing) y -= fs * 2.6;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const p = backOut(clamp(it.age / 0.35), 1.6);
      const left = it.who === 0;
      const x = left ? w * 0.06 : w * 0.94 - it.bw;
      const top = y - it.bh;
      if (top + it.bh < 0) break;
      ctx.save();
      ctx.translate(left ? x : x + it.bw, y);
      ctx.scale(p, p);
      ctx.translate(-(left ? x : x + it.bw), -y);
      fillRR(ctx, x, top, it.bw, it.bh, fs * 0.9, left ? "#3d4590" : C.orange);
      it.lines.forEach((l, k) => text(ctx, l, x + fs * 0.8, top + fs * 0.55 + fs * 0.68 + k * fs * 1.35, fs, left ? C.ink : "#2a1407", { align: "left", weight: 500 }));
      ctx.restore();
      y = top - fs * 0.7;
    }
    if (typing) {
      const who = LINES[shown].who;
      const x = who === 0 ? w * 0.06 : w * 0.94 - fs * 4;
      fillRR(ctx, x, bubbleBottom - fs * 2.1, fs * 4, fs * 2.1, fs * 0.9, who === 0 ? "#3d4590" : C.orange);
      for (let k = 0; k < 3; k++) circle(ctx, x + fs * (1.1 + k * 0.9), bubbleBottom - fs * 1.05 - Math.max(0, Math.sin(t * 9 - k)) * fs * 0.25, fs * 0.22, who === 0 ? C.ink : "#2a1407");
    }
    // the two bots at the bottom
    const heated = shown >= 4;
    const talkL = items.length && items[items.length - 1].who === 0 && local < 0.6;
    const talkR = items.length && items[items.length - 1].who === 1 && local < 0.6;
    ctx.fillStyle = "#141a33"; ctx.fillRect(0, botY, w, h - botY);
    drawBot(ctx, w * 0.2, botY, s * 0.7, { body: C.sky, eye: C.cream, eyes: heated ? "angry" : "open", look: 1, lean: talkL ? 0.12 : 0, armR: talkL ? 1.6 : 0.4, elbowR: talkL ? 0.9 : 0.2 });
    drawBot(ctx, w * 0.8, botY, s * 0.7, { body: C.orange, eyes: heated ? "angry" : "open", look: -1, lean: talkR ? -0.12 : 0, armL: talkR ? 1.6 : 0.4, elbowL: talkR ? 0.9 : 0.2 });
    loopFade(ctx, w, h, t, 12.5, 0.4);
  },
};

const baby: VideoDef = {
  id: "first-steps", title: "Tiny robot learns to walk", channel: "Little Servo", views: "6.3M views", durationLabel: "0:59", loop: 7, thumbT: 3.75,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.52);
    const floorY = Y(24);
    room(ctx, w, h, floorY, "#3a3f99", "#4a4fb0", "#2e3577", "#1b2246");
    ellipse(ctx, X(0), floorY + 6 * s, 60 * s, 7 * s, 0, "#5a3f8a");
    // toy blocks
    const blocks: [number, string, string][] = [[-46, C.pink, "A"], [-36, C.sky, "B"], [-41, C.mint, "C"]];
    blocks.forEach(([bx, col, l], i) => {
      const by = i === 2 ? floorY - 18 * s : floorY - 9 * s;
      fillRR(ctx, X(bx), by, 9 * s, 9 * s, 2 * s, col);
      text(ctx, l, X(bx + 4.5), by + 4.7 * s, 5.5 * s, withAlpha("#141a33", 0.7), { weight: 700 });
    });
    // walk, wobble, fall, get up, cheer
    const walk = seg(t, 0.3, 3.1);
    const x = lerp(-28, 10, walk);
    const cyc = walk * 7 * Math.PI;
    const wob = Math.sin(t * 7) * 0.12 * walk;
    const fall = easeIn(seg(t, 3.1, 3.55));
    const up = easeInOut(seg(t, 4.7, 5.6));
    const ang = fall * 1.45 * (1 - up);
    const cheer = seg(t, 5.7, 6.0);
    const sc = s * 0.9;
    const walking = t < 3.1;
    const footX = X(x) + 5 * sc;
    ctx.save();
    ctx.translate(footX, floorY);
    ctx.rotate(ang + (walking ? wob : 0));
    ctx.translate(-footX, -floorY);
    const lying = fall > 0.95 && up < 0.1;
    drawBot(ctx, X(x), floorY - (walking ? Math.abs(Math.sin(cyc)) * 1.2 * s : 0), sc, {
      body: C.cream, eye: C.sky, antenna: true,
      legL: walking ? Math.sin(cyc) * 0.5 : 0, legR: walking ? -Math.sin(cyc) * 0.5 : 0,
      kneeL: walking ? Math.max(0, Math.sin(cyc)) * 0.6 : 0, kneeR: walking ? Math.max(0, -Math.sin(cyc)) * 0.6 : 0,
      armL: walking ? 0.9 + Math.sin(cyc * 0.5) * 0.6 : fall > 0 && fall < 1 ? 2.4 : 0.3 + cheer * 2.4,
      armR: walking ? 0.9 - Math.sin(cyc * 0.5) * 0.6 : fall > 0 && fall < 1 ? 2.4 : 0.3 + cheer * 2.4,
      eyes: lying ? "dizzy" : cheer > 0 ? "happy" : fall > 0 && up < 1 ? "wide" : "open",
      tilt: walking ? -wob : 0, blush: cheer > 0,
    });
    ctx.restore();
    if (lying || (fall > 0.9 && up < 0.6)) {
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + i * 2.1;
        sparkle(ctx, footX + 30 * sc + Math.cos(a) * 9 * s, floorY - 10 * s + Math.sin(a) * 3 * s, 2 * s, C.orange);
      }
    }
    if (cheer > 0) for (let i = 0; i < 5; i++) sparkle(ctx, X(x) + Math.cos(i * 1.25 + t) * 22 * s, floorY - 30 * s + Math.sin(i * 1.25 + t) * 12 * s, (1.4 + Math.sin(t * 8 + i)) * s, C.cream);
    loopFade(ctx, w, h, t, 7, 0.35);
  },
};

const arm: VideoDef = {
  id: "block-stack", title: "Robot arm stacks blocks perfectly (almost)", channel: "Pick and Place", views: "1.3M views", durationLabel: "3:47", loop: 9, thumbT: 7.4,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.52);
    const floorY = Y(26);
    room(ctx, w, h, floorY, "#1b2246", "#2e3577", "#3d4590", "#252d5c");
    const cyc = Math.floor(t / 2.25), ct = t % 2.25;
    const cols = [C.orange, C.sky, C.mint, C.pink];
    const bs = 12 * s;
    const stackX = X(18), pileX = X(-30);
    // picked block travels from the pile to the top of the stack
    const go = easeInOut(seg(ct, 0.4, 1.4)), down = seg(ct, 1.4, 1.7);
    const topY = floorY - cyc * bs;
    const wobble = cyc === 3 ? seg(ct, 1.7, 2.25) : 0;
    const bx = lerp(pileX, stackX, go), by = lerp(floorY - bs, topY - bs, go) - Math.sin(go * Math.PI) * 26 * s + down * 0;
    // base
    fillRR(ctx, X(-2) - 9 * s, floorY - 5 * s, 18 * s, 5 * s, 2 * s, "#4a54a8");
    for (let i = 0; i < cyc; i++) {
      const tilt = wobble * Math.sin(ct * 18) * 0.08 * (i / 3);
      ctx.save();
      ctx.translate(stackX, floorY - i * bs);
      ctx.rotate(tilt);
      fillRR(ctx, -bs / 2 + (i === 2 ? 1.5 * s : 0), -bs, bs, bs, 2.5 * s, cols[i]);
      fillRR(ctx, -bs / 2 + 2 * s, -bs + 2 * s, bs * 0.4, 2 * s, 1 * s, "rgba(255,255,255,0.25)");
      ctx.restore();
    }
    for (let i = cyc + 1; i < 4; i++) fillRR(ctx, pileX - bs / 2 + (i - cyc - 1) * (bs + 2 * s) - bs, floorY - bs, bs, bs, 2.5 * s, cols[i]);
    if (cyc < 3 || ct < 1.7) fillRR(ctx, bx - bs / 2 - (go < 0.01 ? bs : 0), by, bs, bs, 2.5 * s, cols[cyc]);
    else {
      // last block slides off and tumbles
      const f = seg(ct, 1.7, 2.25);
      ctx.save();
      ctx.translate(stackX + f * 26 * s, topY - bs + easeIn(f) * (cyc * bs) );
      ctx.rotate(f * 2.2);
      fillRR(ctx, -bs / 2, 0, bs, bs, 2.5 * s, cols[3]);
      ctx.restore();
    }
    // two-link arm from the base to the gripper
    const gx = cyc < 3 || ct < 1.7 ? bx - (go < 0.01 ? bs : 0) : stackX, gy = (cyc < 3 || ct < 1.7 ? by : topY - bs) - 3 * s;
    const ox = X(-2), oy = floorY - 5 * s;
    const L1 = 34 * s, L2 = 32 * s;
    const dx = gx - ox, dy = gy - oy, dd = Math.min(L1 + L2 - 1, Math.hypot(dx, dy));
    const a0 = Math.atan2(dy, dx), cosB = (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd);
    const a1 = a0 - Math.acos(clamp(cosB, -1, 1));
    const ex = ox + Math.cos(a1) * L1, ey = oy + Math.sin(a1) * L1;
    limb(ctx, [[ox, oy], [ex, ey]], 6 * s, "#ffb27a");
    limb(ctx, [[ex, ey], [gx, gy]], 4.6 * s, C.orange);
    circle(ctx, ox, oy, 5 * s, "#e07a45");
    circle(ctx, ex, ey, 3.6 * s, "#e07a45");
    fillRR(ctx, gx - 5 * s, gy - 3 * s, 10 * s, 3.5 * s, 1.5 * s, "#3d4590");
    if (cyc === 3 && ct > 1.9) text(ctx, "Oops", X(30), Y(-38), 8 * s, C.cream, { weight: 650 });
    loopFade(ctx, w, h, t, 9, 0.3);
  },
};

export const VIDEOS: VideoDef[] = [dance, roomba, unbox, attention, pancakes, drones, catVac, servers, laundry, chat, baby, arm, ...PARODY_VIDEOS, ...DANCE_VIDEOS];

/** One still frame of a video with its duration in the corner. */
export function drawThumbnail(v: VideoDef, ctx: CanvasRenderingContext2D, w: number, h: number) {
  redrawCanvasOnLocale(ctx.canvas, () => drawThumbnail(v, ctx, w, h));
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  v.draw(ctx, w, h, v.thumbT ?? 2);
  ctx.restore();
  const fs = Math.max(8, Math.min(11, h * 0.1));
  const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
  g.addColorStop(0, "rgba(10,12,35,0)");
  g.addColorStop(1, "rgba(10,12,35,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  text(ctx, v.durationLabel, w - fs * 0.6, h - fs * 0.75, fs, "#ffffff", { align: "right", weight: 600 });
}

