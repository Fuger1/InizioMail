const { contextBridge, ipcRenderer } = require('electron');
const { initUpdaterUI } = require('./updater-ui');

// Self-contained update notifier overlay (works on any renderer page).
initUpdaterUI(ipcRenderer);

contextBridge.exposeInMainWorld('inizio', {
  authStatus: () => ipcRenderer.invoke('auth:status'),
  connect: () => ipcRenderer.invoke('auth:connect'),
  disconnect: () => ipcRenderer.invoke('auth:disconnect'),
  loadTemplates: () => ipcRenderer.invoke('templates:load'),
  send: (payload) => ipcRenderer.invoke('mail:send', payload)
});
