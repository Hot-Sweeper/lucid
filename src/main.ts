import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import "./office/office.css";
import "./office/panels.css";
import "./world/world.css";
import "./decor/decor.css";
import { openDecorate, type RoomTheme } from "./office/decorate";
import { TopDownRobot } from "./world/seated";
import { BreakRoom } from "./world/breakroom";
import { QuestionLine } from "./world/queue";
import { useRobot } from "./office/desk";
import gsap from "gsap";
import { World, type Room, type WorldData } from "./office/world";
import { ChatPanel } from "./office/chat-panel";
import { AnswerCard } from "./office/answer";
import { Delegate, showDecisions } from "./office/delegate";
import { showMenu, confirmDialog } from "./office/menus";
import { openHire, BUILTIN_ROLES, type Role } from "./office/hire";
import { openCustomizeFor } from "./office/customize";
import { Orchestrator, type OrchState } from "./office/orchestrator";
import { progress } from "./office/progress";
import { mountStats } from "./stats/stats";
import { Wallet, openShop, coinIcon, boostNow, luckyHour, type WalletState } from "./office/shop";
import { ShopFront } from "./office/shopfront";
import { watchDaily } from "./office/daily";
import { MILESTONES, check as checkMs, celebrateMilestone, openMilestones, type Stats as MsStats } from "./office/milestones";
import { CATALOG } from "./office/shop";
import type { Desk } from "./office/desk";
import type { ThreadInfo } from "./director";
import { logoFor, harnessName } from "./office/brand";
import { wireThreadDrag } from "./office/thread-drag";
import type { ThreadRef } from "./office/thread-ref";
import { foldButton, foldSection, setRail } from "./office/sidebar";
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
  <aside class="panel" id="side-panel">
    <header class="brand"><span class="mark" aria-hidden="true"></span><h1>Lucid</h1><button type="button" class="wx" id="wx" hidden aria-haspopup="menu"></button>
      <button class="update" id="update" type="button" hidden>Update</button>
      <button type="button" class="side-hide" id="side-hide" aria-expanded="true" aria-controls="side-panel" aria-label="Hide sidebar" title="Hide sidebar: it folds into a rail on the left (Ctrl+B)"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M9.5 4L5.5 8l4 4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 2.5v11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>Hide<span class="sh-more"> sidebar</span></span></button>
    </header>

    <section class="company" id="company" aria-live="polite"></section>
    <section class="wallet" id="wallet"><span class="wl-coins" title="1 coin for every dollar of AI work at API prices">${coinIcon(18)}<b id="wl-bal">0</b><span>coins</span></span><span class="wl-boost" id="wl-boost" hidden></span><button type="button" class="wl-shop" id="open-shop">Shop</button></section>

    <section class="threads">
      <div class="th-head"><h3>Threads</h3><label class="th-search"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10.5 10.5l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="th-q" type="search" placeholder="Search" aria-label="Search threads"></label>${foldButton("threads", "threads")}</div>
      <div class="fold-body" id="fold-threads"><ol class="th-list" id="th-list" aria-label="Threads. Drag one into the chat, or press R, to reference it"></ol></div>
    </section>

    <section class="rooms">
      <div class="sec-head"><h3>Rooms</h3>${foldButton("rooms", "rooms")}</div>
      <div class="fold-body" id="fold-rooms">
      <ul id="room-list" class="room-list"></ul>
      <div class="room-links"><button type="button" class="link-btn" id="overview">Whole building</button><button type="button" class="link-btn" id="park">The park</button><button type="button" class="link-btn" id="shop-link">The shop</button></div>
      <div class="hidden-offices" id="hidden-offices" hidden></div>
      </div>
    </section>

    <section class="usage" id="usage">
      <div class="sec-head"><h3>Usage</h3>${foldButton("usage", "usage")}</div>
      <div class="fold-body" id="fold-usage"><div id="usage-body"></div></div>
    </section>

    <section class="orch" id="orch">
      <div class="sec-head"><h3>Orchestrator</h3>${foldButton("orch", "orchestrator")}</div>
      <div class="fold-body" id="fold-orch"><div id="orch-body"></div></div>
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
  <nav class="side-rail" id="side-rail" aria-label="Folded sidebar" hidden>
    <button type="button" class="rail-show" id="rail-show" aria-expanded="false" aria-controls="side-panel" title="Show sidebar (Ctrl+B)"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M6.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 2.5v11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>Show<br>sidebar</span></button>
    <button type="button" class="rail-coins" id="rail-coins" title="Coins. Click to open the shop">${coinIcon(16)}<b id="rail-bal">0</b></button>
    <ol class="rail-list" id="rail-list" aria-label="Threads"></ol>
  </nav>
  <main class="scene" id="scene"></main>
  <div class="zoom-ui"><button type="button" id="back-btn" hidden>Back to the office</button></div>`;

// robots in the original design, plus the break room and the question line
useRobot((host, rig) => new TopDownRobot(host, rig));
const world = new World($("scene"), { peek: (u) => api.peek(u), image: (p) => api.image(p), readText: (p) => api.readText(p) });
world.extFactory.break = (h, w, hh) => new BreakRoom(h, w, hh);
world.extFactory.queue = (h, w, hh) => new QuestionLine(h, w, hh);
let selectedDesk: Desk | null = null;
(window as any).__world = world; // debug handle for test runs
const chat = new ChatPanel($("scene").parentElement!, { conversation: (id) => api.conversation(id), sendMessage: (o) => api.sendMessage(o), saveAttachment: (n, d) => (api as any).saveAttachment(n, d), t3: (window as any).lucidT3 });
// the sidebar and the chat are columns beside the scene, so the camera always fits what is left (see World)
world.onFocus = (d) => { if (d) { chat.open(d); chat.setView(world.focusMode); pushStatus(d); } else chat.close(); };
// a robot's question, answered from its chat (see openAnswer)
const answer = new AnswerCard(chat, { pending: (id) => (window as any).lucid.pendingRequests(id), t3: (window as any).lucidT3, advice: (rid) => delegate.advice.get(rid) ?? null });
// a chat opened without a desk (questions room, follow chip) closes itself
chat.onClose = () => { if (!world.focusDesk) chat.close(); world.unfocus(); };
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
  // while the robot types its reply in its Messages app, you see it typing here too
  chat.setTyping(/^Writing to you/.test(d.activity || ""), d.profile?.name ?? "It");
}
// Dev aid: keep the last errors where a debug run can read them.
(window as any).__errs = [];
window.addEventListener("error", (e) => (window as any).__errs.push(String(e.message) + " @ " + String(e.error?.stack || "").split("\n").slice(1, 4).join(" < ")));
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
  if (!b) return;
  world.showRoom(b.dataset.room!);
  // the questions room: answer the robot at the front of the line
  if (world.rooms.find((r) => r.id === b.dataset.room)?.kind === "queue") { const t = world.lastData?.threads.find((x) => x.question); if (t) openAnswer(t.id); }
});
$("overview").addEventListener("click", () => world.overview());
$("park").addEventListener("click", () => world.showPark());

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
  if (needsAnswer(id)) { openAnswer(id); return; }
  const d = world.deskFor(id);
  if (d) { world.select(d); world.showDesk(d); }
};
const sceneObserver = new MutationObserver(() => ($("back-btn").hidden = !$("scene").classList.contains("screen-mode")));
sceneObserver.observe($("scene"), { attributes: true, attributeFilter: ["class"] });
$("back-btn").addEventListener("click", () => world.unfocus());


// --- live data -------------------------------------------------------------------------
api.onItems(({ threadId, items, initial }) => { world.deskFor(threadId)?.director.push(items, initial); chat.ping(threadId); answer.ping(threadId); });
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
    void delegate.observe(data.threads, data.projects);
    renderCompany(data.shipped ?? { total: 0, today: 0 });
    if (settings.orch) world.orchThread = settings.orch.threadId;
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
    console.error("world refresh failed", err, String((err as any)?.stack || "").split("\n").slice(1, 3).join(" < "));
  }
}

// --- office and desk options -------------------------------------------------------------
function setupMenus() {
  world.onAddDesk = (room) => {
    world.extra.set(room, (world.extra.get(room) ?? 0) + 1);
    world.seats.get(room)?.push(null);
    saveSettings();
    void refresh();
  };
  world.onFreeDeskMenu = (d, slot, x, y) => {
    const room = slot.split("#")[0];
    const extra = world.extra.get(room) ?? 0;
    showMenu(x, y, room === "main" ? "Drag a thread here from the sidebar" : "Free desk", [
      ...(room === "main" ? [] : [{ label: "Hire someone for this desk", run: () => world.onFreeDesk(d, slot, x, y) }]),
      ...(extra > 0 ? [{ label: "Remove this desk", danger: true, run: () => {
        const seats = world.seats.get(room);
        const index = Number(slot.split("#")[1]);
        if (seats?.[index] === null) seats.splice(index, 1);
        world.extra.set(room, extra - 1); saveSettings(); void refresh();
      } }] : []),
    ]);
  };
  world.onFreeDesk = (_d, slot, _x, _y) => {
    const [room, idx] = slot.split("#");
    if (room === "main") { showMenu(_x, _y, "Drag a thread here from the sidebar", []); return; }
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
  const decorate = (room: { id: string; title: string }) => {
    const SHEET = 372; // the decorate panel covers the right side of the view
    world.showRoom(room.id, SHEET);
    openDecorate({ title: room.title, theme: world.themes.get(room.id) ?? {}, level: world.level, wallet, onChange: async (t: RoomTheme) => {
      world.themes.set(room.id, t); saveSettings();
      await refresh();
      world.showRoom(room.id, SHEET);   // the room may have grown a lounge
    } });
  };
  (window as any).__decorate = decorate; // debug handle for test runs
  world.onRoomMenu = (room, x, y) => {
    const deco = { label: "Decorate", run: () => decorate(room) };
    if (room.kind === "main") { showMenu(x, y, room.title, [deco]); return; }
    if (room.kind === "freelance") {
      showMenu(x, y, "Freelancers", [deco, { label: "Hide this office", run: () => { world.hidden.add("freelance"); saveSettings(); void refresh(); } }]);
      return;
    }
    const pid = room.id.slice(2);
    showMenu(x, y, room.title, [
      deco,
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
      { label: "Customize robot", run: () => openCustomizeFor(d, world.roster, world.level) },
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
const settings: { seats?: Record<string, (string | null)[]>; hidden?: string[]; extra?: Record<string, number>; homes?: Record<string, string>; orch?: OrchState | null; roles?: Role[]; level?: number; themes?: Record<string, RoomTheme>; wallet?: WalletState; milestones?: string[]; nightRuns?: boolean; weatherFix?: { kind: string; at: number }; ui?: { rail?: boolean; chatTab?: boolean; folded?: string[]; sideW?: number; chatW?: number } } = (() => { try { return JSON.parse(api.settingsLoad() || "{}"); } catch { return {}; } })();
world.hidden = new Set(settings.hidden ?? []);
world.extra = new Map(Object.entries(settings.extra ?? {}));
world.themes = new Map(Object.entries(settings.themes ?? {}));
world.level = settings.level ?? 0;
world.homes = new Map(Object.entries(settings.homes ?? {}));
world.seats = new Map(Object.entries(settings.seats ?? {}).filter(([, seats]) => Array.isArray(seats)));

// --- folding the sidebar, its sections and the chat (remembered in settings.ui) ------------
settings.ui ??= {};
const ui = settings.ui;
const folded = new Set(ui.folded ?? []);
const appEl = $("app") as HTMLElement;
// Panel widths: you drag the inner edge of the sidebar or the chat. Small windows shrink the chat first, then
// the sidebar, so the office always keeps room.
const SIDE = { min: 240, max: 520, def: 300, rail: 64 }, CHAT = { min: 340, max: 760, tab: 44 }, SCENE_MIN = 380;
const chatDefault = () => Math.round(Math.min(560, Math.max(400, innerWidth * 0.32)));
const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const widths = () => {
  let side = ui.rail ? SIDE.rail : clampTo(ui.sideW ?? SIDE.def, SIDE.min, SIDE.max);
  let chatW = chat.collapsed ? CHAT.tab : clampTo(ui.chatW ?? chatDefault(), CHAT.min, CHAT.max);
  let over = side + chatW + SCENE_MIN - innerWidth;
  if (over > 0 && !chat.collapsed) { const cut = Math.min(over, chatW - CHAT.min); chatW -= cut; over -= cut; }
  if (over > 0 && !ui.rail) side -= Math.min(over, side - SIDE.min);
  return { side, chat: chatW };
};
chat.wide = () => widths().chat;
let chatTween: gsap.core.Tween | null = null;
const applyLayout = () => {
  const w = widths();
  chatTween?.kill(); chatTween = null;
  if (!appEl.classList.contains("rail-moving")) appEl.style.setProperty("--side", `${w.side}px`);
  appEl.style.setProperty("--chat", `${w.chat}px`);
  appEl.classList.toggle("chat-folded", chat.collapsed);
  for (const [g, v, lo, hi] of [[sideGrip, w.side, SIDE.min, SIDE.max], [chatGrip, w.chat, CHAT.min, CHAT.max]] as const) {
    g.setAttribute("aria-valuenow", String(Math.round(v))); g.setAttribute("aria-valuemin", String(lo)); g.setAttribute("aria-valuemax", String(hi));
  }
};
// folding the chat: the column glides to its tab or back, and the camera fits the area as it changes
const slideChat = (animate: boolean) => {
  const to = widths().chat;
  appEl.classList.toggle("chat-folded", chat.collapsed);
  chatTween?.kill();
  if (!animate) { chatTween = null; appEl.style.setProperty("--chat", `${to}px`); return; }
  chatTween = gsap.to(appEl, { "--chat": `${to}px`, duration: chat.collapsed ? 0.34 : 0.4, ease: "power3.inOut", onComplete: () => { chatTween = null; } });
};
// the draggable edges (highlighted only while grabbed; arrow keys and a double-click work too)
const makeGrip = (cls: "left" | "right", label: string, key: "sideW" | "chatW", range: { min: number; max: number }, def: () => number) => {
  const g = document.createElement("div");
  g.className = `grip ${cls}`;
  g.tabIndex = 0;
  g.setAttribute("role", "separator");
  g.setAttribute("aria-orientation", "vertical");
  g.setAttribute("aria-label", label);
  g.title = "Drag to resize. Double-click to reset.";
  appEl.appendChild(g);
  const dir = cls === "left" ? 1 : -1;
  const other = () => (cls === "left" ? widths().chat : widths().side);
  const set = (w: number) => {
    // never wider than leaves the office room
    const hi = Math.max(range.min, Math.min(range.max, innerWidth - SCENE_MIN - other()));
    ui[key] = Math.round(clampTo(w, range.min, hi));
    applyLayout();
  };
  const now = () => (cls === "left" ? widths().side : widths().chat);
  g.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    g.setPointerCapture(e.pointerId);
    const x0 = e.clientX, w0 = now();
    g.classList.add("grabbing");
    document.body.classList.add("col-resizing");
    const move = (ev: PointerEvent) => set(w0 + dir * (ev.clientX - x0));
    const up = () => {
      g.classList.remove("grabbing");
      document.body.classList.remove("col-resizing");
      g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
      saveSettings();
    };
    g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
  });
  g.addEventListener("dblclick", () => { ui[key] = undefined; applyLayout(); saveSettings(); });
  g.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 96 : 24;
    const d = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    if (!d) return;
    e.preventDefault();
    set(now() + dir * d);
    saveSettings();
  });
  return g;
};
const sideGrip = makeGrip("left", "Resize the sidebar", "sideW", SIDE, () => SIDE.def);
const chatGrip = makeGrip("right", "Resize the chat", "chatW", CHAT, chatDefault);
window.addEventListener("resize", applyLayout);
applyLayout();
$("side-panel").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-fold]") as HTMLElement | null;
  if (!b) return;
  const key = b.dataset.fold!, open = b.getAttribute("aria-expanded") !== "true";
  if (open) folded.delete(key); else folded.add(key);
  foldSection(key, open);
  ui.folded = [...folded];
  saveSettings();
});
for (const key of folded) foldSection(key, false, false);
const toggleRail = (on: boolean, animate = true) => {
  ui.rail = on;
  $("side-hide").setAttribute("aria-expanded", String(!on));
  $("rail-show").setAttribute("aria-expanded", String(!on));
  if (on) renderRail();
  const hadFocus = document.activeElement === $("side-hide") || document.activeElement === $("rail-show");
  appEl.classList.add("rail-moving");
  setRail(on, { app: appEl, panel: $("side-panel"), rail: $("side-rail"), animate, wide: () => widths().side, done: () => { appEl.classList.remove("rail-moving"); applyLayout(); if (hadFocus) $(on ? "rail-show" : "side-hide").focus(); } });
};
$("side-hide").addEventListener("click", () => { toggleRail(true); saveSettings(); });
$("rail-show").addEventListener("click", () => { toggleRail(false); saveSettings(); });
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") { e.preventDefault(); toggleRail(!ui.rail); saveSettings(); }
});
if (ui.rail) toggleRail(true, false);
chat.setCollapsed(!!ui.chatTab, false);
applyLayout();
chat.onCollapse = (on, animate) => { ui.chatTab = on; saveSettings(); slideChat(animate); };
const saveSettings = () => {
  settings.hidden = [...world.hidden];
  settings.extra = Object.fromEntries(world.extra);
  settings.themes = Object.fromEntries(world.themes);
  settings.homes = Object.fromEntries(world.homes);
  settings.seats = Object.fromEntries(world.seats);
  void api.settingsSave(JSON.stringify(settings));
  renderHidden();
};
world.onLayoutChange = saveSettings;
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
// questions go to the orchestrator first; it answers what it is sure about and passes the rest to you
const delegate = new Delegate(api as any, (window as any).lucidT3, () => settings.orch ?? null, (p) => { if (settings.orch) { settings.orch = { ...settings.orch, ...p }; saveSettings(); } });
delegate.onPhase = (id, phase, text) => { world.bossDecision(id, phase, text); answer.ping(id); };
delegate.onChange = () => renderOrch();
(window as any).__delegate = delegate;
(window as any).__chat = chat;
(window as any).__refresh = () => refresh();
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
  const log = delegate.log;
  body.innerHTML = `
    <p class="orch-line">Learned from <b>${s.learned}</b> of your messages</p>
    <p class="orch-line">Answered <b>${log.auto}</b> ${log.auto === 1 ? "question" : "questions"} for you, asked you <b>${log.asked}</b></p>
    <label class="switch"><input type="checkbox" id="orch-auto" ${s.auto !== false ? "checked" : ""}><span class="track" aria-hidden="true"><i></i></span><span>Let the Orchestrator answer for me</span></label>
    <label class="switch"><input type="checkbox" id="orch-review" ${s.review ? "checked" : ""}><span class="track" aria-hidden="true"><i></i></span><span>Review finished work for me</span></label>
    <div class="orch-actions"><button type="button" class="ghost" id="orch-decisions">Recent decisions</button><button type="button" class="ghost" id="orch-notes">Read its notebook</button><button type="button" class="ghost" id="orch-desk">Go to its chair</button></div>`;
  $<HTMLInputElement>("orch-review").addEventListener("change", (e) => orch.setReview((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>("orch-auto").addEventListener("change", (e) => { if (settings.orch) { settings.orch = { ...settings.orch, auto: (e.target as HTMLInputElement).checked }; saveSettings(); } });
  $("orch-decisions").addEventListener("click", () => showDecisions(delegate, (v) => { if (settings.orch) { settings.orch = { ...settings.orch, threshold: v }; saveSettings(); } }));
  $("orch-notes").addEventListener("click", () => void orch.showNotebook());
  // it sits in the boss chair in the questions room: follow it there (or its desk, if it has one)
  $("orch-desk").addEventListener("click", () => {
    const d = world.deskFor(s.threadId);
    if (d) { world.select(d); world.focusOn(d); return; }
    const boss = document.querySelector(`.world-walker[data-id="${CSS.escape(s.threadId)}"]`) as HTMLElement | null;
    if (boss) world.follow(boss);
  });
}
renderOrch();

// --- company progress ------------------------------------------------------------------------
let lastCompany = "";
let lastShipped: { total: number; today: number } | null = null;
let walletReady: Wallet | null = null;   // set once the coin wallet exists (startup order)
function renderCompany(shipped: { total: number; today: number }) {
  const p = progress(shipped.total);
  const key = `${shipped.total}:${shipped.today}`;
  if (key === lastCompany) return;
  lastCompany = key;
  const coOpen = !folded.has("company");
  $("company").innerHTML = `
    <div class="co-top"><b>Level ${p.level}</b><span>${p.level >= 10 ? "Top level" : `${p.to - shipped.total} runs to level ${p.level + 1}`}</span>${foldButton("company", "company progress", coOpen)}</div>
    <div class="fold-body" id="fold-company"${coOpen ? "" : " hidden"}>
    <div class="co-bar" role="progressbar" aria-label="Progress to the next level" aria-valuemin="${p.from}" aria-valuemax="${p.to}" aria-valuenow="${shipped.total}"><i style="width:${Math.round(p.frac * 100)}%"></i></div>
    <p class="co-sub">${shipped.total} runs shipped, ${shipped.today} today</p>
    <button type="button" class="link-btn co-ms" id="open-ms">Milestones <span id="ms-count"></span></button>
    </div>`;
  $("company").classList.toggle("folded", !coOpen);
  $("open-ms").addEventListener("click", () => openMilestones(milestoneStats(shipped), new Set(settings.milestones ?? [])));
  lastShipped = shipped;
  checkMilestones(shipped);
  const prev = settings.level;
  if (prev != null && p.level > prev) celebrate(p.level);
  if (prev !== p.level) { settings.level = p.level; saveSettings(); }
  if (world.level !== p.level) { world.level = p.level; void refresh(); }
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

// tokens, plan limits and cost from the harness logs
// Coins: the robots' API-priced spend pays for things in the shop.
const wallet = new Wallet(() => settings.wallet, (s) => { settings.wallet = s; saveSettings(); });
walletReady = wallet;
// boosts and the daily reward
const paintBoost = () => {
  wallet.level = world.level;
  const b = boostNow(world.level), el = $("wl-boost");
  el.hidden = b.mult <= 1;
  el.textContent = `${b.label === "Lucky hour" ? "★" : b.label === "Night shift" ? "☾" : "▲"} x${b.mult}`;
  el.title = `${b.label}: ${b.label === "Lucky hour" ? "double coins for this hour" : b.label === "Night shift" ? "robots working at night earn 1.5x coins" : "your company level adds 3% per level"}. Lucky hour today: ${luckyHour()}:00.`;
  el.classList.toggle("hot", b.label === "Lucky hour");
};
paintBoost();
setInterval(paintBoost, 60000);
wallet.onDaily = (coins, streak) => {
  const el = document.createElement("div");
  el.className = "ms-toast";
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="ms-badge" aria-hidden="true">☀</span><div><b>Daily reward</b><span></span></div><em>${coinIcon(14)} +${coins}</em>`;
  (el.querySelector("div span") as HTMLElement).textContent = streak > 1 ? `Day ${streak} in a row. Come back tomorrow for more.` : "Come back tomorrow to start a streak.";
  document.body.appendChild(el);
  gsap.timeline({ onComplete: () => el.remove() }).fromTo(el, { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }).to(el, { opacity: 0, duration: 0.35, delay: 4 });
};
window.setTimeout(() => { if (lastShipped) checkMilestones(lastShipped); }, 0);
world.owns = (key) => wallet.owns(key);
const paintWallet = (gained = 0) => {
  const b = $("wl-bal");
  b.textContent = wallet.balance.toLocaleString();
  const rb = $("rail-bal"), n = wallet.balance;
  rb.textContent = n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
  $("rail-coins").title = `${n.toLocaleString()} coins. Click to open the shop`;
  if (gained > 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const f = document.createElement("span");
    f.className = "wl-gain";
    f.textContent = `+${gained.toLocaleString()}`;
    $("wallet").appendChild(f);
    gsap.fromTo(f, { y: 0, opacity: 1 }, { y: -22, opacity: 0, duration: 1.4, ease: "power2.out", onComplete: () => f.remove() });
    gsap.fromTo(".wl-coins .coin-ico", { rotateY: 0 }, { rotateY: 360, duration: 0.6, ease: "power2.out" });
  }
};
wallet.onChange = (_bal, gained) => paintWallet(gained);
paintWallet();
const goShopping = () => openShop({ wallet, level: world.level, onBought: () => { void refresh(); shopFront.render(); } });
$("open-shop").addEventListener("click", goShopping);
$("rail-coins").addEventListener("click", goShopping);
// the shop is also a real building next to the office
const shopFront = new ShopFront(document.createElement("div"), wallet, () => world.level);
shopFront.onOpen = goShopping;
world.attachShop(shopFront);
wallet.onChange = (_bal, gained) => { paintWallet(gained); shopFront.render(); };
$("shop-link").addEventListener("click", () => world.showShop());
mountStats(document.getElementById("usage-body")!, async () => {
  const u = await (window as any).lucid.usage();
  if (u?.windows) wallet.observe(u);
  return u;
});

