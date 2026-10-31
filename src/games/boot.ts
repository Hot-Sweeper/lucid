// BOOT: Knee-Deep in the Kernel. A tiny raycaster shooter in the classic style: the robot
// fights through a server base full of hellbots, grabs the blue keycard and flips the exit
// switch. Hellbots pop into bolts and sparks. The sim (Run) is plain data and maths; the
// renderer writes a low-res pixel buffer that CSS scales up.
import "./games.css";
import "./boot.css";
import { Scope, Session, Halt, mountFrame, nap, think, clamp, gauss, rng, reducedMotion, type FunHost, type FunOpts, type Outcome } from "./kit";

type ReactKind = Parameters<FunHost["react"]>[0];

// ---- level ----------------------------------------------------------------------------

const MAP = [
  "#########################",
  "##########CCCCCCCCC######",
  "##########.........C#####",
  "#########X.........C#####",
  "#########X..R...R..C#####",
  "#########X.........C#####",
  "##########.........C#####",
  "#########CCCCC.CCCCC#####",
  "##############.##########",
  "##############.##########",
  "#########BBBBBLBBBBB#####",
  "#########B.........BRRRRR",
  "#########B.........B....R",
  "#########B..R...R..B....R",
  "#.....###B.........D....R",
  "#.....###B.........B....R",
  "#.....D.....R...R..B....R",
  "#.....###B.........BRRRRR",
  "#.....###B.........B#####",
  "#########################",
];
const MW = MAP[0].length, MH = MAP.length;
const TECH = 1, RACK = 2, BRICK = 3, CIRC = 4, DOOR = 5, BDOOR = 6, EXIT = 7;
const CODE: Record<string, number> = { ".": 0, "#": TECH, R: RACK, B: BRICK, C: CIRC, D: DOOR, L: BDOOR, X: EXIT };
const BASE = new Uint8Array(MW * MH);
MAP.forEach((row, y) => { for (let x = 0; x < MW; x++) BASE[y * MW + x] = CODE[row[x]] ?? TECH; });
const LIGHT = new Uint8Array(MW * MH);
for (let i = 0; i < LIGHT.length; i++) LIGHT[i] = ((i % MW) * 3 + ((i / MW) | 0) * 5) % 7 === 0 ? 1 : 0;
const DOORS: number[] = [];
BASE.forEach((c, i) => { if (c === DOOR || c === BDOOR) DOORS.push(i); });
const NB = [-1, 1, -MW, MW];
const START = { x: 3.5, y: 16.5, a: 0 };
const EXIT_CELL = 4 * MW + 10;
const BLUE_CELL = 10 * MW + 14;
const isDoor = (c: number) => c === DOOR || c === BDOOR;

interface Spec { name: string; hp: number; speed: number; rad: number; range: number; keep: number; cd: [number, number]; dmg: [number, number]; w: number; h: number; z: number; shot: number }
const SPEC: Spec[] = [
  { name: "a Glitch Imp", hp: 30, speed: 1.45, rad: 0.3, range: 7.5, keep: 2.6, cd: [1.1, 1.9], dmg: [12, 20], w: 0.64, h: 0.84, z: 0, shot: 0 },
  { name: "a Chomper", hp: 50, speed: 2.3, rad: 0.38, range: 0.95, keep: 0, cd: [0.9, 1.25], dmg: [11, 19], w: 0.92, h: 0.8, z: 0, shot: -1 },
  { name: "a Cache Orb", hp: 60, speed: 1.0, rad: 0.38, range: 8.5, keep: 3.6, cd: [1.6, 2.5], dmg: [18, 28], w: 0.8, h: 0.8, z: 0.3, shot: 1 },
];
const SHOT_SPEED = [4.8, 3.4];
const FOES: [number, number, number][] = [[0, 17.5, 11.5], [0, 15.5, 17.5], [0, 13.5, 11.5], [1, 21.5, 13.5], [2, 14.5, 2.5], [0, 11.5, 5.5], [1, 16.5, 2.5]];
const KIT = 0, CELL = 1, KEY = 2, PLATE = 3;
const ITEMS: [number, number, number][] = [[PLATE, 2.5, 14.5], [KIT, 10.5, 11.5], [CELL, 17.5, 17.5], [KEY, 22.5, 14.5], [CELL, 22.5, 12.5], [KIT, 17.5, 5.5], [CELL, 10.5, 2.5]];
const ITEM_MSG = ["Picked up a repair kit.", "Picked up an energy cell.", "Picked up a blue keycard.", "Picked up armor plating."];
const ITEM_SIZE: [number, number][] = [[0.36, 0.28], [0.24, 0.32], [0.3, 0.2], [0.38, 0.34]];
const SKILLS = ["Too young to reboot", "Hey, not too rough on my RAM", "Hurt me plenty of bits", "Ultra-voltage", "Kernel panic!"];
const SKILL_DMG = [1.2, 1.4, 1.6, 2, 2.6];
const BIT_NUT = 0, BIT_BOLT = 1, BIT_SPARK = 2, BIT_GEAR = 3, BIT_POP = 4, BIT_ZAP = 5;

// ---- the sim ---------------------------------------------------------------------------

interface Foe { kind: number; x: number; y: number; hp: number; alive: boolean; awake: boolean; cd: number; pain: number; flash: number; atk: number; bite: number; anim: number; seen: boolean; noticeAt: number; side: number; sideT: number }
interface Item { kind: number; x: number; y: number; taken: boolean }
interface Shot { on: boolean; x: number; y: number; vx: number; vy: number; kind: number; dmg: number; from: Foe | null; rolled: boolean; age: number }
interface Bit { on: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; tex: number; life: number; size: number; grav: number }
interface Ev { tap(k: string): void; react(k: ReactKind): void; msg(s: string): void }

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

class Run {
  grid = BASE.slice();
  open = new Float32Array(MW * MH);
  going = new Uint8Array(MW * MH);
  x = START.x; y = START.y; a = START.a; vx = 0; vy = 0; av = 0;
  hp = 100; armor = 0; ammo = 35; key = false; dead = false; eyeZ = 0.5;
  t = 0; fireT = 9; cool = 0; hurtT = 0; hurtSide = 0; gotT = 0; walk = 0; speed = 0;
  kills = 0; got = 0; end: "" | "win" | "dead" = ""; killer = ""; exitOn = false; winT = 0;
  foes: Foe[]; items: Item[]; shots: Shot[] = []; bits: Bit[] = [];
  private path = new Int16Array(MW * MH); private plen = 0; private pi = 0; private goal = -1;
  private df = new Int16Array(MW * MH); private dfT = 0;
  private rd = new Int16Array(MW * MH); private prev = new Int16Array(MW * MH); private q = new Int16Array(MW * MH);
  private planT = 0; private needPlan = true; private waiting = false;
  private aimErr = 0; private aimT = 0; private strafe = 1; private strafeT = 0; private target: Foe | null = null;
  private back = false; private triedBlue = false; private wantBlue: boolean;
  private stuckT = 0; private sx = 0; private sy = 0; private jiggle = 0;
  private taps: Record<string, number> = {}; private lastTap = -9; private lastShock = -9;
  private readonly aimSd: number; private readonly react0: number;

