import gsap from "gsap";
import type { WM } from "./wm";
import { colOf, type TaskStep } from "./tasks";
import { esc, typeInto } from "./typing";
import { NOTE_APPS } from "./work-apps";
import "./work-apps.css";

/** Notes contain only real reasoning, plan steps and queued user requests. */
export class NotesApp {
  private plan: TaskStep[] = [];
  private queued: { id: string; text: string }[] = [];
  private title = "Thread notes";
  constructor(private wm: WM) {}
  reset() { this.plan = []; this.queued = []; this.title = "Thread notes"; }

  private async ensure() {
    const kind = this.wm.prefs?.notes ?? "notes";
    this.wm.brandApp("notes", { title: NOTE_APPS[kind].name, icon: NOTE_APPS[kind].icon });
    this.wm.frameHint.notes = kind === "apple" ? { x: 100, y: 16, w: 620, h: 378 } : { x: 310, y: 22, w: 480, h: 370 };
    const w = await this.wm.open("notes");
    let root = w.body.querySelector<HTMLElement>(".note-app");
    if (!root || root.dataset.kind !== kind) {
      w.body.innerHTML = `<div class="note-app na-${kind}" data-kind="${kind}">
        <div class="na-menu">${kind === "notepadpp" ? "File　Edit　Search　View　Encoding　Language" : kind === "pad" ? "File　Edit　View" : ""}</div>
        <div class="na-layout"><aside class="na-folders"><b>On My Robot</b><span class="na-folder">Notes</span></aside>
        <nav class="na-pages" aria-label="Notes"><button type="button" data-page="scratch" class="on"><b>Thread notes</b><span class="na-preview"></span></button><button type="button" data-page="plan" hidden><b>Work list</b><span class="na-plan-preview"></span></button></nav>
        <section class="na-paper"><header class="na-head"><span class="na-title"></span><span class="na-format" aria-hidden="true">Aa <svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="m4.5 8 2.5 2.5 4.5-5"/></svg></span></header>
        <div class="notes" data-note-pane="scratch"></div><div class="na-work" data-note-pane="plan" hidden><h3>Work list</h3><ol class="na-todos"></ol><section class="na-queued" hidden><h4>Queued from you</h4><ol></ol></section></div>
        </section></div><footer class="na-foot"></footer></div>`;
      root = w.body.querySelector(".note-app")!;
      root.querySelectorAll<HTMLButtonElement>("[data-page]").forEach((button) => button.addEventListener("click", () => this.page(root!, button.dataset.page!)));
      this.renderPlan(root);
    }
    root.querySelector(".na-title")!.textContent = this.title;
    root.querySelector(".na-title")!.setAttribute("title", this.title);
    return root;
  }

  private page(root: HTMLElement, page: string) {
    root.querySelector<HTMLElement>(".na-foot")!.hidden = page !== "plan";
    root.querySelectorAll<HTMLElement>("[data-note-pane]").forEach((pane) => pane.hidden = pane.dataset.notePane !== page);
    root.querySelectorAll<HTMLElement>("[data-page]").forEach((button) => {
      button.classList.toggle("on", button.dataset.page === page);
      button.setAttribute("aria-current", button.dataset.page === page ? "page" : "false");
    });
  }

  async open(title?: string) {
    this.title = title || this.title;
    const root = await this.ensure();
    this.page(root, "scratch");
    const preview = root.querySelector(".na-preview")!;
    preview.textContent = this.title;
    return root.querySelector<HTMLElement>(".notes")!;
  }

