// White — تنسيق الأرقام والمدد بالعربي الصحيح (ساعة، ساعتين، ٣ ساعات ... ١١ ساعة)
(function (g) {
  'use strict';
  const loc = () => (g.WHITE_CONFIG && g.WHITE_CONFIG.locale) || 'ar-EG';
  const cur = () => (g.WHITE_CONFIG && g.WHITE_CONFIG.currency) || 'ج.م';
  const num = n => new Intl.NumberFormat(loc(), { maximumFractionDigits: 2 }).format(n);
  // العدد المفرد/المثنى/من 3 إلى 10 جمع/11 فأكثر مفرد
  function plural(n, one, two, few, many) {
    n = Math.round(n);
    if (n === 1) return one; if (n === 2) return two;
    return num(n) + ' ' + (n >= 3 && n <= 10 ? few : many);
  }
  const hoursInt = n => plural(n, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  const mins = m => plural(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
  // 1 → ساعة · 1.5 → ساعة ونصف · 2 → ساعتين · 3 → ٣ ساعات · 10 → ١٠ ساعات · 11 → ١١ ساعة
  function hours(h) {
    const whole = Math.floor(h + 1e-9), frac = h - whole;
    if (Math.abs(frac - 0.5) < 1e-6) return whole === 0 ? 'نصف ساعة' : hoursInt(whole) + ' ونصف';
    const rest = Math.round(frac * 60);
    if (!rest) return hoursInt(whole);
    return (whole ? hoursInt(whole) + ' و' : '') + mins(rest);
  }
  // من عدد دقائق: ساعة و٣٠ دقيقة
  function duration(totalMin) {
    const t = Math.max(0, Math.round(totalMin)), h = Math.floor(t / 60), r = t % 60;
    if (!h) return mins(r); return hoursInt(h) + (r ? ' و' + mins(r) : '');
  }
  const money = n => num(n) + ' ' + cur();
  g.WhiteFmt = { num, plural, hours, mins, duration, money };
  if (typeof module !== 'undefined') module.exports = g.WhiteFmt;
})(typeof window !== 'undefined' ? window : globalThis);
