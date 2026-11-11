// Plan limits in the sidebar, after T3 Code's own Limits view: each provider is a group (logo and
// name) with one quiet card per T3 window. A card holds the window label, a big percentage with a
// pace arrow, and a thick bar: the filled part in the provider's tint, the rest a quiet hatch, a
// tick where even pace would be. A chip in the bar's end shows the reset countdown and the
// provider's banked reset credits; the credit opens the irreversible Use reset confirmation.
// Readings come from the usage snapshot (stats.ts); nothing here polls.
import "./limits.css";
import { brandFor, harnessName, logoFor } from "../robot";
import { icon } from "../ui/icons";
import { el, setText } from "./dom";
import type { HarnessLimits, Limit, Usage } from "./stats";
import { chipCountdown, duration, elapsedShare, limitReading, pace, PACE_ARROW, PACE_TEXT, resetCountdown, spokenCountdown, type LimitView } from "./limit-pace";

export type LimitsOptions = {
  /** Redeem one banked reset credit through T3 (provider.consumeResetCredit). */
  useResetCredit?: (instanceId: string) => Promise<{ outcome: string; message: string; warning?: string | null }>;
  /** Whether the T3 session may already manage providers, so the confirmation can say if it asks. */
  canManageProviders?: () => Promise<boolean>;
};

type Card = {
  root: HTMLElement; name: HTMLElement; num: HTMLElement; word: HTMLElement; trend: HTMLElement; arrow: string;
  meter: HTMLElement; tick: HTMLElement; note: HTMLElement; chip: HTMLElement; reset: HTMLElement; resetText: HTMLElement;
  credit: HTMLButtonElement; creditCount: HTMLElement; painted: boolean;
};
type CreditState = "idle" | "confirm" | "busy" | "done" | "error";
type Credits = { count: number; usable: boolean; expiry: string; title: string };
type Confirm = {
  root: HTMLElement; ask: HTMLElement; expiry: HTMLElement; permission: HTMLElement; yes: HTMLButtonElement; no: HTMLButtonElement;
  status: HTMLElement; state: CreditState; opener: HTMLButtonElement | null; set(state: CreditState, message?: string): void;
};
type Group = { root: HTMLElement; name: HTMLElement; cards: HTMLElement; confirm: Confirm; instanceId: string | null; label: string; credits: Credits; members: Card[] };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NO_CREDITS: Credits = { count: 0, usable: false, expiry: "", title: "" };
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const credits = (n: number) => `${n} reset ${n === 1 ? "credit" : "credits"}`;

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

