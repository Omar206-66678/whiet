// White — أيقونات SVG موحّدة + يد تحكم ثلاثية الأبعاد (متجهات، تظهر حادة على أي دقة)
(function (g) {
  'use strict';
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    gamepad: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.42.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.55-.6-6.58-.69-7.26A4 4 0 0 0 17.32 5z"/>',
    coffee: '<path d="M10 2v2M14 2v2M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    calendar: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11"/>',
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V7M17 16v-9"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'
  };
  const sym = Object.entries(P).map(([k, v]) =>
    `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`).join('');
  const PAD = `<defs>
    <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBF2"/><stop offset=".5" stop-color="#F1DDBC"/><stop offset="1" stop-color="#C9985A"/></linearGradient>
    <linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="gs" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#9A6E3A"/><stop offset="1" stop-color="#2E1D0B"/></radialGradient>
    <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8D98C"/><stop offset="1" stop-color="#C98A2B"/></linearGradient>
  </defs>
  <symbol id="pad" viewBox="0 0 160 110">
    <ellipse cx="80" cy="104" rx="56" ry="5" fill="#5A3A12" opacity=".22"/>
    <path d="M44 14C30 14 22 22 17 40L7 82C4 96 10 104 21 104 29 104 34 99 39 90L46 76C48 72 52 70 56 70H104C108 70 112 72 114 76L121 90C126 99 131 104 139 104 150 104 156 96 153 82L143 40C138 22 130 14 116 14Z" fill="url(#gb)" stroke="#B88A50" stroke-width="1.5"/>
    <path d="M46 18C34 18 27 25 23 41L14 78" fill="none" stroke="url(#gh)" stroke-width="3" stroke-linecap="round"/>
    <rect x="64" y="22" width="32" height="16" rx="6" fill="#EBD3A8" stroke="#C9A06A"/>
    <rect x="72" y="15" width="16" height="3" rx="1.5" fill="url(#gg)"/>
    <circle cx="62" cy="58" r="10" fill="#D9BC8A"/><circle cx="62" cy="58" r="7" fill="url(#gs)"/>
    <circle cx="98" cy="58" r="10" fill="#D9BC8A"/><circle cx="98" cy="58" r="7" fill="url(#gs)"/>
    <path d="M36 31h6v7h7v6h-7v7h-6v-7h-7v-6h7z" fill="#8A6234"/>
    <circle cx="121" cy="32" r="4.5" fill="url(#gg)"/><circle cx="121" cy="50" r="4.5" fill="#8A6234"/>
    <circle cx="112" cy="41" r="4.5" fill="#8A6234"/><circle cx="130" cy="41" r="4.5" fill="url(#gg)"/>
  </symbol>`;
  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${PAD}${sym}</svg>`);
  g.WhiteUI = { icon: (n, c) => `<svg class="i ${c || ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`, pad: c => `<svg class="${c || ''}" viewBox="0 0 160 110" aria-hidden="true"><use href="#pad"/></svg>` };
})(window);
