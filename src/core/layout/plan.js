'use strict';
// Page plan: fit to sheet, exact scale, and tiling across overlapping sheets
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
  // plotter roll: fixed width across, as long as the drawing needs along the roll, in segments of at most
  // 5 m (most PDF viewers cannot show longer pages); longer markers continue on the next page
  const ROLL_MAX = 5000;
  function rollPage(land) {
    const across = Math.max(100, Math.min(3000, opts.rollWidth || 914));
    const along = land ? bw : bh, side = land ? bh : bw;
    const s = fixed ? unit / opts.scale : Math.min((across - 2 * mg) / side, (ROLL_MAX - 2 * mg) / along);
    const len = Math.min(ROLL_MAX, Math.max(across * 0.25, along * s + 2 * mg + 0.01));
    return land ? [len, across] : [across, len];
  }
  function layout(land) {
    const rp = opts.size === 'Roll' ? rollPage(land) : null;
    const pw = rp ? rp[0] : land ? base[1] : base[0], ph = rp ? rp[1] : land ? base[0] : base[1], uw = pw - 2 * mg, uh = ph - 2 * mg;
    if (!fixed) {
      let s = Math.min(uw / bw, uh / bh), aw = uw, ah = uh;
      // with a title block, give the drawing whichever space above or beside the block keeps it largest
      const tb = opts.reserve && opts.reserve(uw, uh);
      if (tb) {
        const above = Math.min(uw / bw, (uh - tb.h - 2) / bh), beside = Math.min((uw - tb.w - 2) / bw, uh / bh);
        if (above >= beside) { s = above; ah = uh - tb.h - 2; } else { s = beside; aw = uw - tb.w - 2; }
      }
      return { pw, ph, uw, uh, s, cols: 1, rows: 1, W: bw * s, H: bh * s, ov: 0, aw, ah };
    }
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
  const areaW = L.aw || coverW, areaH = L.ah || coverH;
  const ox = mg + (areaW - W) / 2, oy = mg + (areaH - H) / 2;
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


module.exports = { SIZES, rowName, plan };
