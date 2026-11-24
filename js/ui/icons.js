// White — الأيقونات + الشعار + يد التحكم ثلاثية الأبعاد (كلها متجهات SVG: حادة على أي دقة)
// أسلوب الأيقونات: خط 1.9 بأطراف مدوّرة، مع تعبئة خفيفة (duotone) للأشكال المغلقة
(function (g) {
  'use strict';
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    gamepad: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.42.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.55-.6-6.58-.69-7.26A4 4 0 0 0 17.32 5z"/>',
    coffee: '<path d="M10 2v2M14 2v2M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    calendar: '<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11"/>',
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V7M17 16v-9"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.46-1.19a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"/>',
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M16 13h.01"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    play: '<path d="M6 4v16l14-8z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'
  };
  // أيقونات أشكالها مغلقة: نضيف لها تعبئة خفيفة
  const DUO = ['home', 'gamepad', 'coffee', 'user', 'calendar', 'clock', 'shield', 'grid', 'info', 'alert', 'moon'];
  const sym = Object.entries(P).map(([k, v]) =>
    `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" ${DUO.includes(k) ? 'style="fill:var(--ifill,none)"' : ''} stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`).join('');

  const DEFS = `<defs>
    <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#E9EDF9"/><stop offset="1" stop-color="#BAC4E4"/></linearGradient>
    <linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF6A1F"/><stop offset="1" stop-color="#FFB24A"/></linearGradient>
    <radialGradient id="gs" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#585866"/><stop offset="1" stop-color="#0B0B10"/></radialGradient>
    <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF5A14"/><stop offset=".55" stop-color="#FF8A2A"/><stop offset="1" stop-color="#FFB84F"/></linearGradient>
    <linearGradient id="lgl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>`;
  const PAD = `<symbol id="pad" viewBox="0 0 160 110">
    <ellipse cx="80" cy="104" rx="56" ry="5" fill="#000" opacity=".3"/>
    <path d="M44 14C30 14 22 22 17 40L7 82C4 96 10 104 21 104 29 104 34 99 39 90L46 76C48 72 52 70 56 70H104C108 70 112 72 114 76L121 90C126 99 131 104 139 104 150 104 156 96 153 82L143 40C138 22 130 14 116 14Z" fill="url(#gb)" stroke="#B4BFE0" stroke-width="1.4"/>
    <path d="M46 18C34 18 27 25 23 41L14 78" fill="none" stroke="url(#gh)" stroke-width="3" stroke-linecap="round"/>
    <path d="M58 16h44c9 0 13 5 13 13v27c0 9-5 14-13 14H58c-8 0-13-5-13-14V29c0-8 4-13 13-13z" fill="#13131A"/>
    <path d="M60 18c-8 0-12 4-12 11" fill="none" stroke="url(#gl)" stroke-width="2.2" stroke-linecap="round"/><path d="M100 18c8 0 12 4 12 11" fill="none" stroke="url(#gl)" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="66" y="24" width="28" height="15" rx="5" fill="#22222C" stroke="#3A3A48" stroke-width=".8"/>
    <circle cx="62" cy="58" r="9.5" fill="#1E1E27"/><circle cx="62" cy="58" r="6.5" fill="url(#gs)"/>
    <circle cx="98" cy="58" r="9.5" fill="#1E1E27"/><circle cx="98" cy="58" r="6.5" fill="url(#gs)"/>
    <path d="M30 31h5.5v6.5H42v5.5h-6.5v6.5H30v-6.5h-6.5v-5.5H30z" fill="#6B6B7A"/>
    <circle cx="127" cy="31" r="4.4" fill="#FFB24A"/><circle cx="127" cy="49" r="4.4" fill="#FF6A1F"/><circle cx="118" cy="40" r="4.4" fill="#FF4D6D"/><circle cx="136" cy="40" r="4.4" fill="#FFD27A"/>
  </symbol>`;
  const LOGO = `<symbol id="logo" viewBox="0 0 48 48">
    <rect width="48" height="48" rx="14" fill="url(#lg)"/><rect width="48" height="48" rx="14" fill="url(#lgl)"/>
    <path d="M11 16l6.2 17L24 21l6.8 12L37 16" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24" cy="11.5" r="2.5" fill="#fff"/>
  </symbol>`;
  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${DEFS}${PAD}${LOGO}${sym}</svg>`);
  g.WhiteUI = {
    names: Object.keys(P),
    icon: (n, c) => `<svg class="i ${c || ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`,
    pad: c => `<svg class="${c || ''}" viewBox="0 0 160 110" aria-hidden="true"><use href="#pad"/></svg>`,
    // شعار + اسم المكان
    brand: (size) => `<span class="brand ${size || ''}"><svg viewBox="0 0 48 48" aria-hidden="true"><use href="#logo"/></svg><span class="wm">White</span></span>`
  };
})(window);
