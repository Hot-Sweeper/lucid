import {
  type Ctx, VW, VH, TAU, CREAM, WHITE, tint,
  seg, wave, hash, io, out, back, env, lerp,
  rr, dot, oval, poly, line, lin, halo, sky, vignette, glowOn, glowOff,
  caption, head, limb, hand, torso, shoulder, mug, flame, sweat, sparkle, check,
} from "./gifkit";

// Looping meme "GIFs" for Botcord. Each one riffs on a well-known meme format,
// redrawn with Lucid-style robots. Drawn fresh every frame from time alone, so
// a loop always looks the same and never drifts.

export type GifKind =
  | "fine" | "boyfriend" | "drake" | "buttons" | "surprised" | "stonks" | "galaxy" | "yelling"
  | "pigeon" | "pain" | "success" | "dance" | "changemind" | "spiderman" | "sideeye";

// p: loop phase 0..1, f: frame number at 30 fps (for jittery bits)
type Draw = (c: Ctx, p: number, f: number) => void;
export type GifInfo = { kind: GifKind; dur: number; tags: string[]; draw: Draw };

const NAVY = "#141a33", INK = "#1d1a2e", PAPER = "#fbf6ee";

function clip(c: Ctx, x: number, y: number, w: number, h: number) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
}

// --- This is fine -----------------------------------------------------------------
function fine(c: Ctx, p: number) {
  const fl = (p * 4) % 1;
  sky(c, "#f39050", "#c9532f");
  for (let i = 0; i < 8; i++) rr(c, i * 32 + 6, 0, 14, 140, 0, "rgba(255,226,180,0.07)");
  halo(c, 186, 76, 110, "#ffd27a", 0.42 + 0.06 * wave(p, 4));
  rr(c, 0, 0, VW, 58, 0, lin(c, 0, 0, 0, 58, [[0, "rgba(58,22,34,0.62)"], [1, "rgba(58,22,34,0)"]]));
  rr(c, 0, 136, VW, 44, 0, lin(c, 0, 136, 0, 180, [[0, "#8e3c2b"], [1, "#672820"]]));

  // the server rack, quietly on fire
  rr(c, 150, 40, 58, 98, 6, lin(c, 150, 0, 208, 0, [[0, "#2e3466"], [1, "#1b2246"]]));
  for (let i = 0; i < 6; i++) {
    const y = 48 + i * 14.5;
    rr(c, 156, y, 46, 10, 3, "#252d5c");
    for (let j = 0; j < 4; j++) {
      const on = hash(i * 9 + j * 3 + Math.floor(p * 16)) > 0.45;
      dot(c, 162 + j * 6, y + 5, 1.7, on ? (j === 3 ? "#ff6f91" : "#4ff0a0") : "#3a4380");
    }
    rr(c, 188, y + 3.5, 10, 3, 1.5, "#141a33");
  }
  flame(c, 160, 42, 16, 26, fl, 1);
  flame(c, 179, 42, 22, 36, fl, 2.3);
  flame(c, 198, 42, 16, 24, fl, 3.1);
  flame(c, 216, 138, 22, 40, fl, 4.2);
  flame(c, 232, 138, 16, 30, fl, 5.7);
  flame(c, 8, 138, 18, 32, fl, 6.4);
  // smoke drifting up and away
  for (let i = 0; i < 6; i++) {
    const q = (p * 2 + i / 6) % 1;
    const x = 178 - q * 34 + Math.sin((q + i) * 3) * 6, y = 28 - q * 30;
    dot(c, x, y, 7 + q * 16, `rgba(70,32,40,${0.42 * (1 - q) * Math.min(1, q * 6)})`);
  }

  // robot at the desk, hat on, coffee in hand
  const sip = env(p, 0.2, 0.34, 0.56, 0.7);
  const bob = wave(p, 2) * 0.6;
  torso(c, 92, 101 + bob, 64, 40, CREAM);
  shoulder(c, 66, 111 + bob, 9, CREAM);
  head(c, 92, 78 + bob, 56, CREAM, { eyes: "happy", blush: 0.55 + 0.3 * sip, noAntenna: true }, -0.04);
  // bowler hat, antenna poking through
  const hx = 92 - 0.04 * 20, hy = 56 + bob;
  rr(c, hx - 1.8, hy - 22, 3.6, 12, 1.8, CREAM.deep);
  halo(c, hx, hy - 23, 12, CREAM.glow, 0.6);
  dot(c, hx, hy - 23, 4.2, CREAM.glow);
  oval(c, hx, hy + 1, 30, 5.5, "#4a2f24", -0.04);
  c.fillStyle = lin(c, 0, hy - 18, 0, hy, [[0, "#7a5442"], [1, "#5c3c2e"]]);
  c.beginPath();
  c.ellipse(hx, hy - 1, 17, 17, 0, Math.PI, 0);
  c.fill();
  rr(c, hx - 17, hy - 5, 34, 5, 1.5, "#3a241b");

  rr(c, 18, 128, 152, 10, 4, "#6b3442");
  rr(c, 26, 136, 136, 44, 0, lin(c, 0, 136, 0, 180, [[0, "#552836"], [1, "#43202c"]]));
  // resting arm
  limb(c, { x: 66, y: 112 + bob }, { x: 60, y: 127 }, 12, 12, -1, 11, CREAM.shade, CREAM.shell);
  hand(c, 60, 127, 0, 6.5, CREAM);
  // mug arm
  const mx = lerp(130, 106, io(sip)), my = lerp(128, 100, io(sip));
  shoulder(c, 118, 111 + bob, 9, CREAM);
  mug(c, mx, my, 15, "#ffffff", sip < 0.1 ? p : -1);
  const a = limb(c, { x: 118, y: 112 + bob }, { x: mx + 2, y: my - 6 }, 15, 15, 1, 11, CREAM.shade, CREAM.shell);
  hand(c, a.b.x, a.b.y, 0, 6.5, CREAM);

  vignette(c, 0.3);
  caption(c, "this is fine", 120, 172, 19, { from: "bottom" });
}

