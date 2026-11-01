import { readPromptDraft, writePromptDraft } from "./prompt-draft";
import gsap from "gsap";
import { Roster, type RobotProfile } from "./roster";
import { companionClient } from "../remote-client";
import { brandFor, harnessName } from "./brand";
import type { RobotLook } from "./rig";
import { portraitSvg } from "../world/look";
import { PALETTES } from "../world/seated-parts";
import "./hire.css";
import { openCustomize, savedLevel } from "./customize";
import { matchSettledContexts, contextForRobot, type SettledContext, type ContextMatch } from "./hire-context";

// The hiring screen: pick who sits at a free desk (a free teammate or a new hire),
// which model it runs, and what it should do.

export type OptionValue = string | boolean;
export type HireSelection = { providerInstanceId: string; model: string | null; options: Record<string, OptionValue> };
export type HireOption = { id: string; label: string; type: "select" | "boolean"; current?: OptionValue; choices?: { id: string; label: string; isDefault: boolean }[] };
export type HireProvider = { instanceId: string; name: string; ready: boolean; models: { slug: string; name: string; isDefault: boolean; options: HireOption[] }[] };
export type HireRuntime = { providers: HireProvider[]; selection: HireSelection | null; source: string };
export type HireTeammate = RobotProfile & { model?: string | null };
export type HireChoice = { robotId: string | null; provider: string; model: string; options: Record<string, OptionValue>; requestId: string; projectId: string; task: string; role: Role | null; contextThreadId?: string };

