'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { jsPDF } = require('jspdf');
const DXF = require('../src/core/dxf-core.js');
const C = require('../src/core/convert.js');
const Garment = require('../src/core/garment.js');
const DXF_GARMENT_BLOCKS = (o, sizes) => Garment.hiddenBlocks(o.garment, sizes);

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
// page content is Flate-compressed; inflate every stream so tests can read the drawing operators
const pdfContent = buf => {
  const zlib = require('node:zlib'), b = Buffer.from(buf), out = [];
  let i = 0;
  while ((i = b.indexOf('stream', i)) >= 0) {
    let start = i + 6; if (b[start] === 13) start++; if (b[start] === 10) start++;
    const end = b.indexOf('endstream', start);
    if (end < 0) break;
    try { out.push(zlib.inflateSync(b.subarray(start, end)).toString('latin1')); } catch { /* not compressed */ }
    i = end + 9;
  }
  return out.join('\n');
};
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
  assert.ok(!/\(\?+[ ?]*\)/.test(pdfContent(r.pdf)), 'no question marks for Bangla');
  assert.match(r.notes.join(' '), /non-Latin text drawn as vector outlines/);
});

test('several drawings combine into one PDF', async () => {
  await C.init();
  const items = ['basic.dxf', 'bangla.dxf', 'scale-mm.dxf'].map(n => { const o = open(n); return { dxf: o.dxf, hidden: o.hidden, opts: { size: 'A4' }, title: n }; });
  const r = C.combine(items, 'All');
  assert.strictEqual(pdfPages(r.pdf), 3);
  assert.deepStrictEqual(r.skipped, []);
});

/* ---------- title block, layer overrides, presets, batch ---------- */

const Settings = require('../src/models/settings.js');
const Presets = require('../src/models/presets.js');
const Overrides = require('../src/models/layer-overrides.js');
const { runBatch } = require('../src/core/batch.js');

test('title block prints on every sheet and keeps clear of a fitted drawing', async () => {
  await C.init();
  const o = open('scale-mm.dxf');
  const tb = { enabled: true, project: 'Bitopi Tower', drawnBy: 'K/Arifur Rahman', date: '2026-11-24', stamp: 'Preliminary' };
  const fit = C.render(o.dxf, o.hidden, { size: 'A3', titleBlock: tb }, { title: 'scale-mm' });
  assert.match(fit.svg, /class="title-block"/);
  assert.match(fit.svg, /Bitopi Tower/);
  assert.match(fit.svg, /Fit, about 1:/);
  const pdf = pdfContent(fit.pdf);
  assert.match(pdf, /Bitopi Tower/);
  assert.match(pdf, /Preliminary/);
  const { f, ext } = DXF.build(o.dxf, new Set());
  const TB = require('../src/core/layout/title-block.js');
  const P = DXF.plan(f.prims, ext, { size: 'A3', reserve: TB.size });
  const box = TB.layout(P, 0, tb, 'x').box;
  const right = P.X(ext.maxx), bottom = P.Y(ext.miny);
  assert.ok(right <= box.x + 0.01 || bottom <= box.y + 0.01, 'drawing does not run under the title block');
  const tiled = C.render(o.dxf, o.hidden, { size: 'A4', scale: '1:1', titleBlock: tb }, { title: 'scale-mm', pdf: false });
  assert.strictEqual((tiled.svg.match(/class="title-block"/g) || []).length, tiled.info.sheets, 'one per sheet');
  assert.match(tiled.svg, /21 of 21 \(C7\)/);
});

test('a Bangla project name in the title block is shaped, not "?"', async () => {
  await C.init();
  const o = open('scale-mm.dxf');
  const r = C.render(o.dxf, o.hidden, { size: 'A3', titleBlock: { enabled: true, project: 'বিতপি টাওয়ার' } }, { svg: false });
  const pdf = pdfContent(r.pdf);
  assert.ok(!/\(\?+\)/.test(pdf), 'no question marks');
  assert.match(pdf, / c\n/, 'glyph outlines drawn as curves');
});

