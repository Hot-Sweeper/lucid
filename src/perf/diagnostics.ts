// Session-only isolation switches. Never persisted into normal game settings.
export const diagnosticKeys = ['screens', 'bodies', 'weather', 'outside', 'grounds', 'robots', 'animations', 'effects', 'sound', 'scene'] as const;
export type DiagnosticKey = typeof diagnosticKeys[number];
const disabled = new Set<DiagnosticKey>();
const listeners = new Set<() => void>();
export const diagnosticOff = (key: DiagnosticKey) => disabled.has(key);
export function onDiagnosticsChange(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; }
export function setDiagnosticOff(key: DiagnosticKey, off: boolean) {
  if (disabled.has(key) === off) return;
  if (off) disabled.add(key); else disabled.delete(key);
  document.documentElement.classList.toggle(`perf-off-${key}`, off);
  for (const callback of listeners) callback();
}
