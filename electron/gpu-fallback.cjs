// The app may start on Vulkan (scripts/launch.cjs). If this machine's GPU process cannot run it,
// switch the saved choice back to OpenGL and restart once, so the office never stays blank
// or on slow software drawing.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const isVulkanArg = arg => arg === '--use-angle=vulkan' || arg.startsWith('--enable-features=Vulkan');

function settingsFile(env = process.env) {
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'lucid', 'launch.json');
}

function saveFallback(file, reason, now = new Date()) {
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { /* missing or unreadable: start fresh */ }
  settings.gpuBackend = 'gl';
  settings.gpuFallback = { at: now.toISOString(), reason };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
}

/** Problems that mean Vulkan is not usable here, from Chromium's GPU feature status. */
function statusProblem(status) {
  if (!status) return null;
  for (const key of ['gpu_compositing', 'vulkan']) {
    const value = String(status[key] || '');
    if (value && !value.startsWith('enabled')) return `${key}: ${value}`;
  }
  return null;
}

function install(app, { argv = process.argv, file = settingsFile(), checkAfter = 5000 } = {}) {
  if (process.platform !== 'linux' || !argv.some(isVulkanArg)) return;
  let done = false;
  const fallback = reason => {
    if (done) return;
    done = true;
    console.error('Vulkan drawing failed, switching back to OpenGL:', reason);
    try { saveFallback(file, reason); } catch (error) { console.error('Could not save the OpenGL fallback:', error); }
    app.relaunch({ args: argv.slice(1).filter(arg => !isVulkanArg(arg)) });
    app.exit(0);
  };
  // A GPU process also goes away when the app itself is quitting or being stopped (SIGTERM).
  // That is not a Vulkan failure: only act if the app is still running a moment later.
  let quitting = false;
  const leaving = () => { quitting = true; };
  app.on('before-quit', leaving); app.on('will-quit', leaving);
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.once(signal, () => { leaving(); app.quit(); });
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU' || details.reason === 'clean-exit' || quitting) return;
    setTimeout(() => { if (!quitting) fallback(`GPU process ${details.reason}`); }, 1500).unref?.();
  });
  app.whenReady().then(() => setTimeout(() => {
    try { const problem = statusProblem(app.getGPUFeatureStatus()); if (problem) fallback(problem); }
    catch (error) { console.error('GPU status check failed:', error); }
  }, checkAfter).unref?.());
}

module.exports = { install, statusProblem, saveFallback, isVulkanArg, settingsFile };
