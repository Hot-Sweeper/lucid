import gsap from "gsap";
import type { WM } from "./wm";
import type { ThreadInfo } from "../director";
import { ICONS } from "./icons";
import { logoSvg } from "../harness/logos";
import { typeInto, esc } from "./typing";
import { ratioOf } from "./imagegen";
import "./codex.css";

// The Codex desktop app on the robot's monitor, shown when its thread makes a picture. The robot
// types the real prompt into the composer, sends it, and waits while the picture is made; the
// frame fills in when the tool call really finishes, with the file the tool really wrote.

const MARK = logoSvg("codex") ?? "";
// the dock icon: the Codex mark, white on a dark tile
ICONS.codex = `<svg class="ico" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5.5" fill="#1b1b1f"/>${MARK.replace(/width="100%" height="100%"/, 'x="5.6" y="5.6" width="12.8" height="12.8" style="color:#fff"')}</svg>`;

const I = {
  plus: `<svg class="cx-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  up: `<svg class="cx-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3.5M3.8 7.4 8 3.2l4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  edit: `<svg class="cx-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5h3L13 6a1.8 1.8 0 0 0-2.5-2.5L3 11Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  search: `<svg class="cx-i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m10.4 10.4 3.1 3.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  bolt: `<svg class="cx-i" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1.8 3.8 9h3.5L6.8 14.2 12.2 7H8.6Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  clock: `<svg class="cx-i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  close: `<svg class="cx-i" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
};

export type GenState = { done: boolean; failed?: string; sources: string[] };
export type GenOutcome = "completed" | "failed" | "pending" | "unavailable";
const FRAME_H = 150;

