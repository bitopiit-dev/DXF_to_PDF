'use strict';
const TAU = Math.PI * 2, D2R = Math.PI / 180;
/* ---------- geometry ---------- */
const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
const tp = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
const T = (x, y) => [1, 0, 0, 1, x, y], S = (x, y) => [x, 0, 0, y, 0, 0];
const R = a => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const MIRX = [-1, 0, 0, 1, 0, 0];

let TOL = 0; // chord tolerance in drawing units (0 = coarse pass)
const setTol = t => { TOL = t || 0; };
function arcPts(cx, cy, r, a1, sweep, rx, rot) {
  const ry = r, out = [];
  rx = rx == null ? r : rx;
  const R = Math.max(Math.abs(rx), Math.abs(ry));
  let n;
  if (TOL > 0 && R > TOL) n = Math.ceil(Math.abs(sweep) / (2 * Math.acos(1 - TOL / R)));
  else n = Math.ceil(Math.abs(sweep) / TAU * 72);
  n = Math.min(4096, Math.max(Math.ceil(Math.abs(sweep) / TAU * 32), 4, n));
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  for (let k = 0; k <= n; k++) {
    const a = a1 + sweep * k / n, x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}
function bulgeSeg(p1, p2, b, out) {
  if (!b) { out.push(p2); return; }
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], d = Math.hypot(dx, dy);
  if (d === 0) return;
  const f = (1 - b * b) / (4 * b);
  const cx = (p1[0] + p2[0]) / 2 - dy * f, cy = (p1[1] + p2[1]) / 2 + dx * f;
  const r = Math.hypot(p1[0] - cx, p1[1] - cy);
  const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
  const pts = arcPts(cx, cy, r, a1, 4 * Math.atan(b));
  for (let k = 1; k < pts.length; k++) out.push(pts[k]);
}
function bulgePoly(verts, closed) {
  if (!verts.length) return [];
  const out = [[verts[0].x, verts[0].y]];
  const n = verts.length;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const a = verts[k], b = verts[(k + 1) % n];
    bulgeSeg([a.x, a.y], [b.x, b.y], a.b || 0, out);
  }
  return out;
}
function spline(deg, ctrl, knots, w, nSeg) {
  if (ctrl.length < 2) return ctrl;
  if (knots.length !== ctrl.length + deg + 1 || deg < 1) return ctrl;
  const lo = knots[deg], hi = knots[knots.length - 1 - deg], out = [];
  if (!(hi > lo)) return ctrl;
  if (TOL > 0) nSeg = Math.min(4000, nSeg * 4);
  for (let i = 0; i <= nSeg; i++) {
    let t = lo + (hi - lo) * i / nSeg; if (i === nSeg) t = hi - (hi - lo) * 1e-9;
    let k = deg; while (k < ctrl.length - 1 && t >= knots[k + 1]) k++;
    const d = [];
    for (let j = 0; j <= deg; j++) { const p = ctrl[j + k - deg], ww = w ? (w[j + k - deg] || 1) : 1; d.push([p[0] * ww, p[1] * ww, ww]); }
    for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
      const den = knots[j + 1 + k - r] - knots[j + k - deg];
      const a = den ? (t - knots[j + k - deg]) / den : 0;
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1], (1 - a) * d[j - 1][2] + a * d[j][2]];
    }
    out.push([d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]]);
  }
  return out;
}

function catmull(p) {
  if (p.length < 3) return p;
  const out = [p[0]];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(p.length - 1, i + 2)];
    const ns = TOL > 0 ? 48 : 12;
    for (let k = 1; k <= ns; k++) {
      const t = k / ns, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3)));
    }
  }
  return out;
}


module.exports = { TAU, D2R, mul, tp, T, S, R, MIRX, arcPts, bulgeSeg, bulgePoly, spline, catmull, setTol };
