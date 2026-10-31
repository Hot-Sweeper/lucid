// The Secret of Robot Island: a point-and-click pirate adventure in the old verb-panel style.
// Rivet Lowpower, a very small robot, wants to be a pirate. The robot at the desk clicks verbs,
// hotspots and inventory items, solves a tiny puzzle chain (rubber chicken, pulley, cable),
// zips across to the island and fights the Sword Master with insults instead of skill.
import "./games.css";
import "./island.css";
import {
  Scope, Session, Halt, mountFrame, addCanvas, fitCanvas, nap, think, chance, pick, clamp, rng, hash, reducedMotion,
  fillRR, circle, ellipse, poly, line, lin, glow, withAlpha,
  type Ctx, type FunHost, type FunOpts, type Outcome,
} from "./kit";

// Scenes are painted in a fixed logical box and anchored to the bottom of the scene area.
const LW = 440, LH = 205, FOOT = 186;
type Who = "rivet" | "scope" | "master";
const VOICE: Record<Who, string> = { rivet: "#ffffff", scope: "#8fe3ff", master: "#ffa592" };

const VERBS = [
  ["give", "Give"], ["pickup", "Pick up"], ["use", "Use"],
  ["open", "Open"], ["look", "Look at"], ["push", "Push"],
  ["close", "Close"], ["talk", "Talk to"], ["pull", "Pull"],
] as const;
type Verb = (typeof VERBS)[number][0];
const VLABEL = Object.fromEntries(VERBS) as Record<Verb, string>;

// ---- the insult swordfight -------------------------------------------------------------

const PAIRS: { i: string; r: string }[] = [
  { i: "You compile like a toaster!", r: "Then you must be my favourite snack." },
  { i: "I've seen dot matrix printers with better footwork!", r: "And yet you still can't read my moves." },
  { i: "Your firmware is older than the floppy disk!", r: "Then show some respect for your elders." },
  { i: "I'll rust you faster than sea spray!", r: "Too late. I'm stainless where it counts." },
  { i: "Every word you say is a syntax error!", r: "Then stop parsing them so carefully." },
  { i: "My blade will defragment you!", r: "Finally, someone to tidy up my insides." },
  { i: "You fight like a screensaver!", r: "Then why can't you look away?" },
  { i: "I've met dial-up modems with more speed!", r: "Funny, they said the same about you." },
  { i: "Your mother was a pocket calculator!", r: "And she taught me to count your mistakes." },
  { i: "There are bugs in your code older than you!", r: "That's why I keep them as pets." },
];
const DECOYS = [
  "Oh yeah?", "I am rubber, you are glue.", "Look behind you, a three-headed toaster!",
  "Please insert disk two.", "Have you tried turning yourself off and on?",
];
const LAME = ["Your antenna is... kind of crooked?", "You're a big... metal... person!", "I know you are, but what am I?"];
const LAME_REPLY = ["Is that supposed to sting?", "My spam filter caught that one.", "Adorable."];
const GLOAT = ["How very original.", "Was that a comeback or a crash report?", "My screensaver has better lines."];
const OUCH = ["Hmph. Lucky guess.", "Ngh. Fine.", "Who taught you that?"];
const STUMPED = ["I... um... oh yeah?", "Hold on, I had a comeback cached somewhere.", "Er... nice antenna?"];

// ---- painting helpers -------------------------------------------------------------------

function layer(W: number, H: number, ox: number, oy: number, draw: (ctx: Ctx) => void) {
  const c = document.createElement("canvas");
  const ctx = fitCanvas(c, W, H);
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
  // poster
  fillRR(ctx, 104, 108, 24, 32, 1.5, "#e9d8ad");
  ctx.font = '700 5.5px "Lexend Variable", system-ui, sans-serif'; ctx.fillStyle = "#6a3a2a";
  ctx.fillText("WANTED", 116, 114);
  line(ctx, [[109, 134], [123, 120]], 1.6, "#4a4a5e");
  line(ctx, [[110, 125], [114, 129]], 1.6, "#a07a30");
  for (let i = 0; i < 3; i++) fillRR(ctx, 108, 129 + i * 3.2, 16 - i * 4, 1.4, 0.7, "#a08a6a");
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
  ctx.fillText("NOVELTY", 220, 158); ctx.fillText("IMPORTS", 220, 166);
  // barrel for the lookout
  fillRR(ctx, 288, 146, 26, 28, 7, "#5a3a2e");
  ctx.fillStyle = "#3a2620"; ctx.fillRect(288, 152, 26, 2.5); ctx.fillRect(288, 166, 26, 2.5);
  // cable pole and the cable to the island
  fillRR(ctx, 349, 68, 7, 108, 2, "#2a1c26");
  fillRR(ctx, 343, 72, 18, 4, 1.5, "#2a1c26");
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
  // rocks and a chest-shaped rock (no treasure, sorry)
  ellipse(ctx, 392, 170, 22, 10, "#3a2840"); ellipse(ctx, 386, 166, 14, 7, "#4a3450");
  ellipse(ctx, 24, 176, 16, 7, "#3a2840");
  // palms framing the clearing
  palm(ctx, 40, LH + 10, 160, 10, "#140e26");
  palm(ctx, 418, LH + 10, 150, -14, "#140e26");
  palm(ctx, 372, 140, 64, -6, "#1d1434");
  // the cable comes in from the harbour and ends at the big palm
  line(ctx, [[-60, -20], [50, 56]], 1.6, "#a9a1cc");
  fillRR(ctx, 44, 52, 12, 6, 2, "#2a1c26");
  // torch poles (flames are live)
  for (const tx of [146, 332]) { line(ctx, [[tx, 170], [tx, 124]], 3, "#2a1a24"); fillRR(ctx, tx - 4, 118, 8, 8, 2, "#3a2620"); }
}

