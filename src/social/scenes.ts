// Little flat illustrations used as "photos" in the social apps: robots at the beach,
// latte art, grandma's good-morning flowers and so on. Pure canvas drawing, any size.
import { drawBot, circle, ellipse, fillRR, lin, rad, poly, text, shade, withAlpha, drawGPU } from "../fun/draw";
import { canvas } from "../life/util";

type Ctx = CanvasRenderingContext2D;
type Paint = (c: Ctx, w: number, h: number, t: number) => void;
// Scattered positions that do not line up in rows, whatever the canvas size.
const R = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

const sky = (c: Ctx, w: number, h: number, a: string, b: string) => { c.fillStyle = lin(c, 0, 0, 0, h, [[0, a], [1, b]]); c.fillRect(0, 0, w, h); };

export const SCENES: Record<string, Paint> = {
  beach(c, w, h, t) {
    sky(c, w, h, "#7fd3ff", "#cdeeff");
    circle(c, w * 0.8, h * 0.2, h * 0.09, "#ffe08a");
    c.fillStyle = "#3aa6d8"; c.fillRect(0, h * 0.5, w, h * 0.2);
    for (let i = 0; i < 5; i++) fillRR(c, ((i * w) / 4 + t * 8) % (w + 30) - 20, h * (0.55 + (i % 2) * 0.06), 18, 2, 1, withAlpha("#ffffff", 0.6));
    c.fillStyle = "#ffd9a0"; c.fillRect(0, h * 0.68, w, h);
    // umbrella
    poly(c, [[w * 0.2, h * 0.5], [w * 0.38, h * 0.5], [w * 0.29, h * 0.38]], "#ff6f91");
    c.fillStyle = "#6a4a2a"; c.fillRect(w * 0.288, h * 0.45, 2, h * 0.32);
    drawBot(c, w * 0.6, h * 0.86, h / 110, { body: "#ff9f5a", eyes: "happy", armR: 2.6, elbowR: 0.4 });
    ellipse(c, w * 0.42, h * 0.88, 9, 4, 0, "#e9b97a");
  },
  latte(c, w, h) {
    c.fillStyle = "#7a4e32"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) c.fillRect(0, (i * h) / 6, w, 1);
    const r = Math.min(w, h) * 0.36;
    circle(c, w / 2, h / 2, r * 1.18, "#f6ecdc");
    circle(c, w / 2, h / 2, r, "#b9774a");
    circle(c, w / 2, h / 2, r * 0.82, "#d4955f");
    // a robot face drawn in foam
    fillRR(c, w / 2 - r * 0.45, h / 2 - r * 0.3, r * 0.9, r * 0.62, r * 0.22, "#f9efe0");
    circle(c, w / 2 - r * 0.18, h / 2, r * 0.08, "#b9774a");
    circle(c, w / 2 + r * 0.18, h / 2, r * 0.08, "#b9774a");
    c.fillStyle = "#f9efe0"; c.fillRect(w / 2 - 1, h / 2 - r * 0.52, 2, r * 0.22);
    circle(c, w / 2, h / 2 - r * 0.55, r * 0.07, "#f9efe0");
    ellipse(c, w / 2 + r * 1.3, h / 2, r * 0.26, r * 0.4, 0, "#f6ecdc");
  },
  mountain(c, w, h) {
    sky(c, w, h, "#ffcf9a", "#ff9fb4");
    poly(c, [[-10, h], [w * 0.45, h * 0.25], [w + 10, h]], "#5a3fa0");
    poly(c, [[w * 0.36, h * 0.42], [w * 0.45, h * 0.25], [w * 0.54, h * 0.42], [w * 0.48, h * 0.38], [w * 0.42, h * 0.43]], "#f6ecdc");
    poly(c, [[-10, h], [w * 0.15, h * 0.55], [w * 0.5, h]], "#3d2a78");
    drawBot(c, w * 0.45, h * 0.27, h / 260, { body: "#4fb6ff", armL: 2.8, armR: 2.8 });
    fillRR(c, w * 0.45 + 6, h * 0.08, 1.5, h * 0.12, 1, "#f6ecdc");
    poly(c, [[w * 0.45 + 7.5, h * 0.08], [w * 0.45 + 18, h * 0.11], [w * 0.45 + 7.5, h * 0.14]], "#ff6f91");
  },
  plant(c, w, h, t) {
    c.fillStyle = "#e9f4ea"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#cfe3d0"; c.fillRect(w * 0.62, 0, w * 0.06, h);
    fillRR(c, w * 0.36, h * 0.62, w * 0.28, h * 0.3, 6, "#ff9f5a");
    const leaf = (a: number, l: number, col: string) => { c.save(); c.translate(w / 2, h * 0.64); c.rotate(a + Math.sin(t * 1.2 + a) * 0.03); ellipse(c, 0, -l / 2, l * 0.2, l / 2, 0, col); c.restore(); };
    leaf(-0.7, h * 0.36, "#2f9e6a"); leaf(0.6, h * 0.4, "#35b37a"); leaf(-0.15, h * 0.48, "#3fc489"); leaf(0.25, h * 0.3, "#7be3a7");
  },
  pizza(c, w, h) {
    c.fillStyle = "#c2412d"; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) if (((x + y) / 16) % 2 === 0) { c.fillStyle = "#f6ecdc"; c.fillRect(x, y, 16, 16); }
    const r = Math.min(w, h) * 0.4;
    circle(c, w / 2, h / 2, r, "#e8a24a");
    circle(c, w / 2, h / 2, r * 0.86, "#ffd27a");
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, d = r * (0.25 + (i % 3) * 0.2); circle(c, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, r * 0.1, "#d9480f"); }
    for (let i = 0; i < 4; i++) { c.save(); c.translate(w / 2, h / 2); c.rotate((i * Math.PI) / 4); c.fillStyle = withAlpha("#b5651d", 0.45); c.fillRect(-r * 0.86, -0.6, r * 1.72, 1.2); c.restore(); }
  },
  sunset(c, w, h, t) {
    sky(c, w, h, "#ff9f5a", "#b4507a");
    circle(c, w / 2, h * 0.62, h * 0.18, "#ffe08a");
    c.fillStyle = "#2b1d4a"; c.fillRect(0, h * 0.66, w, h);
    for (let i = 0; i < 5; i++) fillRR(c, w / 2 - (24 - i * 4), h * (0.7 + i * 0.05), (24 - i * 4) * 2, 2, 1, withAlpha("#ffcf7a", 0.6 - i * 0.1 + Math.sin(t * 2 + i) * 0.05));
    drawBot(c, w * 0.22, h * 0.68, h / 160, { body: "#2b1d4a", visor: "#2b1d4a", eye: "#ffcf7a" });
  },
  cat(c, w, h, t) {
    c.fillStyle = "#ffe8cc"; c.fillRect(0, 0, w, h);
    fillRR(c, w * 0.1, h * 0.7, w * 0.8, h * 0.2, 6, "#d9a066");
    drawBot(c, w * 0.32, h * 0.86, h / 120, { body: "#b07cff", eyes: "happy", tilt: 0.15 });
    const cx = w * 0.66, cy = h * 0.7;
    ellipse(c, cx, cy, w * 0.15, h * 0.09, 0, "#f08c3a");
    circle(c, cx + w * 0.12, cy - h * 0.08, h * 0.08, "#f08c3a");
    poly(c, [[cx + w * 0.08, cy - h * 0.12], [cx + w * 0.09, cy - h * 0.2], [cx + w * 0.12, cy - h * 0.14]], "#f08c3a");
    poly(c, [[cx + w * 0.13, cy - h * 0.14], [cx + w * 0.16, cy - h * 0.2], [cx + w * 0.17, cy - h * 0.12]], "#f08c3a");
    c.strokeStyle = "#5a3a1a"; c.lineWidth = 1.2; c.lineCap = "round";
    for (const dx of [-0.03, 0.02]) { c.beginPath(); c.arc(cx + w * (0.12 + dx), cy - h * 0.08, 2, Math.PI * 0.1, Math.PI * 0.9); c.stroke(); }
    c.save(); c.translate(cx - w * 0.14, cy); c.rotate(Math.sin(t * 2) * 0.3); fillRR(c, -w * 0.12, -2, w * 0.12, 4, 2, "#f08c3a"); c.restore();
  },
  snow(c, w, h, t) {
    sky(c, w, h, "#9fb4ff", "#e3e9ff");
    c.fillStyle = "#ffffff"; c.fillRect(0, h * 0.72, w, h);
    circle(c, w * 0.62, h * 0.74, h * 0.12, "#fff"); circle(c, w * 0.62, h * 0.56, h * 0.09, "#fff");
    fillRR(c, w * 0.62 - 9, h * 0.53, 18, 6, 2, "#141a33");
    circle(c, w * 0.6, h * 0.555, 1.5, "#4ff0a0"); circle(c, w * 0.64, h * 0.555, 1.5, "#4ff0a0");
    drawBot(c, w * 0.3, h * 0.84, h / 120, { body: "#ff6f91", eyes: "happy", armR: 2.2 });
    for (let i = 0; i < 26; i++) { const x = R(i, 3) * w, y = ((R(i, 4) * h + t * 18 * (1 + (i % 3) * 0.3)) % h); circle(c, x, y, 1 + (i % 2), "#fff"); }
  },
  morning(c, w, h) {
    // grandma's good-morning picture: soft focus flowers and big glittery letters
    c.save();
    c.filter = "blur(2.2px)";
    sky(c, w, h, "#ffd1e3", "#ffe8b3");
    for (let i = 0; i < 9; i++) {
      const x = ((i * 47) % (w - 20)) + 10, y = h * 0.55 + ((i * 29) % (h * 0.4));
      for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; circle(c, x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6, ["#ff6f91", "#b07cff", "#ff9f5a"][i % 3]); }
      circle(c, x, y, 4, "#ffd27a");
    }
    c.restore();
    c.save(); c.filter = "blur(0.6px)";
    text(c, "Good Morning", w / 2, h * 0.3, Math.max(10, w * 0.12), "#d6336c", { weight: 700, align: "center" });
    text(c, "have a blessed boot", w / 2, h * 0.3 + w * 0.1, Math.max(7, w * 0.055), "#7a3a9a", { weight: 600, align: "center" });
    c.restore();
  },
  dinner(c, w, h) {
    c.fillStyle = "#ffcf9a"; c.fillRect(0, 0, w, h);
    fillRR(c, -10, h * 0.66, w + 20, h * 0.4, 0, "#a0522d");
    drawBot(c, w * 0.32, h * 0.8, h / 120, { body: "#ff8fb1", eyes: "happy" });
    drawBot(c, w * 0.6, h * 0.8, h / 110, { body: "#ff9f5a", eyes: "happy", armR: 2.4 });
    ellipse(c, w * 0.46, h * 0.74, 14, 4, 0, "#fff"); circle(c, w * 0.46, h * 0.72, 5, "#e8a24a");
    // the sister's elbow
    fillRR(c, w * 0.9, h * 0.6, w * 0.2, 7, 3, "#4ff0a0");
  },
  grill(c, w, h, t) {
    sky(c, w, h, "#7fd3ff", "#bfe8ff");
    c.fillStyle = "#5cb85c"; c.fillRect(0, h * 0.7, w, h);
    fillRR(c, w * 0.3, h * 0.42, w * 0.4, h * 0.14, 6, "#212529");
    c.fillStyle = "#495057"; c.fillRect(w * 0.34, h * 0.56, 3, h * 0.2); c.fillRect(w * 0.64, h * 0.56, 3, h * 0.2);
    for (let i = 0; i < 3; i++) ellipse(c, w * (0.42 + i * 0.08), h * (0.36 - ((t * 0.3 + i * 0.3) % 1) * 0.2), 5, 7, 0, withAlpha("#ffffff", 0.5 - ((t * 0.3 + i * 0.3) % 1) * 0.5));
    text(c, "SPARKY", w / 2, h * 0.5, Math.max(7, w * 0.05), "#ffd27a", { weight: 700, align: "center" });
  },
  gpu(c, w, h, t) {
    c.fillStyle = "#141a33"; c.fillRect(0, 0, w, h);
    c.fillStyle = rad(c, w / 2, h / 2, w * 0.6, [[0, "#2a3a8a"], [1, "#141a33"]]); c.fillRect(0, 0, w, h);
    drawGPU(c, w * 0.12, h * 0.32, w * 0.76, t, { fans: 3, rgb: true });
    for (let i = 0; i < 12; i++) circle(c, R(i, 5) * w, R(i, 6) * h, 1.2, withAlpha("#bfe8ff", 0.7));
  },
  meme(c, w, h, t) {
    c.fillStyle = "#f6ecdc"; c.fillRect(0, 0, w, h);
    fillRR(c, w * 0.08, h * 0.2, w * 0.36, h * 0.6, 8, "#4fb6ff");
    drawBot(c, w * 0.26, h * 0.72, h / 120, { body: "#ff9f5a", eyes: "wide", armR: 2.4, elbowR: 0.6 });
    fillRR(c, w * 0.54, h * 0.32, w * 0.36, h * 0.3, 6, "#212529");
    for (let i = 0; i < 4; i++) fillRR(c, w * 0.58, h * (0.37 + i * 0.05), w * (0.12 + ((i * 7) % 5) * 0.03), 2.4, 1, ["#4ff0a0", "#ffd27a", "#ff6f91", "#7fd3ff"][i]);
    text(c, "it's just a spreadsheet", w / 2, h * 0.12, Math.max(7, w * 0.06), "#141a33", { weight: 700, align: "center" });
    void t;
  },
  split(c, w, h) {
    fillRR(c, 0, 0, w / 2 - 1, h, 0, "#4ff0a0");
    fillRR(c, w / 2 + 1, 0, w / 2, h, 0, "#ff6f91");
    drawBot(c, w * 0.25, h * 0.85, h / 120, { body: "#ff9f5a", eyes: "wide" });
    drawBot(c, w * 0.75, h * 0.92, h / 120, { body: "#ff9f5a", eyes: "closed", tilt: 0.5, squash: 0.85 });
    text(c, "9 AM", w * 0.25, h * 0.14, Math.max(8, w * 0.06), "#0f4a40", { weight: 700, align: "center" });
    text(c, "5 PM", w * 0.75, h * 0.14, Math.max(8, w * 0.06), "#5a1030", { weight: 700, align: "center" });
  },
  pigeon(c, w, h, t) {
    sky(c, w, h, "#cfe3ff", "#e9f1ff");
    c.fillStyle = "#adb5bd"; c.fillRect(0, h * 0.75, w, h);
    const x = w * (0.2 + ((t * 0.05) % 0.6)), y = h * 0.66;
    ellipse(c, x, y, 18, 12, 0, "#868e96"); circle(c, x + 14, y - 10, 8, "#495057");
    poly(c, [[x + 21, y - 10], [x + 27, y - 8], [x + 21, y - 7]], "#ffb84d");
    fillRR(c, x + 18, y - 2, 26, 10, 3, "#ffd9a0"); fillRR(c, x + 18, y + 2, 26, 3, 1, "#5cb85c");
  },
  moon(c, w, h) {
    sky(c, w, h, "#0e1233", "#2a2f6a");
    for (let i = 0; i < 30; i++) circle(c, R(i, 1) * w, R(i, 2) * h * 0.8, (i % 3) * 0.5 + 0.6, withAlpha("#ffffff", 0.7));
    circle(c, w * 0.6, h * 0.4, h * 0.2, "#f6ecdc");
    circle(c, w * 0.56, h * 0.36, h * 0.04, "#e0d4bd"); circle(c, w * 0.66, h * 0.46, h * 0.03, "#e0d4bd");
    c.fillStyle = "#141a33"; c.fillRect(0, h * 0.82, w, h);
  },
};

/** A canvas with a scene painted on it. Pass `live` a frame hook to animate it while it is on screen. */
export function sceneCanvas(kind: string, w: number, h: number, live?: (draw: (t: number) => void) => void) {
  const el = document.createElement("canvas");
  el.className = "so-scene";
  const ctx = canvas(el, w, h);
  const paint = SCENES[kind] ?? SCENES.sunset;
  const draw = (t: number) => { ctx.save(); ctx.clearRect(0, 0, w, h); paint(ctx, w, h, t); ctx.restore(); };
  draw(1.5);
  live?.(draw);
  return el;
}

export { shade };
