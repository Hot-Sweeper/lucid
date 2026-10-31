import gsap from "gsap";
import type { Desk } from "./desk";
import { logoFor, harnessName } from "./brand";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { highlight } from "../os/highlight";
import { type ThreadRef, refBlock, stripRefs, summarize } from "./thread-ref";

// The chat beside a robot's screen: your whole conversation with it, live, with your
// attachments shown inline, and a box to message it without leaving its desk.

type Msg = {
  id: string; role: string; at: string; streaming: boolean; text: string; run?: string | null; queue?: number | null;
  attachments: { type: string; name: string; mime: string; size: number; path: string | null }[];
  // queued messages only: their run, the live turn they can be steered into, and what T3 allows
  queueRunId?: string; steerTarget?: string | null; queueFixed?: boolean; queueGuest?: boolean;
};

// T3 server actions through Lucid's paired session (see electron/t3server.cjs).
type OptionValue = string | boolean;
type T3Option = { id: string; label: string; type: "select" | "boolean"; choices?: { id: string; label: string; isDefault: boolean }[]; current?: OptionValue };
type T3Model = { slug: string; name: string; shortName: string | null; isDefault: boolean; options: T3Option[] };
type T3Provider = { instanceId: string; driver: string; name: string; ready: boolean; models: T3Model[] };
type Selection = { providerInstanceId: string; model: string | null; options: Record<string, OptionValue> };
export type T3Api = {
  status(o: { connect?: boolean; threadId?: string | null }): Promise<{ paired: boolean; error: string | null; selection: Selection | null }>;
  providers(o?: { fresh?: boolean }): Promise<T3Provider[]>;
  reorder(o: { threadId: string; runId: string; beforeRunId: string | null }): Promise<unknown>;
  cancel(o: { threadId: string; runId: string }): Promise<unknown>;
  edit(o: { threadId: string; runId: string; text: string }): Promise<unknown>;
  steer(o: { threadId: string; queuedRunId: string; targetRunId: string }): Promise<unknown>;
  setModel(o: { threadId: string; selection: { providerInstanceId: string; model: string; options: Record<string, OptionValue> } }): Promise<unknown>;
};
type Api = {
  conversation(id: string): Promise<Msg[]>;
  sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
  saveAttachment(name: string, data: Uint8Array): Promise<string>;
  t3?: T3Api;
};

