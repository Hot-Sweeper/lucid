import { Marked } from "marked";
import DOMPurify from "dompurify";
import { fileUrl } from "./chat-panel";
import { reportPortrait, reportIcon } from "./report-art";
import "./report.css";
import { harnessName, logoFor } from "../robot";
import { costText } from "./orchestrator-panel";
import { esc } from "../util/html";

const state = (s: string) => ({ "manager-excluded": "Pinned, excluded from automatic review", "pending-dependency": "Waiting for dependency evidence", submitted: "Awaiting delivery", reviewing: "Under review", approved: "Approved, ready to collect", settled: "Settled", "manual-review": "Needs review", "changes-requested": "Changes requested", superseded: "Replaced by newer work" }[s] || s);
const date = (s: string) => s ? new Date(s).toLocaleString() : "Not recorded";
const md = new Marked({ breaks: true });
const markdown = (s: string) => DOMPurify.sanitize(md.parse(s || "") as string, { FORBID_TAGS: ["img"] });
/** Sanitized report markdown, shared with the orchestrator's chair. */
export const reportMarkdown = markdown;
function dialog(label: string) {
  const wrap = document.createElement("div"); wrap.className = "dialog-wrap";
  wrap.innerHTML = `<section class="dialog settlement-paper" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="paper-heading"><h2>${esc(label)}</h2><button type="button" class="ghost" data-close>Close</button></div><div class="paper-body" role="status">Loading...</div></section>`;
  const previous = document.activeElement as HTMLElement | null;
  const close = () => { wrap.remove(); window.removeEventListener("keydown", key, true); previous?.focus(); };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape" && [...document.querySelectorAll(".dialog-wrap")].at(-1) === wrap) { e.stopImmediatePropagation(); close(); } };
  wrap.addEventListener("click", e => { if (e.target === wrap || (e.target as HTMLElement).closest("[data-close]")) close(); });
  window.addEventListener("keydown", key, true); document.body.appendChild(wrap);
  wrap.querySelector<HTMLButtonElement>("[data-close]")!.focus();
  return { wrap, close, body: wrap.querySelector<HTMLElement>(".paper-body")! };
}

const threadUrl = (id: string) => { const url = new URL(location.href); url.searchParams.set("thread", id); url.hash = ""; return url.href; };
const identity = (member: any) => `<dl class="paper-model"><div><dt>Harness</dt><dd>${member.provider ? esc(harnessName(member.provider)) : "Not recorded"}</dd></div><div><dt>Model</dt><dd>${esc(member.model || "Not recorded")}</dd></div><div><dt>Thinking effort</dt><dd>${esc(member.effort || "Not recorded")}</dd></div></dl>`;

