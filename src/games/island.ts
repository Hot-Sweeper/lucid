// Rustwater Bay: a point-and-click harbour adventure with a small verb panel.
// Nibs, a very small courier robot, wants the free oil promised to whoever relights the
// lighthouse on Cogwheel Rock. The robot at the desk clicks verbs, hotspots and inventory
// items, frees a rusted pulley, fixes the cable pole, rides across and wins a debug duel
// against Captain Hex, who guards the lighthouse console.
import "./games.css";
import "./island.css";
import { canvasPixelRatio } from "../perf/canvas";
import { canvasText } from "../localization-canvas";
import { onLocaleChange } from "../localization";
import { textLayout } from "./text-layout";
import {
  Scope, Session, Halt, mountFrame, addCanvas, fitCanvas, nap, think, chance, pick, clamp, rng, hash, reducedMotion,
  fillRR, circle, ellipse, poly, line, lin, glow, withAlpha,
  type Ctx, type FunHost, type FunOpts, type Outcome,
} from "./kit";

// Scenes are painted in a fixed logical box and anchored to the bottom of the scene area.
const LW = 440, LH = 205, FOOT = 186;
type Who = "nibs" | "bollard" | "hex";
const VOICE: Record<Who, string> = { nibs: "#ffffff", bollard: "#8fe3ff", hex: "#ffa592" };
const LAMP: [number, number] = [352, 41];

const VERBS = [["scan", "Scan"], ["grab", "Grab"], ["use", "Use"], ["talk", "Talk to"]] as const;
type Verb = (typeof VERBS)[number][0];
const VLABEL = Object.fromEntries(VERBS) as Record<Verb, string>;

// ---- the debug duel ----------------------------------------------------------------------
// Captain Hex flashes a broken line from the lighthouse code. Nibs picks a fix (or says what a
// line prints). Every right answer lights a lamp segment; three slips and Hex keeps the lamp.

type Puzzle = { kind: "fix" | "trace"; code: string; ok: string; near: string; silly: string };
const PUZZLES: Puzzle[] = [
  { kind: "fix", code: "for (i = 0; i <= n; i++)", ok: "i < n", near: "i <= n + 1", silly: "Unplug the lighthouse" },
  { kind: "fix", code: "if (tide = HIGH) dock()", ok: "tide === HIGH", near: "tide =! HIGH", silly: "Ask the tide nicely" },
  { kind: "fix", code: "lamp.on  // nothing happens", ok: "lamp.on()", near: "lamp.on[]", silly: "Shout ON at it" },
  { kind: "fix", code: "const fog = 1; fog = 2;", ok: "let fog = 1;", near: "const fog == 2;", silly: "Wait for the fog to lift" },
  { kind: "fix", code: "beam.step = 360 / 0", ok: "360 / sweeps", near: "360 / null", silly: "Divide by zero, but gently" },
  { kind: "fix", code: "ships.sort()  // 10, 100, 9", ok: "sort((a, b) => a - b)", near: "sort().reverse()", silly: "Sort them by vibes" },
  { kind: "fix", code: "last = log[log.length]", ok: "log[log.length - 1]", near: "log[log.length + 1]", silly: "Read the log backwards" },
  { kind: "fix", code: "\"6\" + 1  // \"61\"", ok: "Number(\"6\") + 1", near: "\"6\" + \"1\"", silly: "Round it to 7 and move on" },
  { kind: "trace", code: "0.1 + 0.2 === 0.3", ok: "false", near: "true", silly: "Depends on the moon" },
  { kind: "trace", code: "typeof null", ok: "\"object\"", near: "\"null\"", silly: "A seagull" },
  { kind: "trace", code: "\"ab\".repeat(3)", ok: "\"ababab\"", near: "\"ab3\"", silly: "Three seagulls" },
  { kind: "trace", code: "[1, 2, 3].at(-1)", ok: "3", near: "undefined", silly: "The one at the back" },
];
const ASK_FIX = ["Patch this, sprocket!", "My lamp code broke. Fix it or swim.", "One bug. One chance.", "This line squeaks. Make it stop."];
const ASK_TRACE = ["Quick! What does this print?", "Run it in your head. What comes out?", "No compiler allowed. What prints?"];
const RIGHT = ["Patched.", "That should do it.", "Easy. Mostly easy."];
const OUCH = ["Hmph. Lucky guess.", "Barnacles. That's right.", "Who taught you that?"];
const GLOAT = ["Wrong! That one sinks ships.", "Ha! The lamp stays dark.", "Close. Close doesn't light lamps."];

// ---- painting helpers -------------------------------------------------------------------

function layer(W: number, H: number, ox: number, oy: number, draw: (ctx: Ctx) => void, density = 2) {
  const c = document.createElement("canvas");
  const ctx = fitCanvas(c, W, H, density);
  ctx.translate(ox, oy);
  draw(ctx);
  return c;
}

function palm(ctx: Ctx, x: number, y: number, h: number, lean: number, col: string) {
  const top: [number, number] = [x + lean, y - h];
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.quadraticCurveTo(x + lean * 0.2, y - h * 0.5, top[0] - 2, top[1]);
  ctx.lineTo(top[0] + 2, top[1]);
  ctx.quadraticCurveTo(x + lean * 0.2 + 5, y - h * 0.5, x + 4, y);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  for (const [a, l] of [[-2.7, 1], [-2.2, 0.9], [-1.4, 0.7], [-0.5, 0.95], [0.1, 0.8], [-3.1, 0.75]] as [number, number][]) {
    const L = h * 0.42 * l;
    const ex = top[0] + Math.cos(a) * L, ey = top[1] + Math.sin(a) * L * 0.55 + L * 0.35;
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.quadraticCurveTo((top[0] + ex) / 2, top[1] - L * 0.25, ex, ey);
    ctx.quadraticCurveTo((top[0] + ex) / 2, top[1] - L * 0.05, top[0], top[1] + 3);
    ctx.fillStyle = col; ctx.fill();
  }
}

function harbourBack(ctx: Ctx) {
  const hz = 120;
  ctx.fillStyle = lin(ctx, 0, -60, 0, hz, [[0, "#07081f"], [0.5, "#16134a"], [0.85, "#2e2063"], [1, "#4a2a70"]]);
  ctx.fillRect(-80, -80, LW + 160, hz + 80);
  glow(ctx, 196, 34, 110, "#b8a6ff", 0.2);
  glow(ctx, 196, 34, 42, "#fff4d6", 0.35);
  circle(ctx, 196, 34, 19, "#f7f0d2");
  circle(ctx, 190, 29, 4.5, "#e7ddb8"); circle(ctx, 202, 40, 3.2, "#e7ddb8"); circle(ctx, 200, 27, 2, "#e7ddb8");
  ellipse(ctx, 168, 46, 52, 3.5, withAlpha("#251c5a", 0.85));
  ellipse(ctx, 236, 28, 40, 3, withAlpha("#251c5a", 0.7));
  ellipse(ctx, 330, 58, 70, 4, withAlpha("#2a2062", 0.6));
  ellipse(ctx, 60, 22, 50, 3, withAlpha("#2a2062", 0.5));
  // the island, far away to the right, where the cable goes
  poly(ctx, [[352, hz + 1], [366, 113], [384, 108], [404, 104], [426, 106], [446, 100], [520, 100], [520, hz + 1]], "#201850");
  palm(ctx, 400, 106, 20, 4, "#201850");
  palm(ctx, 418, 106, 15, -3, "#201850");
  glow(ctx, 430, 104, 10, "#ff9d4a", 0.5);
  circle(ctx, 430, 104, 1.2, "#ffc27a");
  // water
  ctx.fillStyle = lin(ctx, 0, hz, 0, LH, [[0, "#2b2368"], [0.35, "#18134c"], [1, "#0a0a27"]]);
  ctx.fillRect(-80, hz, LW + 160, LH - hz + 40);
  // the town on the hill behind the tavern
  poly(ctx, [[-80, hz + 10], [-80, 88], [0, 88], [26, 82], [58, 86], [92, 76], [130, 80], [160, 92], [186, 108], [204, hz + 10]], "#1b1445");
  const r = rng(11);
  for (let i = 0; i < 8; i++) {
    const x = 4 + i * 22 + r() * 6, h = 18 + r() * 22, w = 14 + r() * 8;
    const base = 96 + Math.max(0, i - 4) * 4;
    fillRR(ctx, x, base - h, w, h + 20, 1, "#221a52");
    poly(ctx, [[x - 2, base - h], [x + w / 2, base - h - 7 - r() * 4], [x + w + 2, base - h]], "#1f1748");
    for (let k = 0; k < 2; k++) if (r() > 0.35) {
      const wx = x + 3 + r() * (w - 7), wy = base - h + 5 + r() * (h - 8);
      glow(ctx, wx + 1.5, wy + 2, 7, "#ffb35a", 0.35);
      fillRR(ctx, wx, wy, 3, 4, 0.5, "#ffc06a");
    }
  }
}

