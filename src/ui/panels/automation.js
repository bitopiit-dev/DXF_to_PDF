'use strict';
// Automation: the watch folder, automatic update checks, and remembering the settings that
// right-click "Convert to PDF" and the watch folder use.
(() => {
  const { $, desktop, opts, Settings } = App;
  const base = p => String(p).split(/[\\/]/).filter(Boolean).pop() || p;

  // the settings in use become the ones the file manager and the watch folder convert with
  let t = null;
  const remember = () => { clearTimeout(t); t = setTimeout(() => desktop.rememberSettings(Settings.normalize(opts)), 250); };
  App.on('settings', remember);
  remember();

  let converted = 0;
  function show(info) {
    const on = !!(info && info.on);
    $('watchBox').dataset.on = String(on);
    $('watchStop').hidden = !on;
    $('watchChoose').lastChild.textContent = on ? 'Change folder…' : 'Choose folder…';
    $('watchState').textContent = on
      ? `Watching ${info.folder}. Every DXF saved there becomes a PDF beside it.`
      : 'Watch a folder: every DXF saved there becomes a PDF beside it, with these settings, while this app is open.';
    $('watchState').title = on ? info.folder : '';
    const cell = $('sWatch');
    cell.hidden = !on;
    if (on) { cell.textContent = `Watching ${base(info.folder)}${converted ? `: ${converted} converted` : ''}`; cell.title = `${info.folder}\nClick to stop watching`; }
  }
  let current = null;
  async function choose() { converted = 0; current = await desktop.watchChoose(); show(current); }
  async function stop() { current = await desktop.watchStop(); show(current); App.status('Stopped watching the folder'); }

  $('watchChoose').onclick = choose;
  $('watchFromWelcome').onclick = choose;
  $('watchStop').onclick = stop;
  $('sWatch').onclick = stop;

  desktop.onWatch(ev => {
    if (ev.type === 'watching') App.status(`Watching ${base(ev.folder)} for new drawings`, 'ok');
    else if (ev.type === 'converting') App.status(`Converting ${base(ev.path)} from the watch folder`);
    else if (ev.type === 'converted') { converted++; App.status(`Saved ${base(ev.pdf)}`, 'ok', ev.pdf); if (current) show(current); }
    else if (ev.type === 'failed') App.status(`${base(ev.path)}: ${ev.error}`, 'err');
    else if (ev.type === 'stopped') { App.status(`Stopped watching: ${ev.error}`, 'err'); current = { ...(current || {}), on: false }; show(current); }
  });

  // pick up where the last session left off
  desktop.watchGet().then(async info => {
    current = info;
    show(info);
    if (!info.on && info.folder) { const r = await desktop.watchResume(); current = r; show(r); }
  });

  const au = $('autoUpdate');
  au.checked = opts.autoUpdate !== false;
  au.onchange = () => { opts.autoUpdate = au.checked; App.persist(); desktop.updateAuto(au.checked); };

  App.automation = { choose, stop };
})();
