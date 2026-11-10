// Standalone demo: every game and media piece side by side with a fake robot host.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import gsap from "gsap";
import "./fun.css";
import type { FunHost, FunOpts, Outcome } from "./host";
import { playSnake, playFlappy, playDash, watchPhoneFeed, watchTube, browseBenchtop, watchBotflix, VIDEOS, BENCHTOP_VIDEOS, drawThumbnail } from "./index";
import { fitCanvas } from "./util";
import { SHOWS, drawArt, renderStage } from "./shows";
import { GAME_TITLES } from "../games/catalog";

class Cancel extends Error {}

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --mono: "JetBrains Mono Variable", ui-monospace, monospace; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #141a33; color: #eef0ff; font-family: var(--font); }
  #fun-demo { padding: 18px 22px 40px; }
  .d-top { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .d-top h1 { margin: 0; font-size: 17px; font-weight: 600; }
  .d-top button { border: 0; border-radius: 9px; padding: 7px 13px; background: #ff9f5a; color: #2a1407; font: 600 13px var(--font); cursor: pointer; }
  .d-top button:hover { background: #ffbf86; }
  .d-top .d-note { color: #8a91c4; font-size: 12px; }
  .d-grid { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
  .d-panel { display: flex; flex-direction: column; gap: 6px; }
  .d-win { position: relative; border-radius: 10px; overflow: hidden; background: #1d2252; box-shadow: 0 12px 30px rgba(4, 6, 24, 0.5); }
  .d-bar { height: 26px; display: flex; align-items: center; padding: 0 10px; background: #2e3577; font-size: 11px; color: #fff; }
  .d-body { position: relative; overflow: hidden; }
  .d-phone { padding: 8px; border-radius: 22px; background: #0b0e26; box-shadow: 0 12px 30px rgba(4, 6, 24, 0.5); }
  .d-phone .d-body { border-radius: 15px; }
  .d-log { font-size: 11px; color: #b9bfe6; min-height: 30px; font-variant-numeric: tabular-nums; line-height: 1.4; max-width: 740px; }
  .d-log b { color: #fff; font-weight: 500; }
  .d-cursor { position: absolute; left: 0; top: 0; z-index: 50; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4)); }
  .d-ring { position: absolute; z-index: 49; width: 24px; height: 24px; margin: -12px 0 0 -12px; border-radius: 50%; background: rgba(255,255,255,0.4); pointer-events: none; }
  .d-key { position: absolute; right: 8px; bottom: 8px; z-index: 60; padding: 3px 7px; border-radius: 5px; background: rgba(246, 236, 220, 0.9); color: #141a33; font: 600 10px var(--mono); opacity: 0; pointer-events: none; }
  .d-videos { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 26px; }
  .d-videos figure { margin: 0; display: flex; flex-direction: column; gap: 4px; font-size: 10.5px; color: #b9bfe6; }
  .d-videos canvas { border-radius: 8px; display: block; }
`;
document.head.appendChild(style);

const params = new URLSearchParams(location.search);
const only = params.get("only")?.split(",") ?? null;
const skill = params.has("skill") ? Number(params.get("skill")) : undefined;
const maxMs = Number(params.get("max") || 90000);
const LOG: { panel: string; outcome: Outcome | string; at: number }[] = [];
(window as unknown as { __fun: unknown }).__fun = { LOG, reacts: [] as string[] };

class FakeHost implements FunHost {
  stopped = false;
  private pending = new Set<() => void>();
  private pos = { x: 60, y: 60 };
  constructor(private win: HTMLElement, private cursor: HTMLElement | null, private keyEl: HTMLElement | null, private note: (s: string) => void) {}

  sleep(ms: number) {
    return new Promise<void>((resolve, reject) => {
      if (this.stopped) return reject(new Cancel());
      const id = window.setTimeout(() => { this.pending.delete(cancel); resolve(); }, ms);
      const cancel = () => { window.clearTimeout(id); reject(new Cancel()); };
      this.pending.add(cancel);
    });
  }
  stop() {
    this.stopped = true;
    for (const c of this.pending) c();
    this.pending.clear();
  }
  async pointAt(el: Element, ax = 0.5, ay = 0.5, ms = 520) {
    if (!this.cursor) return;
    const r = el.getBoundingClientRect(), p = this.win.getBoundingClientRect();
    const x = r.left - p.left + r.width * ax, y = r.top - p.top + r.height * ay;
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
  tap(key = " ") {
    if (!this.keyEl) return;
    this.keyEl.textContent = key === " " ? "Space" : key.replace("Arrow", "");
    gsap.fromTo(this.keyEl, { opacity: 1, scale: 1.15 }, { opacity: 0, scale: 1, duration: 0.5, ease: "power2.out" });
  }
  react(kind: string) {
    (window as unknown as { __fun: { reacts: string[] } }).__fun.reacts.push(kind);
    this.note(`react <b>${kind}</b>`);
  }
  thumb(kind: string) { this.note(`thumb <b>${kind}</b>`); }
}

const root = document.getElementById("fun-demo")!;
root.innerHTML = `<div class="d-top"><h1>Lucid fun pack</h1><button type="button" class="d-toggle">Stop all</button><span class="d-note">Stop flips host.stopped for every panel</span></div><div class="d-grid"></div><div class="d-videos"></div>`;
const grid = root.querySelector(".d-grid") as HTMLElement;
const hosts = new Set<FakeHost>();
let running = true;

type Run = (body: HTMLElement, host: FunHost, opts: FunOpts) => Promise<Outcome>;
function panel(id: string, title: string, w: number, h: number, run: Run, phone = false) {
  if (only && !only.includes(id)) return;
  const p = document.createElement("div");
  p.className = "d-panel";
  p.innerHTML = phone
    ? `<div class="d-phone"><div class="d-body" style="width:${w}px;height:${h}px"></div></div><div class="d-log"></div>`
    : `<div class="d-win"><div class="d-bar">${title}</div><div class="d-body" style="width:${w}px;height:${h}px"></div><span class="d-key"></span></div><div class="d-log"></div>`;
  grid.appendChild(p);
  const win = p.querySelector(phone ? ".d-body" : ".d-win") as HTMLElement;
  const body = p.querySelector(".d-body") as HTMLElement;
  const log = p.querySelector(".d-log") as HTMLElement;
  let cursor: HTMLElement | null = null;
  if (!phone) {
    cursor = document.createElement("div");
    cursor.className = "d-cursor";
    cursor.innerHTML = `<svg viewBox="0 0 20 24" width="15" height="18"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.4 L16.5 13 Z" fill="#fff"/><path d="M3.6 4.4 L3.6 15.6 L7.4 12.3 L10.9 19.6 L11.6 19.3 L8.2 12 L12.8 11.7 Z" fill="#11142c"/></svg>`;
    win.appendChild(cursor);
    gsap.set(cursor, { x: 60, y: 60 });
  }
  const keyEl = p.querySelector(".d-key") as HTMLElement | null;
  let lastOutcome = "";
  const note = (s: string) => { log.innerHTML = `${lastOutcome}${lastOutcome ? "<br>" : ""}${s}`; };
  const counts: Record<string, number> = {};
  const loop = async () => {
    while (running) {
      const host = new FakeHost(win, cursor, keyEl, note);
      hosts.add(host);
      try {
        const out = await run(body, host, { maxMs, skill });
        counts[out.result] = (counts[out.result] || 0) + 1;
        LOG.push({ panel: id, outcome: out, at: Math.round(performance.now()) });
        lastOutcome = `Last <b>${out.result}</b>${out.score !== undefined ? ` score ${out.score}` : ""}. Totals ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`;
        note("");
      } catch (e) {
        if (!(e instanceof Cancel)) { console.error(e); LOG.push({ panel: id, outcome: `error ${String(e)}`, at: Math.round(performance.now()) }); }
        else LOG.push({ panel: id, outcome: "cancelled", at: Math.round(performance.now()) });
      }
      hosts.delete(host);
      if (!running) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  };
  return loop;
}

const loops = [
  panel("snake", GAME_TITLES.snake, 440, 366, playSnake),
  panel("flappy", GAME_TITLES.flappy, 440, 366, playFlappy),
  panel("dash", GAME_TITLES.dash, 440, 366, playDash),
  panel("phone", "Phone", 150, 300, watchPhoneFeed, true),
  panel("tube", "Browser", 740, 330, watchTube),
  panel("th", "Browser", 740, 330, browseBenchtop),
  // Botflix in a browser-sized window (740 x 390 frame, 364 body). ?bfw=&bfh= try other window sizes.
  panel("botflix", "Botflix", Number(params.get("bfw") || 740), Number(params.get("bfh") || 364),
    (b, h, o) => watchBotflix(b, h, { maxMs: o.maxMs, me: params.get("me") || undefined }).then((r) => ({ result: "done" as const, score: r.result === "closed" ? 0 : 1 }))),
].filter(Boolean) as (() => Promise<void>)[];

const startAll = () => { running = true; for (const l of loops) void l(); };
const toggle = root.querySelector(".d-toggle") as HTMLButtonElement;
toggle.addEventListener("click", () => {
  if (running) {
    running = false;
    for (const h of hosts) h.stop();
    toggle.textContent = "Start all";
  } else {
    toggle.textContent = "Stop all";
    startAll();
  }
});
startAll();

// Video gallery: every procedural video in landscape and portrait.
if (!only || only.includes("videos")) {
  const galEl = root.querySelector(".d-videos") as HTMLElement;
  // ?gal=parody (or a comma list of ids) filters the gallery; ?gw=556&gh=313 sets the landscape size; ?portrait=0 skips phone shapes
  const gal = params.get("gal");
  const pool = [...VIDEOS, ...BENCHTOP_VIDEOS];
  const all = !gal ? pool : gal === "parody" ? pool.filter((v) => v.id.startsWith("p-")) : pool.filter((v) => gal.split(",").includes(v.id));
  const GW = Number(params.get("gw") || 240), GH = Number(params.get("gh") || 135);
  const sizes = params.get("portrait") === "0" ? [[GW, GH]] : [[GW, GH], [76, 135]];
  const items: { ctx: CanvasRenderingContext2D; v: (typeof all)[number]; w: number; h: number }[] = [];
  for (const v of all) {
    for (const [w, h] of sizes) {
      const fig = document.createElement("figure");
      const c = document.createElement("canvas");
      fig.appendChild(c);
      if (w > 100) { const cap = document.createElement("figcaption"); cap.textContent = v.title; fig.appendChild(cap); }
      galEl.appendChild(fig);
      items.push({ ctx: fitCanvas(c, w, h), v, w, h });
    }
  }
  const thumbs = params.get("thumbs") === "1";
  const t0 = performance.now();
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    for (const it of items) {
      it.ctx.save();
      if (thumbs) drawThumbnail(it.v, it.ctx, it.w, it.h);
      else it.v.draw(it.ctx, it.w, it.h, params.has("t") ? Number(params.get("t")) : t);
      it.ctx.restore();
    }
    if (!thumbs && !params.has("t")) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Botflix gallery: every show as a tile, a poster, the hero crop and a close-up. ?only=bfgal
if (only?.includes("bfgal")) {
  const gal = document.createElement("div");
  gal.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 26px;margin-top:18px";
  root.appendChild(gal);
  const sized = (w: number, h: number) => { const c = document.createElement("canvas"); c.style.borderRadius = "4px"; return { c, ctx: fitCanvas(c, w, h) }; };
  for (const s of SHOWS) {
    const fig = document.createElement("figure");
    fig.style.cssText = "margin:0;display:flex;gap:8px;align-items:flex-end;font-size:11px;color:#b9bfe6";
    const tile = sized(200, 112), poster = sized(76, 114), hero = sized(250, 112), ep = sized(120, 68);
    drawArt(tile.ctx, s, 200, 112, "tile");
    drawArt(poster.ctx, s, 76, 114, "poster");
    renderStage(hero.ctx, s, 250, 112, s.thumbT, s.hero ?? s.key);
    drawArt(ep.ctx, s, 120, 68, "ep", s.thumbT, 1);
    fig.append(tile.c, poster.c, hero.c, ep.c);
    gal.appendChild(fig);
  }
}
