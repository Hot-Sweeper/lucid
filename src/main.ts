import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import "./office/office.css";
import gsap from "gsap";
import { World, type Room, type WorldData } from "./office/world";
import { ChatPanel } from "./office/chat-panel";
import { showMenu, confirmDialog } from "./office/menus";
import { openHire, BUILTIN_ROLES, type Role } from "./office/hire";
import { Orchestrator, type OrchState } from "./office/orchestrator";
import { progress } from "./office/progress";
import type { Desk } from "./office/desk";
import type { ThreadInfo } from "./director";
import { logoFor, harnessName } from "./office/brand";
import openaiLogo from "./assets/openai.svg";
import claudeLogo from "./assets/claude.svg";

declare global {
  interface Window {
    lucid: {
      projects(): Promise<{ id: string; title: string; root: string }[]>;
      world(): Promise<WorldData>;
      startThreadIn?: never;
      settingsLoad(): string;
      settingsSave(json: string): Promise<void>;
      addProject(o: { path: string; title?: string }): Promise<{ output: string }>;
      removeProject(o: { id: string }): Promise<{ output: string }>;
      host(): Promise<string>;
      orchInit(o?: { provider?: string; model?: string }): Promise<{ threadId: string; projectId: string; dir: string }>;
      orchMemory(): Promise<string>;
      userMessagesSince(since: string, exclude: string): Promise<{ threadId: string; title: string; at: string; text: string }[]>;
      conversation(id: string): Promise<any[]>;
      attachDir(): Promise<string>;
      watchSet(ids: string[]): Promise<boolean>;
      startThread(o: { project: string; message: string; provider?: string; model?: string }): Promise<{ threadId: string }>;
      sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
      peek(url: string): Promise<any>;
      image(path: string): Promise<string | null>;
      readText(path: string): Promise<string | null>;
      onItems(fn: (p: { threadId: string; items: any[]; initial: boolean }) => void): () => void;
      onInfo(fn: (p: { threadId: string; info: ThreadInfo }) => void): () => void;
      checkUpdate(): Promise<{ available: boolean; behind?: number; changes?: string[]; reason?: string }>;
      applyUpdate(): Promise<{ ok: boolean; error?: string }>;
      onUpdateStep(fn: (s: string) => void): () => void;
      version(): Promise<string>;
    };
  }
}

const api = window.lucid;
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

document.getElementById("app")!.innerHTML = `
  <aside class="panel">
    <header class="brand"><span class="mark" aria-hidden="true"></span><h1>Lucid</h1>
      <button class="update" id="update" type="button" hidden>Update</button>
    </header>

    <section class="company" id="company" aria-live="polite"></section>

    <section class="rooms">
      <h3>Rooms</h3>
      <ul id="room-list" class="room-list"></ul>
      <button type="button" class="link-btn" id="overview">Whole building</button>
      <div class="hidden-offices" id="hidden-offices" hidden></div>
    </section>

    <section class="orch" id="orch">
      <h3>Orchestrator</h3>
      <div id="orch-body"></div>
    </section>

    <section class="focus" id="focus">
      <p class="hint" id="focus-hint">Click a robot's desk to follow it and chat. Click a free desk to hire someone.</p>
      <div id="focus-body" hidden>
        <div class="focus-head"><img id="focus-logo" alt=""><h2 id="focus-title"></h2></div>
        <p class="sub" id="focus-sub"></p>
        <p class="activity" id="focus-activity" aria-live="polite"></p>
      </div>
    </section>
  </aside>
  <main class="scene" id="scene"></main>
  <div class="zoom-ui"><button type="button" id="back-btn" hidden>Back to the office</button></div>`;

const world = new World($("scene"), { peek: (u) => api.peek(u), image: (p) => api.image(p), readText: (p) => api.readText(p) });
let selectedDesk: Desk | null = null;
(window as any).__world = world; // debug handle for test runs
const chat = new ChatPanel($("scene").parentElement!, { conversation: (id) => api.conversation(id), sendMessage: (o) => api.sendMessage(o) });
world.panelWidth = 400;
world.onFocus = (d) => { if (d) { chat.open(d); chat.setView(world.focusMode); pushStatus(d); } else chat.close(); };
chat.onClose = () => world.unfocus();
chat.onToggleView = () => {
  const d = world.focusDesk;
  if (!d) return;
  if (world.focusMode === "desk") world.focusScreen(d); else world.focusOn(d);
  chat.setView(world.focusMode);
};
function pushStatus(d: Desk) {
  const run = d.info?.run?.status;
  const state = d.info && (d.info as any).question ? "waiting" : run === "running" || run === "queued" ? "working" : "idle";
  chat.setStatus(d.activity || (state === "working" ? "Working" : "Waiting for a task"), state as any);
}
// Dev aid: keep the last errors where a debug run can read them.
(window as any).__errs = [];
window.addEventListener("error", (e) => (window as any).__errs.push(String(e.message)));
const origError = console.error.bind(console);
console.error = (...a: any[]) => { (window as any).__errs.push(a.map(String).join(" ").slice(0, 300)); origError(...a); };

