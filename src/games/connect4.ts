// Four in a Row against the CPU. The robot drops orange discs by clicking a column.
import "./games.css";
import { Scope, Session, Halt, mountFrame, nap, think, chance, pick, type FunHost, type FunOpts, type Outcome } from "./kit";

const COLS = 7, ROWS = 6;
type Cell = 0 | 1 | 2; // 1 robot, 2 cpu
const NS = "http://www.w3.org/2000/svg";

const at = (b: Cell[], c: number, r: number) => b[r * COLS + c];
const dropRow = (b: Cell[], c: number) => { for (let r = ROWS - 1; r >= 0; r--) if (!at(b, c, r)) return r; return -1; };
const moves = (b: Cell[]) => [3, 2, 4, 1, 5, 0, 6].filter((c) => !at(b, c, 0));

function fourAt(b: Cell[]): { who: Cell; cells: [number, number][] } | null {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const v = at(b, c, r);
    if (!v) continue;
    for (const [dc, dr] of dirs) {
      const cells: [number, number][] = [[c, r]];
      for (let k = 1; k < 4; k++) {
        const cc = c + dc * k, rr = r + dr * k;
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || at(b, cc, rr) !== v) break;
        cells.push([cc, rr]);
      }
      if (cells.length === 4) return { who: v, cells };
    }
  }
  return null;
}

function evalBoard(b: Cell[], me: Cell): number {
  const op: Cell = me === 1 ? 2 : 1;
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (at(b, 3, r) === me) score += 3; else if (at(b, 3, r) === op) score -= 3;
  const win = (cells: Cell[]) => {
    const m = cells.filter((x) => x === me).length, o = cells.filter((x) => x === op).length;
    if (m && o) return 0;
    if (m === 3) return 5; if (m === 2) return 2;
    if (o === 3) return -6; if (o === 2) return -2;
    return 0;
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const ec = c + dc * 3, er = r + dr * 3;
      if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
      score += win([0, 1, 2, 3].map((k) => at(b, c + dc * k, r + dr * k)));
    }
  }
  return score;
}

function negamax(b: Cell[], depth: number, a: number, beta: number, me: Cell): number {
  const f = fourAt(b);
  if (f) return f.who === me ? 10000 + depth : -10000 - depth;
  const ms = moves(b);
  if (!ms.length) return 0;
  if (depth === 0) return evalBoard(b, me);
  const op: Cell = me === 1 ? 2 : 1;
  let best = -Infinity;
  for (const c of ms) {
    const r = dropRow(b, c);
    b[r * COLS + c] = me;
    const v = -negamax(b, depth - 1, -beta, -a, op);
    b[r * COLS + c] = 0;
    if (v > best) best = v;
    if (v > a) a = v;
    if (a >= beta) break;
  }
  return best;
}

function chooseCol(b: Cell[], me: Cell, depth: number, slip: number): number {
  const ms = moves(b);
  const op: Cell = me === 1 ? 2 : 1;
  const scored = ms.map((c) => {
    const r = dropRow(b, c);
    b[r * COLS + c] = me;
    const v = -negamax(b, depth - 1, -Infinity, Infinity, op);
    b[r * COLS + c] = 0;
    return { c, v: v + (Math.random() - 0.5) * 0.8 };
  });
  scored.sort((x, y) => y.v - x.v);
  if (chance(slip) && scored.length > 1) return pick(scored.slice(1, 3)).c;
  return scored[0].c;
}

