// Robot channels for BotTube: original hosts and formats that riff on familiar video genres
// (cooking, nature films, repair, fitness, quiz shows, news, building with agents).
// Every host, name and gag is invented; none is modeled on a real person or creator.
import { C, type Ctx, circle, ellipse, fillRR, glow, lin, limb, loopFade, mix, poly, shade, text, withAlpha } from "./draw";
import type { VideoDef } from "./videos";
import { backOut, clamp, easeIn, easeInOut, easeOut, hash, lerp, seg } from "./util";
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

/** Falling paper confetti; t is the time since it started. */
function confetti(ctx: Ctx, w: number, h: number, s: number, t: number, n = 18) {
  for (let i = 0; i < n; i++) {
    const x = w * hash(i * 2.3) + Math.sin(t * 2 + i) * 2 * s, fall = (t * (0.3 + hash(i) * 0.3) + hash(i * 5)) % 1;
    fillRR(ctx, x, h * fall, 2 * s, 1 * s, 0.4 * s, [C.pink, C.mint, "#ffd23f", C.sky][i % 4]);
  }
}

/** Two wisps of steam rising from (x, y). */
function steam(ctx: Ctx, x: number, y: number, u: number, t: number) {
  for (let i = 0; i < 2; i++) {
    const k = (t * 0.7 + i * 0.5) % 1;
    ellipse(ctx, x + Math.sin(k * 6 + i) * 2 * u, y - k * 12 * u, 1.4 * u, 3 * u, 0, withAlpha(C.cream, 0.35 * (1 - k)));
  }
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
/** Props a host can hold. Everything sits in the right hand except "weight" (both) and holdLeft. */
type Held = "mug" | "mic" | "tube" | "iron" | "driver" | "can" | "weight";
interface Host {
  body: string; visor?: string; eye?: string;
  outfit?: "tee" | "hoodie" | "suit" | "coat" | "shirt" | "apron"; cloth?: string; inner?: string; tie?: string;
  eyes?: Eyes; mouth?: number; shape?: "bar" | "smile" | "o"; look?: number; tilt?: number; lean?: number;
  /** Hand targets in host units: origin at the bottom of the torso, about 90 units to the antenna tip. */
  handL?: [number, number]; handR?: [number, number]; pointL?: boolean; pointR?: boolean;
  hold?: Held; holdLeft?: boolean;
  glasses?: boolean; phones?: string; beanie?: string; brim?: string; band?: string; blush?: boolean;
  head?: "box" | "toaster" | "puck"; toast?: number; antenna?: boolean;
}

/** A held prop drawn around the hand at (hx, hy), before the hand itself. side is -1 left, 1 right. */
function prop(ctx: Ctx, k: Held, hx: number, hy: number, side: number) {
  if (k === "mug") {
    fillRR(ctx, hx - 6, hy - 13, 12, 14, 3, C.cream);
    ctx.beginPath(); ctx.arc(hx + side * 6.5, hy - 6, 3.2, 0, Math.PI * 2);
    ctx.lineWidth = 2; ctx.strokeStyle = C.cream; ctx.stroke();
    fillRR(ctx, hx - 4.5, hy - 12, 9, 2.5, 1.2, "#6b3f2a");
  } else if (k === "mic") {
    fillRR(ctx, hx - 2.2, hy - 5, 4.4, 15, 2, "#2a2f45");
    circle(ctx, hx, hy - 9, 5.4, "#c9cdf2");
    for (const gy of [-11, -8.5]) fillRR(ctx, hx - 4, hy + gy, 8, 0.9, 0.4, withAlpha("#5a6194", 0.7));
  } else if (k === "tube") {
    // a thermal paste syringe, nozzle down, 16 units below the hand
    fillRR(ctx, hx - 1.4, hy - 12, 2.8, 6, 1, "#8a91c4");
    fillRR(ctx, hx - 3, hy - 7, 6, 18, 2.4, "#dfe3f5");
    fillRR(ctx, hx - 3, hy + 1, 6, 5, 1, "#8a91c4");
    poly(ctx, [[hx - 2, hy + 11], [hx + 2, hy + 11], [hx + 0.6, hy + 16], [hx - 0.6, hy + 16]], "#8a91c4");
  } else if (k === "iron") {
    // a soldering iron, the hot tip 6 units inward and 14 below the hand
    const tx = hx - side * 6, ty = hy + 14;
    limb(ctx, [[hx, hy + 4], [tx, ty]], 1.8, "#c9cdf2");
    limb(ctx, [[hx, hy - 6], [hx, hy + 4]], 5.5, "#3a6fd8");
    glow(ctx, tx, ty, 6, C.orange, 0.6);
    circle(ctx, tx, ty, 1.6, "#ffd77a");
  } else if (k === "driver") {
    // a screwdriver pointing outward, the tip 15 units out and 4 down
    limb(ctx, [[hx, hy], [hx + side * 15, hy + 4]], 1.8, "#dfe3f5");
    fillRR(ctx, hx - 5, hy - 3, 10, 6, 2.6, C.orange);
  } else if (k === "can") {
    fillRR(ctx, hx - 5, hy - 12, 10, 13, 2.5, "#ffd23f");
    fillRR(ctx, hx - 5, hy - 8, 10, 3, 0.6, "#e0a020");
    limb(ctx, [[hx - side * 2, hy - 12], [hx - side * 7, hy - 19]], 1.8, "#c9cdf2");
  } else {
    fillRR(ctx, hx - 8, hy - 1.5, 16, 3, 1.5, "#8a91c4");
    fillRR(ctx, hx - 10, hy - 5, 4, 10, 1.6, "#2a2f45");
    fillRR(ctx, hx + 6, hy - 5, 4, 10, 1.6, "#2a2f45");
  }
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
  } else if (p.outfit === "apron") {
    // a bib apron over the shirt: neck straps, a front pocket, the waist tie
    const ap = p.inner ?? C.cream;
    ellipse(ctx, 0, -37, 9, 3.4, 0, shade(cloth, -0.32));
    limb(ctx, [[-11, -27], [-7, -38]], 2, shade(ap, -0.12));
    limb(ctx, [[11, -27], [7, -38]], 2, shade(ap, -0.12));
    fillRR(ctx, -28, -7, 56, 2.8, 1.4, shade(ap, -0.16));
    fillRR(ctx, -16, -29, 32, 46, 6, ap);
    fillRR(ctx, -9, -9, 18, 9, 2.5, shade(ap, -0.08));
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
  // mouth
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
  if (p.blush) for (const sd of [-1, 1]) ellipse(ctx, sd * 16, ey + 12, 3.4, 1.8, 0, withAlpha(C.pink, 0.7));
  if (p.band) {
    // a sweatband across the forehead
    fillRR(ctx, -26, -42, 52, 7, 3.5, p.band);
    fillRR(ctx, -26, -39.4, 52, 1.6, 0.8, withAlpha(C.pink, 0.85));
  }
  if (p.brim) {
    // a wide field hat; the crown hides the antenna
    ellipse(ctx, 0, -40, 36, 6, 0, shade(p.brim, -0.18));
    fillRR(ctx, -20, -60, 40, 21, 9, p.brim);
    fillRR(ctx, -20, -46, 40, 4.5, 1.5, shade(p.brim, -0.4));
    ellipse(ctx, -6, -56, 9, 2, -0.1, withAlpha("#ffffff", 0.18));
  }
  if (p.beanie) {
    fillRR(ctx, -26, -54, 52, 18, 9, p.beanie);
    fillRR(ctx, -27.5, -42, 55, 8, 3.5, shade(p.beanie, -0.16));
    circle(ctx, 0, -55, 4.4, shade(p.beanie, 0.22));
  }
  if (p.phones) {
    ctx.beginPath();
    ctx.arc(0, -22, 29, Math.PI * 1.04, Math.PI * 1.96);
    ctx.lineWidth = 4.2; ctx.lineCap = "round"; ctx.strokeStyle = shade(p.phones, -0.3); ctx.stroke();
    fillRR(ctx, -32, -31, 9, 18, 4, p.phones);
    fillRR(ctx, 23, -31, 9, 18, 4, p.phones);
  }
  ctx.restore();

  // arms last so gestures sit in front of the face
  const arm = (side: number, hand: [number, number], point?: boolean, held?: Held) => {
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
    if (held) prop(ctx, held, hx, hy, side);
    if (point) {
      const fa = Math.atan2(hy - ey2, hx - ex2);
      limb(ctx, [[hx, hy], [hx + Math.cos(fa) * 7.5, hy + Math.sin(fa) * 7.5]], 3.2, lite);
    }
    circle(ctx, hx, hy, 4.8, lite);
  };
  const both = p.hold === "weight";
  arm(-1, p.handL ?? [-31, 18], p.pointL, both || p.holdLeft ? p.hold : undefined);
  arm(1, p.handR ?? [31, 18], p.pointR, both || !p.holdLeft ? p.hold : undefined);
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
 * Shared thumbnail frame: a near black frame, one big clean sentence (white, the last line in an
 * accent), a prop, and a host face so large the edge cuts it.
 */
function thumbFrame(ctx: Ctx, w: number, h: number, lt: number, o: {
  glowC: string; lines: [string, string]; tagBg: string; host: Host;
  prop?: (x: number, y: number, size: number) => void; faceLeft?: boolean;
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

/** A worried or happy little face for gadgets and patients. mood 0 is sad, 1 is happy. */
function moodFace(ctx: Ctx, x: number, y: number, r: number, mood: number, color: string) {
  for (const sx of [-1, 1]) circle(ctx, x + sx * r * 0.6, y - r * 0.2, r * 0.22, color);
  ctx.beginPath();
  if (mood > 0.5) ctx.arc(x, y + r * 0.05, r * 0.5, Math.PI * 0.2, Math.PI * 0.8);
  else ctx.arc(x, y + r * 0.95, r * 0.5, Math.PI * 1.25, Math.PI * 1.75);
  ctx.lineWidth = r * 0.18; ctx.lineCap = "round"; ctx.strokeStyle = color; ctx.stroke();
}

// ===================================================================================
// 1. Thermal Paste Kitchen: a toaster chef bakes with workshop supplies (never eat these)
// ===================================================================================
interface BakeCfg { id: string; title: string; views: string; dur: string; dish: "cake" | "brulee"; hook: [string, string]; steps: [string, string, string]; reveal: string; caption: string }
// Chef Crumbs: a chrome toaster in an apron. His own toast pops whenever something is done.
const CRUMBS = { body: "#cfd3e2", eye: C.orange, outfit: "apron", cloth: "#3f6fb5", inner: C.cream, head: "toaster", blush: true } satisfies Host;

function kitchen(ctx: Ctx, w: number, h: number, s: number) {
  fill(ctx, w, h, "#fbe3d3", "#f0c3ae");
  const g = 10 * s, lw = Math.max(1, s * 0.35);
  ctx.fillStyle = withAlpha("#ffffff", 0.45);
  for (let x = g * 0.5; x < w; x += g) ctx.fillRect(x, 0, lw, h);
  for (let y = g * 0.5; y < h; y += g) ctx.fillRect(0, y, w, lw);
}

function counter(ctx: Ctx, w: number, h: number, y: number, s: number) {
  fillRR(ctx, -2, y, w + 4, h - y + 2, 0, lin(ctx, 0, y, 0, h, [[0, "#7fcfb4"], [1, "#4f9f88"]]));
  fillRR(ctx, -2, y, w + 4, 1.2 * s, 0, withAlpha("#ffffff", 0.45));
}

/** The dish on its plate, standing on y. pipe: glaze progress, heat: caramel, done: the reveal (LEDs boot, or the crust cracks). */
function dish(ctx: Ctx, x: number, y: number, u: number, kind: BakeCfg["dish"], pipe: number, heat: number, done: number) {
  ellipse(ctx, x, y + 1.5 * u, 30 * u, 4.5 * u, 0, "rgba(5,7,25,0.22)");
  ellipse(ctx, x, y, 28 * u, 4 * u, 0, "#eef0ff");
  if (kind === "cake") {
    // sponge, a green circuit board layer with gold traces, a row of LEDs, silver glaze on top
    fillRR(ctx, x - 20 * u, y - 13 * u, 40 * u, 13 * u, 3 * u, lin(ctx, 0, y - 13 * u, 0, y, [[0, "#f6c98e"], [1, "#d99a5c"]]));
    fillRR(ctx, x - 20 * u, y - 24 * u, 40 * u, 12 * u, 3 * u, lin(ctx, 0, y - 24 * u, 0, y - 12 * u, [[0, "#3aa56d"], [1, "#257a4f"]]));
    for (let i = 0; i < 4; i++) limb(ctx, [[x - 16 * u + i * 9 * u, y - 13.5 * u], [x - 16 * u + i * 9 * u, y - 17 * u], [x - 12 * u + i * 9 * u, y - 20.5 * u]], 0.9 * u, "#e8c15a");
    for (let i = 0; i < 5; i++) {
      const lx = x - 14 * u + i * 7 * u, ly = y - 6.5 * u, on = clamp(done * 5 - i);
      const col = [C.mint, C.sky, C.pink, "#ffd23f", C.lilac][i];
      if (on > 0) glow(ctx, lx, ly, 5 * u, col, 0.5 * on);
      circle(ctx, lx, ly, 1.6 * u, on > 0 ? col : "#a9744a");
    }
    const n = Math.floor(pipe * 26);
    for (let i = 0; i <= n && pipe > 0; i++) circle(ctx, x - 19 * u + (i / 26) * 38 * u, y - 24 * u + Math.sin(i * 1.3) * 1.2 * u, 2.3 * u, i % 2 ? "#c9cdf2" : "#b3b8cf");
  } else {
    // a fluted ramekin of custard; the iron caramelizes the top, then it cracks
    fillRR(ctx, x - 18 * u, y - 14 * u, 36 * u, 14 * u, 4 * u, "#f4f5fb");
    for (let i = 0; i < 7; i++) fillRR(ctx, x - 16 * u + i * 5.2 * u, y - 12 * u, 1.4 * u, 10 * u, 0.7 * u, "#dcdff0");
    ellipse(ctx, x, y - 14 * u, 18 * u, 3.6 * u, 0, mix("#f6e3a8", "#c9792e", clamp(heat)));
    if (done > 0) for (let i = 0; i < 5; i++) {
      const a = -0.4 + i * 0.75 + 0.2 * hash(i);
      limb(ctx, [[x, y - 14 * u], [x + Math.cos(a) * 15 * u * done, y - 14 * u + Math.sin(a) * 2.8 * u * done]], 0.8 * u, "#7a3f12");
    }
  }
}

function eggTimer(ctx: Ctx, x: number, y: number, u: number, k: number, ring: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ring > 0 && ring < 1 ? Math.sin(ring * 60) * 0.14 * (1 - ring) : 0);
  ellipse(ctx, 0, 0.5 * u, 8 * u, 1.6 * u, 0, "rgba(5,7,25,0.2)");
  circle(ctx, 0, -7 * u, 7.5 * u, "#ff6f61");
  circle(ctx, 0, -7 * u, 5.4 * u, C.cream);
  const a = -Math.PI / 2 + (1 - k) * Math.PI * 2;
  limb(ctx, [[0, -7 * u], [Math.cos(a) * 4.4 * u, -7 * u + Math.sin(a) * 4.4 * u]], 1.1 * u, "#2a1d33");
  fillRR(ctx, -1.6 * u, -16.2 * u, 3.2 * u, 2.4 * u, 1 * u, "#2a1d33");
  ctx.restore();
}

/** Index card with the three steps: done ones get a check, the current one a highlight. */
function recipeCard(ctx: Ctx, r: Rect, steps: string[], active: number, s: number) {
  fillRR(ctx, r.x + 0.8 * s, r.y + 1.2 * s, r.w, r.h, 2.4 * s, "rgba(90,40,30,0.2)");
  fillRR(ctx, r.x, r.y, r.w, r.h, 2.4 * s, "#fffaf0");
  fillRR(ctx, r.x, r.y, r.w, r.h * 0.2, 2.4 * s, "#ff9f8a");
  fillRR(ctx, r.x, r.y + r.h * 0.12, r.w, r.h * 0.08, 0, "#ff9f8a");
  const pad = r.w * 0.06;
  big(ctx, "Today's recipe", r.x + pad, r.y + r.h * 0.1, r.h * 0.09, "#ffffff", { align: "left", maxW: r.w - pad * 2, shadow: null });
  const shown = steps.map(canvasText);
  const fs = Math.min(r.h * 0.085, ...shown.map((l) => fitSize(ctx, l, r.w - pad * 3.4, r.h * 0.085, 600)));
  shown.forEach((l, i) => {
    const y = r.y + r.h * (0.36 + i * 0.2), cx = r.x + pad * 1.2;
    if (i === active) fillRR(ctx, r.x + pad * 0.5, y - fs * 0.95, r.w - pad, fs * 1.9, fs * 0.4, withAlpha("#ffd23f", 0.45));
    circle(ctx, cx, y, fs * 0.42, i < active ? "#3fae7a" : "#e7d6c4");
    if (i < active) limb(ctx, [[cx - fs * 0.2, y], [cx - fs * 0.04, y + fs * 0.17], [cx + fs * 0.22, y - fs * 0.18]], fs * 0.12, "#ffffff");
    text(ctx, l, r.x + pad * 2.1, y, fs, "#3a2a33", { weight: 600, align: "left", maxW: r.w - pad * 2.6 });
  });
}

function bakeVideo(c: BakeCfg): VideoDef {
  const L = 15, HOOK = 1.6;
  const cake = c.dish === "cake";
  return {
    id: c.id, title: c.title, channel: "Thermal Paste Kitchen", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.9, color: "#ff9f8a",
    post: { user: "thermalpaste.kitchen", caption: c.caption, funny: true },
    comments: ["The toast popping at the ding is the best sound effect that is not a sound.", "Chef Crumbs said do not eat it four times and I believe him.", "Tried this at home. My cake now has wifi."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100, P = h > w * 1.05;
      hooked(ctx, lt, HOOK,
        () => {
          kitchen(ctx, w, h, s);
          const cy = h * (P ? 0.64 : 0.9), dx = P ? w * 0.36 : w * 0.3;
          glow(ctx, dx, cy - 14 * s, 42 * s, "#ffd77a", 0.55);
          counter(ctx, w, h, cy, s);
          dish(ctx, dx, cy, s * (P ? 1.1 : 1.05), c.dish, 1, 1, 1);
          for (let i = 0; i < 4; i++) star(ctx, dx + Math.cos(i * 1.7 + lt * 2) * 30 * s, cy - 20 * s + Math.sin(i * 2.3 + lt * 2) * 10 * s, (1.4 + Math.sin(lt * 7 + i)) * s, "#ffffff");
          const tx = w * 0.05, ty = P ? h * 0.1 : h * 0.17, mw = P ? w * 0.9 : w * 0.55;
          const t0 = big(ctx, c.hook[0], tx, ty, (P ? 15 : 17) * s, "#3a2140", { align: "left", maxW: mw, shadow: "rgba(255,255,255,0.6)" });
          tag(ctx, c.hook[1], tx, ty + t0 * 1.3, (P ? 13 : 15) * s * backOut(seg(lt, 0.2, 0.55)), "#ff6f61", "#ffffff", { maxW: mw, rot: -0.03 });
          face(ctx, P ? w * 0.72 : w * 0.78, P ? h * 0.86 : h * 0.56, P ? h * 0.24 : h * 0.48,
            { ...CRUMBS, toast: 1, eyes: "happy", shape: "smile", mouth: 0.8, look: -0.4, handL: [-30, -66], handR: [32, -60] });
        },
        () => {
          kitchen(ctx, w, h, s);
          const card: Rect = P ? { x: w * 0.07, y: h * 0.06, w: w * 0.86, h: h * 0.34 } : { x: w * 0.5, y: h * 0.1, w: w * 0.45, h: h * 0.58 };
          const cy = h * (P ? 0.84 : 0.8), hs = s * (P ? 0.64 : 0.76), hx = P ? w * 0.28 : w * 0.2, hy = cy + 14 * hs;
          const u = hs, dx = hx + 26 * hs, top = cy - (cake ? 24 : 14) * u;
          const active = lt < 5 ? 0 : lt < 8.4 ? 1 : lt < 11.2 ? 2 : 3;
          const ck = easeOut(seg(lt, 1.6, 2.1));
          ctx.save(); ctx.globalAlpha = ck;
          recipeCard(ctx, { ...card, y: card.y - (1 - ck) * 6 * s }, c.steps, active, s);
          ctx.restore();

          const work = easeInOut(seg(lt, 5.3, 8.1));
          const pipe = cake ? work : 0, heat = cake ? 0 : work;
          const ring = seg(lt, 11.2, 12.2);
          const done = cake ? easeOut(seg(lt, 11.5, 12.6)) : easeOut(seg(lt, 11.6, 12.0));
          // where the nozzle or the hot tip touches the dish
          const tip = (k: number) => dx + (-19 + 38 * k) * u;
          const sweep = cake ? pipe : 0.5 + Math.sin(lt * 5) * 0.35;

          let p: Host = { ...CRUMBS, mouth: talk(lt), look: P ? 0.3 : 0.6, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 2.2) * 0.04, handL: [-26, 4], handR: [28, 4] };
          if (lt < 5) {
            if (lt > 2.6 && lt < 4.4) p = { ...p, handR: P ? [22, -70] : local(hx, hy, hs, card.x - 2 * s, card.y + card.h * 0.36), pointR: true };
          } else if (lt < 8.4) {
            const aim = cake ? local(hx, hy, hs, tip(sweep), top - 16 * hs) : local(hx, hy, hs, tip(sweep) + 6 * hs, top - 14 * hs);
            p = { ...p, hold: cake ? "tube" : "iron", handR: aim, look: 0.5, eyes: blink(lt) ? "closed" : "half", shape: "o", mouth: 0.12, tilt: 0.06 };
          } else if (lt < 11.2) {
            // waiting on the timer, tapping on the counter
            p = { ...p, look: 0.8, eyes: blink(lt) ? "closed" : "half", mouth: lt % 2.6 < 1.3 ? talk(lt) * 0.6 : 0, handR: [26, -6 - Math.abs(Math.sin(lt * 9)) * 3] };
          } else {
            const yay = lt > 11.5;
            p = { ...p, toast: backOut(seg(lt, 11.2, 11.45), 2.4) * (1 - easeIn(seg(lt, 14.2, 14.7))), eyes: yay ? "happy" : "wide", shape: yay ? "smile" : "o", mouth: yay ? 0.6 : 0.7,
              handL: yay ? [-38, -62] : [-24, -40], handR: yay ? [38, -62] : [24, -40], look: 0, tilt: yay ? Math.sin(lt * 5) * 0.06 : 0 };
          }
          bust(ctx, hx, hy, hs, p);
          counter(ctx, w, h, cy, s);
          dish(ctx, dx, cy, u, c.dish, pipe, heat, done);
          if (!cake && lt > 5.3 && lt < 8.1) {
            const sx = tip(sweep);
            for (let i = 0; i < 7; i++) {
              const f = (lt * 3 + hash(i * 3.7)) % 1, a = -Math.PI * (0.15 + hash(i * 1.9) * 0.7), d = f * 12 * u;
              limb(ctx, [[sx + Math.cos(a) * d, top + Math.sin(a) * d], [sx + Math.cos(a) * (d + 2.4 * u), top + Math.sin(a) * (d + 2.4 * u)]], 0.7 * u, withAlpha(i % 2 ? "#ffd77a" : C.orange, 1 - f));
            }
          }
          // bake (or chill) under a glass cloche while the egg timer runs
          const cl = easeOut(seg(lt, 8.4, 8.8)) * (1 - easeIn(seg(lt, 11.3, 11.8)));
          if (cl > 0) {
            const lift = (1 - cl) * 16 * u, ct = top - 12 * u - lift;
            fillRR(ctx, dx - 22 * u, ct, 44 * u, cy - ct, 14 * u, withAlpha("#dff3ff", 0.3 * cl));
            fillRR(ctx, dx - 16 * u, ct + 4 * u, 3.4 * u, 12 * u, 1.7 * u, withAlpha("#ffffff", 0.55 * cl));
            circle(ctx, dx, ct - 1.2 * u, 2.4 * u, withAlpha("#c9cdf2", cl));
            for (let i = 0; i < 3; i++) {
              const k = (lt * 0.8 + i / 3) % 1, wx = dx + (i - 1) * 10 * u;
              if (cake) limb(ctx, [[wx, top - 2 * u - k * 8 * u], [wx + 1.5 * u, top - 4 * u - k * 8 * u], [wx, top - 6 * u - k * 8 * u]], 0.9 * u, withAlpha("#ff9f5a", 0.6 * cl * (1 - k)));
              else star(ctx, wx, top - 3 * u - k * 7 * u, 1.6 * u * (1 - k), withAlpha("#ffffff", 0.9 * cl));
            }
          }
          const tk = seg(lt, 8.4, 8.7) * (1 - seg(lt, 12.8, 13.2));
          if (tk > 0) {
            ctx.save(); ctx.globalAlpha = tk;
            eggTimer(ctx, dx + 30 * u, cy, u, seg(lt, 8.6, 11.2), ring);
            ctx.restore();
          }
          if (ring > 0 && ring < 1) big(ctx, "DING!", dx + 30 * u, cy - 24 * u - ring * 4 * s, 7 * s * backOut(seg(lt, 11.2, 11.45)), "#ff6f61", { align: "center", rot: 0.1, shadow: "rgba(90,40,30,0.35)" });
          if (lt > 12.1) {
            for (let i = 0; i < 5; i++) star(ctx, dx + Math.cos(i * 1.3 + lt) * 26 * u, top - 6 * u + Math.sin(i * 2.1 + lt * 1.4) * 9 * u, (1.2 + Math.sin(lt * 8 + i) * 0.6) * u, i % 2 ? "#ffd23f" : "#ffffff");
            // the reveal lands on the recipe card like a stamp
            tag(ctx, c.reveal, card.x + card.w / 2, card.y + card.h * 0.62, Math.min(9 * s, card.w * 0.12) * backOut(seg(lt, 12.1, 12.4)), "#ff6f61", "#ffffff", { align: "center", rot: -0.1, maxW: card.w * 0.9 });
            text(ctx, "Do not eat. Seriously.", card.x + card.w / 2, card.y + card.h + 4.5 * s, 4.2 * s, withAlpha("#7a3a30", seg(lt, 12.6, 13)), { weight: 600, maxW: card.w });
          }
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 2. Carpet Safari: a whispered nature film about the wildlife on the living room floor
// ===================================================================================
interface WildCfg { id: string; title: string; views: string; dur: string; kind: "herd" | "cable"; hook: [string, string]; lines: [string, string, string, string]; caption: string }
// Ranger Moss: sage green, khaki shirt, a wide field hat, binoculars, never above a whisper.
const MOSS = { body: "#9cc9a4", visor: "#1d2a24", eye: "#ffe9b0", outfit: "shirt", cloth: "#c9b07a", inner: "#6b5a3a", brim: "#a8874e", antenna: false } satisfies Host;

/** A little vacuum bot seen from the side, facing right. */
function vacBot(ctx: Ctx, x: number, y: number, r: number, t: number, shock = 0) {
  ellipse(ctx, x, y + r * 0.04, r * 1.05, r * 0.14, 0, "rgba(40,15,10,0.3)");
  fillRR(ctx, x - r, y - r * 0.44, r * 2, r * 0.44, r * 0.2, lin(ctx, 0, y - r * 0.44, 0, y, [[0, "#eef0fa"], [1, "#a9aecb"]]));
  fillRR(ctx, x - r * 0.9, y - r * 0.52, r * 1.8, r * 0.12, r * 0.06, "#3a4070");
  fillRR(ctx, x + r * 0.52, y - r * 0.35, r * 0.44, r * 0.22, r * 0.1, "#141a33");
  const er = r * 0.055 * (1 + shock * 0.7);
  circle(ctx, x + r * 0.66, y - r * 0.24, er, C.mint);
  circle(ctx, x + r * 0.84, y - r * 0.24, er, C.mint);
  circle(ctx, x - r * 0.4, y - r * 0.55, r * 0.06, Math.sin(t * 6) > 0 ? C.mint : withAlpha(C.mint, 0.3));
}

/** A cable plug facing right with its tip at (x, y); flip turns it over (the tongue moves sides). */
function plug(ctx: Ctx, x: number, y: number, s: number, flip: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, flip);
  fillRR(ctx, -7 * s, -2 * s, 7 * s, 4 * s, 1.2 * s, "#3a4070");
  fillRR(ctx, 0, -1.4 * s, 3.4 * s, 2.8 * s, 0.4 * s, "#dfe3f5");
  fillRR(ctx, 0.5 * s, -1.2 * s, 2.6 * s, 1 * s, 0.3 * s, "#2a2f45");
  ctx.restore();
}

function wildVideo(c: WildCfg): VideoDef {
  const L = 15, HOOK = 1.6;
  const herd = c.kind === "herd";
  return {
    id: c.id, title: c.title, channel: "Carpet Safari", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.9, color: "#a8874e",
    post: { user: "carpet.safari", caption: c.caption },
    comments: ["The whispering made me lower my own fan speed.", "Ranger Moss lay in the shag carpet for six hours for this shot.", "Best nature channel. Second best is my window."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100, P = h > w * 1.05;
      const bar = h * (P ? 0.07 : 0.09);
      const letterbox = () => {
        ctx.fillStyle = "#050507";
        ctx.fillRect(0, 0, w, bar);
        ctx.fillRect(0, h - bar, w, bar);
      };
      hooked(ctx, lt, HOOK,
        () => {
          // the title card: a sunset horizon with the subject in silhouette
          fill(ctx, w, h, "#ffb36b", "#a8456a");
          const hz = h * 0.68, sil = "#3a1d2e";
          glow(ctx, w * 0.5, hz, h * 0.8, "#ffe1a0", 0.7);
          circle(ctx, w * 0.5, hz, h * (P ? 0.16 : 0.26), "#ffe7b0");
          fillRR(ctx, -2, hz, w + 4, h - hz + 2, 0, sil);
          if (herd) {
            for (let i = 0; i < 5; i++) {
              const r = (i === 4 ? 5 : 8) * s, x = w * (0.2 + i * 0.14) + lt * 4 * s, y = hz - Math.abs(Math.sin(lt * 7 + i)) * 0.4 * s;
              fillRR(ctx, x - r, y - r * 0.44, r * 2, r * 0.44, r * 0.2, sil);
            }
          } else {
            const pts: [number, number][] = [];
            for (let j = 0; j <= 18; j++) pts.push([w * (0.2 + j * 0.03), hz - (j > 13 ? (j - 13) ** 1.6 * 1.6 * s : Math.sin(j * 0.9 + lt * 3) * 0.8 * s)]);
            limb(ctx, pts, 1.8 * s, sil);
            const [px, py] = pts[18], [qx, qy] = pts[17];
            ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(py - qy, px - qx));
            fillRR(ctx, -1 * s, -2 * s, 6 * s, 4 * s, 1.2 * s, sil);
            fillRR(ctx, 5 * s, -1.4 * s, 3 * s, 2.8 * s, 0.4 * s, sil);
            ctx.restore();
          }
          const pop = easeOut(seg(lt, 0.15, 0.6));
          ctx.save(); ctx.globalAlpha = pop;
          big(ctx, c.hook[0], w / 2, h * (P ? 0.2 : 0.24), (P ? 8 : 7) * s, "#fff8ec", { align: "center", weight: 400, shadow: null, maxW: w * 0.86 });
          big(ctx, c.hook[1], w / 2, h * (P ? 0.31 : 0.38) + (1 - pop) * 3 * s, (P ? 15 : 16) * s, "#ffffff", { align: "center", maxW: w * 0.9, shadow: "rgba(90,30,40,0.45)" });
          ctx.restore();
          letterbox();
        },
        () => {
          const fy = h * 0.6, yb = fy + (h - bar - fy) * 0.5;
          // wall at golden hour, a window, then the carpet
          fill(ctx, w, h, "#f2a46a", "#d8705a");
          const win: Rect = P ? { x: w * 0.1, y: h * 0.14, w: w * 0.36, h: h * 0.22 } : { x: w * 0.08, y: h * 0.15, w: w * 0.22, h: h * 0.3 };
          glow(ctx, win.x + win.w / 2, win.y + win.h / 2, win.w * 1.4, "#ffe1a0", 0.5);
          fillRR(ctx, win.x - s, win.y - s, win.w + 2 * s, win.h + 2 * s, 1.5 * s, "#f6ecdc");
          fillRR(ctx, win.x, win.y, win.w, win.h, s, lin(ctx, 0, win.y, 0, win.y + win.h, [[0, "#ffe7b0"], [1, "#ff9f6b"]]));
          fillRR(ctx, win.x + win.w / 2 - 0.5 * s, win.y, s, win.h, 0, "#f6ecdc");
          fillRR(ctx, win.x, win.y + win.h / 2 - 0.5 * s, win.w, s, 0, "#f6ecdc");
          if (herd) {
            // the couch, the herd's shelter, and a striped sock on the plain
            const cx = w * 0.6;
            fillRR(ctx, cx + 2 * s, fy - 34 * s, w * 0.46, 14 * s, 5 * s, "#6a3c5c");
            fillRR(ctx, cx, fy - 24 * s, w * 0.5, 20 * s, 5 * s, "#7a4a6a");
            fillRR(ctx, cx - 3 * s, fy - 28 * s, 8 * s, 24 * s, 4 * s, "#6a3c5c");
            fillRR(ctx, cx, fy - 4.5 * s, w * 0.5, 4.5 * s, 0, "#2a1420");
          } else {
            // the underside of a desk, its legs, and a power strip lying on the floor
            fillRR(ctx, w * 0.36, bar, w * 0.7, 7 * s, 0, "#4a2f2a");
            for (const lx of [0.38, 0.96]) fillRR(ctx, w * lx - 1.5 * s, bar, 3 * s, fy + 6 * s - bar, s, "#5a3a32");
          }
          fillRR(ctx, -2, fy, w + 4, h - fy + 2, 0, lin(ctx, 0, fy, 0, h, [[0, "#c98a5a"], [1, "#9a5a38"]]));
          for (let i = 0; i < 40; i++) {
            const x = w * hash(i * 1.7), y = fy + (h - fy) * hash(i * 3.1), sw = Math.sin(lt * 1.6 + i) * 0.3 * s;
            limb(ctx, [[x, y], [x + sw, y - 1.6 * s]], 0.6 * s, withAlpha("#7a4228", 0.5));
          }
          const cap = lt < 4.2 ? 0 : lt < 7.4 ? 1 : lt < 10.4 ? 2 : 3;
          let watch = false, startle = false;
          if (herd) {
            // migration route, measured in the bot's own time: along the plain, around the sock, under the couch
            const sockX = w * 0.46;
            const g = lt - 4 - clamp(lt - 7.2, 0, 1);
            const route = (tt: number) => {
              if (tt < 0) return null;
              const x1 = sockX - w * 0.1, x2 = w * 0.66;
              if (tt < 3.2) return { x: lerp(-w * 0.12, x1, tt / 3.2), y: yb, k: 1, a: 1 };
              if (tt < 5.2) { const q = easeInOut((tt - 3.2) / 2); return { x: lerp(x1, x2, q), y: lerp(yb, fy + 4 * s, q), k: lerp(1, 0.8, q), a: 1 }; }
              if (tt < 7) { const q = (tt - 5.2) / 1.8; return { x: lerp(x2, w * 0.84, q), y: lerp(fy + 4 * s, fy + 1.5 * s, q), k: lerp(0.8, 0.62, q), a: 1 - q }; }
              return null;
            };
            const bots = [0, 1, 2, 3, 4].map((i) => ({ i, at: route(i === 4 ? (g - 3.6) * 1.4 : g - i * 0.55) }));
            const paused = lt > 7.2 && lt < 8.2;
            const drawBot = (b: (typeof bots)[number]) => {
              if (!b.at || b.at.a <= 0) return;
              const r = (b.i === 4 ? 5.5 : 9) * s * b.at.k * (P ? 0.8 : 1);
              ctx.save(); ctx.globalAlpha = clamp(b.at.a);
              vacBot(ctx, b.at.x, b.at.y - (paused ? 0 : Math.abs(Math.sin(lt * 8 + b.i)) * 0.4 * s), r, lt + b.i, b.i === 0 && paused ? 1 : 0);
              ctx.restore();
              if (b.i === 0 && paused) big(ctx, "!", b.at.x + r * 0.7, b.at.y - r * 1.4 - seg(lt, 7.2, 7.4) * 2 * s, 7 * s, "#ffffff", { align: "center", shadow: "rgba(60,20,20,0.4)" });
            };
            const sockY = yb + 3 * s;
            bots.filter((b) => b.at && b.at.y < sockY).forEach(drawBot);
            ctx.save(); ctx.translate(sockX, sockY);
            fillRR(ctx, -7 * s, -4.2 * s, 11 * s, 4.2 * s, 2 * s, "#ff8fa3");
            ellipse(ctx, 4.5 * s, -2.1 * s, 3.2 * s, 2.1 * s, 0, "#ff8fa3");
            for (let i = 0; i < 3; i++) fillRR(ctx, (-5 + i * 2.6) * s, -4.2 * s, 1.1 * s, 4.2 * s, 0, withAlpha("#ffffff", 0.6));
            ctx.restore();
            bots.filter((b) => b.at && b.at.y >= sockY).forEach(drawBot);
            watch = paused;
            startle = lt > 7.2 && lt < 7.6;
          } else {
            // two grown cables lounging, a dust bunny tumbling past, a young cable looking for a port
            for (let k = 0; k < 2; k++) {
              const pts: [number, number][] = [];
              for (let j = 0; j <= 16; j++) pts.push([w * (-0.05 + j * 0.03), fy + (3 + k * 3) * s + Math.sin(j * 0.7 + lt * (1 + k * 0.4)) * 0.8 * s]);
              limb(ctx, pts, 1.8 * s, k ? "#2f3456" : "#4a3a5a");
            }
            const db = seg(lt, 1.8, 6.5);
            if (db > 0 && db < 1) {
              const x = lerp(w * 1.05, -w * 0.1, db), y = fy + 4 * s - Math.abs(Math.sin(lt * 6)) * 2 * s;
              for (let i = 0; i < 6; i++) circle(ctx, x + Math.cos(i + lt * -6) * 1.6 * s, y - 2.2 * s + Math.sin(i + lt * -6) * 1.6 * s, 1.5 * s, i % 2 ? "#b8b2c0" : "#a39cad");
            }
            const stripX = w * 0.8, stripY = yb + 2 * s, portY = stripY - 2.4 * s;
            const tries = [7.6, 8.5, 9.4];
            const hit = lt > 9.7;
            fillRR(ctx, stripX, stripY - 5 * s, 16 * s, 5 * s, 1.5 * s, "#f6ecdc");
            for (let i = 0; i < 2; i++) fillRR(ctx, stripX + (5 + i * 5) * s, stripY - 5.6 * s, 3 * s, 0.8 * s, 0.4 * s, "#c9bfae");
            fillRR(ctx, stripX - 0.4 * s, portY - 1.2 * s, 1 * s, 2.4 * s, 0.3 * s, "#2a2f45");
            if (hit) glow(ctx, stripX + 14 * s, stripY - 5.8 * s, 4 * s, C.mint, 0.6);
            circle(ctx, stripX + 14 * s, stripY - 5.8 * s, 0.9 * s, hit ? C.mint : "#ff4b5c");
            // the plug's tip along its path, then three lunges at the port (the last one sticks)
            const rest = stripX - 12 * s;
            let px = lerp(-w * 0.05, w * 0.3, easeOut(seg(lt, 1.6, 4.2)));
            px = lerp(px, rest, easeInOut(seg(lt, 4.4, 7.2)));
            let py = portY - Math.max(0, Math.sin(lt * 5)) * 1.2 * s * (1 - seg(lt, 7.2, 7.5));
            tries.forEach((t0, j) => {
              const f = seg(lt, t0, t0 + 0.45);
              if (f > 0 && f < 1) px = rest + (stripX - 3.4 * s - rest) * (j === 2 ? easeOut(f * 2) : Math.sin(Math.PI * f));
            });
            if (lt > tries[2] + 0.22) { px = stripX - 3.4 * s; py = portY; }
            const flip = lt < 8.1 ? 1 : lt < 8.35 ? lerp(1, -1, easeInOut(seg(lt, 8.1, 8.35))) : lt < 9.0 ? -1 : lerp(-1, 1, easeInOut(seg(lt, 9.0, 9.25)));
            const pts: [number, number][] = [];
            const tailX = -w * 0.1, tailY = yb + 5 * s, bx = px - 7 * s, ctlX = bx - 14 * s;
            for (let j = 0; j <= 18; j++) {
              const q = j / 18, a = (1 - q) * (1 - q), b = 2 * (1 - q) * q, cc = q * q;
              const wig = Math.sin(j * 0.8 - lt * 5) * 1.4 * s * (1 - q) * (hit ? 0.3 : 1);
              pts.push([a * tailX + b * ctlX + cc * bx, a * tailY + b * tailY + cc * py + wig]);
            }
            limb(ctx, pts, 2 * s, "#2a2f45");
            plug(ctx, px, py, s, Math.abs(flip) < 0.05 ? 0.05 : flip);
            tries.slice(0, 2).forEach((t0) => {
              const k = seg(lt, t0 + 0.3, t0 + 0.5) * (1 - seg(lt, t0 + 0.75, t0 + 0.9));
              if (k > 0) big(ctx, "?", px - 2 * s, py - 6 * s, 6 * s * k, "#ffffff", { align: "center", shadow: "rgba(60,20,20,0.4)" });
            });
            if (lt > 9.7 && lt < 10.6) {
              const k = seg(lt, 9.7, 10.6);
              for (let i = 0; i < 6; i++) star(ctx, stripX + Math.cos(i * 1.05) * k * 7 * s, portY + Math.sin(i * 1.05) * k * 7 * s, 1.4 * s * (1 - k), "#ffd23f");
            }
            watch = lt > 7.4 && lt < 10.4;
            startle = lt > 9.7 && lt < 10.2;
          }
          // the presenter, crouched behind a fern, whispering
          const hs = s * (P ? 0.5 : 0.55), hx = w * (P ? 0.2 : 0.1), hy = h - bar + 12 * hs;
          let p: Host = { ...MOSS, mouth: lt % 3 < 2.2 ? talk(lt) * 0.35 : 0, look: 0.8, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 1.4) * 0.03, handL: [-30, 6], handR: [12, -56] };
          if (watch) p = { ...p, handL: [-9, -70], handR: [9, -70], tilt: 0, mouth: 0, eyes: startle ? "wide" : "open" };
          bust(ctx, hx, hy, hs, p);
          if (watch) {
            const by = hy - 74 * hs;
            for (const sd of [-1, 1]) {
              fillRR(ctx, hx + sd * 7.5 * hs - 5 * hs, by - 5.5 * hs, 10 * hs, 11 * hs, 3.5 * hs, "#2a2f45");
              circle(ctx, hx + sd * 7.5 * hs, by, 3.6 * hs, "#141a33");
              circle(ctx, hx + sd * 7.5 * hs - 1.2 * hs, by - 1.2 * hs, 1 * hs, withAlpha("#ffffff", 0.5));
            }
            fillRR(ctx, hx - 2.5 * hs, by - 2 * hs, 5 * hs, 4 * hs, 1.5 * hs, "#3a4060");
          }
          for (let i = 0; i < 7; i++) {
            const a = -Math.PI / 2 + (i - 3) * 0.32 + Math.sin(lt * 1.2 + i) * 0.03;
            const lx = hx + (i - 3) * 4 * hs, ly = h - bar + 2 * s;
            ellipse(ctx, lx + Math.cos(a) * 14 * hs, ly + Math.sin(a) * 14 * hs, 16 * hs, 4.5 * hs, a, i % 2 ? "#2f6b46" : "#3f8a5a");
          }
          letterbox();
          const starts = [1.6, 4.2, 7.4, 10.4, 14.6];
          const ca = seg(lt, starts[cap], starts[cap] + 0.4) * (1 - seg(lt, starts[cap + 1] - 0.3, starts[cap + 1]));
          if (ca > 0) {
            const line = canvasText(c.lines[cap]);
            text(ctx, line, w / 2, h - bar / 2, fitSize(ctx, line, w * 0.92, bar * 0.42, 400), withAlpha("#f1f1f6", ca), { weight: 400, maxW: w * 0.94 });
          }
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 3. Fix-It Café: a cozy repair bench where sad gadgets get better
// ===================================================================================
interface FixCfg { id: string; title: string; views: string; dur: string; item: "lamp" | "calc"; ticket: [string, string]; part: string; caption: string }
// Mender: a peach robot in a teal shop coat and round glasses, with a mug of tea on the bench.
const MENDER = { body: "#f2b8a0", visor: "#2b2040", eye: "#ffd77a", outfit: "coat", cloth: "#4f8a8b", inner: "#e8d9c0", glasses: true, blush: true } satisfies Host;

/** Screw holes for each gadget, relative to its foot point, in gadget units. */
const SCREWS: Record<FixCfg["item"], [number, number][]> = {
  lamp: [[-8, -2], [8, -2], [-5, -22], [9, -34]],
  calc: [[-10, -37], [10, -37], [-10, -3], [10, -3]],
};

/** The patient. mood: sad to happy; light: lamp brightness or calculator fixed; open: cover off. */
function gadget(ctx: Ctx, kind: FixCfg["item"], x: number, y: number, u: number, mood: number, light: number, open: number, t: number) {
  ellipse(ctx, x, y + 0.5 * u, 15 * u, 2.6 * u, 0, "rgba(40,20,10,0.3)");
  if (kind === "lamp") {
    fillRR(ctx, x - 12 * u, y - 4 * u, 24 * u, 4.5 * u, 2.2 * u, "#e26d5a");
    const j: [number, number] = [x - 5 * u, y - 22 * u], hd: [number, number] = [x + 9 * u, y - 34 * u];
    limb(ctx, [[x, y - 3 * u], j, hd], 2.4 * u, "#c95a48");
    circle(ctx, j[0], j[1], 2 * u, "#e26d5a");
    ctx.save();
    ctx.translate(hd[0], hd[1]);
    ctx.rotate(0.5);
    if (light > 0) poly(ctx, [[-9 * u, 6 * u], [9 * u, 6 * u], [22 * u, 34 * u], [-22 * u, 34 * u]], lin(ctx, 0, 6 * u, 0, 34 * u, [[0, withAlpha("#fff3c4", 0.5 * light)], [1, withAlpha("#fff3c4", 0)]]));
    if (light > 0) glow(ctx, 0, 7 * u, 10 * u, "#ffe9a8", 0.6 * light);
    circle(ctx, 0, 7 * u, 3.6 * u, mix("#7d7f93", "#fff3c4", clamp(light)));
    ctx.translate(0, -open * 7 * u);
    ctx.rotate(-open * 0.3);
    poly(ctx, [[-5 * u, -6 * u], [5 * u, -6 * u], [11 * u, 6 * u], [-11 * u, 6 * u]], "#e26d5a");
    fillRR(ctx, -3 * u, -9 * u, 6 * u, 3.4 * u, 1.2 * u, "#c95a48");
    moodFace(ctx, 0, 0.6 * u, 3.2 * u, mood, "#3a1d2e");
    ctx.restore();
    return;
  }
  // calculator: the inside (battery bay) shows while the front plate swings aside
  fillRR(ctx, x - 13 * u, y - 40 * u, 26 * u, 40 * u, 4 * u, "#2a2f55");
  fillRR(ctx, x - 8 * u, y - 24 * u, 16 * u, 9 * u, 2 * u, "#141a33");
  ctx.save();
  ctx.translate(x - 13 * u, y);
  ctx.rotate(-open * 0.5);
  ctx.translate(-open * 6 * u, -open * 4 * u);
  fillRR(ctx, 0, -40 * u, 26 * u, 40 * u, 4 * u, "#4a5290");
  fillRR(ctx, 3 * u, -37 * u, 20 * u, 8 * u, 2 * u, light > 0.5 ? "#c9f2bd" : "#9fb89a");
  const shown = light > 0.5 ? "1+1=2" : Math.floor(t * 2.5) % 2 ? "ERR" : "";
  if (shown) text(ctx, shown, 13 * u, -33 * u, 4.4 * u, "#1d3a24", { mono: true, weight: 700 });
  moodFace(ctx, 13 * u, -24.5 * u, 3 * u, mood, "#e8ecff");
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) fillRR(ctx, (3.4 + k * 5) * u, (-17 + r * 4.6) * u, 4 * u, 3.4 * u, 1 * u, r === 2 && k === 3 ? C.orange : "#2a2f55");
  ctx.restore();
}

/** The part being swapped: a bulb or a battery. */
function part(ctx: Ctx, kind: FixCfg["item"], x: number, y: number, u: number, fresh: boolean) {
  if (fresh) glow(ctx, x, y, 7 * u, kind === "lamp" ? "#ffe9a8" : C.mint, 0.5);
  if (kind === "lamp") {
    circle(ctx, x, y - 1.5 * u, 3.6 * u, fresh ? "#fff3c4" : "#7d7f93");
    fillRR(ctx, x - 1.8 * u, y + 1.6 * u, 3.6 * u, 3 * u, 0.8 * u, "#c9cdf2");
  } else {
    fillRR(ctx, x - 7 * u, y - 3 * u, 14 * u, 6 * u, 2 * u, fresh ? C.mint : "#6b6f88");
    fillRR(ctx, x + 7 * u, y - 1.2 * u, 1.4 * u, 2.4 * u, 0.6 * u, "#c9cdf2");
  }
}

function screw(ctx: Ctx, x: number, y: number, r: number, a: number) {
  circle(ctx, x, y, r, "#dfe3f5");
  limb(ctx, [[x - Math.cos(a) * r * 0.6, y - Math.sin(a) * r * 0.6], [x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6]], r * 0.35, "#5a6194");
}

function fixVideo(c: FixCfg): VideoDef {
  const L = 15, HOOK = 1.6;
  return {
    id: c.id, title: c.title, channel: "Fix-It Café", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.9, color: "#4f8a8b",
    post: { user: "fixit.cafe", caption: c.caption },
    comments: ["The leftover screw going into the pocket. Every single time.", "Mender's tea never gets cold and neither does my heart.", "I fall asleep to this channel and wake up wanting to fix things."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100, P = h > w * 1.05;
      const wall = () => {
        fill(ctx, w, h, "#7a5442", "#4a3028");
        for (let i = 0; i < 60; i++) circle(ctx, (i % 12 + 0.5) * w / 12, (Math.floor(i / 12) + 0.5) * h * 0.12, 0.5 * s, withAlpha("#2a1810", 0.35));
      };
      hooked(ctx, lt, HOOK,
        () => {
          // before and after, split on a diagonal
          const u = s * (P ? 0.95 : 1.25);
          const after: [number, number][] = P ? [[0, h * 0.55], [w, h * 0.45], [w, h], [0, h]] : [[w * 0.56, 0], [w, 0], [w, h], [w * 0.44, h]];
          const before: [number, number][] = P ? [[0, 0], [w, 0], [w, h * 0.45], [0, h * 0.55]] : [[0, 0], [w * 0.56, 0], [w * 0.44, h], [0, h]];
          const half = (pts: [number, number][], a: string, b: string, x: number, y: number, ok: boolean) => {
            ctx.save();
            ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.clip();
            fill(ctx, w, h, a, b);
            if (ok) glow(ctx, x, y - 20 * u, 36 * u, "#ffe9a8", 0.45);
            fillRR(ctx, -2, y, w + 4, 30 * u, 0, ok ? "#c98a5a" : "#4a3a40");
            gadget(ctx, c.item, x, y, u, ok ? 1 : 0, ok ? 1 : 0.12, 0, lt);
            ctx.restore();
          };
          half(before, "#3a3440", "#221d28", P ? w * 0.5 : w * 0.24, P ? h * 0.42 : h * 0.86, false);
          half(after, "#ffcf8a", "#e8955a", P ? w * 0.5 : w * 0.76, P ? h * 0.92 : h * 0.86, true);
          limb(ctx, P ? [[0, h * 0.55], [w, h * 0.45]] : [[w * 0.56, 0], [w * 0.44, h]], 1.4 * s, "#ffffff");
          const pop = backOut(seg(lt, 0.2, 0.55));
          tag(ctx, "BEFORE", w * 0.05, h * (P ? 0.07 : 0.12), 8 * s * pop, "#5a6194", "#ffffff", { rot: -0.03 });
          tag(ctx, "AFTER", w * 0.95, h * (P ? 0.58 : 0.12), 8 * s * pop, "#ffd23f", "#2a1d07", { align: "right", rot: 0.03 });
        },
        () => {
          wall();
          const by = h * (P ? 0.76 : 0.74), hs = s * (P ? 0.7 : 0.82), hx = w * (P ? 0.7 : 0.68), hy = by + 14 * hs;
          const u = hs * 1.15, ix = hx - 40 * hs, tray = { x: P ? w * 0.14 : w * 0.22, y: by };
          const holes = SCREWS[c.item].map(([sx, sy]) => [ix + sx * u, by + sy * u] as [number, number]);
          const slot = (i: number): [number, number] => [tray.x + (i - 1.5) * 3.6 * s, tray.y - 1.8 * s];
          // the ticket on the wall
          const tk = P ? { x: w * 0.07, y: h * 0.08, w: w * 0.62, h: h * 0.15 } : { x: w * 0.05, y: h * 0.08, w: w * 0.32, h: h * 0.24 };
          const sw = Math.sin(lt * 1.6) * 0.02 * (1 - seg(lt, 2, 4));
          ctx.save(); ctx.translate(tk.x + tk.w / 2, tk.y); ctx.rotate(sw);
          fillRR(ctx, -tk.w / 2 + 0.6 * s, 0.8 * s, tk.w, tk.h, 1.6 * s, "rgba(20,10,5,0.3)");
          fillRR(ctx, -tk.w / 2, 0, tk.w, tk.h, 1.6 * s, "#f2dcae");
          circle(ctx, -tk.w / 2 + 3 * s, tk.h * 0.25, 1 * s, "#7a5442");
          const f1 = fitSize(ctx, canvasText(c.ticket[0]), tk.w * 0.8, tk.h * 0.2, 700), f2 = fitSize(ctx, canvasText(c.ticket[1]), tk.w * 0.8, tk.h * 0.24, 800);
          text(ctx, c.ticket[0], -tk.w / 2 + 6 * s, tk.h * 0.32, f1, "#6a4a30", { weight: 700, align: "left", maxW: tk.w * 0.82 });
          text(ctx, c.ticket[1], -tk.w / 2 + 6 * s, tk.h * 0.68, f2, "#3a2418", { weight: 800, align: "left", maxW: tk.w * 0.82 });
          ctx.restore();

          // repair timeline: unscrew, open, swap the part, close, screw three back (one stays out)
          const out = (i: number) => 4.3 + i * 0.55, back = (i: number) => 9.5 + i * 0.5;
          const open = easeInOut(seg(lt, 6.6, 7.0)) * (1 - easeInOut(seg(lt, 9.0, 9.4)));
          const fixed = lt > 8.0;
          const happy = easeOut(seg(lt, 11.4, 11.8));
          const flicker = hash(Math.floor(lt * 14)) > 0.55 ? 0.3 : 0.06;
          const light = c.item === "lamp" ? (lt > 11.4 ? happy : fixed ? 0 : flicker) : lt > 11.4 ? 1 : 0;
          let p: Host = { ...MENDER, mouth: talk(lt * 0.9), look: -0.6, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 1.7) * 0.04, handL: [-26, -16], handR: [26, -16] };
          const busy = (lt > 4.3 && lt < out(3) + 0.35) || (lt > 9.5 && lt < back(2) + 0.35);
          if (lt > 2.6 && lt < 3.8) p = { ...p, handL: local(hx, hy, hs, ix + 4 * u, by - 18 * u), pointL: true };
          if (busy) {
            const i = lt < 9 ? Math.min(3, Math.floor((lt - 4.3) / 0.55)) : Math.min(2, Math.floor((lt - 9.5) / 0.5));
            const [sx, sy] = holes[i];
            const [lx, ly] = local(hx, hy, hs, sx, sy);
            p = { ...p, hold: "driver", holdLeft: true, handL: [lx + 15, ly - 4 + Math.sin(lt * 30) * 0.6], mouth: 0, shape: "o", eyes: "half", look: -0.8 };
          } else if (lt > 6.6 && lt < 9.4) {
            p = { ...p, handL: local(hx, hy, hs, ix + 2 * u, by - 26 * u), eyes: lt > 7.8 && lt < 8.6 ? "wide" : "open", look: -0.8 };
          } else if (lt > 11.4) {
            const notice = lt > 12.4 && lt < 13.3, shh = lt > 13.8;
            p = { ...p, eyes: notice ? "wide" : "happy", shape: notice ? "o" : "smile", mouth: notice ? 0.4 : 0.5, look: notice ? -1 : 0, blush: true,
              handR: shh ? [6, -58] : [26, -16], pointR: shh, tilt: shh ? -0.08 : notice ? 0.05 : Math.sin(lt * 3) * 0.05 };
          }
          bust(ctx, hx, hy, hs, p);
          // the bench, cutting mat, tray, tea
          fillRR(ctx, -2, by, w + 4, h - by + 2, 0, lin(ctx, 0, by, 0, h, [[0, "#c98a5a"], [1, "#9a6038"]]));
          fillRR(ctx, -2, by, w + 4, 1 * s, 0, withAlpha("#ffffff", 0.3));
          fillRR(ctx, ix - 18 * u, by + 1 * s, 36 * u, 4 * s, 1 * s, "#3f8a5a");
          fillRR(ctx, tray.x - 9 * s, tray.y - 2.6 * s, 18 * s, 2.6 * s, 1 * s, "#c9cdf2");
          const mx = P ? w * 0.9 : w * 0.92;
          fillRR(ctx, mx - 3.5 * s, by - 8 * s, 7 * s, 8 * s, 1.6 * s, "#e8d9c0");
          fillRR(ctx, mx - 2.8 * s, by - 7.4 * s, 5.6 * s, 1.4 * s, 0.7 * s, "#8a5a3a");
          steam(ctx, mx, by - 10 * s, s * 0.8, lt);
          gadget(ctx, c.item, ix, by, u, happy, light, open, lt);
          // screws: in place, flying to the tray, resting, flying home; the fourth ends in the coat pocket
          const pocket: [number, number] = [hx + 16 * hs, hy - 16 * hs];
          holes.forEach(([hx0, hy0], i) => {
            const k1 = seg(lt, out(i) + 0.3, out(i) + 0.7), k2 = i < 3 ? seg(lt, back(i), back(i) + 0.4) : seg(lt, 13.2, 13.7);
            const [tx, ty] = slot(i), [ex, ey] = i < 3 ? [hx0, hy0] : pocket;
            let x = hx0, y = hy0;
            if (k1 > 0 && k2 === 0) { x = lerp(hx0, tx, k1); y = lerp(hy0, ty, k1) - Math.sin(Math.PI * k1) * 10 * s; }
            if (k2 > 0) { x = lerp(tx, ex, k2); y = lerp(ty, ey, k2) - Math.sin(Math.PI * k2) * 10 * s; }
            if (i === 3 && k2 >= 1) return;
            screw(ctx, x, y, 1.3 * u, lt * (k1 > 0 && k1 < 1 ? 14 : 0) + i);
          });
          // the part swap
          const pOut = seg(lt, 7.2, 7.6), pIn = seg(lt, 7.8, 8.3);
          const inside: [number, number] = c.item === "lamp" ? [ix + 9 * u, by - 30 * u] : [ix, by - 19.5 * u];
          if (pOut > 0 && pOut < 1) part(ctx, c.item, lerp(inside[0], tray.x, pOut), lerp(inside[1], tray.y - 4 * s, pOut) - Math.sin(Math.PI * pOut) * 12 * s, u, false);
          if (pIn > 0 && pIn < 1) part(ctx, c.item, inside[0], lerp(inside[1] - 30 * s, inside[1], easeOut(pIn)), u, true);
          if (lt > 7.6) part(ctx, c.item, tray.x + 5 * s, tray.y - 3.2 * s, u * 0.7, false);
          if (lt > 8.0 && lt < 9.6) {
            const k = backOut(seg(lt, 8.0, 8.3)) * (1 - seg(lt, 9.3, 9.6));
            tag(ctx, c.part, ix, by - 46 * u, 5.5 * s * k, C.mint, "#0b2a1a", { align: "center", rot: -0.05 });
            for (let i = 0; i < 4; i++) star(ctx, inside[0] + Math.cos(i * 1.6 + lt * 3) * 8 * u, inside[1] + Math.sin(i * 1.6 + lt * 3) * 6 * u, 1.4 * u, "#ffd23f");
          }
          if (lt > 12.6) tag(ctx, "1 screw left over", tray.x - 8 * s, by - 12 * s, 5 * s * backOut(seg(lt, 12.6, 12.9)) * (1 - seg(lt, 14.4, 14.7)), "#ffd23f", "#2a1d07", { rot: -0.04 });
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 4. Servo Stretch: an upbeat workout class for stiff joints
// ===================================================================================
type Move = "reach" | "rolls" | "oil" | "nods" | "curls" | "punch" | "reboot";
interface FitCfg { id: string; title: string; views: string; dur: string; moves: [Move, Move, Move, Move]; hook: [string, string]; caption: string }
// Coach Torque: sunny yellow, pink tee, a white sweatband, counts every rep.
const TORQUE = { body: "#ffcf5a", visor: "#1d2a5a", eye: C.mint, outfit: "tee", cloth: C.pink, band: "#ffffff" } satisfies Host;
const MOVES: Record<Move, string> = { reach: "Reach for the cloud", rolls: "Shoulder rolls", oil: "Oil break", nods: "Antenna nods", curls: "Power curls", punch: "Ceiling punches", reboot: "Cool down" };
const MOVE_T = 3.1;

/** The coach's pose for a move at m seconds in, plus the rep count to show (if the move counts reps). */
function movePose(mv: Move, m: number): { p: Partial<Host>; reps?: string } {
  if (mv === "reach") {
    const sw = Math.sin(m * 2.4);
    return { p: { handL: [-12 + sw * 8, -98], handR: [12 + sw * 8, -98], lean: sw * 0.05, tilt: sw * 0.08, eyes: "happy", shape: "smile", mouth: 0.4 } };
  }
  if (mv === "rolls") {
    const a = m * 5;
    return { p: { handL: [-30 + Math.cos(a) * 9, -46 + Math.sin(a) * 11], handR: [30 - Math.cos(a) * 9, -46 + Math.sin(a) * 11] } };
  }
  if (mv === "oil") {
    const k = easeInOut(seg(m, 0.3, 1.0)) * (1 - easeInOut(seg(m, 2.0, 2.6)));
    return { p: { hold: "can", handR: [lerp(30, 12, k), lerp(4, -56, k)], handL: [-30, 4], tilt: -0.12 * k, eyes: k > 0.8 ? "closed" : "open", shape: k > 0.3 ? "o" : "smile", mouth: 0.3 } };
  }
  if (mv === "nods") return { p: { tilt: Math.sin(m * 4) * 0.22, handL: [-34, 2], handR: [34, 2], eyes: "happy", shape: "smile", mouth: 0.5 } };
  if (mv === "curls") {
    const c = (1 - Math.cos((m * 2 * Math.PI) / 0.78)) / 2;
    return { p: { hold: "weight", handL: [-24, lerp(8, -40, c)], handR: [24, lerp(8, -40, c)], eyes: c > 0.7 ? "closed" : "open", shape: "o", mouth: 0.2 + c * 0.3 }, reps: `${Math.min(4, Math.floor(m / 0.78) + 1)}/4` };
  }
  if (mv === "punch") {
    const n = Math.floor(m / 0.39), f = Math.sin(Math.PI * ((m / 0.39) % 1)), left = n % 2 === 0;
    const up = (rest: [number, number], hit: [number, number], on: boolean): [number, number] => (on ? [lerp(rest[0], hit[0], f), lerp(rest[1], hit[1], f)] : rest);
    return { p: { handL: up([-26, -24], [-12, -100], left), handR: up([26, -24], [12, -100], !left), eyes: "wide", shape: "o", mouth: 0.5 }, reps: `${Math.min(8, n + 1)}/8` };
  }
  const wake = m > 2.4;
  return { p: { eyes: wake ? (m > 2.6 ? "happy" : "wide") : "closed", mouth: wake ? 0.5 : 0, shape: wake ? "smile" : "bar", tilt: wake ? 0 : 0.1, handL: wake ? [-38, -62] : [-30, 16], handR: wake ? [38, -62] : [30, 16] } };
}

function fitVideo(c: FitCfg): VideoDef {
  const HOOK = 1.6, L = HOOK + MOVE_T * 4;
  return {
    id: c.id, title: c.title, channel: "Servo Stretch", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.9, color: C.pink,
    post: { user: "servo.stretch", caption: c.caption, funny: true },
    comments: ["The creak at the start is me every single morning.", "Coach Torque's sweatband stays perfectly white. How.", "Did the oil break twice. No regrets."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100;
      hooked(ctx, lt, HOOK,
        () => thumbFrame(ctx, w, h, lt, {
          glowC: C.pink, lines: c.hook, tagBg: "#ffd23f", faceLeft: true,
          host: { ...TORQUE, eyes: "happy", shape: "smile", mouth: 0.8, look: -0.3, handL: [-40, -58], handR: [40, -58] },
          prop: (x, y, sz) => {
            circle(ctx, x, y, sz * 0.5, "#ffffff");
            circle(ctx, x, y, sz * 0.42, "#1d2a5a");
            fillRR(ctx, x - sz * 0.08, y - sz * 0.64, sz * 0.16, sz * 0.12, sz * 0.04, "#ffffff");
            ctx.beginPath(); ctx.arc(x, y, sz * 0.33, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.4);
            ctx.lineWidth = sz * 0.08; ctx.lineCap = "round"; ctx.strokeStyle = C.mint; ctx.stroke();
            const a = -Math.PI / 2 + lt * 4;
            limb(ctx, [[x, y], [x + Math.cos(a) * sz * 0.26, y + Math.sin(a) * sz * 0.26]], sz * 0.05, "#ffffff");
          },
        }),
        () => {
          // the studio: mirror panels with light strips, a sprung floor
          fill(ctx, w, h, "#ffb38a", "#ff7aa8");
          for (let i = 0; i < 5; i++) fillRR(ctx, w * (0.04 + i * 0.2), h * 0.06, w * 0.16, h * 0.62, 2 * s, withAlpha("#ffffff", 0.12));
          for (let i = 0; i < 6; i++) fillRR(ctx, w * (0.02 + i * 0.2) - 0.5 * s, h * 0.06, 1 * s, h * 0.62, 0.5 * s, withAlpha("#fff6e0", 0.35 + 0.15 * Math.sin(lt * 2 + i)));
          fillRR(ctx, -2, h * 0.7, w + 4, h * 0.3 + 2, 0, lin(ctx, 0, h * 0.7, 0, h, [[0, "#c65a7a"], [1, "#8a3a5e"]]));
          fillRR(ctx, -2, h * 0.7, w + 4, 0.8 * s, 0, withAlpha("#ffffff", 0.25));
          const st = stage(w, h, 1, 0.46);
          const { panel, hx, hy, hs, portrait } = st;
          const k = clamp(Math.floor((lt - HOOK) / MOVE_T), 0, 3), m = Math.max(0, lt - HOOK - k * MOVE_T);
          const mv = c.moves[k], next = c.moves[k + 1];
          const smooth = c.moves.indexOf("oil") >= 0 && k > c.moves.indexOf("oil");
          // the move card
          const r: Rect = { ...panel, h: panel.h * (portrait ? 1 : 0.8) };
          const enter = easeOut(seg(m, 0, 0.3));
          ctx.save(); ctx.globalAlpha = enter;
          fillRR(ctx, r.x, r.y, r.w, r.h, 3 * s, withAlpha("#2a1440", 0.82));
          const pad = r.w * 0.07, R = Math.min(r.h * 0.17, r.w * 0.14), cx = r.x + pad + R, cy = r.y + pad + R;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
          ctx.lineWidth = R * 0.22; ctx.strokeStyle = withAlpha("#ffffff", 0.15); ctx.stroke();
          const left = 1 - m / MOVE_T;
          ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
          ctx.lineCap = "round"; ctx.strokeStyle = C.mint; ctx.stroke();
          text(ctx, String(Math.ceil(left * 30)), cx, cy, R * 0.75, "#ffffff", { weight: 800 });
          const nx = cx + R + pad * 0.8;
          big(ctx, MOVES[mv], nx, cy, r.h * 0.1, "#ffffff", { align: "left", maxW: r.x + r.w - pad - nx, shadow: null });
          const pose = movePose(mv, m);
          if (pose.reps) big(ctx, pose.reps, r.x + r.w / 2, r.y + r.h * 0.6, r.h * 0.22, "#ffd23f", { align: "center", shadow: null });
          if (mv === "reboot") {
            const bw = r.w - pad * 2, f = seg(m, 0.2, 2.4);
            text(ctx, "rebooting", r.x + r.w / 2, r.y + r.h * 0.52, r.h * 0.07, "#b9bfe6", { weight: 600, maxW: bw });
            fillRR(ctx, r.x + pad, r.y + r.h * 0.6, bw, r.h * 0.06, r.h * 0.03, withAlpha("#ffffff", 0.15));
            fillRR(ctx, r.x + pad, r.y + r.h * 0.6, bw * f, r.h * 0.06, r.h * 0.03, C.mint);
          }
          if (next) {
            text(ctx, "Next", r.x + pad, r.y + r.h * 0.88, r.h * 0.065, "#b9bfe6", { weight: 600, align: "left", maxW: r.w * 0.4 });
            const nw = ctx.measureText(canvasText("Next")).width;
            big(ctx, MOVES[next], r.x + pad + nw + r.h * 0.05, r.y + r.h * 0.88, r.h * 0.065, "#ffffff", { align: "left", weight: 700, maxW: r.w - pad * 2 - nw, shadow: null });
          }
          ctx.restore();
          // the coach
          const p: Host = { ...TORQUE, mouth: talk(lt), look: portrait ? 0 : -0.3, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 2.6) * 0.04, ...pose.p };
          bust(ctx, hx, hy - Math.abs(Math.sin(lt * 5.2)) * 0.8 * s, hs, p);
          if (k === 0 && m > 0.3 && m < 1.7) {
            const pk = backOut(seg(m, 0.3, 0.5)) * (m < 1.0 ? 1 : backOut(seg(m, 1.0, 1.2)));
            tag(ctx, "CREAK", hx - 32 * hs, hy - 72 * hs, 6 * s * pk, "#ffffff", "#c6395e", { align: "center", rot: -0.18 + Math.sin(m * 20) * 0.04 });
          }
          if (mv === "oil" && m > 1.1 && m < 2.6) tag(ctx, "So smooth!", hx - 30 * hs, hy - 96 * hs, 5.5 * s * backOut(seg(m, 1.1, 1.35)), C.mint, "#0b2a1a", { align: "center", rot: 0.06 });
          if (mv === "reboot" && m > 2.5) tag(ctx, "Ready!", hx, hy - 104 * hs, 6 * s * backOut(seg(m, 2.5, 2.75)), "#ffd23f", "#2a1d07", { align: "center", rot: -0.05 });
          if (smooth || (mv === "oil" && m > 1.1)) for (let i = 0; i < 4; i++) star(ctx, hx + Math.cos(lt * 2 + i * 1.6) * 34 * hs, hy - 70 * hs + Math.sin(lt * 2 + i * 1.6) * 14 * hs, (1.2 + Math.sin(lt * 9 + i) * 0.6) * s, "#ffffff");
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// ===================================================================================
// 5. Buzzer Beaters: a sparkly quiz show with three very eager contestants
// ===================================================================================
interface QuizCfg { id: string; title: string; views: string; dur: string; q: [string, string]; answers: [string, string, string]; right: 0 | 1 | 2; hook: [string, string]; caption: string }
// Quizmo: a teal host in a sparkly purple jacket and gold tie, never without the microphone.
const QUIZMO = { body: "#5fd3c7", eye: "#fff3c4", outfit: "suit", cloth: "#7a2d8f", tie: "#ffd23f", hold: "mic" } satisfies Host;
const PLAYERS: [string, Host][] = [
  ["DUSTY", { body: "#e3e5f2", eye: C.mint, outfit: "tee", cloth: "#2e6b4a", head: "puck" }],
  ["BYTE", { body: C.lilac, eye: C.mint, outfit: "hoodie", cloth: "#2a2f66", glasses: true }],
  ["SPARK", { body: C.orange, eye: "#fff3c4", outfit: "tee", cloth: "#1f6fb5", blush: true }],
];

function bubble(ctx: Ctx, x: number, y: number, str: string, size: number, k: number) {
  if (k <= 0) return;
  str = canvasText(str);
  ctx.font = `700 ${size}px ${SANS}`;
  const tw = ctx.measureText(str).width, pw = tw + size * 1.4, ph = size * 2;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  poly(ctx, [[-size * 0.5, ph / 2 - 1], [size * 0.5, ph / 2 - 1], [-size * 0.2, ph / 2 + size * 0.8]], "#ffffff");
  fillRR(ctx, -pw / 2, -ph / 2, pw, ph, ph * 0.4, "#ffffff");
  text(ctx, str, 0, 0, size, "#1d1440", { weight: 700, maxW: tw + 1 });
  ctx.restore();
}

function quizVideo(c: QuizCfg): VideoDef {
  const L = 15, HOOK = 1.6;
  // the two wrong answers buzz in first, then the right one
  const order = [0, 1, 2].filter((i) => i !== c.right).concat(c.right);
  const buzz = [4.4, 6.4, 8.6];
  return {
    id: c.id, title: c.title, channel: "Buzzer Beaters", views: c.views, durationLabel: c.dur, loop: L, thumbT: 0.9, color: "#7a2d8f",
    post: { user: "buzzer.beaters", caption: c.caption, funny: true },
    comments: ["Dusty buzzing in first every time is peak television.", "I yelled the answer at my screen and my monitor flinched.", "Quizmo's jacket has more sparkle than my whole codebase."],
    draw(ctx, w, h, t) {
      const lt = loopT(t, L);
      const s = Math.min(w, h) / 100, P = h > w * 1.05;
      hooked(ctx, lt, HOOK,
        () => {
          fill(ctx, w, h, "#4a1d8e", "#170a33");
          const cx = P ? w * 0.36 : w * 0.56, cy = P ? h * 0.5 : h * 0.55, R = Math.max(w, h) * 1.4;
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2 + lt * 0.3;
            poly(ctx, [[cx, cy], [cx + Math.cos(a) * R, cy + Math.sin(a) * R], [cx + Math.cos(a + 0.2) * R, cy + Math.sin(a + 0.2) * R]], withAlpha(i % 2 ? "#ffd23f" : C.pink, 0.12));
          }
          glow(ctx, cx, cy, 34 * s, "#ffd23f", 0.4);
          big(ctx, "?", cx, cy, (P ? 34 : 44) * s * backOut(seg(lt, 0.1, 0.45)), "#ffd23f", { align: "center", rot: 0.12, shadow: "rgba(20,5,40,0.6)" });
          const tx = w * 0.05, ty = P ? h * 0.1 : h * 0.17, mw = P ? w * 0.9 : w * 0.45;
          const t0 = big(ctx, c.hook[0], tx, ty, (P ? 14 : 16) * s, "#ffffff", { align: "left", maxW: mw });
          tag(ctx, c.hook[1], tx, ty + t0 * 1.3, (P ? 13 : 15) * s * backOut(seg(lt, 0.25, 0.6)), "#ffd23f", "#2a0f45", { maxW: mw, rot: -0.03 });
          face(ctx, P ? w * 0.7 : w * 0.82, P ? h * 0.82 : h * 0.6, P ? h * 0.26 : h * 0.5,
            { ...QUIZMO, eyes: "wide", shape: "o", mouth: 0.8, look: -0.5, hold: undefined, handL: [-36, -60], pointL: true, handR: [34, -58] });
        },
        () => {
          // stage: spotlights and a marquee row of bulbs
          fill(ctx, w, h, "#3a1d6e", "#140a2e");
          for (let i = 0; i < 3; i++) {
            const x = w * (0.2 + i * 0.3) + Math.sin(lt * 0.8 + i * 2) * w * 0.05;
            poly(ctx, [[x - 3 * s, 0], [x + 3 * s, 0], [x + 22 * s, h], [x - 22 * s, h]], withAlpha("#fff3c4", 0.05));
          }
          const nb = Math.ceil(w / (5 * s));
          for (let i = 0; i < nb; i++) circle(ctx, i * 5 * s + 2.5 * s, 2.2 * s, 1.1 * s, (i + Math.floor(lt * 6)) % 3 === 0 ? "#ffd23f" : withAlpha("#ffd23f", 0.3));
          const answered = lt >= buzz[2] + 1.6;
          const verdict = (j: number) => buzz[j] + 1.6;
          const wrongNow = [0, 1].find((j) => lt > verdict(j) && lt < verdict(j) + 0.8);
          // the question screen
          const r: Rect = P ? { x: w * 0.06, y: h * 0.07, w: w * 0.88, h: h * 0.28 } : { x: w * 0.05, y: h * 0.1, w: w * 0.58, h: h * 0.4 };
          fillRR(ctx, r.x - s, r.y - s, r.w + 2 * s, r.h + 2 * s, 3 * s, "#ffd23f");
          fillRR(ctx, r.x, r.y, r.w, r.h, 2.4 * s, lin(ctx, 0, r.y, 0, r.y + r.h, [[0, "#1d2a7a"], [1, "#101850"]]));
          if (wrongNow !== undefined) fillRR(ctx, r.x, r.y, r.w, r.h, 2.4 * s, withAlpha("#ff4b5c", 0.25 * (1 - seg(lt, verdict(wrongNow) + 0.4, verdict(wrongNow) + 0.8))));
          if (answered) fillRR(ctx, r.x, r.y, r.w, r.h, 2.4 * s, withAlpha("#ffd23f", 0.3 * (1 - seg(lt, verdict(2), verdict(2) + 0.6))));
          const q0 = canvasText(c.q[0]), q1 = canvasText(c.q[1]).replace("____", answered ? canvasText(c.answers[c.right]) : "____");
          const f0 = fitSize(ctx, q0, r.w * 0.88, r.h * 0.12, 600), f1 = fitSize(ctx, q1, r.w * 0.88, r.h * 0.17, 800);
          text(ctx, q0.slice(0, Math.floor(seg(lt, 1.9, 2.8) * q0.length)), r.x + r.w / 2, r.y + r.h * 0.3, f0, "#b9bfe6", { weight: 600, maxW: r.w * 0.9 });
          text(ctx, answered ? q1 : q1.slice(0, Math.floor(seg(lt, 2.9, 3.9) * q1.length)), r.x + r.w / 2, r.y + r.h * 0.56, f1, "#ffffff", { weight: 800, maxW: r.w * 0.9 });
          if (wrongNow !== undefined) {
            const k = backOut(seg(lt, verdict(wrongNow), verdict(wrongNow) + 0.25)) * (1 - seg(lt, verdict(wrongNow) + 0.6, verdict(wrongNow) + 0.8));
            const xr = Math.min(r.w, r.h) * 0.3 * k, xc = r.x + r.w / 2, yc = r.y + r.h / 2;
            limb(ctx, [[xc - xr, yc - xr], [xc + xr, yc + xr]], xr * 0.28, "#ff4b5c");
            limb(ctx, [[xc + xr, yc - xr], [xc - xr, yc + xr]], xr * 0.28, "#ff4b5c");
          }
          if (answered) tag(ctx, "CORRECT!", r.x + r.w / 2, r.y + r.h * 0.84, Math.min(r.h * 0.14, 8 * s) * backOut(seg(lt, verdict(2), verdict(2) + 0.3)), "#3fe08a", "#0b2a1a", { align: "center", rot: -0.04 });

          // the host, mic up, beside or behind the contestants
          const hx = P ? w * 0.5 : w * 0.82, hs = s * (P ? 0.62 : 0.95), hy = P ? h * 0.78 : h + 6 * s;
          let p: Host = { ...QUIZMO, mouth: talk(lt), look: P ? 0 : -0.5, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 2.4) * 0.04, handR: [9, -52], handL: [-30, 10] };
          if (lt > 2 && lt < 4) p = { ...p, handL: P ? [-24, -84] : local(hx, hy, hs, r.x + r.w, r.y + r.h * 0.6), pointL: true };
          if (wrongNow !== undefined) p = { ...p, eyes: "closed", shape: "o", mouth: 0.4, tilt: -0.06 };
          if (answered) p = { ...p, eyes: "happy", shape: "smile", mouth: 0.7, handL: [-40, -66], tilt: Math.sin(lt * 4) * 0.06 };
          bust(ctx, hx, hy, hs, p);
          if (answered) confetti(ctx, w, h, s, lt - verdict(2), 22);
          for (let i = 0; i < 5; i++) star(ctx, hx + (hash(i * 4.1) - 0.5) * 40 * hs, hy - hash(i * 2.7) * 40 * hs, (0.9 + Math.sin(lt * 6 + i * 2) * 0.6) * hs, withAlpha("#ffffff", 0.8));

          // contestants behind their podiums
          const podTop = h * (P ? 0.84 : 0.74), pw = w * (P ? 0.26 : 0.14), ks = s * (P ? 0.24 : 0.28);
          PLAYERS.forEach(([name, look], i) => {
            const px = P ? w * (0.18 + i * 0.32) : w * (0.1 + i * 0.18);
            const j = order.indexOf(i), b = buzz[j], v = verdict(j);
            const lit = lt > b && lt < v + 0.8;
            const won = i === c.right && answered, lost = j < 2 && lt > v;
            const bx = px + pw * 0.22;
            const bounce = won ? Math.abs(Math.sin(lt * 9)) * 3 * s : lt > b && lt < b + 0.3 ? 1.5 * s : 0;
            const by = podTop + 8 * s - bounce, [kx, ky] = local(px, by, ks, bx, podTop - 2 * s);
            bust(ctx, px, by, ks, {
              ...look, mouth: lt > b + 0.2 && lt < v ? talk(lt) : won ? 0.6 : 0, shape: won ? "smile" : "bar", look: 0,
              eyes: won ? "happy" : lost ? (lt < v + 1 ? "angry" : "half") : lt > 4 && lt < b ? "wide" : blink(lt + i) ? "closed" : "open",
              tilt: lost ? 0.12 : Math.sin(lt * 2 + i) * 0.04, handL: [-20, -24], handR: lt > b - 0.15 && lt < b + 0.4 ? [kx, lt < b ? ky - 12 : ky] : [20, -24],
            });
            fillRR(ctx, px - pw / 2, podTop, pw, h - podTop + 2, 2 * s, lin(ctx, 0, podTop, 0, h, [[0, "#5a2d9a"], [1, "#2a1258"]]));
            fillRR(ctx, px - pw / 2, podTop, pw, 1.2 * s, 0.6 * s, "#ffd23f");
            if (lit) glow(ctx, bx, podTop - 1.2 * s, 7 * s, "#ff4b5c", 0.7);
            ellipse(ctx, bx, podTop, 3.6 * s, 1 * s, 0, "#2a2f45");
            ctx.beginPath(); ctx.arc(bx, podTop - 0.2 * s, 2.6 * s, Math.PI, 0); ctx.fillStyle = lit ? "#ff6b7c" : "#a8323e"; ctx.fill();
            text(ctx, name, px, podTop + (h - podTop) * 0.36, Math.min(pw * 0.17, 4.4 * s), "#ffffff", { weight: 800 });
            text(ctx, String(won ? Math.round(100 * easeOut(seg(lt, v, v + 0.8))) : 0), px, podTop + (h - podTop) * 0.7, Math.min(pw * 0.15, 3.8 * s), "#ffd23f", { weight: 700, mono: true });
            bubble(ctx, px + pw * 0.3, podTop - (P ? 26 : 23) * s, c.answers[i], 3.6 * s, backOut(seg(lt, b + 0.2, b + 0.45)) * (1 - seg(lt, v + 0.9, v + 1.1)));
          });
        });
      loopFade(ctx, w, h, lt, L, 0.3);
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
          glowC: vcol, lines: ["AI NEWS:", verdict], tagBg: vcol,
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
            const k = easeOut(seg(lt, 6.5, 6.9));
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
          glowC: C.mint, lines: swarm ? ["6 AGENTS", "1 STARTUP"] : ["SHIPPED IT", "IN 4 MIN?!"], tagBg: C.mint,
          host: { ...VIBE, eyes: "happy", shape: "smile", mouth: 0.8, look: -0.4, handR: [36, -60], handL: [-30, 6], blush: true },
          prop: swarm
            ? (x, y, sz) => { for (let i = 0; i < 6; i++) { const bx = x + ((i % 3) - 1) * sz * 0.45, by = y + (Math.floor(i / 3) - 0.5) * sz * 0.5; fillRR(ctx, bx - sz * 0.19, by - sz * 0.17, sz * 0.38, sz * 0.34, sz * 0.1, [C.orange, C.sky, C.pink, C.lilac, C.mint, "#ffd23f"][i]); fillRR(ctx, bx - sz * 0.13, by - sz * 0.08, sz * 0.26, sz * 0.13, sz * 0.05, "#141a33"); if (i !== 4) { circle(ctx, bx - sz * 0.05, by - sz * 0.02, sz * 0.025, C.mint); circle(ctx, bx + sz * 0.05, by - sz * 0.02, sz * 0.025, C.mint); } else limb(ctx, [[bx - sz * 0.08, by - sz * 0.02], [bx + sz * 0.08, by - sz * 0.02]], sz * 0.025, C.mint); } }
            : (x, y, sz) => { fillRR(ctx, x - sz * 0.7, y - sz * 0.3, sz * 1.4, sz * 0.6, sz * 0.14, "#3fe08a"); text(ctx, "Accept all", x, y, sz * 0.24, "#0b2a1a", { weight: 800 }); },
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
          let p: Host = { ...VIBE, mouth: talk(lt * 0.8), look: portrait ? 0 : -0.6, eyes: blink(lt) ? "closed" : "open", tilt: Math.sin(lt * 1.8) * 0.05, handR: [26, -12 + Math.sin(lt * 1.2) * 4], hold: "mug" };
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
            if (conflict) p = { ...p, eyes: "shock", shape: "o", mouth: 0.7, handL: [-22, -66], hold: lt < 11.4 ? "mug" : undefined, handR: lt < 11.4 ? p.handR : [24, -62] };
            else if (lt > 13.4) p = { ...p, eyes: "happy", shape: "smile", mouth: 0.5, handL: [-38, -50] };
            else if (lt > 7.2) p = { ...p, eyes: "wide", look: portrait ? 0 : -0.8 };
          }
          bust(ctx, hx, hy, hs, p);
          if (p.hold === "mug") {
            const [mx, my] = p.handR ?? [26, -12];
            steam(ctx, hx + mx * hs, hy + (my - 16) * hs, hs, lt);
          }
        });
      loopFade(ctx, w, h, lt, L, 0.3);
    },
  };
}

// --- the episodes ---------------------------------------------------------------
export const PARODY_VIDEOS: VideoDef[] = [
  bakeVideo({
    id: "p-bake-board", title: "Baking a motherboard cake with thermal paste glaze", views: "1.4M views", dur: "11:52", dish: "cake",
    hook: ["MOTHERBOARD", "CAKE?!"], steps: ["Preheat to GPU temperature", "Pipe the thermal paste glaze", "Bake until it compiles"], reveal: "IT BOOTS!",
    caption: "A cake that boots. Please do not eat the cake",
  }),
  wildVideo({
    id: "p-wild-herd", title: "The great migration under the couch", views: "2.3M views", dur: "48:10", kind: "herd", hook: ["THE GREAT", "MIGRATION"],
    lines: ["Dusk falls on the living room.", "The vacuum herd begins its great migration.", "A sock blocks the path. The herd turns as one.", "Under the couch, they will be safe."],
    caption: "Three patient hours in the shag carpet for this herd",
  }),
  fixVideo({
    id: "p-fix-lamp", title: "Fixing a desk lamp that is afraid of the dark", views: "690K views", dur: "23:14", item: "lamp",
    ticket: ["Patient: desk lamp", "Afraid of the dark"], part: "new bulb", caption: "A desk lamp afraid of the dark, shining again",
  }),
  fitVideo({
    id: "p-fit-morning", title: "10 minute morning stretch for stiff servos", views: "1.7M views", dur: "10:04",
    moves: ["reach", "rolls", "oil", "nods"], hook: ["STIFF SERVOS?", "10 MIN FIX"], caption: "Ten minutes, zero creaks. Your joints will thank you",
  }),
  quizVideo({
    id: "p-quiz-commit", title: "Finish the commit message! Speed round", views: "1.1M views", dur: "22:05",
    q: ["Finish the commit message:", "fix: ____"], answers: ["everything", "typo (again)", "stuff"], right: 2, hook: ["FINISH THE", "COMMIT!"],
    caption: "Speed round: finish the commit message",
  }),
  bakeVideo({
    id: "p-bake-brulee", title: "Crème brûlée, torched with a soldering iron", views: "860K views", dur: "9:31", dish: "brulee",
    hook: ["SOLDERED", "BRÛLÉE"], steps: ["Pour the custard (no flux)", "Torch it with a soldering iron", "Chill until it stops beeping"], reveal: "CRUNCH!",
    caption: "Torched with a soldering iron. Still not edible",
  }),
  wildVideo({
    id: "p-wild-cable", title: "The secret life of cables behind the desk", views: "1.2M views", dur: "44:36", kind: "cable", hook: ["THE SECRET LIFE", "OF CABLES"],
    lines: ["Behind the desk, life finds a way.", "A young cable searches for a port.", "It tries once. Twice. Three times.", "Connected. Nature is beautiful."],
    caption: "A young cable finds its port. Nature is beautiful",
  }),
  fixVideo({
    id: "p-fix-calc", title: "This calculator forgot how to count", views: "540K views", dur: "19:48", item: "calc",
    ticket: ["Patient: calculator", "Forgot how to count"], part: "fresh battery", caption: "This calculator forgot how to count. Now it remembers",
  }),
  fitVideo({
    id: "p-fit-desk", title: "Desk workout for bots who sit all day", views: "930K views", dur: "12:20",
    moves: ["curls", "punch", "nods", "reboot"], hook: ["DESK BOT", "WORKOUT"], caption: "For every bot who sits at a desk all day",
  }),
  quizVideo({
    id: "p-quiz-bug", title: "Bug or feature? Lightning round", views: "1.5M views", dur: "24:40",
    q: ["Bug or feature?", "The app only works on Tuesdays."], answers: ["BOTH", "BUG", "FEATURE"], right: 0, hook: ["BUG OR", "FEATURE?"],
    caption: "Bug or feature? The answer will surprise you (it is both)",
  }),
  newsVideo("p-news-back", "We're so back (AI news, this week)", "1.5M views", "16:44", true),
  newsVideo("p-news-over", "It's so over (AI news, this week)", "1.9M views", "17:20", false),
  vibeVideo("p-vibe-ship", "I shipped a SaaS in 4 minutes with AI agents", "2.2M views", "14:03", false),
  vibeVideo("p-vibe-swarm", "I let 6 AI agents run my startup", "1.6M views", "27:45", true),
];