function windowName(minutes: number | null): string {
  if (minutes === 300) return "5 hour";
  if (minutes === 10080) return "Weekly";
  if (!minutes) return "Limit";
  if (minutes % 1440 === 0) return `${minutes / 1440} day`;
  if (minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${minutes} min`;
}

export function mountLimits(box: HTMLElement, note: HTMLElement, options: LimitsOptions, life: { destroyed(): boolean; refresh(): void }) {
  const cards = new Map<string, Card>();
  const groups = new Map<string, Group>();

  function card(key: string, groupKey: string): Card {
    let c = cards.get(key);
    if (c) return c;
    const root = el("div", "lim-card");
    // The meter below carries all of this for assistive technology.
    const top = el("div", "lim-top");
    top.setAttribute("aria-hidden", "true");
    const name = el("span", "lim-name");
    const value = el("span", "lim-value");
    const num = el("b", "lim-num");
    const word = el("span", "lim-word");
    const trend = el("span", "lim-trend");
    // A stale or unknown reading says so where the number would be, and the bar stays empty.
    const note = el("span", "lim-note");
    value.append(num, word, trend, note);
    top.append(name, value);
    const bar = el("div", "lim-bar");
    const meter = el("div", "lim-meter");
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    const fill = el("i", "lim-fill");
    // Where the bar would be if spending were spread evenly over the window.
    const tick = el("b", "lim-tick");
    meter.append(fill, tick);
    const chip = el("span", "lim-chip");
    const reset = el("span", "lim-reset");
    reset.setAttribute("aria-hidden", "true");
    reset.innerHTML = icon("reset", 12);
    const resetText = el("span");
    reset.append(resetText);
    const credit = el("button", "lim-credit");
    credit.type = "button";
    credit.innerHTML = icon("ticket", 12);
    const creditCount = el("span");
    credit.append(creditCount);
    credit.addEventListener("click", () => void openConfirm(groupKey, credit));
    chip.append(reset, credit);
    bar.append(meter, chip);
    root.append(top, bar);
    c = { root, name, num, word, trend, arrow: "", meter, tick, note, chip, reset, resetText, credit, creditCount, painted: false };
    cards.set(key, c);
    return c;
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
    head.append(mark, name);
    const list = el("div", "lim-cards");
    const confirm = confirmBox(key);
    root.append(head, list, confirm.root, confirm.status);
    g = { root, name, cards: list, confirm, instanceId: null, label: "", credits: NO_CREDITS, members: [] };
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
    const yes = el("button", "lim-cyes", "Use credit");
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
        for (const c of g?.members || []) {
          c.credit.setAttribute("aria-expanded", String(state === "confirm" && box.opener === c.credit));
          c.credit.disabled = state === "busy" || !g!.credits.usable;
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
    for (const c of g.members) c.credit.setAttribute("aria-controls", box.root.id);
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
  }

  function renderCard(c: Card, l: Limit, g: Group, source: string, view: LimitView, now: number) {
    const label = l.labelIsComplete && l.label ? l.label : `${l.label ? `${l.label} ` : ""}${windowName(l.windowMinutes)}`;
    setText(c.name, label);
    const known = typeof l.usedPercent === "number" && Number.isFinite(l.usedPercent);
    const live = known && !l.stale;
    const used = known ? Math.max(0, Math.min(100, l.usedPercent!)) : 0;
    const elapsed = live ? elapsedShare(l.resetsAt, l.windowMinutes, now) : null;
    const reading = limitReading(used, elapsed, view);
    const p = elapsed === null ? null : pace(used, elapsed);
    const status = l.stale ? l.staleReason || "No reading since reset" : known ? "" : "Usage unavailable";

    // Big number, its word and the pace arrow.
    const num = live ? `${reading.value}%` : "";
    const changed = c.painted && num !== c.num.textContent;
    setText(c.num, num);
    setText(c.word, live ? reading.word : "");
    if (changed && num) {
      const settle = reducedMotion() ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ opacity: 0.4, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }];
      c.num.animate(settle, { duration: 200, easing: "cubic-bezier(.23, 1, .32, 1)" });
    }
    c.painted = true;
    const arrow = p ? PACE_ARROW[p] : "";
    if (arrow !== c.arrow) { c.arrow = arrow; c.trend.innerHTML = arrow ? icon(arrow, 14) : ""; }

    // The bar and its pace tick; the honest note replaces the number.
    c.meter.style.setProperty("--fill", `${live ? reading.fill : 0}%`);
    c.tick.hidden = reading.mark === null;
    if (reading.mark !== null) c.meter.style.setProperty("--mark", `${reading.mark}%`);
    setText(c.note, status);
    c.note.hidden = !status;

    // The chip: reset countdown and the provider's banked credits.
    // A passed reset is already what the stale note says.
    const countdown = l.stale && chipCountdown(l.resetsAt, now) === "now" ? null : chipCountdown(l.resetsAt, now);
    setText(c.resetText, countdown || "");
    c.reset.hidden = !countdown;
    const { count, usable, title } = g.credits;
    setText(c.creditCount, String(count));
    c.credit.hidden = count === 0;
    c.credit.disabled = !usable || g.confirm.state === "busy";
    c.credit.title = title;
    c.credit.setAttribute("aria-label", usable ? `Use a reset credit for ${g.label}, ${count} available` : `${credits(count)} for ${g.label}`);
    c.chip.hidden = c.reset.hidden && c.credit.hidden;

    for (const k of ["ahead", "on", "under"] as const) c.root.classList.toggle(`lim-${k}`, p === k);
    c.root.classList.toggle("lim-stale", !live);
    c.root.classList.toggle("lim-high", live && used >= 90);

    const spoken = spokenCountdown(l.resetsAt, now);
    c.meter.setAttribute("aria-label", `${g.label} limit`);
    c.meter.setAttribute("aria-valuenow", String(live ? reading.value : 0));
    c.meter.setAttribute("aria-valuetext", [label, live ? reading.text : status, spoken, p ? PACE_TEXT[p] : "", count ? credits(count) : ""].filter(Boolean).join(", "));
    const reset = resetCountdown(l.resetsAt, now) || "";
    const at = l.resetsAt ? ` (${when(l.resetsAt)})` : "";
    const detail = [live ? reading.text : status, reset ? `${reset}${at}` : ""].filter(Boolean).join(", ") + (p ? `. ${reading.pace}: ${PACE_TEXT[p]}` : "");
    const where = `${l.source || source}${l.observedAt ? `, reported ${new Date(l.observedAt).toLocaleString()}` : ""}`;
    c.root.title = `${label}: ${detail}\n${where}`;
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
    const keepCards = new Set<string>();
    list.forEach((w, gi) => {
      const g = group(w.key, w.harness);
      g.instanceId = w.h.instanceId || null;
      g.label = w.name;
      setText(g.name, w.name);
      readCredits(g, w.h, now);
      g.members = w.windows.map((l, i) => {
        const key = `${w.key}:${l.id || `${l.pool || "legacy"}:${i}`}`;
        keepCards.add(key);
        const c = card(key, w.key);
        renderCard(c, l, g, w.h.source || "Local logs", view, now);
        if (g.cards.children[i] !== c.root) g.cards.insertBefore(c.root, g.cards.children[i] || null);
        return c;
      });
      if (box.children[gi] !== g.root) box.insertBefore(g.root, box.children[gi] || null);
    });
    for (const [k, c] of cards) if (!keepCards.has(k)) { c.root.remove(); cards.delete(k); }
    box.hidden = list.length === 0;
    const available = new Set(list.map((w) => w.harness));
    const unavailable = (["codex", "claude"] as const).filter((h) => !available.has(h)).map(harnessName);
    const missing = unavailable.length ? `${unavailable.join(" and ")} limits unavailable${u.limitSource ? "" : " in local logs"}` : "";
    setText(note, [u.limitSource?.detail, missing].filter(Boolean).join(" "));
    note.hidden = !note.textContent;
  }

  return { render };
}
