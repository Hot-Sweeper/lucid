// HTML an agent hands to T3's preview tools renders from a data: URL, so its local image paths
// must be embedded: image files only, existing files only, size-capped; everything else untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const load = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? { BrowserWindow: class {}, session: {} } : load.call(this, request, ...rest); };
const { embedLocalImages, sourceOf } = require('../../electron/frontend.cjs');
Module._load = load;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-html-'));
const png = path.join(dir, 'qr code.png'), txt = path.join(dir, 'secret.txt'), big = path.join(dir, 'big.png');
fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
fs.writeFileSync(txt, 'nope');
fs.writeFileSync(big, Buffer.alloc(9 * 1024 * 1024));
try {
  const html = `<img src="${png}" alt="QR"><img src='file://${encodeURI(png)}'><img src="${txt}"><img src="${big}"><img src="/missing/x.png"><img src="https://example.com/a.png"><div style="background:url(${png})"></div>`;
  const out = embedLocalImages(html);
  assert.equal((out.match(/data:image\/png;base64,/g) || []).length, 3, 'absolute path, file URL and CSS url() images are embedded');
  assert.ok(out.includes(`src="${txt}"`), 'non-image files are never read into the page');
  assert.ok(out.includes(`src="${big}"`), 'oversized images are left alone');
  assert.ok(out.includes('src="/missing/x.png"'), 'missing files are left alone');
  assert.ok(out.includes('https://example.com/a.png'), 'remote images are untouched');
  const src = sourceOf({ html: `<img src="${png}">` });
  assert.ok(Buffer.from(src.url.split(',')[1], 'base64').toString().includes('data:image/png'), 'the preview page itself carries the embedded image');
  console.log('PASS: preview HTML embeds local images safely (image types only, existing, size-capped) and leaves everything else untouched.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
