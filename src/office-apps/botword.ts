// Botword: a word processor in the robot's computer. A ribbon (Home, Insert, Layout), a ruler,
// a white page on a grey canvas and a status bar with the page and word count. The robot types
// a document's real paragraphs, headings, lists and tables, and the ribbon follows the caret.
import gsap from "gsap";
import type { WM } from "../os/wm";
import { esc } from "../os/typing";
import { blockText, words, type Block, type Run, type WordDoc } from "./model";
import { GL, flash, follow, openTab, paceFor, press, reduced, ribbon, save, setTab, typeWith } from "./common";

const LIVE_CHARS = 2400;   // typed by hand; anything longer drops in block by block
const PAGE_H = 600;
type UI = { root: HTMLElement; page: HTMLElement; canvas: HTMLElement; words: HTMLElement; pages: HTMLElement; status: HTMLElement };
type ShowOpts = { instant?: boolean; typed?: boolean[] | "all" | "none"; changed?: boolean };

const styleKey = (b: Block) => (b.kind === "h" ? (b.level === 0 ? "h0" : b.level === 1 ? "h1" : b.level === 2 ? "h2" : "h3") : b.kind === "li" ? (b.ordered ? "ol" : "ul") : b.kind);

function runsHTML(text: string, runs: Run[] | undefined, n: number) {
  const nl = (s: string) => esc(s).replace(/\n/g, "<br>").replace(/\t/g, "&emsp;");
  if (!runs) return nl(text.slice(0, n));
  let out = "", left = n;
  for (const r of runs) {
    if (left <= 0) break;
    let h = nl(r.t.slice(0, left));
    left -= r.t.length;
    if (r.u) h = `<u>${h}</u>`;
    if (r.i) h = `<i>${h}</i>`;
    if (r.b) h = `<b>${h}</b>`;
    out += h;
  }
  return out;
}
function runAt(runs: Run[] | undefined, n: number): Run | null {
  if (!runs) return null;
  let at = 0;
  for (const r of runs) { at += r.t.length; if (n <= at) return r; }
  return runs[runs.length - 1] ?? null;
}

export class Botword {
  constructor(private wm: WM) {}

  private async ensure(name: string): Promise<UI> {
    const w = await this.wm.open("botword", `${name}  Botword`);
    if (!w.body.querySelector(".bw")) {
      w.body.innerHTML = `
        <div class="oa bw">
          ${ribbon(["File", "Home", "Insert", "Layout", "Review", "View"], "Home")}
          <div class="bw-ruler" aria-hidden="true"><div class="bw-ruler-in"></div></div>
          <div class="bw-canvas"><div class="bw-page"></div></div>
          <div class="oa-status"><span class="bw-pages">Page 1 of 1</span><span class="bw-words">0 words</span><span class="oa-gap"></span><span class="oa-save"></span><span>100%</span></div>
        </div>`;
      const tools = w.body.querySelector(".oa-tools") as HTMLElement;
      tools.innerHTML = `
        <div class="oa-pane" data-pane="Home">
          <div class="oa-group"><span class="oa-field">Lexend</span><span class="oa-field sm">11</span></div>
          <div class="oa-group"><span class="oa-btn bw-b"><b>B</b></span><span class="oa-btn bw-i"><i>I</i></span><span class="oa-btn bw-u"><u>U</u></span></div>
          <div class="oa-group"><span class="oa-btn bw-ul" title="Bullets">${GL.bullets}</span><span class="oa-btn bw-ol" title="Numbering">${GL.numbers}</span><span class="oa-btn bw-al on" title="Align left">${GL.left}</span><span class="oa-btn bw-ac" title="Center">${GL.center}</span></div>
          <div class="oa-group bw-styles"><span class="bw-style on" data-s="p">Normal</span><span class="bw-style t" data-s="h0">Title</span><span class="bw-style h1" data-s="h1">Heading 1</span><span class="bw-style h2" data-s="h2">Heading 2</span></div>
        </div>
        <div class="oa-pane" data-pane="Insert" hidden>
          <span class="oa-tool bw-table">${GL.table}<span>Table</span></span><span class="oa-tool">${GL.picture}<span>Picture</span></span><span class="oa-tool">${GL.shapes}<span>Shapes</span></span><span class="oa-tool">${GL.chart}<span>Chart</span></span>
        </div>
        <div class="oa-pane" data-pane="Layout" hidden>
          <span class="oa-tool txt">Margins</span><span class="oa-tool txt">Orientation</span><span class="oa-tool txt">Size</span><span class="oa-tool txt">Columns</span>
        </div>`;
      for (const pane of ["File", "Review", "View"]) tools.insertAdjacentHTML("beforeend", `<div class="oa-pane" data-pane="${pane}" hidden></div>`);
    }
    const root = w.body.querySelector(".bw") as HTMLElement;
    return {
      root, page: root.querySelector(".bw-page")!, canvas: root.querySelector(".bw-canvas")!,
      words: root.querySelector(".bw-words")!, pages: root.querySelector(".bw-pages")!, status: root.querySelector(".oa-save")!,
    };
  }

