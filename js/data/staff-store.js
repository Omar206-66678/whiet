// White — بيانات الموظفين (كاشير + مالك). يُحمَّل فقط بعد التحقق من الدور. الأمان الحقيقي من RLS.
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, Core = g.WhiteCore, Bill = g.WhiteBilling, H = 36e5;
  function dayStart(now) { const d = new Date(now); d.setHours(C.dayStartHour, 0, 0, 0); return d.getTime() > now ? d.getTime() - 24 * H : d.getTime(); }
  const arabicMsg = e => { const m = (e && e.message) || ''; return /[\u0600-\u06FF]/.test(m) ? m : null; };

  function demoStaff() {
    const DB = g.WhiteDemoDB;
    return {
      mode: 'demo', dayStart,
      async board() {
        const db = DB.reload();
        return db.devices.filter(d => d.active !== false).map(d => { const s = db.sessions.find(x => x.device_id === d.id && !x.ended_at);
          return { ...d, session: s ? { ...s, items: db.items.filter(i => i.session_id === s.id) } : null }; });
      },
      async startSession(deviceId, hours) {
        const db = DB.reload(), now = Date.now(), end = hours ? now + hours * H : null;
        if (db.sessions.some(s => s.device_id === deviceId && !s.ended_at)) return { ok: false, error: 'الجهاز عليه جلسة شغالة بالفعل' };
        if (end && Core.hasConflict(deviceId, now, end, [], db.bookings)) return { ok: false, error: 'الوقت ده بيتعارض مع حجز مؤكد على الجهاز' };
        db.sessions.push({ id: DB.uid('s'), device_id: deviceId, started_at: now, planned_end: end, ended_at: null }); DB.save(); return { ok: true };
      },
      async addItem(sessionId, it) { const db = DB.reload(); db.items.push({ id: DB.uid('i'), session_id: sessionId, name: it.name, unit_price: it.price, qty: 1 }); DB.save(); return { ok: true }; },
      async previewInvoice(sessionId) {
        const db = DB.reload(), s = db.sessions.find(x => x.id === sessionId), d = db.devices.find(x => x.id === s.device_id), items = db.items.filter(i => i.session_id === sessionId);
        return { device_name: d.name, items, ...Bill.invoice(s, items, d.price_hour, Date.now(), C.billing) };
      },
      async closeSession(sessionId) {
        const db = DB.reload(), s = db.sessions.find(x => x.id === sessionId && !x.ended_at); if (!s) return { ok: false, error: 'الجلسة مقفولة بالفعل' };
        const d = db.devices.find(x => x.id === s.device_id), items = db.items.filter(i => i.session_id === s.id), now = Date.now();
        s.ended_at = now; const inv = Bill.invoice(s, items, d.price_hour, now, C.billing);
        db.invoices.push({ id: DB.uid('v'), session_id: s.id, device_id: d.id, device_name: d.name, ...inv, paid_at: now }); DB.save(); return { ok: true, invoice: inv };
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
      async addExpense({ title, amount }) { const db = DB.reload(); db.expenses.push({ id: DB.uid('e'), title, amount, spent_at: Date.now() }); DB.save(); return { ok: true }; },
      async devicesAll() { return DB.reload().devices; },
      async saveDevice(d) { const db = DB.reload(); if (d.id) Object.assign(db.devices.find(x => x.id === d.id), { name: d.name, category: d.category, price_hour: d.price_hour, active: d.active }); else db.devices.push({ id: DB.uid('d'), name: d.name, category: d.category, price_hour: d.price_hour, active: d.active }); DB.save(); return { ok: true }; },
      async menuAll() { return DB.reload().menu; },
      async saveMenu(m) { const db = DB.reload(); if (m.id) Object.assign(db.menu.find(x => x.id === m.id), { name: m.name, desc: m.desc, cat: m.cat, price: m.price, active: m.active }); else db.menu.push({ id: DB.uid('m'), name: m.name, desc: m.desc, cat: m.cat, price: m.price, active: m.active }); DB.save(); return { ok: true }; },
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
      async addItem(sessionId, it) { const { error } = await sb.from('session_items').insert({ session_id: sessionId, name: it.name, unit_price: it.price }); return { ok: !error }; },
      async previewInvoice(sessionId) {
        const { data: s } = await sb.from('sessions').select('*, devices(name, price_hour)').eq('id', sessionId).single();
        const { data: items } = await sb.from('session_items').select('*').eq('session_id', sessionId);
        return { device_name: s.devices.name, items: items || [], ...Bill.invoice({ started_at: ms(s.started_at), planned_end: ms(s.planned_end) }, items || [], Number(s.devices.price_hour), Date.now(), C.billing) };
      },
      async closeSession(sessionId) {
        const { data, error } = await sb.rpc('close_session', { p_session: sessionId, p_step: C.billing.stepMin, p_min: C.billing.minMinutes });
        return error ? { ok: false, error: 'تعذر قفل الجلسة' } : { ok: true, invoice: data };
      },
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
        const [{ data: inv }, { data: exp }] = await Promise.all([sb.from('invoices').select('*, devices(name)').gte('paid_at', from).order('paid_at', { ascending: false }), sb.from('expenses').select('*').gte('spent_at', from).order('spent_at', { ascending: false })]);
        return { invoices: (inv || []).map(v => ({ ...v, device_name: v.devices && v.devices.name, paid_at: ms(v.paid_at), time_amount: Number(v.time_amount), items_amount: Number(v.items_amount), total: Number(v.total) })),
                 expenses: (exp || []).map(x => ({ ...x, amount: Number(x.amount), spent_at: ms(x.spent_at) })) };
      },
      async addExpense({ title, amount }) { const { error } = await sb.from('expenses').insert({ title, amount }); return { ok: !error }; },
      async devicesAll() { const { data } = await sb.from('devices').select('*').order('name'); return (data || []).map(d => ({ ...d, price_hour: Number(d.price_hour) })); },
      async saveDevice(d) { const row = { name: d.name, category: d.category, price_hour: d.price_hour, active: d.active };
        const { error } = d.id ? await sb.from('devices').update(row).eq('id', d.id) : await sb.from('devices').insert(row); return { ok: !error, error: error && 'تعذر الحفظ (للمالك فقط)' }; },
      async menuAll() { const { data } = await sb.from('menu_items').select('*').order('category'); return (data || []).map(m => ({ id: m.id, name: m.name, desc: m.description, cat: m.category, price: Number(m.price), active: m.active })); },
      async saveMenu(m) { const row = { name: m.name, description: m.desc, category: m.cat, price: m.price, active: m.active };
        const { error } = m.id ? await sb.from('menu_items').update(row).eq('id', m.id) : await sb.from('menu_items').insert(row); return { ok: !error, error: error && 'تعذر الحفظ (للمالك فقط)' }; },
      async team() { const { data } = await sb.from('profiles').select('id,full_name,phone,role').in('role', ['cashier', 'owner']).order('role'); return (data || []).map(u => ({ id: u.id, name: u.full_name, phone: u.phone, role: u.role })); },
      async setRole(phone, role) { const { error } = await sb.rpc('set_role', { p_phone: phone, p_role: role }); return error ? { ok: false, error: arabicMsg(error) || 'تعذر تغيير الصلاحية' } : { ok: true }; }
    };
  }
  function brokenStaff() { const no = { ok: false, error: 'تعذر الاتصال بالخادم' }, f = async () => { throw new Error('x'); };
    return { mode: 'broken', dayStart, board: f, bookings: f, summary: f, devicesAll: f, menuAll: f, team: f, previewInvoice: f, startSession: async () => no, addItem: async () => no, closeSession: async () => no, decide: async () => no, addExpense: async () => no, saveDevice: async () => no, saveMenu: async () => no, setRole: async () => no }; }

  const St = g.WhiteStore;
  g.WhiteStaff = St.mode === 'supabase' ? sbStaff(St.client) : St.mode === 'demo' ? demoStaff() : brokenStaff();
})(window);
