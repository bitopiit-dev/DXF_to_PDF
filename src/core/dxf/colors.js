'use strict';
/* ---------- colors ---------- */
function hsv(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return rgbHex(f(5) * 255, f(3) * 255, f(1) * 255);
}
const rgbHex = (r, g, b) => '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
const intHex = n => rgbHex((n >> 16) & 255, (n >> 8) & 255, n & 255);
function aci(i) {
  const base = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#000000', 8: '#808080', 9: '#c0c0c0' };
  if (base[i]) return base[i];
  if (i >= 250 && i <= 255) { const g = [51, 91, 132, 173, 214, 255][i - 250]; return rgbHex(g, g, g); }
  if (i >= 10 && i < 250) {
    const sub = i % 10;
    return hsv((Math.floor(i / 10) - 1) * 15, sub % 2 ? 0.5 : 1, [1, 1, .8, .8, .6, .6, .5, .5, .3, .3][sub]);
  }
  return '#000000';
}


const layerHex = L => (L.tc != null ? intHex(L.tc) : aci(Math.abs(L.color) || 7));
module.exports = { aci, intHex, rgbHex, layerHex };
