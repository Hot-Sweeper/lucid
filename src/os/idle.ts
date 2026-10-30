import gsap from "gsap";
import { WM, Cancelled } from "./wm";
import type { SeatedRobot as Robot } from "../office/rig";
import type { DeskStage as Stage } from "../office/desk";

// What the robot does when there is no work: tidy the desktop, play a game,
// and finally lock the screen and doze off. Any new work stops it at once.

const T = {
  tidyAfter: 4000,
  gameAfter: 40000,
  gameFor: 110000,
  lockAfterGames: 2,
};

export class IdleLife {
  private token = 0;
  private active = false;
  private stopGame: (() => void) | null = null;
  private lockEl: HTMLElement | null = null;
  private clockTimer = 0;
  private nextGame: "snake" | "chess" = Math.random() < 0.5 ? "snake" : "chess";
  onActivity: (t: string) => void = () => {};

  constructor(private wm: WM, private robot: Robot, private stage: Stage) {
    const scale = Number(new URLSearchParams(location.search).get("idleScale") || localStorage.getItem("lucid:idleScale") || 1);
    if (scale > 0 && scale !== 1) for (const k of Object.keys(T) as (keyof typeof T)[]) if (k !== "lockAfterGames") T[k] *= scale;
  }

  get isActive() { return this.active; }

  begin(opts: { locked?: boolean } = {}) {
    if (this.active) return;
    this.active = true;
    const tok = ++this.token;
    this.run(tok, opts).catch((err) => { if (!(err instanceof Cancelled)) console.error("idle failed", err); });
  }

  // Stop instantly (new work or another thread). Cancels anything mid-animation.
  stop() {
    if (!this.active) return;
    this.active = false;
    this.token++;
    this.wm.epoch++;
    this.stopGame?.();
    this.stopGame = null;
    if (this.wm.isOpen("game")) this.wm.close("game");
    this.unlock();
    this.stage.sleepy(false);
    this.robot.wake();
  }

  private alive(tok: number) {
    if (tok !== this.token) throw new Cancelled();
  }

