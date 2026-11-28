// White — بيانات الموظفين (كاشير + مالك). يُحمَّل فقط بعد التحقق من الدور. الأمان الحقيقي من RLS.
// kind = 'session' (طلبات داخل جلسة جهاز) أو 'cafe' (طلب كافيه مستقل بدون جهاز)
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, Core = g.WhiteCore, Bill = g.WhiteBilling, H = 36e5;
  function dayStart(now) { const d = new Date(now); d.setHours(C.dayStartHour, 0, 0, 0); return d.getTime() > now ? d.getTime() - 24 * H : d.getTime(); }
  const arabicMsg = e => { const m = (e && e.message) || ''; return /[\u0600-\u06FF]/.test(m) ? m : null; };
  const sum = items => Math.round(items.reduce((s, i) => s + Number(i.unit_price) * (i.qty || 1), 0) * 100) / 100;
  const p2 = n => String(n).padStart(2, '0');
  const dkey = t => { const d = new Date(t - C.dayStartHour * H); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const monthRange = (y, m) => [new Date(y, m, 1, C.dayStartHour).getTime(), new Date(y, m + 1, 1, C.dayStartHour).getTime()];
  function finalize(r) { const revenue = Number(r.device_rev) + Number(r.cafe_rev); return { ...r, revenue, net: revenue - Number(r.expenses), avg_invoice: r.invoices ? revenue / r.invoices : 0 }; }
  const LOCKED = { ok: false, error: 'الفاتورة مقفولة ولا يمكن تعديلها' };

  function demoStaff() {
    const DB = g.WhiteDemoDB; let me = { id: 'demo', name: '', role: 'cashier' };
    const cname = (db, id) => { const u = id && db.users.find(x => x.id === id); return u ? u.name : ''; };
    const curShift = db => db.shifts.find(x => x.staff_id === me.id && !x.closed_at) || null;
    const shiftTot = (db, sh) => { const inv = db.invoices.filter(v => v.shift_id === sh.id), ex = db.expenses.filter(x => x.shift_id === sh.id); const dev = inv.reduce((a, v) => a + v.time_amount, 0), caf = inv.reduce((a, v) => a + v.items_amount, 0), exp = ex.reduce((a, x) => a + x.amount, 0);
      return { invoices: inv.length, device: dev, cafe: caf, expenses: exp, expected: Math.round((sh.opening_cash + dev + caf - exp) * 100) / 100 }; };
    const itemsOf = (db, kind, id) => (kind === 'cafe' ? db.cafeItems.filter(i => i.order_id === id) : db.items.filter(i => i.session_id === id));
    return {
      mode: 'demo', dayStart,
      setUser(u) { me = u; },
      async board() {
        const db = DB.reload();
        return db.devices.filter(d => d.active !== false).map(d => { const s = db.sessions.find(x => x.device_id === d.id && !x.ended_at);
          return { ...d, session: s ? { ...s, items: itemsOf(db, 'session', s.id), customer_name: cname(db, s.customer_id) } : null }; });
      },
      async startSession(deviceId, hours, customerId) {
        const db = DB.reload(), now = Date.now(), end = hours ? now + hours * H : null;
        if (db.sessions.some(s => s.device_id === deviceId && !s.ended_at)) return { ok: false, error: 'الجهاز عليه جلسة شغالة بالفعل' };
        if (end && Core.hasConflict(deviceId, now, end, [], db.bookings)) return { ok: false, error: 'الوقت ده بيتعارض مع حجز مؤكد على الجهاز' };
        db.sessions.push({ id: DB.uid('s'), device_id: deviceId, customer_id: customerId || null, started_at: now, planned_end: end, ended_at: null }); DB.save(); return { ok: true };
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
        db.invoices.push({ id: DB.uid('v'), kind: 'session', session_id: s.id, device_id: d.id, customer_id: s.customer_id || null, customer_name: cname(db, s.customer_id), shift_id: (curShift(db) || {}).id || null, title: d.name, started_at: s.started_at, ended_at: now, ...inv, paid_at: now }); DB.save(); return { ok: true, invoice: inv };
      },
      // ---- كافيه مستقل (عملاء بدون بلايستيشن) ----
      async cafeOrders() { const db = DB.reload(); return db.cafeOrders.filter(o => !o.closed_at).map(o => ({ ...o, customer_name: cname(db, o.customer_id), items: itemsOf(db, 'cafe', o.id).map(i => ({ ...i })) })); },
      async openCafe(label, customerId) { const db = DB.reload(), o = { id: DB.uid('o'), label: label || cname(db, customerId) || '', customer_id: customerId || null, opened_at: Date.now(), closed_at: null }; db.cafeOrders.push(o); DB.save(); return { ok: true, id: o.id }; },
      async cancelCafe(id) { const db = DB.reload(); if (itemsOf(db, 'cafe', id).length) return { ok: false, error: 'الطلب فيه أصناف. شيلها الأول' }; db.cafeOrders = db.cafeOrders.filter(o => o.id !== id); DB.save(); return { ok: true }; },
      async closeCafe(id) {
        const db = DB.reload(), o = db.cafeOrders.find(x => x.id === id && !x.closed_at); if (!o) return { ok: false, error: 'الطلب مقفول بالفعل' };
        const items = itemsOf(db, 'cafe', id), now = Date.now(), total = sum(items); o.closed_at = now;
        db.invoices.push({ id: DB.uid('v'), kind: 'cafe', order_id: id, customer_id: o.customer_id || null, customer_name: cname(db, o.customer_id), shift_id: (curShift(db) || {}).id || null, title: o.label || 'طلب كافيه', started_at: o.opened_at, ended_at: now, minutes: 0, actual_minutes: 0, time_amount: 0, items_amount: total, total, paid_at: now }); DB.save(); return { ok: true };
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
      async addExpense({ title, amount }) { const db = DB.reload(); db.expenses.push({ id: DB.uid('e'), title, amount, shift_id: (curShift(db) || {}).id || null, spent_at: Date.now() }); DB.save(); return { ok: true }; },
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
      // ---- الشيفتات ----
      async myShift() { const db = DB.reload(), sh = curShift(db); return sh ? { ...sh, ...shiftTot(db, sh) } : null; },
      async openShift(opening) { const db = DB.reload(); if (curShift(db)) return { ok: false, error: 'عندك شيفت مفتوح بالفعل' };
        db.shifts.push({ id: DB.uid('h'), staff_id: me.id, staff_name: me.name, opened_at: Date.now(), closed_at: null, opening_cash: Math.max(0, Number(opening) || 0), counted_cash: null, expected_cash: null, note: '' }); DB.save(); return { ok: true }; },
      async closeShift(id, counted, note) { const db = DB.reload(), sh = db.shifts.find(x => x.id === id && !x.closed_at); if (!sh) return { ok: false, error: 'الشيفت مقفول بالفعل' };
        const t = shiftTot(db, sh); sh.closed_at = Date.now(); sh.counted_cash = Number(counted); sh.expected_cash = t.expected; sh.note = note || ''; DB.save(); return { ok: true, shift: { ...sh, ...t } }; },
      async shifts(from, to) { const db = DB.reload(); return db.shifts.filter(x => x.opened_at >= from && x.opened_at < to && (me.role === 'owner' || x.staff_id === me.id)).sort((a, b) => b.opened_at - a.opened_at)
        .map(x => { const t = shiftTot(db, x); return { ...x, invoices: t.invoices, total: t.device + t.cafe, expenses: t.expenses, expected: x.expected_cash != null ? x.expected_cash : t.expected }; }); },
      // ---- العملاء ----
      async customers() { const db = DB.reload(); return db.users.filter(u => u.role === 'customer').map(u => ({ id: u.id, name: u.name, phone: u.phone, bookings: db.bookings.filter(b => b.customer_id === u.id).length })).sort((a, b) => a.name.localeCompare(b.name, 'ar')); },
      async customerDetail(id) { const db = DB.reload(), u = db.users.find(x => x.id === id); if (!u) return null;
        return { profile: { id: u.id, name: u.name, phone: u.phone },
          bookings: db.bookings.filter(b => b.customer_id === id).map(b => ({ ...b, device_name: (db.devices.find(d => d.id === b.device_id) || {}).name })).sort((a, b) => b.starts_at - a.starts_at),
          invoices: me.role === 'owner' ? db.invoices.filter(v => v.customer_id === id).sort((a, b) => b.paid_at - a.paid_at) : null }; },
      async createBookingFor({ customerId, deviceId, start, hours }) {
        const db = DB.reload(), u = db.users.find(x => x.id === customerId); if (!u) return { ok: false, error: 'العميل غير موجود' };
        if (!Number.isFinite(start) || !(hours > 0)) return { ok: false, error: 'بيانات الحجز غير مكتملة' };
        const end = start + hours * H; if (Core.hasConflict(deviceId, start, end, db.sessions, db.bookings)) return { ok: false, error: 'الجهاز عليه حجز مؤكد أو جلسة شغالة في الوقت ده' };
        db.bookings.push({ id: DB.uid('b'), device_id: deviceId, customer_id: customerId, customer_name: u.name, customer_phone: u.phone, starts_at: start, ends_at: end, status: 'confirmed', by_staff: true }); DB.save(); return { ok: true }; },
      // ---- التقارير الشهرية ----
      async report(y, m) { const db = DB.reload(), [from, to] = monthRange(y, m);
        const inv = db.invoices.filter(v => v.paid_at >= from && v.paid_at < to), exp = db.expenses.filter(x => x.spent_at >= from && x.spent_at < to);
        const by = (arr, kf, vf) => { const o = {}; arr.forEach(x => { const k = kf(x); o[k] = (o[k] || 0) + vf(x); }); return o; };
        const daily = Object.entries(by(inv, v => dkey(v.paid_at), v => v.total)).map(([day, revenue]) => ({ day, revenue, invoices: inv.filter(v => dkey(v.paid_at) === day).length })).sort((a, b) => a.day.localeCompare(b.day));
        const devs = {}; inv.filter(v => v.kind === 'session').forEach(v => { const e = devs[v.title] || (devs[v.title] = { name: v.title, revenue: 0, minutes: 0, sessions: 0 }); e.revenue += v.time_amount; e.minutes += v.minutes; e.sessions++; });
        const items = {}; inv.forEach(v => itemsOf(db, v.kind, v.kind === 'cafe' ? v.order_id : v.session_id).forEach(i => { const e = items[i.name] || (items[i.name] = { name: i.name, qty: 0, amount: 0 }); e.qty += i.qty || 1; e.amount += Number(i.unit_price) * (i.qty || 1); }));
        return finalize({ invoices: inv.length, device_rev: inv.reduce((a, v) => a + v.time_amount, 0), cafe_rev: inv.reduce((a, v) => a + v.items_amount, 0), expenses: exp.reduce((a, x) => a + x.amount, 0), daily,
          per_device: Object.values(devs).sort((a, b) => b.revenue - a.revenue), top_items: Object.values(items).sort((a, b) => b.amount - a.amount).slice(0, 8),
          expenses_by: Object.entries(by(exp, x => x.title, x => x.amount)).map(([title, amount]) => ({ title, amount })).sort((a, b) => b.amount - a.amount) }); },
      async settings() { return { ...DB.reload().settings }; },
      async saveSettings(v) { const db = DB.reload(); Object.assign(db.settings, v); DB.save(); return { ok: true }; },
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
    let me = { id: null, role: 'cashier' };
    return {
      mode: 'supabase', dayStart,
      setUser(u) { me = u; },
      async board() {
        const [{ data: devs }, { data: sess }] = await Promise.all([sb.from('devices').select('*').eq('active', true).order('name'), sb.from('sessions').select('*, customer:profiles!sessions_customer_id_fkey(full_name)').is('ended_at', null)]);
        const ids = (sess || []).map(s => s.id);
        const { data: items } = ids.length ? await sb.from('session_items').select('*').in('session_id', ids) : { data: [] };
        return (devs || []).map(d => { const s = (sess || []).find(x => x.device_id === d.id);
          return { ...d, price_hour: Number(d.price_hour), session: s ? { ...s, customer_name: s.customer && s.customer.full_name, started_at: ms(s.started_at), planned_end: ms(s.planned_end), items: (items || []).filter(i => i.session_id === s.id) } : null }; });
      },
      async startSession(deviceId, hours, customerId) {
        const now = Date.now(), end = hours ? now + hours * H : null;
        if (end) { const { data } = await sb.from('bookings').select('starts_at,ends_at').eq('device_id', deviceId).eq('status', 'confirmed');
          const bk = (data || []).map(r => ({ device_id: deviceId, status: 'confirmed', starts_at: ms(r.starts_at), ends_at: ms(r.ends_at) }));
          if (Core.hasConflict(deviceId, now, end, [], bk)) return { ok: false, error: 'الوقت ده بيتعارض مع حجز مؤكد على الجهاز' }; }
        const { error } = await sb.from('sessions').insert({ device_id: deviceId, customer_id: customerId || null, planned_end: end ? iso(end) : null });
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
        const { data: os } = await sb.from('cafe_orders').select('*, customer:profiles!cafe_orders_customer_id_fkey(full_name)').is('closed_at', null).order('opened_at'); const ids = (os || []).map(o => o.id);
        const { data: items } = ids.length ? await sb.from('cafe_order_items').select('*').in('order_id', ids) : { data: [] };
        return (os || []).map(o => ({ ...o, customer_name: o.customer && o.customer.full_name, opened_at: ms(o.opened_at), items: (items || []).filter(i => i.order_id === o.id).map(i => ({ ...i, unit_price: Number(i.unit_price) })) }));
      },
      async openCafe(label, customerId) { const { data, error } = await sb.from('cafe_orders').insert({ label: label || '', customer_id: customerId || null }).select('id').single(); return error ? fail(error, 'تعذر فتح الطلب') : { ok: true, id: data.id }; },
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
        const [{ data: inv }, { data: exp }] = await Promise.all([sb.from('invoices').select('*, devices(name), cafe_orders(label), customer:profiles!invoices_customer_id_fkey(full_name)').gte('paid_at', from).order('paid_at', { ascending: false }), sb.from('expenses').select('*').gte('spent_at', from).order('spent_at', { ascending: false })]);
        return { invoices: (inv || []).map(v => ({ ...v, customer_name: v.customer && v.customer.full_name, kind: v.order_id ? 'cafe' : 'session', title: (v.devices && v.devices.name) || (v.cafe_orders && v.cafe_orders.label) || 'طلب كافيه', paid_at: ms(v.paid_at), time_amount: Number(v.time_amount), items_amount: Number(v.items_amount), total: Number(v.total) })),
                 expenses: (exp || []).map(x => ({ ...x, amount: Number(x.amount), spent_at: ms(x.spent_at) })) };
      },
      async invoiceDetail(id) {
        const { data: v } = await sb.from('invoices').select('*, devices(name), sessions(started_at, ended_at), cafe_orders(label, opened_at, closed_at)').eq('id', id).single(); if (!v) return null;
        const kind = v.order_id ? 'cafe' : 'session', items = await itemsOf(kind, kind === 'cafe' ? v.order_id : v.session_id), t = v.sessions || v.cafe_orders || {};
        const started = ms(t.started_at || t.opened_at), ended = ms(t.ended_at || t.closed_at);
        return { ...v, kind, title: (v.devices && v.devices.name) || (v.cafe_orders && v.cafe_orders.label) || 'طلب كافيه', started_at: started, ended_at: ended, actual_minutes: started && ended ? Bill.actualMin(started, ended) : 0,
                 paid_at: ms(v.paid_at), time_amount: Number(v.time_amount), items_amount: Number(v.items_amount), total: Number(v.total), items };
      },
      async addExpense({ title, amount }) { const { error } = await sb.rpc('add_expense', { p_title: title, p_amount: amount }); return error ? fail(error, 'تعذر إضافة المصروف') : { ok: true }; },
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
      // ---- الشيفتات ----
      async myShift() { const { data: u } = await sb.auth.getUser(); if (!u || !u.user) return null;
        const { data: sh } = await sb.from('shifts').select('*').eq('staff_id', u.user.id).is('closed_at', null).maybeSingle(); if (!sh) return null;
        const { data: t } = await sb.rpc('shift_totals', { p_shift: sh.id }); return { ...sh, opened_at: ms(sh.opened_at), opening_cash: Number(sh.opening_cash), ...(t || {}) }; },
      async openShift(opening) { const { error } = await sb.rpc('open_shift', { p_opening: Number(opening) || 0 }); return error ? fail(error, 'تعذر فتح الشيفت') : { ok: true }; },
      async closeShift(id, counted, note) { const { data, error } = await sb.rpc('close_shift', { p_shift: id, p_counted: Number(counted), p_note: note || '' }); return error ? fail(error, 'تعذر قفل الشيفت') : { ok: true, shift: data }; },
      async shifts(from, to) { const { data, error } = await sb.rpc('list_shifts', { p_from: iso(from), p_to: iso(to) }); if (error) throw error;
        return (data || []).map(x => ({ ...x, opened_at: ms(x.opened_at), closed_at: ms(x.closed_at), opening_cash: Number(x.opening_cash), counted_cash: x.counted_cash == null ? null : Number(x.counted_cash), expected: x.expected_cash == null ? null : Number(x.expected_cash), total: Number(x.total), expenses: Number(x.expenses) })); },
      // ---- العملاء ----
      async customers() { const { data, error } = await sb.from('profiles').select('id,full_name,phone').eq('role', 'customer').order('full_name'); if (error) throw error; return (data || []).map(u => ({ id: u.id, name: u.full_name, phone: u.phone })); },
      async customerDetail(id) {
        const { data: u } = await sb.from('profiles').select('id,full_name,phone').eq('id', id).single(); if (!u) return null;
        const { data: bk } = await sb.from('bookings').select('*, devices(name)').eq('customer_id', id).order('starts_at', { ascending: false }).limit(50);
        let invoices = null; if (me.role === 'owner') { const { data: iv } = await sb.from('invoices').select('*, devices(name), cafe_orders(label)').eq('customer_id', id).order('paid_at', { ascending: false }).limit(50);
          invoices = (iv || []).map(v => ({ ...v, kind: v.order_id ? 'cafe' : 'session', title: (v.devices && v.devices.name) || (v.cafe_orders && v.cafe_orders.label) || 'طلب كافيه', paid_at: ms(v.paid_at), total: Number(v.total) })); }
        return { profile: { id: u.id, name: u.full_name, phone: u.phone }, bookings: (bk || []).map(b => ({ ...b, starts_at: ms(b.starts_at), ends_at: ms(b.ends_at), device_name: b.devices && b.devices.name })), invoices }; },
      async createBookingFor({ customerId, deviceId, start, hours }) {
        if (!Number.isFinite(start) || !(hours > 0)) return { ok: false, error: 'بيانات الحجز غير مكتملة' };
        const end = start + hours * H, { data: ss } = await sb.from('sessions').select('started_at,planned_end,ended_at,device_id').eq('device_id', deviceId).is('ended_at', null);
        const sess = (ss || []).map(x => ({ device_id: deviceId, started_at: ms(x.started_at), planned_end: ms(x.planned_end), ended_at: null }));
        if (Core.hasConflict(deviceId, start, end, sess, [])) return { ok: false, error: 'الجهاز عليه جلسة شغالة في الوقت ده' };
        const { error } = await sb.from('bookings').insert({ device_id: deviceId, customer_id: customerId, starts_at: iso(start), ends_at: iso(end), status: 'confirmed', decided_by: me.id });
        return error ? { ok: false, error: /exclu|conflict|23P01/i.test((error.code || '') + (error.message || '')) ? 'الجهاز عليه حجز مؤكد في الوقت ده' : 'تعذر إنشاء الحجز' } : { ok: true }; },
      // ---- التقارير الشهرية ----
      async report(y, m) { const [from, to] = monthRange(y, m);
        const { data, error } = await sb.rpc('monthly_report', { p_from: iso(from), p_to: iso(to), p_tz: C.timezone, p_day_start: C.dayStartHour }); if (error) throw error; return finalize(data); },
      async settings() { const { data } = await sb.from('app_settings').select('*').eq('id', 1).single(); return data; },
      async saveSettings(v) { const { error } = await sb.from('app_settings').update(v).eq('id', 1); return error ? fail(error, 'تعذر الحفظ (للمالك فقط)') : { ok: true }; },
      async team() { const { data } = await sb.from('profiles').select('id,full_name,phone,role').in('role', ['cashier', 'owner']).order('role'); return (data || []).map(u => ({ id: u.id, name: u.full_name, phone: u.phone, role: u.role })); },
      async setRole(phone, role) { const { error } = await sb.rpc('set_role', { p_phone: phone, p_role: role }); return error ? fail(error, 'تعذر تغيير الصلاحية') : { ok: true }; }
    };
  }
  function brokenStaff() { const no = { ok: false, error: 'تعذر الاتصال بالخادم' }, f = async () => { throw new Error('x'); };
    return { mode: 'broken', dayStart, setUser() {}, myShift: f, shifts: f, customers: f, customerDetail: f, report: f, openShift: async () => no, closeShift: async () => no, createBookingFor: async () => no, board: f, bookings: f, summary: f, devicesAll: f, menuAll: f, categories: f, settings: f, saveSettings: async () => no, team: f, cafeOrders: f, itemsOf: f, previewInvoice: f, invoiceDetail: f,
      startSession: async () => no, addItem: async () => no, removeItem: async () => no, closeSession: async () => no, openCafe: async () => no, cancelCafe: async () => no, closeCafe: async () => no,
      decide: async () => no, addExpense: async () => no, saveDevice: async () => no, saveMenu: async () => no, saveCategory: async () => no, deleteCategory: async () => no, setRole: async () => no }; }

  const St = g.WhiteStore;
  g.WhiteStaff = St.mode === 'supabase' ? sbStaff(St.client) : St.mode === 'demo' ? demoStaff() : brokenStaff();
})(window);
