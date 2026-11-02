const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
