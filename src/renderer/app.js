'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const desktop = window.desktop;
  const app = $('app');

  /* ---------- settings, remembered between runs ---------- */
  const DEFAULTS = { size: 'A3', orient: 'auto', margin: 10, scaleMode: 'fit', scale: '1:100', units: 'auto', overlap: 10, ink: 'color', autoOpen: true, theme: 'system', saveWhere: 'beside' };
  const opts = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('opts') || '{}') }; } catch { return { ...DEFAULTS }; } })();
  const persist = () => { try { localStorage.setItem('opts', JSON.stringify(opts)); } catch { /* storage unavailable */ } };
  const engineOpts = () => ({
    size: opts.size, orient: opts.orient, margin: opts.margin, ink: opts.ink, units: opts.units, overlap: opts.overlap,
    scale: opts.scaleMode === 'fit' ? 'fit' : opts.scale,
  });

  const S = { docs: [], sel: null, seq: 0, lastReveal: null };
  const doc = id => S.docs.find(d => d.id === id);
  const current = () => doc(S.sel);

  /* ---------- status bar ---------- */
  function status(msg, cls, reveal) {
    const s = $('sMsg'); s.textContent = msg; s.className = cls || '';
    S.lastReveal = reveal || null; $('sReveal').hidden = !reveal;
  }
  $('sReveal').onclick = () => S.lastReveal && desktop.reveal(S.lastReveal);
  const kb = n => n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const len = mm => mm >= 1000 ? +(mm / 1000).toPrecision(4) + ' m' : mm >= 10 ? Math.round(mm / (mm >= 100 ? 1 : 0.1)) * (mm >= 100 ? 1 : 0.1) + ' mm' : +mm.toPrecision(3) + ' mm';

  /* ---------- theme ---------- */
  function applyTheme() {
    if (opts.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', opts.theme);
    drawRulers();
  }

  /* ---------- segmented controls ---------- */
  function seg(id, key, onChange) {
    const el = $(id);
    const sync = () => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === opts[key])));
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || opts[key] === b.dataset.v) return;
      opts[key] = b.dataset.v; persist(); sync(); onChange && onChange();
    });
    el.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const bs = [...el.querySelectorAll('button')], i = bs.findIndex(b => b.dataset.v === opts[key]);
      const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
      n.focus(); n.click();
    });
    sync();
  }

  /* ---------- the drawings queue ---------- */
  function addResults(results, { autoOpen } = {}) {
    let first = null;
    for (const r of results) {
      if (S.docs.some(d => d.path === r.path && !d.error && !r.error)) { // already open: select it, drop the duplicate
        desktop.close(r.id);
        first = first || S.docs.find(d => d.path === r.path).id;
        continue;
      }
      S.docs.push({ ...r, hidden: new Set(r.hidden || []), result: null, state: r.error ? 'error' : 'new' });
      first = first || r.id;
    }
    if (!S.docs.length) return;
    app.dataset.state = 'files';
    const errs = results.filter(r => r.error);
    if (errs.length === results.length && results.length) status(errs.length > 1 ? `${errs.length} files could not be opened` : `${errs[0].name}: ${errs[0].error}`, 'err');
    renderQueue();
    if (first) select(first, { autoOpen: autoOpen && results.length === 1 && opts.autoOpen });
  }

  function renderQueue() {
    const q = $('queue'); q.innerHTML = '';
    for (const d of S.docs) {
      const li = document.createElement('li');
      li.role = 'option'; li.id = 'q-' + d.id; li.dataset.id = d.id;
      li.setAttribute('aria-selected', String(d.id === S.sel));
      li.dataset.state = d.error || (d.result && d.result.error) ? 'error' : d.state === 'saved' ? 'saved' : d.result ? 'ready' : 'new';
      const name = document.createElement('span'); name.className = 'name'; name.textContent = d.name; name.title = d.path;
      const sub = document.createElement('span'); sub.className = 'sub';
      if (d.error) { sub.textContent = d.error; sub.classList.add('err'); }
      else if (d.state === 'saved') { sub.textContent = 'Saved as PDF'; sub.classList.add('ok'); sub.title = d.savedPath || ''; }
      else if (d.result && d.result.error) { sub.textContent = 'Needs a different scale'; sub.classList.add('err'); }
      else if (d.result && d.result.info) { const i = d.result.info; sub.textContent = `${i.size}, ${i.sheets} sheet${i.sheets > 1 ? 's' : ''}, ${i.fixed ? i.scale : 'fit ' + i.scale}`; }
      else sub.textContent = d.size ? kb(d.size) + ' DXF' : 'Not converted yet';
      const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×';
      x.setAttribute('aria-label', 'Close ' + d.name); x.tabIndex = -1;
      x.onclick = e => { e.stopPropagation(); closeDoc(d.id); };
      li.append(name, x, sub);
      li.onclick = () => select(d.id);
      li.ondblclick = () => { if (d.savedPath) desktop.reveal(d.savedPath); };
      q.append(li);
    }
    q.setAttribute('aria-activedescendant', S.sel ? 'q-' + S.sel : '');
    const n = S.docs.length;
    $('fileCount').textContent = n ? n : '';
    $('batch').hidden = S.docs.filter(d => !d.error).length < 2;
    $('bSaveAll').textContent = `Save all ${S.docs.filter(d => !d.error).length}`;
  }

  function closeDoc(id) {
    const i = S.docs.findIndex(d => d.id === id); if (i < 0) return;
    S.docs.splice(i, 1); desktop.close(id);
    if (S.sel === id) S.sel = null;
    if (!S.docs.length) { app.dataset.state = 'empty'; showRecent(); status('Ready'); renderQueue(); return; }
    renderQueue();
    if (!S.sel) select(S.docs[Math.min(i, S.docs.length - 1)].id);
  }

  $('queue').addEventListener('keydown', e => {
    const i = S.docs.findIndex(d => d.id === S.sel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = S.docs[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) select(n.id); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) closeDoc(S.sel);
  });

  function select(id, { autoOpen } = {}) {
    S.sel = id;
    const d = current();
    renderQueue();
    buildLayers();
    closeDrawers();
    if (!d) return;
    if (d.error) { showMessage('err', 'This drawing could not be opened', d.error); paintFacts(); return; }
    if (d.result && !d.dirty) { paint(true); return; }
    convert({ autoOpen, fresh: true });
  }

  /* ---------- conversion ---------- */
  let timer = null, busyTimer = null;
  function convert({ autoOpen, fresh, delay } = {}) {
    clearTimeout(timer);
    S.docs.forEach(d => { if (d.id !== S.sel) d.dirty = true; });
    timer = setTimeout(() => run(autoOpen, fresh), delay || 0);
  }
  async function run(autoOpen, fresh) {
    const d = current(); if (!d || d.error) return;
    const seq = ++S.seq;
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { $('busy').hidden = false; }, 160);
    status('Converting ' + d.name);
    const r = await desktop.render(d.id, [...d.hidden], engineOpts());
    if (seq !== S.seq) return; // a newer request superseded this one
    clearTimeout(busyTimer); $('busy').hidden = true;
    d.result = r; d.dirty = false;
    if (d.state !== 'saved') d.state = 'done';
    paint(fresh);
    renderQueue();
    if (autoOpen && r.pdfBytes) openPdf();
  }

  function showMessage(cls, title, text, action) {
    const m = $('viewMsg'); m.hidden = false; m.className = 'view-msg ' + (cls || ''); m.innerHTML = '';
    const t = document.createElement('strong'); t.textContent = title;
    const p = document.createElement('span'); p.textContent = text;
    m.append(t, p);
    if (action) { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = action.label; b.onclick = action.run; m.append(b); }
    $('paper').innerHTML = ''; V.w = 0;
    setButtons(false); drawRulers();
  }

  function setButtons(on) { $('bOpenPdf').disabled = !on; $('bSave').disabled = !on; }

  function paint(fresh) {
    const d = current(), r = d && d.result; if (!r) return;
    $('viewMsg').hidden = true;
    paintFacts();
    if (r.error && r.info) {
      showMessage('err', 'Too many sheets at this scale', r.error, r.info.suggested ? { label: `Use ${r.info.suggested}`, run: () => setScale(r.info.suggested) } : null);
      status(r.error, 'err'); sheetCells(r.info); return;
    }
    if (r.error) { showMessage('err', 'This drawing could not be converted', r.error); status(r.error, 'err'); return; }
    if (r.empty) { showMessage('', 'Nothing to draw', r.notes[0]); status('Nothing to draw', 'err'); sheetCells(null); return; }
    $('paper').innerHTML = r.svg;
    const svg = $('paper').firstElementChild;
    V.w = r.info.posterW; V.h = r.info.posterH; V.svg = svg;
    setButtons(r.pdfBytes > 0);
    if (fresh || !V.k) fit(); else commitZoom();
    sheetCells(r.info, r.pdfBytes);
    status(`PDF ready: ${r.info.sheets} sheet${r.info.sheets > 1 ? 's' : ''}`, 'ok');
  }

  function sheetCells(i, bytes) {
    $('sSheet').textContent = i ? `${i.size} ${i.landscape ? 'landscape' : 'portrait'}, ${i.sheets > 1 ? `${i.sheets} sheets (${i.cols} × ${i.rows})` : '1 sheet'}, ${i.fixed ? i.scale : 'about ' + i.scale}` : '';
    $('sSize').textContent = bytes ? 'PDF ' + kb(bytes) : '';
  }

  function paintFacts() {
    const d = current(), r = d && d.result, f = $('facts'); f.innerHTML = '';
    const add = (k, v) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; f.append(dt, dd); };
    if (d) add('File', d.name);
    if (r && r.info) {
      add('Real size', `${len(r.info.realW)} × ${len(r.info.realH)}`);
      add('Units', ({ mm: 'millimetres', cm: 'centimetres', m: 'metres', in: 'inches', ft: 'feet' }[r.info.units] || r.info.units) + (opts.units === 'auto' && r.info.unitsGuessed ? ' (assumed)' : ''));
    }
    if (r) add('Objects', (r.objects || 0).toLocaleString());
    const n = $('notes'); n.innerHTML = '';
    for (const t of (r && r.notes) || []) { const p = document.createElement('p'); p.textContent = t; n.append(p); }
    scaleHint();
  }

  function scaleHint() {
    const h = $('scaleHint'); h.innerHTML = '';
    const r = current() && current().result; if (!r || !r.info) return;
    const i = r.info;
    const say = (text, s) => {
      h.append(text);
      if (s && (opts.scaleMode === 'fit' || s !== opts.scale)) { const b = document.createElement('button'); b.className = 'link'; b.type = 'button'; b.textContent = `Use ${s}`; b.onclick = () => setScale(s); h.append(b); }
    };
    if (opts.scaleMode === 'fit') say(`Prints at about ${i.fitScale}. For a scale you can measure, `, i.suggested);
    else if (i.sheets > 1 && !r.error) say(`Splits into ${i.sheets} sheets that overlap by ${opts.overlap} mm. To fit one sheet, `, i.suggested);
    else if (!r.error) {
      // a larger scale that still fits one sheet makes better use of the paper
      const N = v => { const m = String(v).match(/^(\d*\.?\d+):(\d*\.?\d+)$/); return m ? m[2] / m[1] : NaN; };
      if (i.suggested && N(i.suggested) < N(opts.scale) * 0.999) say(`Fits one ${i.size} sheet with room to spare. To print it larger, `, i.suggested);
      else say(`Fits one ${i.size} sheet. Check the print with the scale bar in the margin.`);
    }
  }

  function setScale(s) {
    opts.scaleMode = 'fixed'; opts.scale = s; $('scale').value = s; persist();
    $('scaleMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === 'fixed')));
    $('out').dataset.scale = 'fixed';
    convert({ fresh: true });
  }

  /* ---------- layers ---------- */
  function buildLayers() {
    const d = current(), box = $('layers'); box.innerHTML = '';
    const layers = (d && d.layers) || [];
    $('layerCount').textContent = layers.length ? `${layers.length - layers.filter(l => d.hidden.has(l.name)).length} of ${layers.length}` : '';
    $('layerFilter').hidden = layers.length < 10;
    document.querySelector('.layer-tools').hidden = !layers.length;
    if (d && !layers.length) { const p = document.createElement('li'); p.className = 'layers-empty'; p.textContent = 'This drawing has no layers; everything prints.'; box.append(p); return; }
    const q = $('layerFilter').value.trim().toLowerCase();
    for (const l of layers) {
      if (q && !l.name.toLowerCase().includes(q)) continue;
      const li = document.createElement('li'), lab = document.createElement('label');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !d.hidden.has(l.name);
      cb.onchange = () => { if (cb.checked) d.hidden.delete(l.name); else d.hidden.add(l.name); buildLayers(); convert({ delay: 150 }); };
      const sw = document.createElement('i'); sw.style.background = l.color;
      const t = document.createElement('span'); t.className = 'ln'; t.textContent = l.name;
      lab.append(cb, sw, t);
      if (l.frozen || l.off) { const s = document.createElement('small'); s.textContent = l.frozen ? 'frozen' : 'off'; lab.append(s); }
      li.append(lab); box.append(li);
    }
  }
  $('layerFilter').oninput = buildLayers;
  $('lAll').onclick = () => { const d = current(); if (!d) return; d.hidden.clear(); buildLayers(); convert(); };
  $('lNone').onclick = () => { const d = current(); if (!d) return; d.layers.forEach(l => d.hidden.add(l.name)); buildLayers(); convert(); };

  /* ---------- preview: pan, zoom, rulers ---------- */
  // V.k = screen px per paper mm, V.x/V.y = where paper (0,0) sits in the stage, V.kBase = size the SVG is laid out at
  const V = { k: 0, x: 0, y: 0, kBase: 0, w: 0, h: 0, svg: null, cursor: null };
  const stage = $('stage'), paper = $('paper');
  const CSS_PX_PER_MM = 96 / 25.4;

  function fit() {
    if (!V.w) return;
    const W = stage.clientWidth, H = stage.clientHeight, pad = Math.min(40, W * 0.05, H * 0.05);
    V.k = Math.max(0.01, Math.min((W - 2 * pad) / V.w, (H - 2 * pad) / V.h));
    V.x = (W - V.w * V.k) / 2; V.y = (H - V.h * V.k) / 2;
    V.fitted = true;
    commitZoom();
  }
  let commitTimer = null;
  function commitZoom() {
    if (!V.svg) return;
    V.kBase = V.k;
    V.svg.style.width = V.w * V.k + 'px'; V.svg.style.height = V.h * V.k + 'px';
    place();
  }
  function place() {
    paper.style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.k / (V.kBase || V.k)})`;
    $('zPct').textContent = Math.round(V.k / CSS_PX_PER_MM * 100) + '%';
    // cutting-mat grid in real paper millimetres: minor lines every 10 mm (or coarser when zoomed out), major every 5 minor
    const minor = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(mm => mm * V.k >= 14) || 1000;
    stage.style.setProperty('--gm', minor * V.k + 'px');
    stage.style.setProperty('--gM', minor * 5 * V.k + 'px');
    stage.style.setProperty('--gx', V.x + 'px');
    stage.style.setProperty('--gy', V.y + 'px');
    drawRulers();
  }
  function zoomAt(f, sx, sy) {
    if (!V.w) return;
    const fitK = Math.min(stage.clientWidth / V.w, stage.clientHeight / V.h);
    const k = Math.min(Math.max(V.k * f, fitK * 0.25), Math.max(fitK * 400, CSS_PX_PER_MM * 8));
    if (sx == null) { sx = stage.clientWidth / 2; sy = stage.clientHeight / 2; }
    V.x = sx - (sx - V.x) * k / V.k; V.y = sy - (sy - V.y) * k / V.k; V.k = k; V.fitted = false;
    place();
    clearTimeout(commitTimer); commitTimer = setTimeout(commitZoom, 180); // re-lay the SVG once zooming pauses, so lines stay crisp
  }
  const actual = () => { if (V.w) zoomAt(CSS_PX_PER_MM / V.k); };

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    // mouse wheels and pinch zoom; two-finger trackpad scrolling pans
    const mouse = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || mouse) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * (e.deltaMode === 1 ? 33 : 1)), e.clientX - r.left, e.clientY - r.top);
    else { V.x -= e.deltaX; V.y -= e.deltaY; place(); }
  }, { passive: false });

  const pointers = new Map();
  let pinch = null;
  stage.addEventListener('pointerdown', e => {
    if (e.button > 1 || !V.w) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.classList.add('panning');
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
  });
  stage.addEventListener('pointermove', e => {
    const r = stage.getBoundingClientRect();
    V.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
    const p = pointers.get(e.pointerId);
    if (p) {
      if (pointers.size === 2 && pinch) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.d = d;
      } else { V.x += e.clientX - p.x; V.y += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; V.fitted = false; place(); }
    } else drawRulers();
    cursorReadout();
  });
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) stage.classList.remove('panning'); };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', () => { V.cursor = null; drawRulers(); cursorReadout(); });
  stage.addEventListener('dblclick', fit);
  stage.addEventListener('keydown', e => {
    const step = 60;
    if (e.key === 'ArrowLeft') V.x += step; else if (e.key === 'ArrowRight') V.x -= step;
    else if (e.key === 'ArrowUp') V.y += step; else if (e.key === 'ArrowDown') V.y -= step;
    else if (e.key === '+' || e.key === '=') return zoomAt(1.25);
    else if (e.key === '-') return zoomAt(0.8);
    else if (e.key === '0' || e.key === 'f') return fit();
    else if (e.key === '1') return actual();
    else return;
    e.preventDefault(); place();
  });
  $('zIn').onclick = () => zoomAt(1.25);
  $('zOut').onclick = () => zoomAt(0.8);
  $('zFit').onclick = fit;
  $('zPct').onclick = actual;

  function cursorReadout() {
    const r = current() && current().result, c = V.cursor;
    if (!c || !r || !r.info || !V.w) { $('sCursor').textContent = ''; return; }
    const mx = (c.x - V.x) / V.k, my = (c.y - V.y) / V.k, m = r.info.map;
    if (mx < 0 || my < 0 || mx > V.w || my > V.h) { $('sCursor').textContent = ''; return; }
    const x = m.minx + (mx - m.ox) / m.s, y = m.maxy - (my - m.oy) / m.s, u = r.info.units;
    const f = v => Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2);
    $('sCursor').textContent = `X ${f(x)}  Y ${f(y)} ${u}`;
  }

  // millimetre rulers along the preview, crisp at any display scaling
  function drawRulers() {
    for (const [id, horiz] of [['rulerH', true], ['rulerV', false]]) {
      const c = $(id), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) continue;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      if (!V.w || !V.k) continue;
      const cs = getComputedStyle(document.documentElement);
      const ink = cs.getPropertyValue('--ruler-ink').trim(), acc = cs.getPropertyValue('--mark').trim();
      const L = horiz ? w : h, T = horiz ? h : w, o = horiz ? V.x : V.y, size = horiz ? V.w : V.h;
      // paper extent band
      g.fillStyle = 'rgba(255,122,26,.16)'; // the paper's extent, marked in orange on the ruler
      const a = Math.max(0, o), b = Math.min(L, o + size * V.k);
      if (b > a) { if (horiz) g.fillRect(a, 0, b - a, T); else g.fillRect(0, a, T, b - a); }
      const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
      const major = steps.find(s => s * V.k >= 56) || 5000;
      const minor = steps.slice().reverse().find(s => s < major && major % s === 0 && s * V.k >= 6) || major;
      g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1;
      g.font = `600 10px "Barlow Condensed", sans-serif`; g.textBaseline = 'top';
      const from = Math.floor(-o / V.k / minor) * minor, to = (L - o) / V.k;
      g.beginPath();
      for (let mm = from; mm <= to; mm += minor) {
        const p = Math.round(o + mm * V.k) + 0.5, isMajor = Math.abs(mm % major) < 1e-9, t = isMajor ? T * 0.55 : (Math.abs(mm % (major / 2)) < 1e-9 ? T * 0.35 : T * 0.2);
        if (horiz) { g.moveTo(p, T); g.lineTo(p, T - t); } else { g.moveTo(T, p); g.lineTo(T - t, p); }
        if (isMajor) {
          const s = String(Math.round(mm));
          if (horiz) g.fillText(s, p + 3, 2);
          else { g.save(); g.translate(2, p + 3); g.rotate(Math.PI / 2); g.fillText(s, 0, -T + 4); g.restore(); }
        }
      }
      g.stroke();
      if (V.cursor) {
        const p = Math.round(horiz ? V.cursor.x : V.cursor.y) + 0.5;
        g.strokeStyle = acc; g.lineWidth = 1.5; g.beginPath();
        if (horiz) { g.moveTo(p, 0); g.lineTo(p, T); } else { g.moveTo(0, p); g.lineTo(T, p); }
        g.stroke();
      }
    }
  }

  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--bar-h', document.querySelector('.bar').offsetHeight + 'px');
    if (V.fitted) fit(); else drawRulers();
  }).observe(stage);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawRulers);
  matchMedia('(resolution: 1dppx)').addEventListener?.('change', drawRulers);

  /* ---------- PDF actions ---------- */
  async function openPdf() {
    const d = current(); if (!d || !d.result || !d.result.pdfBytes) return;
    const r = await desktop.openPdf(d.id);
    status(r.ok ? `Opened ${d.name.replace(/\.dxf$/i, '')}.pdf` : `Could not open the PDF: ${r.error}`, r.ok ? 'ok' : 'err');
  }
  async function savePdf() {
    const d = current(); if (!d || !d.result || !d.result.pdfBytes) return;
    const r = await desktop.savePdf(d.id);
    if (r.ok) { d.state = 'saved'; d.savedPath = r.path; renderQueue(); status('Saved ' + r.path, 'ok', r.path); }
    else if (!r.canceled) status('Could not save: ' + r.error, 'err');
  }
  const batchItems = () => S.docs.filter(d => !d.error).map(d => ({ id: d.id, hidden: [...d.hidden] }));
  async function saveAll() {
    const items = batchItems(); if (!items.length) return;
    status(`Saving ${items.length} PDFs`);
    const r = await desktop.saveAll(items, engineOpts(), opts.saveWhere);
    if (r.canceled) { status('Save cancelled'); return; }
    const ok = r.done.length, bad = r.failed.length;
    status(bad ? `Saved ${ok} PDFs; ${bad} could not be converted at these settings` : `Saved ${ok} PDFs`, bad ? 'err' : 'ok', r.done[0] && r.done[0].path);
  }
  async function combine() {
    const items = batchItems(); if (!items.length) return;
    status(`Combining ${items.length} drawings`);
    const r = await desktop.combine(items, engineOpts());
    if (r.canceled) { status('Cancelled'); return; }
    if (!r.ok) { status(r.error, 'err'); return; }
    status(r.skipped.length ? `Saved ${r.path}; left out ${r.skipped.join(', ')}` : `Saved ${r.path}`, r.skipped.length ? 'err' : 'ok', r.path);
  }
  desktop.onProgress(p => {
    const d = doc(p.id); if (!d) return;
    if (p.ok) { d.state = 'saved'; d.savedPath = p.path; }
    status(`Saving PDFs: ${p.done} of ${p.total}`);
    renderQueue();
  });

  /* ---------- opening files ---------- */
  async function pick(folder) {
    const r = await desktop.pick(folder);
    if (r.length) addResults(r, { autoOpen: true });
  }
  async function addPaths(paths, autoOpen = true) {
    if (!paths.length) return;
    status(paths.length > 1 ? `Opening ${paths.length} items` : 'Opening drawing');
    addResults(await desktop.addPaths(paths), { autoOpen });
  }
  desktop.onIncoming(paths => addPaths(paths));

  async function showRecent() {
    const list = await desktop.recent(), ul = $('recentList'); ul.innerHTML = '';
    $('recent').hidden = !list.length;
    for (const f of list) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.title = f.path;
      const n = document.createElement('b'); n.textContent = f.name;
      const s = document.createElement('small'); s.textContent = f.dir;
      b.append(n, s); b.onclick = () => addPaths([f.path]);
      li.append(b); ul.append(li);
    }
  }

  // drag and drop, anywhere in the window
  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('veil').hidden = false; });
  addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('veil').hidden = true; } });
  addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; $('veil').hidden = true;
    const paths = [...(e.dataTransfer ? e.dataTransfer.files : [])].map(f => desktop.pathForFile(f)).filter(Boolean);
    if (!paths.length) { $('dropErr').textContent = 'Those files could not be read. Use Choose drawings instead.'; return; }
    $('dropErr').textContent = '';
    addPaths(paths);
  });

  /* ---------- drawers on narrow windows ---------- */
  function closeDrawers() { app.classList.remove('files-open', 'out-open'); $('scrim').hidden = true; $('tFiles').setAttribute('aria-expanded', 'false'); $('tOut').setAttribute('aria-expanded', 'false'); }
  function toggleDrawer(cls, btn) {
    const open = !app.classList.contains(cls);
    closeDrawers();
    if (open) { app.classList.add(cls); $('scrim').hidden = false; btn.setAttribute('aria-expanded', 'true'); }
  }
  $('tFiles').onclick = () => toggleDrawer('files-open', $('tFiles'));
  $('tOut').onclick = () => toggleDrawer('out-open', $('tOut'));
  $('scrim').onclick = closeDrawers;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawers(); });

  /* ---------- wiring ---------- */
  $('bOpen').onclick = () => pick(false);
  $('bFolder').onclick = () => pick(true);
  $('bAdd').onclick = () => pick(false);
  $('pick').onclick = () => pick(false);
  $('pickFolder').onclick = () => pick(true);
  $('bOpenPdf').onclick = openPdf;
  $('bSave').onclick = savePdf;
  $('bSaveAll').onclick = saveAll;
  $('bCombine').onclick = combine;

  const rerender = () => convert({ fresh: true, delay: 60 });
  $('size').value = opts.size; $('size').onchange = () => { opts.size = $('size').value; persist(); rerender(); };
  $('units').value = opts.units; $('units').onchange = () => { opts.units = $('units').value; persist(); rerender(); };
  $('saveWhere').value = opts.saveWhere; $('saveWhere').onchange = () => { opts.saveWhere = $('saveWhere').value; persist(); };
  const numberInput = (id, key, min, max) => {
    const el = $(id); el.value = opts[key];
    el.onchange = () => { const v = Math.min(max, Math.max(min, parseFloat(el.value))); if (!isFinite(v)) { el.value = opts[key]; return; } el.value = opts[key] = v; persist(); rerender(); };
  };
  numberInput('margin', 'margin', 0, 40);
  numberInput('overlap', 'overlap', 0, 50);
  $('scale').value = opts.scale;
  $('scale').onchange = () => {
    const v = $('scale').value.trim().replace(/\s+/g, '');
    if (!/^\d*\.?\d+[:/]\d*\.?\d+$/.test(v)) { $('scale').value = opts.scale; status('Write the scale as 1:50 or 2:1', 'err'); return; }
    opts.scale = v.replace('/', ':'); $('scale').value = opts.scale; persist(); rerender();
  };
  $('autoOpen').checked = opts.autoOpen;
  $('autoOpen').onchange = () => { opts.autoOpen = $('autoOpen').checked; persist(); };

  seg('orient', 'orient', rerender);
  seg('ink', 'ink', () => convert());
  seg('theme', 'theme', applyTheme);
  seg('scaleMode', 'scaleMode', () => { $('out').dataset.scale = opts.scaleMode; rerender(); });
  $('out').dataset.scale = opts.scaleMode;

  desktop.onMenu(cmd => {
    ({
      open: () => pick(false), 'open-folder': () => pick(true), 'open-pdf': openPdf, save: savePdf,
      'save-all': saveAll, combine, close: () => S.sel && closeDoc(S.sel),
      fit, 'zoom-in': () => zoomAt(1.25), 'zoom-out': () => zoomAt(0.8), actual,
    }[cmd] || (() => {}))();
  });

  // reference zones along the empty-state sheet border
  (function zones() {
    const z = $('zones'), cols = 6, rows = 4; let h = '';
    for (let i = 0; i < cols; i++) { const l = ((i + 0.5) / cols * 100).toFixed(2) + '%'; h += `<span style="left:${l};top:11px">${i + 1}</span><span style="left:${l};bottom:0;transform:translate(-50%,-2px)">${i + 1}</span>`; }
    for (let j = 0; j < rows; j++) { const t = ((j + 0.5) / rows * 100).toFixed(2) + '%'; const L = 'ABCD'[j]; h += `<span style="top:${t};left:11px">${L}</span><span style="top:${t};right:0;transform:translate(-4px,-50%)">${L}</span>`; }
    z.innerHTML = h;
  })();

  applyTheme();
  showRecent();
  desktop.info().then(i => {
    if (i.text && !i.text.shaping) status('Bangla text support could not start; Bangla will print as “?”.', 'err');
    document.title = `DXF to PDF ${i.version}`;
  });
})();
