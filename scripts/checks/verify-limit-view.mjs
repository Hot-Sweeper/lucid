// The Limits panel (src/stats/limits.ts), rendered against a small fake DOM:
// - limits read as used (the meter fills up) or left (it counts down); fill, big number, word, pace
//   zone and tick, pace words and arrow and the meter's accessible value always change together,
//   and the choice is saved in settings.ui.limitView;
// - the pace arrow describes spending, so it never flips with the view; a used-up window says
//   "Limit reached" instead;
// - colour follows how a limit is going (calm, warn, crit), never the provider;
// - each row shows its reset countdown; the provider's reset credits live once in its header and
//   open the irreversible confirmation (Cancel focused, Escape closes, focus returns);
// - stale and unknown readings say so honestly beside an empty meter;
// - window labels are T3's own wording or a humanized key, never a raw key.
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
const { limitTone } = pacing;
assert.deepEqual([limitTone(20, 'under'), limitTone(40, 'on'), limitTone(40, 'ahead'), limitTone(80, 'under'), limitTone(90, 'under'), limitTone(100, 'ahead'), limitTone(30, null)],
  ['calm', 'calm', 'warn', 'warn', 'crit', 'crit', 'calm'], 'calm under pace, warm ahead of pace or from 75%, critical from 90%');

// ---- labels: T3's wording as is, raw keys humanized ------------------------------------------
const labels = await load('src/stats/limit-label.ts');
const { limitLabel } = labels;
const lbl = (label, windowMinutes = 10080, labelIsComplete = true) => limitLabel({ label, windowMinutes, labelIsComplete });
assert.equal(lbl('Weekly'), 'Weekly');
assert.equal(lbl('Weekly · Fable'), 'Weekly · Fable');
assert.equal(lbl('Monthly spend', null), 'Monthly spend');
assert.equal(lbl('Go · Session', 300), 'Go · Session');
assert.equal(lbl(null, 300), '5 hour');
assert.equal(lbl(null, null), 'Limit');
assert.equal(lbl('Fable', 10080, false), 'Weekly · Fable', 'a local scope gets the window length first, like T3');
assert.equal(lbl('seven day overage included', 10080, false), 'Weekly · Overage included', 'the reported raw key, as local logs sent it');
assert.equal(lbl('seven_day_overage_included'), 'Weekly · Overage included');
assert.equal(lbl('seven_day_opus', 10080, false), 'Weekly · Opus');
assert.equal(lbl('five_hour', 300), '5 hour');
assert.equal(lbl('weekly'), 'Weekly');
assert.equal(lbl('gpt_5_codex_mini', 300, false), '5 hour · GPT 5 codex mini');
assert.equal(lbl('monthly_spend', null), 'Monthly · Spend');
for (const raw of ['seven_day_overage_included', 'seven day sonnet', 'codex_bengalfox', 'five_hour', 'weekly_limit']) {
  const shown = lbl(raw, 10080, false);
  assert.doesNotMatch(shown, /_|^[a-z]/, `${raw} is never shown raw (${shown})`);
}

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
  ...dom, ...pacing, ...labels,
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
    weekly('claude:raw', 12, { label: 'seven day overage included', labelIsComplete: false }),
  ] },
} });
let redeemed = 0, refreshed = 0;
const limits = mountLimits(box, note, { useResetCredit: async (id) => { redeemed++; return { outcome: 'reset', message: `Reset ${id}.` }; }, canManageProviders: async () => true },
  { destroyed: () => false, refresh: () => { refreshed++; } });
limits.render(snapshot(), 'left');

const [codex, claude] = box.children;
assert.equal(codex.dataset.provider, 'codex');
assert.equal(claude.dataset.provider, 'claude', 'the group still names its provider (logo and accessible text)');
assert.equal(codex.one('lim-gname').textContent, 'Codex');
const row = (group, i) => group.one('lim-rows').children[i];
const parts = (r) => ({
  name: r.one('lim-name').textContent, num: r.one('lim-num').textContent, word: r.one('lim-word').textContent,
  arrow: /data-icon="(\w+)"/.exec(r.one('lim-pace-icon').innerHTML)?.[1] ?? null, pace: r.one('lim-pace'), meter: r.one('lim-meter'), tick: r.one('lim-tick'),
  note: r.one('lim-note'), reset: r.one('lim-reset'), meta: r.one('lim-meta'),
});
const toneOf = (r) => ['calm', 'warn', 'crit'].filter((t) => r.classList.contains(`lim-${t}`));
const credit = (group) => group.one('lim-credit');

