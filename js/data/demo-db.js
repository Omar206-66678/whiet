// White — قاعدة بيانات تجريبية محلية (نفس المتصفح فقط). في الإنتاج بنستخدم Supabase
(function (g) {
  'use strict';
  const KEY = 'white-demo-db-v4', C = g.WHITE_CONFIG;
  const seed = () => ({
    devices: [
      { id: 'd1', name: 'PS5 - غرفة 1', category: 'PS5', price_hour: 40, active: true },
      { id: 'd2', name: 'PS5 - غرفة 2', category: 'PS5', price_hour: 40, active: true },
      { id: 'd3', name: 'PS4 - جهاز 3', category: 'PS4', price_hour: 25, active: true },
      { id: 'd4', name: 'غرفة VIP', category: 'VIP', price_hour: 70, active: true }
    ],
    menu: C.menu.map((m, i) => ({ id: 'm' + (i + 1), name: m.name, desc: m.desc, cat: m.cat, price: m.price, active: true })),
    // حسابات تجريبية: pw=null تعني كلمة السر 123456
    users: [
      { id: 'u-owner', name: 'المالك', phone: '01000000000', role: 'owner', pw: null },
      { id: 'u-cashier', name: 'الكاشير', phone: '01000000001', role: 'cashier', pw: null }
    ],
    categories: [
      ...Object.entries(C.categories).map(([name, description], i) => ({ id: 'cd' + i, kind: 'device', name, description })),
      ...[...new Set(C.menu.map(m => m.cat))].map((name, i) => ({ id: 'cm' + i, kind: 'menu', name, description: '' }))
    ],
    sessions: [], items: [], cafeOrders: [], cafeItems: [], bookings: [], invoices: [], expenses: []
  });
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.devices && d.users && d.cafeOrders) return d; } catch (_) {} return seed(); };
  let db = load();
  g.WhiteDemoDB = {
    get: () => db, reload: () => (db = load()),
    save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {} },
    uid: p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  };
})(window);
