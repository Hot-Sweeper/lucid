import { mountLimitsSection } from "./office/limits-section";
import { completionFirst, reconcileThreadList } from "./office/thread-list";
import { threadState } from "./office/thread-state";
import { statusBadge } from "./ui/status";
import { icon as uiIcon } from "./ui/icons";
import { mountInterfaceThemeSetting } from "./interface-theme";
import { buildWorkDetails } from "./office/work-details";
import { mountWebsiteStudio } from "./office/website-studio";
import { ProjectLife } from "./office/project-life";
import { chatFileUrl } from "./office/chat-media";
import { mountPerformancePanel } from "./office/performance";
import { showReport, showReportArchive } from "./office/report";
import { companionClient, readCompanionState, installCompanionOwner } from "./remote-client";
import { CoinRewards } from "./office/coin-rewards";
import { formatCoins } from "./office/coin-ledger";
import { gameSound } from "./office/sound";
import { mountMusicControls } from "./office/music-controls";
import { OfficeSoundscape } from "./office/soundscape";
import { mountLanguageSetting } from "./office/language";
import { DailyWriter, type DailyLinesState } from "./office/daily-writer";
let dailyWriter: DailyWriter | null = null;
import { openManagers } from "./office/managers";
import { managerFace, wireFaceFallback } from "./office/manager-face";
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { beginSystem, endSystem } from "./perf/metrics";
import { renderFps, onRenderWake } from "./perf/render";
import { mobileStartRoom } from "./office/mobile-start";
import "./office/office.css";
import "./office/panels.css";
import "./office/thread-state.css";
import "./office/thread-selection.css";
import "./office/thread-list.css";
import "./office/limits-section.css";
import "./office/sidebar-header.css";
import "./world/world.css";
import "./decor/decor.css";
import { openDecorate, type RoomTheme } from "./office/decorate";
import { TopDownRobot } from "./world/seated";
import { BreakRoom } from "./world/breakroom";
import { ChargingRoom } from "./world/charging";
import { QuestionLine } from "./world/queue";
import { useRobot } from "./office/desk";
import gsap from "gsap";
import { mountAppLibraryButton } from "./office/app-library-button";
import { World, type Room, type WorldData } from "./office/world";
import { ChatPanel, renderChatMarkdown } from "./office/chat-panel";
import { latestSourceReport } from "./office/chat-review";
import { latestThreadReviews, threadReviewLabel } from "./office/thread-review";
import { AnswerCard } from "./office/answer";
import { MonitorTasks, sharedPendingRequests, type Collectible, type WorkDetails } from "./office/monitor-tasks";
import { Delegate, showDecisions } from "./office/delegate";
import { showMenu, confirmDialog } from "./office/menus";
import { openHire, avatar, BUILTIN_ROLES, type Role } from "./office/hire";
import { openCustomizeFor, openCustomize } from "./office/customize";
import { openWorkerFocus, openStaffWall } from "./office/worker-focus";
import { openChair } from "./office/chair";
import { openNewProject } from "./office/new-project";
import { whenProjectColors } from "./office/project-brand";
import { robotFocus } from "./office/interact";
import { hasOfficeWork, remainingDeskExtras } from "./office/room-policy";
import type { RobotProfile } from "./office/roster";
import { Orchestrator, type OrchState } from "./office/orchestrator";
import { openOrchestratorControls } from "./office/orchestrator-controls";
import { progress } from "./office/progress";
import { mountStats } from "./stats/stats";
import { mountEnvironments } from "./office/environments";
import { Wallet, openShop, coinIcon, boostNow, luckyHour, type WalletState } from "./office/shop";
import { ShopFront } from "./office/shopfront";
import { watchDaily } from "./office/daily";
import { MILESTONES, check as checkMs, celebrateMilestone, celebrateDailyReward, openMilestones, type Stats as MsStats } from "./office/milestones";
import { CATALOG } from "./office/shop";
import type { Desk } from "./office/desk";
import type { ThreadInfo } from "./director";
import { logoFor, harnessName } from "./office/brand";
import { wireThreadDrag } from "./office/thread-drag";
import { wireRoomDrag } from "./office/room-drag";
import { movableRoom } from "./office/room-order";
import type { ThreadRef } from "./office/thread-ref";
import { foldButton, foldSection, setRail } from "./office/sidebar";
import { EdgePeek, PIN_ICON, paintPin } from "./office/edge-peek";
import openaiLogo from "./assets/openai.svg";
import claudeLogo from "./assets/claude.svg";
import { mountMobileShell } from "./mobile";
import { mountMobileAccess } from "./office/mobile-access";
import { openShortcutHelp, isShortcutHelpOpen, typing } from "./office/shortcuts";
import { mountTitlebar } from "./titlebar";
import { BRAND } from "./brand";
import { brandMark } from "./ui/brand-mark";
// Shared control styles load after every feature stylesheet imported above.
import "./ui/controls.css";

