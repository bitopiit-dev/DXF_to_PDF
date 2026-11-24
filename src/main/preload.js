'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const listen = (channel, cb) => {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('app:info'),
  recent: () => ipcRenderer.invoke('app:recent'),
  reveal: p => ipcRenderer.invoke('app:reveal', p),
  pick: folder => ipcRenderer.invoke('files:pick', !!folder),
  addPaths: paths => ipcRenderer.invoke('files:add', paths),
  pathForFile: file => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } },
  render: (id, hidden, opts) => ipcRenderer.invoke('doc:render', { id, hidden, opts }),
  close: id => ipcRenderer.invoke('doc:close', id),
  openPdf: id => ipcRenderer.invoke('doc:openPdf', id),
  savePdf: id => ipcRenderer.invoke('doc:savePdf', id),
  saveAll: (items, opts, where) => ipcRenderer.invoke('batch:save', { items, opts, where }),
  combine: (items, opts) => ipcRenderer.invoke('batch:combine', { items, opts }),
  presets: () => ipcRenderer.invoke('presets:list'),
  savePreset: (name, settings) => ipcRenderer.invoke('presets:save', { name, settings }),
  deletePreset: name => ipcRenderer.invoke('presets:delete', name),
  onIncoming: cb => listen('files:incoming', cb),
  onMenu: cb => listen('menu', cb),
  onProgress: cb => listen('batch:progress', cb),
});
