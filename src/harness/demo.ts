// Stand-alone demo for the harness app: a fake desktop, a fake robot and scripted subagents.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import gsap from "gsap";
import type { AppId } from "../os/wm";
import { ICONS } from "../os/icons";
import { HarnessApp, HARNESS_ICON, harnessKind, THEMES, type HarnessHost, type HarnessSession, type SubagentEvent, type HarnessKind, type Flavor } from "./harness";

const SCREEN = { w: 820, h: 461 };
const ICON: Record<string, string> = { ...ICONS, harness: HARNESS_ICON };
const TITLES: Record<string, string> = { files: "Files", editor: "Code", terminal: "Terminal", browser: "Browser", chat: "Messages", harness: "Agents" };
const DOCK = ["files", "editor", "terminal", "browser", "chat", "harness"];
const FRAMES: Record<string, { x: number; y: number; w: number; h: number }> = {
  terminal: { x: 24, y: 196, w: 500, h: 208 },
  editor: { x: 176, y: 12, w: 630, h: 384 },
  harness: { x: 110, y: 22, w: 600, h: 356 },
};

class Cancelled extends Error {}

// --- fake robot: logs what it would do with its hands ---------------------------------
const keyLog = document.getElementById("keys")!;
const poseLog = document.getElementById("pose")!;
let typed = "";
const robot = {
  pressKey(k: string) {
    typed = (typed + (k === "Enter" ? " ⏎ " : k)).slice(-90);
    keyLog.textContent = typed;
  },
  setTyping(on: boolean) { if (on) poseLog.textContent = "type"; },
  setPose(p: string) { poseLog.textContent = p; },
};

// --- fake window manager with the same timing and window behavior as src/os/wm.ts ------
type FakeWin = { el: HTMLElement; body: HTMLElement; title: HTMLElement };
class FakeWM implements HarnessHost {
  epoch = 0;
  speed = 1;
  robot = robot as unknown as HarnessHost["robot"];
  root: HTMLElement;
  private layer: HTMLElement;
  private dock: HTMLElement;
  private cursorEl: HTMLElement;
  private cursor = { x: SCREEN.w * 0.55, y: SCREEN.h * 0.5 };
  private wins = new Map<string, FakeWin>();
  private z = 10;

  constructor(screen: HTMLElement) {
    screen.innerHTML = `
      <div class="os">
        <div class="wallpaper"></div>
        <div class="win-layer"></div>
        <nav class="dock">${DOCK.map((id) => `<div class="dock-item" data-app="${id}" title="${TITLES[id]}">${ICON[id]}<i></i></div>`).join("")}</nav>
        <div class="cursor"><svg viewBox="0 0 20 24" width="15" height="18"><path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.4 L16.5 13 Z" fill="#fff"/><path d="M3.6 4.4 L3.6 15.6 L7.4 12.3 L10.9 19.6 L11.6 19.3 L8.2 12 L12.8 11.7 Z" fill="#11142c"/></svg></div>
      </div>`;
    this.root = screen.querySelector(".os")!;
    this.layer = screen.querySelector(".win-layer")!;
    this.dock = screen.querySelector(".dock")!;
    this.cursorEl = screen.querySelector(".cursor")!;
    gsap.set(this.cursorEl, { x: this.cursor.x, y: this.cursor.y });
  }

  check(epoch: number) { if (epoch !== this.epoch) throw new Cancelled(); }
  async sleep(ms: number, epoch = this.epoch) { await new Promise((r) => setTimeout(r, ms / this.speed)); this.check(epoch); }

  async moveTo(x: number, y: number, ms = 520) {
    const e = this.epoch;
    const from = { ...this.cursor };
    const dist = Math.hypot(x - from.x, y - from.y);
    const dur = Math.max(0.16, Math.min(0.9, (ms / 1000) * (0.45 + dist / 700))) / this.speed;
    const bend = (Math.random() - 0.5) * Math.min(80, dist * 0.25);
    const mx = (from.x + x) / 2 - ((y - from.y) / (dist || 1)) * bend, my = (from.y + y) / 2 + ((x - from.x) / (dist || 1)) * bend;
    const p = { t: 0 };
    robot.setPose("mouse");
    await new Promise<void>((resolve) => gsap.to(p, {
      t: 1, duration: dur, ease: "power2.inOut",
      onUpdate: () => {
        const t = p.t, u = 1 - t;
        this.cursor.x = u * u * from.x + 2 * u * t * mx + t * t * x;
        this.cursor.y = u * u * from.y + 2 * u * t * my + t * t * y;
        gsap.set(this.cursorEl, { x: this.cursor.x, y: this.cursor.y });
      },
      onComplete: () => resolve(),
    }));
    this.check(e);
  }

