import { icon } from "../ui/icons";
import { esc } from "../util/html";
import { chatFileUrl, chatMediaKind, thumbSrc } from "./chat-media";
import type { ChatMessage as Msg } from "./chat-message";
import { composeMessage, messageParts, type MessageFile } from "./message-parts";
import { orderLabel, queueSummary, reorderPlan, rowActions, type PendingSend } from "./queue-model";
import "./chat-queue.css";

// Your queued messages, docked above the message box: the one place a message lives until T3
// delivers it to the robot. Each row shows its full words (folded past a few lines, with Show
// all), its files and its place, and offers T3's own queue operations.

type QueueApi = {
  reorder(o: { threadId: string; runId: string; beforeRunId: string | null }): Promise<unknown>;
  cancel(o: { threadId: string; runId: string }): Promise<unknown>;
  edit(o: { threadId: string; runId: string; text: string }): Promise<unknown>;
  steer(o: { threadId: string; queuedRunId: string; targetRunId: string }): Promise<unknown>;
  startQueued?(o: { threadId: string; runId?: string | null }): Promise<unknown>;
};
export type QueueHost = {
  threadId(): string | null;
  /** The paired T3 session, or null: without it the queue is read-only. */
  t3(): QueueApi | null;
  failed(err: unknown): void;
  refresh(ms: number): void;
  zoom(src: string, kind: string, name: string): void;
  /** Words you were editing when the message left the queue go back to the message box. */
  rescue(text: string): void;
};

const ICON = { grip: icon("grip", 14), up: icon("chevronUp", 14), down: icon("chevronDown", 14), edit: icon("edit", 14), remove: icon("close", 14), file: icon("file", 12), thread: icon("chat", 12), fold: icon("chevronDown", 14) };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE_IN_OUT = "cubic-bezier(.77, 0, .175, 1)", EASE_OUT = "cubic-bezier(0, 0, .58, 1)", EASE_IN = "cubic-bezier(.42, 0, 1, 1)";

export class ChatQueue {
  private ol: HTMLOListElement;
  private items: Msg[] = [];
  private pending: PendingSend[] = [];
  private hold = 0;                       // dragging, editing or confirming: live updates wait
  // open interactions and the row each belongs to (null: the whole list, like a drag)
  private cleanups = new Map<(left: boolean) => void, HTMLElement | null>();
  private busy = new Set<string>();       // runs with an action on its way: repeats are ignored
  private gone = new Set<string>();       // removed here, until T3 stops listing them
  private expanded = new Set<string>();
  private sig = "";
  private measure = 0;

  constructor(readonly el: HTMLElement, private host: QueueHost) {
    el.className = "cp-queue";
    el.hidden = true;
    el.setAttribute("aria-label", "Queued messages");
    el.innerHTML = `<div class="cq-head"><button type="button" class="cq-fold" aria-expanded="true"><b>Queued</b><span class="cq-count"></span>${ICON.fold}</button>`
      + `<button type="button" class="ghost compact cq-resume" title="You stopped the robot, so T3 holds the queue. Resume sends the next message." hidden>Resume</button></div>`
      + `<p class="cq-note" role="alert" hidden></p><ol></ol>`;
    this.ol = el.querySelector("ol")!;
    const fold = el.querySelector<HTMLButtonElement>(".cq-fold")!;
    fold.addEventListener("click", () => {
      const open = fold.getAttribute("aria-expanded") !== "true";
      fold.setAttribute("aria-expanded", String(open));
      el.classList.toggle("folded", !open);
      if (open) this.clamp();
    });
    el.querySelector(".cq-resume")!.addEventListener("click", (e) => void this.resume(e.currentTarget as HTMLButtonElement));
    new ResizeObserver(() => this.clamp()).observe(this.ol);
    this.wire();
  }

  /** Messages in the queue (T3's) plus the ones on their way into it. */
  get size() { return this.items.length + this.pending.length; }
  get ids() { return this.items.map((m) => m.id); }

  /** A new conversation: nothing carries over. */
  clear() {
    this.cancel(false);
    this.items = []; this.pending = []; this.hold = 0; this.busy.clear(); this.gone.clear(); this.expanded.clear();
    this.sig = ""; this.ol.replaceChildren(); this.el.hidden = true;
    (this.el.querySelector(".cq-note") as HTMLElement).hidden = true;
  }