  constructor(readonly skill: number, readonly diff: number, private ev: Ev) {
    this.foes = FOES.map(([kind, x, y]) => ({ kind, x, y, hp: SPEC[kind].hp, alive: true, awake: false, cd: 1, pain: 0, flash: 0, atk: 0, bite: 0, anim: Math.random() * 4, seen: false, noticeAt: 0, side: 1, sideT: 0 }));
    this.items = ITEMS.map(([kind, x, y]) => ({ kind, x, y, taken: false }));
    for (let i = 0; i < 24; i++) this.shots.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, kind: 0, dmg: 0, from: null, rolled: false, age: 0 });
    for (let i = 0; i < 160; i++) this.bits.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tex: 0, life: 0, size: 0.1, grav: 9 });
    this.aimSd = 0.11 - 0.085 * skill;
    this.react0 = 0.85 - 0.6 * skill;
    this.wantBlue = Math.random() < 0.65 - 0.4 * skill;
    this.sx = this.x; this.sy = this.y;
  }

  // ---- grid helpers ----
  cell(x: number, y: number) { const cx = Math.floor(x), cy = Math.floor(y); return cx < 0 || cy < 0 || cx >= MW || cy >= MH ? -1 : cy * MW + cx; }
  private blocksMove(i: number) { if (i < 0) return true; const c = this.grid[i]; return c !== 0 && !(isDoor(c) && this.open[i] > 0.92); }
  private blocksSight(i: number) { if (i < 0) return true; const c = this.grid[i]; return c !== 0 && !(isDoor(c) && this.open[i] > 0.55); }
  private free(x: number, y: number, r: number) {
    return !this.blocksMove(this.cell(x - r, y - r)) && !this.blocksMove(this.cell(x + r, y - r)) && !this.blocksMove(this.cell(x - r, y + r)) && !this.blocksMove(this.cell(x + r, y + r));
  }
  private los(x0: number, y0: number, x1: number, y1: number) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2);
    for (let i = 1; i < n; i++) { const k = i / n; if (this.blocksSight(this.cell(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k))) return false; }
    return true;
  }
  private clear(x0: number, y0: number, x1: number, y1: number, r: number) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2));
    for (let i = 1; i <= n; i++) { const k = i / n; if (!this.free(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, r)) return false; }
    return true;
  }
  private rayDist(a: number) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let mx = Math.floor(this.x), my = Math.floor(this.y);
    const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
    const stx = dx < 0 ? -1 : 1, sty = dy < 0 ? -1 : 1;
    let sdx = dx < 0 ? (this.x - mx) * ddx : (mx + 1 - this.x) * ddx;
    let sdy = dy < 0 ? (this.y - my) * ddy : (my + 1 - this.y) * ddy;
    for (let k = 0; k < 64; k++) {
      let d: number;
      if (sdx < sdy) { d = sdx; sdx += ddx; mx += stx; } else { d = sdy; sdy += ddy; my += sty; }
      if (mx < 0 || my < 0 || mx >= MW || my >= MH || this.blocksSight(my * MW + mx)) return d;
    }
    return 40;
  }
  private moveBy(o: { x: number; y: number }, dx: number, dy: number, r: number) {
    let moved = false;
    if (this.free(o.x + dx, o.y, r)) { o.x += dx; moved = true; }
    if (this.free(o.x, o.y + dy, r)) { o.y += dy; moved = true; }
    return moved;
  }
  private bfs(from: number, pass: (i: number) => boolean, dist: Int16Array, prev: Int16Array | null) {
    dist.fill(-1);
    if (from < 0) return;
    const q = this.q;
    let h = 0, tl = 0;
    q[tl++] = from; dist[from] = 0;
    while (h < tl) {
      const i = q[h++], x = i % MW;
      for (let k = 0; k < 4; k++) {
        if ((k === 0 && x === 0) || (k === 1 && x === MW - 1)) continue;
        const n = i + NB[k];
        if (n < 0 || n >= MW * MH || dist[n] >= 0 || !pass(n)) continue;
        dist[n] = dist[i] + 1;
        if (prev) prev[n] = i;
        q[tl++] = n;
      }
    }
  }
  private spawnBit(x: number, y: number, z: number, vx: number, vy: number, vz: number, tex: number, life: number, size: number, grav = 9) {
    for (const b of this.bits) {
      if (b.on) continue;
      b.on = true; b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz; b.tex = tex; b.life = life; b.size = size; b.grav = grav;
      return;
    }
  }
  private spray(x: number, y: number, z: number, n: number, tex = BIT_SPARK) {
    for (let i = 0; i < n; i++) this.spawnBit(x, y, z, rnd(-1.2, 1.2), rnd(-1.2, 1.2), rnd(0.5, 2.2), tex, rnd(0.2, 0.45), 0.07, 4);
  }
  private press(k: string, gap: number) {
    if (this.t - (this.taps[k] ?? -9) < gap || this.t - this.lastTap < 0.14) return;
    this.pressNow(k);
  }
  private pressNow(k: string) { this.taps[k] = this.t; this.lastTap = this.t; this.ev.tap(k); }

  // ---- step ----
  step(dt: number) {
    this.t += dt;
    for (const i of DOORS) if (this.going[i] && this.open[i] < 1) this.open[i] = Math.min(1, this.open[i] + dt / 0.75);
    this.fireT += dt; this.cool -= dt; this.hurtT -= dt; this.gotT -= dt;
    this.dfT -= dt;
    if (this.dfT <= 0) { this.dfT = 0.35; this.bfs(this.cell(this.x, this.y), (i) => !this.blocksMove(i), this.df, null); }
    for (const f of this.foes) this.foe(f, dt);
    for (const s of this.shots) {
      if (!s.on) continue;
      s.age += dt;
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      if (this.blocksSight(this.cell(nx, ny)) || s.age > 6) { s.on = false; this.spray(s.x, s.y, 0.4, 3, s.kind ? BIT_ZAP : BIT_SPARK); continue; }
      s.x = nx; s.y = ny;
      if (!this.dead && Math.hypot(this.x - s.x, this.y - s.y) < 0.3) { s.on = false; this.spray(s.x, s.y, 0.4, 4, s.kind ? BIT_ZAP : BIT_SPARK); this.hurt(s.dmg, s.from); }
    }
    for (const b of this.bits) {
      if (!b.on) continue;
      b.life -= dt;
      if (b.life <= 0) { b.on = false; continue; }
      if (b.tex === BIT_POP) continue;
      b.vz -= b.grav * dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (this.blocksMove(this.cell(nx, b.y))) b.vx = -b.vx * 0.4; else b.x = nx;
      if (this.blocksMove(this.cell(b.x, ny))) b.vy = -b.vy * 0.4; else b.y = ny;
      b.z += b.vz * dt;
      if (b.z < 0) { b.z = 0; b.vz = Math.abs(b.vz) > 0.6 ? -b.vz * 0.35 : 0; b.vx *= 0.55; b.vy *= 0.55; }
    }
    if (this.dead) {
      this.eyeZ = Math.max(0.12, this.eyeZ - dt * 0.55);
      this.speed *= 0.9;
      return;
    }
    if (this.exitOn) { this.winT += dt; this.speed *= 0.9; if (this.winT > 0.7) this.end = "win"; return; }
    this.think(dt);
    for (const it of this.items) {
      if (it.taken || Math.hypot(it.x - this.x, it.y - this.y) > 0.5) continue;
      const useful = it.kind === KIT ? this.hp < 100 : it.kind === CELL ? this.ammo < 99 : it.kind === PLATE ? this.armor < 100 : true;
      if (!useful) continue;
      it.taken = true; this.got++; this.gotT = 0.3; this.needPlan = true;
      if (it.kind === KIT) this.hp = Math.min(100, this.hp + 25);
      else if (it.kind === CELL) this.ammo = Math.min(99, this.ammo + 20);
      else if (it.kind === PLATE) this.armor = Math.min(100, this.armor + 50);
      else this.key = true;
      this.ev.msg(ITEM_MSG[it.kind]);
    }
  }

  private hurt(dmg: number, from: Foe | null) {
    if (this.dead || this.end) return;
    let d = Math.round(dmg * this.diff);
    if (this.armor > 0) { const ab = Math.min(this.armor, Math.floor(d / 3)); this.armor -= ab; d -= ab; }
    this.hp = Math.max(0, this.hp - d);
    this.hurtT = 0.35;
    if (from) {
      this.hurtSide = Math.sign(wrap(Math.atan2(from.y - this.y, from.x - this.x) - this.a));
      if (!from.seen) { from.seen = true; from.noticeAt = this.t + this.react0 * 0.6; }
    }
    if (this.hp <= 0) { this.dead = true; this.end = "dead"; this.killer = from ? SPEC[from.kind].name : "a stray spark"; this.ev.react("angry"); }
  }

  private foe(f: Foe, dt: number) {
    if (!f.alive) return;
    f.flash -= dt; f.bite -= dt;
    const sp = SPEC[f.kind];
    const dx = this.x - f.x, dy = this.y - f.y, d = Math.hypot(dx, dy);
    const sees = !this.dead && d < 14 && this.los(f.x, f.y, this.x, this.y);
    if (!f.awake) { if (sees && d < 10) { f.awake = true; f.cd = rnd(0.25, 0.75); } return; }
    if (f.pain > 0) { f.pain -= dt; return; }
    if (this.dead) return;
    if (f.atk > 0) { f.atk -= dt; if (f.atk <= 0) this.launch(f); return; }
    f.cd -= dt;
    let mx = 0, my = 0;
    if (sees) {
      const ux = dx / d, uy = dy / d;
      if (sp.shot < 0) {
        if (d > 0.7) { mx = ux; my = uy; }
        if (d < sp.range && f.cd <= 0) { f.cd = rnd(sp.cd[0], sp.cd[1]); f.bite = 0.3; this.hurt(rnd(sp.dmg[0], sp.dmg[1]), f); }
      } else {
        f.sideT -= dt;
        if (f.sideT <= 0) { f.side = Math.random() < 0.5 ? -1 : 1; f.sideT = rnd(0.8, 1.8); }
        if (d > sp.range * 0.8) { mx = ux; my = uy; }
        else if (d < sp.keep) { mx = -ux * 0.6; my = -uy * 0.6; }
        else { mx = -uy * f.side * 0.55; my = ux * f.side * 0.55; }
        if (f.cd <= 0 && d < sp.range + 1.5) { f.atk = 0.45; f.cd = rnd(sp.cd[0], sp.cd[1]); }
      }
    } else {
      const i = this.cell(f.x, f.y), here = i >= 0 ? this.df[i] : -1;
      if (here > 0) {
        let bn = -1, bv = here;
        for (let k = 0; k < 4; k++) { const n = i + NB[k]; if (n >= 0 && n < MW * MH && this.df[n] >= 0 && this.df[n] < bv) { bv = this.df[n]; bn = n; } }
        if (bn >= 0) {
          const tx = (bn % MW) + 0.5 - f.x, ty = ((bn / MW) | 0) + 0.5 - f.y, tl = Math.hypot(tx, ty) || 1;
          mx = tx / tl; my = ty / tl;
        }
      }
    }
    for (const o of this.foes) {
      if (o === f || !o.alive) continue;
      const ox = f.x - o.x, oy = f.y - o.y, od = Math.hypot(ox, oy);
      if (od < 0.7 && od > 0.001) { mx += (ox / od) * 0.6; my += (oy / od) * 0.6; }
    }
    if (mx || my) { this.moveBy(f, mx * sp.speed * dt, my * sp.speed * dt, 0.26); f.anim += dt * sp.speed * 2.4; }
  }
  private launch(f: Foe) {
    const sp = SPEC[f.kind];
    for (const s of this.shots) {
      if (s.on) continue;
      const a = Math.atan2(this.y - f.y, this.x - f.x) + gauss() * 0.05, v = SHOT_SPEED[sp.shot];
      s.on = true; s.x = f.x + Math.cos(a) * 0.3; s.y = f.y + Math.sin(a) * 0.3; s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v;
      s.kind = sp.shot; s.dmg = rnd(sp.dmg[0], sp.dmg[1]); s.from = f; s.rolled = false; s.age = 0;
      return;
    }
  }

  // ---- the robot ----
  private drive(dt: number, fwd: number, side: number, turnTo: number | null, turnMax: number) {
    if (turnTo !== null) {
      const want = clamp(wrap(turnTo - this.a) * 7, -turnMax, turnMax);
      this.av += (want - this.av) * Math.min(1, dt * 12);
    } else this.av *= 0.8;
    this.a = wrap(this.a + this.av * dt);
    const ca = Math.cos(this.a), sa = Math.sin(this.a), sp = 3.1;
    const tvx = (ca * fwd - sa * side) * sp, tvy = (sa * fwd + ca * side) * sp;
    const k = Math.min(1, dt * 9);
    this.vx += (tvx - this.vx) * k; this.vy += (tvy - this.vy) * k;
    const bx = this.x, by = this.y;
    this.moveBy(this, this.vx * dt, this.vy * dt, 0.24);
    this.speed = Math.hypot(this.x - bx, this.y - by) / Math.max(dt, 1e-4);
    this.walk += this.speed * dt * 3.2;
    if (fwd > 0.3) this.press("w", 0.42); else if (fwd < -0.3) this.press("s", 0.42);
    if (side > 0.3) this.press("d", 0.45); else if (side < -0.3) this.press("a", 0.45);
    if (this.av > 0.7) this.press("ArrowRight", 0.38); else if (this.av < -0.7) this.press("ArrowLeft", 0.38);
  }

  private think(dt: number) {
    let best: Foe | null = null, bd = 99;
    for (const f of this.foes) {
      if (!f.alive) continue;
      const dx = f.x - this.x, dy = f.y - this.y, d = Math.hypot(dx, dy);
      if (d > 14 || !this.los(this.x, this.y, f.x, f.y)) continue;
      if (!f.seen) {
        const off = Math.abs(wrap(Math.atan2(dy, dx) - this.a));
        if ((off < 0.62 && d < 12) || d < 1.8) {
          f.seen = true; f.noticeAt = this.t + this.react0 * rnd(0.75, 1.3);
          if (d < 4.5 && this.t - this.lastShock > 6) { this.lastShock = this.t; this.ev.react("surprised"); }
        }
      }
      if (f.seen && this.t >= f.noticeAt && d < bd) { best = f; bd = d; }
    }
    if (best !== this.target) { this.target = best; if (best) { this.back = Math.random() < 0.3 + 0.6 * this.skill; this.aimT = 0; } }
    if (best && this.ammo > 0) this.fight(best, bd, dt);
    else this.nav(dt);
  }

  private fight(f: Foe, d: number, dt: number) {
    if (this.t >= this.aimT) { this.aimErr = gauss() * this.aimSd; this.aimT = this.t + 0.55; }
    const ang = Math.atan2(f.y - this.y, f.x - this.x) + this.aimErr;
    const off = Math.abs(wrap(ang - this.a));
    if (this.cool <= 0 && d < 13 && (off < 0.05 || (off < 0.16 && Math.random() < dt * (1 - this.skill) * 2))) { this.fire(); this.aimT = this.t; }
    this.strafeT -= dt;
    if (this.strafeT <= 0) { if (Math.random() < 0.6) this.strafe = -this.strafe; this.strafeT = rnd(0.5, 1.3); }
    const ra = -Math.sin(this.a), rb = Math.cos(this.a);
    for (const s of this.shots) {
      if (!s.on || s.rolled) continue;
      const rx = this.x - s.x, ry = this.y - s.y;
      if (Math.hypot(rx, ry) > 4.5) continue;
      s.rolled = true;
      const v = Math.hypot(s.vx, s.vy) || 1, nx = -s.vy / v, ny = s.vx / v;
      const lat = rx * nx + ry * ny;
      if (Math.abs(lat) < 0.6 && rx * s.vx + ry * s.vy > 0 && Math.random() < 0.2 + 0.65 * this.skill) {
        const sg = lat === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(lat);
        this.strafe = (nx * sg * ra + ny * sg * rb) >= 0 ? 1 : -1;
        this.strafeT = 0.8;
      }
    }
    const sp = SPEC[f.kind];
    const fwd = sp.shot < 0 && d < 2.4 && this.back ? -0.9 : d > 6.5 ? 0.55 : 0;
    this.drive(dt, fwd, this.strafe * (0.45 + 0.5 * this.skill), ang, 2.0 + 1.6 * this.skill);
    if (this.speed < 0.25 && this.strafeT < 0.5) { this.strafe = -this.strafe; this.strafeT = rnd(0.5, 1); }
  }

  private fire() {
    this.ammo--; this.cool = 0.32; this.fireT = 0; this.pressNow(" ");
    for (const f of this.foes) {
      if (!f.alive || f.awake) continue;
      const i = this.cell(f.x, f.y), dd = i >= 0 ? this.df[i] : -1;
      if (dd >= 0 && dd < 9) { f.awake = true; f.cd = rnd(0.6, 1.4); }
    }
    const a = this.a + gauss() * 0.012, ca = Math.cos(a), sa = Math.sin(a);
    const wall = this.rayDist(a);
    let hit: Foe | null = null, hd = wall;
    for (const f of this.foes) {
      if (!f.alive) continue;
      const dx = f.x - this.x, dy = f.y - this.y, along = dx * ca + dy * sa;
      if (along < 0.2 || along > hd) continue;
      if (Math.abs(-dx * sa + dy * ca) < SPEC[f.kind].rad) { hit = f; hd = along; }
    }
    if (hit) this.hit(hit, 10 + Math.floor(Math.random() * 7));
    else this.spray(this.x + ca * (wall - 0.06), this.y + sa * (wall - 0.06), 0.42 + gauss() * 0.04, 4);
  }
  private hit(f: Foe, dmg: number) {
    const sp = SPEC[f.kind];
    f.hp -= dmg; f.flash = 0.12; f.awake = true;
    if (!f.seen) { f.seen = true; f.noticeAt = this.t; }
    if (Math.random() < (f.kind === 1 ? 0.3 : 0.5)) f.pain = 0.26;
    this.spray(f.x, f.y, sp.z + sp.h * 0.55, 3);
    if (f.hp > 0) return;
    f.alive = false; this.kills++;
    const zc = sp.z + sp.h * 0.4;
    this.spawnBit(f.x, f.y, zc - 0.3, 0, 0, 0, BIT_POP, 0.26, 0.7, 0);
    for (let i = 0; i < 11; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(0.8, 2.6);
      this.spawnBit(f.x, f.y, zc, Math.cos(a) * v, Math.sin(a) * v, rnd(1.5, 3.8), i % 3 === 0 ? BIT_GEAR : i % 3 === 1 ? BIT_NUT : BIT_BOLT, 999, rnd(0.09, 0.14));
    }
    for (let i = 0; i < 9; i++) this.spawnBit(f.x, f.y, zc, rnd(-2.5, 2.5), rnd(-2.5, 2.5), rnd(1, 3.5), BIT_SPARK, rnd(0.3, 0.6), 0.08, 5);
    if (Math.random() < 0.18) this.ev.react("laugh");
  }

  private nav(dt: number) {
    this.planT -= dt;
    if (this.needPlan || this.planT <= 0) this.plan();
    this.stuckT += dt;
    if (this.stuckT > 2.2) {
      if (Math.hypot(this.x - this.sx, this.y - this.sy) < 0.3 && !this.waiting) { this.jiggle = 0.5; this.strafe = -this.strafe; this.needPlan = true; }
      this.stuckT = 0; this.sx = this.x; this.sy = this.y;
    }
    if (this.jiggle > 0) { this.jiggle -= dt; this.drive(dt, -0.4, this.strafe, null, 2); return; }
    this.waiting = false;
    if (this.pi >= this.plen) { this.atGoal(dt); return; }
    let ci = this.path[this.pi];
    if (isDoor(this.grid[ci]) && this.open[ci] < 0.92) {
      const cx = (ci % MW) + 0.5, cy = ((ci / MW) | 0) + 0.5;
      const ang = Math.atan2(cy - this.y, cx - this.x);
      if (Math.hypot(cx - this.x, cy - this.y) > 1.15) { this.walkTo(cx, cy, dt); return; }
      this.waiting = true;
      this.drive(dt, 0, 0, ang, 2.4);
      if (Math.abs(wrap(ang - this.a)) < 0.2 && !this.going[ci]) this.use(ci);
      return;
    }
    while (this.pi + 1 < this.plen) {
      const n = this.path[this.pi + 1];
      if (!this.clear(this.x, this.y, (n % MW) + 0.5, ((n / MW) | 0) + 0.5, 0.25)) break;
      this.pi++;
    }
    ci = this.path[this.pi];
    const tx = (ci % MW) + 0.5, ty = ((ci / MW) | 0) + 0.5;
    if (Math.hypot(tx - this.x, ty - this.y) < 0.3) this.pi++;
    this.walkTo(tx, ty, dt);
  }
  private walkTo(tx: number, ty: number, dt: number) {
    const ang = Math.atan2(ty - this.y, tx - this.x), off = Math.abs(wrap(ang - this.a));
    this.drive(dt, off < 0.45 ? 1 : off < 1 ? 0.55 : 0.12, 0, ang, 3.4);
  }
  private use(i: number) {
    this.pressNow("e");
    if (this.grid[i] === BDOOR && !this.key) {
      this.ev.msg("You need a blue keycard to open this door.");
      this.triedBlue = true; this.needPlan = true;
      this.ev.react("shy");
      return;
    }
    this.going[i] = 1;
  }
  private atGoal(dt: number) {
    if (this.goal === EXIT_CELL && this.cell(this.x, this.y) === EXIT_CELL) {
      this.drive(dt, 0, 0, Math.PI, 2.2);
      if (Math.abs(wrap(Math.PI - this.a)) < 0.12) { this.pressNow("e"); this.exitOn = true; this.ev.msg("Exit switch flipped."); }
      return;
    }
    this.needPlan = true;
    this.drive(dt, 0, 0, null, 2);
  }
  private plan() {
    this.needPlan = false; this.planT = 1.5;
    const from = this.cell(this.x, this.y);
    const tryBlue = this.wantBlue && !this.triedBlue && !this.key;
    this.bfs(from, (i) => { const c = this.grid[i]; return c === 0 || c === DOOR || (c === BDOOR && (this.key || tryBlue)); }, this.rd, this.prev);
    const nearest = (kind: number, maxD: number) => {
      let bi = -1, bd = maxD + 1;
      for (const it of this.items) {
        if (it.taken || it.kind !== kind) continue;
        const i = this.cell(it.x, it.y), d = this.rd[i];
        if (d >= 0 && d < bd) { bd = d; bi = i; }
      }
      return bi;
    };
    let goal = this.hp < 50 ? nearest(KIT, 40) : this.hp < 85 ? nearest(KIT, 3) : -1;
    if (goal < 0) goal = this.ammo < 12 ? nearest(CELL, 40) : this.ammo < 70 ? nearest(CELL, 3) : -1;
    if (goal < 0 && this.armor < 60) goal = nearest(PLATE, 6);
    if (goal < 0) goal = !this.key ? (tryBlue ? BLUE_CELL : nearest(KEY, 99)) : EXIT_CELL;
    this.goal = goal;
    this.plen = 0; this.pi = 0;
    if (goal < 0 || from < 0 || this.rd[goal] < 0) return;
    let n = 0, i = goal;
    while (i !== from && n < this.q.length) { this.q[n++] = i; i = this.prev[i]; }
    for (let k = 0; k < n; k++) this.path[k] = this.q[n - 1 - k];
    this.plen = n;
  }
}

