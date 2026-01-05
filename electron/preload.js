const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (update) => ipcRenderer.invoke('settings:set', update),
});

contextBridge.exposeInMainWorld('keywords', {
  list: () => ipcRenderer.invoke('keywords:list'),
  add: (value) => ipcRenderer.invoke('keywords:add', value),
  update: (payload) => ipcRenderer.invoke('keywords:update', payload),
  remove: (id) => ipcRenderer.invoke('keywords:remove', id),
});

contextBridge.exposeInMainWorld('capture', {
  run: (payload) => ipcRenderer.invoke('capture:run', payload),
});

contextBridge.exposeInMainWorld('versions', {
  electron: process.versions.electron,
  node: process.versions.node,
});
