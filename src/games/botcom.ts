// BOT-COM: Terror from the Deep Sea. Turn-based squad tactics on the seabed: four brass-helmet
// diver robots against tentacled sea-bots, with time units, fog of war, cover and reaction fire.
// The robot plays it with the mouse: select a diver, click a tile, pick Snap or Aimed, click a target, End turn.
import "./games.css";
import "./botcom.css";
import {
  Scope, Session, Halt, mountFrame, addCanvas, nap, think, chance, pick, clamp, lerp, reducedMotion, rng, hash,
  fillRR, circle, ellipse, poly, line, lin, rad, glow, text, withAlpha, mix,
  type Ctx, type FunHost, type FunOpts, type Outcome,
} from "./kit";

const GW = 11, GH = 11, TW = 36, TH = 18, PANEL = 62;
type Tile = 0 | 1 | 2 | 3 | 4 | 5; // sand, rock, coral, kelp, wreck, craft
const BLOCK_MOVE = [false, true, true, false, true, true];
const BLOCK_LOS = [false, true, false, false, true, true];
const COVER = [0, 0.3, 0.2, 0.08, 0.3, 0.3];
const SIGHT = 6.5, RANGE = 10, STEP = 115;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const idx = (x: number, y: number) => y * GW + x;
const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH;
const now = () => performance.now() / 1000;

type Kind = "diver" | "jelly" | "squid" | "lantern";
type AlienKind = Exclude<Kind, "diver">;
type Mode = "snap" | "aimed";

const AL: Record<AlienKind, { name: string; hp: number; tu: number; acc: number; dmg: [number, number]; snap: number; aimed: number; bolt: string }> = {
  jelly: { name: "Jellydrone", hp: 42, tu: 52, acc: 0.64, dmg: [20, 32], snap: 18, aimed: 32, bolt: "#ff5fd2" },
  squid: { name: "Squidmech", hp: 74, tu: 48, acc: 0.62, dmg: [24, 38], snap: 18, aimed: 32, bolt: "#ffb03a" },
  lantern: { name: "Lanternbot", hp: 54, tu: 50, acc: 0.78, dmg: [28, 42], snap: 20, aimed: 30, bolt: "#9dff6a" },
};
const DV = { hp: 60, tu: 56, snap: 16, aimed: 30, dmg: [30, 48] as [number, number] };
const SQUAD = [
  { name: "Sgt. Gauge", acc: 0.7, tag: "#ff9f5a" },
  { name: "Cpl. Kettle", acc: 0.63, tag: "#4fb6ff" },
  { name: "Pvt. Rivet", acc: 0.58, tag: "#4ff0a0" },
  { name: "Pvt. Bilge", acc: 0.53, tag: "#c79bff" },
];
const OPS = ["Operation Wet Socket", "Operation Salty Kernel", "Operation Deep Patch", "Operation Rusty Anchor", "Operation Soggy Cache"];
const SITES = ["Sunken cargo ship, 340 m", "Abandoned cable relay, 410 m", "Reef server farm, 280 m", "Kelp forest outpost, 300 m"];
const LINES = {
  win: [
    "All sea-bots recycled. The harbour sends a thank-you fax.",
    "{n} would like it noted that the squid started it.",
    "Zero leaks. One very confused octopus.",
    "Seabed secured. {n} has already polished every helmet.",
  ],
  wipe: [
    "The squad floated home on recall buoys. Morale is damp.",
    "Note to self: the glowing ones shoot back.",
    "Every diver is safe in the sub. Their pride is still down there.",
  ],
  retreat: [
    "One diver left, many tentacles. The sub honks twice and leaves.",
    "Tactical retreat. Nobody mention the kelp to {n}.",
  ],
  abort: [
    "Air tanks low. Mission paused, pride intact.",
    "The sub needs to surface for a firmware update.",
  ],
};

interface Unit {
  id: number; side: "x" | "a"; kind: Kind; name: string; tag: string;
  x: number; y: number; fx: number; fy: number; t0: number; dur: number;
  hp: number; max: number; tu: number; maxTu: number; acc: number;
  alive: boolean; face: number; hurt: number; flash: number; gone: number;
  vis: boolean; last: { x: number; y: number } | null; reacted: number; lunge: number;
}
interface Fx { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: "bolt" | "spark" | "bubble" | "sand"; c: string; r: number; a: number; va: number }
interface Shot { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; c: string }
interface Float { x: number; y: number; s: string; c: string; t0: number }
interface Mission {
  map: Tile[]; units: Unit[]; vis: Uint8Array; seen: Uint8Array; lit: string[]; dim: string[]; dark: string[];
  objs: { x: number; y: number; t: Tile; s: number }[];
  turn: number; alert: boolean; kills: number; lost: number; op: string; site: string;
  sel: Unit | null; path: [number, number][] | null; target: Unit | null; phase: "squad" | "alien" | "end"; misses: number;
}

// ---- seabed generation -----------------------------------------------------------------

const SPAWN: [number, number][] = [[1, 8], [1, 9], [1, 10], [2, 9]];
function genMap(r: () => number): { map: Tile[]; aliens: [number, number][] } {
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  for (let tries = 0; ; tries++) {
    const m: Tile[] = new Array(GW * GH).fill(0);
    const set = (x: number, y: number, v: Tile) => { if (inb(x, y)) m[idx(x, y)] = v; };
    const wx = ri(3, 6), wy = ri(3, 6), horiz = r() < 0.5;
    for (let k = 0; k < 3; k++) set(horiz ? wx + k : wx, horiz ? wy : wy + k, 4);
    for (let i = 0; i < 5; i++) {
      const cx = ri(0, GW - 1), cy = ri(0, GH - 1);
      set(cx, cy, 1);
      if (r() < 0.55) set(cx + (r() < 0.5 ? 1 : 0), cy + (r() < 0.5 ? 0 : 1), 1);
    }
    for (let i = 0; i < 8; i++) set(ri(0, GW - 1), ri(0, GH - 1), 2);
    for (let i = 0; i < 13; i++) { const x = ri(0, GW - 1), y = ri(0, GH - 1); if (!m[idx(x, y)]) set(x, y, 3); }
    for (let y = 6; y < GH; y++) for (let x = 0; x < 4; x++) m[idx(x, y)] = 0;
    set(ri(2, 4), ri(5, 6), 2);
    if (r() < 0.6) set(3, ri(8, 10), 1);
    for (const y of [8, 9, 10]) set(0, y, 5);
    // squad spawns stay clear
    for (const [x, y] of SPAWN) set(x, y, 0);
    // reachability from the landing zone
    const seen = new Uint8Array(GW * GH), qx = [idx(1, 9)];
    seen[qx[0]] = 1;
    while (qx.length) {
      const i = qx.pop()!, x = i % GW, y = (i / GW) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny) || seen[idx(nx, ny)] || BLOCK_MOVE[m[idx(nx, ny)]]) continue;
        seen[idx(nx, ny)] = 1; qx.push(idx(nx, ny));
      }
    }
    const reach = seen.reduce((a, b) => a + b, 0);
    const cand: [number, number][] = [];
    for (let y = 0; y <= 5; y++) for (let x = 6; x < GW; x++) if (seen[idx(x, y)] && m[idx(x, y)] !== 3 || (seen[idx(x, y)] && r() < 0.3)) cand.push([x, y]);
    const aliens: [number, number][] = [];
    for (let k = 0; k < 40 && aliens.length < 4 && cand.length; k++) {
      const c = cand[Math.floor(r() * cand.length)];
      if (aliens.every(([ax, ay]) => Math.max(Math.abs(ax - c[0]), Math.abs(ay - c[1])) >= 2)) aliens.push(c);
    }
    if ((reach >= 72 && aliens.length === 4) || tries > 60) return { map: m, aliens };
  }
}

// ---- drawing (flat shapes; DIM fades remembered tiles into the murk) ------------------------

let DIM = 0;
const dimCache = new Map<string, string>();
const C = (hex: string) => {
  if (!DIM) return hex;
  let v = dimCache.get(hex);
  if (!v) { v = mix(hex, "#0a262c", 0.6); dimCache.set(hex, v); }
  return v;
};
const CORAL = [["#ff7a6e", "#ffc1a8", "#c9564e"], ["#ffb36b", "#ffe0b0", "#c98340"], ["#ff6f91", "#ffc0d0", "#c44a6c"]];

function diamond(ctx: Ctx, cx: number, cy: number, inset: number, fill: string) {
  const hw = TW / 2 - inset, hh = TH / 2 - inset / 2;
  poly(ctx, [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]], fill);
}

