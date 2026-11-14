// Desks: creating a desk with its computer and robot, and the Add a desk placeholders (ghosts) with
// their build animation.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { GEOM } from "../../robot";
import { gameSound } from "../sound";
import gsap from "gsap";
import { cubicBezier } from "../../perf/ease";
import { Desk } from "../desk";
import { wireDeskChatTargets } from "../desk-chat-targets";
import { icon } from "../../ui/icons";
import type { World } from "../world";
import type { Room, PhysicalRoomPlan } from "./types";
import type { Pt } from "../../robot";
import { slotOrigin } from "./geometry";

export class WorldDesks {
  placeDeskGhosts(this: World, plans: PhysicalRoomPlan[], rooms: Room[]) {
    const shown = new Set<string>();
    plans.forEach((p, i) => {
      const r = rooms[i];
      if (!p.ghost || r.collapsed || !["main", "project", "freelance"].includes(p.kind)) return;
      shown.add(p.id);
      const at = slotOrigin(r, p.slots), sig = [r.title, at.x, at.y, p.slots].join("|");
      let g = this.ghosts.get(p.id);
      if (g?.sig === sig) return;
      const fresh = !g;
      if (!g) { g = { el: this.makeDeskGhost(p.id), sig: "", pending: null, timer: 0 }; this.ghosts.set(p.id, g); }
      // The ghost moved on to a new place: the earlier add has landed, so presses count again.
      if (g.pending !== null && g.pending !== p.slots) this.settleGhost(g);
      g.sig = sig;
      g.el.setAttribute("aria-label", `Add a desk to ${r.title}`);
      // The hit area is the whole ghost: monitor and desk top of a real workstation.
      const left = at.x + 34, top = at.y + GEOM.monitor.y;
      if (fresh) g.el.style.cssText = `left:${left}px;top:${top}px;width:332px;height:264px`;
      g.el.style.zIndex = String(Math.round(at.y));
      // It slides with the desks and rooms around it, the way slideDesk moves a workstation.
      if (!fresh && !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(g.el, { left, top, duration: .3, ease: "power3.out", overwrite: "auto" });
      else if (!fresh) { gsap.killTweensOf(g.el); gsap.set(g.el, { left, top }); }
      this.cull.observe(g.el);
    });
    for (const [id, g] of this.ghosts) if (!shown.has(id)) { window.clearTimeout(g.timer); gsap.killTweensOf(g.el); this.cull.unobserve(g.el); g.el.remove(); this.ghosts.delete(id); }
  }

  makeDeskGhost(this: World, room: string) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "desk-ghost"; b.title = "Add a desk";
    // One dashed outline round a faint screen, stand and desk top, so the ghost reads as one
    // workstation (two separate dashed boxes looked like two placeholders, especially from afar).
    b.innerHTML = `<svg viewBox="0 0 332 264" width="332" height="264" aria-hidden="true" focusable="false">
      <rect class="dg-frame" x="1.5" y="1.5" width="329" height="252" rx="14"/>
      <g class="dg-ghost"><rect x="30" y="12" width="272" height="150" rx="10"/><rect x="152" y="162" width="28" height="14"/><rect x="12" y="176" width="308" height="66" rx="8"/></g>
      <g class="dg-plus"><circle cx="166" cy="86" r="30"/><path d="M166 73v26M153 86h26"/></g>
    </svg><span aria-hidden="true">Add a desk</span>`;
    b.addEventListener("click", (e) => { e.stopPropagation(); this.addDeskFromGhost(room); });
    b.addEventListener("dblclick", (e) => e.stopPropagation());
    this.deskLayer.appendChild(b);
    return b;
  }

  settleGhost(this: World, g: { el: HTMLButtonElement; pending: number | null; timer: number }) {
    window.clearTimeout(g.timer); g.timer = 0; g.pending = null;
    g.el.classList.remove("is-pending"); g.el.removeAttribute("aria-disabled");
  }

  addDeskFromGhost(this: World, room: string) {
    const g = this.ghosts.get(room), plan = this.physicalPlans.find((p) => p.id === room);
    // Repeat presses wait until the pending desk stands (a held floor plan can delay it).
    if (!g || !plan?.ghost || g.pending !== null || g.el.disabled) return;
    const focused = document.activeElement === g.el, before = this.extra.get(room) ?? 0;
    g.pending = plan.slots; g.el.classList.add("is-pending"); g.el.setAttribute("aria-disabled", "true");
    this.deskBuild = { key: `${room}#${plan.slots}`, since: performance.now() };
    // The same path as every added desk: saved layout, reservations, safe floor-plan transition.
    this.onAddDesk(room);
    if (this.ghosts.get(room) === g && (this.extra.get(room) ?? 0) === before) {
      // Nothing was added here (a neighbouring building opens first, or a companion client).
      this.deskBuild = null;
      window.clearTimeout(g.timer); g.timer = window.setTimeout(() => this.settleGhost(g), 2500);
    }
    if (focused && !g.el.isConnected) this.rooms.find((r) => r.id === room)?.el.querySelector<HTMLElement>(".room-sign-hit")?.focus({ preventScroll: true });
  }

