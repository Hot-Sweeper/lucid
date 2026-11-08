const crypto = require('node:crypto');
// Bounded in-memory documents. Their unique sandbox origin has no preload or app privileges.
function installAnswerVisuals({ protocol, ipcMain }) {
  const docs = new Map();
  ipcMain.handle('answer:visual', (_event, html) => {
    if (typeof html !== 'string' || Buffer.byteLength(html) > 8 * 1024 * 1024) throw Error('Visual is too large');
    const id = crypto.createHash('sha256').update(html).digest('hex');
    docs.delete(id); docs.set(id, html);
    while (docs.size > 40) docs.delete(docs.keys().next().value);
    return `lucid-artifact://visual/${id}`;
  });
  protocol.handle('lucid-artifact', req => {
    const url = new URL(req.url), html = url.hostname === 'visual' && docs.get(url.pathname.slice(1));
    return new Response(html || 'This visual is no longer available. Reopen the conversation to reload it.', { status: html ? 200 : 404, headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: lucid-file: https: http:; media-src data: blob: lucid-file: https: http:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
      'cache-control': 'no-store',
    } });
  });
}
module.exports = { installAnswerVisuals };
