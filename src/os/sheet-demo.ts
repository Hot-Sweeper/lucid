// Demo of what a robot's screen shows for images and pages. Sample data only.
//   ?scene=sheet      a sprite sheet (8 frames in a row) that plays like a video
//   ?scene=grid       a 4 x 3 walk cycle named walk-cycle.png
//   ?scene=photo      a wide picture that is not a sheet: stays a still picture
//   ?scene=page&url=  a real page (a dev server, say) drawn by a real browser; needs the Electron shell
//   ?scene=html       HTML a robot wrote, drawn as a real page
//   ?scene=uac        the permission prompt, with sample approvals standing in for T3 (never shown in the real app)
//   ?scene=file&src=<url>&name=sheet.png   a real image from a URL (served with CORS), as a robot would see it
//   ?scene=icons      every app icon at dock size and window bar size, with its name
//   ?scene=director   a desk played by the real Director: it reads sheet.png, tests a page on localhost, renders HTML
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../styles.css";
import "../office/office.css";
import { WM } from "./wm";
import { UacPrompt } from "./uac";
import { detectSheet } from "./sheet";
import { ToolApp } from "./apps";
import { BrowserApp } from "./browser";
import { WALLPAPERS } from "../office/roster";
import { t3Icon, t3Title } from "../harness/t3code";
import "../world/world.css";
import { useRobot, Desk } from "../office/desk";
import { TopDownRobot } from "../world/seated";
import type { RobotProfile } from "../office/roster";
import type { Item } from "../director";

const qs = new URLSearchParams(location.search);
const scene = qs.get("scene") || "sheet";
const W = window as any;
W.__phase = "start";
document.head.insertAdjacentHTML("beforeend", `<style>html, body { overflow: hidden; background: #141a33; margin: 0; } .d-screen { position: relative; width: 820px; height: 461px; overflow: hidden; transform-origin: 0 0; }</style>`);

const stub = () => ({ setPose() {}, mouseTo() {}, lookAt() {}, click() {}, pressKey() {}, setTyping() {}, react() {}, drink: async () => {}, holdPhone: async () => {}, wake() {}, swipe() {}, tap() {} }) as any;
const el = document.createElement("div");
el.className = "d-screen";
el.style.transform = `scale(${Number(qs.get("zoom")) || Math.min(innerWidth / 820, innerHeight / 461)})`;
if (scene !== "director" && scene !== "icons") document.getElementById("sd-demo")!.appendChild(el);
const wm = new WM(el, stub());
wm.prefs = { windows: "floating", tidiness: "normal", launch: "dock", switching: "click" } as any;
wm.robotName = "Pip";
wm.setWallpaper(WALLPAPERS[0]);
wm.brandApp("t3code", { title: t3Title("stable"), icon: t3Icon("stable") });

