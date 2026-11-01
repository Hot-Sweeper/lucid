const fs = require('node:fs');
const path = require('node:path');

function hasInstalledBuild(root, name = 'dist') {
  const directory = path.join(root, name);
  try {
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
    if (!html.trim()) return false;
    // An interrupted build may leave index.html without its referenced bundles.
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const url = match[1].split(/[?#]/)[0];
      if (!url || /^(?:[a-z]+:|\/\/|#)/i.test(url)) continue;
      const asset = path.resolve(directory, url.replace(/^\//, ''));
      if (!asset.startsWith(path.resolve(directory) + path.sep) || !fs.existsSync(asset)) return false;
    }
    return true;
  } catch { return false; }
}

// A crash between the two promotion renames leaves the old build here. Restore
// it without touching source files or replacing any existing installation.
function recoverInstallation(root) {
  if (!fs.existsSync(path.join(root, 'dist')) && hasInstalledBuild(root, 'dist-previous')) {
    fs.renameSync(path.join(root, 'dist-previous'), path.join(root, 'dist'));
    return true;
  }
  return false;
}

function acquireUpdateLock(root) {
  require('./update-recovery.cjs').assertRecovery(root);
  const file = path.join(root, '.lucid-update.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try { fd = fs.openSync(file, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const { pid } = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Number.isInteger(pid) || pid <= 0) throw Error('Invalid update owner');
        try { process.kill(pid, 0); } catch (error) { stale = error.code === 'ESRCH'; }
      } catch { try { stale = Date.now() - fs.statSync(file).mtimeMs > 30000; } catch {} }
      if (stale && attempt === 0) { fs.unlinkSync(file); continue; }
      throw Error('Another Lucid update is still running. Wait for it to finish, then retry.');
    }
    try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); }
    catch (error) { fs.closeSync(fd); fs.unlinkSync(file); throw error; }
    fs.closeSync(fd);
    return () => fs.unlinkSync(file);
  }
}

module.exports = { hasInstalledBuild, recoverInstallation, acquireUpdateLock };
