'use strict';
// Parsed DXF -> world-space primitives: paths (p), fills (f), hatch lines (h), text (t), glyph outlines (o)
const { num, str, has } = require('./parser');
const { aci, intHex } = require('./colors');
const { TAU, D2R, mul, tp, T, S, R, MIRX, arcPts, bulgePoly, spline, catmull, setTol } = require('./geometry');
const { specials, cleanMText } = require('./mtext');
const { getShaper, needsShaping, emWidth } = require('../text/metrics');
const { extents } = require('../layout/extents');

function flatten(dxf, hidden, tol) {
  setTol(tol);
  const prims = [], used = {}, skipped = {};
  let paper = false;
  const ms = dxf.entities.filter(e => num(e, 67) !== 1);
  let top = ms;
  if (!ms.length) { top = dxf.entities; paper = true; }

  function colorOf(e, layer, byBlock) {
    if (has(e, 420)) return intHex(num(e, 420));
    const c = has(e, 62) ? num(e, 62) : 256;
    if (c === 0) return byBlock || '#000000';
    if (c > 0 && c < 256) return aci(c);
    const L = dxf.layers[layer];
    if (L) return L.tc != null ? intHex(L.tc) : aci(Math.abs(L.color) || 7);
    return '#000000';
  }

  function lwOf(e, layer, pLw) {
    let v = has(e, 370) ? num(e, 370) : -1;
    if (v === -2) return pLw != null ? pLw : 0.25;
    if (v === -1) { const L = dxf.layers[layer]; v = L ? L.lw : -3; }
    if (v === -3 || v < 0) return 0.25;
    return Math.max(0.05, v / 100);
  }
  function ltOf(e, layer, pLt) {
    let n = str(e, 6, 'BYLAYER').toUpperCase();
    if (n === 'BYBLOCK') return pLt || null;
    if (n === 'BYLAYER') { const L = dxf.layers[layer]; n = L ? L.lt : 'CONTINUOUS'; }
    const p = dxf.ltypes[n];
    return p && p.length && p.some(v => v !== 0) ? p : null;
  }

  function emit(e, m, pLayer, pColor, depth, pLw, pLt, pLs) {
    if (depth > 16) return;
    let layer = str(e, 8, '0');
    if (layer === '0' && pLayer != null) layer = pLayer;
    if (hidden.has(layer)) return;
    if (num(e, 60) === 1) return;
    const col = colorOf(e, layer, pColor);
    const lw = lwOf(e, layer, pLw);
    const ltRaw = ltOf(e, layer, pLt);
    const mscale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    const lts = dxf.ltscale * num(e, 48, 1) * (str(e, 6, '').toUpperCase() === 'BYBLOCK' && pLs ? pLs : mscale);
    const dash = ltRaw ? ltRaw.map(v => v * lts) : null;
    const ocs = num(e, 230, 1) < 0 ? mul(m, MIRX) : m;
    const path = (pts, closed, mm) => { if (pts.length >= 2) prims.push({ k: 'p', pts: pts.map(p => tp(mm, p[0], p[1])), closed: !!closed, c: col, lw, dash, layer }); };
    const fill = (loops, mm, op) => { const L = loops.filter(l => l.length > 2).map(l => l.map(p => tp(mm, p[0], p[1]))); if (L.length) prims.push({ k: 'f', loops: L, c: col, op: op || 1, layer }); };
    const text = (s, x, y, h, rot, ha, va, mm, wf, wrapW) => {
      let lines = s.split('\n');
      if (wrapW > 0) {
        const out = [];
        for (const ln of lines) {
          const words = ln.split(' '); let cur = '';
          for (const w of words) {
            const t = cur ? cur + ' ' + w : w;
            if (cur && emWidth(t) * h / 0.72 * (wf || 1) > wrapW * 1.001) { out.push(cur); cur = w; } else cur = t;
          }
          out.push(cur);
        }
        lines = out;
      }
      const [px, py] = tp(mm, x, y);
      const sc = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2])) || 1;
      const r = rot + Math.atan2(mm[1], mm[0]);
      const H = h * sc, gap = H * 1.66, tot = H + gap * (lines.length - 1);
      // va: 0 baseline, 1 bottom, 2 middle, 3 top  -> offset of first baseline along "up"
      let off = va === 3 ? -H : va === 2 ? (lines.length > 1 ? tot / 2 - H : -H / 2) : va === 1 ? (lines.length > 1 ? tot - H : H * 0.3) : 0;
      const ux = Math.cos(r), uy = Math.sin(r), vx = -uy, vy = ux;
      lines.forEach((ln, i) => {
        if (!ln.trim()) return;
        const o = off - i * gap, bx = px + vx * o, by = py + vy * o, w1 = wf || 1;
        if (getShaper() && needsShaping(ln)) {
          // outline the shaped glyphs so Bangla conjuncts and vowel signs print exactly as in CAD
          const sh = getShaper().shape(ln), em = H / 0.72, x0 = -sh.adv * em * w1 * ha / 2;
          const W = (gx, gy) => { const u = x0 + gx * em * w1, v = gy * em; return [bx + ux * u + vx * v, by + uy * u + vy * v]; };
          const cmds = [];
          for (const g of sh.glyphs) {
            let cur = null, start = null;
            for (const c of g.cmds) {
              const v = c.values;
              if (c.type === 'M') { cur = start = W(g.x + v[0], g.y + v[1]); cmds.push(['M', ...cur]); }
              else if (c.type === 'L') { cur = W(g.x + v[0], g.y + v[1]); cmds.push(['L', ...cur]); }
              else if (c.type === 'Q') {
                const q = W(g.x + v[0], g.y + v[1]), e = W(g.x + v[2], g.y + v[3]);
                cmds.push(['C', cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1]), e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1]), ...e]); cur = e;
              } else if (c.type === 'C') {
                const a = W(g.x + v[0], g.y + v[1]), b = W(g.x + v[2], g.y + v[3]), e = W(g.x + v[4], g.y + v[5]);
                cmds.push(['C', ...a, ...b, ...e]); cur = e;
              } else if (c.type === 'Z') { cmds.push(['Z']); cur = start; }
            }
          }
          if (cmds.length) prims.push({ k: 'o', cmds, c: col, layer, s: ln });
          return;
        }
        prims.push({ k: 't', s: ln, x: bx, y: by, h: H, r, ha, c: col, layer, wf: w1 });
      });
    };
    used[e.type] = (used[e.type] || 0) + 1;

    switch (e.type) {
      case 'LINE': path([[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)]], false, m); break;
      case 'CIRCLE': path(arcPts(num(e, 10), num(e, 20), num(e, 40), 0, TAU), true, ocs); break;
      case 'ARC': {
        const a1 = num(e, 50) * D2R; let a2 = num(e, 51) * D2R; while (a2 <= a1) a2 += TAU;
        path(arcPts(num(e, 10), num(e, 20), num(e, 40), a1, a2 - a1), false, ocs); break;
      }
      case 'ELLIPSE': {
        const mx = num(e, 11), my = num(e, 21), ratio = num(e, 40, 1);
        let p1 = num(e, 41, 0), p2 = num(e, 42, TAU); while (p2 <= p1) p2 += TAU;
        const rx = Math.hypot(mx, my);
        const pts = arcPts(num(e, 10), num(e, 20), rx * ratio, p1, p2 - p1, rx, Math.atan2(my, mx));
        path(pts, Math.abs(p2 - p1 - TAU) < 1e-6, num(e, 230, 1) < 0 ? m : m); break;
      }
      case 'LWPOLYLINE': {
        const vs = []; for (const [c, v] of e.g) { if (c === 10) vs.push({ x: parseFloat(v), y: 0, b: 0 }); else if (c === 20 && vs.length) vs[vs.length - 1].y = parseFloat(v); else if (c === 42 && vs.length) vs[vs.length - 1].b = parseFloat(v); }
        const closed = num(e, 70) & 1;
        path(bulgePoly(vs, closed), closed, ocs); break;
      }
      case 'POLYLINE': {
        const f = num(e, 70), vs = e.vertices || [];
        if (f & 64) { // polyface mesh
          const loc = vs.filter(v => num(v, 70) & 64).map(v => [num(v, 10), num(v, 20)]);
          vs.filter(v => (num(v, 70) & 128) && !(num(v, 70) & 64)).forEach(v => {
            const idx = [71, 72, 73, 74].map(c => Math.abs(num(v, c))).filter(Boolean);
            path(idx.map(k => loc[k - 1]).filter(Boolean), true, m);
          });
        } else if (f & 16) { // polygon mesh: draw rows
          const M = num(e, 71), N = num(e, 72), pts = vs.map(v => [num(v, 10), num(v, 20)]);
          if (M && N) for (let r = 0; r < M; r++) path(pts.slice(r * N, r * N + N), f & 32, m);
        } else {
          const v2 = vs.filter(v => !(num(v, 70) & 16)).map(v => ({ x: num(v, 10), y: num(v, 20), b: num(v, 42) }));
          path(bulgePoly(v2, f & 1), f & 1, (f & 8) ? m : ocs);
        }
        break;
      }
      case 'SPLINE': {
        const ctrl = [], knots = [], w = [], fit = [];
        for (const [c, v] of e.g) {
          if (c === 10) ctrl.push([parseFloat(v), 0]); else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = parseFloat(v);
          else if (c === 11) fit.push([parseFloat(v), 0]); else if (c === 21 && fit.length) fit[fit.length - 1][1] = parseFloat(v);
          else if (c === 40) knots.push(parseFloat(v)); else if (c === 41) w.push(parseFloat(v));
        }
        const pts = ctrl.length ? spline(num(e, 71, 3), ctrl, knots, w.length === ctrl.length ? w : null, Math.max(48, ctrl.length * 10)) : catmull(fit);
        path(pts, num(e, 70) & 1, m); break;
      }
      case 'TEXT': case 'ATTRIB': {
        if (e.type === 'ATTRIB' && (num(e, 70) & 1)) break;
        const ha = num(e, 72), va = num(e, e.type === 'ATTRIB' ? 74 : 73);
        const aligned = (ha || va) && has(e, 11);
        const x = aligned ? num(e, 11) : num(e, 10), y = aligned ? num(e, 21) : num(e, 20);
        text(specials(str(e, 1)), x, y, num(e, 40, 1), num(e, 50) * D2R, ha === 4 ? 1 : (ha === 3 || ha === 5) ? 0 : Math.min(ha, 2), ha === 4 ? 2 : va, ocs, num(e, 41, 1));
        break;
      }
      case 'MTEXT': {
        let s = ''; for (const [c, v] of e.g) if (c === 3) s += v; s += str(e, 1);
        const att = num(e, 71, 1) || 1;
        let r = num(e, 50) * D2R; if (has(e, 11)) r = Math.atan2(num(e, 21), num(e, 11));
        text(cleanMText(s), num(e, 10), num(e, 20), num(e, 40, 1), r, (att - 1) % 3, [3, 2, 1][Math.floor((att - 1) / 3)], m, 1, num(e, 41));
        break;
      }
      case 'SOLID': case 'TRACE': {
        const p = [[10, 20], [11, 21], [13, 23], [12, 22]].map(([a, b]) => [num(e, a), num(e, b)]);
        fill([p], ocs); break;
      }
      case '3DFACE': path([[10, 20], [11, 21], [12, 22], [13, 23]].map(([a, b]) => [num(e, a), num(e, b)]), true, m); break;
      case 'LEADER': {
        const p = []; for (const [c, v] of e.g) { if (c === 10) p.push([parseFloat(v), 0]); else if (c === 20 && p.length) p[p.length - 1][1] = parseFloat(v); }
        path(p, false, m); break;
      }
      case 'INSERT': {
        const b = dxf.blocks[str(e, 2).toUpperCase()];
        // garment files: a whole piece (one size of it) can be hidden by its block name
        if (b && !hidden.has('\u0000block:' + str(e, 2).toUpperCase())) {
          const sx = num(e, 41, 1), sy = num(e, 42, 1), rot = num(e, 50) * D2R;
          const cols = Math.max(1, num(e, 70, 1)), rows = Math.max(1, num(e, 71, 1)), cs = num(e, 44), rs = num(e, 45);
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const M = mul(ocs, mul(T(num(e, 10), num(e, 20)), mul(R(rot), mul(T(c * cs, r * rs), mul(S(sx, sy), T(-b.bx, -b.by))))));
            for (const be of b.ents) emit(be, M, layer, col, depth + 1, lw, ltRaw, lts);
          }
        }
        for (const a of e.attribs || []) emit(a, m, pLayer, pColor, depth + 1, pLw, pLt, pLs);
        break;
      }
      case 'DIMENSION': {
        const b = dxf.blocks[str(e, 2).toUpperCase()];
        if (b) for (const be of b.ents) emit(be, m, layer, col, depth + 1, lw, ltRaw, lts);
        break;
      }
      case 'HATCH': {
        try {
          const H = hatchLoops(e);
          if (num(e, 70) === 1 || !H.fam.length) fill(H.loops, ocs, num(e, 70) === 1 ? 1 : 0.18);
          else {
            const lines = hatchLines(H.loops, H.fam);
            if (!lines) fill(H.loops, ocs, 0.18);
            else {
              const L = H.loops.map(l => l.map(p => tp(ocs, p[0], p[1])));
              for (const f of lines) prims.push({ k: 'h', clip: L, segs: f.segs.map(s => [...tp(ocs, s[0], s[1]), ...tp(ocs, s[2], s[3])]), dash: f.dash && f.dash.map(v => v * mscale), c: col, lw, layer });
            }
          }
        } catch (err) { skipped.HATCH = (skipped.HATCH || 0) + 1; }
        break;
      }
      case 'POINT': {
        // in garment patterns, points on the drill-hole layer are holes to mark; all other points stay invisible
        const dr = dxf.drillR;
        if (dr > 0 && (layer === '13' || /drill/i.test(layer))) {
          const x = num(e, 10), y = num(e, 20), k = dr * 1.6;
          path(arcPts(x, y, dr, 0, TAU), true, m);
          path([[x - k, y], [x + k, y]], false, m);
          path([[x, y - k], [x, y + k]], false, m);
        } else { used[e.type]--; }
        break;
      }
      case 'ATTDEF': case 'VIEWPORT': case 'XLINE': case 'RAY': break;
      default: used[e.type]--; skipped[e.type] = (skipped[e.type] || 0) + 1;
    }
  }

  for (const e of top) emit(e, [1, 0, 0, 1, 0, 0], null, null, 0, null, null, null);
  return { prims, used, skipped, paper };
}

