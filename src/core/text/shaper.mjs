// Shapes text the PDF's built-in Helvetica cannot show (Bangla, Greek, Cyrillic, symbols)
// with HarfBuzz and the bundled Noto fonts, and returns glyph outlines in em units (y up).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const isBengali = cp => (cp >= 0x0980 && cp <= 0x09FF) || cp === 0x0964 || cp === 0x0965;
// characters that belong to whichever script surrounds them (spaces, digits, punctuation, joiners)
const isCommon = cp => cp < 0x80 ? !/[A-Za-z]/.test(String.fromCharCode(cp))
  : cp === 0x200C || cp === 0x200D || (cp >= 0x2000 && cp <= 0x206F) || cp === 0xA0;

export async function createShaper({ fontsDir, harfbuzzEntry } = {}) {
  const hb = harfbuzzEntry ? await import(pathToFileURL(harfbuzzEntry).href) : await import('harfbuzzjs');
  const dir = fontsDir || path.join(path.dirname(new URL(import.meta.url).pathname), 'fonts');
  const load = file => {
    const face = new hb.Face(new hb.Blob(fs.readFileSync(path.join(dir, file))), 0);
    return { font: new hb.Font(face), upem: face.upem, outlines: new Map() };
  };
  const beng = load('NotoSansBengali.ttf');
  const latn = load('NotoSans.ttf');

  const fontFor = cp => {
    if (isBengali(cp)) return beng;
    if (latn.font.nominalGlyph(cp)) return latn;
    if (beng.font.nominalGlyph(cp)) return beng;
    return latn;
  };

  function runs(s) {
    const out = [];
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      const last = out[out.length - 1];
      if (isCommon(cp) && last) { last.text += ch; continue; }
      const F = isCommon(cp) ? latn : fontFor(cp);
      if (last && last.F === F) last.text += ch; else out.push({ F, text: ch });
    }
    return out;
  }

  function outline(F, gid) {
    let o = F.outlines.get(gid);
    if (!o) {
      const k = 1 / F.upem;
      o = F.font.glyphToJson(gid).map(c => ({ type: c.type, values: c.values.map(v => v * k) }));
      F.outlines.set(gid, o);
    }
    return o;
  }

  const cache = new Map();
  function shape(s) {
    let r = cache.get(s);
    if (r) return r;
    const glyphs = []; let pen = 0;
    for (const run of runs(s)) {
      const { F } = run, k = 1 / F.upem;
      const buf = new hb.Buffer();
      buf.addText(run.text);
      buf.guessSegmentProperties();
      hb.shape(F.font, buf);
      const info = buf.getGlyphInfos(), pos = buf.getGlyphPositions();
      for (let i = 0; i < info.length; i++) {
        const cmds = outline(F, info[i].codepoint);
        if (cmds.length) glyphs.push({ x: pen + pos[i].xOffset * k, y: pos[i].yOffset * k, cmds });
        pen += pos[i].xAdvance * k;
      }
    }
    r = { adv: pen, glyphs };
    if (cache.size > 5000) cache.clear();
    cache.set(s, r);
    return r;
  }

  return { shape, fonts: ['Noto Sans Bengali', 'Noto Sans'] };
}
