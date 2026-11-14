// Desk nameplates and the robot hover card. A plate is one line of topic (topic-label.ts) over
// the worker's harness logo and name; it never wraps, never ends in an ellipsis and looks the
// same whether it is hovered, focused or belongs to the open chat (those only add a ring).
// The camera decides how wide the topic may be and how large the plate is drawn (plate-view.ts).
// Hovering a plate or a robot, or focusing a robot, shows the full title, the worker, its status
// and what a click does in a card over the office, at screen size and outside the zoomed world.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { harnessName, logoFor } from "../../robot";
import { statusBadge } from "../../ui/status";
import { esc } from "../../util/html";
import { reducedMotion } from "../../util/dom";
import { DESK_TOPIC, plateView } from "../plate-view";
import type { ThreadState } from "../thread-state";
import type { Desk } from "../desk";
import type { World, WThread } from "../world";
import "../plates.css";

const ROBOT = ".world-walker[data-id], .desk-unit .poke-head, .desk-unit .robot-host, .desk-unit .desk-plate";

/** The hover card's content: full title, the worker with its harness and model, status and what a click does. */
export function plateCardHtml(o: { title: string; worker: string; provider: string; model?: string | null; status: ThreadState | null; open: boolean }) {
  const logo = logoFor(o.provider);
  const who = [o.worker || harnessName(o.provider), o.model].filter(Boolean).join(" · ");
  const status = o.status?.tone ? statusBadge(o.status.tone, { detail: o.status.detail, cls: "hc-status" }) : "";
  return `<p class="hc-title">${esc(o.title || "Untitled")}</p>`
    + `<p class="hc-who">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<span>${esc(who)}</span></p>`
    + `<p class="hc-meta">${status}<span>${o.open ? "This chat is open" : "Click to open this chat"}</span></p>`;
}

export class WorldPlates {
  /** Plate size and topic width for the settled camera; applied with each sharp redraw. */
  syncPlates(this: World) {
    const view = plateView(this.cam.s);
    if (this.root.dataset.plateForm !== view.form) this.root.dataset.plateForm = view.form;
    const zoom = String(view.zoom);
    if (this.root.style.getPropertyValue("--plate-zoom") !== zoom) this.root.style.setProperty("--plate-zoom", zoom);
    const budget = view.budget || DESK_TOPIC;
    if (budget === this.plateBudget) return;
    this.plateBudget = budget;
    for (const office of [this, ...[...this.neighbors.values()].flatMap((e) => e.office ? [e.office] : [])]) {
      office.plateBudget = budget;
      for (const d of office.allDesks) d.setPlateBudget(budget);
    }
  }

