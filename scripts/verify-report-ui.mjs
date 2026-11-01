import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electron from 'electron';

const folder = await mkdtemp(join(tmpdir(), 'lucid-report-ui-'));
const profile = join(folder, 'profile');
await mkdir(join(profile, 'reports'), { recursive: true });
const paper = { id: 'test-paper', threadId: 'test-thread', runId: 'test-run', title: 'Fix the office layout and preserve long project names', project: 'Lucid', robot: { name: 'Mochi' }, provider: 'codex', model: 'Test model', children: [{ title: 'Check layout', model: 'Test helper' }], usage: { tokens: 12345, costUsd: 0.12, scope: 'API price estimate, not a bill.' }, originalRequest: 'Fix layout.', response: 'Updated layout.\n\n<img src=x onerror="window.__unsafe=true">', submittedAt: '2026-10-31T12:00:00Z', settledAt: '2026-10-31T12:02:00Z', status: 'settled', reviewer: 'Orchestrator', verdict: { summary: 'Layout verified.', checks: ['Layout checks pass'], visualChanged: false }, images: [], history: [{ action: 'Settled in T3', by: 'Orchestrator', at: '2026-10-31T12:02:00Z', reason: 'Layout verified.' }] };
await writeFile(join(profile, 'reports', 'index.json'), JSON.stringify([paper]));
const evaluation = `(async () => {
  if (window.__reportUiCheck) return window.__reportUiCheck;
  window.__reportUiCheck = { running: true };
  const checks = [], check = (ok, name) => { if (!ok) throw Error(name); checks.push(name); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    const archive = document.querySelector('#orch-archive');
    archive.focus(); archive.click(); await wait(150);
    const search = document.querySelector('.paper-search input');
    check(!!search, 'archive opens');
    search.value = 'no matching job'; search.dispatchEvent(new Event('input'));
    check(document.querySelector('.paper-register').textContent.includes('No matching'), 'search has a useful empty state');
    search.value = 'Mochi'; search.dispatchEvent(new Event('input'));
    document.querySelector('.paper-register-row').click(); await wait(150);
    const paper = document.querySelector('.settlement-paper');
    check(paper.textContent.includes('12,345') && paper.textContent.includes('Mochi'), 'saved ownership and observed usage render');
    check(paper.textContent.includes('Layout checks pass') && paper.textContent.includes('Settled in T3'), 'validation and settlement paper trail render');
    check(!paper.querySelector('[onerror]') && !window.__unsafe, 'report Markdown is sanitized');
    check(paper.textContent.includes('No screenshots saved'), 'missing visual evidence is explicit');
    const bounds = paper.getBoundingClientRect();
    check(bounds.left >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight, 'paper stays within the viewport');
    paper.querySelector('textarea').value = 'Unfinished manual feedback';
    await window.__refresh();
    check(paper.querySelector('textarea').value === 'Unfinished manual feedback', 'office refresh preserves unfinished manual review');
    window.__reportUiCheck = { ok: true, checks };
  } catch (e) { window.__reportUiCheck = { ok: false, error: String(e), checks }; }
  return window.__reportUiCheck;
})()`;
const evaluationFile = join(folder, 'evaluate.js'); await writeFile(evaluationFile, evaluation);
const env = { ...process.env, LUCID_SHOT: folder, LUCID_SHOT_PROFILE: profile, LUCID_SHOT_COUNT: '2', LUCID_SHOT_EVERY: '2200', LUCID_SHOT_QUIT: '1', LUCID_EVAL_FILE: evaluationFile };
delete env.ELECTRON_RUN_AS_NODE;
await new Promise((resolve, reject) => { const child = spawn(electron, ['.'], { env, stdio: 'pipe', windowsHide: true }); let errors = ''; child.stderr.on('data', d => errors += d); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(errors))); });
const log = await readFile(join(folder, 'eval.log'), 'utf8');
console.log('Artifacts: ' + folder); console.log(log);
assert(log.includes('"ok": true') && !log.includes('"ok": false'), 'report UI interactions pass');