  private blockEl(b: Block) {
    const el = document.createElement(b.kind === "table" ? "table" : b.kind === "h" ? (b.level <= 1 ? "h1" : b.level === 2 ? "h2" : "h3") : b.kind === "p" ? "p" : "div");
    if (b.kind === "h") el.className = b.level === 0 ? "bw-title" : b.sub ? "bw-sub" : `bw-h${Math.min(3, b.level)}`;
    else if (b.kind === "p") el.className = b.quote ? "bw-p bw-quote" : "bw-p";
    else if (b.kind === "li") { el.className = `bw-li${b.ordered ? " ol" : ""}`; el.style.setProperty("--lvl", String(b.level)); el.innerHTML = `<span class="bw-tx"></span>`; }
    else if (b.kind === "table") { el.className = "bw-table"; el.innerHTML = b.rows.map((r, ri) => `<tr>${r.map(() => (ri === 0 ? "<th></th>" : "<td></td>")).join("")}</tr>`).join(""); }
    else el.className = "bw-img";
    if (b.kind === "img") el.innerHTML = GL.picture;
    if ("align" in b && b.align) el.style.textAlign = b.align;
    return el;
  }

  private paint(el: HTMLElement, b: Block, n: number, caret: boolean) {
    const c = caret ? '<span class="caret"></span>' : "";
    if (b.kind === "table") {
      el.querySelectorAll("th, td").forEach((td, i) => { const cols = b.rows[0]?.length || 1; td.textContent = b.rows[Math.floor(i / cols)]?.[i % cols] ?? ""; });
    } else if (b.kind === "li") (el.firstElementChild as HTMLElement).innerHTML = (runsHTML(b.text, b.runs, n) || (caret ? "" : "&nbsp;")) + c;
    else if (b.kind !== "img") el.innerHTML = (runsHTML(b.text, b.runs, n) || (caret ? "" : "&nbsp;")) + c;
  }

  /** List markers: bullets by level, numbers counted per run of ordered items. */
  private number(page: HTMLElement) {
    const counts: number[] = [];
    for (const el of page.children as HTMLCollectionOf<HTMLElement>) {
      if (!el.classList.contains("bw-li")) { counts.length = 0; continue; }
      const lvl = Number(el.style.getPropertyValue("--lvl") || 0);
      counts.length = lvl + 1;
      counts[lvl] = (counts[lvl] || 0) + 1;
      (el.firstElementChild as HTMLElement).dataset.mk = el.classList.contains("ol") ? `${counts[lvl]}.` : ["•", "◦", "▪"][lvl % 3];
    }
  }

  private counts(ui: UI, n: number) {
    ui.words.textContent = `${n.toLocaleString("en-US")} word${n === 1 ? "" : "s"}`;
    const pages = Math.max(1, Math.ceil((ui.page.scrollHeight - 1) / PAGE_H));
    const at = Math.min(pages, Math.max(1, Math.floor(ui.canvas.scrollTop / PAGE_H) + 1));
    ui.pages.textContent = `Page ${at} of ${pages}`;
  }

  // The ribbon reflects where the caret is: style, list buttons, bold and italic.
  private ribbonAt(ui: UI, b: Block | null, run: Run | null) {
    const k = b ? styleKey(b) : "p";
    ui.root.querySelectorAll<HTMLElement>(".bw-style").forEach((s) => s.classList.toggle("on", s.dataset.s === (k === "h3" ? "h2" : k === "ul" || k === "ol" || k === "table" || k === "img" ? "p" : k)));
    ui.root.querySelector(".bw-ul")!.classList.toggle("on", k === "ul");
    ui.root.querySelector(".bw-ol")!.classList.toggle("on", k === "ol");
    const center = !!b && "align" in b && b.align === "center";
    ui.root.querySelector(".bw-ac")!.classList.toggle("on", center);
    ui.root.querySelector(".bw-al")!.classList.toggle("on", !center);
    ui.root.querySelector(".bw-b")!.classList.toggle("on", !!run?.b || (b?.kind === "h"));
    ui.root.querySelector(".bw-i")!.classList.toggle("on", !!run?.i);
    ui.root.querySelector(".bw-u")!.classList.toggle("on", !!run?.u);
  }

