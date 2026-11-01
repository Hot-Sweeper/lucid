import type { WorldData } from './world';
import './managers.css';

type Actions = {
  update(input: { threadId: string; pinned: boolean; projectId: string; roles: Record<string, string> }): Promise<unknown>;
  suggest(input: { threadId: string; projectId: string }): Promise<string[]>;
  refresh(): Promise<void>;
  robotName?(id: string): string | undefined;
};

export function openManagers(data: WorldData, threadId: string | null, projectId: string | null, actions: Actions) {
  const previous = document.activeElement as HTMLElement | null;
  const wrap = document.createElement('div'); wrap.className = 'dialog-wrap';
  wrap.innerHTML = `<form class="dialog manager-editor" role="dialog" aria-modal="true" aria-labelledby="manager-title">
    <h2 id="manager-title">Project managers</h2>
    <label>Robot<select class="manager-thread" required></select></label>
    <label>Project<select class="manager-project" required></select></label>
    <p class="manager-help">Managers are pinned threads in T3. Give each manager a distinct responsibility when sharing a project.</p>
    <div class="manager-roles"></div>
    <button type="button" class="ghost manager-suggest">Suggest roles with AI</button>
    <div class="manager-suggestions" aria-label="Suggested roles"></div>
    <p class="manager-message" role="status"></p>
    <div class="dialog-actions"><button type="button" class="ghost manager-demote">Demote (unpin)</button><button type="button" class="ghost manager-cancel">Cancel</button><button type="submit" class="primary manager-save">Promote (pin)</button></div>
  </form>`;
  const form = wrap.querySelector('form')!, threads = wrap.querySelector<HTMLSelectElement>('.manager-thread')!, projects = wrap.querySelector<HTMLSelectElement>('.manager-project')!;
  const roles = wrap.querySelector<HTMLElement>('.manager-roles')!, message = wrap.querySelector<HTMLElement>('.manager-message')!;
  const suggest = wrap.querySelector<HTMLButtonElement>('.manager-suggest')!, suggestions = wrap.querySelector<HTMLElement>('.manager-suggestions')!;
  const save = wrap.querySelector<HTMLButtonElement>('.manager-save')!, demote = wrap.querySelector<HTMLButtonElement>('.manager-demote')!;
  const drafts = new Map(data.threads.map(t => [t.id, t.manager?.role || '']));
  const eligible = data.threads.filter(t => !t.id.startsWith('thread:'));
  for (const t of eligible) { const name = actions.robotName?.(t.id); const o = new Option(`${name ? `${name}: ` : ''}${t.title || 'Untitled thread'}`, t.id); threads.add(o); }
  for (const p of data.projects.filter(p => !p.scratch)) projects.add(new Option(p.title, p.id));
  if (threadId) threads.value = threadId;
  else if (projectId) {
    const preferred = eligible.find(t => t.pinned && (t.manager?.projectId || t.projectId) === projectId) || eligible.find(t => t.projectId === projectId);
    if (preferred) threads.value = preferred.id;
  }
  const current = () => data.threads.find(t => t.id === threads.value);
  const assigned = current()?.manager?.projectId || current()?.projectId;
  if (projectId || assigned) projects.value = projectId || assigned!;
  if (projects.selectedIndex < 0 && projects.options.length) projects.selectedIndex = 0;
  let closed = false, busy = false, generation = 0;
  const close = () => { if (busy) return; closed = true; generation++; window.removeEventListener('keydown', key, true); wrap.remove(); previous?.focus({ preventScroll: true }); };
  const render = () => {
    generation++; suggestions.replaceChildren(); message.textContent = ''; suggest.disabled = false;
    const t = current();
    const members = data.threads.filter(other => other.id === t?.id || (other.pinned && (other.manager?.projectId || other.projectId) === projects.value));
    roles.replaceChildren();
    for (const member of members) {
      const label = document.createElement('label'); label.textContent = member.id === t?.id ? 'This manager’s role' : `${member.title}: role`;
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = 120; input.dataset.thread = member.id;
      input.value = drafts.get(member.id) || ''; input.required = members.length > 1; input.placeholder = members.length > 1 ? 'Required, such as Engineering' : 'Optional for a sole manager';
      input.addEventListener('input', () => drafts.set(member.id, input.value)); label.append(input); roles.append(label);
    }
    demote.hidden = !t?.pinned; save.textContent = t?.pinned ? 'Save manager' : 'Promote (pin)';
    save.disabled = !t || !projects.value; suggest.disabled = save.disabled;
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    if (e.key === 'Tab') {
      const all = [...wrap.querySelectorAll<HTMLElement>('button:not([disabled]):not([hidden]), input, select')].filter(el => el.getClientRects().length);
      const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };
  async function submit(pinned: boolean) {
    if (busy || (pinned && !form.reportValidity())) return;
    busy = true; const target = threads.value, pid = projects.value;
    generation++;
    const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')]; controls.forEach(el => el.disabled = true);
    message.textContent = pinned ? 'Saving manager…' : 'Unpinning…';
    try { await actions.update({ threadId: target, pinned, projectId: pid, roles: Object.fromEntries(drafts) }); await actions.refresh(); busy = false; close(); }
    catch (e) { message.textContent = e instanceof Error ? e.message : 'Manager could not be saved. Try again.'; busy = false; controls.forEach(el => el.disabled = false); }
  }
  form.addEventListener('submit', e => { e.preventDefault(); void submit(true); });
  demote.addEventListener('click', () => void submit(false));
  wrap.querySelector('.manager-cancel')!.addEventListener('click', close);
  threads.addEventListener('change', render); projects.addEventListener('change', render);
  suggest.addEventListener('click', async () => {
    const own = ++generation, target = threads.value;
    suggest.disabled = true; message.textContent = 'Asking AI for role suggestions…'; suggestions.replaceChildren();
    try {
      const values = await actions.suggest({ threadId: target, projectId: projects.value });
      if (closed || own !== generation) return;
      for (const value of values) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost'; button.textContent = value;
        button.addEventListener('click', () => { drafts.set(target, value); const input = [...roles.querySelectorAll<HTMLInputElement>('input')].find(i => i.dataset.thread === target); if (input) { input.value = value; input.focus(); } }); suggestions.append(button);
      }
      message.textContent = 'Choose a suggestion or write your own role.';
    } catch (e) { if (!closed && own === generation) message.textContent = e instanceof Error ? e.message : 'Could not suggest roles. Enter your own role.'; }
    finally { if (!closed && own === generation) suggest.disabled = false; }
  });
  render(); document.body.append(wrap); window.addEventListener('keydown', key, true); threads.focus();
}
