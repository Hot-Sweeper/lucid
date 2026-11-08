const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { signedHeaders, verifier } = require('../electron/studio-auth.cjs');
const { projectFile, publicAssetPath } = require('../electron/studio-paths.cjs');
const { externalUrl, open } = require('../electron/external-links.cjs');
async function main() {
  const pair = crypto.generateKeyPairSync('ed25519'), verify = verifier(pair.publicKey), data = Buffer.from('{"project":"first"}');
  const headers = signedHeaders(pair.privateKey, 'POST', '/projects/first/send', data);
  assert(verify('POST', '/projects/first/send', headers, data));
  assert(!verify('POST', '/projects/first/send', headers, data), 'Signed requests cannot be replayed');
  const h = signedHeaders(pair.privateKey, 'POST', '/projects/first/send', data);
  assert(!verify('POST', '/projects/second/send', h, data), 'Signatures bind the exact project');
  assert(!verify('GET', '/projects/first/send', h, data));
  assert(!verify('POST', '/projects/first/send', h, Buffer.from('{}')));
  assert(!verify('POST', '/projects/first/send', signedHeaders(pair.privateKey, 'POST', '/projects/first/send', data, Date.now() - 120000), data));
  assert(!verify('POST', '/projects/first/send', {}, data));
  assert.equal(publicAssetPath('/node_modules/.vite/deps/react.js?v=abc'), '/node_modules/.vite/deps/react.js?v=abc');
  for (const value of ['/node_modules/.env', '/@fs/C:/private', '/%40fs/C:/private', '/__open-in-editor?file=secret', '/.git/config', '//example.com/secret', '/foo/%2e%2e/.env']) assert.throws(() => publicAssetPath(value));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-studio-paths-'));
  try {
    fs.mkdirSync(path.join(root, 'site')); fs.writeFileSync(path.join(root, 'site', 'index.html'), '<h1>Real project</h1>'); fs.writeFileSync(path.join(root, 'credential.pem'), 'test');
    fs.symlinkSync(path.join(root, 'credential.pem'), path.join(root, 'site', 'escape.txt'));
    assert.equal(projectFile(path.join(root, 'site'), '/'), path.join(root, 'site', 'index.html'));
    for (const value of ['/../credential.pem', '/%2e%2e/credential.pem', '/.env', '/escape.txt', '/node_modules/private.js', '/x\\secret', '/%00']) assert.throws(() => projectFile(path.join(root, 'site'), value));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  for (const value of ['javascript:alert(1)', 'file:///tmp/private', 'https://u:p@example.com', 'https://example.com\n']) assert.equal(externalUrl(value), null);
  let opened; assert((await open({ openExternal: async url => { opened = url; } }, 'https://example.com/site')).ok); assert.equal(opened, 'https://example.com/site');
  assert.equal((await open({ openExternal: async () => { throw Error('No browser'); } }, 'https://example.com')).ok, false);
  const { Stage, matchChildren } = await import(pathToFileURL(path.resolve(__dirname, '../electron/studio-public/stage.mjs')));
  const el = (id, text, cls = '') => ({ id, textContent: text, tagName: 'SECTION', getAttribute: key => key === 'class' ? cls : null });
  assert.deepEqual(matchChildren([el('hero', 'Old'), el('cats', 'Cats')], [el('cats', 'Cats'), el('hero', 'New')]), [[0, 1], [1, 0]], 'Stable ids survive rewrites and moves');
  assert.deepEqual(matchChildren([el('', 'A'), el('', 'B')], [el('', 'B'), el('', 'New'), el('', 'A')]), [[0, 2], [1, 0]], 'Repeated siblings use content identity, not index');
  let release, started = 0; const gates = [], shown = [];
  const owner = { project: 'one', draining: false, pendingRender: null, queue: Promise.resolve(), refresh: async (v, opts) => { started++; if (v === 1) await new Promise(resolve => { release = resolve; }); shown.push([v, opts.animate]); } };
  const first = Stage.prototype.enqueue.call(owner, 1, { animate: true });
  for (let v = 2; v <= 100; v++) gates.push(Stage.prototype.enqueue.call(owner, v, { animate: true }));
  assert.equal(started, 1); release(); await first; await Promise.all(gates);
  assert.deepEqual(shown, [[1, true], [100, true]], 'Fast saves coalesce to one latest pending render');
  owner.project = null; await Stage.prototype.enqueue.call(owner, 101, { animate: true }); assert.equal(shown.length, 2, 'Closed projects cannot render stale queued work');
  console.log('Studio: signed requests, replay rejection, project/path isolation, link failures, element identity and bounded version reconciliation passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