// Real weather where you are: it rains, snows or storms over the office, and the season shows outside.
const WX_NAME: Record<string, string> = { clear: "Clear", clouds: "Cloudy", rain: "Rain", drizzle: "Drizzle", snow: "Snow", storm: "Storm", fog: "Fog" };
// The weather service is sometimes behind the sky. You can tell Lucid what it is really doing;
// the correction holds for two hours, then live weather takes over again.
let liveWeather: any = null;
const WX_FIX_MS = 2 * 60 * 60 * 1000;
function weatherFix(): string | null {
  const f = settings.weatherFix;
  return f && Date.now() - f.at < WX_FIX_MS ? f.kind : null;
}
function showWeather() {
  const fix = weatherFix();
  const w = liveWeather && fix ? { ...liveWeather, kind: fix, rainSoonMin: undefined, manual: true } : liveWeather;
  world.setWeather(w);
  (window as any).__weatherNow = w;   // the robots' Weather app shows the real weather
  const el = $("wx");
  el.hidden = !w;
  if (w) {
    el.textContent = `${WX_NAME[w.kind] ?? w.kind}, ${Math.round(w.tempC)}°C`;
    const soon = w.rainSoonMin != null ? `, rain in about ${w.rainSoonMin} min` : "";
    el.title = `${w.place}: ${WX_NAME[w.kind] ?? w.kind}${soon}, ${w.tempC.toFixed(1)}°C, wind ${Math.round(w.windKmh)} km/h${w.manual ? " (set by you)" : ""}. Click if the sky looks different.`;
    el.classList.toggle("fixed", !!w.manual);
  }
}
function weatherMenu() {
  document.querySelector(".wx-menu")?.remove();
  const btn = $("wx"), r = btn.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "wx-menu";
  menu.setAttribute("role", "menu");
  menu.style.cssText = `left:${r.left}px;top:${r.bottom + 6}px`;
  const fix = weatherFix();
  const opts: [string | null, string][] = [["rain", "It's raining"], ["snow", "It's snowing"], ["clouds", "It's dry"], ["clear", "It's sunny"], [null, "Use live weather"]];
  menu.innerHTML = `<p>What's the sky doing?</p>` + opts.map(([k, label]) => `<button type="button" role="menuitemradio" aria-checked="${k === fix}" data-k="${k ?? ""}">${label}</button>`).join("");
  document.body.appendChild(menu);
  const close = () => { menu.remove(); window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc, true); };
  const away = (e: Event) => { if (!menu.contains(e.target as Node) && e.target !== btn) close(); };
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); btn.focus(); } };
  window.addEventListener("pointerdown", away, true);
  window.addEventListener("keydown", esc, true);
  menu.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    settings.weatherFix = b.dataset.k ? { kind: b.dataset.k, at: Date.now() } : undefined;
    saveSettings();
    close();
    showWeather();
  });
  (menu.querySelector('[aria-checked="true"]') as HTMLElement ?? menu.querySelector("button"))?.focus();
}
$("wx").addEventListener("click", () => document.querySelector(".wx-menu") ? document.querySelector(".wx-menu")!.remove() : weatherMenu());
async function pollWeather() {
  try {
    const r = await (window as any).lucid.weather();
    liveWeather = r?.weather ?? null;
    showWeather();
  } catch (err) { console.error("weather failed", err); }
}
void pollWeather();
setInterval(pollWeather, 10 * 60 * 1000);

