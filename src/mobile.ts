import type { ChatPanel } from './office/chat-panel';
import { gameSound } from './office/sound';
import { getLocale, onLocaleChange } from './localization';
import './mobile.css';

type MobileView = 'office' | 'threads' | 'chat';

/** The same office and conversation, with one working surface at a time on phones. */
export function mountMobileShell(app: HTMLElement, chat: ChatPanel): () => void {
  const small = matchMedia('(max-width: 960px)');
  const scene = app.querySelector<HTMLElement>('#scene')!;
  const panel = app.querySelector<HTMLElement>('#side-panel')!;
  const nav = document.createElement('nav');
  nav.className = 'mobile-navigation';
  const paths = {
    office: '<path d="M3.5 20V7l8.5-4 8.5 4v13M1.5 20h21M8 20v-5h8v5M8 8v2m8-2v2M8 12h8"/>',
    threads: '<path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
    chat: '<path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v10a1.5 1.5 0 0 1-1.5 1.5H9l-5.5 4V6A1.5 1.5 0 0 1 5 4.5ZM8 9h8M8 13h5"/>',
  };
  for (const view of ['office', 'threads', 'chat'] as const) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.view = view;
    b.setAttribute('aria-controls', view === 'office' ? 'scene' : view === 'threads' ? 'side-panel' : 'mobile-chat');
    b.innerHTML = `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[view]}</svg><span></span>`;
    nav.appendChild(b);
  }
  chat.el.id = 'mobile-chat';
  app.appendChild(nav);
  let view: MobileView = 'office', frame = 0, disposed = false;
  let published = '', height = '', top = '';
  const root = document.documentElement;
  const updateLabels = () => {
    const de = getLocale() === 'de';
    nav.setAttribute('aria-label', de ? 'Lucid Navigation' : 'Lucid navigation');
    const labels = de ? ['Büro', 'Threads', 'Chat'] : ['Office', 'Threads', 'Chat'];
    nav.querySelectorAll('button span').forEach((s, i) => { s.textContent = labels[i]; });
  };
  const stopLocale = onLocaleChange(updateLabels);
  updateLabels();
  const publish = () => {
    const mobile = small.matches;
    const key = `${mobile}:${view}`;
    // Reopening the selected conversation must not recull every workstation or
    // wake the screen/actor clocks when the visible surface has not changed.
    if (published === key) return;
    published = key;
    app.classList.toggle('mobile-layout', mobile);
    app.dataset.mobileView = view;
    scene.inert = mobile && view !== 'office';
    panel.inert = mobile && view !== 'threads';
    chat.el.inert = mobile && view !== 'chat';
    for (const b of nav.querySelectorAll<HTMLButtonElement>('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.view === view));
    }
    window.dispatchEvent(new CustomEvent('lucid:mobile-view', { detail: { mobile, view } }));
    document.dispatchEvent(new CustomEvent('lucid:mobile-view', { detail: { mobile, view } }));
  };
  const select = (next: MobileView, gesture = false) => {
    if (!small.matches) return;
    if (next === 'chat' && !chat.isOpen) next = 'threads';
    if (next === 'chat' && chat.collapsed) chat.setCollapsed(false, false);
    const previous = view;
    view = next;
    // Blur a hidden text input so changing surfaces dismisses the phone keyboard.
    const active = document.activeElement as HTMLElement | null;
    if (active && ((next !== 'chat' && chat.el.contains(active)) || (next !== 'threads' && panel.contains(active)))) active.blur();
    publish();
    if (next === 'threads') {
      const reveal = panel.querySelector<HTMLButtonElement>('[data-fold="threads"][aria-expanded="false"]');
      reveal?.click();
    }
    if (gesture && previous !== next) gameSound.play('open');
  };
  const click = (e: Event) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-view]');
    if (b) select(b.dataset.view as MobileView, true);
  };
  nav.addEventListener('click', click);
  const previousPresent = chat.onPresent;
  chat.onPresent = () => { previousPresent(); select('chat'); };
  const previousCollapse = chat.onCollapse;
  chat.onCollapse = (collapsed, animate) => {
    previousCollapse(collapsed, small.matches ? false : animate);
    if (small.matches) select(collapsed ? 'office' : 'chat');
  };
  const previousChoose = chat.onChooseThread;
  chat.onChooseThread = () => { if (small.matches) select('threads'); else previousChoose(); };
  // Room and overview buttons return directly to the world after selection.
  const panelClick = (e: Event) => {
    if ((e.target as Element).closest('[data-room], #overview, #park, #shop-link')) select('office', true);
  };
  panel.addEventListener('click', panelClick);
  const viewport = () => {
    frame = 0;
    if (disposed) return;
    const vv = window.visualViewport;
    const focused = document.activeElement;
    app.classList.toggle('mobile-composing', small.matches && (vv?.height ?? innerHeight) < 560 && focused instanceof Element && focused.matches('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"])'));
    if (small.matches && (!vv || Math.abs(vv.scale - 1) < .01)) {
      const nextHeight = `${vv?.height ?? innerHeight}px`, nextTop = `${vv?.offsetTop ?? 0}px`;
      if (nextHeight !== height) { height = nextHeight; root.style.setProperty('--mobile-height', height); }
      if (nextTop !== top) { top = nextTop; root.style.setProperty('--mobile-top', top); }
    } else if (!small.matches) {
      if (height) { height = ''; root.style.removeProperty('--mobile-height'); }
      if (top) { top = ''; root.style.removeProperty('--mobile-top'); }
    }
  };
  const scheduleViewport = () => { if (!frame) frame = requestAnimationFrame(viewport); };
  const mode = () => { publish(); viewport(); };
  small.addEventListener('change', mode);
  window.addEventListener('resize', scheduleViewport);
  document.addEventListener('focusin', scheduleViewport);
  document.addEventListener('focusout', scheduleViewport);
  window.visualViewport?.addEventListener('resize', scheduleViewport);
  window.visualViewport?.addEventListener('scroll', scheduleViewport);
  mode();
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame); stopLocale();
    small.removeEventListener('change', mode);
    window.removeEventListener('resize', scheduleViewport);
    document.removeEventListener('focusin', scheduleViewport);
    document.removeEventListener('focusout', scheduleViewport);
    window.visualViewport?.removeEventListener('resize', scheduleViewport);
    window.visualViewport?.removeEventListener('scroll', scheduleViewport);
    window.removeEventListener('pagehide', pagehide);
    nav.removeEventListener('click', click); panel.removeEventListener('click', panelClick);
    chat.onPresent = previousPresent; chat.onCollapse = previousCollapse; chat.onChooseThread = previousChoose;
    scene.inert = panel.inert = chat.el.inert = false;
    app.classList.remove('mobile-layout', 'mobile-composing'); delete app.dataset.mobileView;
    root.style.removeProperty('--mobile-height'); root.style.removeProperty('--mobile-top');
    nav.remove();
  };
  const pagehide = (event: PageTransitionEvent) => { if (!event.persisted) destroy(); };
  window.addEventListener('pagehide', pagehide);
  return destroy;
}
