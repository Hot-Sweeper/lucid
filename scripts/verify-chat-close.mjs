import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = (await readFile(new URL('../src/office/chat-panel.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const method = (from, to) => { const start = source.indexOf(from), end = source.indexOf(to, start); assert.ok(start >= 0 && end > start, `Missing actual source method ${from}`); return source.slice(start, end); };
const methods = [
  method('  private releaseUnusedPreviews()', '\n  // --- threads'),
  method('  setCollapsed(', '\n  constructor('),
  method('  private saveDraft()', '\n  open('),
  method('  private clearTranscript()', '\n  setView('),
  method('  private async refresh()', '\n  private async loadEarlier('),
].join('\n');
const submitSource = method('    form.addEventListener("submit", async', '\n    ta.addEventListener("keydown", (e) => {\n      const phone');
const callback = submitSource.slice(submitSource.indexOf('async')).replace(/\);\s*$/, '');
const code = (await transformWithOxc(`class Fixture { get isOpen(){return this.el.classList.contains('open')} get threadId(){return this.desk?.threadId??null} ${methods} }`, 'chat-close-fixture.ts')).code;
const submitCode = (await transformWithOxc(`const submit=${callback};`, 'chat-submit-fixture.ts')).code;
const revoked = [], persisted = new Map(), clearedTimers = [];
class HistoryWindow { rows = new Map(); update() { throw Error('Stale response reached replacement history'); } }
const gsap = { killTweensOf() {}, set() {}, fromTo() {}, to() {} };
const shelfCode = (await transformWithOxc((await readFile(new URL('../src/office/chat-shelf.ts', import.meta.url), 'utf8')).replace(/^import[^;]+;\n/gm, ''), 'chat-shelf.ts')).code.replace(/^export /gm, '').replace(/export\s*\{[^}]*\};?/g, '');
const ChatShelf = new Function('GLIDE_MS', 'GLIDE_EASING', `${shelfCode};return ChatShelf`)(200, 'cubic-bezier(.2,.75,.3,1)');
const Fixture = new Function('ChatShelf', 'HistoryWindow', 'gsap', 'window', 'document', 'matchMedia', 'URL', 'writePromptDraft',
  `${code};return Fixture`)(ChatShelf, HistoryWindow, gsap, { clearTimeout: id => clearedTimers.push(id) }, { activeElement: null }, () => ({ matches: true }), { revokeObjectURL: url => revoked.push(url) }, (key, text) => { persisted.set(key, text); return true; });
const classList = (initial = []) => { const names = new Set(initial); return { contains: name => names.has(name), add: name => names.add(name), remove: name => names.delete(name) }; };
function create() {
  const fixture = new Fixture(), file = { name: 'draft.png', type: 'image/png', async arrayBuffer() { return new Uint8Array([1, 2]).buffer; } };
  const textarea = { value: 'Keep my draft', disabled: false, focus() {} };
  const list = { children: [{}], replaceChildren() { this.children = []; } };
  const rows = { children: [{}], dataset: { sig: 'old queue' }, replaceChildren() { this.children = []; } };
  const queue = { hidden: false, querySelector: () => rows };
  const preview = { open: false, querySelectorAll: () => [] };
  const elements = { '.cp-list': list, '.cp-queue': queue, '.cp-zoom': preview, '.cp-empty': {}, textarea };
  fixture.el = { classList: classList(['open']), style: {}, offsetWidth: 440, contains: () => false,
    querySelector: selector => elements[selector], querySelectorAll: () => [] };
  fixture.tab = { hidden: true, querySelector: () => ({}), setAttribute() {} };
  Object.assign(fixture, {
    desk: { threadId: 'A' }, history: new HistoryWindow(), historyGeneration: 10, loadingHistory: false, loadingOlder: true,
    reviewPapers: new Map(), reviewLookups: new Map(), toolGroups: new Map(), shown: new Map([['old', {}]]), groups: new Map([['old', {}]]), renderedMessages: new Map([['old', {}]]), timelineIds: ['old'],
    queueLatest: [{ text: 'Old queue' }], queueHold: 0, timer: 42, typingOn: true, collapsed: false,
    files: [file], refs: [{ id: 'reference' }], drafts: new Map(), previews: new Map([[file, 'blob:draft']]),
    pending: [{ threadId: 'earlier', text: 'Retain pending', at: 0 }], sending: new Set(), sendErrors: new Map([['earlier', 'Retain error']]),
    refLoads: new Map(), queueCleanups: new Set(), paired: false,
    stopComposerTyping() {}, dictation: { cancel() {} }, closeMenu() {}, onCollapse() {}, wide: () => 440,
    renderPending() {}, renderChips() {}, refreshSoon() {}, note() {}, renderHistory() { throw Error('Closed chat repopulated'); },
    api: { async saveAttachment() { return 'E:/fixture.png'; }, async conversation() { return []; } },
  });
  fixture.history.rows.set('old', { text: 'Old conversation' });
  return { fixture, textarea, file, list, rows, queue, preview };
}
function submitFor(fixture, textarea) {
  return new Function('ta', 'grow', 'writePromptDraft', 'harnessName', 'refBlock',
    `return function(){${submitCode};return submit}.call(this)`)
    .call(fixture, textarea, () => {}, (key, text) => { persisted.set(key, text); return true; }, () => 'Fixture', () => 'Reference');
}

const closed = create(), c = closed.fixture, oldHistory = c.history;
const files = c.files, refs = c.refs, pending = c.pending, sending = c.sending, errors = c.sendErrors;
c.setCollapsed(true, false);
assert.equal(c.shown.size, 1); assert.equal(c.history, oldHistory); assert.equal(closed.list.children.length, 1);
assert.equal(c.threadId, 'A'); assert.equal(c.isOpen, true, 'Collapse keeps the selected conversation live');
c.close();
assert.equal(c.desk, null); assert.equal(c.shown.size, 0); assert.equal(c.groups.size, 0); assert.equal(c.renderedMessages.size, 0);
assert.equal(c.timelineIds, null); assert.notEqual(c.history, oldHistory); assert.equal(c.history.rows.size, 0);
assert.equal(closed.list.children.length, 0); assert.equal(closed.rows.children.length, 0); assert.equal(closed.queue.hidden, true);
assert.equal(c.queueLatest.length, 0); assert.equal(c.timer, 0); assert.ok(clearedTimers.includes(42));
assert.equal(c.files, files); assert.equal(c.refs, refs); assert.equal(c.pending, pending); assert.equal(c.sending, sending); assert.equal(c.sendErrors, errors);
assert.equal(c.drafts.get('A').text, 'Keep my draft'); assert.equal(c.drafts.get('A').files, files); assert.equal(persisted.get('chat:A'), 'Keep my draft');
const generation = c.historyGeneration; c.close(); assert.equal(c.historyGeneration, generation, 'Repeated close is idempotent');

const delayed = create();
let reply;
delayed.fixture.api.conversationPage = () => new Promise(resolve => { reply = resolve; });
const refresh = delayed.fixture.refresh(); delayed.fixture.close();
reply({ messages: [{ id: 'late', text: 'Late reply' }], cursor: null, hasMore: false }); await refresh;
assert.equal(delayed.fixture.shown.size, 0); assert.equal(delayed.fixture.history.rows.size, 0);
const rejected = create(); let rejectReply, retries = 0;
rejected.fixture.refreshSoon = () => retries++;
rejected.fixture.api.conversationPage = () => new Promise((_resolve, reject) => { rejectReply = reject; });
const failingRefresh = rejected.fixture.refresh(); rejected.fixture.close(); rejectReply(Error('Late read failure')); await failingRefresh;
assert.equal(retries, 0, 'A failed old read cannot recreate the refresh timer after close');

for (const failed of [false, true]) {
  const sent = create(), f = sent.fixture; f.refs = [];
  let accept, submitted;
  const waiting = new Promise(resolve => { submitted = resolve; });
  f.api.sendMessage = () => { submitted(); return new Promise((resolve, reject) => { accept = () => failed ? reject(Error('Fixture send failed')) : resolve({ ok: true }); }); };
  const action = submitFor(f, sent.textarea)({ preventDefault() {} });
  await waiting; f.close(); const before = revoked.length; accept(); await action;
  if (failed) {
    assert.ok(f.drafts.has('A')); assert.ok(f.previews.has(sent.file)); assert.equal(revoked.length, before);
    assert.equal(f.files[0], sent.file); assert.ok(f.sendErrors.get('A').includes('Fixture send failed'));
  } else {
    assert.ok(!f.drafts.has('A')); assert.ok(!f.previews.has(sent.file)); assert.equal(revoked.length, before + 1);
    assert.equal(f.files.length, 0, 'A successful closed send must release the stale composer File reference');
  }
}
const switched = create(), active = switched.fixture; active.refs = [];
let completeSwitched, switchedStarted;
const switchedWait = new Promise(resolve => { switchedStarted = resolve; });
active.api.sendMessage = () => { switchedStarted(); return new Promise(resolve => { completeSwitched = () => resolve({ ok: true }); }); };
const switchedSend = submitFor(active, switched.textarea)({ preventDefault() {} });
await switchedWait; active.saveDraft();
const otherFile = { name: 'other.png' }, otherFiles = [otherFile];
active.desk = { threadId: 'B' }; active.files = otherFiles; active.previews.set(otherFile, 'blob:other');
active.drafts.set('B', { text: 'New composer draft', files: otherFiles, refs: [] });
completeSwitched(); await switchedSend;
assert.equal(active.files, otherFiles); assert.equal(active.drafts.get('B').files, otherFiles); assert.ok(active.previews.has(otherFile));
assert.ok(!active.previews.has(switched.file));
const shared = create(), s = shared.fixture;
s.saveDraft(); s.drafts.set('B', { text: 'Other draft', files: [shared.file], refs: [] });
s.drafts.delete('A'); s.desk = { threadId: 'C' }; s.files = [];
s.releaseUnusedPreviews(); assert.ok(s.previews.has(shared.file), 'Another draft still owns a reused File');
s.drafts.clear(); s.files = [shared.file]; s.releaseUnusedPreviews(); assert.ok(s.previews.has(shared.file), 'The active composer still owns the File');
s.files = []; shared.preview.open = true; shared.preview.querySelectorAll = () => [{ src: 'blob:draft' }];
s.releaseUnusedPreviews(); assert.ok(s.previews.has(shared.file), 'An open media preview owns its URL until closed');
shared.preview.open = false; s.releaseUnusedPreviews(); assert.ok(!s.previews.has(shared.file));
console.log('Chat close passed: actual collapse/close/submit methods, transcript and queue release, drafts and pending state, stale replies, repeated close, background success/failure and shared preview ownership.');
