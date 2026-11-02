import type { FunHost, FunOpts, Outcome } from "../host";
import { Scope, gauss, hash } from "../util";
import { C, circle, ellipse, fillRR, glow, lin, limb, rr, shade, withAlpha } from "../draw";
import { mountGame, Session, waitUntil } from "./common";

const WIN_SCORE = 40;

type Rack = { x: number; gapY: number; scored: boolean; aim: number; seed: number };

export async function playFlappy(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  try {
    const view = mountGame(body, scope, "Flappy Drone", "flappy");
    const { ctx, w, h } = view;
    scope.liveCanvas(view.canvas);
    const S = new Session(host, opts, { base: 0.32, step: 0.16, calm: 0.05 });
    const skill = S.skill;
    const k = h / 336;
    const G = 1500 * k, FLAP = -400 * k, SPEED = 128 * k;
    const groundH = 30 * k;
    const floorY = h - groundH;
    const GAP = 116 * k, RW = 50 * k, SPACING = 200 * k;
    const R = 11 * k; // drone hit radius
    const X = w * 0.3;

    let y = h * 0.42, vy = 0, rot = 0;
    let racks: Rack[] = [];
    let score = 0, dead = false, deadAt = 0, won = false, started = false, cheered = false;
    let worldX = 0, cooldown = 0, lapse = 0, flapAt = -1;
    let simT = 0;
    const puffs: { x: number; y: number; r: number; life: number }[] = [];
    const sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];

    const newRack = (x: number): Rack => {
      const margin = 50 * k;
      const gapY = margin + GAP / 2 + Math.random() * (floorY - margin * 2 - GAP);
      const sd = GAP * (0.02 + 0.1 * (1 - skill));
      return { x, gapY, scored: false, aim: gauss(Math.random) * sd, seed: Math.random() * 100 };
    };
    const reset = () => {
      y = h * 0.42; vy = 0; rot = 0; score = 0; dead = false; won = false; started = false; cheered = false;
      racks = [];
      for (let i = 0; i < 4; i++) racks.push(newRack(w + 60 * k + i * SPACING));
      view.setScore("Score 0");
      simT = 0;
    };

    const flap = () => {
      vy = FLAP;
      flapAt = simT;
      host.tap(" ");
      puffs.push({ x: X - 4 * k, y: y + 12 * k, r: 4 * k, life: 1 });
    };
    const crash = () => {
      dead = true;
      deadAt = performance.now();
      vy = Math.min(vy, -160 * k);
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 140) * k;
        sparks.push({ x: X, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 });
      }
    };

    const physics = (dt: number) => {
      simT += dt;
      if (!started) {
        // hover at the start, bobbing, before the first flap
        y = h * 0.42 + Math.sin(simT * 4) * 4 * k;
        if (simT > 0.9) { started = true; flap(); }
        return;
      }
      if (dead) {
        vy += G * dt;
        y = Math.min(floorY - R, y + vy * dt);
        rot += dt * 9;
        return;
      }
      vy += G * dt;
      y += vy * dt;
      rot = Math.max(-0.45, Math.min(0.9, vy / (700 * k)));
      worldX += SPEED * dt;
      for (const r of racks) r.x -= SPEED * dt;
      if (racks[0].x < -RW - 10) { racks.shift(); racks.push(newRack(racks[racks.length - 1].x + SPACING)); }
      // AI: hover low in the gap (one flap rises about half a gap), aim off by a per-rack error, sometimes zone out
      cooldown -= dt;
      lapse -= dt;
      const next = racks.find((r) => r.x + RW > X - R) ?? racks[0];
      const target = next.gapY + GAP * 0.2 + next.aim;
      if (cooldown <= 0 && lapse <= 0 && y > target && vy > -30 * k) {
        flap();
        cooldown = 0.12 + Math.random() * 0.08;
      }
      if (lapse <= -0.5 && Math.random() < dt * (0.01 + 0.12 * (1 - skill))) lapse = 0.25 + Math.random() * 0.25;
      // collisions
      if (y + R > floorY || y - R < 0) return crash();
      for (const r of racks) {
        if (X + R > r.x + 3 * k && X - R < r.x + RW - 3 * k) {
          if (y - R < r.gapY - GAP / 2 || y + R > r.gapY + GAP / 2) return crash();
        }
        if (!r.scored && r.x + RW < X - R) {
          r.scored = true;
          score++;
          view.setScore(`Score ${score}`, true);
          if (!cheered && score > Math.max(10, S.best)) { cheered = true; host.react("cheer"); }
          if (score >= WIN_SCORE) won = true;
        }
      }
    };

    const drawBg = (t: number) => {
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#141a33"], [0.6, "#252d5c"], [1, "#3a3f99"]]);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const span = w * 1.5;
        const sx = (((hash(i) * span - worldX * 0.03) % span) + span) % span - w * 0.25;
        const sy = hash(i + 50) * floorY * 0.6;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.8 + hash(i + 9)) + i));
        circle(ctx, sx, sy, (0.6 + hash(i + 7) * 0.9) * k, withAlpha(C.cream, 0.5 * tw));
      }
      glow(ctx, w * 0.78, floorY * 0.3, 70 * k, C.lilac, 0.18);
      // far skyline of data center towers, then nearer hills
      const layer = (speed: number, base: number, color: string, seed: number, wMin: number, hMax: number, lights: boolean) => {
        const span = 64 * k;
        const off = (worldX * speed) % span;
        const first = Math.floor((worldX * speed) / span);
        for (let i = -1; i < w / span + 2; i++) {
          const n = first + i;
          const bw = (wMin + hash(n * 3.1 + seed) * 20) * k;
          const bh = (20 + hash(n * 7.7 + seed) * hMax) * k;
          const bx = i * span - off;
          fillRR(ctx, bx, base - bh, bw, bh + 20, 5 * k, color);
          if (lights) for (let j = 0; j < 4; j++) {
            if (hash(n * 13 + j) > 0.55) {
              const on = Math.sin(t * 1.3 + n + j) > -0.2;
              fillRR(ctx, bx + bw * 0.25, base - bh + 8 * k + j * 10 * k, bw * 0.5, 3 * k, 1.5 * k, withAlpha(j % 2 ? C.sky : C.mint, on ? 0.45 : 0.12));
            }
          }
        }
      };
      layer(0.15, floorY - 30 * k, "#232a5e", 1, 30, 90, true);
      layer(0.4, floorY + 2, "#1b2246", 5, 40, 40, false);
    };

    const drawRack = (r: Rack, t: number) => {
      const top = r.gapY - GAP / 2, bot = r.gapY + GAP / 2;
      const body = "#2e3577";
      const col = (y0: number, y1: number, capAtBottom: boolean) => {
        fillRR(ctx, r.x, y0, RW, y1 - y0, 7 * k, lin(ctx, r.x, 0, r.x + RW, 0, [[0, shade(body, 0.12)], [0.6, body], [1, shade(body, -0.25)]]));
        const capY = capAtBottom ? y1 - 16 * k : y0;
        fillRR(ctx, r.x - 4 * k, capY, RW + 8 * k, 16 * k, 6 * k, lin(ctx, r.x, 0, r.x + RW, 0, [[0, "#4a54a8"], [1, "#2b3270"]]));
        const uh = 13 * k;
        const startY = capAtBottom ? y1 - 22 * k : y0 + 22 * k;
        for (let i = 0; i < 30; i++) {
          const uy = capAtBottom ? startY - (i + 1) * uh : startY + i * uh;
          if (uy < y0 - uh || uy > y1) break;
          fillRR(ctx, r.x + 6 * k, uy + 2 * k, RW - 12 * k, uh - 4 * k, 3 * k, "#1d2252");
          for (let j = 0; j < 2; j++) {
            const on = Math.sin(t * (3 + ((i + j) % 3)) + r.seed + i * 2.1 + j) > 0;
            circle(ctx, r.x + (12 + j * 6) * k, uy + uh / 2, 1.5 * k, on ? (j ? C.sky : C.mint) : withAlpha(C.mint, 0.15));
          }
          fillRR(ctx, r.x + 26 * k, uy + uh / 2 - 1 * k, RW - 36 * k, 2 * k, 1 * k, "rgba(255,255,255,0.07)");
        }
      };
      col(-20, top, true);
      col(bot, floorY + 10, false);
    };

    const drawDrone = (t: number) => {
      ctx.save();
      ctx.translate(X, y);
      ctx.rotate(rot);
      const s = k;
      const flapAge = simT - flapAt;
      const spin = t * 60;
      for (const side of [-1, 1]) {
        limb(ctx, [[side * 6 * s, -4 * s], [side * 14 * s, -9 * s]], 3 * s, "#3d4aa0");
        const blur = 0.75 + 0.25 * Math.abs(Math.sin(spin + side));
        ellipse(ctx, side * 14 * s, -11 * s, 9 * s * blur * (flapAge < 0.15 ? 1.15 : 1), 1.6 * s, 0, withAlpha(C.cream, 0.55));
        circle(ctx, side * 14 * s, -10 * s, 2 * s, "#5a66c0");
      }
      fillRR(ctx, -12 * s, -8 * s, 24 * s, 17 * s, 8 * s, lin(ctx, 0, -8 * s, 0, 9 * s, [[0, "#8fd3ff"], [1, C.sky]]));
      fillRR(ctx, -12 * s, 3 * s, 24 * s, 6 * s, 3 * s, withAlpha("#1c5f9e", 0.35));
      circle(ctx, 3 * s, 0, 5.6 * s, "#141a33");
      circle(ctx, dead ? 3 * s : 4.4 * s, dead ? 0 : -0.6 * s, 2.6 * s, dead ? withAlpha(C.pink, 0.9) : C.mint);
      circle(ctx, 2 * s, -2 * s, 1 * s, "rgba(255,255,255,0.6)");
      const blink = Math.sin(t * 8) > 0.3;
      circle(ctx, -10 * s, 0, 1.7 * s, blink ? C.orange : withAlpha(C.orange, 0.3));
      ctx.restore();
    };

    let acc = 0;
    const frame = (t: number, dt: number) => {
      acc += dt;
      const STEP = 1 / 120;
      while (acc >= STEP) { if (!won) physics(STEP); acc -= STEP; }
      drawBg(t);
      for (const r of racks) drawRack(r, t);
      fillRR(ctx, -10, floorY, w + 20, groundH + 10, 0, "#1b2246");
      rr(ctx, -10, floorY, w + 20, 5 * k, 0);
      ctx.fillStyle = withAlpha(C.mint, 0.35);
      ctx.fill();
      const stripe = 26 * k, off = worldX % stripe;
      for (let x = -off; x < w + stripe; x += stripe) fillRR(ctx, x, floorY + 12 * k, stripe * 0.5, 4 * k, 2 * k, "rgba(255,255,255,0.06)");
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life -= dt * 2.6; p.y += 30 * k * dt; p.x -= SPEED * dt * 0.6; p.r += 22 * k * dt;
        if (p.life <= 0) { puffs.splice(i, 1); continue; }
        circle(ctx, p.x, p.y, p.r, withAlpha(C.cream, 0.25 * p.life));
      }
      drawDrone(t);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= dt * 1.6; p.vy += 300 * k * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        circle(ctx, p.x, p.y, 2.2 * k * p.life, withAlpha(p.life > 0.5 ? C.orange : C.pink, p.life));
      }
      if (dead) {
        const a = Math.max(0, 1 - (performance.now() - deadAt) / 180);
        if (a > 0) { ctx.fillStyle = `rgba(255,240,230,${a * 0.35})`; ctx.fillRect(0, 0, w, h); }
      }
    };

    reset();
    scope.raf(frame);
    host.react("focus");

    for (;;) {
      await waitUntil(host, () => dead || won || S.over, 1e9);
      if (host.stopped) return { result: "done", score: S.best };
      if (won) {
        S.best = Math.max(S.best, score);
        host.react("cheer");
        view.showOver("Flawless", `Score ${score}`);
        await host.sleep(2200);
        return { result: "win", score };
      }
      if (S.timeUp && !dead) return { result: "done", score: Math.max(S.best, score) };
      S.rounds++;
      const newBest = score > S.best;
      S.best = Math.max(S.best, score);
      await host.sleep(650);
      view.showOver("Crashed", newBest && S.rounds > 1 ? `Score ${score}   New best` : `Score ${score}   Best ${S.best}`);
      host.react(score < 4 ? "angry" : "surprised");
      await host.sleep(1500);
      const next = S.afterLoss();
      if (next === "ragequit") { host.react("angry"); return { result: "ragequit", score: S.best }; }
      if (next === "lose") { host.react("relax"); await host.sleep(500); return { result: "lose", score: S.best }; }
      if (S.timeUp) return { result: "done", score: S.best };
      if (newBest && S.rounds > 1) S.streak = 0;
      view.hideOver();
      await host.sleep(300);
      reset();
      host.react("focus");
    }
  } finally {
    scope.dispose();
  }
}