test('layer colour and line-weight overrides reach the drawing', async () => {
  await C.init();
  const o = open('linetypes-hatch.dxf');
  const layers = Overrides.toEngine({ CENTER: { color: '#FF00AA', lw: 2 }, OTHER: { color: 'bad', lw: 1 } });
  assert.deepStrictEqual(Object.keys(layers), ['CENTER'], 'no-op and invalid overrides are dropped');
  const base = C.render(o.dxf, o.hidden, { size: 'A4' });
  const over = C.render(o.dxf, o.hidden, { size: 'A4', layers });
  assert.ok(!base.svg.includes('#ff00aa') && over.svg.includes('#ff00aa'), 'colour override');
  const { f } = DXF.build(o.dxf, new Set());
  const lw = f.prims.find(p => p.layer === 'CENTER' && p.k === 'p').lw;
  assert.match(over.svg, new RegExp(`stroke="#ff00aa" stroke-width="${lw * 2}"`), 'line weight doubled');
});

test('settings are validated and presets keep project and date', () => {
  const n = Settings.normalize({ size: 'B9', margin: 99, scale: 'oops', ink: 'black' });
  assert.deepStrictEqual([n.size, n.margin, n.scale, n.ink], ['A3', 40, '1:100', 'black']);
  const cur = Settings.normalize({ titleBlock: { enabled: false, project: 'Job 42', date: '2026-01-01' } });
  const eng = Presets.BUILTIN.find(p => p.name.startsWith('A3 1:50'));
  const after = Settings.applyPreset(cur, eng.settings);
  assert.strictEqual(after.scale, '1:50');
  assert.strictEqual(after.titleBlock.enabled, true);
  assert.strictEqual(after.titleBlock.project, 'Job 42');
  assert.ok(Settings.same(after, Settings.applyPreset(after, eng.settings)));
  assert.strictEqual(Presets.validName('A4 fit, black and white'), 'That name belongs to a built-in preset.');
  assert.strictEqual(Settings.toEngine({ scaleMode: 'fit' }).scale, 'fit');
  assert.match(Settings.toEngine({ titleBlock: { enabled: true } }).titleBlock.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('batch keeps going past a failing drawing and reports progress', async () => {
  const seen = [];
  const r = await runBatch([1, 2, 3, 4], async n => { if (n === 3) throw new Error('bad'); return n * 2; }, { concurrency: 2, onProgress: p => seen.push(p.done) });
  assert.deepStrictEqual(r.done.map(d => d.result).sort(), [2, 4, 8]);
  assert.strictEqual(r.failed[0].error, 'bad');
  assert.deepStrictEqual(seen, [1, 2, 3, 4]);
});

/* ---------- watch folder and update checks ---------- */

test('a watched folder converts new drawings once, after they finish saving', async () => {
  const { createWatcher, upToDate } = require('../src/main/watcher.js');
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dxf2pdf-w-'));
  const events = [];
  let calls = 0;
  const w = createWatcher({
    step: 60,
    convert: async (src, dest) => { calls++; fs.writeFileSync(dest, '%PDF-fake'); return dest; },
    onEvent: e => events.push(e),
  });
  fs.writeFileSync(path.join(dir, 'old.dxf'), 'x'); fs.writeFileSync(path.join(dir, 'old.pdf'), 'y'); // PDF already newer
  await w.start(dir);
  fs.writeFileSync(path.join(dir, 'new.dxf'), '0\nSECTION\n');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
  for (let i = 0; i < 60 && !fs.existsSync(path.join(dir, 'new.pdf')); i++) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, 900));
  w.stop();
  assert.ok(fs.existsSync(path.join(dir, 'new.pdf')), 'new drawing converted');
  assert.strictEqual(calls, 1, 'old drawing with a newer PDF and the text file were left alone');
  assert.ok(await upToDate(path.join(dir, 'new.dxf')));
  assert.deepStrictEqual(events.map(e => e.type), ['watching', 'converting', 'converted']);
});

test('update checks compare versions the way releases are numbered', () => {
  const { newer } = require('../src/main/updater.js');
  assert.ok(newer('v3.1.0', '3.0.0'));
  assert.ok(newer('3.0.10', '3.0.9'));
  assert.ok(!newer('v3.0.0', '3.0.0'));
  assert.ok(!newer('2.9.9', '3.0.0'));
  assert.ok(!newer('3.1.0-beta.1', '3.1.0'));
});

test('update errors read as one plain sentence', () => {
  const { friendly } = require('../src/main/updater.js');
  const raw = 'Cannot find latest-linux.yml in the latest release artifacts (https://github.com/x/y/releases/download/v3.0.0/latest-linux.yml): HttpError: 404\nHeaders: {...}';
  assert.strictEqual(friendly(new Error(raw)), 'The latest release has no update information yet.');
  assert.match(friendly(new Error('net::ERR_INTERNET_DISCONNECTED')), /could not be reached/);
  assert.ok(friendly(new Error('x'.repeat(400))).length <= 120);
});

/* ---------- garment patterns (Lectra and other AAMA/ASTM exports) ---------- */

test('a garment pattern file is recognised from its labels', () => {
  const o = open('aama-pattern.dxf');
  assert.ok(o.garment, 'detected');
  assert.strictEqual(o.garment.units, 'in', 'UNITS: ENGLISH means inches');
  assert.deepStrictEqual(o.garment.sizes, ['S', 'M']);
  assert.strictEqual(o.garment.design, 'TEST-001');
  assert.deepStrictEqual([...new Set(o.garment.pieces.map(p => p.piece))], ['SLEEVE']);
  const lab = Object.fromEntries(o.layers.map(l => [l.name, l.label]));
  assert.strictEqual(lab['14'], 'Sew line (14)');
  assert.strictEqual(lab['13'], 'Drill holes (13)');
  assert.strictEqual(open('basic.dxf').garment, null, 'ordinary drawings are not patterns');
});

test('pattern sizes print at true size, one size at a time or each on its own pages', async () => {
  await C.init();
  const o = open('aama-pattern.dxf');
  const m = C.render(o.dxf, o.hidden, { size: 'A4', sizes: { hide: ['S'] } }, { svg: false });
  assert.ok(Math.abs(m.info.realW - 20 * 25.4) < 1, `size M is 20 in wide: ${m.info.realW} mm`);
  assert.strictEqual(m.info.unitsGuessed, false);
  const all = C.render(o.dxf, o.hidden, { size: 'A4' }, { svg: false });
  assert.ok(all.objects > m.objects, 'hiding a size removes its piece');
  const split = C.render(o.dxf, o.hidden, { size: 'A4', sizes: { split: true } }, { svg: false });
  assert.strictEqual(pdfPages(split.pdf), 2, 'one page per size');
  assert.match(split.notes.join(' '), /own pages: S, M/);
});

test('drill holes are marked, grading points stay invisible', () => {
  const o = open('aama-pattern.dxf');
  o.dxf.drillR = 0.1;
  const { f } = DXF.build(o.dxf, new Set(DXF_GARMENT_BLOCKS(o, ['S'])));
  assert.ok(f.prims.some(p => p.layer === '13' && p.closed), 'drill hole drawn as a circle');
  assert.ok(!f.prims.some(p => p.layer === '2'), 'turn point not drawn');
  const plain = open('aama-pattern.dxf'); plain.dxf.drillR = 0; // outside garment mode points are never drawn
  assert.ok(!DXF.build(plain.dxf, new Set()).f.prims.some(p => p.layer === '13'));
});

test('a marker fits a plotter roll: fixed width across, length as needed', async () => {
  await C.init();
  const o = open('aama-pattern.dxf');
  const r = C.render(o.dxf, o.hidden, { size: 'Roll', rollWidth: 914, scale: '1:1', sizes: { hide: ['S'] } }, { svg: false });
  assert.strictEqual(r.info.sheets, 1);
  const sides = [r.info.pageW, r.info.pageH].map(Math.round);
  assert.ok(sides.includes(914), `one side is the roll width: ${sides}`);
  const along = sides[0] === 914 ? sides[1] : sides[0];
  assert.ok(along >= 508 && along < 600, `the length follows the piece (20 in = 508 mm) plus margins: ${along}`);
  assert.match(r.info.size, /914 mm roll/);
});

test('files without a layer table still list their layers', () => {
  const dxf = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nCUT\n10\n0\n20\n0\n11\n10\n21\n0\n0\nLINE\n8\nSEW\n10\n0\n20\n1\n11\n10\n21\n1\n0\nENDSEC\n0\nEOF\n';
  const o = C.open(Buffer.from(dxf));
  assert.deepStrictEqual(o.layers.map(l => l.name), ['CUT', 'SEW']);
});