function loadImage(src: string, ms = 9000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const t = window.setTimeout(() => resolve(null), ms);
    img.onload = () => { window.clearTimeout(t); resolve(img); };
    img.onerror = () => { window.clearTimeout(t); resolve(null); };
    img.src = src;
  });
}
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fileName = (src: string) => { try { return decodeURIComponent(src.replace(/^lucid-file:\/\/local\//, "")).split(/[\\/]/).pop() ?? ""; } catch { return ""; } };

export class CodexApp {
  private info: ThreadInfo | null = null;
  private presentation: { itemId: string; root: HTMLElement; block: HTMLElement; epoch: number; edit: boolean; since: number } | null = null;
  constructor(private wm: WM) {}

  reset() { this.presentation = null; }

  setInfo(info: ThreadInfo) {
    if (this.info && this.info.id !== info.id) this.reset();
    this.info = info;
    const r = this.root();
    if (r) this.paintInfo(r);
  }

  private root() { return (this.wm.wins.get("codex")?.body.querySelector(".cx") as HTMLElement | null) ?? null; }

  private paintInfo(r: HTMLElement) {
    const title = this.info?.title || "New thread", project = this.info?.projectTitle || "";
    r.querySelectorAll<HTMLElement>("[data-title]").forEach((e) => (e.textContent = title));
    r.querySelectorAll<HTMLElement>("[data-project]").forEach((e) => (e.textContent = project));
    const model = r.querySelector("[data-model]") as HTMLElement | null;
    if (model) model.textContent = this.info?.model || "";
  }

  private async ensure() {
    const w = await this.wm.open("codex");
    if (!w.body.querySelector(".cx")) {
      w.body.innerHTML = `<div class="cx">
        <aside class="cx-side">
          <div class="cx-brand"><span class="cx-logo">${MARK}</span><b>Codex</b></div>
          <nav class="cx-nav"><span>${I.edit}New thread</span><span>${I.search}Search</span><span>${I.bolt}Skills</span><span>${I.clock}Automations</span></nav>
          <div class="cx-grp">Threads</div>
          <div class="cx-th"><b data-title></b><i data-project></i></div>
        </aside>
        <main class="cx-main">
          <header class="cx-head"><b data-title></b><i data-project></i></header>
          <div class="cx-msgs"></div>
          <div class="cx-comp"><div class="cx-typed"></div>
            <div class="cx-row"><span class="cx-add" aria-hidden="true">${I.plus}</span><span class="cx-model" data-model></span><span class="cx-send" aria-label="Send">${I.up}</span></div></div>
        </main>
        <div class="cx-lb" hidden></div>
      </div>`;
      this.paintInfo(w.body.querySelector(".cx") as HTMLElement);
    }
    return w.body.querySelector(".cx") as HTMLElement;
  }

  /** Types the prompt, sends it and waits for the picture. `state` is read as the tool call goes on. */
  async generate(o: { itemId?: string; prompt: string; size?: string; edit?: boolean; state: () => GenState; instant?: boolean; maxMs?: number }): Promise<GenOutcome> {
    this.presentation = null;
    const wm = this.wm, e = wm.epoch;
    const root = await this.ensure();
    const msgs = root.querySelector(".cx-msgs") as HTMLElement;
    const typed = root.querySelector(".cx-typed") as HTMLElement;
    const send = root.querySelector(".cx-send") as HTMLElement;
    const prompt = o.prompt || (o.edit ? "Edit the image" : "Generate an image");
    const toEnd = () => msgs.scrollTo({ top: msgs.scrollHeight, behavior: calm() || o.instant ? "auto" : "smooth" });
    wm.robot.setPose("mouse");

    // the prompt goes into the composer, key by key, and is sent
    if (!o.instant) {
      await wm.pointAt(typed, 0.3, 0.5, 420);
      await wm.click();
      const follow = window.setInterval(() => { typed.scrollTop = typed.scrollHeight; }, 50);
      try { await typeInto(wm, typed, prompt, { budgetMs: Math.min(4200, 900 + prompt.length * 12) }); } finally { window.clearInterval(follow); }
      await wm.sleep(260, e);
      await wm.pointAt(send, 0.5, 0.5, 320);
      send.classList.add("on");
      await wm.click();
      wm.check(e);
    }
    typed.textContent = "";
    send.classList.remove("on");

    const mine = document.createElement("div");
    mine.className = "cx-u";
    mine.innerHTML = `<p>${esc(prompt)}</p>`;
    msgs.appendChild(mine);
    const ratio = ratioOf(o.size);
    const block = document.createElement("div");
    block.className = "cx-a";
    block.innerHTML = `<div class="cx-line"><span class="cx-shim">${o.edit ? "Editing image" : "Generating image"}</span><span class="cx-el">0s</span></div>
      <div class="cx-frame" style="height:${FRAME_H}px;width:${Math.round(FRAME_H * ratio)}px"><div class="cx-wait"></div></div>`;
    msgs.appendChild(block);
    if (o.itemId) this.presentation = { itemId: o.itemId, root, block, epoch: e, edit: !!o.edit, since: Date.now() };
    if (!o.instant) {
      gsap.from(mine, { opacity: 0, y: 8, duration: 0.3, ease: "power2.out" });
      gsap.from(block, { opacity: 0, duration: 0.3, delay: 0.2 });
    }
    toEnd();
    wm.robot.setPose("read");

    // it takes as long as it takes: the clock shows real seconds, the frame stays empty until the file exists
    const t0 = Date.now(), limit = o.maxMs ?? 150000;
    const clock = block.querySelector(".cx-el") as HTMLElement;
    let st = o.state();
    while (!st.done && !st.failed && Date.now() - t0 < limit) {
      await wm.sleep(250, e);
      clock.textContent = `${Math.floor((Date.now() - t0) / 1000)}s`;
      st = o.state();
    }
    const line = block.querySelector(".cx-line") as HTMLElement;
    const frame = block.querySelector(".cx-frame") as HTMLElement;
    if (st.failed || !st.done) {
      line.innerHTML = `<span>${st.failed ? "Image generation failed" : "Image generation is taking long"}</span>`;
      frame.remove();
      if (st.failed) block.insertAdjacentHTML("beforeend", `<p class="cx-err">${esc(st.failed.slice(0, 200))}</p>`);
      wm.robot.react?.(st.failed ? "surprised" : "relax");
      await wm.sleep(900, e);
      return st.failed ? "failed" : "pending";
    }

    // the picture arrives
    const imgs: HTMLImageElement[] = [];
    for (const src of st.sources.slice(0, 3)) { const im = await loadImage(src); wm.check(e); if (im) imgs.push(im); }
    line.innerHTML = `<span>${o.edit ? "Edited image" : "Generated image"}</span><span class="cx-el">${Math.floor((Date.now() - t0) / 1000)}s</span>`;
    if (!imgs.length) {
      line.textContent = "Image preview unavailable";
      frame.remove();
      block.insertAdjacentHTML("beforeend", `<p class="cx-err">${st.sources.length ? /^data:/i.test(st.sources[0]) ? "The returned image could not be opened here." : `Saved as ${esc(fileName(st.sources[0]) || "an image file")}, but the file could not be opened here.` : "The tool finished without returning a picture."}</p>`);
      await wm.sleep(900, e);
      return "unavailable";
    }
    const row = document.createElement("div");
    row.className = "cx-pics";
    for (const im of imgs) {
      const fig = document.createElement("figure");
      fig.className = "cx-pic";
      const r = Math.min(1.8, Math.max(0.55, im.naturalWidth / (im.naturalHeight || 1)));
      fig.style.cssText = `height:${FRAME_H}px;width:${Math.round(FRAME_H * r)}px`;
      im.alt = "Generated image";
      im.draggable = false;
      fig.appendChild(im);
      row.appendChild(fig);
    }
    frame.replaceWith(row);
    const names = st.sources.slice(0, imgs.length).map(fileName).filter(Boolean);
    if (names.length) block.insertAdjacentHTML("beforeend", `<p class="cx-file">${esc(names[0])}${names.length > 1 ? ` and ${names.length - 1} more` : ""}</p>`);
    if (!o.instant && !calm()) {
      gsap.fromTo(imgs, { opacity: 0, scale: 1.05, filter: "blur(18px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.9, ease: "power2.out", clearProps: "filter" });
      wm.robot.react?.("surprised");
    }
    toEnd();
    await wm.sleep(o.instant ? 200 : 1100, e);
    if (o.instant) return "completed";

    // a closer look: click it open, look, close it again
    if (Math.random() < 0.7) {
      wm.robot.setPose("mouse");
      const pic = row.querySelector(".cx-pic") as HTMLElement;
      await wm.pointAt(pic, 0.5, 0.5, 460);
      await wm.click();
      const lb = root.querySelector(".cx-lb") as HTMLElement;
      lb.innerHTML = `<img alt="Generated image"><button type="button" class="cx-x" tabindex="-1">${I.close}<span>Close</span></button>`;
      (lb.querySelector("img") as HTMLImageElement).src = imgs[0].src;
      lb.hidden = false;
      gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      gsap.fromTo(lb.querySelector("img"), { scale: 0.9 }, { scale: 1, duration: 0.4, ease: "back.out(1.4)" });
      wm.robot.setPose("read");
      await wm.sleep(1700 + Math.random() * 1200, e);
      await wm.pointAt(lb.querySelector(".cx-x")!, 0.5, 0.5, 420);
      await wm.click();
      gsap.to(lb, { opacity: 0, duration: 0.2, onComplete: () => { lb.hidden = true; lb.innerHTML = ""; } });
      await wm.sleep(300, e);
    }
    return "completed";
  }

  /** Update the same real tool's result block without opening, typing, or stealing focus. */
  async refresh(itemId: string, state: GenState, valid: () => boolean): Promise<GenOutcome | null> {
    const p = this.presentation;
    const alive = () => !!p && this.presentation === p && p.itemId === itemId && p.epoch === this.wm.epoch && p.block.isConnected && this.root() === p.root && valid();
    if (!alive() || (!state.done && !state.failed)) return null;
    const imgs = state.failed ? [] : (await Promise.all(state.sources.slice(0, 3).map((src) => loadImage(src)))).filter((im): im is HTMLImageElement => !!im);
    if (!alive() || !p) return null;
    const line = p.block.querySelector(".cx-line") as HTMLElement;
    p.block.querySelectorAll(".cx-frame, .cx-pics, .cx-err, .cx-file").forEach((node) => node.remove());
    if (state.failed) {
      line.textContent = "Image generation failed";
      p.block.insertAdjacentHTML("beforeend", `<p class="cx-err">${esc(state.failed.slice(0, 200))}</p>`);
      return "failed";
    }
    if (!imgs.length) {
      line.textContent = "Image preview unavailable";
      p.block.insertAdjacentHTML("beforeend", `<p class="cx-err">${state.sources.length ? "The returned image could not be opened here." : "The tool finished without returning a picture."}</p>`);
      return "unavailable";
    }
    line.innerHTML = `<span>${p.edit ? "Edited image" : "Generated image"}</span><span class="cx-el">${Math.floor((Date.now() - p.since) / 1000)}s</span>`;
    const row = document.createElement("div");
    row.className = "cx-pics";
    for (const im of imgs) {
      const fig = document.createElement("figure");
      fig.className = "cx-pic";
      const ratio = Math.min(1.8, Math.max(0.55, im.naturalWidth / (im.naturalHeight || 1)));
      fig.style.cssText = `height:${FRAME_H}px;width:${Math.round(FRAME_H * ratio)}px`;
      im.alt = p.edit ? "Edited image" : "Generated image";
      im.draggable = false;
      fig.appendChild(im);
      row.appendChild(fig);
    }
    p.block.appendChild(row);
    const msgs = p.root.querySelector(".cx-msgs") as HTMLElement;
    msgs.scrollTop = msgs.scrollHeight;
    return "completed";
  }
}
