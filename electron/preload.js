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

contextBridge.exposeInMainWorld('themes', {
  list: () => ipcRenderer.invoke('themes:list'),
  create: (payload) => ipcRenderer.invoke('themes:create', payload),
  update: (payload) => ipcRenderer.invoke('themes:update', payload),
  remove: (payload) => ipcRenderer.invoke('themes:remove', payload),
  setStatus: (payload) => ipcRenderer.invoke('themes:setStatus', payload),
});

contextBridge.exposeInMainWorld('competitors', {
  list: (payload) => ipcRenderer.invoke('competitors:list', payload),
  add: (payload) => ipcRenderer.invoke('competitors:add', payload),
  remove: (payload) => ipcRenderer.invoke('competitors:remove', payload),
});

contextBridge.exposeInMainWorld('insights', {
  get: (payload) => ipcRenderer.invoke('insights:get', payload),
  refresh: (payload) => ipcRenderer.invoke('insights:refresh', payload),
});

contextBridge.exposeInMainWorld('creatives', {
  list: (payload) => ipcRenderer.invoke('creatives:list', payload),
  create: (payload) => ipcRenderer.invoke('creatives:create', payload),
  update: (payload) => ipcRenderer.invoke('creatives:update', payload),
});

contextBridge.exposeInMainWorld('formAssist', {
  list: (payload) => ipcRenderer.invoke('formAssist:list', payload),
  generate: (payload) => ipcRenderer.invoke('formAssist:generate', payload),
  apply: (payload) => ipcRenderer.invoke('formAssist:apply', payload),
  feedback: (payload) => ipcRenderer.invoke('formAssist:feedback', payload),
});

contextBridge.exposeInMainWorld('publish', {
  list: (payload) => ipcRenderer.invoke('publish:list', payload),
  enqueue: (payload) => ipcRenderer.invoke('publish:enqueue', payload),
});

contextBridge.exposeInMainWorld('interactions', {
  list: (payload) => ipcRenderer.invoke('interactions:list', payload),
  enqueue: (payload) => ipcRenderer.invoke('interactions:enqueue', payload),
});

contextBridge.exposeInMainWorld('capture', {
  run: (payload) => ipcRenderer.invoke('capture:run', payload),
});

contextBridge.exposeInMainWorld('generation', {
  enqueue: (payload) => ipcRenderer.invoke('generation:enqueue', payload),
  pause: () => ipcRenderer.invoke('generation:pause'),
  resume: () => ipcRenderer.invoke('generation:resume'),
  cancel: (taskId) => ipcRenderer.invoke('generation:cancel', taskId),
  stats: () => ipcRenderer.invoke('generation:stats'),
});

contextBridge.exposeInMainWorld('topics', {
  list: () => ipcRenderer.invoke('topics:list'),
  updateStatus: (payload) => ipcRenderer.invoke('topics:updateStatus', payload),
});

contextBridge.exposeInMainWorld('metrics', {
  record: (payload) => ipcRenderer.invoke('metrics:record', payload),
  summary: (payload) => ipcRenderer.invoke('metrics:summary', payload),
  exportCsv: (payload) => ipcRenderer.invoke('metrics:export', payload),
});

contextBridge.exposeInMainWorld('config', {
  get: () => ipcRenderer.invoke('config:get'),
  set: (payload) => ipcRenderer.invoke('config:set', payload),
});

contextBridge.exposeInMainWorld('workflow', {
  publishTopic: (payload) => ipcRenderer.invoke('workflow:publishTopic', payload),
  rollback: (payload) => ipcRenderer.invoke('workflow:rollback', payload),
});

contextBridge.exposeInMainWorld('versions', {
  electron: process.versions.electron,
  node: process.versions.node,
});

contextBridge.exposeInMainWorld('auth', {
  login: (options) => ipcRenderer.invoke('auth:login', options),
  logout: () => ipcRenderer.invoke('auth:logout'),
  checkStatus: () => ipcRenderer.invoke('auth:checkStatus'),
});