// Which option is the reasoning effort and which is the speed switch, across harnesses:
// Claude uses effort + fastMode, Codex reasoningEffort + serviceTier, OpenCode variant.
const EFFORT_IDS = ["effort", "reasoningEffort", "reasoning_effort", "thinkingLevel", "variant", "reasoning"];
const effortOption = (m?: T3Model) => m?.options.find((o) => o.type === "select" && EFFORT_IDS.includes(o.id)) ?? null;
function speedOption(m?: T3Model): { opt: T3Option; on: OptionValue; off: OptionValue } | null {
  for (const o of m?.options ?? []) {
    if (o.type === "boolean" && /fast/i.test(o.id)) return { opt: o, on: true, off: false };
    if (o.type === "select" && /serviceTier|speed/i.test(o.id)) {
      const fast = o.choices?.find((c) => /priority|fast/i.test(c.id));
      const normal = o.choices?.find((c) => c.isDefault) ?? o.choices?.find((c) => c !== fast);
      if (fast && normal) return { opt: o, on: fast.id, off: normal.id };
    }
  }
  return null;
}
const defaultOf = (o: T3Option): OptionValue | undefined => (o.type === "select" ? o.choices?.find((c) => c.isDefault)?.id : o.current);
// Keep the options the next model also understands, with values it accepts.
function carryOptions(m: T3Model | undefined, prev: Record<string, OptionValue>) {
  if (!m) return { ...prev };
  const out: Record<string, OptionValue> = {};
  for (const o of m.options) {
    const v = prev[o.id];
    if (v === undefined) continue;
    if (o.type === "boolean" ? typeof v === "boolean" : o.choices?.some((c) => c.id === v)) out[o.id] = v;
  }
  return out;
}
const ordLabel = (n: number) => (n === 1 ? "next" : `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"}`);
const CHEVRON = `<svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M2 3.8l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON = {
  up: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  down: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  edit: `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M10.5 3.5l2 2L6 12H4v-2l6.5-6.5z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>`,
  steer: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5v3a2 2 0 0 0 2 2h7.5M9.5 6.5l3 3-3 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  remove: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  grip: `<svg viewBox="0 0 10 16" width="8" height="13" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3.5" r="1.2"/><circle cx="7" cy="3.5" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="7" cy="8" r="1.2"/><circle cx="3" cy="12.5" r="1.2"/><circle cx="7" cy="12.5" r="1.2"/></g></svg>`,
  check: `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const HINT = "Enter to send, Shift+Enter for a new line";
export const fileUrl = (p: string) => `lucid-file://local/${encodeURIComponent(p)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Messages render as real Markdown, like in T3 Code: headings, lists, tables, quotes,
// highlighted code blocks with a copy button, and links (web links open in the browser,
// file paths show as file chips). Everything goes through DOMPurify.
const FENCE: Record<string, string> = { ts: "c", tsx: "c", js: "c", jsx: "c", typescript: "c", javascript: "c", rust: "c", go: "c", java: "c", c: "c", cpp: "c", cs: "c", py: "hash", python: "hash", sh: "hash", bash: "hash", shell: "hash", powershell: "hash", ps1: "hash", yaml: "hash", yml: "hash", toml: "hash", json: "json", html: "markup", xml: "markup", svg: "markup", css: "css", scss: "css", md: "text", markdown: "text", text: "text", txt: "text" };
const mdParser = new Marked({ gfm: true, breaks: true });
mdParser.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const l = (lang || "").trim().split(/\s+/)[0].toLowerCase();
      const body = text.replace(/\n$/, "").split("\n").map((line) => highlight(line, FENCE[l] ?? "c")).join("\n");
      return `<div class="md-code"><div class="md-code-head"><span>${esc(l || "code")}</span><button type="button" class="md-copy">Copy</button></div><pre><code>${body}</code></pre></div>`;
    },
    link(this: any, { href, tokens }: { href: string; tokens: any[] }) {
      const inner = this.parser.parseInline(tokens);
      if (/^(https?:|mailto:)/i.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
      return `<span class="md-file" title="${esc(href)}">${inner}</span>`;
    },
    table(this: any, token: any) {
      const head = token.header.map((c: any) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("");
      const rows = token.rows.map((r: any[]) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`).join("");
      return `<div class="md-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    },
  },
});
function md(text: string) {
  const html = mdParser.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
}
// Time of day for today's messages; older ones also get their date so equal times never look alike.
const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? t : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${t}`;
};

export class ChatPanel {
  el: HTMLElement;
  private desk: Desk | null = null;
  private shown = new Map<string, HTMLElement>();
  private timer = 0;
  onClose: () => void = () => {};
  onToggleView: () => void = () => {};
  /** You started or stopped typing a message to this robot. */
  onTyping: (on: boolean) => void = () => {};
  private pending: { text: string; at: number }[] = [];
  private files: File[] = [];
  private previews = new WeakMap<File, string>();
  // T3 session: the model bar and the queue actions need Lucid to be paired with T3
  private paired = false;
  private triedConnect = false;
  private providers: T3Provider[] | null = null;
  private sel: Selection | null = null;
  private selAt = 0;
  private saving = 0;
  private queueHold = 0; // dragging, editing or confirming: live updates wait
  private queueLatest: Msg[] = [];
  private menuClose: (() => void) | null = null;

  private addFiles(list: File[]) {
    const room = 10 - this.files.length;
    const big = list.filter((f) => f.size > 25 * 1024 * 1024);
    this.files.push(...list.filter((f) => f.size <= 25 * 1024 * 1024).slice(0, Math.max(0, room)));
    if (big.length) this.note(`${big.map((f) => f.name).join(", ")} ${big.length === 1 ? "is" : "are"} over 25 MB and ${big.length === 1 ? "was" : "were"} left out.`);
    this.renderChips();
    (this.el.querySelector("textarea") as HTMLTextAreaElement).focus();
  }

  private renderChips() {
    const box = this.el.querySelector(".cp-chips") as HTMLElement;
    const preview = this.refPreview && !this.refs.some((r) => r.id === this.refPreview!.id) ? this.refPreview : null;
    box.hidden = !this.files.length && !this.refs.length && !preview;
    const refChip = (r: ThreadRef, i: number) => {
      const logo = logoFor(r.provider);
      return `<div class="cp-chip cp-refchip${i < 0 ? " preview" : ""}" data-ref="${esc(r.id)}" title="${esc(`${r.title}\n${r.project}`)}">`
        + `<span class="cpc-ref">${logo ? `<img src="${logo}" alt="">` : ""}</span>`
        + `<span class="cpc-two"><span class="cpc-proj">${esc(r.project)}</span><span class="cpc-name">${esc(r.title)}</span></span>`
        + (i < 0 ? "" : `<button type="button" data-rmref="${i}" aria-label="Remove reference to ${esc(r.title)}" title="Remove reference">&times;</button>`) + `</div>`;
    };
    box.innerHTML = this.refs.map(refChip).join("") + (preview ? refChip(preview, -1) : "") + this.files.map((f, i) => {
      let thumb = "";
      if (f.type.startsWith("image/")) {
        if (!this.previews.has(f)) this.previews.set(f, URL.createObjectURL(f));
        thumb = `<img src="${this.previews.get(f)}" alt="">`;
      } else thumb = `<span class="cpc-ext">${esc((f.name.split(".").pop() || "file").slice(0, 4).toUpperCase())}</span>`;
      return `<div class="cp-chip">${thumb}<span class="cpc-name" title="${esc(f.name)}">${esc(f.name)}</span><button type="button" data-rm="${i}" aria-label="Remove ${esc(f.name)}">&times;</button></div>`;
    }).join("");
  }

  // --- threads you reference in your message (dragged in from the sidebar) -------------
  private refs: ThreadRef[] = [];
  private refPreview: ThreadRef | null = null;
  private refLoads = new Map<string, Promise<void>>();

  private refState(r: ThreadRef): "own" | "dup" | "ok" {
    return r.id === this.threadId ? "own" : this.refs.some((x) => x.id === r.id) ? "dup" : "ok";
  }

  /** Where a dragged thread would land at this point: the message box, the edge tab, or nowhere. */
  dropZone(x: number, y: number): "box" | "tab" | null {
    if (!this.isOpen) return null;
    const hit = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    if (this.collapsed) return hit(this.tab) ? "tab" : null;
    return hit(this.el) ? "box" : null;
  }

  /** While a thread is dragged: mark the drop target and preview the chip where it will land. */
  dragOver(ref: ThreadRef | null, zone: "box" | "tab" | null) {
    const box = this.el.querySelector(".cp-box") as HTMLElement;
    const hint = this.el.querySelector(".cp-hint") as HTMLElement;
    const state = ref ? this.refState(ref) : null;
    this.el.classList.toggle("ref-dragging", !!ref);
    this.tab.classList.toggle("ref-dragging", !!ref);
    box.classList.toggle("ref-over", zone === "box");
    box.classList.toggle("ref-no", zone === "box" && state !== "ok");
    this.tab.classList.toggle("ref-over", zone === "tab");
    (this.tab.querySelector("span") as HTMLElement).textContent = zone === "tab" ? "Drop to reference" : this.tabLabel;
    hint.textContent = zone === "box" ? (state === "own" ? "This is this robot's own thread" : state === "dup" ? "Already referenced" : "Drop to reference this thread") : HINT;
    const next = zone === "box" && state === "ok" ? ref : null;
    if (next?.id === this.refPreview?.id) return;
    this.refPreview = next;
    this.renderChips();
    const p = this.el.querySelector(".cp-refchip.preview");
    if (p) gsap.fromTo(p, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.16, ease: "power2.out" });
  }

  /** Adds a thread to the message you are writing. Returns its chip (where a drop animation can land). */
  addReference(ref: ThreadRef): HTMLElement | null {
    if (this.collapsed) this.setCollapsed(false);
    const state = this.refState(ref);
    this.refPreview = null;
    if (state === "ok") {
      this.refs.push({ ...ref });
      // the last request and reply go along as a summary; loaded now so sending stays quick
      this.refLoads.set(ref.id, this.api.conversation(ref.id).then((msgs) => {
        const r = this.refs.find((x) => x.id === ref.id);
        if (r) Object.assign(r, summarize(msgs));
      }).catch(() => {}));
    }
    this.renderChips();
    const chip = this.el.querySelector(`.cp-refchip[data-ref="${CSS.escape(ref.id)}"]`) as HTMLElement | null;
    if (chip && state === "dup") gsap.fromTo(chip, { backgroundColor: "rgba(255, 159, 90, 0.35)" }, { backgroundColor: "rgba(255, 255, 255, 0.07)", duration: 0.8, clearProps: "backgroundColor" });
    if (state === "own") this.note("That is this robot's own thread, so there is nothing to reference.");
    (this.el.querySelector("textarea") as HTMLTextAreaElement).focus({ preventScroll: true });
    return chip;
  }

  private removeChip(chip: HTMLElement) {
    const rm = chip.querySelector("[data-rm], [data-rmref]") as HTMLElement | null;
    if (!rm) return;
    gsap.to(chip, { opacity: 0, scale: 0.9, duration: 0.14, onComplete: () => {
      if (rm.dataset.rmref != null) { const r = this.refs.splice(Number(rm.dataset.rmref), 1)[0]; if (r) this.refLoads.delete(r.id); }
      else this.files.splice(Number(rm.dataset.rm), 1);
      this.renderChips();
    } });
  }

  // --- folding the chat into a tab on the right edge ------------------------------------
  collapsed = false;
  /** The chat was folded into its edge tab, or opened again from it. The page animates the column. */
  onCollapse: (collapsed: boolean, animate: boolean) => void = () => {};
  /** The width the chat takes when it is open (the page owns it: you drag it wider or narrower). */
  wide: () => number = () => 440;
  private tab!: HTMLButtonElement;
  private tabLabel = "Chat";

  setCollapsed(on: boolean, animate = true) {
    if (on === this.collapsed) return;
    this.collapsed = on;
    const el = this.el, tab = this.tab;
    const still = !animate || matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.querySelectorAll(".cp-hide").forEach((b) => b.setAttribute("aria-expanded", String(!on)));
    tab.setAttribute("aria-expanded", String(!on));
    gsap.killTweensOf([el, tab]);
    this.closeMenu();
    const hadFocus = !!document.activeElement && (el.contains(document.activeElement) || document.activeElement === tab);
    // while the column narrows or widens, the panel keeps its width and is clipped by the window edge
    const pin = (w: number) => { el.style.width = `${w}px`; el.style.justifySelf = "start"; };
    const unpin = () => { el.style.width = ""; el.style.justifySelf = ""; };
    if (on) {
      const w = el.offsetWidth || this.wide();
      const done = () => { unpin(); el.classList.add("tabbed"); gsap.set(el, { clearProps: "opacity" }); tab.hidden = false; if (hadFocus) tab.focus({ preventScroll: true }); if (!still) gsap.fromTo(tab, { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.24, ease: "power3.out", clearProps: "x,opacity" }); };
      if (still) done();
      else { pin(w); gsap.to(el, { opacity: 0, duration: 0.26, ease: "power2.in", onComplete: done }); }
    } else {
      // the tab steps aside and the panel comes back out of the right edge
      tab.hidden = true;
      el.classList.remove("tabbed");
      if (!still) { pin(this.wide()); gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out", delay: 0.08, onComplete: unpin }); }
      if (hadFocus) (el.querySelector(this.isOpen ? "textarea" : ".cp-hide") as HTMLElement).focus({ preventScroll: true });
    }
    this.onCollapse(on, !still);
  }

  constructor(host: HTMLElement, private api: Api) {
    this.el = document.createElement("aside");
    this.el.className = "chat-panel";
    this.el.setAttribute("aria-label", "Chat with this robot");
    this.el.innerHTML = `
      <div class="cp-empty">
        <p><b>No robot selected</b></p>
        <p>Click a robot or its desk, or a thread in the sidebar, to chat with it here.</p>
        <button type="button" class="cp-hide ghost" aria-expanded="true" title="Hide the chat for more room. It stays as a tab on the right edge.">Hide chat</button>
      </div>
      <header class="cp-head">
        <img class="cp-logo" alt="">
        <div class="cp-who"><b></b><span></span></div>
        <button type="button" class="cp-view ghost"></button>
        <button type="button" class="cp-hide ghost" aria-expanded="true" title="Hide the chat for more room. It stays as a tab on the right edge.">Hide chat</button>
        <button type="button" class="cp-close" aria-label="Back to the office" title="Back to the office (Esc)"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </header>
      <p class="cp-status" aria-live="polite"><i></i><span></span></p>
      <div class="cp-list" role="log" aria-live="polite"></div>
      <section class="cp-queue" aria-label="Queued messages" hidden><button type="button" class="cq-head" aria-expanded="true"><b>Queued</b><span class="cq-count"></span><i aria-hidden="true"></i></button><p class="cq-note" role="status" hidden></p><ol></ol></section>
      <div class="cp-zoom" hidden><img alt=""><button type="button" class="ghost">Close image</button></div>
      <form class="cp-form">
        <div class="cp-model" role="group" aria-label="Harness and model for this thread" hidden>
          <button type="button" class="cm-pick cm-harness" aria-haspopup="listbox" aria-expanded="false" title="Harness"><img alt="" hidden><span></span>${CHEVRON}</button>
          <button type="button" class="cm-pick cm-modelname" aria-haspopup="listbox" aria-expanded="false" title="Model"><span></span>${CHEVRON}</button>
          <button type="button" class="cm-pick cm-effort" aria-haspopup="listbox" aria-expanded="false" title="Reasoning effort" hidden><span class="cm-k">Effort</span><span class="cm-v"></span>${CHEVRON}</button>
          <button type="button" class="cm-fast" role="switch" aria-checked="false" title="Fast mode" hidden><i aria-hidden="true"></i><span>Fast</span></button>
          <span class="cm-note" aria-live="polite"></span>
        </div>
        <p class="cm-error" role="alert" hidden></p>
        <p class="cp-connect" hidden><span>Connect Lucid to T3 to change models and reorder</span><button type="button" class="ghost">Connect</button></p>
        <div class="cp-box">
          <div class="cp-chips" hidden></div>
          <textarea rows="1" placeholder="Message this robot" aria-label="Message"></textarea>
          <div class="cp-tools">
            <button type="button" class="cp-attach" aria-label="Attach files or images" title="Attach files or images (you can also paste or drop them)"><svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M13.5 6.5l-5.6 5.6a1.6 1.6 0 0 0 2.3 2.3l6-6a3.2 3.2 0 0 0-4.5-4.5l-6.2 6.2a4.8 4.8 0 0 0 6.8 6.8l5-5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <span class="cp-hint">${HINT}</span>
            <button type="submit" class="cp-send" aria-label="Send"><span>Send</span><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
          <input type="file" class="cp-fileinput" multiple hidden>
        </div>
        <div class="cp-drop" hidden>Drop to attach</div>
      </form>`;
    host.appendChild(this.el);
    // folded, the chat is a tab on the right edge with the robot's name
    this.tab = document.createElement("button");
    this.tab.type = "button";
    this.tab.className = "cp-tab";
    this.tab.hidden = true;
    this.tab.setAttribute("aria-expanded", "false");
    this.tab.setAttribute("aria-label", "Show chat");
    this.tab.title = "Show the chat";
    this.tab.innerHTML = `<img alt="" hidden><span>Chat</span><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    host.appendChild(this.tab);
    this.tab.addEventListener("click", () => this.setCollapsed(false));
    this.el.querySelectorAll(".cp-hide").forEach((b) => b.addEventListener("click", () => this.setCollapsed(true)));
    this.el.querySelector(".cp-close")!.addEventListener("click", () => this.onClose());
    this.el.querySelector(".cp-view")!.addEventListener("click", () => this.onToggleView());
    const form = this.el.querySelector(".cp-form") as HTMLFormElement;
    const ta = form.querySelector("textarea")!;
    // the box grows with what you type, up to about 40% of the panel, then scrolls
    const grow = () => {
      ta.style.height = "auto";
      const max = Math.max(120, this.el.clientHeight * 0.4);
      ta.style.height = `${Math.min(max, ta.scrollHeight)}px`;
      ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
    };
    ta.addEventListener("input", grow);
    // let the robot know you are typing (and when you stop)
    let typingTimer = 0, typingOn = false;
    const setTyping = (on: boolean) => { if (on !== typingOn) { typingOn = on; this.onTyping(on); } };
    ta.addEventListener("input", () => {
      window.clearTimeout(typingTimer);
      if (!ta.value.trim()) { setTyping(false); return; }
      setTyping(true);
      typingTimer = window.setTimeout(() => setTyping(false), 6000);
    });
    form.addEventListener("submit", () => { window.clearTimeout(typingTimer); typingOn = false; }, true);
    // attachments: the paperclip, pasting, or dropping files onto the panel
    const fileInput = form.querySelector(".cp-fileinput") as HTMLInputElement;
    form.querySelector(".cp-attach")!.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => { this.addFiles([...(fileInput.files ?? [])]); fileInput.value = ""; });
    ta.addEventListener("paste", (e) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) { e.preventDefault(); this.addFiles(files); }
    });
    const drop = form.querySelector(".cp-drop") as HTMLElement;
    let depth = 0;
    this.el.addEventListener("dragenter", (e) => { if (e.dataTransfer?.types.includes("Files")) { depth++; drop.hidden = false; } });
    this.el.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; drop.hidden = true; } });
    this.el.addEventListener("dragover", (e) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); });
    this.el.addEventListener("drop", (e) => {
      e.preventDefault(); depth = 0; drop.hidden = true;
      this.addFiles([...(e.dataTransfer?.files ?? [])]);
    });
    const chips = form.querySelector(".cp-chips") as HTMLElement;
    chips.addEventListener("click", (e) => {
      const x = (e.target as HTMLElement).closest("[data-rm], [data-rmref]") as HTMLElement | null;
      if (!x) return;
      const chip = x.closest(".cp-chip") as HTMLElement;
      const all = [...chips.querySelectorAll(".cp-chip:not(.preview)")];
      const i = all.indexOf(chip);
      this.removeChip(chip);
      // keep the keyboard nearby: the next chip's remove button, or the message box
      window.setTimeout(() => ((chips.querySelectorAll(".cp-chip:not(.preview) button")[Math.max(0, i - 1)] as HTMLElement | undefined) ?? ta).focus(), 170);
    });
    // Backspace or Delete on a chip's remove button removes it, like the x
    chips.addEventListener("keydown", (e) => {
      if ((e.key === "Backspace" || e.key === "Delete") && (e.target as HTMLElement).closest("[data-rm], [data-rmref]")) { e.preventDefault(); (e.target as HTMLElement).click(); }
    });
    // Backspace at the very start of the box removes the chip just before it
    ta.addEventListener("keydown", (e) => {
      if (e.key !== "Backspace" || ta.selectionStart !== 0 || ta.selectionEnd !== 0) return;
      const last = [...chips.querySelectorAll(".cp-chip:not(.preview)")].pop() as HTMLElement | undefined;
      if (last) { e.preventDefault(); this.removeChip(last); }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const typed = ta.value.trim();
      if ((!typed && !this.files.length && !this.refs.length) || !this.desk?.threadId) return;
      ta.disabled = true;
      const files = [...this.files];
      const refs = [...this.refs];
      try {
        // files are saved where the agent can open them, and listed in the message
        const saved: { path: string; image: boolean }[] = [];
        for (const f of files) saved.push({ path: await this.api.saveAttachment(f.name, new Uint8Array(await f.arrayBuffer())), image: f.type.startsWith("image/") });
        // referenced threads go along as short blocks the agent can read and look up by id
        await Promise.all(refs.map((r) => this.refLoads.get(r.id)));
        let text = typed || (saved.length ? "Have a look at the attached files." : refs.length > 1 ? "Have a look at these threads." : refs.length ? "Have a look at this thread." : "");
        if (refs.length) text += `\n\n${refs.map((r) => refBlock(this.refs.find((x) => x.id === r.id) ?? r, harnessName(r.provider))).join("\n\n")}`;
        if (saved.length) text += `\n\nAttached:\n${saved.map((s) => `- ${s.image ? "image" : "file"}: ${s.path}`).join("\n")}`;
        // show it right away; it turns into the real message once T3 has it
        this.pending.push({ text, at: Date.now() });
        this.renderPending();
        await this.api.sendMessage({ threadId: this.desk.threadId, message: text });
        ta.value = "";
        this.files = [];
        this.refs = this.refs.filter((r) => !refs.some((x) => x.id === r.id));
        this.renderChips();
        grow();
        this.refreshSoon(300);
      } catch (err: any) {
        this.pending = this.pending.filter((p) => !p.text.startsWith(typed));
        this.renderPending();
        this.note(`Could not send: ${err.message || err}. Your text is still here.`);
      } finally { ta.disabled = false; ta.focus(); }
    });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    this.el.querySelector(".cp-list")!.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const img = t.closest(".cp-att img") as HTMLImageElement | null;
      if (img) this.zoom(img.src);
      // copy a code block
      const copy = t.closest(".md-copy") as HTMLButtonElement | null;
      if (copy) {
        const code = copy.closest(".md-code")?.querySelector("pre")?.textContent ?? "";
        void navigator.clipboard.writeText(code).then(() => { copy.textContent = "Copied"; window.setTimeout(() => (copy.textContent = "Copy"), 1400); });
      }
    });
    const zoom = this.el.querySelector(".cp-zoom") as HTMLElement;
    zoom.querySelector("button")!.addEventListener("click", () => (zoom.hidden = true));
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !zoom.hidden) { e.stopImmediatePropagation(); zoom.hidden = true; } }, true);
    this.wireT3();
  }

  get isOpen() { return this.el.classList.contains("open"); }
  get threadId() { return this.desk?.threadId ?? null; }

  open(desk: Desk) {
    const same = this.desk === desk;
    this.desk = desk;
    if (!same) {
      this.shown.clear(); (this.el.querySelector(".cp-list") as HTMLElement).innerHTML = "";
      this.sel = null; this.queueHold = 0; this.closeMenu();
      (this.el.querySelector(".cp-queue ol") as HTMLElement).dataset.sig = "";
      void this.loadT3();
    }
    const info = desk.info, logo = logoFor(info?.provider);
    const img = this.el.querySelector(".cp-logo") as HTMLImageElement;
    img.hidden = !logo;
    if (logo) img.src = logo;
    this.el.querySelector(".cp-who b")!.textContent = desk.profile?.name ? `${desk.profile.name}` : `${harnessName(info?.provider)} robot`;
    this.el.querySelector(".cp-who span")!.textContent = info?.title || "";
    this.tabLabel = `Chat with ${this.el.querySelector(".cp-who b")!.textContent}`;
    (this.tab.querySelector("span") as HTMLElement).textContent = this.tabLabel;
    this.tab.setAttribute("aria-label", `Show ${this.tabLabel.replace(/^Chat/, "chat")}`);
    this.tab.title = `Show the chat. ${info?.title || ""}`.trim();
    const tabLogo = this.tab.querySelector("img") as HTMLImageElement;
    tabLogo.hidden = !logo;
    if (logo) tabLogo.src = logo;
    if (!this.isOpen) {
      this.el.classList.add("open");
      // the empty panel becomes this robot's chat: its parts settle in one after another
      if (!this.collapsed) gsap.from([...this.el.children].filter((c) => !c.classList.contains("cp-empty")), { opacity: 0, y: 8, duration: 0.32, ease: "power2.out", stagger: 0.04, clearProps: "opacity,y" });
    }
    this.refresh();
    (this.el.querySelector("textarea") as HTMLTextAreaElement).focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove("open");
    this.closeMenu();
    this.desk = null;
    this.tabLabel = "Chat";
    (this.tab.querySelector("span") as HTMLElement).textContent = "Chat";
    this.tab.setAttribute("aria-label", "Show chat");
    this.tab.title = "Show the chat";
    const empty = this.el.querySelector(".cp-empty") as HTMLElement;
    gsap.fromTo(empty, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out", clearProps: "opacity" });
  }

  setView(mode: "desk" | "screen") {
    (this.el.querySelector(".cp-view") as HTMLElement).textContent = mode === "desk" ? "Look at the screen" : "Back to the desk";
  }

  // What the robot is doing right now, in plain words.
  setStatus(text: string, state: "working" | "idle" | "waiting") {
    const p = this.el.querySelector(".cp-status") as HTMLElement;
    p.dataset.state = state;
    const send = this.el.querySelector(".cp-send span") as HTMLElement;
    send.textContent = state === "working" ? "Queue" : "Send";
    (send.parentElement as HTMLElement).title = state === "working" ? "It is busy: your message waits in the queue and comes next" : "Send";
    const span = p.querySelector("span")!;
    if (span.textContent !== text) { span.textContent = text; gsap.fromTo(span, { opacity: 0.3 }, { opacity: 1, duration: 0.3 }); }
  }

  // "Bolt is typing" with bouncing dots, at the bottom of the conversation
  private typingOn = false;
  setTyping(on: boolean, who = "It") {
    const list = this.el.querySelector(".cp-list") as HTMLElement;
    let t = list.querySelector(".cp-typing") as HTMLElement | null;
    if (on === this.typingOn && (!on || t)) { if (t) list.appendChild(t); return; }
    this.typingOn = on;
    if (on) {
      if (!t) {
        t = document.createElement("div");
        t.className = "cp-typing";
        t.setAttribute("role", "status");
        t.innerHTML = `<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="who"></span>`;
      }
      (t.querySelector(".who") as HTMLElement).textContent = `${who} is typing`;
      list.appendChild(t);
      gsap.fromTo(t, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25 });
      const near = list.scrollHeight - list.scrollTop - list.clientHeight < 140;
      if (near) list.scrollTop = list.scrollHeight;
    } else if (t) {
      gsap.to(t, { opacity: 0, duration: 0.2, onComplete: () => t!.remove() });
    }
  }

  private renderPending() {
    const list = this.el.querySelector(".cp-list") as HTMLElement;
    list.querySelectorAll(".cp-msg.pending").forEach((e) => e.remove());
    for (const p of this.pending) {
      const el = document.createElement("div");
      el.className = "cp-msg you pending";
      const view = this.render({ id: "pending", role: "user", at: new Date().toISOString(), streaming: false, text: p.text, attachments: [] });
      el.innerHTML = view.replace(/<time>[^<]*<\/time>$/, "<time>Sending</time>");
      list.appendChild(el);
    }
    list.scrollTop = list.scrollHeight;
  }

  // Called when new events arrive for a thread.
  ping(threadId: string) { if (this.isOpen && threadId === this.threadId) this.refreshSoon(500); }

  private refreshSoon(ms: number) {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.refresh(), ms);
  }

  private async refresh() {
    const id = this.threadId;
    if (!id) return;
    const msgs = await this.api.conversation(id).catch(() => [] as Msg[]);
    if (id !== this.threadId) return;
    // the thread's model can change elsewhere too (T3 itself); check now and then
    if (this.paired && !this.saving && Date.now() - this.selAt > 4000) void this.loadSelection();
    const list = this.el.querySelector(".cp-list") as HTMLElement;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    let added = 0;
    // Queued messages wait in their own section at the bottom, in the order the robot takes them.
    const queued = msgs.filter((m) => m.role === "user" && m.run === "queued").sort((a, b) => (a.queue ?? 99) - (b.queue ?? 99));
    const timeline = msgs.filter((m) => !(m.role === "user" && m.run === "queued"));
    this.renderQueue(queued);
    for (const id of [...this.shown.keys()]) {
      if (!timeline.some((m) => m.id === id)) { this.shown.get(id)!.remove(); this.shown.delete(id); }
    }
    list.querySelector(".cp-empty")?.remove();
    let prevEl: HTMLElement | null = null;
    for (const m of timeline) {
      let el = this.shown.get(m.id);
      const html = this.render(m);
      if (!el) {
        el = document.createElement("div");
        el.className = `cp-msg ${m.role === "user" ? "you" : "bot"}`;
        el.innerHTML = html;
        this.shown.set(m.id, el);
        if (this.shown.size > msgs.length - 6) gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", delay: added++ * 0.05 });
      } else if (el.dataset.sig !== `${m.text.length}:${m.streaming}:${m.run}`) {
        el.innerHTML = html;
      }
      el.dataset.sig = `${m.text.length}:${m.streaming}:${m.run}`;
      // very long messages of yours fold, with a toggle to read them in full
      if (m.role === "user" && m.text.length > 700 && !el.querySelector(".cp-more")) {
        el.classList.add("long");
        const more = document.createElement("button");
        more.type = "button"; more.className = "cp-more"; more.textContent = "Show all";
        more.addEventListener("click", () => { const open = el!.classList.toggle("open"); more.textContent = open ? "Show less" : "Show all"; });
        el.appendChild(more);
      }
      // keep every message in conversation order, also ones that were already on screen
      const want: Element | null = prevEl ? prevEl.nextElementSibling : list.firstElementChild;
      if (want !== el) list.insertBefore(el, want);
      prevEl = el;
    }
    // pending bubbles disappear once the real message shows up
    const texts = new Set(msgs.filter((m) => m.role === "user").map((m) => m.text.trim()));
    list.querySelectorAll(".cp-msg.pending").forEach((e) => list.appendChild(e));
    const typing = list.querySelector(".cp-typing");
    if (typing) list.appendChild(typing);
    this.pending = this.pending.filter((p) => !texts.has(p.text) && Date.now() - p.at < 60000);
    this.renderPending();
    if (!list.children.length) list.innerHTML = `<p class="cp-empty">No messages yet. Say hello.</p>`;
    else list.querySelector(".cp-empty")?.remove();
    if (nearBottom || added) list.scrollTop = list.scrollHeight;
  }

  private render(m: Msg) {
    let body = m.text;
    const sent: string[] = [];
    const at = m.role === "user" ? body.match(/\n*Attached:\n((?:- (?:image|file): .+(?:\n|$))+)\s*$/) : null;
    if (at) {
      body = body.slice(0, at.index).trim();
      for (const line of at[1].trim().split("\n")) {
        const mm = line.match(/^- (image|file): (.+)$/);
        if (!mm) continue;
        const p = mm[2].trim(), name = p.split(/[\\/]/).pop()!.replace(/^\d+-/, "");
        sent.push(mm[1] === "image" ? `<figure class="cp-att"><img src="${fileUrl(p)}" alt="${esc(name)}" loading="lazy"></figure>`
          : `<div class="cp-file" title="${esc(p)}"><span>${esc(name)}</span><i>file</i></div>`);
      }
    }
    // threads you referenced show as small chips, not as the block the agent reads
    if (m.role === "user" && body.includes("<referenced_thread ")) {
      const rr = stripRefs(body);
      body = rr.body;
      for (const r of rr.refs.reverse()) {
        const logo = logoFor(r.harness);
        sent.unshift(`<div class="cp-file cp-reffile" title="${esc(`${r.title}, ${r.project}`)}">${logo ? `<img src="${logo}" alt="">` : ""}<span>${esc(r.title)}</span><i>${esc(r.project)}</i></div>`);
      }
    }
    m = { ...m, text: body };
    const atts = sent.join("") + m.attachments.map((a) => {
      if (a.type === "image" && a.path) return `<figure class="cp-att"><img src="${fileUrl(a.path)}" alt="${esc(a.name)}" loading="lazy"></figure>`;
      return `<div class="cp-file" title="${esc(a.name)}"><span>${esc(a.name)}</span><i>${Math.max(1, Math.round((a.size || 0) / 1024))} KB</i></div>`;
    }).join("");
    const state = m.role === "user" && m.run === "running" ? `<em class="cp-live">It is working on this</em>` : "";
    return `${atts ? `<div class="cp-atts">${atts}</div>` : ""}${m.text ? `<div class="cp-text">${md(m.text)}${m.streaming ? '<span class="caret"></span>' : ""}</div>` : ""}${state}<time>${when(m.at)}</time>`;
  }

  private renderQueue(queued: Msg[]) {
    const box = this.el.querySelector(".cp-queue") as HTMLElement;
    const ol = box.querySelector("ol") as HTMLOListElement;
    box.hidden = !queued.length;
    (box.querySelector(".cq-count") as HTMLElement).textContent = `${queued.length} waiting`;
    if (!box.dataset.wired) {
      box.dataset.wired = "1";
      const head = box.querySelector(".cq-head") as HTMLButtonElement;
      head.addEventListener("click", () => {
        const open = head.getAttribute("aria-expanded") !== "true";
        head.setAttribute("aria-expanded", String(open));
        box.classList.toggle("folded", !open);
      });
    }
    this.queueLatest = queued;
    // never replace rows while you drag, edit or confirm; the latest state lands afterwards
    if (this.queueHold > 0) return;
    const live = this.canAct();
    const sig = `${live}|` + queued.map((m) => `${m.id}:${m.text.length}:${m.text.slice(0, 40)}:${m.steerTarget ? 1 : 0}`).join(",");
    if (ol.dataset.sig === sig) return;
    ol.dataset.sig = sig;
    box.classList.toggle("can-act", live);
    // keep rows that are already there (and focus inside them); only new rows fade in
    const old = new Map([...ol.children].map((li) => [(li as HTMLElement).dataset.id!, li as HTMLElement]));
    const fresh: HTMLElement[] = [];
    const rows = queued.map((m) => {
      let li = old.get(m.id);
      if (!li) { li = document.createElement("li"); fresh.push(li); }
      old.delete(m.id);
      this.fillQueueRow(li, m, live);
      return li;
    });
    for (const li of old.values()) li.remove();
    rows.forEach((li, i) => { if (ol.children[i] !== li) ol.insertBefore(li, ol.children[i] ?? null); });
    this.numberQueue();
    if (fresh.length) gsap.fromTo(fresh, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.04 });
  }

  private fillQueueRow(li: HTMLElement, m: Msg, live: boolean) {
    // rebuild only when something it shows changed, so focus inside the row survives updates
    const sig = `${live}:${m.queueRunId}:${m.queueFixed}:${m.queueGuest}:${!!m.steerTarget}:${m.text}`;
    if (li.dataset.sig === sig) return;
    li.dataset.sig = sig;
    li.dataset.id = m.id;
    li.dataset.run = m.queueRunId ?? "";
    li.classList.toggle("fixed", !!m.queueFixed);
    const movable = live && !!m.queueRunId && !m.queueFixed;
    const btn = (act: string, label: string, icon: string, show = true) =>
      `<button type="button" class="cq-act" data-act="${act}" aria-label="${label}" title="${label}"${show ? "" : " disabled"}>${icon}</button>`;
    li.innerHTML = `${movable ? `<button type="button" class="cq-grip" aria-label="Reorder: drag, or use the arrow keys" title="Drag to reorder">${ICON.grip}</button>` : live ? `<span class="cq-grip-gap"></span>` : ""}`
      + `<span class="cq-n"></span><p></p>`
      + (movable ? `<span class="cq-acts">${btn("up", "Move up", ICON.up)}${btn("down", "Move down", ICON.down)}`
        + btn("edit", m.queueGuest ? "A guest's message cannot be edited" : "Edit", ICON.edit, !m.queueGuest)
        + btn("steer", m.steerTarget ? "Send now, into the current turn" : "Send now works while it is working", ICON.steer, !!m.steerTarget)
        + btn("cancel", "Remove from the queue", ICON.remove) + `</span>` : live ? `<span></span>` : "");
    const p = li.querySelector("p")!;
    const rr = m.text.includes("<referenced_thread ") ? stripRefs(m.text) : null;
    p.textContent = rr ? `${rr.body} (references ${rr.refs.map((r) => r.title).join(", ")})` : m.text;
    p.title = p.textContent;
  }

  // "next", "2nd", ... and which arrows make sense, after any change of order
  private numberQueue() {
    const ol = this.el.querySelector(".cp-queue ol") as HTMLElement;
    const items = [...ol.children] as HTMLElement[];
    const first = items.findIndex((li) => !li.classList.contains("fixed"));
    items.forEach((li, i) => {
      const n = i + 1;
      (li.querySelector(".cq-n") as HTMLElement).textContent = ordLabel(n);
      const up = li.querySelector('[data-act="up"]') as HTMLButtonElement | null;
      const down = li.querySelector('[data-act="down"]') as HTMLButtonElement | null;
      if (up) up.disabled = i <= first;
      if (down) down.disabled = i === items.length - 1;
    });
  }

  // --- T3 session: pairing, model bar, queue actions -----------------------------

  private canAct() { return !!this.api.t3 && this.paired; }

  private async loadT3(connect = !this.triedConnect) {
    const t3 = this.api.t3, id = this.threadId;
    if (!t3 || !id) return;
    this.triedConnect = true;
    let st: Awaited<ReturnType<T3Api["status"]>>;
    try { st = await t3.status({ connect, threadId: id }); } catch { return; }
    if (id !== this.threadId) return;
    this.paired = st.paired;
    this.sel = st.selection; this.selAt = Date.now();
    this.renderBar();
    this.refreshSoon(0); // queue rows gain or lose their actions
    if (this.paired && !this.providers) {
      try { this.providers = await t3.providers(); } catch (err: any) { this.failed(err); }
      if (id === this.threadId) this.renderBar();
    }
  }

  private async loadSelection() {
    const t3 = this.api.t3, id = this.threadId;
    if (!t3 || !id) return;
    this.selAt = Date.now();
    try {
      const st = await t3.status({ threadId: id });
      if (id !== this.threadId || this.saving || JSON.stringify(st.selection) === JSON.stringify(this.sel)) return;
      this.sel = st.selection;
      this.renderBar();
    } catch {}
  }

  // An action failed: say why. If T3 dropped the session, offer to connect again.
  private failed(err: any, where?: "queue" | "bar") {
    const code = err?.code as string | undefined;
    if (code === "unauthorized" || code === "pair-failed") {
      this.paired = false;
      this.renderBar();
      (this.el.querySelector(".cp-queue ol") as HTMLElement).dataset.sig = "";
      this.refreshSoon(0);
    }
    const text = String(err?.message || err || "T3 did not answer.");
    if (where === "queue") this.queueNote(text);
    else {
      const p = this.el.querySelector(".cm-error") as HTMLElement;
      p.textContent = text;
      p.classList.remove("calm");
      p.setAttribute("role", "alert");
      p.hidden = false;
      window.clearTimeout(Number(p.dataset.t));
      p.dataset.t = String(window.setTimeout(() => (p.hidden = true), 6000));
    }
  }

  // a calm note under the model bar
  private hint(text: string) {
    const p = this.el.querySelector(".cm-error") as HTMLElement;
    p.textContent = text;
    p.classList.add("calm");
    p.setAttribute("role", "status");
    p.hidden = false;
    window.clearTimeout(Number(p.dataset.t));
    p.dataset.t = String(window.setTimeout(() => (p.hidden = true), 7000));
  }

  private queueNote(text: string) {
    const p = this.el.querySelector(".cq-note") as HTMLElement;
    p.textContent = text;
    p.hidden = false;
    window.clearTimeout(Number(p.dataset.t));
    p.dataset.t = String(window.setTimeout(() => (p.hidden = true), 6000));
  }

  private renderBar() {
    const bar = this.el.querySelector(".cp-model") as HTMLElement;
    const connect = this.el.querySelector(".cp-connect") as HTMLElement;
    const has = !!this.api.t3 && !!this.threadId;
    connect.hidden = !has || this.paired;
    bar.hidden = !has || !this.paired || !this.sel;
    if (bar.hidden) return;
    const sel = this.sel!;
    const prov = this.providers?.find((p) => p.instanceId === sel.providerInstanceId);
    const model = prov?.models.find((m) => m.slug === sel.model);
    const loading = !this.providers;
    // harness
    const hb = bar.querySelector(".cm-harness") as HTMLButtonElement;
    const logo = logoFor(prov?.driver || sel.providerInstanceId);
    const img = hb.querySelector("img") as HTMLImageElement;
    img.hidden = !logo;
    if (logo) img.src = logo;
    (hb.querySelector("span") as HTMLElement).textContent = prov?.name || harnessName(sel.providerInstanceId);
    hb.disabled = loading;
    // model
    const mb = bar.querySelector(".cm-modelname") as HTMLButtonElement;
    (mb.querySelector("span") as HTMLElement).textContent = model?.shortName || model?.name || sel.model || "Default model";
    mb.title = model ? `Model: ${model.name}` : "Model";
    mb.disabled = loading || !prov;
    // effort
    const eo = effortOption(model);
    const eb = bar.querySelector(".cm-effort") as HTMLButtonElement;
    eb.hidden = !eo;
    if (eo) {
      const v = sel.options[eo.id] ?? defaultOf(eo);
      (eb.querySelector(".cm-v") as HTMLElement).textContent = eo.choices?.find((c) => c.id === v)?.label ?? String(v ?? "Default");
      eb.title = eo.label || "Reasoning effort";
      eb.disabled = loading;
    }
    // speed
    const sp = speedOption(model);
    const fb = bar.querySelector(".cm-fast") as HTMLButtonElement;
    fb.hidden = !sp;
    if (sp) {
      const on = (sel.options[sp.opt.id] ?? defaultOf(sp.opt)) === sp.on;
      fb.setAttribute("aria-checked", String(on));
      fb.title = on ? "Fast mode is on" : "Fast mode is off";
      fb.disabled = loading;
    }
  }

  private async applyModel(next: Selection) {
    const t3 = this.api.t3, id = this.threadId;
    if (!t3 || !id || !next.model) return;
    const prev = this.sel;
    this.sel = next; // show it right away
    this.renderBar();
    const note = this.el.querySelector(".cm-note") as HTMLElement;
    note.textContent = "Saving";
    this.saving++;
    try {
      await t3.setModel({ threadId: id, selection: { providerInstanceId: next.providerInstanceId, model: next.model, options: next.options } });
      if (id === this.threadId) {
        note.textContent = "Saved";
        // T3 runs each queued message with the model it was queued with, and switches the
        // thread back to that model when it starts, so say so instead of looking forgetful
        const waiting = this.queueLatest.filter((m) => !m.queueFixed).length;
        if (waiting) this.hint(`New messages use this. ${waiting === 1 ? "The queued message keeps" : `The ${waiting} queued messages keep`} the model ${waiting === 1 ? "it was" : "they were"} queued with.`);
      }
    } catch (err: any) {
      if (id === this.threadId) { this.sel = prev; this.renderBar(); note.textContent = ""; this.failed(err, "bar"); }
    } finally {
      this.saving--;
      this.selAt = Date.now();
      window.clearTimeout(Number(note.dataset.t));
      note.dataset.t = String(window.setTimeout(() => { if (note.textContent === "Saved") note.textContent = ""; }, 2400));
    }
  }

  // A small listbox that opens above its button, inside the panel.
  private openMenu(anchor: HTMLButtonElement, items: { value: string; label: string; logo?: string | null; selected: boolean; hint?: string }[], pick: (v: string) => void) {
    const wasOpen = anchor.getAttribute("aria-expanded") === "true";
    this.closeMenu();
    if (wasOpen) return;
    const menu = document.createElement("div");
    menu.className = "cm-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", anchor.title || "Choose");
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(it.selected));
      b.dataset.value = it.value;
      b.innerHTML = `${it.logo ? `<img src="${it.logo}" alt="">` : ""}<span></span>${it.selected ? ICON.check : ""}`;
      (b.querySelector("span") as HTMLElement).textContent = it.label;
      if (it.hint) b.title = it.hint;
      menu.appendChild(b);
    }
    this.el.appendChild(menu);
    // The panel is the menu's containing block. Re-anchor when resizing either panel
    // moves the button, or when the model controls wrap onto another line.
    const position = () => {
      const pr = this.el.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
      menu.style.maxHeight = `${Math.max(0, ar.top - pr.top - 16)}px`;
      menu.style.bottom = `${pr.bottom - ar.top + 6}px`;
      menu.style.left = `${Math.max(8, Math.min(ar.left - pr.left, pr.width - menu.offsetWidth - 8))}px`;
    };
    position();
    const resize = new ResizeObserver(position);
    resize.observe(this.el);
    resize.observe(this.el.querySelector(".cp-model")!);
    anchor.setAttribute("aria-expanded", "true");
    const opts = [...menu.children] as HTMLButtonElement[];
    (opts.find((o) => o.getAttribute("aria-selected") === "true") ?? opts[0])?.focus();
    gsap.fromTo(menu, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.14 });
    const done = (refocus: boolean) => {
      resize.disconnect();
      menu.remove();
      anchor.setAttribute("aria-expanded", "false");
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      this.menuClose = null;
      if (refocus) anchor.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); done(true); return; }
      if (e.key === "Tab") { done(false); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const i = opts.indexOf(document.activeElement as HTMLButtonElement);
      const n = e.key === "Home" ? 0 : e.key === "End" ? opts.length - 1 : Math.max(0, Math.min(opts.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
      opts[n]?.focus();
    };
    const onDown = (e: PointerEvent) => { if (!menu.contains(e.target as Node) && e.target !== anchor && !anchor.contains(e.target as Node)) done(false); };
    menu.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[role=option]") as HTMLButtonElement | null;
      if (!b) return;
      done(true);
      pick(b.dataset.value!);
    });
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    this.menuClose = () => done(false);
  }

  private closeMenu() { this.menuClose?.(); }

  private wireT3() {
    const bar = this.el.querySelector(".cp-model") as HTMLElement;
    const current = () => {
      const sel = this.sel!;
      const prov = this.providers?.find((p) => p.instanceId === sel.providerInstanceId);
      return { sel, prov, model: prov?.models.find((m) => m.slug === sel.model) };
    };
    bar.querySelector(".cm-harness")!.addEventListener("click", (e) => {
      if (!this.providers || !this.sel) return;
      const { sel } = current();
      this.openMenu(e.currentTarget as HTMLButtonElement,
        this.providers.map((p) => ({ value: p.instanceId, label: p.name, logo: logoFor(p.driver || p.instanceId), selected: p.instanceId === sel.providerInstanceId, hint: p.ready ? undefined : "Not ready in T3 right now" })),
        (v) => {
          if (v === sel.providerInstanceId) return;
          const p = this.providers!.find((x) => x.instanceId === v)!;
          const m = p.models.find((x) => x.isDefault) ?? p.models[0];
          if (!m) return this.failed(new Error(`${p.name} has no models to choose from.`), "bar");
          void this.applyModel({ providerInstanceId: v, model: m.slug, options: carryOptions(m, sel.options) });
        });
    });
    bar.querySelector(".cm-modelname")!.addEventListener("click", (e) => {
      const { sel, prov } = current();
      if (!prov) return;
      this.openMenu(e.currentTarget as HTMLButtonElement,
        prov.models.map((m) => ({ value: m.slug, label: m.name, selected: m.slug === sel.model, hint: m.slug })),
        (v) => { if (v !== sel.model) void this.applyModel({ ...sel, model: v, options: carryOptions(prov.models.find((m) => m.slug === v), sel.options) }); });
    });
    bar.querySelector(".cm-effort")!.addEventListener("click", (e) => {
      const { sel, model } = current();
      const eo = effortOption(model);
      if (!eo) return;
      const v = sel.options[eo.id] ?? defaultOf(eo);
      this.openMenu(e.currentTarget as HTMLButtonElement,
        (eo.choices ?? []).map((c) => ({ value: c.id, label: c.label, selected: c.id === v })),
        (nv) => { if (nv !== v) void this.applyModel({ ...sel, options: { ...sel.options, [eo.id]: nv } }); });
    });
    bar.querySelector(".cm-fast")!.addEventListener("click", () => {
      const { sel, model } = current();
      const sp = speedOption(model);
      if (!sp) return;
      const on = (sel.options[sp.opt.id] ?? defaultOf(sp.opt)) === sp.on;
      void this.applyModel({ ...sel, options: { ...sel.options, [sp.opt.id]: on ? sp.off : sp.on } });
    });
    // connect once more after a refusal
    const connectBtn = this.el.querySelector(".cp-connect button") as HTMLButtonElement;
    connectBtn.addEventListener("click", async () => {
      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting";
      await this.loadT3(true);
      connectBtn.disabled = false;
      connectBtn.textContent = "Connect";
      if (!this.paired) this.failed(new Error("T3 did not pair with Lucid. Make sure T3 Code is open, then try again."), "bar");
    });
    this.wireQueue();
  }

  private wireQueue() {
    const ol = this.el.querySelector(".cp-queue ol") as HTMLOListElement;
    const items = () => [...ol.children] as HTMLElement[];
    const hold = (on: boolean) => {
      this.queueHold = Math.max(0, this.queueHold + (on ? 1 : -1));
      if (!this.queueHold) { ol.dataset.sig = ""; this.renderQueue(this.queueLatest); }
    };
    // Moves a row to a new index on screen (animated), then tells T3; puts it back if T3 says no.
    // FLIP: rows glide from where they were on screen (`seen`, when a drag left them shifted).
    const glide = (list: HTMLElement[], seen: Map<HTMLElement, number>) => {
      for (const x of list) {
        const dy = seen.get(x)! - x.getBoundingClientRect().top;
        if (dy) gsap.fromTo(x, { y: dy }, { y: 0, duration: 0.22, ease: "power2.out", clearProps: "transform" });
      }
    };
    const move = async (li: HTMLElement, to: number, seen?: Map<HTMLElement, number>) => {
      const list = items();
      const from = list.indexOf(li);
      const min = list.findIndex((x) => !x.classList.contains("fixed"));
      to = Math.max(min, Math.min(list.length - 1, to));
      if (to === from || !this.threadId) return;
      // T3 wants the run it should now sit in front of (null: the end of the queue)
      const before = list.filter((x) => x !== li)[to] ?? null;
      seen ??= new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
      ol.insertBefore(li, before);
      glide(list, seen);
      this.numberQueue();
      hold(true);
      try {
        await this.api.t3!.reorder({ threadId: this.threadId, runId: li.dataset.run!, beforeRunId: before?.dataset.run || null });
      } catch (err: any) {
        const back = new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
        ol.insertBefore(li, list[from + 1] ?? null);
        glide(list, back);
        this.numberQueue();
        this.failed(err, "queue");
      } finally {
        hold(false);
        this.refreshSoon(250);
      }
    };

    ol.addEventListener("click", async (e) => {
      const b = (e.target as HTMLElement).closest("[data-act]") as HTMLButtonElement | null;
      const li = b?.closest("li") as HTMLElement | null;
      if (!b || !li || b.disabled || !this.threadId) return;
      const i = items().indexOf(li);
      const act = b.dataset.act;
      if (act === "up" || act === "down") {
        await move(li, act === "up" ? i - 1 : i + 1);
        (li.querySelector(`[data-act="${act}"]`) as HTMLButtonElement | null)?.focus();
      } else if (act === "edit") this.editRow(li, hold);
      else if (act === "cancel") this.confirmRemove(li, hold);
      else if (act === "steer") {
        const m = this.queueLatest.find((x) => x.id === li.dataset.id);
        if (!m?.steerTarget) return;
        hold(true);
        gsap.to(li, { opacity: 0.35, duration: 0.15 });
        try {
          await this.api.t3!.steer({ threadId: this.threadId, queuedRunId: li.dataset.run!, targetRunId: m.steerTarget });
          li.remove(); this.numberQueue();
        } catch (err: any) { gsap.to(li, { opacity: 1, duration: 0.15 }); this.failed(err, "queue"); }
        finally { hold(false); this.refreshSoon(250); }
      }
    });

    // keyboard on the grip: arrow keys move the row
    ol.addEventListener("keydown", async (e) => {
      const grip = (e.target as HTMLElement).closest(".cq-grip") as HTMLElement | null;
      if (!grip || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const li = grip.closest("li") as HTMLElement;
      await move(li, items().indexOf(li) + (e.key === "ArrowUp" ? -1 : 1));
      (li.querySelector(".cq-grip") as HTMLElement | null)?.focus();
    });

    // dragging by the grip: the other rows make room where it will land
    ol.addEventListener("pointerdown", (e) => {
      const grip = (e.target as HTMLElement).closest(".cq-grip") as HTMLElement | null;
      if (!grip || e.button !== 0) return;
      e.preventDefault();
      const li = grip.closest("li") as HTMLElement;
      const list = items();
      const from = list.indexOf(li);
      const min = list.findIndex((x) => !x.classList.contains("fixed"));
      const rects = list.map((x) => x.getBoundingClientRect());
      const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 6;
      const step = rects[from].height + gap;
      const startY = e.clientY;
      let to = from;
      grip.setPointerCapture(e.pointerId);
      li.classList.add("dragging");
      document.body.classList.add("cq-dragging");
      hold(true);
      const onMove = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        gsap.set(li, { y: dy });
        const mid = rects[from].top + rects[from].height / 2 + dy;
        to = from;
        while (to < list.length - 1 && mid > rects[to + 1].top + rects[to + 1].height / 2) to++;
        while (to > min && mid < rects[to - 1].top + rects[to - 1].height / 2) to--;
        list.forEach((x, i) => {
          if (x === li) return;
          const shift = from < to && i > from && i <= to ? -step : to < from && i >= to && i < from ? step : 0;
          gsap.to(x, { y: shift, duration: 0.15, ease: "power2.out", overwrite: true });
        });
        // the position labels follow the preview, so "next" is always the top row
        const preview = list.filter((x) => x !== li);
        preview.splice(to, 0, li);
        preview.forEach((x, i) => ((x.querySelector(".cq-n") as HTMLElement).textContent = ordLabel(i + 1)));
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.type === "pointercancel") to = from; // interrupted: it goes back where it was
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onUp);
        grip.removeEventListener("pointercancel", onUp);
        li.classList.remove("dragging");
        document.body.classList.remove("cq-dragging");
        // remember where everything is on screen, drop the drag offsets, then glide into place
        gsap.killTweensOf(list);
        const seen = new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
        list.forEach((x) => gsap.set(x, { clearProps: "transform" }));
        if (to !== from) void move(li, to, seen).finally(() => hold(false));
        else { glide(list, seen); this.numberQueue(); hold(false); }
      };
      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onUp);
      grip.addEventListener("pointercancel", onUp);
    });
  }

  // Edit a queued message in place. Save sends it to T3; a failed save keeps your text.
  private editRow(li: HTMLElement, hold: (on: boolean) => void) {
    if (li.classList.contains("editing")) return;
    const m = this.queueLatest.find((x) => x.id === li.dataset.id);
    if (!m) return;
    hold(true);
    li.classList.add("editing");
    const p = li.querySelector("p") as HTMLElement;
    const box = document.createElement("div");
    box.className = "cq-edit";
    box.innerHTML = `<textarea rows="3" aria-label="Edit queued message"></textarea><div><button type="button" class="cq-save">Save</button><button type="button" class="cq-discard ghost">Discard changes</button><span>Ctrl+Enter saves</span></div>`;
    const ta = box.querySelector("textarea")!;
    ta.value = m.text;
    p.replaceWith(box);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    const finish = () => {
      window.removeEventListener("keydown", onEsc, true);
      box.replaceWith(p);
      li.classList.remove("editing");
      hold(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && box.contains(document.activeElement)) { e.stopImmediatePropagation(); finish(); (li.querySelector('[data-act="edit"]') as HTMLElement | null)?.focus(); } };
    window.addEventListener("keydown", onEsc, true);
    const save = async () => {
      const text = ta.value.trim();
      if (!text) { this.queueNote("A queued message cannot be empty. Remove it instead."); return; }
      if (text === m.text.trim()) { finish(); return; }
      const saveBtn = box.querySelector(".cq-save") as HTMLButtonElement;
      saveBtn.disabled = true; saveBtn.textContent = "Saving";
      try {
        await this.api.t3!.edit({ threadId: this.threadId!, runId: li.dataset.run!, text });
        p.textContent = text; p.title = text;
        finish();
        this.refreshSoon(200);
      } catch (err: any) {
        saveBtn.disabled = false; saveBtn.textContent = "Save";
        this.failed(err, "queue");
      }
    };
    box.querySelector(".cq-save")!.addEventListener("click", save);
    box.querySelector(".cq-discard")!.addEventListener("click", finish);
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } });
  }

  // Removing cannot be undone in T3, so the row asks once, in place.
  private confirmRemove(li: HTMLElement, hold: (on: boolean) => void) {
    if (li.classList.contains("confirming")) return;
    hold(true);
    li.classList.add("confirming");
    const bar = document.createElement("div");
    bar.className = "cq-confirm";
    bar.setAttribute("role", "group");
    bar.innerHTML = `<span>Remove this message from the queue? This cannot be undone.</span><button type="button" class="cq-yes">Remove</button><button type="button" class="cq-no ghost">Keep</button>`;
    li.appendChild(bar);
    const keep = bar.querySelector(".cq-no") as HTMLButtonElement;
    keep.focus();
    const finish = () => { window.removeEventListener("keydown", onEsc, true); bar.remove(); li.classList.remove("confirming"); hold(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && bar.contains(document.activeElement)) { e.stopImmediatePropagation(); finish(); (li.querySelector('[data-act="cancel"]') as HTMLElement | null)?.focus(); } };
    window.addEventListener("keydown", onEsc, true);
    keep.addEventListener("click", () => { finish(); (li.querySelector('[data-act="cancel"]') as HTMLElement | null)?.focus(); });
    bar.querySelector(".cq-yes")!.addEventListener("click", async () => {
      const yes = bar.querySelector(".cq-yes") as HTMLButtonElement;
      yes.disabled = true; yes.textContent = "Removing";
      try {
        await this.api.t3!.cancel({ threadId: this.threadId!, runId: li.dataset.run! });
        const next = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null;
        window.removeEventListener("keydown", onEsc, true);
        gsap.to(li, { opacity: 0, height: 0, marginTop: 0, duration: 0.2, onComplete: () => { li.remove(); this.numberQueue(); li.classList.remove("confirming"); hold(false); this.refreshSoon(100); } });
        (next?.querySelector(".cq-grip") as HTMLElement | null)?.focus();
      } catch (err: any) {
        finish();
        this.failed(err, "queue");
      }
    });
  }

  private zoom(src: string) {
    const z = this.el.querySelector(".cp-zoom") as HTMLElement;
    (z.querySelector("img") as HTMLImageElement).src = src;
    z.hidden = false;
    gsap.fromTo(z, { opacity: 0 }, { opacity: 1, duration: 0.2 });
  }

  private note(text: string) {
    const list = this.el.querySelector(".cp-list") as HTMLElement;
    const p = document.createElement("p");
    p.className = "cp-empty";
    p.textContent = text;
    list.appendChild(p);
    list.scrollTop = list.scrollHeight;
  }
}
