// Updates for installed builds, from GitHub Releases. Source checkouts keep the coordinated git
// updater (updater.cjs); electron/main.cjs picks one by app.isPackaged. Same check()/apply() shape,
// so the update button works unchanged.
const fs = require('node:fs');
const path = require('node:path');

// How this install can update itself:
//   install   electron-updater downloads the release and replaces the app (Windows, AppImage, deb, rpm)
//   download  open the release page; ad-hoc signed macOS apps cannot replace themselves
//   managed   Flatpak, AUR or another package manager owns the files
function updateMode({ platform = process.platform, env = process.env, resources = process.resourcesPath } = {}) {
  if (env.LUCID_DISABLE_UPDATES || env.FLATPAK_ID) return 'managed';
  if (platform === 'darwin') return 'download';
  if (platform !== 'linux') return 'install';
  if (env.APPIMAGE) return 'install';
  try {
    const type = fs.readFileSync(path.join(resources, 'package-type'), 'utf8').trim();
    if (type === 'deb' || type === 'rpm') return 'install';
  } catch { /* no package-type file: not installed from our deb or rpm */ }
  return 'managed';
}

// Numeric x.y.z comparison; a prerelease sorts before its release.
function newer(candidate, current) {
  const parse = v => { const [core, pre] = String(v).replace(/^v/, '').split('-'); return { parts: core.split('.').map(n => Number(n) || 0), pre: pre ? 1 : 0 }; };
  const a = parse(candidate), b = parse(current);
  for (let i = 0; i < 3; i++) if ((a.parts[i] || 0) !== (b.parts[i] || 0)) return (a.parts[i] || 0) > (b.parts[i] || 0);
  return b.pre > a.pre;
}

// owner/repo from the app-update.yml electron-builder writes next to the app.
function releaseRepo(resources = process.resourcesPath) {
  try {
    const text = fs.readFileSync(path.join(resources, 'app-update.yml'), 'utf8');
    const owner = /^owner:\s*(\S+)/m.exec(text)?.[1], repo = /^repo:\s*(\S+)/m.exec(text)?.[1];
    return owner && repo ? { owner, repo } : null;
  } catch { return null; }
}

function friendly(error) {
  const text = String(error?.message || error);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_INTERNET|ERR_NAME|net::/i.test(text)) return Object.assign(Error('Could not reach GitHub to check for updates. Try again when you are online.'), { cause: error });
  return error instanceof Error ? error : Error(text);
}

function createPackagedUpdater({ app, shell, net, mode = updateMode(), loadUpdater = () => require('electron-updater').autoUpdater } = {}) {
  const current = app.getVersion();
  let checking = null, applying = null, latest = null, updater = null;
  const autoUpdater = () => {
    if (!updater) {
      updater = loadUpdater();
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.logger = null;
    }
    return updater;
  };
  const repo = releaseRepo();
  const releasePage = repo ? `https://github.com/${repo.owner}/${repo.repo}/releases/latest` : null;

  async function latestVersion() {
    if (mode === 'download') {
      if (!repo) throw Error('This build does not know where its releases are published.');
      const response = await net.fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } });
      if (response.status === 404) return null;
      if (!response.ok) throw Error(`GitHub answered ${response.status} while checking for updates.`);
      return String((await response.json()).tag_name || '').replace(/^v/, '') || null;
    }
    const result = await autoUpdater().checkForUpdates();
    return result?.updateInfo?.version || null;
  }

  async function inspect() {
    if (mode === 'managed') return { available: false, local: 0, behind: 0, changes: [], files: [], reason: 'Updates for this install come from the package manager that installed it.' };
    latest = await latestVersion().catch(error => { throw friendly(error); });
    const available = !!latest && newer(latest, current);
    if (!available) return { available: false, local: 0, behind: 0, changes: [], files: [] };
    const reason = mode === 'download' ? `Version ${latest} is out. Click to open its download page.` : `Version ${latest} is ready. Click to download it and restart.`;
    return { available: true, local: 0, behind: 0, changes: [`Version ${latest} (you have ${current})`], files: [], reason };
  }

  function check() {
    if (!checking) checking = inspect().finally(() => { checking = null; });
    return checking;
  }

  function apply(onStep = () => {}) {
    if (applying) return applying;
    const step = message => { try { onStep(message); } catch { /* a closed window must not fail the update */ } };
    applying = (async () => {
      step('Checking updates');
      const status = await check();
      if (!status.available) return { updated: false };
      if (mode === 'download') {
        await shell.openExternal(releasePage);
        return { updated: false, opened: true };
      }
      const auto = autoUpdater();
      const progress = info => step(`Downloading update ${Math.round(info.percent || 0)}%`);
      auto.on('download-progress', progress);
      try {
        step('Downloading update');
        await auto.downloadUpdate();
      } catch (error) { throw friendly(error); }
      finally { auto.removeListener('download-progress', progress); }
      step('Restarting');
      return { updated: true, install: () => auto.quitAndInstall(true, true) };
    })().finally(() => { applying = null; });
    return applying;
  }

  return { check, apply, mode };
}

module.exports = { createPackagedUpdater, updateMode, newer, releaseRepo };
