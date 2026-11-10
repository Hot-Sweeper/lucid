import type { World } from './world';
import { getLocale, onLocaleChange } from '../localization';
import { gameSound } from './sound';
import './project-life.css';

type Board = { revision: number; banner: string; launchDate: string; goals: { text: string; done: boolean }[]; events: { title: string; date: string }[]; ideas: null | { at: number; language: string; banner: string; goals: string[]; banter: { name: string; text: string }[][] } };
type Bridge = { projectBoardGet(input: { projectId: string }): Promise<Board>; projectBoardSave(input: { projectId: string; revision: number; board: Board }): Promise<Board>; projectBoardGenerate(input: { projectId: string; language: string; robots: { name: string }[] }): Promise<Board> };
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const tr = (en: string, de: string) => getLocale() === 'de' ? de : en;
const blank = (): Board => ({ revision: 0, banner: '', launchDate: '', goals: [], events: [], ideas: null });
export function daysTo(date: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const value = Date.UTC(y, m - 1, d);
  if (new Date(value).toISOString().slice(0, 10) !== date) return null;
  return Math.round((value - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}
function countdown(date: string) {
  const days = daysTo(date);
  if (days === null) return '';
  if (days === 0) return tr('Launch day!', 'Heute ist Launch!');
  return days > 0 ? tr(`Launch in ${days} ${days === 1 ? 'day' : 'days'}`, `Launch in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`) : tr(`Launch date was ${Math.abs(days)} days ago`, `Launchtermin war vor ${Math.abs(days)} Tagen`);
}

/** A project-scoped board. Agent state stays in T3; these are the human's plans. */
export class ProjectLife {
  private boards = new Map<string, Board>();
  private loading = new Set<string>();
  private seen = new Map<string, string>();
  private writing = false;
  private disposed = false;
  private speechTimers = new Set<number>();
  private closeBoard: (() => void) | null = null;
  private offLocale: () => void;
  constructor(private world: World) {
    this.offLocale = onLocaleChange(() => this.sync());
    window.addEventListener('pagehide', this.destroy, { once: true });
  }
  private api() { return (window as unknown as { lucid: Bridge }).lucid; }
  private local() { return !this.world.lastData?.environmentId; }
  private async load(id: string) {
    if (this.loading.has(id) || this.boards.has(id) || !this.local()) return;
    this.loading.add(id);
    try { const board = await this.api().projectBoardGet({ projectId: id }); if (!this.disposed) { this.boards.set(id, board); this.sync(); } }
    catch { /* Opening the board shows a retryable error. */ }
    finally { this.loading.delete(id); }
  }
  sync() {
    if (this.disposed) return;
    if (!this.local()) this.closeBoard?.();
    for (const room of this.world.rooms.filter(r => r.kind === 'project')) {
      const id = room.id.slice(2);
      room.el.classList.toggle('has-project-office-board', this.local() && !room.collapsed);
      let prop = room.el.querySelector<HTMLButtonElement>('.project-office-prop');
      if (!this.local()) { prop?.remove(); continue; }
      if (!prop) {
        prop = document.createElement('button'); prop.type = 'button'; prop.className = 'project-office-prop';
        prop.addEventListener('pointerdown', e => e.stopPropagation());
        prop.addEventListener('click', e => { e.stopPropagation(); void this.open(id); });
        room.el.append(prop);
      }
      prop.hidden = room.collapsed;
      const board = this.boards.get(id);
      const description = [tr('Open office board', 'Büroboard öffnen'), board?.banner, board?.launchDate ? countdown(board.launchDate) : ''].filter(Boolean).join(' · ');
      prop.title = description;
      prop.setAttribute('aria-label', description);
      // One small clipboard beside the room control, never a text panel over the windows.
      if (!prop.firstChild) prop.innerHTML = '<svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden="true"><rect x="6" y="6" width="20" height="23" rx="3" fill="#fff8eb"/><path d="M11 6V4h10v4H11V6Z" fill="#ffbf86"/><path d="m10 14 2 2 3-4m3 2h4m-12 8 2 2 3-4m3 2h4" stroke="#51434b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      void this.load(id);
      // Existing world refreshes drive this, with no extra polling/render timer.
      const threads = this.world.lastData?.threads.filter(t => t.projectId === id) || [];
      const signature = threads.map(t => `${t.id}:${t.runStatus}:${t.settled}`).join('|');
      const previous = this.seen.get(id); this.seen.set(id, signature);
      if (previous && previous !== signature && board?.ideas && Date.now() - board.ideas.at > 3600000 && !this.writing && !document.hidden && !this.closeBoard) {
        void this.write(id).catch(() => {});
      }
    }
  }
  private async write(id: string) {
    if (this.writing || !this.local()) throw Error(tr('The office writer is busy. Try again shortly.', 'Der Büroschreiber ist beschäftigt. Versuch es gleich noch einmal.'));
    this.writing = true;
    const threadIds = new Set(this.world.lastData?.threads.filter(t => t.projectId === id).map(t => t.id));
    const robots = this.world.roster.robots.filter(r => !r.retired && r.threadId && threadIds.has(r.threadId)).slice(0, 60).map(r => ({ name: r.name }));
    try { const board = await this.api().projectBoardGenerate({ projectId: id, language: getLocale(), robots }); if (!this.disposed) { this.boards.set(id, board); this.sync(); this.chatter(id, board); } return board; }
    finally { this.writing = false; }
  }
  private chatter(id: string, board: Board) {
    if (!this.local() || document.hidden || board.ideas?.language !== getLocale()) return;
    const exchange = board.ideas?.banter[0]; if (!exchange) return;
    exchange.forEach((line, i) => {
      const timer = window.setTimeout(() => {
        this.speechTimers.delete(timer);
        if (this.disposed || !this.local() || document.hidden) return;
        const robot = this.world.roster.robots.find(r => !r.retired && r.name === line.name && r.threadId && this.world.lastData?.threads.some(t => t.id === r.threadId && t.projectId === id));
        const desk = robot?.threadId ? this.world.desks.get(robot.threadId) : null;
        if (!desk || desk.room !== `p:${id}` || desk.el.classList.contains('arriving') || desk.bubble.classList.contains('show')) return;
        const thread = this.world.lastData?.threads.find(t => t.id === robot!.threadId);
        if (thread?.question || !desk.el.getClientRects().length) return;
        const text = `${tr('Office banter', 'Bürogespräch')}: ${line.text}`;
        desk.say(text, 'speak'); gameSound.at('chatter', desk.el, .25);
        const clear = window.setTimeout(() => { this.speechTimers.delete(clear); if (desk.bubble.querySelector('p')?.textContent === text) desk.say(null); }, 5500);
        this.speechTimers.add(clear);
      }, i * 3800);
      this.speechTimers.add(timer);
    });
  }
  async open(id: string) {
    if (!this.local()) return;
    const project = this.world.lastData?.projects.find(p => p.id === id && !p.scratch);
    if (!project) return;
    this.closeBoard?.();
    const previous = document.activeElement as HTMLElement | null;
    const draftKey = `lucid:project-board-draft:local:${id}`;
    const wrap = document.createElement('div'); wrap.className = 'dialog-wrap project-office-wrap';
    const dialog = document.createElement('section'); dialog.className = 'dialog project-office'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', `${project.title}: ${tr('project office', 'Projektbüro')}`); dialog.tabIndex = -1;
    wrap.append(dialog); document.body.append(wrap); gameSound.play('open');
    let closed = false, busy = false, loaded = false, dirty = false, ignoreDraft = false, board = blank();
    const preserve = () => { try { localStorage.setItem(draftKey, JSON.stringify({ banner: board.banner, launchDate: board.launchDate, goals: board.goals, events: board.events, baseRevision: board.revision })); } catch {} };
    const close = () => { if (closed) return; if (loaded && dirty) preserve(); closed = true; this.closeBoard = null; window.removeEventListener('keydown', key, true); wrap.remove(); if (previous?.isConnected) previous.focus({ preventScroll: true }); else this.world.rooms.find(r => r.id === `p:${id}`)?.el.querySelector<HTMLButtonElement>('.project-office-prop')?.focus({ preventScroll: true }); };
    this.closeBoard = close;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      if (e.key === 'Tab') {
        const all = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')].filter(el => el.getClientRects().length);
        if (!all.length) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === all[0] || document.activeElement === dialog)) { e.preventDefault(); all.at(-1)?.focus(); }
        else if (!e.shiftKey && (document.activeElement === all.at(-1) || document.activeElement === dialog)) { e.preventDefault(); all[0]?.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    const notice = (s: string) => { const el = dialog.querySelector<HTMLElement>('.project-office-status'); if (el) el.textContent = s; };
    const setBusy = (value: boolean) => { busy = value; dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button:not([data-close])').forEach(el => el.disabled = value); };
    const mark = () => { dirty = true; preserve(); };
    const render = () => {
      const ideas = board.ideas?.language === getLocale() ? board.ideas : null;
      dialog.innerHTML = `<header class="project-office-header"><div><h2>${esc(project.title)}</h2><p>${esc(tr('Your little corner of the big plan.', 'Deine kleine Ecke für große Pläne.'))}</p></div><button type="button" class="ghost" data-close>${esc(tr('Close', 'Schließen'))}</button></header>
        <div class="project-office-scroll">
          <div class="project-office-banner"><label>${esc(tr('Office banner', 'Bürobanner'))}<input data-banner maxlength="100" value="${esc(board.banner)}" placeholder="${esc(tr('Operation: ship something wonderful', 'Mission: etwas Wunderbares veröffentlichen'))}"></label><strong data-countdown>${esc(countdown(board.launchDate))}</strong></div>
          <div class="project-office-columns"><section class="project-whiteboard"><h3>${esc(tr('While the robots work', 'Während die Roboter arbeiten'))}</h3><p>${esc(tr('Small steps you can take while your team builds.', 'Kleine Schritte, während dein Team am Projekt arbeitet.'))}</p><div class="project-goals">${board.goals.map((g, i) => `<div class="project-goal"><input type="checkbox" data-done="${i}" ${g.done ? 'checked' : ''} aria-label="${esc(tr('Complete goal', 'Ziel erledigen'))}"><input data-goal="${i}" maxlength="240" value="${esc(g.text)}" aria-label="${esc(tr('Goal', 'Ziel'))}"><button type="button" class="ghost" data-remove-goal="${i}" aria-label="${esc(tr('Remove goal', 'Ziel entfernen'))}">×</button></div>`).join('')}</div><button type="button" class="ghost" data-add-goal>${esc(tr('Add a goal', 'Ziel hinzufügen'))}</button></section>
          <section class="project-calendar"><h3>${esc(tr('Project calendar', 'Projektkalender'))}</h3><label>${esc(tr('Launch date (optional)', 'Launchtermin (optional)'))}<input type="date" data-launch value="${esc(board.launchDate)}"></label><div class="project-calendar-entries">${board.events.map((e, i) => `<div class="project-calendar-entry"><input data-event-title="${i}" maxlength="100" value="${esc(e.title)}" aria-label="${esc(tr('Milestone', 'Meilenstein'))}"><input type="date" data-event-date="${i}" value="${esc(e.date)}" aria-label="${esc(tr('Milestone date', 'Meilensteindatum'))}"><button type="button" class="ghost" data-remove-event="${i}" aria-label="${esc(tr('Remove milestone', 'Meilenstein entfernen'))}">×</button></div>`).join('')}</div><button type="button" class="ghost" data-add-event>${esc(tr('Add a milestone', 'Meilenstein hinzufügen'))}</button></section></div>
          <section class="project-ideas"><h3>${esc(tr('A little inspiration', 'Ein bisschen Inspiration'))}</h3><p>${esc(tr('A few ideas from your project. Choose what belongs on your board.', 'Ein paar Ideen für dein Projekt. Such aus, was auf dein Board gehört.'))}</p><div class="project-suggestions">${ideas?.banner ? `<button type="button" class="ghost" data-use-banner>${esc(tr('Put up banner:', 'Banner aufhängen:'))} ${esc(ideas.banner)}</button>` : ''}${ideas?.goals.map((g, i) => `<button type="button" class="ghost" data-idea="${i}">+ ${esc(g)}</button>`).join('') || ''}</div><button type="button" class="ghost" data-write>${esc(tr('Ask the office writer', 'Büroschreiber fragen'))}</button></section>
          <section class="project-chatter"><h3>${esc(tr('Overheard in the office', 'Im Büro aufgeschnappt'))}</h3><p>${esc(tr('Playful banter, separate from real agent messages.', 'Spielerische Gespräche, getrennt von echten Agentennachrichten.'))}</p>${ideas?.banter.length ? ideas.banter.map(exchange => `<div class="project-exchange">${exchange.map(line => `<p><strong>${esc(line.name)}</strong><span>${esc(line.text)}</span></p>`).join('')}</div>`).join('') : `<p>${esc(tr('Ask the writer to give your project team something to talk about. Two project robots are needed for a conversation.', 'Frag den Schreiber nach Gesprächsstoff fürs Team. Für ein Gespräch braucht es zwei Projektroboter.'))}</p>`}</section>
        </div><footer class="project-office-footer"><p class="project-office-status" role="status"></p><button type="button" class="ghost" data-reload>${esc(tr('Use saved version', 'Gespeicherte Version nutzen'))}</button><button type="button" class="primary" data-save>${esc(tr('Save office plans', 'Büropläne speichern'))}</button></footer>`;
      dialog.querySelector('[data-close]')!.addEventListener('click', close);
      dialog.querySelector('[data-reload]')!.addEventListener('click', () => { if (busy) return; if (dirty) preserve(); ignoreDraft = true; dirty = false; void load(); });
      dialog.querySelector<HTMLInputElement>('[data-banner]')!.addEventListener('input', e => { board.banner = (e.target as HTMLInputElement).value; mark(); });
      dialog.querySelector<HTMLInputElement>('[data-launch]')!.addEventListener('input', e => { board.launchDate = (e.target as HTMLInputElement).value; dialog.querySelector('[data-countdown]')!.textContent = countdown(board.launchDate); mark(); });
      for (const input of dialog.querySelectorAll<HTMLInputElement>('[data-goal], [data-done], [data-event-title], [data-event-date]')) input.addEventListener('input', () => {
        if (input.dataset.goal !== undefined) board.goals[+input.dataset.goal].text = input.value;
        if (input.dataset.done !== undefined) { board.goals[+input.dataset.done].done = input.checked; if (input.checked) gameSound.play('collect'); }
        if (input.dataset.eventTitle !== undefined) board.events[+input.dataset.eventTitle].title = input.value;
        if (input.dataset.eventDate !== undefined) board.events[+input.dataset.eventDate].date = input.value;
        mark();
      });
      dialog.querySelector('[data-add-goal]')!.addEventListener('click', () => { if (board.goals.length >= 30) return; board.goals.push({ text: '', done: false }); mark(); render(); dialog.querySelector<HTMLInputElement>(`[data-goal="${board.goals.length - 1}"]`)?.focus(); });
      dialog.querySelector('[data-add-event]')!.addEventListener('click', () => { if (board.events.length >= 30) return; board.events.push({ title: '', date: '' }); mark(); render(); dialog.querySelector<HTMLInputElement>(`[data-event-title="${board.events.length - 1}"]`)?.focus(); });
      for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-remove-goal], [data-remove-event], [data-idea], [data-use-banner]')) button.addEventListener('click', () => {
        if (button.dataset.removeGoal !== undefined) board.goals.splice(+button.dataset.removeGoal, 1);
        if (button.dataset.removeEvent !== undefined) board.events.splice(+button.dataset.removeEvent, 1);
        if (button.dataset.idea !== undefined && board.goals.length < 30) { const text = ideas!.goals[+button.dataset.idea]; if (!board.goals.some(g => g.text === text)) board.goals.push({ text, done: false }); }
        if (button.hasAttribute('data-use-banner')) board.banner = ideas!.banner;
        mark(); render(); dialog.querySelector<HTMLButtonElement>('[data-add-goal]')?.focus(); gameSound.play('paper');
      });
      const save = async () => {
        if (!this.local()) throw Error('Open this board on the computer that owns the project.');
        const saved = await this.api().projectBoardSave({ projectId: id, revision: board.revision, board });
        board = saved; dirty = false; this.boards.set(id, saved); try { localStorage.removeItem(draftKey); } catch {} this.sync();
      };
      dialog.querySelector('[data-save]')!.addEventListener('click', async () => {
        if (busy) return; setBusy(true); notice(tr('Saving plans…', 'Pläne speichern…'));
        try { await save(); if (!closed) { notice(tr('Plans saved. Make yourself at home.', 'Pläne gespeichert. Mach es dir gemütlich.')); gameSound.play('paper'); } }
        catch (error) { if (!closed) notice(String((error as Error).message)); }
        finally { if (!closed) setBusy(false); }
      });
      dialog.querySelector('[data-write]')!.addEventListener('click', async () => {
        if (busy) return; setBusy(true); notice(tr('The office writer is finding a little inspiration…', 'Der Büroschreiber sucht nach Inspiration…'));
        try { if (dirty) await save(); const next = await this.write(id); if (closed) return; board = next; render(); notice(tr('New ideas are ready. Pick the ones you like.', 'Neue Ideen sind da. Such dir die passenden aus.')); }
        catch (error) { if (!closed) notice(String((error as Error).message)); }
        finally { if (!closed) { setBusy(false); dialog.querySelector<HTMLButtonElement>('[data-write]')?.focus(); } }
      });
    };
    const load = async () => {
      dialog.innerHTML = `<h2>${esc(project.title)}</h2><p role="status">${esc(tr('Opening the office…', 'Büro öffnen…'))}</p><button type="button" class="ghost" data-close>${esc(tr('Close', 'Schließen'))}</button>`;
      dialog.querySelector('[data-close]')!.addEventListener('click', close); dialog.focus();
      try {
        const value = await this.api().projectBoardGet({ projectId: id }); if (closed) return;
        board = structuredClone(value); this.boards.set(id, value);
        let recovered = false;
        try { const draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (!ignoreDraft && draft && Array.isArray(draft.goals) && Array.isArray(draft.events)) { const { baseRevision, ...fields } = draft; board = { ...board, ...fields, revision: baseRevision ?? value.revision }; dirty = true; recovered = true; } } catch {}
        if (ignoreDraft) { try { localStorage.removeItem(draftKey); } catch {} ignoreDraft = false; }
        loaded = true; render(); this.sync(); if (recovered) notice(tr('Restored your unsaved draft.', 'Dein ungespeicherter Entwurf wurde wiederhergestellt.')); dialog.querySelector<HTMLInputElement>('[data-banner]')?.focus();
      } catch (error) {
        if (closed) return;
        dialog.innerHTML = `<h2>${esc(project.title)}</h2><p role="alert">${esc((error as Error).message)}</p><button type="button" class="ghost" data-retry>${esc(tr('Try again', 'Erneut versuchen'))}</button><button type="button" class="ghost" data-close>${esc(tr('Close', 'Schließen'))}</button>`;
        dialog.querySelector('[data-retry]')!.addEventListener('click', () => void load()); dialog.querySelector('[data-close]')!.addEventListener('click', close); dialog.querySelector<HTMLButtonElement>('[data-retry]')?.focus();
      }
    };
    void load();
  }
  destroy = () => { this.disposed = true; this.closeBoard?.(); this.offLocale(); for (const timer of this.speechTimers) window.clearTimeout(timer); this.speechTimers.clear(); window.removeEventListener('pagehide', this.destroy); };
}
