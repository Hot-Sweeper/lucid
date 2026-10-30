import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import gsap from "gsap";
import { Stage } from "./stage";
import { Robot, brandFor } from "./robot";
import { WM } from "./os/wm";
import { Director, type ThreadInfo } from "./director";
import openaiLogo from "./assets/openai.svg";
import claudeLogo from "./assets/claude.svg";

declare global {
  interface Window {
    lucid: {
      projects(): Promise<{ id: string; title: string; root: string }[]>;
      threads(): Promise<{ id: string; title: string; provider: string; projectTitle: string; updatedAt: string; runStatus: string | null }[]>;
      watch(id: string): Promise<boolean>;
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
const app = document.getElementById("app")!;
app.innerHTML = `
  <aside class="panel" id="panel">
    <header class="brand"><span class="mark" aria-hidden="true"></span><h1>Lucid</h1>
      <button class="update" id="update" type="button" hidden>Update</button>
    </header>
    <section class="now">
      <h2 id="now-title">No thread yet</h2>
      <p id="now-sub" class="sub">Pick a thread or give the robot a task.</p>
      <p id="now-activity" class="activity" aria-live="polite"></p>
    </section>
    <form class="reply" id="reply" hidden>
      <textarea id="reply-text" rows="2" placeholder="Message this robot"></textarea>
      <button type="submit">Send</button>
    </form>
    <section class="new">
      <h3>New task</h3>
      <form id="new-form">
        <textarea id="new-text" rows="3" placeholder="What should the robot build?"></textarea>
        <div class="row">
          <div class="select" id="project-select">
            <button type="button" class="select-btn" aria-haspopup="listbox" aria-expanded="false"><span>Choose a project</span></button>
            <ul class="select-list" role="listbox" hidden></ul>
          </div>
          <button type="submit" class="primary" id="new-go">Start with Codex</button>
        </div>
        <p class="form-msg" id="new-msg" role="status"></p>
      </form>
    </section>
    <section class="threads">
      <h3>Threads</h3>
      <ul id="thread-list" class="thread-list"></ul>
    </section>
  </aside>
  <main class="scene" id="scene"></main>`;

const stage = new Stage(document.getElementById("scene")!);
const robot = new Robot(stage.stage);
const wm = new WM(stage.screen, robot);
const director = new Director(wm, robot, stage, (url) => api.peek(url), (p) => api.image(p), (p) => api.readText(p));
// Keep the robot layer above the screen but below bubbles and notes.
stage.stage.insertBefore(robot.el, stage.notes);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let currentThread: string | null = null;
let selectedProject: { id: string; title: string; root: string } | null = null;

director.onActivity = (t) => {
  const a = $("now-activity");
  if (a.textContent === t) return;
  gsap.fromTo(a, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.3 });
  a.textContent = t;
};

function providerIcon(provider: string) {
  const src = brandFor(provider) === "claude" ? claudeLogo : openaiLogo;
  return `<img class="pv ${brandFor(provider)}" src="${src}" alt="${brandFor(provider) === "claude" ? "Claude" : "Codex"}">`;
}

const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

let lastThreadsHtml = "";
async function loadThreads() {
  const list = $("thread-list");
  try {
    const threads = await api.threads();
    const keep = list.scrollTop;
    const html = threads.map((t) => `
      <li><button type="button" class="thread ${t.id === currentThread ? "on" : ""}" data-id="${t.id}" title="${t.title.replace(/"/g, "&quot;")}">
        ${providerIcon(t.provider)}
        <span class="tt">${escapeHtml(t.title)}</span>
        <span class="meta">${escapeHtml(t.projectTitle || "")}${t.runStatus === "running" ? " · working" : ""} · ${ago(t.updatedAt)}</span>
      </button></li>`).join("");
    if (html === lastThreadsHtml) return;
    lastThreadsHtml = html;
    list.innerHTML = html;
    list.scrollTop = keep;
  } catch (err: any) {
    list.innerHTML = `<li class="err">${escapeHtml(err.message || String(err))}</li>`;
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function openThread(id: string) {
  if (id === currentThread) return;
  currentThread = id;
  localStorage.setItem("lucid:thread", id);
  director.reset();
  for (const b of document.querySelectorAll(".thread")) b.classList.toggle("on", (b as HTMLElement).dataset.id === id);
  lastThreadsHtml = "";
  $("reply").hidden = false;
  await api.watch(id);
}

$("thread-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest(".thread") as HTMLElement | null;
  if (b) openThread(b.dataset.id!);
});

api.onInfo(({ threadId, info }) => {
  if (threadId !== currentThread) return;
  if (info.error) { $("now-sub").textContent = info.error; return; }
  $("now-title").textContent = info.title;
  $("now-sub").textContent = [info.projectTitle, brandFor(info.provider) === "claude" ? "Claude" : "Codex"].filter(Boolean).join(" · ");
  if (robot.brandName !== brandFor(info.provider)) robot.setBrand(info.provider);
  wm.setWallpaperLogo(brandFor(info.provider) === "claude" ? claudeLogo : openaiLogo);
  director.setInfo(info);
});

api.onItems(({ threadId, items, initial }) => {
  if (threadId !== currentThread) return;
  director.push(items, initial);
});

// --- reply -------------------------------------------------------------------
$("reply").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ta = $<HTMLTextAreaElement>("reply-text");
  const text = ta.value.trim();
  if (!text || !currentThread) return;
  ta.disabled = true;
  try {
    await api.sendMessage({ threadId: currentThread, message: text });
    ta.value = "";
  } catch (err: any) {
    director.onActivity(`Could not send: ${err.message || err}`);
  } finally {
    ta.disabled = false;
  }
});
$("reply-text").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $<HTMLFormElement>("reply").requestSubmit(); }
});

