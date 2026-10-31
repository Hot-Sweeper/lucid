// Bit Merge: a 2048-style sliding tile game with robot parts. The robot plays with the arrow keys.
import "./games.css";
import { Scope, Session, Halt, mountFrame, nap, chance, pick, type FunHost, type FunOpts, type Outcome } from "./kit";

type Dir = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
const DIRS: Dir[] = ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"];
const NAMES: Record<number, string> = { 2: "bolt", 4: "nut", 8: "gear", 16: "chip", 32: "cell", 64: "servo", 128: "arm", 256: "head", 512: "bot", 1024: "mech", 2048: "mainframe" };
const GOAL = 256;

type Grid = number[]; // 16 values, row-major, 0 = empty

/** Slide one line toward index 0. Returns the new line, score gained and merge flags. */
function slideLine(line: number[]) {
  const vals = line.filter((v) => v);
  const out: number[] = [];
  const merged: boolean[] = [];
  const from: number[][] = [];
  const src = line.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  let gain = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2); merged.push(true); from.push([src[i], src[i + 1]]); gain += vals[i] * 2; i++;
    } else { out.push(vals[i]); merged.push(false); from.push([src[i]]); }
  }
  while (out.length < 4) { out.push(0); merged.push(false); from.push([]); }
  return { out, merged, from, gain };
}

const lineIdx = (dir: Dir, k: number): number[] => {
  // indices of line k, ordered from the side tiles slide toward
  const r = [0, 1, 2, 3];
  if (dir === "ArrowLeft") return r.map((i) => k * 4 + i);
  if (dir === "ArrowRight") return r.map((i) => k * 4 + 3 - i);
  if (dir === "ArrowUp") return r.map((i) => i * 4 + k);
  return r.map((i) => (3 - i) * 4 + k);
};

function move(g: Grid, dir: Dir) {
  const next = g.slice();
  let gain = 0, moved = false;
  const moves: { from: number; to: number; merge: boolean }[] = [];
  for (let k = 0; k < 4; k++) {
    const idx = lineIdx(dir, k);
    const res = slideLine(idx.map((i) => g[i]));
    res.out.forEach((v, j) => { next[idx[j]] = v; });
    res.from.forEach((fr, j) => fr.forEach((s) => { moves.push({ from: idx[s], to: idx[j], merge: res.merged[j] }); if (s !== j) moved = true; }));
    if (res.merged.some((m) => m)) moved = true;
    gain += res.gain;
  }
  return { next, gain, moved, moves };
}

function heur(g: Grid) {
  let empty = 0, mono = 0, smooth = 0, max = 0;
  for (const v of g) { if (!v) empty++; if (v > max) max = v; }
  const L = (v: number) => (v ? Math.log2(v) : 0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    const a = L(g[r * 4 + c]), b = L(g[r * 4 + c + 1]);
    mono += a >= b ? 0 : (a - b);
    if (a && b) smooth -= Math.abs(a - b);
  }
  for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) {
    const a = L(g[r * 4 + c]), b = L(g[(r + 1) * 4 + c]);
    mono += b >= a ? 0 : (b - a);
    if (a && b) smooth -= Math.abs(a - b);
  }
  const corner = g[12] === max ? L(max) * 2 : 0;
  return empty * 2.7 + mono * 1.0 + smooth * 0.1 + corner;
}

/** One ply plus the average over where the next tile could land. */
function bestDir(g: Grid): Dir | null {
  let best: Dir | null = null, bestV = -Infinity;
  for (const d of DIRS) {
    const m = move(g, d);
    if (!m.moved) continue;
    const empt = m.next.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    let v = 0;
    const sample = empt.length > 6 ? empt.filter((_, i) => i % 2 === 0) : empt;
    for (const i of sample) {
      const n = m.next.slice(); n[i] = 2;
      let inner = -Infinity;
      for (const d2 of DIRS) { const m2 = move(n, d2); if (m2.moved) inner = Math.max(inner, heur(m2.next) + m2.gain * 0.01); }
      v += inner === -Infinity ? -50 : inner;
    }
    v = sample.length ? v / sample.length : heur(m.next);
    v += m.gain * 0.02 + (d === "ArrowUp" ? -3 : 0);
    if (v > bestV) { bestV = v; best = d; }
  }
  return best;
}