// ---- pixels ----------------------------------------------------------------------------

interface Tex { w: number; h: number; px: Uint32Array; glow: Uint8Array }
interface Lit { r(x: number, y: number, w: number, h: number, c: string): void; c(x: number, y: number, r: number, c: string): void }
type G = CanvasRenderingContext2D;

const box = (g: G, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const disc = (g: G, x: number, y: number, r: number, c: string) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = c; g.fill(); };

function mk(w: number, h: number, seed: number, paint: (g: G, L: Lit, R: () => number) => void, scale = 1): Tex {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const m = document.createElement("canvas"); m.width = w; m.height = h;
  const mg = m.getContext("2d", { willReadFrequently: true })!;
  mg.fillStyle = "#fff";
  if (scale !== 1) { g.scale(scale, scale); mg.scale(scale, scale); }
  const L: Lit = {
    r: (x, y, ww, hh, col) => { box(g, x, y, ww, hh, col); mg.fillRect(x, y, ww, hh); },
    c: (x, y, r, col) => { disc(g, x, y, r, col); mg.beginPath(); mg.arc(x, y, r, 0, Math.PI * 2); mg.fill(); },
  };
  paint(g, L, rng(seed));
  const d = g.getImageData(0, 0, w, h).data, md = mg.getImageData(0, 0, w, h).data;
  const px = new Uint32Array(w * h), glow = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < 110) continue;
    px[i] = ((255 << 24) | (d[i * 4 + 2] << 16) | (d[i * 4 + 1] << 8) | d[i * 4]) >>> 0;
    glow[i] = md[i * 4 + 3] > 110 ? 1 : 0;
  }
  return { w, h, px, glow };
}
const noise = (g: G, R: () => number, w: number, h: number, n: number, cols: string[]) => {
  for (let i = 0; i < n; i++) box(g, (R() * w) | 0, (R() * h) | 0, 1, 1, cols[(R() * cols.length) | 0]);
};

