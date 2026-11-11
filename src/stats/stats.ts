// Usage block for the side panel: today's tokens and API-price cost, plan limits per
// harness (only where the logs report them), and a per-model breakdown on demand.
// Data comes from electron/usage.cjs through the `load` callback.
import "./stats.css";
import { harnessName } from "../robot";
import { el, setText } from "./dom";
import { mountLimits, type LimitsOptions } from "./limits";
import type { LimitView } from "./limit-pace";

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

export type ResetCredits = { availableCount: number; nextExpiresAt: string | null };

export type HarnessLimits = {
  harness?: string;
  /** T3 provider instance; reset credits are redeemed per instance. */
  instanceId?: string;
  resetCredits?: ResetCredits;
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

export type StatsOptions = LimitsOptions & {
  background?: boolean;
  /** Show limits as used (filling up) or left (counting down). */
  limitView?: LimitView;
};
type ModelRow = { root: HTMLElement; name: HTMLElement; tokens: HTMLElement; cost: HTMLElement };

export function mountStats(host: HTMLElement, load: () => Promise<Usage>, options: StatsOptions = {}): { refresh(): void; destroy(): void; setLimitView(view: LimitView): void } {
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

  const limitsBox = el("div", "lim-groups");

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
  const limitsNote = el("p", "lim-source");
  const note = el("p", "st-note");
  root.append(limitsBox, limitsNote, head, sub, projectToggle, projectsWrap, toggle, modelsWrap, note);
  host.append(root);

  const modelRows = new Map<string, ModelRow>();
  const projectRows = new Map<string, ModelRow>();
  let last: Usage | null = null;
  let seq = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;
  let loading = false;
  let view: LimitView = options.limitView === "left" ? "left" : "used";
  const limits = mountLimits(limitsBox, limitsNote, options, { destroyed: () => destroyed, refresh: () => void refresh() });

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
    limits.render(u, view);
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

  let again = false;
  async function refresh() {
    if (destroyed) return;
    if (loading) { again = true; return; } // e.g. right after a reset credit: read once more
    again = false;
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
    } finally {
      loading = false;
      if (again && !destroyed) void refresh();
    }
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
    setLimitView(next) {
      if (next === view) return;
      view = next;
      if (last && !document.hidden) limits.render(last, view);
    },
    destroy() {
      destroyed = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      root.remove();
    },
  };
}
