// Five Nights at the Server Room: the robot is the night guard. It flips through
// security cameras, checks the door lights, and shuts the doors on goofy legacy bots
// before they reach the office. Survive until 6 AM, or get booped.
import "./games.css";
import {
  Scope, Session, Halt, mountFrame, addCanvas, nap, think, chance, pick, clamp, lerp, reducedMotion, hash,
  P, fillRR, circle, ellipse, poly, line, lin, rad, glow, text, withAlpha,
  type Ctx, type FunHost, type FunOpts, type Outcome,
} from "./kit";

type Room = "rack" | "cool" | "store" | "break" | "whall" | "ehall";
type Side = "L" | "R";
type BotKind = "dan" | "floppy" | "betty";
interface Bot { kind: BotKind; name: string; path: (Room | "door")[]; side: Side; idx: number; next: number; arrived: number; slot: number }

const ROOMS: Record<Room, { cam: number; name: string; map: [number, number, number, number] }> = {
  rack: { cam: 1, name: "Rack Hall", map: [0, 0, 1, 1] },
  store: { cam: 3, name: "Storage", map: [2, 0, 1, 1] },
  cool: { cam: 2, name: "Cooling", map: [0, 1, 1, 1] },
  break: { cam: 6, name: "Break Room", map: [2, 1, 1, 1] },
  whall: { cam: 4, name: "West Hall", map: [0, 2, 1, 1] },
  ehall: { cam: 5, name: "East Hall", map: [2, 2, 1, 1] },
};
const ROOM_ORDER: Room[] = ["rack", "cool", "store", "break", "whall", "ehall"];
const BOT_INFO: Record<BotKind, { name: string; path: (Room | "door")[]; side: Side }> = {
  dan: { name: "Dial-up Dan", path: ["rack", "cool", "whall", "door"], side: "L" },
  floppy: { name: "Floppy", path: ["store", "break", "ehall", "door"], side: "R" },
  betty: { name: "CRT Betty", path: ["break", "cool", "whall", "door"], side: "L" },
};
const HOURS = ["12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM"];

// ---- the legacy bots (flat, friendly, a little odd) ----------------------------------

const FACE: Record<BotKind, number> = { dan: 98, floppy: 56, betty: 84 };

/** Just the eyes, glowing: what you see of a bot standing in the dark. */
function drawEyes(ctx: Ctx, kind: BotKind, cx: number, foot: number, s: number, a: number) {
  const c = kind === "floppy" ? P.lilac : kind === "betty" ? P.mint : P.cream;
  glow(ctx, cx, foot - FACE[kind] * s, 42 * s, c, 0.28 * a);
  if (kind === "dan") for (const ex of [-14, 14]) { circle(ctx, cx + ex * s, foot - 98 * s, 8 * s, withAlpha("#fff8ea", a)); circle(ctx, cx + ex * s, foot - 97 * s, 3.5 * s, withAlpha(P.night, a)); }
  else if (kind === "floppy") for (const ex of [-11, 11]) ellipse(ctx, cx + ex * s, foot - 56 * s, 3.5 * s, 6 * s, withAlpha("#e8dcff", a));
  else for (const ex of [-18, 9]) fillRR(ctx, cx + ex * s, foot - 90 * s, 9 * s, 13 * s, 3 * s, withAlpha(P.mint, a));
}
/** A faint silhouette plus glowing eyes. */
function shadowBot(ctx: Ctx, kind: BotKind, cx: number, foot: number, s: number, t: number, a: number) {
  ctx.save();
  ctx.globalAlpha = 0.1;
  drawBot(ctx, kind, cx, foot, s, t);
  ctx.restore();
  drawEyes(ctx, kind, cx, foot + Math.sin(t * 2.2 + cx) * 1.2 * s, s, a);
}

