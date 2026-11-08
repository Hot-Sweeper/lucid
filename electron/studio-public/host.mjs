import { Stage } from './stage.mjs';
const stage = new Stage({ stage: document.querySelector('.stage'), holder: document.querySelector('.frame-holder'), overlay: document.querySelector('.overlay'), onReady: () => report(), onFollowChange: on => report({ follow: on }) });
window.__lucidCanvas = { stage, inspect: () => ({ version, shown: stage.shownVersion, latest: stage.latestVersion, playback, mode, cursorCount: document.querySelectorAll('.agent-cursor').length, text: stage.front?.contentDocument?.body?.innerText?.slice(0, 800), pending: stage.front?.contentDocument?.querySelectorAll('[data-ares-pending]').length, width: stage.front?.contentWindow?.innerWidth, height: stage.front?.contentWindow?.innerHeight, errors: current.error }) };
let stopped = false, running = false, version = -1, playback = false, live = null, current = {}, mode = 'build';
function report(extra = {}) { parent.postMessage({ type: 'lucid:canvas', playback, mode, version, ...extra }, '*'); }
stage.onPlayback = active => { playback = active; report(); };
stage.onError = error => report({ error: error.message });
function fitLive() {
  if (!live) return; const w = current.width || 1440, box = document.body.getBoundingClientRect(), scale = Math.max(.05, Math.min(1, (box.width - 48) / w));
  Object.assign(live.style, { width: `${w}px`, height: `${Math.max(100, (box.height - 48) / scale)}px`, transform: `scale(${scale})`, left: `${Math.max(24, (box.width - w * scale) / 2)}px` });
}
const resize = new ResizeObserver(fitLive); resize.observe(document.body);
function useLive() {
  mode = 'live'; stage.cancel(true); stage.cursorEl.classList.remove('is-shown');
  if (!live && current.liveUrl) { live = document.createElement('iframe'); live.title = 'Interactive website'; live.className = 'live-frame'; live.sandbox = 'allow-scripts allow-same-origin allow-forms allow-downloads'; live.src = current.liveUrl; document.querySelector('.stage').append(live); fitLive(); }
  stage.holder.style.visibility = 'hidden'; stage.overlay.style.visibility = 'hidden'; report();
}
function useBuild() { mode = 'build'; live?.remove(); live = null; stage.holder.style.visibility = ''; stage.overlay.style.visibility = ''; report(); }
window.addEventListener('message', e => {
  if (e.source !== parent || !['null', 'file://'].includes(e.origin) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(e.origin)) return;
  const a = e.data; if (a?.type !== 'lucid:canvas-control') return;
  if (a.action === 'follow') stage.setFollow(!!a.on);
  if (a.action === 'replay') { useBuild(); report({ replay: true }); void stage.replay().then(() => report({ replay: false })); }
  if (a.action === 'live') useLive();
  if (a.action === 'build') { useBuild(); void stage.reload(); }
  if (a.action === 'viewport') { stage.setViewport(a.width === 390 ? 'phone' : a.width === 820 ? 'tablet' : 'desktop'); current.width = a.width; fitLive(); }
  if (a.action === 'theme') { document.documentElement.style.setProperty('--stage', a.theme === 'light' ? '#e8e5ef' : '#141a33'); }
});
async function poll() {
  if (running || stopped) return; running = true;
  try {
    const response = await fetch('/__lucid/state'), state = await response.json(); current = state; stage.setWorking(state.working);
    if (state.error) { document.querySelector('.empty-line').textContent = state.error; report({ error: state.error }); }
    if (state.version >= 0 && state.version !== version) {
      version = state.version;
      stage.setViewport(state.width === 390 ? 'phone' : state.width === 820 ? 'tablet' : 'desktop');
      if (!stage.project) { await stage.openProject('current', { hasSite: false, version }); }
      if (mode === 'build') void stage.update(version).then(() => report());
      else { stage.latestVersion = version; if (live) live.src = state.liveUrl; }
      report({ error: null });
    }
  } catch (e) { report({ error: e.message }); } finally { running = false; if (!stopped) setTimeout(poll, document.hidden ? 1800 : 600); }
}
window.addEventListener('pagehide', () => { stopped = true; resize.disconnect(); stage.destroy(); });
void poll();
