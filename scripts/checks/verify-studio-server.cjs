// Studio sessions: which saves can render, what the sandboxed origin may load, dev server proxying
// and navigation guarding. Runs the real module with temporary projects; no Electron window.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const studio = require('../../electron/studio.cjs');

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-check-')));
const write = (rel, text) => { const file = path.join(base, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return file; };
const request = (url, method = 'GET') => ({ url, method });

(async () => {
  try {
    // A static site: a stylesheet save renders the nearest page above it.
    write('site/index.html', '<!doctype html><link rel="stylesheet" href="css/style.css"><h1>Hello</h1>');
    write('site/css/style.css', 'h1 { color: tomato; }');
    write('site/.env', 'SECRET=1');
    write('outside.txt', 'not part of the project');
    fs.symlinkSync(path.join(base, 'outside.txt'), path.join(base, 'site', 'leak.txt'));
    const root = path.join(base, 'site');
    const a = studio.open(1, { root, file: 'css/style.css' });
    assert.equal(a.ok, true); assert.equal(a.kind, 'static'); assert.equal(a.entry, '/index.html'); assert.match(a.origin, /^lucid-studio:\/\/[0-9a-f]{24}$/);
    assert.equal(studio.open(1, { root, file: path.join(root, 'index.html') }).id, a.id, 'The same page reuses its session');
    assert.notEqual(studio.open(2, { root, file: 'index.html' }).id, a.id, 'Sessions belong to one window');

    const page = await studio.serve(request(`${a.origin}/index.html?render=3`));
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    assert.equal(page.headers.get('cache-control'), 'no-store', 'Every render reads the saved files again');
    const csp = page.headers.get('content-security-policy');
    for (const rule of ["default-src 'self' data: blob:", "connect-src 'self'", "frame-src 'self'", "form-action 'none'", "object-src 'none'"]) assert.ok(csp.includes(rule), rule);
    assert.ok(!/https?:/.test(csp), 'Static renders get no network beyond their own files');
    assert.equal(await (await studio.serve(request(`${a.origin}/css/style.css`))).text(), 'h1 { color: tomato; }');
    assert.equal((await studio.serve(request(`${a.origin}/css/style.css`, 'HEAD'))).status, 200);
    assert.equal((await studio.serve(request(`${a.origin}/.env`))).status, 403, 'Hidden files are never served');
    for (const escape of ['%2e%2e/outside.txt', '..%2foutside.txt', 'css/..%2f..%2foutside.txt']) assert.ok([403, 404].includes((await studio.serve(request(`${a.origin}/${escape}`))).status), `${escape} stays inside the project`);
    assert.equal((await studio.serve(request(`${a.origin}/leak.txt`))).status, 403, 'Symlinks out of the project are refused');
    assert.equal((await studio.serve(request(`${a.origin}/missing.css`))).status, 404);
    assert.equal((await studio.serve(request(`${a.origin}/index.html`, 'POST'))).status, 403);
    assert.equal((await studio.serve(request('lucid-studio://000000000000000000000000/index.html'))).status, 404, 'Unknown sessions serve nothing');
    const host = await studio.serve(request(`${a.origin}/__studio/host.html?entry=%2Findex.html`));
    assert.equal(host.status, 200); assert.match(host.headers.get('content-security-policy'), /script-src 'self';/);
    assert.match(await (await studio.serve(request(`${a.origin}/__studio/stage-engine.mjs`))).text(), /export class Stage/);
    assert.equal((await studio.serve(request(`${a.origin}/__studio/../studio.cjs`))).status, 404);

    // Files outside the project, and projects with nothing to show.
    assert.equal(studio.open(1, { root, file: '../outside.txt' }).reason, 'outside');
    assert.equal(studio.open(1, { thread: 'env-2::thread-1', root, file: 'index.html' }).reason, 'remote', 'A linked computer never renders from this disk');
    assert.equal(studio.open(1, { root: '/' }).reason, 'no-project');
    write('api/server.js', 'module.exports = 1;');
    assert.equal(studio.open(1, { root: path.join(base, 'api'), file: 'server.js' }).reason, 'no-page');

    // A framework project renders only through the dev server the robot started.
    write('app/package.json', JSON.stringify({ devDependencies: { vite: '^8.0.0' } }));
    write('app/index.html', '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
    write('app/src/App.tsx', 'export default () => null;');
    const app = path.join(base, 'app');
    assert.equal(studio.open(1, { root: app, file: 'src/App.tsx' }).reason, 'needs-server');
    assert.equal(studio.needsServer(app, path.join(app, 'index.html'), null), true);
    assert.equal(studio.open(1, { root: app, file: 'src/App.tsx', server: 'https://example.com/' }).reason, 'needs-server', 'Only local dev servers');
    const s = studio.open(1, { root: app, file: 'src/App.tsx', server: 'http://0.0.0.0:5173/' });
    assert.equal(s.kind, 'server'); assert.equal(s.entry, '/');
    const calls = [];
    const fake = (responses) => async (url, init) => { calls.push({ url: String(url), init }); const next = responses.shift(); if (next instanceof Error) throw next; return next; };
    let res = await studio.serve(request(`${s.origin}/src/main.tsx?t=1`), fake([new Response('export {}', { headers: { 'content-type': 'text/javascript', 'set-cookie': 'a=b' } })]));
    assert.equal(calls[0].url, 'http://127.0.0.1:5173/src/main.tsx?t=1'); assert.equal(calls[0].init.redirect, 'manual');
    assert.equal(res.headers.get('content-type'), 'text/javascript'); assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(res.headers.get('content-security-policy'), studio.PAGE_CSP);
    res = await studio.serve(request(`${s.origin}//evil.example/x`), fake([]));
    assert.equal(res.status, 403, 'Protocol-relative paths cannot leave the dev server');
    res = await studio.serve(request(`${s.origin}/old`), fake([new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:5173/new?a=1' } })]));
    assert.equal(res.status, 302); assert.equal(res.headers.get('location'), '/new?a=1');
    res = await studio.serve(request(`${s.origin}/away`), fake([new Response(null, { status: 302, headers: { location: 'https://example.com/' } })]));
    assert.equal(res.status, 403, 'Redirects off the dev server are refused');
    res = await studio.serve(request(`${s.origin}/`), fake([new Error('ECONNREFUSED')]));
    assert.equal(res.status, 502);

    // Owner cleanup and explicit close.
    studio.closeOwner(1);
    assert.equal((await studio.serve(request(`${a.origin}/index.html`))).status, 404, 'A closed window leaves no session behind');
    const b = studio.open(2, { root, file: 'index.html' });
    studio.close(b.id);
    assert.equal((await studio.serve(request(`${b.origin}/index.html`))).status, 404);

    // Studio documents never navigate away from their own origin.
    let handler;
    studio.guardNavigation({ on: (name, fn) => { if (name === 'will-frame-navigate') handler = fn; } });
    const nav = (from, to, isMainFrame = false) => { let blocked = false; handler({ isMainFrame, url: to, frame: { url: from }, preventDefault: () => { blocked = true; } }); return blocked; };
    assert.equal(nav('lucid-studio://abc/__studio/host.html', 'https://example.com/'), true);
    assert.equal(nav('lucid-studio://abc/index.html', 'http://127.0.0.1:9000/'), true);
    assert.equal(nav('lucid-studio://abc/index.html', 'lucid-studio://def/index.html'), true, 'Another session is another project');
    assert.equal(nav('lucid-studio://abc/index.html', 'lucid-studio://abc/about.html'), false);
    assert.equal(nav('about:blank', 'lucid-studio://abc/__studio/host.html'), false, 'The app may open a Studio frame');
    assert.equal(nav('lucid-studio://abc/', 'https://example.com/', true), false, 'Main frames are not Studio frames');
    console.log('Studio server: page detection, project-only static files, dev server proxy, sessions and navigation guard passed.');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
