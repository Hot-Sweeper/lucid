const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// A literal relative require of a file that does not exist stops the main process at that line,
// so every handler registered after it silently disappears. Catch it before an update installs.
function missingRequire(root, name, source) {
  for (const m of source.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
    const target = path.resolve(root, path.dirname(name), m[1]);
    if (![target, `${target}.cjs`, `${target}.js`, `${target}.json`, path.join(target, 'index.js')].some((f) => fs.existsSync(f) && fs.statSync(f).isFile())) {
      throw Error(`it requires ${m[1]}, which does not exist`);
    }
  }
}
// Parse CommonJS in its real wrapper, without executing backend side effects.
function checkRuntime(root) {
  let count = 0;
  function visit(relative) {
    const directory = path.join(root, relative);
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile() && entry.name.endsWith('.cjs')) {
        try {
          const source = fs.readFileSync(path.join(root, name), 'utf8').replace(/^#![^\n]*/, '');
          new vm.Script(require('node:module').wrap(source), { filename: name });
          // Only the app's own backend. Check scripts may read repository files (packaging config,
          // build icons) that the update's private input copy deliberately leaves out.
          if (name.startsWith(`electron${path.sep}`)) missingRequire(root, name, source);
          count++;
        } catch (error) { throw Error(`Update runtime syntax check failed in ${name}: ${error.message}. Your previous build was preserved.`); }
      }
    }
  }
  visit('electron'); visit('scripts');
  return count;
}
module.exports = { checkRuntime };
if (require.main === module) console.log(`Runtime syntax: ${checkRuntime(path.resolve(__dirname, '..'))} CommonJS files passed.`);
