// The Limits cards (src/stats/limits.ts), rendered against a small fake DOM:
// - limits read as used (the bar fills up) or left (it counts down); bar, big number, word, pace
//   tick, trend arrow and the meter's accessible value always change together, and the choice is
//   saved in settings.ui.limitView;
// - the pace arrow describes spending, so it never flips with the view;
// - the chip in the bar's end shows the countdown and the provider's reset credits, and the credit
//   opens the irreversible confirmation (Cancel focused, Escape closes, focus returns);
// - stale and unknown readings say so honestly inside the empty bar;
// - provider tints come from theme tokens and the hatch never animates.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const strip = async (path) => (await transformWithOxc((await read(path)).replace(/^import\s[^;]+;\r?\n/gm, ''), path.split('/').pop())).code;
const exportsOf = (code) => [...code.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
const load = async (path, fakes = {}) => {
  const code = await strip(path);
  const keys = Object.keys(fakes);
  return new Function(...keys, `${code.replace(/^export /gm, '')}\nreturn { ${exportsOf(code).join(', ')} };`)(...keys.map((k) => fakes[k]));
};

// ---- pure reading ---------------------------------------------------------------------------
const pacing = await load('src/stats/limit-pace.ts');
const { limitReading, pace, PACE_ARROW } = pacing;
// 58% used, half the window gone: even pace is 50% used, or 50% left.
const used = limitReading(58, 0.5, 'used'), left = limitReading(58, 0.5, 'left');
assert.deepEqual([used.fill, used.value, used.word, used.mark, used.text], [58, 58, 'used', 50, '58% used']);
assert.deepEqual([left.fill, left.value, left.word, left.mark, left.text], [42, 42, 'left', 50, '42% left']);
assert.equal(used.pace, 'Even pace would be 50% used by now');
assert.equal(left.pace, 'Even pace would leave 50% by now');
assert.equal(pace(58, 0.5), 'ahead');
assert.deepEqual(PACE_ARROW, { ahead: 'trendUp', on: 'trendFlat', under: 'trendDown' });
for (const u of [0, 0.5, 12.5, 41.5, 58.5, 99.4, 100]) {
  assert.equal(limitReading(u, null, 'used').value + limitReading(u, null, 'left').value, 100, `views add up for ${u}`);
}
assert.equal(limitReading(10, 0.25, 'left').mark, 75);
assert.equal(limitReading(10, 0.25, 'used').mark, 25);
assert.equal(limitReading(10, null, 'left').mark, null, 'no reset time, no pace mark');

// ---- a small fake DOM -----------------------------------------------------------------------
const doc = { activeElement: null };
class Node {
  constructor(tag) {
    Object.assign(this, { tagName: tag.toUpperCase(), children: [], parent: null, attrs: {}, dataset: {}, listeners: {}, hidden: false, disabled: false, className: '', id: '', type: '', title: '', tabIndex: 0, _text: '', _html: '', animations: 0 });
    const props = {};
    this.style = { props, setProperty: (k, v) => { props[k] = v; } };
    const self = this;
    this.classList = {
      toggle(c, on) { const set = new Set(self.className.split(' ').filter(Boolean)); (on ?? !set.has(c)) ? set.add(c) : set.delete(c); self.className = [...set].join(' '); },
      contains(c) { return self.className.split(' ').includes(c); },
    };
  }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this.children = []; this._text = ''; this._html = v; }
  append(...nodes) { for (const n of nodes) { n.remove(); n.parent = this; this.children.push(n); } }
  insertBefore(n, ref) { n.remove(); n.parent = this; const i = ref ? this.children.indexOf(ref) : -1; i < 0 ? this.children.push(n) : this.children.splice(i, 0, n); }
  remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } }
  get isConnected() { let e = this; while (e.parent) e = e.parent; return e === host; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, extra = {}) { for (const fn of this.listeners[type] || []) fn({ stopPropagation() {}, ...extra }); }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { doc.activeElement = this; }
  scrollIntoView() {}
  animate() { this.animations++; }
  all(cls) { const out = []; const walk = (e) => { for (const c of e.children) { if (c.classList.contains(cls)) out.push(c); walk(c); } }; walk(this); return out; }
  one(cls) { return this.all(cls)[0]; }
}
globalThis.document = { createElement: (tag) => new Node(tag) };
globalThis.matchMedia = () => ({ matches: false });
globalThis.window = globalThis;
const host = new Node('div');
const box = new Node('div'), note = new Node('p');
host.append(box, note);

const dom = await load('src/stats/dom.ts');
const { mountLimits } = await load('src/stats/limits.ts', {
  ...dom, ...pacing,
  icon: (name) => `<svg data-icon="${name}"></svg>`,
  brandFor: (h) => (/claude/i.test(h) ? 'claude' : /codex/i.test(h) ? 'codex' : 'generic'),
  harnessName: (h) => (/claude/i.test(h) ? 'Claude' : 'Codex'),
  logoFor: () => 'logo.svg',
});

