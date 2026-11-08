// Talks to a local `codex app-server` over stdio (newline-delimited JSON-RPC).
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';

export class CodexServer extends EventEmitter {
  constructor({ version }) {
    super();
    this.version = version;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = null;
    this.requestHandlers = new Map();
    this.lastError = null;
  }

  // Handle a server-to-client request such as `item/tool/call`.
  onRequest(method, handler) {
    this.requestHandlers.set(method, handler);
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = this.#boot().catch((err) => {
      this.ready = null;
      this.lastError = err;
      throw err;
    });
    return this.ready;
  }

  async #boot() {
    // `codex` is an npm shim on Windows, so it needs a shell to resolve.
    const proc = spawn(process.env.LUCID_CODEX_EXE || 'codex', ['app-server'], {
      shell: process.platform === 'win32' && !process.env.LUCID_CODEX_EXE,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.proc = proc;
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => this.#onLine(line));
    let stderrTail = '';
    proc.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-4000);
    });
    proc.on('exit', (code) => {
      const err = new Error(`Codex stopped (exit code ${code}). ${stderrTail.trim().split('\n').pop() || ''}`.trim());
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
      this.proc = null;
      this.ready = null;
      this.emit('exit', err);
    });
    proc.on('error', (err) => this.emit('exit', err));

    const init = await this.request('initialize', {
      clientInfo: { name: 'lucid-ares', title: 'Lucid', version: this.version },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.#send({ method: 'initialized' });
    this.info = init;
    return init;
  }

  #send(msg) {
    if (!this.proc) throw new Error('Codex is not running.');
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out. Reconnect to check the session before retrying.`)); }, 90000);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); }, method });
      try {
        this.#send({ id, method, params });
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async #onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    // Response to one of our requests.
    if (msg.id != null && !msg.method) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        const err = new Error(msg.error.message || `${p.method} failed`);
        err.data = msg.error;
        p.reject(err);
      } else p.resolve(msg.result);
      return;
    }
    // Request from the server that needs an answer.
    if (msg.id != null && msg.method) {
      const handler = this.requestHandlers.get(msg.method);
      try {
        const result = handler ? await handler(msg.params) : Promise.reject(new Error(`Unsupported request ${msg.method}. No permission was granted.`));
        this.#send({ id: msg.id, result });
      } catch (err) {
        this.#send({ id: msg.id, error: { code: -32000, message: String(err?.message || err) } });
      }
      return;
    }
    if (msg.method) this.emit('notification', msg.method, msg.params || {});
  }
}

