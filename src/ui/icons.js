'use strict';
// Line icons drawn on a 20 x 20 grid, stroked in the current text colour.
(() => {
  const P = {
    eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.4"/>',
    eyeOff: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" opacity=".45"/><path d="M3.5 16.5l13-13"/>',
    zoomIn: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.6 12.6L17 17M6 8.5h5M8.5 6v5"/>',
    zoomOut: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.6 12.6L17 17M6 8.5h5"/>',
    fit: '<path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5"/><rect x="6.5" y="6.5" width="7" height="7" rx=".5"/>',
    grid: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 7.7h14M3 12.3h14M7.7 3v14M12.3 3v14"/>',
    ruler: '<path d="M2.6 13.6L13.6 2.6l3.8 3.8-11 11z"/><path d="M6.2 10l1.6 1.6M8.6 7.6l1.6 1.6M11 5.2l1.6 1.6"/>',
    tiles: '<rect x="3" y="3.5" width="14" height="13" rx="1"/><path d="M10 3.5v13M3 10h14" stroke-dasharray="2 1.6"/>',
    save: '<path d="M4 3h9.5L17 6.5V17H3V3z"/><path d="M6.5 3v4h6V3M6 17v-5h8v5"/>',
    trash: '<path d="M4 6h12M8 6V3.8h4V6M5.6 6l.9 11h7l.9-11"/>',
    list: '<path d="M3 5h14M3 10h14M3 15h9"/>',
    menu: '<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>',
    folder: '<path d="M2.5 6.2V15a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H10L8.3 5H3.5a1 1 0 0 0-1 1.2z"/><circle cx="10" cy="11.5" r="1.6"/>',
    update: '<path d="M15.5 8.5A5.8 5.8 0 0 0 5 6.2M4.5 11.5A5.8 5.8 0 0 0 15 13.8"/><path d="M4.6 3.4v3h3M15.4 16.6v-3h-3"/>',
    sliders: '<path d="M4 5h12M4 10h12M4 15h12"/><circle cx="8" cy="5" r="1.8"/><circle cx="13" cy="10" r="1.8"/><circle cx="7" cy="15" r="1.8"/>',
  };
  App.icon = name => `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true">${P[name] || ''}</svg>`;
  // buttons written in the markup with data-icon="name" get their icon here
  App.paintIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach(b => {
    if (!b.querySelector('svg.ic')) b.insertAdjacentHTML('afterbegin', App.icon(b.dataset.icon));
  });
})();
