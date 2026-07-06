// ---------------------------------------------------------------------------
// Auto-update (electron-updater + GitHub Releases)
//
// Self-contained module. Owns the autoUpdater lifecycle, application menu
// "Check for Updates" action, logging, and the IPC bridge that drives the
// renderer notification UI (see updater-ui.js, injected by preload.js).
// ---------------------------------------------------------------------------
const { app, ipcMain, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// electron-updater's recommended logging setup: everything is written to the
// per-user log file (%USERPROFILE%\AppData\Roaming\<app>\logs on Windows).
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Download in the background as soon as an update is found, and fall back to
// installing on the next quit if the user chooses "Later".
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let getWindow = () => null;
let manualCheck = false;

function send(status, data) {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:status', { status, ...(data || {}) });
  }
}

function wireEvents() {
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => { send('idle', { manual: manualCheck }); manualCheck = false; });
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info.version }));
  autoUpdater.on('error', (err) => {
    log.error('Updater error:', err);
    send('error', { message: (err && err.message) || String(err) });
  });
}

// Trigger a check. In development there is no published feed, so we skip the
// network call (which would otherwise throw) and report a benign state.
function checkForUpdates(manual) {
  if (manual) manualCheck = true;
  if (!app.isPackaged) {
    if (manual) send('dev');
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    log.error('checkForUpdates failed:', err);
    send('error', { message: (err && err.message) || String(err) });
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Check for Updates…', click: () => checkForUpdates(true) }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Called once from main.js after the window exists.
function initUpdater(windowGetter) {
  getWindow = windowGetter;
  wireEvents();
  buildMenu();

  // Renderer -> main actions (fired by updater-ui.js buttons).
  ipcMain.on('updater:restart', () => {
    try {
      autoUpdater.quitAndInstall();
    } catch (err) {
      log.error('quitAndInstall failed:', err);
    }
  });
  ipcMain.handle('updater:check', () => checkForUpdates(true));

  // Automatic check on launch.
  checkForUpdates(false);
}

module.exports = { initUpdater };
