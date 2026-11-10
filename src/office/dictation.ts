import './dictation.css';
import { loadCaptureWorklet } from './dictation-worklet';

type VoiceStatus = { state: 'ready' | 'missing-model' | 'transcribing'; modelId: string; model: string; size: number };
type VoiceProgress = { state: 'downloadable' | 'downloading' | 'verifying' | 'installed'; name: string; size: number; downloaded: number; error: string | null };
type DictationAPI = {
  status(): Promise<VoiceStatus>;
  progress(modelId: string): Promise<VoiceProgress>;
  download(modelId: string): Promise<unknown>;
  cancelDownload(modelId: string): Promise<unknown>;
  prepare(): Promise<unknown>;
  transcribe(bytes: Uint8Array): Promise<{ text: string }>;
  cancel(): Promise<unknown>;
};
declare global { interface Window { lucidDictation?: DictationAPI } }

const MAX_SECONDS = 290; // T3 accepts five minutes per recording
/** Errors cross the preload bridge, so read the message instead of checking the class. */
const reason = (error: unknown, fallback: string) => typeof (error as Error)?.message === 'string' && (error as Error).message ? (error as Error).message : fallback;
const megabytes = (bytes: number) => `${Math.max(1, Math.round(bytes / 1e6)).toLocaleString()} MB`;

