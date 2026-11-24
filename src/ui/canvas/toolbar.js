'use strict';
// Floating toolbar over the preview: zoom, fit, and switches for the grid, rulers and sheet outlines.
(() => {
  const { $, opts, el, icon } = { ...App, icon: App.icon };
  const bar = $('toolbar'), viewer = $('viewer');
  const btn = (id, label, html, onClick, extra = {}) => {
    const b = el('button', { type: 'button', id, title: label, ...extra });
    b.setAttribute('aria-label', label); b.innerHTML = html; b.onclick = onClick; bar.append(b); return b;
  };
  const sep = () => bar.append(el('span', { className: 'sep' }));
  const toggles = [
    ['tGrid', 'showGrid', 'Grid', 'grid', 'no-grid'],
    ['tRulers', 'showRulers', 'Rulers', 'ruler', 'no-rulers'],
    ['tTiles', 'showTiles', 'Sheet outlines when a drawing is split across sheets', 'tiles', 'no-tiles'],
  ];
  function apply() {
    for (const [id, key, , , cls] of toggles) {
      viewer.classList.toggle(cls, !opts[key]);
      $(id).setAttribute('aria-pressed', String(opts[key]));
    }
    requestAnimationFrame(() => App.rulers.draw());
  }
  btn('zOut', 'Zoom out (Ctrl −)', icon('zoomOut'), () => App.view.zoomAt(0.8));
  btn('zPct', 'Actual size (Ctrl 1)', '100%', () => App.view.actual());
  btn('zIn', 'Zoom in (Ctrl +)', icon('zoomIn'), () => App.view.zoomAt(1.25));
  btn('zFit', 'Fit to window (Ctrl 0)', icon('fit'), () => App.view.fit());
  sep();
  for (const [id, key, label, ic] of toggles) {
    btn(id, label, icon(ic), () => { opts[key] = !opts[key]; App.persist(); apply(); });
  }
  App.on('view', V => { $('zPct').textContent = V.w ? App.view.percent() + '%' : '100%'; });
  apply();
})();
