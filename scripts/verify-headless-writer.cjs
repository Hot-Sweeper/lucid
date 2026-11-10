// Housekeeping text comes from a headless harness CLI: never a T3 thread, no tools, a strict timeout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHeadlessWriter, pickWriter, findCommand } = require('../electron/headless-writer.cjs');
const { createDailyWriter } = require('../electron/daily-writer.cjs');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-writer-check-'));
  try {
    const settingsFile = path.join(dir, 't3-settings.json');
    const installed = new Set(['codex', 'claude']);
    const find = name => installed.has(name) ? `/bin/${name}` : null;

    // T3's text generation choice wins when its CLI is installed; otherwise the cheapest default.
    assert.deepEqual(pickWriter({ settingsFile, find }), { id: 'codex', command: '/bin/codex', model: 'gpt-6-luna' });
    fs.writeFileSync(settingsFile, JSON.stringify({ textGenerationModelSelection: { instanceId: 'claudeAgent', model: 'claude-haiku-5-5' } }));
    assert.deepEqual(pickWriter({ settingsFile, find }), { id: 'claude', command: '/bin/claude', model: 'claude-haiku-5-5' });
    installed.delete('claude');
    assert.deepEqual(pickWriter({ settingsFile, find }), { id: 'codex', command: '/bin/codex', model: 'gpt-6-luna' }, 'a missing CLI falls back to an installed one');
    installed.clear();
    assert.equal(pickWriter({ settingsFile, find }), null);

    // The exact command lines: no tools, no MCP servers, no saved sessions, prompt on stdin.
    const runs = [];
    const run = async (command, args, options) => { runs.push({ command, args, options }); return '  {"ok":true}\n'; };
    installed.add('codex');
    const folder = path.join(dir, 'empty');
    const writer = createHeadlessWriter({ settingsFile: path.join(dir, 'missing.json'), run, find, folder });
    assert.equal(await writer.write('Write a line', { timeoutMs: 1000 }), '{"ok":true}');
    const codex = runs.at(-1);
    assert.equal(codex.command, '/bin/codex');
    for (const flag of ['exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check']) assert(codex.args.includes(flag), flag);
    assert.equal(codex.args[codex.args.indexOf('--sandbox') + 1], 'read-only');
    assert.equal(codex.args.at(-1), '-', 'the prompt is read from stdin');
    assert.equal(codex.options.input, 'Write a line'); assert.equal(codex.options.timeoutMs, 1000); assert.equal(codex.options.cwd, folder);
    assert(fs.existsSync(folder), 'runs happen in an empty folder of their own');
    installed.add('claude');
    fs.writeFileSync(settingsFile, JSON.stringify({ textGenerationModelSelection: { instanceId: 'claudeAgent', model: 'haiku' } }));
    await createHeadlessWriter({ settingsFile, run, find, folder }).write('Write a line');
    const claude = runs.at(-1);
    assert.equal(claude.args[claude.args.indexOf('--tools') + 1], '', 'Claude runs with every tool disabled');
    for (const flag of ['-p', '--strict-mcp-config', '--no-session-persistence']) assert(claude.args.includes(flag), flag);

    // Failures stay readable and never fall back to a T3 thread.
    await assert.rejects(createHeadlessWriter({ settingsFile, run: async () => '   ', find, folder }).write('x'), /no text/);
    await assert.rejects(createHeadlessWriter({ settingsFile, run: async () => { throw Error('T3 did not answer in time. The action may have reached T3 Code.'); }, find, folder }).write('x'), /took too long/);
    await assert.rejects(createHeadlessWriter({ settingsFile, run, find: () => null, folder }).write('x'), /Install Codex or Claude Code/);

    // The daily writer parses the CLI's reply and writes the pack, with no T3 involved.
    const pack = { convos: [['Hi', 'Hello']], robots: { Pip: ['Beep'] }, ceo: [], gossip: [], botcord: [], trending: [], event: { name: 'Cake day', blurb: 'There is cake.' } };
    const daily = createDailyWriter({ dir, writer: { selection: () => ({ model: 'haiku' }), write: async prompt => { assert(prompt.includes('Pip')); return `Here you go: ${JSON.stringify(pack)}`; } } });
    const written = await daily.write({ personas: [{ id: 'r1', name: 'Pip', markdown: '# Pip' }], language: 'en', date: '2026-11-10' });
    assert.equal(written.event.name, 'Cake day'); assert.deepEqual(written.robots.Pip, ['Beep']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'dialogs.json'), 'utf8')).model, 'haiku');

    // Command lookup searches PATH and the usual install folders, including Windows shims.
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'codex.cmd'), '');
    assert.equal(findCommand('codex', { PATH: bin }, 'win32'), path.join(bin, 'codex.cmd'));

    // None of the housekeeping modules may create T3 threads any more.
    for (const file of ['daily-writer.cjs', 'localization.cjs', 'project-life.cjs', 'headless-writer.cjs']) {
      const source = fs.readFileSync(path.join(__dirname, '..', 'electron', file), 'utf8');
      assert(!/launchThread|thread\.create/.test(source), `${file} never starts a T3 thread`);
    }
    console.log('PASS: headless writer CLI choice, tool-free command lines, timeouts, failures, daily pack and no T3 helper threads.');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
