import { fillReportGallery, openReportImage } from "./report-gallery";
import { thumbSrc } from "./chat-media";
import gsap from 'gsap';
import { AnswerCard, type AnswerDeps, type PendingRequest } from './answer';
import type { Desk } from './desk';
import type { World, WorldData } from './world';
import { gameSound } from './sound';
import './monitor-tasks.css';
import { statusBadge, statusIcon, type Status } from '../ui/status';

// Completion states on the monitor, in the shared status vocabulary. Stopped work has no status.
const MONITOR_STATUS: Record<string, { status: Status; detail?: string; suffix?: string } | undefined> = {
  done: { status: 'done' },
  settled: { status: 'settled', suffix: '· coins waiting' },
  kept: { status: 'settled' },
  background: { status: 'working', detail: 'Running in the background' },
  'job-failed': { status: 'needs', detail: 'Background job failed' },
};

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

type View = { desk: Desk; id: string; mode: 'question' | 'done'; el: HTMLElement; body: HTMLElement; answer: AnswerCard | null; stamp: string; detailsFor: string; galleryCleanup?: () => void };
/** Work that can be settled or collected now. `done`: finished (and approved, with reviews);
 * `stopped`: ended before finishing; `settled`: already settled, its coins still waiting;
 * `kept`: settled and collected, its desk kept until you remove it. */
