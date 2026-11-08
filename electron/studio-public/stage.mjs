// Ported from the user-owned Ares Studio human-designer prototype. Saved-render reconstruction, never recorded mouse input.
// The live canvas: shows the site, diffs each new render against the previous one, and plays the
// change back the way a person builds a page in a design tool. New things take no space until the
// cursor places them: boxes are drawn and then filled, rounded and shadowed, text is clicked into
// place and typed, images are dropped in and scaled up, and deleted things are selected and removed.

const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BASE', 'TITLE', 'HEAD', 'BR', 'WBR']);
const NO_TYPE = new Set([...SKIP, 'OPTION', 'SELECT', 'TEXTAREA', 'INPUT']);
const STYLE_PROPS = {
  color: 'color', backgroundColor: 'fill', backgroundImage: 'fill', fontFamily: 'font', fontSize: 'type size',
  fontWeight: 'weight', fontStyle: 'font', letterSpacing: 'tracking', lineHeight: 'leading', textTransform: 'case', textAlign: 'alignment',
  borderTopLeftRadius: 'radius', borderTopWidth: 'border', borderTopColor: 'border', boxShadow: 'shadow', paddingTop: 'padding',
  paddingLeft: 'padding', opacity: 'opacity', display: 'layout', gridTemplateColumns: 'grid', flexDirection: 'layout', columnGap: 'gap',
  rowGap: 'gap', justifyContent: 'alignment', alignItems: 'alignment', objectFit: 'fit', filter: 'filter', maxWidth: 'width',
};
// Properties we can tween from the old value to the new one during a restyle.
const MORPH = [
  'color', 'backgroundColor', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'borderRadius', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'boxShadow', 'opacity', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopWidth', 'maxWidth', 'columnGap', 'rowGap', 'gridTemplateColumns', 'filter',
];
const SIZE_LABELS = new Set(['type size', 'padding', 'width', 'gap', 'grid', 'leading', 'tracking', 'layout', 'size']);
const COLOR_PROPS = new Set(['color', 'backgroundColor', 'borderTopColor']);
const NUM_PROPS = { fontSize: 'type size', letterSpacing: 'tracking', lineHeight: 'leading', borderTopLeftRadius: 'radius', paddingTop: 'padding', maxWidth: 'width', columnGap: 'gap', borderTopWidth: 'border' };
const TAG_WORDS = {
  H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading', P: 'paragraph', A: 'link', BUTTON: 'button',
  IMG: 'image', PICTURE: 'image', VIDEO: 'video', NAV: 'navigation', HEADER: 'header', FOOTER: 'footer', SECTION: 'section', MAIN: 'main area',
  ARTICLE: 'article', ASIDE: 'sidebar', UL: 'list', OL: 'list', LI: 'list item', FORM: 'form', INPUT: 'field', TEXTAREA: 'field', LABEL: 'label',
  SELECT: 'menu', SVG: 'graphic', svg: 'graphic', FIGURE: 'figure', FIGCAPTION: 'caption', BLOCKQUOTE: 'quote', TABLE: 'table', SPAN: 'text', STRONG: 'text', EM: 'text',
  DL: 'list', DT: 'term', DD: 'description', HR: 'rule', CANVAS: 'canvas', IFRAME: 'embed', TIME: 'time', ADDRESS: 'address',
};
const MEDIA = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'IFRAME']);
const BUDGET_MS = 28000;
// Motion tokens (DESIGN.md): settling after a click, and something on screen changing place or size.
const EASE_OUT_STRONG = 'cubic-bezier(.23, 1, .32, 1)';
const EASE_IN_OUT = 'cubic-bezier(.77, 0, .175, 1)';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(r));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
// Minimum-jerk profile: how a hand moves a mouse between two points.
const minJerk = (t) => t * t * t * (10 + t * (6 * t - 15));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function kids(el) {
  const out = [];
  for (const c of el.children) if (!SKIP.has(c.tagName)) out.push(c);
  return out;
}
function ownText(el) {
  let s = '';
  for (const n of el.childNodes) if (n.nodeType === 3) s += n.data;
  return s.replace(/\s+/g, ' ').trim();
}
const weakKey = (el) => el.tagName + (el.id ? '#' + el.id : '');
const strongKey = (el) =>
  weakKey(el) + '|' + (el.getAttribute('class') || '') + '|' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) + '|' + (el.getAttribute('src') || el.getAttribute('href') || '');

