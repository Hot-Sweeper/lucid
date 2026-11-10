// Read-only reader for a Chromium Local Storage folder (LevelDB), used to see which theme the
// user picked in T3 Code's own window. It never opens the database through LevelDB, never
// locks or writes, and gives up (returns null) on anything unexpected: a missing folder, a
// format it does not know, or files that changed while it read them.
//
// LevelDB keeps recent writes in .log files (32 KiB blocks of CRC-checked records holding write
// batches) and older ones in .ldb tables (prefix-compressed blocks, optionally Snappy). The
// newest sequence number wins per key. Chromium stores each key as `_<origin>\0` plus a string,
// and every string with a leading 0 (UTF-16LE) or 1 (Latin-1) byte.
const fs = require("node:fs");
const path = require("node:path");

const BLOCK = 32768;
const FOOTER = 48;
const MAX_BYTES = 24 * 1024 * 1024; // a theme lookup must stay cheap

class Bytes {
  constructor(buf, at = 0) { this.buf = buf; this.at = at; }
  get done() { return this.at >= this.buf.length; }
  byte() { if (this.at >= this.buf.length) throw new Error("truncated"); return this.buf[this.at++]; }
  varint() {
    let out = 0, mul = 1;
    for (let i = 0; i < 10; i++) { const b = this.byte(); out += (b & 127) * mul; if (!(b & 128)) return out; mul *= 128; }
    throw new Error("varint");
  }
  take(n) { if (n < 0 || this.at + n > this.buf.length) throw new Error("range"); const s = this.buf.subarray(this.at, this.at + n); this.at += n; return s; }
  sized() { return this.take(this.varint()); }
}
const u32 = (b, i) => b.readUInt32LE(i);
const u64 = (b, i) => u32(b, i) + u32(b, i + 4) * 4294967296;

function snappy(input) {
  const r = new Bytes(input);
  const out = Buffer.alloc(r.varint());
  let w = 0;
  while (!r.done) {
    const tag = r.byte(), kind = tag & 3;
    if (kind === 0) {
      let len = tag >>> 2;
      if (len >= 60) { const extra = len - 59; len = 0; for (let i = 0; i < extra; i++) len += r.byte() * 256 ** i; }
      len += 1;
      if (w + len > out.length) throw new Error("snappy");
      r.take(len).copy(out, w); w += len;
      continue;
    }
    let len, off;
    if (kind === 1) { len = 4 + ((tag >>> 2) & 7); off = ((tag >>> 5) << 8) | r.byte(); }
    else if (kind === 2) { len = (tag >>> 2) + 1; off = r.byte() | (r.byte() << 8); }
    else { len = (tag >>> 2) + 1; off = u32(r.take(4), 0); }
    if (!off || off > w || w + len > out.length) throw new Error("snappy");
    for (let i = 0; i < len; i++, w++) out[w] = out[w - off];
  }
  if (w !== out.length) throw new Error("snappy");
  return out;
}

// Records of a .log or MANIFEST file. A damaged block is skipped, like LevelDB's recovery.
function logRecords(buf) {
  const out = [];
  let parts = null, at = 0;
  while (at + 7 <= buf.length) {
    const left = BLOCK - (at % BLOCK);
    if (left < 7) { at += left; continue; }
    const len = buf[at + 4] | (buf[at + 5] << 8), type = buf[at + 6];
    if (type === 0 || 7 + len > left) { at += left; parts = null; continue; }
    if (at + 7 + len > buf.length) break;
    const data = buf.subarray(at + 7, at + 7 + len);
    at += 7 + len;
    if (type === 1) { out.push(data); parts = null; }
    else if (type === 2) parts = [data];
    else if (type === 3 && parts) parts.push(data);
    else if (type === 4 && parts) { parts.push(data); out.push(Buffer.concat(parts)); parts = null; }
    else parts = null;
  }
  return out;
}

function liveFiles(manifest) {
  const tables = new Set();
  let log = 0, prevLog = 0;
  for (const rec of logRecords(manifest)) {
    const r = new Bytes(rec);
    while (!r.done) {
      const tag = r.varint();
      if (tag === 1) r.sized();
      else if (tag === 2) log = r.varint();
      else if (tag === 3 || tag === 4) r.varint();
      else if (tag === 5) { r.varint(); r.sized(); }
      else if (tag === 6) { r.varint(); tables.delete(r.varint()); }
      else if (tag === 7) { r.varint(); tables.add(r.varint()); r.varint(); r.sized(); r.sized(); }
      else if (tag === 9) prevLog = r.varint();
      else throw new Error("manifest");
    }
  }
  return { tables: [...tables], log, prevLog };
}

function put(entries, key, seq, value) {
  const id = key.toString("latin1");
  const old = entries.get(id);
  if (!old || old.seq < seq) entries.set(id, { key, seq, value });
}

