// Sketchpad: a little paint app. The robot picks colours and draws a house, a cat, a flower or
// itself, stroke by stroke, the pen following its cursor. Then the fill bucket, then save.
import { Kit, runApp, rnd, chance, pick, shuffle, h, canvas, marker, calm, type SoHost, type SoOpts } from "./kit";
import "./doodle.css";

type Pt = [number, number];
type Stroke = { c: number; w: number; pts: Pt[] };
type Fill = { c: number; at: Pt; shape: Pt[] | { cx: number; cy: number; r: number } };
type Drawing = { name: string; strokes: Stroke[]; fills: Fill[] };

const COLORS = ["#20263f", "#ff6f91", "#ff9f5a", "#ffd27a", "#4ff0a0", "#4fb6ff", "#b07cff", "#8b5a2b"];
const TOOL_ICONS = {
  pen: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3.5 20.5 7.5 9 19H5v-4Z"/></svg>`,
  fill: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3 19 12l-6 6.5c-.8.8-2 .8-2.8 0L4 12.3a2 2 0 0 1 0-2.8L8.5 5 7 3.5 8.5 2Zm0 4-4.6 4.6h9.2Zm9.5 9c1 1.4 1.5 2.4 1.5 3a1.5 1.5 0 0 1-3 0c0-.6.5-1.6 1.5-3Z"/></svg>`,
  erase: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 3.5 7 7-9.5 9.5H6l-3-3a2 2 0 0 1 0-2.8Zm-5 6.2-4.6 4.6L7 17h3.5l3-3Z"/><rect x="13" y="18.5" width="8" height="2" rx="1"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-2Zm2 2v5h8V5Zm5 9a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>`,
};

// --- drawings, in a 100 x 70 design space -------------------------------------------
const line = (a: Pt, b: Pt, n = 2): Pt[] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt);
const ring = (cx: number, cy: number, r: number, n = 14, a0 = -Math.PI / 2, sweep = Math.PI * 2, ry = r): Pt[] => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(a0 + (sweep * i) / n) * r, cy + Math.sin(a0 + (sweep * i) / n) * ry] as Pt);
const path = (...pts: Pt[]) => pts.flatMap((p, i) => (i ? line(pts[i - 1], p, 2).slice(1) : [p]));
const wobble = (pts: Pt[], amt = 0.5): Pt[] => pts.map(([x, y]) => [x + (Math.random() - 0.5) * amt, y + (Math.random() - 0.5) * amt]);

const DRAWINGS: (() => Drawing)[] = [
  () => ({ name: "house", strokes: [
    { c: 0, w: 2.4, pts: path([30, 62], [30, 36], [70, 36], [70, 62], [30, 62]) },
    { c: 0, w: 2.4, pts: path([26, 37], [50, 18], [74, 37]) },
    { c: 0, w: 2.2, pts: path([45, 62], [45, 48], [55, 48], [55, 62]) },
    { c: 0, w: 2, pts: path([34, 41], [41, 41], [41, 46], [34, 46], [34, 41]) },
    { c: 2, w: 2.4, pts: ring(84, 14, 6, 12) },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ c: 2, w: 1.6, pts: line([84 + Math.cos(i * 1.05) * 9, 14 + Math.sin(i * 1.05) * 9], [84 + Math.cos(i * 1.05) * 13, 14 + Math.sin(i * 1.05) * 13], 1) })),
    { c: 4, w: 2.4, pts: path([4, 63], [96, 63]) },
  ], fills: [
    { c: 3, at: [62, 52], shape: [[30, 36], [70, 36], [70, 62], [30, 62]] },
    { c: 1, at: [50, 30], shape: [[26, 37], [50, 18], [74, 37]] },
    { c: 2, at: [84, 14], shape: { cx: 84, cy: 14, r: 6 } },
  ] }),
  () => ({ name: "cat", strokes: [
    { c: 0, w: 2.4, pts: ring(42, 30, 12, 16) },
    { c: 0, w: 2.4, pts: path([32, 23], [33, 12], [40, 18.5]) },
    { c: 0, w: 2.4, pts: path([44, 18.5], [51, 12], [52, 23]) },
    { c: 0, w: 2.4, pts: ring(56, 52, 17, 16, Math.PI * 1.1, Math.PI * 1.8, 11) },
    { c: 0, w: 2.4, pts: path([72, 52], [80, 44], [84, 34], [81, 28]) },
    { c: 0, w: 3, pts: line([37, 28], [37.5, 29], 1) },
    { c: 0, w: 3, pts: line([47, 28], [47.5, 29], 1) },
    { c: 1, w: 2, pts: path([40.5, 33], [42, 34.5], [43.5, 33]) },
    { c: 0, w: 1.2, pts: line([30, 33], [22, 31], 1) }, { c: 0, w: 1.2, pts: line([30, 35], [22, 37], 1) },
    { c: 0, w: 1.2, pts: line([54, 33], [62, 31], 1) }, { c: 0, w: 1.2, pts: line([54, 35], [62, 37], 1) },
  ], fills: [
    { c: 2, at: [42, 38], shape: { cx: 42, cy: 30, r: 12 } },
    { c: 2, at: [60, 54], shape: ring(56, 52, 17, 16, Math.PI, Math.PI * 2, 11) },
  ] }),
  () => ({ name: "self portrait", strokes: [
    { c: 0, w: 2.4, pts: path([30, 22], [70, 22], [72, 24], [72, 50], [70, 52], [30, 52], [28, 50], [28, 24], [30, 22]) },
    { c: 0, w: 2.4, pts: path([36, 29], [64, 29], [64, 43], [36, 43], [36, 29]) },
    { c: 4, w: 4, pts: ring(44, 36, 2.6, 8) },
    { c: 4, w: 4, pts: ring(56, 36, 2.6, 8) },
    { c: 0, w: 2.2, pts: path([50, 22], [50, 13]) },
    { c: 1, w: 2.4, pts: ring(50, 10, 3, 10) },
    { c: 0, w: 2.2, pts: ring(50, 47, 5, 8, 0.25, Math.PI - 0.5, 2.2) },
  ], fills: [
    { c: 5, at: [32, 47], shape: [[28, 22], [72, 22], [72, 52], [28, 52]] },
    { c: 1, at: [50, 10], shape: { cx: 50, cy: 10, r: 3 } },
  ] }),
  () => ({ name: "flower", strokes: [
    { c: 4, w: 2.6, pts: path([50, 64], [50, 50], [49, 38], [50, 30]) },
    { c: 4, w: 2.2, pts: ring(42, 49, 6, 10, 0, Math.PI * 2, 3) },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ c: 1, w: 2.2, pts: ring(50 + Math.cos(i * 1.05) * 8, 22 + Math.sin(i * 1.05) * 8, 4.6, 10) })),
    { c: 3, w: 3, pts: ring(50, 22, 3.6, 10) },
    { c: 7, w: 2.4, pts: path([38, 64], [62, 64], [58, 68], [42, 68], [38, 64]) },
  ], fills: [
    { c: 1, at: [57, 18], shape: { cx: 50, cy: 22, r: 12 } },
    { c: 3, at: [50, 22], shape: { cx: 50, cy: 22, r: 3.6 } },
  ] }),
];

