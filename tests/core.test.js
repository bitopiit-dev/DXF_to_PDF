'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { jsPDF } = require('jspdf');
const DXF = require('../src/renderer/dxf-core.js');

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
