// Plan limits in the sidebar. Each provider is one quiet surface: a header with its logo, name and
// banked reset credits (which open the irreversible Use reset confirmation), then one row per T3
// window separated by hairlines. A row reads label and big percentage, a slim meter, and a line
// with the pace and the reset countdown. The meter shows usage as its fill and where even pace
// would be as a faint zone ending in a tick; its colour says how it is going (calm, ahead of pace,
// nearly used up), not which provider it is.
// Readings come from the usage snapshot (stats.ts); nothing here polls.
import "./limits.css";
import { brandFor, harnessName, logoFor } from "../robot";
import { icon } from "../ui/icons";
import { el, setText } from "./dom";
import type { HarnessLimits, Limit, Usage } from "./stats";
import { limitLabel } from "./limit-label";
import { chipCountdown, duration, elapsedShare, limitReading, limitTone, pace, PACE_ARROW, PACE_TEXT, resetCountdown, spokenCountdown, type LimitView } from "./limit-pace";

export type LimitsOptions = {
  /** Redeem one banked reset credit through T3 (provider.consumeResetCredit). */
  useResetCredit?: (instanceId: string) => Promise<{ outcome: string; message: string; warning?: string | null }>;
  /** Whether the T3 session may already manage providers, so the confirmation can say if it asks. */
  canManageProviders?: () => Promise<boolean>;
};

type Row = {
  root: HTMLElement; name: HTMLElement; num: HTMLElement; word: HTMLElement; note: HTMLElement;
  meter: HTMLElement; tick: HTMLElement; meta: HTMLElement; pace: HTMLElement; paceIcon: HTMLElement; paceText: HTMLElement; arrow: string;
  reset: HTMLElement; resetText: HTMLElement; painted: boolean;
};
type CreditState = "idle" | "confirm" | "busy" | "done" | "error";
type Credits = { count: number; usable: boolean; expiry: string; title: string };
type Confirm = {
  root: HTMLElement; ask: HTMLElement; expiry: HTMLElement; permission: HTMLElement; yes: HTMLButtonElement; no: HTMLButtonElement;
  status: HTMLElement; state: CreditState; opener: HTMLButtonElement | null; set(state: CreditState, message?: string): void;
};
type Group = { root: HTMLElement; name: HTMLElement; rows: HTMLElement; credit: HTMLButtonElement; creditText: HTMLElement; confirm: Confirm; instanceId: string | null; label: string; credits: Credits; members: Row[] };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NO_CREDITS: Credits = { count: 0, usable: false, expiry: "", title: "" };
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const credits = (n: number) => `${n} reset ${n === 1 ? "credit" : "credits"}`;
const PACE_LABEL = { ahead: "Ahead of pace", on: "On pace", under: "Under pace" } as const;

