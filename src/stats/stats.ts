// Usage block for the side panel: today's tokens and API-price cost, plan limits per
// harness (only where the logs report them), and a per-model breakdown on demand.
// Data comes from electron/usage.cjs through the `load` callback.
import "./stats.css";
import { logoFor, harnessName } from "../office/brand";

export type Limit = {
  /** A local fallback reading may be merged into a T3 provider window. */
  source?: string;
  usedPercent: number | null;
  id?: string;
  pool?: string;
  label?: string | null;
  observedAt?: string;
  windowMinutes: number | null;
  resetsAt: string | null;
  /** The reset time has passed since this reading; the current value is unknown. */
  stale?: boolean;
  staleReason?: string;
  labelIsComplete?: boolean;
};

export type HarnessLimits = {
  harness?: string;
  name?: string;
  source?: string;
  primary: Limit | null;
  secondary: Limit | null;
  plan?: string;
  windows?: Limit[];
  observedAt: string;
};

export type Totals = {
  tokens: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  byHarness: Record<string, { tokens: number; costUsd: number }>;
  byModel: Record<string, { tokens: number; costUsd: number; harness: string; priced?: boolean }>;
  byProject?: Record<string, { name: string; tokens: number; costUsd: number; priced?: boolean; sources: { session: number; cwd: number; unassigned: number } }>;
};

export type Usage = {
  updatedAt: string;
  windows: { last5h: Totals; today: Totals; week: Totals };
  limits: Record<string, HarnessLimits | null>;
  limitSource?: { source: string; status: string; detail: string };
  errors: string[];
};

