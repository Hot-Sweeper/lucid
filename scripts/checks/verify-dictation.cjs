// Dictation through T3 Code's voice API, checked without a microphone, Electron or T3:
// T3's request encoding, recognition preferences, error mapping, the one-time scope grant,
// first-use download progress, cancellation, the capture worklet and thread-safe insertion.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { encodeSpeechRequest, speechOptions, readVoice, createVoice, MAX_PCM_BYTES } = require('../../electron/t3-voice.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const german = 'Grüße, das wäre unglaublich schön. ÄÖÜ äöü ß.';

// T3's decodeSpeechPcmRequest (apps/server, packages/shared/src/speech.ts), restated.
function decodeLikeT3(body) {
  if (body.byteLength < 4) throw new Error('Missing speech options.');
  const length = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true);
  if (length > 128e3 || 4 + length >= body.byteLength) throw new Error('Invalid speech options length.');
  const options = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(4, 4 + length)));
  return { pcm: body.subarray(4 + length), options };
}

function protocol() {
  const pcm = Float32Array.from({ length: 1600 }, (_, i) => Math.sin(i / 7));
  const options = speechOptions({ speechLanguage: 'de', speechCustomWords: [{ term: 'Grüße', aliases: ['gruesse'] }], speechCorrectionWord: 'sorry' });
  const body = encodeSpeechRequest(new Uint8Array(pcm.buffer), options);
  const decoded = decodeLikeT3(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  assert.deepEqual(decoded.options, options, 'options survive UTF-8 framing');
  assert.equal(decoded.pcm.byteLength, pcm.byteLength);
  assert.deepEqual(new Float32Array(Uint8Array.from(decoded.pcm).buffer), pcm, 'PCM samples arrive unchanged');
  // A view into a larger buffer must send only its own bytes.
  const big = new Float32Array(64); big.fill(1); const view = new Uint8Array(big.buffer, 16, 32);
  assert.equal(decodeLikeT3(new Uint8Array(encodeSpeechRequest(view, options))).pcm.byteLength, 32);
  for (const bad of [new Uint8Array(0), new Uint8Array(6), new Uint8Array(MAX_PCM_BYTES + 4)]) assert.throws(() => encodeSpeechRequest(bad, options), { code: 'invalid-audio' });

  assert.deepEqual(speechOptions({}), { speechLanguage: 'auto', speechTranslateToEnglish: false, speechCustomWords: [], speechRemoveFillerWords: true, speechSilenceFiltering: true }, 'T3 defaults when settings are missing');
  const cleaned = speechOptions({ speechLanguage: 'x', speechRemoveFillerWords: false, speechSilenceFiltering: false, speechCorrectionWord: '  ', speechCustomWords: [{ term: '' }, { term: 'Lucid', aliases: ['', 'loose it', 7] }, null] });
  assert.equal(cleaned.speechLanguage, 'auto', 'an invalid language falls back to automatic');
  assert.equal(cleaned.speechRemoveFillerWords, false); assert.equal(cleaned.speechSilenceFiltering, false);
  assert.deepEqual(cleaned.speechCustomWords, [{ term: 'Lucid', aliases: ['loose it'] }], 'invalid dictionary entries are dropped, not sent');
  assert(!('speechCorrectionWord' in cleaned), 'an empty correction word is omitted like T3 does');
}

const response = (status, body, type = 'application/json') => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: name => name === 'content-type' ? type : null },
  json: async () => typeof body === 'string' ? JSON.parse(body) : body,
});