// --- Distracted boyfriend --------------------------------------------------------
function boyfriend(c: Ctx, p: number) {
  sky(c, "#a6dcea", "#f6e6c4");
  rr(c, -10, 26, 64, 130, 12, "#bfe0d6");
  rr(c, 160, 14, 96, 140, 12, "#cbe5d9");
  rr(c, 176, 30, 16, 20, 4, "#e6f4ee"); rr(c, 200, 30, 16, 20, 4, "#e6f4ee"); rr(c, 176, 60, 16, 20, 4, "#e6f4ee"); rr(c, 200, 60, 16, 20, 4, "#e6f4ee");
  dot(c, 60, 64, 30, "#8fcca2"); dot(c, 92, 52, 22, "#a2d8b2"); dot(c, 140, 70, 24, "#93cfa6");
  rr(c, 0, 140, VW, 40, 0, "#dcc7a2");
  rr(c, 0, 138, VW, 4, 0, "#ecdcbc");

  const L = env(p, 0.12, 0.22, 0.84, 0.95);
  const anger = env(p, 0.3, 0.38, 0.84, 0.92);

  // the new GPU strutting past, glowing
  const gb = Math.abs(wave(p, 3)) * 2.4;
  halo(c, 50, 84, 52, "#ff6f91", 0.4 + 0.12 * wave(p, 3));
  for (let i = 0; i < 4; i++) {
    const tw = 0.5 + 0.5 * wave(p, 2, i * 0.27);
    sparkle(c, [16, 86, 22, 80][i], [56, 60, 112, 112][i], 3 + tw * 3, `rgba(255,255,255,${0.4 + tw * 0.6})`);
  }
  for (const side of [-1, 1]) {
    const st = wave(p, 3, side > 0 ? 0 : 0.5) * 5;
    line(c, [50 + side * 14, 110 - gb, 50 + side * 14 + st, 138], 4, "#3a2a4a");
    rr(c, 44 + side * 14 + st, 135, 13, 5, 2.5, "#3a2a4a");
  }
  c.save();
  c.translate(50, 92 - gb);
  c.rotate(-0.06);
  rr(c, -36, -22, 72, 40, 7, lin(c, 0, -22, 0, 18, [[0, "#ff7f9e"], [1, "#d9476f"]]));
  rr(c, -30, 18, 26, 5, 1.5, "#ffc84a");
  rr(c, -36, -22, 72, 6, 3, "rgba(255,255,255,0.25)");
  for (const fx of [-17, 17]) {
    dot(c, fx, -1, 14, "#2a1a3a");
    c.save();
    c.translate(fx, -1);
    c.rotate(p * TAU * 6);
    for (let b = 0; b < 5; b++) { c.rotate(TAU / 5); oval(c, 0, -6.5, 3.6, 6.5, "rgba(255,180,200,0.8)", 0.4); }
    c.restore();
    dot(c, fx, -1, 3.2, "#ffe0ea");
  }
  c.restore();

  // the old laptop, increasingly offended
  const lb = Math.abs(wave(p, 3, 0.25)) * 1.6;
  for (const side of [-1, 1]) {
    const st = wave(p, 3, side > 0 ? 0.25 : 0.75) * 4;
    line(c, [200 + side * 12, 116 - lb, 200 + side * 12 + st, 138], 4, "#5d6499");
    rr(c, 194 + side * 12 + st, 135, 12, 5, 2.5, "#5d6499");
  }
  c.save();
  c.translate(200, 94 - lb);
  c.rotate(anger * 0.06);
  rr(c, -26, -30, 52, 38, 6, "#c9cee3");
  rr(c, -22, -26, 44, 30, 4, "#2b3470");
  const eyesK = anger > 0.5 ? "angry" : "dot";
  glowOn(c, "#7cf2ff", 4);
  c.fillStyle = "#7cf2ff";
  for (const side of [-1, 1]) {
    const ex = side * 8 - 2 + (1 - anger) * -2, ey = -14;
    if (eyesK === "dot") oval(c, ex, ey, 3, 3.4, "#7cf2ff");
    else poly(c, side < 0 ? [ex - 4, ey - 4, ex + 4, ey - 1, ex + 4, ey + 3, ex - 4, ey + 3] : [ex - 4, ey - 1, ex + 4, ey - 4, ex + 4, ey + 3, ex - 4, ey + 3], "#7cf2ff");
  }
  if (anger > 0.5) rr(c, -7, -5, 10, 4 + anger * 4, 2.5, "#7cf2ff");
  else rr(c, -7, -5, 10, 2.4, 1.2, "#7cf2ff");
  glowOff(c);
  rr(c, -30, 8, 60, 8, 3, "#aeb5d4");
  c.restore();

  // me, walking with the laptop, head turning to the GPU
  const wb = Math.abs(wave(p, 3, 0.1)) * 1.6;
  for (const side of [-1, 1]) {
    const st = wave(p, 3, side > 0 ? 0.1 : 0.6) * 6;
    limb(c, { x: 122 + side * 8, y: 120 - wb }, { x: 124 + side * 8 + st, y: 136 }, 10, 10, -1, 9, WHITE.deep);
    rr(c, 116 + side * 8 + st, 133, 16, 6, 3, WHITE.trim);
  }
  torso(c, 124, 84 - wb, 48, 40, WHITE);
  const ha = limb(c, { x: 144, y: 96 - wb }, { x: 174, y: 104 - lb }, 16, 16, 1, 8, WHITE.shade, WHITE.shell);
  hand(c, ha.b.x, ha.b.y, 0, 5, WHITE);
  limb(c, { x: 104, y: 96 - wb }, { x: 100 + wave(p, 3) * 3, y: 120 - wb }, 12, 12, -1, 8, WHITE.shade, WHITE.shell);
  hand(c, 100 + wave(p, 3) * 3, 120 - wb, 0, 5, WHITE);
  shoulder(c, 104, 95 - wb, 8, WHITE);
  shoulder(c, 144, 95 - wb, 8, WHITE);
  head(c, 124 - L * 7, 66 - wb, 46, WHITE, {
    eyes: L > 0.5 ? "pill" : "dot", open: 1 + L * 0.25, lx: lerp(0.8, -1, L), ly: L * -0.3,
    turn: lerp(0.55, -1, L), mouth: L > 0.5 ? "o" : "smile", mo: 0.9, blush: L * 0.9,
  }, lerp(0.06, -0.22, L));
  if (L > 0.6) for (let i = 0; i < 2; i++) {
    const q = (p * 3 + i * 0.5) % 1;
    sparkle(c, 98 - q * 10, 52 - q * 8 + i * 14, 2.5 + 2 * Math.sin(q * Math.PI), "rgba(255,111,145,0.9)");
  }

  vignette(c, 0.22);
  caption(c, "new GPU", 50, 40, 15);
  caption(c, "me", 124, 4, 15);
  caption(c, "my old laptop", 200, 30, 14, { maxW: 72 });
}

