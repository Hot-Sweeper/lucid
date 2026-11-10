// Executed only inside the isolated frontend renderer. No Lucid preload or Node.
function install() {
  if (window.__lucidMonitor) return;
  const state = window.__lucidMonitor = { revision: 1 };
  new MutationObserver(() => state.revision++).observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
  addEventListener('scroll', () => state.revision++, true);
  addEventListener('resize', () => state.revision++);
}

function sample(mode, action) {
  const width = innerWidth, height = innerHeight;
  const scene = [];
  const sourceDocument = document, sourceWindow = window;
  const rect = r => ({ x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.max(0, Math.min(width, r.right) - Math.max(0, r.left)), h: Math.max(0, Math.min(height, r.bottom) - Math.max(0, r.top)) });
  const visible = r => r.w > 1 && r.h > 1;
  const elements = sourceDocument.body ? sourceDocument.body.querySelectorAll('*') : [];
  for (let i = 0; i < Math.min(elements.length, 500) && scene.length < 550; i++) {
    const el = elements[i], tag = el.tagName;
    if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|BR)$/.test(tag)) continue;
    const style = sourceWindow.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const r = rect(el.getBoundingClientRect());
    if (!visible(r)) continue;
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') scene.push({ ...r, color: style.backgroundColor, radius: Math.min(30, parseFloat(style.borderRadius) || 0) });
    else if (/^(IMG|VIDEO|CANVAS|SVG)$/.test(tag) || style.backgroundImage !== 'none') scene.push({ ...r, color: style.color, opacity: .16, radius: 3 });
    // Keep text geometry even in the shapes tier so zooming back to lines is instant.
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = sourceDocument.createRange(); range.selectNodeContents(node);
      for (const line of Array.from(range.getClientRects()).slice(0, 8)) {
        const t = rect(line); if (visible(t)) scene.push({ ...t, y: t.y + t.h * .45, h: Math.max(2, t.h * .16), color: style.color, text: true, opacity: .55 });
        if (scene.length >= 550) break;
      }
    }
  }
  let target = null;
  if (action?.selector && typeof action.selector === 'string' && !action.selector.startsWith('aria-ref=')) {
    try { const el = document.querySelector(action.selector); if (el) { const r = rect(el.getBoundingClientRect()); if (visible(r)) target = r; } } catch {}
  }
  if (!target && action?.role && action?.name) {
    const roles = { BUTTON: 'button', A: 'link', H1: 'heading', H2: 'heading', H3: 'heading', TEXTAREA: 'textbox', SELECT: 'combobox' };
    const matches = Array.from(elements).filter(el => {
      const role = el.getAttribute('role') || (el.tagName === 'INPUT' ? el.type === 'checkbox' ? 'checkbox' : 'textbox' : roles[el.tagName]);
      return role === action.role && (el.getAttribute('aria-label') || el.innerText || '').trim() === action.name;
    });
    // An ambiguous or stale reference must not invent a cursor destination.
    if (matches.length === 1) { const r = rect(matches[0].getBoundingClientRect()); if (visible(r)) target = r; }
  }
  let pointer = null;
  if (Number.isFinite(action?.x) && Number.isFinite(action?.y)) {
    const x = action.x * width / (action.viewportWidth || width), y = action.y * height / (action.viewportHeight || height);
    if (x >= 0 && y >= 0 && x <= width && y <= height) {
      pointer = { x, y };
      if (!target) { const el = document.elementFromPoint(x, y); if (el && el !== document.body && el !== document.documentElement) target = rect(el.getBoundingClientRect()); }
    }
  } else if (target) pointer = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const background = [document.body, document.documentElement].filter(Boolean).map(el => getComputedStyle(el).backgroundColor).find(c => c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') || '#ffffff';
  return { title: document.title, width, height, background, shapes: scene.slice(0, 550), pointer, target,
    revision: window.__lucidMonitor?.revision || 0, animated: document.getAnimations().some(a => a.playState === 'running') };
}

module.exports = { install: `(${install.toString()})()`,
  version: `({revision:window.__lucidMonitor?.revision||0,animated:document.getAnimations().some(a=>a.playState==='running')})`,
  sample: (mode, action) => `(${sample.toString()})(${JSON.stringify(mode)},${JSON.stringify(action || null)})` };
