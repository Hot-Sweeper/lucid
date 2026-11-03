// A worker's setup is its harness and model. Both hiring and automatic assignment use
// this one rule, so a robot never silently runs a model it was not hired for.

export type WorkerLike = { id: string; name: string; provider: string; jobs: number; model?: string | null; lastModel?: string | null; retired?: boolean };

/** The model a worker is known to run, or null when nothing has been recorded yet. */
export const workerModel = (r: WorkerLike) => r.model ?? r.lastModel ?? null;

/**
 * Free workers that may take a job on this harness and model, best first.
 * - The harness must always match.
 * - A known model must match a worker's known model exactly.
 * - An unknown side cannot contradict the other: a thread whose model is not reported yet
 *   can use a worker of that harness, and a worker with no recorded model (hired before
 *   models were tracked) can take its first known model. Exact matches always come first.
 * An empty result means a new robot is hired.
 */
export function compatibleWorkers<T extends WorkerLike>(free: T[], provider: string, model: string | null | undefined) {
  const wanted = model || null;
  const rank = (r: T) => { const m = workerModel(r); return wanted && m === wanted ? 0 : !wanted && !m ? 1 : 2; };
  return free
    .filter((r) => !r.retired && r.provider === provider && (!wanted || !workerModel(r) || workerModel(r) === wanted))
    .sort((a, b) => rank(a) - rank(b) || b.jobs - a.jobs || a.name.localeCompare(b.name));
}
