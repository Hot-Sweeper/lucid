import gsap from "gsap";
import { WM, Cancelled } from "./os/wm";
import { CalcApp, WORK_SUMS } from "./os/calc";
import { checkTime } from "./os/glance";
import { MusicApp } from "./os/music";
import { IdleLife } from "./os/idle";
import { HarnessApp, harnessKind, THEMES, type HarnessSession, type SubagentEvent } from "./harness/harness";
import { fileUrl } from "./office/chat-panel";
import { FilesApp, EditorApp, TerminalApp, BrowserApp, ChatApp, ToolApp, prettyTool } from "./os/apps";
import { classify, parseDiff, baseName, type Entry } from "./os/classify";
import { TasksApp, type TaskStep } from "./os/tasks";
import type { SeatedRobot as Robot } from "./office/rig";
import type { DeskStage as Stage } from "./office/desk";

export type Item = { id: string; runId: string | null; ordinal: number; type: string; status: string; updatedAt: string; data: any };
export type ThreadInfo = { id: string; title: string; provider: string; model?: string | null; effort?: string | null; projectTitle?: string; root?: string; run?: { id: string; status: string } | null; error?: string };

const GLOW: Record<string, string> = {
  editor: "#6f7dff", terminal: "#4ff0a0", browser: "#4fd2ff", chat: "#ff7aa8", files: "#ffbf5a", tool: "#b07cff", think: "#9d8cff", idle: "#4fb6ff", tasks: "#4fd8c0",
};

// Reasoning effort from a T3 model selection: [{ id: "effort", value }], { effort }, Codex's "reasoningEffort"...
function effortOf(o: any): string | undefined {
  if (!o) return undefined;
  const ids = ["effort", "reasoningEffort", "reasoning_effort", "reasoning", "thinkingLevel", "thinking", "variant"];
  for (const id of ids) {
    const v = Array.isArray(o) ? o.find((x: any) => x && x.id === id)?.value : o[id];
    if (v != null && typeof v !== "boolean" && typeof v !== "object") return String(v);
  }
  return undefined;
}

// Plain text of a tool result, whatever shape the harness reported it in.
function outText(o: any): string {
  if (o == null) return "";
  if (typeof o === "string") return o;
  if (typeof o.stdout === "string") return [o.stdout, o.stderr].filter(Boolean).join("\n");
  if (typeof o.output === "string") return o.output;
  if (typeof o.content === "string") return o.content;
  if (o.file && typeof o.file.content === "string") return o.file.content;
  if (Array.isArray(o.content)) return o.content.map((c: any) => c?.text || "").join("\n");
  return "";
}

type Helper = { session: HarnessSession; child: string | null; prompt: string; since: string; timer: number; done: boolean; last: string; runSeen: boolean; ticks: number; hasModel: boolean };
const cleanCmd = (c: any) => String(c || "").replace(/^"[^"]*powershell[^"]*"\s+-Command\s+/i, "").slice(0, 160);
const lastLine = (o: any) => (o ? String(o).split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 120) : undefined);

const SKIP = new Set(["checkpoint", "notification", "system_notice", "handoff", "run_interrupt_request", "run_interrupt_result"]);

// Plays real thread events as scenes on the robot's computer, one at a time.
export class Director {
  private items = new Map<string, Item>();
  private queue: string[] = [];
  private played = new Set<string>();
  private pumpEpoch = -1;
  private catchingUp = false;
  private info: ThreadInfo | null = null;
  private lastRunStatus = "";
  private files: FilesApp; private editor: EditorApp; private term: TerminalApp;
  private browser: BrowserApp; private chat: ChatApp; private tool: ToolApp; private tasks: TasksApp;
  private planSig = "";
  onActivity: (text: string) => void = () => {};
  private idleLife: IdleLife;
  private mobile = false;       // the agent is testing a phone-sized viewport
  private phoneUp = false;      // the robot is holding its phone
  private peekFn: (url: string) => Promise<any>;
  private harness: HarnessApp;
  // Helper sessions, keyed by the child thread when known (else the item that started it).
  private sessions = new Map<string, Helper>();
  /** Item id (subagent item, delegate_task call, Agent tool call) to its helper session key. */
  private helperOf = new Map<string, string>();
  /** What a delegate_task call said about its child (harness, model, effort), by child thread id. */
  private helperHints = new Map<string, { provider?: string; model?: string; effort?: string }>();
  childItems: (threadId: string, since: string) => Promise<any[]> = async () => [];
  /** Provider, model and effort of a child thread. */
  childInfo: (threadId: string) => Promise<ThreadInfo | null> = async (id) => (window as any).lucid?.threadInfo?.(id) ?? null;
  attachDir = "";
  private lastEventAt = 0;

  constructor(private wm: WM, private robot: Robot, private stage: Stage, peek: (url: string) => Promise<any>, private image: (path: string) => Promise<string | null>, private readText: (path: string) => Promise<string | null>) {
    this.files = new FilesApp(wm);
    this.editor = new EditorApp(wm);
    this.term = new TerminalApp(wm);
    this.browser = new BrowserApp(wm, peek);
    this.chat = new ChatApp(wm);
    this.tool = new ToolApp(wm);
    this.tasks = new TasksApp(wm);
    this.idleLife = new IdleLife(wm, robot, stage);
    this.idleLife.browser = this.browser;
    this.idleLife.hold = () => this.waitingForUser;
    this.music = new MusicApp(wm);
    this.idleLife.music = this.music;
    this.harness = new HarnessApp(wm as any);
    this.peekFn = peek;
    this.idleLife.onActivity = (t) => this.onActivity(t);
  }

