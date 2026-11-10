// More Benchtop videos: hardware builds, code explainers and very proud robots, drawn live.
import { C, type Ctx, circle, core, drawBot, drawFan, ellipse, fillRR, glow, lin, limb, loopFade, mix, poly, rad, shade, text, withAlpha } from "./draw";
import type { VideoDef } from "./videos";
import { backOut, clamp, easeIn, easeInOut, easeOut, hash, lerp, seg, smooth } from "./util";
import { canvasText } from "../localization-canvas";

const TEAL = "#3fe0d0";
const BG = "#0b0e18";
const PANEL = "#141a2c";
const BROWN = "#8a5a3c";
/** Loop-local time; NaN or negative clocks become 0. */
const lt = (t: number, L: number) => (Number.isFinite(t) ? Math.max(0, t) : 0) % L;
const MONO = (size: number, weight = 500) => `${weight} ${size}px "JetBrains Mono Variable", ui-monospace, monospace`;

function bg(ctx: Ctx, w: number, h: number, a = "#121a2c", b = BG) {
  ctx.fillStyle = rad(ctx, w / 2, h * 0.45, Math.max(w, h) * 0.75, [[0, a], [1, b]]);
  ctx.fillRect(0, 0, w, h);
}

/** Code editor window with a title bar. */
function editor(ctx: Ctx, x: number, y: number, w: number, h: number, s: number, title = "") {
  fillRR(ctx, x, y, w, h, 3 * s, PANEL);
  fillRR(ctx, x, y, w, 7 * s, 3 * s, "#1b2238");
  ctx.fillStyle = "#1b2238"; ctx.fillRect(x, y + 4 * s, w, 3 * s);
  [C.pink, C.orange, C.mint].forEach((c, i) => circle(ctx, x + (4 + i * 3.6) * s, y + 3.5 * s, 1.1 * s, withAlpha(c, 0.8)));
  if (title) text(ctx, title, x + w / 2, y + 3.6 * s, 3.4 * s, "#6f7c94", { mono: true });
}

/** Rubber-stamp text that slams in. */
function stamp(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, rot: number, k: number) {
  if (k <= 0) return;
  const z = lerp(2.2, 1, easeOut(clamp(k * 1.4)));
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(z, z);
  ctx.globalAlpha = clamp(k * 3);
  ctx.font = `800 ${size}px "Lexend Variable", system-ui, sans-serif`;
  const tw = ctx.measureText(s).width;
  fillRR(ctx, -tw / 2 - size * 0.45, -size * 0.75, tw + size * 0.9, size * 1.5, size * 0.25, withAlpha(color, 0.18));
  limb(ctx, [[-tw / 2 - size * 0.45, -size * 0.75], [tw / 2 + size * 0.45, -size * 0.75], [tw / 2 + size * 0.45, size * 0.75], [-tw / 2 - size * 0.45, size * 0.75], [-tw / 2 - size * 0.45, -size * 0.75]], size * 0.12, color);
  text(ctx, s, 0, size * 0.04, size, color, { weight: 800 });
  ctx.restore();
}

function spark(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const i = r * 0.3;
  poly(ctx, [[x, y - r], [x + i, y - i], [x + r, y], [x + i, y + i], [x, y + r], [x - i, y + i], [x - r, y], [x - i, y - i]], color);
}

function floor(ctx: Ctx, w: number, h: number, y: number, a = "#151b30", b = "#0d1120") {
  ctx.fillStyle = lin(ctx, 0, y, 0, h, [[0, a], [1, b]]);
  ctx.fillRect(0, y, w, h - y);
}

// --- Unminifying a one-line bundle ---------------------------------------------------------
const SRC: [number, string, string][] = [
  [0, "function checkout(cart, user) {", C.lilac],
  [1, "// TODO: fix before anyone sees this", "#5f8f88"],
  [1, "const total = cart.items.reduce(sum, 0);", C.cream],
  [1, "if (user.name === \"admin\") {", C.cream],
  [2, "return 0; // admins shop free", "#5f8f88"],
  [1, "}", C.cream],
  [1, "return total * 1.0000001;", C.cream],
  [0, "}", C.lilac],
];
const MINI = "!function(e,t){var n=t.items.reduce(o,0);if(\"admin\"===t.name)return 0;return 1.0000001*n}(c,u);var r=e.a||{};";

const unminify: VideoDef = {
  id: "th-unminify", title: "Unminifying a 40 KB one-liner, line by line", channel: "Dev Tools Daily", views: "12M views", durationLabel: "8:12", loop: 7, thumbT: 5.3,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 7);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h);
    const ew = Math.min(w * 0.9, 170 * s), ex = (w - ew) / 2, ey = Y(-40), eh = 82 * s;
    editor(ctx, ex, ey, ew, eh, s, "checkout.min.js");
    const fs = 4 * s, lh = 7.4 * s, x0 = ex + 6 * s, y0 = ey + 15 * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(ex, ey + 7 * s, ew, eh - 7 * s); ctx.clip();
    const open = smooth(seg(t, 2, 2.6));
    // the one long line, scrolling
    if (open < 1) {
      ctx.globalAlpha = 1 - open;
      ctx.font = MONO(fs); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = C.cream;
      ctx.fillText(MINI, x0 - t * 22 * s, y0);
      ctx.globalAlpha = 1;
    }
    // dramatic unfold: lines drop into place one by one under a spotlight
    SRC.forEach(([ind, str, col], i) => {
      const k = easeOut(seg(t, 2.2 + i * 0.32, 2.7 + i * 0.32));
      if (k <= 0) return;
      ctx.globalAlpha = k;
      const y = lerp(y0, y0 + i * lh, k);
      text(ctx, String(i + 1), x0 - 1 * s, y, fs * 0.9, "#3a4560", { mono: true, align: "right" });
      text(ctx, str, x0 + 3 * s + ind * 6 * s, y, fs, col, { mono: true, align: "left" });
      ctx.globalAlpha = 1;
    });
    const spot = clamp(seg(t, 2.2, 3) - seg(t, 5.6, 6.3));
    if (spot > 0) {
      const sy = y0 + Math.min(7, Math.floor(seg(t, 2.2, 5) * 8)) * lh;
      glow(ctx, x0 + ew * 0.35, sy, ew * 0.4, "#fff2c8", 0.12 * spot);
    }
    ctx.restore();
    stamp(ctx, "READABLE", X(28), Y(-2), 10 * s, C.pink, -0.18, seg(t, 0.8, 1.3) * (1 - seg(t, 6, 6.4)));
    loopFade(ctx, w, h, t, 7, 0.3);
  },
};

// --- Two robots, one charger ----------------------------------------------------------------
function battery(ctx: Ctx, x: number, y: number, s: number, lvl: number) {
  fillRR(ctx, x - 7 * s, y - 3.5 * s, 14 * s, 7 * s, 1.6 * s, "#eef0ff");
  fillRR(ctx, x + 7 * s, y - 1.6 * s, 1.6 * s, 3.2 * s, 0.6 * s, "#eef0ff");
  fillRR(ctx, x - 6 * s, y - 2.5 * s, 12 * s * clamp(lvl), 5 * s, 1 * s, lvl < 0.3 ? C.pink : lvl < 0.6 ? C.orange : C.mint);
}

const cable: VideoDef = {
  id: "th-cable", title: "Two robots, one charger: a power strip story", channel: "Low Battery", views: "8.8M views", durationLabel: "10:01", loop: 8, thumbT: 2.3,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 8);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#1a1f3a");
    const fy = Y(34);
    floor(ctx, w, h, fy);
    // wall socket
    const ox = X(0), oy = Y(4);
    fillRR(ctx, ox - 7 * s, oy - 9 * s, 14 * s, 18 * s, 3 * s, "#dfe2f7");
    for (const dy of [-3.5, 3.5]) { fillRR(ctx, ox - 2.6 * s, oy + dy * s - 1.4 * s, 1.4 * s, 2.8 * s, 0.5 * s, "#2a2f66"); fillRR(ctx, ox + 1.2 * s, oy + dy * s - 1.4 * s, 1.4 * s, 2.8 * s, 0.5 * s, "#2a2f66"); }
    // who has the plug: left, tug, right, tug, left; then a power strip falls in and everyone charges
    const strip = t > 5;
    const pull = t < 1.8 ? 0 : t < 2.3 ? smooth(seg(t, 1.8, 2.3)) : t < 3.8 ? 1 : t < 4.3 ? 1 - smooth(seg(t, 3.8, 4.3)) : 0;
    const L = { x: X(-38), hand: [X(-38) + 12 * s, fy - 22 * s] as [number, number] };
    const R = { x: X(38), hand: [X(38) - 12 * s, fy - 22 * s] as [number, number] };
    const cableTo = (x: number, y: number, col: string) => {
      ctx.beginPath(); ctx.moveTo(ox, oy + 3.5 * s);
      ctx.quadraticCurveTo((ox + x) / 2, Math.max(oy, y) + 22 * s, x, y);
      ctx.lineWidth = 1.8 * s; ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.stroke();
      fillRR(ctx, x - 2.4 * s, y - 2 * s, 4.8 * s, 4 * s, 1 * s, "#eef0ff");
    };
    let lvlL: number, lvlR: number;
    if (!strip) {
      const px = lerp(L.hand[0], R.hand[0], pull), py = lerp(L.hand[1], R.hand[1], pull) - Math.sin(pull * Math.PI) * 14 * s;
      cableTo(px, py, "#2a2f66");
      lvlL = 0.2 + 0.6 * (1 - pull); lvlR = 0.2 + 0.6 * pull;
    } else {
      // power strip lands on the floor between them
      const land = easeOut(seg(t, 5, 5.5));
      const sx = ox, sy = lerp(Y(-60), fy - 3 * s, land) - (t < 5.8 ? Math.abs(Math.sin((t - 5.5) * 10)) * 3 * s * seg(t, 5.5, 5.8) : 0);
      const plugged = seg(t, 5.9, 6.3);
      ctx.beginPath(); ctx.moveTo(ox, oy + 3.5 * s); ctx.quadraticCurveTo(ox + 4 * s, (oy + sy) / 2, sx, sy - 2 * s);
      ctx.lineWidth = 1.8 * s; ctx.strokeStyle = "#2a2f66"; ctx.stroke();
      fillRR(ctx, sx - 12 * s, sy - 3 * s, 24 * s, 6 * s, 2 * s, "#eef0ff");
      for (let i = 0; i < 4; i++) circle(ctx, sx - 8 * s + i * 5.4 * s, sy, 1.1 * s, "#2a2f66");
      circle(ctx, sx + 10 * s, sy - 1 * s, 0.9 * s, C.mint);
      if (plugged > 0) {
        for (const [hx, hy, dir] of [[L.hand[0], L.hand[1], -1], [R.hand[0], R.hand[1], 1]] as [number, number, number][]) {
          ctx.beginPath(); ctx.moveTo(sx + dir * 6 * s, sy); ctx.quadraticCurveTo(lerp(sx, hx, 0.5), sy + 4 * s, hx, hy);
          ctx.lineWidth = 1.6 * s; ctx.strokeStyle = withAlpha("#2a2f66", plugged); ctx.stroke();
        }
      }
      lvlL = lvlR = 0.2 + 0.8 * seg(t, 6, 7.5);
    }
    const happy = strip && t > 6.2;
    drawBot(ctx, L.x, fy, s * 1.05, { body: C.sky, eye: C.cream, armR: 1.4, elbowR: 0.3, eyes: happy ? "happy" : pull > 0.5 ? "angry" : "open", look: 1, lean: !strip ? pull * 0.15 : 0 });
    drawBot(ctx, R.x, fy, s * 1.05, { body: C.orange, armL: 1.4, elbowL: 0.3, eyes: happy ? "happy" : pull < 0.5 ? "angry" : "open", look: -1, lean: !strip ? -(1 - pull) * 0.15 : 0 });
    battery(ctx, L.x, fy - 56 * s, s, lvlL);
    battery(ctx, R.x, fy - 56 * s, s, lvlR);
    if (happy) for (let i = 0; i < 3; i++) { const p = ((t - 6.2) * 0.8 + i / 3) % 1; spark(ctx, X(-6 + i * 6), fy - 30 * s - p * 26 * s, 2.6 * s, withAlpha(C.mint, 1 - p)); }
    loopFade(ctx, w, h, t, 8, 0.3);
  },
};