function harbourFront(ctx: Ctx) {
  // cobbled street in front of the tavern
  ctx.fillStyle = lin(ctx, 0, 150, 0, LH, [[0, "#2c2148"], [1, "#1a1430"]]);
  ctx.beginPath(); ctx.moveTo(-80, 148); ctx.lineTo(196, 148); ctx.lineTo(176, LH + 40); ctx.lineTo(-80, LH + 40); ctx.fill();
  const r = rng(5);
  for (let y = 154; y < LH; y += 7) for (let x = -10 + ((y / 7) % 2) * 6; x < 180 - (y - 150) * 0.4; x += 13) {
    fillRR(ctx, x + r() * 2, y, 10, 4, 2, withAlpha("#3a2d5e", 0.6 + r() * 0.3));
  }
  // dock planks over the water
  ctx.fillStyle = "#3e2a40";
  ctx.beginPath(); ctx.moveTo(176, 158); ctx.lineTo(LW + 80, 158); ctx.lineTo(LW + 80, LH + 40); ctx.lineTo(160, LH + 40); ctx.fill();
  for (let i = 0, y = 158; y < LH + 10; i++, y += 6 + i * 0.6) {
    ctx.fillStyle = i % 2 ? "#4c3448" : "#45303f";
    ctx.fillRect(172 - (y - 158) * 0.3, y, LW + 100, 5 + i * 0.6);
  }
  ctx.fillStyle = "#22172a";
  ctx.fillRect(170, 158, LW + 100, 2);
  for (const px of [214, 286, 362, 430]) { fillRR(ctx, px, 146, 7, 14, 2, "#2c1f2e"); ellipse(ctx, px + 3.5, 146, 4, 1.6, "#3c2b3e"); }
  // the tavern
  fillRR(ctx, 12, 54, 140, 106, 2, "#3a2a52");
  for (let y = 62; y < 158; y += 9) { ctx.fillStyle = "#33254a"; ctx.fillRect(12, y, 140, 1.5); }
  poly(ctx, [[2, 58], [82, 18], [162, 58]], "#211738");
  poly(ctx, [[2, 58], [82, 18], [82, 24], [10, 60]], "#2a1e44");
  fillRR(ctx, 118, 20, 12, 22, 1, "#211738");
  for (const wx of [24, 120]) {
    glow(ctx, wx + 12, 89, 34, "#ffb35a", 0.35);
    fillRR(ctx, wx, 78, 24, 22, 2, "#ffbd66");
    ctx.fillStyle = "#3a2a52"; ctx.fillRect(wx + 11, 78, 2, 22); ctx.fillRect(wx, 88, 24, 2);
  }
  // door with warm light in the cracks
  fillRR(ctx, 64, 104, 32, 54, 3, "#2a1a24");
  fillRR(ctx, 66, 106, 28, 52, 2, "#5b3a2c");
  ctx.fillStyle = "#4a2e24"; ctx.fillRect(79, 106, 2, 52);
  circle(ctx, 89, 133, 1.6, "#e0b050");
  glow(ctx, 80, 158, 26, "#ffb35a", 0.25);
  // hanging sign: a plug and its socket
  ctx.fillStyle = "#211738"; ctx.fillRect(152, 64, 18, 2);
  line(ctx, [[158, 66], [158, 72]], 1, "#6b5a6e"); line(ctx, [[168, 66], [168, 72]], 1, "#6b5a6e");
  fillRR(ctx, 30, 60, 100, 18, 3, "#6b4a2c");
  fillRR(ctx, 32, 62, 96, 14, 2, "#7d5733");
  ctx.font = '700 9px "Lexend Variable", system-ui, sans-serif';
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f6e2b0";
  ctx.fillText("THE RUSTY SOCKET", 80, 69.5);
  // swinging plug sign out front
  fillRR(ctx, 152, 72, 22, 14, 3, "#7d5733");
  fillRR(ctx, 158, 76, 3, 6, 1, "#2a1a24"); fillRR(ctx, 165, 76, 3, 6, 1, "#2a1a24");
  // notice about the dark lighthouse
  fillRR(ctx, 104, 108, 24, 32, 1.5, "#e9d8ad");
  ctx.font = '700 5.5px "Lexend Variable", system-ui, sans-serif'; ctx.fillStyle = "#6a3a2a";
  ctx.fillText(canvasText("NOTICE"), 116, 114, 21);
  poly(ctx, [[113, 131], [119, 131], [118, 121], [114, 121]], "#8a3a4c");
  fillRR(ctx, 113, 118, 6, 3, 1, "#4a4a5e");
  ctx.fillStyle = "#e9d8ad"; ctx.fillRect(113.5, 125, 5, 1.6);
  for (let i = 0; i < 2; i++) fillRR(ctx, 108, 133.5 + i * 3.2, 16 - i * 5, 1.4, 0.7, "#a08a6a");
  // barrels by the door
  fillRR(ctx, 20, 134, 20, 26, 6, "#5a3a2e"); ctx.fillStyle = "#3a2620"; ctx.fillRect(20, 140, 20, 2); ctx.fillRect(20, 152, 20, 2);
  // lamp post
  line(ctx, [[176, 162], [176, 92]], 4, "#15102a");
  fillRR(ctx, 170, 160, 12, 4, 1.5, "#15102a");
  poly(ctx, [[168, 84], [184, 84], [181, 96], [171, 96]], "#ffd27a");
  poly(ctx, [[166, 84], [176, 76], [186, 84]], "#15102a");
  fillRR(ctx, 169, 95, 14, 3, 1, "#15102a");
  // crates (top crate lid is painted live, it opens)
  fillRR(ctx, 204, 150, 32, 24, 2, "#7a5634"); fillRR(ctx, 236, 154, 26, 20, 2, "#6a4a2e");
  fillRR(ctx, 214, 128, 32, 22, 2, "#86603a");
  for (const [x, y, w, h] of [[204, 150, 32, 24], [236, 154, 26, 20], [214, 128, 32, 22]] as const) {
    ctx.fillStyle = "rgba(40,24,16,0.45)"; ctx.fillRect(x, y + h / 2 - 1, w, 2); ctx.fillRect(x + 3, y, 2, h); ctx.fillRect(x + w - 5, y, 2, h);
  }
  ctx.font = '700 5.5px "JetBrains Mono Variable", ui-monospace, monospace'; ctx.fillStyle = "rgba(30,16,10,0.75)";
  ctx.fillText(canvasText("SPARE"), 220, 158, 30); ctx.fillText(canvasText("PARTS"), 220, 166, 30);
  // barrel for the lookout
  fillRR(ctx, 288, 146, 26, 28, 7, "#5a3a2e");
  ctx.fillStyle = "#3a2620"; ctx.fillRect(288, 152, 26, 2.5); ctx.fillRect(288, 166, 26, 2.5);
  // cable pole with climbing rungs (the top one is painted live, it is loose)
  fillRR(ctx, 349, 68, 7, 108, 2, "#2a1c26");
  fillRR(ctx, 343, 72, 18, 4, 1.5, "#2a1c26");
  for (let y = 164; y > 96; y -= 12) fillRR(ctx, 346, y, 13, 2, 1, "#4a3a44");
  line(ctx, [[352, 74], [LW + 40, 74 + (LW + 40 - 352) * (34 / 88)]], 1.6, "#a9a1cc");
}

function islandBack(ctx: Ctx) {
  const hz = 116;
  ctx.fillStyle = lin(ctx, 0, -60, 0, hz, [[0, "#0a0a26"], [0.5, "#1d1550"], [0.85, "#3c2268"], [1, "#5e2e70"]]);
  ctx.fillRect(-80, -80, LW + 160, hz + 80);
  glow(ctx, 92, 44, 120, "#c2a8ff", 0.2);
  glow(ctx, 92, 44, 46, "#fff4d6", 0.3);
  circle(ctx, 92, 44, 24, "#f7f0d2");
  circle(ctx, 84, 38, 5, "#e7ddb8"); circle(ctx, 100, 52, 4, "#e7ddb8"); circle(ctx, 98, 34, 2.4, "#e7ddb8");
  ellipse(ctx, 130, 58, 70, 4, withAlpha("#2a1c5c", 0.8));
  ellipse(ctx, 320, 34, 60, 3.5, withAlpha("#2a1c5c", 0.6));
  ctx.fillStyle = lin(ctx, 0, hz, 0, 150, [[0, "#2e2266"], [1, "#130f3c"]]);
  ctx.fillRect(-80, hz, LW + 160, 60);
  // the harbour we came from, tiny on the horizon
  poly(ctx, [[-80, hz + 1], [-80, 108], [20, 106], [40, 102], [70, 108], [96, hz + 1]], "#22184e");
  for (let i = 0; i < 7; i++) { const x = 4 + i * 11, y = 107 + (i % 3); glow(ctx, x, y, 5, "#ffb35a", 0.5); circle(ctx, x, y, 0.9, "#ffd08a"); }
  // a ship at anchor
  poly(ctx, [[300, 112], [336, 112], [330, 118], [306, 118]], "#1a1240");
  line(ctx, [[318, 112], [318, 90]], 1.5, "#1a1240");
  poly(ctx, [[319, 92], [332, 104], [319, 106]], "#241a52");
  poly(ctx, [[317, 94], [306, 106], [317, 107]], "#241a52");
}

