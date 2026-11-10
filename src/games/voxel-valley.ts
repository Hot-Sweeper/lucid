// Voxel Valley: a 2D side-view voxel sandbox. The robot chops a tree, digs a staircase for
// stone and ore, builds a little hut before nightfall and sleeps through to morning.
// A static bunny sometimes hops over: its fur charges up until it zaps a few blocks loose.
// A gentle pat grounds it.
import "./games.css";
import { canvasPixelRatio } from "../perf/canvas";
import {
  Scope, Session, Halt, mountFrame, addCanvas, nap, chance, clamp, lerp, rng, hash, reducedMotion,
  P, fillRR, circle, line, lin, rad, glow, text, withAlpha, mix,
  type Ctx, type FunHost, type FunOpts, type Outcome,
} from "./kit";

const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, COAL = 4, COPPER = 5, CRYSTAL = 6, LOG = 7, LEAF = 8, WATER = 9, CORE = 10, BRICK = 11;
const HARD: Record<number, number> = { [GRASS]: 0.5, [DIRT]: 0.5, [STONE]: 1.1, [COAL]: 1.2, [COPPER]: 1.3, [CRYSTAL]: 1.4, [LOG]: 0.85, [LEAF]: 0.25, [BRICK]: 1.1 };
// hotbar: dirt, brick, log, leaves, gems
const SLOT_OF: Record<number, number> = { [GRASS]: 0, [DIRT]: 0, [STONE]: 1, [BRICK]: 1, [LOG]: 2, [LEAF]: 3, [COAL]: 4, [COPPER]: 4, [CRYSTAL]: 4 };
const PLACE_AS = [DIRT, BRICK, LOG, LEAF];
const SLOT_ICON = [DIRT, BRICK, LOG, LEAF, CRYSTAL];
const COLS = 64, ROWS = 17;
const REACH = 5;
const G = 34, JUMP = 9.6, WALK = 3.4;

class Dead extends Error {}
class Quit extends Error {}
// a function, so TypeScript does not narrow away state changes made by the frame loop
const alive = (h: { state: string }) => h.state !== "gone";

interface Body { x: number; y: number; w: number; h: number; vx: number; vy: number; grounded: boolean; wet: boolean; goal: number | null; want: number; face: number; walkT: number }
// charge: static in the fur (0..1); wind: the crackling wind-up before a zap; pets: pats that grounded it
interface Bunny extends Body { state: "hop" | "charge" | "giggle" | "leave" | "nap" | "gone"; charge: number; wind: number; stun: number; pets: number; away: number; leaveT: number; noticed: boolean; night: boolean; poof: number; spot: number; lastX: number; stuck: number }
type Part = { x: number; y: number; vx: number; vy: number; life: number; r: number; c: string; g: number };
type Arc = { x0: number; y0: number; x1: number; y1: number; life: number; seed: number };

const FUR = "#d6d0ea", FUR_LIGHT = "#f1edfa", FUR_DARK = "#b3acd0";
const FLUFF = [FUR_LIGHT, FUR, "#ffffff", FUR_DARK];
const SPARK = ["#ffe07a", "#9fd8ff"];
const ARC_LIFE = 0.35;

function genWorld(seed: number) {
  const r = rng(seed);
  const blk = new Uint8Array(COLS * ROWS);
  const surf: number[] = [];
  const ph = [r() * 9, r() * 9, r() * 9];
  for (let c = 0; c < COLS; c++) {
    const n = Math.sin(c * 0.13 + ph[0]) * 1.6 + Math.sin(c * 0.29 + ph[1]) * 0.9 + Math.sin(c * 0.61 + ph[2]) * 0.45;
    surf.push(Math.round(clamp(8 + n, 6, 11)));
  }
  // a flat spot for the hut, near the middle
  const site = 26 + Math.floor(r() * 10);
  const sh = Math.min(9, surf[site + 2]);
  for (let c = site - 2; c <= site + 6; c++) surf[c] = sh;
  // ease neighbours toward it so the robot can walk in
  for (let k = 1; k < 5; k++) {
    for (const c of [site - 2 - k, site + 6 + k]) if (c >= 0 && c < COLS) surf[c] = Math.round(lerp(surf[c], sh, 1 - k / 5));
  }
  const sea = 10;
  const set = (c: number, rr: number, t: number) => { if (c >= 0 && c < COLS && rr >= 0 && rr < ROWS) blk[rr * COLS + c] = t; };
  for (let c = 0; c < COLS; c++) {
    const s = surf[c];
    for (let rr = 0; rr < ROWS; rr++) {
      let t = AIR;
      if (rr === ROWS - 1) t = CORE;
      else if (rr > s + 2 + Math.round(hash(c * 7.1) * 1.4)) {
        t = STONE;
        const o = r();
        if (o < 0.05) t = COAL;
        else if (o < 0.08 && rr > 11) t = COPPER;
        else if (o < 0.1 && rr > 12) t = CRYSTAL;
      } else if (rr > s) t = DIRT;
      else if (rr === s) t = s >= sea ? DIRT : GRASS;
      else if (rr >= sea) t = WATER;
      set(c, rr, t);
    }
  }
  // trees: some guaranteed close to the hut, a few elsewhere
  const trees: number[] = [];
  const canTree = (c: number) => c > 2 && c < COLS - 3 && surf[c] < sea && (c < site - 4 || c > site + 9) && !trees.some((t) => Math.abs(t - c) < 5);
  const want = [site - 6 - Math.floor(r() * 4), site + 11 + Math.floor(r() * 4)];
  for (let c = 3; c < COLS - 3; c++) if (r() < 0.1) want.push(c);
  for (const c of want) {
    if (!canTree(c)) continue;
    surf[c - 1] = surf[c + 1] = surf[c];
    for (const cc of [c - 1, c + 1]) for (let rr = 0; rr < ROWS - 1; rr++) set(cc, rr, rr < surf[c] ? AIR : rr === surf[c] ? GRASS : rr > surf[c] + 2 ? STONE : DIRT);
    const th = 3 + Math.floor(r() * 2), s = surf[c];
    for (let k = 1; k <= th; k++) set(c, s - k, LOG);
    const top = s - th;
    for (let rr = top - 2; rr <= top; rr++) for (let dc = -2; dc <= 2; dc++) {
      if (dc === 0 && rr >= top) continue;
      if (Math.abs(dc) === 2 && (rr === top - 2 || r() < 0.3)) continue;
      if (blk[rr * COLS + c + dc] === AIR) set(c + dc, rr, LEAF);
    }
    trees.push(c);
  }
  return { blk, surf, site, sh, trees, sea };
}

// ---- block art (flat, soft, no outlines) ----------------------------------------------

const BASE: Record<number, string> = { [GRASS]: "#8a5d40", [DIRT]: "#8a5d40", [STONE]: "#7c86a6", [COAL]: "#7c86a6", [COPPER]: "#7c86a6", [CRYSTAL]: "#7c86a6", [LOG]: "#9a6a44", [LEAF]: "#3fae5f", [CORE]: "#232a52", [BRICK]: "#6b7393" };
const GEM: Record<number, string> = { [COAL]: "#2b2f45", [COPPER]: "#ff9f5a", [CRYSTAL]: "#4fb6ff" };

