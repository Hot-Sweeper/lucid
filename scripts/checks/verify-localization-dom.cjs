const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function fixture() {
  let locale = 'de', listener, observer, intersection, timer, calls = 0, pending, now = Date.now();
  const nodes = [];
  const root = {
    isConnected: true, owned: false,
    closest() { return this.owned ? this : null; },
    setAttribute() { this.owned = true; }, removeAttribute() { this.owned = false; },
    contains(node) { return nodes.includes(node); },
  };
  const add = (data, protectedNode = false, className = '') => {
    const node = { data, parentElement: { className, closest() { return protectedNode ? {} : null; } } };
    nodes.push(node); return node;
  };
  const document = {
    hidden: false, addEventListener() {}, removeEventListener() {},
    createTreeWalker() { let i = 0; return { nextNode: () => nodes[i++] || null }; },
  };
  const exports = {};
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync('src/localization-dom.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  const code = (await transformWithOxc(source, 'localization-dom.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '') + '\nexports.localizeGameDOM = localizeGameDOM;';
  vm.runInNewContext(code, {
    exports, document, NodeFilter: { SHOW_TEXT: 4 }, Date: {now:()=>now}, BRAND: require('../../electron/brand.cjs'),
    setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { timer = undefined; },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
    IntersectionObserver: class { constructor(fn) { intersection = fn; } observe() { intersection([{ isIntersecting: true }]); } disconnect() {} },
      getLocale: () => locale,
      canonicalText: text => text,
      onLocaleChange(fn) { listener = fn; return () => { listener = undefined; }; },
      uiText: text => locale === 'de' && text === 'Games' ? 'Spiele' : text,
      async translateEntries(entries) {
        calls++;
        if (pending) return pending(entries);
        return entries.map(entry => ({ ...entry, text: 'Deutsch: ' + entry.text }));
      },
  });
  const stop = exports.localizeGameDOM(root, 'fictional scene');
  async function flush() { const fn = timer; timer = undefined; fn?.(); await new Promise(resolve => setImmediate(resolve)); }
  return {
    root, add, stop, flush, document,
    mutate() { observer(); },
    locale(value) { locale = value; listener?.(); },
    defer(fn) { pending = fn; },
    advance(ms) { now += ms; },
    get calls() { return calls; },
  };
}

(async () => {
  const f = await fixture();
  const message = f.add('A joke with a reply.');
  const label = f.add('Games');
  const code = f.add('User code must stay intact', true);
  const handle = f.add('unit seven', false, 'so-user');
  const brand = f.add('BotsApp');
  await f.flush();
  assert.equal(message.data, 'Deutsch: A joke with a reply.');
  assert.equal(label.data, 'Spiele');
  assert.equal(code.data, 'User code must stay intact');
  assert.equal(handle.data, 'unit seven');
  assert.equal(brand.data, 'BotsApp');
  f.mutate(); await f.flush();
  assert.equal(f.calls, 1, 'translated nodes must not request another translation');
  const repeated = f.add('A joke with a reply.'); f.mutate(); await f.flush();
  assert.equal(repeated.data, 'Deutsch: A joke with a reply.');
  assert.equal(f.calls, 1, 'new nodes reuse cached text without another model request');
  f.locale('en'); await f.flush();
  assert.equal(message.data, 'A joke with a reply.');
  assert.equal(label.data, 'Games');
  f.stop(); assert.equal(f.root.owned, false);

  const stale = await fixture();
  const node = stale.add('Original scene');
  let resolve;
  stale.defer(entries => new Promise(done => { resolve = () => done(entries.map(e => ({ ...e, text: 'Alte Szene' }))); }));
  await stale.flush();
  node.data = 'New scene';
  resolve(); await new Promise(done => setImmediate(done));
  assert.equal(node.data, 'New scene', 'late replies cannot overwrite new content');
  stale.stop();

  const hidden = await fixture();
  hidden.add('Hidden scene'); hidden.document.hidden = true;
  await hidden.flush(); assert.equal(hidden.calls, 0);
  hidden.stop();
  const retry = await fixture(); const fallback = retry.add('A temporarily unavailable joke');
  retry.defer(async entries=>entries);await retry.flush();
  assert.equal(fallback.data,'A temporarily unavailable joke');
  retry.defer(undefined);retry.advance(31000);retry.mutate();await retry.flush();
  assert.equal(fallback.data,'Deutsch: A temporarily unavailable joke','fallback text can recover without replacing the node or switching language');
  retry.stop();
  console.log('Localization DOM checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
