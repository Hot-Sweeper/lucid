import "./edge-peek.css";
import { icon } from "../ui/icons";

// Auto-hide panels: a folded sidebar or chat slides over the office while you hover its edge
// (or open it on purpose), and tucks itself away again when you leave. The office keeps its
// full width underneath, so the camera never jumps while a panel peeks.

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const OPEN_MS = 240, CLOSE_MS = 170;
const OPEN_EASE = "cubic-bezier(.2,.75,.3,1)", CLOSE_EASE = "cubic-bezier(.42,0,1,1)";
/** Hover intent on the edge: short, because reaching the edge is already deliberate. */
const INTENT_MS = 110;
/** Grace before tucking away, so a pointer that slips off the edge can come back. */
const LEAVE_MS = 380;
const STYLE_KEYS = ["position", "top", "left", "right", "bottom", "width", "zIndex", "willChange", "boxShadow"] as const;

export type PeekOptions = {
  side: "left" | "right";
  /** The panel that slides over the office. */
  panel: HTMLElement;
  /** Parts that travel with the panel (the sidebar's usage strip). Each keeps its own vertical placement. */
  riders?: () => HTMLElement[];
  /** The folded rail or tab. Hovering it opens the panel. */
  edge: () => HTMLElement | null;
  width: () => number;
  /** Make the panel visible and usable, or put it back in its folded state. */
  reveal: () => void;
  conceal: () => void;
  /** Something inside still needs the panel: a menu, a drag, dictation. */
  busy?: () => boolean;
  onChange?: (shown: boolean) => void;
};

export class EdgePeek {
  enabled = false;
  shown = false;
  private openTimer = 0;
  private closeTimer = 0;
  private motions: Animation[] = [];
  private saved = new Map<HTMLElement, Partial<CSSStyleDeclaration>>();
  private over = false;
  private off: (() => void) | null = null;

