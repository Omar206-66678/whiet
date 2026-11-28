// White — المؤثرات: الحد الدوّار للكروت الظاهرة على الشاشة فقط (أداء أحسن) + إضاءة تتبع المؤشر على الماوس
(function () {
  'use strict';
  const MAX = 5; let raf = 0, timer = 0;
  const lite = () => document.documentElement.dataset.perf === 'lite';
  function update() {
    raf = 0; const els = document.querySelectorAll('.glass');
    if (lite() || document.hidden) { els.forEach(e => e.classList.remove('ringing')); return; }
    const vh = innerHeight, vis = [];
    els.forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 0 && r.bottom > 60 && r.top < vh - 40) vis.push(e); else e.classList.remove('ringing'); });
    vis.sort((a, b) => (b.matches('.sheet,.dlg') ? 1 : 0) - (a.matches('.sheet,.dlg') ? 1 : 0));
    vis.forEach((e, i) => e.classList.toggle('ringing', i < MAX));
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', schedule, { passive: true }); addEventListener('resize', schedule); document.addEventListener('visibilitychange', schedule);
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(schedule, 120); }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(schedule, 2000); schedule();

  // إضاءة تتبع المؤشر (ماوس فقط)
  if (!matchMedia('(hover: hover)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let cur = null; const reset = t => { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); t.style.removeProperty('--mx'); t.style.removeProperty('--my'); };
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || lite()) return;
    const t = e.target.closest && e.target.closest('[data-tilt], .glass'); if (cur && cur !== t) reset(cur); cur = t; if (!t) return;
    const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (t.hasAttribute('data-tilt')) { t.style.setProperty('--rx', ((0.5 - y) * 9).toFixed(2) + 'deg'); t.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg'); }
    t.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); t.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  });
})();
