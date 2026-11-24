'use strict';
// Headless mode: "DXF to PDF" --convert drawing.dxf [more files or folders] [options]
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core/convert.js');

const HELP = `DXF to PDF, command line

  --convert <files or folders>   DXF files to convert (folders: every .dxf inside)
  --out <folder>                 where to write PDFs (default: next to each DXF)
  --combine <file.pdf>           write all drawings into one PDF instead
  --size A4|A3|A2|A1|A0|Letter|Legal|Tabloid   (default A3)
  --orient auto|landscape|portrait              (default auto)
  --scale fit|1:50|2:1                          (default fit)
  --units auto|mm|cm|m|in|ft                    (default auto: from the file)
  --ink color|black                             (default color)
  --margin <mm>                                 (default 10)
  --overlap <mm>                                (overlap between tiled sheets, default 10)

Example: "DXF to PDF" --convert plans --out pdf --scale 1:100 --size A1`;

const VALUE_FLAGS = ['out', 'combine', 'size', 'orient', 'scale', 'units', 'ink', 'margin', 'overlap'];

function parseArgs(argv) {
  const opts = {}, inputs = [];
  let mode = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--convert') { mode = 'in'; continue; }
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
    if (m && VALUE_FLAGS.includes(m[1])) { opts[m[1]] = m[2] != null ? m[2] : argv[++i]; mode = null; continue; }
    if (m) continue; // Electron/Chromium switches
    if (mode === 'in') inputs.push(a);
  }
  return { opts, inputs };
}

function expand(inputs) {
  const files = [];
  for (const p of inputs) {
    let st;
    try { st = fs.statSync(p); } catch { files.push({ path: p, missing: true }); continue; }
    if (st.isDirectory()) {
      for (const n of fs.readdirSync(p).sort()) if (/\.dxf$/i.test(n)) files.push({ path: path.join(p, n) });
    } else files.push({ path: p });
  }
  return files;
}

async function run(argv, log = console.log, err = console.error) {
  const { opts, inputs } = parseArgs(argv);
  if (opts.help || !inputs.length) { log(HELP); return inputs.length || opts.help ? 0 : 2; }
  const st = await C.init();
  if (!st.shaping) err(`Bangla text support unavailable: ${st.error}`);
  const files = expand(inputs);
  const render = { size: opts.size, orient: opts.orient, scale: opts.scale, units: opts.units, ink: opts.ink, margin: opts.margin, overlap: opts.overlap };
  if (opts.out) fs.mkdirSync(opts.out, { recursive: true });
  let failed = 0;
  const combined = [];
  for (const f of files) {
    const name = path.basename(f.path).replace(/\.dxf$/i, '');
    if (f.missing) { err(`✗ ${f.path}: file not found`); failed++; continue; }
    try {
      const o = C.open(fs.readFileSync(f.path));
      if (opts.combine) { combined.push({ dxf: o.dxf, hidden: o.hidden, opts: render, title: name }); continue; }
      const r = C.render(o.dxf, o.hidden, render, { title: name, svg: false });
      if (r.error || r.empty) { err(`✗ ${f.path}: ${r.error || r.notes[0]}`); failed++; continue; }
      const out = path.join(opts.out || path.dirname(f.path), name + '.pdf');
      fs.writeFileSync(out, Buffer.from(r.pdf));
      log(`✓ ${out}  (${r.info.sheets} sheet${r.info.sheets > 1 ? 's' : ''}, ${r.info.size}, ${r.info.scale})`);
    } catch (e) {
      err(`✗ ${f.path}: ${e.message === 'binary' ? 'binary DXF, save it as ASCII DXF' : e.message === 'notdxf' ? 'not a DXF file' : e.message}`);
      failed++;
    }
  }
  if (opts.combine) {
    const r = C.combine(combined, path.basename(opts.combine, '.pdf'));
    if (r.pdf) { fs.writeFileSync(opts.combine, Buffer.from(r.pdf)); log(`✓ ${opts.combine}  (${combined.length - r.skipped.length} drawings)`); }
    for (const s of r.skipped) { err(`✗ ${s}: nothing to draw at these settings`); failed++; }
  }
  return failed ? 1 : 0;
}

module.exports = { run, parseArgs, HELP };
