'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  savePdf: (name, data, sourcePath) => ipcRenderer.invoke('pdf:save', { name, data, sourcePath }),
  openPdf: (name, data) => ipcRenderer.invoke('pdf:open', { name, data }),
  pathForFile: file => { try { return webUtils.getPathForFile(file) || ''; } catch { return ''; } },
  onFileOpened: cb => ipcRenderer.on('file:opened', (_e, payload) => cb(payload)),
});
