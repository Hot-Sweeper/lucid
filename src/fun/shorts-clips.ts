import { C, type Ctx, circle, core, drawBot, ellipse, fillRR, glow, lin, limb, loopFade, poly, rad, shade, shadow, text, withAlpha } from "./draw";
import { backOut, clamp, easeIn, easeInOut, easeOut, hash, lerp, seg } from "./util";
import type { VideoDef } from "./videos";

// BotTube Shorts: original vertical robot clips, framed for a phone held upright. Every clip has
// a moment worth reacting to; `beats` say when (seconds into the loop) and how the watching
// robot reacts: a laugh, a flinch at a scare, or holding the phone out to show its neighbour.

export type ShortReaction = "laugh" | "flinch" | "show";
export interface ShortClip extends VideoDef {
  beats: { at: number; react: ShortReaction }[];
  post: { user: string; caption: string; funny?: boolean };
}

const sparkle = (ctx: Ctx, x: number, y: number, r: number, color: string) => {
  const i = r * 0.28;
  poly(ctx, [[x, y - r], [x + i, y - i], [x + r, y], [x + i, y + i], [x, y + r], [x - i, y + i], [x - r, y], [x - i, y - i]], color);
};

/** Wall and floor of a small room, floor line at `floorY`. */
function room(ctx: Ctx, w: number, h: number, floorY: number, wall: [string, string], floor: [string, string]) {
  ctx.fillStyle = lin(ctx, 0, 0, 0, floorY, [[0, wall[0]], [1, wall[1]]]);
  ctx.fillRect(0, 0, w, floorY);
  ctx.fillStyle = lin(ctx, 0, floorY, 0, h, [[0, floor[0]], [1, floor[1]]]);
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(0, floorY, w, Math.max(1.5, h * 0.006));
}

const mug = (ctx: Ctx, x: number, y: number, s: number, color: string, rot = 0) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  fillRR(ctx, -6 * s, -9 * s, 12 * s, 9 * s, 2.4 * s, color);
  limb(ctx, [[6 * s, -7 * s], [9 * s, -5.5 * s], [6 * s, -2.5 * s]], 1.6 * s, shade(color, -0.2));
  fillRR(ctx, -5 * s, -9 * s, 10 * s, 1.6 * s, 0.8 * s, "rgba(255,255,255,0.35)");
  ctx.restore();
};