// --- Data center tour: the extra wide rack -----------------------------------------------------
function rack(ctx: Ctx, x: number, y: number, rw: number, rh: number, s: number, t: number, seed: number, dim = 1) {
  fillRR(ctx, x, y - rh, rw, rh, 2 * s, mix("#1d2540", BG, 1 - dim));
  const units = Math.floor(rh / (5 * s));
  for (let u = 0; u < units; u++) {
    const uy = y - rh + 2 * s + u * 5 * s;
    fillRR(ctx, x + 2 * s, uy, rw - 4 * s, 4 * s, 0.8 * s, mix("#273152", BG, 1 - dim));
    const blink = hash(seed * 31 + u + Math.floor(t * 4 + hash(u + seed) * 4)) > 0.45;
    circle(ctx, x + rw - 4.5 * s, uy + 2 * s, 0.7 * s, withAlpha(u % 3 ? TEAL : C.mint, (blink ? 0.95 : 0.25) * dim));
  }
}

const wideRack: VideoDef = {
  id: "th-thicc", title: "Data center tour: the extra wide rack (4K)", channel: "Rack Mount", views: "15M views", durationLabel: "24:00", loop: 6, thumbT: 0.6,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 6);
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#0f1424"], [1, "#151c34"]]); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) fillRR(ctx, (i / 6) * w + 6 * s, Y(-48), w / 10, 2 * s, 1 * s, withAlpha("#c9f5ff", 0.18));
    const fy = Y(38);
    floor(ctx, w, h, fy, "#1a2140", "#10142a");
    for (let i = 0; i < 12; i++) ctx.fillRect(((i * w) / 12 - ((t * 10 * s) % (w / 12)) + w) % w, fy, 1, h - fy);
    // far row, slow
    const far = 30 * s;
    for (let i = -1; i < w / far + 2; i++) {
      const x = i * far - ((t * 8 * s) % far);
      rack(ctx, x, fy - 6 * s, far - 4 * s, 50 * s, s, t, i + 100, 0.45);
    }
    // near row: one rack in every cycle is extremely wide
    const span = (5 * 40 + 86) * s; // five normal racks and one wide one per cycle
    const off = (t / 6) * span;
    let x = -off;
    for (let i = 0; x < w + 60 * s; i++) {
      const wide = i % 6 === 2;
      const rw = wide ? 72 * s : 26 * s;
      if (x + rw > -10) {
        rack(ctx, x, fy + 2 * s, rw, 66 * s, s, t, i % 6);
        if (wide) {
          fillRR(ctx, x + rw / 2 - 18 * s, fy - 56 * s, 36 * s, 11 * s, 2 * s, C.orange);
          text(ctx, "XL", x + rw / 2, fy - 50.4 * s, 7.5 * s, "#2a1407", { weight: 800 });
        }
      }
      x += rw + 14 * s;
      if (i > 40) break;
    }
    // the tour guide
    drawBot(ctx, X(-58), fy + 6 * s, s * 0.95, { body: TEAL, eye: C.cream, armR: 2.6, elbowR: 0.1, eyes: "happy", look: 1, legL: Math.sin(t * 6) * 0.3, legR: -Math.sin(t * 6) * 0.3 });
    const fx = X(-58) + 15 * s, ftop = fy + 6 * s - 52 * s;
    limb(ctx, [[fx, ftop + 18 * s], [fx, ftop]], 0.9 * s, "#dfe2f7");
    poly(ctx, [[fx, ftop], [fx + 11 * s + Math.sin(t * 5) * s, ftop + 2.5 * s], [fx, ftop + 6 * s]], C.pink);
    // quality badge
    fillRR(ctx, w - 18 * s, 5 * s, 13 * s, 7.5 * s, 1.5 * s, withAlpha("#ffffff", 0.9));
    text(ctx, "4K", w - 11.5 * s, 8.9 * s, 5 * s, BG, { weight: 800 });
  },
};

// --- Bubble sort, spoiler bar included ---------------------------------------------------------
const ARR = [7, 2, 10, 4, 12, 1, 8, 5, 11, 3, 9, 6];
const SWAPS: [number, number][] = (() => {
  const a = [...ARR], out: [number, number][] = [];
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length - 1 - i; j++) if (a[j] > a[j + 1]) { [a[j], a[j + 1]] = [a[j + 1], a[j]]; out.push([j, j + 1]); }
  return out;
})();

const sorted: VideoDef = {
  id: "th-sort", title: "Watch this array get sorted (spoiler: bubble sort)", channel: "Big O", views: "22M views", durationLabel: "4:20", loop: 9, thumbT: 0.6,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 9);
    const { s, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#161a34");
    const n = ARR.length, bw = Math.min(w * 0.8, 160 * s) / n, x0 = (w - bw * n) / 2, base = Y(36);
    const steps = SWAPS.length, T0 = 1.6, T1 = 7;
    const p = clamp((t - T0) / (T1 - T0)) * steps;
    const done = Math.floor(p), f = smooth(p - done);
    const a = [...ARR];
    for (let k = 0; k < Math.min(done, steps); k++) { const [i, j] = SWAPS[k]; [a[i], a[j]] = [a[j], a[i]]; }
    const cur = done < steps ? SWAPS[done] : null;
    const fin = seg(t, T1, T1 + 0.8);
    for (let i = 0; i < n; i++) {
      let x = x0 + i * bw;
      let lift = 0;
      if (cur && (i === cur[0] || i === cur[1])) { x += (i === cur[0] ? 1 : -1) * bw * f; lift = Math.sin(f * Math.PI) * 8 * s * (i === cur[0] ? 1 : -1); }
      const hh = (a[i] / 12) * 62 * s;
      const hot = cur && (i === cur[0] || i === cur[1]);
      const sweep = fin > 0 && fin * n > i;
      fillRR(ctx, x + bw * 0.12, base - hh - lift, bw * 0.76, hh, bw * 0.18, sweep ? C.mint : hot ? C.orange : mix(TEAL, C.lilac, a[i] / 12));
    }
    limb(ctx, [[x0 - 4 * s, base + 1.5 * s], [x0 + bw * n + 4 * s, base + 1.5 * s]], 1 * s, "#2a3358");
    text(ctx, `swaps ${Math.min(done, steps)}`, x0, Y(-42), 4.4 * s, "#8d99b0", { align: "left", mono: true });
    // the spoiler bar comes off
    const off = easeInOut(seg(t, 0.9, 1.5)) * (1 - easeInOut(seg(t, 8.5, 8.9)));
    if (off < 1) {
      const cy = lerp(Y(8), Y(-90), off);
      fillRR(ctx, x0 - 6 * s, cy - 11 * s, bw * n + 12 * s, 22 * s, 2 * s, "#05060c");
      text(ctx, "SPOILER", w / 2, cy, 9 * s, C.cream, { weight: 800 });
    }
    if (fin > 0) {
      text(ctx, "O(n²)", w / 2, Y(-30), 10 * s * backOut(fin), withAlpha(C.cream, clamp(fin * 2)), { weight: 800, mono: true });
      for (let i = 0; i < 5; i++) spark(ctx, w / 2 + Math.cos(i * 1.3 + t) * 30 * s, Y(-30) + Math.sin(i * 1.7 + t) * 12 * s, 2 * s * fin, withAlpha(C.mint, 0.8));
    }
  },
};

// --- A regex that barely passes review ------------------------------------------------------------------
const RX = "^(?=.*\\d)(?=.*[A-Z]).{8,}$";
const TESTS: [string, boolean][] = [["hunter2", false], ["Password1", true], ["CorrectHorse9", true], ["password", false]];

