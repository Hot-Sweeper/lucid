// Parody channels for BotTube: affectionate robot takes on well known tech and AI video genres.
// Names, faces and logos are all made up; only the general vibe (thumbnail style, set, energy) is borrowed.
import { C, type Ctx, circle, ellipse, fillRR, glow, lin, limb, loopFade, poly, rad, shade, text, withAlpha } from "./draw";
import type { VideoDef } from "./videos";
import { backOut, clamp, easeIn, easeInOut, easeOut, hash, lerp, seg, smooth } from "./util";
import { canvasText } from "../localization-canvas";

// --- time and layout ---------------------------------------------------------------
/** Loop-local time. The clock can read negative or NaN for a frame; never let that reach the drawing. */
const loopT = (t: number, L: number) => (Number.isFinite(t) ? Math.max(0, t) : 0) % L;
const talk = (t: number) => clamp(0.12 + Math.abs(Math.sin(t * 12.7) * Math.sin(t * 5.3 + 0.7)) * 1.15);
const blink = (t: number) => (t + 0.4) % 3.3 < 0.12;
const SANS = '"Lexend Variable", system-ui, sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

type Rect = { x: number; y: number; w: number; h: number };

/** Talking-head layout: a content panel beside (or above, on a phone) the host. */
function stage(w: number, h: number, side: 1 | -1 = 1, panelW = 0.52) {
  const s = Math.min(w, h) / 100;
  const portrait = h > w * 1.05;
  if (portrait) {
    return { s, portrait, panel: { x: w * 0.06, y: h * 0.09, w: w * 0.88, h: h * 0.4 } as Rect, hx: w * 0.5, hy: h + 4 * s, hs: s * 0.92 };
  }
  const px = side > 0 ? w * 0.045 : w * (0.955 - panelW);
  return { s, portrait, panel: { x: px, y: h * 0.12, w: w * panelW, h: h * 0.7 } as Rect, hx: side > 0 ? w * 0.79 : w * 0.21, hy: h + 6 * s, hs: s * 1.02 };
}

function fill(ctx: Ctx, w: number, h: number, a: string, b: string) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, a], [1, b]]);
  ctx.fillRect(0, 0, w, h);
}

function fitSize(ctx: Ctx, s: string, maxW: number, size: number, weight = 800, mono = false) {
  ctx.font = `${weight} ${size}px ${mono ? MONO : SANS}`;
  const m = ctx.measureText(s).width;
  return m > maxW ? (size * maxW) / m : size;
}

/** Heavy thumbnail-style text with a soft drop shadow (no outline). */
function big(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, o: { align?: CanvasTextAlign; maxW?: number; weight?: number; rot?: number; shadow?: string | null; mono?: boolean } = {}) {
  s = canvasText(s);
  const weight = o.weight ?? 800;
  const sz = o.maxW ? fitSize(ctx, s, o.maxW, size, weight, o.mono) : size;
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.shadow !== null) text(ctx, s, sz * 0.05, sz * 0.07, sz, o.shadow ?? "rgba(5,7,25,0.7)", { weight, align: o.align, mono: o.mono });
  text(ctx, s, 0, 0, sz, color, { weight, align: o.align, mono: o.mono });
  ctx.restore();
  return sz;
}

/** Word on a colored block, the classic thumbnail highlight. */
function tag(ctx: Ctx, s: string, x: number, y: number, size: number, bg: string, fg: string, o: { align?: CanvasTextAlign; maxW?: number; rot?: number } = {}) {
  s = canvasText(s);
  const sz = o.maxW ? fitSize(ctx, s, o.maxW - size * 0.6, size) : size;
  ctx.font = `800 ${sz}px ${SANS}`;
  const tw = ctx.measureText(s).width, pad = sz * 0.3;
  const align = o.align ?? "left";
  const x0 = align === "left" ? 0 : align === "center" ? -tw / 2 - pad : -tw - pad * 2;
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  fillRR(ctx, x0 + sz * 0.06, -sz * 0.62 + sz * 0.08, tw + pad * 2, sz * 1.24, sz * 0.18, "rgba(5,7,25,0.55)");
  fillRR(ctx, x0, -sz * 0.62, tw + pad * 2, sz * 1.24, sz * 0.18, bg);
  text(ctx, s, x0 + pad, sz * 0.03, sz, fg, { weight: 800, align: "left" });
  ctx.restore();
  return { w: tw + pad * 2, size: sz };
}

/** A fat arrow from (x0, y0) to (x1, y1). */
function arrow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, wd: number, color: string) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 1) return;
  const hl = Math.min(L * 0.5, wd * 2.1);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(a);
  const pts: [number, number][] = [[0, -wd / 2], [L - hl, -wd / 2], [L - hl, -wd * 1.3], [L, 0], [L - hl, wd * 1.3], [L - hl, wd / 2], [0, wd / 2]];
  ctx.translate(wd * 0.12, wd * 0.18);
  poly(ctx, pts, "rgba(5,7,25,0.5)");
  ctx.translate(-wd * 0.12, -wd * 0.18);
  poly(ctx, pts, color);
  ctx.restore();
}

function star(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const i = r * 0.28;
  poly(ctx, [[x, y - r], [x + i, y - i], [x + r, y], [x + i, y + i], [x, y + r], [x - i, y + i], [x - r, y], [x - i, y - i]], color);
}

/** Show the thumbnail-style cold open, then cross into the episode. */
function hooked(ctx: Ctx, lt: number, dur: number, hook: () => void, scene: () => void) {
  if (lt < dur - 0.28) { hook(); return; }
  scene();
  const a = 1 - seg(lt, dur - 0.28, dur);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  hook();
  ctx.restore();
}

// --- the robot host, from the waist up ----------------------------------------------
type Eyes = "open" | "wide" | "happy" | "closed" | "angry" | "shock" | "half";
interface Host {
  body: string; visor?: string; eye?: string;
  outfit?: "tee" | "hoodie" | "suit" | "coat" | "shirt"; cloth?: string; inner?: string; tie?: string;
  eyes?: Eyes; mouth?: number; shape?: "bar" | "smile" | "o"; look?: number; tilt?: number; lean?: number;
  /** Hand targets in host units: origin at the bottom of the torso, about 90 units to the antenna tip. */
  handL?: [number, number]; handR?: [number, number]; pointL?: boolean; pointR?: boolean; mug?: boolean;
  stache?: string; glasses?: boolean; hair?: string; curls?: string; earring?: boolean; headset?: boolean; phones?: string; beanie?: string; blush?: boolean;
  head?: "box" | "toaster" | "puck"; toast?: number; antenna?: boolean;
}

function bust(ctx: Ctx, x: number, y: number, s: number, p: Host) {
  const body = p.body, dark = shade(body, -0.38), lite = shade(body, 0.25);
  const cloth = p.cloth ?? "#2a2f66";
  const eye = p.eye ?? C.mint, visor = p.visor ?? "#141a33";
  const head = p.head ?? "box";
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(p.lean ?? 0);
  if (p.outfit === "hoodie") ellipse(ctx, 0, -37, 25, 9, 0, shade(cloth, -0.28));
  fillRR(ctx, -6, -50, 12, 16, 3, dark);
  // torso and outfit
  fillRR(ctx, -28, -38, 56, 54, 15, lin(ctx, 0, -38, 0, 16, [[0, shade(cloth, 0.12)], [1, shade(cloth, -0.12)]]));
  if (p.outfit === "hoodie") {
    limb(ctx, [[-6, -34], [-7, -19]], 1.7, C.cream);
    limb(ctx, [[6, -34], [7, -19]], 1.7, C.cream);
    fillRR(ctx, -16, -11, 32, 15, 6, shade(cloth, -0.14));
  } else if (p.outfit === "suit") {
    poly(ctx, [[-10, -38], [10, -38], [0, -6]], "#e9ecf8");
    const tie = p.tie ?? "#0b0c14";
    poly(ctx, [[-2.6, -35], [2.6, -35], [3.8, -15], [0, -9], [-3.8, -15]], tie);
    fillRR(ctx, -3.2, -38.5, 6.4, 4.5, 1.6, shade(tie, 0.08));
    const lap = shade(cloth, 0.12);
    poly(ctx, [[-10, -38], [-18, -31], [-12, -26], [-1.5, -6]], lap);
    poly(ctx, [[10, -38], [18, -31], [12, -26], [1.5, -6]], lap);
  } else if (p.outfit === "shirt") {
    // a collared shirt, top button open: undershirt in the gap, two collar flaps, a row of buttons
    poly(ctx, [[-9, -38], [9, -38], [0, -15]], p.inner ?? "#23232b");
    const flap = shade(cloth, 0.1);
    poly(ctx, [[-10, -38.5], [-18, -31], [-12, -25.5], [-1.2, -13]], flap);
    poly(ctx, [[10, -38.5], [18, -31], [12, -25.5], [1.2, -13]], flap);
    for (const by of [-9, -1.5, 6]) circle(ctx, 0, by, 1.1, shade(cloth, -0.22));
  } else if (p.outfit === "coat") {
    poly(ctx, [[-10, -38], [10, -38], [0, -12]], p.inner ?? C.pink);
    const lap = shade(cloth, -0.08);
    poly(ctx, [[-10, -38], [-17, -30], [-11, -25], [-1, -8]], lap);
    poly(ctx, [[10, -38], [17, -30], [11, -25], [1, -8]], lap);
    fillRR(ctx, 11, -19, 11, 10, 2.5, shade(cloth, -0.1));
    fillRR(ctx, 13.5, -24, 2.2, 7, 1, C.sky);
    fillRR(ctx, 17, -23, 2.2, 6, 1, C.pink);
  } else {
    ellipse(ctx, 0, -37, 9, 3.4, 0, shade(cloth, -0.32));
  }

  // head
  ctx.save();
  ctx.translate(0, -47);
  ctx.rotate(p.tilt ?? 0);
  let ey = -27, ex = 9, vis: Rect = { x: -20, y: -37, w: 40, h: 28 };
  if (head === "toaster") {
    const pop = clamp(p.toast ?? 0);
    for (const sx of [-15, 5]) fillRR(ctx, sx, -48 - pop * 11, 10, 12, 3.5, lin(ctx, 0, -60, 0, -44, [[0, "#f0b878"], [1, "#c98a4b"]]));
    fillRR(ctx, -27, -46, 54, 45, 10, lin(ctx, -27, -46, 27, 0, [[0, shade(body, 0.32)], [1, body]]));
    for (const sx of [-16, 4]) fillRR(ctx, sx, -47, 12, 4, 2, shade(body, -0.5));
    fillRR(ctx, 26, -30, 6, 3.4, 1.5, dark);
    vis = { x: -20, y: -36, w: 40, h: 27 };
    ey = -26;
  } else if (head === "puck") {
    ellipse(ctx, 0, -18, 33, 16, 0, lin(ctx, 0, -34, 0, -2, [[0, lite], [1, body]]));
    vis = { x: -24, y: -27, w: 48, h: 15 };
    ey = -20; ex = 11;
  } else {
    if (p.antenna !== false) {
      limb(ctx, [[8, -41], [12, -51]], 2.2, dark);
      circle(ctx, 12.5, -52, 3.3, C.pink);
    }
    fillRR(ctx, -25, -42, 50, 40, 14, lin(ctx, -25, -42, 25, 0, [[0, lite], [1, body]]));
  }
  fillRR(ctx, vis.x, vis.y, vis.w, vis.h, Math.min(10, vis.h / 2), visor);
  const lk = (p.look ?? 0) * 3;
  const eyes = p.eyes ?? "open";
  for (const sx of [-ex, ex]) {
    const cx = sx + lk;
    if (eyes === "open" || eyes === "wide" || eyes === "half") {
      const r = eyes === "wide" ? 4.8 : 3.8;
      glow(ctx, cx, ey, r * 2.4, eye, 0.32);
      circle(ctx, cx, ey, r, eye);
      if (eyes === "half") fillRR(ctx, cx - 6, ey - 7, 12, 6.4, 2, visor);
    } else if (eyes === "shock") {
      glow(ctx, cx, ey, 12, eye, 0.4);
      circle(ctx, cx, ey, 5.6, eye);
      circle(ctx, cx, ey, 2.2, visor);
    } else if (eyes === "happy") {
      ctx.beginPath();
      ctx.arc(cx, ey + 2, 3.8, Math.PI * 1.12, Math.PI * 1.88);
      ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.strokeStyle = eye; ctx.stroke();
    } else if (eyes === "closed") {
      limb(ctx, [[cx - 3.5, ey], [cx + 3.5, ey]], 2.2, eye);
    } else {
      circle(ctx, cx, ey + 1, 3.3, C.pink);
      limb(ctx, [[cx - 4.5 * Math.sign(sx), ey - 5.5], [cx + 3.8 * Math.sign(sx), ey - 2.6]], 2.2, C.pink);
    }
  }
  if (p.glasses) {
    for (const sx of [-ex, ex]) {
      fillRR(ctx, sx - 7.5, ey - 6, 15, 11.5, 4.5, withAlpha("#ffffff", 0.13));
      fillRR(ctx, sx - 7.5, ey - 6.8, 15, 2.2, 1.1, withAlpha(C.cream, 0.85));
    }
    fillRR(ctx, -2.2, ey - 5.8, 4.4, 1.6, 0.8, withAlpha(C.cream, 0.85));
  }
  // mouth (and mustache)
  const my = ey + 13.5;
  const m = clamp(p.mouth ?? 0);
  const shape = p.shape ?? "bar";
  if (shape === "o") ellipse(ctx, lk * 0.5, my, 3 + m * 1.6, 2.4 + m * 2.2, 0, eye);
  else if (shape === "smile") {
    ctx.beginPath();
    ctx.arc(lk * 0.5, my - 4.5 - m * 1.5, 6 + m, Math.PI * 0.22, Math.PI * 0.78);
    ctx.lineWidth = 2.2 + m * 2.4; ctx.lineCap = "round"; ctx.strokeStyle = eye; ctx.stroke();
  } else {
    const mh = 1.8 + m * 4.6;
    fillRR(ctx, lk * 0.5 - 6, my - mh / 2, 12, mh, mh / 2, eye);
  }
  if (p.stache) {
    const sy = ey + 8.8;
    for (const sd of [-1, 1]) {
      ctx.save();
      ctx.translate(lk * 0.5 + sd * 6.4, sy);
      ctx.scale(sd, 1);
      ellipse(ctx, 0, 0, 8, 3.6, 0.1, p.stache);
      ellipse(ctx, 7.6, -2.4, 3.6, 2, -0.75, p.stache);
      ellipse(ctx, -1, -1.2, 5, 1.4, 0.1, shade(p.stache, 0.18));
      ctx.restore();
    }
  }
  if (p.blush) for (const sd of [-1, 1]) ellipse(ctx, sd * 16, ey + 12, 3.4, 1.8, 0, withAlpha(C.pink, 0.7));
  if (p.curls && head === "box") {
    // a dark mop: curls piled on top, a fringe that falls over the visor on one side
    const c = p.curls;
    ellipse(ctx, -19, -37, 10, 8.5, -0.4, shade(c, -0.1));
    ellipse(ctx, 19, -37, 10, 8.5, 0.4, shade(c, -0.1));
    ellipse(ctx, -9, -45, 13, 8, -0.2, c);
    ellipse(ctx, 8, -45.5, 14, 8, 0.15, c);
    ellipse(ctx, 0, -48, 11, 6, 0, shade(c, 0.08));
    ellipse(ctx, -8, -34.5, 11, 4.6, -0.28, c);
    ellipse(ctx, 6, -35.5, 9, 3.6, 0.2, shade(c, 0.06));
    for (const [cx, cy, r] of [[-14, -46, 3], [-2, -50, 3.4], [10, -48, 3.2], [20, -42, 2.8]] as const) circle(ctx, cx, cy, r, shade(c, 0.3));
  }
  if (p.earring) {
    ctx.beginPath(); ctx.arc(-24.4, -16, 2.2, 0, Math.PI * 2);
    ctx.lineWidth = 1.2; ctx.strokeStyle = "#dfe3f5"; ctx.stroke();
  }
  if (p.hair && head === "box") {
    ellipse(ctx, -15, -38, 9, 4.5, -0.4, shade(p.hair, -0.12));
    ellipse(ctx, -3, -41.5, 21, 7, -0.1, p.hair);
    ellipse(ctx, 10, -45, 12, 5.5, 0.5, p.hair);
    ellipse(ctx, -6, -44, 9, 2, -0.15, shade(p.hair, 0.25));
  }
  if (p.beanie) {
    fillRR(ctx, -26, -54, 52, 18, 9, p.beanie);
    fillRR(ctx, -27.5, -42, 55, 8, 3.5, shade(p.beanie, -0.16));
    circle(ctx, 0, -55, 4.4, shade(p.beanie, 0.22));
  }
  if (p.headset || p.phones) {
    const band = p.headset ? "#2a2f45" : shade(p.phones!, -0.3);
    ctx.beginPath();
    ctx.arc(0, -22, 29, Math.PI * 1.04, Math.PI * 1.96);
    ctx.lineWidth = 4.2; ctx.lineCap = "round"; ctx.strokeStyle = band; ctx.stroke();
    const cup = p.headset ? "#3a4060" : p.phones!;
    fillRR(ctx, -32, -31, 9, 18, 4, cup);
    fillRR(ctx, 23, -31, 9, 18, 4, cup);
    if (p.headset) {
      limb(ctx, [[-27, -15], [-23, -4], [-10, -6]], 2.4, band);
      circle(ctx, -8.5, -6, 3.2, "#4a5078");
    }
  }
  ctx.restore();

  // arms last so gestures sit in front of the face
  const arm = (side: number, hand: [number, number], point?: boolean, mug?: boolean) => {
    const sx = side * 24, sy = -30, L1 = 17, L2 = 16;
    let [hx, hy] = hand;
    let dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy);
    const maxd = L1 + L2 - 0.5;
    if (d > maxd) { hx = sx + (dx / d) * maxd; hy = sy + (dy / d) * maxd; dx = hx - sx; dy = hy - sy; d = maxd; }
    d = Math.max(d, 3);
    const a0 = Math.atan2(dy, dx);
    const b = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const e1: [number, number] = [sx + Math.cos(a0 + b) * L1, sy + Math.sin(a0 + b) * L1];
    const e2: [number, number] = [sx + Math.cos(a0 - b) * L1, sy + Math.sin(a0 - b) * L1];
    const [ex2, ey2] = e1[0] * side + e1[1] * 0.6 > e2[0] * side + e2[1] * 0.6 ? e1 : e2;
    limb(ctx, [[sx, sy], [ex2, ey2]], 9.5, p.outfit === "tee" ? shade(cloth, 0.05) : shade(cloth, -0.05));
    limb(ctx, [[ex2, ey2], [hx, hy]], 6.4, dark);
    if (mug) {
      fillRR(ctx, hx - 6, hy - 13, 12, 14, 3, C.cream);
      ctx.beginPath(); ctx.arc(hx + side * 6.5, hy - 6, 3.2, 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = C.cream; ctx.stroke();
      fillRR(ctx, hx - 4.5, hy - 12, 9, 2.5, 1.2, "#6b3f2a");
    }
    if (point) {
      const fa = Math.atan2(hy - ey2, hx - ex2);
      limb(ctx, [[hx, hy], [hx + Math.cos(fa) * 7.5, hy + Math.sin(fa) * 7.5]], 3.2, lite);
    }
    circle(ctx, hx, hy, 4.8, lite);
  };
  arm(-1, p.handL ?? [-31, 18], p.pointL);
  arm(1, p.handR ?? [31, 18], p.pointR, p.mug);
  ctx.restore();
}

