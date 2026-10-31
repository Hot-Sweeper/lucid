import gsap from "gsap";
import { taskTitle, readable } from "./todo-summary";
import "./todo.css";

// Each office's to-do list: every message you sent to its robots, summarized into a short
// title, with the status T3 reports for it (queued, running, done). The only progress shown is
// real: tasks finished of tasks today, and the steps a robot has ticked off in its own plan.
// The list is patched in place by task id, so rows slide to their new place instead of resetting.

export type RawTask = {
  id: string; threadId: string; projectId: string; ordinal: number;
  status: "queued" | "running" | "done" | "stopped"; asking: boolean; pos: number;
  at: string | null; startedAt: string | null; endedAt: string | null;
  text: string; files: number; steps: { done: number; total: number } | null;
};
export type OfficeInfo = { id: string; title: string; icon: string | null };
type Task = RawTask & { title: string; full: string };
type Hooks = {
  officeOf(task: RawTask): OfficeInfo | null;
  robotName(threadId: string): string | null;
  order(): string[];
  onOffice(id: string): void;
  onTask(threadId: string): void;
};

const SHOW_DONE = 3;
const CIRC = 2 * Math.PI * 6;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const MARK = `<svg class="td-mark" viewBox="0 0 16 16" aria-hidden="true"><circle class="ring" cx="8" cy="8" r="6"/><circle class="arc" cx="8" cy="8" r="6" pathLength="${CIRC.toFixed(2)}"/><path class="tick" d="M5 8.3 7.2 10.4 11 5.8"/></svg>`;

export class OfficeTodo {
  private titles = new Map<string, { title: string; full: string }>();
  private offices = new Map<string, HTMLElement>();
  private rows = new Map<string, HTMLElement>();
  private open = new Set<string>();        // offices whose earlier tasks are unfolded
  private last: Task[] = [];
  private empty: HTMLElement;

  constructor(private root: HTMLElement, private hooks: Hooks) {
    this.empty = document.createElement("p");
    this.empty.className = "td-empty";
    this.empty.textContent = "Nothing queued or running.";
    root.appendChild(this.empty);
    root.addEventListener("click", (e) => {
      const el = e.target as HTMLElement;
      const head = el.closest(".td-oh") as HTMLElement | null;
      if (head) { hooks.onOffice((head.closest(".td-office") as HTMLElement).dataset.office!); return; }
      const more = el.closest(".td-more") as HTMLElement | null;
      if (more) {
        const id = (more.closest(".td-office") as HTMLElement).dataset.office!;
        if (this.open.has(id)) this.open.delete(id); else this.open.add(id);
        this.render(this.last);
        return;
      }
      const row = el.closest(".td-task") as HTMLElement | null;
      if (row) hooks.onTask(row.dataset.thread!);
    });
  }

  update(raw: RawTask[]) {
    const tasks: Task[] = [];
    for (const r of raw) {
      let t = this.titles.get(r.id);
      if (!t) { t = { title: taskTitle(r.text, r.files), full: readable(r.text, 260) }; this.titles.set(r.id, t); }
      tasks.push({ ...r, ...t });
    }
    this.last = tasks;
    this.render(tasks);
  }

