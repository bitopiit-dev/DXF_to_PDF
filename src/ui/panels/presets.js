'use strict';
// Export presets: built-in profiles plus the user's own, saved on this computer.
(() => {
  const { $, el, opts, Settings } = App;
  const Presets = window.Models.presets;
  let all = [];
  const sel = $('preset');

  function fill() {
    sel.innerHTML = '';
    sel.append(el('option', { value: '', textContent: 'Custom settings' }));
    const groups = [['Built in', all.filter(p => p.builtin)], ['My presets', all.filter(p => !p.builtin)]];
    for (const [label, list] of groups) {
      if (!list.length) continue;
      const g = el('optgroup', { label });
      for (const p of list) g.append(el('option', { value: p.name, textContent: p.name }));
      sel.append(g);
    }
    match();
  }
  // show which preset the current settings equal, or "Custom settings"
  function match() {
    const hit = all.find(p => Settings.same(opts, Settings.applyPreset(opts, p.settings)));
    sel.value = hit ? hit.name : '';
    const p = Presets.find(all, sel.value);
    $('presetDelete').disabled = !p || !!p.builtin;
  }
  sel.onchange = () => {
    const p = Presets.find(all, sel.value);
    if (!p) return;
    Object.assign(opts, Settings.applyPreset(opts, p.settings));
    App.sheet.sync(); App.titleBlock.sync();
    App.changed();
    App.status(`Using preset: ${p.name}`);
  };
  const form = $('presetForm'), err = $('presetErr');
  $('presetSave').onclick = () => { form.hidden = false; err.textContent = ''; $('presetName').value = ''; $('presetName').focus(); };
  $('presetCancel').onclick = () => { form.hidden = true; err.textContent = ''; };
  async function save() {
    const name = $('presetName').value.trim();
    const problem = Presets.validName(name);
    if (problem) { err.textContent = problem; return; }
    const r = await App.desktop.savePreset(name, Settings.forPreset(opts));
    if (!r.ok) { err.textContent = r.error; return; }
    all = r.presets; form.hidden = true; fill(); App.status(`Saved preset: ${name}`, 'ok');
  }
  $('presetOk').onclick = save;
  $('presetName').onkeydown = e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') $('presetCancel').click(); };
  $('presetDelete').onclick = async () => {
    const name = sel.value; if (!name) return;
    const r = await App.desktop.deletePreset(name);
    if (r.ok) { all = r.presets; fill(); App.status(`Deleted preset: ${name}`); } else err.textContent = r.error;
  };
  App.on('settings', match);
  App.desktop.presets().then(list => { all = list; fill(); });
})();
