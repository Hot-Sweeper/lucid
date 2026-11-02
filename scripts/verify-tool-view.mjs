// Presentation model for operations without an app of their own (T3 Code attachments, other MCP tools).
// Checks that every statement on screen comes from the event, and that outcomes follow real status.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const source = await readFile(new URL('../src/os/tool-view.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source, 'tool-view.ts')).code.replace(/^export /gm, '');
const m = new Function(`${code};return {describeTool,toolViewHtml,toolViewKey,factTitles,findUpload,phaseOf,formatSize,shortId,toolActivity,isT3Tool,prettyTool,readableNote,uploadIdOf};`)();

const T3 = 'mcp__t3-code__';
const id = 'pending-0ce4b802-9e93-426a-a139-5e2f0c3d4b11';
const html = (name, input, state, up) => m.toolViewHtml(m.describeTool(name, input, state, up), m.factTitles(name, input, state));
const dashes = /[\u2013\u2014]/;

// The exact operation from the screenshot: only an upload identifier, still running.
let v = m.describeTool(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'running' });
assert.equal(v.brand, 't3'); assert.equal(v.app, 'T3 Code'); assert.equal(v.phase, 'pending');
assert.equal(v.headline, 'Discarding upload');
assert.equal(v.subject.file, undefined, 'no file name is invented when none was reported');
assert.equal(v.subject.label, 'Unsent upload');
assert.equal(v.facts.length, 1); assert.equal(v.facts[0].label, 'Upload');
assert.ok(v.facts[0].value.includes('\u2026') && v.facts[0].value.length < id.length, 'identifier is shortened');
assert.equal(m.factTitles(T3 + 't3_attachment_discard', { attachmentId: id }, {})[0], id, 'full identifier stays readable on hover');
let h = html(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'running' });
assert.ok(h.includes('tv-spin'), 'running shows the honest turning arc');
assert.ok(!/%|<progress|progressbar|width:\s*\d/.test(h), 'no percentage or progress bar');
assert.ok(!/attachmentId|t3 attachment/i.test(h), 'raw argument and tool names stay out of the copy');

// Outcomes follow the real status.
assert.equal(m.describeTool(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'completed', output: { content: [{ type: 'text', text: '{"ok":true}' }] } }).headline, 'Upload discarded');
v = m.describeTool(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'completed', output: { content: [{ text: '{"ok":true}' }] } });
assert.equal(v.phase, 'done'); assert.equal(v.note, '', 'a JSON result is not dumped as prose');
v = m.describeTool(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'failed', output: { isError: true, content: [{ text: 'Attachment was already sent.' }] } });
assert.equal(v.phase, 'failed'); assert.equal(v.headline, 'Upload could not be discarded'); assert.equal(v.note, 'Attachment was already sent.');
assert.equal(m.phaseOf({ status: 'completed', output: { isError: true } }), 'failed', 'an error result is a failure even when the item completed');
assert.equal(m.phaseOf({ status: 'cancelled' }), 'failed'); assert.equal(m.phaseOf({ status: 'pending' }), 'pending'); assert.equal(m.phaseOf({}), 'pending');
v = m.describeTool(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'failed' });
assert.equal(v.note, '', 'no reason is fabricated when the tool gave none');
assert.equal(m.readableNote({ content: [{ text: 'Error\n   at foo (bar.js:1)' }] }), '', 'stack traces stay out');
assert.ok(m.readableNote({ content: [{ text: 'x'.repeat(400) }] }).length <= 160);

