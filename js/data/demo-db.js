// White — قاعدة بيانات تجريبية محلية مشتركة بين صفحة العميل وصفحة الإدارة (نفس المتصفح فقط)
(function (g) {
  'use strict';
  const KEY = 'white-demo-db-v2';
  const seed = () => ({
    devices: [
      { id: 'd1', name: 'PS5 - غرفة 1', category: 'PS5', price_hour: 40 },
      { id: 'd2', name: 'PS5 - غرفة 2', category: 'PS5', price_hour: 40 },
      { id: 'd3', name: 'PS4 - جهاز 3', category: 'PS4', price_hour: 25 },
      { id: 'd4', name: 'غرفة VIP', category: 'VIP', price_hour: 70 }
    ], sessions: [], items: [], bookings: [], invoices: [], expenses: []
  });
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.devices) return d; } catch (_) {} return seed(); };
  let db = load();
  g.WhiteDemoDB = {
    get: () => db, reload: () => (db = load()),
    save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {} },
    uid: p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  };
})(window);
