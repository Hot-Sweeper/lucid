// Writing for the app's own housekeeping (daily lines, game translations, project board ideas)
// runs a harness CLI headlessly: no tools, no MCP servers, no saved session, an empty working
// folder and a strict timeout, with the answer read from stdout. It never creates a T3 thread,
// so it never appears in T3 or as a robot.
const fs = require('node:fs');
const brand = require('./brand.cjs');
const os = require('node:os');
const path = require('node:path');
const { runCliProcess } = require('./cli-runner.cjs');

// The cheapest suitable model of each CLI, used unless T3's text generation model belongs to it.
const HARNESSES = {
  codex: {
    command: 'codex', model: 'gpt-6-luna',
    args: (model, cwd) => ['exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--sandbox', 'read-only',
      '--color', 'never', '-c', "approval_policy='never'", '-c', "model_reasoning_effort='low'", '-m', model, '-C', cwd, '-'],
  },
  claude: {
    command: 'claude', model: 'haiku',
    args: model => ['-p', '--model', model, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', 'project', '--output-format', 'text'],
  },
};

/** T3 Code's text generation model (Settings, Text generation), if one is saved. */
function textGenerationSelection(settingsFile) {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))?.textGenerationModelSelection;
    if (saved?.instanceId && saved.model) return { instanceId: String(saved.instanceId), model: String(saved.model) };
  } catch {}
  return null;
}

// Desktop launches may not inherit the shell's PATH, so the usual install folders are searched too.
function findCommand(name, env = process.env, platform = process.platform, exists = fs.existsSync) {
  const home = os.homedir();
  const dirs = [...String(env.PATH || '').split(path.delimiter), path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin'), path.join(home, '.bun', 'bin'), '/usr/local/bin', '/opt/homebrew/bin',
    ...(env.APPDATA ? [path.join(env.APPDATA, 'npm')] : [])].filter(Boolean);
  const names = platform === 'win32' ? [`${name}.cmd`, `${name}.exe`, `${name}.bat`, name] : [name];
  for (const dir of dirs) for (const n of names) { const file = path.join(dir, n); if (exists(file)) return file; }
  return null;
}

/** Which CLI and model write: T3's text generation choice when its CLI is installed, otherwise any installed CLI. */
function pickWriter({ settingsFile, find = findCommand } = {}) {
  const chosen = settingsFile ? textGenerationSelection(settingsFile) : null;
  const preferred = chosen && (/^codex/i.test(chosen.instanceId) ? 'codex' : /^claude/i.test(chosen.instanceId) ? 'claude' : null);
  for (const id of [...(preferred ? [preferred] : []), 'codex', 'claude']) {
    const command = find(HARNESSES[id].command);
    if (command) return { id, command, model: id === preferred ? chosen.model : HARNESSES[id].model };
  }
  return null;
}

// Windows runs npm's .cmd shims through cmd.exe; the prompt itself always goes through stdin.
const quote = a => `"${String(a).replace(/"/g, '""')}"`;
function spawnFor(command, platform = process.platform) {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(command)) return undefined;
  const { spawn } = require('node:child_process');
  return (cmd, args, options) => spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[cmd, ...args].map(quote).join(' ')}"`], { ...options, windowsVerbatimArguments: true });
}

function createHeadlessWriter({ settingsFile, run = runCliProcess, find = findCommand, folder = path.join(os.tmpdir(), 'lucid-writer') } = {}) {
  return {
    selection: () => pickWriter({ settingsFile, find }),
    /** The CLI's final answer as text. Rejects with a readable message. */
    async write(prompt, { timeoutMs = 120000 } = {}) {
      const writer = pickWriter({ settingsFile, find });
      if (!writer) throw Error(`Install Codex or Claude Code to let ${brand.name} write this text.`);
      fs.mkdirSync(folder, { recursive: true });
      const args = HARNESSES[writer.id].args(writer.model, folder);
      try {
        const out = await run(writer.command, args, { input: prompt, cwd: folder, timeoutMs, maxOutputBytes: 2 * 1024 * 1024, spawnProcess: spawnFor(writer.command) });
        const text = String(out || '').trim();
        if (!text) throw Error('The writer returned no text.');
        return text;
      } catch (error) {
        if (/did not answer in time/.test(error?.message || '')) throw Error('The writer took too long. Try again later.');
        throw error;
      }
    },
  };
}

module.exports = { createHeadlessWriter, pickWriter, findCommand, textGenerationSelection, HARNESSES };
