import { canvas } from "./util";
import { canvasText, canvasLines, redrawCanvasOnLocale } from "../localization-canvas";

// Little hand-drawn meme panels for the chat. Flat shapes only, no images.

export type MemeKind = "repo" | "graph" | "fans" | "approve";

const W = 216, H = 128;
const C = { navy: "#141a33", navy2: "#1b2246", navy3: "#252d5c", orange: "#ff9f5a", mint: "#4ff0a0", sky: "#4fb6ff", pink: "#ff6f91", lilac: "#b07cff", cream: "#f6ecdc" };
const FONT = (px: number, w = 600) => `${w} ${px}px "Lexend Variable", Lexend, system-ui, sans-serif`;

type Ctx = CanvasRenderingContext2D;

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

function text(c: Ctx, s: string, x: number, y: number, px: number, color: string, maxW = 999, align: CanvasTextAlign = "left") {
  c.font = FONT(px);
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = "top";
  const lines = canvasLines(c, canvasText(s), maxW);
  lines.forEach((line, i) => c.fillText(line, x, y + i * px * 1.25, maxW));
  return y + lines.length * px * 1.25;
}

type Mood = "up" | "away" | "happy" | "sweat" | "dizzy" | "proud";
function head(c: Ctx, x: number, y: number, s: number, color: string, mood: Mood, tilt = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  // antenna
  rr(c, -s * 0.05, -s * 0.72, s * 0.1, s * 0.25, s * 0.05, C.navy);
  c.fillStyle = color; c.beginPath(); c.arc(0, -s * 0.74, s * 0.09, 0, Math.PI * 2); c.fill();
  // head
  const g = c.createLinearGradient(0, -s / 2, 0, s / 2);
  g.addColorStop(0, color); g.addColorStop(1, shade(color, -0.18));
  rr(c, -s * 0.55, -s * 0.48, s * 1.1, s * 0.96, s * 0.3, g);
  rr(c, -s * 0.42, -s * 0.3, s * 0.84, s * 0.56, s * 0.2, C.navy);
  c.fillStyle = C.cream;
  const ex = s * 0.18, ey = -s * 0.02, er = s * 0.09;
  const eye = (dx: number, dy: number) => { c.beginPath(); c.arc(dx, dy, er, 0, Math.PI * 2); c.fill(); };
  if (mood === "up") { eye(-ex, ey - s * 0.08); eye(ex, ey - s * 0.08); }
  else if (mood === "away") { eye(-ex + s * 0.12, ey); eye(ex + s * 0.12, ey); }
  else if (mood === "happy" || mood === "proud") {
    for (const dx of [-ex, ex]) { c.beginPath(); c.arc(dx, ey + er * 0.6, er * 1.1, Math.PI, 0); c.fill(); }
    if (mood === "proud") { c.fillStyle = C.navy; for (const dx of [-ex, ex]) { c.beginPath(); c.arc(dx, ey + er * 0.75, er * 0.55, Math.PI, 0); c.fill(); } }
  } else if (mood === "dizzy") {
    c.fillStyle = C.pink;
    for (const dx of [-ex, ex]) { rr(c, dx - er, ey - er * 0.25, er * 2, er * 0.5, er * 0.25, C.pink); }
  } else { eye(-ex, ey); eye(ex, ey); }
  if (mood === "sweat" || mood === "dizzy") {
    c.fillStyle = C.sky;
    c.beginPath();
    c.moveTo(s * 0.62, -s * 0.36);
    c.quadraticCurveTo(s * 0.74, -s * 0.16, s * 0.62, -s * 0.1);
    c.quadraticCurveTo(s * 0.5, -s * 0.16, s * 0.62, -s * 0.36);
    c.fill();
  }
  c.restore();
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (k < 0 ? v * k : (255 - v) * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawRepo(c: Ctx) {
  rr(c, 0, 0, W, H, 0, C.navy2);
  for (const [i, x] of [[0, 0], [1, W / 2 + 1]] as const) {
    rr(c, x, 0, W / 2 - 1, H, 0, i ? "#202958" : "#1e2652");
    rr(c, x, 0, W / 2 - 1, 30, 0, C.cream);
    text(c, i ? "to change one line" : "reading the entire repo", x + (W / 2 - 1) / 2, 6, 9, C.navy, 92, "center");
  }
  // left: a tower of files
  const cols = [C.sky, C.lilac, C.cream, C.pink, C.orange];
  for (let i = 0; i < 13; i++) {
    const w = 46 - (i % 3) * 3, x = 46 + Math.sin(i * 1.7) * 4;
    rr(c, x, H - 10 - (i + 1) * 6.6, w, 5.6, 1.5, cols[i % cols.length]);
  }
  head(c, 26, H - 22, 22, C.orange, "up");
  // right: one file, one line
  const fx = W / 2 + 22, fy = 44;
  rr(c, fx, fy, 64, 74, 5, C.navy3);
  for (let i = 0; i < 8; i++) rr(c, fx + 7, fy + 8 + i * 8, 22 + ((i * 37) % 28), 3.4, 1.7, i === 4 ? C.mint : "rgba(246,236,220,0.28)");
  rr(c, fx + 4, fy + 7 + 4 * 8 - 2.4, 56, 8.2, 2.5, "rgba(79,240,160,0.18)");
  head(c, W - 18, H - 22, 20, C.orange, "sweat", -0.1);
}

function drawGraph(c: Ctx) {
  rr(c, 0, 0, W, H, 0, C.navy2);
  const x0 = 30, y0 = H - 22, x1 = W - 14, y1 = 14;
  rr(c, x0 - 2, y1, 2.4, y0 - y1 + 2, 1.2, "rgba(246,236,220,0.55)");
  rr(c, x0 - 2, y0, x1 - x0 + 2, 2.4, 1.2, "rgba(246,236,220,0.55)");
  c.save();
  c.translate(14, (y0 + y1) / 2);
  c.rotate(-Math.PI / 2);
  text(c, "confidence", 0, -5, 8.5, C.cream, 200, "center");
  c.restore();
  text(c, "tests run", (x0 + x1) / 2, y0 + 7, 8.5, C.cream, 200, "center");
  const pts: [number, number][] = [[0, 0.92], [0.12, 0.88], [0.22, 0.9], [0.3, 0.7], [0.42, 0.74], [0.55, 0.4], [0.66, 0.46], [0.8, 0.14], [0.92, 0.04]];
  const P = pts.map(([u, v]) => [x0 + u * (x1 - x0 - 16), y0 - 4 - v * (y0 - y1 - 10)] as [number, number]);
  const g = c.createLinearGradient(0, y1, 0, y0);
  g.addColorStop(0, "rgba(255,111,145,0.45)"); g.addColorStop(1, "rgba(255,111,145,0.02)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(P[0][0], y0);
  for (const p of P) c.lineTo(p[0], p[1]);
  c.lineTo(P[P.length - 1][0], y0);
  c.closePath();
  c.fill();
  c.strokeStyle = C.pink; c.lineWidth = 2.6; c.lineJoin = "round"; c.lineCap = "round";
  c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
  for (const i of [3, 5, 7]) { c.fillStyle = C.cream; c.beginPath(); c.arc(P[i][0], P[i][1], 2.4, 0, Math.PI * 2); c.fill(); }
  const e = P[P.length - 1];
  head(c, e[0] + 2, e[1] - 16, 18, C.lilac, "dizzy", 0.5);
}

function drawFans(c: Ctx) {
  rr(c, 0, 0, W, H, 0, C.navy2);
  text(c, "them:", 12, 12, 9, "rgba(246,236,220,0.6)");
  text(c, "quick question", 12, 24, 11, C.cream, 90);
  text(c, "my fans:", 12, 84, 11, C.cream);
  // heat
  for (let i = 0; i < 3; i++) {
    const x = 116 + i * 30;
    c.fillStyle = i === 1 ? C.pink : C.orange;
    c.beginPath();
    for (let t = 0; t <= 1.001; t += 0.05) c.lineTo(x + Math.sin(t * 9 + i) * 4, 56 - t * 44);
    for (let t = 1; t >= -0.001; t -= 0.05) c.lineTo(x + 5 + Math.sin(t * 9 + i) * 4, 56 - t * 44);
    c.fill();
  }
  // the card
  const gx = 92, gy = 60;
  const g = c.createLinearGradient(0, gy, 0, gy + 50);
  g.addColorStop(0, "#36407e"); g.addColorStop(1, C.navy3);
  rr(c, gx, gy, 112, 50, 7, g);
  rr(c, gx + 8, gy + 50, 40, 6, 2, C.orange);
  for (const fx of [gx + 30, gx + 82]) {
    c.fillStyle = C.navy; c.beginPath(); c.arc(fx, gy + 25, 19, 0, Math.PI * 2); c.fill();
    for (let b = 0; b < 6; b++) {
      c.save(); c.translate(fx, gy + 25); c.rotate((b * Math.PI) / 3 + fx);
      c.fillStyle = b % 2 ? "rgba(79,240,160,0.75)" : "rgba(79,240,160,0.45)";
      c.beginPath(); c.ellipse(0, -9, 4.2, 9, 0.5, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    c.fillStyle = C.mint; c.beginPath(); c.arc(fx, gy + 25, 4, 0, Math.PI * 2); c.fill();
  }
  // speed marks
  for (let i = 0; i < 3; i++) rr(c, gx - 22 + i * 3, gy + 14 + i * 9, 14 - i * 3, 2.6, 1.3, "rgba(246,236,220,0.35)");
}

function drawApprove(c: Ctx) {
  rr(c, 0, 0, W, H, 0, C.navy2);
  const rows: [string, string, Mood, number][] = [["reading the docs", "#3a2346", "away", 0], ["guessing until it compiles", "#1d3a3a", "proud", 1]];
  rows.forEach(([label, bg, mood, i]) => {
    const y = i * (H / 2);
    rr(c, 0, y, 72, H / 2 - (i ? 0 : 1), 0, bg);
    rr(c, 72, y, W - 72, H / 2 - (i ? 0 : 1), 0, i ? "#202958" : "#1e2652");
    head(c, 34, y + 36, 22, i ? C.mint : C.pink, mood, i ? 0.12 : -0.15);
    // hand: raised palm or a pointing finger
    if (!i) { rr(c, 52, y + 18, 10, 16, 4, C.pink); rr(c, 54, y + 33, 6, 10, 3, shade(C.pink, -0.2)); }
    else { rr(c, 50, y + 36, 16, 7, 3.5, C.mint); rr(c, 46, y + 37, 8, 12, 3, shade(C.mint, -0.2)); }
    text(c, label, 84, y + 22 - (label.length > 18 ? 6 : 0), 11, C.cream, W - 96);
  });
}

export function drawMeme(cv: HTMLCanvasElement, kind: MemeKind) {
  const draw = () => {
    const c = canvas(cv, W, H);
    ({ repo: drawRepo, graph: drawGraph, fans: drawFans, approve: drawApprove })[kind](c);
  };
  draw();
  redrawCanvasOnLocale(cv, draw);
  // redraw once webfonts are in, so captions use the right face
  document.fonts?.ready.then(() => { if (cv.isConnected) draw(); });
}
