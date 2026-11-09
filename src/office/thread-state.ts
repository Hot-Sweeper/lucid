type StateThread = {
  settled?: boolean; question?: string | null; runStatus: string | null;
  runStartedAt?: string | null; updatedAt: string; lastStatus?: string | null; unseen?: boolean;
  job?: { state: 'running' | 'failed'; name: string; progress?: string; reason?: string } | null;
};

export type ThreadState = { tone: '' | 'work' | 'queued' | 'ask' | 'review' | 'fail' | 'done'; label: string; since?: string | null; detail?: string };

/** One authoritative presentation for expanded rows, managers and the folded rail. */
export function threadState(t: StateThread, review: string | null = null, reading = false): ThreadState {
  if (t.settled) return { tone: '', label: 'Collected' };
  if (t.question) return { tone: 'ask', label: reading ? 'With the Orchestrator' : 'Needs input' };
  if (t.runStatus === 'running') return { tone: 'work', label: 'Working', since: t.runStartedAt || t.updatedAt };
  if (t.runStatus === 'queued') return { tone: 'queued', label: 'Queued' };
  if (t.job?.state === 'running') return { tone: 'work', label: 'In background', detail: t.job.progress || t.job.name };
  if (t.job?.state === 'failed') return { tone: 'fail', label: 'Job failed', detail: `${t.job.name} ${t.job.reason || ''}`.trim() };
  if (t.runStatus === 'failed') return { tone: 'fail', label: 'Failed' };
  if (t.runStatus === 'interrupted' || t.runStatus === 'cancelled' || t.runStatus === 'canceled') return { tone: '', label: 'Stopped' };
  if (review) return { tone: 'review', label: review };
  if (t.lastStatus === 'failed') return { tone: 'fail', label: 'Failed' };
  if (t.unseen && t.lastStatus === 'completed') return { tone: 'done', label: 'Done' };
  return { tone: '', label: '' };
}
