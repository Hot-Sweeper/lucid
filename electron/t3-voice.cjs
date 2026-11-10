// Dictation through T3 Code's own speech service (the "voice" HTTP API), so the speech model,
// its download and its recognition preferences are shared with T3.
//
//   GET  /api/voice/status            selected model and whether it is installed
//   GET  /api/voice/models            catalog with download state and bytes downloaded
//   POST /api/voice/models/prepare    load the selected model while the user speaks
//   POST /api/voice/models/download   install a model (settings:write; returns when done)
//   POST /api/voice/models/cancel     stop that download (settings:write)
//   POST /api/voice/transcribe        u32 LE options length, options JSON, 16 kHz mono Float32 PCM
//
// The recognition preferences (language, custom words, filler words, silence filtering) are the
// ones the user set in T3, read from T3's client-settings.json.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const T3_HOME = process.env.T3CODE_HOME || path.join(os.homedir(), ".t3");
const CLIENT_SETTINGS = path.join(T3_HOME, "userdata", "client-settings.json");
const SAMPLE_RATE = 16000;
const MAX_SECONDS = 300;
const MAX_PCM_BYTES = SAMPLE_RATE * 4 * MAX_SECONDS;
const MAX_OPTIONS_BYTES = 128000;

class VoiceError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// ---- protocol ---------------------------------------------------------------------------

/** T3's request body: options length (uint32 little endian), options JSON, then the PCM bytes. */
function encodeSpeechRequest(pcm, options) {
  const audio = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  if (!audio.length || audio.length % 4 || audio.length > MAX_PCM_BYTES) throw new VoiceError("The recording is empty or longer than five minutes.", "invalid-audio");
  const json = Buffer.from(JSON.stringify(options), "utf8");
  if (json.length > MAX_OPTIONS_BYTES) throw new VoiceError("T3's dictation dictionary is too large to send.", "invalid-options");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(json.length, 0);
  return Buffer.concat([head, json, audio]);
}

