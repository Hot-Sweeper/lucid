import type { FunHost, FunOpts, Outcome } from "../host";
import { Scope, gauss, hash, rng } from "../util";
import { C, circle, fillRR, glow, lin, mix, poly, shade, text, withAlpha } from "../draw";
import { mountGame, Session, waitUntil } from "./common";

// Physics in level units (1 unit = one block). y grows upward from the ground.
const VX = 8.6, G = 88, VJ = 19.5, DT = 1 / 240;
const BPM = 132;

type Ob = { kind: "spike" | "block"; x: number; y: number; w: number; h: number };
type Pattern = { x0: number; x1: number; obs: Ob[] };
type St = { x: number; y: number; vy: number; grounded: boolean; dead: boolean };
type Level = { list: Ob[]; end: number };

const spike = (x: number, y = 0): Ob => ({ kind: "spike", x, y, w: 1, h: 1 });
const block = (x: number, w: number, h: number, y = 0): Ob => ({ kind: "block", x, y, w, h });

function near(obs: Ob[], x: number, ahead = 10) {
  return obs.filter((o) => o.x + o.w > x - 1.5 && o.x < x + ahead);
}

function stepSim(s: St, obs: Ob[], jump: boolean) {
  if (jump && s.grounded) { s.vy = VJ; s.grounded = false; }
  const py = s.y;
  s.x += VX * DT;
  s.vy -= G * DT;
  s.y += s.vy * DT;
  let sup = 0;
  for (const b of obs) {
    if (b.kind !== "block") continue;
    if (s.x + 0.98 > b.x && s.x + 0.02 < b.x + b.w) {
      const top = b.y + b.h;
      if (py >= top - 0.03 && s.y <= top) sup = Math.max(sup, top);
    }
  }
  if (s.y <= sup) { s.y = sup; s.vy = 0; s.grounded = true; } else s.grounded = false;
  for (const o of obs) {
    if (o.kind === "block") {
      if (s.x + 0.92 > o.x && s.x + 0.08 < o.x + o.w && s.y + 0.12 < o.y + o.h && s.y + 0.95 > o.y) { s.dead = true; return; }
    } else if (s.x + 0.85 > o.x + 0.3 && s.x + 0.15 < o.x + 0.7 && s.y + 0.1 < o.y + 0.55 && s.y + 0.85 > o.y) { s.dead = true; return; }
  }
}

/** The window of x positions where jumping now survives until after landing. null = no jump needed yet. */
function planJump(st: St, lv: Level): [number, number] | null {
  const obs = near(lv.list, st.x, 12);
  const run: St = { ...st };
  const cands: St[] = [];
  const until = st.x + 6.5, candMax = st.x + 4.6;
  let lastC = -1;
  while (run.x < until && !run.dead) {
    if (run.x <= candMax && run.grounded && run.x - lastC >= 0.08) { cands.push({ ...run }); lastC = run.x; }
    stepSim(run, obs, false);
    if (run.x >= lv.end) return null;
  }
  if (!run.dead) return null;
  let start = -1, end = -1;
  for (const c of cands) {
    const s: St = { ...c };
    stepSim(s, obs, true);
    let n = 0;
    while (!s.dead && !s.grounded && n < 400) { stepSim(s, obs, false); n++; }
    for (let i = 0; i < 18 && !s.dead; i++) stepSim(s, obs, false);
    if (!s.dead) { if (start < 0) start = c.x; end = c.x; } else if (start >= 0) break;
  }
  if (start < 0) return [st.x, st.x];
  return [start, end];
}

/** Returns null when the noise-free planner finishes, otherwise the x where it died. */
function perfectRun(lv: Level): number | null {
  const s: St = { x: 0, y: 0, vy: 0, grounded: true, dead: false };
  let target: number | null = null, recheck = 0;
  for (let n = 0; n < 200000 && !s.dead && s.x < lv.end; n++) {
    let jump = false;
    if (s.grounded) {
      if (target === null && s.x >= recheck) {
        const win = planJump(s, lv);
        if (win) target = (win[0] + win[1]) / 2; else recheck = s.x + 0.8;
      }
      if (target !== null && s.x >= target) { jump = true; target = null; recheck = 0; }
    }
    stepSim(s, near(lv.list, s.x, 3), jump);
  }
  return s.dead ? s.x : null;
}