  pos(el: Element, ax = 0.5, ay = 0.5) {
    const r = el.getBoundingClientRect(), s = this.root.getBoundingClientRect();
    const k = s.width / SCREEN.w || 1;
    return { x: (r.left - s.left + r.width * ax) / k, y: (r.top - s.top + r.height * ay) / k };
  }
  async pointAt(el: Element, ax = 0.5, ay = 0.5, ms?: number) { const p = this.pos(el, ax, ay); await this.moveTo(p.x, p.y, ms); }

  async click(double = false) {
    const e = this.epoch;
    const ring = document.createElement("span");
    ring.className = "click-ring";
    ring.style.left = this.cursor.x + "px";
    ring.style.top = this.cursor.y + "px";
    this.root.appendChild(ring);
    gsap.fromTo(ring, { scale: 0.2, opacity: 0.8 }, { scale: 1.6, opacity: 0, duration: 0.45, ease: "power2.out", onComplete: () => ring.remove() });
    gsap.fromTo(this.cursorEl, { scale: 1 }, { scale: 0.82, duration: 0.07, yoyo: true, repeat: double ? 3 : 1, transformOrigin: "0 0" });
    await this.sleep(double ? 200 : 110, e);
  }

  async open(id: AppId, title?: string): Promise<FakeWin> {
    const e = this.epoch;
    let w = this.wins.get(id);
    if (w) {
      if (title) w.title.textContent = title;
      if (Number(w.el.style.zIndex) !== this.z) {
        await this.pointAt(w.el.querySelector(".win-bar")!, 0.6, 0.5, 380);
        await this.click();
        this.focus(id);
      }
      return w;
    }
    const dockItem = this.dock.querySelector(`[data-app="${id}"]`)!;
    await this.pointAt(dockItem);
    await this.click();
    const f = FRAMES[id] ?? FRAMES.editor;
    const el = document.createElement("section");
    el.className = `win app-${id}`;
    el.style.cssText = `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px`;
    el.innerHTML = `<header class="win-bar">${ICON[id]}<span class="win-title"></span><span class="win-x"></span></header><div class="win-body"></div>`;
    const titleEl = el.querySelector(".win-title") as HTMLElement;
    titleEl.textContent = title || TITLES[id];
    this.layer.appendChild(el);
    w = { el, body: el.querySelector(".win-body")!, title: titleEl };
    this.wins.set(id, w);
    this.focus(id);
    dockItem.classList.add("running");
    const d = this.pos(dockItem);
    gsap.fromTo(el, { opacity: 0, scale: 0.35, x: d.x - (f.x + f.w / 2), y: d.y - (f.y + f.h / 2) },
      { opacity: 1, scale: 1, x: 0, y: 0, duration: 0.55, ease: "expo.out" });
    gsap.fromTo(w.body, { opacity: 0 }, { opacity: 1, duration: 0.4, delay: 0.15 });
    await this.sleep(260, e);
    return w;
  }

  focus(id: string) {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.style.zIndex = String(++this.z);
    for (const o of this.wins.values()) o.el.classList.toggle("focused", o === w);
  }
}

// --- scripted subagents ---------------------------------------------------------------
type Step = { wait: number } & ({ ev: SubagentEvent } | { stream: string } | { finish: string; ok?: boolean });

