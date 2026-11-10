// Moving work around by hand: dragging desks between places and rooms, dropping a thread from the
// sidebar onto a room, and selecting a desk.
// Part of the World class (world.ts); see the note there on how its parts are combined.
import type { Pt } from "../../robot";
import { gameSound } from "../sound";
import gsap from "gsap";
import { Desk, UNIT_W, UNIT_H } from "../desk";
import { hasOfficeDesk, reserveRoomSeats, snakeSeat, reorderPhysicalSeats } from "../room-policy";
import type { World } from "../world";
import { WALL_FACE, SLOT_W, SLOT_H, columnsForRoom } from "./geometry";

export class WorldDeskDrag {
  slideDesk(this: World, d: Desk, at: Pt) {
    d.baseZ = Math.round(at.y);
    for (const w of this.transit.values()) w.stop();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.killTweensOf(d.el, "left,top"); gsap.set(d.el, { left: at.x, top: at.y }); d.lift("move", false); return;
    }
    gsap.to(d.el, { left: at.x, top: at.y, duration: 0.3,
      ease: "power3.out", overwrite: "auto", onUpdate: () => { d.baseZ = Math.round(this.deskPos(d).y); d.lift("move", false); },
      onComplete: () => { this.slidingDesks.delete(d); }, onInterrupt: () => { this.slidingDesks.delete(d); } });
    this.slidingDesks.add(d);
  }

  wireDeskDrag(this: World, d: Desk) {
    d.el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(".screen, .poke, button, input, textarea")) return;
      const entries = [...this.slotDesks].filter(([key]) => key.split("#")[0] === d.room).sort((a, b) => Number(a[0].split("#")[1]) - Number(b[0].split("#")[1]));
      const original = entries.map(([, desk]) => desk), source = original.indexOf(d);
      if (source < 0) return;
      e.stopPropagation(); e.preventDefault();
      try { d.el.setPointerCapture(e.pointerId); } catch { /* synthetic/offscreen pointer */ }
      const start = this.deskPos(d), x0 = e.clientX, y0 = e.clientY;
      let z = this.cam.s;
      const room = this.roomById(d.room)!;
      const cols = columnsForRoom(room);
      const positions = original.map((_, i) => { const { c, row } = snakeSeat(i, cols); return { x: room.x + 70 + c * SLOT_W, y: room.y + WALL_FACE + 40 + row * SLOT_H }; });
      let active = false, target = source, ended = false;
      let destination: string | null = null;
      let lastX = x0, lastY = y0, lastTiltX = x0;
      let preview: HTMLElement | null = null;
      const arrange = (index: number) => { const order = [...original]; order.splice(source, 1); order.splice(index, 0, d); return order; };
      const move = (ev: PointerEvent) => {
        if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (!active) {
          active = this.deskDragActive = this.dragged = true;
          this.stopFollow(); this.cancelCameraTween();
          z = this.cam.s;
          for (const w of this.transit.values()) w.stop();
          for (const desk of original) gsap.killTweensOf(desk.el, "left,top");
          document.body.classList.add("desk-dragging"); window.getSelection()?.removeAllRanges();
          d.el.classList.add("desk-grabbed");
          preview = document.createElement("div"); preview.className = "desk-drop-preview"; preview.textContent = "Place desk here";
          this.deskLayer.appendChild(preview);
        }
        ev.preventDefault();
        lastX = ev.clientX; lastY = ev.clientY;
        const over = d.threadId && d.threadId !== this.orchThread ? this.threadDropZone(ev.clientX, ev.clientY) : null;
        const nextDestination = over && over !== room.id ? over : null;
        if (nextDestination !== destination) { destination = nextDestination; this.previewThreadDrop(destination, d.threadId); }
        const rawX = start.x + (ev.clientX - x0) / z, rawY = start.y + (ev.clientY - y0) / z;
        const x = d.threadId ? rawX : Math.max(room.x + 22, Math.min(room.x + room.w - UNIT_W - 22, rawX));
        const y = d.threadId ? rawY : Math.max(room.y + WALL_FACE + 12, Math.min(room.y + room.h - UNIT_H - 22, rawY));
        d.el.style.setProperty("--desk-tilt", `${Math.max(-2, Math.min(2, (ev.clientX - lastTiltX) * .12))}deg`);
        lastTiltX = ev.clientX;
        gsap.set(d.el, { left: x, top: y });
        preview!.hidden = !!destination;
        if (destination) return;
        let next = target, distance = Infinity;
        positions.forEach((p, i) => { const dist = Math.hypot(x - p.x, y - p.y); if (dist < distance) { distance = dist; next = i; } });
        if (next !== target) { target = next; arrange(target).forEach((desk, i) => { if (desk !== d) this.slideDesk(desk, positions[i]); }); }
        preview!.style.left = `${positions[target].x + 24}px`; preview!.style.top = `${positions[target].y + 170}px`;
      };
      const finish = (commit: boolean, waitForRelease = false) => {
        if (ended) return;
        ended = true;
        d.el.removeEventListener("pointermove", move); d.el.removeEventListener("pointerup", up);
        d.el.removeEventListener("pointercancel", cancel); d.el.removeEventListener("lostpointercapture", cancel);
        window.removeEventListener("keydown", key, true); window.removeEventListener("blur", cancel);
        try { d.el.releasePointerCapture(e.pointerId); } catch {}
        if (!active) return;
        const transfer = commit && destination && d.threadId;
        // A release in the hall cancels; another office uses the shared home assignment.
        const reorder = commit && !transfer && (!d.threadId || this.threadDropZone(lastX, lastY) === room.id);
        const order = reorder ? arrange(target) : original;
        order.forEach((desk, i) => { this.slotDesks.set(entries[i][0], desk); if (!(transfer && desk === d)) this.slideDesk(desk, positions[i]); });
        if (reorder) this.seats.set(d.room, reorderPhysicalSeats(this.seats.get(d.room) ?? [], original.map((desk) => desk.threadId), order.map((desk) => desk.threadId)));
        preview?.remove(); d.el.classList.remove("desk-grabbed"); document.body.classList.remove("desk-dragging");
        this.previewThreadDrop(null);
        this.deskDragActive = false;
        // Capture phase also suppresses monitor and toy click handlers on release.
        const eat = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
        const eatClick = () => {
          window.addEventListener("click", eat, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", eat, true), 0);
        };
        if (waitForRelease) window.addEventListener("pointerup", eatClick, { capture: true, once: true }); else eatClick();
        setTimeout(() => { this.dragged = false; }, 0);
        if (transfer && this.placeThread(transfer, destination!, start)) gameSound.play("switch");
        else {
          if (this.lastData) this.update(this.lastData);
          if (reorder) this.onLayoutChange();
        }
      };
      const up = (ev: PointerEvent) => { if (active) move(ev); finish(true); }, cancel = () => finish(false);
      const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); finish(false, true); } };
      d.el.addEventListener("pointermove", move); d.el.addEventListener("pointerup", up);
      d.el.addEventListener("pointercancel", cancel); d.el.addEventListener("lostpointercapture", cancel);
      window.addEventListener("keydown", key, true); window.addEventListener("blur", cancel);
    });
  }

  threadDropZone(this: World, x: number, y: number): string | null {
    const rect = this.scene.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const at = { x: (x - rect.left - this.cam.x) / this.cam.s, y: (y - rect.top - this.cam.y) / this.cam.s };
    return this.rooms.find((r) => ["main", "project", "freelance"].includes(r.kind) && at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h)?.id ?? null;
  }

  previewThreadDrop(this: World, roomId: string | null, threadId: string | null = null, pending = false) {
    const room = this.roomById(roomId);
    if (!room) { this.threadDropPreview?.remove(); this.threadDropPreview = null; return; }
    // Reuse one preview while tracking. Recreating it on every move restarts its
    // entrance animation and forces layout even when the destination is unchanged.
    let el = this.threadDropPreview;
    if (!el) {
      el = document.createElement("div"); el.className = "office-drop-preview";
      el.setAttribute("aria-hidden", "true");
      el.append(document.createElement("span"), document.createElement("div"));
      el.lastElementChild!.className = "office-drop-seat";
      this.deskLayer.appendChild(el); this.threadDropPreview = el;
    }
    const claims = this.lastData?.threads.filter(t => t.id === threadId || this.homeForThread(t, this.lastData!.projects) === room.id) ?? [];
    const seats = reserveRoomSeats(this.seats.get(room.id) ?? [], claims, threadId);
    const index = Math.max(0, threadId ? seats.indexOf(threadId) : seats.findIndex(id => !id));
    const cols = room.collapsed ? this.roomColumns.get(room.id) ?? 1 : columnsForRoom(room);
    const { c, row } = snakeSeat(index, cols);
    const x = 70 + c * SLOT_W, y = WALL_FACE + 40 + row * SLOT_H;
    const key = `${room.id}:${room.x}:${room.y}:${room.w}:${room.h}:${room.collapsed}:${index}:${pending}`;
    if (el.dataset.placement === key) return;
    el.dataset.placement = key;
    const label = el.firstElementChild as HTMLElement, seat = el.lastElementChild as HTMLElement;
    label.textContent = `${pending ? "Moving to" : "Move to"} ${room.title}${room.collapsed ? pending ? " (opening office)" : " (opens on drop)" : y + UNIT_H > room.h ? pending ? " (expanding office)" : " (room grows)" : ""}`;
    el.classList.toggle("placement-pending", pending);
    el.style.cssText = `left:${room.x + 16}px;top:${room.y + WALL_FACE}px;width:${room.w - 32}px;height:${room.h - WALL_FACE - 16}px`;
    seat.hidden = !!room.collapsed;
    seat.style.left = `${x - 16 + 24}px`; seat.style.top = `${y - WALL_FACE + 170}px`;
    seat.textContent = `Desk ${index + 1}`;
  }

  syncPlacementPreview(this: World) {
    const p = this.pendingPlacement;
    if (!p) return;
    const t = this.lastData?.threads.find(t => t.id === p.id);
    if (!t || !hasOfficeDesk(t, this.revealedThread) || this.desks.get(p.id)?.room === p.room && !this.physicalLayoutHeld) {
      this.pendingPlacement = null; this.previewThreadDrop(null); return;
    }
    this.previewThreadDrop(p.room, p.id, true);
  }

  placeThread(this: World, id: string, roomId: string, origin?: Pt) {
    const room = this.roomById(roomId), t = this.lastData?.threads.find((t) => t.id === id);
    if (!room || !t || id === this.orchThread || !["main", "project", "freelance"].includes(room.kind)) return false;
    this.homes.set(id, roomId);
    this.revealedThread = id;
    this.expandedRooms.add(roomId); this.collapsedRooms.delete(roomId);
    for (const [r, seats] of this.seats) if (r !== roomId) this.seats.set(r, seats.map((seat) => seat === id ? null : seat));
    // User placement takes effect immediately. Questions can still take the robot to the queue.
    this.placed.set(id, { room: t.question ? "queue" : roomId });
    this.pendingPlacement = { id, room: roomId, origin };
    this.update(this.lastData!); this.syncPlacementPreview(); this.onLayoutChange();
    return true;
  }

  select(this: World, d: Desk | null) {
    this.selected?.el.classList.remove("selected");
    this.selected = d;
    d?.el.classList.add("selected");
  }

  deskFor(this: World, threadId: string) { return this.desks.get(threadId) ?? null; }
}
