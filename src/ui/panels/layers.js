'use strict';
// Layers: visibility (eye), colour override and line-weight multiplier for each layer.
(() => {
  const { $, el } = App;
  const LO = window.Models.layerOverrides;

  function render() {
    const d = App.current(), box = $('layers'); box.innerHTML = '';
    const layers = (d && d.layers) || [];
    const shown = layers.filter(l => !d.hidden.has(l.name)).length;
    $('layerCount').textContent = layers.length ? `${shown} of ${layers.length}` : '';
    $('layerFilter').hidden = layers.length < 10;
    document.querySelector('.layer-tools').hidden = !layers.length;
    $('lReset').hidden = !d || !LO.count(d.overrides);
    if (d && !layers.length) { box.append(el('li', { className: 'layers-empty', textContent: 'This drawing has no layers; everything prints.' })); return; }
    const q = $('layerFilter').value.trim().toLowerCase();
    for (const l of layers) {
      if (q && !l.name.toLowerCase().includes(q)) continue;
      const off = d.hidden.has(l.name), o = d.overrides[l.name] || {};
      const li = el('li', { className: off ? 'off' : '' });

      const eye = el('button', { type: 'button', className: 'eye' });
      eye.innerHTML = App.icon(off ? 'eyeOff' : 'eye');
      eye.setAttribute('aria-pressed', String(!off));
      eye.setAttribute('aria-label', `${off ? 'Show' : 'Hide'} layer ${l.name}`);
      eye.onclick = () => { if (off) d.hidden.delete(l.name); else d.hidden.add(l.name); render(); App.convert({ delay: 150 }); };

      const sw = el('label', { className: 'sw' + (o.color ? ' custom' : ''), title: 'Colour in the PDF' });
      sw.style.background = o.color || l.color;
      const pick = el('input', { type: 'color', value: o.color || l.color });
      pick.setAttribute('aria-label', `Colour for layer ${l.name}`);
      pick.oninput = () => { sw.style.background = pick.value; };
      pick.onchange = () => { set(d, l.name, { color: pick.value.toLowerCase() === l.color.toLowerCase() ? null : pick.value }); };
      sw.append(pick);

      const name = el('span', { className: 'ln', title: l.name }, l.name);
      if (l.frozen || l.off) name.append(el('small', { textContent: l.frozen ? 'frozen' : 'off' }));

      const lw = el('select', { className: o.lw && o.lw !== 1 ? 'custom' : '' });
      lw.setAttribute('aria-label', `Line weight for layer ${l.name}`);
      for (const s of LO.LW_STEPS) lw.append(el('option', { value: String(s), textContent: `${s}×`, selected: (o.lw || 1) === s }));
      lw.onchange = () => set(d, l.name, { lw: parseFloat(lw.value) });

      li.append(eye, sw, name, lw); box.append(li);
    }
  }
  function set(d, name, patch) {
    const o = { ...(d.overrides[name] || {}), ...patch };
    if (!o.color) delete o.color;
    if (!o.lw || o.lw === 1) delete o.lw;
    if (Object.keys(o).length) d.overrides[name] = o; else delete d.overrides[name];
    render(); App.convert({ delay: 120 });
  }
  $('layerFilter').oninput = render;
  $('lAll').onclick = () => { const d = App.current(); if (!d) return; d.hidden.clear(); render(); App.convert(); };
  $('lNone').onclick = () => { const d = App.current(); if (!d) return; d.layers.forEach(l => d.hidden.add(l.name)); render(); App.convert(); };
  $('lReset').onclick = () => { const d = App.current(); if (!d) return; d.overrides = {}; render(); App.convert(); };
  App.layers = { render };
})();
