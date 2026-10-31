// Harness app: the robot's own copy of Claude Code, Codex, Gemini CLI, OpenCode and friends.
// When the robot's agent hands work to a helper agent, the robot opens this app, types the
// brief into a session tab, and the tab streams the helper's real activity.
// Each harness comes in a terminal (CLI/TUI) flavour and, where one exists, a desktop app
// flavour. The robot's habit (prefs.subagents) picks which one it drives.
import gsap from "gsap";
import type { AppId } from "../os/wm";
import type { Robot } from "../robot";
import { ICONS } from "../os/icons";
import { THEMES, markEl, prettyModel, effortWord, normEffort, modelVendor, type HarnessKind, type Flavor, type Theme } from "./themes";
import "./harness.css";

export { harnessKind, resolveFlavor, prettyModel, normEffort, THEMES, type HarnessKind, type Flavor } from "./themes";
import { resolveFlavor } from "./themes";

export const HARNESS_APP_ID = "harness" as const;

/** Dock and title bar icon: a tabbed window with a small robot face. Filled shapes only. */
export const HARNESS_ICON = `<svg class="ico" viewBox="0 0 24 24"><rect x="12.4" y="3.2" width="9" height="5.4" rx="2" fill="#d6951c"/><rect x="2" y="3" width="11" height="6" rx="2.2" fill="#ffc94d"/><rect x="2" y="6.4" width="20" height="14.6" rx="3.6" fill="#ffc94d"/><circle cx="8.6" cy="12.6" r="1.7" fill="#4a3304"/><circle cx="15.4" cy="12.6" r="1.7" fill="#4a3304"/><rect x="9.4" y="16" width="5.2" height="1.8" rx=".9" fill="#4a3304"/></svg>`;

export interface SubagentEvent {
  kind: "read" | "edit" | "run" | "search" | "web" | "think" | "say" | "tool" | "error";
  /** Main text: a path, command, query, tool name, thought or message. */
  text: string;
  /** Optional result line shown under it in muted text, e.g. "Read 285 lines" or "exit 0". */
  detail?: string;
}

/** What kind of helper it is: shown in the harness the way that harness shows it. */
export interface HarnessMeta {
  model?: string;
  /** Reasoning effort or thinking level: low, medium, high, xhigh, max... */
  effort?: string;
}

export interface HarnessSession {
  readonly id: string;
  readonly kind: HarnessKind;
  readonly flavor: Flavor;
  /** Append a live activity line (animated in). */
  push(ev: SubagentEvent): void;
  /** Replace or extend the subagent's current streaming message. */
  stream(text: string): void;
  /** Final state with a short result. */
  finish(summary?: string, ok?: boolean): void;
  /** Model and effort learned later (for example once the child thread exists). */
  setMeta(meta: HarnessMeta): void;
}