function drawBlock(ctx: Ctx, t: number, x: number, y: number, B: number, seed: number, rad4: [number, number, number, number] = [0, 0, 0, 0]) {
  ctx.beginPath();
  ctx.roundRect(x, y, B, B, rad4);
  ctx.fillStyle = BASE[t] ?? "#f0f";
  ctx.fill();
  const h = (k: number) => hash(seed * 13.7 + k);
  if (t === GRASS || t === DIRT) {
    for (let i = 0; i < 3; i++) fillRR(ctx, x + B * (0.12 + h(i) * 0.6), y + B * (0.3 + h(i + 5) * 0.55), B * 0.18, B * 0.1, B * 0.05, "#74492f");
    if (t === GRASS) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, B, B, rad4); ctx.clip();
      fillRR(ctx, x, y, B, B * 0.3, 0, "#5fc46a");
      for (let i = 0; i < 3; i++) circle(ctx, x + B * (0.18 + i * 0.32), y + B * 0.3, B * 0.12, "#5fc46a");
      fillRR(ctx, x + B * 0.1, y + B * 0.06, B * 0.3, B * 0.07, B * 0.03, "#7fd88a");
      ctx.restore();
    }
  } else if (t === STONE || t === COAL || t === COPPER || t === CRYSTAL) {
    for (let i = 0; i < 2; i++) fillRR(ctx, x + B * (0.1 + h(i) * 0.55), y + B * (0.15 + h(i + 3) * 0.6), B * 0.28, B * 0.14, B * 0.07, "#6b7593");
    if (GEM[t]) for (let i = 0; i < 3; i++) {
      const gx = x + B * (0.22 + ((i * 0.31 + h(i + 9) * 0.2) % 0.6)), gy = y + B * (0.22 + h(i + 11) * 0.55);
      fillRR(ctx, gx, gy, B * 0.2, B * 0.17, B * 0.06, GEM[t]);
      fillRR(ctx, gx + B * 0.03, gy + B * 0.03, B * 0.07, B * 0.05, B * 0.02, "rgba(255,255,255,0.45)");
    }
  } else if (t === LOG) {
    for (let i = 0; i < 3; i++) fillRR(ctx, x + B * (0.14 + i * 0.28), y, B * 0.1, B, B * 0.05, "#b07c52");
  } else if (t === LEAF) {
    for (let i = 0; i < 3; i++) circle(ctx, x + B * (0.25 + h(i) * 0.5), y + B * (0.25 + h(i + 4) * 0.5), B * 0.16, "#56c774");
  } else if (t === CORE) {
    fillRR(ctx, x + B * 0.2, y + B * 0.3, B * 0.25, B * 0.2, B * 0.08, "#2c3466");
  } else if (t === BRICK) {
    const g = B * 0.06;
    fillRR(ctx, x + g, y + g, B * 0.55 - g, B / 2 - g * 1.5, B * 0.06, "#8c93b3");
    fillRR(ctx, x + B * 0.55 + g / 2, y + g, B * 0.45 - g * 1.5, B / 2 - g * 1.5, B * 0.06, "#8c93b3");
    fillRR(ctx, x + g, y + B / 2 + g / 2, B * 0.3 - g, B / 2 - g * 1.5, B * 0.06, "#8c93b3");
    fillRR(ctx, x + B * 0.3 + g / 2, y + B / 2 + g / 2, B * 0.7 - g * 1.5, B / 2 - g * 1.5, B * 0.06, "#8c93b3");
  }
}