function drawRock(ctx: Ctx, cx: number, cy: number, s: number) {
  const w = 14 + s * 3, h = 13 + s * 8;
  ellipse(ctx, cx, cy + 1, w + 1, w * 0.42, "rgba(0,0,0,0.22)");
  poly(ctx, [[cx - w, cy], [cx - w * 0.75, cy - h * 0.75], [cx - w * 0.15, cy - h], [cx + w * 0.55, cy - h * 0.8], [cx + w, cy - h * 0.15], [cx + w * 0.6, cy + w * 0.28], [cx - w * 0.45, cy + w * 0.3]], C("#29444e"));
  poly(ctx, [[cx - w * 0.75, cy - h * 0.75], [cx - w * 0.15, cy - h], [cx + w * 0.55, cy - h * 0.8], [cx + w * 0.15, cy - h * 0.42], [cx - w * 0.55, cy - h * 0.45]], C("#3d6571"));
  poly(ctx, [[cx + w * 0.55, cy - h * 0.8], [cx + w, cy - h * 0.15], [cx + w * 0.6, cy + w * 0.28], [cx + w * 0.2, cy - h * 0.38]], C("#1f3740"));
  ellipse(ctx, cx - w * 0.3, cy - h * 0.8, w * 0.32, h * 0.12, C("#3f8a62"));
  circle(ctx, cx - w * 0.5, cy - h * 0.22, 1.6, C("#a9c4bb"));
  circle(ctx, cx - w * 0.33, cy - h * 0.1, 1.1, C("#a9c4bb"));
}

function drawCoral(ctx: Ctx, cx: number, cy: number, s: number) {
  const [col, tip, base] = CORAL[Math.floor(s * 3) % 3];
  ellipse(ctx, cx, cy + 1, 11, 4.5, "rgba(0,0,0,0.2)");
  ellipse(ctx, cx, cy - 2, 8, 3.6, C(base));
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.42 + (s - 0.5) * 0.3;
    const len = 10 + hash(s * 10 + k) * 7;
    const bx = cx + (k - 2) * 2.5, ex = bx + Math.cos(a) * len, ey = cy - 3 + Math.sin(a) * len;
    line(ctx, [[bx, cy - 3], [(bx + ex) / 2 + (k - 2) * 1.4, (cy - 3 + ey) / 2], [ex, ey]], 3.2, C(col));
    circle(ctx, ex, ey, 2.4, C(tip));
  }
}

function drawKelp(ctx: Ctx, cx: number, cy: number, s: number, t: number) {
  ellipse(ctx, cx, cy + 1, 9, 3.5, "rgba(0,0,0,0.16)");
  for (let k = 0; k < 3; k++) {
    const bx = cx + (k - 1) * 5 + (s - 0.5) * 4, hgt = 22 + hash(s * 7 + k) * 14;
    const pts: [number, number][] = [];
    for (let j = 0; j <= 4; j++) { const f = j / 4; pts.push([bx + Math.sin(t * 1.3 + k * 1.7 + s * 6 + f * 2) * 3.2 * f, cy - f * hgt]); }
    line(ctx, pts, 2.6, C(k === 1 ? "#3fae6e" : "#2f8f5c"));
    for (let j = 1; j < 4; j++) { const [lx, ly] = pts[j]; ellipse(ctx, lx + (j % 2 ? 3 : -3), ly, 3.2, 1.6, C("#4cc584")); }
  }
}

function drawWreck(ctx: Ctx, cx: number, cy: number, s: number) {
  ellipse(ctx, cx, cy + 2, 17, 6, "rgba(0,0,0,0.22)");
  poly(ctx, [[cx - 17, cy + 3], [cx - 13, cy - 13], [cx + 13, cy - 19], [cx + 17, cy - 3], [cx + 4, cy + 6]], C("#6e3f2c"));
  poly(ctx, [[cx - 13, cy - 13], [cx + 13, cy - 19], [cx + 14, cy - 15], [cx - 12, cy - 9]], C("#94573a"));
  poly(ctx, [[cx + 13, cy - 19], [cx + 17, cy - 3], [cx + 13, cy - 2], [cx + 10, cy - 15]], C("#5a3222"));
  for (let k = 0; k < 4; k++) circle(ctx, cx - 9 + k * 6, cy - 7 - k * 1.3, 1.1, C("#c07a4e"));
  circle(ctx, cx + 2, cy - 2, 3.6, C("#c08a4a"));
  circle(ctx, cx + 2, cy - 2, 2.3, C("#0b2c33"));
  if (s > 0.5) {
    fillRR(ctx, cx - 18, cy - 8, 7, 10, 2, C("#3d6a74"));
    fillRR(ctx, cx - 18, cy - 5, 7, 2, 1, C("#d9a03a"));
  }
}

function drawSub(ctx: Ctx, cx: number, cy: number, t: number) {
  const a = Math.atan2(TH, -TW), ca = Math.cos(a), sa = Math.sin(a);
  ctx.beginPath(); ctx.ellipse(cx, cy + 3, 40, 11, a, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fill();
  // propeller at the stern
  const px = cx + ca * 39, py = cy - 11 + sa * 39;
  for (let b = 0; b < 3; b++) {
    const k = Math.sin(t * 9 + b * 2.1);
    ellipse(ctx, px, py + k * 5, 2, 5 * Math.abs(k) + 1, "#8a5c18");
  }
  ctx.beginPath(); ctx.ellipse(cx, cy - 9, 37, 12, a, 0, Math.PI * 2); ctx.fillStyle = "#a8741f"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, cy - 13, 36, 11, a, 0, Math.PI * 2); ctx.fillStyle = "#d9a03a"; ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx - 2, cy - 17, 26, 4.5, a, 0, Math.PI * 2); ctx.fillStyle = "#f0c264"; ctx.fill();
  for (const k of [-20, -8, 4]) {
    const hx = cx + ca * k, hy = cy - 11 + sa * k;
    circle(ctx, hx, hy, 3.6, "#8a5c18");
    circle(ctx, hx, hy, 2.5, "#0b2c33");
    circle(ctx, hx - 0.7, hy - 0.7, 1, "#8ff3ff");
  }
  fillRR(ctx, cx + 2, cy - 33, 14, 14, 4, "#c48d2c");
  fillRR(ctx, cx + 4, cy - 30, 10, 3, 1.5, "#0b2c33");
  line(ctx, [[cx + 12, cy - 33], [cx + 12, cy - 40], [cx + 16, cy - 40]], 1.6, "#8a5c18");
  circle(ctx, cx + 9, cy - 35, 1.4, Math.sin(t * 3) > 0 ? "#4ff0a0" : "#1d5a40");
}

function drawDiver(ctx: Ctx, cx: number, cy: number, u: Unit, t: number, calm: boolean) {
  const f = u.face;
  const hk = Math.max(0, u.hurt - t) / 0.4;
  if (hk > 0 && !calm) cx += Math.sin(t * 70) * 1.6 * hk;
  ellipse(ctx, cx, cy, 9, 3.4, "rgba(0,0,0,0.3)");
  fillRR(ctx, cx - 5, cy - 7, 4, 7, 1.5, "#1d4f5c");
  fillRR(ctx, cx + 1, cy - 7, 4, 7, 1.5, "#1d4f5c");
  fillRR(ctx, cx - 5.5, cy - 2, 5, 2.5, 1, "#0f2f37");
  fillRR(ctx, cx + 0.5, cy - 2, 5, 2.5, 1, "#0f2f37");
  fillRR(ctx, cx - f * 7 - 2.5, cy - 19, 5, 11, 2.5, "#b9c4c8");
  fillRR(ctx, cx - 6.5, cy - 17, 13, 11, 4, "#2f8f94");
  fillRR(ctx, cx - 6.5, cy - 17, 13, 3, 1.5, u.tag);
  fillRR(ctx, cx - 6.5, cy - 9, 13, 2.4, 1, "#d9a03a");
  // harpoon gun
  const gx = f > 0 ? cx + 2 : cx - 12;
  fillRR(ctx, gx, cy - 13, 10, 3.2, 1.5, "#3b4a52");
  circle(ctx, f > 0 ? gx + 10 : gx, cy - 11.4, 1.3, "#8ff3ff");
  // helmet
  circle(ctx, cx, cy - 21, 7.2, "#e2a93b");
  ellipse(ctx, cx, cy - 15.8, 6.6, 2, "#b77d22");
  circle(ctx, cx - 2.6, cy - 24.2, 2, "#f6d58a");
  circle(ctx, cx + f * 1.6, cy - 21, 4.1, "#0b2c33");
  const blink = !calm && Math.sin(t * 1.3 + u.id * 2) > 0.97;
  if (!blink) {
    circle(ctx, cx + f * 1.6 - 1.6, cy - 21.3, 0.95, "#8ff3ff");
    circle(ctx, cx + f * 1.6 + 1.6, cy - 21.3, 0.95, "#8ff3ff");
  }
  circle(ctx, cx, cy - 28.6, 1.3, Math.sin(t * 2 + u.id) > 0 ? "#ff6f6f" : "#7a2a2a");
  if (hk > 0) circle(ctx, cx, cy - 15, 11, `rgba(255,120,110,${0.35 * hk})`);
}