  constructor(private o: PeekOptions) {}

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) this.listen();
    else { this.off?.(); this.off = null; this.hide(false); }
  }

  /** Open now (a click on the edge, a selected robot, a shortcut). */
  show(animate = true) {
    if (!this.enabled || this.o.panel.closest(".mobile-layout")) return;
    this.clearTimers();
    if (this.shown) return;
    this.shown = true;
    this.o.reveal();
    this.float(true);
    this.slide(true, animate);
    this.o.edge()?.classList.add("peek-open");
    this.o.onChange?.(true);
  }

  /** Tuck away now. `animate: false` snaps (used when the panel is pinned in place). */
  hide(animate = true) {
    this.clearTimers();
    if (!this.shown) return;
    this.shown = false;
    const panel = this.o.panel;
    if (panel.contains(document.activeElement)) {
      // keep the keyboard on something visible: the edge that brings it back
      const edge = this.o.edge();
      if (edge && !edge.hidden) edge.focus({ preventScroll: true }); else (document.activeElement as HTMLElement).blur?.();
    }
    this.o.edge()?.classList.remove("peek-open");
    this.slide(false, animate, () => { this.float(false); this.o.conceal(); });
    this.o.onChange?.(false);
  }

  toggle() { if (this.shown) this.hide(); else this.show(); }

  /** Leaves the panel exactly where it is, without its floating styles, for the pinned layout to take over. */
  release() {
    this.clearTimers();
    this.stopMotion();
    this.float(false);
    this.o.edge()?.classList.remove("peek-open");
    if (this.shown) { this.shown = false; this.o.onChange?.(false); }
  }

  private clearTimers() {
    window.clearTimeout(this.openTimer); this.openTimer = 0;
    window.clearTimeout(this.closeTimer); this.closeTimer = 0;
  }

  private stopMotion() {
    for (const m of this.motions) { m.onfinish = null; m.cancel(); }
    this.motions = [];
  }

  private parts() { return [this.o.panel, ...(this.o.riders?.() ?? []).filter((r) => !r.hidden)]; }

  /** Lift the panel out of its grid column and over the office, at its usual width. */
  private float(on: boolean) {
    if (!on) {
      for (const [el, s] of this.saved) Object.assign(el.style, s);
      this.saved.clear();
      this.o.panel.classList.remove("peeking");
      return;
    }
    const w = `${Math.round(this.o.width())}px`, edge = this.o.side;
    for (const el of this.parts()) {
      if (!this.saved.has(el)) {
        const s: Partial<CSSStyleDeclaration> = {};
        for (const k of STYLE_KEYS) s[k] = el.style[k];
        this.saved.set(el, s);
      }
      const isPanel = el === this.o.panel;
      Object.assign(el.style, {
        position: "absolute", [edge]: "0", [edge === "left" ? "right" : "left"]: "auto",
        top: isPanel ? "0" : "auto", bottom: "0", width: w, zIndex: isPanel ? "80" : "81", willChange: "transform",
      });
    }
    this.o.panel.classList.add("peeking");
  }

  private slide(open: boolean, animate: boolean, done?: () => void) {
    const parts = this.parts();
    // continue from wherever a reversed slide is shown right now
    const shown = this.motions.length ? new DOMMatrixReadOnly(getComputedStyle(this.o.panel).transform).m41 : null;
    const shownOpacity = this.motions.length ? Number(getComputedStyle(this.o.panel).opacity) : null;
    this.stopMotion();
    if (!animate || typeof this.o.panel.animate !== "function") { done?.(); return; }
    const away = (this.o.side === "left" ? -1 : 1) * (this.o.width() + 24);
    const reduce = still();
    const frames = (from: number, to: number, a: number, b: number) => reduce
      ? [{ opacity: a }, { opacity: b }]
      : [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }];
    const kf = open ? frames(shown ?? away, 0, shownOpacity ?? 0, 1) : frames(shown ?? 0, away, shownOpacity ?? 1, 0);
    const timing: KeyframeAnimationOptions = open
      ? { duration: reduce ? 150 : OPEN_MS, easing: OPEN_EASE, fill: "both" }
      : { duration: reduce ? 120 : CLOSE_MS, easing: CLOSE_EASE, fill: "both" };
    const motions = parts.map((el) => el.animate(kf, timing));
    this.motions = motions;
    motions[0].onfinish = () => {
      if (this.motions !== motions) return;
      this.motions = [];
      for (const m of motions) m.cancel();
      done?.();
    };
  }

  private canTuckAway() {
    if (!this.shown || this.over) return false;
    if (this.o.busy?.()) return false;
    // still typing in it: the panel waits until the keyboard moves on
    const a = document.activeElement as HTMLElement | null;
    return !(a && this.o.panel.contains(a) && (a.isContentEditable || /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName)));
  }

  private scheduleHide() {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => { if (this.canTuckAway()) this.hide(); }, LEAVE_MS);
  }

  private listen() {
    const { panel } = this.o;
    const inside = (n: EventTarget | null) => {
      if (!(n instanceof Node)) return false;
      if (panel.contains(n) || this.o.edge()?.contains(n)) return true;
      // menus that belong to the panel live on <body> so they are never clipped
      return n instanceof Element && !!n.closest(".cm-menu, .pop-menu");
    };
    const onEdgeEnter = () => {
      if (this.shown) { window.clearTimeout(this.closeTimer); return; }
      window.clearTimeout(this.openTimer);
      this.openTimer = window.setTimeout(() => { if (this.over) this.show(); }, INTENT_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const now = inside(e.target) || this.onScreenEdge(e.clientX);
      if (now === this.over) return;
      this.over = now;
      if (now) onEdgeEnter();
      else { window.clearTimeout(this.openTimer); if (this.shown) this.scheduleHide(); }
    };
    const onOut = (e: PointerEvent) => {
      // the pointer left the window entirely
      if (!e.relatedTarget && this.over) { this.over = false; window.clearTimeout(this.openTimer); if (this.shown) this.scheduleHide(); }
    };
    const onDown = (e: PointerEvent) => {
      if (!this.shown || inside(e.target)) return;
      // a click in the office tucks it away, unless that click opens it again (a robot)
      window.clearTimeout(this.closeTimer);
      this.closeTimer = window.setTimeout(() => { if (!this.o.busy?.()) this.hide(); }, 140);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (this.shown && !inside(e.relatedTarget) && !this.over) this.scheduleHide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !this.shown || !panel.contains(document.activeElement)) return;
      if (document.querySelector(".cm-menu, .dialog-wrap:not(.closing)")) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.hide();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", onDown, true);
    panel.addEventListener("focusout", onFocusOut);
    window.addEventListener("keydown", onKey, true);
    this.off = () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", onDown, true);
      panel.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("keydown", onKey, true);
      this.over = false;
    };
  }

  /** The last few pixels of the window also count, so a quick fling to the edge works. */
  private onScreenEdge(x: number) {
    return this.o.side === "left" ? x <= 3 : x >= innerWidth - 4;
  }
}

/** The pin icon: upright and filled when the panel stays open, tilted and outlined when it auto-hides. */
export const PIN_ICON = icon("pin", 16, { cls: "pin-icon" });

/** Keeps a pin button's label, tooltip and pressed state in step with its panel's mode. */
export function paintPin(btn: HTMLElement, pinned: boolean, what: "sidebar" | "chat", edge: "left" | "right") {
  btn.setAttribute("aria-pressed", String(pinned));
  const label = pinned ? `Auto-hide the ${what}` : `Keep the ${what} open`;
  btn.setAttribute("aria-label", label);
  btn.title = pinned
    ? `Keeping the ${what} open. Click to auto-hide it: it slides out when you hover the ${edge} edge.`
    : `Auto-hiding the ${what}. Click to keep it open.`;
}
