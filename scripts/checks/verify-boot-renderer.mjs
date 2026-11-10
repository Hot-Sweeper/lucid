import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { transformWithOxc } from 'vite';

const source = (await fs.readFile(new URL('../../src/games/boot.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
const { code } = await transformWithOxc('const clamp=(n:number,a=0,b=1)=>Math.min(b,Math.max(a,n));\n' + source + '\nexport {renderer,BASE};', 'boot.ts');
const { renderer, BASE } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
function texture(seed, w = 32, h = 32) {
  const px = new Uint32Array(w * h), glow = new Uint8Array(w * h);
  for (let i = 0; i < px.length; i++) { px[i] = (0xff000000 | ((i * 17293 + seed * 547131) & 0xffffff)) >>> 0; glow[i] = i % 29 === seed % 29 ? 1 : 0; }
  return { w, h, px, glow };
}
const pack = {
  wall: Array.from({ length: 8 }, (_, i) => texture(i)), rack2: texture(10), exitOn: texture(11),
  floor: texture(12), ceil: texture(13), lamp: texture(14), foe: [], pile: [], item: [], shot: [],
  bit: [texture(15)], gun: texture(16, 90, 64), flash: texture(17, 28, 22),
};
const rw = 300, rh = 190, buffer = new Uint32Array(rw * rh), draw = renderer(pack, rw, rh, buffer);
const run = { grid: BASE.slice(), open: new Float32Array(BASE.length), x: 3.5, y: 16.5, a: 0, eyeZ: .5,
  speed: 1.2, walk: 1.8, fireT: 9, dead: false, exitOn: false, winT: 0, foes: [], items: [], shots: [], bits: [] };
const scenes = [
  { name: 'hall', x: 3.5, y: 16.5, a: 0 },
  { name: 'near-wall', x: 1.12, y: 16.5, a: Math.PI },
  { name: 'rack-room', x: 14.5, y: 13.5, a: -.3 },
  { name: 'upper-room', x: 13.5, y: 4.5, a: 1.2 },
  { name: 'door', x: 17.5, y: 14.5, a: 0, open: .6 },
  { name: 'muzzle-flash', x: 13.5, y: 13.5, a: 2.1, fireT: .01 },
  { name: 'lower-eye', x: 3.5, y: 16.5, a: .3, eyeZ: .29 },
  { name: 'high-eye', x: 14.5, y: 13.5, a: 1.3, eyeZ: .7 },
];
// Recorded from the original floor-first renderer with these deterministic textures.
const expected = {
  hall: 'c708c03d615a9772eccdb0da521202dcfc0cdb98f35fe77046179069e3754338',
  'near-wall': 'fb1686648d544ba87e941d3295fbc79411cc1109ea1b98cb61764c4346d92a70',
  'rack-room': 'e79e1dd7c30e788752882ebceaa6e8325c1b414853f4f8ea98df1227c6bc44cb',
  'upper-room': 'cdcb3d63ea399b0cf16f6fac8e90b7a5d6b6bc5b18d53f09e8dba3d52210e79a',
  door: '7905d9767735fe333c046b56d16d98a65ccdbb128d5f2623498fbaef9547376f',
  'muzzle-flash': 'f0a02efdaa3fc70089a71a660f1863017a79d025dc68d9428f9bd901a2749663',
  'lower-eye': 'd4319675a7c915254ff8a407fa9395ff587b81c1236b2af7f6b60a7580413017',
  'high-eye': '2adcd09290a78b8865e9bd12527d0fc6cd7f096ead77d014f401e8a137f12499',
};
const hashes = {};
const start = performance.now();
for (const scene of scenes) {
  const { name, open, ...camera } = scene;
  Object.assign(run, { fireT: 9, eyeZ: .5 }, camera);
  run.open.fill(scene.open ?? 0);
  draw(run, 1.9, false);
  hashes[scene.name] = createHash('sha256').update(Buffer.from(buffer.buffer)).digest('hex');
  assert.equal(hashes[scene.name], expected[scene.name], `${scene.name} must retain exactly the same pixels`);
  for (let i = 0; i < 40; i++) draw(run, 1.9, false);
}
console.log(`PASS: ${scenes.length} pixel-identical BOOT scenes including close walls, doors, muzzle flash and eye heights; ${scenes.length * 41} draws in ${(performance.now() - start).toFixed(1)} ms`);
