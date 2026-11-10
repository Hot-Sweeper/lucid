import type { Orchestrator, OrchState, Usage } from "./orchestrator";
import type { Decision } from "./delegate";

// The sidebar section: whether it is on, healthy and what it costs, its two duties, and
// its latest decisions with the reason for each. Everything opens the real record.

export type PanelActions = {
  setup(): void; settings(): void; chair(): void; archive(): void; chat(id: string): void;
  notebook(): void; decisions(): void; paper(p: any): void;
  setReview(on: boolean): void; setAuto(on: boolean): void;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const tokens = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
/** "12.4K tokens, $0.31" or null when its sessions are not in the local logs. */
export function costText(u: Usage | undefined) {
  if (!u?.available || u.tokens == null) return null;
  return `${tokens.format(u.tokens)} tokens${u.costUsd == null ? "" : `, ${usd.format(u.costUsd)}`}`;
}
function ago(iso: string) {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "now";
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return new Date(iso).toLocaleDateString();
}
const VERDICT: Record<string, string> = { approved: "Approved", settled: "Approved and collected", "changes-requested": "Asked for changes", "manual-review": "Passed to you", "pending-dependency": "On hold" };

type Row = { at: string; title: string; text: string; open: () => void };
const sig = new WeakMap<HTMLElement, string>(), live = new WeakMap<HTMLElement, { rows: Row[]; a: PanelActions; s: OrchState | null }>();
/** Its latest decisions, settlement reviews and questions together, newest first. */
export function activity(papers: any[], log: Decision[], actions: Pick<PanelActions, "paper" | "decisions">, limit = 5): Row[] {
  const rows: Row[] = [];
  for (const p of papers) {
    const own = [...(p.history ?? [])].reverse().find((h: any) => h.by === "Orchestrator" && String(h.action).startsWith("Review"));
    if (!own || !VERDICT[p.status]) continue;
    const cost = costText(p.reviewUsage);
    rows.push({ at: own.at, title: p.title, text: `${VERDICT[p.status]}: ${p.error || p.verdict?.summary || own.reason || "No reason recorded"}${cost ? ` (${cost})` : ""}`, open: () => actions.paper(p) });
  }
  for (const d of log) {
    if (d.outcome === "user") continue;
    const cost = costText(d.cost);
    const head = d.outcome === "answered" ? `Answered ${d.answer ?? ""}`.trim() : d.outcome === "failed" ? "Could not decide, asked you" : "Asked you";
    rows.push({ at: d.at, title: d.questions || d.title, text: `${head}: ${d.reason}${cost ? ` (${cost})` : ""}`, open: () => actions.decisions() });
  }
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

export function renderOrchestratorPanel(body: HTMLElement, s: OrchState | null, orch: Orchestrator, log: { auto: number; asked: number; log: Decision[] }, remote: boolean, a: PanelActions) {
  let html: string, rows: Row[] = [];
  if (!s) {
    html = `<p class="hint">Optional. A stand-in that learns how you like things done, reviews finished work and answers routine questions for you.</p>
      <div class="orch-actions"><button type="button" class="primary" data-a="setup" ${remote ? "disabled" : ""}>Set up the orchestrator</button><button type="button" class="ghost" data-a="archive">Settlement papers</button></div>
      ${remote ? `<p class="hint">Set it up from this computer's own building.</p>` : ""}`;
  } else {
    const st = orch.status, thread = st?.thread;
    const problems = [
      thread && !thread.exists ? `Its thread in T3 is ${thread.archived ? "archived" : "gone"}. Set it up again to keep its notes and continue.` : "",
      st?.folderError ?? "", st?.repairError ?? "",
    ].filter(Boolean);
    const today = costText(st?.usage?.today), week = costText(st?.usage?.week);
    const waiting = orch.waiting.length;
    rows = activity(orch.papers, log.log, a);
    html = `
      <p class="orch-health">${s.paused ? "<b>Off.</b> New automatic decisions are held for you." : `<b>On.</b> ${[s.review ? "Reviews finished work" : "", s.auto !== false ? "answers routine questions" : ""].filter(Boolean).join(" and ") || "Only learning from your messages"}.`}</p>
      ${problems.map(p => `<p class="orch-health warn" role="status">${esc(p)}</p>`).join("")}
      ${thread?.exists ? `<p class="orch-health">Its own cost: ${today ? `<b>${esc(today)}</b> today` : "nothing recorded today"}${week ? `, <b>${esc(week)}</b> in 7 days` : ""}.</p>` : ""}
      ${waiting ? `<button type="button" class="link-btn" data-a="chair">${waiting} ${waiting === 1 ? "report needs" : "reports need"} your review</button>` : ""}
      <label class="switch"><input type="checkbox" data-a="review" ${s.review ? "checked" : ""}><span class="track" aria-hidden="true"><i></i></span><span>Review finished work for me</span></label>
      <label class="switch"><input type="checkbox" data-a="auto" ${s.auto !== false ? "checked" : ""}><span class="track" aria-hidden="true"><i></i></span><span>Answer routine questions for me</span></label>
      ${rows.length ? `<h4 class="orch-sub">Latest decisions</h4><ul class="orch-activity">${rows.map((r, i) => `<li><button type="button" data-row="${i}"><strong>${esc(r.title)}</strong><time datetime="${esc(r.at)}">${esc(ago(r.at))}</time><span>${esc(r.text)}</span></button></li>`).join("")}</ul>` : `<p class="hint">No decisions yet. Its reviews and answers appear here with the reason for each.</p>`}
      <p class="orch-line">Learned from <b>${s.learned}</b> of your messages</p>
      <p class="orch-line">Answered <b>${log.auto}</b> ${log.auto === 1 ? "question" : "questions"} for you, asked you <b>${log.asked}</b></p>
      <div class="orch-actions">${thread && !thread.exists ? `<button type="button" class="primary" data-a="setup">Set up again</button>` : ""}<button type="button" class="ghost" data-a="archive">Settlement papers</button><button type="button" class="ghost" data-a="chat">Chat with it</button><button type="button" class="ghost" data-a="decisions">Questions it handled</button><button type="button" class="ghost" data-a="notebook">Its notebook</button><button type="button" class="ghost" data-a="settings">Settings</button></div>`;
  }
  // Frequent refreshes must not rebuild an unchanged panel (that would steal focus mid-click).
  if (sig.get(body) === html) { live.set(body, { rows, a, s }); return; }
  sig.set(body, html); live.set(body, { rows, a, s });
  body.innerHTML = html;
  body.querySelectorAll<HTMLButtonElement>("[data-row]").forEach(b => b.addEventListener("click", () => live.get(body)!.rows[Number(b.dataset.row)]?.open()));
  body.querySelectorAll<HTMLElement>("[data-a]").forEach(el => {
    const kind = el.dataset.a!;
    const act = () => live.get(body)!.a;
    if (el instanceof HTMLInputElement) el.addEventListener("change", () => kind === "review" ? act().setReview(el.checked) : act().setAuto(el.checked));
    else el.addEventListener("click", () => {
      const current = live.get(body)!.s;
      if (kind === "chat" && current) act().chat(current.threadId);
      else if (kind !== "chat") (act() as any)[kind]();
    });
  });
}
