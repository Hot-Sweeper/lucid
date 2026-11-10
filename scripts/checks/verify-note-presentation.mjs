import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await readFile(new URL('../../src/harness/note-presentation.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source.replace(/^import .*;\r?\n/gm, ''), 'notes.ts')).code.replace(/^export /gm, '').replace(/export\s*\{[^}]*\};?/g, '');
let epoch = 1, fps = 20, reads = 0, writes = 0;
const loops = new Set(), layouts = new Map(), timers = [], keys = [];
const renderLoop = (owner, cb) => { const loop = { owner, cb }; loops.add(loop); return () => loops.delete(loop); };
const scheduleLayout = (owner, read) => layouts.set(owner, read);
const { NotePresentation } = new Function('renderFps', 'renderLoop', 'scheduleLayout', 'setTimeout', `${code};return {NotePresentation}`)(() => fps, renderLoop, scheduleLayout, (cb, ms) => timers.push({ cb, ms }));
class Paragraph {
  isConnected = true; value = ''; parent = null;
  get textContent() { return this.value; }
  set textContent(v) { writes++; this.value = v; }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(p => p !== this); }
}
class Box {
  isConnected = true; children = []; scrollTop = 0;
  appendChild(p) { p.parent = this; this.children.push(p); }
  get firstElementChild() { return this.children[0]; }
  contains(p) { return this.children.includes(p); }
  get scrollHeight() { reads++; return 300; }
  get clientHeight() { reads++; return 100; }
}
const notes = new NotePresentation(() => epoch, key => keys.push(key));
const director = await readFile(new URL('../../src/director.ts', import.meta.url), 'utf8');
const begin = director.indexOf('  private async writeNote('), end = director.indexOf('\n  /**', begin);
const method = director.slice(begin, end).replace('private async writeNote', 'async function writeNote');
const methodCode = (await transformWithOxc(method, 'write-note.ts')).code;
const writeNote = new Function('document', `${methodCode};return writeNote`)({ createElement: () => new Paragraph() });
const host = { noteFor: new WeakMap(), notePresentation: notes, wm: { speed: 1 } };
const paint = () => { for (const l of [...loops]) if (fps && l.owner.isConnected) l.cb(); };
const layout = () => { const jobs = [...layouts.values()]; layouts.clear(); const follow = jobs.map(fn => fn()).filter(Boolean); follow.forEach(fn => fn()); };
const advance = async () => { const next = timers.shift(); if (next) next.cb(); await Promise.resolve(); await Promise.resolve(); };

// Call the production Director method, with fake visibility and scheduling only.
const box = new Box(); fps = 0;
await writeNote.call(host, box, '**Actual final text**   with whitespace');
assert.equal(writes, 0); assert.equal(reads, 0); assert.equal(timers.length, 0); assert.equal(keys.length, 0);
paint(); layout(); assert.equal(reads, 0);
fps = 20; paint(); layout();
assert.equal(box.children[0].textContent, 'Actual final text with whitespace'); assert.equal(box.scrollTop, 200); assert.equal(loops.size, 0);

// Visible typing uses the camera cadence, and an old async writer cannot win a race.
writes = reads = 0; const p = box.children[0]; p.value = '';
const old = writeNote.call(host, box, 'First stale streamed thought that must not overwrite its replacement');
paint(); assert.ok(timers[0].ms >= 50); assert.ok(writes <= 1);
fps = 0; const fresh = writeNote.call(host, box, 'Newest exact final thought'); await fresh;
await advance(); await old; paint(); layout(); assert.equal(p.textContent.startsWith('First'), true, 'hidden replacement is not painted early');
fps = 20; paint(); layout(); assert.equal(p.textContent, 'Newest exact final thought'); assert.equal(loops.size, 0);

// A visibility change between paint and geometry batching suppresses the read.
p.value = ''; fps = 20; const pending = writeNote.call(host, box, 'abc'); paint(); const before = reads; fps = 0; layout(); assert.equal(reads, before);
epoch++; notes.reset(); await advance(); await pending; fps = 20; paint(); layout(); assert.equal(loops.size, 0);

// Reset and assignment cancellation also invalidate an already queued final scroll.
fps = 0; await writeNote.call(host, box, 'Cancelled hidden note'); const beforeText = p.textContent; epoch++; notes.reset(); fps = 20; paint(); layout(); assert.equal(p.textContent, beforeText); assert.equal(loops.size, 0);
const other = new Box(); fps = 0; await writeNote.call(host, other, 'Final after reset'); fps = 20; paint(); notes.reset(); const beforeResetRead = reads; layout(); assert.equal(reads, beforeResetRead);
const history = new Box(); fps = 0;
for (let i = 0; i < 10; i++) { host.noteFor = new WeakMap(); await writeNote.call(host, history, `Retained note ${i}`); }
assert.equal(history.children.length, 6); assert.equal(notes.boxes.get(history).entries.size, 6, 'hidden presentation must release trimmed historical paragraphs');
const beforeHistoryRead = reads; fps = 20; paint(); layout();
assert.deepEqual(history.children.map(p => p.textContent), Array.from({ length: 6 }, (_, i) => `Retained note ${i + 4}`));
assert.equal(reads - beforeHistoryRead, 2, 'all resumed paragraphs share one scroll measurement'); assert.equal(loops.size, 0);
console.log('Note presentation passed: real Director writes, hidden/paused zero measurement, exact resume, visible cadence, superseded streams, epoch cancellation, reset and queued-layout safety.');
