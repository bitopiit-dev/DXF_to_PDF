'use strict';
// Updates from GitHub Releases. The Windows installer and the Linux AppImage replace themselves
// (electron-updater: download in the background, install on restart). The portable .exe, the .deb
// and the unsigned macOS build cannot replace themselves, so they are told a newer version exists.
const { app, net, shell } = require('electron');

const REPO = 'bitopiit-dev/DXF_to_PDF';
const RELEASES = `https://github.com/${REPO}/releases/latest`;

function canSelfUpdate() {
  if (!app.isPackaged) return false;
  if (process.platform === 'win32') return !process.env.PORTABLE_EXECUTABLE_FILE;
  if (process.platform === 'linux') return !!process.env.APPIMAGE;
  return false;
}

// "3.1.0" > "3.0.2"? Pre-release suffixes are ignored.
function newer(a, b) {
  const p = v => String(v).replace(/^v/, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

// A short, plain sentence for the status bar instead of the raw HTTP error.
function friendly(e) {
  const m = String((e && e.message) || e || '');
  if (/latest(-\w+)*\.yml|404/i.test(m)) return 'The latest release has no update information yet.';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|net::/i.test(m)) return 'GitHub could not be reached. Check the internet connection.';
  if (/403|rate limit/i.test(m)) return 'GitHub is busy right now. Try again in a while.';
  const first = m.split('\n')[0].trim();
  return first.length > 120 ? first.slice(0, 117) + '…' : first || 'Unknown error.';
}

function createUpdater(send) {
  let state = { state: 'idle' };
  let au = null, timer = null, first = null;
  const set = s => { state = s; send(s); };

  if (canSelfUpdate()) {
    au = require('electron-updater').autoUpdater;
    au.autoDownload = true;
    au.autoInstallOnAppQuit = true;
    au.logger = null;
    au.on('checking-for-update', () => { if (state.state !== 'ready') set({ state: 'checking' }); });
    au.on('update-available', i => set({ state: 'downloading', version: i.version, percent: 0 }));
    au.on('download-progress', p => set({ ...state, state: 'downloading', percent: Math.round(p.percent || 0) }));
    au.on('update-downloaded', i => set({ state: 'ready', version: i.version }));
    au.on('update-not-available', () => set({ state: 'current', version: app.getVersion() }));
    au.on('error', e => set({ state: 'error', error: friendly(e) }));
  }

  async function check(manual = false) {
    if (process.env.DXF2PDF_FAKE_UPDATE) { set({ state: 'ready', version: process.env.DXF2PDF_FAKE_UPDATE, fake: true, manual }); return; }
    if (!app.isPackaged) { if (manual) set({ state: 'current', version: app.getVersion(), dev: true, manual }); return; }
    if (state.state === 'ready' || state.state === 'downloading') { send(state); return; }
    if (au) {
      try { await au.checkForUpdates(); } catch (e) { set({ state: 'error', error: friendly(e), manual }); }
      return;
    }
    try {
      const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'DXF-to-PDF', Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('GitHub answered ' + r.status);
      const j = await r.json();
      const url = typeof j.html_url === 'string' && j.html_url.startsWith('https://github.com/') ? j.html_url : RELEASES;
      if (newer(j.tag_name, app.getVersion())) set({ state: 'available', version: String(j.tag_name).replace(/^v/, ''), url, manual });
      else set({ state: 'current', version: app.getVersion(), manual });
    } catch (e) {
      set({ state: 'error', error: friendly(e), manual });
    }
  }

  // check a little after start, then every six hours while the app stays open
  function schedule(on) {
    clearTimeout(first); clearInterval(timer); first = timer = null;
    if (!on) return;
    first = setTimeout(() => check(false), process.env.DXF2PDF_FAKE_UPDATE ? 800 : 8000);
    timer = setInterval(() => check(false), 6 * 3600 * 1000);
  }

  function install() {
    if (state.fake) { set({ state: 'idle' }); return; }
    if (au && state.state === 'ready') { setImmediate(() => au.quitAndInstall(false, true)); return; }
    shell.openExternal(state.url || RELEASES);
  }

  return { check, schedule, install, get: () => state, selfUpdating: !!au };
}

module.exports = { createUpdater, newer, canSelfUpdate, friendly };
