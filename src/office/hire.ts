import { readPromptDraft, writePromptDraft } from "./prompt-draft";
import gsap from "gsap";
import { Roster, type RobotProfile } from "./roster";
import { brandFor, harnessName, logoFor } from "./brand";
import type { RobotLook } from "./rig";
import { portraitSvg } from "../world/look";
import { PALETTES } from "../world/seated-parts";
import "./hire.css";
import { icon } from "../ui/icons";
import { openCustomize } from "./customize";
import { Walker } from "../world/walker";
import { compatibleWorkers } from "./worker-match";
import { randomLook } from "../world/look";
import { gameSound } from "./sound";

const LAST_SETUP = "lucid.hire.lastSetup";
// The hiring screen: a new thread for a free desk. The harness and model decide the
// worker: a free robot with exactly that setup takes the job, otherwise a new robot is
// hired. The chosen worker stands in the preview at full size before it runs over.

export type OptionValue = string | boolean;
export type HireSelection = { providerInstanceId: string; model: string | null; options: Record<string, OptionValue> };
export type HireOption = { id: string; label: string; type: "select" | "boolean"; current?: OptionValue; choices?: { id: string; label: string; isDefault: boolean }[] };
export type HireProvider = { instanceId: string; name: string; ready: boolean; models: { slug: string; name: string; isDefault: boolean; options: HireOption[] }[] };
export type HireRuntime = { providers: HireProvider[]; selection: HireSelection | null; source: string };
export type HireTeammate = RobotProfile & { model?: string | null };
export type HireChoice = { robotId: string | null; provider: string; model: string; options: Record<string, OptionValue>; requestId: string; projectId: string; task: string; role: Role | null };

// A worker's setup is its harness and model. Only free robots with exactly that setup can
// take the job; the most experienced goes first. No match means a new hire.
export function matchingWorkers(team: HireTeammate[], provider: string, model: string | null) {
  return model ? compatibleWorkers(team, provider, model) : [];
}
export type Role = { name: string; brief: string };
export const BUILTIN_ROLES: Role[] = [
  { name: "Reviewer", brief: "You are a careful code reviewer. Read the relevant code and changes, point out real bugs and risky spots with file and line, and suggest concrete fixes. Do not rewrite things that work." },
  { name: "Test writer", brief: "You write focused automated tests. Find the behavior that matters, cover the edge cases, run the tests, and fix only the tests unless a real bug shows up (then report it)." },
  { name: "UI designer", brief: "You care about polished, readable interfaces. Follow the existing visual language, check real content and states, avoid generic template styling, and verify the result visually." },
  { name: "Researcher", brief: "You research before building. Look things up, compare options, cite sources, and finish with a short recommendation instead of code unless asked." },
];
type Project = { id: string; title: string };

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// A small portrait: the robot's face with its hat, eyes, tint and colors.
export function avatar(provider: string, look: RobotLook = {}, size = 66) {
  return portraitSvg(look, PALETTES[brandFor(provider)], { size });
}

