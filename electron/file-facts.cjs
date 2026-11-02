// Size and time of the exact files an agent attached, so the Explorer shows what is really on disk.
// Nothing is listed, searched or read: only the paths given, at most 8, never network shares.
const fsp = require("node:fs/promises");
const path = require("node:path");

async function fileFacts(paths, { remote = false } = {}) {
  const list = Array.isArray(paths) ? paths.slice(0, 8) : [];
  return Promise.all(list.map(async (p) => {
    const given = typeof p === "string" ? p.slice(0, 1024) : "";
    if (!given || given.includes("\u0000") || !path.isAbsolute(given) || /^[\\/]{2}/.test(given) || remote) return { path: given, known: false };
    try {
      const st = await fsp.stat(given);
      return { path: given, known: true, exists: true, file: st.isFile(), directory: st.isDirectory(), size: st.size, modified: st.mtimeMs };
    } catch (err) {
      return { path: given, known: true, exists: false, reason: err && (err.code === "EACCES" || err.code === "EPERM") ? "denied" : "missing" };
    }
  }));
}

/** True when `p` is a file path strictly inside one of `roots` (case is ignored on Windows). */
function underRoots(p, roots) {
  if (typeof p !== "string" || !p || p.includes("\u0000") || !path.isAbsolute(p)) return false;
  const fold = (s) => (process.platform === "win32" ? s.toLowerCase() : s);
  const target = fold(path.resolve(p));
  return roots.some((root) => { const r = fold(path.resolve(root)); return target.startsWith(r.endsWith(path.sep) ? r : r + path.sep); });
}

module.exports = { fileFacts, underRoots };
