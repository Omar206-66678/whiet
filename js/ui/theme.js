// White — مدير الثيم: تلقائي (يتبع الجهاز) / فاتح / داكن. يغيّر ألوان الصفحة وشريط المتصفح وأيقونة الزر
(function (g) {
  'use strict';
  const KEY = 'white-theme', mq = g.matchMedia ? g.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  let mode = 'auto'; try { mode = localStorage.getItem(KEY) || 'auto'; } catch (_) {}
  if (mode !== 'light' && mode !== 'dark') mode = 'auto';
  const eff = () => (mode === 'auto' ? (mq.matches ? 'dark' : 'light') : mode);
  function paint() {
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      b.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-' + (eff() === 'dark' ? 'sun' : 'moon') + '"/></svg>';
      b.setAttribute('aria-label', eff() === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن');
    });
  }
  function apply() {
    const t = eff(), r = document.documentElement; r.dataset.theme = t; r.style.colorScheme = t;
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#08080B' : '#F4F5F9');
    paint();
  }
  function set(m) { mode = m; try { localStorage.setItem(KEY, m); } catch (_) {} apply(); }
  const toggle = () => set(eff() === 'dark' ? 'light' : 'dark');
  if (mq.addEventListener) mq.addEventListener('change', () => { if (mode === 'auto') apply(); });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-theme-toggle]')) toggle(); });
  document.addEventListener('DOMContentLoaded', paint);
  // وضع الأداء: تلقائي / خفيف (بدون حركة) / كامل
  const PK = 'white-perf'; let pm = 'auto'; try { pm = localStorage.getItem(PK) || 'auto'; } catch (_) {}
  if (!['auto', 'lite', 'full'].includes(pm)) pm = 'auto';
  const autoLite = () => (g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches) || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.connection && navigator.connection.saveData);
  const applyPerf = () => { document.documentElement.dataset.perf = pm === 'auto' ? (autoLite() ? 'lite' : 'full') : pm; };
  g.WhitePerf = { get: () => pm, effective: () => document.documentElement.dataset.perf, set(m) { pm = m; try { localStorage.setItem(PK, m); } catch (_) {} applyPerf(); } };
  applyPerf();
  g.WhiteTheme = { get: () => mode, effective: eff, set, toggle, paint };
  apply();
})(window);
