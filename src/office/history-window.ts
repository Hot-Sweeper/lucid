export type HistoryCursor = { at: string; rowid: number };
export type HistoryPage<T> = { messages: T[]; cursor: HistoryCursor | null; hasMore: boolean };
type Entry = { id: string; at: string; orderAt?: string; sourceOrder?: number; role: string; run?: string | null };

// Older pages stay local. A live refresh only transfers the newest bounded page.
export class HistoryWindow<T extends Entry> {
  private rows = new Map<string, T>();
  private latest = new Set<string>();
  cursor: HistoryCursor | null = null;
  hasMore = false;
  private initialized = false;

  update(page: HistoryPage<T>, older = false) {
    if (!older) {
      const ids = new Set(page.messages.map((m) => m.id));
      const floor = page.messages.filter((m) => m.role !== "event" && m.run !== "queued")
        .reduce<T | null>((row, m) => row == null || m.at < row.at || (m.at === row.at && (m.sourceOrder || 0) < (row.sourceOrder || 0)) ? m : row, null);
      // An absent queued message has left the queue. Remove deleted/withdrawn recent
      // rows too, but keep messages that simply rolled out of the latest page.
      for (const id of this.latest) {
        const old = this.rows.get(id);
        const inLatestRange = floor != null && old != null && (old.at > floor.at || (old.at === floor.at && (old.sourceOrder || 0) >= (floor.sourceOrder || 0)));
        if (old && !ids.has(id) && (old.run === "queued" || inLatestRange)) this.rows.delete(id);
      }
      this.latest = ids;
    }
    for (const m of page.messages) {
      // The latest page contains the entire queue. A delayed historical read
      // cannot resurrect a prompt that has since been cancelled or picked up.
      if (older && m.run === "queued") continue;
      // A slow older-page reply must not overwrite a newer streaming update.
      if (!older || !this.latest.has(m.id)) this.rows.set(m.id, m);
    }
    if (!this.initialized || older) {
      this.cursor = page.cursor;
      this.hasMore = page.hasMore;
    }
    this.initialized = true;
    const rank = (m: T) => m.role === "user" ? 0 : m.role === "event" ? 1 : 2;
    return [...this.rows.values()].sort((a, b) => (a.orderAt || a.at).localeCompare(b.orderAt || b.at) || rank(a) - rank(b) || (a.sourceOrder || 0) - (b.sourceOrder || 0));
  }
}