/** Recognition preferences in T3's SpeechTranscriptionOptions shape. Unknown values fall back to T3's defaults. */
function speechOptions(settings = {}) {
  const words = Array.isArray(settings.speechCustomWords) ? settings.speechCustomWords.filter((w) => w && typeof w.term === "string" && w.term.trim() && w.term.length <= 50)
    .slice(0, 100).map((w) => ({ term: w.term, aliases: (Array.isArray(w.aliases) ? w.aliases : []).filter((a) => typeof a === "string" && a.trim() && a.length <= 50).slice(0, 8) })) : [];
  const language = typeof settings.speechLanguage === "string" && settings.speechLanguage.length >= 2 && settings.speechLanguage.length <= 16 ? settings.speechLanguage : "auto";
  const options = {
    speechLanguage: language,
    speechTranslateToEnglish: settings.speechTranslateToEnglish === true,
    speechCustomWords: words,
    speechRemoveFillerWords: settings.speechRemoveFillerWords !== false,
    speechSilenceFiltering: settings.speechSilenceFiltering !== false,
  };
  if (typeof settings.speechCorrectionWord === "string" && settings.speechCorrectionWord.trim() && settings.speechCorrectionWord.length <= 50) options.speechCorrectionWord = settings.speechCorrectionWord;
  return options;
}
function readClientSettings(file = CLIENT_SETTINGS) {
  try { const v = JSON.parse(fs.readFileSync(file, "utf8")); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

const REASONS = {
  invalid_audio: ["The recording could not be read. Try again.", "invalid-audio"],
  speech_busy: ["T3 is busy with another recording or a model download. Try again in a moment.", "busy"],
  speech_unavailable: ["T3 cannot run dictation on this computer.", "unsupported"],
  invalid_command: ["T3 has no speech model installed for dictation yet.", "missing-model"],
};
const OUTDATED = "Update T3 Code to use dictation. This version has no dictation service.";

/** Turns a voice API answer into a value or a VoiceError with a readable message. */
async function readVoice(res) {
  const type = res.headers.get("content-type") || "";
  // T3 versions without the voice API answer unknown routes with their web app (200, HTML) or 404.
  if (res.status === 404 || (res.ok && !/json/i.test(type))) throw new VoiceError(OUTDATED, "outdated");
  let body = null;
  if (/json/i.test(type)) { try { body = await res.json(); } catch {} }
  if (res.ok) return body;
  if (res.status === 400 && REASONS[body?.reason]) { const [m, c] = REASONS[body.reason]; throw new VoiceError(m, c); }
  if (res.status === 413) throw new VoiceError("The recording is too long for T3. Keep it under five minutes.", "invalid-audio");
  if (res.status === 415) throw new VoiceError(OUTDATED, "outdated");
  throw new VoiceError(res.status >= 500 ? "T3 could not finish that. Try again." : `T3 answered ${res.status}.`, "http");
}

// ---- client -----------------------------------------------------------------------------

/**
 * `server` is t3server.cjs (or a fake in tests): authedRaw(path, init) and grantScope(scope).
 * One download job is tracked so its final error can be shown next to the polled progress.
 */
function createVoice({ server, settings = readClientSettings }) {
  let job = null; // { modelId, error, done }
  let transcribing = null; // AbortController of the running transcription

  const request = async (pathname, init) => {
    try { return await readVoice(await server.authedRaw(pathname, init)); }
    catch (err) {
      if (err instanceof VoiceError || err?.name === "AbortError") throw err;
      throw new VoiceError(err?.message || "Could not reach T3 Code.", err?.code || "offline");
    }
  };
  // settings:write is granted once (the user started the download), then the request repeats.
  const managed = async (pathname, body) => {
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    try { return await request(pathname, init); }
    catch (err) {
      if (err?.code !== "scope") throw err;
      await server.grantScope("settings:write");
      return request(pathname, init);
    }
  };

  /** { state: "ready" | "missing-model" | "transcribing", model, modelId, size } or a VoiceError. */
  async function status() {
    const s = await request("/api/voice/status", { method: "GET" });
    if (!s || typeof s !== "object" || typeof s.supported !== "boolean") throw new VoiceError(OUTDATED, "outdated");
    if (!s.supported) throw new VoiceError(s.reason ? `T3 cannot run dictation here: ${String(s.reason).slice(0, 200)}` : REASONS.speech_unavailable[0], "unsupported");
    return { state: s.state, modelId: s.modelId, model: s.model, size: s.size };
  }

  /** Download progress of one model, plus the error of the download this app started. */
  async function progress(modelId) {
    const list = await request("/api/voice/models", { method: "GET" });
    const m = (list?.models || []).find((x) => x.id === modelId);
    if (!m) throw new VoiceError("T3 no longer offers this speech model.", "missing-model");
    const failed = job && job.modelId === modelId && job.done && job.error && m.state === "downloadable" ? job.error : null;
    return { state: m.state, name: m.name, size: m.size, downloaded: typeof m.downloaded === "number" ? m.downloaded : m.state === "installed" ? m.size : 0, error: failed };
  }

  /** Starts T3's download of a model and returns at once; progress() reports how far it is. */
  async function download(modelId) {
    if (typeof modelId !== "string" || !modelId || modelId.length > 160) throw new VoiceError("Choose a speech model.", "invalid");
    if (job && !job.done) return { started: true };
    const mine = { modelId, error: null, done: false };
    job = mine;
    // The request stays open until the download finishes; T3 keeps downloading if it is dropped.
    const started = managed("/api/voice/models/download", { modelId });
    started.then(() => {}, (err) => { if (!/aborted|timeout/i.test(String(err?.name || err?.message))) mine.error = err.message || "The download stopped."; })
      .finally(() => { mine.done = true; });
    // Report permission and offline failures from the first moments directly.
    const early = await Promise.race([started.then(() => null, (e) => e), new Promise((r) => setTimeout(() => r(null), 1500))]);
    if (early && early.code !== "offline") throw early;
    return { started: true };
  }
  async function cancelDownload(modelId) {
    if (typeof modelId !== "string" || !modelId) return;
    await managed("/api/voice/models/cancel", { modelId });
  }

  /** Loads the model in T3 while the user is still speaking. Failures are ignored here. */
  function prepare() { request("/api/voice/models/prepare", { method: "POST" }).catch(() => {}); }

  async function transcribe(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new VoiceError("Invalid recording.", "invalid-audio");
    const body = encodeSpeechRequest(bytes, speechOptions(settings()));
    transcribing?.abort();
    const ctl = new AbortController();
    transcribing = ctl;
    try {
      const r = await request("/api/voice/transcribe", { method: "POST", headers: { "content-type": "application/octet-stream" }, body, signal: ctl.signal });
      return { text: typeof r?.text === "string" ? r.text : "" };
    } catch (err) {
      if (err?.name === "AbortError") throw new VoiceError("Dictation stopped.", "cancelled");
      throw err;
    } finally { if (transcribing === ctl) transcribing = null; }
  }
  function cancel() { transcribing?.abort(); transcribing = null; }

  return { status, progress, download, cancelDownload, prepare, transcribe, cancel };
}

/** IPC for the chat composer. Only the app's own window may record and transcribe. */
function register({ ipcMain, app, window, server }) {
  const voice = createVoice({ server });
  const calls = { status: () => voice.status(), progress: (id) => voice.progress(id), download: (id) => voice.download(id), cancelDownload: (id) => voice.cancelDownload(id), prepare: () => voice.prepare(), transcribe: (b) => voice.transcribe(b), cancel: () => voice.cancel() };
  for (const [name, fn] of Object.entries(calls)) {
    ipcMain.handle(`voice:${name}`, async (event, value) => {
      if (event.sender !== window()?.webContents || event.senderFrame !== event.sender.mainFrame) return { ok: false, error: "Dictation is only available in this window." };
      try { return { ok: true, value: await fn(value) }; }
      catch (err) { return { ok: false, error: err?.message || "Dictation failed.", code: err?.code || null }; }
    });
  }
  app.on("before-quit", () => voice.cancel());
  return voice;
}

module.exports = { encodeSpeechRequest, speechOptions, readClientSettings, readVoice, createVoice, register, VoiceError, MAX_PCM_BYTES };
