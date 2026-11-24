'use strict';
/* ---------- text ---------- */
function specials(s) {
  return s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
    .replace(/%%[uUoOkK]/g, '').replace(/%%%/g, '%');
}
function cleanMText(s) {
  s = s.replace(/\\\\/g, '\u0003').replace(/\\\{/g, '\u0001').replace(/\\\}/g, '\u0002');
  s = s.replace(/\\P/g, '\n').replace(/\\~/g, ' ');
  s = s.replace(/\\S([^;]*?)[\^/#]([^;]*?);/g, '$1/$2');
  s = s.replace(/\\[ACcFfHhQqTtWwp][^;]*;/g, '');
  s = s.replace(/\\[LlOoKkNX]/g, '');
  s = s.replace(/[{}]/g, '').replace(/\u0001/g, '{').replace(/\u0002/g, '}').replace(/\u0003/g, '\\');
  return specials(s);
}


module.exports = { specials, cleanMText };