export type Collectible = { summary: string; coins: string | null; state: 'done' | 'stopped' | 'settled' | 'kept' | 'background' | 'job-failed'; job?: string };
/** What a session was asked, what it reported, and its newest screenshots. */
export type WorkDetails = { task: string; report: string; reportHtml?: string; images: { url: string; name: string }[]; endedAt: string | null; messages: number };
type Actions = {
  answer: AnswerDeps;
  read(id: string): void;
  /** `fresh`: the run finished while the app was open (reviews off only collect fresh work). */
  ready(id: string, fresh: boolean): Collectible | null;
  /** Coins, then settlement, which clears the desk. Rejects with a readable reason. */
  collect(id: string, from: HTMLElement): Promise<void>;
  details(id: string): Promise<WorkDetails>;
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
      if (!data.environmentId && this.actions.ready(t.id, this.fresh.has(t.id))) this.holds.add(t.id);
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
      const done = !!t && !t.question && this.holds.has(t.id);
      if (!desks.has(desk) || !desk.el.isConnected || desk.threadId !== view.id || !t || (!t.question && !done)) this.remove(view);
    }
    for (const desk of desks) {
      const t = desk.threadId ? threads.get(desk.threadId) : null;
      if (!t || t.settled && !this.holds.has(t.id)) continue;
      const ready = !t.question && this.holds.has(t.id) ? this.actions.ready(t.id, this.fresh.has(t.id)) : null;
      const mode = t.question ? 'question' : ready ? 'done' : null;
      const stamp = `${t.id}:${t.updatedAt}:${t.runStatus}`;
      if (!mode) continue;
      let view = this.views.get(desk);
      if (view && view.mode !== mode) { this.remove(view); view = undefined; }
      if (!view) view = this.mount(desk, t.id, mode);
      view.stamp = stamp;
      // set text only when it changed: rewriting it every sync forced layout across all desks
      setText(view.el.querySelector('h2')!, mode === 'question' ? 'Your answer is needed' : t.title);
      setText(view.el.querySelector('.monitor-task-name')!, desk.profile?.name || t.title);
      const far = desk.screen.querySelector<HTMLElement>(':scope > .mt-far');
      if (far) {
        const farState = mode === 'question' ? 'question' : ready?.state ?? 'done';
        setText(far.querySelector('b')!, mode === 'question' ? 'Your answer' : ready?.state === 'kept' ? 'Settled' : ready?.state === 'settled' ? 'Collect' : ready?.state === 'stopped' ? 'Stopped' : ready?.state === 'background' ? 'In background' : ready?.state === 'job-failed' ? 'Job failed' : 'Done');
        setText(far.querySelector('span')!, mode === 'question' ? 'Needs you' : ready?.state === 'kept' ? 'Remove desk' : ready?.coins ? `${ready.coins} coins` : ready?.state === 'background' ? 'Still running' : 'Settle');
        if (far.dataset.state !== farState) far.dataset.state = farState;
      }
      if (view.answer) { void view.answer.refresh(); }
      else if (ready) {
        // the shared status vocabulary, as in the sidebar and the chat header
        const chip = view.el.querySelector<HTMLElement>('.mt-chip')!;
        if (chip.dataset.state !== ready.state) {
          const st = MONITOR_STATUS[ready.state];
          chip.innerHTML = st ? statusBadge(st.status, { detail: st.detail, suffix: st.suffix, size: 18 }) : 'Stopped';
          const mark = view.el.querySelector<HTMLElement>('.mt-head-mark')!;
          mark.hidden = st?.status !== 'done';
          mark.innerHTML = mark.hidden ? '' : statusIcon('done', 28);
        }
        // the job's live line (its latest progress, or why it stopped) updates with every refresh
        const jobLine = view.el.querySelector<HTMLElement>('.mt-job')!;
        setText(jobLine, ready.job || ''); if (jobLine.hidden !== !ready.job) jobLine.hidden = !ready.job;
        if (chip.dataset.state !== ready.state) chip.dataset.state = ready.state;
        const collect = view.el.querySelector<HTMLButtonElement>('[data-task-collect]')!;
        collect.classList.toggle('mt-remove', ready.state === 'kept');
        if (!this.collecting.has(t.id)) setText(collect, ready.state === 'kept' ? 'Remove desk' : ready.state === 'settled' ? `Collect ${ready.coins} coins` : ready.coins ? `Settle & collect ${ready.coins} coins` : 'Settle session');
        // the report, the task and screenshots: loaded once per change of the thread
        if (view.detailsFor !== stamp) { view.detailsFor = stamp; void this.fill(view, t.id, ready, stamp); }
      }
    }
  }

  private mount(desk: Desk, id: string, mode: View['mode']): View {
    const el = document.createElement('section');
    el.className = `win focused monitor-task-panel monitor-task-${mode}`;
    el.setAttribute('aria-label', mode === 'question' ? 'Answer this robot' : 'Completed work');
    el.innerHTML = mode === 'question'
      ? `<header><div><h2></h2><p class="monitor-task-name"></p></div><button type="button" class="ghost" data-task-read>Read chat</button></header><div class="win-body monitor-task-body"></div>`
      : `<header><div><span class="mt-head-mark" data-status="done" hidden></span><h2></h2><p class="monitor-task-name"></p></div><button type="button" class="ghost" data-task-read>Continue session</button></header><div class="win-body monitor-task-body"></div>`;
    const body = el.querySelector<HTMLElement>('.monitor-task-body')!;
    const view: View = { desk, id, mode, el, body, answer: null, stamp: '', detailsFor: '' };
    for (const type of ['click', 'dblclick', 'keydown']) el.addEventListener(type, e => e.stopPropagation());
    // The wheel stays with the panel only while it can scroll that way (a long answer);
    // otherwise it reaches the office and zooms, as it does over every other monitor.
    el.addEventListener('wheel', e => { if (canScroll(e.target, el, e.deltaY)) e.stopPropagation(); }, { passive: true });
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
      body.innerHTML = `<div class="monitor-task-result mt-done">
        <div class="mt-main">
          <p class="mt-state"><span class="mt-chip"></span><span class="mt-when"></span></p>
          <p class="mt-job" role="status" hidden></p>
          <div class="mt-result-layout"><div class="mt-shots" hidden></div>
          <section class="mt-written"><h3 class="mt-label">What changed</h3>
          <div class="mt-report monitor-task-summary">Loading the session...</div></section></div>
          <details class="mt-task-disclosure" hidden><summary>Original task</summary><p class="mt-task"></p></details>
        </div>
      </div>`;
      const footer = document.createElement('footer'); footer.className = 'mt-actions';
      footer.innerHTML = `<p class="monitor-task-error" role="status"></p><button type="button" class="primary cp-send monitor-task-collect" data-task-collect>Settle session</button>`;
      el.append(footer);
      const button = el.querySelector<HTMLButtonElement>('[data-task-collect]')!, error = el.querySelector<HTMLElement>('.monitor-task-error')!;
      button.addEventListener('click', async () => {
        if (this.collecting.has(id)) return;
        this.collecting.add(id); button.disabled = true; error.textContent = '';
        try { await this.actions.collect(id, button); }
        catch (e: any) {
          error.textContent = `${button.classList.contains('mt-remove') ? 'Could not remove the desk' : 'Could not settle'}: ${e?.message || e}`;
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
    // Zoomed out the panel is too small to read; a big sign on the monitor says what is going on.
    const far = document.createElement('div'); far.className = 'mt-far'; far.setAttribute('aria-hidden', 'true');
    far.innerHTML = '<b></b><span></span>';
    desk.screen.append(far);
    desk.wm.setOverlayCovered(true);
    desk.el.classList.add('has-monitor-task');
    this.views.set(desk, view);
    if (mode === 'question' && !document.hidden) gameSound.at('ping', desk.el, .4);
    if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .18 });
    return view;
  }

  private async fill(view: View, id: string, ready: Collectible, stamp: string) {
    const report = view.el.querySelector<HTMLElement>('.mt-report')!, task = view.el.querySelector<HTMLElement>('.mt-task')!;
    const when = view.el.querySelector<HTMLElement>('.mt-when')!, shots = view.el.querySelector<HTMLElement>('.mt-shots')!;
    let d: WorkDetails | null = null;
    try { d = await this.actions.details(id); } catch { /* keep the summary below */ }
    if (view.detailsFor !== stamp || !view.el.isConnected) return;
    // the robot's report as the chat shows it: tables, lists, code and emphasis, sanitized
    if (d?.reportHtml) {
      report.innerHTML = d.reportHtml; report.classList.add('md');
      // pictures in the report are small here; opening one still shows the original
      for (const img of report.querySelectorAll<HTMLImageElement>('.cp-inline-media img')) img.src = thumbSrc(img.getAttribute('src') || '', 960);
    }
    else { report.textContent = d?.report || ready.summary; report.classList.remove('md'); }
    view.el.querySelector<HTMLElement>('.mt-task-disclosure')!.hidden = !d?.task; task.textContent = d?.task || '';
    when.textContent = d?.endedAt ? ` · ${ago(d.endedAt)}${d.messages ? ` · ${d.messages} messages` : ''}` : '';
    view.galleryCleanup?.();
    const clearGallery = fillReportGallery(shots, d?.images ?? []);
    let closeInline: (() => void) | undefined;
    for (const button of report.querySelectorAll<HTMLElement>('td .cp-inline-media, th .cp-inline-media')) {
      button.onclick = () => {
        const url = button.dataset.mediaSrc;
        if (!url) return;
        closeInline?.(); closeInline = openReportImage(url, button.dataset.mediaName || 'Screenshot', button);
      };
      const img = button.querySelector('img');
      if (img) img.onerror = () => { button.textContent = `Image unavailable: ${img.alt || 'Screenshot'}`; };
    }
    view.galleryCleanup = () => { clearGallery(); closeInline?.(); };
  }

  private remove(view: View) {
    view.galleryCleanup?.(); view.answer?.destroy(); gsap.killTweensOf(view.el); view.el.remove();
    view.desk.screen.querySelector(':scope > .mt-far')?.remove();
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

/** Whether an element between target and root can still scroll vertically in the wheel's direction. */
function canScroll(target: EventTarget | null, root: HTMLElement, deltaY: number) {
  for (let el = target instanceof Element ? target : null; el && root.contains(el); el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    if (deltaY < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
  }
  return false;
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function setText(el: Element, text: string) { if (el.textContent !== text) el.textContent = text; }
