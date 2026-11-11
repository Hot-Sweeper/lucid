// The thread list, like T3 Code's sidebar: search, rows, keyboard navigation and the collapsed rail.
import { completionFirst, pinnedFirst, reconcileThreadList } from "../office/thread-list";
import { threadState } from "../office/thread-state";
import { statusBadge } from "../ui/status";
import { icon as uiIcon } from "../ui/icons";
import { gameSound } from "../office/sound";
import { beginSystem, endSystem } from "../perf/metrics";
import { latestThreadReviews, threadReviewLabel } from "../office/thread-review";
import { showMenu } from "../office/menus";
import { openNewProject } from "../office/new-project";
import { logoFor, harnessName } from "../robot";
import { foldSection } from "../office/sidebar";
import { PIN_ICON } from "../office/edge-peek";
import { openShortcutHelp } from "../office/shortcuts";
import { esc, $ } from "./dom";
import type { App } from "./context";
const sidebarCollectErrors = new Map<string, string>();
let settledOpen: boolean = false;
let settledLimit: number = 10;
let searchTimer: number = 0;
let searchSeq = 0;
let listHeld: boolean = false;
let heldOrder: string = "";
const fold = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineThreadSidebar(app: App) {
  app.moveThread = async function moveThread(id: string, targetId: string, after: boolean) {
    if (app.threadMovePending) return;
    app.threadMovePending = true;
    try {
      await (window as any).lucidT3.moveThread({ threadId: id, targetId, after });
      await app.refresh();
      app.renderThreads(true);
      $("th-list").querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    } catch (err: any) {
      showMenu(24, 100, "Could not move thread", [{ label: String(err?.message || err), run: () => {} }]);
    } finally { app.threadMovePending = false; }
  };

  app.threadNeighbors = function threadNeighbors(id: string) {
    const all = app.world.lastData?.threads ?? [], t = all.find(t => t.id === id);
    const group = t && !t.settled ? all.filter(x => !x.settled && x.pinned === t.pinned) : [];
    const index = group.findIndex(x => x.id === id);
    return { previous: group[index - 1], next: group[index + 1] };
  };

  app.runThreadSearch = function runThreadSearch(q: string) {
    window.clearTimeout(searchTimer);
    const seq = ++searchSeq;
    if (q.length < 2 || app.currentEnvironment) { app.searchState.q = ""; app.searchState.matches.clear(); app.searchState.older = []; return; }
    searchTimer = window.setTimeout(async () => {
      try {
        const r = await (window as any).lucidT3.searchThreads(q);
        if (seq !== searchSeq) return;   // a newer query is on its way
        const best = new Map<string, { snippet: string; quality: number | null }>();
        for (const m of r?.matches ?? []) { const prev = best.get(m.threadId); if (!prev || (m.quality ?? 0) > (prev.quality ?? 0)) best.set(m.threadId, { snippet: m.snippet, quality: m.quality }); }
        app.searchState.q = q; app.searchState.matches = best; app.searchState.older = r?.threads ?? [];
        app.renderThreads(true);
      } catch { /* titles still filter locally */ }
    }, 180);
  };

  app.renderThreads = function renderThreads(force = false) {
    const data = app.world.lastData;
    if (!data || document.body.classList.contains("th-dragging")) return;   // never swap rows out from under a drag
    const started = beginSystem();
    app.renderRail();
    app.paintSelectedStatus();
    const q = (($("th-q") as HTMLInputElement).value || "").trim().toLowerCase();
    const projects = new Map(data.projects.map((p) => [p.id, p]));
    // The bridge supplies T3 Code's sidebar order, independent of live activity.
    // Search like T3 Code: every typed word must appear (case and accents folded) in the title,
    // project, role or branch; T3's own search adds message matches and older settled threads.
    const words = fold(q).split(/\s+/).filter(Boolean);
    const remote = !!q && app.searchState.q === q;
    const known = new Set(data.threads.map((t) => t.id));
    const older = remote ? app.searchState.older.filter((t) => !known.has(t.id)).map((t) => ({ ...t, projectId: t.projectId ?? "", runStatus: null, pinned: false, question: null, model: null }) as unknown as typeof data.threads[number]) : [];
    const titleHit = (t: typeof data.threads[number]) => { const hay = fold([t.title, projects.get(t.projectId)?.title, t.branch].filter(Boolean).join(" ")); return words.every((w) => hay.includes(w)); };
    const list = [...data.threads, ...older].filter((t) => !q || titleHit(t) || (remote && app.searchState.matches.has(t.id)));
    if (q) list.sort((a, b) => Number(!titleHit(a)) - Number(!titleHit(b)) || (titleHit(a) ? 0 : (app.searchState.matches.get(b.id)?.quality ?? 0) - (app.searchState.matches.get(a.id)?.quality ?? 0)));
    const snippetOf = (t: typeof data.threads[number]) => q && remote && !titleHit(t) ? app.searchState.matches.get(t.id)?.snippet ?? "" : "";
    // Pinned threads (T3's own pin) come first, like in T3.
    let active = q ? list.filter((t) => !t.settled) : pinnedFirst(completionFirst(list.filter((t) => !t.settled)));
    const settled = list.filter((t) => t.settled);
    const reviews = latestThreadReviews(app.currentEnvironment ? [] : app.orch.papers);
    const reviewOf = (t: typeof list[number]) => threadReviewLabel(t, reviews.get(t.id), !app.currentEnvironment && !!app.settings.orch && t.id !== app.settings.orch.threadId);
    const presentationOf = (t: typeof list[number]) => threadState(t, reviewOf(t), app.delegate.phaseOf(t.id) === "reading");
    const stateOf = (t: typeof list[number]) => {
      const state = presentationOf(t);
      return state.tone ? statusBadge(state.tone, { detail: state.detail, suffix: state.since ? app.ago(state.since) : "", cls: "th-st", size: 16 }) : `<span class="th-ago" title="${esc(state.detail || "")}">${app.ago(t.updatedAt)}</span>`;
    };
    const dotOf = (t: typeof list[number]) => presentationOf(t).tone;
    const statusAttr = (t: typeof list[number]) => { const s = dotOf(t); return s ? ` data-status="${s}"` : ""; };
    const row = (t: typeof list[number]) => {
      const p = projects.get(t.projectId);
      const proj = !p || p.scratch ? "No project" : p.title;
      const icon = p && !p.scratch ? (p.icon ? `<img src="${esc(p.icon)}" alt="">` : `<span class="th-mono">${esc(proj.slice(0, 2).toUpperCase())}</span>`) : `<span class="th-none"></span>`;
      if (t.settled) return `<li><button type="button" class="th-row th-settled-row" data-id="${esc(t.id)}" title="${esc(`${proj}: ${t.title || "Untitled"}${app.world.roster.byThread(t.id) ? `
  ${app.world.roster.byThread(t.id)!.name}` : ""}`)}">${icon}<span class="th-settled-title">${esc(t.title || "Untitled")}${snippetOf(t) ? `<span class="th-snippet">${esc(snippetOf(t))}</span>` : ""}</span><span class="th-ago">${app.ago(t.updatedAt)}</span></button></li>`;
      // T3's row, one line each: project (logo and name) with the state, the title, then the
      // worker, model and branch with the harness logo. Nothing wraps; the tooltip has it all.
      const state = stateOf(t);
      const robot = app.world.roster.byThread(t.id);
      const logo = logoFor(t.provider);
      const where = t.branch || "";
      const ready = app.collectible(t.id, true);
      const busy = app.collectingWork.has(t.id);
      const label = ready?.coins ? `Settle & collect ${ready.coins} coins` : 'Settle session';
      const collect = ready ? `<button type="button" class="th-collect" data-collect-id="${esc(t.id)}" title="${esc(label)}" aria-label="${esc(`${label}: ${t.title || 'Untitled'}`)}"${busy ? ' disabled aria-busy="true"' : ''}>${uiIcon("check", 14)} ${busy ? 'Settling…' : 'Settle'}</button>${sidebarCollectErrors.has(t.id) ? `<p class="th-collect-error" role="status">${esc(sidebarCollectErrors.get(t.id)!)}</p>` : ''}` : '';
      const sel = t.id === app.chat.threadId ? " sel" : "";
      return `<li class="th-entry${ready ? ' th-can-collect' : ''}"><button type="button" class="th-row th-worker th-t3${t.runStatus === "running" ? " on" : ""}${sel}"${statusAttr(t)} data-id="${esc(t.id)}" title="${esc(`${proj}: ${t.title || "Untitled"}${robot ? `
  ${robot.name}${t.model ? `, ${t.model}` : ""}` : ""}${t.branch ? `
  ${t.branch}` : ""}`)}">
        <span class="th-text">
          <span class="th-top">${icon}<span class="th-proj">${esc(proj)}</span>${state}</span>
          <span class="th-line"><span class="th-title">${t.pinned ? `<span class="th-pin" role="img" aria-label="Pinned">${PIN_ICON}</span>` : ""}${esc(t.title || "Untitled")}</span>${logo ? `<img class="th-logo" src="${logo}" alt="${esc(harnessName(t.provider))}">` : ""}</span>
          ${where ? `<span class="th-meta"><span class="th-where">${esc(where)}</span></span>` : ""}
          ${snippetOf(t) ? `<span class="th-snippet">${esc(snippetOf(t))}</span>` : ""}
        </span>
      </button>${collect}</li>`;
    };
    const order = active.map(t => t.id).join(" ");
    if (listHeld && !force && heldOrder && order !== heldOrder) {
      app.listDeferred = true;
      const positions = new Map(heldOrder.split(" ").map((id,i) => [id,i]));
      active = active.filter(t => positions.has(t.id)).sort((a,b) => positions.get(a.id)! - positions.get(b.id)!);
    } else heldOrder = order;
    const expanded = settledOpen || !!q;
    const rows = `<li class="th-active-shell" id="th-active-shell"><ol class="th-active-list" id="th-active-list">${active.map(row).join("") || '<li class="th-empty">No threads match.</li>'}</ol></li>` + (settled.length ? `<li class="th-settled-section" id="th-settled-section"><button type="button" class="th-settled-toggle" aria-expanded="${expanded}" aria-controls="th-settled-body"><span>Settled</span><span class="th-settled-count">${settled.length}</span><span aria-hidden="true">${expanded ? "⌄" : "›"}</span></button><div id="th-settled-body" class="th-settled-body"${expanded ? "" : " hidden"}><ol id="th-settled-list" class="th-settled-list">${expanded ? settled.slice(0, q ? settled.length : settledLimit).map(row).join("") : ""}</ol>${expanded && !q && settled.length > settledLimit ? `<button type="button" class="th-settled-more">⌄ &nbsp; Show ${Math.min(25, settled.length - settledLimit)} more</button>` : ""}</div></li>` : "");
    const sig = rows + q;
    if (sig === app.thSig) { endSystem("ui", started); return; }
    app.thSig = sig;
    const focused = document.activeElement as HTMLElement | null;
    const focusedId = focused?.closest<HTMLElement>(".th-row")?.dataset.id;
    const scrollBox = document.getElementById("th-active-shell") || $("th-list");
    const scrollTop = scrollBox.scrollTop;
    reconcileThreadList($("th-list"), rows);
    if (focusedId) $("th-list").querySelector<HTMLElement>(`[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
    scrollBox.scrollTop = scrollTop;
    app.markSelected(app.chat.threadId);
    endSystem("ui", started);
  };

  app.findThread = function findThread() {
    if (app.ui.rail) app.toggleRail(false, false);
    app.folded.delete("threads"); app.ui.folded = [...app.folded];
    foldSection("threads", true, false);
    const search = $("th-q") as HTMLInputElement;
    search.focus(); search.select();
    app.saveSettings();
  };

  // Questions first, then failures, reviews and finished work, in list order after the open chat.
  app.nextNeedingYou = function nextNeedingYou() {
    const threads = (app.world.lastData?.threads ?? []).filter(t => !t.settled);
    const rank = (t: typeof threads[number]) => t.question ? 0 : (t.lastStatus === "failed" || t.job?.state === "failed") && t.runStatus !== "running" ? 1 : t.unseen && t.lastStatus === "completed" ? 2 : app.collectible(t.id, true) ? 3 : -1;
    const waiting = threads.filter(t => rank(t) >= 0);
    if (!waiting.length) { gameSound.play("switch"); showMenu(innerWidth / 2 - 120, 80, "Nothing needs you right now", []); return; }
    const best = Math.min(...waiting.map(rank)), group = waiting.filter(t => rank(t) === best);
    const at = group.findIndex(t => t.id === app.chat.threadId);
    app.openThread(group[(at + 1) % group.length].id);
  };

  app.newProject = function newProject() {
    if (app.currentEnvironment) return;
    const lucid = (window as any).lucid;
    openNewProject({ create: o => lucid.createProject(o), addExisting: o => lucid.addProject(o), pickFolder: () => lucid.pickFolder(), baseFolder: () => lucid.projectsBase() },
      { onDone: () => void app.refresh() });
  };

  app.markSelected = function markSelected(id: string | null) {
    for (const row of document.querySelectorAll<HTMLElement>("#th-list .th-row[data-id], #rail-list .rail-th[data-id]")) {
      const current = row.dataset.id === id;
      row.classList.toggle(row.classList.contains("rail-th") ? "cur" : "sel", current);
      if (current) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
    }
  };

  app.renderRail = function renderRail() {
    const data = app.world.lastData;
    if (!data || !app.ui.rail || document.body.classList.contains("th-dragging")) return;
    const projects = new Map(data.projects.map((p) => [p.id, p]));
    const list = pinnedFirst(completionFirst(data.threads)).slice(0, 40);
    const reviews = latestThreadReviews(app.currentEnvironment ? [] : app.orch.papers);
    const html = list.map((t) => {
      const p = projects.get(t.projectId);
      const proj = !p || p.scratch ? "No project" : p.title;
      const review = threadReviewLabel(t, reviews.get(t.id), !app.currentEnvironment && !!app.settings.orch && t.id !== app.settings.orch.threadId);
      const { tone: st, label: said } = threadState(t, review, app.delegate.phaseOf(t.id) === "reading");
      const logo = logoFor(t.provider);
      const name = `${t.pinned ? "Pinned, " : ""}${t.title}, ${proj}${said ? `, ${said}` : ""}`;
      return `<li><button type="button" class="rail-th${t.id === app.chat.threadId ? " cur" : ""}"${st ? ` data-status="${st}"` : ""} data-id="${esc(t.id)}" aria-label="${esc(name)}" title="${esc(`${t.title}
  ${proj}${said ? ` · ${said[0].toUpperCase()}${said.slice(1)}` : ""}`)}">`
        + (logo ? `<img src="${logo}" alt="">` : `<span class="rail-mono">${esc(proj.slice(0, 2).toUpperCase())}</span>`)
        + (st ? `<i class="rail-st" aria-hidden="true"></i>` : "") + `</button></li>`;
    }).join("");
    if (html === app.railSig) return;
    app.railSig = html;
    reconcileThreadList($("rail-list"), html);
  };
}

