'use strict';
// Shared state and helpers for the UI modules. Loaded first; every other file adds to window.App.
window.App = (() => {
  const Settings = window.Models.settings;
  const $ = id => document.getElementById(id);
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('opts') || '{}'); } catch { /* storage unavailable */ }
  const opts = { ...Settings.normalize(stored), ...Settings.normalizeUi(stored) };
  const persist = () => { try { localStorage.setItem('opts', JSON.stringify(opts)); } catch { /* ignore */ } };

  const S = { docs: [], sel: null, seq: 0, lastReveal: null };
  const doc = id => S.docs.find(d => d.id === id);
  const current = () => doc(S.sel);

  const listeners = {};
  const on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  const emit = (ev, arg) => (listeners[ev] || []).forEach(fn => fn(arg));

  function status(msg, cls, reveal) {
    const s = $('sMsg'); s.textContent = msg; s.className = cls || '';
    S.lastReveal = reveal || null; $('sReveal').hidden = !reveal;
  }
  const kb = n => n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const len = mm => mm >= 1000 ? +(mm / 1000).toPrecision(4) + ' m' : mm >= 100 ? Math.round(mm) + ' mm' : +mm.toPrecision(3) + ' mm';
  const engineOpts = d => {
    const e = Settings.toEngine(opts, d ? window.Models.layerOverrides.toEngine(d.overrides) : undefined);
    // garment patterns: the sizes hidden for this drawing, and whether each size gets its own pages
    if (d && d.garment) e.sizes = { hide: [...(d.hideSizes || [])], split: !!opts.splitSizes };
    return e;
  };

  // a setting changed in some panel: remember it, tell the other panels, convert again
  function changed({ delay = 60, fresh = true } = {}) { persist(); emit('settings'); App.convert({ fresh, delay }); }

  function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'dataset') Object.assign(e.dataset, v); else if (k in e) e[k] = v; else e.setAttribute(k, v); }
    for (const k of kids) if (k != null) e.append(k);
    return e;
  }

  return { $, el, opts, persist, S, doc, current, on, emit, status, kb, len, engineOpts, changed, Settings, desktop: window.desktop };
})();
