// Shared plumbing for the src/games pack. Self-contained on purpose: the fun pack
// is being edited elsewhere, so only the FunHost types are borrowed from it.
import gsap from "gsap";
import type { FunHost, FunOpts, Outcome } from "../fun/host";
import { renderLoop } from "../perf/render";
import { LiveCanvases, fitCanvas } from "../perf/canvas";
export { fitCanvas } from "../perf/canvas";

export type { FunHost, FunOpts, Outcome };

/** Everything a game starts (frames, timers, listeners, tweens) is registered here and torn down at once. */
export class Scope {
  private fns: (() => void)[] = [];
  private tweens: (gsap.core.Tween | gsap.core.Timeline)[] = [];
  disposed = false;
  private canvases: LiveCanvases;
  constructor(private owner?: HTMLElement) { this.canvases = new LiveCanvases(owner); }

  add(fn: () => void) { this.fns.push(fn); }
  liveCanvas(canvas: HTMLCanvasElement) { return this.canvases.add(canvas); }
  releaseCanvas(canvas: HTMLCanvasElement) { this.canvases.remove(canvas); }

  /** rAF loop with time in seconds and a clamped delta. */
  raf(cb: (now: number, dt: number) => void) {
    this.add(renderLoop(this.owner, (now, dt) => { if (!this.disposed) { this.canvases.prepare(); cb(now / 1000, dt); } }));
  }

  tw<T extends gsap.core.Tween | gsap.core.Timeline>(t: T): T {
    if (this.disposed) { t.kill(); return t; }
    this.tweens.push(t);
    if (this.tweens.length > 200) this.tweens = this.tweens.filter((x) => x.isActive());
    return t;
  }
  to(target: gsap.TweenTarget, vars: gsap.TweenVars) { return this.tw(gsap.to(target, vars)); }
  fromTo(target: gsap.TweenTarget, from: gsap.TweenVars, vars: gsap.TweenVars) { return this.tw(gsap.fromTo(target, from, vars)); }
  set(target: gsap.TweenTarget, vars: gsap.TweenVars) { gsap.set(target, vars); }
  timeline(vars?: gsap.TimelineVars) { return this.tw(gsap.timeline(vars)); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.tweens) t.kill();
    this.tweens = [];
    for (const f of this.fns.splice(0).reverse()) {
      try { f(); } catch { /* keep cleaning */ }
    }
    this.canvases.clear();
  }
}

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const DPR = 2;

export function html(s: string) {
  const t = document.createElement("template");
  t.innerHTML = s.trim();
  return t.content.firstElementChild as HTMLElement;
}

/** Small seeded RNG so procedural content is repeatable per seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function gauss(r: () => number = Math.random) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const pick = <T,>(a: readonly T[], r: () => number = Math.random) => a[Math.floor(r() * a.length)];
export const chance = (p: number) => Math.random() < p;

// ---- flat vector drawing (no outlines) ------------------------------------------------

export type Ctx = CanvasRenderingContext2D;
export const P = {
  night: "#141a33", night2: "#1b2246", night3: "#252d5c", deep: "#0e1233", panel: "#161a45",
  orange: "#ff9f5a", orange2: "#ff8f5a", mint: "#4ff0a0", sky: "#4fb6ff", pink: "#ff6f91",
  lilac: "#b07cff", cream: "#f6ecdc", ink: "#eef0ff", soft: "#c9cdf5", dim: "#8a91c4",
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
export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
export function poly(ctx: Ctx, pts: [number, number][], fill: string | CanvasGradient) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
export function line(ctx: Ctx, pts: [number, number][], width: number, color: string) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
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
export function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, o: { weight?: number; align?: CanvasTextAlign; mono?: boolean } = {}) {
  ctx.font = `${o.weight ?? 500} ${size}px ${o.mono ? '"JetBrains Mono Variable", ui-monospace, monospace' : '"Lexend Variable", system-ui, sans-serif'}`;
  ctx.textAlign = o.align ?? "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
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
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${clamp(a)})`;
}
export function mix(a: string, b: string, t: number) {
  const A = rgb(a), B = rgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * clamp(t)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
export function shade(hex: string, amt: number) {
  return amt >= 0 ? mix(hex, "#ffffff", amt) : mix(hex, "#000000", -amt);
}

// ---- frame + session -----------------------------------------------------------------

export interface Frame {
  root: HTMLElement;
  stage: HTMLElement;
  w: number;
  h: number;
  setScore(s: string, bump?: boolean): void;
  showOver(title: string, detail: string, tone?: "good" | "bad" | "plain"): void;
  hideOver(): void;
  /** An invisible box the robot's cursor can point at, placed in stage pixels. */
  aim(x: number, y: number, w?: number, h?: number): HTMLElement;
}

