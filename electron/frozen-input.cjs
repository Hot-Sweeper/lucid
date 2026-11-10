// Electron's normal fs opens .asar files as virtual directories. A dependency
// snapshot must copy those archives as opaque bytes, including Electron itself.
const fs = process.versions.electron ? require('original-fs') : require('node:fs');
const path = require('node:path');
const { snapshotAsync, changed } = require('./build-state.cjs');
async function freezeInput(root) {
  const fsp = fs.promises;
  const directory = await fsp.mkdtemp(path.join(root, '.lucid-update-'));
  const dispose = () => fsp.rm(directory, { recursive: true, force: true, maxRetries: 3 });
  try {
    const files = await snapshotAsync(root);
    for (const name of Object.keys(files)) {
      const target = path.join(directory, name);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(path.join(root, name), target);
    }
    // Private package bytes prevent concurrent installs changing compiler inputs.
    const dependencies = path.join(root, 'node_modules');
    // POSIX npm executables are relative symlinks whose target must stay intact.
    // Dereferencing .bin/tsc breaks its imports relative to the package directory.
    if (fs.existsSync(dependencies)) await fsp.cp(dependencies, path.join(directory, 'node_modules'), { recursive: true, dereference: process.platform === 'win32', verbatimSymlinks: process.platform !== 'win32', mode: fs.constants.COPYFILE_FICLONE });
    if (changed(files, await snapshotAsync(directory)).length) throw Error('Files changed while preparing the update. Retry when editing has finished.');
    return { directory, files, dispose };
  } catch (error) {
    try { await dispose(); } catch (cleanupError) { console.warn('Update input cleanup deferred:', cleanupError.message); }
    throw error;
  }
}
module.exports = { freezeInput };
