// The Start Menu entry and launchers open the installed build. Editing source must not
// turn opening the office into a dependency copy, typecheck and rebuild.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function displayArgs(platform, env, settings = {}) {
  if (platform !== 'linux') return [];
  const backend = settings.ozonePlatform;
  if (backend === 'x11' && env.DISPLAY || backend === 'wayland' && env.WAYLAND_DISPLAY) return [`--ozone-platform=${backend}`];
  return [];
}
// Vulkan (ANGLE + Vulkan compositing) only with X11: Chromium cannot pair Vulkan with
// its Wayland backend. electron/gpu-fallback.cjs returns to OpenGL if Vulkan fails.
const VULKAN_ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE'];
function gpuArgs(platform, settings = {}, display = []) {
  if (platform !== 'linux' || settings.gpuBackend !== 'vulkan' || !display.includes('--ozone-platform=x11')) return [];
  return [...VULKAN_ARGS];
}
// Under XWayland, KDE gives X11 apps native pixels but Xft.dpi often stays 96, so Electron
// draws at 100% on a 150% screen: tiny text and 1.5x more of the office on screen at once.
// launch.json "uiScale" (a number) overrides; otherwise read the scale from KDE's outputs.
function kdeScale() {
  try {
    const out = require('node:child_process').execFileSync('kscreen-doctor', ['-j'], { timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] });
    const scales = (JSON.parse(String(out)).outputs || []).filter(o => o.enabled).map(o => Number(o.scale)).filter(Number.isFinite);
    return scales.length ? Math.max(...scales) : null;
  } catch { return null; }
}
function scaleArgs(platform, env, settings = {}, display = [], detect = kdeScale) {
  if (platform !== 'linux' || !display.includes('--ozone-platform=x11') || !env.WAYLAND_DISPLAY) return [];
  const chosen = typeof settings.uiScale === 'number' ? settings.uiScale : detect();
  if (!Number.isFinite(chosen) || chosen < .5 || chosen > 4 || Math.abs(chosen - 1) < .01) return [];
  return [`--force-device-scale-factor=${Math.round(chosen * 100) / 100}`];
}
// KDE scales its cursor for Wayland apps (cursorSize 32 at 150% is 48 px) but tells X11 apps the
// unscaled Xcursor.size, so Lucid under XWayland showed a cursor two thirds the normal size.
function kdeCursor(env) {
  const base = env.XDG_CONFIG_HOME || path.join(require('node:os').homedir(), '.config');
  try {
    const text = fs.readFileSync(path.join(base, 'kcminputrc'), 'utf8'), mouse = /\[Mouse\]([\s\S]*?)(?:\n\[|$)/.exec(text)?.[1] ?? '';
    return { size: Number(/^cursorSize=(\d+)/m.exec(mouse)?.[1]) || 24, theme: /^cursorTheme=(.+)$/m.exec(mouse)?.[1]?.trim() || '' };
  } catch { return null; }
}
function cursorEnv(scale, env, cursor = kdeCursor(env)) {
  if (!scale || env.XCURSOR_SIZE || !cursor) return {};
  return { XCURSOR_SIZE: String(Math.round(cursor.size * scale)), ...(cursor.theme && !env.XCURSOR_THEME ? { XCURSOR_THEME: cursor.theme } : {}) };
}
function launchSettings(env) {
  if (process.platform !== 'linux') return {};
  const base = env.XDG_CONFIG_HOME || path.join(require('node:os').homedir(), '.config');
  try { return JSON.parse(fs.readFileSync(path.join(base, 'lucid', 'launch.json'), 'utf8')) || {}; }
  catch { return {}; }
}
async function prepareLaunch(directory, { prepareOnly = false, update } = {}) {
  const { hasInstalledBuild, recoverInstallation, acquireUpdateLock } = require('../electron/installation.cjs');
  if (!hasInstalledBuild(directory)) {
    const release = acquireUpdateLock(directory);
    try { recoverInstallation(directory); } finally { release(); }
  }
  if (prepareOnly || !hasInstalledBuild(directory)) {
    await (update || require('../electron/updater.cjs').createUpdater(directory)).apply(undefined, { localOnly: true });
  }
}
async function main() {
  process.chdir(root);
  await prepareLaunch(root, { prepareOnly: process.argv.includes('--prepare-only') });
  if (process.argv.includes('--prepare-only')) return;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
  const settings = launchSettings(env), display = displayArgs(process.platform, env, settings);
  const scaling = scaleArgs(process.platform, env, settings, display), scale = Number(/=([\d.]+)/.exec(scaling[0] ?? '')?.[1]) || 0;
  Object.assign(env, cursorEnv(scale, env));
  const child = spawn(require('electron'), [...display, ...gpuArgs(process.platform, settings, display), ...scaling, root], { cwd: root, env, detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
}
module.exports = { prepareLaunch, displayArgs, gpuArgs, scaleArgs, cursorEnv, VULKAN_ARGS };
if (require.main === module) main().catch(error => {
  fs.writeFileSync(path.join(root, 'lucid-launch.log'), `${new Date().toISOString()}\n${error.stack || error}\n`);
  console.error(error.message || error);
  process.exitCode = 1;
});
