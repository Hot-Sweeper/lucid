import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import "./office/office.css";
import gsap from "gsap";
import { World, type Room, type WorldData } from "./office/world";
import { ChatPanel } from "./office/chat-panel";
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

    <section class="rooms">
      <h3>Rooms</h3>
      <ul id="room-list" class="room-list"></ul>
      <button type="button" class="link-btn" id="overview">Whole building</button>
    </section>

    <section class="focus" id="focus">
      <p class="hint" id="focus-hint">Click a robot to follow it.</p>
      <div id="focus-body" hidden>
        <div class="focus-head"><img id="focus-logo" alt=""><h2 id="focus-title"></h2></div>
        <p class="sub" id="focus-sub"></p>
        <p class="activity" id="focus-activity" aria-live="polite"></p>
        <div class="focus-actions">
          <button type="button" class="ghost" id="focus-screen">Look at its screen</button>
          <button type="button" class="ghost" id="focus-desk">Go to its desk</button>
        </div>
        <form class="reply" id="reply">
          <textarea id="reply-text" rows="2" placeholder="Message this robot"></textarea>
          <button type="submit">Send</button>
        </form>
      </div>
    </section>

    <section class="new">
      <h3>New task</h3>
      <form id="new-form">
        <textarea id="new-text" rows="3" placeholder="What should a robot build?"></textarea>
        <div class="select" id="project-select">
          <button type="button" class="select-btn" aria-haspopup="listbox" aria-expanded="false"><span>Choose a project</span></button>
          <ul class="select-list" role="listbox" hidden></ul>
        </div>
        <div class="row">
          <div class="seg" role="radiogroup" aria-label="Harness">
            <button type="button" role="radio" aria-checked="true" data-h="codex"><img src="${openaiLogo}" alt="">Codex</button>
            <button type="button" role="radio" aria-checked="false" data-h="claudeAgent"><img src="${claudeLogo}" alt="">Claude</button>
          </div>
          <button type="submit" class="primary" id="new-go">Start</button>
        </div>
        <p class="form-msg" id="new-msg" role="status"></p>
      </form>
    </section>
  </aside>
  <main class="scene" id="scene"></main>
  <div class="zoom-ui"><button type="button" id="back-btn" hidden>Back to the office</button></div>`;

const world = new World($("scene"), { peek: (u) => api.peek(u), image: (p) => api.image(p), readText: (p) => api.readText(p) });
let selectedDesk: Desk | null = null;
const chat = new ChatPanel($("scene").parentElement!, { conversation: (id) => api.conversation(id), sendMessage: (o) => api.sendMessage(o) });
world.panelWidth = 400;
world.onFocus = (d) => { if (d) chat.open(d); else chat.close(); };
chat.onClose = () => world.unfocus();
// Dev aid: keep the last errors where a debug run can read them.
(window as any).__errs = [];
window.addEventListener("error", (e) => (window as any).__errs.push(String(e.message)));
const origError = console.error.bind(console);
console.error = (...a: any[]) => { (window as any).__errs.push(a.map(String).join(" ").slice(0, 300)); origError(...a); };
let harness = "codex";

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
$("focus-screen").addEventListener("click", () => selectedDesk && world.focusScreen(selectedDesk));
$("focus-desk").addEventListener("click", () => selectedDesk && world.showDesk(selectedDesk));
const sceneObserver = new MutationObserver(() => ($("back-btn").hidden = !$("scene").classList.contains("screen-mode")));
sceneObserver.observe($("scene"), { attributes: true, attributeFilter: ["class"] });
$("back-btn").addEventListener("click", () => world.unfocus());

$("reply").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ta = $<HTMLTextAreaElement>("reply-text");
  const text = ta.value.trim();
  if (!text || !selectedDesk?.threadId) return;
  ta.disabled = true;
  try {
    await api.sendMessage({ threadId: selectedDesk.threadId, message: text });
    ta.value = "";
  } catch (err: any) {
    $("focus-activity").textContent = `Could not send: ${err.message || err}`;
  } finally { ta.disabled = false; }
});
$("reply-text").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $<HTMLFormElement>("reply").requestSubmit(); }
});

// --- live data -------------------------------------------------------------------------
api.onItems(({ threadId, items, initial }) => { world.deskFor(threadId)?.director.push(items, initial); chat.ping(threadId); });
api.onInfo(({ threadId, info }) => {
  const d = world.deskFor(threadId);
  if (!d || info.error) return;
  d.setInfo(info);
  if (d === selectedDesk) renderFocus();
});

let watched = "";
let firstLoad = true;
async function refresh() {
  try {
    const data = await api.world();
    world.update(data);
    for (const d of world.desks.values()) {
      d.onActivity = (t) => { if (d === selectedDesk) { const a = $("focus-activity"); if (a.textContent !== t) { a.textContent = t; gsap.fromTo(a, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.3 }); } } };
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

// --- project picker and harness ------------------------------------------------------------
let selectedProject: { id: string; title: string } | null = null;
const sel = $("project-select");
const selBtn = sel.querySelector(".select-btn") as HTMLButtonElement;
const selList = sel.querySelector(".select-list") as HTMLUListElement;
const closeSelect = () => { selList.hidden = true; selBtn.setAttribute("aria-expanded", "false"); };
selBtn.addEventListener("click", () => {
  const open = selList.hidden;
  selList.hidden = !open;
  selBtn.setAttribute("aria-expanded", String(open));
  if (open) gsap.fromTo(selList, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.18 });
});
selList.addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest("li") as HTMLElement | null;
  if (!li) return;
  selectedProject = { id: li.dataset.id!, title: li.textContent || "" };
  selBtn.querySelector("span")!.textContent = selectedProject.title;
  localStorage.setItem("lucid:project", selectedProject.id);
  closeSelect();
  selBtn.focus();
});
document.addEventListener("click", (e) => { if (!sel.contains(e.target as Node)) closeSelect(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !selList.hidden) { closeSelect(); selBtn.focus(); e.stopPropagation(); } }, true);
async function loadProjects() {
  const projects = await api.projects().catch(() => []);
  selList.innerHTML = projects.map((p) => `<li role="option" data-id="${p.id}" title="${esc(p.root)}">${esc(p.title)}</li>`).join("");
  const p = projects.find((x) => x.id === localStorage.getItem("lucid:project"));
  if (p) { selectedProject = { id: p.id, title: p.title }; selBtn.querySelector("span")!.textContent = p.title; }
}
for (const b of document.querySelectorAll<HTMLButtonElement>(".seg [data-h]")) {
  b.addEventListener("click", () => {
    harness = b.dataset.h!;
    for (const o of document.querySelectorAll(".seg [data-h]")) o.setAttribute("aria-checked", String(o === b));
  });
}
$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ta = $<HTMLTextAreaElement>("new-text"), msg = $("new-msg");
  const text = ta.value.trim();
  if (!text) { msg.textContent = "Describe the task first."; return; }
  if (!selectedProject) { msg.textContent = "Choose which project the robot works in."; return; }
  const go = $<HTMLButtonElement>("new-go");
  go.disabled = true;
  msg.textContent = "Hiring a robot…";
  try {
    const { threadId } = await api.startThread({ project: selectedProject.id, message: text, provider: harness });
    ta.value = "";
    msg.textContent = "";
    await refresh();
    const d = world.deskFor(threadId);
    if (d) { world.select(d); world.showDesk(d); }
  } catch (err: any) {
    msg.textContent = `Could not start: ${err.message || err}. Your text is still here.`;
  } finally { go.disabled = false; }
});

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
world.attachDir = attachDir;
await loadProjects();
await refresh();
setInterval(refresh, 3000);
checkUpdate();
setInterval(checkUpdate, 60 * 1000);
