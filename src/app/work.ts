// Collecting finished work: what a desk may hand in, the monitor tasks, settling in T3 and keeping desks.
import { buildWorkDetails } from "../office/work-details";
import { formatCoins } from "../office/coin-ledger";
import { gameSound } from "../office/sound";
import { renderChatMarkdown } from "../office/chat-panel";
import { MonitorTasks, type Collectible, type WorkDetails } from "../office/monitor-tasks";
import { api, $ } from "./dom";
import type { App } from "./context";
const ENDED = new Set(['completed', 'cancelled', 'canceled', 'interrupted', 'failed', 'error', 'stopped', 'aborted']);

/** Registers this module's functions on the app (before anything runs, like function hoisting). */
export function defineWork(app: App) {
  // Finished work is collected once: approved by review (the worker brought the report back
  // to its desk), or completed and still unsettled when reviews are off. Settling pays the
  // coins and settles the thread, which clears the desk.
  // A session that ended any way (finished, stopped, failed) can be settled from its desk, and a
  // settled one whose coins are still waiting can be collected there.
  app.collectible = function collectible(id: string, _fresh: boolean): Collectible | null {
    if (app.currentEnvironment) return null;
    const thread = app.world.lastData?.threads.find(t => t.id === id);
    if (!thread || thread.pinned || thread.question) return null;
    const coins = app.coinRewards ? app.wallet.rewards.find(r => r.id === id)?.amount ?? 0 : 0;
    const amount = coins > 0 ? formatCoins(coins) : null;
    if (thread.settled) return amount ? { summary: 'Settled. Its coins are still waiting on this desk.', coins: amount, state: 'settled' }
      : app.world.keptDesks.has(id) ? { summary: 'Settled and collected. The desk stays until you remove it.', coins: null, state: 'kept' } : null;
    const status = (thread.runStatus ?? '').toLowerCase();
    if (!ENDED.has(status)) return null;
    // The turn ended but a job it started keeps going (or died): say so instead of "Finished".
    const job = thread.job;
    if (job?.state === 'running') return { summary: `Its background job is still running: ${job.name}.`, coins: amount, state: 'background', job: `${job.name}${job.progress ? ` · ${job.progress}` : ''}` };
    if (job?.state === 'failed') {
      const when = job.since ? ` at ${new Date(job.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
      return { summary: `Its background job ${job.reason}${when}. Continue the session so the robot can restart it, or settle it as it is.`, coins: amount, state: 'job-failed', job: `${job.name} ${job.reason}${when}. Continue the session to have it restarted.` };
    }
    if (status !== 'completed') return { summary: 'This session stopped before it finished. Continue it, or settle it as it is.', coins: amount, state: 'stopped' };
    if (app.orch.reviewing) {
      const paper = app.orch.approvedPaper(id);
      return paper ? { summary: String(paper.verdict?.summary || ''), coins: amount, state: 'done' } : null;
    }
    return { summary: 'Continue this session, or settle it when you are finished.', coins: amount, state: 'done' };
  };

  /** What a finished session was about and what it reported, for its desk monitor. */
  app.workDetails = async function workDetails(id: string): Promise<WorkDetails> {
    const messages: any[] = await (window as any).lucid.conversation(id).catch(() => []);
    return buildWorkDetails(Array.isArray(messages) ? messages : [], id, renderChatMarkdown);
  };

  app.collectWork = async function collectWork(id: string, from: HTMLElement) {
    if (app.collectingWork.has(id)) return;
    // Already settled: only its coins are left to pick up.
    if (app.world.lastData?.threads.find(t => t.id === id)?.settled) {
      // a kept desk with nothing left to collect: "Remove desk" sends the robot off and frees it
      if (app.world.keptDesks.has(id) && !app.wallet.rewards.some(r => r.id === id)) {
        app.removeKeptDesk(id); gameSound.play('servo'); app.world.deskFor(id)?.robot.react('relax');
        await app.refresh(); return;
      }
      app.collectingWork.add(id);
      try { if (!app.coinRewards?.collect(id, from, false)) { gameSound.play('collect'); app.world.deskFor(id)?.robot.react('cheer'); } app.keepDesk(id); }
      finally { app.collectingWork.delete(id); }
      await app.refresh(); return;
    }
    // Reviews approve finished work; a stopped session is settled as it is, without a review.
    const finished = app.world.lastData?.threads.find(t => t.id === id)?.runStatus === 'completed';
    const paper = app.orch.reviewing && finished ? app.orch.approvedPaper(id) : null;
    if (app.orch.reviewing && finished && !paper) throw Error('This work is not approved yet');
    app.collectingWork.add(id);
    try {
      // Settle first: if T3 refuses, the coins stay on the desk for the retry.
      if (paper) await (api as any).reportsManual(paper.id, 'collect');
      else await app.settleInT3(id);
      app.keepDesk(id);
      if (!app.coinRewards?.collect(id, from, false)) { gameSound.play('collect'); app.world.deskFor(id)?.robot.react('cheer'); }
      if (paper) app.orch.papers = await (api as any).reportsList();
    } finally { app.collectingWork.delete(id); }
    await app.refresh();
  };

  /** Collected work keeps its desk (with its robot) until you remove it from the monitor. */
  app.keepDesk = function keepDesk(id: string) {
    if (app.world.keptDesks.has(id) || !app.world.deskFor(id)) return;
    app.world.keptDesks.add(id); app.settings.keptDesks = [...app.world.keptDesks]; app.saveSettings();
  };

  app.removeKeptDesk = function removeKeptDesk(id: string) {
    if (!app.world.keptDesks.delete(id)) return;
    app.settings.keptDesks = [...app.world.keptDesks]; app.saveSettings();
  };

  /** Settle in T3 and make sure it took: T3 is asked again once if its record did not change. */
  app.settleInT3 = async function settleInT3(id: string) {
    const t3 = (window as any).lucidT3;
    const done = async () => { const fresh = await api.world().catch(() => null); return !!fresh?.threads.find(t => t.id === id)?.settled; };
    const ask = async () => { const r = await t3.settle({ threadId: id }); if (r && r.ok === false) throw Error(r.error || 'T3 could not settle this session.'); };
    await ask();
    for (let i = 0; i < 6; i++) { if (await done()) return; await new Promise(r => setTimeout(r, 250)); }
    await ask();
    for (let i = 0; i < 8; i++) { if (await done()) return; await new Promise(r => setTimeout(r, 250)); }
    throw Error('T3 did not record the settlement. Check that T3 Code is running, then try again.');
  };
}

export function createMonitorTasks(app: App) {
  app.monitorTasks = new MonitorTasks(app.world, {
    answer: app.answerDeps,
    read: id => app.world.onFollowChat(id),
    ready: (id, fresh) => app.collectible(id, fresh),
    collect: (id, from) => app.collectWork(id, from),
    details: id => app.workDetails(id),
  });
  /** Run states that mean the session ended (collectible above reads this at call time). */
}

export function mountWork(app: App) {
  app.collectingWork = new Set<string>();
  app.coinReady = id => {
    const t = app.world.lastData?.threads.find(t => t.id === id);
    return !t || t.settled || !!app.collectible(id, true);
  };
  app.coinCollected = async id => {
    const t = app.world.lastData?.threads.find(t => t.id === id);
    if (!t || t.settled || !ENDED.has((t.runStatus ?? '').toLowerCase())) return;
    const paper = app.orch.reviewing && t.runStatus === 'completed' ? app.orch.approvedPaper(id) : null;
    if (paper) await (api as any).reportsManual(paper.id, 'collect');
    else if (!app.orch.reviewing || t.runStatus !== 'completed') await app.settleInT3(id);
    app.keepDesk(id);
  };
  (window as any).__monitorTasks = app.monitorTasks;
  (window as any).__answer = app.answer;
}