function drawBot(ctx: Ctx, kind: BotKind, cx: number, foot: number, s: number, t: number, o: { glow?: number; look?: number } = {}) {
  const look = (o.look ?? 0) * 3 * s;
  const bob = Math.sin(t * 2.2 + cx) * 1.2 * s;
  const eyeGlow = o.glow ?? 0;
  ctx.save();
  ctx.translate(0, bob);
  if (kind === "dan") {
    fillRR(ctx, cx - 20 * s, foot - 26 * s, 13 * s, 26 * s, 5 * s, "#8f8270");
    fillRR(ctx, cx + 7 * s, foot - 26 * s, 13 * s, 26 * s, 5 * s, "#8f8270");
    line(ctx, [[cx - 28 * s, foot - 62 * s], [cx - 40 * s, foot - 44 * s]], 8 * s, "#bfae8a");
    line(ctx, [[cx + 28 * s, foot - 62 * s], [cx + 40 * s, foot - 46 * s]], 8 * s, "#bfae8a");
    fillRR(ctx, cx - 30 * s, foot - 74 * s, 60 * s, 52 * s, 12 * s, lin(ctx, 0, foot - 74 * s, 0, foot - 22 * s, [[0, "#e9d9b6"], [1, "#c8b48b"]]));
    for (let i = 0; i < 3; i++) fillRR(ctx, cx - 16 * s, foot - 62 * s + i * 9 * s, 32 * s, 4 * s, 2 * s, "#a8977a");
    line(ctx, [[cx + 10 * s, foot - 122 * s], [cx + 18 * s, foot - 142 * s]], 3 * s, "#a8977a");
    circle(ctx, cx + 18 * s, foot - 144 * s, 5 * s, P.pink);
    fillRR(ctx, cx - 38 * s, foot - 124 * s, 76 * s, 52 * s, 14 * s, lin(ctx, 0, foot - 124 * s, 0, foot - 72 * s, [[0, "#f3e6c8"], [1, "#dccaa2"]]));
    const leds = [P.mint, P.orange, P.pink];
    leds.forEach((c, i) => circle(ctx, cx - 24 * s + i * 8 * s, foot - 116 * s, 2.2 * s, Math.sin(t * 5 + i * 2) > 0 ? c : withAlpha(c, 0.3)));
    for (const ex of [-14, 14]) {
      if (eyeGlow) glow(ctx, cx + ex * s, foot - 98 * s, 22 * s, P.cream, 0.45 * eyeGlow);
      circle(ctx, cx + ex * s, foot - 98 * s, 11 * s, "#fff8ea");
      circle(ctx, cx + ex * s + look, foot - 97 * s, 5 * s, P.night);
      circle(ctx, cx + ex * s + look - 1.5 * s, foot - 99 * s, 1.6 * s, "#ffffff");
    }
    fillRR(ctx, cx - 10 * s, foot - 83 * s, 20 * s, 5 * s, 2.5 * s, "#a8977a");
  } else if (kind === "floppy") {
    fillRR(ctx, cx - 17 * s, foot - 24 * s, 9 * s, 24 * s, 4 * s, "#5b4aa0");
    fillRR(ctx, cx + 8 * s, foot - 24 * s, 9 * s, 24 * s, 4 * s, "#5b4aa0");
    line(ctx, [[cx - 36 * s, foot - 58 * s], [cx - 48 * s, foot - 38 * s]], 7 * s, "#7a62c8");
    line(ctx, [[cx + 36 * s, foot - 58 * s], [cx + 48 * s, foot - 76 * s]], 7 * s, "#7a62c8");
    circle(ctx, cx + 48 * s, foot - 79 * s, 6 * s, "#7a62c8");
    fillRR(ctx, cx - 38 * s, foot - 112 * s, 76 * s, 90 * s, 9 * s, lin(ctx, 0, foot - 112 * s, 0, foot - 22 * s, [[0, "#9b80ee"], [1, "#7458d0"]]));
    fillRR(ctx, cx - 20 * s, foot - 112 * s, 40 * s, 26 * s, 3 * s, "#cfd3f2");
    fillRR(ctx, cx + 4 * s, foot - 108 * s, 9 * s, 17 * s, 2 * s, "#8a8fb8");
    fillRR(ctx, cx - 29 * s, foot - 74 * s, 58 * s, 44 * s, 6 * s, P.cream);
    for (const ex of [-11, 11]) {
      if (eyeGlow) glow(ctx, cx + ex * s, foot - 56 * s, 18 * s, P.lilac, 0.6 * eyeGlow);
      ellipse(ctx, cx + ex * s + look * 0.6, foot - 56 * s, 4.5 * s, 7 * s, P.night);
      circle(ctx, cx + ex * s + look * 0.6 - 1.2 * s, foot - 59 * s, 1.5 * s, "#ffffff");
    }
    ellipse(ctx, cx - 20 * s, foot - 44 * s, 5 * s, 3 * s, withAlpha(P.pink, 0.5));
    ellipse(ctx, cx + 20 * s, foot - 44 * s, 5 * s, 3 * s, withAlpha(P.pink, 0.5));
    fillRR(ctx, cx - 6 * s, foot - 44 * s, 12 * s, 4 * s, 2 * s, "#5b4aa0");
  } else {
    fillRR(ctx, cx - 20 * s, foot - 14 * s, 40 * s, 14 * s, 6 * s, "#9c4a62");
    fillRR(ctx, cx - 14 * s, foot - 44 * s, 28 * s, 34 * s, 8 * s, "#b85a72");
    line(ctx, [[cx - 14 * s, foot - 34 * s], [cx - 30 * s, foot - 22 * s]], 6 * s, "#b85a72");
    line(ctx, [[cx + 14 * s, foot - 34 * s], [cx + 30 * s, foot - 46 * s]], 6 * s, "#b85a72");
    line(ctx, [[cx - 10 * s, foot - 108 * s], [cx - 24 * s, foot - 132 * s]], 3 * s, "#c9cdf5");
    line(ctx, [[cx + 10 * s, foot - 108 * s], [cx + 26 * s, foot - 128 * s]], 3 * s, "#c9cdf5");
    circle(ctx, cx - 24 * s, foot - 133 * s, 3.5 * s, P.mint);
    circle(ctx, cx + 26 * s, foot - 129 * s, 3.5 * s, P.mint);
    fillRR(ctx, cx - 40 * s, foot - 110 * s, 80 * s, 66 * s, 16 * s, lin(ctx, 0, foot - 110 * s, 0, foot - 44 * s, [[0, "#f08aa2"], [1, "#d06680"]]));
    fillRR(ctx, cx - 31 * s, foot - 102 * s, 62 * s, 48 * s, 13 * s, "#16343c");
    if (eyeGlow) glow(ctx, cx, foot - 80 * s, 40 * s, P.mint, 0.35 * eyeGlow);
    fillRR(ctx, cx - 18 * s + look, foot - 90 * s, 9 * s, 13 * s, 3 * s, P.mint);
    fillRR(ctx, cx + 9 * s + look, foot - 90 * s, 9 * s, 13 * s, 3 * s, P.mint);
    ctx.beginPath();
    ctx.arc(cx + look, foot - 74 * s, 9 * s, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.lineWidth = 3 * s; ctx.lineCap = "round"; ctx.strokeStyle = P.mint; ctx.stroke();
    circle(ctx, cx + 32 * s, foot - 52 * s, 2.5 * s, "#ffd2dc");
  }
  ctx.restore();
}

// ---- camera rooms ---------------------------------------------------------------------

function drawRoom(ctx: Ctx, room: Room, w: number, h: number, t: number) {
  const floorY = h * 0.68;
  ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, "#121a2c"], [1, "#1c2a40"]]);
  ctx.fillRect(0, 0, w, floorY);
  ctx.fillStyle = lin(ctx, 0, floorY, 0, h, [[0, "#1a2638"], [1, "#0c121e"]]);
  ctx.fillRect(0, floorY, w, h - floorY);
  if (room === "rack") {
    for (let i = 0; i < 5; i++) {
      const x = 20 + i * 86, top = 40 + (i % 2) * 6;
      fillRR(ctx, x, top, 62, floorY - top + 8, 6, "#223450");
      for (let u = 0; u < 9; u++) {
        fillRR(ctx, x + 6, top + 10 + u * 15, 50, 10, 3, "#17243a");
        for (let j = 0; j < 3; j++) {
          const on = Math.sin(t * (2 + ((u + j) % 4)) + i * 3 + u * 1.7 + j) > 0.1;
          circle(ctx, x + 12 + j * 6, top + 15 + u * 15, 1.6, on ? (j === 1 ? "#4fb6ff" : "#4ff0a0") : "rgba(79,240,160,0.12)");
        }
      }
    }
  } else if (room === "cool") {
    for (let i = 0; i < 2; i++) {
      const x = 40 + i * 210, y = 50;
      fillRR(ctx, x, y, 150, floorY - y + 6, 10, "#25384f");
      for (let f = 0; f < 2; f++) {
        const fx = x + 42 + f * 66, fy = y + 60;
        circle(ctx, fx, fy, 27, "#152234");
        for (let b = 0; b < 4; b++) {
          const a = t * 6 * (f ? -1 : 1) + (b * Math.PI) / 2;
          ctx.save(); ctx.translate(fx, fy); ctx.rotate(a);
          ellipse(ctx, 12, 0, 12, 4.5, "#3d5878");
          ctx.restore();
        }
        circle(ctx, fx, fy, 4, "#4c6a8e");
      }
      fillRR(ctx, x + 14, y + 112, 122, 6, 3, "#4fb6ff33");
      for (let p = 0; p < 3; p++) {
        const k = (t * 0.25 + p / 3 + i * 0.4) % 1;
        circle(ctx, x + 40 + p * 34, y - 8 - k * 30, 8 + k * 14, `rgba(200,225,255,${0.12 * (1 - k)})`);
      }
    }
    fillRR(ctx, 0, 28, w, 9, 4, "#2a3e58");
  } else if (room === "store") {
    for (let r = 0; r < 3; r++) {
      const y = 60 + r * 52;
      fillRR(ctx, 24, y + 38, w - 48, 6, 3, "#33465f");
      for (let i = 0; i < 9; i++) {
        const bw = 28 + hash(i + r * 9) * 16, bh = 20 + hash(i * 3 + r) * 16;
        const x = 34 + i * 44 + hash(i + r) * 6;
        fillRR(ctx, x, y + 38 - bh, bw, bh, 3, ["#5a4a3a", "#4a5a6e", "#6a5642", "#3f5270"][(i + r) % 4]);
      }
    }
  } else if (room === "break") {
    fillRR(ctx, w - 120, 46, 78, floorY - 40, 8, "#283a56");
    fillRR(ctx, w - 112, 56, 46, 86, 5, "#1a2a40");
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) fillRR(ctx, w - 108 + j * 15, 62 + i * 20, 11, 13, 2, ["#ff6f91", "#ff9f5a", "#4ff0a0", "#4fb6ff"][(i + j) % 4] + "88");
    glow(ctx, w - 89, 100, 70, "#4fb6ff", 0.12);
    fillRR(ctx, 60, floorY - 30, 160, 12, 6, "#34486a");
    fillRR(ctx, 74, floorY - 18, 10, 30, 3, "#2a3a56");
    fillRR(ctx, 196, floorY - 18, 10, 30, 3, "#2a3a56");
    // a leftover party banner
    for (let i = 0; i < 9; i++) {
      const x = 30 + i * 30, y = 30 + Math.sin(i / 8 * Math.PI) * 12;
      poly(ctx, [[x, y], [x + 22, y], [x + 11, y + 18]], ["#ff6f91", "#ff9f5a", "#b07cff"][i % 3] + "aa");
    }
    fillRR(ctx, 120, floorY - 42, 26, 12, 4, "#f6ecdc99");
    poly(ctx, [[128, floorY - 42], [140, floorY - 42], [134, floorY - 52]], "#ff6f9199");
  } else {
    // corridor in perspective, toward the office door
    const left = room === "whall";
    const vx = left ? w * 0.62 : w * 0.38, vy = h * 0.42;
    poly(ctx, [[0, 0], [w, 0], [vx + 50, vy - 50], [vx - 50, vy - 50]], "#101828");
    poly(ctx, [[0, 0], [vx - 50, vy - 50], [vx - 50, vy + 40], [0, h]], "#1a2840");
    poly(ctx, [[w, 0], [vx + 50, vy - 50], [vx + 50, vy + 40], [w, h]], "#16233a");
    poly(ctx, [[0, h], [vx - 50, vy + 40], [vx + 50, vy + 40], [w, h]], "#141f30");
    for (let i = 1; i < 6; i++) {
      const k = i / 6;
      const y = lerp(vy + 40, h, k * k);
      fillRR(ctx, lerp(vx - 50, 0, k * k), y, lerp(100, w, k * k), 1.5 + k * 2, 1, "rgba(255,255,255,0.05)");
    }
    fillRR(ctx, vx - 26, vy - 34, 52, 74, 4, "#0a0f1a");
    glow(ctx, vx, vy - 52, 60, "#f6ecdc", 0.12 + 0.05 * Math.sin(t * 3));
    const px = left ? 60 : w - 130;
    fillRR(ctx, px, 70, 70, 90, 4, "#2a3d5c");
    text(ctx, left ? "Be kind" : "No running", px + 35, 96, 10, "#c9cdf5aa", { weight: 600 });
    text(ctx, left ? "to old bots" : "in the halls", px + 35, 112, 10, "#c9cdf5aa", { weight: 600 });
  }
}

