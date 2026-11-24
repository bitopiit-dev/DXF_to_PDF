'use strict';
// DXF text -> sections, tables, blocks and entities (group codes kept raw)
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


module.exports = { parse, decode, unitMM, unitName, num, str, has, UNITS, UNIT_MM };
