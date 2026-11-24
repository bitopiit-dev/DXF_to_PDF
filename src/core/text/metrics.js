'use strict';
// Text widths: Helvetica metrics for Latin, the HarfBuzz shaper for everything else
let MEASURE = s => s.length * 0.6; // em-width of a Latin string in Helvetica; replaced by real font metrics
function setMeasure(f) { MEASURE = f; }

// Text outside Latin-1 (Bangla, Greek, Cyrillic, symbols…) cannot use the PDF's built-in Helvetica.
// A shaper turns it into glyph outlines: shape(s) -> { adv, glyphs: [{ x, y, cmds }] } in em units, y up.
let SHAPER = null;
function setShaper(f) { SHAPER = f; }
const needsShaping = s => /[^\x20-\x7E\xA0-\xFF]/.test(s);
const getShaper = () => SHAPER;
const emWidth = s => (SHAPER && needsShaping(s) ? SHAPER.shape(s).adv : MEASURE(s));


const measure = s => MEASURE(s);
module.exports = { setMeasure, setShaper, getShaper, needsShaping, emWidth, measure };