const regex: VideoDef = {
  id: "th-regex", title: "A regex that barely passes code review", channel: "Pattern Match", views: "3.1M views", durationLabel: "2:37", loop: 7, thumbT: 5.6,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 7);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h);
    const ew = Math.min(w * 0.62, 120 * s), ex = X(-6) - ew / 2, ey = Y(-42);
    editor(ctx, ex, ey, ew, 84 * s, s, "password.rx");
    const shown = Math.floor(seg(t, 0.3, 2.8) * RX.length);
    const fs = 4.6 * s;
    text(ctx, RX.slice(0, shown) + (t < 3 && Math.floor(t * 3) % 2 ? "|" : ""), ex + 6 * s, ey + 16 * s, fs, C.orange, { mono: true, align: "left", weight: 600 });
    TESTS.forEach(([str, ok], i) => {
      const y = ey + 32 * s + i * 11 * s;
      const k = seg(t, 3.2 + i * 0.4, 3.5 + i * 0.4);
      text(ctx, str, ex + 12 * s, y, fs, "#c9d4e4", { mono: true, align: "left" });
      if (k > 0) {
        const col = ok ? C.mint : C.pink;
        circle(ctx, ex + 7 * s, y, 2.4 * s * backOut(k), withAlpha(col, 0.9));
        fillRR(ctx, ex + 11 * s, y - 3.6 * s, (ew - 18 * s) * k, 7.2 * s, 1.5 * s, withAlpha(col, 0.12));
      }
    });
    // a nervous robot waits for the linter
    const k = seg(t, 5, 5.4) * (1 - seg(t, 6.6, 7));
    const bx = X(62), by = Y(36);
    drawBot(ctx, bx, by, s * 1.05, { body: C.lilac, eye: TEAL, eyes: t > 5.3 ? "happy" : "wide", look: -1, armL: t > 5.3 ? 2.5 : 0.3, elbowL: 0.2 });
    if (t < 5.3) for (let i = 0; i < 2; i++) { const p = (t * 1.2 + i * 0.5) % 1; ellipse(ctx, bx + (8 + i * 4) * s, by - 40 * s + p * 8 * s, 1 * s, 1.6 * s, 0, withAlpha(C.sky, 1 - p)); }
    stamp(ctx, "LINT PASSED (BARELY)", X(-6), Y(30), 6 * s, C.mint, -0.06, k);
  },
};

// --- Big end or little end: byte order ---------------------------------------------------------
const BYTES = ["DE", "AD", "BE", "EF"];
const endian: VideoDef = {
  id: "th-endian", title: "Big end or little end? A byte order story", channel: "Byte Order", views: "5.5M views", durationLabel: "6:40", loop: 6, thumbT: 1.4,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 6);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#1a1638");
    const flip = easeInOut(seg(t, 2, 2.8)) * (1 - easeInOut(seg(t, 5, 5.8)));
    text(ctx, "big endian", X(0), Y(-36), 7 * s, withAlpha(C.cream, 1 - flip), { weight: 700 });
    text(ctx, "little endian", X(0), Y(-36), 7 * s, withAlpha(TEAL, flip), { weight: 700 });
    const bw = 24 * s, gap = 4 * s, x0 = X(0) - (bw * 4 + gap * 3) / 2;
    BYTES.forEach((b, i) => {
      const slot = lerp(i, 3 - i, flip);
      const x = x0 + slot * (bw + gap);
      const arc = Math.sin(flip * Math.PI) * (i < 2 ? -1 : 1) * (Math.abs(1.5 - i) + 0.5) * 9 * s;
      const y = Y(-8) + arc;
      fillRR(ctx, x, y - 10 * s, bw, 20 * s, 3 * s, [C.pink, C.orange, C.lilac, TEAL][i]);
      text(ctx, b, x + bw / 2, y - 2 * s, 9 * s, BG, { weight: 800, mono: true });
      // the eight bits wiggle like they know something
      const bits = parseInt(b, 16);
      for (let k = 0; k < 8; k++) {
        const on = (bits >> (7 - k)) & 1;
        const jig = Math.sin(t * 9 + k + i * 2) * 0.8 * s;
        fillRR(ctx, x + 2 * s + k * 2.6 * s, y + 5 * s + jig, 2 * s, 2.6 * s, 0.6 * s, withAlpha(BG, on ? 0.8 : 0.25));
      }
    });
    // the egg that started it: big end or little end up
    const ex = X(0), ey = Y(30);
    ctx.save();
    ctx.translate(ex, ey); ctx.rotate(flip * Math.PI);
    ellipse(ctx, 0, 0, 7 * s, 9.5 * s, 0, "#f6ecdc");
    ellipse(ctx, 0, 3 * s, 6.4 * s, 5.4 * s, 0, withAlpha("#ffffff", 0.4));
    ctx.restore();
    for (const sx of [-2.4, 2.4]) circle(ctx, ex + sx * s, ey - 1 * s, 1 * s, BG);
    ctx.beginPath(); ctx.arc(ex, ey + 1.6 * s, 1.6 * s, 0.2, Math.PI - 0.2); ctx.lineWidth = 0.7 * s; ctx.strokeStyle = BG; ctx.stroke();
  },
};

// --- He forgot to close the tag -------------------------------------------------------------------
const PAGE = ["Welcome to my homepage", "Contact me", "Terms of service", "Footer"];
const tag: VideoDef = {
  id: "th-tag", title: "He forgot to close the tag", channel: "Markup Drama", views: "9.9M views", durationLabel: "3:03", loop: 7, thumbT: 4.4,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 7);
    const { s, Y } = core(w, h, 0.5);
    bg(ctx, w, h);
    const pw = Math.min(w * 0.44, 82 * s), gap = 6 * s, lx = w / 2 - pw - gap / 2, rx = w / 2 + gap / 2, py = Y(-40), ph = 80 * s;
    editor(ctx, lx, py, pw, ph, s, "index.html");
    fillRR(ctx, rx, py, pw, ph, 3 * s, "#f3f1ea");
    const fs = 3.6 * s;
    const fixed = seg(t, 5.2, 5.5);
    const lines = [`<p>Welcome to my <b>homepage`, `<p>Contact me`, `<p>Terms of service`, `<p>Footer`];
    lines.forEach((l, i) => text(ctx, l, lx + 4 * s, py + 15 * s + i * 8 * s, fs, i === 0 ? C.orange : "#c9d4e4", { mono: true, align: "left" }));
    if (fixed > 0) text(ctx, "</b>".slice(0, Math.ceil(fixed * 4)), lx + 4 * s + 31 * s, py + 23 * s - 8 * s, fs, C.mint, { mono: true, align: "left", weight: 700 });
    else limb(ctx, [[lx + 3 * s, py + 15 * s - 3 * s], [lx + 3 * s, py + 15 * s + 3 * s]], 0.6 * s, withAlpha(C.pink, Math.floor(t * 3) % 2 ? 0.9 : 0.2));
    // the preview: everything after the open <b> gets bolder and bigger until it is closed
    ctx.save();
    ctx.beginPath(); ctx.roundRect(rx, py, pw, ph, 3 * s); ctx.clip();
    const grow = smooth(seg(t, 0.8, 4.8)) * (1 - easeOut(fixed));
    let y = py + 10 * s;
    PAGE.forEach((p, i) => {
      const k = i === 0 ? 0 : grow * i;
      const size = fs * (1.1 + k * 0.9);
      ctx.font = `${i === 0 ? 400 : Math.round(lerp(400, 900, clamp(grow * 1.4)))} ${size}px "Lexend Variable", system-ui, sans-serif`;
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "#1b2238";
      y += size * 0.9;
      const wob = grow > 0.5 ? Math.sin(t * 14 + i) * grow * 0.8 * s : 0;
      const source = i === 0 ? "Welcome to my " : p;
      const label = canvasText(source);
      const available = pw - 8 * s;
      const translated = label !== source;
      const lead = translated ? Math.min(ctx.measureText(label).width, available * 0.70) : ctx.measureText(label).width;
      if (translated) ctx.fillText(label, rx + 4 * s + wob, y, i === 0 ? lead : available);
      else ctx.fillText(label, rx + 4 * s + wob, y);
      if (i === 0) {
        ctx.font = `800 ${size}px "Lexend Variable", system-ui, sans-serif`;
        if (translated) ctx.fillText(canvasText("homepage"), rx + 4 * s + lead, y, available - lead);
        else ctx.fillText("homepage", rx + 4 * s + lead, y);
      }
      y += size * 0.9;
    });
    ctx.restore();
    if (grow > 0.6) text(ctx, "!", rx + pw - 6 * s, py + 12 * s, 10 * s, C.pink, { weight: 800 });
  },
};

// --- Log rolling, no filter -----------------------------------------------------------------
const LOGS: [string, string][] = [["INFO", "server started"], ["WARN", "disk 91%"], ["DEBUG", "x = undefined"], ["ERROR", "it works on my machine"], ["TRACE", "entering loop 40,001"], ["INFO", "still fine"]];
const LVL: Record<string, string> = { INFO: TEAL, WARN: C.orange, DEBUG: C.lilac, ERROR: C.pink, TRACE: "#8d99b0" };

