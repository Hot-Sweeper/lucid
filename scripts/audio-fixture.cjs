// Load the actual soundtrack catalogue/queue into the audio-engine VM fixtures.
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
function soundtrackFixture(context) {
  const queue = fs.readFileSync('src/office/soundtrack-queue.ts', 'utf8').replace(/export /g, '');
  const catalogue = fs.readFileSync('src/office/soundtrack.ts', 'utf8')
    .replace(/^import (\w+) from '([^']+)';$/gm, (_, name, url) => `const ${name} = ${JSON.stringify(url)};`)
    .replace(/^import type .*;$/gm, '').replace(/export /g, '');
  vm.runInNewContext(stripTypeScriptTypes(queue + '\n' + catalogue, { mode: 'transform' }), context);
}
module.exports = { soundtrackFixture };