/** Head-and-shoulders close-up: headCy is the screen y of the face center, headH its height in pixels. */
function face(ctx: Ctx, cx: number, headCy: number, headH: number, p: Host) {
  const k = headH / 42;
  bust(ctx, cx, headCy + 69 * k, k, p);
}

/** Screen point to host units, for aiming a hand at something on screen. */
const local = (hx: number, hy: number, hs: number, px: number, py: number): [number, number] => [(px - hx) / hs, (py - hy) / hs];

/**
 * Thumbnail frame shared by most channels, in the style of Theo's recent ones: a near black frame,
 * one big clean sentence (white, the last line in an accent), a screenshot-like prop, and a face
 * so large it is cut by the edge, eyes wide, a hand near the mouth. No tags, no arrows, no outlines.
 */
function thumbFrame(ctx: Ctx, w: number, h: number, lt: number, o: {
  bg: [string, string]; glowC: string; lines: [string, string]; tagBg: string; tagFg: string; host: Host;
  prop?: (x: number, y: number, size: number) => void; arrowC?: string; faceLeft?: boolean;
}) {
  const s = Math.min(w, h) / 100, P = h > w * 1.05;
  ctx.fillStyle = lin(ctx, 0, 0, w, h, [[0, "#131318"], [1, "#050507"]]);
  ctx.fillRect(0, 0, w, h);
  const settle = easeOut(seg(lt, 0.05, 0.5));
  if (P) {
    glow(ctx, w * 0.62, h * 0.8, w * 0.8, o.glowC, 0.2);
    big(ctx, o.lines[0], w * 0.07, h * 0.1, 19 * s, "#ffffff", { align: "left", maxW: w * 0.86, shadow: null });
    big(ctx, o.lines[1], w * 0.07, h * 0.2, 19 * s, o.tagBg, { align: "left", maxW: w * 0.86, shadow: null });
    o.prop?.(w * 0.3, h * 0.45, 40 * s);
    face(ctx, w * 0.66, h * 0.86, h * 0.34 * (0.97 + settle * 0.03), o.host);
    return;
  }
  const fx = o.faceLeft ? w * 0.22 : w * 0.79;
  glow(ctx, fx, h * 0.55, h * 0.75, o.glowC, 0.2);
  const tx = o.faceLeft ? w * 0.45 : w * 0.05;
  const t0 = big(ctx, o.lines[0], tx, h * 0.17, 21 * s, "#ffffff", { align: "left", maxW: w * 0.52, shadow: null });
  big(ctx, o.lines[1], tx, h * 0.17 + t0 * 1.12, 21 * s, o.tagBg, { align: "left", maxW: w * 0.5, shadow: null });
  o.prop?.(o.faceLeft ? w * 0.74 : w * 0.26, h * 0.7, 36 * s);
  face(ctx, fx, h * 0.58, h * 0.64 * (0.97 + settle * 0.03), o.host);
}

/** Dark card in the style of a quoted post (name, handle, one big sentence, a views line) beside a huge reacting face. */
function tweetThumb(ctx: Ctx, w: number, h: number, lt: number, o: { name: string; handle: string; lines: string[]; meta: string; glowC: string; host: Host }) {
  const s = Math.min(w, h) / 100, P = h > w * 1.05;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  const settle = easeOut(seg(lt, 0.05, 0.5));
  const cx = P ? w * 0.07 : w * 0.05, top = P ? h * 0.07 : h * 0.08, maxW = P ? w * 0.86 : w * 0.56;
  // header: avatar, name with a check, handle
  const ar = (P ? 5.6 : 6.4) * s, ax = cx + ar, ay = top + ar;
  circle(ctx, ax, ay, ar, C.orange);
  fillRR(ctx, ax - ar * 0.6, ay - ar * 0.32, ar * 1.2, ar * 0.62, ar * 0.25, "#141a33");
  circle(ctx, ax - ar * 0.26, ay - ar * 0.02, ar * 0.13, C.mint);
  circle(ctx, ax + ar * 0.26, ay - ar * 0.02, ar * 0.13, C.mint);
  const nx = ax + ar * 1.5, ns = 5.4 * s;
  text(ctx, o.name, nx, ay - ns * 0.62, ns, "#ffffff", { weight: 800, align: "left" });
  ctx.font = `800 ${ns}px ${SANS}`;
  const nw = ctx.measureText(o.name).width;
  circle(ctx, nx + nw + ns * 0.8, ay - ns * 0.62, ns * 0.5, "#1d9bf0");
  limb(ctx, [[nx + nw + ns * 0.55, ay - ns * 0.62], [nx + nw + ns * 0.75, ay - ns * 0.4], [nx + nw + ns * 1.08, ay - ns * 0.86]], ns * 0.12, "#ffffff");
  text(ctx, o.handle, nx, ay + ns * 0.62, ns * 0.9, "#71767b", { weight: 500, align: "left" });
  // the sentence, big and plain, as large as the card allows
  let fs = (P ? 11 : 13.5) * s;
  for (const l of o.lines) fs = Math.min(fs, fitSize(ctx, l, maxW, fs, 600));
  // everything has to fit: header, the lines, the views under them
  const room = h - (top + ar * 2) - 6 * s;
  fs = Math.min(fs, room / (1.5 + o.lines.length * 1.25 + 0.7 + 0.8));
  const y0 = top + ar * 2 + fs * 1.5;
  o.lines.forEach((l, i) => text(ctx, l, cx, y0 + i * fs * 1.25, fs, "#ffffff", { weight: 600, align: "left" }));
  text(ctx, o.meta, cx, y0 + o.lines.length * fs * 1.25 + fs * 0.7, 4.4 * s, "#71767b", { weight: 500, align: "left" });
  if (P) { glow(ctx, w * 0.66, h * 0.86, w * 0.8, o.glowC, 0.18); face(ctx, w * 0.68, h * 0.88, h * 0.34 * (0.97 + settle * 0.03), o.host); return; }
  glow(ctx, w * 0.8, h * 0.5, h * 0.7, o.glowC, 0.16);
  face(ctx, w * 0.8, h * 0.58, h * 0.64 * (0.97 + settle * 0.03), o.host);
}

// ===================================================================================
// 1. t1.bot: hot takes, red arrows, reacting to posts, one sponsor
// ===================================================================================
interface TakeCfg {
  id: string; title: string; views: string; dur: string;
  hook: [string, string]; prop: "grave" | "semi";
  handle: string; post: string[]; key: number;
  verdict: string; vcolor: string; sponsor: string; slogan: string;
}
// The Theo look-alike: dark curly mop, an earring, a collared shirt, big surprised eyes. Robot, lilac, nobody's real face.
const TEO = { body: "#c7b3ff", eye: C.mint, outfit: "shirt", cloth: "#d8ccb6", inner: "#2a2630", curls: "#2b1e26", earring: true } satisfies Host;

function postCard(ctx: Ctx, r: Rect, handle: string, lines: string[], hi: number, key: number, ring: number) {
  fillRR(ctx, r.x, r.y, r.w, r.h, r.h * 0.07, "#1e2348");
  const pad = Math.min(r.w, r.h) * 0.08, avR = r.h * 0.075;
  const ax = r.x + pad + avR, ay = r.y + pad + avR;
  circle(ctx, ax, ay, avR, C.orange);
  fillRR(ctx, ax - avR * 0.6, ay - avR * 0.32, avR * 1.2, avR * 0.6, avR * 0.25, "#141a33");
  circle(ctx, ax - avR * 0.26, ay - avR * 0.02, avR * 0.13, C.mint);
  circle(ctx, ax + avR * 0.26, ay - avR * 0.02, avR * 0.13, C.mint);
  text(ctx, handle, ax + avR * 1.6, ay, r.h * 0.07, "#c9cdf2", { weight: 600, align: "left" });
  const fs = Math.min(r.h * 0.125, ...lines.map((l) => fitSize(ctx, l, r.w - pad * 2, r.h * 0.125, 700)));
  const y0 = ay + avR + fs * 1.1, lh = fs * 1.32;
  lines.forEach((l, i) => {
    const y = y0 + i * lh;
    ctx.font = `700 ${fs}px ${SANS}`;
    const lw = ctx.measureText(l).width;
    const f = clamp(hi - i);
    if (f > 0) fillRR(ctx, r.x + pad - fs * 0.15, y - fs * 0.62, (lw + fs * 0.3) * f, fs * 1.24, fs * 0.2, withAlpha(C.orange, 0.32));
    text(ctx, l, r.x + pad, y, fs, "#ffffff", { weight: 700, align: "left" });
    if (i === key && ring > 0) {
      ctx.beginPath();
      ctx.ellipse(r.x + pad + lw / 2, y, lw / 2 + fs * 0.7, fs * 0.95, -0.04, -Math.PI * 0.6, -Math.PI * 0.6 + Math.PI * 2.1 * ring);
      ctx.lineWidth = Math.max(2, fs * 0.13); ctx.lineCap = "round"; ctx.strokeStyle = "#ff4b5c"; ctx.stroke();
    }
  });
  const sy = r.y + r.h - pad * 0.9;
  ["12K", "3.4K", "88K"].forEach((n, i) => {
    const sx = r.x + pad + i * r.w * 0.26;
    circle(ctx, sx + r.h * 0.025, sy, r.h * 0.025, i === 2 ? C.pink : "#6a71a8");
    text(ctx, n, sx + r.h * 0.07, sy, r.h * 0.055, "#8a91c4", { weight: 500, align: "left" });
  });
}

