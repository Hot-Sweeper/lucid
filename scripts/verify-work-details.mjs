import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, root: process.cwd(), logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { buildWorkDetails } = await server.ssrLoadModule('/src/office/work-details.ts');
  const messages = [
    { role: 'user', text: 'Fix hiring\n\n<lucid-work-skill>\nprivate instructions', attachments: [{ type: 'image', path: '/tmp/reference.png' }] },
    { role: 'assistant', text: 'Old progress', attachments: [{ type: 'image', path: '/tmp/old.png' }] },
    { role: 'assistant', text: 'Working result.\n\n![After: working screen](</tmp/result with space.png>)\n\n[Before: original](/tmp/before.png)\n\n![Duplicate](/tmp/before.png)\n\n```md\n![Not evidence](/tmp/code.png)\n```\n\n![Bad](javascript:bad.png)\n\n![Bad remote](https://user:secret@example.com/leak.png)\n\n[Docs](https://example.com)', at: '2026-11-08T10:00:00Z' },
  ];
  const result = buildWorkDetails(messages, 'local', s => `<verified>${s}</verified>`);
  assert.equal(result.task, 'Fix hiring');
  assert.equal(result.images.length, 3);
  assert.equal(result.images[0].name, 'After: working screen');
  assert(result.images[0].url.includes(encodeURIComponent('/tmp/result with space.png')));
  assert(!result.images.some(i => /reference|code|secret/.test(i.url)));
  assert.equal(result.reportHtml.startsWith('<verified>Working result.'), true);
  const remote = buildWorkDetails(messages, 'machine::thread', s => s);
  assert(remote.images[0].url.startsWith('lucid-file://remote/'));
  const empty = buildWorkDetails([], 'local', s => s);
  assert.equal(empty.report, ''); assert.deepEqual(empty.images, []);
  assert.equal(buildWorkDetails([{ role:'assistant', text: 'Only text' }], 'local', s => s).report, 'Only text');
  console.log('Work details passed: Markdown images and file links, spaces, deduplication, code isolation, reference exclusion, safe schemes, remote ownership and empty reports.');
} finally { await server.close(); }