const CLAUDE: Step[] = [
  { wait: 900, ev: { kind: "think", text: "Focus is set in WM.focus; check who calls it during open" } },
  { wait: 900, ev: { kind: "read", text: "src/os/wm.ts", detail: "Read 285 lines" } },
  { wait: 1100, ev: { kind: "search", text: "pattern: \"focus\\(\", path: src/os", detail: "Found 6 matches in 2 files" } },
  { wait: 1000, ev: { kind: "read", text: "C:/Users/tim/T3 Projects/Lucid-dev/src/os/apps.ts", detail: "Read 510 lines" } },
  { wait: 1200, ev: { kind: "run", text: "npx tsc -p tsconfig.json --noEmit --pretty false", detail: "No errors" } },
  { wait: 900, stream: "Two opens racing" },
  { wait: 250, stream: "Two opens racing for the same z index: open() awaits the dock click" },
  { wait: 250, stream: "Two opens racing for the same z index: open() awaits the dock click before calling focus(), so the second window" },
  { wait: 300, stream: "Two opens racing for the same z index: open() awaits the dock click before calling focus(), so the second window can be created while the first is still animating and both end up focused." },
  { wait: 1400, ev: { kind: "edit", text: "src/os/wm.ts", detail: "Updated wm.ts with 4 additions and 1 removal" } },
  { wait: 1200, ev: { kind: "run", text: "npm run typecheck", detail: "Done in 2.1s" } },
  { wait: 1300, finish: "Focus race fixed in WM.open: focus is claimed before the dock animation starts, so a second open waits its turn." },
];

const CODEX: Step[] = [
  { wait: 700, ev: { kind: "think", text: "Reading the classifier rules" } },
  { wait: 800, ev: { kind: "read", text: "src/os/classify.ts", detail: "176 lines" } },
  { wait: 900, ev: { kind: "run", text: "ls src/os", detail: "apps.ts  classify.ts  highlight.ts  icons.ts  idle.ts  wm.ts" } },
  { wait: 900, ev: { kind: "think", text: "Planning test cases for ripgrep and PowerShell commands" } },
  { wait: 1300, ev: { kind: "edit", text: "src/os/classify.test.ts", detail: "+64 -0" } },
  { wait: 1100, ev: { kind: "run", text: "npx vitest run src/os/classify.test.ts", detail: "exit 1 · 2 failed, 9 passed" } },
  { wait: 1000, ev: { kind: "think", text: "Get-ChildItem with -Recurse is classified as a read, should be a list" } },
  { wait: 1200, ev: { kind: "edit", text: "src/os/classify.test.ts", detail: "+3 -3" } },
  { wait: 1200, ev: { kind: "run", text: "npx vitest run src/os/classify.test.ts", detail: "exit 0 · 11 passed" } },
  { wait: 900, stream: "Added 11 tests covering" },
  { wait: 300, stream: "Added 11 tests covering ripgrep, git, PowerShell and plain shell commands. Two expectations were wrong about Get-ChildItem and are fixed." },
  { wait: 1200, finish: "11 tests in src/os/classify.test.ts, all passing." },
];

const GENERIC: Step[] = [
  { wait: 800, ev: { kind: "think", text: "Looking for layout thrash in the dock hover code" } },
  { wait: 900, ev: { kind: "search", text: "getBoundingClientRect in src", detail: "9 results" } },
  { wait: 1000, ev: { kind: "read", text: "src/os/wm.ts", detail: "lines 96 to 120" } },
  { wait: 1100, ev: { kind: "web", text: "https://gsap.com/docs/v3/GSAP/gsap.ticker/", detail: "200 OK · 18 KB" } },
  { wait: 1200, ev: { kind: "tool", text: "profile_page", detail: "trace saved, 412 frames" } },
  { wait: 1300, ev: { kind: "run", text: "node scripts/measure-dock.mjs --frames 400", detail: "Error: Cannot find module 'scripts/measure-dock.mjs'" } },
  { wait: 1000, ev: { kind: "error", text: "Profiler script is missing", detail: "the task referenced a file that does not exist in this checkout" } },
  { wait: 900, stream: "I could not run the profiler, so I have no frame timings to compare. The trace shows pos() reading layout on every cursor frame." },
  { wait: 1400, finish: "Stopped: the measuring script is missing. pos() is the likely hotspot.", ok: false },
];

async function feed(s: HarnessSession, steps: Step[]) {
  for (const st of steps) {
    await new Promise((r) => setTimeout(r, st.wait / speed));
    if ("ev" in st) s.push(st.ev);
    else if ("stream" in st) s.stream(st.stream);
    else s.finish(st.finish, st.ok ?? true);
  }
}

// --- the scene -----------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const flavorParam = (d: Flavor): Flavor => (params.get("flavor") === "cli" || params.get("flavor") === "app" ? params.get("flavor") as Flavor : d);
const speed = Number(params.get("speed") || 1);
const screenEl = document.getElementById("screen")!;
if (params.get("zoom")) screenEl.style.zoom = params.get("zoom")!;
const wm = new FakeWM(screenEl);
wm.speed = speed;
let app = new HarnessApp(wm);

