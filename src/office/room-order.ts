export const movableRoom = (id: string) => id === "freelance" || id.startsWith("p:");

/** Saved hidden offices keep their place; newly discovered offices append stably. */
export function orderedRooms<T extends { id: string }>(rooms: T[], saved: readonly string[]) {
  const rank = new Map([...new Set(saved.filter(movableRoom))].map((id, i) => [id, i]));
  return rooms.map((room, i) => ({ room, i })).sort((a, b) =>
    (rank.get(a.room.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.room.id) ?? Number.MAX_SAFE_INTEGER) || a.i - b.i).map(({ room }) => room);
}

/** Null is the slot after the final visible office. Utility rooms never move. */
export function moveRoomOrder(saved: readonly string[], visible: readonly string[], id: string, before: string | null): string[] | null {
  const current = [...new Set(visible.filter(movableRoom))];
  if (!current.includes(id) || (before !== null && !current.includes(before)) || id === before) return null;
  const next = current.filter((key) => key !== id);
  next.splice(before === null ? next.length : next.indexOf(before), 0, id);
  if (next.every((key, i) => key === current[i])) return null;
  const complete = [...new Set([...saved.filter(movableRoom), ...current])];
  const shown = new Set(current);
  let slot = 0;
  return complete.map((key) => shown.has(key) ? next[slot++] : key);
}

export type RoomDragRect = { id: string; title: string; left: number; top: number; width: number; height: number };
export function roomDropSlot(rects: readonly RoomDragRect[], id: string, x: number, y: number, vertical = false) {
  const other = rects.filter((r) => r.id !== id && r.width > 0 && r.height > 0);
  const target = other.map((r) => ({ r, distance: Math.hypot(Math.max(r.left - x, 0, x - r.left - r.width), Math.max(r.top - y, 0, y - r.top - r.height)) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!target || target.distance > 100) return null;
  const r = target.r;
  const after = vertical ? y >= r.top + r.height / 2 : y > r.top + r.height * .65 || (y >= r.top + r.height * .35 && x >= r.left + r.width / 2);
  const index = rects.findIndex((q) => q.id === r.id);
  const before = after ? rects.slice(index + 1).find((q) => q.id !== id)?.id ?? null : r.id;
  return { before, target: r, after };
}
