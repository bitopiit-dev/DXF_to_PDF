'use strict';
// Facade over the converter modules: parse -> flatten -> plan -> SVG preview / PDF pages.
// Kept so existing callers and tests keep one stable entry point.
const parser = require('./dxf/parser');
const colors = require('./dxf/colors');
const { flatten, build } = require('./dxf/entities');
const metrics = require('./text/metrics');
const { extents } = require('./layout/extents');
const { SIZES, plan } = require('./layout/plan');
const { fmtScale } = require('./render/common');
const { toSVG } = require('./render/svg');
const { toPDF } = require('./render/pdf');

module.exports = {
  parse: parser.parse, decode: parser.decode, unitMM: parser.unitMM, unitName: parser.unitName, UNITS: parser.UNITS,
  layerHex: colors.layerHex, flatten, build, extents, plan, toSVG, toPDF, fmtScale, SIZES,
  setMeasure: metrics.setMeasure, setShaper: metrics.setShaper, needsShaping: metrics.needsShaping,
};
