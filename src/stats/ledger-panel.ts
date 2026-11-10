// The coin ledger: a fitness tracker for the company. Opened from the coin counters, it shows
// coins earned per day (one per dollar of API-priced robot work), streaks, the user's own pace,
// personal records and where the coins came from. Numbers come from coin-calendar.ts; nothing is
// estimated. Beating a personal record plays one short celebration at the coin counter.
import "./ledger-panel.css";
import { coinIcon, type Wallet } from "../office/wallet";
import { formatCoins } from "../office/coin-ledger";
import { gameSound } from "../office/sound";
import { brandFor } from "../office/brand";
import type { RobotLook } from "../office/rig";
import { portraitSvg } from "../world/look";
import { PALETTES } from "../world/seated-parts";
import { addDays, breakdown, dayDate, dayKey, heatScale, mergeDays, summarize, weekStart, type CalendarDoc, type Days, type PersonalRecord, type Share, type Summary } from "./coin-calendar";

export type LedgerRobot = { id: string; name: string; provider: string; look: RobotLook };
type Options = {
  load: () => Promise<CalendarDoc>;
  /** Reads the coins once more (coin-rewards.ts), which also refreshes the calendar. */
  refresh: () => Promise<void>;
  wallet: Wallet;
  robotOf: (threadId: string) => LedgerRobot | null;
};
type Scope = "day" | "week" | "month" | "all";
type Kind = "projects" | "robots" | "threads";

