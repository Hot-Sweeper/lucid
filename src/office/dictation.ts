import './dictation.css';
import { loadCaptureWorklet } from './dictation-worklet';

type DictationResult = { text: string; computeMs: number; audioSeconds: number };
type DictationAPI = { load(mode?: string): Promise<unknown>; run(bytes: Uint8Array): Promise<DictationResult>; cancel(): Promise<void> };
declare global { interface Window { lucidDictation?: DictationAPI } }

/** One recording belongs to one composer/thread. Closing it invalidates late results. */
export function attachDictation(form: HTMLFormElement, owner: () => string | null) {
  const api = window.lucidDictation;
  if (!api) return { cancel() {}, active: () => false };
  const input = form.querySelector('textarea')!;
  const send = form.querySelector<HTMLButtonElement>('.cp-send')!;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'cp-dictate';
  button.title = 'Dictate in English or German. Escape cancels.';
  button.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="7" y="2" width="6" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 9a5.5 5.5 0 0 0 11 0M10 14.5V18M7 18h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>Dictate</span>';
  button.setAttribute('aria-pressed', 'false');
  form.querySelector('.cp-tools')!.insertBefore(button, form.querySelector('.cp-hint'));
  const note = document.createElement('p'); note.className = 'cp-dictation-note'; note.setAttribute('role', 'status'); note.hidden = true;
  form.appendChild(note);
  let phase: 'idle' | 'starting' | 'recording' | 'transcribing' = 'idle';
  let generation = 0, stream: MediaStream | null = null, context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null, capture: AudioWorkletNode | null = null, gain: GainNode | null = null;
  let chunks: Float32Array[] = [], limit = 0, previousSendDisabled = false;
  let loading: Promise<unknown> | null = null;
  const message = (text: string) => { note.textContent = text; note.hidden = !text; };
  function state(next: typeof phase) {
    phase = next;
    button.disabled = next === 'transcribing';
    button.querySelector('span')!.textContent = next === 'recording' ? 'Stop' : next === 'starting' ? 'Cancel' : next === 'transcribing' ? 'Transcribing...' : 'Dictate';
    button.setAttribute('aria-pressed', String(next === 'recording'));
    send.disabled = next === 'idle' ? previousSendDisabled : true;
  }
  async function release() {
    window.clearTimeout(limit);
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
    const mine = generation, thread = owner(), rate = context.sampleRate, recorded = chunks; chunks = [];
    state('transcribing'); message('Transcribing on this computer...');
    try {
      await release();
      const length = recorded.reduce((sum, chunk) => sum + chunk.length, 0);
      if (length < rate * .3) throw new Error('The recording was too short. Try again.');
      const offline = new OfflineAudioContext(1, Math.round(length * 16000 / rate), 16000);
      const buffer = offline.createBuffer(1, length, rate);
      let offset = 0;
      const channel = buffer.getChannelData(0);
      for (const chunk of recorded) { channel.set(chunk, offset); offset += chunk.length; }
      const audio = offline.createBufferSource(); audio.buffer = buffer; audio.connect(offline.destination); audio.start();
      const rendered = await offline.startRendering();
      await loading;
      if (mine !== generation || thread !== owner()) return;
      const result = await api!.run(new Uint8Array(rendered.getChannelData(0).buffer));
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
      if (mine === generation) message(error instanceof Error ? error.message : 'Dictation failed. Try again.');
    } finally { if (mine === generation) state('idle'); }
  }
  async function begin() {
    if (!owner() || input.disabled) return;
    const mine = ++generation;
    previousSendDisabled = send.disabled;
    state('starting'); message('Opening microphone...');
    // Attach rejection handling immediately, including cancellation during microphone permission.
    loading = api!.load('auto'); loading.catch(() => {});
    try {
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
      capture.port.onmessage = event => { if (mine === generation && phase === 'recording') chunks.push(event.data); };
      source.connect(capture); capture.connect(gain); gain.connect(context.destination);
      state('recording'); message('Recording. Click Stop when finished. Escape cancels.');
      limit = window.setTimeout(() => void finish(), 119000);
      loading.catch(error => { if (mine === generation && phase === 'recording') { cancel(); message(error.message); } });
    } catch (error) {
      if (mine !== generation) return;
      await release(); state('idle');
      message(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow Lucid in microphone privacy settings, then try again.' : error instanceof Error ? error.message : 'Could not open the microphone.');
    }
  }
  button.onclick = () => { if (phase === 'starting') cancel(); else if (phase === 'recording') void finish(); else if (phase === 'idle') void begin(); };
  form.addEventListener('submit', event => { if (phase !== 'idle') { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && phase !== 'idle') { event.preventDefault(); event.stopImmediatePropagation(); cancel(); input.focus(); }
  }, true);
  window.addEventListener('beforeunload', cancel);
  return { cancel, active: () => phase !== 'idle' };
}
