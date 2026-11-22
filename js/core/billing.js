// White — حساب الفاتورة. نفس معادلة close_session في قاعدة البيانات
(function (g) {
  'use strict';
  // الدقائق المحسوبة: الأكبر بين الوقت الفعلي والوقت المحجوز والحد الأدنى، مقرّبة لأعلى لأقرب خطوة
  function billableMinutes(startedAt, plannedEnd, endedAt, rules) {
    const actual = Math.max(0, Math.round((endedAt - startedAt) / 6e4 * 100) / 100);
    const planned = plannedEnd ? (plannedEnd - startedAt) / 6e4 : 0;
    const base = Math.max(actual, planned, rules.minMinutes);
    return Math.ceil(base / rules.stepMin - 1e-9) * rules.stepMin;
  }
  function invoice(session, items, priceHour, endedAt, rules) {
    const minutes = billableMinutes(session.started_at, session.planned_end, endedAt, rules);
    const timeAmount = Math.round(priceHour * minutes / 60 * 100) / 100;
    const itemsAmount = Math.round(items.reduce((s, i) => s + i.unit_price * (i.qty || 1), 0) * 100) / 100;
    return { minutes, time_amount: timeAmount, items_amount: itemsAmount, total: Math.round((timeAmount + itemsAmount) * 100) / 100 };
  }
  g.WhiteBilling = { billableMinutes, invoice };
  if (typeof module !== 'undefined') module.exports = g.WhiteBilling;
})(typeof window !== 'undefined' ? window : globalThis);
