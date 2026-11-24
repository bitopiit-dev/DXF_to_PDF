'use strict';
// Optional engineering title block: project, drawn by, date and a stamp. Scale and sheet number are automatic.
(() => {
  const { $, opts } = App;
  const fields = [['tbProject', 'project'], ['tbDrawnBy', 'drawnBy'], ['tbDate', 'date'], ['tbStamp', 'stamp']];
  function sync() {
    const tb = opts.titleBlock;
    $('tbOn').checked = tb.enabled;
    $('out').dataset.tb = tb.enabled ? 'on' : 'off';
    for (const [id, key] of fields) $(id).value = tb[key] || '';
  }
  $('tbOn').onchange = () => { opts.titleBlock = { ...opts.titleBlock, enabled: $('tbOn').checked }; sync(); App.changed({ fresh: false }); };
  for (const [id, key] of fields) {
    $(id).onchange = () => { opts.titleBlock = { ...opts.titleBlock, [key]: $(id).value.trim() }; App.changed({ fresh: false, delay: 150 }); };
  }
  App.titleBlock = { sync };
  sync();
})();
