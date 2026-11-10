// Exercise the dependency copier inside Electron, where fs interprets ASAR
// archives differently from Node. No BrowserWindow or production profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

async function run() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-freezer-native-'));
  const fixture = path.join(temporary, 'source');
  try {
    fs.mkdirSync(path.join(fixture, 'node_modules/electron/dist/resources'), { recursive:true });
    fs.mkdirSync(path.join(fixture, 'src'));
    fs.mkdirSync(path.join(fixture, 'dist'));
    fs.writeFileSync(path.join(fixture, 'package.json'), '{}');
    fs.writeFileSync(path.join(fixture, 'src/app.ts'), 'export const value = 1;');
    fs.writeFileSync(path.join(fixture, 'dist/index.html'), 'working installation');
    const electron = require('electron');
    const archive = path.join(path.dirname(electron), 'resources/default_app.asar');
    fs.copyFileSync(archive, path.join(fixture, 'node_modules/electron/dist/resources/default_app.asar'));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
    const stdout = await new Promise((resolve, reject) => {
      require('node:child_process').execFile(electron, [__filename, fixture, path.join(temporary,'profile')],
        { env, windowsHide:true, timeout:15000, maxBuffer:1024*1024 },
        (error, output, stderr) => error ? reject(Error((stderr || output).trim() || error.message)) : resolve(output));
    });
    assert.match(stdout, /Native frozen input passed/);
    console.log(stdout.trim());
  } finally {
    assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(temporary, { recursive:true, force:true });
  }
}

async function native() {
  const { app } = require('electron');
  const raw = require('original-fs');
  const fixture = process.argv[2];
  app.setPath('userData', process.argv[3]);
  await app.whenReady();
  const { freezeInput } = require('../../electron/frozen-input.cjs');
  const originalNoAsar = process.noAsar;
  const archive = 'node_modules/electron/dist/resources/default_app.asar';
  const expected = raw.readFileSync(path.join(fixture, archive));
  const copy = raw.promises.cp;
  raw.promises.cp = async (...args) => { await copy(...args); throw Error('Interrupted dependency snapshot'); };
  try { await assert.rejects(freezeInput(fixture), /Interrupted dependency snapshot/); }
  finally { raw.promises.cp = copy; }
  assert(!raw.readdirSync(fixture).some(name => name.startsWith('.lucid-update-')), 'Failed native copy releases its private input');
  assert.equal(raw.readFileSync(path.join(fixture, 'dist/index.html'),'utf8'), 'working installation');
  // Antivirus/file locks can also delay cleanup. Preserve the primary copy
  // error so a retry is actionable instead of reporting only a delete failure.
  const rm = raw.promises.rm, warn = console.warn;
  raw.promises.cp = async () => { throw Error('Primary dependency copy error'); };
  raw.promises.rm = async () => { throw Error('Cleanup file locked'); };
  console.warn = () => {};
  try { await assert.rejects(freezeInput(fixture), /Primary dependency copy error/); }
  finally { raw.promises.cp = copy; raw.promises.rm = rm; console.warn = warn; }
  const leftovers = raw.readdirSync(fixture).filter(name => name.startsWith('.lucid-update-'));
  assert.equal(leftovers.length, 1);
  for (const name of leftovers) {
    const target = path.resolve(fixture, name);
    assert.equal(path.dirname(target), path.resolve(fixture));
    await raw.promises.rm(target, {recursive:true,force:true});
  }
  const frozen = await freezeInput(fixture);
  try {
    const copied = path.join(frozen.directory, archive);
    assert(raw.statSync(copied).isFile(), 'ASAR remains an opaque file');
    assert.deepEqual(raw.readFileSync(copied), expected, 'Archive bytes remain exact');
    assert.equal(process.noAsar, originalNoAsar, 'Copying does not change global archive behavior');
    raw.writeFileSync(path.join(fixture,'src/app.ts'), 'changed working source');
    assert.equal(raw.readFileSync(path.join(frozen.directory,'src/app.ts'),'utf8'), 'export const value = 1;');
  } finally { await frozen.dispose(); }
  assert(!raw.readdirSync(fixture).some(name => name.startsWith('.lucid-update-')));
  assert.equal(raw.readFileSync(path.join(fixture,'dist/index.html'),'utf8'), 'working installation');
  console.log('Native frozen input passed: exact ASAR bytes, failure cleanup, retry, private source isolation and unchanged installation.');
  app.exit(0);
}

module.exports = { run };
// Electron's default_app loader does not set require.main to this app module.
if (process.versions.electron && path.resolve(process.argv[1] || '') === __filename) {
  const deadline = setTimeout(() => require('electron').app.exit(2), 12000);
  native().catch(error => { console.error(error); require('electron').app.exit(1); }).finally(() => clearTimeout(deadline));
} else if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