// ---- render real-shaped snapshots -----------------------------------------------------------
const now = Date.now(), at = (ms) => new Date(now + ms).toISOString();
const day = 86400000, hour = 3600000;
const weekly = (id, usedPercent, extra = {}) => ({ id, label: 'Weekly', labelIsComplete: true, usedPercent, windowMinutes: 10080, resetsAt: at(4 * day + hour + 30000), ...extra });
const snapshot = (claudeCredits = 2) => ({ limitSource: { source: 'T3 Code', status: 'current', detail: '' }, limits: {
  't3:codex': { harness: 'codex', instanceId: 'codex', name: 'Codex', source: 'T3 Code', windows: [weekly('codex:weekly', 74)], resetCredits: { availableCount: 1, nextExpiresAt: at(20 * day + 60000) } },
  't3:claudeAgent': { harness: 'claude', instanceId: 'claudeAgent', name: 'Claude', source: 'T3 Code', resetCredits: { availableCount: claudeCredits, nextExpiresAt: null }, windows: [
    weekly('claude:weekly', 29), weekly('claude:fable', 0, { label: 'Weekly · Fable' }),
    weekly('claude:old', 40, { label: 'Daily', windowMinutes: 1440, stale: true, staleReason: 'T3 reading is out of date' }),
    weekly('claude:none', null, { label: 'Monthly', windowMinutes: 43200 }),
  ] },
} });
let redeemed = 0, refreshed = 0;
const limits = mountLimits(box, note, { useResetCredit: async (id) => { redeemed++; return { outcome: 'reset', message: `Reset ${id}.` }; }, canManageProviders: async () => true },
  { destroyed: () => false, refresh: () => { refreshed++; } });
limits.render(snapshot(), 'left');

const [codex, claude] = box.children;
assert.equal(codex.dataset.provider, 'codex');
assert.equal(claude.dataset.provider, 'claude', 'the group carries its provider, so CSS can pick the token tint');
assert.equal(codex.one('lim-gname').textContent, 'Codex');
const card = (group, i) => group.one('lim-cards').children[i];
const parts = (c) => ({
  name: c.one('lim-name').textContent, num: c.one('lim-num').textContent, word: c.one('lim-word').textContent,
  arrow: /data-icon="(\w+)"/.exec(c.one('lim-trend').innerHTML)?.[1] ?? null, meter: c.one('lim-meter'), tick: c.one('lim-tick'),
  note: c.one('lim-note'), reset: c.one('lim-reset'), credit: c.one('lim-credit'),
});

// Left: T3's reading. 74% used with 42% of the week gone is ahead of pace, a rising arrow.
let c = parts(card(codex, 0));
assert.deepEqual([c.name, c.num, c.word, c.arrow], ['Weekly', '26%', 'left', 'trendUp']);
assert.equal(c.meter.getAttribute('role'), 'meter');
assert.equal(c.meter.getAttribute('aria-label'), 'Codex limit');
assert.equal(c.meter.getAttribute('aria-valuenow'), '26');
assert.equal(c.meter.getAttribute('aria-valuetext'), 'Weekly, 26% left, resets in 4 days 1 hour, ahead of pace, 1 reset credit');
assert.equal(c.meter.style.props['--fill'], '26%');
const mark = Number.parseFloat(c.meter.style.props['--mark']);
assert.ok(Math.abs(mark - (4 * day + hour) / (7 * day) * 100) < 0.1, `left: the tick sits where even pace would leave the rest (${mark})`);
assert.equal(c.tick.hidden, false);
assert.equal(c.reset.textContent, '4d 1h', 'the chip shows the countdown');
assert.equal(c.credit.hidden, false);
assert.equal(c.credit.textContent, '1', 'the chip shows the credit count');
assert.equal(c.credit.getAttribute('aria-label'), 'Use a reset credit for Codex, 1 available');
assert.match(c.credit.title, /1 reset credit banked\. The next expires in 20d 0h/, 'expiry details live in the tooltip');
assert.equal(card(codex, 0).one('lim-top').getAttribute('aria-hidden'), 'true', 'the meter carries the reading once');
assert.equal(c.num && card(codex, 0).one('lim-num').animations, 0, 'no motion on the first paint');

// Under pace falls; Claude's credits show on every Claude window (windows sort shortest first).
c = parts(card(claude, 1));
assert.deepEqual([c.num, c.word, c.arrow], ['71%', 'left', 'trendDown']);
assert.equal(c.meter.getAttribute('aria-valuetext'), 'Weekly, 71% left, resets in 4 days 1 hour, under pace, 2 reset credits');
assert.equal(parts(card(claude, 2)).name, 'Weekly · Fable');
assert.equal(parts(card(claude, 2)).num, '100%');

// Stale and unknown readings: no number, no tick, a short honest note inside the bar.
c = parts(card(claude, 0));
assert.deepEqual([c.num, c.word, c.arrow, c.tick.hidden, c.note.hidden, c.note.textContent], ['', '', null, true, false, 'T3 reading is out of date']);
assert.equal(c.meter.style.props['--fill'], '0%');
assert.match(c.meter.getAttribute('aria-valuetext'), /^Daily, T3 reading is out of date, resets in/);
assert.ok(card(claude, 0).classList.contains('lim-stale'));
c = parts(card(claude, 3));
assert.deepEqual([c.num, c.note.textContent, c.meter.getAttribute('aria-valuenow')], ['', 'Usage unavailable', '0']);

