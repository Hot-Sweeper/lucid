import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/office/chat-scroll.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source, 'chat-scroll.ts')).code.replace(/^export /gm, '').replace(/export\s*\{[^}]*\};?/g, '');
const { chatReaderAnchor } = new Function(`${code};return {chatReaderAnchor}`)();
let reads = 0;
const row = (id, top, bottom, group = false) => ({
  id, matches: () => true, classList: { contains: name => group && name === 'cp-group' },
  getBoundingClientRect() { reads++; return { top, bottom }; },
});
const list = (children, top) => ({ children, getBoundingClientRect: () => ({ top }) });
const rows = Array.from({ length: 10000 }, (_, i) => row(`row-${i}`, i * 40, i * 40 + 40));
assert.equal(chatReaderAnchor(list(rows, 399925)).element.id, 'row-9998');
assert.ok(reads <= 16, `Long histories must not measure every preceding row, got ${reads} reads`);
assert.equal(chatReaderAnchor(list(rows, 400000)), null, 'No anchor beyond the final message');
assert.equal(chatReaderAnchor(list([], 0)), null);
const messages = Array.from({ length: 5000 }, (_, i) => row(`message-${i}`, 100 + i * 20, 120 + i * 20));
const group = row('group', 80, 100100, true);
const details = { open: true, hidden: false, querySelector: () => ({ children: messages.slice(0, -1) }) };
group.querySelector = selector => selector.includes('earlier') ? details : ({ children: messages.slice(-1) });
reads = 0;
const expanded = chatReaderAnchor(list([group], 99001));
assert.equal(expanded.element.id, 'message-4945', 'Expanded earlier updates must retain the visible message as anchor');
assert.equal(expanded.top, 99000);
assert.ok(reads <= 16, `An expanded batch must also use bounded geometry reads, got ${reads}`);
details.open = false;
assert.equal(chatReaderAnchor(list([group], 99)).element.id, 'message-4999', 'Collapsed earlier content must never become an anchor');
details.open = true; details.hidden = true;
assert.equal(chatReaderAnchor(list([group], 99)).element.id, 'message-4999');
console.log('Chat reader anchor passed: 10,000 rows, bounded geometry reads, expanded and collapsed batches, exact positions and empty histories.');
