import gsap from "gsap";
import type { Desk } from "./desk";
import { logoFor, harnessName } from "./brand";

// The chat beside a robot's screen: your whole conversation with it, live, with your
// attachments shown inline, and a box to message it without leaving its desk.

type Msg = { id: string; role: string; at: string; streaming: boolean; text: string; attachments: { type: string; name: string; mime: string; size: number; path: string | null }[] };
type Api = {
  conversation(id: string): Promise<Msg[]>;
  sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
};

export const fileUrl = (p: string) => `lucid-file://local/${encodeURIComponent(p)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Light markdown: code blocks, inline code, bold, links shown as their text, line breaks.
function md(text: string) {
  const parts = text.split(/```[a-z0-9-]*\n?/i);
  return parts.map((part, i) => {
    if (i % 2 === 1) return `<pre>${esc(part.replace(/\n$/, ""))}</pre>`;
    return esc(part)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="cp-link" title="$2">$1</span>')
      .replace(/\n/g, "<br>");
  }).join("");
}
const when = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export class ChatPanel {
  el: HTMLElement;
  private desk: Desk | null = null;
  private shown = new Map<string, HTMLElement>();
  private timer = 0;
  onClose: () => void = () => {};

  constructor(host: HTMLElement, private api: Api) {
    this.el = document.createElement("aside");
    this.el.className = "chat-panel";
    this.el.setAttribute("aria-label", "Chat with this robot");
    this.el.innerHTML = `
      <header class="cp-head">
        <img class="cp-logo" alt="">
        <div class="cp-who"><b></b><span></span></div>
        <button type="button" class="cp-close" aria-label="Back to the office" title="Back to the office (Esc)"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </header>
      <div class="cp-list" role="log" aria-live="polite"></div>
      <div class="cp-zoom" hidden><img alt=""><button type="button" class="ghost">Close image</button></div>
      <form class="cp-form">
        <textarea rows="2" placeholder="Message this robot"></textarea>
        <button type="submit" class="primary">Send</button>
      </form>`;
    host.appendChild(this.el);
    this.el.querySelector(".cp-close")!.addEventListener("click", () => this.onClose());
    const form = this.el.querySelector(".cp-form") as HTMLFormElement;
    const ta = form.querySelector("textarea")!;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text || !this.desk?.threadId) return;
      ta.disabled = true;
      try {
        await this.api.sendMessage({ threadId: this.desk.threadId, message: text });
        ta.value = "";
        this.refreshSoon(300);
      } catch (err: any) {
        this.note(`Could not send: ${err.message || err}. Your text is still here.`);
      } finally { ta.disabled = false; ta.focus(); }
    });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    this.el.querySelector(".cp-list")!.addEventListener("click", (e) => {
      const img = (e.target as HTMLElement).closest(".cp-att img") as HTMLImageElement | null;
      if (img) this.zoom(img.src);
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
    for (const m of msgs) {
      let el = this.shown.get(m.id);
      const html = this.render(m);
      if (!el) {
        el = document.createElement("div");
        el.className = `cp-msg ${m.role === "user" ? "you" : "bot"}`;
        el.innerHTML = html;
        list.appendChild(el);
        this.shown.set(m.id, el);
        if (this.shown.size > msgs.length - 6) gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", delay: added++ * 0.05 });
      } else if (el.dataset.sig !== `${m.text.length}:${m.streaming}`) {
        el.innerHTML = html;
      }
      el.dataset.sig = `${m.text.length}:${m.streaming}`;
    }
    if (!list.children.length) list.innerHTML = `<p class="cp-empty">No messages yet. Say hello.</p>`;
    else list.querySelector(".cp-empty")?.remove();
    if (nearBottom || added) list.scrollTop = list.scrollHeight;
  }

  private render(m: Msg) {
    const atts = m.attachments.map((a) => {
      if (a.type === "image" && a.path) return `<figure class="cp-att"><img src="${fileUrl(a.path)}" alt="${esc(a.name)}" loading="lazy"></figure>`;
      return `<div class="cp-file" title="${esc(a.name)}"><span>${esc(a.name)}</span><i>${Math.max(1, Math.round((a.size || 0) / 1024))} KB</i></div>`;
    }).join("");
    return `${atts ? `<div class="cp-atts">${atts}</div>` : ""}${m.text ? `<div class="cp-text">${md(m.text)}${m.streaming ? '<span class="caret"></span>' : ""}</div>` : ""}<time>${when(m.at)}</time>`;
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
