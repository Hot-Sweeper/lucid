// Small copies of big pictures for places that show them small, such as the screenshots on a
// desk monitor. A 2000px screenshot decoded for a 60px tile cost ~9 MB of memory each.
// lucid-file://local/<path>?w=480 asks for one; the original stays available without `w`.
const path = require('node:path');

const RESIZABLE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
const WIDTHS = [240, 480, 960, 1440];

/** The smallest standard width that still covers the request, so the cache stays small. */
const bucket = (w) => WIDTHS.find((x) => x >= w) ?? WIDTHS.at(-1);

function createThumbs({ nativeImage, fsp, max = 48 }) {
  const cache = new Map();
  /** A resized copy as { body, type }, or null when the original should be served. */
  async function get(file, want) {
    const ext = path.extname(file).toLowerCase();
    const width = bucket(Math.round(Number(want)));
    if (!RESIZABLE.has(ext) || !Number.isFinite(width) || width < 1) return null;
    const st = await fsp.stat(file);
    const key = `${file}\0${st.mtimeMs}\0${st.size}\0${width}`;
    if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit; }
    const img = nativeImage.createFromBuffer(await fsp.readFile(file));
    if (img.isEmpty() || img.getSize().width <= width) { cache.set(key, null); trim(); return null; }
    const small = img.resize({ width, quality: 'good' });
    // photos stay JPEG; anything that may have transparency stays PNG
    const jpeg = ext === '.jpg' || ext === '.jpeg';
    const out = { body: jpeg ? small.toJPEG(85) : small.toPNG(), type: jpeg ? 'image/jpeg' : 'image/png' };
    cache.set(key, out); trim();
    return out;
  }
  function trim() { while (cache.size > max) cache.delete(cache.keys().next().value); }
  return { get };
}

module.exports = { createThumbs, bucket };
