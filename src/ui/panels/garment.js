'use strict';
// Pattern panel for garment files (Lectra and other AAMA/ASTM exports): what the file says about itself,
// which sizes of a graded nest to print, and whether each size gets its own pages.
(() => {
  const { $, el, opts } = App;

  function render() {
    const d = App.current(), g = d && d.garment;
    $('garmentSec').hidden = !g;
    if (!g) return;
    d.hideSizes = d.hideSizes || new Set();
    $('garmentVendor').textContent = g.vendor;
    const f = $('garmentFacts'); f.innerHTML = '';
    const add = (k, v) => { if (v) f.append(el('dt', {}, k), el('dd', {}, v)); };
    add('Design', g.design);
    add('Pieces', [...new Set(g.pieces.map(p => p.piece))].join(', '));
    add('Units', g.units === 'mm' ? 'Metric (from the file)' : g.units === 'in' ? 'Inches (from the file)' : '');
    add('Master size', g.masterSize);

    const box = $('sizes'); box.innerHTML = '';
    $('sizesLabel').hidden = box.hidden = $('splitSizes').parentElement.hidden = g.sizes.length < 2;
    for (const size of g.sizes) {
      const on = !d.hideSizes.has(size);
      const b = el('button', { type: 'button', className: 'size-chip' }, size);
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? `Leave out size ${size}` : `Print size ${size}`;
      b.onclick = () => {
        if (on && g.sizes.filter(s => !d.hideSizes.has(s)).length === 1) { App.status('Keep at least one size', 'err'); return; }
        if (on) d.hideSizes.add(size); else d.hideSizes.delete(size);
        render(); App.convert({ delay: 150 });
      };
      box.append(b);
    }
    $('splitSizes').checked = !!opts.splitSizes;
  }

  $('splitSizes').onchange = () => { opts.splitSizes = $('splitSizes').checked; App.changed({ fresh: false }); };
  App.on('result', render);
  App.on('settings', render);
  App.garment = { render };
})();
