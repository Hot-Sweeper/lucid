// Office and desk menus, including hiring a robot for a new task.
import { gameSound } from "../office/sound";
import { openDecorate, type RoomTheme } from "../office/decorate";
import { Delegate } from "../office/delegate";
import { showMenu, confirmDialog, noticeDialog } from "../office/menus";
import { openHire, BUILTIN_ROLES } from "../office/hire";
import { openCustomizeFor } from "../office/customize";
import { movableRoom } from "../office/room-order";
import { api, $ } from "./dom";
import type { App } from "./context";

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineMenus(app: App) {
  app.setupMenus = function setupMenus() {
    app.world.onAddDesk = (room) => {
      app.world.setRoomExpanded(room, true);
      app.world.extra.set(room, Math.max(0, app.world.extra.get(room) ?? 0) + 1);
      app.world.seats.get(room)?.push(null);
      if (app.world.lastData) app.world.update(app.world.lastData);
      app.saveSettings();
      void app.refresh();
    };
    const applyDeskRemoval = (remove: () => number | boolean) => {
      if (!remove()) return;
      if (app.world.lastData) app.world.update(app.world.lastData);
      gameSound.play('switch'); app.saveSettings(); void app.refresh();
    };
    app.world.onRemoveEmptyDesk = slot => applyDeskRemoval(() => app.world.removeEmptyDesk(slot));
    app.world.onFreeDeskMenu = (d, slot, x, y) => {
      const room = slot.split("#")[0];
      showMenu(x, y, room === "main" ? "Drag a thread here from the sidebar" : "Free desk", [
        ...(room === "main" ? [] : [{ label: "Hire someone for this desk", run: () => app.world.onFreeDesk(d, slot, x, y) }]),
        ...(app.world.canRemoveEmptyDesk(slot) ? [{ label: "Remove this desk", danger: true, run: () => app.world.onRemoveEmptyDesk(slot) }] : []),
        ...(app.world.emptyDeskSlots(room).length > 1 ? [{ label: "Remove empty desks in this office", danger: true, run: () => applyDeskRemoval(() => app.world.removeEmptyDesks(room)) }] : []),
      ]);
    };
    const hireForOffice = (room: string, idx: number, intent?: "thread" | "delegate") => {
      const data = app.world.lastData;
      if (!data) return;
      const r = app.world.rooms.find((q) => q.id === room);
      const scratch = data.projects.find((p) => p.scratch);
      const projectId = room.startsWith("p:") ? room.slice(2) : room === "freelance" ? scratch?.id ?? "" : "";
      const real = data.projects.filter((p) => !p.scratch && !app.world.hidden.has(p.id) && p.id !== app.settings.orch?.projectId);
      const freeTeam = () => {
        const latest = app.world.lastData ?? data;
        const settledNow = new Set(latest.threads.filter(t => t.settled && !t.pinned).map(t => t.id));
        return app.world.roster.freeTeam(settledNow).map(robot => {
          const thread = [robot.threadId, ...[...(robot.done ?? [])].reverse()].map(id => latest.threads.find(t => t.id === id && t.provider === robot.provider && t.model)).find(Boolean);
          return { ...robot, model: thread?.model || robot.lastModel || null };
        });
      };
      openHire({
        room, roomTitle: r?.title ?? "Office", seat: Number(idx) || 0, intent,
        team: freeTeam(), getTeam: freeTeam, projectId,
        loadRuntime: id => (window as any).lucidT3.hireConfig({ projectId: id }),
        saveAttachment: (name, bytes) => (api as any).saveAttachment(name, bytes),
        roles: [...BUILTIN_ROLES, ...(app.settings.roles ?? [])],
        onNewRole: (r) => { app.settings.roles = [...(app.settings.roles ?? []), r]; app.saveSettings(); },
        projects: projectId ? null : real.map((p) => ({ id: p.id, title: p.title })),
        onHire: async (c) => {
          const project = projectId || c.projectId;
          if (!project) throw new Error("Choose a project for this desk");
          if (c.robotId && app.world.roster.byThread(c.requestId)?.id !== c.robotId) {
            const latest = await api.world();
            const robot = app.world.roster.robots.find(r => r.id === c.robotId);
            if (!robot || robot.threadId && !latest.threads.some(t => t.id === robot.threadId && t.settled && !t.pinned)) throw new Error("That robot is no longer free. Choose another candidate.");
          }
          const message = c.role ? `Your role: ${c.role.name}. ${c.role.brief}\n\nTask: ${c.task}` : c.task;
          const { threadId } = await api.startThread({ project, message, provider: c.provider, model: c.model, options: c.options, requestId: c.requestId });
          app.world.roster.assignRobot(threadId, c.robotId, c.provider, c.role?.name ?? "", c.model);
          app.world.homes.set(threadId, room);
          app.world.pendingSeat = { room, index: Number(idx) || 0, threadId };
          app.world.sprint(threadId);
          app.saveSettings();
          await app.refresh();
          const nd = app.world.deskFor(threadId);
          if (nd) { app.world.select(nd); app.world.focusOn(nd); }
        },
      });
    };
    app.world.onFreeDesk = (_d, slot, x, y) => {
      const [room, idx] = slot.split("#");
      hireForOffice(room, Number(idx) || 0);
    };
    const startOfficeWork = (room: string, intent: "thread" | "delegate") => {
      gameSound.play('open');
      hireForOffice(room, app.world.firstFreeDesk(room), intent);
    };
    // New task from anywhere: the project office in view gets it, otherwise the main office asks for a project.
    app.startNewTask = () => {
      const room = app.world.focusDesk?.room;
      startOfficeWork(room && room.startsWith("p:") && app.world.rooms.some(r => r.id === room) ? room : "main", "thread");
    };
    const decorate = (room: { id: string; title: string }) => {
      const SHEET = 372; // the decorate panel covers the right side of the view
      app.world.showRoom(room.id, SHEET);
      openDecorate({ title: room.title, theme: app.world.themes.get(room.id) ?? {}, onChange: async (t: RoomTheme) => {
        app.world.themes.set(room.id, t); app.saveSettings();
        await app.refresh();
        app.world.showRoom(room.id, SHEET);   // the room may have grown a lounge
      } });
    };
    (window as any).__decorate = decorate; // debug handle for test runs
    app.world.onRoomMenu = (room, x, y) => {
      const work = [
        { label: "New thread", run: () => startOfficeWork(room.id, "thread") },
        { label: "Delegate task", run: () => startOfficeWork(room.id, "delegate") },
      ];
      const deco = { label: "Decorate", run: () => decorate(room) };
      const free = app.world.emptyDeskSlots(room.id).length;
      const cleanup = free ? [{ label: `Remove ${free} empty desk${free === 1 ? "" : "s"}`, danger: true, run: () => applyDeskRemoval(() => app.world.removeEmptyDesks(room.id)) }] : [];
      const policy = { label: app.world.isRoomExpanded(room.id) ? "Collapse office" : "Expand office", run: () => app.world.setRoomExpanded(room.id, !app.world.isRoomExpanded(room.id)) };
      const order = app.world.orderRooms(app.world.rooms.filter((r) => movableRoom(r.id)));
      const index = order.findIndex((r) => r.id === room.id);
      const moveOffice = (before: string | null) => {
        app.world.reorderRoom(room.id, before);
        $("room-list").querySelector<HTMLElement>(`.room-grab[data-room-id="${CSS.escape(room.id)}"]`)?.focus({ preventScroll: true });
      };
      const moves = [
        ...(index > 0 ? [{ label: "Move office earlier", run: () => moveOffice(order[index - 1].id) }] : []),
        ...(index >= 0 && index < order.length - 1 ? [{ label: "Move office later", run: () => moveOffice(order[index + 2]?.id ?? null) }] : []),
      ];
      if (room.kind === "main") { showMenu(x, y, room.title, [...work, ...cleanup, deco, policy]); return; }
      if (room.kind === "freelance") {
        showMenu(x, y, "Freelancers", [...work, ...cleanup, deco, policy, ...moves, { label: "Hide this office", run: () => { app.world.hidden.add("freelance"); app.saveSettings(); void app.refresh(); } }]);
        return;
      }
      const pid = room.id.slice(2);
      showMenu(x, y, room.title, [
        { label: "Project office board", run: () => app.projectLife.open(pid) },
        ...work, ...cleanup,
        deco, policy, ...moves,
        { label: "Hide this office", run: () => { app.world.hidden.add(pid); app.saveSettings(); void app.refresh(); } },
        { label: "Remove project from T3", danger: true, run: async () => {
          const ok = await confirmDialog(`Remove ${room.title} from T3?`,
            "T3 removes the project only if it has no threads left. Threads are never deleted from here. You can add the folder again any time.", "Remove project");
          if (!ok) return;
          try { await api.removeProject({ id: pid }); void app.refresh(); }
          catch (err: any) { await noticeDialog("T3 kept the project", String(err.message || err)); }
        } },
      ]);
    };
    app.world.onDeskMenu = (d, x, y) => {
      const items: any[] = [
        { label: "Worker profile", run: () => { const r = d.threadId ? app.world.roster.byThread(d.threadId) : null; if (r) app.openWorkerProfile(r, d.el.querySelector(".robot-host")); } },
        { label: "Look at its screen", run: () => app.world.focusScreen(d) },
        { label: "Go to its desk", run: () => app.world.showDesk(d) },
        { label: "Customize robot", run: () => openCustomizeFor(d, app.world.roster) },
      ];
      if (d.threadId) items.push(...app.pinItems(d.threadId), ...app.threadActionItems(d.threadId), ...app.officeMoveItems(d.threadId));
      if (d.room === "freelance" && d.folder) {
        items.push({ input: "Turn this work into a project", placeholder: "Project name", value: (d.info?.title || "").slice(0, 40), submit: "Create project",
          run: async (name: string) => { await api.addProject({ path: d.folder!, title: name }); await app.refresh(); } });
      }
      showMenu(x, y, d.info?.title || "Robot", items);
    };
  };
}

export function prepareMenus(app: App) {
  // --- office and desk options -------------------------------------------------------------
  app.startNewTask = () => {};
}