  reset() {
    this.idleLife.stop();
    for (const s of this.sessions.values()) window.clearInterval(s.timer);
    this.sessions.clear();
    this.helperOf.clear();
    this.helperHints.clear();
    this.harness.reset();
    this.mobile = false;
    if (this.phoneUp) { this.phoneUp = false; void this.robot.holdPhone(false); }
    this.lastEventAt = 0;
    this.wm.reset();
    this.items.clear();
    this.queue = [];
    this.played.clear();
    this.info = null;
    this.lastRunStatus = "";
    this.stage.say(null);
    this.stage.setPlan([]);
    this.tasks.reset();
    this.planSig = "";
    this.robot.setPose("rest");
  }

  setInfo(info: ThreadInfo) {
    if (info.error) return;
    const first = !this.info;
    this.info = info;
    this.term.setCwd(info.root || null);
    const status = info.run?.status || "";
    if (status === "running" && this.idleLife.isActive) {
      // New work started (maybe from T3 itself): wake up before the first event arrives.
      this.idleLife.stop();
      this.robot.setPose("think");
      this.onActivity("Working");
    }
    if (!first && this.lastRunStatus === "running" && status && status !== "running" && !this.queue.length) {
      this.robot.setPose("celebrate");
      this.onActivity("Finished");
      if (this.pumpEpoch === -1) this.idleLife.begin();
    }
    this.lastRunStatus = status;
  }

  push(items: Item[], initial: boolean) {
    let latestRun: string | null = null;
    if (initial) latestRun = [...items].reverse().find((i) => i.runId)?.runId ?? null;
    for (const it of items) {
      const t = Date.parse(it.updatedAt);
      if (t > this.lastEventAt) this.lastEventAt = t;
      this.items.set(it.id, it);
      if (SKIP.has(it.type) || this.played.has(it.id) || this.queue.includes(it.id)) continue;
      // On first open, replay only the latest turn so you see what the robot is doing now.
      if (initial && it.runId !== latestRun) { this.played.add(it.id); continue; }
      if (it.type === "todo_list") { this.stage.setPlan(it.data.steps || []); if (!this.queuePlan(it)) this.played.add(it.id); continue; }
      this.queue.push(it.id);
    }
    // A helper is done when its subagent item (or Claude's Agent tool call) settles.
    for (const it of items) {
      if (it.status === "running" || it.status === "pending" || !this.helperOf.has(it.id)) continue;
      if (it.type === "subagent" || (it.type === "dynamic_tool" && /^(Agent|Task)$/.test(String(it.data?.toolName || "")))) this.finishSession(it.id);
    }
    // Plans update in place while the run goes on.
    for (const it of items) if (it.type === "todo_list" && this.played.has(it.id)) { this.stage.setPlan(it.data.steps || []); this.queuePlan(it); }
    this.queue.sort((a, b) => this.items.get(a)!.ordinal - this.items.get(b)!.ordinal);
    if (initial) this.catchingUp = this.queue.length > 0;
    if (this.queue.length && this.idleLife.isActive) this.idleLife.stop();
    this.pump();
  }

  private get(id: string) { return this.items.get(id)!; }

  // A changed plan is replayed in the robot's Tasks app, unless it only keeps sticky notes.
  private queuePlan(it: Item) {
    if ((this.wm.prefs?.tasks ?? "board") === "sticky") return false;
    const sig = JSON.stringify(it.data.steps || []);
    if (sig === this.planSig) return false;
    this.planSig = sig;
    if (!this.queue.includes(it.id)) this.queue.push(it.id);
    return true;
  }

  private async playPlan(steps: TaskStep[]) {
    if ((this.wm.prefs?.tasks ?? "board") === "sticky") { await this.wm.sleep(400); return; }
    this.onActivity(this.wm.prefs?.tasks === "checklist" ? "Updating its to-do list" : "Updating its task board");
    this.stage.setGlow(GLOW.tasks);
    await this.tasks.show(steps, { instant: this.catchingUp, title: this.info?.title });
  }

