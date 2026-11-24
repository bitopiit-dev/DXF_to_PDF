'use strict';
// Paper, orientation, margin, scale, units, overlap and line colour, plus the smart scale hint.
(() => {
  const { $, el, opts } = App;
  const segs = [];

  // segmented control bound to opts[key]
  function seg(id, key, onChange) {
    const box = $(id);
    const sync = () => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === opts[key])));
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || opts[key] === b.dataset.v) return;
      opts[key] = b.dataset.v; sync(); onChange && onChange();
    });
    box.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const bs = [...box.querySelectorAll('button')], i = bs.findIndex(b => b.dataset.v === opts[key]);
      const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
      n.focus(); n.click();
    });
    segs.push(sync); sync();
  }
  App.seg = seg;

  const changed = () => App.changed();
  function numberInput(id, key, min, max) {
    const inp = $(id);
    inp.onchange = () => {
      const v = Math.min(max, Math.max(min, parseFloat(inp.value)));
      if (!isFinite(v)) { inp.value = opts[key]; return; }
      inp.value = opts[key] = v; changed();
    };
  }
  $('size').onchange = () => { opts.size = $('size').value; changed(); };
  $('units').onchange = () => { opts.units = $('units').value; changed(); };
  numberInput('margin', 'margin', 0, 40);
  numberInput('overlap', 'overlap', 0, 50);
  $('scale').onchange = () => {
    const v = $('scale').value.trim().replace(/\s+/g, '').replace('/', ':');
    if (!/^\d*\.?\d+:\d*\.?\d+$/.test(v)) { $('scale').value = opts.scale; App.status('Write the scale as 1:50 or 2:1', 'err'); return; }
    opts.scale = v; $('scale').value = v; changed();
  };
  seg('orient', 'orient', changed);
  seg('ink', 'ink', () => App.changed({ fresh: false }));
  seg('scaleMode', 'scaleMode', () => { $('out').dataset.scale = opts.scaleMode; changed(); });

  // put every control back in line with opts, e.g. after a preset is applied
  function sync() {
    $('size').value = opts.size; $('units').value = opts.units; $('margin').value = opts.margin;
    $('overlap').value = opts.overlap; $('scale').value = opts.scale;
    $('out').dataset.scale = opts.scaleMode;
    segs.forEach(s => s());
  }

  function setScale(s) { opts.scaleMode = 'fixed'; opts.scale = s; sync(); App.changed(); }

  function hint() {
    const h = $('scaleHint'); h.innerHTML = '';
    const r = App.current() && App.current().result; if (!r || !r.info) return;
    const i = r.info;
    const say = (text, s) => {
      h.append(text);
      if (s && (opts.scaleMode === 'fit' || s !== opts.scale)) {
        const b = el('button', { className: 'link', type: 'button', textContent: `Use ${s}` }); b.onclick = () => setScale(s); h.append(' ', b);
      }
    };
    const N = v => { const m = String(v).match(/^(\d*\.?\d+):(\d*\.?\d+)$/); return m ? m[2] / m[1] : NaN; };
    if (opts.scaleMode === 'fit') say(`Prints at about ${i.fitScale}. For a scale you can measure,`, i.suggested);
    else if (i.sheets > 1 && !r.error) say(`Splits into ${i.sheets} sheets that overlap by ${opts.overlap} mm. To fit one sheet,`, i.suggested);
    else if (!r.error) {
      if (i.suggested && N(i.suggested) < N(opts.scale) * 0.999) say(`Fits one ${i.size} sheet with room to spare. To print it larger,`, i.suggested);
      else say(`Fits one ${i.size} sheet. Check the print with the scale bar in the margin.`);
    }
  }
  App.on('result', hint);
  App.sheet = { sync, hint, setScale };
  sync();
})();
