// Isolated Electron regression. Requires an explicitly coordinated native test slot.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.commandLine.appendSwitch('mute-audio');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid worklet regression '));
  app.setPath('userData', path.join(directory, 'profile'));
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert(csp, 'Run a private production build before this regression.');
  const raw = fs.readFileSync(path.join(root, 'scripts/dictation-test/capture-worklet.js'), 'utf8');
  let helper = fs.readFileSync(path.join(root, 'src/office/dictation-worklet.ts'), 'utf8');
  helper = helper.replace(/^import captureSource.*;$/m, `const captureSource = ${JSON.stringify(raw)};`);
  helper = require('node:module').stripTypeScriptTypes(helper, { mode: 'transform' }).replace('export async function', 'async function');
  fs.writeFileSync(path.join(directory, 'fixture.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><script src="fixture.js"></script>`);
  fs.writeFileSync(path.join(directory, 'fixture.js'), helper + `
window.workletRegression = async () => {
  const context = new AudioContext();
  let oscillator, capture, mute;
  try {
    await loadCaptureWorklet(context);
    await context.resume();
    capture = new AudioWorkletNode(context, 'dictation-capture');
    mute = context.createGain(); mute.gain.value = 0;
    oscillator = context.createOscillator(); oscillator.frequency.value = 440;
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('No captured audio frames')), 8000);
      capture.port.onmessage = event => {
        if (event.data instanceof Float32Array && event.data.some(value => Math.abs(value) > 0.01)) {
          clearTimeout(timer); resolve({ samples: event.data.length, nonzero: true });
        }
      };
    });
    oscillator.connect(capture); capture.connect(mute); mute.connect(context.destination); oscillator.start();
    return { ...await received, protocol: location.protocol, secureContext: isSecureContext };
  } finally {
    oscillator?.stop(); oscillator?.disconnect(); capture?.disconnect(); mute?.disconnect();
    await context.close();
  }
};`);
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
    try {
      await window.loadFile(path.join(directory, 'fixture.html'));
      const result = await window.webContents.executeJavaScript('window.workletRegression()', true);
      assert.equal(result.protocol, 'file:'); assert(result.nonzero); assert(result.samples > 0);
      console.log(JSON.stringify({ passed: true, productionCSP: csp, ...result, hardwareAcceleration: false }));
      window.destroy(); app.exit(0);
    } catch (error) { console.error(error); window.destroy(); app.exit(1); }
  });
}