function paintTech(g: G, L: Lit, R: () => number) {
  box(g, 0, 0, 32, 32, "#596071");
  noise(g, R, 32, 32, 170, ["#525868", "#61697b", "#565c6c"]);
  box(g, 0, 0, 32, 1, "#717a8c"); box(g, 0, 15, 32, 1, "#363b47"); box(g, 0, 16, 32, 1, "#737b8e"); box(g, 0, 31, 32, 1, "#363b47");
  box(g, 15, 0, 1, 15, "#363b47"); box(g, 16, 1, 1, 14, "#6f7789");
  box(g, 7, 17, 1, 14, "#363b47"); box(g, 8, 17, 1, 14, "#6f7789");
  for (const [x, y] of [[2, 2], [12, 2], [19, 2], [29, 2], [2, 12], [12, 12], [19, 12], [29, 12], [3, 19], [28, 19], [3, 28], [28, 28]]) { box(g, x, y, 2, 2, "#8d96a9"); box(g, x + 1, y + 1, 1, 1, "#3a3f4c"); }
  box(g, 18, 20, 10, 8, "#2a2e38");
  for (const r of [21, 23, 25]) box(g, 19, r, 8, 1, "#4a505e");
  box(g, 10, 21, 4, 6, "#3d4250"); L.r(11, 22, 2, 1, "#ffb347");
}
function paintRack(g: G, L: Lit, phase: number) {
  box(g, 0, 0, 32, 32, "#1c1f27");
  box(g, 0, 0, 3, 32, "#3b404e"); box(g, 29, 0, 3, 32, "#3b404e"); box(g, 1, 0, 1, 32, "#555b6b"); box(g, 30, 0, 1, 32, "#2a2e38");
  const cols = ["#4ff0a0", "#4fb6ff", "#ffb347", "#4ff0a0"];
  for (let u = 0; u < 4; u++) {
    const y = 1 + u * 8;
    box(g, 4, y, 24, 6, "#2d323e"); box(g, 4, y, 24, 1, "#474d5d"); box(g, 4, y + 5, 24, 1, "#20242c");
    box(g, 17, y + 2, 9, 2, "#14171d");
    for (let k = 0; k < 4; k++) {
      const on = (u * 3 + k * 5 + phase) % 3 !== 0;
      if (on) L.r(5 + k * 3, y + 2, 2, 2, cols[(u + k) % 4]); else box(g, 5 + k * 3, y + 2, 2, 2, "#26332e");
    }
  }
}
function paintBrick(g: G, L: Lit, R: () => number) {
  box(g, 0, 0, 32, 32, "#3a1611");
  const pal = ["#7d2b1d", "#8a3322", "#73261a", "#913a25"];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 8 : 0;
    for (let bx = -16; bx < 32; bx += 16) {
      const x = bx + off, y = row * 8;
      box(g, x + 1, y + 1, 14, 6, pal[(R() * 4) | 0]);
      box(g, x + 1, y + 1, 14, 1, "#a5492f"); box(g, x + 1, y + 6, 14, 1, "#5b1e15");
    }
  }
  noise(g, R, 32, 32, 60, ["#6a2216", "#9a4228"]);
  for (const [x, y] of [[5, 10], [6, 11], [6, 12], [7, 13], [8, 13], [9, 14], [22, 18], [23, 19], [23, 20], [24, 21], [25, 21], [25, 22], [26, 23], [14, 26], [15, 27], [16, 27], [17, 28]]) L.r(x, y, 1, 1, "#ff7a1f");
  for (const [x, y] of [[6, 11], [24, 21], [15, 27]]) L.r(x, y, 1, 1, "#ffe07a");
}
function paintCircuit(g: G, L: Lit, R: () => number) {
  box(g, 0, 0, 32, 32, "#123327");
  noise(g, R, 32, 32, 90, ["#163a2d", "#0f2c21"]);
  const tr = "#2d7a52";
  box(g, 0, 4, 32, 1, tr); box(g, 0, 27, 20, 1, tr); box(g, 6, 4, 1, 24, tr); box(g, 26, 0, 1, 32, tr); box(g, 6, 15, 4, 1, tr); box(g, 22, 15, 4, 1, tr); box(g, 16, 21, 1, 7, tr);
  for (const [x, y] of [[5, 3], [25, 3], [5, 26], [19, 26], [15, 27], [25, 14]]) box(g, x, y, 3, 3, "#caa442");
  box(g, 10, 9, 12, 12, "#16181e"); box(g, 10, 9, 12, 1, "#2a2e38");
  for (let i = 0; i < 5; i++) { box(g, 8, 10 + i * 2, 2, 1, "#9aa0ad"); box(g, 22, 10 + i * 2, 2, 1, "#9aa0ad"); }
  L.r(24, 23, 2, 2, "#5bff9a"); L.r(12, 11, 1, 1, "#ff5a3a");
}
function paintDoor(g: G, L: Lit, blue: boolean) {
  box(g, 0, 0, 32, 32, "#5e6371");
  for (const y of [3, 11, 19, 27]) { box(g, 4, y, 24, 1, "#4a4e5a"); box(g, 4, y + 1, 24, 1, "#7a7f8e"); }
  for (let y = 0; y < 32; y++) for (const x0 of [0, 28]) for (let x = x0; x < x0 + 4; x++) box(g, x, y, 1, 1, ((x + y) >> 1) % 2 ? "#d9a93a" : "#2a2a2e");
  box(g, 12, 5, 8, 4, "#1a2130"); box(g, 13, 6, 3, 1, "#4a6a8a");
  if (blue) {
    L.r(6, 4, 2, 24, "#3a7aff"); L.r(24, 4, 2, 24, "#3a7aff");
    box(g, 13, 14, 6, 8, "#22252e"); L.r(15, 16, 2, 2, "#6fb0ff"); L.r(14, 20, 4, 1, "#3a7aff");
  } else box(g, 13, 15, 6, 4, "#454a56");
}
function paintExit(g: G, L: Lit, R: () => number, on: boolean) {
  paintTech(g, L, R);
  box(g, 4, 2, 24, 10, "#141418");
  const F: Record<string, string[]> = { E: ["111", "100", "110", "100", "111"], X: ["101", "101", "010", "101", "101"], I: ["111", "010", "010", "010", "111"], T: ["111", "010", "010", "010", "010"] };
  const col = on ? "#5bff8a" : "#ff4436";
  "EXIT".split("").forEach((ch, li) => F[ch].forEach((row, r) => row.split("").forEach((b, c) => { if (b === "1") L.r(9 + li * 4 + c, 4 + r, 1, 1, col); })));
  box(g, 9, 15, 14, 14, "#353a46"); box(g, 9, 15, 14, 1, "#59606f"); box(g, 15, 17, 2, 10, "#16181e");
  if (!on) { box(g, 15, 17, 2, 5, "#c3c8d4"); L.r(13, 16, 6, 3, "#ff4436"); }
  else { box(g, 15, 22, 2, 5, "#c3c8d4"); L.r(13, 25, 6, 3, "#5bff8a"); }
}
function paintFloor(g: G, _L: Lit, R: () => number) {
  box(g, 0, 0, 32, 32, "#2b2c33");
  noise(g, R, 32, 32, 80, ["#27282e", "#303139"]);
  box(g, 0, 0, 32, 1, "#1d1e23"); box(g, 0, 16, 32, 1, "#1d1e23"); box(g, 0, 0, 1, 32, "#1d1e23"); box(g, 16, 0, 1, 32, "#1d1e23");
  box(g, 1, 1, 15, 1, "#3a3c45"); box(g, 17, 17, 15, 1, "#3a3c45"); box(g, 17, 1, 15, 1, "#3a3c45"); box(g, 1, 17, 15, 1, "#3a3c45");
  for (let y = 3; y < 15; y += 3) for (let x = 3; x < 15; x += 3) { box(g, x, y, 1, 1, "#1f2025"); box(g, x + 16, y + 16, 1, 1, "#1f2025"); }
  for (let y = 3; y < 15; y += 4) for (let x = 19; x < 31; x += 4) { box(g, x, y, 2, 1, "#383a42"); box(g, x - 16, y + 17, 2, 1, "#383a42"); }
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13], [18, 18], [29, 18], [18, 29], [29, 29]]) box(g, x, y, 1, 1, "#50525d");
}
function paintCeil(g: G, L: Lit, R: () => number, lamp: boolean) {
  box(g, 0, 0, 32, 32, "#1d1f26");
  noise(g, R, 32, 32, 60, ["#1a1c22", "#22242c"]);
  box(g, 0, 0, 32, 1, "#14151a"); box(g, 0, 0, 1, 32, "#14151a");
  if (lamp) { box(g, 6, 6, 20, 20, "#3a3b44"); L.r(8, 8, 16, 16, "#d9d4b8"); L.r(10, 10, 12, 12, "#fff8dc"); }
}