export interface HarnessStartOptions {
  id: string;
  kind: HarnessKind;
  title: string;
  prompt: string;
  model?: string;
  effort?: string;
  /** Terminal or desktop app. Falls back to the form the harness has. */
  flavor?: Flavor;
  /** Agent type or provider name, e.g. "Explore agent" or "Kimi". The generic console shows it as its name. */
  label?: string;
  /** Working directory shown in terminal banners. */
  cwd?: string;
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

/** How a terminal harness prints a step. */
interface CliStyle {
  /** Glyph in front of a step, per event kind, with a default. Empty string: no glyph. */
  glyph: Partial<Record<EvKind, string>>;
  def: string;
  /** Glyph while the call is still running (Gemini's executing mark). */
  pend?: string;
  label: Partial<Record<EvKind, string>>;
  /** Claude prints Read(path). */
  paren?: boolean;
  /** Prefix of the result line under a step. */
  sub: string;
  /** Glyph in front of the helper's replies. */
  say: string;
  /** Prompt glyph in the input and in the echoed brief. */
  prompt: string;
  /** Box around each step (Gemini), tinted block (Pi, OpenClaw), or accent rail (Grok). */
  block?: "box" | "tint" | "rail";
  /** Words after the title while running and when done (OpenClaw tool cards). */
  state?: [string, string];
  /** Text after the target, e.g. Aider's "to the chat". */
  after?: Partial<Record<EvKind, string>>;
}

const CLI: Record<HarnessKind, CliStyle> = {
  claude: { def: "⏺", glyph: { think: "∴" }, label: { read: "Read", edit: "Update", run: "Bash", search: "Search", web: "Fetch", think: "Thinking…", error: "Error" }, paren: true, sub: "⎿", say: "⏺", prompt: ">" },
  codex: { def: "•", glyph: { error: "✘" }, label: { read: "Read", edit: "Edited", run: "Ran", search: "Searched", web: "Searched the web", error: "Failed" }, sub: "└", say: "•", prompt: "›" },
  gemini: { def: "✓", pend: "⊷", glyph: { error: "x", think: "" }, label: { read: "ReadFile", edit: "Edit", run: "Shell", search: "SearchText", web: "WebFetch", think: "Thinking...", error: "Error" }, sub: "", say: "✦", prompt: ">", block: "box" },
  antigravity: { def: "●", glyph: { think: "∴", error: "✕" }, label: { read: "Read", edit: "Edit", run: "Run", search: "Search", web: "Browse", think: "Thinking", error: "Error" }, sub: "└", say: "", prompt: ">" },
  opencode: { def: "→", glyph: { edit: "←", run: "$", search: "✱", web: "%", tool: "⚙", think: "", error: "✗" }, label: { read: "Read", edit: "Edit", search: "Grep", web: "WebFetch", think: "Thinking:", error: "Error" }, sub: "", say: "", prompt: "" },
  pi: { def: "", glyph: {}, label: { read: "read", edit: "edit", run: "$", search: "grep", web: "fetch", think: "Thinking...", error: "error" }, sub: "", say: "", prompt: "", block: "tint" },
  hermes: { def: "┊", glyph: { think: "∴" }, label: { read: "read_file", edit: "patch", run: "terminal", search: "search", web: "web_extract", think: "thinking", error: "error" }, sub: "", say: "", prompt: "❯" },
  openclaw: { def: "", glyph: {}, label: { read: "read", edit: "edit", run: "exec", search: "grep", web: "web_fetch", think: "thinking", error: "error" }, sub: "", say: "", prompt: "", block: "tint", state: [" (running)", " (completed)"] },
  cursor: { def: "", glyph: {}, label: { read: "Read", edit: "Edited", run: "$", search: "Grepped", web: "Fetched", think: "Thought", error: "Error" }, sub: "", say: "", prompt: "→" },
  grok: { def: "", glyph: {}, label: { read: "Read", edit: "Edit", run: "Run", search: "Search", web: "Fetch", think: "Thinking…", error: "Error" }, sub: "", say: "", prompt: "❯", block: "rail" },
  aider: { def: "", glyph: {}, label: { read: "Added", edit: "Applied edit to", run: "Running", search: "Searching", web: "Scraping", think: "", error: "" }, sub: "", say: "", prompt: ">", after: { read: " to the chat" } },
  copilot: { def: "●", glyph: { think: "∴" }, label: { read: "Read", edit: "Edit", run: "Run", search: "Search", web: "Fetch", think: "Thought", error: "Error" }, sub: "└", say: "●", prompt: "❯" },
  amp: { def: "✓", pend: "⋯", glyph: { think: "∴", error: "✗" }, label: { read: "Read", edit: "Edit", run: "Bash", search: "Grep", web: "Web", think: "Thinking", error: "Error" }, sub: "", say: "", prompt: ">" },
  generic: { def: "", glyph: {}, label: { read: "read", edit: "edit", run: "run", search: "search", web: "web", think: "think", tool: "tool", error: "error" }, sub: "", say: "", prompt: ">" },
};

/** Desktop apps show finished steps as short past-tense rows. */
const APP_VERB: Record<EvKind, string> = { read: "Read", edit: "Edited", run: "Ran", search: "Searched", web: "Fetched", think: "Thought", say: "", tool: "", error: "Error" };
const APP_NEW: Partial<Record<HarnessKind, string>> = {
  claude: "New session", codex: "New chat", antigravity: "New conversation", opencode: "New session", hermes: "New task",
  openclaw: "New session", cursor: "New agent", amp: "New thread",
};

const MAX_LINES = 140;
const MAX_TABS = 6;

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

function cwdShort(p?: string) {
  if (!p) return "~";
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length <= 2 ? p : "…/" + parts.slice(-2).join("/");
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Window title: the command in a terminal, the app name for a desktop app. */
function windowTitle(kind: HarnessKind, flavor: Flavor, label?: string) {
  const t = THEMES[kind];
  if (kind === "generic") return flavor === "cli" ? (label || "agent").toLowerCase().split(/\s+/)[0] : (label || "Agent");
  return flavor === "cli" ? (t.cmd || t.name.toLowerCase()) : (t.app || t.name);
}

/** The elapsed part of the working line, as each harness prints it. */
function statusTail(kind: HarnessKind, flavor: Flavor, e: string) {
  if (flavor === "app") return e;
  switch (kind) {
    case "claude": return `(${e} · esc to interrupt)`;
    case "codex": return `(${e} • esc to interrupt)`;
    case "gemini": return `(esc to cancel, ${e})`;
    case "opencode": return `${e}  esc interrupt`;
    case "hermes": return `(${e})`;
    case "openclaw": return `• ${e} | running`;
    case "cursor": return `${e}  ctrl+c to stop`;
    case "grok": return `${e} [stop]`;
    case "copilot": return `(Esc to cancel · ${e})`;
    case "aider": case "pi": return "";
    default: return e;
  }
}

// ---------------------------------------------------------------------------
class Session implements HarnessSession {
  readonly id: string;
  readonly kind: HarnessKind;
  readonly flavor: Flavor;
  readonly theme: Theme;
  title: string;
  label?: string;
  model?: string;
  effort?: string;
  cwd?: string;

  view: HTMLElement;
  scroller: HTMLElement;
  log: HTMLElement;
  status: HTMLElement;
  input: HTMLElement;
  field: HTMLElement;
  typed: HTMLElement;
  tab: HTMLElement;
  /** Terminal banner, terminal footer, or the app's model chip and sidebar: everything that shows model and effort. */
  private banner: HTMLElement | null = null;
  private foot: HTMLElement | null = null;
  private chip: HTMLElement | null = null;
  sideList: HTMLElement | null = null;
  private topTitle: HTMLElement | null = null;
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
  private sayLabelShown = false;
  private pending: { line: HTMLElement; timer: number } | null = null;
  streamLine: { line: HTMLElement; msg: HTMLElement; inner: HTMLElement; target: string; shown: number } | null = null;

  // scrolling: stick to the bottom unless the reader scrolled up
  stick = true;
  followUntil = 0;
  lastAutoTop = -1;

  constructor(private app: HarnessApp, o: HarnessStartOptions) {
    this.id = o.id;
    this.kind = o.kind;
    this.flavor = resolveFlavor(o.kind, o.flavor);
    this.theme = THEMES[o.kind];
    this.title = o.title;
    this.label = o.label;
    this.model = o.model || undefined;
    this.effort = normEffort(o.effort) || undefined;
    this.cwd = o.cwd;

    this.view = el("div", `hx-view hx-${this.flavor} hx-k-${o.kind}`);
    this.view.dataset.id = o.id;
    this.scroller = el("div", "hx-scroll");
    this.log = el("div", "hx-log");

    // working line
    this.status = el("div", "hx-status off");
    const t = this.theme;
    if (t.spin.length) {
      this.spinEl = el("span", "hx-spin", t.spin[0]);
      this.status.append(this.spinEl);
    } else if (o.kind === "generic" || this.flavor === "app") {
      const dots = el("span", "hx-dots");
      dots.append(el("i"), el("i"), el("i"));
      this.status.append(dots);
    } else {
      this.status.append(el("i", "hx-cb"));
    }
    this.verbEl = el("span", "hx-verb hx-shim", this.firstVerb());
    this.elEl = el("span", "hx-el");
    this.status.append(this.verbEl, this.elEl);

    // input
    this.field = el("div", "hx-field");
    const fieldIn = el("div", "hx-field-in");
    this.typed = el("span", "hx-typed");
    if (t.placeholder) this.typed.dataset.ph = t.placeholder;
    fieldIn.append(this.typed, el("span", "hx-caret"));
    this.field.append(fieldIn);

    if (this.flavor === "cli") {
      this.banner = el("div", "hx-ban");
      this.scroller.append(this.banner, this.log);
      this.input = el("div", "hx-input");
      const glyph = CLI[o.kind].prompt;
      if (glyph) this.input.append(el("span", "hx-chev", glyph));
      this.input.append(this.field);
      this.foot = el("div", "hx-foot");
      const box = el("div", "hx-inbox");
      box.append(this.input, this.foot);
      this.view.append(this.scroller, this.status, box);
    } else {
      const side = el("div", "hx-side");
      const brand = el("div", "hx-brand");
      brand.append(markEl(o.kind), el("b", "", windowTitle(o.kind, "app", o.label)));
      const add = el("div", "hx-new-row");
      add.append(el("i", "hx-plus"), el("span", "", APP_NEW[o.kind] || "New"));
      this.sideList = el("div", "hx-list");
      side.append(brand, add, this.sideList);
      const main = el("div", "hx-main");
      const top = el("div", "hx-top");
      this.topTitle = el("span", "hx-top-t", o.title);
      top.append(this.topTitle);
      if (o.label && o.kind !== "generic") top.append(el("span", "hx-top-l", o.label));
      this.scroller.append(this.log);
      this.input = el("div", "hx-input hx-comp");
      const row = el("div", "hx-comp-row");
      const left = el("div", "hx-comp-l");
      left.append(el("i", "hx-plus"));
      if (o.kind === "cursor") left.append(el("span", "hx-mode", "∞ Agent"));
      if (o.kind === "opencode") left.append(el("span", "hx-mode hx-agent", "Build"));
      this.chip = el("span", "hx-chip");
      const send = el("i", "hx-send");
      row.append(left, this.chip, send);
      this.input.append(this.field, row);
      main.append(top, this.scroller, this.status, this.input);
      this.view.append(side, main);
    }
    this.renderMeta();

    this.tab = el("div", "hx-tab");
    this.tab.dataset.kind = o.kind;
    this.tab.setAttribute("role", "tab");
    this.tab.dataset.id = o.id;
    this.tab.append(markEl(o.kind, "hx-tab-m"), el("span", "hx-tab-t"), el("i", "hx-dot"));
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

  private firstVerb() {
    if (this.kind === "aider") return `Waiting for ${this.model || "the model"}`;
    if (this.flavor === "app") return this.kind === "cursor" ? "Planning next moves" : "Working";
    return pick(this.theme.verbs);
  }

  setTitle(t: string) {
    this.title = t;
    (this.tab.querySelector(".hx-tab-t") as HTMLElement).textContent = t;
    this.tab.title = `${windowTitle(this.kind, this.flavor, this.label)}: ${t}`;
    if (this.topTitle) this.topTitle.textContent = t;
  }

  setMeta(m: HarnessMeta) {
    const model = m.model || this.model;
    const effort = normEffort(m.effort) || this.effort;
    if (model === this.model && effort === this.effort) return;
    this.model = model;
    this.effort = effort;
    this.renderMeta();
  }

  // --- model and effort, the way each harness shows them -------------------------------
  private renderMeta() {
    if (this.banner) this.banner.replaceChildren(...this.bannerParts());
    if (this.foot) this.foot.replaceChildren(...this.footParts());
    if (this.chip) {
      const model = prettyModel(this.model);
      const eff = effortWord(this.effort, true);
      const parts: Node[] = [];
      if (model) parts.push(el("span", "hx-cm", model));
      if (eff) parts.push(el("span", "hx-ce", eff));
      this.chip.replaceChildren(...parts);
      this.chip.hidden = !parts.length;
      this.chip.title = [model, eff && `${eff} effort`].filter(Boolean).join(", ");
    }
    // Pi colours the editor rules by thinking level.
    this.view.dataset.effort = this.effort || "none";
    if (this.kind === "aider" && this.state === "running") this.verbEl.textContent = `Waiting for ${this.model || "the model"}`;
  }

  private bannerParts(): Node[] {
    const k = this.kind, t = this.theme;
    const m = this.model || "", pm = prettyModel(m), eff = this.effort || "";
    const line = (cls: string, ...kids: (Node | string)[]) => { const d = el("div", cls); d.append(...kids); return d; };
    const dim = (s: string) => el("span", "hx-dim", s);
    const cwd = cwdShort(this.cwd);
    switch (k) {
      case "claude": {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", el("b", "", "Claude Code"), " ", dim(t.version || "")));
        txt.append(line("hx-dim", [pm || "Claude", eff && `${eff} effort`, this.label].filter(Boolean).join(" · ")));
        txt.append(line("hx-dim", cwd));
        return [markEl(k), txt];
      }
      case "codex": {
        const box = el("div", "hx-ban-box");
        box.append(line("", el("span", "hx-acc", ">_"), " ", el("b", "", "OpenAI Codex"), " ", dim(`(${t.version})`)));
        box.append(line("hx-gap"));
        box.append(line("", dim("model:     "), [m || "default", eff].filter(Boolean).join(" "), "   ", dim("/model to change")));
        box.append(line("", dim("directory: "), cwd));
        return [box];
      }
      case "gemini": {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", el("b", "hx-grad", "Gemini CLI"), " ", dim(t.version || "")));
        txt.append(line("hx-dim", "Tips: ask questions, edit files, or run commands. /help for more."));
        return [markEl(k), txt];
      }
      case "antigravity": {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", el("b", "", "Antigravity CLI"), " ", dim(t.version || "")));
        txt.append(line("hx-dim", cwd));
        return [markEl(k), txt];
      }
      case "opencode": {
        const art = el("div", "hx-art");
        const rows = [["█▀▀█ █▀▀█ █▀▀█ █▀▀▄", " █▀▀▀ █▀▀█ █▀▀█ █▀▀█"], ["█  █ █  █ █▀▀▀ █  █", " █    █  █ █  █ █▀▀▀"], ["▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀  ▀", " ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"]];
        for (const [a, b] of rows) art.append(line("", el("span", "hx-dim", a), el("span", "", b)));
        return [art];
      }
      case "pi": {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", el("b", "", "pi"), " ", dim(t.version || "")));
        txt.append(line("hx-dim", "esc to interrupt · / for commands · ! to run bash"));
        return [markEl(k), txt];
      }
      case "hermes": {
        const word = line("hx-word", "HERMES-AGENT");
        const panel = el("div", "hx-ban-panel");
        panel.append(line("hx-ban-cap", `Hermes Agent ${t.version}`));
        const body = el("div", "hx-ban-body");
        body.append(markEl(k));
        const info = el("div", "hx-ban-t");
        info.append(line("", pm || m || "default model", eff ? dim(` · reasoning ${eff}`) : ""));
        info.append(line("hx-dim", cwd));
        body.append(info);
        panel.append(body);
        return [word, panel];
      }
      case "openclaw":
        return [line("hx-acc hx-b6", "openclaw tui - ws://127.0.0.1:18789 - agent main - session main")];
      case "cursor": {
        const txt = el("div", "hx-ban-bar");
        txt.append(line("", el("b", "", "Cursor Agent"), " ", dim(t.version || "")));
        txt.append(line("hx-dim", cwd));
        return [txt];
      }
      case "grok": {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", el("b", "", "Grok Build"), " ", dim(t.version || "")));
        txt.append(line("hx-dim", cwd));
        return [markEl(k), txt];
      }
      case "aider": {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", `Aider ${t.version}`));
        txt.append(line("", `Main model: ${m || "default"} with diff edit format${eff ? `, reasoning ${eff}` : ""}`));
        txt.append(line("", "Use /help <question> for help, run \"aider --help\" to see cmd line args"));
        return [txt];
      }
      case "copilot": {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", el("b", "", "GitHub Copilot"), " ", dim(t.version || "")));
        txt.append(line("hx-dim", cwd));
        return [markEl(k), txt];
      }
      case "amp": {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", el("b", "", "amp")));
        txt.append(line("hx-dim", cwd));
        return [markEl(k), txt];
      }
      default: {
        const txt = el("div", "hx-ban-t");
        txt.append(line("", el("b", "", this.label || "Agent")));
        const grid = el("div", "hx-kv");
        const rows: [string, string][] = [];
        if (m) rows.push(["model", m]);
        if (eff) rows.push(["effort", eff]);
        rows.push(["task", this.title]);
        for (const [a, b] of rows) grid.append(el("span", "hx-k", a), el("span", "hx-v", b));
        txt.append(grid);
        return [markEl(k), txt];
      }
    }
  }

  private footParts(): Node[] {
    const k = this.kind;
    const m = this.model || "", pm = prettyModel(m), eff = this.effort || "";
    const L = (...kids: (Node | string)[]) => { const s = el("span", "hx-fl"); s.append(...kids); return s; };
    const R = (...kids: (Node | string)[]) => { const s = el("span", "hx-fr"); s.append(...kids); return s; };
    const dim = (s: string) => el("span", "hx-dim", s);
    const both = (sep: string, a: string, b: string) => [a, b].filter(Boolean).join(sep);
    const cwd = cwdShort(this.cwd);
    switch (k) {
      case "claude": return [L(dim("? for shortcuts")), R(pm, eff ? el("span", "hx-eff", ` ◐ ${eff}`) : "")];
      case "codex": return [L(dim("? for shortcuts")), R(both(" ", m, eff))];
      case "gemini": {
        const col = (a: string, b: string | Node) => { const c = el("span", "hx-col"); c.append(el("span", "hx-dim", a), typeof b === "string" ? el("span", "", b) : b); return c; };
        return [col("workspace (/directory)", cwd), col("/model", el("span", "hx-acc", both(" · ", m || "auto", eff)))];
      }
      case "opencode": {
        const parts: (Node | string)[] = [el("span", "hx-agent", "Build")];
        if (m) parts.push(" · ", m, " ", dim(cap(modelVendor(m))));
        if (eff) parts.push(" · ", el("b", "hx-eff", eff));
        return [L(...parts), R(dim("tab agents  ctrl+p commands"))];
      }
      case "pi": return [L(dim(cwd)), R(dim(m ? `(${modelVendor(m) || "model"}) ${m}` : ""), el("span", "hx-eff", eff ? ` • ${eff}` : " • thinking off"))];
      case "hermes": return [L(el("span", "hx-acc", "☤ "), pm || m || "model", dim(" │ "), eff ? `reasoning ${eff}` : "reasoning default", dim(" │ "), dim(cwd))];
      case "openclaw": return [L(dim("agent main | session main | "), both(" ", m, eff) || "default")];
      case "cursor": return [L(dim(both(" ", pm, eff ? effortWord(eff, true) : "") || "Auto")), R(dim(cwd))];
      case "grok": return [L(el("span", "hx-model", m || "grok"), eff ? dim(` · ${eff}`) : "")];
      case "aider": return [L(dim(both(" · ", m, eff ? `reasoning ${eff}` : "")))];
      case "copilot": return [L(dim(cwd)), R(dim(m ? `${m}${eff ? ` (${eff})` : ""}` : ""))];
      case "amp": return [L(el("span", "hx-eff", eff || "smart")), R(dim(m))];
      case "antigravity": return [L(dim(cwd)), R(both(" · ", pm, eff ? effortWord(eff, true) : ""))];
      default: return [L(dim(both(" · ", m, eff)))];
    }
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
    if (this.state === "running") {
      const e = statusTail(this.kind, this.flavor, fmtElapsed(now - this.startedAt));
      if (e !== this.lastElapsed) { this.lastElapsed = e; this.elEl.textContent = e; }
      if (this.spinEl && this.theme.spinMs) {
        const f = Math.floor(now / this.theme.spinMs) % this.theme.spin.length;
        if (f !== this.spinFrame) { this.spinFrame = f; this.spinEl.textContent = this.theme.spin[f]; }
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
    const b = line.querySelector(".hx-b") as HTMLElement | null;
    line.classList.remove("hx-pend");
    if (b) {
      b.classList.remove("pending");
      if (b.dataset.done !== undefined) b.textContent = b.dataset.done;
    }
    const st = line.querySelector(".hx-st") as HTMLElement | null;
    if (st && st.dataset.done) st.textContent = st.dataset.done;
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

  /** A reply row: glyph or label, then the text. */
  private sayRow(msgEl: HTMLElement) {
    const row = el("div", "hx-row hx-wrap");
    if (this.flavor === "cli") {
      const g = CLI[this.kind].say;
      if (this.kind === "hermes" && !this.sayLabelShown) {
        this.sayLabelShown = true;
        const wrap = el("div", "hx-say-wrap");
        wrap.append(el("div", "hx-say-l", "☤ Hermes"), msgEl);
        row.append(wrap);
        return row;
      }
      if (g) row.append(el("i", "hx-b hx-g", g));
    }
    row.append(msgEl);
    return row;
  }

  private buildEvent(ev: SubagentEvent): HTMLElement {
    const k = this.kind;
    const line = el("div", `hx-line hx-ev-${ev.kind}`);
    if (ev.kind === "say") {
      line.append(this.sayRow(el("div", "hx-msg hx-clamp", ev.text)));
      return line;
    }
    const text = ev.kind === "read" || ev.kind === "edit" ? shortPath(ev.text) : ev.text;
    const row = el("div", "hx-row");
    row.title = ev.text;
    if (this.flavor === "app") {
      line.classList.add("hx-act");
      row.append(el("i", "hx-b"));
      if (ev.kind === "tool") row.append(el("b", "hx-l", ev.text));
      else row.append(el("b", "hx-l", k === "cursor" && ev.kind === "search" ? "Grepped" : APP_VERB[ev.kind]), el("span", "hx-t", text));
      if (ev.detail && ev.kind !== "think") row.append(el("span", "hx-dt", ev.detail));
      line.append(row);
      return line;
    }
    const c = CLI[k];
    if (c.block) line.classList.add(`hx-blk-${c.block}`);
    const glyph = c.glyph[ev.kind] ?? c.def;
    if (glyph) {
      const g = el("i", "hx-b hx-g", glyph);
      if (c.pend && ev.kind !== "think" && ev.kind !== "error") g.dataset.done = glyph;
      row.append(g);
    } else if (k === "generic") row.append(el("i", "hx-b"));
    const label = ev.kind === "tool" ? ev.text : (c.label[ev.kind] ?? "");
    if (label) row.append(el("b", "hx-l", label));
    if (ev.kind !== "tool") {
      if (c.paren && ev.kind !== "think" && ev.kind !== "error") row.append(el("span", "hx-t hx-paren", text));
      else row.append(el("span", "hx-t", ev.kind === "search" && k === "opencode" ? `"${text}"` : text));
      const after = c.after?.[ev.kind];
      if (after) row.append(el("span", "hx-dim", after));
    }
    if (c.state && ev.kind !== "think" && ev.kind !== "error") {
      const st = el("span", "hx-st hx-dim", c.state[1]);
      st.dataset.done = c.state[1];
      row.append(st);
    }
    line.append(row);
    const detail = ev.detail;
    if (detail) {
      const d = el("div", "hx-d");
      if (c.sub) d.append(el("span", "hx-e", c.sub));
      d.append(el("span", "hx-dt", detail));
      d.title = detail;
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
    if (ev.kind === "think" && this.followsThoughts()) this.setVerb(ev.text);
    const line = this.buildEvent(ev);
    const toolish = ev.kind !== "say" && ev.kind !== "think" && ev.kind !== "error";
    const d = line.querySelector(".hx-d") as HTMLElement | null;
    if (toolish && this.live) {
      // a tool call shows as pending for a moment, then its result appears
      const b = line.querySelector(".hx-b") as HTMLElement | null;
      b?.classList.add("pending");
      line.classList.add("hx-pend");
      const c = CLI[this.kind];
      if (b && this.flavor === "cli" && c.pend) b.textContent = c.pend;
      const st = line.querySelector(".hx-st") as HTMLElement | null;
      if (st && c.state) st.textContent = c.state[0];
      if (d) d.hidden = true;
      this.addLine(line);
      this.pending = { line, timer: window.setTimeout(() => this.settlePending(), 380 + Math.random() * 420) };
    } else {
      this.addLine(line);
    }
  }

  /** Harnesses whose working line turns into the current thought. */
  private followsThoughts() {
    return this.kind !== "claude" && this.kind !== "hermes" && this.kind !== "openclaw" && this.kind !== "aider";
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
    const msg = el("div", "hx-msg hx-tail");
    const inner = el("div", "hx-msg-in");
    msg.append(inner);
    line.append(this.sayRow(msg));
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
    this.addLine(this.flavor === "app" ? this.appResult(summary, ok, took) : this.cliResult(summary, ok, took));
    this.app.sessionChanged();
  }

  private rule(text: string) {
    const r = el("div", "hx-rule");
    r.append(el("i"), el("span", "", text), el("i"));
    return r;
  }

  private cliResult(summary: string | undefined, ok: boolean, took: string) {
    const k = this.kind;
    const line = el("div", `hx-line hx-result ${ok ? "hx-ok" : "hx-fail"}`);
    const text = summary || (ok ? "Done" : "Failed");
    const msg = () => el("div", "hx-msg hx-clamp", text);
    const tail = (s: string) => { const d = el("div", "hx-d"); d.append(el("span", "hx-dt", s)); return d; };
    const steps = `${this.steps} ${k === "claude" ? "tool use" : "step"}${this.steps === 1 ? "" : "s"}`;
    switch (k) {
      case "claude":
        line.append(this.sayRow(msg()), tail(`✻ ${ok ? "Worked" : "Stopped"} for ${took} · ${steps}`));
        break;
      case "codex":
        line.append(this.rule(ok ? `Worked for ${took}` : `Stopped after ${took}`), this.sayRow(msg()));
        break;
      case "opencode": {
        line.append(this.sayRow(msg()));
        const d = el("div", "hx-d");
        d.append(el("span", "hx-agent", "▣ Build"), el("span", "hx-dt", ` · ${this.model || "model"} · ${took}${ok ? "" : " · interrupted"}`));
        line.append(d);
        break;
      }
      case "hermes":
        line.append(this.sayRow(msg()), tail(ok ? `✧٩(ˊᗜˋ*)و✧ got it! (${took})` : `(╥﹏╥) stopped (${took})`));
        break;
      case "cursor": {
        const box = el("div", "hx-sum");
        box.append(el("b", "hx-sum-t", "Summary"), msg());
        line.append(box);
        break;
      }
      case "openclaw":
        line.append(this.sayRow(msg()), tail(`${ok ? "done" : "error"} • ${took}`));
        break;
      case "grok":
        line.append(this.sayRow(msg()), tail(`${ok ? "Worked" : "Stopped"} for ${took}`));
        break;
      case "aider": case "pi": case "gemini": case "copilot":
        line.append(this.sayRow(msg()));
        if (!ok) line.append(tail("Stopped"));
        break;
      default:
        line.append(this.sayRow(msg()), tail(`${ok ? "Finished" : "Failed"} in ${took} · ${steps}`));
    }
    return line;
  }

  private appResult(summary: string | undefined, ok: boolean, took: string) {
    const line = el("div", `hx-line hx-result ${ok ? "hx-ok" : "hx-fail"}`);
    const steps = `${this.steps} step${this.steps === 1 ? "" : "s"}`;
    if (this.kind === "claude") {
      line.append(el("div", "hx-msg hx-clamp", summary || (ok ? "Done" : "Failed")));
      const d = el("div", "hx-d");
      d.append(el("span", "hx-dt", `${ok ? "Done" : "Stopped"} in ${took} · ${this.steps} tool use${this.steps === 1 ? "" : "s"}`));
      line.append(d);
    } else {
      line.append(this.rule(ok ? `Worked for ${took} · ${steps}` : `Stopped after ${took}`));
      line.append(el("div", "hx-msg hx-clamp", summary || (ok ? "Done" : "Failed")));
    }
    return line;
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
    const glyph = this.flavor === "cli" ? CLI[this.kind].prompt : "";
    if (glyph) row.append(el("span", "hx-chev", glyph));
    row.append(el("div", "hx-msg hx-clamp", prompt));
    you.append(row);
    if (this.log.children.length) you.classList.add("hx-gap");
    this.addLine(you);

    this.state = "running";
    this.startedAt = performance.now();
    this.endedAt = 0;
    this.steps = 0;
    this.sayLabelShown = false;
    this.lastElapsed = "";
    this.verbEl.textContent = this.firstVerb();
    this.elEl.textContent = statusTail(this.kind, this.flavor, "0s");
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

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");

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
    this.root = el("div", "hx hx-k-generic hx-f-cli hx-empty");
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
      await this.ensureWindow(s ?? null, opts);
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
        this.refreshSides();
        await wm.sleep(320, e);
      } else {
        if (opts.title && opts.title !== s.title) s.setTitle(opts.title);
        s.setMeta({ model: opts.model, effort: opts.effort });
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
      await this.ensureWindow(s, null);
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
    this.refreshSides();
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

  private async ensureWindow(s: Session | null, opts: HarnessStartOptions | null) {
    const shown = this.active ?? s;
    const kind = shown?.kind ?? opts?.kind ?? "generic";
    const flavor = shown?.flavor ?? resolveFlavor(kind, opts?.flavor);
    const w = await this.wm.open(HARNESS_APP_ID as unknown as AppId, windowTitle(kind, flavor, shown?.label ?? opts?.label));
    this.win = w;
    this.dressWindow(flavor);
    if (this.root.parentElement !== w.body) {
      w.body.replaceChildren(this.root);
      for (const x of this.sessions.values()) if (x.stick) x.snapBottom();
    }
    return w;
  }

  /** A terminal harness runs in a terminal-looking window; an app in its own window. */
  private dressWindow(flavor: Flavor) {
    const w = this.win;
    if (!w) return;
    w.el.classList.toggle("hx-host-cli", flavor === "cli");
    w.el.classList.toggle("hx-host-app", flavor === "app");
    const ico = w.el.querySelector(".win-bar svg");
    const want = flavor === "cli" ? "terminal" : "harness";
    if (ico && (ico as HTMLElement).dataset?.hx !== want) {
      const tmp = document.createElement("div");
      tmp.innerHTML = want === "terminal" ? ICONS.terminal : HARNESS_ICON;
      const svg = tmp.firstElementChild as SVGElement;
      svg.dataset.hx = want;
      ico.replaceWith(svg);
    }
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
    for (const c of Array.from(this.root.classList)) if (c.startsWith("hx-k-") || c.startsWith("hx-f-")) this.root.classList.remove(c);
    this.root.classList.remove("hx-empty");
    this.root.classList.add(`hx-k-${s.kind}`, `hx-f-${s.flavor}`);
    for (const o of this.sessions.values()) {
      o.tab.classList.toggle("on", o === s);
      o.tab.setAttribute("aria-selected", String(o === s));
    }
    if (this.win) {
      this.win.title.textContent = windowTitle(s.kind, s.flavor, s.label);
      this.dressWindow(s.flavor);
    }
    if (s.stick) s.snapBottom();
    this.refreshSides();
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

  /** Desktop apps list their own sessions in the sidebar (helpers of the same harness). */
  private refreshSides() {
    for (const s of this.sessions.values()) {
      if (!s.sideList) continue;
      const rows: HTMLElement[] = [];
      for (const o of this.sessions.values()) {
        if (o.kind !== s.kind || o.flavor !== "app") continue;
        const r = el("div", `hx-srow${o === s ? " on" : ""}${o.state === "running" ? " running" : ""}`);
        r.append(el("span", "hx-srow-t", o.title), el("i", "hx-sdot"));
        r.title = o.title;
        rows.push(r);
      }
      s.sideList.replaceChildren(...rows);
    }
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