  private renderPlan(root: HTMLElement) {
    root.querySelector<HTMLButtonElement>('[data-page="plan"]')!.hidden = !this.plan.length && !this.queued.length;
    root.querySelector(".na-plan-preview")!.textContent = `${this.plan.filter((s) => colOf(s.status) === "done").length} of ${this.plan.length} done`;
    root.querySelector(".na-todos")!.innerHTML = this.plan.map((step, i) => {
      const state = colOf(step.status);
      const box = this.wm.prefs?.notes === "pad" || this.wm.prefs?.notes === "notepadpp" ? (state === "done" ? "[x]" : "[ ]") : (state === "done" ? "✓" : "");
      return `<li class="na-task ${state}" data-step="${i}"><span class="na-check" aria-label="${state === "done" ? "Completed" : state === "doing" ? "In progress" : "To do"}">${box}</span><span>${esc(step.text)}</span></li>`;
    }).join("");
    const queue = root.querySelector<HTMLElement>(".na-queued")!;
    queue.hidden = !this.queued.length;
    queue.querySelector("ol")!.innerHTML = this.queued.map((q) => `<li data-id="${esc(q.id)}">${esc(q.text || "(attachment)")}</li>`).join("");
    root.querySelector(".na-foot")!.textContent = `${this.plan.filter((s) => colOf(s.status) === "done").length} of ${this.plan.length} tasks done${this.queued.length ? ` · ${this.queued.length} queued` : ""}`;
  }

  async showPlan(steps: TaskStep[], opts: { instant?: boolean; title?: string } = {}) {
    this.title = opts.title || this.title;
    const root = await this.ensure();
    const previous = this.plan;
    this.plan = steps.map((s) => ({ text: String(s.text || ""), status: s.status })).filter((s) => s.text.trim());
    this.renderPlan(root); this.page(root, "plan");
    if (opts.instant) return;
    // Only genuine status changes get a cursor click; the checkmark follows that click.
    const changes = this.plan.map((step, i) => ({ step, i })).filter(({ step, i }) => previous[i]?.text === step.text && colOf(previous[i].status) !== colOf(step.status)).slice(0, 2);
    for (const { step, i } of changes) {
      const row = root.querySelector<HTMLElement>(`[data-step="${i}"]`)!;
      row.className = `na-task ${colOf(previous[i].status)}`;
      const check = row.querySelector<HTMLElement>(".na-check")!;
      const final = check.textContent;
      check.textContent = this.wm.prefs?.notes === "pad" || this.wm.prefs?.notes === "notepadpp" ? (colOf(previous[i].status) === "done" ? "[x]" : "[ ]") : (colOf(previous[i].status) === "done" ? "✓" : "");
      const scroller = root.querySelector<HTMLElement>(".na-work")!;
      scroller.scrollTop = Math.max(0, row.offsetTop - scroller.offsetTop - 45);
      await this.wm.pointAt(check, 0.5, 0.5, 260); await this.wm.click();
      check.textContent = final; row.className = `na-task ${colOf(step.status)}`;
      gsap.fromTo(check, { scale: 0.8 }, { scale: 1, duration: 0.2 });
    }
    const added = this.plan.findIndex((step) => !previous.some((s) => s.text === step.text));
    if (added >= 0) {
      const target = root.querySelector<HTMLElement>(`[data-step="${added}"] > span:last-child`)!;
      await this.wm.pointAt(target, 0.3, 0.5, 260); await this.wm.click();
      const text = this.plan[added].text;
      await typeInto(this.wm, target, text.slice(0, 90), { budgetMs: 700 });
      target.textContent = text;
    }
  }

  async syncQueue(queued: { id: string; text: string }[], opts: { instant?: boolean; title?: string } = {}) {
    if (!queued.length && !this.queued.length) return;
    this.title = opts.title || this.title;
    const root = await this.ensure();
    const changed = queued.find((q) => this.queued.find((old) => old.id === q.id)?.text !== q.text);
    this.queued = queued.map((q) => ({ ...q }));
    this.renderPlan(root); this.page(root, "plan");
    if (!opts.instant && changed) {
      const target = root.querySelector<HTMLElement>(`[data-id="${CSS.escape(changed.id)}"]`)!;
      await this.wm.pointAt(target, 0.4, 0.5, 260); await this.wm.click();
      await typeInto(this.wm, target, changed.text.slice(0, 90), { budgetMs: 650 });
      target.textContent = changed.text || "(attachment)";
    }
  }
}
