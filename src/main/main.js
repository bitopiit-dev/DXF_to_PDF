'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fss = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const isCli = process.argv.includes('--convert') || process.argv.includes('--help');

/* ---------- command line: convert without opening a window ---------- */
if (isCli) {
  app.whenReady()
    .then(() => require('./cli').run(process.argv.slice(1)))
    .then(code => app.exit(code), e => { console.error(e); app.exit(1); });
} else {
  startGui();
}

function startGui() {
  const { Pool } = require('./pool');
  const store = require('./store');
  const Presets = require('../models/presets');
  const { runBatch } = require('../core/batch');
  let win = null;
  let pool = null;
  const docs = new Map(); // id -> { path, name, pdf (ArrayBuffer of the last render) }
  const incoming = [];
  let rendererReady = false;

  /* ---------- small persisted state: window bounds and recent files ---------- */
  const stateFile = () => path.join(app.getPath('userData'), 'state.json');
  let state = { recent: [] };
  try { state = { recent: [], ...JSON.parse(fss.readFileSync(stateFile(), 'utf8')) }; } catch { /* first run */ }
  let saveTimer = null;
  const saveState = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => fs.writeFile(stateFile(), JSON.stringify(state)).catch(() => {}), 300);
  };
  const addRecent = p => {
    state.recent = [p, ...state.recent.filter(r => r !== p)].slice(0, 12);
    app.addRecentDocument(p);
    saveState();
  };

  /* ---------- window sized to whatever screen it opens on ---------- */
  function initialBounds() {
    const wa = screen.getPrimaryDisplay().workArea;
    const b = state.bounds;
    if (b) {
      // only reuse saved bounds if they still land on a connected display (laptops get undocked)
      const d = screen.getDisplayMatching(b).workArea;
      const visible = b.x < d.x + d.width - 80 && b.x + b.width > d.x + 80 && b.y >= d.y - 10 && b.y < d.y + d.height - 80;
      if (visible) return { x: b.x, y: b.y, width: Math.min(b.width, d.width), height: Math.min(b.height, d.height) };
    }
    const width = Math.min(wa.width, Math.max(Math.round(wa.width * 0.82), Math.min(1100, wa.width)), 1600);
    const height = Math.min(wa.height, Math.max(Math.round(wa.height * 0.86), Math.min(720, wa.height)), 1050);
    return { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - height) / 2), width, height };
  }

  function createWindow() {
    const wa = screen.getPrimaryDisplay().workArea;
    const dark = nativeTheme.shouldUseDarkColors;
    win = new BrowserWindow({
      ...initialBounds(),
      minWidth: Math.min(640, wa.width),
      minHeight: Math.min(480, wa.height),
      show: false,
      title: 'DXF to PDF',
      icon: path.join(ROOT, 'assets', 'icon', 'icon.png'),
      backgroundColor: dark ? '#0d1317' : '#dfe4e8',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    if (state.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(ROOT, 'src', 'ui', 'index.html'));
    const remember = () => {
      if (!win || win.isMinimized()) return;
      state.maximized = win.isMaximized();
      if (!state.maximized && !win.isFullScreen()) state.bounds = win.getBounds();
      saveState();
    };
    ['resize', 'move', 'maximize', 'unmaximize'].forEach(e => win.on(e, remember));
    rendererReady = false;
    win.webContents.on('did-finish-load', () => { rendererReady = true; flushIncoming(); });
    // never navigate away or open new windows from the renderer
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => { win = null; });
  }

  /* ---------- files arriving from the command line, a second launch, or Finder ---------- */
  function queuePaths(paths) {
    const list = paths.filter(Boolean).map(p => path.resolve(p));
    if (!list.length) return;
    incoming.push(...list);
    flushIncoming();
  }
  function flushIncoming() {
    if (!win || !rendererReady || !incoming.length) return;
    win.webContents.send('files:incoming', incoming.splice(0));
  }
  const dxfArgs = argv => argv.slice(1).filter(a => !a.startsWith('-') && /\.dxf$/i.test(a));

  async function expand(paths) {
    const out = [];
    for (const p of paths) {
      try {
        const st = await fs.stat(p);
        if (st.isDirectory()) {
          for (const n of (await fs.readdir(p)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
            if (/\.dxf$/i.test(n)) out.push(path.join(p, n));
          }
        } else out.push(p);
      } catch { out.push(p); }
    }
    return out;
  }

  async function addPaths(paths) {
    const results = [];
    for (const p of await expand(paths)) {
      const name = path.basename(p);
      const id = crypto.randomUUID();
      if (!/\.dxf$/i.test(p)) { results.push({ id, name, path: p, error: 'That is not a .dxf file.' }); continue; }
      try {
        const data = await fs.readFile(p);
        const meta = await pool.open(id, data);
        docs.set(id, { path: p, name, pdf: null });
        addRecent(p);
        results.push({ id, name, path: p, size: data.length, ...meta });
      } catch (e) {
        const msg = e.code === 'ENOENT' ? 'The file was moved or deleted.'
          : e.message === 'binary' ? 'This is a binary DXF. Save it as ASCII DXF from your CAD program and try again.'
          : e.message === 'notdxf' ? 'This file has no DXF sections. Check that it is a real DXF export.'
          : e.message === 'worker-crashed' ? 'This drawing is too large for the memory on this PC.'
          : `Could not read this drawing (${e.message}).`;
        if (e.code === 'ENOENT') { state.recent = state.recent.filter(r => r !== p); saveState(); }
        results.push({ id, name, path: p, error: msg });
      }
    }
    return results;
  }

  const safeName = n => (String(n || 'drawing').replace(/\.dxf$/i, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180) || 'drawing') + '.pdf';
  const writePdf = async (file, data) => { await fs.writeFile(file, Buffer.from(data)); return file; };

  async function renderPdf(id, hidden, opts) {
    const d = docs.get(id);
    const r = await pool.render(id, { hidden, opts, title: d.name.replace(/\.dxf$/i, ''), svg: false });
    if (r.pdf) d.pdf = r.pdf;
    return r;
  }

  /* ---------- IPC ---------- */
  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(), platform: process.platform, arch: process.arch,
    cores: os.cpus().length, memoryGB: Math.round(os.totalmem() / 1024 ** 3), workers: pool.size,
    text: await pool.status().catch(e => ({ shaping: false, error: e.message })),
  }));
  ipcMain.handle('app:recent', () => state.recent.slice(0, 8).map(p => ({ path: p, name: path.basename(p), dir: path.dirname(p) })));
  ipcMain.handle('app:reveal', (_e, p) => shell.showItemInFolder(p));

  ipcMain.handle('files:pick', async (_e, folder) => {
    const r = await dialog.showOpenDialog(win, folder
      ? { title: 'Open a folder of DXF drawings', properties: ['openDirectory'] }
      : { title: 'Open DXF drawings', properties: ['openFile', 'multiSelections'], filters: [{ name: 'DXF drawings', extensions: ['dxf'] }, { name: 'All files', extensions: ['*'] }] });
    return r.canceled ? [] : addPaths(r.filePaths);
  });
  ipcMain.handle('files:add', (_e, paths) => addPaths(paths));

  /* presets: built-in ones first, then the user's own */
  const allPresets = () => [...Presets.BUILTIN.map(p => ({ ...p })), ...store.list()];
  ipcMain.handle('presets:list', () => allPresets());
  ipcMain.handle('presets:save', (_e, { name, settings }) => {
    const problem = Presets.validName(name);
    if (problem) return { ok: false, error: problem };
    try { store.save(String(name).trim(), settings); return { ok: true, presets: allPresets() }; } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('presets:delete', (_e, name) => {
    if (Presets.isBuiltin(name)) return { ok: false, error: 'Built-in presets cannot be deleted.' };
    store.remove(name); return { ok: true, presets: allPresets() };
  });
  ipcMain.handle('doc:close', (_e, id) => { docs.delete(id); pool.close(id); });

  ipcMain.handle('doc:render', async (_e, { id, hidden, opts }) => {
    const d = docs.get(id);
    if (!d) return { error: 'This drawing is no longer open.' };
    try {
      const r = await pool.render(id, { hidden, opts, title: d.name.replace(/\.dxf$/i, '') });
      d.pdf = r.pdf || null;
      const { pdf, ...rest } = r;
      return { ...rest, pdfBytes: pdf ? pdf.byteLength : 0 };
    } catch (e) {
      return { error: e.message === 'worker-crashed' ? 'Ran out of memory converting this drawing. Try hiding some layers.' : e.message };
    }
  });

  ipcMain.handle('doc:openPdf', async (_e, id) => {
    const d = docs.get(id);
    if (!d || !d.pdf) return { ok: false, error: 'No PDF yet.' };
    const dir = path.join(os.tmpdir(), 'dxf-to-pdf');
    await fs.mkdir(dir, { recursive: true });
    const file = await writePdf(path.join(dir, safeName(d.name)), d.pdf);
    const err = await shell.openPath(file);
    return err ? { ok: false, error: err } : { ok: true, path: file };
  });

  ipcMain.handle('doc:savePdf', async (_e, id) => {
    const d = docs.get(id);
    if (!d || !d.pdf) return { ok: false, error: 'No PDF yet.' };
    const r = await dialog.showSaveDialog(win, {
      title: 'Save PDF', defaultPath: path.join(path.dirname(d.path), safeName(d.name)), filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try { return { ok: true, path: await writePdf(r.filePath, d.pdf) }; } catch (e) { return { ok: false, error: e.message }; }
  });

  // Save every drawing as its own PDF, next to its DXF or into one chosen folder
  ipcMain.handle('batch:save', async (e, { items, opts, where }) => {
    let dir = null;
    if (where === 'folder') {
      const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the PDFs', properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return { canceled: true };
      dir = r.filePaths[0];
    }
    const r = await runBatch(items, async it => {
      const d = docs.get(it.id);
      if (!d) throw new Error('This drawing is no longer open.');
      const out = await renderPdf(it.id, it.hidden, { ...opts, layers: it.layers });
      if (!out.pdf) throw new Error(out.error || 'Nothing to draw.');
      return writePdf(path.join(dir || path.dirname(d.path), safeName(d.name)), out.pdf);
    }, {
      concurrency: pool.size,
      onProgress: p => e.sender.send('batch:progress', { id: p.item.id, ok: p.ok, error: p.error, path: p.result, done: p.done, total: p.total }),
    });
    return { done: r.done.map(x => ({ id: x.item.id, path: x.result })), failed: r.failed.map(x => ({ id: x.item.id, error: x.error })), dir };
  });

  ipcMain.handle('batch:combine', async (_e, { items, opts }) => {
    const first = docs.get(items[0] && items[0].id);
    if (!first) return { canceled: true };
    const r = await dialog.showSaveDialog(win, {
      title: 'Save combined PDF', defaultPath: path.join(path.dirname(first.path), 'Drawings.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    const payload = [];
    for (const it of items) {
      const d = docs.get(it.id);
      if (!d) continue;
      payload.push({ id: it.id, hidden: it.hidden, opts: { ...opts, layers: it.layers }, title: d.name.replace(/\.dxf$/i, ''), data: await fs.readFile(d.path).catch(() => null) });
    }
    const out = await pool.combine(payload, path.basename(r.filePath, '.pdf'));
    if (!out.pdf) return { ok: false, error: 'None of these drawings has anything to print at these settings.' };
    await writePdf(r.filePath, out.pdf);
    return { ok: true, path: r.filePath, skipped: out.skipped };
  });

  /* ---------- menu ---------- */
  function buildMenu() {
    const isMac = process.platform === 'darwin';
    const send = cmd => () => win && win.webContents.send('menu', cmd);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' }] : []),
      {
        label: 'File',
        submenu: [
          { label: 'Open drawings…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          { label: 'Open folder…', accelerator: 'CmdOrCtrl+Shift+O', click: send('open-folder') },
          { type: 'separator' },
          { label: 'Open PDF', accelerator: 'CmdOrCtrl+Enter', click: send('open-pdf') },
          { label: 'Save PDF…', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { label: 'Save all PDFs…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-all') },
          { label: 'Combine into one PDF…', click: send('combine') },
          { type: 'separator' },
          { label: 'Close drawing', accelerator: 'CmdOrCtrl+W', click: send('close') },
          isMac ? { role: 'close' } : { role: 'quit' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'Fit to window', accelerator: 'CmdOrCtrl+0', click: send('fit') },
          { label: 'Zoom in', accelerator: 'CmdOrCtrl+=', click: send('zoom-in') },
          { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: send('zoom-out') },
          { label: 'Actual size', accelerator: 'CmdOrCtrl+1', click: send('actual') },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
        ],
      },
      { role: 'help', submenu: [{ label: 'About DXF to PDF', click: () => app.showAboutPanel() }] },
    ]));
  }

  // one running copy: a second launch (e.g. double-clicking another .dxf) hands its files to the first
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    queuePaths(dxfArgs(argv));
  });
  app.on('open-file', (e, p) => { e.preventDefault(); queuePaths([p]); }); // macOS

  app.setAboutPanelOptions({
    applicationName: 'DXF to PDF',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 K/Arifur Rahman. All rights reserved.',
    credits: 'Made by K/Arifur Rahman. Bangla text uses Noto Sans Bengali (SIL OFL) shaped with HarfBuzz (MIT).',
  });

  app.whenReady().then(() => {
    pool = new Pool({});
    buildMenu();
    createWindow();
    queuePaths(dxfArgs(process.argv));
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('will-quit', () => { if (pool) pool.destroy(); });
}
