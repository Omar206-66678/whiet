// White — توحيد رقم الهاتف. الدخول بالهاتف وكلمة السر (بدون رسائل SMS)
(function (g) {
  'use strict';
  const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
  function normalize(raw) {
    let s = String(raw == null ? '' : raw).replace(/[٠-٩]/g, d => AR.indexOf(d)).replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/\D/g, '');
    if (s.startsWith('0020')) s = '0' + s.slice(4); else if (s.startsWith('20') && s.length === 12) s = '0' + s.slice(2);
    return s;
  }
  // Supabase يطلب بريدًا، فنبني بريدًا داخليًا ثابتًا من الرقم (العميل لا يراه ولا يكتبه)
  g.WhitePhone = { normalize, valid: p => /^\d{10,15}$/.test(p), toEmail: p => 'p' + p + '@white-lounge.app' };
  if (typeof module !== 'undefined') module.exports = g.WhitePhone;
})(typeof window !== 'undefined' ? window : globalThis);