  /** Show a document. `typed` says which blocks the robot types (new ones); the rest are already there. */
  async show(doc: WordDoc, o: ShowOpts = {}) {
    const wm = this.wm, e = wm.epoch, instant = !!o.instant;
    const ui = await this.ensure(doc.name);
    const blocks = doc.blocks;
    const typed = o.typed === "all" ? blocks.map(() => true) : Array.isArray(o.typed) ? o.typed : blocks.map(() => false);
    ui.page.innerHTML = "";
    ui.canvas.scrollTop = 0;
    setTab(ui.root, "Home");
    ui.status.textContent = "";
    const els: (HTMLElement | null)[] = blocks.map(() => null);
    let wordsDone = 0;
    // what is already in the document
    blocks.forEach((b, i) => {
      if (typed[i] && !instant) return;
      const el = this.blockEl(b);
      this.paint(el, b, b.kind === "table" || b.kind === "img" ? 0 : b.text.length, false);
      ui.page.appendChild(el);
      els[i] = el;
      wordsDone += words(blockText(b));
    });
    if (doc.truncated) ui.page.insertAdjacentHTML("beforeend", `<p class="bw-more">The rest of the document continues on later pages.</p>`);
    this.number(ui.page);
    this.counts(ui, wordsDone);
    this.ribbonAt(ui, blocks[0] ?? null, null);
    if (!reduced()) gsap.fromTo(ui.page, { opacity: 0.6 }, { opacity: 1, duration: 0.3 });
    if (instant) { await save(wm, ui.status, true); await wm.sleep(350, e); return; }

    if (!typed.some(Boolean)) {
      // nothing to type (it changed, but we do not know where): read it through, then save
      wm.robot.setPose("read");
      await wm.pointAt(ui.canvas, 0.62, 0.4, 360);
      const dur = Math.min(4.5, 0.8 + blocks.length * 0.12);
      if (!reduced()) gsap.to(ui.canvas, { scrollTop: Math.max(0, ui.page.scrollHeight - ui.canvas.clientHeight), duration: dur / wm.speed, ease: "power1.inOut", onUpdate: () => this.counts(ui, wordsDone) });
      await wm.sleep(dur * 1000, e);
      await save(wm, ui.status);
      return;
    }

    const total = blocks.reduce((s, b, i) => s + (typed[i] ? blockText(b).length : 0), 0);
    const cps = paceFor(Math.min(total, LIVE_CHARS));
    let budget = LIVE_CHARS, clicks = 4, prev: Block | null = null, first = true;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!typed[i]) { prev = b; continue; }
      wm.check(e);
      const el = this.blockEl(b);
      const next = els.slice(i + 1).find((x) => x);
      ui.page.insertBefore(el, next ?? ui.page.querySelector(".bw-more"));
      els[i] = el;
      this.number(ui.page);
      follow(ui.canvas, el, wm.speed);
      const len = blockText(b).length;
      if (budget <= 0) {
        // past the hand-typed part: the rest arrives block by block
        this.paint(el, b, b.kind === "table" || b.kind === "img" ? 0 : b.text.length, false);
        if (!reduced()) gsap.fromTo(el, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25 });
        wordsDone += words(blockText(b));
        this.counts(ui, wordsDone);
        await wm.sleep(70, e);
        prev = b;
        continue;
      }
      if (first) { first = false; await wm.pointAt(el, 0.05, 0.5, 380); await wm.click(); }
      // a new style or list starts: click it in the ribbon (the first few times), else use the shortcut
      if (!prev || styleKey(prev) !== styleKey(b)) {
        const k = styleKey(b);
        const target = k === "ul" ? ".bw-ul" : k === "ol" ? ".bw-ol" : k === "h0" || k === "h1" || k === "h2" ? `.bw-style[data-s="${k}"]` : k === "h3" ? `.bw-style[data-s="h2"]` : k === "p" && prev && prev.kind !== "p" ? `.bw-style[data-s="p"]` : null;
        if (target && b.kind !== "table") {
          if (clicks-- > 0) await press(wm, ui.root.querySelector(target));
          else { wm.robot.pressKey("Control"); wm.robot.pressKey(k === "h1" ? "1" : k === "h2" ? "2" : "Shift"); await wm.sleep(120, e); }
        }
      }
      this.ribbonAt(ui, b, runAt("runs" in b ? b.runs : undefined, 0));
      if (b.kind === "table") await this.typeTable(ui, el, b, cps);
      else if (b.kind === "img") { await openTab(wm, ui.root, "Insert"); await press(wm, ui.root.querySelector('.oa-pane[data-pane="Insert"] .oa-tool:nth-child(2)')); setTab(ui.root, "Home"); el.innerHTML = GL.picture; if (!reduced()) gsap.from(el, { scale: 0.8, opacity: 0, duration: 0.3 }); }
      else {
        let lastRun: Run | null = null;
        const base = wordsDone;
        await typeWith(wm, b.text, cps, (n, caret) => {
          this.paint(el, b, n, caret);
          const r = runAt(b.runs, n);
          if (r !== lastRun) { lastRun = r; this.ribbonAt(ui, b, r); }
          this.counts(ui, base + words(b.text.slice(0, n)));
          if (el.offsetTop + el.offsetHeight > ui.canvas.scrollTop + ui.canvas.clientHeight - 20) follow(ui.canvas, el, wm.speed, 0.6);
        });
      }
      wordsDone += words(blockText(b));
      budget -= len;
      wm.robot.pressKey("Enter");
      if (o.changed) flash(el);
      prev = b;
      await wm.sleep(len > 120 ? 220 : 120, e);
    }
    this.counts(ui, wordsDone);
    await save(wm, ui.status);
    await wm.sleep(400, e);
  }

  // Insert, Table: a size picker, an empty table, then the cells are typed with Tab in between.
  private async typeTable(ui: UI, el: HTMLElement, b: Extract<Block, { kind: "table" }>, cps: number) {
    const wm = this.wm, e = wm.epoch;
    const cols = Math.max(1, ...b.rows.map((r) => r.length)), rows = b.rows.length;
    await openTab(wm, ui.root, "Insert");
    const btn = ui.root.querySelector(".bw-table") as HTMLElement;
    await press(wm, btn);
    const pick = document.createElement("div");
    pick.className = "bw-grid";
    pick.style.left = `${btn.offsetLeft}px`;
    pick.innerHTML = Array.from({ length: 6 * 8 }, (_, i) => `<i class="${i % 8 < cols && Math.floor(i / 8) < rows ? "on" : ""}"></i>`).join("");
    ui.root.querySelector(".oa-tools")!.appendChild(pick);
    try {
      const cell = pick.children[Math.min(5, rows - 1) * 8 + Math.min(7, cols - 1)];
      if (cell) { await wm.pointAt(cell, 0.5, 0.5, 300); await wm.click(); }
    } finally { pick.remove(); }
    setTab(ui.root, "Home");
    if (!reduced()) gsap.from(el, { opacity: 0, scaleY: 0.6, transformOrigin: "50% 0", duration: 0.28 });
    const tds = [...el.querySelectorAll<HTMLElement>("th, td")];
    let budget = 260;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      wm.check(e);
      const td = tds[r * cols + c], text = b.rows[r]?.[c] ?? "";
      if (!td) continue;
      if (budget > 0 && text) await typeWith(wm, text, cps * 1.5, (n, caret) => { td.innerHTML = esc(text.slice(0, n)) + (caret ? '<span class="caret"></span>' : ""); });
      else td.textContent = text;
      budget -= text.length;
      wm.robot.pressKey("Tab");
    }
  }

  /** The file could not be read: the document opens and saves, without making up its text. */
  async saving(name: string, o: { instant?: boolean } = {}) {
    const ui = await this.ensure(name);
    ui.page.innerHTML = `<p class="bw-none"></p>`;
    ui.page.firstElementChild!.textContent = `${name} is saved in a format Botword can not preview.`;
    ui.words.textContent = "";
    ui.pages.textContent = "Page 1 of 1";
    await save(this.wm, ui.status, o.instant);
    await this.wm.sleep(o.instant ? 300 : 700);
  }
}
