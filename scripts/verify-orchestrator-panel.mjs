// The orchestrator's transparency in the office: latest decisions with reasons and cost,
// papers waiting for you, and a status poll that never overlaps and restores the pin once.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformWithOxc} from 'vite';

const load = async (file, replace = s => s) => {
  const code = (await transformWithOxc(replace(fs.readFileSync(new URL(`../src/office/${file}`, import.meta.url), 'utf8')), file)).code;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
};
const panel = await load('orchestrator-panel.ts');
assert.equal(panel.costText(null), null);
assert.equal(panel.costText({available: false, tokens: null, costUsd: null}), null, 'unknown cost is never shown as zero');
assert.match(panel.costText({available: true, tokens: 12400, costUsd: 0.31}), /12\.4K tokens, \$0\.31/);
const opened = [];
const papers = [
  {id: 'a', title: 'Fix login', status: 'approved', reviewUsage: {available: true, tokens: 900, costUsd: 0.01}, verdict: {summary: 'Login works'}, history: [{by: 'Orchestrator', action: 'Review: approve', at: '2026-11-10T10:00:00Z'}]},
  {id: 'b', title: 'Mine', status: 'approved', verdict: {summary: 'You approved'}, history: [{by: 'You', action: 'Review: approve', at: '2026-11-10T12:00:00Z'}]},
  {id: 'c', title: 'Waiting', status: 'submitted', history: []},
];
const log = [{requestId: 'q', at: '2026-11-10T11:00:00Z', questions: 'Use tabs?', title: 'Bot', outcome: 'answered', answer: 'Tabs', reason: 'Memory says tabs', cost: {available: true, tokens: 50, costUsd: null}}, {requestId: 'u', at: '2026-11-10T13:00:00Z', outcome: 'user', reason: 'x'}];
const rows = panel.activity(papers, log, {paper: p => opened.push(p.id), decisions: () => opened.push('decisions')});
assert.deepEqual(rows.map(r => r.title), ['Use tabs?', 'Fix login'], 'only its own decisions, newest first');
assert.match(rows[0].text, /Answered Tabs: Memory says tabs \(50 tokens\)/);
assert.match(rows[1].text, /Approved: Login works \(900 tokens, \$0\.01\)/);
rows[1].open(); rows[0].open(); assert.deepEqual(opened, ['a', 'decisions'], 'each row opens the real record');

globalThis.setInterval = () => 0;
globalThis.document = {hidden: false};
globalThis.window = {lucid: {}};
globalThis.location = {search: ''};
const {Orchestrator} = await load('orchestrator.ts', s => s.replace('import gsap from "gsap";', 'const gsap = {};'));
let state = {threadId: 'boss', review: true, paused: false, pinChecked: false}, calls = 0, pins = 0, release;
const api = {orchStatus: () => { calls++; return new Promise(r => { release = r; }); }, orchPin: async () => { pins++; return true; }};
const orch = new Orchestrator(api, {reports: new Map(), lastData: {threads: []}}, () => state, v => { state = v; });
for (let n = 0; n < 50; n++) orch.refreshStatus();
assert.equal(calls, 1, 'status polls never overlap');
release({dir: '/x', folderError: null, repairError: null, thread: {exists: true, pinned: false}, usage: null});
await orch.refreshStatus();
assert.equal(pins, 1, 'an unpinned older setup is pinned once'); assert.equal(state.pinChecked, true);
const again = orch.refreshStatus(); release({dir: '/x', thread: {exists: true, pinned: false}}); await again;
assert.equal(pins, 1, 'a later unpin in T3 is respected');
orch.papers = [{threadId: 't1', status: 'manual-review'}, {threadId: 't1', status: 'superseded'}, {threadId: 't2', status: 'approved'}, {threadId: 't3', status: 'superseded'}, {threadId: 't3', status: 'manual-review'}];
assert.deepEqual(orch.waiting.map(p => p.threadId), ['t1'], 'only the latest paper per thread counts as waiting');
orch.dismiss(); assert.equal(state, null, 'stop using it clears only the office setting');
console.log('PASS: decision activity with reasons and cost, unknown cost hidden, records open, single-flight status, pin restored once, waiting count, dismiss.');