// --- rooms --------------------------------------------------------------------------
world.onRooms = (rooms: Room[]) => {
  const list = $("room-list");
  const html = rooms.map((r) => `
    <li><button type="button" data-room="${r.id}">
      ${r.icon ? `<img src="${r.icon}" alt="">` : `<span class="dot ${r.kind}"></span>`}
      <span class="rt">${esc(r.title)}</span><span class="rc">${r.threadIds.length || ""}</span>
    </button></li>`).join("");
  if (list.dataset.html !== html) { list.innerHTML = html; list.dataset.html = html; }
};
$("room-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-room]") as HTMLElement | null;
  if (b) world.showRoom(b.dataset.room!);
});
$("overview").addEventListener("click", () => world.overview());

// --- following one robot ----------------------------------------------------------------
function renderFocus() {
  const d = selectedDesk;
  $("focus-hint").hidden = !!d;
  $("focus-body").hidden = !d;
  if (!d) return;
  const info = d.info;
  const logo = $("focus-logo") as HTMLImageElement;
  const src = logoFor(info?.provider);
  logo.hidden = !src;
  if (src) logo.src = src;
  $("focus-title").textContent = info?.title || "Free desk";
  const who = d.profile ? `${d.profile.name}, ${harnessName(info?.provider)} robot` : `${harnessName(info?.provider)} robot`;
  $("focus-sub").textContent = [who, (info as any)?.model, info?.projectTitle].filter(Boolean).join(" · ");
  $("focus-sub").title = d.profile ? `Likes: ${d.profile.prefs.editor === "pad" ? "Notepad" : d.profile.prefs.editor === "vim" ? "vim" : "Studio"} editor, ${d.profile.prefs.phone === "clips" ? "short clips" : "long videos"}, subagents in the ${d.profile.prefs.subagents === "cli" ? "terminal" : "desktop app"}. Jobs done: ${d.profile.jobs}` : "";
  $("focus-activity").textContent = d.activity || "";
}
world.onSelect = (d) => {
  selectedDesk = d && d.threadId ? d : null;
  renderFocus();
};
world.onSelectThread = (id) => {
  const d = world.deskFor(id);
  if (d) { world.select(d); world.showDesk(d); }
};
const sceneObserver = new MutationObserver(() => ($("back-btn").hidden = !$("scene").classList.contains("screen-mode")));
sceneObserver.observe($("scene"), { attributes: true, attributeFilter: ["class"] });
$("back-btn").addEventListener("click", () => world.unfocus());


// --- live data -------------------------------------------------------------------------
api.onItems(({ threadId, items, initial }) => { world.deskFor(threadId)?.director.push(items, initial); chat.ping(threadId); });
api.onInfo(({ threadId, info }) => {
  const d = world.deskFor(threadId);
  if (!d || info.error) return;
  d.setInfo(info);
  if (d === selectedDesk) renderFocus();
  if (d === world.focusDesk) pushStatus(d);
});

let watched = "";
let firstLoad = true;
async function refresh() {
  try {
    const data = await api.world();
    for (const p of data.projects) projectTitles.set(p.id, p.title);
    orch.observe(data.threads);
    renderCompany(data.shipped ?? { total: 0, today: 0 });
    if (settings.orch) { world.orchThread = settings.orch.threadId; world.homes.set(settings.orch.threadId, "main"); }
    world.update(data);
    for (const d of world.desks.values()) {
      d.onActivity = (t) => { if (d === world.focusDesk) pushStatus(d); if (d === selectedDesk) { const a = $("focus-activity"); if (a.textContent !== t) { a.textContent = t; gsap.fromTo(a, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.3 }); } } };
    }
    const ids = [...world.desks.keys()].sort();
    const key = ids.join(",");
    if (key !== watched) { watched = key; await api.watchSet(ids); }
    if (firstLoad) {
      firstLoad = false;
      const want = new URLSearchParams(location.search).get("thread");
      const d = want ? world.deskFor(want) : null;
      if (d) { world.select(d); requestAnimationFrame(() => world.showDesk(d)); }
      else requestAnimationFrame(() => world.overview());
    }
  } catch (err) {
    console.error("world refresh failed", err);
  }
}

