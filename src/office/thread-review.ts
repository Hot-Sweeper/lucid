export type ThreadReviewPaper = { threadId: string; status?: string; submittedAt?: string };
type ReviewThread = { id: string; runStatus: string | null; runStartedAt?: string | null; settled?: boolean; pinned?: boolean; question?: string | null };

/** Index once per list refresh, without changing archive or T3 ordering. */
export function latestThreadReviews(papers: ThreadReviewPaper[]) {
  const latest = new Map<string, ThreadReviewPaper>();
  for (const paper of papers) {
    const prior = latest.get(paper.threadId);
    if (!prior || (Date.parse(paper.submittedAt || '') || 0) > (Date.parse(prior.submittedAt || '') || 0)) latest.set(paper.threadId, paper);
  }
  return latest;
}

/** Work completion and acceptance are separate. Only saved review state supplies an outcome. */
export function threadReviewLabel(thread: ReviewThread, paper?: ThreadReviewPaper, expectsReport = false): string | null {
  if (thread.settled || thread.pinned || thread.question || thread.runStatus !== 'completed') return null;
  // A later run must not inherit the earlier run's verdict during report synchronization.
  if (paper && Date.parse(thread.runStartedAt || '') > Date.parse(paper.submittedAt || '')) paper = undefined;
  switch (paper?.status) {
    case 'submitted': return 'Waiting for Orchestrator review';
    case 'reviewing': return 'Orchestrator reviewing';
    case 'manual-review': return 'Needs your review';
    case 'pending-dependency': return 'Review on hold';
    case 'changes-requested': return 'Changes requested';
    case 'approved': return 'Ready to collect';
    case 'settled': return 'Collected';
    case 'reviewed': return 'Review in progress';
    default: return expectsReport ? 'Awaiting report' : null;
  }
}
