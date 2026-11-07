const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProjectLife, validateBoard, parseIdeas } = require('../electron/project-life.cjs');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-project-life-'));
  try {
    const file = path.join(dir, 'boards.json'), settingsFile = path.join(dir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ textGenerationModelSelection: { instanceId: 'chosen', model: 'base-model', options: [] } }));
    let local = true, fail = false, tick = 0, release;
    const helpers = new Set(), calls = [];
    const t3 = { world: () => ({ projects: [{ id: 'p', title: 'Paper planes' }, { id: 'q', title: 'Other project' }], threads: [{ id: 't', projectId: 'p', title: 'Fix launch', runStatus: 'running' }, { id: 'secret', projectId: 'q', title: 'Not this project' }] }), threadInfo: () => ({ run: { status: fail ? 'failed' : 'completed' } }), conversation: () => [{ role: 'assistant', text: JSON.stringify({ banner: 'Cleared for takeoff', goals: ['Try the onboarding'], banter: [[{ name: 'Pip', text: 'Paper planes need tests too.' }, { name: 'Bolt', text: 'Especially the landing.' }]] }) }] };
    const server = { call: async (...args) => { calls.push(args); if (release) await release; }, dispatch: async input => calls.push(input) };
    const create = () => createProjectLife({ file, settingsFile, t3, server, helpers, isLocal: () => local, wait: async () => { tick++; } });
    const life = create();
    assert.equal(life.get({ projectId: 'p' }).revision, 0);
    assert.throws(() => life.get({ projectId: 'missing' }));
    assert.throws(() => validateBoard({ goals: [], events: [{ title: 'Bad day', date: '2026-02-30' }] }));
    assert.throws(() => validateBoard({ goals: [{ text: '' }], events: [] }));
    const saved = life.save({ projectId: 'p', revision: 0, board: { banner: 'Launch party', goals: [{ text: 'Pick a date', done: false }], events: [], launchDate: '2026-11-12' } });
    assert.equal(saved.revision, 1);
    assert.throws(() => life.save({ projectId: 'p', revision: 0, board: saved }), /changed elsewhere/);
    assert.equal(create().get({ projectId: 'p' }).banner, 'Launch party');
    assert.equal(life.get({ projectId: 'q' }).goals.length, 0);
    const generated = await life.generate({ projectId: 'p', robots: [{ name: 'Pip' }, { name: 'Bolt' }] });
    assert.equal(generated.banner, 'Launch party'); assert.deepEqual(generated.goals, saved.goals);
    assert.equal(generated.ideas.banter.length, 1);
    const launch = calls.find(c => Array.isArray(c));
    assert.equal(launch[1].modelSelection.model, 'base-model');
    assert.equal(launch[1].projectId, 'p');
    assert(!launch[1].initialMessage.text.includes('Not this project'));
    assert.equal(helpers.size, 0); assert(calls.some(c => c.type === 'thread.archive'));
    await assert.rejects(life.generate({ projectId: 'p' }), /minute/);
    local = false; assert.throws(() => life.get({ projectId: 'p' }), /computer/); await assert.rejects(life.generate({ projectId: 'p' }), /computer/); local = true;
    fail = true; await assert.rejects(life.generate({ projectId: 'q' }), /did not finish/); assert.equal(life.get({ projectId: 'q' }).ideas, null); assert.equal(helpers.size, 0); fail = false;
    assert.equal(parseIdeas('{"goals":["test"],"banter":[[{"name":"Invented","text":"wrong"},{"name":"Pip","text":"hi"}]]}', ['Pip']).banter.length, 0);
    // A concurrent manual save must survive a writer response.
    let unblock; release = new Promise(r => { unblock = r; });
    const pending = life.generate({ projectId: 'q' });
    await assert.rejects(life.generate({ projectId: 'p' }), /already working/);
    life.save({ projectId: 'q', revision: 0, board: { banner: 'My edit', goals: [], events: [], launchDate: '' } });
    unblock(); await pending; assert.equal(life.get({ projectId: 'q' }).banner, 'My edit');
    console.log('Project office: persistence, validation, scope, base model, rate limit, helper cleanup, and concurrent editing passed.');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
