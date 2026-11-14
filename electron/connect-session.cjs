// T3 Code's T3 Connect sign-in (its Clerk client token), read-only and kept in the main process.
const fs = require('node:fs');
const path = require('node:path');
const { t3Home } = require("./t3-home.cjs");

async function readDesktopSession({ home = t3Home(), read = file => fs.promises.readFile(file, 'utf8'), decrypt } = {}) {
  const message = 'T3 Connect is not signed in. Open T3 Code to restore its session.';
  for (const relative of [['clerk', 'clerk-tokens.json'], ['clerk-tokens.json']]) {
    let stored;
    try { stored = JSON.parse(await read(path.join(home, 'userdata', ...relative))).__clerk_client_jwt; }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw Error(message);
    }
    try {
      const client = typeof stored === 'string' && (stored.startsWith('enc:') ? await decrypt(stored.slice(4)) : stored.startsWith('raw:') ? stored.slice(4) : null);
      if (client) return client;
    } catch {}
    throw Error(message);
  }
  throw Error(message);
}
module.exports = { readDesktopSession };