function alienBob(u: Unit, t: number, calm: boolean) {
  const b = calm ? 0 : Math.sin(t * 2 + u.id * 1.3);
  return u.kind === "jelly" ? 8 + b * 2.5 : u.kind === "lantern" ? 4 + b * 1.6 : 0;
}

function drawAlien(ctx: Ctx, cx: number, cy: number, u: Unit, t: number, calm: boolean) {
  const f = u.face;
  const hk = Math.max(0, u.hurt - t) / 0.4;
  if (hk > 0 && !calm) cx += Math.sin(t * 70) * 1.8 * hk;
  const wt = calm ? 0 : t;
  if (u.kind === "jelly") {
    const by = cy - 14 - alienBob(u, t, calm);
    ellipse(ctx, cx, cy, 8, 3, "rgba(0,0,0,0.22)");
    for (let i = 0; i < 4; i++) {
      const x = cx + (i - 1.5) * 3.6;
      line(ctx, [[x, by], [x + Math.sin(wt * 3 + i) * 2, by + 6], [x + Math.sin(wt * 3 + i + 1) * 3, by + 12]], 1.8, "#d7b3ff");
    }
    ctx.beginPath(); ctx.ellipse(cx, by, 10.5, 10, 0, Math.PI, 0); ctx.closePath(); ctx.fillStyle = "#a77cf0"; ctx.fill();
    fillRR(ctx, cx - 11.5, by - 1.5, 23, 4, 2, "#6c4ac0");
    ellipse(ctx, cx - 3.5, by - 6.5, 3.6, 2, "#dcc8ff");
    glow(ctx, cx, by - 3, 11, "#ff5fd2", 0.4);
    circle(ctx, cx - 3.5 + f, by - 3.5, 1.9, "#ffd0f2");
    circle(ctx, cx + 3.5 + f, by - 3.5, 1.9, "#ffd0f2");
    line(ctx, [[cx, by - 10], [cx + 2, by - 14]], 1.2, "#6c4ac0");
    circle(ctx, cx + 2, by - 14.5, 1.4, "#ff5fd2");
  } else if (u.kind === "squid") {
    const lk = Math.max(0, u.lunge - t) / 0.35;
    cx += f * 5 * Math.sin(lk * Math.PI);
    ellipse(ctx, cx, cy, 12, 4, "rgba(0,0,0,0.28)");
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1, k = i % 2;
      const wob = Math.sin(wt * 2.4 + i) * 1.5;
      const x0 = cx + side * (3 + k * 3), y0 = cy - 6;
      line(ctx, [[x0, y0], [x0 + side * (6 + k * 3), cy - 1 + wob * 0.3], [x0 + side * (10 + k * 3), cy - 4 + wob]], 3.4, "#7a2235");
      circle(ctx, x0 + side * (10 + k * 3), cy - 4 + wob, 1.8, "#c84a5e");
    }
    poly(ctx, [[cx - 9, cy - 6], [cx - 10.5, cy - 20], [cx - 5, cy - 33], [cx, cy - 36], [cx + 5, cy - 33], [cx + 10.5, cy - 20], [cx + 9, cy - 6]], "#b23a50");
    poly(ctx, [[cx, cy - 36], [cx + 5, cy - 33], [cx + 10.5, cy - 20], [cx + 9, cy - 6], [cx + 3, cy - 6]], "#962e44");
    fillRR(ctx, cx - 8, cy - 28, 16, 2, 1, "#8c2a3e");
    fillRR(ctx, cx - 9, cy - 11, 18, 2, 1, "#8c2a3e");
    poly(ctx, [[cx - 5, cy - 33], [cx - 9, cy - 37], [cx - 3, cy - 35]], "#d0566a");
    poly(ctx, [[cx + 5, cy - 33], [cx + 9, cy - 37], [cx + 3, cy - 35]], "#d0566a");
    glow(ctx, cx + f * 2, cy - 20, 13, "#ffd23a", 0.45);
    ellipse(ctx, cx + f * 2, cy - 20, 5.2, 3.4, "#ffd23a");
    ellipse(ctx, cx + f * 3.2, cy - 20, 2, 2.4, "#3a1a10");
  } else {
    const by = cy - alienBob(u, t, calm);
    ellipse(ctx, cx, cy, 10, 3.5, "rgba(0,0,0,0.25)");
    poly(ctx, [[cx - f * 9, by - 12], [cx - f * 17, by - 19], [cx - f * 16, by - 4]], "#24344a");
    circle(ctx, cx, by - 11, 11, "#2c3e52");
    ellipse(ctx, cx + f * 1, by - 6, 8, 4.5, "#3c556d");
    ctx.beginPath(); ctx.arc(cx + f * 4, by - 9, 5.5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.closePath(); ctx.fillStyle = "#0e1620"; ctx.fill();
    for (let k = 0; k < 3; k++) poly(ctx, [[cx + f * 4 - 4 + k * 3, by - 8.6], [cx + f * 4 - 2.5 + k * 3, by - 8.6], [cx + f * 4 - 3.25 + k * 3, by - 6.6]], "#e8f0f0");
    circle(ctx, cx + f * 4, by - 15, 3, "#e8f0f0");
    circle(ctx, cx + f * 4.8, by - 15, 1.5, "#0e1620");
    const lx = cx + f * 11, ly = by - 30 + (calm ? 0 : Math.sin(t * 2.6 + u.id) * 1.5);
    line(ctx, [[cx + f * 1, by - 21], [cx + f * 6, by - 30], [lx, ly]], 1.6, "#3c556d");
    glow(ctx, lx, ly, 15, "#9dff6a", 0.45 + (calm ? 0 : 0.12 * Math.sin(t * 4)));
    circle(ctx, lx, ly, 3, "#d8ffb0");
  }
  if (hk > 0) circle(ctx, cx, cy - 16, 13, `rgba(255,255,255,${0.3 * hk})`);
}
const bodyOff = (u: Unit) => (u.kind === "diver" ? 15 : u.kind === "squid" ? 20 : u.kind === "jelly" ? 20 : 14);

// ---- the game ---------------------------------------------------------------------------

