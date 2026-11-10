// Written content pack for robot downtime: chats, thoughts, apps and games.
import { localizedFlavor } from "./localized";

export type { Topic, Place } from "./types";
export * from "./convos";
export * from "./thoughts";
export * from "./botcord";
export * from "./tube";
export * from "./phone";
export * from "./searches";
export * from "./games";

/**
 * Returns a picker that deals items in shuffled order with no repeats until
 * the list runs out, then reshuffles. Recently seen items are remembered in
 * localStorage under `key`, so after a restart they come last instead of first.
 * The list should not be empty.
 */
export function pickFresh<T>(list: readonly T[], key: string): () => T {
  if (list.length === 0) throw new Error(`pickFresh("${key}"): list is empty`);

  // Remember up to half the list. A full pass would make the next deal predictable.
  const keep = Math.max(1, Math.floor(list.length / 2));
  const ids = list.map((item) => idOf(item));
  let recent = load(key).slice(-keep);
  let deck: number[] = [];

  const deal = (): void => {
    const seen = new Set(recent);
    const fresh: number[] = [];
    const stale: number[] = [];
    ids.forEach((id, i) => (seen.has(id) ? stale : fresh).push(i));
    deck = [...shuffle(fresh), ...shuffle(stale)];
    // Never repeat the last item across a reshuffle.
    const last = recent[recent.length - 1];
    if (deck.length > 1 && ids[deck[0]] === last) deck.push(deck.shift()!);
  };

  return () => {
    if (deck.length === 0) deal();
    const i = deck.shift()!;
    const id = ids[i];
    recent = recent.filter((r) => r !== id);
    recent.push(id);
    if (recent.length > keep) recent = recent.slice(-keep);
    save(key, recent);
    // Warm just the next scene, retaining canonical IDs for repeat avoidance.
    if (deck.length) localizedFlavor(list[deck[0]], key);
    return localizedFlavor(list[i], key);
  };
}

function load(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function save(key: string, recent: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(recent));
  } catch {
    // Storage full or unavailable: freshness just won't survive a restart.
  }
}

/** Short stable id for an item, so edits to the lists don't break storage. */
function idOf(item: unknown): string {
  const text = typeof item === "string" ? item : JSON.stringify(item) ?? String(item);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
