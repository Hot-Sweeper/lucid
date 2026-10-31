import gsap from "gsap";
import type { World, WThread } from "./world";

// Your stand-in. It learns your preferences from what you tell robots, keeps them in its
// notebook (memory.md), and when reviews are on, checks finished work for you.

export type OrchState = { threadId: string; projectId: string; dir: string; review: boolean; seenUntil: string; lastSentAt: number; learned: number; reviewed: Record<string, number>; dialogsAsked?: string };
type Api = {
  orchInit(o?: { provider?: string; model?: string }): Promise<{ threadId: string; projectId: string; dir: string }>;
  orchMemory(): Promise<string>;
  userMessagesSince(since: string, exclude: string): Promise<{ threadId: string; title: string; at: string; text: string }[]>;
  sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
};

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class Orchestrator {
  private prevRun = new Map<string, string | null>();
  private busy = false;
  onChange: () => void = () => {};

  constructor(private api: Api, private world: World, private get: () => OrchState | null, private set: (s: OrchState | null) => void) {
    setInterval(() => void this.learn(), 60000);
    // once a day: fresh lines for the robots, about you and each other
    window.setTimeout(() => void this.daily(), 90000);
    setInterval(() => void this.daily(), 60 * 60 * 1000);
  }

  // Ask the orchestrator for today's dialog pack: about 40 short lines on a cheap model,
  // drawn from what it knows about you (memory.md) and what the robots worked on today.
  async daily() {
    const s = this.get();
    if (!s) return;
    const today = new Date().toLocaleDateString("en-CA");
    if (s.dialogsAsked === today) return;
    const have = await (window as any).lucid.orchDialogs?.().catch(() => null);
    if (have?.date === today) { this.set({ ...s, dialogsAsked: today }); return; }
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
      this.set({ ...s, dialogsAsked: today });
    } catch (err) { console.error("daily dialogs failed", err); }
  }

  get state() { return this.get(); }

  async hire() {
    const r = await this.api.orchInit({ provider: "claudeAgent", model: "claude-sonnet-5-5" });
    this.set({ ...r, review: false, seenUntil: new Date().toISOString(), lastSentAt: Date.now(), learned: 0, reviewed: {} });
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
  }

  // Batch the user's new messages to robots and hand them to the orchestrator to learn from.
  async learn(force = false) {
    const s = this.get();
    if (!s || this.busy) return;
    this.busy = true;
    try {
      const msgs = await this.api.userMessagesSince(s.seenUntil, s.threadId);
      const due = msgs.length >= 3 || (msgs.length > 0 && (force || Date.now() - s.lastSentAt > 15 * 60 * 1000));
      if (!due) return;
      const lines = msgs.map((m) => `- [${m.title || "a robot"}] ${m.text.replace(/\s+/g, " ").slice(0, 600)}`).join("\n");
      await this.api.sendMessage({ threadId: s.threadId, message: `New messages the user wrote to robots. Learn lasting preferences from them and update memory.md:\n\n${lines}` });
      this.set({ ...s, seenUntil: msgs[msgs.length - 1].at, lastSentAt: Date.now(), learned: s.learned + msgs.length });
      this.onChange();
    } catch (err) {
      console.error("orchestrator learn failed", err);
    } finally {
      this.busy = false;
    }
  }

  // Watch runs finish; with reviews on, ask the orchestrator to check the result.
  observe(threads: WThread[]) {
    const s = this.get();
    for (const t of threads) {
      const was = this.prevRun.get(t.id);
      this.prevRun.set(t.id, t.runStatus);
      if (!s || !s.review || t.id === s.threadId || was !== "running" || t.runStatus === "running") continue;
      if (t.runStatus !== "completed") continue;
      if (Date.now() - (s.reviewed[t.id] ?? 0) < 10 * 60 * 1000) continue;
      s.reviewed[t.id] = Date.now();
      this.set({ ...s });
      void this.api.sendMessage({
        threadId: s.threadId,
        message: `Review this finished thread against memory.md: "${t.title}" (thread id ${t.id}). Read it with the t3 CLI, give the robot feedback only if it clearly goes against the user's preferences or is unfinished, then reply with one line.`,
      }).catch((e) => console.error("orchestrator review failed", e));
    }
  }

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