  private wait(ms: number, tok: number) {
    return new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (tok !== this.token) return reject(new Cancelled());
        if (Date.now() - start >= ms) return resolve();
        setTimeout(tick, Math.min(250, ms));
      };
      tick();
    });
  }

  private async run(tok: number, opts: { locked?: boolean }) {
    this.wm.speed = 1;
    if (opts.locked) {
      await this.tidy(tok, true);
      return this.lock(tok);
    }
    this.onActivity("Waiting for a task");
    await this.wait(T.tidyAfter, tok);
    await this.tidy(tok, false);
    this.robot.setPose("rest");
    await this.wait(T.gameAfter, tok);
    for (let i = 0; i < T.lockAfterGames; i++) {
      const g = this.nextGame;
      this.nextGame = g === "snake" ? "chess" : "snake";
      this.onActivity(g === "snake" ? "Playing Snake while it waits" : "Playing chess while it waits");
      if (g === "snake") await this.playSnake(tok, T.gameFor);
      else await this.playChess(tok);
      this.alive(tok);
      if (this.wm.isOpen("game")) {
        await this.wm.pointAt(this.wm.wins.get("game")!.el.querySelector(".win-x")!, 0.5, 0.5, 400);
        await this.wm.click();
        this.wm.close("game");
      }
      this.robot.setPose("rest");
      this.onActivity("Waiting for a task");
      await this.wait(12000, tok);
    }
    await this.lock(tok);
  }

  // Close windows one by one, like clearing a desk at the end of the day.
  private async tidy(tok: number, quick: boolean) {
    const wins = [...this.wm.wins.values()].sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
    for (const w of wins) {
      this.alive(tok);
      if (!quick) {
        await this.wm.pointAt(w.el.querySelector(".win-x")!, 0.5, 0.5, 420);
        await this.wm.click();
      }
      this.wm.close(w.id);
      await this.wait(quick ? 60 : 380, tok);
    }
    this.stage.say(null);
  }

  // --- lock screen ---------------------------------------------------------------
  private async lock(tok: number) {
    this.alive(tok);
    this.onActivity("Resting");
    const el = document.createElement("div");
    el.className = "lock";
    el.innerHTML = `<div class="lock-time"></div><div class="lock-date"></div><p class="lock-hint">Waiting for a new task</p>`;
    this.wm.root.appendChild(el);
    this.lockEl = el;
    const paint = () => {
      const now = new Date();
      el.querySelector(".lock-time")!.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      el.querySelector(".lock-date")!.textContent = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    };
    paint();
    this.clockTimer = window.setInterval(paint, 1000);
    gsap.timeline()
      .fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "sine.out" })
      .fromTo(el.querySelector(".lock-time"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "expo.out" }, 0.2)
      .fromTo(el.querySelectorAll(".lock-date, .lock-hint"), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "expo.out", stagger: 0.1 }, 0.35);
    gsap.to(this.wm.cursorEl, { opacity: 0, duration: 0.6 });
    await this.wait(1200, tok);
    this.robot.setPose("sleep");
    this.stage.sleepy(true);
  }

  private unlock() {
    window.clearInterval(this.clockTimer);
    gsap.to(this.wm.cursorEl, { opacity: 1, duration: 0.3 });
    const el = this.lockEl;
    this.lockEl = null;
    if (!el) return;
    gsap.to(el, { yPercent: -100, opacity: 0.4, duration: 0.55, ease: "power3.in", onComplete: () => el.remove() });
  }

  // --- snake ---------------------------------------------------------------------
  private async playSnake(tok: number, duration: number) {
    const w = await this.wm.open("game", "Snake");
    this.alive(tok);
    w.body.innerHTML = `<div class="game snake"><div class="game-head"><span>Snake</span><span class="score">Score 0</span></div><canvas></canvas></div>`;
    const canvas = w.body.querySelector("canvas") as HTMLCanvasElement;
    const scoreEl = w.body.querySelector(".score") as HTMLElement;
    const COLS = 24, ROWS = 14;
    const rect = canvas.getBoundingClientRect();
    const k = rect.width / canvas.clientWidth || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const dpr = 2;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    void k;
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    const cell = Math.min(cw / COLS, ch / ROWS);
    const ox = (cw - cell * COLS) / 2, oy = (ch - cell * ROWS) / 2;
    type P = { x: number; y: number };
    let snake: P[] = [], prev: P[] = [], dir: P = { x: 1, y: 0 }, food: P = { x: 0, y: 0 }, score = 0, best = 0;
    let dead = false, deadAt = 0, eatAt = 0;
    const key = (p: P) => p.y * COLS + p.x;
    const reset = () => {
      snake = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
      prev = snake.map((p) => ({ ...p }));
      dir = { x: 1, y: 0 }; score = 0; dead = false;
      placeFood();
    };
    const placeFood = () => {
      const taken = new Set(snake.map(key));
      const free: P[] = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken.has(y * COLS + x)) free.push({ x, y });
      food = free[Math.floor(Math.random() * free.length)];
    };
    const inside = (p: P) => p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS;
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    // Shortest path to the food, avoiding the body (the tail moves away, so it is free).
    const bfs = (from: P, to: P, blocked: Set<number>) => {
      const seen = new Map<number, number>([[key(from), -1]]);
      const q = [from];
      while (q.length) {
        const c = q.shift()!;
        if (c.x === to.x && c.y === to.y) {
          let cur = key(c), prevK = seen.get(cur)!;
          while (prevK !== key(from) && prevK !== -1) { cur = prevK; prevK = seen.get(cur)!; }
          return { x: cur % COLS - from.x, y: Math.floor(cur / COLS) - from.y };
        }
        for (const d of dirs) {
          const n = { x: c.x + d.x, y: c.y + d.y };
          if (!inside(n) || blocked.has(key(n)) || seen.has(key(n))) continue;
          seen.set(key(n), key(c));
          q.push(n);
        }
      }
      return null;
    };
    const room = (from: P, blocked: Set<number>) => {
      const seen = new Set([key(from)]);
      const q = [from];
      while (q.length && seen.size < 400) {
        const c = q.shift()!;
        for (const d of dirs) {
          const n = { x: c.x + d.x, y: c.y + d.y };
          if (inside(n) && !blocked.has(key(n)) && !seen.has(key(n))) { seen.add(key(n)); q.push(n); }
        }
      }
      return seen.size;
    };
    const step = () => {
      prev = snake.map((p) => ({ ...p }));
      const head = snake[0];
      const body = new Set(snake.slice(0, -1).map(key));
      let next = bfs(head, food, body);
      // Only take the path if the snake keeps enough space afterwards.
      if (next) {
        const n = { x: head.x + next.x, y: head.y + next.y };
        if (room(n, body) < snake.length + 2) next = null;
      }
      if (!next) {
        let bestRoom = -1;
        for (const d of dirs) {
          const n = { x: head.x + d.x, y: head.y + d.y };
          if (!inside(n) || body.has(key(n))) continue;
          const r = room(n, body);
          if (r > bestRoom) { bestRoom = r; next = d; }
        }
      }
      if (!next) { dead = true; deadAt = performance.now(); return; }
      if (next.x !== dir.x || next.y !== dir.y) this.robot.tap();
      dir = next;
      const n = { x: head.x + dir.x, y: head.y + dir.y };
      snake.unshift(n);
      if (n.x === food.x && n.y === food.y) {
        score++; best = Math.max(best, score); eatAt = performance.now();
        scoreEl.textContent = `Score ${score}`;
        gsap.fromTo(scoreEl, { scale: 1.25 }, { scale: 1, duration: 0.35, ease: "back.out(3)" });
        placeFood();
        prev.unshift({ ...prev[0] });
      } else snake.pop();
    };
    reset();
    const TICK = 120;
    let last = performance.now();
    const draw = () => {
      const now = performance.now();
      if (!dead && now - last >= TICK) { last = now; step(); }
      if (dead && now - deadAt > 1400) { reset(); scoreEl.textContent = "Score 0"; last = now; }
      const f = dead ? 1 : Math.min(1, (now - last) / TICK);
      g.clearRect(0, 0, cw, ch);
      g.fillStyle = "#12163d";
      g.beginPath(); g.roundRect(ox, oy, cell * COLS, cell * ROWS, 8); g.fill();
      g.fillStyle = "rgba(255,255,255,0.05)";
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { g.beginPath(); g.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, 1, 0, 7); g.fill(); }
      // food
      const pulse = 1 + Math.sin(now / 220) * 0.08 + Math.max(0, 1 - (now - eatAt) / 300) * 0.3;
      const fx = ox + (food.x + 0.5) * cell, fy = oy + (food.y + 0.5) * cell;
      g.fillStyle = "rgba(255,143,90,0.18)"; g.beginPath(); g.arc(fx, fy, cell * 0.7 * pulse, 0, 7); g.fill();
      g.fillStyle = "#ff8f5a"; g.beginPath(); g.arc(fx, fy, cell * 0.34 * pulse, 0, 7); g.fill();
      g.fillStyle = "#ffd0b0"; g.beginPath(); g.arc(fx - cell * 0.1, fy - cell * 0.1, cell * 0.09, 0, 7); g.fill();
      // snake, smoothly between ticks
      const pts = snake.map((p, i) => {
        const a = prev[i] || prev[prev.length - 1];
        return { x: ox + (a.x + (p.x - a.x) * f + 0.5) * cell, y: oy + (a.y + (p.y - a.y) * f + 0.5) * cell };
      });
      const grad = g.createLinearGradient(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
      grad.addColorStop(0, dead ? "#7d6a8f" : "#2fb59f");
      grad.addColorStop(1, dead ? "#a58ab8" : "#7ff5cf");
      g.strokeStyle = grad; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = cell * 0.7;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      const h = pts[0];
      g.fillStyle = "#0e1233";
      const ex = dir.y !== 0 ? cell * 0.16 : 0, ey = dir.x !== 0 ? cell * 0.16 : 0;
      for (const s of [-1, 1]) { g.beginPath(); g.arc(h.x + dir.x * cell * 0.12 + ex * s, h.y + dir.y * cell * 0.12 + ey * s, cell * 0.08, 0, 7); g.fill(); }
      if (running) raf = requestAnimationFrame(draw);
    };
    let running = true;
    let raf = requestAnimationFrame(draw);
    this.stopGame = () => { running = false; cancelAnimationFrame(raf); };
    this.robot.setPose("type");
    this.robot.setTyping(false);
    try {
      await this.wait(duration, tok);
    } finally {
      running = false;
      cancelAnimationFrame(raf);
    }
  }

  // --- chess -----------------------------------------------------------------------
  // Morphy vs. Duke Karl and Count Isouard, Paris 1858, the "Opera Game". The robot plays white.
  private static OPERA = "e2e4 e7e5 g1f3 d7d6 d2d4 c8g4 d4e5 g4f3 d1f3 d6e5 f1c4 g8f6 f3b3 d8e7 b1c3 c7c6 c1g5 b7b5 c3b5 c6b5 c4b5 b8d7 e1c1 a8d8 d1d7 d8d7 h1d1 e7e6 b5d7 f6d7 b3b8 d7b8 d1d8".split(" ");

  private async playChess(tok: number) {
    const w = await this.wm.open("game", "Chess");
    this.alive(tok);
    const glyph: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
    w.body.innerHTML = `<div class="game chess"><div class="game-head"><span>Chess</span><span class="score">Robot plays white</span></div><div class="board-wrap"><div class="board"></div></div></div>`;
    const board = w.body.querySelector(".board") as HTMLElement;
    const status = w.body.querySelector(".score") as HTMLElement;
    let sq = "";
    for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) sq += `<i class="${(r + f) % 2 ? "l" : "d"}" data-sq="${"abcdefgh"[f]}${r + 1}"></i>`;
    board.innerHTML = sq;
    const size = board.clientWidth / 8;
    const at = (s: string) => ({ x: ("abcdefgh".indexOf(s[0])) * size, y: (8 - Number(s[1])) * size });
    const pieces = new Map<string, HTMLElement>();
    const place = (s: string, type: string, white: boolean) => {
      const p = document.createElement("span");
      p.className = `pc ${white ? "w" : "b"}`;
      p.textContent = glyph[type] + "︎";
      p.style.width = p.style.height = `${size}px`;
      p.style.fontSize = `${size * 0.78}px`;
      board.appendChild(p);
      gsap.set(p, at(s));
      pieces.set(s, p);
    };
    const back = "rnbqkbnr";
    for (let f = 0; f < 8; f++) {
      const file = "abcdefgh"[f];
      place(`${file}1`, back[f], true); place(`${file}2`, "p", true);
      place(`${file}7`, "p", false); place(`${file}8`, back[f], false);
    }
    gsap.from(board.querySelectorAll(".pc"), { opacity: 0, y: "-=10", duration: 0.35, stagger: 0.012, ease: "power2.out" });
    this.robot.setPose("mouse");
    const mark = (a: string, b: string) => {
      board.querySelectorAll("i.last").forEach((e) => e.classList.remove("last"));
      board.querySelector(`[data-sq="${a}"]`)!.classList.add("last");
      board.querySelector(`[data-sq="${b}"]`)!.classList.add("last");
    };
    const move = async (from: string, to: string, robot: boolean) => {
      const p = pieces.get(from);
      if (!p) return;
      const victim = pieces.get(to);
      if (robot) {
        await this.wm.pointAt(board.querySelector(`[data-sq="${from}"]`)!, 0.5, 0.5, 420);
        this.robot.click();
        p.classList.add("lift");
        const target = board.querySelector(`[data-sq="${to}"]`)!;
        const t = this.wm.pos(target);
        const moving = this.wm.moveTo(t.x, t.y, 520);
        gsap.to(p, { ...at(to), duration: 0.5, ease: "power2.inOut" });
        await moving;
        p.classList.remove("lift");
        this.robot.click();
      } else {
        await gsap.to(p, { ...at(to), duration: 0.55, ease: "power3.inOut" });
      }
      if (victim) {
        pieces.delete(to);
        gsap.to(victim, { scale: 0.2, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => victim.remove() });
      }
      pieces.delete(from);
      pieces.set(to, p);
      gsap.fromTo(p, { scale: 1.12 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
      mark(from, to);
    };
    const moves = IdleLife.OPERA;
    for (let i = 0; i < moves.length; i++) {
      this.alive(tok);
      const m = moves[i], from = m.slice(0, 2), to = m.slice(2, 4);
      const white = i % 2 === 0;
      if (!white) { status.textContent = "Opponent is thinking"; await this.wait(700 + Math.random() * 900, tok); }
      else { status.textContent = "Robot's move"; this.robot.setPose("read"); await this.wait(600 + Math.random() * 1400, tok); this.robot.setPose("mouse"); }
      await move(from, to, white);
      if (m === "e1c1") await move("a1", "d1", false); // castling: the rook follows
    }
    status.textContent = "Checkmate. The robot wins";
    gsap.fromTo(status, { scale: 1.2 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
    this.robot.setPose("celebrate");
    await this.wait(5000, tok);
  }
}
