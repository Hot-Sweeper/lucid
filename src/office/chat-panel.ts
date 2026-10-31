import gsap from "gsap";
import type { Desk } from "./desk";
import { logoFor, harnessName } from "./brand";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { highlight } from "../os/highlight";

// The chat beside a robot's screen: your whole conversation with it, live, with your
// attachments shown inline, and a box to message it without leaving its desk.

type Msg = { id: string; role: string; at: string; streaming: boolean; text: string; run?: string | null; queue?: number | null; attachments: { type: string; name: string; mime: string; size: number; path: string | null }[] };
type Api = {
  conversation(id: string): Promise<Msg[]>;
  sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
  saveAttachment(name: string, data: Uint8Array): Promise<string>;
};

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
  private pending: { text: string; at: number }[] = [];
  private files: File[] = [];
  private previews = new WeakMap<File, string>();

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
    box.hidden = !this.files.length;
    box.innerHTML = this.files.map((f, i) => {
      let thumb = "";
      if (f.type.startsWith("image/")) {
        if (!this.previews.has(f)) this.previews.set(f, URL.createObjectURL(f));
        thumb = `<img src="${this.previews.get(f)}" alt="">`;
      } else thumb = `<span class="cpc-ext">${esc((f.name.split(".").pop() || "file").slice(0, 4).toUpperCase())}</span>`;
      return `<div class="cp-chip">${thumb}<span class="cpc-name" title="${esc(f.name)}">${esc(f.name)}</span><button type="button" data-rm="${i}" aria-label="Remove ${esc(f.name)}">&times;</button></div>`;
    }).join("");
  }

  constructor(host: HTMLElement, private api: Api) {
    this.el = document.createElement("aside");
    this.el.className = "chat-panel";
    this.el.setAttribute("aria-label", "Chat with this robot");
    this.el.innerHTML = `
      <header class="cp-head">
        <img class="cp-logo" alt="">
        <div class="cp-who"><b></b><span></span></div>
        <button type="button" class="cp-view ghost"></button>
        <button type="button" class="cp-close" aria-label="Back to the office" title="Back to the office (Esc)"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </header>
      <p class="cp-status" aria-live="polite"><i></i><span></span></p>
      <div class="cp-list" role="log" aria-live="polite"></div>
      <section class="cp-queue" aria-label="Queued messages" hidden><button type="button" class="cq-head" aria-expanded="true"><b>Queued</b><span class="cq-count"></span><i aria-hidden="true"></i></button><ol></ol></section>
      <div class="cp-zoom" hidden><img alt=""><button type="button" class="ghost">Close image</button></div>
      <form class="cp-form">
        <div class="cp-box">
          <div class="cp-chips" hidden></div>
          <textarea rows="1" placeholder="Message this robot" aria-label="Message"></textarea>
          <div class="cp-tools">
            <button type="button" class="cp-attach" aria-label="Attach files or images" title="Attach files or images (you can also paste or drop them)"><svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M13.5 6.5l-5.6 5.6a1.6 1.6 0 0 0 2.3 2.3l6-6a3.2 3.2 0 0 0-4.5-4.5l-6.2 6.2a4.8 4.8 0 0 0 6.8 6.8l5-5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <span class="cp-hint">Enter to send, Shift+Enter for a new line</span>
            <button type="submit" class="cp-send" aria-label="Send"><span>Send</span><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
          <input type="file" class="cp-fileinput" multiple hidden>
        </div>
        <div class="cp-drop" hidden>Drop to attach</div>
      </form>`;
    host.appendChild(this.el);
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
    form.querySelector(".cp-chips")!.addEventListener("click", (e) => {
      const x = (e.target as HTMLElement).closest("[data-rm]") as HTMLElement | null;
      if (x) { this.files.splice(Number(x.dataset.rm), 1); this.renderChips(); }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const typed = ta.value.trim();
      if ((!typed && !this.files.length) || !this.desk?.threadId) return;
      ta.disabled = true;
      const files = [...this.files];
      try {
        // files are saved where the agent can open them, and listed in the message
        const saved: { path: string; image: boolean }[] = [];
        for (const f of files) saved.push({ path: await this.api.saveAttachment(f.name, new Uint8Array(await f.arrayBuffer())), image: f.type.startsWith("image/") });
        const text = saved.length
          ? `${typed || "Have a look at the attached files."}\n\nAttached:\n${saved.map((s) => `- ${s.image ? "image" : "file"}: ${s.path}`).join("\n")}`
          : typed;
        // show it right away; it turns into the real message once T3 has it
        this.pending.push({ text, at: Date.now() });
        this.renderPending();
        await this.api.sendMessage({ threadId: this.desk.threadId, message: text });
        ta.value = "";
        this.files = [];
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
  }

  get isOpen() { return this.el.classList.contains("open"); }
  get threadId() { return this.desk?.threadId ?? null; }

  open(desk: Desk) {
    const same = this.desk === desk;
    this.desk = desk;
    if (!same) { this.shown.clear(); (this.el.querySelector(".cp-list") as HTMLElement).innerHTML = ""; }
    const info = desk.info, logo = logoFor(info?.provider);
    const img = this.el.querySelector(".cp-logo") as HTMLImageElement;
    img.hidden = !logo;
    if (logo) img.src = logo;
    this.el.querySelector(".cp-who b")!.textContent = desk.profile?.name ? `${desk.profile.name}` : `${harnessName(info?.provider)} robot`;
    this.el.querySelector(".cp-who span")!.textContent = info?.title || "";
    if (!this.isOpen) {
      this.el.classList.add("open");
      gsap.fromTo(this.el, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" });
    }
    this.refresh();
    (this.el.querySelector("textarea") as HTMLTextAreaElement).focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    gsap.to(this.el, { x: 40, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => this.el.classList.remove("open") });
    this.desk = null;
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
      // keep every message in conversation order, also ones that were already on screen
      const want: Element | null = prevEl ? prevEl.nextElementSibling : list.firstElementChild;
      if (want !== el) list.insertBefore(el, want);
      prevEl = el;
    }
    // pending bubbles disappear once the real message shows up
    const texts = new Set(msgs.filter((m) => m.role === "user").map((m) => m.text.trim()));
    list.querySelectorAll(".cp-msg.pending").forEach((e) => list.appendChild(e));
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
    const ord = (n: number) => (n === 1 ? "next" : `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"}`);
    const html = queued.map((m, i) => `<li><span class="cq-n">${ord(i + 1)}</span><p></p></li>`).join("");
    if (ol.dataset.sig === queued.map((m) => m.id).join(",")) return;
    ol.dataset.sig = queued.map((m) => m.id).join(",");
    ol.innerHTML = html;
    ol.querySelectorAll("p").forEach((p, i) => { p.textContent = queued[i].text; p.title = queued[i].text; });
    gsap.fromTo(ol.children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.04 });
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
