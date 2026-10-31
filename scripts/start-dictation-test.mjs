import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const root = env.LUCID_DICTATION_HOME || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Lucid', 'dictation');
fs.mkdirSync(root, { recursive: true });
const log = fs.openSync(path.join(root, 'launch.log'), 'a');
fs.writeSync(log, `\nDictation launch ${new Date().toISOString()}\n`);
const child = spawn(electron, [fileURLToPath(new URL('./dictation-test.cjs', import.meta.url)), ...process.argv.slice(2)], {
  env, stdio: ['ignore', log, log], windowsHide: true, detached: true,
});
child.on('error', error => { console.error(`Could not launch dictation: ${error.message}`); process.exitCode = 1; });
child.on('spawn', () => { fs.closeSync(log); child.unref(); });
