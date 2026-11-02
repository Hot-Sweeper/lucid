// Isolated microphone trial. Does not open T3 or change Lucid's settings.
const { app, BrowserWindow, ipcMain, session, clipboard, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const root = process.env.LUCID_DICTATION_HOME || path.join(app.getPath('appData'), '..', 'Local', 'Lucid', 'dictation');
// Electron defaults to the host package's profile. This trial must never share
// Lucid's Chromium cache, even when the real app is already running.
const profile = process.env.LUCID_DICTATION_PROFILE || path.join(root, 'profile');
fs.mkdirSync(profile, { recursive: true });
app.setName('Lucid Dictation');
app.setPath('userData', profile);
app.setPath('sessionData', profile);
const primary = app.requestSingleInstanceLock();
// Exit before Chromium initializes another cache. app.quit() alone can defer
// shutdown until after a second session has already tried opening the profile.
if (!primary) app.exit(0);
let win;
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});
require('../electron/dictation.cjs').register({ ipcMain, app, window: () => win, root });
ipcMain.handle('dictation:copy', (_event, text) => { if (typeof text === 'string') clipboard.writeText(text); });
app.whenReady().then(async () => {
  if (!primary) return;
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === win?.webContents && permission === 'media' && !details.mediaTypes?.includes('video'));
  });
  win = new BrowserWindow({ width: 760, height: 640, minWidth: 420, minHeight: 440,
    ...(process.env.LUCID_DICTATION_QA ? { x: -4000, y: -4000, skipTaskbar: true } : {}),
    title: 'Lucid dictation test', backgroundColor: '#141a33', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'dictation-test-preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(path.join(__dirname, 'dictation-test', 'index.html'));
  if (!process.env.LUCID_DICTATION_QA) { win.show(); win.focus(); }
}).catch(error => {
  console.error(error);
  dialog.showErrorBox('Could not open dictation', 'The dictation window could not start. Details are in the dictation launch log.');
  app.quit();
});
app.on('window-all-closed', () => app.quit());
