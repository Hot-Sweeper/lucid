// Solitaire: a real Klondike deal, played by a robot that follows simple rules (foundations
// first, free hidden cards, then draw). Sometimes it wins and the cards bloom into a flower, sometimes it
// runs out of moves and deals again.
import { Kit, runApp, rnd, shuffle, h, calm, type SoHost, type SoOpts } from "./kit";
import "./solitaire.css";

type Card = { r: number; s: number; up: boolean; el: HTMLElement };
const SUITS = ["S", "H", "D", "C"];
const RED = (c: Card) => c.s === 1 || c.s === 2;
const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const PIP: Record<string, string> = {
  S: `<path d="M12 2.5c3.3 4.1 8.5 7.1 8.5 11.1 0 2.6-2 4.4-4.3 4.4-1.4 0-2.6-.6-3.3-1.6.2 2.2 1 3.7 2.4 5.1H8.7c1.4-1.4 2.2-2.9 2.4-5.1-.7 1-1.9 1.6-3.3 1.6-2.3 0-4.3-1.8-4.3-4.4 0-4 5.2-7 8.5-11.1Z"/>`,
  H: `<path d="M12 21.2C6.6 16.8 2.5 13.4 2.5 9.1c0-3 2.3-5.3 5.1-5.3 1.8 0 3.4.9 4.4 2.4 1-1.5 2.6-2.4 4.4-2.4 2.8 0 5.1 2.3 5.1 5.3 0 4.3-4.1 7.7-9.5 12.1Z"/>`,
  D: `<path d="M12 2 19.5 12 12 22 4.5 12Z"/>`,
  C: `<path d="M12 2.5a4.3 4.3 0 0 1 3.8 6.3 4.3 4.3 0 1 1-2.6 7.6c.2 2 1 3.4 2.3 4.6H8.5c1.3-1.2 2.1-2.6 2.3-4.6a4.3 4.3 0 1 1-2.6-7.6A4.3 4.3 0 0 1 12 2.5Z"/>`,
};

export async function playSolitaire(body: HTMLElement, host: SoHost, opts: SoOpts) {
  return runApp(body, host, opts, async (k) => { await new Klondike(k, body).session(); });
}

class Klondike {
  root: HTMLElement;
  board!: HTMLElement;
  stock: Card[] = [];
  waste: Card[] = [];
  found: Card[][] = [[], [], [], []];
  tab: Card[][] = [];
  slots!: { stock: HTMLElement; waste: HTMLElement; found: HTMLElement[]; tab: HTMLElement[] };
  cw = 52; ch = 72; gap = 12; top = 10; fanUp = 15; fanDown = 6;
  moves = 0;
  score!: HTMLElement;

  constructor(private k: Kit, body: HTMLElement) {
    body.innerHTML = "";
    this.root = h("div", "so-sol");
    body.appendChild(this.root);
  }