  private render(tasks: Task[]) {
    // group by office, in the order the building shows its rooms
    const by = new Map<string, { info: OfficeInfo; tasks: Task[] }>();
    for (const t of tasks) {
      const info = this.hooks.officeOf(t);
      if (!info) continue;
      let g = by.get(info.id);
      if (!g) by.set(info.id, (g = { info, tasks: [] }));
      g.tasks.push(t);
    }
    const order = this.hooks.order();
    const ids = [...by.keys()].sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));

    // remember where every row is, so the ones that move can slide from there
    const before = new Map<string, number>();
    for (const [id, el] of this.rows) if (el.isConnected) before.set(id, el.getBoundingClientRect().top);

    this.empty.hidden = ids.length > 0;
    const alive = new Set<string>();
    let prev: Element | null = null;
    for (const oid of ids) {
      const g = by.get(oid)!;
      let box = this.offices.get(oid);
      if (!box) {
        box = document.createElement("div");
        box.className = "td-office";
        box.dataset.office = oid;
        box.innerHTML = `<button type="button" class="td-oh"><span class="td-oi"></span><span class="td-on"></span><span class="td-count"></span></button><div class="td-bar" role="progressbar" aria-valuemin="0"><i></i></div><ol class="td-list"></ol><button type="button" class="td-more" hidden></button>`;
        this.offices.set(oid, box);
      }
      if (box.previousElementSibling !== prev) this.root.insertBefore(box, prev ? prev.nextSibling : this.root.firstChild);
      prev = box;
      this.paintOffice(box, g.info, g.tasks, alive);
    }
    for (const [oid, box] of this.offices) if (!by.has(oid)) { box.remove(); this.offices.delete(oid); }
    for (const [id, el] of this.rows) if (!alive.has(id)) { this.rows.delete(id); el.remove(); }

    // slide moved rows from where they were; new rows slide in from the left
    if (!still()) for (const id of alive) {
      const el = this.rows.get(id)!;
      const was = before.get(id);
      if (was == null) {
        if (before.size) gsap.fromTo(el, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out", clearProps: "opacity,x" });
        continue;
      }
      const d = was - el.getBoundingClientRect().top;
      if (Math.abs(d) > 1) gsap.fromTo(el, { y: d }, { y: 0, duration: 0.34, ease: "power2.out", clearProps: "y" });
    }
  }

  private paintOffice(box: HTMLElement, info: OfficeInfo, tasks: Task[], alive: Set<string>) {
    const icon = box.querySelector(".td-oi") as HTMLElement;
    const html = info.icon ? `<img src="${esc(info.icon)}" alt="">` : `<i></i>`;
    if (icon.dataset.k !== html) { icon.innerHTML = html; icon.dataset.k = html; }
    const name = box.querySelector(".td-on") as HTMLElement;
    if (name.textContent !== info.title) name.textContent = info.title;

    // running first, then the queue in the order T3 delivers it, then what finished (newest first)
    const queueIdx = new Map<string, number>();
    const perThread = new Map<string, Task[]>();
    for (const t of tasks) if (t.status === "queued") (perThread.get(t.threadId) ?? perThread.set(t.threadId, []).get(t.threadId)!).push(t);
    for (const list of perThread.values()) list.sort((a, b) => a.pos - b.pos || a.ordinal - b.ordinal).forEach((t, i) => queueIdx.set(t.id, i));
    const running = tasks.filter((t) => t.status === "running").sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || "") || a.ordinal - b.ordinal);
    const queued = tasks.filter((t) => t.status === "queued").sort((a, b) => (queueIdx.get(a.id)! - queueIdx.get(b.id)!) || (a.at || "").localeCompare(b.at || ""));
    const ended = tasks.filter((t) => t.status === "done" || t.status === "stopped").sort((a, b) => (b.endedAt || "").localeCompare(a.endedAt || ""));
    const unfolded = this.open.has(box.dataset.office!);
    const shownEnded = unfolded ? ended : ended.slice(0, SHOW_DONE);
    const list = [...running, ...queued, ...shownEnded];

    // the only numbers shown: tasks finished of the tasks asked today
    const done = tasks.filter((t) => t.status === "done").length;
    const total = tasks.filter((t) => t.status !== "stopped").length;
    const count = box.querySelector(".td-count") as HTMLElement;
    const text = total ? `${done} of ${total}` : "";
    if (count.textContent !== text) count.textContent = text;
    count.title = total ? `${done} of ${total} requests finished today` : "";
    const bar = box.querySelector(".td-bar") as HTMLElement;
    bar.hidden = !total;
    bar.setAttribute("aria-valuemax", String(total));
    bar.setAttribute("aria-valuenow", String(done));
    bar.setAttribute("aria-label", `${info.title}: ${done} of ${total} requests finished today`);
    (bar.firstElementChild as HTMLElement).style.transform = `scaleX(${total ? done / total : 0})`;

    const ol = box.querySelector(".td-list") as HTMLElement;
    let prev: Element | null = null;
    for (const t of list) {
      alive.add(t.id);
      let li = this.rows.get(t.id);
      if (!li) {
        li = document.createElement("li");
        li.className = "td-row";
        li.innerHTML = `<button type="button" class="td-task">${MARK}<span class="td-txt"><span class="td-t"></span><span class="td-m"></span></span></button>`;
        this.rows.set(t.id, li);
      }
      if (li.parentElement !== ol || li.previousElementSibling !== prev) ol.insertBefore(li, prev ? prev.nextSibling : ol.firstChild);
      prev = li;
      this.paintRow(li, t, queueIdx.get(t.id) ?? 0);
    }
    const more = box.querySelector(".td-more") as HTMLElement;
    const hidden = ended.length - shownEnded.length;
    more.hidden = ended.length <= SHOW_DONE;
    const label = unfolded ? "Show fewer" : `${hidden} earlier today`;
    if (more.textContent !== label) more.textContent = label;
    more.setAttribute("aria-expanded", String(unfolded));
  }

  private paintRow(li: HTMLElement, t: Task, ahead: number) {
    const btn = li.firstElementChild as HTMLElement;
    btn.dataset.thread = t.threadId;
    const state = t.status === "running" && t.asking ? "ask" : t.status === "running" ? (t.steps ? "steps" : "run") : t.status;
    if (li.dataset.state !== state) { li.dataset.state = state; btn.className = `td-task s-${state}`; }
    const title = li.querySelector(".td-t") as HTMLElement;
    if (title.textContent !== t.title) title.textContent = t.title;
    const robot = this.hooks.robotName(t.threadId);
    const meta = [
      t.status === "queued" ? (ahead ? `Queued, ${ahead} ahead` : "Queued, next up")
        : t.status === "running" ? (t.asking ? "Waiting for your answer" : t.steps ? `Working, ${t.steps.done} of ${t.steps.total} steps` : "Working")
        : t.status === "done" ? `Done ${clock(t.endedAt)}`
        : "Stopped",
      robot,
    ].filter(Boolean).join(" · ");
    const m = li.querySelector(".td-m") as HTMLElement;
    if (m.textContent !== meta) m.textContent = meta;
    const tip = `${t.full || t.title}${robot ? `\n${robot}` : ""}`;
    if (btn.title !== tip) btn.title = tip;
    // real step progress runs around the ring; without a plan it is an honest endless arc
    const arc = li.querySelector(".arc") as SVGElement;
    const frac = t.steps ? t.steps.done / t.steps.total : 0;
    arc.style.strokeDashoffset = state === "steps" ? String((CIRC * (1 - Math.max(0.04, frac))).toFixed(2)) : "";
  }
}