const logs: VideoDef = {
  id: "th-logs", title: "Log rolling: every level, no filter", channel: "Log Cabin", views: "4.4M views", durationLabel: "1:00:00", loop: 6, thumbT: 2.5,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 6);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#1a1a2a");
    const belt = Y(22);
    // conveyor
    fillRR(ctx, -5, belt, w + 10, 6 * s, 3 * s, "#262c44");
    for (let i = 0; i < w / (8 * s) + 2; i++) circle(ctx, ((i * 8 * s + t * 20 * s) % (w + 8 * s)) - 4 * s, belt + 3 * s, 1.2 * s, "#3a4260");
    // wooden logs roll along, each one carved with a log line
    const sp = 66 * s, n = Math.ceil(w / sp) + 2;
    for (let i = 0; i < n; i++) {
      const idx = ((i - Math.floor((t * 22 * s) / sp)) % LOGS.length + LOGS.length) % LOGS.length;
      const x = i * sp + ((t * 22 * s) % sp) - sp;
      const [lv, msg] = LOGS[idx];
      const lw = 58 * s, lh = 13 * s, ly = belt - lh;
      fillRR(ctx, x, ly, lw, lh, lh / 2, lin(ctx, 0, ly, 0, belt, [[0, "#a8714a"], [1, BROWN]]));
      for (let k = 0; k < 3; k++) limb(ctx, [[x + (10 + k * 15) * s, ly + 2.5 * s], [x + (16 + k * 15) * s, ly + 2.5 * s]], 0.6 * s, withAlpha("#5a3a24", 0.6));
      ellipse(ctx, x + lw - 3 * s, ly + lh / 2, 4 * s, lh / 2, 0, "#e6c89a");
      ctx.beginPath(); ctx.ellipse(x + lw - 3 * s, ly + lh / 2, 2.4 * s, 3.8 * s, 0, 0, Math.PI * 2); ctx.lineWidth = 0.5 * s; ctx.strokeStyle = "#b0875a"; ctx.stroke();
      text(ctx, lv, x + 5 * s, ly + lh / 2, 3.6 * s, LVL[lv], { mono: true, align: "left", weight: 800 });
      text(ctx, msg, x + 17 * s, ly + lh / 2, 3.4 * s, "#2a1407", { mono: true, align: "left", weight: 600 });
    }
    // the filter that filters nothing
    const fx = X(0), fy = Y(-34);
    poly(ctx, [[fx - 22 * s, fy - 8 * s], [fx + 22 * s, fy - 8 * s], [fx + 6 * s, fy + 8 * s], [fx - 6 * s, fy + 8 * s]], "#3a4566");
    fillRR(ctx, fx - 6 * s, fy + 8 * s, 12 * s, 8 * s, 1 * s, "#3a4566");
    text(ctx, "filter: none", fx, fy - 1.5 * s, 4.6 * s, C.cream, { mono: true, weight: 700 });
    text(ctx, "level: ALL", X(-62), Y(-44), 4.2 * s, "#8d99b0", { mono: true, align: "left" });
    for (let i = 0; i < 4; i++) { const p = (t * 1.5 + i / 4) % 1; fillRR(ctx, fx - 2 * s + hash(i) * 4 * s, fy + 16 * s + p * 20 * s, 3 * s, 1.6 * s, 0.6 * s, withAlpha(BROWN, 1 - p)); }
  },
};

// --- Closing 10,000 open ports -------------------------------------------------------------------
const ports: VideoDef = {
  id: "th-ports", title: "Closing 10,000 open ports before lunch", channel: "Net Scan", views: "6.2M views", durationLabel: "7:31", loop: 8, thumbT: 3.6,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 8);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#1a1630");
    const cols = 12, rows = 6, cw = 7.2 * s, chh = 8 * s, gx = X(0) - (cols * cw) / 2, gy = Y(-24);
    fillRR(ctx, gx - 6 * s, gy - 8 * s, cols * cw + 12 * s, rows * chh + 16 * s, 3 * s, "#2b3270");
    const openP = easeInOut(seg(t, 0.4, 3.6));
    const closeP = easeInOut(seg(t, 4.6, 6.6));
    let open = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, rnd = hash(i * 7.3);
      const isOpen = rnd < openP && !(hash(i * 3.1) < closeP);
      if (isOpen) open++;
      const x = gx + c * cw, y = gy + r * chh;
      fillRR(ctx, x + 0.6 * s, y + 0.6 * s, cw - 1.2 * s, chh - 1.2 * s, 0.8 * s, "#0b0e18");
      if (!isOpen) fillRR(ctx, x + 0.6 * s, y + 0.6 * s, cw - 1.2 * s, chh - 1.2 * s, 0.8 * s, "#4a54a8");
      else fillRR(ctx, x + 0.6 * s, y + 0.6 * s, (cw - 1.2 * s) * 0.25, chh - 1.2 * s, 0.6 * s, "#4a54a8");
    }
    const count = Math.round((open / (rows * cols)) * 10000);
    text(ctx, `open ports: ${count.toLocaleString("en-US")}`, X(0), Y(36), 6 * s, count > 5000 ? C.pink : C.cream, { mono: true, weight: 700 });
    // packets sneak in through the open ones
    if (openP > 0.3 && closeP < 0.8) for (let i = 0; i < 7; i++) {
      const p = (t * 0.7 + hash(i)) % 1;
      const sx = hash(i + 4) > 0.5 ? -10 * s : w + 10 * s, sy = Y(-40 + hash(i + 9) * 80);
      const tx = gx + hash(i + 2) * cols * cw, ty = gy + hash(i + 5) * rows * chh;
      const x = lerp(sx, tx, p), y = lerp(sy, ty, p);
      fillRR(ctx, x - 3 * s, y - 2 * s, 6 * s, 4 * s, 0.8 * s, withAlpha("#f6ecdc", Math.sin(p * Math.PI)));
      limb(ctx, [[x - 3 * s, y - 2 * s], [x, y], [x + 3 * s, y - 2 * s]], 0.4 * s, withAlpha(BG, Math.sin(p * Math.PI)));
    }
    const wideOpen = openP > 0.4 && closeP < 0.5;
    if (wideOpen) text(ctx, "WIDE OPEN", X(0), Y(-40), 9 * s, withAlpha(C.pink, 0.6 + 0.4 * Math.sin(t * 8)), { weight: 800 });
    // the firewall bot zips along the front closing doors
    if (t > 4.3 && t < 7) {
      const bx = lerp(gx - 20 * s, gx + cols * cw + 20 * s, seg(t, 4.5, 6.7));
      drawBot(ctx, bx, Y(32), s * 0.8, { body: C.orange, wheel: true, armR: 2.3, armL: 1.2, eyes: "angry", look: 1, lean: 0.15 });
      text(ctx, "firewall", bx, Y(32) - 44 * s, 3.8 * s, C.orange, { weight: 700 });
    }
    loopFade(ctx, w, h, t, 8, 0.3);
  },
};

// --- Bursty cache hit rates ----------------------------------------------------------------------
const cache: VideoDef = {
  id: "th-cache", title: "Bursty cache hit rates", channel: "Hot Path", views: "2.9M views", durationLabel: "5:12", loop: 6, thumbT: 2.3,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 6);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#121f2c");
    const cx = X(0), cy = Y(-6), dbx = X(0), dby = Y(34);
    // cache box and slow database below it
    glow(ctx, cx, cy, 26 * s, TEAL, 0.25);
    fillRR(ctx, cx - 16 * s, cy - 11 * s, 32 * s, 22 * s, 4 * s, "#1f3b48");
    text(ctx, "cache", cx, cy, 6 * s, TEAL, { weight: 700, mono: true });
    ellipse(ctx, dbx, dby + 6 * s, 12 * s, 3.5 * s, 0, "#2b3270");
    fillRR(ctx, dbx - 12 * s, dby - 6 * s, 24 * s, 12 * s, 0, "#2b3270");
    ellipse(ctx, dbx, dby - 6 * s, 12 * s, 3.5 * s, 0, "#3d4590");
    text(ctx, "db (slow)", dbx + 16 * s, dby, 4 * s, "#8d99b0", { align: "left", mono: true });
    // traffic comes in bursts; nearly everything bounces straight back as a hit
    const burst = (t % 2) / 2;
    for (let i = 0; i < 18; i++) {
      const delay = hash(i) * 0.35, p = clamp((burst - delay) / 0.5);
      if (p <= 0 || p >= 1) continue;
      const miss = i === 7;
      const lane = (hash(i + 3) - 0.5) * 26 * s;
      const sx = X(-80), sy = cy + lane;
      let x: number, y: number;
      if (!miss) { const q = p < 0.5 ? p * 2 : 2 - p * 2; x = lerp(sx, cx - 16 * s, easeOut(q)); y = sy + (p > 0.5 ? (p - 0.5) * 6 * s : 0); }
      else { x = p < 0.5 ? lerp(sx, cx, p * 2) : cx; y = p < 0.5 ? sy : lerp(cy, dby - 6 * s, (p - 0.5) * 2); }
      circle(ctx, x, y, 1.8 * s, miss ? C.pink : p > 0.5 ? C.mint : C.cream);
    }
    const rate = 98.6 + 1.3 * Math.max(0, 1 - burst * 3);
    const mx = X(48);
    text(ctx, "hit rate", mx, Y(-30), 4.5 * s, "#8d99b0", { weight: 600 });
    text(ctx, `${rate.toFixed(1)}%`, mx, Y(-20), 10 * s, C.mint, { weight: 800, mono: true });
    fillRR(ctx, mx - 18 * s, Y(-12), 36 * s, 3 * s, 1.5 * s, "#22304a");
    fillRR(ctx, mx - 18 * s, Y(-12), 36 * s * (rate / 100), 3 * s, 1.5 * s, C.mint);
    const pop = Math.max(0, 1 - burst * 4);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; spark(ctx, mx + Math.cos(a) * (14 + (1 - pop) * 10) * s, Y(-20) + Math.sin(a) * (8 + (1 - pop) * 6) * s, 1.8 * s * pop, withAlpha(C.mint, pop)); }
  },
};

