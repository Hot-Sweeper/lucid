import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import gsap from "gsap";
import "./world.css";
import { UNIT, type Expression, type Pose, type Reaction, type RobotLook } from "../office/rig";
import { TopDownRobot } from "./seated";
import { DemoDesk } from "./demo-desk";
import { Walker, type Activity, type Facing } from "./walker";

// Demo of the world characters. URL params:
//   only=desk|break|queue|handoff   show one section
//   brand=codex|claude|grok|other   start brand of the seated robot
//   still=1                         do not run the seated robot's script (for scripted captures)
//   scale=1.6                       desk zoom
//   raf=0                           drive animations by timers (hidden capture windows)

const qs = new URLSearchParams(location.search);
const ONLY = qs.get("only");
const STILL = qs.get("still") === "1";
const DESK_SCALE = Number(qs.get("scale") || 1.5);

const style = document.createElement("style");
style.textContent = `
  :root { --font: "Lexend Variable", system-ui, sans-serif; --mono: "JetBrains Mono Variable", ui-monospace, monospace;
    --sky1: #6fb2ee; --sky2: #d4ecfb; --stars: 0; --lamp: 0.15; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #20253d; color: #eef0ff; font-family: var(--font); }
  #demo { display: flex; flex-wrap: wrap; gap: 28px; padding: 22px; align-items: flex-start; }
  .world-demo-section { display: flex; flex-direction: column; gap: 10px; }
  .world-demo-section h2 { margin: 0; font-size: 15px; font-weight: 500; color: #b9bfe6; }
  .world-demo-floor { position: relative; overflow: hidden; border-radius: 8px; background: #c49a6c;
    background-image: repeating-linear-gradient(0deg, transparent 0 25px, rgba(150, 110, 70, 0.35) 25px 26px); }
  .world-demo-zoom { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .world-demo-desk { position: absolute; left: 0; top: 0; }
  .world-demo-table { position: absolute; left: 0; top: 0; overflow: visible; }
  .world-demo-key { fill: #5a6177; transition: fill 0.12s; }
  .world-demo-key.down { fill: #9fe8ff; }
  .world-demo-monitor { position: absolute; border-radius: 12px;
    background: linear-gradient(170deg, #2a2f45, #151927 70%); box-shadow: 0 10px 18px rgba(30, 20, 10, 0.28); }
  .world-demo-screen { position: absolute; border-radius: 6px; overflow: hidden;
    background: linear-gradient(160deg, #1b2150, #0e1233); }
  .world-demo-code { padding: 6px 7px; font: 500 7px/1.35 var(--mono); color: #a8f0d0; white-space: pre-wrap; }
  .world-demo-robot { position: absolute; inset: 0; pointer-events: none; }
  .world-demo-phone { position: absolute; left: 0; top: 0; width: 150px; height: 300px; border-radius: 22px; background: #1a1d2e; padding: 8px;
    display: none; box-shadow: 0 10px 20px rgba(10, 12, 30, 0.35); z-index: 5; }
  .world-demo-phone.on { display: block; }
  .world-demo-phone-screen { width: 100%; height: 100%; border-radius: 15px; overflow: hidden; background: linear-gradient(#ff9f5a, #ff6f91); display: flex; flex-direction: column; gap: 10px; padding: 18px 12px; }
  .world-demo-phone-screen i { display: block; height: 52px; border-radius: 12px; background: rgba(255, 255, 255, 0.85); }
  .world-demo-controls { display: flex; gap: 8px; flex-wrap: wrap; }
  .world-demo-controls button { border: 0; background: #2e3577; color: #fff; padding: 8px 13px; border-radius: 9px; cursor: pointer; font-size: 13px; }
  .world-demo-controls button:hover { background: #3c45a0; }
  .world-demo-status { font-size: 13px; color: #8a91c4; min-height: 1.3em; }
`;
document.head.appendChild(style);

const root = document.getElementById("demo")!;
const want = (k: string) => !ONLY || ONLY === k;

function section(title: string, w: number, h: number, scale = 1) {
  const s = document.createElement("section");
  s.className = "world-demo-section";
  s.innerHTML = `<h2></h2><div class="world-demo-floor" style="width:${w * scale}px;height:${h * scale}px"><div class="world-demo-zoom" style="width:${w}px;height:${h}px;transform:scale(${scale})"></div></div><div class="world-demo-controls"></div><div class="world-demo-status"></div>`;
  s.querySelector("h2")!.textContent = title;
  root.appendChild(s);
  return { el: s, stage: s.querySelector(".world-demo-zoom") as HTMLElement, controls: s.querySelector(".world-demo-controls") as HTMLElement, status: s.querySelector(".world-demo-status") as HTMLElement };
}

const sleep = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));
const api: Record<string, unknown> = {};
(window as any).worldDemo = api;