// the orchestrator's daily pack: today's event goes on the building sign
watchDaily((p) => { world.eventName = p?.event?.name ?? ""; world.paintEvent(); });

// "Chat" on the follow chip: the robot's desk if it has one, otherwise its conversation on its own
world.onFollowChat = (id) => {
  const d = world.deskFor(id);
  if (d) { world.focusOn(d); return; }
  const t = world.lastData?.threads.find((x) => x.id === id);
  if (!t) return;
  chat.open({ threadId: id, info: { id, title: t.title, provider: t.provider }, profile: world.roster.byThread(id) } as any);
  chat.setStatus("Off work right now", "idle");
};

// A robot waiting for your answer: its chat opens with the answer card focused. At its desk if it
// has one, otherwise beside the questions room where it waits in line.
const needsAnswer = (id: string) => !!world.lastData?.threads.find((t) => t.id === id)?.question;
function openAnswer(id: string) {
  const d = world.deskFor(id);
  if (d && !d.el.classList.contains("arriving")) world.focusOn(d);
  else {
    world.stopFollow();
    const room = world.rooms.find((r) => r.kind === "queue");
    if (room) world.showRoom(room.id);
    // leaving a focused desk starts closing the chat; open it fresh instead
    gsap.killTweensOf(chat.el);
    chat.el.classList.remove("open");
    world.onFollowChat(id);
    chat.setStatus("Waiting for your answer", "waiting");
  }
  answer.focus(id);
}

