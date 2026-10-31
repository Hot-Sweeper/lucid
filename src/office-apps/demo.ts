// Demo of the office suite. Never touches dist/.
//   ?scene=word|sheet|deck&file=<path>   one app on a bare desktop, the real file read through window.lucidDocs
//   ?scene=desk&dir=<folder>              a real desk with a robot and the real Director playing fake thread items
//   ?scene=edit&file=<v1>&file2=<v2>      the same document twice: the second time only the changes are typed
//   ?scene=idle&what=memo|sheet|deck      the bored-robot activities
//   ?scene=fallback&file=<path>           a file that can not be read
// A capture script can expose window.shot(name) and window.done(); the demo calls them at good moments.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import "../office/office.css";
import "../world/world.css";
import gsap from "gsap";
import { WM, Cancelled } from "../os/wm";
import { OfficeSuite } from "./suite";
import { officeIdle } from "./idle";
import { officeTargets } from "./model";
import { useRobot, Desk } from "../office/desk";
import { TopDownRobot } from "../world/seated";
import { WALLPAPERS, type RobotProfile } from "../office/roster";
import type { Item } from "../director";

const qs = new URLSearchParams(location.search);
const scene = qs.get("scene") || "word";
const W = window as any;
const shot = async (name: string) => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); await W.shot?.(name); };
const done = () => { W.__phase = "done"; W.done?.(); };
W.__phase = "start";

const style = document.createElement("style");
style.textContent = `
  html, body { overflow: hidden; background: #141a33; margin: 0; }
  #oa-demo { padding: 0; }
  .d-screen { position: relative; width: 820px; height: 461px; overflow: hidden; transform-origin: 0 0; }
  .d-floor { position: relative; width: 400px; height: 380px; transform-origin: 0 0; background: #c49a6c; background-image: repeating-linear-gradient(0deg, transparent 0 25px, rgba(150,110,70,.35) 25px 26px); }
`;
document.head.appendChild(style);
const root = document.getElementById("oa-demo")!;

const stub = () => ({ setPose() {}, mouseTo() {}, lookAt() {}, click() {}, pressKey() {}, setTyping() {}, react() {}, drink: async () => {}, holdPhone: async () => {}, wake() {}, swipe() {}, tap() {} }) as any;
const reader = async (p: string) => (W.lucidDocs ? W.lucidDocs.read(p) : { ok: false, error: "no reader" });

function bareScreen(scale = Number(qs.get("zoom")) || Math.min(innerWidth / 820, innerHeight / 461)) {
  const el = document.createElement("div");
  el.className = "d-screen";
  el.style.transform = `scale(${scale})`;
  root.appendChild(el);
  const wm = new WM(el, stub());
  wm.prefs = { windows: "floating", tidiness: "normal", launch: "dock", switching: "click", office: "suite" } as any;
  wm.robotName = "Pip";
  wm.setWallpaper(WALLPAPERS[0]);
  return wm;
}

// Take a screenshot when the app reaches a moment worth seeing (a % of the way through the typing).
function shootWhen(name: string, test: () => boolean, every = 120) {
  let taken = false;
  const t = window.setInterval(() => { if (!taken && test()) { taken = true; window.clearInterval(t); void shot(name); } }, every);
  return () => window.clearInterval(t);
}

