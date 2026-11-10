// Small copies of big pictures (electron/thumbs.cjs): standard widths, small pictures and
// non-raster files served as they are, and repeated asks answered from the cache.
const assert = require('node:assert/strict');
const { createThumbs, bucket } = require('../../electron/thumbs.cjs');

assert.equal(bucket(100), 240);
assert.equal(bucket(480), 480);
assert.equal(bucket(700), 960);
assert.equal(bucket(5000), 1440);

let decodes = 0;
const fakeImage = (width) => ({
  isEmpty: () => false,
  getSize: () => ({ width, height: width / 2 }),
  resize: ({ width: w }) => ({ toPNG: () => Buffer.from(`png${w}`), toJPEG: () => Buffer.from(`jpg${w}`) }),
});
const sizes = { '/a/big.png': 2000, '/a/small.png': 300, '/a/photo.jpg': 3000 };
const nativeImage = { createFromBuffer: (buf) => { decodes++; return fakeImage(sizes[String(buf)]); } };
const fsp = { stat: async () => ({ mtimeMs: 1, size: 10 }), readFile: async (f) => Buffer.from(f) };
const thumbs = createThumbs({ nativeImage, fsp });

(async () => {
  const big = await thumbs.get('/a/big.png', 480);
  assert.equal(big.type, 'image/png'); assert.equal(String(big.body), 'png480');
  await thumbs.get('/a/big.png', 400);
  assert.equal(decodes, 1, 'the same standard width comes from the cache');
  assert.equal(await thumbs.get('/a/small.png', 480), null, 'a picture already small is served as it is');
  const photo = await thumbs.get('/a/photo.jpg', 960);
  assert.equal(photo.type, 'image/jpeg');
  assert.equal(await thumbs.get('/a/clip.mp4', 480), null, 'only pictures are resized');
  assert.equal(await thumbs.get('/a/icon.svg', 480), null, 'vector pictures are served as they are');
  console.log('thumbs ok');
})().catch((e) => { console.error(e); process.exit(1); });
