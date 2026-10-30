// Harness app: the robot's own copy of Claude Code, Codex or another agent console.
// When the robot's agent delegates work to a subagent, the robot opens this app,
// types the prompt into a session tab, and the session streams the subagent's work.
import gsap from "gsap";
import type { AppId } from "../os/wm";
import type { Robot } from "../robot";
import claudeLogo from "../assets/claude.svg";
import openaiLogo from "../assets/openai.svg";
import "./harness.css";

export const HARNESS_APP_ID = "harness" as const;

/** Dock and title bar icon: a tabbed window with a small robot face. Filled shapes only. */
export const HARNESS_ICON = `<svg class="ico" viewBox="0 0 24 24"><rect x="12.4" y="3.2" width="9" height="5.4" rx="2" fill="#d6951c"/><rect x="2" y="3" width="11" height="6" rx="2.2" fill="#ffc94d"/><rect x="2" y="6.4" width="20" height="14.6" rx="3.6" fill="#ffc94d"/><circle cx="8.6" cy="12.6" r="1.7" fill="#4a3304"/><circle cx="15.4" cy="12.6" r="1.7" fill="#4a3304"/><rect x="9.4" y="16" width="5.2" height="1.8" rx=".9" fill="#4a3304"/></svg>`;

export type HarnessKind = "claude" | "codex" | "generic";

/** Anything mentioning Claude is Claude Code, Codex or OpenAI is Codex, everything else is the generic console. */
export function harnessKind(providerOrTool: string): HarnessKind {
  const p = (providerOrTool || "").toLowerCase();
  if (p.includes("claude")) return "claude";
  if (p.includes("codex") || p.includes("openai")) return "codex";
  return "generic";
}

export interface SubagentEvent {
  kind: "read" | "edit" | "run" | "search" | "web" | "think" | "say" | "tool" | "error";
  /** Main text: a path, command, query, tool name, thought or message. */
  text: string;
  /** Optional result line shown under it in muted text, e.g. "Read 285 lines" or "exit 0". */
  detail?: string;
}

export interface HarnessSession {
  readonly id: string;
  /** Append a live activity line (animated in). */
  push(ev: SubagentEvent): void;
  /** Replace or extend the subagent's current streaming message. */
  stream(text: string): void;
  /** Final state with a short result. */
  finish(summary?: string, ok?: boolean): void;
}

export interface HarnessStartOptions {
  id: string;
  kind: HarnessKind;
  title: string;
  prompt: string;
  model?: string;
  /** Provider name shown by the generic console (OpenCode, Grok, ...). Optional subtitle for the others. */
  label?: string;
}

/** The part of the window manager the harness app uses. The real `WM` satisfies it. */
export interface HarnessHost {
  epoch: number;
  speed: number;
  robot: Pick<Robot, "pressKey" | "setTyping" | "setPose">;
  open(id: AppId, title?: string): Promise<{ el: HTMLElement; body: HTMLElement; title: HTMLElement }>;
  pointAt(el: Element, ax?: number, ay?: number, ms?: number): Promise<void>;
  click(double?: boolean): Promise<void>;
  sleep(ms: number, epoch?: number): Promise<void>;
  check(epoch: number): void;
}

// ---------------------------------------------------------------------------
type EvKind = SubagentEvent["kind"];
type State = "idle" | "running" | "done" | "error";

const LABELS: Record<HarnessKind, Record<EvKind, string>> = {
  claude: { read: "Read", edit: "Update", run: "Bash", search: "Search", web: "Fetch", think: "Thinking", say: "", tool: "", error: "Error" },
  codex: { read: "read", edit: "apply patch", run: "exec", search: "search", web: "web search", think: "thinking", say: "", tool: "tool", error: "error" },
  generic: { read: "read", edit: "edit", run: "run", search: "search", web: "web", think: "think", say: "", tool: "tool", error: "error" },
};
// Claude Code's spinner glyphs, played forward and back.
const SPIN = ["·", "✢", "✳", "✶", "✻", "✽", "✽", "✻", "✶", "✳", "✢", "·"];
const CLAUDE_VERBS = ["Working", "Pondering", "Thinking", "Brewing", "Noodling", "Cogitating", "Musing", "Percolating"];
const MAX_LINES = 140;
const MAX_TABS = 6;