// Used: the same reading counts up; the arrow still says ahead, and the number change moves.
limits.render(snapshot(), 'used');
c = parts(card(codex, 0));
assert.deepEqual([c.num, c.word, c.arrow], ['74%', 'used', 'trendUp']);
assert.equal(c.meter.style.props['--fill'], '74%');
assert.ok(Math.abs(Number.parseFloat(c.meter.style.props['--mark']) - (100 - mark)) < 0.1, 'used: the tick is the elapsed share');
assert.equal(c.meter.getAttribute('aria-valuetext'), 'Weekly, 74% used, resets in 4 days 1 hour, ahead of pace, 1 reset credit');
assert.equal(card(codex, 0).one('lim-num').animations, 1, 'a changed value settles in');

// The credit opens the confirmation without redeeming; Cancel is focused, Escape closes.
const confirm = codex.one('lim-confirm');
assert.equal(confirm.hidden, true);
c.credit.click();
assert.equal(confirm.hidden, false);
assert.equal(c.credit.getAttribute('aria-expanded'), 'true');
assert.equal(c.credit.getAttribute('aria-controls'), confirm.id);
assert.equal(doc.activeElement, confirm.one('lim-cno'), 'Cancel takes focus');
assert.equal(confirm.one('lim-cask').textContent, 'Use a reset for Codex?');
assert.match(confirm.all('lim-cnote')[0].textContent, /The next expires in 20d 0h/, 'expiry details on demand');
assert.equal(redeemed, 0, 'opening never redeems');
confirm.dispatch('keydown', { key: 'Escape' });
assert.equal(confirm.hidden, true);
assert.equal(doc.activeElement, c.credit, 'focus returns to the credit');
c.credit.click();
confirm.one('lim-cno').click();
assert.equal(confirm.hidden, true);
assert.equal(redeemed, 0);
// Confirming redeems exactly once and asks for a fresh reading.
c.credit.click();
confirm.one('lim-cyes').click();
await new Promise((r) => setTimeout(r, 0));
assert.equal(redeemed, 1);
assert.equal(refreshed, 1);
assert.equal(codex.one('lim-cstatus').textContent, 'Reset codex.');

// No credits: no ticket. Without the redeem bridge the count stays visible but inert.
limits.render(snapshot(0), 'left');
assert.equal(parts(card(claude, 1)).credit.hidden, true);
assert.equal(parts(card(claude, 1)).meter.getAttribute('aria-valuetext'), 'Weekly, 71% left, resets in 4 days 1 hour, under pace');
const box2 = new Node('div'), note2 = new Node('p');
const inert = mountLimits(box2, note2, {}, { destroyed: () => false, refresh() {} });
inert.render(snapshot(), 'left');
const lone = parts(box2.children[0].one('lim-cards').children[0]);
assert.equal(lone.credit.disabled, true);
assert.equal(lone.credit.getAttribute('aria-label'), '1 reset credit for Codex');

// ---- wiring, tokens and motion --------------------------------------------------------------
const stats = await read('src/stats/stats.ts');
for (const piece of ['mountLimits(limitsBox, limitsNote, options', 'limits.render(u, view)', 'setLimitView(next)', 'limits.render(last, view)']) {
  assert.ok(stats.includes(piece), `stats.ts: ${piece}`);
}
const section = await read('src/office/limits-section.ts');
assert.ok(section.includes('role="radiogroup" aria-label="Show limits as"') && section.includes('role="radio"'), 'Used / Left is a labelled radio group');
assert.ok(/ArrowLeft/.test(section) && section.includes('b.tabIndex = on ? 0 : -1'), 'arrow keys and roving focus');
assert.ok(section.includes("'.lim-groups'"), 'the Limits disclosure hosts the cards');
const usage = await read('src/app/usage.ts');
assert.ok(usage.includes('limitView: app.ui.limitView') && usage.includes('app.ui.limitView = view') && usage.includes('app.saveSettings()'), 'the choice is saved and restored');
const tokens = await read('src/themes/tokens.css');
for (const t of ['--limit-card', '--limit-track', '--limit-hatch', '--limit-fill', '--limit-claude', '--limit-high']) {
  assert.match(tokens, new RegExp(`${t}: [^;]*var\\(--`), `${t} derives from the theme's own colours`);
}
const css = await read('src/stats/limits.css');
assert.match(css, /\.lim-group\[data-provider="claude"\] \{ --lim-tint: var\(--limit-claude\); \}/);
assert.match(css, /\.lim-fill \{[^}]*background: var\(--lim-tint\)/);
assert.doesNotMatch(css.slice(css.indexOf('.lim-bar {'), css.indexOf('.lim-meter {')), /animation|transition/, 'the hatch stays still');
const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
assert.match(reduced, /\.lim-fill, \.lim-tick[^{]*\{ transition: none; \}/, 'reduced motion drops bar motion');
console.log('PASS: limit cards read as used or left with matching bar, number, arrow, tick, chip and accessible value; credits confirm safely.');