function hatchLoops(e) {
  const g = e.g; let i = g.findIndex(([c]) => c === 91); if (i < 0) return [];
  const n = parseFloat(g[i][1]); i++;
  const rd = (code, d = 0) => { for (let j = i; j < Math.min(g.length, i + 6); j++) if (g[j][0] === code) { i = j + 1; return parseFloat(g[j][1]); } return d; };
  const peek = code => i < g.length && g[i][0] === code;
  const loops = [];
  for (let p = 0; p < n; p++) {
    const flags = rd(92);
    let pts = [];
    if (flags & 2) {
      const hb = rd(72), cl = rd(73), nv = rd(93), vs = [];
      for (let k = 0; k < nv; k++) { const x = rd(10), y = rd(20); const b = hb && peek(42) ? parseFloat(g[i++][1]) : 0; vs.push({ x, y, b }); }
      pts = bulgePoly(vs, true); void cl;
    } else {
      const ne = rd(93);
      for (let k = 0; k < ne; k++) {
        const t = rd(72);
        if (t === 1) { const a = [rd(10), rd(20)], b = [rd(11), rd(21)]; if (!pts.length) pts.push(a); pts.push(b); }
        else if (t === 2 || t === 3) {
          const cx = rd(10), cy = rd(20);
          let rx, r, rot = 0;
          if (t === 2) { r = rd(40); rx = r; } else { const mx = rd(11), my = rd(21); rx = Math.hypot(mx, my); r = rx * rd(40); rot = Math.atan2(my, mx); }
          const sa = rd(50), ea = rd(51), ccw = rd(73, 1);
          let sweep = ((ea - sa) % 360 + 360) % 360 || 360;
          const a1 = (ccw ? sa : -sa) * D2R;
          pts.push(...arcPts(cx, cy, r, a1, (ccw ? sweep : -sweep) * D2R, rx, rot));
        } else if (t === 4) {
          const deg = rd(94), rat = rd(73), nk = (rd(74), rd(95)), nc = rd(96), kn = [], ct = [], w = [];
          for (let q = 0; q < nk; q++) kn.push(rd(40));
          for (let q = 0; q < nc; q++) { ct.push([rd(10), rd(20)]); if (rat && peek(42)) w.push(parseFloat(g[i++][1])); }
          if (peek(97)) { const nf = rd(97); for (let q = 0; q < nf; q++) { rd(11); rd(21); } }
          if (peek(12)) { rd(12); rd(22); rd(13); rd(23); }
          pts.push(...spline(deg, ct, kn, w.length === nc ? w : null, Math.max(32, nc * 8)));
        }
      }
    }
    if (peek(97)) { const ns = rd(97); for (let k = 0; k < ns && peek(330); k++) i++; }
    if (pts.length > 2) loops.push(pts);
  }
  // pattern definition lines (already scaled/rotated in the file)
  const fam = [];
  const j = g.findIndex(([c], k) => k >= i && c === 78);
  if (j >= 0) {
    i = j; const nl = rd(78);
    for (let q = 0; q < nl; q++) {
      const a = rd(53) * D2R, bx = rd(43), by = rd(44), ox = rd(45), oy = rd(46), nd = rd(79), d = [];
      for (let k = 0; k < nd; k++) d.push(rd(49));
      fam.push({ a, bx, by, ox, oy, d });
    }
  }
  return { loops, fam };
}

