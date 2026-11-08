function externalUrl(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\r\n\0]/.test(value)) return null;
  try { const u = new URL(value); return ['http:', 'https:', 'mailto:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
async function open(shell, value) {
  const url = externalUrl(value);
  if (!url) return { ok: false, error: 'This link cannot be opened.' };
  try { await shell.openExternal(url); return { ok: true }; }
  catch { return { ok: false, error: 'Your browser could not be opened. Copy the link and open it in your browser.' }; }
}
function register(ipcMain, shell) { ipcMain.handle('app:open-external', (_event, value) => open(shell, value)); }
module.exports = { externalUrl, open, register };