export async function showReport(id: string, title: string, openThread: () => void, paperId?: string, openRelated?: (id: string) => void, focusQuestions = false) {
  const api = (window as any).lucid;
  const view = dialog(title);
  try {
    const papers = await api.reportsList();
    const p = papers.find((p: any) => paperId ? p.id === paperId : p.threadId === id);
    if (!view.wrap.isConnected) return;
    if (!p) { view.body.textContent = "No saved submission yet. It will appear when the robot finishes its queue."; return; }
    const cost = p.usage?.costUsd == null ? "Unavailable" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(p.usage.costUsd);
    const team = p.team?.length ? p.team : [{ threadId: p.threadId, title: p.title, role: "Owner", provider: p.provider, model: p.model, effort: p.effort, robot: p.robot }, ...p.children.map((c: any) => ({ ...c, threadId: c.id, role: "Subagent" }))];
    view.body.innerHTML = `
      <div class="paper-owner">
        <div class="paper-portrait">${reportPortrait(p.provider, p.robot.look || {})}</div>
        <div class="paper-owner-name"><strong>${esc(p.robot.name)}</strong><span>${esc(p.project)}</span>${identity(p)}</div>
        <div class="paper-verdict" data-state="${esc(p.status)}">${reportIcon(p.status === "settled" ? "check" : "paper")}<strong>${esc(state(p.status))}</strong><span>${p.reviewer ? `Reviewed by ${esc(p.reviewer)}` : "Waiting at the review desk"}</span></div>
      </div>
      <div class="paper-thread"><a href="${esc(threadUrl(p.threadId))}" data-related-thread="${esc(p.threadId)}">Open source thread</a><code>${esc(p.threadId)}</code><button type="button" class="ghost" data-copy-thread>Copy ID</button></div>
      ${team.length > 1 ? `<section class="paper-team"><h3>${reportIcon("crew")}Team</h3><ul>${team.map((m: any) => `<li>${m.robot?.look ? reportPortrait(m.provider || p.provider, m.robot.look, 64) : (logoFor(m.provider, "light") ? `<img class="paper-harness-logo" src="${logoFor(m.provider, "light")}" alt="">` : reportIcon("crew"))}<div><a href="${esc(threadUrl(m.threadId))}" data-related-thread="${esc(m.threadId)}">${esc(m.robot?.name || m.title || "Contributor")}</a><span class="paper-team-role">${esc(m.role)}${m.runIds?.length ? `, ${m.runIds.length} ${m.runIds.length === 1 ? "run" : "runs"}` : ""}</span>${identity(m)}</div></li>`).join("")}</ul></section>` : ""}
      <div class="paper-resources">
        <div>${reportIcon("crew")}<span><strong>${p.children.length}</strong> linked subagents</span></div>
        <div>${reportIcon("energy")}<span><strong>${p.usage?.tokens == null ? "Unavailable" : Number(p.usage.tokens).toLocaleString()}</strong> observed tokens</span></div>
        <div>${reportIcon("coin")}<span><strong>${esc(cost)}</strong> API estimate</span></div>
        ${costText(p.reviewUsage) ? `<div>${reportIcon("check")}<span><strong>${esc(costText(p.reviewUsage))}</strong> for the orchestrator's review</span></div>` : ""}
      </div>
      <div class="paper-result"><h3>${reportIcon("paper")}What changed</h3><p>${esc(p.verdict?.summary || (p.response || "Waiting for the robot's report.").replace(/<[^>]*>/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/[#*_`>]/g, "").split(/\n\s*\n/)[0].slice(0, 420))}</p></div>
      ${p.verdict?.humanChecks?.length ? `<section class="paper-checks"><h3>Human questionnaire</h3>${p.verdict.humanChecks.map((c: any, i: number) => `<div><p><strong>${esc(c.question)}</strong></p><p>${esc(c.instructions)}</p><label>Your answer <select data-human-answer="${i}"><option value="">Not answered</option>${[["yes", "Yes"], ["no", "No"], ["unable", "Cannot check yet"]].map(([value, label]) => `<option value="${value}" ${p.humanAnswers?.[i]?.answer === value ? "selected" : ""}>${label}</option>`).join("")}</select></label></div>`).join("")}</section>` : ""}
      ${p.error ? `<p class="form-msg" role="status">${esc(p.error)}</p>` : ""}
      <section class="paper-comparison" aria-label="Before and after"><h3>${reportIcon("image")}Before &amp; after</h3><div class="paper-evidence"><div class="paper-image-group" data-group="Before"><h4>${reportIcon("back")}Before</h4><p class="paper-missing">Before image not supplied</p></div><div class="paper-image-group" data-group="After"><h4>After${reportIcon("next")}</h4><p class="paper-missing">After image not supplied</p></div><details class="paper-other" data-group="Evidence"><summary>Other images</summary></details></div>${!p.images.length ? '<p class="hint">No screenshots saved. Request before and after evidence for visual changes.</p>' : ""}</section>
      <details class="paper-checks" ${p.verdict?.checks?.length ? "open" : ""}><summary>${reportIcon("check")}Checks (${p.verdict?.checks?.length || 0})</summary>${p.verdict?.checks?.length ? `<ul>${p.verdict.checks.map((c: string) => `<li>${reportIcon("check")}${esc(c)}</li>`).join("")}</ul>` : "<p class=hint>No validation recorded yet.</p>"}</details>
      <details class="paper-full"><summary>Full report and job details</summary><div class="paper-prose">${markdown(p.response)}</div><h3>Requested work</h3><div class="paper-prose">${markdown(p.originalRequest)}${p.initialRequest && p.initialRequest !== p.originalRequest ? `<h3>Initial task</h3>${markdown(p.initialRequest)}` : ""}</div>
      <dl class="paper-facts"><div><dt>Submitted</dt><dd>${esc(date(p.submittedAt))}</dd></div><div><dt>Settled</dt><dd>${p.settledAt ? esc(date(p.settledAt)) : "Pending"}</dd></div></dl><p class="hint">${esc(p.usage?.scope || "Usage has not been recorded for this session.")}</p>
      ${p.children.length ? `<h3>Subagent contributions</h3><ul>${p.children.map((c: any) => `<li>${esc(c.title)} (${esc(c.model || c.provider || "Model not recorded")})</li>`).join("")}</ul>` : ""}</details>
      <details class="paper-manual" ${["settled", "superseded"].includes(p.status) ? "hidden" : ""}><summary>Review this submission yourself</summary><label>Decision and feedback<textarea rows="3" data-summary></textarea></label><label>Checks and results, one per line<textarea rows="3" data-checks></textarea></label><label class="paper-check"><input type="checkbox" data-visual ${p.verdict?.visualChanged ? "checked" : ""}>This job changed visuals</label><div class="paper-actions"><button class="primary" type="button" data-action="approve">Approve</button><button class="ghost" type="button" data-action="changes">Request changes</button></div></details>
      <details class="paper-history"><summary>Decision history</summary><ol class="paper-trail">${p.history.map((h: any) => `<li><time>${esc(date(h.at))}</time><strong>${esc(h.action)}, ${esc(h.by)}</strong>${h.reason ? `<p>${esc(h.reason)}</p>` : ""}</li>`).join("")}</ol></details>
      <p class="form-msg" data-status role="status"></p><div class="paper-actions"><button type="button" class="ghost" data-thread>Chat with robot</button><button type="button" class="ghost" data-evidence>Request missing evidence</button><button type="button" class="ghost" data-action="retry" ${["settled", "superseded"].includes(p.status) ? "hidden" : ""}>Retry automatic review</button>${p.status === "settled" ? '<button type="button" class="ghost" data-action="reopen">Reopen task</button>' : ""}</div>`;
    view.body.querySelectorAll<HTMLSelectElement>("[data-human-answer]").forEach(select => {
      select.addEventListener("change", async () => {
        if (!select.value) return;
        select.disabled = true;
        try {
          const saved = await api.reportsManual(p.id, "human-answer", { index: Number(select.dataset.humanAnswer), answer: select.value });
          p.humanAnswers = saved.humanAnswers;
          // Your last answer can finish the orchestrator's approval: show the new state.
          if (saved.status !== p.status || saved.error !== p.error) { view.close(); void showReport(id, title, openThread, p.id, openRelated); return; }
        }
        catch { select.value = p.humanAnswers?.[select.dataset.humanAnswer!]?.answer || ""; view.body.querySelector<HTMLElement>("[data-status]")!.textContent = "Could not save your answer. Try again."; }
        finally { select.disabled = false; }
      });
    });
    if (focusQuestions) view.body.querySelector<HTMLSelectElement>("[data-human-answer]")?.focus();
    const summary = view.body.querySelector<HTMLTextAreaElement>("[data-summary]")!;
    const checks = view.body.querySelector<HTMLTextAreaElement>("[data-checks]")!;
    summary.value = p.verdict?.summary || ""; checks.value = (p.verdict?.checks || []).join("\n");
    const evidence = view.body.querySelector(".paper-evidence")!;

    const labels = new Map<string, string>(p.images.map((i: any) => [i.source, i.label]));
    for (const image of p.images) {
      const figure = document.createElement("figure"), img = document.createElement("img"), select = document.createElement("select");
      img.src = fileUrl(image.path); img.alt = `${image.label}: ${image.name}`; img.loading = "lazy";
      const inspect = () => {
        const enlarged = dialog(`${image.label}: ${image.name}`);
        const full = document.createElement("img"); full.src = fileUrl(image.path); full.alt = img.alt; full.style.cssText = "max-width:100%;height:auto";
        full.addEventListener("error", () => { enlarged.body.textContent = "This saved image is unavailable."; });
        enlarged.body.replaceChildren(full);
      };
      img.tabIndex = 0; img.setAttribute("role", "button"); img.setAttribute("aria-label", `Inspect ${img.alt}`);
      img.addEventListener("click", inspect);
      img.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inspect(); } });
      img.addEventListener("error", () => { img.hidden = true; const note = document.createElement("p"); note.textContent = `Image unavailable: ${image.name}`; figure.appendChild(note); });
      for (const name of ["Before", "After", "Evidence"]) { const option = document.createElement("option"); option.value = name; option.textContent = name; select.appendChild(option); }
      select.value = ["Before", "After"].includes(image.label) ? image.label : "Evidence"; select.setAttribute("aria-label", `Evidence role for ${image.name}`);
      const place = () => {
        const group = evidence.querySelector(`[data-group="${select.value}"]`)!;
        labels.set(image.source, select.value); group.appendChild(figure);
        img.alt = `${select.value}: ${image.name}`;
        for (const name of ["Before", "After"]) {
          const column = evidence.querySelector(`[data-group="${name}"]`)!;
          (column.querySelector(".paper-missing") as HTMLElement).hidden = !!column.querySelector("figure");
        }
        (evidence.querySelector(".paper-other") as HTMLElement).hidden = !evidence.querySelector(".paper-other figure");
      };
      select.addEventListener("change", place);
      const caption = document.createElement("figcaption"); caption.textContent = image.name;
      const label = document.createElement("details"); label.className = "paper-image-label";
      const labelTitle = document.createElement("summary"); labelTitle.textContent = "Label image";
      label.append(labelTitle, select); label.hidden = ["settled", "superseded"].includes(p.status); figure.append(img, caption, label); place();
    }
    (evidence.querySelector(".paper-other") as HTMLElement).hidden = !evidence.querySelector(".paper-other figure");
    view.body.addEventListener("click", e => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("[data-related-thread]");
      if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault(); const thread = link.dataset.relatedThread!; view.close();
      if (openRelated) openRelated(thread); else if (thread === id) openThread(); else location.assign(link.href);
    });
    view.body.querySelector("[data-copy-thread]")!.addEventListener("click", async () => {
      const status = view.body.querySelector<HTMLElement>("[data-status]")!;
      try { await navigator.clipboard.writeText(p.threadId); status.textContent = "Thread ID copied."; }
      catch { status.textContent = "Copy was unavailable. Select the thread ID to copy it."; }
    });
    view.body.querySelector("[data-thread]")!.addEventListener("click", () => { view.close(); openThread(); });
    const status = view.body.querySelector<HTMLElement>("[data-status]")!;
    let saving = false;
    view.body.addEventListener("click", async e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-action], [data-evidence]");
      if (!button || saving) return;
      const action = button.dataset.action;
      if (["approve", "changes"].includes(action || "") && !summary.value.trim()) { status.textContent = "Enter a decision or concrete feedback first."; summary.focus(); return; }
      saving = true; button.disabled = true; status.textContent = "Saving...";
      try {
        if (button.hasAttribute("data-evidence")) {
          await api.sendMessage({ threadId: id, message: "Prepare completion evidence for review. Include what changed, real validation results and linked or attached before and after screenshots for visual changes. Never invent an unavailable before state. Clearly state missing evidence. Keep this job unsettled until review." });
          status.textContent = "Evidence requested. A new paper will be submitted when the robot finishes.";
        } else {
          const result = await api.reportsManual(p.id, action, { summary: summary.value.trim(), feedback: summary.value.trim(), checks: checks.value.split("\n").map(s => s.trim()).filter(Boolean), visualChanged: view.body.querySelector<HTMLInputElement>("[data-visual]")!.checked, before: [...labels].filter(([, role]) => role === "Before").map(([source]) => source), after: [...labels].filter(([, role]) => role === "After").map(([source]) => source) });
          if (result.error) status.textContent = result.error;
          else { view.close(); void showReport(id, title, openThread, p.id, openRelated); }
        }
      } catch (e: any) { status.textContent = e.message || "Could not save the decision. Try again."; }
      finally { saving = false; button.disabled = false; }
    });
  } catch { view.body.textContent = "Could not load this paper. Reopen it to retry."; }
}

export async function showReportArchive(openThread: (id: string) => void) {
  const view = dialog("Settlement papers");
  try {
    const [papers, approvals] = await Promise.all([(window as any).lucid.reportsList(), (window as any).lucid.approvalPapers()]);
    if (!view.wrap.isConnected) return;
    view.body.innerHTML = `<div class="paper-search"><input type="search" aria-label="Find a report" placeholder="Find a job, robot, or project"><select aria-label="Filter reports"><option value="all">Job submissions</option><option value="approvals">Questions and approvals</option><option value="open">Awaiting settlement</option><option value="settled">Settled</option><option value="changes-requested">Changes requested</option></select></div><div class="paper-register"></div>`;
    const search = view.body.querySelector<HTMLInputElement>("input")!, filter = view.body.querySelector<HTMLSelectElement>("select")!, list = view.body.querySelector<HTMLElement>(".paper-register")!;
    const render = () => {
      if (filter.value === "approvals") {
        list.replaceChildren();
        for (const a of approvals.filter((a: any) => `${a.title} ${a.questions} ${a.robot?.name || ""}`.toLowerCase().includes(search.value.toLowerCase()))) {
          const row = document.createElement("button"); row.type = "button"; row.className = "paper-register-row";
          row.innerHTML = `<strong>${esc(a.questions || a.title)}</strong><span>${esc(a.robot?.name || a.title)}, ${esc(a.outcome === "answered" ? "Answered by orchestrator" : a.outcome === "user" ? "Answered by you" : "Passed to you")}</span><time>${esc(date(a.at))}</time>`;
          row.addEventListener("click", () => {
            view.close(); const paper = dialog(a.title || "Decision paper");
            paper.body.innerHTML = `<h3>${esc(a.questions)}</h3><p>${esc(a.robot?.name || "Robot")}, ${esc(a.project)}</p><p>${esc(a.answer || a.userAnswer || a.suggestion || "No answer recorded")}</p><p>${esc(a.reason)}</p><h3>Decision history</h3>${(a.updates || []).map((u: any) => `<p>${esc(date(u.at))}, ${esc(u.outcome)}<br>${esc(u.reason)}</p>`).join("")}`;
          }); list.appendChild(row);
        }
        if (!list.children.length) list.textContent = "No matching decision papers.";
        return;
      }
      const matches = papers.filter((p: any) => `${p.title} ${p.robot.name} ${p.project}`.toLowerCase().includes(search.value.toLowerCase()) && (filter.value === "all" || (filter.value === "open" ? !["settled", "superseded", "changes-requested"].includes(p.status) : p.status === filter.value)));
      list.replaceChildren();
      for (const p of matches) {
        const row = document.createElement("button"); row.type = "button"; row.className = "paper-register-row";
        row.innerHTML = `${reportPortrait(p.provider, p.robot.look || {}, 62)}<div><strong>${esc(p.title)}</strong><span>${esc(p.robot.name)}, ${esc(p.project)}</span><time>${esc(date(p.submittedAt))}</time></div><span class="paper-row-state" data-state="${esc(p.status)}">${reportIcon(p.status === "settled" ? "check" : "paper")}${esc(state(p.status))}</span>`;
        row.addEventListener("click", () => { view.close(); void showReport(p.threadId, p.title, () => openThread(p.threadId), p.id, openThread); });
        list.appendChild(row);
      }
      if (!matches.length) list.textContent = papers.length ? "No matching papers." : "No submissions yet.";
    };
    search.addEventListener("input", render); filter.addEventListener("change", render); render();
  } catch { view.body.textContent = "Could not load the archive. Reopen it to retry."; }
}
