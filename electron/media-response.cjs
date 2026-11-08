// Byte ranges are required for real seeking through Electron's custom media protocol.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const MIME = { '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime', '.m4v':'video/mp4', '.ogv':'video/ogg', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.aac':'audio/aac', '.flac':'audio/flac', '.opus':'audio/ogg' };
function byteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || !size) return false;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}
function responseHeaders(request, size, type) {
  const range = byteRange(request.headers.get('range'), size);
  const headers = { 'content-type':type, 'accept-ranges':'bytes', 'cache-control':'private, no-cache' };
  if (range === false) return { range, status:416, headers:{ ...headers, 'content-range':`bytes */${size}`, 'content-length':'0' } };
  const start = range?.start ?? 0, end = range?.end ?? size - 1;
  headers['content-length'] = String(Math.max(0, end - start + 1));
  if (range) headers['content-range'] = `bytes ${start}-${end}/${size}`;
  return { range, start, end, status:range ? 206 : 200, headers };
}
async function fileMediaResponse(request, file) {
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) return null; // Pictures and document serving retain their existing pipeline.
  const stat = await fsp.stat(file);
  if (!stat.isFile()) return new Response('missing', {status:404});
  const info = responseHeaders(request, stat.size, type);
  if (info.status === 416 || request.method === 'HEAD' || !stat.size) return new Response(null, info);
  const body = Readable.toWeb(fs.createReadStream(file, { start:info.start, end:info.end, signal:request.signal }));
  return new Response(body, info);
}
function bufferMediaResponse(request, body, type) {
  const info = responseHeaders(request, body.length, type);
  return new Response(info.status === 416 || request.method === 'HEAD' ? null : body.subarray(info.start, info.end + 1), info);
}
module.exports = { byteRange, fileMediaResponse, bufferMediaResponse };
