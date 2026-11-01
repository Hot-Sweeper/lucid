import { getLocale, localizeData } from "../localization";

// Only authored game prose reaches the translator. Speaker names, channel IDs,
// reaction kinds, asset names, tags and gameplay values stay in the source data.
const prose = new Set(["text", "t", "title", "caption", "subj", "body", "reply", "note", "bio"]);
type Slot = { path: (string | number)[]; text: string };
export function flavorSlots(value: unknown): Slot[] {
  const slots: Slot[] = [];
  const visit = (v: unknown, path: (string | number)[], allowed: boolean) => {
    if (typeof v === "string") {
      if (allowed && v.trim()) slots.push({ path, text: v });
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => visit(item, [...path, i], allowed));
    } else if (v && typeof v === "object") {
      for (const [key, item] of Object.entries(v)) {
        if (prose.has(key) || key === "lines") visit(item, [...path, key], true);
      }
    }
  };
  visit(value, [], true);
  return slots;
}

const cache = new Map<string, unknown>();
const pending = new Set<string>();
/** A nonblocking, lazy view of one authored scene. Never changes canonical data. */
export function localizedFlavor<T>(source: T, context: string): T {
  if (getLocale() === "en") return source;
  const key = `${getLocale()}:${context}:${JSON.stringify(source)}`;
  if (cache.has(key)) return cache.get(key) as T;
  if (!pending.has(key) && pending.size < 48) {
    const slots = flavorSlots(source);
    if (!slots.length) return source;
    pending.add(key);
    void localizeData(slots.map((slot) => slot.text), `Game flavor scene: ${context}. Keep every setup, reply and punchline coherent together. Do not add or remove lines.`).then((texts) => {
      if (texts.length !== slots.length || texts.every((text, i) => text === slots[i].text)) return;
      let result: any = structuredClone(source);
      slots.forEach((slot, i) => {
        if (!slot.path.length) result = texts[i];
        else {
          let owner = result;
          for (const part of slot.path.slice(0, -1)) owner = owner[part];
          owner[slot.path[slot.path.length - 1]] = texts[i];
        }
      });
      cache.set(key, result);
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
    }).catch(() => {}).finally(() => pending.delete(key));
  }
  return source;
}