function hatchLines(loops, fam) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  loops.forEach(l => l.forEach(p => { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }));
  if (!isFinite(a)) return null;
  const corners = [[a, b], [c, b], [a, d], [c, d]], out = []; let total = 0;
  for (const f of fam) {
    const ux = Math.cos(f.a), uy = Math.sin(f.a), nx = -uy, ny = ux;
    const sp = f.ox * nx + f.oy * ny, sh = f.ox * ux + f.oy * uy;
    if (Math.abs(sp) < 1e-9) continue;
    const ks = corners.map(p => ((p[0] - f.bx) * nx + (p[1] - f.by) * ny) / sp);
    const k0 = Math.floor(Math.min(...ks)), k1 = Math.ceil(Math.max(...ks));
    total += k1 - k0; if (total > 60000) return null;
    const plen = f.d.reduce((s, v) => s + Math.abs(v), 0);
    const segs = [];
    for (let k = k0; k <= k1; k++) {
      const px = f.bx + k * f.ox, py = f.by + k * f.oy;
      const ts = corners.map(p => (p[0] - px) * ux + (p[1] - py) * uy);
      let t0 = Math.min(...ts), t1 = Math.max(...ts);
      if (plen > 0) t0 = Math.floor(t0 / plen) * plen; // keep dash phase anchored to the pattern origin
      segs.push([px + ux * t0, py + uy * t0, px + ux * t1, py + uy * t1]);
    }
    void sh;
    out.push({ segs, dash: f.d.length && plen > 0 ? f.d : null });
  }
  return out.length ? out : null;
}

// two passes: coarse to find the drawing size, then curves refined to ~2 millionths of its diagonal
function build(dxf, hidden) {
  const f0 = flatten(dxf, hidden, 0), e0 = extents(f0.prims);
  if (!e0) return { f: f0, ext: null };
  const tol = Math.hypot(e0.maxx - e0.minx, e0.maxy - e0.miny) * 2e-6;
  const f = flatten(dxf, hidden, tol);
  return { f, ext: extents(f.prims) };
}

module.exports = { flatten, build, hatchLoops, hatchLines };