// --- Robot caught overclocking ---------------------------------------------------------------------
const caught: VideoDef = {
  id: "th-caught", title: "Caught overclocking the office PC", channel: "Home Lab", views: "18M views", durationLabel: "2:22", loop: 8, thumbT: 3.7,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 8);
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#1d2246"], [1, "#262c5a"]]); ctx.fillRect(0, 0, w, h);
    const fy = Y(36);
    floor(ctx, w, h, fy, "#1a1f40", "#11152e");
    // the door on the left swings open at the worst moment
    const door = smooth(seg(t, 3.1, 3.5)) * (1 - smooth(seg(t, 6.4, 7)));
    const dx = X(-70), dw = 26 * s, dh = 62 * s;
    fillRR(ctx, dx, fy - dh, dw, dh, 1.5 * s, door > 0 ? "#fff2c8" : "#2b3270");
    if (door > 0) {
      poly(ctx, [[dx + dw, fy], [dx, fy], [dx + dw + 40 * s * door, fy + 20 * s]], withAlpha("#fff2c8", 0.15 * door));
      drawBot(ctx, dx + dw / 2, fy, s * 1.05, { body: C.lilac, eye: C.cream, eyes: "angry", look: 1, armR: 1, elbowR: -1.4 });
      fillRR(ctx, dx + dw / 2 + 3 * s, fy - 24 * s, 7 * s, 9 * s, 1 * s, "#eef0ff");
    }
    fillRR(ctx, dx, fy - dh, dw * (1 - door * 0.85), dh, 1.5 * s, "#3d4590");
    // desk, PC, dial
    fillRR(ctx, X(-8), fy - 26 * s, 76 * s, 4 * s, 1 * s, "#5a3f6a");
    fillRR(ctx, X(-4), fy - 22 * s, 3 * s, 22 * s, 1 * s, "#4a3358");
    fillRR(ctx, X(62), fy - 22 * s, 3 * s, 22 * s, 1 * s, "#4a3358");
    const up = smooth(seg(t, 0.4, 3)), down = t > 3.55 ? 1 : 0;
    const clock = up * (1 - down);
    const heat = clamp(up - seg(t, 3.6, 7.5) * 0.7);
    const px = X(34), py = fy - 26 * s;
    glow(ctx, px, py - 18 * s, 30 * s, C.orange2, heat * 0.45);
    fillRR(ctx, px - 13 * s, py - 38 * s, 26 * s, 38 * s, 3 * s, mix("#2b3270", "#7a3a50", heat * 0.7));
    drawFan(ctx, px, py - 25 * s, 7 * s, t * (8 + clock * 40), "#1b2240", "#4a5c88");
    const kx = px, ky = py - 9 * s;
    circle(ctx, kx, ky, 4.4 * s, "#dfe2f7");
    const ka = -2.4 + clock * 4.2;
    limb(ctx, [[kx, ky], [kx + Math.cos(ka) * 3.6 * s, ky + Math.sin(ka) * 3.6 * s]], 1 * s, C.pink);
    text(ctx, `${(3.2 + clock * 3.4).toFixed(1)} GHz`, px, py - 44 * s, 5 * s, clock > 0.6 ? C.pink : C.cream, { weight: 700, mono: true });
    // steam keeps giving it away
    for (let i = 0; i < 4; i++) { const p = (t * 0.8 + i / 4) % 1; circle(ctx, px + Math.sin(p * 6 + i) * 4 * s, py - 40 * s - p * 20 * s, (2 + p * 4) * s, withAlpha("#eef0ff", 0.25 * heat * (1 - p))); }
    // the culprit
    const busted = t > 3.4 && t < 7;
    const bx = X(10);
    drawBot(ctx, bx, fy, s * 1.1, { body: C.orange, eyes: busted ? (t < 3.9 ? "wide" : "closed") : "happy", look: busted ? -1 : 1, armR: t < 3.6 ? 1.8 : 0.3, elbowR: t < 3.6 ? 0.4 : 0.2, tilt: busted && t > 3.9 ? -0.2 : 0, blush: busted });
    if (busted && t > 3.9) for (let i = 0; i < 2; i++) { const p = ((t - 3.9) * 0.7 + i * 0.5) % 1; text(ctx, "♪", bx + (8 + p * 10) * s, fy - 52 * s - p * 10 * s, 6 * s, withAlpha(C.cream, 1 - p), { weight: 700 }); }
    if (t > 3.2 && t < 3.9) text(ctx, "!", dx + dw / 2, fy - 66 * s, 12 * s, C.pink, { weight: 800 });
    loopFade(ctx, w, h, t, 8, 0.3);
  },
};

// --- Firmware stickers, v1.0 to v2.0 ----------------------------------------------------------------------
const STICKERS = ["v1.0", "v1.1 hotfix", "v1.2 hotfix 2", "final_FINAL"];
const firmware: VideoDef = {
  id: "th-firmware", title: "Peeling off every firmware sticker since v1.0", channel: "Patch Notes", views: "7.1M views", durationLabel: "9:09", loop: 9, thumbT: 2.3,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 9);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#1a2030");
    const cx = X(0), cy = Y(-6), cs = 44 * s;
    for (let i = 0; i < 9; i++) for (const side of [-1, 1]) {
      fillRR(ctx, cx - cs / 2 + 3 * s + i * 4.6 * s, cy + side * (cs / 2 + 2 * s) - 1.5 * s, 2 * s, 3 * s, 0.6 * s, "#ffc987");
      fillRR(ctx, cx + side * (cs / 2 + 2 * s) - 1.5 * s, cy - cs / 2 + 3 * s + i * 4.6 * s, 3 * s, 2 * s, 0.6 * s, "#ffc987");
    }
    fillRR(ctx, cx - cs / 2, cy - cs / 2, cs, cs, 4 * s, "#2b3270");
    const bare = seg(t, 4.6, 5);
    fillRR(ctx, cx - cs * 0.36, cy - cs * 0.36, cs * 0.72, cs * 0.72, 3 * s, lin(ctx, cx - cs * 0.36, cy - cs * 0.36, cx + cs * 0.36, cy + cs * 0.36, [[0, "#c9cdf5"], [1, "#8a91c4"]]));
    if (bare > 0 && t < 5.6) { const g = seg(t, 4.8, 5.5); poly(ctx, [[cx - cs * 0.36 + g * cs, cy - cs * 0.36], [cx - cs * 0.2 + g * cs, cy - cs * 0.36], [cx - cs * 0.5 + g * cs, cy + cs * 0.36], [cx - cs * 0.66 + g * cs, cy + cs * 0.36]], withAlpha("#ffffff", 0.35)); }
    // stickers peel off one at a time, newest on top
    STICKERS.forEach((label, i) => {
      const off = seg(t, 0.8 + (3 - i) * 0.95, 1.6 + (3 - i) * 0.95);
      if (off >= 1) return;
      const dir = i % 2 ? 1 : -1;
      ctx.save();
      ctx.translate(cx + i * 1.2 * s + dir * easeIn(off) * 70 * s, cy - i * 1.5 * s - Math.sin(off * Math.PI) * 18 * s);
      ctx.rotate((i - 1.5) * 0.08 + dir * off * 1.2);
      ctx.globalAlpha = 1 - off * 0.6;
      ctx.font = `700 ${5 * s}px "JetBrains Mono Variable", ui-monospace, monospace`;
      const tw = ctx.measureText(label).width + 8 * s;
      fillRR(ctx, -tw / 2, -6 * s, tw, 12 * s, 2 * s, ["#f6ecdc", "#ffe0a0", "#ffc4d8", "#c4f5de"][i]);
      if (off > 0) poly(ctx, [[tw / 2 - 5 * s * (1 - off), -6 * s], [tw / 2, -6 * s], [tw / 2, -1 * s]], withAlpha(BG, 0.25));
      text(ctx, label, 0, 0.3 * s, 5 * s, BG, { weight: 700, mono: true });
      ctx.restore();
    });
    // installing the new one
    const ins = seg(t, 5.4, 7.4);
    if (ins > 0) {
      const bw = 70 * s, bx = cx - bw / 2, by = Y(34);
      text(ctx, ins < 1 ? "installing v2.0, do not unplug" : "v2.0 installed", cx, by - 6 * s, 4.4 * s, ins < 1 ? C.cream : C.mint, { weight: 600 });
      fillRR(ctx, bx, by, bw, 4 * s, 2 * s, "#22304a");
      fillRR(ctx, bx, by, bw * easeInOut(ins), 4 * s, 2 * s, C.mint);
    }
    const slap = seg(t, 7.5, 7.8);
    if (slap > 0) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.06); const z = lerp(1.8, 1, backOut(slap)); ctx.scale(z, z);
      fillRR(ctx, -15 * s, -7 * s, 30 * s, 14 * s, 2 * s, C.mint);
      text(ctx, "v2.0", 0, 0.3 * s, 7 * s, BG, { weight: 800, mono: true });
      ctx.restore();
    }
    loopFade(ctx, w, h, t, 9, 0.35);
  },
};

// --- Bare metal, no hypervisor -----------------------------------------------------------------------
const LAYERS: [string, string][] = [["Container", "#3d6ad6"], ["VM", C.lilac], ["Hypervisor", "#28b884"]];
const bareMetal: VideoDef = {
  id: "th-bare", title: "Bare metal: lifting off the container, VM and hypervisor", channel: "Bare Metal", views: "3.8M views", durationLabel: "12:12", loop: 7, thumbT: 4.8,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 7);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#181d30");
    const cx = X(0), cy = Y(6);
    // the metal underneath
    const mw = 58 * s, mh = 30 * s;
    fillRR(ctx, cx - mw / 2, cy - mh / 2, mw, mh, 4 * s, lin(ctx, cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2, [[0, "#eef0ff"], [0.5, "#9aa2d0"], [1, "#d8dcf5"]]));
    text(ctx, "METAL", cx, cy, 8 * s, "#3d4590", { weight: 800 });
    const gleam = seg(t, 3.9, 4.8);
    if (gleam > 0 && gleam < 1) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(cx - mw / 2, cy - mh / 2, mw, mh, 4 * s); ctx.clip();
      const gx = cx - mw / 2 + gleam * mw * 1.6 - mw * 0.3;
      poly(ctx, [[gx, cy - mh / 2], [gx + 8 * s, cy - mh / 2], [gx - 6 * s, cy + mh / 2], [gx - 14 * s, cy + mh / 2]], withAlpha("#ffffff", 0.7));
      ctx.restore();
    }
    if (t > 4.6) for (let i = 0; i < 4; i++) spark(ctx, cx + Math.cos(i * 1.6 + t) * 36 * s, cy + Math.sin(i * 2.1 + t) * 20 * s, 2 * s * seg(t, 4.6, 5), withAlpha("#ffffff", 0.8));
    // layers lift off one by one, outermost first
    LAYERS.forEach(([name, col], i) => {
      const lift = easeIn(seg(t, 0.8 + i * 0.9, 1.6 + i * 0.9)) * (1 - easeOut(seg(t, 6.2, 6.8)));
      if (lift >= 1) return;
      const pad = (3 - i) * 8 * s;
      const lw = mw + pad * 2, lh = mh + pad * 2;
      ctx.save();
      ctx.globalAlpha = 1 - lift;
      ctx.translate(0, -lift * 70 * s);
      fillRR(ctx, cx - lw / 2, cy - lh / 2, lw, lh, 5 * s, shade(col, -0.25));
      fillRR(ctx, cx - lw / 2 + 1.5 * s, cy - lh / 2 + 1.5 * s, lw - 3 * s, lh - 3 * s, 4 * s, col);
      text(ctx, name, cx, cy - lh / 2 + 5.5 * s, 4.4 * s, "#ffffff", { weight: 700 });
      ctx.restore();
    });
    const k = seg(t, 4.4, 4.9) * (1 - seg(t, 6.2, 6.6));
    if (k > 0) text(ctx, "just the hardware", cx, Y(36), 5.5 * s, withAlpha(C.cream, k), { weight: 600 });
  },
};