function islandFront(ctx: Ctx) {
  ctx.fillStyle = lin(ctx, 0, 132, 0, LH, [[0, "#6a4a66"], [0.4, "#55385a"], [1, "#2c1d38"]]);
  ctx.beginPath(); ctx.moveTo(-80, 140);
  ctx.quadraticCurveTo(120, 126, 240, 136); ctx.quadraticCurveTo(360, 146, LW + 80, 132);
  ctx.lineTo(LW + 80, LH + 40); ctx.lineTo(-80, LH + 40); ctx.fill();
  ctx.fillStyle = "rgba(255,240,210,0.07)";
  ctx.beginPath(); ctx.moveTo(-80, 140); ctx.quadraticCurveTo(120, 126, 240, 136); ctx.quadraticCurveTo(360, 146, LW + 80, 132); ctx.lineTo(LW + 80, 138); ctx.quadraticCurveTo(360, 152, 240, 142); ctx.quadraticCurveTo(120, 132, -80, 146); ctx.fill();
  const r = rng(3);
  for (let i = 0; i < 40; i++) ellipse(ctx, r() * LW, 150 + r() * 50, 1 + r() * 2, 0.8, "rgba(20,10,30,0.25)");
  // the lighthouse on Cogwheel Rock (its lamp is painted live)
  const [lx, ly] = LAMP;
  ellipse(ctx, lx, 139, 22, 5, "#2c1d38");
  poly(ctx, [[lx - 13, 139], [lx + 13, 139], [lx + 8, ly + 11], [lx - 8, ly + 11]], "#bdb4cf");
  for (const [y0, y1] of [[124, 108], [92, 76]]) {
    const w = (y: number) => 8 + (y - ly - 11) * (5 / (139 - ly - 11));
    poly(ctx, [[lx - w(y0), y0], [lx + w(y0), y0], [lx + w(y1), y1], [lx - w(y1), y1]], "#8a3a4c");
  }
  poly(ctx, [[lx + 4, 139], [lx + 13, 139], [lx + 8, ly + 11], [lx + 3, ly + 11]], "rgba(20,10,40,0.28)");
  fillRR(ctx, lx - 4, 128, 8, 11, 3, "#3a2620");
  fillRR(ctx, lx - 12, ly + 8, 24, 3, 1, "#2a1c36");
  fillRR(ctx, lx - 8, ly - 5, 16, 13, 2, "#2a1c36");
  poly(ctx, [[lx - 10, ly - 5], [lx, ly - 15], [lx + 10, ly - 5]], "#8a3a4c");
  circle(ctx, lx, ly - 16, 1.8, "#e0b050");
  // cogwheel-shaped rocks and a plain one
  ellipse(ctx, 392, 170, 22, 10, "#3a2840"); ellipse(ctx, 386, 166, 14, 7, "#4a3450");
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; fillRR(ctx, 386 + Math.cos(a) * 13 - 2, 166 + Math.sin(a) * 6.5 - 1.5, 4, 3, 1, "#4a3450"); }
  circle(ctx, 386, 166, 3, "#3a2840");
  ellipse(ctx, 24, 176, 16, 7, "#3a2840");
  // palms framing the clearing
  palm(ctx, 40, LH + 10, 160, 10, "#140e26");
  palm(ctx, 432, LH + 10, 150, -6, "#140e26");
  // the cable comes in from the harbour and ends at the big palm
  line(ctx, [[-60, -20], [50, 56]], 1.6, "#a9a1cc");
  fillRR(ctx, 44, 52, 12, 6, 2, "#2a1c26");
  // torch poles (flames are live)
  for (const tx of [146, 332]) { line(ctx, [[tx, 170], [tx, 124]], 3, "#2a1a24"); fillRR(ctx, tx - 4, 118, 8, 8, 2, "#3a2620"); }
}

// ---- characters ---------------------------------------------------------------------------

interface Mover { x: number; y: number; tx: number; face: 1 | -1; walk: number; speed: number; lock: boolean }

function drawNibs(ctx: Ctx, m: Mover, t: number, o: { talk: boolean; hang: boolean; pad: boolean; hop: number; reach: number }) {
  ctx.save();
  ctx.translate(m.x, m.y - o.hop * 7);
  ctx.scale(m.face, 1);
  const sw = m.walk ? Math.sin(m.walk) : 0;
  const bob = m.walk ? Math.abs(Math.cos(m.walk)) * 1.6 : 0;
  if (!o.hang) ellipse(ctx, 0, o.hop * 7, 12 - o.hop * 3, 3, "rgba(5,3,20,0.45)");
  const legC = "#3a3f5e";
  if (o.hang) {
    const d = Math.sin(t * 3) * 2;
    fillRR(ctx, -6 + d, -16, 5, 15, 2, legC); fillRR(ctx, 1 + d * 0.6, -16, 5, 15, 2, legC);
  } else {
    fillRR(ctx, -6 + sw * 3.5, -15, 5, 15, 2, legC); fillRR(ctx, 1 - sw * 3.5, -15, 5, 15, 2, legC);
    fillRR(ctx, -7 + sw * 3.5, -3, 8, 3.5, 1.5, "#171230"); fillRR(ctx, 0 - sw * 3.5, -3, 8, 3.5, 1.5, "#171230");
  }
  ctx.translate(0, -bob);
  const armC = "#b9c6e4";
  if (o.hang) line(ctx, [[-5, -28], [-2, -53]], 3.2, armC);
  else line(ctx, [[-6, -27], [-8 - sw * 2.5, -18]], 3.2, armC);
  // courier jacket and the parcel satchel on the hip
  fillRR(ctx, -9, -31, 18, 18, 6, "#e98a4f");
  fillRR(ctx, 3, -31, 6, 18, 4, "#c96f3c");
  line(ctx, [[-6, -30], [6, -17]], 1.8, "#5a3a2e");
  fillRR(ctx, -12, -21, 8, 7, 2, "#7d5733");
  fillRR(ctx, -12, -21, 8, 2.4, 1, "#9a7044");
  // head with a bolt on the side and an antenna
  circle(ctx, -8.5, -39, 2.2, "#8a96b8");
  fillRR(ctx, -8, -46, 17, 14, 5, "#a9badd");
  fillRR(ctx, -1, -43.5, 10, 8.5, 3, "#1d2246");
  circle(ctx, 4.5, -40, 1.9, "#86f7cf");
  if (o.talk && Math.sin(t * 20) > -0.2) fillRR(ctx, 2.5, -37.5, 5, 1.8, 0.8, "#86f7cf");
  line(ctx, [[-2, -46], [-4, -52]], 1.5, "#8a96b8");
  circle(ctx, -4, -53.5, 2, "#ff6f6f");
  // front arm: holds the pulley, a handheld terminal, or reaches
  if (o.hang) line(ctx, [[5, -28], [2, -53]], 3.2, armC);
  else if (o.pad) {
    line(ctx, [[5, -27], [11, -24]], 3.2, armC);
    fillRR(ctx, 9, -31, 10, 8, 2, "#2a2e48");
    fillRR(ctx, 10.5, -29.5, 7, 5, 1, withAlpha("#86f7cf", 0.55 + 0.25 * Math.sin(t * 5)));
  } else if (o.reach > 0) line(ctx, [[5, -27], [12, -27 - o.reach * 14]], 3.2, armC);
  else line(ctx, [[6, -27], [8 + sw * 2.5, -18]], 3.2, armC);
  ctx.restore();
}

function drawBollard(ctx: Ctx, t: number, talk: boolean, calm: boolean) {
  const x = 301, y = 147;
  const n = calm ? 0 : Math.sin(t * 1.3) * 2;
  line(ctx, [[x - 12, y - 10], [x - 15, y - 2]], 3, "#6a7186");
  line(ctx, [[x + 12, y - 10], [x + 15, y - 2]], 3, "#6a7186");
  fillRR(ctx, x - 13, y - 24, 26, 25, 10, "#7d8598");
  fillRR(ctx, x - 8, y - 15, 16, 9, 3, "#5a6276");
  circle(ctx, x - 4, y - 10.5, 1.4, "#ffcf6a"); circle(ctx, x + 1, y - 10.5, 1.4, "#ff6f6f");
  fillRR(ctx, x - 2, y - 46 - n, 4, 24 + n, 2, "#666d82");
  fillRR(ctx, x - 9, y - 57 - n, 17, 11, 3, "#9aa3b8");
  fillRR(ctx, x - 11, y - 55 - n, 4, 7, 1.5, "#6a7186");
  const lit = talk ? 0.75 + 0.25 * Math.sin(t * 16) : 0.55;
  glow(ctx, x - 11, y - 51.5 - n, 10, "#8fe3ff", 0.45 * lit);
  circle(ctx, x - 11, y - 51.5 - n, 2.4, withAlpha("#8fe3ff", 0.5 + lit * 0.5));
  // the dockmaster's cap
  fillRR(ctx, x - 7, y - 61 - n, 13, 4, 2, "#1d2246"); fillRR(ctx, x - 10, y - 58 - n, 7, 1.6, 0.8, "#1d2246");
}