// --- Drake ------------------------------------------------------------------------
function puffer(c: Ctx, x: number, y: number) {
  const g = lin(c, 0, y, 0, y + 50, [[0, "#ffa04a"], [1, "#f07a2a"]]);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - 40, y + 50);
  c.lineTo(x - 36, y + 14);
  c.quadraticCurveTo(x - 34, y + 2, x - 20, y);
  c.lineTo(x + 20, y);
  c.quadraticCurveTo(x + 34, y + 2, x + 36, y + 14);
  c.lineTo(x + 40, y + 50);
  c.closePath();
  c.fill();
  for (let i = 0; i < 3; i++) rr(c, x - 37 + i, y + 14 + i * 12, 74 - i * 2, 3, 1.5, "rgba(170,70,20,0.35)");
  rr(c, x - 15, y - 6, 30, 12, 6, "#ff9440");
}
function drake(c: Ctx, p: number) {
  const LW = 104;
  sky(c, "#ffd88a", "#ffb760", 0, 0, LW, 90);
  sky(c, "#ffd88a", "#ffb760", 0, 90, LW, 90);
  rr(c, LW, 0, VW - LW, VH, 0, PAPER);

  // nope
  clip(c, 0, 0, LW, 89);
  const shake = wave(p, 4) * 0.05;
  puffer(c, 50, 62);
  head(c, 42, 44, 44, WHITE, { eyes: "squeeze", turn: -0.8, lx: -0.6, mouth: "wavy" }, -0.22 + shake);
  const pa = { x: 84 + wave(p, 4) * 3, y: 40 };
  const a1 = limb(c, { x: 76, y: 76 }, pa, 18, 18, -1, 13, "#f07a2a");
  hand(c, a1.b.x, a1.b.y - 2, -Math.PI / 2 + 0.15, 10, WHITE, "palm");
  c.restore();

  // yes
  clip(c, 0, 91, LW, 89);
  const nod = Math.abs(wave(p, 2)) * 2;
  puffer(c, 48, 154 + nod * 0.5);
  const tip = { x: 94, y: 132 + nod };
  const a2 = limb(c, { x: 70, y: 166 }, tip, 16, 16, 1, 12, "#f07a2a");
  hand(c, a2.b.x, a2.b.y, -0.35, 6.5, WHITE, "point");
  head(c, 46, 132 + nod, 44, WHITE, { eyes: "happy", turn: 0.55, lx: 0.5, mouth: "smile", blush: 0.6 }, 0.08);
  c.restore();

  rr(c, 0, 89, VW, 2, 0, NAVY);
  rr(c, LW - 1, 0, 2, VH, 0, NAVY);
  caption(c, "works on my machine", LW + (VW - LW) / 2, 45, 16, { from: "middle", color: INK, shadow: false, maxW: 118 });
  caption(c, "works in CI", LW + (VW - LW) / 2, 135, 16, { from: "middle", color: INK, shadow: false, maxW: 118 });
}

// --- Two buttons ---------------------------------------------------------------
function buttons(c: Ctx, p: number) {
  // top: the choice
  clip(c, 0, 0, VW, 96);
  sky(c, "#323c80", "#1e2654", 0, 0, VW, 96);
  rr(c, 12, 58, 216, 44, 12, lin(c, 0, 58, 0, 100, [[0, "#d6dbee"], [1, "#9aa3c8"]]));
  const labels = ["refactor", "ship it"];
  [68, 172].forEach((bx, i) => {
    oval(c, bx, 82, 38, 11, "#5d6499");
    rr(c, bx - 34, 66, 68, 16, 0, "#c93a55");
    oval(c, bx, 66, 34, 11, "#ff5d78");
    // the label taped across the button
    c.save();
    c.translate(bx, 70);
    c.rotate(i ? 0.05 : -0.04);
    rr(c, -34, -10, 68, 20, 3, "#fbf3e2");
    caption(c, labels[i], 0, 0, 13, { from: "middle", color: INK, shadow: false });
    c.restore();
  });
  // a hand that cannot decide
  const s = wave(p, 2);
  const hx = 120 + 52 * Math.sign(s) * Math.pow(Math.abs(s), 0.45);
  const hy = 46 + Math.abs(wave(p, 4)) * 3;
  const ar = limb(c, { x: hx + 26, y: -40 }, { x: hx + 4, y: hy - 14 }, 34, 34, 1, 18, WHITE.shade, WHITE.shell);
  hand(c, ar.b.x, ar.b.y, Math.PI / 2 + 0.2, 13, WHITE, "point");
  sweat(c, hx - 14, hy - 12 + (p * 4 % 1) * 10, 2.8);
  c.restore();

  // bottom: the sweating
  clip(c, 0, 98, VW, 82);
  sky(c, "#a9bce3", "#8095c8", 0, 98, VW, 82);
  rr(c, 160, 104, 70, 70, 8, "rgba(255,255,255,0.18)");
  torso(c, 112, 172, 110, 40, WHITE);
  head(c, 112, 140, 74, WHITE, { eyes: "sad", lx: 0.4, ly: -0.3, mouth: "wavy", blush: 0.3, noAntenna: true }, wave(p, 4) * 0.02);
  for (let i = 0; i < 4; i++) {
    const q = (p * 2 + i / 4) % 1;
    const x = [74, 152, 80, 148][i];
    if (q < 0.9) sweat(c, x, 116 + q * 40, 3.6);
  }
  // dabbing the temple with a cloth
  const wy = 122 + wave(p, 2) * 7;
  const aw = limb(c, { x: 214, y: 196 }, { x: 160, y: wy + 6 }, 34, 34, 1, 13, WHITE.shade, WHITE.shell);
  c.save();
  c.translate(152, wy);
  c.rotate(-0.5 + wave(p, 2) * 0.12);
  rr(c, -10, -12, 22, 26, 5, "#f6ecdc");
  rr(c, -10, -12, 22, 7, 3, "#e2cfb4");
  c.restore();
  hand(c, aw.b.x, aw.b.y, 0, 7, WHITE);
  c.restore();
  rr(c, 0, 96, VW, 2, 0, NAVY);
}

