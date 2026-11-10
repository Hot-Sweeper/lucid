// Media of threads on another computer is fetched from that computer, never from this disk.
const assert = require('node:assert/strict');
const { createRemoteMedia, parseRemoteMediaUrl, assetResource } = require('../../electron/remote-media.cjs');
const { split, createRemoteBuilding } = require('../../electron/remote-building.cjs');
const url = (thread, file) => `lucid-file://remote/${encodeURIComponent(thread)}/${encodeURIComponent(file)}`;
(async () => {
  const thread = 'ares-env::thread-1';
  const t = parseRemoteMediaUrl(url(thread, 'C:\\Users\\tim\\.t3\\userdata\\attachments\\thread-1-abc.png'), split);
  assert.deepEqual([t.environmentId, t.threadId, t.ext], ['ares-env', 'thread-1', '.png']);
  assert.equal(parseRemoteMediaUrl(url('local-thread', '/x.png'), split), null, 'local threads never go remote');
  assert.deepEqual(assetResource(t), { _tag: 'attachment', attachmentId: 'thread-1-abc', fileName: 'thread-1-abc.png', mimeType: 'image/png', disposition: 'inline' }, 'chat attachments by id');
  assert.deepEqual(assetResource(parseRemoteMediaUrl(url(thread, '/home/tim/project/shot.png'), split)), { _tag: 'media-file', threadId: 'thread-1', path: '/home/tim/project/shot.png' }, 'other media through the thread');

  const calls = [], raws = [];
  let failAttachment = false, failAll = false;
  const client = {
    rpc: async (env, tag, payload) => { calls.push([env, tag, payload.resource._tag]); if (failAll || failAttachment && payload.resource._tag === 'attachment') throw Error('not found'); return { relativeUrl: '/api/assets/signed-' + calls.length, expiresAt: 0 }; },
    raw: async (env, route) => { raws.push([env, route]); return { body: Buffer.from('PNG' + route), type: 'image/png' }; },
  };
  const media = createRemoteMedia({ client, split });
  const first = await media.get(url(thread, 'C:\\Users\\tim\\.t3\\userdata\\attachments\\thread-1-abc.png'));
  assert.equal(first.status, 200); assert.equal(first.type, 'image/png'); assert.equal(raws[0][0], 'ares-env', 'bytes come from the same building');
  await media.get(url(thread, 'C:\\Users\\tim\\.t3\\userdata\\attachments\\thread-1-abc.png'));
  assert.equal(calls.length, 1, 'repeated views use the cache');
  await Promise.all([1, 2, 3].map(() => media.get(url(thread, '/shared.png'))));
  assert.equal(calls.length, 2, 'concurrent views share one request');
  failAttachment = true;
  const fallback = await media.get(url(thread, '/x/attachments/thread-1-zzz.png'));
  assert.equal(fallback.status, 200); assert.deepEqual(calls.slice(-2).map(c => c[2]), ['attachment', 'media-file'], 'unknown attachment falls back to the media file');
  assert.equal((await media.get(url(thread, '/secret.txt'))).status, 403, 'only media files');
  failAll = true;
  assert.equal((await media.get(url(thread, '/missing.png'))).status, 404, 'failures are a plain missing image');
  failAll = false;
  assert.equal((await media.get(url(thread, '/missing.png'))).status, 200, 'and a later view retries');

  // Remote messages keep their attachment ids, as addresses the remote media route understands.
  const building = createRemoteBuilding({ fetch: async () => ({ projection: { thread: {}, runs: [], turnItems: [], messages: [{ id: 'm', role: 'user', createdAt: 'now', text: 'hi', attachments: [{ id: 'thread-1-abc', type: 'image', name: 'image.png', mimeType: 'image/png', sizeBytes: 9 }, { id: 'thread-1-doc', type: 'file', name: 'notes.pdf', mimeType: 'application/pdf', sizeBytes: 9 }] }] } }) });
  const [message] = await building.conversation('ares-env::thread-1');
  assert.deepEqual(message.attachments.map(a => [a.type, a.path]), [['image', '/attachments/thread-1-abc.png'], ['file', '/attachments/thread-1-doc.pdf']]);
  assert.equal(assetResource(parseRemoteMediaUrl(url(thread, message.attachments[0].path), split)).attachmentId, 'thread-1-abc');
  console.log('PASS: remote thread media from its own building, attachment ids, media files, fallback, cache, single flight, media-only, failure and retry.');
})().catch(error => { console.error(error); process.exit(1); });