// --- office and desk options -------------------------------------------------------------
function setupMenus() {
  world.onAddDesk = (room) => {
    world.extra.set(room, (world.extra.get(room) ?? 0) + 1);
    saveSettings();
    void refresh();
  };
  world.onFreeDeskMenu = (d, slot, x, y) => {
    const room = slot.split("#")[0];
    const extra = world.extra.get(room) ?? 0;
    showMenu(x, y, "Free desk", [
      { label: "Hire someone for this desk", run: () => world.onFreeDesk(d, slot, x, y) },
      ...(extra > 0 ? [{ label: "Remove this desk", danger: true, run: () => { world.extra.set(room, extra - 1); saveSettings(); void refresh(); } }] : []),
    ]);
  };
  world.onFreeDesk = (_d, slot, _x, _y) => {
    const [room, idx] = slot.split("#");
    const data = world.lastData;
    if (!data) return;
    const r = world.rooms.find((q) => q.id === room);
    const settled = new Set(data.threads.filter((t) => t.settled).map((t) => t.id));
    const scratch = data.projects.find((p) => p.scratch);
    const projectId = room.startsWith("p:") ? room.slice(2) : room === "freelance" ? scratch?.id ?? "" : "";
    const real = data.projects.filter((p) => !p.scratch && !world.hidden.has(p.id) && p.id !== settings.orch?.projectId);
    openHire({
      room, roomTitle: r?.title ?? "Office", seat: Number(idx) || 0,
      team: world.roster.freeTeam(settled),
      providers: ["codex", "claudeAgent"],
      models: data.models ?? {},
      prices: data.prices ?? {},
      roles: [...BUILTIN_ROLES, ...(settings.roles ?? [])],
      onNewRole: (r) => { settings.roles = [...(settings.roles ?? []), r]; saveSettings(); },
      projects: projectId ? null : real.map((p) => ({ id: p.id, title: p.title })),
      onHire: async (c) => {
        const project = projectId || c.projectId;
        if (!project) throw new Error("Choose a project for this desk");
        const message = c.role ? `Your role: ${c.role.name}. ${c.role.brief}\n\nTask: ${c.task}` : c.task;
        const { threadId } = await api.startThread({ project, message, provider: c.provider, model: c.model ?? undefined });
        world.roster.assignRobot(threadId, c.robotId, c.provider, c.role?.name ?? "");
        world.homes.set(threadId, room);
        world.pendingSeat = { room, index: Number(idx) || 0, threadId };
        saveSettings();
        await refresh();
        const nd = world.deskFor(threadId);
        if (nd) { world.select(nd); world.focusOn(nd); }
      },
    });
  };
  world.onRoomMenu = (room, x, y) => {
    if (room.kind === "freelance") {
      showMenu(x, y, "Freelancers", [{ label: "Hide this office", run: () => { world.hidden.add("freelance"); saveSettings(); void refresh(); } }]);
      return;
    }
    const pid = room.id.slice(2);
    showMenu(x, y, room.title, [
      { label: "Hide this office", run: () => { world.hidden.add(pid); saveSettings(); void refresh(); } },
      { label: "Remove project from T3", danger: true, run: async () => {
        const ok = await confirmDialog(`Remove ${room.title} from T3?`,
          "T3 removes the project only if it has no threads left. Threads are never deleted from here. You can add the folder again any time.", "Remove project");
        if (!ok) return;
        try { await api.removeProject({ id: pid }); void refresh(); }
        catch (err: any) { await confirmDialog("T3 kept the project", String(err.message || err), "OK"); }
      } },
    ]);
  };
  world.onDeskMenu = (d, x, y) => {
    const items: any[] = [
      { label: "Look at its screen", run: () => world.focusScreen(d) },
      { label: "Go to its desk", run: () => world.showDesk(d) },
    ];
    if (d.room === "freelance" && d.folder) {
      items.push({ input: "Turn this work into a project", placeholder: "Project name", value: (d.info?.title || "").slice(0, 40), submit: "Create project",
        run: async (name: string) => { await api.addProject({ path: d.folder!, title: name }); await refresh(); } });
    }
    showMenu(x, y, d.info?.title || "Robot", items);
  };
}

// --- one-click update --------------------------------------------------------------------
async function checkUpdate() {
  const u = await api.checkUpdate().catch(() => null);
  const btn = $<HTMLButtonElement>("update");
  if (u?.available) { btn.hidden = false; btn.title = (u.changes || []).join("\n"); btn.textContent = `Update (${u.behind})`; }
  else btn.hidden = true;
}
$("update").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("update");
  btn.disabled = true;
  const off = api.onUpdateStep((s) => (btn.textContent = s));
  const res = await api.applyUpdate();
  off();
  if (!res.ok) { btn.disabled = false; btn.textContent = "Retry update"; btn.title = res.error || ""; }
});