function generate(seed: number): Level {
  const r = rng(seed);
  const pats: Pattern[] = [];
  let x = 14;
  const kinds = ["s1", "s2", "block", "s2", "stairs", "blockSpike", "s3", "pit", "spikeOnBlock", "s3", "block", "s2"] as const;
  for (let i = 0; i < 22; i++) {
    const pool = i < 3 ? kinds.slice(0, 3) : kinds;
    const kind = pool[Math.floor(r() * pool.length)];
    let obs: Ob[] = [], len = 1;
    switch (kind) {
      case "s1": obs = [spike(x)]; len = 1; break;
      case "s2": obs = [spike(x), spike(x + 1)]; len = 2; break;
      case "s3": obs = [spike(x), spike(x + 1), spike(x + 2)]; len = 3; break;
      case "block": { const w = 2 + Math.floor(r() * 4); obs = [block(x, w, 1)]; len = w; break; }
      case "blockSpike": obs = [block(x, 3, 1), spike(x + 3)]; len = 4; break;
      case "stairs": obs = [block(x, 2, 1), block(x + 2, 2, 2)]; len = 4; break;
      case "pit": obs = [block(x, 3, 1), spike(x + 3), spike(x + 4), block(x + 5, 3, 1)]; len = 8; break;
      case "spikeOnBlock": obs = [block(x, 6, 1), spike(x + 2.5, 1)]; len = 6; break;
    }
    pats.push({ x0: x, x1: x + len, obs });
    x += len + 3 + r() * 3;
  }
  const end = x + 6;
  const level = (): Level => ({ list: pats.flatMap((p) => p.obs), end });
  // A perfect player must be able to finish: simplify any pattern the planner cannot clear.
  for (let tries = 0; tries < 30; tries++) {
    const dx = perfectRun(level());
    if (dx === null) break;
    const p = pats.find((q) => q.x1 + 1.5 >= dx);
    if (!p) break;
    const simple = p.obs.length === 1 && p.obs[0].kind === "spike";
    p.obs = simple ? [] : [spike(p.x0)];
  }
  return level();
}

