import { movableRoom, roomDropSlot, type RoomDragRect } from "./room-order";

type Room = { id: string; title: string; kind: string; el: HTMLElement };
type Options = {
  scene: HTMLElement; list: HTMLElement; rooms(): Room[];
  hold(active: boolean): void; reorder(id: string, before: string | null): boolean;
};

// Only the title/grip starts this interaction. Desk, screen and thread drags keep
// their existing targets, while the source and layout stay put until a valid drop.
export function wireRoomDrag(options: Options) {
  let cancelCurrent: (() => void) | null = null;
  const handles = ".room-sign-hit[data-room-id],.room-grab[data-room-id]";
  const targets = [options.scene, options.list];
  const start = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const handle = (e.target as Element).closest<HTMLElement>(handles);
    const id = handle?.dataset.roomId;
    if (!handle || !id || !movableRoom(id)) return;
    const room = options.rooms().find((r) => r.id === id);
    if (!room) return;
    cancelCurrent?.();
    e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY;
    let active = false, ended = false, before: string | null = null, valid = false;
    let ghost: HTMLElement | null = null, marker: HTMLElement | null = null;
    try { handle.setPointerCapture(e.pointerId); } catch {}
    const suppressClick = () => {
      const stop = (ev: Event) => { ev.preventDefault(); ev.stopImmediatePropagation(); };
      window.addEventListener("click", stop, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", stop, true), 0);
    };
    const cleanup = () => {
      ended = true;
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel); handle.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", key, true); window.removeEventListener("blur", cancel);
      handle.classList.remove("room-drag-source"); document.body.classList.remove("room-dragging");
      ghost?.remove(); marker?.remove(); cancelCurrent = null;
      try { handle.releasePointerCapture(e.pointerId); } catch {}
    };
    const cancel = (ev?: Event) => {
      if (ended) return;
      cleanup();
      if (!active) return;
      options.hold(false);
      if (ev instanceof KeyboardEvent) window.addEventListener("pointerup", suppressClick, { capture: true, once: true });
      else suppressClick();
    };
    const rects = (sidebar: boolean): RoomDragRect[] => options.rooms().filter((r) => movableRoom(r.id)).flatMap((r) => {
      const el = sidebar ? [...options.list.querySelectorAll<HTMLElement>("[data-room]")].find((el) => el.dataset.room === r.id)?.closest("li") : r.el;
      if (!el) return [];
      const b = el.getBoundingClientRect();
      return [{ id: r.id, title: r.title, left: b.left, top: b.top, width: b.width, height: b.height }];
    });
    const positionGhost = (x: number, y: number) => {
      ghost!.style.left = `${Math.max(8, Math.min(innerWidth - ghost!.offsetWidth - 8, x + 14))}px`;
      ghost!.style.top = `${Math.max(8, Math.min(innerHeight - ghost!.offsetHeight - 8, y - ghost!.offsetHeight - 12))}px`;
    };
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!active) {
        active = true; options.hold(true); window.getSelection()?.removeAllRanges();
        document.body.classList.add("room-dragging"); handle.classList.add("room-drag-source");
        ghost = document.createElement("div"); ghost.className = "room-drag-ghost"; ghost.textContent = room.title; ghost.setAttribute("aria-hidden", "true");
        marker = document.createElement("div"); marker.className = "room-drop-preview"; marker.setAttribute("role", "status");
        document.body.append(ghost, marker);
      }
      ev.preventDefault();
      const lb = options.list.getBoundingClientRect(), sb = options.scene.getBoundingClientRect();
      const sidebar = ev.clientX >= lb.left && ev.clientX <= lb.right && ev.clientY >= lb.top && ev.clientY <= lb.bottom;
      const inScene = ev.clientX >= sb.left && ev.clientX <= sb.right && ev.clientY >= sb.top && ev.clientY <= sb.bottom;
      const slot = sidebar || inScene ? roomDropSlot(rects(sidebar), id, ev.clientX, ev.clientY, sidebar) : null;
      valid = !!slot; marker!.hidden = !slot;
      if (!slot) { ghost!.textContent = room.title; positionGhost(ev.clientX, ev.clientY); return; }
      before = slot.before;
      marker!.textContent = `Move ${slot.after ? "after" : "before"} ${slot.target.title}`;
      ghost!.textContent = `${room.title}\n${marker!.textContent}`;
      positionGhost(ev.clientX, ev.clientY);
      marker!.classList.toggle("room-drop-after", slot.after);
      const left = Math.max(0, slot.target.left), top = Math.max(0, slot.target.top);
      marker!.style.left = `${left}px`; marker!.style.top = `${top}px`;
      marker!.style.width = `${Math.max(0, Math.min(innerWidth, slot.target.left + slot.target.width) - left)}px`;
      marker!.style.height = `${Math.max(0, Math.min(innerHeight, slot.target.top + slot.target.height) - top)}px`;
    };
    const up = () => {
      if (ended) return;
      cleanup();
      if (!active) return;
      suppressClick();
      try { if (valid) options.reorder(id, before); } finally { options.hold(false); }
    };
    const key = (ev: KeyboardEvent) => {
      if (ended || ev.key !== "Escape") return;
      ev.preventDefault(); ev.stopImmediatePropagation(); cancel(ev);
    };
    cancelCurrent = cancel;
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel); handle.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", key, true); window.addEventListener("blur", cancel);
  };
  const nativeDrag = (e: DragEvent) => { if ((e.target as Element).closest(handles)) e.preventDefault(); };
  for (const box of targets) { box.addEventListener("pointerdown", start); box.addEventListener("dragstart", nativeDrag, true); }
  return () => { cancelCurrent?.(); for (const box of targets) { box.removeEventListener("pointerdown", start); box.removeEventListener("dragstart", nativeDrag, true); } };
}