// Left: T3's reading. 74% used with 42% of the week gone is ahead of pace, a rising arrow, warm.
let c = parts(row(codex, 0));
assert.deepEqual([c.name, c.num, c.word, c.arrow, c.pace.textContent, c.pace.hidden], ['Weekly', '26%', 'left', 'trendUp', 'Ahead of pace', false]);
assert.deepEqual(toneOf(row(codex, 0)), ['warn'], 'ahead of pace reads warm');
assert.equal(c.meter.getAttribute('role'), 'meter');
assert.equal(c.meter.getAttribute('aria-label'), 'Codex limit');
assert.equal(c.meter.getAttribute('aria-valuenow'), '26');
assert.equal(c.meter.getAttribute('aria-valuetext'), 'Weekly, 26% left, resets in 4 days 1 hour, ahead of pace, 1 reset credit');
assert.equal(c.meter.style.props['--fill'], '26%');
const mark = Number.parseFloat(c.meter.style.props['--mark']);
assert.ok(Math.abs(mark - (4 * day + hour) / (7 * day) * 100) < 0.1, `left: the zone and tick end where even pace would leave the rest (${mark})`);
assert.equal(c.tick.hidden, false);
assert.equal(c.reset.textContent, 'Resets in 4d 1h', 'each row shows its countdown');
assert.equal(c.reset.hidden, false);
assert.equal(row(codex, 0).one('lim-top').getAttribute('aria-hidden'), 'true', 'the meter carries the reading once');
assert.equal(c.meta.getAttribute('aria-hidden'), 'true');
assert.equal(row(codex, 0).one('lim-num').animations, 0, 'no motion on the first paint');
// Credits live once, in the provider's header, never per window.
assert.equal(codex.all('lim-credit').length, 1);
assert.equal(credit(codex).hidden, false);
assert.equal(credit(codex).textContent, '1 reset', 'the header shows the credit count');
assert.equal(credit(codex).getAttribute('aria-label'), 'Use a reset credit for Codex, 1 available');
assert.match(credit(codex).title, /1 reset credit banked\. The next expires in 20d 0h/, 'expiry details live in the tooltip');
assert.equal(credit(claude).textContent, '2 resets');

// Under pace falls and stays calm; windows sort shortest first.
c = parts(row(claude, 1));
assert.deepEqual([c.num, c.word, c.arrow, c.pace.textContent], ['71%', 'left', 'trendDown', 'Under pace']);
assert.deepEqual(toneOf(row(claude, 1)), ['calm']);
assert.equal(c.meter.getAttribute('aria-valuetext'), 'Weekly, 71% left, resets in 4 days 1 hour, under pace, 2 reset credits');
assert.equal(parts(row(claude, 2)).name, 'Weekly · Fable');
assert.equal(parts(row(claude, 2)).num, '100%');
assert.equal(parts(row(claude, 3)).name, 'Weekly · Overage included', 'a raw local key is humanized, never shown as is');

// Stale and unknown readings: no number, no tick, no pace, a short honest note.
c = parts(row(claude, 0));
assert.deepEqual([c.num, c.word, c.arrow, c.tick.hidden, c.pace.hidden, c.note.hidden, c.note.textContent], ['', '', null, true, true, false, 'T3 reading is out of date']);
assert.equal(c.meter.style.props['--fill'], '0%');
assert.match(c.meter.getAttribute('aria-valuetext'), /^Daily, T3 reading is out of date, resets in/);
assert.ok(row(claude, 0).classList.contains('lim-stale'));
assert.deepEqual(toneOf(row(claude, 0)), [], 'a stale reading has no tone');
c = parts(row(claude, 4));
assert.deepEqual([c.num, c.note.textContent, c.meter.getAttribute('aria-valuenow')], ['', 'Usage unavailable', '0']);

// Used: the same reading counts up; the arrow still says ahead, and the number change moves.
limits.render(snapshot(), 'used');
c = parts(row(codex, 0));
assert.deepEqual([c.num, c.word, c.arrow], ['74%', 'used', 'trendUp']);
assert.deepEqual(toneOf(row(codex, 0)), ['warn'], 'tone is the same in both views');
assert.equal(c.meter.style.props['--fill'], '74%');
assert.ok(Math.abs(Number.parseFloat(c.meter.style.props['--mark']) - (100 - mark)) < 0.1, 'used: the tick is the elapsed share');
assert.equal(c.meter.getAttribute('aria-valuetext'), 'Weekly, 74% used, resets in 4 days 1 hour, ahead of pace, 1 reset credit');
assert.equal(row(codex, 0).one('lim-num').animations, 1, 'a changed value settles in');