export async function playDash(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope();
  try {
    const view = mountGame(body, scope, "Dash", "dash");
    const { ctx, w, h } = view;
    const S = new Session(host, opts, { base: 0.08, step: 0.03, calm: 0.02 });
    const skill = S.skill;
    const level = generate(Math.floor(Math.random() * 1e9));
    const u = Math.round(h / 11);
    const gy = Math.round(h * 0.74);
    const finish = level.end - 2;

    let st: St = { x: 0, y: 0, vy: 0, grounded: true, dead: false };
    let target: number | null = null, recheck = 0, rot = 0, attempt = 0, won = false, bestPct = 0, cheered = false;
    let deadAt = 0, beatT = 0, landed = 0;
    const parts: { x: number; y: number; vx: number; vy: number; r: number; a: number; life: number; c: string }[] = [];
    const trail: { x: number; y: number }[] = [];
    // timing error per jump, in blocks
    const sd = 0.12 + 0.45 * (1 - skill);
    const slipP = 0.02 + 0.07 * (1 - skill);

    const reset = () => {
      st = { x: 0, y: 0, vy: 0, grounded: true, dead: false };
      target = null; recheck = 0; rot = 0; won = false; cheered = false;
      attempt++;
      trail.length = 0;
      view.setScore(`Attempt ${attempt}`, attempt > 1);
    };
    reset();

    const crash = () => {
      deadAt = performance.now();
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 9;
        parts.push({ x: st.x + 0.5, y: st.y + 0.5, vx: Math.cos(a) * v + 2, vy: Math.sin(a) * v + 3, r: 0.12 + Math.random() * 0.2, a: Math.random() * 6, life: 1, c: i % 3 === 0 ? C.cream : i % 3 === 1 ? C.orange : C.orange2 });
      }
    };
    const physics = () => {
      if (st.dead || won) return;
      let jump = false;
      if (st.grounded) {
        if (target === null && st.x >= recheck) {
          const win = planJump(st, level);
          if (win) {
            const mid = (win[0] + win[1]) / 2;
            const slip = Math.random() < slipP ? (Math.random() < 0.5 ? -0.8 : 0.7) : 0;
            target = Math.max(st.x, mid + gauss(Math.random) * sd + slip);
          } else recheck = st.x + 0.8;
        }
        if (target !== null && st.x >= target) { jump = true; target = null; recheck = 0; host.tap(" "); }
      }
      const wasGrounded = st.grounded;
      stepSim(st, near(level.list, st.x, 3), jump);
      if (!st.grounded) rot += ((Math.PI / 2) / ((2 * VJ) / G)) * DT;
      else {
        const snap = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
        rot += (snap - rot) * Math.min(1, DT * 30);
        if (!wasGrounded) landed = performance.now();
      }
      if (st.dead) crash();
      if (st.x >= finish) won = true;
      const pct = Math.min(100, Math.floor((st.x / finish) * 100));
      if (!cheered && bestPct >= 40 && pct > bestPct + 3) { cheered = true; host.react("cheer"); }
    };

    const PAL = [C.sky, C.lilac, C.pink, C.mint];
    let acc = 0;
    const frame = (t: number, dt: number) => {
      acc += dt;
      while (acc >= DT) { physics(); acc -= DT; }
      beatT += dt;
      const beat = 60 / BPM;
      const pulse = Math.exp(-((beatT % beat) / beat) * 5);
      const bar = Math.floor(beatT / (beat * 4));
      const barF = Math.min(1, ((beatT / (beat * 4)) % 1) * 6);
      const accent = mix(PAL[(bar + 3) % 4], PAL[bar % 4], barF);
      const camX = st.x - (w * 0.3) / u;
      const sx = (x: number) => (x - camX) * u;
      const sy = (y: number) => gy - y * u;

      ctx.fillStyle = lin(ctx, 0, 0, 0, gy, [[0, mix("#141a33", accent, 0.08 + pulse * 0.06)], [1, mix("#252d5c", accent, 0.18 + pulse * 0.1)]]);
      ctx.fillRect(0, 0, w, h);
      // far squares, slow parallax, breathing on the beat
      for (let i = 0; i < 14; i++) {
        const span = w * 1.4;
        const px = (((hash(i) * span - camX * u * 0.12) % span) + span) % span - w * 0.2;
        const py = hash(i + 20) * gy * 0.8;
        const s = (14 + hash(i + 40) * 30) * (1 + pulse * 0.12);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(hash(i + 60) * 3 + t * 0.1 * (hash(i) - 0.5));
        fillRR(ctx, -s / 2, -s / 2, s, s, s * 0.18, withAlpha(accent, 0.05 + hash(i + 80) * 0.06));
        ctx.restore();
      }
      // mid silhouettes
      const span = u * 2.5;
      for (let i = -1; i < w / span + 2; i++) {
        const n = Math.floor((camX * u * 0.4) / span) + i;
        const x = i * span - ((camX * u * 0.4) % span);
        const hh = (1.2 + hash(n * 3.3) * 2.6) * u;
        fillRR(ctx, x, gy - hh, span * 0.8, hh + 4, 6, withAlpha("#141a33", 0.5));
      }
      // attempt label in the world
      text(ctx, `Attempt ${attempt}`, sx(4.5), sy(4.2), Math.round(u * 0.9), withAlpha(C.cream, 0.9), { weight: 600, align: "left" });

      for (const o of near(level.list, camX, w / u + 2)) {
        const x = sx(o.x), y = sy(o.y + o.h), bw = o.w * u, bh = o.h * u;
        if (o.kind === "block") {
          fillRR(ctx, x, y, bw, bh, 4, lin(ctx, 0, y, 0, y + bh, [[0, "#3a4392"], [1, "#232a5e"]]));
          fillRR(ctx, x + 5, y + 5, bw - 10, bh - 10, 3, withAlpha("#141a33", 0.35));
          fillRR(ctx, x, y, bw, 3, 1.5, withAlpha(accent, 0.65 + pulse * 0.35));
        } else {
          const by = sy(o.y);
          poly(ctx, [[x + 1, by], [x + u / 2, by - u * 0.98], [x + u - 1, by]], lin(ctx, 0, by - u, 0, by, [[0, shade(C.pink, 0.2)], [1, C.lilac]]));
          poly(ctx, [[x + u * 0.32, by], [x + u / 2, by - u * 0.55], [x + u * 0.68, by]], withAlpha("#ffffff", 0.14));
        }
      }
      // finish portal
      const fx = sx(finish);
      if (fx < w + 40) {
        glow(ctx, fx, sy(1.6), u * 2.6, C.mint, 0.4 + pulse * 0.2);
        ctx.beginPath();
        ctx.ellipse(fx, sy(1.6), u * 0.6, u * 1.7, 0, 0, Math.PI * 2);
        ctx.ellipse(fx, sy(1.6), u * 0.34, u * 1.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = C.mint;
        ctx.fill("evenodd");
      }
      // ground
      ctx.fillStyle = lin(ctx, 0, gy, 0, h, [[0, mix("#252d5c", accent, 0.15 + pulse * 0.1)], [1, "#141a33"]]);
      ctx.fillRect(0, gy, w, h - gy);
      const off = (camX * u) % u;
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      for (let x = -off - u; x < w + u; x += u) {
        const n = Math.round((x + camX * u) / u);
        if (n % 2 === 0) ctx.fillRect(x, gy + 3, u, u);
      }
      ctx.fillStyle = withAlpha(accent, 0.75 + pulse * 0.25);
      ctx.fillRect(0, gy, w, 2.5);
      glow(ctx, w * 0.3, gy, w * 0.45, accent, 0.12 + pulse * 0.1);

      if (!st.dead) {
        trail.unshift({ x: st.x, y: st.y });
        if (trail.length > 10) trail.pop();
        trail.forEach((p, i) => {
          if (i % 2) return;
          fillRR(ctx, sx(p.x) + u * 0.2, sy(p.y) - u * 0.8, u * 0.6, u * 0.6, 3, withAlpha(C.orange, (1 - i / 10) * 0.18));
        });
        const cx = sx(st.x) + u / 2, cy = sy(st.y) - u / 2;
        const land = Math.max(0, 1 - (performance.now() - landed) / 160);
        ctx.save();
        ctx.translate(cx, cy + land * u * 0.06);
        ctx.rotate(rot);
        ctx.scale(1 + land * 0.12, 1 - land * 0.12);
        const s = u * 0.96;
        fillRR(ctx, -s / 2, -s / 2, s, s, 4, lin(ctx, 0, -s / 2, 0, s / 2, [[0, "#ffc08a"], [1, C.orange2]]));
        fillRR(ctx, -s * 0.3, -s * 0.3, s * 0.6, s * 0.6, 3, "#e0703f");
        fillRR(ctx, -s * 0.2, -s * 0.16, s * 0.13, s * 0.17, 1.5, C.cream);
        fillRR(ctx, s * 0.07, -s * 0.16, s * 0.13, s * 0.17, 1.5, C.cream);
        fillRR(ctx, -s * 0.16, s * 0.08, s * 0.32, s * 0.07, 1.5, "#7a2f1c");
        ctx.restore();
        if (st.grounded && Math.random() < 0.5) parts.push({ x: st.x + 0.1, y: st.y + 0.05, vx: -1 - Math.random() * 2, vy: 1 + Math.random() * 2, r: 0.06 + Math.random() * 0.06, a: 0, life: 0.5, c: accent });
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt * 1.3;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += dt * 6;
        if (p.y < 0) { p.y = 0; p.vy *= -0.4; p.vx *= 0.7; }
        const r = p.r * u;
        ctx.save();
        ctx.translate(sx(p.x), sy(p.y));
        ctx.rotate(p.a);
        fillRR(ctx, -r, -r, r * 2, r * 2, r * 0.3, withAlpha(p.c, Math.min(1, p.life * 1.5)));
        ctx.restore();
      }
      if (st.dead) {
        const a = Math.max(0, 1 - (performance.now() - deadAt) / 220);
        if (a > 0) { ctx.fillStyle = `rgba(255,236,220,${a * 0.4})`; ctx.fillRect(0, 0, w, h); }
      }
      // progress: real distance through the level, with a dot at the best run
      const pct = Math.min(1, st.x / finish);
      const bw = w * 0.42, bx = (w - bw) / 2;
      fillRR(ctx, bx, 10, bw, 5, 2.5, "rgba(255,255,255,0.12)");
      fillRR(ctx, bx, 10, Math.max(5, bw * pct), 5, 2.5, C.mint);
      if (bestPct > 0) circle(ctx, bx + bw * (bestPct / 100), 12.5, 2.2, C.cream);
      text(ctx, `${Math.floor(pct * 100)}%`, bx + bw + 8, 12.5, 10, withAlpha(C.cream, 0.8), { align: "left", weight: 500 });
    };

    scope.raf(frame);
    host.react("focus");

    for (;;) {
      await waitUntil(host, () => st.dead || won || S.over, 1e9);
      if (host.stopped) return { result: "done", score: bestPct };
      if (won) {
        bestPct = 100;
        host.react("cheer");
        view.showOver("Level complete", `Attempt ${attempt}`);
        await host.sleep(2400);
        return { result: "win", score: 100 };
      }
      if (S.timeUp && !st.dead) return { result: "done", score: bestPct };
      S.rounds++;
      const pct = Math.min(99, Math.floor((st.x / finish) * 100));
      const newBest = pct > bestPct;
      const gain = pct - bestPct;
      bestPct = Math.max(bestPct, pct);
      await host.sleep(520);
      view.showOver(`${pct}%`, newBest && S.rounds > 1 ? "New best" : `Best ${bestPct}%`);
      if (pct < 12 && S.rounds > 2) host.react("angry");
      else if (newBest && pct > 50) host.react("surprised");
      await host.sleep(850);
      const next = S.afterLoss();
      if (next === "ragequit") { host.react("angry"); return { result: "ragequit", score: bestPct }; }
      if (next === "lose") { host.react("relax"); return { result: "lose", score: bestPct }; }
      if (S.timeUp) return { result: "done", score: bestPct };
      if (newBest && gain >= 10 && S.rounds > 1) S.streak = 0;
      view.hideOver();
      reset();
    }
  } finally {
    scope.dispose();
  }
}
