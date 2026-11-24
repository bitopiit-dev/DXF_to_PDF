'use strict';
const f2 = n => (Math.round(n * 1000) / 1000).toString();
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtScale = n => n >= 1 ? '1:' + (n >= 100 ? Math.round(n) : +n.toPrecision(3)) : +(1 / n).toPrecision(3) + ':1';

// DXF dash pattern (drawing units, +dash -gap 0 dot) -> [on, off, ...] in page mm
function dashArr(p, s) {
  if (!p) return null;
  const out = [];
  for (const v of p) {
    const on = v >= 0, len = Math.abs(v) * s;
    if (!out.length) { if (!on) out.push(0); out.push(len); }
    else if ((out.length % 2 === 1) === on) out[out.length - 1] += len;
    else out.push(len);
  }
  if (out.length % 2) out.push(0);
  const tot = out.reduce((x, y) => x + y, 0);
  if (tot < 0.3 || !out.some((v, i) => i % 2 && v > 0)) return null; // too fine to print: draw solid, as CAD plotters do
  return out.map((v, i) => Math.round((i % 2 || v > 0 ? v : 0.15) * 1000) / 1000); // dots become short dashes
}

function groups(P) {
  if (P._groups) return P._groups;
  const G = new Map();
  for (const p of P.prims) if (p.k === 'p') {
    const c = P.ink(p.c), d = dashArr(p.dash, P.s), key = c + '|' + p.lw + '|' + (d ? d.join(',') : '');
    if (!G.has(key)) G.set(key, { c, lw: p.lw, d, items: [] });
    G.get(key).items.push(p);
  }
  return (P._groups = [...G.values()]);
}
function outlineGroups(P) {
  const G = new Map();
  for (const p of P.prims) if (p.k === 'o') { const c = P.ink(p.c); if (!G.has(c)) G.set(c, []); G.get(c).push(p); }
  return G;
}


module.exports = { f2, esc, fmtScale, dashArr, groups, outlineGroups };
