// Test bench for project managers: a normal desk, a manager with a project logo and one with only a
// monogram (it also turns to the camera, to show the chest badge). Open content-demo.html#manager
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import "../office/office.css";
import "../world/world.css";
import { Desk, useRobot } from "../office/desk";
import { TopDownRobot } from "../world/seated";
import type { RobotProfile } from "../office/roster";

const W = window as unknown as { __lc: { log: string[]; errors: string[]; stats: Record<string, unknown> } };
if (location.hash.slice(1).startsWith("manager")) {
  const root = document.getElementById("demo")!;
  root.innerHTML = "";
  root.style.cssText = "display:block;padding:0";
  const floor = document.createElement("div");
  floor.style.cssText = "position:relative;width:1560px;height:640px;overflow:hidden;background:#c49a6c";
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;left:0;top:0;transform-origin:0 0;transform:scale(1.3)";
  floor.appendChild(layer);
  root.appendChild(floor);
  useRobot((host, rig) => new TopDownRobot(host, rig));
  const services = { peek: async () => null, image: async () => null, readText: async () => null };
  const prefs = { editor: "studio", wallpaper: 1, games: { snake: 1, flappy: 1, dash: 1, chess: 1 }, phone: "clips", subagents: "cli", music: 0.2, social: 0.4, mug: "#ff8a65", tasks: "board", hobby: "gamer", windows: "floating", listens: "never", launch: "dock", switching: "click", tidiness: "normal", git: "cli" } as RobotProfile["prefs"];
  const profile = (id: string, name: string, role: string | null): RobotProfile => ({ id, name, brand: "codex", provider: "codex", look: { accent: "#ff9f5a", antennaTip: "ball" }, prefs, hiredAt: 0, threadId: null, jobs: 3, role });
  const drop = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2c4 5 7 8.5 7 12a7 7 0 0 1-14 0c0-3.5 3-7 7-12Z" fill="#1d9bf0"/><path d="M9 14a3 3 0 0 0 3 3" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>')}`;
  const make = (x: number, id: string, title: string, role: string | null) => {
    const d = new Desk(layer, x, 10, services);
    d.assign({ id, title, provider: "codex", model: "gpt-5.5-codex" }, profile(id, id === "m1" ? "Orbit" : id === "m2" ? "Mochi" : "Pip", role));
    return d;
  };
  const plain = make(0, "p1", "Fix the login bug", null);
  void plain;
  const m1 = make(400, "m1", "Waterboat: channel and upload manager", "Channel and upload manager");
  m1.setManager({ title: "Waterboat", icon: drop, role: "Channel and upload manager", team: [{ title: "Render the weekly short", status: "working" }, { title: "Fix the thumbnail uploader", status: "waiting" }, { title: "Rename old uploads", status: "idle" }] });
  m1.setPlan([{ text: "Check yesterday's uploads", status: "completed" }, { text: "Queue three shorts", status: "running" }, { text: "Reply to comments", status: "pending" }]);
  const m2 = make(800, "m2", "Lucid: content", "Robot content lead");
  m2.setManager({ title: "Lucid Content", icon: null, role: "Robot content lead", team: [{ title: "Codex image view", status: "working" }] });
  m2.robot.setPose("celebrate");
  window.setTimeout(() => { W.__lc.log.push("ready"); }, 500);
}
