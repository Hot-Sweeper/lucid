import { gameSound } from './sound';
import { getLocale, onLocaleChange } from '../localization';
import type { WM } from '../os/wm';
import './desk-plan.css';

export type PlanStep = { text: string; status: string };
const label = (en: string, de: string) => getLocale() === 'de' ? de : en;
const state = (step: PlanStep) => /^(completed|done)$/.test(step.status) ? 'done' : /^(in_progress|inProgress|running)$/.test(step.status) ? 'doing' : 'next';
const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="19" rx="3"/><path d="m7 9 1.5 1.5L11 8m2 2h4M7 15h3m3 0h4"/></svg>';
let nextId = 0;

/** Human inspection stays on the monitor; the robot's desktop remains intact underneath. */
export class DeskPlanWidget {
  readonly button: HTMLButtonElement;
  private panel: HTMLElement | null = null;
  private steps: PlanStep[] = [];
  private signature = '';
  private disposed = false;
  private id = `desk-plan-screen-${++nextId}`;
  private stopLocale: () => void;
  private previous: HTMLElement | null = null;
  constructor(private list: HTMLElement, private wm: WM) {
    const li = document.createElement('li');
    this.button = document.createElement('button');
    this.button.type = 'button'; this.button.className = 'desk-plan';
    this.button.setAttribute('aria-controls', this.id); this.button.setAttribute('aria-expanded', 'false');
    this.button.innerHTML = `${icon}<span class="desk-plan-label"></span><span class="desk-plan-count"></span>`;
    this.button.addEventListener('pointerdown', e => e.stopPropagation());
    this.button.addEventListener('click', e => { e.stopPropagation(); this.toggle(); });
    li.append(this.button); list.replaceChildren(li); li.hidden = true;
    this.stopLocale = onLocaleChange(() => this.render());
    this.render();
  }
  update(steps: PlanStep[]) {
    if (this.disposed) return;
    const signature = JSON.stringify(steps);
    if (signature === this.signature) return;
    this.signature = signature; this.steps = steps.map(s => ({ ...s }));
    this.button.parentElement!.hidden = !steps.length;
    this.render();
  }
  toggle() {
    if (this.panel) { this.close(); return; }
    if (!this.steps.length) return;
    this.previous = document.activeElement as HTMLElement | null;
    const panel = document.createElement('section');
    panel.id = this.id; panel.className = 'win focused desk-plan-panel';
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', label('Agent plan', 'Agentenplan'));
    panel.innerHTML = '<header><div><h2></h2><p class="desk-plan-summary" role="status"></p></div><button type="button" class="ghost desk-plan-close"></button></header><div class="win-body desk-plan-body" tabindex="0" role="group"><ol></ol><p class="desk-plan-empty" hidden></p></div>';
    // This is part of the screen, so it uses the same detail tiers as every other app.
    this.panel = panel; this.wm.root.append(panel);
    this.wm.setOverlayCovered(true, 'plan');
    this.button.setAttribute('aria-expanded', 'true');
    for (const type of ['click', 'dblclick', 'pointerdown']) panel.addEventListener(type, e => e.stopPropagation());
    panel.addEventListener('wheel', e => {
      const body = panel.querySelector<HTMLElement>('.desk-plan-body')!;
      if (e.deltaY < 0 ? body.scrollTop > 0 : body.scrollTop + body.clientHeight < body.scrollHeight - 1) e.stopPropagation();
    }, { passive: true });
    panel.querySelector('button')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', this.onKey, true);
    this.render(); gameSound.play('open');
    panel.querySelector<HTMLButtonElement>('button')!.focus({ preventScroll: true });
  }
  private onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.panel || !(this.panel.contains(document.activeElement) || this.button === document.activeElement)) return;
    e.preventDefault(); e.stopImmediatePropagation(); this.close();
  };
  close(restoreFocus = true) {
    if (!this.panel) return;
    const focused = this.panel.contains(document.activeElement);
    this.panel.remove(); this.panel = null;
    this.wm.setOverlayCovered(false, 'plan');
    this.button.setAttribute('aria-expanded', 'false');
    this.render();
    window.removeEventListener('keydown', this.onKey, true);
    if (restoreFocus && focused) {
      if (!this.button.parentElement!.hidden) this.button.focus({ preventScroll: true });
      else if (this.previous?.isConnected) this.previous.focus({ preventScroll: true });
    }
    if (restoreFocus) gameSound.play('switch');
  }
  private render() {
    const done = this.steps.filter(s => state(s) === 'done').length;
    const summary = label(`${done} of ${this.steps.length} steps complete`, `${done} von ${this.steps.length} Schritten erledigt`);
    this.button.querySelector('.desk-plan-label')!.textContent = label('Plan', 'Plan');
    this.button.querySelector('.desk-plan-count')!.textContent = `${done}/${this.steps.length}`;
    this.button.setAttribute('aria-label', `${this.panel ? label('Close plan', 'Plan schließen') : label('Show plan on screen', 'Plan auf dem Monitor anzeigen')}, ${summary}`);
    this.button.title = label('Show plan on this monitor', 'Plan auf diesem Monitor anzeigen');
    if (!this.panel) return;
    this.panel.querySelector('h2')!.textContent = label('The plan', 'Der Plan');
    this.panel.querySelector('.desk-plan-summary')!.textContent = summary;
    const close = this.panel.querySelector<HTMLButtonElement>('.desk-plan-close')!;
    close.textContent = label('Back to desktop', 'Zurück zum Desktop');
    const body = this.panel.querySelector<HTMLElement>('.desk-plan-body')!, list = body.querySelector('ol')!;
    body.setAttribute('aria-label', label('Plan steps', 'Planschritte'));
    const scroll = body.scrollTop;
    list.replaceChildren(...this.steps.map((step, index) => {
      const li = document.createElement('li'); li.dataset.state = state(step);
      const number = document.createElement('span'); number.className = 'desk-plan-step-number'; number.textContent = state(step) === 'done' ? '✓' : String(index + 1); number.setAttribute('aria-hidden', 'true');
      const text = document.createElement('div'); const status = document.createElement('span'); status.className = 'desk-plan-step-state';
      status.textContent = state(step) === 'done' ? label('Done', 'Erledigt') : state(step) === 'doing' ? label('In progress', 'In Arbeit') : label('Next', 'Als Nächstes');
      const title = document.createElement('p'); title.textContent = step.text;
      text.append(status, title); li.append(number, text); return li;
    }));
    const empty = body.querySelector<HTMLElement>('.desk-plan-empty')!;
    empty.hidden = !!this.steps.length; empty.textContent = label('No steps in the current plan yet.', 'Noch keine Schritte im aktuellen Plan.');
    body.scrollTop = scroll;
  }
  destroy() { this.disposed = true; this.close(false); this.stopLocale(); this.list.replaceChildren(); }
}
