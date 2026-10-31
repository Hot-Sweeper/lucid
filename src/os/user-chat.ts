import gsap from "gsap";
import type { WM } from "./wm";
import type { T3Info } from "../harness/t3code";
import { type ChatMessage, renderChatMessage } from "../office/chat-content";
import { logoFor, harnessName } from "../office/brand";
import { ICONS } from "./icons";
import { esc } from "./typing";
import "./user-chat.css";

/** The robot sees the same roles, bubble colours, Markdown and attachments as the user. */
export class UserChatApp {
  private root: HTMLElement;
  private info: T3Info = {};
  constructor(private wm: WM) {
    this.root = document.createElement("div");
    this.root.className = "chat-panel open robot-userchat";
    this.root.innerHTML = `<header class="cp-head"><span class="lucid-chat-mark" aria-hidden="true"></span><div class="cp-who"><b></b><span></span></div></header><p class="cp-status"><i></i><span>Chat with you</span></p><div class="cp-list" role="log"></div><div class="cp-form"><div class="cp-model"><span class="uc-model"></span><span class="uc-effort"></span></div><div class="cp-box"><div class="uc-draft" role="textbox" aria-readonly="true" aria-label="Reply to you"></div><div class="cp-tools"><span class="cp-hint">Message</span><span class="cp-send"><span>Send</span><svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div></div></div>`;
    this.root.addEventListener("click", async (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>(".md-copy");
      const code = button?.closest(".md-code")?.querySelector("code");
      if (button && code) { try { await navigator.clipboard.writeText(code.textContent || ""); } catch {} }
    });
  }
  setInfo(info: T3Info) {
    this.info = { ...this.info, ...info };
    this.root.querySelector(".cp-who b")!.textContent = this.wm.robotName;
    const title = this.root.querySelector<HTMLElement>(".cp-who span")!; title.textContent = this.info.title || ""; title.title = title.textContent;
    const logo = logoFor(info.provider);
    this.root.querySelector(".uc-model")!.innerHTML = `${logo ? `<img src="${esc(logo)}" alt="">` : ""}<span>${esc(info.model || harnessName(info.provider))}</span>`;
    this.root.querySelector(".uc-effort")!.textContent = info.effort ? `Effort ${info.effort}` : "";
  }
  private async ensure(clicked = false) {
    this.setInfo(this.info);
    this.wm.brandApp("chat", { title: "Lucid Chat", icon: ICONS.chat });
    this.wm.frameHint.chat = { x: 380, y: 10, w: 424, h: 396 };
    const window = await this.wm.open("chat", "Lucid Chat", clicked);
    if (this.root.parentElement !== window.body) window.body.replaceChildren(this.root);
    return this.root.querySelector<HTMLElement>(".cp-list")!;
  }
  private append(list: HTMLElement, message: ChatMessage) {
    const bubble = document.createElement("div"); bubble.className = `cp-msg ${message.role === "user" ? "you" : "bot"}`;
    bubble.innerHTML = renderChatMessage(message); list.append(bubble);
    gsap.fromTo(bubble, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: .25, clearProps: "transform" });
    list.scrollTop = list.scrollHeight; return bubble;
  }
  async user(text: string, images: string[] = [], clicked = false, at = "") {
    const list = await this.ensure(clicked); this.youTyping(false);
    const attachments = images.map((src) => ({ type: "image", name: "Image", mime: "image/png", size: 0, path: src.startsWith("lucid-file:") ? decodeURIComponent(new URL(src).pathname.slice(1)) : src }));
    this.append(list, { id: "", role: "user", text, at, streaming: false, attachments });
    await this.wm.sleep(500);
  }
  async assistant(getText: () => { text: string; done: boolean }, at = "") {
    const epoch = this.wm.epoch, list = await this.ensure();
    const bubble = this.append(list, { id: "", role: "assistant", text: "", at, streaming: true, attachments: [] });
    const draft = this.root.querySelector<HTMLElement>(".uc-draft")!;
    this.wm.robot.setTyping(true);
    let previous = "";
    try {
      for (;;) {
        const current = getText();
        if (current.text !== previous) {
          this.wm.robot.pressKey(current.text.at(-1) || " ");
          previous = current.text;
          bubble.innerHTML = renderChatMessage({ id: "", role: "assistant", text: previous, at, streaming: !current.done, attachments: [] });
          list.scrollTop = list.scrollHeight;
        }
        if (current.done) break;
        await this.wm.sleep(100, epoch);
      }
    } finally {
      this.wm.robot.setTyping(false); draft.textContent = "";
      if (epoch === this.wm.epoch) {
        if (previous.trim()) bubble.innerHTML = renderChatMessage({ id: "", role: "assistant", text: previous, at, streaming: false, attachments: [] }); else bubble.remove();
      }
    }
  }
  async youTyping(on: boolean) {
    const list = this.root.querySelector<HTMLElement>(".cp-list")!;
    if (!on) { list.querySelector(".cp-typing")?.remove(); return; }
    if (list.querySelector(".cp-typing")) return;
    const typing = document.createElement("div"); typing.className = "cp-typing";
    typing.innerHTML = `<span>You are typing</span><span class="dots"><i></i><i></i><i></i></span>`; list.append(typing); list.scrollTop = list.scrollHeight;
  }
  async note(text: string, kind: "ask" | "error" = "ask", at = "") {
    const list = await this.ensure(); const bubble = this.append(list, { id: "", role: "assistant", text, at, streaming: false, attachments: [] }); bubble.classList.add(kind);
  }
  reset() { this.root.querySelector(".cp-list")!.replaceChildren(); this.root.querySelector(".uc-draft")!.textContent = ""; this.info = {}; }
}
