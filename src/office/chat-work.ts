import type { TurnWork } from "./chat-message";
import "./chat-work.css";

// T3's work log in the chat: each turn folds its progress updates and actions behind one line,
// "Worked for 7m 17s", above the final reply.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LIVE = new Set(["running", "starting", "preparing"]);

const ICON: Record<TurnWork["lines"][number]["k"], string> = {
  cmd: '<path d="M2.5 4l3.5 4-3.5 4M8 12h5.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  edit: '<path d="M3 13l.7-2.8L10.5 3.4a1.4 1.4 0 012 2L5.8 12.3 3 13z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
  search: '<circle cx="7" cy="7" r="4.2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M10.2 10.2l3.3 3.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  tool: '<path d="M6 2.5h4v3h3v4h-3v4H6v-4H3v-4h3z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  agent: '<rect x="3" y="4.5" width="10" height="8" rx="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 2v2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="6.2" cy="8.5" r=".9" fill="currentColor"/><circle cx="9.8" cy="8.5" r=".9" fill="currentColor"/>',
  error: '<path d="M8 2.5l6 10.5H2z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M8 6.5v3M8 11.3v.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
};
const icon = (k: keyof typeof ICON) => `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">${ICON[k]}</svg>`;

export function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m${s % 60 ? ` ${s % 60}s` : ""}`;
}

const plural = (n: number, one: string, many = `${one}s`) => n ? `${n} ${n === 1 ? one : many}` : "";

export function workLabel(w: TurnWork, now = Date.now()) {
  const live = LIVE.has(w.status);
  const start = w.startedAt ? Date.parse(w.startedAt) : NaN;
  const end = w.completedAt ? Date.parse(w.completedAt) : now;
  const took = Number.isFinite(start) ? duration(end - start) : "";
  const head = live ? `Working${took ? ` for ${took}` : ""}` : /fail/.test(w.status) ? `Failed${took ? ` after ${took}` : ""}`
    : /interrupt|cancel/.test(w.status) ? `Stopped${took ? ` after ${took}` : ""}` : `Worked${took ? ` for ${took}` : ""}`;
  const counts = [plural(w.commands, "command"), plural(w.edits, "file"), plural(w.searches, "search", "searches"), plural(w.tools, "tool"), plural(w.agents, "subagent")].filter(Boolean);
  return { head, counts, live };
}

const CHEVRON = `<svg class="cw-chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The fold's one line: "Worked for 7m 17s ›  31 commands · 2 files". */
export function turnLabel(w: TurnWork | null, startAt: string | null, endAt: string | null, live: boolean, updates: number) {
  let head: string, counts: string[] = [], failed = 0;
  if (w) ({ head, counts } = workLabel(w)), failed = w.failed;
  else {
    const start = startAt ? Date.parse(startAt) : NaN, end = endAt ? Date.parse(endAt) : Date.now();
    const took = Number.isFinite(start) && end > start ? duration(end - start) : "";
    head = live ? `Working${took ? ` for ${took}` : ""}` : `Worked${took ? ` for ${took}` : ""}`;
  }
  if (updates) counts.push(plural(updates, "update"));
  return `<span class="cw-head">${esc(head)}</span>${CHEVRON}`
    + (counts.length ? `<span class="cw-counts">${esc(counts.join(" · "))}</span>` : "")
    + (failed ? `<span class="cw-bad">${failed} failed</span>` : "");
}

