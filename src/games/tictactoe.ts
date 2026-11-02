// Tic-tac-toe against the CPU. The robot is X and clicks cells; quick round or best of 3.
import "./games.css";
import { Scope, Session, Halt, mountFrame, nap, think, chance, pick, type FunHost, type FunOpts, type Outcome } from "./kit";

type Mark = "X" | "O" | "";
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const NS = "http://www.w3.org/2000/svg";

function winner(b: Mark[]): { m: Mark; line: number[] } | null {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { m: b[l[0]], line: l };
  return null;
}
const empties = (b: Mark[]) => b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

function minimax(b: Mark[], me: Mark, turn: Mark, depth: number): number {
  const w = winner(b);
  if (w) return w.m === me ? 10 - depth : depth - 10;
  const e = empties(b);
  if (!e.length) return 0;
  const scores = e.map((i) => {
    b[i] = turn;
    const s = minimax(b, me, turn === "X" ? "O" : "X", depth + 1);
    b[i] = "";
    return s;
  });
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}

/** Best cell for `me`, with a chance of a plausible-looking slip. */
function choose(b: Mark[], me: Mark, slip: number): number {
  const e = empties(b);
  if (e.length === 9) return chance(0.5) ? 4 : pick([0, 2, 6, 8, 4, 1]);
  const scored = e.map((i) => {
    b[i] = me;
    const s = minimax(b, me, me === "X" ? "O" : "X", 1);
    b[i] = "";
    return { i, s };
  });
  const best = Math.max(...scored.map((x) => x.s));
  if (chance(slip)) {
    const worse = scored.filter((x) => x.s < best);
    if (worse.length) return pick(worse).i;
  }
  return pick(scored.filter((x) => x.s === best)).i;
}

