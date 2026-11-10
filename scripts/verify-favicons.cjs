// Real favicons for the robot browser: icon discovery from the site itself, image sniffing,
// refusal of internal hosts and redirects, byte limits, the disk cache with expiry and its
// size bound. Uses a fake network; nothing is fetched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFavicons, iconLinks, sniff, shrinkIco, internal, validHost } = require('../electron/favicons.cjs');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 7)]);
const ICO = Buffer.concat([Buffer.from([0, 0, 1, 0]), Buffer.alloc(20, 3)]);

function units() {
  for (const a of ['127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) assert(internal(a), `${a} is internal`);
  for (const a of ['93.184.216.34', '140.82.112.3', '2606:4700::1111']) assert(!internal(a), `${a} is public`);
  assert(validHost('github.com')); assert(validHost('docs.python.org'));
  for (const h of ['localhost', '127.0.0.1', 'printer.local', 'a..b', 'evil.com/x', 'x'.repeat(260) + '.com', 'router.lan']) assert(!validHost(h), `${h} is refused`);
  const html = `<html><head><link rel="stylesheet" href="/a.css"><link rel="apple-touch-icon" href="/touch.png"><link rel="icon" type="image/png" sizes="16x16" href="/16.png"><link rel="icon" sizes="48x48" href='/48.png'><link rel="shortcut icon" href="https://cdn.example.org/fav.ico"><link rel=icon href=/logo.svg type="image/svg+xml"></head><body><link rel="icon" href="/late.png"></body></html>`;
  assert.deepEqual(iconLinks(html, 'https://example.com/docs/'), ['https://example.com/48.png', 'https://example.com/16.png', 'https://example.com/logo.svg', 'https://cdn.example.org/fav.ico', 'https://example.com/touch.png'], 'sharp sizes first, links after the head ignored');
  assert.equal(sniff(PNG), 'image/png'); assert.equal(sniff(ICO), 'image/x-icon');
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), 'image/svg+xml');
  assert.equal(sniff(Buffer.from('<!doctype html><html>not an icon</html>'), 'image/png'), null, 'an HTML error page is not an icon');
  // A big multi-size .ico keeps only the image nearest 32 px.
  const entry = (w, size, offset) => { const e = Buffer.alloc(16); e[0] = w; e[1] = w; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(size, 8); e.writeUInt32LE(offset, 12); return e; };
  const bmp16 = Buffer.alloc(100, 1), png32 = PNG, bmp256 = Buffer.alloc(200 * 1024, 2);
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(3, 4);
  const start = 6 + 3 * 16;
  const ico = Buffer.concat([head, entry(16, bmp16.length, start), entry(32, png32.length, start + bmp16.length), entry(0, bmp256.length, start + bmp16.length + png32.length), bmp16, png32, bmp256]);
  assert.deepEqual(shrinkIco(ico), { type: 'image/png', body: png32 }, 'the 32 px PNG inside is kept as PNG');
  const bmpOnly = Buffer.concat([head.subarray(0, 4), Buffer.from([1, 0]), entry(48, bmp16.length, 22), bmp16]);
  const single = shrinkIco(bmpOnly);
  assert.equal(single.type, 'image/x-icon'); assert.equal(single.body.length, 22 + bmp16.length); assert.equal(single.body.readUInt32LE(18), 22, 'a bitmap becomes a one-image .ico');
}

function fakeNet(routes, addresses = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, 'manual', 'redirects are followed by hand so each one is checked');
    const r = routes[url];
    if (!r) return new Response('missing', { status: 404 });
    if (r.redirect) return new Response(null, { status: 301, headers: { location: r.redirect } });
    return new Response(r.body, { status: 200, headers: { 'content-type': r.type } });
  };
  const lookup = async (host) => [{ address: addresses[host] || '93.184.216.34', family: 4 }];
  return { fetchImpl, lookup, calls };
}