// 1. The wet floor: a confident walk, one slippery step, a full spin and a dizzy landing.
const wetFloor: ShortClip = {
  id: "short-wet-floor", title: "Wet floor sign speedrun", channel: "Mop Unit", views: "4.1M views", durationLabel: "0:06", loop: 6, thumbT: 2.1,
  post: { user: "mop.unit", caption: "The sign was right there", funny: true },
  beats: [{ at: 1.85, react: "flinch" }, { at: 2.75, react: "laugh" }],
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    const floorY = Y(38);
    room(ctx, w, h, floorY, ["#3b3f86", "#2a2e66"], ["#8fa0c8", "#5e6c99"]);
    // tiled wall stripe and the puddle with its sign
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, Y(10), w, 6 * s);
    const wiped = seg(t, 4.2, 5.4);
    ellipse(ctx, X(4), floorY + 10 * s, 26 * s * (1 - wiped * 0.9), 4 * s * (1 - wiped * 0.9), 0, withAlpha("#bfe8ff", 0.55));
    ellipse(ctx, X(-2), floorY + 9 * s, 8 * s * (1 - wiped), 1.2 * s, 0, "rgba(255,255,255,0.6)");
    poly(ctx, [[X(30), floorY + 4 * s], [X(36), floorY - 22 * s], [X(42), floorY + 4 * s]], "#ffd23f");
    poly(ctx, [[X(32.5), floorY + 1 * s], [X(36), floorY - 15 * s], [X(39.5), floorY + 1 * s]], "#f2b51c");
    circle(ctx, X(36), floorY - 10 * s, 1.6 * s, "#2a2e66");
    limb(ctx, [[X(36), floorY - 8 * s], [X(34.5), floorY - 3 * s]], 1.2 * s, "#2a2e66");
    // the walk, the slip, the spin and the sit
    const walk = seg(t, 0, 1.8);
    const fly = seg(t, 1.8, 2.6);
    const x = t < 1.8 ? lerp(-60, 2, walk) : lerp(2, 10, easeOut(fly));
    const step = Math.sin(t * 9);
    if (t < 1.8) {
      drawBot(ctx, X(x), floorY + 10 * s - Math.abs(step) * 1.2 * s, s * 1.15, { body: C.orange, legL: step * 0.5, legR: -step * 0.5, armL: 0.3 - step * 0.4, armR: 0.3 + step * 0.4, tilt: -0.05, eyes: "open", look: 1 });
    } else if (t < 2.6) {
      const hop = Math.sin(fly * Math.PI) * 34;
      ctx.save();
      ctx.translate(X(x), floorY + 10 * s - hop * s - 14 * s);
      ctx.rotate(-fly * Math.PI * 2);
      drawBot(ctx, 0, 14 * s, s * 1.15, { body: C.orange, legL: 1.2, legR: 0.9, armL: 2.4, armR: 2.6, elbowL: 0.6, elbowR: 0.8, eyes: "wide" });
      ctx.restore();
      for (let i = 0; i < 4; i++) circle(ctx, X(x + (i - 1.5) * 9), floorY + 6 * s - fly * (10 + i * 4) * s, (1.6 - fly) * s, withAlpha("#bfe8ff", 0.7 * (1 - fly)));
    } else {
      const land = seg(t, 2.6, 2.85), squash = 1 - Math.sin(land * Math.PI) * 0.18;
      drawBot(ctx, X(x), floorY + 10 * s, s * 1.15, { body: C.orange, legL: 1.45, legR: 1.35, kneeL: 1.4, kneeR: 1.3, armL: 0.7, armR: 0.6, squash, eyes: t < 4.4 ? "dizzy" : "happy", tilt: Math.sin(t * 5) * (t < 4.4 ? 0.12 : 0.03) });
      if (t < 4.4) for (let i = 0; i < 3; i++) {
        const a = t * 4 + (i * Math.PI * 2) / 3;
        sparkle(ctx, X(x + Math.cos(a) * 12), floorY - 30 * s + Math.sin(a) * 3 * s, 2.2 * s, i % 2 ? C.cream : "#ffd23f");
      }
    }
    // a tiny cleaning bot tidies up afterwards
    if (t > 3.9) {
      const cx = lerp(110, -40, seg(t, 3.9, 5.8));
      ellipse(ctx, X(cx), floorY + 12 * s, 9 * s, 3.2 * s, 0, "#e6e9f7");
      ellipse(ctx, X(cx), floorY + 10.5 * s, 6 * s, 1.6 * s, 0, "#2a2f66");
      circle(ctx, X(cx + 4), floorY + 10.5 * s, 0.9 * s, Math.sin(t * 9) > 0 ? C.mint : withAlpha(C.mint, 0.3));
    }
    loopFade(ctx, w, h, t, 6, 0.3);
  },
};

// 2. Seven mugs on one head: the tower sways, the top mug falls, a last second catch.
const MUG_COLORS = [C.orange, C.sky, C.mint, C.pink, C.lilac, "#ffd23f", C.cream];
const mugTower: ShortClip = {
  id: "short-mug-tower", title: "Seven mugs, one head, zero spills", channel: "Steady Servo", views: "2.2M views", durationLabel: "0:07", loop: 7, thumbT: 4.2,
  post: { user: "steady.servo", caption: "Practised this for 900 cycles" },
  beats: [{ at: 3.3, react: "flinch" }, { at: 4.15, react: "show" }],
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    const floorY = Y(62);
    room(ctx, w, h, floorY, ["#2b2f6e", "#1d2150"], ["#3c3f7a", "#262a5c"]);
    ctx.fillStyle = rad(ctx, X(0), Y(-30), 90 * s, [[0, "rgba(255,210,122,0.18)"], [1, "rgba(255,210,122,0)"]]);
    ctx.fillRect(0, 0, w, h);
    const sway = Math.sin(t * 2.6) * (0.02 + seg(t, 0, 3) * 0.07) * (t < 4.2 ? 1 : 0.3);
    const catchT = seg(t, 3.25, 4.1);
    const caught = t >= 4.1;
    drawBot(ctx, X(0), floorY, s * 1.3, {
      body: C.sky, eye: C.cream, lean: sway * 0.6, tilt: sway, antenna: false,
      armR: t > 3.25 ? lerp(0.3, 1.25, easeOut(catchT)) : 0.4 + Math.sin(t * 2.6) * 0.15, elbowR: t > 3.25 ? lerp(0.2, -0.6, easeOut(catchT)) : 0.3,
      armL: 0.9 + Math.sin(t * 2.6 + 1) * 0.2, elbowL: 0.4, eyes: t > 3.25 && !caught ? "wide" : caught ? "happy" : "open", look: t > 3.25 ? 1 : 0,
    });
    // the tower pivots on the head and leans further up the stack
    const headTop = floorY - 54 * s;
    const n = t < 3.25 ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const lean = sway * (1 + i * 0.5);
      mug(ctx, X(0) + Math.sin(lean) * i * 10 * s, headTop - i * 9.4 * s, s * 0.95, MUG_COLORS[i], lean);
    }
    if (t >= 3.25) {
      // the falling top mug arcs out to the right hand
      const k = easeIn(catchT);
      const mx = caught ? 25 : lerp(10, 25, catchT), my = caught ? -19 : lerp(-112, -19, k);
      mug(ctx, X(mx), floorY + my * s, s * 0.95, MUG_COLORS[6], caught ? 0 : catchT * 5);
      if (caught) {
        const pop = seg(t, 4.1, 4.6);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          sparkle(ctx, X(mx + Math.cos(a) * (6 + pop * 10)), floorY + (-24 + Math.sin(a) * (6 + pop * 10)) * s, (2.6 - pop * 1.4) * s, withAlpha("#ffd23f", 1 - pop * 0.6));
        }
      }
    }
    loopFade(ctx, w, h, t, 7, 0.3);
  },
};