// ---- characters ---------------------------------------------------------------------------

interface Mover { x: number; y: number; tx: number; face: 1 | -1; walk: number; speed: number; lock: boolean }

function drawRivet(ctx: Ctx, m: Mover, t: number, o: { talk: boolean; hang: boolean; sword: boolean; lunge: number; reach: number }) {
  ctx.save();
  ctx.translate(m.x + o.lunge * 8 * m.face, m.y);
  ctx.scale(m.face, 1);
  const sw = m.walk ? Math.sin(m.walk) : 0;
  const bob = m.walk ? Math.abs(Math.cos(m.walk)) * 1.6 : 0;
  if (!o.hang) ellipse(ctx, 0, 0, 12, 3, "rgba(5,3,20,0.45)");
  const legC = "#2b315f";
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
  fillRR(ctx, -9, -31, 18, 18, 6, "#f1eadb");
  fillRR(ctx, 3, -31, 6, 18, 4, "#ddd3c1");
  fillRR(ctx, -9, -17, 18, 3, 1, "#6a4026");
  fillRR(ctx, 0, -17.5, 4, 4, 1, "#e0b050");
  // head
  line(ctx, [[-8, -41], [-13, -38], [-12, -33]], 2.6, "#e3b65a");
  fillRR(ctx, -8, -46, 17, 14, 5, "#a9badd");
  fillRR(ctx, -1, -43.5, 10, 8.5, 3, "#1d2246");
  circle(ctx, 4.5, -40, 1.9, "#86f7cf");
  if (o.talk && Math.sin(t * 20) > -0.2) fillRR(ctx, 2.5, -37.5, 5, 1.8, 0.8, "#86f7cf");
  line(ctx, [[-2, -46], [-4, -52]], 1.5, "#8a96b8");
  circle(ctx, -4, -53.5, 2, "#ff6f6f");
  // front arm
  if (o.hang) line(ctx, [[5, -28], [2, -53]], 3.2, armC);
  else if (o.sword) {
    const up = o.lunge * 4 + Math.sin(t * 4) * 1.2;
    line(ctx, [[5, -27], [10, -23]], 3.2, armC);
    line(ctx, [[11, -23], [32 + o.lunge * 6, -30 - up]], 2, "#e4e8f6");
    fillRR(ctx, 9, -26, 3, 6, 1, "#e0b050");
  } else if (o.reach > 0) line(ctx, [[5, -27], [12, -27 - o.reach * 14]], 3.2, armC);
  else line(ctx, [[6, -27], [8 + sw * 2.5, -18]], 3.2, armC);
  ctx.restore();
}

function drawScope(ctx: Ctx, t: number, talk: boolean, calm: boolean) {
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
  // a tiny captain's cap, as a treat
  fillRR(ctx, x - 7, y - 61 - n, 13, 4, 2, "#1d2246"); fillRR(ctx, x - 10, y - 58 - n, 7, 1.6, 0.8, "#1d2246");
}

function drawMaster(ctx: Ctx, m: Mover, t: number, o: { talk: boolean; sword: boolean; lunge: number }) {
  ctx.save();
  ctx.translate(m.x + o.lunge * 9 * m.face, m.y);
  ctx.scale(m.face, 1);
  const sw = m.walk ? Math.sin(m.walk) : 0;
  ellipse(ctx, 0, 0, 15, 3.5, "rgba(5,3,20,0.45)");
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
  // tricorn hat with a gold band
  poly(ctx, [[-17, -62], [17, -62], [9, -68], [0, -76], [-9, -68]], "#16111e");
  fillRR(ctx, -12, -64, 24, 2, 1, "#e0b050");
  line(ctx, [[-6, -70], [-13, -78], [-19, -80]], 2.4, "#f2c45a");
  if (o.sword) {
    const up = o.lunge * 4 + Math.sin(t * 3.4 + 1) * 1.2;
    line(ctx, [[9, -42], [14, -32]], 3.6, "#8c2a40");
    line(ctx, [[15, -32], [42 + o.lunge * 6, -38 - up]], 2.2, "#e8ecf6");
    fillRR(ctx, 12, -36, 4, 8, 1, "#e0b050");
  } else line(ctx, [[9, -42], [12, -26]], 3.6, "#8c2a40");
  ctx.restore();
}

