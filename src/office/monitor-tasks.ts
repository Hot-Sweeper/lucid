import gsap from 'gsap';
import { AnswerCard, type AnswerDeps, type PendingRequest } from './answer';
import type { Desk } from './desk';
import type { World, WorldData } from './world';
import { gameSound } from './sound';
import './monitor-tasks.css';

/** Share in-flight request reads between chat and monitors without another poll. */
export function sharedPendingRequests(read: AnswerDeps['pending']): AnswerDeps['pending'] {
  const flights = new Map<string, Promise<PendingRequest[]>>();
  return id => {
    const current = flights.get(id);
    if (current) return current;
    const pending = Promise.resolve().then(() => read(id)).finally(() => { if (flights.get(id) === pending) flights.delete(id); });
    flights.set(id, pending);
    return pending;
  };
}

type View = { desk: Desk; id: string; mode: 'question' | 'done'; el: HTMLElement; body: HTMLElement; answer: AnswerCard | null; stamp: string };
/** Work that can be collected now: approved by review, or finished when reviews are off. */
export type Collectible = { summary: string; coins: string | null };
type Actions = {
  answer: AnswerDeps;
  read(id: string): void;
  /** `fresh`: the run finished while Lucid was open (reviews off only collect fresh work). */
  ready(id: string, fresh: boolean): Collectible | null;
  /** Coins, then settlement, which clears the desk. Rejects with a readable reason. */
  collect(id: string, from: HTMLElement): Promise<void>;
};

/** Only actual pending questions and collectible work interrupt a desktop. The
 * existing desktop remains mounted, so resolving a question restores its work. A
 * finished job shows one thing: its report and a Collect button. */
export class MonitorTasks {
  private views = new Map<Desk, View>();
  private previous = new Map<string, string | null>();
  private holds = new Set<string>();
  private fresh = new Set<string>();
  private collecting = new Set<string>();
  private environment: string | undefined;
  private interval: number;
  private disposed = false;
  constructor(private world: World, private actions: Actions) {
    this.interval = window.setInterval(() => { if (!document.hidden) this.sync(); }, 1500);
    window.addEventListener('pagehide', this.destroy);
  }

  prepare(data: WorldData) {
    if (data.environmentId !== this.environment) {
      this.previous.clear(); this.holds.clear(); this.fresh.clear();
      this.environment = data.environmentId;
    }
    const alive = new Set(data.threads.map(t => t.id));
    for (const id of this.previous.keys()) if (!alive.has(id)) { this.previous.delete(id); this.fresh.delete(id); }
    this.holds.clear();
    for (const t of data.threads) {
      if (t.runStatus === 'completed' && !t.settled && this.previous.has(t.id) && this.previous.get(t.id) !== 'completed') this.fresh.add(t.id);
      if (t.runStatus !== 'completed' || t.settled) this.fresh.delete(t.id);
      else if (!data.environmentId && this.actions.ready(t.id, this.fresh.has(t.id))) this.holds.add(t.id);
      this.previous.set(t.id, t.runStatus);
    }
    this.world.setCompletionHolds(this.holds);
  }

  sync() {
    if (this.disposed) return;
    const data = this.world.lastData;
    const threads = new Map(data?.threads.map(t => [t.id, t]));
    const desks = new Set(this.world.desks.values());
    for (const [desk, view] of this.views) {
      const t = desk.threadId ? threads.get(desk.threadId) : null;
      const done = !!t && !t.question && t.runStatus === 'completed' && this.holds.has(t.id);
      if (!desks.has(desk) || !desk.el.isConnected || desk.threadId !== view.id || !t || t.settled || (!t.question && !done)) this.remove(view);
    }
    for (const desk of desks) {
      const t = desk.threadId ? threads.get(desk.threadId) : null;
      if (!t || t.settled) continue;
      const ready = !t.question && t.runStatus === 'completed' && this.holds.has(t.id) ? this.actions.ready(t.id, this.fresh.has(t.id)) : null;
      const mode = t.question ? 'question' : ready ? 'done' : null;
      const stamp = `${t.id}:${t.updatedAt}:${t.runStatus}`;
      if (!mode) continue;
      let view = this.views.get(desk);
      if (view && view.mode !== mode) { this.remove(view); view = undefined; }
      if (!view) view = this.mount(desk, t.id, mode);
      view.stamp = stamp;
      view.el.querySelector('h2')!.textContent = mode === 'question' ? 'Your answer is needed' : t.title;
      view.el.querySelector('.monitor-task-name')!.textContent = desk.profile?.name || t.title;
      if (view.answer) { void view.answer.refresh(); }
      else if (ready) {
        view.body.querySelector('.monitor-task-summary')!.textContent = ready.summary;
        const collect = view.el.querySelector<HTMLButtonElement>('[data-task-collect]')!;
        if (!this.collecting.has(t.id)) collect.textContent = ready.coins ? `Collect ${ready.coins} coins` : 'Collect';
      }
    }
  }

