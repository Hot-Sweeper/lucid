import type { FunHost, FunOpts } from "../host";
import { Scope, fitCanvas, measure, html, clamp } from "../util";

export interface GameView {
  root: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  setScore(s: string, bump?: boolean): void;
  showOver(title: string, detail: string): void;
  hideOver(): void;
}

/** Header row (name left, score right) above a canvas stage with a game-over overlay. */
export function mountGame(body: HTMLElement, scope: Scope, name: string, kind: string): GameView {
  body.innerHTML = "";
  const root = html(`
    <div class="fun-game fun-${kind}">
      <div class="fun-head"><span class="fun-name"></span><span class="fun-score"></span></div>
      <div class="fun-stage">
        <canvas></canvas>
        <div class="fun-over" aria-live="polite"><b class="fun-over-t"></b><span class="fun-over-d"></span></div>
      </div>
    </div>`);
  root.querySelector(".fun-name")!.textContent = name;
  body.appendChild(root);
  const stage = root.querySelector(".fun-stage") as HTMLElement;
  const canvas = root.querySelector("canvas") as HTMLCanvasElement;
  const bw = body.clientWidth || 440, bh = body.clientHeight || 366;
  const { w, h } = measure(stage, bw, Math.max(120, bh - 30));
  const ctx = fitCanvas(canvas, w, h);
  const score = root.querySelector(".fun-score") as HTMLElement;
  const over = root.querySelector(".fun-over") as HTMLElement;
  const ot = over.querySelector(".fun-over-t") as HTMLElement;
  const od = over.querySelector(".fun-over-d") as HTMLElement;
  return {
    root, stage, canvas, ctx, w, h,
    setScore(s, bump) {
      if (score.textContent === s) return;
      score.textContent = s;
      if (bump) scope.fromTo(score, { scale: 1.22 }, { scale: 1, duration: 0.4, ease: "back.out(3)" });
    },
    showOver(title, detail) {
      ot.textContent = title;
      od.textContent = detail;
      over.classList.add("fun-on");
      scope.fromTo(over, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "sine.out" });
      scope.fromTo(ot, { y: 14, scale: 0.9 }, { y: 0, scale: 1, duration: 0.6, ease: "back.out(2.2)" });
      scope.fromTo(od, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.12, ease: "expo.out" });
    },
    hideOver() {
      scope.to(over, { opacity: 0, duration: 0.25, ease: "sine.in", onComplete: () => over.classList.remove("fun-on") });
    },
  };
}

/** Win/lose bookkeeping shared by the games: losing streaks, ragequits, time budget. */
export class Session {
  readonly start = performance.now();
  readonly skill: number;
  streak = 0;
  best = 0;
  rounds = 0;
  constructor(private host: FunHost, private opts: FunOpts, private rage = { base: 0.3, step: 0.15, calm: 0.06 }) {
    this.skill = clamp(opts.skill ?? 0.6);
  }
  get elapsed() { return performance.now() - this.start; }
  get timeUp() { return this.elapsed >= this.opts.maxMs; }
  get over() { return this.host.stopped || this.timeUp; }
  /** Called after a loss. Decides whether to retry, quit calmly or ragequit. */
  afterLoss(): "retry" | "lose" | "ragequit" {
    this.streak++;
    if (this.streak >= 2) {
      const p = this.rage.base + this.rage.step * (this.streak - 2) + (0.6 - this.skill) * 0.25;
      if (Math.random() < clamp(p, 0.04, 0.9)) return "ragequit";
    }
    if (this.rounds >= 2 && Math.random() < this.rage.calm) return "lose";
    return "retry";
  }
}

/** Sleep in short slices so the caller can react to state changes while waiting. */
export async function waitUntil(host: FunHost, cond: () => boolean, maxMs: number, slice = 80) {
  const t0 = performance.now();
  while (!cond() && performance.now() - t0 < maxMs) {
    if (host.stopped) return;
    await host.sleep(slice);
  }
}
