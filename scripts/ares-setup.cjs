// Local setup creates only Lucid's connector identity, never reads or copies Codex auth.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const configFile = process.env.LUCID_ARES_CONFIG || path.join(os.homedir(), '.config', 'lucid', 'ares.json');
if (process.argv.includes('--init')) {
  if (fs.existsSync(configFile)) throw Error('Ares connector already exists. Keep its existing identity.');
  const url = process.argv[process.argv.indexOf('--url') + 1]; if (!url || !/^https:\/\/[^/]+\.ts\.net(?::\d+)?(?:\/[^?]*)?$/.test(url)) throw Error('Pass --url with the discovered HTTPS tailnet runner route.');
  const pair = crypto.generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  fs.mkdirSync(path.dirname(configFile), { recursive: true, mode: 0o700 }); fs.writeFileSync(configFile, JSON.stringify({ url, privateKey, publicKey }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ configFile, publicKey }, null, 2));
} else {
  require('../electron/studio.cjs').action({ action: 'status' }).then(status => console.log(JSON.stringify(status, null, 2))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
