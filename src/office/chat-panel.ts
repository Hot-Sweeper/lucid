import { readPromptDraft, writePromptDraft } from "./prompt-draft";
import gsap from "gsap";
import type { Desk } from "./desk";
import { logoFor, harnessName } from "./brand";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { highlight } from "../os/highlight";
import { type ThreadRef, refBlock, stripRefs, summarize } from "./thread-ref";
import { beginSystem, endSystem } from "../perf/metrics";
import { HistoryWindow, type HistoryCursor, type HistoryPage } from "./history-window";
import { attachDictation } from "./dictation";
import { sameChatMessage, type ChatMessage as Msg } from "./chat-message";
import { chatReaderAnchor } from "./chat-scroll";
import { chatFileUrl, chatMediaKind, inlineChatImage, prepareChatImages, chatImageFailed } from "./chat-media";
import { reviewReportId, renderChatReview, type ChatReviewPaper } from "./chat-review";

// The chat beside a robot's screen: your whole conversation with it, live, with your
// attachments shown inline, and a box to message it without leaving its desk.

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
  conversationPage?(id: string, options?: { before?: HistoryCursor | null }): Promise<HistoryPage<Msg>>;
  sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
  saveAttachment(name: string, data: Uint8Array): Promise<string>;
  reviewPapers?(conversationId: string): Promise<ChatReviewPaper[]>;
  openReview?(paper: ChatReviewPaper, questions: boolean): void;
  openReviewThread?(paper: ChatReviewPaper): void;
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
export const fileUrl = chatFileUrl;
function mediaAttachment(path: string, name: string, mime = "") {
  const kind = chatMediaKind(path, mime);
  if (!kind) return `<div class="cp-file"><span>${esc(name)}</span><i>file</i></div>`;
  return `<button type="button" class="${kind === "image" ? "cp-att" : "cp-file"}" data-media-src="${fileUrl(path)}" data-media-kind="${kind}" data-media-name="${esc(name)}" aria-label="Preview ${esc(name)}">${kind === "image" ? `<img src="${fileUrl(path)}" alt="${esc(name)}" loading="lazy">` : `<span>${esc(name)}</span><i>Open ${kind}</i>`}</button>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Messages render as real Markdown, like in T3 Code: headings, lists, tables, quotes,
// highlighted code blocks with a copy button, and links (web links open in the browser,
// file paths show as file chips). Everything goes through DOMPurify.
const FENCE: Record<string, string> = { ts: "c", tsx: "c", js: "c", jsx: "c", typescript: "c", javascript: "c", rust: "c", go: "c", java: "c", c: "c", cpp: "c", cs: "c", py: "hash", python: "hash", sh: "hash", bash: "hash", shell: "hash", powershell: "hash", ps1: "hash", yaml: "hash", yml: "hash", toml: "hash", json: "json", html: "markup", xml: "markup", svg: "markup", css: "css", scss: "css", md: "text", markdown: "text", text: "text", txt: "text" };
const mdParser = new Marked({ gfm: true, breaks: true });
mdParser.use({
  renderer: {
    image({ href, text, title }: { href: string; text: string; title?: string | null }) {
      return inlineChatImage(href, text, title);
    },
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
  return DOMPurify.sanitize(prepareChatImages(html), {
    ADD_ATTR: ["target"],
    // Only the app's media scheme is added to DOMPurify's normal URL schemes.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|ftps|mailto|tel|callto|sms|cid|xmpp|lucid-file):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
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
  private groups = new Map<string, HTMLElement>();
  private renderedMessages = new Map<string, Msg>();
  private reviewPapers = new Map<string, ChatReviewPaper>();
  private reviewLookups = new Set<string>();
  private timelineIds: string[] | null = null;
  private loadingHistory = false;
  private history = new HistoryWindow<Msg>();
  private historyGeneration = 0;
  private loadingOlder = false;
  onClose: () => void = () => {};
  onChooseThread: () => void = () => {};
  /** A conversation was selected, including one already open in the panel. */
  onPresent: () => void = () => {};
  onManage: (id: string) => void = () => {};
  /** face: the manager's profile picture markup, or empty for ordinary robots. */
  setManager(label: string | null, face = '') {
    this.el.querySelector('.cp-manager-label')!.textContent = label || '';
    const holder = this.el.querySelector<HTMLElement>('.cp-manager-face')!;
    if (holder.dataset.face !== face) { holder.dataset.face = face; holder.innerHTML = face; }
    holder.hidden = !face;
    this.el.querySelector('.cp-manage')!.textContent = label ? 'Edit manager' : 'Promote to manager';
  }
  onToggleView: () => void = () => {};
  /** You started or stopped typing a message to this robot. */
  onTyping: (on: boolean) => void = () => {};
  private pending: { threadId: string; text: string; at: number }[] = [];
  private files: File[] = [];
  private drafts = new Map<string, { text: string; files: File[]; refs: ThreadRef[] }>();
  private sending = new Set<string>();
  private sendErrors = new Map<string, string>();
  private queueCleanups = new Set<() => void>();
  private resizeComposer: () => void = () => {};
  private stopComposerTyping: () => void = () => {};
  private dictation = { cancel() {} };
  private previews = new Map<File, string>();
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
      return `<div class="cp-chip"><button type="button" class="cp-file-preview" data-preview-file="${i}" aria-label="Preview ${esc(f.name)}">${thumb}<span class="cpc-name" title="${esc(f.name)}">${esc(f.name)}</span></button><button type="button" data-rm="${i}" aria-label="Remove ${esc(f.name)}">&times;</button></div>`;
    }).join("");
  }

  private releaseUnusedPreviews() {
    const owned = new Set<File>();
    for (const draft of this.drafts.values()) for (const file of draft.files) owned.add(file);
    if (this.threadId) for (const file of this.files) owned.add(file);
    const preview = this.el.querySelector<HTMLDialogElement>(".cp-zoom");
    const showing = new Set(preview?.open ? [...preview.querySelectorAll<HTMLImageElement | HTMLMediaElement>("img,video,audio")].map(media => media.src) : []);
    for (const [file, url] of this.previews) {
      if (owned.has(file) || showing.has(url)) continue;
      URL.revokeObjectURL(url); this.previews.delete(file);
    }
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
      const added = { ...ref };
      this.refs.push(added);
      // the last request and reply go along as a summary; loaded now so sending stays quick
      this.refLoads.set(ref.id, this.api.conversation(ref.id).then((msgs) => {
        Object.assign(added, summarize(msgs));
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
    const threadId = this.threadId, refs = this.refs, files = this.files;
    const ref = rm.dataset.rmref != null ? refs[Number(rm.dataset.rmref)] : null;
    const file = rm.dataset.rm != null ? files[Number(rm.dataset.rm)] : null;
    gsap.to(chip, { opacity: 0, scale: 0.9, duration: 0.14, onComplete: () => {
      if (ref) { const i = refs.indexOf(ref); if (i >= 0) refs.splice(i, 1); }
      if (file) { const i = files.indexOf(file); if (i >= 0) files.splice(i, 1); const url = this.previews.get(file); if (url) { URL.revokeObjectURL(url); this.previews.delete(file); } }
      if (threadId === this.threadId) this.renderChips();
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
    if (on) this.dictation.cancel();
    if (!on && !this.isOpen) { this.onChooseThread(); return; }
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
      <div class="cp-management"><span class="cp-manager-face" hidden></span><span class="cp-manager-label"></span><button type="button" class="cp-manage ghost">Promote to manager</button></div>
      <p class="cp-status" aria-live="polite"><i></i><span></span></p>
      <details class="cp-plan" hidden><summary>Plan</summary><ol></ol></details>
      <div class="cp-list" role="log" aria-live="polite"></div>
      <section class="cp-queue" aria-label="Queued messages" hidden><button type="button" class="cq-head" aria-expanded="true"><b>Queued</b><span class="cq-count"></span><i aria-hidden="true"></i></button><p class="cq-note" role="status" hidden></p><ol></ol></section>
      <dialog class="cp-zoom" aria-label="Attachment preview"><header><strong></strong><button type="button" class="ghost">Close preview</button></header><div class="cp-media-stage"></div></dialog>
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
    this.el.querySelector('.cp-manage')!.addEventListener('click', () => { if (this.threadId) this.onManage(this.threadId); });
    // folded, the chat is a tab on the right edge with the robot's name
    this.tab = document.createElement("button");
    this.tab.type = "button";
    this.tab.className = "cp-tab";
    this.tab.hidden = true;
    this.tab.setAttribute("aria-expanded", "false");
    this.tab.setAttribute("aria-label", "Show chat");
    this.tab.title = "Show the chat";
    this.tab.innerHTML = `<svg class="cp-rail-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-5.5 4V6A1.5 1.5 0 0 1 5 4.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><img alt="" hidden><span>Chat</span><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    host.appendChild(this.tab);
    this.tab.addEventListener("click", () => this.setCollapsed(false));
    this.tab.title = "Choose a thread to chat";
    this.el.querySelectorAll(".cp-hide").forEach((b) => b.addEventListener("click", () => this.setCollapsed(true)));
    this.el.querySelector(".cp-close")!.addEventListener("click", () => this.onClose());
    this.el.querySelector(".cp-view")!.addEventListener("click", () => this.onToggleView());
    const form = this.el.querySelector(".cp-form") as HTMLFormElement;
    const ta = form.querySelector("textarea")!;
    this.dictation = attachDictation(form, () => this.threadId);
    // the box grows with what you type, up to about 40% of the panel, then scrolls
    const grow = () => {
      ta.style.height = "auto";
      const max = Math.max(120, this.el.clientHeight * 0.4);
      ta.style.height = `${Math.min(max, ta.scrollHeight)}px`;
      ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
    };
    this.resizeComposer = grow;
    ta.addEventListener("input", grow);
    ta.addEventListener("input", () => { this.saveDraft(); });
    // let the robot know you are typing (and when you stop)
    let typingTimer = 0, typingOn = false;
    const setTyping = (on: boolean) => { if (on !== typingOn) { typingOn = on; this.onTyping(on); } };
    this.stopComposerTyping = () => { window.clearTimeout(typingTimer); setTyping(false); };
    ta.addEventListener("input", () => {
      window.clearTimeout(typingTimer);
      if (!ta.value.trim()) { setTyping(false); return; }
      setTyping(true);
      typingTimer = window.setTimeout(() => setTyping(false), 6000);
    });
    form.addEventListener("submit", () => this.stopComposerTyping(), true);
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
      if (!x) {
        const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-preview-file]");
        const file = chip ? this.files[Number(chip.dataset.previewFile)] : null;
        const kind = file ? chatMediaKind(file.name, file.type) : null;
        if (file && kind) {
          let url = this.previews.get(file);
          if (!url) { url = URL.createObjectURL(file); this.previews.set(file, url); }
          this.zoom(url, kind, file.name);
        }
        return;
      }
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
      const threadId = this.threadId;
      if ((!typed && !this.files.length && !this.refs.length) || !threadId || this.sending.has(threadId)) return;
      this.sending.add(threadId);
      this.sendErrors.delete(threadId);
      this.el.querySelectorAll(".cp-notice").forEach((n) => n.remove());
      ta.disabled = true;
      const composerFiles = this.files;
      const files = [...composerFiles];
      const refs = [...this.refs];
      let pending: { threadId: string; text: string; at: number } | null = null;
      try {
        // files are saved where the agent can open them, and listed in the message
        const saved: { path: string; image: boolean }[] = [];
        for (const f of files) saved.push({ path: await this.api.saveAttachment(f.name, new Uint8Array(await f.arrayBuffer())), image: f.type.startsWith("image/") });
        // referenced threads go along as short blocks the agent can read and look up by id
        await Promise.all(refs.map((r) => this.refLoads.get(r.id)));
        let text = typed || (saved.length ? "Have a look at the attached files." : refs.length > 1 ? "Have a look at these threads." : refs.length ? "Have a look at this thread." : "");
        if (refs.length) text += `\n\n${refs.map((r) => refBlock(r, harnessName(r.provider))).join("\n\n")}`;
        if (saved.length) text += `\n\nAttached:\n${saved.map((s) => `- ${s.image ? "image" : "file"}: ${s.path}`).join("\n")}`;
        // show it right away; it turns into the real message once T3 has it
        pending = { threadId, text, at: Date.now() };
        this.pending.push(pending);
        if (threadId === this.threadId) this.renderPending();
        await this.api.sendMessage({ threadId, message: text });
        this.drafts.delete(threadId);
        writePromptDraft(`chat:${threadId}`, "");
        if (threadId === this.threadId) {
          ta.value = "";
          this.files = this.files.filter((f) => !files.includes(f));
          this.refs = this.refs.filter((r) => !refs.includes(r));
          this.renderChips();
          grow();
          this.refreshSoon(300);
        } else if (!this.threadId && this.files === composerFiles) {
          // A closed composer has no live File owner after its saved draft was
          // sent. A different composer, including one since closed, keeps its array.
          this.files = this.files.filter((f) => !files.includes(f));
        }
        this.releaseUnusedPreviews();
      } catch (err: any) {
        if (pending) this.pending = this.pending.filter((p) => p !== pending);
        const error = `Could not send: ${err.message || err}. Your text is still here.`;
        this.sendErrors.set(threadId, error);
        if (threadId === this.threadId) {
          this.renderPending();
          this.note(error);
        }
      } finally {
        this.sending.delete(threadId);
        if (threadId === this.threadId) { ta.disabled = false; ta.focus(); }
      }
    });
    ta.addEventListener("keydown", (e) => {
      const phone = document.getElementById('app')?.classList.contains('mobile-layout');
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && (!phone || e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
    });
    this.el.querySelector(".cp-list")!.addEventListener("error", chatImageFailed, true);
    this.el.querySelector(".cp-list")!.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const review = t.closest<HTMLElement>(".cp-review [data-review-open],.cp-review [data-review-thread]");
      if (review) {
        const paper = this.reviewPapers.get(review.dataset.reviewOpen || review.dataset.reviewThread || "");
        if (paper && review.hasAttribute("data-review-open")) this.api.openReview?.(paper, review.hasAttribute("data-review-questions"));
        else if (paper && this.api.openReviewThread && !(e as MouseEvent).ctrlKey && !(e as MouseEvent).metaKey && !(e as MouseEvent).shiftKey && !(e as MouseEvent).altKey) { e.preventDefault(); this.api.openReviewThread(paper); }
        return;
      }
      if (t.closest(".cp-history-more")) { void this.loadEarlier(); return; }
      const img = t.closest(".cp-att img") as HTMLImageElement | null;
      if (img && !img.closest("[data-media-src]")) this.zoom(img.src, "image", img.alt);
      const media = t.closest<HTMLElement>("[data-media-src]");
      if (media) { e.preventDefault(); this.zoom(media.dataset.mediaSrc!, media.dataset.mediaKind!, media.dataset.mediaName!); }
      // copy a code block
      const copy = t.closest(".md-copy") as HTMLButtonElement | null;
      if (copy) {
        const code = copy.closest(".md-code")?.querySelector("pre")?.textContent ?? "";
        void navigator.clipboard.writeText(code).then(() => { copy.textContent = "Copied"; window.setTimeout(() => (copy.textContent = "Copy"), 1400); });
      }
    });
    const zoom = this.el.querySelector(".cp-zoom") as HTMLDialogElement;
    zoom.querySelector("button")!.addEventListener("click", () => zoom.close());
    zoom.addEventListener("click", e => { if (e.target === zoom) zoom.close(); });
    zoom.addEventListener("close", () => {
      if (zoom.open) return;
      for (const media of zoom.querySelectorAll<HTMLMediaElement>("video,audio")) {
        media.pause(); media.removeAttribute("src"); media.load();
      }
      zoom.querySelector(".cp-media-stage")!.replaceChildren();
      this.releaseUnusedPreviews();
    });
    zoom.addEventListener("keydown", e => e.stopPropagation());
    this.wireT3();
  }

  get isOpen() { return this.el.classList.contains("open"); }
  get threadId() { return this.desk?.threadId ?? null; }

  private closing = false;
  private saveDraft() {
    if (!this.threadId) return;
    const text = (this.el.querySelector("textarea") as HTMLTextAreaElement).value;
    if (!writePromptDraft(`chat:${this.threadId}`, text)) this.note("Draft could not be saved. Keep Lucid open and copy your prompt before closing.");
    this.drafts.set(this.threadId, { text: (this.el.querySelector("textarea") as HTMLTextAreaElement).value, files: this.files, refs: this.refs });
  }
  open(desk: Desk, focus = true) {
    // opened again while it was sliding out (you clicked another robot): it stays
    if (this.closing) { this.closing = false; gsap.killTweensOf(this.el); gsap.set(this.el, { clearProps: "x,opacity" }); }
    const same = !!desk.threadId && this.threadId === desk.threadId;
    if (!same) { this.dictation.cancel(); this.stopComposerTyping(); this.saveDraft(); for (const clean of [...this.queueCleanups]) clean(); }
    this.desk = desk;
    this.setManager(desk.el?.classList.contains('manager') ? 'Project manager' : null);
    this.setPlan(desk.planSteps || []);
    if (!same) {
      const draft = desk.threadId ? this.drafts.get(desk.threadId) : null;
      const ta = this.el.querySelector("textarea") as HTMLTextAreaElement;
      ta.value = draft?.text ?? (desk.threadId ? readPromptDraft(`chat:${desk.threadId}`) : "");
      ta.disabled = !!desk.threadId && this.sending.has(desk.threadId);
      this.files = draft?.files ?? [];
      this.refs = draft?.refs ?? [];
      this.refPreview = null;
      this.renderChips();
      this.resizeComposer();
      this.typingOn = false;
      this.clearTranscript();
      this.sel = null; this.queueHold = 0; this.closeMenu();
      (this.el.querySelector(".cp-queue ol") as HTMLElement).dataset.sig = "";
      this.renderQueue([]);
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
    this.setCollapsed(false);
    this.refresh();
    this.renderPending(false);
    if (!same && this.sendErrors.has(this.threadId!)) this.note(this.sendErrors.get(this.threadId!)!);
    this.onPresent();
    // Selecting a robot opens its conversation. A phone keyboard appears when
    // the user touches the composer, leaving the conversation readable first.
    if (focus && !document.getElementById('app')?.classList.contains('mobile-layout')) (this.el.querySelector("textarea") as HTMLTextAreaElement).focus({ preventScroll: true });
  }

  private clearTranscript() {
    this.history = new HistoryWindow<Msg>(); this.historyGeneration++; this.loadingOlder = false;
    this.shown.clear(); this.groups.clear(); this.renderedMessages.clear(); this.timelineIds = null;
    this.reviewPapers.clear(); this.reviewLookups.clear();
    (this.el.querySelector(".cp-list") as HTMLElement).replaceChildren();
    this.typingOn = false; this.queueLatest = []; this.queueHold = 0;
    const queue = this.el.querySelector<HTMLElement>(".cp-queue")!;
    queue.hidden = true;
    const rows = queue.querySelector<HTMLElement>("ol")!;
    rows.replaceChildren(); rows.dataset.sig = "";
  }

  close() {
    const preview = this.el.querySelector<HTMLDialogElement>(".cp-zoom");
    if (preview?.open) preview.close();
    this.dictation.cancel();
    if (!this.isOpen) return;
    this.stopComposerTyping(); this.saveDraft();
    for (const clean of [...this.queueCleanups]) clean();
    this.el.classList.remove("open");
    this.closeMenu();
    this.desk = null;
    window.clearTimeout(this.timer); this.timer = 0;
    this.clearTranscript();
    this.tabLabel = "Chat";
    (this.tab.querySelector("span") as HTMLElement).textContent = "Chat";
    this.tab.setAttribute("aria-label", "Show chat");
    this.tab.title = "Choose a thread to chat";
    (this.tab.querySelector("img") as HTMLImageElement).hidden = true;
    this.setCollapsed(true);
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

  private renderPending(scroll = true) {
    const list = this.el.querySelector(".cp-list") as HTMLElement;
    list.querySelectorAll(".cp-msg.pending").forEach((e) => e.remove());
    for (const p of this.pending.filter((p) => p.threadId === this.threadId)) {
      const el = document.createElement("div");
      el.className = "cp-msg you pending";
      const view = this.render({ id: "pending", role: "user", at: new Date(p.at).toISOString(), streaming: false, text: p.text, attachments: [] });
      el.innerHTML = view.replace(/<time>[^<]*<\/time>$/, "<time>Sending</time>");
      list.appendChild(el);
    }
    if (scroll) list.scrollTop = list.scrollHeight;
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
    if (this.loadingHistory) { this.refreshSoon(100); return; }
    this.loadingHistory = true;
    const generation = this.historyGeneration;
    let page: HistoryPage<Msg>;
    try {
      page = this.api.conversationPage ? await this.api.conversationPage(id) : { messages: await this.api.conversation(id), cursor: null, hasMore: false };
      await this.loadReviewPapers(page.messages, id, generation);
    }
    catch { if (id === this.threadId && generation === this.historyGeneration) this.refreshSoon(2000); return; }
    finally { this.loadingHistory = false; }
    if (id !== this.threadId || generation !== this.historyGeneration) return;
    this.renderHistory(this.history.update(page));
  }

  private async loadEarlier() {
    const id = this.threadId, cursor = this.history.cursor;
    if (!id || !cursor || !this.history.hasMore || this.loadingOlder || !this.api.conversationPage) return;
    const generation = this.historyGeneration;
    this.loadingOlder = true;
    this.historyButton();
    try {
      const page = await this.api.conversationPage(id, { before: cursor });
      await this.loadReviewPapers(page.messages, id, generation);
      if (id !== this.threadId || generation !== this.historyGeneration) return;
      this.renderHistory(this.history.update(page, true), true);
    } catch {
      if (id === this.threadId && generation === this.historyGeneration) {
        const button = this.historyButton();
        button.textContent = "Could not load earlier messages. Retry";
      }
    } finally {
      if (generation === this.historyGeneration) {
        this.loadingOlder = false;
        const button = this.el.querySelector<HTMLButtonElement>(".cp-history-more");
        if (button) { button.disabled = false; if (button.textContent === "Loading earlier messages...") this.historyButton(); }
      }
    }
  }

  private historyButton() {
    const list = this.el.querySelector<HTMLElement>(".cp-list")!;
    let button = list.querySelector<HTMLButtonElement>(".cp-history-more");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "cp-history-more ghost";
      list.prepend(button);
    }
    button.hidden = !this.history.hasMore;
    button.disabled = this.loadingOlder;
    const label = this.loadingOlder ? "Loading earlier messages..." : "Load earlier messages";
    if (button.textContent !== label) button.textContent = label;
    return button;
  }

  private async loadReviewPapers(messages: Msg[], threadId: string, generation: number) {
    if (!this.api.reviewPapers || threadId !== this.threadId || generation !== this.historyGeneration) return;
    const ids = messages.filter(m => m.role === "assistant").map(m => reviewReportId(m.text)).filter((id): id is string => !!id && !this.reviewLookups.has(id));
    if (!ids.length) return;
    try {
      const papers = await this.api.reviewPapers(threadId);
      if (threadId !== this.threadId || generation !== this.historyGeneration) return;
      for (const paper of papers) if (ids.includes(paper.id)) this.reviewPapers.set(paper.id, { id: paper.id, threadId: paper.threadId, title: paper.title, images: paper.images });
      for (const id of ids) this.reviewLookups.add(id);
      for (const m of messages) if (ids.includes(reviewReportId(m.text) || "")) this.renderedMessages.delete(m.id);
    } catch { /* Keep the original message readable if saved history is unavailable. */ }
  }

  private renderHistory(msgs: Msg[], preservePosition = false) {
    const id = this.threadId;
    if (!id) return;
    // the thread's model can change elsewhere too (T3 itself); check now and then
    if (this.paired && !this.saving && Date.now() - this.selAt > 4000) void this.loadSelection();
    const started = beginSystem();
    const list = this.el.querySelector(".cp-list") as HTMLElement;
    // Queued messages wait in their own section at the bottom, in the order the robot takes them.
    const queued = msgs.filter((m) => m.role === "user" && m.run === "queued").sort((a, b) => (a.queue ?? 99) - (b.queue ?? 99));
    const timeline = msgs.filter((m) => !(m.role === "user" && m.run === "queued"));
    this.renderQueue(queued);
    this.setPlan(this.desk?.planSteps || []);
    const historyButton = this.historyButton();
    const changed = new Set<string>();
    for (const m of timeline) {
      if (!sameChatMessage(this.renderedMessages.get(m.id), m)) changed.add(m.id);
      // Retain the current history object, so an unchanged IPC reply does not
      // leave a second copy of its text alive through the render cache.
      this.renderedMessages.set(m.id, m);
    }
    const reordered = !this.timelineIds || timeline.length !== this.timelineIds.length || timeline.some((m, i) => m.id !== this.timelineIds![i]);
    if (!changed.size && !reordered) { endSystem("chat", started); return; }
    this.timelineIds = timeline.map(m => m.id);
    // Read layout only when the visible timeline actually needs an update.
    const nearBottom = !preservePosition && list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const oldHeight = list.scrollHeight;
    const initial = this.shown.size === 0;
    const reader = !nearBottom ? chatReaderAnchor(list) : null;
    const anchor = reader?.element, anchorY = reader?.top;
    const ids = new Set(timeline.map((m) => m.id));
    for (const id of [...this.shown.keys()]) {
      if (!ids.has(id)) { this.shown.get(id)!.remove(); this.shown.delete(id); this.renderedMessages.delete(id); }
    }
    list.querySelector(".cp-empty:not(.cp-notice)")?.remove();
    const batches: { key: string; role: string; messages: Msg[] }[] = [];
    for (const m of timeline) {
      let el = this.shown.get(m.id);
      if (!el) {
        el = document.createElement("div");
        el.className = m.role === "event" ? "cp-event" : `cp-msg ${m.role === "user" ? "you" : "bot"}`;
        el.dataset.id = m.id;
        this.shown.set(m.id, el);
      }
      if (changed.has(m.id)) {
        const expanded = el.classList.contains("open");
        el.innerHTML = m.event ? this.renderEvent(m) : this.render(m);
        if (m.role === "user" && m.text.length > 700) {
          el.classList.add("long");
          el.classList.toggle("open", expanded);
          const more = document.createElement("button");
          more.type = "button"; more.className = "cp-more"; more.textContent = expanded ? "Show less" : "Show all";
          more.addEventListener("click", () => { more.textContent = el!.classList.toggle("open") ? "Show less" : "Show all"; });
          el.appendChild(more);
        }
      }
      const prev = batches.at(-1);
      const minute = Math.floor(Date.parse(m.at) / 60000);
      if (m.role !== "event" && prev?.role === m.role && Math.floor(Date.parse(prev.messages[0].at) / 60000) === minute) prev.messages.push(m);
      else batches.push({ key: m.id, role: m.role, messages: [m] });
    }
    const activeGroups = new Set<string>();
    let previous: HTMLElement | null = historyButton;
    for (const batch of batches) {
      let row: HTMLElement;
      if (batch.role === "event") row = this.shown.get(batch.key)!;
      else {
        activeGroups.add(batch.key);
        row = this.groups.get(batch.key)!;
        if (!row) {
          row = document.createElement("section");
          row.className = `cp-group ${batch.role === "user" ? "you" : "bot"}`;
          row.innerHTML = `<details class="cp-earlier"><summary></summary><div class="cp-earlier-body"></div></details><div class="cp-latest"></div>`;
          this.groups.set(batch.key, row);
        }
        const details = row.querySelector("details")!;
        const hideEarlier = batch.messages.length < 2;
        if (details.hidden !== hideEarlier) details.hidden = hideEarlier;
        const count = batch.messages.length - 1;
        const summary = details.querySelector("summary")!;
        const label = `${count} earlier ${batch.role === "user" ? (count === 1 ? "message" : "messages") : (count === 1 ? "update" : "updates")}`;
        if (summary.textContent !== label) summary.textContent = label;
        const earlier = row.querySelector(".cp-earlier-body")!, latest = row.querySelector(".cp-latest")!;
        batch.messages.forEach((m, i) => {
          const target = i === batch.messages.length - 1 ? latest : earlier;
          const el = this.shown.get(m.id)!;
          if (el.parentElement !== target) target.appendChild(el);
        });
      }
      const next: Element | null = previous ? previous.nextElementSibling : list.firstElementChild;
      if (next !== row) list.insertBefore(row, next);
      previous = row;
    }
    for (const [key, group] of this.groups) if (!activeGroups.has(key)) { group.remove(); this.groups.delete(key); }
    // pending bubbles disappear once the real message shows up
    const texts = new Set(msgs.filter((m) => m.role === "user").map((m) => m.text.trim()));
    list.querySelectorAll(".cp-msg.pending").forEach((e) => list.appendChild(e));
    const typing = list.querySelector(".cp-typing");
    if (typing) list.appendChild(typing);
    const pending = this.pending.filter((p) => p.threadId !== id || (!texts.has(p.text) && Date.now() - p.at < 60000));
    const pendingChanged = pending.length !== this.pending.length;
    this.pending = pending;
    if (pendingChanged) this.renderPending(false);
    if (!timeline.length && !list.querySelector(".cp-msg.pending,.cp-typing,.cp-empty")) list.insertAdjacentHTML("beforeend", `<p class="cp-empty">No messages yet. Say hello.</p>`);
    else if (timeline.length) list.querySelector(".cp-empty:not(.cp-notice)")?.remove();
    if (nearBottom || (initial && !preservePosition)) list.scrollTop = list.scrollHeight;
    else if (anchor?.isConnected && anchorY != null) list.scrollTop += anchor.getBoundingClientRect().top - anchorY;
    else if (preservePosition) list.scrollTop += list.scrollHeight - oldHeight;
    endSystem("chat", started);
  }

  showPlan() { const plan = this.el.querySelector<HTMLDetailsElement>(".cp-plan")!; plan.open = true; plan.querySelector("summary")!.focus({ preventScroll: true }); }

  private setPlan(steps: { text: string; status: string }[]) {
    const plan = this.el.querySelector<HTMLElement>(".cp-plan")!;
    plan.hidden = !steps.length;
    const sig = JSON.stringify(steps);
    if (plan.dataset.sig === sig) return;
    plan.dataset.sig = sig;
    plan.querySelector("summary")!.textContent = `Plan (${steps.filter((s) => /completed|done/.test(s.status)).length} of ${steps.length} complete)`;
    plan.querySelector("ol")!.innerHTML = steps.map((s) => `<li data-status="${esc(s.status)}"><span>${/completed|done/.test(s.status) ? "Done" : /progress|running/.test(s.status) ? "Doing" : "To do"}</span>${esc(s.text)}</li>`).join("");
  }

  private renderEvent(m: Msg) {
    const e = m.event!;
    const modelName = (s?: string) => (s || "").replace(/^claude-/, "").replace(/^gpt-/, "").replace(/-(\d)-(\d)/, " $1.$2").replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
    const selection = (s?: { provider?: string; model?: string }) => {
      if (!s) return "";
      const logo = s.provider ? logoFor(s.provider) : null;
      return `<span class="cp-event-model">${logo ? `<img src="${logo}" alt="${esc(harnessName(s.provider))}">` : ""}${esc(modelName(s.model) || harnessName(s.provider))}</span>`;
    };
    const label = e.kind === "compaction" ? (/running|pending|waiting/.test(e.status ?? "") ? "Compacting context" : e.status === "failed" ? "Compaction failed" : /cancel|interrupt|abort/.test(e.status ?? "") ? "Compaction interrupted" : "Context compacted")
      : e.kind === "handoff" ? "Context handoff" : e.kind === "harness" ? "Harness switched" : "Model switched";
    return `<span class="cp-event-line" aria-hidden="true"></span><span class="cp-event-body"><span>${label}</span>${e.from || e.to ? selection(e.from) + '<span aria-hidden="true">&rarr;</span>' + selection(e.to) : ""}<time datetime="${esc(m.at)}">${when(m.at)}</time></span><span class="cp-event-line" aria-hidden="true"></span>`;
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
        sent.push(mediaAttachment(p, name, mm[1] === "image" ? "image/" : ""));
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
      if (a.path) return mediaAttachment(a.path, a.name, a.mime || (a.type === "image" ? "image/" : ""));
      return `<div class="cp-file" title="${esc(a.name)}"><span>${esc(a.name)}</span><i>${Math.max(1, Math.round((a.size || 0) / 1024))} KB</i></div>`;
    }).join("");
    const state = m.role === "user" && m.run === "running" ? `<em class="cp-live">It is working on this</em>` : "";
    const paper = m.role === "assistant" ? this.reviewPapers.get(reviewReportId(m.text) || "") : null;
    const report = paper ? renderChatReview(m.text, m.streaming, paper, md) : null;
    return `${atts ? `<div class="cp-atts">${atts}</div>` : ""}${m.text ? `<div class="cp-text">${report ?? (md(m.text) + (m.streaming ? '<span class="caret"></span>' : ""))}</div>` : ""}${state}<time datetime="${esc(m.at)}" title="${esc(new Date(m.at).toLocaleString())}">${when(m.at)}</time>`;
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
    const sig = JSON.stringify([live, queued]);
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
    // above the button, kept inside the panel
    const pr = this.el.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    menu.style.maxHeight = `${Math.max(120, ar.top - pr.top - 16)}px`;
    menu.style.bottom = `${pr.bottom - ar.top + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(ar.left - pr.left, pr.width - menu.offsetWidth - 8))}px`;
    anchor.setAttribute("aria-expanded", "true");
    const opts = [...menu.children] as HTMLButtonElement[];
    (opts.find((o) => o.getAttribute("aria-selected") === "true") ?? opts[0])?.focus();
    gsap.fromTo(menu, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.14 });
    const done = (refocus: boolean) => {
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
    const hold = (on: boolean, threadId = this.threadId) => {
      if (threadId !== this.threadId) return;
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
      const threadId = this.threadId;
      const list = items();
      const from = list.indexOf(li);
      const min = list.findIndex((x) => !x.classList.contains("fixed"));
      to = Math.max(min, Math.min(list.length - 1, to));
      if (to === from || !threadId) return;
      // T3 wants the run it should now sit in front of (null: the end of the queue)
      const before = list.filter((x) => x !== li)[to] ?? null;
      seen ??= new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
      ol.insertBefore(li, before);
      glide(list, seen);
      this.numberQueue();
      hold(true, threadId);
      try {
        await this.api.t3!.reorder({ threadId, runId: li.dataset.run!, beforeRunId: before?.dataset.run || null });
      } catch (err: any) {
        if (threadId !== this.threadId) return;
        const back = new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
        ol.insertBefore(li, list[from + 1] ?? null);
        glide(list, back);
        this.numberQueue();
        this.failed(err, "queue");
      } finally {
        hold(false, threadId);
        this.refreshSoon(250);
      }
    };

    ol.addEventListener("click", async (e) => {
      const b = (e.target as HTMLElement).closest("[data-act]") as HTMLButtonElement | null;
      const li = b?.closest("li") as HTMLElement | null;
      if (!b || !li || b.disabled || !this.threadId) return;
      const threadId = this.threadId;
      const rowHold = (on: boolean) => hold(on, threadId);
      const i = items().indexOf(li);
      const act = b.dataset.act;
      if (act === "up" || act === "down") {
        await move(li, act === "up" ? i - 1 : i + 1);
        (li.querySelector(`[data-act="${act}"]`) as HTMLButtonElement | null)?.focus();
      } else if (act === "edit") this.editRow(li, rowHold);
      else if (act === "cancel") this.confirmRemove(li, rowHold);
      else if (act === "steer") {
        const m = this.queueLatest.find((x) => x.id === li.dataset.id);
        if (!m?.steerTarget) return;
        rowHold(true);
        gsap.to(li, { opacity: 0.35, duration: 0.15 });
        try {
          await this.api.t3!.steer({ threadId, queuedRunId: li.dataset.run!, targetRunId: m.steerTarget });
          if (threadId !== this.threadId) return;
          li.remove(); this.numberQueue();
        } catch (err: any) { if (threadId === this.threadId) { gsap.to(li, { opacity: 1, duration: 0.15 }); this.failed(err, "queue"); } }
        finally { rowHold(false); this.refreshSoon(250); }
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
      const threadId = this.threadId;
      const pointerId = e.pointerId;
      let to = from;
      try { grip.setPointerCapture(pointerId); } catch { /* window handlers cover synthetic and lost capture */ }
      li.classList.add("dragging");
      document.body.classList.add("cq-dragging");
      hold(true, threadId);
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
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
      let ended = false;
      const finish = (cancel: boolean) => {
        if (ended) return;
        ended = true;
        if (cancel) to = from;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("blur", onCancel);
        window.removeEventListener("keydown", onKey, true);
        grip.removeEventListener("lostpointercapture", onCancel);
        this.queueCleanups.delete(onCancel);
        li.classList.remove("dragging");
        document.body.classList.remove("cq-dragging");
        // remember where everything is on screen, drop the drag offsets, then glide into place
        gsap.killTweensOf(list);
        const seen = new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
        list.forEach((x) => gsap.set(x, { clearProps: "transform" }));
        if (to !== from) void move(li, to, seen).finally(() => hold(false, threadId));
        else { glide(list, seen); this.numberQueue(); hold(false, threadId); }
      };
      const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(false); };
      const onCancel = () => finish(true);
      const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); finish(true); } };
      this.queueCleanups.add(onCancel);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("blur", onCancel);
      window.addEventListener("keydown", onKey, true);
      grip.addEventListener("lostpointercapture", onCancel);
    });
  }

  // Edit a queued message in place. Save sends it to T3; a failed save keeps your text.
  private editRow(li: HTMLElement, hold: (on: boolean) => void) {
    if (li.classList.contains("editing")) return;
    const m = this.queueLatest.find((x) => x.id === li.dataset.id);
    if (!m) return;
    const threadId = this.threadId!;
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
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.queueCleanups.delete(finish);
      window.removeEventListener("keydown", onEsc, true);
      box.replaceWith(p);
      li.classList.remove("editing");
      hold(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && box.contains(document.activeElement)) { e.stopImmediatePropagation(); finish(); (li.querySelector('[data-act="edit"]') as HTMLElement | null)?.focus(); } };
    window.addEventListener("keydown", onEsc, true);
    this.queueCleanups.add(finish);
    const save = async () => {
      const text = ta.value.trim();
      if (!text) { this.queueNote("A queued message cannot be empty. Remove it instead."); return; }
      if (text === m.text.trim()) { finish(); return; }
      const saveBtn = box.querySelector(".cq-save") as HTMLButtonElement;
      saveBtn.disabled = true; saveBtn.textContent = "Saving";
      try {
        await this.api.t3!.edit({ threadId, runId: li.dataset.run!, text });
        if (threadId !== this.threadId) return;
        p.textContent = text; p.title = text;
        finish();
        this.refreshSoon(200);
      } catch (err: any) {
        if (threadId !== this.threadId) return;
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
    const threadId = this.threadId!;
    hold(true);
    li.classList.add("confirming");
    const bar = document.createElement("div");
    bar.className = "cq-confirm";
    bar.setAttribute("role", "group");
    bar.innerHTML = `<span>Remove this message from the queue? This cannot be undone.</span><button type="button" class="cq-yes">Remove</button><button type="button" class="cq-no ghost">Keep</button>`;
    li.appendChild(bar);
    const keep = bar.querySelector(".cq-no") as HTMLButtonElement;
    keep.focus();
    let finished = false;
    const finish = () => { if (finished) return; finished = true; this.queueCleanups.delete(finish); window.removeEventListener("keydown", onEsc, true); bar.remove(); li.classList.remove("confirming"); hold(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && bar.contains(document.activeElement)) { e.stopImmediatePropagation(); finish(); (li.querySelector('[data-act="cancel"]') as HTMLElement | null)?.focus(); } };
    window.addEventListener("keydown", onEsc, true);
    this.queueCleanups.add(finish);
    keep.addEventListener("click", () => { finish(); (li.querySelector('[data-act="cancel"]') as HTMLElement | null)?.focus(); });
    bar.querySelector(".cq-yes")!.addEventListener("click", async () => {
      const yes = bar.querySelector(".cq-yes") as HTMLButtonElement;
      yes.disabled = true; yes.textContent = "Removing";
      try {
        await this.api.t3!.cancel({ threadId, runId: li.dataset.run! });
        if (threadId !== this.threadId) return;
        const next = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null;
        gsap.to(li, { opacity: 0, height: 0, marginTop: 0, duration: 0.2, onComplete: () => { li.remove(); if (threadId === this.threadId) this.numberQueue(); finish(); this.refreshSoon(100); } });
        (next?.querySelector(".cq-grip") as HTMLElement | null)?.focus();
      } catch (err: any) {
        finish();
        if (threadId === this.threadId) this.failed(err, "queue");
      }
    });
  }

  private zoom(src: string, kind = "image", name = "Image") {
    const z = this.el.querySelector(".cp-zoom") as HTMLDialogElement;
    for (const previous of z.querySelectorAll<HTMLMediaElement>("video,audio")) {
      previous.pause(); previous.removeAttribute("src"); previous.load();
    }
    const media = document.createElement(kind === "video" ? "video" : kind === "audio" ? "audio" : "img");
    media.src = src;
    if (media instanceof HTMLImageElement) media.alt = name;
    else { media.controls = true; media.preload = "metadata"; }
    media.addEventListener("error", () => {
      if (z.querySelector(".cp-media-stage")!.firstElementChild !== media) return;
      const message = document.createElement("p");
      message.textContent = "This file could not be previewed. Check that it is still available and uses a supported media format.";
      z.querySelector(".cp-media-stage")!.replaceChildren(message);
    }, { once: true });
    z.querySelector("strong")!.textContent = name;
    z.querySelector(".cp-media-stage")!.replaceChildren(media);
    if (!z.open) z.showModal();
    z.querySelector("button")!.focus();
  }

  private note(text: string) {
    const list = this.el.querySelector(".cp-list") as HTMLElement;
    const p = document.createElement("p");
    p.className = "cp-empty cp-notice";
    p.textContent = text;
    list.appendChild(p);
    list.scrollTop = list.scrollHeight;
  }
}
