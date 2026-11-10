// Public data for the robots' browser and git apps: GitHub, Hugging Face and Wikipedia pages,
// web search results, site icons (favicons.cjs), and read-only facts about a local git repo.
// No tokens, short timeouts, cached so a busy office does not burn through GitHub's 60 requests an hour.
const { execFile } = require("node:child_process");

const ALLOW = [
  /^https:\/\/api\.github\.com\//,
  /^https:\/\/github\.com\//,
  /^https:\/\/raw\.githubusercontent\.com\//,
  /^https:\/\/huggingface\.co\//,
  /^https:\/\/[a-z-]+\.wikipedia\.org\//,
  /^https:\/\/(upload|thumb)\.wikimedia\.org\//,
  /^https:\/\/avatars\.githubusercontent\.com\//,
];
const cache = new Map(); // key -> { at, value }
const TTL = 10 * 60 * 1000, FAIL_TTL = 60 * 1000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 Lucid";

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.value?.ok ? TTL : FAIL_TTL)) return hit.value;
  const p = fn().catch((err) => ({ ok: false, error: String(err?.message || err) }));
  cache.set(key, { at: Date.now(), value: p });
  p.then((v) => cache.set(key, { at: Date.now(), value: v }));
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return p;
}

async function get(fetchImpl, url, accept, ms = 6000) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(ms), headers: { "user-agent": UA, accept } });
  return res;
}

/** Fetch an allowlisted public URL as JSON, text or a small image data URL. */
function siteFetch(fetchImpl, url, as = "json") {
  url = String(url || "");
  if (!ALLOW.some((re) => re.test(url))) return Promise.resolve({ ok: false, error: "not allowed" });
  return cached(`${as} ${url}`, async () => {
    const accept = as === "json" ? (url.includes("api.github.com") ? "application/vnd.github+json" : "application/json")
      : as === "raw" ? "application/vnd.github.raw, text/plain, */*" : as === "image" ? "image/*" : "text/html, */*";
    const res = await get(fetchImpl, url, accept);
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    if (as === "image") {
      const type = res.headers.get("content-type") || "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (!/^image\//.test(type) || buf.length > 600 * 1024) return { ok: false, error: "not a small image" };
      return { ok: true, data: `data:${type};base64,${buf.toString("base64")}` };
    }
    const text = (await res.text()).slice(0, 2_000_000);
    if (as === "json") { try { return { ok: true, status: res.status, data: JSON.parse(text) }; } catch { return { ok: false, error: "bad json" }; } }
    return { ok: true, status: res.status, data: text };
  });
}

// Real web results for a query (DuckDuckGo's plain HTML page), used when the agent's own
// search item did not include its result list.
function webSearch(fetchImpl, query) {
  const q = String(query || "").trim().slice(0, 300);
  if (!q) return Promise.resolve({ ok: false, error: "empty" });
  return cached(`search ${q}`, async () => {
    const res = await get(fetchImpl, `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, "text/html");
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();
    const decode = (s) => s.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
    const results = [];
    const parts = html.split(/(?=<a[^>]+class="result__a")/).slice(1);
    for (const part of parts) {
      if (results.length >= 8) break;
      const m = part.match(/^<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!m) continue;
      const sn = part.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/);
      m[3] = sn ? sn[1] : "";
      let href = m[1].replace(/&amp;/g, "&");
      const u = href.match(/[?&]uddg=([^&]+)/);
      if (u) href = decodeURIComponent(u[1]);
      if (href.startsWith("//")) href = "https:" + href;
      if (!/^https?:\/\//.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
      results.push({ url: href, title: decode(m[2]), snippet: m[3] ? decode(m[3]).slice(0, 260) : "" });
    }
    return { ok: true, results };
  });
}

// Read-only facts about the repo a robot works in (never changes anything).
function git(root, args) {
  return new Promise((resolve) => {
    execFile("git", ["-C", root, ...args], { timeout: 3000, windowsHide: true, maxBuffer: 512 * 1024 }, (err, stdout) => resolve(err ? "" : String(stdout).trim()));
  });
}
async function gitInfo(root) {
  root = String(root || "");
  if (!root) return { ok: false };
  const [remote, branch, status, last] = await Promise.all([
    git(root, ["remote", "get-url", "origin"]),
    git(root, ["branch", "--show-current"]),
    git(root, ["status", "--porcelain=v1", "-uall"]),
    git(root, ["log", "-1", "--format=%h%x09%s%x09%an%x09%cr"]),
  ]);
  if (!branch && !remote && !last) return { ok: false };
  const gh = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  const [hash, subject, author, when] = last.split("\t");
  return {
    ok: true, remote, branch,
    repo: gh ? `${gh[1]}/${gh[2]}` : null,
    changes: status.split("\n").filter(Boolean).slice(0, 60).map((l) => ({ code: l.slice(0, 2).trim() || "M", path: l.slice(3).replace(/^"|"$/g, "") })),
    last: hash ? { hash, subject, author, when } : null,
  };
}

/** Register the IPC handlers (also used by the offscreen demo harness). */
function register(ipcMain, fetchImpl) {
  ipcMain.handle("site:fetch", (_e, url, as) => siteFetch(fetchImpl, url, as));
  ipcMain.handle("web:search", (_e, q) => webSearch(fetchImpl, q));
  ipcMain.handle("git:info", (_e, root) => gitInfo(root));
  require("./favicons.cjs").register(ipcMain);
}

module.exports = { register, siteFetch, webSearch, gitInfo };