async function errors() {
  const reason = r => readVoice(response(400, { _tag: 'EnvironmentRequestInvalidError', code: 'invalid_request', reason: r }));
  await assert.rejects(reason('speech_busy'), { code: 'busy', message: /busy/ });
  await assert.rejects(reason('invalid_audio'), { code: 'invalid-audio' });
  await assert.rejects(reason('invalid_command'), { code: 'missing-model' });
  await assert.rejects(reason('speech_unavailable'), { code: 'unsupported' });
  // Older T3 versions answer unknown API routes with their web app.
  await assert.rejects(readVoice(response(200, '<!doctype html>', 'text/html')), { code: 'outdated', message: /Update T3 Code/ });
  await assert.rejects(readVoice(response(404, '', 'text/plain')), { code: 'outdated' });
  await assert.rejects(readVoice(response(500, { code: 'internal_error' })), { code: 'http', message: /Try again/ });
  assert.deepEqual(await readVoice(response(200, { text: german })), { text: german });
}

// A fake t3server: records requests, answers from a script, and counts scope grants.
function fakeServer(answer) {
  const calls = [];
  const server = {
    granted: 0, calls,
    async authedRaw(pathname, init = {}) {
      calls.push({ pathname, init });
      const r = await answer(pathname, init, server);
      if (r instanceof Error) throw r;
      return r;
    },
    async grantScope(scope) { assert.equal(scope, 'settings:write'); server.granted++; server.scoped = true; },
  };
  return server;
}

