import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import gsap from "gsap";
import "./world.css";
import { UNIT, type Pose, type RobotLook } from "../office/rig";
import { TopDownRobot } from "./seated";
import { DemoDesk } from "./demo-desk";
import { ACCESSORIES, BUILDS, EYES, HATS, HEAD_SIZES, randomLook, seeded, STICKERS, TINTS } from "./look";

// Seated robot test bench. URL params:
//   scene=play|grid|typing|mouse|phone|drink|notice|celebrate|headphones|think|rest|sleep
//   scene=looks                 12 varied random looks (seeded), cropped to the robots
//   seed=N hat= acc= eyes= build= head=   look overrides for single scenes
//   scene=hats&view=front|back  every hat; scene=accs&view=front|back every accessory; scene=eyes every eye style
//   brand=codex|claudeAgent|grok|other
//   scale=2                     desk zoom (single scenes)
//   raf=0                       drive animations by timers (hidden capture windows)
// Capture scripts read window.seatedDemo.shots (milliseconds after load to grab a frame).

const qs = new URLSearchParams(location.search);
const SCENE = qs.get("scene") || "play";
const BRAND = qs.get("brand") || "claudeAgent";
const GALLERY = ["looks", "hats", "accs", "eyes"].includes(SCENE);
const SCALE = Number(qs.get("scale") || (SCENE === "grid" ? 1 : GALLERY ? 1.25 : 2));
const VIEW = qs.get("view") || "back";

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --mono: "JetBrains Mono Variable", ui-monospace, monospace; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #20253d; color: #eef0ff; font-family: var(--font); }
  #demo { display: flex; flex-wrap: wrap; gap: 0; align-items: flex-start; }
  .sd-floor { position: relative; overflow: hidden; background: #c49a6c;
    background-image: repeating-linear-gradient(0deg, transparent 0 25px, rgba(150, 110, 70, 0.35) 25px 26px); }
  .sd-zoom { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .world-demo-desk { position: absolute; left: 0; top: 0; }
  .world-demo-table { position: absolute; left: 0; top: 0; overflow: visible; }
  .world-demo-key { fill: #5a6177; transition: fill 0.12s; }
  .world-demo-key.down { fill: #9fe8ff; }
  .world-demo-monitor { position: absolute; border-radius: 12px; background: linear-gradient(170deg, #2a2f45, #151927 70%); box-shadow: 0 10px 18px rgba(30, 20, 10, 0.28); }
  .world-demo-screen { position: absolute; border-radius: 6px; overflow: hidden; background: linear-gradient(160deg, #1b2150, #0e1233); }
  .world-demo-code { padding: 6px 7px; font: 500 7px/1.35 var(--mono); color: #a8f0d0; white-space: pre-wrap; }
  .world-demo-robot { position: absolute; inset: 0; pointer-events: none; }
  .world-demo-phone { position: absolute; left: 0; top: 0; width: 150px; height: 300px; border-radius: 22px; background: #1a1d2e; padding: 8px;
    display: none; box-shadow: 0 10px 20px rgba(10, 12, 30, 0.35); z-index: 5; }
  .world-demo-phone.on { display: block; }
  .world-demo-phone-screen { width: 100%; height: 100%; border-radius: 15px; overflow: hidden; background: linear-gradient(#ff9f5a, #ff6f91); display: flex; flex-direction: column; gap: 10px; padding: 18px 12px; }
  .world-demo-phone-screen i { display: block; height: 52px; border-radius: 12px; background: rgba(255, 255, 255, 0.85); }
  .sd-controls { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px; width: 100%; }
  .sd-controls button { border: 0; background: #2e3577; color: #fff; padding: 7px 11px; border-radius: 8px; cursor: pointer; font: 500 12px var(--font); }
  .sd-controls button:hover { background: #3c45a0; }
  .sd-controls button[aria-pressed="true"] { background: #5a64d0; }
  .sd-controls select { background: #2e3577; color: #fff; border: 0; border-radius: 8px; padding: 6px 8px; font: 500 12px var(--font); }
  .sd-controls label { display: inline-flex; gap: 4px; align-items: center; font-size: 12px; color: #b9bfe6; }
  .sd-crop { position: relative; overflow: hidden; }
  .sd-crop .sd-floor { position: absolute; }
  .sd-tag { position: absolute; left: 6px; bottom: 4px; font: 500 11px var(--font); color: #2b1d10; background: rgba(255,255,255,0.7); padding: 1px 6px; border-radius: 6px; z-index: 9; }
`;
document.head.appendChild(style);

const root = document.getElementById("demo")!;
const sleep = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));
type Bot = TopDownRobot & { setHeadphones?(on: boolean): void; setGroove?(bpm: number): void };
const api: { shots: number[]; robots: Bot[]; fps?: number; frameMs?: number; t0: number; gsap: typeof gsap } = { shots: [], robots: [], gsap, t0: performance.now() };
(window as any).seatedDemo = api;

const LOOKS: [string, string, RobotLook][] = [
  ["claudeAgent", "claude-opus-5-5", { accent: "#ff9f5a", antennaTip: "ball" }],
  ["codex", "gpt-5.5-codex", { antennaTip: "ball" }],
  ["grok", "grok-5", { accent: "#4fb6ff", antennaTip: "ring", sticker: "smile" }],
  ["opencode", "qwen-coder-4", { accent: "#4ff0a0", antennaTip: "heart", sticker: "heart" }],
  ["claudeAgent", "claude-sonnet-5-5", { accent: "#ff6f91", antennaTip: "star", sticker: "bolt" }],
  ["codex", "gpt-5.5-codex-mini", { accent: "#ffd23f", antennaTip: "ring" }],
];

function station(scale: number, lookIdx = 0) {
  const floor = document.createElement("div");
  floor.className = "sd-floor";
  floor.style.cssText = `width:${UNIT.w * scale}px;height:${(UNIT.h + 20) * scale}px`;
  floor.innerHTML = `<div class="sd-zoom" style="width:${UNIT.w}px;height:${UNIT.h + 20}px;transform:scale(${scale})"></div>`;
  if (GALLERY) {
    // only the robot and the desk edge: x 96..304, y 150..400
    const crop = document.createElement("div");
    crop.className = "sd-crop";
    crop.style.cssText = `width:${208 * scale}px;height:${236 * scale}px`;
    floor.style.left = `${-96 * scale}px`; floor.style.top = `${-150 * scale}px`;
    crop.appendChild(floor);
    root.appendChild(crop);
  } else root.appendChild(floor);
  const desk = new DemoDesk(floor.firstElementChild as HTMLElement);
  const robot = new TopDownRobot(desk.host, desk.rig) as Bot;
  const [brand, model, look] = SCENE === "grid" ? LOOKS[lookIdx % LOOKS.length] : [BRAND, LOOKS.find((l) => l[0] === BRAND)?.[1] ?? "qwen-coder-4", LOOKS.find((l) => l[0] === BRAND)?.[2] ?? LOOKS[3][2]];
  robot.setBrand(brand); robot.setModel(model); robot.setLook(look);
  // look overrides for single scenes: seed=N (a random look), hat=, acc=, eyes=, build=, head=
  if (!GALLERY && SCENE !== "grid" && [...qs.keys()].some((k) => ["seed", "hat", "acc", "eyes", "build", "head"].includes(k))) {
    const l: RobotLook = { ...look, ...(qs.has("seed") ? randomLook(seeded("demo-look-" + qs.get("seed"))) : {}) };
    if (qs.has("hat")) l.hat = qs.get("hat") as RobotLook["hat"];
    if (qs.has("acc")) l.accessory = qs.get("acc") as RobotLook["accessory"];
    if (qs.has("eyes")) l.eyes = qs.get("eyes") as RobotLook["eyes"];
    if (qs.has("build")) l.build = qs.get("build") as RobotLook["build"];
    if (qs.has("head")) l.head = Number(qs.get("head"));
    l.headphones = false;
    robot.setLook(l);
  }
  api.robots.push(robot);
  return { desk, robot };
}

const CODE = "const hello = (name) => `hi ${name}`;\nexport default hello;\nfor (const x of list) total += x * 2;\n";
async function typeLoop(desk: DemoDesk, robot: Bot, cps = 9) {
  robot.setPose("type");
  for (;;) for (const ch of CODE) {
    const k = ch === "\n" ? "Enter" : ch;
    robot.pressKey(k);
    desk.typeOnScreen(ch);
    await sleep((1 / cps) * (0.55 + Math.random() * 0.9) + (ch === "\n" || ch === ";" ? 0.5 : 0));
  }
}
async function mouseLoop(robot: Bot) {
  robot.setPose("mouse");
  for (let k = 0; ; k++) { robot.mouseTo(Math.random(), Math.random()); robot.lookAt(0.3 + Math.random() * 0.4, 0.4); await sleep(0.55); if (k % 2) robot.click(); }
}
async function phoneLoop(robot: Bot) {
  await robot.holdPhone(true);
  for (;;) { await sleep(1.1); robot.swipe(); }
}

function measureFps() {
  let n = 0, t0 = 0;
  const step = (t: number) => {
    if (!t0) t0 = t;
    n++;
    if (t - t0 < 4000) requestAnimationFrame(step);
    else { api.fps = (n * 1000) / (t - t0); }
  };
  requestAnimationFrame(step);
  // time spent in the gsap ticker callbacks (all robots' per-frame work)
  let sum = 0, count = 0;
  const probeStart = () => { (api as any)._t = performance.now(); };
  const probeEnd = () => { sum += performance.now() - (api as any)._t; count++; api.frameMs = sum / count; };
  gsap.ticker.add(probeStart, false, true);
  gsap.ticker.add(probeEnd);
}

function tag(robot: Bot, text: string) {
  const crop = (robot.el as Element).closest(".sd-crop");
  if (crop) crop.insertAdjacentHTML("beforeend", `<span class="sd-tag">${text}</span>`);
}

async function gallery() {
  const brands = ["claudeAgent", "codex", "grok", "opencode"];
  const front = VIEW === "front";
  const items: [string, RobotLook][] =
    SCENE === "looks" ? Array.from({ length: 12 }, (_, i) => [brands[i % 4], randomLook(seeded("demo-look-" + i))] as [string, RobotLook])
    : SCENE === "hats" ? HATS.map((h, i) => [brands[i % 4], { accent: ["#ff9f5a", "#4fb6ff", "#ff6f91", "#4ff0a0", "#b07cff", "#ffd27a"][i % 6], hat: h.id }] as [string, RobotLook])
    : SCENE === "accs" ? ACCESSORIES.map((a, i) => [brands[i % 4], { accent: ["#e2434b", "#4fb6ff", "#ff9f5a", "#4ff0a0", "#b07cff"][i % 5], accessory: a.id, build: (["slim", "regular", "sturdy"] as const)[i % 3] }] as [string, RobotLook])
    : EYES.map((e, i) => [brands[i % 4], { eyes: e.id, blush: i % 3 === 0 }] as [string, RobotLook]);
  const labels = SCENE === "hats" ? HATS.map((h) => h.label) : SCENE === "accs" ? ACCESSORIES.map((a) => a.label) : SCENE === "eyes" ? EYES.map((e) => e.label) : [];
  root.style.width = `${(SCENE === "looks" ? 4 : Math.min(6, items.length)) * 208 * SCALE}px`;
  items.forEach(([brand, look], i) => {
    const { desk, robot } = station(SCALE);
    robot.setBrand(brand);
    robot.setModel(["claude-opus-5-5", "gpt-5.5-codex", "grok-5", "qwen-coder-4"][i % 4]);
    robot.setLook(look);
    if (labels[i]) tag(robot, labels[i]);
    if (front || SCENE === "eyes") robot.setPose("ask");
    else if (SCENE === "looks" && i % 4 === 3) robot.setPose("ask");
    else if (SCENE === "looks" && (i === 1 || i === 6 || i === 8)) void typeLoop(desk, robot, 8 + i);
    else if (SCENE === "looks" && i === 4) void phoneLoop(robot);
    else if (SCENE === "looks" && i === 9) void mouseLoop(robot);
    else robot.setPose(i % 3 === 0 ? "rest" : "idle");
  });
  api.shots = [2600];
}

async function run() {
  if (GALLERY) { await gallery(); return; }
  if (SCENE === "grid") {
    const bots = Array.from({ length: 6 }, (_, i) => station(SCALE, i));
    const [a, b, c, d, e, f] = bots;
    void typeLoop(a.desk, a.robot);
    void mouseLoop(b.robot);
    void phoneLoop(c.robot);
    d.robot.setHeadphones?.(true); d.robot.setGroove?.(112); void typeLoop(d.desk, d.robot, 11);
    e.robot.setPose("think");
    f.robot.setPose("notice");
    measureFps();
    api.shots = [3500];
    return;
  }
  const { desk, robot } = station(SCALE);
  switch (SCENE) {
    case "typing": void typeLoop(desk, robot); api.shots = [2600, 3100]; break;
    case "mouse": void mouseLoop(robot); api.shots = [2000, 2400]; break;
    case "phone": void phoneLoop(robot); api.shots = [2600]; break;
    case "drink": await sleep(0.4); void robot.drink(); api.shots = [1500, 2350]; break;
    case "notice": robot.setPose("notice"); api.shots = [1300, 2000, 2700]; break;
    case "celebrate": robot.setPose("celebrate"); api.shots = [1150, 1400]; break;
    case "think": robot.setPose("think"); api.shots = [2000]; break;
    case "swivel":
      api.shots = [1000, 1150, 1270, 1380, 1500, 1700, 2000, 3600, 3760, 3900, 4100];
      await sleep(0.85); robot.setPose("notice");
      await sleep(2.5); robot.setPose("rest");
      break;
    case "rest": robot.setPose("rest"); api.shots = [2000]; break;
    case "sleep": robot.setPose("sleep"); api.shots = [3000]; break;
    case "headphones":
      if (robot.setHeadphones) robot.setHeadphones(true); else robot.setLook({ ...LOOKS[0][2], headphones: true });
      robot.setGroove?.(116);
      await sleep(1.6);
      void typeLoop(desk, robot);
      api.shots = [3000, 3260, 3520];
      break;
    case "headphones-on":
      robot.setPose("rest");
      await sleep(0.8);
      robot.setHeadphones?.(true);
      api.shots = [1150, 1400, 2600];
      break;
    default: {
      const bar = document.createElement("div");
      bar.className = "sd-controls";
      root.appendChild(bar);
      const btn = (label: string, fn: () => void) => { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; bar.appendChild(b); };
      let stop = 0;
      const solo = (fn: () => Promise<void>) => { stop++; const me = stop; void (async () => { await fn(); void me; })(); };
      btn("type text", () => solo(async () => { for (const ch of "npm run test -- --watch\n") { robot.pressKey(ch === "\n" ? "Enter" : ch); desk.typeOnScreen(ch); await sleep(0.08 + Math.random() * 0.1); } }));
      btn("fast typing", () => robot.setTyping(true));
      btn("stop typing", () => robot.setTyping(false));
      for (const p of ["type", "mouse", "read", "think", "ask", "notice", "celebrate", "sleep", "stretch", "rest", "idle"] as Pose[]) btn(p, () => robot.setPose(p));
      btn("drink", () => void robot.drink());
      btn("phone on", () => void robot.holdPhone(true));
      btn("phone off", () => void robot.holdPhone(false));
      btn("swipe", () => robot.swipe());
      let hp = false, bpm = 0;
      btn("headphones", () => { hp = !hp; robot.setHeadphones?.(hp); });
      btn("groove", () => { bpm = bpm ? 0 : 112; robot.setGroove?.(bpm); });
      for (const r of ["cheer", "angry", "laugh", "surprised", "shy"] as const) btn(r, () => robot.react(r));
      btn("wake", () => robot.wake());
      // look picker
      const bar2 = document.createElement("div");
      bar2.className = "sd-controls";
      root.appendChild(bar2);
      let look: RobotLook = { ...(LOOKS.find((l) => l[0] === BRAND)?.[2] ?? {}) };
      const selects: Record<string, HTMLSelectElement> = {};
      const sel = (key: keyof RobotLook, opts: { id: string | number; label: string }[]) => {
        const l = document.createElement("label");
        l.textContent = String(key);
        const s = document.createElement("select");
        s.innerHTML = opts.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
        s.onchange = () => { look = { ...look, [key]: key === "head" ? Number(s.value) : s.value }; robot.setLook(look); };
        l.appendChild(s); bar2.appendChild(l); selects[key] = s;
      };
      sel("build", BUILDS); sel("head", HEAD_SIZES.map((h) => ({ id: h, label: String(h) })));
      sel("hat", HATS); sel("accessory", ACCESSORIES); sel("eyes", EYES); sel("tint", TINTS); sel("sticker", STICKERS);
      const sync = () => { for (const [k, s] of Object.entries(selects)) s.value = String((look as any)[k] ?? s.options[0].value); };
      sync();
      const b2 = document.createElement("button");
      b2.textContent = "randomize look";
      b2.onclick = () => { look = randomLook(Math.random); robot.setLook(look); sync(); };
      bar2.appendChild(b2);
      (window as any).robot = robot;
    }
  }
}
void run();
