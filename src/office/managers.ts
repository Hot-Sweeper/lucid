import type { WorldData } from './world';
import './managers.css';

type Actions = {
  update(input: { threadId: string; pinned: boolean; projectId: string; roles: Record<string, string> }): Promise<unknown>;
  suggest(input: { threadId: string; projectId: string }): Promise<string[]>;
  refresh(): Promise<void>;
  robotName?(id: string): string | undefined;
  /** Profile pictures. Missing on surfaces that cannot change them. */
  avatar?(input: { threadId: string; data?: string; restore?: string; clear?: boolean }): Promise<string | null>;
  avatarHistory?(input: { threadId: string }): Promise<{ id: string; url: string; at: number }[]>;
  avatarAsk?(input: { threadId: string; note?: string }): Promise<unknown>;
  face?(threadId: string, picture: string | null, size: number, place: string): string;
  played?(cue: "collect" | "paper"): void;
};
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const toBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

export function openManagers(data: WorldData, threadId: string | null, projectId: string | null, actions: Actions) {
  const previous = document.activeElement as HTMLElement | null;
  const wrap = document.createElement('div'); wrap.className = 'dialog-wrap';
  wrap.innerHTML = `<form class="dialog manager-editor" role="dialog" aria-modal="true" aria-labelledby="manager-title">
    <h2 id="manager-title">Project managers</h2>
    <label>Robot<select class="manager-thread" required></select></label>
    <div class="manager-picture" hidden>
      <span class="manager-picture-face"></span>
      <div class="manager-picture-actions">
        <button type="button" class="ghost manager-picture-ai"></button>
        <button type="button" class="ghost manager-picture-choose">Choose image</button>
        <button type="button" class="ghost manager-picture-reset">Use robot face</button>
        <input type="file" class="manager-picture-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>
      </div>
      <label class="manager-picture-note">Direction for a designed picture (optional)<input type="text" class="manager-picture-direction" maxlength="300" placeholder="Such as: friendly math tutor, green and cream"></label>
      <div class="manager-picture-earlier" hidden><span>Earlier pictures</span><div class="manager-picture-history" role="group" aria-label="Earlier pictures"></div></div>
    </div>
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
  const pictureBox = wrap.querySelector<HTMLElement>('.manager-picture')!, pictureFace = wrap.querySelector<HTMLElement>('.manager-picture-face')!;
  const pictureAi = wrap.querySelector<HTMLButtonElement>('.manager-picture-ai')!, pictureChoose = wrap.querySelector<HTMLButtonElement>('.manager-picture-choose')!;
  const pictureReset = wrap.querySelector<HTMLButtonElement>('.manager-picture-reset')!, pictureFile = wrap.querySelector<HTMLInputElement>('.manager-picture-file')!;
  const pictureNote = wrap.querySelector<HTMLInputElement>('.manager-picture-direction')!, pictureHistory = wrap.querySelector<HTMLElement>('.manager-picture-history')!;
  const earlier = wrap.querySelector<HTMLElement>('.manager-picture-earlier')!;
  const pictures = new Map(data.threads.map(t => [t.id, t.manager?.avatar || null]));
  let pictureBusy = false, pictureGeneration = 0;
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
    renderPicture();
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
  // Picture changes apply right away; earlier pictures stay one click away below.
  function renderPicture() {
    const t = current(), own = ++pictureGeneration;
    const can = !!(t?.pinned && actions.avatar && actions.face);
    pictureBox.hidden = !can;
    if (!can || !t) return;
    const picture = pictures.get(t.id) || null, name = actions.robotName?.(t.id);
    pictureFace.innerHTML = actions.face!(t.id, picture, 64, 'e');
    pictureAi.textContent = name ? `Ask ${name} to design one` : 'Ask them to design one';
    pictureAi.hidden = !actions.avatarAsk; pictureReset.hidden = !picture;
    [pictureAi, pictureChoose, pictureReset].forEach(b => b.disabled = pictureBusy);
    pictureHistory.replaceChildren(); earlier.hidden = true;
    void actions.avatarHistory?.({ threadId: t.id }).then(list => {
      if (closed || own !== pictureGeneration) return;
      earlier.hidden = !list.length;
      pictureHistory.innerHTML = list.slice(0, 8).map(h => `<button type="button" data-restore="${esc(h.id)}" aria-label="Use the picture from ${esc(new Date(h.at).toLocaleString())}" title="Use this earlier picture">${actions.face!(t.id, h.url, 36, `h${h.id.replace(/\W/g, '')}`)}</button>`).join('');
    }).catch(() => {});
  }
  async function changePicture(run: (threadId: string) => Promise<string | null | undefined>, doing: string, done: string) {
    const t = current();
    if (!t || pictureBusy) return;
    pictureBusy = true; message.textContent = doing; renderPicture();
    try {
      const value = await run(t.id);
      if (value !== undefined) pictures.set(t.id, value);
      message.textContent = done;
      actions.played?.(value === undefined ? 'paper' : 'collect');
      void actions.refresh();
    } catch (e) { message.textContent = e instanceof Error ? e.message : 'The picture could not be changed. Try again.'; }
    finally { pictureBusy = false; if (!closed) renderPicture(); }
  }
  pictureChoose.addEventListener('click', () => pictureFile.click());
  pictureFile.addEventListener('change', () => {
    const file = pictureFile.files?.[0]; pictureFile.value = '';
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { message.textContent = 'Choose an image smaller than 4 MB.'; return; }
    void changePicture(async id => actions.avatar!({ threadId: id, data: await toBase64(file) }), 'Saving picture…', 'Picture updated.');
  });
  pictureReset.addEventListener('click', () => void changePicture(id => actions.avatar!({ threadId: id, clear: true }), 'Switching back…', 'Showing the robot face again. The custom picture is kept below.'));
  pictureHistory.addEventListener('click', e => {
    const restore = (e.target as HTMLElement).closest<HTMLElement>('[data-restore]')?.dataset.restore;
    if (restore) void changePicture(id => actions.avatar!({ threadId: id, restore }), 'Restoring picture…', 'Earlier picture restored.');
  });
  pictureAi.addEventListener('click', () => {
    const name = actions.robotName?.(threads.value) || 'The manager';
    void changePicture(async id => { await actions.avatarAsk!({ threadId: id, note: pictureNote.value }); return undefined; }, 'Sending the request…', `Asked. ${name} saves the picture in its folder, and it appears here and in the Threads list when ready.`);
  });
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
