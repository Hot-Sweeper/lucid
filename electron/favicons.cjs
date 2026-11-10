// Site icons for the robots' browser, fetched from the site itself (its <link rel="icon"> or
// /favicon.ico), never through a third-party favicon service. Icons are cached on disk with an
// expiry and size limits, so a busy office asks each site at most once in a while.
//
// Only public hosts are contacted: names that resolve to loopback, private, link-local or
// other internal addresses are refused, and every redirect is checked the same way.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dns = require("node:dns");
const net = require("node:net");

const OK_TTL = 14 * 86400000, MISS_TTL = 86400000;
const MAX_ENTRIES = 400, MAX_BYTES = 4 * 1024 * 1024;
const MAX_ICON = 512 * 1024, MAX_KEEP = 64 * 1024, MAX_PAGE = 256 * 1024;
const TIMEOUT = 5000, PARALLEL = 4;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

/** True for addresses no public site should resolve to. */
function internal(address) {
  const v = net.isIP(address);
  if (v === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = address.toLowerCase();
    if (x.startsWith("::ffff:")) return internal(x.slice(7));
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x);
  }
  return true;
}

const validHost = (host) => typeof host === "string" && host.length <= 253 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host) && !net.isIP(host) && !/\.(local|localhost|internal|lan|home|arpa)$/.test(host);

/** Kind of image from its first bytes; SVG only when it really is an SVG document. */
function sniff(buf, declared = "") {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && (buf[2] === 1 || buf[2] === 2) && buf[3] === 0) return "image/x-icon";
  if (buf.length >= 6 && /^GIF8[79]a/.test(buf.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  const head = buf.subarray(0, 1024).toString("utf8").replace(/^﻿/, "").trimStart();
  if ((/svg/i.test(declared) || /^<(\?xml|svg|!--)/i.test(head)) && /<svg[\s>]/i.test(buf.toString("utf8"))) return "image/svg+xml";
  return null;
}

/**
 * A multi-size .ico reduced to its image nearest 32 px: a PNG inside is returned as PNG, a bitmap
 * as a one-image .ico. Big icon files (some carry nine sizes) stay small in the cache.
 */
function shrinkIco(buf) {
  if (buf.length < 22) return null;
  const count = buf.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count && 6 + i * 16 + 16 <= buf.length; i++) {
    const at = 6 + i * 16, w = buf[at] || 256, size = buf.readUInt32LE(at + 8), offset = buf.readUInt32LE(at + 12);
    if (!size || offset + size > buf.length) continue;
    const score = Math.abs(w - 32) + (w < 32 ? 8 : 0);
    if (!best || score < best.score) best = { at, size, offset, score };
  }
  if (!best) return null;
  const image = buf.subarray(best.offset, best.offset + best.size);
  if (sniff(image) === "image/png") return { type: "image/png", body: image };
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  buf.copy(head, 6, best.at, best.at + 12);
  head.writeUInt32LE(22, 18);
  return { type: "image/x-icon", body: Buffer.concat([head, image]) };
}

/** Icon links in a page's HTML, best first: sharp PNG or SVG near 32 px, then the rest. */
function iconLinks(html, base) {
  const out = [];
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, MAX_PAGE);
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const attr = (name) => { const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag); return m ? (m[1] ?? m[2] ?? m[3]).trim() : ""; };
    const rel = attr("rel").toLowerCase().split(/\s+/);
    if (!rel.includes("icon") && !rel.includes("apple-touch-icon")) continue;
    const href = attr("href").replace(/&amp;/g, "&");
    if (!href) continue;
    let url;
    try { url = new URL(href, base); } catch { continue; }
    if (!/^(https?|data):$/.test(url.protocol)) continue;
    const type = attr("type").toLowerCase();
    const size = Math.max(0, ...attr("sizes").split(/\s+/).map((s) => Number(/^(\d+)x\d+$/i.exec(s)?.[1] || 0)));
    const svg = type.includes("svg") || /\.svg(\?|$)/i.test(url.pathname);
    // Prefer about 32 to 64 pixels; an SVG scales; an apple-touch-icon is large but sharp.
    const score = svg ? 70 : size ? 100 - Math.abs(Math.min(size, 192) - 48) / 2 : rel.includes("apple-touch-icon") ? 55 : 60;
    out.push({ url: url.href, score });
  }
  return out.sort((a, b) => b.score - a.score).map((l) => l.url);
}

