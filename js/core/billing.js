// White — حساب الفاتورة. نفس معادلة close_session في قاعدة البيانات
// القاعدة: الحساب على الوقت الفعلي اللي قعده العميل (حتى لو حجز وقت أطول)، مقرّب لأعلى لأقرب خطوة وبحد أدنى
(function (g) {
  'use strict';
  const actualMin = (startedAt, endedAt) => Math.max(0, Math.round((endedAt - startedAt) / 6e4 * 100) / 100);
  function billableMinutes(startedAt, endedAt, rules) {
    const base = Math.max(actualMin(startedAt, endedAt), rules.minMinutes);
    return Math.ceil(base / rules.stepMin - 1e-9) * rules.stepMin;
  }
  function invoice(session, items, priceHour, endedAt, rules) {
    const minutes = billableMinutes(session.started_at, endedAt, rules);
    const timeAmount = Math.round(priceHour * minutes / 60 * 100) / 100;
    const itemsAmount = Math.round(items.reduce((s, i) => s + Number(i.unit_price) * (i.qty || 1), 0) * 100) / 100;
    return { minutes, actual_minutes: actualMin(session.started_at, endedAt), time_amount: timeAmount, items_amount: itemsAmount, total: Math.round((timeAmount + itemsAmount) * 100) / 100 };
  }
  g.WhiteBilling = { billableMinutes, invoice, actualMin };
  if (typeof module !== 'undefined') module.exports = g.WhiteBilling;
})(typeof window !== 'undefined' ? window : globalThis);