function lcsPairs(ka, kb) {
  const n = ka.length, m = kb.length;
  if (!n || !m) return [];
  if (n * m > 90000) {
    const pairs = [];
    let j = 0;
    for (let i = 0; i < n && j < m; i++) {
      for (let jj = j; jj < Math.min(m, j + 24); jj++) if (ka[i] === kb[jj]) { pairs.push([i, jj]); j = jj + 1; break; }
    }
    return pairs;
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) { pairs.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return pairs;
}

// Stable identities survive text/style changes and sibling reordering. Ambiguous repeated
// unkeyed siblings are treated as replacements instead of guessing by their index.
const identity = el => el.id ? 'id:' + el.id : el.getAttribute('data-lucid-key') ? 'key:' + el.getAttribute('data-lucid-key') : null;
export function matchChildren(oc, nc) {
  const out = [], usedOld = new Set(), usedNew = new Set();
  const matchUnique = key => {
    const a = new Map(), b = new Map();
    oc.forEach((el, i) => { if (usedOld.has(i)) return; const k = key(el); if (k) a.set(k, a.has(k) ? -1 : i); });
    nc.forEach((el, i) => { if (usedNew.has(i)) return; const k = key(el); if (k) b.set(k, b.has(k) ? -1 : i); });
    for (const [k, i] of a) { const j = b.get(k); if (i >= 0 && j != null && j >= 0 && oc[i].tagName === nc[j].tagName) { out.push([i, j]); usedOld.add(i); usedNew.add(j); } }
  };
  matchUnique(identity);
  matchUnique(strongKey);
  matchUnique(el => identity(el) || el.tagName + '|' + (el.getAttribute('class') || '') + '|' + (el.getAttribute('role') || '') + '|' + (el.getAttribute('name') || ''));
  const oi = oc.map((_, i) => i).filter(i => !usedOld.has(i)), ni = nc.map((_, i) => i).filter(i => !usedNew.has(i));
  for (const [i, j] of lcsPairs(oi.map(i => strongKey(oc[i])), ni.map(i => strongKey(nc[i])))) out.push([oi[i], ni[j]]);
  return out.sort((a, b) => a[0] - b[0]);
}

function tagWord(el) {
  const w = TAG_WORDS[el.tagName];
  if (w && w !== 'text') return w;
  const cls = el.classList?.[0];
  if (cls && !/^(is|has|js)-/.test(cls)) return cls.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().slice(0, 28);
  return w || 'block';
}

function isSvg(el) {
  return el.namespaceURI === 'http://www.w3.org/2000/svg';
}
function isMedia(el) {
  return MEDIA.has(el.tagName) || (isSvg(el) && el.tagName.toLowerCase() === 'svg');
}

function parseColor(c) {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function hex(c) {
  const p = parseColor(c);
  if (!p) return c;
  return '#' + [p.r, p.g, p.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function luminance(c) {
  const p = parseColor(c);
  if (!p) return 1;
  return (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b) / 255;
}
function fmtNum(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return v;
  return String(Math.round(n * 10) / 10);
}
function firstFamily(v) {
  return String(v).split(',')[0].replace(/["']/g, '').trim();
}
// Index in `raw` after the first `len` characters of its whitespace-collapsed, trimmed form.
function rawIndexAfter(raw, len) {
  let count = 0, i = 0, prevSpace = true;
  for (; i < raw.length && count < len; i++) {
    const sp = /\s/.test(raw[i]);
    if (sp) { if (!prevSpace) count++; prevSpace = true; } else { count++; prevSpace = false; }
  }
  return i;
}

const CURSOR_SHAPES = `
  <div class="cursor-shape" data-for="arrow"><svg width="18" height="20" viewBox="0 0 18 20"><path class="fill" d="M1.5 1.5 L1.5 16.2 L5.6 12.6 L8.4 18.6 L11 17.4 L8.3 11.6 L13.9 11.4 Z"/></svg></div>
  <div class="cursor-shape" data-for="text"><svg width="12" height="22" viewBox="0 0 12 22"><path class="halo" d="M2.5 2.5c1.7 0 2.7.6 3.5 1.6.8-1 1.8-1.6 3.5-1.6M6 4.2v13.6M2.5 19.5c1.7 0 2.7-.6 3.5-1.6.8 1 1.8 1.6 3.5 1.6"/><path class="line" d="M2.5 2.5c1.7 0 2.7.6 3.5 1.6.8-1 1.8-1.6 3.5-1.6M6 4.2v13.6M2.5 19.5c1.7 0 2.7-.6 3.5-1.6.8 1 1.8 1.6 3.5 1.6"/></svg></div>
  <div class="cursor-shape" data-for="cross"><svg width="20" height="20" viewBox="0 0 20 20"><path class="halo" d="M10 1.5v6M10 12.5v6M1.5 10h6M12.5 10h6"/><path class="line" d="M10 1.5v6M10 12.5v6M1.5 10h6M12.5 10h6"/></svg></div>
  <div class="cursor-shape" data-for="resize"><svg width="20" height="20" viewBox="0 0 20 20"><path class="halo" d="M4 4l12 12M4 4h5M4 4v5M16 16h-5M16 16v-5"/><path class="line" d="M4 4l12 12M4 4h5M4 4v5M16 16h-5M16 16v-5"/></svg></div>`;

export class Stage {
  constructor({ stage, holder, overlay, onPageChange, onFollowChange, onReady }) {
    this.stageEl = stage;
    this.holder = holder;
    this.overlay = overlay;
    this.onPageChange = onPageChange;
    this.onFollowChange = onFollowChange;
    this.onReady = onReady;
    this.front = null;
    this.leaving = null;
    this.project = null;
    this.page = 'index.html';
    this.viewport = 'desktop';
    this.scale = 1;
    this.follow = true;
    this.queue = Promise.resolve();
    this.latestVersion = 0;
    this.shownVersion = -1;
    this.pendingRestore = [];
    this.token = null;
    this.items = new Set(); // overlay items rendered each frame
    this.activity = null;
    this.modelName = 'Codex';
    this.working = false;

    // Cursor state lives in page coordinates so it scrolls with the site.
    this.cursor = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, placed: false, k: 240, path: null, press: 0, pressTarget: 0 };
    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'agent-cursor';
    this.cursorEl.dataset.shape = 'arrow';
    this.cursorEl.setAttribute('aria-hidden', 'true');
    this.cursorEl.innerHTML = `${CURSOR_SHAPES}<div class="agent-tag"><b></b><span></span></div>`;
    this.tagName = this.cursorEl.querySelector('b');
    this.tagLabel = this.cursorEl.querySelector('.agent-tag span');
    overlay.append(this.cursorEl);
    this.caretEl = document.createElement('div');
    this.caretEl.className = 'agent-caret';
    overlay.append(this.caretEl);
    this.caret = null;

    this.raf = 0;
    this.lastT = 0;
    this.loop = this.loop.bind(this);
    this.resizeObserver = new ResizeObserver(() => { this.layout(); this.kick(); }); this.resizeObserver.observe(stage);
  }

  destroy() { this.project = null; this.cancel(true); this.resizeObserver.disconnect(); cancelAnimationFrame(this.raf); this.raf = 0; this.holder.replaceChildren(); this.overlay.replaceChildren(); }

  // ---------- public API ----------
  setModelName(name) {
    this.modelName = name || 'Codex';
    this.tagName.textContent = this.modelName;
  }

  setWorking(on) {
    this.working = on;
    this.cursorEl.classList.toggle('is-idle', !on);
    if (on && !this.cursor.placed && this.front) this.placeCursorCenter();
    this.kick();
  }

  setActivity(activity) {
    this.activity = activity;
    if (!this.token) this.label(activity?.label || '');
  }

  setFollow(on) {
    this.follow = on;
    this.onFollowChange?.(on);
    if (on && this.cursor.placed) this.scrollToDoc(this.cursor.ty);
  }

  setViewport(v) {
    this.viewport = v;
    this.layout();
    this.kick();
  }

  async openProject(id, { hasSite, version }) {
    this.frozen = false;
    this.cancel(true);
    this.project = id;
    this.page = 'index.html';
    this.latestVersion = version;
    this.shownVersion = -1;
    this.cursor.placed = false;
    this.cursorEl.classList.remove('is-shown');
    for (const f of this.holder.querySelectorAll('iframe')) f.remove();
    this.front = null;
    this.stageEl.classList.toggle('is-empty', !hasSite);
    if (hasSite) await this.enqueue(version, { animate: this.working });
  }

  // Files changed on disk.
  update(version) {
    this.latestVersion = Math.max(this.latestVersion, version);
    // Finish the current action, then continue building from here with the newer files.
    if (this.token) { this.token.rush = true; this.token.supersede = true; }
    return this.enqueue(version, { animate: true });
  }

  reload() {
    return this.enqueue(this.latestVersion, { animate: false, force: true });
  }

  // Rebuild the current page from a blank canvas, with the full playback.
  replay() {
    if (!this.front) return Promise.resolve();
    if (this.token) { this.token.rush = true; this.token.supersede = true; }
    if (!this.follow) this.setFollow(true);
    return this.enqueue(this.latestVersion, { animate: true, force: true, replay: true });
  }

  get hasPage() {
    return !!this.front;
  }

  look(phase) {
    if (phase !== 'start' || !this.front) return;
    const line = document.createElement('div');
    line.className = 'look-scan';
    this.overlay.append(line);
    const m = this.map();
    if (!m) return line.remove();
    line.style.left = `${m.ox}px`;
    line.style.width = `${m.w}px`;
    line.animate([{ transform: `translateY(${m.oy}px)`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { transform: `translateY(${m.oy + m.h}px)`, opacity: 0 }], {
      duration: reducedMotion() ? 1 : 1100, easing: EASE_IN_OUT,
    }).finished.then(() => line.remove(), () => line.remove());
  }

  // ---------- frames ----------
  enqueue(version, opts) {
    this.pendingRender = { version, opts };
    if (this.draining) return this.queue;
    this.draining = true;
    this.queue = (async () => {
      try { while (this.pendingRender && this.project) { const next = this.pendingRender; this.pendingRender = null; await this.refresh(next.version, next.opts); } }
      catch (err) { console.error(err); this.onError?.(err); }
      finally { this.draining = false; }
    })();
    return this.queue;
  }

  async refresh(version, { animate, force, replay = false }) {
    if (!this.project) return;
    if (!force && version < this.latestVersion && animate) return; // a newer save is queued; skip straight to it
    if (!force && version === this.shownVersion) return;
    const project = this.project;
    const url = '/__lucid/frame';
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
    if (project !== this.project) return;
    if (!head?.ok) {
      if (this.page !== 'index.html') { this.page = 'index.html'; this.onPageChange?.(this.page); return this.refresh(version, { animate, force }); }
      this.stageEl.classList.add('is-empty');
      return;
    }
    const back = document.createElement('iframe');
    back.className = 'site-frame is-back';
    back.title = 'Site preview';
    back.src = `${url}${url.includes('?') ? '&' : '?'}ares=${version}`;
    this.holder.append(back);
    const loaded = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 15000);
      back.addEventListener('load', () => { clearTimeout(t); resolve(true); }, { once: true });
    });
    if (project !== this.project || !loaded) { back.remove(); return; }
    let bdoc;
    try { bdoc = back.contentDocument; } catch { bdoc = null; }
    // Markup saved before its stylesheet exists: while Codex is still working, wait a little for the
    // styles so the page is built in its real look rather than as unstyled text.
    if (animate && !replay && this.working && bdoc && this.missingStylesheet(bdoc)) {
      const until = performance.now() + 25000;
      this.setActivity({ kind: 'wait', label: 'Waiting for the stylesheet' });
      while (performance.now() < until && this.working && this.latestVersion === version && project === this.project) await sleep(250);
      if (this.latestVersion > version || project !== this.project) { back.remove(); return; }
    }
    if (bdoc?.fonts) await Promise.race([bdoc.fonts.ready, sleep(1200)]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (project !== this.project) { back.remove(); return; }

    // Settle whatever is still playing. A build that was handed over to a newer save stays as it
    // is: what was not placed yet counts as not there, so the next plan places it with the new files.
    const frozen = this.frozen;
    this.frozen = false;
    this.cancel(!frozen);
    if (frozen) this.pendingRestore = [];

    const old = this.front;
    let plan = null;
    let odoc = null;
    try { odoc = old?.contentDocument; } catch {}
    if (animate && bdoc) {
      try {
        plan = replay
          ? this.plan(document.implementation.createHTMLDocument(''), null, bdoc, back.contentWindow, { budget: 60000 })
          : this.plan(odoc || document.implementation.createHTMLDocument(''), old?.contentWindow || null, bdoc, back.contentWindow);
      } catch (err) {
        console.warn('Diff failed, showing the page without playback', err);
        this.runRestores();
        plan = null;
      }
    }
    if (old && odoc && bdoc && !replay) {
      try { back.contentWindow.scrollTo({ top: old.contentWindow.scrollY, left: 0, behavior: 'instant' }); } catch {}
    }
    back.classList.remove('is-back');
    this.front = back;
    this.attachFrame(back);
    this.stageEl.classList.remove('is-empty');
    this.shownVersion = version;
    if (old && plan?.sweep) {
      // Keep the old render on top; the restyle steps clear it section by section.
      old.classList.add('is-leaving');
      this.leaving = old;
      this.pendingRestore.push(() => { old.remove(); if (this.leaving === old) this.leaving = null; });
    } else if (old) requestAnimationFrame(() => old.remove());
    this.layout();
    this.onReady?.();
    this.onPlayback?.(!!plan?.steps.length);
    if (plan?.steps.length) await this.play(plan);
    this.onPlayback?.(false);
  }

  // A linked same-site stylesheet that failed to load (usually: not written yet).
  missingStylesheet(doc) {
    for (const link of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
      let url;
      try { url = new URL(link.getAttribute('href'), doc.baseURI); } catch { continue; }
      if (url.origin !== location.origin) continue;
      // Chrome attaches an empty sheet when the file 404s.
      try { if (!link.sheet || link.sheet.cssRules.length === 0) return true; } catch { return true; }
    }
    return false;
  }

  attachFrame(frame) {
    let win, doc;
    try { win = frame.contentWindow; doc = frame.contentDocument; } catch { return; }
    if (!doc) return;
    const stopFollow = () => { if (this.follow) this.setFollow(false); };
    const keys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);
    doc.addEventListener('wheel', stopFollow, { passive: true });
    doc.addEventListener('touchmove', stopFollow, { passive: true });
    doc.addEventListener('keydown', (e) => { if (keys.has(e.key)) stopFollow(); });
    win.addEventListener('scroll', () => this.kick(), { passive: true });
    win.addEventListener('resize', () => this.kick());
    doc.addEventListener('click', event => { if (event.target.closest('a,button,input,form')) event.preventDefault(); }, true);
    doc.addEventListener('submit', event => event.preventDefault(), true);
    // Later navigations inside the preview (user clicked a link).
    frame.addEventListener('load', () => {
      if (frame !== this.front) return;
      try {
        const p = frame.contentWindow.location.pathname;
        const prefix = `/p/${this.project}/`;
        if (p.startsWith(prefix)) { this.page = p.slice(prefix.length) || 'index.html'; this.onPageChange?.(this.page); }
      } catch { this.onPageChange?.(null); }
      this.attachFrame(frame);
    }, { once: true });
    try {
      const p = win.location.pathname;
      const prefix = `/p/${this.project}/`;
      if (p.startsWith(prefix)) { this.page = p.slice(prefix.length) || 'index.html'; this.onPageChange?.(this.page); }
    } catch {}
  }

  layout() {
    const sizes = { desktop: 1440, tablet: 820, phone: 390 };
    const want = sizes[this.viewport];
    const box = this.stageEl.getBoundingClientRect();
    const availW = box.width;
    const availH = box.height;
    const hs = this.holder.style;
    if (!want) {
      this.scale = 1;
      hs.width = `${availW}px`;
      hs.height = `${availH}px`;
      hs.transform = '';
      hs.left = '0px';
    } else {
      const gutter = 24;
      const s = Math.max(.05, Math.min(1, (availW - gutter * 2) / want));
      this.scale = s;
      hs.width = `${want}px`;
      hs.height = `${Math.max(100, (availH - gutter * 2) / s)}px`;
      hs.transform = `scale(${s})`;
      hs.left = `${Math.max(gutter, (availW - want * s) / 2)}px`;
    }
    this.holder.dataset.viewport = this.viewport;
  }

  // ---------- coordinates ----------
  map() {
    const f = this.front;
    if (!f) return null;
    let win;
    try { win = f.contentWindow; if (!win.document) return null; } catch { return null; }
    const fr = f.getBoundingClientRect();
    const ov = this.overlay.getBoundingClientRect();
    return { ox: fr.left - ov.left, oy: fr.top - ov.top, s: this.scale, sx: win.scrollX, sy: win.scrollY, w: fr.width, h: fr.height, win };
  }
  toOverlay(x, y, m) {
    return [m.ox + (x - m.sx) * m.s, m.oy + (y - m.sy) * m.s];
  }
  docRect(el, win = this.front?.contentWindow) {
    const r = el.getBoundingClientRect();
    return { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height };
  }
  // Where a still-hidden element will land, measured without ever painting it.
  landing(el) {
    const wasPending = el.hasAttribute('data-ares-pending');
    if (wasPending) el.removeAttribute('data-ares-pending');
    const r = this.docRect(el);
    if (wasPending) el.setAttribute('data-ares-pending', '');
    return r;
  }

  // ---------- planning ----------
  plan(odoc, owin, ndoc, nwin, { budget = BUDGET_MS } = {}) {
    const ops = [];
    const ctx = { owin, nwin, ndoc };
    this.walk(odoc.body || odoc.documentElement, ndoc.body, ops, ctx);
    const vw = nwin.innerWidth, vh = nwin.innerHeight;
    const cs = (el) => nwin.getComputedStyle(el);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const s = cs(el);
      return s.visibility !== 'hidden' && s.display !== 'none';
    };
    const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
    const docY = (el) => el.getBoundingClientRect().top + nwin.scrollY;

    // Drop restyles that are just inherited from a restyled ancestor.
    const styleOps = new Map();
    for (const op of ops) if (op.type === 'style') styleOps.set(op.el, op);
    const keptStyles = [];
    for (const op of styleOps.values()) {
      let p = op.el.parentElement, inherited = false;
      while (p) {
        const po = styleOps.get(p);
        if (po && op.props.every((x) => po.props.includes(x))) { inherited = true; break; }
        p = p.parentElement;
      }
      if (!inherited && visible(op.el)) keptStyles.push(op);
    }

    // What an element looks like when finished, measured before anything is hidden.
    const parentBg = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const c = parseColor(cs(p).backgroundColor);
        if (c && c.a > 0.05) return cs(p).backgroundColor;
      }
      return 'rgb(255, 255, 255)';
    };
    const looks = (el) => {
      const s = cs(el);
      const bg = parseColor(s.backgroundColor);
      const fill = bg && bg.a > 0.05 ? s.backgroundColor : null;
      const image = s.backgroundImage && s.backgroundImage !== 'none' ? s.backgroundImage : null;
      const border = parseFloat(s.borderTopWidth) > 0 && (parseColor(s.borderTopColor)?.a ?? 0) > 0.05;
      const shadow = s.boxShadow && s.boxShadow !== 'none' ? s.boxShadow : null;
      const radius = parseFloat(s.borderTopLeftRadius) || 0;
      const visual = !!(fill || image || border || shadow);
      const gray = luminance(parentBg(el)) > 0.5 ? 'rgb(206, 206, 206)' : 'rgb(62, 62, 62)';
      return { fill, image, border, shadow, radius, visual, gray };
    };
    const inlineish = (el) => /^inline/.test(cs(el).display) || el.tagName === 'BR';
    const textNodesOf = (el) => {
      const out = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) { if (c.data.length) out.push({ node: c, full: c.data }); }
          else if (c.nodeType === 1 && !NO_TYPE.has(c.tagName) && !isSvg(c)) walk(c);
        }
      };
      walk(el);
      return out;
    };
    const isTextBlock = (el) => {
      if (NO_TYPE.has(el.tagName) || isSvg(el)) return false;
      if (!(el.textContent || '').trim()) return false;
      for (const c of el.children) if (!SKIP.has(c.tagName) && !inlineish(c)) return false;
      return true;
    };

    // Turn each new subtree into the steps a person would take, parent before children.
    const pending = [];
    const groups = [];
    const build = (el, out, depth) => {
      if (isSvg(el) && el.tagName.toLowerCase() !== 'svg') return;
      if (!visible(el)) {
        if (cs(el).display === 'contents') for (const c of kids(el)) build(c, out, depth);
        return;
      }
      pending.push(el);
      const look = looks(el);
      if (isMedia(el)) { out.push({ kind: 'image', el, look }); return; }
      if (isTextBlock(el)) {
        if (look.visual) out.push({ kind: 'rect', el, look, keepChildren: true });
        out.push({ kind: 'text', el, nodes: textNodesOf(el) });
        return;
      }
      const ch = kids(el).filter(visible);
      out.push(look.visual ? { kind: 'rect', el, look } : { kind: 'reveal', el });
      const reps = this.repeatedKids(ch, vw * vh);
      let stamped = false;
      for (const c of ch) {
        if (reps && reps.includes(c)) {
          if (!stamped) { stamped = true; pending.push(...reps); out.push({ kind: 'stamp', items: reps }); }
          continue;
        }
        if (depth < 14) build(c, out, depth + 1);
      }
    };
    const addOps = ops.filter((o) => o.type === 'add');
    const byParent = new Map();
    for (const op of addOps) {
      const p = op.el.parentElement;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(op.el);
    }
    const stamped = new Set();
    for (const list of byParent.values()) {
      const reps = this.repeatedKids(list.filter(visible), vw * vh);
      if (!reps) continue;
      for (const e of reps) stamped.add(e);
      pending.push(...reps);
      groups.push({ y: docY(reps[0]), steps: [{ kind: 'stamp', items: reps }] });
    }
    for (const op of addOps) {
      if (stamped.has(op.el)) continue;
      const out = [];
      const y = docY(op.el);
      build(op.el, out, 0);
      if (out.length) groups.push({ y, steps: out });
    }

    const steps = [];
    // Deleted elements stay on the page as copies until the cursor removes them.
    const clones = [];
    for (const r of ops.filter((o) => o.type === 'remove').slice(0, 30)) {
      if (!r.newParent) continue;
      const clone = ndoc.importNode(r.oldEl, true);
      clone.setAttribute('data-ares-ghost', '');
      clones.push({ clone, parent: r.newParent, before: r.newBefore, y: r.rect.y });
    }
    if (clones.length) steps.push({ kind: 'delete', clones });

    for (const o of ops) if (o.type === 'text' && visible(o.el)) groups.push({ y: docY(o.el), steps: [{ kind: 'retype', el: o.el, oldText: o.oldText }] });
    keptStyles.sort((a, b) => area(b.el) - area(a.el));
    // A new stylesheet restyles most of the page: clear the old look section by section.
    const sweep = !!owin && keptStyles.length >= 12;
    let flashStyles = [];
    if (sweep) {
      const blocks = [];
      for (const o of keptStyles) {
        const r = o.el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh || r.width * r.height < 1500) continue;
        if (blocks.some((b) => b.contains(o.el) || o.el.contains(b))) continue;
        blocks.push(o.el);
        if (blocks.length >= 7) break;
      }
      blocks.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      steps.push({ kind: 'sweep', blocks });
    } else {
      for (const o of keptStyles.slice(0, 8)) groups.push({ y: docY(o.el), steps: [{ kind: 'restyle', el: o.el, op: o }] });
      flashStyles = keptStyles.slice(8, 60).map((o) => o.el);
    }
    groups.sort((a, b) => a.y - b.y);
    for (const g of groups) steps.push(...g.steps);
    if (flashStyles.length) steps.push({ kind: 'flash', els: flashStyles });

    // ----- prepare the new page: hide what is new, keep old text and old styles until visited -----
    const restores = [];
    const style = ndoc.createElement('style');
    style.setAttribute('data-ares', '');
    style.textContent = '[data-ares-pending]{display:none!important}';
    ndoc.head?.append(style);
    restores.push(() => style.remove());
    for (const el of pending) {
      el.setAttribute('data-ares-pending', '');
      restores.push(() => el.removeAttribute('data-ares-pending'));
    }
    for (const s of steps) {
      if (s.kind === 'text') {
        for (const n of s.nodes) n.node.data = '';
        restores.push(() => { for (const n of s.nodes) n.node.data = n.full; });
      }
      if (s.kind === 'retype') {
        s.nodes = [];
        for (const c of s.el.childNodes) if (c.nodeType === 3 && c.data.trim()) s.nodes.push({ node: c, full: c.data });
        s.nodes.forEach((n, i) => { n.node.data = i === 0 ? s.oldText : ''; });
        restores.push(() => { for (const n of s.nodes) n.node.data = n.full; });
      }
      if (s.kind === 'restyle') {
        const { from, to } = s.op;
        if (from && Object.keys(from).length) {
          try {
            const anim = s.el.animate([from, to], { duration: 900, easing: EASE_IN_OUT, fill: 'both' });
            anim.pause();
            anim.currentTime = 0;
            s.morph = anim;
            restores.push(() => anim.cancel());
          } catch {}
        }
      }
      if (s.kind === 'delete') {
        for (const c of s.clones) {
          try { c.parent.insertBefore(c.clone, c.before && c.before.parentNode === c.parent ? c.before : null); } catch { continue; }
          restores.push(() => c.clone.remove());
        }
      }
    }
    this.pendingRestore = restores;

    // Estimate how long a person would take, then compress to the budget.
    const chars = (nodes) => nodes.reduce((a, n) => a + n.full.trim().length, 0);
    let est = 0;
    for (const s of steps) {
      if (s.kind === 'text') est += 750 + this.typingMs(chars(s.nodes), false);
      else if (s.kind === 'retype') est += 1200 + this.typingMs(chars(s.nodes), false);
      else if (s.kind === 'rect') est += 1150 + (s.look.fill || s.look.image ? 700 : 0) + (s.look.radius ? 750 : 0) + (s.look.shadow ? 320 : 0);
      else if (s.kind === 'image') est += 1900 + (s.look.radius ? 750 : 0);
      else if (s.kind === 'stamp') est += 1600;
      else if (s.kind === 'restyle') est += 1600;
      else if (s.kind === 'sweep') est += 750 * s.blocks.length + 400;
      else if (s.kind === 'delete') est += 750 * Math.min(4, s.clones.length) + 300;
      else if (s.kind === 'flash') est += 400;
    }
    return { steps, sweep, speed: Math.max(1, est / budget) };
  }

  walk(o, n, ops, ctx) {
    const oc = o ? kids(o).filter((c) => !c.hasAttribute('data-ares-pending')) : [];
    const nc = kids(n);
    const pairs = matchChildren(oc, nc);
    const mo = new Set(pairs.map((p) => p[0]));
    const mn = new Set(pairs.map((p) => p[1]));
    nc.forEach((el, j) => { if (!mn.has(j)) ops.push({ type: 'add', el }); });
    if (ctx.owin) {
      // Where a removed element sat in the new page: before the next surviving sibling.
      const newOf = new Map(pairs.map(([i, j]) => [i, nc[j]]));
      const nextKept = (i) => {
        for (let k = i + 1; k < oc.length; k++) if (newOf.has(k)) return newOf.get(k);
        return null;
      };
      oc.forEach((el, i) => {
        if (mo.has(i)) return;
        const r = el.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) ops.push({ type: 'remove', oldEl: el, newParent: n, newBefore: nextKept(i), rect: { x: r.left + ctx.owin.scrollX, y: r.top + ctx.owin.scrollY, w: r.width, h: r.height } });
      });
    }
    for (const [i, j] of pairs) this.compare(oc[i], nc[j], ops, ctx);
  }

  compare(o, n, ops, ctx) {
    if (isSvg(n)) {
      if (n.tagName.toLowerCase() === 'svg' && o.outerHTML !== n.outerHTML) ops.push({ type: 'style', el: n, props: ['graphic'], details: [{ label: 'graphic' }] });
      return;
    }
    const before = ownText(o);
    if (before !== ownText(n)) ops.push({ type: 'text', el: n, oldText: before });
    else if (ctx.owin) {
      const change = this.styleChanges(o, n, ctx);
      if (change.props.length) ops.push({ type: 'style', el: n, ...change });
    }
    this.walk(o, n, ops, ctx);
  }

  // What changed, readable details for the label, and old/new values to tween.
  styleChanges(o, n, ctx) {
    const a = ctx.owin.getComputedStyle(o), b = ctx.nwin.getComputedStyle(n);
    const props = new Set();
    const details = [];
    const seen = new Set();
    for (const k in STYLE_PROPS) {
      if (a[k] === b[k]) continue;
      const label = STYLE_PROPS[k];
      props.add(label);
      if (seen.has(label)) continue;
      seen.add(label);
      if (COLOR_PROPS.has(k)) details.push({ label, kind: 'color', from: a[k], to: b[k] });
      else if (NUM_PROPS[k]) details.push({ label, kind: 'num', from: fmtNum(a[k]), to: fmtNum(b[k]) });
      else if (k === 'fontFamily') details.push({ label, kind: 'text', from: firstFamily(a[k]), to: firstFamily(b[k]) });
      else details.push({ label });
    }
    if ((o.getAttribute('src') || '') !== (n.getAttribute('src') || '')) { props.add('source'); details.push({ label: 'new image' }); }
    if (!n.firstElementChild) {
      const ra = o.getBoundingClientRect(), rb = n.getBoundingClientRect();
      if (Math.abs(ra.width - rb.width) > 2 || Math.abs(ra.height - rb.height) > 2) props.add('size');
    }
    const from = {}, to = {};
    for (const k of MORPH) if (a[k] !== b[k] && a[k] && b[k]) { from[k] = a[k]; to[k] = b[k]; }
    return { props: [...props], details, from, to };
  }

  // The largest group of small, similar siblings (same tag and classes), if there are enough.
  repeatedKids(ch, viewportArea) {
    if (ch.length < 8) return null;
    const groups = new Map();
    for (const c of ch) {
      const key = c.tagName + '|' + (c.getAttribute('class') || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    let best = null;
    for (const g of groups.values()) if (!best || g.length > best.length) best = g;
    if (!best || best.length < 8) return null;
    const small = best.every((c) => {
      const r = c.getBoundingClientRect();
      return r.width * r.height < viewportArea * 0.04 && (c.textContent || '').trim().length <= 24;
    });
    return small ? best : null;
  }

  // ---------- playback ----------
  cancel(finish) {
    if (this.token) this.token.cancelled = true;
    this.token = null;
    if (finish) this.runRestores();
    for (const it of [...this.items]) this.removeItem(it);
    this.caret = null;
    this.caretEl.classList.remove('is-on');
    this.pressCursor(false);
    this.shape('arrow');
    this.label(this.activity?.label || '');
  }

  runRestores() {
    const list = this.pendingRestore;
    this.pendingRestore = [];
    for (const r of list) { try { r(); } catch {} }
  }

  async play(plan) {
    const token = { cancelled: false, rush: false, rushAt: 0, base: plan.speed, reduced: reducedMotion() };
    this.token = token;
    if (token.reduced) { this.runRestores(); this.token = null; this.cursorEl.classList.remove('is-shown'); return; }
    if (!token.reduced) {
      this.cursorEl.classList.add('is-shown');
      if (!this.cursor.placed) this.placeCursorCenter();
    }
    try {
      for (const step of plan.steps) {
        if (!this.alive(token) || !this.front) return;
        if (token.supersede && !token.reduced) { token.handedOver = true; break; }
        if (token.reduced) await this.stepGentle(step, token);
        else await this[`step_${step.kind}`](step, token);
      }
    } finally {
      if (this.token === token) {
        if (token.handedOver) this.frozen = true;
        else {
          this.runRestores();
          // Inline style edits are undone property by property; drop the empty attributes they leave.
          try { for (const el of this.front.contentDocument.querySelectorAll('[style=""]')) el.removeAttribute('style'); } catch {}
        }
        this.token = null;
        this.caret = null;
        this.caretEl.classList.remove('is-on');
        this.pressCursor(false);
        this.shape('arrow');
        this.label(this.activity?.label || '');
        this.kick();
      }
    }
  }

  speed(token) {
    return token.base * (token.rush ? 2 : 1);
  }
  wait(ms, token) {
    return sleep(ms / this.speed(token));
  }
  alive(token) {
    return !token.cancelled && this.token === token;
  }
  win() {
    return this.front.contentWindow;
  }

  // Reduced motion: no cursor travel, typing or drags; things simply fade in.
  async stepGentle(s, token) {
    const fade = (el) => { try { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: EASE_OUT_STRONG }); } catch {} };
    if (s.el) s.el.removeAttribute('data-ares-pending');
    for (const it of s.items || []) it.removeAttribute('data-ares-pending');
    if (s.nodes) for (const n of s.nodes) n.node.data = n.full;
    if (s.morph) s.morph.cancel();
    if (s.clones) for (const c of s.clones) c.clone.remove();
    if (s.kind === 'sweep' && this.leaving) { this.leaving.remove(); this.leaving = null; }
    if (s.el && s.kind !== 'reveal') fade(s.el);
    await this.wait(40, token);
  }

  // Siblings and ancestors' siblings that can move when `el` changes size. They are disjoint
  // subtrees, so no element is animated twice.
  followersOf(el) {
    const out = [];
    let node = el;
    for (let depth = 0; node && depth < 6; depth++) {
      const p = node.parentElement;
      if (!p || p === el.ownerDocument.documentElement) break;
      for (const s of p.children) if (s !== node && !SKIP.has(s.tagName) && !s.hasAttribute('data-ares-pending')) out.push(s);
      node = p;
    }
    return out.slice(0, 80);
  }
  rectsOf(list) {
    return list.map((f) => f.getBoundingClientRect());
  }
  // Animate the things that just moved from where they were to where they are (FLIP).
  slideFrom(list, before, duration) {
    list.forEach((f, i) => {
      const a = before[i], b = f.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      try { f.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration, easing: EASE_IN_OUT, composite: 'add' }); } catch {}
    });
  }
  saveStyle(el) {
    const saved = el.getAttribute('style') || null;
    const restore = () => { if (saved == null) el.removeAttribute('style'); else el.setAttribute('style', saved); };
    this.pendingRestore.push(restore);
    return restore;
  }

  // ---------- steps ----------
  async step_reveal(s) {
    s.el.removeAttribute('data-ares-pending');
  }

  // Draw a box with a crosshair; the page makes room as it grows. Then fill, round, shadow.
  async step_rect(s, token) {
    const el = s.el;
    if (!el.isConnected) return;
    const restoreStyle = this.saveStyle(el);
    let r = this.landing(el);
    await this.bringRectIntoView(r, token);
    if (!this.alive(token)) return;
    r = this.landing(el);
    this.label(`Drawing ${tagWord(el)}`);
    this.shape('cross');
    await this.moveCursor(r.x, r.y, token);
    if (!this.alive(token)) return;
    // Press: the box starts here, and the page starts making room for it.
    this.pressCursor(true, r.x, r.y);
    const followers = this.followersOf(el);
    const before = this.rectsOf(followers);
    if (s.look.radius) el.style.setProperty('border-radius', '0px', 'important');
    if (s.look.shadow) el.style.setProperty('box-shadow', 'none', 'important');
    el.style.setProperty('clip-path', 'inset(0 100% 100% 0)');
    el.removeAttribute('data-ares-pending');
    r = this.docRect(el);
    const box = this.addItem({ kind: 'drag', x0: r.x, y0: r.y });
    const veil = (s.look.fill || s.look.image) ? this.addItem({ kind: 'veil', color: s.look.gray, drag: box }) : null;
    const guides = this.guidesFor(el);
    const dragMs = clamp(260 + Math.sqrt(r.w * r.h) * 0.5, 320, 760);
    this.slideFrom(followers, before, dragMs / this.speed(token));
    let done = false;
    this.moveCursor(r.x + r.w, r.y + r.h, token, { dur: dragMs, curve: 0.04 }).then(() => { done = true; });
    while (!done && this.alive(token)) {
      const fx = clamp((this.cursor.x - r.x) / Math.max(1, r.w), 0, 1);
      const fy = clamp((this.cursor.y - r.y) / Math.max(1, r.h), 0, 1);
      el.style.setProperty('clip-path', `inset(0 ${((1 - fx) * 100).toFixed(2)}% ${((1 - fy) * 100).toFixed(2)}% 0)`);
      await frame();
    }
    el.style.removeProperty('clip-path');
    this.pressCursor(false, this.cursor.x, this.cursor.y);
    for (const g of guides) this.fadeItem(g, 240);
    if (!this.alive(token)) return;
    box.snapFrom = this.dragRect(box);
    box.snapAt = performance.now();
    box.kind = 'box';
    box.el = el;
    box.handles = true;
    box.node.classList.remove('is-drag');
    box.html = `<span class="num">${Math.round(r.w)} × ${Math.round(r.h)}</span>`;
    if (veil) { veil.drag = null; veil.el = el; }
    this.shape('arrow');
    await this.wait(160, token);

    // Fill: the grey placeholder takes the real color or image.
    if (veil && this.alive(token)) {
      const cx = r.x + Math.min(r.w * 0.5, 120), cy = r.y + Math.min(r.h * 0.5, 40);
      this.label('Setting fill');
      await this.moveCursor(cx, cy, token, { maxDur: 380 });
      this.pressCursor(true, cx, cy);
      await this.wait(70, token);
      this.pressCursor(false);
      box.html = s.look.fill && !s.look.image
        ? `Fill <i class="sw" style="background:${esc(s.look.fill)}"></i><span class="num">${esc(hex(s.look.fill))}</span>`
        : 'Fill <span class="num">image</span>';
      this.fadeItem(veil, 360 / this.speed(token));
      await this.wait(420, token);
    }
    // Corner radius: drag the radius handle in from the corner.
    if (s.look.radius && this.alive(token)) await this.dragRadius(el, box, s.look.radius, token);
    if (s.look.shadow && this.alive(token)) {
      el.style.removeProperty('box-shadow');
      try { el.animate([{ boxShadow: 'none' }, { boxShadow: s.look.shadow }], { duration: 320 / this.speed(token), easing: EASE_OUT_STRONG }); } catch {}
      box.html = 'Shadow';
      await this.wait(300, token);
    }
    restoreStyle();
    await this.wait(120, token);
    this.trail(box);
  }

  async dragRadius(el, box, radius, token) {
    const r = this.docRect(el);
    const inset = 9;
    const hx = r.x + inset, hy = r.y + inset;
    const handle = this.addItem({ kind: 'radius', el, offset: inset });
    this.label('Corner radius');
    await this.moveCursor(hx, hy, token, { maxDur: 420 });
    if (!this.alive(token)) return;
    this.pressCursor(true);
    const travel = clamp(radius * 0.7, 6, Math.max(6, Math.min(r.w, r.h) * 0.3));
    let done = false;
    this.moveCursor(hx + travel, hy + travel, token, { dur: clamp(260 + radius * 6, 300, 560), curve: 0.02 }).then(() => { done = true; });
    while (!done && this.alive(token)) {
      const p = clamp((this.cursor.x - hx) / travel, 0, 1);
      const v = Math.round(radius * p);
      el.style.setProperty('border-radius', `${v}px`, 'important');
      handle.offset = inset + travel * p;
      box.html = `Radius <span class="num">${v}</span>`;
      await frame();
    }
    el.style.removeProperty('border-radius');
    box.html = `Radius <span class="num">${Math.round(radius)}</span>`;
    this.pressCursor(false);
    this.fadeItem(handle, 200);
    await this.wait(160, token);
  }

  // Click a text cursor into place and type, letter by letter. The box grows with the words.
  async step_text(s, token) {
    const el = s.el;
    if (!el.isConnected) return;
    if (el.hasAttribute('data-ares-pending')) {
      await this.bringRectIntoView(this.landing(el), token);
      if (!this.alive(token)) return;
      const followers = this.followersOf(el);
      const before = this.rectsOf(followers);
      el.removeAttribute('data-ares-pending');
      this.slideFrom(followers, before, 240 / this.speed(token));
    } else {
      await this.bringIntoView(el, token);
    }
    if (!this.alive(token)) return;
    await this.typeInto(el, s.nodes, 0, token, { label: `Typing ${tagWord(el)}` });
  }

  // Where text starts inside an element (honours padding and alignment).
  textStart(el) {
    const win = this.win();
    const cs = win.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0;
    const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.3;
    let x = r.left + pl;
    if (cs.textAlign === 'center') x = r.left + pl + (r.width - pl - pr) / 2;
    else if (cs.textAlign === 'right' || cs.textAlign === 'end') x = r.right - pr;
    if (/flex|grid/.test(cs.display) && cs.justifyContent === 'center') x = r.left + r.width / 2;
    return { x: x + win.scrollX, y: r.top + pt + win.scrollY, h: lh };
  }

  typingMs(chars, big) {
    return clamp(chars * (big ? 46 : 21), 220, big ? 2600 : 3400);
  }

  caretAt(node, offset, fallback) {
    const win = this.win();
    try {
      const range = node.ownerDocument.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const rects = range.getClientRects();
      const cr = rects[rects.length - 1] || range.getBoundingClientRect();
      if (cr && (cr.height || cr.top)) return { x: cr.left + win.scrollX, y: cr.top + win.scrollY, h: cr.height || fallback.h };
    } catch {}
    return fallback;
  }

  async typeInto(el, nodes, startAt, token, { label }) {
    const win = this.win();
    const fontSize = parseFloat(win.getComputedStyle(el).fontSize) || 16;
    const big = /^H[1-6]$/.test(el.tagName) || fontSize >= 26;
    const chars = [];
    for (const n of nodes) for (let i = 0; i < n.full.length; i++) chars.push({ n, i, c: n.full[i] });
    const setShown = (count) => {
      let left = count;
      for (const n of nodes) { const k = Math.min(n.full.length, left); n.node.data = n.full.slice(0, k); left -= k; }
    };
    setShown(startAt);
    // Click to place the text cursor: at the start, or after the words already there.
    const start0 = this.textStart(el);
    const p0 = startAt ? this.caretAt(chars[startAt - 1].n.node, chars[startAt - 1].i + 1, start0) : start0;
    this.label(label);
    this.shape('text');
    await this.moveCursor(p0.x + 2, p0.y + p0.h * 0.5, token, { maxDur: 520 });
    if (!this.alive(token)) return;
    this.pressCursor(true, p0.x, p0.y + p0.h * 0.5);
    await this.wait(60, token);
    this.pressCursor(false);
    // Let go of the mouse: the pointer drifts just off the text while the keys do the work.
    this.cursor.path?.resolve();
    this.cursor.path = null;
    this.cursor.tx = p0.x - 12;
    this.cursor.ty = p0.y + p0.h + 14;
    this.cursor.k = 160;
    this.caret = { x: p0.x, y: p0.y, h: p0.h, blink: true };
    const tbox = this.addItem({ kind: 'tbox', el });
    this.kick();
    await this.wait(280, token);

    // A human rhythm: quicker inside words, a beat after spaces and punctuation.
    let t = 0;
    const times = chars.map(({ c }) => {
      let d = 1;
      if (/\s/.test(c)) d = 1.5;
      else if (/[.,!?;:]/.test(c)) d = 2.6;
      t += d * (0.75 + Math.random() * 0.5);
      return t;
    });
    const visibleChars = chars.slice(startAt).filter((x) => x.c.trim()).length || 1;
    const offset = startAt ? times[startAt - 1] : 0;
    const scale = this.typingMs(visibleChars, big) / Math.max(1, t - offset);
    let shown = startAt;
    const followers = this.followersOf(el);
    let fRects = this.rectsOf(followers);
    let height = el.getBoundingClientRect().height;
    const begin = performance.now();
    this.caret.blink = false;
    while (this.alive(token) && shown < chars.length) {
      await frame();
      if (!this.alive(token)) break;
      const elapsed = (performance.now() - begin) * this.speed(token);
      let want = shown;
      while (want < chars.length && (times[want] - offset) * scale <= elapsed) want++;
      if (want === shown) continue;
      shown = want;
      setShown(shown);
      const last = chars[shown - 1];
      this.caret = this.caretAt(last.n.node, last.i + 1, this.caret);
      // A new line pushes what follows down; let it slide instead of jump.
      const h = el.getBoundingClientRect().height;
      if (Math.abs(h - height) > 0.5) {
        this.slideFrom(followers, fRects, 160 / this.speed(token));
        fRects = this.rectsOf(followers);
        height = h;
      }
      this.kick();
    }
    for (const n of nodes) n.node.data = n.full;
    this.caret = null;
    this.fadeItem(tbox, 280);
    this.shape('arrow');
    this.kick();
    await this.wait(120, token);
  }

  // Drop an image in small, then scale it up from its corner. The page makes room as it grows.
  async step_image(s, token) {
    const el = s.el;
    if (!el.isConnected) return;
    const restoreStyle = this.saveStyle(el);
    let r = this.landing(el);
    await this.bringRectIntoView(r, token);
    if (!this.alive(token)) return;
    r = this.landing(el);
    const s0 = clamp(96 / Math.max(1, r.w), 0.06, 0.5);
    this.label(`Placing ${tagWord(el)}`);
    this.shape('arrow');
    await this.moveCursor(r.x + 14, r.y + 14, token);
    if (!this.alive(token)) return;
    // Drop it in small; the page starts making room and keeps going while it is scaled up.
    const dragMs = clamp(320 + Math.sqrt(r.w * r.h) * 0.45, 420, 900);
    const followers = this.followersOf(el);
    const before = this.rectsOf(followers);
    this.pressCursor(true, r.x + 14, r.y + 14);
    el.style.setProperty('transform-origin', '0 0');
    el.style.setProperty('transform', `scale(${s0})`);
    if (s.look.radius) el.style.setProperty('border-radius', '0px', 'important');
    el.removeAttribute('data-ares-pending');
    this.slideFrom(followers, before, (dragMs + 650) / this.speed(token));
    try { el.animate([{ opacity: 0, scale: '0.96' }, { opacity: 1, scale: '1' }], { duration: 180, easing: EASE_OUT_STRONG }); } catch {}
    await this.wait(90, token);
    this.pressCursor(false);
    const box = this.addItem({ kind: 'box', el, handles: true, html: `<span class="num">${Math.round(r.w * s0)} × ${Math.round(r.h * s0)}</span>` });
    await this.wait(160, token);
    // Grab the corner and scale up.
    this.label('Resizing');
    this.shape('resize');
    await this.moveCursor(r.x + r.w * s0, r.y + r.h * s0, token, { maxDur: 360 });
    if (!this.alive(token)) return;
    this.pressCursor(true);
    let done = false;
    this.moveCursor(r.x + r.w, r.y + r.h, token, { dur: dragMs, curve: 0.03 }).then(() => { done = true; });
    while (!done && this.alive(token)) {
      const sc = clamp((this.cursor.x - r.x) / Math.max(1, r.w), s0, 1);
      el.style.setProperty('transform', `scale(${sc.toFixed(4)})`);
      box.html = `<span class="num">${Math.round(r.w * sc)} × ${Math.round(r.h * sc)}</span>`;
      await frame();
    }
    el.style.removeProperty('transform');
    el.style.removeProperty('transform-origin');
    this.pressCursor(false);
    this.shape('arrow');
    if (!this.alive(token)) return;
    if (s.look.radius) await this.dragRadius(el, box, s.look.radius, token);
    restoreStyle();
    await this.wait(120, token);
    this.trail(box);
  }

  // Many small look-alike items: placed one by one, sweeping across them.
  async step_stamp(s, token) {
    const items = [...s.items];
    if (!items.length || !this.front) return;
    const win = this.win();
    const parent = items[0].parentElement;
    const followers = parent ? this.followersOf(parent) : [];
    const before = this.rectsOf(followers);
    for (const it of items) it.removeAttribute('data-ares-pending');
    const rects = new Map(items.map((it) => [it, it.getBoundingClientRect()]));
    const original = new Map(items.map((it) => [it, it.getAttribute('style') || null]));
    const restoreItem = (it) => { const v = original.get(it); if (v == null) it.removeAttribute('style'); else it.setAttribute('style', v); };
    for (const it of items) it.style.visibility = 'hidden';
    this.pendingRestore.push(() => { for (const it of items) restoreItem(it); });
    this.slideFrom(followers, before, 320 / this.speed(token));
    if (parent) await this.bringIntoView(parent, token);
    const r0 = (parent || items[0]).getBoundingClientRect();
    const columns = r0.width > r0.height * 1.4;
    items.sort((a, b) => {
      const ra = rects.get(a), rb = rects.get(b);
      return columns ? ra.left - rb.left || ra.top - rb.top : ra.top - rb.top || ra.left - rb.left;
    });
    this.label(`Placing ${items.length} ${tagWord(items[0])}s`);
    const per = clamp(1300 / items.length, 10, 80);
    const hop = Math.max(1, Math.round(items.length / 14));
    this.cursor.path?.resolve();
    this.cursor.path = null;
    let i = 0;
    for (const it of items) {
      if (!this.alive(token)) return;
      restoreItem(it);
      try { it.animate([{ opacity: 0, scale: '0.86' }, { opacity: 1, scale: '1' }], { duration: 200, easing: EASE_OUT_STRONG }); } catch {}
      if (i % hop === 0) {
        const r = it.getBoundingClientRect();
        this.cursor.tx = r.left + r.width * 0.6 + win.scrollX;
        this.cursor.ty = r.top + r.height * 0.7 + win.scrollY;
        this.cursor.k = 700 * Math.min(4, this.speed(token)) ** 2;
        this.kick();
      }
      i++;
      await this.wait(per, token);
    }
  }

  async step_retype(s, token) {
    const el = s.el;
    await this.bringIntoView(el, token);
    if (!this.alive(token) || !s.nodes.length) return;
    const full = s.nodes.map((n) => n.full).join('');
    const norm = full.replace(/\s+/g, ' ').trim();
    const old = s.oldText || '';
    const appendOnly = !!old && norm.startsWith(old);
    if (!appendOnly && old) {
      // Select the old wording by dragging across it, then delete it.
      const r = this.docRect(el);
      const y = r.y + Math.min(r.h, 40) * 0.6;
      this.label(`Rewriting ${tagWord(el)}`);
      this.shape('text');
      await this.moveCursor(r.x, y, token);
      if (!this.alive(token)) return;
      this.pressCursor(true, r.x, y);
      const sel = this.addItem({ kind: 'sel', x0: r.x, y: r.y, h: r.h });
      await this.moveCursor(r.x + r.w, y, token, { dur: clamp(r.w * 0.7, 220, 520), curve: 0.01 });
      this.pressCursor(false);
      await this.wait(160, token);
      for (const n of s.nodes) n.node.data = '';
      this.fadeItem(sel, 120);
      await this.wait(100, token);
    }
    if (!this.alive(token)) return;
    // Appending: continue after the words already there.
    const startAt = appendOnly ? rawIndexAfter(full.replace(/^\s+/, ''), old.length) + (full.length - full.replace(/^\s+/, '').length) : 0;
    await this.typeInto(el, s.nodes, clamp(startAt, 0, full.length), token, { label: `Typing ${tagWord(el)}` });
  }

  // Restyle: select the element and change it in place. Size changes are dragged from the corner,
  // radius from the radius handle, colors are clicked; the element tweens from old to new.
  async step_restyle(s, token) {
    const el = s.el;
    await this.bringIntoView(el, token);
    if (!this.alive(token)) return;
    const r = this.docRect(el);
    const labels = s.op.props || [];
    const sizey = labels.some((p) => SIZE_LABELS.has(p));
    const radiusOnly = labels.length === 1 && labels[0] === 'radius';
    this.label(`Restyling ${tagWord(el)}`);
    const box = this.addItem({ kind: 'box', el, handles: true, html: this.detailHtml(s.op.details) });
    const play = () => { if (s.morph) { s.morph.playbackRate = this.speed(token); s.morph.play(); } };
    if (radiusOnly) {
      const handle = this.addItem({ kind: 'radius', el, offset: 9 });
      await this.moveCursor(r.x + 9, r.y + 9, token);
      if (!this.alive(token)) return;
      this.pressCursor(true);
      play();
      const target = parseFloat(this.win().getComputedStyle(el).borderTopLeftRadius) || 0;
      await this.moveCursor(r.x + 9 + target * 0.6, r.y + 9 + target * 0.6, token, { dur: 700 });
      this.fadeItem(handle, 200);
    } else if (sizey) {
      this.shape('resize');
      await this.moveCursor(r.x + r.w, r.y + r.h, token);
      if (!this.alive(token)) return;
      this.pressCursor(true);
      play();
      // Ride the corner while the element changes size.
      const end = performance.now() + 950 / this.speed(token);
      this.cursor.path?.resolve();
      this.cursor.path = null;
      while (performance.now() < end && this.alive(token)) {
        const er = el.getBoundingClientRect();
        this.cursor.tx = er.right + this.win().scrollX;
        this.cursor.ty = er.bottom + this.win().scrollY;
        this.cursor.k = 900;
        this.kick();
        await frame();
      }
    } else {
      const tx = r.x + Math.min(r.w * 0.5, 160), ty = r.y + Math.min(r.h * 0.5, 60);
      await this.moveCursor(tx, ty, token);
      if (!this.alive(token)) return;
      this.pressCursor(true, tx, ty);
      await this.wait(80, token);
      this.pressCursor(false);
      play();
    }
    if (s.morph) {
      await Promise.race([s.morph.finished.catch(() => {}), sleep(1400)]);
      s.morph.cancel();
    } else await this.wait(500, token);
    this.pressCursor(false);
    this.shape('arrow');
    await this.wait(240, token);
    this.trail(box);
  }

  detailHtml(details = []) {
    const parts = [];
    for (const d of details.slice(0, 2)) {
      if (d.kind === 'color') parts.push(`${esc(d.label)} <i class="sw" style="background:${esc(d.from)}"></i>→<i class="sw" style="background:${esc(d.to)}"></i>`);
      else if (d.kind === 'num') parts.push(`${esc(d.label)} <span class="num">${esc(d.from)} → ${esc(d.to)}</span>`);
      else if (d.kind === 'text') parts.push(`${esc(d.to)}`);
      else parts.push(esc(d.label));
    }
    return parts.join('  ·  ') || 'restyled';
  }

  // A new stylesheet: select each section in view and apply the new look to it, top to bottom.
  async step_sweep(s, token) {
    const old = this.leaving;
    if (!old || !this.front) return;
    const win = this.win();
    const vh = win.innerHeight, sy = win.scrollY, sx = win.scrollX;
    let cut = 0;
    const cutTo = async (y) => {
      const from = cut;
      const dur = 320 / this.speed(token);
      const t0 = performance.now();
      while (this.alive(token)) {
        const u = Math.min(1, (performance.now() - t0) / dur);
        cut = from + (y - from) * ease(u);
        old.style.clipPath = `inset(${cut}px 0 0 0)`;
        if (u >= 1) break;
        await frame();
      }
    };
    for (const el of s.blocks) {
      if (!this.alive(token)) return;
      const r = el.getBoundingClientRect();
      const px = sx + r.left + Math.min(r.width * 0.3, 160), py = sy + Math.max(r.top, 0) + 18;
      this.label(`Styling ${tagWord(el)}`);
      await this.moveCursor(px, py, token, { maxDur: 520 });
      this.pressCursor(true, px, py);
      const box = this.addItem({ kind: 'box', el, handles: true, html: `${esc(tagWord(el))}  <span class="num">${Math.round(r.width)} × ${Math.round(r.height)}</span>` });
      await this.wait(60, token);
      this.pressCursor(false);
      await cutTo(clamp(r.bottom, cut, vh));
      await this.wait(200, token);
      this.trail(box);
    }
    if (this.alive(token)) await cutTo(vh);
    old.remove();
    if (this.leaving === old) this.leaving = null;
  }

  // Deleted elements: select, press delete, and the page closes the gap.
  async step_delete(s, token) {
    const list = s.clones.filter((c) => c.clone.isConnected).sort((a, b) => a.y - b.y);
    for (const [i, c] of list.entries()) {
      if (!this.alive(token)) return;
      const el = c.clone;
      if (i < 4) {
        await this.bringIntoView(el, token);
        const r = this.docRect(el);
        this.label('Deleting');
        const px = r.x + Math.min(r.w * 0.5, 120), py = r.y + Math.min(r.h * 0.5, 40);
        await this.moveCursor(px, py, token);
        if (!this.alive(token)) return;
        this.pressCursor(true, px, py);
        const box = this.addItem({ kind: 'box', el, handles: true, html: `<span class="num">${Math.round(r.w)} × ${Math.round(r.h)}</span>` });
        await this.wait(90, token);
        this.pressCursor(false);
        await this.wait(220, token);
        this.removeItem(box);
      }
      try { await el.animate([{ opacity: 1 }, { opacity: 0, scale: '0.98' }], { duration: 160 / this.speed(token), easing: EASE_OUT_STRONG }).finished; } catch {}
      const followers = this.followersOf(el);
      const before = this.rectsOf(followers);
      el.remove();
      this.slideFrom(followers, before, 300 / this.speed(token));
      await this.wait(i < 4 ? 260 : 40, token);
    }
  }

  async step_flash(s, token) {
    const boxes = s.els.map((el) => this.addItem({ kind: 'box', el, faint: true }));
    await this.wait(300, token);
    for (const b of boxes) this.fadeItem(b, 500);
  }

  // Alignment guides: other blocks sharing a left or right edge with `el`, shown while drawing.
  guidesFor(el) {
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    const r = el.getBoundingClientRect();
    const out = [];
    const edges = [r.left, r.right];
    const seen = new Set();
    const candidates = doc.body.querySelectorAll('h1,h2,h3,p,section,header,nav,footer,img,button,a,ul,div');
    let checked = 0;
    for (const c of candidates) {
      if (++checked > 400 || out.length >= 2) break;
      if (c === el || el.contains(c) || c.contains(el) || c.closest('[data-ares-pending]')) continue;
      const cr = c.getBoundingClientRect();
      if (cr.width < 8 || cr.height < 8) continue;
      for (const x of edges) {
        const key = Math.round(x);
        if (seen.has(key)) continue;
        if (Math.abs(cr.left - x) < 0.75 || Math.abs(cr.right - x) < 0.75) {
          seen.add(key);
          const y0 = Math.min(r.top, cr.top) + win.scrollY;
          const y1 = Math.max(r.bottom, cr.bottom) + win.scrollY;
          out.push(this.addItem({ kind: 'guide', x: x + win.scrollX, y0, y1 }));
        }
      }
    }
    return out;
  }

  // ---------- cursor + scrolling ----------
  shape(name) {
    if (this.cursorEl.dataset.shape !== name) this.cursorEl.dataset.shape = name;
  }

  placeCursorCenter() {
    const m = this.map();
    if (!m) return;
    const x = m.sx + (m.w / m.s) * 0.5, y = m.sy + (m.h / m.s) * 0.4;
    Object.assign(this.cursor, { x, y, tx: x, ty: y, vx: 0, vy: 0, placed: true, path: null });
    this.cursorEl.classList.add('is-shown');
    this.kick();
  }

  // Travel along a slightly curved path with a minimum-jerk profile, like a hand on a mouse.
  moveCursor(x, y, token, { dur, curve = 0.12, maxDur = 760 } = {}) {
    const c = this.cursor;
    this.cursorEl.classList.add('is-shown');
    if (!c.placed) {
      Object.assign(c, { x, y, tx: x, ty: y, vx: 0, vy: 0, placed: true, path: null });
      this.kick();
      return Promise.resolve();
    }
    const d = Math.hypot(x - c.x, y - c.y);
    c.path?.resolve();
    c.path = null;
    if (d < 3) { c.tx = x; c.ty = y; return Promise.resolve(); }
    const base = dur ?? clamp(170 + 105 * Math.log2(1 + d / 30), 200, maxDur);
    const T = base / this.speed(token);
    const nx = -(y - c.y) / d, ny = (x - c.x) / d;
    const bow = d * curve * (x >= c.x ? -1 : 1);
    return new Promise((resolve) => {
      c.path = {
        x0: c.x, y0: c.y, x1: x, y1: y,
        cx: (c.x + x) / 2 + nx * bow, cy: (c.y + y) / 2 + ny * bow,
        t0: performance.now(), dur: T, resolve,
      };
      c.tx = x;
      c.ty = y;
      this.kick();
    });
  }

  pressCursor(on, x, y) {
    this.cursor.pressTarget = on ? 1 : 0;
    if (x != null && !reducedMotion()) this.ripple(x, y);
    this.kick();
  }

  ripple(x, y) {
    const it = this.addItem({ kind: 'ripple', x, y });
    it.node.animate([{ transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0.55 }, { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 }], {
      duration: 420, easing: EASE_OUT_STRONG,
    }).finished.then(() => this.removeItem(it), () => this.removeItem(it));
  }

  bringIntoView(el, token) {
    return this.bringRectIntoView(this.docRect(el), token);
  }

  async bringRectIntoView(r, token) {
    if (!this.follow || !this.front) return;
    const win = this.win();
    const vh = win.innerHeight;
    const top = r.y - win.scrollY, bottom = top + r.h;
    if (top >= 40 && top <= vh * 0.72 && (bottom <= vh - 24 || r.h > vh * 0.7)) return;
    const target = r.h > vh * 0.7 ? r.y - 40 : r.y - Math.min(vh * 0.3, 180);
    await this.scrollToDoc(target, token, true);
  }

  async scrollToDoc(y, token, exact = false) {
    const win = this.front?.contentWindow;
    if (!win) return;
    const vh = win.innerHeight;
    const max = win.document.documentElement.scrollHeight - vh;
    const target = clamp(exact ? y : y - vh * 0.3, 0, Math.max(0, max));
    const from = win.scrollY;
    if (Math.abs(target - from) < 2) return;
    const dur = clamp(Math.abs(target - from) * 0.5, 260, 560) / (token ? this.speed(token) : 1);
    const start = performance.now();
    while (true) {
      if (token && !this.alive(token)) return;
      if (!this.follow) return;
      const t = Math.min(1, (performance.now() - start) / dur);
      win.scrollTo({ top: from + (target - from) * ease(t), left: win.scrollX, behavior: 'instant' });
      this.kick();
      if (t >= 1) return;
      await frame();
    }
  }

  label(text) {
    this.tagLabel.textContent = text || '';
    this.cursorEl.classList.toggle('has-label', !!text);
  }

  // ---------- overlay items ----------
  addItem(it) {
    it.node = document.createElement('div');
    it.born = performance.now();
    if (it.kind === 'box' || it.kind === 'drag') {
      it.node.className = 'ov-box';
      if (it.kind === 'drag') it.node.classList.add('is-drag');
      if (it.faint) it.node.classList.add('is-faint');
      it.node.innerHTML = '<i class="h tl"></i><i class="h tr"></i><i class="h bl"></i><i class="h br"></i><span class="ov-size"></span>';
      it.sizeEl = it.node.lastChild;
    } else {
      it.node.className = `ov-${it.kind}`;
    }
    if (it.kind === 'veil') it.node.style.background = it.color;
    this.overlay.insertBefore(it.node, this.caretEl);
    this.items.add(it);
    this.kick();
    return it;
  }
  fadeItem(it, ms) {
    if (!it || it.fading) return;
    it.fading = true;
    it.node.style.transition = `opacity ${ms}ms ease-out`;
    it.node.style.opacity = '0';
    setTimeout(() => this.removeItem(it), ms + 30);
  }
  // A finished box lingers as a faint outline, then fades: a short visual history of the build.
  trail(it) {
    if (!it || it.trailing || it.fading) return;
    it.trailing = true;
    it.handles = false;
    it.node.classList.remove('has-handles');
    it.node.classList.add('is-trail');
    setTimeout(() => this.fadeItem(it, 900), 1200);
  }
  removeItem(it) {
    it.node?.remove();
    this.items.delete(it);
  }
  dragRect(it) {
    const c = this.cursor;
    return { x: Math.min(it.x0, c.x), y: Math.min(it.y0, c.y), w: Math.abs(c.x - it.x0), h: Math.abs(c.y - it.y0) };
  }

  kick() {
    if (!this.raf) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  loop(t) {
    this.raf = 0;
    const dt = Math.max(1 / 240, Math.min(1 / 30, (t - this.lastT) / 1000));
    this.lastT = t;
    const c = this.cursor;
    let moving = false;
    if (c.placed) {
      if (c.path) {
        const p = c.path;
        const u = clamp((t - p.t0) / p.dur, 0, 1);
        const s = minJerk(u);
        const v = 1 - s;
        const x = v * v * p.x0 + 2 * v * s * p.cx + s * s * p.x1;
        const y = v * v * p.y0 + 2 * v * s * p.cy + s * s * p.y1;
        c.vx = (x - c.x) / dt;
        c.vy = (y - c.y) / dt;
        c.x = x;
        c.y = y;
        moving = true;
        if (u >= 1) { c.path = null; c.vx = c.vy = 0; p.resolve(); }
      } else {
        const k = c.k, d = 2 * Math.sqrt(k);
        for (const [p, v, tg] of [['x', 'vx', 'tx'], ['y', 'vy', 'ty']]) {
          const a = k * (c[tg] - c[p]) - d * c[v];
          c[v] += a * dt;
          c[p] += c[v] * dt;
        }
        moving = Math.hypot(c.tx - c.x, c.ty - c.y) > 0.3 || Math.hypot(c.vx, c.vy) > 1;
        if (!moving) { c.x = c.tx; c.y = c.ty; c.vx = c.vy = 0; }
      }
      c.press += (c.pressTarget - c.press) * Math.min(1, dt * 22);
      if (Math.abs(c.pressTarget - c.press) > 0.01) moving = true;
    }
    this.render();
    if (moving || this.items.size || this.caret || this.token) {
      this.lastT = t;
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  render() {
    const m = this.map();
    if (!m) return;
    const c = this.cursor;
    const now = performance.now();
    if (c.placed) {
      const [x, y] = this.toOverlay(c.x, c.y, m);
      this.cursorEl.style.transform = `translate(${x}px, ${y}px)`;
      // Lean slightly into horizontal motion (pointer only); squish on press.
      const lean = this.cursorEl.dataset.shape === 'arrow' ? clamp(c.vx / 1400, -1, 1) * 7 : 0;
      this.cursorEl.style.setProperty('--lean', `${lean.toFixed(2)}deg`);
      this.cursorEl.style.setProperty('--press', (1 - 0.16 * c.press).toFixed(3));
    }
    if (this.caret) {
      const [x, y] = this.toOverlay(this.caret.x, this.caret.y, m);
      this.caretEl.style.transform = `translate(${x}px, ${y}px)`;
      this.caretEl.style.height = `${this.caret.h * m.s}px`;
      this.caretEl.classList.add('is-on');
      this.caretEl.classList.toggle('is-blink', !!this.caret.blink);
    } else this.caretEl.classList.remove('is-on');

    for (const it of this.items) {
      const st = it.node.style;
      if (it.kind === 'drag') {
        const r = this.dragRect(it);
        const [x, y] = this.toOverlay(r.x, r.y, m);
        st.transform = `translate(${x}px, ${y}px)`;
        st.width = `${r.w * m.s}px`;
        st.height = `${r.h * m.s}px`;
        it.sizeEl.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
      } else if (it.kind === 'box') {
        if (!it.el.isConnected) { this.removeItem(it); continue; }
        const er = it.el.getBoundingClientRect();
        let x = m.ox + er.left * m.s, y = m.oy + er.top * m.s, w = er.width * m.s, h = er.height * m.s;
        if (it.snapFrom) {
          const u = Math.min(1, (now - it.snapAt) / 200);
          if (u < 1) {
            const k = easeOut(u);
            const [fx, fy] = this.toOverlay(it.snapFrom.x, it.snapFrom.y, m);
            x = fx + (x - fx) * k; y = fy + (y - fy) * k;
            w = it.snapFrom.w * m.s + (w - it.snapFrom.w * m.s) * k;
            h = it.snapFrom.h * m.s + (h - it.snapFrom.h * m.s) * k;
          } else it.snapFrom = null;
        }
        st.transform = `translate(${x}px, ${y}px)`;
        st.width = `${w}px`;
        st.height = `${h}px`;
        if (it.handles && !it.node.classList.contains('has-handles')) it.node.classList.add('has-handles');
        if (it.html && it.shownHtml !== it.html) { it.sizeEl.innerHTML = it.html; it.shownHtml = it.html; }
      } else if (it.kind === 'veil') {
        let r = null;
        if (it.drag) r = this.dragRect(it.drag);
        else if (it.el?.isConnected) r = this.docRect(it.el);
        if (!r) continue;
        const [x, y] = this.toOverlay(r.x, r.y, m);
        st.transform = `translate(${x}px, ${y}px)`;
        st.width = `${r.w * m.s}px`;
        st.height = `${r.h * m.s}px`;
      } else if (it.kind === 'tbox') {
        if (!it.el.isConnected) continue;
        // Hug the text typed so far.
        const range = it.el.ownerDocument.createRange();
        range.selectNodeContents(it.el);
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        for (const cr of range.getClientRects()) {
          if (!cr.width || !cr.height) continue;
          l = Math.min(l, cr.left); t = Math.min(t, cr.top); r = Math.max(r, cr.right); b = Math.max(b, cr.bottom);
        }
        if (!Number.isFinite(l)) {
          if (!this.caret) continue;
          l = this.caret.x - m.sx; r = l + 2; t = this.caret.y - m.sy; b = t + this.caret.h;
        }
        st.transform = `translate(${m.ox + (l - 3) * m.s}px, ${m.oy + (t - 2) * m.s}px)`;
        st.width = `${(r - l + 6) * m.s}px`;
        st.height = `${(b - t + 4) * m.s}px`;
      } else if (it.kind === 'radius') {
        if (!it.el.isConnected) continue;
        const er = it.el.getBoundingClientRect();
        st.transform = `translate(${m.ox + (er.left + it.offset) * m.s}px, ${m.oy + (er.top + it.offset) * m.s}px)`;
      } else if (it.kind === 'guide') {
        const [x, y0] = this.toOverlay(it.x, it.y0, m);
        const [, y1] = this.toOverlay(it.x, it.y1, m);
        st.transform = `translate(${x}px, ${y0 - 24}px)`;
        st.height = `${y1 - y0 + 48}px`;
      } else if (it.kind === 'sel') {
        const [x0, y] = this.toOverlay(it.x0, it.y, m);
        const [x1] = this.toOverlay(c.x, it.y, m);
        st.transform = `translate(${x0}px, ${y}px)`;
        if (!it.fading) st.width = `${Math.max(0, x1 - x0)}px`;
        st.height = `${it.h * m.s}px`;
      } else if (it.kind === 'ripple') {
        const [x, y] = this.toOverlay(it.x, it.y, m);
        st.left = `${x}px`;
        st.top = `${y}px`;
      }
    }
  }
}
