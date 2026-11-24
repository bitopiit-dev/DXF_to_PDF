'use strict';
// The list of open drawings, with a status dot: blue ready, green saved, red needs attention.
(() => {
  const { $, el, S, kb } = App;
  function render() {
    const q = $('queue'); q.innerHTML = '';
    for (const d of S.docs) {
      const state = d.error || (d.result && d.result.error) ? 'error' : d.state === 'saved' ? 'saved' : d.result ? 'ready' : 'new';
      const li = el('li', { id: 'q-' + d.id, role: 'option', dataset: { id: d.id, state } });
      li.setAttribute('aria-selected', String(d.id === S.sel));
      const name = el('span', { className: 'name', title: d.path }, d.name);
      const sub = el('span', { className: 'sub' });
      if (d.error) { sub.textContent = d.error; sub.classList.add('err'); }
      else if (d.state === 'saved') { sub.textContent = 'Saved as PDF'; sub.classList.add('ok'); sub.title = d.savedPath || ''; }
      else if (d.result && d.result.error) { sub.textContent = 'Needs a different scale'; sub.classList.add('err'); }
      else if (d.result && d.result.info) { const i = d.result.info; sub.textContent = `${i.size}, ${i.sheets} sheet${i.sheets > 1 ? 's' : ''}, ${i.fixed ? i.scale : 'fit ' + i.scale}`; }
      else sub.textContent = d.size ? kb(d.size) + ' DXF' : 'Not converted yet';
      const x = el('button', { type: 'button', className: 'x', tabIndex: -1, textContent: '×' });
      x.setAttribute('aria-label', 'Close ' + d.name);
      x.onclick = e => { e.stopPropagation(); close(d.id); };
      li.append(name, x, sub);
      li.onclick = () => App.select(d.id);
      li.ondblclick = () => { if (d.savedPath) App.desktop.reveal(d.savedPath); };
      q.append(li);
    }
    q.setAttribute('aria-activedescendant', S.sel ? 'q-' + S.sel : '');
    const ok = S.docs.filter(d => !d.error).length;
    $('fileCount').textContent = S.docs.length || '';
    $('batch').hidden = ok < 2;
    $('bSaveAll').textContent = `Save all ${ok}`;
  }
  function close(id) {
    const i = S.docs.findIndex(d => d.id === id); if (i < 0) return;
    S.docs.splice(i, 1); App.desktop.close(id);
    if (S.sel === id) S.sel = null;
    if (!S.docs.length) { $('app').dataset.state = 'empty'; App.showRecent(); App.status('Ready'); render(); return; }
    render();
    if (!S.sel) App.select(S.docs[Math.min(i, S.docs.length - 1)].id);
  }
  $('queue').addEventListener('keydown', e => {
    const i = S.docs.findIndex(d => d.id === S.sel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = S.docs[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) App.select(n.id); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) close(S.sel);
  });
  App.queue = { render, close };
})();