// 3. The crate: a slow careful lid, then a spring loaded robot head shoots out.
const surpriseBox: ShortClip = {
  id: "short-surprise-box", title: "Opening the mystery crate", channel: "Crate Club", views: "3.6M views", durationLabel: "0:06", loop: 6.5, thumbT: 2.7,
  post: { user: "crate.club", caption: "Who sent this. WHO", funny: true },
  beats: [{ at: 2.55, react: "flinch" }, { at: 3.7, react: "laugh" }],
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    const floorY = Y(46);
    room(ctx, w, h, floorY, ["#3a2f6e", "#271f52"], ["#6b4f3a", "#4a3628"]);
    const pop = seg(t, 2.5, 2.75);
    const back = easeOut(seg(t, 2.52, 2.9));
    const shake = t > 2.5 && t < 3.1 ? Math.sin(t * 60) * 1.5 * (1 - seg(t, 2.5, 3.1)) : 0;
    // the curious robot leans in, then jumps back
    const lean = t < 2.5 ? seg(t, 0.2, 2.2) * 0.3 : lerp(0.3, -0.2, back);
    drawBot(ctx, X(-30 - back * 10 + shake), floorY + 6 * s - (t > 2.5 ? Math.sin(seg(t, 2.52, 2.95) * Math.PI) * 12 * s : 0), s * 1.1, {
      body: C.mint, lean, tilt: lean * 0.5, armR: t < 2.5 ? lerp(0.3, 1.4, seg(t, 0.6, 1.6)) : 2.6, armL: t < 2.5 ? 0.4 : 2.4, elbowR: 0.4,
      eyes: t < 2.5 ? "open" : t < 3.6 ? "wide" : "happy", look: 1,
    });
    // crate and lid
    const bx = X(12), by = floorY + 8 * s;
    fillRR(ctx, bx - 20 * s, by - 26 * s, 40 * s, 26 * s, 2 * s, "#b98a52");
    for (const yy of [-19, -9]) fillRR(ctx, bx - 20 * s, by + yy * s, 40 * s, 2 * s, 1 * s, "#8f6638");
    const lid = t < 2.5 ? -easeInOut(seg(t, 0.8, 2.3)) * 0.35 : lerp(-0.35, -2.2, easeOut(pop));
    ctx.save();
    ctx.translate(bx - 20 * s, by - 26 * s);
    ctx.rotate(lid);
    fillRR(ctx, 0, -4 * s, 42 * s, 4 * s, 1.5 * s, "#a77a45");
    ctx.restore();
    if (t >= 2.5) {
      // the spring and the grinning head on top
      const ext = backOut(pop, 2.2) * 34 - (t > 3 ? Math.sin((t - 3) * 7) * 3 * Math.exp(-(t - 3) * 1.5) : 0);
      const coils = 6;
      const pts: [number, number][] = [];
      for (let i = 0; i <= coils * 2; i++) pts.push([bx + (i % 2 ? 5 : -5) * s, by - 24 * s - (ext * i) / (coils * 2) * s]);
      limb(ctx, pts, 1.6 * s, "#c9cee3");
      const hy = by - 24 * s - ext * s;
      fillRR(ctx, bx - 11 * s, hy - 15 * s, 22 * s, 15 * s, 6 * s, C.pink);
      fillRR(ctx, bx - 8.5 * s, hy - 12 * s, 17 * s, 8.5 * s, 4 * s, "#141a33");
      for (const ex of [-3.6, 3.6]) circle(ctx, bx + ex * s, hy - 8 * s, 1.8 * s, "#ffd23f");
      limb(ctx, [[bx - 4 * s, hy - 5 * s], [bx, hy - 3.6 * s], [bx + 4 * s, hy - 5 * s]], 1 * s, "#ffd23f");
      if (t < 3.2) text(ctx, "BOING", bx + 18 * s, hy - 18 * s, 7 * s, withAlpha(C.cream, 1 - seg(t, 2.8, 3.2)), { weight: 800 });
    }
    loopFade(ctx, w, h, t, 6.5, 0.3);
  },
};