// ---- seated robot ---------------------------------------------------------------------
if (want("desk")) {
  const sec = section("Seated robot", UNIT.w, UNIT.h + 20, DESK_SCALE);
  const desk = new DemoDesk(sec.stage);
  const robot = new TopDownRobot(desk.host, desk.rig);
  robot.setBrand(qs.get("brand") || "codex");
  robot.setModel("gpt-5.5-codex");
  api.robot = robot; api.desk = desk;
  const say = (t: string) => (sec.status.textContent = t);

  const type = async (text: string, cps = 11) => {
    robot.setPose("type");
    for (const ch of text) {
      const k = ch === "\n" ? "Enter" : ch;
      robot.pressKey(k);
      desk.typeOnScreen(ch);
      await sleep(1 / cps * (0.6 + Math.random() * 0.8));
    }
  };
  const looks: [string, string, RobotLook][] = [
    ["codex", "gpt-5.5-codex", { antennaTip: "ball" }],
    ["claudeAgent", "claude-opus-5-5", { accent: "#ff9f5a", antennaTip: "star", sticker: "bolt" }],
    ["grok", "grok-5", { accent: "#4fb6ff", antennaTip: "ring", headphones: true, sticker: "smile" }],
    ["opencode", "qwen-coder-4", { accent: "#4ff0a0", antennaTip: "heart", sticker: "heart" }],
  ];
  const script = async () => {
    for (let i = 0; ; i++) {
      const [brand, model, look] = looks[i % looks.length];
      robot.setBrand(brand); robot.setModel(model); robot.setLook(look);
      say(`${brand}: typing`);
      await type("const hello = (name) => `hi ${name}`;\nexport default hello;\n");
      robot.setTyping(true); say("typing fast"); await sleep(2.2); robot.setTyping(false);
      say("mouse"); robot.setPose("mouse");
      for (let k = 0; k < 6; k++) { robot.mouseTo(Math.random(), Math.random()); robot.lookAt(Math.random(), 0.4); await sleep(0.5); if (k % 2) robot.click(); }
      say("read"); robot.setPose("read"); await sleep(1.6);
      say("think"); robot.setPose("think"); await sleep(2.4);
      say("drink"); robot.setPose("rest"); await sleep(0.6); await robot.drink();
      say("phone"); await robot.holdPhone(true);
      for (let k = 0; k < 3; k++) { await sleep(0.8); robot.swipe(); }
      await sleep(0.8); await robot.holdPhone(false);
      say("ask"); robot.setPose("ask");
      for (const e of ["neutral", "happy", "surprised", "focus", "shy", "angry", "laugh", "sleepy"] as Expression[]) { robot.setExpression(e); say(`ask, ${e}`); await sleep(1); }
      robot.setExpression("neutral");
      say("celebrate"); robot.setPose("celebrate"); await sleep(3.4);
      say("notice"); robot.setPose("notice"); await sleep(1.8);
      say("angry slam"); robot.setPose("type"); await sleep(0.8); robot.react("angry"); await sleep(1.8);
      say("laugh"); robot.react("laugh"); await sleep(1.4);
      say("stretch"); robot.setPose("stretch"); await sleep(2.8);
      say("sleep"); robot.setPose("sleep"); await sleep(3.5); robot.wake(); await sleep(1);
    }
  };
  if (!STILL) void script();
  const btn = (label: string, fn: () => void) => { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; sec.controls.appendChild(b); };
  btn("Wave of typing", () => void type("npm run test -- --watch\n", 14));
  for (const p of ["type", "mouse", "think", "ask", "celebrate", "sleep", "stretch", "rest"] as Pose[]) btn(p, () => robot.setPose(p));
  for (const r of ["angry", "laugh", "surprised"] as Reaction[]) btn(r, () => robot.react(r));
  btn("drink", () => void robot.drink());
  btn("phone", () => void robot.holdPhone(true));
}

// ---- walking robots: every facing and activity -------------------------------------------
if (want("walkers")) {
  const sec = section("Walking robots", 1100, 560, 1);
  const brands = ["codex", "claudeAgent", "grok", "opencode"];
  const facings: Facing[] = ["up", "down", "left", "right"];
  const ws: Walker[] = [];
  brands.forEach((b, i) => facings.forEach((f, j) => {
    const w = new Walker(sec.stage, { id: `${b}-${f}`, provider: b, model: ["gpt-5.5-codex", "claude-opus-5-5", "grok-5", "qwen-coder"][i], name: b });
    w.setPos(90 + j * 260 + i * 50, 140 + i * 125);
    w.face(f);
    ws.push(w);
  }));
  api.walkers = ws;
  api.Walker = Walker;
  const acts: Activity[] = ["idle", "talk", "laugh", "eat", "drink", "charge", "nap", "wave", "wait", "hold-card", "sit", "explain", "listen"];
  for (const a of acts) {
    const b = document.createElement("button");
    b.textContent = a;
    b.onclick = () => ws.forEach((w) => w.do(a, { card: "Should I delete the old migration files?" }));
    sec.controls.appendChild(b);
  }
}