async function main() {
  try {
    if (scene === "detect") {
      // which documents a command obviously wrote
      const cases: [string, string, string][] = [
        ["python make_report.py", "Saved report.xlsx\n", "report.xlsx"],
        ["python - <<'EOF'\nfrom docx import Document\nd = Document()\nd.add_heading('Hi', 0)\nd.save('out/memo.docx')\nEOF", "", "out/memo.docx"],
        ["python -c \"import pandas as pd; df = pd.read_excel('data.xlsx'); df.to_csv('summary.csv')\"", "", "summary.csv"],
        ["python -c \"import openpyxl; wb = openpyxl.load_workbook('budget.xlsx'); wb.save('budget.xlsx')\"", "", "budget.xlsx"],
        ["cat report.csv", "a,b\n1,2", ""],
        ["Get-Content notes.docx", "", ""],
        ["node build-deck.js", "Wrote 12 slides to C:\\work\\deck.pptx", "C:\\work\\deck.pptx"],
        ["soffice --headless --convert-to docx notes.odt", "convert notes.odt -> notes.docx using filter : MS Word 2007 XML\n", "notes.docx"],
        ["python -c \"import pandas as pd; pd.read_csv('in.csv').to_excel('Q3 summary.xlsx')\"", "", "Q3 summary.xlsx"],
        ["python analyze.py > results.csv", "", "results.csv"],
      ];
      for (const [cmd, out, want] of cases) {
        const got = officeTargets(cmd, out).join(" | ");
        console.log(`${got === want ? "PASS" : "FAIL"} ${JSON.stringify(cmd.slice(0, 60))} -> ${got || "(none)"}${got === want ? "" : ` (wanted ${want || "(none)"})`}`);
      }
    } else if (scene === "word" || scene === "sheet" || scene === "deck" || scene === "fallback") {
      const wm = bareScreen();
      const suite = new OfficeSuite(wm, reader);
      const file = qs.get("file")!;
      const typing = () => !!document.querySelector(".caret");
      const stopA = shootWhen(`${scene}-typing`, () => typing() && (document.querySelectorAll(".bw-page > *").length >= 6 || document.querySelectorAll(".cs-table td.editing").length > 0 && !!document.querySelector(".cs-table td.editing")?.textContent?.startsWith("=") || document.querySelectorAll(".sd-thumb").length >= 3));
      await suite.show(file, { op: "add" });
      stopA();
      await shot(`${scene}-done`);
      if (scene === "deck") {
        // a run-through in presenter mode, shot on the second slide
        const deck = (await reader(file)).doc;
        const p = suite.deck.present(null, deck.slides.slice(0, 3));
        await new Promise((r) => setTimeout(r, 1900));
        await shot("deck-present");
        await p;
      }
    } else if (scene === "edit") {
      const wm = bareScreen();
      // the second version lands at the same path, as when an agent rewrites a file
      const v1 = qs.get("file")!, v2 = qs.get("file2")!;
      let n = 0;
      const suite = new OfficeSuite(wm, async () => reader(n++ === 0 ? v1 : v2));
      const path = v1;
      await suite.show(path, { op: "add", instant: true });
      await shot("edit-before");
      const stop = shootWhen("edit-typing", () => !!document.querySelector(".caret, .cs-table td.editing"), 60);
      await suite.show(path, { op: "update" });
      stop();
      await shot("edit-after");
    } else if (scene === "idle") {
      const wm = bareScreen();
      const what = (qs.get("what") || "memo") as "memo" | "sheet" | "deck";
      const stop = shootWhen(`idle-${what}`, () => document.querySelectorAll(".bw-page > *").length >= 5 || (() => { const c = document.querySelector(".cs-chart"); return !!c && getComputedStyle(c).opacity === "1" && !document.querySelector(".caret"); })() || document.querySelectorAll(".sd-thumb").length >= 4);
      await officeIdle(wm, what);
      stop();
    } else if (scene === "desk") {
      await deskScene();
    }
  } catch (err) {
    if (!(err instanceof Cancelled)) { console.error(err); W.__phase = "error: " + String(err); }
  }
  done();
}

