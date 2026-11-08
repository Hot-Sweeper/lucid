const fs = require('node:fs');
const path = require('node:path');
// Reject secrets, traversal, symlink escapes and source maps at the serving boundary.
function projectFile(root, input) {
  let rel; try { rel = decodeURIComponent(input.split('?')[0]); } catch { throw Error('Invalid path.'); }
  if (/[\\\0]/.test(rel) || rel.split('/').some(s => s === '..' || s.startsWith('.')) || /(?:^|\/)(?:node_modules|package-lock\.json)(?:\/|$)/i.test(rel) || /\.(?:pem|key|map)$/i.test(rel)) throw Error('Private project path.');
  let candidate = path.resolve(root, '.' + '/' + rel.replace(/^\/+/, ''));
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) candidate = path.join(candidate, 'index.html');
  const realRoot = fs.realpathSync(root), real = fs.realpathSync(candidate);
  const relative = path.relative(realRoot, real);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Path outside project.');
  return real;
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function publicAssetPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 8192) throw Error('Invalid project asset path.');
  let decoded; try { decoded = decodeURIComponent(value.split('?')[0]); } catch { throw Error('Invalid project asset path.'); }
  const parts = decoded.replace(/^\//, '').split('/');
  if (/[\\\0\r\n]/.test(decoded) || parts.some((part, i) => part === '..' || part.startsWith('.') && !(part === '.vite' && i === 1 && parts[0] === 'node_modules' && parts[2] === 'deps')) || parts.includes('@fs') || parts[0] === '__open-in-editor' || /\.(?:pem|key)$/i.test(decoded)) throw Error('Private project path.');
  return value;
}
module.exports = { projectFile, publicAssetPath, mime };