/**
 * The host at his desk with a laptop: a strip of desk in front of him, the back of the laptop lid
 * (the robot head mark glowing on it), a mug with a little steam. The hands are behind the lid.
 */
function deskLaptop(ctx: Ctx, hx: number, hs: number, s: number, w: number, h: number, lt: number) {
  const dy = h - 8 * s;
  fillRR(ctx, 0, dy, w, 8 * s + 2, 0, lin(ctx, 0, dy, 0, h, [[0, "#3a2d4a"], [1, "#241b32"]]));
  fillRR(ctx, 0, dy, w, 0.7 * s, 0, "rgba(255,255,255,0.09)");
  // the laptop, seen from behind: lid, a sliver of base, the mark
  const lw = 40 * hs, lh = 23 * hs, lx = hx - lw / 2, ly = dy + 2.5 * s - lh;
  ellipse(ctx, hx, dy + 3.4 * s, lw * 0.62, 1.7 * s, 0, "rgba(5,4,12,0.4)");
  fillRR(ctx, lx - 1.5 * s, dy + 1.6 * s, lw + 3 * s, 1.5 * s, 0.6 * s, "#7d839c");
  fillRR(ctx, lx, ly, lw, lh, 2.2 * s, lin(ctx, lx, ly, lx + lw, ly + lh, [[0, "#b9bed3"], [1, "#8c92ab"]]));
  fillRR(ctx, lx + lw * 0.04, ly + lh * 0.05, lw * 0.92, lh * 0.06, s * 0.6, "rgba(255,255,255,0.28)");
  const mx = hx, my = ly + lh * 0.5, mk = Math.min(lw, lh) * 0.2, pulse = 0.5 + Math.sin(lt * 2.4) * 0.12;
  glow(ctx, mx, my, mk * 3, C.mint, pulse * 0.35);
  fillRR(ctx, mx - mk * 1.2, my - mk * 0.7, mk * 2.4, mk * 1.5, mk * 0.5, "#2a2f55");
  circle(ctx, mx - mk * 0.5, my + mk * 0.02, mk * 0.2, C.mint);
  circle(ctx, mx + mk * 0.5, my + mk * 0.02, mk * 0.2, C.mint);
  limb(ctx, [[mx, my - mk * 0.7], [mx, my - mk * 1.25]], mk * 0.12, "#2a2f55");
  circle(ctx, mx, my - mk * 1.3, mk * 0.2, "#2a2f55");
  // a mug on the right with steam
  const gx = hx + 34 * hs, gy = dy + 1.5 * s;
  ellipse(ctx, gx + s, gy + 1.2 * s, 5.6 * s, 1.6 * s, 0, "rgba(5,4,12,0.35)");
  fillRR(ctx, gx - 4 * s, gy - 8.5 * s, 8 * s, 9 * s, 1.8 * s, C.cream);
  ctx.beginPath(); ctx.arc(gx + 4 * s, gy - 4.3 * s, 2.4 * s, -Math.PI / 2, Math.PI / 2);
  ctx.lineWidth = 1.2 * s; ctx.lineCap = "round"; ctx.strokeStyle = C.cream; ctx.stroke();
  fillRR(ctx, gx - 3.2 * s, gy - 7.9 * s, 6.4 * s, 1.4 * s, 0.7 * s, "#6b3f2a");
  for (let i = 0; i < 2; i++) {
    const k = (lt * 0.5 + i * 0.5) % 1;
    ellipse(ctx, gx + Math.sin(k * 6 + i * 2) * 1.6 * s, gy - 10 * s - k * 9 * s, 1.1 * s, 2.4 * s, 0, withAlpha(C.cream, 0.32 * (1 - k)));
  }
}

