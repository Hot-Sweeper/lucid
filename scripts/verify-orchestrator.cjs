// Orchestrator folder migration, setup validation, strict approval, the questionnaire and
// recovery after failed sends, failed runs, lost threads, pause and restarts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const orch = require('../electron/orchestrator.cjs');
const { createReports } = require('../electron/reports.cjs');
const { registerOrchestrator } = require('../electron/orchestrator-ipc.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-orchestrator-check-'));
const brand = { name: 'Test Works' };

(async () => {
  // --- folder: generic, brand-derived, migrated in one atomic step ---------------------
  const base = path.join(root, 'projects'); fs.mkdirSync(base);
  const fresh = orch.ensureFolder(path.join(root, 'fresh'), brand.name);
  const seed = fs.readFileSync(fresh.memory, 'utf8'), rules = fs.readFileSync(path.join(fresh.dir, 'AGENTS.md'), 'utf8');
  assert(!/things-i-hate|\.agents|C:\/Users|\/home\//.test(seed + rules), 'no personal paths or notes are read or written');
  assert(rules.includes('Orchestrator in Test Works') && !rules.includes('Lucid'), 'instructions use the brand name');
  fs.writeFileSync(fresh.memory, '# Mine\n- Prefers tabs\n'); orch.ensureFolder(fresh.dir, brand.name);
  assert.equal(fs.readFileSync(fresh.memory, 'utf8'), '# Mine\n- Prefers tabs\n', 'memory.md is never overwritten');

  const legacy = path.join(base, 'Lucid Orchestrator');
  fs.mkdirSync(path.join(legacy, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'memory.md'), 'remember me');
  fs.writeFileSync(path.join(legacy, 'answers.json'), '{"examples":[1]}');
  fs.writeFileSync(path.join(legacy, 'reports', 'index.json'), '[{"id":"a"}]');
  const name = orch.folderName(brand);
  assert.equal(name, 'Test Works Orchestrator');
  const moved = orch.locateFolder({ base, name, legacy: ['Lucid Orchestrator'] });
  assert.equal(moved.dir, path.join(base, name)); assert.equal(moved.movedFrom, legacy);
  assert(!fs.existsSync(legacy), 'the old folder moved instead of being copied');
  assert.equal(fs.readFileSync(path.join(moved.dir, 'memory.md'), 'utf8'), 'remember me');
  assert.equal(fs.readFileSync(path.join(moved.dir, 'answers.json'), 'utf8'), '{"examples":[1]}');
  assert.equal(fs.readFileSync(path.join(moved.dir, 'reports', 'index.json'), 'utf8'), '[{"id":"a"}]', 'reports move with memory');
  // A later rename follows the recorded folder; an existing target is never merged into.
  const renamed = orch.locateFolder({ base, name: 'Next Orchestrator', legacy: ['Lucid Orchestrator'], recorded: moved.dir });
  assert.equal(renamed.movedFrom, moved.dir);
  fs.mkdirSync(path.join(base, 'Other Orchestrator')); fs.mkdirSync(path.join(base, 'Lucid Orchestrator')); fs.writeFileSync(path.join(base, 'Lucid Orchestrator', 'memory.md'), 'old');
  assert.equal(orch.locateFolder({ base, name: 'Other Orchestrator', legacy: ['Lucid Orchestrator'] }).movedFrom, undefined, 'existing target wins, nothing is merged');
  assert(fs.existsSync(path.join(base, 'Lucid Orchestrator', 'memory.md')), 'the unmigrated folder is left untouched');
  const rename = fs.renameSync; fs.renameSync = () => { const e = Error('cross-device'); e.code = 'EXDEV'; throw e; };
  try {
    const failed = orch.locateFolder({ base, name: 'Third Orchestrator', legacy: ['Lucid Orchestrator'] });
    assert.equal(failed.dir, path.join(base, 'Lucid Orchestrator'), 'a failed rename keeps using the old folder'); assert.match(failed.error, /EXDEV/);
  } finally { fs.renameSync = rename; }
  const stale = orch.staleRoots({ dir: renamed.dir, legacyDirs: [moved.dir, legacy], projects: [{ id: 'p1', root: moved.dir }, { id: 'p2', root: path.join(base, 'Other Orchestrator') }, { id: 'p3', root: renamed.dir }] });
  assert.deepEqual(stale.map(p => p.id), ['p1'], 'only projects at a vanished old folder are repointed');

  // --- setup is validated against T3's real provider list --------------------------------
  const config = { runtimeMode: 'full-access', providers: [{ instanceId: 'codex', ready: true, models: [{ slug: 'm1', options: [{ id: 'effort', type: 'select', choices: [{ id: 'low' }] }] }] }, { instanceId: 'off', ready: false, models: [{ slug: 'm2', options: [] }] }] };
  assert.deepEqual(orch.setupSelection(config, { provider: 'codex', model: 'm1', options: { effort: 'low' } }), { provider: 'codex', model: 'm1', options: { effort: 'low' } });
  assert.throws(() => orch.setupSelection(config, { provider: 'off', model: 'm2' }), /ready harness/);
  assert.throws(() => orch.setupSelection(config, { provider: 'codex', model: 'm1', options: { effort: 'max' } }), /setting changed/);

  // --- setup, status and T3 root repair through the IPC layer -----------------------------
  const handlers = new Map(), dispatched = [], launched = [];
  let projects = [{ id: 'p1', title: 'Old', root: moved.dir }];
  const userData = path.join(root, 'user'); fs.mkdirSync(userData);
  fs.writeFileSync(path.join(userData, 'orchestrator-folder.json'), JSON.stringify({ dir: renamed.dir, previous: [moved.dir] }));
  let releaseLaunch;
  const service = registerOrchestrator({
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, brand: { name: 'Next' }, base, userData,
    t3: { listProjects: () => projects, addProject: async ({ path: dir }) => { projects.push({ id: 'p9', root: dir }); }, threadHealth: () => ({ exists: true, pinned: true, runStatus: 'completed' }), reportState: () => ({ sessions: [{ harness: 'codex', sessionId: 's' }] }) },
    t3s: { hireConfig: async () => config, dispatch: async c => { dispatched.push(c); if (c.type === 'project.meta.update') projects = projects.map(p => p.id === c.projectId ? { ...p, root: c.workspaceRoot } : p); }, call: async (tag, payload) => { launched.push(payload); await new Promise(r => { releaseLaunch = r; }); return { threadId: payload.threadId }; } },
    usage: { getSessionUsage: async (_s, w) => ({ available: true, tokens: w.from > Date.now() - 86400_000 * 2 ? 10 : 70, costUsd: 0.01 }) },
  });
  assert.equal(service.dir, renamed.dir);
  await service.repairRoots();
  assert.deepEqual(dispatched.map(c => [c.type, c.projectId, c.workspaceRoot, c.title]), [['project.meta.update', 'p1', renamed.dir, 'Next Orchestrator']], 'T3 project follows the moved folder');
  await service.repairRoots(); assert.equal(dispatched.length, 1, 'repair is idempotent');
  await assert.rejects(handlers.get('orch:init')(null, { provider: 'codex', model: 'm1' }), /Reopen setup/, 'setup needs a request id');
  const requestId = '11111111-2222-4333-8444-555555555555';
  const first = handlers.get('orch:init')(null, { provider: 'codex', model: 'm1', requestId });
  const second = handlers.get('orch:init')(null, { provider: 'codex', model: 'm1', requestId });
  assert.equal(first, second, 'a double click joins the running setup');
  while (!releaseLaunch) await new Promise(r => setImmediate(r));
  releaseLaunch();
  const hired = await first;
  assert.equal(launched.length, 1); assert.equal(launched[0].threadId, requestId); assert.equal(launched[0].modelSelection.instanceId, 'codex');
  assert.equal(launched[0].title, 'Orchestrator'); assert(!/lucid/i.test(launched[0].initialMessage.text), 'setup message carries no old product name');
  assert.equal(hired.projectId, 'p1'); assert(hired.pinned && dispatched.some(c => c.type === 'thread.pin' && c.threadId === requestId), 'the orchestrator is a pinned T3 thread');
  const status = await handlers.get('orch:status')(null, requestId);
  assert.equal(status.dir, renamed.dir); assert(status.thread.exists && status.usage.today.available && status.usage.week.tokens === 70, 'status reports health and its own cost');
  await assert.rejects(handlers.get('orch:pin')(null, 'env::thread'), /orchestrator/, 'remote threads cannot be pinned through the local orchestrator');

  // --- settlement: strict, questionnaire, recovery ----------------------------------------
  let run = 'r1', settled = false, replies = [], sendFails = 0, sentMarker = false, orchRun = null, exists = true, settleFails = false;
  const settings = { threadId: 'boss', review: true, paused: false };
  const facts = () => ({ run: { id: run, status: 'completed' }, title: 'Task', originalRequest: 'Do the task', pendingRuns: 0, pendingRequests: 0, pinned: false, settled, messages: [{ role: 'assistant', text: 'Done it' }], sessions: [], team: [], children: [] });
  const sends = [], settles = [];
  const deps = { dir: path.join(root, 'papers'), settings: () => settings, name: 'Test Works', spent: async (id, from, to) => ({ available: true, tokens: 42, costUsd: 0.02, window: [id, to >= from] }),
    t3: { reportFacts: facts, reportState: facts, repliesSince: () => ({ messages: replies }), threadHealth: () => ({ exists }), sentSince: () => ({ sent: sentMarker, runStatus: orchRun }),
      sendMessage: async m => { if (sendFails > 0) { sendFails--; throw Error('T3 restarting'); } sends.push(m); sentMarker = true; orchRun = 'running'; } },
    server: { settleThread: async id => { if (settleFails) throw Error('T3 offline'); settles.push(id); settled = true; } },
    usage: { getSessionUsage: async () => ({ available: false }) } };
  let reports = createReports(deps);
  const paper = await reports.submit('worker');
  // A failed send that never reached T3 goes back in line by itself, with backoff.
  sendFails = 1; await reports.tick();
  assert.equal(paper.status, 'submitted'); assert.match(paper.error, /Retrying automatically/); assert(paper.retryAt > Date.now());
  await reports.tick(); assert.equal(sends.length, 0, 'backoff holds the resend');
  paper.retryAt = 0; await reports.tick(); assert.equal(sends.length, 1); assert.equal(paper.status, 'reviewing');
  assert(sends[0].message.startsWith('Test Works settlement review'), 'review prompt uses the brand name');
  reports = createReports(deps); await reports.tick(); assert.equal(sends.length, 1, 'a restart never sends the same review twice');
  // The orchestrator's run stopping is noticed right away, not after fifteen minutes.
  orchRun = 'failed'; await reports.tick();
  let p = reports.list()[0];
  assert.equal(p.status, 'manual-review'); assert.match(p.error, /stopped before it decided/);
  await reports.manual(p.id, 'retry'); orchRun = null; sentMarker = false; await reports.tick(); assert.equal(sends.length, 2, 'explicit retry sends once more');
  // Strict: no approval without the final result.
  const noResult = deps.t3.reportFacts; deps.t3.reportFacts = () => ({ ...facts(), messages: [] });
  replies = [{ streaming: false, text: JSON.stringify({ report: p.id, decision: 'approve', summary: 'Fine', visualChanged: false, checks: ['Tests pass'], humanChecks: [] }) }];
  p.response = ''; await reports.tick();
  assert.equal(p.status, 'manual-review'); assert.match(p.error, /final result/); assert.equal(p.reviewUsage.tokens, 42, 'the review records what it cost');
  deps.t3.reportFacts = noResult;
  // The questionnaire: at most three checks, and all yes finishes the orchestrator's approval.
  run = 'r2'; sentMarker = false; replies = [];
  const q = await reports.submit('worker'); await reports.tick();
  const checks = [1, 2, 3, 4].map(n => ({ question: `Check ${n}?`, instructions: 'Look' }));
  replies = [{ streaming: false, text: JSON.stringify({ report: q.id, decision: 'approve', summary: 'Works', visualChanged: false, checks: ['Unit tests pass'], humanChecks: checks }) }];
  await reports.tick();
  assert.equal(q.status, 'manual-review'); assert.equal(q.verdict.humanChecks.length, 3, 'questionnaire stays short'); assert.equal(q.verdict.proposed, 'approve');
  await reports.manual(q.id, 'human-answer', { index: 0, answer: 'yes' }); assert.equal(q.status, 'manual-review', 'unanswered checks never pass');
  await reports.manual(q.id, 'human-answer', { index: 1, answer: 'no' }); await reports.manual(q.id, 'human-answer', { index: 2, answer: 'yes' });
  assert.equal(q.status, 'manual-review'); assert.match(q.error, /answered no to "Check 2\?"/);
  await reports.manual(q.id, 'human-answer', { index: 1, answer: 'yes' });
  assert.equal(q.status, 'approved', 'all yes completes the approval'); assert.equal(settles.length, 0, 'and still waits for Collect');
  // Collect survives T3 being down and finishes while the orchestrator is off.
  settleFails = true; await assert.rejects(reports.manual(q.id, 'collect'), /offline/);
  settings.paused = true; settleFails = false; q.retryAt = 0; await reports.tick();
  assert.equal(q.status, 'settled', 'collect recovery does not wait for the orchestrator'); assert.equal(settles.length, 1);
  // A lost orchestrator thread holds new papers instead of failing them.
  settings.paused = false; settled = false; run = 'r3'; exists = false; sentMarker = false; replies = [];
  const held = await reports.submit('worker'); const before = sends.length; await reports.tick();
  assert.equal(held.status, 'submitted'); assert.equal(sends.length, before, 'nothing is sent to a missing thread');
  exists = true; await reports.tick(); assert.equal(held.status, 'reviewing');
  exists = false; await reports.tick(); assert.equal(held.status, 'manual-review'); assert.match(held.error, /thread in T3 is gone/);
  await assert.rejects(reports.manual(held.id, 'collect'), /Only approved work/);
  console.log('PASS: generic brand-named folder with atomic migration and T3 root repair, validated single-flight setup as a pinned thread, status and cost, strict approval, short questionnaire, send/run/thread recovery, pause-proof collect and no duplicate reviews.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  const resolved = path.resolve(root);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('lucid-orchestrator-check-')) throw Error('Unexpected cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
});