function paintImp(frame: number) {
  return mk(32, 40, 11, (g, L) => {
    const atk = frame === 2, step = frame === 1;
    box(g, 10, 28, 5, step ? 9 : 11, "#6e1f15"); box(g, 17, 28, 5, step ? 11 : 9, "#6e1f15");
    box(g, 9, step ? 36 : 38, 7, 2, "#3b2422"); box(g, 16, step ? 38 : 36, 7, 2, "#3b2422");
    box(g, 8, 15, 16, 14, "#b8321e"); box(g, 8, 15, 16, 2, "#e0553a"); box(g, 8, 27, 16, 2, "#7e2014");
    box(g, 11, 18, 10, 7, "#d9472c"); box(g, 11, 24, 10, 1, "#8e2618");
    L.r(14, 20, 4, 3, "#ffcf3a"); L.r(15, 21, 2, 1, "#fff4c0");
    box(g, 5, 14, 4, 4, "#8e2618"); box(g, 23, 14, 4, 4, "#8e2618"); box(g, 6, 12, 2, 2, "#efe6d6"); box(g, 24, 12, 2, 2, "#efe6d6");
    box(g, 4, 16, 4, 11, "#a02a1a"); box(g, 3, 27, 2, 3, "#efe6d6"); box(g, 6, 27, 2, 3, "#efe6d6");
    if (atk) { box(g, 24, 3, 4, 13, "#a02a1a"); L.c(26, 3, 4, "#ff9a2a"); L.c(26, 3, 2.4, "#ffe27a"); L.c(26, 3, 1.2, "#fff8d8"); }
    else { box(g, 24, 16, 4, 11, "#a02a1a"); box(g, 24, 27, 2, 3, "#efe6d6"); box(g, 27, 27, 2, 3, "#efe6d6"); }
    box(g, 10, 5, 12, 10, "#c43a22"); box(g, 10, 5, 12, 1, "#e8604a"); box(g, 11, 8, 10, 5, "#2a0d09");
    L.r(12, 9, 3, 2, "#ffe14a"); L.r(17, 9, 3, 2, "#ffe14a");
    for (const x of [13, 15, 17, 19]) L.r(x, 12, 1, 1, "#ff7a3a");
    box(g, 9, 2, 2, 4, "#efe6d6"); box(g, 7, 0, 2, 3, "#efe6d6"); box(g, 21, 2, 2, 4, "#efe6d6"); box(g, 23, 0, 2, 3, "#efe6d6");
  });
}
function paintChomper(frame: number) {
  return mk(36, 34, 12, (g, L) => {
    const bite = frame === 2, step = frame === 1;
    box(g, 7, 26, 7, step ? 8 : 7, "#7e2350"); box(g, 22, 26, 7, step ? 7 : 8, "#7e2350");
    g.beginPath(); g.roundRect(2, 5, 32, 23, 7); g.fillStyle = "#d9467e"; g.fill();
    g.beginPath(); g.roundRect(4, 6, 28, 4, 3); g.fillStyle = "#f27aa8"; g.fill();
    box(g, 4, 23, 28, 4, "#b2366a");
    const my = bite ? 12 : 15, mh = bite ? 14 : 9;
    box(g, 5, my, 26, mh, "#2a0b1c");
    L.r(13, my + (mh >> 1) - 1, 10, 2, "#ff5a8a");
    for (let x = 6; x < 30; x += 4) { box(g, x, my, 3, 2, "#f4efe6"); box(g, x + 1, my + 2, 1, 1, "#f4efe6"); box(g, x + 1, my + mh - 2, 3, 2, "#f4efe6"); box(g, x + 2, my + mh - 3, 1, 1, "#f4efe6"); }
    L.r(9, 8, 5, 3, "#a6ff4a"); L.r(22, 8, 5, 3, "#a6ff4a");
    box(g, 8, 6, 3, 1, "#7e2350"); box(g, 11, 7, 3, 1, "#7e2350"); box(g, 25, 6, 3, 1, "#7e2350"); box(g, 22, 7, 3, 1, "#7e2350");
    box(g, 17, 0, 2, 5, "#9aa0b0"); L.r(16, 0, 4, 2, "#ff4a3a");
  });
}
function paintOrb(frame: number) {
  return mk(36, 36, 13, (g, L) => {
    const atk = frame === 2;
    box(g, 0, 14, 5, 8, "#3a1f86"); box(g, 31, 14, 5, 8, "#3a1f86"); box(g, 1, 16, 3, 1, "#6a4ad0"); box(g, 32, 16, 3, 1, "#6a4ad0");
    disc(g, 18, 18, 15, "#4c2a9a"); disc(g, 16.5, 16.5, 13, "#6e42d0"); disc(g, 11, 10, 4, "#a07af2");
    disc(g, 18, 16, 8, "#e8f2ff");
    L.c(18 + (frame === 1 ? 1 : 0), 16, 5, "#3ff0ff"); disc(g, 18 + (frame === 1 ? 1 : 0), 16, 2.2, "#0a1030");
    if (atk) { L.r(11, 27, 14, 4, "#ff5ad0"); L.r(13, 28, 10, 2, "#ffd0f4"); }
    else { box(g, 12, 27, 12, 3, "#2a1660"); for (let x = 13; x < 24; x += 3) box(g, x, 28, 1, 1, "#7a50e0"); }
    box(g, 17, 0, 2, 4, "#c9cdf5"); L.r(16, 0, 4, 1, "#ff5ad0");
  });
}
function paintPile(kind: number) {
  const col = ["#b8321e", "#d9467e", "#6e42d0"][kind], eye = ["#ffe14a", "#a6ff4a", "#3ff0ff"][kind];
  return mk(24, 12, 20 + kind, (g, L, R) => {
    g.beginPath(); g.ellipse(12, 11, 11, 4, 0, 0, Math.PI * 2); g.fillStyle = "#33363f"; g.fill();
    for (let i = 0; i < 16; i++) box(g, 2 + ((R() * 18) | 0), 5 + ((R() * 5) | 0), 2 + ((R() * 3) | 0), 2, ["#5a5e6b", "#8a90a0", "#454956"][(R() * 3) | 0]);
    for (let i = 0; i < 6; i++) box(g, 3 + ((R() * 17) | 0), 6 + ((R() * 4) | 0), 3, 2, col);
    L.r(10, 7, 2, 1, eye);
  });
}

interface Pack { wall: Tex[]; rack2: Tex; exitOn: Tex; floor: Tex; ceil: Tex; lamp: Tex; foe: Tex[][]; pile: Tex[]; item: Tex[]; shot: Tex[]; bit: Tex[]; gun: Tex; flash: Tex }
let PACK: Pack | null = null;

function buildPack(): Pack {
  const wall: Tex[] = [];
  wall[TECH] = mk(32, 32, 1, paintTech);
  wall[RACK] = mk(32, 32, 2, (g, L) => paintRack(g, L, 0));
  wall[BRICK] = mk(32, 32, 3, paintBrick);
  wall[CIRC] = mk(32, 32, 4, paintCircuit);
  wall[DOOR] = mk(32, 32, 5, (g, L) => paintDoor(g, L, false));
  wall[BDOOR] = mk(32, 32, 6, (g, L) => paintDoor(g, L, true));
  wall[EXIT] = mk(32, 32, 1, (g, L, R) => paintExit(g, L, R, false));
  return {
    wall,
    rack2: mk(32, 32, 2, (g, L) => paintRack(g, L, 1)),
    exitOn: mk(32, 32, 1, (g, L, R) => paintExit(g, L, R, true)),
    floor: mk(32, 32, 7, paintFloor),
    ceil: mk(32, 32, 8, (g, L, R) => paintCeil(g, L, R, false)),
    lamp: mk(32, 32, 8, (g, L, R) => paintCeil(g, L, R, true)),
    foe: [[0, 1, 2].map(paintImp), [0, 1, 2].map(paintChomper), [0, 1, 2].map(paintOrb)],
    pile: [0, 1, 2].map(paintPile),
    item: [
      mk(18, 14, 30, (g, L) => { box(g, 1, 3, 16, 11, "#e6e6ea"); box(g, 1, 3, 16, 2, "#ffffff"); box(g, 1, 12, 16, 2, "#b0b0bc"); box(g, 6, 0, 6, 1, "#9aa0ad"); box(g, 6, 0, 1, 3, "#9aa0ad"); box(g, 11, 0, 1, 3, "#9aa0ad"); L.r(8, 5, 2, 7, "#2fd06a"); L.r(5, 7, 8, 3, "#2fd06a"); }),
      mk(12, 16, 31, (g, L) => { box(g, 2, 2, 8, 14, "#2a3546"); box(g, 2, 2, 1, 14, "#3e4c63"); box(g, 4, 0, 4, 2, "#9aa0ad"); L.r(3, 5, 6, 2, "#4ff0ff"); L.r(3, 9, 6, 2, "#4ff0ff"); L.r(3, 13, 6, 1, "#4ff0ff"); }),
      mk(16, 11, 32, (g, L) => { box(g, 0, 0, 16, 11, "#2f6bff"); box(g, 0, 0, 16, 2, "#6f9bff"); box(g, 0, 9, 16, 2, "#1f4ac0"); box(g, 2, 4, 4, 4, "#d8b24a"); L.r(8, 4, 6, 2, "#bfe0ff"); L.r(8, 7, 4, 1, "#9fd0ff"); }),
      mk(18, 16, 33, (g, L) => { g.beginPath(); g.roundRect(1, 1, 16, 15, 4); g.fillStyle = "#3f9c5e"; g.fill(); g.clearRect(6, 0, 6, 3); box(g, 2, 4, 14, 2, "#6fd08a"); box(g, 8, 6, 2, 9, "#2c7a46"); L.r(8, 7, 2, 4, "#a6ff4a"); }),
    ],
    shot: [
      mk(12, 12, 40, (_g, L) => { L.c(6, 6, 5.5, "#ff8a2a"); L.c(6, 6, 3.6, "#ffd24a"); L.c(6, 6, 1.8, "#fff8d8"); }),
      mk(12, 12, 41, (_g, L) => { L.c(6, 6, 5.5, "#c04aff"); L.c(6, 6, 3.6, "#ff8af0"); L.c(6, 6, 1.8, "#ffffff"); }),
    ],
    bit: [
      mk(6, 6, 50, (g) => { box(g, 1, 0, 4, 6, "#b8bdca"); box(g, 0, 1, 6, 4, "#b8bdca"); box(g, 1, 0, 4, 1, "#e2e6ee"); g.clearRect(2, 2, 2, 2); }),
      mk(4, 8, 51, (g) => { box(g, 0, 0, 4, 2, "#c9cdd8"); box(g, 1, 2, 2, 6, "#9aa0ad"); }),
      mk(3, 3, 52, (_g, L) => { L.r(0, 1, 3, 1, "#ffd24a"); L.r(1, 0, 1, 3, "#ffd24a"); L.r(1, 1, 1, 1, "#ffffff"); }),
      mk(8, 8, 53, (g) => { disc(g, 4, 4, 3, "#8d93a3"); for (const [x, y] of [[3, 0], [3, 6], [0, 3], [6, 3]]) box(g, x, y, 2, 2, "#8d93a3"); g.clearRect(3, 3, 2, 2); }),
      mk(16, 16, 54, (_g, L) => { L.c(8, 8, 7.5, "#ffb347"); L.c(8, 8, 5.5, "#ffe8a0"); L.c(8, 8, 3, "#ffffff"); }),
      mk(3, 3, 55, (_g, L) => { L.r(0, 1, 3, 1, "#ff8af0"); L.r(1, 0, 1, 3, "#ff8af0"); L.r(1, 1, 1, 1, "#ffffff"); }),
    ],
    gun: mk(96, 64, 60, (g, L) => {
      g.beginPath(); g.moveTo(28, 56); g.lineTo(60, 56); g.lineTo(53, 33); g.lineTo(35, 33); g.closePath(); g.fillStyle = "#5d6780"; g.fill();
      g.beginPath(); g.moveTo(28, 56); g.lineTo(32, 56); g.lineTo(38, 33); g.lineTo(35, 33); g.closePath(); g.fillStyle = "#8a95ad"; g.fill();
      box(g, 41, 38, 3, 18, "#3a4152"); box(g, 48, 40, 2, 16, "#3a4152"); box(g, 41, 44, 9, 2, "#2a2f3d");
      g.beginPath(); g.roundRect(30, 19, 24, 17, 3); g.fillStyle = "#3b4154"; g.fill();
      box(g, 31, 19, 22, 2, "#5d6680");
      for (const x of [34, 40, 46]) { L.r(x, 25, 3, 6, "#ff8a2a"); L.r(x + 1, 27, 1, 2, "#ffe27a"); }
      box(g, 37, 6, 10, 14, "#555e78"); box(g, 37, 6, 2, 14, "#808aa5"); box(g, 45, 6, 2, 14, "#3a4152");
      box(g, 36, 10, 12, 1, "#2a2f3d"); box(g, 36, 15, 12, 1, "#2a2f3d");
      box(g, 36, 2, 12, 5, "#2a2f3d"); L.r(39, 3, 6, 2, "#6ff3ff");
      box(g, 27, 29, 6, 9, "#8c96ad"); box(g, 51, 29, 6, 9, "#8c96ad"); box(g, 27, 29, 6, 2, "#b3bccf"); box(g, 51, 29, 6, 2, "#b3bccf");
      box(g, 29, 38, 3, 3, "#6d7790"); box(g, 52, 38, 3, 3, "#6d7790");
    }, 1.2),
    flash: mk(28, 22, 61, (g, L) => {
      L.c(14, 12, 9.5, "#ff9a2a");
      for (const [x, y, w, h] of [[13, 0, 2, 6], [2, 11, 6, 2], [20, 11, 6, 2], [5, 4, 3, 3], [20, 4, 3, 3]]) L.r(x, y, w, h, "#ffb347");
      L.c(14, 12, 6.5, "#ffd84a"); L.c(14, 12, 3.5, "#fffbe0");
      void g;
    }),
  };
}

