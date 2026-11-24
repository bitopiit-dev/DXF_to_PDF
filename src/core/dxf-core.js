/* ===== DXF core: parse → flatten → layout → SVG / PDF ===== */
const DXF = (() => {
  const TAU = Math.PI * 2, D2R = Math.PI / 180;

  function tokenize(text) {
    const lines = text.split(/\r\n|\r|\n/);
    const ents = []; let cur = null;
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = parseInt(lines[i].trim(), 10);
      if (isNaN(code)) continue;
      const raw = lines[i + 1];
      const val = (code === 1 || code === 3) ? raw.replace(/\s+$/, '') : raw.trim();
      if (code === 0) { cur = { type: val.toUpperCase(), g: [] }; ents.push(cur); }
      else if (cur) cur.g.push([code, val]);
    }
    return ents;
  }
  const num = (e, c, d = 0) => { for (const [k, v] of e.g) if (k === c) { const n = parseFloat(v); return isNaN(n) ? d : n; } return d; };
  const str = (e, c, d = '') => { for (const [k, v] of e.g) if (k === c) return v; return d; };
  const has = (e, c) => e.g.some(([k]) => k === c);

  function collect(toks, i, out) {
    const t = toks[i];
    if (t.type === 'POLYLINE') {
      t.vertices = []; i++;
      while (i < toks.length && toks[i].type === 'VERTEX') { t.vertices.push(toks[i]); i++; }
      if (i < toks.length && toks[i].type === 'SEQEND') i++;
      out.push(t); return i;
    }
    if (t.type === 'INSERT') {
      t.attribs = []; i++;
      while (i < toks.length && toks[i].type === 'ATTRIB') { t.attribs.push(toks[i]); i++; }
      if (i < toks.length && toks[i].type === 'SEQEND') i++;
      out.push(t); return i;
    }
    out.push(t); return i + 1;
  }

  function parse(text) {
    if (text.slice(0, 18) === 'AutoCAD Binary DXF') throw new Error('binary');
    const toks = tokenize(text);
    if (!toks.some(t => t.type === 'SECTION')) throw new Error('notdxf');
    const layers = {}, blocks = {}, entities = [], ltypes = {}, header = {};
    let section = null, cur = null, i = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (t.type === 'SECTION') {
        section = str(t, 2).toUpperCase();
        if (section === 'HEADER') for (let k = 0; k < t.g.length - 1; k++) if (t.g[k][0] === 9) header[t.g[k][1].toUpperCase()] = t.g[k + 1][1];
        i++; continue;
      }
      if (t.type === 'ENDSEC') { section = null; i++; continue; }
      if (t.type === 'EOF') break;
      if (section === 'TABLES') {
        if (t.type === 'LAYER' && has(t, 2)) {
          layers[str(t, 2)] = { color: num(t, 62, 7), tc: has(t, 420) ? num(t, 420) : null, flags: num(t, 70), lw: num(t, 370, -3), lt: str(t, 6, 'CONTINUOUS').toUpperCase(), plot: num(t, 290, 1) };
        }
        if (t.type === 'LTYPE' && has(t, 2)) {
          const el = []; for (const [c, v] of t.g) if (c === 49) el.push(parseFloat(v) || 0);
          ltypes[str(t, 2).toUpperCase()] = el;
        }
        i++; continue;
      }
      if (section === 'BLOCKS') {
        if (t.type === 'BLOCK') { cur = { name: str(t, 2), bx: num(t, 10), by: num(t, 20), ents: [] }; blocks[cur.name.toUpperCase()] = cur; i++; continue; }
        if (t.type === 'ENDBLK') { cur = null; i++; continue; }
        if (cur) { i = collect(toks, i, cur.ents); continue; }
        i++; continue;
      }
      if (section === 'ENTITIES') { i = collect(toks, i, entities); continue; }
      i++;
    }
    const lts = parseFloat(header.$LTSCALE);
    const iu = parseInt(header.$INSUNITS, 10);
    return { layers, blocks, entities, ltypes, ltscale: isFinite(lts) && lts > 0 ? lts : 1, insunits: isFinite(iu) ? iu : 0 };
  }

  // $INSUNITS code -> millimetres per drawing unit (0 = unitless, treated as mm)
  const UNIT_MM = { 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 25.4e-6, 9: 0.0254, 10: 914.4, 13: 1e-3, 14: 100, 15: 10000 };
  const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
  function unitMM(dxf, override) {
    if (override && UNITS[override]) return UNITS[override];
    return UNIT_MM[dxf.insunits] || 1;
  }
  function unitName(dxf) {
    const mm = UNIT_MM[dxf.insunits];
    const hit = Object.entries(UNITS).find(([, v]) => v === mm);
    return hit ? hit[0] : null;
  }

  // bytes -> text: UTF-8 when valid, otherwise the Windows ANSI code page most CAD programs write
  function decode(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const text = new TextDecoder('utf-8').decode(u8);
    if (!text.includes('\uFFFD')) return text;
    try { return new TextDecoder('windows-1252').decode(u8); } catch (e) { return text; }
  }

  /* ---------- colors ---------- */
  function hsv(h, s, v) {
    const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return rgbHex(f(5) * 255, f(3) * 255, f(1) * 255);
  }
  const rgbHex = (r, g, b) => '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
  const intHex = n => rgbHex((n >> 16) & 255, (n >> 8) & 255, n & 255);
  function aci(i) {
    const base = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#000000', 8: '#808080', 9: '#c0c0c0' };
    if (base[i]) return base[i];
    if (i >= 250 && i <= 255) { const g = [51, 91, 132, 173, 214, 255][i - 250]; return rgbHex(g, g, g); }
    if (i >= 10 && i < 250) {
      const sub = i % 10;
      return hsv((Math.floor(i / 10) - 1) * 15, sub % 2 ? 0.5 : 1, [1, 1, .8, .8, .6, .6, .5, .5, .3, .3][sub]);
    }
    return '#000000';
  }

  /* ---------- geometry ---------- */
  const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  const tp = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
  const T = (x, y) => [1, 0, 0, 1, x, y], S = (x, y) => [x, 0, 0, y, 0, 0];
  const R = a => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
  const MIRX = [-1, 0, 0, 1, 0, 0];

  let TOL = 0; // chord tolerance in drawing units (0 = coarse pass)
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

  /* ---------- text ---------- */
  function specials(s) {
    return s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
      .replace(/%%[uUoOkK]/g, '').replace(/%%%/g, '%');
  }
  function cleanMText(s) {
    s = s.replace(/\\\\/g, '\u0003').replace(/\\\{/g, '\u0001').replace(/\\\}/g, '\u0002');
    s = s.replace(/\\P/g, '\n').replace(/\\~/g, ' ');
    s = s.replace(/\\S([^;]*?)[\^/#]([^;]*?);/g, '$1/$2');
    s = s.replace(/\\[ACcFfHhQqTtWwp][^;]*;/g, '');
    s = s.replace(/\\[LlOoKkNX]/g, '');
    s = s.replace(/[{}]/g, '').replace(/\u0001/g, '{').replace(/\u0002/g, '}').replace(/\u0003/g, '\\');
    return specials(s);
  }

  /* ---------- flatten to world primitives ---------- */
  let MEASURE = s => s.length * 0.6; // em-width of a Latin string in Helvetica; replaced by real font metrics
  function setMeasure(f) { MEASURE = f; }

  // Text outside Latin-1 (Bangla, Greek, Cyrillic, symbols…) cannot use the PDF's built-in Helvetica.
  // A shaper turns it into glyph outlines: shape(s) -> { adv, glyphs: [{ x, y, cmds }] } in em units, y up.
  let SHAPER = null;
  function setShaper(f) { SHAPER = f; }
  const needsShaping = s => /[^\x20-\x7E\xA0-\xFF]/.test(s);
  const emWidth = s => (SHAPER && needsShaping(s) ? SHAPER.shape(s).adv : MEASURE(s));

  function flatten(dxf, hidden, tol) {
    TOL = tol || 0;
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
          if (SHAPER && needsShaping(ln)) {
            // outline the shaped glyphs so Bangla conjuncts and vowel signs print exactly as in CAD
            const sh = SHAPER.shape(ln), em = H / 0.72, x0 = -sh.adv * em * w1 * ha / 2;
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
          if (b) {
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
        case 'POINT': case 'ATTDEF': case 'VIEWPORT': case 'XLINE': case 'RAY': break;
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

  /* ---------- extents & page plan ---------- */
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

  const SIZES = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] };
  const rowName = r => { let n = ''; r++; while (r > 0) { const m = (r - 1) % 26; n = String.fromCharCode(65 + m) + n; r = Math.floor((r - 1) / 26); } return n; };

  // Page plan. opts: size, orient (auto|landscape|portrait), ink (color|black), margin (mm),
  // scale ('fit' or N for 1:N), unitMM (mm per drawing unit), overlap (mm between tiles).
  // At a fixed scale a drawing larger than the page is split into tiles that overlap by `overlap` mm.
  function plan(prims, ext, opts) {
    const base = SIZES[opts.size] || SIZES.A4;
    const bw = (ext.maxx - ext.minx) || 1, bh = (ext.maxy - ext.miny) || 1;
    const mg = opts.margin != null ? Math.max(0, opts.margin) : 10;
    const fixed = typeof opts.scale === 'number' && isFinite(opts.scale) && opts.scale > 0;
    const unit = opts.unitMM > 0 ? opts.unitMM : 1;
    function layout(land) {
      const pw = land ? base[1] : base[0], ph = land ? base[0] : base[1], uw = pw - 2 * mg, uh = ph - 2 * mg;
      if (!fixed) { const s = Math.min(uw / bw, uh / bh); return { pw, ph, uw, uh, s, cols: 1, rows: 1, W: bw * s, H: bh * s, ov: 0 }; }
      const s = unit / opts.scale, W = bw * s, H = bh * s;
      const ov = Math.max(0, Math.min(opts.overlap != null ? opts.overlap : 10, uw / 3, uh / 3));
      const cols = W <= uw + 1e-6 ? 1 : Math.ceil((W - ov) / (uw - ov));
      const rows = H <= uh + 1e-6 ? 1 : Math.ceil((H - ov) / (uh - ov));
      return { pw, ph, uw, uh, s, cols, rows, W, H, ov };
    }
    let L;
    if (opts.orient === 'landscape') L = layout(true);
    else if (opts.orient === 'portrait') L = layout(false);
    else {
      const a = layout(true), b = layout(false), na = a.cols * a.rows, nb = b.cols * b.rows;
      L = !fixed || na === nb ? (bw > bh ? a : b) : (na < nb ? a : b); // fewest sheets, then follow the drawing's shape
    }
    const { pw, ph, uw, uh, s, cols, rows, W, H, ov } = L;
    const stepX = uw - ov, stepY = uh - ov;
    const coverW = cols === 1 ? uw : cols * stepX + ov, coverH = rows === 1 ? uh : rows * stepY + ov;
    const ox = mg + (coverW - W) / 2, oy = mg + (coverH - H) / 2;
    const X = x => ox + (x - ext.minx) * s, Y = y => oy + (ext.maxy - y) * s;
    const ink = c => opts.ink === 'black' ? '#000000' : c;
    const pages = [], sheetCount = cols * rows;
    if (sheetCount <= 10000) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      pages.push({ dx: c * stepX, dy: r * stepY, row: r, col: c, label: cols * rows > 1 ? rowName(r) + (c + 1) : '' });
    }
    return {
      pw, ph, s, mg, uw, uh, ov, X, Y, ink, prims, pages, sheetCount, cols, rows, fixed, fitN: unit / Math.min(uw / bw, uh / bh),
      scaleN: fixed ? opts.scale : unit / s, unitMM: unit,
      posterW: coverW + 2 * mg, posterH: coverH + 2 * mg, drawW: W, drawH: H,
      ox, oy, ext,
    };
  }

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

  // One SVG of the whole output. A tiled plan shows every sheet's printable area as an outlined, labelled tile.
  function toSVG(P) {
    const VW = P.posterW, VH = P.posterH;
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f2(VW)} ${f2(VH)}" width="${f2(VW)}mm" height="${f2(VH)}mm"><rect width="100%" height="100%" fill="#fff"/>`;
    const pt = q => f2(P.X(q[0])) + ' ' + f2(P.Y(q[1]));
    let cid = 0;
    for (const p of P.prims) {
      if (p.k === 'f') o += `<path d="${p.loops.map(l => 'M' + l.map(pt).join('L') + 'Z').join('')}" fill="${P.ink(p.c)}" fill-opacity="${p.op}" fill-rule="evenodd"/>`;
      else if (p.k === 'h') {
        const id = 'hc' + (cid++), d = dashArr(p.dash, P.s);
        o += `<clipPath id="${id}"><path clip-rule="evenodd" d="${p.clip.map(l => 'M' + l.map(pt).join('L') + 'Z').join('')}"/></clipPath>`;
        o += `<path clip-path="url(#${id})" fill="none" stroke="${P.ink(p.c)}" stroke-width="${p.lw}" stroke-linecap="${d ? 'butt' : 'round'}"${d ? ` stroke-dasharray="${d.join(' ')}"` : ''} d="${p.segs.map(s => 'M' + pt([s[0], s[1]]) + 'L' + pt([s[2], s[3]])).join('')}"/>`;
      }
    }
    o += '<g fill="none" stroke-linecap="round" stroke-linejoin="round">';
    for (const g of groups(P)) {
      const d = g.items.map(p => 'M' + p.pts.map(pt).join('L') + (p.closed ? 'Z' : '')).join('');
      o += `<path d="${d}" stroke="${g.c}" stroke-width="${g.lw}"${g.d ? ' stroke-linecap="butt"' : ''}${g.d ? ` stroke-dasharray="${g.d.join(' ')}"` : ''}/>`;
    }
    o += '</g>';
    for (const [c, items] of outlineGroups(P)) {
      const d = items.map(p => p.cmds.map(k => k[0] + (k.length > 1 ? k.slice(1).map((v, i) => f2(i % 2 ? P.Y(v) : P.X(v))).join(' ') : '')).join('')).join('');
      o += `<path d="${d}" fill="${c}"/>`;
    }
    o += '<g font-family="Helvetica, Arial, sans-serif">';
    for (const t of P.prims) if (t.k === 't') {
      const x = f2(P.X(t.x)), y = f2(P.Y(t.y)), deg = f2(-t.r / D2R);
      o += `<text transform="translate(${x} ${y})${deg !== '0' ? ` rotate(${deg})` : ''}${t.wf !== 1 ? ` scale(${f2(t.wf)} 1)` : ''}" font-size="${f2(t.h * P.s / 0.72)}" fill="${P.ink(t.c)}" text-anchor="${['start', 'middle', 'end'][t.ha] || 'start'}" xml:space="preserve">${esc(t.s)}</text>`;
    }
    o += '</g>';
    if (P.pages.length > 1) {
      o += '<g class="tiles" fill="none">';
      for (const pg of P.pages) {
        const x = pg.dx + P.mg, y = pg.dy + P.mg;
        const fs = Math.min(P.uw, P.uh) * 0.16;
        o += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(P.uw)}" height="${f2(P.uh)}"/><text x="${f2(x + fs * 0.35)}" y="${f2(y + fs * 1.05)}" font-size="${f2(fs)}">${pg.label}</text>`;
      }
      o += '</g>';
    }
    return o + '</svg>';
  }

  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const pdfSafe = s => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

  function drawPage(doc, P, pg, idx) {
    const dx = pg.dx, dy = pg.dy, tiled = P.pages.length > 1;
    const X = x => P.X(x) - dx, Y = y => P.Y(y) - dy;
    const mv = q => doc.moveTo(X(q[0]), Y(q[1])), ln = q => doc.lineTo(X(q[0]), Y(q[1]));
    doc.setLineCap('round'); doc.setLineJoin('round');
    if (tiled) {
      doc.saveGraphicsState();
      doc.moveTo(P.mg, P.mg); doc.lineTo(P.mg + P.uw, P.mg); doc.lineTo(P.mg + P.uw, P.mg + P.uh); doc.lineTo(P.mg, P.mg + P.uh); doc.close();
      doc.clip(); doc.discardPath();
    }
    for (const p of P.prims) {
      if (p.k === 'f') {
        doc.setFillColor(...hexRGB(P.ink(p.c)));
        if (p.op < 1) doc.setGState(new doc.GState({ opacity: p.op }));
        for (const l of p.loops) { l.forEach((q, i) => i ? ln(q) : mv(q)); doc.close(); }
        doc.fillEvenOdd();
        if (p.op < 1) doc.setGState(new doc.GState({ opacity: 1 }));
      } else if (p.k === 'h') {
        doc.saveGraphicsState();
        for (const l of p.clip) { l.forEach((q, i) => i ? ln(q) : mv(q)); doc.close(); }
        doc.clipEvenOdd(); doc.discardPath();
        doc.setDrawColor(...hexRGB(P.ink(p.c))); doc.setLineWidth(p.lw);
        const d = dashArr(p.dash, P.s); doc.setLineDashPattern(d || [], 0); doc.setLineCap(d ? 'butt' : 'round');
        for (const s of p.segs) { mv([s[0], s[1]]); ln([s[2], s[3]]); }
        doc.stroke();
        doc.restoreGraphicsState();
      }
    }
    for (const g of groups(P)) {
      doc.setDrawColor(...hexRGB(g.c)); doc.setLineWidth(g.lw); doc.setLineDashPattern(g.d || [], 0); doc.setLineCap(g.d ? 'butt' : 'round');
      for (const p of g.items) { p.pts.forEach((q, i) => i ? ln(q) : mv(q)); if (p.closed) doc.close(); doc.stroke(); }
    }
    doc.setLineDashPattern([], 0);
    for (const [c, items] of outlineGroups(P)) {
      doc.setFillColor(...hexRGB(c));
      for (const p of items) {
        for (const k of p.cmds) {
          if (k[0] === 'M') doc.moveTo(X(k[1]), Y(k[2]));
          else if (k[0] === 'L') doc.lineTo(X(k[1]), Y(k[2]));
          else if (k[0] === 'C') doc.curveTo(X(k[1]), Y(k[2]), X(k[3]), Y(k[4]), X(k[5]), Y(k[6]));
          else doc.close();
        }
        doc.fill();
      }
    }
    doc.setFont('helvetica', 'normal');
    for (const t of P.prims) if (t.k === 't') {
      const pt = (t.h * P.s / 0.72) / 0.352778;
      if (pt < 0.3) continue;
      doc.setFontSize(pt); doc.setTextColor(...hexRGB(P.ink(t.c)));
      const s = pdfSafe(t.s), w = doc.getTextWidth(s) * t.wf;
      let x = X(t.x), y = Y(t.y);
      const sh = w * t.ha / 2; x -= Math.cos(t.r) * sh; y += Math.sin(t.r) * sh;
      const o = { angle: t.r / D2R, baseline: 'alphabetic' }; if (t.wf !== 1) o.horizontalScale = t.wf;
      doc.text(s, x, y, o);
    }
    if (tiled) doc.restoreGraphicsState();
    if (P.fixed || tiled) sheetMarks(doc, P, pg, idx);
  }

  // Printing at a true scale: cut line, overlap guides, neighbour labels and a scale bar to check the printer
  function sheetMarks(doc, P, pg, idx) {
    const { mg, uw, uh, pw, ph } = P, tiled = P.pages.length > 1, grey = [120, 130, 140];
    const fs = Math.max(5, Math.min(8, mg * 0.9 / 0.352778 * 0.45));
    doc.setDrawColor(...grey); doc.setTextColor(...grey); doc.setLineCap('butt'); doc.setFontSize(fs);
    if (tiled) {
      doc.setLineWidth(0.15); doc.rect(mg, mg, uw, uh);
      doc.setLineDashPattern([2, 1.5], 0);
      if (pg.col < P.cols - 1) doc.line(mg + uw - P.ov, mg, mg + uw - P.ov, mg + uh);
      if (pg.row < P.rows - 1) doc.line(mg, mg + uh - P.ov, mg + uw, mg + uh - P.ov);
      doc.setLineDashPattern([], 0);
      const at = (r, c) => (r >= 0 && c >= 0 && r < P.rows && c < P.cols) ? rowName(r) + (c + 1) : null;
      const n = { top: at(pg.row - 1, pg.col), bottom: at(pg.row + 1, pg.col), left: at(pg.row, pg.col - 1), right: at(pg.row, pg.col + 1) };
      const mid = mg / 2 + fs * 0.352778 / 3;
      if (n.top) doc.text(n.top, pw / 2, mid, { align: 'center' });
      if (n.bottom) doc.text(n.bottom, pw / 2, ph - mg / 2 + fs * 0.352778 / 3, { align: 'center' });
      if (n.left) doc.text(n.left, mg / 2, ph / 2, { angle: 90, align: 'center' });
      if (n.right) doc.text(n.right, pw - mg / 2, ph / 2, { angle: -90, align: 'center' });
      doc.text(`${pg.label}   sheet ${idx + 1} of ${P.pages.length}   ${fmtScale(P.scaleN)}`, mg, mid);
    }
    if (P.fixed && mg >= 5) {
      const len = Math.min(50, Math.floor((pw - 2 * mg) / 3 / 10) * 10 || 10), y = ph - mg / 2, x0 = pw - mg - len;
      doc.setLineWidth(0.2); doc.line(x0, y, x0 + len, y);
      for (let k = 0; k <= len; k += 10) doc.line(x0 + k, y - (k % 50 ? 0.8 : 1.4), x0 + k, y);
      doc.text(`${len} mm at ${fmtScale(P.scaleN)}`, x0 - 2, y + fs * 0.352778 / 3, { align: 'right' });
    }
    doc.setLineCap('round');
  }

  // Adds every sheet of plan P to `doc` (created on the first sheet when null) and returns it.
  function toPDF(P, jsPDF, title, doc) {
    P.pages.forEach((pg, i) => {
      const fmt = [Math.min(P.pw, P.ph), Math.max(P.pw, P.ph)], orientation = P.pw > P.ph ? 'landscape' : 'portrait';
      if (!doc) {
        doc = new jsPDF({ orientation, unit: 'mm', format: fmt, compress: true, floatPrecision: 4 });
        doc.setProperties({ title: title || 'Drawing', creator: 'DXF to PDF by K/Arifur Rahman' });
      } else doc.addPage(fmt, orientation);
      drawPage(doc, P, pg, i);
    });
    return doc;
  }

  // two passes: coarse to find the drawing size, then curves refined to ~2 millionths of its diagonal
  function build(dxf, hidden) {
    const f0 = flatten(dxf, hidden, 0), e0 = extents(f0.prims);
    if (!e0) return { f: f0, ext: null };
    const tol = Math.hypot(e0.maxx - e0.minx, e0.maxy - e0.miny) * 2e-6;
    const f = flatten(dxf, hidden, tol);
    return { f, ext: extents(f.prims) };
  }

  return { layerHex: L => L.tc != null ? intHex(L.tc) : aci(Math.abs(L.color) || 7), fmtScale, parse, decode, flatten, build, extents, plan, toSVG, toPDF, setMeasure, setShaper, needsShaping, unitMM, unitName, SIZES, UNITS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DXF;
else if (typeof globalThis !== 'undefined') globalThis.DXF = DXF;