// a little robot bouncing and waving, one pose per cell
function robotFrame(g: CanvasRenderingContext2D, x: number, y: number, size: number, t: number) {
  const s = size / 96;
  const bob = Math.sin(t * Math.PI * 2) * 5 * s, wave = Math.sin(t * Math.PI * 2 + 1) * 0.9;
  g.save(); g.translate(x + size / 2, y + size * 0.62 + bob);
  g.fillStyle = "#6e7bd8"; g.beginPath(); g.roundRect(-16 * s, -6 * s, 32 * s, 30 * s, 8 * s); g.fill();
  g.fillStyle = "#f2e8d8"; g.beginPath(); g.roundRect(-18 * s, -34 * s, 36 * s, 28 * s, 11 * s); g.fill();
  g.fillStyle = "#1c2150"; g.beginPath(); g.roundRect(-12 * s, -27 * s, 24 * s, 12 * s, 6 * s); g.fill();
  g.fillStyle = "#7fe0ff"; g.beginPath(); g.arc(-5 * s, -21 * s, 2.6 * s, 0, 7); g.arc(5 * s, -21 * s, 2.6 * s, 0, 7); g.fill();
  g.strokeStyle = "#f2e8d8"; g.lineCap = "round"; g.lineWidth = 6 * s;
  g.beginPath(); g.moveTo(16 * s, 0); g.lineTo((26 + Math.cos(wave) * 8) * s, (-6 + wave * 10) * s); g.stroke();
  g.beginPath(); g.moveTo(-16 * s, 0); g.lineTo(-26 * s, 14 * s); g.stroke();
  g.restore();
}
function sheetOf(cols: number, rows: number, size: number, bg: string | null) {
  const c = document.createElement("canvas");
  c.width = cols * size; c.height = rows * size;
  const g = c.getContext("2d")!;
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  for (let n = 0; n < cols * rows; n++) robotFrame(g, (n % cols) * size, Math.floor(n / cols) * size, size, n / (cols * rows));
  return c.toDataURL("image/png");
}
function photo() {
  const c = document.createElement("canvas");
  c.width = 900; c.height = 260;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 900, 260);
  sky.addColorStop(0, "#f9a86b"); sky.addColorStop(0.5, "#6aa7d8"); sky.addColorStop(1, "#264a7a");
  g.fillStyle = sky; g.fillRect(0, 0, 900, 260);
  for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${200 + i * 3} 40% ${25 + (i % 5) * 6}%)`; g.beginPath(); g.moveTo(i * 24 - 30, 260); g.lineTo(i * 24 + 20, 120 + ((i * 37) % 80)); g.lineTo(i * 24 + 70, 260); g.fill(); }
  return c.toDataURL("image/png");
}

const PAGE_HTML = `<!doctype html><html><head><title>Pixels library content</title><style>body{font:16px system-ui;margin:0;background:#101426;color:#eef}h1{padding:28px 32px;margin:0;background:linear-gradient(90deg,#ff9f5a,#e0647e)}li{padding:12px 32px;border-bottom:1px solid #2a3158}</style></head><body><h1>Pixels library</h1><ul><li>Sprites</li><li>Tiles</li><li>Icons</li></ul></body></html>`;

// A desk with a robot, played by the real Director from fake thread items.
async function directorScene() {
  useRobot((host, rig) => new TopDownRobot(host, rig));
  const floor = document.createElement("div");
  floor.style.cssText = `position:relative;width:400px;height:380px;transform-origin:0 0;background:#c49a6c;transform:scale(${Number(qs.get("zoom")) || Math.min(innerWidth / 400, innerHeight / 380)})`;
  document.getElementById("sd-demo")!.appendChild(floor);
  const sheet = sheetOf(8, 1, 96, "#ffffff");
  const services = { peek: async () => null, image: async (p: string) => (/sheet\.png$/.test(p) ? sheet : null), readText: async () => null };
  const desk = new Desk(floor, 0, 0, services);
  const profile: RobotProfile = {
    id: "bot-demo", name: "Pip", brand: "claude" as any, provider: "claudeAgent", look: {} as any, hiredAt: Date.now(), threadId: "t-demo", jobs: 1,
    prefs: { editor: "studio", wallpaper: 2, games: { snake: 1, flappy: 1, dash: 1, chess: 1 }, phone: "clips", subagents: "app", music: 0, social: 0, mug: "#4fb6ff", tasks: "sticky", hobby: "chiller", windows: "floating", listens: "never", launch: "dock", switching: "click", tidiness: "normal", git: "cli" },
  } as any;
  desk.assign({ id: "t-demo", title: "Pixel art pipeline", provider: "claudeAgent" } as any, profile);
  desk.director.setInfo({ id: "t-demo", title: "Pixel art pipeline", provider: "claudeAgent", root: "", run: { id: "r1", status: "running" } } as any);
  const now = () => new Date().toISOString();
  const item = (id: string, ordinal: number, data: any): Item => ({ id, runId: "r1", ordinal, type: "dynamic_tool", status: "completed", updatedAt: now(), data });
  const which = (qs.get("items") || "sheet,page,html").split(",");
  const items: Item[] = [];
  let o = 1;
  if (which.includes("sheet")) items.push(item("i1", o++, { toolName: "Read", input: { file_path: "C:/work/art/sheet.png" }, output: { type: "image" }, viewedImagePath: "C:/work/art/sheet.png" }));
  if (which.includes("page")) items.push(item("i2", o++, { toolName: "mcp__t3-code__preview_open", input: { url: "http://localhost:6555/tall" }, output: { url: "http://localhost:6555/tall", title: "Postplan, Drafts", tabId: "tab-1" } }));
  if (which.includes("html")) items.push(item("i3", o++, { toolName: "mcp__t3-code__html_render", input: { html: PAGE_HTML, height: 190, title: "Pixels library content" }, output: { ok: true } }));
  desk.director.push(items, false);
  const start = Date.now();
  while (Date.now() - start < 120000) {
    await new Promise((r) => setTimeout(r, 500));
    const d = desk.director as any;
    if (d.pumpEpoch === -1 && !d.queue.length) break;
  }
}

// Sample approvals in place of T3: one is approved after a few seconds, a risky one is declined.
async function uacScene() {
  let open: any[] = [];
  const decided = new Map<string, string>();
  const uac = new UacPrompt(wm, {
    pending: async () => open,
    outcome: async (_t, id) => ({ status: "resolved", decision: decided.get(id) ?? null }),
  });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await wait(1500);
  wm.open("browser").catch(() => {});
  await wait(1500);
  const a = { id: "r1", type: "approval", requestKind: "command", prompt: "node -e \"console.log('lucid-approval-test')\"", detail: "This command requires approval", options: [{ decision: "decline", label: "Decline", warning: null }, { decision: "accept", label: "Approve", warning: null }] };
  open = [a];
  await uac.sync("t", "r1", { name: "Pip", harness: "Claude" });
  await wait(5000);
  decided.set("r1", "accept"); open = [];
  await wait(3500);
  const b = { id: "r2", type: "approval", requestKind: "command", prompt: "rm -rf C:\Users\me\.t3\scratch\lucid-shots-orch\*", detail: "Dangerous rm operation on statically-unresolvable target", options: [{ decision: "decline", label: "Decline", warning: null }, { decision: "accept", label: "Approve", warning: null }] };
  open = [b];
  await uac.sync("t", "r2", { name: "Pip", harness: "Claude" });
  await wait(5000);
  decided.set("r2", "decline"); open = [];
}

function iconsScene() {
  const ids = ["files", "editor", "editorPad", "editorVim", "terminal", "browser", "photos", "player", "tool", "t3code", "harness", "gitdesk", "notes", "tasks", "calc", "weather", "music", "beats", "social", "game", "botword", "cellsheet", "slidedeck", "botsapp", "telegrid", "chirp", "doodle", "crossword", "solitaire", "stocks", "mail", "lingo", "folder", "file"];
  const titles = wm as any;
  const box = document.createElement("div");
  box.style.cssText = "display:grid;grid-template-columns:repeat(6,150px);gap:14px 10px;padding:18px;width:1000px;color:#eef;font:12px var(--font)";
  for (const id of ids) {
    const svg = (wm.iconOf(id as any) ?? "") || "<b style='color:#f66'>MISSING</b>";
    const title = (id === "editorPad" ? "Notepad" : id === "editorVim" ? "vim" : titles.titleOf(id)) ?? id;
    box.insertAdjacentHTML("beforeend", `<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start"><div style="display:flex;gap:10px;align-items:center"><span style="width:44px;height:44px;display:block">${svg}</span><span class="win-bar" style="width:auto;display:flex;gap:6px;align-items:center;padding:3px 8px;border-radius:6px;background:#2e3577;font-size:11px"><span style="width:16px;height:16px;display:block">${svg}</span></span></div><span>${title} <span style="opacity:.5">${id}</span></span></div>`);
  }
  document.getElementById("sd-demo")!.appendChild(box);
}

async function main() {
  try {
    const tool = new ToolApp(wm);
    if (scene === "icons") iconsScene();
    else if (scene === "file") {
      const blob = await (await fetch(qs.get("src") || "")).blob();
      const u = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
      const t = performance.now();
      const found = await detectSheet(u, qs.get("name") || "sheet.png");
      const sh = found?.sheet;
      console.warn("DETECT " + (performance.now() - t).toFixed(0) + "ms " + JSON.stringify(sh ? { cols: sh.cols, rows: sh.rows, n: sh.frames.length, fw: sh.fw, fh: sh.fh, fps: sh.fps, kind: sh.kind, clips: sh.clips, first: sh.frames.slice(0, 3) } : null));
      await tool.picture(qs.get("name") || "sheet.png", u, async () => u);
    }
    else if (scene === "uac") await uacScene();
    else if (scene === "director") await directorScene();
    else if (scene === "sheet") { const u = sheetOf(8, 1, 96, "#ffffff"); console.warn("DETECT " + JSON.stringify((await detectSheet(u, "sheet.png"))?.sheet.frames.length ?? null)); await tool.picture("sheet.png", u, async () => u); }
    else if (scene === "grid") { const u = sheetOf(4, 3, 64, null); console.warn("DETECT " + JSON.stringify((await detectSheet(u, "walk-cycle.png"))?.sheet.frames.length ?? null)); await tool.picture("walk-cycle.png", u, async () => u); }
    else if (scene === "photo") { const u = photo(); console.warn("DETECT " + JSON.stringify((await detectSheet(u, "skyline.png"))?.sheet.frames.length ?? null)); await tool.picture("skyline.png", u, async () => u); }
    else if (scene === "page" || scene === "html") {
      const b = new BrowserApp(wm, async () => null);
      if (scene === "page") await b.open(qs.get("url") || "http://localhost:6555/", { real: true });
      else await b.open("about:blank", { html: PAGE_HTML, title: "Pixels library content", key: "html:1", newTab: true });
    }
  } catch (err) { console.error("scene failed", err); }
  W.__phase = "done";
}
void main();
