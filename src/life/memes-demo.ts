import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import gsap from "gsap";
import "./life.css";
import type { FunHost } from "./types";
import { hangOutInChat } from "./chat";
import { GIFS } from "./gifs";
import { GifReel } from "./gifreel";
import { VW, setFamily, setPxScale } from "./gifkit";
import { drawGifFrame } from "./gifs";

// Demo: every meme GIF looping at chat size, plus Botcord running with a fake robot host.
// URL params: w=216 (gif width), freeze=1.2 (show one moment), sheet=1 (contact sheet of
// frames per gif), only=grid|chat, fast=2, max=180000, gifs=1 (Botcord leans on GIF scenes)

const qs = new URLSearchParams(location.search);
const W = Number(qs.get("w") || 216);
const FREEZE = qs.has("freeze") ? Number(qs.get("freeze")) : undefined;
const ONLY = qs.get("only");
const FAST = Number(qs.get("fast") || 1);
const MAX = Number(qs.get("max") || 180000);

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --mono: "JetBrains Mono Variable", ui-monospace, monospace; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #0e1228; color: #eef0ff; font-family: var(--font); }
  #demo { display: flex; flex-wrap: wrap; gap: 28px; padding: 20px; align-items: flex-start; }
  .m-grid { display: grid; grid-template-columns: repeat(var(--cols, 5), auto); gap: 14px 12px; }
  .m-cell { display: flex; flex-direction: column; gap: 5px; font-size: 11px; color: #8a91c4; }
  .m-cell canvas { border-radius: 8px; display: block; }
  .m-sheet { display: flex; flex-direction: column; gap: 10px; }
  .m-row { display: flex; gap: 8px; align-items: center; }
  .m-row span { width: 80px; font-size: 11px; color: #8a91c4; }
  .m-row canvas { border-radius: 6px; display: block; }
  .d-win { width: 740px; border-radius: 10px; overflow: hidden; background: #1d2252; box-shadow: 0 16px 40px rgba(4, 6, 24, 0.6); }
  .d-bar { height: 26px; display: flex; align-items: center; padding: 0 10px; background: #2e3577; font-size: 11px; color: #fff; }
  .d-body { position: relative; width: 740px; height: 330px; }
  .d-cursor { position: absolute; left: 0; top: 0; z-index: 99; pointer-events: none; }
  .d-ring { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: rgba(255,255,255,.35); pointer-events: none; z-index: 98; }
  .d-state { font-size: 11px; color: #8a91c4; margin-top: 8px; font-family: var(--mono); }
`;
document.head.appendChild(style);

const CURSOR = `<svg viewBox="0 0 20 24" width="15" height="18"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.4 L16.5 13 Z" fill="#fff"/><path d="M3.6 4.4 L3.6 15.6 L7.4 12.3 L10.9 19.6 L11.6 19.3 L8.2 12 L12.8 11.7 Z" fill="#11142c"/></svg>`;

class FakeHost implements FunHost {
  stopped = false;
  private pos = { x: 370, y: 165 };
  constructor(private body: HTMLElement, private cursor: HTMLElement) { gsap.set(cursor, { x: this.pos.x, y: this.pos.y }); }
  sleep(ms: number) {
    return new Promise<void>((resolve, reject) => {
      const t0 = performance.now();
      const tick = () => {
        if (this.stopped) return reject(new Error("interrupted"));
        if (performance.now() - t0 >= ms / FAST) return resolve();
        setTimeout(tick, Math.min(40, ms));
      };
      tick();
    });
  }
  async pointAt(el: Element, ax = 0.5, ay = 0.5, ms = 520) {
    if (this.stopped) throw new Error("interrupted");
    const r = el.getBoundingClientRect(), b = this.body.getBoundingClientRect();
    const x = r.left - b.left + r.width * ax, y = r.top - b.top + r.height * ay;
    const dist = Math.hypot(x - this.pos.x, y - this.pos.y);
    const dur = Math.max(0.16, Math.min(0.9, (ms / 1000) * (0.45 + dist / 700))) / FAST;
    await new Promise<void>((res) => gsap.to(this.pos, { x, y, duration: dur, ease: "power2.inOut", onUpdate: () => gsap.set(this.cursor, { x: this.pos.x, y: this.pos.y }), onComplete: () => res() }));
    if (this.stopped) throw new Error("interrupted");
  }
  async click() {
    const ring = document.createElement("span");
    ring.className = "d-ring";
    ring.style.left = this.pos.x + "px";
    ring.style.top = this.pos.y + "px";
    this.body.appendChild(ring);
    gsap.fromTo(ring, { scale: 0.2, opacity: 0.8 }, { scale: 1.4, opacity: 0, duration: 0.4, ease: "power2.out", onComplete: () => ring.remove() });
    await this.sleep(90);
  }
  tap() {}
  react() {}
}

function grid() {
  const g = document.createElement("div");
  g.className = "m-grid";
  if (W > 300) g.style.setProperty("--cols", "3");
  document.getElementById("demo")!.appendChild(g);
  const reel = new GifReel(undefined, { freezeAt: FREEZE });
  for (const gif of GIFS) {
    const cell = document.createElement("div");
    cell.className = "m-cell";
    const cv = document.createElement("canvas");
    cell.append(cv, `${gif.kind}  ${gif.dur}s`);
    g.appendChild(cell);
    reel.add(cv, gif.kind, W);
  }
}

// Several moments of every loop side by side, to judge motion from a still screenshot.
function sheet() {
  const s = document.createElement("div");
  s.className = "m-sheet";
  document.getElementById("demo")!.appendChild(s);
  const phases = (qs.get("phases") || "0.05,0.25,0.45,0.65,0.85").split(",").map(Number);
  const draw = () => {
    s.innerHTML = "";
    setFamily(getComputedStyle(document.documentElement).getPropertyValue("--font"));
    for (const gif of GIFS) {
      if (qs.get("kinds") && !qs.get("kinds")!.split(",").includes(gif.kind)) continue;
      const row = document.createElement("div");
      row.className = "m-row";
      row.innerHTML = `<span>${gif.kind}</span>`;
      for (const ph of phases) {
        const cv = document.createElement("canvas");
        cv.width = W * 2; cv.height = Math.round(W * 0.75) * 2;
        cv.style.width = W + "px"; cv.style.height = Math.round(W * 0.75) + "px";
        const c = cv.getContext("2d")!;
        const k = (W * 2) / VW;
        c.setTransform(k, 0, 0, k, 0, 0);
        setPxScale(k);
        drawGifFrame(c, gif.kind, ph * gif.dur);
        row.appendChild(cv);
      }
      s.appendChild(row);
    }
  };
  draw();
}

function chat() {
  const col = document.createElement("div");
  col.innerHTML = `<div class="d-win"><div class="d-bar">Botcord</div><div class="d-body"></div></div><div class="d-state">Running</div>`;
  document.getElementById("demo")!.appendChild(col);
  const body = col.querySelector(".d-body") as HTMLElement;
  const state = col.querySelector(".d-state") as HTMLElement;
  const cursor = document.createElement("div");
  cursor.className = "d-cursor";
  cursor.innerHTML = CURSOR;
  const inner = document.createElement("div");
  inner.style.cssText = "position:absolute;inset:0";
  body.append(inner, cursor);
  const host = new FakeHost(body, cursor);
  (window as unknown as { stopChat: () => void }).stopChat = () => { host.stopped = true; };
  const t0 = performance.now();
  hangOutInChat(inner, host, { maxMs: MAX, me: "lucid-bot" }).then(
    (o) => { state.textContent = `Returned ${JSON.stringify(o)} after ${Math.round((performance.now() - t0) / 1000)}s`; },
    (e) => { state.textContent = `Threw ${e.message}`; },
  );
}

document.fonts.ready.then(() => {
  if (qs.get("sheet")) { sheet(); return; }
  if (ONLY !== "chat") grid();
  if (ONLY !== "grid") chat();
});