export async function doodleInSketchpad(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Sketchpad(k, body).session(); });
}

class Sketchpad {
  root: HTMLElement;
  paper!: HTMLElement;
  ink!: CanvasRenderingContext2D;
  fillCtx!: CanvasRenderingContext2D;
  W = 0; H = 0;
  ox = 0; oy = 0; sc = 1;
  at!: (x: number, y: number) => HTMLElement;
  swatches!: HTMLElement[];
  tools!: Record<string, HTMLElement>;
  status!: HTMLElement;
  color = 0;
  tool = "pen";

  constructor(private k: Kit, body: HTMLElement) {
    body.innerHTML = "";
    this.root = h("div", "so-dw");
    body.appendChild(this.root);
    this.root.innerHTML = `
      <header class="so-dw-top"><b>Sketchpad</b><span class="so-dw-tools">${Object.entries(TOOL_ICONS).map(([id, s]) => `<span data-t="${id}" class="${id === "pen" ? "on" : ""}">${s}</span>`).join("")}</span><span class="so-dw-name">untitled.png</span></header>
      <div class="so-dw-mid"><div class="so-dw-pal">${COLORS.map((c, i) => `<span data-c="${i}" style="background:${c}"></span>`).join("")}</div><div class="so-dw-paper"><canvas class="f"></canvas><canvas class="i"></canvas></div></div>
      <footer class="so-dw-status"></footer>`;
    this.paper = this.root.querySelector(".so-dw-paper")!;
    this.swatches = [...this.root.querySelectorAll<HTMLElement>(".so-dw-pal span")];
    this.tools = Object.fromEntries([...this.root.querySelectorAll<HTMLElement>(".so-dw-tools span")].map((e) => [e.dataset.t!, e]));
    this.status = this.root.querySelector(".so-dw-status")!;
    this.W = this.paper.clientWidth || 480;
    this.H = this.paper.clientHeight || 280;
    this.fillCtx = canvas(this.paper.querySelector("canvas.f")!, this.W, this.H);
    this.ink = canvas(this.paper.querySelector("canvas.i")!, this.W, this.H);
    this.sc = Math.min(this.W / 100, this.H / 70) * 0.92;
    this.ox = (this.W - 100 * this.sc) / 2;
    this.oy = (this.H - 70 * this.sc) / 2;
    this.at = marker(this.paper);
    this.setColor(0);
  }

  map([x, y]: Pt): Pt { return [this.ox + x * this.sc, this.oy + y * this.sc]; }