function drawHex(ctx: Ctx, m: Mover, t: number, o: { talk: boolean; point: boolean; hop: number }) {
  ctx.save();
  ctx.translate(m.x, m.y - o.hop * 6);
  ctx.scale(m.face, 1);
  const sw = m.walk ? Math.sin(m.walk) : 0;
  ellipse(ctx, 0, o.hop * 6, 15, 3.5, "rgba(5,3,20,0.45)");
  fillRR(ctx, -8 + sw * 3, -18, 6, 18, 2, "#211a30"); fillRR(ctx, 2 - sw * 3, -18, 6, 18, 2, "#211a30");
  fillRR(ctx, -9 + sw * 3, -3, 9, 3.5, 1.5, "#120c1c"); fillRR(ctx, 1 - sw * 3, -3, 9, 3.5, 1.5, "#120c1c");
  line(ctx, [[-9, -42], [-13, -26]], 3.6, "#8c2a40");
  poly(ctx, [[-12, -48], [12, -48], [17, -14], [-17, -14]], "#a8324c");
  poly(ctx, [[-17, -14], [17, -14], [16, -11], [-16, -11]], "#e0b050");
  fillRR(ctx, -7, -46, 14, 20, 2, "#272b48");
  for (let i = 0; i < 3; i++) circle(ctx, -3 + i * 3, -40, 1.2, Math.sin(t * 4 + i * 2) > 0 ? ["#86f7cf", "#ffcf6a", "#ff6f6f"][i] : "#3a3f63");
  for (let i = 0; i < 3; i++) fillRR(ctx, -5, -35 + i * 3, 10, 1.4, 0.7, "#3a3f63");
  // head: an old terminal with one big eye
  fillRR(ctx, -11, -63, 22, 16, 4, "#3a3f63");
  fillRR(ctx, -9, -61, 18, 12, 3, "#141730");
  const pulse = o.talk ? 0.75 + 0.25 * Math.sin(t * 18) : 0.6;
  glow(ctx, 3, -55, 12, "#ffa592", 0.4 * pulse);
  circle(ctx, 3, -55, 3.6, "#ffa592");
  circle(ctx, 4, -56, 1.2, "#fff0e8");
  if (o.talk && Math.sin(t * 20) > 0) fillRR(ctx, -5, -51.5, 6, 1.4, 0.7, "#ffa592");
  // captain's hat with a gold band and a cooling fan feather
  poly(ctx, [[-17, -62], [17, -62], [9, -68], [0, -76], [-9, -68]], "#16111e");
  fillRR(ctx, -12, -64, 24, 2, 1, "#e0b050");
  line(ctx, [[-6, -70], [-13, -78], [-19, -80]], 2.4, "#f2c45a");
  if (o.point) line(ctx, [[9, -42], [16, -52], [19, -60]], 3.6, "#8c2a40");
  else line(ctx, [[9, -42], [12, -26]], 3.6, "#8c2a40");
  ctx.restore();
}

/** A cable pulley: grooved wheel on top, hanger and handle below. Rusty until oiled. */
function drawPulley(ctx: Ctx, x: number, y: number, s: number, oiled: boolean, spin = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  const rim = oiled ? "#aab3c8" : "#a0623a", dark = oiled ? "#5a6276" : "#5a3424";
  line(ctx, [[0, 0], [0, 8]], 1.8, dark);
  fillRR(ctx, -7, 7, 14, 3, 1.5, oiled ? "#e0b050" : "#8a5a2a");
  circle(ctx, 0, 0, 5, rim);
  circle(ctx, 0, 0, 3.6, dark);
  for (let k = 0; k < 3; k++) {
    const a = spin + (k * Math.PI * 2) / 3;
    line(ctx, [[0, 0], [Math.cos(a) * 3.4, Math.sin(a) * 3.4]], 1, rim);
  }
  circle(ctx, 0, 0, 1.3, oiled ? "#e4e8f6" : "#c98a52");
  if (oiled) {
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(0, 0, 4.4, -2.6, -1.4); ctx.stroke();
  } else for (const [rx, ry] of [[-3.6, -3], [3.8, 2.4], [1, -4.6]]) circle(ctx, rx, ry, 1, "#6a3a22");
  ctx.restore();
}

// ---- inventory icons ------------------------------------------------------------------

type ItemId = "oil" | "bolt" | "almanac" | "pulley";
const ITEMS: Record<ItemId, { name: string; draw: (ctx: Ctx, oiled: boolean) => void }> = {
  oil: {
    name: "oil can",
    draw: (c) => {
      fillRR(c, 9, 14, 16, 14, 3, "#c9533a"); fillRR(c, 9, 14, 16, 4, 2, "#e07050");
      line(c, [[24, 18], [32, 10]], 2.4, "#9aa3b8");
      line(c, [[11, 14], [14, 8], [21, 8], [23, 14]], 1.6, "#6a7186");
    },
  },
  bolt: {
    name: "spare bolt",
    draw: (c) => {
      c.save(); c.translate(18, 18); c.rotate(-0.6);
      fillRR(c, -3, -4, 6, 18, 1.5, "#aab3c8");
      for (let i = 0; i < 4; i++) fillRR(c, -3.5, -1 + i * 3.6, 7, 1.2, 0.6, "#7a839a");
      poly(c, [[-7, -4], [-4, -10], [4, -10], [7, -4]], "#c9d1e6");
      c.restore();
    },
  },
  almanac: {
    name: "debugging almanac",
    draw: (c) => {
      fillRR(c, 8, 7, 20, 23, 2, "#3d6a8a"); fillRR(c, 8, 7, 4, 23, 1.5, "#2c4f6a");
      poly(c, [[17.5, 25], [22.5, 25], [21.5, 14], [18.5, 14]], "#f1eadb");
      fillRR(c, 18, 11, 4, 3, 1, "#e0b050");
      fillRR(c, 18.2, 18.5, 3.6, 1.6, 0.5, "#c9533a");
    },
  },
  pulley: { name: "rusty pulley", draw: (c, oiled) => drawPulley(c, 18, 13, 1.5, oiled, 0.4) },
};

interface Hot { name: string; x: number; y: number; w: number; h: number; walk?: number; face?: 1 | -1; ax?: number; ay?: number; el?: HTMLElement }

