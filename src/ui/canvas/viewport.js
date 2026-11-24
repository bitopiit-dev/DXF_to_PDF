'use strict';
// The preview: zoom at the cursor, drag to pan, pinch on touch screens, keyboard control.
// V.k = screen px per paper mm; V.x/V.y = where paper (0,0) sits in the stage; V.kBase = size the SVG is laid out at.
(() => {
  const { $ } = App;
  const stage = $('stage'), paper = $('paper');
  const V = { k: 0, x: 0, y: 0, kBase: 0, w: 0, h: 0, svg: null, cursor: null, fitted: true };
  const CSS_PX_PER_MM = 96 / 25.4;

  function fit() {
    if (!V.w) return;
    const W = stage.clientWidth, H = stage.clientHeight, pad = Math.min(40, W * 0.05, H * 0.05);
    V.k = Math.max(0.01, Math.min((W - 2 * pad) / V.w, (H - 2 * pad) / V.h));
    V.x = (W - V.w * V.k) / 2; V.y = (H - V.h * V.k) / 2;
    V.fitted = true;
    commit();
  }
  function commit() {
    if (!V.svg) return;
    V.kBase = V.k;
    V.svg.style.width = V.w * V.k + 'px'; V.svg.style.height = V.h * V.k + 'px';
    place();
  }
  function place() {
    paper.style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.k / (V.kBase || V.k)})`;
    App.emit('view', V);
  }
  let commitTimer = null;
  function zoomAt(f, sx, sy) {
    if (!V.w) return;
    const fitK = Math.min(stage.clientWidth / V.w, stage.clientHeight / V.h);
    const k = Math.min(Math.max(V.k * f, fitK * 0.25), Math.max(fitK * 400, CSS_PX_PER_MM * 8));
    if (sx == null) { sx = stage.clientWidth / 2; sy = stage.clientHeight / 2; }
    V.x = sx - (sx - V.x) * k / V.k; V.y = sy - (sy - V.y) * k / V.k; V.k = k; V.fitted = false;
    place();
    clearTimeout(commitTimer); commitTimer = setTimeout(commit, 180); // re-lay the SVG once zooming pauses, so lines stay crisp
  }
  const actual = () => { if (V.w) zoomAt(CSS_PX_PER_MM / V.k); };
  const percent = () => Math.round(V.k / CSS_PX_PER_MM * 100);

  function load(svgMarkup, w, h, fresh) {
    paper.innerHTML = svgMarkup;
    V.svg = paper.firstElementChild; V.w = w; V.h = h;
    if (fresh || !V.k) fit(); else commit();
  }
  function clear() { paper.innerHTML = ''; V.svg = null; V.w = 0; App.emit('view', V); }

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    // mouse wheels and pinch zoom; two-finger trackpad scrolling pans
    const mouse = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || mouse) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * (e.deltaMode === 1 ? 33 : 1)), e.clientX - r.left, e.clientY - r.top);
    else { V.x -= e.deltaX; V.y -= e.deltaY; V.fitted = false; place(); }
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
    } else App.emit('view', V);
    readout();
  });
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) stage.classList.remove('panning'); };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', () => { V.cursor = null; App.emit('view', V); readout(); });
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
    e.preventDefault(); V.fitted = false; place();
  });

  // cursor position in drawing units, in the status bar
  function readout() {
    const r = App.current() && App.current().result, c = V.cursor, out = $('sCursor');
    if (!c || !r || !r.info || !V.w) { out.textContent = ''; return; }
    const mx = (c.x - V.x) / V.k, my = (c.y - V.y) / V.k, m = r.info.map;
    if (mx < 0 || my < 0 || mx > V.w || my > V.h) { out.textContent = ''; return; }
    const x = m.minx + (mx - m.ox) / m.s, y = m.maxy - (my - m.oy) / m.s;
    const f = v => Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2);
    out.textContent = `X ${f(x)}  Y ${f(y)} ${r.info.units}`;
  }

  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--bar-h', document.querySelector('.bar').offsetHeight + 'px');
    if (V.fitted) fit(); else App.emit('view', V);
  }).observe(stage);

  App.view = { V, fit, zoomAt, actual, commit, place, load, clear, percent };
})();
