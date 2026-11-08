import { Botword } from "./office-apps/botword";
import { reportDocument } from "./office-apps/word-markdown";
import { uiText } from "./localization";
import { frontendUrlFromOutput } from "./os/frontend";
import { renderFps } from "./perf/render";
import gsap from "gsap";
import { WM, Cancelled } from "./os/wm";
import { CalcApp, WORK_SUMS } from "./os/calc";
import { checkTime } from "./os/glance";
import { MusicApp } from "./os/music";
import { IdleLife } from "./os/idle";
import { HarnessApp, harnessKind, THEMES, type HarnessSession, type SubagentEvent } from "./harness/harness";
import { fileUrl } from "./office/chat-panel";
import { UacPrompt } from "./os/uac";
import { harnessName } from "./office/brand";
import { FilesApp, EditorApp, TerminalApp, BrowserApp, ToolApp, toolActivity } from "./os/apps";
import { findUpload, ToolViewWatch } from "./os/tool-view";
import { attachmentsOf, sourcesFor } from "./os/attachment-source";
import { attachmentSendOutcome, playSend, type DiskFact, type SendOutcome } from "./os/send-files";
import { listingProblem } from "./os/explorer-model";
import { T3CodeApp } from "./harness/t3code";
import { CodexApp } from "./os/codex";
import { imageGenOf, imageResult, type ImageGen } from "./os/imagegen";
import { ImageRefreshGate, type ImageRefresh, type ImageState } from "./os/image-refresh";
import { NotePresentation } from "./harness/note-presentation";
import { classify, parseDiff, baseName, relPath, unwrap, type Entry } from "./os/classify";
import { TasksApp, type TaskStep } from "./os/tasks";
import { GitDeskApp, type DeskFile } from "./os/gitdesk";
import { gitPlan, gitFacts, isGitWork, type GitPlan, type GitStep, type GitFacts } from "./os/git";
import { cleanQuery, hostOf, type Result } from "./os/sites";
import type { PrInfo } from "./os/browser";
import type { SeatedRobot as Robot } from "./office/rig";
import type { DeskStage as Stage } from "./office/desk";
import { OfficeSuite, OFFICE_GLOW, officeActivity, officeKind, officeTargets, resolveIn } from "./office-apps";

export type Item = { id: string; runId: string | null; ordinal: number; type: string; status: string; updatedAt: string; data: any };
export type ThreadInfo = { id: string; title: string; provider: string; model?: string | null; effort?: string | null; projectTitle?: string; root?: string; run?: { id: string; status: string } | null; queued?: { id: string; text: string }[]; error?: string };

// Reconnected watches can contain the same JSON objects with new identities.
// Compare without serializing large tool outputs a second time or keeping a copy.
export function samePresentationValue(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(key => Object.hasOwn(b, key) && samePresentationValue(a[key], b[key]));
}

const GLOW: Record<string, string> = {
  editor: "#6f7dff", terminal: "#4ff0a0", browser: "#4fd2ff", chat: "#ff7aa8", files: "#ffbf5a", tool: "#b07cff", think: "#9d8cff", idle: "#4fb6ff", tasks: "#4fd8c0", git: "#a37cff",
};