// The credit opens the confirmation without redeeming; Cancel is focused, Escape closes.
const confirm = codex.one('lim-confirm');
const ticket = credit(codex);
assert.equal(confirm.hidden, true);
ticket.click();
assert.equal(confirm.hidden, false);
assert.equal(ticket.getAttribute('aria-expanded'), 'true');
assert.equal(ticket.getAttribute('aria-controls'), confirm.id);
assert.equal(doc.activeElement, confirm.one('lim-cno'), 'Cancel takes focus');
assert.equal(confirm.one('lim-cask').textContent, 'Use a reset for Codex?');
assert.match(confirm.all('lim-cnote')[0].textContent, /The next expires in 20d 0h/, 'expiry details on demand');
assert.equal(redeemed, 0, 'opening never redeems');
confirm.dispatch('keydown', { key: 'Escape' });
assert.equal(confirm.hidden, true);
assert.equal(ticket.getAttribute('aria-expanded'), 'false');
assert.equal(doc.activeElement, ticket, 'focus returns to the credit');
ticket.click();
ticket.click();
assert.equal(confirm.hidden, true, 'the same credit again closes it');
ticket.click();
confirm.one('lim-cno').click();
assert.equal(confirm.hidden, true);
assert.equal(redeemed, 0);
// Confirming redeems exactly once and asks for a fresh reading.
ticket.click();
confirm.one('lim-cyes').click();
await new Promise((r) => setTimeout(r, 0));
assert.equal(redeemed, 1);
assert.equal(refreshed, 1);
assert.equal(codex.one('lim-cstatus').textContent, 'Reset codex.');

// A used-up window says so instead of a pace, reads critical, and points at the banked resets.
const spentSnap = snapshot();
spentSnap.limits['t3:codex'].windows = [weekly('codex:weekly', 100)];
limits.render(spentSnap, 'left');
c = parts(row(codex, 0));
assert.deepEqual([c.num, c.word, c.arrow, c.pace.textContent], ['0%', 'left', null, 'Limit reached']);
assert.deepEqual(toneOf(row(codex, 0)), ['crit']);
assert.equal(c.meter.getAttribute('aria-valuetext'), 'Weekly, 0% left, resets in 4 days 1 hour, limit reached, 1 reset credit');
assert.ok(codex.classList.contains('lim-spent') && !claude.classList.contains('lim-spent'), 'only the provider with a used-up window is marked');

// No credits: no ticket. Without the redeem bridge the count stays visible but inert.
limits.render(snapshot(0), 'left');
assert.equal(credit(claude).hidden, true);
assert.equal(parts(row(claude, 1)).meter.getAttribute('aria-valuetext'), 'Weekly, 71% left, resets in 4 days 1 hour, under pace');
const box2 = new Node('div'), note2 = new Node('p');
const inert = mountLimits(box2, note2, {}, { destroyed: () => false, refresh() {} });
inert.render(snapshot(), 'left');
const lone = credit(box2.children[0]);
assert.equal(lone.disabled, true);
assert.equal(lone.getAttribute('aria-label'), '1 reset credit for Codex');

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
for (const t of ['--limit-surface', '--limit-track', '--limit-zone', '--limit-calm']) {
  assert.match(tokens, new RegExp(`${t}: [^;]*var\\(--`), `${t} derives from the theme's own colours`);
}
for (const t of ['--limit-warn', '--limit-crit']) {
  assert.match(tokens, new RegExp(`${t}: oklch\\(from var\\(--limit-calm\\) l `), `${t} keeps the calm lightness, so its contrast with the track matches`);
}
const css = await read('src/stats/limits.css');
assert.doesNotMatch(css, /data-provider/, 'colour never follows the provider');
assert.match(css, /\.lim-fill \{[^}]*background: var\(--lim-tone\)/);
assert.match(css, /\.lim-row\.lim-warn \{ --lim-tone: var\(--limit-warn\); \}/);
assert.match(css, /\.lim-row\.lim-crit \{ --lim-tone: var\(--limit-crit\); \}/);
assert.match(css, /\.lim-stale \.lim-zone \{ display: none; \}/, 'a stale reading draws no pace zone');
assert.doesNotMatch(css.slice(css.indexOf('.lim-track {'), css.indexOf('.lim-zone, .lim-fill {')), /animation|transition/, 'the track stays still');
const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
assert.match(reduced, /\.lim-zone, \.lim-fill, \.lim-tick[^{]*\{ transition: none; \}/, 'reduced motion drops meter motion');
console.log('PASS: limit rows read as used or left with matching meter, number, pace, tone and accessible value; labels are human; credits confirm safely.');
