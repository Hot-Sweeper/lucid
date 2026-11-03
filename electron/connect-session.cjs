const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { decryptDesktop } = require('./connect-catalog.cjs');

function readDesktopSession({ home = process.env.T3CODE_HOME || path.join(os.homedir(), '.t3'), read = file => fs.readFileSync(file, 'utf8'), decrypt = decryptDesktop } = {}) {
  const message = 'T3 Connect is not signed in. Open T3 Code to restore its session.';
  for (const relative of [['clerk', 'clerk-tokens.json'], ['clerk-tokens.json']]) {
    let stored;
    try { stored = JSON.parse(read(path.join(home, 'userdata', ...relative))).__clerk_client_jwt; }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw Error(message);
    }
    try {
      const client = typeof stored === 'string' && (stored.startsWith('enc:') ? decrypt(stored.slice(4)) : stored.startsWith('raw:') ? stored.slice(4) : null);
      if (client) return client;
    } catch {}
    throw Error(message);
  }
  throw Error(message);
}
module.exports = { readDesktopSession };
