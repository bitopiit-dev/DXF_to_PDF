'use strict';
const { emWidth } = require('../text/metrics');
function extents(prims) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const add = (x, y) => { if (!isFinite(x) || !isFinite(y)) return; if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; };
  for (const p of prims) {
    if (p.k === 'p') p.pts.forEach(q => add(q[0], q[1]));
    else if (p.k === 'f') p.loops.forEach(l => l.forEach(q => add(q[0], q[1])));
    else if (p.k === 'h') p.clip.forEach(l => l.forEach(q => add(q[0], q[1])));
    else if (p.k === 'o') p.cmds.forEach(c => { for (let i = 1; i < c.length; i += 2) add(c[i], c[i + 1]); });
    else { const w = emWidth(p.s) * p.h / 0.72 * p.wf, ux = Math.cos(p.r), uy = Math.sin(p.r); const x0 = p.x - ux * w * p.ha / 2, y0 = p.y - uy * w * p.ha / 2; add(x0, y0); add(x0 + ux * w, y0 + uy * w); add(x0 - uy * p.h, y0 + ux * p.h); }
  }
  if (a === Infinity) return null;
  return { minx: a, miny: b, maxx: c, maxy: d };
}


module.exports = { extents };
