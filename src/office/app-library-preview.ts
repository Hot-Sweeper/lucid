// Isolated, disposable demo document. No backend calls or Electron bridge.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import "./office.css";
import "../fun/fun.css";
import "../life/life.css";
import { t3Icon } from "../harness/t3code";
import { WM, Cancelled, type AppId } from "../os/wm";
import type { PhoneApp } from "../social/phone-apps";
import type { FunHost } from "../fun/host";
import * as activities from "../os/idle-activities";
import { LIBRARY_APPS } from "./app-library-catalog";
const style = document.createElement("style");
style.textContent = `html,body{margin:0;overflow:hidden;background:#141a33}#library-screen{position:absolute;width:820px;height:461px;transform-origin:0 0}.library-demo-error{padding:20px;color:#eef0ff;font:16px var(--font)}.library-phone{width:134px;height:284px;position:absolute;left:343px;top:60px;overflow:hidden;border-radius:15px;background:#141a33}.library-phone .win-body{height:100%}`;
document.head.append(style);
const screen = document.getElementById("library-screen")!;
const fit = () => { screen.style.transform = `scale(${Math.min(innerWidth / 820, innerHeight / 461)})`; };
window.addEventListener("resize", fit); fit();
const robot = { setPose() {}, mouseTo() {}, lookAt() {}, click() {}, pressKey() {}, setTyping() {}, react() {}, drink: async () => {}, holdPhone: async () => {}, wake() {}, swipe() {}, tap() {} };
const wm = new WM(screen, robot as any);
wm.brandApp("t3code", { icon: t3Icon("stable") });
wm.dock.replaceChildren();
wm.prefs = { windows: "floating", launch: "dock", switching: "click", tidiness: "normal", office: "suite", tasks: "board" } as any;
wm.robotName = "Demo robot";
const entry = LIBRARY_APPS.find(a => a.id === new URLSearchParams(location.search).get("app"));
let stopped = false;
const host: FunHost = {
  get stopped() { return stopped; },
  sleep: async ms => { await new Promise(r => setTimeout(r, ms)); if (stopped) throw new Cancelled(); },
  pointAt: (el, ax, ay, ms) => wm.pointAt(el, ax, ay, ms), click: () => wm.click(), tap() {}, react() {},
};
window.addEventListener("pagehide", () => { stopped = true; wm.destroy(); });
const runs: Record<string, (body: HTMLElement, host: FunHost, opts: any) => Promise<unknown>> = {
  snake: activities.playSnake, flappy: activities.playFlappy, dash: activities.playDash,
  blockcraft: activities.playBlockcraft, nightshift: activities.playNightShift, tictactoe: activities.playTicTacToe,
  connect4: activities.playConnectFour, bitmerge: activities.playBitMerge, island: activities.playRobotIsland,
  botcom: activities.playBotCom, bugger: activities.playDerBugger, boot: activities.playBoot,
  botflix: activities.watchBotflix, tube: activities.watchTube, tensorhub: activities.browseTensorHub,
  beats: activities.makeBeat, social: activities.hangOutInChat, botsapp: activities.chatOnBotsApp,
  telegrid: activities.browseTelegrid, chirp: activities.scrollChirp, doodle: activities.doodleInSketchpad,
  crossword: activities.solveCrossword, solitaire: activities.playSolitaire, stocks: activities.watchStocks,
  mail: activities.checkMail, lingo: activities.learnWithLingobot, instaweb: activities.browseInstaweb,
  spoolweb: activities.scrollSpoolWeb, sparkplug: activities.swipeSparkplug, steam: activities.useSteam,
  trading: activities.tradeOnTradebot,
};
async function run() {
  if (!entry?.demo) throw new Error("No demo for this app.");
  const id = entry.demo;
  if (runs[id]) {
    const known: AppId[] = ["beats","social","botsapp","telegrid","chirp","doodle","crossword","solitaire","stocks","mail","lingo","instaweb","spoolweb","sparkplug","steam","trading"];
    const appId: AppId = known.includes(id as AppId) ? id as AppId : ["tube","botflix","tensorhub"].includes(id) ? "browser" : "game";
    const w = await wm.open(appId, entry.name);
    await runs[id](w.body, host, { maxMs: 120000, skill: .7, me: "Demo robot" });
    return;
  }
  if (["phone", "snapbot", "shorts"].includes(id)) {
    const body = document.createElement("div"); body.className = "library-phone"; screen.append(body);
    await activities.usePhone(body, host, { maxMs: 120000, me: "Demo robot", apps: id === "phone" ? ["instabot","botsapp","snapbot"] : [id as PhoneApp] }); return;
  }
  if (["botword","cellsheet","slidedeck"].includes(id)) {
    const { officeIdle } = await import("../office-apps/idle");
    await officeIdle(wm, id === "botword" ? "memo" : id === "cellsheet" ? "sheet" : "deck"); return;
  }
  switch (id) {
    case "editor": {
      const { EditorApp } = await import("../os/apps");
      await new EditorApp(wm).read("demo.ts", ["// App library demo", "type Robot = { name: string; coffee: number };", "", "const pip: Robot = { name: 'Pip', coffee: 2 };", "", "function coffeeBreak(robot: Robot) {", "  return `${robot.name} is taking a break.`;", "}", "", "console.log(coffeeBreak(pip));"], 1); break;
    }
    case "terminal": {
      const { TerminalApp } = await import("../os/apps");
      const terminal = new TerminalApp(wm); terminal.setCwd("library-demo");
      const output = await terminal.run("printf 'Hello from the app library\\n'");
      await output.finish("Hello from the app library", 0); break;
    }
    case "files": {
      const { FilesApp } = await import("../os/explorer");
      await new FilesApp(wm).list("/library-demo", [{ name: "src", dir: true }, { name: "demo.ts", dir: false }, { name: "README.md", dir: false }], "/library-demo", { instant: true }); break;
    }
    case "calc": { const { CalcApp } = await import("../os/calc"); await new CalcApp(wm).compute("42 * 8", "Demo calculation"); break; }
    case "weather": { const { WeatherApp } = await import("../os/glance"); await new WeatherApp(wm).check(); break; }
    case "tasks": {
      const { TasksApp } = await import("../os/tasks");
      await new TasksApp(wm).show([{ text: "Explore the app library", status: "completed" }, { text: "Preview a game", status: "in_progress" }, { text: "Browse the social apps", status: "pending" }], { instant: true, title: "Demo checklist" }); break;
    }
    case "browser": {
      const { BrowserApp } = await import("../os/browser");
      await new BrowserApp(wm, async () => null).open("https://library.demo", { instant: true, title: "App library demo", text: "A demo browser page.\n\nRobots use this browser for searches, pages and frontend previews.", real: false }); break;
    }
    case "music": { const { MusicApp } = await import("../os/music"); await new MusicApp(wm).start(); break; }
    case "t3code": { const { T3CodeApp } = await import("../harness/t3code"); const app = new T3CodeApp(wm); await app.show(); break; }
  }
}
void run().catch(err => {
  if (stopped || err instanceof Cancelled) return;
  console.error("App library demo failed", err);
  const p = document.createElement("p"); p.className = "library-demo-error"; p.textContent = "This demo could not load. Use Restart demo to try again."; screen.replaceChildren(p);
});
