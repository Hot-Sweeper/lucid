import captureSource from './dictation-capture.worklet.js?raw';

/** Worklet module fetches from file:// are rejected in the packaged renderer. */
export async function loadCaptureWorklet(context: AudioContext) {
  const url = URL.createObjectURL(new Blob([captureSource], { type: 'text/javascript' }));
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
