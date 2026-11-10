// Reuse the desktop's OS-protected T3 Connect catalog. Credentials stay in the
// main process, are never persisted by this app, and never cross the renderer IPC.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { t3Home } = require("./t3-home.cjs");

function decryptDesktop(value, { profile = path.join(process.env.APPDATA || '', 't3code-v2') } = {}) {
  if (process.platform !== 'win32') throw Error('Desktop connection reuse is unavailable on this platform.');
  const state = JSON.parse(fs.readFileSync(path.join(profile, 'Local State'), 'utf8'));
  const protectedKey = Buffer.from(state.os_crypt.encrypted_key, 'base64');
  if (protectedKey.subarray(0, 5).toString() !== 'DPAPI') throw Error('Desktop encryption format is unsupported.');
  const command = 'Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $key=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($key))';
  const key = Buffer.from(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { input: protectedKey.subarray(5).toString('base64'), windowsHide: true, timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim(), 'base64');
  try {
    const encrypted = Buffer.from(value, 'base64');
    if (encrypted.subarray(0, 3).toString() !== 'v10') throw Error('Desktop catalog format is unsupported.');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(3, 15));
    cipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([cipher.update(encrypted.subarray(15, -16)), cipher.final()]).toString('utf8');
  } finally { key.fill(0); }
}
function readCatalog(options = {}) {
  const home = options.home || t3Home();
  const document = JSON.parse(fs.readFileSync(path.join(home, 'userdata', 'connection-catalog.json'), 'utf8'));
  return JSON.parse(decryptDesktop(document.encryptedCatalog, options));
}
module.exports = { readCatalog, decryptDesktop };
