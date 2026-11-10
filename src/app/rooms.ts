// The rooms list in the sidebar: rooms, their menus, drag to reorder, building and park buttons.
import { icon as uiIcon } from "../ui/icons";
import type { Room } from "../office/world";
import { wireRoomDrag } from "../office/room-drag";
import { movableRoom } from "../office/room-order";
import { esc, $ } from "./dom";
import type { App } from "./context";

export function mountRoomList(app: App) {
  // --- rooms --------------------------------------------------------------------------
  app.world.onRooms = (rooms: Room[]) => {
    app.projectLife.sync();
    const list = $("room-list");
    const ordered = [...rooms.filter((r) => !movableRoom(r.id)), ...app.world.orderRooms(rooms.filter((r) => movableRoom(r.id)))];
    const html = ordered.map((r) => {
      const office = ["main", "project", "freelance"].includes(r.kind);
      const pin = office && app.world.isRoomExpanded(r.id);
      return `<li class="room-list-row">
        ${movableRoom(r.id) ? `<button type="button" class="room-grab" data-room-id="${esc(r.id)}" aria-label="Move ${esc(r.title)}" title="Drag to reorder ${esc(r.title)}. Click for move options.">${uiIcon("grip", 14)}</button>` : ""}
        <button type="button" class="room-open" data-room="${esc(r.id)}" title="${esc(r.title)}${r.collapsed ? ": open quiet office" : ""}">
          ${r.icon ? `<img src="${esc(r.icon)}" alt="">` : `<span class="dot ${r.kind}"></span>`}
          <span class="rt">${esc(r.title)}</span><span class="rc">${r.threadIds.length || ""}</span>
        </button>
        ${office ? `<button type="button" class="room-fold" data-fold-room="${esc(r.id)}" aria-pressed="${!!pin}" aria-label="${pin ? "Collapse" : "Expand"} ${esc(r.title)}" title="${pin ? "Collapse office" : "Expand office"}">${pin ? "Collapse" : "Expand"}</button>` : ""}
      </li>`;
    }).join("");
    if (list.dataset.html !== html) {
      const focused = document.activeElement as HTMLElement | null;
      const key = focused && list.contains(focused) ? { room: focused.dataset.room, grip: focused.dataset.roomId, fold: focused.dataset.foldRoom } : null;
      list.innerHTML = html; list.dataset.html = html;
      if (key) {
        const selector = key.room ? `[data-room="${CSS.escape(key.room)}"]` : key.grip ? `.room-grab[data-room-id="${CSS.escape(key.grip)}"]` : key.fold ? `[data-fold-room="${CSS.escape(key.fold)}"]` : "";
        if (selector) list.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
      }
    }
  };
  $("room-list").addEventListener("click", (e) => {
    const grip = (e.target as HTMLElement).closest<HTMLElement>(".room-grab[data-room-id]");
    if (grip) { const room = app.world.rooms.find((r) => r.id === grip.dataset.roomId); if (room) { const b = grip.getBoundingClientRect(); app.world.onRoomMenu(room, b.left, b.bottom); } return; }
    const fold = (e.target as HTMLElement).closest<HTMLElement>("[data-fold-room]");
    if (fold) { const id = fold.dataset.foldRoom!; app.world.setRoomExpanded(id, !app.world.isRoomExpanded(id)); return; }
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-room]");
    if (!b) return;
    if (app.world.rooms.some((r) => r.id === b.dataset.room && ["main", "project", "freelance"].includes(r.kind))) app.world.setRoomExpanded(b.dataset.room!, true);
    app.world.showRoom(b.dataset.room!);
    if (b.dataset.room?.startsWith("p:")) void app.projectLife.open(b.dataset.room.slice(2));
    // the questions room: answer the robot at the front of the line
    if (app.world.rooms.find((r) => r.id === b.dataset.room)?.kind === "queue") { const t = app.world.lastData?.threads.find((x) => x.question); if (t) app.openAnswer(t.id); }
  });
  $("room-list").addEventListener("contextmenu", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("li");
    const id = row?.querySelector<HTMLElement>("[data-room]")?.dataset.room;
    const room = app.world.rooms.find((r) => r.id === id);
    if (!room || !["main", "project", "freelance"].includes(room.kind)) return;
    e.preventDefault(); app.world.onRoomMenu(room, e.clientX, e.clientY);
  });
  wireRoomDrag({ scene: $("scene"), list: $("room-list"), rooms: () => app.world.orderRooms(app.world.rooms.filter((r) => movableRoom(r.id))),
    hold: (active) => { if (active) app.world.stopCameraMotion(); app.world.setLayoutHeld(active); }, reorder: (id, before) => app.world.reorderRoom(id, before) });
  $("overview").addEventListener("click", () => app.world.overview());
  $("park").addEventListener("click", () => app.world.showPark());
}