// --- Surprised face --------------------------------------------------------------
function surprised(c: Ctx, p: number) {
  const on = p >= 0.36 && p < 0.97;
  const pop = p < 0.36 ? 0 : p < 0.88 ? back(seg(p, 0.36, 0.46), 2.6) : 1 - io(seg(p, 0.88, 0.97));
  const zoom = 1 + 0.1 * (p < 0.88 ? out(seg(p, 0.36, 0.42)) : 1 - io(seg(p, 0.88, 0.97)));
  const pal = tint(WHITE, { glow: "#ffe36e" });
  sky(c, "#ffe9a8", "#f4c35a");
  c.save();
  c.translate(120, 110);
  c.scale(zoom, zoom);
  c.translate(-120, -110);
  halo(c, 120, 92, 100, "#ffffff", 0.35 * Math.min(1, pop));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + p * 0.5;
    c.save();
    c.translate(120, 92);
    c.rotate(a);
    poly(c, [0, 0, 160, -12, 160, 12], `rgba(255,255,255,${0.16 * Math.min(1, pop)})`);
    c.restore();
  }
  torso(c, 120, 128, 100, 60, pal);
  shoulder(c, 80, 141, 13, pal);
  shoulder(c, 160, 141, 13, pal);
  head(c, 120, 94 - Math.min(1, pop) * 5, 70, pal, {
    eyes: on ? "wide" : "pill", open: on ? Math.max(0.5, 0.55 + pop * 0.62) : 1,
    ly: on ? -0.1 : 0.55, mouth: on ? "o" : "flat", mo: Math.max(0.3, pop * 1.7), bulb: 0.4 + Math.min(1, pop) * 0.6,
  });
  c.restore();
  // the monitor it is looking at
  rr(c, 156, 132, 72, 52, 8, "#2b3470");
  rr(c, 162, 138, 60, 40, 4, "#141a33");
  check(c, 180, 156, 14, "#4ff0a0");
  rr(c, 194, 148, 22, 4, 2, "rgba(79,240,160,0.7)");
  rr(c, 194, 156, 16, 4, 2, "rgba(79,240,160,0.4)");
  vignette(c, 0.22);
  caption(c, "the build passed\non the first try", 120, 8, 16);
}

// --- Stonks ------------------------------------------------------------------------
function stonks(c: Ctx, p: number) {
  sky(c, "#2a52d6", "#10206e");
  for (let x = 6; x < VW; x += 26) rr(c, x, 0, 1.2, VH, 0, "rgba(255,255,255,0.07)");
  for (let y = 10; y < VH; y += 26) rr(c, 0, y, VW, 1.2, 0, "rgba(255,255,255,0.07)");
  const fade = 1 - seg(p, 0.9, 1);
  const d = io(seg(p, 0.04, 0.58));
  const raw = [[0, 0.04], [0.11, 0.13], [0.2, 0.08], [0.32, 0.27], [0.42, 0.2], [0.54, 0.44], [0.64, 0.36], [0.77, 0.63], [0.87, 0.56], [1, 0.92]];
  const P = raw.map(([u, v]) => [96 + u * 128, 150 - v * 122]);
  const pts: number[][] = [];
  const xEnd = 96 + d * 128;
  for (let i = 0; i < P.length; i++) {
    if (P[i][0] <= xEnd) pts.push(P[i]);
    else {
      const a = P[i - 1], b = P[i], t = (xEnd - a[0]) / (b[0] - a[0]);
      pts.push([xEnd, a[1] + (b[1] - a[1]) * t]);
      break;
    }
  }
  c.save();
  c.globalAlpha = fade;
  caption(c, "token usage", 100, 16, 11, { align: "left", weight: 600 });
  if (pts.length > 1) {
    c.fillStyle = lin(c, 0, 30, 0, 156, [[0, "rgba(79,240,160,0.42)"], [1, "rgba(79,240,160,0)"]]);
    c.beginPath();
    c.moveTo(pts[0][0], 156);
    for (const q of pts) c.lineTo(q[0], q[1]);
    c.lineTo(pts[pts.length - 1][0], 156);
    c.closePath();
    c.fill();
    glowOn(c, "#4ff0a0", 8);
    line(c, pts.flat(), 4.5, "#4ff0a0");
    const e = pts[pts.length - 1], s = pts[pts.length - 2];
    const an = Math.atan2(e[1] - s[1], e[0] - s[0]);
    c.translate(e[0], e[1]);
    c.rotate(an);
    poly(c, [10, 0, -5, -8, -5, 8], "#4ff0a0");
    glowOff(c);
  }
  c.restore();

  // the investor
  const bob = wave(p, 2) * 1;
  const suit = "#1c2140";
  c.fillStyle = lin(c, 0, 108, 0, 180, [[0, "#262c52"], [1, suit]]);
  c.beginPath();
  c.moveTo(14, 180); c.lineTo(20, 120); c.quadraticCurveTo(24, 108, 40, 106); c.lineTo(76, 106); c.quadraticCurveTo(92, 108, 96, 120); c.lineTo(102, 180);
  c.fill();
  poly(c, [46, 106, 70, 106, 58, 140], "#f2f4fa");
  poly(c, [55, 110, 61, 110, 63, 136, 58, 144, 53, 136], "#ff9f5a");
  poly(c, [40, 106, 50, 106, 58, 142, 44, 124], "#2f3666");
  poly(c, [76, 106, 66, 106, 58, 142, 72, 124], "#2f3666");
  const tipX = lerp(104, Math.max(110, pts[pts.length - 1]?.[0] ?? 110) - 6, 0.25);
  const ar = limb(c, { x: 86, y: 118 }, { x: tipX, y: 92 + bob }, 20, 20, 1, 13, "#262c52");
  rr(c, ar.b.x - 5, ar.b.y - 3, 7, 7, 2, "#f2f4fa");
  hand(c, ar.b.x + 2, ar.b.y, -0.6, 6.5, WHITE, "point");
  head(c, 58, 82 + bob, 54, WHITE, { eyes: "smug", turn: 0.3, lx: 0.5, ly: -0.2, mouth: "smile" }, -0.05);

  const sp = back(seg(p, 0.5, 0.62), 2.8) * fade;
  if (sp > 0.01) {
    c.save();
    c.translate(170, 160);
    c.scale(sp, sp);
    caption(c, "STONKS", 0, 0, 28, { from: "middle" });
    c.restore();
  }
}