const shadeF = (d: number) => clamp(1.2 - d * 0.095, 0.13, 1);
const shadePx = (c: number, s: number) => 0xff000000 | (((((c >> 16) & 255) * s) >> 8) << 16) | (((((c >> 8) & 255) * s) >> 8) << 8) | (((c & 255) * s) >> 8);
const lighten = (c: number) => 0xff000000 | (((((c >> 16) & 255) + 255) >> 1) << 16) | (((((c >> 8) & 255) + 255) >> 1) << 8) | (((c & 255) + 255) >> 1);

/** Returns draw(run, time, calm): fills buf with one frame. Allocates nothing per frame. */
function renderer(P: Pack, RW: number, RH: number, buf: Uint32Array) {
  const zbuf = new Float32Array(RW);
  const PL = RW / (2 * RH);
  const MAX = 220;
  const qx = new Float32Array(MAX), qy = new Float32Array(MAX), qz = new Float32Array(MAX), qw = new Float32Array(MAX), qh = new Float32Array(MAX), qd = new Float32Array(MAX);
  const qt: Tex[] = new Array(MAX).fill(P.bit[0]);
  const qf = new Uint8Array(MAX), order = new Int16Array(MAX);
  let n = 0;
  const push = (t: Tex, x: number, y: number, z: number, w: number, h: number, fl: number) => {
    if (n >= MAX) return;
    qt[n] = t; qx[n] = x; qy[n] = y; qz[n] = z; qw[n] = w; qh[n] = h; qf[n] = fl; n++;
  };
  const blit = (t: Tex, x0: number, y0: number, s: number) => {
    for (let ty = 0; ty < t.h; ty++) {
      const y = y0 + ty;
      if (y < 0 || y >= RH) continue;
      for (let tx = 0; tx < t.w; tx++) {
        const x = x0 + tx;
        if (x < 0 || x >= RW) continue;
        const ti = ty * t.w + tx, c = t.px[ti];
        if (c) buf[y * RW + x] = t.glow[ti] ? c : shadePx(c, s);
      }
    }
  };

  return function draw(r: Run, time: number, calm: boolean) {
    const ca = Math.cos(r.a), sa = Math.sin(r.a);
    const plX = -sa * PL, plY = ca * PL;
    const move = Math.min(1, r.speed / 2);
    const hz = RH / 2 + (calm || r.dead ? 0 : Math.sin(r.walk * 2) * move * 1.6);
    const eye = r.eyeZ;
    const boost = r.fireT < 0.07 ? 1.3 : 1;

    // floor and ceiling
    const r0x = ca - plX, r0y = sa - plY, r1x = ca + plX, r1y = sa + plY;
    for (let y = 0; y < RH; y++) {
      const dy = y + 0.5 - hz;
      let o = y * RW;
      if (Math.abs(dy) < 0.6) { for (let x = 0; x < RW; x++) buf[o++] = 0xff000000; continue; }
      const fl = dy > 0;
      const dist = ((fl ? eye : 1 - eye) * RH) / Math.abs(dy);
      const s = Math.min(256, (shadeF(dist) * (fl ? 1 : 0.85) * 256 * boost) | 0);
      let fx = r.x + dist * r0x, fy = r.y + dist * r0y;
      const stx = (dist * (r1x - r0x)) / RW, sty = (dist * (r1y - r0y)) / RW;
      const T = fl ? P.floor : P.ceil;
      for (let x = 0; x < RW; x++) {
        const cx = Math.floor(fx), cy = Math.floor(fy);
        const ti = ((((fy - cy) * 32) | 0) & 31) * 32 + ((((fx - cx) * 32) | 0) & 31);
        const tt = !fl && cx >= 0 && cy >= 0 && cx < MW && cy < MH && LIGHT[cy * MW + cx] ? P.lamp : T;
        const c = tt.px[ti];
        buf[o++] = tt.glow[ti] ? c : shadePx(c, s);
        fx += stx; fy += sty;
      }
    }

    // walls (DDA), with sliding doors on the cell mid-line
    const blink = Math.floor(time * 2.2);
    for (let x = 0; x < RW; x++) {
      const cam = (2 * (x + 0.5)) / RW - 1;
      const rdx = ca + plX * cam, rdy = sa + plY * cam;
      let mx = Math.floor(r.x), my = Math.floor(r.y);
      const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
      const stx = rdx < 0 ? -1 : 1, sty = rdy < 0 ? -1 : 1;
      let sdx = rdx < 0 ? (r.x - mx) * ddx : (mx + 1 - r.x) * ddx;
      let sdy = rdy < 0 ? (r.y - my) * ddy : (my + 1 - r.y) * ddy;
      let side = 0, perp = 30, u = 0, tex: Tex | null = null;
      for (let k = 0; k < 64; k++) {
        if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
        if (mx < 0 || my < 0 || mx >= MW || my >= MH) break;
        const ci = my * MW + mx, c = r.grid[ci];
        if (!c) continue;
        if (isDoor(c)) {
          const dd = side === 0 ? sdx - ddx * 0.5 : sdy - ddy * 0.5;
          if (dd >= (side === 0 ? sdy : sdx)) continue;
          let w = side === 0 ? r.y + dd * rdy : r.x + dd * rdx;
          w -= Math.floor(w);
          if (w < r.open[ci]) continue;
          perp = dd; u = w - r.open[ci]; tex = P.wall[c];
          break;
        }
        perp = side === 0 ? sdx - ddx : sdy - ddy;
        let w = side === 0 ? r.y + perp * rdy : r.x + perp * rdx;
        w -= Math.floor(w);
        if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) w = 1 - w;
        u = w;
        tex = c === RACK ? ((blink + ci * 3) & 1 ? P.rack2 : P.wall[RACK]) : c === EXIT && r.exitOn ? P.exitOn : P.wall[c];
        break;
      }
      zbuf[x] = perp;
      if (!tex) continue;
      const lh = RH / perp;
      const top = hz - (1 - eye) * lh;
      const y0 = Math.max(0, Math.ceil(top - 0.5)), y1 = Math.min(RH, Math.ceil(top + lh - 0.5));
      const step = 32 / lh;
      let v = (y0 + 0.5 - top) * step;
      const s = Math.min(256, (shadeF(perp) * (side ? 0.78 : 1) * 256 * boost) | 0);
      const tx = Math.min(31, (u * 32) | 0);
      const px = tex.px, gl = tex.glow;
      let o = y0 * RW + x;
      for (let y = y0; y < y1; y++) { const ti = ((v | 0) & 31) * 32 + tx; buf[o] = gl[ti] ? px[ti] : shadePx(px[ti], s); v += step; o += RW; }
    }

    // sprites, far to near
    n = 0;
    for (const f of r.foes) {
      const sp = SPEC[f.kind];
      if (!f.alive) { push(P.pile[f.kind], f.x, f.y, 0, 0.6, 0.3, 0); continue; }
      const frames = P.foe[f.kind];
      const fr = f.atk > 0 || f.bite > 0 ? 2 : f.kind === 2 ? (Math.floor(time * 1.5 + f.x) & 1) : (Math.floor(f.anim) & 1);
      const z = sp.z + (f.kind === 2 ? Math.sin(time * 2.2 + f.x) * 0.05 : 0);
      push(frames[fr], f.x, f.y, z, sp.w, sp.h, f.flash > 0 ? 1 : 0);
    }
    for (const it of r.items) {
      if (it.taken) continue;
      const [w, h] = ITEM_SIZE[it.kind];
      push(P.item[it.kind], it.x, it.y, it.kind === KEY ? 0.12 + Math.sin(time * 3) * 0.04 : 0, w, h, 0);
    }
    for (const s of r.shots) if (s.on) push(P.shot[s.kind], s.x, s.y, 0.36, 0.26, 0.26, 0);
    for (const b of r.bits) {
      if (!b.on) continue;
      const sz = b.tex === BIT_POP ? b.size * (1 + (0.26 - b.life) * 5) : b.size;
      push(P.bit[b.tex], b.x, b.y, b.z, sz, sz, 0);
    }
    for (let i = 0; i < n; i++) { qd[i] = (qx[i] - r.x) * ca + (qy[i] - r.y) * sa; order[i] = i; }
    for (let i = 1; i < n; i++) { const v = order[i]; let j = i - 1; while (j >= 0 && qd[order[j]] < qd[v]) { order[j + 1] = order[j]; j--; } order[j + 1] = v; }
    for (let k = 0; k < n; k++) {
      const i = order[k], depth = qd[i];
      if (depth < 0.15) continue;
      const lat = -(qx[i] - r.x) * sa + (qy[i] - r.y) * ca;
      const scr = (RW / 2) * (1 + lat / (depth * PL));
      const sc = RH / depth, w = qw[i] * sc, h = qh[i] * sc;
      const top = hz + (eye - (qz[i] + qh[i])) * sc, left = scr - w / 2;
      const x0 = Math.max(0, Math.ceil(left - 0.5)), x1 = Math.min(RW, Math.ceil(left + w - 0.5));
      const y0 = Math.max(0, Math.ceil(top - 0.5)), y1 = Math.min(RH, Math.ceil(top + h - 0.5));
      if (x0 >= x1 || y0 >= y1) continue;
      const t = qt[i], fl = qf[i];
      const s = Math.min(256, (Math.max(0.42, shadeF(depth)) * 256 * boost) | 0);
      const du = t.w / w, dv = t.h / h;
      for (let x = x0; x < x1; x++) {
        if (depth >= zbuf[x]) continue;
        const tu = Math.min(t.w - 1, ((x + 0.5 - left) * du) | 0);
        let v = (y0 + 0.5 - top) * dv, o = y0 * RW + x;
        for (let y = y0; y < y1; y++, o += RW, v += dv) {
          const ti = Math.min(t.h - 1, v | 0) * t.w + tu, c = t.px[ti];
          if (c) buf[o] = fl ? lighten(c) : t.glow[ti] ? c : shadePx(c, s);
        }
      }
    }

    // the robot's blaster arm
    const g = P.gun;
    const bx = calm ? 0 : Math.sin(r.walk) * 5 * move, by = calm ? 0 : Math.abs(Math.cos(r.walk)) * 3 * move;
    const kick = r.fireT < 0.12 ? (0.12 - r.fireT) * 30 : 0;
    const drop = r.dead ? Math.min(90, (0.5 - r.eyeZ) * 260) : r.exitOn ? Math.min(90, r.winT * 70) : 0;
    const gx = Math.round(RW / 2 - 50 + bx), gy = Math.round(RH - g.h + 4 + by + kick + drop);
    if (r.fireT < 0.07 && !r.dead) blit(P.flash, gx + 36, gy - 17, 256);
    blit(g, gx, gy, Math.min(256, (0.92 * 256 * boost) | 0));
  };
}

