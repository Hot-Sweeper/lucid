// Which lines were said recently, office-wide and per robot, so nobody repeats a line soon
// after it was said: a robot never repeats one of its own last lines, and the office avoids
// the more recently used half of any pool. Kept compact, bounded and saved across launches.

export type Candidate<T> = { id: string; value: T; weight?: number };
type Saved = { tick: number; seen: Record<string, number>; robots: Record<string, string[]> };
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const KEY = "lucid:lines:recent:v1";
const ROBOT_KEEP = 16, SEEN_MAX = 900, ROBOTS_MAX = 80;

/** Short stable id for a line's canonical (English) text. */
export function lineId(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export class LineMemory {
  private state: Saved = { tick: 0, seen: {}, robots: {} };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private store: Store | null, private random: () => number = Math.random) {
    try {
      const raw = store?.getItem(KEY), parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed.tick === "number" && parsed.seen && parsed.robots) this.state = parsed;
    } catch { /* unreadable history starts fresh */ }
  }

  /** Picks a fresh candidate for this speaker (weighted), records it and returns its value. */
  pick<T>(list: Candidate<T>[], who?: string | null): T | null {
    if (!list.length) return null;
    const seen = this.state.seen, mine = new Set(who ? this.state.robots[who] ?? [] : []);
    const at = (c: Candidate<T>) => seen[c.id] ?? -1;
    const byRecent = [...list].sort((a, b) => at(b) - at(a));
    const blocked = new Set(byRecent.slice(0, Math.floor(list.length / 2)).filter(c => at(c) >= 0).map(c => c.id));
    let pool = list.filter(c => !mine.has(c.id) && !blocked.has(c.id));
    // A robot that has said most of a small pool may repeat its oldest line before it may echo
    // what the office just heard, so the office's recent half stays blocked as long as possible.
    if (!pool.length) {
      const order = who ? this.state.robots[who] ?? [] : [];
      const open = list.filter(c => !blocked.has(c.id));
      if (open.length) pool = [open.reduce((a, b) => (order.indexOf(a.id) <= order.indexOf(b.id) ? a : b))];
    }
    if (!pool.length) pool = list.filter(c => !mine.has(c.id));
    if (!pool.length) pool = [byRecent[byRecent.length - 1]];
    const total = pool.reduce((sum, c) => sum + Math.max(0, c.weight ?? 1), 0);
    let roll = this.random() * total, choice = pool[pool.length - 1];
    for (const c of pool) { roll -= Math.max(0, c.weight ?? 1); if (roll < 0) { choice = c; break; } }
    this.use(choice.id, who);
    return choice.value;
  }

  /** Records a line said outside `pick` (generated or scripted), so pools avoid it too. */
  use(id: string, who?: string | null) {
    const s = this.state;
    s.seen[id] = ++s.tick;
    const ids = Object.keys(s.seen);
    if (ids.length > SEEN_MAX) for (const old of ids.sort((a, b) => s.seen[a] - s.seen[b]).slice(0, ids.length - SEEN_MAX)) delete s.seen[old];
    if (who) {
      const list = (s.robots[who] ?? []).filter(x => x !== id);
      list.push(id);
      delete s.robots[who];
      s.robots[who] = list.slice(-ROBOT_KEEP);
      const names = Object.keys(s.robots);
      for (const old of names.slice(0, Math.max(0, names.length - ROBOTS_MAX))) delete s.robots[old];
    }
    this.scheduleSave();
  }

  recent(who: string) { return [...(this.state.robots[who] ?? [])]; }

  private scheduleSave() {
    if (!this.store || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try { this.store?.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage full: freshness only lasts this session */ }
    }, 1500);
  }
}

const storage = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
/** The office's one line memory. */
export const lineMemory = new LineMemory(storage());
