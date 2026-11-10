// Packaging and installed-build updates: names come from the brand module, the package carries
// every runtime file, icons are complete, and installed builds update without touching the
// coordinated git updater used by source checkouts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

async function main() {
  const brand = require('../../electron/brand.cjs');
  const config = require('../../electron-builder.config.cjs');
  assert.equal(config.appId, brand.appId);
  assert.equal(config.productName, brand.name);
  assert.match(config.executableName, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'executable name is a lowercase slug of the brand name');
  assert.equal(config.extraMetadata.desktopName, `${config.executableName}.desktop`, 'Wayland app id matches the desktop entry');
  assert.equal(config.linux.desktop.entry.StartupWMClass, brand.name, 'X11 window class matches app.setName(brand.name)');
  assert(config.linux.executableArgs.includes('--ozone-platform-hint=auto'));
  assert.deepEqual(config.linux.target, ['AppImage', 'deb', 'rpm']);
  assert.equal(config.win.target[0].target, 'nsis');
  assert.equal(config.mac.identity, '-', 'macOS builds are ad-hoc signed, no paid account');
  assert.deepEqual(config.mac.target[0].arch, ['universal']);
  assert.equal(config.publish[0].provider, 'github');
  assert.equal(config.publish[0].releaseType, 'draft', 'CI never publishes a release by itself');

  // Everything the running app reads is packaged; nothing depends on a git checkout.
  const files = config.files.map(f => typeof f === 'string' ? f : `${f.from}->${f.to}`);
  for (const need of ['electron/**/*', 'dist-build->dist', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) assert(files.includes(need), `packages ${need}`);
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'TRADEMARKS.md']) assert(fs.existsSync(path.join(root, file)), `${file} exists`);
  assert(fs.existsSync(path.join(root, 'electron/skills/lucid/SKILL.md')));
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies), ['electron-updater'], 'only main-process modules are runtime dependencies (Vite bundles the rest)');
  for (const file of fs.readdirSync(path.join(root, 'electron')).filter(f => f.endsWith('.cjs'))) {
    for (const [, name] of read(`electron/${file}`).matchAll(/require\(['"]([^'".][^'"]*)['"]\)/g)) {
      const base = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];
      if (base.startsWith('node:') || ['electron', 'original-fs'].includes(base)) continue;
      assert(pkg.dependencies[base], `electron/${file} requires ${base}, which must be a dependency to be packaged`);
    }
  }

  // Icons: every PNG size, plus ico and icns containing PNG entries.
  const icons = path.join(root, 'build/icons');
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    const png = fs.readFileSync(path.join(icons, `${size}x${size}.png`));
    assert.equal(png.readUInt32BE(16), size, `${size}px icon width`);
    assert.equal(png.readUInt32BE(20), size, `${size}px icon height`);
  }
  const ico = fs.readFileSync(path.join(icons, 'icon.ico'));
  assert.equal(ico.readUInt16LE(2), 1); assert(ico.readUInt16LE(4) >= 6, 'ico holds the small and large sizes');
  const icns = fs.readFileSync(path.join(icons, 'icon.icns'));
  assert.equal(icns.toString('latin1', 0, 4), 'icns'); assert.equal(icns.readUInt32BE(4), icns.length);
  assert(read('build/icons/icon.svg').includes('<svg'), 'SVG master exists');

  // main.cjs picks the updater by app.isPackaged and keeps one data folder across names.
  const main = read('electron/main.cjs');
  assert.match(main, /const updater = app\.isPackaged \? require\("\.\/packaged-updater\.cjs"\)\.createPackagedUpdater\(\{ app, shell, net \}\) : require\("\.\/updater\.cjs"\);/);
  assert.match(main, /app\.setPath\("userData", require\("node:path"\)\.join\(app\.getPath\("appData"\), "lucid"\)\)/);
  assert(main.indexOf('app.setPath("userData"') < main.indexOf('requestSingleInstanceLock'), 'data folder is fixed before the single-instance lock');
  assert.match(main, /if \(result\.install\) \{ result\.install\(\); return \{ ok: true \}; \}/);

  // Installed-build updater.
  const { createPackagedUpdater, updateMode, newer } = require('../../electron/packaged-updater.cjs');
  assert.equal(updateMode({ platform: 'win32', env: {} }), 'install');
  assert.equal(updateMode({ platform: 'darwin', env: {} }), 'download');
  assert.equal(updateMode({ platform: 'linux', env: { APPIMAGE: '/x.AppImage' } }), 'install');
  assert.equal(updateMode({ platform: 'linux', env: {}, resources: '/nonexistent' }), 'managed');
  assert.equal(updateMode({ platform: 'linux', env: { APPIMAGE: '/x', FLATPAK_ID: 'id' } }), 'managed');
  assert.equal(updateMode({ platform: 'win32', env: { LUCID_DISABLE_UPDATES: '1' } }), 'managed');
  const deb = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lucid-pkg-'));
  fs.writeFileSync(path.join(deb, 'package-type'), 'deb\n');
  assert.equal(updateMode({ platform: 'linux', env: {}, resources: deb }), 'install');
  fs.rmSync(deb, { recursive: true, force: true });
  assert(newer('0.2.0', '0.1.9')); assert(newer('v1.0.0', '0.9.0')); assert(!newer('0.1.0', '0.1.0'));
  assert(newer('1.0.0', '1.0.0-beta.1')); assert(!newer('1.0.0-beta.1', '1.0.0')); assert(!newer('0.1.0', '0.2.0'));

  const app = { getVersion: () => '0.1.0' };
  const fake = (version, fail) => {
    const listeners = new Map(), calls = { check: 0, download: 0, install: [] };
    return { calls, autoUpdater: {
      checkForUpdates: async () => { calls.check++; if (fail) throw Error('getaddrinfo ENOTFOUND github.com'); return { updateInfo: { version } }; },
      downloadUpdate: async () => { calls.download++; listeners.get('download-progress')?.({ percent: 42.4 }); },
      quitAndInstall: (...args) => calls.install.push(args),
      on: (name, fn) => listeners.set(name, fn), removeListener: name => listeners.delete(name),
    } };
  };
  {
    const f = fake('0.2.0');
    const u = createPackagedUpdater({ app, mode: 'install', loadUpdater: () => f.autoUpdater });
    const [a, b] = [u.check(), u.check()];
    assert.equal(a, b, 'overlapping checks share one request');
    const status = await a;
    assert.equal(status.available, true); assert.match(status.reason, /0\.2\.0/); assert.equal(f.calls.check, 1);
    assert.equal(f.autoUpdater.autoDownload, false, 'nothing downloads without the user');
    const steps = [];
    const result = await u.apply(s => steps.push(s));
    assert.equal(result.updated, true); assert.equal(f.calls.download, 1);
    assert(steps.includes('Downloading update 42%'));
    assert.equal(f.calls.install.length, 0, 'install waits until user state is saved');
    result.install(); assert.deepEqual(f.calls.install, [[true, true]]);
  }
  {
    const f = fake('0.1.0');
    const u = createPackagedUpdater({ app, mode: 'install', loadUpdater: () => f.autoUpdater });
    assert.equal((await u.check()).available, false);
    assert.equal((await u.apply()).updated, false); assert.equal(f.calls.download, 0);
  }
  {
    const f = fake('0.2.0', true);
    const u = createPackagedUpdater({ app, mode: 'install', loadUpdater: () => f.autoUpdater });
    await assert.rejects(u.check(), /Could not reach GitHub/);
  }
  {
    let loaded = false;
    const u = createPackagedUpdater({ app, mode: 'managed', loadUpdater: () => { loaded = true; } });
    const status = await u.check();
    assert.equal(status.available, false); assert.match(status.reason, /package manager/); assert.equal(loaded, false);
  }
  // Installed apps pick up the login shell's PATH for the CLIs they run.
  const { loadShellPath, mergePath } = require('../../electron/shell-path.cjs');
  assert.equal(mergePath('/usr/bin:/bin', '/opt/homebrew/bin:/usr/bin', ':'), '/usr/bin:/bin:/opt/homebrew/bin');
  const env = { PATH: '/usr/bin', SHELL: '/bin/zsh' };
  assert.equal(await loadShellPath({ platform: 'darwin', env, run: (_cmd, _args, _opts, done) => done(null, 'motd noise __LUCID_PATH__/opt/homebrew/bin:/usr/bin__LUCID_PATH__') }), true);
  assert.equal(env.PATH, '/usr/bin:/opt/homebrew/bin');
  assert.equal(await loadShellPath({ platform: 'linux', env, run: (_c, _a, _o, done) => done(Error('timeout')) }), false);
  assert.equal(env.PATH, '/usr/bin:/opt/homebrew/bin', 'a failing shell leaves PATH alone');
  assert.equal(await loadShellPath({ platform: 'win32', env }), false);
  assert.match(main, /if \(app\.isPackaged\) void require\("\.\/shell-path\.cjs"\)\.loadShellPath\(\);/);
  console.log('PASS: packaging names from the brand module, packaged runtime files, icons, updater selection by app.isPackaged, installed-build update modes, shared checks, explicit download and install after save.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
