// Test bench: a real robot at a stand-in desk driving a real desktop (WM), running one scene.
//   #mouse    sketchpad drawing, with the cursor path and the physical mouse path compared
//   #codex    the Codex app making a picture (?img=<file path> shows a real file, else a drawn one)
//   #skip     Botify playing and skipping songs
//   #steam    Steambot: store, library, install, play
//   #trading  Tradebot: charts, orders, mistakes
// The scene name goes in the hash because the Electron screenshot run appends its own query.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import "../office/office.css";
import "../world/world.css";
import { UNIT } from "../office/rig";
import { TopDownRobot } from "../world/seated";
import { DemoDesk } from "../world/demo-desk";
import { WM, Cancelled } from "../os/wm";
import { IdleLife } from "../os/idle";
import { MusicApp } from "../os/music";
import { CodexApp } from "../os/codex";
import { fileUrl } from "../office/chat-panel";
import type { Prefs } from "../office/roster";

const hash = location.hash.slice(1).replace(/\?.*$/, "");
const SCENE = hash || new URLSearchParams(location.search).get("scene") || "mouse";
const IMG = new URLSearchParams(location.search).get("img");
const W = window as unknown as { __lc: { log: string[]; errors: string[]; stats: Record<string, unknown> } };
W.__lc = { log: [], errors: [], stats: {} };
window.addEventListener("error", (e) => W.__lc.errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => W.__lc.errors.push(String(e.reason)));

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --mono: "JetBrains Mono Variable", ui-monospace, monospace; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #20253d; color: #eef0ff; font-family: var(--font); }
  #demo { display: flex; gap: 14px; padding: 10px; align-items: flex-start; }
  #screen { position: relative; width: 820px; height: 461px; flex: none; overflow: hidden; border-radius: 8px; }
  .lc-side { position: relative; width: ${UNIT.w * 1.7}px; height: ${UNIT.h * 1.7}px; flex: none; overflow: hidden; background: #c49a6c; }
  .lc-zoom { position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: scale(1.7); width: ${UNIT.w}px; height: ${UNIT.h}px; }
  .world-demo-desk { position: absolute; left: 0; top: 0; }
  .world-demo-table { position: absolute; left: 0; top: 0; overflow: visible; }
  .world-demo-key { fill: #5a6177; }
  .world-demo-key.down { fill: #9fe8ff; }
  .world-demo-monitor { position: absolute; border-radius: 12px; background: linear-gradient(170deg, #2a2f45, #151927 70%); }
  .world-demo-screen { position: absolute; border-radius: 6px; overflow: hidden; background: #0e1233; }
  .world-demo-robot { position: absolute; inset: 0; pointer-events: none; }
  .world-demo-phone { display: none; }
  .lc-log { position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 8px; font: 11px var(--mono); background: rgba(0,0,0,.55); color: #cfe; z-index: 40; }
`;
document.head.appendChild(style);

const root = document.getElementById("demo")!;
root.innerHTML = `<div id="screen"></div><div class="lc-side"><div class="lc-zoom"></div></div>`;
const screen = document.getElementById("screen")!;
const zoom = root.querySelector(".lc-zoom") as HTMLElement;
const desk = new DemoDesk(zoom);
const robot = new TopDownRobot(desk.host, desk.rig);
robot.setBrand("codex");
robot.setModel("gpt-5.5-codex");

// where the real cursor and the physical mouse have been
const cursorPts: [number, number][] = [], mousePts: [number, number][] = [];
const rigMove = desk.rig.moveMouse.bind(desk.rig);
desk.rig.moveMouse = (p, turn) => { mousePts.push([p.x, p.y]); rigMove(p, turn); };
const wm = new WM(screen, robot);
wm.onCursor = (x, y) => cursorPts.push([x, y]);
const base: Prefs = { editor: "studio", wallpaper: 0, games: { snake: 1, flappy: 1, dash: 1, chess: 1 }, phone: "clips", subagents: "cli", music: 0.2, social: 0.4, mug: "#ff8a65", tasks: "board", hobby: "gamer", windows: "floating", listens: "always", launch: "dock", switching: "click", tidiness: "normal", git: "cli", apps: ["doodle", "steam", "trading"], socials: ["chirp"] };
wm.prefs = base;
wm.robotName = "Pip";
const stage = { phoneScreen: null, say() {}, sleepy() {}, setGlow() {} } as never;
const life = new IdleLife(wm, robot, stage) as unknown as { doActivity(a: string, tok: number): Promise<void>; token: number; onActivity: (t: string) => void; music: unknown };
const logEl = document.createElement("div");
logEl.className = "lc-log";
screen.appendChild(logEl);
life.onActivity = (t) => { logEl.textContent = t; W.__lc.log.push(t); };

function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n, mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb || 1);
}
// the mouse path against the cursor path, sampled at the same fraction of the way
function stats() {
  const n = Math.min(cursorPts.length, mousePts.length);
  if (n < 5) return;
  const k = Math.min(300, n);
  const pick = (a: [number, number][]) => Array.from({ length: k }, (_, i) => a[Math.floor((i / (k - 1)) * (a.length - 1))]);
  const c = pick(cursorPts), m = pick(mousePts);
  const range = (i: number) => Math.max(...mousePts.map((p) => p[i])) - Math.min(...mousePts.map((p) => p[i]));
  W.__lc.stats = { cursorSamples: cursorPts.length, mouseSamples: mousePts.length, corrX: pearson(c.map((p) => p[0]), m.map((p) => p[0])), corrY: pearson(c.map((p) => p[1]), m.map((p) => p[1])), mouseRangeX: range(0), mouseRangeY: range(1) };
}
window.setInterval(stats, 1000);

function drawn(): string {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 427;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 640, 427);
  g.addColorStop(0, "#ff9f5a"); g.addColorStop(0.5, "#b4507a"); g.addColorStop(1, "#2b1d4a");
  x.fillStyle = g; x.fillRect(0, 0, 640, 427);
  x.fillStyle = "#ffe9b0"; x.beginPath(); x.arc(450, 130, 60, 0, 7); x.fill();
  x.fillStyle = "#1b1640"; x.beginPath(); x.moveTo(0, 427); x.lineTo(160, 220); x.lineTo(300, 340); x.lineTo(440, 200); x.lineTo(640, 427); x.fill();
  return c.toDataURL("image/png");
}

async function scene() {
  try {
    if (SCENE === "mouse") {
      for (;;) { await life.doActivity("doodle", life.token); await new Promise((r) => setTimeout(r, 800)); }
    } else if (SCENE === "codex") {
      const codex = new CodexApp(wm);
      codex.setInfo({ id: "t", title: "Make a hero image for the landing page", provider: "codex", model: "gpt-5.5-codex", projectTitle: "Lucid" });
      const src = IMG ? fileUrl(IMG) : drawn();
      const t0 = Date.now();
      await codex.generate({
        prompt: "A cozy top-down office at golden hour, tiny robots at their desks, flat vector style, soft shadows, no text",
        size: "1536x1024",
        state: () => ({ done: Date.now() - t0 > 7000, sources: Date.now() - t0 > 7000 ? [src] : [] }),
      });
    } else if (SCENE === "skip") {
      const music = new MusicApp(wm);
      life.music = music;
      wm.prefs = { ...base, listens: "always" };
      await music.start(0);
      for (;;) { await new Promise((r) => setTimeout(r, 3000)); await music.skip(); }
    } else if (SCENE === "steam" || SCENE === "trading") {
      for (;;) { await life.doActivity(SCENE, life.token); await new Promise((r) => setTimeout(r, 800)); }
    }
  } catch (e) { if (!(e instanceof Cancelled)) { console.error(e); W.__lc.errors.push(String((e as Error)?.stack ?? e)); } }
}
void scene();
