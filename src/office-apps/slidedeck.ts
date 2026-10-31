// Slidedeck: a presentation app in the robot's computer. A rail of slide thumbnails, the slide on
// a grey canvas with title and bullet layouts, shapes and pictures where the deck has them, and a
// speaker notes strip. The robot adds slides, types titles and bullets, and now and then plays the
// deck full screen.
import gsap from "gsap";
import type { WM } from "../os/wm";
import { esc } from "../os/typing";
import type { DeckDoc, Slide, SlideEl, Box } from "./model";
import { GL, openTab, paceFor, press, reduced, ribbon, save, setTab, typeWith, flash } from "./common";

const BASE_W = 480;
const LIVE_CHARS = 1500;
type UI = { root: HTMLElement; rail: HTMLElement; stage: HTMLElement; fit: HTMLElement; notes: HTMLElement; count: HTMLElement; status: HTMLElement };
/** "all": every slide is new; a Map: slide index to its old version (null for a new slide). */
type ShowOpts = { instant?: boolean; typed?: "all" | "none" | Map<number, Slide | null>; present?: boolean };

const titleSlide = (s: Slide, i: number) => s.els.some((e) => e.kind === "subtitle") || (i === 0 && !s.els.some((e) => e.kind === "body"));
function defaultBox(e: SlideEl, s: Slide, i: number, k: number): Box {
  const t = titleSlide(s, i);
  if (e.kind === "title") return t ? { x: 0.08, y: 0.3, w: 0.84, h: 0.2 } : { x: 0.06, y: 0.06, w: 0.88, h: 0.16 };
  if (e.kind === "subtitle") return { x: 0.14, y: 0.53, w: 0.72, h: 0.14 };
  if (e.kind === "body") return { x: 0.06, y: 0.26, w: 0.88, h: 0.66 };
  return { x: 0.1, y: 0.3 + 0.12 * k, w: 0.8, h: 0.12 };
}
const paraText = (e: SlideEl) => (e.paras || []).map((p) => p.text).join("\n");

export class Slidedeck {
  private ro: ResizeObserver | null = null;
  constructor(private wm: WM) {}

