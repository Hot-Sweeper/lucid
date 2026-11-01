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
type Actions = {
  answer: AnswerDeps;
  read(id: string): void;
  close(id: string): void;
  reward(id: string): string | null;
  collect(id: string, from: HTMLElement): void;
};

/** Only actual pending questions and completed runs interrupt a desktop. The
 * existing desktop remains mounted, so resolving a question restores its work. */
export class MonitorTasks {
  private views = new Map<Desk, View>();
  private previous = new Map<string, string | null>();
  private holds = new Set<string>();
  private dismissed = new Map<string, string>();
  private environment: string | undefined;
  private interval: number;
  private disposed = false;
  constructor(private world: World, private actions: Actions) {
    this.interval = window.setInterval(() => { if (!document.hidden) this.sync(); }, 1500);
    window.addEventListener('pagehide', this.destroy);
  }

  prepare(data: WorldData) {
    if (data.environmentId !== this.environment) {
      this.previous.clear(); this.holds.clear(); this.dismissed.clear();
      this.environment = data.environmentId;
    }
    const alive = new Set(data.threads.map(t => t.id));
    for (const id of this.holds) if (!alive.has(id)) this.holds.delete(id);
    for (const id of this.previous.keys()) if (!alive.has(id)) { this.previous.delete(id); this.dismissed.delete(id); }
    for (const t of data.threads) {
      if (t.runStatus === 'completed' && !t.settled && this.previous.has(t.id) && this.previous.get(t.id) !== 'completed') this.holds.add(t.id);
      if (t.runStatus !== 'completed' || t.settled) { this.holds.delete(t.id); this.dismissed.delete(t.id); }
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
      if (!desks.has(desk) || !desk.el.isConnected || desk.threadId !== view.id || !t || t.settled || (!t.question && t.runStatus !== 'completed')) this.remove(view);
    }
    for (const desk of desks) {
      const t = desk.threadId ? threads.get(desk.threadId) : null;
      if (!t || t.settled) continue;
      const mode = t.question ? 'question' : t.runStatus === 'completed' ? 'done' : null;
      const stamp = `${t.id}:${t.updatedAt}:${t.runStatus}`;
      if (!mode || mode === 'done' && this.dismissed.has(t.id)) continue;
      let view = this.views.get(desk);
      if (view && view.mode !== mode) { this.remove(view); view = undefined; }
      if (!view) view = this.mount(desk, t.id, mode);
      view.stamp = stamp;
      const heading = mode === 'question' ? 'Your answer is needed' : 'Work complete';
      view.el.querySelector('h2')!.textContent = heading;
      view.el.querySelector('.monitor-task-name')!.textContent = desk.profile?.name || t.title;
      if (view.answer) { void view.answer.refresh(); }
      else {
        const collect = view.el.querySelector<HTMLButtonElement>('[data-task-collect]')!;
        const reward = data?.environmentId ? null : this.actions.reward(t.id);
        collect.hidden = !reward;
        collect.textContent = reward ? `Collect ${reward} coins` : 'Collect coins';
      }
    }
  }

  private mount(desk: Desk, id: string, mode: View['mode']): View {
    const el = document.createElement('section');
    el.className = `win focused monitor-task-panel monitor-task-${mode}`;
    el.setAttribute('aria-label', mode === 'question' ? 'Answer this robot' : 'Completed work');
    el.innerHTML = `<header><div><h2></h2><p class="monitor-task-name"></p></div><button type="button" class="ghost" data-task-read>Read chat</button></header><div class="win-body monitor-task-body"></div>`;
    const body = el.querySelector<HTMLElement>('.monitor-task-body')!;
    const view: View = { desk, id, mode, el, body, answer: null, stamp: '' };
    for (const type of ['click', 'dblclick', 'keydown', 'wheel']) el.addEventListener(type, e => e.stopPropagation());
    el.addEventListener('pointerdown', e => { if (e.button === 0) e.stopPropagation(); });
    el.querySelector('[data-task-read]')!.addEventListener('click', () => { gameSound.play('open'); this.actions.read(id); });
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
      body.innerHTML = `<div class="monitor-task-result"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="#8bcca8"/><path d="m18 33 9 9 20-22" fill="none" stroke="#20354a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg><p>The run finished. You can read the result or collect any earned coins.</p><div class="monitor-task-actions"><button type="button" class="cp-send" data-task-collect hidden></button><button type="button" class="ghost" data-task-close>Close screen</button></div></div>`;
      body.querySelector<HTMLElement>('[data-task-collect]')!.addEventListener('click', e => {
        this.actions.collect(id, e.currentTarget as HTMLElement); this.sync();
      });
      body.querySelector('[data-task-close]')!.addEventListener('click', () => {
        this.dismissed.set(id, view.stamp); this.holds.delete(id);
        this.world.setCompletionHolds(this.holds); this.remove(view);
        this.actions.close(id);
        if (this.world.lastData) this.world.update(this.world.lastData);
        gameSound.play('switch');
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
    this.holds.clear(); this.world.setCompletionHolds([]);
  };
}