function drawChicken(ctx: Ctx, x: number, y: number, s: number, rot = 0, pulley = true) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  line(ctx, [[-3, 3], [-5, 8]], 1.4, "#e88a2a"); line(ctx, [[2, 3], [1, 8]], 1.4, "#e88a2a");
  ellipse(ctx, 0, 0, 12, 4.6, "#f4d64a");
  poly(ctx, [[-11, -1], [-17, -5], [-15, 1], [-17, 4], [-11, 2]], "#e9c53a");
  ellipse(ctx, 11, -4, 4, 3.6, "#f4d64a");
  circle(ctx, 10.5, -8, 1.8, "#ff5a5a"); circle(ctx, 13, -7.6, 1.5, "#ff5a5a");
  poly(ctx, [[14.5, -4.5], [19, -3], [14.5, -2]], "#f08a2a");
  circle(ctx, 12, -4.8, 0.9, "#2a1a24");
  if (pulley) { circle(ctx, 0, -1, 4.2, "#8a90a8"); circle(ctx, 0, -1, 1.6, "#2a2e48"); }
  ctx.restore();
}

// ---- inventory icons ------------------------------------------------------------------

type ItemId = "oil" | "bolt" | "manual" | "chicken";
const ITEMS: Record<ItemId, { name: string; draw: (ctx: Ctx) => void }> = {
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
  manual: {
    name: "pirate manual",
    draw: (c) => {
      fillRR(c, 8, 7, 20, 23, 2, "#3d6a8a"); fillRR(c, 8, 7, 4, 23, 1.5, "#2c4f6a");
      circle(c, 20, 16, 4, "#f1eadb"); fillRR(c, 17.5, 18, 5, 3, 1, "#f1eadb");
      circle(c, 18.6, 15.6, 0.9, "#2c4f6a"); circle(c, 21.4, 15.6, 0.9, "#2c4f6a");
      fillRR(c, 14, 24, 12, 2, 1, "#e0b050");
    },
  },
  chicken: { name: "rubber chicken with a pulley in the middle", draw: (c) => drawChicken(c, 17, 19, 0.92, -0.15) },
};

interface Hot { name: string; x: number; y: number; w: number; h: number; walk?: number; face?: 1 | -1; ax?: number; ay?: number; el?: HTMLElement }