  mountPlateCard(this: World) {
    const card = document.createElement("div");
    card.className = "plate-card"; card.id = "plate-card"; card.setAttribute("role", "tooltip"); card.hidden = true;
    this.scene.append(card);
    this.plateCard = card;
    let showTimer = 0, hideTimer = 0, lastHidden = 0;
    const show = (hit: HTMLElement, now = false) => {
      window.clearTimeout(hideTimer); window.clearTimeout(showTimer);
      // Hover intent: a short wait, unless a card was just showing (moving from plate to robot).
      const wait = now || !card.hidden || performance.now() - lastHidden < 400 ? 0 : 260;
      showTimer = window.setTimeout(() => this.showPlateCard(hit), wait);
    };
    const hide = (delay = 90) => {
      window.clearTimeout(showTimer); window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => { if (!card.hidden) lastHidden = performance.now(); this.hidePlateCard(); }, delay);
    };
    this.root.addEventListener("pointerover", (e) => {
      const hit = (e.target as Element | null)?.closest<HTMLElement>(ROBOT);
      if (!hit || hit === this.hoverRobot) return;
      this.hoverRobot?.closest(".desk-unit")?.classList.remove("robot-hover");
      this.hoverRobot = hit;
      hit.closest(".desk-unit:not(.empty)")?.classList.add("robot-hover");
      if (this.plateTarget(hit)) show(hit); else hide(0);
    });
    this.root.addEventListener("pointerout", (e) => {
      const hit = this.hoverRobot;
      if (!hit || hit.contains(e.relatedTarget as Node | null)) return;
      hit.closest(".desk-unit")?.classList.remove("robot-hover");
      this.hoverRobot = null;
      hide();
    });
    // A robot reached with the keyboard names its conversation the same way.
    this.root.addEventListener("focusin", (e) => {
      const hit = (e.target as Element | null)?.closest<HTMLElement>(".desk-unit .poke-head");
      if (!hit || !hit.matches(":focus-visible")) return;
      hit.closest(".desk-unit:not(.empty)")?.classList.add("robot-hover");
      show(hit, true);
    });
    this.root.addEventListener("focusout", (e) => {
      const hit = (e.target as Element | null)?.closest<HTMLElement>(".desk-unit .poke-head");
      if (!hit) return;
      if (hit !== this.hoverRobot) hit.closest(".desk-unit")?.classList.remove("robot-hover");
      hide(0);
    });
    // Grabbing, scrolling or pressing anywhere puts the card away at once.
    for (const type of ["pointerdown", "wheel"] as const) this.scene.addEventListener(type, () => hide(0), { passive: true, capture: true });
  }

  /** The desk (if seated) and thread a hovered robot, plate or walker belongs to. */
  plateTarget(this: World, hit: HTMLElement): { desk: Desk | null; thread: WThread } | null {
    const deskEl = hit.closest<HTMLElement>(".desk-unit");
    const desk = deskEl ? this.deskAt(deskEl) : null;
    const id = desk ? desk.threadId : hit.closest<HTMLElement>(".world-walker[data-id]")?.dataset.id;
    if (!id) return null;
    const thread = [this, ...[...this.neighbors.values()].flatMap((e) => e.office ? [e.office] : [])]
      .flatMap((o) => o.lastData?.threads ?? []).find((t) => t.id === id);
    return thread ? { desk, thread } : null;
  }

  showPlateCard(this: World, hit: HTMLElement) {
    const card = this.plateCard, target = this.plateTarget(hit);
    if (!card || !target || !hit.isConnected) return;
    const { desk, thread } = target;
    const robot = desk?.profile ?? this.roster.forJob(thread.id);
    const worker = desk?.workerName || robot?.name || "";
    const html = plateCardHtml({ title: thread.title, worker, provider: thread.provider, model: desk?.modelName ?? thread.model, status: this.threadStatus(thread), open: thread.id === this.chatThread });
    if (card.dataset.html !== html) { card.dataset.html = html; card.innerHTML = html; }
    // Anchored to the plate for a seated robot, to the robot itself when it walks.
    const anchor = (desk?.el.querySelector<HTMLElement>(".desk-plate") ?? hit).getBoundingClientRect();
    const box = this.sceneBox ??= this.scene.getBoundingClientRect();
    const wasHidden = card.hidden;
    card.hidden = false;
    const w = card.offsetWidth, h = card.offsetHeight, gap = 8, edge = 8;
    // Below the plate, over the floor, so the robot and its monitor stay in view; above near the bottom edge.
    const above = anchor.bottom - box.top + gap + h > box.height - edge && anchor.top - box.top - h - gap >= edge;
    const x = Math.min(Math.max(anchor.left - box.left, edge), box.width - w - edge);
    const y = above ? anchor.top - box.top - h - gap : Math.min(anchor.bottom - box.top + gap, box.height - h - edge);
    card.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
    card.dataset.side = above ? "above" : "below";
    for (const el of this.root.querySelectorAll("[aria-describedby='plate-card']")) el.removeAttribute("aria-describedby");
    desk?.el.querySelector(".poke-head")?.setAttribute("aria-describedby", "plate-card");
    if (wasHidden && !reducedMotion()) { card.classList.remove("on"); void card.offsetWidth; }
    card.classList.add("on");
  }

  hidePlateCard(this: World) {
    const card = this.plateCard;
    if (!card || card.hidden) return;
    card.classList.remove("on");
    for (const el of this.root.querySelectorAll("[aria-describedby='plate-card']")) el.removeAttribute("aria-describedby");
    const done = () => { if (!card.classList.contains("on")) card.hidden = true; };
    if (reducedMotion()) done(); else window.setTimeout(done, 130);
  }
}