const REFRESH_MS = 20000;
const TOP_MODELS = 4;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function setText(e: HTMLElement, text: string) {
  if (e.textContent !== text) e.textContent = text;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e8 ? 1 : 0)}M`;
  return `${(n / 1e9).toFixed(n < 1e10 ? 2 : 1)}B`;
}

export function formatCost(usd: number): string {
  if (usd > 0 && usd < 0.01) return "<$0.01";
  const digits = usd >= 1000 ? 0 : 2;
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function clock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// "14:30" today, "Wed 14:30" within the week, "4 Nov" further out.
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (days === 0) return clock(d);
  if (days > 0 && days < 7) return `${DAYS[d.getDay()]} ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function windowName(minutes: number | null): string {
  if (minutes === 300) return "5 hour";
  if (minutes === 10080) return "Weekly";
  if (!minutes) return "Limit";
  if (minutes % 1440 === 0) return `${minutes / 1440} day`;
  if (minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${minutes} min`;
}

type LimitRow = { root: HTMLElement; name: HTMLElement; reset: HTMLElement; fill: HTMLElement; pct: HTMLElement };
type ModelRow = { root: HTMLElement; name: HTMLElement; tokens: HTMLElement; cost: HTMLElement };

export function mountStats(host: HTMLElement, load: () => Promise<Usage>, options: { background?: boolean } = {}): { refresh(): void; destroy(): void } {
  const root = el("div", "st");
  root.setAttribute("aria-live", "off");

  // headline: today
  const head = el("div", "st-head");
  const tokCol = el("div", "st-fig");
  const tokNum = el("span", "st-big", " ");
  tokCol.append(tokNum, el("span", "st-cap", "tokens today"));
  const costCol = el("div", "st-fig st-fig-end");
  const costNum = el("span", "st-big", " ");
  costCol.append(costNum, el("span", "st-cap", "at API prices"));
  head.append(tokCol, costCol);
  const sub = el("p", "st-sub", "Reading usage logs");

  const limitsBox = el("div", "st-limits");

  // per-model breakdown
  const toggle = el("button", "st-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  const toggleLabel = el("span", "", "By model today");
  toggle.append(toggleLabel, el("span", "st-chev"));
  const modelsWrap = el("div", "st-models-wrap");
  const modelsInner = el("div", "st-models-inner");
  const modelList = el("ol", "st-models");
  const modelMore = el("p", "st-more");
  modelsInner.append(modelList, modelMore);
  modelsWrap.append(modelsInner);
  modelsWrap.id = `st-models-${Math.random().toString(36).slice(2, 8)}`;
  toggle.setAttribute("aria-controls", modelsWrap.id);
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    root.classList.toggle("st-open", open);
    if (open && last) renderModels(last.windows.today);
  });

  const projectToggle = el("button", "st-toggle", "By project today");
  projectToggle.type = "button";
  projectToggle.append(el("span", "st-chev"));
  projectToggle.setAttribute("aria-expanded", "false");
  const projectsWrap = el("div", "st-models-wrap st-projects-wrap");
  const projectsInner = el("div", "st-models-inner");
  const projectList = el("ol", "st-models");
  const projectNote = el("p", "st-more");
  projectsInner.append(projectList, projectNote);
  projectsWrap.append(projectsInner);
  projectsWrap.id = `st-projects-${Math.random().toString(36).slice(2, 8)}`;
  projectToggle.setAttribute("aria-controls", projectsWrap.id);
  projectToggle.addEventListener("click", () => {
    const open = projectToggle.getAttribute("aria-expanded") !== "true";
    projectToggle.setAttribute("aria-expanded", String(open));
    root.classList.toggle("st-projects-open", open);
    if (open && last) renderProjects(last.windows.today);
  });
  const limitsNote = el("p", "st-more st-limit-note");
  const note = el("p", "st-note");
  root.append(limitsBox, limitsNote, head, sub, projectToggle, projectsWrap, toggle, modelsWrap, note);
  host.append(root);

  const limitRows = new Map<string, LimitRow>();
  const modelRows = new Map<string, ModelRow>();
  const projectRows = new Map<string, ModelRow>();
  let last: Usage | null = null;
  let seq = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;
  let loading = false;

  function limitRow(key: string, harness: string): LimitRow {
    let r = limitRows.get(key);
    if (r) return r;
    const rowEl = el("div", "st-limit");
    const top = el("div", "st-ltop");
    const logo = logoFor(harness);
    const mark = el("span", "st-logo");
    if (logo) {
      const img = el("img");
      img.src = logo;
      img.alt = "";
      mark.append(img);
    }
    const name = el("span", "st-lname");
    const reset = el("span", "st-reset");
    top.append(mark, name, reset);
    const barLine = el("div", "st-barline");
    const bar = el("div", "st-bar");
    const fill = el("i");
    bar.append(fill);
    const pct = el("span", "st-pct");
    barLine.append(bar, pct);
    rowEl.append(top, barLine);
    r = { root: rowEl, name, reset, fill, pct };
    limitRows.set(key, r);
    return r;
  }

  function renderLimits(u: Usage) {
    const wanted: { key: string; harness: string; name: string; source: string; limit: Limit }[] = [];
    for (const [group, h] of Object.entries(u.limits)) {
      if (!h) continue;
      const harness = h.harness || group;
      const list = [...(h.windows || [h.primary, h.secondary].filter((l): l is Limit => !!l))];
      list.sort((a, b) => (a.windowMinutes ?? 0) - (b.windowMinutes ?? 0));
      list.forEach((l, i) => wanted.push({ key: `${group}:${l.id || `${l.pool || "legacy"}:${i}`}`, harness, name: h.name || harnessName(harness), source: h.source || "Local logs", limit: l }));
    }
    const keep = new Set(wanted.map((w) => w.key));
    for (const [k, r] of limitRows) if (!keep.has(k)) { r.root.remove(); limitRows.delete(k); }
    wanted.forEach((w, i) => {
      const r = limitRow(w.key, w.harness);
      const l = w.limit;
      setText(r.name, `${w.name} ${l.labelIsComplete && l.label ? l.label : `${l.label ? `${l.label} ` : ""}${windowName(l.windowMinutes).toLowerCase()}`}`);
      r.name.title = r.name.textContent || "";
      const known = typeof l.usedPercent === "number" && Number.isFinite(l.usedPercent);
      const pct = known ? Math.max(0, Math.min(100, l.usedPercent!)) : 0;
      r.root.title = `${l.source || w.source}${l.observedAt ? `, reported ${new Date(l.observedAt).toLocaleString()}` : ""}`;
      if (l.stale) {
        r.fill.style.width = "0%";
        setText(r.pct, "");
        setText(r.reset, l.staleReason || "no reading since reset");
        r.root.classList.add("st-stale");
      } else if (!known) {
        r.fill.style.width = "0%";
        setText(r.pct, "n/a");
        setText(r.reset, l.resetsAt ? `usage unavailable, resets ${when(l.resetsAt)}` : "usage unavailable");
        r.root.classList.add("st-stale");
      } else {
        r.fill.style.width = `${pct}%`;
        setText(r.pct, `${Math.round(pct)}%`);
        setText(r.reset, l.resetsAt ? `resets ${when(l.resetsAt)}` : "");
        r.root.classList.remove("st-stale");
      }
      r.root.classList.toggle("st-high", known && !l.stale && pct >= 90);
      if (limitsBox.children[i] !== r.root) limitsBox.insertBefore(r.root, limitsBox.children[i] || null);
    });
    limitsBox.hidden = wanted.length === 0;
    const available = new Set(wanted.map(w => w.harness));
    const unavailable = (["codex", "claude"] as const).filter((h) => !available.has(h)).map(harnessName);
    const missing = unavailable.length ? `${unavailable.join(" and ")} limits unavailable${u.limitSource ? "" : " in local logs"}` : "";
    setText(limitsNote, [u.limitSource?.detail, missing].filter(Boolean).join(" "));
    limitsNote.hidden = !limitsNote.textContent;
  }

  function renderModels(t: Totals) {
    const entries = Object.entries(t.byModel).sort((a, b) => b[1].tokens - a[1].tokens);
    const top = entries.slice(0, TOP_MODELS);
    const keep = new Set(top.map(([k]) => k));
    for (const [k, r] of modelRows) if (!keep.has(k)) { r.root.remove(); modelRows.delete(k); }
    top.forEach(([model, m], i) => {
      let r = modelRows.get(model);
      if (!r) {
        const li = el("li", "st-model");
        const name = el("span", "st-mname");
        const tokens = el("span", "st-mnum");
        const cost = el("span", "st-mnum st-mcost");
        li.append(name, tokens, cost);
        r = { root: li, name, tokens, cost };
        modelRows.set(model, r);
      }
      setText(r.name, model);
      r.name.title = `${model} (${harnessName(m.harness)})`;
      setText(r.tokens, formatTokens(m.tokens));
      setText(r.cost, m.priced === false ? "no price" : formatCost(m.costUsd));
      r.cost.classList.toggle("st-dim", m.priced === false);
      if (modelList.children[i] !== r.root) modelList.insertBefore(r.root, modelList.children[i] || null);
    });
    const rest = entries.slice(TOP_MODELS);
    if (!entries.length) setText(modelMore, "No usage yet today");
    else if (rest.length) {
      const tokens = rest.reduce((s, [, m]) => s + m.tokens, 0);
      setText(modelMore, `${rest.length} more, ${formatTokens(tokens)} tokens`);
    } else setText(modelMore, "");
    modelMore.hidden = !modelMore.textContent;
  }

  function renderProjects(t: Totals) {
    const entries = Object.entries(t.byProject || {}).sort((a, b) => b[1].costUsd - a[1].costUsd || b[1].tokens - a[1].tokens);
    const keep = new Set(entries.map(([id]) => id));
    for (const [id, r] of projectRows) if (!keep.has(id)) { r.root.remove(); projectRows.delete(id); }
    entries.forEach(([id, p], i) => {
      let r = projectRows.get(id);
      if (!r) {
        const row = el("li", "st-model");
        const name = el("span", "st-mname");
        const tokens = el("span", "st-mnum");
        const cost = el("span", "st-mnum st-mcost");
        row.append(name, tokens, cost);
        r = { root: row, name, tokens, cost }; projectRows.set(id, r);
      }
      setText(r.name, p.name);
      const sources = p.sources;
      r.name.title = `${p.name}\n${sources.session ? `${formatTokens(sources.session)} tokens linked by T3 session. ` : ""}${sources.cwd ? `${formatTokens(sources.cwd)} tokens linked by logged working directory. ` : ""}${sources.unassigned ? "No unique project match." : ""}`;
      setText(r.tokens, formatTokens(p.tokens));
      setText(r.cost, `${formatCost(p.costUsd)}${p.priced === false ? "*" : ""}`);
      r.cost.title = `$${p.costUsd.toFixed(6)} at API prices${p.priced === false ? "; some models have no price" : ""}`;
      if (projectList.children[i] !== r.root) projectList.insertBefore(r.root, projectList.children[i] || null);
    });
    setText(projectNote, !entries.length ? "No project usage yet today" : entries.some(([, p]) => p.priced === false) ? "* Costs exclude models without a price" : "");
    projectNote.hidden = !projectNote.textContent;
  }

  function render(u: Usage) {
    const t = u.windows.today;
    setText(tokNum, formatTokens(t.tokens));
    setText(costNum, formatCost(t.costUsd));
    const w = u.windows.week;
    setText(sub, `Last 7 days ${formatTokens(w.tokens)} tokens, ${formatCost(w.costUsd)}`);
    renderLimits(u);
    // Closed breakdowns need no sorting, row allocation or DOM updates.
    if (toggle.getAttribute("aria-expanded") === "true") renderModels(t);
    if (projectToggle.getAttribute("aria-expanded") === "true") renderProjects(t);
    // Unknown prices already show on their model row; other problems get one quiet line.
    const other = u.errors.filter((e) => !e.startsWith("No API price"));
    setText(note, other.length ? (other.length === 1 ? other[0] : `${other.length} usage logs could not be read`) : "");
    note.title = other.join("\n");
    note.hidden = !other.length;
    root.classList.remove("st-loading");
  }

  async function refresh() {
    if (destroyed || loading) return;
    loading = true;
    const mine = ++seq;
    try {
      const u = await load();
      if (destroyed || mine !== seq) return;
      last = u;
      if (!document.hidden) render(u);
    } catch (err) {
      if (destroyed || mine !== seq) return;
      if (document.hidden) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (last) render(last); // keep the last good numbers
      setText(note, `Usage could not be updated: ${msg}`);
      note.hidden = false;
    } finally { loading = false; }
  }

  const onVisible = () => { if (!document.hidden) { if (last) render(last); void refresh(); } };
  document.addEventListener("visibilitychange", onVisible);
  root.classList.add("st-loading");
  note.hidden = true;
  modelMore.hidden = true;
  limitsBox.hidden = true;
  void refresh();
  timer = setInterval(() => { if (options.background || !document.hidden) void refresh(); }, REFRESH_MS);

  return {
    refresh: () => void refresh(),
    destroy() {
      destroyed = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      root.remove();
    },
  };
}
