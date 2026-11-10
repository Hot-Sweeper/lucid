// Durable settlement papers. All state changes go through T3, never its database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const terminal = new Set(['settled', 'changes-requested', 'manual-review', 'superseded', 'manager-excluded', 'pending-dependency']);
// Bounded extraction also accepts fenced JSON and skips unrelated objects in a reply.
const parseVerdict = (text, reportId = null) => {
  text = String(text || '').slice(-256 * 1024);
  let attempts = 0;
  for (let start = text.indexOf('{'); start >= 0 && attempts++ < 128; start = text.indexOf('{', start + 1)) {
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
      if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { const value = JSON.parse(text.slice(start, i + 1)); if (typeof value.report === 'string' && (!reportId || value.report === reportId)) return value; } catch {}
        break;
      }
    }
  }
  return null;
};

function createReports({ dir, t3, server, usage, settings, robots = () => [] }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.json');
  let papers = [];
  try { papers = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const reportState = t3.reportState || t3.reportFacts;
  let busy = false;
  const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(papers, null, 2)); fs.renameSync(file + '.tmp', file); };
  const enabled = () => { const s = settings(); return s && s.threadId && s.review && !s.paused; };
  const update = (p, values) => { Object.assign(p, values, { updatedAt: new Date().toISOString() }); save(); };
  const event = (p, action, by, reason = '') => { p.history.push({ at: new Date().toISOString(), action, by, reason }); };
  function snapshotImage(p, source, label) {
    if (!IMAGE.test(source)) return null;
    try {
      const stat = fs.statSync(source); if (!stat.isFile() || stat.size > 24 * 1024 * 1024) return null;
      const bytes = fs.readFileSync(source), key = hash(bytes);
      let image = p.images.find(i => i.hash === key);
      if (!image) {
        const target = path.join(dir, p.id, key + path.extname(source).toLowerCase());
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
        image = { hash: key, path: target, source, name: path.basename(source), label: label || 'Evidence' };
        p.images.push(image);
      } else if (label === 'Before' || label === 'After') image.label = label;
      return image;
    } catch { return null; }
  }
  function snapshotEvidence(p, messages) {
    for (const m of messages) {
      for (const a of m.attachments || []) if (a.path) snapshotImage(p, a.path, /before/i.test(a.name) ? 'Before' : /after/i.test(a.name) ? 'After' : 'Evidence');
      // Local Markdown evidence links, including T3's absolute Windows paths.
      for (const match of (m.text || '').matchAll(/!?\[([^\]]*)\]\((?:<([^>]+)>|([^\n)]+))\)/g)) {
        const source = match[2] || match[3];
        if (!path.isAbsolute(source)) continue;
        const label = /before/i.test(match[1]) ? 'Before' : /after/i.test(match[1]) ? 'After' : 'Evidence';
        snapshotImage(p, source, label);
      }
    }
  }
  async function submit(threadId, robot) {
    if (reportState(threadId).pinned) return null;
    const facts = t3.reportFacts(threadId);
    if (facts.pinned || facts.settled || facts.pendingRuns || facts.pendingRequests || facts.run?.status !== 'completed') return null;
    // A dependency hold is thread-owned, not run-owned. Empty acknowledgments or
    // another completion must not create a new review and worker-dispatch loop.
    if (papers.some(p => p.threadId === threadId && p.status === 'pending-dependency')) return null;
    const id = hash(`${threadId}:${facts.run.id}`);
    const existing = papers.find(p => p.id === id); if (existing) return existing;
    const roster = robots();
    const team = (facts.team || []).map(member => {
      const profile = roster.find(r => r.threadId === member.threadId) || (member.threadId === threadId ? robot : null);
      return { ...member, robot: profile ? { id: profile.id, name: profile.name, look: profile.look, provider: profile.provider } : null };
    });
    const p = { id, threadId, runId: facts.run.id, title: facts.title, project: facts.projectTitle, root: facts.root,
      robot: robot ? { id: robot.id, name: robot.name, provider: robot.provider, look: robot.look } : { name: facts.title, provider: facts.provider },
      provider: facts.provider, model: facts.model, effort: facts.effort ?? null, team, children: facts.children, originalRequest: facts.originalRequest, initialRequest: facts.initialRequest,
      response: facts.messages.filter(m => m.role === 'assistant' && !m.streaming).at(-1)?.text || '',
      submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'submitted', delivered: false,
      images: [], history: [], usage: { available: false, tokens: null, costUsd: null } };
    snapshotEvidence(p, facts.messages);
    p.usage = await usage.getSessionUsage(facts.sessions);
    const latest = reportState(threadId);
    if (latest.pinned || latest.settled || latest.run?.id !== facts.run.id || latest.run?.status !== 'completed' || latest.pendingRuns || latest.pendingRequests) return null;
    // A refresh during the asynchronous usage scan may have submitted this run already.
    const duplicate = papers.find(x => x.id === id); if (duplicate) return duplicate;
    event(p, 'Submitted', p.robot.name); papers.unshift(p); save();
    return p;
  }
  function evidenceIssue(p, verdict) {
    if (typeof verdict.summary !== 'string' || !verdict.summary.trim() || !Array.isArray(verdict.checks) || !verdict.checks.length || verdict.checks.some(c => typeof c !== 'string' || !c.trim())) return 'The review needs a summary and actual validation results.';
    if (typeof verdict.visualChanged !== 'boolean') return 'The review must state whether the job changed visuals.';
    if (verdict.visualChanged && (!p.images.some(i => i.label === 'Before') || !p.images.some(i => i.label === 'After'))) return 'Before and after screenshots are missing. Request evidence before settlement.';
    return null;
  }
  function excludePinned(p) {
    if (!reportState(p.threadId).pinned) return false;
    event(p, 'Excluded from automatic review', 'Lucid', 'Pinned threads stay active.');
    update(p, { status: 'manager-excluded', error: null });
    return true;
  }
  function current(p) {
    const facts = reportState(p.threadId);
    return facts.run?.id === p.runId && facts.run.status === 'completed' && !facts.pendingRuns && !facts.pendingRequests;
  }
  async function apply(p, verdict, by, automatic) {
    if (excludePinned(p)) return;
    if (automatic && !enabled()) { update(p, { status: 'manual-review', error: 'Automatic review is paused. Review this paper manually or resume.' }); return; }
    if (!current(p)) { event(p, 'Superseded by newer work', by); update(p, { status: 'superseded' }); return; }
    for (const [key, label] of [['before', 'Before'], ['after', 'After']]) {
      // Labels must refer to captured source-thread evidence, not arbitrary files.
      for (const source of Array.isArray(verdict[key]) ? verdict[key] : []) {
        const image = p.images.find(i => i.source === source || i.path === source);
        if (image) image.label = label;
      }
    }
    if (Array.isArray(verdict.humanChecks)) verdict.humanChecks = verdict.humanChecks.filter(c => c && typeof c.question === 'string' && c.question.trim()).map(c => ({ question: c.question, instructions: typeof c.instructions === 'string' ? c.instructions : '' }));
    if (automatic && verdict.humanChecks?.length) verdict.decision = 'manual';
    const issue = verdict.decision === 'approve' ? evidenceIssue(p, verdict) : typeof verdict.summary !== 'string' || !verdict.summary.trim() ? 'The decision needs a written explanation.' : null;
    update(p, { verdict, reviewer: by, status: issue ? 'manual-review' : 'reviewed', error: issue });
    event(p, issue ? 'Evidence incomplete' : `Review: ${verdict.decision}`, by, issue || verdict.summary); save();
    if (issue) {
      if (automatic && issue.startsWith('Before and after') && enabled() && current(p)) {
        await t3.sendMessage({ threadId: p.threadId, message: `The settlement review could not verify visual evidence. ${issue} Provide real, clearly labeled before and after screenshot links or attachments, actual checks, and remaining issues. Never invent an unavailable before state.` });
        event(p, 'Missing evidence requested', by, issue); update(p, { status: 'changes-requested' });
      }
      return;
    }
    if (verdict.decision === 'approve') {
      // The user may decide directly from the orchestrator's chair; elsewhere the orchestrator reviews first.
      const fromChair = by === 'You' && verdict.chair === true;
      if (!fromChair && (!p.orchestratorId || !p.sentAt || (by !== 'Orchestrator' && !p.history.some(h => h.by === 'Orchestrator' && h.action.startsWith('Review:'))))) {
        update(p, { status: 'manual-review', error: 'Send this report to the orchestrator for review before settlement.' });
        return;
      }
      // Approval puts the report on the worker's desk. Settlement waits for the user's
      // Collect, which clears the desk (see collect below).
      if (p.collectRequested) return settle(p, by);
      update(p, { status: 'approved', approvedAt: p.approvedAt || new Date().toISOString(), retryAt: null, error: null });
      event(p, 'Approved, ready to collect', by, verdict.summary);
    } else if (verdict.decision === 'pending') {
      event(p, 'Waiting for dependency evidence', by, verdict.summary);
      update(p, { status: 'pending-dependency', error: null });
    } else if (verdict.decision === 'changes') {
      const feedback = typeof verdict.feedback === "string" && verdict.feedback.trim() ? verdict.feedback : verdict.summary;
      if (automatic && !enabled()) { update(p, { status: 'manual-review' }); return; }
      await t3.sendMessage({ threadId: p.threadId, message: `Lucid review of ${p.title}:\n${feedback}\n\nWhen finished, include what changed, actual checks, and before/after screenshot links for visual changes. This job remains unsettled until reviewed.` });
      event(p, 'Changes requested', by, feedback); update(p, { status: 'changes-requested', error: null });
    } else update(p, { status: 'manual-review' });
  }
  async function settle(p, by) {
    if (!current(p)) { update(p, { status: 'superseded' }); return; }
    if (excludePinned(p)) return;
    await server.settleThread(p.threadId, { excludePinned: true, expectedRunId: p.runId });
    if (!reportState(p.threadId).settled) {
      update(p, { status: 'approved', retryAt: Date.now() + 5000, error: 'Waiting for T3 to confirm settlement.' });
      return;
    }
    event(p, 'Collected and settled in T3', by, p.verdict?.summary);
    update(p, { status: 'settled', settledAt: new Date().toISOString(), error: null, retryAt: null });
  }
  async function tick(arrived = []) {
    if (busy) return papers;
    busy = true;
    let actionPaper = null;
    try {
      for (const p of papers) if (arrived.includes(p.threadId) && !p.delivered) update(p, { delivered: true });
      for (const p of papers.filter(p => !terminal.has(p.status) || p.status === 'manual-review' || p.status === 'pending-dependency')) {
        let facts;
        try { facts = reportState(p.threadId); }
        catch (error) { update(p, { error: String(error.message || error) }); continue; }
        if (facts.pinned) { excludePinned(p); continue; }
        if (facts.settled) { event(p, 'Settlement observed in T3', 'T3'); update(p, { status: 'settled', settledAt: facts.settledAt, error: null }); }
        else if (p.status === 'pending-dependency') continue;
        else if (facts.run?.id !== p.runId || facts.pendingRuns || facts.pendingRequests) update(p, { status: 'superseded' });
        else if (enabled() && p.status === 'manual-review' && p.reviewer === 'Orchestrator' && p.error &&
          p.verdict?.decision === 'approve' && !p.verdict.humanChecks?.length && !evidenceIssue(p, p.verdict) &&
          p.history.some(h => h.action === 'Review: approve')) {
          event(p, 'Approved settlement recovered', 'Lucid');
          update(p, { status: 'approved', retryAt: null });
        }
      }
      if (!enabled()) return papers;
      const s = settings();
      // Finish a collection whose settlement was interrupted, without asking for another verdict.
      const approved = papers.find(p => p.status === 'approved' && p.collectRequested && (!p.retryAt || p.retryAt <= Date.now()));
      if (approved) { actionPaper = approved; await settle(approved, 'You'); return papers; }
      const pending = papers.find(p => p.status === 'reviewing');
      if (pending) {
        actionPaper = pending;
        const replies = t3.repliesSince(pending.orchestratorId, pending.sentAt);
        for (const message of replies.messages.filter(m => !m.streaming)) {
          const verdict = parseVerdict(message.text, pending.id);
          if (verdict?.report !== pending.id || !['approve', 'changes', 'manual', 'pending'].includes(verdict.decision)) continue;
          await apply(pending, verdict, 'Orchestrator', true); return papers;
        }
        if (Date.now() - Date.parse(pending.sentAt) > 15 * 60_000) update(pending, { status: 'manual-review', error: 'The review did not return a decision. Retry or review manually.' });
        return papers;
      }
      // Delivery is presentation only. Hidden, blocked or closed offices cannot hold real reviews.
      const p = [...papers].reverse().find(p => p.status === 'submitted');
      if (!p) return papers;
      if (!current(p)) { update(p, { status: 'superseded' }); return papers; }
      actionPaper = p;
      const sentAt = new Date(Date.now() - 1000).toISOString();
      // Persist the dispatch intent. On an ambiguous transport failure, require explicit retry.
      update(p, { status: 'reviewing', sentAt, orchestratorId: s.threadId, error: null });
      await t3.sendMessage({ threadId: s.threadId, message: `Lucid settlement review ${p.id}. You represent the user. Read memory.md and inspect this submission against the original task. Read the full thread with the t3 CLI if needed. Inspect the real artifacts and screenshots. Decide if the task is fully done. Do not settle or message the source thread yourself: Lucid applies your recorded verdict. If work is actionable in the source thread, return changes with concrete feedback. If waiting for another task or coordinated acceptance evidence, return pending instead: retain existing evidence without messaging the worker or submitting acknowledgment runs. Resume review explicitly with Retry automatic review only when materially new acceptance evidence and matching delivery proof are available. Never invent before states, checks, screenshots, usage, or cost. For visual changes require real before and after images; the lists must use captured evidence source paths below. For nonvisual work explain the relevant before/after behavior in the summary. Write summary as a brief user-facing report of relevant behavior changes and limitations, without implementation chatter. Include humanChecks only for physical device checks, private observations or approvals only the human can provide. Do routine agent-verifiable work yourself. Never guess human answers. Use manual if human checks remain. Return exactly JSON:\n{"report":"${p.id}","decision":"approve|changes|manual|pending","summary":"what changed and why this verdict","visualChanged":false,"checks":["actual checks and results"],"before":["source image path"],"after":["source image path"],"feedback":"concrete next steps if needed","humanChecks":[{"question":"human-only yes/no question","instructions":"how the user can check"}]}\n\nSubmission:\n${JSON.stringify(p)}\n\nThe permanent archive is ${file}. You can read it when the user asks what changed, who did it, or what was submitted or settled. Do not edit archive files.` });
      return papers;
    } catch (e) {
      const p = actionPaper;
      if (p) {
        const protectedPin = e.code === 'manager-protected';
        const stale = e.code === 'stale-review';
        const approved = p.status === 'approved';
        update(p, { status: protectedPin ? 'manager-excluded' : stale ? 'superseded' : approved ? 'approved' : 'manual-review',
          retryAt: approved ? Date.now() + 5000 : null, error: protectedPin ? null : String(e.message || e) });
      }
      return papers;
    } finally { busy = false; }
  }
  async function manual(id, action, values = {}) {
    if (busy) throw new Error('A review is being recorded. Try again shortly.');
    const p = papers.find(p => p.id === id); if (!p) throw new Error('This paper is no longer available.');
    busy = true;
    try {
      if (action === 'human-answer') {
        const index = values.index;
        const check = p.verdict?.humanChecks?.[index];
        if (!Number.isInteger(index) || !check || !['yes', 'no', 'unable'].includes(values.answer)) throw new Error('Choose an answer for an existing human check.');
        p.humanAnswers ||= {};
        p.humanAnswers[index] = { answer: values.answer, at: new Date().toISOString() };
        event(p, 'Human check answered', 'You', `${check.question}: ${values.answer}`); save();
      }
      else if (action === 'retry') { event(p, 'Review retried', 'You'); update(p, { status: 'submitted', error: null }); }
      else if (action === 'collect') {
        if (p.status !== 'approved') throw new Error('Only approved work can be collected.');
        // Record the intent first. If T3 is slow or Lucid closes, collection finishes on recovery.
        update(p, { collectRequested: true, collectedAt: new Date().toISOString(), error: null }); save();
        try { await settle(p, 'You'); }
        catch (error) {
          if (error.code === 'stale-review') { update(p, { status: 'superseded', error: null }); throw new Error('New work started on this thread, so there is nothing to collect yet.'); }
          update(p, { error: String(error.message || error) }); throw error;
        }
      }
      else if (action === 'reopen') { await server.unsettleThread(p.threadId); event(p, 'Reopened in T3', 'You'); update(p, { status: 'manual-review', settledAt: null }); }
      else if (action === 'approve' || action === 'changes' || action === 'pending') await apply(p, { ...values, decision: action }, 'You', false);
      else throw new Error('Unknown review action.');
      return p;
    } finally { busy = false; }
  }
  let supervision = null;
  async function supervise() {
    if (supervision) return supervision;
    const work = (async () => {
      try {
      if (enabled() && t3.world) {
        const world = await t3.world();
        const boss = settings()?.threadId;
        // Submit at most one new snapshot per pass, oldest completion first.
        for (const thread of [...world.threads].reverse()) {
          if (thread.id === boss || thread.pinned || thread.settled || thread.question || thread.runStatus !== 'completed') continue;
          const state = reportState(thread.id);
          if (papers.some(p => p.threadId === thread.id && p.runId === state.run?.id)) continue;
          if (await submit(thread.id, robots().find(r => r.threadId === thread.id))) break;
        }
      }
      } finally { await tick(); }
    })();
    supervision = work;
    try { await work; } finally { if (supervision === work) supervision = null; }
  }
  return { submit, tick, manual, supervise, list: () => papers, directory: dir };
}
module.exports = { createReports, parseVerdict };
