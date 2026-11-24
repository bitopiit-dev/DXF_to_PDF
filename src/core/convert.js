'use strict';
// Conversion service shared by the app's background worker, the command line and the tests.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const DXF = require('./dxf-core.js');
const { jsPDF } = require('jspdf');

const MAX_SHEETS = 400;
// In a packaged app HarfBuzz, its WebAssembly and the fonts sit outside the asar archive (see build.asarUnpack)
const PACKED = /app\.asar[\\/]/.test(__dirname);
const unpacked = p => p.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');
const HERE = PACKED ? unpacked(__dirname) : __dirname;
const HB_ENTRY = PACKED ? path.join(HERE, '..', '..', 'node_modules', 'harfbuzzjs', 'dist', 'index.mjs') : undefined;
let ready = null;

function init(opts = {}) {
  if (!ready) {
    ready = (async () => {
      const m = new jsPDF();
      m.setFont('helvetica', 'normal');
      DXF.setMeasure(s => m.getStringUnitWidth(s));
      try {
        const mod = await import(pathToFileURL(path.join(HERE, 'text-shaper.mjs')).href);
        const shaper = await mod.createShaper({ fontsDir: opts.fontsDir || path.join(HERE, 'fonts'), harfbuzzEntry: opts.harfbuzzEntry || HB_ENTRY });
        DXF.setShaper(shaper);
        return { shaping: true };
      } catch (e) {
        return { shaping: false, error: String(e && e.message || e) };
      }
    })();
  }
  return ready;
}

// the smallest common drawing scale at which the drawing still fits on one sheet
const SERIES = [1, 1.25, 1.5, 2, 2.5, 5, 7.5];
function standardScale(n) {
  if (!(n > 0)) return null;
  if (n <= 1) { for (const k of [50, 20, 10, 5, 2]) if (1 / k >= n * 0.9999) return k + ':1'; return '1:1'; }
  for (let mag = 1; mag < 1e9; mag *= 10) for (const b of SERIES) { const v = b * mag; if (v >= n * 0.9999) return '1:' + v; }
  return null;
}

// "fit", "1:50", "2:1", 50 -> 'fit' or N (1:N)
function parseScale(v) {
  if (v == null || v === '' || v === 'fit') return 'fit';
  if (typeof v === 'number') return v > 0 ? v : 'fit';
  const m = String(v).trim().match(/^(\d*\.?\d+)\s*[:/]\s*(\d*\.?\d+)$/);
  if (m) { const a = parseFloat(m[1]), b = parseFloat(m[2]); return a > 0 && b > 0 ? b / a : 'fit'; }
  const n = parseFloat(v);
  return n > 0 ? n : 'fit';
}

function open(buf) {
  const dxf = DXF.parse(DXF.decode(buf));
  const layers = Object.entries(dxf.layers)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([name, L]) => ({ name, color: DXF.layerHex(L), off: L.color < 0, frozen: !!(L.flags & 1), noPlot: L.plot === 0 }));
  const hidden = layers.filter(l => l.off || l.frozen || l.name.toLowerCase() === 'defpoints').map(l => l.name);
  return { dxf, layers, hidden, units: DXF.unitName(dxf) };
}

function prepare(dxf, hidden, opts) {
  const { f, ext } = DXF.build(dxf, hidden instanceof Set ? hidden : new Set(hidden || []));
  const objects = Object.values(f.used).reduce((a, b) => a + Math.max(0, b), 0);
  if (!ext) return { f, objects, empty: true };
  const units = opts.units && opts.units !== 'auto' ? opts.units : null;
  const unitMM = DXF.unitMM(dxf, units);
  const P = DXF.plan(f.prims, ext, { size: opts.size || 'A3', orient: opts.orient || 'auto', ink: opts.ink || 'color',
    margin: opts.margin != null ? +opts.margin : 10, overlap: opts.overlap != null ? +opts.overlap : 10,
    scale: parseScale(opts.scale), unitMM });
  return { f, ext, P, objects, unitMM, unitsGuessed: !units && !DXF.unitName(dxf) };
}

function describe(dxf, prep, opts) {
  const { f, P, objects } = prep;
  const notes = [];
  if (f.paper) notes.push('Model space was empty, so the layout (paper space) was used.');
  const sk = Object.entries(f.skipped).filter(([, n]) => n > 0);
  if (sk.length) notes.push('Not drawn: ' + sk.map(([k, n]) => `${k.toLowerCase()} (${n})`).join(', ') + '.');
  const shaped = f.prims.filter(p => p.k === 'o').length;
  if (shaped) notes.push(`${shaped} line${shaped > 1 ? 's' : ''} of Bangla or other non-Latin text drawn as vector outlines.`);
  if (f.prims.some(p => p.k === 't' && DXF.needsShaping(p.s))) notes.push('Some non-Latin text could not be shaped and prints as “?”.');
  if (P && P.fixed && prep.unitsGuessed) notes.push('The drawing does not say which units it uses, so millimetres are assumed. Pick the right units if the size looks wrong.');
  const info = P ? {
    sheets: P.sheetCount, fitScale: DXF.fmtScale(P.fitN), suggested: standardScale(P.fitN), cols: P.cols, rows: P.rows, pageW: P.pw, pageH: P.ph,
    scale: DXF.fmtScale(P.scaleN), fixed: P.fixed,
    realW: (prep.ext.maxx - prep.ext.minx) * prep.unitMM, realH: (prep.ext.maxy - prep.ext.miny) * prep.unitMM,
    size: opts.size || 'A3', landscape: P.pw > P.ph,
    posterW: P.posterW, posterH: P.posterH, units: opts.units && opts.units !== 'auto' ? opts.units : (DXF.unitName(dxf) || 'mm'),
    unitsGuessed: !!prep.unitsGuessed,
    // paper mm -> drawing units: x = minx + (mmX - ox) / s, y = maxy - (mmY - oy) / s
    map: { ox: P.ox, oy: P.oy, s: P.s, minx: prep.ext.minx, maxy: prep.ext.maxy },
  } : null;
  return { objects, notes, info };
}

// Renders one drawing. Returns { svg, pdf (ArrayBuffer), objects, notes, info } or { error }.
function render(dxf, hidden, opts = {}, { title, svg = true, pdf = true } = {}) {
  const prep = prepare(dxf, hidden, opts);
  if (prep.empty) return { empty: true, objects: prep.objects, notes: ['No visible objects. Turn on some layers, or check that the drawing has content in model space.'] };
  const d = describe(dxf, prep, opts);
  if (prep.P.sheetCount > MAX_SHEETS) {
    return { ...d, error: `At ${d.info.scale} this drawing needs ${prep.P.sheetCount.toLocaleString('en')} sheets of ${d.info.size}. Choose a smaller scale or a larger page.` };
  }
  const out = { ...d };
  if (svg) out.svg = DXF.toSVG(prep.P);
  if (pdf) out.pdf = DXF.toPDF(prep.P, jsPDF, title).output('arraybuffer');
  return out;
}

// Several drawings into one PDF, in order. items: [{ dxf, hidden, opts, title }]
function combine(items, title) {
  let doc = null;
  const skipped = [];
  for (const it of items) {
    const prep = prepare(it.dxf, it.hidden, it.opts || {});
    if (prep.empty || prep.P.sheetCount > MAX_SHEETS) { skipped.push(it.title); continue; }
    doc = DXF.toPDF(prep.P, jsPDF, title, doc);
  }
  return { pdf: doc ? doc.output('arraybuffer') : null, skipped };
}

module.exports = { standardScale, init, open, render, combine, parseScale, DXF, MAX_SHEETS };
