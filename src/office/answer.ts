import gsap from "gsap";
import "./answer.css";
import type { ChatPanel } from "./chat-panel";
import type { Advice } from "./delegate";
import { gameSound } from './sound';

// Answering a robot's question (or approving what it wants to do) from its chat.
// The card sits above the message box while the thread has an open request. It shows the real
// questions with their options, sends the answer through Lucid's paired T3 session in the shape
// T3 Code's own app uses, and goes away once T3 marks the request resolved (also when you
// answered it in T3 Code instead).

export type InputQuestion = {
  id: string; header: string; question: string;
  options: { label: string; description: string; value: string | null }[];
  multiSelect: boolean; allowCustomAnswer: boolean; initialAnswer: string | null;
};
export type PendingRequest =
  | { id: string; type: "input"; at: string; answerable: boolean; reason: string | null; questions: InputQuestion[] }
  | { id: string; type: "approval"; at: string; answerable: boolean; reason: string | null; requestKind: string; prompt: string; detail: string;
      options: { decision: string; label: string; warning: string | null }[] };

type Answers = Record<string, string | string[]>;
type T3 = {
  status(o: { connect?: boolean; threadId?: string | null }): Promise<{ paired: boolean; error: string | null }>;
  respond(o: { threadId: string; requestId: string; answers?: Answers; decision?: string }): Promise<unknown>;
};
export type AnswerDeps = { pending(threadId: string): Promise<PendingRequest[]>; t3?: T3; advice?(requestId: string): Advice | null; poll?: boolean; autoFocus?: boolean };
type AnswerHost = Pick<ChatPanel, "el" | "isOpen" | "threadId">;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const APPROVAL_TITLE: Record<string, string> = {
  command: "Run this command?",
  "file-change": "Allow these file changes?",
  "file-read": "Allow reading this file?",
  permission: "Allow this?",
  "mcp-elicitation": "Allow this tool request?",
};

/** What T3 expects for one question: one choice or your own words as text, several choices as a list. */
export function answerFor(q: InputQuestion, picked: string[], other: string | null): string | string[] | null {
  const text = other?.trim() ? other.trim() : null;
  if (q.multiSelect) {
    const list = [...picked, ...(text ? [text] : [])];
    if (!list.length) return null;
    return list.length === 1 && text ? text : list;
  }
  return text ?? picked[0] ?? null;
}

let uid = 0;
const adviceKey = (a: Advice | null) => (a ? `${a.state}|${a.reason}|${a.answerText ?? ""}` : "");

export class AnswerCard {
  el: HTMLElement;
  private threadId: string | null = null;
  private requests: PendingRequest[] = [];
  private paired: boolean | null = null;
  private wantFocus: string | null = null;
  private sent = new Map<string, string>(); // requests answered from here (what to say once T3 resolves them)
  private busy = false;
  private timer = 0;
  private interval = 0;
  private reading = false;
  private disposed = false;

  constructor(private chat: AnswerHost, private deps: AnswerDeps) {
    this.el = document.createElement("section");
    this.el.className = "cp-answer";
    this.el.hidden = true;
    this.el.addEventListener("submit", (e) => { e.preventDefault(); void this.submit(e.target as HTMLFormElement, (e as SubmitEvent).submitter as HTMLButtonElement | null); });
    this.el.addEventListener("input", (e) => this.onInput(e.target as HTMLElement));
    this.el.addEventListener("change", (e) => this.onInput(e.target as HTMLElement));
    this.el.addEventListener("click", (e) => {
      const c = (e.target as HTMLElement).closest(".ca-connect button") as HTMLButtonElement | null;
      if (c) void this.connect(c);
    });
    // live data: follow whichever thread the chat shows
    if (deps.poll !== false) this.interval = window.setInterval(() => void this.tick(), 1500);
  }

  refresh() { return this.tick(); }

  destroy() {
    this.disposed = true;
    this.threadId = null;
    window.clearInterval(this.interval);
    window.clearTimeout(this.timer);
    gsap.killTweensOf([this.el, ...this.el.querySelectorAll("*")]);
    this.el.remove();
  }

  /** Open questions of this thread get focus as soon as they are loaded. */
  focus(threadId: string) {
    this.wantFocus = threadId;
    void this.tick(true);
  }

