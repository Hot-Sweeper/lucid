const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function snapshot(root) {
  const files = {};
  const add = relative => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) add(name);
      else if (entry.isFile()) files[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
    }
  };
  for (const dir of ['src', 'electron', 'scripts', 'public']) if (fs.existsSync(path.join(root, dir))) add(dir);
  for (const name of fs.readdirSync(root).sort()) if (/^(package.*\.json|vite.*\.(mjs|ts)|tsconfig.*\.json|index\.html)$/.test(name)) files[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
  return files;
}
const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);
// Update checks run in Electron's main process. Yield for disk reads instead of
// blocking every renderer IPC while hashing artwork and source files.
async function snapshotAsync(root) {
  const files = {}, fsp = fs.promises;
  const hash = async name => {
    const digest = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(path.join(root, name))) digest.update(chunk);
    files[name] = digest.digest('hex');
  };
  const add = async relative => {
    let entries;
    try { entries = await fsp.readdir(path.join(root, relative), { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await add(name);
      else if (entry.isFile()) await hash(name);
    }
  };
  for (const dir of ['src', 'electron', 'scripts', 'public']) await add(dir);
  for (const name of (await fsp.readdir(root)).sort()) if (/^(package.*\.json|vite.*\.(mjs|ts)|tsconfig.*\.json|index\.html)$/.test(name)) await hash(name);
  return files;
}
module.exports = { snapshot, snapshotAsync, changed };
