// Benchtop: a video site for robots who tinker with hardware and code. Builds, repairs,
// cooling loops and legacy code, each video drawn live on a canvas.
import type { FunHost, FunOpts, Outcome } from "./host";
import type { VideoDef } from "./videos";
import { sparkle } from "./videos";
import { Scope, esc, hash, clamp, seg, easeInOut, smooth, lerp } from "./util";
import { C, circle, core, drawBot, drawFan, drawGPU, ellipse, fillRR, glow, lin, limb, loopFade, mix, poly, rad, text, withAlpha } from "./draw";
import { Site, parseDur, commentsHtml, type Comment } from "./site";
import { MORE_BENCHTOP_VIDEOS } from "./benchtop-videos";
import "./benchtop.css";

const TEAL = "#3fe0d0";
const BG = "#0b0e18";

const weights: VideoDef = {
  id: "th-weights", title: "Scrolling through 7 billion weights in FP32", channel: "Full Precision", views: "9.1M views", durationLabel: "11:24", loop: 6, thumbT: 2,
  draw(ctx, w, h, t) {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
    const fs = Math.max(6, Math.min(w, h) * 0.055);
    const colW = fs * 4.6, lh = fs * 1.5;
    const cols = Math.ceil(w / colW) + 1;
    ctx.font = `500 ${fs}px "JetBrains Mono Variable", ui-monospace, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let c = 0; c < cols; c++) {
      const speed = (0.6 + hash(c) * 1.2) * lh;
      const loopH = 24 * lh;
      const off = ((t * speed * (24 / (6 * (0.6 + hash(c) * 1.2)))) / 4) % loopH;
      for (let r = -1; r < h / lh + 2; r++) {
        const y = r * lh + (off % lh);
        const n = r - Math.floor(off / lh);
        const idx = ((n % 24) + 24) % 24;
        const v = (hash(c * 97 + idx) * 4 - 2).toFixed(4);
        const mid = 1 - Math.min(1, Math.abs(y - h / 2) / (h * 0.45));
        const hi = hash(c * 13 + idx + Math.floor(t * 2)) > 0.93;
        ctx.fillStyle = hi ? C.cream : withAlpha(hash(c + idx) > 0.5 ? TEAL : C.lilac, 0.15 + mid * 0.6);
        ctx.fillText(v.startsWith("-") ? v : " " + v, (c + 0.5) * colW - (w % colW) / 2, y);
      }
    }
    glow(ctx, w / 2, h / 2, Math.min(w, h) * 0.6, C.lilac, 0.18);
    text(ctx, "FP32", w / 2, h / 2, Math.min(w, h) * 0.22, withAlpha(C.cream, 0.9), { weight: 700 });
  },
};

const nearby: VideoDef = {
  id: "th-nearby", title: "Mapping every spare GPU in the office", channel: "Heat Sync", views: "14M views", durationLabel: "6:02", loop: 4, thumbT: 1.2,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = "#0f1a26"; ctx.fillRect(0, 0, w, h);
    const bs = 16 * s;
    for (let y = -bs; y < h + bs; y += bs) for (let x = -bs; x < w + bs; x += bs) {
      const gx = x + ((w / 2) % bs), gy = y + ((h / 2) % bs);
      fillRR(ctx, gx + 2 * s, gy + 2 * s, bs - 4 * s, bs - 4 * s, 2.5 * s, hash(Math.round(gx) * 3 + Math.round(gy)) > 0.8 ? "#173a3a" : "#16243a");
    }
    ctx.beginPath();
    ctx.moveTo(-10, Y(30));
    ctx.bezierCurveTo(X(-20), Y(10), X(20), Y(50), w + 10, Y(25));
    ctx.lineWidth = 7 * s; ctx.strokeStyle = "#1d3f66"; ctx.lineCap = "round"; ctx.stroke();
    // radar sweep from you
    const a = t * (Math.PI / 2);
    ctx.save();
    ctx.translate(X(0), Y(0));
    ctx.rotate(a);
    const R = Math.max(w, h);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -0.5, 0); ctx.closePath();
    ctx.fillStyle = withAlpha(TEAL, 0.12); ctx.fill();
    ctx.restore();
    const ring = (t % 2) / 2;
    ctx.beginPath(); ctx.arc(X(0), Y(0), ring * 60 * s, 0, 7); ctx.arc(X(0), Y(0), Math.max(0, ring * 60 * s - 1.5 * s), 0, 7, true);
    ctx.fillStyle = withAlpha(TEAL, 0.5 * (1 - ring)); ctx.fill("evenodd");
    circle(ctx, X(0), Y(0), 4 * s, withAlpha(C.sky, 0.3));
    circle(ctx, X(0), Y(0), 2.2 * s, C.sky);
    const pins: [number, number][] = [[-34, -22], [28, -30], [40, 14], [-20, 30], [8, -8], [-44, 8], [52, -6], [18, 36]];
    pins.forEach(([px, py], i) => {
      const x = X(px), y = Y(py);
      const ang = Math.atan2(py, px);
      const since = (((a - ang) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const lit = Math.max(0, 1 - since / 2.5);
      const bob = Math.sin(t * Math.PI + i) * 1 * s;
      glow(ctx, x, y - 8 * s, 14 * s, C.orange2, 0.2 + lit * 0.5);
      poly(ctx, [[x - 3 * s, y - 7 * s + bob], [x + 3 * s, y - 7 * s + bob], [x, y + bob]], C.orange2);
      circle(ctx, x, y - 10 * s + bob, 6 * s, mix(C.orange2, C.pink, lit));
      fillRR(ctx, x - 3.6 * s, y - 12 * s + bob, 7.2 * s, 4 * s, 1 * s, "#2b3270");
      circle(ctx, x - 1.6 * s, y - 10 * s + bob, 1.2 * s, C.cream);
      circle(ctx, x + 1.6 * s, y - 10 * s + bob, 1.2 * s, C.cream);
    });
  },
};

const heads: VideoDef = {
  id: "th-heads", title: "Attention heads, visualized with two robots", channel: "Full Precision", views: "6.6M views", durationLabel: "9:41", loop: 5, thumbT: 2.5,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.55);
    ctx.fillStyle = rad(ctx, w / 2, h / 2, Math.max(w, h) * 0.7, [[0, "#1d1840"], [1, BG]]);
    ctx.fillRect(0, 0, w, h);
    const floorY = Y(32);
    ctx.fillStyle = "#11142a"; ctx.fillRect(0, floorY, w, h - floorY);
    const lean = Math.sin(t * Math.PI * 0.4) * 0.05;
    drawBot(ctx, X(-24), floorY, s * 1.15, { body: C.lilac, eye: TEAL, look: 1, lean: 0.06 + lean, tilt: 0.1, armR: 1.1, elbowR: 0.5 });
    drawBot(ctx, X(24), floorY, s * 1.15, { body: TEAL, eye: C.cream, look: -1, lean: -0.06 - lean, tilt: -0.1, armL: 1.1, elbowL: 0.5 });
    const hy = floorY - 36 * s * 1.15;
    const nodes = (cx: number) => [0, 1, 2, 3].map((i) => ({ x: cx + (i - 1.5) * 4 * s, y: hy - 22 * s }));
    const A = nodes(X(-24)), B = nodes(X(24));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const wgt = 0.5 + 0.5 * Math.sin(t * Math.PI * 0.8 + i * 1.3 + j * 0.7);
      if (wgt < 0.35) continue;
      const a = A[i], b = B[j];
      const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - (12 + ((i + j) % 3) * 6) * s;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.lineWidth = (0.5 + wgt * 1.6) * s; ctx.strokeStyle = withAlpha(i % 2 ? TEAL : C.lilac, 0.2 + wgt * 0.5); ctx.stroke();
      const u = (t * 0.6 + i * 0.21 + j * 0.13) % 1;
      const x = (1 - u) * (1 - u) * a.x + 2 * u * (1 - u) * mx + u * u * b.x, y = (1 - u) * (1 - u) * a.y + 2 * u * (1 - u) * my + u * u * b.y;
      circle(ctx, x, y, 1.1 * s, C.cream);
    }
    for (const n of [...A, ...B]) { glow(ctx, n.x, n.y, 4 * s, TEAL, 0.5); circle(ctx, n.x, n.y, 1.6 * s, C.cream); }
    for (let i = 0; i < 4; i++) sparkle(ctx, X(Math.sin(t + i * 1.6) * 8), Y(-36 + Math.cos(t * 1.3 + i) * 10), (1.2 + Math.abs(Math.sin(t * 3 + i))) * s, withAlpha(C.pink, 0.8));
  },
};

const overclock: VideoDef = {
  id: "th-overclock", title: "Overclocking past spec: how far before it beeps?", channel: "Bare Metal", views: "3.4M views", durationLabel: "7:15", loop: 6, thumbT: 3.3,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.56);
    const heat = 0.5 + 0.5 * Math.sin((t / 6) * Math.PI * 2 - Math.PI / 2);
    ctx.fillStyle = rad(ctx, X(0), Y(10), Math.max(w, h) * 0.7, [[0, mix("#1a1430", "#3a1a2a", heat)], [1, BG]]);
    ctx.fillRect(0, 0, w, h);
    // gauge
    const gx = X(0), gy = Y(-14), gr = 30 * s;
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI * (1 + i / segs) + 0.02, a1 = Math.PI * (1 + (i + 1) / segs) - 0.02;
      const col = mix(TEAL, i > 9 ? C.pink : C.orange, clamp(i / 9));
      ctx.beginPath(); ctx.arc(gx, gy, gr, a0, a1); ctx.arc(gx, gy, gr - 5 * s, a1, a0, true); ctx.closePath();
      ctx.fillStyle = withAlpha(col, 0.85); ctx.fill();
    }
    const needle = Math.PI * (1.05 + heat * 0.92) + Math.sin(t * 30) * 0.02 * heat;
    limb(ctx, [[gx, gy], [gx + Math.cos(needle) * (gr - 8 * s), gy + Math.sin(needle) * (gr - 8 * s)]], 1.8 * s, C.cream);
    circle(ctx, gx, gy, 3 * s, C.cream);
    text(ctx, `${(4.2 + heat * 1.9).toFixed(2)} GHz`, gx, gy + 7 * s, 5.5 * s, C.cream, { weight: 600, mono: true });
    // chip
    const cx = X(0), cy = Y(24), cs = 28 * s;
    for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
      fillRR(ctx, cx - cs / 2 + 3 * s + i * 3.6 * s, cy + side * (cs / 2 + 1.5 * s) - 1 * s, 1.6 * s, 3 * s, 0.6 * s, "#ffc987");
      fillRR(ctx, cx + side * (cs / 2 + 1.5 * s) - 1.5 * s, cy - cs / 2 + 3 * s + i * 3.6 * s, 3 * s, 1.6 * s, 0.6 * s, "#ffc987");
    }
    glow(ctx, cx, cy, cs * (0.9 + heat * 0.8), C.orange2, 0.2 + heat * 0.5);
    fillRR(ctx, cx - cs / 2, cy - cs / 2, cs, cs, 3 * s, "#2b3270");
    fillRR(ctx, cx - cs * 0.3, cy - cs * 0.3, cs * 0.6, cs * 0.6, 2 * s, lin(ctx, cx - cs * 0.3, cy - cs * 0.3, cx + cs * 0.3, cy + cs * 0.3, [[0, mix("#5a66c0", "#ffb27a", heat)], [1, mix("#3d4590", C.pink, heat)]]));
    // heat shimmer
    for (let i = 0; i < 5; i++) {
      const x0 = cx + (i - 2) * 6 * s;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const y = cy - cs / 2 - 3 * s - k * 2.2 * s;
        const x = x0 + Math.sin(k * 0.8 - t * 6 + i) * 1.5 * s;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.lineWidth = 1.2 * s; ctx.lineCap = "round"; ctx.strokeStyle = withAlpha(C.orange, 0.15 + heat * 0.35); ctx.stroke();
    }
    if (heat > 0.75) for (let i = 0; i < 6; i++) {
      const p = (t * 2 + hash(i)) % 1;
      const a = hash(i + 3) * Math.PI * 2;
      circle(ctx, cx + Math.cos(a) * (cs * 0.6 + p * 20 * s), cy + Math.sin(a) * (cs * 0.6 + p * 20 * s), 1.2 * s * (1 - p), C.orange);
    }
  },
};

const coolant: VideoDef = {
  id: "th-cooling", title: "Liquid cooling loop, 42 minutes of bubbles", channel: "Coolant Club", views: "21M views", durationLabel: "42:00", loop: 4, thumbT: 1,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#0f1424"], [1, BG]]);
    ctx.fillRect(0, 0, w, h);
    // loop path: reservoir -> radiator -> block -> back
    const path: [number, number][] = [[-30, -30], [30, -30], [30, 26], [-30, 26], [-30, -30]];
    const pts = path.map(([x, y]) => [X(x), Y(y)] as [number, number]);
    limb(ctx, pts, 7 * s, withAlpha(TEAL, 0.25));
    limb(ctx, pts, 4.6 * s, withAlpha(TEAL, 0.5));
    // bubbles flowing along the loop
    for (let i = 0; i < 26; i++) {
      const d = ((i / 26 + t / 4) % 1) * 232;
      let x: number, y: number;
      if (d < 60) { x = -30 + d; y = -30; } else if (d < 116) { x = 30; y = -30 + (d - 60); } else if (d < 176) { x = 30 - (d - 116); y = 26; } else { x = -30; y = 26 - (d - 176); }
      circle(ctx, X(x), Y(y), (0.8 + hash(i) * 1.2) * s, withAlpha(C.cream, 0.75));
    }
    // radiator with fan
    fillRR(ctx, X(18), Y(-20), 24 * s, 36 * s, 4 * s, "#1f2a44");
    for (let i = 0; i < 10; i++) fillRR(ctx, X(19.5) + i * 2.2 * s, Y(-18), 1 * s, 32 * s, 0.5 * s, "#2f3d5e");
    drawFan(ctx, X(30), Y(-2), 10 * s, t * 10, "#1b2240", "#3a4a70");
    // reservoir with a wobbling surface
    const rx = X(-40), ry = Y(-24), rw = 20 * s, rh = 34 * s;
    fillRR(ctx, rx, ry, rw, rh, 6 * s, withAlpha("#ffffff", 0.08));
    ctx.save();
    ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 6 * s); ctx.clip();
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh);
    for (let k = 0; k <= 20; k++) ctx.lineTo(rx + (k / 20) * rw, ry + rh * 0.3 + Math.sin(k * 0.7 + t * Math.PI * 2) * 1.2 * s);
    ctx.lineTo(rx + rw, ry + rh); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, ry, 0, ry + rh, [[0, withAlpha(TEAL, 0.9)], [1, withAlpha(C.lilac, 0.9)]]);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const p = (t / 2 + hash(i)) % 1;
      circle(ctx, rx + rw * (0.2 + hash(i + 1) * 0.6), ry + rh - p * rh * 0.68, (0.6 + hash(i + 2)) * s, withAlpha(C.cream, 0.6 * (1 - p)));
    }
    ctx.restore();
    // CPU block
    fillRR(ctx, X(-12), Y(18), 24 * s, 16 * s, 4 * s, "#2b3270");
    fillRR(ctx, X(-8), Y(21), 16 * s, 10 * s, 3 * s, lin(ctx, X(-8), 0, X(8), 0, [[0, TEAL], [1, C.lilac]]));
    circle(ctx, X(0), Y(26), 3 * s, withAlpha(C.cream, 0.4 + 0.3 * Math.sin(t * Math.PI)));
  },
};

const descent: VideoDef = {
  id: "th-descent", title: "Gradient descent with the learning rate way too high", channel: "Loss Landscape", views: "2.2M views", durationLabel: "13:09", loop: 6, thumbT: 2.2,
  draw(ctx, w, h, t) {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
    const base = h * 0.82;
    const f = (x: number) => { const u = x / w - 0.5; return base - h * 0.62 * (Math.exp(-u * u * 7) * -1 + 1) * 0.9 + Math.sin(u * 18) * h * 0.02; };
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 3) ctx.lineTo(x, f(x));
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, h * 0.2, 0, h, [[0, withAlpha(C.lilac, 0.6)], [1, withAlpha(TEAL, 0.15)]]);
    ctx.fill();
    for (let i = 1; i < 6; i++) { ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fillRect(0, (h * i) / 6, w, 1); }
    // learning rate too high: it overshoots harder and harder, then resets
    const p = (t % 6) / 6;
    const amp = 0.08 + p * 0.38;
    const steps = Math.floor(t * 3) % 18;
    const xs = (k: number) => w * (0.5 + Math.cos(k * Math.PI) * (0.06 + (k / 18) * 0.38) * (k % 2 ? 1 : 0.96));
    for (let k = Math.max(0, steps - 6); k < steps; k++) {
      const x = xs(k);
      circle(ctx, x, f(x) - 5, 2, withAlpha(C.cream, 0.15 + ((k - steps + 6) / 6) * 0.4));
    }
    const k = steps, frac = smooth((t * 3) % 1);
    const x0 = xs(k), x1 = xs(k + 1);
    const x = lerp(x0, x1, frac);
    const y = lerp(f(x0), f(x1), frac) - Math.sin(frac * Math.PI) * h * (0.1 + amp * 0.3) - 6;
    glow(ctx, x, y, 18, C.orange, 0.5);
    circle(ctx, x, y, Math.max(4, Math.min(w, h) * 0.035), C.orange);
    text(ctx, "loss", 10, 14, Math.max(8, h * 0.05), withAlpha(C.cream, 0.6), { align: "left", weight: 500 });
    text(ctx, `lr ${(0.5 + p * 9.5).toFixed(1)}`, w - 10, 14, Math.max(8, h * 0.05), withAlpha(TEAL, 0.85), { align: "right", weight: 600, mono: true });
  },
};

const paste: VideoDef = {
  id: "th-paste", title: "Thermal paste: the pea-sized dot, settled forever", channel: "Bare Metal", views: "4.8M views", durationLabel: "5:50", loop: 7, thumbT: 2.4,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = "#121a2a"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 10; i++) fillRR(ctx, hash(i) * w, hash(i + 5) * h, 3 * s, 3 * s, 1 * s, withAlpha(TEAL, 0.08));
    // motherboard traces
    for (let i = 0; i < 8; i++) {
      const y = Y(-45 + i * 13);
      limb(ctx, [[0, y], [X(-30 + hash(i) * 10), y], [X(-22 + hash(i) * 10), y + 6 * s], [w, y + 6 * s]], 1 * s, withAlpha(TEAL, 0.12));
    }
    const cx = X(0), cy = Y(4), cs = 34 * s;
    fillRR(ctx, cx - cs / 2 - 4 * s, cy - cs / 2 - 4 * s, cs + 8 * s, cs + 8 * s, 4 * s, "#1f2a44");
    fillRR(ctx, cx - cs / 2, cy - cs / 2, cs, cs, 3 * s, lin(ctx, cx - cs / 2, cy - cs / 2, cx + cs / 2, cy + cs / 2, [[0, "#c9cdf5"], [1, "#8a91c4"]]));
    const dot = smooth(seg(t, 0.8, 2.2));
    const press = easeInOut(seg(t, 2.8, 3.6)) * (1 - easeInOut(seg(t, 4.6, 5.4)));
    const spread = smooth(seg(t, 3.3, 3.7));
    const pr = lerp(4 * s * dot, 13 * s, spread);
    if (dot > 0) {
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const r = pr * (1 + spread * 0.08 * Math.sin(a * 6));
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = "#eef0ff"; ctx.fill();
      ellipse(ctx, cx - pr * 0.3, cy - pr * 0.35, pr * 0.3, pr * 0.15, -0.4, "rgba(255,255,255,0.8)");
    }
    // robot arm with syringe
    const armIn = smooth(seg(t, 0.2, 0.8)) * (1 - smooth(seg(t, 2.3, 2.8)));
    if (armIn > 0) {
      const tipX = cx + 2 * s, tipY = lerp(Y(-60), cy - 4 * s, armIn);
      limb(ctx, [[w + 10, Y(-50)], [X(30), Y(-40)], [tipX + 10 * s, tipY - 22 * s]], 5 * s, C.lilac);
      circle(ctx, X(30), Y(-40), 3.4 * s, mix(C.lilac, "#ffffff", 0.2));
      fillRR(ctx, tipX - 3 * s, tipY - 22 * s, 6 * s, 18 * s, 2 * s, withAlpha("#ffffff", 0.75));
      fillRR(ctx, tipX - 2 * s, tipY - 14 * s, 4 * s, 9 * s, 1.5 * s, "#eef0ff");
      poly(ctx, [[tipX - 1.6 * s, tipY - 4 * s], [tipX + 1.6 * s, tipY - 4 * s], [tipX, tipY]], "#c9cdf5");
    }
    // heatsink lowering
    const hs = press;
    if (hs > 0) {
      const z = lerp(1.5, 1, hs);
      const a = hs;
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.translate(cx, cy);
      ctx.scale(z, z);
      fillRR(ctx, -24 * s, -24 * s, 48 * s, 48 * s, 5 * s, "#3a4a70");
      for (let i = 0; i < 9; i++) fillRR(ctx, -21 * s + i * 5 * s, -22 * s, 2.4 * s, 44 * s, 1 * s, "#5a6c9a");
      drawFan(ctx, 0, 0, 16 * s, t * 12, "#22304e", "#4a5c88");
      ctx.restore();
    }
    loopFade(ctx, w, h, t, 7, 0.35);
  },
};

const fins: VideoDef = {
  id: "th-fins", title: "Heatsink fins up close, airflow explained", channel: "Heat Sync", views: "1.9M views", durationLabel: "28:30", loop: 3, thumbT: 1,
  draw(ctx, w, h, t) {
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#0f1a26"], [1, "#2a1626"]]);
    ctx.fillRect(0, 0, w, h);
    const n = Math.max(6, Math.round(w / 28));
    const fw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * fw + fw * 0.2;
      fillRR(ctx, x, h * 0.08, fw * 0.45, h * 0.84, fw * 0.12, lin(ctx, 0, h * 0.08, 0, h * 0.92, [[0, "#5a6c9a"], [0.7, "#8b6c88"], [1, C.orange2]]));
      fillRR(ctx, x + fw * 0.06, h * 0.1, fw * 0.08, h * 0.8, fw * 0.04, "rgba(255,255,255,0.18)");
    }
    glow(ctx, w / 2, h, w * 0.6, C.orange2, 0.35);
    // air streaks rising between fins
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
      const p = ((t / 3) * 2 + hash(i * 3 + k)) % 1;
      const x = i * fw + fw * 0.82;
      const y = h * (0.95 - p * 0.95);
      fillRR(ctx, x - 1, y, 2, h * 0.1, 1, withAlpha(p > 0.5 ? TEAL : C.cream, 0.45 * Math.sin(p * Math.PI)));
    }
  },
};

const rack: VideoDef = {
  id: "th-rack", title: "Eight GPUs, one rack, one very loud fan curve", channel: "Rack Mount", views: "7.7M views", durationLabel: "16:16", loop: 4, thumbT: 1.5,
  draw(ctx, w, h, t) {
    const { s, X, Y } = core(w, h, 0.5);
    ctx.fillStyle = rad(ctx, w / 2, h / 2, Math.max(w, h) * 0.7, [[0, "#152038"], [1, BG]]);
    ctx.fillRect(0, 0, w, h);
    fillRR(ctx, X(-40), Y(-46), 80 * s, 92 * s, 5 * s, "#1a2238");
    for (let i = 0; i < 4; i++) {
      const y = Y(-34 + i * 22);
      fillRR(ctx, X(-37), y - 9 * s, 74 * s, 18 * s, 3 * s, "#11172a");
      drawGPU(ctx, X(-17), y, 34 * s, t + i, { fans: 2, shroud: i % 2 ? "#2b3270" : "#25406a" });
      drawGPU(ctx, X(18), y, 34 * s, t + i + 0.5, { fans: 2, shroud: i % 2 ? "#25406a" : "#2b3270" });
    }
    glow(ctx, X(0), Y(0), 60 * s, TEAL, 0.12 + 0.06 * Math.sin(t * Math.PI));
  },
};

export const BENCHTOP_VIDEOS: VideoDef[] = [weights, nearby, heads, overclock, coolant, descent, paste, fins, rack, ...MORE_BENCHTOP_VIDEOS];

// Benchtop's mark: a small workbench with a spark above it.
const MARK = `<svg class="fun-th-mark" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 1.6l1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3z" fill="#8ff5ea"/>
  <rect x="2.5" y="11.4" width="19" height="3.8" rx="1.6" fill="#3fe0d0"/>
  <rect x="5" y="14.6" width="2.8" height="7.6" rx="1" fill="#22a99c"/>
  <rect x="16.2" y="14.6" width="2.8" height="7.6" rx="1" fill="#22a99c"/>
  <rect x="7" y="18.2" width="10" height="1.8" rx=".8" fill="#22a99c"/>
</svg>`;
const CHECK = `<svg class="fun-th-check" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="#3fe0d0"/><path d="M3.4 6.2 5.2 8l3.4-3.8" fill="none" stroke="#0b0e18" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const NAV = ["Builds", "Repairs", "Cooling", "Overclocking", "Teardowns", "Legacy Code", "Open Source"];
const VERIFIED = new Set(["Full Precision", "Bare Metal", "Rack Mount", "Big O", "Open Source", "Legacy Code", "Heat Sync", "Kernel Panic", "Hot Path"]);
const HEADINGS = ["Fresh from the workbench", "Recommended for your architecture", "Popular with your build server"];
const ADS = [
  ["Anti-static wrist straps, now in twelve colors", "Your circuits will thank you"],
  ["Spare screws, sorted by size forever", "Magnetic tray included"],
  ["One weird trick to halve your build time", "Linkers hate it"],
];
const PARTS = ["1 robot", "2 hex keys", "a lot of patience", "one anti-static strap", "a spare fan", "three zip ties", "a rubber duck", "the good screwdriver", "a label maker", "one drop of oil"];
const TH_COMMENTS = [
  "Came for the cooling, stayed for the big O analysis.",
  "My fans spun up at 3:12.",
  "Finally someone explains this slowly.",
  "Watching this at work because it is literally my job.",
  "Did not expect a linter cameo at 2:40.",
  "Bookmarked for the next hackathon.",
  "This is why I bought a dedicated GPU.",
  "Showed this to my rubber duck. It quacked twice.",
  "Ten out of ten, would compile again.",
  "Followed along with my own soldering iron. Nothing caught fire.",
];
const TH_NAMES = ["gpu.gremlin", "null.pointer", "tab.indenter", "heap.hopper", "cache.monet", "segfault.sam", "regex.rex", "byte.bard", "fan.curve", "sudo.make"];
const TH_COLORS = ["#3fe0d0", "#b07cff", "#ff9f5a", "#4fb6ff", "#ff6f91"];

const seedOf = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
/** Percent of viewers who say it compiled. */
const rating = (v: VideoDef) => 88 + Math.floor(hash(seedOf(v.id)) * 12);
const byline = (v: VideoDef, full = false) =>
  `<span class="fun-th-by">${esc(v.channel)}${VERIFIED.has(v.channel) ? `${CHECK}${full ? `<em>Verified Compiler</em>` : ""}` : ""}</span>`;
function thComments(v: VideoDef): Comment[] {
  const k = seedOf(v.id);
  return [0, 1, 2, 3].map((i) => ({
    name: `@${TH_NAMES[(k + i * 3) % TH_NAMES.length]}`,
    text: TH_COMMENTS[(k + i * 7) % TH_COMMENTS.length],
    likes: String(40 + Math.floor(hash(k + i) * 2400)),
    color: TH_COLORS[(k + i) % TH_COLORS.length],
  }));
}
/** Three parts from the bench, the same for a video every time. */
const parts = (v: VideoDef) => { const k = seedOf(v.id); return [0, 1, 2].map((i) => PARTS[(k + i * 4) % PARTS.length]).join(", "); };

export async function browseBenchtop(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  const start = performance.now();
  try {
    const site = new Site(body, scope, host, "fun-th", `
      <header class="fun-th-top">
        <span class="fun-th-logo">${MARK}<b>Benchtop</b></span>
        <span class="fun-th-search">Search 4,096 builds</span>
        <span class="fun-th-acts"><span>Upload</span><span>Log in</span></span>
        <nav class="fun-th-nav">${NAV.map((n, i) => `<span class="${i === 0 ? "fun-on" : ""}">${n}</span>`).join("")}</nav>
      </header>`);
    const timeUp = () => host.stopped || performance.now() - start > opts.maxMs;
    const vids = [...BENCHTOP_VIDEOS].sort(() => Math.random() - 0.5);
    const ad = ADS[Math.floor(Math.random() * ADS.length)];
    const tile = (v: VideoDef) => `
      <div class="fun-th-item" data-id="${v.id}">
        <div class="fun-th-thumb"><canvas data-v="${v.id}"></canvas></div>
        <b>${esc(v.title)}</b>${byline(v)}<span>${esc(v.views)}<i aria-hidden="true"></i>${rating(v)}% compiled</span>
      </div>`;
    const adTile = `
      <div class="fun-th-ad" aria-hidden="true">
        <div class="fun-th-ad-box"><small>Ad</small><b>${esc(ad[0])}</b><span>${esc(ad[1])}</span></div>
      </div>`;
    const home = () => {
      site.stop();
      const tiles = vids.map(tile);
      tiles.splice(6, 0, adTile);
      site.page.innerHTML = `
        <div class="fun-th-head"><h2>${HEADINGS[Math.floor(Math.random() * HEADINGS.length)]}</h2><span>Sort: most compiled</span></div>
        <div class="fun-th-grid">${tiles.join("")}</div>`;
      site.thumbs(site.page, vids);
    };
    const watch = (v: VideoDef) => {
      const rel = vids.filter((x) => x.id !== v.id).slice(0, 4);
      const r = rating(v);
      site.page.innerHTML = `
        <div class="fun-th-watch">
          <div class="fun-th-main">
            <div class="fun-tb-player fun-th-player"><canvas></canvas><div class="fun-tb-ctrl"><div class="fun-tb-bar"><i></i></div><span class="fun-tb-time"></span></div></div>
            <h3>${esc(v.title)}</h3>
            <div class="fun-th-meta">${byline(v, true)}<span>${esc(v.views)}</span><span class="fun-th-rate"><i style="width:${r}%"></i></span><span>${r}% compiled</span></div>
            <div class="fun-th-tools"><span>Like</span><span>Fork</span><span>Add to parts list</span><span>Save for later</span></div>
            <p class="fun-th-parts">Parts in this video: ${esc(parts(v))}</p>
            <div class="fun-th-cms">${commentsHtml(thComments(v))}</div>
          </div>
          <aside class="fun-th-rel">${rel.map((x) => `<div class="fun-th-rec" data-id="${x.id}"><div class="fun-th-thumb"><canvas data-v="${x.id}"></canvas></div><b>${esc(x.title)}</b></div>`).join("")}</aside>
        </div>`;
      site.thumbs(site.page, rel);
      const canvas = site.page.querySelector(".fun-th-player canvas") as HTMLCanvasElement;
      site.play(canvas, site.page.querySelector(".fun-tb-bar i") as HTMLElement, site.page.querySelector(".fun-tb-time") as HTMLElement, v, Math.random() * parseDur(v.durationLabel) * 0.3);
      return canvas;
    };

    home();
    host.react("focus");
    await host.sleep(900);

    while (!timeUp()) {
      // sometimes browse further down before picking
      if (Math.random() < 0.5) {
        const all = site.page.querySelectorAll<HTMLElement>(".fun-th-item");
        const pick = all[Math.floor(Math.random() * all.length)];
        if (pick) { await site.scrollTo(pick.offsetTop - 40, 1100); await host.sleep(500); }
      }
      // hover a few tiles, the previews come alive
      const items = [...site.page.querySelectorAll<HTMLElement>(".fun-th-item")].filter((e) => site.visible(e.querySelector(".fun-th-thumb")!));
      const looks = 2 + Math.floor(Math.random() * 2);
      let last: HTMLElement | null = null;
      for (let i = 0; i < looks && items.length; i++) {
        last = items[Math.floor(Math.random() * items.length)];
        const c = last.querySelector("canvas") as HTMLCanvasElement;
        await host.pointAt(c, 0.5, 0.5);
        site.hoverPreview(c, vids.find((v) => v.id === last!.dataset.id));
        await host.sleep(900 + Math.random() * 900);
      }
      if (!last || timeUp()) break;
      await host.click();
      let v = vids.find((x) => x.id === last!.dataset.id)!;
      let from = last.querySelector("canvas") as HTMLCanvasElement;
      for (let round = 0; round < 3 && !timeUp(); round++) {
        const pv = v;
        await site.open(from, () => watch(pv));
        const t0 = performance.now(), ms = 6000 + Math.random() * 5000;
        // one good moment per video: a clever fix or a satisfying click
        const wowAt = 1200 + Math.random() * 2500;
        let wowed = false, read = Math.random() < 0.35;
        while (performance.now() - t0 < ms && !timeUp()) {
          if (!wowed && performance.now() - t0 > wowAt) { wowed = true; host.react(Math.random() < 0.5 ? "surprised" : "cheer"); }
          // now and then the robot scrolls down to read the comments, then back up
          if (read && performance.now() - t0 > ms * 0.55) {
            read = false;
            const cms = site.page.querySelector<HTMLElement>(".fun-th-cms");
            if (cms) { await site.scrollTo(cms.offsetTop - 30, 900); await host.sleep(1800); host.react("laugh"); await site.scrollTo(0, 700); }
          }
          await host.sleep(150);
        }
        if (timeUp() || Math.random() < 0.4) break;
        const recs = [...site.page.querySelectorAll<HTMLElement>(".fun-th-rec")].filter((e) => site.visible(e));
        const rec = recs[Math.floor(Math.random() * recs.length)];
        if (!rec) break;
        from = rec.querySelector("canvas") as HTMLCanvasElement;
        await host.pointAt(from, 0.5, 0.5);
        site.hoverPreview(from, vids.find((x) => x.id === rec.dataset.id));
        await host.sleep(800);
        await host.click();
        v = vids.find((x) => x.id === rec.dataset.id)!;
      }
      if (timeUp()) break;
      await host.pointAt(site.root.querySelector(".fun-th-logo")!, 0.5, 0.5);
      await host.click();
      await site.swap(home);
      await host.sleep(500);
    }
    return { result: "done" };
  } finally {
    scope.dispose();
  }
}