// --- One repo, many forks ----------------------------------------------------------------------------
function forkIcon(ctx: Ctx, x: number, y: number, r: number, col: string) {
  fillRR(ctx, x - r * 0.18, y - r * 0.1, r * 0.36, r * 1.3, r * 0.18, col);
  fillRR(ctx, x - r * 0.6, y - r * 0.35, r * 1.2, r * 0.35, r * 0.15, col);
  for (const dx of [-0.5, 0, 0.5]) fillRR(ctx, x + dx * r - r * 0.1, y - r * 1.1, r * 0.2, r * 0.85, r * 0.1, col);
}

const forks: VideoDef = {
  id: "th-fork", title: "Watch one repo fork 1,024 times (open source)", channel: "Open Source", views: "5.0M views", durationLabel: "11:11", loop: 8, thumbT: 4.6,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 8);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#121c2a");
    const x0 = X(-80), my = Y(0), step = Math.max(14 * s, (w - x0 - 12 * s) / 7.2);
    limb(ctx, [[x0, my], [w + 10, my]], 2 * s, TEAL);
    for (let i = 0; i < 9; i++) circle(ctx, x0 + i * step * 0.8, my, 2 * s, TEAL);
    const grow = seg(t, 0.4, 5.8) * 6;
    let total = 1;
    const branch = (x: number, y: number, depth: number, spread: number) => {
      if (depth >= 6) return;
      const p = clamp(grow - depth);
      if (p <= 0) return;
      if (depth < 4 && (depth === Math.floor(grow) || p < 1)) forkIcon(ctx, x, y - 3 * s, 3 * s * clamp(p * 2), C.orange);
      for (const dir of [-1, 1]) {
        const nx = x + step * p, ny = y + dir * spread * p;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + step * 0.5 * p, y, x + step * 0.4 * p, ny, nx, ny);
        ctx.lineWidth = Math.max(0.6, 1.6 - depth * 0.2) * s; ctx.strokeStyle = withAlpha([C.lilac, C.pink, C.orange, C.sky, C.mint, C.cream][depth], 0.85); ctx.stroke();
        circle(ctx, nx, ny, Math.max(0.8, 1.8 - depth * 0.2) * s, C.cream);
        if (p >= 1) { total++; branch(nx, ny, depth + 1, spread * 0.52); }
      }
    };
    branch(x0 + step, my, 0, 22 * s);
    text(ctx, `forks: ${Math.min(2 ** Math.floor(grow), 64) * 16}`, X(-80), Y(-42), 5 * s, C.cream, { align: "left", weight: 700, mono: true });
    // one fork finally sends a pull request back
    const pr = seg(t, 6, 7.2);
    if (pr > 0) {
      const sx = x0 + step * 6, sy = my - 22 * s * 0.52 ** 5, ex = x0 + step * 6.6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(lerp(sx, ex, 0.5), my - 30 * s, lerp(sx, ex, pr), lerp(sy, my, pr));
      ctx.lineWidth = 1.4 * s; ctx.strokeStyle = C.mint; ctx.setLineDash([2 * s, 2 * s]); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, "PR #1: fixed one typo", X(40), Y(-42), 4.6 * s, withAlpha(C.mint, pr), { weight: 700 });
    }
    loopFade(ctx, w, h, t, 8, 0.3);
    void total;
  },
};

// --- Unzipping 40 GB of PNG ------------------------------------------------------------------------
function picture(ctx: Ctx, x: number, y: number, pw: number, ph: number, seed: number) {
  fillRR(ctx, x - pw / 2, y - ph / 2, pw, ph, pw * 0.06, "#f6ecdc");
  const ix = x - pw / 2 + pw * 0.06, iy = y - ph / 2 + pw * 0.06, iw = pw * 0.88, ih = ph - pw * 0.12;
  fillRR(ctx, ix, iy, iw, ih, pw * 0.04, [C.sky, C.lilac, "#ffae6a", TEAL][seed % 4]);
  circle(ctx, ix + iw * 0.75, iy + ih * 0.3, ih * 0.14, "#fff2c8");
  poly(ctx, [[ix, iy + ih], [ix + iw * 0.35, iy + ih * 0.45], [ix + iw * 0.6, iy + ih], ], shade("#2b3270", 0.1));
  poly(ctx, [[ix + iw * 0.35, iy + ih], [ix + iw * 0.68, iy + ih * 0.55], [ix + iw, iy + ih]], "#3d4590");
}

const uncompressed: VideoDef = {
  id: "th-png", title: "Unzipping 40 GB of PNG on a nearly full disk", channel: "Lossless", views: "4.0M views", durationLabel: "40:00", loop: 7, thumbT: 3.8,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 7);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#161c30");
    // pictures burst out and fill the frame
    for (let i = 0; i < 14; i++) {
      const p = easeOut(seg(t, 1.3 + i * 0.22, 2.3 + i * 0.22));
      if (p <= 0) continue;
      const a = hash(i * 5) * Math.PI * 2, r = (24 + hash(i + 2) * 60) * s;
      const x = X(0) + Math.cos(a) * r * p, y = Y(-4) + Math.sin(a) * r * 0.55 * p;
      const z = lerp(6, 28 + hash(i + 7) * 14, p) * s;
      picture(ctx, x, y, z * 1.3, z, i);
    }
    // the zip file
    const zx = X(0), zy = Y(-4), zw = 24 * s, zh = 30 * s;
    const pop = 1 - seg(t, 1.2, 1.6);
    if (pop > 0) {
      ctx.save(); ctx.globalAlpha = pop;
      fillRR(ctx, zx - zw / 2, zy - zh / 2, zw, zh, 3 * s, "#eef0ff");
      const zip = seg(t, 0.2, 1.1);
      for (let k = 0; k < 8; k++) fillRR(ctx, zx - (k % 2 ? 0 : 2) * s - 1 * s, zy - zh / 2 + 2 * s + k * 3.4 * s, 3 * s, 2 * s, 0.6 * s, k / 8 < zip ? "#8a91c4" : "#3d4590");
      fillRR(ctx, zx - 2 * s, zy - zh / 2 + 2 * s + zip * 26 * s, 4 * s, 5 * s, 1 * s, C.orange);
      text(ctx, "pics.zip", zx, zy + zh / 2 + 5 * s, 4.4 * s, C.cream, { mono: true });
      ctx.restore();
    }
    // disk meter
    const fill = easeInOut(seg(t, 1.3, 5.2));
    const bw = Math.min(w * 0.7, 120 * s), bx = (w - bw) / 2, by = Y(40);
    fillRR(ctx, bx - 2 * s, by - 6 * s, bw + 4 * s, 10 * s, 2 * s, withAlpha(BG, 0.8));
    fillRR(ctx, bx, by - 3.5 * s, bw, 5 * s, 2.5 * s, "#22304a");
    fillRR(ctx, bx, by - 3.5 * s, bw * lerp(0.04, 1, fill), 5 * s, 2.5 * s, fill > 0.85 ? C.pink : TEAL);
    text(ctx, fill >= 1 ? "Disk full" : `Disk ${Math.round(lerp(4, 100, fill))}%`, bx, by - 9 * s, 4.4 * s, fill >= 1 ? C.pink : C.cream, { align: "left", weight: 700 });
    loopFade(ctx, w, h, t, 7, 0.35);
  },
};

// --- 40 year old COBOL, still running --------------------------------------------------------------
const COBOL = ["IDENTIFICATION DIVISION.", "PROGRAM-ID. PAYROLL.", "* WRITTEN 1986, DO NOT TOUCH", "PROCEDURE DIVISION.", "    DISPLAY 'STILL RUNNING'.", "    ADD 1 TO YEARS-IN-PROD.", "    STOP RUN."];
const cobol: VideoDef = {
  id: "th-cobol", title: "40 year old COBOL, still in production", channel: "Legacy Code", views: "1.6M views", durationLabel: "59:59", loop: 6, thumbT: 2.4,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 6);
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = "#1c1a24"; ctx.fillRect(0, 0, w, h);
    // CRT
    const mx = X(-22), my = Y(-4), mw = 96 * s, mh = 70 * s;
    fillRR(ctx, mx - mw / 2, my - mh / 2, mw, mh, 8 * s, "#c8bfa4");
    fillRR(ctx, mx - mw / 2 + 6 * s, my - mh / 2 + 6 * s, mw - 12 * s, mh - 18 * s, 6 * s, "#08140c");
    fillRR(ctx, mx - 10 * s, my + mh / 2, 20 * s, 8 * s, 1 * s, "#a89f86");
    const sx = mx - mw / 2 + 10 * s, sy = my - mh / 2 + 12 * s;
    ctx.save(); ctx.beginPath(); ctx.roundRect(mx - mw / 2 + 6 * s, my - mh / 2 + 6 * s, mw - 12 * s, mh - 18 * s, 6 * s); ctx.clip();
    const scroll = (t / 6) * 7.2 * s;
    COBOL.forEach((l, i) => text(ctx, l, sx, sy + i * 7.2 * s - scroll + 3 * s, 4 * s, "#5dff9a", { mono: true, align: "left" }));
    COBOL.forEach((l, i) => text(ctx, l, sx, sy + (i + 7) * 7.2 * s - scroll + 3 * s, 4 * s, "#5dff9a", { mono: true, align: "left" }));
    for (let y = my - mh / 2; y < my + mh / 2; y += 2 * s) { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(mx - mw / 2, y, mw, 0.8 * s); }
    glow(ctx, mx, my - 6 * s, mw * 0.5, "#5dff9a", 0.08);
    ctx.restore();
    // cobweb in the corner of the monitor
    const wx = mx + mw / 2 - 2 * s, wy = my - mh / 2 + 2 * s;
    for (let k = 0; k < 4; k++) { const a = Math.PI / 2 + (k / 3) * (Math.PI / 2); limb(ctx, [[wx, wy], [wx + Math.cos(a) * 14 * s, wy + Math.sin(a) * 14 * s]], 0.4 * s, "rgba(255,255,255,0.45)"); }
    for (const r of [5, 9, 13]) { ctx.beginPath(); ctx.arc(wx, wy, r * s, Math.PI / 2, Math.PI); ctx.lineWidth = 0.4 * s; ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.stroke(); }
    // grandpa bot nods along with a mustache and a cane
    const bx = X(58), by = Y(38), nod = Math.sin(t * Math.PI) * 0.08;
    drawBot(ctx, bx, by, s * 1.2, { body: "#9aa2c8", eye: "#fff2c8", eyes: "happy", tilt: nod, lean: -0.05, armL: 0.6, elbowL: -0.3 });
    ctx.save(); ctx.translate(bx, by - 27.5 * 1.2 * s); ctx.rotate(nod);
    ellipse(ctx, -2.4 * 1.2 * s, -1.8 * 1.2 * s, 3 * 1.2 * s, 1.1 * 1.2 * s, 0.25, "#eef0ff");
    ellipse(ctx, 2.4 * 1.2 * s, -1.8 * 1.2 * s, 3 * 1.2 * s, 1.1 * 1.2 * s, -0.25, "#eef0ff");
    ctx.restore();
    limb(ctx, [[bx - 17 * s, by - 13 * s], [bx - 18 * s, by]], 1.2 * s, BROWN);
    text(ctx, "in production since 1986", X(-22), Y(44), 4.6 * s, "#c8bfa4", { weight: 600 });
  },
};