// --- the thread list, like T3 Code's sidebar --------------------------------------------
const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "now" : m < 60 ? `${Math.floor(m)}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};
let thSig = "";
function renderThreads() {
  const data = world.lastData;
  if (!data || document.body.classList.contains("th-dragging")) return;   // never swap rows out from under a drag
  renderRail();
  const q = (($("th-q") as HTMLInputElement).value || "").trim().toLowerCase();
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const list = [...data.threads]
    .filter((t) => !q || t.title.toLowerCase().includes(q) || (projects.get(t.projectId)?.title ?? "").toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 60);
  const rows = list.map((t) => {
    const p = projects.get(t.projectId);
    const proj = !p || p.scratch ? "No project" : p.title;
    const icon = p && !p.scratch ? (p.icon ? `<img src="${esc(p.icon)}" alt="">` : `<span class="th-mono">${esc(proj.slice(0, 2).toUpperCase())}</span>`) : `<span class="th-none"></span>`;
    const state = t.question ? `<span class="th-st ask">${delegate.phaseOf(t.id) === "reading" ? "With the Orchestrator" : "Needs input"}</span>`
      : t.runStatus === "running" ? `<span class="th-st work"><i></i>Working ${ago(t.runStartedAt || t.updatedAt)}</span>`
      : t.lastStatus === "failed" ? `<span class="th-st fail">Failed</span>`
      : t.unseen && t.lastStatus === "completed" ? `<span class="th-st done">Done</span>`
      : `<span class="th-ago">${ago(t.updatedAt)}</span>`;
    const robot = world.roster.byThread(t.id);
    const logo = logoFor(t.provider);
    const sub = t.branch || (p?.scratch ? "" : "");
    const host = !p || p.scratch ? world.building : "";
    return `<li><button type="button" class="th-row ${t.runStatus === "running" ? "on" : ""}" data-id="${esc(t.id)}" title="${esc(`${proj}: ${t.title || "Untitled"}`)}">
      <span class="th-top">${icon}<span class="th-proj">${esc(proj)}</span>${state}</span>
      <span class="th-title">${t.pinned ? '<span class="th-pin" aria-label="Pinned">●</span>' : ""}${esc(t.title)}</span>
      <span class="th-bot"><span class="th-sub">${esc(sub || host)}</span>${robot ? `<span class="th-bot-name">${esc(robot.name)}</span>` : ""}${logo ? `<img class="th-logo" src="${logo}" alt="">` : ""}</span>
    </button></li>`;
  }).join("");
  const sig = rows + q;
  if (sig === thSig) return;
  thSig = sig;
  $("th-list").innerHTML = rows || `<li class="th-empty">No threads match.</li>`;
}
$("th-q").addEventListener("input", renderThreads);
$("th-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest(".th-row") as HTMLElement | null;
  if (b) openThread(b.dataset.id!);
});
function openThread(id: string) {
  if (needsAnswer(id)) { openAnswer(id); return; }
  const d = world.deskFor(id);
  if (d && !d.el.classList.contains("arriving")) { world.focusOn(d); return; }
  // not at a desk: follow it wherever it is (break room, questions, park, walking)
  const el = document.querySelector(`.world-walker[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
  if (el) world.follow(el);
}
setInterval(renderThreads, 3000);
window.setTimeout(renderThreads, 1500);

