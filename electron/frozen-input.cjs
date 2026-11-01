const fs = require('node:fs');
const path = require('node:path');
const { snapshot, changed } = require('./build-state.cjs');
function freezeInput(root) {
  const directory = fs.mkdtempSync(path.join(root, '.lucid-update-'));
  const dispose = () => fs.rmSync(directory, { recursive: true, force: true });
  try {
    const files = snapshot(root);
    for (const name of Object.keys(files)) {
      const target = path.join(directory, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, name), target);
    }
    // Private package bytes prevent concurrent installs changing compiler inputs.
    const dependencies = path.join(root, 'node_modules');
    if (fs.existsSync(dependencies)) fs.cpSync(dependencies, path.join(directory, 'node_modules'), { recursive: true, dereference: true, mode: fs.constants.COPYFILE_FICLONE });
    if (changed(files, snapshot(directory)).length) throw Error('Files changed while preparing the update. Retry when editing has finished.');
    return { directory, files, dispose };
  } catch (error) { dispose(); throw error; }
}
module.exports = { freezeInput };