export async function playConnectFour(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  try {
    const f = mountFrame(body, scope, "Four in a Row", "c4");
    const S = new Session(host, opts, { base: 0.35, step: 0.15, calm: 0.1 });
    const depth = S.skill > 0.75 ? 5 : S.skill > 0.5 ? 4 : S.skill > 0.3 ? 3 : 2;
    const slip = 0.03 + 0.3 * (1 - S.skill);
    const cpuDepth = pick([3, 4, 4, 5]);
    const cpuSlip = 0.08 + Math.random() * 0.12;

    const cell = Math.floor(Math.min((f.w - 150) / COLS, (f.h - 70) / ROWS));
    const bw = cell * COLS + 12, bh = cell * ROWS + 12;
    const wrap = document.createElement("div");
    wrap.className = "gm-c4-wrap";
    wrap.innerHTML = `
      <div class="gm-c4-side gm-c4-me"><i></i><span>Robot</span></div>
      <div class="gm-c4-board" style="width:${bw}px;height:${bh + cell}px">
        <svg width="${bw}" height="${bh + cell}" viewBox="0 0 ${bw} ${bh + cell}" aria-hidden="true">
          <g class="gm-c4-discs"></g>
          <path class="gm-c4-face" fill-rule="evenodd" d=""></path>
          <g class="gm-c4-top"></g>
        </svg>
        ${Array.from({ length: COLS }, (_, c) => `<i class="gm-c4-col" style="left:${6 + c * cell}px;width:${cell}px;top:0;height:${bh + cell}px"></i>`).join("")}
      </div>
      <div class="gm-c4-side gm-c4-cpu"><i></i><span>CPU</span></div>`;
    f.stage.appendChild(wrap);
    const svg = wrap.querySelector("svg")!;
    const discsG = svg.querySelector(".gm-c4-discs")!;
    const topG = svg.querySelector(".gm-c4-top")!;
    const cols = [...wrap.querySelectorAll(".gm-c4-col")] as HTMLElement[];
    const sideMe = wrap.querySelector(".gm-c4-me") as HTMLElement, sideCpu = wrap.querySelector(".gm-c4-cpu") as HTMLElement;
    const cx = (c: number) => 6 + c * cell + cell / 2;
    const cy = (r: number) => cell + 6 + r * cell + cell / 2;
    const R = cell * 0.39;
    let d = `M0 ${cell} H${bw} V${cell + bh} H0 Z`;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = cx(c), y = cy(r), rr = R;
      d += ` M${x - rr} ${y} a${rr} ${rr} 0 1 0 ${rr * 2} 0 a${rr} ${rr} 0 1 0 ${-rr * 2} 0 Z`;
    }
    svg.querySelector(".gm-c4-face")!.setAttribute("d", d);

    const mk = (tag: string, attrs: Record<string, string | number>, parent: Element) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    };
    const hover = mk("circle", { cx: cx(3), cy: cell / 2, r: R, class: "gm-c4-d gm-p1", opacity: 0 }, topG);

    const b: Cell[] = Array(COLS * ROWS).fill(0);
    const turn = (who: 1 | 2) => { sideMe.classList.toggle("gm-on", who === 1); sideCpu.classList.toggle("gm-on", who === 2); };
    const drop = async (c: number, who: 1 | 2) => {
      const r = dropRow(b, c);
      b[r * COLS + c] = who;
      const disc = mk("circle", { cx: cx(c), cy: cell / 2, r: R + 2.5, class: `gm-c4-d gm-p${who}` }, discsG);
      await new Promise<void>((res) => {
        const tl = scope.timeline({ onComplete: res });
        tl.to(disc, { attr: { cy: cy(r) }, duration: 0.18 + r * 0.045, ease: "power2.in" })
          .to(disc, { attr: { cy: cy(r) - Math.min(14, cell * 0.3) }, duration: 0.09, ease: "power1.out" })
          .to(disc, { attr: { cy: cy(r) }, duration: 0.09, ease: "power1.in" });
      });
      return disc;
    };

    const robotMove = async () => {
      turn(1);
      host.react("focus");
      const c = chooseCol(b, 1, depth, slip);
      // glance along a couple of columns before committing
      const glances = chance(0.5) ? [pick(moves(b))] : [];
      hover.setAttribute("opacity", "1");
      for (const g of [...glances, c]) {
        await host.pointAt(cols[g], 0.5, 0.06, 420);
        scope.to(hover, { attr: { cx: cx(g) }, duration: 0.18, ease: "power2.out" });
        await nap(host, think(S.skill, g === c ? 300 : 420));
      }
      await host.click();
      hover.setAttribute("opacity", "0");
      await drop(c, 1);
    };
    const cpuMove = async () => {
      turn(2);
      await nap(host, 450 + Math.random() * 600);
      await drop(chooseCol(b, 2, cpuDepth, cpuSlip), 2);
    };

    f.setScore("Robot vs CPU");
    await nap(host, 500);
    let who: 1 | 2 = chance(0.5) ? 1 : 2;
    let won: ReturnType<typeof fourAt> = null;
    let n = 0;
    while (!won && moves(b).length) {
      if (S.timeUp) break;
      if (who === 1) await robotMove(); else await cpuMove();
      n++;
      f.setScore(`Move ${n}`);
      won = fourAt(b);
      who = who === 1 ? 2 : 1;
    }
    sideMe.classList.remove("gm-on"); sideCpu.classList.remove("gm-on");
    if (won) {
      const [a, z] = [won.cells[0], won.cells[3]];
      const ln = mk("path", { d: `M${cx(a[0])} ${cy(a[1])} L${cx(z[0])} ${cy(z[1])}`, class: "gm-c4-win" }, topG) as SVGPathElement;
      const len = Math.hypot(cx(z[0]) - cx(a[0]), cy(z[1]) - cy(a[1])) + 1;
      ln.style.strokeDasharray = `${len}`;
      scope.fromTo(ln, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.45, ease: "power2.inOut" });
      await nap(host, 700);
    }
    if (won?.who === 1) {
      host.react("cheer");
      f.setScore("Robot wins", true);
      f.showOver("Four in a row", `Robot wins in ${n} moves`, "good");
      await nap(host, 2300);
      return { result: "win", score: n };
    }
    if (won?.who === 2) {
      f.setScore("CPU wins", true);
      f.showOver("CPU wins", `${n} moves`, "bad");
      S.rounds = 2;
      const next = S.afterLoss(0.3);
      if (next === "ragequit") { host.react("angry"); await nap(host, 600); return { result: "ragequit", score: n }; }
      host.react(chance(0.5) ? "angry" : "relax");
      await nap(host, 2000);
      return { result: "lose", score: n };
    }
    host.react("laugh");
    f.showOver(S.timeUp ? "Out of time" : "Board full", "No winner", "plain");
    await nap(host, 1800);
    return { result: "done", score: n };
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