export async function playBitMerge(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  try {
    const f = mountFrame(body, scope, "Bit Merge", "mg");
    const S = new Session(host, opts, { base: 0.3, step: 0.15, calm: 0.08 });
    const sloppy = 0.06 + 0.5 * (1 - S.skill) * (1 - S.skill);
    const size = Math.min(f.h - 44, 272);
    const gap = 8, cell = (size - gap * 5) / 4;
    const wrap = document.createElement("div");
    wrap.className = "gm-mg-wrap";
    wrap.innerHTML = `<div class="gm-mg-board" style="width:${size}px;height:${size}px">${Array.from({ length: 16 }, (_, i) => `<i class="gm-mg-slot" style="left:${gap + (i % 4) * (cell + gap)}px;top:${gap + Math.floor(i / 4) * (cell + gap)}px;width:${cell}px;height:${cell}px"></i>`).join("")}</div>
      <div class="gm-mg-foot"><span>Goal <b>${GOAL}</b> ${NAMES[GOAL]}</span><span class="gm-mg-best"></span></div>`;
    f.stage.appendChild(wrap);
    const board = wrap.querySelector(".gm-mg-board") as HTMLElement;
    const bestEl = wrap.querySelector(".gm-mg-best") as HTMLElement;
    const pos = (i: number) => ({ x: gap + (i % 4) * (cell + gap), y: gap + Math.floor(i / 4) * (cell + gap) });

    let g: Grid = Array(16).fill(0);
    const els: (HTMLElement | null)[] = Array(16).fill(null);
    let score = 0, moves = 0;
    const paint = (el: HTMLElement, v: number) => {
      el.dataset.v = String(Math.min(v, 2048));
      el.innerHTML = `${v >= 128 ? `<i class="gm-mg-eyes"></i>` : ""}<b>${v}</b><span>${NAMES[v] ?? ""}</span>`;
    };
    const tile = (i: number, v: number) => {
      const el = document.createElement("div");
      el.className = "gm-mg-tile";
      el.style.width = el.style.height = `${cell}px`;
      paint(el, v);
      board.appendChild(el);
      scope.set(el, pos(i));
      return el;
    };
    const spawn = () => {
      const empt = g.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      if (!empt.length) return;
      const i = pick(empt), v = Math.random() < 0.9 ? 2 : 4;
      g[i] = v;
      els[i] = tile(i, v);
      scope.fromTo(els[i], { scale: 0 }, { scale: 1, duration: 0.2, delay: 0.08, ease: "back.out(2)" });
    };
    const maxTile = () => Math.max(...g);
    const status = () => {
      f.setScore(`Score ${score}`);
      const m = maxTile();
      bestEl.innerHTML = `Best <b>${m}</b> ${NAMES[m] ?? ""}`;
    };
    const apply = (d: Dir) => {
      const m = move(g, d);
      if (!m.moved) return false;
      const nextEls: (HTMLElement | null)[] = Array(16).fill(null);
      const gone: HTMLElement[] = [];
      for (const mv of m.moves) {
        const el = els[mv.from];
        if (!el) continue;
        scope.to(el, { ...pos(mv.to), duration: 0.11, ease: "power2.out" });
        if (nextEls[mv.to]) gone.push(el); else nextEls[mv.to] = el;
      }
      g = m.next;
      score += m.gain;
      moves++;
      scope.add(() => gone.forEach((e) => e.remove()));
      setTimeoutSafe(() => {
        gone.forEach((e) => e.remove());
        nextEls.forEach((el, i) => {
          if (!el) return;
          if (el.dataset.v !== String(Math.min(g[i], 2048))) {
            paint(el, g[i]);
            scope.fromTo(el, { scale: 1.18 }, { scale: 1, duration: 0.22, ease: "back.out(3)" });
          }
        });
      }, 110);
      for (let i = 0; i < 16; i++) els[i] = nextEls[i];
      spawn();
      status();
      return true;
    };
    const timers: number[] = [];
    const setTimeoutSafe = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
    scope.add(() => timers.forEach((t) => window.clearTimeout(t)));

    spawn(); spawn();
    status();
    host.react("focus");
    await nap(host, 700);
    let lastMax = 0, panicked = false;
    const t0 = performance.now();
    for (;;) {
      if (S.timeUp) {
        f.showOver("Time", `Best tile ${maxTile()}   Score ${score}`, "plain");
        await nap(host, 1600);
        return { result: "done", score };
      }
      const valid = DIRS.filter((d) => move(g, d).moved);
      if (!valid.length) break;
      let d = bestDir(g) ?? valid[0];
      if (chance(sloppy)) d = pick(valid);
      host.tap(d);
      apply(d);
      const m = maxTile();
      if (m > lastMax && m >= 64) { lastMax = m; host.react(m >= GOAL ? "cheer" : "focus"); }
      if (m >= GOAL) {
        await nap(host, 500);
        f.showOver(`${GOAL} ${NAMES[GOAL]}`, `${moves} moves   Score ${score}`, "good");
        await nap(host, 2200);
        return { result: "win", score };
      }
      const empty = g.filter((v) => !v).length;
      if (empty <= 1 && !panicked) { panicked = true; host.react("surprised"); }
      if (empty > 4) panicked = false;
      // quick taps once it gets going, slower when the board is crowded
      const pace = performance.now() - t0 < 3000 ? 420 : 230 + (6 - Math.min(6, empty)) * 45;
      await nap(host, pace * (0.8 + Math.random() * 0.5) * (1.2 - S.skill * 0.3));
    }
    await nap(host, 500);
    f.showOver("Board full", `Best tile ${maxTile()}   Score ${score}`, "bad");
    S.rounds = 2;
    const next = S.afterLoss(maxTile() <= 64 ? 0.35 : 0.15);
    if (next === "ragequit") { host.react("angry"); await nap(host, 600); return { result: "ragequit", score }; }
    host.react(maxTile() >= 128 ? "relax" : "angry");
    await nap(host, 1900);
    return { result: "lose", score };
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