async function client() {
  // status: supported, unsupported, outdated
  let s = fakeServer(() => response(200, { supported: true, state: 'missing-model', modelId: 'm1', model: 'Model One', size: 731e6 }));
  assert.deepEqual(await createVoice({ server: s }).status(), { state: 'missing-model', modelId: 'm1', model: 'Model One', size: 731e6 });
  s = fakeServer(() => response(200, { supported: false, reason: 'No native speech runtime for this CPU.' }));
  await assert.rejects(createVoice({ server: s }).status(), { code: 'unsupported', message: /No native speech runtime/ });
  s = fakeServer(() => response(200, '<html>', 'text/html'));
  await assert.rejects(createVoice({ server: s }).status(), { code: 'outdated' });
  s = fakeServer(() => Object.assign(new Error('T3 Code is not running. Open it, then try again.'), { code: 'offline' }));
  await assert.rejects(createVoice({ server: s }).status(), { code: 'offline', message: /not running/ });

  // download: the first answer lacks settings:write, Lucid pairs for it once and repeats.
  let finishDownload, models = { models: [{ id: 'm1', name: 'Model One', size: 1000, state: 'downloadable' }] };
  s = fakeServer((pathname, init, server) => {
    if (pathname === '/api/voice/models/download') {
      assert.equal(init.method, 'POST'); assert.deepEqual(JSON.parse(init.body), { modelId: 'm1' });
      if (!server.scoped) return Object.assign(new Error('T3 did not give Lucid permission for this.'), { code: 'scope', scope: 'settings:write' });
      return new Promise(resolve => { finishDownload = resolve; });
    }
    if (pathname === '/api/voice/models') return response(200, models);
    throw new Error('unexpected ' + pathname);
  });
  const voice = createVoice({ server: s });
  await voice.download('m1');
  assert.equal(s.granted, 1, 'the scope is requested once');
  await voice.download('m1');
  assert.equal(s.calls.filter(c => c.pathname === '/api/voice/models/download').length, 2, 'a second click joins the running download');
  models.models[0] = { ...models.models[0], state: 'downloading', downloaded: 250 };
  assert.deepEqual(await voice.progress('m1'), { state: 'downloading', name: 'Model One', size: 1000, downloaded: 250, error: null }, 'progress is T3\'s own byte count');
  models.models[0] = { ...models.models[0], state: 'installed', downloaded: undefined };
  finishDownload(response(200, models)); await tick();
  assert.equal((await voice.progress('m1')).downloaded, 1000);
  await assert.rejects(voice.progress('gone'), { code: 'missing-model' });

  // A failed download is reported once T3 shows the model as not downloaded again.
  s = fakeServer(pathname => pathname === '/api/voice/models'
    ? response(200, { models: [{ id: 'm1', name: 'Model One', size: 1000, state: 'downloadable' }] })
    : new Promise(resolve => setTimeout(() => resolve(response(500, { code: 'internal_error' })), 1600)));
  const failing = createVoice({ server: s });
  await failing.download('m1');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.match((await failing.progress('m1')).error, /Try again/);
  // An early refusal is shown directly.
  s = fakeServer(() => response(400, { reason: 'speech_busy' }));
  await assert.rejects(createVoice({ server: s }).download('m1'), { code: 'busy' });

  // transcribe: octet-stream body in T3's format, preferences from T3's client settings.
  s = fakeServer((pathname, init) => {
    assert.equal(pathname, '/api/voice/transcribe');
    assert.equal(init.headers['content-type'], 'application/octet-stream');
    const decoded = decodeLikeT3(new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength));
    assert.equal(decoded.options.speechLanguage, 'de');
    assert.equal(decoded.pcm.byteLength, 64);
    return response(200, { text: german });
  });
  const speaking = createVoice({ server: s, settings: () => ({ speechLanguage: 'de' }) });
  assert.deepEqual(await speaking.transcribe(new Uint8Array(64)), { text: german });
  await assert.rejects(speaking.transcribe('not audio'), { code: 'invalid-audio' });

  // cancel aborts the running request; the caller learns it stopped.
  s = fakeServer((_p, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
  const stopping = createVoice({ server: s, settings: () => ({}) });
  const pending = stopping.transcribe(new Uint8Array(64));
  stopping.cancel();
  await assert.rejects(pending, { code: 'cancelled' });
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
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/office/dictation-capture.worklet.js'), 'utf8'), {
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

async function composer() {
  class Element extends EventTarget {
    hidden = false; disabled = false; textContent = ''; value = ''; selectionStart = 0; selectionEnd = 0;
    attributes = {}; children = []; style = {};
    setAttribute(k, v) { this.attributes[k] = v; }
    removeAttribute(k) { delete this.attributes[k]; }
    appendChild(e) { this.children.push(e); }
    append(...e) { this.children.push(...e); }
    replaceChildren(...e) { this.children = e; this.textContent = ''; }
    insertBefore(e) { this.children.push(e); }
    querySelector() { return this.span ||= new Element(); }
    focus() {}
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
  }
  const textOf = e => typeof e === 'string' ? e : (e.textContent || '') + (e.children || []).map(textOf).join('');
  const form = new Element(), input = new Element(), send = new Element(), tools = new Element();
  form.querySelector = selector => ({ textarea: input, '.cp-send': send, '.cp-tools': tools, '.cp-hint': new Element() })[selector];
  let owner = 'first', stopped = 0, runResolve, runs = 0, cancelled = 0, capture, prepared = 0, status = 'ready', downloads = 0, progress;
  const opened = () => ({ getTracks: () => [{ stop: () => { stopped++; } }] });
  let getUserMedia = async () => opened();
  const window = new EventTarget();
  window.setTimeout = (fn, ms) => setTimeout(fn, Math.min(ms, 5)); window.clearTimeout = clearTimeout;
  window.lucidDictation = {
    status: async () => ({ state: status, modelId: 'm1', model: 'Model One', size: 731e6 }),
    progress: async () => progress,
    download: async () => { downloads++; },
    cancelDownload: async () => {},
    prepare: async () => { prepared++; },
    transcribe: () => { runs++; assert(stopped > 0, 'the microphone is released before T3 transcribes'); return new Promise(resolve => { runResolve = resolve; }); },
    cancel: async () => { cancelled++; },
  };
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
  const documentFake = Object.assign(new EventTarget(), { hidden: false, createElement: () => new Element(), createTextNode: text => text });
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/office/dictation.ts'), 'utf8').replace("import './dictation.css';", '').replace(/^import \{ loadCaptureWorklet \}.*;$/m, "const loadCaptureWorklet = context => context.audioWorklet.addModule('blob:fixture');");
  const compiled = require('node:module').stripTypeScriptTypes(source, { mode: 'transform' }).replace('export function attachDictation', 'function attachDictation').replace(/export\s*\{\s*\};?/, '') + '\nexports.attachDictation = attachDictation;';
  const exports = {};
  vm.runInNewContext(compiled, { exports, window, document: documentFake, navigator: { mediaDevices: { getUserMedia: (...args) => getUserMedia(...args) } }, AudioContext: Audio, AudioWorkletNode: Worklet, OfflineAudioContext: Offline, Event, DOMException, Uint8Array, Float32Array, URL, console, Math });
  const controller = exports.attachDictation(form, () => owner), button = tools.children[0], note = form.children.at(-1);
  const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

  // First use: no model in T3. Nothing records; the note offers T3's selected model.
  status = 'missing-model'; progress = { state: 'downloadable', name: 'Model One', size: 1000e6, downloaded: 0, error: null };
  button.onclick(); await settle();
  assert(!controller.active(), 'no recording without a speech model'); assert.equal(stopped, 0, 'the microphone was never opened');
  assert.match(textOf(note), /Download Model One \(731 MB\)/);
  const download = note.children.find(c => c.textContent === 'Download');
  download.onclick(); await settle();
  assert.equal(downloads, 1);
  progress = { ...progress, state: 'downloading', downloaded: 400e6 };
  await new Promise(resolve => setTimeout(resolve, 20)); await settle();
  assert.match(textOf(note), /Downloading Model One: 400 MB of 1[,.\u202f ]?000 MB/, 'the note shows T3\'s downloaded bytes');
  const bar = note.children.find(c => c.className === 'cp-dictation-progress');
  assert(Math.abs(bar.value - 0.4) < 1e-9, 'the bar follows real progress');
  progress = { ...progress, state: 'installed', downloaded: 1000e6 };
  await new Promise(resolve => setTimeout(resolve, 20)); await settle();
  assert.match(note.textContent, /ready/);
  status = 'ready';

  input.value = 'Existing draft'; input.selectionStart = input.selectionEnd = input.value.length;
  button.onclick(); await settle();
  assert(controller.active()); assert(send.disabled);
  assert.equal(prepared, 1, 'T3 starts loading its model while you speak');
  const submit = new Event('submit', { cancelable: true }); form.dispatchEvent(submit); assert(submit.defaultPrevented);
  capture.port.onmessage({ data: new Float32Array(8000) });
  button.onclick(); await settle(); assert.equal(runs, 1);
  runResolve({ text: german }); await settle();
  assert.equal(input.value, 'Existing draft ' + german); assert(!send.disabled); assert(!controller.active()); assert.equal(stopped, 1);
  // A late result must not land in another thread or overwrite its draft.
  button.onclick(); await settle(); capture.port.onmessage({ data: new Float32Array(8000) }); button.onclick(); await settle();
  controller.cancel(); owner = 'second'; input.value = 'Second draft';
  runResolve({ text: 'Wrong thread' }); await settle(); assert.equal(input.value, 'Second draft');
  // Cancel while the microphone permission request is still outstanding.
  let allow;
  getUserMedia = () => new Promise(resolve => { allow = resolve; });
  button.onclick(); await settle(); controller.cancel(); allow(opened()); await settle();
  assert(!controller.active()); assert(!send.disabled); assert.equal(stopped, 3); assert(cancelled >= 2);
  // An outdated T3 explains itself instead of recording.
  window.lucidDictation.status = async () => { throw Object.assign(new Error('Update T3 Code to use dictation.'), { code: 'outdated' }); };
  button.onclick(); await settle();
  assert(!controller.active()); assert.match(note.textContent, /Update T3 Code/);
}

(async () => {
  protocol(); await errors(); await client(); batchedCapture(); await composer();
  console.log('PASS: T3 voice request encoding, recognition preferences, error mapping, one-time scope grant, download progress and failure, cancellation, capture worklet, first-use prompt and thread-safe draft insertion.');
})().catch(error => { console.error(error); process.exitCode = 1; });