  deal() {
    this.root.innerHTML = `<header class="so-sol-top"><b>Solitaire</b><span>Klondike · Draw 1</span><span class="so-sol-score"></span></header><div class="so-sol-board"></div>`;
    this.board = this.root.querySelector(".so-sol-board")!;
    this.score = this.root.querySelector(".so-sol-score")!;
    const W = this.board.clientWidth || 600, H = this.board.clientHeight || 330;
    this.cw = Math.min(56, Math.floor((W - 8 * 10) / 7));
    this.ch = Math.round(this.cw * 1.4);
    this.gap = Math.floor((W - 7 * this.cw) / 8);
    this.fanUp = Math.max(11, Math.min(16, Math.floor((H - this.ch * 2 - 30) / 12)));
    const slot = (x: number, y: number, cls = "") => { const e = h("span", `so-sol-slot ${cls}`); e.style.cssText = `left:${x}px;top:${y}px;width:${this.cw}px;height:${this.ch}px`; this.board.appendChild(e); return e; };
    const col = (i: number) => this.gap + i * (this.cw + this.gap);
    this.slots = { stock: slot(col(0), this.top, "stock"), waste: slot(col(1), this.top, "waste"), found: [3, 4, 5, 6].map((i) => slot(col(i), this.top, "found")), tab: [0, 1, 2, 3, 4, 5, 6].map((i) => slot(col(i), this.top + this.ch + 14)) };
    const deck: Card[] = shuffle(Array.from({ length: 52 }, (_, i) => ({ r: (i % 13) + 1, s: Math.floor(i / 13), up: false, el: null as unknown as HTMLElement })));
    for (const c of deck) {
      c.el = h("div", `so-sol-card ${RED(c) ? "red" : ""}`);
      c.el.style.width = `${this.cw}px`; c.el.style.height = `${this.ch}px`;
      c.el.innerHTML = `<i class="f"><b>${RANK[c.r]}</b><svg viewBox="0 0 24 24" class="s">${PIP[SUITS[c.s]]}</svg><svg viewBox="0 0 24 24" class="big">${PIP[SUITS[c.s]]}</svg></i><i class="b"></i>`;
      this.board.appendChild(c.el);
    }
    this.tab = [[], [], [], [], [], [], []];
    let n = 0;
    for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) { const c = deck[n++]; this.tab[j].push(c); }
    this.tab.forEach((t) => (t[t.length - 1].up = true));
    this.stock = deck.slice(n);
    this.waste = [];
    this.found = [[], [], [], []];
    this.moves = 0;
    this.layout(false);
    if (!calm()) {
      // deal animation: everything flies out from the stock pile
      const s = this.slots.stock;
      this.tab.flat().forEach((c, i) => this.k.from(c.el, { left: s.offsetLeft, top: s.offsetTop, duration: 0.35, delay: i * 0.025, ease: "power2.out" }));
    }
  }

  pos(c: Card): { x: number; y: number; z: number } {
    const at = (e: HTMLElement) => ({ x: e.offsetLeft, y: e.offsetTop });
    let i = this.stock.indexOf(c);
    if (i >= 0) return { ...at(this.slots.stock), z: i };
    i = this.waste.indexOf(c);
    if (i >= 0) { const p = at(this.slots.waste); const vis = Math.max(0, i - (this.waste.length - 3)); return { x: p.x + vis * 10, y: p.y, z: 60 + i }; }
    for (let f = 0; f < 4; f++) { i = this.found[f].indexOf(c); if (i >= 0) return { ...at(this.slots.found[f]), z: 120 + i }; }
    for (let t = 0; t < 7; t++) {
      i = this.tab[t].indexOf(c);
      if (i >= 0) { const p = at(this.slots.tab[t]); let y = p.y; for (let j = 0; j < i; j++) y += this.tab[t][j].up ? this.fanUp : this.fanDown; return { x: p.x, y, z: 200 + t * 30 + i }; }
    }
    return { x: 0, y: 0, z: 0 };
  }

  layout(animate: boolean, moving: Card[] = []) {
    for (const c of [...this.stock, ...this.waste, ...this.found.flat(), ...this.tab.flat()]) {
      const p = this.pos(c);
      c.el.classList.toggle("up", c.up);
      const lift = moving.includes(c) ? 900 : 0;
      c.el.style.zIndex = String(p.z + lift);
      if (animate && !calm() && (moving.includes(c) || Math.abs(c.el.offsetLeft - p.x) + Math.abs(c.el.offsetTop - p.y) > 1)) {
        this.k.to(c.el, { left: p.x, top: p.y, duration: 0.32, ease: "power2.out", onComplete: () => { c.el.style.zIndex = String(p.z); } });
      } else { c.el.style.left = `${p.x}px`; c.el.style.top = `${p.y}px`; c.el.style.zIndex = String(p.z); }
    }
    this.score.textContent = `Moves ${this.moves}  ·  ${this.found.reduce((a, f) => a + f.length, 0)} / 52`;
  }

  canFound(c: Card) { const f = this.found[c.s]; return f.length ? f[f.length - 1].r === c.r - 1 : c.r === 1; }
  canStack(c: Card, t: number) { const col = this.tab[t]; if (!col.length) return c.r === 13; const top = col[col.length - 1]; return top.up && RED(top) !== RED(c) && top.r === c.r + 1; }

  /** The next move a sensible robot makes, or null. */
  next(): (() => Promise<void>) | null {
    const tops = this.tab.map((t) => t[t.length - 1]);
    // 1. aces and next cards to the foundations
    const w = this.waste[this.waste.length - 1];
    if (w && this.canFound(w)) return () => this.move([w], "found", w.s);
    for (let t = 0; t < 7; t++) { const c = tops[t]; if (c && c.up && this.canFound(c)) return () => this.move([c], "found", c.s); }
    // 2. move a face-up run if it frees a hidden card (or a king to an empty column)
    for (let t = 0; t < 7; t++) {
      const col = this.tab[t];
      const first = col.findIndex((c) => c.up);
      if (first < 0) continue;
      const base = col[first];
      if (first === 0) continue;
      for (let d = 0; d < 7; d++) if (d !== t && this.canStack(base, d)) return () => this.move(col.slice(first), "tab", d);
    }
    // 3. the waste card onto the tableau
    if (w) for (let d = 0; d < 7; d++) if (this.canStack(w, d)) return () => this.move([w], "tab", d);
    return null;
  }

  async move(cards: Card[], to: "found" | "tab", i: number) {
    const src = cards[0];
    await this.k.click(src.el, 0.5, 0.25, 420);
    for (const c of cards) {
      const from = this.waste.includes(c) ? this.waste : this.tab.find((t) => t.includes(c))!;
      from.splice(from.indexOf(c), 1);
    }
    (to === "found" ? this.found[i] : this.tab[i]).push(...cards);
    const dest = this.pos(src);
    const target = { x: dest.x + this.cw / 2, y: dest.y + this.ch * 0.25 };
    this.moves++;
    this.layout(true, cards);
    await this.k.point(this.board, target.x / (this.board.clientWidth || 1), target.y / (this.board.clientHeight || 1), 420);
    // flip the newly freed card
    for (const t of this.tab) { const top = t[t.length - 1]; if (top && !top.up) { await this.k.sleep(150); await this.k.click(top.el, 0.5, 0.3, 260); top.up = true; if (!calm()) this.k.fromTo(top.el, { scaleX: 0 }, { scaleX: 1, duration: 0.2 }); this.layout(true); } }
    await this.k.sleep(rnd(250, 700));
  }

  async draw() {
    if (!this.stock.length) {
      await this.k.click(this.slots.stock);
      this.stock = this.waste.reverse().map((c) => ((c.up = false), c));
      this.waste = [];
      this.layout(true);
      return;
    }
    const c = this.stock[this.stock.length - 1];
    await this.k.click(c.el, 0.5, 0.5, 380);
    this.stock.pop();
    c.up = true;
    this.waste.push(c);
    this.moves++;
    this.layout(true, [c]);
    await this.k.sleep(rnd(350, 750));
  }

  // Win: every card flies to the middle and opens into a spinning flower, then fades.
  async bloom() {
    this.k.host.react("cheer");
    if (calm()) { await this.k.sleep(2500); return; }
    const x = (this.board.clientWidth - this.cw) / 2, y = this.board.clientHeight * 0.42 - this.ch / 2;
    const cards = this.found.flatMap((f) => [...f].reverse());
    cards.forEach((c, i) => {
      const a = (i / cards.length) * 360;
      c.el.style.zIndex = String(1000 + i);
      this.k.tl({ delay: i * 0.025 })
        .to(c.el, { left: x, top: y, rotation: a, transformOrigin: "50% 115%", duration: 0.6, ease: "power3.out" }, 0)
        .to(c.el, { rotation: a + 120, duration: 1.6, ease: "sine.inOut" }, 0.6)
        .to(c.el, { opacity: 0, scale: 0.7, duration: 0.4, ease: "sine.in" }, 2);
    });
    await this.k.sleep(3800);
  }

  async game() {
    this.deal();
    await this.k.sleep(rnd(1200, 1800));
    let idle = 0, passes = 0;
    while (this.k.left > 3000) {
      if (this.found.every((f) => f.length === 13)) { await this.bloom(); return true; }
      const m = this.next();
      if (m) { await m(); idle = 0; continue; }
      if (!this.stock.length) { passes++; if (passes > 2 || idle > 30) break; }
      await this.draw();
      idle++;
    }
    if (this.k.left > 3000) {
      const msg = h("div", "so-sol-msg", "No more moves");
      this.board.appendChild(msg);
      this.k.host.react(Math.random() < 0.5 ? "angry" : "shy");
      await this.k.sleep(2200);
    }
    return false;
  }

  async session() {
    while (this.k.left > 15000) await this.game();
  }
}
