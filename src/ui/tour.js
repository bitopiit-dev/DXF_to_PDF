'use strict';
// A short welcome tour, shown once after the first drawing opens and again from Help > Show the welcome tour.
(() => {
  const { $ } = App;
  const KEY = 'tourDone';
  const STEPS = [
    { at: '#files', title: 'Your drawings', text: 'Every drawing you open waits here. The dot shows its state: blue is ready, green is saved, red needs attention.' },
    { at: '#stage', title: 'A preview at true paper size', text: 'Scroll or pinch to zoom at the cursor and drag to move. The rulers are in paper millimetres, and the floating toolbar switches the grid, rulers and sheet outlines.' },
    { at: () => $('scaleMode').closest('section'), title: 'Exact scale, with a suggestion', text: 'Choose Fit to sheet, or type a scale such as 1:50. When the drawing could print larger, or needs too many sheets, a one-click suggestion appears here.' },
    { at: '.layers-sec', title: 'Layers and line weights', text: 'Use the eye to hide a layer, the swatch to recolour it, and 1× to make its lines thinner or thicker. The title block is just below.' },
    { at: '.presets', title: 'Presets', text: 'Save these settings as a preset and switch back to them in one click next time.' },
    { at: '.out-actions', title: 'Your PDF, and shortcuts', text: 'Open or save the PDF, or save and combine several at once. In Windows Explorer you can also right-click a .dxf file and choose Convert to PDF, or let a watch folder do it for you.' },
  ];
  const tour = $('tour'), spot = $('tourSpot'), card = $('tourCard');
  let i = 0, active = false, lastFocus = null;

  const target = s => {
    const el = typeof s.at === 'function' ? s.at() : document.querySelector(s.at);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 20 && r.right > 0 && r.left < innerWidth ? r : null; // hidden in a drawer on small windows
  };

  function place() {
    const s = STEPS[i], r = target(s), pad = 8, gap = 14;
    $('tourStep').textContent = `${i + 1} of ${STEPS.length}`;
    $('tourTitle').textContent = s.title;
    $('tourText').textContent = s.text;
    $('tourBack').disabled = i === 0;
    $('tourNext').textContent = i === STEPS.length - 1 ? 'Done' : 'Next';
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (!r) {
      spot.hidden = true; tour.classList.add('no-spot');
      card.style.left = (innerWidth - cw) / 2 + 'px'; card.style.top = (innerHeight - ch) / 2 + 'px';
      return;
    }
    spot.hidden = false; tour.classList.remove('no-spot');
    Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    // beside the target where there is room, otherwise below or above it, always inside the window
    let x, y;
    if (r.right + gap + cw < innerWidth - 12) { x = r.right + gap; y = r.top; }
    else if (r.left - gap - cw > 12) { x = r.left - gap - cw; y = r.top; }
    else if (r.bottom + gap + ch < innerHeight - 12) { x = r.left; y = r.bottom + gap; }
    else { x = r.left; y = r.top - gap - ch; }
    card.style.left = Math.max(12, Math.min(x, innerWidth - cw - 12)) + 'px';
    card.style.top = Math.max(12, Math.min(y, innerHeight - ch - 12)) + 'px';
  }

  function start(force) {
    if (active || App.S.docs.length === 0) return;
    if (!force) { try { if (localStorage.getItem(KEY)) return; } catch { return; } }
    active = true; i = 0; lastFocus = document.activeElement;
    tour.hidden = false; requestAnimationFrame(() => { place(); tour.classList.add('on'); $('tourNext').focus(); });
  }
  function end() {
    if (!active) return;
    active = false; tour.classList.remove('on');
    try { localStorage.setItem(KEY, '3.1'); } catch { /* ignore */ }
    setTimeout(() => { tour.hidden = true; }, 180);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  const go = d => { const n = i + d; if (n < 0) return; if (n >= STEPS.length) return end(); i = n; place(); };

  $('tourNext').onclick = () => go(1);
  $('tourBack').onclick = () => go(-1);
  $('tourSkip').onclick = end;
  addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') { // keep focus inside the card
      const f = [...card.querySelectorAll('button:not(:disabled)')], k = f.indexOf(document.activeElement);
      e.preventDefault(); f[(k + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    }
  }, true);
  addEventListener('resize', () => { if (active) place(); });

  // first time: after the first drawing has been drawn and the layout has settled
  App.on('result', () => setTimeout(() => start(false), 600));
  App.tour = { start, end, active: () => active };
})();
