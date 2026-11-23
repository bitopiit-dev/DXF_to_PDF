'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

let win = null;
let pendingFile = null;

const dxfFromArgs = argv => argv.slice(1).find(a => /\.dxf$/i.test(a) && !a.startsWith('-'));

async function sendFile(filePath) {
  if (!filePath) return;
  if (!win || win.webContents.isLoading()) { pendingFile = filePath; return; }
  try {
    const data = await fs.readFile(filePath);
    win.webContents.send('file:opened', { name: path.basename(filePath), path: filePath, data });
  } catch (err) {
    dialog.showErrorBox('Could not open file', `${filePath}\n\n${err.message}`);
  }
}

async function pickFile() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open DXF drawing',
    properties: ['openFile'],
    filters: [{ name: 'DXF drawings', extensions: ['dxf'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (!r.canceled && r.filePaths[0]) await sendFile(r.filePaths[0]);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: 'DXF to PDF',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon', 'icon.png'),
    backgroundColor: '#e6ebee',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    if (pendingFile) { const f = pendingFile; pendingFile = null; sendFile(f); }
  });
  // never navigate away or open new windows from the renderer
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open DXF…', accelerator: 'CmdOrCtrl+O', click: pickFile },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'viewMenu' },
  ]));
}

// one running copy: a second launch (e.g. double-clicking another .dxf) hands its file to the first
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    sendFile(dxfFromArgs(argv));
  });

  app.on('open-file', (e, filePath) => { e.preventDefault(); sendFile(filePath); }); // macOS

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    const f = dxfFromArgs(process.argv);
    if (f) pendingFile = path.resolve(f);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

const safeName = n => (String(n || 'drawing').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180) || 'drawing') + '.pdf';

ipcMain.handle('dialog:open', pickFile);

ipcMain.handle('pdf:save', async (_e, { name, data, sourcePath }) => {
  const dir = sourcePath ? path.dirname(sourcePath) : app.getPath('documents');
  const r = await dialog.showSaveDialog(win, {
    title: 'Save PDF',
    defaultPath: path.join(dir, safeName(name)),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  await fs.writeFile(r.filePath, Buffer.from(data));
  return { ok: true, path: r.filePath };
});

ipcMain.handle('pdf:open', async (_e, { name, data }) => {
  const dir = path.join(os.tmpdir(), 'dxf-to-pdf');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, safeName(name));
  await fs.writeFile(file, Buffer.from(data));
  const err = await shell.openPath(file);
  return err ? { ok: false, error: err } : { ok: true, path: file };
});