function brandName(kind: HarnessKind, label?: string) {
  return kind === "claude" ? "Claude Code" : kind === "codex" ? "Codex" : (label || "Agent");
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function shortPath(p: string) {
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (p.length <= 46 || parts.length <= 3) return p;
  return "…/" + parts.slice(-3).join("/");
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
class Session implements HarnessSession {
  readonly id: string;
  readonly kind: HarnessKind;
  title: string;
  label?: string;
  model?: string;

  view: HTMLElement;
  scroller: HTMLElement;
  log: HTMLElement;
  status: HTMLElement;
  input: HTMLElement;
  field: HTMLElement;
  typed: HTMLElement;
  tab: HTMLElement;
  private spinEl: HTMLElement | null = null;
  private verbEl: HTMLElement;
  private elEl: HTMLElement;

  state: State = "idle";
  ready = false;
  private queue: (() => void)[] = [];
  startedAt = 0;
  endedAt = 0;
  steps = 0;
  private lastElapsed = "";
  private spinFrame = -1;
  private pending: { line: HTMLElement; timer: number } | null = null;
  streamLine: { line: HTMLElement; msg: HTMLElement; inner: HTMLElement; target: string; shown: number } | null = null;

  // scrolling: stick to the bottom unless the reader scrolled up
  stick = true;
  followUntil = 0;
  lastAutoTop = -1;

  constructor(private app: HarnessApp, o: HarnessStartOptions) {
    this.id = o.id;
    this.kind = o.kind;
    this.title = o.title;
    this.label = o.label;
    this.model = o.model;

    this.view = el("div", `hx-view hx-k-${o.kind}`);
    this.view.dataset.id = o.id;
    this.scroller = el("div", "hx-scroll");
    this.log = el("div", "hx-log");
    this.scroller.append(this.header(), this.log);

    this.status = el("div", "hx-status off");
    if (o.kind === "claude") {
      this.spinEl = el("span", "hx-spin", SPIN[0]);
      this.status.append(this.spinEl);
    } else if (o.kind === "codex") {
      this.status.append(el("i", "hx-cb"));
    } else {
      const dots = el("span", "hx-dots");
      dots.append(el("i"), el("i"), el("i"));
      this.status.append(dots);
    }
    this.verbEl = el("span", "hx-verb hx-shim", o.kind === "claude" ? CLAUDE_VERBS[Math.floor(Math.random() * CLAUDE_VERBS.length)] + "…" : "Working");
    this.elEl = el("span", "hx-el");
    this.status.append(this.verbEl, this.elEl);

    this.input = el("div", "hx-input");
    this.field = el("div", "hx-field");
    const fieldIn = el("div", "hx-field-in");
    this.typed = el("span", "hx-typed");
    fieldIn.append(this.typed, el("span", "hx-caret"));
    this.field.append(fieldIn);
    this.input.append(el("span", "hx-chev", o.kind === "codex" ? "›" : ">"), this.field);

    this.view.append(this.scroller, this.status, this.input);

    this.tab = el("div", "hx-tab");
    this.tab.dataset.kind = o.kind;
    this.tab.setAttribute("role", "tab");
    this.tab.dataset.id = o.id;
    this.tab.append(el("i", "hx-dot"), el("span", "hx-tab-t"));
    this.setTitle(o.title);

    const userScroll = () => { this.followUntil = 0; };
    for (const ev of ["wheel", "touchstart", "pointerdown", "keydown"]) this.scroller.addEventListener(ev, userScroll, { passive: true });
    this.scroller.addEventListener("scroll", () => {
      if (Math.abs(this.scroller.scrollTop - this.lastAutoTop) > 1) {
        const s = this.scroller;
        this.stick = s.scrollHeight - s.clientHeight - s.scrollTop < 18;
      }
    }, { passive: true });
  }

  setTitle(t: string) {
    this.title = t;
    (this.tab.querySelector(".hx-tab-t") as HTMLElement).textContent = t;
    this.tab.title = t;
  }

  private header() {
    const h = el("div", "hx-head");
    const k = this.kind;
    if (k !== "generic") {
      const img = el("img", "hx-logo");
      img.src = k === "claude" ? claudeLogo : openaiLogo;
      img.alt = "";
      h.append(img);
    }
    const txt = el("div", "hx-head-t");
    const name = el("div", "hx-name");
    name.append(el("b", "", brandName(k, this.label)));
    if (k === "claude" && this.label) name.append(el("span", "hx-sub", this.label));
    if (k === "codex" && this.label) name.append(el("span", "hx-sub", this.label));
    txt.append(name);
    const rows: [string, string][] = [];
    if (this.model) rows.push(["model", this.model]);
    rows.push(["task", this.title]);
    if (k === "codex" || k === "generic") {
      const grid = el("div", "hx-kv");
      for (const [a, b] of rows) { grid.append(el("span", "hx-k", a), el("span", "hx-v", b)); }
      txt.append(grid);
    } else {
      for (const [, b] of rows) txt.append(el("div", "hx-v", b));
    }
    h.append(txt);
    return h;
  }

  // --- visibility ------------------------------------------------------------
  get live() { return this.view.isConnected && this.app.activeSession === this && !reduced(); }

  follow(ms = 650) {
    if (!this.stick) return;
    this.followUntil = performance.now() + ms;
    this.app.wake();
  }

  snapBottom() {
    const s = this.scroller;
    s.scrollTop = s.scrollHeight;
    this.lastAutoTop = s.scrollTop;
  }

  /** Called from the app ticker. Returns true while it still has work to do. */
  tick(now: number): boolean {
    let busy = false;
    // streaming text reveal
    const st = this.streamLine;
    if (st && st.shown < st.target.length) {
      const remaining = st.target.length - st.shown;
      const step = Math.max(1, Math.round(remaining / 18));
      st.shown = Math.min(st.target.length, st.shown + step);
      st.inner.textContent = st.target.slice(0, st.shown);
      st.msg.classList.toggle("hx-over", st.inner.offsetHeight > st.msg.clientHeight + 1);
      this.follow(300);
      busy = true;
    }
    // follow the bottom smoothly
    if (now < this.followUntil && this.stick) {
      const s = this.scroller;
      const target = s.scrollHeight - s.clientHeight;
      if (!this.live) s.scrollTop = target;
      else {
        const d = target - s.scrollTop;
        s.scrollTop = Math.abs(d) < 0.8 ? target : s.scrollTop + d * 0.24;
      }
      this.lastAutoTop = s.scrollTop;
      busy = true;
    }
    // working status
    if (this.state === "running") {
      const e = fmtElapsed(now - this.startedAt);
      if (e !== this.lastElapsed) {
        this.lastElapsed = e;
        this.elEl.textContent = this.kind === "generic" ? e : `(${e})`;
      }
      if (this.spinEl) {
        const f = Math.floor(now / 110) % SPIN.length;
        if (f !== this.spinFrame) { this.spinFrame = f; this.spinEl.textContent = SPIN[f]; }
      }
      busy = true;
    }
    return busy;
  }

  // --- lines -------------------------------------------------------------------
  private addLine(line: HTMLElement, opts: { wipe?: boolean } = {}) {
    this.log.append(line);
    const lines = this.log.children;
    if (lines.length > MAX_LINES) {
      const s = this.scroller;
      const drop = lines[0] as HTMLElement;
      const h = drop.offsetHeight;
      drop.remove();
      if (!this.stick) { s.scrollTop -= h; this.lastAutoTop = s.scrollTop; }
    }
    if (this.live) {
      line.classList.add("hx-in");
      const tl = gsap.timeline({ onComplete: () => { line.classList.remove("hx-in"); gsap.set(line, { clearProps: "height,opacity" }); } });
      tl.from(line, { height: 0, opacity: 0, duration: 0.3, ease: "power2.out" });
      const b = line.querySelector(".hx-b");
      if (b) tl.from(b, { scale: 0, duration: 0.35, ease: "back.out(2.6)" }, 0.06);
      const row = line.querySelector(".hx-row, .hx-you");
      if (row && opts.wipe !== false) tl.fromTo(row, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.42, ease: "power2.out", clearProps: "clipPath" }, 0.04);
    }
    this.follow();
  }

  private revealDetail(line: HTMLElement) {
    const d = line.querySelector(".hx-d") as HTMLElement | null;
    const b = line.querySelector(".hx-b");
    b?.classList.remove("pending");
    if (!d) return;
    d.hidden = false;
    if (this.live) {
      gsap.fromTo(d, { height: 0, opacity: 0, x: -6 }, { height: "auto", opacity: 1, x: 0, duration: 0.3, ease: "power2.out", clearProps: "height,transform" });
    }
    this.follow();
  }

  private settlePending() {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.revealDetail(this.pending.line);
    this.pending = null;
  }

  private commitStream() {
    const st = this.streamLine;
    if (!st) return;
    st.shown = st.target.length;
    st.inner.textContent = st.target;
    st.msg.classList.toggle("hx-over", st.inner.offsetHeight > st.msg.clientHeight + 1);
    st.line.classList.remove("hx-streaming");
    this.streamLine = null;
  }

  private buildEvent(ev: SubagentEvent): HTMLElement {
    const k = this.kind;
    const line = el("div", `hx-line hx-ev-${ev.kind}`);
    const label = LABELS[k][ev.kind];
    if (ev.kind === "say") {
      const row = el("div", "hx-row hx-wrap");
      row.append(el("i", "hx-b"), el("div", "hx-msg hx-clamp", ev.text));
      line.append(row);
      return line;
    }
    const row = el("div", "hx-row");
    if (ev.kind === "think" && k === "claude") row.append(el("i", "hx-glyph", "∴"));
    else row.append(el("i", "hx-b"));
    const text = ev.kind === "read" || ev.kind === "edit" ? shortPath(ev.text) : ev.text;
    if (k === "claude" && ev.kind === "tool") {
      row.append(el("b", "hx-l", ev.text));
    } else if (k === "claude" && (ev.kind === "think" || ev.kind === "error")) {
      row.append(el("b", "hx-l", label), el("span", "hx-t hx-plain", text));
    } else if (k === "claude") {
      row.append(el("b", "hx-l", label), el("span", "hx-t", text), el("span", "hx-p", ")"));
    } else {
      row.append(el("b", "hx-l", label), el("span", "hx-t", text));
    }
    row.title = ev.text;
    line.append(row);
    if (ev.detail) {
      const d = el("div", "hx-d");
      d.append(el("i", "hx-e"), el("span", "hx-dt", ev.detail));
      d.title = ev.detail;
      line.append(d);
    }
    return line;
  }

  // --- public session API --------------------------------------------------------
  push(ev: SubagentEvent): void {
    if (!this.ready) { this.queue.push(() => this.push(ev)); return; }
    if (this.state === "done" || this.state === "error") return;
    this.commitStream();
    this.settlePending();
    if (ev.kind !== "say" && ev.kind !== "think") this.steps++;
    if (ev.kind === "think" && this.kind !== "claude") this.setVerb(ev.text);
    const line = this.buildEvent(ev);
    const toolish = ev.kind !== "say" && ev.kind !== "think" && ev.kind !== "error";
    const d = line.querySelector(".hx-d") as HTMLElement | null;
    if (toolish && this.live) {
      // a tool call shows as pending for a moment, then its result appears
      line.querySelector(".hx-b")?.classList.add("pending");
      if (d) d.hidden = true;
      this.addLine(line);
      this.pending = { line, timer: window.setTimeout(() => this.settlePending(), 380 + Math.random() * 420) };
    } else {
      this.addLine(line);
    }
  }

  stream(text: string): void {
    if (!this.ready) { this.queue.push(() => this.stream(text)); return; }
    if (this.state === "done" || this.state === "error") return;
    const st = this.streamLine;
    if (st) {
      let common = 0;
      const max = Math.min(st.target.length, text.length, st.shown);
      while (common < max && st.target.charCodeAt(common) === text.charCodeAt(common)) common++;
      st.target = text;
      if (common < st.shown) { st.shown = common; st.inner.textContent = text.slice(0, common); }
      this.app.wake();
      return;
    }
    this.settlePending();
    const line = el("div", "hx-line hx-ev-say hx-streaming");
    const row = el("div", "hx-row hx-wrap");
    const msg = el("div", "hx-msg hx-tail");
    const inner = el("div", "hx-msg-in");
    msg.append(inner);
    row.append(el("i", "hx-b"), msg);
    line.append(row);
    this.streamLine = { line, msg, inner, target: text, shown: 0 };
    if (!this.live) { this.streamLine.shown = text.length; inner.textContent = text; }
    this.addLine(line, { wipe: false });
    this.app.wake();
  }

  finish(summary?: string, ok = true): void {
    if (!this.ready) { this.queue.push(() => this.finish(summary, ok)); return; }
    if (this.state !== "running") return;
    this.commitStream();
    this.settlePending();
    this.state = ok ? "done" : "error";
    this.endedAt = performance.now();
    const took = fmtElapsed(this.endedAt - this.startedAt);
    this.setStatus(false);
    this.updateDot();

    const k = this.kind;
    const line = el("div", `hx-line hx-result ${ok ? "hx-ok" : "hx-fail"}`);
    const steps = `${this.steps} ${k === "claude" ? "tool use" : "step"}${this.steps === 1 ? "" : "s"}`;
    if (k === "codex") {
      const rule = el("div", "hx-rule");
      rule.append(el("i"), el("span", "", ok ? `Worked for ${took}` : `Stopped after ${took}`), el("i"));
      line.append(rule);
      if (summary) {
        const row = el("div", "hx-row hx-wrap");
        row.append(el("i", "hx-b"), el("div", "hx-msg hx-clamp", summary));
        line.append(row);
      }
    } else {
      const row = el("div", "hx-row hx-wrap");
      row.append(el("i", "hx-b"), el("div", "hx-msg hx-clamp", summary || (ok ? "Done" : "Failed")));
      line.append(row);
      const d = el("div", "hx-d");
      const info = k === "claude" ? `${ok ? "Done" : "Failed"} (${steps} · ${took})` : `${ok ? "Finished" : "Failed"} in ${took} · ${steps}`;
      d.append(el("i", "hx-e"), el("span", "hx-dt", info));
      line.append(d);
    }
    this.addLine(line);
    this.app.sessionChanged();
  }

  // --- internals used by the app ---------------------------------------------------
  private setVerb(t: string) {
    const v = t.replace(/\s+/g, " ").trim();
    if (v) this.verbEl.textContent = v.length > 48 ? v.slice(0, 46).trimEnd() + "…" : v;
  }

  setStatus(on: boolean) {
    const s = this.status;
    if (on === !s.classList.contains("off")) return;
    s.classList.toggle("off", !on);
    if (this.live) {
      if (on) gsap.fromTo(s, { height: 0, opacity: 0 }, { height: 22, opacity: 1, duration: 0.3, ease: "power2.out", clearProps: "height,opacity" });
      else gsap.fromTo(s, { height: 22, opacity: 1 }, { height: 0, opacity: 0, duration: 0.3, ease: "power2.inOut", clearProps: "height,opacity" });
    }
  }

  updateDot() {
    this.tab.classList.toggle("running", this.state === "running");
    this.tab.classList.toggle("done", this.state === "done");
    this.tab.classList.toggle("error", this.state === "error");
  }

  /** The prompt was sent: show it in the transcript and start working. */
  submit(prompt: string, animate: boolean) {
    const fieldIn = this.field.firstElementChild as HTMLElement;
    const clear = () => { this.typed.textContent = ""; gsap.set(fieldIn, { clearProps: "transform,opacity" }); };
    this.input.classList.remove("focus");
    if (animate && this.live) gsap.to(fieldIn, { y: -10, opacity: 0, duration: 0.18, ease: "power2.in", onComplete: clear });
    else clear();

    const you = el("div", "hx-line hx-prompt");
    const row = el("div", "hx-you");
    row.append(el("span", "hx-chev", this.kind === "codex" ? "›" : ">"), el("div", "hx-msg hx-clamp", prompt));
    you.append(row);
    if (this.log.children.length) you.classList.add("hx-gap");
    this.addLine(you);

    this.state = "running";
    this.startedAt = performance.now();
    this.endedAt = 0;
    this.steps = 0;
    this.lastElapsed = "";
    this.elEl.textContent = this.kind === "generic" ? "0s" : "(0s)";
    this.setStatus(true);
    this.updateDot();
    this.ready = true;
    this.stick = true;
    this.follow();
    const q = this.queue;
    this.queue = [];
    for (const fn of q) fn();
    this.app.sessionChanged();
    this.app.wake();
  }

  /** A new turn on an existing session (follow-up prompt). */
  reopen() {
    this.ready = false;
    if (this.state !== "running") this.state = "idle";
  }
}

// ---------------------------------------------------------------------------
export class HarnessApp {
  readonly root: HTMLElement;
  private tabs: HTMLElement;
  private newBtn: HTMLElement;
  private views: HTMLElement;
  private sessions = new Map<string, Session>();
  private active: Session | null = null;
  private win: { el: HTMLElement; body: HTMLElement; title: HTMLElement } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private ticking = false;
  private resize: ResizeObserver;

  constructor(private wm: HarnessHost) {
    this.root = el("div", "hx hx-k-generic hx-empty");
    this.tabs = el("div", "hx-tabs");
    this.tabs.setAttribute("role", "tablist");
    this.newBtn = el("div", "hx-new");
    this.newBtn.setAttribute("aria-label", "New session");
    this.newBtn.title = "New session";
    this.newBtn.append(el("i"));
    this.tabs.append(this.newBtn);
    this.views = el("div", "hx-views");
    this.root.append(this.tabs, this.views);
    this.resize = new ResizeObserver(() => this.root.classList.toggle("hx-narrow", this.root.clientWidth > 0 && this.root.clientWidth < 440));
    this.resize.observe(this.root);
  }

  get activeSession() { return this.active; }

  session(id: string): HarnessSession | null {
    return this.sessions.get(id) ?? null;
  }

  /** Robot opens the app, picks or creates a session tab, types the prompt key by key and presses Enter. */
  start(opts: HarnessStartOptions): Promise<HarnessSession> {
    return this.serial(async () => {
      const wm = this.wm;
      const e = wm.epoch;
      let s = this.sessions.get(opts.id);
      await this.ensureWindow(s?.kind ?? opts.kind, s?.label ?? opts.label);
      wm.check(e);
      if (!s) {
        if (this.sessions.size > 0) {
          await wm.pointAt(this.newBtn, 0.5, 0.5, 360);
          await wm.click();
        }
        s = new Session(this, opts);
        this.sessions.set(opts.id, s);
        this.tabs.insertBefore(s.tab, this.newBtn);
        this.views.append(s.view);
        if (this.root.isConnected && !reduced()) gsap.from(s.tab, { width: 0, minWidth: 0, opacity: 0, duration: 0.32, ease: "power2.out", clearProps: "width,minWidth,opacity" });
        this.activate(s, true);
        this.trimTabs();
        await wm.sleep(320, e);
      } else {
        if (opts.title && opts.title !== s.title) s.setTitle(opts.title);
        if (this.active !== s) await this.clickTab(s);
        s.reopen();
      }

      await wm.pointAt(s.input, 0.3, 0.5, 320);
      await wm.click();
      s.input.classList.add("focus");
      let sent = false;
      try {
        await this.typeInto(s.typed, opts.prompt, e);
        await wm.sleep(150, e);
        wm.robot.pressKey("Enter");
        s.submit(opts.prompt, true);
        sent = true;
        await wm.sleep(260, e);
      } finally {
        // Even when the scene is cancelled, the session still gets its prompt so later events land.
        if (!sent) s.submit(opts.prompt, false);
      }
      return s as HarnessSession;
    });
  }

  /** The robot glances at a session: focus the window and tab, move the cursor over the latest lines, small read pause. */
  checkOn(id: string): Promise<void> {
    return this.serial(async () => {
      const s = this.sessions.get(id);
      if (!s) return;
      const wm = this.wm;
      const e = wm.epoch;
      await this.ensureWindow(s.kind, s.label);
      if (this.active !== s) await this.clickTab(s);
      s.stick = true;
      s.snapBottom();
      s.follow(400);
      await wm.sleep(160, e);
      wm.robot.setPose("read");
      const lines = Array.from(s.log.children).slice(-3) as HTMLElement[];
      const view = s.scroller.getBoundingClientRect();
      for (const l of lines) {
        const r = l.getBoundingClientRect();
        if (r.bottom < view.top || r.height === 0) continue;
        await wm.pointAt(l, 0.28 + Math.random() * 0.2, Math.min(0.5, 8 / Math.max(1, l.offsetHeight)), 300);
        wm.robot.setPose("read");
        await wm.sleep(260 + Math.random() * 260, e);
      }
      if (s.state === "running") {
        await wm.pointAt(s.status, 0.3, 0.5, 280);
        wm.robot.setPose("read");
        await wm.sleep(520 + Math.random() * 400, e);
      } else {
        await wm.sleep(420, e);
      }
    });
  }

  /** Forget all sessions (for example when the robot switches to another thread). */
  reset() {
    for (const s of this.sessions.values()) { s.view.remove(); s.tab.remove(); }
    this.sessions.clear();
    this.active = null;
    this.chain = Promise.resolve();
    this.root.classList.add("hx-empty");
  }

  // --- internals ----------------------------------------------------------------------
  /** @internal */
  wake() {
    if (this.ticking) return;
    this.ticking = true;
    gsap.ticker.add(this.tick);
  }

  /** @internal */
  sessionChanged() {
    this.trimTabs();
  }

  private tick = () => {
    const now = performance.now();
    let busy = false;
    for (const s of this.sessions.values()) if (s.tick(now)) busy = true;
    if (!busy) { gsap.ticker.remove(this.tick); this.ticking = false; }
  };

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async ensureWindow(kind: HarnessKind, label?: string) {
    const title = this.active ? brandName(this.active.kind, this.active.label) : brandName(kind, label);
    const w = await this.wm.open(HARNESS_APP_ID as unknown as AppId, title);
    this.win = w;
    if (this.root.parentElement !== w.body) {
      w.body.replaceChildren(this.root);
      for (const s of this.sessions.values()) if (s.stick) s.snapBottom();
    }
    return w;
  }

  private async clickTab(s: Session) {
    const e = this.wm.epoch;
    await this.wm.pointAt(s.tab, 0.45, 0.55, 340);
    await this.wm.click();
    this.activate(s, true);
    await this.wm.sleep(240, e);
  }

  private activate(s: Session, animate: boolean) {
    const prev = this.active;
    this.active = s;
    this.root.classList.remove("hx-k-claude", "hx-k-codex", "hx-k-generic", "hx-empty");
    this.root.classList.add(`hx-k-${s.kind}`);
    for (const o of this.sessions.values()) {
      o.tab.classList.toggle("on", o === s);
      o.tab.setAttribute("aria-selected", String(o === s));
    }
    if (this.win) this.win.title.textContent = brandName(s.kind, s.label);
    if (s.stick) s.snapBottom();
    if (prev === s) return;
    const anim = animate && this.root.isConnected && !reduced();
    if (prev) {
      if (anim) gsap.to(prev.view, { autoAlpha: 0, x: -10, duration: 0.2, ease: "power2.in", onComplete: () => gsap.set(prev.view, { x: 0 }) });
      else gsap.set(prev.view, { autoAlpha: 0, x: 0 });
    }
    gsap.killTweensOf(s.view);
    if (anim) gsap.fromTo(s.view, { autoAlpha: 0, x: 12 }, { autoAlpha: 1, x: 0, duration: 0.3, ease: "power2.out", delay: prev ? 0.08 : 0 });
    else gsap.set(s.view, { autoAlpha: 1, x: 0 });
    this.wake();
  }

  // Keep at most MAX_TABS tabs: the oldest finished session closes.
  private trimTabs() {
    if (this.sessions.size <= MAX_TABS) return;
    for (const s of this.sessions.values()) {
      if (this.sessions.size <= MAX_TABS) break;
      if (s === this.active || s.state === "running" || !s.ready) continue;
      this.sessions.delete(s.id);
      const tab = s.tab;
      if (this.root.isConnected && !reduced()) {
        gsap.to(tab, { width: 0, minWidth: 0, paddingLeft: 0, paddingRight: 0, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => tab.remove() });
      } else tab.remove();
      s.view.remove();
    }
  }

  private async typeInto(target: HTMLElement, text: string, e: number) {
    const wm = this.wm;
    const budget = Math.min(3400, Math.max(900, text.length * 32));
    const cps = Math.max(38, text.length / (budget / 1000));
    wm.robot.setTyping(true);
    let shown = 0;
    const start = performance.now();
    try {
      while (shown < text.length) {
        await new Promise((r) => requestAnimationFrame(r));
        wm.check(e);
        const elapsed = (performance.now() - start) * wm.speed;
        const jitter = 0.85 + Math.random() * 0.3;
        const next = Math.min(text.length, Math.max(shown + 1, Math.floor((elapsed / 1000) * cps * jitter)));
        if (next !== shown) {
          for (let i = shown; i < next; i++) wm.robot.pressKey(text[i] === "\n" ? "Enter" : text[i]);
          shown = next;
          target.textContent = text.slice(0, shown);
        }
      }
    } finally {
      wm.robot.setTyping(false);
    }
  }
}
