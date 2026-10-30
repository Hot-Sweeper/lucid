import gsap from "gsap";

/** Everything an activity starts (timers, frames, listeners, tweens) is registered here and torn down at once. */
export class Scope {
  private fns: (() => void)[] = [];
  private tweens: (gsap.core.Tween | gsap.core.Timeline)[] = [];
  disposed = false;

  add(fn: () => void) { this.fns.push(fn); }

  /** rAF loop with time in seconds and a clamped delta. */
  raf(cb: (now: number, dt: number) => void) {
    let id = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      cb(now / 1000, dt);
      if (!this.disposed) id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    this.add(() => cancelAnimationFrame(id));
  }

  timeout(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    this.add(() => window.clearTimeout(id));
  }

  tw<T extends gsap.core.Tween | gsap.core.Timeline>(t: T): T {
    this.tweens.push(t);
    if (this.tweens.length > 200) this.tweens = this.tweens.filter((x) => x.isActive());
    return t;
  }

  to(target: gsap.TweenTarget, vars: gsap.TweenVars) { return this.tw(gsap.to(target, vars)); }
  fromTo(target: gsap.TweenTarget, from: gsap.TweenVars, vars: gsap.TweenVars) { return this.tw(gsap.fromTo(target, from, vars)); }

  /** A tween you can await. Resolves when it completes (or is killed on dispose). */
  play(target: gsap.TweenTarget, vars: gsap.TweenVars) {
    return new Promise<void>((resolve) => {
      this.tw(gsap.to(target, { ...vars, onComplete: () => resolve(), onInterrupt: () => resolve() }));
      this.add(() => resolve());
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.tweens) t.kill();
    this.tweens = [];
    for (const f of this.fns.splice(0).reverse()) {
      try { f(); } catch { /* keep cleaning */ }
    }
  }
}

export const DPR = 2;

/** Size a canvas for its CSS box at devicePixelRatio 2. */
export function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  canvas.width = Math.max(1, Math.round(w * DPR));
  canvas.height = Math.max(1, Math.round(h * DPR));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return ctx;
}

export function measure(el: HTMLElement, fw: number, fh: number) {
  const w = el.clientWidth || fw;
  const h = el.clientHeight || fh;
  return { w, h };
}

export function html(s: string) {
  const t = document.createElement("template");
  t.innerHTML = s.trim();
  return t.content.firstElementChild as HTMLElement;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Small seeded RNG so procedural content is repeatable. */
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

/** Deterministic hash noise in 0..1. */
export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function gauss(r: () => number) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t: number) => Math.pow(clamp(t), 3);
export const easeInOut = (t: number) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const backOut = (t: number, s = 1.7) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
/** 0..1 ramp of t between a and b. */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
