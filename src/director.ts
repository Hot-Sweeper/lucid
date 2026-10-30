import { WM, Cancelled } from "./os/wm";
import { IdleLife } from "./os/idle";
import { FilesApp, EditorApp, TerminalApp, BrowserApp, ChatApp, ToolApp, prettyTool } from "./os/apps";
import { classify, parseDiff, baseName, type Entry } from "./os/classify";
import type { SeatedRobot as Robot } from "./office/rig";
import type { DeskStage as Stage } from "./office/desk";

export type Item = { id: string; runId: string | null; ordinal: number; type: string; status: string; updatedAt: string; data: any };
export type ThreadInfo = { id: string; title: string; provider: string; projectTitle?: string; root?: string; run?: { id: string; status: string } | null; error?: string };

const GLOW: Record<string, string> = {
  editor: "#6f7dff", terminal: "#4ff0a0", browser: "#4fd2ff", chat: "#ff7aa8", files: "#ffbf5a", tool: "#b07cff", think: "#9d8cff", idle: "#4fb6ff",
};

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
  private browser: BrowserApp; private chat: ChatApp; private tool: ToolApp;
  onActivity: (text: string) => void = () => {};
  private idleLife: IdleLife;
  private lastEventAt = 0;

  constructor(private wm: WM, private robot: Robot, private stage: Stage, peek: (url: string) => Promise<any>, private image: (path: string) => Promise<string | null>, private readText: (path: string) => Promise<string | null>) {
    this.files = new FilesApp(wm);
    this.editor = new EditorApp(wm);
    this.term = new TerminalApp(wm);
    this.browser = new BrowserApp(wm, peek);
    this.chat = new ChatApp(wm);
    this.tool = new ToolApp(wm);
    this.idleLife = new IdleLife(wm, robot, stage);
    this.idleLife.onActivity = (t) => this.onActivity(t);
  }

  reset() {
    this.idleLife.stop();
    this.lastEventAt = 0;
    this.wm.reset();
    this.items.clear();
    this.queue = [];
    this.played.clear();
    this.info = null;
    this.lastRunStatus = "";
    this.stage.say(null);
    this.stage.setPlan([]);
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
      if (it.type === "todo_list") { this.stage.setPlan(it.data.steps || []); this.played.add(it.id); continue; }
      this.queue.push(it.id);
    }
    // Plans update in place while the run goes on.
    for (const it of items) if (it.type === "todo_list" && this.played.has(it.id)) this.stage.setPlan(it.data.steps || []);
    this.queue.sort((a, b) => this.items.get(a)!.ordinal - this.items.get(b)!.ordinal);
    if (initial) this.catchingUp = this.queue.length > 0;
    if (this.queue.length && this.idleLife.isActive) this.idleLife.stop();
    this.pump();
  }

  private get(id: string) { return this.items.get(id)!; }

  private async pump() {
    if (this.pumpEpoch === this.wm.epoch) return;
    const epoch = (this.pumpEpoch = this.wm.epoch);
    try {
      while (this.queue.length) {
        const backlog = this.queue.length - 1;
        this.wm.speed = Math.min(4.5, (this.catchingUp ? 2.2 : 1) + backlog * 0.45);
        const id = this.queue.shift()!;
        this.played.add(id);
        try {
          await this.play(id);
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
    const running = this.info?.run?.status === "running";
    this.stage.setGlow(GLOW.idle);
    if (running) {
      this.robot.setPose("think");
      this.onActivity("Working");
      return;
    }
    this.robot.setPose("rest");
    // A thread that finished a while ago goes straight to the lock screen.
    const stale = this.lastEventAt > 0 && Date.now() - this.lastEventAt > 10 * 60 * 1000 && !new URLSearchParams(location.search).has("idleScale");
    this.idleLife.begin({ locked: stale });
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
        const src = await this.image(done.data.viewedImagePath || p);
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
      this.stage.setPlan(todos.map((t: any) => ({ text: t.content || t.activeForm || "", status: t.status === "in_progress" ? "running" : t.status })));
      await this.wm.sleep(400);
      return true;
    }
    if (base === "Agent" || base === "Task") {
      this.wm.toast(`Handed off: ${this.get(id).data.input?.description || "a subtask"}`, "tool");
      await this.wm.sleep(900);
      return true;
    }
    const browserActs: Record<string, string> = {
      preview_click: "Clicking on the page", preview_evaluate: "Running a script on the page", preview_snapshot: "Reading the page",
      preview_resize: "Resizing the page", preview_open: "Opening a tab", preview_act: "Using the page", preview_wait_for: "Waiting for the page",
      preview_status: "Checking the page", preview_dialog: "Answering a page dialog",
    };
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

  private async play(id: string) {
    const it = this.get(id);
    const d = it.data;
    const root = this.info?.root || null;
    if (it.type !== "reasoning" && it.type !== "user_input_request") this.stage.say(null);

    switch (it.type) {
      case "user_message": {
        this.onActivity("Reading your message");
        this.stage.setGlow(GLOW.chat);
        this.wm.toast("New message from you");
        await this.chat.user(d.text || "");
        return;
      }
      case "reasoning": {
        this.onActivity("Thinking");
        this.stage.setGlow(GLOW.think);
        this.robot.setPose("think");
        const summary = (t: string) => {
          const clean = (t || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
          return clean.length > 170 ? clean.slice(0, 168).replace(/\s+\S*$/, "") + " …" : clean;
        };
        let last = "";
        const start = Date.now();
        for (;;) {
          const cur = this.get(id);
          const s = summary(cur.data.text || "");
          if (s && s !== last) { this.stage.say(s, "think"); last = s; }
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
        this.wm.toast(`Handed off: ${d.title || "a subtask"}`, "tool");
        await this.wm.sleep(900);
        return;
      }
      case "compaction": {
        this.onActivity("Tidying up its notes");
        this.robot.setPose("think");
        await this.wm.sleep(1200);
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
