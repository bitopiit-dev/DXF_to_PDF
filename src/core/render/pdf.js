'use strict';
const { D2R } = require('../dxf/geometry');
const { rowName } = require('../layout/plan');
const { fmtScale, dashArr, groups, outlineGroups } = require('./common');
const { getShaper, needsShaping } = require('../text/metrics');
const TB = require('../layout/title-block');

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
  titleBlock(doc, P, idx);
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


// Title block text: Helvetica for Latin, shaped glyph outlines for Bangla and other scripts.
// h = cap height in mm; text is squeezed or cut to fit maxW.
function pdfText(doc, s, x, y, h, rgb, maxW, { bold = false, align = 'left' } = {}) {
  s = String(s || '');
  if (!s) return;
  const shaper = getShaper();
  if (shaper && needsShaping(s)) {
    const sh = shaper.shape(s);
    let em = h / 0.72;
    if (maxW && sh.adv * em > maxW) em = maxW / sh.adv;
    const x0 = align === 'center' ? x - sh.adv * em / 2 : x;
    doc.setFillColor(...rgb);
    for (const g of sh.glyphs) {
      let cx = 0, cy = 0;
      const X = v => x0 + (g.x + v) * em, Y = v => y - (g.y + v) * em;
      for (const c of g.cmds) {
        const v = c.values;
        if (c.type === 'M') { doc.moveTo(X(v[0]), Y(v[1])); cx = v[0]; cy = v[1]; }
        else if (c.type === 'L') { doc.lineTo(X(v[0]), Y(v[1])); cx = v[0]; cy = v[1]; }
        else if (c.type === 'Q') {
          doc.curveTo(X(cx + 2 / 3 * (v[0] - cx)), Y(cy + 2 / 3 * (v[1] - cy)), X(v[2] + 2 / 3 * (v[0] - v[2])), Y(v[3] + 2 / 3 * (v[1] - v[3])), X(v[2]), Y(v[3]));
          cx = v[2]; cy = v[3];
        } else if (c.type === 'C') { doc.curveTo(X(v[0]), Y(v[1]), X(v[2]), Y(v[3]), X(v[4]), Y(v[5])); cx = v[4]; cy = v[5]; }
        else if (c.type === 'Z') doc.close();
      }
    }
    doc.fill();
    return;
  }
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(h / 0.72 / 0.352778);
  doc.setTextColor(...rgb);
  let t = pdfSafe(s);
  if (maxW) while (t.length > 3 && doc.getTextWidth(t) > maxW) t = t.slice(0, -4) + '...';
  doc.text(t, x, y, { align, baseline: 'alphabetic' });
}

function titleBlock(doc, P, idx) {
  const T = TB.layout(P, idx, P.titleBlock, P.title);
  if (!T) return;
  doc.setLineDashPattern([], 0); doc.setLineCap('butt');
  doc.setFillColor(255, 255, 255); doc.setDrawColor(14, 34, 54); doc.setLineWidth(0.35);
  doc.rect(T.box.x, T.box.y, T.box.w, T.box.h, 'FD');
  doc.setLineWidth(0.18);
  for (const l of T.lines) doc.line(l[0], l[1], l[2], l[3]);
  for (const c of T.cells) {
    pdfText(doc, c.label, c.x + 1.5, c.y + 2.6, T.LABEL, [100, 115, 130], c.w - 3);
    pdfText(doc, c.value, c.x + 1.5, c.y + 6.3, T.VALUE, [14, 34, 54], c.w - 3, { bold: true });
  }
  if (T.stamp) {
    const s = T.stamp;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(198, 40, 40); doc.setLineWidth(0.6);
    doc.rect(s.x, s.y, s.w, s.h, 'FD');
    pdfText(doc, s.text, s.x + s.w / 2, s.y + s.h / 2 + 1.3, 2.6, [198, 40, 40], s.w - 3, { bold: true, align: 'center' });
  }
  doc.setLineCap('round');
}

module.exports = { toPDF, pdfText };
