// Opening threads: selecting a desk, following a robot, detached chats and answering questions.
import { Orchestrator } from "../office/orchestrator";
import type { ThreadInfo } from "../director";
import { api, $ } from "./dom";
import type { App } from "./context";

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineNavigation(app: App) {
  // "Chat" on the follow chip: the robot's desk if it has one, otherwise its conversation on its own
  app.openDetachedChat = function openDetachedChat(id: string, info?: ThreadInfo) {
    app.world.revealThread(id);
    const t = app.world.lastData?.threads.find((x) => x.id === id);
    if (!t) {
      // Saved papers outlive the active office list, including archived source threads.
      void (api as any).threadInfo(id).then((historical: ThreadInfo | null) => {
        if (!historical) return;
        app.chat.open({ threadId: id, info: historical, profile: app.world.roster.byThread(id) } as any, false);
        app.chat.setStatus("Thread history", "idle");
      }).catch((err: unknown) => console.error("Could not open saved source thread", err));
      return;
    }
    const profile = app.world.roster.byThread(id);
    app.chat.open({ threadId: id, info: info ?? { id, title: t.title, provider: t.provider }, profile: id === app.world.orchThread ? { ...profile, name: "Orchestrator" } : profile } as any, !info);
    app.chat.setThreadStatus(app.operationalStatus(t));
  };

  app.openAnswer = function openAnswer(id: string) {
    app.world.revealThread(id);
    const d = app.world.deskFor(id);
    if (d && !d.el.classList.contains("arriving")) app.world.focusOn(d);
    else {
      app.world.stopFollow();
      const room = app.world.rooms.find((r) => r.kind === "queue");
      if (room) app.world.showRoom(room.id);
      app.world.onFollowChat(id);
      app.paintSelectedStatus();
    }
    app.answer.focus(id);
  };

  app.openThread = function openThread(id: string) {
    app.markSelected(id);
    app.world.revealThread(id);
    if (app.needsAnswer(id)) { app.openAnswer(id); return; }
    const d = app.world.deskFor(id);
    if (d && !d.el.classList.contains("arriving")) {
      app.world.focusOn(d);
      // Focusing the desk already in focus changes nothing, so the conversation is shown here too.
      if (app.chat.threadId !== id || app.chat.collapsed) { app.chat.open(d); app.chat.setView(app.world.focusMode); app.pushStatus(d); }
      return;
    }
    // not at a desk: follow it wherever it is (break room, questions, park, walking)
    const el = document.querySelector(`.world-walker[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (el) {
      app.world.follow(el);
    }
    // Every real thread can be opened, including the boss in its chair and robots away
    // from their desks. Camera following and chat selection are independent.
    app.world.onWatchChat(id);
  };
}

export function wireScene(app: App) {
  // --- following one robot ----------------------------------------------------------------
  // The selected robot is shown in its chat (header and status line); the sidebar has no card for it.

  app.world.onSelectThread = (id) => {
    app.openThread(id);
  };
  $("scene").addEventListener("click", (e) => {
    const pad = (e.target as Element).closest(".desk-plan");
    if (!pad) return;
    const desk = [...app.world.desks.values()].find((d) => d.el.contains(pad));
    if (desk) app.world.focusOn(desk);
  }, true);
  app.sceneObserver = new MutationObserver(() => ($("back-btn").hidden = !$("scene").classList.contains("screen-mode")));
  app.sceneObserver.observe($("scene"), { attributes: true, attributeFilter: ["class"] });
  $("back-btn").addEventListener("click", () => app.world.unfocus());
}

export function wireFollow(app: App) {
  app.world.onFollowChat = (id) => {
    const d = app.world.deskFor(id);
    if (d && !d.el.classList.contains("arriving")) { app.world.focusOn(d); return; }
    app.openDetachedChat(id);
  };
  // A walking robot clicked while a chat is open: the chat follows to that robot, the camera follows its walk
  app.world.onWatchChat = (id) => {
    app.world.revealThread(id);
    const d = app.world.deskFor(id);
    if (d && !d.el.classList.contains("arriving")) { app.chat.open(d); app.chat.setView("desk"); app.pushStatus(d); return; }
    app.world.onFollowChat(id);
  };
  // A robot waiting for your answer: its chat opens with the answer card focused. At its desk if it
  // has one, otherwise beside the questions room where it waits in line.
  app.needsAnswer = (id: string) => !!app.world.lastData?.threads.find((t) => t.id === id)?.question;
}
