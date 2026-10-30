// Company progression: real work shipped (completed agent runs) earns levels,
// and levels unlock things for the offices.
export const levelFor = (shipped: number) => Math.min(10, Math.floor(Math.sqrt(Math.max(0, shipped) / 5)));
export const runsFor = (level: number) => 5 * level * level;
export function progress(shipped: number) {
  const level = levelFor(shipped);
  const from = runsFor(level), to = runsFor(level + 1);
  return { level, from, to, frac: level >= 10 ? 1 : (shipped - from) / (to - from) };
}
