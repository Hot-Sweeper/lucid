import { STATUS, type Status } from "../ui/status";

type StateThread = {
  settled?: boolean; question?: string | null; runStatus: string | null;
  runStartedAt?: string | null; updatedAt: string; lastStatus?: string | null; unseen?: boolean;
  job?: { state: 'running' | 'failed'; name: string; progress?: string; reason?: string } | null;
};

/** `tone` is the shared status; `label` its one word; `detail` says why, for tooltips and the chat header. */
export type ThreadState = { tone: Status | ''; label: string; since?: string | null; detail?: string; run?: boolean };

// Orchestrator review steps (thread-review.ts) mapped onto the vocabulary.
const REVIEW: Record<string, Status> = {
  'Needs your review': 'needs',
  'Ready to collect': 'done',
  'Collected': 'settled',
};

const is = (tone: Status, detail?: string, since?: string | null): ThreadState => ({ tone, label: STATUS[tone].label, detail, since });

/** One authoritative presentation for expanded rows, managers, the folded rail and the chat header. */
export function threadState(t: StateThread, review: string | null = null, reading = false): ThreadState {
  if (t.settled) return is('settled');
  if (t.question) return reading ? is('working', 'With the Orchestrator') : is('needs', 'Asked a question');
  if (t.runStatus === 'running') return { ...is('working', undefined, t.runStartedAt || t.updatedAt), run: true };
  if (t.runStatus === 'queued') return { ...is('working', 'Queued'), run: true };
  if (t.job?.state === 'running') return is('working', `In background: ${t.job.progress || t.job.name}`);
  if (t.job?.state === 'failed') return is('needs', `Job failed: ${`${t.job.name} ${t.job.reason || ''}`.trim()}`);
  if (t.runStatus === 'failed' || t.runStatus === 'error') return is('needs', 'Run failed');
  if (t.runStatus === 'interrupted' || t.runStatus === 'cancelled' || t.runStatus === 'canceled') return { tone: '', label: '', detail: 'Stopped' };
  if (review) return is(REVIEW[review] ?? 'working', review);
  if (t.runStatus === 'completed' || !t.runStatus && t.lastStatus === 'completed') return is('done');
  if (t.lastStatus === 'failed') return is('needs', 'Run failed');
  return { tone: '', label: '' };
}