function readBatch(entries, batch) {
  if (batch.length < 12) return;
  const seq = u64(batch, 0), count = u32(batch, 8), r = new Bytes(batch, 12);
  for (let i = 0; i < count; i++) {
    const type = r.byte(), key = r.sized();
    put(entries, key, seq + i, type === 1 ? r.sized() : null);
  }
}

function block(table, handle) {
  const off = handle.varint(), size = handle.varint();
  if (off + size + 5 > table.length) throw new Error("block");
  const data = table.subarray(off, off + size), kind = table[off + size];
  if (kind === 0) return data;
  if (kind === 1) return snappy(data);
  throw new Error("compression");
}
function* blockEntries(b) {
  const restarts = u32(b, b.length - 4), end = b.length - 4 - restarts * 4;
  if (end < 0) throw new Error("block");
  const r = new Bytes(b.subarray(0, end));
  let key = Buffer.alloc(0);
  while (!r.done) {
    const shared = r.varint(), own = r.varint(), vlen = r.varint();
    if (shared > key.length) throw new Error("block");
    key = Buffer.concat([key.subarray(0, shared), r.take(own)]);
    yield [key, r.take(vlen)];
  }
}
function readTable(entries, table) {
  if (table.length < FOOTER) throw new Error("table");
  const footer = new Bytes(table, table.length - FOOTER);
  footer.varint(); footer.varint(); // metaindex handle
  for (const [, handle] of blockEntries(block(table, footer))) {
    for (const [ikey, value] of blockEntries(block(table, new Bytes(handle)))) {
      if (ikey.length < 8) continue;
      const trailer = u64(ikey, ikey.length - 8);
      put(entries, ikey.subarray(0, ikey.length - 8), Math.floor(trailer / 256), trailer % 256 === 1 ? value : null);
    }
  }
}

function chromiumString(b) {
  if (!b || !b.length) return null;
  if (b[0] === 1) return b.subarray(1).toString("latin1");
  if (b[0] === 0 && (b.length - 1) % 2 === 0) return b.subarray(1).toString("utf16le");
  return null;
}

/** A cheap fingerprint of the folder: unchanged files mean an unchanged answer. */
function signature(dir) {
  try {
    return fs.readdirSync(dir).filter((n) => /^(CURRENT|MANIFEST-\d+|\d+\.(log|ldb|sst))$/.test(n)).sort()
      .map((n) => { const s = fs.statSync(path.join(dir, n)); return `${n}:${s.size}:${s.mtimeMs}`; }).join("|");
  } catch { return null; }
}

/**
 * Values of `keys` stored for `origin`, or null if the folder cannot be read safely.
 * Missing keys are simply absent from the result.
 */
function readLocalStorage(dir, origin, keys) {
  try {
    const current = fs.readFileSync(path.join(dir, "CURRENT"), "utf8").trim();
    if (!/^MANIFEST-\d+$/.test(current)) return null;
    const manifest = fs.readFileSync(path.join(dir, current));
    const live = liveFiles(manifest);
    const names = fs.readdirSync(dir);
    const logs = names.filter((n) => { const m = /^(\d+)\.log$/.exec(n); return m && (Number(m[1]) >= live.log || Number(m[1]) === live.prevLog); });
    let total = manifest.length;
    const entries = new Map();
    for (const num of live.tables) {
      const base = String(num).padStart(6, "0");
      const file = names.includes(`${base}.ldb`) ? `${base}.ldb` : `${base}.sst`;
      const buf = fs.readFileSync(path.join(dir, file));
      if ((total += buf.length) > MAX_BYTES) return null;
      readTable(entries, buf);
    }
    for (const name of logs) {
      const buf = fs.readFileSync(path.join(dir, name));
      if ((total += buf.length) > MAX_BYTES) return null;
      for (const batch of logRecords(buf)) readBatch(entries, batch);
    }
    // A compaction while reading could mix generations; the next check reads again.
    if (fs.readFileSync(path.join(dir, "CURRENT"), "utf8").trim() !== current || fs.statSync(path.join(dir, current)).size !== manifest.length) return null;
    const prefix = Buffer.from(`_${origin}\0`, "latin1");
    const wanted = new Set(keys);
    const out = {};
    for (const { key, value } of entries.values()) {
      if (value === null || key.length <= prefix.length || !key.subarray(0, prefix.length).equals(prefix)) continue;
      const name = chromiumString(key.subarray(prefix.length));
      if (name === null || !wanted.has(name)) continue;
      const text = chromiumString(value);
      if (text !== null) out[name] = text;
    }
    return out;
  } catch { return null; }
}

module.exports = { readLocalStorage, signature, snappy, logRecords };
