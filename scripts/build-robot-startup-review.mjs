import { build, mergeConfig } from 'vite';
import config from '../vite.config.mjs';
const base = process.argv[2];
if (!base) throw Error('Output root required');
await build(mergeConfig(config, { build: { outDir: `${base}/current/dist` } }));
await build(mergeConfig(config, { build: { outDir: `${base}/reconstructed-before/dist` }, plugins: [{
  name: 'explicit-reconstructed-startup-baseline', enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/src/office/park.ts')) return code.replace('if (want.length) this.started = true;', 'this.started = true;');
    if (id.endsWith('/src/world/charging.ts')) return code.replace('if (!entry && !this.opened)', 'if (false)');
    if (id.endsWith('/src/world/world.css')) return code.replace('.world-battery.on { display: none; }', '.world-battery.on { display: block; }');
    if (id.endsWith('/src/world/charging.css')) return code.replace('.world-battery.low { display:none; }', '.world-battery.low { display:block; }');
  }
}] }));