  // The robot's notes: while it thinks, its reasoning gets jotted down here.
  private async openNotes() {
    const w = await this.wm.open("notes", "Notes");
    if (!w.body.querySelector(".notes")) w.body.innerHTML = `<div class="notes"></div>`;
    return w.body.querySelector(".notes") as HTMLElement;
  }
  private noteFor = new WeakMap<HTMLElement, HTMLElement>();
  private async writeNote(box: HTMLElement, text: string) {
    const clean = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 600);
    let p = this.noteFor.get(box);
    if (!p || !p.isConnected) {
      p = document.createElement("p");
      box.appendChild(p);
      this.noteFor.set(box, p);
      while (box.children.length > 6) box.firstElementChild!.remove();
    }
    const done = p.textContent || "";
    if (clean.startsWith(done) && clean.length > done.length) {
      const rest = clean.slice(done.length);
      for (let i = 0; i < rest.length; i += 3) {
        p.textContent = done + rest.slice(0, i + 3);
        this.robot.pressKey(rest[i] || " ");
        box.scrollTop = box.scrollHeight;
        await new Promise((r) => setTimeout(r, 22 / this.wm.speed));
      }
    } else p.textContent = clean;
    box.scrollTop = box.scrollHeight;
  }

  /**
   * The robot opens the harness app for a helper agent and types its brief. Native subagent items,
   * T3's delegate_task tool and Claude's Agent tool all land here; the same helper seen twice
   * (a delegate_task call, then its subagent item) keeps one tab.
   */
  private async openHelper(itemId: string, o: { child: string | null; prompt: string; title: string; provider?: string; driver?: string; model?: string; effort?: string; label?: string }) {
    const existing = this.findHelper(o.child, o.prompt);
    if (existing) {
      this.helperOf.set(itemId, existing);
      const h = this.sessions.get(existing)!;
      h.session.setMeta({ model: o.model, effort: o.effort });
      if (o.child && !h.child) { h.child = o.child; this.pollChild(h); }
      return;
    }
    const hint = o.child ? this.helperHints.get(o.child) : undefined;
    const info = o.child ? await this.childInfo(o.child).catch(() => null) : null;
    const provider = info?.provider || hint?.provider || o.provider || o.driver || "";
    const kind = harnessKind(provider, o.driver, o.label);
    let model = info?.model || hint?.model || o.model || undefined;
    let effort = info?.effort || hint?.effort || o.effort || undefined;
    // A native helper of the parent's own harness runs on the parent's model unless told otherwise.
    if (!o.child && kind === harnessKind(this.info?.provider)) { model = model || this.info?.model || undefined; effort = effort || this.info?.effort || undefined; }
    const key = o.child || itemId;
    this.helperOf.set(itemId, key);
    const flavor = this.wm.prefs?.subagents;
    const t = THEMES[kind];
    this.onActivity(`Briefing a helper in ${flavor === "cli" && t.cmd ? t.cmd : t.app || t.name}: ${o.title}`);
    this.stage.setGlow(GLOW.tool);
    const label = o.label || (kind === "generic" && provider ? provider.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase()) : undefined);
    const session = await this.harness.start({ id: key, kind, title: o.title, prompt: o.prompt, model, effort, flavor, label, cwd: this.info?.root });
    const h: Helper = { session, child: o.child, prompt: o.prompt, since: "", timer: 0, done: false, last: "", runSeen: false, ticks: 0, hasModel: !!model };
    this.sessions.set(key, h);
    this.pollChild(h);
  }

  private findHelper(child: string | null, prompt: string): string | null {
    for (const [key, h] of this.sessions) {
      if (child && (key === child || h.child === child)) return key;
      if ((!child || !h.child) && prompt && h.prompt === prompt && !h.done) return key;
    }
    return null;
  }

  // Poll the helper's own thread and mirror its actions into the harness window.
  private pollChild(s: Helper) {
    const child = s.child;
    if (!child || s.timer) return;
    const session = s.session;
    const map = (it: any): SubagentEvent | null => {
      const d = it.data || {};
      switch (it.type) {
        case "command_execution": return { kind: "run", text: cleanCmd(d.input), detail: lastLine(outText(d.output) || d.output) };
        case "file_change": return { kind: "edit", text: String(d.fileName || d.changes?.[0]?.path || "file").split(/[\\/]/).slice(-2).join("/") };
        case "web_search": return { kind: "web", text: String((d.patterns || [])[0] || d.query || "search") };
        case "subagent": return { kind: "tool", text: "Agent", detail: d.title || undefined };
        case "dynamic_tool": {
          const name = String(d.toolName || "tool").replace(/^mcp__.+?__/, "");
          const inp = d.input || {};
          const out = outText(d.output);
          const lines = out ? out.split(/\r?\n/).filter(Boolean).length : 0;
          if (/^(read|read_file|view)$/i.test(name)) return { kind: "read", text: String(inp.file_path || inp.path || "file"), detail: lines ? `Read ${lines} lines` : undefined };
          if (/^(edit|multiedit|write|str_replace|apply_patch|notebookedit)$/i.test(name)) return { kind: "edit", text: String(inp.file_path || inp.path || "file"), detail: /^write$/i.test(name) && inp.content ? `Wrote ${String(inp.content).split("\n").length} lines` : undefined };
          if (/^(bash|powershell|shell|run_command|exec)$/i.test(name)) return { kind: "run", text: cleanCmd(inp.command), detail: lastLine(out) };
          if (/^(grep|glob|search|find)$/i.test(name)) return { kind: "search", text: String(inp.pattern || inp.query || name), detail: lines ? `Found ${lines} result${lines === 1 ? "" : "s"}` : undefined };
          if (/^(webfetch|websearch|fetch)$/i.test(name)) return { kind: "web", text: String(inp.url || inp.query || "the web") };
          return { kind: "tool", text: name, detail: inp.file_path || inp.command || inp.pattern || inp.description || undefined };
        }
        case "reasoning": return d.text ? { kind: "think", text: String(d.text).replace(/\s+/g, " ").slice(0, 140) } : null;
        default: return null;
      }
    };
    const seen = new Set<string>();
    const tick = async () => {
      if (s.done) return;
      const items = await this.childItems(child, s.since).catch(() => []);
      for (const it of items) {
        if (it.updatedAt > s.since) s.since = it.updatedAt;
        if (it.type === "assistant_message") { if (it.data?.text) { s.last = String(it.data.text); session.stream(s.last); } continue; }
        if (seen.has(it.id) || (it.status === "running" && it.type !== "command_execution")) continue;
        seen.add(it.id);
        const ev = map(it);
        if (ev) session.push(ev);
      }
      // Every few polls: learn the model once the child thread exists, and notice when its run ends.
      if (s.ticks++ % 3 === 0) {
        const info = await this.childInfo(child).catch(() => null);
        if (info && !s.hasModel && info.model) { s.hasModel = true; session.setMeta({ model: info.model, effort: info.effort || undefined }); }
        const st = info?.run?.status || "";
        if (st === "running") s.runSeen = true;
        else if (s.runSeen && /^(completed|failed|interrupted|cancelled|canceled|error)$/.test(st)) this.endHelper(s, s.last || "Done", st === "completed");
      }
    };
    void tick();
    s.timer = window.setInterval(tick, 2500);
  }

  private endHelper(s: Helper, summary: string, ok: boolean) {
    if (s.done) return;
    s.done = true;
    window.clearInterval(s.timer);
    s.session.finish(summary, ok);
  }

  private finishSession(itemId: string) {
    const key = this.helperOf.get(itemId) ?? itemId;
    const s = this.sessions.get(key);
    if (!s || s.done) return;
    const it = this.items.get(itemId);
    const d = it?.data || {};
    this.endHelper(s, String(d.result || d.summary || outText(d.output) || s.last || "Done").slice(0, 600), it?.status !== "failed" && it?.status !== "error");
  }

  // Music while working: robots that like it put on a playlist when work starts.
  music: MusicApp;
  private wasIdle = true;
  private async maybeMusic() {
    const pref = this.wm.prefs?.listens ?? "never";
    if (this.music.playing || pref === "never" || Math.random() > (pref === "always" ? 0.85 : 0.3)) return;
    this.onActivity("Putting on some music");
    (this.robot as any).setHeadphones?.(true);
    this.robot.setPose("mouse");
    const bpm = await this.music.start();
    (this.robot as any).setGroove?.(bpm);
  }

  // You are typing to this robot in Lucid's side chat. It drops what it is doing for fun,
  // opens its Messages app and watches your message come in, instead of wandering off.
  private userTypingAt = 0;
  private get waitingForUser() { return Date.now() - this.userTypingAt < 8000; }
  userTyping(on: boolean) {
    if (on) {
      const fresh = !this.waitingForUser;
      this.userTypingAt = Date.now();
      // real work keeps going; only the chat app shows the typing
      if (this.pumpEpoch !== -1) { if (this.wm.isOpen("chat")) void this.chat.youTyping(true).catch(() => {}); return; }
      if (!fresh) return;
      this.busyToken++;
      if (this.idleLife.isActive) this.idleLife.stop();
      this.onActivity("Watching you type");
      this.robot.setPose("read");
      void this.chat.youTyping(true).catch(() => {});
      return;
    }
    void this.chat.youTyping(false).catch(() => {});
    this.userTypingAt = Date.now() - 2000;   // a short grace period in case the message is on its way
    const epoch = this.wm.epoch;
    window.setTimeout(() => {
      if (epoch === this.wm.epoch && this.pumpEpoch === -1 && !this.queue.length && !this.waitingForUser) this.idle();
    }, 6500);
  }

  private async pump() {
    if (this.pumpEpoch === this.wm.epoch) return;
    const epoch = (this.pumpEpoch = this.wm.epoch);
    try {
      if (this.wasIdle) {
        this.wasIdle = false;
        try { await this.maybeMusic(); } catch (err) { if (err instanceof Cancelled) return; }
      }
      while (this.queue.length) {
        const backlog = this.queue.length - 1;
        this.wm.speed = Math.min(4.5, (this.catchingUp ? 2.2 : 1) + backlog * 0.45);
        const id = this.queue.shift()!;
        this.played.add(id);
        try {
          await this.play(id);
          // Now and then, for no reason at all, a window gets dragged somewhere else, like
          // people do. Robots that let windows float do it more; never while catching up.
          if (!this.catchingUp && this.queue.length < 2 && this.wm.wins.size) {
            // organised robots close what they have not used in a while
            if (Math.random() < 0.35) await this.wm.closeStale();
            const habit = this.wm.prefs?.windows === "floating" ? 0.12 : this.wm.prefs?.windows === "tiler" ? 0.07 : 0.04;
            if (Math.random() < habit) {
              const wins = [...this.wm.wins.values()];
              await this.wm.maybeShuffle(wins[Math.floor(Math.random() * wins.length)].id, 1);
            }
          }
          const live = [...this.sessions.entries()].filter(([, s]) => !s.done);
          if (live.length && Math.random() < 0.2) {
            this.onActivity("Checking on its helper");
            await this.harness.checkOn(live[Math.floor(Math.random() * live.length)][0]);
          }
        } catch (err) {
          if (err instanceof Cancelled) return;
          console.error("scene failed", err);
        }
        if (epoch !== this.wm.epoch) return;
      }
      this.catchingUp = false;
      this.wm.speed = 1;
      this.idle();
    } finally {
      if (this.pumpEpoch === epoch) this.pumpEpoch = -1;
    }
  }

  private idle() {
    this.wasIdle = true;
    if (this.waitingForUser) { this.robot.setPose("read"); this.onActivity("Watching you type"); void this.chat.youTyping(true).catch(() => {}); return; }
    if (this.phoneUp) { this.mobile = false; void this.phone(false); }
    // Helpers still at work: wait for them and look in on them now and then.
    const live = [...this.sessions.entries()].filter(([, s]) => !s.done);
    if (live.length) {
      this.robot.setPose("think");
      this.onActivity(live.length === 1 ? "Waiting for its helper" : `Waiting for ${live.length} helpers`);
      const epoch = this.wm.epoch;
      window.setTimeout(async () => {
        if (epoch !== this.wm.epoch || this.queue.length) return;
        const still = [...this.sessions.entries()].filter(([, s]) => !s.done);
        if (still.length) { try { await this.harness.checkOn(still[0][0]); } catch {} }
        if (epoch === this.wm.epoch && !this.queue.length) this.idle();
      }, 9000 + Math.random() * 6000);
      return;
    }
    const running = this.info?.run?.status === "running";
    this.stage.setGlow(GLOW.idle);
    if (running) {
      this.robot.setPose("think");
      this.onActivity("Thinking");
      void this.busyWhileWaiting(this.wm.epoch);
      return;
    }
    this.robot.setPose("rest");
    // A thread that finished a while ago goes straight to the lock screen.
    const stale = this.lastEventAt > 0 && Date.now() - this.lastEventAt > 10 * 60 * 1000 && !new URLSearchParams(location.search).has("idleScale");
    this.idleLife.begin({ locked: stale });
  }

  // A run is going but the next step has not shown up yet (the model is thinking, a long
  // command runs). Never sit in front of an empty screen: jot down where things stand in
  // the notes, then look over the open windows now and then until new work arrives.
  private busyToken = 0;
  private async busyWhileWaiting(epoch: number) {
    const tok = ++this.busyToken;
    const still = () => tok === this.busyToken && epoch === this.wm.epoch && !this.queue.length && this.pumpEpoch === -1 && this.info?.run?.status === "running" && !this.waitingForUser;
    try {
      await this.wm.sleep(1200, epoch);
      if (!still()) return;
      if (!this.wm.wins.size) {
        const last = [...this.items.values()].reverse().find((i) => (i.type === "reasoning" || i.type === "assistant_message" || i.type === "user_message") && i.data?.text);
        const text = last ? String(last.data.text) : `Working on ${this.info?.title || "the task"}`;
        const notes = await this.openNotes();
        if (!still()) return;
        this.noteFor = new WeakMap();
        await this.writeNote(notes, last?.type === "user_message" ? `Task: ${text}` : text);
      }
      for (let n = 0; n < 40 && still(); n++) {
        await this.wm.sleep(5000 + Math.random() * 6000, epoch);
        if (!still()) return;
        const wins = [...this.wm.wins.values()];
        const r = Math.random();
        if (wins.length && r < 0.55) {
          // glance at another window: click its title bar, maybe scroll a bit
          const w = wins[Math.floor(Math.random() * wins.length)];
          await this.wm.open(w.id);
          const scroller = w.body.querySelector(".code, .term, .notes, .cp-list, pre") as HTMLElement | null;
          if (scroller && still()) { await this.wm.pointAt(scroller, 0.5, 0.6, 400); gsap.to(scroller, { scrollTop: Math.random() * scroller.scrollHeight, duration: 1.2, ease: "power2.inOut" }); }
          this.robot.setPose("read");
        } else if (r < 0.75) {
          await this.wm.maybeShuffle(wins.length ? wins[0].id : "notes", 1);
          this.robot.setPose("think");
        } else if (r < 0.84) {
          this.onActivity("Sipping coffee while it thinks");
          await this.robot.drink();
          this.onActivity("Thinking");
        } else if (r < 0.9) {
          // a quick sum on the calculator
          const [what, sum] = WORK_SUMS[Math.floor(Math.random() * WORK_SUMS.length)];
          this.onActivity(what);
          this.robot.setPose("mouse");
          await new CalcApp(this.wm).compute(sum, what);
          this.onActivity("Thinking");
        } else if (r < 0.92) {
          this.robot.setPose("mouse");
          await this.wm.fidget();
          this.robot.setPose("think");
        } else if (r < 0.96) {
          // a quick look at the clock while it waits
          this.robot.setPose("mouse");
          await checkTime(this.wm);
          this.robot.setPose("think");
        } else {
          this.robot.setPose("think");
        }
      }
    } catch (err) {
      if (!(err instanceof Cancelled)) console.error("busy filler", err);
    }
  }

  // Wait until the item completes, or move on if newer work piles up.
  private async settle(id: string, maxMs = 120000) {
    const start = Date.now();
    for (;;) {
      const it = this.get(id);
      if (it.status !== "running" && it.status !== "pending" && !it.data.streaming) return it;
      if (Date.now() - start > maxMs) return it;
      if (this.queue.length > 2 && Date.now() - start > 6000) return it;
      await this.wm.sleep(150);
    }
  }

  // Claude-style tools (Read, Bash, Grep, browser actions) map onto the same desktop apps.
  private async playTool(id: string, name: string): Promise<boolean> {
    const base = name.replace(/^mcp__.+?__/, "").replace(/^[\w-]+\./, "");
    const root = this.info?.root || null;
    const text = (o: any): string => {
      if (o == null) return "";
      if (typeof o === "string") return o;
      if (typeof o.stdout === "string") return [o.stdout, o.stderr].filter(Boolean).join("\n");
      if (typeof o.output === "string") return o.output;
      if (typeof o.content === "string") return o.content;
      if (o.file && typeof o.file.content === "string") return o.file.content;
      if (Array.isArray(o.content)) return o.content.map((c: any) => c.text || "").join("\n");
      return JSON.stringify(o, null, 1);
    };
    if (/^(bash|powershell|shell|run_command)$/i.test(base)) {
      const cmd = this.get(id).data.input?.command || "";
      this.onActivity("Running a command");
      this.stage.setGlow(GLOW.terminal);
      const h = await this.term.run(cmd);
      this.robot.setPose("read");
      const done = await this.settle(id);
      await h.finish(text(done.data.output), done.data.output?.exitCode ?? null);
      await this.wm.sleep(500);
      return true;
    }
    if (base === "Read") {
      const done = await this.settle(id, 20000);
      const p = done.data.input?.file_path || done.data.input?.path || "";
      if (done.data.viewedImagePath || done.data.output?.type === "image") {
        this.onActivity(`Looking at ${baseName(p)}`);
        this.stage.setGlow(GLOW.tool);
        const src = fileUrl(done.data.viewedImagePath || p);
        await this.tool.picture(baseName(p), src);
        return true;
      }
      const body = text(done.data.output).replace(/^\s*\d+[\t→]/gm, "");
      this.onActivity(`Reading ${baseName(p)}`);
      this.stage.setGlow(GLOW.editor);
      await this.editor.read(p, body.split(/\r?\n/).slice(0, 1500), done.data.output?.file?.startLine || done.data.input?.offset || 1);
      return true;
    }
    if (base === "Grep") {
      const done = await this.settle(id, 20000);
      const q = done.data.input?.pattern || "";
      const act = classify(`rg ${JSON.stringify(q)}`, text(done.data.output), root || "");
      this.onActivity(`Searching for “${q}”`);
      this.stage.setGlow(GLOW.files);
      await this.files.search(q, done.data.input?.path || root || "", act.kind === "search" ? act.hits : [], root);
      return true;
    }
    if (base === "Glob") {
      const done = await this.settle(id, 20000);
      const entries: Entry[] = text(done.data.output).split(/\r?\n/).filter(Boolean).slice(0, 400)
        .map((l) => ({ name: baseName(l), dir: false, path: l }));
      this.onActivity("Looking for files");
      this.stage.setGlow(GLOW.files);
      await this.files.list(done.data.input?.path || root || "", entries, root);
      return true;
    }
    if (base === "WebFetch" || base === "WebSearch") {
      const t = this.get(id).data.input?.url || this.get(id).data.input?.query || "the web";
      this.stage.setGlow(GLOW.browser);
      this.onActivity(base === "WebFetch" ? "Reading a web page" : "Searching the web");
      await this.browser.visit(t);
      return true;
    }
    if (base === "TodoWrite") {
      const todos = this.get(id).data.input?.todos || [];
      const steps = todos.map((t: any) => ({ text: t.content || t.activeForm || "", status: t.status === "in_progress" ? "running" : t.status }));
      this.stage.setPlan(steps);
      await this.playPlan(steps);
      return true;
    }
    if (base === "Agent" || base === "Task") {
      // Claude's own subagent tool: same harness as the parent, model from the call or inherited.
      const it = this.get(id);
      const inp = it.data.input || {};
      const type = String(inp.subagent_type || "");
      const model = inp.model && inp.model !== "inherit" ? String(inp.model) : undefined;
      await this.openHelper(id, {
        child: null, prompt: String(inp.prompt || inp.description || "Help with this"), title: String(inp.description || "Subtask"),
        provider: this.info?.provider || "claude", model, label: type && type !== "general-purpose" ? `${type} agent` : undefined,
      });
      if (it.status !== "running" && it.status !== "pending") this.finishSession(id);
      return true;
    }
    if (base === "delegate_task") {
      // T3's delegate tool: the child may run any harness (Codex, OpenCode, ...) with its own model and effort.
      const done = await this.settle(id, 15000);
      const inp = done.data.input || {};
      let out: any = done.data.output?.structuredContent || null;
      if (!out?.childThreadId) { try { out = JSON.parse(outText(done.data.output)); } catch { out = null; } }
      const child = out?.childThreadId ? String(out.childThreadId) : null;
      if (!child) return false;
      const target = inp.target || {};
      const hint = {
        provider: out.providerInstanceId || target.providerInstanceId || target.provider || undefined,
        model: out.model || target.model || undefined,
        effort: effortOf(out.options) || effortOf(target.options) || target.effort || undefined,
      };
      this.helperHints.set(child, hint);
      await this.openHelper(id, { child, prompt: String(inp.task || inp.prompt || inp.title || "Help with this"), title: String(inp.title || "Subtask"), ...hint });
      return true;
    }
    const browserActs: Record<string, string> = {
      preview_click: "Clicking on the page", preview_evaluate: "Running a script on the page", preview_snapshot: "Reading the page",
      preview_resize: "Resizing the page", preview_open: "Opening a tab", preview_act: "Using the page", preview_wait_for: "Waiting for the page",
      preview_status: "Checking the page", preview_dialog: "Answering a page dialog",
    };
    if (base === "preview_resize") {
      const done = await this.settle(id, 10000);
      const set = done.data.output?.setting || {};
      const preset = String(done.data.input?.preset || set.presetId || "");
      const width = Number(set.width || done.data.input?.width || 0);
      this.mobile = (width > 0 && width <= 520) || /iphone|pixel|galaxy|mobile|phone/i.test(preset);
      if (this.mobile) {
        this.onActivity("Testing on its phone");
        this.stage.setGlow(GLOW.browser);
        const tab = done.data.output?.tabs?.[0];
        await this.phonePage(tab?.url || null, tab?.title || null, `Phone size ${width || 390} wide`);
      } else {
        await this.phone(false);
        this.onActivity("Back to the desktop browser");
      }
      return true;
    }
    if (this.mobile && (base === "preview_navigate" || browserActs[base])) {
      const done = await this.settle(id, 15000);
      const url = done.data.output?.url || done.data.input?.url || null;
      this.onActivity(base === "preview_navigate" ? "Opening the page on its phone" : `${browserActs[base] || "Using the page"} on its phone`);
      await this.phonePage(url, done.data.output?.title || null, browserActs[base] || "Loading");
      return true;
    }
    if (base === "preview_navigate") return false; // a normal visit, handled by the caller
    if (browserActs[base]) {
      this.onActivity(browserActs[base]);
      this.stage.setGlow(GLOW.browser);
      const done = await this.settle(id, 15000);
      await this.browser.act(browserActs[base], done.data.output?.title, done.data.output?.url);
      return true;
    }
    if (base === "t3_preview_close") { this.wm.close("browser"); return true; }
    return false;
  }

  private async phone(on: boolean) {
    if (on === this.phoneUp) return;
    this.phoneUp = on;
    await this.robot.holdPhone(on);
  }

  // Show a page on the robot's phone, the way a person checks a site on mobile.
  private async phonePage(url: string | null, title: string | null, caption: string) {
    const screen = this.stage.phoneScreen;
    if (!screen) return;
    await this.phone(true);
    let page = screen.querySelector(".pp") as HTMLElement | null;
    if (!page) {
      screen.innerHTML = `<div class="pp"><div class="pp-bar"><span class="pp-url"></span></div><div class="pp-body"></div><div class="pp-cap"></div></div>`;
      page = screen.querySelector(".pp") as HTMLElement;
    }
    const host = url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
    if (url && page.dataset.url !== url) {
      page.dataset.url = url;
      (page.querySelector(".pp-url") as HTMLElement).textContent = host;
      const body = page.querySelector(".pp-body") as HTMLElement;
      body.innerHTML = `<h4></h4><div class="pp-skel"></div><div class="pp-skel s"></div><div class="pp-skel"></div>`;
      body.querySelector("h4")!.textContent = title || host;
      if (/^https?:/.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
        const res = await this.peekFn(url).catch(() => null);
        if (res?.ok) {
          body.innerHTML = `<h4></h4>${(res.blocks || []).slice(0, 8).map((b: any) => `<p class="${b.tag}"></p>`).join("")}`;
          body.querySelector("h4")!.textContent = res.title || title || host;
          body.querySelectorAll("p").forEach((p, i) => (p.textContent = res.blocks[i].text));
        }
      }
    }
    const cap = page.querySelector(".pp-cap") as HTMLElement;
    cap.textContent = caption;
    gsap.fromTo(cap, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3 });
    this.robot.swipe();
    await this.wm.sleep(1100);
  }

  private async play(id: string) {
    const it = this.get(id);
    const tool = it.type === "dynamic_tool" ? String(it.data.toolName || "") : "";
    if (this.phoneUp && !/preview_|browser/i.test(tool)) await this.phone(false);
    const d = it.data;
    const root = this.info?.root || null;
    if (it.type !== "reasoning" && it.type !== "user_input_request") this.stage.say(null);

    switch (it.type) {
      case "user_message": {
        // A new message pops up as a notification; the robot notices it, reads it, and
        // looks at any image you attached before getting to work.
        this.onActivity("Reading your message");
        this.stage.setGlow(GLOW.chat);
        this.robot.setPose("notice");
        this.wm.toast("New message from you");
        await this.wm.sleep(700);
        const imgs: { path: string; name: string }[] = (d.attachments || [])
          .filter((a: any) => a.type === "image" && (a.path || a.id))
          .map((a: any) => ({ path: a.path || `${this.attachDir}${a.id}.${(a.mimeType || "image/png").split("/")[1].replace("jpeg", "jpg")}`, name: a.name || "image" }));
        // files attached from Lucid's side chat are listed at the end of the text
        let said = String(d.text || "");
        const listed = said.match(/\n*Attached:\n((?:- (?:image|file): .+(?:\n|$))+)\s*$/);
        if (listed) {
          said = said.slice(0, listed.index).trim();
          for (const line of listed[1].trim().split("\n")) {
            const mm = line.match(/^- image: (.+)$/);
            if (mm) imgs.push({ path: mm[1].trim(), name: mm[1].trim().split(/[\\/]/).pop()!.replace(/^\d+-/, "") });
          }
        }
        await this.chat.user(said, imgs.map((i) => fileUrl(i.path)));
        this.robot.setPose("read");
        await this.wm.sleep(Math.min(3200, 800 + said.length * 12));
        for (const img of imgs.slice(0, 2)) {
          this.onActivity(`Looking at ${img.name}`);
          await this.tool.picture(img.name, fileUrl(img.path));
        }
        return;
      }
      case "reasoning": {
        this.noteFor = new WeakMap();
        this.onActivity("Thinking");
        this.stage.setGlow(GLOW.think);
        this.robot.setPose("think");
        const summary = (t: string) => {
          const clean = (t || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
          return clean.length > 170 ? clean.slice(0, 168).replace(/\s+\S*$/, "") + " …" : clean;
        };
        let last = "";
        const start = Date.now();
        const notes = await this.openNotes();
        for (;;) {
          const cur = this.get(id);
          const s = summary(cur.data.text || "");
          if (s && s !== last) { this.stage.say(s, "think"); last = s; void this.writeNote(notes, cur.data.text || ""); }
          if (!(cur.status === "running" || cur.data.streaming) || this.queue.length > 1) break;
          await this.wm.sleep(250);
          if (Date.now() - start > 90000) break;
        }
        await this.wm.sleep(last ? 1400 + Math.min(2200, last.length * 12) : 600);
        return;
      }
      case "assistant_message": {
        this.onActivity("Writing to you");
        this.stage.setGlow(GLOW.chat);
        await this.chat.assistant(() => {
          const cur = this.get(id);
          return { text: cur.data.text || "", done: !(cur.status === "running" || cur.data.streaming) };
        });
        await this.wm.sleep(500);
        return;
      }
      case "command_execution": {
        const pre = classify(d.input || "", "", root || "");
        if (pre.kind === "terminal") {
          this.onActivity("Running a command");
          this.stage.setGlow(GLOW.terminal);
          const h = await this.term.run(pre.command);
          this.robot.setPose("read");
          const done = await this.settle(id);
          await h.finish(done.data.output || "", done.data.exitCode);
          await this.wm.sleep(600);
          return;
        }
        const done = await this.settle(id, 30000);
        const act = classify(done.data.input || "", done.data.output || "", root || "");
        if (act.kind === "list") {
          this.onActivity(`Looking through ${baseName(act.path)}`);
          this.stage.setGlow(GLOW.files);
          await this.files.list(act.path, act.entries, root);
        } else if (act.kind === "search") {
          this.onActivity(`Searching for “${act.query}”`);
          this.stage.setGlow(GLOW.files);
          await this.files.search(act.query, act.path, act.hits, root);
        } else if (act.kind === "read") {
          this.onActivity(`Reading ${baseName(act.path)}`);
          this.stage.setGlow(GLOW.editor);
          await this.editor.read(act.path, act.lines, act.start);
        } else {
          const h = await this.term.run(act.command);
          await h.finish(done.data.output || "", done.data.exitCode);
        }
        return;
      }
      case "file_change": {
        const done = await this.settle(id, 20000);
        const dd = done.data;
        const first = dd.fileName || dd.path || dd.changes?.[0]?.path || "file";
        const changes: { path: string; operation?: string }[] = dd.changes?.length ? dd.changes : [{ path: first, operation: "update" }];
        const sameFile = (a: string, b: string) => a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
        this.stage.setGlow(GLOW.editor);
        for (const ch of changes.slice(0, 6)) {
          const name = ch.path;
          const verb = ch.operation === "add" ? "Creating" : ch.operation === "delete" ? "Deleting" : "Editing";
          this.onActivity(`${verb} ${baseName(name)}`);
          if (ch.operation === "delete") { await this.editor.removed(name); continue; }
          const own = sameFile(name, first) ? dd.diffStr || dd.diff || dd.unifiedDiff || "" : "";
          if (own) { await this.editor.diff(name, parseDiff(own)); continue; }
          // The event only carries one file's text; read the others from disk as they are now.
          const text = await this.readText(name);
          if (text == null) { await this.editor.read(name, ["(this file could not be opened)"], 1); continue; }
          if (ch.operation === "add") await this.editor.diff(name, parseDiff(text));
          else await this.editor.read(name, text.split(/\r?\n/).slice(0, 1500), 1);
        }
        return;
      }
      case "web_search": {
        this.stage.setGlow(GLOW.browser);
        const done = await this.settle(id, 20000);
        const targets: string[] = [...new Set<string>((done.data.patterns || []).concat(done.data.query ? [done.data.query] : []))].slice(0, 3);
        for (const t of targets.length ? targets : ["the web"]) {
          this.onActivity(/^https?:/.test(t) ? `Visiting ${new URL(t).hostname}` : `Searching the web`);
          await this.browser.visit(t);
        }
        return;
      }
      case "dynamic_tool": {
        const name: string = d.toolName || "tool";
        if (await this.playTool(id, name)) return;
        const url = d.input?.url || d.input?.href;
        if (typeof url === "string" && /^https?:/.test(url)) {
          this.onActivity(`Visiting ${new URL(url).hostname}`);
          this.stage.setGlow(GLOW.browser);
          await this.browser.visit(url);
          return;
        }
        this.onActivity(`Using ${prettyTool(name).action}`);
        this.stage.setGlow(GLOW.tool);
        await this.tool.show(name, d.input);
        await this.settle(id, 15000);
        return;
      }
      case "user_input_request": {
        const q = (d.questions || []).map((x: any) => x.question).join("\n") || "I have a question for you.";
        this.onActivity("Waiting for your answer");
        this.stage.setGlow(GLOW.chat);
        this.robot.setPose("ask");
        this.stage.say(q, "speak");
        await this.chat.note(q, "ask");
        const done = await this.settle(id, 30 * 60 * 1000);
        const answer = done.data.questionAnswer?.answers ? Object.values(done.data.questionAnswer.answers).join("\n") : "";
        this.stage.say(null);
        this.robot.setPose("rest");
        if (answer) await this.chat.user(String(answer));
        return;
      }
      case "subagent": {
        // The robot opens the harness app of the helper's own harness (its child thread says which,
        // with model and effort), types the brief, and the helper's real activity streams in.
        await this.openHelper(id, {
          child: d.childThreadId || null, prompt: String(d.prompt || d.title || "Help with this"), title: String(d.title || "Subtask"),
          provider: d.providerInstanceId || undefined, driver: d.driver || undefined,
        });
        if (it.status !== "running" && it.status !== "pending") this.finishSession(id);
        return;
      }
      case "todo_list": {
        await this.playPlan(d.steps || []);
        return;
      }
      case "compaction": {
        // Compaction is the robot's coffee break: lean back, stretch, sip, then back to it.
        this.onActivity("Taking a short break");
        this.stage.say(null);
        this.robot.setPose("stretch");
        await this.wm.sleep(1400);
        await this.robot.drink();
        this.robot.setPose("rest");
        await this.wm.sleep(800);
        return;
      }
      case "error": {
        this.wm.toast(d.message || d.text || "Something failed in this run", "tool");
        await this.chat.note(d.message || d.text || "The run hit an error.", "error");
        return;
      }
      default:
        return;
    }
  }
}