// ---- HUD art -------------------------------------------------------------------------------

function drawFace(g: G, hp: number, look: number, mode: string, ph: number) {
  g.clearRect(0, 0, 22, 24);
  const tier = hp >= 80 ? 0 : hp >= 60 ? 1 : hp >= 40 ? 2 : hp >= 20 ? 3 : 4;
  const dead = mode === "dead";
  const ec = dead ? "#ff3a2a" : tier <= 1 ? "#5ff0ff" : tier === 2 ? "#ffd24a" : "#ff6a3a";
  box(g, 10, 0, 2, 3, "#7d8597"); box(g, 9, 0, 4, 2, dead ? "#5a2a2a" : "#ff5a4a");
  box(g, 0, 9, 2, 7, "#5d6475"); box(g, 20, 9, 2, 7, "#5d6475");
  box(g, 2, 3, 18, 19, "#9ba4b7"); box(g, 2, 3, 18, 2, "#c5ccda"); box(g, 2, 3, 2, 19, "#b3bbcb"); box(g, 18, 3, 2, 19, "#788092"); box(g, 2, 20, 18, 2, "#646b7c");
  box(g, 4, 7, 14, 7, "#10141e");
  const l = dead ? 0 : look;
  if (dead) { for (let k = 0; k < 3; k++) { box(g, 6 + k, 9 + k, 1, 1, ec); box(g, 8 - k, 9 + k, 1, 1, ec); box(g, 13 + k, 9 + k, 1, 1, ec); box(g, 15 - k, 9 + k, 1, 1, ec); } }
  else if (mode === "ouch") { box(g, 6, 10, 3, 1, ec); box(g, 13, 10, 3, 1, ec); box(g, 5, 8, 3, 1, "#4a5262"); box(g, 14, 8, 3, 1, "#4a5262"); }
  else if (mode === "grin") { for (const ex of [6, 13]) { box(g, ex + l, 11, 1, 1, ec); box(g, ex + 1 + l, 10, 1, 1, ec); box(g, ex + 2 + l, 11, 1, 1, ec); } }
  else { box(g, 6 + l, 9, 3, 3, ec); box(g, 13 + l, 9, 3, 3, ec); box(g, 6 + l, 9, 1, 1, "#ffffff"); box(g, 13 + l, 9, 1, 1, "#ffffff"); }
  if (!dead && tier >= 3 && ph % 2 === 0) box(g, 13 + l, 8, 4, 5, "#10141e");
  if (mode === "grin") { box(g, 6, 16, 10, 3, "#3b4252"); box(g, 7, 16, 1, 1, ec); box(g, 8, 17, 6, 1, ec); box(g, 14, 16, 1, 1, ec); }
  else if (mode === "ouch" || dead) { box(g, 8, 15, 6, 5, "#1a1f2a"); box(g, 9, 16, 4, 3, "#2a0d09"); }
  else { box(g, 7, 16, 8, 3, "#3b4252"); for (let x = 8; x < 15; x += 2) box(g, x, 16, 1, 3, "#262b36"); }
  if (tier >= 1) { box(g, 4, 5, 3, 1, "#6b7385"); box(g, 15, 19, 3, 1, "#6b7385"); }
  if (tier >= 2) { box(g, 14, 3, 4, 3, "#79818f"); box(g, 15, 4, 2, 1, "#555c6b"); box(g, 3, 15, 2, 3, "#7d8597"); }
  if (tier >= 3) for (const [x, y] of [[9, 7], [10, 8], [10, 9], [11, 10], [12, 11], [12, 12], [13, 13]]) box(g, x, y, 1, 1, "#d6e2f2");
  if (tier >= 4 && !dead) {
    const sp = [[3, 6], [18, 14], [11, 3], [17, 5]][ph % 4];
    box(g, sp[0] - 1, sp[1], 3, 1, "#ffd24a"); box(g, sp[0], sp[1] - 1, 1, 3, "#ffd24a"); box(g, sp[0], sp[1], 1, 1, "#ffffff");
    box(g, 5 + ph, 1, 2, 1, "#6a6a72");
  }
  if (dead) { g.fillStyle = "rgba(24,10,10,0.35)"; g.fillRect(0, 0, 22, 24); }
}

const GLYPH: Record<string, string[]> = {
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
};
function drawLogo(c: HTMLCanvasElement) {
  const cs = 5, word = "BOOT";
  c.width = (word.length * 6 - 1) * cs + 3; c.height = 7 * cs + 3;
  const g = c.getContext("2d")!;
  const rows = ["#ffe27a", "#ffc24a", "#ff9a2e", "#f26a22", "#d8421c", "#b02a16", "#7e1a10"];
  for (const pass of [0, 1]) {
    word.split("").forEach((ch, li) => GLYPH[ch].forEach((row, r) => row.split("").forEach((b, col) => {
      if (b !== "1") return;
      const x = (li * 6 + col) * cs, y = r * cs;
      if (!pass) { box(g, x + 3, y + 3, cs, cs, "#1a0503"); return; }
      box(g, x, y, cs, cs, rows[r]);
      box(g, x, y, cs, 1, "rgba(255,250,220,0.55)"); box(g, x, y, 1, cs, "rgba(255,250,220,0.3)");
      box(g, x, y + cs - 1, cs, 1, "rgba(60,8,4,0.55)"); box(g, x + cs - 1, y, 1, cs, "rgba(60,8,4,0.45)");
    })));
  }
  // the two O's are a robot looking back at you
  for (const li of [1, 2]) { box(g, (li * 6 + 2) * cs, 3 * cs, cs, cs, "#14080a"); box(g, (li * 6 + 2) * cs + 1, 3 * cs + 1, cs - 2, cs - 2, "#5ff0ff"); }
}
function hudBg() {
  const c = document.createElement("canvas"); c.width = 48; c.height = 24;
  const g = c.getContext("2d")!;
  const R = rng(77);
  box(g, 0, 0, 48, 24, "#4b443e");
  noise(g, R, 48, 24, 420, ["#544c45", "#433d38", "#5a524a", "#3e3833", "#4f4741"]);
  return c.toDataURL();
}

// ---- the game --------------------------------------------------------------------------------