// 4. The perfect pour: oil fills the glass exactly to the brim and stops.
const perfectPour: ShortClip = {
  id: "short-perfect-pour", title: "Oil pour, exactly to the brim", channel: "Smooth Ops", views: "1.8M views", durationLabel: "0:06", loop: 6, thumbT: 4.4,
  post: { user: "smooth.ops", caption: "Not one drop over. Watch the end" },
  beats: [{ at: 4.35, react: "show" }],
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#1d2150"], [1, "#0f1336"]]);
    ctx.fillRect(0, 0, w, h);
    const tableY = Y(58);
    fillRR(ctx, -2, tableY, w + 4, h - tableY + 2, 0, "#2c3170");
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, tableY, w, 1.5 * s);
    // glass
    const gx = X(0), top = tableY - 48 * s, gw = 26 * s;
    const fill = clamp(easeInOut(seg(t, 1.2, 4.3)) * 1.0, 0, 1);
    const level = tableY - 2 * s - fill * 45 * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx - gw / 2 + 1.5 * s, top, gw - 3 * s, tableY - top - 2 * s);
    ctx.clip();
    const wob = t > 4.3 ? Math.sin((t - 4.3) * 18) * 1.2 * Math.exp(-(t - 4.3) * 3) * s : Math.sin(t * 14) * 0.6 * s;
    ctx.fillStyle = lin(ctx, 0, level, 0, tableY, [[0, "#ffcf5a"], [1, "#e89a2c"]]);
    ctx.beginPath();
    ctx.moveTo(gx - gw / 2, tableY);
    ctx.lineTo(gx - gw / 2, level - wob);
    ctx.quadraticCurveTo(gx, level + wob, gx + gw / 2, level - wob);
    ctx.lineTo(gx + gw / 2, tableY);
    ctx.fill();
    ctx.restore();
    fillRR(ctx, gx - gw / 2, top, 1.8 * s, tableY - top, 0.9 * s, "rgba(220,230,255,0.55)");
    fillRR(ctx, gx + gw / 2 - 1.8 * s, top, 1.8 * s, tableY - top, 0.9 * s, "rgba(220,230,255,0.55)");
    fillRR(ctx, gx - gw / 2, tableY - 2 * s, gw, 2 * s, 1 * s, "rgba(220,230,255,0.6)");
    fillRR(ctx, gx - gw / 2 + 3 * s, top + 4 * s, 2 * s, 30 * s, 1 * s, "rgba(255,255,255,0.18)");
    // the can tilts in, pours, and tilts back the moment the glass is full
    const tilt = t < 1.2 ? easeOut(seg(t, 0.3, 1.2)) : t < 4.3 ? 1 : 1 - easeOut(seg(t, 4.3, 4.8));
    const cx = X(16), cy = top - 22 * s;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-tilt * 1.15);
    fillRR(ctx, -8 * s, -14 * s, 16 * s, 24 * s, 3 * s, "#c9cee3");
    fillRR(ctx, -8 * s, -6 * s, 16 * s, 8 * s, 1 * s, C.orange);
    text(ctx, "OIL", 0, -2 * s, 4.5 * s, "#fff", { weight: 800 });
    fillRR(ctx, -9 * s, -16 * s, 6 * s, 4 * s, 1.5 * s, "#9aa2c4");
    ctx.restore();
    if (t > 1.1 && t < 4.35) {
      const sx = cx - 15 * s;
      ctx.fillStyle = lin(ctx, 0, cy, 0, level, [[0, "#ffcf5a"], [1, "#f0aa3a"]]);
      ctx.beginPath();
      ctx.moveTo(sx - 1.2 * s, cy - 2 * s);
      ctx.quadraticCurveTo(gx + 2 * s, cy + 6 * s, gx - 0.8 * s, level);
      ctx.lineTo(gx + 0.8 * s, level);
      ctx.quadraticCurveTo(gx + 4 * s, cy + 6 * s, sx + 1.2 * s, cy - 2 * s);
      ctx.fill();
    }
    if (t > 4.35) {
      const k = seg(t, 4.35, 5.2);
      glow(ctx, gx, top, 20 * s, "#ffd27a", 0.4 * (1 - k));
      for (let i = 0; i < 4; i++) sparkle(ctx, gx + (i - 1.5) * 9 * s, top - (4 + k * 10 + (i % 2) * 4) * s, (2.4 - k) * s, withAlpha(C.cream, 1 - k * 0.7));
    }
    loopFade(ctx, w, h, t, 6, 0.3);
  },
};

