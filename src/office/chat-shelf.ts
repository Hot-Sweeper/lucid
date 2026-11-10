import { GLIDE_MS, GLIDE_EASING } from "../perf/ease";

// The real chat surface moves as one compositor layer. Its transcript is laid
// out at its final width once, rather than reflowing the office on every frame.
export class ChatShelf {
  private motion: Animation | null = null;
  private saved: Partial<CSSStyleDeclaration> | null = null;
  private collapsed = false;
  constructor(private panel: HTMLElement, private tab: HTMLElement) {}

  finish() {
    const motion = this.motion; this.motion = null;
    if (motion) { motion.onfinish = null; motion.cancel(); }
    if (this.saved) { Object.assign(this.panel.style, this.saved); this.saved = null; }
    if (this.collapsed) this.panel.classList.add("tabbed"); else this.panel.classList.remove("tabbed");
    this.panel.inert = this.collapsed;
    this.tab.hidden = !this.collapsed;
  }

  set(collapsed: boolean, width: number, animate: boolean, layout: () => void, startAt?: number) {
    const wasMoving = !!this.motion;
    // A single read at interruption keeps rapid reversals at the shown position.
    const shown = wasMoving ? new DOMMatrixReadOnly(getComputedStyle(this.panel).transform).m41 : null;
    const previous = this.motion; this.motion = null;
    if (previous) { previous.onfinish = null; previous.cancel(); }
    this.collapsed = collapsed;
    this.panel.inert = collapsed;
    this.tab.hidden = !collapsed;
    const still = !animate || typeof this.panel.animate !== "function";
    if (still) { layout(); this.finish(); return; }
    if (!this.saved) {
      this.saved = {};
      for (const key of ["position", "top", "right", "bottom", "width", "height", "zIndex", "willChange"] as const) this.saved[key] = this.panel.style[key];
    }
    this.panel.classList.remove("tabbed");
    Object.assign(this.panel.style, { position: "absolute", top: "0", right: "0", bottom: "0", height: "100%", width: `${width}px`, zIndex: "79", willChange: "transform" });
    layout();
    const from = shown ?? startAt ?? (collapsed ? 0 : Math.max(0, width - 64));
    const to = collapsed ? width : 0;
    const motion = this.panel.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }],
      { duration: GLIDE_MS, easing: GLIDE_EASING, fill: "both" });
    this.motion = motion;
    const complete = () => { if (this.motion === motion) this.finish(); };
    motion.onfinish = complete;
    void motion.finished?.then(complete, () => {});
  }
}