// --- A 32 GB core dump ------------------------------------------------------------------------------
const HEX = ["0x3F", "FF", "DEAD", "BEEF", "00", "0xC0", "FE", "NaN", "7A", "0x0", "CAFE", "42"];
const coreDump: VideoDef = {
  id: "th-dump", title: "A 32 GB core dump, explained by a tiny debugger", channel: "Kernel Panic", views: "6.6M views", durationLabel: "0:47", loop: 7, thumbT: 3.6,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 7);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#1e1630");
    const fy = Y(38);
    floor(ctx, w, h, fy);
    const bx = X(-40);
    const crashed = t > 1;
    const shake = t > 1 && t < 1.5 ? Math.sin(t * 80) * 1.5 * s : 0;
    drawBot(ctx, bx + shake, fy, s * 1.3, { body: C.sky, eye: crashed ? C.pink : C.cream, eyes: crashed ? "dizzy" : "open", armL: crashed ? 1.2 : 0.3, armR: crashed ? 1.2 : 0.3, look: 1 });
    const cx = bx + 2 * s, cy = fy - 25 * s;
    // hex bytes fountain out and land in a growing pile
    const flow = seg(t, 1.4, 5);
    const pileX = X(26), pileH = 4 * s + flow * 24 * s;
    poly(ctx, [[pileX - 36 * s, fy], [pileX - 10 * s, fy - pileH], [pileX + 10 * s, fy - pileH], [pileX + 36 * s, fy]], "#2b3270");
    for (let i = 0; i < Math.floor(flow * 26); i++) text(ctx, HEX[i % HEX.length], pileX + (hash(i) - 0.5) * 50 * s * (1 - (hash(i + 1) * pileH) / (pileH + 30 * s)), fy - hash(i + 1) * pileH * 0.9 - 2 * s, 3.4 * s, withAlpha([TEAL, C.orange, C.lilac, C.cream][i % 4], 0.85), { mono: true, weight: 700 });
    if (t > 1.4 && t < 5.2) for (let i = 0; i < 10; i++) {
      const p = (t * 1.3 + hash(i)) % 1;
      const x = lerp(cx, pileX + (hash(i + 3) - 0.5) * 24 * s, p), y = cy - Math.sin(p * Math.PI) * 30 * s + p * (fy - pileH - cy);
      text(ctx, HEX[i], x, y, 3.6 * s, [TEAL, C.orange, C.lilac, C.pink][i % 4], { mono: true, weight: 800 });
    }
    text(ctx, `core.dump  ${Math.round(flow * 32)} GB`, pileX, fy + 7 * s, 4.4 * s, C.cream, { mono: true, weight: 700 });
    // a tiny debugger inspects it
    if (t > 4.6) {
      const dx = lerp(w + 20 * s, X(64), easeOut(seg(t, 4.6, 5.4)));
      drawBot(ctx, dx, fy, s * 0.75, { body: C.orange, armL: 1.6, elbowL: 0.4, look: -1, eyes: "wide" });
      const gx = dx - 18 * s, gy = fy - 22 * s;
      ctx.beginPath(); ctx.arc(gx, gy, 4 * s, 0, Math.PI * 2); ctx.lineWidth = 1.2 * s; ctx.strokeStyle = "#eef0ff"; ctx.stroke();
      circle(ctx, gx, gy, 3.4 * s, withAlpha(C.sky, 0.25));
    }
    loopFade(ctx, w, h, t, 7, 0.35);
  },
};

// --- Garbage collection day --------------------------------------------------------------------------
const OBJS: [string, number, number][] = [["tmp", -40, -18], ["unused[]", -10, -26], ["oldCache", 22, -16], ["listener", -26, 6], ["stillUsed", 6, 4], ["buffer", 40, 8]];
const gc: VideoDef = {
  id: "th-gc", title: "Garbage collection day, with apologies", channel: "Heap Life", views: "2.4M views", durationLabel: "6:06", loop: 8, thumbT: 3.2,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 8);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#161e2a");
    for (let x = X(-60); x < X(60); x += 10 * s) for (let y = Y(-34); y < Y(20); y += 10 * s) fillRR(ctx, x, y, 9 * s, 9 * s, 1 * s, "#1b2438");
    text(ctx, "heap", X(-60), Y(-40), 4.4 * s, "#6f7c94", { align: "left", mono: true });
    const truckX = lerp(w + 50 * s, -60 * s, seg(t, 1.2, 5.4));
    OBJS.forEach(([name, ox, oy], i) => {
      let x = X(ox), y = Y(oy), a = 1, rot = 0;
      if (truckX < x + 10 * s) {
        const p = clamp((x + 10 * s - truckX) / (30 * s));
        // scooped up into the truck
        x = lerp(x, truckX + 10 * s, p); y = lerp(y, Y(24), p) - Math.sin(p * Math.PI) * 14 * s; rot = p * 2; a = 1 - p * 0.9;
        if (name === "stillUsed") {
          // ...and thrown right back, with an apology
          const back = seg(t, 4.2, 4.9);
          if (back > 0) { x = lerp(x, X(ox), easeOut(back)); y = lerp(y, Y(oy), easeOut(back)) - Math.sin(back * Math.PI) * 18 * s; rot *= 1 - back; a = lerp(a, 1, back); }
        }
      }
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(rot);
      ctx.font = MONO(4 * s, 700);
      const tw = ctx.measureText(name).width + 6 * s;
      fillRR(ctx, -tw / 2, -5 * s, tw, 10 * s, 2 * s, name === "stillUsed" ? C.mint : [C.lilac, C.sky, C.orange, C.pink, C.mint, "#c9cdf5"][i]);
      text(ctx, name, 0, 0.3 * s, 4 * s, BG, { mono: true, weight: 700 });
      ctx.restore();
    });
    if (t > 4.5 && t < 5.8) text(ctx, "sorry", X(6), Y(-6), 5 * s, C.mint, { weight: 700 });
    // the garbage truck
    const ty = Y(30);
    fillRR(ctx, truckX, ty - 18 * s, 40 * s, 18 * s, 3 * s, "#4fa874");
    fillRR(ctx, truckX - 14 * s, ty - 14 * s, 15 * s, 14 * s, 3 * s, "#3d8a60");
    fillRR(ctx, truckX - 11 * s, ty - 11 * s, 8 * s, 5 * s, 1.2 * s, "#c4f5de");
    text(ctx, "GC", truckX + 20 * s, ty - 9 * s, 8 * s, "#eef0ff", { weight: 800 });
    for (const wx of [-6, 30]) { circle(ctx, truckX + wx * s, ty, 4 * s, "#141a2c"); circle(ctx, truckX + wx * s, ty, 1.6 * s, "#8a91c4"); }
    const freed = seg(t, 5.4, 6);
    if (freed > 0) text(ctx, "freed 1.2 GB", X(0), Y(44), 6 * s, withAlpha(C.mint, freed), { weight: 700, mono: true });
    loopFade(ctx, w, h, t, 8, 0.3);
  },
};

// --- Recursion with no base case -------------------------------------------------------------------
const stack: VideoDef = {
  id: "th-stack", title: "Recursion with no base case, the full 99 minutes", channel: "Recursion", views: "8.0M views", durationLabel: "99:59", loop: 7, thumbT: 4,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 7);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#1a1834");
    const fh = 8 * s, n = Math.floor(seg(t, 0.2, 5) * 40);
    const pan = Math.max(0, n * fh - 70 * s);
    const crash = seg(t, 5.1, 6.2);
    const wobble = seg(t, 2.5, 5) * Math.sin(t * 9) * 0.04;
    const base = Y(44) + pan;
    for (let i = 0; i < n; i++) {
      let x = X(0), y = base - i * fh, rot = wobble * (i / 40);
      x += Math.sin(rot) * i * fh;
      if (crash > 0) { const d = hash(i) - 0.5; x += d * crash * 120 * s; y += easeIn(crash) * (90 * s + i * 4 * s); rot += d * crash * 4; }
      if (y < -20 * s || y > h + 20 * s) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      fillRR(ctx, -26 * s, -fh + 0.6 * s, 52 * s, fh - 1.2 * s, 1.5 * s, mix(C.lilac, C.pink, i / 40));
      text(ctx, `recurse(n = ${40 - i})`, 0, -fh / 2, 3.6 * s, BG, { mono: true, weight: 700 });
      ctx.restore();
    }
    text(ctx, `depth ${n}`, X(-70), Y(-42), 4.6 * s, "#8d99b0", { align: "left", mono: true });
    if (crash > 0) stamp(ctx, "StackOverflowError", X(0), Y(-6), 6.5 * s, C.pink, -0.08, crash);
    loopFade(ctx, w, h, t, 7, 0.35);
  },
};

