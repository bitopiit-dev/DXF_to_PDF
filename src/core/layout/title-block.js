'use strict';
// Engineering title block in the bottom-right of each sheet, in page millimetres.
// Renderers only draw what layout() returns, so the SVG preview and the PDF always match.
const { fmtScale } = require('../render/common');

const ROW = 7.5;          // row height, mm
const ROWS = 4;
const LABEL = 1.8;        // cap height of the small labels, mm
const VALUE = 2.8;        // cap height of the values, mm

// size the block for a printable area of uw x uh mm; null when the sheet is too small for one
function size(uw, uh) {
  const w = Math.min(130, uw * 0.62), h = ROW * ROWS;
  return w < 60 || h > uh * 0.6 ? null : { w, h };
}

function layout(P, idx, tb, title) {
  if (!tb || !tb.enabled) return null;
  const sz = size(P.uw, P.uh);
  if (!sz) return null;
  const { w: W, h: H } = sz, half = W / 2;
  const x = P.mg + P.uw - W, y = P.mg + P.uh - H;
  const pg = P.pages[idx] || {};
  const n = P.pages.length || P.sheetCount;
  const cells = [
    { x, y, w: W, label: 'Project', value: tb.project || '' },
    { x, y: y + ROW, w: W, label: 'Drawing', value: title || '' },
    { x, y: y + 2 * ROW, w: half, label: 'Drawn by', value: tb.drawnBy || '' },
    { x: x + half, y: y + 2 * ROW, w: half, label: 'Date', value: tb.date || '' },
    { x, y: y + 3 * ROW, w: half, label: 'Scale', value: P.fixed ? fmtScale(P.scaleN) : `Fit, about ${fmtScale(P.scaleN)}` },
    { x: x + half, y: y + 3 * ROW, w: half, label: 'Sheet', value: `${idx + 1} of ${n}${pg.label ? ` (${pg.label})` : ''}` },
  ];
  const lines = [
    [x, y + ROW, x + W, y + ROW], [x, y + 2 * ROW, x + W, y + 2 * ROW], [x, y + 3 * ROW, x + W, y + 3 * ROW],
    [x + half, y + 2 * ROW, x + half, y + H],
  ];
  let stamp = null;
  const st = (tb.stamp || '').trim();
  if (st) {
    const sw = Math.min(W, 10 + st.length * 2.6), sh = 9;
    stamp = { x: x + W - sw, y: y - sh - 2, w: sw, h: sh, text: st };
  }
  return { box: { x, y, w: W, h: H }, lines, cells, stamp, LABEL, VALUE };
}

module.exports = { size, layout, ROW };