// 5. A tiny drone lands on the antenna and the robot goes cross eyed looking up at it.
const dronePerch: ShortClip = {
  id: "short-drone-perch", title: "A tiny drone picked my antenna", channel: "Little Prop", views: "5.0M views", durationLabel: "0:07", loop: 7, thumbT: 3.6,
  post: { user: "little.prop", caption: "I could not move for an hour", funny: true },
  beats: [{ at: 3.25, react: "laugh" }],
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.55);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#6fb6ff"], [0.7, "#bfe0ff"], [1, "#d9f0e0"]]);
    ctx.fillRect(0, 0, w, h);
    const groundY = Y(52);
    ctx.fillStyle = lin(ctx, 0, groundY, 0, h, [[0, "#5fc28a"], [1, "#3d9a68"]]);
    ctx.fillRect(0, groundY, w, h - groundY);
    for (let i = 0; i < 3; i++) ellipse(ctx, X(-50 + i * 50 + Math.sin(t * 0.3 + i) * 4), Y(-80 + i * 14), 16 * s, 5 * s, 0, "rgba(255,255,255,0.7)");
    const landed = t >= 3 && t < 5.2;
    drawBot(ctx, X(0), groundY, s * 1.5, { body: C.lilac, eyes: "open", tilt: landed ? 0 : Math.sin(t) * 0.05, armL: 0.3, armR: 0.3, look: landed ? 0 : Math.sin(t * 2) });
    // cross-eyed upward glance, drawn over the visor (drawBot's head geometry at scale 1.5)
    if (landed) {
      const k = 1.5 * s, top = groundY - 38.7 * k;
      fillRR(ctx, X(-8.8 * 1.5), top, 17.6 * k, 8.8 * k, 4 * k, "#141a33");
      for (const ex of [-2, 2]) { glow(ctx, X(ex * 1.5), top + 2.6 * k, 4 * k, C.mint, 0.3); circle(ctx, X(ex * 1.5), top + 2.6 * k, 1.7 * k, C.mint); }
    }
    // the drone: wanders, settles on the antenna tip, then lifts off
    const tipX = X(5.2 * 1.5), tipY = groundY - 45.5 * 1.5 * s;
    let dx: number, dy: number;
    if (t < 3) { const k = easeInOut(seg(t, 2.2, 3)); dx = lerp(X(Math.sin(t * 2.1) * 34), tipX, k); dy = lerp(Y(-60 + Math.sin(t * 3.3) * 14), tipY - 4 * s, k); }
    else if (t < 5.2) { dx = tipX; dy = tipY - 4 * s + Math.sin(t * 20) * 0.3 * s; }
    else { const k = easeIn(seg(t, 5.2, 6.6)); dx = lerp(tipX, X(70), k); dy = lerp(tipY - 4 * s, Y(-110), k); }
    const spin = landed && t > 3.4 ? 0.2 : 1;
    fillRR(ctx, dx - 5 * s, dy - 2 * s, 10 * s, 4 * s, 2 * s, "#2a2f66");
    for (const px of [-6, 6]) {
      limb(ctx, [[dx + px * 0.6 * s, dy - 1 * s], [dx + px * s, dy - 3 * s]], 0.8 * s, "#2a2f66");
      ellipse(ctx, dx + px * s, dy - 3.2 * s, (4 * Math.abs(Math.sin(t * 40 * spin)) + 1) * s, 0.7 * s, 0, withAlpha("#ffffff", 0.75));
    }
    circle(ctx, dx, dy, 0.9 * s, Math.sin(t * 8) > 0 ? C.pink : withAlpha(C.pink, 0.4));
    if (landed) sparkle(ctx, X(-24), Y(-14), (1.5 + Math.sin(t * 6)) * s, withAlpha("#ffffff", 0.8));
    loopFade(ctx, w, h, t, 7, 0.3);
  },
};

