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
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#0A0908' : '#F6F2EA');
    paint();
  }
  function set(m) { mode = m; try { localStorage.setItem(KEY, m); } catch (_) {} apply(); }
  const toggle = () => set(eff() === 'dark' ? 'light' : 'dark');
  if (mq.addEventListener) mq.addEventListener('change', () => { if (mode === 'auto') apply(); });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-theme-toggle]')) toggle(); });
  document.addEventListener('DOMContentLoaded', paint);
  g.WhiteTheme = { get: () => mode, effective: eff, set, toggle, paint };
  apply();
})(window);