  /** Check again soon (new events arrived for this thread). */
  ping(threadId: string) {
    if (threadId !== this.threadId) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.tick(), 300);
  }

  private mount() {
    const form = this.chat.el.querySelector(".cp-form");
    if (this.el.parentElement !== this.chat.el || this.el.nextElementSibling !== form) this.chat.el.insertBefore(this.el, form);
  }

  private async tick(force = false) {
    if (this.disposed) return;
    const id = this.chat.isOpen ? this.chat.threadId : null;
    if (id !== this.threadId) {
      // another robot's chat: start clean, never show the last robot's question there
      this.threadId = id;
      this.requests = [];
      this.sent.clear();
      this.paired = null;
      this.el.innerHTML = "";
      this.el.hidden = true;
      if (id && this.wantFocus !== id && this.deps.autoFocus !== false) this.wantFocus = id;
      force = true;
    }
    if (!id || this.reading || (this.busy && !force)) return;
    this.reading = true;
    try {
    let list: PendingRequest[];
    try { list = await this.deps.pending(id); } catch { return; }
    if (id !== this.threadId || this.chat.threadId !== id || !this.chat.isOpen) return;
    if (list.length && this.paired === null) {
      this.paired = false;
      try { this.paired = !!this.deps.t3 && (await this.deps.t3.status({ threadId: id })).paired; } catch {}
      if (id !== this.threadId || this.chat.threadId !== id || !this.chat.isOpen) return;
    }
    this.apply(list);
    } finally { this.reading = false; }
  }

  private apply(list: PendingRequest[]) {
    this.mount();
    const ids = new Set(list.map((r) => r.id));
    // gone: answered here (sent) or somewhere else (T3 Code)
    for (const old of this.requests) {
      if (ids.has(old.id)) continue;
      const form = this.formFor(old.id);
      const adv = this.deps.advice?.(old.id);
      const byBoss = adv?.state === "answered" && !this.sent.has(old.id) ? `The Orchestrator answered: ${adv.answerText ?? "sent"}.` : null;
      if (form) this.retire(form, byBoss ?? this.sent.get(old.id) ?? "This was answered in T3 Code.");
      this.sent.delete(old.id);
    }
    for (const r of list) {
      const have = this.formFor(r.id);
      if (have) {
        // the orchestrator moved on with this one: a fresh form shows its note (and its
        // suggestion) unless you already started answering, then only the note changes
        const adv = this.deps.advice?.(r.id) ?? null;
        if ((have.dataset.adv ?? "") !== adviceKey(adv) && !have.classList.contains("sending")) {
          if (have.dataset.touched) { have.dataset.adv = adviceKey(adv); this.paintAdvice(have, adv); }
          else { const hadFocus = have.contains(document.activeElement); const f = this.build(r); have.replaceWith(f); if (hadFocus) f.querySelector<HTMLElement>("input:not([type=text]):not(:disabled), .ca-send")?.focus({ preventScroll: true }); }
        }
        continue;
      }
      const form = this.build(r);
      this.el.appendChild(form);
      if (!this.el.hidden) gsap.fromTo(form, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
    }
    this.requests = list;
    this.paintConnect();
    if (list.length) this.el.hidden = false;
    else if (!this.el.querySelector(".ca-req, .ca-done")) this.el.hidden = true;
    if (this.wantFocus === this.threadId && list.length) {
      this.wantFocus = null;
      const first = this.el.querySelector<HTMLElement>(".ca-req input:not([type=text]):not(:disabled), .ca-req textarea:not(:disabled), .ca-req .ca-foot button:not(:disabled)");
      first?.focus({ preventScroll: true });
      this.el.scrollTop = 0;
    } else if (!list.length && this.wantFocus === this.threadId) this.wantFocus = null;
  }

  private formFor(id: string) {
    return [...this.el.querySelectorAll<HTMLFormElement>(".ca-req")].find((f) => f.dataset.req === id) ?? null;
  }

  // The request was resolved: say so in one calm line, then the card folds away.
  private retire(form: HTMLFormElement, text: string) {
    const done = document.createElement("p");
    done.className = "ca-done";
    done.setAttribute("role", "status");
    done.textContent = text;
    const hadFocus = form.contains(document.activeElement) || document.activeElement === document.body;
    form.replaceWith(done);
    // focus goes back to the message box instead of getting lost
    if (hadFocus && this.chat.isOpen) this.chat.el.querySelector<HTMLTextAreaElement>(".cp-form textarea")?.focus({ preventScroll: true });
    gsap.to(done, {
      opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, duration: 0.35, delay: 2.6, ease: "power2.in",
      onComplete: () => { done.remove(); if (!this.el.querySelector(".ca-req, .ca-done")) this.el.hidden = true; },
    });
  }

  // --- building the form -----------------------------------------------------------------

  private build(r: PendingRequest): HTMLFormElement {
    const form = document.createElement("form");
    form.className = `ca-req ${r.type === "approval" ? "ca-approval" : ""}`;
    form.dataset.req = r.id;
    form.noValidate = true;
    const n = ++uid;
    let body = "";
    if (r.type === "input") {
      body = r.questions.map((q, i) => this.question(q, `ca${n}-${i}`, r.questions.length)).join("");
      const many = r.questions.length > 1;
      body += this.foot(r, `<button type="submit" class="cp-send ca-send">${many ? "Send answers" : "Send answer"}</button>`);
    } else {
      const title = APPROVAL_TITLE[r.requestKind] ?? "Allow this?";
      const opts = r.options.length ? r.options : [{ decision: "decline", label: "Deny", warning: null }, { decision: "accept", label: "Approve", warning: null }];
      // the approve choice is the main button; the rest sit beside it, quieter
      const sorted = [...opts].sort((a, b) => Number(a.decision === "accept") - Number(b.decision === "accept"));
      const buttons = sorted.map((o) => `<button type="submit" name="decision" value="${esc(o.decision)}" class="${o.decision === "accept" ? "cp-send ca-send" : "ghost ca-alt"}"${o.warning ? ` title="${esc(o.warning)}"` : ""}>${esc(o.decision === "decline" && /^decline$/i.test(o.label) ? "Deny" : o.label)}</button>`).join("");
      body = `<h3 class="ca-title" id="ca${n}-t">${esc(title)}</h3>
        ${r.prompt ? `<pre class="ca-prompt" aria-labelledby="ca${n}-t">${esc(r.prompt)}</pre>` : ""}
        ${r.detail ? `<p class="ca-detail">${esc(r.detail)}</p>` : ""}
        ${this.foot(r, `<span class="ca-btns">${buttons}</span>`)}`;
      form.setAttribute("aria-labelledby", `ca${n}-t`);
    }
    form.innerHTML = `<p class="ca-boss" role="status" hidden></p>` + body;
    const adv = this.deps.advice?.(r.id) ?? null;
    form.dataset.adv = adviceKey(adv);
    this.paintAdvice(form, adv);
    if (adv?.suggestion && r.type === "input" && (adv.state === "asked" || adv.state === "failed")) this.preselect(form, r, adv);
    if (adv?.decision && r.type === "approval" && (adv.state === "asked" || adv.state === "failed")) form.querySelector<HTMLButtonElement>(`button[value="${CSS.escape(adv.decision)}"]`)?.classList.add("ca-suggested");
    if (!r.answerable) form.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, textarea, button").forEach((x) => (x.disabled = true));
    if (r.type === "input") form.setAttribute("aria-label", r.questions.length > 1 ? "Questions for you" : "Question for you");
    return form;
  }

  // What the orchestrator did with this request, in one plain line above the questions.
  private paintAdvice(form: HTMLElement, a: Advice | null) {
    const p = form.querySelector<HTMLElement>(".ca-boss");
    if (!p) return;
    const text = !a ? ""
      : a.state === "deciding" ? "The Orchestrator is looking at this now. You can still answer it yourself."
      : a.state === "answered" ? `The Orchestrator sent: ${a.answerText ?? "its answer"}. Waiting for the robot to carry on.`
      : a.state === "rule" ? `The Orchestrator leaves this to you. ${a.reason}`
      : a.state === "failed" ? `The Orchestrator could not decide: ${a.reason} It is yours to answer.`
      : `The Orchestrator was not sure: ${a.reason}`;
    const hint = a && (a.state === "asked" || a.state === "failed") && a.answerText ? ` Its suggestion (${a.answerText}) is picked below. Nothing is sent until you send it.` : "";
    p.textContent = text + hint;
    p.hidden = !text;
    p.dataset.state = a?.state ?? "";
  }

  // its suggestion is picked, not sent
  private preselect(form: HTMLFormElement, r: Extract<PendingRequest, { type: "input" }>, a: Advice) {
    for (const fs of form.querySelectorAll<HTMLFieldSetElement>(".ca-q")) {
      const sug = a.suggestion?.[fs.dataset.q!];
      if (!sug) continue;
      const key = fs.dataset.key!;
      for (const box of fs.querySelectorAll<HTMLInputElement>(`input[name="${key}"]:not([data-other-box])`)) box.checked = sug.picked.includes(box.value);
      if (sug.other) {
        const free = fs.querySelector<HTMLTextAreaElement>(`[data-free="${key}"]`);
        if (free) free.value = sug.other;
        const text = fs.querySelector<HTMLInputElement>(`[data-other="${key}"]`);
        if (text) { text.value = sug.other; const box = fs.querySelector<HTMLInputElement>(`#${CSS.escape(key)}-x`); if (box) box.checked = true; }
      }
    }
    void r;
  }

  private question(q: InputQuestion, key: string, count: number) {
    const type = q.multiSelect ? "checkbox" : "radio";
    const legend = q.question || q.header;
    // the question itself is the label; the agent's short header only stands in when there is no question text
    const head = "";
    void count;
    const how = q.multiSelect ? `<span class="ca-how">Choose any that apply</span>` : "";
    const opts = q.options.map((o, i) => {
      const id = `${key}-o${i}`;
      return `<div class="ca-opt"><input type="${type}" id="${id}" name="${key}" value="${esc(o.value ?? o.label)}"${o.description ? ` aria-describedby="${id}-d"` : ""}>
        <label for="${id}"><span class="ca-label">${esc(o.label)}</span>${o.description ? `<span class="ca-desc" id="${id}-d">${esc(o.description)}</span>` : ""}</label></div>`;
    }).join("");
    let other = "";
    if (q.allowCustomAnswer) {
      const init = q.initialAnswer ? ` value="${esc(q.initialAnswer)}"` : "";
      other = q.options.length
        ? `<div class="ca-opt ca-other"><input type="${type}" id="${key}-x" name="${key}" value="" data-other-box${q.initialAnswer ? " checked" : ""}>
            <label for="${key}-x"><span class="ca-label">Other</span></label>
            <input type="text" class="ca-text" data-other="${key}" aria-label="Your own answer" placeholder="Type your own answer"${init}></div>`
        : `<div class="ca-free"><textarea class="ca-text" data-free="${key}" rows="2" aria-labelledby="${key}-l" placeholder="Type your answer">${esc(q.initialAnswer ?? "")}</textarea></div>`;
    }
    return `<fieldset class="ca-q" data-q="${esc(q.id)}" data-key="${key}">
      <legend id="${key}-l">${head}<span class="ca-question">${esc(legend)}</span>${how}</legend>
      ${opts}${other}
    </fieldset>`;
  }

  private foot(r: PendingRequest, actions: string) {
    const note = r.answerable ? "" : esc(r.reason ? "The agent stopped waiting for this answer. Stop the run in T3 and ask again." : "This request can no longer be answered.");
    return `<p class="ca-connect" hidden><span>Connect Lucid to T3 to answer here</span><button type="button" class="ghost">Connect</button></p>
      <div class="ca-foot"><p class="ca-state" role="status" aria-live="polite">${note}</p>${actions}</div>`;
  }

  // typing your own answer picks "Other"; picking a choice in a single-choice question keeps your text
  private onInput(t: HTMLElement) {
    const key = (t as HTMLInputElement).dataset.other;
    if (key && t.matches(".ca-text")) {
      const box = this.el.querySelector<HTMLInputElement>(`#${CSS.escape(key)}-x`);
      if (box && (t as HTMLInputElement).value.trim() && !box.checked) box.checked = true;
    }
    const form = t.closest(".ca-req") as HTMLElement | null;
    if (form) form.dataset.touched = "1";
    const state = form?.querySelector(".ca-state") as HTMLElement | null;
    if (state?.classList.contains("err")) { state.textContent = ""; state.classList.remove("err"); }
    t.closest(".ca-q")?.classList.remove("missing");
  }

  // --- pairing ---------------------------------------------------------------------------

  private paintConnect() {
    const off = this.paired === false;
    this.el.querySelectorAll<HTMLElement>(".ca-connect").forEach((p) => (p.hidden = !off));
    this.el.querySelectorAll<HTMLButtonElement>(".ca-send, .ca-alt").forEach((b) => {
      const req = this.requests.find((r) => r.id === (b.closest(".ca-req") as HTMLElement).dataset.req);
      b.disabled = off || !req?.answerable || (b.closest(".ca-req") as HTMLElement).classList.contains("sending");
    });
  }

  // Same pairing as the chat's own Connect button; the chat is told too so its bar wakes up.
  private async connect(btn: HTMLButtonElement) {
    const t3 = this.deps.t3;
    if (!t3) return;
    btn.disabled = true;
    btn.textContent = "Connecting";
    let error: string | null = null;
    try { const st = await t3.status({ connect: true, threadId: this.threadId }); this.paired = st.paired; error = st.error; } catch (err: any) { error = err?.message || null; }
    btn.disabled = false;
    btn.textContent = "Connect";
    if (this.paired) (this.chat.el.querySelector(".cp-connect button") as HTMLButtonElement | null)?.click();
    this.paintConnect();
    if (!this.paired) {
      const state = btn.closest(".ca-req")?.querySelector(".ca-state") as HTMLElement | null;
      if (state) { state.textContent = error || "T3 did not pair with Lucid. Make sure T3 Code is open, then try again."; state.classList.add("err"); }
    } else this.el.querySelector<HTMLElement>(".ca-req input:not([type=text]), .ca-req .ca-send")?.focus();
  }

  // --- sending -----------------------------------------------------------------------------

  private collect(form: HTMLFormElement, r: Extract<PendingRequest, { type: "input" }>): { answers: Answers; missing: HTMLElement | null } {
    const answers: Answers = {};
    let missing: HTMLElement | null = null;
    for (const fs of form.querySelectorAll<HTMLFieldSetElement>(".ca-q")) {
      const q = r.questions.find((x) => x.id === fs.dataset.q);
      if (!q) continue;
      const key = fs.dataset.key!;
      const boxes = [...fs.querySelectorAll<HTMLInputElement>(`input[name="${key}"]:checked`)];
      const picked = boxes.filter((i) => !i.hasAttribute("data-other-box")).map((i) => i.value);
      const free = fs.querySelector<HTMLTextAreaElement>(`[data-free="${key}"]`);
      const otherOn = boxes.some((i) => i.hasAttribute("data-other-box"));
      const otherText = free ? free.value : otherOn ? fs.querySelector<HTMLInputElement>(`[data-other="${key}"]`)?.value ?? "" : null;
      // "Other" picked in a single-choice question but left empty: not answered yet
      const a = otherOn && !otherText?.trim() && !q.multiSelect ? null : answerFor(q, picked, otherText);
      if (a === null) { fs.classList.add("missing"); missing ??= fs; }
      else { fs.classList.remove("missing"); answers[q.id] = a; }
    }
    return { answers, missing };
  }

  private async submit(form: HTMLFormElement, submitter: HTMLButtonElement | null) {
    const r = this.requests.find((x) => x.id === form.dataset.req);
    const t3 = this.deps.t3, threadId = this.threadId;
    const state = form.querySelector(".ca-state") as HTMLElement;
    if (!r || !threadId || form.classList.contains("sending") || !r.answerable) return;
    if (!t3 || this.paired === false) { this.paintConnect(); form.querySelector<HTMLElement>(".ca-connect button")?.focus(); return; }
    let payload: { answers?: Answers; decision?: string };
    if (r.type === "input") {
      const { answers, missing } = this.collect(form, r);
      if (missing) {
        state.textContent = r.questions.length > 1 ? "Answer every question to send." : "Pick an answer or type your own.";
        state.classList.add("err");
        missing.querySelector<HTMLElement>("input, textarea")?.focus();
        return;
      }
      payload = { answers };
    } else {
      // Enter in an approval does nothing on its own: only a pressed button decides
      if (!submitter?.value) return;
      payload = { decision: submitter.value };
    }
    const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>("input, textarea, button")];
    form.classList.add("sending");
    controls.forEach((c) => (c.disabled = true));
    state.classList.remove("err");
    state.textContent = "Sending";
    this.busy = true;
    try {
      await t3.respond({ threadId, requestId: r.id, ...payload });
      if (this.disposed || this.threadId !== threadId || this.chat.threadId !== threadId) return;
      gameSound.play('switch');
      const verb = r.type === "input" ? "Answer sent" : payload.decision?.startsWith("accept") ? "Approved" : "Denied";
      this.sent.set(r.id, `${verb}. It carries on.`);
      state.textContent = `${verb}. Waiting for it to carry on.`;
      form.classList.add("sent");
    } catch (err: any) {
      form.classList.remove("sending");
      controls.forEach((c) => (c.disabled = false));
      if (err?.code === "unauthorized" || err?.code === "pair-failed") { this.paired = false; this.paintConnect(); }
      state.textContent = `Not sent: ${err?.message || "T3 did not answer."}${err?.code === "rejected" ? "" : " Your answer is still here."}`;
      state.classList.add("err");
    } finally {
      this.busy = false;
      if (threadId === this.threadId) this.ping(threadId);
    }
  }
}
