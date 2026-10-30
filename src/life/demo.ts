import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import gsap from "gsap";
import "./life.css";
import type { FunHost } from "./types";
import { makeBeat } from "./beats";
import { hangOutInChat } from "./chat";

// Demo: both apps side by side, each driven by a fake robot host.
// URL params: fast=2 (speed up robot waits), max=120000, only=beat|chat, scale=0.8

const qs = new URLSearchParams(location.search);
const FAST = Number(qs.get("fast") || 1);
const MAX = Number(qs.get("max") || 180000);
const ONLY = qs.get("only");
const SCALE = Number(qs.get("scale") || 1);
const STOP_AT = Number(qs.get("stopAt") || 0);

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --mono: "JetBrains Mono Variable", ui-monospace, monospace; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #0e1228; color: #eef0ff; font-family: var(--font); }
  #demo { display: flex; flex-wrap: wrap; gap: 24px; padding: 20px; align-items: flex-start; }
  .d-col { display: flex; flex-direction: column; gap: 8px; }
  .d-scale { transform-origin: 0 0; }
  .d-win { width: 740px; border-radius: 10px; overflow: hidden; background: #1d2252; box-shadow: 0 16px 40px rgba(4, 6, 24, 0.6); }
  .d-bar { height: 26px; display: flex; align-items: center; padding: 0 10px; background: #2e3577; font-size: 11px; color: #fff; gap: 8px; }
  .d-bar i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.18); margin-left: auto; }
  .d-body { position: relative; width: 740px; height: 330px; }
  .d-cursor { position: absolute; left: 0; top: 0; z-index: 99; pointer-events: none; }
  .d-ring { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: rgba(255,255,255,.35); pointer-events: none; z-index: 98; }
  .d-ctl { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #b9bfe6; }
  .d-ctl button { border: 0; border-radius: 7px; padding: 6px 12px; background: #ff9f5a; color: #2a1407; font: inherit; font-weight: 600; cursor: pointer; }
  .d-ctl button:hover { background: #ffbf86; }
  .d-log { height: 74px; overflow: hidden; font-family: var(--mono); font-size: 10.5px; color: #8a91c4; display: flex; flex-direction: column-reverse; }
  .d-log b { color: #4ff0a0; font-weight: 500; }
`;
document.head.appendChild(style);

const CURSOR = `<svg viewBox="0 0 20 24" width="15" height="18"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.4 L16.5 13 Z" fill="#fff"/><path d="M3.6 4.4 L3.6 15.6 L7.4 12.3 L10.9 19.6 L11.6 19.3 L8.2 12 L12.8 11.7 Z" fill="#11142c"/></svg>`;

class FakeHost implements FunHost {
  stopped = false;
  private pos = { x: 370, y: 165 };
  constructor(private body: HTMLElement, private cursor: HTMLElement, private log: (s: string) => void) {
    gsap.set(cursor, { x: this.pos.x, y: this.pos.y });
  }
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
    const k = b.width / this.body.offsetWidth || 1;
    const x = (r.left - b.left + r.width * ax) / k, y = (r.top - b.top + r.height * ay) / k;
    const from = { ...this.pos };
    const dist = Math.hypot(x - from.x, y - from.y);
    const dur = Math.max(0.16, Math.min(0.9, (ms / 1000) * (0.45 + dist / 700))) / FAST;
    const bend = (Math.random() - 0.5) * Math.min(80, dist * 0.25);
    const mx = (from.x + x) / 2 - ((y - from.y) / (dist || 1)) * bend, my = (from.y + y) / 2 + ((x - from.x) / (dist || 1)) * bend;
    const p = { t: 0 };
    await new Promise<void>((res) => gsap.to(p, {
      t: 1, duration: dur, ease: "power2.inOut",
      onUpdate: () => {
        const t = p.t, u = 1 - t;
        this.pos.x = u * u * from.x + 2 * u * t * mx + t * t * x;
        this.pos.y = u * u * from.y + 2 * u * t * my + t * t * y;
        gsap.set(this.cursor, { x: this.pos.x, y: this.pos.y });
      },
      onComplete: () => res(),
    }));
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
  tap(key = " ") { this.log(`key <b>${key === " " ? "Space" : key}</b>`); }
  react(kind: string) { this.log(`react <b>${kind}</b>`); }
}

function mount(title: string, run: (body: HTMLElement, host: FunHost) => Promise<unknown>) {
  const col = document.createElement("div");
  col.className = "d-col";
  col.innerHTML = `<div class="d-scale"><div class="d-win"><div class="d-bar">${title}<i></i></div><div class="d-body"></div></div></div>
    <div class="d-ctl"><button class="d-stop">Stop</button><button class="d-again">Restart</button><span class="d-state"></span></div><div class="d-log"></div>`;
  document.getElementById("demo")!.appendChild(col);
  const scaler = col.querySelector(".d-scale") as HTMLElement;
  if (SCALE !== 1) { scaler.style.transform = `scale(${SCALE})`; scaler.style.height = `${356 * SCALE}px`; scaler.style.width = `${740 * SCALE}px`; }
  const body = col.querySelector(".d-body") as HTMLElement;
  const logEl = col.querySelector(".d-log") as HTMLElement;
  const state = col.querySelector(".d-state") as HTMLElement;
  let host: FakeHost | null = null;
  const lines: string[] = [];
  const log = (s: string) => { lines.unshift(s); lines.length = Math.min(lines.length, 6); logEl.innerHTML = lines.map((l) => `<div>${l}</div>`).join(""); };
  const start = () => {
    if (host) host.stopped = true;
    body.innerHTML = "";
    const cursor = document.createElement("div");
    cursor.className = "d-cursor";
    cursor.innerHTML = CURSOR;
    const inner = document.createElement("div");
    inner.style.cssText = "position:absolute;inset:0";
    body.append(inner, cursor);
    const h = new FakeHost(body, cursor, log);
    host = h;
    state.textContent = "Running";
    const leftovers = () => gsap.getTweensOf(inner.querySelectorAll("*")).length;
    run(inner, h).then((o) => { if (host === h) state.textContent = `Returned ${JSON.stringify(o)}, live tweens ${leftovers()}`; }, (e) => { if (host === h) state.textContent = `Stopped: ${e.message}, live tweens ${leftovers()}`; });
  };
  col.querySelector(".d-stop")!.addEventListener("click", () => { if (host) host.stopped = true; });
  col.querySelector(".d-again")!.addEventListener("click", start);
  start();
  if (STOP_AT) setTimeout(() => { if (host) host.stopped = true; }, STOP_AT);
}

document.fonts.ready.then(() => {
  if (ONLY !== "chat") mount("BeatLab", (b, h) => makeBeat(b, h, { maxMs: MAX }));
  if (ONLY !== "beat") mount("Botcord", (b, h) => hangOutInChat(b, h, { maxMs: MAX, me: "lucid-bot" }));
});