// 6. A ping pong rally from the end of the table that speeds up until the smash comes at you.
const rallyCam: ShortClip = {
  id: "short-rally-cam", title: "Ping pong rally, front row seat", channel: "Spin Serve", views: "2.7M views", durationLabel: "0:06", loop: 6, thumbT: 2.0,
  post: { user: "spin.serve", caption: "Do not watch this with your face", funny: true },
  beats: [{ at: 4.7, react: "flinch" }, { at: 5.3, react: "laugh" }],
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#20265a"], [1, "#11153a"]]);
    ctx.fillRect(0, 0, w, h);
    // table in perspective: far edge narrow, near edge wide
    const far = Y(-30), near = Y(70);
    poly(ctx, [[X(-22), far], [X(22), far], [X(48), near], [X(-48), near]], "#2a8a6a");
    poly(ctx, [[X(-1), far], [X(1), far], [X(1.6), near], [X(-1.6), near]], "rgba(255,255,255,0.7)");
    const netY = lerp(far, near, 0.42);
    fillRR(ctx, X(-36), netY - 6 * s, 72 * s, 6 * s, 1 * s, "rgba(240,240,255,0.45)");
    // the far robot and its paddle
    const smash = seg(t, 4.4, 4.75);
    drawBot(ctx, X(Math.sin(t * 4) * 8), far - 2 * s, s * 0.75, { body: C.orange, armR: t > 4.2 && t < 4.6 ? 2.6 : 1.1 + Math.sin(t * 6) * 0.4, elbowR: 0.3, eyes: t > 4.3 && t < 5 ? "angry" : "open" });
    // the rally: bounces back and forth, faster each time, then the smash flies at the camera
    let bx = 0, by = 0, br = 1.4;
    if (t < 4.4) {
      const rate = 1 + t * 0.55;
      const ph = (t * rate) % 2, k = ph < 1 ? ph : 2 - ph;   // 0 at the far robot, 1 nearest to us
      bx = Math.sin(t * 3) * 14 * (0.4 + k);
      by = lerp(far - 4 * s, near - 30 * s, k) - Math.sin(k * Math.PI) * 18 * s;
      br = lerp(1.2, 3, k);
    } else {
      const k = easeIn(smash);
      bx = lerp(0, -6, k);
      by = lerp(far - 6 * s, Y(10), k);
      br = lerp(1.4, 60, k * k);
    }
    if (t < 4.75) {
      glow(ctx, X(bx), by, br * 2.2 * s, "#fff6d8", 0.4);
      circle(ctx, X(bx), by, br * s, "#fff6d8");
    } else {
      // the smash hits the lens: a white flash and a little crack, then everything settles
      const f = seg(t, 4.75, 5.4);
      ctx.fillStyle = `rgba(255,250,235,${(1 - f) * 0.9})`;
      ctx.fillRect(0, 0, w, h);
      if (t < 5.6) {
        const cx = X(-6), cy = Y(10), a = 1 - seg(t, 5.1, 5.6);
        for (let i = 0; i < 6; i++) {
          const ang = i * 1.05 + 0.3;
          limb(ctx, [[cx, cy], [cx + Math.cos(ang) * 22 * s, cy + Math.sin(ang) * 22 * s], [cx + Math.cos(ang + 0.2) * 38 * s, cy + Math.sin(ang + 0.2) * 38 * s]], 0.7 * s, withAlpha("#ffffff", a * 0.8));
        }
      }
    }
    loopFade(ctx, w, h, t, 6, 0.3);
  },
};

