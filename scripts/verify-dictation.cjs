// CPU-only protocol and lifecycle regressions. No Electron, microphone, model or GPU is started.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createService } = require('../electron/dictation.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const german = 'Grüße, das wäre unglaublich schön. ÄÖÜ äöü ß.';

async function protocol() {
  const children = [];
  const service = createService({ exists: () => true, spawnWorker: (_python, args, options) => {
    assert.equal(options.env.PYTHONIOENCODING, 'utf-8');
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.mode = args.at(-1); child.killed = false;
    child.kill = () => { child.killed = true; child.emit('exit', 0); };
    children.push(child); return child;
  } });
  const reply = (child, obj) => child.stdout.write(JSON.stringify(obj) + '\n');
  try {
    const cancelled = service.load('auto');
    service.stop();
    await assert.rejects(cancelled, { code: 'CANCELLED' });
    await tick(); assert.equal(children.length, 1, 'cancellation must not start CPU fallback');
    const fallback = service.load('auto');
    reply(children[1], { type: 'error', error: 'GPU unavailable' });
    await tick(); assert.equal(children[2].mode, 'cpu');
    reply(children[2], { type: 'ready', device: 'CPU', backend: 'cpu' });
    await fallback;
    await service.load('auto'); assert.equal(children.length, 3, 'reuse CPU fallback');
    const result = service.run(new Uint8Array(16000 * 4));
    const encoded = Buffer.from(JSON.stringify({ type: 'result', text: german }) + '\n', 'utf8');
    // Split a multibyte character across actual pipe chunks.
    const split = encoded.indexOf(Buffer.from('ü')) + 1;
    children[2].stdout.write(encoded.subarray(0, split));
    children[2].stdout.write(encoded.subarray(split));
    assert.equal((await result).text, german);
    await assert.rejects(service.run(new Uint8Array(3)), /Invalid/);
    const abandoned = service.run(new Uint8Array(16000 * 4));
    service.stop(); await assert.rejects(abandoned, { code: 'CANCELLED' });
    assert(children[2].killed);
  } finally { service.stop(); }
}

function windowsEncoding() {
  // Execute the real worker protocol, substituting only the model for a fixture.
  // Force a Windows legacy stdout encoding, reproducing the reported corruption.
  const fixture = `import sys,types,runpy
sys.stdout.reconfigure(encoding='cp1252',errors='strict')
class Model:
 def __init__(self,*a,**k): self.device=types.SimpleNamespace(description='CPU',kind='cpu')
 def __enter__(self): return self
 def __exit__(self,*a): pass
 def session(self,**kwargs): return self
 def run(self,pcm): return types.SimpleNamespace(text=${JSON.stringify(german)})
sys.modules['transcribe_cpp']=types.SimpleNamespace(Model=Model)
runpy.run_path(${JSON.stringify(path.resolve(__dirname, 'dictation-worker.py'))},run_name='__main__')`;
  const result = spawnSync(process.env.LUCID_TEST_PYTHON || 'python', ['-c', fixture, 'cpu'], {
    env: { ...process.env, LUCID_DICTATION_HOME: 'fixture', PYTHONIOENCODING: 'cp1252' },
    input: JSON.stringify({ audio: Buffer.alloc(4 * 16000).toString('base64') }) + '\n',
  });
  assert.equal(result.status, 0, result.stderr?.toString());
  assert([...result.stdout].every(byte => byte < 128), 'wire output must be ASCII-safe JSON');
  const messages = result.stdout.toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(messages[1].text, german);
}

