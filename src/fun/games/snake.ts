import type { FunHost, FunOpts, Outcome } from "../host";
import { Scope } from "../util";
import { C, circle, fillRR, glow, limb, mix, withAlpha, ellipse } from "../draw";
import { mountGame, Session, waitUntil } from "./common";

type P = { x: number; y: number };
const DIRS: P[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const KEY = (d: P) => (d.x === 1 ? "ArrowRight" : d.x === -1 ? "ArrowLeft" : d.y === 1 ? "ArrowDown" : "ArrowUp");
const WIN_SCORE = 45;

export async function playSnake(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope();
  try {
    const view = mountGame(body, scope, "Snake", "snake");
    const { ctx, w, h } = view;
    const S = new Session(host, opts, { base: 0.35, step: 0.18, calm: 0.05 });
    const skill = S.skill;

    const cell = Math.max(12, Math.floor(Math.min((w - 16) / 22, (h - 16) / 16)));
    const COLS = Math.floor((w - 16) / cell), ROWS = Math.floor((h - 16) / cell);
    const ox = Math.round((w - COLS * cell) / 2), oy = Math.round((h - ROWS * cell) / 2);
    const k = (p: P) => p.y * COLS + p.x;
    const inside = (p: P) => p.x >= 0 && p.y >= 0 && p.x < COLS && p.y < ROWS;

    let snake: P[] = [], old: P[] = [], grew = false, dir: P = { x: 1, y: 0 };
    let food: P = { x: 0, y: 0 }, foodAt = 0, score = 0;
    let dead = false, deadAt = 0, won = false, greedy = 0, cheered = false;
    let lastTick = performance.now();
    let tick = 112;
    const crumbs: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];

    const placeFood = () => {
      const taken = new Set(snake.map(k));
      const free: P[] = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken.has(y * COLS + x)) free.push({ x, y });
      food = free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
      foodAt = performance.now();
    };
    const reset = () => {
      const y = Math.floor(ROWS / 2), x = Math.floor(COLS / 4);
      snake = [{ x, y }, { x: x - 1, y }, { x: x - 2, y }];
      old = snake.map((p) => ({ ...p }));
      grew = false; dir = { x: 1, y: 0 }; score = 0; dead = false; won = false; greedy = 0; cheered = false;
      tick = 112;
      placeFood();
      view.setScore("Score 0");
      lastTick = performance.now();
    };

    const bfs = (from: P, to: P, blocked: Set<number>): P | null => {
      const seen = new Map<number, number>([[k(from), -1]]);
      const q: P[] = [from];
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi];
        if (c.x === to.x && c.y === to.y) {
          let cur = k(c), pk = seen.get(cur)!;
          while (pk !== k(from) && pk !== -1) { cur = pk; pk = seen.get(cur)!; }
          return { x: (cur % COLS) - from.x, y: Math.floor(cur / COLS) - from.y };
        }
        for (const d of DIRS) {
          const n = { x: c.x + d.x, y: c.y + d.y };
          if (!inside(n) || blocked.has(k(n)) || seen.has(k(n))) continue;
          seen.set(k(n), k(c));
          q.push(n);
        }
      }
      return null;
    };
    const room = (from: P, blocked: Set<number>, cap: number) => {
      const seen = new Set([k(from)]);
      const q = [from];
      for (let qi = 0; qi < q.length && seen.size < cap; qi++) {
        const c = q[qi];
        for (const d of DIRS) {
          const n = { x: c.x + d.x, y: c.y + d.y };
          if (inside(n) && !blocked.has(k(n)) && !seen.has(k(n))) { seen.add(k(n)); q.push(n); }
        }
      }
      return seen.size;
    };

    // One move. Mostly a careful BFS player; skill decides how often it slips.
    const think = (): P | null => {
      const head = snake[0];
      const body = new Set(snake.slice(0, -1).map(k));
      const ok = (d: P) => { const n = { x: head.x + d.x, y: head.y + d.y }; return inside(n) && !body.has(k(n)); };
      let next = bfs(head, food, body);
      if (next && greedy <= 0) {
        const n = { x: head.x + next.x, y: head.y + next.y };
        if (room(n, body, snake.length * 3) < snake.length + 2) next = null;
      }
      if (!next) {
        let best = -1;
        for (const d of DIRS) {
          if (!ok(d)) continue;
          const r = room({ x: head.x + d.x, y: head.y + d.y }, body, 600);
          if (r > best) { best = r; next = d; }
        }
      }
      if (greedy > 0) greedy--;
      const lapse = (0.006 + 0.03 * (1 - skill)) * (1 + score / 12);
      if (Math.random() < lapse) greedy = 5 + Math.floor(Math.random() * 6);
      // Late reaction: it meant to turn, but straight ahead is a wall or its own tail.
      if (next && (next.x !== dir.x || next.y !== dir.y) && !ok(dir)) {
        const pLate = 0.08 + 0.32 * (1 - skill) + score * 0.005;
        if (Math.random() < pLate) return dir;
      }
      return next;
    };

    const die = () => {
      dead = true;
      deadAt = performance.now();
      old = snake.map((p) => ({ ...p }));
      const hd = snake[0];
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90;
        crumbs.push({ x: ox + (hd.x + 0.5 + dir.x * 0.4) * cell, y: oy + (hd.y + 0.5 + dir.y * 0.4) * cell, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: i % 3 ? C.mint : C.cream });
      }
    };
    const step = () => {
      const next = think();
      old = snake.map((p) => ({ ...p }));
      grew = false;
      if (!next) { die(); return; }
      if (next.x !== dir.x || next.y !== dir.y) host.tap(KEY(next));
      dir = next;
      const head = snake[0];
      const n = { x: head.x + dir.x, y: head.y + dir.y };
      const body = new Set(snake.slice(0, -1).map(k));
      if (!inside(n) || body.has(k(n))) { die(); return; }
      snake.unshift(n);
      if (n.x === food.x && n.y === food.y) {
        score++;
        grew = true;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          crumbs.push({ x: ox + (n.x + 0.5) * cell, y: oy + (n.y + 0.5) * cell, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 1, c: i % 2 ? C.orange : C.cream });
        }
        view.setScore(`Score ${score}`, true);
        tick = Math.max(78, 112 - score * 0.8);
        if (!cheered && score > Math.max(12, S.best)) { cheered = true; host.react("cheer"); }
        if (score >= WIN_SCORE || snake.length >= COLS * ROWS - 1) { won = true; return; }
        placeFood();
      } else snake.pop();
    };

    const draw = (tNow: number, dt: number) => {
      const ms = tNow * 1000;
      if (!dead && !won && ms - lastTick >= tick) {
        lastTick = ms;
        step();
      }
      const f = dead || won ? 1 : Math.min(1, (ms - lastTick) / tick);
      const shake = dead ? Math.max(0, 1 - (ms - deadAt) / 350) * 4 : 0;
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.translate(Math.sin(ms / 18) * shake, Math.cos(ms / 23) * shake);
      // board
      fillRR(ctx, ox, oy, COLS * cell, ROWS * cell, 10, "#1b2246");
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2) fillRR(ctx, ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2, 3, "rgba(255,255,255,0.025)");
      }
      // food: a glowing data orb with a leaf
      const born = Math.min(1, (ms - foodAt) / 380);
      const pop = born < 1 ? 1 + Math.sin(born * Math.PI) * 0.35 : 1;
      const pulse = (1 + Math.sin(ms / 240) * 0.07) * pop * Math.min(1, born * 2);
      const fx = ox + (food.x + 0.5) * cell, fy = oy + (food.y + 0.5) * cell;
      if (!won) {
        glow(ctx, fx, fy, cell * 1.1 * pulse, C.orange, 0.35);
        circle(ctx, fx, fy + cell * 0.04, cell * 0.36 * pulse, C.orange2);
        circle(ctx, fx - cell * 0.03, fy - cell * 0.02, cell * 0.3 * pulse, C.orange);
        circle(ctx, fx - cell * 0.12, fy - cell * 0.12, cell * 0.09 * pulse, "#ffd8bd");
        ellipse(ctx, fx + cell * 0.12, fy - cell * 0.36 * pulse, cell * 0.14, cell * 0.07, -0.6, C.mint);
      }
      // body path: interpolated head, the real cells (so corners stay on the grid), interpolated tail
      const cx = (p: P) => ox + (p.x + 0.5) * cell, cy = (p: P) => oy + (p.y + 0.5) * cell;
      const pts: [number, number][] = [];
      if (dead || won) for (const p of snake) pts.push([cx(p), cy(p)]);
      else {
        const nh = snake[0], oh = old[0];
        pts.push([cx(oh) + (cx(nh) - cx(oh)) * f, cy(oh) + (cy(nh) - cy(oh)) * f]);
        const lastOld = grew ? old.length : old.length - 1;
        for (let i = 0; i < lastOld; i++) pts.push([cx(old[i]), cy(old[i])]);
        if (!grew && old.length > 1) {
          const a = old[old.length - 1], b = old[old.length - 2];
          pts.push([cx(a) + (cx(b) - cx(a)) * f, cy(a) + (cy(b) - cy(a)) * f]);
        }
      }
      const fade = dead ? Math.min(1, (ms - deadAt) / 500) : 0;
      const c1 = mix("#1fa58a", "#6d5f93", fade), c2 = mix(C.mint, "#a58ab8", fade);
      const tail = pts[pts.length - 1], head = pts[0];
      limb(ctx, pts.map(([x, y]) => [x, y + 3] as [number, number]), cell * 0.74, "rgba(6,8,30,0.35)");
      const grad = ctx.createLinearGradient(tail[0], tail[1], head[0], head[1]);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      limb(ctx, pts, cell * 0.74, grad);
      limb(ctx, pts.map(([x, y]) => [x - cell * 0.06, y - cell * 0.12] as [number, number]), cell * 0.18, withAlpha("#ffffff", 0.14 * (1 - fade)));
      // head and eyes, looking toward the food
      const [hx, hy] = head;
      circle(ctx, hx, hy, cell * 0.43, c2);
      const lx = Math.sign(fx - hx) * cell * 0.04, ly = Math.sign(fy - hy) * cell * 0.04;
      const px = dir.y !== 0 ? cell * 0.18 : 0, py = dir.x !== 0 ? cell * 0.18 : 0;
      const blink = Math.sin(ms / 1900) > 0.985;
      for (const s of [-1, 1]) {
        const ex = hx + dir.x * cell * 0.12 + px * s, ey = hy + dir.y * cell * 0.12 + py * s;
        if (dead) {
          limb(ctx, [[ex - 2.6, ey - 2.6], [ex + 2.6, ey + 2.6]], 1.6, "#1b1640");
          limb(ctx, [[ex - 2.6, ey + 2.6], [ex + 2.6, ey - 2.6]], 1.6, "#1b1640");
        } else if (blink) limb(ctx, [[ex - 2.6, ey], [ex + 2.6, ey]], 1.6, "#0e1233");
        else {
          circle(ctx, ex, ey, cell * 0.15, "#f6f7ff");
          circle(ctx, ex + lx + dir.x * 1.2, ey + ly + dir.y * 1.2, cell * 0.075, "#0e1233");
        }
      }
      for (let i = crumbs.length - 1; i >= 0; i--) {
        const c = crumbs[i];
        c.life -= dt * 2.2;
        if (c.life <= 0) { crumbs.splice(i, 1); continue; }
        c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.92; c.vy *= 0.92;
        circle(ctx, c.x, c.y, 2.4 * c.life, withAlpha(c.c, c.life));
      }
      ctx.restore();
    };

    reset();
    scope.raf(draw);
    host.react("focus");

    for (;;) {
      await waitUntil(host, () => dead || won || S.over, 1e9);
      if (host.stopped) return { result: "done", score: S.best };
      if (won) {
        S.best = Math.max(S.best, score);
        host.react("cheer");
        view.showOver("Perfect run", `Score ${score}`);
        await host.sleep(2200);
        return { result: "win", score };
      }
      if (S.timeUp) return { result: "done", score: Math.max(S.best, score) };
      S.rounds++;
      const newBest = score > S.best;
      S.best = Math.max(S.best, score);
      await host.sleep(420);
      view.showOver("Game over", newBest && S.rounds > 1 ? `Score ${score}   New best` : `Score ${score}   Best ${S.best}`);
      host.react(score < 6 ? "angry" : "surprised");
      await host.sleep(1500);
      const next = S.afterLoss();
      if (next === "ragequit") { host.react("angry"); return { result: "ragequit", score: S.best }; }
      if (next === "lose") { host.react("relax"); await host.sleep(500); return { result: "lose", score: S.best }; }
      if (S.timeUp) return { result: "done", score: S.best };
      view.hideOver();
      await host.sleep(380);
      if (score > 0 && newBest) S.streak = 0;
      reset();
      host.react("focus");
    }
  } finally {
    scope.dispose();
  }
}
