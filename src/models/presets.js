// Built-in export presets. User presets are stored by the main process (src/main/store.js).
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.Models = root.Models || {}).presets = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const BUILTIN = Object.freeze([
    { name: 'A4 fit, black and white', settings: { size: 'A4', orient: 'auto', margin: 10, scaleMode: 'fit', ink: 'black', titleBlock: { enabled: false } } },
    { name: 'A3 1:50 engineering', settings: { size: 'A3', orient: 'landscape', margin: 10, scaleMode: 'fixed', scale: '1:50', ink: 'color', titleBlock: { enabled: true } } },
    { name: 'A1 1:100 plot', settings: { size: 'A1', orient: 'landscape', margin: 15, scaleMode: 'fixed', scale: '1:100', ink: 'color', titleBlock: { enabled: true } } },
    { name: 'A4 tiles 1:1 (full-size patterns)', settings: { size: 'A4', orient: 'auto', margin: 10, scaleMode: 'fixed', scale: '1:1', overlap: 10, ink: 'black', titleBlock: { enabled: false } } },
  ].map(p => Object.freeze({ ...p, builtin: true })));
  const isBuiltin = name => BUILTIN.some(p => p.name.toLowerCase() === String(name).trim().toLowerCase());
  const validName = name => {
    const n = String(name || '').trim();
    if (!n) return 'Give the preset a name.';
    if (n.length > 60) return 'Keep the name under 60 characters.';
    if (isBuiltin(n)) return 'That name belongs to a built-in preset.';
    return null;
  };
  const find = (all, name) => all.find(p => p.name.toLowerCase() === String(name).trim().toLowerCase());
  return { BUILTIN, isBuiltin, validName, find };
});
