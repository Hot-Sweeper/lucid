// Crossbot: the daily mini crossword. The robot reads a clue, clicks the row, types the answer
// (with the odd wrong letter it then fixes), and beats its own time.
import { CROSSWORDS } from "../content/social";
import { Kit, runApp, rnd, chance, h, calm, type SoHost, type SoOpts } from "./kit";
import "./crossword.css";

export async function solveCrossword(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Crossbot(k, body).session(); });
}

class Crossbot {
  root: HTMLElement;
  cells: HTMLElement[][] = [];
  clueEls: { across: HTMLElement[]; down: HTMLElement[] } = { across: [], down: [] };
  clock!: HTMLElement;
  bar!: HTMLElement;
  t0 = 0;

  constructor(private k: Kit, body: HTMLElement) {
    body.innerHTML = "";
    this.root = h("div", "so-cw");
    body.appendChild(this.root);
  }

  build(p: (typeof CROSSWORDS)[number], n: number) {
    const N = p.grid.length;
    this.n = N;
    this.root.innerHTML = `
      <header class="so-cw-top"><b>Crossbot</b><span>Daily grid · Puzzle ${n}</span><time></time></header>
      <div class="so-cw-bar"><b></b><span></span></div>
      <div class="so-cw-mid"><div class="so-cw-grid" style="grid-template-columns:repeat(${N},1fr);grid-template-rows:repeat(${N},1fr)"></div>
        <div class="so-cw-clues"><h5>Across</h5><ol class="a"></ol><h5>Down</h5><ol class="d"></ol></div></div>`;
    const grid = this.root.querySelector(".so-cw-grid")!;
    this.cells = [];
    for (let r = 0; r < N; r++) {
      const row: HTMLElement[] = [];
      for (let c = 0; c < N; c++) {
        const cell = h("span", "so-cw-cell");
        // standard numbering: the top row starts the downs, the left column starts the acrosses
        const num = r === 0 ? c + 1 : c === 0 ? N + r : 0;
        cell.innerHTML = `${num ? `<small>${num}</small>` : ""}<b></b>`;
        grid.appendChild(cell);
        row.push(cell);
      }
      this.cells.push(row);
    }
    const fill = (ol: HTMLElement, clues: string[], into: HTMLElement[]) => clues.forEach((t, i) => { const li = h("li"); li.innerHTML = `<b>${into === this.clueEls.across ? this.num("across", i) : this.num("down", i)}</b><span></span>`; li.querySelector("span")!.textContent = t; ol.appendChild(li); into.push(li); });
    this.clueEls = { across: [], down: [] };
    fill(this.root.querySelector("ol.a")!, p.across, this.clueEls.across);
    fill(this.root.querySelector("ol.d")!, p.down, this.clueEls.down);
    this.clock = this.root.querySelector(".so-cw-top time")!;
    this.bar = this.root.querySelector(".so-cw-bar")!;
    this.t0 = performance.now();
    let last = -1;
    this.k.every((now) => {
      const s = Math.floor((now - this.t0) / 1000);
      if (s === last) return;
      last = s;
      this.clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    });
  }

  n = 4;
  num(dir: "across" | "down", i: number) { return dir === "down" || i === 0 ? i + 1 : this.n + i; }

  focus(dir: "across" | "down", i: number, at = 0) {
    this.cells.flat().forEach((c) => c.classList.remove("word", "cur"));
    const word = this.cells.map((row, r) => (dir === "across" ? this.cells[i][r] : row[i]));
    word.forEach((c) => c.classList.add("word"));
    word[at]?.classList.add("cur");
    [...this.clueEls.across, ...this.clueEls.down].forEach((li) => li.classList.remove("on"));
    this.clueEls[dir][i].classList.add("on");
    this.bar.querySelector("b")!.textContent = `${this.num(dir, i)}${dir === "across" ? "A" : "D"}`;
    this.bar.querySelector("span")!.textContent = this.clueEls[dir][i].querySelector("span")!.textContent;
    return word;
  }

  async type(cell: HTMLElement, ch: string) {
    this.k.tap(ch.toLowerCase());
    const b = cell.querySelector("b")!;
    b.textContent = ch;
    if (!calm()) this.k.fromTo(b, { scale: 1.4 }, { scale: 1, duration: 0.2, ease: "back.out(3)" });
    await this.k.sleep(rnd(150, 320));
  }

  async solve(p: (typeof CROSSWORDS)[number], n: number) {
    this.build(p, n);
    if (!calm()) this.k.from(this.root.querySelectorAll(".so-cw-cell"), { scale: 0.7, opacity: 0, duration: 0.3, stagger: 0.02, ease: "back.out(2)" });
    await this.k.sleep(rnd(1200, 2000));
    const N = p.grid.length;
    // mostly across, sometimes the robot works a down clue instead
    const order: ["across" | "down", number][] = Array.from({ length: N }, (_, i) => [chance(0.3) ? "down" : "across", i]);
    for (const [dir, i] of order) {
      const answer = dir === "across" ? p.grid[i] : p.grid.map((row) => row[i]).join("");
      const word = this.focus(dir, i);
      if (word.every((c, j) => c.querySelector("b")!.textContent === answer[j])) continue;
      await this.k.click(this.clueEls[dir][i], 0.3, 0.5, 420);
      this.focus(dir, i);
      this.k.host.react("focus");
      await this.k.sleep(800 + this.clueEls[dir][i].textContent!.length * rnd(40, 70));
      await this.k.click(word[0], 0.5, 0.5, 360);
      for (let j = 0; j < answer.length; j++) {
        word.forEach((c, x) => c.classList.toggle("cur", x === j));
        if (word[j].querySelector("b")!.textContent === answer[j]) { await this.k.sleep(120); continue; }
        if (chance(0.08)) {
          const wrong = "AEIOURST".replace(answer[j], "")[Math.floor(Math.random() * 7)];
          await this.type(word[j], wrong);
          await this.k.sleep(rnd(500, 900));
          this.k.tap("Backspace");
          word[j].querySelector("b")!.textContent = "";
          await this.k.sleep(rnd(200, 400));
        }
        await this.type(word[j], answer[j]);
      }
      this.clueEls[dir][i].classList.add("done");
      await this.k.sleep(rnd(400, 900));
    }
    // a word square: the downs read the same, so the grid is full now
    this.cells.flat().forEach((c) => c.classList.remove("word", "cur"));
    [...this.clueEls.across, ...this.clueEls.down].forEach((li) => { li.classList.remove("on"); li.classList.add("done"); });
    const secs = Math.floor((performance.now() - this.t0) / 1000);
    this.root.classList.add("solved");
    if (!calm()) this.k.fromTo(this.root.querySelectorAll(".so-cw-cell"), { backgroundColor: "#fff" }, { backgroundColor: "#ffe08a", duration: 0.25, stagger: 0.04, yoyo: true, repeat: 1 });
    const ban = h("div", "so-cw-win", `<b>You solved it!</b><span>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} · a new personal best</span>`);
    this.root.appendChild(ban);
    if (!calm()) this.k.fromTo(ban, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)" });
    this.k.host.react("cheer");
    await this.k.sleep(3200);
  }

  async session() {
    const start = Math.floor(Math.random() * CROSSWORDS.length);
    for (let i = 0; i < CROSSWORDS.length && this.k.left > 15000; i++) await this.solve(CROSSWORDS[(start + i) % CROSSWORDS.length], 100 + ((start + i) % CROSSWORDS.length) * 7 + new Date().getDate());
    if (this.k.left > 2000) await this.k.sleep(Math.min(3000, this.k.left - 500));
  }
}
