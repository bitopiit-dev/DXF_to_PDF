'use strict';
// Window chrome: the navy top bar doubles as the title bar, the menu button, the update banner, and motion.
(() => {
  const { $, desktop, opts } = App;
  const root = document.documentElement;
  root.classList.add('platform-' + (desktop.platform || 'unknown'));

  // the system's window buttons are drawn over the bar; keep their colours matched to it
  function syncTitleBar() {
    const cs = getComputedStyle(root);
    const color = cs.getPropertyValue('--bar').trim(), symbolColor = cs.getPropertyValue('--bar-ink').trim();
    if (color && symbolColor) desktop.setTitleBar({ color, symbolColor });
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTitleBar);

  // the application menu, opened from the bar (the classic menu bar is hidden with the custom title bar)
  $('appMenu').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    desktop.showMenu(r.left, r.bottom + 4);
  });

  /* ---------- update banner ---------- */
  const banner = $('updBanner');
  let dismissed = null;
  function showUpdate(st) {
    const go = $('updGo');
    if (st.state === 'ready') {
      $('updMsg').textContent = `Version ${st.version} is ready. It installs when you restart.`;
      go.textContent = 'Restart now'; go.hidden = false;
    } else if (st.state === 'available') {
      $('updMsg').textContent = `Version ${st.version} is available.`;
      go.textContent = 'Download'; go.hidden = false;
    } else if (st.state === 'downloading') {
      $('updMsg').textContent = `Downloading version ${st.version}… ${st.percent || 0}%`;
      go.hidden = true;
    } else {
      if (st.manual) {
        if (st.state === 'current') App.status(st.dev ? 'Updates are checked only in the installed app' : `You have the latest version (${st.version})`, 'ok');
        if (st.state === 'error') App.status('Could not check for updates: ' + st.error, 'err');
      }
      banner.hidden = true; return;
    }
    if (dismissed === st.version && !st.manual) return;
    banner.hidden = false;
  }
  desktop.onUpdate(showUpdate);
  $('updGo').onclick = () => desktop.updateInstall();
  $('updLater').onclick = () => {
    banner.classList.add('leaving');
    setTimeout(() => { banner.hidden = true; banner.classList.remove('leaving'); }, 180);
    const m = $('updMsg').textContent.match(/Version (\S+)/); dismissed = m && m[1];
  };

  /* ---------- motion: new previews settle in, new drawings slide into the list ---------- */
  App.on('result', () => {
    const p = $('paper'); p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter');
  });
  const seen = new Set();
  new MutationObserver(() => {
    $('queue').querySelectorAll('li[data-id]').forEach(li => {
      if (!seen.has(li.dataset.id)) { seen.add(li.dataset.id); li.classList.add('arrive'); }
    });
  }).observe($('queue'), { childList: true });

  App.chrome = { syncTitleBar };
  syncTitleBar();
  desktop.updateAuto(opts.autoUpdate !== false);
})();