const isUrl = (s: string) => /^https?:\/\//i.test(s);
// What a web item did: searched, opened pages, or looked for a word on a page ("'term' in url").
function webKind(pats: string[]): { kind: "find"; term: string; url: string | null } | { kind: "open"; urls: string[] } | { kind: "search"; queries: string[] } {
  const last = pats[pats.length - 1] || "";
  const fm = last.match(/^'(.+)'(?: in (https?:\/\/\S+))?$/);
  if (fm && pats.length >= 2) return { kind: "find", term: fm[1], url: fm[2] || pats.find(isUrl) || null };
  const urls = pats.filter(isUrl);
  if (urls.length && urls.length === pats.length) return { kind: "open", urls: [...new Set(urls)] };
  return { kind: "search", queries: [...new Set(pats.filter((p) => !isUrl(p)))] };
}
// Search results from a WebSearch tool's text output: JSON {title, url} pairs or markdown links.
function linksIn(text: string): Result[] {
  const out: Result[] = [];
  for (const m of text.matchAll(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"url"\s*:\s*"(https?:\/\/[^"]+)"/g)) out.push({ title: JSON.parse(`"${m[1]}"`), url: m[2] });
  if (!out.length) for (const m of text.matchAll(/\[([^\]]{3,160})\]\((https?:\/\/[^)\s]+)\)/g)) out.push({ title: m[1], url: m[2] });
  return out.slice(0, 8);
}
function gitActivity(steps: GitStep[]) {
  const ops = steps.map((s) => s.op);
  const m = steps.find((s) => s.op === "merge") as { branch: string } | undefined;
  const c = steps.find((s) => s.op === "checkout") as { branch: string; create: boolean } | undefined;
  if (ops.includes("pr-create")) return "Opening a pull request";
  if (ops.includes("pr-merge")) return "Merging the pull request";
  if (ops.includes("commit") && ops.includes("push")) return "Committing and pushing";
  if (ops.includes("commit")) return "Committing its changes";
  if (ops.includes("push")) return "Pushing to GitHub";
  if (ops.includes("pull")) return "Pulling the latest changes";
  if (m) return `Merging ${m.branch}`;
  if (c) return c.create ? `Creating branch ${c.branch}` : `Switching to ${c.branch}`;
  return "Fetching from GitHub";
}

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
  private frontendSignals = new Map<string, string>();
  private catchingUp = false;
  private info: ThreadInfo | null = null;
  private lastRunStatus = "";
  private pendingInitial: Item[] | null = null;
  private files: FilesApp; private editor: EditorApp; private term: TerminalApp;
  private uac: UacPrompt;
  private browser: BrowserApp; private codex: CodexApp; private chat: T3CodeApp; private nativeMessages: T3CodeApp;
  private get messages() { return this.wm.prefs?.chatApp === "t3code" ? this.chat : this.nativeMessages; }
  private attachmentChat: { id: string; app: T3CodeApp } | null = null;
  private get messageApp(): "chat" | "t3code" { return this.wm.prefs?.chatApp === "t3code" ? "t3code" : "chat"; } private tool: ToolApp; private toolWatch = new ToolViewWatch(); private tasks: TasksApp;
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
  private imageRefresh = new ImageRefreshGate();

  constructor(private wm: WM, private robot: Robot, private stage: Stage, peek: (url: string) => Promise<any>, private image: (path: string) => Promise<string | null>, private readText: (path: string) => Promise<string | null>) {
    this.files = new FilesApp(wm);
    this.editor = new EditorApp(wm);
    this.term = new TerminalApp(wm);
    // the permission prompt: real approvals only, read from T3 itself
    const lucid = () => (window as any).lucid;
    this.uac = new UacPrompt(wm, {
      pending: async (id) => (await lucid()?.pendingRequests?.(id)) ?? [],
      outcome: async (threadId, requestId) => (await lucid()?.requestOutcome?.(threadId, requestId)) ?? null,
    });
    this.browser = new BrowserApp(wm, peek);
    // the thread itself plays out in T3 Code, the app it really lives in (stable or Nightly per robot)
    this.chat = new T3CodeApp(wm);
    this.nativeMessages = new T3CodeApp(wm, "user");
    this.tool = new ToolApp(wm);
    this.codex = new CodexApp(wm);
    this.tasks = new TasksApp(wm);
    this.gitdesk = new GitDeskApp(wm);
    this.idleLife = new IdleLife(wm, robot, stage);
    this.idleLife.browser = this.browser;
    this.idleLife.hold = () => this.waitingForUser || !this.present();
    this.music = new MusicApp(wm);
    this.idleLife.music = this.music;
    this.harness = new HarnessApp(wm as any);
    this.peekFn = peek;
    this.idleLife.onActivity = (t) => this.onActivity(t);
  }

  private websiteCanvas: string | null = null;
  /** An explicit Ares studio session may use this robot's screen while its T3 job is idle. */
  async watchWebsiteCanvas(url: string | null) {
    this.websiteCanvas = url;
    if (!url) { this.wm.cursorEl.style.visibility = ''; this.idle(); return; }
    if (this.info?.run?.status === 'running') return;
    this.idleLife.halt(); this.robot.setPose('read'); this.stage.setGlow(GLOW.browser);
    this.wm.cursorEl.style.visibility = 'hidden'; // the canvas owns the one visible cursor
    this.onActivity('Website studio on Ares');
    await this.browser.open(url, { instant: true, read: false, real: true, title: 'Website studio on Ares' });
  }

  reset() {
    window.clearTimeout(this.historyTimer);
    this.historyTimer = 0; this.historyThread = null; this.historyGeneration++; this.historyCut = 0;
    this.notePresentation.reset();
    this.websiteCanvas = null; this.wm.cursorEl.style.visibility = '';
    this.idleLife.stop();
    for (const s of this.sessions.values()) window.clearInterval(s.timer);
    this.sessions.clear();
    this.helperOf.clear();
    this.helperHints.clear();
    this.harness.reset();
    this.chat.reset();
    this.files.reset();
    this.nativeMessages.reset();
    this.attachmentChat?.app.reset(); this.attachmentChat = null;
    this.imageRefresh.reset();
    this.browser.reset();
    this.codex.reset();
    this.uac.reset();
    this.mobile = false;
    if (this.phoneUp) { this.phoneUp = false; void this.robot.holdPhone(false); }
    this.lastEventAt = 0;
    this.frontendSignals.clear();
    this.toolWatch.clear();
    this.wm.reset();
    this.items.clear();
    this.queue = [];
    this.played.clear();
    this.info = null;
    this.lastRunStatus = "";
    this.pendingInitial = null;
    this.stage.say(null);
    this.stage.setPlan([]);
    this.tasks.reset();
    this.planSig = "";
    this.changed.clear();
    this.committed = [];
    this._office?.reset();
    this.robot.setPose("rest");
  }

  setInfo(info: ThreadInfo) {
    if (this.writingReport && (info.run?.status === "running" || info.id !== this.info?.id)) this.wm.reset();
    if (info.error) return;
    if (this.info && this.info.id !== info.id) { this.imageRefresh.reset(); this.codex.reset(); }
    const first = !this.info;
    this.info = info;
    this.chat.setInfo(info);
    this.nativeMessages.setInfo(info);
    this.codex.setInfo(info);
    this.term.setCwd(info.root || null);
    const status = info.run?.status || "";
    if (status === "running" && this.websiteCanvas) { this.websiteCanvas = null; this.wm.cursorEl.style.visibility = ""; }
    if (status === "running" && this.idleLife.isActive) {
      // New work started (maybe from T3 itself): no more fun, but a sleeping robot only wakes
      // once the first event (usually your message) reaches it, see play().
      this.idleLife.halt();
      if (!this.idleLife.asleep) { this.robot.setPose("think"); this.onActivity("Working"); }
    }
    if (!first && this.lastRunStatus === "running" && status && status !== "running" && !this.queue.length) {
      this.robot.setPose("celebrate");
      this.onActivity("Finished");
      if (this.pumpEpoch === -1) this.idleLife.begin();
    }
    this.lastRunStatus = status;
    this.noteQueue(info.queued ?? [], first);
    // after the robot has settled on this thread (its T3 Code window may still be reset meanwhile)
    if (first && info.id) { this.historyThread = info.id; this.scheduleHistory(); }
    if (this.pendingInitial) {
      const items = this.pendingInitial;
      this.pendingInitial = null;
      this.push(items, true);
    }
  }

  private historyCut = 0;
  private historyThread: string | null = null;
  private historyTimer = 0;
  private historyGeneration = 0;
  private scheduleHistory() {
    if (!this.historyThread || this.historyTimer || !this.present() || !renderFps(this.wm.root)) return;
    const id = this.historyThread, generation = this.historyGeneration;
    this.historyTimer = window.setTimeout(() => {
      this.historyTimer = 0;
      if (this.historyThread !== id || this.info?.id !== id || !this.present() || !renderFps(this.wm.root)) return;
      this.historyThread = null;
      void this.loadHistory(id, generation);
    }, 1200);
  }
  /** The thread's earlier messages (yours with their images, and the robot's replies). */
  private async loadHistory(id: string, generation = this.historyGeneration) {
    try {
      const api = (window as any).lucid;
      const cut = this.historyCut || Date.now();
      const eligible = (m: any) => (m.role === 'user' || m.role === 'assistant') && m.run !== 'queued' && Date.parse(m.at) < cut;
      let msgs: any[];
      if (api?.conversationPage) {
        msgs = [];
        let before: { at: string; rowid: number } | undefined;
        const seen = new Set<string>();
        do {
          const page = await api.conversationPage(id, { limit: 12, ...(before ? { before } : {}) });
          if (this.info?.id !== id || this.historyGeneration !== generation || !Array.isArray(page?.messages)) return;
          msgs = [...page.messages.filter(eligible), ...msgs];
          if (msgs.length >= 12 || !page.hasMore || !page.cursor) break;
          const key = JSON.stringify(page.cursor);
          if (seen.has(key)) break;
          seen.add(key); before = page.cursor;
          if (!this.present()) { this.historyThread = id; return; }
        } while (before);
      } else msgs = await api?.conversation?.(id);
      if (!Array.isArray(msgs) || this.info?.id !== id || this.historyGeneration !== generation) return;
      const past = msgs
        .filter(eligible)
        .slice(-12)
        .map((m: any) => {
          const raw = String(m.text || "");
          const paths = [...raw.matchAll(/^\s*-\s*image:\s*(.+)$/gim)].map((x) => x[1].trim());
          for (const a of m.attachments || []) if (a.path && /^image\//.test(a.mime || "image/")) paths.push(a.path);
          return { role: m.role, text: raw.replace(/\s*Attached:[\s\S]*$/, "").trim(), images: [...new Set(paths)].map((p) => fileUrl(p, this.info?.id ?? null)) };
        })
        .filter((m: any) => m.text || m.images.length);
      this.messages.history(past);
    } catch { /* no history then */ }
  }

  // Your queued messages are written down in the robot's to-do app; when you reorder, edit
  // or remove them (or one gets sent), the robot updates the list by hand.
  private queueSig = "";
  private queueSeq = 0;
  private noteQueue(list: { id: string; text: string }[], first: boolean) {
    const sig = JSON.stringify(list);
    if (sig === this.queueSig) return;
    this.queueSig = sig;
    if ((this.wm.prefs?.tasks ?? "board") === "sticky") return;
    if (first && !list.length) return;
    // one pending update is enough: replace its list instead of queueing another
    const pending = this.queue.find((id) => this.items.get(id)?.type === "lucid_queue");
    if (pending) { this.items.get(pending)!.data.list = list; return; }
    const id = `lucid-queue-${++this.queueSeq}`;
    const last = Math.max(0, ...[...this.items.values()].map((i) => i.ordinal || 0));
    this.items.set(id, { id, runId: null, ordinal: last + 0.5, type: "lucid_queue", status: "completed", updatedAt: new Date().toISOString(), data: { list, instant: first } } as any);
    this.queue.push(id);
    if (this.idleLife.isActive) this.idleLife.halt();
    void this.pump();
  }

  push(items: Item[], initial: boolean) {
    // Watches deliver their snapshot before metadata. Never infer live work from
    // the last historical turn while its authoritative status is still unknown.
    if (initial && !this.info) { this.pendingInitial = items; return; }
    let latestRun: string | null = null;
    if (initial) latestRun = this.info?.run?.status === "running" ? this.info.run.id : null;
    // what is replayed starts here; older messages are shown as history in T3 Code
    if (initial) { const t = latestRun ? items.filter((i) => i.runId === latestRun).map((i) => Date.parse(i.updatedAt)).filter((n) => n > 0) : []; this.historyCut = t.length ? Math.min(...t) - 1500 : Date.now(); }
    items = items.filter(it => !samePresentationValue(this.items.get(it.id), it));
    if (!items.length) return;
    for (const it of items) {
      const t = Date.parse(it.updatedAt);
      if (t > this.lastEventAt) this.lastEventAt = t;
      // React to streaming server output while the shell command is still running.
      // The mirror uses its own cancellable tab lifecycle; it never sends UI clicks.
      if (!initial && (it.type === 'command_execution' || it.type === 'dynamic_tool')) {
        const output = outText(it.data.output);
        const url = frontendUrlFromOutput(output);
        if (url && this.frontendSignals.get(it.id) !== url) {
          this.frontendSignals.set(it.id, url);
          void this.browser.open(url, { instant: true, read: false, real: true }).catch(() => {});
        }
        const tool = String(it.data.toolName || '');
        if (/html_(render|preview)$/.test(tool) && typeof it.data.input?.html === 'string') this.browser.refreshFrontendHtml(it.data.input.html);
      }
      this.items.set(it.id, it);
      this.toolWatch.update(it.id);   // a tool window still showing this call follows its real outcome
      this.chat.update(it);   // a work row already in T3 Code follows its item (Running, then Ran)
      const imageUpdate = this.imageRefresh.tracks(it.id) ? this.imageRefresh.observe(it.id, this.imageState(it)) : null;
      if (imageUpdate) this.refreshImage(imageUpdate);
      // An approval is not a scene: the robot is stuck until it is answered, so the prompt comes up
      // on its screen at once, whatever else it is playing, and only while T3 really has it open.
      if (it.type === "approval_request") {
        this.played.add(it.id);
        const open = it.status !== "completed" && it.status !== "failed" && it.status !== "cancelled";
        if (open && this.info?.id) {
          void this.uac.sync(this.info.id, String(it.data?.requestId || ""), { name: this.wm.robotName || "This robot", harness: harnessName(this.info.provider) }).then(() => { if (this.uac.isUp) this.onActivity("Waiting for your approval"); });
        }
        continue;
      }
      if (SKIP.has(it.type) || this.played.has(it.id) || this.queue.includes(it.id)) continue;
      // Completed turns belong in conversation history, never in a startup work scene.
      if (initial && (!latestRun || it.runId !== latestRun)) { this.played.add(it.id); continue; }
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
    if (this.queue.length && this.idleLife.isActive) this.idleLife.halt();
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
    const w = await this.wm.open("notes");
    if (!w.body.querySelector(".notes")) w.body.innerHTML = `<div class="notes-workspace"><div class="notes-chrome" aria-hidden="true"></div><div class="notes"></div></div>`;
    const chrome = w.body.querySelector(".notes-chrome");
    if (chrome) chrome.textContent = this.wm.prefs?.notesApp === "notepad-plus-plus" ? "File   Edit   Search   View\nnotes.txt" : this.wm.prefs?.notesApp === "notepad" ? "File   Edit   View\nnotes.txt" : "Notes";
    return w.body.querySelector(".notes") as HTMLElement;
  }
  private noteFor = new WeakMap<HTMLElement, HTMLElement>();
  private notePresentation = new NotePresentation(() => this.wm.epoch, (key) => this.robot.pressKey(key),
    { present: () => this.present(), wait: (epoch) => this.wm.waitForOperator(epoch) });
  private async writeNote(box: HTMLElement, text: string) {
    const clean = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 600);
    let p = this.noteFor.get(box);
    if (!p || !p.isConnected) {
      p = document.createElement("p");
      box.appendChild(p);
      this.noteFor.set(box, p);
      while (box.children.length > 6) box.firstElementChild!.remove();
    }
    await this.notePresentation.write(box, p, clean, this.wm.speed);
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
    let polling = false;
    const tick = async () => {
      if (s.done || polling || !this.present()) return;
      polling = true;
      try {
      const items = await this.childItems(child, s.since).catch(() => []);
      if (s.done || ![...this.sessions.values()].includes(s)) return;
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
        if (s.done || ![...this.sessions.values()].includes(s)) return;
        if (info && !s.hasModel && info.model) { s.hasModel = true; session.setMeta({ model: info.model, effort: info.effort || undefined }); }
        const st = info?.run?.status || "";
        if (st === "running") s.runSeen = true;
        else if (s.runSeen && /^(completed|failed|interrupted|cancelled|canceled|error)$/.test(st)) this.endHelper(s, s.last || "Done", st === "completed");
      }
      } finally { polling = false; }
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

  // You are typing to this robot in Lucid's side chat. It can only know that if it sees it:
  // awake at its desk with its Messages app on top, where your typing bubble shows up. Then it
  // stops to read along. Asleep, away or busy in another app, it notices nothing until the
  // message actually arrives (see "user_message" in play()).
  private userTypingAt = 0;
  private get waitingForUser() { return Date.now() - this.userTypingAt < 8000; }
  /** The desk robot is in its chair (not walking back to it). Set by the desk. */
  present: () => boolean = () => this.wm.operatorPresent && this.wm.presentationVisible;
  setPresentationVisible(visible: boolean) {
    const wasVisible = this.wm.presentationVisible;
    this.wm.setPresentationVisible(visible);
    if (!visible && this.writingReport) this.wm.reset();
    if (!visible) {
      window.clearTimeout(this.historyTimer); this.historyTimer = 0;
      return;
    }
    this.scheduleHistory();
    if (!wasVisible && this.pumpEpoch === -1 && this.present()) {
      if (this.queue.length) void this.pump(); else if (this.info && !this.idleLife.isActive) this.idle();
    }
  }
  setPresent(here: boolean) {
    if (here === this.wm.operatorPresent) return;
    if (!here) {
      this.busyToken++;
      this.idleLife.leaveDesk();
    }
    this.wm.setOperatorPresent(here);
    if (here) this.scheduleHistory();
    if (here && this.pumpEpoch === -1) {
      if (this.queue.length) void this.pump();
      else if (this.info) this.idle();
    }
  }
  private seesChat() {
    return this.present() && !this.idleLife.asleep && !this.idleLife.holdingPhone && !this.phoneUp && this.wm.isFront(this.messageApp);
  }
  userTyping(on: boolean) {
    if (on) {
      if (!this.seesChat()) return;
      const fresh = !this.waitingForUser;
      this.userTypingAt = Date.now();
      void this.messages.youTyping(true).catch(() => {});
      // real work keeps going; only the bubble shows the typing
      if (!fresh || this.pumpEpoch !== -1) return;
      this.busyToken++;
      if (this.idleLife.isActive) this.idleLife.halt();
      this.onActivity("Watching you type");
      this.robot.setPose("read");
      return;
    }
    void this.messages.youTyping(false).catch(() => {});
    if (!this.waitingForUser) return;   // it never saw you typing
    this.userTypingAt = Date.now() - 2000;   // a short grace period in case the message is on its way
    const epoch = this.wm.epoch;
    window.setTimeout(() => {
      if (epoch === this.wm.epoch && this.pumpEpoch === -1 && !this.queue.length && !this.waitingForUser) this.idle();
    }, 6500);
  }

  // A robot walking back to its desk does nothing on its computer until it sits down.
  private async untilPresent() {
    await this.wm.waitForOperator();
  }

  private writingReport = false;
  async writeReport(title: string, response: string) {
    if (!this.present()) return;
    this.writingReport = true;
    this.busyToken++;
    this.idleLife.halt();
    this.wm.reset();
    const epoch = this.wm.epoch;
    try {
      this.onActivity(uiText("Writing report"));
      await new Botword(this.wm).show(reportDocument(title, response), { typed: "all" });
      const win = this.wm.wins.get("botword");
      if (!win || epoch !== this.wm.epoch) return;
      const print = document.createElement("button");
      print.type = "button";
      print.className = "oa-btn";
      Object.assign(print.style, { width: "auto", whiteSpace: "nowrap", flexShrink: "0", padding: "0 10px" });
      print.textContent = uiText("Send to printer");
      win.body.querySelector(".oa-tools")?.append(print);
      await this.wm.pointAt(print, .5, .5);
      await this.wm.click();
      print.textContent = uiText("Sent to printer");
      await this.wm.sleep(450, epoch);
    } finally {
      this.writingReport = false;
      if (this.queue.length) void this.pump();
    }
  }

  private async pump() {
    if (this.writingReport) return;
    if (this.pumpEpoch === this.wm.epoch) return;
    const epoch = (this.pumpEpoch = this.wm.epoch);
    try {
      while (this.queue.length) {
        const backlog = this.queue.length - 1;
        this.wm.speed = Math.min(4.5, (this.catchingUp ? 2.2 : 1) + backlog * 0.45);
        const id = this.queue.shift()!;
        this.played.add(id);
        try {
          // back to work after a pause: maybe some music first (once it is awake and has read your message)
          if (this.wasIdle && !this.idleLife.pending && this.items.get(id)?.type !== "user_message" && this.present()) {
            this.wasIdle = false;
            await this.maybeMusic();
          }
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
          // a song it is not in the mood for: open Botify and skip it
          if (!this.catchingUp && !this.queue.length && this.music.playing && this.present() && Math.random() < 0.05) {
            this.onActivity("Skipping a song");
            if (await this.music.skip()) {
              // and back to work: Botify goes away again
              const w = this.wm.wins.get("music");
              if (w) { await this.wm.pointAt(w.el.querySelector(".win-x")!, 0.5, 0.5, 380); await this.wm.click(); this.wm.close("music"); }
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
      // interrupted with scenes still waiting: pick them up again instead of leaving them stuck
      if (this.queue.length && this.pumpEpoch === -1) window.setTimeout(() => void this.pump(), 60);
    }
  }

  private idle() {
    if (this.writingReport) return;
    this.wasIdle = true;
    if (!this.present()) return;
    if (this.websiteCanvas && this.info?.run?.status !== 'running') { this.robot.setPose('read'); this.onActivity('Website studio on Ares'); return; }
    if (this.waitingForUser) { this.robot.setPose("read"); this.onActivity("Watching you type"); void this.messages.youTyping(true).catch(() => {}); return; }
    if (this.phoneUp) { this.mobile = false; void this.phone(false); }
    // Helpers still at work: wait for them and look in on them now and then.
    const live = [...this.sessions.entries()].filter(([, s]) => !s.done);
    if (live.length) {
      this.robot.setPose("think");
      this.onActivity(live.length === 1 ? "Waiting for its helper" : `Waiting for ${live.length} helpers`);
      const epoch = this.wm.epoch;
      window.setTimeout(async () => {
        if (epoch !== this.wm.epoch || this.queue.length || !this.present()) return;
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
    const still = () => this.present() && tok === this.busyToken && epoch === this.wm.epoch && !this.queue.length && this.pumpEpoch === -1 && this.info?.run?.status === "running" && !this.waitingForUser;
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

  /** What the disk says about the exact files an agent attached (size, time). Nothing is listed or read. */
  private async diskFacts(paths: (string | null)[]): Promise<DiskFact[]> {
    const list = [...new Set(paths.filter((p): p is string => !!p))];
    if (!list.length) return [];
    try { return (await (window as any).lucid?.statFiles?.(list)) ?? []; } catch { return []; }
  }

  /**
   * The agent sent files in a message. It opens the Explorer on the folder the upload step names, picks
   * the files, drags them into the message box and sends. This plays back what the recorded steps
   * say happened: the upload and the send were already tool calls, and nothing here repeats them.
   */
  private async playAttachmentSend(id: string) {
    const epoch = this.wm.epoch;
    const input = this.get(id).data.input || {};
    const attachments = attachmentsOf(input);
    const root = this.info?.root || null;
    const sources = sourcesFor(attachments, this.items.values(), root);
    const threadId = String(input.threadId || "");
    // a message with no other address goes to the person this robot is talking to
    const toUser = !threadId || threadId === this.info?.id;
    let destination = this.messages;
    if (!toUser) {
      if (this.attachmentChat?.id !== threadId) {
        this.attachmentChat?.app.reset();
        const app = new T3CodeApp(this.wm);
        const target = await (window as any).lucid?.threadInfo?.(threadId).catch(() => null);
        this.wm.check(epoch);
        app.setInfo({ id: threadId, title: target?.title || "Conversation", provider: target?.provider, model: target?.model, root: target?.root });
        this.attachmentChat = { id: threadId, app };
      }
      destination = this.attachmentChat.app;
    }
    this.onActivity(toUser ? "Sending files to you" : "Sending files to another thread");
    this.stage.setGlow(GLOW.files);
    this.robot.setPose("mouse");
    const disk = await this.diskFacts(sources.map((s) => s.path));
    this.wm.check(epoch);
    const outcome = async (): Promise<SendOutcome> => {
      const done = await this.settle(id, 30000);
      return attachmentSendOutcome(done);
    };
    const result = await playSend({
      wm: this.wm, files: this.files, chat: destination, root, sources, disk,
      text: () => String(this.get(id).data.input?.message || ""), outcome, instant: this.catchingUp,
      state: () => attachmentSendOutcome(this.get(id)),
      follow: (view) => { this.toolWatch.add(id, view); this.toolWatch.update(id); },
    });
    if (!toUser) await destination.inspection(result === "failed" ? "Message could not be sent" : result === "pending" ? "Message awaiting confirmation" : "Message sent", threadId);
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
    if (/t3_thread_send_attachments$/.test(base) && attachmentsOf(this.get(id).data.input).length) {
      await this.playAttachmentSend(id);
      return true;
    }
    if (/t3_thread_send(?:_attachments)?$/.test(base)) {
      this.onActivity("Sending a T3 message");
      this.robot.setPose("read");
      const done = await this.settle(id, 20000);
      const message = String(done.data.input?.message || "");
      await this.chat.assistant(() => ({ text: message || "Attachments sent.", done: true }));
      await this.chat.inspection(done.status === "failed" ? "Message could not be sent" : "Message sent to another thread", String(done.data.input?.threadId || ""));
      return true;
    }
    if (/t3_thread_read$/.test(base)) {
      this.onActivity("Reading a T3 thread");
      this.robot.setPose("read");
      const done = await this.settle(id, 20000);
      await this.chat.inspection(done.status === "failed" ? "Thread could not be read" : "T3 thread read", text(done.data.output));
      return true;
    }
    if (/^(bash|powershell|shell|run_command)$/i.test(base)) {
      const cmd = this.get(id).data.input?.command || "";
      if (await this.playGit(id, cmd)) return true;
      this.onActivity("Running a command");
      this.stage.setGlow(GLOW.terminal);
      const h = await this.term.run(cmd);
      this.robot.setPose("read");
      const done = await this.settle(id);
      await h.finish(text(done.data.output), done.data.output?.exitCode ?? null);
      await this.officeFollowUp(cmd, text(done.data.output), done.data.output?.exitCode ?? null);
      await this.wm.sleep(500);
      return true;
    }
    if (/^(Write|Edit|MultiEdit)$/.test(base) && officeKind(this.get(id).data.input?.file_path)) {
      // Claude wrote or edited a document (a csv, say): show it in the office app
      const done = await this.settle(id, 20000);
      const inp = done.data.input || {};
      const added = base === "Edit" ? inp.new_string : base === "MultiEdit" ? (inp.edits || []).map((x: any) => x?.new_string || "").join("\n") : undefined;
      await this.playOffice(String(inp.file_path), base === "Write" ? "add" : "update", { text: base === "Write" && typeof inp.content === "string" ? inp.content : null, added: typeof added === "string" ? added : undefined });
      return true;
    }
    if (/^(Write|Edit|MultiEdit)$/.test(base) && /\.html?$/i.test(String(this.get(id).data.input?.file_path || ''))) {
      const done = await this.settle(id, 20000);
      if (!/failed|cancelled|interrupted/.test(done.status) && root) {
        this.onActivity('Watching the frontend update'); this.stage.setGlow(GLOW.browser);
        await this.browser.frontendFile(String(done.data.input?.file_path), root);
      }
      return true;
    }
    if (base === "Read") {
      const done = await this.settle(id, 20000);
      const p = done.data.input?.file_path || done.data.input?.path || "";
      if (done.data.viewedImagePath || done.data.output?.type === "image") {
        this.onActivity(`Looking at ${baseName(p)}`);
        this.stage.setGlow(GLOW.tool);
        const src = fileUrl(done.data.viewedImagePath || p, this.info?.id ?? null);
        await this.tool.picture(baseName(p), src, () => this.image(done.data.viewedImagePath || p));
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
      await this.files.search(q, done.data.input?.path || root || "", act.kind === "search" ? act.hits : [], root, { instant: this.catchingUp });
      return true;
    }
    if (base === "Glob") {
      const done = await this.settle(id, 20000);
      const out = text(done.data.output);
      const found = /^\s*no files? found/i.test(out) || listingProblem(out) ? [] : out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 400);
      this.onActivity("Looking for files");
      this.stage.setGlow(GLOW.files);
      const where = done.data.input?.path || root || "";
      if (found.length) await this.files.matches(where, found, root, { instant: this.catchingUp });
      else await this.files.list(where, [], root, { instant: this.catchingUp, problem: listingProblem(out) });
      return true;
    }
    if (base === "WebFetch" || base === "WebSearch") {
      const it = this.get(id);
      const inp = it.data.input || {};
      this.stage.setGlow(GLOW.browser);
      if (base === "WebFetch" && inp.url) {
        this.onActivity(`Reading ${hostOf(String(inp.url)) || "a web page"}`);
        await this.browser.open(String(inp.url), { instant: this.catchingUp });
        return true;
      }
      const done = await this.settle(id, 20000);
      const q = String(inp.query || "");
      this.onActivity(q ? `Searching the web for “${cleanQuery(q).slice(0, 60)}”` : "Searching the web");
      await this.browser.search(q || "the web", { results: linksIn(outText(done.data.output)), instant: this.catchingUp, then: this.nextPages(it) });
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
    if (/^(orchestrator_|task_|t3_thread_|t3_environment_)/.test(base)) {
      const done = await this.settle(id, 15000);
      this.onActivity("Coordinating in T3 Code");
      await this.chat.inspection(base.replace(/_/g, " "), text(done.data.output));
      return true;
    }
    if (base === "delegate_task") {
      await this.chat.inspection("Delegating a task", String(this.get(id).data.input?.task || this.get(id).data.input?.title || ""));
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
    // T3's preview browser: each of its tabs is a tab in the robot's browser, with the real title
    if (base === "preview_navigate" || base === "preview_open" || base === "preview_snapshot") {
      const done = await this.settle(id, 15000);
      const out = done.data.output || {};
      const inp = done.data.input || {};
      const url = String((out.url && !/^chrome-error:/.test(out.url) ? out.url : "") || inp.url || (inp.target?.kind === "environment-port" ? `${inp.target.protocol || "http"}://localhost:${Number(inp.target.port)}${inp.target.path || "/"}` : ""));
      const tabId = out.tabId || inp.tabId;
      if (base === 'preview_snapshot' && typeof out.accessibilityTree === 'string') this.browser.rememberFrontendSnapshot(out.accessibilityTree);
      if (/^https?:/.test(url) && (base !== "preview_snapshot" || out.visibleText)) {
        this.stage.setGlow(GLOW.browser);
        this.onActivity(base === "preview_snapshot" ? "Reading the page" : base === "preview_open" ? "Opening a tab" : `Visiting ${hostOf(url)}`);
        await this.browser.open(url, { instant: this.catchingUp, title: out.title || undefined, text: base === "preview_snapshot" ? String(out.visibleText) : undefined, key: tabId ? `pv:${tabId}` : undefined, real: true });
        return true;
      }
      if (base === "preview_navigate") return false; // a normal visit, handled by the caller
    }
    if (browserActs[base]) {
      this.onActivity(browserActs[base]);
      this.stage.setGlow(GLOW.browser);
      const done = await this.settle(id, 15000);
      const input = done.data.input || {};
      this.browser.frontendAction({ selector: input.selector || input.locator, x: input.x, y: input.y,
        viewportWidth: done.data.output?.viewport?.width, viewportHeight: done.data.output?.viewport?.height });
      await this.browser.act(browserActs[base], done.data.output?.title, done.data.output?.url);
      return true;
    }
    if (base === "preview_close" || base === "t3_preview_close") {
      const done = await this.settle(id, 10000);
      if (/^(failed|cancelled|canceled|interrupted|aborted)$/.test(done.status) || done.data.output?.isError) {
        this.onActivity("Could not close the browser tab");
        return true;
      }
      if (done.status === "running" || done.status === "pending" || done.data.streaming) {
        this.onActivity("Waiting for the browser tab to close");
        return true;
      }
      const tabId = done.data.input?.tabId || done.data.output?.tabId;
      this.onActivity("Closing a browser tab");
      await this.browser.closeTab(tabId ? `pv:${tabId}` : undefined, this.catchingUp);
      if (this.mobile) await this.phone(false);
      return true;
    }
    // HTML the robot wrote and rendered to look at it: the browser draws that very page
    if (base === "html_render" || base === "html_preview") {
      const inp = this.get(id).data.input || {};
      const html = typeof inp.html === "string" && /</.test(inp.html) ? inp.html : null;
      if (html) {
        const title = String(inp.title || "").trim();
        this.stage.setGlow(GLOW.browser);
        this.onActivity(title ? `Looking at “${title.slice(0, 50)}” in the browser` : "Looking at the page it built");
        await this.browser.open("about:blank", { instant: this.catchingUp, title: title || undefined, html, key: `frontend-html`, newTab: false });
        return true;
      }
    }
    return false;
  }

  // --- the web ------------------------------------------------------------------
  /** The pages it read right after a search: the next web items (fetches, opened URLs) until another search. */
  private nextPages(it: Item): string[] {
    const later = [...this.items.values()].filter((x) => x.ordinal > it.ordinal && x.runId === it.runId).sort((a, b) => a.ordinal - b.ordinal).slice(0, 16);
    const urls: string[] = [];
    for (const x of later) {
      if (x.type === "web_search") {
        const w = webKind((x.data.patterns || []).map(String));
        if (w.kind === "search") break;
        if (w.kind === "open") for (const u of w.urls) if (!urls.includes(u)) urls.push(u);
      } else if (x.type === "dynamic_tool" && /(^|__|\.)WebFetch$/.test(String(x.data.toolName || ""))) {
        const u = String(x.data.input?.url || "");
        if (isUrl(u) && !urls.includes(u)) urls.push(u);
      } else if (x.type === "dynamic_tool" && /(^|__|\.)WebSearch$/.test(String(x.data.toolName || ""))) break;
      if (urls.length >= 4) break;
    }
    return urls;
  }

  // A web item: a search (results page, then the pages it read open in tabs), a page, or find in page.
  private async playWeb(it: Item) {
    const d = it.data;
    const pats: string[] = [...(d.patterns || []), ...(d.query ? [d.query] : [])].map(String).filter(Boolean);
    const instant = this.catchingUp;
    if (!pats.length) { await this.wm.sleep(300); return; }
    const w = webKind(pats);
    if (w.kind === "find") {
      this.onActivity(`Looking for “${w.term.slice(0, 40)}” on the page`);
      await this.browser.find(w.term, w.url, { instant });
      return;
    }
    if (w.kind === "open") {
      for (const u of w.urls.slice(0, 3)) { this.onActivity(`Reading ${hostOf(u)}`); await this.browser.open(u, { instant }); }
      return;
    }
    const results: Result[] = (d.results || []).filter((r: any) => r?.url && r?.title).map((r: any) => ({ url: String(r.url), title: String(r.title), snippet: r.snippet ? String(r.snippet).slice(0, 240) : undefined, image: r.image || r.thumbnail || r.image_url || undefined }));
    const queries = w.queries.slice(0, 2);
    const then = this.nextPages(it);
    for (const [i, q] of queries.entries()) {
      this.onActivity(`Searching the web for “${cleanQuery(q).slice(0, 60)}”`);
      await this.browser.search(q, { results: i === 0 && results.length ? results : null, instant, then: i === queries.length - 1 ? then : [] });
    }
  }

  // --- git and GitHub -------------------------------------------------------------
  private gitdesk: GitDeskApp;
  /** Files changed since the last commit it showed (repo-relative path to status and latest diff). */
  private changed = new Map<string, { status: DeskFile["status"]; diff?: string }>();
  private committed: DeskFile[] = [];

  private noteChange(path: string, op: string | undefined, diff: string) {
    const rel = relPath(path, this.info?.root || null);
    const prev = this.changed.get(rel);
    const added = op === "add" || /^--- \/dev\/null/m.test(diff);
    this.changed.set(rel, { status: added || prev?.status === "new" ? "new" : op === "delete" ? "deleted" : "modified", diff: diff || prev?.diff });
  }

  private repoInfo(): Promise<any> {
    const root = this.info?.root;
    const api = (window as any).lucid;
    if (!root || !api?.gitInfo) return Promise.resolve(null);
    return Promise.resolve(api.gitInfo(root)).then((r: any) => (r?.ok ? r : null)).catch(() => null);
  }

  private cmdResult(it: Item) {
    const d = it.data;
    const output = it.type === "command_execution" ? String(d.output || "") : outText(d.output);
    const exit = it.type === "command_execution" ? d.exitCode ?? null : d.output?.exitCode ?? (d.output?.isError ? 1 : null);
    return { output, exit: exit as number | null, ok: exit == null || exit === 0 };
  }

  private commitFiles(plan: GitPlan, f: GitFacts, fallback: { code: string; path: string }[] | null): DeskFile[] {
    const root = this.info?.root || null;
    const explicit = plan.steps.flatMap((s) => (s.op === "add" && !s.all ? s.paths : [])).map((p) => relPath(p, root).replace(/^\.\//, "").replace(/\/$/, ""));
    const wanted = (p: string) => !explicit.length || explicit.some((e) => p === e || p.startsWith(e + "/"));
    const out = new Map<string, DeskFile>();
    for (const s of f.stat) out.set(s.path, { path: s.path, status: "modified", adds: s.adds, dels: s.dels });
    for (const [p, c] of this.changed) if (wanted(p)) out.set(p, { ...out.get(p), path: p, status: c.status, diff: c.diff });
    for (const e of explicit) if (![...out.keys()].some((p) => p === e || p.startsWith(e + "/"))) out.set(e, { path: e, status: "modified" });
    if (!out.size && fallback) for (const c of fallback) out.set(c.path, { path: c.path, status: /\?|A/.test(c.code) ? "new" : /D/.test(c.code) ? "deleted" : "modified" });
    return [...out.values()];
  }

  private prFiles(f: GitFacts) {
    const count = (diff?: string) => { let a = 0, dd = 0; for (const h of parseDiff(diff || "")) for (const l of h.lines) { if (l.kind === "+") a++; else if (l.kind === "-") dd++; } return [a, dd]; };
    if (f.stat.length) return f.stat.map((s) => ({ path: s.path, adds: s.adds, dels: s.dels }));
    const src = this.committed.length ? this.committed : [...this.changed].map(([path, c]) => ({ path, status: c.status, diff: c.diff } as DeskFile));
    return src.map((x) => { const [a, dd] = x.adds != null ? [x.adds, x.dels ?? 0] : count(x.diff); return { path: x.path, adds: a, dels: dd }; });
  }

  /**
   * Git work looks like git work: terminal robots type it and get the real output (in git's
   * colours), app robots do it in GitHub Desktop; pull requests open on GitHub in the browser.
   */
  private async playGit(id: string, command: string): Promise<boolean> {
    const plan = gitPlan(command);
    if (!plan || !plan.steps.some(isGitWork)) return false;
    const instant = this.catchingUp;
    const it = this.get(id);
    const repo = await this.repoInfo();
    const f0 = gitFacts(this.cmdResult(it).output);
    const repoName: string | null = f0.repo || repo?.repo || null;
    const shown = repoName ? repoName.split("/")[1] : baseName(this.info?.root || "repository");
    let branch: string = f0.commit?.branch || f0.pushRef?.split(" -> ")[0] || repo?.branch || "main";
    const done = this.settle(id).then((x) => this.cmdResult(x));
    const desktop = (this.wm.prefs?.git ?? "cli") === "desktop" && !plan.other.length;
    const prStep = plan.steps.find((s) => s.op === "pr-create" || s.op === "pr-merge") || null;
    this.onActivity(gitActivity(plan.steps) + (desktop ? " in GitHub Desktop" : ""));
    if (!desktop) {
      this.stage.setGlow(GLOW.terminal);
      const h = await this.term.run(unwrap(command));
      this.robot.setPose("read");
      const r = await done;
      await h.finish(r.output, r.exit);
      const f = gitFacts(r.output);
      if (plan.steps.some((s) => s.op === "commit") && r.ok) { this.committed = this.commitFiles(plan, f, null); this.changed.clear(); }
      if ((prStep && r.ok) || f.prUrl) {
        await this.wm.sleep(500);
        if (!instant) await this.term.clickLink(/github\.com\/.+\/pull\//);
        await this.showPr(prStep, f, plan, repoName, branch, false, Promise.resolve(r));
      }
      await this.wm.sleep(500);
      return true;
    }
    this.stage.setGlow(GLOW.git);
    const waits = plan.steps.some((s) => ["push", "pull", "fetch", "merge", "pr-create", "pr-merge"].includes(s.op));
    for (const s of plan.steps) {
      if (s.op === "checkout") { await this.gitdesk.branchTo({ repo: shown, branch, to: s.branch, create: s.create, known: repo?.branch ? [repo.branch] : [], instant }); branch = s.branch; }
      else if (s.op === "commit") {
        const files = this.commitFiles(plan, f0, instant ? null : repo?.changes || null);
        await this.gitdesk.commit({ repo: shown, branch, files, message: s.message || f0.commit?.subject || "Update files", instant, done: waits ? undefined : done });
        this.committed = files;
        this.changed.clear();
      }
      else if (s.op === "push") await this.gitdesk.push({ repo: shown, branch, publish: s.upstream, done, instant, prUrl: (out) => gitFacts(out).prUrl });
      else if (s.op === "pull" || s.op === "fetch") await this.gitdesk.fetch({ repo: shown, branch, pull: s.op === "pull", done, instant });
      else if (s.op === "merge") await this.gitdesk.merge({ repo: shown, branch, from: s.branch, done, instant });
      else if (s.op === "pr-create" || s.op === "pr-merge") await this.showPr(s, f0, plan, repoName, branch, true, done);
    }
    // a push that printed a pull request link: it opens the link in the browser
    const r = await done;
    const f = gitFacts(r.output);
    if (!prStep && f.prUrl && r.ok) await this.showPr(null, f, plan, repoName, branch, false, Promise.resolve(r));
    return true;
  }

  private async showPr(step: GitStep | null, f: GitFacts, plan: GitPlan, repoName: string | null, branch: string, click: boolean, result: Promise<{ ok: boolean; output: string }>) {
    const instant = this.catchingUp;
    const repo = repoName || `local/${baseName(this.info?.root || "repository")}`;
    const create = step?.op === "pr-create" ? step : null;
    const numberOf = (ff: GitFacts) => ff.prNumber ?? (step?.op === "pr-merge" ? step.number : null);
    const commit = plan.steps.find((s) => s.op === "commit") as { message: string } | undefined;
    const info: PrInfo = {
      repo, number: numberOf(f),
      title: create?.title || commit?.message.split("\n")[0] || f.commit?.subject || this.info?.title || "Changes",
      body: create?.body || "", base: create?.base || f.pushRef?.split(" -> ")[1] || "main", head: create?.head || branch,
      user: this.wm.robotName, commits: null, files: this.prFiles(f),
    };
    if (info.base === info.head) info.base = "main";
    this.stage.setGlow(GLOW.browser);
    const done = result.then((r) => ({ ok: r.ok, number: numberOf(gitFacts(r.output)) ?? info.number }));
    if (step?.op === "pr-create") { this.onActivity("Opening a pull request on GitHub"); await this.browser.pullRequest("create", info, { instant, done, click }); }
    else if (step?.op === "pr-merge") { this.onActivity("Merging the pull request on GitHub"); await this.browser.pullRequest("merge", info, { instant, done, click }); }
    else if (f.prUrl && /\/pull\/\d+/.test(f.prUrl)) { this.onActivity("Checking the pull request on GitHub"); await this.browser.pullRequest("view", info, { instant }); }
    else if (f.prUrl) { this.onActivity("Looking at the new branch on GitHub"); await this.browser.pullRequest("compare", info, { instant }); }
  }

  // --- office documents: Botword, Cellsheet, Slidedeck ---------------------------------
  private _office: OfficeSuite | null = null;
  private get office() { return (this._office ??= new OfficeSuite(this.wm)); }

  /** A document the agent wrote or changed: the robot opens the matching office app and types or fills in what is new. */
  private async playOffice(path: string, op: string | undefined, o: { diff?: string; text?: string | null; added?: string } = {}) {
    const kind = officeKind(path);
    if (!kind) return false;
    const file = resolveIn(path, this.info?.root || null);
    this.onActivity(officeActivity(file, op));
    this.stage.setGlow(OFFICE_GLOW[kind]);
    this.robot.setPose("mouse");
    await this.office.show(file, { op, diff: o.diff, text: o.text, added: o.added, instant: this.catchingUp });
    return true;
  }

  /** After a command that obviously wrote documents (python-docx, openpyxl, pandas to_excel, a csv redirect), show them. */
  private async officeFollowUp(command: string, output: string, exit: number | null | undefined) {
    if (exit != null && exit !== 0) return;
    for (const f of officeTargets(String(command), String(output))) { await this.wm.sleep(300); await this.playOffice(f, "add"); }
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
      // the page as a phone shows it: drawn by a real browser at phone width
      const shot = /^https?:/.test(url) ? await (window as any).lucid?.shot?.({ url, width: 390 }).catch(() => null) : null;
      if (shot?.ok && shot.image) {
        body.innerHTML = `<img class="pp-shot" alt="" draggable="false">`;
        (body.querySelector("img") as HTMLImageElement).src = shot.image;
        if (shot.title) (page.querySelector(".pp-url") as HTMLElement).textContent = host;
      } else if (/^https?:/.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
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

  // The picture is made in the Codex desktop app. The prompt and the finished file are read from the
  // tool call itself, so the frame stays empty exactly as long as the call runs.
  private imageState(it: Item): ImageState {
    const result = imageResult(it, fileUrl);
    return { done: it.status !== "running" && it.status !== "pending" && !it.data.streaming, failed: result.failed, sources: result.sources };
  }

  private refreshImage(update: ImageRefresh) {
    const epoch = this.wm.epoch, thread = this.info?.id;
    const valid = () => epoch === this.wm.epoch && thread === this.info?.id && this.imageRefresh.valid(update);
    void this.codex.refresh(update.id, update.state, valid).then((outcome) => {
      if (!outcome || !valid() || this.pumpEpoch !== -1 || this.queue.length || !this.wm.isFront("codex")) return;
      this.onActivity(outcome === "completed" ? "Image ready" : outcome === "failed" ? "Image generation failed" : "Image preview unavailable");
    }).catch((err) => { if (valid()) console.warn("image result refresh failed", err); });
  }

  private async playImageGen(id: string, first: ImageGen) {
    this.onActivity(first.edit ? "Editing an image in Codex" : "Generating an image in Codex");
    this.stage.setGlow(GLOW.tool);
    let presented = this.imageState(this.get(id));
    this.imageRefresh.begin(id, presented);
    const state = () => (presented = this.imageState(this.get(id)));
    const latest = imageGenOf(this.get(id)) ?? first;
    const outcome = await this.codex.generate({ itemId: id, prompt: latest.prompt || first.prompt, size: latest.size ?? first.size, edit: first.edit, state, instant: this.catchingUp });
    this.onActivity(outcome === "completed" ? (first.edit ? "Edited an image" : "Generated an image")
      : outcome === "failed" ? "Image generation failed"
      : outcome === "pending" ? "Waiting for image generation"
      : "Image preview unavailable");
    const late = this.imageRefresh.release(id, presented);
    if (late) this.refreshImage(late);
  }

  private async play(id: string) {
    const it = this.get(id);
    const tool = it.type === "dynamic_tool" ? String(it.data.toolName || "") : "";
    await this.untilPresent();
    // back from a nap or a game first (a new message does that itself, after its notification)
    if (it.type !== "user_message" && this.idleLife.pending) await this.idleLife.rouse();
    if (this.phoneUp && !/preview_|browser/i.test(tool)) await this.phone(false);
    const d = it.data;
    const root = this.info?.root || null;
    this.chat.activity(it);
    if (it.type !== "user_input_request") this.stage.say(null);

    // Codex's image tool (or the imagegen skill in a command): the Codex app shows the picture being made
    const ig = imageGenOf(it);
    if (ig) { await this.playImageGen(id, ig); return; }

    switch (it.type) {
      case "user_message": {
        // A new message pops up as a notification; the robot notices it, reads it, and
        // looks at any image you attached before getting to work.
        // Asleep, it hears the notification, wakes up, stretches and unlocks first. Busy in
        // another app, it looks up, then clicks the notification or goes to Messages its usual way.
        const dozing = this.idleLife.pending && this.idleLife.asleep;
        const watching = !dozing && this.wm.isFront(this.messageApp);
        this.onActivity(dozing ? "Waking up" : "Reading your message");
        this.stage.setGlow(GLOW.chat);
        const note = this.wm.toast("New message from you", this.messageApp, dozing ? 7 : 2.8);
        if (dozing) await this.idleLife.rouse();
        else {
          this.robot.setPose(watching ? "read" : "notice");
          await this.wm.sleep(700);
          if (this.idleLife.pending) await this.idleLife.rouse();
        }
        this.onActivity("Reading your message");
        let clicked = false;
        if (!this.wm.isFront(this.messageApp) && note.isConnected && Math.random() < (dozing ? 0.65 : 0.4)) {
          this.robot.setPose("mouse");
          await this.wm.pointAt(note, 0.45, 0.5, 420);
          await this.wm.click();
          this.wm.dismissToast(note);
          clicked = true;
        }
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
        await this.messages.user(said, imgs.map((i) => fileUrl(i.path, this.info?.id ?? null)), clicked);
        this.robot.setPose("read");
        await this.wm.sleep(Math.min(3200, 800 + said.length * 12));
        for (const img of imgs.slice(0, 2)) {
          this.onActivity(`Looking at ${img.name}`);
          await this.tool.picture(img.name, fileUrl(img.path, this.info?.id ?? null), () => this.image(img.path));
        }
        return;
      }
      case "reasoning": {
        this.noteFor = new WeakMap();
        this.onActivity("Thinking");
        this.stage.setGlow(GLOW.think);
        this.robot.setPose("think");
        let last = "";
        const start = Date.now();
        const notes = await this.openNotes();
        for (;;) {
          const cur = this.get(id);
          const text = String(cur.data.text || "");
          if (text && text !== last) { last = text; void this.writeNote(notes, text); }
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
        await this.messages.assistant(() => {
          const cur = this.get(id);
          return { text: cur.data.text || "", done: !(cur.status === "running" || cur.data.streaming) };
        }, true);
        await this.wm.sleep(500);
        return;
      }
      case "command_execution": {
        if (await this.playGit(id, d.input || "")) return;
        const pre = classify(d.input || "", "", root || "");
        if (pre.kind === "terminal") {
          this.onActivity("Running a command");
          this.stage.setGlow(GLOW.terminal);
          const h = await this.term.run(pre.command);
          this.robot.setPose("read");
          const done = await this.settle(id);
          await h.finish(done.data.output || "", done.data.exitCode);
          await this.officeFollowUp(done.data.input || d.input || "", done.data.output || "", done.data.exitCode);
          await this.wm.sleep(600);
          return;
        }
        const done = await this.settle(id, 30000);
        const act = classify(done.data.input || "", done.data.output || "", root || "");
        if (act.kind === "list") {
          this.onActivity(`Looking through ${baseName(act.path)}`);
          this.stage.setGlow(GLOW.files);
          await this.files.list(act.path, act.entries, root, { instant: this.catchingUp, problem: act.entries.length ? null : listingProblem(done.data.output || "") });
        } else if (act.kind === "search") {
          this.onActivity(`Searching for “${act.query}”`);
          this.stage.setGlow(GLOW.files);
          await this.files.search(act.query, act.path, act.hits, root, { instant: this.catchingUp });
        } else if (act.kind === "read") {
          this.onActivity(`Reading ${baseName(act.path)}`);
          this.stage.setGlow(GLOW.editor);
          await this.editor.read(act.path, act.lines, act.start);
        } else {
          const h = await this.term.run(act.command);
          await h.finish(done.data.output || "", done.data.exitCode);
          await this.officeFollowUp(done.data.input || "", done.data.output || "", done.data.exitCode);
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
          this.noteChange(name, ch.operation, own);
          if (officeKind(name)) { await this.playOffice(name, ch.operation, { diff: own }); continue; }
          if (own) { await this.editor.diff(name, parseDiff(own)); continue; }
          // The event only carries one file's text; read the others from disk as they are now.
          const text = await this.readText(name);
          if (text == null) { await this.editor.read(name, ["(this file could not be opened)"], 1); continue; }
          if (ch.operation === "add") await this.editor.diff(name, parseDiff(text));
          else await this.editor.read(name, text.split(/\r?\n/).slice(0, 1500), 1);
        }
        const htmlFile = changes.find(ch => /\.html?$/i.test(ch.path) && ch.operation !== 'delete');
        if (htmlFile && root) { this.onActivity('Watching the frontend update'); this.stage.setGlow(GLOW.browser); await this.browser.frontendFile(htmlFile.path, root); }
        return;
      }
      case "web_search": {
        this.stage.setGlow(GLOW.browser);
        const done = await this.settle(id, 20000);
        await this.playWeb(done);
        return;
      }
      case "dynamic_tool": {
        const name: string = d.toolName || "tool";
        if (await this.playTool(id, name)) return;
        const url = d.input?.url || d.input?.href;
        if (typeof url === "string" && /^https?:/.test(url)) {
          this.onActivity(`Visiting ${new URL(url).hostname}`);
          this.stage.setGlow(GLOW.browser);
          // an app on its own machine (a dev server being tested) is drawn as the real page
          await this.browser.visit(url, { real: /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url) });
          return;
        }
        this.onActivity(toolActivity(name));
        this.stage.setGlow(GLOW.tool);
        // The view reads the real item each time, so a call that is still running shows as running
        // and the outcome replaces it when it arrives. Nothing here estimates progress.
        const view = await this.tool.show(name, d.input, () => this.get(id).data.output === undefined ? { status: this.get(id).status } : { status: this.get(id).status, output: this.get(id).data.output }, (attachmentId) => findUpload(this.items.values(), attachmentId));
        // Waiting ends at the timeout or when newer work piles up, whichever comes first. The call may
        // still be running then: the view keeps following the item until a real update settles it.
        this.toolWatch.add(id, view);
        await this.settle(id, 15000);
        this.toolWatch.update(id);
        return;
      }
      case "user_input_request": {
        const q = (d.questions || []).map((x: any) => x.question).join("\n") || "I have a question for you.";
        this.onActivity("Waiting for your answer");
        this.stage.setGlow(GLOW.chat);
        this.robot.setPose("ask");
        this.stage.say(q, "speak");
        await this.messages.note(q, "ask");
        const done = await this.settle(id, 30 * 60 * 1000);
        const answer = done.data.questionAnswer?.answers ? Object.values(done.data.questionAnswer.answers).join("\n") : "";
        this.stage.say(null);
        this.robot.setPose("rest");
        if (answer) await this.messages.user(String(answer));
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
      case "lucid_queue": {
        this.onActivity("Writing down your queued messages");
        this.stage.setGlow(GLOW.tasks);
        await this.tasks.syncQueue(d.list || [], { instant: this.catchingUp || d.instant, title: this.info?.title });
        return;
      }
      case "compaction": {
        this.onActivity(it.status === "failed" ? "Context compaction failed" : it.status === "running" || it.status === "pending" ? "Compacting context" : "Context compacted");
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
        await this.messages.note(d.message || d.text || "The run hit an error.", "error");
        return;
      }
      default:
        return;
    }
  }
}