// --- Galaxy brain ---------------------------------------------------------------
function galaxy(c: Ctx, p: number) {
  const RH = 45, TW = 116;
  const rows = ["print debugging", "a debugger", "logging", "asking another AI"];
  const glows = ["#5d6490", "#4fb6ff", "#ffe08a", "#ffffff"];
  rows.forEach((label, i) => {
    const y0 = i * RH;
    rr(c, 0, y0, TW, RH, 0, PAPER);
    caption(c, label, TW / 2, y0 + RH / 2, 13.5, { from: "middle", color: INK, shadow: false, maxW: 104 });
    clip(c, TW, y0, VW - TW, RH);
    const cx = TW + (VW - TW) / 2, cy = y0 + RH / 2 + 4;
    if (i === 0) sky(c, "#20222e", "#14151d", TW, y0, VW - TW, RH);
    if (i === 1) sky(c, "#1b2350", "#121736", TW, y0, VW - TW, RH);
    if (i === 2) sky(c, "#3a1f72", "#1d1450", TW, y0, VW - TW, RH);
    if (i === 3) {
      sky(c, "#341a78", "#0a0d33", TW, y0, VW - TW, RH);
      halo(c, cx - 40, cy - 10, 50, "#ff6f91", 0.45);
      halo(c, cx + 40, cy + 6, 50, "#4fb6ff", 0.45);
      for (let s = 0; s < 18; s++) {
        const tw = 0.5 + 0.5 * wave(p, 2, hash(s * 3));
        dot(c, TW + hash(s) * (VW - TW), y0 + hash(s + 40) * RH, 0.6 + tw * 1.1, `rgba(255,255,255,${0.3 + tw * 0.7})`);
      }
    }
    const pulse = 1 + 0.08 * wave(p, 2, i * 0.2);
    if (i >= 2) {
      const n = 12;
      c.save();
      c.translate(cx, cy - 3);
      c.rotate((p * TAU) / n * (i === 3 ? 4 : 2));
      for (let r = 0; r < n; r++) { c.rotate(TAU / n); poly(c, [0, 0, 90, -7, 90, 7], `rgba(255,240,200,${i === 3 ? 0.22 : 0.12})`); }
      c.restore();
    }
    if (i >= 1) halo(c, cx, cy - 2, [0, 26, 36, 52][i] * pulse, glows[i], [0, 0.3, 0.5, 0.85][i]);
    const pal = tint(WHITE, { glow: glows[i] });
    const lift = i === 3 ? wave(p, 1) * 1.5 : 0;
    head(c, cx, cy + lift, 30 + i * 1.5, pal, {
      eyes: (["flat", "pill", "happy", "star"] as const)[i], bulb: [0, 0.6, 1, 1][i], open: i === 3 ? 1 + 0.15 * wave(p, 2) : 1,
    });
    if (i === 3) for (let s = 0; s < 4; s++) {
      const q = (p + s / 4) % 1;
      sparkle(c, cx + Math.cos(s * 1.7 + q * TAU) * 30, cy - 4 + Math.sin(s * 2.3 + q * TAU) * 14, 2 + 2 * Math.sin(q * Math.PI), "#fff6d8");
    }
    c.restore();
  });
  for (let i = 1; i < 4; i++) rr(c, 0, i * RH - 1, VW, 2, 0, NAVY);
  rr(c, TW - 1, 0, 2, VH, 0, NAVY);
}

// --- Woman yelling at cat --------------------------------------------------------
function yelling(c: Ctx, p: number) {
  const LW = 118;
  clip(c, 0, 0, LW, VH);
  sky(c, "#efcfae", "#c79470", 0, 0, LW, VH);
  halo(c, 16, 40, 50, "#fff3d6", 0.6);
  rr(c, 70, 10, 50, 70, 8, "rgba(120,70,50,0.14)");
  // the friend holding her back
  const fp = tint(CREAM, { glow: "#ffb38a" });
  torso(c, 22, 126, 52, 60, fp);
  head(c, 20, 104, 40, fp, { eyes: "sad", lx: 0.6, mouth: "flat", turn: 0.4 }, 0.06);
  const yp = tint(WHITE, { glow: "#ff6f91" });
  const sh = wave(p, 6) * 1.2;
  torso(c, 72 + sh, 122, 60, 64, yp);
  const fa = limb(c, { x: 38, y: 136 }, { x: 54 + sh, y: 132 }, 10, 10, 1, 9, fp.shade, fp.shell);
  hand(c, fa.b.x, fa.b.y, 0, 5.5, fp);
  // pointing arm, shaking
  const pt = { x: 112 + wave(p, 3) * 2, y: 106 + wave(p, 6) * 2 };
  const pa = limb(c, { x: 94 + sh, y: 134 }, pt, 16, 16, 1, 10, yp.shade, yp.shell);
  hand(c, pa.b.x, pa.b.y, -0.25, 6, yp, "point");
  const mo = 0.8 + 0.8 * Math.abs(wave(p, 6));
  head(c, 70 + sh, 94, 60, yp, { eyes: "angry", open: 0.8, mouth: "yell", mo, turn: 0.4, lx: 0.3, ly: -0.6, bulb: 0.6 + 0.4 * Math.abs(wave(p, 6)) }, 0.1 + wave(p, 6) * 0.03);
  for (let i = 0; i < 3; i++) {
    const a = -0.5 + i * 0.5, r0 = 33 + Math.abs(wave(p, 6)) * 3;
    line(c, [96 + Math.cos(a) * r0, 104 + Math.sin(a) * r0, 96 + Math.cos(a) * (r0 + 7), 104 + Math.sin(a) * (r0 + 7)], 2.6, "rgba(255,255,255,0.9)");
  }
  vignette(c, 0.25, 0, 0, LW, VH);
  caption(c, "you used 2M tokens to say hi", LW / 2 + 7, 8, 13.5, { maxW: 98 });
  c.restore();

  rr(c, LW, 0, 4, VH, 0, NAVY);

  const RX = LW + 4, RW = VW - RX, cx = RX + RW / 2;
  clip(c, RX, 0, RW, VH);
  sky(c, "#5b7a83", "#33505a", RX, 0, RW, VH);
  rr(c, RX + 10, 30, 30, 90, 4, "rgba(255,255,255,0.06)");
  const tilt = -0.08 + wave(p, 1) * 0.04;
  torso(c, cx, 116, 66, 40, WHITE);
  head(c, cx, 94, 56, WHITE, { eyes: "smug", lx: -0.45, ly: -0.1, turn: -0.2, mouth: "flat" }, tilt);
  // dinner table
  rr(c, RX, 134, RW, 46, 0, lin(c, 0, 134, 0, 180, [[0, "#f7f3ea"], [1, "#d9d2c3"]]));
  rr(c, RX, 134, RW, 3, 0, "#ffffff");
  oval(c, cx + 6, 148, 34, 9, "#ffffff");
  oval(c, cx + 6, 148, 26, 6.5, "#e8e2d6");
  // a plate of tokens
  const coin = (x: number, y: number) => {
    oval(c, x, y + 1.5, 7, 3, "#c9871f");
    oval(c, x, y, 7, 3, "#ffcc4d");
    oval(c, x, y, 3.5, 1.4, "#ffe597");
  };
  [[cx - 4, 147], [cx + 8, 148], [cx + 18, 146], [cx + 2, 143], [cx + 13, 142], [cx + 7, 138]].forEach(([x, y]) => coin(x, y));
  const hop = Math.max(0, wave(p, 1, 0.1));
  coin(cx - 12, 146 - hop * 6);
  vignette(c, 0.25, RX, 0, RW, VH);
  caption(c, "it was a thorough hi", cx, 8, 13.5, { maxW: 108 });
  c.restore();
}