  setColor(i: number) {
    this.color = i;
    this.swatches.forEach((s, j) => s.classList.toggle("on", j === i));
    this.status.textContent = `${this.tool === "fill" ? "Fill" : "Brush"}  ·  ${COLORS[i]}  ·  ${Math.round(this.W)} x ${Math.round(this.H)}`;
  }

  async useTool(t: string) {
    if (this.tool === t) return;
    await this.k.click(this.tools[t]);
    this.tool = t;
    Object.entries(this.tools).forEach(([id, e]) => e.classList.toggle("on", id === t));
  }

  async pickColor(i: number) {
    if (this.color === i) return;
    await this.k.click(this.swatches[i], 0.5, 0.5, 420);
    this.setColor(i);
    await this.k.sleep(rnd(150, 350));
  }

  async stroke(s: Stroke) {
    const pts = wobble(s.pts).map((p) => this.map(p));
    const ctx = this.ink;
    ctx.strokeStyle = COLORS[s.c];
    ctx.lineWidth = s.w * this.sc * 0.42;
    ctx.lineCap = ctx.lineJoin = "round";
    await this.k.point(this.at(pts[0][0], pts[0][1]), 0, 0, 360);
    let [px, py] = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      const dist = Math.hypot(x - px, y - py);
      const secs = this.k.moveSecs(dist, 110);
      const from = { x: px, y: py }, seg = { t: 0 };
      let lx = px, ly = py;
      // the line grows along with the cursor
      const tw = this.k.to(seg, {
        t: 1, duration: secs, ease: "power2.inOut",
        onUpdate: () => {
          const nx = from.x + (x - from.x) * seg.t, ny = from.y + (y - from.y) * seg.t;
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(nx, ny); ctx.stroke();
          lx = nx; ly = ny;
        },
      });
      await this.k.point(this.at(x, y), 0, 0, 110);
      tw.progress(1);
      px = x; py = y;
    }
  }

  async fill(f: Fill) {
    const [cx, cy] = this.map(f.at);
    await this.k.click(this.at(cx, cy), 0, 0, 400);
    const ctx = this.fillCtx, col = COLORS[f.c];
    const shape = () => {
      ctx.beginPath();
      if (Array.isArray(f.shape)) f.shape.forEach((p, i) => { const [x, y] = this.map(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      else { const [x, y] = this.map([f.shape.cx, f.shape.cy]); ctx.arc(x, y, f.shape.r * this.sc, 0, Math.PI * 2); }
      ctx.closePath();
    };
    const grow = { r: 0 };
    const paint = () => { ctx.save(); shape(); ctx.clip(); ctx.beginPath(); ctx.arc(cx, cy, grow.r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.restore(); };
    if (calm()) { grow.r = 9999; paint(); }
    else await new Promise<void>((r) => this.k.to(grow, { r: 60 * this.sc, duration: 0.45, ease: "power2.out", onUpdate: paint, onComplete: () => r() }));
    await this.k.sleep(rnd(250, 500));
  }

  async draw(d: Drawing) {
    this.root.querySelector(".so-dw-name")!.textContent = `${d.name.replace(/\s+/g, "_")}.png`;
    await this.useTool("pen");
    for (const s of d.strokes) {
      await this.pickColor(s.c);
      await this.stroke(s);
      if (chance(0.15)) { this.k.host.react("focus"); await this.k.sleep(rnd(300, 700)); }
    }
    await this.k.sleep(rnd(500, 900));
    if (d.fills.length) {
      await this.useTool("fill");
      for (const f of d.fills) { await this.pickColor(f.c); await this.fill(f); }
    }
    await this.k.sleep(rnd(800, 1500));
    this.k.host.react(chance(0.7) ? "cheer" : "shy");
    await this.k.click(this.tools.save);
    const toast = h("div", "so-dw-toast", `Saved ${this.root.querySelector(".so-dw-name")!.textContent} to Drawings`);
    this.root.appendChild(toast);
    if (!calm()) this.k.fromTo(toast, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 });
    await this.k.sleep(2200);
    toast.remove();
  }

  clear() {
    this.ink.clearRect(0, 0, this.W, this.H);
    this.fillCtx.clearRect(0, 0, this.W, this.H);
  }

  async session() {
    await this.k.sleep(rnd(600, 1000));
    const order = shuffle([...DRAWINGS]);
    for (let i = 0; i < order.length && this.k.left > 20000; i++) {
      if (i) {
        // a fresh page
        await this.useTool("erase");
        await this.k.click(this.paper, 0.5, 0.5);
        if (!calm()) await new Promise<void>((r) => this.k.to(this.paper.querySelectorAll("canvas"), { opacity: 0, duration: 0.3, onComplete: () => r() }));
        this.clear();
        this.k.set(this.paper.querySelectorAll("canvas"), { opacity: 1 });
      }
      await this.draw(order[i]());
    }
    // admire it a little longer
    if (this.k.left > 3000) { this.k.host.react(pick(["relax", "cheer"] as const)); await this.k.sleep(Math.min(4000, this.k.left - 500)); }
  }
}
