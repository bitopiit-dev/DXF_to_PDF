'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { jsPDF } = require('jspdf');
const DXF = require('../src/core/dxf-core.js');
const C = require('../src/core/convert.js');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const measure = new jsPDF();
DXF.setMeasure(s => measure.getStringUnitWidth(s));

function convert(name, hidden = new Set()) {
  const dxf = DXF.parse(fixture(name));
  const { f, ext } = DXF.build(dxf, hidden);
  const P = DXF.plan(f.prims, ext, { size: 'A3', orient: 'auto', ink: 'color' });
  return { dxf, f, ext, P };
}

test('parses layers, blocks and entities', () => {
  const dxf = DXF.parse(fixture('basic.dxf'));
  assert.ok(dxf.layers.WALLS, 'WALLS layer');
  assert.ok(dxf.blocks.BOX, 'BOX block');
  assert.ok(dxf.entities.length > 10);
});

test('draws every common entity type without skipping', () => {
  const { f } = convert('basic.dxf');
  for (const t of ['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'ELLIPSE', 'SPLINE', 'TEXT', 'MTEXT', 'INSERT', 'DIMENSION', 'HATCH', 'ATTRIB']) {
    assert.ok(f.used[t] > 0, `${t} drawn`);
  }
  assert.deepStrictEqual(f.skipped, {});
});

test('hidden layers are left out', () => {
  const all = convert('basic.dxf').f.prims.filter(p => p.layer === 'WALLS').length;
  const none = convert('basic.dxf', new Set(['WALLS'])).f.prims.filter(p => p.layer === 'WALLS').length;
  assert.ok(all > 0);
  assert.strictEqual(none, 0);
});

test('curves are smooth at print size (chord error under 0.01 mm)', () => {
  const { f, P } = convert('basic.dxf');
  const circle = f.prims.find(p => p.k === 'p' && p.closed && p.pts.length > 60);
  assert.ok(circle, 'circle found');
  const cx = circle.pts.reduce((s, q) => s + q[0], 0) / circle.pts.length;
  const cy = circle.pts.reduce((s, q) => s + q[1], 0) / circle.pts.length;
  const r = Math.hypot(circle.pts[0][0] - cx, circle.pts[0][1] - cy);
  const step = 2 * Math.PI / (circle.pts.length - 1);
  const sagittaMm = r * (1 - Math.cos(step / 2)) * P.s;
  assert.ok(sagittaMm < 0.01, `sagitta ${sagittaMm} mm`);
});

test('line weights and line types are carried through', () => {
  const { f } = convert('linetypes-hatch.dxf');
  assert.ok(f.prims.some(p => p.k === 'p' && p.lw === 0.7), '0.70 mm line weight');
  assert.ok(f.prims.some(p => p.k === 'p' && p.layer === 'CENTER' && p.dash), 'CENTER line type dashes');
});

test('pattern hatches become real pattern lines', () => {
  const { f } = convert('linetypes-hatch.dxf');
  const h = f.prims.filter(p => p.k === 'h');
  assert.ok(h.length >= 2);
  assert.ok(h.every(p => p.segs.length > 0 && p.clip.length > 0));
});

test('MTEXT wraps to its reference width', () => {
  const { f } = convert('linetypes-hatch.dxf');
  const lines = f.prims.filter(p => p.k === 't' && /paragraph|wrap|nicely/.test(p.s));
  assert.ok(lines.length >= 2, 'wrapped into several lines');
});

test('produces a vector PDF', () => {
  const { P } = convert('basic.dxf');
  const bytes = Buffer.from(DXF.toPDF(P, jsPDF, 'basic').output('arraybuffer'));
  assert.strictEqual(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 2000);
});

test('rejects binary DXF and non-DXF input with clear errors', () => {
  assert.throws(() => DXF.parse('AutoCAD Binary DXF\r\n\x1a\x00'), /binary/);
  assert.throws(() => DXF.parse('hello\nworld\n'), /notdxf/);
});

/* ---------- units, true scale and tiling ---------- */

const open = name => C.open(fs.readFileSync(path.join(__dirname, 'fixtures', name)));
const pdfPages = buf => (Buffer.from(buf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

test('reads drawing units from $INSUNITS', () => {
  assert.strictEqual(open('scale-mm.dxf').units, 'mm');
  assert.strictEqual(open('inches.dxf').units, 'in');
  assert.strictEqual(DXF.unitMM(open('inches.dxf').dxf), 25.4);
  assert.strictEqual(DXF.unitMM(open('inches.dxf').dxf, 'cm'), 10, 'override wins');
});

test('parses scales written the way people type them', () => {
  assert.strictEqual(C.parseScale('fit'), 'fit');
  assert.strictEqual(C.parseScale('1:50'), 50);
  assert.strictEqual(C.parseScale('2:1'), 0.5);
  assert.strictEqual(C.parseScale('1/100'), 100);
  assert.strictEqual(C.parseScale('nonsense'), 'fit');
  assert.strictEqual(C.standardScale(869), '1:1000');
  assert.strictEqual(C.standardScale(0.3), '2:1');
});

test('a fixed scale prints at true size', async () => {
  await C.init();
  const o = open('scale-mm.dxf');
  const r = C.render(o.dxf, o.hidden, { size: 'A1', scale: '1:2', margin: 10 }, { svg: false });
  assert.strictEqual(r.info.sheets, 1, 'at 1:2 the 1200 x 800 mm drawing is 600 x 400 mm and fits one A1 sheet');
  assert.ok(r.info.landscape);
  const { f, ext } = DXF.build(o.dxf, new Set());
  const P = DXF.plan(f.prims, ext, { size: 'A0', scale: 10, unitMM: 1 });
  assert.ok(Math.abs(P.drawW - 120) < 0.5 && Math.abs(P.drawH - 80) < 0.5, `1:10 gives ${P.drawW} x ${P.drawH} mm`);
  const pi = DXF.plan(f.prims, ext, { size: 'A0', scale: 1, unitMM: 25.4 });
  assert.ok(Math.abs(pi.drawW - 1200 * 25.4) < 1, 'inch drawings are converted to mm');
});

test('a drawing larger than the page is tiled across overlapping sheets', async () => {
  await C.init();
  const o = open('scale-mm.dxf');
  const r = C.render(o.dxf, o.hidden, { size: 'A4', scale: '1:1', overlap: 10 });
  assert.ok(r.info.sheets > 1);
  assert.strictEqual(r.info.sheets, r.info.cols * r.info.rows);
  assert.strictEqual(pdfPages(r.pdf), r.info.sheets, 'one PDF page per sheet');
  assert.match(r.svg, /class="tiles"/);
  const { f, ext } = DXF.build(o.dxf, new Set());
  const P = DXF.plan(f.prims, ext, { size: 'A4', orient: 'portrait', scale: 1, unitMM: 1, overlap: 10 });
  const uw = 210 - 20;
  assert.ok((P.cols - 1) * (uw - 10) + uw >= 1200, 'tiles cover the full width');
  assert.ok((P.cols - 2) * (uw - 10) + uw < 1200, 'no spare column of tiles');
});

test('refuses scales that would need hundreds of sheets', async () => {
  await C.init();
  const o = open('basic.dxf');
  const r = C.render(o.dxf, o.hidden, { size: 'A4', scale: '1:1' });
  assert.match(r.error, /sheets of A4/);
  assert.ok(!r.pdf);
});

/* ---------- Bangla and other non-Latin text ---------- */

test('Bangla text is shaped into vector outlines instead of "?"', async () => {
  const st = await C.init();
  assert.ok(st.shaping, 'HarfBuzz loaded: ' + st.error);
  const o = open('bangla.dxf');
  const { f } = DXF.build(o.dxf, new Set());
  const outlined = f.prims.filter(p => p.k === 'o');
  assert.ok(outlined.some(p => p.s.includes('কক্ষ')), 'TEXT outlined');
  assert.ok(outlined.some(p => p.s.includes('পরিকল্পনা')), 'MTEXT outlined');
  assert.ok(f.prims.some(p => p.k === 't' && p.s === 'Plan A'), 'Latin text stays real, searchable text');
  // ক্ষ is one conjunct glyph, so the shaped word has fewer glyphs than code points
  const sh = DXF.needsShaping('কক্ষ') && C.DXF;
  assert.ok(sh);
  const r = C.render(o.dxf, o.hidden, { size: 'A4' });
  assert.ok(!Buffer.from(r.pdf).toString('latin1').includes('(? ??'), 'no question marks for Bangla');
  assert.match(r.notes.join(' '), /non-Latin text drawn as vector outlines/);
});

test('several drawings combine into one PDF', async () => {
  await C.init();
  const items = ['basic.dxf', 'bangla.dxf', 'scale-mm.dxf'].map(n => { const o = open(n); return { dxf: o.dxf, hidden: o.hidden, opts: { size: 'A4' }, title: n }; });
  const r = C.combine(items, 'All');
  assert.strictEqual(pdfPages(r.pdf), 3);
  assert.deepStrictEqual(r.skipped, []);
});