function createFavicons({ dir, fetchImpl = globalThis.fetch, lookup = (h) => dns.promises.lookup(h, { all: true }), now = () => Date.now() } = {}) {
  let index = null; // cache file name -> { at, size }; the host is hashed into the name
  const pending = new Map();
  let running = 0;
  const queue = [];

  const nameOf = (host) => crypto.createHash("sha1").update(host).digest("hex") + ".json";
  // Only names and stats are read up front, so the first lookup stays cheap.
  function load() {
    if (index) return index;
    index = new Map();
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!/^[0-9a-f]{40}\.json$/.test(name)) continue;
        try { const st = fs.statSync(path.join(dir, name)); index.set(name, { at: st.mtimeMs, size: st.size }); } catch {}
      }
    } catch {}
    return index;
  }
  function save(host, type, data) {
    const name = nameOf(host), file = path.join(dir, name);
    const entry = { host, at: now(), type, data: data ? data.toString("base64") : null };
    try {
      fs.mkdirSync(dir, { recursive: true });
      const text = JSON.stringify(entry);
      fs.writeFileSync(file + ".tmp", text);
      fs.renameSync(file + ".tmp", file);
      load().set(name, { at: entry.at, size: text.length });
      prune();
    } catch {}
  }
  // Oldest entries go first once the cache holds too many icons or too many bytes.
  function prune() {
    if (index.size <= MAX_ENTRIES && [...index.values()].reduce((s, e) => s + e.size, 0) <= MAX_BYTES) return;
    const all = [...index.entries()].sort((a, b) => a[1].at - b[1].at);
    let bytes = all.reduce((s, [, e]) => s + e.size, 0);
    while (all.length && (all.length > MAX_ENTRIES || bytes > MAX_BYTES)) {
      const [name, e] = all.shift();
      bytes -= e.size;
      index.delete(name);
      try { fs.unlinkSync(path.join(dir, name)); } catch {}
    }
  }
  /** The cached answer: a data URL, null for a known miss, undefined when unknown or expired. */
  function cached(host) {
    const name = nameOf(host);
    if (!load().has(name)) return undefined;
    try {
      const e = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (e.host !== host || !Number.isFinite(e.at) || now() - e.at > (e.type ? OK_TTL : MISS_TTL)) return undefined;
      return e.type && e.data ? `data:${e.type};base64,${e.data}` : null;
    } catch { return undefined; }
  }

  async function publicUrl(href) {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || !validHost(u.hostname.toLowerCase())) return null;
    const addrs = await lookup(u.hostname).catch(() => []);
    if (!addrs.length || addrs.some((a) => internal(a.address))) return null;
    return u;
  }
  // GET with manual redirects (each target checked again) and a byte limit.
  // A page may stop at the limit (its <head> comes first); an icon over the limit is dropped.
  async function get(href, limit, accept, partial = false) {
    for (let hop = 0; hop < 4; hop++) {
      const u = await publicUrl(href);
      if (!u) return null;
      const res = await fetchImpl(u.href, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT), headers: { "user-agent": UA, accept } });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        try { await res.body?.cancel(); } catch {}
        if (!next) return null;
        href = new URL(next, u).href;
        continue;
      }
      if (!res.ok || !res.body) { try { await res.body?.cancel(); } catch {} return null; }
      const declared = Number(res.headers.get("content-length") || 0);
      if (!partial && declared > limit * 4) { try { await res.body.cancel(); } catch {} return null; }
      const chunks = [];
      let size = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          try { await reader.cancel(); } catch {}
          if (!partial) return null;
          chunks.push(Buffer.from(value).subarray(0, value.length - (size - limit)));
          break;
        }
        chunks.push(Buffer.from(value));
      }
      return { body: Buffer.concat(chunks), type: res.headers.get("content-type") || "", url: u.href };
    }
    return null;
  }
  function inline(href) {
    const m = /^data:(image\/[a-z0-9.+-]+)(;base64)?,(.*)$/is.exec(href);
    if (!m) return null;
    const body = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
    return body.length && body.length <= MAX_KEEP ? { body, type: m[1] } : null;
  }

  async function discover(host) {
    const candidates = [];
    const page = await get(`https://${host}/`, MAX_PAGE, "text/html,application/xhtml+xml", true).catch(() => null);
    if (page && /html/i.test(page.type)) candidates.push(...iconLinks(page.body.toString("utf8"), page.url));
    candidates.push(`https://${host}/favicon.ico`);
    for (const href of [...new Set(candidates)].slice(0, 4)) {
      const icon = href.startsWith("data:") ? inline(href) : await get(href, MAX_ICON, "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8").catch(() => null);
      const type = icon && sniff(icon.body, icon.type);
      const kept = type === "image/x-icon" && icon.body.length > MAX_KEEP ? shrinkIco(icon.body) : type ? { type, body: icon.body } : null;
      if (kept && kept.body.length <= MAX_KEEP) return kept;
    }
    return null;
  }

  function slot(fn) {
    return new Promise((resolve, reject) => {
      const run = () => { running++; fn().then(resolve, reject).finally(() => { running--; queue.shift()?.(); }); };
      if (running < PARALLEL) run(); else queue.push(run);
    });
  }

  /** A data URL of the site's icon, or null (no icon, internal host, failure). Never throws. */
  function favicon(rawHost) {
    const host = String(rawHost || "").toLowerCase().replace(/^www\./, "");
    if (!validHost(host)) return Promise.resolve(null);
    const hit = cached(host);
    if (hit !== undefined) return Promise.resolve(hit);
    if (pending.has(host)) return pending.get(host);
    const p = slot(() => discover(host)).catch(() => null).then((icon) => {
      save(host, icon?.type || null, icon?.body || null);
      return icon ? `data:${icon.type};base64,${icon.body.toString("base64")}` : null;
    }).finally(() => pending.delete(host));
    pending.set(host, p);
    return p;
  }

  return { favicon };
}

let shared = null;
function register(ipcMain) {
  ipcMain.handle("favicon:get", (_e, host) => {
    if (!shared) shared = createFavicons({ dir: path.join(require("electron").app.getPath("userData"), "favicons") });
    return shared.favicon(host).catch(() => null);
  });
}

module.exports = { createFavicons, register, iconLinks, sniff, shrinkIco, internal, validHost };
