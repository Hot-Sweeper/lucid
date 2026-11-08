const crypto = require('node:crypto');
const MAX_SKEW = 60_000;
function canonical(method, target, stamp, nonce, body) {
  return [method.toUpperCase(), target, stamp, nonce, crypto.createHash('sha256').update(body).digest('hex')].join('\n');
}
function signedHeaders(privateKey, method, target, body = Buffer.alloc(0), now = Date.now()) {
  const stamp = String(now), nonce = crypto.randomBytes(24).toString('hex');
  return { 'x-lucid-time': stamp, 'x-lucid-nonce': nonce, 'x-lucid-signature': crypto.sign(null, Buffer.from(canonical(method, target, stamp, nonce, body)), privateKey).toString('base64') };
}
function verifier(publicKey) {
  const seen = new Map();
  return (method, target, headers, body, now = Date.now()) => {
    const stamp = headers['x-lucid-time'], nonce = headers['x-lucid-nonce'], sig = headers['x-lucid-signature'];
    if (typeof stamp !== 'string' || typeof nonce !== 'string' || typeof sig !== 'string' || !/^\d{13}$/.test(stamp) || !/^[a-f0-9]{48}$/.test(nonce) || Math.abs(now - Number(stamp)) > MAX_SKEW || seen.has(nonce)) return false;
    try { if (!crypto.verify(null, Buffer.from(canonical(method, target, stamp, nonce, body)), publicKey, Buffer.from(sig, 'base64'))) return false; } catch { return false; }
    for (const [n, t] of seen) if (now - t > MAX_SKEW * 2) seen.delete(n);
    seen.set(nonce, now);
    return true;
  };
}
module.exports = { signedHeaders, verifier };
