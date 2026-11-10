// Follow T3: the read-only Local Storage reader on synthetic LevelDB files (log and table,
// Snappy, newest write wins, deletions, other origins), T3's theme resolution (system mode,
// fixed appearance, halves, custom and legacy themes, the environment fallback) and the
// contrast lifting. No T3 installation is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readLocalStorage, signature, snappy } = require('../../electron/chromium-local-storage.cjs');
const { resolveTheme, customThemes, createT3Theme, parseColor, contrast } = require('../../electron/t3-theme.cjs');

const varint = (n) => { const out = []; while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); } out.push(n); return Buffer.from(out); };
const sized = (b) => Buffer.concat([varint(b.length), b]);
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n) => Buffer.concat([u32(n % 4294967296), u32(Math.floor(n / 4294967296))]);
const origin = 't3code://app';
const key = (name, o = origin) => Buffer.concat([Buffer.from(`_${o}\0`, 'latin1'), Buffer.from([1]), Buffer.from(name, 'latin1')]);
const latin = (text) => Buffer.concat([Buffer.from([1]), Buffer.from(text, 'latin1')]);
const utf16 = (text) => Buffer.concat([Buffer.from([0]), Buffer.from(text, 'utf16le')]);
// One log/manifest record per block (CRC is not checked by the reader).
const record = (payload) => Buffer.concat([Buffer.alloc(4), Buffer.from([payload.length & 255, payload.length >> 8, 1]), payload]);
const batch = (seq, ops) => Buffer.concat([u64(seq), u32(ops.length), ...ops.map(([k, v]) => v === null ? Buffer.concat([Buffer.from([0]), sized(k)]) : Buffer.concat([Buffer.from([1]), sized(k), sized(v)]))]);
// Snappy: one long literal for table blocks; a short literal plus a back-reference copy for
// the repeated text check, so both element kinds are exercised.
function compress(raw) {
  const n = raw.length - 1;
  return Buffer.concat([varint(raw.length), Buffer.from([61 << 2, n & 255, n >> 8]), raw]);
}
function compressRepeat(text) {
  const raw = Buffer.from(text), unit = raw.subarray(0, 2), rest = raw.length - 2;
  return Buffer.concat([varint(raw.length), Buffer.from([(unit.length - 1) << 2]), unit, Buffer.from([((rest - 1) << 2) | 2, 2, 0])]);
}
function block(entries, compressed) {
  const body = Buffer.concat([...entries.map(([k, v]) => Buffer.concat([varint(0), varint(k.length), varint(v.length), k, v])), u32(0), u32(1)]);
  return compressed ? Buffer.concat([compress(body), Buffer.from([1]), Buffer.alloc(4)]) : Buffer.concat([body, Buffer.from([0]), Buffer.alloc(4)]);
}
function table(entries, compressed) {
  const internal = entries.map(([k, seq, v]) => [Buffer.concat([k, u64(seq * 256 + (v === null ? 0 : 1))]), v ?? Buffer.alloc(0)]);
  const data = block(internal, compressed);
  const dataSize = data.length - 5;
  const index = block([[Buffer.from('z'), Buffer.concat([varint(0), varint(dataSize)])]], false);
  const indexHandle = Buffer.concat([varint(data.length), varint(index.length - 5)]);
  const footer = Buffer.concat([varint(0), varint(0), indexHandle]);
  return Buffer.concat([data, index, footer, Buffer.alloc(40 - footer.length), Buffer.from('57fb808b247547db', 'hex')]);
}

function storage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-t3-theme-'));
  // MANIFEST: log number 5 (tag 2) and live table 4 (tag 7).
  const edit = Buffer.concat([varint(2), varint(5), varint(7), varint(0), varint(4), varint(1), sized(Buffer.from('a')), sized(Buffer.from('z'))]);
  fs.writeFileSync(path.join(dir, 'MANIFEST-000003'), record(edit));
  fs.writeFileSync(path.join(dir, 'CURRENT'), 'MANIFEST-000003\n');
  // Older values in the compressed table; newer ones and a deletion in the log.
  fs.writeFileSync(path.join(dir, '000004.ldb'), table([
    [key('t3code:theme'), 10, latin('ocean')],
    [key('t3code:theme-appearance-mode'), 11, latin('light')],
    [key('t3code:themes:v1'), 12, latin('[]')],
    [key('t3code:theme', 'https://other.example'), 13, latin('iris')],
  ], true));
  fs.writeFileSync(path.join(dir, '000005.log'), Buffer.concat([
    record(batch(20, [[key('t3code:theme'), latin('grove')], [key('t3code:theme-appearance-mode'), null]])),
    record(batch(22, [[key('t3code:theme-halves:v1'), utf16('{"dark":"iris"}')]])),
  ]));
  return dir;
}

