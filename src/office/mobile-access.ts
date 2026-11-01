import './mobile-access.css';
import { gameSound } from './sound';

type AccessState = { enabled: boolean; running: boolean; busy?: boolean; url: string; publicOrigin?: string; error: string | null };
type AccessApi = {
  mobileAccessStatus?: () => Promise<AccessState>;
  mobileAccessSetup?: () => Promise<AccessState>;
  mobileAccessDisable?: () => Promise<AccessState>;
};

/** Phone access is configured on the hosting computer, using its existing Tailscale identity. */
export function mountMobileAccess(host: HTMLElement, api: AccessApi) {
  if (!api.mobileAccessStatus || !api.mobileAccessSetup || !api.mobileAccessDisable) return () => {};
  const root = document.createElement('section'); root.className = 'mobile-access';
  const heading = document.createElement('div'); heading.className = 'sec-head';
  const title = document.createElement('h3'); title.textContent = 'Phone access';
  heading.append(title);
  const note = document.createElement('p'); note.className = 'mobile-access-note'; note.setAttribute('role', 'status'); note.textContent = 'Reading phone access';
  const link = document.createElement('a'); link.className = 'mobile-access-url'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.hidden = true;
  const actions = document.createElement('div'); actions.className = 'mobile-access-actions';
  const setup = document.createElement('button'); setup.type = 'button'; setup.className = 'ghost'; setup.textContent = 'Enable with Tailscale';
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'link-btn'; copy.textContent = 'Copy link'; copy.hidden = true;
  const disable = document.createElement('button'); disable.type = 'button'; disable.className = 'link-btn'; disable.textContent = 'Disable'; disable.hidden = true;
  actions.append(setup, copy, disable); root.append(heading, note, link, actions); host.append(root);
  let destroyed = false, pending = false, state: AccessState | null = null;
  const render = () => {
    if (destroyed) return;
    setup.disabled = copy.disabled = disable.disabled = pending;
    setup.hidden = !!state?.running && !state?.error;
    setup.textContent = pending ? 'Setting up access' : state?.enabled || state?.error ? 'Retry setup' : 'Enable with Tailscale';
    disable.hidden = !state?.enabled && !state?.publicOrigin;
    copy.hidden = link.hidden = !state?.running || !state?.url;
    if (state?.url) { link.href = state.url; link.textContent = state.url; }
    note.textContent = state?.error || (state?.running ? 'Open this link on your phone with Tailscale connected to the same account. Keep Lucid running here.' : 'Use this office on your phone through your Tailscale account.');
  };
  const run = async (action: () => Promise<AccessState>) => {
    if (pending || destroyed) return;
    pending = true; render();
    try { state = await action(); }
    catch (error) {
      if (destroyed) return;
      const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '') : 'Phone access could not be changed. Retry setup.';
      try { state = await api.mobileAccessStatus!(); } catch { /* retain the last known setting */ }
      state = { enabled: false, running: false, url: '', ...state, error: message };
    } finally { pending = false; render(); }
  };
  const onSetup = () => { gameSound.play('switch'); void run(api.mobileAccessSetup!); };
  const onDisable = () => { gameSound.play('switch'); void run(api.mobileAccessDisable!); };
  const onCopy = async () => {
    if (!state?.url || pending) return;
    try { await navigator.clipboard.writeText(state.url); if (!destroyed) { gameSound.play('open'); note.textContent = 'Link copied. Open it on your phone with Tailscale connected.'; } }
    catch { if (!destroyed) { note.textContent = 'Select and copy the phone link above.'; const range = document.createRange(); range.selectNodeContents(link); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); link.focus(); } }
  };
  setup.addEventListener('click', onSetup); disable.addEventListener('click', onDisable); copy.addEventListener('click', onCopy);
  void run(api.mobileAccessStatus);
  return () => { destroyed = true; setup.removeEventListener('click', onSetup); disable.removeEventListener('click', onDisable); copy.removeEventListener('click', onCopy); root.remove(); };
}