/** One recording belongs to one composer/thread. Closing it invalidates late results. */
export function attachDictation(form: HTMLFormElement, owner: () => string | null) {
  const api = window.lucidDictation;
  if (!api) return { cancel() {}, active: () => false };
  const input = form.querySelector('textarea')!;
  const send = form.querySelector<HTMLButtonElement>('.cp-send')!;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'cp-dictate';
  button.title = 'Dictate with T3 Code\'s speech model. Escape cancels.';
  button.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="7" y="2" width="6" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 9a5.5 5.5 0 0 0 11 0M10 14.5V18M7 18h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>Dictate</span>';
  button.setAttribute('aria-pressed', 'false');
  form.querySelector('.cp-tools')!.insertBefore(button, form.querySelector('.cp-hint'));
  const note = document.createElement('p'); note.className = 'cp-dictation-note'; note.setAttribute('role', 'status'); note.hidden = true;
  form.appendChild(note);
  let phase: 'idle' | 'starting' | 'recording' | 'transcribing' = 'idle';
  let generation = 0, stream: MediaStream | null = null, context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null, capture: AudioWorkletNode | null = null, gain: GainNode | null = null;
  let chunks: Float32Array[] = [], limit = 0, previousSendDisabled = false;
  let flushDone: (() => void) | null = null;
  const message = (text: string) => { stopSetup(); note.textContent = text; note.hidden = !text; };

  // First use: T3 has no speech model yet. Its selected model is downloaded through T3, with T3's
  // own progress, so T3 and this window share it. One poll at a time, paused while hidden.
  let setupGen = 0, setupTimer = 0;
  function stopSetup() { setupGen++; window.clearTimeout(setupTimer); document.removeEventListener('visibilitychange', resumeSetup); }
  let resumeSetup = () => {};
  function action(label: string, run: () => void) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'link-btn cp-dictation-setup'; b.textContent = label;
    b.onclick = () => { b.disabled = true; run(); };
    return b;
  }
  function offerDownload(st: VoiceStatus, error = '') {
    message('');
    note.append(document.createTextNode(error
      ? `The download stopped: ${error} `
      : `Dictation uses T3 Code's speech model. Download ${st.model} (${megabytes(st.size)}) once and T3 uses it too. T3 lets this app manage its speech models for that. `));
    note.append(action(error ? 'Try again' : 'Download', () => {
      void api!.download(st.modelId).then(() => watchDownload(st), (e: unknown) => offerDownload(st, reason(e, 'T3 did not start the download.')));
    }));
    note.hidden = false;
  }
  /** Resume watching a download already running in T3, or offer one. */
  async function setup(st: VoiceStatus) {
    try {
      const p = await api!.progress(st.modelId);
      if (p.state === 'downloading' || p.state === 'verifying') { watchDownload(st); return; }
    } catch { /* offer the download; its own request reports what is wrong */ }
    offerDownload(st);
  }
  function watchDownload(st: VoiceStatus) {
    stopSetup();
    const mine = setupGen;
    const bar = document.createElement('progress'); bar.className = 'cp-dictation-progress'; bar.max = 1;
    const text = document.createElement('span');
    note.replaceChildren(text, bar, action('Cancel', () => { void api!.cancelDownload(st.modelId).catch(() => {}).then(() => offerDownload(st)); }));
    note.hidden = false;
    text.textContent = `Starting the download of ${st.model}... `;
    const poll = async () => {
      if (mine !== setupGen) return;
      if (document.hidden) { resumeSetup = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', resumeSetup); void poll(); } }; document.addEventListener('visibilitychange', resumeSetup); return; }
      try {
        const p = await api!.progress(st.modelId);
        if (mine !== setupGen) return;
        if (p.state === 'installed') { message('Dictation is ready. Click Dictate and speak.'); return; }
        if (p.error) { offerDownload(st, p.error); return; }
        if (p.state === 'verifying') { text.textContent = `Checking ${p.name}... `; bar.removeAttribute('value'); }
        else if (p.state === 'downloading' && p.size > 0) { text.textContent = `Downloading ${p.name}: ${megabytes(p.downloaded)} of ${megabytes(p.size)} `; bar.value = Math.min(1, p.downloaded / p.size); }
      } catch (e) {
        if (mine === setupGen) { message(reason(e, 'T3 stopped answering about the download.')); return; }
      }
      if (mine === setupGen) setupTimer = window.setTimeout(() => void poll(), 1000);
    };
    void poll();
  }

  function state(next: typeof phase) {
    phase = next;
    button.disabled = next === 'transcribing';
    button.querySelector('span')!.textContent = next === 'recording' ? 'Stop' : next === 'starting' ? 'Cancel' : next === 'transcribing' ? 'Transcribing...' : 'Dictate';
    button.setAttribute('aria-pressed', String(next === 'recording'));
    send.disabled = next === 'idle' ? previousSendDisabled : true;
  }
  async function release() {
    window.clearTimeout(limit);
    flushDone?.(); flushDone = null;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    source?.disconnect(); capture?.disconnect(); gain?.disconnect();
    source = capture = gain = null;
    const old = context; context = null;
    if (old && old.state !== 'closed') await old.close();
  }
  function cancel() {
    if (phase === 'idle') { message(''); return; }
    generation++; chunks = [];
    void release();
    void api!.cancel().catch(() => {});
    state('idle'); message('');
  }
  async function finish() {
    if (phase !== 'recording' || !context) return;
    const mine = generation, thread = owner(), rate = context.sampleRate;
    state('transcribing'); message('Transcribing in T3 Code...');
    try {
      // Drain the final partial batch before disconnecting the audio graph.
      await new Promise<void>(resolve => {
        const timer = window.setTimeout(() => { flushDone = null; resolve(); }, 1000);
        flushDone = () => { window.clearTimeout(timer); flushDone = null; resolve(); };
        capture!.port.postMessage('flush');
      });
      if (mine !== generation) return;
      const recorded = chunks; chunks = [];
      await release();
      const length = recorded.reduce((sum, chunk) => sum + chunk.length, 0);
      if (length < rate * .3) throw new Error('The recording was too short. Try again.');
      // T3 takes 16 kHz mono Float32 PCM.
      const offline = new OfflineAudioContext(1, Math.round(length * 16000 / rate), 16000);
      const buffer = offline.createBuffer(1, length, rate);
      let offset = 0;
      const channel = buffer.getChannelData(0);
      for (const chunk of recorded) { channel.set(chunk, offset); offset += chunk.length; }
      const audio = offline.createBufferSource(); audio.buffer = buffer; audio.connect(offline.destination); audio.start();
      const rendered = await offline.startRendering();
      if (mine !== generation || thread !== owner()) return;
      const result = await api!.transcribe(new Uint8Array(rendered.getChannelData(0).buffer));
      if (mine !== generation || thread !== owner()) return;
      const text = result.text.trim();
      if (text) {
        const start = input.selectionStart, end = input.selectionEnd;
        const before = input.value.slice(0, start), after = input.value.slice(end);
        input.setRangeText((before && !/\s$/.test(before) ? ' ' : '') + text + (after && !/^\s|^[,.!?;:]/.test(after) ? ' ' : ''), start, end, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        message('');
        input.focus({ preventScroll: true });
      } else message('No words recognized. Try speaking closer to the microphone.');
    } catch (error) {
      if (mine !== generation) return;
      if ((error as { code?: string })?.code === 'missing-model') { try { const st = await api!.status(); if (st.state === 'missing-model') { await setup(st); return; } } catch { /* the original message below */ } }
      message(reason(error, 'Dictation failed. Try again.'));
    } finally { if (mine === generation) state('idle'); }
  }
  async function begin() {
    if (!owner() || input.disabled) return;
    const mine = ++generation;
    previousSendDisabled = send.disabled;
    state('starting'); message('Opening microphone...');
    try {
      // T3 must have its speech model before anything is recorded.
      const st = await api!.status();
      if (mine !== generation) return;
      if (st.state === 'missing-model') { state('idle'); await setup(st); return; }
      const opened = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (mine !== generation) { opened.getTracks().forEach(track => track.stop()); return; }
      stream = opened;
      context = new AudioContext();
      await loadCaptureWorklet(context);
      if (mine !== generation) return;
      await context.resume();
      if (mine !== generation || !context) return;
      source = context.createMediaStreamSource(stream);
      capture = new AudioWorkletNode(context, 'dictation-capture');
      gain = context.createGain(); gain.gain.value = 0;
      chunks = [];
      capture.port.onmessage = event => {
        if (mine !== generation) return;
        if (event.data?.type === 'flushed') { flushDone?.(); return; }
        if (event.data instanceof Float32Array && (phase === 'recording' || flushDone)) chunks.push(event.data);
      };
      source.connect(capture); capture.connect(gain); gain.connect(context.destination);
      state('recording'); message('Recording. Click Stop when finished. Escape cancels.');
      // T3 loads the model while you speak, so the transcript comes back sooner.
      void api!.prepare().catch(() => {});
      limit = window.setTimeout(() => void finish(), MAX_SECONDS * 1000);
    } catch (error) {
      if (mine !== generation) return;
      await release(); state('idle');
      message(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow this app in microphone privacy settings, then try again.' : reason(error, 'Could not open the microphone.'));
    }
  }
  button.onclick = () => { if (phase === 'starting') cancel(); else if (phase === 'recording') void finish(); else if (phase === 'idle') void begin(); };
  form.addEventListener('submit', event => { if (phase !== 'idle') { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && phase !== 'idle') { event.preventDefault(); event.stopImmediatePropagation(); cancel(); input.focus(); }
  }, true);
  window.addEventListener('beforeunload', cancel);
  return { cancel: () => { cancel(); stopSetup(); }, active: () => phase !== 'idle' };
}