  /** Ends a drag, an edit or a question (another conversation, or the list changed under it). */
  cancel(left = true) { for (const clean of [...this.cleanups.keys()]) clean(left); }

  /** Where each row's words are on screen, so a delivered message can fly from there into the transcript. */
  rects(ids: string[]) {
    const out = new Map<string, DOMRect>();
    if (this.el.hidden || this.el.classList.contains("folded")) return out;
    for (const id of ids) {
      const text = this.row(id)?.querySelector<HTMLElement>(".cq-text");
      if (text) out.set(id, text.getBoundingClientRect());
    }
    return out;
  }

  /** T3's queue, in delivery order. Messages that left it are dropped at once (delivered ones fly on from here). */
  render(items: Msg[]) {
    for (const id of this.gone) if (!items.some((m) => m.id === id)) this.gone.delete(id);
    const next = items.filter((m) => !this.gone.has(m.id));
    const left = new Set(this.items.filter((m) => !next.some((n) => n.id === m.id)).map((m) => m.id));
    this.items = next;
    if (this.hold && left.size) {
      // a message left while you drag, edit or confirm: only what it touches ends; its row goes now
      for (const [clean, li] of [...this.cleanups]) if (!li || left.has(li.dataset.id!)) clean(true);
      for (const id of left) this.row(id)?.remove();
      this.number();
    }
    if (!this.hold) this.paint();
  }

  /** Messages you sent while the robot works, until T3 lists them. */
  setPending(list: PendingSend[]) { this.pending = list; if (!this.hold) this.paint(); }

  private row(id: string) { return this.ol.querySelector<HTMLElement>(`li[data-id="${CSS.escape(id)}"]`); }

