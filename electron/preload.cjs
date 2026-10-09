const { contextBridge, ipcRenderer } = require('electron');
const channels = ['rescan-library', 'remove-photo', 'relink-photo', 'previous', 'dismiss-recovery', 'bootstrap', 'query', 'credential', 'connect', 'disconnect', 'import', 'favorite', 'playlist', 'settings', 'wallpaper', 'next', 'download', 'cache', 'clear-cache', 'open-link', 'update-status', 'check-update', 'install-update', 'open-downloaded-update', 'open-update', 'feedback'];
const api = Object.fromEntries(channels.map(name => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), data => ipcRenderer.invoke(`framewall:${name}`, data)]));
api.onUpdate = callback => { const listener = (_, value) => callback(value); ipcRenderer.on('framewall:update', listener); return () => ipcRenderer.removeListener('framewall:update', listener); };
api.onProgress = callback => { const listener = (_, value) => callback(value); ipcRenderer.on('framewall:progress', listener); return () => ipcRenderer.removeListener('framewall:progress', listener); };
api.onChanging = callback => { const listener = (_, value) => callback(value); ipcRenderer.on('framewall:changing', listener); return () => ipcRenderer.removeListener('framewall:changing', listener); };
api.onUpdater = callback => { const listener = (_, value) => callback(value); ipcRenderer.on('framewall:updater', listener); return () => ipcRenderer.removeListener('framewall:updater', listener); };
contextBridge.exposeInMainWorld('framewall', api);