const WEEKS = 26;
const ROWS = 8;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const short = (key: string) => dayDate(key).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const long = (key: string) => dayDate(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const weekdayName = (key: string) => dayDate(key).toLocaleDateString("en-GB", { weekday: "long" });
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const RECORD_NAME: Record<PersonalRecord["kind"], string> = { day: "Best day", week: "Best week", streak: "Longest streak" };
const CHEER: Record<PersonalRecord["kind"], string> = { day: "New best day", week: "New best week", streak: "Longest streak yet" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const setText = (e: HTMLElement, text: string) => { if (e.textContent !== text) e.textContent = text; };

/** A small radio group with a sliding indicator, keyboard operable with the arrow keys. */
function segmented<T extends string>(label: string, options: [T, string][], onPick: (value: T) => void) {
  const root = el("div", "cl-seg");
  root.setAttribute("role", "radiogroup"); root.setAttribute("aria-label", label);
  const thumb = el("span", "cl-seg-thumb"); thumb.setAttribute("aria-hidden", "true");
  root.append(thumb);
  const buttons = options.map(([value, text]) => {
    const b = el("button", "", text); b.type = "button"; b.dataset.value = value; b.setAttribute("role", "radio");
    b.addEventListener("click", () => onPick(value));
    root.append(b); return b;
  });
  root.addEventListener("keydown", e => {
    const i = buttons.findIndex(b => b.getAttribute("aria-checked") === "true");
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = buttons[(i + step + buttons.length) % buttons.length];
    next.focus(); onPick(next.dataset.value as T);
  });
  return {
    root,
    set(value: T, labels?: Partial<Record<T, string>>) {
      for (const b of buttons) {
        const on = b.dataset.value === value;
        b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1;
        const text = labels?.[b.dataset.value as T]; if (text) setText(b, text);
      }
      const on = buttons.find(b => b.dataset.value === value);
      // Only measured when the group is laid out; the indicator then slides to its place.
      if (!on?.offsetWidth) return;
      const first = !thumb.style.width; // lands in place on first show instead of sliding in
      if (first) thumb.style.transition = "none";
      thumb.style.width = `${on.offsetWidth}px`; thumb.style.transform = `translateX(${on.offsetLeft}px)`;
      if (first) { void thumb.offsetWidth; thumb.style.transition = ""; }
    },
  };
}

export class CoinLedgerPanel {
  readonly root = el("section", "coin-ledger");
  private announcer = el("p", "cl-sr");
  private figs = { week: el("span", "st-big"), weekNote: el("span", "cl-note"), streak: el("span", "st-big"), streakNote: el("span", "cl-note"), best: el("span", "st-big"), bestDay: el("button", "link-btn cl-note") };
  private grid = el("div", "cl-grid");
  private months = el("div", "cl-months");
  private earlier = el("button", "icon-btn cl-page");
  private later = el("button", "icon-btn cl-page");
  private dayNote = el("p", "cl-daynote");
  private records = el("div", "cl-records");
  private list = el("ol", "cl-list");
  private more = el("button", "link-btn cl-more");
  private listNote = el("p", "cl-listnote");
  private foot = el("p", "cl-foot");
  private status = el("p", "cl-status");
  private scopeSeg: ReturnType<typeof segmented<Scope>>;
  private kindSeg: ReturnType<typeof segmented<Kind>>;
  private doc: CalendarDoc | null = null;
  private rev = -1;
  private reading: Promise<void> | null = null;
  private trigger: HTMLElement | null = null;
  private returnFocus: HTMLElement | null = null;
  private selected: string | null = null;
  private hovered: string | null = null;
  private scope: Scope = "month";
  private kind: Kind = "projects";
  private showAll = false;
  private endWeek: string | null = null;
  private view: { days: Days; summary: Summary } | null = null;
  private closing = 0;

  constructor(private opts: Options) {
    const r = this.root;
    r.id = "coin-ledger"; r.hidden = true; r.tabIndex = -1;
    r.setAttribute("role", "dialog"); r.setAttribute("aria-labelledby", "cl-title");
    const head = el("header", "cl-head");
    const title = el("h2", "", "Coin ledger"); title.id = "cl-title";
    const close = el("button", "ghost cl-close", "Close"); close.type = "button";
    close.addEventListener("click", () => this.close());
    head.append(title, close);

    const figs = el("div", "cl-figs");
    const fig = (big: HTMLElement, cap: string, note: HTMLElement) => { const f = el("div", "cl-fig"); f.append(big, el("span", "st-cap", cap), note); figs.append(f); };
    fig(this.figs.week, "this week", this.figs.weekNote);
    fig(this.figs.streak, "streak", this.figs.streakNote);
    fig(this.figs.best, "best day", this.figs.bestDay);
    this.figs.bestDay.type = "button";
    this.figs.bestDay.addEventListener("click", () => { const d = this.view?.summary.bestDay?.day; if (d) this.pick(d, true); });

    const cal = el("div", "cl-cal");
    const calHead = el("div", "cl-calhead");
    const calTitle = el("h3", "", "Coins per day"); calTitle.id = "cl-cal-title";
    for (const [b, label, step] of [[this.earlier, "Earlier weeks", -1], [this.later, "Later weeks", 1]] as const) {
      b.type = "button"; b.setAttribute("aria-label", label); b.title = label;
      b.innerHTML = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="${step < 0 ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
      b.addEventListener("click", () => this.page(step));
    }
    calHead.append(calTitle, this.earlier, this.later);
    const body = el("div", "cl-calbody");
    const wd = el("div", "cl-wd"); wd.setAttribute("aria-hidden", "true");
    for (const d of ["Mon", "", "Wed", "", "Fri", "", ""]) wd.append(el("span", "", d));
    this.months.setAttribute("aria-hidden", "true");
    this.grid.setAttribute("role", "group"); this.grid.setAttribute("aria-labelledby", "cl-cal-title");
    this.grid.setAttribute("aria-describedby", "cl-cal-hint");
    const hint = el("span", "cl-sr", "Arrow keys move between days. Each day shows its coins below."); hint.id = "cl-cal-hint";
    const scroller = el("div", "cl-weeks"); scroller.append(this.months, this.grid);
    body.append(wd, scroller);
    const legend = el("div", "cl-legend"); legend.setAttribute("aria-hidden", "true");
    legend.append(el("span", "", "Less"), ...[0, 1, 2, 3, 4].map(l => { const i = el("i", "cl-cell"); i.dataset.l = String(l); return i; }), el("span", "", "More"));
    this.dayNote.setAttribute("aria-live", "polite");
    const calFoot = el("div", "cl-calfoot"); calFoot.append(this.dayNote, legend);
    cal.append(calHead, body, hint, calFoot);
    this.grid.addEventListener("click", e => { const d = (e.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset.day; if (d) this.pick(d); });
    this.grid.addEventListener("keydown", e => this.key(e));
    this.grid.addEventListener("pointerover", e => { const d = (e.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset.day ?? null; if (d !== this.hovered) { this.hovered = d; this.paintDayNote(); } });
    this.grid.addEventListener("pointerleave", () => { this.hovered = null; this.paintDayNote(); });

    const rec = el("section", "cl-sec");
    rec.append(el("h3", "", "Personal records"), this.records);

    const split = el("section", "cl-sec");
    const splitHead = el("div", "cl-splithead");
    splitHead.append(el("h3", "", "Where the coins came from"));
    this.scopeSeg = segmented<Scope>("Time span", [["day", "Today"], ["week", "This week"], ["month", "30 days"], ["all", "All"]], v => { this.scope = v; this.showAll = false; if (v === "day" && !this.selected) this.selected = this.view?.summary.today ?? null; this.paintSplit(); this.paintGrid(); });
    this.kindSeg = segmented<Kind>("Group by", [["projects", "Projects"], ["robots", "Robots"], ["threads", "Threads"]], v => { this.kind = v; this.showAll = false; this.paintSplit(); });
    const controls = el("div", "cl-controls"); controls.append(this.scopeSeg.root, this.kindSeg.root);
    this.more.type = "button";
    this.more.addEventListener("click", () => { this.showAll = !this.showAll; this.paintSplit(); });
    split.append(splitHead, controls, this.list, this.more, this.listNote);

    this.status.setAttribute("role", "status");
    this.announcer.setAttribute("role", "status");
    r.append(head, figs, cal, rec, split, this.foot, this.status);
    document.body.append(r, this.announcer);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      if (this.doc) this.checkRecords();
      if (!r.hidden) this.render();
    });
  }

  get open() { return !this.root.hidden && !this.closing; }

  /** Called after every coin read with the calendar revision from the main process. */
  observe(rev: number | undefined) {
    if (typeof rev !== "number" || rev === this.rev) return;
    void this.read(rev);
  }

  private read(rev?: number): Promise<void> {
    if (this.reading) return this.reading;
    this.reading = this.opts.load().then(doc => {
      this.doc = doc; this.rev = doc.rev ?? rev ?? -1;
      this.view = null;
      this.checkRecords();
      if (this.open) this.render();
      setText(this.status, "");
    }).catch(err => {
      if (this.open) setText(this.status, `The ledger could not be read: ${err?.message || err}. Saved coins are safe; it will try again.`);
    }).finally(() => { this.reading = null; });
    return this.reading;
  }

  private compute() {
    const today = dayKey(new Date());
    if (this.view?.summary.today === today) return this.view;
    const d = mergeDays(this.doc, this.opts.wallet.dailyHistory);
    return this.view = { days: d, summary: summarize(d, today) };
  }

  toggle(trigger: HTMLElement, returnFocus: HTMLElement = trigger) { if (this.open && this.trigger === trigger) this.close(); else this.show(trigger, returnFocus); }

  show(trigger: HTMLElement, returnFocus: HTMLElement = trigger) {
    window.clearTimeout(this.closing); this.closing = 0;
    this.root.classList.remove("cl-leaving");
    this.trigger = trigger; this.returnFocus = returnFocus;
    const wasHidden = this.root.hidden;
    this.root.hidden = false;
    this.endWeek = null;
    this.render();
    this.place(trigger);
    if (wasHidden) {
      trigger.setAttribute("aria-expanded", "true");
      window.addEventListener("keydown", this.onKey, true);
      document.addEventListener("pointerdown", this.onDown, true);
      this.root.classList.remove("cl-entering"); void this.root.offsetWidth; this.root.classList.add("cl-entering");
      gameSound.play("open");
    }
    this.root.querySelector<HTMLElement>(".cl-close")!.focus({ preventScroll: true });
    // Fresh numbers without waiting: the saved calendar shows at once, a new read follows.
    void this.opts.refresh().catch(() => {}).then(() => this.doc ? undefined : this.read());
  }

  close() {
    if (this.root.hidden || this.closing) return;
    window.removeEventListener("keydown", this.onKey, true);
    document.removeEventListener("pointerdown", this.onDown, true);
    this.trigger?.setAttribute("aria-expanded", "false");
    const finish = () => { this.closing = 0; this.root.hidden = true; this.root.classList.remove("cl-leaving", "cl-entering"); };
    if (reduced() || document.hidden) finish();
    else { this.root.classList.add("cl-leaving"); this.closing = window.setTimeout(finish, 150); }
    const back = this.returnFocus?.isConnected && this.returnFocus.getClientRects().length ? this.returnFocus : this.trigger;
    back?.focus({ preventScroll: true });
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !this.open) return;
    e.preventDefault(); e.stopImmediatePropagation(); this.close();
  };
  private onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!this.root.contains(t) && !this.trigger?.contains(t)) this.close();
  };

  /** Beside the counter that opened it, kept inside the window. */
  private place(trigger: HTMLElement) {
    const t = trigger.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, m = 16;
    const w = Math.min(this.root.offsetWidth, vw - 2 * m), h = Math.min(this.root.offsetHeight, vh - 2 * m);
    let left = t.right + 12 + w <= vw - m ? t.right + 12 : t.left - 12 - w >= m ? t.left - 12 - w : (vw - w) / 2;
    let top = t.top;
    if (top + h > vh - m) top = vh - m - h;
    left = Math.max(m, Math.min(left, vw - m - w)); top = Math.max(m, top);
    this.root.style.left = `${Math.round(left)}px`; this.root.style.top = `${Math.round(top)}px`;
    this.root.style.transformOrigin = `${Math.round(t.left + t.width / 2 - left)}px ${Math.round(t.top + t.height / 2 - top)}px`;
  }

  private render() {
    if (this.root.hidden || document.hidden) return;
    const { summary: s } = this.compute();
    setText(this.figs.week, formatCoins(s.week));
    const by = weekdayName(s.today);
    setText(this.figs.weekNote, s.usualByNow === null ? "Your usual week shows after one full week"
      : Math.abs(s.week - s.usualByNow) < .005 ? `Right on your usual ${by}`
      : `${s.week > s.usualByNow ? "Ahead of" : "Behind"} your usual ${formatCoins(s.usualByNow)} by ${by}`);
    setText(this.figs.streak, days(s.streak));
    setText(this.figs.streakNote, s.streak > 0 && s.todayCoins <= 0 ? "Coins today keep it going" : `Longest ${days(s.longestStreak)}`);
    setText(this.figs.best, s.bestDay ? formatCoins(s.bestDay.coins) : "0");
    setText(this.figs.bestDay, s.bestDay ? short(s.bestDay.day) : "No coins yet");
    this.figs.bestDay.disabled = !s.bestDay;
    this.paintGrid();
    this.paintRecords();
    this.paintSplit();
    setText(this.foot, !this.doc ? "Reading the ledger" : s.first
      ? `${formatCoins(s.total)} coins over ${days(s.activeDays)} with work since ${short(s.first)}. One coin is one dollar of robot work at API prices.`
      : "No coins yet. Every dollar of robot work at API prices adds a coin to today.");
  }

  private paintGrid() {
    if (this.root.hidden) return;
    const { days: d, summary: s } = this.compute();
    const level = heatScale(d);
    const current = weekStart(s.today);
    const end = this.endWeek ?? current;
    const start = addDays(end, -7 * (WEEKS - 1));
    const focusedDay = (document.activeElement as HTMLElement | null)?.closest?.(".cl-grid [data-day]") ? (document.activeElement as HTMLElement).dataset.day : null;
    const tab = this.selected && this.selected >= start && this.selected <= addDays(end, 6) && this.selected <= s.today ? this.selected : end === current ? s.today : addDays(end, 6);
    let cells = "", months = "", lastMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const monday = addDays(start, w * 7), month = dayDate(monday).getMonth();
      if (month !== lastMonth) { months += `<span style="grid-column:${w + 1}">${dayDate(monday).toLocaleDateString("en-GB", { month: "short" })}</span>`; lastMonth = month; }
      for (let i = 0; i < 7; i++) {
        const k = addDays(monday, i);
        if (k > s.today) { cells += `<span class="cl-cell cl-future" aria-hidden="true"></span>`; continue; }
        const day = d.get(k), coins = day?.coins ?? 0, before = !s.first || k < s.first;
        const label = `${short(k)}: ${before ? "before the ledger began" : coins > 0 ? `${formatCoins(coins)} coins` : "no coins"}`;
        cells += `<button type="button" class="cl-cell${k === s.today ? " cl-today" : ""}${before ? " cl-before" : ""}" data-day="${k}" data-l="${level(coins)}"${k === this.selected ? ' aria-pressed="true"' : ""} tabindex="${k === tab ? 0 : -1}" aria-label="${esc(label)}"></button>`;
      }
    }
    this.grid.innerHTML = cells;
    this.months.innerHTML = months;
    const firstWeek = s.first ? weekStart(s.first) : current;
    this.earlier.disabled = start <= firstWeek;
    this.later.disabled = end >= current;
    if (focusedDay) this.grid.querySelector<HTMLElement>(`[data-day="${focusedDay}"]`)?.focus({ preventScroll: true });
    this.paintDayNote();
  }

  private page(step: number) {
    const s = this.compute().summary, current = weekStart(s.today);
    const end = addDays(this.endWeek ?? current, step * 7 * (WEEKS - 4));
    this.endWeek = end >= current ? null : end;
    this.paintGrid();
    gameSound.play("switch");
  }

  private key(e: KeyboardEvent) {
    const from = (e.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset.day;
    if (!from) return;
    const move: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (!(e.key in move)) return;
    e.preventDefault();
    const s = this.compute().summary;
    const to = addDays(from, move[e.key]);
    if (to > s.today) return;
    // Past either edge, the calendar scrolls by one week.
    const current = weekStart(s.today), end = this.endWeek ?? current, start = addDays(end, -7 * (WEEKS - 1));
    if (to < start) this.endWeek = addDays(end, -7);
    else if (to > addDays(end, 6)) this.endWeek = addDays(end, 7) >= current ? null : addDays(end, 7);
    this.selected = to; this.hovered = null;
    if (this.scope === "day") this.paintSplit();
    this.paintGrid();
    this.grid.querySelector<HTMLElement>(`[data-day="${to}"]`)?.focus({ preventScroll: true });
  }

  private pick(day: string, reveal = false) {
    this.selected = day; this.hovered = null; this.scope = "day"; this.showAll = false;
    if (reveal) { const current = weekStart(this.compute().summary.today), w = weekStart(day); this.endWeek = w >= addDays(current, -7 * (WEEKS - 1)) || addDays(w, 28) >= current ? null : addDays(w, 28); }
    this.paintGrid(); this.paintSplit();
    if (reveal) this.grid.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus({ preventScroll: true });
  }

  private paintDayNote() {
    const { days: d, summary: s } = this.compute();
    const k = this.hovered ?? this.selected ?? s.today;
    const day = d.get(k);
    const threads = day?.threads ? Object.keys(day.threads).length : 0;
    setText(this.dayNote, !s.first || k < s.first ? `${long(k)}: before the ledger began`
      : !day ? `${long(k)}: no coins`
      : `${long(k)}: ${formatCoins(day.coins)} coins${day.threads ? ` from ${threads} ${threads === 1 ? "thread" : "threads"}` : ", a daily total from before threads were tracked"}`);
  }

  private paintRecords() {
    const s = this.compute().summary;
    const rows: HTMLElement[] = [];
    if (!s.records.some(r => r.eligible)) {
      this.records.replaceChildren(el("p", "cl-listnote", "Records start once there are a few days of work to compare."));
      return;
    }
    for (const r of s.records) {
      const row = el("div", "cl-record"); row.dataset.kind = r.kind;
      row.classList.toggle("cl-beaten", r.beaten);
      const top = el("div", "cl-rtop");
      const fmt = (n: number) => r.kind === "streak" ? days(n) : formatCoins(n);
      top.append(el("span", "cl-rname", RECORD_NAME[r.kind]), el("span", "cl-rval", !r.eligible ? "" : r.beaten ? `New record: ${fmt(r.current)}` : `${fmt(r.current)} of ${fmt(r.best)}`));
      row.append(top);
      if (r.eligible) {
        const bar = el("div", "st-bar"); bar.setAttribute("role", "meter");
        bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", String(r.best)); bar.setAttribute("aria-valuenow", String(Math.min(r.current, r.best)));
        bar.setAttribute("aria-label", `${RECORD_NAME[r.kind]}: ${fmt(r.current)} of ${fmt(r.best)}`);
        const fill = el("i"); fill.style.width = `${Math.min(100, r.best ? r.current / r.best * 100 : 0)}%`;
        bar.append(fill);
        if (r.usual !== null && r.best > 0 && r.usual < r.best) { const tick = el("b", "st-pacemark"); tick.setAttribute("aria-hidden", "true"); tick.style.left = `${r.usual / r.best * 100}%`; bar.append(tick); }
        row.append(bar);
      }
      const note = !r.eligible ? (r.kind === "day" ? "Counts after three days with coins" : r.kind === "week" ? "Counts after two weeks with coins" : "Counts after a two day streak")
        : r.kind === "day" ? (r.usual !== null ? `Your usual day is ${formatCoins(r.usual)}` : "")
        : r.kind === "week" ? (r.usual !== null ? `Usually ${formatCoins(r.usual)} by ${weekdayName(s.today)}` : "")
        : r.beaten ? "Every day with coins adds one" : "";
      if (note) row.append(el("p", "cl-rnote", note));
      rows.push(row);
    }
    this.records.replaceChildren(...rows);
  }

  private range(s: Summary): [string, string] {
    if (this.scope === "day") { const d = this.selected ?? s.today; return [d, d]; }
    if (this.scope === "week") return [weekStart(s.today), s.today];
    if (this.scope === "month") return [addDays(s.today, -29), s.today];
    return [s.first ?? s.today, s.today];
  }

  private paintSplit() {
    const { days: d, summary: s } = this.compute();
    const day = this.selected ?? s.today;
    this.scopeSeg.set(this.scope, { day: day === s.today ? "Today" : dayDate(day).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) });
    this.kindSeg.set(this.kind);
    const [from, to] = this.range(s);
    const b = breakdown(d, this.doc?.threads ?? {}, from, to, id => this.opts.robotOf(id));
    const items: Share[] = b[this.kind];
    const shown = this.showAll ? items : items.slice(0, ROWS);
    const max = items[0]?.coins || 1;
    const rows = shown.map(item => {
      const li = el("li", "cl-row");
      if (this.kind === "robots") {
        const face = el("span", "cl-face"); face.setAttribute("aria-hidden", "true");
        const robot = item.id === "none" ? null : this.robotById(item.id);
        if (robot) face.innerHTML = portraitSvg(robot.look, PALETTES[brandFor(robot.provider)], { size: 28 });
        li.append(face);
      }
      const name = el("span", "cl-name", item.name);
      name.title = item.name;
      if (item.detail) name.append(el("small", "", item.detail));
      const num = el("b", "cl-num"); num.innerHTML = `${coinIcon(13)}<span>${esc(formatCoins(item.coins))}</span>`;
      const share = el("i", "cl-share"); share.style.setProperty("--w", String(Math.max(.02, item.coins / max)));
      li.append(name, num, share);
      return li;
    });
    this.list.classList.toggle("cl-faces", this.kind === "robots");
    this.list.replaceChildren(...rows);
    this.more.hidden = items.length <= ROWS;
    setText(this.more, this.showAll ? "Show fewer" : `Show all ${items.length}`);
    const empty = !items.length && !b.unattributed;
    setText(this.listNote, empty ? (this.scope === "day" ? `No coins on ${short(day)}` : "No coins in this time span")
      : b.unattributed ? `${formatCoins(b.unattributed)} coins come from daily totals saved before threads were tracked, so they have no breakdown.` : "");
    this.listNote.hidden = !this.listNote.textContent;
  }

  private robotById(id: string) {
    for (const threadId of Object.keys(this.doc?.threads ?? {})) { const r = this.opts.robotOf(threadId); if (r?.id === id) return r; }
    return null;
  }

  // ---- personal records ------------------------------------------------------------------

  private checkRecords() {
    if (document.hidden) return; // checked again on the next read, so nobody misses it
    const s = this.compute().summary;
    const fresh = s.records.filter(r => r.beaten && this.opts.wallet.celebrated(r.kind) !== r.key);
    if (!fresh.length) return;
    for (const r of fresh) this.opts.wallet.markCelebrated(r.kind, r.key);
    this.celebrate(fresh);
  }

  private celebrate(records: PersonalRecord[]) {
    const first = records[0];
    const detail = first.kind === "streak" ? `${days(first.current)} in a row` : first.kind === "day" ? `${formatCoins(first.current)} coins today` : `${formatCoins(first.current)} coins this week`;
    const title = records.length > 1 ? `${CHEER[first.kind]}, and ${records.slice(1).map(r => RECORD_NAME[r.kind].toLowerCase()).join(" and ")} too` : CHEER[first.kind];
    this.announcer.textContent = `${title}: ${detail}.`;
    gameSound.play("level");
    if (this.open) for (const r of records) {
      const row = this.records.querySelector<HTMLElement>(`[data-kind="${r.kind}"]`);
      row?.classList.remove("cl-flash"); void row?.offsetWidth; row?.classList.add("cl-flash");
    }
    const anchor = [document.getElementById("coin-bank"), document.getElementById("rail-coins")].find(e => e && e.getClientRects().length && !e.closest("[hidden]"));
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    const cheer = el("div", "cl-cheer"); cheer.setAttribute("aria-hidden", "true");
    cheer.innerHTML = `${coinIcon(22)}<span><b>${esc(title)}</b><small>${esc(detail)}</small></span>`;
    document.body.append(cheer);
    const w = cheer.offsetWidth, h = cheer.offsetHeight;
    const left = Math.max(12, Math.min(a.left + a.width / 2 - w / 2, innerWidth - w - 12));
    const top = a.top - h - 12 >= 12 ? a.top - h - 12 : a.bottom + 12;
    cheer.style.left = `${Math.round(left)}px`; cheer.style.top = `${Math.round(top)}px`;
    const still = reduced();
    const enter = still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(10px) scale(.94)" }, { opacity: 1, transform: "none" }];
    const leave = still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-8px)" }];
    cheer.animate(enter, { duration: still ? 150 : 320, easing: "cubic-bezier(.34, 1.56, .64, 1)", fill: "both" });
    window.setTimeout(() => { const out = cheer.animate(leave, { duration: 180, easing: "cubic-bezier(.42, 0, 1, 1)", fill: "forwards" }); out.onfinish = () => cheer.remove(); }, 2600);
    if (still) return;
    // A small fountain of coins from the counter, each landing with a clink.
    for (let i = 0; i < 6; i++) {
      const c = el("span", "cl-spark"); c.innerHTML = coinIcon(14); c.setAttribute("aria-hidden", "true");
      c.style.left = `${a.left + a.width / 2 - 7}px`; c.style.top = `${a.top + a.height / 2 - 7}px`;
      document.body.append(c);
      const dx = (i - 2.5) * 16, peak = -46 - (i % 3) * 12;
      const anim = c.animate([
        { transform: "translate(0, 0) scale(.6)", opacity: 0 },
        { transform: `translate(${dx * .6}px, ${peak}px) scale(1)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px, ${peak + 30}px) scale(.8) rotate(${dx * 4}deg)`, opacity: 0 },
      ], { duration: 720, delay: i * 45, easing: "cubic-bezier(.23, 1, .32, 1)", fill: "both" });
      anim.onfinish = () => c.remove();
      if (i % 2 === 0) window.setTimeout(() => gameSound.emit("clink", { gain: .45, pan: 0 }, `record-${i}`), 300 + i * 45);
    }
  }
}
