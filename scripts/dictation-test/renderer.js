const $ = id => document.getElementById(id);
let state = 'loading', stream, context, source, capture, mute, chunks = [], limit, generation = 0;
let flushDone;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function setState(next) {
  state = next;
  $('record').disabled = !['ready', 'recording'].includes(state);
  $('record').textContent = state === 'recording' ? 'Stop and transcribe' : state === 'transcribing' ? 'Transcribing...' : 'Record';
  $('cancel').hidden = state !== 'recording';
  $('reload').disabled = ['loading', 'recording', 'transcribing', 'starting'].includes(state);
  $('backend').disabled = $('reload').disabled;
}
async function load() {
  setState('loading'); status('Loading the local model...');
  try {
    const result = await window.dictation.load($('backend').value);
    $('device').textContent = `Parakeet Ultra Q8_0. ${result.device} (${result.backend}). Loaded in ${(result.loadMs / 1000).toFixed(1)} seconds.`;
    setState('ready'); status('Ready. Click Record, then speak English or German.');
  } catch (error) { setState('error'); status(`Could not load the model. ${error.message}`, true); }
}
async function release() {
  clearTimeout(limit);
  flushDone?.(); flushDone = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  source?.disconnect(); capture?.disconnect(); mute?.disconnect();
  source = capture = mute = null;
  const old = context; context = null;
  if (old && old.state !== 'closed') await old.close();
}
async function record() {
  const mine = ++generation;
  setState('starting'); status('Waiting for microphone access...');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    context = new AudioContext();
    await context.audioWorklet.addModule('capture-worklet.js');
    await context.resume();
    source = context.createMediaStreamSource(stream);
    capture = new AudioWorkletNode(context, 'dictation-capture');
    mute = context.createGain(); mute.gain.value = 0;
    chunks = [];
    capture.port.onmessage = event => {
      if (mine !== generation) return;
      if (event.data?.type === 'flushed') { flushDone?.(); return; }
      if (event.data instanceof Float32Array && (state === 'recording' || flushDone)) chunks.push(event.data);
    };
    source.connect(capture); capture.connect(mute); mute.connect(context.destination);
    setState('recording'); status('Recording. Click Stop when finished. Maximum two minutes.');
    limit = setTimeout(() => stop(false), 119000);
  } catch (error) {
    await release(); chunks = []; setState('ready');
    status(error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow microphone access in Windows privacy settings and try again.' : `Could not open the microphone. ${error.message}`, true);
  }
}
async function stop(discard) {
  if (state !== 'recording') return;
  const rate = context.sampleRate;
  setState('transcribing');
  if (!discard) await new Promise(resolve => {
    const timer = setTimeout(() => { flushDone = null; resolve(); }, 1000);
    flushDone = () => { clearTimeout(timer); flushDone = null; resolve(); };
    capture.port.postMessage('flush');
  });
  const recorded = chunks; chunks = [];
  ++generation;
  await release();
  if (discard) { setState('ready'); status('Recording discarded.'); return; }
  const length = recorded.reduce((sum, chunk) => sum + chunk.length, 0);
  if (length < rate * .3) { setState('ready'); status('The recording was too short. Speak for at least a moment.', true); return; }
  status('Transcribing on this computer...');
  try {
    const offline = new OfflineAudioContext(1, Math.round(length * 16000 / rate), 16000);
    const buffer = offline.createBuffer(1, length, rate);
    let offset = 0;
    for (const chunk of recorded) { buffer.copyToChannel(chunk, 0, offset); offset += chunk.length; }
    const input = offline.createBufferSource(); input.buffer = buffer; input.connect(offline.destination); input.start();
    const rendered = await offline.startRendering();
    const then = performance.now();
    const result = await window.dictation.run(new Uint8Array(rendered.getChannelData(0).buffer));
    const text = result.text.trim();
    if (text) { $('transcript').value += ($('transcript').value ? '\n\n' : '') + text; $('copy').disabled = false; }
    $('timing').textContent = `${result.audioSeconds.toFixed(1)} s audio, ${(result.computeMs / 1000).toFixed(2)} s recognition, ${((performance.now() - then) / 1000).toFixed(2)} s including transfer`;
    setState('ready'); status(text ? 'Done. Edit or copy your transcript, or record again.' : 'No words were recognized. Try speaking closer to the microphone.');
  } catch (error) { setState('error'); status(`Recognition failed. Reload the model to retry. ${error.message}`, true); }
}
$('record').onclick = () => state === 'recording' ? stop(false) : record();
$('cancel').onclick = () => stop(true);
$('reload').onclick = load;
$('backend').onchange = load;
$('transcript').oninput = () => { $('copy').disabled = !$('transcript').value.trim(); };
$('copy').onclick = async () => { await window.dictation.copy($('transcript').value); status('Transcript copied.'); };
window.addEventListener('beforeunload', () => { stream?.getTracks().forEach(track => track.stop()); });
load();
