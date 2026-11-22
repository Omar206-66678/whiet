// White — ميلان ثلاثي الأبعاد مع لمعة تتبع المؤشر (للماوس فقط، ويحترم تقليل الحركة)
(function () {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let cur = null;
  const reset = t => { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); };
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest && e.target.closest('[data-tilt]');
    if (cur && cur !== t) reset(cur);
    cur = t; if (!t) return;
    const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    t.style.setProperty('--rx', ((0.5 - y) * 9).toFixed(2) + 'deg');
    t.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg');
    t.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    t.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  });
  document.addEventListener('pointerleave', () => { if (cur) reset(cur); }, true);
})();