export async function playTicTacToe(body: HTMLElement, host: FunHost, opts: FunOpts): Promise<Outcome> {
  const scope = new Scope(body);
  try {
    const f = mountFrame(body, scope, "Tic-tac-toe", "ttt");
    const S = new Session(host, opts, { base: 0.35, step: 0.15, calm: 0.1 });
    const bestOf = chance(0.35) ? 1 : 3;
    const need = bestOf === 1 ? 1 : 2;
    const robotSlip = 0.04 + 0.42 * (1 - S.skill);
    const cpuSlip = 0.18 + Math.random() * 0.3;
    const size = Math.min(f.h - 70, f.w - 120, 262);

    const wrap = document.createElement("div");
    wrap.className = "gm-ttt-wrap";
    wrap.innerHTML = `
      <div class="gm-ttt-side gm-ttt-me"><b>X</b><span>Robot</span></div>
      <div class="gm-ttt-board" style="width:${size}px;height:${size}px">
        <svg viewBox="0 0 300 300" aria-hidden="true">
          <g class="gm-ttt-grid"><path d="M100 14V286M200 14V286M14 100H286M14 200H286"/></g>
          <g class="gm-ttt-marks"></g>
        </svg>
        ${Array.from({ length: 9 }, (_, i) => `<i class="gm-ttt-cell" data-i="${i}" style="left:${(i % 3) * 33.333}%;top:${Math.floor(i / 3) * 33.333}%"></i>`).join("")}
      </div>
      <div class="gm-ttt-side gm-ttt-cpu"><b>O</b><span>CPU</span></div>
      <div class="gm-ttt-foot"><span class="gm-ttt-status"></span><span class="gm-ttt-pips"></span></div>`;
    f.stage.appendChild(wrap);
    const marksG = wrap.querySelector(".gm-ttt-marks") as SVGGElement;
    const cells = [...wrap.querySelectorAll(".gm-ttt-cell")] as HTMLElement[];
    const status = wrap.querySelector(".gm-ttt-status") as HTMLElement;
    const pips = wrap.querySelector(".gm-ttt-pips") as HTMLElement;
    const sideMe = wrap.querySelector(".gm-ttt-me") as HTMLElement;
    const sideCpu = wrap.querySelector(".gm-ttt-cpu") as HTMLElement;

    let me = 0, cpu = 0, round = 0;
    const history: ("w" | "l" | "d")[] = [];
    const setStatus = (s: string) => { status.textContent = s; };
    const renderScore = (bump = false) => {
      f.setScore(bestOf === 1 ? `Robot ${me}   CPU ${cpu}` : `Robot ${me}   CPU ${cpu}   Best of 3`, bump);
      pips.innerHTML = history.map((h) => `<i class="gm-ttt-pip gm-${h}"></i>`).join("");
    };
    const turnTo = (who: "me" | "cpu") => {
      sideMe.classList.toggle("gm-on", who === "me");
      sideCpu.classList.toggle("gm-on", who === "cpu");
    };

    const draw = (d: string, cls: string, dur: number, delay = 0) => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", cls);
      marksG.appendChild(p);
      const len = p.getTotalLength?.() || 300;
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      scope.to(p, { strokeDashoffset: 0, duration: dur, delay, ease: "power2.inOut" });
      return p;
    };
    const center = (i: number) => ({ x: (i % 3) * 100 + 50, y: Math.floor(i / 3) * 100 + 50 });
    const drawMark = async (i: number, m: Mark) => {
      const { x, y } = center(i);
      if (m === "X") {
        const r = 26 + Math.random() * 3, j = () => (Math.random() - 0.5) * 4;
        draw(`M${x - r + j()} ${y - r + j()} L${x + r + j()} ${y + r + j()}`, "gm-ttt-x", 0.2);
        draw(`M${x + r + j()} ${y - r + j()} L${x - r + j()} ${y + r + j()}`, "gm-ttt-x", 0.2, 0.17);
      } else {
        const r = 27, a0 = -Math.PI / 2 + (Math.random() - 0.5);
        const pts: string[] = [];
        for (let k = 0; k <= 40; k++) {
          const a = a0 + (k / 40) * Math.PI * 2.08;
          const rr = r * (1 + (Math.random() - 0.5) * 0.03);
          pts.push(`${k ? "L" : "M"}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`);
        }
        draw(pts.join(" "), "gm-ttt-o", 0.38);
      }
      scope.fromTo(cells[i], { scale: 0.9 }, { scale: 1, duration: 0.35, ease: "back.out(3)" });
      await nap(host, 380);
    };
    const winLine = (l: number[]) => {
      const a = center(l[0]), b = center(l[2]);
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ex = (dx / len) * 34, ey = (dy / len) * 34;
      draw(`M${a.x - ex} ${a.y - ey} L${b.x + ex} ${b.y + ey}`, "gm-ttt-win", 0.45);
    };

    const robotMove = async (b: Mark[]) => {
      turnTo("me");
      setStatus("Robot's move");
      host.react("focus");
      const pickI = choose(b, "X", robotSlip);
      // sometimes hover a different cell first, then change its mind
      if (chance(0.3) && empties(b).length > 2) {
        const other = pick(empties(b).filter((i) => i !== pickI));
        cells[other].classList.add("gm-hot");
        await host.pointAt(cells[other], 0.5, 0.5, 420);
        await nap(host, think(S.skill, 450));
        cells[other].classList.remove("gm-hot");
      } else await nap(host, think(S.skill, 500));
      cells[pickI].classList.add("gm-hot");
      await host.pointAt(cells[pickI], 0.45 + Math.random() * 0.1, 0.45 + Math.random() * 0.1, 460);
      await host.click();
      cells[pickI].classList.remove("gm-hot");
      b[pickI] = "X";
      await drawMark(pickI, "X");
    };
    const cpuMove = async (b: Mark[]) => {
      turnTo("cpu");
      setStatus("CPU is thinking");
      await nap(host, 500 + Math.random() * 700);
      const i = choose(b, "O", cpuSlip);
      b[i] = "O";
      await drawMark(i, "O");
    };

    const clearBoard = async () => {
      const kids = [...marksG.childNodes] as SVGElement[];
      if (kids.length) {
        await new Promise<void>((res) => scope.to(kids, { opacity: 0, scale: 0.85, transformOrigin: "50% 50%", duration: 0.3, stagger: 0.02, ease: "power2.in", onComplete: res }));
      }
      marksG.innerHTML = "";
    };

    renderScore();
    scope.fromTo(wrap.querySelector(".gm-ttt-grid path"), { strokeDasharray: 1200, strokeDashoffset: 1200 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.out" });
    await nap(host, 700);

    while (me < need && cpu < need && round < (bestOf === 1 ? 2 : 5)) {
      round++;
      const b: Mark[] = Array(9).fill("");
      const robotFirst = round % 2 === 1;
      setStatus(bestOf === 1 ? "Quick round" : `Round ${round}`);
      await nap(host, 600);
      let turn: "me" | "cpu" = robotFirst ? "me" : "cpu";
      let w: ReturnType<typeof winner> = null;
      while (!w && empties(b).length) {
        if (turn === "me") await robotMove(b); else await cpuMove(b);
        w = winner(b);
        turn = turn === "me" ? "cpu" : "me";
      }
      sideMe.classList.remove("gm-on"); sideCpu.classList.remove("gm-on");
      if (w) {
        winLine(w.line);
        if (w.m === "X") { me++; history.push("w"); setStatus("Robot takes the round"); host.react("cheer"); }
        else { cpu++; history.push("l"); setStatus("CPU takes the round"); host.react(cpu >= need ? "angry" : "surprised"); }
      } else {
        history.push("d");
        setStatus("Draw");
        host.react("relax");
        // a quick round that ends in a draw gets one rematch
      }
      renderScore(true);
      await nap(host, 1500);
      if (me >= need || cpu >= need) break;
      if (bestOf === 1 && w) break;
      if (S.left < 9000) break;
      // a rough loss early in a series can be enough to quit
      if (w && w.m === "O" && S.skill < 0.5 && chance(0.12)) {
        host.react("angry");
        f.showOver("Nope", `Robot ${me}   CPU ${cpu}`, "bad");
        await nap(host, 900);
        return { result: "ragequit", score: me };
      }
      await clearBoard();
    }

    if (me > cpu) {
      host.react("cheer");
      f.showOver(bestOf === 1 ? "Robot wins" : "Series won", `Robot ${me}   CPU ${cpu}`, "good");
      await nap(host, 2200);
      return { result: "win", score: me };
    }
    if (cpu > me) {
      S.rounds = 2;
      const next = S.afterLoss(0.3);
      f.showOver("CPU wins", `Robot ${me}   CPU ${cpu}`, "bad");
      if (next === "ragequit") { host.react("angry"); await nap(host, 700); return { result: "ragequit", score: me }; }
      host.react("relax");
      await nap(host, 2000);
      return { result: "lose", score: me };
    }
    host.react("laugh");
    f.showOver("Draw", "Nobody blinks", "plain");
    await nap(host, 1800);
    return { result: "done", score: me };
  } catch (e) {
    if (e instanceof Halt) return { result: "done" };
    throw e;
  } finally {
    scope.dispose();
  }
}