// The program a shell line runs, like T3's "Ran rg": skip cd, env assignments and sudo.
function program(cmd: string) {
  for (const part of cmd.split(/&&|\|\||;|\|/)) {
    const words = part.trim().split(/\s+/).filter(w => !/^[A-Z_][A-Z0-9_]*=/.test(w) && w !== "sudo" && w !== "env" && w !== "exec");
    if (!words.length || words[0] === "cd") continue;
    return words[0].split("/").pop()!.replace(/^["']|["']$/g, "");
  }
  return "command";
}
const sentence = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** One action as T3 words it: a short label, and the detail in muted mono. */
function describe(l: TurnWork["lines"][number]): { label: string; detail: string } {
  const running = LIVE.has(l.s) || l.s === "pending", failed = l.s === "failed";
  if (l.k === "cmd") return { label: `${running ? "Running" : failed ? "Failed" : "Ran"} ${program(l.t)}`, detail: l.t };
  if (l.k === "edit") {
    const name = l.t.split(/[\\/]/).pop() || l.t;
    return { label: `${running ? "Editing" : "Edited"} ${name}`, detail: l.t.slice(0, l.t.length - name.length).replace(/[\\/]$/, "") };
  }
  if (l.k === "search") return /^https?:\/\//.test(l.t) ? { label: running ? "Opening page" : "Opened page", detail: l.t } : { label: running ? "Searching the web" : "Searched the web", detail: l.t };
  if (l.k === "agent") return { label: "Subagent", detail: l.t };
  if (l.k === "error") return { label: "Error", detail: l.t };
  return { label: sentence(l.t), detail: "" };
}

type Line = TurnWork["lines"][number];
type Action = "command" | "edit" | "search" | "agent" | "other";
const actionOf = (l: Line): Action => l.k === "cmd" ? "command" : l.k === "edit" ? "edit" : l.k === "search" ? "search" : l.k === "agent" ? "agent" : "other";
const PRIORITY: Record<Action, number> = { command: 0, edit: 0, agent: 1, search: 2, other: 3 };
const actionLabel = (a: Action, n: number) => a === "command" ? `Ran ${n} ${n === 1 ? "command" : "commands"}`
  : a === "edit" ? `Changed ${n} ${n === 1 ? "file" : "files"}`
  : a === "search" ? `Searched the web ${n} ${n === 1 ? "time" : "times"}`
  : a === "agent" ? `Started ${n} ${n === 1 ? "subagent" : "subagents"}`
  : `Used ${n} ${n === 1 ? "tool" : "tools"}`;

/** T3's sentence for a run of tool calls (client-runtime summarizeToolGroup): integrations used,
 * then the two most important actions, then "performed N other actions". */
export function summarizeTools(lines: Line[]) {
  const sources: string[] = [];
  const groups = new Map<Action, Line[]>();
  for (const l of lines) {
    if (l.k === "tool" && l.src) { if (!sources.includes(l.src)) sources.push(l.src); continue; }
    const a = actionOf(l);
    groups.set(a, [...(groups.get(a) ?? []), l]);
  }
  const summaries = [...groups].map(([a, ls], index) => ({ index, a, count: ls.length, label: actionLabel(a, a === "edit" ? new Set(ls.map(l => l.t)).size : ls.length) }));
  const selected = [...summaries].sort((x, y) => PRIORITY[x.a] - PRIORITY[y.a] || x.index - y.index).slice(0, 2).sort((x, y) => x.index - y.index);
  const labels = selected.map(x => x.label);
  if (sources.length) {
    const names = sources.length < 2 ? sources[0] : sources.length === 2 ? sources.join(" and ") : `${sources.slice(0, -1).join(", ")}, and ${sources.at(-1)}`;
    labels.unshift(`Used ${names} ${sources.length === 1 ? "integration" : "integrations"}`);
  }
  const sourced = lines.filter(l => l.k === "tool" && l.src).length;
  const remaining = lines.length - sourced - selected.reduce((n, x) => n + x.count, 0);
  if (remaining > 0) labels.push(`Performed ${remaining} other ${remaining === 1 ? "action" : "actions"}`);
  const words = labels.map((l, i) => i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1));
  const summary = words.length < 3 ? words.join(" and ") : `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;
  const kinds = new Set(lines.map(l => l.k === "tool" && l.src ? "src" : actionOf(l)));
  const iconKind: keyof typeof ICON = kinds.size !== 1 ? "tool" : lines[0].k === "error" ? "error" : lines[0].k;
  return { summary, iconKind, failed: lines.some(l => l.s === "failed" || l.k === "error") };
}

const CHEVRON_ROW = `<svg class="cw-chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FAILED = `<svg class="cw-x" viewBox="0 0 16 16" width="11" height="11" aria-label="Failed" role="img"><path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const clock = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; };

function rowsHtml(lines: Line[]) {
  const rows: { l: Line; n: number }[] = [];
  for (const l of lines) {
    const last = rows.at(-1);
    if (last && last.l.k === l.k && last.l.t === l.t && (last.l.s === "failed") === (l.s === "failed")) { last.n++; last.l = l; }
    else rows.push({ l, n: 1 });
  }
  return rows.map(({ l, n }) => {
    const { label, detail } = describe(l);
    const bad = l.s === "failed" || l.k === "error", running = LIVE.has(l.s) || l.s === "pending";
    return `<li class="cw-${l.k}${bad ? " bad" : ""}${running ? " live" : ""}" title="${esc(l.t)}">${icon(l.k)}<b>${esc(label)}</b>${detail ? `<span>${esc(detail)}</span>` : ""}${n > 1 ? `<em>×${n}</em>` : ""}${bad ? FAILED : ""}<time>${esc(clock(l.a))}</time></li>`;
  }).join("");
}

/** A run of tool calls between two messages, as T3 shows it: one call is its own row; several
 * collapse into one summary line that opens into a small scroll box following the newest call. */
export function workGroup(lines: Line[], key: string, open: boolean) {
  if (lines.length === 1) return `<ol class="cw-list cw-single">${rowsHtml(lines)}</ol>`;
  const { summary, iconKind, failed } = summarizeTools(lines);
  return `<div class="cw-group${open ? " open" : ""}" data-key="${esc(key)}"><button type="button" class="cw-toggle${failed ? " bad" : ""}" aria-expanded="${open}">${icon(iconKind)}<b>${esc(summary)}</b>${failed ? FAILED : ""}${CHEVRON_ROW}</button>`
    + `<div class="cw-scroll" role="region" aria-label="Tool calls" tabindex="0"${open ? "" : " hidden"}><ol class="cw-list">${rowsHtml(lines)}</ol></div></div>`;
}
