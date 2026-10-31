// Desk mode of the social demo: a real robot desktop (WM) and the real IdleLife running one
// activity, plus a check of the activity picker for a few robots.
//   ?desk=chirp            run that idle activity on a real desktop (and the phone beside it)
//   ?desk=pick             print how often each activity is picked for sample robots
import "../styles.css";
import "../office/office.css";
import { WM, Cancelled } from "../os/wm";
import { IdleLife } from "../os/idle";
import { interestsFrom, type Prefs } from "../office/roster";

const qs = new URLSearchParams(location.search);
const W = window as unknown as { __so: { log: string[]; errors: string[] }; __pick?: unknown };
const style = document.createElement("style");
style.textContent = `
  .dd-wrap { display: flex; gap: 24px; align-items: flex-start; padding: 16px; }
  .dd-screen { position: relative; width: 820px; height: 461px; overflow: hidden; border-radius: 8px; transform-origin: 0 0; }
  .dd-phone { width: 150px; height: 300px; border-radius: 22px; background: #1a1d2e; padding: 8px; }
  .dd-phone .phone-screen { width: 100%; height: 100%; border-radius: 15px; overflow: hidden; background: #0e1233; position: relative; }
  .dd-log { color: #b9bfe6; font: 12px var(--font); padding: 0 16px; white-space: pre; }
`;
document.head.appendChild(style);

const robot = { setPose() {}, mouseTo() {}, lookAt() {}, click() {}, pressKey() {}, setTyping() {}, react() {}, drink: async () => {}, holdPhone: async () => {}, wake() {}, swipe() {}, tap() {} } as never;

export function runDesk(root: HTMLElement) {
  const what = qs.get("desk")!;
  const base: Prefs = { editor: "studio", wallpaper: 0, games: { snake: 1, flappy: 1, dash: 1, chess: 1 }, phone: "clips", subagents: "cli", music: 0.2, social: 0.4, mug: "#ff8a65", tasks: "board", hobby: "chatter", windows: "floating", listens: "never", launch: "dock", switching: "click", tidiness: "normal", git: "cli" };
  if (what === "pick") {
    const out: string[] = [];
    const robots: [string, Prefs][] = [];
    for (const hobby of ["chatter", "watcher", "gamer", "chiller"] as const) {
      let seed = hobby.length * 977;
      const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      robots.push([hobby, { ...base, hobby, ...interestsFrom(r, hobby) }]);
    }
    for (const [name, p] of robots) {
      const fake = { prefs: p } as unknown as WM;
      const life = new IdleLife(fake, robot, {} as never) as unknown as { pick(r: string[]): string; browser: unknown; music: unknown };
      const counts: Record<string, number> = {};
      for (let i = 0; i < 4000; i++) { const a = life.pick([]); counts[a] = (counts[a] ?? 0) + 1; }
      out.push(`${name}: apps ${p.apps!.join(", ")}  socials ${p.socials!.join(", ")}`);
      out.push("   " + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 40).toFixed(1)}%`).join("  "));
      out.push(`   never: ${["botsapp", "telegrid", "chirp", "doodle", "crossword", "solitaire", "stocks", "lingo"].filter((k) => !counts[k]).join(", ")}`);
    }
    const pre = document.createElement("div");
    pre.className = "dd-log";
    pre.textContent = out.join("\n");
    root.appendChild(pre);
    W.__pick = out;
    return;
  }
  root.innerHTML = `<div class="dd-wrap"><div class="dd-screen"></div><div class="dd-phone"><div class="phone-screen"></div></div></div><div class="dd-log"></div>`;
  const screen = root.querySelector(".dd-screen") as HTMLElement;
  const log = root.querySelector(".dd-log") as HTMLElement;
  const wm = new WM(screen, robot);
  const prefs: Prefs = { ...base, hobby: "chiller", apps: ["doodle", "crossword", "solitaire"], socials: ["chirp", "botsapp", "instabot", "snapbot"], launch: (qs.get("launch") as "dock") || "dock" };
  wm.prefs = prefs;
  wm.robotName = "Pip";
  const stage = { phoneScreen: root.querySelector(".phone-screen") as HTMLElement, say() {}, sleepy() {}, setGlow() {} } as never;
  const life = new IdleLife(wm, robot, stage) as unknown as { doActivity(a: string, tok: number): Promise<void>; token: number; onActivity: (t: string) => void };
  life.onActivity = (t) => { log.textContent = t; W.__so.log.push(t); };
  void (async () => {
    try { for (;;) { await life.doActivity(what, life.token); await new Promise((r) => setTimeout(r, 1500)); } }
    catch (e) { if (!(e instanceof Cancelled)) { console.error(e); W.__so.errors.push(String((e as Error)?.stack ?? e)); } }
  })();
}
