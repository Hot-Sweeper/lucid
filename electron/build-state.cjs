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
module.exports = { snapshot, changed };