function clock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// "14:30" today, "Wed 14:30" within the week, "4 Nov" further out.
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (days === 0) return clock(d);
  if (days > 0 && days < 7) return `${DAYS[d.getDay()]} ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function mountLimits(box: HTMLElement, note: HTMLElement, options: LimitsOptions, life: { destroyed(): boolean; refresh(): void }) {
  const rows = new Map<string, Row>();
  const groups = new Map<string, Group>();

  function row(key: string): Row {
    let r = rows.get(key);
    if (r) return r;
    const root = el("div", "lim-row");
    // The meter below carries the label, reading, pace and reset for assistive technology.
    const top = el("div", "lim-top");
    top.setAttribute("aria-hidden", "true");
    const name = el("span", "lim-name");
    const value = el("span", "lim-value");
    const num = el("b", "lim-num");
    const word = el("span", "lim-word");
    // A stale or unknown reading says so where the number would be, and the meter stays empty.
    const note = el("span", "lim-note");
    value.append(num, word, note);
    top.append(name, value);
    const meter = el("div", "lim-meter");
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    const track = el("span", "lim-track");
    // Where even pace would be: a faint zone from the start, ending in a crisp tick.
    track.append(el("i", "lim-zone"), el("i", "lim-fill"));
    const tick = el("b", "lim-tick");
    meter.append(track, tick);
    const meta = el("div", "lim-meta");
    meta.setAttribute("aria-hidden", "true");
    const pace = el("span", "lim-pace");
    const paceIcon = el("span", "lim-pace-icon");
    const paceText = el("span");
    pace.append(paceIcon, paceText);
    const reset = el("span", "lim-reset");
    reset.innerHTML = icon("reset", 12);
    const resetText = el("span");
    reset.append(el("span", "lim-reset-word", "Resets in "), resetText);
    meta.append(pace, reset);
    root.append(top, meter, meta);
    r = { root, name, num, word, note, meter, tick, meta, pace, paceIcon, paceText, arrow: "", reset, resetText, painted: false };
    rows.set(key, r);
    return r;
  }

  function group(key: string, harness: string): Group {
    let g = groups.get(key);
    if (g) return g;
    const root = el("section", "lim-group");
    root.dataset.provider = brandFor(harness);
    const head = el("div", "lim-head");
    const mark = el("span", "lim-logo");
    const logo = logoFor(harness);
    if (logo) { const img = el("img"); img.src = logo; img.alt = ""; mark.append(img); }
    const name = el("h4", "lim-gname");
    // Credits belong to the provider account, so they live once in its header.
    const credit = el("button", "lim-credit");
    credit.type = "button";
    credit.innerHTML = icon("ticket", 14);
    const creditText = el("span");
    credit.append(creditText);
    credit.addEventListener("click", () => void openConfirm(key, credit));
    head.append(mark, name, credit);
    const list = el("div", "lim-rows");
    const confirm = confirmBox(key);
    root.append(head, list, confirm.root, confirm.status);
    g = { root, name, rows: list, credit, creditText, confirm, instanceId: null, label: "", credits: NO_CREDITS, members: [] };
    groups.set(key, g);
    return g;
  }

  // Redeeming a banked reset is irreversible, so the credit opens this inline confirmation.
  function confirmBox(key: string): Confirm {
    const root = el("div", "lim-confirm");
    root.hidden = true;
    root.id = `lim-confirm-${Math.random().toString(36).slice(2, 8)}`;
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Use a reset credit");
    const ask = el("p", "lim-cask");
    const expiry = el("p", "lim-cnote");
    const caution = el("p", "lim-cnote", "The next credit may cover only one model or limit (T3 does not say which). Cannot be undone.");
    const permission = el("p", "lim-cnote lim-cquiet", "T3 provider permission is required.");
    permission.hidden = true;
    const actions = el("div", "lim-cactions");
    const yes = el("button", "primary compact lim-cyes", "Use credit");
    const no = el("button", "link-btn lim-cno", "Cancel");
    yes.type = no.type = "button";
    actions.append(yes, no);
    root.append(ask, expiry, caution, permission, actions);
    const status = el("p", "lim-cstatus");
    status.setAttribute("role", "status");
    status.tabIndex = -1;
    status.hidden = true;
    let clear = 0;
    const box: Confirm = {
      root, ask, expiry, permission, yes, no, status, state: "idle", opener: null,
      set(state, message = "") {
        box.state = state;
        clearTimeout(clear);
        root.hidden = state !== "confirm";
        status.hidden = !message;
        status.textContent = message;
        status.classList.toggle("lim-cerror", state === "error");
        status.classList.toggle("lim-cbusy", state === "busy");
        const g = groups.get(key);
        if (g) {
          g.credit.setAttribute("aria-expanded", String(state === "confirm"));
          g.credit.disabled = state === "busy" || !g.credits.usable;
        }
      },
    };
    const back = () => {
      const to = box.opener;
      if (to?.isConnected && !to.hidden && !to.disabled) to.focus();
      else if (!status.hidden) status.focus();
    };
    no.addEventListener("click", () => { box.set("idle"); back(); });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); box.set("idle"); back(); } });
    yes.addEventListener("click", async () => {
      const g = groups.get(key);
      if (box.state !== "confirm" || !g?.instanceId || !options.useResetCredit) return;
      box.set("busy", "Using reset credit...");
      try {
        const r = await options.useResetCredit(g.instanceId);
        if (life.destroyed()) return;
        box.set(r.outcome === "reset" ? "done" : "error", [r.message, r.warning].filter(Boolean).join(" "));
        if (r.outcome === "reset") clear = window.setTimeout(() => { if (box.state === "done") box.set("idle"); }, 8000);
        life.refresh();
      } catch (err) {
        if (life.destroyed()) return;
        box.set("error", err instanceof Error && err.message ? err.message : "Could not use the reset credit.");
      }
      back();
    });
    return box;
  }

  async function openConfirm(key: string, opener: HTMLButtonElement) {
    const g = groups.get(key);
    if (!g?.instanceId || !options.useResetCredit || !g.credits.usable) return;
    const box = g.confirm;
    if (box.state === "busy") return;
    // The same credit again closes it, like any disclosure.
    if (box.state === "confirm" && box.opener === opener) { box.set("idle"); opener.focus(); return; }
    box.opener = opener;
    g.credit.setAttribute("aria-controls", box.root.id);
    setText(box.ask, `Use a reset for ${g.label}?`);
    setText(box.expiry, g.credits.expiry);
    box.permission.hidden = true;
    box.set("confirm");
    box.no.focus();
    box.root.scrollIntoView({ block: "nearest" });
    // The first redemption also asks T3 for permission to manage providers; say so up front.
    const allowed = await options.canManageProviders?.().catch(() => true);
    if (box.state === "confirm") {
      box.permission.hidden = allowed !== false;
      box.root.scrollIntoView({ block: "nearest" });
    }
  }

  function readCredits(g: Group, h: HarnessLimits, now: number) {
    const c = h.resetCredits;
    const count = c?.availableCount ?? 0;
    const expires = c?.nextExpiresAt ? Date.parse(c.nextExpiresAt) : NaN;
    const left = expires - now;
    const expiry = !count ? "" : Number.isFinite(left) && left > 0
      ? `${credits(count)} banked. The next expires in ${duration(left)} (${when(c!.nextExpiresAt!)}).`
      : `${credits(count)} banked. No expiry reported.`;
    const usable = count > 0 && !!h.instanceId && !!options.useResetCredit;
    g.credits = { count, usable, expiry, title: `${expiry}${usable ? " Click to use one." : ""}` };
    // Keep a result message until the next state; drop a confirmation once nothing is left to use.
    if (!usable && g.confirm.state === "confirm") g.confirm.set("idle");
    setText(g.creditText, `${count} ${count === 1 ? "reset" : "resets"}`);
    g.credit.hidden = count === 0;
    g.credit.disabled = !usable || g.confirm.state === "busy";
    g.credit.title = g.credits.title;
    g.credit.setAttribute("aria-label", usable ? `Use a reset credit for ${g.label}, ${count} available` : `${credits(count)} for ${g.label}`);
  }

  function renderRow(r: Row, l: Limit, g: Group, source: string, view: LimitView, now: number) {
    const label = limitLabel(l);
    setText(r.name, label);
    const known = typeof l.usedPercent === "number" && Number.isFinite(l.usedPercent);
    const live = known && !l.stale;
    const used = known ? Math.max(0, Math.min(100, l.usedPercent!)) : 0;
    const elapsed = live ? elapsedShare(l.resetsAt, l.windowMinutes, now) : null;
    const reading = limitReading(used, elapsed, view);
    const p = elapsed === null ? null : pace(used, elapsed);
    const status = l.stale ? l.staleReason || "No reading since reset" : known ? "" : "Usage unavailable";

    // The big number and its word; the honest note replaces both.
    const num = live ? `${reading.value}%` : "";
    const changed = r.painted && num !== r.num.textContent;
    setText(r.num, num);
    setText(r.word, live ? reading.word : "");
    if (changed && num) {
      const settle = reducedMotion() ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ opacity: 0.4, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }];
      r.num.animate(settle, { duration: 200, easing: "cubic-bezier(.23, 1, .32, 1)" });
    }
    r.painted = true;
    setText(r.note, status);
    r.note.hidden = !status;

    // The meter: usage fill, the even-pace zone and its tick.
    r.meter.style.setProperty("--fill", `${live ? reading.fill : 0}%`);
    r.meter.style.setProperty("--mark", `${reading.mark ?? 0}%`);
    r.tick.hidden = reading.mark === null;

    // Pace in words with its arrow, and the reset countdown. A passed reset is already what the
    // stale note says.
    // A used-up window has no pace left to describe; it says so instead.
    const spent = live && used >= 100;
    const arrow = p && !spent ? PACE_ARROW[p] : "";
    if (arrow !== r.arrow) { r.arrow = arrow; r.paceIcon.innerHTML = arrow ? icon(arrow, 14) : ""; }
    setText(r.paceText, spent ? "Limit reached" : p ? PACE_LABEL[p] : "");
    r.pace.hidden = !p && !spent;
    const countdown = chipCountdown(l.resetsAt, now);
    const shown = l.stale && countdown === "now" ? null : countdown;
    setText(r.resetText, shown === "now" ? "a moment" : shown || "");
    r.reset.hidden = !shown;
    r.meta.hidden = r.pace.hidden && r.reset.hidden;

    // Calm, warm (ahead of pace or getting full) or critical (nearly used up): the same in both views.
    const tone = live ? limitTone(used, p) : null;
    for (const t of ["calm", "warn", "crit"] as const) r.root.classList.toggle(`lim-${t}`, tone === t);
    for (const k of ["ahead", "on", "under"] as const) r.root.classList.toggle(`lim-${k}`, p === k);
    r.root.classList.toggle("lim-stale", !live);
    r.root.classList.toggle("lim-spent", spent);

    const { count } = g.credits;
    const spoken = spokenCountdown(l.resetsAt, now);
    r.meter.setAttribute("aria-label", `${g.label} limit`);
    r.meter.setAttribute("aria-valuenow", String(live ? reading.value : 0));
    r.meter.setAttribute("aria-valuetext", [label, live ? reading.text : status, spoken, spent ? "limit reached" : p ? PACE_TEXT[p] : "", count ? credits(count) : ""].filter(Boolean).join(", "));
    const reset = resetCountdown(l.resetsAt, now) || "";
    const at = l.resetsAt ? ` (${when(l.resetsAt)})` : "";
    const detail = [live ? reading.text : status, reset ? `${reset}${at}` : ""].filter(Boolean).join(", ") + (p ? `. ${reading.pace}: ${PACE_TEXT[p]}` : "");
    const where = `${l.source || source}${l.observedAt ? `, reported ${new Date(l.observedAt).toLocaleString()}` : ""}`;
    r.root.title = `${label}: ${detail}\n${where}`;
  }

  function render(u: Usage, view: LimitView) {
    const now = Date.now();
    const list: { key: string; harness: string; name: string; h: HarnessLimits; windows: Limit[] }[] = [];
    for (const [key, h] of Object.entries(u.limits)) {
      if (!h) continue;
      const harness = h.harness || key;
      const windows = [...(h.windows || [h.primary, h.secondary].filter((l): l is Limit => !!l))];
      windows.sort((a, b) => (a.windowMinutes ?? 0) - (b.windowMinutes ?? 0));
      list.push({ key, harness, name: h.name || harnessName(harness), h, windows });
    }
    const keepGroups = new Set(list.map((w) => w.key));
    for (const [k, g] of groups) if (!keepGroups.has(k)) { g.root.remove(); groups.delete(k); }
    const keepRows = new Set<string>();
    list.forEach((w, gi) => {
      const g = group(w.key, w.harness);
      g.instanceId = w.h.instanceId || null;
      g.label = w.name;
      setText(g.name, w.name);
      g.name.title = w.name;
      readCredits(g, w.h, now);
      g.members = w.windows.map((l, i) => {
        const key = `${w.key}:${l.id || `${l.pool || "legacy"}:${i}`}`;
        keepRows.add(key);
        const r = row(key);
        renderRow(r, l, g, w.h.source || "Local logs", view, now);
        if (g.rows.children[i] !== r.root) g.rows.insertBefore(r.root, g.rows.children[i] || null);
        return r;
      });
      // A used-up window makes the banked resets the next thing to reach for.
      g.root.classList.toggle("lim-spent", g.members.some((r) => r.root.classList.contains("lim-spent")));
      if (box.children[gi] !== g.root) box.insertBefore(g.root, box.children[gi] || null);
    });
    for (const [k, r] of rows) if (!keepRows.has(k)) { r.root.remove(); rows.delete(k); }
    box.hidden = list.length === 0;
    const available = new Set(list.map((w) => w.harness));
    const unavailable = (["codex", "claude"] as const).filter((h) => !available.has(h)).map(harnessName);
    const missing = unavailable.length ? `${unavailable.join(" and ")} limits unavailable${u.limitSource ? "" : " in local logs"}` : "";
    setText(note, [u.limitSource?.detail, missing].filter(Boolean).join(" "));
    note.hidden = !note.textContent;
  }

  return { render };
}