// --- project picker (themed listbox) -------------------------------------------
const sel = $("project-select");
const selBtn = sel.querySelector(".select-btn") as HTMLButtonElement;
const selList = sel.querySelector(".select-list") as HTMLUListElement;
function closeSelect() { selList.hidden = true; selBtn.setAttribute("aria-expanded", "false"); }
selBtn.addEventListener("click", () => {
  const open = selList.hidden;
  selList.hidden = !open;
  selBtn.setAttribute("aria-expanded", String(open));
  if (open) gsap.fromTo(selList, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.18 });
});
selList.addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest("li") as HTMLElement | null;
  if (!li) return;
  selectedProject = JSON.parse(li.dataset.p!);
  selBtn.querySelector("span")!.textContent = selectedProject!.title;
  localStorage.setItem("lucid:project", selectedProject!.id);
  closeSelect();
  selBtn.focus();
});
document.addEventListener("click", (e) => { if (!sel.contains(e.target as Node)) closeSelect(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !selList.hidden) { closeSelect(); selBtn.focus(); e.stopPropagation(); } }, true);

async function loadProjects() {
  const projects = await api.projects().catch(() => []);
  selList.innerHTML = projects.map((p) => `<li role="option" data-p='${JSON.stringify(p).replace(/'/g, "&#39;")}' title="${escapeHtml(p.root)}">${escapeHtml(p.title)}</li>`).join("");
  const saved = localStorage.getItem("lucid:project");
  const p = projects.find((x) => x.id === saved) || null;
  if (p) { selectedProject = p; selBtn.querySelector("span")!.textContent = p.title; }
}

$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ta = $<HTMLTextAreaElement>("new-text");
  const msg = $("new-msg");
  const text = ta.value.trim();
  if (!text) { msg.textContent = "Describe the task first."; return; }
  if (!selectedProject) { msg.textContent = "Choose which project the robot works in."; return; }
  const go = $<HTMLButtonElement>("new-go");
  go.disabled = true;
  msg.textContent = "Starting a Codex thread…";
  try {
    const { threadId } = await api.startThread({ project: selectedProject.id, message: text, provider: "codex" });
    msg.textContent = "";
    ta.value = "";
    await loadThreads();
    if (threadId) await openThread(threadId);
  } catch (err: any) {
    msg.textContent = `Could not start: ${err.message || err}. The text is still here.`;
  } finally {
    go.disabled = false;
  }
});

// --- one-click update ---------------------------------------------------------------
async function checkUpdate() {
  const u = await api.checkUpdate().catch(() => null);
  const btn = $<HTMLButtonElement>("update");
  if (u?.available) {
    btn.hidden = false;
    btn.title = (u.changes || []).join("\n");
    btn.textContent = `Update (${u.behind})`;
  } else btn.hidden = true;
}
$("update").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("update");
  btn.disabled = true;
  const off = api.onUpdateStep((s) => (btn.textContent = s));
  const res = await api.applyUpdate();
  off();
  if (!res.ok) { btn.disabled = false; btn.textContent = "Retry update"; btn.title = res.error || ""; }
});

// --- boot ----------------------------------------------------------------------------
await loadThreads();
await loadProjects();
const saved = new URLSearchParams(location.search).get("thread") || localStorage.getItem("lucid:thread");
if (saved && document.querySelector(`.thread[data-id="${saved}"]`)) openThread(saved);
setInterval(loadThreads, 5000);
checkUpdate();
setInterval(checkUpdate, 10 * 60 * 1000);
