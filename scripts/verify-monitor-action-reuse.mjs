import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await readFile(process.argv[2] || new URL('../src/office/monitor-tasks.ts', import.meta.url), 'utf8');
const start = source.indexOf("      button.addEventListener('click', async () => {");
const end = source.indexOf('\n    }\n    desk.wm.root.append(el);', start);
assert.ok(start >= 0 && end > start);
const code = (await transformWithOxc(source.slice(start, end), 'monitor-action.ts')).code;
let click, complete, calls = 0, state = 'done', failed = false;
const button = { disabled: false, textContent: 'Settle session', classList: { contains: () => state === 'kept' }, addEventListener: (_, fn) => { click = fn; } };
const error = { textContent: '' };
const monitor = {
  collecting: new Set(),
  actions: { collect: () => { calls++; return new Promise((resolve, reject) => { complete = () => { if (failed) reject(Error('offline')); else { state = state === 'done' ? 'kept' : 'removed'; resolve(); } }; }); } },
  sync: () => { button.textContent = state === 'kept' ? 'Remove desk' : 'Settle session'; },
};
new Function('button', 'error', 'id', code).call(monitor, button, error, 'thread');
const settling = click();
assert.equal(button.disabled, true, 'In-flight settlement disables the button');
await click(); assert.equal(calls, 1, 'Repeated activation does not duplicate settlement');
complete(); await settling;
assert.equal(button.textContent, 'Remove desk');
assert.equal(button.disabled, false, 'The reused Remove desk action must be enabled after successful settlement');
const removing = click(); complete(); await removing;
assert.equal(state, 'removed', 'The second action removes the kept desk');
assert.equal(calls, 2);
state = 'kept'; failed = true;
const failure = click(); complete(); await failure;
assert.match(error.textContent, /offline/);
assert.equal(button.disabled, false, 'Failed removal remains retryable');
assert.equal(monitor.collecting.size, 0);
failed = false; const retry = click(); complete(); await retry;
assert.equal(state, 'removed');
console.log('PASS: settlement enables Remove desk, repeated activation is guarded, removal succeeds and failures can retry');