async function typeTerminal(cmd: string) {
  const w = await wm.open("terminal" as AppId, "Terminal");
  if (!w.body.querySelector(".term")) w.body.innerHTML = `<div class="term"></div>`;
  const t = w.body.querySelector(".term") as HTMLElement;
  const line = document.createElement("div");
  line.innerHTML = `<span style="color:#6ff0a0">$</span> <span></span>`;
  t.append(line);
  const span = line.lastElementChild as HTMLElement;
  for (const ch of cmd) { span.textContent += ch; robot.pressKey(ch); await wm.sleep(40); }
  robot.pressKey("Enter");
}

async function scene() {
  const e = wm.epoch;
  await typeTerminal("git status --short");
  await wm.sleep(500, e);
  const c = await app.start({
    id: "c1", kind: harnessKind("claudeAgent"), model: "claude-opus-5-5", effort: "high", label: "Explore agent", flavor: flavorParam("cli"), cwd: "C:/Users/tim/T3 Projects/Lucid-dev",
    title: "Find why window focus is lost",
    prompt: "Read src/os/wm.ts and find why focus is lost when two windows open at the same time. Report the cause and a minimal fix.",
  });
  void feed(c, CLAUDE);
  await wm.sleep(1600, e);
  const x = await app.start({
    id: "x1", kind: harnessKind("codex"), model: "gpt-5.6-sol", effort: "xhigh", flavor: flavorParam("app"), cwd: "C:/Users/tim/T3 Projects/Lucid-dev",
    title: "Add unit tests for classify.ts",
    prompt: "Write unit tests for src/os/classify.ts covering ripgrep, git and PowerShell commands. Fix any expectation that turns out wrong.",
  });
  void feed(x, CODEX);
  await wm.sleep(1200, e);
  const g = await app.start({
    id: "g1", kind: harnessKind("opencode"), model: "grok-code-fast-1", effort: "medium", flavor: flavorParam("cli"), cwd: "C:/Users/tim/T3 Projects/Lucid-dev",
    title: "Profile dock animation jank",
    prompt: "Profile the dock hover animation and tell me what causes the dropped frames.",
  });
  void feed(g, GENERIC);
  if (params.get("auto") === "0") return;
  // The robot does other things and checks back now and then.
  const order = ["c1", "x1", "g1"];
  for (let i = 0; i < 8; i++) {
    await wm.sleep(1800, e);
    if (i % 3 === 1) { await typeTerminal("npm run typecheck"); await wm.sleep(900, e); }
    await app.checkOn(order[i % 3]);
  }
}

async function restart() {
  wm.epoch++;
  document.querySelector(".win-layer")!.innerHTML = "";
  (wm as any).wins.clear();
  for (const d of document.querySelectorAll(".dock-item")) d.classList.remove("running");
  app = new HarnessApp(wm);
  (window as any).__demo.app = app;
  scene().catch((err) => { if (!(err instanceof Cancelled)) console.error(err); });
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-check]")) {
  b.addEventListener("click", () => { app.checkOn(b.dataset.check!).catch(() => {}); });
}
document.getElementById("restart")!.addEventListener("click", restart);

(window as any).__demo = { app, wm, check: (id: string) => app.checkOn(id) };


// --- gallery: every harness T3 can drive (plus the generic console) in each form it has ------
//   dev/harness.html?gallery=1      mid-run (working line visible)
//   dev/harness.html?gallery=done   finished
const SAMPLE: Record<HarnessKind, { model: string; effort: string; label?: string }> = {
  claude: { model: "claude-opus-5-5", effort: "high" },
  codex: { model: "gpt-5.6-sol", effort: "xhigh" },
  antigravity: { model: "gemini-3.5-pro", effort: "medium" },
  opencode: { model: "claude-sonnet-5-5", effort: "high" },
  cursor: { model: "gpt-5.6-sol", effort: "high" },
  generic: { model: "kimi-k2.5", effort: "medium", label: "Kimi" },
};
const BRIEF = "Read src/os/wm.ts and find why focus is lost when two windows open at the same time. Report the cause and a minimal fix.";
const STREAM: SubagentEvent[] = [
  { kind: "think", text: "Focus is set in WM.focus; check who calls it during open" },
  { kind: "read", text: "src/os/wm.ts", detail: "Read 285 lines" },
  { kind: "search", text: "focus\\(", detail: "Found 6 results" },
  { kind: "run", text: "npx tsc -p . --noEmit", detail: "No errors" },
  { kind: "edit", text: "src/os/wm.ts", detail: "Updated wm.ts with 4 additions and 1 removal" },
];