  private async ensure(name: string, aspect: number): Promise<UI> {
    const w = await this.wm.open("slidedeck", `${name}  Slidedeck`);
    if (!w.body.querySelector(".sd")) {
      w.body.innerHTML = `
        <div class="oa sd">
          ${ribbon(["File", "Home", "Insert", "Design", "Slide Show"], "Home")}
          <div class="sd-main">
            <div class="sd-rail"></div>
            <div class="sd-work"><div class="sd-stage"><div class="sd-fit"></div></div><div class="sd-notes"></div></div>
          </div>
          <div class="oa-status"><span class="sd-count">Slide 1 of 1</span><span class="oa-gap"></span><span class="oa-save"></span><span>Notes</span><span>100%</span></div>
        </div>`;
      w.body.querySelector(".oa-tools")!.innerHTML = `
        <div class="oa-pane" data-pane="Home">
          <div class="oa-group"><span class="oa-tool sd-new">${GL.newSlide}<span>New slide</span></span><span class="oa-field wide">Title and Content</span></div>
          <div class="oa-group"><span class="oa-field">Lexend</span><span class="oa-field sm">24</span><span class="oa-btn"><b>B</b></span><span class="oa-btn"><i>I</i></span></div>
          <div class="oa-group"><span class="oa-btn sd-ul" title="Bullets">${GL.bullets}</span><span class="oa-btn" title="Center">${GL.center}</span></div>
          <div class="oa-group"><span class="oa-tool sd-play">${GL.play}<span>Present</span></span></div>
        </div>
        <div class="oa-pane" data-pane="Insert" hidden><span class="oa-tool sd-pic">${GL.picture}<span>Picture</span></span><span class="oa-tool sd-shape">${GL.shapes}<span>Shapes</span></span><span class="oa-tool">${GL.chart}<span>Chart</span></span><span class="oa-tool">${GL.table}<span>Table</span></span></div>
        <div class="oa-pane" data-pane="Design" hidden><span class="oa-tool txt">Themes</span><span class="oa-tool txt">Slide size</span></div>
        <div class="oa-pane" data-pane="Slide Show" hidden><span class="oa-tool">${GL.play}<span>From beginning</span></span></div>
        <div class="oa-pane" data-pane="File" hidden></div>`;
    }
    const root = w.body.querySelector(".sd") as HTMLElement;
    const ui: UI = {
      root, rail: root.querySelector(".sd-rail")!, stage: root.querySelector(".sd-stage")!, fit: root.querySelector(".sd-fit")!,
      notes: root.querySelector(".sd-notes")!, count: root.querySelector(".sd-count")!, status: root.querySelector(".oa-save")!,
    };
    root.style.setProperty("--sh", `${(BASE_W / (aspect || 16 / 9)).toFixed(1)}px`);
    // the slide scales with the window (snapped, maximised...)
    this.ro?.disconnect();
    this.ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.fitStage(ui)) : null;
    this.ro?.observe(ui.stage);
    this.fitStage(ui);
    return ui;
  }

  private fitStage(ui: UI) {
    const h = parseFloat(ui.root.style.getPropertyValue("--sh")) || 270;
    const k = Math.max(0.2, Math.min((ui.stage.clientWidth - 22) / BASE_W, (ui.stage.clientHeight - 14) / h));
    ui.fit.style.width = `${BASE_W * k}px`;
    ui.fit.style.height = `${h * k}px`;
    const slide = ui.fit.firstElementChild as HTMLElement | null;
    if (slide) slide.style.transform = `scale(${k})`;
  }

  // --- rendering ---------------------------------------------------------------------------
  private elHTML(e: SlideEl, s: Slide, i: number, k: number, n = Infinity) {
    const b = e.box ?? defaultBox(e, s, i, k);
    const pos = `left:${(b.x * 100).toFixed(2)}%;top:${(b.y * 100).toFixed(2)}%;width:${(b.w * 100).toFixed(2)}%;height:${(b.h * 100).toFixed(2)}%`;
    if (e.kind === "pic") return `<div class="sd-el sd-pic" style="${pos}">${e.src ? `<img alt="" src="${e.src}">` : GL.picture}</div>`;
    if (e.kind === "shape") {
      const r = e.prst === "ellipse" ? "50%" : e.prst === "roundRect" ? "14%" : e.prst === "rect" ? "0" : "6px";
      const clip = e.prst === "triangle" ? "clip-path:polygon(50% 0,100% 100%,0 100%);" : e.prst === "rightArrow" ? "clip-path:polygon(0 30%,62% 30%,62% 0,100% 50%,62% 100%,62% 70%,0 70%);" : "";
      return `<div class="sd-el sd-shape" style="${pos};border-radius:${r};${clip}background:${e.fill || "var(--sd-accent)"}"></div>`;
    }
    const cls = e.kind === "title" ? (titleSlide(s, i) ? "sd-title big" : "sd-title") : e.kind === "subtitle" ? "sd-sub" : e.kind === "body" ? "sd-body" : "sd-text";
    let left = n, num = 0;
    const paras = (e.paras || []).map((p) => {
      if (left < 0) return "";
      const t = p.text.slice(0, Math.max(0, left));
      left -= p.text.length + 1;
      if (p.bullet === "num") num++;
      const mark = e.kind === "body" && p.bullet !== false ? (p.bullet === "num" ? ` data-n="${num}."` : " data-b") : "";
      return `<p class="lv${Math.min(3, p.lvl)}${p.bold ? " bold" : ""}"${mark}>${esc(t) || "&nbsp;"}</p>`;
    }).join("");
    const fill = e.fill && e.kind === "text" ? `background:${e.fill};` : "";
    return `<div class="sd-el ${cls}${e.center ? " center" : ""}" style="${pos};${fill}">${paras}</div>`;
  }

  private slideHTML(s: Slide, i: number) {
    let k = 0;
    return `<div class="sd-slide"${s.bg ? ` style="background:${s.bg}"` : ""}>${s.els.map((e) => this.elHTML(e, s, i, e.kind === "text" ? k++ : 0)).join("")}</div>`;
  }

  private thumb(ui: UI, i: number, s: Slide | null) {
    const t = document.createElement("div");
    t.className = "sd-thumb";
    t.innerHTML = `<b>${i + 1}</b><div class="sd-mini">${s ? this.slideHTML(s, i) : `<div class="sd-slide"></div>`}</div>`;
    return t;
  }
  private renumber(ui: UI) { ui.rail.querySelectorAll(".sd-thumb b").forEach((b, i) => (b.textContent = String(i + 1))); }
  private activate(ui: UI, i: number, total: number) {
    ui.rail.querySelectorAll(".sd-thumb").forEach((t, k) => t.classList.toggle("on", k === i));
    const t = ui.rail.children[i] as HTMLElement | undefined;
    if (t) {
      const top = t.offsetTop - ui.rail.clientHeight / 2 + t.offsetHeight / 2;
      if (reduced()) ui.rail.scrollTop = top; else gsap.to(ui.rail, { scrollTop: Math.max(0, top), duration: 0.3, overwrite: true });
    }
    ui.count.textContent = `Slide ${i + 1} of ${total}`;
  }
  private showSlide(ui: UI, s: Slide, i: number) {
    ui.fit.innerHTML = this.slideHTML(s, i);
    this.fitStage(ui);
    this.notes(ui, s.notes || "");
  }
  private notes(ui: UI, text: string, caret = false) {
    ui.notes.classList.toggle("empty", !text && !caret);
    ui.notes.innerHTML = text || caret ? esc(text) + (caret ? '<span class="caret"></span>' : "") : "Click to add notes";
  }
  private syncThumb(ui: UI, i: number) {
    const mini = ui.rail.children[i]?.querySelector(".sd-mini");
    const slide = ui.fit.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (!mini || !slide) return;
    slide.querySelectorAll(".caret, .sd-ph").forEach((x) => x.remove());
    slide.style.transform = "";
    mini.innerHTML = "";
    mini.appendChild(slide);
  }

  async show(doc: DeckDoc, o: ShowOpts = {}) {
    const wm = this.wm, e = wm.epoch, instant = !!o.instant;
    const ui = await this.ensure(doc.name, doc.aspect);
    setTab(ui.root, "Home");
    ui.status.textContent = "";
    const slides = doc.slides;
    const typed = o.typed === "all" ? new Map(slides.map((_, i) => [i, null] as [number, Slide | null])) : o.typed instanceof Map ? o.typed : new Map<number, Slide | null>();
    // the rail: slides that already exist (old versions for the ones being changed)
    ui.rail.innerHTML = "";
    const existing: number[] = [];
    slides.forEach((s, i) => {
      if (instant || !typed.has(i)) { ui.rail.appendChild(this.thumb(ui, ui.rail.children.length, s)); existing.push(i); }
      else if (typed.get(i)) { ui.rail.appendChild(this.thumb(ui, ui.rail.children.length, typed.get(i)!)); existing.push(i); }
    });
    if (doc.totalSlides > slides.length) ui.rail.insertAdjacentHTML("beforeend", `<p class="sd-more">${doc.totalSlides - slides.length} more slides</p>`);
    const firstShown = slides.findIndex((_, i) => existing.includes(i));
    if (firstShown >= 0) { this.showSlide(ui, typed.get(firstShown) ?? slides[firstShown], firstShown); this.activate(ui, 0, Math.max(1, existing.length)); }
    else { ui.fit.innerHTML = ""; this.notes(ui, ""); ui.count.textContent = "Slide 0 of 0"; }
    if (instant) {
      if (slides.length) { this.showSlide(ui, slides[slides.length - 1], slides.length - 1); this.activate(ui, slides.length - 1, slides.length); }
      await save(wm, ui.status, true);
      await wm.sleep(350, e);
      return;
    }
    if (!typed.size) {
      // it changed but we can not tell where: flip through the slides, then save
      wm.robot.setPose("read");
      for (let i = 0; i < Math.min(slides.length, 8); i++) {
        const t = ui.rail.children[i];
        if (!t) break;
        await wm.pointAt(t, 0.5, 0.5, 300);
        await wm.click();
        this.showSlide(ui, slides[i], i);
        this.activate(ui, i, slides.length);
        await wm.sleep(650, e);
      }
      await save(wm, ui.status);
      return;
    }
    const total = [...typed.keys()].reduce((n, i) => n + slides[i].els.reduce((m, el) => m + paraText(el).length, 0), 0);
    const cps = paceFor(Math.min(total, LIVE_CHARS), 2.5, 14);
    let budget = LIVE_CHARS;
    let pos = 0;   // rail position of the slide being worked on
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      if (!typed.has(i)) { pos++; continue; }
      wm.check(e);
      const old = typed.get(i);
      const count = () => ui.rail.querySelectorAll(".sd-thumb").length;
      if (!old) {
        // New slide: the button adds an empty slide after the current one
        if (pos > 0 && ui.rail.children[pos - 1]) {
          const prev = ui.rail.children[pos - 1];
          await wm.pointAt(prev, 0.5, 0.5, 300); await wm.click();
          this.activate(ui, pos - 1, count());
        }
        await press(wm, ui.root.querySelector(".sd-new"));
        const t = this.thumb(ui, pos, null);
        ui.rail.insertBefore(t, ui.rail.children[pos] ?? ui.rail.querySelector(".sd-more"));
        this.renumber(ui);
        if (!reduced()) gsap.from(t, { height: 0, opacity: 0, duration: 0.3, ease: "power2.out" });
        // an empty layout with placeholders
        ui.fit.innerHTML = `<div class="sd-slide">${this.placeholders(s, i)}</div>`;
        this.fitStage(ui);
        this.notes(ui, "");
        this.activate(ui, pos, count());
      } else {
        const t = ui.rail.children[pos];
        if (t) { await wm.pointAt(t, 0.5, 0.5, 320); await wm.click(); }
        this.showSlide(ui, old, i);
        this.activate(ui, pos, count());
      }
      await wm.sleep(200, e);
      const fast = budget <= 0;
      // the content, one element at a time
      const slideEl = ui.fit.firstElementChild as HTMLElement;
      let k = 0;
      for (const [n, el] of s.els.entries()) {
        wm.check(e);
        const txt = paraText(el);
        const oldEl = old?.els[n];
        if (oldEl && oldEl.kind === el.kind && paraText(oldEl) === txt && oldEl.src === el.src && oldEl.fill === el.fill) { k += el.kind === "text" ? 1 : 0; continue; }
        const kk = el.kind === "text" ? k++ : 0;
        const ph = slideEl.querySelector(`.sd-ph[data-for="${el.kind}"]`) as HTMLElement | null;
        const prevEl = slideEl.children[n] && !ph && old ? (slideEl.querySelectorAll(":scope > .sd-el")[n] as HTMLElement | undefined) : undefined;
        const holder = document.createElement("div");
        holder.innerHTML = this.elHTML(el, s, i, kk, fast ? Infinity : 0);
        const node = holder.firstElementChild as HTMLElement;
        if (el.kind === "shape" || el.kind === "pic") {
          if (!fast) { await openTab(wm, ui.root, "Insert"); await press(wm, ui.root.querySelector(el.kind === "pic" ? ".sd-pic" : ".sd-shape")); setTab(ui.root, "Home"); }
          slideEl.appendChild(node);
          if (!fast && el.kind === "shape") {
            // drag out the shape, corner to corner
            await wm.pointAt(node, 0.02, 0.02, 300);
            wm.robot.click();
            const grow = reduced() ? null : gsap.fromTo(node, { scale: 0.05, transformOrigin: "0 0" }, { scale: 1, duration: 0.45 / wm.speed, ease: "power1.out" });
            await wm.pointAt(node, 0.98, 0.98, 450);
            grow?.progress(1);
          } else if (!reduced()) gsap.from(node, { opacity: 0, scale: 0.92, duration: 0.3 });
          if (prevEl) prevEl.remove();
          await wm.sleep(fast ? 60 : 200, e);
          continue;
        }
        if (ph) ph.replaceWith(node); else if (prevEl) prevEl.replaceWith(node); else slideEl.appendChild(node);
        if (fast) { if (!reduced()) gsap.from(node, { opacity: 0, duration: 0.25 }); await wm.sleep(80, e); continue; }
        await wm.pointAt(node, 0.12, 0.3, 320);
        await wm.click();
        if (el.kind === "body") ui.root.querySelector(".sd-ul")?.classList.add("on");
        let lvl = 0;
        await typeWith(wm, txt, cps, (cnt, caret) => {
          holder.innerHTML = this.elHTML(el, s, i, kk, cnt);
          const fresh = holder.firstElementChild as HTMLElement;
          if (caret) { const ps = fresh.querySelectorAll("p"); let last: Element | null = null; let left = cnt; for (const [pi, p] of (el.paras || []).entries()) { last = ps[pi]; if (left <= p.text.length) break; left -= p.text.length + 1; } last?.insertAdjacentHTML("beforeend", '<span class="caret"></span>'); }
          node.innerHTML = fresh.innerHTML;
          // a deeper bullet level starts with Tab
          const at = (el.paras || []).find((_, pi) => (el.paras || []).slice(0, pi + 1).reduce((m, p) => m + p.text.length + 1, 0) > cnt);
          if (at && at.lvl !== lvl) { if (at.lvl > lvl) wm.robot.pressKey("Tab"); lvl = at.lvl; }
        });
        ui.root.querySelector(".sd-ul")?.classList.remove("on");
        budget -= txt.length;
        if (old) flash(node, "rgba(255, 159, 90, 0.35)", 1.3);
        this.syncThumb(ui, pos);
        await wm.sleep(160, e);
      }
      slideEl.querySelectorAll(".sd-ph").forEach((x) => x.remove());
      // speaker notes
      if (s.notes && s.notes !== old?.notes) {
        if (!fast) {
          await wm.pointAt(ui.notes, 0.2, 0.5, 320);
          await wm.click();
          const text = s.notes;
          await typeWith(wm, text, cps * 1.4, (cnt, caret) => this.notes(ui, text.slice(0, cnt), caret));
          budget -= Math.min(160, text.length);
        } else this.notes(ui, s.notes);
      } else this.notes(ui, s.notes || "");
      this.syncThumb(ui, pos);
      pos++;
    }
    await save(wm, ui.status);
    // now and then a quick run-through, full screen
    if (o.present ?? (slides.length >= 2 && Math.random() < 0.45)) await this.present(ui, slides);
    await wm.sleep(300, e);
  }

  private placeholders(s: Slide, i: number) {
    const t = titleSlide(s, i);
    const parts = [`<div class="sd-ph${t ? " big" : ""}" data-for="title" style="${this.boxCss(defaultBox({ kind: "title" }, s, i, 0))}">Click to add title</div>`];
    if (t) parts.push(`<div class="sd-ph" data-for="subtitle" style="${this.boxCss(defaultBox({ kind: "subtitle" }, s, i, 0))}">Click to add subtitle</div>`);
    else if (s.els.some((e) => e.kind === "body")) parts.push(`<div class="sd-ph body" data-for="body" style="${this.boxCss(s.els.find((e) => e.kind === "body")!.box ?? defaultBox({ kind: "body" }, s, i, 0))}">Click to add text</div>`);
    return parts.join("");
  }
  private boxCss(b: Box) { return `left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`; }

  /** Present: the deck plays full screen on the robot's monitor, a slide or two a second, then Esc. */
  async present(ui: UI | null, slides: Slide[]) {
    const wm = this.wm, e = wm.epoch;
    if (ui) await press(wm, ui.root.querySelector(".sd-play"));
    const show = document.createElement("div");
    show.className = "sd-show";
    const h = parseFloat(ui?.root.style.getPropertyValue("--sh") || "270") || 270;
    show.style.setProperty("--sh", `${h}px`);
    const k = Math.min(wm.root.clientWidth / BASE_W, wm.root.clientHeight / h) || 1.7;
    wm.root.appendChild(show);
    wm.robot.setPose("read");
    gsap.to(wm.cursorEl, { opacity: 0, duration: 0.3 });   // the pointer hides while presenting
    try {
      if (!reduced()) gsap.fromTo(show, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      for (const [i, s] of slides.slice(0, 12).entries()) {
        wm.check(e);
        const frame = document.createElement("div");
        frame.className = "sd-show-frame";
        frame.innerHTML = this.slideHTML(s, i);
        (frame.firstElementChild as HTMLElement).style.transform = `scale(${k})`;
        frame.style.width = `${BASE_W * k}px`;
        frame.style.height = `${h * k}px`;
        show.appendChild(frame);
        if (i > 0) wm.robot.pressKey("ArrowRight");
        if (!reduced()) gsap.fromTo(frame, { opacity: 0, x: i ? 30 : 0 }, { opacity: 1, x: 0, duration: 0.35 / wm.speed, ease: "power2.out" });
        const prev = show.children.length > 1 ? (show.firstElementChild as HTMLElement) : null;
        if (prev) { if (reduced()) prev.remove(); else gsap.to(prev, { opacity: 0, duration: 0.3 / wm.speed, onComplete: () => prev.remove() }); }
        await wm.sleep(1100 + Math.min(900, s.els.reduce((n, el) => n + paraText(el).length, 0) * 6), e);
      }
      wm.robot.pressKey("Escape");
    } finally {
      gsap.to(wm.cursorEl, { opacity: 1, duration: 0.3 });
      if (reduced()) show.remove(); else gsap.to(show, { opacity: 0, duration: 0.25, onComplete: () => show.remove() });
    }
  }

  /** The file could not be read: the deck opens and saves without inventing slides. */
  async saving(name: string, o: { instant?: boolean } = {}) {
    const ui = await this.ensure(name, 16 / 9);
    ui.rail.innerHTML = "";
    ui.fit.innerHTML = `<div class="sd-slide"><p class="sd-none"></p></div>`;
    ui.fit.querySelector(".sd-none")!.textContent = `${name} is saved in a format Slidedeck can not preview.`;
    this.fitStage(ui);
    this.notes(ui, "");
    ui.count.textContent = "";
    await save(this.wm, ui.status, o.instant);
    await this.wm.sleep(o.instant ? 300 : 700);
  }
}
