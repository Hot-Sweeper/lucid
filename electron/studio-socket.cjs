const http = require('node:http');
const https = require('node:https');
// A byte tunnel for a project's existing HMR socket. No command or studio APIs.
function tunnel(req, socket, head, target, headers) {
  const upstream = (target.protocol === 'https:' ? https : http).request(target, { headers: {
    Connection: 'Upgrade', Upgrade: 'websocket',
    'Sec-WebSocket-Key': req.headers['sec-websocket-key'],
    'Sec-WebSocket-Version': '13',
    ...(req.headers['sec-websocket-protocol'] ? { 'Sec-WebSocket-Protocol': req.headers['sec-websocket-protocol'] } : {}), ...headers,
  } });
  upstream.setTimeout(10000, () => upstream.destroy());
  upstream.on('upgrade', (response, remote, extra) => {
    upstream.setTimeout(0); remote.setTimeout(0); socket.setTimeout(0);
    let handshake = 'HTTP/1.1 101 Switching Protocols\r\n';
    for (const name of ['upgrade', 'connection', 'sec-websocket-accept', 'sec-websocket-protocol', 'sec-websocket-extensions']) if (response.headers[name]) handshake += `${name}: ${response.headers[name]}\r\n`;
    socket.write(handshake + '\r\n'); if (extra.length) socket.write(extra); if (head.length) remote.write(head);
    socket.pipe(remote).pipe(socket); socket.on('error', () => remote.destroy()); remote.on('error', () => socket.destroy()); socket.on('close', () => remote.destroy()); remote.on('close', () => socket.destroy());
  });
  upstream.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode || 502} Preview socket unavailable\r\nConnection: close\r\n\r\n`); response.resume(); });
  upstream.on('error', () => socket.destroy()); socket.on('close', () => upstream.destroy()); upstream.end();
}
module.exports = { tunnel };
