// White — طبقة البيانات المشتركة (العميل + الدخول لكل الأدوار). محوّلان: تجريبي و Supabase.
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, Core = g.WhiteCore, P = g.WhitePhone, H = 36e5;
  const BAD = 'رقم الهاتف أو كلمة السر غير صحيحة';

  function demoAdapter() {
    const DB = g.WhiteDemoDB, SES = 'white-demo-session';
    const hash = async s => { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (_) { return 'x' + s; } };
    const pub = u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role });
    const me = () => { try { const id = localStorage.getItem(SES); return id ? DB.reload().users.find(u => u.id === id) || null : null; } catch (_) { return null; } };
    const setSes = id => { try { localStorage.setItem(SES, id); } catch (_) {} };
    return {
      mode: 'demo',
      async currentUser() { const u = me(); return u ? pub(u) : null; },
      async signUp({ name, phone, password }) {
        const db = DB.reload(); if (db.users.some(u => u.phone === phone)) return { ok: false, error: 'هذا الرقم مسجّل بالفعل. سجّل الدخول' };
        const u = { id: DB.uid('u'), name, phone, role: 'customer', pw: await hash(phone + ':' + password) }; db.users.push(u); DB.save(); setSes(u.id); return { ok: true };
      },
      async signIn({ phone, password }) {
        const u = DB.reload().users.find(x => x.phone === phone); if (!u) return { ok: false, error: BAD };
        const good = u.pw === null ? password === '123456' : u.pw === await hash(phone + ':' + password);
        if (!good) return { ok: false, error: BAD }; setSes(u.id); return { ok: true };
      },
      async signOut() { try { localStorage.removeItem(SES); } catch (_) {} },
      async menu() { return DB.reload().menu.filter(m => m.active); },
      async categories() { return DB.reload().categories.map(c => ({ ...c })); },
      async publicDevices() {
        const db = DB.reload(), now = Date.now();
        return db.devices.filter(d => d.active !== false).map(d => ({ ...d, ...Core.deviceState(d.id, db.sessions, db.bookings, now) }));
      },
      async publicSlots(deviceId, dayStart, hours) { const db = DB.reload(); return Core.freeStarts(deviceId, dayStart, hours, db.sessions, db.bookings, Date.now(), C.booking); },
      async requestBooking({ deviceId, start, hours }) {
        const u = me(); if (!u) return { ok: false, error: 'سجّل دخولك أولًا' };
        const v = Core.validateRequest({ start, hours }, Date.now(), C.booking); if (!v.ok) return v;
        const db = DB.reload(), end = start + hours * H;
        if (Core.hasConflict(deviceId, start, end, db.sessions, db.bookings)) return { ok: false, error: 'الموعد ده محجوز. اختر وقتًا آخر' };
        db.bookings.push({ id: DB.uid('b'), device_id: deviceId, customer_id: u.id, customer_name: u.name, customer_phone: u.phone, starts_at: start, ends_at: end, status: 'pending' });
        DB.save(); return { ok: true };
      },
      async myBookings() {
        const u = me(), db = DB.reload(); if (!u) return [];
        return db.bookings.filter(b => b.customer_id === u.id).map(b => ({ ...b, device_name: (db.devices.find(d => d.id === b.device_id) || {}).name })).sort((a, b) => b.starts_at - a.starts_at);
      },
      async cancelBooking(id) { const u = me(), db = DB.reload(), b = db.bookings.find(x => x.id === id && x.status === 'pending' && u && x.customer_id === u.id); if (b) { b.status = 'cancelled'; DB.save(); } return { ok: true }; }
    };
  }

  function supabaseAdapter() {
    const sb = g.supabase.createClient(C.backend.url, C.backend.anonKey);
    const ms = v => (v ? new Date(v).getTime() : null);
    return {
      mode: 'supabase', client: sb,
      async currentUser() {
        const { data } = await sb.auth.getUser(); const u = data && data.user; if (!u) return null;
        const { data: p } = await sb.from('profiles').select('full_name,phone,role').eq('id', u.id).single();
        return { id: u.id, name: (p && p.full_name) || '', phone: (p && p.phone) || '', role: (p && p.role) || 'customer' };
      },
      async signUp({ name, phone, password }) {
        const { data, error } = await sb.auth.signUp({ email: P.toEmail(phone), password, options: { data: { full_name: name, phone } } });
        if (error) return { ok: false, error: /registered|exists/i.test(error.message || '') ? 'هذا الرقم مسجّل بالفعل. سجّل الدخول' : 'تعذر إنشاء الحساب. تأكد من البيانات' };
        return data.session ? { ok: true } : { ok: false, error: 'التسجيل غير مفعّل حاليًا. تواصل مع الإدارة' };
      },
      async signIn({ phone, password }) { const { error } = await sb.auth.signInWithPassword({ email: P.toEmail(phone), password }); return error ? { ok: false, error: BAD } : { ok: true }; },
      async signOut() { await sb.auth.signOut(); },
      async menu() {
        const { data, error } = await sb.from('menu_items').select('*').eq('active', true).order('category'); if (error) throw error;
        return data.map(m => ({ id: m.id, name: m.name, desc: m.description, cat: m.category, price: Number(m.price), active: true }));
      },
      async categories() { const { data, error } = await sb.from('categories').select('*'); if (error) throw error; return data; },
      async publicDevices() {
        const { data, error } = await sb.from('device_status').select('*'); if (error) throw error;
        return data.map(d => ({ id: d.id, name: d.name, category: d.category, price_hour: Number(d.price_hour), state: d.state, endsAt: ms(d.busy_until), hours: null }));
      },
      async publicSlots(deviceId, dayStart, hours) {
        const { data, error } = await sb.from('device_slots').select('starts_at,ends_at').eq('device_id', deviceId); if (error) throw error;
        const bookings = data.map(r => ({ device_id: deviceId, status: 'confirmed', starts_at: ms(r.starts_at), ends_at: ms(r.ends_at) }));
        return Core.freeStarts(deviceId, dayStart, hours, [], bookings, Date.now(), C.booking);
      },
      async requestBooking({ deviceId, start, hours }) {
        const v = Core.validateRequest({ start, hours }, Date.now(), C.booking); if (!v.ok) return v;
        const { error } = await sb.from('bookings').insert({ device_id: deviceId, starts_at: new Date(start).toISOString(), ends_at: new Date(start + hours * H).toISOString() });
        if (!error) return { ok: true };
        const m = error.message || ''; return { ok: false, error: /[\u0600-\u06FF]/.test(m) ? m : 'تعذر إرسال الطلب. حاول مرة أخرى' };
      },
      async myBookings() {
        const { data, error } = await sb.from('bookings').select('*, devices(name)').order('starts_at', { ascending: false }); if (error) throw error;
        return data.map(b => ({ ...b, starts_at: ms(b.starts_at), ends_at: ms(b.ends_at), device_name: b.devices && b.devices.name }));
      },
      async cancelBooking(id) { const { error } = await sb.rpc('cancel_my_booking', { p_id: id }); return { ok: !error }; }
    };
  }

  function brokenAdapter() {
    const no = { ok: false, error: 'تعذر الاتصال بالخادم' }, fail = async () => { throw new Error('supabase unavailable'); };
    return { mode: 'broken', currentUser: async () => null, signIn: async () => no, signUp: async () => no, signOut: async () => {}, menu: fail, categories: fail, publicDevices: fail, publicSlots: fail, requestBooking: async () => no, myBookings: async () => [], cancelBooking: async () => no };
  }
  g.WhiteStore = C.backend.provider !== 'supabase' ? demoAdapter() : (g.supabase && C.backend.url && C.backend.anonKey) ? supabaseAdapter() : brokenAdapter();
})(window);