  /** The desk added from a ghost assembles where the ghost stood: top drops in, monitor rises. */
  playDeskBuild(this: World) {
    const build = this.deskBuild;
    if (!build) return;
    if (performance.now() - build.since > 30000) { this.deskBuild = null; return; }
    const d = this.slotDesks.get(build.key);
    if (!d) return;   // a held floor plan opens the new desk later
    this.deskBuild = null;
    gameSound.at("build", d.el, .8);
    if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this.deskBuildTween?.progress(1).kill();
    const table = d.el.querySelector<SVGSVGElement>(".desk-table"), parts = [table, d.monitor].filter((e): e is SVGSVGElement | HTMLElement => !!e);
    const ease = cubicBezier(.23, 1, .32, 1);
    const tl = gsap.timeline({ onComplete: () => done(), onInterrupt: () => done() });
    const done = () => { gsap.set(parts, { clearProps: "transform,transformOrigin,opacity" }); if (this.deskBuildTween === tl) this.deskBuildTween = null; };
    if (table) tl.fromTo(table, { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: .22, ease }, 0);
    tl.fromTo(d.monitor, { scaleY: .15, opacity: 0, transformOrigin: "50% 100%" }, { scaleY: 1, opacity: 1, duration: .24, ease }, .13);
    this.deskBuildTween = tl;
  }

  /**
   * Folding an office is purely visual: its desks, robots and computers keep running, they are
   * only hidden. A fold tucks them toward the wall; opening places them at once and lets them
   * unfold in snake order, so robots are already seated when the room appears.
   */
  setDeskFolded(this: World, d: Desk, folded: boolean, at: Pt, animate: boolean, order = 0) {
    d.folded = folded;
    gsap.killTweensOf(d.el, "opacity,scale,y");
    const ease = folded ? cubicBezier(.42, 0, 1, 1) : cubicBezier(.23, 1, .32, 1);
    if (folded) {
      const hide = () => { d.el.classList.add("folded-away"); gsap.set(d.el, { clearProps: "opacity,scale,y,transformOrigin" }); this.recull(); };
      if (!animate) { hide(); return; }
      d.el.classList.add("folding");
      gsap.to(d.el, { opacity: 0, scale: .94, y: -14, transformOrigin: "50% 0%", duration: .2, ease,
        onComplete: () => { d.el.classList.remove("folding"); if (d.folded) hide(); }, onInterrupt: () => d.el.classList.remove("folding") });
      return;
    }
    d.el.classList.remove("folded-away", "folding");
    gsap.killTweensOf(d.el, "left,top");
    gsap.set(d.el, { left: at.x, top: at.y });
    d.baseZ = Math.round(at.y); d.lift("move", false);
    this.recull();
    if (animate) gsap.fromTo(d.el, { opacity: 0, scale: .96, y: -12, transformOrigin: "50% 0%" },
      { opacity: 1, scale: 1, y: 0, duration: .26, delay: .08 + Math.min(order, 8) * .04, ease, clearProps: "opacity,scale,y,transformOrigin" });
  }

  makeDesk(this: World, x: number, y: number) {
    const d = new Desk(this.deskLayer, x, y, this.services);
    d.setPlateBudget(this.plateBudget);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'empty-desk-remove';
    remove.title = 'Remove empty desk'; remove.setAttribute('aria-label', 'Remove empty desk');
    remove.innerHTML = icon("close");
    remove.addEventListener('pointerdown', e => e.stopPropagation());
    remove.addEventListener('dblclick', e => e.stopPropagation());
    remove.addEventListener('click', e => { e.stopPropagation(); this.onRemoveEmptyDesk(d.el.dataset.slot || ''); });
    d.el.append(remove);
    d.onPresenceChange = () => this.recull();
    this.cull.observe(d.el);
    d.onSay = () => this.fitBubbles();
    d.director.attachDir = this.attachDir;
    d.director.childItems = (id, since) => (window as any).lucid.itemsSince(id, since);
    this.allDesks.add(d);
    const chatClicks = wireDeskChatTargets(d.el, () => d.threadId, () => this.dragged,
      id => this.hostWorld ? this.onSelectThread(id) : this.onWatchChat(id));
    if (!this.hostWorld) this.wireDeskDrag(d);
    d.onRobotFocus = (anchor) => { if (d.threadId) this.onRobotFocus(d.threadId, anchor); };
    d.el.addEventListener("click", (e) => {
      if (this.dragged) return;
      e.stopPropagation();
      if (this.hostWorld && chatClicks.has(e)) return;
      if (d.threadId) { this.select(d); this.focusOn(d); }
      else this.onFreeDesk(d, [...this.slotDesks.entries()].find(([, v]) => v === d)?.[0] ?? "", e.clientX, e.clientY);
    });
    d.el.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!d.threadId) { this.onFreeDeskMenu(d, [...this.slotDesks.entries()].find(([, v]) => v === d)?.[0] ?? "", e.clientX, e.clientY); return; }
      this.select(d); this.onDeskMenu(d, e.clientX, e.clientY);
    });
    // A double click zooms into the screen; it must not also select a word on it (an unfocused
    // window paints that selection as a grey box, which read as a broken status badge).
    d.el.addEventListener("mousedown", (e) => { if (e.detail > 1 && !(e.target as Element).closest("input, textarea, select, [contenteditable]")) e.preventDefault(); });
    d.monitor.addEventListener("click", (e) => {
      if (this.dragged || !d.threadId) return;
      e.stopPropagation();
      if (this.hostWorld && chatClicks.has(e)) return;
      this.select(d);
      // first click brings the desk close, a click on the monitor then fills the view with the screen
      if (this.focusDesk === d && this.focusMode === "desk") this.focusScreen(d); else this.focusOn(d);
    });
    return d;
  }
}