declare global {
  interface Window {
    lucid: {
      projects(): Promise<{ id: string; title: string; root: string }[]>;
      world(): Promise<WorldData>;
      tasks(): Promise<unknown[]>;
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
      startThread(o: { project: string; message: string; provider?: string; model?: string; options?: Record<string, string | boolean>; requestId?: string; contextThreadId?: string }): Promise<{ threadId: string }>;
      sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
      peek(url: string): Promise<any>;
      image(path: string): Promise<string | null>;
      readText(path: string): Promise<string | null>;
      onItems(fn: (p: { threadId: string; items: any[]; initial: boolean }) => void): () => void;
      onInfo(fn: (p: { threadId: string; info: ThreadInfo }) => void): () => void;
      checkUpdate(): Promise<{ available: boolean; behind?: number; local?: number; legacy?: boolean; changes?: string[]; files?: string[]; reason?: string }>;
      applyUpdate(): Promise<{ ok: boolean; error?: string; kind?: string; details?: string }>;
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
    <header class="brand"><span class="mark" aria-hidden="true">${brandMark()}</span><h1>${esc(BRAND.name)}</h1><button type="button" class="wx" id="wx" hidden aria-haspopup="menu"></button>
      <button class="update" id="update" type="button" title="Check for game updates">Check updates</button>
      <div class="brand-actions">
      <button type="button" class="ghost side-help side-settings" id="side-settings" aria-label="Office and settings" aria-expanded="false" title="Office and settings: rooms, language, staff wall, phone access, linked computers">${uiIcon("settings")}</button><button type="button" class="ghost side-help" id="side-help" aria-label="How ${esc(BRAND.name)} works" title="How ${esc(BRAND.name)} works and keyboard shortcuts (?)">${uiIcon("help")}</button><button type="button" class="side-pin pin-btn" id="side-pin" aria-pressed="true">${PIN_ICON}</button><button type="button" class="side-hide" id="side-hide" aria-expanded="true" aria-controls="side-panel" aria-label="Hide sidebar" title="Hide sidebar: it folds into a rail on the left (Ctrl+B)">${uiIcon("sidebarHide")}<span>Hide<span class="sh-more"> sidebar</span></span></button>
      </div>
    </header>

    <section class="company" id="company" aria-live="polite"></section>
    <section class="wallet" id="wallet"><span class="wl-coins" title="1 coin for every dollar of AI work at API prices">${coinIcon(18)}<b id="wl-bal">0</b><span>coins</span></span><span class="wl-boost" id="wl-boost" hidden></span><button type="button" class="wl-shop" id="open-shop">Shop</button></section>

    <section class="threads">
      <div class="th-head"><h3>Threads</h3><label class="th-search">${uiIcon("search", 14)}<input id="th-q" type="search" placeholder="Search" aria-label="Search threads"></label><button type="button" class="primary th-new-task" id="th-new-task" title="Start a new task (Ctrl+N)">${uiIcon("plus", 14)}Task</button><button type="button" class="ghost th-new-project" id="th-new-project" aria-label="New project" title="New project: create a folder or add one you have">${uiIcon("plus", 14)}Project</button>${foldButton("threads", "threads")}</div>
      <div class="fold-body" id="fold-threads"><ol class="th-list" id="th-list" aria-label="Threads. Drag one into the chat, or press R, to reference it"></ol></div>
    </section>


    <div id="environment-body"></div>
    <section class="rooms">
      <div class="sec-head"><h3>Rooms</h3>${foldButton("rooms", "rooms")}</div>
      <div class="fold-body" id="fold-rooms">
      <ul id="room-list" class="room-list"></ul>
      <div class="room-links"><button type="button" class="link-btn" id="overview">Whole building</button><button type="button" class="link-btn" id="park">The park</button><button type="button" class="link-btn" id="shop-link">The shop</button></div>
      <div class="hidden-offices" id="hidden-offices" hidden></div>
      </div>
    </section>

    <section class="usage" id="usage">
      <div class="sec-head"><h3>Subscriptions</h3>${foldButton("subscriptions", "subscription usage")}</div>
      <div class="fold-body" id="fold-subscriptions"><div id="usage-body"></div></div>
    </section>

    <section class="orch" id="orch">
      <div class="sec-head"><h3>Orchestrator</h3>${foldButton("orch", "orchestrator")}</div>
      <div class="fold-body" id="fold-orch"><div id="orch-body"></div></div>
    </section>

  </aside>
  <nav class="side-rail" id="side-rail" aria-label="Folded sidebar" hidden>
    <button type="button" class="rail-show" id="rail-show" aria-expanded="false" aria-controls="side-panel" title="Show sidebar (Ctrl+B)">${uiIcon("sidebarShow")}<span>Show<br>sidebar</span></button>
    <button type="button" class="rail-coins" id="rail-coins" title="Coins. Click to open the shop">${coinIcon(16)}<b id="rail-bal">0</b></button>
    <ol class="rail-list" id="rail-list" aria-label="Threads"></ol>
  </nav>
  <main class="scene" id="scene"></main>
  <section class="orch-power" aria-label="Global orchestrator controls">
    <label class="switch orch-power-switch"><span>Orchestrator</span><input type="checkbox" id="orch-power-toggle" role="switch" aria-label="Orchestrator enabled" disabled><span class="track" aria-hidden="true"><i></i></span><b id="orch-power-status">Off</b></label>
    <button type="button" class="link-btn" id="orch-controls-open" aria-label="Orchestrator settings">Settings</button>
  </section>
  <div class="zoom-ui"><button type="button" id="back-btn" hidden>Back to the office</button><button type="button" id="coin-bank" aria-label="Coin balance. Open shop">${coinIcon(18)}<b id="coin-bank-bal">0</b></button><button type="button" id="terrible-song" disabled>Mark song terrible</button><button type="button" id="game-sound" aria-pressed="true">Sound on</button></div>`;

void mountTitlebar();
// Keep threads in front and put occasional office controls behind one disclosure.
// Occasional office controls live in a settings panel behind the gear in the sidebar header.
const extras = document.createElement("div");
extras.className = "office-settings";
extras.hidden = true;
extras.setAttribute("role", "dialog");
extras.setAttribute("aria-label", "Office and settings");
extras.innerHTML = '<header class="os-head"><h2>Office &amp; settings</h2><button type="button" class="ghost os-close" aria-label="Close">Close</button></header><div class="sidebar-extras-body"></div>';
const extrasBody = extras.querySelector<HTMLElement>(".sidebar-extras-body")!;
mountLanguageSetting(extrasBody, () => dailyWriter);
mountInterfaceThemeSetting(extrasBody);
{
  const wall = document.createElement("button"); wall.type = "button"; wall.className = "link-btn extras-staff-wall"; wall.textContent = "Staff wall";
  wall.addEventListener("click", () => openWall()); extrasBody.appendChild(wall);
}
mountPerformancePanel(extrasBody);
mountMobileAccess(extrasBody, api as any);
for (const selector of ["#environment-body", ".rooms", "#orch", "#company", "#wallet"]) {
  const section = document.querySelector(selector);
  if (section) extrasBody.appendChild(section);
}
document.body.appendChild(extras);
$("side-panel").appendChild($("usage"));
{
  const gear = $("side-settings");
  let previous: HTMLElement | null = null;
  const close = () => {
    if (extras.hidden) return;
    extras.hidden = true; gear.setAttribute("aria-expanded", "false");
    window.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true);
    previous?.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!extras.contains(t) && !gear.contains(t) && !(t as Element).closest?.(".pop-menu, .dialog-wrap")) close(); };
  gear.addEventListener("click", () => {
    if (!extras.hidden) { close(); return; }
    previous = document.activeElement as HTMLElement | null;
    const r = gear.getBoundingClientRect();
    extras.style.left = `${Math.round(r.left)}px`; extras.style.top = `${Math.round(r.bottom + 8)}px`;
    extras.hidden = false; gear.setAttribute("aria-expanded", "true");
    window.addEventListener("keydown", onKey, true); document.addEventListener("pointerdown", onDown, true);
    extras.querySelector<HTMLElement>(".os-close")!.focus();
  });
  extras.querySelector(".os-close")!.addEventListener("click", close);
}

mountAppLibraryButton(document.getElementById("side-settings") ?? $("side-help"));
mountWebsiteStudio(document.getElementById("side-settings") ?? $("side-help"));

// robots in the original design, plus the break room and the question line
useRobot((host, rig) => new TopDownRobot(host, rig));
const world = new World($("scene"), { peek: (u) => api.peek(u), image: (p) => api.image(p), readText: (p) => api.readText(p) });
const projectLife = new ProjectLife(world);
window.addEventListener('lucid:mobile-view', () => world.refreshPresentation());
world.extFactory.break = (h, w, hh) => new BreakRoom(h, w, hh);
world.extFactory.charging = (h, w, hh) => new ChargingRoom(h, w, hh);
world.extFactory.queue = (h, w, hh) => new QuestionLine(h, w, hh);
let coinRewards: CoinRewards | null = null;
// Rewards in the tray are only collectible once their work may be collected (see collectible).
let coinReady: (id: string) => boolean = () => true;
let coinCollected: (id: string) => Promise<void> = async () => {};
(window as any).__world = world; // debug handle for test runs
const threadCardPortraits = new Map<string, { signature: string; svg: string }>();
const chat = new ChatPanel($("scene").parentElement!, {
  threadCard: ref => {
    const data = world.lastData;
    const id = data?.nativeEnvironmentId === ref.environmentId ? ref.threadId : `${ref.environmentId}::${ref.threadId}`;
    const thread = data?.threads.find(t => t.id === id);
    if (!thread) return null;
    const robot = world.roster.byThread(id);
    const signature = JSON.stringify([thread.provider, robot?.look]);
    let portrait = threadCardPortraits.get(id);
    if (!portrait || portrait.signature !== signature) {
      portrait = { signature, svg: avatar(thread.provider, robot?.look, 44) }; threadCardPortraits.set(id, portrait);
      if (threadCardPortraits.size > 500) threadCardPortraits.delete(threadCardPortraits.keys().next().value!);
    }
    return { title: thread.title, provider: harnessName(thread.provider), model: thread.model, name: robot?.name, portrait: portrait.svg };
  },
  openThreadCard: ref => {
    const id = world.lastData?.nativeEnvironmentId === ref.environmentId ? ref.threadId : `${ref.environmentId}::${ref.threadId}`;
    if (world.lastData?.threads.some(t => t.id === id)) { gameSound.play('open'); openThread(id); }
  },
  conversation: (id) => api.conversation(id), conversationPage: (id, options) => (api as any).conversationPage(id, options),
  sendMessage: (o) => api.sendMessage(o), saveAttachment: (n, d) => (api as any).saveAttachment(n, d), revealFile: (api as any).revealFile ? (p) => (api as any).revealFile(p) : undefined, t3: (window as any).lucidT3,
  // Saved reports belong to this environment's actual review conversation.
  reviewPapers: async id => !currentEnvironment && id === settings.orch?.threadId ? (api as any).reportsList() : [],
  sourceReport: async id => !currentEnvironment && id !== settings.orch?.threadId ? latestSourceReport(await (api as any).reportsList(), id) : null,
  openReview: (paper, questions) => {
    if (currentEnvironment) return;
    gameSound.play('open');
    void showReport(paper.threadId, paper.title, () => openThread(paper.threadId), paper.id, openThread, questions);
  },
  openReviewThread: paper => { if (!currentEnvironment) openThread(paper.threadId); },
});
// The chat header names the manager's role and shows its profile picture.
function paintChatManager() {
  const data = world.lastData;
  const selected = data?.threads.find(t => t.id === chat.threadId);
  if (!data || !selected) return;
  const robot = selected.pinned ? world.roster.byThread(selected.id) : null;
  chat.setManager(selected.pinned ? `${data.projects.find(p => p.id === (selected.manager?.projectId || selected.projectId))?.title || 'Project'} manager${selected.manager?.role ? `: ${selected.manager.role}` : ''}` : null,
    selected.pinned ? managerFace({ provider: robot?.provider || selected.provider, look: robot?.look, picture: selected.manager?.avatar, size: 26, place: "c" }) : "");
}
function manageRobot(threadId: string | null, projectId: string | null = null) {
  if (!world.lastData) return;
  openManagers(world.lastData, threadId, projectId, {
    update: o => (window as any).lucidT3.manager(o),
    suggest: o => (window as any).lucidT3.managerSuggest(o),
    robotName: id => world.roster.byThread(id)?.name,
    avatar: o => (window as any).lucidT3.managerAvatar(o),
    avatarHistory: o => (window as any).lucidT3.managerAvatarHistory(o),
    avatarAsk: o => (window as any).lucidT3.managerAvatarAsk(o),
    face: (id, picture, size, place) => {
      const robot = world.roster.byThread(id), t = world.lastData?.threads.find(x => x.id === id);
      return managerFace({ provider: robot?.provider || t?.provider || "", look: robot?.look, picture, size, place });
    },
    played: cue => gameSound.play(cue),
    refresh: async () => { await refresh(); renderThreads(); paintChatManager(); },
  });
}
chat.onManage = id => manageRobot(id);
// the sidebar and the chat are columns beside the scene, so the camera always fits what is left (see World)
world.onFocus = (d) => { if (d) { world.revealThread(d.threadId); chat.open(d); paintChatManager(); chat.setView(world.focusMode); pushStatus(d); } };
// a robot's question, answered from its chat (see openAnswer)
const answerDeps = { pending: sharedPendingRequests((id) => (window as any).lucid.pendingRequests(id)), t3: (window as any).lucidT3, advice: (rid: string) => delegate.advice.get(rid) ?? null };
const answer = new AnswerCard(chat, answerDeps);
const monitorTasks = new MonitorTasks(world, {
  answer: answerDeps,
  read: id => world.onFollowChat(id),
  ready: (id, fresh) => collectible(id, fresh),
  collect: (id, from) => collectWork(id, from),
  details: id => workDetails(id),
});
// Finished work is collected once: approved by review (the worker brought the report back
// to its desk), or completed and still unsettled when reviews are off. Settling pays the
// coins and settles the thread, which clears the desk.
// A session that ended any way (finished, stopped, failed) can be settled from its desk, and a
// settled one whose coins are still waiting can be collected there.
function collectible(id: string, _fresh: boolean): Collectible | null {
  if (currentEnvironment || companionClient()) return null;
  const thread = world.lastData?.threads.find(t => t.id === id);
  if (!thread || thread.pinned || thread.question) return null;
  const coins = coinRewards ? wallet.rewards.find(r => r.id === id)?.amount ?? 0 : 0;
  const amount = coins > 0 ? formatCoins(coins) : null;
  if (thread.settled) return amount ? { summary: 'Settled. Its coins are still waiting on this desk.', coins: amount, state: 'settled' }
    : world.keptDesks.has(id) ? { summary: 'Settled and collected. The desk stays until you remove it.', coins: null, state: 'kept' } : null;
  const status = (thread.runStatus ?? '').toLowerCase();
  if (!ENDED.has(status)) return null;
  // The turn ended but a job it started keeps going (or died): say so instead of "Finished".
  const job = thread.job;
  if (job?.state === 'running') return { summary: `Its background job is still running: ${job.name}.`, coins: amount, state: 'background', job: `${job.name}${job.progress ? ` · ${job.progress}` : ''}` };
  if (job?.state === 'failed') {
    const when = job.since ? ` at ${new Date(job.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
    return { summary: `Its background job ${job.reason}${when}. Continue the session so the robot can restart it, or settle it as it is.`, coins: amount, state: 'job-failed', job: `${job.name} ${job.reason}${when}. Continue the session to have it restarted.` };
  }
  if (status !== 'completed') return { summary: 'This session stopped before it finished. Continue it, or settle it as it is.', coins: amount, state: 'stopped' };
  if (orch.reviewing) {
    const paper = orch.approvedPaper(id);
    return paper ? { summary: String(paper.verdict?.summary || ''), coins: amount, state: 'done' } : null;
  }
  return { summary: 'Continue this session, or settle it when you are finished.', coins: amount, state: 'done' };
}
/** Run states that mean the session ended (collectible above reads this at call time). */
const ENDED = new Set(['completed', 'cancelled', 'canceled', 'interrupted', 'failed', 'error', 'stopped', 'aborted']);
/** What a finished session was about and what it reported, for its desk monitor. */
async function workDetails(id: string): Promise<WorkDetails> {
  const messages: any[] = await (window as any).lucid.conversation(id).catch(() => []);
  return buildWorkDetails(Array.isArray(messages) ? messages : [], id, renderChatMarkdown);
}
// --- workers up close --------------------------------------------------------------------
const settledNow = () => new Set((world.lastData?.threads ?? []).filter(t => t.settled && !t.pinned).map(t => t.id));
function openWorkerProfile(r: RobotProfile, anchor: Element | null) {
  if (companionClient()) return;
  const t = r.threadId ? world.lastData?.threads.find(t => t.id === r.threadId) : null;
  const free = world.roster.freeTeam(settledNow()).includes(r);
  const job = t && !t.settled ? { title: t.title, status: t.question ? "Needs your answer" : hasOfficeWork(t) ? "Working on" : orch.approvedPaper(t.id) ? "Ready to collect" : world.reports.has(t.id) ? "Waiting for review" : "Finished" } : null;
  const projectId = t?.projectId || world.lastData?.projects.find(p => !p.scratch)?.id || "";
  const view = openWorkerFocus({
    robot: r, anchor, job, free,
    loadRuntime: () => (window as any).lucidT3.hireConfig({ projectId }),
    onOpenChat: t ? () => world.onSelectThread(t.id) : undefined,
    onCustomize: () => openCustomize({ name: r.name, provider: r.provider, look: r.look, level: world.level, onSave: (look, name) => { world.roster.setLook(r.id, look); world.roster.rename(r.id, name); view.refresh(); if (world.lastData) world.update(world.lastData); } }),
    onRetrain: (provider, model) => { world.roster.retrain(r.id, provider, model, settledNow()); if (world.lastData) world.update(world.lastData); },
    onRetire: () => { world.roster.retire(r.id, settledNow()); void refresh(); },
    onStaffWall: () => openWall(),
  });
}
function openWall() {
  openStaffWall({ robots: world.roster.robots, onFocus: r => openWorkerProfile(r, null), onRehire: r => { world.roster.rehire(r.id); void refresh(); } });
}
world.onRobotFocus = (threadId, anchor) => { const r = world.roster.byThread(threadId); if (r) openWorkerProfile(r, anchor); };
robotFocus.open = (id, el) => { const r = world.roster.byThread(id); if (!r || companionClient()) return false; openWorkerProfile(r, el); return true; };
const collectingWork = new Set<string>();
async function collectWork(id: string, from: HTMLElement) {
  if (collectingWork.has(id)) return;
  // Already settled: only its coins are left to pick up.
  if (world.lastData?.threads.find(t => t.id === id)?.settled) {
    // a kept desk with nothing left to collect: "Remove desk" sends the robot off and frees it
    if (world.keptDesks.has(id) && !wallet.rewards.some(r => r.id === id)) {
      removeKeptDesk(id); gameSound.play('servo'); world.deskFor(id)?.robot.react('relax');
      await refresh(); return;
    }
    collectingWork.add(id);
    try { if (!coinRewards?.collect(id, from, false)) { gameSound.play('collect'); world.deskFor(id)?.robot.react('cheer'); } keepDesk(id); }
    finally { collectingWork.delete(id); }
    await refresh(); return;
  }
  // Reviews approve finished work; a stopped session is settled as it is, without a review.
  const finished = world.lastData?.threads.find(t => t.id === id)?.runStatus === 'completed';
  const paper = orch.reviewing && finished ? orch.approvedPaper(id) : null;
  if (orch.reviewing && finished && !paper) throw Error('This work is not approved yet');
  collectingWork.add(id);
  try {
    // Settle first: if T3 refuses, the coins stay on the desk for the retry.
    if (paper) await (api as any).reportsManual(paper.id, 'collect');
    else await settleInT3(id);
    keepDesk(id);
    if (!coinRewards?.collect(id, from, false)) { gameSound.play('collect'); world.deskFor(id)?.robot.react('cheer'); }
    if (paper) orch.papers = await (api as any).reportsList();
  } finally { collectingWork.delete(id); }
  await refresh();
}
/** Collected work keeps its desk (with its robot) until you remove it from the monitor. */
function keepDesk(id: string) {
  if (world.keptDesks.has(id) || !world.deskFor(id)) return;
  world.keptDesks.add(id); settings.keptDesks = [...world.keptDesks]; saveSettings();
}
function removeKeptDesk(id: string) {
  if (!world.keptDesks.delete(id)) return;
  settings.keptDesks = [...world.keptDesks]; saveSettings();
}
coinReady = id => {
  const t = world.lastData?.threads.find(t => t.id === id);
  return !t || t.settled || !!collectible(id, true);
};
coinCollected = async id => {
  const t = world.lastData?.threads.find(t => t.id === id);
  if (!t || t.settled || !ENDED.has((t.runStatus ?? '').toLowerCase())) return;
  const paper = orch.reviewing && t.runStatus === 'completed' ? orch.approvedPaper(id) : null;
  if (paper) await (api as any).reportsManual(paper.id, 'collect');
  else if (!orch.reviewing || t.runStatus !== 'completed') await settleInT3(id);
  keepDesk(id);
};
/** Settle in T3 and make sure it took: T3 is asked again once if its record did not change. */
async function settleInT3(id: string) {
  const t3 = (window as any).lucidT3;
  const done = async () => { const fresh = await api.world().catch(() => null); return !!fresh?.threads.find(t => t.id === id)?.settled; };
  const ask = async () => { const r = await t3.settle({ threadId: id }); if (r && r.ok === false) throw Error(r.error || 'T3 could not settle this session.'); };
  await ask();
  for (let i = 0; i < 6; i++) { if (await done()) return; await new Promise(r => setTimeout(r, 250)); }
  await ask();
  for (let i = 0; i < 8; i++) { if (await done()) return; await new Promise(r => setTimeout(r, 250)); }
  throw Error('T3 did not record the settlement. Check that T3 Code is running, then try again.');
}
(window as any).__monitorTasks = monitorTasks;
(window as any).__answer = answer; // isolated answer-form fixture handle
// a chat opened without a desk (questions room, follow chip) closes itself
chat.threadFacts = (id) => {
  const t = world.lastData?.threads.find(t => t.id === id);
  if (!t) return null;
  const p = world.lastData!.projects.find(p => p.id === t.projectId);
  return { title: t.title, project: p && !p.scratch ? p.title : "", model: t.model };
};
chat.onClose = () => { chat.close(); world.unfocus(); world.revealThread(null); markSelected(null); };
chat.onChooseThread = () => {
  toggleRail(false, false);
  const search = $("th-q") as HTMLInputElement;
  folded.delete("threads");
  ui.folded = [...folded];
  foldSection("threads", true, false);
  search.focus();
  saveSettings();
};
// Office navigation leaves the conversation open until the user hides it.
chat.onToggleView = () => {
  const d = world.focusDesk;
  if (!d) return;
  if (world.focusMode === "desk") world.focusScreen(d); else world.focusOn(d);
  chat.setView(world.focusMode);
};
function operationalStatus(t: WorldData["threads"][number]) {
  const reviews = latestThreadReviews(currentEnvironment ? [] : orch.papers);
  const review = threadReviewLabel(t, reviews.get(t.id), !currentEnvironment && !!settings.orch && t.id !== settings.orch.threadId);
  return threadState(t, review, delegate.phaseOf(t.id) === "reading");
}
function paintSelectedStatus() {
  markSelected(chat.threadId);
  const t = world.lastData?.threads.find(t => t.id === chat.threadId);
  if (t) chat.setThreadStatus(operationalStatus(t));
}
chat.onPresent = paintSelectedStatus;
function pushStatus(d: Desk) {
  const t = world.lastData?.threads.find(t => t.id === d.threadId);
  const run = t?.runStatus ?? d.info?.run?.status;
  chat.setThreadStatus(t ? operationalStatus(t) : threadState({ runStatus: run || null, updatedAt: "", question: (d.info as any)?.question }));
  chat.setTyping(run === "running" && /^Writing to you/.test(d.activity || ""), d.profile?.name ?? "It");
}
// Dev aid: keep the last errors where a debug run can read them.
(window as any).__errs = [];
window.addEventListener("error", (e) => (window as any).__errs.push(String(e.message) + " @ " + String(e.error?.stack || "").split("\n").slice(1, 4).join(" < ")));
const origError = console.error.bind(console);
console.error = (...a: any[]) => { (window as any).__errs.push(a.map(String).join(" ").slice(0, 300)); origError(...a); };

// --- rooms --------------------------------------------------------------------------
world.onRooms = (rooms: Room[]) => {
  projectLife.sync();
  const list = $("room-list");
  const ordered = [...rooms.filter((r) => !movableRoom(r.id)), ...world.orderRooms(rooms.filter((r) => movableRoom(r.id)))];
  const html = ordered.map((r) => {
    const office = ["main", "project", "freelance"].includes(r.kind);
    const pin = office && world.isRoomExpanded(r.id);
    return `<li class="room-list-row">
      ${movableRoom(r.id) ? `<button type="button" class="room-grab" data-room-id="${esc(r.id)}" aria-label="Move ${esc(r.title)}" title="Drag to reorder ${esc(r.title)}. Click for move options.">${uiIcon("grip", 14)}</button>` : ""}
      <button type="button" class="room-open" data-room="${esc(r.id)}" title="${esc(r.title)}${r.collapsed ? ": open quiet office" : ""}">
        ${r.icon ? `<img src="${esc(r.icon)}" alt="">` : `<span class="dot ${r.kind}"></span>`}
        <span class="rt">${esc(r.title)}</span><span class="rc">${r.threadIds.length || ""}</span>
      </button>
      ${office ? `<button type="button" class="room-fold" data-fold-room="${esc(r.id)}" aria-pressed="${!!pin}" aria-label="${pin ? "Collapse" : "Expand"} ${esc(r.title)}" title="${pin ? "Collapse office" : "Expand office"}">${pin ? "Collapse" : "Expand"}</button>` : ""}
    </li>`;
  }).join("");
  if (list.dataset.html !== html) {
    const focused = document.activeElement as HTMLElement | null;
    const key = focused && list.contains(focused) ? { room: focused.dataset.room, grip: focused.dataset.roomId, fold: focused.dataset.foldRoom } : null;
    list.innerHTML = html; list.dataset.html = html;
    if (companionClient()) for (const button of list.querySelectorAll<HTMLButtonElement>('.room-grab, .room-fold')) {
      button.disabled = true; button.title = 'Arrange offices on the computer.';
    }
    if (key) {
      const selector = key.room ? `[data-room="${CSS.escape(key.room)}"]` : key.grip ? `.room-grab[data-room-id="${CSS.escape(key.grip)}"]` : key.fold ? `[data-fold-room="${CSS.escape(key.fold)}"]` : "";
      if (selector) list.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    }
  }
};
$("room-list").addEventListener("click", (e) => {
  const grip = (e.target as HTMLElement).closest<HTMLElement>(".room-grab[data-room-id]");
  if (grip) { const room = world.rooms.find((r) => r.id === grip.dataset.roomId); if (room) { const b = grip.getBoundingClientRect(); world.onRoomMenu(room, b.left, b.bottom); } return; }
  const fold = (e.target as HTMLElement).closest<HTMLElement>("[data-fold-room]");
  if (fold) { const id = fold.dataset.foldRoom!; world.setRoomExpanded(id, !world.isRoomExpanded(id)); return; }
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-room]");
  if (!b) return;
  if (world.rooms.some((r) => r.id === b.dataset.room && ["main", "project", "freelance"].includes(r.kind))) world.setRoomExpanded(b.dataset.room!, true);
  world.showRoom(b.dataset.room!);
  if (b.dataset.room?.startsWith("p:") && !companionClient()) void projectLife.open(b.dataset.room.slice(2));
  // the questions room: answer the robot at the front of the line
  if (world.rooms.find((r) => r.id === b.dataset.room)?.kind === "queue") { const t = world.lastData?.threads.find((x) => x.question); if (t) openAnswer(t.id); }
});
$("room-list").addEventListener("contextmenu", (e) => {
  const row = (e.target as HTMLElement).closest<HTMLElement>("li");
  const id = row?.querySelector<HTMLElement>("[data-room]")?.dataset.room;
  const room = world.rooms.find((r) => r.id === id);
  if (!room || !["main", "project", "freelance"].includes(room.kind)) return;
  e.preventDefault(); world.onRoomMenu(room, e.clientX, e.clientY);
});
if (!companionClient()) wireRoomDrag({ scene: $("scene"), list: $("room-list"), rooms: () => world.orderRooms(world.rooms.filter((r) => movableRoom(r.id))),
  hold: (active) => { if (active) world.stopCameraMotion(); world.setLayoutHeld(active); }, reorder: (id, before) => world.reorderRoom(id, before) });
$("overview").addEventListener("click", () => world.overview());
$("park").addEventListener("click", () => world.showPark());


// --- following one robot ----------------------------------------------------------------
// The selected robot is shown in its chat (header and status line); the sidebar has no card for it.

world.onSelectThread = (id) => {
  openThread(id);
};
$("scene").addEventListener("click", (e) => {
  const pad = (e.target as Element).closest(".desk-plan");
  if (!pad) return;
  const desk = [...world.desks.values()].find((d) => d.el.contains(pad));
  if (desk) world.focusOn(desk);
}, true);
const sceneObserver = new MutationObserver(() => ($("back-btn").hidden = !$("scene").classList.contains("screen-mode")));
sceneObserver.observe($("scene"), { attributes: true, attributeFilter: ["class"] });
$("back-btn").addEventListener("click", () => world.unfocus());


// --- live data -------------------------------------------------------------------------
api.onItems(({ threadId, items, initial }) => { world.activityDeskFor(threadId)?.director.push(items, initial); chat.ping(threadId); answer.ping(threadId); });
api.onInfo(({ threadId, info }) => {
  const d = world.activityDeskFor(threadId);
  if (info.error) return;
  if (d) {
    d.setInfo(info);
  }
  if (chat.threadId === threadId) {
    if (d && !d.el.classList.contains("arriving")) pushStatus(d);
    else openDetachedChat(threadId, info);
  }
});

let watched = "";
let companionRevisions: Record<string, string> = {};
let watchTimer = 0, watchBusy = false, watchAgain = false;
world.onCampusChange = () => { void syncWatches(); };
function desiredWatches() {
  const companion = companionClient();
  const office = !document.hidden && !world.scene.inert;
  const ids = companion
    ? office ? [...world.desks].filter(([, desk]) => renderFps(desk.screen) > 0).map(([id]) => id) : []
    : world.campusDesks.map(row => row.id);
  if (world.orchThread && (!companion || office)) ids.push(world.orchThread);
  if (chat.threadId && (!companion || !document.hidden && chat.visible)) ids.push(chat.threadId);
  return [...new Set(ids)].sort();
}
function scheduleWatchSync() {
  if (!companionClient() || watchTimer) return;
  watchTimer = window.setTimeout(() => { watchTimer = 0; void syncWatches(); }, 120);
}
async function syncWatches() {
  if (watchBusy) { watchAgain = true; return; }
  if (switchingBuilding) return;
  const ids = desiredWatches(), key = ids.join(',');
  if (key === watched) return;
  const epoch = buildingEpoch;
  watchBusy = true;
  try {
    if (await api.watchSet(ids) && epoch === buildingEpoch) watched = key;
  } catch (error) { console.error('Thread watch refresh failed', error); }
  finally { watchBusy = false; if (watchAgain || epoch !== buildingEpoch) { watchAgain = false; scheduleWatchSync(); } }
}
if (companionClient()) {
  const stopWatchWake = onRenderWake(scheduleWatchSync);
  window.addEventListener('lucid:mobile-view', scheduleWatchSync);
  document.addEventListener('visibilitychange', scheduleWatchSync);
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    clearTimeout(watchTimer); stopWatchWake();
    window.removeEventListener('lucid:mobile-view', scheduleWatchSync);
    document.removeEventListener('visibilitychange', scheduleWatchSync);
  });
}
let firstLoad = true;
let refreshBusy = false;
let refreshQueued = false;
let buildingEpoch = 0, switchingBuilding = false;
let currentEnvironment: string | undefined;
const buildingCameras = new Map<string, { x: number; y: number; s: number }>();
async function refresh() {
  if (companionClient() && document.hidden) return;
  if (switchingBuilding) return;
  if (refreshBusy) { refreshQueued = true; return; }
  const epoch = buildingEpoch, environment = currentEnvironment;
  const current = () => !switchingBuilding && epoch === buildingEpoch && environment === currentEnvironment;
  refreshBusy = true;
  try {
    const frame = companionClient() && (api as any).remoteFrame
      ? await (api as any).remoteFrame({ known: companionRevisions }) as { state?: { settings: string; roster: string }; world?: WorldData; tasks?: unknown[]; revisions: Record<string, string> }
      : null;
    const companion = frame ? frame.state : await readCompanionState();
    if (!current()) return;
    if (companion) {
      world.roster.replaceSnapshot(companion.roster);
      const shared = JSON.parse(companion.settings);
      for (const key of ['orch', 'wallet', 'roles', 'level', 'milestones', 'themes', 'hidden', 'extra', 'homes', 'seats', 'expandedRooms', 'collapsedRooms', 'roomOrder', 'buildingLayouts'] as const) (settings as any)[key] = shared[key];
      world.hidden = new Set(settings.hidden ?? []);
      world.roomOrder = settings.roomOrder ?? [];
      world.expandedRooms = new Set(settings.expandedRooms ?? []);
      world.collapsedRooms = new Set(settings.collapsedRooms ?? []);
      world.extra = new Map(Object.entries(settings.extra ?? {}));
      world.themes = new Map(Object.entries(settings.themes ?? {}));
      world.homes = new Map(Object.entries(settings.homes ?? {}));
      world.seats = new Map(Object.entries(settings.seats ?? {}));
      world.restoreLayouts(settings.buildingLayouts ?? {});
      renderOrch();
    }
    const data = frame ? frame.world ?? world.lastData : await api.world();
    if (!current() || !data || data.environmentId !== environment) return;
    if (frame) {
      companionRevisions = frame.revisions;
      if (!frame.world && !frame.state && !world.needsRefresh) { scheduleWatchSync(); return; }
    }
    if (!data.environmentId) {
      // Supervision can wait on external tools. It must never hold the office
      // snapshot, camera or refresh loop hostage to a slow review request.
      void orch.observe(data.threads);
      void delegate.observe(data.threads, data.projects).catch(error => console.error('Question refresh failed', error));
    }
    monitorTasks.prepare(data);
    coinRewards?.prepare(data);
    for (const p of data.projects) projectTitles.set(p.id, p.title);
    renderCompany(data.shipped ?? { total: 0, today: 0 });
    world.orchThread = data.environmentId ? '' : settings.orch?.threadId || '';
    world.update(data);
    paintSelectedStatus();
    if (!document.hidden) renderThreads();
    if (companionClient()) for (const button of world.scene.querySelectorAll<HTMLButtonElement>('.desk-ghost')) {
      button.disabled = true; button.title = 'Add desks on the computer. Use the office menu to start work.';
    }
    coinRewards?.render();
    // Settled work keeps no desk just to hold its coins: they are collected (and fly to the
    // counter) as soon as the thread is settled, here or in T3, and the desk is released.
    if (coinRewards && !data.environmentId && !companionClient()) {
      for (const reward of [...wallet.rewards]) {
        const t = data.threads.find(t => t.id === reward.id);
        if (t?.settled && !t.pinned) { keepDesk(t.id); coinRewards.collect(t.id, world.deskFor(t.id)?.el ?? $("coin-bank"), false); }
      }
    }
    // a kept desk goes when its session is reopened or gone, or new work took that desk
    if (!data.environmentId && !companionClient() && world.keptDesks.size) {
      for (const id of [...world.keptDesks]) {
        const t = data.threads.find(t => t.id === id);
        if (!t || !t.settled || !world.deskFor(id)) removeKeptDesk(id);
      }
    }
    monitorTasks.sync();
    paintChatManager();
    for (const d of world.desks.values()) {
      d.onActivity = (t) => { if (d.threadId === chat.threadId) pushStatus(d); };
    }
    void syncWatches();
    if (firstLoad) {
      firstLoad = false;
      const want = new URLSearchParams(location.search).get("thread");
      const d = want ? world.deskFor(want) : null;
      if (d) { world.select(d); requestAnimationFrame(() => { if (current()) world.showDesk(d); }); }
      else requestAnimationFrame(() => {
        if (!current()) return;
        const room = appEl.classList.contains('mobile-layout') ? mobileStartRoom(world.rooms, data.threads, new URLSearchParams(location.search).get('project')) : null;
        if (room) world.showRoom(room); else world.overview();
      });
    }
  } catch (err) {
    console.error("world refresh failed", err, String((err as any)?.stack || "").split("\n").slice(1, 3).join(" < "));
  } finally {
    refreshBusy = false;
    // Coalesce actions made during a refresh into one immediate follow-up.
    if (refreshQueued) { refreshQueued = false; void refresh(); }
  }
}