export async function playRobotIsland(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope();
  const calm = reducedMotion();
  try {
    const f = mountFrame(body, scope, "The Secret of Robot Island", "ri");
    const S = new Session(host, opts, { base: 0.3, step: 0.18, calm: 0.1 });
    const skill = S.skill;
    const W = f.w, H = f.h;
    const SH = Math.round(H * 0.61);
    const OX = Math.round((W - LW) / 2), OY = SH - LH;
    const PH = H - SH;
    const pace = clamp(opts.maxMs / 100000, 0.72, 1);

    const { canvas, ctx } = addCanvas(f.stage, W, SH, "gm-ri-scene");
    canvas.style.height = `${SH}px`;
    const L1 = { back: layer(W, SH, OX, OY, harbourBack), front: layer(W, SH, OX, OY, harbourFront) };
    const L2 = { back: layer(W, SH, OX, OY, islandBack), front: layer(W, SH, OX, OY, islandFront) };

    // ---- the verb panel ----
    const panel = document.createElement("div");
    panel.className = "gm-ri-panel";
    panel.style.top = `${SH}px`;
    panel.style.height = `${PH}px`;
    panel.innerHTML = `<div class="gm-ri-sent"></div><div class="gm-ri-verbs"></div><div class="gm-ri-inv"></div><div class="gm-ri-dlg"></div>`;
    f.stage.appendChild(panel);
    const sentEl = panel.querySelector(".gm-ri-sent") as HTMLElement;
    const verbsEl = panel.querySelector(".gm-ri-verbs") as HTMLElement;
    const invEl = panel.querySelector(".gm-ri-inv") as HTMLElement;
    const dlgEl = panel.querySelector(".gm-ri-dlg") as HTMLElement;
    const rowH = Math.floor((PH - 30) / 3);
    const colW = 76;
    const verbEls = {} as Record<Verb, HTMLElement>;
    VERBS.forEach(([v, label], i) => {
      const e = document.createElement("div");
      e.className = "gm-ri-verb";
      e.textContent = label;
      e.style.left = `${8 + (i % 3) * colW}px`;
      e.style.top = `${Math.floor(i / 3) * rowH}px`;
      e.style.width = `${colW}px`;
      e.style.height = `${rowH}px`;
      verbsEl.appendChild(e);
      verbEls[v] = e;
    });
    const slotW = 40, slotH = Math.floor((rowH * 3 - 6) / 2);
    const slots: HTMLElement[] = [];
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("div");
      s.className = "gm-ri-slot";
      s.style.left = `${(i % 4) * (slotW + 3)}px`;
      s.style.top = `${Math.floor(i / 4) * (slotH + 4)}px`;
      s.style.width = `${slotW}px`;
      s.style.height = `${slotH}px`;
      invEl.appendChild(s);
      slots.push(s);
    }
    for (const [k, top] of [["up", 0], ["dn", slotH + 4]] as const) {
      const a = document.createElement("div");
      a.className = `gm-ri-arr gm-ri-${k}`;
      a.style.left = `${4 * (slotW + 3)}px`;
      a.style.top = `${top}px`;
      a.style.height = `${slotH}px`;
      invEl.appendChild(a);
    }
    invEl.style.left = `${W - (4 * (slotW + 3) + 22) - 8}px`;
    const inv: ItemId[] = [];
    const addItem = (id: ItemId, pop = true) => {
      const s = slots[inv.length];
      inv.push(id);
      const c = document.createElement("canvas");
      const cx = fitCanvas(c, 36, 36);
      ITEMS[id].draw(cx);
      s.appendChild(c);
      if (pop && !calm) scope.fromTo(c, { scale: 0.3, rotation: -20 }, { scale: 1, rotation: 0, duration: 0.55, ease: "back.out(2.6)" });
    };
    addItem("oil", false); addItem("bolt", false); addItem("manual", false);

    // ---- hotspots (invisible boxes over the painting) ----
    let hots: Hot[] = [];
    const setHots = (list: Hot[]) => {
      for (const h of hots) h.el?.remove();
      hots = list;
      for (const h of list) {
        const e = document.createElement("i");
        e.className = "gm-ri-hot";
        e.style.left = `${Math.round(h.x + OX)}px`; e.style.top = `${Math.round(h.y + OY)}px`;
        e.style.width = `${h.w}px`; e.style.height = `${h.h}px`;
        f.stage.appendChild(e);
        h.el = e;
      }
    };
    const H1 = {
      moon: { name: "moon", x: 176, y: 14, w: 40, h: 40 } as Hot,
      sign: { name: "sign", x: 34, y: 60, w: 92, h: 18 } as Hot,
      poster: { name: "poster", x: 102, y: 106, w: 28, h: 36, walk: 116, face: -1 } as Hot,
      door: { name: "door", x: 64, y: 104, w: 32, h: 54, walk: 80, face: -1 } as Hot,
      lamp: { name: "lamp post", x: 166, y: 76, w: 20, h: 86, walk: 162, face: 1 } as Hot,
      crate: { name: "crate", x: 214, y: 124, w: 32, h: 26, walk: 198, face: 1 } as Hot,
      chicken: { name: "rubber chicken with a pulley in the middle", x: 218, y: 108, w: 28, h: 22, walk: 198, face: 1 } as Hot,
      lookout: { name: "lookout", x: 284, y: 86, w: 32, h: 88, walk: 266, face: 1 } as Hot,
      cable: { name: "cable", x: 372, y: 80, w: 44, h: 16, walk: 336, face: 1 } as Hot,
    };
    const H2 = {
      master: { name: "Sword Master", x: 284, y: 100, w: 34, h: 84, walk: 196, face: 1 } as Hot,
      torch: { name: "torch", x: 138, y: 102, w: 16, h: 66 } as Hot,
      palm: { name: "palm tree", x: 26, y: 50, w: 40, h: 120 } as Hot,
      ship: { name: "ship", x: 300, y: 88, w: 38, h: 30 } as Hot,
    };
    setHots([H1.moon, H1.sign, H1.poster, H1.door, H1.lamp, H1.crate, H1.lookout, H1.cable]);

    // ---- world state ----
    let scene: 1 | 2 = 1;
    const rv: Mover = { x: -24, y: FOOT, tx: -24, face: 1, walk: 0, speed: 96, lock: false };
    const ms: Mover = { x: 300, y: 180, tx: 300, face: -1, walk: 0, speed: 60, lock: true };
    const look = { hang: false, sword: false, reach: 0, fade: 1, lid: 0, chicken: 0, mSword: false };
    const lunge = { r: 0, m: 0 };
    let speech: { who: Who; text: string } | null = null;
    const sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
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

    const wrap = (s: string, maxW: number) => {
      const words = s.split(" "), out: string[] = [];
      let cur = "";
      for (const w of words) {
        const tt = cur ? `${cur} ${w}` : w;
        if (cur && ctx.measureText(tt).width > maxW) { out.push(cur); cur = w; } else cur = tt;
      }
      if (cur) out.push(cur);
      return out;
    };
    const drawSpeech = () => {
      if (!speech) return;
      const who = speech.who;
      const [ax, ay] = who === "rivet" ? [rv.x, rv.y - (look.hang ? 62 : 60)] : who === "scope" ? [301, 82] : [ms.x, ms.y - 90];
      ctx.font = '600 12px "Lexend Variable", system-ui, sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const lines = wrap(speech.text, 220);
      const lh = 14;
      const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
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

    scope.raf((t, dt) => {
      const tt = calm ? 0 : t;
      move(rv, dt); move(ms, dt);
      if (!calm) flick = clamp(flick + (Math.random() - 0.5) * dt * 6, 0.8, 1);
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      const Lr = scene === 1 ? L1 : L2;
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
        // crate lid and its rubber surprise
        if (look.chicken > 0) drawChicken(ctx, 232, 126 - look.chicken * 8, 0.9, -0.5 + look.chicken * 0.3);
        ctx.save();
        ctx.translate(214 + look.lid * 34, 128 - look.lid * 4);
        ctx.rotate(look.lid * 1.1);
        fillRR(ctx, 0, -5, 33, 5, 1.5, "#9a7044");
        ctx.restore();
        drawScope(ctx, t, speech?.who === "scope", calm);
      } else {
        for (const tx of [146, 332]) {
          const fl = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 13 + tx);
          glow(ctx, tx, 112, 46, "#ff9d4a", 0.32 * fl);
          ellipse(ctx, tx, 113 - fl * 2, 4.5, 8 * fl, "#ff8a3a");
          ellipse(ctx, tx, 115 - fl, 2.6, 5 * fl, "#ffe08a");
        }
        drawMaster(ctx, ms, t, { talk: speech?.who === "master", sword: look.mSword, lunge: lunge.m });
      }
      if (look.hang) {
        const slope = scene === 1 ? 34 / 88 : 76 / 110;
        drawChicken(ctx, rv.x, rv.y - 56, 0.9, Math.atan(slope), true);
      }
      drawRivet(ctx, rv, t, { talk: speech?.who === "rivet", hang: look.hang, sword: look.sword, lunge: lunge.r, reach: look.reach });
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        circle(ctx, p.x, p.y, 1.3, withAlpha("#ffe08a", clamp(p.life * 3)));
      }
      drawSpeech();
      ctx.restore();
      if (look.fade > 0.001) { ctx.fillStyle = `rgba(5,3,16,${look.fade})`; ctx.fillRect(0, 0, W, SH); }
    });

    // ---- robot actions ----
    let verb: Verb | null = null;
    let withItem: ItemId | null = null;
    const base = () => verb ? (withItem ? `${VLABEL[verb]} ${ITEMS[withItem].name} with` : VLABEL[verb]) : "Walk to";
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
    const chooseItem = async (id: ItemId) => {
      const s = slots[inv.indexOf(id)];
      await host.pointAt(s, 0.5, 0.5, 380);
      s.classList.add("gm-hot");
      sentence(`${base()} ${ITEMS[id].name}`);
      await nap(host, think(skill, 200));
      await host.click();
      s.classList.remove("gm-hot");
      s.classList.add("gm-on");
      withItem = id;
      sentence(base());
    };
    const execFlash = () => {
      sentEl.classList.add("gm-ri-exec");
      const id = window.setTimeout(() => sentEl.classList.remove("gm-ri-exec"), 450);
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
    const browse = async (h: Hot) => { await hover(h, 520); await nap(host, think(skill, 420)); };
    const clickGround = async (x: number) => {
      const e = f.aim(x + OX, FOOT - 4 + OY, 16, 10);
      await host.pointAt(e, 0.5, 0.5, 420);
      sentence("Walk to");
      await host.click();
      await walkTo(x);
    };

    // dialogue lines replace the verbs and inventory
    const lineH = Math.min(24, Math.floor((PH - 30) / 4));
    const showDlg = (lines: string[]) => {
      dlgEl.innerHTML = "";
      panel.classList.add("gm-ri-talking");
      sentence("");
      return lines.map((s, i) => {
        const d = document.createElement("div");
        d.className = "gm-ri-line";
        d.style.top = `${i * lineH}px`;
        d.style.height = `${lineH}px`;
        const b = document.createElement("b"); b.textContent = `${i + 1}`;
        const sp = document.createElement("span"); sp.textContent = s;
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
      panel.classList.remove("gm-ri-talking");
      reset();
    };
    const chooseLine = async (lines: string[], idx: number, glances = 1, keep = false) => {
      const els = showDlg(lines);
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
    title.className = "gm-ri-title";
    title.innerHTML = `<b>The Secret of</b><strong>Robot Island</strong><span>Chapter One: The Zipline of Destiny</span>`;
    f.stage.appendChild(title);
    f.setScore("Port Overflow");
    sentence("Walk to");
    scope.fromTo(title, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    if (!calm) scope.fromTo(title.querySelector("strong"), { y: 10, scale: 0.92 }, { y: 0, scale: 1, duration: 0.9, ease: "back.out(2)" });
    await nap(host, 2100 * pace);
    scope.to(title, { opacity: 0, duration: 0.5, onComplete: () => title.remove() });
    scope.to(look, { fade: 0, duration: 0.8, ease: "sine.out" });
    host.react("focus");

    // ---- part one: the harbour ----
    rv.tx = 46;
    await walkTo(46);
    await say("rivet", "Port Overflow. Smells like salt, oil and opportunity.", 0.85);
    const misclicks = { left: S.left > 86000 ? (chance(0.25 + (1 - skill) * 0.6) ? (chance(0.4) ? 2 : 1) : 0) : 0 };
    if (chance(0.7)) await browse(H1.lamp);
    if (S.left > 84000) {
      if (chance(0.6)) await browse(H1.sign);
      await act("look", H1.poster);
      look.reach = 0;
      await say("rivet", "\"Pirates wanted. Must defeat the Sword Master of Robot Island.\"");
      reset();
      if (chance(0.6)) await say("rivet", "Robot Island! I'm a robot. I'm practically a local.");
    }
    if (misclicks.left > 0) {
      misclicks.left--;
      await act("pickup", H1.moon, undefined, false);
      await say("rivet", "I can't reach that. Even my telescopic arms have limits.");
      reset();
    }
    if (S.left > 70000) {
      await act("talk", H1.lookout);
      await say("scope", "Halt! Who goes there? Oh. A very small robot.", 0.85);
      const topics = ["My name is Rivet Lowpower, and I want to be a pirate!", "How do I get to Robot Island?", "Nice periscope.", "Bye."];
      if (S.left > 84000) {
        await chooseLine(topics, 0, 1, true);
        await say("rivet", topics[0]);
        await say("scope", "A pirate? Your battery light is blinking, son.");
        if (chance(0.4)) await say("rivet", "That's my fierce look.");
      }
      await chooseLine(topics, 1, chance(0.4) ? 1 : 0, true);
      await say("rivet", topics[1]);
      await say("scope", "Ride the cable. You'd need something with a pulley in the middle.");
      if (S.left > 82000 && chance(0.4)) {
        await chooseLine(topics, 2, 0, true);
        await say("rivet", topics[2]);
        await say("scope", "Thanks. Mostly I use it to look at my own feet.");
      }
      await chooseLine(topics, 3, 0);
      await say("scope", "Mind the cable. It bites.", 0.8);
    }
    // the crate
    if (misclicks.left > 0 || (S.left > 66000 && chance(0.35 * (1 - skill)))) {
      misclicks.left = Math.max(0, misclicks.left - 1);
      await act("pickup", H1.crate);
      await say("rivet", "It's heavier than my self esteem. And that's saying a lot.");
      reset();
    }
    await act("open", H1.crate);
    look.reach = 1;
    scope.to(look, { lid: 1, duration: 0.45, ease: "back.out(1.6)" });
    await nap(host, 260);
    look.reach = 0;
    scope.to(look, { chicken: 1, duration: 0.5, ease: "back.out(3)" });
    reset();
    if (!calm) host.react("surprised");
    if (S.left > 60000) await say("rivet", "Novelty Imports. Somebody ordered one of everything.", 0.85);
    setHots([H1.moon, H1.sign, H1.poster, H1.door, H1.lamp, H1.chicken, H1.lookout, H1.cable]);
    await act("pickup", H1.chicken);
    look.reach = 1;
    await nap(host, 260);
    look.chicken = 0;
    look.reach = 0;
    addItem("chicken");
    reset();
    await say("rivet", "A rubber chicken with a pulley in the middle. Of course.");
    if (misclicks.left > 0) {
      await act("use", H1.lookout, "chicken");
      await say("scope", "I'm flattered, but I'm on duty.");
      reset();
    }
    // across the cable
    await act("use", H1.cable, "chicken");
    host.react("focus");
    await say("rivet", "Here goes nothing. Which is roughly what I weigh.", 0.8);
    reset();
    const cy1 = (x: number) => 74 + (x - 352) * (34 / 88);
    rv.lock = true;
    await new Promise<void>((res) => {
      scope.timeline({ onComplete: res })
        .to(rv, { x: 352, duration: 0.35, ease: "power1.out", onUpdate: () => { rv.tx = rv.x; } })
        .to(rv, { y: cy1(352) + 56, duration: 0.35, ease: "power2.out", onStart: () => { look.hang = true; } }, "<");
    });
    speech = { who: "rivet", text: "Wheeeeee!" };
    await new Promise<void>((res) => {
      scope.to(rv, { x: 520, duration: 1.7, ease: "power2.in", onUpdate: () => { rv.tx = rv.x; rv.y = cy1(rv.x) + 56; }, onComplete: res });
      scope.to(look, { fade: 1, duration: 0.5, delay: 1.25 });
    });
    speech = null;
    // ---- part two: Robot Island ----
    scene = 2;
    f.setScore("Robot Island");
    setHots([H2.palm, H2.torch, H2.ship, H2.master]);
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
    await say("rivet", "Ow. I meant to do that.", 0.8);
    await say("master", "Another tin can washes ashore.", 0.85);
    if (S.left > 48000 && chance(0.5)) await browse(H2.torch);
    await act("talk", H2.master);
    rv.face = 1;
    const opening = ["I challenge you to an insult sword fight!", "Is this Robot Island?", "Nice hat."];
    if (S.left > 52000 && chance(0.4)) {
      await chooseLine(opening, 2, 0, true);
      await say("rivet", opening[2]);
      await say("master", "It's a tricorn. It holds my cooling fan.");
    }
    await chooseLine(opening, 0, 0);
    await say("rivet", opening[0]);
    await say("master", "Very well. Draw your sword, and your best material.", 0.85);

    // ---- the duel ----
    const tug = document.createElement("div");
    tug.className = "gm-ri-tug";
    tug.innerHTML = `<span class="gm-ri-tn gm-ri-tr">Rivet <b>0</b></span><div class="gm-ri-track">${Array.from({ length: 7 }, () => "<i></i>").join("")}<em></em></div><span class="gm-ri-tn gm-ri-tm"><b>0</b> Mainframe</span>`;
    tug.style.top = `${Math.max(6, OY + 6)}px`;
    f.stage.appendChild(tug);
    const tugMark = tug.querySelector("em") as HTMLElement;
    const [tugR, tugM] = [...tug.querySelectorAll("b")] as HTMLElement[];
    const knownRet = new Set<number>();
    const knownIns = new Set<number>();
    const pRet = 0.04 + 0.62 * skill;
    PAIRS.forEach((_, i) => { if (chance(pRet)) knownRet.add(i); });
    const order = PAIRS.map((_, i) => i).sort(() => Math.random() - 0.5);
    order.slice(0, 2 + (skill > 0.55 ? 1 : 0)).forEach((i) => knownIns.add(i));
    // the Sword Master parries less often when the robot delivers its lines with confidence
    const masterP = 0.72 - 0.32 * skill;

    const showTug = (rw: number, mw: number) => {
      tugR.textContent = String(rw); tugM.textContent = String(mw);
      const net = clamp(rw - mw, -3, 3);
      scope.to(tugMark, { left: `${4.5 + (net + 3) * 11}px`, duration: 0.45, ease: "back.out(2)" });
      rv.tx = 150 + net * 14; ms.tx = 292 + net * 14;
      f.setScore(`Duel ${rw} : ${mw}`, true);
    };
    const clash = async (winner: "r" | "m") => {
      const key = winner;
      scope.timeline().to(lunge, { [key]: 1, duration: 0.14, ease: "power2.out" }).to(lunge, { [key]: 0, duration: 0.3, ease: "power2.inOut" });
      await nap(host, 150);
      if (!calm) {
        const sx = (rv.x + ms.x) / 2, sy = FOOT - 33;
        for (let i = 0; i < 12; i++) sparks.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 110, life: 0.3 + Math.random() * 0.35 });
      }
      await nap(host, 260);
    };

    const duel = async (): Promise<"win" | "lose" | "time"> => {
      let target = S.left > 42000 ? 3 : 2;
      let rw = 0, mw = 0;
      let attacker: "m" | "r" = "m";
      const usedM = new Set<number>(), usedR = new Set<number>();
      look.sword = true; look.mSword = true;
      duelling = true;
      panel.classList.add("gm-ri-talking");
      sentence("");
      rv.lock = true; ms.lock = true; rv.face = 1; ms.face = -1;
      rv.speed = 50;
      showTug(0, 0);
      await nap(host, 500);
      while (rw < target && mw < target) {
        if (S.left < 8500) return "time";
        if (S.left < 18000 && target > Math.max(rw, mw) + 1) {
          target = Math.max(rw, mw) + 1;
          await say("master", "Next hit wins. I have a ship to catch.", 0.8);
        }
        if (attacker === "m") {
          const pool = PAIRS.map((_, i) => i).filter((i) => !usedM.has(i));
          const i = pick(pool);
          usedM.add(i);
          await say("master", PAIRS[i].i);
          knownIns.add(i);
          const wrong = [...PAIRS.filter((_, k) => k !== i).map((p) => p.r).sort(() => Math.random() - 0.5).slice(0, 1), pick(DECOYS)];
          const lines = [PAIRS[i].r, ...wrong].sort(() => Math.random() - 0.5);
          host.react("focus");
          const knows = knownRet.has(i) && !chance(0.04);
          // not sure: a sharp robot at least rules out the obvious nonsense
          const sane = chance(0.5 * skill) ? lines.filter((l) => !DECOYS.includes(l)) : lines;
          const idx = knows ? lines.indexOf(PAIRS[i].r) : lines.indexOf(pick(sane));
          const said = await chooseLine(lines, idx, knows ? (chance(0.3) ? 1 : 0) : 1 + (chance(0.5) ? 1 : 0));
          await say("rivet", said);
          if (said === PAIRS[i].r) {
            rw++; showTug(rw, mw);
            await clash("r");
            if (chance(0.55)) await say("master", pick(OUCH), 0.8);
            if (chance(0.3)) host.react("laugh");
            attacker = "r";
          } else {
            mw++; showTug(rw, mw);
            await clash("m");
            await say("master", pick(GLOAT), 0.85);
            host.react(chance(0.5) ? "shy" : "angry");
            if (chance(0.3 + 0.4 * skill)) knownRet.add(i); // it will remember that one
            attacker = "m";
          }
        } else {
          const good = [...knownIns].filter((i) => !usedR.has(i)).sort(() => Math.random() - 0.5).slice(0, 3);
          const lame = LAME.slice().sort(() => Math.random() - 0.5).slice(0, Math.max(1, 3 - good.length));
          const lines = [...good.map((i) => PAIRS[i].i), ...lame].sort(() => Math.random() - 0.5);
          const goodIdx = lines.map((l, k) => [l, k] as const).filter(([l]) => !LAME.includes(l)).map(([, k]) => k);
          const idx = goodIdx.length && !chance(0.35 * (1 - skill)) ? pick(goodIdx) : Math.floor(Math.random() * lines.length);
          const said = await chooseLine(lines, idx, chance(0.5) ? 1 : 0);
          await say("rivet", said);
          const pi = PAIRS.findIndex((p) => p.i === said);
          if (pi < 0) {
            await say("master", pick(LAME_REPLY), 0.8);
            mw++; showTug(rw, mw);
            await clash("m");
            host.react("shy");
            attacker = "m";
          } else {
            usedR.add(pi);
            if (chance(masterP)) {
              await say("master", PAIRS[pi].r);
              knownRet.add(pi);
              mw++; showTug(rw, mw);
              await clash("m");
              attacker = "m";
            } else {
              await say("master", pick(STUMPED), 0.85);
              rw++; showTug(rw, mw);
              await clash("r");
              if (chance(0.4)) host.react("laugh");
              attacker = "r";
            }
          }
        }
        await nap(host, 200);
      }
      return rw >= target ? "win" : "lose";
    };

    // closing beats shrink to fit whatever time is left
    const tail = (ms: number) => nap(host, clamp(S.left - 250, 250, ms));
    let duels = 0;
    for (;;) {
      duels++;
      S.rounds = duels;
      const res = await duel();
      const score = Number(tugR.textContent);
      const theirs = Number(tugM.textContent);
      look.sword = false; look.mSword = false;
      duelling = false;
      panel.classList.remove("gm-ri-talking");
      reset();
      if (res === "win") {
        S.streak = 0;
        await say("master", "Enough! You fight like... like a real pirate.");
        host.react("cheer");
        await say("rivet", "I am now a mighty pirate. Probably.");
        f.setScore("Mighty pirate", true);
        f.showOver("A mighty pirate", `Probably. Duel won ${score} to ${theirs}`, "good");
        await tail(2600);
        return { result: "win", score: duels };
      }
      if (res === "time") {
        await say("master", "Look at the time. Same duel tomorrow?", 0.8);
        f.showOver("Duel postponed", `Stopped at ${score} to ${theirs}`, "plain");
        await tail(1400);
        return { result: "done", score: duels };
      }
      await say("master", "Come back when your vocabulary has more than eight bits.", 0.9);
      f.showOver("Out-insulted", `Mainframe wins ${theirs} to ${score}`, "bad");
      await tail(1300);
      const next = S.afterLoss(0.18);
      if (next === "ragequit") {
        host.react("angry");
        f.hideOver();
        await say("rivet", "This island has a terrible user interface!", 0.85);
        f.showOver("Rage quit", "Rivet stormed off the island", "bad");
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
      await say("rivet", "Rematch! I took notes.", 0.85);
      if (chance(0.5)) host.tap(".");
      await say("master", "Fine. En garde, again.", chance(0.5) ? 0.5 : 0.8);
    }
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