// Relevant conversation ownership first, then harness, model and role.
export function rankTeammates(team: HireTeammate[], provider: string, model: string | null, role: string | null, matches: ContextMatch[] = []) {
  const score = (r: HireTeammate) => {
    const context = contextForRobot(r, matches);
    const owns = context && (r.threadId === context.thread.id || r.done?.includes(context.thread.id));
    return Number(!!owns) * 8 + Number(r.provider === provider) * 4 + Number(!!model && r.model === model && r.provider === provider) * 2 + Number(!!role && r.role === role);
  };
  return [...team].sort((a, b) => score(b) - score(a) || b.jobs - a.jobs || a.name.localeCompare(b.name));
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
  loadContexts?: (projectId: string) => Promise<SettledContext[]>;
  saveAttachment?: (name: string, data: Uint8Array) => Promise<string>;
  roles: Role[];
  onNewRole: (r: Role) => void;
  projects: Project[] | null;
  onHire: (c: HireChoice) => Promise<void>;
  level?: number;
}) {
  const previousFocus = document.activeElement as HTMLElement | null;
  const wrap = document.createElement("div");
  wrap.className = "dialog-wrap hire-wrap";
  wrap.innerHTML = `
    <form class="dialog hire" role="dialog" aria-modal="true" aria-labelledby="hire-title" aria-describedby="hire-location">
      <header class="hire-header"><div><h2 id="hire-title">${opts.intent === "thread" ? "New thread" : opts.intent === "delegate" ? "Delegate task" : "Hire a robot"}</h2><p id="hire-location" class="hire-sub">${esc(opts.roomTitle)} · Desk ${opts.seat + 1}</p></div><button type="button" class="ghost hire-close" data-a="cancel" aria-label="Close hiring dialog">×</button></header>
      <div class="hire-body">
        ${opts.projects ? `<label class="hire-project hire-field"><span>Project</span><select>${opts.projects.length ? opts.projects.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("") : '<option value="">No projects available</option>'}</select></label>` : ""}
        <div class="hire-composer">
          <label class="hire-task"><span class="hire-label">What should we work on?</span><textarea rows="6" placeholder="Describe the job. Add files, screenshots, or anything your robot needs." aria-describedby="hire-file-hint"></textarea></label>
          <div class="hire-attachments" aria-label="Attached files"></div>
          <div class="hire-composer-tools"><button type="button" class="ghost hire-attach"><svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="m7 10 5-5a2.5 2.5 0 0 1 3.5 3.5L8 16a4 4 0 0 1-5.7-5.7l8-8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Attach files</button><span id="hire-file-hint">or drop files and paste images</span><input class="hire-files" type="file" multiple hidden></div>
          <div class="hire-runtime-controls" aria-label="Runtime settings"></div>
        </div>
        <div class="hire-runtime-note"><span class="hire-runtime" role="status">Loading T3 defaults...</span><button type="button" class="link-btn hire-reset" hidden>Use T3 defaults</button><button type="button" class="link-btn hire-reload" hidden>Retry</button></div>
        <details class="hire-role"${opts.intent === "delegate" ? " open" : ""}><summary>Role <span class="hire-role-name">Optional</span></summary><div class="hire-role-body"><label class="hire-field"><span>Standing instructions</span><select class="hire-role-select"></select></label><button type="button" class="link-btn hire-new-role">New role</button><div class="role-new" hidden><input type="text" class="rn-name" aria-label="Role name" placeholder="Role name"><textarea class="rn-brief" rows="2" aria-label="Role instructions" placeholder="Instructions this robot always follows"></textarea><button type="button" class="ghost rn-save">Save role</button></div></div></details>
        <section class="hire-team" aria-labelledby="hire-team-title"><div class="hire-team-heading"><h3 id="hire-team-title">Best candidates</h3><span class="hire-team-count"></span></div><p class="hire-team-note">Relevant project context first, then model match.</p><div class="hire-cands" role="radiogroup" aria-label="Robot"></div><button type="button" class="link-btn hire-more" hidden></button></section>
      </div>
      <footer class="hire-footer"><p class="hire-msg" role="status"></p><div class="dialog-actions"><button type="button" class="ghost" data-a="cancel">Cancel</button><button type="submit" class="primary" disabled>Hire & start</button></div></footer>
    </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector("form")!;
  const el = <T extends HTMLElement = HTMLElement>(s: string) => form.querySelector<T>(s)!;
  const taskInput = el<HTMLTextAreaElement>(".hire-task textarea");
  const runtimeEl = el(".hire-runtime-controls"), runtimeNote = el(".hire-runtime");
  const candidates = el(".hire-cands"), submit = el<HTMLButtonElement>('button[type="submit"]');
  const msg = el(".hire-msg");
  if (companionClient()) {
    const addRole = el<HTMLButtonElement>('.hire-new-role');
    addRole.disabled = true; addRole.title = 'Save reusable roles on the computer.';
  }
  let project = opts.projectId || opts.projects?.[0]?.id || "";
  const promptKey = () => `hire:${project}`;
  taskInput.value = readPromptDraft(promptKey());
  taskInput.addEventListener("input", () => {
    if (!writePromptDraft(promptKey(), taskInput.value)) msg.textContent = "Draft could not be saved. Copy your prompt before closing Lucid.";
  });
  let config: HireRuntime | null = null, selection: HireSelection | null = null;
  let role: Role | null = null, selectedKey = "", manualPick = false, showAll = false;
  let closed = false, busy = false, loadVersion = 0, loading = false;
  let team = opts.team, teamSignature = "", ranked: HireTeammate[] = [];
  let contexts: SettledContext[] = [], matches: ContextMatch[] = [];
  let contextVersion = 0, contextLoading = false, contextError = false, freshContext = false, promptTimer = 0;
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
  const updateSubmit = () => { submit.disabled = busy || contextLoading || !ready() || !selectedKey || (!!opts.projects && !project); };
  const selectedContext = () => !freshContext && !selectedKey.startsWith("new:") ? contextForRobot(team.find(r => r.id === selectedKey) ?? { threadId: null }, matches) : null;
  const optionHtml = (id: string, label: string, choices: { id: string; label: string; disabled?: boolean }[], value: string) => `<label class="hire-field"><span>${esc(label)}</span><select data-setting="${esc(id)}">${choices.map(c => `<option value="${esc(c.id)}"${c.id === value ? " selected" : ""}${c.disabled ? " disabled" : ""}>${esc(c.label)}</option>`).join("")}</select></label>`;
  const renderRuntime = () => {
    const provider = currentProvider(), model = currentModel();
    const providers = config?.providers ?? [];
    runtimeEl.innerHTML = config ? [
      optionHtml("provider", "Harness", [...providers.map(p => ({ id: p.instanceId, label: p.name + (p.ready ? "" : " (unavailable)"), disabled: !p.ready })), ...(!provider ? [{ id: selection?.providerInstanceId || "", label: selection?.providerInstanceId ? `${harnessName(selection.providerInstanceId)} (unavailable)` : "Choose harness", disabled: true }] : [])], selection?.providerInstanceId || ""),
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
  const renderCandidates = (resort = true) => {
    const previousOrder = ranked.map(r => r.id);
    team = opts.getTeam?.() ?? team;
    teamSignature = JSON.stringify(team);
    matches = matchSettledContexts(taskInput.value, contexts, project, selection?.providerInstanceId || "");
    const next = rankTeammates(team, selection?.providerInstanceId || "", selection?.model || null, role?.name || null, freshContext ? [] : matches);
    ranked = resort ? next : next.sort((a, b) => {
      const ai = previousOrder.indexOf(a.id), bi = previousOrder.indexOf(b.id);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    });
    const provider = currentProvider(), providerId = selection?.providerInstanceId || "";
    const freshKey = `new:${providerId}`;
    if (!manualPick || (!ranked.some(r => r.id === selectedKey) && selectedKey !== freshKey)) {
      selectedKey = ranked[0]?.id || (ready() ? freshKey : ""); manualPick = false;
    }
    const list = showAll ? ranked : ranked.slice(0, 3);
    const selected = ranked.find(r => r.id === selectedKey);
    if (selected && !list.includes(selected)) list.push(selected);
    candidates.innerHTML = ready() ? list.map(r => `<div class="cand-cell"><button type="button" role="radio" aria-checked="${selectedKey === r.id}" class="cand" data-k="${esc(r.id)}">${avatar(r.provider, r.look, 48)}<span class="cand-description"><b>${esc(r.name)}</b>${!freshContext && contextForRobot(r, matches) ? `<span>Context: ${esc(contextForRobot(r, matches)!.thread.title)}</span>` : ""}<span>${esc(r.provider !== providerId ? `Will switch to ${provider?.name || harnessName(providerId)}` : r.model === selection?.model ? `Uses ${r.model}` : r.model ? `${r.model}, will switch model` : "Ready for this model")}${role && role.name === r.role ? ` · ${esc(role.name)}` : ""}</span></span><span class="cand-meta">Free now<span>${r.jobs} ${r.jobs === 1 ? "job" : "jobs"} done</span></span><span class="cand-check" aria-hidden="true">${selectedKey === r.id ? "✓" : ""}</span></button><button type="button" class="cand-edit" data-edit="${esc(r.id)}">Customize<span class="sr-only"> ${esc(r.name)}</span></button></div>`).join("") + `<div class="cand-cell cand-new"><button type="button" role="radio" aria-checked="${selectedKey === freshKey}" class="cand" data-k="${esc(freshKey)}">${avatar(providerId, drafts.get(providerId)?.look ?? { accent: "#ff9f5a" }, 48)}<span class="cand-description"><b>${esc(drafts.get(providerId)?.name || `New ${provider?.name || harnessName(providerId)} robot`)}</b><span>${ranked.length ? "Hire a new teammate instead" : "No free teammates available. Hire someone new."}</span></span><span class="cand-check" aria-hidden="true">${selectedKey === freshKey ? "✓" : "+"}</span></button><button type="button" class="cand-edit" data-edit="${esc(freshKey)}">Customize new robot</button></div>` : '<p class="hire-none">Choose your runtime to see available teammates.</p>';
    if (companionClient()) for (const button of candidates.querySelectorAll<HTMLButtonElement>('.cand-edit')) {
      button.disabled = true; button.title = 'Customize this robot from its desk, or on the computer.';
    }
    const visibleRadios = [...candidates.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    visibleRadios.forEach((b, i) => b.tabIndex = b.dataset.k === selectedKey || (!selectedKey && i === 0) ? 0 : -1);
    el(".hire-team-count").textContent = ready() ? `${ranked.length} available` : "";
    const more = el<HTMLButtonElement>(".hire-more");
    more.hidden = ranked.length <= 3;
    more.textContent = showAll ? "Show best matches" : `Show all ${ranked.length} teammates`;
    renderContextChoice();
    updateSubmit();
  };
  const contextChoice = document.createElement("div"); contextChoice.className = "hire-context-choice";
  el(".hire-team").append(contextChoice);
  const renderContextChoice = () => {
    const match = selectedContext(), candidate = team.find(r => r.id === selectedKey);
    contextChoice.replaceChildren();
    const text = document.createElement("span");
    text.textContent = contextLoading ? "Searching settled conversations in this project..." : contextError ? "Context search is unavailable. You can start with fresh context." : match ? `Continue: ${match.thread.title}` : candidate ? `Fresh context with ${candidate.name}.` : "Start a fresh conversation.";
    contextChoice.append(text);
    if (candidate && matches.length && !contextLoading) {
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "link-btn"; toggle.textContent = freshContext ? "Use matching context" : "Use fresh context";
      toggle.onclick = () => { freshContext = !freshContext; renderCandidates(false); };
      contextChoice.append(toggle);
    }
  };
  const loadContexts = async () => {
    const version = ++contextVersion;
    contexts = []; matches = []; contextError = false; freshContext = false;
    contextLoading = !!opts.loadContexts && !!project; renderCandidates();
    if (!contextLoading) return;
    try {
      const result = await opts.loadContexts!(project);
      if (closed || version !== contextVersion) return;
      contexts = result;
    } catch {
      if (closed || version !== contextVersion) return;
      contextError = true;
    }
    contextLoading = false; renderCandidates();
  };
  const loadRuntime = async () => {
    const version = ++loadVersion;
    loading = true; submit.disabled = true;
    runtimeNote.textContent = "Loading T3 defaults..."; el(".hire-reload").hidden = true;
    renderRuntime();
    try {
      const next = await opts.loadRuntime(project);
      if (closed || version !== loadVersion) return;
      config = next; selection = next.selection ? structuredClone(next.selection) : null;
      loading = false; manualPick = false; showAll = false;
      renderRuntime(); renderCandidates();
    } catch (error: any) {
      if (closed || version !== loadVersion) return;
      loading = false; config = null; selection = null; selectedKey = "";
      renderRuntime(); renderCandidates();
      runtimeNote.textContent = `Could not load T3 settings: ${error?.message || error}`;
      el(".hire-reload").hidden = false;
    }
  };
  runtimeEl.addEventListener("change", e => {
    const select = e.target as HTMLSelectElement;
    const key = select.dataset.setting;
    if (!key || !config || busy) return;
    if (key === "provider") {
      const p = config.providers.find(p => p.instanceId === select.value)!;
      const defaults = config.selection?.providerInstanceId === p.instanceId ? config.selection : null;
      const m = defaults?.model || p.models.find(m => m.isDefault)?.slug || p.models[0]?.slug || null;
      selection = { providerInstanceId: p.instanceId, model: m, options: validOptions(p, m, defaults?.options ?? {}) };
      manualPick = false; freshContext = false;
    } else if (key === "model" && selection) {
      selection = { ...selection, model: select.value, options: validOptions(currentProvider(), select.value, selection.options) };
    } else if (selection) {
      const o = currentModel()?.options.find(o => o.id === key);
      if (o) selection.options[key] = o.type === "boolean" ? select.value === "true" : select.value;
    }
    renderRuntime(); renderCandidates();
    runtimeEl.querySelector<HTMLSelectElement>(`select[data-setting="${CSS.escape(key)}"]`)?.focus();
  });
  el(".hire-reset").onclick = () => { if (config?.selection) selection = structuredClone(config.selection); manualPick = false; renderRuntime(); renderCandidates(); };
  el(".hire-reload").onclick = () => void loadRuntime();
  el<HTMLSelectElement>(".hire-project select")?.addEventListener("change", e => { writePromptDraft(promptKey(), taskInput.value); project = (e.target as HTMLSelectElement).value; taskInput.value = readPromptDraft(promptKey()); void loadContexts(); void loadRuntime(); });
  el(".hire-more").onclick = () => { showAll = !showAll; renderCandidates(); };
  candidates.addEventListener("click", e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>(".cand, .cand-edit");
    if (!button || busy) return;
    if (button.classList.contains("cand-edit")) {
      const robot = team.find(r => r.id === button.dataset.edit), providerId = robot?.provider || selection!.providerInstanceId;
      const draft = drafts.get(providerId);
      openCustomize({ name: robot?.name || draft?.name || "", provider: providerId, look: robot?.look || draft?.look || { accent: "#ff9f5a" }, level: opts.level ?? savedLevel(), namePlaceholder: robot ? undefined : "A random name", onSave: (look, name) => {
        if (robot) { Roster.current?.setLook(robot.id, look); Roster.current?.rename(robot.id, name); robot.look = look; if (name) robot.name = name; }
        else drafts.set(providerId, { look, name, custom: true });
        renderCandidates(false);
      } });
    } else {
      selectedKey = button.dataset.k!; manualPick = true; renderCandidates(false);
      candidates.querySelector<HTMLButtonElement>(`.cand[data-k="${CSS.escape(selectedKey)}"]`)?.focus({ preventScroll: true });
    }
  });
  candidates.addEventListener("keydown", e => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || !(e.target as HTMLElement).matches(".cand")) return;
    e.preventDefault();
    const radios = [...candidates.querySelectorAll<HTMLButtonElement>(".cand")], i = radios.indexOf(e.target as HTMLButtonElement);
    const index = e.key === "Home" ? 0 : e.key === "End" ? radios.length - 1 : (i + (/Up|Left/.test(e.key) ? -1 : 1) + radios.length) % radios.length;
    radios[index]?.click();
  });
  const renderRoles = () => {
    el<HTMLSelectElement>(".hire-role-select").innerHTML = `<option value="">No role</option>${opts.roles.map(r => `<option value="${esc(r.name)}"${role?.name === r.name ? " selected" : ""}>${esc(r.name)}</option>`).join("")}`;
    el(".hire-role-name").textContent = role?.name || "Optional";
  };
  renderRoles();
  el(".hire-role-select").onchange = e => { role = opts.roles.find(r => r.name === (e.target as HTMLSelectElement).value) || null; renderRoles(); renderCandidates(); };
  el(".hire-new-role").onclick = () => { const box = el(".role-new"); box.hidden = !box.hidden; if (!box.hidden) el(".rn-name").focus(); };
  el(".rn-save").onclick = () => {
    const name = el<HTMLInputElement>(".rn-name").value.trim(), brief = el<HTMLTextAreaElement>(".rn-brief").value.trim();
    if (!name || !brief) { msg.textContent = "Add a role name and instructions."; return; }
    if (opts.roles.some(r => r.name.toLowerCase() === name.toLowerCase())) { msg.textContent = "Choose a different role name."; return; }
    role = { name, brief }; opts.roles.push(role); opts.onNewRole(role); el(".role-new").hidden = true; msg.textContent = ""; renderRoles(); renderCandidates();
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
    closed = true; ++loadVersion; ++contextVersion; window.clearTimeout(promptTimer); window.clearInterval(availabilityTimer); window.removeEventListener("keydown", onKey, true);
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
    if (contextLoading) { msg.textContent = "Wait for the project context search to finish."; return; }
    const available = opts.getTeam?.() ?? team;
    const robot = available.find(r => r.id === selectedKey);
    if (!selectedKey || (!selectedKey.startsWith("new:") && !robot)) { manualPick = false; renderCandidates(); msg.textContent = "That teammate is busy now. Choose an available robot."; return; }
    if (opts.projects && !project) { msg.textContent = "Choose a project first."; return; }
    window.clearTimeout(promptTimer);
    matches = matchSettledContexts(text, contexts, project, selection.providerInstanceId);
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
      const choice = { robotId: robot?.id || null, provider: selection.providerInstanceId, model: selection.model, options, projectId: project, task, role, contextThreadId: selectedContext()?.thread.id };
      const signature = JSON.stringify(choice);
      if (attempt?.signature !== signature) attempt = { signature, id: crypto.randomUUID() };
      const draft = drafts.get(selection.providerInstanceId);
      if (!robot && draft?.custom) Roster.current?.prepareHire(selection.providerInstanceId, draft.look, draft.name);
      msg.textContent = robot ? `${robot.name} is taking the job...` : "Hiring your new teammate...";
      await opts.onHire({ ...choice, requestId: attempt!.id });
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
    if (JSON.stringify(next) !== teamSignature) { team = next; renderCandidates(false); }
  }, 2000);
  taskInput.addEventListener("input", () => { window.clearTimeout(promptTimer); promptTimer = window.setTimeout(() => { if (!closed && !busy) renderCandidates(); }, 180); });
  renderRuntime(); renderCandidates(); void loadContexts(); void loadRuntime();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(form, { opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1, duration: 0.18, ease: "power2.out" });
  taskInput.focus();
}