async function composer() {
  class Element extends EventTarget {
    hidden = false; disabled = false; textContent = ''; value = ''; selectionStart = 0; selectionEnd = 0;
    attributes = {}; children = []; style = {};
    setAttribute(k, v) { this.attributes[k] = v; }
    appendChild(e) { this.children.push(e); }
    insertBefore(e) { this.children.push(e); }
    querySelector() { return this.span ||= new Element(); }
    focus() {}
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
  }
  const form = new Element(), input = new Element(), send = new Element(), tools = new Element();
  form.querySelector = selector => ({ textarea: input, '.cp-send': send, '.cp-tools': tools, '.cp-hint': new Element() })[selector];
  let owner = 'first', stopped = 0, runResolve, runs = 0, cancelled = 0, capture, loads = 0;
  const opened = () => ({ getTracks: () => [{ stop: () => { stopped++; } }] });
  let getUserMedia = async () => opened();
  const window = new EventTarget();
  window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
  window.lucidDictation = { load: async () => { loads++; assert(stopped > 0, 'microphone must be released before model loading'); return {}; }, run: () => { runs++; return new Promise(resolve => { runResolve = resolve; }); }, cancel: async () => { cancelled++; } };
  class Audio {
    sampleRate = 16000; state = 'running'; audioWorklet = { addModule: async () => {} };
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
  }
  class Worklet {
    port = { postMessage: value => {
      assert.equal(value, 'flush');
      queueMicrotask(() => {
        this.port.onmessage({ data: new Float32Array(256) });
        this.port.onmessage({ data: { type: 'flushed' } });
      });
    } };
    constructor() { capture = this; }
    connect() {} disconnect() {}
  }
  class Offline {
    constructor(_n, length) { this.pcm = new Float32Array(length); }
    createBuffer() { return { getChannelData: () => this.pcm }; }
    createBufferSource() { return { connect() {}, start() {} }; }
    startRendering() { return Promise.resolve({ getChannelData: () => this.pcm }); }
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../src/office/dictation.ts'), 'utf8').replace("import './dictation.css';", '').replace(/^import \{ loadCaptureWorklet \}.*;$/m, "const loadCaptureWorklet = context => context.audioWorklet.addModule('blob:fixture');");
  const compiled = require('node:module').stripTypeScriptTypes(source, { mode: 'transform' }).replace('export function attachDictation', 'function attachDictation').replace(/export\s*\{\s*\};?/, '') + '\nexports.attachDictation = attachDictation;';
  const exports = {};
  vm.runInNewContext(compiled, { exports, window, document: { createElement: () => new Element() }, navigator: { mediaDevices: { getUserMedia: (...args) => getUserMedia(...args) } }, AudioContext: Audio, AudioWorkletNode: Worklet, OfflineAudioContext: Offline, Event, DOMException, Uint8Array, Float32Array, URL, console });
  const controller = exports.attachDictation(form, () => owner), button = tools.children[0];
  input.value = 'Existing draft'; input.selectionStart = input.selectionEnd = input.value.length;
  button.onclick(); await tick();
  assert(controller.active()); assert(send.disabled);
  assert.equal(loads, 0, 'starting recording must not initialize CPU/GPU model');
  const submit = new Event('submit', { cancelable: true }); form.dispatchEvent(submit); assert(submit.defaultPrevented);
  capture.port.onmessage({ data: new Float32Array(8000) });
  button.onclick(); await tick(); assert.equal(runs, 1);
  assert.equal(loads, 1, 'load only after Stop');
  runResolve({ text: german }); await tick();
  assert.equal(input.value, 'Existing draft ' + german); assert(!send.disabled); assert(!controller.active()); assert.equal(stopped, 1);
  // A late result must not land in another thread or overwrite its draft.
  button.onclick(); await tick(); capture.port.onmessage({ data: new Float32Array(8000) }); button.onclick(); await tick();
  controller.cancel(); owner = 'second'; input.value = 'Second draft';
  runResolve({ text: 'Wrong thread' }); await tick(); assert.equal(input.value, 'Second draft');
  // Cancel while the microphone permission request is still outstanding.
  let allow;
  getUserMedia = () => new Promise(resolve => { allow = resolve; });
  button.onclick(); await tick(); controller.cancel(); allow(opened()); await tick();
  assert(!controller.active()); assert(!send.disabled); assert.equal(stopped, 3); assert(cancelled >= 2);
}

function batchedCapture() {
  let Capture;
  const messages = [];
  class Processor {
    port = { postMessage: (data, transfer) => {
      if (data instanceof Float32Array) assert.equal(transfer[0], data.buffer);
      messages.push(data);
    } };
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dictation-test/capture-worklet.js'), 'utf8'), {
    AudioWorkletProcessor: Processor, Float32Array, registerProcessor: (_name, implementation) => { Capture = implementation; },
  });
  const capture = new Capture();
  for (let offset = 0; offset < 48000; offset += 128) capture.process([[Float32Array.from({ length: 128 }, (_, i) => offset + i)]]);
  assert.equal(messages.length, 11, 'one batched message per 4096 samples');
  capture.port.onmessage({ data: 'flush' });
  assert.equal(messages.at(-1).type, 'flushed');
  const pcm = messages.filter(message => message instanceof Float32Array);
  assert.equal(pcm.length, 12);
  const values = pcm.flatMap(chunk => [...chunk]);
  assert.equal(values.length, 48000, 'flush must preserve the entire audio tail');
  values.forEach((value, index) => assert.equal(value, index));
}

(async () => { await protocol(); windowsEncoding(); batchedCapture(); await composer(); console.log('PASS: German encoding, CPU fallback, deferred model loading, batched capture with lossless tail flush, cancellation, microphone cleanup, draft insertion and thread isolation.'); })().catch(error => { console.error(error); process.exitCode = 1; });