export async function playRobotIsland(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  const calm = reducedMotion();
  try {
    const f = mountFrame(body, scope, "Rustwater Bay", "rb");
    const S = new Session(host, opts, { base: 0.3, step: 0.18, calm: 0.1 });
    const skill = S.skill;
    const W = f.w, H = f.h;
    const SH = Math.round(H * 0.61);
    const OX = Math.round((W - LW) / 2), OY = SH - LH;
    const PH = H - SH;
    const pace = clamp(opts.maxMs / 100000, 0.72, 1);

    const { canvas, ctx } = addCanvas(f.stage, W, SH, "gm-rb-scene");
    scope.liveCanvas(canvas);
    canvas.style.height = `${SH}px`;
    const L1 = { back: layer(W, SH, OX, OY, harbourBack), front: layer(W, SH, OX, OY, harbourFront), density: 2 };
    const L2 = { back: layer(W, SH, OX, OY, islandBack), front: layer(W, SH, OX, OY, islandFront), density: 2 };
    scope.add(() => { for (const art of [L1.back, L1.front, L2.back, L2.front]) art.width = art.height = 0; });
    // the notice and crate labels are painted into the layers: repaint them in the new language
    scope.add(onLocaleChange(() => { L1.density = L2.density = 0; }));

    // ---- the verb panel ----
    const panel = document.createElement("div");
    panel.className = "gm-rb-panel";
    panel.style.top = `${SH}px`;
    panel.style.height = `${PH}px`;
    panel.innerHTML = `<div class="gm-rb-sent"></div><div class="gm-rb-verbs"></div><div class="gm-rb-inv"></div><div class="gm-rb-dlg"></div>`;
    f.stage.appendChild(panel);
    const sentEl = panel.querySelector(".gm-rb-sent") as HTMLElement;
    const verbsEl = panel.querySelector(".gm-rb-verbs") as HTMLElement;
    const invEl = panel.querySelector(".gm-rb-inv") as HTMLElement;
    const dlgEl = panel.querySelector(".gm-rb-dlg") as HTMLElement;
    const rowH = Math.floor((PH - 30) / 2);
    const colW = 96;
    const verbEls = {} as Record<Verb, HTMLElement>;
    VERBS.forEach(([v, label], i) => {
      const e = document.createElement("div");
      e.className = "gm-rb-verb";
      e.textContent = label;
      e.style.left = `${8 + (i % 2) * colW}px`;
      e.style.top = `${Math.floor(i / 2) * rowH}px`;
      e.style.width = `${colW - 6}px`;
      e.style.height = `${rowH - 6}px`;
      verbsEl.appendChild(e);
      verbEls[v] = e;
    });
    const slotW = 40, slotH = Math.floor((rowH * 2 - 6) / 2);
    const slots: HTMLElement[] = [];
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("div");
      s.className = "gm-rb-slot";
      s.style.left = `${(i % 4) * (slotW + 3)}px`;
      s.style.top = `${Math.floor(i / 4) * (slotH + 4)}px`;
      s.style.width = `${slotW}px`;
      s.style.height = `${slotH}px`;
      invEl.appendChild(s);
      slots.push(s);
    }
    invEl.style.left = `${W - 4 * (slotW + 3) - 8}px`;
    const inv: ItemId[] = [];
    let oiled = false;
    const itemName = (id: ItemId) => id === "pulley" && oiled ? "oiled pulley" : ITEMS[id].name;
    const paintSlot = (i: number) => {
      const c = document.createElement("canvas");
      ITEMS[inv[i]].draw(fitCanvas(c, 36, 36), oiled);
      slots[i].replaceChildren(c);
      return c;
    };
    const addItem = (id: ItemId, pop = true) => {
      inv.push(id);
      const c = paintSlot(inv.length - 1);
      if (pop && !calm) scope.fromTo(c, { scale: 0.3, rotation: -20 }, { scale: 1, rotation: 0, duration: 0.55, ease: "back.out(2.6)" });
    };
    const dropItem = (id: ItemId) => {
      inv.splice(inv.indexOf(id), 1);
      for (const s of slots) s.replaceChildren();
      inv.forEach((_, i) => paintSlot(i));
    };
    addItem("oil", false); addItem("bolt", false); addItem("almanac", false);

    // ---- hotspots (invisible boxes over the painting) ----
    let hots: Hot[] = [];
    const setHots = (list: Hot[]) => {
      for (const h of hots) h.el?.remove();
      hots = list;
      for (const h of list) {
        const e = document.createElement("i");
        e.className = "gm-rb-hot";
        e.style.left = `${Math.round(h.x + OX)}px`; e.style.top = `${Math.round(h.y + OY)}px`;
        e.style.width = `${h.w}px`; e.style.height = `${h.h}px`;
        f.stage.appendChild(e);
        h.el = e;
      }
    };
    const H1 = {
      moon: { name: "moon", x: 176, y: 14, w: 40, h: 40 } as Hot,
      sign: { name: "sign", x: 34, y: 60, w: 92, h: 18 } as Hot,
      notice: { name: "notice", x: 102, y: 106, w: 28, h: 36, walk: 116, face: -1 } as Hot,
      door: { name: "door", x: 64, y: 104, w: 32, h: 54, walk: 80, face: -1 } as Hot,
      lamp: { name: "lamp post", x: 166, y: 76, w: 20, h: 86, walk: 162, face: 1 } as Hot,
      crate: { name: "crate", x: 214, y: 124, w: 32, h: 26, walk: 198, face: 1 } as Hot,
      pulley: { name: "rusty pulley", x: 222, y: 104, w: 22, h: 24, walk: 198, face: 1 } as Hot,
      dock: { name: "dockmaster", x: 284, y: 86, w: 32, h: 88, walk: 266, face: 1 } as Hot,
      pole: { name: "cable pole", x: 342, y: 70, w: 20, h: 100, walk: 330, face: 1 } as Hot,
      cable: { name: "cable", x: 372, y: 80, w: 44, h: 16, walk: 336, face: 1 } as Hot,
    };
    const H2 = {
      hex: { name: "Captain Hex", x: 284, y: 100, w: 34, h: 84, walk: 196, face: 1 } as Hot,
      torch: { name: "torch", x: 138, y: 102, w: 16, h: 66 } as Hot,
      palm: { name: "palm tree", x: 26, y: 50, w: 40, h: 120 } as Hot,
      ship: { name: "ship", x: 300, y: 88, w: 30, h: 30 } as Hot,
      lighthouse: { name: "lighthouse", x: 336, y: 22, w: 32, h: 116 } as Hot,
    };
    setHots([H1.moon, H1.sign, H1.notice, H1.door, H1.lamp, H1.crate, H1.dock, H1.pole, H1.cable]);

    // ---- world state ----
    let scene: 1 | 2 = 1;
    const rv: Mover = { x: -24, y: FOOT, tx: -24, face: 1, walk: 0, speed: 96, lock: false };
    const ms: Mover = { x: 300, y: 180, tx: 300, face: -1, walk: 0, speed: 60, lock: true };
    const look = { hang: false, pad: false, point: false, reach: 0, fade: 1, lid: 0, pop: 0, rung: 0, lamp: 0, beam: 0 };
    const hop = { r: 0, m: 0 };
    const board = { ask: "", code: "", pick: "", ok: "", state: "ask" as "ask" | "ok" | "bad", a: 0 };
    let speech: { who: Who; text: string } | null = null;
    const sparks: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
    const burst = (x: number, y: number, c: string, n = 12) => {
      if (calm) return;
      for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 110, life: 0.3 + Math.random() * 0.35, c });
    };
    const stars = Array.from({ length: 70 }, (_, i) => ({ x: hash(i) * (W + 40) - 20 - OX, y: -OY + hash(i + 77) * (OY + 112), r: 0.4 + hash(i + 31) * 1.1, p: hash(i + 5) * 6 }));
    let flick = 1;

    const move = (m: Mover, dt: number) => {
      const d = m.tx - m.x;
      if (Math.abs(d) > 0.5) {
        if (!m.lock) m.face = d > 0 ? 1 : -1;
        m.x += Math.sign(d) * Math.min(Math.abs(d), m.speed * dt);
        m.walk += dt * 11;
      } else m.walk = 0;
    };

    const speechLayout = textLayout();
    document.fonts.addEventListener("loadingdone", speechLayout.clear);
    scope.add(() => document.fonts.removeEventListener("loadingdone", speechLayout.clear));
    const drawSpeech = () => {
      if (!speech) return;
      const who = speech.who;
      const [ax, ay] = who === "nibs" ? [rv.x, rv.y - (look.hang ? 62 : 60) - hop.r * 7] : who === "bollard" ? [301, 82] : [ms.x, ms.y - 90];
      ctx.font = '600 12px "Lexend Variable", system-ui, sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const { lines, width: wMax } = speechLayout.get(ctx, canvasText(speech.text), 220);
      const lh = 14;
      const x = clamp(ax, wMax / 2 + 6 - OX, W - OX - wMax / 2 - 6);
      let y = ay - (lines.length - 1) * lh;
      y = Math.max(y, 14 - OY);
      for (const [i, l] of lines.entries()) {
        const yy = y + i * lh;
        ctx.fillStyle = "rgba(6,3,18,0.9)";
        ctx.fillText(l, x + 1, yy + 1); ctx.fillText(l, x - 1, yy + 1); ctx.fillText(l, x, yy + 2);
        ctx.fillStyle = VOICE[who];
        ctx.fillText(l, x, yy);
      }
    };

    // Hex projects the broken line from her eye onto a little board above the clearing.
    const drawBoard = () => {
      if (board.a < 0.01) return;
      ctx.save();
      ctx.globalAlpha = board.a;
      const rows: [string, string][] = [[board.code, "#ffa592"]];
      if (board.state === "ok") rows.push([`> ${board.pick}`, "#86f7cf"]);
      if (board.state === "bad") rows.push([`> ${board.pick}`, "#ff6f6f"], [`> ${board.ok}`, "#86f7cf"]);
      ctx.textRendering = "optimizeSpeed"; // no ligatures: the code must read literally
      ctx.font = '600 11px "JetBrains Mono Variable", ui-monospace, monospace';
      const wCode = Math.max(...rows.map(([s]) => ctx.measureText(s).width));
      const head = canvasText(board.ask);
      ctx.font = '700 8px "Lexend Variable", system-ui, sans-serif';
      const w = Math.max(wCode, ctx.measureText(head).width) + 20, h = 20 + rows.length * 14;
      const cx = clamp((rv.x + ms.x) / 2, w / 2 + 6 - OX, W - OX - w / 2 - 6), top = Math.max(8, 8 - OY);
      line(ctx, [[ms.x + 3 * ms.face, ms.y - 55 - hop.m * 6], [cx + 10, top + h]], 1.2, withAlpha("#ffa592", 0.3));
      fillRR(ctx, cx - w / 2, top, w, h, 4, "rgba(10,8,30,0.9)");
      ctx.strokeStyle = withAlpha("#8fe3ff", 0.35); ctx.lineWidth = 1;
      ctx.strokeRect(cx - w / 2 + 0.5, top + 0.5, w - 1, h - 1);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#8fe3ff";
      ctx.fillText(head, cx - w / 2 + 10, top + 12);
      ctx.font = '600 11px "JetBrains Mono Variable", ui-monospace, monospace';
      rows.forEach(([s, c], i) => {
        const y = top + 26 + i * 14;
        ctx.fillStyle = c;
        ctx.fillText(s, cx - w / 2 + 10, y);
        if (i === 1 && board.state === "bad") fillRR(ctx, cx - w / 2 + 8, y - 4, ctx.measureText(s).width + 4, 1.2, 0.6, "#ff6f6f");
      });
      ctx.restore();
    };

    const drawLighthouseLamp = (t: number) => {
      const [lx, ly] = LAMP;
      const on = look.lamp;
      if (look.beam > 0.01) {
        const dir = Math.PI + (calm ? 0.25 : Math.sin(t * 0.8) * 0.75);
        const spread = 0.11, reach = 460;
        ctx.fillStyle = lin(ctx, lx, ly, lx + Math.cos(dir) * reach, ly + Math.sin(dir) * reach, [[0, `rgba(255,236,170,${0.42 * look.beam})`], [1, "rgba(255,236,170,0)"]]);
        ctx.beginPath(); ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(dir - spread) * reach, ly + Math.sin(dir - spread) * reach);
        ctx.lineTo(lx + Math.cos(dir + spread) * reach, ly + Math.sin(dir + spread) * reach);
        ctx.fill();
      }
      if (on > 0.01) glow(ctx, lx, ly, 18 + on * 26, "#ffe9a8", 0.5 * on);
      fillRR(ctx, lx - 6, ly - 3, 12, 9, 1.5, on > 0.01 ? withAlpha("#ffe9a8", 0.25 + on * 0.75) : "#1d2246");
      ctx.fillStyle = "#2a1c36"; ctx.fillRect(lx - 0.6, ly - 3, 1.2, 9);
    };

    scope.raf((t, dt) => {
      const tt = calm ? 0 : t;
      move(rv, dt); move(ms, dt);
      if (!calm) flick = clamp(flick + (Math.random() - 0.5) * dt * 6, 0.8, 1);
      const density = canvasPixelRatio(canvas);
      ctx.setTransform(density, 0, 0, density, 0, 0);
      const Lr = scene === 1 ? L1 : L2;
      if (density > Lr.density) {
        Lr.density = density;
        Lr.back.width = Lr.back.height = Lr.front.width = Lr.front.height = 0;
        Lr.back = layer(W, SH, OX, OY, scene === 1 ? harbourBack : islandBack, density);
        Lr.front = layer(W, SH, OX, OY, scene === 1 ? harbourFront : islandFront, density);
      }
      ctx.drawImage(Lr.back, 0, 0, W, SH);
      ctx.save();
      ctx.translate(OX, OY);
      for (const s of stars) {
        const a = 0.45 + 0.4 * Math.sin(tt * 1.7 + s.p);
        circle(ctx, s.x, s.y, s.r, `rgba(240,236,255,${a})`);
      }
      // water: moving ripples and the moon's reflection
      const [mx, wy0, wy1] = scene === 1 ? [196, 123, 157] : [92, 119, 132];
      for (let i = 0; i < (scene === 1 ? 26 : 14); i++) {
        const sp = 3 + hash(i + 9) * 6;
        const x = ((hash(i) * (LW + 60) + tt * sp * (i % 2 ? 1 : -1)) % (LW + 60) + LW + 60) % (LW + 60) - 30;
        const y = wy0 + hash(i + 3) * (wy1 - wy0);
        fillRR(ctx, x, y, 8 + hash(i + 1) * 16, 1.2, 0.6, "rgba(150,140,230,0.22)");
      }
      for (let k = 0; k < 7; k++) {
        const y = wy0 + 1 + k * ((wy1 - wy0 - 2) / 7);
        const spread = 6 + k * 3.5;
        for (let j = 0; j < 3; j++) {
          const ph = hash(k * 3 + j) * 6;
          const w = 3 + hash(k * 5 + j) * (5 + k) + Math.sin(tt * 2.2 + ph) * 1.5;
          const x = mx + (j - 1) * spread * 0.8 + Math.sin(tt * 1.3 + ph) * 2.5;
          fillRR(ctx, x - w / 2, y, w, 1.3, 0.6, withAlpha("#f7f0d2", (0.6 - k * 0.07) * (j === 1 ? 1 : 0.6)));
        }
      }
      ctx.restore();
      ctx.drawImage(Lr.front, 0, 0, W, SH);
      ctx.save();
      ctx.translate(OX, OY);
      if (scene === 1) {
        glow(ctx, 176, 90, 56, "#ffd27a", 0.3 * flick);
        ellipse(ctx, 176, 176, 34, 7, `rgba(255,210,122,${0.1 * flick})`);
        // crate lid and the pulley inside
        if (look.pop > 0) drawPulley(ctx, 232, 122 - look.pop * 8, 1.1, false, look.pop * 3);
        ctx.save();
        ctx.translate(214 + look.lid * 34, 128 - look.lid * 4);
        ctx.rotate(look.lid * 1.1);
        fillRR(ctx, 0, -5, 33, 5, 1.5, "#9a7044");
        ctx.restore();
        // the loose top rung droops until the spare bolt holds it
        ctx.save();
        ctx.translate(352.5, 93);
        ctx.rotate((1 - look.rung) * (0.5 + (calm ? 0 : Math.sin(t * 2.4) * 0.08)));
        fillRR(ctx, -6.5, -1, 13, 2, 1, look.rung > 0.5 ? "#8a7a84" : "#4a3a44");
        ctx.restore();
        drawBollard(ctx, t, speech?.who === "bollard", calm);
      } else {
        drawLighthouseLamp(t);
        for (const tx of [146, 332]) {
          const fl = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 13 + tx);
          glow(ctx, tx, 112, 46, "#ff9d4a", 0.32 * fl);
          ellipse(ctx, tx, 113 - fl * 2, 4.5, 8 * fl, "#ff8a3a");
          ellipse(ctx, tx, 115 - fl, 2.6, 5 * fl, "#ffe08a");
        }
        drawHex(ctx, ms, t, { talk: speech?.who === "hex", point: look.point, hop: hop.m });
      }
      if (look.hang) drawPulley(ctx, rv.x, rv.y - 61, 1, true, calm ? 0 : rv.x / 5);
      drawNibs(ctx, rv, t, { talk: speech?.who === "nibs", hang: look.hang, pad: look.pad, hop: hop.r, reach: look.reach });
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        circle(ctx, p.x, p.y, 1.3, withAlpha(p.c, clamp(p.life * 3)));
      }
      if (scene === 2) drawBoard();
      drawSpeech();
      ctx.restore();
      if (look.fade > 0.001) { ctx.fillStyle = `rgba(5,3,16,${look.fade})`; ctx.fillRect(0, 0, W, SH); }
    });

    // ---- robot actions ----
    let verb: Verb | null = null;
    let withItem: ItemId | null = null;
    const base = () => verb ? (withItem ? `${VLABEL[verb]} ${itemName(withItem)} with` : VLABEL[verb]) : "Walk to";
    const sentence = (s: string) => { sentEl.textContent = s; };
    const reset = () => {
      verb = null; withItem = null;
      for (const e of Object.values(verbEls)) e.classList.remove("gm-on", "gm-hot");
      for (const s of slots) s.classList.remove("gm-on", "gm-hot");
      sentence(base());
    };
    const read = (s: string) => clamp(650 + s.length * 37, 1150, 3400) * pace;
    const say = async (who: Who, s: string, mul = 1) => {
      speech = { who, text: s };
      await nap(host, read(s) * mul);
      speech = null;
      await nap(host, 110);
    };
    const walkTo = async (x: number, face?: 1 | -1) => {
      rv.tx = x;
      const t0 = performance.now();
      while (Math.abs(rv.x - rv.tx) > 0.6 && performance.now() - t0 < 6000) await nap(host, 40);
      rv.x = rv.tx; rv.walk = 0;
      if (face) rv.face = face;
    };
    const hover = async (h: Hot, ms2 = 440) => {
      await host.pointAt(h.el!, h.ax ?? 0.5, h.ay ?? 0.5, ms2);
      sentence(`${base()} ${h.name}`);
    };
    const chooseVerb = async (v: Verb) => {
      const e = verbEls[v];
      await host.pointAt(e, 0.42, 0.5, 380);
      e.classList.add("gm-hot");
      await nap(host, think(skill, 160));
      await host.click();
      e.classList.remove("gm-hot");
      e.classList.add("gm-on");
      verb = v; withItem = null;
      sentence(base());
    };
    const pointSlot = async (id: ItemId) => {
      const s = slots[inv.indexOf(id)];
      await host.pointAt(s, 0.5, 0.5, 380);
      s.classList.add("gm-hot");
      sentence(`${base()} ${itemName(id)}`);
      await nap(host, think(skill, 200));
      await host.click();
      s.classList.remove("gm-hot");
      s.classList.add("gm-on");
    };
    const chooseItem = async (id: ItemId) => {
      await pointSlot(id);
      withItem = id;
      sentence(base());
    };
    const execFlash = () => {
      sentEl.classList.add("gm-rb-exec");
      const id = window.setTimeout(() => sentEl.classList.remove("gm-rb-exec"), 450);
      scope.add(() => window.clearTimeout(id));
    };
    const act = async (v: Verb, h: Hot, item?: ItemId, walk = true) => {
      await chooseVerb(v);
      if (item) await chooseItem(item);
      await hover(h);
      await nap(host, think(skill, 220));
      await host.click();
      sentence(`${base()} ${h.name}`);
      execFlash();
      if (walk && h.walk !== undefined) await walkTo(h.walk, h.face);
      else await nap(host, 250);
    };
    /** A verb (and maybe an item) applied to something in the inventory. */
    const actOnItem = async (v: Verb, target: ItemId, item?: ItemId) => {
      await chooseVerb(v);
      if (item) await chooseItem(item);
      const name = itemName(target);
      await pointSlot(target);
      sentence(`${base()} ${name}`);
      execFlash();
      await nap(host, 250);
    };
    const browse = async (h: Hot) => { await hover(h, 520); await nap(host, think(skill, 420)); };

    // dialogue lines replace the verbs and inventory; code options keep their literal text
    const lineH = Math.min(24, Math.floor((PH - 30) / 4));
    const showDlg = (lines: string[], code: boolean[] = []) => {
      dlgEl.innerHTML = "";
      panel.classList.add("gm-rb-talking");
      sentence("");
      return lines.map((s, i) => {
        const d = document.createElement("div");
        d.className = "gm-rb-line";
        d.style.top = `${i * lineH}px`;
        d.style.height = `${lineH}px`;
        const b = document.createElement("b"); b.textContent = `${i + 1}`;
        const sp = document.createElement(code[i] ? "code" : "span"); sp.textContent = s;
        d.append(b, sp);
        dlgEl.appendChild(d);
        if (!calm) scope.fromTo(d, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.25, delay: i * 0.05, ease: "power2.out" });
        return d;
      });
    };
    let duelling = false;
    const hideDlg = () => {
      dlgEl.innerHTML = "";
      if (duelling) return;
      panel.classList.remove("gm-rb-talking");
      reset();
    };
    const chooseLine = async (lines: string[], idx: number, glances = 1, keep = false, code: boolean[] = []) => {
      const els = showDlg(lines, code);
      await nap(host, 380);
      const others = lines.map((_, i) => i).filter((i) => i !== idx).sort(() => Math.random() - 0.5).slice(0, glances);
      for (const g of others) {
        await host.pointAt(els[g], 0.5, 0.5, 400);
        els[g].classList.add("gm-hot");
        await nap(host, think(skill, 650) * pace);
        els[g].classList.remove("gm-hot");
      }
      await host.pointAt(els[idx], 0.5, 0.5, 380);
      els[idx].classList.add("gm-hot");
      await nap(host, think(skill, 420) * pace);
      await host.click();
      if (!keep) hideDlg(); else { dlgEl.innerHTML = ""; }
      return lines[idx];
    };

    // ---- title card ----
    const title = document.createElement("div");
    title.className = "gm-rb-title";
    title.innerHTML = `<i class="gm-rb-beam" aria-hidden="true"></i><svg class="gm-rb-tower" width="18" height="44" viewBox="0 0 18 44" aria-hidden="true"><path d="M5 12h8l2 32H3z" fill="#bdb4cf"/><path d="M4.4 22h9.2l.5 7H3.9zM3.6 34h10.8l.4 6H3.2z" fill="#8a3a4c"/><rect x="2" y="10" width="14" height="2.5" rx="1" fill="#2a1c36"/><rect x="5" y="3" width="8" height="7" rx="1.5" fill="#ffe9a8"/><path d="M4 3.5 9 0l5 3.5z" fill="#8a3a4c"/></svg><strong>Rustwater Bay</strong><span>Episode One: The Dark Lighthouse</span>`;
    f.stage.appendChild(title);
    f.setScore("Rustwater Bay");
    sentence("Walk to");
    scope.fromTo(title, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    if (!calm) {
      scope.fromTo(title.querySelector("strong"), { y: 10, scale: 0.92 }, { y: 0, scale: 1, duration: 0.9, ease: "back.out(2)" });
      scope.fromTo(title.querySelector(".gm-rb-beam"), { rotation: -26 }, { rotation: 10, duration: 2.4, ease: "sine.inOut" });
    }
    await nap(host, 2100 * pace);
    scope.to(title, { opacity: 0, duration: 0.5, onComplete: () => title.remove() });
    scope.to(look, { fade: 0, duration: 0.8, ease: "sine.out" });
    host.react("focus");

    // ---- part one: the harbour ----
    rv.tx = 46;
    await walkTo(46);
    await say("nibs", "Rustwater Bay. Salt, oil and a lot of boats bumping into things.", 0.85);
    const misclicks = { left: S.left > 86000 ? (chance(0.25 + (1 - skill) * 0.6) ? (chance(0.4) ? 2 : 1) : 0) : 0 };
    if (chance(0.7)) await browse(H1.lamp);
    if (S.left > 84000) {
      if (chance(0.6)) await browse(H1.sign);
      await act("scan", H1.notice);
      await say("nibs", "\"Cogwheel Rock lighthouse is dark. Whoever relights it gets free oil for a year.\"");
      reset();
      if (chance(0.6)) await say("nibs", "Free oil! I would do anything for free oil. Within reason.");
    }
    if (misclicks.left > 0) {
      misclicks.left--;
      await act("grab", H1.moon, undefined, false);
      await say("nibs", "I can't reach that. Even my telescopic arms have limits.");
      reset();
    }
    let talked = false;
    if (S.left > 70000) {
      talked = true;
      await act("talk", H1.dock);
      await say("bollard", "Evening. Lights are out on the rock again, so boats keep parking in the tavern.", 0.85);
      const topics = ["I'm Nibs. I deliver parcels. Mostly to the right address.", "How do I get to Cogwheel Rock?", "Nice periscope.", "Bye."];
      if (S.left > 84000) {
        await chooseLine(topics, 0, 1, true);
        await say("nibs", topics[0]);
        await say("bollard", "Bollard, dockmaster. Your battery light is blinking, kid.");
        if (chance(0.4)) await say("nibs", "That's my brave face.");
      }
      await chooseLine(topics, 1, chance(0.4) ? 1 : 0, true);
      await say("nibs", topics[1]);
      await say("bollard", "Ride the cable over. You'll want a pulley that actually rolls.");
      await say("bollard", "And the top rung on the cable pole lost its bolt. I'd fix it, but I'm a barrel.");
      if (S.left > 82000 && chance(0.4)) {
        await chooseLine(topics, 2, 0, true);
        await say("nibs", topics[2]);
        await say("bollard", "Thanks. Mostly I use it to look at my own feet.");
      }
      await chooseLine(topics, 3, 0);
      await say("bollard", "Mind the cable. It hums.", 0.8);
    }
    // the crate
    if (misclicks.left > 0 || (S.left > 66000 && chance(0.35 * (1 - skill)))) {
      misclicks.left = Math.max(0, misclicks.left - 1);
      await act("grab", H1.crate);
      await say("nibs", "It's heavier than my to-do list. And that's saying a lot.");
      reset();
    }
    await act("use", H1.crate);
    look.reach = 1;
    scope.to(look, { lid: 1, duration: 0.45, ease: "back.out(1.6)" });
    await nap(host, 260);
    look.reach = 0;
    scope.to(look, { pop: 1, duration: 0.5, ease: "back.out(3)" });
    reset();
    if (!calm) host.react("surprised");
    if (S.left > 60000) await say("nibs", "Spare parts. Somebody ordered one of everything.", 0.85);
    setHots([H1.moon, H1.sign, H1.notice, H1.door, H1.lamp, H1.pulley, H1.dock, H1.pole, H1.cable]);
    await act("grab", H1.pulley);
    look.reach = 1;
    await nap(host, 260);
    look.pop = 0;
    look.reach = 0;
    addItem("pulley");
    reset();
    await say("nibs", "A pulley. Rusted solid. It squeaks just thinking about moving.");
    if (misclicks.left > 0) {
      await act("use", H1.dock, "pulley");
      await say("bollard", "Kind of you, but I don't need a pulley. I need a nap.");
      reset();
    }
    // oil the pulley, right there in the inventory
    await actOnItem("use", "pulley", "oil");
    oiled = true;
    paintSlot(inv.indexOf("pulley"));
    const shine = slots[inv.indexOf("pulley")].firstElementChild;
    if (!calm && shine) scope.fromTo(shine, { rotation: -200 }, { rotation: 0, duration: 0.7, ease: "power3.out" });
    reset();
    await say("nibs", "Squeak. Squee. Silence. Beautiful.", 0.85);
    // the loose rung: a robot who listened goes straight for the bolt
    if (!talked) {
      await act("use", H1.cable, "pulley");
      look.reach = 1;
      await nap(host, 300);
      look.reach = 0;
      reset();
      await say("nibs", "The top rung wobbles. I'd fall right off. Where's a bolt when you need one?");
    }
    await act("use", H1.pole, "bolt");
    look.reach = 1;
    scope.to(look, { rung: 1, duration: 0.5, ease: "back.out(2.4)" });
    burst(352.5, 93, "#e4e8f6", 6);
    await nap(host, 420);
    look.reach = 0;
    dropItem("bolt");
    reset();
    await say("nibs", "Righty tighty. Solid as a seawall.", 0.8);
    // across the cable
    await act("use", H1.cable, "pulley");
    host.react("focus");
    await say("nibs", "Here goes nothing. Which is roughly what I weigh.", 0.8);
    reset();
    const cy1 = (x: number) => 74 + (x - 352) * (34 / 88);
    rv.lock = true;
    await new Promise<void>((res) => {
      scope.timeline({ onComplete: res })
        .to(rv, { x: 352, duration: 0.35, ease: "power1.out", onUpdate: () => { rv.tx = rv.x; } })
        .to(rv, { y: cy1(352) + 56, duration: 0.35, ease: "power2.out", onStart: () => { look.hang = true; } }, "<");
    });
    speech = { who: "nibs", text: "Wheeeeee!" };
    await new Promise<void>((res) => {
      scope.to(rv, { x: 520, duration: 1.7, ease: "power2.in", onUpdate: () => { rv.tx = rv.x; rv.y = cy1(rv.x) + 56; }, onComplete: res });
      scope.to(look, { fade: 1, duration: 0.5, delay: 1.25 });
    });
    speech = null;

    // ---- part two: Cogwheel Rock ----
    scene = 2;
    f.setScore("Cogwheel Rock");
    setHots([H2.palm, H2.torch, H2.ship, H2.lighthouse, H2.hex]);
    const cy2 = (x: number) => -20 + (x + 60) * (76 / 110);
    rv.x = rv.tx = -40; rv.y = cy2(-40) + 56;
    scope.to(look, { fade: 0, duration: 0.6 });
    await new Promise<void>((res) => {
      scope.to(rv, { x: 44, duration: 1.1, ease: "power2.out", onUpdate: () => { rv.tx = rv.x; rv.y = cy2(rv.x) + 56; }, onComplete: res });
    });
    look.hang = false;
    await new Promise<void>((res) => {
      scope.timeline({ onComplete: res })
        .to(rv, { x: 70, duration: 0.55, ease: "none", onUpdate: () => { rv.tx = rv.x; } })
        .to(rv, { y: FOOT, duration: 0.55, ease: "bounce.out" }, "<");
    });
    rv.lock = false;
    await say("nibs", "Ow. I meant to do that.", 0.8);
    await say("hex", "Another tin can washes ashore.", 0.85);
    if (S.left > 48000 && chance(0.5)) await browse(chance(0.5) ? H2.torch : H2.lighthouse);
    await act("talk", H2.hex);
    rv.face = 1;
    const opening = ["I'm here to relight the lighthouse!", "Is this Cogwheel Rock?", "Nice hat."];
    if (S.left > 52000 && chance(0.4)) {
      await chooseLine(opening, 2, 0, true);
      await say("nibs", opening[2]);
      await say("hex", "It holds my cooling fan. Show some respect.");
    }
    await chooseLine(opening, 0, 0);
    await say("nibs", opening[0]);
    await say("hex", "Captain Hex, keeper of this rock. The lamp code is full of bugs.", 0.85);
    await say("hex", "Out-debug me, and the lamp is yours.", 0.85);
    // a careful robot reads up first
    let studied = false;
    if (S.left > 50000 && chance(0.35 + skill * 0.4)) {
      studied = true;
      await actOnItem("scan", "almanac");
      reset();
      await say("nibs", "Chapter three: off-by-one errors and other sea monsters. Got it.", 0.85);
    }

    // ---- the debug duel ----
    const gauge = document.createElement("div");
    gauge.className = "gm-rb-gauge";
    gauge.style.top = `${SH + 3}px`;
    f.stage.appendChild(gauge);
    scope.add(() => gauge.remove());
    const showGauge = (lit: number, target: number, miss: number, slips: number) => {
      const dots = (n: number, on: number, cls: string) => Array.from({ length: n }, (_, i) => `<i class="${cls}${i < on ? " gm-on" : ""}"></i>`).join("");
      gauge.innerHTML = `<span>Lamp</span>${dots(target, lit, "gm-rb-bulb")}<span>Slips</span>${dots(slips, miss, "gm-rb-slip")}`;
      f.setScore(`Lamp ${lit}/${target}`, true);
      scope.to(look, { lamp: lit / target, duration: 0.6, ease: "sine.out" });
    };
    const bounce = (k: "r" | "m") => {
      if (calm) return;
      scope.timeline().to(hop, { [k]: 1, duration: 0.16, ease: "power2.out" }).to(hop, { [k]: 0, duration: 0.34, ease: "bounce.out" });
    };
    const known = new Set<number>();
    const knowP = 0.12 + 0.6 * skill + (studied ? 0.15 : 0);

    const duel = async (): Promise<{ res: "win" | "lose" | "time"; lit: number; miss: number }> => {
      let target = S.left > 42000 ? 4 : 3, slips = 3, lit = 0, miss = 0, n = 0;
      const order = PUZZLES.map((_, i) => i).sort(() => Math.random() - 0.5);
      duelling = true; look.pad = true;
      panel.classList.add("gm-rb-talking");
      sentence("");
      rv.lock = true; ms.lock = true; rv.face = 1; ms.face = -1;
      rv.speed = 50; rv.tx = 168; ms.tx = 282;
      look.lamp = 0;
      showGauge(0, target, 0, slips);
      await nap(host, 500);
      while (lit < target && miss < slips) {
        if (S.left < 8500) return { res: "time", lit, miss };
        if (S.left < 18000 && (target > lit + 1 || slips > miss + 1)) {
          target = lit + 1; slips = miss + 1;
          showGauge(lit, target, miss, slips);
          await say("hex", "The tide is turning. Next bug decides it.", 0.8);
        }
        const i = order[n++ % order.length], p = PUZZLES[i];
        Object.assign(board, { ask: p.kind === "fix" ? "PATCH THIS" : "WHAT PRINTS?", code: p.code, ok: p.ok, pick: "", state: "ask" });
        look.point = true;
        scope.to(board, { a: 1, duration: 0.3, ease: "sine.out" });
        await say("hex", pick(p.kind === "fix" ? ASK_FIX : ASK_TRACE), 0.85);
        look.point = false;
        const lines = [p.ok, p.near, p.silly].sort(() => Math.random() - 0.5);
        host.react("focus");
        const knows = known.has(i) || chance(knowP);
        // not sure: a sharp robot at least rules out the silly answer
        const sane = chance(0.5 + 0.4 * skill) ? lines.filter((l) => l !== p.silly) : lines;
        const idx = knows ? lines.indexOf(p.ok) : lines.indexOf(pick(sane));
        const said = await chooseLine(lines, idx, knows ? (chance(0.3) ? 1 : 0) : 1 + (chance(0.5) ? 1 : 0), false, lines.map((l) => l !== p.silly));
        board.pick = said;
        known.add(i); // right or wrong, the board shows the answer, and the robot remembers it
        if (said === p.silly) await say("nibs", said, 0.8);
        if (said === p.ok) {
          board.state = "ok";
          lit++; showGauge(lit, target, miss, slips);
          bounce("r");
          burst(LAMP[0], LAMP[1], "#ffe08a");
          await say("nibs", pick(RIGHT), 0.7);
          if (chance(0.55)) await say("hex", pick(OUCH), 0.8);
          if (chance(0.3)) host.react("laugh");
        } else {
          board.state = "bad";
          miss++; showGauge(lit, target, miss, slips);
          bounce("m");
          burst(rv.x + 14, rv.y - 30, "#ff8a7a", 8);
          await say("hex", pick(GLOAT), 0.85);
          host.react(chance(0.5) ? "shy" : "angry");
        }
        scope.to(board, { a: 0, duration: 0.3, ease: "sine.in" });
        await nap(host, 320);
      }
      return { res: lit >= target ? "win" : "lose", lit, miss };
    };

    // closing beats shrink to fit whatever time is left
    const tail = (ms: number) => nap(host, clamp(S.left - 250, 250, ms));
    let duels = 0;
    for (;;) {
      duels++;
      S.rounds = duels;
      const { res, lit, miss } = await duel();
      look.pad = false;
      duelling = false;
      panel.classList.remove("gm-rb-talking");
      reset();
      if (res === "win") {
        S.streak = 0;
        scope.to(look, { lamp: 1, beam: 1, duration: 1.2, ease: "sine.out" });
        await say("hex", "Fine! The lamp is yours, tide-tinkerer.");
        host.react("cheer");
        await say("nibs", "A year of free oil. I will never squeak again.");
        f.setScore("Lighthouse online", true);
        f.showOver("Lighthouse online", `Patched ${lit} bugs with ${miss} slips`, "good");
        await tail(2600);
        return { result: "win", score: duels };
      }
      if (res === "time") {
        await say("hex", "The tide is going out. Same bugs tomorrow?", 0.8);
        f.showOver("Duel postponed", `Stopped with ${lit} lamp segments lit`, "plain");
        await tail(1400);
        return { result: "done", score: duels };
      }
      scope.to(look, { lamp: 0, duration: 0.8 });
      await say("hex", "Come back when your compiler grows up.", 0.9);
      f.showOver("Out-debugged", `Captain Hex keeps the lamp after ${miss} slips`, "bad");
      await tail(1300);
      const next = S.afterLoss(0.18);
      if (next === "ragequit") {
        host.react("angry");
        f.hideOver();
        await say("nibs", "This rock has a terrible user interface!", 0.85);
        f.showOver("Rage quit", "Nibs stomped off the rock", "bad");
        await tail(900);
        return { result: "ragequit", score: duels };
      }
      if (next === "lose" || S.left < 30000) {
        host.react(chance(0.5) ? "relax" : "shy");
        await tail(1500);
        return { result: "lose", score: duels };
      }
      f.hideOver();
      host.react("focus");
      await say("nibs", "Rematch! I took notes.", 0.85);
      if (chance(0.5)) host.tap(".");
      await say("hex", "Fine. Fresh bugs, same tide.", chance(0.5) ? 0.5 : 0.8);
    }
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