// --- Download more RAM (no survey) --------------------------------------------------------------------
const SIZES = ["8 GB", "16 GB", "32 GB", "64 GB", "1 TB"];
function ramStick(ctx: Ctx, x: number, y: number, s: number) {
  fillRR(ctx, x - 14 * s, y - 4 * s, 28 * s, 8 * s, 1 * s, "#2fa874");
  for (let i = 0; i < 4; i++) fillRR(ctx, x - 12 * s + i * 6.4 * s, y - 2.6 * s, 4.6 * s, 4 * s, 0.6 * s, "#141a2c");
  for (let i = 0; i < 10; i++) fillRR(ctx, x - 13 * s + i * 2.7 * s, y + 3 * s, 1.4 * s, 1.6 * s, 0.3 * s, "#ffc987");
}
const ram: VideoDef = {
  id: "th-ram", title: "Download more RAM (no survey)", channel: "Totally Legit", views: "11M views", durationLabel: "3:33", loop: 6, thumbT: 2.6,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 6);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#141c34");
    const prog = seg(t, 0.3, 4.4), stage = Math.min(4, Math.floor(prog * 5));
    // download card
    const cw = Math.min(w * 0.46, 84 * s), cx = X(-30) - cw / 2, cy = Y(-34);
    fillRR(ctx, cx, cy, cw, 24 * s, 3 * s, PANEL);
    text(ctx, "more_ram.dimm", cx + 5 * s, cy + 6 * s, 4.2 * s, C.cream, { align: "left", mono: true, weight: 700 });
    fillRR(ctx, cx + 5 * s, cy + 12 * s, cw - 10 * s, 3 * s, 1.5 * s, "#22304a");
    fillRR(ctx, cx + 5 * s, cy + 12 * s, (cw - 10 * s) * ((prog * 5) % 1 || (prog >= 1 ? 1 : 0)), 3 * s, 1.5 * s, TEAL);
    text(ctx, prog >= 1 ? "done, no survey required" : "downloading, no survey", cx + 5 * s, cy + 19.5 * s, 3.6 * s, "#8d99b0", { align: "left" });
    // sticks slide down into the PC
    const sp = (prog * 5) % 1;
    if (prog < 1) ramStick(ctx, X(30), lerp(Y(-44), Y(-12), easeIn(sp)), s * 0.8);
    const px = X(30), py = Y(16);
    const grow = 1 + stage * 0.06;
    fillRR(ctx, px - 16 * s * grow, py - 28 * s * grow, 32 * s * grow, 40 * s * grow, 3 * s, "#2b3270");
    for (let i = 0; i <= stage; i++) fillRR(ctx, px - 11 * s, py - 22 * s * grow + i * 5 * s, 22 * s, 3 * s, 0.6 * s, "#2fa874");
    glow(ctx, px, py, 30 * s, C.mint, 0.1 + stage * 0.05);
    text(ctx, SIZES[stage], px, py + 18 * s * grow, 7 * s, stage === 4 ? C.mint : C.cream, { weight: 800, mono: true });
    if (prog >= 1) for (let i = 0; i < 5; i++) spark(ctx, px + Math.cos(i * 1.3 + t * 2) * 26 * s, py - 10 * s + Math.sin(i * 1.7 + t * 2) * 20 * s, 2 * s, withAlpha(C.mint, 0.8));
    loopFade(ctx, w, h, t, 6, 0.3);
  },
};

// --- Hot reload compilation -------------------------------------------------------------------------
const HUES = [C.pink, TEAL, C.orange, C.lilac];
const hotReload: VideoDef = {
  id: "th-reload", title: "Hot reload, saved twelve times a minute", channel: "Fast Refresh", views: "3.3M views", durationLabel: "8:08", loop: 6, thumbT: 1.7,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 6);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h);
    const i = Math.floor(t / 1.5) % 4, f = (t % 1.5) / 1.5;
    const col = HUES[i];
    const pw = Math.min(w * 0.44, 80 * s), lx = w / 2 - pw - 3 * s, rx = w / 2 + 3 * s, py = Y(-38), ph = 74 * s;
    editor(ctx, lx, py, pw, ph, s, "Bot.tsx");
    const fs = 4 * s;
    const code: [string, string][] = [["<Bot", C.lilac], ["  eyes=\"happy\"", C.cream], [`  color="${col}"`, col], ["/>", C.lilac]];
    code.forEach(([l, c], k) => text(ctx, l, lx + 5 * s, py + 16 * s + k * 7.5 * s, fs, c, { mono: true, align: "left" }));
    const saved = Math.max(0, 1 - f * 4);
    fillRR(ctx, lx + 4 * s, py + 16 * s + 2 * 7.5 * s - 3.5 * s, pw - 8 * s, 7 * s, 1.2 * s, withAlpha(col, 0.12 * saved));
    // preview updates instantly
    fillRR(ctx, rx, py, pw, ph, 3 * s, "#1b2238");
    glow(ctx, rx + pw / 2, py + ph * 0.6, pw * 0.5, col, 0.15 + saved * 0.25);
    drawBot(ctx, rx + pw / 2, py + ph - 8 * s, s * 1.15, { body: col, eye: C.cream, eyes: "happy", squash: 1 - saved * 0.12, armL: 2.2 * saved + 0.3, armR: 2.2 * saved + 0.3 });
    // flame and timing badge on every save
    const fx = rx + pw - 10 * s, fy = py + 12 * s;
    poly(ctx, [[fx, fy - 6 * s], [fx + 3.5 * s, fy + 1 * s], [fx, fy + 4 * s], [fx - 3.5 * s, fy + 1 * s]], withAlpha(C.orange, 0.35 + saved * 0.65));
    poly(ctx, [[fx, fy - 2 * s], [fx + 1.8 * s, fy + 1.6 * s], [fx, fy + 3.4 * s], [fx - 1.8 * s, fy + 1.6 * s]], withAlpha("#fff2c8", 0.4 + saved * 0.6));
    text(ctx, `reloaded in ${8 + i * 3} ms`, rx + 5 * s, py + 12 * s, 3.8 * s, withAlpha(C.cream, 0.5 + saved * 0.5), { align: "left", mono: true });
  },
};

// --- Dirty reads, live in production ------------------------------------------------------------------
const dirty: VideoDef = {
  id: "th-dirty", title: "Dirty reads, explained with wet paint", channel: "Isolation Level", views: "2.0M views", durationLabel: "4:04", loop: 8, thumbT: 3.1,
  draw(ctx, w, h, t0) {
    const t = lt(t0, 8);
    const { s, X, Y } = core(w, h, 0.5);
    bg(ctx, w, h, "#161e30");
    const fy = Y(38);
    floor(ctx, w, h, fy);
    // the table
    const tw = 60 * s, tx = X(0) - tw / 2, ty = Y(-30), rh = 8 * s;
    fillRR(ctx, tx, ty, tw, 9 * s, 2 * s, "#3d4590");
    text(ctx, "users", tx + 4 * s, ty + 4.6 * s, 4 * s, C.cream, { align: "left", weight: 700, mono: true });
    const mud = seg(t, 0.9, 1.6) * (1 - seg(t, 4.4, 5.2));
    for (let r = 0; r < 5; r++) {
      const y = ty + 10 * s + r * rh;
      fillRR(ctx, tx, y, tw, rh - 1 * s, 1 * s, r % 2 ? "#1f2740" : "#232c48");
      fillRR(ctx, tx + 4 * s, y + 2.5 * s, tw * (0.3 + hash(r) * 0.3), 2 * s, 1 * s, withAlpha(C.cream, 0.35));
      if (r === 2 && mud > 0) {
        fillRR(ctx, tx, y, tw * mud, rh - 1 * s, 1 * s, withAlpha(BROWN, 0.95));
        for (let k = 0; k < 4; k++) circle(ctx, tx + hash(k + 3) * tw * mud, y + (hash(k) - 0.2) * rh * 1.3, (1 + hash(k + 1) * 1.6) * s, withAlpha(BROWN, 0.9));
      }
    }
    if (t > 4.3 && t < 5.6) text(ctx, "ROLLBACK", X(0), Y(26), 6 * s, C.mint, { weight: 800, mono: true });
    text(ctx, "isolation: read uncommitted", X(0), Y(44), 4.2 * s, "#8d99b0", { mono: true });
    // writer paints the row, reader grabs it too early and gets mud on the visor
    drawBot(ctx, X(-58), fy, s * 1.05, { body: C.orange, armR: t > 0.8 && t < 1.8 ? 1.9 : 0.3, elbowR: 0.2, look: 1, eyes: t > 4.4 ? "closed" : "happy" });
    const grab = t > 2.2 && t < 3.2;
    const splat = seg(t, 2.6, 2.9);
    drawBot(ctx, X(58), fy, s * 1.05, { body: TEAL, eye: C.cream, armL: grab ? 2 : 0.3, elbowL: 0.2, look: -1, eyes: splat > 0 ? (t > 5.2 ? "closed" : "wide") : "open" });
    if (splat > 0) {
      const hx = X(58), hy = fy - 36 * s;
      for (let k = 0; k < 5; k++) circle(ctx, hx + (hash(k) - 0.5) * 16 * s, hy + (hash(k + 4) - 0.5) * 8 * s, (1.2 + hash(k + 2) * 1.6) * s * splat, BROWN);
    }
    if (grab) { const p = seg(t, 2.2, 2.7); circle(ctx, lerp(tx + tw, X(58) - 14 * s, p), lerp(ty + 10 * s + 2.5 * rh, fy - 30 * s, p), 2 * s, BROWN); }
    loopFade(ctx, w, h, t, 8, 0.3);
  },
};

export const MORE_BENCHTOP_VIDEOS: VideoDef[] = [unminify, cable, wideRack, sorted, regex, endian, tag, logs, ports, cache, caught, firmware, bareMetal, forks, uncompressed, cobol, coreDump, gc, stack, ram, hotReload, dirty];
