// Standalone demo: two robot desktops play the same plan updates, one as a board, one as a checklist.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import { WM, Cancelled } from "./wm";
import { TasksApp, type TaskStep } from "./tasks";

const style = document.createElement("style");
style.textContent = `
  body { overflow: auto; background: #141a33; }
  #tasks-demo { display: flex; gap: 20px; padding: 18px; flex-wrap: wrap; }
  .d-screen { position: relative; width: 820px; height: 461px; border-radius: 10px; overflow: hidden; }
  .d-log { width: 100%; color: #b9bfe6; font-size: 12px; }
`;
document.head.appendChild(style);

const root = document.getElementById("tasks-demo")!;
const log = document.createElement("div");
log.className = "d-log";

const stubRobot = () => ({
  setPose() {}, mouseTo() {}, lookAt() {}, click() {}, pressKey() {}, setTyping() {},
}) as any;

function desk(flavor: "board" | "checklist") {
  const el = document.createElement("div");
  el.className = "d-screen";
  root.appendChild(el);
  const wm = new WM(el, stubRobot());
  wm.prefs = { tasks: flavor } as any;
  return { wm, tasks: new TasksApp(wm) };
}

const desks = [desk("board"), desk("checklist")];
root.appendChild(log);

const P = (s: string, n: string[]): TaskStep[] => n.map((t, i) => ({ text: t, status: s[i] === "x" ? "completed" : s[i] === ">" ? "inProgress" : "pending" }));
const A = ["Read the director and window manager", "Add the Tasks app with board and checklist flavors", "Wire plan updates into the director", "Build a demo page and take screenshots"];
const B = [...A.slice(0, 3), "Check typing, dragging and catch-up", "Build a demo page and take screenshots"];
const STEPS: { name: string; plan: TaskStep[]; instant?: boolean; other?: boolean }[] = [
  { name: "catch-up", plan: P(">..", A.slice(0, 3)), instant: true },
  { name: "add one", plan: P(">...", A) },
  { name: "done 1, start 2", plan: P("x>..", A) },
  { name: "other window", plan: [], other: true },
  { name: "insert + done 2 + start 3", plan: P("xx>..", B) },
  { name: "finish", plan: P("xxxx>", B) },
  { name: "all done", plan: P("xxxxx", B) },
];
(window as any).__phase = "start";

async function run(d: { wm: WM; tasks: TasksApp }) {
  try {
    for (const s of STEPS) {
      (window as any).__phase = s.name;
      log.textContent = `Step: ${s.name}`;
      if (s.other) { await d.wm.open("notes"); await d.wm.sleep(900); continue; }
      await d.tasks.show(s.plan, { instant: s.instant, title: "Lucid tasks app" });
      await d.wm.sleep(900);
    }
  } catch (err) {
    if (!(err instanceof Cancelled)) { console.error(err); log.textContent = String(err); (window as any).__phase = "error"; }
  }
}
setTimeout(() => void Promise.all(desks.map(run)).then(() => { if ((window as any).__phase !== "error") (window as any).__phase = "done"; }), 600);
