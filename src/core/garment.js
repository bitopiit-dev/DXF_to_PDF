'use strict';
// Garment pattern files (Lectra Modaris and Diamino, Gerber, Optitex and other AAMA/ASTM DXF exports).
// They carry their facts as text labels rather than DXF header values: "UNITS: METRIC", "PIECE NAME: FRONT",
// "Size: L_XL". Each pattern piece is a block, and a graded nest stacks every size of a piece in one place.
const { str } = require('./dxf/parser');

// AAMA/ASTM layer numbers, used only when a file really spreads its geometry over these layers
const AAMA_LAYERS = {
  1: 'Cut line', 2: 'Turn points', 3: 'Curve points', 4: 'Notches', 5: 'Grade reference', 6: 'Mirror line',
  7: 'Grain line', 8: 'Internal lines', 9: 'Stripe reference', 10: 'Plaid reference', 11: 'Internal cutouts',
  13: 'Drill holes', 14: 'Sew line', 15: 'Annotation',
};

const label = s => { const m = String(s).match(/^\s*([A-Za-z][A-Za-z .]*?)\s*:\s*(.*?)\s*$/); return m ? [m[1].toUpperCase(), m[2]] : null; };
const texts = ents => ents.filter(e => e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTRIB').map(e => str(e, 1));

function detect(dxf) {
  const head = {};
  for (const t of texts(dxf.entities)) { const kv = label(t); if (kv && !(kv[0] in head)) head[kv[0]] = kv[1]; }
  const pieces = [];
  for (const [name, b] of Object.entries(dxf.blocks)) {
    const kv = {};
    const comments = [];
    for (const t of texts(b.ents || [])) {
      const p = label(t); if (!p) continue;
      if (p[0] === 'COMMENT') { if (p[1]) comments.push(p[1]); } else if (!(p[0] in kv)) kv[p[0]] = p[1];
    }
    if (kv['PIECE NAME']) pieces.push({ block: name, piece: kv['PIECE NAME'], size: kv.SIZE || '', fabric: kv.FABRIC || '', quantity: kv.QUANTITY || '', comment: comments.join('; ') });
  }
  const unitsText = (head.UNITS || '').toUpperCase();
  if (!pieces.length && !/^(METRIC|ENGLISH)$/.test(unitsText)) return null;

  const sizes = [];
  for (const p of pieces) if (p.size && !sizes.includes(p.size)) sizes.push(p.size);
  const author = head.AUTHOR || '';
  return {
    vendor: /lectra/i.test(author) ? 'Lectra' : /gerber/i.test(author) ? 'Gerber' : /optitex/i.test(author) ? 'Optitex' : 'AAMA/ASTM',
    units: unitsText === 'ENGLISH' ? 'in' : unitsText === 'METRIC' ? 'mm' : null,
    design: head.DESIGN || head.STYLE || '', masterSize: head['MASTER SIZE'] || '', date: head.DATE || '',
    pieces, sizes,
  };
}

// every layer name the geometry uses, for files without a layer table
function usedLayers(dxf) {
  const seen = new Set();
  const scan = ents => { for (const e of ents) { const l = str(e, 8); if (l) seen.add(l); } };
  scan(dxf.entities);
  for (const b of Object.values(dxf.blocks)) scan(b.ents || []);
  return [...seen];
}

// "Cut line (1)" style names, only when the file uses several AAMA-numbered layers
function layerLabels(names) {
  const numeric = names.filter(n => /^\d+$/.test(n) && AAMA_LAYERS[+n]);
  if (numeric.length < 2) return {};
  return Object.fromEntries(numeric.map(n => [n, `${AAMA_LAYERS[+n]} (${n})`]));
}

// layer-style keys that hide whole pieces: the converter skips an INSERT whose block is listed
const blockKey = name => '\u0000block:' + String(name).toUpperCase();
function hiddenBlocks(g, hideSizes) {
  if (!g || !hideSizes || !hideSizes.length) return [];
  return g.pieces.filter(p => hideSizes.includes(p.size)).map(p => blockKey(p.block));
}

module.exports = { detect, usedLayers, layerLabels, hiddenBlocks, blockKey, AAMA_LAYERS };
