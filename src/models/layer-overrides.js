// Per-layer overrides chosen in the Layers panel: colour and a line-weight multiplier.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else (root.Models = root.Models || {}).layerOverrides = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const LW_STEPS = [0.25, 0.5, 1, 1.5, 2, 3];
  const hex = v => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : null);
  // only layers that differ from the drawing reach the converter
  function toEngine(map) {
    const out = {};
    for (const [name, o] of Object.entries(map || {})) {
      const color = hex(o.color), lw = LW_STEPS.includes(+o.lw) && +o.lw !== 1 ? +o.lw : null;
      if (color || lw) out[name] = { ...(color ? { color } : {}), ...(lw ? { lw } : {}) };
    }
    return Object.keys(out).length ? out : undefined;
  }
  const count = map => Object.keys(toEngine(map) || {}).length;
  return { LW_STEPS, toEngine, count };
});