// 7. Snooze: two lazy slaps at the alarm, and on the third the bed tips the robot out.
const snooze: ShortClip = {
  id: "short-snooze", title: "Snooze button, third attempt", channel: "Sleepy Circuit", views: "3.3M views", durationLabel: "0:06", loop: 6.5, thumbT: 4.6,
  post: { user: "sleepy.circuit", caption: "Installed the ejector bed. Worth it", funny: true },
  beats: [{ at: 4.45, react: "laugh" }],
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    const floorY = Y(40);
    room(ctx, w, h, floorY, ["#1f2357", "#2b2f6e"], ["#4a3f6e", "#352c55"]);
    // window with the moon fading into morning
    const morning = seg(t, 0, 4);
    fillRR(ctx, X(-40), Y(-80), 34 * s, 40 * s, 3 * s, lin(ctx, 0, Y(-80), 0, Y(-40), [[0, morning > 0.5 ? "#ffcf7a" : "#3a4a9a"], [1, morning > 0.5 ? "#ff9f6a" : "#2a2f66"]]));
    // the bed tips on the third alarm
    const tip = easeIn(seg(t, 4.0, 4.4)), back = easeOut(seg(t, 5.4, 6.1));
    const bedRot = (tip - back) * -0.5;
    const bx = X(-6), by = floorY + 4 * s;
    ctx.save();
    ctx.translate(bx + 30 * s, by);
    ctx.rotate(bedRot);
    fillRR(ctx, -60 * s, -14 * s, 60 * s, 10 * s, 2.5 * s, "#6a5a9a");
    fillRR(ctx, -60 * s, -18 * s, 60 * s, 5 * s, 2.5 * s, "#e6e0f7");
    fillRR(ctx, -58 * s, -24 * s, 14 * s, 7 * s, 3.5 * s, "#fbf8ff");
    if (t < 4.2) {
      // the sleeper under the blanket, head on the pillow
      fillRR(ctx, -46 * s, -24 * s, 40 * s, 8 * s, 4 * s, "#ff8fb1");
      fillRR(ctx, -60 * s, -32 * s, 15 * s, 11 * s, 5 * s, C.sky);
      fillRR(ctx, -58 * s, -30 * s, 11 * s, 6 * s, 3 * s, "#141a33");
      limb(ctx, [[-56 * s, -27 * s], [-53 * s, -27 * s]], 0.8 * s, C.mint);
      limb(ctx, [[-51 * s, -27 * s], [-48 * s, -27 * s]], 0.8 * s, C.mint);
    }
    ctx.restore();
    // alarm clock on the stool: rings three times, each slap quiets it
    const ring = (a: number) => t > a && t < a + 0.7;
    const ringing = ring(0.5) || ring(2.2) || ring(3.8);
    const cx = X(34), cy = floorY - 6 * s;
    fillRR(ctx, cx - 9 * s, cy, 18 * s, 14 * s, 2 * s, "#3c4150");
    const jig = ringing ? Math.sin(t * 70) * 1.4 * s : 0;
    circle(ctx, cx + jig, cy - 7 * s, 7 * s, "#ff6f91");
    circle(ctx, cx + jig, cy - 7 * s, 5.4 * s, "#fbf8ff");
    limb(ctx, [[cx + jig, cy - 7 * s], [cx + jig, cy - 10.5 * s]], 0.8 * s, "#141a33");
    limb(ctx, [[cx + jig, cy - 7 * s], [cx + jig + 2.4 * s, cy - 6 * s]], 0.8 * s, "#141a33");
    if (ringing) for (const side of [-1, 1]) limb(ctx, [[cx + side * 10 * s, cy - 12 * s], [cx + side * 13 * s, cy - 15 * s]], 0.9 * s, "#ffd23f");
    // the slapping arm reaches out from the bed
    for (const a of [0.9, 2.6]) {
      const k = seg(t, a, a + 0.35);
      if (k > 0 && k < 1) {
        const reach = Math.sin(k * Math.PI);
        limb(ctx, [[bx - 20 * s, by - 20 * s], [lerp(bx - 20 * s, cx, reach), lerp(by - 20 * s, cy - 12 * s, reach)]], 3 * s, shade(C.sky, -0.3));
      }
    }
    if (t >= 4.2) {
      // out on the floor in a heap, then sitting up awake
      const k = seg(t, 4.2, 4.6), wake = seg(t, 5.2, 5.8);
      drawBot(ctx, bx - 40 * s + k * 4 * s, floorY + 12 * s, s * 1.05, { body: C.sky, eye: C.cream, squash: lerp(0.7, 1, Math.max(wake, 1 - Math.sin(k * Math.PI))), legL: 1.4, legR: 1.2, kneeL: 1.3, kneeR: 1.2, armL: 1.2, armR: 0.8, tilt: lerp(0.5, 0, wake), eyes: wake > 0.5 ? "open" : "closed" });
    }
    if (t < 4) text(ctx, "z", X(-28) + Math.sin(t * 2) * 3 * s, Y(-10) - (t % 1.3) * 10 * s, 6 * s, withAlpha(C.cream, 1 - (t % 1.3) / 1.3), { weight: 700 });
    loopFade(ctx, w, h, t, 6.5, 0.3);
  },
};

