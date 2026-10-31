// Harness demo page: T3 Code (stable) and T3 Code (Nightly) side by side, each on its own
// 820 x 461 robot screen, playing the same scripted thread. Sample data only.
import { T3CodeApp, t3Icon, t3Title, type T3Channel, type T3Host } from "./t3code";
import type { AppId } from "../os/wm";

const api = ((window as any).lucid ??= {});
// sample sidebar threads for the demo (the real app lists your own T3 threads)
api.threads ??= async () => [
  { id: "a", title: "Site favorites and CLI page download", projectTitle: "postplan", provider: "claudeAgent", runStatus: "completed", updatedAt: new Date(Date.now() - 7 * 60e3).toISOString() },
  { id: "b", title: "Require login for uploads", projectTitle: "postplan", provider: "codex", runStatus: "completed", updatedAt: new Date(Date.now() - 29 * 60e3).toISOString() },
  { id: "c", title: "Built-in screenshot cropping", projectTitle: "t3code", provider: "claudeAgent", runStatus: "running", updatedAt: new Date(Date.now() - 60 * 60e3).toISOString() },
  { id: "d", title: "Dark mode dashboard polish", projectTitle: "Lucid", provider: "opencode", runStatus: "completed", updatedAt: new Date(Date.now() - 4 * 3600e3).toISOString() },
];

function host(screen: HTMLElement, channel: T3Channel): T3Host {
  screen.innerHTML = `<div class="os"><div class="wallpaper" style="background:radial-gradient(120% 90% at 30% 10%, #3a3f99 0%, #24286b 45%, #161a45 100%)"></div><div class="win-layer"></div></div>`;
  const layer = screen.querySelector(".win-layer") as HTMLElement;
  let win: { el: HTMLElement; body: HTMLElement; title: HTMLElement } | null = null;
  return {
    epoch: 0,
    prefs: { t3: channel },
    robotName: "demo",
    robot: { setTyping() {}, setPose() {} },
    async open(_id: AppId, title?: string) {
      if (win) return win;
      const el = document.createElement("section");
      el.className = "win focused app-t3code";
      el.style.cssText = "left:60px;top:10px;width:700px;height:396px;z-index:10";
      el.innerHTML = `<header class="win-bar">${t3Icon(channel)}<span class="win-title"></span><span class="win-x"></span></header><div class="win-body"></div>`;
      (el.querySelector(".win-title") as HTMLElement).textContent = title || t3Title(channel);
      layer.append(el);
      win = { el, body: el.querySelector(".win-body") as HTMLElement, title: el.querySelector(".win-title") as HTMLElement };
      return win;
    },
    async sleep(ms: number) { await new Promise((r) => setTimeout(r, ms)); },
  };
}

async function play(app: T3CodeApp, h: T3Host) {
  const info = { id: "own", title: "Add expiring draft share links", projectTitle: "postplan", provider: "claudeAgent", model: "claude-opus-5-5", effort: "high", run: { status: "running" } };
  app.setInfo(info);
  await app.user("Add expiring share links to drafts, with tests");
  const items: any[] = [
    { id: "1", type: "reasoning", status: "completed", data: {} },
    { id: "2", type: "dynamic_tool", status: "completed", data: { toolName: "Grep", input: { pattern: "shareLink" } } },
    { id: "3", type: "dynamic_tool", status: "completed", data: { toolName: "Read", input: { file_path: "src/drafts/share.ts" } } },
    { id: "4", type: "file_change", status: "completed", data: { changes: [{ path: "src/drafts/share.ts", operation: "update" }], diff: "+a\n+b\n+c\n+d\n+e\n+f\n+g\n+h\n+i\n+j\n+k\n+l\n-x\n-y\n-z" } },
    { id: "5", type: "command_execution", status: "running", data: { input: "pnpm test drafts" } },
  ];
  for (const it of items) { app.activity(it); await h.sleep(500); }
  await h.sleep(1200);
  app.update({ ...items[4], status: "completed", data: { ...items[4].data, exitCode: 0 } });
  await h.sleep(600);
  let text = "";
  const full = "Share links now expire after **7 days** by default. `createShareLink` takes an optional `expiresIn`, and expired links return 410. Tests for both cases pass.";
  const t = setInterval(() => { text = full.slice(0, text.length + 6); }, 40);
  await app.assistant(() => ({ text, done: text.length >= full.length }));
  clearInterval(t);
  app.setInfo({ ...info, run: { status: "running" } });
}

for (const [id, ch] of [["t3s", "stable"], ["t3n", "nightly"]] as const) {
  const el = document.getElementById(id);
  if (!el) continue;
  const h = host(el, ch);
  const app = new T3CodeApp(h);
  void play(app, h);
}