// --- Is this a pigeon --------------------------------------------------------------
function pigeon(c: Ctx, p: number) {
  sky(c, "#8fcdf2", "#e8f5ff");
  oval(c, 60, 30, 34, 10, "rgba(255,255,255,0.7)");
  oval(c, 84, 24, 22, 9, "rgba(255,255,255,0.7)");
  oval(c, 196, 120, 40, 12, "rgba(255,255,255,0.55)");
  rr(c, 0, 146, VW, 34, 0, lin(c, 0, 146, 0, 180, [[0, "#8fd19c"], [1, "#6db882"]]));
  const pal = WHITE;
  torso(c, 70, 102, 60, 80, pal);
  shoulder(c, 92, 114, 10, pal);
  const reach = wave(p, 1) * 2;
  const pa = limb(c, { x: 94, y: 116 }, { x: 146 + reach, y: 106 }, 28, 28, 1, 12, pal.shade, pal.shell);
  hand(c, pa.b.x, pa.b.y, -0.15, 7, pal, "open");
  head(c, 68, 78, 52, pal, { eyes: "pill", open: 1.05, turn: 0.6, lx: 0.9, ly: -0.5 }, -0.08);

  // the "bug"
  const bx = 186 + wave(p, 1) * 7, by = 66 + wave(p, 2) * 6;
  const flap = 0.25 + 0.75 * Math.abs(Math.cos(p * TAU * 6));
  c.save();
  c.translate(bx, by);
  c.rotate(-0.15 + wave(p, 1) * 0.08);
  for (const side of [-1, 1]) {
    c.save();
    c.scale(side * flap, 1);
    oval(c, 12, -7, 13, 10, "#ffcf4d", -0.4);
    oval(c, 9, 8, 9, 7, "#ff9f5a", 0.4);
    oval(c, 12, -7, 6, 4.5, "#ffe7a3", -0.4);
    c.restore();
  }
  // its body is a semicolon
  dot(c, 0, -8, 3.6, NAVY);
  dot(c, 0, 3, 3.6, NAVY);
  c.fillStyle = NAVY;
  c.beginPath();
  c.moveTo(1.5, 4);
  c.quadraticCurveTo(2, 11, -3, 14);
  c.quadraticCurveTo(-0.5, 9, -3, 4.5);
  c.fill();
  line(c, [0, -11, -5, -19], 1.4, NAVY);
  line(c, [0, -11, 5, -19], 1.4, NAVY);
  c.restore();

  caption(c, "a semicolon", 186, 26, 14);
  caption(c, "me", 30, 54, 15);
  caption(c, "is this a bug?", 120, 174, 19, { from: "bottom" });
}

// --- Hide the pain -------------------------------------------------------------
function pain(c: Ctx, p: number, f: number) {
  sky(c, "#e4ecf7", "#b8c9e2");
  rr(c, 14, 14, 62, 76, 6, "#f6fbff");
  rr(c, 18, 18, 26, 32, 3, "#cfe6fb"); rr(c, 48, 18, 24, 32, 3, "#cfe6fb");
  rr(c, 18, 54, 26, 32, 3, "#cfe6fb"); rr(c, 48, 54, 24, 32, 3, "#cfe6fb");
  rr(c, 204, 70, 22, 30, 5, "#c47a5a");
  dot(c, 208, 60, 12, "#6fbf86"); dot(c, 222, 54, 11, "#5aa873"); dot(c, 214, 46, 10, "#7ccc94");
  const twitch = (p > 0.18 && p < 0.36) || (p > 0.6 && p < 0.76);
  const j = twitch ? hash(f) : 0.5;
  const pal = WHITE;
  torso(c, 118, 126, 100, 56, pal);
  shoulder(c, 76, 140, 13, pal);
  shoulder(c, 160, 140, 13, pal);
  head(c, 118, 92, 70, pal, {
    eyes: "happy", right: twitch && j > 0.55 ? "flat" : "happy",
    rOpen: twitch ? 0.75 + j * 0.4 : 1, rDy: twitch ? (j - 0.5) * 4 : 0,
    mouth: "smile", mo: 1.2, blush: 0.35,
  }, twitch ? (j - 0.5) * 0.02 : 0);
  if (twitch) {
    for (let i = 0; i < 3; i++) {
      const a = -0.9 + i * 0.45;
      line(c, [150 + Math.cos(a) * 18, 86 + Math.sin(a) * 18, 150 + Math.cos(a) * 24, 86 + Math.sin(a) * 24], 2, "rgba(29,26,46,0.6)");
    }
  }
  sweat(c, 82, 74 + seg(p, 0.1, 0.9) * 8, 3.4);
  // thumbs up
  const tb = wave(p, 2) * 1.5;
  const ta = limb(c, { x: 162, y: 142 }, { x: 188, y: 120 + tb }, 18, 18, 1, 14, pal.shade, pal.shell);
  hand(c, ta.b.x, ta.b.y, 0, 11, pal, "thumb");
  // coffee
  const ma = limb(c, { x: 74, y: 142 }, { x: 54, y: 128 }, 14, 14, -1, 14, pal.shade, pal.shell);
  mug(c, ma.b.x - 4, ma.b.y + 12, 22, "#ffffff", p);
  hand(c, ma.b.x + 7, ma.b.y, 0, 8, pal);
  vignette(c, 0.18);
  caption(c, "merging 47 conflicts", 120, 172, 17, { from: "bottom" });
}

