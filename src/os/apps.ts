import gsap from "gsap";
import { WM } from "./wm";
import { ICONS } from "./icons";
import { highlight, langOf } from "./highlight";
import { baseName, relPath, type Entry, type Hit, type Hunk } from "./classify";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const el = (html: string) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };

// Typing helper: types text into a target, char by char, faster for long text.
async function typeInto(wm: WM, target: HTMLElement, text: string, opts: { cps?: number; budgetMs?: number; render?: (s: string) => string } = {}) {
  const e = wm.epoch;
  const budget = opts.budgetMs ?? 1600;
  const cps = Math.max(opts.cps ?? 38, text.length / (budget / 1000));
  const render = opts.render ?? esc;
  wm.robot.setTyping(true);
  let shown = 0;
  const start = performance.now();
  try {
    while (shown < text.length) {
      await new Promise((r) => requestAnimationFrame(r));
      wm.check(e);
      const elapsed = (performance.now() - start) * wm.speed;
      const jitter = 0.85 + Math.random() * 0.3;
      const next = Math.min(text.length, Math.max(shown + 1, Math.floor((elapsed / 1000) * cps * jitter)));
      if (next !== shown) {
        shown = next;
        target.innerHTML = render(text.slice(0, shown)) + '<span class="caret"></span>';
      }
    }
  } finally {
    target.innerHTML = render(text.slice(0, shown));
    wm.robot.setTyping(false);
  }
}

// ---------------------------------------------------------------------------
export class FilesApp {
  private path = "";
  constructor(private wm: WM) {}

  private async ensure() {
    const w = await this.wm.open("files");
    if (!w.body.querySelector(".files")) {
      w.body.innerHTML = `
        <div class="files">
          <div class="files-top"><div class="crumbs"></div><div class="search-box">${ICONS.files}<span class="q"></span></div></div>
          <div class="files-list" role="list"></div>
        </div>`;
    }
    return w;
  }

  private crumbs(w: HTMLElement, path: string, root: string | null) {
    const rel = relPath(path, root);
    const rootName = root ? baseName(root) : "";
    const parts = (rel === path.replace(/\\/g, "/") ? rel.split("/") : [rootName, ...rel.split("/")]).filter(Boolean);
    const c = w.querySelector(".crumbs") as HTMLElement;
    c.innerHTML = parts.map((p) => `<span>${esc(p)}</span>`).join('<i aria-hidden="true">/</i>');
    c.scrollLeft = c.scrollWidth;
    return c;
  }