class TileHost implements HarnessHost {
  epoch = 0;
  speed = 1000;
  robot = { pressKey() {}, setTyping() {}, setPose() {} } as unknown as HarnessHost["robot"];
  constructor(private w: { el: HTMLElement; body: HTMLElement; title: HTMLElement }) {}
  async open(_id: AppId, title?: string) { if (title) this.w.title.textContent = title; return this.w; }
  async pointAt() {}
  async click() {}
  async sleep() {}
  check() {}
}

function tile(grid: HTMLElement, caption: string) {
  const cell = document.createElement("figure");
  cell.className = "g-cell";
  cell.innerHTML = `<section class="win app-harness focused"><header class="win-bar">${HARNESS_ICON}<span class="win-title"></span><span class="win-x"></span></header><div class="win-body"></div></section><figcaption></figcaption>`;
  cell.querySelector("figcaption")!.textContent = caption;
  grid.append(cell);
  const el = cell.querySelector(".win") as HTMLElement;
  return { el, body: el.querySelector(".win-body") as HTMLElement, title: el.querySelector(".win-title") as HTMLElement };
}

async function fill(app: HarnessApp, id: string, kind: HarnessKind, flavor: Flavor, done: boolean, title = "Find why window focus is lost") {
  const sm = SAMPLE[kind];
  const s = await app.start({ id, kind, flavor, title, prompt: BRIEF, model: sm.model, effort: sm.effort, label: sm.label, cwd: "C:/Users/tim/T3 Projects/Lucid-dev" });
  for (const ev of STREAM) s.push(ev);
  s.stream("Two opens raced for the same z index: open() awaits the dock click before focus(), so a second window can be created mid-animation and both end up focused.");
  if (done) s.finish("Focus race fixed in WM.open: focus is claimed before the dock animation starts.", true);
}

async function gallery(done: boolean) {
  document.body.innerHTML = "";
  document.body.className = "g-body";
  document.documentElement.style.cssText = "height:auto;overflow:visible";
  const style = document.createElement("style");
  style.textContent = `
    .g-body { display: block; height: auto; overflow: visible; padding: 18px; background: #0e1233; }
    .g-grid { display: grid; grid-template-columns: repeat(4, 560px); gap: 18px 16px; }
    .g-cell { margin: 0; }
    .g-cell .win { position: relative; width: 560px; height: 340px; }
    .g-cell figcaption { margin-top: 6px; font: 12px var(--font); color: #b9bfe6; }
  `;
  document.head.append(style);
  const grid = document.createElement("div");
  grid.className = "g-grid";
  document.body.append(grid);
  const kinds = Object.keys(THEMES) as HarnessKind[];
  const jobs: Promise<void>[] = [];
  for (const kind of kinds) {
    for (const flavor of THEMES[kind].forms) {
      const w = tile(grid, `${THEMES[kind].name}, ${flavor === "cli" ? "terminal" : "desktop app"}`);
      const app = new HarnessApp(new TileHost(w));
      jobs.push(fill(app, `${kind}-${flavor}`, kind, flavor, done));
    }
  }
  // One robot running two helpers at once: a Claude Code helper and a Codex helper in separate tabs.
  for (const flavor of ["cli", "app"] as Flavor[]) {
    const w = tile(grid, `Two helpers at once, ${flavor === "cli" ? "terminal" : "desktop app"} (Codex tab active)`);
    const app = new HarnessApp(new TileHost(w));
    jobs.push((async () => {
      await fill(app, "m-claude", "claude", flavor, done, "Find why window focus is lost");
      await fill(app, "m-codex", "codex", flavor, done, "Add unit tests for classify.ts");
    })());
  }
  await Promise.all(jobs);
  document.body.dataset.ready = "1";
}

if (params.get("gallery")) void gallery(params.get("gallery") === "done");
else scene().catch((err) => { if (!(err instanceof Cancelled)) console.error(err); });
