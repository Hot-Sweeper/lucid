import { Stage } from './stage.mjs';
const stage = new Stage({ stage: document.querySelector('.stage'), holder: document.querySelector('.frame-holder'), overlay: document.querySelector('.overlay'), onReady: () => report(), onFollowChange: on => report({ follow: on }) });
let paused = false; const plans = [];
stage.onPlan = plan => { plans.push(plan.steps.map(s => ({ kind: s.kind, id: s.el?.id || '', tag: s.el?.tagName || '' }))); if (plans.length > 30) plans.shift(); };
window.__lucidCanvas = { stage, pause: value => { paused = !!value; if (paused) { stage.cancel(true); cancelAnimationFrame(stage.raf); stage.raf = 0; stage.cursorEl.classList.remove('is-shown'); } }, inspect: () => ({ version, plans, shown: stage.shownVersion, latest: stage.latestVersion, playback, mode, cursorCount: document.querySelectorAll('.agent-cursor').length, text: stage.front?.contentDocument?.body?.innerText?.slice(0, 800), pending: stage.front?.contentDocument?.querySelectorAll('[data-ares-pending]').length, width: stage.front?.contentWindow?.innerWidth, height: stage.front?.contentWindow?.innerHeight, errors: current.error }) };
let stopped = false, running = false, version = -1, playback = false, live = null, current = {}, mode = 'build', lastError = null, lastWidth = 0, lastTheme = null;
function report(extra = {}) { parent.postMessage({ type: 'lucid:canvas', playback, mode, version, ...extra }, '*'); }
stage.onPlayback = active => { playback = active; report(); };
stage.onError = error => report({ error: error.message });
function fitLive() {
  if (!live) return; const w = current.width || 1440, box = document.body.getBoundingClientRect(), h = w === 390 ? 844 : w === 820 ? 1180 : 900, scale = Math.max(.05, Math.min(1, (box.width - 48) / w, (box.height - 48) / h));
  Object.assign(live.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${scale})`, left: `${Math.max(24, (box.width - w * scale) / 2)}px` });
}
const resize = new ResizeObserver(fitLive); resize.observe(document.body);
function useLive() {
  mode = 'live'; stage.project = null; stage.pendingRender = null; stage.cancel(true); stage.cursorEl.classList.remove('is-shown');
  if (!live && current.liveUrl) { live = document.createElement('iframe'); live.title = 'Interactive website'; live.style.colorScheme = current.theme || 'light'; live.className = 'live-frame'; live.sandbox = 'allow-scripts allow-same-origin allow-forms allow-downloads'; live.src = current.liveUrl; document.querySelector('.stage').append(live); fitLive(); }
  stage.holder.style.visibility = 'hidden'; stage.overlay.style.visibility = 'hidden'; report();
}
function useBuild() { mode = 'build'; stage.project = 'current'; stage.latestVersion = version; live?.remove(); live = null; stage.holder.style.visibility = ''; stage.overlay.style.visibility = ''; report(); }
window.addEventListener('message', e => {
  if (e.source !== parent || !['null', 'file://'].includes(e.origin) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(e.origin)) return;
  const a = e.data; if (a?.type !== 'lucid:canvas-control') return;
  if (a.action === 'model' && typeof a.name === 'string') stage.setModelName(a.name.slice(0, 80));
  if (a.action === 'follow') stage.setFollow(!!a.on);
  if (a.action === 'replay') { useBuild(); report({ replay: true }); void stage.replay().then(() => report({ replay: false })); }
  if (a.action === 'live') useLive();
  if (a.action === 'build') { useBuild(); void stage.reload(); }
  if (a.action === 'viewport') { stage.setViewport(a.width === 390 ? 'phone' : a.width === 820 ? 'tablet' : 'desktop'); current.width = a.width; fitLive(); }
  if (a.action === 'theme') { document.documentElement.style.setProperty('--stage', a.theme === 'light' ? '#e8e5ef' : '#141a33'); }
});
async function poll() {
  if (running || stopped) return; if (paused) { setTimeout(poll, 1000); return; } running = true;
  try {
    const response = await fetch('/__lucid/state'), state = await response.json(); current = state; stage.setWorking(state.working); document.documentElement.style.colorScheme = state.theme; stage.holder.style.colorScheme = state.theme; if (live) live.style.colorScheme = state.theme;
    if (state.error !== lastError) { lastError = state.error || null; report({ error: lastError }); }
    if (state.error) document.querySelector('.empty-line').textContent = state.error;
    if (state.version >= 0 && state.version !== version) {
      const presentationChanged = lastWidth && (lastWidth !== state.width || lastTheme !== state.theme); lastWidth = state.width; lastTheme = state.theme;
      version = state.version;
      stage.setViewport(state.width === 390 ? 'phone' : state.width === 820 ? 'tablet' : 'desktop');
      const initial = !stage.project;
      if (initial && mode === 'build') { await stage.openProject('current', { hasSite: true, version }); }
      if (mode === 'build' && !initial) { if (presentationChanged) { stage.cancel(true); stage.latestVersion = version; void stage.reload().then(() => report()); } else void stage.update(version).then(() => report()); }
      else if (mode === 'live') { stage.latestVersion = version; if (live && !state.hmr) live.src = state.liveUrl; }
      report({ error: null });
    }
  } catch (e) { report({ error: e.message }); } finally { running = false; if (!stopped) setTimeout(poll, document.hidden ? 1800 : 600); }
}
window.addEventListener('pagehide', () => { stopped = true; resize.disconnect(); stage.destroy(); });
void poll();
