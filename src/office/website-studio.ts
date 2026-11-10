import { studioLink } from './studio-links';
import { AnswerCard, type PendingRequest } from './answer';
import { renderChatMarkdown } from './chat-panel';
import { wireChatLinks } from './chat-links';
import { gameSound } from './sound';
import { getLocale } from '../localization';
import './website-studio.css';
import { icon } from '../ui/icons';

type Model = { id: string; name: string; efforts: string[]; defaultEffort: string; isDefault: boolean };
type Project = { sequence?: number; id: string; name: string; dir: string; localProjectId?: string; threadId?: string; model?: string; effort?: string; turn: { id: string; status: string } | null; lastTurn?: { status: string; error?: string }; activity?: string; entries: any[]; approvals: any[]; version: number; host: string };
const bridge = () => (window as any).lucid;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const copy = (en: string, de: string) => getLocale() === 'de' ? de : en;
let studio: WebsiteStudio | null = null;
export function openWebsiteStudio(context?: { threadId?: string; projectId?: string; name?: string }) {
  if (studio) { studio.el.focus(); return; }
  studio = new WebsiteStudio(context);
}
export function mountWebsiteStudio(neighbor: HTMLElement) {
  if (!bridge()?.studio) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost side-help website-studio-open'; button.id = 'website-studio-open';
  button.title = copy('Website studio on Ares', 'Website-Studio auf Ares'); button.setAttribute('aria-label', button.title);
  button.innerHTML = icon('studio');
  neighbor.before(button); button.addEventListener('click', () => openWebsiteStudio());
  document.addEventListener('lucid:website-studio', e => openWebsiteStudio((e as CustomEvent).detail));
}
class WebsiteStudio {
  el = document.createElement('dialog');
  private previous = document.activeElement as HTMLElement | null;
  private project: Project | null = null;
  private models: Model[] = [];
  private projects: any[] = [];
  private api = async (input: object) => { try { return await bridge().studio(input); } catch (e) { throw Error((e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); } };
  private timer = 0;
  private dead = false;
  private busy = false;
  private pollBusy = false;
  private generation = 0;
  private playback = false;
  private replay = false;
  private previewLiveUrl: string | null = null;
  private canvasError: string | null = null;
  private connected = false;
  private rendered = new Map<string, { el: HTMLElement; signature: string }>();
  private answers: AnswerCard;
  private pending: { requestId: string; text: string; model: string; effort: string } | null = null;
  private iframe: HTMLIFrameElement;
  private list: HTMLElement;
  private input: HTMLTextAreaElement;
  private model: HTMLSelectElement;
  private effort: HTMLSelectElement;
  private picker: HTMLSelectElement;
  private message = (event: MessageEvent) => {
    if (event.source !== this.iframe.contentWindow || event.origin !== new URL(this.iframe.src).origin || event.data?.type !== 'lucid:canvas') return;
    const data = event.data; this.playback = !!data.playback; if (typeof data.replay === 'boolean') this.replay = data.replay;
    if (typeof data.follow === 'boolean') this.el.querySelector('[data-action=follow]')?.setAttribute('aria-pressed', String(data.follow));
    this.el.querySelector('[data-action=live]')?.setAttribute('aria-pressed', String(data.mode === 'live'));
    if ('error' in data) this.canvasError = typeof data.error === 'string' ? data.error : null; this.paintState();
  };
  constructor(private context?: { threadId?: string; projectId?: string; name?: string }) {
    this.el.className = 'website-studio'; this.el.setAttribute('aria-label', copy('Website studio', 'Website-Studio')); this.el.dataset.pane = 'site';
    this.el.innerHTML = `<header class="ws-head"><button type="button" data-action="close" class="ghost">${copy('Back to office', 'Zurück ins Büro')}</button><strong>${copy('Website studio', 'Website-Studio')}</strong><span class="ws-host">Ares</span><label class="ws-project-label"><span class="sr-only">${copy('Project on Ares', 'Projekt auf Ares')}</span><select class="ws-project" aria-label="${copy('Project on Ares', 'Projekt auf Ares')}"><option>${copy('Connecting to Ares…', 'Verbinde mit Ares…')}</option></select></label><button type="button" data-action="new" class="ghost">${copy('New project', 'Neues Projekt')}</button><button type="button" data-action="theme" class="ghost" aria-label="${copy('Switch canvas theme', 'Canvas-Design wechseln')}">◐</button></header>
      <form class="ws-new" hidden><label>${copy('Project name', 'Projektname')}<input name="name" required maxlength="160" autocomplete="off"></label><details><summary>${copy('Use an existing Ares folder', 'Vorhandenen Ares-Ordner verwenden')}</summary><label>${copy('Path within an allowed Ares project root', 'Pfad innerhalb eines erlaubten Ares-Projektordners')}<input name="dir" placeholder="C:\\…" autocomplete="off"></label></details><button type="submit" class="primary">${copy('Create', 'Erstellen')}</button><button type="button" data-action="cancel-new" class="ghost">${copy('Cancel', 'Abbrechen')}</button></form>
      <div class="ws-body"><section class="ws-canvas" aria-label="${copy('Website preview', 'Website-Vorschau')}"><nav class="ws-toolbar" aria-label="${copy('Preview controls', 'Vorschausteuerung')}"><select class="ws-viewport" aria-label="${copy('Preview width', 'Vorschaubreite')}"><option value="1440">Desktop · 1440</option><option value="820">Tablet · 820</option><option value="390">${copy('Phone', 'Mobil')} · 390</option></select><button type="button" class="ghost" data-action="follow" aria-pressed="true">Follow</button><button type="button" class="ghost" data-action="replay">Replay</button><button type="button" class="ghost" data-action="live" aria-pressed="false">${copy('Use website', 'Website benutzen')}</button><button type="button" class="ghost ws-mobile" data-action="chat">Chat</button><details class="ws-help"><summary aria-label="${copy('About build playback', 'Über die Aufbauwiedergabe')}">?</summary><p>${copy('The cursor reconstructs saved changes from the actual rendered page. It is build playback, not recorded mouse input. Use website opens the running, interactive page. Replay starts a reconstruction from blank.', 'Der Cursor rekonstruiert gespeicherte Änderungen der gerenderten Seite. Dies ist eine Aufbauwiedergabe, keine Mausaufzeichnung. Website benutzen öffnet die interaktive Seite. Replay beginnt eine Rekonstruktion von einer leeren Fläche.')}</p></details></nav><iframe class="ws-frame" title="${copy('Website canvas', 'Website-Canvas')}" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerpolicy="no-referrer"></iframe></section>
      <div class="ws-divider" role="separator" aria-label="${copy('Resize chat', 'Chatbreite ändern')}" aria-orientation="vertical" aria-valuemin="280" aria-valuemax="720" aria-valuenow="380" tabindex="0"></div>
      <aside class="ws-chat"><header class="ws-chat-head"><strong>${copy('Design with Codex', 'Mit Codex gestalten')}</strong><button type="button" class="ghost ws-mobile" data-action="site">${copy('Canvas', 'Canvas')}</button><button type="button" class="ghost" data-action="reconnect">${copy('Reconnect', 'Neu verbinden')}</button></header><p class="ws-status" role="status">${copy('Connecting to Ares…', 'Verbinde mit Ares…')}</p><p class="ws-location"></p><div class="ws-messages cp-list" role="log" aria-label="${copy('Project conversation', 'Projektgespräch')}" aria-live="off"></div><button type="button" class="ghost ws-bottom" hidden>${copy('New messages ↓', 'Neue Nachrichten ↓')}</button><form class="cp-form ws-compose"><div class="ws-models"><select aria-label="Codex model" class="ws-model" disabled></select><select aria-label="${copy('Reasoning effort', 'Denkaufwand')}" class="ws-effort" disabled></select></div><label class="sr-only" for="ws-prompt">${copy('Describe your website or a refinement', 'Beschreibe deine Website oder eine Änderung')}</label><textarea id="ws-prompt" rows="3" placeholder="${copy('Describe your website…', 'Beschreibe deine Website…')}"></textarea><div class="ws-send-row"><span class="ws-send-error" role="alert"></span><button type="button" data-action="stop" class="ghost" disabled>${copy('Stop', 'Stoppen')}</button><button type="submit" class="primary ws-send" disabled>${copy('Send', 'Senden')}</button></div></form></aside></div>`;
    document.body.append(this.el); this.el.showModal();
    this.iframe = this.el.querySelector('.ws-frame')!; this.list = this.el.querySelector('.ws-messages')!; this.input = this.el.querySelector('textarea')!; this.model = this.el.querySelector('.ws-model')!; this.effort = this.el.querySelector('.ws-effort')!; this.picker = this.el.querySelector('.ws-project')!;
    this.iframe.addEventListener('load', () => { this.post('theme', {theme:this.el.dataset.theme || 'dark'}); this.post('follow', {on:this.el.querySelector('[data-action=follow]')!.getAttribute('aria-pressed') === 'true'}); this.post('model', {name:this.model.selectedOptions[0]?.textContent || 'Codex'}); void this.viewport(); });
    const owner = { el: this.el.querySelector('.ws-chat') as HTMLElement, get isOpen() { return true; }, get threadId() { return studio?.project?.id || null; } };
    this.answers = new AnswerCard(owner, { poll: false, autoFocus: false, pending: async () => this.approvals(), t3: { status: async () => ({ paired: this.connected, error: null }), respond: async a => { await this.api({ action: 'approval', id: this.project!.id, requestId: a.requestId, decision: a.decision, answers: a.answers }); await this.poll(); } } });
    if (bridge()?.openExternal) wireChatLinks(this.list, url => { const mapped = studioLink(url, this.previewLiveUrl, this.registeredOrigins()); return mapped ? bridge().openExternal(mapped) : Promise.resolve({ok:false,error:copy('This address is local to Ares. Use the website preview to open this project.', 'Diese Adresse gehört zu Ares. Öffne das Projekt über die Website-Vorschau.')}); });
    this.el.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.el.addEventListener('click', event => { const a = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action; if (a) void this.control(a); });
    this.el.querySelector('.ws-compose')!.addEventListener('submit', e => { e.preventDefault(); void this.send(); });
    this.input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void this.send(); } });
    this.el.querySelector('.ws-new')!.addEventListener('submit', e => { e.preventDefault(); void this.create(e.target as HTMLFormElement); });
    this.picker.addEventListener('change', () => void this.select(this.picker.value));
    this.model.addEventListener('change', () => { this.fillEfforts(); this.saveChoices(); }); this.effort.addEventListener('change', () => this.saveChoices());
    this.el.querySelector('.ws-viewport')!.addEventListener('change', () => void this.viewport());
    this.el.querySelector('.ws-bottom')!.addEventListener('click', () => { this.list.scrollTop = this.list.scrollHeight; (this.el.querySelector('.ws-bottom') as HTMLElement).hidden = true; });
    window.addEventListener('message', this.message); this.resize(); void this.connect(); this.input.focus(); gameSound.play('switch');
  }
  private status(text: string) { this.el.querySelector('.ws-status')!.textContent = text; }
  private paintState() {
    if (!this.connected) { (this.el.querySelector('.ws-send') as HTMLButtonElement).disabled = true; this.model.disabled = this.effort.disabled = true; return; }
    const p = this.project, t = p?.turn, lastError = !t && p?.entries.at(-1)?.kind === 'error' ? p.entries.at(-1)?.text : null;
    this.status(p?.approvals.length ? copy('Waiting for your answer', 'Wartet auf deine Antwort') : lastError ? lastError : this.canvasError ? this.canvasError : !p ? copy('Choose or create a project on Ares.', 'Wähle oder erstelle ein Projekt auf Ares.') : p.approvals.length ? copy('Waiting for your answer', 'Wartet auf deine Antwort') : t ? (t.status === 'starting' ? copy('Starting on Ares…', 'Startet auf Ares…') : p.activity === 'Inspecting the actual website' ? copy('Inspecting the website', 'Website wird geprüft') : copy('Working on Ares', 'Arbeitet auf Ares')) : this.playback ? (this.replay ? copy('Replay', 'Wiedergabe') : copy('Codex finished. Playback is catching up…', 'Codex ist fertig. Die Wiedergabe holt auf…')) : p.lastTurn?.status === 'failed' ? (p.lastTurn.error || copy('Codex failed. Send a follow-up to retry.', 'Codex ist fehlgeschlagen. Erneut versuchen.')) : p.lastTurn?.status === 'interrupted' ? copy('Stopped. Your files and conversation are saved.', 'Gestoppt. Dateien und Gespräch sind gespeichert.') : copy('Ready on Ares', 'Bereit auf Ares'));
    (this.el.querySelector('[data-action=stop]') as HTMLButtonElement).disabled = !t && !(this.busy && this.pending);
    (this.el.querySelector('.ws-send') as HTMLButtonElement).disabled = !p || !!t || this.busy || !this.models.length;
    this.model.disabled = this.effort.disabled = !!t || this.busy || !this.models.length;
  }
  private saveChoices() { if (this.project) localStorage.setItem(`lucid:studio:model:${this.project.id}`, JSON.stringify({ model: this.model.value, effort: this.effort.value })); }
  private fillEfforts(selected?: string) { const m = this.models.find(m => m.id === this.model.value); this.effort.replaceChildren(...(m?.efforts || []).map(e => new Option(e, e))); this.effort.value = selected && m?.efforts.includes(selected) ? selected : m?.defaultEffort || ''; this.effort.hidden = !m?.efforts.length; }
  private async connect() {
    this.status(copy('Connecting to Ares…', 'Verbinde mit Ares…'));
    try {
      if (this.context?.threadId && !this.context.projectId) { const info = await bridge().threadInfo(this.context.threadId); if (info?.projectId) this.context.projectId = info.projectId; }
      const s = await this.api({ action: 'status' }); if (this.dead) return;
      if (String(s.host).toLowerCase() !== 'ares') throw Error(`Unexpected execution host: ${s.host}. Expected Ares.`);
      this.connected = true; this.projects = s.projects; this.models = s.models; this.model.replaceChildren(...this.models.map(m => new Option(m.name, m.id))); this.model.value = this.models.find(m => m.isDefault)?.id || this.models[0]?.id || ''; this.fillEfforts();
      this.picker.replaceChildren(new Option(copy('Choose a project', 'Projekt auswählen'), ''), ...this.projects.map(p => new Option(p.name, p.id)));
      const saved = localStorage.getItem('lucid:studio:project'), associated = this.projects.find(p => this.context?.projectId && p.localProjectId === this.context.projectId);
      const choice = this.project?.id || associated?.id || (this.projects.some(p => p.id === saved) ? saved : '');
      if (choice) await this.select(choice); else { this.paintState(); if (!this.projects.length) void this.control('new'); }
    } catch (e) { this.connected = false; this.status((e as Error).message); }
  }
  private async select(id: string) {
    const generation = ++this.generation; clearTimeout(this.timer); this.pending = null;
    if (this.project) this.rememberDraft();
    if (!id) { this.project = null; this.paintState(); return; }
    try {
      const p = await this.api({ action: 'project', id }); if (this.dead || generation !== this.generation) return;
      const old = this.project?.id; this.project = p; this.picker.value = id; localStorage.setItem('lucid:studio:project', id);
      this.el.querySelector('.ws-location')!.textContent = `${p.host} · ${p.dir}`;
      this.rendered.clear(); this.list.replaceChildren(); this.input.value = localStorage.getItem(`lucid:studio:draft:${id}`) || '';
      let choice; try { choice = JSON.parse(localStorage.getItem(`lucid:studio:model:${id}`) || 'null'); } catch {}
      const selected = choice?.model || p.model; if (this.models.some(m => m.id === selected)) this.model.value = selected; this.fillEfforts(choice?.effort || p.effort);
      if (old && old !== id) void this.api({ action: 'close', id: old });
      const { url, liveUrl } = await this.api({ action: 'preview', id }); if (this.dead || generation !== this.generation) return;
      this.previewLiveUrl = liveUrl; this.canvasError = null; this.iframe.src = url; if (this.context?.threadId) document.dispatchEvent(new CustomEvent('lucid:studio-preview', { detail: { threadId: this.context.threadId, url, projectId: id } })); this.playback = false; this.replay = false; this.render(p); void this.poll();
    } catch (e) { this.status((e as Error).message); }
  }
  private rememberDraft() { if (this.project) localStorage.setItem(`lucid:studio:draft:${this.project.id}`, this.input.value); }
  private async poll() {
    if (this.dead || !this.project || this.pollBusy) return; this.pollBusy = true; const id = this.project.id, generation = this.generation;
    try { const p = await this.api({ action: 'project', id, after: this.project?.sequence || 0 }); if (this.dead || generation !== this.generation) return; this.connected = true; const entries = new Map(this.project?.entries.map(e => [e.id, e])); for (const e of p.entries) entries.set(e.id, e); this.project = { ...p, entries: [...entries.values()] }; this.render(p); await this.answers.refresh(); }
    catch (e) { if (!this.dead) { this.connected = false; this.status((e as Error).message); } }
    finally { this.pollBusy = false; if (!this.dead && generation === this.generation) this.timer = window.setTimeout(() => void this.poll(), document.hidden ? 2000 : 700); }
  }
  private registeredOrigins() { return (this.project?.entries || []).filter(e => e.kind === 'tool' && /^Project dev server: /.test(e.text || '')).map(e => e.text.slice('Project dev server: '.length)); }
  private render(p: Project) {
    const bottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 70; let changed = false;
    for (const e of p.entries) {
      let item = this.rendered.get(e.id); const signature = e.revision ? String(e.revision) : JSON.stringify(e); if (item?.signature === signature) continue;
      changed = true;
      if (!item) { const el = document.createElement(['user', 'agent', 'inspection', 'error', 'research'].includes(e.kind) ? 'section' : 'details'); item = { el, signature: '' }; this.rendered.set(e.id, item); this.list.append(el); }
      item.signature = signature; const el = item.el;
      if (e.kind === 'user' || e.kind === 'agent') { el.className = `cp-msg ${e.kind === 'user' ? 'you' : 'bot'}`; el.innerHTML = `<div class="cp-prose">${renderChatMarkdown(e.text || '')}</div>`; for (const link of el.querySelectorAll<HTMLAnchorElement>('a[href]')) { const mapped = studioLink(link.href, this.previewLiveUrl, this.registeredOrigins()); if (mapped && mapped !== link.href) { link.href = mapped; link.title = copy('Open this Ares project through Lucid’s preview', 'Dieses Ares-Projekt über Lucids Vorschau öffnen'); } } }
      else if (e.kind === 'inspection') { el.className = 'ws-inspection'; el.innerHTML = `<details><summary>${copy('Looked at the website', 'Website geprüft')} · ${esc(e.viewport)}</summary><p>${esc(e.text)}</p>${e.image?.startsWith('data:image/jpeg;base64,') ? `<img alt="${copy('Actual website inspection on Ares', 'Echte Website-Prüfung auf Ares')}" src="${esc(e.image)}">` : ''}</details>`; }
      else if (e.kind === 'research') { el.className = 'ws-research'; el.innerHTML = `<p>${esc(e.text)}</p><div>${(e.images || []).filter((i: any) => /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(i.image) && /^https:\/\/commons\.wikimedia\.org\//.test(i.source)).map((i: any) => `<a href="${esc(i.source)}"><img src="${esc(i.image)}" alt="${esc(i.title)}" loading="lazy"><span>${esc(i.title)}</span><small>${esc(i.license)} · ${esc(i.artist)}</small></a>`).join('')}</div>`; }
      else if (e.kind === 'error') { el.className = 'ws-run-error'; el.textContent = e.text; }
      else { el.className = 'ws-tool'; const expanded = (el as HTMLDetailsElement).open; el.innerHTML = `<summary>${esc(e.kind === 'end' ? e.text : e.kind === 'files' ? copy('Updated files', 'Dateien geändert') : e.kind === 'reasoning' ? copy('Reasoning', 'Überlegungen') : e.kind === 'search' ? copy('Searched the web', 'Im Web gesucht') : e.kind === 'look' ? copy('Rendering website', 'Website wird gerendert') : e.label || e.kind)}${e.status ? ` · ${esc(e.status)}` : ''}</summary><pre>${esc(e.text || '')}${e.output ? '\n' + esc(e.output) : ''}</pre>`; (el as HTMLDetailsElement).open = expanded; }
    }
    if (bottom && changed) this.list.scrollTop = this.list.scrollHeight;
    (this.el.querySelector('.ws-bottom') as HTMLElement).hidden = bottom || !changed; this.paintState();
  }
  private approvals(): PendingRequest[] {
    return (this.project?.approvals || []).map(a => {
      if (a.method === 'item/tool/requestUserInput') return { id: a.id, type: 'input', at: new Date().toISOString(), answerable: true, reason: null, questions: a.params.questions.map((q: any) => ({ id: q.id, header: q.header || '', question: q.question, options: (q.options || []).map((o: any) => ({ ...o, value: o.label })), multiSelect: false, allowCustomAnswer: true, initialAnswer: null })) };
      return { id: a.id, type: 'approval', at: new Date().toISOString(), answerable: true, reason: a.params.reason || null, requestKind: a.method.includes('fileChange') ? 'file-change' : 'command', prompt: a.method.includes('permissions') ? copy('Extended permissions requested', 'Erweiterte Berechtigungen angefordert') : a.params.command || copy('Allow these file changes?', 'Diese Dateiänderungen erlauben?'), detail: `${a.params.cwd || this.project?.dir || ''}\n${a.params.reason || ''}`, options: [...(!a.method.includes('permissions') ? [{ decision: 'accept', label: copy('Allow once', 'Einmal erlauben'), warning: null }] : []), { decision: 'decline', label: copy('Decline', 'Ablehnen'), warning: null }] };
    });
  }
  private async send() {
    if (this.busy || !this.project || this.project.turn || !this.input.value.trim()) return;
    const id = this.project.id; this.busy = true; this.paintState(); this.rememberDraft();
    const text = this.input.value;
    if (!this.pending || this.pending.text !== text) this.pending = { requestId: crypto.randomUUID(), text, model: this.model.value, effort: this.effort.value };
    try { await this.api({ action: 'send', id, ...this.pending }); if (this.project?.id !== id || this.dead) return; this.input.value = ''; this.pending = null; this.rememberDraft(); this.el.querySelector('.ws-send-error')!.textContent = ''; await this.poll(); }
    catch (e) { this.el.querySelector('.ws-send-error')!.textContent = (e as Error).message; }
    finally { this.busy = false; this.paintState(); }
  }
  private async create(form: HTMLFormElement) {
    if (this.busy) return; this.busy = true; const submit = form.querySelector('button[type=submit]') as HTMLButtonElement; submit.disabled = true;
    try { const data = new FormData(form), p = await this.api({ action: 'create', name: data.get('name'), dir: data.get('dir'), localProjectId: this.context?.projectId }); this.projects.push(p); this.picker.append(new Option(p.name, p.id)); form.hidden = true; await this.select(p.id); this.input.focus(); }
    catch (e) { this.status((e as Error).message); } finally { this.busy = false; submit.disabled = false; this.paintState(); }
  }
  private post(action: string, extra = {}) { if (this.iframe.src) this.iframe.contentWindow?.postMessage({ type: 'lucid:canvas-control', action, ...extra }, new URL(this.iframe.src).origin); }
  private async viewport() { if (!this.project) return; const width = Number((this.el.querySelector('.ws-viewport') as HTMLSelectElement).value); this.post('viewport', { width }); try { await this.api({ action: 'viewport', id: this.project.id, width, theme: this.el.dataset.theme || 'dark' }); } catch (e) { this.status((e as Error).message); } }
  private async control(action: string) {
    if (action === 'close') return this.close();
    if (action === 'reconnect') return this.connect();
    if (action === 'new') { const form = this.el.querySelector<HTMLFormElement>('.ws-new')!; form.hidden = false; const name = form.elements.namedItem('name') as HTMLInputElement; name.value ||= this.context?.name || ''; name.focus(); return; }
    if (action === 'cancel-new') { (this.el.querySelector('.ws-new') as HTMLElement).hidden = true; return; }
    if (action === 'chat' || action === 'site') { this.el.dataset.pane = action; return; }
    if (action === 'stop' && this.project) { this.busy = true; this.paintState(); try { await this.api({ action: 'stop', id: this.project.id }); await this.poll(); } catch (e) { this.status((e as Error).message); } finally { this.busy = false; this.paintState(); } return; }
    if (action === 'follow') { const button = this.el.querySelector('[data-action=follow]')!; const on = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(on)); this.post('follow', { on }); }
    if (action === 'replay') { this.replay = true; this.post('replay'); }
    if (action === 'live') { const on = this.el.querySelector('[data-action=live]')!.getAttribute('aria-pressed') !== 'true'; this.post(on ? 'live' : 'build'); }
    if (action === 'theme') { this.el.dataset.theme = this.el.dataset.theme === 'light' ? 'dark' : 'light'; this.post('theme', { theme: this.el.dataset.theme }); await this.viewport(); }
  }
  private resize() {
    const divider = this.el.querySelector<HTMLElement>('.ws-divider')!; const set = (n: number) => { const value = Math.round(Math.max(280, Math.min(720, this.el.clientWidth - 340, n))); this.el.style.setProperty('--ws-chat-width', `${value}px`); divider.setAttribute('aria-valuenow', String(value)); localStorage.setItem('lucid:studio:width', String(value)); };
    set(Number(localStorage.getItem('lucid:studio:width')) || 380);
    divider.addEventListener('keydown', e => { const step = e.shiftKey ? 50 : 16; if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); set(e.key === 'Home' ? 280 : e.key === 'End' ? 720 : Number(divider.getAttribute('aria-valuenow')) + (e.key === 'ArrowLeft' ? step : -step)); } });
    divider.addEventListener('pointerdown', e => { e.preventDefault(); divider.setPointerCapture(e.pointerId); this.el.classList.add('ws-resizing'); const move = (event: PointerEvent) => set(this.el.getBoundingClientRect().right - event.clientX); const end = () => { this.el.classList.remove('ws-resizing'); divider.removeEventListener('pointermove', move); divider.removeEventListener('lostpointercapture', end); }; divider.addEventListener('pointermove', move); divider.addEventListener('lostpointercapture', end); });
  }
  private close() {
    this.dead = true; this.generation++; this.rememberDraft(); clearTimeout(this.timer); this.answers.destroy(); window.removeEventListener('message', this.message);
    if (this.project && !this.context?.threadId) void this.api({ action: 'close', id: this.project.id }); this.el.close(); this.el.remove(); studio = null; this.previous?.focus({ preventScroll: true });
  }
}
