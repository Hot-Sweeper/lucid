import gsap from "gsap";
import type { World, WThread } from "./world";

// Your stand-in. It learns your preferences from what you tell robots, keeps them in its
// notebook (memory.md), and when reviews are on, checks finished work for you.

export type OrchState = { threadId: string; projectId: string; dir: string; review: boolean; reviewWorkflow?: number; paused?: boolean; presence?: "awake" | "sleep" | "away"; seenUntil: string; lastSentAt: number; learned: number; reviewed: Record<string, number>; dialogsAsked?: string;
  /** answering robots' questions for you (delegate.ts): on unless turned off, how sure it must be, learning cursors */
  auto?: boolean; threshold?: number; answersSince?: string; folded?: string };
type Api = {
  orchInit(o?: { provider?: string; model?: string }): Promise<{ threadId: string; projectId: string; dir: string }>;
  orchMemory(): Promise<string>;
  userMessagesSince(since: string, exclude: string): Promise<{ threadId: string; title: string; at: string; text: string }[]>;
  sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
};

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class Orchestrator {
  papers: any[] = [];
  private reportsFlight: Promise<void> | null = null;
  private pendingReportThreads: WThread[] | null = null;
  private busy = false;
  onChange: () => void = () => {};

  constructor(private api: Api, private world: World, private get: () => OrchState | null, private set: (s: OrchState | null) => void) {
    // Record the workflow version without overriding an existing manual review choice.
    const saved = this.get();
    if (saved && saved.reviewWorkflow !== 1) this.set({ ...saved, review: saved.review === true, reviewWorkflow: 1 });
    this.world.onReportArrived = () => void this.syncReports();
    void this.syncReports();
    setInterval(() => void this.learn(), 60000);
    // once a day: fresh lines for the robots, about you and each other
    // Daily flavor text now comes from the robots' personas (daily-writer.ts).
  }

  // Ask the orchestrator for today's dialog pack: about 40 short lines on a cheap model,
  // drawn from what it knows about you (memory.md) and what the robots worked on today.
  async daily() {
    const s = this.get();
    if (!s || s.paused) return;
    const today = new Date().toLocaleDateString("en-CA");
    if (s.dialogsAsked === today) return;
    const have = await (window as any).lucid.orchDialogs?.().catch(() => null);
    if(this.get()?.paused || this.get()?.threadId!==s.threadId)return;
    if (have?.date === today) { this.set({ ...this.get()!, dialogsAsked: today }); return; }
    const names = [...new Set(this.world.roster.robots.map((r) => r.name))].slice(0, 16).join(", ");
    const topics = (this.world.lastData?.threads ?? [])
      .filter((t) => t.title && Date.now() - Date.parse(t.updatedAt) < 36 * 3600 * 1000)
      .slice(0, 10).map((t) => `- ${t.title}`).join("\n");
    const message = `Daily dialog pack for the robots (${today}). Write it to dialogs.json in your folder and reply "Done". Keep it cheap: write the file directly, no tools besides that.

Shape (JSON): {"date":"${today}","convos":[["line","reply","..."]],"ceo":["..."],"gossip":["..."],"botcord":[{"channel":"general","user":"name","text":"..."}],"trending":[{"title":"...","channel":"...","views":"1.2M views"}],"event":{"name":"...","blurb":"..."}}
- convos: 12 short back-and-forths (2 to 4 lines each) robots have in the break room or park, some about today's work, some about the CEO (the user), some about each other
- ceo: 8 single lines robots say about the CEO, affectionate teasing using what memory.md says about how the user works
- gossip: 8 single lines about other robots by name
- botcord: 10 chat messages for the robots' Discord-like app
- trending: 6 made-up trending robot video titles with silly channel names (riff on today's work or tech news robots would care about)
- event: one small office event for today, like "Robot karaoke night" or "Pizza Friday", with a one-line blurb

Robot names: ${names || "Bolt, Mochi, Pixel"}
Today's work:
${topics || "- (quiet day)"}

Rules: lines under 70 characters, kind and funny, PG, no em dashes or en dashes, no secrets or personal data.`;
    try {
      await this.api.sendMessage({ threadId: s.threadId, message });
      if(this.get()?.threadId===s.threadId)this.set({ ...this.get()!, dialogsAsked: today });
    } catch (err) { console.error("daily dialogs failed", err); }
  }

  get state() { return this.get(); }

  async hire() {
    const r = await this.api.orchInit({ provider: "claudeAgent", model: "claude-sonnet-5-5" });
    this.set({ ...r, review: true, reviewWorkflow: 1, seenUntil: new Date().toISOString(), lastSentAt: Date.now(), learned: 0, reviewed: {} });
    this.world.roster.assignRobot(r.threadId, null, "claudeAgent");
    const bot = this.world.roster.byThread(r.threadId);
    if (bot) { bot.name = "Boss"; bot.look = { ...bot.look, antennaTip: "star", accent: "#ffd27a" }; (this.world.roster as any).save(); }
    this.onChange();
    return r.threadId;
  }

  setReview(on: boolean) {
    const s = this.get();
    if (!s) return;
    this.set({ ...s, review: on });
    this.onChange();
    if (on) this.dispatchReports();
  }

  // Batch the user's new messages to robots and hand them to the orchestrator to learn from.
  async learn(force = false) {
    const s = this.get();
    if (!s || s.paused || this.busy) return;
    this.busy = true;
    try {
      const msgs = await this.api.userMessagesSince(s.seenUntil, s.threadId);
      if(this.get()?.paused || this.get()?.threadId!==s.threadId)return;
      const due = msgs.length >= 3 || (msgs.length > 0 && (force || Date.now() - s.lastSentAt > 15 * 60 * 1000));
      if (!due) return;
      const lines = msgs.map((m) => `- [${m.title || "a robot"}] ${m.text.replace(/\s+/g, " ").slice(0, 600)}`).join("\n");
      await this.api.sendMessage({ threadId: s.threadId, message: `New messages the user wrote to robots. Learn lasting preferences from them and update memory.md:\n\n${lines}` });
      const current=this.get();
      if(current?.threadId===s.threadId)this.set({ ...current, seenUntil: msgs[msgs.length - 1].at, lastSentAt: Date.now(), learned: current.learned + msgs.length });
      this.onChange();
    } catch (err) {
      console.error("orchestrator learn failed", err);
    } finally {
      this.busy = false;
    }
  }

  setPaused(paused: boolean) {
    this.setPresence(paused ? "sleep" : "awake");
  }

  setAuto(auto: boolean) {
    const s=this.get(); if(!s)return;
    this.set({...s,auto});this.onChange();
  }

  setPresence(presence: "awake" | "sleep" | "away") {
    const s = this.get();
    if (!s) return;
    this.set({ ...s, paused: presence !== "awake", presence });
    this.onChange();
    if (presence === "awake") this.dispatchReports();
  }

  // Include the existing DONE backlog. Durable run IDs deduplicate submissions across restarts.
  observe(threads: WThread[]) {
    const s = this.get();
    if (!s) return;
    return this.syncReports(threads);
  }

  private dispatchReports() { void this.syncReports(); }

  private syncReports(threads = this.world.lastData?.threads ?? []): Promise<void> {
    // Keep only the latest observation while the backend is busy. Attaching a
    // recursive continuation per refresh accumulates an unbounded stale queue.
    this.pendingReportThreads = threads;
    if (this.reportsFlight) return this.reportsFlight;
    const flight = (async () => {
      try {
        while (this.pendingReportThreads) {
          const latest = this.pendingReportThreads;
          this.pendingReportThreads = null;
          await this.runReportSync(latest);
        }
      } finally { this.reportsFlight = null; }
    })();
    this.reportsFlight = flight;
    return flight;
  }

  private async runReportSync(threads: WThread[]) {
    if (this.world.lastData?.environmentId) return;
    const api = (window as any).lucid;
    if (new URLSearchParams(location.search).get("autoScope")?.startsWith("(none")) return;
    if (!api?.reportsTick || !new URLSearchParams(location.search).has("app")) return;
    try {
      const s = this.get();
      if (!s) return;
      const saved = await api.reportsList();
      const known = new Set(saved.map((p: any) => `${p.threadId}:${p.runId}`));
      // Submit one job per refresh so a large backlog cannot block the office.
      for (const t of threads) {
        if (t.id === s.threadId || t.pinned || t.settled || t.question || t.runStatus !== "completed") continue;
        const previous = saved.find((p: any) => p.threadId === t.id);
        // Backend compares run IDs, including when a robot completes another revision.
        const stamp = `${t.id}:${t.updatedAt}`;
        if (this.submittedVersions.has(stamp) && previous) continue;
        const p = await api.reportsSubmit(t.id, this.world.roster.byThread(t.id));
        this.submittedVersions.add(stamp);
        if (p && !known.has(`${p.threadId}:${p.runId}`)) break;
      }
      const arrived = [...this.world.reports].filter(([, r]) => r.arrived).map(([id]) => id);
      this.papers = await api.reportsTick(arrived);
      // The office can refresh or switch buildings while a report is pending.
      // Never animate an old completion on a robot that has resumed work.
      const current = this.world.lastData;
      if (!current || current.environmentId || this.get()?.threadId !== s.threadId) return;
      const seenThreads = new Set<string>();
      let moved = false;
      for (const p of this.papers) {
        if (seenThreads.has(p.threadId)) continue;
        seenThreads.add(p.threadId);
        const t = current.threads.find(t => t.id === p.threadId);
        if (!t || t.runStatus === 'running') continue;
        const prior = this.paperStates.get(p.id);
        if (prior !== p.status && (prior || ["reviewing", "manual-review"].includes(p.status))) {
          const phase = p.status === "reviewing" ? "reading" : p.status === "settled" ? "answered" : p.status === "manual-review" ? "asked" : null;
          this.world.bossDecision(p.threadId, phase, p.verdict?.summary);
        }
        this.paperStates.set(p.id, p.status);
        // Approved work joins its worker's record and persona (counted once per paper).
        if ((p.status === "approved" || p.status === "settled" && p.verdict?.decision === "approve") && p.robot?.id) this.world.roster.recordApproval(p.robot.id, { paper: p.id, title: p.title, project: p.project, at: p.approvedAt || p.updatedAt });
        if (t && !t.pinned && !t.settled && t.runStatus === "completed" && ["submitted", "reviewing", "approved", "manual-review"].includes(p.status) && !this.world.reports.has(t.id)) this.world.queueReport(t, p.response || "", !!p.delivered);
        if (this.world.setReportApproved(p.threadId, p.status === "approved")) moved = true;
      }
      if (moved && this.world.lastData) this.world.update(this.world.lastData);
      this.onChange();
    } catch (e) { console.error("Could not sync settlement papers", e); }
  }
  private paperStates = new Map<string, string>();
  /** The latest paper for a thread, if its review is approved and waiting to be collected. */
  approvedPaper(threadId: string) {
    const latest = this.papers.find(p => p.threadId === threadId);
    return latest?.status === "approved" ? latest : null;
  }
  /** Whether finished work goes through review (by the orchestrator or by you in its chair) before it can be collected. */
  get reviewing() { return !!this.get()?.threadId; }
  private submittedVersions = new Set<string>();

  async showNotebook() {
    const text = await this.api.orchMemory().catch(() => "");
    const wrap = document.createElement("div");
    wrap.className = "dialog-wrap";
    wrap.innerHTML = `<div class="dialog notebook" role="dialog" aria-modal="true" aria-labelledby="nb-title">
      <h2 id="nb-title">The orchestrator's notebook</h2>
      <p class="nb-sub">What it knows about how you like things done. It updates this as you work.</p>
      <div class="nb-body">${text ? text.split(/\r?\n/).map((l) => /^#/.test(l) ? `<h3>${esc(l.replace(/^#+\s*/, ""))}</h3>` : l.trim() ? `<p>${esc(l.replace(/^-\s*/, ""))}</p>` : "").join("") : "<p>The notebook is empty so far.</p>"}</div>
      <div class="dialog-actions"><button type="button" class="primary" data-a="close">Close</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const close = () => { window.removeEventListener("keydown", onKey, true); gsap.to(wrap, { opacity: 0, duration: 0.15, onComplete: () => wrap.remove() }); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    wrap.addEventListener("click", (e) => { if (e.target === wrap || (e.target as HTMLElement).closest('[data-a="close"]')) close(); });
    gsap.fromTo(wrap.querySelector(".dialog"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25 });
    (wrap.querySelector('[data-a="close"]') as HTMLElement).focus();
  }
}
