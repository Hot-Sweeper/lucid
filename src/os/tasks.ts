import gsap from "gsap";
import { presentationFrame, renderFps } from "../perf/render";
import { WM, Cancelled } from "./wm";
import "./tasks.css";

// The robot's Tasks app. Whenever the thread rewrites its to-do list, the robot opens this
// window and plays the change by hand: new steps get typed in, finished ones get checked
// off, and on the board flavor cards are dragged from column to column with the cursor.

export type TaskStep = { text: string; status: string };
type Col = "todo" | "doing" | "done";
type Card = { key: string; text: string; col: Col; el: HTMLElement };
type Flavor = "board" | "checklist";

const COLS: { id: Col; name: string }[] = [
  { id: "todo", name: "To do" },
  { id: "doing", name: "Doing" },
  { id: "done", name: "Done" },
];
const MAX_TYPED = 2;   // new steps typed by hand per update; the rest pop in
const MAX_HANDS = 2;   // status changes done with the cursor per update; the rest slide over

const TICK = `<svg class="tk-tick" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.8 6.4 5.1 8.6 9.3 3.8"/></svg>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Codex says pending / inProgress / completed, Claude pending / in_progress / completed.
export function colOf(status: string): Col {
  const s = (status || "").toLowerCase();
  if (/complete|done|finish|success/.test(s)) return "done";
  if (/progress|running|active|doing|start/.test(s)) return "doing";
  return "todo";
}

export class TasksApp {
  private cards: Card[] = [];
  private seq = 0;
  private order = new Map<string, number>();

  constructor(private wm: WM) {}

  get flavor(): "board" | "checklist" | "sticky" {
    return this.wm.prefs?.tasks ?? "board";
  }

  reset() {
    this.cards = [];
    this.order.clear();
    this.queued = [];
  }

  // --- your queued messages ------------------------------------------------------
  private queued: { id: string; text: string }[] = [];

  /** Write the queue down, or play the change by hand: new messages typed in, reordered rows
   *  dragged, edited ones retyped, removed or sent ones crossed off. */
  async syncQueue(list: { id: string; text: string }[], opts: { instant?: boolean; title?: string } = {}) {
    const flavor = this.flavor;
    if (flavor === "sticky") return;
    const wm = this.wm, e = wm.epoch;
    const next = list.map((q) => ({ id: q.id, text: q.text || "(attachment)" }));
    if (!next.length && !this.queued.length) return;
    const w = await wm.open("tasks");
    let root = w.body.querySelector(".tk") as HTMLElement | null;
    if (!root || root.dataset.flavor !== flavor) {
      root = this.build(w.body, flavor as Flavor);
      this.renderAll(root, this.cards.map((c) => ({ text: c.text, col: c.col })));
      const name = root.querySelector(".tk-name") as HTMLElement;
      name.textContent = name.title = opts.title || "Plan";
    }
    let box = root.querySelector(".tk-q") as HTMLElement | null, fresh = false;
    if (!box) {
      box = document.createElement("section");
      box.className = "tk-q";
      box.innerHTML = `<h4>From you <b></b></h4><ol class="tk-q-list"></ol>`;
      root.appendChild(box);
      fresh = true;
    }
    const ol = box.querySelector(".tk-q-list") as HTMLElement;
    const rowOf = (id: string) => ol.querySelector(`[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    const mk = (q: { id: string; text: string }) => {
      const li = document.createElement("li");
      li.className = "tk-q-row";
      li.dataset.id = q.id;
      li.innerHTML = `<span class="tk-q-t"></span>`;
      (li.firstElementChild as HTMLElement).textContent = q.text;
      li.title = q.text;
      return li;
    };
    // a reopened window shows the list as it was, then the change plays
    if (fresh && this.queued.length) ol.replaceChildren(...this.queued.map(mk));
    const count = () => { (box!.querySelector("h4 b") as HTMLElement).textContent = String(next.length); box!.classList.toggle("empty", !next.length); };
    if (opts.instant) {
      ol.replaceChildren(...next.map(mk));
      this.queued = next;
      count();
      await wm.sleep(200, e);
      return;
    }
    const was = new Map(this.queued.map((q) => [q.id, q.text]));
    const now = new Set(next.map((q) => q.id));
    // gone: crossed off (sent to the robot or removed by you), then the row folds away
    for (const q of this.queued) {
      if (now.has(q.id)) continue;
      const li = rowOf(q.id);
      if (!li) continue;
      await wm.pointAt(li, 0.08, 0.5, 300);
      await wm.click();
      li.classList.add("gone");
      await wm.sleep(320, e);
      gsap.to(li, { height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0, marginBottom: 0, duration: 0.3, ease: "power2.in", onComplete: () => li.remove() });
      await wm.sleep(260, e);
    }
    // reordered: rows slide to their new places, the moved one carried by the cursor
    const before = new Map([...ol.children].map((c) => [(c as HTMLElement).dataset.id!, (c as HTMLElement).getBoundingClientRect().top]));
    const keepOrder = next.filter((q) => was.has(q.id)).map((q) => q.id);
    const curOrder = this.queued.filter((q) => now.has(q.id)).map((q) => q.id);
    if (keepOrder.join() !== curOrder.join()) {
      const moved = keepOrder.find((id, i) => curOrder[i] !== id);
      const movedEl = moved ? rowOf(moved) : null;
      if (movedEl) { await wm.pointAt(movedEl, 0.5, 0.5, 300); movedEl.classList.add("lift"); }
      for (const id of keepOrder) { const li = rowOf(id); if (li) ol.appendChild(li); }
      const s = ol.closest(".tk")!.getBoundingClientRect().height ? (ol.offsetHeight ? ol.getBoundingClientRect().height / ol.offsetHeight : 1) : 1;
      for (const id of keepOrder) {
        const li = rowOf(id), b = before.get(id);
        if (!li || b == null) continue;
        const dy = (b - li.getBoundingClientRect().top) / (s || 1);
        if (Math.abs(dy) > 0.5) gsap.fromTo(li, { y: dy }, { y: 0, duration: 0.45, ease: "power2.inOut" });
      }
      if (movedEl) { await wm.pointAt(movedEl, 0.5, 0.5, 450); await wm.sleep(150, e); movedEl.classList.remove("lift"); }
    }
    // edited: the old text is selected and the new text typed over it
    for (const q of next) {
      const old = was.get(q.id);
      if (old == null || old === q.text) continue;
      const li = rowOf(q.id);
      if (!li) continue;
      await this.typeQueued(li, q.text, true);
    }
    // new: typed in at its place in the line
    for (let i = 0; i < next.length; i++) {
      const q = next[i];
      if (was.has(q.id)) continue;
      const li = mk({ id: q.id, text: "" });
      const after = i > 0 ? rowOf(next[i - 1].id) : null;
      if (after) after.after(li); else ol.prepend(li);
      gsap.from(li, { height: 0, opacity: 0, duration: 0.25, ease: "power2.out" });
      await this.typeQueued(li, q.text, false);
    }
    this.queued = next;
    count();
    await wm.sleep(250, e);
  }

  private async typeQueued(li: HTMLElement, text: string, replace: boolean) {
    const wm = this.wm, e = wm.epoch;
    const t = li.querySelector(".tk-q-t") as HTMLElement;
    await wm.pointAt(li, 0.4, 0.5, 280);
    await wm.click(replace);
    if (replace) { li.classList.add("sel"); await wm.sleep(260, e); li.classList.remove("sel"); }
    li.classList.add("compose");
    t.textContent = "";
    li.title = text;
    // long messages: the first words typed by hand, the rest pops in
    const typed = text.slice(0, 46);
    wm.robot.setTyping(true);
    try {
      for (const ch of typed) {
        t.textContent += ch;
        wm.robot.pressKey(ch);
        await wm.sleep(28 + Math.random() * 40, e);
      }
    } finally { wm.robot.setTyping(false); }
    t.textContent = text;
    wm.robot.pressKey("Enter");
    li.classList.remove("compose");
    await wm.sleep(160, e);
  }

  // Open (or focus) the app and play the difference to the new list.
  async show(steps: TaskStep[], opts: { instant?: boolean; title?: string } = {}) {
    const flavor = this.flavor;
    if (flavor === "sticky") return;
    const next = steps
      .map((s) => ({ text: String(s.text || "").replace(/\s+/g, " ").trim(), col: colOf(s.status) }))
      .filter((s) => s.text);
    if (!next.length && !this.cards.length) return;
    const wm = this.wm;
    wm.frameHint.tasks = flavor === "checklist" ? { x: 452, y: 16, w: 340, h: 382 } : undefined;
    const w = await wm.open("tasks");
    let root = w.body.querySelector(".tk") as HTMLElement | null;
    if (!root || root.dataset.flavor !== flavor) {
      root = this.build(w.body, flavor);
      // The window was closed (or is new): it shows the list as it was, then the change plays.
      this.renderAll(root, this.cards.map((c) => ({ text: c.text, col: c.col })));
    }
    const name = root.querySelector(".tk-name") as HTMLElement;
    const title = opts.title || "Plan";
    if (name.textContent !== title) { name.textContent = title; name.title = title; }
    if (opts.instant) {
      this.renderAll(root, next);
      await wm.sleep(350);
      return;
    }
    try {
      await this.play(root, flavor as Flavor, next);
    } catch (err) {
      if (err instanceof Cancelled) throw err;
      console.error("tasks scene failed", err);
      this.renderAll(root, next);
    }
  }

  // ---------------------------------------------------------------------------
  private build(body: HTMLElement, flavor: Flavor) {
    body.innerHTML = flavor === "board"
      ? `<div class="tk tk-board" data-flavor="board">
          <header class="tk-head"><h3 class="tk-name"></h3><span class="tk-count"></span><div class="tk-bar"><i></i></div></header>
          <div class="tk-cols">${COLS.map((c) => `
            <section class="tk-col" data-col="${c.id}">
              <h4>${c.name}<b>0</b></h4>
              <div class="tk-list"></div>
              <div class="tk-add">+ Add card</div>
            </section>`).join("")}
          </div>
          <div class="tk-drag"></div>
        </div>`
      : `<div class="tk tk-check" data-flavor="checklist">
          <header class="tk-head"><h3 class="tk-name"></h3><span class="tk-count"></span><div class="tk-bar"><i></i></div></header>
          <div class="ck-list"><div class="ck-hl"></div></div>
          <div class="ck-add"><span class="ck-plus" aria-hidden="true"></span><span class="ck-q">Add a task</span></div>
        </div>`;
    return body.querySelector(".tk") as HTMLElement;
  }

  private makeCard(root: HTMLElement, text: string, col: Col): Card {
    const key = `k${++this.seq}`;
    const board = root.dataset.flavor === "board";
    const el = document.createElement("div");
    el.className = board ? "tk-card" : "ck-row";
    el.dataset.key = key;
    el.innerHTML = board
      ? `<span class="tk-t"></span><span class="tk-ok">${TICK}</span>`
      : `<span class="ck-box">${TICK}</span><span class="ck-t"><span class="ck-txt"></span></span>`;
    this.setText(el, text);
    this.paint(el, col);
    return { key, text, col, el };
  }

  private setText(el: HTMLElement, text: string) {
    const t = el.querySelector(".tk-t, .ck-txt") as HTMLElement;
    t.textContent = text;
    el.title = text;
  }

  // Static look of a card or row for its column (no animation).
  private paint(el: HTMLElement, col: Col) {
    el.dataset.col = col;
    el.classList.toggle("done", col === "done");
    el.classList.toggle("doing", col === "doing");
    const path = el.querySelector(".tk-tick path") as SVGPathElement | null;
    if (path) gsap.set(path, { strokeDashoffset: col === "done" ? 0 : 12 });
    const ok = el.querySelector(".tk-ok") as HTMLElement | null;
    if (ok) gsap.set(ok, { scale: col === "done" ? 1 : 0 });
    const txt = el.querySelector(".ck-txt") as HTMLElement | null;
    if (txt) gsap.set(txt, { backgroundSize: col === "done" ? "100% 1.5px" : "0% 1.5px" });
  }

  private listFor(root: HTMLElement, col: Col) {
    return root.dataset.flavor === "board"
      ? root.querySelector(`.tk-col[data-col="${col}"] .tk-list`) as HTMLElement
      : root.querySelector(".ck-list") as HTMLElement;
  }

  // Put an element where it belongs in step order among what is already in the list.
  private insertAt(list: HTMLElement, el: HTMLElement, idx: number) {
    const before = Array.from(list.children).find((c) => {
      const k = (c as HTMLElement).dataset.key;
      return c !== el && k && (this.order.get(k) ?? 1e9) > idx;
    });
    list.insertBefore(el, before ?? null);
  }

  // Keep an element in view inside its scrolling list, without scrolling the office.
  private reveal(list: HTMLElement, el: HTMLElement) {
    const top = el.offsetTop, bottom = top + el.offsetHeight;
    if (top < list.scrollTop + 4) list.scrollTop = Math.max(0, top - 8);
    else if (bottom > list.scrollTop + list.clientHeight - 4) list.scrollTop = bottom - list.clientHeight + 8;
  }

  private renderAll(root: HTMLElement, steps: { text: string; col: Col }[]) {
    for (const c of this.cards) c.el.remove();
    this.cards = steps.map((s) => this.makeCard(root, s.text, s.col));
    this.order = new Map(this.cards.map((c, i) => [c.key, i]));
    for (const c of this.cards) this.listFor(root, c.col).appendChild(c.el);
    this.meta(root, false);
    this.highlight(root, false);
  }

  // Counts, the progress bar and (for the checklist) where the current item sits.
  private meta(root: HTMLElement, animate = true) {
    const total = this.cards.length, done = this.cards.filter((c) => c.col === "done").length;
    const board = root.dataset.flavor === "board";
    (root.querySelector(".tk-count") as HTMLElement).textContent = board ? `${done}/${total}` : `${done} of ${total} done`;
    const bar = root.querySelector(".tk-bar i") as HTMLElement;
    const pct = total ? (done / total) * 100 : 0;
    if (animate) gsap.to(bar, { width: `${pct}%`, duration: 0.5 / this.wm.speed, ease: "power2.out" });
    else gsap.set(bar, { width: `${pct}%` });
    if (board) for (const c of COLS) {
      const b = root.querySelector(`.tk-col[data-col="${c.id}"] h4 b`) as HTMLElement;
      b.textContent = String(this.cards.filter((x) => x.col === c.id).length);
    }
  }

  private highlight(root: HTMLElement, animate = true) {
    const hl = root.querySelector(".ck-hl") as HTMLElement | null;
    if (!hl) return;
    const cur = this.cards.find((c) => c.col === "doing" && c.el.isConnected);
    const d = animate ? 0.4 / this.wm.speed : 0;
    if (!cur) { gsap.to(hl, { opacity: 0, duration: d }); return; }
    gsap.to(hl, { y: cur.el.offsetTop, height: cur.el.offsetHeight, opacity: 1, duration: d, ease: "power3.out" });
  }

  // Slide elements from where they were to where layout put them.
  private flip(els: HTMLElement[], mutate: () => void, ease = "power3.out") {
    const before = new Map(els.map((el) => [el, this.wm.pos(el, 0, 0)]));
    mutate();
    for (const el of els) {
      const a = before.get(el)!, b = this.wm.pos(el, 0, 0);
      const dx = a.x - b.x, dy = a.y - b.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) gsap.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.45 / this.wm.speed, ease, clearProps: "transform" });
    }
  }

  // ---------------------------------------------------------------------------
  private async play(root: HTMLElement, flavor: Flavor, next: { text: string; col: Col }[]) {
    const wm = this.wm, e = wm.epoch;
    const prev = this.cards;
    // Match old cards to new steps by text; a step reworded in place keeps its card.
    const used = new Set<Card>();
    const match: (Card | null)[] = next.map((n) => {
      const c = prev.find((p) => !used.has(p) && p.text === n.text) ?? null;
      if (c) used.add(c);
      return c;
    });
    const texts = new Set(next.map((n) => n.text));
    const renamed: Card[] = [];
    next.forEach((n, i) => {
      const p = prev[i];
      if (match[i] || !p || used.has(p) || texts.has(p.text)) return;
      used.add(p); match[i] = p; renamed.push(p);
    });
    const removed = prev.filter((p) => !used.has(p));
    const fresh = next.map((n, i) => match[i] ?? this.makeCard(root, n.text, n.col));
    this.order = new Map(fresh.map((c, i) => [c.key, i]));

    let touched = false;
    // 1. Steps that left the plan fold away.
    if (removed.length) {
      touched = true;
      for (const c of removed) gsap.to(c.el, { height: 0, opacity: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.28 / wm.speed, ease: "power2.in", onComplete: () => c.el.remove() });
      this.cards = this.cards.filter((c) => !removed.includes(c));
      await wm.sleep(300, e);
      this.meta(root);
    }
    // 2. Reworded steps get their new text.
    for (const c of renamed) {
      const i = fresh.indexOf(c);
      c.text = next[i].text;
      this.setText(c.el, c.text);
      gsap.fromTo(c.el.querySelector(".tk-t, .ck-txt"), { opacity: 0.2 }, { opacity: 1, duration: 0.35 / wm.speed });
      touched = true;
    }
    // 3. New steps: the first few typed in by hand, the rest pop in right after.
    let typed = 0;
    for (let i = 0; i < fresh.length; i++) {
      const c = fresh[i];
      if (match[i]) continue;
      touched = true;
      this.cards.push(c);
      if (typed < MAX_TYPED) {
        typed++;
        await (flavor === "board" ? this.typeCard(root, c) : this.typeRow(root, c));
      } else {
        const list = this.listFor(root, c.col);
        this.insertAt(list, c.el, i);
        gsap.fromTo(c.el, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.35 / wm.speed, ease: "back.out(2)", clearProps: "transform" });
        await wm.sleep(70, e);
      }
      this.meta(root);
    }
    // 4. Status changes: finished first, then whatever got started.
    const rank: Record<Col, number> = { done: 0, doing: 1, todo: 2 };
    const moves = fresh
      .map((c, i) => ({ c, to: next[i].col, i }))
      .filter((m) => match[m.i] && m.c.col !== m.to)
      .sort((a, b) => rank[a.to] - rank[b.to] || a.i - b.i);
    let hands = 0;
    for (const m of moves) {
      touched = true;
      const byHand = hands < MAX_HANDS;
      if (byHand) hands++;
      if (flavor === "board") await this.moveCard(root, m.c, m.to, m.i, byHand);
      else await this.markRow(root, m.c, m.to, byHand);
      this.meta(root);
      if (!byHand) await wm.sleep(90, e);
    }
    // 5. Settle into plan order.
    this.cards = fresh;
    const lists = flavor === "board" ? COLS.map((c) => this.listFor(root, c.id)) : [this.listFor(root, "todo")];
    const stray = lists.flatMap((l) => {
      const els = Array.from(l.children).filter((x) => (x as HTMLElement).dataset.key) as HTMLElement[];
      const want = [...els].sort((a, b) => this.order.get(a.dataset.key!)! - this.order.get(b.dataset.key!)!);
      return want.some((x, i) => x !== els[i]) ? [{ l, want }] : [];
    });
    if (stray.length) {
      this.flip(stray.flatMap((s) => s.want), () => { for (const s of stray) for (const el of s.want) s.l.appendChild(el); });
      touched = true;
    }
    this.meta(root);
    this.highlight(root);
    if (!touched) { wm.touch("tasks"); await wm.sleep(250, e); return; }
    // A short look at the result before getting back to work.
    wm.robot.setPose("read");
    await wm.sleep(550, e);
  }

  // ---------------------------------------------------------------------------
  private async type(target: HTMLElement, text: string, budgetMs: number) {
    const wm = this.wm, e = wm.epoch;
    const cps = Math.max(26, text.length / (budgetMs / 1000));
    wm.robot.setTyping(true);
    let shown = 0;
    const start = performance.now();
    try {
      while (shown < text.length) {
        await presentationFrame(target);
        wm.check(e);
        const want = Math.floor(((performance.now() - start) * wm.speed / 1000) * cps * (0.85 + Math.random() * 0.3));
        const nxt = Math.min(text.length, Math.max(shown, want));
        if (nxt === shown) continue;
        // one key per frame is plenty for the hands; the text itself keeps up exactly
        if (renderFps(target)) wm.robot.pressKey(text[nxt - 1]);
        shown = nxt;
        if (renderFps(target)) target.innerHTML = esc(text.slice(0, shown)) + '<span class="caret"></span>';
      }
    } finally {
      target.textContent = text.slice(0, shown);
      wm.robot.setTyping(false);
    }
  }

  // Board: click "+ Add card" under the right column and type the card.
  private async typeCard(root: HTMLElement, c: Card) {
    const wm = this.wm, e = wm.epoch;
    const col = root.querySelector(`.tk-col[data-col="${c.col}"]`) as HTMLElement;
    const add = col.querySelector(".tk-add") as HTMLElement;
    const list = this.listFor(root, c.col);
    list.scrollTop = list.scrollHeight;
    await wm.pointAt(add, 0.35, 0.5, 380);
    await wm.click();
    add.classList.add("hide");
    c.el.classList.add("compose");
    this.setText(c.el, "");
    list.appendChild(c.el);
    list.scrollTop = list.scrollHeight;
    gsap.fromTo(c.el, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.2 / wm.speed, clearProps: "transform" });
    await this.type(c.el.querySelector(".tk-t") as HTMLElement, c.text, Math.min(900, 300 + c.text.length * 9));
    this.setText(c.el, c.text);
    wm.robot.pressKey("Enter");
    c.el.classList.remove("compose");
    add.classList.remove("hide");
    gsap.fromTo(c.el, { scale: 0.96 }, { scale: 1, duration: 0.35 / wm.speed, ease: "back.out(3)", clearProps: "transform" });
    await wm.sleep(140, e);
  }

  // Checklist: click "Add a task" at the bottom, type, Enter, and the row joins the list.
  private async typeRow(root: HTMLElement, c: Card) {
    const wm = this.wm, e = wm.epoch;
    const add = root.querySelector(".ck-add") as HTMLElement;
    const q = add.querySelector(".ck-q") as HTMLElement;
    const list = this.listFor(root, c.col);
    await wm.pointAt(q, 0.2, 0.5, 380);
    await wm.click();
    add.classList.add("typing");
    q.textContent = "";
    await this.type(q, c.text, Math.min(900, 300 + c.text.length * 9));
    wm.robot.pressKey("Enter");
    const from = wm.pos(q, 0, 0);
    const rows = Array.from(list.children).filter((x) => (x as HTMLElement).dataset.key) as HTMLElement[];
    this.flip(rows, () => this.insertAt(list, c.el, this.order.get(c.key)!));
    this.reveal(list, c.el);
    const to = wm.pos(c.el.querySelector(".ck-txt")!, 0, 0);
    add.classList.remove("typing");
    q.textContent = "Add a task";
    gsap.fromTo(c.el, { x: from.x - to.x, y: from.y - to.y, opacity: 0.4 }, { x: 0, y: 0, opacity: 1, duration: 0.42 / wm.speed, ease: "power3.out", clearProps: "transform" });
    gsap.fromTo(q, { opacity: 0 }, { opacity: 1, duration: 0.3 / wm.speed, delay: 0.15 / wm.speed });
    this.highlight(root);
    await wm.sleep(160, e);
  }

  // Board: grab the card with the cursor, carry it to its new column and drop it there.
  private async moveCard(root: HTMLElement, c: Card, to: Col, idx: number, byHand: boolean) {
    const wm = this.wm, e = wm.epoch;
    const target = this.listFor(root, to);
    if (!byHand) {
      const others = Array.from(target.children) as HTMLElement[];
      this.flip([c.el, ...others], () => this.insertAt(target, c.el, idx));
      this.land(c, to, 0.6);
      this.meta(root);
      return;
    }
    const source = c.el.parentElement as HTMLElement;
    this.reveal(source, c.el);
    await wm.pointAt(c.el, 0.42, 0.45, 360);
    wm.robot.click();
    const o = wm.pos(root, 0, 0), p = wm.pos(c.el, 0, 0);
    const h = c.el.offsetHeight + 6, wd = c.el.offsetWidth;   // card plus its gap below
    // the gap it leaves closes up, and room opens where it is headed
    const hole = document.createElement("div");
    hole.className = "tk-gap";
    source.insertBefore(hole, c.el);
    gsap.fromTo(hole, { height: h }, { height: 0, duration: 0.32 / wm.speed, ease: "power2.inOut", onComplete: () => hole.remove() });
    const layer = root.querySelector(".tk-drag") as HTMLElement;
    layer.appendChild(c.el);
    c.el.style.cssText = `left:${p.x - o.x}px;top:${p.y - o.y}px;width:${wd}px`;
    c.el.classList.add("lift");
    gsap.to(c.el, { rotation: 3.5, scale: 1.04, duration: 0.18 / wm.speed, ease: "power2.out" });
    const slot = document.createElement("div");
    slot.className = "tk-gap";
    slot.dataset.key = c.key;   // so insertAt places it like the card itself
    this.insertAt(target, slot, idx);
    slot.style.height = `${h}px`;
    this.reveal(target, slot);
    gsap.fromTo(slot, { height: 0 }, { height: h, duration: 0.3 / wm.speed, ease: "power2.out" });
    const cx = () => gsap.getProperty(wm.cursorEl, "x") as number, cy = () => gsap.getProperty(wm.cursorEl, "y") as number;
    const grab = { x: cx() - p.x, y: cy() - p.y };
    const s = wm.pos(slot, 0, 0);
    const follow = () => { c.el.style.left = `${cx() - grab.x - o.x}px`; c.el.style.top = `${cy() - grab.y - o.y}px`; };
    gsap.ticker.add(follow);
    try {
      await wm.moveTo(s.x + grab.x, s.y + grab.y, 560);
    } finally {
      gsap.ticker.remove(follow);
    }
    // Drop: it falls into the slot with a little settle.
    wm.robot.click();
    const from = wm.pos(c.el, 0, 0);
    gsap.killTweensOf(slot);
    c.el.classList.remove("lift");
    c.el.style.cssText = "";
    target.replaceChild(c.el, slot);
    const at = wm.pos(c.el, 0, 0);
    gsap.fromTo(c.el, { x: from.x - at.x, y: from.y - at.y, rotation: 3.5, scale: 1.04 },
      { x: 0, y: 0, rotation: 0, scale: 1, duration: 0.5 / wm.speed, ease: "back.out(1.9)", clearProps: "transform" });
    const colEl = target.parentElement as HTMLElement;
    gsap.fromTo(colEl, { backgroundColor: "rgba(120, 132, 255, 0.16)" }, { backgroundColor: "rgba(10, 12, 40, 0.28)", duration: 0.7 / wm.speed, ease: "sine.out", clearProps: "backgroundColor" });
    this.land(c, to, 1);
    this.meta(root);
    await wm.sleep(380, e);
  }

  // A card arrives in its column; Done cards get their check.
  private land(c: Card, to: Col, k: number) {
    const wm = this.wm;
    const wasDone = c.col === "done";
    c.col = to;
    if (to !== "done" || wasDone) { this.paint(c.el, to); return; }
    c.el.dataset.col = to;
    c.el.classList.remove("doing");
    c.el.classList.add("done");
    const ok = c.el.querySelector(".tk-ok") as HTMLElement;
    gsap.fromTo(ok, { scale: 0 }, { scale: 1, duration: (0.42 * k) / wm.speed, ease: "back.out(3)", delay: (0.12 * k) / wm.speed });
    gsap.fromTo(ok.querySelector("path"), { strokeDashoffset: 12 }, { strokeDashoffset: 0, duration: (0.3 * k) / wm.speed, ease: "power2.out", delay: (0.28 * k) / wm.speed });
  }

  // Checklist: tick the box (check draws, text gets struck through), or select the new current item.
  private async markRow(root: HTMLElement, c: Card, to: Col, byHand: boolean) {
    const wm = this.wm, e = wm.epoch;
    const list = this.listFor(root, to);
    const was = c.col;
    c.col = to;
    c.el.dataset.col = to;
    if (byHand) {
      this.reveal(list, c.el);
      await wm.pointAt(to === "done" || was === "done" ? c.el.querySelector(".ck-box")! : c.el.querySelector(".ck-txt")!, 0.5, 0.5, 340);
      await wm.click();
    }
    const d = (s: number) => (byHand ? s : s * 0.6) / wm.speed;
    if (to === "done") {
      c.el.classList.remove("doing");
      c.el.classList.add("done");
      const box = c.el.querySelector(".ck-box") as HTMLElement;
      gsap.fromTo(box, { scale: 0.7 }, { scale: 1, duration: d(0.4), ease: "back.out(3)", clearProps: "transform" });
      gsap.fromTo(box.querySelector("path"), { strokeDashoffset: 12 }, { strokeDashoffset: 0, duration: d(0.28), ease: "power2.out", delay: d(0.06) });
      gsap.to(c.el.querySelector(".ck-txt"), { backgroundSize: "100% 1.5px", duration: d(0.4), ease: "power2.inOut", delay: d(0.12) });
    } else {
      if (was === "done") this.paint(c.el, to);
      c.el.classList.toggle("doing", to === "doing");
    }
    this.highlight(root);
    await wm.sleep(byHand ? 420 : 120, e);
  }
}