  private paint() {
    const t3 = this.host.t3(), live = !!t3;
    const held = this.items.some((m) => m.queueHeld);
    this.el.hidden = !this.items.length && !this.pending.length;
    const count = this.el.querySelector<HTMLElement>(".cq-count")!;
    const summary = queueSummary(this.items.length + this.pending.length, held);
    if (count.textContent !== summary) count.textContent = summary;
    (this.el.querySelector(".cq-resume") as HTMLElement).hidden = !(held && live && t3?.startQueued);
    const sig = JSON.stringify([live, this.items.map((m) => [m.id, m.text, m.queueRunId, m.steerTarget, m.queueHeld, m.queueFixed, m.queueGuest, m.attachments.length]), this.pending.map((p) => [p.key, p.text])]);
    if (sig === this.sig) return;
    this.sig = sig;
    const old = new Map([...this.ol.children].map((li) => [(li as HTMLElement).dataset.id!, li as HTMLElement]));
    const fresh: HTMLElement[] = [];
    const take = (id: string) => { let li = old.get(id); if (li) old.delete(id); else { li = document.createElement("li"); li.dataset.id = id; fresh.push(li); } return li; };
    const rows = [
      ...this.items.map((m, i) => { const li = take(m.id); this.fill(li, m, i, live); return li; }),
      ...this.pending.map((p) => { const li = take(`pending:${p.key}`); this.fillPending(li, p); return li; }),
    ];
    for (const li of old.values()) li.remove();
    rows.forEach((li, i) => { if (this.ol.children[i] !== li) this.ol.insertBefore(li, this.ol.children[i] ?? null); });
    this.number();
    if (fresh.length && !reduced()) fresh.forEach((li, i) => li.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 200, delay: i * 30, easing: EASE_OUT, fill: "backwards" }));
    this.clamp();
  }

  private files(m: Pick<Msg, "text" | "attachments">, removable = false, kept?: MessageFile[]) {
    const parts = messageParts(m.text);
    const url = (path: string) => chatFileUrl(path);
    const thumb = (path: string, name: string, kind: string | null, i = -1) => {
      const x = removable && i >= 0 ? `<button type="button" class="cq-x" data-drop-file="${i}" aria-label="Remove ${esc(name)}" title="Remove this file">${icon("close", 12)}</button>` : "";
      if (kind === "image") return `<span class="cq-att"><button type="button" class="cq-thumb" data-media-src="${esc(url(path))}" data-media-kind="image" data-media-name="${esc(name)}" aria-label="Preview ${esc(name)}"><img src="${esc(thumbSrc(url(path), 112))}" alt="" loading="lazy" decoding="async"></button>${x}</span>`;
      return `<span class="cq-att cq-file" title="${esc(path)}">${ICON.file}<span>${esc(name)}</span>${x}</span>`;
    };
    return [
      ...parts.refs.map((r) => `<span class="cq-att cq-file" title="${esc(r.project)}">${ICON.thread}<span>${esc(r.title)}</span></span>`),
      ...(kept ?? parts.files).map((f) => thumb(f.path, f.name, f.kind === "image" ? "image" : chatMediaKind(f.path), (kept ?? parts.files).indexOf(f))),
      ...m.attachments.filter((a) => a.path).map((a) => thumb(a.path!, a.name, chatMediaKind(a.path!, a.mime || (a.type === "image" ? "image/" : "")))),
    ].join("");
  }

  private fill(li: HTMLElement, m: Msg, i: number, live: boolean) {
    const a = rowActions(this.items, i, live);
    const sig = JSON.stringify([m.text, m.queueRunId, m.attachments.length, a.move, a.edit, a.send, a.remove, m.queueFixed]);
    li.dataset.run = m.queueRunId ?? "";
    li.classList.remove("pending");
    li.classList.toggle("fixed", !!m.queueFixed);
    if (li.dataset.sig === sig) return;
    li.dataset.sig = sig;
    const parts = messageParts(m.text);
    const button = (act: string, label: string, svg: string, on = true) => `<button type="button" class="cp-icon cq-act" data-act="${act}" aria-label="${label}" title="${label}"${on ? "" : " disabled"}>${svg}</button>`;
    li.innerHTML = `<div class="cq-line">`
      + (a.move ? `<button type="button" class="cq-grip" aria-label="Reorder: drag, or use the arrow keys" title="Drag to reorder">${ICON.grip}</button>` : `<span class="cq-grip"></span>`)
      + `<span class="cq-n"></span>`
      + (m.queueFixed ? `<span class="cq-why">Automatic report</span>` : "")
      + `<span class="cq-acts">`
      + (a.send ? `<button type="button" class="ghost compact cq-send" data-act="send" title="${esc(a.sendNote)}">Send now</button>` : "")
      + (a.move ? button("up", "Move up", ICON.up) + button("down", "Move down", ICON.down) : "")
      + (a.move ? button("edit", a.editNote, ICON.edit, a.edit) : "")
      + (a.remove ? button("remove", "Remove from the queue", ICON.remove) : "")
      + `</span></div>`
      + `<div class="cq-body"><p class="cq-text"></p><button type="button" class="cq-more" aria-expanded="false" hidden>Show all</button></div>`
      + `<div class="cq-files">${this.files(m)}</div>`;
    const text = li.querySelector<HTMLElement>(".cq-text")!;
    text.textContent = parts.body;
    text.hidden = !parts.body;
    li.classList.toggle("open", this.expanded.has(m.id));
  }

  private fillPending(li: HTMLElement, p: PendingSend) {
    if (li.dataset.sig === `pending:${p.text}`) return;
    li.dataset.sig = `pending:${p.text}`;
    li.classList.add("pending");
    li.setAttribute("aria-busy", "true");
    li.innerHTML = `<div class="cq-line"><span class="cq-grip"></span><span class="cq-n">Adding</span></div><div class="cq-body"><p class="cq-text"></p><button type="button" class="cq-more" aria-expanded="false" hidden>Show all</button></div><div class="cq-files">${this.files({ text: p.text, attachments: [] })}</div>`;
    const body = messageParts(p.text).body, text = li.querySelector<HTMLElement>(".cq-text")!;
    text.textContent = body; text.hidden = !body;
  }

  // "Next", "2", "3" after any change of order, and which arrows make sense
  private number() {
    const rows = [...this.ol.children].filter((li) => !li.classList.contains("pending")) as HTMLElement[];
    const first = rows.findIndex((li) => !li.classList.contains("fixed"));
    rows.forEach((li, i) => {
      const n = li.querySelector<HTMLElement>(".cq-n")!;
      if (n.textContent !== orderLabel(i)) n.textContent = orderLabel(i);
      const grip = li.querySelector<HTMLElement>("button.cq-grip");
      grip?.setAttribute("aria-label", `Reorder ${orderLabel(i) === "Next" ? "the next message" : `message ${i + 1}`}: drag, or use the arrow keys`);
      const up = li.querySelector<HTMLButtonElement>('[data-act="up"]'), down = li.querySelector<HTMLButtonElement>('[data-act="down"]');
      if (up) up.disabled = i <= first;
      if (down) down.disabled = i === rows.length - 1;
    });
  }

  // Long words fold to a few lines with Show all; nothing is cut off without a way to read it.
  private clamp() {
    cancelAnimationFrame(this.measure);
    this.measure = requestAnimationFrame(() => {
      for (const li of this.ol.children as HTMLCollectionOf<HTMLElement>) {
        const text = li.querySelector<HTMLElement>(".cq-text"), more = li.querySelector<HTMLButtonElement>(".cq-more");
        if (!text || !more || li.classList.contains("editing")) continue;
        const open = li.classList.contains("open");
        const long = open ? text.scrollHeight > parseFloat(getComputedStyle(text).lineHeight) * 5 + 2 : text.scrollHeight > text.clientHeight + 1;
        li.classList.toggle("clamped", long && !open);
        if (more.hidden === long) more.hidden = !long;
        const label = open ? "Show less" : "Show all";
        if (more.textContent !== label) { more.textContent = label; more.setAttribute("aria-expanded", String(open)); }
      }
    });
  }

  private note(text: string) {
    const p = this.el.querySelector<HTMLElement>(".cq-note")!;
    p.textContent = text;
    p.hidden = false;
    window.clearTimeout(Number(p.dataset.t));
    p.dataset.t = String(window.setTimeout(() => (p.hidden = true), 7000));
  }

  private fail(err: unknown) {
    this.host.failed(err);
    this.note(String((err as Error)?.message || err || "T3 did not answer."));
  }

  private setHold(on: boolean) {
    this.hold = Math.max(0, this.hold + (on ? 1 : -1));
    if (!this.hold) { this.sig = ""; this.paint(); }
  }

  private async resume(b: HTMLButtonElement) {
    const t3 = this.host.t3(), threadId = this.host.threadId();
    if (!t3?.startQueued || !threadId || b.disabled) return;
    b.disabled = true; b.setAttribute("aria-busy", "true");
    try { await t3.startQueued({ threadId }); this.host.refresh(150); }
    catch (err) { if (threadId === this.host.threadId()) this.fail(err); }
    finally { b.disabled = false; b.removeAttribute("aria-busy"); }
  }

  private wire() {
    const ol = this.ol;
    const rows = () => [...ol.children].filter((li) => !li.classList.contains("pending")) as HTMLElement[];
    // FLIP: rows glide from where they were on screen to their new places
    const glide = (list: HTMLElement[], seen: Map<HTMLElement, number>) => {
      if (reduced()) return;
      for (const x of list) {
        const dy = (seen.get(x) ?? 0) - x.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) x.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 220, easing: EASE_IN_OUT });
      }
    };
    // Moves a row on screen at once, then tells T3; puts it back if T3 says no.
    const move = async (li: HTMLElement, to: number, seen?: Map<HTMLElement, number>) => {
      const t3 = this.host.t3(), threadId = this.host.threadId(), list = rows();
      const plan = t3 && threadId ? reorderPlan(list.map((x) => ({ queueRunId: x.dataset.run, queueFixed: x.classList.contains("fixed") })), li.dataset.run!, to) : null;
      if (!plan || !t3 || !threadId || this.busy.has(li.dataset.run!)) return;
      const from = list.indexOf(li);
      seen ??= new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
      ol.insertBefore(li, plan.beforeRunId ? list.find((x) => x.dataset.run === plan.beforeRunId)! : list.at(-1)!.nextSibling);
      glide(list, seen);
      this.number();
      this.setHold(true);
      this.busy.add(li.dataset.run!);
      try {
        await t3.reorder({ threadId, runId: li.dataset.run!, beforeRunId: plan.beforeRunId });
        const m = this.items.find((x) => x.id === li.dataset.id);
        if (m) { this.items = this.items.filter((x) => x !== m); this.items.splice(plan.to, 0, m); }
      } catch (err) {
        if (threadId !== this.host.threadId()) return;
        const back = new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
        ol.insertBefore(li, rows().filter((x) => x !== li)[from] ?? ol.querySelector("li.pending"));
        glide(list, back);
        this.number();
        this.fail(err);
      } finally {
        this.busy.delete(li.dataset.run!);
        this.setHold(false);
        this.host.refresh(250);
      }
    };

    ol.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const media = target.closest<HTMLElement>("[data-media-src]");
      if (media) { this.host.zoom(media.dataset.mediaSrc!, media.dataset.mediaKind!, media.dataset.mediaName!); return; }
      const more = target.closest<HTMLButtonElement>(".cq-more");
      if (more) { this.toggle(more.closest("li")!); return; }
      const b = target.closest<HTMLButtonElement>("[data-act]");
      const li = b?.closest("li") as HTMLElement | null;
      if (!b || !li || b.disabled || this.busy.has(li.dataset.run || "")) return;
      const i = rows().indexOf(li), act = b.dataset.act;
      if (act === "up" || act === "down") void move(li, act === "up" ? i - 1 : i + 1).then(() => li.querySelector<HTMLElement>(`[data-act="${act}"]:not(:disabled)`)?.focus() ?? li.querySelector<HTMLElement>(".cq-grip")?.focus());
      else if (act === "edit") this.edit(li);
      else if (act === "remove") this.confirmRemove(li);
      else if (act === "send") void this.sendNow(li, b);
    });

    // keyboard: arrow keys on the grip, or Alt and the arrow keys anywhere in the row, move it
    ol.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const target = e.target as HTMLElement, grip = target.closest<HTMLElement>("button.cq-grip");
      if (!grip && !(e.altKey && !target.closest("textarea"))) return;
      const li = target.closest("li") as HTMLElement | null;
      if (!li?.querySelector("button.cq-grip")) return;
      e.preventDefault();
      void move(li, rows().indexOf(li) + (e.key === "ArrowUp" ? -1 : 1)).then(() => (grip ?? target).focus());
    });

    // dragging by the grip: the other rows make room where it will land
    ol.addEventListener("pointerdown", (e) => {
      const grip = (e.target as HTMLElement).closest<HTMLElement>("button.cq-grip");
      if (!grip || e.button !== 0) return;
      e.preventDefault();
      const li = grip.closest("li") as HTMLElement, list = rows(), from = list.indexOf(li);
      const min = Math.max(0, list.findIndex((x) => !x.classList.contains("fixed")));
      const rects = list.map((x) => x.getBoundingClientRect());
      const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 6;
      const step = rects[from].height + gap, startY = e.clientY, pointerId = e.pointerId;
      let to = from, dragging = false;
      try { grip.setPointerCapture(pointerId); } catch { /* window handlers cover lost capture */ }
      this.setHold(true);
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dy = ev.clientY - startY;
        if (!dragging && Math.abs(dy) < 4) return; // a click is not a drag
        if (!dragging) { dragging = true; li.classList.add("dragging"); document.body.classList.add("cq-dragging"); }
        li.style.transform = `translateY(${dy}px) scale(1.01)`;
        const mid = rects[from].top + rects[from].height / 2 + dy;
        to = from;
        while (to < list.length - 1 && mid > rects[to + 1].top + rects[to + 1].height / 2) to++;
        while (to > min && mid < rects[to - 1].top + rects[to - 1].height / 2) to--;
        list.forEach((x, i) => {
          if (x === li) return;
          const shift = from < to && i > from && i <= to ? -step : to < from && i >= to && i < from ? step : 0;
          x.style.transform = shift ? `translateY(${shift}px)` : "";
        });
        // the labels follow the preview, so "Next" is always the top row
        const preview = list.filter((x) => x !== li);
        preview.splice(to, 0, li);
        preview.forEach((x, i) => (x.querySelector(".cq-n")!.textContent = orderLabel(i)));
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
        this.cleanups.delete(onCancel);
        li.classList.remove("dragging");
        document.body.classList.remove("cq-dragging");
        const seen = new Map(list.map((x) => [x, x.getBoundingClientRect().top]));
        list.forEach((x) => (x.style.transform = ""));
        if (to !== from) void move(li, to, seen).finally(() => this.setHold(false));
        else { glide(list, seen); this.number(); this.setHold(false); }
      };
      const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(false); };
      const onCancel = () => finish(true);
      const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); finish(true); } };
      this.cleanups.set(onCancel, null);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("blur", onCancel);
      window.addEventListener("keydown", onKey, true);
      grip.addEventListener("lostpointercapture", onCancel);
    });
  }

  private toggle(li: HTMLElement) {
    const text = li.querySelector<HTMLElement>(".cq-text")!, more = li.querySelector<HTMLButtonElement>(".cq-more")!;
    const before = text.getBoundingClientRect().height;
    const open = !li.classList.contains("open");
    li.classList.toggle("open", open);
    li.classList.toggle("clamped", !open);
    if (open) this.expanded.add(li.dataset.id!); else this.expanded.delete(li.dataset.id!);
    more.textContent = open ? "Show less" : "Show all";
    more.setAttribute("aria-expanded", String(open));
    if (!reduced()) text.animate([{ height: `${before}px` }, { height: `${text.getBoundingClientRect().height}px` }], { duration: 200, easing: EASE_IN_OUT });
  }

  // Send now: into the current turn while the robot works, or as the next turn after a stop. The
  // row stays until T3 delivers the message; then it moves into the transcript.
  private async sendNow(li: HTMLElement, b: HTMLButtonElement) {
    const t3 = this.host.t3(), threadId = this.host.threadId();
    const m = this.items.find((x) => x.id === li.dataset.id);
    const run = li.dataset.run!;
    if (!t3 || !threadId || !m || this.busy.has(run)) return;
    this.busy.add(run);
    li.setAttribute("aria-busy", "true");
    b.disabled = true; b.textContent = "Sending";
    try {
      if (m.steerTarget) await t3.steer({ threadId, queuedRunId: run, targetRunId: m.steerTarget });
      else if (t3.startQueued) await t3.startQueued({ threadId, runId: run });
      this.host.refresh(150);
    } catch (err) {
      if (threadId === this.host.threadId()) { this.fail(err); b.disabled = false; b.textContent = "Send now"; li.removeAttribute("aria-busy"); }
    } finally { this.busy.delete(run); }
  }

  // Edit in place: only your words change; threads and the files you keep go back unchanged.
  private edit(li: HTMLElement) {
    const m = this.items.find((x) => x.id === li.dataset.id);
    const t3 = this.host.t3(), threadId = this.host.threadId();
    if (!m || !t3 || !threadId || li.classList.contains("editing")) return;
    const parts = messageParts(m.text);
    let kept = [...parts.files];
    this.setHold(true);
    li.classList.add("editing");
    const body = li.querySelector<HTMLElement>(".cq-body")!, files = li.querySelector<HTMLElement>(".cq-files")!;
    const box = document.createElement("div");
    box.className = "cq-edit";
    box.innerHTML = `<textarea rows="2" aria-label="Edit queued message"></textarea><div class="cq-files"></div><div class="cq-edit-bar"><button type="button" class="primary compact cq-save">Save</button><button type="button" class="ghost compact cq-discard">Cancel</button><span>Ctrl+Enter saves, Esc cancels</span></div>`;
    const ta = box.querySelector("textarea")!, list = box.querySelector<HTMLElement>(".cq-files")!;
    const paintFiles = () => { list.innerHTML = this.files(m, true, kept); list.hidden = !list.innerHTML; };
    const grow = () => { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight + 2, 220)}px`; };
    ta.value = parts.body;
    paintFiles();
    body.replaceWith(box); files.remove();
    grow();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.addEventListener("input", grow);
    list.addEventListener("click", (e) => {
      const x = (e.target as HTMLElement).closest<HTMLElement>("[data-drop-file]");
      if (!x) return;
      e.stopPropagation();
      kept = kept.filter((_f, i) => i !== Number(x.dataset.dropFile));
      paintFiles();
      ta.focus();
    });
    let finished = false;
    const finish = (left = false) => {
      if (finished) return;
      finished = true;
      this.cleanups.delete(finish);
      window.removeEventListener("keydown", onEsc, true);
      // the message was sent or removed while you edited: your words are kept, not lost
      if (left && ta.value.trim() && ta.value.trim() !== parts.body.trim()) { this.host.rescue(ta.value); this.note("That message left the queue before you saved. Your edit is in the message box."); }
      box.replaceWith(body); li.append(files);
      li.classList.remove("editing");
      this.setHold(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && box.contains(document.activeElement)) { e.preventDefault(); e.stopImmediatePropagation(); finish(); li.querySelector<HTMLElement>('[data-act="edit"]')?.focus(); } };
    window.addEventListener("keydown", onEsc, true);
    this.cleanups.set(finish, li);
    const save = async () => {
      if (!ta.value.trim() && !kept.length && !parts.blocks.length) { this.note("A queued message cannot be empty. Remove it instead."); return; }
      const text = composeMessage(parts, ta.value, kept);
      if (text === m.text) { finish(); return; }
      const run = li.dataset.run!, saveBtn = box.querySelector<HTMLButtonElement>(".cq-save")!;
      if (this.busy.has(run)) return;
      this.busy.add(run);
      saveBtn.disabled = true; saveBtn.textContent = "Saving"; saveBtn.setAttribute("aria-busy", "true");
      try {
        await t3.edit({ threadId, runId: run, text });
        if (threadId !== this.host.threadId()) return;
        m.text = text; li.dataset.sig = "";
        finish();
        this.host.refresh(200);
      } catch (err) {
        if (threadId !== this.host.threadId()) return;
        saveBtn.disabled = false; saveBtn.textContent = "Save"; saveBtn.removeAttribute("aria-busy");
        this.fail(err); // your words stay in the box
      } finally { this.busy.delete(run); }
    };
    box.querySelector(".cq-save")!.addEventListener("click", () => void save());
    box.querySelector(".cq-discard")!.addEventListener("click", () => { finish(); li.querySelector<HTMLElement>('[data-act="edit"]')?.focus(); });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } });
  }

  // Removing cannot be undone in T3, so the row asks once, in place.
  private confirmRemove(li: HTMLElement) {
    const t3 = this.host.t3(), threadId = this.host.threadId();
    if (!t3 || !threadId || li.classList.contains("confirming")) return;
    this.setHold(true);
    li.classList.add("confirming");
    const bar = document.createElement("div");
    bar.className = "cq-confirm";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Remove this queued message");
    bar.innerHTML = `<span>Remove this message from the queue? This cannot be undone.</span><button type="button" class="ghost compact cq-no">Keep</button><button type="button" class="primary compact danger cq-yes">Remove</button>`;
    li.appendChild(bar);
    const keep = bar.querySelector<HTMLButtonElement>(".cq-no")!;
    keep.focus();
    let finished = false;
    const finish = () => { if (finished) return; finished = true; this.cleanups.delete(finish); window.removeEventListener("keydown", onEsc, true); bar.remove(); li.classList.remove("confirming"); this.setHold(false); };
    const back = () => { finish(); li.querySelector<HTMLElement>('[data-act="remove"]')?.focus(); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && bar.contains(document.activeElement)) { e.preventDefault(); e.stopImmediatePropagation(); back(); } };
    window.addEventListener("keydown", onEsc, true);
    this.cleanups.set(finish, li);
    keep.addEventListener("click", back);
    bar.querySelector(".cq-yes")!.addEventListener("click", async (e) => {
      const yes = e.currentTarget as HTMLButtonElement, run = li.dataset.run!;
      if (this.busy.has(run)) return;
      this.busy.add(run);
      yes.disabled = true; yes.textContent = "Removing"; yes.setAttribute("aria-busy", "true");
      try {
        await t3.cancel({ threadId, runId: run });
        if (threadId !== this.host.threadId()) return;
        this.gone.add(li.dataset.id!);
        this.items = this.items.filter((m) => m.id !== li.dataset.id);
        const next = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null;
        (next?.querySelector<HTMLElement>("button.cq-grip") ?? document.querySelector<HTMLElement>(".cp-form textarea"))?.focus();
        const out = reduced() ? null : li.animate([{ opacity: 1, height: `${li.offsetHeight}px` }, { opacity: 0, height: "0px", marginTop: "-6px" }], { duration: 180, easing: EASE_IN });
        const done = () => { finish(); this.host.refresh(100); };
        if (out) out.onfinish = done; else done();
      } catch (err) {
        finish();
        if (threadId === this.host.threadId()) this.fail(err);
      } finally { this.busy.delete(run); }
    });
  }
}