// Names and sizes come from a real earlier prepare call, matched through the identifier it returned.
const prepared = { type: 'dynamic_tool', data: { toolName: T3 + 't3_attachment_prepare_upload', input: { upload: { type: 'image', name: 'before-after review capture with a very long descriptive name that keeps going.png', mimeType: 'image/png', sizeBytes: 1843200 } }, output: { structuredContent: { attachmentId: id, relativeUrl: '/upload/x' } } } };
const other = { type: 'dynamic_tool', data: { toolName: T3 + 't3_attachment_prepare_upload', input: { upload: { type: 'file', name: 'notes.pdf', mimeType: 'application/pdf', sizeBytes: 900 } }, output: { content: [{ text: JSON.stringify({ attachmentId: 'pending-other' }) }] } } };
const found = m.findUpload([other, prepared, { type: 'command_execution', data: {} }], id);
assert.equal(found.name, prepared.data.input.upload.name); assert.equal(found.size, 1843200);
assert.equal(m.findUpload([other], id), null, 'no match means no metadata');
assert.equal(m.findUpload([{ type: 'dynamic_tool', data: { toolName: T3 + 't3_attachment_prepare_upload', input: { upload: { name: 'x.png' } }, output: 'garbage' } }], id), null);
const sent = { type: 'dynamic_tool', data: { toolName: T3 + 't3_thread_send_attachments', input: { attachments: [{ type: 'file', id, name: 'spec.md', mimeType: 'text/markdown', sizeBytes: 2048 }] } } };
assert.equal(m.findUpload([sent], id).name, 'spec.md');
h = html(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'completed' }, () => found);
assert.ok(h.includes('before-after review capture'), 'real name shown'); assert.ok(h.includes('PNG image \u00b7 1.8 MB'), 'real type and size shown');
assert.ok(h.includes('tv-tile img'), 'image tile for an image'); assert.ok(h.includes(`title="${prepared.data.input.upload.name}"`), 'full name available on hover');
assert.ok(!/<img/i.test(h), 'no preview is drawn without pixels');

// Prepare shows the file named in its own arguments.
h = html(T3 + 't3_attachment_prepare_upload', prepared.data.input, { status: 'completed', output: prepared.data.output });
assert.ok(h.includes('Upload ready') && h.includes('PNG image'));
v = m.describeTool(T3 + 't3_attachment_prepare_upload', { upload: { type: 'file', name: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 52 } }, { status: 'running' });
assert.equal(v.headline, 'Preparing upload'); assert.equal(v.subject.file.name, 'report.pdf');
assert.ok(m.toolViewHtml(v).includes('<b>PDF</b>'), 'extension tile for a document');
v = m.describeTool(T3 + 't3_attachment_prepare_upload', {}, { status: 'running' });
assert.equal(v.subject.label, 'Upload', 'malformed arguments fall back safely');

// Other operations keep a quiet, truthful fallback; unknown tools still render.
v = m.describeTool(T3 + 't3_project_list', {}, { status: 'completed' });
assert.equal(v.headline, 'Project list'); assert.deepEqual(v.facts, []);
v = m.describeTool('mcp__weather__get_forecast', { city: 'Berlin', apiKey: 'sk-live-123', nested: { a: 1 } }, { status: 'running' });
assert.equal(v.brand, 'generic'); assert.equal(v.app, 'Weather'); assert.equal(v.headline, 'Get forecast');
assert.equal(v.facts.find((f) => f.label === 'Api key').value, 'Hidden', 'secret-looking values are not drawn');
assert.ok(!JSON.stringify(v).includes('sk-live'));
v = m.describeTool('weird tool', 'not json', { status: 'completed' });
assert.equal(v.app, 'Tool'); assert.deepEqual(v.facts, []);
v = m.describeTool('x', null, undefined); assert.equal(v.phase, 'pending');
assert.equal(m.toolActivity(T3 + 't3_attachment_discard'), 'Discarding upload'); assert.equal(m.toolActivity('mcp__weather__get_forecast'), 'Using get forecast');

// Markup is escaped and stable.
h = html('mcp__x__y', { q: '<img src=x onerror=alert(1)>' }, { status: 'completed' });
assert.ok(!h.includes('<img') && h.includes('&lt;img'));
const a = m.describeTool(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'running' });
assert.equal(m.toolViewKey(a), m.toolViewKey(m.describeTool(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'pending' })), 'an unchanged state does not repaint');
assert.notEqual(m.toolViewKey(a), m.toolViewKey(m.describeTool(T3 + 't3_attachment_discard', { attachmentId: id }, { status: 'completed' })));
assert.equal(m.formatSize(999), '999 B'); assert.equal(m.formatSize(1536), '1.5 KB'); assert.equal(m.formatSize(52428800), '52.4 MB'); assert.equal(m.formatSize(undefined), '');
assert.ok(!dashes.test(source.replace(/\/\/.*$/gm, '')), 'no em or en dashes in interface copy');
console.log('tool view presentation verified');
