import { foldButton, foldSection } from './sidebar';
import type { LimitView } from '../stats/limit-pace';

const VIEWS: { view: LimitView; label: string; title: string }[] = [
  { view: 'used', label: 'Used', title: 'Show how much of each limit is used' },
  { view: 'left', label: 'Left', title: 'Show how much of each limit is left' },
];

/** Give the existing live limit rows their own independently saved disclosure, with a small
 * Used / Left choice in its header (people are used to reading limits either way). */
export function mountLimitsSection(panel: HTMLElement, usageBody: HTMLElement, open = true,
  view: LimitView = 'used', onView: (view: LimitView) => void = () => {}) {
  const limits = usageBody.querySelector<HTMLElement>('.st-limits');
  const note = usageBody.querySelector<HTMLElement>('.st-limit-note');
  if (!limits) return;
  const section = document.createElement('section');
  section.className = 'usage sidebar-limits';
  section.id = 'limits';
  section.innerHTML = `<div class="sec-head"><h3>Limits</h3><div class="seg lim-view" role="radiogroup" aria-label="Show limits as">${
    VIEWS.map(v => `<button type="button" role="radio" data-view="${v.view}" title="${v.title}">${v.label}</button>`).join('')
  }</div>${foldButton('limits', 'usage limits', open)}</div><div class="fold-body" id="fold-limits"></div>`;
  const body = section.querySelector<HTMLElement>('#fold-limits')!;
  body.append(limits);
  if (note) body.append(note);
  const buttons = [...section.querySelectorAll<HTMLButtonElement>('.lim-view button')];
  const paint = () => buttons.forEach(b => {
    const on = b.dataset.view === view;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const choose = (next: LimitView, focus = false) => {
    if (focus) buttons.find(b => b.dataset.view === next)?.focus();
    if (next === view) return;
    view = next; paint(); onView(next);
  };
  for (const b of buttons) b.addEventListener('click', () => choose(b.dataset.view as LimitView));
  // A radio group: arrow keys move the choice, Tab leaves the group.
  section.querySelector('.lim-view')!.addEventListener('keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
    e.preventDefault();
    choose(view === 'used' ? 'left' : 'used', true);
  });
  paint();
  panel.append(section);
  foldSection('limits', open, false);
}
