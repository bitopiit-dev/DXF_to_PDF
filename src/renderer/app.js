/* global DXF */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const desktop = window.desktop || null;
  const st = { name: '', sourcePath: '', dxf: null, hidden: new Set(), zoom: 1, pdf: null, plan: null };

  try {
    const md = new window.jspdf.jsPDF();
    md.setFont('helvetica', 'normal');
    DXF.setMeasure(s => md.getStringUnitWidth(s));
  } catch (e) { console.error(e); }

  try { $('autoOpen').checked = localStorage.getItem('autoOpen') !== '0'; } catch (e) { /* storage unavailable */ }
  $('autoOpen').onchange = () => { try { localStorage.setItem('autoOpen', $('autoOpen').checked ? '1' : '0'); } catch (e) { /* ignore */ } };
  $('autoLabel').onclick = e => e.stopPropagation();

  // reference zones along the sheet border
  (function zones() {
    const z = $('zones'); const cols = 6, rows = 4; let h = '';
    for (let i = 0; i < cols; i++) { const l = ((i + 0.5) / cols * 100).toFixed(2) + '%'; h += `<span style="left:${l};top:5px">${i + 1}</span><span style="left:${l};bottom:5px">${i + 1}</span>`; }
    for (let j = 0; j < rows; j++) { const t = ((j + 0.5) / rows * 100).toFixed(2) + '%'; const L = 'ABCD'[j]; h += `<span style="top:${t};left:7px">${L}</span><span style="top:${t};right:7px">${L}</span>`; }
    z.innerHTML = h;
  })();

  const status = (txt, cls) => { const s = $('tStatus'); s.textContent = txt; s.className = 'v' + (cls ? ' ' + cls : ''); };

  function decode(buf) {
    const text = new TextDecoder('utf-8').decode(buf);
    return text.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : text;
  }

  async function load(name, buf, sourcePath) {
    $('dropErr').textContent = '';
    if (!/\.dxf$/i.test(name)) { $('dropErr').textContent = 'That is not a .dxf file. Choose a file ending in .dxf.'; return; }
    $('tFile').textContent = name; status('Reading…');
    try {
      const dxf = DXF.parse(decode(buf));
      st.dxf = dxf; st.name = name.replace(/\.dxf$/i, ''); st.sourcePath = sourcePath || '';
      st.hidden = new Set(Object.entries(dxf.layers).filter(([n, l]) => l.color < 0 || (l.flags & 1) || n.toLowerCase() === 'defpoints').map(([n]) => n));
      buildLayers();
      $('sheet').classList.add('loaded');
      st.zoom = 1;
      render();
      if (st.pdf && $('autoOpen').checked) openPDF();
    } catch (e) {
      console.error(e);
      const msg = e.message === 'binary' ? 'This is a binary DXF. Save it as ASCII DXF from your CAD program and try again.'
        : e.message === 'notdxf' ? 'This file has no DXF sections. Check that it is a real DXF export.'
        : 'Could not read this drawing.';
      $('sheet').classList.remove('loaded');
      $('dropErr').textContent = msg; status('Not converted', 'err');
    }
  }

  function buildLayers() {
    const box = $('layers'); box.innerHTML = '';
    const names = Object.keys(st.dxf.layers).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    $('layerBox').style.display = names.length ? '' : 'none';
    for (const n of names) {
      const L = st.dxf.layers[n];
      const lab = document.createElement('label');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !st.hidden.has(n);
      cb.onchange = () => { if (cb.checked) st.hidden.delete(n); else st.hidden.add(n); render(); };
      const sw = document.createElement('i'); if (L.tc != null) sw.style.background = '#' + L.tc.toString(16).padStart(6, '0');
      const t = document.createElement('span'); t.textContent = n;
      lab.append(cb, sw, t); box.append(lab);
    }
  }

  function render() {
    if (!st.dxf) return;
    status('Converting…');
    const { f, ext } = DXF.build(st.dxf, st.hidden);
    const paper = $('paper');
    const setBtns = on => { $('save').disabled = !on; $('open').disabled = !on; };
    if (!ext) {
      paper.innerHTML = ''; st.pdf = null; setBtns(false); $('tObj').textContent = '0'; status('Nothing to draw', 'err');
      $('notes').textContent = 'No visible objects. Turn on some layers, or check that the drawing has content in model space.';
      return;
    }
    const opts = { size: $('size').value, orient: $('orient').value, ink: $('ink').value };
    const P = DXF.plan(f.prims, ext, opts);
    st.plan = P;
    paper.innerHTML = DXF.toSVG(P);
    applyZoom();
    $('tSheet').textContent = `${opts.size} ${P.pw > P.ph ? 'landscape' : 'portrait'}, fit to page`;
    $('tObj').textContent = Object.values(f.used).reduce((a, b) => a + Math.max(0, b), 0).toLocaleString();
    try {
      st.pdf = DXF.toPDF(P, window.jspdf.jsPDF, st.name).output('arraybuffer');
      setBtns(true);
      status(`PDF ready, ${(st.pdf.byteLength / 1024).toFixed(0)} KB`, 'ok');
    } catch (e) { console.error(e); st.pdf = null; setBtns(false); status('PDF could not be created', 'err'); }

    const notes = [];
    if (f.paper) notes.push('Model space was empty, so the layout (paper space) was used.');
    const sk = Object.entries(f.skipped).filter(([, n]) => n > 0);
    if (sk.length) notes.push('Not drawn: ' + sk.map(([k, n]) => `${k.toLowerCase()} (${n})`).join(', ') + '.');
    notes.push('The PDF is fully vector: lines, curves and text stay sharp at any zoom. Line weights, line types and hatch patterns come from the drawing.');
    if (f.prims.some(p => p.k === 't' && /[^\x20-\x7E\xA0-\xFF]/.test(p.s))) notes.push('Some text uses non-Latin characters (for example Bangla), which the PDF font cannot show; they appear as “?”.');
    const nb = $('notes'); nb.innerHTML = '';
    notes.forEach(t => { const p = document.createElement('p'); p.textContent = t; nb.append(p); });
  }

  function applyZoom() {
    const P = st.plan; if (!P) return;
    const paper = $('paper'), stage = $('stage'), cs = getComputedStyle(stage);
    const avail = stage.clientWidth - 2 * parseFloat(cs.paddingLeft);
    const availH = stage.clientHeight - 2 * parseFloat(cs.paddingTop);
    paper.style.width = Math.max(120, Math.min(avail, availH * P.pw / P.ph) * st.zoom) + 'px';
  }

  async function openPDF() {
    if (!st.pdf) return;
    if (!desktop) return browserFallback(false);
    const r = await desktop.openPdf(st.name, st.pdf.slice(0));
    status(r.ok ? 'PDF opened' : `Could not open the PDF: ${r.error}`, r.ok ? 'ok' : 'err');
  }

  async function savePDF() {
    if (!st.pdf) return;
    if (!desktop) return browserFallback(true);
    const r = await desktop.savePdf(st.name, st.pdf.slice(0), st.sourcePath);
    if (r.ok) status('PDF saved', 'ok'); else if (r.canceled) status('Save cancelled');
  }

  function browserFallback(download) {
    const url = URL.createObjectURL(new Blob([st.pdf], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url;
    if (download) a.download = (st.name || 'drawing') + '.pdf'; else a.target = '_blank';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // file input used only when running outside the desktop shell
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.dxf'; input.hidden = true; document.body.append(input);
  input.onchange = async () => { const f = input.files[0]; if (f) load(f.name, await f.arrayBuffer(), ''); input.value = ''; };
  const choose = () => { if (desktop) desktop.openDialog(); else input.click(); };

  const drop = $('drop');
  $('pick').onclick = e => { e.stopPropagation(); choose(); };
  drop.onclick = choose;
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } };
  ['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  document.addEventListener('dragleave', e => { e.preventDefault(); if (!e.relatedTarget) drop.classList.remove('over'); });
  document.addEventListener('drop', async e => {
    e.preventDefault(); drop.classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) load(f.name, await f.arrayBuffer(), desktop ? desktop.pathForFile(f) : '');
  });
  if (desktop) desktop.onFileOpened(({ name, path, data }) => load(name, data, path));

  ['size', 'orient', 'ink'].forEach(id => { $(id).onchange = render; });
  $('zin').onclick = () => { st.zoom = Math.min(8, st.zoom * 1.5); applyZoom(); };
  $('zout').onclick = () => { st.zoom = Math.max(0.25, st.zoom / 1.5); applyZoom(); };
  $('zfit').onclick = () => { st.zoom = 1; applyZoom(); };
  $('open').onclick = openPDF;
  $('save').onclick = savePDF;
  $('another').onclick = choose;
  addEventListener('resize', applyZoom);
})();