  async list(path: string, entries: Entry[], root: string | null) {
    const wm = this.wm, e = wm.epoch;
    const w = await this.ensure();
    const list = w.body.querySelector(".files-list") as HTMLElement;
    w.body.querySelector(".files")!.classList.remove("searching");
    // Dig in: if the new folder is inside the old one, double-click through it.
    const prev = this.path;
    const sameTree = prev && path.replace(/\\/g, "/").toLowerCase().startsWith(prev.replace(/\\/g, "/").toLowerCase() + "/");
    if (sameTree) {
      const next = path.replace(/\\/g, "/").slice(prev.length + 1).split("/")[0];
      const row = Array.from(list.querySelectorAll(".row")).find((r) => r.getAttribute("data-name")?.toLowerCase() === next.toLowerCase());
      if (row) {
        await wm.pointAt(row, 0.3, 0.5);
        row.classList.add("hover");
        await wm.click(true);
      }
    }
    this.path = path;
    const crumbs = this.crumbs(w.body, path, root);
    gsap.fromTo(crumbs.lastElementChild, { opacity: 0, x: 10 }, { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" });
    const sorted = [...entries].sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    gsap.to(list.children, { opacity: 0, x: -8, duration: 0.15, stagger: 0.005 });
    await wm.sleep(160, e);
    list.innerHTML = sorted.length
      ? sorted.map((x) => `<div class="row" role="listitem" data-name="${esc(x.name)}" title="${esc(x.path || x.name)}">${x.dir ? ICONS.folder : ICONS.file}<span class="n">${esc(x.name)}</span><span class="s">${x.size || ""}</span></div>`).join("")
      : `<p class="empty">This folder is empty</p>`;
    list.scrollTop = 0;
    gsap.fromTo(list.children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, stagger: Math.min(0.03, 0.6 / Math.max(1, sorted.length)), ease: "power2.out" });
    // Skim the list like a person would.
    const rows = Array.from(list.querySelectorAll(".row")).slice(0, 8);
    for (const r of rows.filter((_, i) => i % 3 === 0)) {
      await wm.pointAt(r, 0.35, 0.5, 300);
      r.classList.add("hover");
      await wm.sleep(180, e);
      r.classList.remove("hover");
    }
    if (sorted.length > 12) {
      wm.robot.setPose("read");
      gsap.to(list, { scrollTop: list.scrollHeight, duration: Math.min(2.5, sorted.length * 0.05) / wm.speed, ease: "power1.inOut" });
      await wm.sleep(Math.min(2500, sorted.length * 50), e);
    }
  }

  async search(query: string, path: string, hits: Hit[], root: string | null) {
    const wm = this.wm, e = wm.epoch;
    const w = await this.ensure();
    const box = w.body.querySelector(".search-box") as HTMLElement;
    const files = w.body.querySelector(".files")!;
    this.crumbs(w.body, path, root);
    await wm.pointAt(box, 0.6, 0.5);
    await wm.click();
    box.classList.add("active");
    await typeInto(wm, box.querySelector(".q") as HTMLElement, query, { budgetMs: 900 });
    files.classList.add("searching");
    const list = w.body.querySelector(".files-list") as HTMLElement;
    const byFile = new Map<string, Hit[]>();
    for (const h of hits) { const k = relPath(h.file, root); if (!byFile.has(k)) byFile.set(k, []); byFile.get(k)!.push(h); }
    let re: RegExp | null = null;
    try { re = query ? new RegExp(query.replace(/\\b/g, ""), "gi") : null; } catch { re = null; }
    const mark = (t: string) => {
      const s = esc(t.trim().slice(0, 160));
      if (!re) return s;
      try { return s.replace(re, (m) => `<mark>${m}</mark>`); } catch { return s; }
    };
    list.innerHTML = byFile.size
      ? [...byFile.entries()].map(([f, hs]) => `
          <div class="hit-file row" title="${esc(f)}">${ICONS.file}<span class="n">${esc(f)}</span><span class="s">${hs.length}</span></div>
          ${hs.slice(0, 4).map((h) => `<div class="hit-line">${h.line ? `<b>${h.line}</b>` : ""}<code>${mark(h.text)}</code></div>`).join("")}`).join("")
      : `<p class="empty">No matches for “${esc(query)}”</p>`;
    list.scrollTop = 0;
    gsap.fromTo(list.children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.025, ease: "power2.out" });
    wm.robot.setPose("read");
    const lines = Array.from(list.querySelectorAll(".hit-file")).slice(0, 4);
    for (const l of lines) { await wm.pointAt(l, 0.3, 0.5, 260); await wm.sleep(260, e); }
    box.classList.remove("active");
  }
}

// ---------------------------------------------------------------------------
type Tab = { path: string; el: HTMLElement };
export class EditorApp {
  private tabs = new Map<string, Tab>();
  constructor(private wm: WM) {}

