// Standalone demo: every game in its own window with a fake robot host.
// Query: ?only=voxelvalley,uptime  ?skill=0.8  ?max=90000  ?speed=4 (faster robot waits, for outcome-rate runs)
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import gsap from "gsap";
import type { FunHost, FunOpts, Outcome } from "../fun/host";
import { playVoxelValley, playUptimeTillDawn, playTicTacToe, playConnectFour, playBitMerge, playRustwaterBay, playTidewatchTactics, playDerBugger, playBoot } from "./index";
import { GAME_TITLES } from "./catalog";

class Cancel extends Error {}

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --mono: "JetBrains Mono Variable", ui-monospace, monospace; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #141a33; color: #eef0ff; font-family: var(--font); }
  #games-demo { padding: 18px 22px 40px; }
  .d-top { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .d-top h1 { margin: 0; font-size: 17px; font-weight: 600; }
  .d-top button { border: 0; border-radius: 9px; padding: 7px 13px; background: #ff9f5a; color: #2a1407; font: 600 13px var(--font); cursor: pointer; }
  .d-top button:hover { background: #ffbf86; }
  .d-top .d-note { color: #8a91c4; font-size: 12px; }
  .d-grid { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
  .d-panel { display: flex; flex-direction: column; gap: 6px; width: 440px; }
  .d-win { position: relative; border-radius: 10px; overflow: hidden; background: #1d2252; box-shadow: 0 12px 30px rgba(4, 6, 24, 0.5); }
  .d-bar { height: 26px; display: flex; align-items: center; padding: 0 10px; background: #2e3577; font-size: 11px; color: #fff; }
  .d-body { position: relative; overflow: hidden; }
  .d-log { font-size: 11px; color: #b9bfe6; min-height: 30px; font-variant-numeric: tabular-nums; line-height: 1.4; }
  .d-log b { color: #fff; font-weight: 500; }
  .d-cursor { position: absolute; left: 0; top: 0; z-index: 50; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4)); }
  .d-ring { position: absolute; z-index: 49; width: 24px; height: 24px; margin: -12px 0 0 -12px; border-radius: 50%; background: rgba(255,255,255,0.4); pointer-events: none; }
  .d-key { position: absolute; right: 8px; top: 4px; z-index: 60; padding: 3px 7px; border-radius: 5px; background: rgba(246, 236, 220, 0.92); color: #141a33; font: 600 10px var(--mono); opacity: 0; pointer-events: none; }
`;
document.head.appendChild(style);

const params = new URLSearchParams(location.search);
const only = params.get("only")?.split(",") ?? null;
const skill = params.has("skill") ? Number(params.get("skill")) : undefined;
const maxMs = Number(params.get("max") || 90000);
const once = params.get("once") === "1";
const speed = Math.max(0.1, Number(params.get("speed") || 1));
type Log = { panel: string; outcome: Outcome | string; at: number };
const LOG: Log[] = [];
const state = { LOG, reacts: [] as string[], taps: {} as Record<string, number>, stop: () => {} };
(window as unknown as { __games: typeof state }).__games = state;

class FakeHost implements FunHost {
  stopped = false;
  private pending = new Set<() => void>();
  private pos = { x: 60, y: 60 };
  constructor(private id: string, private win: HTMLElement, private cursor: HTMLElement, private keyEl: HTMLElement, private note: (s: string) => void) {}

  sleep(ms: number) {
    return new Promise<void>((resolve, reject) => {
      if (this.stopped) return reject(new Cancel());
      const id = window.setTimeout(() => { this.pending.delete(cancel); resolve(); }, ms / speed);
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
    const r = el.getBoundingClientRect(), p = this.win.getBoundingClientRect();
    const x = r.left - p.left + r.width * ax, y = r.top - p.top + r.height * ay;
    const dist = Math.hypot(x - this.pos.x, y - this.pos.y);
    const dur = Math.max(0.12, Math.min(0.9, (ms / 1000) * (0.45 + dist / 700))) / speed;
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
    state.taps[`${this.id}:${key}`] = (state.taps[`${this.id}:${key}`] || 0) + 1;
    this.keyEl.textContent = key === " " ? "Space" : key.replace("Arrow", "");
    gsap.fromTo(this.keyEl, { opacity: 1, scale: 1.15 }, { opacity: 0, scale: 1, duration: 0.5, ease: "power2.out" });
  }
  react(kind: string) {
    state.reacts.push(`${this.id}:${kind}`);
    this.note(`react <b>${kind}</b>`);
  }
}

const root = document.getElementById("games-demo")!;
root.innerHTML = `<div class="d-top"><h1>Games pack</h1><button type="button" class="d-toggle">Stop all</button><span class="d-note">Stop flips host.stopped for every window</span></div><div class="d-grid"></div>`;
const grid = root.querySelector(".d-grid") as HTMLElement;
const hosts = new Set<FakeHost>();
let running = true;

type Run = (body: HTMLElement, host: FunHost, opts: FunOpts) => Promise<Outcome>;
function panel(id: string, title: string, run: Run) {
  if (only && !only.includes(id)) return null;
  const p = document.createElement("div");
  p.className = "d-panel";
  p.dataset.id = id;
  p.innerHTML = `<div class="d-win"><div class="d-bar">${title}</div><div class="d-body" style="width:440px;height:366px"></div><span class="d-key"></span></div><div class="d-log"></div>`;
  grid.appendChild(p);
  const win = p.querySelector(".d-win") as HTMLElement;
  const body = p.querySelector(".d-body") as HTMLElement;
  const log = p.querySelector(".d-log") as HTMLElement;
  const keyEl = p.querySelector(".d-key") as HTMLElement;
  const cursor = document.createElement("div");
  cursor.className = "d-cursor";
  cursor.innerHTML = `<svg viewBox="0 0 20 24" width="15" height="18"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.4 L16.5 13 Z" fill="#fff"/><path d="M3.6 4.4 L3.6 15.6 L7.4 12.3 L10.9 19.6 L11.6 19.3 L8.2 12 L12.8 11.7 Z" fill="#11142c"/></svg>`;
  win.appendChild(cursor);
  gsap.set(cursor, { x: 60, y: 60 });
  let lastOutcome = "";
  const note = (s: string) => { log.innerHTML = `${lastOutcome}${lastOutcome ? "<br>" : ""}${s}`; };
  const counts: Record<string, number> = {};
  return async () => {
    while (running) {
      const host = new FakeHost(id, win, cursor, keyEl, note);
      hosts.add(host);
      const t0 = performance.now();
      try {
        const out = await run(body, host, { maxMs, skill });
        counts[out.result] = (counts[out.result] || 0) + 1;
        LOG.push({ panel: id, outcome: out, at: Math.round(performance.now() - t0) });
        lastOutcome = `Last <b>${out.result}</b>${out.score !== undefined ? ` score ${out.score}` : ""} in ${((performance.now() - t0) / 1000).toFixed(0)}s. Totals ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`;
        note("");
      } catch (e) {
        if (!(e instanceof Cancel)) { console.error(e); LOG.push({ panel: id, outcome: `error ${String(e)}`, at: Math.round(performance.now() - t0) }); }
        else LOG.push({ panel: id, outcome: "cancelled", at: Math.round(performance.now() - t0) });
      }
      hosts.delete(host);
      if (!running || once) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  };
}

const loops = [
  panel("voxelvalley", GAME_TITLES.voxelvalley, playVoxelValley),
  panel("uptime", GAME_TITLES.uptime, playUptimeTillDawn),
  panel("ttt", GAME_TITLES.tictactoe, playTicTacToe),
  panel("c4", GAME_TITLES.connect4, playConnectFour),
  panel("merge", GAME_TITLES.bitmerge, playBitMerge),
  panel("rustwater", GAME_TITLES.rustwater, playRustwaterBay),
  panel("tidewatch", GAME_TITLES.tidewatch, playTidewatchTactics),
  panel("bugger", GAME_TITLES.bugger, playDerBugger),
  panel("boot", GAME_TITLES.boot, playBoot),
].filter(Boolean) as (() => Promise<void>)[];

const startAll = () => { running = true; for (const l of loops) void l(); };
const stopAll = () => { running = false; for (const h of hosts) h.stop(); };
state.stop = stopAll;
const toggle = root.querySelector(".d-toggle") as HTMLButtonElement;
toggle.addEventListener("click", () => {
  if (running) { stopAll(); toggle.textContent = "Start all"; }
  else { toggle.textContent = "Stop all"; startAll(); }
});
startAll();
