// A companion renders the office, while its desktop remains the sole owner of
// automatic supervision and persistent game state.
export const companionClient = () => typeof window !== 'undefined' && (window as any).lucidRemote === true;

export type CompanionSnapshot = { settings: string; roster: string };
export type CompanionCommit = { kind: 'settings' | 'roster'; before: string; after: string };
export type CompanionHire = { kind: 'hire'; threadId: string; robotId: string | null; provider: string; role: string | null; model?: string; room: string; index: number; resuming: boolean; sourceWorld?: import('./office/world').WorldData };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const safeKey = (key: string) => !['__proto__', 'prototype', 'constructor'].includes(key);

/** Merge only the caller's deliberate changes. A stale value cannot replace a
 * newer desktop edit, and fields outside this action remain authoritative. */
export function mergeCompanionCommit(currentJson: string, input: CompanionCommit): string {
  if (typeof input.before !== 'string' || typeof input.after !== 'string' || input.before.length > 4_000_000 || input.after.length > 4_000_000) throw Error('This office change is too large.');
  const current = JSON.parse(currentJson), before = JSON.parse(input.before), after = JSON.parse(input.after);
  const conflict = () => { throw Error('This changed on the computer. Refresh the office and try again.'); };
  if (input.kind === 'settings') {
    if (![current, before, after].every(object)) throw Error('The office settings are invalid.');
    const allowed = new Set(['orch', 'roles', 'themes', 'hidden', 'extra', 'homes', 'seats', 'expandedRooms', 'roomOrder', 'weatherFix']);
    const result = { ...current };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (same(before[key], after[key])) continue;
      if (!safeKey(key) || !allowed.has(key)) throw Error('Change this setting on the computer.');
      if (!same(current[key], before[key]) && !same(current[key], after[key])) conflict();
      if (key in after) result[key] = after[key]; else delete result[key];
    }
    return JSON.stringify(result);
  }
  if (input.kind !== 'roster' || ![current, before, after].every(Array.isArray)) throw Error('The robot change is invalid.');
  const records = (rows: any[]) => {
    const map = new Map<string, any>();
    for (const row of rows) {
      if (!object(row) || typeof row.id !== 'string' || !row.id || map.has(row.id)) throw Error('The robot list is invalid.');
      map.set(row.id, row);
    }
    return map;
  };
  const existing = records(current), old = records(before), next = records(after);
  for (const [id, row] of old) {
    const updated = next.get(id);
    if (same(row, updated)) continue;
    if (!updated || !existing.has(id)) throw Error('Robots can only be removed on the computer.');
    const merged = { ...existing.get(id) };
    // Companion appearance edits cannot reassign a robot behind another task.
    for (const key of new Set([...Object.keys(row), ...Object.keys(updated)])) {
      if (same(row[key], updated[key])) continue;
      if (!['name', 'look'].includes(key)) throw Error('Assign this robot from the computer.');
      if (!same(existing.get(id)[key], row[key]) && !same(existing.get(id)[key], updated[key])) conflict();
      if (key === 'name' && (typeof updated.name !== 'string' || !updated.name.trim() || updated.name.length > 32)) throw Error('Choose a robot name of 1 to 32 characters.');
      if (key === 'look' && !object(updated.look)) throw Error('The robot appearance is invalid.');
      merged[key] = updated[key];
    }
    existing.set(id, merged);
  }
  for (const id of next.keys()) if (!old.has(id)) throw Error('The computer creates new robots when work starts.');
  return JSON.stringify([...existing.values()]);
}

export async function readCompanionState(): Promise<CompanionSnapshot | null> {
  if (!companionClient()) return null;
  return (window as any).lucid.remoteState();
}

export function installCompanionOwner(options: {
  snapshot(): CompanionSnapshot;
  apply(kind: CompanionCommit['kind'], json: string): Promise<void>;
  hire(input: CompanionHire): Promise<void>;
}) {
  if (companionClient()) return;
  let pending = Promise.resolve();
  (window as any).__lucidCompanion = {
    snapshot: options.snapshot,
    commit(input: CompanionCommit | CompanionHire) {
      const run = pending.then(async () => {
        if (input.kind === 'hire') await options.hire(input);
        else {
          const json = mergeCompanionCommit(options.snapshot()[input.kind], input);
          await options.apply(input.kind, json);
        }
        return options.snapshot();
      });
      pending = run.then(() => {}, () => {});
      return run;
    },
  };
}