// --- Success kid ------------------------------------------------------------------
function success(c: Ctx, p: number) {
  sky(c, "#9ad7ff", "#d9f1ff", 0, 0, VW, 70);
  rr(c, 0, 62, VW, 32, 0, lin(c, 0, 62, 0, 94, [[0, "#43b9cc"], [1, "#2c93b3"]]));
  for (let i = 0; i < 5; i++) {
    const x = ((i * 53 + p * 53) % 270) - 15;
    rr(c, x, 72 + (i % 2) * 9, 26, 2.5, 1.2, "rgba(255,255,255,0.45)");
  }
  rr(c, 0, 90, VW, 90, 0, lin(c, 0, 90, 0, 180, [[0, "#f3dcab"], [1, "#e0bb80"]]));
  for (let i = 0; i < 30; i++) dot(c, hash(i) * VW, 96 + hash(i + 9) * 84, 0.9, "rgba(150,100,50,0.35)");
  const pump = Math.pow(Math.abs(Math.sin(p * Math.PI * 2)), 0.7);
  const pal = CREAM;
  torso(c, 110, 130, 80, 60, pal);
  shoulder(c, 76, 144, 12, pal);
  head(c, 110 - pump * 1, 96 + pump * 1.5, 82, pal, { eyes: "angry", mouth: "grin", mo: 0.7 + pump * 0.3, ly: 0.1, lx: 0.3 }, 0.04 + pump * 0.03);
  const fy = 132 - pump * 16;
  const fa = limb(c, { x: 144, y: 146 }, { x: 170, y: fy }, 18, 18, 1, 14, pal.shade, pal.shell);
  hand(c, fa.b.x, fa.b.y, -Math.PI / 2, 12, pal, "fist");
  for (let i = 0; i < 6; i++) {
    const q = (p * 2 + i / 6) % 1;
    dot(c, 166 + hash(i) * 10 + q * 3, fy + 8 + q * 40, 1.1, `rgba(200,150,80,${0.9 * (1 - q)})`);
  }
  vignette(c, 0.2);
  caption(c, "rate limit reset", 120, 8, 19);
  caption(c, "exactly when I needed it", 120, 173, 16, { from: "bottom" });
}

// --- Dancing ----------------------------------------------------------------------
function dance(c: Ctx, p: number) {
  sky(c, "#132048", "#0d1430");
  const beat = Math.floor(p * 4);
  halo(c, beat % 2 ? 60 : 180, 10, 110, "#4ff0a0", 0.28);
  for (let i = 0; i < 6; i++) {
    const q = (p + i / 6) % 1;
    const x = 18 + hash(i) * 204;
    c.save();
    c.globalAlpha = 0.45 * Math.sin(q * Math.PI);
    check(c, x, 130 - q * 110, 10, "#4ff0a0");
    c.restore();
  }
  for (let i = 0; i < 8; i++) {
    const lit = (i + beat) % 2 === 0;
    poly(c, [i * 30, 146, i * 30 + 30, 146, i * 34 - 16 + 34, 180, i * 34 - 16, 180], lit ? "#2fbf7e" : "#1a6e52");
  }
  rr(c, 0, 144, VW, 3, 0, "#4ff0a0");

  const pal = tint(WHITE, { glow: "#4ff0a0" });
  const sx = wave(p, 2) * 7;
  const bob = -Math.abs(Math.sin(p * Math.PI * 4)) * 6;
  const hipY = 120 + bob;
  for (const side of [-1, 1]) {
    const lift = Math.max(0, side * wave(p, 2)) * 8;
    const fx = 120 + side * 18, fy = 152 - lift;
    limb(c, { x: 120 + sx + side * 9, y: hipY }, { x: fx, y: fy }, 16, 16, side * -1, 10, pal.deep);
    rr(c, fx - 9, fy - 3, 18, 7, 3.5, pal.trim);
  }
  torso(c, 120 + sx, 82 + bob, 52, 42, pal);
  const aL = wave(p, 2), aR = -aL;
  const arm = (side: number, a: number) => {
    const sh = { x: 120 + sx + side * 22, y: 94 + bob };
    const hp = { x: sh.x + side * (18 + 10 * a), y: sh.y - 6 - 30 * a };
    const r = limb(c, sh, hp, 16, 16, side > 0 ? -1 : 1, 10, pal.shade, pal.shell);
    hand(c, r.b.x, r.b.y, r.ang, 6, pal, a > 0.3 ? "point" : "ball");
    shoulder(c, sh.x, sh.y, 8, pal);
  };
  arm(-1, aL);
  arm(1, aR);
  head(c, 120 + sx * 1.2, 62 + bob, 46, pal, { eyes: "happy", mouth: "grin", blush: 0.7 }, wave(p, 2) * 0.12);
  caption(c, "when the tests go green", 120, 173, 17, { from: "bottom" });
}

// --- Change my mind ------------------------------------------------------------
function changemind(c: Ctx, p: number) {
  sky(c, "#a8dcf5", "#e9f7ff", 0, 0, VW, 96);
  dot(c, 20, 70, 30, "#86c796"); dot(c, 52, 62, 26, "#9bd3a8"); dot(c, 200, 66, 32, "#86c796"); dot(c, 232, 58, 22, "#9bd3a8");
  rr(c, 90, 40, 70, 50, 4, "#d9cbb6");
  rr(c, 96, 48, 14, 16, 2, "#bfe2f5"); rr(c, 118, 48, 14, 16, 2, "#bfe2f5"); rr(c, 140, 48, 14, 16, 2, "#bfe2f5");
  rr(c, 0, 90, VW, 90, 0, lin(c, 0, 90, 0, 180, [[0, "#7fc68d"], [1, "#5ead73"]]));
  const pal = CREAM;
  const sip = env(p, 0.45, 0.56, 0.7, 0.8);
  torso(c, 120, 90, 70, 40, pal);
  head(c, 120, 64, 58, pal, { eyes: "smug", lx: -0.1, mouth: "smile", blush: sip * 0.5 }, -0.04 + wave(p, 1) * 0.02);
  // table and sign
  rr(c, 24, 112, 192, 8, 3, "#efe7d8");
  rr(c, 34, 120, 6, 60, 2, "#9a8f7c"); rr(c, 200, 120, 6, 60, 2, "#9a8f7c");
  rr(c, 38, 118, 164, 52, 3, "#ffffff");
  caption(c, "tabs are better than spaces", 120, 126, 11, { color: INK, shadow: false, maxW: 160, weight: 600 });
  caption(c, "CHANGE MY MIND", 120, 146, 15.5, { color: INK, shadow: false, maxW: 170 });
  // mug and hands
  const mx = lerp(172, 144, io(sip)), my = lerp(112, 82, io(sip));
  mug(c, mx, my, 16, "#4fb6ff", sip < 0.05 ? p : -1);
  const ra = limb(c, { x: 146, y: 100 }, { x: mx - 5, y: my - 7 }, 15, 15, 1, 11, pal.shade, pal.shell);
  hand(c, ra.b.x, ra.b.y, 0, 6.5, pal);
  const la = limb(c, { x: 94, y: 100 }, { x: 78, y: 110 }, 13, 13, -1, 11, pal.shade, pal.shell);
  hand(c, la.b.x, la.b.y, 0, 6.5, pal);
  shoulder(c, 94, 99, 9, pal); shoulder(c, 146, 99, 9, pal);
  vignette(c, 0.15);
}