function reader() {
  assert.equal(snappy(compressRepeat('abababababab')).toString(), 'abababababab');
  assert.equal(snappy(compress(Buffer.from('a longer literal run'))).toString(), 'a longer literal run');
  const dir = storage();
  try {
    const keys = ['t3code:theme', 't3code:theme-appearance-mode', 't3code:theme-halves:v1', 't3code:themes:v1'];
    const store = readLocalStorage(dir, origin, keys);
    assert.deepEqual(store, { 't3code:theme': 'grove', 't3code:theme-halves:v1': '{"dark":"iris"}', 't3code:themes:v1': '[]' }, 'newest write wins, deletions remove, other origins are ignored, UTF-16 decodes');
    assert.equal(signature(dir), signature(dir), 'the fingerprint is stable while files are unchanged');
    fs.writeFileSync(path.join(dir, 'CURRENT'), 'garbage');
    assert.equal(readLocalStorage(dir, origin, keys), null, 'an unknown format reads as nothing');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(readLocalStorage(path.join(os.tmpdir(), 'lucid-no-such-folder'), origin, ['x']), null, 'a missing folder reads as nothing');
}

function resolution() {
  // Default T3: follows the system, so both appearances are offered.
  const sys = resolveTheme({});
  assert.equal(sys.mode, 'system'); assert(sys.light && sys.dark); assert.equal(sys.label, 'T3 Code');
  assert.equal(sys.dark.canvas, '#000000', 'T3 Code dark draws a black canvas');
  // A built-in with a fixed appearance offers only that one.
  const grove = resolveTheme({ 't3code:theme': 'grove', 't3code:theme-appearance-mode': 'dark' });
  assert.equal(grove.label, 'Grove'); assert.equal(grove.light, null); assert.match(grove.dark.canvas, /^#[0-9a-f]{6}$/);
  assert.equal(resolveTheme({ 't3code:theme': 'ocean' }).mode, 'light', 'without a mode a theme uses its own appearance');
  // Legacy ids resolve to the built-in and its dark variant.
  const legacy = resolveTheme({ 't3code:theme': 't3-chat-dark' });
  assert.equal(legacy.label, 'T3 Chat'); assert(legacy.dark && !legacy.light);
  // Halves: a different theme for dark while following the system.
  const halves = resolveTheme({ 't3code:theme': 'grove', 't3code:theme-appearance-mode': 'system', 't3code:theme-halves:v1': '{"dark":"iris"}' });
  assert.equal(halves.dark.accent, resolveTheme({ 't3code:theme': 'iris', 't3code:theme-appearance-mode': 'dark' }).dark.accent);
  assert.equal(halves.light.accent, resolveTheme({ 't3code:theme': 'grove', 't3code:theme-appearance-mode': 'light' }).light.accent);
  // Custom themes: their colours win, the rest comes from T3 Chat, unreadable text is lifted.
  const custom = customThemes(JSON.stringify([
    { id: 'nightfall', label: 'Nightfall', appearance: 'dark', colors: { canvas: 'oklch(0.2 0.02 250)', surface: '#1a1d24', sidebar: '#14161c', surfaceRaised: '#20232b', text: '#2a2a2a', textMuted: '#30343c', accent: '#e0a040' } },
    { id: 'system', label: 'Bad', appearance: 'dark', colors: {} },
    { id: 'Bad Id', label: 'Bad', appearance: 'dark', colors: {} },
  ]));
  assert.deepEqual(custom.map((t) => t.id), ['nightfall'], 'reserved and malformed ids are skipped');
  const nightfall = resolveTheme({ 't3code:theme': 'nightfall', 't3code:theme-appearance-mode': 'dark' }, { custom });
  assert.equal(nightfall.label, 'Nightfall');
  assert.equal(nightfall.dark.surface, '#1a1d24');
  for (const ground of ['canvas', 'surface', 'sidebar', 'surfaceRaised']) {
    assert(contrast(parseColor(nightfall.dark.text), parseColor(nightfall.dark[ground])) >= 4.5, `text is readable on ${ground}`);
    assert(contrast(parseColor(nightfall.dark.textMuted), parseColor(nightfall.dark[ground])) >= 4.5, `muted text is readable on ${ground}`);
    assert(contrast(parseColor(nightfall.dark.accentText), parseColor(nightfall.dark[ground])) >= 4.5, `link accent is readable on ${ground}`);
  }
  assert(contrast(parseColor(nightfall.dark.accentForeground), parseColor(nightfall.dark.accent)) >= 4.5, 'accent buttons get readable ink');
  // Unknown ids fall back to T3's default palette, like T3 does.
  assert.equal(resolveTheme({ 't3code:theme': 'gone', 't3code:theme-appearance-mode': 'dark' }).dark.canvas, '#000000');
  // Environment default when the window's storage has no choice.
  const published = [{ id: 'studio', label: 'Studio', appearance: 'dark', dark: { canvas: '#101820', accent: '#ff8040' } }];
  const env = resolveTheme({}, { published, fallbackId: 'studio' });
  assert.equal(env.label, 'Studio'); assert.equal(env.dark.canvas, '#101820');
  // Colour parsing: oklch from T3's palettes, hex and rgb.
  assert.deepEqual(parseColor('#fff'), [1, 1, 1]);
  assert.deepEqual(parseColor('oklch(1 0 0)').map((c) => Math.round(c * 255)), [255, 255, 255]);
  assert.deepEqual(parseColor('rgb(0, 128, 255)').map((c) => Math.round(c * 255)), [0, 128, 255]);
  assert.equal(parseColor('red; background: url(x)'), null, 'only literal colours pass');
}

function caching() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-t3-home-'));
  const dir = storage();
  try {
    fs.mkdirSync(path.join(home, 'userdata', 'themes'), { recursive: true });
    const read = createT3Theme({ storageDir: dir, t3Home: home });
    const first = read();
    assert.equal(first.label, 'Grove'); assert.equal(first.source, 'T3 window');
    assert.equal(read(), first, 'unchanged files answer from the cache');
    const none = createT3Theme({ storageDir: path.join(home, 'missing'), t3Home: path.join(home, 'missing') });
    assert.equal(none(), null, 'no T3 installation: no Follow T3 palette');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); }
}

reader(); resolution(); caching();
console.log('PASS: read-only T3 Local Storage reader (log, Snappy table, newest wins, deletions, origins), T3 theme resolution (system, fixed, halves, custom, legacy, environment), WCAG AA lifting and caching.');
