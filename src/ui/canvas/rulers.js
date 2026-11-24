'use strict';
// Millimetre rulers along the preview and the cutting-mat grid behind it, crisp at any display scaling.
(() => {
  const { $ } = App;
  const stage = $('stage');
  const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

  function grid(V) {
    if (!V.k) return;
    const minor = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(mm => mm * V.k >= 14) || 1000;
    stage.style.setProperty('--gm', minor * V.k + 'px');
    stage.style.setProperty('--gM', minor * 5 * V.k + 'px');
    stage.style.setProperty('--gx', V.x + 'px');
    stage.style.setProperty('--gy', V.y + 'px');
  }

  function draw(V) {
    grid(V);
    if (!App.opts.showRulers) return;
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue('--ruler-ink').trim(), mark = cs.getPropertyValue('--mark').trim();
    for (const [id, horiz] of [['rulerH', true], ['rulerV', false]]) {
      const c = $(id), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) continue;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      if (!V.w || !V.k) continue;
      const L = horiz ? w : h, T = horiz ? h : w, o = horiz ? V.x : V.y, size = horiz ? V.w : V.h;
      g.fillStyle = 'rgba(255,122,26,.16)'; // the paper's extent, marked in orange
      const a = Math.max(0, o), b = Math.min(L, o + size * V.k);
      if (b > a) { if (horiz) g.fillRect(a, 0, b - a, T); else g.fillRect(0, a, T, b - a); }
      const major = STEPS.find(s => s * V.k >= 56) || 5000;
      const minor = STEPS.slice().reverse().find(s => s < major && major % s === 0 && s * V.k >= 6) || major;
      g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1;
      g.font = '600 10px "Barlow Condensed", sans-serif'; g.textBaseline = 'top';
      const from = Math.floor(-o / V.k / minor) * minor, to = (L - o) / V.k;
      g.beginPath();
      for (let mm = from; mm <= to; mm += minor) {
        const p = Math.round(o + mm * V.k) + 0.5, isMajor = Math.abs(mm % major) < 1e-9;
        const t = isMajor ? T * 0.55 : (Math.abs(mm % (major / 2)) < 1e-9 ? T * 0.35 : T * 0.2);
        if (horiz) { g.moveTo(p, T); g.lineTo(p, T - t); } else { g.moveTo(T, p); g.lineTo(T - t, p); }
        if (isMajor) {
          const s = String(Math.round(mm));
          if (horiz) g.fillText(s, p + 3, 2);
          else { g.save(); g.translate(2, p + 3); g.rotate(Math.PI / 2); g.fillText(s, 0, -T + 4); g.restore(); }
        }
      }
      g.stroke();
      if (V.cursor) {
        const p = Math.round(horiz ? V.cursor.x : V.cursor.y) + 0.5;
        g.strokeStyle = mark; g.lineWidth = 1.5; g.beginPath();
        if (horiz) { g.moveTo(p, 0); g.lineTo(p, T); } else { g.moveTo(0, p); g.lineTo(T, p); }
        g.stroke();
      }
    }
  }
  App.on('view', draw);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => draw(App.view.V));
  App.rulers = { draw: () => draw(App.view.V) };
})();