// 8. A tall server rack turned into a light show: on the drop every LED goes rainbow.
const rackRave: ShortClip = {
  id: "short-rack-rave", title: "Server rack lights, synced to the beat", channel: "Blinken Lab", views: "1.4M views", durationLabel: "0:08", loop: 8, thumbT: 3.4,
  post: { user: "blinken.lab", caption: "Wait for the drop at 0:03" },
  beats: [{ at: 3.1, react: "show" }],
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = "#0b0e26";
    ctx.fillRect(0, 0, w, h);
    const beat = t * 2.2, b = Math.floor(beat), ph = beat - b;
    const drop = t > 3 && t < 6.6;
    const rx = X(-12), top = Y(-92), rw = 44 * s, rh = 170 * s;
    fillRR(ctx, rx - rw / 2, top, rw, rh, 3 * s, "#1c2048");
    const rows = 16;
    for (let r = 0; r < rows; r++) {
      const y = top + 6 * s + r * ((rh - 12 * s) / rows);
      fillRR(ctx, rx - rw / 2 + 3 * s, y, rw - 6 * s, 7.4 * s, 1.5 * s, "#262b5e");
      for (let c = 0; c < 6; c++) {
        const lit = drop ? hash(r * 7 + c * 3 + b) > 0.25 : (r + b) % 4 === 0 || hash(r * 5 + c + b * 11) > 0.82;
        const col = drop ? [C.pink, "#ffd23f", C.mint, C.sky, C.lilac, C.orange][(r + c + b) % 6] : C.mint;
        const a = lit ? (drop ? 1 - ph * 0.5 : 0.9 - ph * 0.6) : 0.12;
        const lx = rx - rw / 2 + 7 * s + c * 6 * s, ly = y + 3.7 * s;
        if (lit && drop) glow(ctx, lx, ly, 4 * s, col, 0.3 * a);
        circle(ctx, lx, ly, 1.3 * s, withAlpha(col, a));
      }
    }
    // the robot beside it, dancing harder after the drop
    const floorY = Y(80);
    ctx.fillStyle = "#151937";
    ctx.fillRect(0, floorY, w, h - floorY);
    const bounce = Math.abs(Math.sin(Math.PI * beat)) * (drop ? 4 : 1.5);
    const arm = drop ? 2.4 + Math.sin(beat * Math.PI) * 0.5 : 0.5 + Math.sin(beat * Math.PI) * 0.3;
    drawBot(ctx, X(30), floorY - bounce * s, s * 1.05, { body: C.orange, armL: arm, armR: drop ? 2.6 - Math.sin(beat * Math.PI) * 0.5 : 0.4, elbowL: drop ? 0.8 : 0.3, elbowR: 0.4, eyes: drop ? "happy" : "open", tilt: Math.sin(beat * Math.PI) * 0.12, lean: drop ? Math.sin(beat * Math.PI) * 0.08 : 0 });
    if (drop) { ctx.fillStyle = withAlpha([C.pink, C.sky, C.lilac][b % 3], 0.08 * (1 - ph)); ctx.fillRect(0, 0, w, h); }
    shadow(ctx, X(30), floorY + 1 * s, 10 * s, 2 * s, 0.2);
    loopFade(ctx, w, h, t, 8, 0.3);
  },
};

export const SHORT_CLIPS: ShortClip[] = [wetFloor, mugTower, surpriseBox, perfectPour, dronePerch, rallyCam, snooze, rackRave];
