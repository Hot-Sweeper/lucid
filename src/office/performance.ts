import { diagnosticKeys, diagnosticOff, setDiagnosticOff, onDiagnosticsChange, type DiagnosticKey } from '../perf/diagnostics';
import { gameSound } from './sound';
import './performance.css';

const labels: Record<DiagnosticKey, [string, string]> = {
  screens: ['Screen painting', 'Pause simulated screen drawing and cosmetic clocks.'],
  bodies: ['Robot body drawing', 'Freeze body poses while movement and work continue.'],
  weather: ['Weather rendering', 'Stop sky and precipitation drawing.'],
  outside: ['Outdoor artwork', 'Hide outdoor scenery to isolate compositing cost.'],
  grounds: ['Room artwork', 'Hide room floors, walls and static artwork.'],
  robots: ['Robot visibility', 'Hide robot artwork, without stopping their work.'],
  animations: ['CSS animations', 'Pause CSS animations and remove CSS transitions.'],
  effects: ['Shadows and filters', 'Remove shadows, blur and filters temporarily.'],
  sound: ['Sound generation', 'Suppress new sounds without changing your saved volume.'],
  scene: ['Entire office visibility', 'Hide the office to compare against the panels alone.'],
};

export function mountPerformancePanel(parent: HTMLElement) {
  const panel = document.createElement('details');
  panel.className = 'performance-panel';
  const summary = document.createElement('summary'); summary.textContent = 'Performance testing';
  const hint = document.createElement('p');
  hint.textContent = 'Switch off one item at a time, then repeat the same pan or zoom. Temporary until reload. Agent work stays running.';
  const reading = document.createElement('output'); reading.textContent = 'Open to sample frame timing';
  const inputs = new Map<DiagnosticKey, HTMLInputElement>();
  panel.append(summary, hint, reading);
  for (const key of diagnosticKeys) {
    const row = document.createElement('label');
    const text = document.createElement('span'); text.textContent = labels[key][0];
    const note = document.createElement('small'); note.textContent = labels[key][1]; text.append(note);
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !diagnosticOff(key);
    input.setAttribute('role', 'switch'); input.setAttribute('aria-label', labels[key][0]);
    input.addEventListener('change', () => { gameSound.play('switch'); setDiagnosticOff(key, !input.checked); });
    inputs.set(key, input); row.append(text, input); panel.append(row);
  }
  const actions = document.createElement('div'); actions.className = 'performance-actions';
  for (const [label, off] of [['Turn all off', true], ['Restore all', false]] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'link-btn'; button.textContent = label;
    button.addEventListener('click', () => { gameSound.play('switch'); for (const key of diagnosticKeys) setDiagnosticOff(key, off); });
    actions.append(button);
  }
  panel.append(actions); parent.append(panel);
  let soundWasEnabled: boolean | undefined;
  const stop = onDiagnosticsChange(() => {
    if (diagnosticOff('sound')) {
      soundWasEnabled ??= gameSound.enabled;
      gameSound.enabled = false;
    } else if (soundWasEnabled !== undefined) {
      gameSound.enabled = soundWasEnabled; soundWasEnabled = undefined;
    }
    for (const [key, input] of inputs) input.checked = !diagnosticOff(key); });
  let raf = 0, last = 0, start = 0, samples: number[] = [];
  const frame = (now: number) => {
    raf = 0;
    if (!panel.open || document.hidden) return;
    if (last) samples.push(now - last);
    last = now;
    if (!start) start = now;
    if (now - start >= 1000 && samples.length) {
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const sorted = [...samples].sort((a, b) => a - b);
      reading.textContent = `${Math.round(1000 / mean)} callbacks/s | ${mean.toFixed(1)} ms avg | ${sorted[Math.ceil(sorted.length * .95) - 1].toFixed(1)} ms p95`;
      samples = []; start = now;
    }
    raf = requestAnimationFrame(frame);
  };
  const sync = () => { cancelAnimationFrame(raf); raf = 0; last = start = 0; samples = []; if (panel.open && !document.hidden) raf = requestAnimationFrame(frame); };
  panel.addEventListener('toggle', sync); document.addEventListener('visibilitychange', sync);
  reading.title = 'Browser animation callback timing, not physical display FPS. Sampling runs only while this panel is open.';
  return () => { cancelAnimationFrame(raf); if (soundWasEnabled !== undefined) gameSound.enabled = soundWasEnabled; stop(); document.removeEventListener('visibilitychange', sync); panel.remove(); };
}
