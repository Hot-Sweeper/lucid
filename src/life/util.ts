import gsap from "gsap";
import { renderLoop } from "../perf/render";
import type { FunHost, FunOpts, Outcome } from "./types";

// Thrown internally when time is up or the host says stop. Never leaves this module.
class Halt extends Error {}

type Tick = (now: number, dt: number) => void;

// Everything an app starts (tweens, timers, frame loops) goes through a Kit,
// so a single kill() stops all of it synchronously.
export class Kit {
  private anims = new Set<gsap.core.Animation>();
  private timers = new Set<number>();
  private ticks = new Set<Tick>();
  private stopFrames: (() => void) | null = null;
  dead = false;
  readonly t0 = performance.now();

  constructor(readonly root: HTMLElement, readonly host: FunHost, readonly opts: FunOpts) {}

  get left() { return this.opts.maxMs - (performance.now() - this.t0); }
  get over() { return this.dead || this.host.stopped || this.left <= 0; }
  check() { if (this.over) throw new Halt(); }

  // --- animation ----------------------------------------------------------
  track<T extends gsap.core.Animation>(a: T): T {
    if (this.dead) { a.kill(); return a; }
    this.anims.add(a);
    if (this.anims.size > 240) for (const x of this.anims) if (!x.isActive() && x.progress() >= 1) { x.kill(); this.anims.delete(x); }
    return a;
  }
  to(t: gsap.TweenTarget, v: gsap.TweenVars) { return this.track(gsap.to(t, v)); }
  from(t: gsap.TweenTarget, v: gsap.TweenVars) { return this.track(gsap.from(t, v)); }
  fromTo(t: gsap.TweenTarget, a: gsap.TweenVars, b: gsap.TweenVars) { return this.track(gsap.fromTo(t, a, b)); }
  tl(v?: gsap.TimelineVars) { return this.track(gsap.timeline(v)); }
  set(t: gsap.TweenTarget, v: gsap.TweenVars) { gsap.set(t, v); }

  later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => { this.timers.delete(id); if (!this.dead) fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  every(fn: Tick) {
    this.ticks.add(fn);
    if (!this.stopFrames && !this.dead) this.stopFrames = renderLoop(this.root, this.frame);
    return () => { this.ticks.delete(fn); if (!this.ticks.size) { this.stopFrames?.(); this.stopFrames = null; } };
  }
  private frame = (now: number, dt: number) => {
    if (this.dead) return;
    for (const f of this.ticks) f(now, dt);
  };

  // --- robot --------------------------------------------------------------
  async sleep(ms: number) { this.check(); await this.host.sleep(ms); this.check(); }
  async point(el: Element, ax = 0.5, ay = 0.5, ms?: number) { this.check(); await this.host.pointAt(el, ax, ay, ms); }
  async click(el?: Element, ax = 0.5, ay = 0.5, ms?: number) {
    if (el) await this.point(el, ax, ay, ms);
    this.check();
    await this.host.click();
  }
  tap(key: string) { if (!this.dead) this.host.tap(key); }

  // Matches how the host cursor times a move, so dragged things can keep up with it.
  moveSecs(dist: number, ms = 520) { return Math.max(0.16, Math.min(0.9, (ms / 1000) * (0.45 + dist / 700))); }

  kill() {
    if (this.dead) return;
    this.dead = true;
    for (const a of this.anims) a.kill();
    this.anims.clear();
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.ticks.clear();
    this.stopFrames?.(); this.stopFrames = null;
    gsap.killTweensOf(this.root.querySelectorAll("*"));
  }
}

export async function runApp(body: HTMLElement, host: FunHost, opts: FunOpts, fn: (k: Kit) => Promise<void>): Promise<Outcome> {
  const k = new Kit(body, host, opts);
  try {
    await fn(k);
    return { result: "done" };
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    k.kill();
  }
}

// --- small helpers ------------------------------------------------------------
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const irnd = (a: number, b: number) => Math.floor(rnd(a, b + 1));
export const chance = (p: number) => Math.random() < p;
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}

// Position of el inside box in box's own (unscaled) pixels.
export function rel(el: Element, box: HTMLElement) {
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  const k = b.width / (box.offsetWidth || 1) || 1;
  return { x: (r.left - b.left) / k, y: (r.top - b.top) / k, w: r.width / k, h: r.height / k };
}

export function canvas(el: HTMLCanvasElement, w: number, h: number) {
  el.width = Math.max(1, Math.round(w * 2));
  el.height = Math.max(1, Math.round(h * 2));
  el.style.width = w + "px";
  el.style.height = h + "px";
  const ctx = el.getContext("2d")!;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  return ctx;
}

export function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
