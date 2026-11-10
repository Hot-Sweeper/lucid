// Rooms as the user arranges them: order, columns, folding, revealing a thread's desk, holding the
// layout still during touch or drag, a thread's home room, and room fade transitions.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import { officeColumns } from "../office-width";
import { gameSound } from "../sound";
import gsap from "gsap";
import { orderedRooms, moveRoomOrder, movableRoom } from "../room-order";
import type { World } from "../world";
import type { WThread, WProject } from "./types";
import { releaseRoomVectors } from "./geometry";

export class WorldRooms {
  finishRoomTransitions(this: World) {
    for (const tween of [...this.roomTweens.values()]) { tween.progress(1); tween.kill(); }
    this.roomTweens.clear();
  }

  tweenRoom(this: World, el: HTMLElement, vars: gsap.TweenVars) {
    this.roomTweens.get(el)?.kill();
    const done = () => { this.roomTweens.delete(el); el.classList.remove('room-changing'); };
    el.classList.add('room-changing');
    const tween = gsap.to(el, { ...vars, duration: .34, ease: 'power3.out', overwrite: 'auto', onComplete: done, onInterrupt: done });
    this.roomTweens.set(el, tween);
  }

  retireRoom(this: World, el: HTMLElement, animate: boolean) {
    this.roomTweens.get(el)?.kill(); this.cull.unobserve(el);
    const id = el.dataset.roomId || '';
    const previous = this.retiringRoomById.get(id); if (previous) this.roomTweens.get(previous)?.kill();
    const remove = () => { this.roomTweens.delete(el); this.retiringRooms.delete(el); if (this.retiringRoomById.get(id) === el) this.retiringRoomById.delete(id); releaseRoomVectors(el); el.remove(); };
    if (!animate) { remove(); return; }
    el.inert = true; el.setAttribute('aria-hidden', 'true'); delete el.dataset.roomId;
    el.classList.add('room-retiring'); this.retiringRooms.add(el); this.retiringRoomById.set(id, el);
    this.roomTweens.set(el, gsap.to(el, { opacity: 0, duration: .18, ease: 'power1.out', onComplete: remove, onInterrupt: remove }));
  }

  orderRooms<T extends { id: string }>(this: World, rooms: T[]) { return orderedRooms(rooms, this.roomOrder); }

  reorderRoom(this: World, id: string, before: string | null) {
    const current = this.orderRooms(this.rooms.filter((r) => movableRoom(r.id))).map((r) => r.id);
    const next = moveRoomOrder(this.roomOrder, current, id, before);
    if (!next) return false;
    this.roomOrder = next;
    if (this.lastData) this.update(this.lastData);
    this.onRoomOrder([...next]);
    return true;
  }

  setRoomColumns(this: World, id: string, value: number) {
    const columns = officeColumns(value);
    if (columns === officeColumns(this.roomColumns.get(id))) return;
    this.roomColumns.set(id, columns);
    const room = this.rooms.find(r => r.id === id);
    if (room) gameSound.at('switch', room.el, .7);
    if (this.lastData) this.update(this.lastData);
    this.onLayoutChange();
  }

  isRoomExpanded(this: World, id: string) { return !this.collapsedRooms.has(id); }

  setRoomExpanded(this: World, id: string, expanded: boolean) {
    if (this.isRoomExpanded(id) === expanded) return;
    const room = this.rooms.find(r => r.id === id);
    if (room) gameSound.at(expanded ? 'open' : 'switch', room.el, .7);
    if (expanded) { this.expandedRooms.add(id); this.collapsedRooms.delete(id); }
    else { this.expandedRooms.delete(id); this.collapsedRooms.add(id); }
    if (this.lastData) this.update(this.lastData);
    this.onLayoutChange();
  }

  revealThread(this: World, id: string | null) {
    if (this.revealedThread === id) return;
    this.revealedThread = id;
    const t = this.lastData?.threads.find((t) => t.id === id);
    if (t) { const home = this.homeForThread(t, this.lastData!.projects); this.hidden.delete(home.startsWith("p:") ? home.slice(2) : home); }
    if (this.lastData) this.update(this.lastData);
  }

  setLayoutHeld(this: World, held: boolean) {
    const was = this.layoutHeld; this.layoutHeld = held;
    if (was && !held && this.lastData) this.update(this.lastData);
  }

  cancelTouchLayoutFlush(this: World) {
    if (this.touchLayoutIdle) window.cancelIdleCallback?.(this.touchLayoutIdle);
    if (this.touchLayoutTimer) clearTimeout(this.touchLayoutTimer);
    this.touchLayoutIdle = this.touchLayoutTimer = 0;
  }

  holdTouchLayout(this: World, held: boolean) {
    this.touchLayoutHeld = held;
    this.cancelTouchLayoutFlush();
    if (held || !this.touchLayoutPending) return;
    const flush = () => {
      this.touchLayoutIdle = this.touchLayoutTimer = 0;
      if (this.touchLayoutHeld || !this.touchLayoutPending || !this.lastData || this.layoutHeld || this.deskDragActive) return;
      this.update(this.lastData);
    };
    // Keep release responsive too. Reconcile the newest authoritative snapshot
    // after the final camera frame, without pausing real work or supervision.
    if (window.requestIdleCallback) this.touchLayoutIdle = window.requestIdleCallback(flush, { timeout: 120 });
    else this.touchLayoutTimer = window.setTimeout(flush, 32);
  }

  homeForThread(this: World, t: WThread, projects: WProject[]) {
    const saved = this.homes.get(t.id), p = projects.find((p) => p.id === t.projectId);
    if (saved === "main" || saved === "freelance" || (saved?.startsWith("p:") && projects.some((p) => p.id === saved.slice(2)))) return saved;
    return !p || p.scratch ? "freelance" : `p:${p.id}`;
  }

  reconcilePhysicalLayout(this: World, force = false) {
    if ((!this.physicalLayoutHeld && !force) || this.layoutUpdateQueued) return;
    this.layoutUpdateQueued = true;
    queueMicrotask(() => { this.layoutUpdateQueued = false; if (this.lastData) this.update(this.lastData); });
  }
}