// where bots stand in each camera
const SLOTS: Record<Room, [number, number, number][]> = {
  rack: [[0.28, 0.82, 0.95], [0.66, 0.84, 1]],
  cool: [[0.5, 0.84, 0.95], [0.78, 0.86, 1]],
  store: [[0.32, 0.86, 1], [0.7, 0.84, 0.95]],
  break: [[0.44, 0.86, 1], [0.24, 0.84, 0.9]],
  whall: [[0.6, 0.72, 0.62], [0.36, 0.95, 1.1]],
  ehall: [[0.4, 0.72, 0.62], [0.64, 0.95, 1.1]],
};

export async function playNightShift(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope();
  const calm = reducedMotion();
  try {
    const f = mountFrame(body, scope, "Night Shift", "ns");
    const S = new Session(host, opts, { base: 0.45, step: 0.15, calm: 0.1 });
    const skill = S.skill;
    const W = f.w, H = f.h;
    const { ctx } = addCanvas(f.stage, W, H, "gm-ns-office");
    const night = 1 + Math.floor(Math.random() * 4);
    const hourMs = clamp((opts.maxMs * 0.82 - 4000) / 6, 6500, 11000);

    f.stage.insertAdjacentHTML("beforeend", `
      <div class="gm-ns-ctl gm-ns-l"><span class="gm-ns-btn" data-k="door">Door</span><span class="gm-ns-btn" data-k="light">Light</span></div>
      <div class="gm-ns-ctl gm-ns-r"><span class="gm-ns-btn" data-k="door">Door</span><span class="gm-ns-btn" data-k="light">Light</span></div>
      <div class="gm-ns-clock"><b>12 AM</b><span>Night ${night}</span></div>
      <div class="gm-ns-hud"><span class="gm-ns-pow">Power <b>100%</b></span><span class="gm-ns-use"><i></i><i></i><i></i><i></i></span></div>
      <div class="gm-ns-cam">
        <canvas class="gm-ns-feed"></canvas>
        <div class="gm-ns-scan"></div>
        <div class="gm-ns-label"><b>CAM 1</b><span>Rack Hall</span></div>
        <div class="gm-ns-map">${ROOM_ORDER.map((r) => {
          const [c, ro] = ROOMS[r].map;
          return `<span class="gm-ns-room" data-r="${r}" style="left:${c * 50}px;top:${ro * 30}px">${ROOMS[r].cam}</span>`;
        }).join("")}<span class="gm-ns-you" style="left:50px;top:60px">You</span></div>
      </div>
      <span class="gm-ns-flip">Cameras</span>
      <div class="gm-ns-intro"><b>Five Nights at the Server Room</b><span>Night ${night}   12 AM</span></div>`);
    const q = <T extends Element = HTMLElement>(s: string) => f.stage.querySelector(s) as T;
    const camEl = q(".gm-ns-cam");
    const feedC = q<HTMLCanvasElement>(".gm-ns-feed");
    const camH = H - 30;
    const fctx = (() => { feedC.width = W * 2; feedC.height = camH * 2; feedC.style.width = `${W}px`; feedC.style.height = `${camH}px`; const c = feedC.getContext("2d")!; c.setTransform(2, 0, 0, 2, 0, 0); return c; })();
    const btn = (side: Side, k: "door" | "light") => q(`.gm-ns-${side.toLowerCase()} [data-k="${k}"]`);
    const flipEl = q(".gm-ns-flip");
    const clockB = q(".gm-ns-clock b");
    const powB = q(".gm-ns-pow b");
    const useBars = [...f.stage.querySelectorAll(".gm-ns-use i")] as HTMLElement[];
    const labelB = q(".gm-ns-label b"), labelS = q(".gm-ns-label span");
    const roomBtn = (r: Room) => q(`.gm-ns-room[data-r="${r}"]`);
    scope.set(camEl, { yPercent: 110, autoAlpha: 0 });

    // ---- state ----
    const kinds: BotKind[] = night >= 3 ? ["dan", "floppy", "betty"] : ["dan", "floppy"];
    const bots: Bot[] = kinds.map((k, i) => ({ kind: k, name: BOT_INFO[k].name, path: BOT_INFO[k].path, side: BOT_INFO[k].side, idx: 0, next: 4000 + i * 1800 + Math.random() * 2500, arrived: 0, slot: i % 2 }));
    const door = { L: false, R: false }, shut = { L: 0, R: 0 }, light = { L: false, R: false }, bump = { L: 0, R: 0 };
    let camUp = false, cam: Room = "rack", staticT = 0;
    let power = 100, clock = 0, hour = 0, ended: "" | "win" | "boop" = "", booper: Bot | null = null, boopT = 0, out = false, outT = 0, winT = 0;
    let lamp = 1, flick = 0, started = false;
    const usage = () => 1 + (door.L ? 1 : 0) + (door.R ? 1 : 0) + (light.L ? 1 : 0) + (light.R ? 1 : 0) + (camUp ? 1 : 0);
    const where = (b: Bot) => b.path[b.idx];
    const atDoor = (side: Side) => bots.find((b) => b.side === side && where(b) === "door");
    const aggression = () => 2 + night * 1.5 + hour;
    const confetti: { x: number; y: number; vx: number; vy: number; r: number; c: string; a: number }[] = [];

    const setDoor = (side: Side, closed: boolean) => {
      door[side] = closed;
      btn(side, "door").classList.toggle("gm-on", closed);
      scope.to(shut, { [side]: closed ? 1 : 0, duration: closed ? 0.28 : 0.4, ease: closed ? "power3.in" : "power2.out" });
    };
    const setLight = (side: Side, on: boolean) => {
      light[side] = on;
      btn(side, "light").classList.toggle("gm-on", on);
    };
    const setCam = (r: Room) => {
      cam = r;
      staticT = 0.35;
      labelB.textContent = `CAM ${ROOMS[r].cam}`;
      labelS.textContent = ROOMS[r].name;
      f.stage.querySelectorAll(".gm-ns-room").forEach((e) => e.classList.toggle("gm-on", (e as HTMLElement).dataset.r === r));
    };
    setCam("rack");
    const flip = (up: boolean) => {
      camUp = up;
      flipEl.classList.toggle("gm-on", up);
      scope.to(camEl, { yPercent: up ? 0 : 110, autoAlpha: up ? 1 : 0, duration: up ? 0.26 : 0.22, ease: up ? "power2.out" : "power2.in" });
      if (up) staticT = 0.3;
    };
    const hud = () => {
      powB.textContent = `${Math.max(0, Math.ceil(power))}%`;
      powB.classList.toggle("gm-low", power < 20);
      const u = usage();
      useBars.forEach((b, i) => b.classList.toggle("gm-on", i < Math.min(4, u)));
      clockB.textContent = HOURS[hour];
      f.setScore(`Night ${night}   ${HOURS[hour]}`);
    };
    hud();

    // ---- simulation (runs every frame, independent of the robot's actions) ----
    const sim = (dtMs: number) => {
      if (ended || !started) return;
      clock += dtMs;
      const h = Math.min(6, Math.floor(clock / hourMs));
      if (h !== hour) { hour = h; hud(); scope.fromTo(clockB, { scale: 1.3 }, { scale: 1, duration: 0.5, ease: "back.out(3)" }); }
      if (hour >= 6) { ended = "win"; winT = 0; if (camUp) flip(false); return; }
      if (!out) {
        power -= (usage() * 0.75 * dtMs) / 1000 * (10000 / hourMs) * 0.9;
        if (power <= 0) {
          power = 0; out = true; outT = 0;
          setDoor("L", false); setDoor("R", false); setLight("L", false); setLight("R", false);
          if (camUp) flip(false);
          f.stage.classList.add("gm-ns-out");
        }
      } else {
        outT += dtMs;
        if (outT > 6500 + hash(night) * 3000) { ended = "boop"; booper = bots[0]; boopT = 0; }
      }
      for (const b of bots) {
        if (out) continue;
        if (where(b) === "door") {
          const wait = Math.max(4800, 8800 - hour * 400 - night * 300) * clamp(hourMs / 10000, 0.85, 1);
          if (clock - b.arrived > wait) {
            if (door[b.side]) {
              bump[b.side] = 1;
              const from = b.path[b.idx - 1];
              b.idx = chance(0.65) ? 0 : 1;
              b.next = clock + 2500 + Math.random() * 2500;
              if (camUp && (cam === from || cam === where(b))) staticT = 0.4;
            } else { ended = "boop"; booper = b; boopT = 0; if (camUp) flip(false); return; }
          }
          continue;
        }
        if (clock >= b.next) {
          b.next = clock + (3200 + Math.random() * 1800) * (hourMs / 10000);
          if (Math.random() * 20 < aggression()) {
            const from = where(b);
            b.idx++;
            if (where(b) === "door") b.arrived = clock;
            if (camUp && (cam === from || cam === where(b))) staticT = 0.45;
          }
        }
      }
      hud();
    };

    // ---- drawing ----
    const drawDoorway = (side: Side, t: number) => {
      const x0 = side === "L" ? 14 : W - 96, dw = 82, top = 50, bot = H - 72;
      fillRR(ctx, x0 - 8, top - 8, dw + 16, bot - top + 8, 8, "#232b5a");
      ctx.save();
      ctx.beginPath(); ctx.roundRect(x0, top, dw, bot - top, [6, 6, 0, 0]); ctx.clip();
      ctx.fillStyle = "#06070f"; ctx.fillRect(x0, top, dw, bot - top);
      const b = atDoor(side);
      if (light[side] && !out) {
        ctx.fillStyle = lin(ctx, 0, top, 0, bot, [[0, "#3b3552"], [1, "#4c4257"]]);
        ctx.fillRect(x0, top, dw, bot - top);
        poly(ctx, [[x0, bot], [x0 + dw, bot], [x0 + dw * 0.7, bot - 50], [x0 + dw * 0.3, bot - 50]], "#5a4e5e");
        glow(ctx, x0 + dw / 2, top + 10, 90, "#ffe2b0", 0.35);
        if (b) drawBot(ctx, b.kind, x0 + dw / 2 + (side === "L" ? 10 : -10), bot + 4, 1.12, t, { look: side === "L" ? 1 : -1 });
      } else if (b && !out) {
        // only their eyes show in the dark
        shadowBot(ctx, b.kind, x0 + dw / 2 + (side === "L" ? 10 : -10), bot + 4, 1.12, t, 0.55);
      }
      // shutter
      const sh = shut[side];
      if (sh > 0.001) {
        const shY = top + (bot - top) * sh;
        const jig = bump[side] * Math.sin(t * 60) * 3;
        fillRR(ctx, x0 + jig, top - 2, dw, shY - top + 2, 3, lin(ctx, 0, top, 0, shY, [[0, "#495380"], [1, "#3a4370"]]));
        for (let y = shY - 12; y > top; y -= 16) fillRR(ctx, x0 + 4 + jig, y, dw - 8, 5, 2, "#5a6595");
        fillRR(ctx, x0 + 20 + jig, shY - 14, dw - 40, 6, 3, "#2a3160");
      }
      ctx.restore();
    };

    const drawOffice = (t: number) => {
      ctx.fillStyle = lin(ctx, 0, 0, 0, H - 72, [[0, "#151b3c"], [1, "#1e2550"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = lin(ctx, 0, H - 72, 0, H, [[0, "#1a1f44"], [1, "#10142e"]]);
      ctx.fillRect(0, H - 72, W, 72);
      for (let i = 0; i < 12; i++) fillRR(ctx, i * 40 - 10 + ((i % 2) * 6), H - 62 + (i % 2) * 22, 30, 8, 4, "rgba(255,255,255,0.025)");
      // poster
      fillRR(ctx, 170, 34, 100, 104, 6, "#2a3166");
      drawBot(ctx, "dan", 220, 122, 0.42, t);
      text(ctx, "Be kind to", 220, 58, 9, "#c9cdf5", { weight: 600 });
      text(ctx, "legacy bots", 220, 70, 9, "#c9cdf5", { weight: 600 });
      // ceiling lamp
      fillRR(ctx, 214, 0, 12, 16, 3, "#2a3166");
      ellipse(ctx, 220, 18, 26, 8, "#3a4380");
      glow(ctx, 220, 20, 130, "#ffe7c2", 0.13 * lamp * (out ? 0 : 1));
      drawDoorway("L", t);
      drawDoorway("R", t);
      // desk
      const dy = H - 104;
      fillRR(ctx, 112, dy, 216, 18, 6, "#323a7c");
      fillRR(ctx, 120, dy + 14, 200, 60, 4, "#262d66");
      // monitors
      for (const [mx, i] of [[150, 0], [226, 1]] as const) {
        fillRR(ctx, mx + 26, dy - 12, 12, 14, 2, "#1b2050");
        fillRR(ctx, mx, dy - 62, 64, 52, 6, "#1b2050");
        fillRR(ctx, mx + 4, dy - 58, 56, 42, 4, out ? "#090b1a" : "#0f2a33");
        if (!out) for (let l = 0; l < 5; l++) {
          const len = 12 + hash(l + i * 7 + Math.floor(t * (1 + i))) * 32;
          fillRR(ctx, mx + 9, dy - 52 + l * 7, len, 3, 1.5, withAlpha(i ? P.sky : P.mint, 0.65));
        }
      }
      // fan, mug, paper
      const fx = 306, fy = dy - 26;
      fillRR(ctx, fx - 3, fy, 6, 26, 3, "#3a4380");
      circle(ctx, fx, fy, 15, "#2a3166");
      for (let b = 0; b < 3; b++) {
        const a = (out ? 0 : t * 14) + (b * Math.PI * 2) / 3;
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(a); ellipse(ctx, 7, 0, 7, 3, "#5a66b0"); ctx.restore();
      }
      fillRR(ctx, 124, dy - 16, 16, 17, 4, P.orange);
      fillRR(ctx, 118, dy + 2, 30, 6, 2, "#c9cdf555");
      // darkness and flicker
      const dark = out ? 0.78 : 0.12 + (1 - lamp) * 0.5;
      ctx.fillStyle = `rgba(5,6,20,${dark})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rad(ctx, W / 2, H * 0.4, W * 0.75, [[0.55, "rgba(5,6,20,0)"], [1, "rgba(5,6,20,0.55)"]]);
      ctx.fillRect(0, 0, W, H);
      if (out && outT > 1800) {
        // power is gone: a pair of eyes in the left doorway, humming a little tune
        ctx.save();
        ctx.beginPath(); ctx.rect(14, 50, 82, H - 122); ctx.clip();
        shadowBot(ctx, bots[0].kind, 63, H - 68, 1.12, t, 0.75 + 0.25 * Math.sin(t * 5));
        ctx.restore();
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.5 + i / 3) % 1);
          text(ctx, i % 2 ? "♪" : "♫", 86 + Math.sin(k * 6 + i) * 8, 130 - k * 60, 14, withAlpha(P.cream, 0.6 * (1 - k)), { weight: 600 });
        }
      }
    };

    const drawFeed = (t: number, dt: number) => {
      const w = W, h = camH;
      drawRoom(fctx, cam, w, h, t);
      const here = bots.filter((b) => where(b) === cam);
      here.forEach((b, i) => {
        const [sx, sy, sc] = SLOTS[cam][(b.slot + i) % 2];
        drawBot(fctx, b.kind, sx * w, sy * h, sc * 0.95, t, { look: Math.sin(t * 0.7 + i) });
      });
      fctx.fillStyle = "rgba(40,90,110,0.16)";
      fctx.fillRect(0, 0, w, h);
      fctx.fillStyle = rad(fctx, w / 2, h / 2, w * 0.7, [[0.5, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.6)"]]);
      fctx.fillRect(0, 0, w, h);
      if (!calm) for (let i = 0; i < 26; i++) fctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`, fctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1);
      if (staticT > 0) {
        staticT -= dt;
        const a = clamp(staticT / 0.35);
        for (let y = 0; y < h; y += 3) {
          fctx.fillStyle = `rgba(${200 + Math.random() * 55},${200 + Math.random() * 55},${220},${(calm ? 0.25 : Math.random() * 0.5) * a})`;
          fctx.fillRect(0, y, w, 2);
        }
      }
    };

    const drawBoop = (t: number, dt: number) => {
      boopT += dt;
      const b = booper!;
      const k = clamp(boopT / 0.45);
      const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      const s = lerp(0.6, 2.5, ease);
      ctx.fillStyle = `rgba(14,18,51,${0.55 * k})`;
      ctx.fillRect(0, 0, W, H);
      const shake = calm ? 0 : Math.sin(boopT * 40) * 4 * Math.max(0, 1 - boopT);
      drawBot(ctx, b.kind, W / 2 + shake, H * 0.56 + FACE[b.kind] * s, s, t, { look: 0 });
      if (boopT > 0.4) {
        // a soft boop on the camera lens
        const pk = clamp((boopT - 0.4) / 0.25), back = clamp((boopT - 0.9) / 0.3);
        const px = W * 0.7, py = lerp(H + 30, H * 0.5, pk - back * 0.4);
        fillRR(ctx, px - 13, py, 26, 120, 13, "#e9d9b6");
        circle(ctx, px, py + 4, 14, "#f3e6c8");
        if (pk >= 1 && back < 1) {
          const r = 30 + (boopT - 0.65) * 120;
          circle(ctx, px, py, r, `rgba(255,111,145,${0.35 * (1 - back)})`);
        }
      }
      if (boopT > 0.6) {
        const z = clamp((boopT - 0.6) / 0.3);
        ctx.save();
        ctx.translate(W / 2, H * 0.12);
        ctx.scale(0.6 + 0.4 * (1 + 1.6 * Math.pow(z - 1, 3) + 0.6 * Math.pow(z - 1, 2)), 0.6 + 0.4 * z);
        text(ctx, "BOOP!", 0, 0, 42, P.pink, { weight: 700 });
        ctx.restore();
      }
    };

    const drawWin = (t: number, dt: number) => {
      winT += dt;
      const k = clamp(winT / 1.2);
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, withAlpha("#ffb37a", 0.55 * k)], [0.6, withAlpha("#ff6f91", 0.3 * k)], [1, withAlpha("#141a33", 0.2 * k)]]);
      ctx.fillRect(0, 0, W, H);
      glow(ctx, W / 2, H * 0.95, W * 0.6 * k + 1, "#ffd59a", 0.6 * k);
      ctx.fillStyle = rad(ctx, W / 2, H * 0.22 + 70, W * 0.5, [[0, `rgba(30,18,46,${0.55 * k})`], [1, "rgba(30,18,46,0)"]]);
      ctx.fillRect(0, 0, W, H);
      const roll = clamp((winT - 0.3) / 0.5);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, H * 0.22, W, 80); ctx.clip();
      text(ctx, "5 AM", W / 2, H * 0.22 + 40 - roll * 80, 54, P.cream, { weight: 700, mono: true });
      text(ctx, "6 AM", W / 2, H * 0.22 + 120 - roll * 80, 54, P.cream, { weight: 700, mono: true });
      ctx.restore();
      if (roll >= 1) {
        text(ctx, "Shift complete", W / 2, H * 0.22 + 98, 15, P.cream, { weight: 600 });
        text(ctx, `Night ${night} survived   Power ${Math.ceil(power)}%`, W / 2, H * 0.22 + 120, 11, withAlpha(P.cream, 0.75), { weight: 500 });
        if (confetti.length < 90 && !calm) for (let i = 0; i < 4; i++) confetti.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 80, r: Math.random() * 6, c: pick([P.orange, P.mint, P.pink, P.sky, P.lilac, P.cream]), a: Math.random() * 6 });
      }
      for (const c of confetti) {
        c.x += c.vx * dt; c.y += c.vy * dt; c.a += dt * 5;
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); fillRR(ctx, -3, -2, 6, 4, 1.5, c.c); ctx.restore();
      }
    };

    scope.raf((t, dt) => {
      if (!calm && !out && !ended) {
        // the ceiling lamp flickers now and then
        if (flick > 0) { flick -= dt; lamp = 0.45 + Math.random() * 0.55; }
        else { lamp = Math.min(1, lamp + dt * 3); if (Math.random() < dt * 0.25) flick = 0.15 + Math.random() * 0.35; }
      }
      for (const s of ["L", "R"] as Side[]) bump[s] = Math.max(0, bump[s] - dt * 2.5);
      sim(dt * 1000);
      drawOffice(t);
      if (ended && !f.stage.classList.contains("gm-ns-end")) f.stage.classList.add("gm-ns-end");
      if (ended === "boop") drawBoop(t, dt);
      if (ended === "win") drawWin(t, dt);
      if (camUp) drawFeed(t, dt);
    });

    // ---- intro card ----
    const intro = q(".gm-ns-intro");
    scope.fromTo(intro, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    await nap(host, 1700);
    scope.to(intro, { opacity: 0, duration: 0.5, onComplete: () => intro.remove() });
    started = true;
    host.react("focus");

    // ---- the guard (the robot) ----
    const lastLight = { L: -1e9, R: -1e9 }, threat = { L: 0, R: 0 }, hallWas = { L: false, R: false };
    let lastCams = -4000;
    const notice = (base: number) => chance(clamp(base + skill * (1 - base)));
    const click = async (el: HTMLElement, ms = 380) => {
      el.classList.add("gm-hot");
      await host.pointAt(el, 0.5, 0.5, ms);
      await host.click();
      el.classList.remove("gm-hot");
    };
    const toggleDoor = async (side: Side, closed: boolean) => {
      if (door[side] === closed || ended) return;
      await click(btn(side, "door"), 300);
      if (!ended && !out) setDoor(side, closed);
    };
    const peek = async (side: Side) => {
      await click(btn(side, "light"));
      if (ended) return;
      if (!out) setLight(side, true);
      await nap(host, 450 + Math.random() * 400);
      lastLight[side] = clock;
      const b = atDoor(side);
      if (b && !door[side] && notice(0.72)) {
        host.react("surprised");
        await nap(host, think(skill, 220));
        if (!ended) { setLight(side, false); await toggleDoor(side, true); }
        threat[side] = 2;
        return;
      }
      if (!b && door[side] && notice(0.6)) {
        setLight(side, false);
        await toggleDoor(side, false);
        threat[side] = 0;
        return;
      }
      await click(btn(side, "light"), 200);
      setLight(side, false);
      if (b) threat[side] = 2;
      else if (chance(0.5)) threat[side] = 0;
    };
    const checkCams = async () => {
      await click(flipEl, 420);
      if (ended) return;
      flip(true);
      await nap(host, 300);
      const plan: Room[] = [pick(["whall", "ehall"] as Room[])];
      plan.push(plan[0] === "whall" ? "ehall" : "whall");
      if (chance(0.55)) plan.splice(chance(0.5) ? 0 : 2, 0, pick(["rack", "cool", "store", "break"] as Room[]));
      for (const r of plan) {
        if (ended || out) break;
        await click(roomBtn(r), 320);
        setCam(r);
        await nap(host, think(skill, 650));
        const seen = bots.filter((b) => where(b) === r);
        const hallSide: Side | null = r === "whall" ? "L" : r === "ehall" ? "R" : null;
        if (hallSide) {
          // a hall that was busy last time and is empty now means someone is at the door
          if (!seen.length && hallWas[hallSide] && notice(0.35)) { threat[hallSide] = 1; hallWas[hallSide] = false; break; }
          hallWas[hallSide] = seen.length > 0;
        }
        if (seen.length && notice(0.55)) {
          for (const b of seen) if (r === "whall" || r === "ehall") threat[b.side] = Math.max(threat[b.side], 1);
          if (r === "whall" || r === "ehall") { host.react(chance(0.5) ? "surprised" : "focus"); break; }
        }
      }
      lastCams = clock;
      if (ended || out) return;
      await click(flipEl, 260);
      flip(false);
      await nap(host, 200);
    };

    const guard = async () => {
      while (!ended) {
        if (host.stopped) throw new Halt();
        if (out) {
          // the buttons do nothing now
          await click(btn("L", "door"), 300);
          await nap(host, 500);
          host.react("surprised");
          await waitUntil(() => !!ended, 20000);
          return;
        }
        if (chance(0.012 + 0.07 * (1 - skill))) {
          // zones out for a moment
          host.react("relax");
          await nap(host, 1000 + Math.random() * 2200 * (1.2 - skill));
          continue;
        }
        const sides: Side[] = (["L", "R"] as Side[]).sort((a, b) => lastLight[a] - lastLight[b]);
        const urgent = sides.find((x) => threat[x] >= 1 && !door[x] && clock - lastLight[x] > 900);
        if (urgent) { await peek(urgent); continue; }
        const stuck = sides.find((x) => door[x] && clock - lastLight[x] > 1800);
        if (stuck) { await peek(stuck); continue; }
        if (clock - lastCams > 6000 + Math.random() * 3000 && power > 8) { await checkCams(); continue; }
        const s = sides[0];
        if (clock - lastLight[s] > 1100 + Math.random() * 1400 * (1.3 - skill)) { await peek(s); continue; }
        await nap(host, 350 + Math.random() * 500);
      }
    };
    const waitUntil = async (cond: () => boolean, max: number) => {
      const t0 = performance.now();
      while (!cond() && performance.now() - t0 < max) await nap(host, 80);
    };

    await guard();
    await waitUntil(() => !!ended, hourMs * 7);
    const final = ended as "" | "win" | "boop";
    if (final === "win") {
      host.react("cheer");
      await nap(host, 4600);
      return { result: "win", score: night };
    }
    if (final === "boop") {
      host.react("surprised");
      await nap(host, 1700);
      const b = booper!;
      f.showOver("Booped", `${b.name} got you at ${HOURS[hour]}`, "bad");
      await nap(host, 900);
      S.rounds = 2;
      const next = S.afterLoss(0.25 + (hour >= 4 ? 0.25 : 0));
      if (next === "ragequit") { host.react("angry"); await nap(host, 600); return { result: "ragequit", score: hour }; }
      host.react(hour >= 4 ? "angry" : "laugh");
      await nap(host, 1500);
      return { result: "lose", score: hour };
    }
    return { result: "done", score: hour };
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
