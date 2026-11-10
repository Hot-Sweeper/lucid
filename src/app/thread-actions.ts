// Thread actions: referencing a thread in the chat, pins, thread menus and moving threads between offices.
import { gameSound } from "../office/sound";
import { showMenu, confirmDialog } from "../office/menus";
import { wireThreadDrag } from "../office/thread-drag";
import type { ThreadRef } from "../office/thread-ref";
import { $ } from "./dom";
import type { App } from "./context";
const RUNNING = new Set(["running", "starting", "preparing", "queued"]);

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineThreadActions(app: App) {
  // --- referencing a thread in the chat: drag it in, press R on it, or use its menu ----------
  app.threadRef = function threadRef(id: string): ThreadRef | null {
    const data = app.world.lastData;
    const t = data?.threads.find((x) => x.id === id);
    if (!t) return null;
    const p = data!.projects.find((x) => x.id === t.projectId);
    return { id, title: t.title || "Untitled thread", project: !p || p.scratch ? "No project" : p.title, provider: t.provider };
  };

  app.referenceInChat = function referenceInChat(id: string, x: number, y: number) {
    const ref = app.threadRef(id);
    if (!ref) return;
    if (app.chat.isOpen && app.chat.threadId) { app.chat.addReference(ref); return; }
    showMenu(x, y, "Open a robot's chat to reference this thread", [{ label: "Chat with this thread's robot", run: () => app.openThread(id) }]);
  };

  /** T3's own pin. The orchestrator stays pinned, so it has no item. */
  app.pinItems = function pinItems(id: string) {
    const t = app.world.lastData?.threads.find(x => x.id === id);
    if (!t || t.settled || id === app.world.orchThread) return [];
    return [{ label: t.pinned ? "Unpin in T3" : "Pin in T3", run: async () => {
      try { await (window as any).lucidT3.pin({ threadId: id, pinned: !t.pinned }); gameSound.play("clip"); await app.refresh(); app.renderThreads(true); }
      catch (err: any) { void confirmDialog(t.pinned ? "T3 kept the thread pinned" : "T3 did not pin the thread", String(err?.message || err), "OK"); }
    } }];
  };

  app.threadActionItems = function threadActionItems(id: string) {
    const t = app.world.lastData?.threads.find(x => x.id === id);
    if (!t) return [];
    const t3 = (window as any).lucidT3;
    const items: any[] = [];
    if (RUNNING.has((t.runStatus ?? "").toLowerCase())) items.push({ label: "Stop", run: async () => {
      try { await t3.stop({ threadId: id }); gameSound.play("switch"); await app.refresh(); }
      catch (err: any) { void confirmDialog("T3 did not stop the thread", String(err?.message || err), "OK"); }
    } });
    items.push({ input: "Rename", placeholder: "Thread name", value: t.title || "", submit: "Rename", run: async (title: string) => { await t3.rename({ threadId: id, title }); await app.refresh(); app.renderThreads(true); } });
    if (id !== app.world.orchThread && !RUNNING.has((t.runStatus ?? "").toLowerCase())) items.push({ label: "Archive in T3", danger: true, run: async () => {
      if (!await confirmDialog("Archive this thread?", "It leaves the office and T3's thread list. Archived threads stay in T3, where you can restore them.", "Archive")) return;
      try { await t3.archive({ threadId: id }); gameSound.play("paper"); await app.refresh(); app.renderThreads(true); }
      catch (err: any) { void confirmDialog("T3 did not archive the thread", String(err?.message || err), "OK"); }
    } });
    return items;
  };

  app.officeMoveItems = function officeMoveItems(id: string) {
    if (id === app.world.orchThread) return [];
    const current = app.world.homes.get(id) ?? app.world.deskFor(id)?.room;
    return app.world.rooms.filter(r => ["main", "project", "freelance"].includes(r.kind) && r.id !== current).map(r => ({
      label: `Move to ${r.title}`,
      run: () => { if (app.world.placeThread(id, r.id)) gameSound.play("switch"); },
    }));
  };

  app.threadMenu = function threadMenu(row: HTMLElement, x: number, y: number) {
    const id = row.dataset.id!, ref = app.threadRef(id);
    if (!ref) return;
    const items = [{ label: "Open", run: () => app.openThread(id) }];
    const { previous, next } = app.threadNeighbors(id);
    if (previous) items.push({ label: "Move up (Alt+Up)", run: () => { void app.moveThread(id, previous.id, false); } });
    if (next) items.push({ label: "Move down (Alt+Down)", run: () => { void app.moveThread(id, next.id, true); } });
    if (app.chat.isOpen && app.chat.threadId && app.chat.threadId !== id) items.unshift({ label: "Reference in chat (R)", run: () => { app.chat.addReference(ref); } });
    items.push(...app.pinItems(id), ...app.threadActionItems(id), ...app.officeMoveItems(id));
    showMenu(x, y, ref.title, items);
  };
}

export function mountThreadActions(app: App) {
  wireThreadDrag([$("th-list"), $("rail-list")], app.chat, app.threadRef, {
    hold: (active) => { if (active) app.world.stopCameraMotion(); app.world.setLayoutHeld(active); },
    zone: (x, y) => {
      const button = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-room]");
      const room = button?.dataset.room;
      return room && app.world.rooms.some((r) => r.id === room && ["main", "project", "freelance"].includes(r.kind)) ? room : app.world.threadDropZone(x, y);
    },
    preview: (room, id) => app.world.previewThreadDrop(room, id),
    place: (id, room) => app.world.placeThread(id, room),
  }, {
    target: (id, x, y) => {
      if (app.threadMovePending || ($("th-q") as HTMLInputElement).value.trim()) return null;
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("#th-list .th-row[data-id]");
      const threads = app.world.lastData?.threads ?? [];
      const source = threads.find(t => t.id === id), target = threads.find(t => t.id === row?.dataset.id);
      if (!row || !source || !target || source === target || source.settled || target.settled || source.pinned !== target.pinned) return null;
      const after = y > row.getBoundingClientRect().top + row.offsetHeight / 2;
      return { row, after };
    },
    move: (id, targetId, after) => { void app.moveThread(id, targetId, after); },
  });
  /** Stop, rename and archive through T3's own thread commands. */
  for (const box of [$("th-list"), $("rail-list")]) {
    box.addEventListener("contextmenu", (e) => {
      const row = (e.target as HTMLElement).closest("[data-id]") as HTMLElement | null;
      if (!row) return;
      e.preventDefault();
      // from the keyboard (menu key) the menu opens beside the row instead of at 0, 0
      const r = row.getBoundingClientRect();
      app.threadMenu(row, e.clientX || r.right - 20, e.clientY || r.top + 8);
    });
    box.addEventListener("keydown", (e) => {
      const row = (e.target as HTMLElement).closest("[data-id]") as HTMLElement | null;
      if (row && e.altKey && !e.ctrlKey && !e.metaKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const { previous, next } = app.threadNeighbors(row.dataset.id!);
        const target = e.key === "ArrowUp" ? previous : next;
        if (target) void app.moveThread(row.dataset.id!, target.id, e.key === "ArrowDown");
        return;
      }
      if (!row || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      app.referenceInChat(row.dataset.id!, r.right - 20, r.top + 8);
    });
  }
}
