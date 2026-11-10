// Runs inside the sandboxed Studio frame (its own lucid-studio origin, no app bridge). The robot's
// computer sends saves and presence; this page answers with playback state, pointer motion for the
// robot's hand and a geometry scene for the distant monitor views.
import { Stage } from './stage-engine.mjs';

const query = new URLSearchParams(location.search);
const $ = (selector) => document.querySelector(selector);
const stageEl = $('.stage'), holder = $('.frame-holder'), label = $('.artboard-label');
const post = (message) => parent.postMessage({ studio: true, ...message }, '*');
label.querySelector('.file').textContent = query.get('label') || '';

const stage = new Stage({
  stage: stageEl, holder, overlay: $('.overlay'), frameUrl: query.get('entry') || '/index.html',
  onPlayback: (on) => post({ type: 'playback', on }),
  onSettled: (version) => { post({ type: 'settled', version }); postScene(); },
  onPointer: (x, y) => post({ type: 'pointer', x, y }),
  onPress: () => post({ type: 'press' }),
  onTyping: (on) => post({ type: 'typing', on }),
  onMissing: () => { $('.empty-line').textContent = 'Waiting for the page'; post({ type: 'missing' }); },
  onLayout: (scale) => { label.querySelector('.zoom').textContent = `${Math.round(scale * 100)}%`; label.style.left = holder.style.left; label.style.right = holder.style.left; },
});

addEventListener('message', (event) => {
  const m = event.source === parent && event.data && typeof event.data === 'object' ? event.data : null;
  if (!m) return;
  if (m.type === 'render' && Number.isFinite(m.version)) {
    if (Number.isFinite(m.cursor?.x) && Number.isFinite(m.cursor?.y)) stage.startAt = { x: m.cursor.x, y: m.cursor.y };
    if (stage.opened) stage.update(m.version, { animate: !!m.animate });
    else stage.open(m.version, { animate: !!m.animate });
  } else if (m.type === 'motion') stage.setMotion(!!m.on);
  else if (m.type === 'finish') stage.finish();
  else if (m.type === 'pace') stage.pace = Math.min(6, Math.max(1, Number(m.pace) || 1));
  else if (m.type === 'working') stage.setWorking(!!m.on);
});

// What the far camera tiers draw: the canvas, the artboard and the page's boxes and text lines,
// in this frame's own coordinates. Measured from the real render once it settles.
function postScene() {
  const width = innerWidth, height = innerHeight, shapes = [];
  const board = holder.getBoundingClientRect(), s = stage.scale;
  let doc = null, win = null;
  try { doc = stage.front?.contentDocument; win = stage.front?.contentWindow; } catch {}
  const clear = (c) => !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
  const pageBg = doc ? [doc.body, doc.documentElement].filter(Boolean).map((el) => win.getComputedStyle(el).backgroundColor).find((c) => !clear(c)) || '#ffffff' : '#ffffff';
  if (!stageEl.classList.contains('is-empty')) shapes.push({ x: board.left, y: board.top, w: board.width, h: Math.min(board.height, height - board.top), color: pageBg, radius: 2 });
  const map = (r) => {
    const x0 = Math.max(board.left, board.left + r.left * s), y0 = Math.max(board.top, board.top + r.top * s);
    const x1 = Math.min(board.right, board.left + r.right * s, width), y1 = Math.min(board.bottom, board.top + r.bottom * s, height);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const elements = doc?.body && !stageEl.classList.contains('is-empty') ? doc.body.querySelectorAll('*') : [];
  for (let i = 0; i < Math.min(elements.length, 500) && shapes.length < 540; i++) {
    const el = elements[i];
    if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|BR|TEMPLATE)$/.test(el.tagName)) continue;
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const r = map(el.getBoundingClientRect());
    if (r.w < 1 || r.h < 1) continue;
    if (!clear(style.backgroundColor)) shapes.push({ ...r, color: style.backgroundColor, radius: Math.min(30, (parseFloat(style.borderRadius) || 0) * s) });
    else if (/^(IMG|VIDEO|CANVAS|SVG|svg|PICTURE)$/.test(el.tagName) || style.backgroundImage !== 'none') shapes.push({ ...r, color: style.color, opacity: .16, radius: 2 });
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = doc.createRange(); range.selectNodeContents(node);
      for (const line of Array.from(range.getClientRects()).slice(0, 6)) {
        const t = map(line);
        if (t.w > 1 && t.h > 1) shapes.push({ ...t, y: t.y + t.h * .45, h: Math.max(1.5, t.h * .16), color: style.color, text: true, opacity: .55 });
      }
    }
  }
  post({ type: 'scene', scene: { width, height, background: getComputedStyle(document.body).backgroundColor, shapes } });
}

post({ type: 'ready' });