// --- office and desk options -------------------------------------------------------------
let startNewTask: () => void = () => {};
function setupMenus() {
  world.onAddDesk = (room) => {
    if (companionClient()) return;
    world.setRoomExpanded(room, true);
    world.extra.set(room, Math.max(0, world.extra.get(room) ?? 0) + 1);
    world.seats.get(room)?.push(null);
    if (world.lastData) world.update(world.lastData);
    saveSettings();
    void refresh();
  };
  const applyDeskRemoval = (remove: () => number | boolean) => {
    if (companionClient() || !remove()) return;
    if (world.lastData) world.update(world.lastData);
    gameSound.play('switch'); saveSettings(); void refresh();
  };
  world.onRemoveEmptyDesk = slot => applyDeskRemoval(() => world.removeEmptyDesk(slot));
  world.onFreeDeskMenu = (d, slot, x, y) => {
    if (companionClient()) { world.onFreeDesk(d, slot, x, y); return; }
    const room = slot.split("#")[0];
    showMenu(x, y, room === "main" ? "Drag a thread here from the sidebar" : "Free desk", [
      ...(room === "main" ? [] : [{ label: "Hire someone for this desk", run: () => world.onFreeDesk(d, slot, x, y) }]),
      ...(world.canRemoveEmptyDesk(slot) ? [{ label: "Remove this desk", run: () => world.onRemoveEmptyDesk(slot) }] : []),
      ...(world.emptyDeskSlots(room).length > 1 ? [{ label: "Remove empty desks in this office", run: () => applyDeskRemoval(() => world.removeEmptyDesks(room)) }] : []),
    ]);
  };
  const hireForOffice = (room: string, idx: number, intent?: "thread" | "delegate") => {
    let companionLaunch: { requestId: string; signature: string; resuming: boolean; threadId?: string } | null = null;
    const data = world.lastData;
    if (!data) return;
    const r = world.rooms.find((q) => q.id === room);
    const scratch = data.projects.find((p) => p.scratch);
    const projectId = room.startsWith("p:") ? room.slice(2) : room === "freelance" ? scratch?.id ?? "" : "";
    const real = data.projects.filter((p) => !p.scratch && !world.hidden.has(p.id) && p.id !== settings.orch?.projectId);
    const freeTeam = () => {
      const latest = world.lastData ?? data;
      const settledNow = new Set(latest.threads.filter(t => t.settled && !t.pinned).map(t => t.id));
      return world.roster.freeTeam(settledNow).map(robot => {
        const thread = [robot.threadId, ...[...(robot.done ?? [])].reverse()].map(id => latest.threads.find(t => t.id === id && t.provider === robot.provider && t.model)).find(Boolean);
        return { ...robot, model: thread?.model || robot.lastModel || null };
      });
    };
    openHire({
      room, roomTitle: r?.title ?? "Office", seat: Number(idx) || 0, intent,
      team: freeTeam(), getTeam: freeTeam, projectId,
      loadRuntime: id => (window as any).lucidT3.hireConfig({ projectId: id }),
      saveAttachment: (name, bytes) => (api as any).saveAttachment(name, bytes),
      roles: [...BUILTIN_ROLES, ...(settings.roles ?? [])],
      onNewRole: (r) => { settings.roles = [...(settings.roles ?? []), r]; saveSettings(); },
      projects: projectId ? null : real.map((p) => ({ id: p.id, title: p.title })),
      onHire: async (c) => {
        const project = projectId || c.projectId;
        if (!project) throw new Error("Choose a project for this desk");
        if (!companionClient() && c.robotId && world.roster.byThread(c.requestId)?.id !== c.robotId) {
          const latest = await api.world();
          const robot = world.roster.robots.find(r => r.id === c.robotId);
          if (!robot || robot.threadId && !latest.threads.some(t => t.id === robot.threadId && t.settled && !t.pinned)) throw new Error("That robot is no longer free. Choose another candidate.");
        }
        const message = c.role ? `Your role: ${c.role.name}. ${c.role.brief}\n\nTask: ${c.task}` : c.task;
        if (companionClient()) {
          const signature = JSON.stringify({ project, message, provider: c.provider, model: c.model, options: c.options });
          if (companionLaunch && companionLaunch.signature !== signature) throw Error('The previous task has already been submitted. Restore its prompt and runtime to retry its desk assignment, or open the thread from the list.');
          companionLaunch ??= { requestId: c.requestId, signature, resuming: false };
        }
        const { threadId } = companionLaunch?.threadId ? { threadId: companionLaunch.threadId } : await api.startThread({ project, message, provider: c.provider, model: c.model, options: c.options, requestId: companionLaunch?.requestId ?? c.requestId });
        if (companionClient()) {
          companionLaunch!.threadId = threadId;
          const snapshot = await (api as any).remoteCommit({ kind: 'hire', threadId, robotId: c.robotId, provider: c.provider, role: c.role?.name ?? '', model: c.model, room, index: Number(idx) || 0, resuming: companionLaunch!.resuming });
          world.roster.replaceSnapshot(snapshot.roster);
          await refresh();
          const desk = world.deskFor(threadId);
          if (desk) { world.select(desk); world.focusOn(desk); }
          return;
        }
        world.roster.assignRobot(threadId, c.robotId, c.provider, c.role?.name ?? "", c.model);
        world.homes.set(threadId, room);
        world.pendingSeat = { room, index: Number(idx) || 0, threadId };
        world.sprint(threadId);
        saveSettings();
        await refresh();
        const nd = world.deskFor(threadId);
        if (nd) { world.select(nd); world.focusOn(nd); }
      },
    });
  };
  world.onFreeDesk = (_d, slot, x, y) => {
    const [room, idx] = slot.split("#");
    hireForOffice(room, Number(idx) || 0);
  };
  const startOfficeWork = (room: string, intent: "thread" | "delegate") => {
    gameSound.play('open');
    hireForOffice(room, world.firstFreeDesk(room), intent);
  };
  // New task from anywhere: the project office in view gets it, otherwise the main office asks for a project.
  startNewTask = () => {
    const room = world.focusDesk?.room;
    startOfficeWork(room && room.startsWith("p:") && world.rooms.some(r => r.id === room) ? room : "main", "thread");
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
    const work = [
      { label: "New thread", run: () => startOfficeWork(room.id, "thread") },
      { label: "Delegate task", run: () => startOfficeWork(room.id, "delegate") },
    ];
    if (companionClient()) { showMenu(x, y, room.title, work); return; }
    const deco = { label: "Decorate", run: () => decorate(room) };
    const free = world.emptyDeskSlots(room.id).length;
    const cleanup = free ? [{ label: `Remove ${free} empty desk${free === 1 ? "" : "s"}`, run: () => applyDeskRemoval(() => world.removeEmptyDesks(room.id)) }] : [];
    const policy = { label: world.isRoomExpanded(room.id) ? "Collapse office" : "Expand office", run: () => world.setRoomExpanded(room.id, !world.isRoomExpanded(room.id)) };
    const order = world.orderRooms(world.rooms.filter((r) => movableRoom(r.id)));
    const index = order.findIndex((r) => r.id === room.id);
    const moveOffice = (before: string | null) => {
      world.reorderRoom(room.id, before);
      $("room-list").querySelector<HTMLElement>(`.room-grab[data-room-id="${CSS.escape(room.id)}"]`)?.focus({ preventScroll: true });
    };
    const moves = [
      ...(index > 0 ? [{ label: "Move office earlier", run: () => moveOffice(order[index - 1].id) }] : []),
      ...(index >= 0 && index < order.length - 1 ? [{ label: "Move office later", run: () => moveOffice(order[index + 2]?.id ?? null) }] : []),
    ];
    if (room.kind === "main") { showMenu(x, y, room.title, [...work, ...cleanup, deco, policy]); return; }
    if (room.kind === "freelance") {
      showMenu(x, y, "Freelancers", [...work, ...cleanup, deco, policy, ...moves, { label: "Hide this office", run: () => { world.hidden.add("freelance"); saveSettings(); void refresh(); } }]);
      return;
    }
    const pid = room.id.slice(2);
    showMenu(x, y, room.title, [
      { label: "Project office board", run: () => projectLife.open(pid) },
      ...work, ...cleanup,
      { label: "Manage project managers", run: () => manageRobot(null, pid) },
      deco, policy, ...moves,
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
      { label: "Worker profile", run: () => { const r = d.threadId ? world.roster.byThread(d.threadId) : null; if (r) openWorkerProfile(r, d.el.querySelector(".robot-host")); } },
      { label: "Look at its screen", run: () => world.focusScreen(d) },
      { label: "Go to its desk", run: () => world.showDesk(d) },
      { label: "Customize robot", run: () => openCustomizeFor(d, world.roster, world.level) },
      { label: world.lastData?.threads.find(t => t.id === d.threadId)?.pinned ? "Edit or demote manager" : "Promote to manager", run: () => manageRobot(d.threadId) },
    ];
    if (d.threadId) items.push(...officeMoveItems(d.threadId));
    if (d.room === "freelance" && d.folder) {
      items.push({ input: "Turn this work into a project", placeholder: "Project name", value: (d.info?.title || "").slice(0, 40), submit: "Create project",
        run: async (name: string) => { await api.addProject({ path: d.folder!, title: name }); await refresh(); } });
    }
    showMenu(x, y, d.info?.title || "Robot", items);
  };
}

// --- one-click update --------------------------------------------------------------------
let updateState: Awaited<ReturnType<typeof api.checkUpdate>> | null = null;
let updateBusy = false;
let updateChecking = false;
let updateCheckError = "";
let lastUpdateFailure: { message: string; details: string; kind?: string } | null = null;
function updateTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Lucid did not answer. Close and reopen Lucid, then retry the update.")), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
async function checkUpdate() {
  if (companionClient()) return;
  if (updateBusy || updateChecking) return;
  updateChecking = true;
  const btn = $<HTMLButtonElement>("update");
  try {
    updateCheckError = "";
    const u = await updateTimeout(api.checkUpdate(), 15000);
    if (updateBusy) return;
    updateState = u;
    if (lastUpdateFailure && u.available) {
      btn.textContent = lastUpdateFailure.kind === 'not-ready' ? 'Changes not ready' : 'Retry update';
      btn.title = lastUpdateFailure.message;
      return;
    }
    lastUpdateFailure = null;
    const count = (u.local || 0) + (u.behind || 0);
    btn.textContent = u.available ? `Update${count ? ` (${count})` : ""}` : "Check updates";
    btn.title = [u.local ? `${u.local} changed files since the loaded build` : "", u.behind ? `${u.behind} remote commits` : "", u.legacy ? "Rebuild the current checkout" : "", ...(u.changes || []), ...(u.files || []).slice(0, 15), u.reason || (!u.available ? "You're up to date" : "Click to build and restart")].filter(Boolean).join("\n");
  } catch (err: any) {
    btn.textContent = updateState?.available ? "Update" : "Retry update check";
    updateCheckError = String(err?.message || err);
    btn.title = updateCheckError;
  } finally { updateChecking = false; }
}
$("update").addEventListener("click", async () => {
  if (companionClient()) return;
  if (updateBusy || updateChecking) return;
  const btn = $<HTMLButtonElement>("update");
  if (!updateState?.available) {
    btn.textContent = "Checking updates";
    await checkUpdate();
    if (!updateState?.available) {
      const r = btn.getBoundingClientRect();
      showMenu(r.left, r.bottom, updateCheckError || updateState?.reason || "You're up to date", [{ label: "Check again", run: checkUpdate }]);
      return;
    }
  }
  updateBusy = true;
  btn.disabled = true;
  btn.textContent = "Preparing update";
  lastUpdateFailure = null;
  let off = () => {};
  try {
    off = api.onUpdateStep((s) => (btn.textContent = s));
    const res = await updateTimeout(api.applyUpdate(), 600000);
    if (!res.ok) {
      lastUpdateFailure = { message: res.error || "Update failed. Try again.", details: res.details || res.error || '', kind: res.kind };
      throw new Error(lastUpdateFailure.message);
    }
    btn.textContent = "Check updates";
    btn.title = "You're up to date";
  } catch (err: any) {
    lastUpdateFailure ??= { message: String(err?.message || err), details: String(err?.message || err) };
    btn.textContent = lastUpdateFailure.kind === 'not-ready' ? 'Changes not ready' : 'Retry update';
    btn.title = lastUpdateFailure.message;
    const r = btn.getBoundingClientRect();
    const details = lastUpdateFailure.details;
    showMenu(r.left, r.bottom, lastUpdateFailure.message, [{ label: "Copy error details", run: async () => {
      try { await navigator.clipboard.writeText(details); }
      catch { showMenu(r.left, r.bottom, "Could not copy the error details. Try again from the update button.", [{ label: "Close", run: () => btn.focus() }]); }
    } }], { wrapTitle: true });
  } finally {
    try { off(); } catch { /* Cleanup must not leave the update button disabled. */ }
    updateBusy = false; btn.disabled = false;
  }
});

if (companionClient()) {
  $<HTMLButtonElement>('update').disabled = true;
  $('update').title = 'Update Lucid on the computer.';
}

const attachDir = await api.attachDir().catch(() => "");
world.building = await api.host().catch(() => "This PC");
async function selectBuilding(id: string) {
  if (switchingBuilding) throw Error('Another building is still opening.');
  buildingCameras.set(currentEnvironment || 'local', world.cameraState());
  switchingBuilding = true; buildingEpoch++;
  try {
    const building = await (api as any).selectEnvironment(id) as { label: string; local: boolean; world: WorldData };
    chat.close(); world.unfocus(); world.revealThread(null);
    currentEnvironment = building.local ? undefined : id;
    companionRevisions = {};
    watched = '';
    world.orchThread = building.local ? settings.orch?.threadId || '' : '';
    monitorTasks.prepare(building.world);
    world.update(building.world);
    coinRewards?.render();
    monitorTasks.sync();
    world.building = building.label;
    const label = world.root.querySelector(".building-plate b");
    if (label) label.textContent = building.label;
    const saved = buildingCameras.get(currentEnvironment || 'local');
    if (saved) world.restoreCamera(saved); else world.overview();
  } finally { switchingBuilding = false; }
  await refresh();
}
mountEnvironments($("environment-body"), (fresh) => (api as any).environments(fresh), selectBuilding,
  data => world.setBuildings(data.buildings, selectBuilding, id => (api as any).buildingWorld(id)));
const settings: { buildingLayouts?: Record<string, import("./office/world").OfficeLayout>; roomOrder?: string[]; expandedRooms?: string[]; collapsedRooms?: string[]; seats?: Record<string, (string | null)[]>; hidden?: string[]; extra?: Record<string, number>; homes?: Record<string, string>; orch?: OrchState | null; dailyLines?: DailyLinesState; roles?: Role[]; level?: number; themes?: Record<string, RoomTheme>; wallet?: WalletState; milestones?: string[]; nightRuns?: boolean; keptDesks?: string[]; weatherFix?: { kind: string; at: number }; ui?: { rail?: boolean; chatTab?: boolean; folded?: string[]; sideW?: number; chatW?: number; sideAuto?: boolean; chatAuto?: boolean } } = (() => { try { return JSON.parse(api.settingsLoad() || "{}"); } catch { return {}; } })();
world.hidden = new Set(settings.hidden ?? []);
world.keptDesks = new Set(settings.keptDesks ?? []);
world.roomOrder = Array.isArray(settings.roomOrder) ? settings.roomOrder.filter((id) => typeof id === "string" && movableRoom(id)) : [];
world.collapsedRooms = new Set(settings.collapsedRooms ?? []);
world.expandedRooms = new Set(Array.isArray(settings.expandedRooms) ? settings.expandedRooms.filter((id) => typeof id === "string") : []);
world.extra = new Map(Object.entries(settings.extra ?? {}));
world.themes = new Map(Object.entries(settings.themes ?? {}));
world.level = settings.level ?? 0;
world.homes = new Map(Object.entries(settings.homes ?? {}));
world.seats = new Map(Object.entries(settings.seats ?? {}).filter(([, seats]) => Array.isArray(seats)));
world.restoreLayouts(settings.buildingLayouts ?? {});

// --- folding the sidebar, its sections and the chat (remembered in settings.ui) ------------
settings.ui ??= {};
const ui = settings.ui;
const folded = new Set(ui.folded ?? ["todo", "company", "usage", "orch"]);
const appEl = $("app") as HTMLElement;
// Panel widths: you drag the inner edge of the sidebar or the chat. Small windows shrink the chat first, then
// the sidebar, so the office always keeps room.
const SIDE = { min: 240, max: 560, def: 340, rail: 64 }, CHAT = { min: 340, max: 760, tab: 64 }, SCENE_MIN = 380;
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
const applyLayout = () => {
  const w = widths();
  chat.finishShelf();
  if (!appEl.classList.contains("rail-moving")) appEl.style.setProperty("--side", `${w.side}px`);
  appEl.style.setProperty("--chat", `${w.chat}px`);
  appEl.classList.toggle("chat-folded", chat.collapsed);
  for (const [g, v, lo, hi] of [[sideGrip, w.side, SIDE.min, SIDE.max], [chatGrip, w.chat, CHAT.min, CHAT.max]] as const) {
    g.setAttribute("aria-valuenow", String(Math.round(v))); g.setAttribute("aria-valuemin", String(lo)); g.setAttribute("aria-valuemax", String(hi));
  }
};
// Commit the column once. The real shelf and camera glide together on the compositor.
const slideChat = (animate: boolean) => {
  const to = widths().chat;
  world.resizeForShelf(() => {
    appEl.classList.toggle("chat-folded", chat.collapsed);
    appEl.style.setProperty("--chat", `${to}px`);
    chatGrip.setAttribute("aria-valuenow", String(Math.round(to)));
  }, animate);
  if (animate) gameSound.play("switch");
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
    chat.finishShelf(); world.stopCameraMotion();
    e.preventDefault();
    try { g.setPointerCapture(e.pointerId); } catch { /* window listeners keep the resize usable */ }
    const x0 = e.clientX, w0 = now();
    g.classList.add("grabbing");
    document.body.classList.add("col-resizing");
    const move = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) set(w0 + dir * (ev.clientX - x0)); };
    let ended = false;
    const up = () => {
      if (ended) return;
      ended = true;
      g.classList.remove("grabbing");
      document.body.classList.remove("col-resizing");
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); window.removeEventListener("blur", up);
      window.removeEventListener("keydown", escape, true); g.removeEventListener("lostpointercapture", up);
      if (g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId);
      saveSettings();
    };
    const escape = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); set(w0); up(); } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); window.addEventListener("blur", up);
    window.addEventListener("keydown", escape, true); g.addEventListener("lostpointercapture", up);
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
// Auto-hide: the sidebar stays folded into its rail and slides over the office while you hover
// the left edge. The pin in its header switches between that and keeping it open.
const sidePanel = $("side-panel");
const sideOpenWidth = () => Math.min(clampTo(ui.sideW ?? SIDE.def, SIDE.min, SIDE.max), Math.max(SIDE.min, innerWidth - widths().chat - 120));
const sidePeek = new EdgePeek({
  side: "left",
  panel: sidePanel,
  riders: () => [...document.querySelectorAll<HTMLElement>("#app > .side-limits")],
  edge: () => $("side-rail"),
  width: sideOpenWidth,
  reveal: () => { sidePanel.hidden = false; sidePanel.scrollTop = Number(sidePanel.dataset.scroll || 0); },
  conceal: () => { sidePanel.dataset.scroll = String(sidePanel.scrollTop); sidePanel.hidden = true; },
  busy: () => !!document.querySelector(".pop-menu, .dialog-wrap:not(.closing)") || document.body.classList.contains("th-dragging") || document.body.classList.contains("col-resizing"),
  onChange: (shown) => { $("rail-show").setAttribute("aria-expanded", String(shown)); $("side-hide").setAttribute("aria-expanded", String(shown)); },
});
const paintSidePin = () => paintPin($("side-pin"), !ui.sideAuto, "sidebar", "left");
const setSideAuto = (on: boolean) => {
  if (on === !!ui.sideAuto) return;
  ui.sideAuto = on;
  appEl.classList.toggle("side-auto", on);
  paintSidePin();
  if (on) { if (!ui.rail) foldRail(true); sidePeek.setEnabled(true); return; }
  if (!sidePeek.shown) { sidePeek.setEnabled(false); foldRail(false); return; }
  // Pinned while it peeks: it holds still and the office makes room beside it.
  const to = sideOpenWidth();
  sidePeek.release(); sidePeek.setEnabled(false);
  ui.rail = false;
  $("side-rail").hidden = true; sidePanel.hidden = false; appEl.classList.remove("railed");
  $("side-hide").setAttribute("aria-expanded", "true"); $("rail-show").setAttribute("aria-expanded", "true");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { applyLayout(); return; }
  appEl.classList.add("rail-moving");
  gsap.fromTo(appEl, { "--side": `${SIDE.rail}px` }, { "--side": `${to}px`, duration: 0.3, ease: "power3.out", onComplete: () => { appEl.classList.remove("rail-moving"); applyLayout(); } });
};
const toggleRail = (on: boolean, animate = true) => {
  if (ui.sideAuto) { if (on) sidePeek.hide(animate); else sidePeek.show(animate); return; }
  foldRail(on, animate);
};
const foldRail = (on: boolean, animate = true) => {
  ui.rail = on;
  $("side-hide").setAttribute("aria-expanded", String(!on));
  $("rail-show").setAttribute("aria-expanded", String(!on));
  if (on) renderRail();
  const hadFocus = document.activeElement === $("side-hide") || document.activeElement === $("rail-show");
  appEl.classList.add("rail-moving");
  setRail(on, { app: appEl, panel: $("side-panel"), rail: $("side-rail"), animate, wide: () => widths().side, done: () => { appEl.classList.remove("rail-moving"); applyLayout(); if (hadFocus) $(on ? "rail-show" : "side-hide").focus(); } });
};
$("side-hide").addEventListener("click", () => { toggleRail(true); saveSettings(); });
$("rail-show").addEventListener("click", () => { if (ui.sideAuto) sidePeek.toggle(); else toggleRail(false); saveSettings(); });
$("side-pin").addEventListener("click", () => { setSideAuto(!ui.sideAuto); gameSound.play("clip"); saveSettings(); });
paintSidePin();
// Linux pastes the selection clipboard on a middle click. You pan the office with the middle
// button, so that paste would land in the focused chat box. Only a middle click inside a text
// field itself still pastes there.
{
  let middleAt = -1e9, middleTarget: Node | null = null, keyPasteAt = -1e9;
  window.addEventListener("keydown", (e) => {
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") || (e.shiftKey && e.key === "Insert")) keyPasteAt = performance.now();
  }, true);
  const editable = (n: EventTarget | null) => n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA)$/.test(n.tagName));
  for (const type of ["mousedown", "mouseup", "auxclick"] as const) window.addEventListener(type, (e) => {
    if (e.button !== 1) return;
    middleAt = performance.now(); middleTarget = e.target as Node;
    if (!editable(e.target)) e.preventDefault();
  }, true);
  window.addEventListener("paste", (e) => {
    if (performance.now() - middleAt > 800 || performance.now() - keyPasteAt < 300) return;
    const into = e.target as Node | null;
    if (into && middleTarget && (into === middleTarget || into.contains(middleTarget))) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
}
window.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  const mod = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey, key = e.key.toLowerCase();
  if (mod && key === "b") { e.preventDefault(); if (ui.sideAuto) sidePeek.toggle(); else toggleRail(!ui.rail); saveSettings(); return; }
  // Shortcuts that open something stay quiet while another dialog has the keyboard.
  if (document.querySelector(".dialog-wrap:not(.closing), .pop-menu")) return;
  if (mod && key === "n") { e.preventDefault(); startNewTask(); return; }
  if (mod && key === "k") { e.preventDefault(); findThread(); return; }
  if (mod && key === "j") { e.preventDefault(); nextNeedingYou(); return; }
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e) && !isShortcutHelpOpen()) { e.preventDefault(); openShortcutHelp(); }
});
if (ui.sideAuto) { ui.sideAuto = false; foldRail(true, false); setSideAuto(true); }
else if (ui.rail) toggleRail(true, false);
chat.setCollapsed(true, false);
applyLayout();
chat.onCollapse = (on, animate) => { ui.chatTab = on; saveSettings(); slideChat(animate); };
// While auto-hiding, the chat slides out at the width you gave it, leaving some office visible.
chat.peekWidth = () => Math.min(clampTo(ui.chatW ?? chatDefault(), CHAT.min, CHAT.max), Math.max(CHAT.min, innerWidth - widths().side - 120));
if (ui.chatAuto) chat.setAutoHide(true, false);
chat.onAutoHide = (on) => { ui.chatAuto = on; appEl.classList.toggle("chat-auto", on); saveSettings(); };
appEl.classList.toggle("chat-auto", !!ui.chatAuto);
mountMobileShell(appEl, chat);
let settingsWriteFlight = Promise.resolve();
const saveSettings = () => {
  settings.buildingLayouts = world.exportLayouts();
  const local = settings.buildingLayouts.local;
  if (local) Object.assign(settings, local);
  const json = JSON.stringify(settings);
  const write = settingsWriteFlight.then(() => api.settingsSave(json));
  settingsWriteFlight = write.catch(() => {});
  renderHidden();
  return write;
};
installCompanionOwner({
  snapshot: () => ({ settings: JSON.stringify(settings), roster: JSON.stringify(world.roster.robots) }),
  apply: async (kind, json) => {
    if (kind === 'roster') {
      world.roster.replaceSnapshot(json);
      await (api as any).rosterSave(JSON.stringify(world.roster.robots));
    } else {
      const next = JSON.parse(json);
      next.ui = settings.ui;
      for (const key of Object.keys(settings)) delete (settings as any)[key];
      Object.assign(settings, next);
      world.hidden = new Set(settings.hidden ?? []);
      world.roomOrder = settings.roomOrder ?? [];
      world.expandedRooms = new Set(settings.expandedRooms ?? []);
      world.collapsedRooms = new Set(settings.collapsedRooms ?? []);
      world.extra = new Map(Object.entries(settings.extra ?? {}));
      world.themes = new Map(Object.entries(settings.themes ?? {}));
      world.homes = new Map(Object.entries(settings.homes ?? {}));
      world.seats = new Map(Object.entries(settings.seats ?? {}));
      world.restoreLayouts(settings.buildingLayouts ?? {});
      await saveSettings();
    }
    await refresh();
  },
  hire: async input => {
    if (typeof input.threadId !== 'string' || typeof input.provider !== 'string' || typeof input.room !== 'string' || !Number.isInteger(input.index) || input.index < 0 || input.index > 1000) throw Error('The desk assignment is invalid.');
    const latest = input.sourceWorld ?? await api.world();
    const thread = latest.threads.find(t => t.id === input.threadId);
    if (!thread || thread.settled) throw Error('This thread is no longer available. Refresh and try again.');
    const project = latest.projects.find(p => p.id === thread.projectId);
    if (!project) throw Error('This project is no longer available.');
    if (!(input.room === `p:${thread.projectId}` || input.room === 'main' || input.room === 'freelance' && project.scratch)) throw Error('This task belongs to another project office.');
    if (input.robotId) {
      const robot = world.roster.robots.find(r => r.id === input.robotId);
      if (!robot || robot.threadId && robot.threadId !== input.threadId && !latest.threads.some(t => t.id === robot.threadId && t.settled && !t.pinned)) throw Error('That robot is no longer free. Choose another candidate.');
    }
    world.roster.assignRobot(input.threadId, input.robotId, thread.provider, input.role, thread.model ?? input.model, input.resuming);
    world.homes.set(input.threadId, input.room);
    const seats = world.seats.get(input.room) ?? [];
    const occupied = seats[input.index];
    const index = occupied && occupied !== input.threadId ? seats.indexOf(null) >= 0 ? seats.indexOf(null) : seats.length : input.index;
    const reserved = [...seats];
    while (reserved.length <= index) reserved.push(null);
    const previous = reserved.indexOf(input.threadId);
    if (previous >= 0 && previous !== index) reserved[previous] = null;
    reserved[index] = input.threadId;
    world.extra.set(input.room, remainingDeskExtras(seats, reserved, world.extra.get(input.room) ?? 0));
    world.seats.set(input.room, reserved);
    if (world.lastData?.environmentId === latest.environmentId) world.pendingSeat = { room: input.room, index, threadId: input.threadId };
    await (api as any).rosterSave(JSON.stringify(world.roster.robots));
    await saveSettings();
    await refresh();
  },
});
world.onLayoutChange = saveSettings;
world.onRoomOrder = () => { saveSettings(); world.onRooms(world.rooms); };
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
dailyWriter = new DailyWriter(world, () => settings.dailyLines ?? {}, s => { settings.dailyLines = s; saveSettings(); });
orch.onChange = () => {
  renderOrch();
  if (!document.hidden) renderThreads();
  if (!document.hidden && !currentEnvironment && chat.threadId && chat.threadId !== settings.orch?.threadId) chat.setSourceReport(latestSourceReport(orch.papers, chat.threadId));
};
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
  world.orchPresence = s?.paused ? (s.presence === "away" ? "away" : "sleep") : "awake";
  (world.ext.queue as QuestionLine | undefined)?.setPresence(world.orchPresence);
  const power = $<HTMLInputElement>("orch-power-toggle");
  power.disabled = !s || companionClient();
  power.checked = !!s && !s.paused;
  $("orch-power-status").textContent = !s ? "Not hired" : s.paused ? "Off" : "On";
  $("orch-controls-open").textContent = s ? "Settings" : "Set up";
  const body = $("orch-body");
  if (companionClient()) {
    power.title = 'Change automatic supervision on the computer.';
    $("orch-controls-open").setAttribute('disabled', '');
    $("orch-controls-open").title = 'Change automatic supervision on the computer.';
    if (!body.querySelector('#orch-archive')) {
      body.innerHTML = '<p class="hint">Automatic supervision runs on the computer.</p><button type="button" class="ghost" id="orch-archive">Settlement papers</button>';
      $("orch-archive").addEventListener('click', () => void showReportArchive(openThread));
    }
    return;
  }
  if (!s) {
    body.innerHTML = `<p class="hint">Your stand-in: it learns how you like things done from what you tell robots, and can review their finished work for you.</p><button type="button" class="primary" id="orch-hire">Hire the orchestrator</button><button type="button" class="ghost" id="orch-archive">Settlement papers</button><p class="form-msg" id="orch-msg" role="status"></p>`;
    $("orch-archive").addEventListener("click", () => void showReportArchive(openThread));
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
    <label class="switch"><input type="checkbox" id="orch-paused" ${s.paused ? "checked" : ""}><span class="track" aria-hidden="true"><i></i></span><span>Pause automatic review and answers</span></label>
    <p class="hint">Pausing holds new reports for you. Reviews already sent may still finish.</p>
    <div id="orch-reports"></div>
    <p class="orch-line">Learned from <b>${s.learned}</b> of your messages</p>
    <p class="orch-line">Answered <b>${log.auto}</b> ${log.auto === 1 ? "question" : "questions"} for you, asked you <b>${log.asked}</b></p>
    <label class="switch"><input type="checkbox" id="orch-auto" ${s.auto !== false ? "checked" : ""}><span class="track" aria-hidden="true"><i></i></span><span>Handle questions and approvals for me</span></label>
    <label class="switch"><input type="checkbox" id="orch-review" ${s.review ? "checked" : ""}><span class="track" aria-hidden="true"><i></i></span><span>Review finished work for me</span></label>
    <div class="orch-actions"><button type="button" class="ghost" id="orch-archive">Settlement papers</button><button type="button" class="ghost" id="orch-chat">Chat with orchestrator</button><button type="button" class="ghost" id="orch-decisions">Recent decisions</button><button type="button" class="ghost" id="orch-notes">Read its notebook</button><button type="button" class="ghost" id="orch-desk">Go to its chair</button></div>`;
  $<HTMLInputElement>("orch-review").addEventListener("change", (e) => orch.setReview((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>("orch-auto").addEventListener("change", (e) => { if (settings.orch) { settings.orch = { ...settings.orch, auto: (e.target as HTMLInputElement).checked }; saveSettings(); } });
  $<HTMLInputElement>("orch-paused").addEventListener("change", e => orch.setPaused((e.target as HTMLInputElement).checked));
  const reports = $("orch-reports");
  for (const [id, report] of world.reports) {
    const row = document.createElement("p");
    const open = document.createElement("button");
    open.type = "button"; open.className = "ghost";
    const paper = orch.papers.find(p => p.threadId === id);
    const status = paper?.status === "reviewing" ? "Under review" : paper?.status === "manual-review" ? "Needs your review" : report.arrived ? "Awaiting review" : "Printing / delivering";
    open.textContent = `${report.title}: ${status}`;
    open.addEventListener("click", () => void showReport(id, report.title, () => openThread(id), undefined, openThread));
    row.appendChild(open); reports.appendChild(row);
  }
  if (!world.reports.size) reports.textContent = "No reports waiting.";
  $("orch-archive").addEventListener("click", () => void showReportArchive(openThread));
  $("orch-chat").addEventListener("click", () => openThread(s.threadId));
  $("orch-decisions").addEventListener("click", () => showDecisions(delegate, (v) => { if (settings.orch) { settings.orch = { ...settings.orch, threshold: v }; saveSettings(); } }));
  $("orch-notes").addEventListener("click", () => void orch.showNotebook());
  // it sits in the boss chair in the questions room: follow it there (or its desk, if it has one)
  $("orch-desk").addEventListener("click", () => {
    openThread(s.threadId);
  });
}
renderOrch();
$("orch-power-toggle").addEventListener("change", e => {
  const enabled = (e.target as HTMLInputElement).checked;
  orch.setPresence(enabled ? "awake" : "sleep");
});
$("orch-controls-open").addEventListener("click",()=>openOrchestratorControls(orch,()=>settings.orch??null,
  ()=>void showReportArchive(openThread),()=>{folded.delete("orch");foldSection("orch",true,false);$("orch-body").scrollIntoView({block:"nearest"});$("orch-hire")?.focus();},()=>takeChair()));
// You in the orchestrator's chair: the AI orchestrator rests until you leave.
let inChair = false;
function takeChair() {
  if (inChair || !settings.orch || currentEnvironment || companionClient()) return;
  inChair = true;
  const before = settings.orch.paused ? settings.orch.presence ?? "sleep" : "awake";
  orch.setPresence("away");
  openChair({
    papers: () => orch.papers,
    refresh: async () => { orch.papers = await (api as any).reportsList(); return orch.papers; },
    robotFor: p => world.roster.robots.find(r => r.id === p.robot?.id) ?? world.roster.byThread(p.threadId),
    decide: async (p, action, values) => { await (api as any).reportsManual(p.id, action, values); orch.papers = await (api as any).reportsList(); void refresh(); },
    openChat: id => world.onSelectThread(id),
    onLeave: () => { inChair = false; if (settings.orch) orch.setPresence(before); },
  });
}

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
  gameSound.play('level');
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
// Start the first refresh after all controls and state below are initialized.
setInterval(() => { if (!companionClient() || !document.hidden) void refresh(); }, 3000);
checkUpdate();
setInterval(() => { if (!document.hidden) void checkUpdate(); }, 60 * 1000);

// tokens, plan limits and cost from the harness logs
// Coins: the robots' API-priced spend pays for things in the shop.
const wallet = new Wallet(() => settings.wallet, (s) => { if (!companionClient()) { settings.wallet = s; saveSettings(); } });
walletReady = wallet;
const soundButton = $('game-sound');
const terribleSongButton = document.querySelector<HTMLButtonElement>('#terrible-song')!;
const paintTerribleSong = () => {
  const state = gameSound.musicState;
  terribleSongButton.disabled = !state.song;
  terribleSongButton.textContent = state.terrible ? 'Unmark terrible song' : 'Mark song terrible';
  terribleSongButton.setAttribute('aria-pressed', String(state.terrible));
  terribleSongButton.title = state.song ? `${state.terrible ? 'Unmark' : 'Mark'} ${state.song.title} as terrible` : 'No song selected';
};
gameSound.subscribeMusic(paintTerribleSong);
terribleSongButton.addEventListener('click', () => { gameSound.toggleTerribleSong(); gameSound.play('switch'); });
const paintSound = () => { soundButton.textContent = gameSound.enabled ? 'Sound on' : 'Sound off'; soundButton.setAttribute('aria-pressed', String(gameSound.enabled)); soundButton.title = gameSound.enabled ? 'Mute game sounds' : 'Enable game sounds'; };
paintSound();
soundButton.addEventListener('click', () => { gameSound.configure(!gameSound.enabled); paintSound(); if (gameSound.enabled) gameSound.play('open'); });
const volumeControl = document.createElement('label'); volumeControl.className = 'game-volume';
volumeControl.innerHTML = '<span>Sound volume</span><input type="range" min="0" max="100" step="5" aria-label="Game sound volume">';
const volumeSlider = volumeControl.querySelector('input')!; volumeSlider.value = String(gameSound.volume * 100);
volumeSlider.addEventListener('input', () => gameSound.configure(gameSound.enabled, Number(volumeSlider.value) / 100));
volumeSlider.addEventListener('change', () => gameSound.play('collect'));
extrasBody.append(volumeControl);
for (const [kind, label, value] of [
  ['theme', 'Theme music', gameSound.themeVolume],
  ['ambience', 'Room ambience', gameSound.ambienceVolume],
] as const) {
  const control = document.createElement('label'); control.className = 'game-volume';
  const text = document.createElement('span'); text.textContent = label;
  const slider = document.createElement('input'); slider.type = 'range';
  slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.value = String(Math.round(value * 100));
  slider.setAttribute('aria-label', `${label} volume`);
  slider.addEventListener('input', () => gameSound.configureBackground(kind, Number(slider.value) / 100));
  control.append(text, slider); extrasBody.append(control);
}
mountMusicControls(extrasBody);
let bankAmount = wallet.balance;
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
wallet.onDaily = celebrateDailyReward;
(window as any).__dailyReward = wallet.onDaily; // visual-only fixture; does not award coins
window.setTimeout(() => { if (lastShipped) checkMilestones(lastShipped); }, 0);
world.owns = (key) => wallet.owns(key);
const paintWallet = (gained = 0) => {
  const b = $("wl-bal");
  b.textContent = formatCoins(wallet.balance);
  const bank = $('coin-bank-bal'), target = { value: bankAmount };
  gsap.killTweensOf(bank);
  const bankAnimation = (bank as any).__count as gsap.core.Tween | undefined; bankAnimation?.kill();
  if (gained > 0 && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Count up while the collected coins land on the counter (coin-rewards.ts fly).
    (bank as any).__count = gsap.to(target, { value: wallet.balance, delay: .5, duration: .7, ease: 'power1.inOut', onUpdate: () => { bank.textContent = formatCoins(target.value); bankAmount = target.value; } });
  } else { bankAmount = wallet.balance; bank.textContent = formatCoins(bankAmount); }
  $('coin-bank').title = `${formatCoins(wallet.balance)} coins. Open shop`;
  const rb = $("rail-bal"), n = wallet.balance;
  rb.textContent = n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : formatCoins(n);
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
const goShopping = () => {
  if (companionClient()) { void confirmDialog('Office shop', 'Collect coins and decorate your office on the computer.', 'OK'); return; }
  void openShop({ wallet, level: world.level,
    rooms: () => world.rooms.filter(r => r.id === "main" || r.id.startsWith("p:")).map(r => ({
      id: r.id, title: r.title, theme: world.themes.get(r.id) ?? {},
      desks: [...document.querySelectorAll<HTMLElement>(".desk-unit[data-slot]")].filter(d => d.dataset.slot?.split("#")[0] === r.id).map(d => ({ id: d.dataset.slot!, title: `Desk ${Number(d.dataset.slot!.split("#")[1]) + 1}` })),
    })),
    onEquip: async (id, theme) => {
      const before = world.themes.get(id);
      world.themes.set(id, theme);
      try { await saveSettings(); await refresh(); }
      catch (e) { if (before) world.themes.set(id, before); else world.themes.delete(id); throw e; }
    },
    onBought: async () => { await saveSettings(); shopFront.render(); },
  }).catch(() => { void confirmDialog("Store unavailable", "Could not open the store. Please try again.", "OK"); });
};
$("open-shop").addEventListener("click", goShopping);
$("rail-coins").addEventListener("click", goShopping);
$("coin-bank").addEventListener("click", goShopping);
// the shop is also a real building next to the office
const shopFront = new ShopFront(document.createElement("div"), wallet, () => world.level);
shopFront.onOpen = goShopping;
world.attachShop(shopFront);
wallet.onChange = (_bal, gained) => { paintWallet(gained); shopFront.render(); window.dispatchEvent(new Event("lucid:wallet-change")); };
$("shop-link").addEventListener("click", goShopping);
if (!companionClient()) coinRewards = new CoinRewards(wallet, world, () => (api as any).coinUsage(), { ready: id => coinReady(id), collected: id => coinCollected(id).then(() => refresh()) });
(window as any).__coinRewards = coinRewards;
(window as any).__wallet = wallet;
(window as any).__gameSound = gameSound;
const soundscape = new OfficeSoundscape(world);
(window as any).__soundscape = soundscape;
mountStats(document.getElementById("usage-body")!, async () => {
  const u = await (window as any).lucid.usage();
  world.setUsage(u);
  if (u?.windows && !companionClient()) wallet.observe(u);
  return u;
}, { background: true });
// Limits retains the real usage owner, but has its own saved disclosure on every layout.
mountLimitsSection($("side-panel"), $("usage-body"), !folded.has("limits"));

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
function openDetachedChat(id: string, info?: ThreadInfo) {
  world.revealThread(id);
  const t = world.lastData?.threads.find((x) => x.id === id);
  if (!t) {
    // Saved papers outlive the active office list, including archived source threads.
    void (api as any).threadInfo(id).then((historical: ThreadInfo | null) => {
      if (!historical) return;
      chat.open({ threadId: id, info: historical, profile: world.roster.byThread(id) } as any, false);
      chat.setStatus("Thread history", "idle");
    }).catch((err: unknown) => console.error("Could not open saved source thread", err));
    return;
  }
  const profile = world.roster.byThread(id);
  chat.open({ threadId: id, info: info ?? { id, title: t.title, provider: t.provider }, profile: id === world.orchThread ? { ...profile, name: "Orchestrator" } : profile } as any, !info);
  chat.setThreadStatus(operationalStatus(t));
}
world.onFollowChat = (id) => {
  const d = world.deskFor(id);
  if (d && !d.el.classList.contains("arriving")) { world.focusOn(d); return; }
  openDetachedChat(id);
};

// A walking robot clicked while a chat is open: the chat follows to that robot, the camera follows its walk
world.onWatchChat = (id) => {
  world.revealThread(id);
  const d = world.deskFor(id);
  if (d && !d.el.classList.contains("arriving")) { chat.open(d); chat.setView("desk"); pushStatus(d); return; }
  world.onFollowChat(id);
};

// A robot waiting for your answer: its chat opens with the answer card focused. At its desk if it
// has one, otherwise beside the questions room where it waits in line.
const needsAnswer = (id: string) => !!world.lastData?.threads.find((t) => t.id === id)?.question;
function openAnswer(id: string) {
  world.revealThread(id);
  const d = world.deskFor(id);
  if (d && !d.el.classList.contains("arriving")) world.focusOn(d);
  else {
    world.stopFollow();
    const room = world.rooms.find((r) => r.kind === "queue");
    if (room) world.showRoom(room.id);
    world.onFollowChat(id);
    paintSelectedStatus();
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
const sidebarCollectErrors = new Map<string, string>();
let settledOpen = false;
// The Managers group: pinned threads shown as their robots, with profile pictures.
const managerPictures = new Map<string, string>();
let managersTween: gsap.core.Tween | null = null;
let managersJustOpened = false;
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let settledLimit = 10;
let threadMovePending = false;
async function moveThread(id: string, targetId: string, after: boolean) {
  if (threadMovePending) return;
  threadMovePending = true;
  try {
    await (window as any).lucidT3.moveThread({ threadId: id, targetId, after });
    await refresh();
    renderThreads(true);
    $("th-list").querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  } catch (err: any) {
    showMenu(24, 100, "Could not move thread", [{ label: String(err?.message || err), run: () => {} }]);
  } finally { threadMovePending = false; }
}
function threadNeighbors(id: string) {
  const all = world.lastData?.threads ?? [], t = all.find(t => t.id === id);
  const group = t && !t.settled ? all.filter(x => !x.settled && x.pinned === t.pinned) : [];
  const index = group.findIndex(x => x.id === id);
  return { previous: group[index - 1], next: group[index + 1] };
}
// While the pointer is over the list, new or reordered rows wait, so a row never moves away
// just as it is clicked. Status text still updates in place. Leaving the list applies them.
let listHeld = false, heldOrder = "", listDeferred = false;
for (const box of [$("th-list"), $("rail-list")]) {
  box.addEventListener("pointerenter", () => { listHeld = true; });
  box.addEventListener("pointerleave", () => { listHeld = false; if (listDeferred) { listDeferred = false; renderThreads(); } });
}
// T3 Code's server search (titles, message text, older settled threads), debounced while typing.
const fold = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const searchState = { q: "", matches: new Map<string, { snippet: string; quality: number | null }>(), older: [] as { id: string; title: string; projectId: string | null; updatedAt: string; provider: string; settled: boolean }[] };
let searchTimer = 0, searchSeq = 0;
function runThreadSearch(q: string) {
  window.clearTimeout(searchTimer);
  const seq = ++searchSeq;
  if (q.length < 2 || companionClient() || currentEnvironment) { searchState.q = ""; searchState.matches.clear(); searchState.older = []; return; }
  searchTimer = window.setTimeout(async () => {
    try {
      const r = await (window as any).lucidT3.searchThreads(q);
      if (seq !== searchSeq) return;   // a newer query is on its way
      const best = new Map<string, { snippet: string; quality: number | null }>();
      for (const m of r?.matches ?? []) { const prev = best.get(m.threadId); if (!prev || (m.quality ?? 0) > (prev.quality ?? 0)) best.set(m.threadId, { snippet: m.snippet, quality: m.quality }); }
      searchState.q = q; searchState.matches = best; searchState.older = r?.threads ?? [];
      renderThreads(true);
    } catch { /* titles still filter locally */ }
  }, 180);
}
function renderThreads(force = false) {
  if (appEl.classList.contains('mobile-layout') && appEl.dataset.mobileView !== 'threads') return;
  const data = world.lastData;
  if (!data || document.body.classList.contains("th-dragging")) return;   // never swap rows out from under a drag
  const started = beginSystem();
  renderRail();
  paintSelectedStatus();
  const q = (($("th-q") as HTMLInputElement).value || "").trim().toLowerCase();
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  // The bridge supplies T3 Code's sidebar order, independent of live activity.
  // Search like T3 Code: every typed word must appear (case and accents folded) in the title,
  // project, role or branch; T3's own search adds message matches and older settled threads.
  const words = fold(q).split(/\s+/).filter(Boolean);
  const remote = !!q && searchState.q === q;
  const known = new Set(data.threads.map((t) => t.id));
  const older = remote ? searchState.older.filter((t) => !known.has(t.id)).map((t) => ({ ...t, projectId: t.projectId ?? "", runStatus: null, pinned: false, question: null, model: null }) as unknown as typeof data.threads[number]) : [];
  const titleHit = (t: typeof data.threads[number]) => { const hay = fold([t.title, t.manager?.role, projects.get(t.manager?.projectId || t.projectId)?.title, t.branch].filter(Boolean).join(" ")); return words.every((w) => hay.includes(w)); };
  const list = [...data.threads, ...older].filter((t) => !q || titleHit(t) || (remote && searchState.matches.has(t.id)));
  if (q) list.sort((a, b) => Number(!titleHit(a)) - Number(!titleHit(b)) || (titleHit(a) ? 0 : (searchState.matches.get(b.id)?.quality ?? 0) - (searchState.matches.get(a.id)?.quality ?? 0)));
  const snippetOf = (t: typeof data.threads[number]) => q && remote && !titleHit(t) ? searchState.matches.get(t.id)?.snippet ?? "" : "";
  let active = q ? list.filter((t) => !t.settled) : completionFirst(list.filter((t) => !t.settled));
  const settled = list.filter((t) => t.settled);
  const reviews = latestThreadReviews(currentEnvironment ? [] : orch.papers);
  const reviewOf = (t: typeof list[number]) => threadReviewLabel(t, reviews.get(t.id), !currentEnvironment && !!settings.orch && t.id !== settings.orch.threadId);
  const presentationOf = (t: typeof list[number]) => threadState(t, reviewOf(t), delegate.phaseOf(t.id) === "reading");
  const stateOf = (t: typeof list[number]) => {
    const state = presentationOf(t);
    return state.tone ? statusBadge(state.tone, { detail: state.detail, suffix: state.since ? ago(state.since) : "", cls: "th-st", size: 13 }) : `<span class="th-ago" title="${esc(state.detail || "")}">${ago(t.updatedAt)}</span>`;
  };
  const dotOf = (t: typeof list[number]) => presentationOf(t).tone;
  const statusAttr = (t: typeof list[number]) => { const s = dotOf(t); return s ? ` data-status="${s}"` : ""; };
  const faceOf = (t: typeof list[number], size: number, place: string, cls = "") => {
    const robot = world.roster.byThread(t.id);
    return managerFace({ provider: robot?.provider || t.provider, look: world.lookFor(t, robot?.look), picture: t.manager?.avatar, size, place, cls });
  };
  // Managers are persistent project conversations, presented like the other chats.
  const managerRow = (t: typeof list[number]) => {
    const p = projects.get(t.manager?.projectId || t.projectId);
    const proj = !p || p.scratch ? "No project" : p.title;
    const role = t.manager?.role || (t.id === world.orchThread ? "Orchestrator" : "Manager");
    const icon = p && !p.scratch ? (p.icon ? `<img src="${esc(p.icon)}" alt="">` : `<span class="th-mono">${esc(proj.slice(0, 2).toUpperCase())}</span>`) : `<span class="th-none"></span>`;
    const state = stateOf(t);
    const sel = t.id === chat.threadId ? " sel" : "";
    return `<li class="mg-li"><button type="button" class="th-row th-worker th-t3 mg-row${t.runStatus === "running" ? " on" : ""}${sel}" data-state="${dotOf(t)}" data-id="${esc(t.id)}" title="${esc([`${proj} · ${role}`, t.title, t.model, t.branch].filter(Boolean).join("\n"))}">
      <span class="th-text">
        <span class="th-top">${icon}<span class="th-proj">${esc(proj)} · ${esc(role)}</span>${state}</span>
        <span class="th-title">${esc(t.title || "Untitled")}</span>
      </span>
    </button></li>`;
  };
  const managers = active.filter((t) => t.pinned);
  const managersOpen = !folded.has("managers") || !!q;
  const strip = managers.slice(0, 6).map((t) => `<span class="mg-chip">${faceOf(t, 24, "s")}${dotOf(t) ? `<i class="rail-st ${dotOf(t)}"></i>` : ""}</span>`).join("")
    + (managers.length > 6 ? `<span class="mg-more">+${managers.length - 6}</span>` : "");
  const waiting = managers.filter((t) => t.question).length;
  const managersHtml = managers.length ? `<li class="mg-sec"><button type="button" class="th-settled-toggle mg-toggle" aria-expanded="${managersOpen}" aria-controls="mg-list"><span>Managers</span>${managersOpen ? "" : `<span class="mg-strip" aria-hidden="true">${strip}</span>${waiting ? `<span class="sr-only">, ${waiting} waiting for you</span>` : ""}`}<span class="th-settled-count">${managers.length}</span><span aria-hidden="true">${managersOpen ? "⌄" : "›"}</span></button>${managersOpen ? `<ol id="mg-list" class="mg-list">${managers.map(managerRow).join("")}</ol>` : ""}</li>` : "";
  const row = (t: typeof list[number]) => {
    const p = projects.get(t.manager?.projectId || t.projectId);
    const proj = !p || p.scratch ? "No project" : p.title;
    const icon = p && !p.scratch ? (p.icon ? `<img src="${esc(p.icon)}" alt="">` : `<span class="th-mono">${esc(proj.slice(0, 2).toUpperCase())}</span>`) : `<span class="th-none"></span>`;
    if (t.settled) return `<li><button type="button" class="th-row th-settled-row" data-id="${esc(t.id)}" title="${esc(`${proj}: ${t.title || "Untitled"}${world.roster.byThread(t.id) ? `
${world.roster.byThread(t.id)!.name}` : ""}`)}">${icon}<span class="th-settled-title">${esc(t.title || "Untitled")}${snippetOf(t) ? `<span class="th-snippet">${esc(snippetOf(t))}</span>` : ""}</span><span class="th-ago">${ago(t.updatedAt)}</span></button></li>`;
    // T3's row, one line each: project (logo and name) with the state, the title, then the
    // worker, model and branch with the harness logo. Nothing wraps; the tooltip has it all.
    const state = stateOf(t);
    const robot = world.roster.byThread(t.id);
    const logo = logoFor(t.provider);
    const where = t.branch || "";
    const ready = collectible(t.id, true);
    const busy = collectingWork.has(t.id);
    const label = ready?.coins ? `Settle & collect ${ready.coins} coins` : 'Settle session';
    const collect = ready ? `<button type="button" class="th-collect" data-collect-id="${esc(t.id)}" title="${esc(label)}" aria-label="${esc(`${label}: ${t.title || 'Untitled'}`)}"${busy ? ' disabled aria-busy="true"' : ''}>${uiIcon("check", 14)} ${busy ? 'Settling…' : 'Settle'}</button>${sidebarCollectErrors.has(t.id) ? `<p class="th-collect-error" role="status">${esc(sidebarCollectErrors.get(t.id)!)}</p>` : ''}` : '';
    const sel = t.id === chat.threadId ? " sel" : "";
    return `<li class="th-entry${ready ? ' th-can-collect' : ''}"><button type="button" class="th-row th-worker th-t3${t.runStatus === "running" ? " on" : ""}${sel}"${statusAttr(t)} data-id="${esc(t.id)}" title="${esc(`${proj}: ${t.title || "Untitled"}${robot ? `
${robot.name}${t.model ? `, ${t.model}` : ""}` : ""}${t.branch ? `
${t.branch}` : ""}`)}">
      <span class="th-text">
        <span class="th-top">${icon}<span class="th-proj">${esc(proj)}</span>${state}</span>
        <span class="th-line"><span class="th-title">${t.pinned ? '<span class="th-pin" aria-label="Pinned">●</span>' : ""}${esc(t.title || "Untitled")}</span>${logo ? `<img class="th-logo" src="${logo}" alt="${esc(harnessName(t.provider))}">` : ""}</span>
        ${where ? `<span class="th-meta"><span class="th-where">${esc(where)}</span></span>` : ""}
        ${snippetOf(t) ? `<span class="th-snippet">${esc(snippetOf(t))}</span>` : ""}
      </span>
    </button>${collect}</li>`;
  };
  const order = active.map(t => t.id).join(" ");
  if (listHeld && !force && heldOrder && order !== heldOrder) {
    listDeferred = true;
    const positions = new Map(heldOrder.split(" ").map((id,i) => [id,i]));
    active = active.filter(t => positions.has(t.id)).sort((a,b) => positions.get(a.id)! - positions.get(b.id)!);
  } else heldOrder = order;
  const expanded = settledOpen || !!q;
  const rows = `<li class="th-active-shell" id="th-active-shell"><ol class="th-active-list" id="th-active-list">${managersHtml}${active.filter((t) => !t.pinned).map(row).join("") || (managersHtml ? "" : '<li class="th-empty">No threads match.</li>')}</ol></li>` + (settled.length ? `<li class="th-settled-section" id="th-settled-section"><button type="button" class="th-settled-toggle" aria-expanded="${expanded}" aria-controls="th-settled-body"><span>Settled</span><span class="th-settled-count">${settled.length}</span><span aria-hidden="true">${expanded ? "⌄" : "›"}</span></button><div id="th-settled-body" class="th-settled-body"${expanded ? "" : " hidden"}><ol id="th-settled-list" class="th-settled-list">${expanded ? settled.slice(0, q ? settled.length : settledLimit).map(row).join("") : ""}</ol>${expanded && !q && settled.length > settledLimit ? `<button type="button" class="th-settled-more">⌄ &nbsp; Show ${Math.min(25, settled.length - settledLimit)} more</button>` : ""}</div></li>` : "");
  const sig = rows + q;
  if (sig === thSig) { endSystem("ui", started); return; }
  thSig = sig;
  const focused = document.activeElement as HTMLElement | null;
  const focusedId = focused?.closest<HTMLElement>(".th-row")?.dataset.id;
  const scrollBox = document.getElementById("th-active-shell") || $("th-list");
  const scrollTop = scrollBox.scrollTop;
  managersTween?.kill(); managersTween = null;
  reconcileThreadList($("th-list"), rows);
  celebratePictures(managers);
  if (managersJustOpened) {
    managersJustOpened = false;
    const list = $("th-list").querySelector<HTMLElement>("#mg-list");
    if (list && !calm()) managersTween = gsap.from(list, { height: 0, opacity: 0, duration: 0.2, ease: "power2.out", clearProps: "height,opacity", onComplete: () => { managersTween = null; } });
  }
  if (focusedId) $("th-list").querySelector<HTMLElement>(`[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
  scrollBox.scrollTop = scrollTop;
  markSelected(chat.threadId);
  endSystem("ui", started);
}
// A manager that changed its own picture gets a small hop, so the change is noticed rather than silent.
function celebratePictures(managers: { id: string; manager?: { avatar?: string | null } }[]) {
  const first = managerPictures.size === 0;
  for (const t of managers) {
    const now = t.manager?.avatar || "";
    const before = managerPictures.get(t.id);
    managerPictures.set(t.id, now);
    if (first || before === undefined || before === now || document.hidden) continue;
    const face = $("th-list").querySelector<HTMLElement>(`[data-id="${CSS.escape(t.id)}"] .mg-face`);
    if (face && !calm()) gsap.fromTo(face, { scale: 0.7, rotation: -8 }, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2.4)", clearProps: "transform" });
    gameSound.play("chirp");
  }
}
function toggleManagers() {
  if (managersTween) return;
  const opening = folded.has("managers");
  if (opening) folded.delete("managers"); else folded.add("managers");
  ui.folded = [...folded]; saveSettings();
  gameSound.play("switch");
  const list = $("th-list").querySelector<HTMLElement>("#mg-list");
  if (!opening && list && !calm()) {
    managersTween = gsap.to(list, { height: 0, opacity: 0, duration: 0.16, ease: "power2.in", onComplete: () => { managersTween = null; renderThreads(true); } });
    return;
  }
  managersJustOpened = opening;
  renderThreads(true);
}
wireFaceFallback($("th-list"));
wireFaceFallback($("rail-list"));
$("th-q").addEventListener("input", () => { renderThreads(true); runThreadSearch((($("th-q") as HTMLInputElement).value || "").trim().toLowerCase()); });
$("th-new-project").addEventListener("click", () => newProject());
// Sampled project colors arrive later: redraw managers in them.
whenProjectColors(() => { if (world.lastData) world.update(world.lastData); thSig = ""; renderThreads(); });
$("th-list").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const collectButton = target.closest<HTMLButtonElement>(".th-collect");
  if (collectButton) {
    const id = collectButton.dataset.collectId!;
    if (collectingWork.has(id) || !collectible(id, true)) return;
    sidebarCollectErrors.delete(id);
    const pending = collectWork(id, collectButton);
    renderThreads(true);
    void pending.catch(error => {
      sidebarCollectErrors.set(id, error instanceof Error ? error.message : String(error));
    }).finally(() => {
      renderThreads(true);
      if (!document.activeElement || document.activeElement === document.body) $("th-q").focus({ preventScroll: true });
    });
    return;
  }
  if (target.closest(".mg-toggle")) { toggleManagers(); return; }
  if (target.closest(".th-settled-toggle")) { settledOpen = !settledOpen; renderThreads(true); return; }
  if (target.closest(".th-settled-more")) { settledLimit += 25; renderThreads(true); return; }
  const b = (e.target as HTMLElement).closest(".th-row") as HTMLElement | null;
  if (b) openThread(b.dataset.id!);
});
$("th-new-task").addEventListener("click", () => startNewTask());
$("side-help").addEventListener("click", () => openShortcutHelp());
const listRows = () => [...$("th-list").querySelectorAll<HTMLElement>(".th-row[data-id]")].filter(r => r.offsetParent);
$("th-q").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); listRows()[0]?.focus(); }
  else if (e.key === "Enter") {
    const first = listRows()[0];
    if (!first) return;
    e.preventDefault();
    // The filter has done its job: the full list comes back once the thread is open.
    (e.target as HTMLInputElement).value = ""; (e.target as HTMLInputElement).blur();
    openThread(first.dataset.id!); renderThreads(true);
  }
  else if (e.key === "Escape" && (e.target as HTMLInputElement).value) { e.preventDefault(); e.stopPropagation(); (e.target as HTMLInputElement).value = ""; renderThreads(true); }
});
$("th-list").addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
  const rows = listRows(), at = rows.indexOf((e.target as HTMLElement).closest(".th-row") as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  if (e.key === "ArrowUp" && at === 0) { ($("th-q") as HTMLInputElement).focus(); return; }
  rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
});
function findThread() {
  if (ui.rail) toggleRail(false, false);
  folded.delete("threads"); ui.folded = [...folded];
  foldSection("threads", true, false);
  const search = $("th-q") as HTMLInputElement;
  search.focus(); search.select();
  saveSettings();
}
// Questions first, then failures, reviews and finished work, in list order after the open chat.
function nextNeedingYou() {
  const threads = (world.lastData?.threads ?? []).filter(t => !t.settled);
  const rank = (t: typeof threads[number]) => t.question ? 0 : (t.lastStatus === "failed" || t.job?.state === "failed") && t.runStatus !== "running" ? 1 : t.unseen && t.lastStatus === "completed" ? 2 : collectible(t.id, true) ? 3 : -1;
  const waiting = threads.filter(t => rank(t) >= 0);
  if (!waiting.length) { gameSound.play("switch"); showMenu(innerWidth / 2 - 120, 80, "Nothing needs you right now", []); return; }
  const best = Math.min(...waiting.map(rank)), group = waiting.filter(t => rank(t) === best);
  const at = group.findIndex(t => t.id === chat.threadId);
  openThread(group[(at + 1) % group.length].id);
}
function newProject() {
  if (companionClient() || currentEnvironment) return;
  const lucid = (window as any).lucid;
  openNewProject({ create: o => lucid.createProject(o), addExisting: o => lucid.addProject(o), pickFolder: () => lucid.pickFolder(), baseFolder: () => lucid.projectsBase() },
    { onDone: () => void refresh() });
}
function markSelected(id: string | null) {
  for (const row of document.querySelectorAll<HTMLElement>("#th-list .th-row[data-id], #rail-list .rail-th[data-id]")) {
    const current = row.dataset.id === id;
    row.classList.toggle(row.classList.contains("rail-th") ? "cur" : "sel", current);
    if (current) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
  }
}

function openThread(id: string) {
  markSelected(id);
  world.revealThread(id);
  if (needsAnswer(id)) { openAnswer(id); return; }
  const d = world.deskFor(id);
  if (d && !d.el.classList.contains("arriving")) {
    world.focusOn(d);
    // Focusing the desk already in focus changes nothing, so the conversation is shown here too.
    if (chat.threadId !== id || chat.collapsed) { chat.open(d); paintChatManager(); chat.setView(world.focusMode); pushStatus(d); }
    return;
  }
  // not at a desk: follow it wherever it is (break room, questions, park, walking)
  const el = document.querySelector(`.world-walker[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
  if (el) {
    world.follow(el);
  }
  // Every real thread can be opened, including the boss in its chair and robots away
  // from their desks. Camera following and chat selection are independent.
  world.onWatchChat(id);
}
setInterval(() => { if (!document.hidden) renderThreads(); }, 3000);
window.addEventListener('lucid:mobile-view', (event) => {
  const detail = (event as CustomEvent<{ mobile: boolean; view: string }>).detail;
  if (!detail?.mobile || detail.view === 'threads') renderThreads();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderThreads(); if (companionClient()) void refresh(); } });
