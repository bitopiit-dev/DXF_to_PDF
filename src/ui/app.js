'use strict';
// Wiring: opening drawings, converting, painting results, saving, menus. Panels live in panels/, the preview in canvas/.
(() => {
  const { $, el, opts, S, desktop, status, kb, len } = App;
  const app = $('app');

  /* ---------- opening drawings ---------- */
  function addResults(results, { autoOpen } = {}) {
    let first = null;
    for (const r of results) {
      const dup = S.docs.find(d => d.path === r.path && !d.error && !r.error);
      if (dup) { desktop.close(r.id); first = first || dup.id; continue; }
      S.docs.push({ ...r, hidden: new Set(r.hidden || []), overrides: {}, result: null, state: r.error ? 'error' : 'new' });
      first = first || r.id;
    }
    if (!S.docs.length) return;
    app.dataset.state = 'files';
    const errs = results.filter(r => r.error);
    if (errs.length && errs.length === results.length) status(errs.length > 1 ? `${errs.length} files could not be opened` : `${errs[0].name}: ${errs[0].error}`, 'err');
    App.queue.render();
    if (first) select(first, { autoOpen: autoOpen && results.length === 1 && opts.autoOpen });
  }
  async function pick(folder) { const r = await desktop.pick(folder); if (r.length) addResults(r, { autoOpen: true }); }
  async function addPaths(paths) {
    if (!paths.length) return;
    status(paths.length > 1 ? `Opening ${paths.length} items` : 'Opening drawing');
    addResults(await desktop.addPaths(paths), { autoOpen: true });
  }
  desktop.onIncoming(paths => addPaths(paths));

  async function showRecent() {
    const list = await desktop.recent(), ul = $('recentList'); ul.innerHTML = '';
    $('recent').hidden = !list.length;
    for (const f of list) {
      const b = el('button', { type: 'button', title: f.path }, el('b', { textContent: f.name }), el('small', { textContent: f.dir }));
      b.onclick = () => addPaths([f.path]);
      ul.append(el('li', {}, b));
    }
  }

  function select(id, { autoOpen } = {}) {
    S.sel = id;
    const d = App.current();
    App.queue.render(); App.layers.render(); closeDrawers();
    if (!d) return;
    if (d.error) { showMessage('err', 'This drawing could not be opened', d.error); facts(); return; }
    if (d.result && !d.dirty) { paint(true); return; }
    convert({ autoOpen, fresh: true });
  }

  /* ---------- converting ---------- */
  let timer = null, busyTimer = null;
  function convert({ autoOpen, fresh, delay } = {}) {
    clearTimeout(timer);
    S.docs.forEach(d => { if (d.id !== S.sel) d.dirty = true; });
    timer = setTimeout(() => run(autoOpen, fresh), delay || 0);
  }
  async function run(autoOpen, fresh) {
    const d = App.current(); if (!d || d.error) return;
    const seq = ++S.seq;
    clearTimeout(busyTimer); busyTimer = setTimeout(() => { $('busy').hidden = false; }, 160);
    status('Converting ' + d.name);
    const r = await desktop.render(d.id, [...d.hidden], App.engineOpts(d));
    if (seq !== S.seq) return; // a newer request superseded this one
    clearTimeout(busyTimer); $('busy').hidden = true;
    d.result = r; d.dirty = false;
    if (d.state !== 'saved') d.state = 'done';
    paint(fresh); App.queue.render();
    if (autoOpen && r.pdfBytes) openPdf();
  }

  function showMessage(cls, title, text, action) {
    const m = $('viewMsg'); m.hidden = false; m.className = 'view-msg ' + (cls || ''); m.innerHTML = '';
    m.append(el('strong', { textContent: title }), el('span', { textContent: text }));
    if (action) { const b = el('button', { className: 'btn', type: 'button', textContent: action.label }); b.onclick = action.run; m.append(b); }
    App.view.clear(); setButtons(false);
  }
  const setButtons = on => { $('bOpenPdf').disabled = !on; $('bSave').disabled = !on; };

  function paint(fresh) {
    const d = App.current(), r = d && d.result; if (!r) return;
    $('viewMsg').hidden = true;
    facts();
    App.emit('result', r);
    if (r.error && r.info) {
      showMessage('err', 'Too many sheets at this scale', r.error, r.info.suggested ? { label: `Use ${r.info.suggested}`, run: () => App.sheet.setScale(r.info.suggested) } : null);
      status(r.error, 'err'); sheetCells(r.info); return;
    }
    if (r.error) { showMessage('err', 'This drawing could not be converted', r.error); status(r.error, 'err'); return; }
    if (r.empty) { showMessage('', 'Nothing to draw', r.notes[0]); status('Nothing to draw', 'err'); sheetCells(null); return; }
    App.view.load(r.svg, r.info.posterW, r.info.posterH, fresh);
    setButtons(r.pdfBytes > 0);
    sheetCells(r.info, r.pdfBytes);
    status(`PDF ready: ${r.info.sheets} sheet${r.info.sheets > 1 ? 's' : ''}`, 'ok');
  }
  function sheetCells(i, bytes) {
    $('sSheet').textContent = i ? `${i.size} ${i.landscape ? 'landscape' : 'portrait'}, ${i.sheets > 1 ? `${i.sheets} sheets (${i.cols} × ${i.rows})` : '1 sheet'}, ${i.fixed ? i.scale : 'about ' + i.scale}` : '';
    $('sSize').textContent = bytes ? 'PDF ' + kb(bytes) : '';
  }
  function facts() {
    const d = App.current(), r = d && d.result, f = $('facts'); f.innerHTML = '';
    const add = (k, v) => f.append(el('dt', { textContent: k }), el('dd', { textContent: v }));
    if (d) add('File', d.name);
    if (r && r.info) {
      add('Real size', `${len(r.info.realW)} × ${len(r.info.realH)}`);
      add('Units', ({ mm: 'millimetres', cm: 'centimetres', m: 'metres', in: 'inches', ft: 'feet' }[r.info.units] || r.info.units) + (opts.units === 'auto' && r.info.unitsGuessed ? ' (assumed)' : ''));
    }
    if (r) add('Objects', (r.objects || 0).toLocaleString());
    const n = $('notes'); n.innerHTML = '';
    for (const t of (r && r.notes) || []) n.append(el('p', { textContent: t }));
  }

  /* ---------- saving ---------- */
  async function openPdf() {
    const d = App.current(); if (!d || !d.result || !d.result.pdfBytes) return;
    const r = await desktop.openPdf(d.id);
    status(r.ok ? `Opened ${d.name.replace(/\.dxf$/i, '')}.pdf` : `Could not open the PDF: ${r.error}`, r.ok ? 'ok' : 'err');
  }
  async function savePdf() {
    const d = App.current(); if (!d || !d.result || !d.result.pdfBytes) return;
    const r = await desktop.savePdf(d.id);
    if (r.ok) { d.state = 'saved'; d.savedPath = r.path; App.queue.render(); status('Saved ' + r.path, 'ok', r.path); }
    else if (!r.canceled) status('Could not save: ' + r.error, 'err');
  }
  const LO = window.Models.layerOverrides;
  const batchItems = () => S.docs.filter(d => !d.error).map(d => ({ id: d.id, hidden: [...d.hidden], layers: LO.toEngine(d.overrides) }));
  function progress(done, total, text) {
    const p = $('progress');
    if (done == null) { p.hidden = true; return; }
    p.hidden = false;
    p.classList.toggle('indeterminate', total == null);
    $('progressFill').style.width = total ? Math.round(done / total * 100) + '%' : '';
    $('progressText').textContent = text;
  }
  async function saveAll() {
    const items = batchItems(); if (!items.length) return;
    progress(0, items.length, `Saving 0 of ${items.length}`);
    status(`Saving ${items.length} PDFs`);
    const r = await desktop.saveAll(items, App.engineOpts(), opts.saveWhere);
    progress(null);
    if (r.canceled) { status('Save cancelled'); return; }
    const ok = r.done.length, bad = r.failed.length;
    status(bad ? `Saved ${ok} PDFs; ${bad} could not be converted at these settings` : `Saved ${ok} PDFs`, bad ? 'err' : 'ok', r.done[0] && r.done[0].path);
  }
  async function combine() {
    const items = batchItems(); if (!items.length) return;
    progress(0, null, `Combining ${items.length} drawings`);
    status(`Combining ${items.length} drawings`);
    const r = await desktop.combine(items, App.engineOpts());
    progress(null);
    if (r.canceled) { status('Cancelled'); return; }
    if (!r.ok) { status(r.error, 'err'); return; }
    status(r.skipped.length ? `Saved ${r.path}; left out ${r.skipped.join(', ')}` : `Saved ${r.path}`, r.skipped.length ? 'err' : 'ok', r.path);
  }
  desktop.onProgress(p => {
    const d = App.doc(p.id);
    if (d && p.ok) { d.state = 'saved'; d.savedPath = p.path; }
    progress(p.done, p.total, `Saving ${p.done} of ${p.total}`);
    App.queue.render();
  });
  $('sReveal').onclick = () => S.lastReveal && desktop.reveal(S.lastReveal);

  /* ---------- drag and drop, anywhere in the window ---------- */
  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('veil').hidden = false; });
  addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('veil').hidden = true; } });
  addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; $('veil').hidden = true;
    const paths = [...(e.dataTransfer ? e.dataTransfer.files : [])].map(f => desktop.pathForFile(f)).filter(Boolean);
    if (!paths.length) { $('dropErr').textContent = 'Those files could not be read. Use Choose drawings instead.'; return; }
    $('dropErr').textContent = ''; addPaths(paths);
  });

  /* ---------- drawers on narrow windows ---------- */
  function closeDrawers() {
    app.classList.remove('files-open', 'out-open'); $('scrim').hidden = true;
    $('tFiles').setAttribute('aria-expanded', 'false'); $('tOut').setAttribute('aria-expanded', 'false');
  }
  function toggleDrawer(cls, btn) {
    const open = !app.classList.contains(cls);
    closeDrawers();
    if (open) { app.classList.add(cls); $('scrim').hidden = false; btn.setAttribute('aria-expanded', 'true'); }
  }
  $('tFiles').onclick = () => toggleDrawer('files-open', $('tFiles'));
  $('tOut').onclick = () => toggleDrawer('out-open', $('tOut'));
  $('scrim').onclick = closeDrawers;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawers(); });

  /* ---------- buttons, theme, menu ---------- */
  $('bOpen').onclick = () => pick(false);
  $('bFolder').onclick = () => pick(true);
  $('bAdd').onclick = () => pick(false);
  $('pick').onclick = () => pick(false);
  $('pickFolder').onclick = () => pick(true);
  $('bOpenPdf').onclick = openPdf;
  $('bSave').onclick = savePdf;
  $('bSaveAll').onclick = saveAll;
  $('bCombine').onclick = combine;
  $('saveWhere').value = opts.saveWhere;
  $('saveWhere').onchange = () => { opts.saveWhere = $('saveWhere').value; App.persist(); };
  $('autoOpen').checked = opts.autoOpen;
  $('autoOpen').onchange = () => { opts.autoOpen = $('autoOpen').checked; App.persist(); };

  function applyTheme() {
    if (opts.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', opts.theme);
    App.rulers.draw();
  }
  App.seg('theme', 'theme', () => { App.persist(); applyTheme(); });

  desktop.onMenu(cmd => ({
    open: () => pick(false), 'open-folder': () => pick(true), 'open-pdf': openPdf, save: savePdf,
    'save-all': saveAll, combine, close: () => S.sel && App.queue.close(S.sel),
    fit: App.view.fit, 'zoom-in': () => App.view.zoomAt(1.25), 'zoom-out': () => App.view.zoomAt(0.8), actual: App.view.actual,
  }[cmd] || (() => {}))());

  // reference zones along the empty-state sheet border
  (function zones() {
    const z = $('zones'), cols = 6, rows = 4; let h = '';
    for (let i = 0; i < cols; i++) { const l = ((i + 0.5) / cols * 100).toFixed(2) + '%'; h += `<span style="left:${l};top:11px">${i + 1}</span><span style="left:${l};bottom:0;transform:translate(-50%,-2px)">${i + 1}</span>`; }
    for (let j = 0; j < rows; j++) { const t = ((j + 0.5) / rows * 100).toFixed(2) + '%'; const L = 'ABCD'[j]; h += `<span style="top:${t};left:11px">${L}</span><span style="top:${t};right:0;transform:translate(-4px,-50%)">${L}</span>`; }
    z.innerHTML = h;
  })();

  Object.assign(App, { convert, select, showRecent });
  App.paintIcons();
  applyTheme();
  showRecent();
  desktop.info().then(i => {
    if (i.text && !i.text.shaping) status('Bangla text support could not start; Bangla will print as “?”.', 'err');
    document.title = `DXF to PDF ${i.version}`;
  });
})();
