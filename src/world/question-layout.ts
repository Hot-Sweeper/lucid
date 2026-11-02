export type QuestionPlace = { x: number; y: number; zone: "line" | "waiting"; slot: number; key: string };

/** A single short FIFO line. Other visitors keep a reserved place around the room. */
export function questionPlaces(people: { id: string; needsDesk: boolean }[], w: number, h: number, previous: Map<string, string> = new Map()) {
  const cx = w / 2, first = 392, spacing = 124;
  const capacity = Math.max(1, Math.min(3, Math.floor((h - 100 - first) / spacing) + 1));
  const ready = people.filter(p => p.needsDesk).slice(0, capacity);
  const line = ready.map((p, slot) => ({ id: p.id, x: cx, y: first + slot * spacing, zone: "line" as const, slot, key: `line:${slot}` }));
  const result = new Map<string, QuestionPlace>(line.map(({id, ...place}) => [id, place]));
  const places = [
    ...[0, 1, 2].flatMap(row => [
      { x: cx - 220 + (row % 2) * 55, y: 435 + row * 145, key: `west:${row}` },
      { x: cx + 220 - (row % 2) * 55, y: 435 + row * 145, key: `east:${row}` },
    ]),
    ...Array.from({length: capacity}, (_, i) => ({x: cx, y: first + i * spacing, key: `middle:${i}`})),
  ].filter(p => p.y <= h - 65 && line.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= spacing - 1));
  const waiting = people.filter(p => !result.has(p.id)), used = new Set<string>();
  const assign = (id: string, p: typeof places[number]) => {
    used.add(p.key); result.set(id, {...p, zone: "waiting", slot: -1});
  };
  // Keep existing waiting pairs still when the front of the line advances.
  for (const person of waiting) {
    const place = places.find(p => p.key === previous.get(person.id) && !used.has(p.key));
    if (place) assign(person.id, place);
  }
  for (const person of waiting) if (!result.has(person.id)) {
    const place = places.find(p => !used.has(p.key));
    if (place) assign(person.id, place);
  }
  return result;
}