  private mount(desk: Desk, id: string, mode: View['mode']): View {
    const el = document.createElement('section');
    el.className = `win focused monitor-task-panel monitor-task-${mode}`;
    el.setAttribute('aria-label', mode === 'question' ? 'Answer this robot' : 'Completed work');
    el.innerHTML = mode === 'question'
      ? `<header><div><h2></h2><p class="monitor-task-name"></p></div><button type="button" class="ghost" data-task-read>Read chat</button></header><div class="win-body monitor-task-body"></div>`
      : `<header><div><h2></h2><p class="monitor-task-name"></p></div></header><div class="win-body monitor-task-body"></div>`;
    const body = el.querySelector<HTMLElement>('.monitor-task-body')!;
    const view: View = { desk, id, mode, el, body, answer: null, stamp: '' };
    for (const type of ['click', 'dblclick', 'keydown', 'wheel']) el.addEventListener(type, e => e.stopPropagation());
    el.addEventListener('pointerdown', e => { if (e.button === 0) e.stopPropagation(); });
    el.querySelector('[data-task-read]')?.addEventListener('click', () => { gameSound.play('open'); this.actions.read(id); });
    if (mode === 'question') {
      const host = { el: body, get isOpen() { return el.isConnected; }, get threadId() { return id; } };
      const loading = document.createElement('p'); loading.className = 'monitor-task-loading'; loading.setAttribute('role', 'status');
      loading.textContent = 'Loading the question...'; body.append(loading);
      view.answer = new AnswerCard(host, { ...this.actions.answer, pending: async threadId => {
        try {
          const requests = await this.actions.answer.pending(threadId);
          loading.hidden = requests.length > 0;
          if (!requests.length) loading.textContent = 'This question is no longer waiting for an answer.';
          return requests;
        } catch (error) {
          loading.hidden = false; loading.textContent = 'Could not load the question. Reconnecting...';
          throw error;
        }
      }, poll: false, autoFocus: false });
      body.append(view.answer.el);
    } else {
      body.innerHTML = `<div class="monitor-task-result"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="#8bcca8"/><path d="m18 33 9 9 20-22" fill="none" stroke="#20354a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg><p class="monitor-task-summary"></p><button type="button" class="cp-send monitor-task-collect" data-task-collect>Collect</button><p class="monitor-task-error" role="status"></p></div>`;
      const button = body.querySelector<HTMLButtonElement>('[data-task-collect]')!, error = body.querySelector<HTMLElement>('.monitor-task-error')!;
      button.addEventListener('click', async () => {
        if (this.collecting.has(id)) return;
        this.collecting.add(id); button.disabled = true; error.textContent = '';
        try { await this.actions.collect(id, button); }
        catch (e: any) {
          error.textContent = `Could not collect: ${e?.message || e}. Try again.`;
          button.disabled = false;
        } finally {
          this.collecting.delete(id);
          // Settlement keeps this panel and turns its action into Remove desk.
          // Release the busy state on success as well as failure so it can be used again.
          button.disabled = false;
          this.sync();
        }
      });
    }
    desk.wm.root.append(el);
    desk.wm.setOverlayCovered(true);
    desk.el.classList.add('has-monitor-task');
    this.views.set(desk, view);
    if (mode === 'question' && !document.hidden) gameSound.at('ping', desk.el, .4);
    if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .18 });
    return view;
  }

  private remove(view: View) {
    view.answer?.destroy(); gsap.killTweensOf(view.el); view.el.remove();
    view.desk.wm.setOverlayCovered(false);
    view.desk.el.classList.remove('has-monitor-task'); this.views.delete(view.desk);
  }

  destroy = () => {
    this.disposed = true; window.clearInterval(this.interval);
    window.removeEventListener('pagehide', this.destroy);
    for (const view of this.views.values()) this.remove(view);
    this.holds.clear(); this.fresh.clear(); this.world.setCompletionHolds([]);
  };
}
