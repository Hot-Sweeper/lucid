// Images and other media of threads on another computer (linked buildings)
// live on that computer. lucid-file://remote/<thread ref>/<path> asks that computer's T3
// for a signed asset URL and streams the bytes back, through the same authenticated link
// as its other data. Nothing is read from this computer's disk for a remote thread.
const path = require('node:path');

const MEDIA = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus']);
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif' };

/** Parses lucid-file://remote/<encoded thread ref>/<encoded path>. */
function parseRemoteMediaUrl(url, split) {
  const u = new URL(url);
  if (u.hostname !== 'remote') return null;
  const [threadPart, ...rest] = u.pathname.slice(1).split('/');
  const thread = decodeURIComponent(threadPart || ''), file = decodeURIComponent(rest.join('/'));
  const target = split(thread);
  if (!target || !file) return null;
  return { environmentId: target.environmentId, threadId: target.id, file, ext: path.extname(file.replace(/\\/g, '/')).toLowerCase() };
}

/** The asset T3 can sign: a chat attachment by id when the path is in T3's attachment folder, else the thread's media file. */
function assetResource({ threadId, file, ext }) {
  const name = file.replace(/\\/g, '/').split('/').pop() || '';
  const inAttachments = /[\\/]\.t3[\\/]userdata[\\/]attachments[\\/]/i.test(file) || /[\\/]attachments[\\/][^\\/]+$/i.test(file);
  if (inAttachments && ext) return { _tag: 'attachment', attachmentId: name.slice(0, -ext.length), fileName: name, ...(TYPES[ext] ? { mimeType: TYPES[ext] } : {}), disposition: 'inline' };
  return { _tag: 'media-file', threadId, path: file };
}

function createRemoteMedia({ client, split, now = Date.now, maxEntries = 48, maxBytes = 64 * 1024 * 1024, ttlMs = 10 * 60_000 }) {
  const cache = new Map(), pending = new Map();
  let bytes = 0;
  const evict = () => {
    for (const [key, entry] of cache) if (now() - entry.at > ttlMs || cache.size > maxEntries || bytes > maxBytes) { cache.delete(key); bytes -= entry.body.length; } else break;
  };
  async function load(target) {
    const resource = assetResource(target);
    let signed;
    try { signed = await client.rpc(target.environmentId, 'assets.createUrl', { resource }); }
    catch (error) {
      // An attachment path that T3 does not know as an attachment may still be a readable media file.
      if (resource._tag !== 'attachment') throw error;
      signed = await client.rpc(target.environmentId, 'assets.createUrl', { resource: { _tag: 'media-file', threadId: target.threadId, path: target.file } });
    }
    if (!signed?.relativeUrl || !signed.relativeUrl.startsWith('/')) throw Error('The building returned no file address.');
    const res = await client.raw(target.environmentId, signed.relativeUrl);
    return { body: res.body, type: res.type || TYPES[target.ext] || 'application/octet-stream' };
  }
  async function get(url) {
    const target = parseRemoteMediaUrl(url, split);
    if (!target || !MEDIA.has(target.ext)) return { status: 403 };
    const key = `${target.environmentId}\0${target.threadId}\0${target.file}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at <= ttlMs) { cache.delete(key); cache.set(key, hit); return { status: 200, body: hit.body, type: hit.type }; }
    if (!pending.has(key)) pending.set(key, load(target).then(value => {
      if (value.body.length <= maxBytes / 4) { cache.set(key, { ...value, at: now() }); bytes += value.body.length; evict(); }
      return value;
    }).finally(() => pending.delete(key)));
    try { const value = await pending.get(key); return { status: 200, body: value.body, type: value.type }; }
    catch { return { status: 404 }; }
  }
  return { get, size: () => cache.size };
}

module.exports = { createRemoteMedia, parseRemoteMediaUrl, assetResource };