/** Header row (name left, status right) above a stage with a result overlay. */
export function mountFrame(body: HTMLElement, scope: Scope, name: string, kind: string): Frame {
  body.innerHTML = "";
  const root = html(`
    <div class="gm-game gm-${kind}">
      <div class="gm-head"><span class="gm-name"></span><span class="gm-score"></span></div>
      <div class="gm-stage">
        <div class="gm-over" aria-live="polite"><b class="gm-over-t"></b><span class="gm-over-d"></span></div>
        <i class="gm-aim" aria-hidden="true"></i>
      </div>
    </div>`);
  root.querySelector(".gm-name")!.textContent = name;
  body.appendChild(root);
  const stage = root.querySelector(".gm-stage") as HTMLElement;
  const w = stage.clientWidth || body.clientWidth || 440;
  const h = stage.clientHeight || Math.max(120, (body.clientHeight || 366) - 30);
  const score = root.querySelector(".gm-score") as HTMLElement;
  const over = root.querySelector(".gm-over") as HTMLElement;
  const ot = over.querySelector(".gm-over-t") as HTMLElement;
  const od = over.querySelector(".gm-over-d") as HTMLElement;
  const aimEl = root.querySelector(".gm-aim") as HTMLElement;
  return {
    root, stage, w, h,
    setScore(s, bump) {
      if (score.textContent === s) return;
      score.textContent = s;
      if (bump) scope.fromTo(score, { scale: 1.2 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
    },
    showOver(title, detail, tone = "plain") {
      ot.textContent = title;
      od.textContent = detail;
      over.dataset.tone = tone;
      over.classList.add("gm-on");
      scope.fromTo(over, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "sine.out" });
      scope.fromTo(ot, { y: 14, scale: 0.9 }, { y: 0, scale: 1, duration: 0.6, ease: "back.out(2.2)" });
      scope.fromTo(od, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.12, ease: "expo.out" });
    },
    hideOver() {
      scope.to(over, { opacity: 0, duration: 0.25, ease: "sine.in", onComplete: () => over.classList.remove("gm-on") });
    },
    aim(x, y, aw = 10, ah = 10) {
      // left/top (not transforms): the real host measures offsetLeft/offsetTop
      aimEl.style.left = `${Math.round(x - aw / 2)}px`;
      aimEl.style.top = `${Math.round(y - ah / 2)}px`;
      aimEl.style.width = `${Math.round(aw)}px`;
      aimEl.style.height = `${Math.round(ah)}px`;
      return aimEl;
    },
  };
}

export function addCanvas(stage: HTMLElement, w: number, h: number, cls = "") {
  const c = document.createElement("canvas");
  if (cls) c.className = cls;
  stage.insertBefore(c, stage.firstChild);
  return { canvas: c, ctx: fitCanvas(c, w, h) };
}

/** Win/lose bookkeeping: losing streaks, ragequits, time budget. */
export class Session {
  readonly start = performance.now();
  readonly skill: number;
  streak = 0;
  rounds = 0;
  constructor(private host: FunHost, private opts: FunOpts, private rage = { base: 0.3, step: 0.15, calm: 0.08 }) {
    this.skill = clamp(opts.skill ?? 0.6);
  }
  get elapsed() { return performance.now() - this.start; }
  get left() { return this.opts.maxMs - this.elapsed; }
  get timeUp() { return this.elapsed >= this.opts.maxMs; }
  get over() { return this.host.stopped || this.timeUp; }
  /** After a loss: retry, quit calmly or ragequit. A first loss can already sting. */
  afterLoss(firstRage = 0.12): "retry" | "lose" | "ragequit" {
    this.streak++;
    const p = this.streak >= 2
      ? this.rage.base + this.rage.step * (this.streak - 2) + (0.6 - this.skill) * 0.25
      : firstRage + (0.6 - this.skill) * 0.15;
    if (Math.random() < clamp(p, 0.04, 0.9)) return "ragequit";
    if (this.rounds >= 2 && Math.random() < this.rage.calm) return "lose";
    return "retry";
  }
}

/** Thrown out of a game script when the host stops it or time runs out. */
export class Halt extends Error {}

/** Sleep that throws Halt when the host stops, so scripts unwind quickly. */
export async function nap(host: FunHost, ms: number) {
  if (host.stopped) throw new Halt();
  await host.sleep(Math.max(0, ms));
  if (host.stopped) throw new Halt();
}

export async function waitUntil(host: FunHost, cond: () => boolean, maxMs: number, slice = 60) {
  const t0 = performance.now();
  while (!cond() && performance.now() - t0 < maxMs) {
    if (host.stopped) return;
    await host.sleep(slice);
  }
}

/** Human-ish pause: base plus jitter, slower when skill is low. */
export const think = (skill: number, base: number, spread = 0.6) => base * (0.75 + Math.random() * spread) * (1.25 - skill * 0.45);
