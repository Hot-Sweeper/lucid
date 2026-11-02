import gsap from "gsap";
import { WM } from "./wm";
import { ICONS } from "./icons";
import { highlight, langOf } from "./highlight";
import { baseName, relPath, type Entry, type Hit, type Hunk } from "./classify";

import { esc, el, typeInto } from "./typing";
import { colorGitLine } from "./git";
import { detectSheet, playSheet, playerFrame } from "./sheet";
import { t3Icon, t3Title } from "../harness/t3code";
import { describeTool, factTitles, isT3Tool, prettyTool, toolActivity, toolViewHtml, toolViewKey, type ToolState, type UploadLookup, type WatchedView } from "./tool-view";
import "./tool-view.css";
export { BrowserApp } from "./browser";
export { prettyTool, toolActivity };

// ---------------------------------------------------------------------------
export { FilesApp } from "./explorer";

// ---------------------------------------------------------------------------
type Tab = { path: string; el: HTMLElement };
export class EditorApp {
  private tabs = new Map<string, Tab>();
  constructor(private wm: WM) {}

  private async ensure(path: string) {
    const ed = this.wm.prefs?.editor ?? "studio";
    const appName = ed === "pad" ? "Notepad" : ed === "vim" ? "vim" : "Studio";
    // Notepad and vim have their own icons (dock, window bar and app switcher)
    this.wm.brandApp("editor", { icon: ed === "pad" ? ICONS.editorPad : ed === "vim" ? ICONS.editorVim : ICONS.editor });
    const w = await this.wm.open("editor", `${baseName(path)}  ${appName}`);
    if (!w.body.querySelector(".editor")) {
      w.body.innerHTML = `<div class="editor ed-${ed}"><div class="tabs" role="tablist"></div><div class="code-wrap"><div class="code"></div></div>${ed === "vim" ? `<div class="vim-bar"><b>-- INSERT --</b><span></span></div>` : ""}</div>`;
      this.tabs.clear();
    }
    const bar = w.body.querySelector(".vim-bar span");
    if (bar) bar.textContent = path.replace(/\\/g, "/").split("/").slice(-2).join("/");
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
    // scroll only the tab strip; scrollIntoView would also scroll the office around the screen
    const strip = tab.el.parentElement as HTMLElement;
    if (tab.el.offsetLeft + tab.el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = tab.el.offsetLeft + tab.el.offsetWidth - strip.clientWidth;
    else if (tab.el.offsetLeft < strip.scrollLeft) strip.scrollLeft = tab.el.offsetLeft;
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
    // One steady typing speed for the whole change, picked up front from its size:
    // short edits are typed at a human pace, long files faster, but never faster mid-file.
    const total = hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === "+").reduce((m, l) => m + l.text.length + 1, 0), 0);
    const targetSec = Math.min(16, Math.max(2.5, total / 55));
    const cps = Math.max(28, total / targetSec);
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
        if (text.trim()) {
          await typeInto(wm, target, text, { cps, budgetMs: 1e9, render: (s) => highlight(s, lang) });
        } else {
          target.innerHTML = " ";
          wm.robot.pressKey("Enter");
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
        // git and gh output gets the colours a real terminal shows
        const paint = /(^|[\s;&|(])(git|gh)(\.exe)?\s/.test(command) ? (l: string) => colorGitLine(esc(l)) : esc;
        for (let i = 0; i < tail.length; i += chunk) {
          out.insertAdjacentHTML("beforeend", tail.slice(i, i + chunk).map((l) => paint(l)).join("\n") + "\n");
          term.scrollTop = term.scrollHeight;
          await wm.sleep(35, e);
        }
        if (exitCode != null && exitCode !== 0) out.insertAdjacentHTML("beforeend", `<span class="exit-bad">exited with code ${exitCode}</span>`);
        term.scrollTop = term.scrollHeight;
      },
    };
  }

  /** Ctrl+click the last link printed in the terminal (a pull request URL, say). */
  async clickLink(match: RegExp = /github\.com/) {
    const term = this.wm.wins.get("terminal")?.body.querySelector(".term");
    const links = term ? Array.from(term.querySelectorAll(".g-url")).filter((l) => match.test(l.textContent || "")) : [];
    const link = links[links.length - 1];
    if (!link) return false;
    await this.wm.pointAt(link, 0.4, 0.5, 360);
    link.classList.add("hover");
    this.wm.robot.pressKey("Control");
    await this.wm.click();
    return true;
  }
}