export function mountThreadSidebar(app: App) {
  // --- the thread list, like T3 Code's sidebar --------------------------------------------
  app.ago = (iso?: string | null) => {
    if (!iso) return "";
    const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
    return m < 1 ? "now" : m < 60 ? `${Math.floor(m)}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
  };
  app.thSig = "";
  app.threadMovePending = false;
  // While the pointer is over the list, new or reordered rows wait, so a row never moves away
  // just as it is clicked. Status text still updates in place. Leaving the list applies them.
  app.listDeferred = false;
  for (const box of [$("th-list"), $("rail-list")]) {
    box.addEventListener("pointerenter", () => { listHeld = true; });
    box.addEventListener("pointerleave", () => { listHeld = false; if (app.listDeferred) { app.listDeferred = false; app.renderThreads(); } });
  }
  // T3 Code's server search (titles, message text, older settled threads), debounced while typing.
  app.searchState = { q: "", matches: new Map<string, { snippet: string; quality: number | null }>(), older: [] as { id: string; title: string; projectId: string | null; updatedAt: string; provider: string; settled: boolean }[] };
  $("th-q").addEventListener("input", () => { app.renderThreads(true); app.runThreadSearch((($("th-q") as HTMLInputElement).value || "").trim().toLowerCase()); });
  $("th-new-project").addEventListener("click", () => app.newProject());
  $("th-list").addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const collectButton = target.closest<HTMLButtonElement>(".th-collect");
    if (collectButton) {
      const id = collectButton.dataset.collectId!;
      if (app.collectingWork.has(id) || !app.collectible(id, true)) return;
      sidebarCollectErrors.delete(id);
      const pending = app.collectWork(id, collectButton);
      app.renderThreads(true);
      void pending.catch(error => {
        sidebarCollectErrors.set(id, error instanceof Error ? error.message : String(error));
      }).finally(() => {
        app.renderThreads(true);
        if (!document.activeElement || document.activeElement === document.body) $("th-q").focus({ preventScroll: true });
      });
      return;
    }
    if (target.closest(".th-settled-toggle")) { settledOpen = !settledOpen; app.renderThreads(true); return; }
    if (target.closest(".th-settled-more")) { settledLimit += 25; app.renderThreads(true); return; }
    const b = (e.target as HTMLElement).closest(".th-row") as HTMLElement | null;
    if (b) app.openThread(b.dataset.id!);
  });
  $("th-new-task").addEventListener("click", () => app.startNewTask());
  $("side-help").addEventListener("click", () => openShortcutHelp());
  app.listRows = () => [...$("th-list").querySelectorAll<HTMLElement>(".th-row[data-id]")].filter(r => r.offsetParent);
  $("th-q").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); app.listRows()[0]?.focus(); }
    else if (e.key === "Enter") {
      const first = app.listRows()[0];
      if (!first) return;
      e.preventDefault();
      // The filter has done its job: the full list comes back once the thread is open.
      (e.target as HTMLInputElement).value = ""; (e.target as HTMLInputElement).blur();
      app.openThread(first.dataset.id!); app.renderThreads(true);
    }
    else if (e.key === "Escape" && (e.target as HTMLInputElement).value) { e.preventDefault(); e.stopPropagation(); (e.target as HTMLInputElement).value = ""; app.renderThreads(true); }
  });
  $("th-list").addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
    const rows = app.listRows(), at = rows.indexOf((e.target as HTMLElement).closest(".th-row") as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && at === 0) { ($("th-q") as HTMLInputElement).focus(); return; }
    rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  });
}

export function startThreadSidebar(app: App) {
  setInterval(() => { if (!document.hidden) app.renderThreads(); }, 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) app.renderThreads(); });
  // Defer until module initialization finishes, then make the loaded threads usable.
  window.setTimeout(app.renderThreads, 0);
  // The folded sidebar: one button per thread with its harness logo and a dot for its state.
  app.railSig = "";
  $("rail-list").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".rail-th") as HTMLElement | null;
    if (b) app.openThread(b.dataset.id!);
  });
}