export async function playBoot(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  try {
    const f = mountFrame(body, scope, "BOOT", "bt");
    const S = new Session(host, opts, { base: 0.3, step: 0.15, calm: 0.1 });
    const calm = reducedMotion();
    const P = PACK ?? (PACK = buildPack());
    const HUD = 54, VW = f.w, VH = Math.max(80, f.h - HUD);
    const RW = 300, RH = Math.max(60, Math.round((RW * VH) / VW));
    const cap = (ms: number) => Math.max(0, Math.min(ms, S.left - 300));

    f.stage.insertAdjacentHTML("beforeend", `
      <div class="gm-bt-view" style="height:${VH}px"><canvas class="gm-bt-cv"></canvas><i class="gm-bt-flash"></i><div class="gm-bt-msg"></div></div>
      <div class="gm-bt-hud">
        <div class="gm-bt-cell"><b class="gm-bt-ammo">35</b><span>AMMO</span></div>
        <div class="gm-bt-cell"><b class="gm-bt-hp">100%</b><span>HEALTH</span></div>
        <div class="gm-bt-cell"><div class="gm-bt-arms-g"><i class="gm-on">2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i></div><span>ARMS</span></div>
        <div class="gm-bt-face"><canvas width="22" height="24"></canvas></div>
        <div class="gm-bt-cell"><b class="gm-bt-ar">0%</b><span>ARMOR</span></div>
        <div class="gm-bt-keys"><i data-k="b"></i><i data-k="y"></i><i data-k="r"></i></div>
      </div>
      <div class="gm-bt-tally"></div>
      <div class="gm-bt-title"><canvas class="gm-bt-logo"></canvas><span class="gm-bt-sub">Knee-Deep in the Kernel</span><div class="gm-bt-menu"></div></div>`);
    const q = <T extends Element = HTMLElement>(s: string) => f.stage.querySelector(s) as T;
    const cv = q<HTMLCanvasElement>(".gm-bt-cv"), flashEl = q(".gm-bt-flash"), msgEl = q(".gm-bt-msg");
    const ammoB = q(".gm-bt-ammo"), hpB = q(".gm-bt-hp"), arB = q(".gm-bt-ar"), keyB = q('.gm-bt-keys i[data-k="b"]');
    const faceCv = q<HTMLCanvasElement>(".gm-bt-face canvas"), faceG = faceCv.getContext("2d")!;
    const title = q(".gm-bt-title"), menu = q(".gm-bt-menu"), tally = q(".gm-bt-tally");
    q(".gm-bt-hud").style.backgroundImage = `url(${hudBg()})`;
    drawLogo(q<HTMLCanvasElement>(".gm-bt-logo"));
    cv.width = RW; cv.height = RH; cv.style.width = `${VW}px`; cv.style.height = `${VH}px`;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(RW, RH);
    const buf = new Uint32Array(img.data.buffer);
    const draw = renderer(P, RW, RH, buf);

    let msgT = 0, lastReact = -1e9;
    const ev: Ev = {
      tap: (k) => host.tap(k),
      react: (k) => { const now = performance.now(); if (now - lastReact < 2200) return; lastReact = now; host.react(k); },
      msg: (s) => { msgEl.textContent = s; msgEl.style.opacity = "1"; msgT = 2.6; },
    };

    // ---- per-frame HUD ----
    let faceKey = "", look = 0, lookT = 0, grinT = 0, lastKills = 0, lastGot = 0;
    const hv = { ammo: -1, hp: -1, ar: -1, key: false, kills: -1, fl: -1 };
    const face = (hp: number, mode: string, t: number) => {
      const ph = Math.floor(t * 6) % 4;
      const k = `${hp >= 80 ? 0 : hp >= 60 ? 1 : hp >= 40 ? 2 : hp >= 20 ? 3 : 4}|${look}|${mode}|${hp < 40 ? ph : 0}`;
      if (k !== faceKey) { faceKey = k; drawFace(faceG, hp, look, mode, ph); }
    };
    const hud = (r: Run, dt: number, t: number) => {
      if (r.ammo !== hv.ammo) { hv.ammo = r.ammo; ammoB.textContent = String(r.ammo); }
      if (r.hp !== hv.hp) { hv.hp = r.hp; hpB.textContent = `${r.hp}%`; }
      if (r.armor !== hv.ar) { hv.ar = r.armor; arB.textContent = `${r.armor}%`; }
      if (r.key !== hv.key) { hv.key = r.key; keyB.classList.toggle("gm-on", r.key); }
      if (r.kills !== hv.kills) { hv.kills = r.kills; f.setScore(`Kills ${r.kills}/${r.foes.length}`, r.kills > 0); }
      if (r.kills > lastKills || r.got > lastGot) grinT = 1.1;
      lastKills = r.kills; lastGot = r.got;
      grinT -= dt; lookT -= dt;
      if (r.hurtT > 0.2) { look = r.hurtSide; lookT = 0.9; }
      else if (lookT <= 0) { look = [-1, 0, 0, 1][(Math.random() * 4) | 0]; lookT = 0.7 + Math.random() * 1.2; }
      face(r.hp, r.dead ? "dead" : r.hurtT > 0.12 ? "ouch" : grinT > 0 || r.exitOn ? "grin" : "", t);
      let fa = 0, col = "#ff2a1a";
      if (r.dead) fa = 0.32;
      else if (r.hurtT > 0) fa = (r.hurtT / 0.35) * (calm ? 0.22 : 0.42);
      else if (r.gotT > 0) { fa = (r.gotT / 0.3) * 0.22; col = "#ffd24a"; }
      if (Math.abs(fa - hv.fl) > 0.01) { hv.fl = fa; flashEl.style.background = col; flashEl.style.opacity = fa.toFixed(2); }
      cv.style.transform = !calm && r.hurtT > 0.2 ? `translate(${(Math.random() * 4 - 2).toFixed(1)}px,${(Math.random() * 4 - 2).toFixed(1)}px)` : "";
      msgT -= dt;
      if (msgT <= 0 && msgEl.style.opacity !== "0") msgEl.style.opacity = "0";
    };

    let run: Run | null = null, live = false;
    scope.raf((t, dt) => {
      if (!run || !live) return;
      const steps = dt > 1 / 40 ? 2 : 1;
      for (let i = 0; i < steps; i++) run.step(dt / steps);
      draw(run, t, calm);
      ctx.putImageData(img, 0, 0);
      hud(run, dt, t);
    });

    // ---- title: a still of the hall behind the menu ----
    const scenic = new Run(0.5, 1, { tap() {}, react() {}, msg() {} });
    scenic.x = 10.6; scenic.y = 17.6; scenic.a = -0.6;
    draw(scenic, 0, true);
    ctx.putImageData(img, 0, 0);
    face(100, "", 0);
    f.setScore("Main menu");
    const ptr = document.createElement("canvas");
    ptr.width = 22; ptr.height = 24; ptr.className = "gm-bt-ptr";
    drawFace(ptr.getContext("2d")!, 100, 1, "grin", 0);
    const fill = (head: string, labels: string[]) => {
      menu.innerHTML = (head ? `<div class="gm-bt-mh">${head}</div>` : "") + labels.map((s) => `<div class="gm-bt-mi">${s}</div>`).join("");
      menu.appendChild(ptr);
      return [...menu.querySelectorAll(".gm-bt-mi")] as HTMLElement[];
    };
    const hover = (els: HTMLElement[], i: number) => {
      els.forEach((e, k) => e.classList.toggle("gm-hot", k === i));
      ptr.style.top = `${els[i].offsetTop + (els[i].offsetHeight - 24) / 2}px`;
    };
    let mi = fill("", ["New Game", "Options", "Load Game", "Read This!", "Quit Game"]);
    hover(mi, 0);
    scope.fromTo(title, { opacity: 0 }, { opacity: 1, duration: calm ? 0.01 : 0.5 });
    await nap(host, 1100);
    await host.pointAt(mi[0], 0.35, 0.5, 600);
    await nap(host, think(S.skill, 280));
    await host.click();
    await nap(host, 250);
    mi = fill("Choose skill level", SKILLS);
    let cur = 2;
    hover(mi, cur);
    const choice = S.skill < 0.42 ? 0 : S.skill < 0.55 ? 1 : S.skill < 0.8 ? 2 : 3;
    await nap(host, think(S.skill, 650));
    // peek one past it, then settle
    const route = choice === cur ? [cur + 1, cur] : [];
    for (let i = cur; i !== choice; i += choice > cur ? 1 : -1) route.push(i + (choice > cur ? 1 : -1));
    for (const i of route) { host.tap(i > cur ? "ArrowDown" : "ArrowUp"); cur = i; hover(mi, cur); await nap(host, 300); }
    await nap(host, think(S.skill, 350));
    host.tap("Enter");
    await nap(host, 200);
    scope.to(title, { opacity: 0, duration: calm ? 0.01 : 0.35 });
    // keyboard only from here: move the mouse out of the view, onto the status bar
    await host.pointAt(q(".gm-bt-hud"), 0.97, 0.8, 420);
    title.style.display = "none";

    // ---- play, maybe a few times ----
    let attempt = 0;
    for (;;) {
      attempt++;
      run = new Run(S.skill, SKILL_DMG[choice], ev);
      live = true;
      hv.kills = -1; lastKills = 0; lastGot = 0;
      if (attempt === 1) ev.msg(`Skill: ${SKILLS[choice]}`);
      host.react("focus");
      while (!run.end && S.left > 1600) await nap(host, 100);
      const r = run;
      const clock = `${Math.floor(r.t / 60)}:${String(Math.floor(r.t % 60)).padStart(2, "0")}`;
      if (!r.end) {
        live = false;
        f.showOver("Break's over", `Kills ${r.kills}/${r.foes.length}   ${clock}`, "plain");
        await nap(host, cap(900));
        return { result: "done", score: r.kills };
      }
      if (r.end === "win") {
        await nap(host, cap(500));
        live = false;
        host.react("cheer");
        f.setScore("Level complete", true);
        const kp = Math.round((r.kills / r.foes.length) * 100), ip = Math.round((r.got / r.items.length) * 100);
        tally.innerHTML = `<h3>Server Pit</h3><p>Finished</p>
          <div class="gm-bt-row"><span>Kills</span><b>0%</b></div>
          <div class="gm-bt-row"><span>Items</span><b>0%</b></div>
          <div class="gm-bt-row"><span>Time</span><b>${clock}</b></div>
          <div class="gm-bt-row"><span>Par</span><b>1:30</b></div>
          <div class="gm-bt-next">Entering: Cooling Tower</div>`;
        tally.classList.add("gm-on");
        msgEl.style.opacity = "0";
        const cells = [...tally.querySelectorAll(".gm-bt-row b")] as HTMLElement[];
        [kp, ip].forEach((v, i) => {
          if (calm) { cells[i].textContent = `${v}%`; return; }
          const o = { v: 0 };
          scope.to(o, { v, duration: 0.7, delay: 0.25 + i * 0.6, ease: "none", onUpdate: () => { cells[i].textContent = `${Math.round(o.v)}%`; } });
        });
        await nap(host, cap(3600));
        return { result: "win", score: r.kills };
      }
      // rebooted
      await nap(host, cap(1300));
      live = false;
      f.showOver("Rebooted", `by ${r.killer}   Kills ${r.kills}/${r.foes.length}`, "bad");
      await nap(host, cap(1500));
      S.rounds = attempt;
      const next = S.afterLoss(0.12);
      if (next === "ragequit") { host.react("angry"); await nap(host, cap(600)); return { result: "ragequit", score: r.kills }; }
      if (next === "lose" || S.left < 38000) { host.react(Math.random() < 0.5 ? "angry" : "relax"); await nap(host, cap(1200)); return { result: "lose", score: r.kills }; }
      ev.msg("Press Space to respawn");
      await nap(host, 700);
      host.tap(" ");
      f.hideOver();
      await nap(host, 250);
    }
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}