// Defer until module initialization finishes, then make the loaded threads usable.
window.setTimeout(renderThreads, 0);

// The folded sidebar: one button per thread with its harness logo and a dot for its state.
let railSig = "";
function renderRail() {
  const data = world.lastData;
  if (!data || !ui.rail || document.body.classList.contains("th-dragging")) return;
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const list = completionFirst(data.threads).slice(0, 40);
  const reviews = latestThreadReviews(currentEnvironment ? [] : orch.papers);
  const html = list.map((t) => {
    const p = projects.get(t.manager?.projectId || t.projectId);
    const proj = !p || p.scratch ? "No project" : p.title;
    const review = threadReviewLabel(t, reviews.get(t.id), !currentEnvironment && !!settings.orch && t.id !== settings.orch.threadId);
    const { tone: st, label: said } = threadState(t, review, delegate.phaseOf(t.id) === "reading");
    const logo = t.pinned ? p?.icon : logoFor(t.provider);
    const robot = t.pinned ? world.roster.byThread(t.id) : null;
    const name = `${robot ? `${robot.name}, ${t.manager?.role || "Manager"}, ` : ""}${t.title}, ${proj}${said ? `, ${said}` : ""}`;
    return `<li><button type="button" class="rail-th${t.id === chat.threadId ? " cur" : ""}"${st ? ` data-status="${st}"` : ""} data-id="${esc(t.id)}" aria-label="${esc(name)}" title="${esc(`${t.title}
${proj}${said ? ` · ${said[0].toUpperCase()}${said.slice(1)}` : ""}`)}">`
      + (t.pinned ? managerFace({ provider: robot?.provider || t.provider, look: robot?.look, picture: t.manager?.avatar, size: 28, place: "r" })
        : logo ? `<img src="${logo}" alt="">` : `<span class="rail-mono">${esc(proj.slice(0, 2).toUpperCase())}</span>`)
      + (st ? `<i class="rail-st" aria-hidden="true"></i>` : "") + `</button></li>`;
  }).join("");
  if (html === railSig) return;
  railSig = html;
  reconcileThreadList($("rail-list"), html);
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
  hold: (active) => { if (active) world.stopCameraMotion(); world.setLayoutHeld(active); },
  zone: (x, y) => {
    if (companionClient()) return null;
    const button = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-room]");
    const room = button?.dataset.room;
    return room && world.rooms.some((r) => r.id === room && ["main", "project", "freelance"].includes(r.kind)) ? room : world.threadDropZone(x, y);
  },
  preview: (room, id) => world.previewThreadDrop(room, id),
  place: (id, room) => world.placeThread(id, room),
}, {
  target: (id, x, y) => {
    if (threadMovePending || ($("th-q") as HTMLInputElement).value.trim()) return null;
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("#th-list .th-row[data-id]");
    const threads = world.lastData?.threads ?? [];
    const source = threads.find(t => t.id === id), target = threads.find(t => t.id === row?.dataset.id);
    if (!row || !source || !target || source === target || source.settled || target.settled || source.pinned !== target.pinned) return null;
    const after = y > row.getBoundingClientRect().top + row.offsetHeight / 2;
    return { row, after };
  },
  move: (id, targetId, after) => { void moveThread(id, targetId, after); },
});
function referenceInChat(id: string, x: number, y: number) {
  const ref = threadRef(id);
  if (!ref) return;
  if (chat.isOpen && chat.threadId) { chat.addReference(ref); return; }
  showMenu(x, y, "Open a robot's chat to reference this thread", [{ label: "Chat with this thread's robot", run: () => openThread(id) }]);
}
function officeMoveItems(id: string) {
  if (companionClient() || id === world.orchThread) return [];
  const current = world.homes.get(id) ?? world.deskFor(id)?.room;
  return world.rooms.filter(r => ["main", "project", "freelance"].includes(r.kind) && r.id !== current).map(r => ({
    label: `Move to ${r.title}`,
    run: () => { if (world.placeThread(id, r.id)) gameSound.play("switch"); },
  }));
}
function threadMenu(row: HTMLElement, x: number, y: number) {
  const id = row.dataset.id!, ref = threadRef(id);
  if (!ref) return;
  const items = [{ label: "Open", run: () => openThread(id) }];
  const { previous, next } = threadNeighbors(id);
  if (previous) items.push({ label: "Move up (Alt+Up)", run: () => { void moveThread(id, previous.id, false); } });
  if (next) items.push({ label: "Move down (Alt+Down)", run: () => { void moveThread(id, next.id, true); } });
  if (chat.isOpen && chat.threadId && chat.threadId !== id) items.unshift({ label: "Reference in chat (R)", run: () => { chat.addReference(ref); } });
  items.push(...officeMoveItems(id));
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
    if (row && e.altKey && !e.ctrlKey && !e.metaKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const { previous, next } = threadNeighbors(row.dataset.id!);
      const target = e.key === "ArrowUp" ? previous : next;
      if (target) void moveThread(row.dataset.id!, target.id, e.key === "ArrowDown");
      return;
    }
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
  if (companionClient()) return;
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

void refresh();

// Ares studio is explicit about the execution host; existing T3 work keeps screen priority.
document.addEventListener('lucid:studio-preview', event => {
  const d = (event as CustomEvent<{ threadId: string; url: string | null }>).detail;
  if (!d?.threadId) return;
  const desk = world.deskFor(d.threadId);
  if (!desk) return;
  if (d.url) { try { const u = new URL(d.url); if (u.hostname !== '127.0.0.1' || u.pathname !== '/__lucid/studio') return; } catch { return; } }
  void desk.director.watchWebsiteCanvas(d.url).catch(() => {});
});