// A desk with a robot, played by the real Director from fake thread items.
async function deskScene() {
  useRobot((host, rig) => new TopDownRobot(host, rig));
  const zoom = Number(qs.get("zoom")) || Math.min(innerWidth / 400, innerHeight / 380);
  const floor = document.createElement("div");
  floor.className = "d-floor";
  floor.style.transform = `scale(${zoom})`;
  root.appendChild(floor);
  const dir = (qs.get("dir") || "").replace(/\\/g, "/");
  const services = { peek: async () => null, image: async () => null, readText: async () => null };
  const desk = new Desk(floor, 0, 0, services);
  const profile: RobotProfile = {
    id: "bot-demo", name: "Pip", brand: "claude" as any, provider: "claudeAgent", look: {} as any, hiredAt: Date.now(), threadId: "t-demo", jobs: 1,
    prefs: { editor: "studio", wallpaper: 2, games: { snake: 1, flappy: 1, dash: 1, chess: 1 }, phone: "clips", subagents: "app", music: 0, social: 0, mug: "#4fb6ff", tasks: "sticky", hobby: "chiller", windows: "floating", listens: "never", launch: "dock", switching: "click", tidiness: "normal", git: "cli", office: "suite" },
  };
  desk.assign({ id: "t-demo", title: "Quarterly paperwork", provider: "claudeAgent" }, profile);
  desk.director.setInfo({ id: "t-demo", title: "Quarterly paperwork", provider: "claudeAgent", root: dir, run: { id: "r1", status: "running" } });
  const now = () => new Date().toISOString();
  const item = (id: string, ordinal: number, type: string, data: any): Item => ({ id, runId: "r1", ordinal, type, status: "completed", updatedAt: now(), data });
  const which = (qs.get("items") || "docx,xlsx,pptx").split(",");
  const items: Item[] = [];
  let o = 1;
  if (which.includes("docx")) items.push(item("i-doc", o++, "file_change", { fileName: `${dir}/q3-report.docx`, changes: [{ path: `${dir}/q3-report.docx`, operation: "add" }] }));
  if (which.includes("xlsx")) items.push(item("i-xlsx", o++, "command_execution", { input: "python -c \"import openpyxl; wb = openpyxl.Workbook(); ...; wb.save('office-budget.xlsx')\"", output: "Saved office-budget.xlsx\n", exitCode: 0 }));
  if (which.includes("pptx")) items.push(item("i-pptx", o++, "dynamic_tool", { toolName: "Bash", input: { command: "python build_deck.py" }, output: { stdout: "Wrote 5 slides to q4-roadmap.pptx\n", exitCode: 0 } }));
  if (which.includes("csv")) items.push(item("i-csv", o++, "file_change", { fileName: `${dir}/signups.csv`, changes: [{ path: `${dir}/signups.csv`, operation: "update" }], diffStr: "@@ -5,3 +5,3 @@\n 4,149,20,129\n-5,170,15,155\n+5,170,15,155\n 6,182,17,165\n" }));
  // shots: the robot mid-typing in each app
  const seen = new Set<string>();
  const t = window.setInterval(() => {
    const caret = document.querySelector(".caret");
    if (!caret) return;
    const app = caret.closest(".bw") ? "botword" : caret.closest(".cs") ? "cellsheet" : caret.closest(".sd") ? "slidedeck" : null;
    if (!app || seen.has(app)) return;
    const enough = app === "botword" ? document.querySelectorAll(".bw-page > *").length >= 5 : app === "cellsheet" ? document.querySelectorAll(".cs-table td.num").length >= 6 : document.querySelectorAll(".sd-thumb").length >= 2;
    if (!enough) return;
    seen.add(app);
    void shot(`desk-${app}`);
  }, 150);
  desk.director.push(items, false);
  // wait until the director has played everything (it goes idle: the robot rests)
  const start = Date.now();
  while (Date.now() - start < 240000) {
    await new Promise((r) => setTimeout(r, 500));
    const d = desk.director as any;
    if (d.pumpEpoch === -1 && !d.queue.length) break;
  }
  window.clearInterval(t);
  desk.director.setInfo({ id: "t-demo", title: "Quarterly paperwork", provider: "claudeAgent", root: dir, run: { id: "r1", status: "completed" } });
  await shot("desk-end");
  void gsap;
}

setTimeout(main, 400);
