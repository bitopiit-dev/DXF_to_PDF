'use strict';
const { D2R } = require('../dxf/geometry');
const { f2, esc, dashArr, groups, outlineGroups } = require('./common');
const TB = require('../layout/title-block');

// One SVG of the whole output. A tiled plan shows every sheet's printable area as an outlined, labelled tile.
function toSVG(P) {
  const VW = P.posterW, VH = P.posterH;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f2(VW)} ${f2(VH)}" width="${f2(VW)}mm" height="${f2(VH)}mm"><rect width="100%" height="100%" fill="#fff"/>`;
  const pt = q => f2(P.X(q[0])) + ' ' + f2(P.Y(q[1]));
  let cid = 0;
  for (const p of P.prims) {
    if (p.k === 'f') o += `<path d="${p.loops.map(l => 'M' + l.map(pt).join('L') + 'Z').join('')}" fill="${P.ink(p.c)}" fill-opacity="${p.op}" fill-rule="evenodd"/>`;
    else if (p.k === 'h') {
      const id = 'hc' + (cid++), d = dashArr(p.dash, P.s);
      o += `<clipPath id="${id}"><path clip-rule="evenodd" d="${p.clip.map(l => 'M' + l.map(pt).join('L') + 'Z').join('')}"/></clipPath>`;
      o += `<path clip-path="url(#${id})" fill="none" stroke="${P.ink(p.c)}" stroke-width="${p.lw}" stroke-linecap="${d ? 'butt' : 'round'}"${d ? ` stroke-dasharray="${d.join(' ')}"` : ''} d="${p.segs.map(s => 'M' + pt([s[0], s[1]]) + 'L' + pt([s[2], s[3]])).join('')}"/>`;
    }
  }
  o += '<g fill="none" stroke-linecap="round" stroke-linejoin="round">';
  for (const g of groups(P)) {
    const d = g.items.map(p => 'M' + p.pts.map(pt).join('L') + (p.closed ? 'Z' : '')).join('');
    o += `<path d="${d}" stroke="${g.c}" stroke-width="${g.lw}"${g.d ? ' stroke-linecap="butt"' : ''}${g.d ? ` stroke-dasharray="${g.d.join(' ')}"` : ''}/>`;
  }
  o += '</g>';
  for (const [c, items] of outlineGroups(P)) {
    const d = items.map(p => p.cmds.map(k => k[0] + (k.length > 1 ? k.slice(1).map((v, i) => f2(i % 2 ? P.Y(v) : P.X(v))).join(' ') : '')).join('')).join('');
    o += `<path d="${d}" fill="${c}"/>`;
  }
  o += '<g font-family="Helvetica, Arial, sans-serif">';
  for (const t of P.prims) if (t.k === 't') {
    const x = f2(P.X(t.x)), y = f2(P.Y(t.y)), deg = f2(-t.r / D2R);
    o += `<text transform="translate(${x} ${y})${deg !== '0' ? ` rotate(${deg})` : ''}${t.wf !== 1 ? ` scale(${f2(t.wf)} 1)` : ''}" font-size="${f2(t.h * P.s / 0.72)}" fill="${P.ink(t.c)}" text-anchor="${['start', 'middle', 'end'][t.ha] || 'start'}" xml:space="preserve">${esc(t.s)}</text>`;
  }
  o += '</g>';
  P.pages.forEach((pg, i) => { o += titleBlockSVG(P, pg, i); });
  if (P.pages.length > 1) {
    // each join shows once: a light band where neighbouring sheets overlap, with one cut line through it
    const sx = P.uw - P.ov, sy = P.uh - P.ov, W = (P.cols - 1) * sx + P.uw, H = (P.rows - 1) * sy + P.uh;
    o += '<g class="tiles" fill="none">';
    o += `<rect class="edge" x="${f2(P.mg)}" y="${f2(P.mg)}" width="${f2(W)}" height="${f2(H)}"/>`;
    for (let c = 1; c < P.cols; c++) {
      const x = P.mg + c * sx;
      o += `<rect class="band" x="${f2(x)}" y="${f2(P.mg)}" width="${f2(P.ov)}" height="${f2(H)}"/><path class="seam" d="M${f2(x + P.ov / 2)} ${f2(P.mg)}v${f2(H)}"/>`;
    }
    for (let r = 1; r < P.rows; r++) {
      const y = P.mg + r * sy;
      o += `<rect class="band" x="${f2(P.mg)}" y="${f2(y)}" width="${f2(W)}" height="${f2(P.ov)}"/><path class="seam" d="M${f2(P.mg)} ${f2(y + P.ov / 2)}h${f2(W)}"/>`;
    }
    const fs = Math.min(sx, sy) * 0.14;
    for (const pg of P.pages) {
      const x = pg.dx + P.mg + (pg.col ? P.ov : 0), y = pg.dy + P.mg + (pg.row ? P.ov : 0);
      o += `<text x="${f2(x + fs * 0.3)}" y="${f2(y + fs * 1.05)}" font-size="${f2(fs)}">${pg.label}</text>`;
    }
    o += '</g>';
  }
  return o + '</svg>';
}


function titleBlockSVG(P, pg, i) {
  const T = TB.layout(P, i, P.titleBlock, P.title);
  if (!T) return '';
  const fs = h => f2(h / 0.72);
  let o = `<g class="title-block" transform="translate(${f2(pg.dx)} ${f2(pg.dy)})" font-family="Helvetica, Arial, 'Nirmala UI', sans-serif">`;
  o += `<rect x="${f2(T.box.x)}" y="${f2(T.box.y)}" width="${f2(T.box.w)}" height="${f2(T.box.h)}" fill="#fff" stroke="#0e2236" stroke-width="0.35"/>`;
  o += `<path d="${T.lines.map(l => `M${f2(l[0])} ${f2(l[1])}L${f2(l[2])} ${f2(l[3])}`).join('')}" stroke="#0e2236" stroke-width="0.18"/>`;
  for (const c of T.cells) {
    o += `<svg x="${f2(c.x)}" y="${f2(c.y)}" width="${f2(c.w)}" height="7.5" overflow="hidden">`;
    o += `<text x="1.5" y="2.6" font-size="${fs(T.LABEL)}" fill="#647382">${esc(c.label)}</text>`;
    o += `<text x="1.5" y="6.3" font-size="${fs(T.VALUE)}" fill="#0e2236" font-weight="bold">${esc(c.value)}</text></svg>`;
  }
  if (T.stamp) {
    const s = T.stamp;
    o += `<rect x="${f2(s.x)}" y="${f2(s.y)}" width="${f2(s.w)}" height="${f2(s.h)}" fill="#fff" stroke="#c62828" stroke-width="0.6"/>`;
    o += `<text x="${f2(s.x + s.w / 2)}" y="${f2(s.y + s.h / 2 + 1.4)}" text-anchor="middle" font-size="${fs(3.6)}" fill="#c62828" font-weight="bold">${esc(s.text)}</text>`;
  }
  return o + '</g>';
}

module.exports = { toSVG };
