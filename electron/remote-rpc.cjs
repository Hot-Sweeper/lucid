const crypto = require("node:crypto");

function originOf(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use the machine's HTTP or HTTPS address without credentials in the URL.");
  return url.origin;
}

async function descriptor(origin) {
  const response = await fetch(originOf(origin) + "/.well-known/t3/environment", { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error("That address did not answer as a T3 Code machine.");
  const data = await response.json();
  if (!data.environmentId || !data.label) throw new Error("That address did not identify its T3 Code machine.");
  return data;
}

function failure(exit) {
  const messages = [];
  function visit(value, depth = 0) {
    if (!value || depth > 8) return;
    if (typeof value.message === "string") messages.push(value.message);
    if (typeof value === "object") for (const v of Object.values(value)) if (typeof v === "object") visit(v, depth + 1);
  }
  visit(exit);
  return messages[0]?.slice(0, 300) || "The machine could not complete that request.";
}

class RemoteRpc {
  constructor(connection) { this.connection = connection; this.pending = new Map(); this.nextId = 1; this.socket = null; this.connecting = null; this.ping = null; this.onClose = () => {}; }
  async connect() {
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const ws = new WebSocket(await this.connection.socketUrl());
      this.socket = ws;
      ws.addEventListener("message", (event) => {
        let frames;
        try { frames = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString()); } catch { return; }
        for (const frame of Array.isArray(frames) ? frames : [frames]) {
          if (frame._tag === "Ping") { ws.send(JSON.stringify({ _tag: "Pong" })); continue; }
          const pending = this.pending.get(String(frame.requestId));
          if (!pending) continue;
          if (frame._tag === "Chunk") {
            for (const value of frame.values || []) pending.chunk?.(value);
            ws.send(JSON.stringify({ _tag: "Ack", requestId: frame.requestId }));
          }
          else if (frame._tag === "Exit") {
            this.pending.delete(String(frame.requestId));
            frame.exit?._tag === "Success" ? pending.resolve(frame.exit.value) : pending.reject(new Error(failure(frame.exit)));
          }
        }
      });
      ws.addEventListener("close", () => { if (this.socket === ws) this.close("The connection to this machine closed."); });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { ws.close(); reject(new Error("The machine did not open its connection in time.")); }, 8000);
        ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
        ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not reach this machine. Check that T3 Code is running there.")); }, { once: true });
      });
      this.ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ _tag: "Ping" })); }, 15000);
      return ws;
    })().catch((error) => { this.close(); throw error; });
    return this.connecting;
  }
  async call(tag, payload, chunk) {
    const ws = await this.connect(), id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = chunk ? null : setTimeout(() => { this.pending.delete(id); reject(new Error("The machine did not answer in time.")); }, 15000);
      this.pending.set(id, { chunk, resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      ws.send(JSON.stringify({ _tag: "Request", id, tag, payload, headers: [] }));
    });
  }
  dispatch(command) { return this.call("orchestration.dispatchCommand", { commandId: crypto.randomUUID(), ...command }); }
  close(message = "The connection was closed.") {
    const socket = this.socket;
    this.socket = null; this.connecting = null; clearInterval(this.ping);
    try { socket?.close(); } catch {}
    for (const pending of this.pending.values()) pending.reject(new Error(message));
    this.pending.clear(); this.onClose();
  }
}

module.exports = { RemoteRpc, descriptor, originOf };
