const os = require('node:os');
const { existingConnections, connection } = require('./t3-connections.cjs');
const { descriptor, originOf } = require('./remote-rpc.cjs');
const { RemoteWorld } = require('./remote-world.cjs');
const clients = new Map();
async function list() {
  const { records } = await existingConnections();
  return [{ id: 'local', label: os.hostname(), local: true }, ...records.map((r) => ({ id: r.id, label: r.label, local: false }))];
}
async function client(id) {
  if (clients.has(id)) return clients.get(id);
  const { records } = await existingConnections();
  const record = records.find((r) => r.id === id);
  if (!record) throw new Error('This machine is no longer in the current T3 Code connections.');
  // T3's learned direct routes can change, so resolve again on reconnect. If
  // none answer, T3 Connect can renew the existing link and return its new tunnel.
  const remote = new RemoteWorld({ id, label: record.label, origin: null, socketUrl: async () => {
    const latest = (await existingConnections()).records.find((r) => r.id === id);
    if (!latest) throw new Error('This machine is no longer in the current T3 Code connections.');
    const origins = [...new Set(latest.origins.map(originOf))];
    let origin = null;
    try { origin = await Promise.any(origins.map(async (url) => { const d = await descriptor(url); if (d.environmentId !== id) throw new Error('Machine identity changed'); return url; })); }
    catch { if (!latest.relay) throw new Error('This machine is offline or unreachable. Check its connection in T3 Code and retry.'); }
    const result = await connection(id, origin);
    remote.connection.origin = result.origin;
    return result.socketUrl;
  } });
  try { await remote.snapshot(); } catch (e) { remote.close(); throw e; }
  clients.set(id, remote); return remote;
}
function close() { for (const c of clients.values()) c.close(); clients.clear(); }
module.exports = { list, client, close };