export async function playBotCom(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope();
  try {
    const f = mountFrame(body, scope, "BOT-COM: Terror from the Deep Sea", "bx");
    const S = new Session(host, opts, { base: 0.3, step: 0.15, calm: 0.1 });
    const sk = S.skill;
    const calm = reducedMotion();
    const tempo = clamp(opts.maxMs / 108000, 0.5, 0.9);
    const W = f.w, H = f.h, MH = H - PANEL;
    const { ctx } = addCanvas(f.stage, W, MH);
    const ox = Math.round(W / 2), oy = Math.round((MH - (GW + GH) * TH / 2) / 2) + 12;
    const sx = (x: number, y: number) => ox + (x - y) * TW / 2;
    const sy = (x: number, y: number) => oy + (x + y) * TH / 2 + TH / 2;
    const wait = (ms: number) => nap(host, ms * tempo);

    f.stage.insertAdjacentHTML("beforeend", `
      <div class="gm-bx-banner" aria-live="polite"></div>
      <div class="gm-bx-tip"></div>
      <div class="gm-bx-panel">
        <div class="gm-bx-who"><b class="gm-bx-name"></b>
          <div class="gm-bx-row"><span>TU</span><i class="gm-bx-bar gm-bx-tu"><i></i></i><em class="gm-bx-tuv"></em></div>
          <div class="gm-bx-row"><span>HP</span><i class="gm-bx-bar gm-bx-hp"><i></i></i><em class="gm-bx-hpv"></em></div>
        </div>
        <div class="gm-bx-squad">${SQUAD.map((_, i) => `<div class="gm-bx-sq" data-i="${i}"><b>${i + 1}</b><i><i></i></i></div>`).join("")}</div>
        <div class="gm-bx-btn" data-k="snap"><b>Snap</b><span>${DV.snap} TU</span></div>
        <div class="gm-bx-btn" data-k="aimed"><b>Aimed</b><span>${DV.aimed} TU</span></div>
        <div class="gm-bx-btn gm-bx-end" data-k="end"><b>End turn</b></div>
      </div>
      <div class="gm-bx-intro"><b class="gm-bx-op"></b><span class="gm-bx-site"></span><span>4 divers deployed. Hostiles unknown.</span></div>
      <div class="gm-bx-deb"><b class="gm-bx-deb-t"></b><span class="gm-bx-deb-op"></span><div class="gm-bx-deb-rows"></div><p class="gm-bx-deb-line"></p></div>`);
    const q = (s: string) => f.stage.querySelector(s) as HTMLElement;
    const bannerEl = q(".gm-bx-banner"), tipEl = q(".gm-bx-tip"), introEl = q(".gm-bx-intro"), debEl = q(".gm-bx-deb");
    const nameEl = q(".gm-bx-name"), tuBar = q(".gm-bx-tu > i"), hpBar = q(".gm-bx-hp > i"), tuV = q(".gm-bx-tuv"), hpV = q(".gm-bx-hpv");
    const sqEls = [...f.stage.querySelectorAll(".gm-bx-sq")] as HTMLElement[];
    const snapBtn = q('[data-k="snap"]'), aimBtn = q('[data-k="aimed"]'), endBtn = q('[data-k="end"]');

    let M!: Mission;
    const shots: Shot[] = [], parts: Fx[] = [], floats: Float[] = [];
    const ambient: Fx[] = [];

    const divers = () => M.units.filter((u) => u.side === "x" && u.alive);
    const aliens = () => M.units.filter((u) => u.side === "a" && u.alive);
    const pos = (u: Unit): [number, number] => {
      const k = clamp((now() - u.t0) / u.dur);
      return [lerp(u.fx, u.x, k), lerp(u.fy, u.y, k)];
    };
    const scr = (u: Unit): [number, number] => { const [px, py] = pos(u); return [sx(px, py), sy(px, py)]; };
    const occupied = (x: number, y: number, me: Unit) => M.units.some((u) => u !== me && u.alive && u.x === x && u.y === y);
    const los = (ax: number, ay: number, bx: number, by: number) => {
      let x = ax, y = ay;
      const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), stx = ax < bx ? 1 : -1, sty = ay < by ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        if (x === bx && y === by) return true;
        if (!(x === ax && y === ay) && BLOCK_LOS[M.map[idx(x, y)]]) return false;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += stx; }
        if (e2 <= dx) { err += dx; y += sty; }
      }
    };
    const sees = (a: Unit, b: Unit, range = SIGHT) => Math.hypot(a.x - b.x, a.y - b.y) <= range && los(a.x, a.y, b.x, b.y);
    const snapOf = (u: Unit) => (u.kind === "diver" ? DV.snap : AL[u.kind].snap);
    const aimedOf = (u: Unit) => (u.kind === "diver" ? DV.aimed : AL[u.kind].aimed);
    const coverFrom = (x: number, y: number, fx: number, fy: number) => {
      const dx = Math.sign(fx - x), dy = Math.sign(fy - y);
      let c = M.map[idx(x, y)] === 3 ? COVER[3] : 0;
      const cand: [number, number, number][] = [[dx, dy, 1]];
      if (dx && dy) cand.push([dx, 0, 0.75], [0, dy, 0.75]);
      for (const [ax, ay, w] of cand) {
        if (!ax && !ay) continue;
        const nx = x + ax, ny = y + ay;
        if (inb(nx, ny)) c = Math.max(c, COVER[M.map[idx(nx, ny)]] * w);
      }
      return c;
    };
    const coverVs = (x: number, y: number, foes: { x: number; y: number }[]) =>
      foes.length ? foes.reduce((a, o) => a + coverFrom(x, y, o.x, o.y), 0) / foes.length : 0;
    const hitChance = (s: Unit, t: Unit, mode: Mode) => {
      const d = Math.hypot(t.x - s.x, t.y - s.y);
      // the robot's own steadiness on the mouse nudges its divers' aim a little
      let c = s.acc * (mode === "aimed" ? 1.18 : 0.8) * (s.side === "x" ? 0.88 + 0.22 * sk : 1);
      c -= Math.max(0, d - 3) * 0.04;
      c -= coverFrom(t.x, t.y, s.x, s.y);
      return clamp(c, 0.05, 0.95);
    };

    const updateVis = () => {
      M.vis.fill(0);
      for (const d of divers()) for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const i = idx(x, y);
        if (!M.vis[i] && Math.hypot(x - d.x, y - d.y) <= SIGHT && los(d.x, d.y, x, y)) M.vis[i] = 1;
      }
      for (let i = 0; i < M.vis.length; i++) if (M.vis[i]) M.seen[i] = 1;
      const fresh: Unit[] = [];
      for (const a of aliens()) {
        const v = !!M.vis[idx(a.x, a.y)];
        if (v) { if (!a.vis) fresh.push(a); a.last = { x: a.x, y: a.y }; }
        else if (a.last && M.vis[idx(a.last.x, a.last.y)]) a.last = null;
        a.vis = v;
      }
      return fresh;
    };

    const dijkstra = (u: Unit, budget: number) => {
      const N = GW * GH, cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
      cost[idx(u.x, u.y)] = 0;
      for (;;) {
        let best = -1, bc = Infinity;
        for (let i = 0; i < N; i++) if (!done[i] && cost[i] < bc) { bc = cost[i]; best = i; }
        if (best < 0 || bc > budget) break;
        done[best] = 1;
        const bx = best % GW, by = (best / GW) | 0;
        for (const [dx, dy] of DIRS) {
          const nx = bx + dx, ny = by + dy;
          if (!inb(nx, ny)) continue;
          const ni = idx(nx, ny);
          if (BLOCK_MOVE[M.map[ni]] || occupied(nx, ny, u)) continue;
          if (dx && dy && (BLOCK_MOVE[M.map[idx(bx + dx, by)]] || BLOCK_MOVE[M.map[idx(bx, by + dy)]])) continue;
          const c = bc + (dx && dy ? 6 : 4);
          if (c < cost[ni]) { cost[ni] = c; prev[ni] = best; }
        }
      }
      return { cost, prev };
    };
    const pathFrom = (prev: Int32Array, end: number) => {
      const out: [number, number][] = [];
      for (let i = end; prev[i] >= 0; i = prev[i]) out.unshift([i % GW, (i / GW) | 0]);
      return out;
    };
    const pathCost = (u: Unit, p: [number, number][]) => {
      let x = u.x, y = u.y, c = 0;
      for (const [nx, ny] of p) { c += nx !== x && ny !== y ? 6 : 4; x = nx; y = ny; }
      return c;
    };

    // ---- UI bits ----
    const header = () => f.setScore(M.phase === "end" ? "Debrief" : `Turn ${M.turn}   Hostiles ${aliens().length}`);
    const panelUpdate = () => {
      const u = M.sel && M.sel.alive ? M.sel : divers()[0] ?? M.units[0];
      nameEl.textContent = u.name;
      tuBar.style.width = `${(u.tu / u.maxTu) * 100}%`;
      hpBar.style.width = `${(Math.max(0, u.hp) / u.max) * 100}%`;
      tuV.textContent = String(Math.max(0, u.tu));
      hpV.textContent = String(Math.max(0, u.hp));
      M.units.filter((x) => x.side === "x").forEach((d, i) => {
        const el = sqEls[i];
        el.classList.toggle("gm-on", d === M.sel && d.alive);
        el.classList.toggle("gm-dead", !d.alive);
        (el.querySelector("i > i") as HTMLElement).style.width = `${(Math.max(0, d.hp) / d.max) * 100}%`;
      });
      const mine = M.phase === "squad" && M.sel?.alive;
      snapBtn.classList.toggle("gm-off", !mine || u.tu < DV.snap);
      aimBtn.classList.toggle("gm-off", !mine || u.tu < DV.aimed);
      endBtn.classList.toggle("gm-off", M.phase !== "squad");
    };
    const banner = (s: string, tone: "squad" | "alien" | "plain" = "plain") => {
      bannerEl.textContent = s;
      bannerEl.dataset.tone = tone;
      scope.fromTo(bannerEl, { opacity: 0, y: calm ? 0 : -6 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
    };
    const hideBanner = () => scope.to(bannerEl, { opacity: 0, duration: 0.3 });
    const showTip = (x: number, y: number, html: string) => {
      tipEl.innerHTML = html;
      tipEl.style.left = `${Math.round(clamp(x, 40, W - 40))}px`;
      tipEl.style.top = `${Math.round(Math.max(22, y))}px`;
      scope.fromTo(tipEl, { opacity: 0 }, { opacity: 1, duration: 0.15 });
    };
    const hideTip = () => scope.to(tipEl, { opacity: 0, duration: 0.15 });
    const say = (x: number, y: number, s: string, c: string) => {
      // stack above any label still floating nearby so simultaneous hits stay readable
      const t0 = now();
      for (let n = 0; n < 6 && floats.some((o) => t0 - o.t0 < 0.9 && Math.abs(o.x - x) < 56 && Math.abs(o.y - y) < 13); n++) y -= 13;
      floats.push({ x, y, s, c, t0 });
    };
    const press = async (el: HTMLElement, ms = 300) => {
      el.classList.add("gm-hot");
      try { await host.pointAt(el, 0.5, 0.5, ms); await host.click(); } finally { el.classList.remove("gm-hot"); }
    };

    // ---- combat ----
    const burst = (x: number, y: number, c: string, n: number, kind: Fx["kind"], spd = 40) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random());
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === "bubble" ? 20 : 10), life: 0, max: 0.6 + Math.random() * 0.8, kind, c, r: kind === "bolt" ? 1.6 + Math.random() * 1.4 : 1 + Math.random() * 1.6, a: Math.random() * 6, va: (Math.random() - 0.5) * 12 });
      }
    };
    const kill = (t: Unit) => {
      t.alive = false;
      t.gone = now();
      const [x, y] = scr(t);
      if (t.side === "a") {
        M.kills++;
        burst(x, y - bodyOff(t), "#b9c4c8", 12, "bolt", 55);
        burst(x, y - bodyOff(t), AL[t.kind as AlienKind].bolt, 8, "spark", 70);
        burst(x, y - bodyOff(t), "#cfefff", 7, "bubble", 25);
        say(x, y - 40, "Recycled", "#f3dca2");
      } else {
        M.lost++;
        burst(x, y - 16, "#cfefff", 10, "bubble", 22);
        say(x, y - 44, "Recall buoy", "#ffb36b");
      }
      header();
    };
    const fire = async (s: Unit, t: Unit, mode: Mode) => {
      const ch = hitChance(s, t, mode);
      s.tu -= mode === "aimed" ? aimedOf(s) : snapOf(s);
      const [ax, ay] = scr(s), [bx, by] = scr(t);
      s.face = bx >= ax ? 1 : -1;
      t.face = -s.face;
      if (s.side === "a") s.flash = now() + 2;
      const hit = Math.random() < ch;
      const x0 = ax + s.face * 10, y0 = ay - (s.kind === "diver" ? 12 : bodyOff(s));
      let x1 = bx, y1 = by - bodyOff(t);
      if (!hit) {
        const dx = t.x - s.x, dy = t.y - s.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        const k = 0.5 + Math.random() * 1.3, side = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
        const mx = clamp(t.x + ux * k - uy * side, -0.4, GW - 0.6), my = clamp(t.y + uy * k + ux * side, -0.4, GH - 0.6);
        x1 = sx(mx, my); y1 = sy(mx, my) - 3;
      }
      if (s.side === "a" && s.kind !== "diver") await wait(200);
      const dur = 0.16 + Math.hypot(x1 - x0, y1 - y0) / 900;
      shots.push({ x0, y0, x1, y1, t0: now(), dur, c: s.side === "x" ? "#8ff3ff" : AL[s.kind as AlienKind].bolt });
      await nap(host, dur * 1000);
      if (hit) {
        const [lo, hi] = s.kind === "diver" ? DV.dmg : AL[s.kind].dmg;
        const dmg = Math.round(lo + Math.random() * (hi - lo));
        t.hp -= dmg;
        t.hurt = now() + 0.4;
        burst(x1, y1, s.side === "x" ? "#8ff3ff" : AL[s.kind as AlienKind].bolt, 7, "spark", 50);
        say(bx, by - bodyOff(t) - 14, `-${dmg}`, s.side === "x" ? "#ffe28a" : "#ff8f9a");
        if (t.hp <= 0) kill(t);
      } else {
        burst(x1, y1, "#7fb8a8", 6, "sand", 26);
        say(x1, y1 - 8, "Miss", "#bfe3de");
      }
      panelUpdate();
      await wait(200);
      return hit;
    };
    const lunge = async (a: Unit, t: Unit) => {
      a.tu -= 14;
      const [ax] = scr(a), [bx, by] = scr(t);
      a.face = bx >= ax ? 1 : -1;
      a.flash = now() + 2;
      a.lunge = now() + 0.35;
      await nap(host, 220);
      if (Math.random() < 0.78) {
        const dmg = Math.round(30 + Math.random() * 16);
        t.hp -= dmg; t.hurt = now() + 0.4;
        burst(bx, by - 15, "#ffb03a", 8, "spark", 50);
        say(bx, by - 30, `Bonk -${dmg}`, "#ff8f9a");
        if (t.hp <= 0) kill(t);
      } else say(bx, by - 30, "Dodged", "#bfe3de");
      panelUpdate();
      await wait(420);
    };
    // the other side gets a snap shot at a unit that moves in its view
    const reaction = async (mover: Unit) => {
      const foes = mover.side === "x" ? aliens() : divers();
      for (const r of foes) {
        if (!mover.alive || r.reacted >= 2 || r.tu < snapOf(r) || !sees(r, mover)) continue;
        const p = r.side === "a" ? 0.08 + 0.24 * (r.tu / r.maxTu) : 0.06 + (0.16 + 0.24 * sk) * (r.tu / r.maxTu);
        if (!chance(p)) continue;
        r.reacted++;
        if (r.side === "a") M.alert = true;
        const [x, y] = scr(r);
        say(x, y - 44, "Reaction fire", "#f3dca2");
        await fire(r, mover, "snap");
        return;
      }
    };
    const contact = (fresh: Unit[]) => {
      M.alert = true;
      for (const a of fresh) { const [x, y] = scr(a); say(x, y - 46, "!", "#ff8fb0"); }
      host.react("surprised");
    };

    // walk a path tile by tile; stops on first contact
    const stepAlong = async (u: Unit, path: [number, number][]) => {
      const sawBefore = u.side === "a" && divers().some((d) => sees(u, d));
      for (const [nx, ny] of path) {
        if (!u.alive || S.over) return;
        const c = nx !== u.x && ny !== u.y ? 6 : 4;
        if (u.tu < c || occupied(nx, ny, u)) return;
        const show = u.side === "x" || !!M.vis[idx(u.x, u.y)] || !!M.vis[idx(nx, ny)];
        const [px, py] = pos(u);
        u.fx = px; u.fy = py; u.x = nx; u.y = ny; u.t0 = now(); u.dur = show ? (STEP * tempo) / 1000 : 0.001;
        if (sx(nx, ny) !== sx(px, py)) u.face = sx(nx, ny) > sx(px, py) ? 1 : -1;
        u.tu -= c;
        if (u.side === "x" && M.path) M.path = M.path.slice(1);
        if (show) {
          await nap(host, STEP * tempo);
          if (!calm && chance(0.45)) { const [bx, by] = scr(u); burst(bx, by - 26, "#cfefff", 1, "bubble", 8); }
        }
        const fresh = updateVis();
        if (u.side === "x") {
          if (fresh.length) contact(fresh);
          panelUpdate();
          await reaction(u);
          if (fresh.length) { faceFoe(u); return; }
        } else {
          if (fresh.includes(u)) contact([u]);
          const seesNow = divers().some((d) => sees(u, d));
          if (seesNow) M.alert = true;
          if (u.vis) await reaction(u);
          if (seesNow && !sawBefore) return;
        }
      }
    };

    const faceFoe = (u: Unit) => {
      const ks = u.side === "x" ? known() : divers();
      if (!ks.length) return;
      const k = ks.reduce((b, o) => (Math.hypot(o.x - u.x, o.y - u.y) < Math.hypot(b.x - u.x, b.y - u.y) ? o : b));
      if (sx(k.x, k.y) !== sx(u.x, u.y)) u.face = sx(k.x, k.y) > sx(u.x, u.y) ? 1 : -1;
    };

    // ---- squad brain ----
    const known = () => aliens().filter((a) => a.vis || a.last).map((a) => (a.vis ? { x: a.x, y: a.y } : a.last!));
    const objective = (u: Unit, ks: { x: number; y: number }[]): [number, number] => {
      if (ks.length) {
        const k = ks.reduce((b, o) => (Math.hypot(o.x - u.x, o.y - u.y) < Math.hypot(b.x - u.x, b.y - u.y) ? o : b));
        return [k.x, k.y];
      }
      let best: [number, number] = [8, 2], bs = Infinity;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        if (M.seen[idx(x, y)] || BLOCK_MOVE[M.map[idx(x, y)]]) continue;
        const s = Math.hypot(x - 8.5, y - 2.5) * 0.6 + Math.hypot(x - u.x, y - u.y) * 0.4 + hash(x * 13 + y * 7 + u.id) * 1.5;
        if (s < bs) { bs = s; best = [x, y]; }
      }
      return best;
    };
    const chooseMove = (u: Unit, smart: boolean, wantShot: boolean) => {
      const { cost, prev } = dijkstra(u, u.tu);
      const ks = known();
      const [gx, gy] = objective(u, ks);
      const start = idx(u.x, u.y);
      let best = -1, bs = -Infinity;
      for (let i = 0; i < GW * GH; i++) {
        if (cost[i] > u.tu) continue;
        const x = i % GW, y = (i / GW) | 0, left = u.tu - cost[i];
        let s = -Math.hypot(x - gx, y - gy) * (smart ? 1 : 1.3);
        if (ks.length) {
          const nd = Math.min(...ks.map((k) => Math.hypot(k.x - x, k.y - y)));
          const seesAny = ks.some((k) => Math.hypot(k.x - x, k.y - y) <= RANGE && los(x, y, k.x, k.y));
          if (smart) {
            s = -Math.abs(nd - 5) * 0.9 + coverVs(x, y, ks) * 14;
            if (seesAny) s += wantShot ? 3 : 1.5;
            s += left >= DV.aimed ? 1.5 : left >= DV.snap ? 0.8 : -2;
            if (nd < 2.5) s -= 3;
          } else s = -nd * 0.8 + (seesAny ? 1 : 0);
        } else if (smart) {
          s += coverVs(x, y, [{ x: gx, y: gy }]) * 8 + (left >= DV.snap ? 1 : -1.5);
        }
        if (smart) for (const d of divers()) if (d !== u && Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) <= 1) s -= 0.7;
        s += (Math.random() - 0.5) * (smart ? 0.6 : 2.4);
        if (i === start) s -= 0.5;
        if (s > bs) { bs = s; best = i; }
      }
      if (best < 0 || best === start) return null;
      return pathFrom(prev, best);
    };
    const coverMove = (u: Unit) => {
      const { cost, prev } = dijkstra(u, u.tu);
      const ks = known();
      let best = -1, bs = coverVs(u.x, u.y, ks) + 0.05;
      for (let i = 0; i < GW * GH; i++) {
        if (cost[i] > u.tu || cost[i] > 12) continue;
        const c = coverVs(i % GW, (i / GW) | 0, ks) - cost[i] * 0.004;
        if (c > bs) { bs = c; best = i; }
      }
      return best >= 0 ? pathFrom(prev, best) : null;
    };
    const pickShot = (u: Unit, smart: boolean) => {
      const ts = aliens().filter((a) => a.vis && sees(u, a, RANGE));
      if (!ts.length || u.tu < DV.snap) return null;
      const modes: Mode[] = u.tu >= DV.aimed ? ["snap", "aimed"] : ["snap"];
      if (!smart) {
        const t = pick(ts), mode: Mode = modes.length > 1 && !chance(0.7) ? "aimed" : "snap";
        return { t, mode, ch: hitChance(u, t, mode) };
      }
      let best: { t: Unit; mode: Mode; ch: number } | null = null, bv = -Infinity;
      for (const t of ts) for (const mode of modes) {
        const ch = hitChance(u, t, mode);
        const finish = t.hp <= 34 ? 1.6 : 1;
        const v = (ch * finish) / (mode === "aimed" ? DV.aimed : DV.snap);
        if (v > bv) { bv = v; best = { t, mode, ch }; }
      }
      return best;
    };

    const selectUnit = async (u: Unit) => {
      if (M.sel === u) return;
      if (chance(0.3)) await press(sqEls[u.id], 300);
      else {
        const [x, y] = scr(u);
        await host.pointAt(f.aim(x, y - 14, 16, 26), 0.5, 0.5, 320);
        await host.click();
      }
      M.sel = u;
      panelUpdate();
      await wait(think(sk, 120));
    };
    const walk = async (u: Unit, path: [number, number][]) => {
      if (chance(0.25 * (1 - sk))) {
        // hovers somewhere else first, then changes its mind
        const [hx, hy] = path[Math.max(0, Math.floor(path.length / 2) - 1)];
        await host.pointAt(f.aim(sx(hx, hy), sy(hx, hy), 20, 12), 0.5, 0.5, 280);
        M.path = path.slice(0, path.indexOf(path.find(([a, b]) => a === hx && b === hy)!) + 1);
        await wait(240);
      }
      const [dx, dy] = path[path.length - 1];
      await host.pointAt(f.aim(sx(dx, dy), sy(dx, dy), 20, 12), 0.5, 0.5, 320);
      M.path = path;
      showTip(sx(dx, dy), sy(dx, dy) - 12, `TU <b>${pathCost(u, path)}</b>`);
      await wait(think(sk, 240));
      await host.click();
      hideTip();
      await stepAlong(u, path);
      faceFoe(u);
      M.path = null;
      panelUpdate();
    };
    const robotShoot = async (u: Unit, s: { t: Unit; mode: Mode; ch: number }) => {
      const btn = s.mode === "snap" ? snapBtn : aimBtn;
      // the fire mode stays selected, so it only clicks when switching
      if (!btn.classList.contains("gm-on")) {
        await press(btn, 280);
        (btn === snapBtn ? aimBtn : snapBtn).classList.remove("gm-on");
        btn.classList.add("gm-on");
      }
      M.target = s.t;
      const [tx, ty] = scr(s.t);
      await host.pointAt(f.aim(tx, ty - bodyOff(s.t), 22, 26), 0.5, 0.5, 320);
      showTip(tx, ty - bodyOff(s.t) - 18, `${s.mode === "snap" ? "Snap" : "Aimed"} <b>${Math.round(s.ch * 100)}%</b>`);
      await wait(think(sk, 330));
      await host.click();
      hideTip();
      const hit = await fire(u, s.t, s.mode);
      M.target = null;
      if (hit) { M.misses = 0; if (!s.t.alive) host.react(chance(0.6) ? "cheer" : "laugh"); }
      else if (++M.misses >= 3) { host.react("angry"); M.misses = 0; }
    };
    const actUnit = async (u: Unit) => {
      const smart = chance(0.08 + 0.88 * sk);
      let moved = false, shot = false;
      for (let n = 0; n < 6 && u.alive && aliens().length; n++) {
        if (S.left < 6000) return;
        const s = pickShot(u, smart);
        if (s) {
          if (!moved && ((smart && s.ch < 0.26) || (!smart && chance(0.35)))) {
            const mv = chooseMove(u, smart, true);
            moved = true;
            if (mv) { await walk(u, mv); continue; }
          }
          if (smart && s.ch < 0.2 && u.tu < DV.aimed + DV.snap) break; // holds TU for reaction fire
          await robotShoot(u, s);
          shot = true;
          continue;
        }
        if (!moved) {
          const mv = chooseMove(u, smart, false);
          moved = true;
          if (mv) { await walk(u, mv); continue; }
        }
        break;
      }
      if (u.alive && smart && shot && u.tu >= 8 && known().length && coverVs(u.x, u.y, known()) < 0.1) {
        const mv = coverMove(u);
        if (mv && mv.length) await walk(u, mv);
      }
    };

    const squadTurn = async (): Promise<"win" | "abort" | "retreat" | null> => {
      M.phase = "squad";
      for (const d of divers()) d.tu = d.maxTu;
      for (const a of aliens()) a.reacted = 0;
      header(); panelUpdate();
      banner(`Turn ${M.turn}: squad`, "squad");
      await wait(750);
      hideBanner();
      host.react("focus");
      const order = divers().map((d) => ({ d, k: (aliens().some((a) => a.vis && sees(d, a, RANGE)) ? 0 : 10) + Math.random() * 3 })).sort((a, b) => a.k - b.k).map((o) => o.d);
      for (const u of order) {
        if (!u.alive) continue;
        if (!aliens().length) return "win";
        if (!divers().length) return null;
        if (S.left < 7000) return "abort";
        if (divers().length === 1 && aliens().length >= 3 && chance(0.3 + 0.5 * sk)) return "retreat";
        if (chance(0.05 * (1 - sk))) { host.react("relax"); await wait(700); continue; }
        await selectUnit(u);
        await actUnit(u);
      }
      if (!aliens().length) return "win";
      if (!divers().length) return null;
      await wait(think(sk, 250));
      await press(endBtn, 340);
      return null;
    };

    // ---- alien brain ----
    const alienMove = (a: Unit) => {
      const reserve = M.alert ? snapOf(a) : 0;
      const budget = M.alert ? a.tu - reserve : Math.min(a.tu, 14);
      const { cost, prev } = dijkstra(a, budget);
      const ds = divers();
      if (!ds.length) return null;
      let best = -1, bs = -Infinity;
      for (let i = 0; i < GW * GH; i++) {
        if (cost[i] > budget) continue;
        const x = i % GW, y = (i / GW) | 0;
        let s: number;
        if (!M.alert) s = -Math.hypot(x - 2.5, y - 8.5) * 0.8 + hash(i + M.turn * 13 + a.id * 7) * 2.5;
        else {
          const nd = Math.min(...ds.map((d) => Math.hypot(d.x - x, d.y - y)));
          const want = a.kind === "lantern" ? 6 : a.kind === "squid" ? 1 : 3.5;
          s = -Math.abs(nd - want) * 1.1 + coverVs(x, y, ds) * 6 + (Math.random() - 0.5) * 1.2;
          if (ds.some((d) => Math.hypot(d.x - x, d.y - y) <= SIGHT && los(x, y, d.x, d.y))) s += 2.5;
        }
        if (s > bs) { bs = s; best = i; }
      }
      if (best < 0 || best === idx(a.x, a.y)) return null;
      return pathFrom(prev, best);
    };
    const alienAct = async (a: Unit) => {
      let moved = false;
      for (let n = 0; n < 5 && a.alive && divers().length; n++) {
        if (S.left < 4000) return;
        const seen = divers().filter((d) => sees(a, d));
        if (seen.length) M.alert = true;
        if (seen.length) {
          const t = seen.reduce((b, d) => (d.hp + Math.hypot(d.x - a.x, d.y - a.y) * 6 < b.hp + Math.hypot(b.x - a.x, b.y - a.y) * 6 ? d : b));
          if (a.kind === "squid") {
            if (Math.max(Math.abs(t.x - a.x), Math.abs(t.y - a.y)) <= 1 && a.tu >= 14) { await lunge(a, t); continue; }
            if (!moved && a.tu >= 22 && chance(0.6)) {
              const { cost, prev } = dijkstra(a, a.tu - 14);
              let best = -1, bc = Infinity;
              for (const [dx, dy] of DIRS) {
                const nx = t.x + dx, ny = t.y + dy;
                if (inb(nx, ny) && cost[idx(nx, ny)] < bc) { bc = cost[idx(nx, ny)]; best = idx(nx, ny); }
              }
              moved = true;
              if (best >= 0 && bc <= a.tu - 14) { await stepAlong(a, pathFrom(prev, best)); continue; }
            }
          }
          const d = Math.hypot(t.x - a.x, t.y - a.y);
          const mode: Mode | null = a.tu >= aimedOf(a) && (d > 4 || chance(0.5)) ? "aimed" : a.tu >= snapOf(a) ? "snap" : null;
          if (!mode) return;
          await fire(a, t, mode);
          continue;
        }
        if (moved) return;
        moved = true;
        const p = alienMove(a);
        if (!p) return;
        await stepAlong(a, p);
        if (!M.alert) return;
      }
    };
    const alienTurn = async () => {
      M.phase = "alien";
      M.sel = null;
      snapBtn.classList.remove("gm-on"); aimBtn.classList.remove("gm-on");
      for (const a of aliens()) { a.tu = a.maxTu; }
      for (const d of divers()) d.reacted = 0;
      header(); panelUpdate();
      banner("Alien activity", "alien");
      await wait(650);
      for (const a of aliens()) {
        if (!divers().length || S.left < 4000) break;
        const visBefore = a.vis;
        await alienAct(a);
        if (visBefore || a.vis) await wait(150);
      }
      hideBanner();
      updateVis();
      await wait(300);
    };

    // ---- missions ----
    const newMission = (seed: number): Mission => {
      const r = rng(seed);
      const { map, aliens: aspawn } = genMap(r);
      const units: Unit[] = [];
      const mk = (o: Partial<Unit> & { side: "x" | "a"; kind: Kind; name: string; x: number; y: number; hp: number; tu: number; acc: number }): Unit => ({
        id: units.length, tag: "#ffffff", fx: o.x, fy: o.y, t0: 0, dur: 0.001, max: o.hp, maxTu: o.tu, alive: true, face: o.side === "x" ? 1 : -1,
        hurt: 0, flash: 0, gone: 0, vis: false, last: null, reacted: 0, lunge: 0, ...o,
      });
      SQUAD.forEach((s, i) => units.push(mk({ side: "x", kind: "diver", name: s.name, tag: s.tag, x: SPAWN[i][0], y: SPAWN[i][1], hp: DV.hp, tu: DV.tu, acc: s.acc })));
      const kinds: AlienKind[] = (["jelly", "squid", "lantern", r() < 0.5 ? "jelly" : "squid"] as AlienKind[]).sort(() => r() - 0.5);
      aspawn.forEach(([x, y], i) => {
        const k = kinds[i % kinds.length], a = AL[k];
        units.push(mk({ side: "a", kind: k, name: a.name, x, y, hp: a.hp, tu: a.tu, acc: a.acc }));
      });
      const lit: string[] = [], dim: string[] = [], dark: string[] = [];
      const objs: Mission["objs"] = [];
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const h = hash(x * 31 + y * 17 + seed);
        const base = mix(mix("#2b6a67", "#3a8278", h), "#245a5e", (x + y) / ((GW + GH) * 2.2));
        lit.push(base); dim.push(mix(base, "#0a262c", 0.62)); dark.push(mix("#05181d", "#082127", hash(x * 7 + y * 3)));
        const t = map[idx(x, y)];
        if (t && t !== 5) objs.push({ x, y, t, s: hash(x * 5 + y * 11 + seed * 3) });
      }
      return {
        map, units, vis: new Uint8Array(GW * GH), seen: new Uint8Array(GW * GH), lit, dim, dark, objs,
        turn: 1, alert: false, kills: 0, lost: 0, op: pick(OPS), site: pick(SITES), sel: null, path: null, target: null, phase: "squad", misses: 0,
      };
    };

    // ---- render ----
    const water = lin(ctx, 0, 0, 0, MH, [[0, "#0d4650"], [0.55, "#08313a"], [1, "#05222a"]]);
    const vignette = rad(ctx, W / 2, MH * 0.5, W * 0.72, [[0.55, "rgba(2,14,18,0)"], [1, "rgba(2,14,18,0.6)"]]);
    for (let i = 0; i < 12; i++) ambient.push({ x: Math.random() * W, y: Math.random() * MH, vx: 0, vy: -8 - Math.random() * 10, life: Math.random() * 6, max: 0, kind: "bubble", c: "#cfefff", r: 0.8 + Math.random() * 1.6, a: Math.random() * 6, va: 0 });

    const drawUnit = (u: Unit, t: number) => {
      const [px, py] = pos(u);
      const cx = sx(px, py), cy = sy(px, py);
      if (u.side === "x") {
        if (!u.alive) {
          const k = (t - u.gone) / 1.8;
          if (k > 1) return;
          const lift = Math.max(0, k - 0.3) * 90;
          ctx.save();
          ctx.globalAlpha = clamp(1.3 - k * 1.3);
          line(ctx, [[cx, cy - 26 - lift], [cx, cy - 34 - lift]], 1, "#f3dca2");
          circle(ctx, cx, cy - 38 - lift, 2 + Math.min(1, k * 4) * 5, "#ff9f5a");
          circle(ctx, cx - 1.5, cy - 40 - lift, 1.6 * Math.min(1, k * 4), "#ffd2b0");
          drawDiver(ctx, cx, cy - lift, u, t, calm);
          ctx.restore();
          return;
        }
        drawDiver(ctx, cx, cy, u, t, calm);
      } else if (u.alive && (u.vis || u.flash > t)) drawAlien(ctx, cx, cy, u, t, calm);
    };

    const draw = (t: number) => {
      const tt = calm ? 0 : t;
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, W, MH);
      for (let i = 0; i < 3; i++) {
        const x = 60 + i * 150 + Math.sin(tt * 0.3 + i * 2) * 20;
        poly(ctx, [[x, 0], [x + 46, 0], [x - 40, MH], [x - 110, MH]], `rgba(160,240,230,${0.035 + 0.015 * Math.sin(tt * 0.5 + i)})`);
      }
      // seabed slab
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const i = idx(x, y), cx = sx(x, y), cy = sy(x, y);
        const st = M.vis[i] ? 2 : M.seen[i] ? 1 : 0;
        if (x === GW - 1) poly(ctx, [[cx + TW / 2, cy], [cx, cy + TH / 2], [cx, cy + TH / 2 + 9], [cx + TW / 2, cy + 9]], st ? "#123c40" : "#041216");
        if (y === GH - 1) poly(ctx, [[cx - TW / 2, cy], [cx, cy + TH / 2], [cx, cy + TH / 2 + 9], [cx - TW / 2, cy + 9]], st ? "#174a4c" : "#05161a");
        diamond(ctx, cx, cy, 1, st === 2 ? M.lit[i] : st === 1 ? M.dim[i] : M.dark[i]);
        if (st === 2) {
          const a = 0.05 + 0.045 * Math.sin(tt * 1.7 + x * 1.1 + y * 0.6) * Math.sin(tt * 1.1 - x * 0.5 + y * 1.3 + 1);
          if (a > 0.012) diamond(ctx, cx + Math.sin(tt + x + y) * 1.5, cy, 7, `rgba(190,255,240,${a})`);
        }
      }
      // tile highlights
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      if (M.sel?.alive && M.phase === "squad") { const [px, py] = pos(M.sel); diamond(ctx, sx(Math.round(px), Math.round(py)), sy(Math.round(px), Math.round(py)), 2, `rgba(242,196,92,${0.35 + 0.2 * pulse})`); }
      if (M.path?.length) {
        const [ex, ey] = M.path[M.path.length - 1];
        diamond(ctx, sx(ex, ey), sy(ex, ey), 2, "rgba(255,226,138,0.32)");
        for (const [x, y] of M.path) ellipse(ctx, sx(x, y), sy(x, y), 3, 1.6, "#ffe28a");
      }
      if (M.target?.alive) diamond(ctx, sx(M.target.x, M.target.y), sy(M.target.x, M.target.y), 2, `rgba(255,111,145,${0.3 + 0.25 * pulse})`);
      // depth sorted objects and units
      const list: { d: number; f: () => void }[] = [];
      for (const o of M.objs) {
        const i = idx(o.x, o.y);
        if (!M.seen[i]) continue;
        const dimmed = M.vis[i] ? 0 : 1;
        const cx = sx(o.x, o.y), cy = sy(o.x, o.y);
        list.push({ d: o.x + o.y, f: () => {
          DIM = dimmed;
          if (o.t === 1) drawRock(ctx, cx, cy, o.s);
          else if (o.t === 2) drawCoral(ctx, cx, cy, o.s);
          else if (o.t === 3) drawKelp(ctx, cx, cy, o.s, tt);
          else drawWreck(ctx, cx, cy, o.s);
          DIM = 0;
        } });
      }
      list.push({ d: 8.5, f: () => drawSub(ctx, sx(0, 9), sy(0, 9), tt) });
      for (const u of M.units) { const [px, py] = pos(u); list.push({ d: px + py + 0.02, f: () => drawUnit(u, t) }); }
      list.sort((a, b) => a.d - b.d);
      for (const it of list) it.f();
      // last known positions of sea-bots out of sight
      for (const a of M.units) {
        if (a.side !== "a" || !a.alive || a.vis || a.flash > t || !a.last) continue;
        const cx = sx(a.last.x, a.last.y), cy = sy(a.last.x, a.last.y) - 14;
        const k = 0.25 + 0.15 * Math.sin(t * 3 + a.id);
        glow(ctx, cx, cy, 10, AL[a.kind as AlienKind].bolt, k);
        circle(ctx, cx - 3, cy, 1.5, withAlpha("#ffffff", k + 0.3));
        circle(ctx, cx + 3, cy, 1.5, withAlpha("#ffffff", k + 0.3));
      }
      // projectiles
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i], k = (t - s.t0) / s.dur;
        if (k >= 1) { shots.splice(i, 1); continue; }
        if (k < 0) continue;
        const hx = lerp(s.x0, s.x1, k), hy = lerp(s.y0, s.y1, k);
        const k0 = Math.max(0, k - 0.22), tx = lerp(s.x0, s.x1, k0), ty = lerp(s.y0, s.y1, k0);
        line(ctx, [[tx, ty], [hx, hy]], 2.2, withAlpha(s.c, 0.75));
        glow(ctx, hx, hy, 8, s.c, 0.7);
        circle(ctx, hx, hy, 2, "#ffffff");
      }
      for (const p of parts) {
        const a = clamp(1 - p.life / p.max);
        if (p.kind === "bolt") {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
          fillRR(ctx, -p.r * 1.6, -p.r * 0.6, p.r * 3.2, p.r * 1.2, 0.6, withAlpha(p.c, a));
          circle(ctx, -p.r * 1.6, 0, p.r * 0.9, withAlpha("#8a969c", a));
          ctx.restore();
        } else if (p.kind === "bubble") circle(ctx, p.x, p.y, p.r, withAlpha(p.c, 0.55 * a));
        else circle(ctx, p.x, p.y, p.r, withAlpha(p.c, a));
      }
      if (!calm) for (const b of ambient) circle(ctx, b.x + Math.sin(t * 2 + b.a) * 2, b.y, b.r, "rgba(207,239,255,0.28)");
      for (let i = floats.length - 1; i >= 0; i--) {
        const fl = floats[i], k = (t - fl.t0) / 1.1;
        if (k >= 1) { floats.splice(i, 1); continue; }
        const y = fl.y - k * (calm ? 4 : 14);
        ctx.save(); ctx.globalAlpha = clamp(1.4 - k * 1.4);
        text(ctx, fl.s, fl.x + 0.5, y + 1, fl.s.length > 4 ? 10 : 12, "rgba(2,14,18,0.7)", { weight: 700 });
        text(ctx, fl.s, fl.x, y, fl.s.length > 4 ? 10 : 12, fl.c, { weight: 700 });
        ctx.restore();
      }
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, MH);
    };

    let accT = 0;
    scope.raf((t, dt) => {
      if (!M) return;
      for (const p of parts) {
        p.life += dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
        p.vx *= 1 - dt * 2.5;
        p.vy = p.kind === "bubble" ? p.vy * (1 - dt) - 14 * dt : p.vy * (1 - dt * 2.5) + 26 * dt;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life >= parts[i].max) parts.splice(i, 1);
      if (!calm) for (const b of ambient) { b.y += b.vy * dt; if (b.y < -6) { b.y = MH + 4; b.x = Math.random() * W; } }
      accT += dt;
      if (accT < 1 / 31) return;
      accT = 0;
      draw(t);
    });

    const debrief = (res: "win" | "wipe" | "retreat" | "abort") => {
      M.phase = "end";
      M.sel = null; M.path = null; M.target = null;
      snapBtn.classList.remove("gm-on"); aimBtn.classList.remove("gm-on");
      header(); panelUpdate();
      const total = M.units.filter((u) => u.side === "a").length, surv = divers().length;
      const score = Math.max(0, (res === "win" ? 100 + surv * 30 : 0) + M.kills * 40 - M.lost * 20 - (M.turn - 1) * 10);
      const titles = { win: "Mission successful", wipe: "Squad recalled", retreat: "Mission failed", abort: "Mission aborted" };
      (debEl.querySelector(".gm-bx-deb-t") as HTMLElement).textContent = titles[res];
      (debEl.querySelector(".gm-bx-deb-op") as HTMLElement).textContent = `${M.op}, ${M.site}`;
      (debEl.querySelector(".gm-bx-deb-rows") as HTMLElement).innerHTML = [
        ["Sea-bots recycled", `${M.kills} / ${total}`],
        ["Divers lost", `${M.lost} / ${SQUAD.length}`],
        ["Turns", String(M.turn)],
        ["Score", String(score)],
      ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join("");
      const who = (pick(divers().length ? divers() : M.units.filter((u) => u.side === "x")).name.split(" ").pop()) ?? "Gauge";
      (debEl.querySelector(".gm-bx-deb-line") as HTMLElement).textContent = pick(LINES[res]).replace("{n}", who);
      debEl.dataset.tone = res === "win" ? "good" : res === "abort" ? "plain" : "bad";
      debEl.classList.add("gm-on");
      scope.fromTo(debEl, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "sine.out" });
      if (!calm) scope.fromTo([...debEl.children], { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: "expo.out", delay: 0.1 });
      return score;
    };

    const mission = async (): Promise<"win" | "wipe" | "retreat" | "abort"> => {
      M = newMission(Math.floor(Math.random() * 1e9));
      shots.length = 0; parts.length = 0; floats.length = 0;
      M.sel = M.units[0];
      updateVis();
      header(); panelUpdate();
      (introEl.querySelector(".gm-bx-op") as HTMLElement).textContent = M.op;
      (introEl.querySelector(".gm-bx-site") as HTMLElement).textContent = M.site;
      introEl.style.display = "flex";
      scope.fromTo(introEl, { opacity: 0 }, { opacity: 1, duration: 0.4 });
      await wait(1150);
      scope.to(introEl, { opacity: 0, duration: 0.45, onComplete: () => { introEl.style.display = "none"; } });
      await wait(350);
      for (;;) {
        if (S.left < 11000) return "abort";
        const r = await squadTurn();
        if (r) return r;
        if (!divers().length) return "wipe";
        if (S.left < 7000) return "abort";
        await alienTurn();
        if (!divers().length) return "wipe";
        if (!aliens().length) return "win";
        M.turn++;
      }
    };

    for (;;) {
      debEl.classList.remove("gm-on");
      debEl.style.opacity = "0";
      const res = await mission();
      hideBanner(); hideTip();
      if (res === "wipe") await wait(1200);
      const score = debrief(res);
      const hold = () => Math.max(300, Math.min(3400, S.left - 400));
      if (res === "win") {
        host.react("cheer");
        await nap(host, hold());
        return { result: "win", score };
      }
      if (res === "abort") {
        host.react("relax");
        await nap(host, hold());
        return { result: "done", score };
      }
      S.rounds++;
      const next = S.afterLoss(0.14);
      if (next === "ragequit") { host.react("angry"); await nap(host, Math.min(900, hold())); return { result: "ragequit", score }; }
      host.react(res === "wipe" ? (chance(0.5) ? "angry" : "surprised") : "shy");
      if (next === "retry" && S.left > 50000) { await nap(host, 2600); continue; }
      await nap(host, hold());
      return { result: "lose", score };
    }
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