// ---------------------------------------------------------------------------
export class ToolApp {
  constructor(private wm: WM) {}
  /**
   * An image the robot looked at. A sprite sheet (frames in a row or grid) plays like a video;
   * `data` reads the picture as a data URL so its pixels can be analysed.
   */
  async picture(name: string, src: string | null, data?: () => Promise<string | null>) {
    const epoch = this.wm.epoch;
    // a sheet opens in the player, a picture in Photos: find out which before the window opens
    const probe = src && data
      ? data().then((d) => (d ? detectSheet(d, name, () => this.wm.epoch === epoch).then((f) => f && { f, d }) : null)).catch(() => null)
      : Promise.resolve(null);
    const sheet = await probe;
    this.wm.check(epoch);
    if (sheet) {
      // the player window is sized to the frames, so the video fills it
      this.wm.frameHint.player = playerFrame(sheet.f.sheet, this.wm.width, this.wm.height);
      const w = await this.wm.open("player", name);
      await playSheet(this.wm, w.body, sheet.f);
      return;
    }
    const w = await this.wm.open("photos", name);
    w.body.innerHTML = src
      ? `<div class="pic"><img alt="${esc(name)}"></div>`
      : `<div class="tool"><h3>${esc(name)}</h3><p class="muted">This image could not be shown.</p></div>`;
    if (src) (w.body.querySelector("img") as HTMLImageElement).src = src;
    gsap.fromTo(w.body.firstElementChild, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" });
    this.wm.robot.setPose("read");
    // robots that like full screen windows look at pictures full screen; others now and then
    const fs = this.wm.prefs?.windows === "fullscreen";
    const big = !!src && Math.random() < (fs ? 0.85 : 0.25);
    if (big) await this.wm.maximize("photos");
    await this.wm.pointAt(w.body, 0.5, 0.5, 400);
    await this.wm.sleep(big ? 2600 : 1600);
    if (big && !fs) await this.wm.unmaximize("photos");
  }
  /**
   * Shows an operation that has no app of its own. The view states only what the event carries and
   * is brought up to date with `refresh` when the real outcome arrives.
   */
  async show(toolName: string, input: unknown, state: () => ToolState, uploads?: UploadLookup): Promise<WatchedView> {
    const wm = this.wm;
    const t3 = isT3Tool(toolName);
    const channel = wm.prefs?.t3 === "nightly" ? "nightly" : "stable";
    const first = describeTool(toolName, input, state(), uploads);
    const icon = t3 ? t3Icon(channel) : ICONS.tool;
    wm.brandApp("tool", { icon });
    const w = await wm.open("tool", t3 ? t3Title(channel) : first.app);
    const barIcon = w.el.querySelector(".win-bar > .ico");
    if (barIcon) { const tmp = document.createElement("div"); tmp.innerHTML = icon; if (tmp.firstElementChild) barIcon.replaceWith(tmp.firstElementChild); }
    const root = document.createElement("div");
    root.className = `tool tv${t3 ? " tv-t3" : ""}`;
    root.dataset.channel = channel;
    let shown = "";
    const paint = (animate: boolean) => {
      const v = describeTool(toolName, input, state(), uploads);
      const key = toolViewKey(v);
      if (key === shown) return;
      const settling = shown !== "" && root.dataset.phase === "pending" && v.phase !== "pending";
      shown = key;
      root.dataset.phase = v.phase;
      root.innerHTML = toolViewHtml(v, factTitles(toolName, input, state()));
      if (animate && settling && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const mark = root.querySelector(".tv-state");
        if (mark) gsap.fromTo(mark, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(2.2)" });
        const reason = root.querySelector(".tv-note");
        if (reason) gsap.fromTo(reason, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      }
    };
    // The frame is small on purpose. If a reason or a long name needs more room, the window grows
    // by exactly that much (and keeps its bottom edge on screen) instead of clipping what it says.
    const fit = (animate: boolean) => {
      const need = Math.ceil(root.scrollHeight - root.clientHeight);
      if (need <= 0 || !root.isConnected) return;
      const frame = w.el.style, top = parseFloat(frame.top) || 0, h = parseFloat(frame.height) || w.el.offsetHeight;
      const next = Math.min(h + need, wm.height - 8), y = Math.max(4, Math.min(top, wm.height - next - 4));
      const to = { height: next, top: y };
      if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(w.el, { ...to, duration: 0.2, ease: "power2.out", overwrite: "auto" });
      else Object.assign(frame, { height: `${next}px`, top: `${y}px` });
    };
    paint(false);
    w.body.replaceChildren(root);
    fit(false);
    gsap.killTweensOf(root);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    wm.robot.setPose("read");
    // rest the cursor on the file tile (or the headline), clear of the text being read
    const tile = root.querySelector(".tv-tile"), value = root.querySelector(".tv-facts dd");
    if (tile) await wm.pointAt(tile as HTMLElement, 0.85, 0.9, 300);
    else if (value) await wm.pointAt(value as HTMLElement, 0.95, 0.5, 300);
    await wm.sleep(500);
    return {
      live: () => root.isConnected,
      // true while the call is still running: the director keeps following the item until it settles
      refresh: () => {
        if (!root.isConnected) return false;
        paint(true); fit(true);
        return root.dataset.phase === "pending";
      },
    };
  }
}