// --- Spider-Man pointing ----------------------------------------------------------
function spiderman(c: Ctx, p: number) {
  sky(c, "#26366e", "#141a33");
  halo(c, 120, 70, 120, "#4fb6ff", 0.25);
  rr(c, 8, 108, 46, 40, 4, "#1d2958"); rr(c, 186, 100, 50, 48, 4, "#1d2958");
  rr(c, 0, 146, VW, 34, 0, "#18204a");
  const one = (ph: number) => {
    const jab = Math.max(0, wave(p, 2, ph)) * 5;
    const pal = tint(WHITE, { glow: "#ff6f91" });
    for (const side of [-1, 1]) line(c, [62 + side * 8, 120, 60 + side * 12, 150], 11, "#3b5bdb");
    torso(c, 62, 82, 52, 44, pal, lin(c, 0, 88, 0, 130, [[0, "#ef4a55"], [1, "#c9343f"]]));
    const r = limb(c, { x: 82, y: 96 }, { x: 102 + jab, y: 84 - jab * 0.3 }, 14, 14, 1, 10, "#c9343f");
    hand(c, r.b.x, r.b.y, -0.2, 6, pal, "point");
    limb(c, { x: 42, y: 96 }, { x: 40, y: 118 }, 12, 12, -1, 10, "#c9343f");
    hand(c, 40, 118, 0, 5.5, pal);
    head(c, 64, 60, 46, pal, { eyes: "pill", turn: 0.6, lx: 0.9, mouth: "o", mo: 0.8 }, 0.04);
  };
  one(0);
  c.save();
  c.translate(VW, 0);
  c.scale(-1, 1);
  one(0.5);
  c.restore();
  vignette(c, 0.3);
  caption(c, "two agents editing one file", 120, 173, 16, { from: "bottom", maxW: 230 });
}

// --- Side eye (monkey puppet) -------------------------------------------------------
function sideeye(c: Ctx, p: number) {
  sky(c, "#e8cfa8", "#c99e6c");
  rr(c, -10, 96, 260, 90, 30, "#b5653d");
  rr(c, -10, 96, 260, 16, 8, "#c97a4f");
  rr(c, 170, 20, 50, 60, 4, "#f4e3c6");
  rr(c, 175, 25, 40, 50, 2, "#a7c7d9");
  const dart = p < 0.9 ? out(seg(p, 0.22, 0.25)) : 1 - io(seg(p, 0.9, 0.97));
  const turn = p < 0.9 ? io(seg(p, 0.5, 0.62)) : 1 - io(seg(p, 0.9, 0.97));
  const pal = CREAM;
  torso(c, 116, 140, 120, 50, pal);
  shoulder(c, 68, 156, 16, pal);
  shoulder(c, 164, 156, 16, pal);
  head(c, 116 + turn * 4, 100, 92, pal, { eyes: "dot", open: 1 - dart * 0.15, lx: dart * 2.1, ly: -0.2 * dart, turn: turn * 0.6, mouth: "flat", blush: turn * 0.4 }, turn * 0.05);
  if (p > 0.62 && p < 0.9) sweat(c, 80 + turn * 6, 70 + seg(p, 0.62, 0.9) * 10, 4);
  vignette(c, 0.25);
  caption(c, "when they ask\nif I read the docs", 120, 8, 16);
}

export const GIFS: GifInfo[] = [
  { kind: "fine", dur: 3.2, tags: ["fine", "fire", "prod"], draw: fine },
  { kind: "boyfriend", dur: 3.6, tags: ["gpu", "new", "distracted"], draw: boyfriend },
  { kind: "drake", dur: 2.4, tags: ["ci", "nope", "yes"], draw: drake },
  { kind: "buttons", dur: 2.8, tags: ["ship", "choice", "sweat"], draw: buttons },
  { kind: "surprised", dur: 2.6, tags: ["build", "shock", "wow"], draw: surprised },
  { kind: "stonks", dur: 3.4, tags: ["stonks", "tokens", "up"], draw: stonks },
  { kind: "galaxy", dur: 3.0, tags: ["brain", "debug", "smart"], draw: galaxy },
  { kind: "yelling", dur: 2.4, tags: ["tokens", "yell", "hi"], draw: yelling },
  { kind: "pigeon", dur: 3.0, tags: ["bug", "is this", "semicolon"], draw: pigeon },
  { kind: "pain", dur: 2.8, tags: ["merge", "pain", "fine"], draw: pain },
  { kind: "success", dur: 1.8, tags: ["yes", "rate limit", "win"], draw: success },
  { kind: "dance", dur: 2.0, tags: ["green", "dance", "tests"], draw: dance },
  { kind: "changemind", dur: 3.6, tags: ["tabs", "debate", "mind"], draw: changemind },
  { kind: "spiderman", dur: 2.4, tags: ["same", "merge", "agents"], draw: spiderman },
  { kind: "sideeye", dur: 3.2, tags: ["docs", "awkward", "look"], draw: sideeye },
];
export const GIF = Object.fromEntries(GIFS.map((g) => [g.kind, g])) as Record<GifKind, GifInfo>;

// Draws one frame. The context must already be scaled to the 240x180 virtual space.
export function drawGifFrame(c: Ctx, kind: GifKind, t: number) {
  const g = GIF[kind];
  const lt = ((t % g.dur) + g.dur) % g.dur;
  c.save();
  c.beginPath();
  c.rect(0, 0, VW, VH);
  c.clip();
  g.draw(c, lt / g.dur, Math.floor(t * 30));
  c.restore();
}