export async function playVoxelValley(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  const calm = reducedMotion();
  try {
    const f = mountFrame(body, scope, "Voxel Valley", "bc");
    const S = new Session(host, opts, { base: 0.3, step: 0.15, calm: 0.08 });
    const skill = S.skill;
    const W = f.w, H = f.h;
    const { ctx } = addCanvas(f.stage, W, H);
    const B = Math.ceil(H / (ROWS - 0.6));
    let attempt = 0;

    for (;;) {
      attempt++;
      const res = await playWorld(attempt);
      if (res === "win") return { result: "win", score: attempt };
      if (res === "quit") return { result: "ragequit", score: 0 };
      if (res === "time") {
        f.showOver("Out of time", "The hut will have to wait", "plain");
        await nap(host, 1500);
        return { result: "done", score: 0 };
      }
      // the robot ran out of power
      S.rounds++;
      const next = S.afterLoss(0.18);
      if (next === "ragequit") { host.react("angry"); await nap(host, 500); return { result: "ragequit", score: 0 }; }
      if (next === "lose" || S.left < 40000) { host.react("relax"); await nap(host, 900); return { result: "lose", score: 0 }; }
      f.hideOver();
      await nap(host, 400);
    }

    // ---------------------------------------------------------------------------------
    async function playWorld(n: number): Promise<"win" | "dead" | "time" | "quit"> {
      // each world gets its own frame loop, torn down before the next one starts
      const ws = new Scope(body);
      scope.add(() => ws.dispose());
      try { return await runWorld(n, ws); } finally { ws.dispose(); }
    }

    async function runWorld(n: number, ws: Scope): Promise<"win" | "dead" | "time" | "quit"> {
      ws.liveCanvas(ctx.canvas);
      const world = genWorld(Math.floor(Math.random() * 1e9));
      const { blk, site, sh } = world;
      const get = (c: number, r: number) => (c < 0 || c >= COLS || r >= ROWS ? CORE : r < 0 ? AIR : blk[r * COLS + c]);
      const solid = (t: number) => t !== AIR && t !== WATER;
      const solidAt = (c: number, r: number) => solid(get(c, r));

      // terrain cache, redrawn per changed cell
      const cache = document.createElement("canvas");
      cache.width = COLS * B * 2; cache.height = ROWS * B * 2;
      const cc = cache.getContext("2d")!;
      cc.setTransform(2, 0, 0, 2, 0, 0);
      let terrainDensity = 2;
      ws.add(() => { cache.width = cache.height = 0; });
      const empty = (c: number, r: number) => { const t = get(c, r); return t === AIR || t === WATER; };
      const paintCell = (c: number, r: number) => {
        cc.clearRect(c * B, r * B, B, B);
        const t = get(c, r);
        if (t === AIR || t === WATER) return;
        const k = t === LEAF ? B * 0.4 : B * 0.22;
        const e = (dc: number, dr: number) => empty(c + dc, r + dr);
        const rad4: [number, number, number, number] = [
          e(-1, 0) && e(0, -1) ? k : 0, e(1, 0) && e(0, -1) ? k : 0,
          e(1, 0) && e(0, 1) ? k : 0, e(-1, 0) && e(0, 1) ? k : 0,
        ];
        drawBlock(cc, t, c * B, r * B, B, c * 31 + r * 17, rad4);
      };
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) paintCell(c, r);
      const setBlock = (c: number, r: number, t: number) => {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
        blk[r * COLS + c] = t;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (c + dc >= 0 && c + dc < COLS && r + dr >= 0 && r + dr < ROWS) paintCell(c + dc, r + dr);
      };

      // ---- entities ----
      const mkBody = (x: number, y: number, w: number, h: number): Body => ({ x, y, w, h, vx: 0, vy: 0, grounded: false, wet: false, goal: null, want: 0, face: 1, walkT: 0 });
      const R = mkBody(site + 2.15, sh - 1.8, 0.7, 1.8);
      let bun: Bunny | null = null;
      let hurtNow = false, petting = false, napped = false;
      let cells = 3, dead = false, sleeping = false, swing = 0, holding = -1, hurtT = 0;
      let crack: { c: number; r: number; p: number } | null = null;
      const inv = [0, 0, 0, 0, 0], shown = [0, 0, 0, 0, 0], bumpS = [0, 0, 0, 0, 0];
      let sel = 0;
      const parts: Part[] = [];
      const flies: { t: number; x: number; y: number; slot: number; icon: number }[] = [];
      const flashes: { c: number; r: number; t: number }[] = [];
      const arcs: Arc[] = [];
      let camX = clamp((R.x + 0.35) * B - W / 2, 0, COLS * B - W), shake = 0, zapFlash = 0, title = 1;
      let dayT = 0.3, dayRate = 0.0062, zz = 0;
      let status = "";
      const setStatus = (s: string) => { status = s; f.setScore(s); };

      const overlaps = (b: Body, x: number, y: number) => {
        for (let r = Math.floor(y); r <= Math.floor(y + b.h - 1e-6); r++)
          for (let c = Math.floor(x); c <= Math.floor(x + b.w - 1e-6); c++) if (solidAt(c, r)) return true;
        return false;
      };
      const wetAt = (b: Body) => get(Math.floor(b.x + b.w / 2), Math.floor(b.y + b.h * 0.6)) === WATER;
      const step = (b: Body, dt: number, speed: number, isRobot: boolean) => {
        b.wet = wetAt(b);
        let want = b.want;
        if (b.goal !== null) {
          const dx = b.goal - (b.x + b.w / 2);
          if (Math.abs(dx) < speed * dt * 1.2) { b.x = b.goal - b.w / 2; b.goal = null; want = 0; if (overlaps(b, b.x, b.y)) b.x -= Math.sign(dx) * 0.05; }
          else want = Math.sign(dx);
        }
        if (want) b.face = want;
        const sp = speed * (b.wet ? 0.55 : 1);
        b.vx = want * sp + (b.vx - want * sp) * Math.exp(-dt * 10);
        if (Math.abs(b.vx) < 0.01) b.vx = 0;
        // horizontal
        const nx = b.x + b.vx * dt;
        if (!overlaps(b, nx, b.y)) b.x = nx;
        else {
          const dir = Math.sign(b.vx);
          // auto step up a single block
          const front = Math.floor(dir > 0 ? b.x + b.w + 0.05 : b.x - 0.05);
          const feet = Math.floor(b.y + b.h - 0.01);
          if ((b.grounded || b.wet) && solidAt(front, feet) && !solidAt(front, feet - 1) && !solidAt(front, feet - 2) && !solidAt(Math.floor(b.x + b.w / 2), feet - 2)) {
            b.vy = b.wet ? -5 : -JUMP;
            if (isRobot) host.tap(" ");
          } else if (b.wet) b.vy = Math.min(b.vy, -2.5);
          // the bunny has springy feet: it hops up to two blocks
          else if (!isRobot && b.grounded && !solidAt(Math.floor(b.x + b.w / 2), feet - 2) && !solidAt(Math.floor(b.x + b.w / 2), feet - 3)) b.vy = -12.5;
          b.vx = 0;
        }
        // vertical
        b.vy += G * dt * (b.wet ? 0.3 : 1);
        if (b.wet) b.vy = clamp(b.vy, -4, 2.4);
        b.vy = Math.min(b.vy, 18);
        const ny = b.y + b.vy * dt;
        if (!overlaps(b, b.x, ny)) { b.y = ny; b.grounded = false; }
        else {
          if (b.vy > 0) { b.y = Math.floor(ny + b.h) - b.h - 1e-4; b.grounded = true; }
          else b.y = Math.floor(ny) + 1 + 1e-4;
          b.vy = 0;
        }
        if (want && b.grounded) b.walkT += dt * 9; else b.walkT *= 0.8;
      };

      const burst = (x: number, y: number, n: number, colors: string[], spd = 5, grav = 18) => {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0.6 + Math.random() * 0.6, r: 0.06 + Math.random() * 0.1, c: colors[i % colors.length], g: grav });
        }
      };

      const fluff = (x: number, y: number, n: number) => burst(x, y, n, FLUFF, 3, 1.5);
      const poofOut = (h: Bunny) => { h.state = "gone"; h.poof = 1; fluff(h.x + 0.45, h.y + 0.45, 14); };
      const dropItem = () => {
        const held = [0, 1, 2, 3].filter((i) => inv[i] > 0);
        if (!held.length) return;
        const slot = held[Math.floor(Math.random() * held.length)];
        inv[slot]--; shown[slot] = Math.max(0, shown[slot] - 1); bumpS[slot] = 1;
        burst(R.x + R.w / 2, R.y + 0.8, 6, [BASE[PLACE_AS[slot]], "#f6ecdc"], 4);
      };

      // Full of static, the bunny discharges: a few nearby blocks pop loose in a puff of fluff.
      const zap = (h: Bunny) => {
        const ex = h.x + h.w / 2, ey = h.y + h.h / 2;
        const loose: [number, number, number][] = [];
        for (let r = Math.floor(ey - 3); r <= Math.ceil(ey + 3); r++) for (let c = Math.floor(ex - 3); c <= Math.ceil(ex + 3); c++) {
          const t = get(c, r);
          if (t === AIR || t === WATER || t === CORE) continue;
          const d = Math.hypot(c + 0.5 - ex, r + 0.5 - ey);
          if (d < 2.6 && (empty(c - 1, r) || empty(c + 1, r) || empty(c, r - 1) || empty(c, r + 1))) loose.push([c, r, d + hash(c * 5 + r) * 0.8]);
        }
        loose.sort((a, b) => a[2] - b[2]);
        for (const [c, r] of loose.slice(0, chance(0.5) ? 3 : 2)) {
          const t = get(c, r);
          setBlock(c, r, AIR);
          burst(c + 0.5, r + 0.5, 6, [BASE[t], "#f6ecdc", SPARK[0]], 4);
          arcs.push({ x0: ex, y0: ey, x1: c + 0.5, y1: r + 0.5, life: ARC_LIFE, seed: Math.random() * 99 });
        }
        fluff(ex, ey, 22);
        zapFlash = 1;
        shake = calm ? 0 : 0.45;
        h.charge = 0; h.state = "leave"; h.leaveT = 0;
        h.away = Math.sign(ex - (R.x + R.w / 2)) || 1;
        const d = Math.hypot(R.x + R.w / 2 - ex, R.y + R.h / 2 - ey);
        if (d < 3.2 && !sleeping) {
          // a static shock: the robot jolts, drops something and loses a charge cell
          arcs.push({ x0: ex, y0: ey, x1: R.x + R.w / 2, y1: R.y + 0.6, life: ARC_LIFE, seed: Math.random() * 99 });
          cells--;
          hurtT = 1;
          R.vy = -5; R.vx = Math.sign(R.x + R.w / 2 - ex || 1) * 4; R.goal = null;
          dropItem();
          if (cells <= 0) { cells = 0; dead = true; } else hurtNow = true;
        }
      };

      const spawnBunny = (night: boolean, far = 11) => {
        const rc = Math.floor(R.x + R.w / 2);
        const sides = night ? [-1] : chance(0.5) ? [1, -1] : [-1, 1];
        for (const s of sides) {
          for (let dist = far; dist >= Math.min(far, 7) - 3; dist--) {
            const c = night ? site - 8 : rc + s * dist;
            if (c < 1 || c >= COLS - 1) continue;
            let r = 0;
            while (r < ROWS && !solidAt(c, r)) r++;
            if (get(c, r - 1) === WATER || get(c, r) === LEAF) continue;
            bun = { ...mkBody(c + 0.05, r - 0.92, 0.9, 0.9), state: "hop", charge: 0, wind: 0, stun: 0, pets: 0, away: 1, leaveT: 0, noticed: false, night, poof: 0, lastX: c, stuck: 0,
              // decided up front: how close it gets before the robot spots it (0 = never)
              spot: chance(0.3 + 0.55 * skill) ? 1.5 + Math.random() * 5 : 0 };
            fluff(c + 0.5, r - 0.5, 8);
            return;
          }
        }
      };
      const bunnyPlan = [6 + Math.random() * 10];
      if (chance(0.6)) bunnyPlan.push(bunnyPlan[0] + 12 + Math.random() * 8);
      let worldT = 0;
      let phase: "gather" | "build" | "sleep" = "gather";

      // ---- simulation + drawing ----
      const sim = (dt: number) => {
        worldT += dt;
        dayT += dt * (sleeping ? 0.11 : dayRate);
        if (!dead) step(R, dt, WALK, true);
        else { R.vy += G * dt; const ny = R.y + R.vy * dt; if (!overlaps(R, R.x, ny)) R.y = ny; else R.vy = 0; }
        if (phase === "gather" && bunnyPlan.length && worldT > bunnyPlan[0] && !bun) { bunnyPlan.shift(); spawnBunny(false); }
        const h = bun;
        if (!h) return;
        if (h.state === "gone") { h.poof -= dt * 2; if (h.poof <= 0) bun = null; return; }
        const dx = R.x + R.w / 2 - (h.x + h.w / 2), dy = R.y + R.h - (h.y + h.h);
        if (h.state === "giggle") { h.stun -= dt; h.want = 0; if (h.stun <= 0) h.state = h.pets >= 2 ? "leave" : "hop"; }
        else if (h.state === "hop") {
          // hopping through the grass rubs static into the fur
          h.charge = Math.min(1, h.charge + dt * 0.12);
          h.want = Math.abs(dx) > 0.7 ? Math.sign(dx) : 0;
          // at night it only wants to be near the robot, so it curls up against the hut
          if (h.night) { if (h.stuck > 1.2 || Math.abs(dx) < 2.2) { h.state = "nap"; napped = true; } }
          else if (Math.abs(dx) < 1.7 && Math.abs(dy) < 2.6 && !dead) { h.state = "charge"; h.wind = 0; }
        } else if (h.state === "charge") {
          h.want = 0; h.wind += dt; h.charge = Math.min(1, h.charge + dt * 0.6);
          if (Math.abs(dx) > 3.4 || Math.abs(dy) > 3.4) h.state = "hop";
          else if (h.wind > 1.7) zap(h);
        } else if (h.state === "leave") {
          h.want = h.away;
          if ((h.leaveT += dt) > 2.6) poofOut(h);
        } else h.want = 0;
        if (alive(h)) step(h, dt, h.state === "leave" ? 2.2 : 1.5, false);
        if (h.state === "hop") {
          if (Math.abs(h.x - h.lastX) > 0.4) { h.lastX = h.x; h.stuck = 0; }
          else if ((h.stuck += dt) > 3 && !h.night) { fluff(h.x + 0.45, h.y + 0.45, 10); bun = null; spawnBunny(false, 6); }
        }
        if (h.night && dayT >= 0.98 && alive(h)) poofOut(h);
      };
      const sx = (x: number) => x * B - camX;
      const sky = () => {
        const sunH = Math.sin(dayT * Math.PI * 2);
        const light = clamp(0.25 + sunH * 1.5);
        const dusk = clamp(1 - Math.abs(sunH) * 3.2) * (dayT % 1 > 0.25 && dayT % 1 < 0.75 ? 1 : 0.7);
        return { sunH, light, dusk };
      };
      const draw = (t: number, dt: number) => {
        const density = canvasPixelRatio(ctx.canvas);
        if (density > terrainDensity) {
          terrainDensity = density;
          cache.width = Math.ceil(COLS * B * density); cache.height = Math.ceil(ROWS * B * density);
          cc.setTransform(density, 0, 0, density, 0, 0);
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) paintCell(c, r);
        }
        const { sunH, light, dusk } = sky();
        const target = clamp((R.x + R.w / 2) * B - W * 0.48, 0, COLS * B - W);
        camX += (target - camX) * Math.min(1, dt * 3);
        const shx = shake ? (Math.random() - 0.5) * 8 * shake : 0, shy = shake ? (Math.random() - 0.5) * 6 * shake : 0;
        shake = Math.max(0, shake - dt * 2.5);
        ctx.save();
        ctx.translate(shx, shy);
        // sky
        const top = mix("#141a33", "#5aa9f0", light), bot = mix(mix("#252d5c", "#c4e8ff", light), "#ff9f7a", dusk * 0.75);
        ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, top], [0.7, bot], [1, bot]]);
        ctx.fillRect(-10, -10, W + 20, H + 20);
        if (light < 0.6) for (let i = 0; i < 40; i++) {
          const a = (0.6 - light) * (0.5 + 0.5 * (calm ? 1 : Math.sin(t * 2 + i * 1.7)));
          circle(ctx, ((hash(i) * W * 1.6 - camX * 0.05) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3, hash(i + 40) * H * 0.5, 0.6 + hash(i + 7), withAlpha(P.cream, a));
        }
        const arc = (p: number) => ({ x: W * (0.08 + 0.84 * p), y: H * 0.62 - Math.sin(p * Math.PI) * H * 0.5 });
        const dp = ((dayT % 1) + 1) % 1;
        if (dp < 0.5) { const s = arc(dp / 0.5); glow(ctx, s.x, s.y, 50, "#ffd59a", 0.5); circle(ctx, s.x, s.y, 14, "#fff1c9"); }
        else {
          const m = arc((dp - 0.5) / 0.5);
          glow(ctx, m.x, m.y, 40, P.cream, 0.25); circle(ctx, m.x, m.y, 11, "#e9e4f5");
          circle(ctx, m.x + 4, m.y - 3, 9, mix(top, bot, 0.3));
        }
        // hills
        for (const [k, col, base, amp] of [[0.15, mix("#2b356e", "#9fd0b4", light * 0.8), H * 0.42, 28], [0.32, mix("#232b5e", "#79bf8e", light * 0.8), H * 0.5, 22]] as const) {
          ctx.beginPath(); ctx.moveTo(-10, H);
          for (let x = -10; x <= W + 10; x += 10) { const wx = x + camX * k; ctx.lineTo(x, base - Math.sin(wx * 0.012) * amp - Math.sin(wx * 0.031 + 2) * amp * 0.4); }
          ctx.lineTo(W + 10, H); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
        }
        // clouds
        for (let i = 0; i < 5; i++) {
          const span = W + 160;
          const cx = (((hash(i + 3) * span + t * 6 * (0.6 + hash(i)) - camX * 0.2) % span) + span) % span - 80, cy = 30 + hash(i + 9) * 60;
          const a = 0.25 + light * 0.55;
          fillRR(ctx, cx, cy, 60 + hash(i) * 30, 16, 8, withAlpha("#ffffff", a * 0.8));
          fillRR(ctx, cx + 14, cy - 9, 34, 16, 8, withAlpha("#ffffff", a * 0.8));
        }
        // terrain
        ctx.drawImage(cache, camX * terrainDensity, 0, W * terrainDensity, ROWS * B * terrainDensity, 0, 0, W, ROWS * B);
        if (crack) {
          const x = sx(crack.c), y = crack.r * B, p = crack.p;
          ctx.save(); ctx.beginPath(); ctx.rect(x, y, B, B); ctx.clip();
          ctx.fillStyle = `rgba(20,16,30,${0.12 + p * 0.25})`; ctx.fillRect(x, y, B, B);
          const segs: [number, number][][] = [[[0.5, 0.5], [0.2, 0.15]], [[0.5, 0.5], [0.85, 0.3]], [[0.5, 0.5], [0.6, 0.9]], [[0.5, 0.5], [0.12, 0.7]], [[0.2, 0.15], [0.05, 0.3]], [[0.85, 0.3], [0.95, 0.1]]];
          segs.slice(0, Math.ceil(p * segs.length)).forEach((sg) => line(ctx, sg.map(([a, b]) => [x + a * B, y + b * B] as [number, number]), 1.6, "rgba(20,16,30,0.65)"));
          ctx.restore();
        }
        for (let i = flashes.length - 1; i >= 0; i--) {
          const fl = flashes[i]; fl.t -= dt * 3;
          if (fl.t <= 0) { flashes.splice(i, 1); continue; }
          fillRR(ctx, sx(fl.c) - 2 * fl.t, fl.r * B - 2 * fl.t, B + 4 * fl.t, B + 4 * fl.t, 4, `rgba(255,255,255,${fl.t * 0.5})`);
        }
        if (bun) drawBunny(bun, t);
        drawRobot(t);
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          fillRR(ctx, sx(p.x) - p.r * B, p.y * B - p.r * B, p.r * B * 2, p.r * B * 2, p.r * B * 0.4, withAlpha(p.c, Math.min(1, p.life * 2)));
        }
        drawArcs(t, dt);
        // water in front, so whatever is in it looks submerged
        const c0 = Math.floor(camX / B), c1 = Math.ceil((camX + W) / B);
        for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
          if (get(c, r) !== WATER) continue;
          const surfTop = get(c, r - 1) !== WATER;
          const wy = surfTop ? r * B + 3 + Math.sin(t * 2 + c) * 1.5 : r * B;
          ctx.fillStyle = withAlpha(mix("#2a4f9a", "#4fb6ff", light), 0.72);
          ctx.fillRect(sx(c), wy, B + 0.5, (r + 1) * B - wy);
          if (surfTop) fillRR(ctx, sx(c) + 2, wy, B - 4, 2, 1, withAlpha("#ffffff", 0.35 * light + 0.1));
        }
        // night: dark everywhere except the robot's headlamp
        const dark = (1 - light) * 0.64;
        if (dark > 0.01) {
          const hx = sx(R.x + R.w / 2), hy = (R.y + 0.4) * B;
          ctx.fillStyle = rad(ctx, hx, hy, B * 6, [[0, `rgba(10,12,34,0)`], [0.45, `rgba(10,12,34,${dark * 0.35})`], [1, `rgba(10,12,34,${dark})`]]);
          ctx.fillRect(-10, -10, W + 20, H + 20);
          for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
            const g = get(c, r);
            if (g === CRYSTAL || g === COPPER) glow(ctx, sx(c) + B / 2, r * B + B / 2, B * 0.9, GEM[g], dark * 0.35);
          }
        }
        if (zapFlash > 0) { ctx.fillStyle = `rgba(222,240,255,${zapFlash * 0.35})`; ctx.fillRect(-10, -10, W + 20, H + 20); zapFlash = Math.max(0, zapFlash - dt * 4); }
        ctx.restore();
        drawHud(t, dt, light);
        if (title > 0) {
          title -= dt * 0.4;
          const a = clamp(title * 2);
          text(ctx, n > 1 ? `Try ${n}` : "Day 1", W / 2, H * 0.2, 22, withAlpha("#ffffff", a), { weight: 600 });
        }
        if (sleeping) {
          zz += dt;
          for (let i = 0; i < 3; i++) {
            const k = ((zz * 0.6 + i / 3) % 1);
            text(ctx, "z", sx(R.x + 0.6) + k * 14, (R.y) * B - k * 26, 10 + k * 6, withAlpha(P.cream, 1 - k), { weight: 600 });
          }
        }
        void sunH;
      };

      const drawRobot = (t: number) => {
        const x = sx(R.x + R.w / 2), y = (R.y + R.h) * B, s = B / 20;
        ctx.save();
        ctx.translate(x, y);
        if (dead) { ctx.rotate(-Math.PI / 2 * R.face); ctx.translate(0, -2 * s); }
        ctx.scale(R.face, 1);
        if (hurtT > 0) { hurtT -= 1 / 60; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 40); }
        const leg = Math.sin(R.walkT) * 3 * s;
        fillRR(ctx, -6 * s + leg * 0.5, -10 * s, 5 * s, 10 * s, 2 * s, "#3a4392");
        fillRR(ctx, 1 * s - leg * 0.5, -10 * s, 5 * s, 10 * s, 2 * s, "#323a80");
        fillRR(ctx, -7 * s, -23 * s, 14 * s, 14 * s, 4 * s, lin(ctx, 0, -23 * s, 0, -9 * s, [[0, "#ffb37a"], [1, P.orange2]]));
        fillRR(ctx, -3 * s, -19 * s, 6 * s, 5 * s, 1.5 * s, "#ffe2c4");
        // arm with pickaxe or block
        const sw = Math.sin(swing * Math.PI);
        ctx.save();
        ctx.translate(2 * s, -19 * s);
        ctx.rotate(-0.5 - sw * 1.3 + (sleeping ? 1.2 : 0));
        line(ctx, [[0, 0], [9 * s, 0]], 3.6 * s, "#ff9f5a");
        if (holding >= 0) {
          ctx.save(); ctx.translate(8 * s, -3 * s); ctx.scale(0.3, 0.3); drawBlock(ctx, PLACE_AS[holding] ?? DIRT, 0, 0, 20 * s, 3); ctx.restore();
        } else if (petting) {
          circle(ctx, 9.5 * s, 0, 2.6 * s, "#ffb37a");
        } else if (!sleeping) {
          line(ctx, [[8 * s, 4 * s], [8 * s, -9 * s]], 2.2 * s, "#9a6a44");
          ctx.beginPath(); ctx.moveTo(2 * s, -7 * s); ctx.quadraticCurveTo(8 * s, -12 * s, 14 * s, -7 * s);
          ctx.lineWidth = 2.8 * s; ctx.lineCap = "round"; ctx.strokeStyle = "#c9cdf5"; ctx.stroke();
        }
        ctx.restore();
        // head
        fillRR(ctx, -8 * s, -36 * s, 16 * s, 14 * s, 4.5 * s, "#f6ecdc");
        fillRR(ctx, -5 * s, -33 * s, 13 * s, 8 * s, 3 * s, P.night);
        if (dead) { fillRR(ctx, -1 * s, -30 * s, 7 * s, 1.5 * s, 1, "#8a91c4"); }
        else if (sleeping) { fillRR(ctx, -2 * s, -29.5 * s, 3.5 * s, 1.4 * s, 0.7 * s, P.mint); fillRR(ctx, 3 * s, -29.5 * s, 3.5 * s, 1.4 * s, 0.7 * s, P.mint); }
        else {
          const blink = Math.sin(t * 1.3) > 0.97 ? 0.3 : 1;
          fillRR(ctx, -1.5 * s, -31.5 * s, 3 * s, 4 * s * blink, 1.2 * s, P.mint);
          fillRR(ctx, 3.5 * s, -31.5 * s, 3 * s, 4 * s * blink, 1.2 * s, P.mint);
        }
        line(ctx, [[-2 * s, -36 * s], [-4 * s, -41 * s]], 1.6 * s, "#c9cdf5");
        circle(ctx, -4 * s, -42 * s, 2.2 * s, P.orange);
        ctx.restore();
        // health cells, top left
        for (let i = 0; i < 3; i++) {
          fillRR(ctx, 10 + i * 15, 9, 12, 7, 2, i < cells ? P.mint : "rgba(20,26,51,0.5)");
          fillRR(ctx, 22 + i * 15, 11, 1.6, 3, 0.8, i < cells ? P.mint : "rgba(20,26,51,0.5)");
        }
      };

      const drawBunny = (h: Bunny, t: number) => {
        const x = sx(h.x + h.w / 2), y = (h.y + h.h) * B, s = B / 20;
        if (h.state === "gone") {
          if (h.poof > 0) glow(ctx, x, y - 9 * s, 30 * s * (1.4 - h.poof), FUR_LIGHT, 0.45 * h.poof);
          return;
        }
        const q = h.charge, wind = h.state === "charge" ? h.wind : 0, napping = h.state === "nap", happy = h.state === "giggle" || h.state === "leave";
        const hopK = Math.abs(Math.sin(h.walkT * 0.7));
        const lift = hopK * 3 * s;
        const squash = napping ? 0.8 + (calm ? 0 : Math.sin(t * 2) * 0.03) : 1 + (hopK - 0.5) * 0.08;
        const r = 7.5 * s * (1 + q * 0.18 + (wind ? Math.sin(wind * (8 + wind * 14)) * 0.04 * Math.min(1, wind) : 0));
        const cy = -r * squash;
        ctx.save();
        ctx.translate(x, y - lift);
        ctx.scale(h.face, 1);
        // ears flop when relaxed and stand straight up once the fur is full of static
        const flop = napping ? 1.1 : lerp(0.55, 0, q);
        for (const [ex, tilt] of [[-2.2 * s, -0.2 - flop], [2.4 * s, 0.15 + flop * 0.3]]) {
          ctx.save();
          ctx.translate(ex, cy - r * 0.7);
          ctx.rotate(tilt);
          fillRR(ctx, -2 * s, -9 * s, 4 * s, 10 * s, 2 * s, FUR_DARK);
          fillRR(ctx, -1 * s, -7.5 * s, 2 * s, 7 * s, 1 * s, "#ffb8cc");
          if (q > 0.8 && !napping) circle(ctx, 0, -9 * s, 1.2 * s, SPARK[0]);
          ctx.restore();
        }
        circle(ctx, -r * 0.95, cy + r * 0.2, 2.8 * s, FUR_LIGHT);
        // a fuzzy edge of tufts that stand further out as static builds up
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + hash(i * 3.3) * 0.3;
          const out = r * (0.9 + q * 0.24 * (0.6 + hash(i) * 0.8));
          circle(ctx, Math.cos(a) * out, cy + Math.sin(a) * out * squash, (2.2 + q * 1.2) * s, FUR_DARK);
        }
        ctx.beginPath();
        ctx.ellipse(0, cy, r, r * squash, 0, 0, Math.PI * 2);
        ctx.fillStyle = rad(ctx, -r * 0.3, cy - r * 0.4, r * 1.6, [[0, FUR_LIGHT], [1, FUR]]);
        ctx.fill();
        fillRR(ctx, -4.5 * s, -2 * s, 3.6 * s, 2.2 * s, 1.1 * s, FUR_LIGHT);
        fillRR(ctx, 1.5 * s, -2 * s, 3.6 * s, 2.2 * s, 1.1 * s, FUR_LIGHT);
        // face
        const ey = cy - r * 0.12;
        if (napping) {
          line(ctx, [[1.2 * s, ey], [3.2 * s, ey]], 1 * s, P.night);
          line(ctx, [[4.6 * s, ey], [6.6 * s, ey]], 1 * s, P.night);
        } else if (happy) {
          ctx.lineWidth = 1 * s; ctx.lineCap = "round"; ctx.strokeStyle = P.night;
          for (const ex of [2.2 * s, 5.6 * s]) { ctx.beginPath(); ctx.arc(ex, ey + 0.6 * s, 1.2 * s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        } else {
          for (const ex of [2.2 * s, 5.6 * s]) { circle(ctx, ex, ey, 1.4 * s, P.night); circle(ctx, ex - 0.4 * s, ey - 0.5 * s, 0.5 * s, "#ffffff"); }
        }
        circle(ctx, 7.2 * s, ey + 2 * s, 1 * s, "#ff8fae");
        circle(ctx, 1.4 * s, ey + 2.7 * s, 1.4 * s, "rgba(255,143,174,0.35)");
        if (wind) {
          const fl = Math.sin(wind * (10 + wind * 18)) > 0 ? 0.5 : 0;
          if (fl) { ctx.beginPath(); ctx.ellipse(0, cy, r, r * squash, 0, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,250,214,${fl})`; ctx.fill(); }
        }
        ctx.restore();
        // crackles around the fur once it is charged; they hold still under reduced motion
        if (q > 0.35 && !napping) {
          const n = Math.round(q * 4) + (wind ? 3 : 0), tick = calm ? 0 : Math.floor(t * 12), by = y - lift + cy;
          for (let i = 0; i < n; i++) {
            const a = hash(i * 7.7 + tick * 1.3) * Math.PI * 2, d0 = r * 1.15, d1 = r * (1.5 + hash(i + tick) * 0.3);
            const ca = Math.cos(a), sa = Math.sin(a), kink = 1.6 * s;
            line(ctx, [[x + ca * d0, by + sa * d0], [x + ca * (d0 + d1) / 2 - sa * kink, by + sa * (d0 + d1) / 2 + ca * kink], [x + ca * d1, by + sa * d1]], 1.2, SPARK[i % 2]);
          }
        }
        if (wind) text(ctx, "bzzt", x, y - 32 * s - Math.min(1, wind) * 4, 9, withAlpha(P.cream, 0.85), { weight: 600 });
      };

      // short zigzag sparks from the bunny to each block it popped loose
      const drawArcs = (t: number, dt: number) => {
        for (let i = arcs.length - 1; i >= 0; i--) {
          const a = arcs[i];
          a.life -= dt;
          if (a.life <= 0) { arcs.splice(i, 1); continue; }
          const k = clamp(a.life / ARC_LIFE), tick = calm ? 0 : Math.floor(t * 30), pts: [number, number][] = [];
          for (let j = 0; j <= 6; j++) {
            const u = j / 6, jit = j === 0 || j === 6 ? 0 : (hash(a.seed + j * 1.7 + tick) - 0.5) * B * 0.6;
            pts.push([sx(lerp(a.x0, a.x1, u)) + jit, lerp(a.y0, a.y1, u) * B - jit * 0.6]);
          }
          line(ctx, pts, 4, withAlpha(SPARK[1], 0.45 * k));
          line(ctx, pts, 1.6, withAlpha("#fffbe0", k));
        }
      };

      const slotXY = (i: number) => {
        const sw = 30, gap = 4, total = 5 * sw + 4 * gap;
        return { x: (W - total) / 2 + i * (sw + gap), y: H - sw - 8, sw };
      };
      const drawHud = (t: number, dt: number, light: number) => {
        void light; void t;
        for (let i = 0; i < 5; i++) {
          const { x, y, sw } = slotXY(i);
          bumpS[i] = Math.max(0, bumpS[i] - dt * 3);
          const g = bumpS[i] * 3;
          fillRR(ctx, x - g, y - g, sw + g * 2, sw + g * 2, 7, i === sel ? "rgba(246,236,220,0.88)" : "rgba(20,26,51,0.62)");
          if (shown[i] > 0 || i === 4) {
            ctx.save();
            ctx.globalAlpha = shown[i] > 0 ? 1 : 0.3;
            ctx.beginPath(); ctx.roundRect(x + 7, y + 7, 16, 16, 3); ctx.clip();
            drawBlock(ctx, SLOT_ICON[i], x + 7, y + 7, 16, i + 1, [3, 3, 3, 3]);
            ctx.restore();
          }
          if (shown[i] > 0) text(ctx, String(shown[i]), x + sw - 5, y + sw - 6, 9, i === sel ? P.night : P.cream, { weight: 700, align: "right" });
        }
        for (let i = flies.length - 1; i >= 0; i--) {
          const fl = flies[i];
          fl.t += dt / 0.5;
          const { x: tx, y: ty } = slotXY(fl.slot);
          const k = clamp(fl.t), e = 1 - Math.pow(1 - k, 2);
          const px = lerp(fl.x, tx + 7, e), py = lerp(fl.y, ty + 7, e) - Math.sin(k * Math.PI) * 40;
          const z = lerp(B * 0.6, 16, k);
          ctx.save(); ctx.translate(px, py); ctx.rotate(k * 3);
          drawBlock(ctx, fl.icon, -z / 2, -z / 2, z, 5, [3, 3, 3, 3]);
          ctx.restore();
          if (fl.t >= 1) { flies.splice(i, 1); shown[fl.slot]++; bumpS[fl.slot] = 1; }
        }
      };

      ws.raf((t, dt) => {
        const STEP = 1 / 120;
        let left = dt;
        while (left > 1e-6) { const d = Math.min(STEP, left); sim(d); left -= d; }
        swing = Math.max(0, swing - dt * 5);
        draw(t, dt);
      });

      // ---- the robot's plan ----------------------------------------------------------
      let handling = false;
      const rc = () => R.x + R.w / 2;
      const feetRow = () => Math.floor(R.y + R.h - 0.01);
      const check = () => {
        if (dead) throw new Dead();
        if (host.stopped) throw new Halt();
        if (hurtNow) {
          hurtNow = false;
          // a zap in the middle of the job can be the last straw
          if (chance(0.1 + 0.2 * (1 - skill))) throw new Quit();
          host.react(chance(0.5) ? "angry" : "surprised");
        }
      };
      // a bunny the robot can still deal with: around, not napping, not already on its way
      const pesky = (h: Bunny | null): h is Bunny => !!h && !h.night && (h.state === "hop" || h.state === "charge" || h.state === "giggle");
      const beat = async (ms: number) => {
        await nap(host, ms);
        check();
        if (pesky(bun) && !handling) return handleBunny();
        return false;
      };
      // Two gentle pats ground the static. The calm bunny leaves a spark crystal behind.
      const handleBunny = async (): Promise<boolean> => {
        const h = bun!;
        const d = Math.hypot(h.x - R.x, h.y - R.y);
        if (!h.noticed) {
          if (d > h.spot) return false;
          h.noticed = true;
          host.react("surprised");
        }
        handling = true;
        const prev = status;
        setStatus("Static bunny!");
        R.goal = null; R.want = 0;
        try {
          let tries = 0;
          while (bun === h && pesky(h) && h.pets < 2 && tries < 8) {
            check();
            const dx = h.x + h.w / 2 - rc(), dist = Math.abs(dx);
            if (dist > 3.4) { await nap(host, 160); tries += 0.25; continue; }
            if (dist > 1.5) { R.goal = rc() + dx - Math.sign(dx) * 1.1; await nap(host, 140); tries += 0.25; continue; }
            R.goal = null;
            R.face = Math.sign(dx) || 1;
            petting = true;
            await host.pointAt(f.aim(sx(h.x + h.w / 2), (h.y + h.h / 2) * B, B, B), 0.5, 0.5, 260);
            check();
            swing = 0.5;
            await host.click();
            tries++;
            if (bun === h && pesky(h) && Math.random() < 0.45 + 0.45 * skill) {
              h.pets++;
              h.charge = Math.max(0, h.charge - 0.6);
              h.state = "giggle"; h.stun = 0.7; h.wind = 0; h.vy = -4;
              fluff(h.x + 0.45, h.y + 0.3, 6);
              // the static drains into the ground as falling sparks
              burst(h.x + 0.45, h.y + 0.6, 5, SPARK, 2, 22);
              if (h.pets >= 2) {
                h.away = Math.sign(h.x - R.x) || 1; h.leaveT = 0;
                inv[4]++;
                flies.push({ t: 0, x: sx(h.x + 0.45), y: (h.y + 0.45) * B, slot: 4, icon: CRYSTAL });
                host.react("cheer");
              }
            }
            await nap(host, 260);
          }
        } finally {
          handling = false;
          petting = false;
          R.goal = null;
          setStatus(prev);
        }
        check();
        return true;
      };

      const walkTo = async (tx: number, near = 0.12) => {
        let lastX = R.x, lastMove = performance.now(), tapT = 0, unsticks = 0;
        tx = clamp(tx, 0.5, COLS - 0.5);
        for (;;) {
          check();
          const dx = tx - rc();
          if (Math.abs(dx) <= near) break;
          R.goal = tx;
          const now = performance.now();
          if (now - tapT > 300) { host.tap(dx > 0 ? "d" : "a"); tapT = now; }
          const handled = await beat(80);
          if (handled) { lastMove = performance.now(); continue; }
          if (R.goal === null && Math.abs(tx - rc()) <= 0.2) break;
          if (Math.abs(R.x - lastX) > 0.06) { lastX = R.x; lastMove = performance.now(); }
          else if (performance.now() - lastMove > 650) {
            R.goal = null;
            if (++unsticks > 5) break;
            await unstick(Math.sign(dx));
            lastMove = performance.now(); lastX = R.x;
          }
        }
        R.goal = null;
      };
      const unstick = async (dir: number) => {
        const c = Math.floor(rc()) + dir, fr = feetRow();
        if (solidAt(c, fr - 1)) await mine(c, fr - 1);
        if (solidAt(c, fr) && solidAt(c, fr - 2)) await mine(c, fr - 2);
        if (solidAt(Math.floor(rc()), fr - 2)) await mine(Math.floor(rc()), fr - 2);
        if (solidAt(c, fr) && solidAt(c, fr - 1)) await mine(c, fr);
      };

      const give = (t: number, c: number, r: number) => {
        const slot = SLOT_OF[t];
        if (slot === undefined) return;
        inv[slot]++;
        flies.push({ t: 0, x: sx(c + 0.5), y: (r + 0.5) * B, slot, icon: t === GRASS ? DIRT : t === STONE ? BRICK : t });
        if (slot === 4 && t !== COAL) host.react("cheer");
      };
      const mine = async (c: number, r: number): Promise<boolean> => {
        check();
        const t = get(c, r);
        if (!solid(t) || t === CORE) return false;
        const d = Math.hypot(c + 0.5 - rc(), r + 0.5 - (R.y + 0.5));
        if (d > REACH) {
          await walkTo(c + 0.5 + (c + 0.5 > rc() ? -1.6 : 1.6), 0.4);
          if (Math.hypot(c + 0.5 - rc(), r + 0.5 - (R.y + 0.5)) > REACH + 0.5) return false;
        }
        R.face = c + 0.5 >= rc() ? 1 : -1;
        await host.pointAt(f.aim(sx(c + 0.5), r * B + B / 2, B, B), 0.5, 0.5, 300);
        check();
        const hits = Math.max(2, Math.ceil((HARD[t] ?? 1) / 0.2));
        crack = { c, r, p: 0 };
        for (let i = 0; i < hits; i++) {
          swing = 1;
          await host.click();
          if (!crack || crack.c !== c || crack.r !== r) crack = { c, r, p: i / hits };
          crack.p = (i + 1) / hits;
          burst(c + 0.5, r + 0.5, 2, [BASE[t], "#f6ecdc"], 3);
          const handled = await beat(70 + Math.random() * 40);
          if (get(c, r) !== t) { crack = null; return false; }
          if (handled) {
            await host.pointAt(f.aim(sx(c + 0.5), r * B + B / 2, B, B), 0.5, 0.5, 260);
          }
        }
        crack = null;
        if (get(c, r) !== t) return false;
        setBlock(c, r, AIR);
        burst(c + 0.5, r + 0.5, 8, [BASE[t], "#f6ecdc", BASE[t]], 5);
        give(t, c, r);
        await beat(90);
        return true;
      };
      const place = async (c: number, r: number, slot: number): Promise<boolean> => {
        check();
        if (inv[slot] <= 0) return false;
        if (solidAt(c, r)) return true;
        const hasNeighbour = solidAt(c - 1, r) || solidAt(c + 1, r) || solidAt(c, r - 1) || solidAt(c, r + 1);
        if (!hasNeighbour) return false;
        // never place inside the robot
        if (c + 1 > R.x && c < R.x + R.w && r + 1 > R.y && r < R.y + R.h) return false;
        if (sel !== slot) { sel = slot; host.tap(String(slot + 1)); bumpS[slot] = 0.6; await beat(160); }
        R.face = c + 0.5 >= rc() ? 1 : -1;
        holding = slot;
        await host.pointAt(f.aim(sx(c + 0.5), r * B + B / 2, B, B), 0.5, 0.5, 280);
        check();
        swing = 0.6;
        await host.click();
        if (solidAt(c, r)) { holding = -1; return true; }
        setBlock(c, r, PLACE_AS[slot]);
        inv[slot]--; shown[slot] = Math.max(0, shown[slot] - 1);
        flashes.push({ c, r, t: 1 });
        burst(c + 0.5, r + 0.9, 3, ["#f6ecdc"], 2);
        await beat(110);
        holding = -1;
        return true;
      };

      const chop = async (tc: number) => {
        const s = world.surf[tc];
        const side = rc() < tc + 0.5 ? -1 : 1;
        await walkTo(tc + 0.5 + side * 1.1, 0.25);
        for (let r = s - 1; r >= 0 && r > s - 7; r--) {
          if (get(tc, r) !== LOG) break;
          await mine(tc, r);
        }
        // a couple of leaves within reach
        const leaves: [number, number][] = [];
        for (let r = s - 7; r < s; r++) for (let c = tc - 2; c <= tc + 2; c++) if (get(c, r) === LEAF && Math.hypot(c + 0.5 - rc(), r + 0.5 - R.y) < REACH - 0.5) leaves.push([c, r]);
        leaves.sort((a, b) => b[1] - a[1]);
        for (const [c, r] of leaves.slice(0, 2 + Math.floor(Math.random() * 2))) await mine(c, r);
      };

      const total = () => inv[0] + inv[1] + inv[2] + inv[3];
      const dig = async () => {
        // a staircase going down, away from the hut
        const dir = chance(0.5) ? 1 : -1;
        const startC = dir > 0 ? site + 7 : site - 3;
        const okSide = (c: number) => c > 2 && c < COLS - 6 && ![0, 1, 2, 3].some((k) => get(c + dir * k, world.sh) === WATER || get(c + dir * k, world.sh - 1) === WATER);
        const d = okSide(startC) ? dir : -dir;
        const c0 = d > 0 ? site + 7 : site - 3;
        await walkTo(c0 - d + 0.5, 0.2);
        for (let k = 0; k < 4; k++) {
          if (total() >= 15 && k >= 2) break;
          if (S.left < 22000) break;
          const c = Math.floor(rc()) + d, fr = feetRow();
          for (const r of [fr - 1, fr, fr + 1]) if (solidAt(c, r)) await mine(c, r);
          // dig into any shiny ore beside the stairs
          await walkTo(c + 0.5, 0.15);
          await beat(200);
          const fr2 = feetRow();
          for (let r = fr2 - 2; r <= fr2 + 2; r++) for (let cc2 = c - 2; cc2 <= c + 2; cc2++) {
            const g = get(cc2, r);
            if ((g === COPPER || g === CRYSTAL || g === COAL) && Math.hypot(cc2 + 0.5 - rc(), r + 0.5 - R.y) < 3) await mine(cc2, r);
          }
        }
        host.react("focus");
      };

      const build = async () => {
        const g = world.sh; // floor row (top of the ground)
        await walkTo(site + 2.5, 0.15);
        // patch the floor and clear the inside first
        for (let c = site; c <= site + 4; c++) if (!solidAt(c, g)) { if (!(await place(c, g, inv[0] > 0 ? 0 : inv[1] > 0 ? 1 : 2))) break; }
        for (let r = g - 3; r <= g - 1; r++) for (let c = site + 1; c <= site + 3; c++) if (solidAt(c, r)) await mine(c, r);
        const pickSlot = (pref: number[]) => pref.find((s) => inv[s] > 0) ?? -1;
        const wall: [number, number][] = [];
        for (let r = g - 1; r >= g - 3; r--) { wall.push([site, r]); wall.push([site + 4, r]); }
        let placed = 0;
        for (const [c, r] of wall) {
          const s = pickSlot([1, 0, 2, 3]);
          if (s < 0) break;
          if (await place(c, r, s)) placed++;
        }
        const roof: number[] = [site, site + 1, site + 2, site + 3, site + 4, site - 1, site + 5];
        for (const c of roof) {
          const s = pickSlot([2, 3, 1, 0]);
          if (s < 0) break;
          if (await place(c, g - 4, s)) placed++;
        }
        return placed;
      };

      // ---- run ----
      setStatus("Chopping wood");
      host.react("focus");
      await beat(900);
      try {
        const trees = [...world.trees].sort((a, b) => Math.abs(a - site) - Math.abs(b - site));
        for (const tc of trees.slice(0, 2)) {
          if (inv[2] >= 4 || S.left < 32000) break;
          await chop(tc);
        }
        setStatus("Digging");
        if (S.left > 26000) await dig();
        phase = "build";
        bunnyPlan.length = 0;
        if (pesky(bun)) await waitFor(() => !pesky(bun), 4000);
        setStatus("Building a hut");
        dayRate = Math.max(dayRate, (0.56 - dayT) / 12);
        const placed = await build();
        if (S.timeUp && placed < 11) return "time";
        // night falls; sleep it off inside
        phase = "sleep";
        setStatus("Night");
        await walkTo(site + 2.5, 0.15);
        const sealed = solidAt(site, world.sh - 1) && solidAt(site + 4, world.sh - 1) && solidAt(site + 2, world.sh - 4);
        dayRate = 0.05;
        await waitFor(() => dayT >= 0.56, 3500);
        if (sealed && chance(0.6)) spawnBunny(true);
        host.react("relax");
        sleeping = true;
        dayT = Math.max(dayT, 0.56);
        await waitFor(() => dayT >= 1.02, 9000);
        sleeping = false;
        if (napped) host.react("laugh");
        await nap(host, 500);
        host.react("cheer");
        setStatus("Morning");
        f.showOver("Good morning", napped ? "A static bunny napped by the door all night" : placed >= 13 ? "Cozy hut built, night survived" : "A small hut, but it held", "good");
        await nap(host, 2600);
        return "win";
      } catch (e) {
        if (e instanceof Quit) {
          crack = null;
          setStatus("Nope");
          host.react("angry");
          await nap(host, 700);
          return "quit";
        }
        if (!(e instanceof Dead)) throw e;
        crack = null;
        setStatus("Rebooting");
        host.react("surprised");
        await nap(host, 1300);
        f.showOver("Static overload", "One zap too many. Time for a reboot", "bad");
        await nap(host, 1600);
        return "dead";
      }

      async function waitFor(cond: () => boolean, max: number) {
        const t0 = performance.now();
        while (!cond() && performance.now() - t0 < max) { await nap(host, 80); if (host.stopped) throw new Halt(); }
      }
    }
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
