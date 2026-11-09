import { foldButton, foldSection } from './sidebar';

/** Give the existing live limit rows their own independently saved disclosure. */
export function mountLimitsSection(panel: HTMLElement, usageBody: HTMLElement, open = true) {
  const limits = usageBody.querySelector<HTMLElement>('.st-limits');
  const note = usageBody.querySelector<HTMLElement>('.st-limit-note');
  if (!limits) return;
  const section = document.createElement('section');
  section.className = 'usage sidebar-limits';
  section.id = 'limits';
  section.innerHTML = `<div class="sec-head"><h3>Limits</h3>${foldButton('limits', 'usage limits', open)}</div><div class="fold-body" id="fold-limits"></div>`;
  const body = section.querySelector<HTMLElement>('#fold-limits')!;
  body.append(limits);
  if (note) body.append(note);
  panel.append(section);
  foldSection('limits', open, false);
}
