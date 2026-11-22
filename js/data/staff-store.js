// White — بيانات الموظفين (كاشير + مالك). يُحمَّل فقط بعد التحقق من الدور. الأمان الحقيقي من RLS.
// kind = 'session' (طلبات داخل جلسة جهاز) أو 'cafe' (طلب كافيه مستقل بدون جهاز)
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, Core = g.WhiteCore, Bill = g.WhiteBilling, H = 36e5;
  function dayStart(now) { const d = new Date(now); d.setHours(C.dayStartHour, 0, 0, 0); return d.getTime() > now ? d.getTime() - 24 * H : d.getTime(); }
  const arabicMsg = e => { const m = (e && e.message) || ''; return /[\u0600-\u06FF]/.test(m) ? m : null; };
  const sum = items => Math.round(items.reduce((s, i) => s + Number(i.unit_price) * (i.qty || 1), 0) * 100) / 100;
  const LOCKED = { ok: false, error: 'الفاتورة مقفولة ولا يمكن تعديلها' };

  function demoStaff() {
    const DB = g.WhiteDemoDB;
    const itemsOf = (db, kind, id) => (kind === 'cafe' ? db.cafeItems.filter(i => i.order_id === id) : db.items.filter(i => i.session_id === id));
    return {
      mode: 'demo', dayStart,
      async board() {
        const db = DB.reload();
        return db.devices.filter(d => d.active !== false).map(d => { const s = db.sessions.find(x => x.device_id === d.id && !x.ended_at);
          return { ...d, session: s ? { ...s, items: itemsOf(db, 'session', s.id) } : null }; });
      },
      async startSession(deviceId, hours) {
        const db = DB.reload(), now = Date.now(), end = hours ? now + hours * H : null;
        if (db.sessions.some(s => s.device_id === deviceId && !s.ended_at)) return { ok: false, error: 'الجهاز عليه جلسة شغالة بالفعل' };
        if (end && Core.hasConflict(deviceId, now, end, [], db.bookings)) return { ok: false, error: 'الوقت ده بيتعارض مع حجز مؤكد على الجهاز' };
        db.sessions.push({ id: DB.uid('s'), device_id: deviceId, started_at: now, planned_end: end, ended_at: null }); DB.save(); return { ok: true };
      },
      // ---- الأصناف (جلسة أو كافيه مستقل) ----
      async itemsOf(kind, id) { return itemsOf(DB.reload(), kind, id).map(i => ({ ...i })); },
      async addItem(kind, id, it) {
        const db = DB.reload(); const row = { id: DB.uid('i'), name: it.name, unit_price: it.price, qty: 1 };
        if (kind === 'cafe') { const o = db.cafeOrders.find(x => x.id === id); if (!o || o.closed_at) return LOCKED; row.order_id = id; db.cafeItems.push(row); }
        else { const s = db.sessions.find(x => x.id === id); if (!s || s.ended_at) return LOCKED; row.session_id = id; db.items.push(row); }
        DB.save(); return { ok: true };
      },
      async removeItem(kind, itemId) {
        const db = DB.reload(), arr = kind === 'cafe' ? db.cafeItems : db.items, i = arr.findIndex(x => x.id === itemId); if (i < 0) return { ok: false, error: 'الصنف غير موجود' };
        const owner = kind === 'cafe' ? db.cafeOrders.find(o => o.id === arr[i].order_id) : db.sessions.find(s => s.id === arr[i].session_id);
        if (!owner || owner.closed_at || owner.ended_at) return LOCKED;
        arr.splice(i, 1); DB.save(); return { ok: true };
      },
      async previewInvoice(kind, id) {
        const db = DB.reload(), items = itemsOf(db, kind, id).map(i => ({ ...i }));
        if (kind === 'cafe') { const o = db.cafeOrders.find(x => x.id === id); return { kind, title: o.label || 'طلب كافيه', items, minutes: 0, actual_minutes: 0, time_amount: 0, items_amount: sum(items), total: sum(items) }; }
        const s = db.sessions.find(x => x.id === id), d = db.devices.find(x => x.id === s.device_id), now = Date.now();
        return { kind, title: d.name, started_at: s.started_at, now, items, ...Bill.invoice(s, items, d.price_hour, now, C.billing) };
      },
      async closeSession(id) {
        const db = DB.reload(), s = db.sessions.find(x => x.id === id && !x.ended_at); if (!s) return { ok: false, error: 'الجلسة مقفولة بالفعل' };
        const d = db.devices.find(x => x.id === s.device_id), items = itemsOf(db, 'session', id), now = Date.now();
        s.ended_at = now; const inv = Bill.invoice(s, items, d.price_hour, now, C.billing);
        db.invoices.push({ id: DB.uid('v'), kind: 'session', session_id: s.id, device_id: d.id, title: d.name, started_at: s.started_at, ended_at: now, ...inv, paid_at: now }); DB.save(); return { ok: true, invoice: inv };
      },
      // ---- كافيه مستقل (عملاء بدون بلايستيشن) ----
      async cafeOrders() { const db = DB.reload(); return db.cafeOrders.filter(o => !o.closed_at).map(o => ({ ...o, items: itemsOf(db, 'cafe', o.id).map(i => ({ ...i })) })); },
      async openCafe(label) { const db = DB.reload(), o = { id: DB.uid('o'), label: label || '', opened_at: Date.now(), closed_at: null }; db.cafeOrders.push(o); DB.save(); return { ok: true, id: o.id }; },
      async cancelCafe(id) { const db = DB.reload(); if (itemsOf(db, 'cafe', id).length) return { ok: false, error: 'الطلب فيه أصناف. شيلها الأول' }; db.cafeOrders = db.cafeOrders.filter(o => o.id !== id); DB.save(); return { ok: true }; },
      async closeCafe(id) {
        const db = DB.reload(), o = db.cafeOrders.find(x => x.id === id && !x.closed_at); if (!o) return { ok: false, error: 'الطلب مقفول بالفعل' };
        const items = itemsOf(db, 'cafe', id), now = Date.now(), total = sum(items); o.closed_at = now;
        db.invoices.push({ id: DB.uid('v'), kind: 'cafe', order_id: id, title: o.label || 'طلب كافيه', started_at: o.opened_at, ended_at: now, minutes: 0, actual_minutes: 0, time_amount: 0, items_amount: total, total, paid_at: now }); DB.save(); return { ok: true };
      },
      async bookings() {
        const db = DB.reload(), now = Date.now();
        const rows = db.bookings.filter(b => ['pending', 'confirmed'].includes(b.status) && b.ends_at > now).map(b => ({ ...b, device_name: (db.devices.find(d => d.id === b.device_id) || {}).name }));
        return { pending: rows.filter(b => b.status === 'pending').sort((a, b) => a.starts_at - b.starts_at), confirmed: rows.filter(b => b.status === 'confirmed').sort((a, b) => a.starts_at - b.starts_at) };
      },
      async decide(id, approve) {
        const db = DB.reload(), b = db.bookings.find(x => x.id === id && x.status === 'pending'); if (!b) return { ok: false, error: 'الطلب اتغيّر بالفعل' };
        if (approve && Core.hasConflict(b.device_id, b.starts_at, b.ends_at, db.sessions, db.bookings)) return { ok: false, error: 'الجهاز عليه حجز مؤكد أو جلسة شغالة في الوقت ده' };
        b.status = approve ? 'confirmed' : 'rejected'; DB.save(); return { ok: true };
      },
      // ---- للمالك فقط ----
      async summary() { const db = DB.reload(), from = dayStart(Date.now());
        return { invoices: db.invoices.filter(v => v.paid_at >= from).sort((a, b) => b.paid_at - a.paid_at), expenses: db.expenses.filter(x => x.spent_at >= from).sort((a, b) => b.spent_at - a.spent_at) }; },
      async invoiceDetail(id) { const db = DB.reload(), v = db.invoices.find(x => x.id === id); if (!v) return null; return { ...v, items: itemsOf(db, v.kind, v.kind === 'cafe' ? v.order_id : v.session_id).map(i => ({ ...i })) }; },
      async addExpense({ title, amount }) { const db = DB.reload(); db.expenses.push({ id: DB.uid('e'), title, amount, spent_at: Date.now() }); DB.save(); return { ok: true }; },
      async devicesAll() { return DB.reload().devices; },
      async saveDevice(d) { const db = DB.reload(); if (d.id) Object.assign(db.devices.find(x => x.id === d.id), { name: d.name, category: d.category, price_hour: d.price_hour, active: d.active }); else db.devices.push({ id: DB.uid('d'), name: d.name, category: d.category, price_hour: d.price_hour, active: d.active }); DB.save(); return { ok: true }; },
      async menuAll() { return DB.reload().menu; },
      async saveMenu(m) { const db = DB.reload(); if (m.id) Object.assign(db.menu.find(x => x.id === m.id), { name: m.name, desc: m.desc, cat: m.cat, price: m.price, active: m.active }); else db.menu.push({ id: DB.uid('m'), name: m.name, desc: m.desc, cat: m.cat, price: m.price, active: m.active }); DB.save(); return { ok: true }; },
      async categories() { return DB.reload().categories.map(c => ({ ...c })); },
      async saveCategory(c) {
        const db = DB.reload(), name = (c.name || '').trim(); if (!name) return { ok: false, error: 'اكتب اسم الفئة' };
        if (db.categories.some(x => x.kind === c.kind && x.name === name && x.id !== c.id)) return { ok: false, error: 'الفئة موجودة بالفعل' };
        if (c.id) { const x = db.categories.find(y => y.id === c.id), old = x.name; x.name = name; x.description = c.description || '';
          if (old !== name) (c.kind === 'device' ? db.devices : db.menu).forEach(i => { if (c.kind === 'device' && i.category === old) i.category = name; if (c.kind === 'menu' && i.cat === old) i.cat = name; }); }
        else db.categories.push({ id: DB.uid('c'), kind: c.kind, name, description: c.description || '' });
        DB.save(); return { ok: true };
      },
      async deleteCategory(id) {
        const db = DB.reload(), x = db.categories.find(c => c.id === id); if (!x) return { ok: false, error: 'الفئة غير موجودة' };
        if (x.kind === 'device' ? db.devices.some(d => d.category === x.name) : db.menu.some(m => m.cat === x.name)) return { ok: false, error: 'فيه عناصر تابعة للفئة دي. انقلها لفئة تانية الأول' };
        db.categories = db.categories.filter(c => c.id !== id); DB.save(); return { ok: true };
      },
      async team() { return DB.reload().users.filter(u => u.role !== 'customer').map(u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role })); },
      async setRole(phone, role) {
        const db = DB.reload(), u = db.users.find(x => x.phone === phone);
        if (!u) return { ok: false, error: 'مفيش حساب بالرقم ده. لازم يسجّل كعميل الأول' };
        if (u.role === 'owner') return { ok: false, error: 'لا يمكن تغيير صلاحية المالك' };
        u.role = role; DB.save(); return { ok: true };
      }
    };
  }

  function sbStaff(sb) {
    const ms = v => (v ? new Date(v).getTime() : null), iso = t => new Date(t).toISOString();
    const tbl = kind => (kind === 'cafe' ? ['cafe_order_items', 'order_id'] : ['session_items', 'session_id']);
    const itemsOf = async (kind, id) => { const [t, col] = tbl(kind); const { data } = await sb.from(t).select('*').eq(col, id).order('added_at'); return (data || []).map(i => ({ ...i, unit_price: Number(i.unit_price) })); };
    const fail = (e, d) => ({ ok: false, error: arabicMsg(e) || d });
    return {
      mode: 'supabase', dayStart,
      async board() {
        const [{ data: devs }, { data: sess }] = await Promise.all([sb.from('devices').select('*').eq('active', true).order('name'), sb.from('sessions').select('*').is('ended_at', null)]);
        const ids = (sess || []).map(s => s.id);
        const { data: items } = ids.length ? await sb.from('session_items').select('*').in('session_id', ids) : { data: [] };
        return (devs || []).map(d => { const s = (sess || []).find(x => x.device_id === d.id);
          return { ...d, price_hour: Number(d.price_hour), session: s ? { ...s, started_at: ms(s.started_at), planned_end: ms(s.planned_end), items: (items || []).filter(i => i.session_id === s.id) } : null }; });
      },
      async startSession(deviceId, hours) {
        const now = Date.now(), end = hours ? now + hours * H : null;
        if (end) { const { data } = await sb.from('bookings').select('starts_at,ends_at').eq('device_id', deviceId).eq('status', 'confirmed');
          const bk = (data || []).map(r => ({ device_id: deviceId, status: 'confirmed', starts_at: ms(r.starts_at), ends_at: ms(r.ends_at) }));
          if (Core.hasConflict(deviceId, now, end, [], bk)) return { ok: false, error: 'الوقت ده بيتعارض مع حجز مؤكد على الجهاز' }; }
        const { error } = await sb.from('sessions').insert({ device_id: deviceId, planned_end: end ? iso(end) : null });
        return error ? { ok: false, error: 'تعذر تشغيل الجهاز. ممكن يكون عليه جلسة شغالة' } : { ok: true };
      },
      itemsOf,
      async addItem(kind, id, it) { const [t, col] = tbl(kind); const { error } = await sb.from(t).insert({ [col]: id, name: it.name, unit_price: it.price }); return error ? fail(error, 'تعذر إضافة الصنف') : { ok: true }; },
      async removeItem(kind, itemId) { const [t] = tbl(kind); const { error } = await sb.from(t).delete().eq('id', itemId); return error ? fail(error, 'تعذر حذف الصنف') : { ok: true }; },
      async previewInvoice(kind, id) {
        const items = await itemsOf(kind, id);
        if (kind === 'cafe') { const { data: o } = await sb.from('cafe_orders').select('label').eq('id', id).single(); return { kind, title: (o && o.label) || 'طلب كافيه', items, minutes: 0, actual_minutes: 0, time_amount: 0, items_amount: sum(items), total: sum(items) }; }
        const { data: s } = await sb.from('sessions').select('*, devices(name, price_hour)').eq('id', id).single(), now = Date.now(), st = ms(s.started_at);
        return { kind, title: s.devices.name, started_at: st, now, items, ...Bill.invoice({ started_at: st }, items, Number(s.devices.price_hour), now, C.billing) };
      },
      async closeSession(id) { const { error } = await sb.rpc('close_session', { p_session: id, p_step: C.billing.stepMin, p_min: C.billing.minMinutes }); return error ? fail(error, 'تعذر قفل الجلسة') : { ok: true }; },
      async cafeOrders() {
        const { data: os } = await sb.from('cafe_orders').select('*').is('closed_at', null).order('opened_at'); const ids = (os || []).map(o => o.id);
        const { data: items } = ids.length ? await sb.from('cafe_order_items').select('*').in('order_id', ids) : { data: [] };
        return (os || []).map(o => ({ ...o, opened_at: ms(o.opened_at), items: (items || []).filter(i => i.order_id === o.id).map(i => ({ ...i, unit_price: Number(i.unit_price) })) }));
      },
      async openCafe(label) { const { data, error } = await sb.from('cafe_orders').insert({ label: label || '' }).select('id').single(); return error ? fail(error, 'تعذر فتح الطلب') : { ok: true, id: data.id }; },
      async cancelCafe(id) { const items = await itemsOf('cafe', id); if (items.length) return { ok: false, error: 'الطلب فيه أصناف. شيلها الأول' }; const { error } = await sb.from('cafe_orders').delete().eq('id', id); return error ? fail(error, 'تعذر الإلغاء') : { ok: true }; },
      async closeCafe(id) { const { error } = await sb.rpc('close_cafe_order', { p_order: id }); return error ? fail(error, 'تعذر إنهاء الطلب') : { ok: true }; },
      async bookings() {
        const { data, error } = await sb.from('bookings').select('*, devices(name), profiles!bookings_customer_id_fkey(full_name, phone)').in('status', ['pending', 'confirmed']).gt('ends_at', new Date().toISOString()).order('starts_at');
        if (error) throw error;
        const rows = data.map(b => ({ ...b, starts_at: ms(b.starts_at), ends_at: ms(b.ends_at), device_name: b.devices && b.devices.name, customer_name: b.profiles && b.profiles.full_name, customer_phone: b.profiles && b.profiles.phone }));
        return { pending: rows.filter(b => b.status === 'pending'), confirmed: rows.filter(b => b.status === 'confirmed') };
      },
      async decide(id, approve) {
        const { data: u } = await sb.auth.getUser();
        const { error } = await sb.from('bookings').update({ status: approve ? 'confirmed' : 'rejected', decided_by: u && u.user && u.user.id }).eq('id', id).eq('status', 'pending');
        return error ? { ok: false, error: 'الجهاز عليه حجز مؤكد في الوقت ده' } : { ok: true };
      },
      async summary() {
        const from = iso(dayStart(Date.now()));
        const [{ data: inv }, { data: exp }] = await Promise.all([sb.from('invoices').select('*, devices(name), cafe_orders(label)').gte('paid_at', from).order('paid_at', { ascending: false }), sb.from('expenses').select('*').gte('spent_at', from).order('spent_at', { ascending: false })]);
        return { invoices: (inv || []).map(v => ({ ...v, kind: v.order_id ? 'cafe' : 'session', title: (v.devices && v.devices.name) || (v.cafe_orders && v.cafe_orders.label) || 'طلب كافيه', paid_at: ms(v.paid_at), time_amount: Number(v.time_amount), items_amount: Number(v.items_amount), total: Number(v.total) })),
                 expenses: (exp || []).map(x => ({ ...x, amount: Number(x.amount), spent_at: ms(x.spent_at) })) };
      },
      async invoiceDetail(id) {
        const { data: v } = await sb.from('invoices').select('*, devices(name), sessions(started_at, ended_at), cafe_orders(label, opened_at, closed_at)').eq('id', id).single(); if (!v) return null;
        const kind = v.order_id ? 'cafe' : 'session', items = await itemsOf(kind, kind === 'cafe' ? v.order_id : v.session_id), t = v.sessions || v.cafe_orders || {};
        const started = ms(t.started_at || t.opened_at), ended = ms(t.ended_at || t.closed_at);
        return { ...v, kind, title: (v.devices && v.devices.name) || (v.cafe_orders && v.cafe_orders.label) || 'طلب كافيه', started_at: started, ended_at: ended, actual_minutes: started && ended ? Bill.actualMin(started, ended) : 0,
                 paid_at: ms(v.paid_at), time_amount: Number(v.time_amount), items_amount: Number(v.items_amount), total: Number(v.total), items };
      },
      async addExpense({ title, amount }) { const { error } = await sb.from('expenses').insert({ title, amount }); return { ok: !error }; },
      async devicesAll() { const { data } = await sb.from('devices').select('*').order('name'); return (data || []).map(d => ({ ...d, price_hour: Number(d.price_hour) })); },
      async saveDevice(d) { const row = { name: d.name, category: d.category, price_hour: d.price_hour, active: d.active };
        const { error } = d.id ? await sb.from('devices').update(row).eq('id', d.id) : await sb.from('devices').insert(row); return error ? fail(error, 'تعذر الحفظ (للمالك فقط)') : { ok: true }; },
      async menuAll() { const { data } = await sb.from('menu_items').select('*').order('category'); return (data || []).map(m => ({ id: m.id, name: m.name, desc: m.description, cat: m.category, price: Number(m.price), active: m.active })); },
      async saveMenu(m) { const row = { name: m.name, description: m.desc, category: m.cat, price: m.price, active: m.active };
        const { error } = m.id ? await sb.from('menu_items').update(row).eq('id', m.id) : await sb.from('menu_items').insert(row); return error ? fail(error, 'تعذر الحفظ (للمالك فقط)') : { ok: true }; },
      async categories() { const { data } = await sb.from('categories').select('*').order('name'); return data || []; },
      async saveCategory(c) {
        if (c.id) { const { error } = await sb.rpc('rename_category', { p_id: c.id, p_name: c.name, p_desc: c.description || '' }); return error ? fail(error, 'تعذر الحفظ') : { ok: true }; }
        const { error } = await sb.from('categories').insert({ kind: c.kind, name: (c.name || '').trim(), description: c.description || '' }); return error ? { ok: false, error: /duplicate|unique/i.test(error.message || '') ? 'الفئة موجودة بالفعل' : 'تعذر الحفظ' } : { ok: true };
      },
      async deleteCategory(id) { const { error } = await sb.rpc('delete_category', { p_id: id }); return error ? fail(error, 'تعذر الحذف') : { ok: true }; },
      async team() { const { data } = await sb.from('profiles').select('id,full_name,phone,role').in('role', ['cashier', 'owner']).order('role'); return (data || []).map(u => ({ id: u.id, name: u.full_name, phone: u.phone, role: u.role })); },
      async setRole(phone, role) { const { error } = await sb.rpc('set_role', { p_phone: phone, p_role: role }); return error ? fail(error, 'تعذر تغيير الصلاحية') : { ok: true }; }
    };
  }
  function brokenStaff() { const no = { ok: false, error: 'تعذر الاتصال بالخادم' }, f = async () => { throw new Error('x'); };
    return { mode: 'broken', dayStart, board: f, bookings: f, summary: f, devicesAll: f, menuAll: f, categories: f, team: f, cafeOrders: f, itemsOf: f, previewInvoice: f, invoiceDetail: f,
      startSession: async () => no, addItem: async () => no, removeItem: async () => no, closeSession: async () => no, openCafe: async () => no, cancelCafe: async () => no, closeCafe: async () => no,
      decide: async () => no, addExpense: async () => no, saveDevice: async () => no, saveMenu: async () => no, saveCategory: async () => no, deleteCategory: async () => no, setRole: async () => no }; }

  const St = g.WhiteStore;
  g.WhiteStaff = St.mode === 'supabase' ? sbStaff(St.client) : St.mode === 'demo' ? demoStaff() : brokenStaff();
})(window);
