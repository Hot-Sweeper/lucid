// Standalone demo: every social and pastime app in a window or phone with a fake robot host.
// ?only=botsapp,chirp picks panels. ?max=60000 sets the session length.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import gsap from "gsap";
import type { FunHost } from "../fun/host";
import { DEMO_APPS } from "./index";

class Cancel extends Error {}

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --mono: "JetBrains Mono Variable", ui-monospace, monospace; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #141a33; color: #eef0ff; font-family: var(--font); }
  #so-demo { padding: 16px 20px 40px; }
  .d-grid { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .d-panel { display: flex; flex-direction: column; gap: 5px; }
  .d-win { position: relative; border-radius: 10px; overflow: hidden; background: #1d2252; box-shadow: 0 12px 30px rgba(4, 6, 24, 0.5); }
  .d-bar { height: 26px; display: flex; align-items: center; padding: 0 10px; background: #2e3577; font-size: 11px; color: #fff; }
  .d-body { position: relative; overflow: hidden; }
  .d-phone { padding: 8px; border-radius: 22px; background: #1a1d2e; box-shadow: 0 12px 30px rgba(4, 6, 24, 0.5); }
  .d-phone .d-body { border-radius: 15px; background: #0e1233; }
  .d-log { font-size: 10px; color: #8a91c4; min-height: 14px; max-width: 660px; }
  .d-cursor { position: absolute; left: 0; top: 0; z-index: 50; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4)); }
  .d-ring { position: absolute; z-index: 49; width: 24px; height: 24px; margin: -12px 0 0 -12px; border-radius: 50%; background: rgba(255,255,255,0.4); pointer-events: none; }
`;
document.head.appendChild(style);

const params = new URLSearchParams(location.search);
const only = params.get("only")?.split(",") ?? null;
const maxMs = Number(params.get("max") || 90000);
const scale = Number(params.get("zoom") || 1);
const W = window as unknown as { __so: { log: string[]; errors: string[] } };
W.__so = { log: [], errors: [] };
window.addEventListener("error", (e) => W.__so.errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => W.__so.errors.push(String(e.reason)));

class FakeHost implements FunHost {
  stopped = false;
  private pos = { x: 60, y: 60 };
  constructor(private win: HTMLElement, private cursor: HTMLElement | null, private log: HTMLElement) {}
  sleep(ms: number) {
    return new Promise<void>((resolve, reject) => {
      if (this.stopped) return reject(new Cancel());
      window.setTimeout(() => (this.stopped ? reject(new Cancel()) : resolve()), ms);
    });
  }
  async pointAt(el: Element, ax = 0.5, ay = 0.5, ms = 520) {
    if (!this.cursor) return;
    const r = el.getBoundingClientRect(), p = this.win.getBoundingClientRect();
    const x = (r.left - p.left + r.width * ax) / scale, y = (r.top - p.top + r.height * ay) / scale;
    const dist = Math.hypot(x - this.pos.x, y - this.pos.y);
    const dur = Math.max(0.16, Math.min(0.9, (ms / 1000) * (0.45 + dist / 700)));
    this.pos = { x, y };
    await new Promise<void>((res) => gsap.to(this.cursor, { x, y, duration: dur, ease: "power2.inOut", onComplete: res }));
    if (this.stopped) throw new Cancel();
  }
  async click() {
    const ring = document.createElement("span");
    ring.className = "d-ring";
    ring.style.left = `${this.pos.x}px`;
    ring.style.top = `${this.pos.y}px`;
    this.win.appendChild(ring);
    gsap.fromTo(ring, { scale: 0.2, opacity: 0.8 }, { scale: 1.6, opacity: 0, duration: 0.45, ease: "power2.out", onComplete: () => ring.remove() });
    await this.sleep(110);
  }
  tap() {}
  react(kind: string) { this.log.textContent = `react ${kind}`; W.__so.log.push(kind); }
  thumb() {}
}

const root = document.getElementById("so-demo")!;
root.innerHTML = `<div class="d-grid"></div>`;
const grid = root.querySelector(".d-grid") as HTMLElement;
if (scale !== 1) grid.style.zoom = String(scale);

if (params.has("desk")) void import("./desk-demo").then((m) => m.runDesk(root));
for (const app of params.has("desk") ? [] : DEMO_APPS) {
  if (only && !only.includes(app.id)) continue;
  const p = document.createElement("div");
  p.className = "d-panel";
  p.dataset.id = app.id;
  p.innerHTML = app.phone
    ? `<div class="d-phone"><div class="d-body" style="width:134px;height:284px"></div></div><div class="d-log"></div>`
    : `<div class="d-win"><div class="d-bar"></div><div class="d-body" style="width:${app.w}px;height:${app.h - 26}px"></div></div><div class="d-log"></div>`;
  grid.appendChild(p);
  if (!app.phone) p.querySelector(".d-bar")!.textContent = app.title;
  const win = p.querySelector(app.phone ? ".d-body" : ".d-win") as HTMLElement;
  const body = p.querySelector(".d-body") as HTMLElement;
  const log = p.querySelector(".d-log") as HTMLElement;
  let cursor: HTMLElement | null = null;
  if (!app.phone) {
    cursor = document.createElement("div");
    cursor.className = "d-cursor";
    cursor.innerHTML = `<svg viewBox="0 0 20 24" width="15" height="18"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.4 L16.5 13 Z" fill="#fff"/><path d="M3.6 4.4 L3.6 15.6 L7.4 12.3 L10.9 19.6 L11.6 19.3 L8.2 12 L12.8 11.7 Z" fill="#11142c"/></svg>`;
    win.appendChild(cursor);
    gsap.set(cursor, { x: 60, y: 60 });
  }
  void (async () => {
    for (;;) {
      const host = new FakeHost(win, cursor, log);
      try { await app.run(body, host, { maxMs, me: "Pip", phone: app.phone, skill: 0.7 }); log.textContent = "done"; }
      catch (e) { if (!(e instanceof Cancel)) { console.error(e); W.__so.errors.push(`${app.id}: ${String((e as Error)?.stack ?? e)}`); log.textContent = String(e); return; } }
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
}