async function service() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-favicons-'));
  let clock = Date.parse('2026-11-10T12:00:00Z');
  try {
    const net = fakeNet({
      'https://example.com/': { type: 'text/html', body: '<head><link rel="icon" sizes="32x32" href="/i/32.png"></head>' },
      'https://example.com/i/32.png': { type: 'image/png', body: PNG },
      'https://plain.org/': { type: 'text/html', body: '<head><title>No icon link</title></head>' },
      'https://plain.org/favicon.ico': { type: 'image/x-icon', body: ICO },
      'https://sneaky.net/': { redirect: 'http://intranet.corp/' },
      'https://sneaky.net/favicon.ico': { redirect: 'https://127.0.0.1/favicon.ico' },
      'https://huge.dev/': { type: 'text/html', body: '<head><link rel="icon" href="/big.png"></head>' },
      'https://huge.dev/big.png': { type: 'image/png', body: Buffer.concat([PNG, Buffer.alloc(600 * 1024)]) },
    }, { 'intranet.corp': '10.0.0.5', 'rebind.example': '192.168.1.10' });
    const f = createFavicons({ dir, fetchImpl: net.fetchImpl, lookup: net.lookup, now: () => clock });
    assert.equal(await f.favicon('example.com'), `data:image/png;base64,${PNG.toString('base64')}`);
    assert.equal(await f.favicon('www.example.com'), `data:image/png;base64,${PNG.toString('base64')}`, 'www shares the site icon');
    assert.equal(await f.favicon('plain.org'), `data:image/x-icon;base64,${ICO.toString('base64')}`, '/favicon.ico when the page names none');
    assert.equal(await f.favicon('sneaky.net'), null, 'redirects into internal addresses are refused');
    assert(!net.calls.some((u) => /intranet|127\.0\.0\.1/.test(u)), 'internal targets are never contacted');
    assert.equal(await f.favicon('rebind.example'), null, 'a name resolving to a private address is refused');
    assert.equal(await f.favicon('huge.dev'), null, 'oversized icons are dropped');
    assert.equal(await f.favicon('localhost'), null);

    // Cached on disk: a new service instance answers without the network.
    const count = net.calls.length;
    const again = createFavicons({ dir, fetchImpl: net.fetchImpl, lookup: net.lookup, now: () => clock });
    assert.equal(await again.favicon('example.com'), `data:image/png;base64,${PNG.toString('base64')}`);
    assert.equal(await again.favicon('sneaky.net'), null, 'misses are cached too');
    assert.equal(net.calls.length, count, 'no request for cached icons or recent misses');
    // Concurrent asks share one discovery.
    const fresh = createFavicons({ dir: path.join(dir, 'other'), fetchImpl: net.fetchImpl, lookup: net.lookup, now: () => clock });
    const before = net.calls.length;
    await Promise.all([fresh.favicon('example.com'), fresh.favicon('example.com'), fresh.favicon('example.com')]);
    assert.equal(net.calls.length - before, 2, 'one page and one icon request for three asks');
    // Misses expire after a day, icons after two weeks.
    clock += 2 * 86400000;
    await again.favicon('sneaky.net');
    assert(net.calls.length > count + 2, 'an expired miss is asked again');
    const icons = net.calls.length;
    await again.favicon('example.com');
    assert.equal(net.calls.length, icons, 'a two day old icon is still fresh');

    // The cache stays bounded.
    const many = fakeNet(new Proxy({}, { get: (_t, url) => (String(url).endsWith('/favicon.ico') ? { type: 'image/x-icon', body: ICO } : { type: 'text/html', body: '<head></head>' }) }));
    const bounded = createFavicons({ dir: path.join(dir, 'bounded'), fetchImpl: many.fetchImpl, lookup: many.lookup, now: () => clock++ });
    for (let i = 0; i < 410; i++) await bounded.favicon(`site${i}.example`);
    assert(fs.readdirSync(path.join(dir, 'bounded')).filter((n) => n.endsWith('.json')).length <= 400, 'at most 400 icons are kept');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

(async () => {
  units(); await service();
  console.log('PASS: favicon discovery from the site itself, sniffing, internal host and redirect refusal, size limits, disk cache with expiry, shared requests and the cache bound.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
