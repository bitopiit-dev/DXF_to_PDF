'use strict';
// Watches one folder and turns every DXF saved into it into a PDF beside it.
// CAD programs write files in several steps, so a file is converted only once its size stops changing,
// and a DXF whose PDF is already newer is left alone.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const isDxf = n => /\.dxf$/i.test(n);
const pdfFor = f => f.replace(/\.dxf$/i, '.pdf');

async function upToDate(f) {
  try {
    const [d, p] = await Promise.all([fsp.stat(f), fsp.stat(pdfFor(f))]);
    return p.mtimeMs >= d.mtimeMs;
  } catch { return false; }
}

async function settled(f, { step = 400, tries = 25 } = {}) {
  let last = -1;
  for (let i = 0; i < tries; i++) {
    let st;
    try { st = await fsp.stat(f); } catch { return false; }
    if (st.size > 0 && st.size === last) return true;
    last = st.size;
    await new Promise(r => setTimeout(r, step));
  }
  return false;
}

function createWatcher({ convert, onEvent, step }) {
  let w = null, dir = null;
  const timers = new Map(), busy = new Set();

  async function handle(f) {
    if (busy.has(f)) return;
    busy.add(f);
    try {
      if (!(await settled(f, { step })) || (await upToDate(f))) return;
      onEvent({ type: 'converting', path: f });
      const pdf = await convert(f, pdfFor(f));
      onEvent({ type: 'converted', path: f, pdf });
    } catch (e) {
      onEvent({ type: 'failed', path: f, error: String((e && e.message) || e) });
    } finally { busy.delete(f); }
  }

  function queue(f) {
    clearTimeout(timers.get(f));
    timers.set(f, setTimeout(() => { timers.delete(f); handle(f); }, 500));
  }

  async function start(folder, { existing = true } = {}) {
    stop();
    const st = await fsp.stat(folder);
    if (!st.isDirectory()) throw new Error('not a folder');
    dir = folder;
    w = fs.watch(folder, (_ev, name) => { if (name && isDxf(String(name))) queue(path.join(folder, String(name))); });
    w.on('error', e => { stop(); onEvent({ type: 'stopped', error: e.message }); });
    onEvent({ type: 'watching', folder });
    if (existing) for (const n of await fsp.readdir(folder)) if (isDxf(n)) queue(path.join(folder, n));
  }

  function stop() {
    if (w) w.close();
    w = null; dir = null;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  }

  return { start, stop, folder: () => dir };
}

module.exports = { createWatcher, upToDate, settled, pdfFor };
