// Save on every input so recovery does not depend on an orderly shutdown.
export function readPromptDraft(key: string): string {
  try { return localStorage.getItem(`lucid:prompt:${key}`) || ""; } catch { return ""; }
}
export function writePromptDraft(key: string, text: string): boolean {
  try {
    if (text) localStorage.setItem(`lucid:prompt:${key}`, text);
    else localStorage.removeItem(`lucid:prompt:${key}`);
    return true;
  } catch { return false; }
}
