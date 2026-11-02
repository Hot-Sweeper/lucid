// Screen apps often change together. Measure all their scroll/overflow geometry
// before any follow-up writes, so one text update cannot flush layout per desk.
const jobs = new Map<HTMLElement, () => (() => void) | null>();
let frame = 0;

export function scheduleLayout(owner: HTMLElement, read: () => (() => void) | null) {
  jobs.set(owner, read);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const batch = [...jobs]; jobs.clear();
    const writes: { owner: HTMLElement; write: () => void }[] = [];
    for (const [owner, measure] of batch) {
      if (!owner.isConnected) continue;
      try { const write = measure(); if (write) writes.push({ owner, write }); }
      catch (error) { reportError(error); }
    }
    for (const { owner, write } of writes) if (owner.isConnected) {
      try { write(); } catch (error) { reportError(error); }
    }
  });
}
