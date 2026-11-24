// Export settings: one validated object shared by the UI, presets, the main process and the command line.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.Models = root.Models || {}).settings = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const SIZES = ['A4', 'A3', 'A2', 'A1', 'A0', 'Letter', 'Legal', 'Tabloid'];
  const DEFAULTS = Object.freeze({
    size: 'A3', orient: 'auto', margin: 10, scaleMode: 'fit', scale: '1:100', units: 'auto', overlap: 10, ink: 'color',
    titleBlock: Object.freeze({ enabled: false, project: '', drawnBy: '', date: '', stamp: '' }),
  });
  const UI_DEFAULTS = Object.freeze({ autoOpen: true, theme: 'system', saveWhere: 'beside', showGrid: true, showRulers: true, showTiles: true });
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const num = (v, lo, hi, d) => { const n = parseFloat(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const txt = (v, n = 80) => String(v == null ? '' : v).slice(0, n);
  const scaleOk = v => /^\d*\.?\d+:\d*\.?\d+$/.test(String(v || ''));

  function normalize(s = {}) {
    const tb = s.titleBlock || {};
    return {
      size: pick(s.size, SIZES, DEFAULTS.size),
      orient: pick(s.orient, ['auto', 'landscape', 'portrait'], DEFAULTS.orient),
      margin: num(s.margin, 0, 40, DEFAULTS.margin),
      scaleMode: pick(s.scaleMode, ['fit', 'fixed'], DEFAULTS.scaleMode),
      scale: scaleOk(s.scale) ? String(s.scale) : DEFAULTS.scale,
      units: pick(s.units, ['auto', 'mm', 'cm', 'm', 'in', 'ft'], DEFAULTS.units),
      overlap: num(s.overlap, 0, 50, DEFAULTS.overlap),
      ink: pick(s.ink, ['color', 'black'], DEFAULTS.ink),
      titleBlock: { enabled: !!tb.enabled, project: txt(tb.project), drawnBy: txt(tb.drawnBy), date: txt(tb.date, 20), stamp: txt(tb.stamp, 30) },
    };
  }
  function normalizeUi(s = {}) {
    return {
      autoOpen: s.autoOpen !== false, theme: pick(s.theme, ['system', 'light', 'dark'], 'system'),
      saveWhere: pick(s.saveWhere, ['beside', 'folder'], 'beside'),
      showGrid: s.showGrid !== false, showRulers: s.showRulers !== false, showTiles: s.showTiles !== false,
    };
  }
  const today = () => new Date().toISOString().slice(0, 10);
  // what the converter receives
  function toEngine(s, layers) {
    const n = normalize(s);
    return {
      size: n.size, orient: n.orient, margin: n.margin, ink: n.ink, units: n.units, overlap: n.overlap,
      scale: n.scaleMode === 'fit' ? 'fit' : n.scale,
      titleBlock: n.titleBlock.enabled ? { ...n.titleBlock, date: n.titleBlock.date || today() } : null,
      layers: layers || undefined,
    };
  }
  // what a preset keeps: everything except the job-specific project name and date
  function forPreset(s) {
    const n = normalize(s);
    return { ...n, titleBlock: { enabled: n.titleBlock.enabled, drawnBy: n.titleBlock.drawnBy, stamp: n.titleBlock.stamp } };
  }
  // apply a preset on top of current settings, keeping project and date
  function applyPreset(current, preset) {
    const c = normalize(current), p = preset || {};
    return normalize({ ...c, ...p, titleBlock: { ...c.titleBlock, ...(p.titleBlock || {}), project: c.titleBlock.project, date: c.titleBlock.date } });
  }
  const same = (a, b) => JSON.stringify(forPreset(a)) === JSON.stringify(forPreset(b));
  return { SIZES, DEFAULTS, UI_DEFAULTS, normalize, normalizeUi, toEngine, forPreset, applyPreset, same, today };
});
