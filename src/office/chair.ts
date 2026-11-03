import gsap from "gsap";
import { Walker } from "../world/walker";
import { fileUrl } from "./chat-panel";
import { reportMarkdown } from "./report";
import { harnessName } from "./brand";
import { gameSound } from "./sound";
import type { RobotProfile } from "./roster";
import "./chair.css";

// The orchestrator's chair. You take its seat behind the review counter: the workers who
// brought reports wait in line in front of you, the first one's report lies on the counter,
// and you stamp it approved or hand it back with a follow-up note. While you sit here the
// AI orchestrator rests; leaving the chair hands review back to it. Nothing is decided
// unless you press a button, so a report you were reading simply stays first in line.

const WAITING = new Set(["submitted", "reviewing", "manual-review"]);
type Paper = any;
export type ChairOptions = {
  papers: () => Paper[];
  refresh: () => Promise<Paper[]>;
  robotFor: (p: Paper) => RobotProfile | null;
  decide: (p: Paper, action: "approve" | "changes", values: Record<string, unknown>) => Promise<void>;
  openChat: (threadId: string) => void;
  /** Called once when you leave: the orchestrator takes over again. */
  onLeave: () => void;
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const notes = new Map<string, string>();   // unfinished follow-ups survive leaving the chair

export function openChair(o: ChairOptions) {
  const previousFocus = document.activeElement as HTMLElement | null;
  const wrap = document.createElement("div");
  wrap.className = "chair-wrap";
  wrap.innerHTML = `
    <section class="chair" role="dialog" aria-modal="true" aria-labelledby="chair-title">
      <header class="chair-head"><h2 id="chair-title">In the orchestrator's chair</h2><span class="chair-count" role="status"></span><button type="button" class="ghost chair-leave">Leave the chair</button></header>
      <div class="chair-line" aria-hidden="true"></div>
      <div class="chair-counter">
        <article class="chair-paper" tabindex="-1" aria-live="polite"></article>
        <div class="chair-tools">
          <button type="button" class="primary chair-approve" aria-keyshortcuts="A">Approve<kbd>A</kbd></button>
          <label class="chair-note"><span>Follow-up note</span><textarea rows="3" placeholder="What should it fix or check next?"></textarea></label>
          <button type="button" class="ghost chair-follow" aria-keyshortcuts="F">Follow up<kbd>F</kbd></button>
          <div class="chair-nav"><button type="button" class="ghost chair-prev" aria-label="Previous report">Previous</button><button type="button" class="ghost chair-next" aria-label="Next report">Next</button></div>
          <p class="chair-msg" role="status"></p>
        </div>
        <div class="chair-stamp" aria-hidden="true">APPROVED</div>
      </div>
    </section>`;
  document.body.appendChild(wrap);
  const q = <T extends HTMLElement = HTMLElement>(s: string) => wrap.querySelector<T>(s)!;
  const line = q(".chair-line"), paper = q(".chair-paper"), msg = q(".chair-msg"), note = q<HTMLTextAreaElement>(".chair-note textarea");
  const approve = q<HTMLButtonElement>(".chair-approve"), follow = q<HTMLButtonElement>(".chair-follow");
  let index = 0, busy = false, closed = false, shownId = "";
  const actors = new Map<string, Walker>();
  const waiting = () => o.papers().filter(p => WAITING.has(p.status)).sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));

  const paintLine = (list: Paper[]) => {
    const ids = new Set(list.slice(0, 6).map(p => p.id));
    for (const [id, w] of actors) if (!ids.has(id)) { w.destroy(); actors.delete(id); }
    list.slice(0, 6).forEach((p, i) => {
      let w = actors.get(p.id);
      const robot = o.robotFor(p);
      if (!w) {
        w = new Walker(line, { id: `chair-${p.id}`, provider: p.provider || robot?.provider || "codex", name: robot?.name || p.robot?.name, model: p.model ?? undefined, scale: 0.5, look: robot?.look || p.robot?.look });
        w.el.classList.add("chair-actor"); w.face("down"); actors.set(p.id, w);
      }
      // The current report's worker stands at the counter; the rest wait behind it.
      const front = i === index;
      const x = line.clientWidth / 2 + (front ? 0 : (i < index ? -1 : 1) * (130 + Math.abs(i - index) * 70));
      const y = line.clientHeight - (front ? 6 : 34);
      w.el.style.zIndex = String(front ? 10 : 5 - Math.abs(i - index));
      w.el.classList.toggle("chair-front", front);
      if (reduced() || !w.el.dataset.placed) { w.setPos(x, y); w.el.dataset.placed = "1"; } else void w.walkTo(x, y).then(() => w!.face("down"));
      if (front) w.do("hold-card", { card: "Report" }); else w.do("wait");
    });
  };
  const paintPaper = (p: Paper | null) => {
    if (!p) {
      paper.innerHTML = `<p class="chair-empty">Nobody is waiting. New reports appear here as workers bring them.</p>`;
      approve.disabled = follow.disabled = true; note.disabled = true; shownId = "";
      return;
    }
    if (p.id !== shownId) { note.value = notes.get(p.id) ?? ""; shownId = p.id; }
    approve.disabled = busy; follow.disabled = busy; note.disabled = busy;
    const robot = o.robotFor(p);
    const cost = p.usage?.costUsd == null ? "API cost not recorded" : `${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(p.usage.costUsd)} at API prices`;
    paper.innerHTML = `<header><h3></h3><p class="chair-who"></p></header>
      <section><h4>Asked</h4><div class="chair-prose" data-asked></div></section>
      <section><h4>Report</h4><div class="chair-prose" data-report></div></section>
      <section class="chair-evidence" hidden><h4>Evidence</h4><div></div></section>
      ${p.verdict?.summary ? `<section><h4>Orchestrator's notes</h4><p data-verdict></p></section>` : ""}
      <p class="chair-facts"></p>
      <button type="button" class="link-btn chair-chat">Open the full chat</button>`;
    paper.querySelector("h3")!.textContent = p.title;
    paper.querySelector(".chair-who")!.textContent = `${robot?.name || p.robot?.name || "Worker"}${p.project ? `, ${p.project}` : ""}`;
    paper.querySelector("[data-asked]")!.innerHTML = reportMarkdown(String(p.originalRequest || p.initialRequest || "Not recorded").slice(0, 4000));
    paper.querySelector("[data-report]")!.innerHTML = reportMarkdown(String(p.response || "No written report.").slice(0, 12000));
    const verdict = paper.querySelector("[data-verdict]"); if (verdict) verdict.textContent = p.verdict.summary;
    paper.querySelector(".chair-facts")!.textContent = `${harnessName(p.provider)}, ${p.model || "model not recorded"}${p.effort ? `, ${p.effort} effort` : ""}. ${cost}.`;
    const images = (p.images ?? []).slice(0, 6);
    if (images.length) {
      const box = paper.querySelector<HTMLElement>(".chair-evidence")!; box.hidden = false;
      for (const image of images) {
        const fig = document.createElement("figure"), img = document.createElement("img"), cap = document.createElement("figcaption");
        img.src = fileUrl(image.path); img.alt = `${image.label}: ${image.name}`; img.loading = "lazy"; cap.textContent = image.label;
        img.onerror = () => { img.replaceWith(Object.assign(document.createElement("span"), { className: "chair-missing", textContent: "Image unavailable" })); };
        fig.append(img, cap); box.querySelector("div")!.append(fig);
      }
    }
    paper.querySelector(".chair-chat")!.addEventListener("click", () => { leave(); o.openChat(p.threadId); });
  };
  const paint = () => {
    if (closed) return;
    const list = waiting();
    index = Math.min(index, Math.max(0, list.length - 1));
    q(".chair-count").textContent = list.length ? `${list.length} waiting` : "Nobody waiting";
    paintLine(list);
    paintPaper(list[index] ?? null);
    q<HTMLButtonElement>(".chair-prev").disabled = index <= 0;
    q<HTMLButtonElement>(".chair-next").disabled = index >= list.length - 1;
  };
  const current = () => waiting()[index] ?? null;
  const decide = async (action: "approve" | "changes") => {
    const p = current(); if (!p || busy) return;
    const text = note.value.trim();
    if (action === "changes" && !text) { msg.textContent = "Write what it should do next, then follow up."; note.focus(); return; }
    busy = true; msg.textContent = ""; paint();
    try {
      if (action === "approve") {
        await o.decide(p, "approve", { chair: true, summary: text || "Approved by you in the orchestrator's chair.", checks: ["Read the report in the orchestrator's chair"], visualChanged: false });
        gameSound.play("clip");
        const stamp = q(".chair-stamp");
        if (!reduced()) gsap.fromTo(stamp, { opacity: 0, scale: 1.8, rotate: -18 }, { opacity: 1, scale: 1, rotate: -12, duration: .22, ease: "power3.in", onComplete: () => { gsap.to(stamp, { opacity: 0, duration: .3, delay: .6 }); } });
        actors.get(p.id)?.setExpression("happy");
        msg.textContent = `Approved. ${o.robotFor(p)?.name || "The worker"} takes it back to its desk to collect.`;
      } else {
        await o.decide(p, "changes", { summary: text, feedback: text });
        gameSound.play("paper");
        msg.textContent = `Sent back with your note. ${o.robotFor(p)?.name || "The worker"} keeps working on it.`;
      }
      notes.delete(p.id); note.value = "";
      await o.refresh();
    } catch (error: any) {
      msg.textContent = `Could not record that: ${error?.message || error}. Nothing was changed; try again.`;
    } finally { busy = false; paint(); }
  };
  note.addEventListener("input", () => { const p = current(); if (p) notes.set(p.id, note.value); });
  approve.addEventListener("click", () => void decide("approve"));
  follow.addEventListener("click", () => void decide("changes"));
  q(".chair-prev").addEventListener("click", () => { index = Math.max(0, index - 1); gameSound.play("boop"); paint(); });
  q(".chair-next").addEventListener("click", () => { index++; gameSound.play("boop"); paint(); });
  const onKey = (e: KeyboardEvent) => {
    if ([...document.querySelectorAll(".dialog-wrap, .chair-wrap, .wf-wrap")].pop() !== wrap) return;
    const typing = (e.target as HTMLElement)?.matches?.("textarea, input, select");
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); if (typing) (e.target as HTMLElement).blur(); else leave(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "a" || e.key === "A") { e.preventDefault(); void decide("approve"); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); note.focus(); if (note.value.trim()) void decide("changes"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); q<HTMLButtonElement>(".chair-prev").click(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); q<HTMLButtonElement>(".chair-next").click(); }
  };
  window.addEventListener("keydown", onKey, true);
  q(".chair-leave").addEventListener("click", () => leave());
  const timer = window.setInterval(() => { if (!document.hidden && !busy) void o.refresh().then(paint, () => {}); }, 4000);
  const resize = new ResizeObserver(() => { for (const w of actors.values()) delete w.el.dataset.placed; paint(); }); resize.observe(line);
  function leave() {
    if (closed) return; closed = true;
    window.clearInterval(timer); resize.disconnect(); window.removeEventListener("keydown", onKey, true);
    for (const w of actors.values()) w.destroy();
    actors.clear();
    gameSound.play("switch");
    o.onLeave();
    wrap.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  gameSound.play("open");
  if (!reduced()) gsap.from(q(".chair"), { opacity: 0, scale: 1.04, duration: .3, ease: "power2.out" });
  paint();
  approve.focus({ preventScroll: true });
  return { leave, paint };
}