  private async ensure(path: string) {
    const w = await this.wm.open("editor", baseName(path));
    if (!w.body.querySelector(".editor")) {
      w.body.innerHTML = `<div class="editor"><div class="tabs" role="tablist"></div><div class="code-wrap"><div class="code"></div></div></div>`;
      this.tabs.clear();
    }
    const tabsEl = w.body.querySelector(".tabs") as HTMLElement;
    let tab = this.tabs.get(path);
    if (!tab) {
      const t = el(`<div class="tab" role="tab" title="${esc(path)}"><span>${esc(baseName(path))}</span></div>`);
      tabsEl.appendChild(t);
      gsap.fromTo(t, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3 });
      tab = { path, el: t };
      this.tabs.set(path, tab);
      if (this.tabs.size > 5) { const first = this.tabs.values().next().value!; first.el.remove(); this.tabs.delete(first.path); }
    }
    for (const t of this.tabs.values()) t.el.classList.toggle("on", t === tab);
    tab.el.scrollIntoView({ inline: "nearest", block: "nearest" });
    return { w, code: w.body.querySelector(".code") as HTMLElement, wrap: w.body.querySelector(".code-wrap") as HTMLElement };
  }

  private line(n: number | string, html: string, cls = "") {
    return `<div class="ln ${cls}"><b>${n}</b><span>${html || " "}</span></div>`;
  }

  async read(path: string, lines: string[], start: number) {
    const wm = this.wm, e = wm.epoch;
    const { code, wrap } = await this.ensure(path);
    const lang = langOf(path);
    code.innerHTML = lines.map((l, i) => this.line(start + i, highlight(l, lang))).join("") || this.line(1, "", "muted");
    wrap.scrollTop = 0;
    gsap.fromTo(code, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    wm.robot.setPose("read");
    // Reading: a soft band moves down the lines while the view scrolls along.
    const band = el(`<div class="read-band"></div>`);
    code.appendChild(band);
    const lh = 17;
    const total = Math.min(lines.length, 400);
    const dur = Math.min(4.5, 0.6 + total * 0.025);
    await wm.pointAt(wrap, 0.7, 0.4, 300);
    gsap.fromTo(band, { y: 0 }, { y: Math.max(0, total * lh - lh), duration: dur / wm.speed, ease: "none" });
    gsap.to(wrap, { scrollTop: Math.max(0, total * lh - wrap.clientHeight * 0.6), duration: dur / wm.speed, ease: "power1.inOut" });
    await wm.sleep(dur * 1000, e);
    band.remove();
  }

  async removed(path: string) {
    const { code } = await this.ensure(path);
    code.innerHTML = this.line("", "This file was deleted", "muted del");
    gsap.fromTo(code, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    await this.wm.sleep(900);
  }

  async diff(path: string, hunks: Hunk[]) {
    const wm = this.wm, e = wm.epoch;
    const { code, wrap } = await this.ensure(path);
    const lang = langOf(path);
    // Lay out what the file looked like around each change, then make the change.
    code.innerHTML = "";
    const pending: { add: HTMLElement[]; del: HTMLElement[] }[] = [];
    hunks.forEach((h, hi) => {
      if (hi > 0) code.appendChild(el(`<div class="ln gap"><b></b><span>⋯</span></div>`));
      let oldN = h.oldStart, newN = h.newStart;
      const group = { add: [] as HTMLElement[], del: [] as HTMLElement[] };
      for (const l of h.lines) {
        if (l.kind === " ") { code.appendChild(el(this.line(newN, highlight(l.text, lang)))); oldN++; newN++; }
        else if (l.kind === "-") { const d = el(this.line(oldN, highlight(l.text, lang), "del")); code.appendChild(d); group.del.push(d); oldN++; }
        else { const a = el(this.line(newN, "", "add pending")); a.dataset.text = l.text; code.appendChild(a); group.add.push(a); newN++; }
      }
      pending.push(group);
    });
    gsap.fromTo(code, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    let typedBudget = 1400; // characters typed visibly per change; the rest lands line by line
    for (const g of pending) {
      const first = g.del[0] || g.add[0];
      if (first) {
        gsap.to(wrap, { scrollTop: Math.max(0, first.offsetTop - 60), duration: 0.5 / wm.speed, ease: "power2.inOut" });
        await wm.pointAt(wrap, 0.2, Math.min(0.85, Math.max(0.15, (first.offsetTop - wrap.scrollTop) / wrap.clientHeight)), 320);
        await wm.click();
      }
      if (g.del.length) {
        g.del.forEach((d) => d.classList.add("selected"));
        await wm.sleep(260, e);
        wm.robot.setTyping(true);
        await new Promise<void>((r) => gsap.to(g.del, { height: 0, opacity: 0, duration: 0.3 / wm.speed, stagger: 0.02, ease: "power2.in", onComplete: () => r() }));
        wm.robot.setTyping(false);
        g.del.forEach((d) => d.remove());
      }
      for (const a of g.add) {
        wm.check(e);
        a.classList.remove("pending");
        const target = a.querySelector("span") as HTMLElement;
        const text = a.dataset.text || "";
        if (a.offsetTop - wrap.scrollTop > wrap.clientHeight - 40) gsap.to(wrap, { scrollTop: a.offsetTop - wrap.clientHeight / 2, duration: 0.3 / wm.speed });
        if (typedBudget > 0 && text.trim()) {
          typedBudget -= text.length;
          await typeInto(wm, target, text, { cps: 70, budgetMs: Math.min(900, 120 + text.length * 14), render: (s) => highlight(s, lang) });
        } else {
          target.innerHTML = highlight(text, lang) || " ";
          gsap.fromTo(a, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.2 });
          await wm.sleep(28, e);
        }
      }
    }
    await wm.sleep(500, e);
    gsap.to(code.querySelectorAll(".add"), { backgroundColor: "rgba(111,240,160,0)", duration: 1.6, ease: "sine.out" });
  }
}

// ---------------------------------------------------------------------------
export class TerminalApp {
  private cwdLabel = "";
  constructor(private wm: WM) {}

  setCwd(root: string | null) { this.cwdLabel = root ? baseName(root) : "~"; }

  private async ensure() {
    const w = await this.wm.open("terminal");
    if (!w.body.querySelector(".term")) w.body.innerHTML = `<div class="term"></div>`;
    return w.body.querySelector(".term") as HTMLElement;
  }

  // Type the command and return a handle to print its output once it finishes.
  async run(command: string) {
    const wm = this.wm;
    const term = await this.ensure();
    await wm.pointAt(term, 0.5, 0.85, 300);
    const block = el(`<div class="cmd"><div class="prompt"><i>${esc(this.cwdLabel)}</i><b>›</b><span class="c"></span></div><pre class="out"></pre></div>`);
    term.appendChild(block);
    while (term.children.length > 14) term.firstElementChild!.remove();
    term.scrollTop = term.scrollHeight;
    const shown = command.length > 600 ? command.slice(0, 600) + " …" : command;
    await typeInto(wm, block.querySelector(".c") as HTMLElement, shown, { budgetMs: Math.min(1800, 300 + shown.length * 10) });
    term.scrollTop = term.scrollHeight;
    const out = block.querySelector(".out") as HTMLElement;
    out.innerHTML = `<span class="spin-dot"></span>`;
    return {
      finish: async (output: string, exitCode: number | null | undefined) => {
        const e = wm.epoch;
        out.innerHTML = "";
        const ls = (output || "").replace(/\r/g, "").split("\n");
        while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
        const tail = ls.length > 160 ? [`… ${ls.length - 160} earlier lines`, ...ls.slice(-160)] : ls;
        const chunk = Math.max(1, Math.ceil(tail.length / 24));
        for (let i = 0; i < tail.length; i += chunk) {
          out.insertAdjacentHTML("beforeend", tail.slice(i, i + chunk).map((l) => esc(l)).join("\n") + "\n");
          term.scrollTop = term.scrollHeight;
          await wm.sleep(35, e);
        }
        if (exitCode != null && exitCode !== 0) out.insertAdjacentHTML("beforeend", `<span class="exit-bad">exited with code ${exitCode}</span>`);
        term.scrollTop = term.scrollHeight;
      },
    };
  }
}

// ---------------------------------------------------------------------------
export class BrowserApp {
  private tabs: { key: string; el: HTMLElement }[] = [];
  constructor(private wm: WM, private peek: (url: string) => Promise<any>) {}

  private async ensure() {
    const w = await this.wm.open("browser");
    if (!w.body.querySelector(".browser")) {
      w.body.innerHTML = `
        <div class="browser">
          <div class="b-tabs" role="tablist"></div>
          <div class="b-bar"><span class="b-addr"></span></div>
          <div class="b-progress"><i></i></div>
          <div class="b-page"></div>
        </div>`;
      this.tabs = [];
    }
    return w.body.querySelector(".browser") as HTMLElement;
  }

  // Show an in-page action (click, script, snapshot) on the robot's browser.
  async act(caption: string, title?: string, url?: string) {
    const wm = this.wm, e = wm.epoch;
    const b = await this.ensure();
    const page = b.querySelector(".b-page") as HTMLElement;
    if (url && !this.tabs.length) {
      const t = el(`<div class="b-tab on" role="tab"><span class="fav"></span><span class="tt"></span></div>`);
      t.querySelector(".tt")!.textContent = title || url;
      b.querySelector(".b-tabs")!.appendChild(t);
      this.tabs.push({ key: url, el: t });
      (b.querySelector(".b-addr") as HTMLElement).textContent = url.replace(/^https?:\/\//, "");
      if (!page.innerHTML.trim()) page.innerHTML = `<div class="b-search"><div class="b-q">${esc(title || url)}</div></div>`;
    }
    const chip = el(`<div class="b-action"></div>`);
    chip.textContent = caption;
    page.parentElement!.appendChild(chip);
    await wm.pointAt(page, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, 360);
    if (/Click/.test(caption)) await wm.click();
    gsap.fromTo(chip, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
    await wm.sleep(900, e);
    gsap.to(chip, { opacity: 0, duration: 0.3, onComplete: () => chip.remove() });
  }

  async visit(target: string) {
    const wm = this.wm, e = wm.epoch;
    const b = await this.ensure();
    const isUrl = /^https?:\/\//i.test(target);
    const label = isUrl ? new URL(target).hostname.replace(/^www\./, "") : target;
    const tabsEl = b.querySelector(".b-tabs") as HTMLElement;
    let tab = this.tabs.find((t) => t.key === target);
    if (!tab) {
      const t = el(`<div class="b-tab" role="tab"><span class="fav"></span><span class="tt"></span></div>`);
      t.querySelector(".tt")!.textContent = label;
      tabsEl.appendChild(t);
      gsap.fromTo(t, { width: 0, opacity: 0 }, { width: "auto", opacity: 1, duration: 0.35, ease: "power2.out" });
      tab = { key: target, el: t };
      this.tabs.push(tab);
      if (this.tabs.length > 4) this.tabs.shift()!.el.remove();
    }
    for (const t of this.tabs) t.el.classList.toggle("on", t === tab);
    const addr = b.querySelector(".b-addr") as HTMLElement;
    await wm.pointAt(addr, 0.4, 0.5);
    await wm.click();
    addr.classList.add("editing");
    await typeInto(wm, addr, isUrl ? target.replace(/^https?:\/\//, "") : target, { budgetMs: 1000 });
    addr.classList.remove("editing");
    const page = b.querySelector(".b-page") as HTMLElement;
    const prog = b.querySelector(".b-progress") as HTMLElement;
    prog.classList.add("loading");
    gsap.to(page, { opacity: 0.3, duration: 0.2 });
    if (!isUrl) {
      page.innerHTML = `<div class="b-search"><div class="b-q">${esc(target)}</div><p class="muted">Searching the web for this</p></div>`;
      prog.classList.remove("loading");
      gsap.to(page, { opacity: 1, duration: 0.3 });
      await wm.sleep(900, e);
      return;
    }
    const res = await this.peek(target).catch(() => null);
    wm.check(e);
    prog.classList.remove("loading");
    if (res?.ok && (res.title || res.blocks?.length)) {
      tab.el.querySelector(".tt")!.textContent = res.title || label;
      page.innerHTML = `<article class="b-article">
          <p class="b-host">${esc(label)}</p>
          <h1>${esc(res.title || label)}</h1>
          ${res.description ? `<p class="b-desc">${esc(res.description)}</p>` : ""}
          ${(res.blocks || []).map((x: any) => x.tag === "pre" ? `<pre>${esc(x.text)}</pre>` : x.tag.startsWith("h") ? `<h2>${esc(x.text)}</h2>` : `<p>${esc(x.text)}</p>`).join("")}
        </article>`;
    } else {
      page.innerHTML = `<div class="b-search"><div class="b-q">${esc(label)}</div><p class="muted">${esc(res?.error ? "This page could not be loaded here." : "Opened this page.")}</p></div>`;
    }
    page.scrollTop = 0;
    gsap.fromTo(page, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" });
    wm.robot.setPose("read");
    await wm.pointAt(page, 0.6, 0.5, 400);
    const dur = Math.min(3.5, 1 + (page.scrollHeight / 400));
    gsap.to(page, { scrollTop: Math.max(0, page.scrollHeight - page.clientHeight), duration: dur / wm.speed, ease: "power1.inOut", delay: 0.4 / wm.speed });
    await wm.sleep(dur * 1000 + 400, e);
  }
}

// ---------------------------------------------------------------------------
function md(text: string) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '<u>$1</u>')
    .replace(/\n/g, "<br>");
}

export class ChatApp {
  constructor(private wm: WM) {}

  private async ensure() {
    const w = await this.wm.open("chat");
    if (!w.body.querySelector(".chat")) w.body.innerHTML = `<div class="chat"></div>`;
    return w.body.querySelector(".chat") as HTMLElement;
  }

  async user(text: string) {
    const chat = await this.ensure();
    const b = el(`<div class="msg you"><p></p></div>`);
    b.querySelector("p")!.innerHTML = md(text.slice(0, 1200));
    chat.appendChild(b);
    gsap.fromTo(b, { opacity: 0, y: 14, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.7)", transformOrigin: "100% 100%" });
    chat.scrollTop = chat.scrollHeight;
    await this.wm.sleep(500);
  }

  // Robot writes its reply. `getText` is polled so streaming replies keep growing.
  async assistant(getText: () => { text: string; done: boolean }) {
    const wm = this.wm, e = wm.epoch;
    const chat = await this.ensure();
    const b = el(`<div class="msg bot"><p></p></div>`);
    chat.appendChild(b);
    gsap.fromTo(b, { opacity: 0, y: 14, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.7)", transformOrigin: "0% 100%" });
    const p = b.querySelector("p") as HTMLElement;
    let shown = 0;
    wm.robot.setTyping(true);
    try {
      for (;;) {
        const { text, done } = getText();
        if (shown < text.length) {
          const step = Math.max(2, Math.ceil((text.length - shown) / 40));
          shown = Math.min(text.length, shown + step);
          p.innerHTML = md(text.slice(0, shown)) + '<span class="caret"></span>';
          chat.scrollTop = chat.scrollHeight;
          await wm.sleep(28, e);
        } else if (done) break;
        else await wm.sleep(120, e);
      }
    } finally {
      wm.robot.setTyping(false);
    }
    p.innerHTML = md(getText().text);
    chat.scrollTop = chat.scrollHeight;
  }

  async note(text: string, kind: "ask" | "error" = "ask") {
    const chat = await this.ensure();
    const b = el(`<div class="msg bot ${kind}"><p></p></div>`);
    b.querySelector("p")!.innerHTML = md(text);
    chat.appendChild(b);
    gsap.fromTo(b, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.7)" });
    chat.scrollTop = chat.scrollHeight;
  }
}

// ---------------------------------------------------------------------------
export function prettyTool(name: string) {
  const m = name.match(/^mcp__(.+?)__(.+)$/) || name.match(/^([\w-]+)\.(.+)$/);
  const words = (s: string) => s.replace(/[_-]+/g, " ").trim();
  if (m) return { app: words(m[1]).replace(/^t3 code$/i, "T3 Code").replace(/\b\w/g, (c) => c.toUpperCase()), action: words(m[2]) };
  return { app: "Tool", action: words(name) };
}

export class ToolApp {
  constructor(private wm: WM) {}
  async picture(name: string, src: string | null) {
    const w = await this.wm.open("tool", name);
    w.body.innerHTML = src
      ? `<div class="pic"><img alt="${esc(name)}"></div>`
      : `<div class="tool"><h3>${esc(name)}</h3><p class="muted">This image could not be shown.</p></div>`;
    if (src) (w.body.querySelector("img") as HTMLImageElement).src = src;
    gsap.fromTo(w.body.firstElementChild, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" });
    this.wm.robot.setPose("read");
    await this.wm.pointAt(w.body, 0.5, 0.5, 400);
    await this.wm.sleep(1600);
  }
  async show(toolName: string, input: unknown) {
    const { app, action } = prettyTool(toolName);
    const w = await this.wm.open("tool", app);
    const entries = input && typeof input === "object" ? Object.entries(input as Record<string, unknown>).slice(0, 5) : [];
    const fmt = (v: unknown) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return esc((s || "").replace(/\s+/g, " ").slice(0, 90));
    };
    w.body.innerHTML = `<div class="tool"><h3>${esc(action)}</h3><dl>${entries.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${fmt(v)}</dd>`).join("")}</dl><div class="tool-run"><i></i></div></div>`;
    gsap.fromTo(w.body.querySelectorAll("h3, dt, dd"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.3 });
    await this.wm.pointAt(w.body.querySelector("h3")!, 0.3, 0.5, 300);
    await this.wm.click();
    await this.wm.sleep(900);
  }
}
