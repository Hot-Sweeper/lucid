// The side chat and the answer card: their callbacks into the office, and the selected thread's status.
import { threadState } from "../office/thread-state";
import { showReport } from "../office/report";
import { gameSound } from "../office/sound";
import { type WorldData } from "../office/world";
import { ChatPanel } from "../office/chat-panel";
import { latestSourceReport } from "../office/chat-review";
import { latestThreadReviews, threadReviewLabel } from "../office/thread-review";
import { AnswerCard } from "../office/answer";
import { sharedPendingRequests } from "../office/monitor-tasks";
import { avatar } from "../office/hire";
import { harnessName } from "../robot";
import type { Desk } from "../office/desk";
import { foldSection } from "../office/sidebar";
import { api, $ } from "./dom";
import type { App } from "./context";
const threadCardPortraits = new Map<string, { signature: string; svg: string }>();

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineChat(app: App) {
  app.operationalStatus = function operationalStatus(t: WorldData["threads"][number]) {
    const reviews = latestThreadReviews(app.currentEnvironment ? [] : app.orch.papers);
    const review = threadReviewLabel(t, reviews.get(t.id), !app.currentEnvironment && !!app.settings.orch && t.id !== app.settings.orch.threadId);
    return threadState(t, review, app.delegate.phaseOf(t.id) === "reading");
  };

  app.paintSelectedStatus = function paintSelectedStatus() {
    app.markSelected(app.chat.threadId);
    const t = app.world.lastData?.threads.find(t => t.id === app.chat.threadId);
    if (t) app.chat.setThreadStatus(app.operationalStatus(t));
  };

  app.pushStatus = function pushStatus(d: Desk) {
    const t = app.world.lastData?.threads.find(t => t.id === d.threadId);
    const run = t?.runStatus ?? d.info?.run?.status;
    app.chat.setThreadStatus(t ? app.operationalStatus(t) : threadState({ runStatus: run || null, updatedAt: "", question: (d.info as any)?.question }));
    app.chat.setTyping(run === "running" && /^Writing to you/.test(d.activity || ""), d.profile?.name ?? "It");
  };
}

export function createChat(app: App) {
   // debug handle for test runs
  app.chat = new ChatPanel($("scene").parentElement!, {
    threadCard: ref => {
      const data = app.world.lastData;
      const id = data?.nativeEnvironmentId === ref.environmentId ? ref.threadId : `${ref.environmentId}::${ref.threadId}`;
      const thread = data?.threads.find(t => t.id === id);
      if (!thread) return null;
      const robot = app.world.roster.byThread(id);
      const signature = JSON.stringify([thread.provider, robot?.look]);
      let portrait = threadCardPortraits.get(id);
      if (!portrait || portrait.signature !== signature) {
        portrait = { signature, svg: avatar(thread.provider, robot?.look, 44) }; threadCardPortraits.set(id, portrait);
        if (threadCardPortraits.size > 500) threadCardPortraits.delete(threadCardPortraits.keys().next().value!);
      }
      return { title: thread.title, provider: harnessName(thread.provider), model: thread.model, name: robot?.name, portrait: portrait.svg };
    },
    openThreadCard: ref => {
      const id = app.world.lastData?.nativeEnvironmentId === ref.environmentId ? ref.threadId : `${ref.environmentId}::${ref.threadId}`;
      if (app.world.lastData?.threads.some(t => t.id === id)) { gameSound.play('open'); app.openThread(id); }
    },
    conversation: (id) => api.conversation(id), conversationPage: (id, options) => (api as any).conversationPage(id, options),
    sendMessage: (o) => api.sendMessage(o), saveAttachment: (n, d) => (api as any).saveAttachment(n, d), revealFile: (api as any).revealFile ? (p) => (api as any).revealFile(p) : undefined, t3: (window as any).lucidT3,
    // Saved reports belong to this environment's actual review conversation.
    reviewPapers: async id => !app.currentEnvironment && id === app.settings.orch?.threadId ? (api as any).reportsList() : [],
    sourceReport: async id => !app.currentEnvironment && id !== app.settings.orch?.threadId ? latestSourceReport(await (api as any).reportsList(), id) : null,
    openReview: (paper, questions) => {
      if (app.currentEnvironment) return;
      gameSound.play('open');
      void showReport(paper.threadId, paper.title, () => app.openThread(paper.threadId), paper.id, app.openThread, questions);
    },
    openReviewThread: paper => { if (!app.currentEnvironment) app.openThread(paper.threadId); },
  });
  // the sidebar and the chat are columns beside the scene, so the camera always fits what is left (see World)
  app.world.onFocus = (d) => { if (d) { app.world.revealThread(d.threadId); app.chat.open(d); app.pushStatus(d); } };
  // a robot's question, answered from its chat (see openAnswer)
  app.answerDeps = { pending: sharedPendingRequests((id) => (window as any).lucid.pendingRequests(id)), t3: (window as any).lucidT3, advice: (rid: string) => app.delegate.advice.get(rid) ?? null };
  app.answer = new AnswerCard(app.chat, app.answerDeps);
}

export function wireChatHooks(app: App) {
   // isolated answer-form fixture handle
  // a chat opened without a desk (questions room, follow chip) closes itself
  app.chat.threadFacts = (id) => {
    const t = app.world.lastData?.threads.find(t => t.id === id);
    if (!t) return null;
    const p = app.world.lastData!.projects.find(p => p.id === t.projectId);
    return { title: t.title, project: p && !p.scratch ? p.title : "", model: t.model };
  };
  app.chat.onClose = () => { app.chat.close(); app.world.unfocus(); app.world.revealThread(null); app.markSelected(null); };
  app.chat.onChooseThread = () => {
    app.toggleRail(false, false);
    const search = $("th-q") as HTMLInputElement;
    app.folded.delete("threads");
    app.ui.folded = [...app.folded];
    foldSection("threads", true, false);
    search.focus();
    app.saveSettings();
  };
  // "Show this robot": the camera glides to the open chat's robot, wherever it is.
  app.chat.onShowRobot = () => { if (app.chat.threadId) app.world.showRobot(app.chat.threadId); };
  app.chat.onPresent = app.paintSelectedStatus;
  // A harness swap gave the thread another worker: the header names the new one.
  app.world.onWorkerSwap = (id) => app.chat.repaintHeader(id);
}
