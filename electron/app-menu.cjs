// macOS needs an application menu for the standard shortcuts (copy, paste, hide, quit, full screen).
// Windows and Linux draw their own window controls (src/titlebar.ts) and keep Electron's default.
const { Menu } = require('electron');

function template() {
  return [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ];
}

function install(platform = process.platform) {
  if (platform !== 'darwin') return false;
  Menu.setApplicationMenu(Menu.buildFromTemplate(template()));
  return true;
}

module.exports = { install, template };
