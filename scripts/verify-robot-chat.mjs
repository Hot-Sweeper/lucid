import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = (await readFile('src/harness/t3code.ts', 'utf8')).replace(/^import\s[\s\S]*?;\r?\n/gm, '');
const code = (await transformWithOxc(source, 't3code.ts')).code.replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '');
const el = () => ({ classList: { add() {}, remove() {} }, hidden: false, innerHTML: '', textContent: '', remove() {} });
const T3CodeApp = new Function('ICONS', 'document', 'renderFps', 'presentationFrame', code + ';return T3CodeApp;')({}, { createElement: el }, () => 60, async () => {});
for (const audience of ['user', 'agents']) {
  const app = Object.create(T3CodeApp.prototype);
  let bubble, frames = 0, typing = false, sending = false;
  Object.assign(app, { audience, root: el(), compText: el(), comp: el(), send: el(),
    feed: { append(p) { bubble = p; } }, ensure: async () => {}, closeGroup() {}, stick() {},
    wm: { epoch: 0, robot: { setTyping(on) { typing = on; } }, sleep: async () => {}, check() {} } });
  app.send.classList.add = () => { sending = true; };
  await app.assistant(() => {
    if (++frames === 3 && audience === 'user') {
      assert.equal(bubble.hidden, true);
      assert.ok(app.compText.textContent.length > 0);
      assert.equal(typing, true);
    }
    return { text: 'A real reply with enough text to observe the composer.', done: true };
  });
  assert.equal(typing, false);
  assert.equal(bubble.hidden, false);
  assert.match(bubble.innerHTML, /A real reply/);
  assert.equal(app.compText.textContent, '');
  assert.equal(sending, audience === 'user');
}
console.log('PASS: user replies compose before sending, T3 replies stay in the thread, typing and composer clean up.');