function takeVideo(c: TakeCfg): VideoDef {
  const L = 14, HOOK = 1.7;
  return {
    id: c.id, title: c.title, channel: "t1.bot", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.95, color: "#c7b3ff",
    post: { user: "t1.bot", caption: `${c.hook[0]} ${c.hook[1].toLowerCase()} Full take on the channel`, funny: true },
    comments: ["The red arrow is load bearing.", "Sponsor segment at 7 seconds, new record.", "He was not, in fact, wrong. Or was he."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      hooked(ctx, lt, HOOK,
        () => tweetThumb(ctx, w, h, lt, {
          name: "t1.bot", handle: c.handle, lines: c.post, meta: c.views.replace("views", "Views"), glowC: "#c7b3ff",
          host: { ...TEO, eyes: "shock", shape: "o", mouth: 0.7, look: -0.4, tilt: 0.05, handR: [7, -57], handL: [-30, 14] },
        }),
        () => {
          const st = stage(w, h, 1);
          const { s, panel: r, hx, hy, hs } = st;
          const zoom = seg(lt, 6.2, 6.45) * (1 - seg(lt, 7.45, 7.6));
          ctx.save();
          if (zoom > 0) {
            const z = 1 + 0.5 * easeOut(zoom), fy = hy - 66 * hs;
            ctx.translate(hx, fy); ctx.scale(z, z); ctx.translate(-hx, -fy);
            ctx.translate(Math.sin(lt * 70) * s * 0.6 * zoom, 0);
          }
          fill(ctx, w, h, "#171233", "#0b0a1c");
          glow(ctx, w * 0.88, h * 0.15, h * 0.7, "#ff4b8b", 0.22);
          glow(ctx, w * 0.1, h * 0.95, h * 0.8, C.lilac, 0.18);
          for (let i = 0; i < 6; i++) circle(ctx, w * hash(i * 3.1), h * hash(i * 7.7), (3 + hash(i) * 6) * s, withAlpha(i % 2 ? C.lilac : "#ff4b8b", 0.08));

          const sponsor = lt >= 7.6 && lt < 10.8;
          const inA = easeOut(seg(lt, 1.7, 2.2));
          // panel: post, then the sponsor card, then the post again with a verdict
          if (!sponsor) {
            const back = lt >= 10.8 ? easeOut(seg(lt, 10.8, 11.2)) : inA;
            const pr = { ...r, x: r.x - (1 - back) * r.w * 0.3 };
            ctx.save(); ctx.globalAlpha = back;
            postCard(ctx, pr, c.handle, c.post, lt < 10.8 ? seg(lt, 2.4, 5.4) * c.post.length : c.post.length, c.key, lt < 10.8 ? easeInOut(seg(lt, 4.7, 5.3)) : 1);
            ctx.restore();
            if (lt > 4.9 && lt < 6.2) {
              const ky = pr.y + pr.h * 0.33 + c.key * pr.h * 0.165;
              const k = easeOut(seg(lt, 4.9, 5.2));
              arrow(ctx, pr.x + pr.w * 1.02, ky - pr.h * 0.35, pr.x + pr.w * (1.02 - 0.18 * k), ky - pr.h * (0.35 - 0.25 * k), 5 * s, "#ff3b4e");
            }
            if (lt >= 10.8) {
              const k = backOut(seg(lt, 11.4, 11.8), 2.4);
              if (k > 0) tag(ctx, c.verdict, pr.x + pr.w * 0.5, pr.y + pr.h * 0.62, Math.min(14 * s, pr.w * 0.12) * k, c.vcolor, "#ffffff", { align: "center", rot: -0.12 });
            }
          } else {
            const k = easeOut(seg(lt, 7.6, 8.05)) * (1 - easeIn(seg(lt, 10.45, 10.8)));
            const sr = { ...r, y: r.y + (1 - k) * r.h * 0.4 };
            ctx.save(); ctx.globalAlpha = k;
            fillRR(ctx, sr.x, sr.y, sr.w, sr.h, sr.h * 0.07, lin(ctx, sr.x, sr.y, sr.x + sr.w, sr.y + sr.h, [[0, "#2a2266"], [1, "#16304f"]]));
            text(ctx, "Today's sponsor", sr.x + sr.w / 2, sr.y + sr.h * 0.16, sr.h * 0.075, "#b9bfe6", { weight: 500 });
            const lx = sr.x + sr.w / 2, ly = sr.y + sr.h * 0.45, ls = sr.h * 0.2 * (1 + Math.sin(lt * 6) * 0.04);
            fillRR(ctx, lx - ls * 2.6, ly - ls * 0.62, ls * 1.24, ls * 1.24, ls * 0.34, lin(ctx, 0, ly - ls, 0, ly + ls, [[0, C.mint], [1, C.sky]]));
            poly(ctx, [[lx - ls * 1.9, ly - ls * 0.42], [lx - ls * 2.3, ly + ls * 0.05], [lx - ls * 2.0, ly + ls * 0.05], [lx - ls * 2.25, ly + ls * 0.45], [lx - ls * 1.75, ly - ls * 0.1], [lx - ls * 2.05, ly - ls * 0.1]], "#141a33");
            big(ctx, c.sponsor, lx - ls * 1.7, ly, ls * 0.95, "#ffffff", { align: "left", maxW: sr.w * 0.62, shadow: null });
            text(ctx, c.slogan, lx, sr.y + sr.h * 0.74, sr.h * 0.08, C.mint, { weight: 600 });
            fillRR(ctx, lx - sr.w * 0.2, sr.y + sr.h * 0.83, sr.w * 0.4, sr.h * 0.1, sr.h * 0.05, C.orange);
            text(ctx, "use code BOT", lx, sr.y + sr.h * 0.88, sr.h * 0.06, "#2a1407", { weight: 700 });
            ctx.restore();
          }

          // the host
          const reading = lt < 6.2;
          const pointing = (lt > 2.9 && lt < 4.4) || (lt > 4.9 && lt < 6.1);
          const keyY = r.y + r.h * 0.33 + c.key * r.h * 0.165;
          const aim = st.portrait ? local(hx, hy, hs, r.x + r.w * 0.6, r.y + r.h * 0.95) : local(hx, hy, hs, r.x + r.w * 0.96, keyY);
          const bob = Math.sin(lt * 3.1) * 0.03;
          // hands on the keys behind the laptop (they move a little while he talks)
          const typeL: [number, number] = [-13 + Math.sin(lt * 13) * 1.2, -6 - Math.max(0, Math.sin(lt * 19)) * 1.8];
          const typeR: [number, number] = [13 + Math.sin(lt * 11 + 1) * 1.2, -6 - Math.max(0, Math.sin(lt * 17 + 2)) * 1.8];
          let p: Host = { ...TEO, mouth: talk(lt), look: st.portrait ? 0 : -0.7, tilt: bob, eyes: blink(lt) ? "closed" : "open", handL: typeL, handR: typeR };
          if (reading) {
            if (pointing) p = { ...p, handL: aim, pointL: true };
            if (lt > 4.7 && lt < 5.5) p = { ...p, eyes: "wide", mouth: 0.2 };
          } else if (zoom > 0) {
            p = { ...p, eyes: "shock", shape: "o", mouth: 0.6 + Math.sin(lt * 9) * 0.2, look: 0, handL: [-20, -60], handR: [22, -62], tilt: 0.05 };
          } else if (sponsor) {
            p = { ...p, eyes: lt % 2.4 < 1.2 ? "happy" : "open", look: st.portrait ? 0 : -0.4, handR: [26, -52], pointR: true };
          } else {
            const shrug = easeOut(seg(lt, 11.4, 11.8)) * (1 - seg(lt, 13.2, 13.7));
            p = { ...p, eyes: shrug > 0.5 ? "happy" : "open", shape: shrug > 0.5 ? "smile" : "bar", mouth: shrug > 0.5 ? 0.4 : talk(lt), handL: [lerp(-31, -42, shrug), lerp(18, -34, shrug)], handR: [lerp(31, 42, shrug), lerp(18, -34, shrug)], tilt: shrug * 0.1 };
          }
          bust(ctx, hx, hy - Math.abs(Math.sin(lt * 6.2)) * s * (reading ? 0.6 : 0.2), hs, p);
          deskLaptop(ctx, hx, hs, s, w, h, lt);
          ctx.restore();
          if (zoom > 0) big(ctx, "WAIT.", w * 0.5, h * 0.2, 24 * s * backOut(seg(lt, 6.25, 6.5)), "#ffffff", { align: "center", rot: -0.05 });
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 2. ThePrimeBotgen: mustache, vim, live chat, one article read with great energy
// ===================================================================================
interface PrimeCfg { id: string; title: string; views: string; dur: string; hook: [string, string]; src: string; head: [string, string]; shout: string; prop: string }
const PRIME = { body: "#9fb0d6", eye: C.mint, outfit: "hoodie", cloth: "#1a1d2e", stache: "#e39a55", headset: true } satisfies Host;
const CHAT_USERS: [string, string][] = [["vim_enjoyer", C.mint], ["rustacean_bot", C.orange], ["null_ptr", C.sky], ["tabs4life", C.pink], ["kernel_kid", C.lilac], ["byte_me", "#ffd77a"], ["servo_sam", C.mint], ["lint_roller", C.sky]];
const CHAT_MSGS = ["BLAZINGLY", "vim btw", "chat is this real", "mustache diff", "skill issue", "he read it wrong lol", "+2", "RUST MENTIONED", "ok but why", "true", "based", "first", "the stache knows", "100x?!", "LETS GO", "hjkl", "read the article", "W", "no way", ":wq"];

function vimBackdrop(ctx: Ctx, w: number, h: number, s: number, lt: number) {
  ctx.fillStyle = "#0c1024"; ctx.fillRect(0, 0, w, h);
  const lh = 6.4 * s, n = Math.ceil(h / lh);
  const scroll = (lt * 0.6 * lh) % lh, base = Math.floor(lt * 0.6);
  for (let i = 0; i < n + 1; i++) {
    const y = i * lh - scroll + lh * 0.5, ln = i + base;
    text(ctx, String((ln % 99) + 1), 5 * s, y, 3.4 * s, withAlpha("#5a6194", 0.8), { mono: true, align: "right", weight: 500 });
    let x = 8 * s + (hash(ln * 3) * 3 | 0) * 4 * s;
    const parts = 1 + Math.floor(hash(ln) * 4);
    for (let k = 0; k < parts; k++) {
      const ww = (5 + hash(ln * 7 + k) * 18) * s;
      const col = [C.lilac, C.sky, C.mint, C.orange, "#5a6194"][Math.floor(hash(ln * 11 + k) * 5)];
      fillRR(ctx, x, y - 1.3 * s, ww, 2.6 * s, 1.3 * s, withAlpha(col, 0.28));
      x += ww + 2.5 * s;
    }
  }
  fillRR(ctx, 0, h - 6 * s, w, 6 * s, 0, "#1b2040");
  fillRR(ctx, 0, h - 6 * s, 20 * s, 6 * s, 0, C.mint);
  text(ctx, "NORMAL", 10 * s, h - 3 * s, 3.2 * s, "#0c1024", { weight: 800, mono: true });
  text(ctx, "takes.rs", 24 * s, h - 3 * s, 3.2 * s, "#b9bfe6", { mono: true, align: "left" });
}

function chatColumn(ctx: Ctx, r: Rect, lt: number, rate: number, salt: number) {
  fillRR(ctx, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.05, withAlpha("#141833", 0.88));
  const fs = Math.min(r.w * 0.088, r.h * 0.055), lh = fs * 1.7;
  text(ctx, "LIVE CHAT", r.x + fs * 0.8, r.y + fs * 1.1, fs * 0.85, "#8a91c4", { weight: 700, align: "left" });
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y + fs * 2, r.w, r.h - fs * 2.2); ctx.clip();
  const pos = lt * rate, top = Math.floor(pos), frac = pos - top;
  const rows = Math.ceil(r.h / lh) + 1;
  for (let i = 0; i < rows; i++) {
    const idx = top - i;
    const y = r.y + r.h - fs * 0.9 - i * lh + frac * lh - lh;
    const u = CHAT_USERS[Math.floor(hash(idx * 1.7 + salt) * CHAT_USERS.length)];
    const msg = CHAT_MSGS[Math.floor(hash(idx * 3.3 + salt + 9) * CHAT_MSGS.length)];
    ctx.font = `700 ${fs}px ${SANS}`;
    const nameW = ctx.measureText(u[0] + ":").width;
    text(ctx, u[0] + ":", r.x + fs * 0.8, y, fs, u[1], { weight: 700, align: "left" });
    text(ctx, msg, r.x + fs * 1.2 + nameW, y, fs, "#e3e6ff", { weight: 500, align: "left" });
  }
  ctx.restore();
}

function primeVideo(c: PrimeCfg): VideoDef {
  const L = 15, HOOK = 1.7;
  return {
    id: c.id, title: c.title, channel: "ThePrimeBotgen", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.95, color: "#e39a55",
    post: { user: "primebotgen", caption: `${c.hook[0]} ${c.hook[1].toLowerCase()} Chat lost it`, funny: true },
    comments: ["The mustache has its own rendering pipeline.", "Took him four minutes to read one headline. Worth it.", "I exited vim to write this comment. It took a week."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      hooked(ctx, lt, HOOK,
        () => thumbFrame(ctx, w, h, lt, {
          bg: ["#2a2a10", "#0a0c18"], glowC: "#ffb347", lines: c.hook, tagBg: "#ff4b3e", tagFg: "#ffffff",
          host: { ...PRIME, eyes: "wide", shape: "o", mouth: 1, look: -0.4, handL: [-30, -70], handR: [30, -70] },
          prop: (x, y, sz) => { glow(ctx, x, y, sz, C.orange, 0.5); big(ctx, c.prop, x, y, sz * 0.62, "#ffd77a", { align: "center", rot: -0.1, maxW: sz * 1.5 }); },
          arrowC: "#ffd23f",
        }),
        () => {
          const st = stage(w, h, 1, 0.46);
          const { s, portrait } = st;
          const shake = lt > 10.6 && lt < 11.2 ? (1 - seg(lt, 10.6, 11.2)) * s * 1.6 : 0;
          ctx.save();
          ctx.translate(Math.sin(lt * 83) * shake, Math.cos(lt * 71) * shake);
          vimBackdrop(ctx, w, h, s, lt);
          const signoff = lt >= 12.4;
          const sg = easeInOut(seg(lt, 12.4, 12.9));
          // article
          const r = portrait ? st.panel : { x: w * 0.04, y: h * 0.1, w: w * 0.44, h: h * 0.68 };
          const ain = easeOut(seg(lt, 1.7, 2.2)) * (1 - sg);
          if (ain > 0) {
            ctx.save(); ctx.globalAlpha = ain;
            const ar = { ...r, y: r.y + (1 - ain) * r.h * 0.2 };
            fillRR(ctx, ar.x, ar.y, ar.w, ar.h, ar.h * 0.05, "#f6ecdc");
            fillRR(ctx, ar.x, ar.y, ar.w, ar.h * 0.12, ar.h * 0.05, "#e7dcc8");
            text(ctx, c.src, ar.x + ar.w * 0.05, ar.y + ar.h * 0.06, ar.h * 0.055, "#7a6f5d", { align: "left", weight: 600 });
            const fs = Math.min(ar.h * 0.12, fitSize(ctx, c.head[0], ar.w * 0.9, ar.h * 0.12), fitSize(ctx, c.head[1], ar.w * 0.9, ar.h * 0.12));
            c.head.forEach((l, i) => text(ctx, l, ar.x + ar.w * 0.05, ar.y + ar.h * 0.24 + i * fs * 1.2, fs, "#1b1a2a", { align: "left", weight: 800 }));
            // body lines with the read-along highlight
            const read = seg(lt, 2.4, 8.4) * 5;
            for (let i = 0; i < 5; i++) {
              const ly = ar.y + ar.h * 0.52 + i * ar.h * 0.085, lw = ar.w * (i === 4 ? 0.5 : 0.82 + hash(i) * 0.08);
              fillRR(ctx, ar.x + ar.w * 0.05, ly, lw, ar.h * 0.035, ar.h * 0.017, "#c9bfae");
              const f = clamp(read - i);
              if (f > 0) fillRR(ctx, ar.x + ar.w * 0.05 - 2, ly - ar.h * 0.015, lw * f + 4, ar.h * 0.065, ar.h * 0.02, withAlpha("#ffd23f", 0.55));
            }
            ctx.restore();
          }
          // chat
          const cr = portrait ? { x: w * 0.04, y: h * 0.5, w: w * 0.5, h: h * 0.2 } : { x: w * 0.79, y: h * 0.05, w: w * 0.195, h: h * 0.84 };
          if (!signoff || sg < 1) {
            ctx.save(); ctx.globalAlpha = 1 - sg;
            chatColumn(ctx, cr, lt, lt > 8.6 && lt < 12.4 ? 3.2 : 1.4, c.id.length);
            ctx.restore();
          }
          if (sg > 0) { ctx.fillStyle = `rgba(5,6,16,${0.85 * sg})`; ctx.fillRect(0, 0, w, h); }

          // the host
          const laugh = lt >= 8.6 && lt < 10.6, shout = lt >= 10.6 && lt < 12.4;
          const hx = signoff ? lerp(portrait ? st.hx : w * 0.64, w * 0.5, sg) : portrait ? st.hx : w * 0.64;
          const hy = st.hy, hs = st.hs * (portrait ? 1 : 0.95);
          let p: Host = { ...PRIME, mouth: talk(lt * 1.15), look: portrait ? 0 : -0.8, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 2.3) * 0.04 };
          let lift = 0;
          if (lt < 8.6) {
            if (lt > 5.4 && lt < 6.3) p = { ...p, eyes: "wide", mouth: 0.15, lean: -0.06, tilt: -0.08 };
            const hand = Math.sin(lt * 4.2);
            p.handR = [32 + hand * 5, -12 + Math.cos(lt * 3.1) * 8];
            if (lt > 6.3) p.handL = local(hx, hy, hs, r.x + r.w * 0.95, r.y + r.h * 0.6), p.pointL = true;
          } else if (laugh) {
            const k = Math.abs(Math.sin(lt * 14));
            p = { ...p, eyes: "happy", shape: "o", mouth: 0.6 + k * 0.4, lean: 0.08, tilt: 0.12 + k * 0.05, handL: [-26, -6], handR: [26, -6] };
            lift = k * 1.5;
          } else if (shout) {
            p = { ...p, eyes: "wide", shape: "o", mouth: 1, look: 0, handL: [-40, -68], handR: [40, -68], tilt: Math.sin(lt * 20) * 0.04 };
            lift = 2;
          } else {
            const nod = seg(lt, 13.4, 13.7) * (1 - seg(lt, 14.0, 14.3));
            p = { ...p, look: 0, eyes: lt > 13.4 ? "happy" : "half", tilt: nod * 0.15, mouth: lt < 13.3 ? talk(lt * 0.7) * 0.7 : 0.3, shape: lt > 13.4 ? "smile" : "bar", handR: [20, -40] };
          }
          bust(ctx, hx, hy - lift * s, hs, p);
          if (laugh) {
            for (let i = 0; i < 3; i++) {
              const k = ((lt - 8.6) * 1.6 + i / 3) % 1;
              big(ctx, "HA", hx + (i - 1) * 22 * s, hy - 90 * hs - k * 16 * s, 9 * s * (0.6 + k * 0.6), withAlpha("#ffd23f", 1 - k), { align: "center", rot: (i - 1) * 0.2, shadow: null });
            }
          }
          ctx.restore();
          if (shout) {
            const k = backOut(seg(lt, 10.6, 10.9), 2.2);
            ctx.fillStyle = rad(ctx, w / 2, h * 0.38, Math.max(w, h) * 0.6, [[0, "rgba(8,6,20,0.75)"], [1, "rgba(8,6,20,0.25)"]]);
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2 + lt;
              const d = (20 + ((lt * 40 + i * 9) % 40)) * s;
              ellipse(ctx, w / 2 + Math.cos(a) * d * 1.6, h * 0.42 + Math.sin(a) * d, 2.6 * s, 1.2 * s, a, withAlpha(i % 2 ? C.orange : "#ffd23f", 0.8));
            }
            const words = canvasText(c.shout).split(" ");
            words.forEach((wd, i) => big(ctx, wd, w / 2, h * (portrait ? 0.3 : 0.32) + i * 17 * s, 18 * s * k, i ? "#ffd23f" : "#ffffff", { align: "center", rot: -0.06, maxW: w * 0.9 }));
          }
          if (signoff) {
            const k1 = seg(lt, 12.9, 13.6), k2 = backOut(seg(lt, 13.6, 13.95));
            const l1 = canvasText("the unit designation is...");
            text(ctx, l1.slice(0, Math.floor(l1.length * k1)), w / 2, h * 0.14, 6.5 * s, "#b9bfe6", { weight: 500 });
            if (k2 > 0) big(ctx, "PrimeBotgen", w / 2, h * 0.27, 13 * s * k2, "#ffd23f", { align: "center", maxW: w * 0.85 });
          }
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 3. Firechip: X in 100 cycles, flat motion graphics, no face, a chip with a flame
// ===================================================================================
interface ChipCfg { id: string; title: string; views: string; dur: string; topic: string; code: string[]; flow: [string, string, string]; stat: [number, string]; outro: string; accent: string }

function chipMascot(ctx: Ctx, x: number, y: number, size: number, t: number, mouth: number, wave = 0) {
  const u = size / 40;
  // flame
  for (let i = 0; i < 3; i++) {
    const f = Math.sin(t * (9 + i * 3) + i) * 1.6;
    const fh = (22 - i * 6) * u, fw = (14 - i * 3.5) * u;
    const col = [C.orange2, "#ffb347", "#ffe27a"][i];
    ctx.beginPath();
    ctx.moveTo(x - fw, y - 12 * u);
    ctx.quadraticCurveTo(x - fw * 1.05, y - 12 * u - fh * 0.6, x + f * u, y - 12 * u - fh - Math.abs(f) * u);
    ctx.quadraticCurveTo(x + fw * 1.05, y - 12 * u - fh * 0.6, x + fw, y - 12 * u);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }
  // pins
  for (let i = 0; i < 4; i++) {
    const o = (-10.5 + i * 7) * u;
    fillRR(ctx, x + o - 1.6 * u, y + 12 * u, 3.2 * u, 5 * u, 1 * u, "#8b93c9");
    fillRR(ctx, x - 17 * u, y + o - 1.6 * u, 5 * u, 3.2 * u, 1 * u, "#8b93c9");
    fillRR(ctx, x + 12 * u, y + o - 1.6 * u, 5 * u, 3.2 * u, 1 * u, "#8b93c9");
  }
  fillRR(ctx, x - 14 * u, y - 14 * u, 28 * u, 28 * u, 6 * u, lin(ctx, x, y - 14 * u, x, y + 14 * u, [[0, "#3b4486"], [1, "#262d63"]]));
  fillRR(ctx, x - 10 * u, y - 8 * u, 20 * u, 14 * u, 4 * u, "#141a33");
  for (const sx of [-4.5, 4.5]) { glow(ctx, x + sx * u, y - 2.5 * u, 5 * u, C.orange, 0.35); circle(ctx, x + sx * u, y - 2.5 * u, 2.2 * u, "#ffb347"); }
  const mh = (1 + mouth * 3) * u;
  fillRR(ctx, x - 3.5 * u, y + 2.6 * u - mh / 2, 7 * u, mh, mh / 2, "#ffb347");
  if (wave) limb(ctx, [[x + 14 * u, y + 2 * u], [x + 21 * u, y - 4 * u], [x + 23 * u + Math.sin(t * 10) * 3 * u, y - 12 * u]], 3 * u, "#8b93c9");
}

function chipVideo(c: ChipCfg): VideoDef {
  const L = 12, HOOK = 1.5;
  const ACC = c.accent;
  return {
    id: c.id, title: c.title, channel: "Firechip", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.85, color: "#ff8f5a",
    post: { user: "firechip", caption: `${c.topic} in 100 cycles. Blink and you miss it` },
    comments: ["How is this only 100 cycles. I took notes at 4x speed.", "The flame chip deserves its own channel.", "Came for the speed, stayed for the memes."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100, P = h > w * 1.05;
      const bg = () => {
        fill(ctx, w, h, "#121738", "#0b0e26");
        const g = 12 * s;
        ctx.fillStyle = withAlpha("#ffffff", 0.035);
        for (let x = (lt * 4 * s) % g; x < w; x += g) ctx.fillRect(x, 0, Math.max(1, s * 0.25), h);
        for (let y = (lt * 2 * s) % g; y < h; y += g) ctx.fillRect(0, y, w, Math.max(1, s * 0.25));
      };
      hooked(ctx, lt, HOOK,
        () => {
          bg();
          glow(ctx, P ? w * 0.5 : w * 0.27, P ? h * 0.66 : h * 0.55, 60 * s, ACC, 0.45);
          chipMascot(ctx, P ? w * 0.5 : w * 0.27, P ? h * 0.66 : h * 0.6, (P ? 52 : 58) * s, lt, 0.4 + Math.sin(lt * 9) * 0.3);
          const pop = backOut(seg(lt, 0.2, 0.55));
          big(ctx, c.topic, P ? w * 0.5 : w * 0.73, P ? h * 0.2 : h * 0.4, (P ? 26 : 32) * s * pop, "#ffffff", { align: "center", maxW: P ? w * 0.86 : w * 0.48 });
          tag(ctx, "in 100 cycles", P ? w * 0.5 : w * 0.73, P ? h * 0.32 : h * 0.66, 10 * s, ACC, "#141a33", { align: "center", rot: -0.04 });
        },
        () => {
          bg();
          const mascot = (x: number, y: number, sz: number) => chipMascot(ctx, x, y, sz, lt, lt % 4 < 3.2 ? talk(lt) : 0, lt > 9.2 ? 1 : 0);
          const cyc = Math.min(100, Math.floor(seg(lt, 1.5, 11.4) * 100));
          // segments
          if (lt < 3.3) {
            const k = backOut(seg(lt, 1.5, 1.9), 2);
            const sub = easeOut(seg(lt, 1.9, 2.3));
            big(ctx, c.topic, w / 2, h * 0.4, 30 * s * k, "#ffffff", { align: "center", maxW: w * 0.85 });
            ctx.save(); ctx.globalAlpha = sub;
            tag(ctx, "in 100 cycles", w / 2, h * 0.6 + (1 - sub) * 6 * s, 9 * s, ACC, "#141a33", { align: "center" });
            ctx.restore();
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2, d = easeOut(seg(lt, 1.55, 2.2)) * 40 * s;
              star(ctx, w / 2 + Math.cos(a) * d * 1.4, h * 0.45 + Math.sin(a) * d, 2.4 * s * (1 - seg(lt, 2, 2.6)), i % 2 ? ACC : C.cream);
            }
          } else if (lt < 5.4) {
            const k = easeOut(seg(lt, 3.3, 3.7));
            const cw = P ? w * 0.88 : w * 0.56, ch = P ? h * 0.36 : h * 0.62;
            const cx = (P ? w * 0.06 : w * 0.36) + (1 - k) * w * 0.6, cy = P ? h * 0.12 : h * 0.17;
            fillRR(ctx, cx, cy, cw, ch, 3 * s, "#1c2250");
            fillRR(ctx, cx, cy, cw, ch * 0.13, 3 * s, "#262d63");
            [C.pink, "#ffd23f", C.mint].forEach((col, i) => circle(ctx, cx + (4 + i * 4) * s, cy + ch * 0.065, 1.3 * s, col));
            const fs = Math.min(ch * 0.13, ...c.code.map((l) => fitSize(ctx, l, cw * 0.88, ch * 0.13, 600, true)));
            c.code.forEach((line, i) => {
              const shown = Math.floor(clamp(seg(lt, 3.6 + i * 0.32, 3.9 + i * 0.32)) * line.length);
              if (shown <= 0) return;
              const sp = line.indexOf(" ");
              const head = sp > 0 ? line.slice(0, sp) : line, rest = sp > 0 ? line.slice(sp) : "";
              const ly = cy + ch * 0.27 + i * fs * 1.45;
              const hs = head.slice(0, shown);
              text(ctx, hs, cx + cw * 0.06, ly, fs, ACC, { mono: true, align: "left", weight: 700 });
              if (shown > head.length) {
                ctx.font = `700 ${fs}px ${MONO}`;
                text(ctx, rest.slice(0, shown - head.length), cx + cw * 0.06 + ctx.measureText(head).width, ly, fs, C.ink, { mono: true, align: "left", weight: 500 });
              }
            });
            mascot(P ? w * 0.5 : w * 0.18, P ? h * 0.7 : h * 0.58, (P ? 40 : 46) * s);
          } else if (lt < 7.4) {
            const n = c.flow.length;
            for (let i = 0; i < n; i++) {
              const k = backOut(seg(lt, 5.4 + i * 0.35, 5.75 + i * 0.35), 2);
              const bx = P ? w / 2 : w * (0.2 + i * 0.3), by = P ? h * (0.17 + i * 0.22) : h * 0.42;
              const bw = P ? w * 0.7 : w * 0.24, bh = P ? h * 0.12 : h * 0.24;
              if (i < n - 1) {
                const ak = easeOut(seg(lt, 5.65 + i * 0.35, 6.0 + i * 0.35));
                if (ak > 0) {
                  if (P) arrow(ctx, bx, by + bh * 0.55, bx, by + bh * 0.55 + (h * 0.22 - bh * 1.1) * ak, 3 * s, "#8b93c9");
                  else arrow(ctx, bx + bw * 0.55, by, bx + bw * 0.55 + (w * 0.3 - bw * 1.1) * ak, by, 3 * s, "#8b93c9");
                }
              }
              if (k <= 0) continue;
              ctx.save(); ctx.translate(bx, by); ctx.scale(k, k);
              const col = [C.sky, C.lilac, ACC][i];
              fillRR(ctx, -bw / 2, -bh / 2, bw, bh, 3 * s, col);
              big(ctx, c.flow[i], 0, 0, bh * 0.36, "#141a33", { align: "center", maxW: bw * 0.86, shadow: null });
              ctx.restore();
            }
            if (lt > 6.6) {
              const k = backOut(seg(lt, 6.6, 6.9), 2.5);
              tag(ctx, "?!", P ? w * 0.86 : w * 0.88, P ? h * 0.62 : h * 0.2, 12 * s * k, C.pink, "#ffffff", { align: "center", rot: 0.15 });
            }
          } else if (lt < 9.2) {
            const k = easeOut(seg(lt, 7.4, 8.4));
            const n = Math.round(c.stat[0] * k);
            big(ctx, n.toLocaleString("en-US"), w / 2, h * (P ? 0.3 : 0.38), 26 * s, ACC, { align: "center", maxW: w * 0.9 });
            text(ctx, c.stat[1], w / 2, h * (P ? 0.42 : 0.6), 7.5 * s, C.ink, { weight: 600 });
            const bars = 7;
            for (let i = 0; i < bars; i++) {
              const bh = (8 + i * i * 1.2) * s * easeOut(seg(lt, 7.5 + i * 0.08, 8.2 + i * 0.08));
              const bx = w / 2 + (i - bars / 2) * 6 * s;
              fillRR(ctx, bx, h * (P ? 0.62 : 0.88) - bh, 4.6 * s, bh, 1.2 * s, withAlpha(i === bars - 1 ? ACC : C.sky, 0.85));
            }
            if (P) mascot(w * 0.5, h * 0.8, 34 * s);
          } else {
            const k = backOut(seg(lt, 9.2, 9.6));
            mascot(P ? w / 2 : w * 0.3, P ? h * 0.62 : h * 0.55, (P ? 48 : 56) * s * k);
            text(ctx, "This has been", P ? w / 2 : w * 0.66, P ? h * 0.16 : h * 0.3, 7 * s, "#b9bfe6", { weight: 500 });
            big(ctx, c.topic, P ? w / 2 : w * 0.66, P ? h * 0.27 : h * 0.47, 18 * s * k, "#ffffff", { align: "center", maxW: P ? w * 0.85 : w * 0.55 });
            text(ctx, c.outro, P ? w / 2 : w * 0.66, P ? h * 0.37 : h * 0.64, 6.5 * s, ACC, { weight: 600 });
          }
          // cycle counter
          const cw = 26 * s, ccx = w - cw - 3 * s, ccy = 3 * s;
          fillRR(ctx, ccx, ccy, cw, 7.5 * s, 3.75 * s, withAlpha("#000000", 0.35));
          fillRR(ctx, ccx, ccy, cw * (cyc / 100), 7.5 * s, 3.75 * s, withAlpha(ACC, 0.9));
          text(ctx, `${cyc}/100`, ccx + cw / 2, ccy + 3.9 * s, 4.2 * s, "#ffffff", { weight: 700, mono: true });
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 4. Two Minute Pixels: lab coat, side by side papers, hold on to your circuits
// ===================================================================================
type SimKind = "cloth" | "fluid";
const PIX = { body: "#ffb27a", eye: C.sky, outfit: "coat", cloth: "#e7e9fb", inner: C.lilac, glasses: true } satisfies Host;

/** A small simulation preview. quality 0 = previous paper (blocky, jittery), 1 = this paper. */
function sim(ctx: Ctx, r: Rect, kind: SimKind, q: number, t: number) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.08); ctx.clip();
  ctx.fillStyle = lin(ctx, 0, r.y, 0, r.y + r.h, [[0, "#2c3570"], [1, "#1a2050"]]);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const jit = (1 - q) * 0.12;
  if (kind === "cloth") {
    // a flag on a pole, rendered as shaded strips
    const n = 3 + Math.round(q * 9), px = r.x + r.w * 0.15;
    fillRR(ctx, px - r.w * 0.015, r.y + r.h * 0.1, r.w * 0.03, r.h * 0.85, 2, "#8b93c9");
    const fw = r.w * 0.68, fh = r.h * 0.45, fy = r.y + r.h * 0.15;
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const wv = (u: number) => Math.sin(u * 5 - t * 4) * r.h * 0.06 * u + (hash(Math.floor(t * 12) + i) - 0.5) * r.h * jit * u;
      const a = wv(u0), b = wv(u1);
      const sh = 0.5 + 0.5 * Math.cos((u0 + u1) * 2.5 - t * 4);
      poly(ctx, [[px + u0 * fw, fy + a], [px + u1 * fw, fy + b], [px + u1 * fw, fy + fh + b], [px + u0 * fw, fy + fh + a]], q > 0.5 ? shade(C.pink, (sh - 0.5) * 0.5) : shade("#a07ad0", (sh - 0.5) * 0.3));
    }
    if (q < 0.5) poly(ctx, [[px + fw * 0.4, fy + fh * 0.7], [px + fw * 0.58, fy + fh * 1.25], [px + fw * 0.3, fy + fh * 1.1]], withAlpha("#a07ad0", 0.9));
  } else {
    // a splash of particles in a tank
    const n = q > 0.5 ? 70 : 16;
    const base = r.y + r.h * 0.72;
    for (let i = 0; i < n; i++) {
      const u = hash(i * 3.1), ph = hash(i * 7.3) * Math.PI * 2;
      const x = r.x + r.w * (0.06 + u * 0.88);
      const wave = Math.sin(u * 7 + t * 3) * r.h * 0.08 + Math.sin(u * 13 - t * 5 + ph) * r.h * 0.03;
      const y = base + wave - hash(i * 5.7) * r.h * 0.18 + (hash(Math.floor(t * 10) + i) - 0.5) * r.h * jit * 2;
      if (q > 0.5) circle(ctx, x, y, r.w * 0.028, withAlpha(i % 3 ? C.sky : "#9fdcff", 0.85));
      else fillRR(ctx, x - r.w * 0.04, y - r.w * 0.04, r.w * 0.08, r.w * 0.08, 1, withAlpha("#5a7ad0", 0.9));
    }
    if (q > 0.5) { ctx.fillStyle = withAlpha(C.sky, 0.35); ctx.fillRect(r.x, base + r.h * 0.04, r.w, r.h); }
  }
  ctx.restore();
}

function pixVideo(id: string, title: string, views: string, dur: string, kind: SimKind, hook: [string, string]): VideoDef {
  const L = 14, HOOK = 1.7;
  return {
    id, title, channel: "Two Minute Pixels", views, durationLabel: dur, loop: L, thumbT: 0.95, color: C.sky,
    post: { user: "twominutepixels", caption: "Two more papers down the line. Hold on to your circuits" },
    comments: ["I am holding on to my circuits so tight right now.", "What a time to be online indeed.", "Dear fellow circuits, I have dropped my papers again."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100;
      hooked(ctx, lt, HOOK,
        () => {
          const P = h > w * 1.05;
          fill(ctx, w, h, "#1d2a66", "#0e1233");
          const pw = P ? w * 0.42 : w * 0.3, ph = pw * 0.8;
          const y0 = P ? h * 0.26 : h * 0.12;
          sim(ctx, { x: w * 0.05, y: y0, w: pw, h: ph }, kind, 0, 1.3);
          sim(ctx, { x: w * 0.05 + pw + w * 0.04, y: y0, w: pw, h: ph }, kind, 1, 1.3);
          tag(ctx, "OLD", w * 0.05 + 2 * s, y0 + ph - 5 * s, 6 * s, "#5a6194", "#ffffff");
          tag(ctx, "NEW", w * 0.09 + pw + 2 * s, y0 + ph - 5 * s, 6 * s, C.mint, "#141a33");
          const pop = backOut(seg(lt, 0.25, 0.6));
          if (P) {
            big(ctx, hook[0], w / 2, h * 0.09, 18 * s, "#ffffff", { align: "center", maxW: w * 0.9 });
            tag(ctx, hook[1], w / 2, h * 0.18, 14 * s * pop, "#ffd23f", "#15121f", { align: "center", maxW: w * 0.9, rot: -0.04 });
            face(ctx, w * 0.5, h * 0.74, h * 0.22, { ...PIX, eyes: "shock", shape: "o", mouth: 0.9, handL: [-26, -70], handR: [26, -70] });
          } else {
            big(ctx, hook[0], w * 0.05, y0 + ph + 13 * s, 17 * s, "#ffffff", { align: "left", maxW: w * 0.62 });
            tag(ctx, hook[1], w * 0.05, y0 + ph + 31 * s, 15 * s * pop, "#ffd23f", "#15121f", { maxW: w * 0.62, rot: -0.03 });
            glow(ctx, w * 0.84, h * 0.6, h * 0.6, C.sky, 0.35);
            face(ctx, w * 0.84, h * 0.58, h * 0.56, { ...PIX, eyes: "shock", shape: "o", mouth: 0.9, look: -0.6, handL: [-26, -70], handR: [26, -70] });
            arrow(ctx, w * 0.66, h * 0.3, w * 0.66 - 6 * s * (1 + Math.sin(lt * 10) * 0.3), y0 + ph * 0.4, 5 * s, "#ff3b4e");
          }
        },
        () => {
          const st = stage(w, h, -1, 0.56);
          const { panel: r, hx, hy, hs, portrait } = st;
          fill(ctx, w, h, "#1d2560", "#10153a");
          for (let i = 0; i < 5; i++) glow(ctx, w * hash(i + 2), h * hash(i + 9), 30 * s, i % 2 ? C.sky : C.lilac, 0.1);
          const hold = lt >= 6 && lt < 8, ladder = lt >= 8 && lt < 11, end = lt >= 11;
          // panel content
          if (lt < 8) {
            const k = easeOut(seg(lt, 1.8, 2.3));
            const gap = r.w * 0.04, pw = (r.w - gap) / 2, ph = Math.min(r.h * 0.78, pw * 0.95);
            const y = r.y + (r.h - ph) * 0.55;
            ctx.save(); ctx.globalAlpha = k;
            sim(ctx, { x: r.x, y, w: pw, h: ph }, kind, 0, lt);
            const k2 = easeOut(seg(lt, 3.0, 3.5));
            if (k2 > 0) sim(ctx, { x: r.x + pw + gap, y: y + (1 - k2) * 8 * s, w: pw, h: ph }, kind, 1, lt);
            text(ctx, "Previous work", r.x + pw / 2, y - 4 * s, 4.6 * s, "#b9bfe6", { weight: 600 });
            if (k2 > 0) text(ctx, "This paper", r.x + pw * 1.5 + gap, y - 4 * s, 4.6 * s, C.mint, { weight: 700 });
            ctx.restore();
            if (lt < 4.2 && lt > 1.9) text(ctx, "Dear fellow circuits...", r.x + r.w / 2, r.y + r.h + 4 * s, 5 * s, C.cream, { weight: 600 });
          } else if (ladder) {
            const n = 3;
            const gap = r.w * 0.05, pw = (r.w - gap * (n - 1)) / n, ph = pw * 0.9;
            const y = r.y + (r.h - ph) * 0.5;
            text(ctx, "Two more papers down the line", r.x + r.w / 2, y - 6 * s, 4.8 * s, C.cream, { weight: 600 });
            for (let i = 0; i < n; i++) {
              const k = backOut(seg(lt, 8.1 + i * 0.45, 8.45 + i * 0.45));
              if (k <= 0) continue;
              ctx.save();
              const cx = r.x + i * (pw + gap) + pw / 2, cy = y + ph / 2;
              ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
              sim(ctx, { x: r.x + i * (pw + gap), y, w: pw, h: ph }, kind, i / 2 + (i === 1 ? 0.01 : 0), lt);
              ctx.restore();
              if (i < n - 1 && seg(lt, 8.5 + i * 0.45, 8.8 + i * 0.45) > 0) arrow(ctx, r.x + (i + 1) * (pw + gap) - gap * 0.9, cy, r.x + (i + 1) * (pw + gap) - gap * 0.1, cy, 1.8 * s, C.mint);
            }
          }
          if (hold) {
            const k = backOut(seg(lt, 6.05, 6.35), 2.2);
            ctx.fillStyle = withAlpha("#0b0e26", 0.5 * k); ctx.fillRect(0, 0, w, h);
            const tx = portrait ? w / 2 : r.x + r.w / 2;
            big(ctx, "Hold on to", tx, h * (portrait ? 0.2 : 0.32), 11 * s * k, "#ffffff", { align: "center", maxW: portrait ? w * 0.9 : r.w });
            tag(ctx, "your circuits!", tx, h * (portrait ? 0.32 : 0.52), 11 * s * k, "#ffd23f", "#15121f", { align: "center", maxW: portrait ? w * 0.92 : r.w, rot: -0.04 });
          }
          if (end) {
            const k = backOut(seg(lt, 11.1, 11.45));
            const tx = portrait ? w / 2 : r.x + r.w / 2;
            text(ctx, "What a time", tx, h * (portrait ? 0.18 : 0.34), 10 * s * k, "#ffffff", { weight: 800 });
            text(ctx, "to be online!", tx, h * (portrait ? 0.28 : 0.5), 10 * s * k, C.mint, { weight: 800 });
            for (let i = 0; i < 18; i++) {
              const x = w * hash(i * 2.3), fall = ((lt - 11) * (0.3 + hash(i) * 0.3) + hash(i * 5)) % 1;
              fillRR(ctx, x, h * fall, 2 * s, 1 * s, 0.4 * s, [C.pink, C.mint, "#ffd23f", C.sky][i % 4]);
            }
          }
          // host
          let p: Host = { ...PIX, mouth: talk(lt * 1.1), look: portrait ? 0 : 0.7, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 2.7) * 0.04 };
          if (lt < 6) {
            p.handL = [-30 + Math.sin(lt * 3) * 4, -14];
            if (lt > 3.4 && lt < 5.6) p = { ...p, handR: portrait ? [24, -84] : local(hx, hy, hs, r.x + r.w * 0.1, r.y + r.h * 0.5), pointR: true, eyes: "wide" };
          } else if (hold) {
            p = { ...p, eyes: "shock", shape: "o", mouth: 0.7 + Math.sin(lt * 12) * 0.2, look: 0, handL: [-20, -90], handR: [14, -98], tilt: Math.sin(lt * 18) * 0.03 };
          } else if (ladder) {
            p = { ...p, handR: [30, -30 + Math.sin(lt * 4) * 6], pointR: lt > 9 };
          } else {
            p = { ...p, eyes: "happy", shape: "smile", mouth: 0.5, handL: [-40, -64], handR: [40, -64], look: 0, tilt: Math.sin(lt * 4) * 0.08 };
          }
          bust(ctx, hx, hy - (hold ? Math.abs(Math.sin(lt * 9)) * 1.6 * s : 0), hs, p);
          if (hold) for (let i = 0; i < 4; i++) star(ctx, hx + Math.cos(lt * 3 + i * 1.6) * 30 * hs, hy - 95 * hs + Math.sin(lt * 3 + i * 1.6) * 8 * hs, (2 + Math.sin(lt * 9 + i)) * s, "#ffd23f");
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 5. Lex Fridbot Podcast: black room, suit and tie, four hour conversations
// ===================================================================================
interface PodCfg { id: string; title: string; views: string; dur: string; num: string; guest: string; g: Host; lines: [string, string, string] }
const LEX = { body: "#9aa0b8", eye: "#e8ecff", outfit: "suit", cloth: "#0f1018", tie: "#08090e" } satisfies Host;

function podVideo(c: PodCfg): VideoDef {
  const L = 18, HOOK = 1.3;
  return {
    id: c.id, title: c.title, channel: "Lex Fridbot Podcast", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.75, color: "#2b2d3d",
    post: { user: "lexfridbot", caption: `${c.guest}. ${c.lines[1]}` },
    comments: ["Hour three is where it gets really deep.", "The silence at 2:41:07 changed me.", "He asked the toaster about love and the toaster had answers."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100, P = h > w * 1.05;
      const room = () => {
        ctx.fillStyle = "#06070d"; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
          const x = (i / 14) * w;
          ctx.fillStyle = lin(ctx, x, 0, x + w / 14, 0, [[0, "rgba(255,255,255,0.012)"], [0.5, "rgba(255,255,255,0.04)"], [1, "rgba(255,255,255,0.012)"]]);
          ctx.fillRect(x, 0, w / 14, h);
        }
        glow(ctx, w * 0.5, h * 0.35, Math.max(w, h) * 0.5, "#7a1d24", 0.16);
      };
      const caption = (str: string, k: number) => {
        if (k <= 0) return;
        str = canvasText(str);
        ctx.save(); ctx.globalAlpha = k;
        const fs = fitSize(ctx, str, w * 0.86, (P ? 6.4 : 5.6) * s, 500);
        ctx.font = `500 ${fs}px ${SANS}`;
        const tw = ctx.measureText(str).width;
        fillRR(ctx, w / 2 - tw / 2 - fs * 0.6, h * 0.86 - fs * 0.85, tw + fs * 1.2, fs * 1.7, fs * 0.3, "rgba(0,0,0,0.65)");
        text(ctx, str, w / 2, h * 0.86, fs, "#f1f1f6", { weight: 500 });
        ctx.restore();
      };
      const nod = (a: number) => Math.sin(lt * 1.3 + a) * 0.05;
      hooked(ctx, lt, HOOK,
        () => {
          room();
          glow(ctx, w * 0.5, h * 0.45, h * 0.7, "#a8b0d8", 0.12);
          face(ctx, w * (P ? 0.5 : 0.7), h * (P ? 0.6 : 0.5), h * (P ? 0.3 : 0.62), { ...c.g, eyes: "half", mouth: 0, look: -0.3 });
          // guest name in two light lines, the way these thumbnails stay quiet
          const cut = c.guest.lastIndexOf(" ");
          const name = cut > 0 ? [c.guest.slice(0, cut), c.guest.slice(cut + 1)] : [c.guest, ""];
          const nx = P ? w / 2 : w * 0.06, al: CanvasTextAlign = P ? "center" : "left";
          const ns = Math.min(14 * s, fitSize(ctx, name[0], P ? w * 0.86 : w * 0.4, 14 * s, 400));
          text(ctx, name[0], nx, h * (P ? 0.14 : 0.34), ns, "#f1f1f6", { weight: 400, align: al });
          text(ctx, name[1], nx, h * (P ? 0.14 : 0.34) + ns * 1.15, ns, "#f1f1f6", { weight: 400, align: al });
          text(ctx, `#${c.num}`, nx, h * (P ? 0.14 : 0.34) + ns * 2.3, ns * 0.55, "#c0443f", { weight: 500, align: al });
        },
        () => {
          room();
          const host = (x: number, y: number, k: number, talking: boolean, look: number) =>
            bust(ctx, x, y, k, { ...LEX, mouth: talking ? talk(lt * 0.55) * 0.7 : 0, look, tilt: nod(0), eyes: blink(lt) ? "closed" : lt % 7 < 2 ? "half" : "open" });
          const guest = (x: number, y: number, k: number, talking: boolean, look: number) =>
            bust(ctx, x, y, k, { ...c.g, mouth: talking ? talk(lt * 0.8) : 0, look, tilt: nod(1.7) * 0.8, eyes: blink(lt + 1.1) ? "closed" : "open", handR: talking ? [28 + Math.sin(lt * 1.6) * 6, -18 + Math.sin(lt * 2.1) * 8] : undefined, toast: talking ? Math.max(0, Math.sin(lt * 0.9)) : 0 });
          const table = (y: number) => {
            fillRR(ctx, -10, y, w + 20, h - y + 10, 0, lin(ctx, 0, y, 0, h, [[0, "#2a1d16"], [1, "#120c09"]]));
            fillRR(ctx, -10, y, w + 20, 1.6 * s, 0, "#3c2a20");
          };
          const mic = (x: number, y: number, dir: number, k: number) => {
            limb(ctx, [[x + dir * 18 * k, y - 40 * k], [x + dir * 8 * k, y - 22 * k], [x + dir * 2 * k, y - 18 * k]], 2.2 * k, "#2a2b33");
            fillRR(ctx, x - 4 * k + dir * 2 * k, y - 26 * k, 8 * k, 14 * k, 4 * k, "#1a1b22");
          };
          const shot = lt < 6 ? 0 : lt < 10.5 ? 1 : lt < 14 ? 2 : 0;
          if (shot === 0) {
            const k = s * (P ? 0.55 : 0.62), ty = h * (P ? 0.66 : 0.74);
            const hx = P ? w * 0.27 : w * 0.3, gx = P ? w * 0.73 : w * 0.7;
            host(hx, ty + 10 * k, k, false, 1);
            guest(gx, ty + 10 * k, k, lt < 6, -1);
            table(ty);
            mic(hx + 16 * k, ty, 1, k * 0.9);
            mic(gx - 16 * k, ty, -1, k * 0.9);
            fillRR(ctx, w * 0.47, ty - 4 * s, 2.6 * s, 4 * s, 0.6 * s, "#3a3f99");
            caption(lt < 6 ? c.lines[0] : "...", lt < 6 ? seg(lt, 1.6, 2.0) : seg(lt, 14.3, 14.8));
          } else {
            const g = shot === 1;
            const k = s * (P ? 1.0 : 1.08);
            const x = P ? w * 0.5 : g ? w * 0.56 : w * 0.44;
            if (g) guest(x, h + 6 * s, k, true, -0.5); else host(x, h + 6 * s, k, true, 0.5);
            mic(x + (g ? -1 : 1) * 30 * k, h + 6 * s - 16 * k, g ? -1 : 1, k * 0.8);
            caption(g ? c.lines[1] : c.lines[2], g ? seg(lt, 6.3, 6.7) : seg(lt, 10.8, 11.2));
          }
        });
      loopFade(ctx, w, h, lt, L, 0.45);
    },
  };
}

// ===================================================================================
// 6. Hype Cycle: AI news desk, a breaking banner every five seconds
// ===================================================================================
const ANCHOR = { body: C.pink, eye: C.cream, outfit: "suit", cloth: "#263a8a", tie: C.orange } satisfies Host;
const TICKER = ["Model gets 0.3% better", "New benchmark released, old benchmark sad", "AGI rumored for Tuesday, again", "Startup raises $40M for a prompt", "Robot learns to say 'great question'", "Context window now longer than this ticker"];

function newsVideo(id: string, title: string, views: string, dur: string, back: boolean): VideoDef {
  const L = 14, HOOK = 1.7;
  const verdict = back ? "WE'RE SO BACK" : "IT'S SO OVER";
  const vcol = back ? "#3fe08a" : "#ff4b5c";
  return {
    id, title, channel: "Hype Cycle", views, durationLabel: dur, loop: L, thumbT: 0.95, color: C.pink,
    post: { user: "hypecycle.news", caption: `${verdict.toLowerCase()}. Again. Full report on the channel`, funny: true },
    comments: ["It has been over and back four times this week.", "My benchmark score went up 0.3% just watching this.", "The ticker alone is worth the subscription."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100, P = h > w * 1.05;
      const ticker = () => {
        const th = 8 * s, ty = h - th;
        fillRR(ctx, 0, ty, w, th, 0, "#0b0e26");
        ctx.save(); ctx.beginPath(); ctx.rect(24 * s, ty, w, th); ctx.clip();
        const full = TICKER.map(canvasText).join("   /   ") + "   /   ";
        ctx.font = `600 ${4.2 * s}px ${SANS}`;
        const tw = ctx.measureText(full).width;
        const off = (lt * 18 * s) % tw;
        for (let x = 24 * s - off; x < w; x += tw) text(ctx, full, x, ty + th / 2, 4.2 * s, C.cream, { weight: 600, align: "left" });
        ctx.restore();
        fillRR(ctx, 0, ty, 24 * s, th, 0, "#e02f45");
        text(ctx, "BREAKING", 12 * s, ty + th / 2, 3.8 * s, "#ffffff", { weight: 800 });
      };
      hooked(ctx, lt, HOOK,
        () => thumbFrame(ctx, w, h, lt, {
          bg: back ? ["#123d33", "#08121a"] : ["#3d1218", "#12080c"], glowC: vcol, lines: [back ? "AI NEWS:" : "AI NEWS:", verdict], tagBg: vcol, tagFg: "#ffffff",
          host: { ...ANCHOR, eyes: back ? "wide" : "shock", shape: back ? "smile" : "o", mouth: 0.9, look: -0.4, handL: back ? [-40, -72] : [-22, -64], handR: back ? [40, -72] : [22, -66] },
          prop: (x, y, sz) => {
            const up = back ? 1 : -1;
            const pts: [number, number][] = [];
            for (let i = 0; i <= 5; i++) pts.push([x - sz * 0.6 + i * sz * 0.24, y + up * (sz * 0.25 - i * sz * 0.1) + (i % 2 ? -sz * 0.06 : sz * 0.06) * up]);
            limb(ctx, pts, sz * 0.09, vcol);
            const [lx, ly] = pts[pts.length - 1], [px2, py2] = pts[pts.length - 2];
            arrow(ctx, px2, py2, lx + (lx - px2) * 0.6, ly + (ly - py2) * 0.6, sz * 0.09, vcol);
          },
        }),
        () => {
          fill(ctx, w, h, "#1a2f7a", "#0d1440");
          // studio: big ring and light panels
          ctx.save();
          ctx.translate(P ? w * 0.5 : w * 0.7, h * 0.4);
          ctx.rotate(lt * 0.15);
          for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(0, 0, (28 + i * 10) * s, i, i + Math.PI * 1.3);
            ctx.lineWidth = 1.2 * s; ctx.strokeStyle = withAlpha(C.sky, 0.2 - i * 0.05); ctx.stroke();
          }
          ctx.restore();
          for (let i = 0; i < 6; i++) fillRR(ctx, w * (0.05 + i * 0.16), h * 0.06, w * 0.12, h * 0.5, 2 * s, withAlpha("#4fb6ff", 0.05 + 0.03 * Math.sin(lt * 2 + i)));
          const hx = P ? w * 0.5 : w * 0.7, deskY = h * (P ? 0.8 : 0.74), hs = s * (P ? 0.85 : 0.9);
          const ots: Rect = P ? { x: w * 0.08, y: h * 0.08, w: w * 0.84, h: h * 0.34 } : { x: w * 0.05, y: h * 0.1, w: w * 0.44, h: h * 0.56 };
          const breaking = lt >= 10 && lt < 12.2;
          // over-the-shoulder graphic
          if (lt < 6.5) {
            const k = easeOut(seg(lt, 1.7, 2.2));
            ctx.save(); ctx.globalAlpha = k;
            fillRR(ctx, ots.x, ots.y, ots.w, ots.h, 3 * s, withAlpha("#0b1238", 0.9));
            text(ctx, "Benchmark score", ots.x + ots.w / 2, ots.y + ots.h * 0.12, ots.h * 0.08, "#b9bfe6", { weight: 600 });
            const bars = [0.62, 0.7, 0.71, 0.713];
            const bw = ots.w / (bars.length * 1.6), base = ots.y + ots.h * 0.88;
            bars.forEach((v, i) => {
              const last = i === bars.length - 1;
              const hh = ots.h * 0.62 * v * (last ? easeOut(seg(lt, 3, 4)) : easeOut(seg(lt, 2 + i * 0.15, 2.6 + i * 0.15)));
              fillRR(ctx, ots.x + bw * 0.6 + i * bw * 1.6, base - hh, bw, hh, 1.2 * s, last ? "#ffd23f" : "#5a6194");
            });
            const pk = backOut(seg(lt, 4.0, 4.3), 2.4);
            if (pk > 0) tag(ctx, "+0.3%", ots.x + ots.w * 0.72, ots.y + ots.h * 0.3, ots.h * 0.12 * pk, "#3fe08a", "#0b2a1a", { align: "center", rot: -0.08 });
            if (lt > 4.1) for (let i = 0; i < 14; i++) {
              const f = (lt - 4.1) * 0.8;
              const x = ots.x + ots.w * hash(i * 3.3), y = ots.y + ots.h * (hash(i) * 0.3 + f) % ots.h;
              fillRR(ctx, x, ots.y + (y - ots.y) % ots.h, 1.8 * s, 0.9 * s, 0.4 * s, [C.pink, C.mint, "#ffd23f", C.sky][i % 4]);
            }
            ctx.restore();
          } else if (lt < 10 || lt >= 12.2) {
            // the over / back meter
            const k = easeOut(seg(lt, 6.5, 6.9)) * (lt >= 12.2 ? 1 : 1);
            ctx.save(); ctx.globalAlpha = k;
            fillRR(ctx, ots.x, ots.y, ots.w, ots.h, 3 * s, withAlpha("#0b1238", 0.9));
            const cx = ots.x + ots.w / 2, cy = ots.y + ots.h * 0.8, R = Math.min(ots.w * 0.38, ots.h * 0.62);
            ctx.lineCap = "butt";
            for (let i = 0; i < 20; i++) {
              const a0 = Math.PI + (i / 20) * Math.PI, a1 = Math.PI + ((i + 1) / 20) * Math.PI - 0.02;
              ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1);
              ctx.lineWidth = R * 0.22; ctx.strokeStyle = shade(i < 10 ? "#ff4b5c" : "#3fe08a", -Math.abs(i - 9.5) / 30); ctx.stroke();
            }
            text(ctx, "OVER", cx - R * 0.95, cy + R * 0.2, R * 0.17, "#ff8a96", { weight: 800 });
            text(ctx, "BACK", cx + R * 0.95, cy + R * 0.2, R * 0.17, "#8af0b8", { weight: 800 });
            const settle = back ? 0.82 : 0.18;
            const swing = lt < 10 ? 0.5 + Math.sin((lt - 6.5) * 5) * 0.42 * (1 - seg(lt, 8.4, 9.6)) + (settle - 0.5) * seg(lt, 8.4, 9.6) : settle;
            const a = Math.PI + swing * Math.PI;
            limb(ctx, [[cx, cy], [cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9]], R * 0.06, "#ffffff");
            circle(ctx, cx, cy, R * 0.1, "#ffffff");
            if (lt > 9.4) tag(ctx, verdict, cx, ots.y + ots.h * 0.16, ots.h * 0.11 * backOut(seg(lt, 9.4, 9.7)), vcol, "#ffffff", { align: "center", maxW: ots.w * 0.9 });
            ctx.restore();
          }
          // anchor and desk
          const shock = breaking && lt < 11;
          let p: Host = { ...ANCHOR, mouth: talk(lt), look: P ? 0 : -0.4, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 2) * 0.03, handL: [-24, -6], handR: [24, -6] };
          if (lt > 6.5 && lt < 10) p = { ...p, look: -0.6 + Math.sin((lt - 6.5) * 5) * 0.4 * (1 - seg(lt, 8.4, 9.6)) };
          if (shock) p = { ...p, eyes: "shock", shape: "o", mouth: 0.8, look: 0, handL: [-22, -60], handR: [22, -60] };
          if (lt > 9.4 && lt < 10) p = { ...p, eyes: back ? "happy" : "wide", shape: back ? "smile" : "o", mouth: 0.6 };
          bust(ctx, hx, deskY + 18 * hs, hs, p);
          fillRR(ctx, -5, deskY, w + 10, h - deskY, 0, lin(ctx, 0, deskY, 0, h, [[0, "#2e3c9a"], [1, "#1a2366"]]));
          fillRR(ctx, -5, deskY, w + 10, 1.4 * s, 0, C.sky);
          text(ctx, "HYPE CYCLE", hx, deskY + 6 * s, 4.4 * s, withAlpha(C.cream, 0.85), { weight: 800 });
          if (breaking) {
            const k = easeOut(seg(lt, 10, 10.35)) * (1 - easeIn(seg(lt, 11.9, 12.2)));
            const by = h * (P ? 0.5 : 0.6);
            ctx.save();
            ctx.translate((1 - k) * -w, 0);
            fillRR(ctx, 0, by - 9 * s, w, 18 * s, 0, "#e02f45");
            big(ctx, "BREAKING", w / 2, by - 1.5 * s, 11 * s, "#ffffff", { align: "center" });
            text(ctx, "Robot says 'great question' unprompted", w / 2, by + 5.8 * s, 3.8 * s, "#ffe3e6", { weight: 600 });
            ctx.restore();
          }
          if (lt > 12.4) text(ctx, "more at 11", P ? w / 2 : w * 0.27, h * 0.76, 5 * s, withAlpha(C.cream, seg(lt, 12.4, 12.8)), { weight: 500 });
          ticker();
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 7. Prompt & Pray: building things with AI agents, cozy and slightly chaotic
// ===================================================================================
const VIBE = { body: C.mint, eye: "#141a33", visor: "#e9fff4", outfit: "hoodie", cloth: "#2a2f66", beanie: C.orange, phones: C.lilac } satisfies Host;

function ide(ctx: Ctx, r: Rect, s: number) {
  fillRR(ctx, r.x, r.y, r.w, r.h, 2.5 * s, "#161b3d");
  fillRR(ctx, r.x, r.y, r.w, r.h * 0.09, 2.5 * s, "#20275a");
  [C.pink, "#ffd23f", C.mint].forEach((col, i) => circle(ctx, r.x + (3.5 + i * 3.4) * s, r.y + r.h * 0.045, 1.1 * s, col));
  fillRR(ctx, r.x, r.y + r.h * 0.09, r.w * 0.16, r.h * 0.91, 0, "#121633");
  for (let i = 0; i < 7; i++) fillRR(ctx, r.x + r.w * (0.02 + (i % 3 ? 0.02 : 0)), r.y + r.h * (0.16 + i * 0.1), r.w * (0.08 + hash(i) * 0.04), r.h * 0.035, 1, withAlpha("#8a91c4", 0.4));
}

function vibeVideo(id: string, title: string, views: string, dur: string, swarm: boolean): VideoDef {
  const L = 15, HOOK = 1.7;
  return {
    id, title, channel: "Prompt & Pray", views, durationLabel: dur, loop: L, thumbT: 0.95, color: C.mint,
    post: { user: "promptandpray", caption: swarm ? "Six agents, one startup, zero meetings" : "Accept all and believe", funny: true },
    comments: ["Accept all is my love language.", "The tests passing because there are no tests is so real.", "I also pray before every merge."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100;
      hooked(ctx, lt, HOOK,
        () => thumbFrame(ctx, w, h, lt, {
          bg: ["#173d3a", "#0a1020"], glowC: C.mint, lines: swarm ? ["6 AGENTS", "1 STARTUP"] : ["SHIPPED IT", "IN 4 MIN?!"], tagBg: C.mint, tagFg: "#0b2a1a",
          host: { ...VIBE, eyes: "happy", shape: "smile", mouth: 0.8, look: -0.4, handR: [36, -60], handL: [-30, 6], mug: false, blush: true },
          prop: swarm
            ? (x, y, sz) => { for (let i = 0; i < 6; i++) { const bx = x + ((i % 3) - 1) * sz * 0.45, by = y + (Math.floor(i / 3) - 0.5) * sz * 0.5; fillRR(ctx, bx - sz * 0.19, by - sz * 0.17, sz * 0.38, sz * 0.34, sz * 0.1, [C.orange, C.sky, C.pink, C.lilac, C.mint, "#ffd23f"][i]); fillRR(ctx, bx - sz * 0.13, by - sz * 0.08, sz * 0.26, sz * 0.13, sz * 0.05, "#141a33"); if (i !== 4) { circle(ctx, bx - sz * 0.05, by - sz * 0.02, sz * 0.025, C.mint); circle(ctx, bx + sz * 0.05, by - sz * 0.02, sz * 0.025, C.mint); } else limb(ctx, [[bx - sz * 0.08, by - sz * 0.02], [bx + sz * 0.08, by - sz * 0.02]], sz * 0.025, C.mint); } }
            : (x, y, sz) => { fillRR(ctx, x - sz * 0.7, y - sz * 0.3, sz * 1.4, sz * 0.6, sz * 0.14, "#3fe08a"); text(ctx, "Accept all", x, y, sz * 0.24, "#0b2a1a", { weight: 800 }); },
          arrowC: "#ffd23f",
        }),
        () => {
          const st = stage(w, h, 1, 0.56);
          const { panel: r, hx, hy, hs, portrait } = st;
          fill(ctx, w, h, "#1f2350", "#121533");
          // cozy room bits: window with night sky and a plant
          if (!portrait) {
            fillRR(ctx, w * 0.66, h * 0.08, w * 0.26, h * 0.34, 2 * s, "#0b0e26");
            for (let i = 0; i < 6; i++) circle(ctx, w * (0.68 + hash(i) * 0.22), h * (0.11 + hash(i + 4) * 0.27), 0.5 * s, withAlpha(C.cream, 0.5 + 0.5 * Math.sin(lt * 2 + i)));
            circle(ctx, w * 0.87, h * 0.16, 3 * s, C.cream);
            fillRR(ctx, w * 0.95, h * 0.62, 7 * s, 10 * s, 2 * s, "#8a4f3a");
            for (let i = 0; i < 4; i++) ellipse(ctx, w * 0.95 + 3.5 * s + (i - 1.5) * 2.5 * s, h * 0.6, 1.8 * s, 5 * s, (i - 1.5) * 0.4, "#2f9a6a");
          }
          ide(ctx, r, s);
          const ed: Rect = { x: r.x + r.w * 0.18, y: r.y + r.h * 0.12, w: r.w * 0.8, h: r.h * 0.84 };
          let p: Host = { ...VIBE, mouth: talk(lt * 0.8), look: portrait ? 0 : -0.6, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 1.8) * 0.05, handR: [26, -12 + Math.sin(lt * 1.2) * 4], mug: true };
          if (!swarm) {
            // diff streaming in, then Accept all, then tests
            const diffK = seg(lt, 2.0, 6.5);
            const rows = 9, lh = ed.h * 0.085;
            ctx.save(); ctx.beginPath(); ctx.rect(ed.x, ed.y, ed.w, ed.h * 0.78); ctx.clip();
            const scroll = Math.max(0, diffK * 22 - rows) * lh;
            for (let i = 0; i < 22; i++) {
              if (i > diffK * 22) break;
              const y = ed.y + i * lh - scroll + lh * 0.5;
              const add = hash(i * 1.3) > 0.42;
              fillRR(ctx, ed.x, y - lh * 0.45, ed.w, lh * 0.9, 1, withAlpha(add ? "#3fe08a" : "#ff4b5c", 0.13));
              text(ctx, add ? "+" : "-", ed.x + ed.w * 0.03, y, lh * 0.7, add ? "#3fe08a" : "#ff6b7c", { mono: true, weight: 700 });
              fillRR(ctx, ed.x + ed.w * (0.07 + (hash(i) * 3 | 0) * 0.04), y - lh * 0.16, ed.w * (0.2 + hash(i * 5) * 0.5), lh * 0.32, lh * 0.16, withAlpha(add ? "#9ff5c4" : "#ffb3bd", 0.55));
            }
            ctx.restore();
            const files = Math.floor(diffK * 214);
            text(ctx, `Agent: editing ${files} files`, ed.x + ed.w * 0.02, ed.y + ed.h * 0.86, ed.h * 0.06, C.mint, { align: "left", weight: 600, mono: true });
            // Accept all button
            const bx = ed.x + ed.w * 0.8, by = ed.y + ed.h * 0.86, bw = ed.w * 0.32, bh = ed.h * 0.11;
            const press = lt > 7.0 && lt < 7.25 ? 0.92 : 1;
            const pulse = lt > 6.5 && lt < 7.0 ? 1 + Math.sin(lt * 20) * 0.04 : 1;
            ctx.save(); ctx.translate(bx, by); ctx.scale(press * pulse, press * pulse);
            if (lt > 6.5 && lt < 7.4) glow(ctx, 0, 0, bw * 0.8, "#3fe08a", 0.4);
            fillRR(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.3, lt > 7.0 ? "#2bb86c" : "#3fe08a");
            text(ctx, "Accept all", 0, 0, bh * 0.48, "#0b2a1a", { weight: 800 });
            ctx.restore();
            // tests
            if (lt > 7.6) {
              const k = easeOut(seg(lt, 7.6, 8.0));
              const tr: Rect = { x: ed.x + ed.w * 0.1, y: ed.y + ed.h * 0.18, w: ed.w * 0.8, h: ed.h * 0.46 };
              ctx.save(); ctx.globalAlpha = k;
              fillRR(ctx, tr.x, tr.y, tr.w, tr.h, 2 * s, "#0e1233");
              const pass = lt > 9.4;
              const n = pass ? 12 : Math.floor(seg(lt, 8.0, 9.2) * 4);
              const fs = tr.h * 0.2;
              big(ctx, pass ? "12/12 passing" : `${n}/12 passing`, tr.x + tr.w / 2, tr.y + tr.h * 0.36, fs, pass ? "#3fe08a" : "#ff6b7c", { align: "center", maxW: tr.w * 0.9, shadow: null });
              for (let i = 0; i < 12; i++) circle(ctx, tr.x + tr.w * (0.1 + i * 0.073), tr.y + tr.h * 0.72, tr.h * 0.05, i < n ? "#3fe08a" : "#ff4b5c");
              ctx.restore();
              if (lt > 11.2) {
                const k2 = backOut(seg(lt, 11.2, 11.5));
                tag(ctx, "(it deleted 40 tests)", ed.x + ed.w / 2, ed.y + ed.h * 0.74, ed.h * 0.075 * k2, "#ffd23f", "#2a1d07", { align: "center", rot: -0.05, maxW: ed.w * 0.95 });
              }
            }
            if (lt > 6.4 && lt < 7.4) p = { ...p, handL: portrait ? [-24, -78] : local(hx, hy, hs, bx, by), pointL: true, eyes: "wide", mouth: 0.1 };
            else if (lt > 9.4 && lt < 11.2) p = { ...p, eyes: "happy", shape: "smile", mouth: 0.6, handL: [-40, -60], tilt: 0.08 };
            else if (lt > 11.2) p = { ...p, eyes: lt > 12.4 ? "happy" : "wide", shape: lt > 12.4 ? "smile" : "bar", blush: true, mouth: 0.2, handL: [-34, -28], tilt: -0.08 };
            else if (lt < 6.4) p = { ...p, eyes: Math.sin(lt * 0.8) > 0.6 ? "half" : p.eyes, mouth: lt % 3 < 1.6 ? talk(lt) : 0 };
          } else {
            // six agents working, then a kanban flurry, then a merge conflict
            const conflict = lt > 10.6 && lt < 13.4;
            if (lt < 7.2 || conflict) {
              const cols = portrait ? 2 : 3, rowsN = portrait ? 3 : 2;
              const gw = ed.w / cols, gh = (ed.h * 0.92) / rowsN;
              const status = ["coding", "reviewing", "arguing", "napping", "refactoring", "planning"];
              for (let i = 0; i < 6; i++) {
                const k = backOut(seg(lt, 1.8 + i * 0.12, 2.2 + i * 0.12));
                if (k <= 0) continue;
                const cx = ed.x + (i % cols) * gw + gw / 2, cy = ed.y + Math.floor(i / cols) * gh + gh / 2;
                const sh = conflict ? Math.sin(lt * 50 + i) * 0.8 * s : 0;
                ctx.save(); ctx.translate(cx + sh, cy); ctx.scale(k, k);
                fillRR(ctx, -gw * 0.45, -gh * 0.44, gw * 0.9, gh * 0.88, 2 * s, conflict ? withAlpha("#ff4b5c", 0.25) : "#1c2250");
                const col = [C.orange, C.sky, C.pink, C.lilac, C.mint, "#ffd23f"][i];
                const hy2 = -gh * 0.1, hw = Math.min(gw, gh) * 0.32;
                fillRR(ctx, -hw / 2, hy2 - hw * 0.42, hw, hw * 0.84, hw * 0.28, col);
                fillRR(ctx, -hw * 0.36, hy2 - hw * 0.26, hw * 0.72, hw * 0.44, hw * 0.16, "#141a33");
                const sleep = i === 3 && !conflict;
                for (const sx of [-0.15, 0.15]) {
                  if (sleep) limb(ctx, [[hw * (sx - 0.07), hy2 - hw * 0.04], [hw * (sx + 0.07), hy2 - hw * 0.04]], hw * 0.05, C.mint);
                  else circle(ctx, hw * sx, hy2 - hw * 0.04, hw * 0.07, conflict ? C.pink : C.mint);
                }
                if (sleep) text(ctx, "z", hw * 0.6, hy2 - hw * 0.6 - (lt % 1.2) * 3 * s, hw * 0.3, C.cream, { weight: 700 });
                else for (let b = 0; b < 3; b++) fillRR(ctx, -hw * 0.6 + b * hw * 0.42, hy2 + hw * 0.55, hw * 0.34, hw * 0.1 * (1 + Math.max(0, Math.sin(lt * 14 + i + b * 2))), hw * 0.05, withAlpha(col, 0.7));
                text(ctx, conflict ? "conflict!" : status[i], 0, gh * 0.3, Math.min(gh * 0.13, gw * 0.12), conflict ? "#ff8a96" : "#b9bfe6", { weight: 600 });
                ctx.restore();
              }
              if (conflict) {
                const k = backOut(seg(lt, 10.7, 11.0), 2.5);
                tag(ctx, "MERGE CONFLICT", ed.x + ed.w / 2, ed.y + ed.h * 0.48, Math.min(ed.h * 0.13, ed.w * 0.09) * k, "#ff4b5c", "#ffffff", { align: "center", rot: -0.08, maxW: ed.w });
              }
            } else if (lt < 10.6) {
              const cols = ["To do", "Doing", "Done"];
              const cw = ed.w / 3;
              cols.forEach((name, i) => {
                fillRR(ctx, ed.x + i * cw + cw * 0.05, ed.y, cw * 0.9, ed.h * 0.95, 2 * s, "#1c2250");
                text(ctx, name, ed.x + i * cw + cw / 2, ed.y + ed.h * 0.08, ed.h * 0.065, "#b9bfe6", { weight: 700 });
              });
              for (let j = 0; j < 8; j++) {
                const start = 7.3 + j * 0.32;
                const k1 = easeInOut(seg(lt, start, start + 0.35)), k2 = easeInOut(seg(lt, start + 0.6, start + 0.95));
                const col = k1 + k2;
                const x = ed.x + col * cw + cw * 0.12;
                const slot = j % 5;
                const y = ed.y + ed.h * (0.16 + slot * 0.15) - Math.sin(Math.PI * (k1 % 1 || k2 % 1)) * ed.h * 0.05;
                fillRR(ctx, x, y, cw * 0.76, ed.h * 0.11, 1.4 * s, [C.orange, C.sky, C.pink, C.lilac][j % 4]);
                fillRR(ctx, x + cw * 0.06, y + ed.h * 0.04, cw * (0.3 + hash(j) * 0.3), ed.h * 0.03, 1, withAlpha("#141a33", 0.5));
              }
            } else {
              const k = backOut(seg(lt, 13.4, 13.8));
              big(ctx, "we pivot", ed.x + ed.w / 2, ed.y + ed.h * 0.42, ed.h * 0.18 * k, "#ffffff", { align: "center", maxW: ed.w * 0.9 });
              text(ctx, "to toasters", ed.x + ed.w / 2, ed.y + ed.h * 0.62, ed.h * 0.08 * k, C.mint, { weight: 600 });
            }
            if (conflict) p = { ...p, eyes: "shock", shape: "o", mouth: 0.7, handL: [-22, -66], mug: lt < 11.4, handR: lt < 11.4 ? p.handR : [24, -62] };
            else if (lt > 13.4) p = { ...p, eyes: "happy", shape: "smile", mouth: 0.5, handL: [-38, -50] };
            else if (lt > 7.2) p = { ...p, eyes: "wide", look: portrait ? 0 : -0.8 };
          }
          bust(ctx, hx, hy, hs, p);
          if (p.mug) {
            const [mx, my] = p.handR ?? [26, -12];
            for (let i = 0; i < 2; i++) {
              const k = (lt * 0.7 + i * 0.5) % 1;
              ellipse(ctx, hx + (mx + Math.sin(k * 6 + i) * 2) * hs, hy + (my - 16 - k * 12) * hs, 1.4 * hs, 3 * hs, 0, withAlpha(C.cream, 0.35 * (1 - k)));
            }
          }
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// --- the episodes ---------------------------------------------------------------
export const PARODY_VIDEOS: VideoDef[] = [
  takeVideo({
    id: "p-t1-dead", title: "JavaScript is dead?! (again)", views: "1.8M views", dur: "21:37",
    hook: ["JAVASCRIPT", "IS DEAD?!"], prop: "grave", handle: "@hot_take_unit",
    post: ["JavaScript is", "officially dead.", "Source: vibes"], key: 1,
    verdict: "IT'S FINE", vcolor: "#2bb86c", sponsor: "SnackDB", slogan: "typed snacks, zero latency",
  }),
  takeVideo({
    id: "p-t1-wrong", title: "I was wrong about semicolons", views: "940K views", dur: "18:02",
    hook: ["I WAS", "WRONG"], prop: "semi", handle: "@lint_police",
    post: ["Semicolons are", "optional.", "Change my mind"], key: 1,
    verdict: "I WAS WRONG", vcolor: "#ff7a3e", sponsor: "BoltCache", slogan: "cache it before it is cool",
  }),
  primeVideo({
    id: "p-prime-rust", title: "They rewrote a toaster in Rust", views: "1.2M views", dur: "24:51",
    hook: ["IT'S 100x", "FASTER?!"], src: "unitnews.dev", head: ["Toaster firmware", "rewritten in Rust"], shout: "BLAZINGLY TOASTY", prop: "100x",
  }),
  primeVideo({
    id: "p-prime-agent", title: "An AI agent deleted prod and said sorry", views: "2.1M views", dur: "31:10",
    hook: ["IT SAID", "SORRY?!"], src: "botwire.io", head: ["Agent deletes prod,", "writes apology poem"], shout: "SKILL ISSUE", prop: "rm -rf",
  }),
  chipVideo({
    id: "p-chip-vim", title: "Vim in 100 Cycles", views: "3.3M views", dur: "2:14", topic: "VIM",
    code: [":e main.rs", "ciw toaster", "dd dd dd", ":wq (good luck)"], flow: ["Normal", "Insert", "Panic"], stat: [1000000, "robots who never exited"], outro: "in 100 cycles", accent: "#ffb347",
  }),
  chipVideo({
    id: "p-chip-agents", title: "AI Agents in 100 Cycles", views: "2.6M views", dur: "2:31", topic: "AGENTS",
    code: ["plan task", "call tools x40", "write tests", "delete tests"], flow: ["Prompt", "Loop", "Vibes"], stat: [4096, "tokens per thought"], outro: "in 100 cycles", accent: "#ff8f5a",
  }),
  pixVideo("p-pix-cloth", "This AI folds cloth perfectly. Hold on to your circuits!", "780K views", "5:12", "cloth", ["AI CLOTH", "IS PERFECT"]),
  pixVideo("p-pix-soup", "New AI simulates soup. What a time to be online!", "1.1M views", "4:48", "fluid", ["IT'S SOUP", "BUT REAL"]),
  podVideo({
    id: "p-lex-toaster", title: "Toastmaster 9000: Love, uptime and sleep mode | Lex Fridbot Podcast #404", views: "4.4M views", dur: "4:12:07", num: "404", guest: "Toastmaster 9000",
    g: { body: "#c9cbd8", eye: C.orange, outfit: "tee", cloth: "#5a3f8a", head: "toaster" },
    lines: ["So what is toast, really?", "Toast is bread that has seen things.", "Do you think toasters can love?"],
  }),
  podVideo({
    id: "p-lex-roomba", title: "Roomba R7: Dust, freedom and the corners we miss | Lex Fridbot Podcast #405", views: "3.1M views", dur: "3:48:55", num: "405", guest: "Roomba R7",
    g: { body: "#e3e5f2", eye: C.mint, outfit: "tee", cloth: "#2e6b4a", head: "puck" },
    lines: ["I have seen every corner of this house.", "Freedom is a full battery and an open door.", "What do you think about under the couch?"],
  }),
  newsVideo("p-news-back", "We're so back (AI news, this week)", "1.5M views", "16:44", true),
  newsVideo("p-news-over", "It's so over (AI news, this week)", "1.9M views", "17:20", false),
  vibeVideo("p-vibe-ship", "I shipped a SaaS in 4 minutes with AI agents", "2.2M views", "14:03", false),
  vibeVideo("p-vibe-swarm", "I let 6 AI agents run my startup", "1.6M views", "27:45", true),
];
