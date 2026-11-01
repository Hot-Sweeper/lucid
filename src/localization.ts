export type Locale = "en" | "de";
export type TranslationEntry = { id: string; text: string; context?: string };
const listeners = new Set<() => void>();
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const originals = new Map<string, string>();
export function rememberTranslation(source: string, translated: string) {
  if (source === translated) return;
  originals.set(translated, source);
  while (originals.size > 4000) originals.delete(originals.keys().next().value!);
}
export const canonicalText = (text: string) => originals.get(text) ?? text;
let locale: Locale = "en";
try { if (localStorage.getItem("lucid:language") === "de") locale = "de"; } catch {}

export const getLocale = () => locale;
/** Await outstanding prose work, for capture/export owners that need settled text. */
export async function whenTranslationsIdle() {
  while (pending.size) await Promise.all([...pending.values()]);
}
export function setLocale(next: Locale) {
  if (next !== "en" && next !== "de") throw Error("Choose English or German.");
  if (next === locale) return;
  locale = next;
  try { localStorage.setItem("lucid:language", next); } catch {}
  for (const notify of listeners) notify();
}
export function onLocaleChange(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; }

const german: Record<string, string> = {
  "Writing report": "Bericht schreiben",
  "Send to printer": "An Drucker senden",
  "Sent to printer": "An Drucker gesendet",
  "Nice to bit you.": "Du bist ganz mein Datentyp.",
  Games: "Spiele", Notes: "Notizen", Browser: "Browser", Files: "Dateien", Tasks: "Aufgaben",
  Calculator: "Rechner", Calendar: "Kalender", Settings: "Einstellungen", Search: "Suchen",
  Send: "Senden", Close: "Schließen", Back: "Zurück", Next: "Weiter", Cancel: "Abbrechen",
  Save: "Speichern", Open: "Öffnen", Play: "Abspielen", Pause: "Pause", Music: "Musik",
  Code: "Code", Messages: "Nachrichten", Tools: "Werkzeuge", Agents: "Agenten",
  Weather: "Wetter", Sketchpad: "Zeichenblock", Solitaire: "Solitär", Photos: "Fotos",
  Player: "Wiedergabe", Clock: "Uhr", Home: "Startseite", Subscribe: "Abonnieren",
  Subscribed: "Abonniert", Comments: "Kommentare", Reply: "Antworten", Share: "Teilen",
  Like: "Gefällt mir", Dislike: "Gefällt mir nicht", Trending: "Trends", History: "Verlauf",
  Library: "Mediathek", Online: "Online", Offline: "Offline", Typing: "Schreibt",
  Message: "Nachricht", "Type a message": "Nachricht schreiben", "Search videos": "Videos suchen",
  "Search or start new chat": "Suchen oder neuen Chat starten", "New chat": "Neuer Chat",
  "Add a comment": "Kommentar hinzufügen", "Add a comment...": "Kommentar hinzufügen...",
  "Watch later": "Später ansehen", "All videos": "Alle Videos", "robot videos": "Robotervideos",
};
export const uiText = (text: string) => locale === "de" ? german[text] ?? text : text;
const keyOf = (language: Locale, e: TranslationEntry) => JSON.stringify([language, e.context ?? "", e.text]);

/** Only authored game prose belongs here, never real coding conversations or code. */
export async function translateEntries(entries: TranslationEntry[], language: Locale = locale): Promise<{ id: string; text: string }[]> {
  if (language !== "en" && language !== "de") throw Error("Choose English or German.");
  const original = entries.map(({id, text}) => ({id, text}));
  const api = (window as any).lucid?.localize;
  if (language === "en" || !api) return original;
  const jobs: {entry: TranslationEntry; key: string; resolve: (text: string) => void}[] = [];
  for (const entry of entries) {
    const key = keyOf(language, entry);
    if (cache.has(key) || pending.has(key) || pending.size >= 160 || !entry.text.trim() || entry.text.length > 4000) continue;
    let resolve!: (text: string) => void;
    pending.set(key, new Promise<string>(done => { resolve = done; }));
    jobs.push({entry: {...entry, context: entry.context?.slice(0, 1000)}, key, resolve});
  }
  // Keep requests bounded to the backend's count and total-text limits.
  for (let i = 0; i < jobs.length;) {
    const batch: typeof jobs = []; let size = 0;
    while (i < jobs.length && batch.length < 80) {
      const n = jobs[i].entry.text.length + (jobs[i].entry.context?.length ?? 0);
      if (batch.length && size + n > 24000) break;
      size += n; batch.push(jobs[i++]);
    }
    void (async () => {
      let translated = new Map<string, string>();
      try {
        const reply = await api({locale: language, entries: batch.map((j, n) => ({...j.entry, id: String(n)}))});
        if (reply?.translated && Array.isArray(reply.entries) && reply.entries.length === batch.length) {
          for (let n = 0; n < batch.length; n++) {
            const found = reply.entries.filter((e: any) => e.id === String(n));
            if (found.length !== 1 || typeof found[0].text !== "string" || !found[0].text.trim()) throw Error("Invalid translation.");
            translated.set(batch[n].key, found[0].text);
          }
        }
      } catch { translated = new Map(); }
      finally {
        for (const j of batch) {
          const text = translated.get(j.key);
          if (text) { cache.set(j.key, text); rememberTranslation(j.entry.text, text); }
          j.resolve(text ?? j.entry.text); pending.delete(j.key);
        }
        while (cache.size > 1000) cache.delete(cache.keys().next().value!);
      }
    })();
  }
  return Promise.all(entries.map(async e => ({id: e.id, text: cache.get(keyOf(language, e)) ?? await pending.get(keyOf(language, e)) ?? e.text})));
}

/** Project the caller's prose structure without changing its canonical input. */
export async function localizeData<T>(source: T, context: string): Promise<T> {
  const language = locale;
  if (language === "en") return source;
  const slots: {path: (string | number)[]; text: string}[] = [];
  const visit = (value: unknown, path: (string | number)[]) => {
    if (typeof value === "string") { if (value.trim()) slots.push({path, text: value}); }
    else if (Array.isArray(value)) value.forEach((v, i) => visit(v, [...path, i]));
    else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => visit(v, [...path, k]));
  };
  visit(source, []);
  const result = await translateEntries(slots.map((s, i) => ({
    id: String(i), text: s.text,
    context: `${context.slice(0, 800)} Source position: ${s.path.join(".")}. Adjacent positions within the same scene belong together.`,
  })), language);
  let copy: any = structuredClone(source);
  slots.forEach((slot, i) => {
    if (!slot.path.length) copy = result[i].text;
    else { let owner = copy; for (const part of slot.path.slice(0, -1)) owner = owner[part]; owner[slot.path.at(-1)!] = result[i].text; }
  });
  return copy;
}