// The folded sidebar: one button per thread with its harness logo and a dot for its state.
let railSig = "";
function renderRail() {
  const data = world.lastData;
  if (!data || !ui.rail || document.body.classList.contains("th-dragging")) return;
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const list = [...data.threads]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 40);
  const html = list.map((t) => {
    const p = projects.get(t.projectId);
    const proj = !p || p.scratch ? "No project" : p.title;
    const [st, said] = t.question ? ["ask", "needs input"] : t.runStatus === "running" ? ["work", "working"]
      : t.lastStatus === "failed" ? ["fail", "failed"] : t.unseen && t.lastStatus === "completed" ? ["done", "done"] : ["", ""];
    const logo = logoFor(t.provider);
    const name = `${t.title}, ${proj}${said ? `, ${said}` : ""}`;
    return `<li><button type="button" class="rail-th${t.id === chat.threadId ? " cur" : ""}" data-id="${esc(t.id)}" aria-label="${esc(name)}" title="${esc(`${t.title}
${proj}${said ? ` · ${said[0].toUpperCase()}${said.slice(1)}` : ""}`)}">`
      + (logo ? `<img src="${logo}" alt="">` : `<span class="rail-mono">${esc(proj.slice(0, 2).toUpperCase())}</span>`)
      + (st ? `<i class="rail-st ${st}" aria-hidden="true"></i>` : "") + `</button></li>`;
  }).join("");
  if (html === railSig) return;
  railSig = html;
  $("rail-list").innerHTML = html;
}
$("rail-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest(".rail-th") as HTMLElement | null;
  if (b) openThread(b.dataset.id!);
});