const attachDir = await api.attachDir().catch(() => "");
world.building = await api.host().catch(() => "This PC");
const settings: { hidden?: string[]; extra?: Record<string, number>; homes?: Record<string, string>; orch?: OrchState | null; roles?: Role[]; level?: number } = (() => { try { return JSON.parse(api.settingsLoad() || "{}"); } catch { return {}; } })();
world.hidden = new Set(settings.hidden ?? []);
world.extra = new Map(Object.entries(settings.extra ?? {}));
world.homes = new Map(Object.entries(settings.homes ?? {}));
const saveSettings = () => {
  settings.hidden = [...world.hidden];
  settings.extra = Object.fromEntries(world.extra);
  settings.homes = Object.fromEntries(world.homes);
  void api.settingsSave(JSON.stringify(settings));
  renderHidden();
};
function renderHidden() {
  const box = $("hidden-offices");
  const ids = [...world.hidden];
  box.hidden = !ids.length;
  box.innerHTML = ids.length ? `<h3>Hidden offices</h3>${ids.map((id) => `<button type="button" class="link-btn" data-show="${id}">Show ${esc(projectTitles.get(id) || "office")}</button>`).join("")}` : "";
}
$("hidden-offices").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-show]") as HTMLElement | null;
  if (!b) return;
  world.hidden.delete(b.dataset.show!);
  saveSettings();
  void refresh();
});
const projectTitles = new Map<string, string>();
setupMenus();
const orch = new Orchestrator(api as any, world, () => settings.orch ?? null, (s) => { settings.orch = s; saveSettings(); });
orch.onChange = renderOrch;
(window as any).__orch = orch; // debug handle for test runs
function renderOrch() {
  const s = settings.orch;
  const body = $("orch-body");
  if (!s) {
    body.innerHTML = `<p class="hint">Your stand-in: it learns how you like things done from what you tell robots, and can review their finished work for you.</p><button type="button" class="primary" id="orch-hire">Hire the orchestrator</button><p class="form-msg" id="orch-msg" role="status"></p>`;
    $("orch-hire").addEventListener("click", async () => {
      const b = $<HTMLButtonElement>("orch-hire");
      b.disabled = true;
      $("orch-msg").textContent = "Setting up its desk and notebook…";
      try {
        const id = await orch.hire();
        await refresh();
        const d = world.deskFor(id);
        if (d) { world.select(d); world.focusOn(d); }
      } catch (err: any) {
        $("orch-msg").textContent = `Could not hire it: ${err.message || err}`;
        b.disabled = false;
      }
    });
    return;
  }
  body.innerHTML = `
    <p class="orch-line">Learned from <b>${s.learned}</b> of your messages</p>
    <label class="switch"><input type="checkbox" id="orch-review" ${s.review ? "checked" : ""}><span class="track" aria-hidden="true"><i></i></span><span>Review finished work for me</span></label>
    <div class="orch-actions"><button type="button" class="ghost" id="orch-notes">Read its notebook</button><button type="button" class="ghost" id="orch-desk">Go to its desk</button></div>`;
  $<HTMLInputElement>("orch-review").addEventListener("change", (e) => orch.setReview((e.target as HTMLInputElement).checked));
  $("orch-notes").addEventListener("click", () => void orch.showNotebook());
  $("orch-desk").addEventListener("click", () => { const d = world.deskFor(s.threadId); if (d) { world.select(d); world.focusOn(d); } });
}
renderOrch();

// --- company progress ------------------------------------------------------------------------
let lastCompany = "";
function renderCompany(shipped: { total: number; today: number }) {
  const p = progress(shipped.total);
  const key = `${shipped.total}:${shipped.today}`;
  if (key === lastCompany) return;
  lastCompany = key;
  $("company").innerHTML = `
    <div class="co-top"><b>Level ${p.level}</b><span>${p.level >= 10 ? "Top level" : `${p.to - shipped.total} runs to level ${p.level + 1}`}</span></div>
    <div class="co-bar" role="progressbar" aria-valuemin="${p.from}" aria-valuemax="${p.to}" aria-valuenow="${shipped.total}"><i style="width:${Math.round(p.frac * 100)}%"></i></div>
    <p class="co-sub">${shipped.total} runs shipped, ${shipped.today} today</p>`;
  const prev = settings.level;
  if (prev != null && p.level > prev) celebrate(p.level);
  if (prev !== p.level) { settings.level = p.level; saveSettings(); }
}
function celebrate(level: number) {
  for (const d of world.desks.values()) d.robot.react("cheer");
  const el = document.createElement("div");
  el.className = "level-up";
  el.innerHTML = `<b>Level ${level}</b><span>Your company grew. New things to decorate offices with are unlocked.</span>`;
  document.body.appendChild(el);
  gsap.timeline({ onComplete: () => el.remove() })
    .fromTo(el, { opacity: 0, y: -20, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(2)" })
    .to(el, { opacity: 0, y: -10, duration: 0.4, delay: 4 });
}
world.attachDir = attachDir;
await refresh();
setInterval(refresh, 3000);
checkUpdate();
setInterval(checkUpdate, 60 * 1000);