export function openHire(opts: {
  room: string; roomTitle: string; seat: number;
  intent?: "thread" | "delegate";
  team: HireTeammate[];
  getTeam?: () => HireTeammate[];
  projectId?: string;
  loadRuntime: (projectId: string) => Promise<HireRuntime>;
  saveAttachment?: (name: string, data: Uint8Array) => Promise<string>;
  roles: Role[];
  onNewRole: (r: Role) => void;
  projects: Project[] | null;
  onHire: (c: HireChoice) => Promise<void>;
}) {
  const previousFocus = document.activeElement as HTMLElement | null;
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap hire-wrap";
  wrap.innerHTML = `
    <form class="dialog hire" role="dialog" aria-modal="true" aria-labelledby="hire-title" aria-describedby="hire-location">
      <header class="hire-header"><div><h2 id="hire-title">${opts.intent === "thread" ? "New thread" : opts.intent === "delegate" ? "Delegate task" : "Hire a robot"}</h2><p id="hire-location" class="hire-sub">${esc(opts.roomTitle)} · Desk ${opts.seat + 1}</p></div><button type="button" class="ghost hire-close" data-a="cancel" aria-label="Close hiring dialog">×</button></header>
      <div class="hire-body">
        <section class="hire-stage" aria-labelledby="hire-worker-name">
          <div class="hire-stage-floor" aria-hidden="true"></div>
          <div class="hire-worker">
            <h3 id="hire-worker-name" aria-live="polite"></h3>
            <p class="hire-worker-note"></p>
            <div class="hire-worker-actions">
              <div class="hire-worker-pick" hidden><button type="button" class="ghost hire-prev" aria-label="Previous free worker">${icon("chevronLeft")}</button><span class="hire-worker-count"></span><button type="button" class="ghost hire-next" aria-label="Next free worker">${icon("chevronRight")}</button></div>
              <button type="button" class="link-btn hire-customize">Customize</button>
            </div>
          </div>
        </section>
        <div class="hire-main">
          ${opts.projects ? `<label class="hire-project hire-field"><span>Project</span><select>${opts.projects.length ? opts.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("") : '<option value="">No projects available</option>'}</select></label>` : ""}
          <div class="hire-composer">
            <label class="hire-task"><span>Task</span><textarea rows="6" placeholder="What should we work on? Add files, screenshots, or anything the job needs." aria-describedby="hire-file-hint"></textarea></label>
            <div class="hire-attachments" aria-label="Attached files"></div>
            <div class="hire-composer-tools"><button type="button" class="ghost hire-attach">${icon("attach", 18)}Attach files</button><span id="hire-file-hint">or drop files and paste images</span><input class="hire-files" type="file" multiple hidden></div>
          </div>
          <div class="hire-runtime-controls" aria-label="Runtime settings"></div>
          <div class="hire-runtime-note"><span class="hire-runtime" role="status">Loading T3 defaults...</span><button type="button" class="link-btn hire-reset" hidden>Use T3 defaults</button><button type="button" class="link-btn hire-reload" hidden>Retry</button></div>
          <details class="hire-role"${opts.intent === "delegate" ? " open" : ""}><summary>Role <span class="hire-role-name">Optional</span></summary><div class="hire-role-body"><label class="hire-field"><span>Standing instructions</span><select class="hire-role-select"></select></label><button type="button" class="link-btn hire-new-role">New role</button><div class="role-new" hidden><input type="text" class="rn-name" aria-label="Role name" placeholder="Role name"><textarea class="rn-brief" rows="2" aria-label="Role instructions" placeholder="Instructions this robot always follows"></textarea><button type="button" class="ghost rn-save">Save role</button></div></div></details>
        </div>
      </div>
      <footer class="hire-footer"><p class="hire-msg" role="status"></p><div class="dialog-actions"><button type="button" class="ghost" data-a="cancel">Cancel</button><button type="submit" class="primary" disabled>Hire</button></div></footer>
    </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector("form")!;
  const el = <T extends HTMLElement = HTMLElement>(s: string) => form.querySelector<T>(s)!;
  const taskInput = el<HTMLTextAreaElement>(".hire-task textarea");
  const runtimeEl = el(".hire-runtime-controls"), runtimeNote = el(".hire-runtime");
  const submit = el<HTMLButtonElement>('button[type="submit"]');
  const msg = el(".hire-msg");
  let project = opts.projectId || opts.projects?.[0]?.id || "";
  const promptKey = () => `hire:${project}`;
  taskInput.value = readPromptDraft(promptKey());
  taskInput.addEventListener("input", () => {
    if (!writePromptDraft(promptKey(), taskInput.value)) msg.textContent = "Draft could not be saved. Copy your prompt before closing Lucid.";
  });
  let config: HireRuntime | null = null, selection: HireSelection | null = null;
  let role: Role | null = null, pick = 0;
  let closed = false, busy = false, loadVersion = 0, loading = false;
  let team = opts.team, teamSignature = "", workers: HireTeammate[] = [];
  const drafts = new Map<string, { look: RobotLook; name: string; custom: boolean }>();
  const files: File[] = [], urls = new Set<string>(), savedPaths = new WeakMap<File, string>();
  let attempt: { signature: string; id: string } | null = null;
  const currentProvider = () => config?.providers.find(p => p.instanceId === selection?.providerInstanceId);
  const currentModel = () => currentProvider()?.models.find(m => m.slug === selection?.model);
  const ready = () => !!selection?.model && !!currentProvider()?.ready && !!currentModel() && !loading;
  const validOptions = (provider: HireProvider | undefined, model: string | null, values: Record<string, OptionValue>) => {
    const result: Record<string, OptionValue> = {};
    for (const o of provider?.models.find(m => m.slug === model)?.options ?? []) {
      const v = values[o.id];
      if (o.type === "boolean" ? typeof v === "boolean" : o.choices?.some(c => c.id === v)) result[o.id] = v;
    }
    return result;
  };
  const optionDefault = (o: HireOption) => o.current ?? (o.type === "boolean" ? false : o.choices?.find(c => c.isDefault)?.id);
  const updateSubmit = () => { submit.disabled = busy || !ready() || (!!opts.projects && !project); };
  const chosen = () => ready() ? workers[pick] ?? null : null;
  const optionHtml = (id: string, label: string, choices: { id: string; label: string; disabled?: boolean }[], value: string) => `<label class="hire-field"><span>${esc(label)}</span><select data-setting="${esc(id)}">${choices.map(c => `<option value="${esc(c.id)}"${c.id === value ? " selected" : ""}${c.disabled ? " disabled" : ""}>${esc(c.label)}</option>`).join("")}</select></label>`;
  const renderRuntime = () => {
    const provider = currentProvider(), model = currentModel();
    const providers = config?.providers ?? [];
    runtimeEl.innerHTML = config ? [
      `<fieldset class="hire-harnesses"><legend>Harness</legend><div class="hire-harness-list">${providers.map(p => {
        const logo = logoFor(p.instanceId);
        return `<label class="hire-harness"><input type="radio" name="hire-harness" data-setting="provider" value="${esc(p.instanceId)}"${p.instanceId === selection?.providerInstanceId ? " checked" : ""}${!p.ready || loading || busy ? " disabled" : ""}><span>${logo ? `<img src="${esc(logo)}" alt="" width="22" height="22">` : ""}<span>${esc(p.name)}${p.ready ? "" : '<small>Unavailable</small>'}</span>${icon("check", 16, { cls: "hire-harness-check" })}</span></label>`;
      }).join("")}</div></fieldset>`,
      optionHtml("model", "Model", [...(provider?.models ?? []).map(m => ({ id: m.slug, label: m.name || m.slug })), ...(!model ? [{ id: selection?.model || "", label: selection?.model ? `${selection.model} (unavailable)` : "Choose model", disabled: true }] : [])], selection?.model || ""),
      ...(model?.options ?? []).filter(o => o.type === "boolean" || o.choices?.length).map(o => {
        const v = selection?.options[o.id] ?? optionDefault(o);
        const label = /^(reasoningEffort|reasoning_effort|effort|thinkingLevel|thinking|variant)$/.test(o.id) ? "Thinking" : o.label;
        return optionHtml(o.id, label, o.type === "boolean" ? [{ id: "false", label: "Off" }, { id: "true", label: "On" }] : o.choices!, String(v ?? ""));
      }),
    ].join("") : '<span class="hire-loading">Runtime settings will appear here.</span>';
    runtimeEl.querySelectorAll<HTMLSelectElement>("select").forEach(s => s.disabled = loading || busy);
    const isDefault = JSON.stringify(selection) === JSON.stringify(config?.selection);
    el(".hire-reset").hidden = !config?.selection || isDefault;
    if (config && !loading) runtimeNote.textContent = ready() ? isDefault ? config.source : "Custom setup for this job" : "Choose an available harness and model.";
    updateSubmit();
  };
  // ---- the worker preview ----
  const floor = el(".hire-stage-floor");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let actor: Walker | null = null, actorKey = "", actorScale = 0;
  const wantedScale = () => window.matchMedia("(max-width: 560px)").matches ? 0.27 : window.matchMedia("(max-height: 640px)").matches ? 0.35 : 0.54;
  const freshLook = (providerId: string) => {
    let draft = drafts.get(providerId);
    if (!draft) { draft = { look: randomLook(Math.random), name: "", custom: false }; drafts.set(providerId, draft); }
    return draft;
  };
  const placeActor = () => {
    if (!actor) return;
    // Crossing the narrow breakpoint redraws the robot at the size that fits its stage.
    if (actorScale !== wantedScale()) { actorKey = ""; renderWorker(); return; }
    actor.setPos(floor.clientWidth / 2, floor.clientHeight - 16);
  };
  const showActor = (key: string, provider: string, look: RobotLook, name: string, model: string | null, entering: "known" | "new") => {
    if (key === actorKey && actor) { actor.setLook(look); actor.setName(name); actor.setModel(model); return; }
    actor?.destroy(); actorKey = key; actorScale = wantedScale();
    actor = new Walker(floor, { id: `hire-${key}`, provider, name, model: model ?? undefined, scale: actorScale, look });
    actor.el.classList.add("hire-actor");
    placeActor(); actor.face("down");
    if (!still) {
      if (entering === "new") actor.hop(); else actor.do("wave");
      gsap.fromTo(actor.el, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power1.out" });
    }
  };
  const clearActor = () => { actor?.destroy(); actor = null; actorKey = ""; actorScale = 0; };
  // Model names stay on one line: "gpt-6.1-sol", never "gpt-" and "6.1-sol".
  const setNote = (note: HTMLElement, before: string, model: string, after: string) => {
    const name = document.createElement("span"); name.className = "hire-nowrap"; name.textContent = model;
    note.replaceChildren(before, name, after);
  };
  const renderWorker = (announce = false) => {
    team = opts.getTeam?.() ?? team;
    teamSignature = JSON.stringify(team);
    const providerId = selection?.providerInstanceId || "", model = selection?.model || null;
    const previous = workers[pick]?.id;
    workers = ready() ? matchingWorkers(team, providerId, model) : [];
    pick = Math.max(0, workers.findIndex(r => r.id === previous));
    const nameEl = el("#hire-worker-name"), note = el(".hire-worker-note");
    const pickRow = el(".hire-worker-pick"), customize = el<HTMLButtonElement>(".hire-customize");
    const robot = chosen();
    const modelName = currentModel()?.name || model || "";
    if (!ready()) {
      clearActor();
      nameEl.textContent = loading ? "Finding a worker..." : "No worker yet";
      note.textContent = loading ? "" : "Choose an available harness and model.";
      pickRow.hidden = true; customize.hidden = true;
    } else if (robot) {
      showActor(robot.id, robot.provider, robot.look, robot.name, robot.model ?? robot.lastModel ?? null, "known");
      nameEl.textContent = robot.name;
      setNote(note, `${robot.jobs} ${robot.jobs === 1 ? "job" : "jobs"} done. Free now and runs `, modelName, ".");
      pickRow.hidden = workers.length < 2;
      el(".hire-worker-count").textContent = `${pick + 1} of ${workers.length}`;
      customize.hidden = false; customize.textContent = "Customize";
    } else {
      const draft = freshLook(providerId);
      showActor(`new:${providerId}`, providerId, draft.look, draft.name || "New hire", model, "new");
      nameEl.textContent = draft.name || "New hire";
      setNote(note, "Nobody free runs ", modelName, ` yet, so a new ${currentProvider()?.name || harnessName(providerId)} robot joins the office.`);
      pickRow.hidden = true;
      customize.hidden = false; customize.textContent = "Customize new robot";
    }
    if (announce && actor) gameSound.play("chirp");
    updateSubmit();
  };
  const step = (by: number) => {
    if (busy || workers.length < 2) return;
    pick = (pick + by + workers.length) % workers.length;
    renderWorker(true);
  };
  el(".hire-prev").onclick = () => step(-1);
  el(".hire-next").onclick = () => step(1);
  el(".hire-customize").onclick = () => {
    if (busy || !selection) return;
    const robot = chosen(), providerId = selection.providerInstanceId;
    const draft = freshLook(providerId);
    openCustomize({ name: robot?.name || draft.name || "", provider: providerId, look: robot?.look || draft.look, namePlaceholder: robot ? undefined : "A random name", onSave: (look, name) => {
      if (robot) { Roster.current?.setLook(robot.id, look); Roster.current?.rename(robot.id, name); robot.look = look; if (name) robot.name = name; }
      else drafts.set(providerId, { look, name, custom: true });
      renderWorker();
    } });
  };
  const fallbackSelection = (c: NonNullable<typeof config>) => {
    let last: { providerInstanceId?: string; model?: string; options?: Record<string, OptionValue> } | null = null;
    try { last = JSON.parse(localStorage.getItem(LAST_SETUP) || "null"); } catch {}
    const lastProvider = c.providers.find(p => p.ready && p.instanceId === last?.providerInstanceId);
    if (lastProvider && last?.model && lastProvider.models.some(m => m.slug === last!.model)) {
      return { providerInstanceId: lastProvider.instanceId, model: last.model, options: validOptions(lastProvider, last.model, last.options ?? {}) };
    }
    const p = c.providers.find(p => p.ready && p.models.length);
    if (!p) return null;
    const m = p.models.find(m => m.isDefault)?.slug || p.models[0].slug;
    return { providerInstanceId: p.instanceId, model: m, options: validOptions(p, m, {}) };
  };
  const loadRuntime = async () => {
    const version = ++loadVersion;
    loading = true; submit.disabled = true;
    runtimeNote.textContent = "Loading T3 defaults..."; el(".hire-reload").hidden = true;
    renderRuntime(); renderWorker();
    try {
      const next = await opts.loadRuntime(project);
      if (closed || version !== loadVersion) return;
      config = next; selection = next.selection ? structuredClone(next.selection) : null;
      loading = false; pick = 0;
      // Without a usable T3 default, start from the setup used last time, else the first ready harness,
      // so a new task never opens on empty harness and model pickers.
      if (!ready()) selection = fallbackSelection(next) ?? selection;
      renderRuntime(); renderWorker();
    } catch (error: any) {
      if (closed || version !== loadVersion) return;
      loading = false; config = null; selection = null;
      renderRuntime(); renderWorker();
      runtimeNote.textContent = `Could not load T3 settings: ${error?.message || error}`;
      el(".hire-reload").hidden = false;
    }
  };
  runtimeEl.addEventListener("change", e => {
    const select = e.target as HTMLSelectElement | HTMLInputElement;
    const key = select.dataset.setting;
    if (!key || !config || busy || loading) return;
    if (key === "provider") {
      const p = config.providers.find(p => p.instanceId === select.value);
      if (!p?.ready) return;
      const defaults = config.selection?.providerInstanceId === p.instanceId ? config.selection : null;
      const m = defaults?.model || p.models.find(m => m.isDefault)?.slug || p.models[0]?.slug || null;
      selection = { providerInstanceId: p.instanceId, model: m, options: validOptions(p, m, defaults?.options ?? {}) };
      pick = 0;
    } else if (key === "model" && selection) {
      selection = { ...selection, model: select.value, options: validOptions(currentProvider(), select.value, selection.options) };
    } else if (selection) {
      const o = currentModel()?.options.find(o => o.id === key);
      if (o) selection.options[key] = o.type === "boolean" ? select.value === "true" : select.value;
    }
    renderRuntime(); renderWorker(key === "provider" || key === "model");
    runtimeEl.querySelector<HTMLElement>(key === "provider" ? 'input[name="hire-harness"]:checked' : `select[data-setting="${CSS.escape(key)}"]`)?.focus();
  });
  el(".hire-reset").onclick = () => { if (config?.selection) selection = structuredClone(config.selection); pick = 0; renderRuntime(); renderWorker(true); };
  el(".hire-reload").onclick = () => void loadRuntime();
  el<HTMLSelectElement>(".hire-project select")?.addEventListener("change", e => { writePromptDraft(promptKey(), taskInput.value); project = (e.target as HTMLSelectElement).value; taskInput.value = readPromptDraft(promptKey()); void loadRuntime(); });
  const renderRoles = () => {
    el<HTMLSelectElement>(".hire-role-select").innerHTML = `<option value="">No role</option>${opts.roles.map(r => `<option value="${esc(r.name)}"${role?.name === r.name ? " selected" : ""}>${esc(r.name)}</option>`).join("")}`;
    el(".hire-role-name").textContent = role?.name || "Optional";
  };
  renderRoles();
  el(".hire-role-select").onchange = e => { role = opts.roles.find(r => r.name === (e.target as HTMLSelectElement).value) || null; renderRoles(); };
  el(".hire-new-role").onclick = () => { const box = el(".role-new"); box.hidden = !box.hidden; if (!box.hidden) el(".rn-name").focus(); };
  el(".rn-save").onclick = () => {
    const name = el<HTMLInputElement>(".rn-name").value.trim(), brief = el<HTMLTextAreaElement>(".rn-brief").value.trim();
    if (!name || !brief) { msg.textContent = "Add a role name and instructions."; return; }
    if (opts.roles.some(r => r.name.toLowerCase() === name.toLowerCase())) { msg.textContent = "Choose a different role name."; return; }
    role = { name, brief }; opts.roles.push(role); opts.onNewRole(role); el(".role-new").hidden = true; msg.textContent = ""; renderRoles();
  };
  const renderFiles = () => {
    for (const url of urls) URL.revokeObjectURL(url); urls.clear();
    const attachments = el(".hire-attachments"); attachments.replaceChildren();
    files.forEach((file, index) => {
      const row = document.createElement("div");
      if (file.type.startsWith("image/")) {
        const img = document.createElement("img"); const url = URL.createObjectURL(file); urls.add(url); img.src = url; img.alt = "";
        img.onload = img.onerror = () => { URL.revokeObjectURL(url); urls.delete(url); }; row.append(img);
      }
      const name = document.createElement("span"); name.textContent = file.name;
      const size = document.createElement("small"); size.textContent = file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "ghost"; remove.textContent = "Remove"; remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.onclick = () => { if (!busy) { files.splice(index, 1); renderFiles(); el(".hire-attach").focus(); } };
      row.append(name, size, remove); attachments.append(row);
    });
  };
  const addFiles = (incoming: File[]) => { if (!busy) { files.push(...incoming.filter(f => !files.some(x => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified))); renderFiles(); } };
  taskInput.addEventListener("paste", e => {
    const pasted = Array.from(e.clipboardData?.items ?? []).filter(i => i.kind === "file").map(i => i.getAsFile()).filter((f): f is File => !!f);
    if (pasted.length) { if (!e.clipboardData?.getData("text/plain")) e.preventDefault(); addFiles(pasted); }
  });
  const fileInput = el<HTMLInputElement>(".hire-files");
  el(".hire-attach").onclick = () => fileInput.click();
  fileInput.onchange = () => { addFiles(Array.from(fileInput.files ?? [])); fileInput.value = ""; };
  const composer = el(".hire-composer");
  composer.addEventListener("dragover", e => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); composer.classList.add("file-over"); } });
  composer.addEventListener("dragleave", e => { if (!composer.contains(e.relatedTarget as Node)) composer.classList.remove("file-over"); });
  composer.addEventListener("drop", e => { e.preventDefault(); composer.classList.remove("file-over"); addFiles(Array.from(e.dataTransfer?.files ?? [])); });
  const close = () => {
    if (closed || busy) return;
    closed = true; ++loadVersion; window.clearInterval(availabilityTimer); window.removeEventListener("keydown", onKey, true); resize.disconnect(); clearActor();
    urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); gsap.killTweensOf(form);
    wrap.remove(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent) => {
    if ([...document.querySelectorAll(".dialog-wrap")].pop() !== wrap) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); form.requestSubmit(); }
    if (e.key === "Tab") {
      const items = [...form.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary')].filter(n => n.getClientRects().length && n.tabIndex >= 0);
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && (document.activeElement === first || !form.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !form.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
    }
  };
  window.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", e => { if (e.target === wrap || (e.target as HTMLElement).closest('[data-a="cancel"]')) close(); });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    const text = taskInput.value.trim();
    if (!text) { msg.textContent = "Describe the job first."; taskInput.focus(); return; }
    if (!ready() || !selection?.model) { msg.textContent = "Choose an available harness and model first."; return; }
    // Recheck availability right before starting: someone may have taken this worker.
    const previousWorker = chosen()?.id;
    renderWorker();
    const robot = chosen();
    if (previousWorker && robot?.id !== previousWorker) { msg.textContent = "That worker just took another job. Check who is shown now and hire again."; return; }
    if (opts.projects && !project) { msg.textContent = "Choose a project first."; return; }
    busy = true; form.setAttribute("aria-busy", "true");
    const locked = [...form.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("button, input, textarea, select")].map(c => ({ c, disabled: c.disabled }));
    locked.forEach(({ c }) => c.disabled = true);
    msg.textContent = files.length ? "Saving attachments..." : "Starting the job...";
    try {
      let task = text;
      if (files.length) {
        if (!opts.saveAttachment) throw new Error("File attachments are unavailable. Reconnect Lucid and retry.");
        const paths: string[] = [];
        for (const file of files) {
          let path = savedPaths.get(file);
          if (!path) { path = await opts.saveAttachment(file.name, new Uint8Array(await file.arrayBuffer())); savedPaths.set(file, path); }
          paths.push(`- ${file.type.startsWith("image/") ? "image" : "file"}: ${path}`);
        }
        task += `\n\nAttached:\n${paths.join("\n")}`;
      }
      const options = validOptions(currentProvider(), selection.model, selection.options);
      for (const o of currentModel()?.options ?? []) { const value = optionDefault(o); if (options[o.id] === undefined && value !== undefined) options[o.id] = value; }
      const choice = { robotId: robot?.id || null, provider: selection.providerInstanceId, model: selection.model, options, projectId: project, task, role };
      const signature = JSON.stringify(choice);
      if (attempt?.signature !== signature) attempt = { signature, id: crypto.randomUUID() };
      // A new hire keeps exactly the look shown in the preview.
      const draft = drafts.get(selection.providerInstanceId);
      if (!robot && draft) Roster.current?.prepareHire(selection.providerInstanceId, draft.look, draft.name);
      msg.textContent = robot ? `${robot.name} is taking the job...` : "Hiring a new robot...";
      await opts.onHire({ ...choice, requestId: attempt!.id });
      gameSound.play("ready");
      try { localStorage.setItem(LAST_SETUP, JSON.stringify({ providerInstanceId: choice.provider, model: choice.model, options })); } catch {}
      writePromptDraft(promptKey(), "");
      busy = false; close();
    } catch (error: any) {
      Roster.current?.prepareHire(null);
      msg.textContent = `Could not start: ${error?.message || error}. Your prompt and files are still here.`;
      busy = false; locked.forEach(({ c, disabled }) => c.disabled = disabled); updateSubmit();
    } finally { form.removeAttribute("aria-busy"); }
  });
  const availabilityTimer = window.setInterval(() => {
    if (closed || busy || loading || document.hidden || !opts.getTeam) return;
    const next = opts.getTeam();
    if (JSON.stringify(next) !== teamSignature) { team = next; renderWorker(); }
  }, 2000);
  const resize = new ResizeObserver(placeActor); resize.observe(floor);
  renderRuntime(); renderWorker(); void loadRuntime();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(form, { opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1, duration: 0.18, ease: "power2.out" });
  taskInput.focus();
}