// --- referencing a thread in the chat: drag it in, press R on it, or use its menu ----------
function threadRef(id: string): ThreadRef | null {
  const data = world.lastData;
  const t = data?.threads.find((x) => x.id === id);
  if (!t) return null;
  const p = data!.projects.find((x) => x.id === t.projectId);
  return { id, title: t.title || "Untitled thread", project: !p || p.scratch ? "No project" : p.title, provider: t.provider };
}
wireThreadDrag([$("th-list"), $("rail-list")], chat, threadRef, {
  zone: (x, y) => {
    const button = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-room]");
    const room = button?.dataset.room;
    return room && world.rooms.some((r) => r.id === room && ["main", "project", "freelance"].includes(r.kind)) ? room : world.threadDropZone(x, y);
  },
  preview: (room) => world.previewThreadDrop(room),
  place: (id, room) => world.placeThread(id, room),
});
function referenceInChat(id: string, x: number, y: number) {
  const ref = threadRef(id);
  if (!ref) return;
  if (chat.isOpen && chat.threadId) { chat.addReference(ref); return; }
  showMenu(x, y, "Open a robot's chat to reference this thread", [{ label: "Chat with this thread's robot", run: () => openThread(id) }]);
}
function threadMenu(row: HTMLElement, x: number, y: number) {
  const id = row.dataset.id!, ref = threadRef(id);
  if (!ref) return;
  const items = [{ label: "Open", run: () => openThread(id) }];
  if (chat.isOpen && chat.threadId && chat.threadId !== id) items.unshift({ label: "Reference in chat (R)", run: () => { chat.addReference(ref); } });
  showMenu(x, y, ref.title, items);
}
for (const box of [$("th-list"), $("rail-list")]) {
  box.addEventListener("contextmenu", (e) => {
    const row = (e.target as HTMLElement).closest("[data-id]") as HTMLElement | null;
    if (!row) return;
    e.preventDefault();
    // from the keyboard (menu key) the menu opens beside the row instead of at 0, 0
    const r = row.getBoundingClientRect();
    threadMenu(row, e.clientX || r.right - 20, e.clientY || r.top + 8);
  });
  box.addEventListener("keydown", (e) => {
    const row = (e.target as HTMLElement).closest("[data-id]") as HTMLElement | null;
    if (!row || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
    e.preventDefault();
    const r = row.getBoundingClientRect();
    referenceInChat(row.dataset.id!, r.right - 20, r.top + 8);
  });
}

// you typing in the side chat: the robot sees it in its Messages app and waits for you
chat.onTyping = (on) => { const id = chat.threadId; if (id) world.deskFor(id)?.director.userTyping(on); };

// --- milestones: rewards for real work, paid in coins ----------------------------------------
function milestoneStats(shipped: { total: number; today: number }): MsStats {
  const wallet = walletReady!;
  const data = world.lastData;
  const week = Date.now() - 7 * 864e5;
  const projects = new Set((data?.threads ?? []).filter((t) => Date.parse(t.updatedAt) > week && data?.projects.find((p) => p.id === t.projectId && !p.scratch)).map((t) => t.projectId));
  const h = new Date().getHours();
  const night = (h < 6 || h >= 22) && (data?.threads ?? []).some((t) => t.runStatus === "running");
  if (night) settings.nightRuns = true;
  return {
    shipped: shipped.total, today: shipped.today, level: world.level, robots: world.roster.robots.length, projects: projects.size,
    spentUsd: wallet.spentUsd, coinsEarned: wallet.earned, itemsOwned: CATALOG.filter((c) => c.price > 0 && wallet.owns(c.key)).length,
    hats: world.roster.robots.filter((r) => (r.look as any).hat && (r.look as any).hat !== "none").length, nightRuns: !!settings.nightRuns,
  };
}
function checkMilestones(shipped: { total: number; today: number }) {
  if (!walletReady) return;
  const wallet = walletReady;
  const seen = new Set(settings.milestones ?? []);
  const fresh = checkMs(milestoneStats(shipped), seen);
  // the first time this runs, past achievements are counted quietly (no flood of toasts)
  const quiet = settings.milestones === undefined;
  fresh.forEach((m, i) => {
    seen.add(m.id);
    wallet.grant(m.id, m.coins);
    if (!quiet) window.setTimeout(() => celebrateMilestone(m), i * 1800);
  });
  if (fresh.length || quiet) { settings.milestones = [...seen]; saveSettings(); }
  const el = document.getElementById("ms-count");
  if (el) el.textContent = `${seen.size}/${MILESTONES.length}`;
}
