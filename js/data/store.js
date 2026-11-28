// White — طبقة البيانات المشتركة (العميل + الدخول لكل الأدوار). محوّلان: تجريبي (محلي على الجهاز) و Supabase (مشترك بين الأجهزة).
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, Core = g.WhiteCore, P = g.WhitePhone, H = 36e5;
  const BAD = 'بيانات الدخول غير صحيحة', DEMO_CODE = '123456';
  const isEmail = s => /^\S+@\S+\.\S+$/.test(String(s || '').trim());
  const ar = e => { const m = (e && e.message) || ''; return /[\u0600-\u06FF]/.test(m) ? m : null; };

  function demoAdapter() {
    const DB = g.WhiteDemoDB, SES = 'white-demo-session';
    const hash = async s => { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (_) { return 'x' + s; } };
    const pub = u => ({ id: u.id, name: u.name, phone: u.phone, email: u.email || '', role: u.role });
    const me = () => { try { const id = localStorage.getItem(SES); return id ? DB.reload().users.find(u => u.id === id) || null : null; } catch (_) { return null; } };
    const setSes = id => { try { localStorage.setItem(SES, id); } catch (_) {} };
    const pw = (u, p) => hash(u.phone + ':' + p);
    const pass = async (u, p) => (u.pw === null ? p === DEMO_CODE : u.pw === await pw(u, p));
    return {
      mode: 'demo', demoCode: DEMO_CODE,
      subscribe(cb) { const f = e => { if (e.key === DB.KEY) cb({ table: '*' }); }; g.addEventListener('storage', f); return () => g.removeEventListener('storage', f); },
      async currentUser() { const u = me(); return u ? pub(u) : null; },
      async signUp({ name, phone, email, password }) {
        const db = DB.reload(); email = String(email).trim().toLowerCase();
        if (db.users.some(u => u.phone === phone)) return { ok: false, error: 'رقم الهاتف مسجّل بالفعل. سجّل الدخول' };
        if (db.users.some(u => (u.email || '').toLowerCase() === email)) return { ok: false, error: 'البريد مسجّل بالفعل. سجّل الدخول' };
        db.pending = db.pending.filter(x => x.email !== email); db.pending.push({ email, name, phone, pw: await hash(phone + ':' + password) }); DB.save();
        return { ok: true, needsOtp: true, demoCode: DEMO_CODE };
      },
      async verifySignup({ email, code }) {
        const db = DB.reload(); email = String(email).trim().toLowerCase(); const p = db.pending.find(x => x.email === email);
        if (!p || String(code).trim() !== DEMO_CODE) return { ok: false, error: 'الرمز غير صحيح' };
        const u = { id: DB.uid('u'), name: p.name, phone: p.phone, email, role: 'customer', pw: p.pw }; db.users.push(u); db.pending = db.pending.filter(x => x !== p); DB.save(); setSes(u.id); return { ok: true };
      },
      async resendCode() { return { ok: true, demoCode: DEMO_CODE }; },
      async signIn({ login, password }) {
        const db = DB.reload(), l = String(login).trim(), u = isEmail(l) ? db.users.find(x => (x.email || '').toLowerCase() === l.toLowerCase()) : db.users.find(x => x.phone === P.normalize(l));
        if (!u || !(await pass(u, password))) return { ok: false, error: BAD }; setSes(u.id); return { ok: true };
      },
      async requestReset({ email }) { const db = DB.reload(), u = db.users.find(x => (x.email || '').toLowerCase() === String(email).trim().toLowerCase()); if (u) { db.resets[u.id] = DEMO_CODE; DB.save(); } return { ok: true, demoCode: DEMO_CODE }; },
      async resetPassword({ email, code, password }) {
        const db = DB.reload(), u = db.users.find(x => (x.email || '').toLowerCase() === String(email).trim().toLowerCase());
        if (!u || db.resets[u.id] !== String(code).trim()) return { ok: false, error: 'الرمز غير صحيح أو انتهت صلاحيته' };
        u.pw = await pw(u, password); delete db.resets[u.id]; DB.save(); setSes(u.id); return { ok: true };
      },
      async signOut() { try { localStorage.removeItem(SES); } catch (_) {} },
      async updateProfile({ name }) { const u = me(), db = DB.reload(), x = u && db.users.find(y => y.id === u.id); if (!x) return { ok: false }; x.name = name; DB.save(); return { ok: true }; },
      async changePassword({ password }) { const u = me(), db = DB.reload(), x = u && db.users.find(y => y.id === u.id); if (!x) return { ok: false }; x.pw = await pw(x, password); DB.save(); return { ok: true }; },
      async myInvoices() { const u = me(), db = DB.reload(); if (!u) return []; return db.invoices.filter(v => v.customer_id === u.id).sort((a, b) => b.paid_at - a.paid_at).map(v => ({ id: v.id, title: v.title, total: v.total, minutes: v.minutes, paid_at: v.paid_at, kind: v.kind })); },
      async settings() { return { ...DB.reload().settings }; },
      async menu() { return DB.reload().menu.filter(m => m.active); },
      async categories() { return DB.reload().categories.map(c => ({ ...c })); },
      async publicDevices() { const db = DB.reload(), now = Date.now(); return db.devices.filter(d => d.active !== false).map(d => ({ ...d, ...Core.deviceState(d.id, db.sessions, db.bookings, now) })); },
      async publicSlots(deviceId, dayStart, hours) { const db = DB.reload(); return Core.freeStarts(deviceId, dayStart, hours, db.sessions, db.bookings, Date.now(), C.booking); },
      async requestBooking({ deviceId, start, hours }) {
        const u = me(); if (!u) return { ok: false, error: 'سجّل دخولك أولًا' };
        const v = Core.validateRequest({ start, hours }, Date.now(), C.booking); if (!v.ok) return v;
        const db = DB.reload(), end = start + hours * H;
        if (Core.hasConflict(deviceId, start, end, db.sessions, db.bookings)) return { ok: false, error: 'الموعد ده محجوز. اختر وقتًا آخر' };
        db.bookings.push({ id: DB.uid('b'), device_id: deviceId, customer_id: u.id, customer_name: u.name, customer_phone: u.phone, starts_at: start, ends_at: end, status: 'pending' }); DB.save(); return { ok: true };
      },
      async myBookings() { const u = me(), db = DB.reload(); if (!u) return []; return db.bookings.filter(b => b.customer_id === u.id).map(b => ({ ...b, device_name: (db.devices.find(d => d.id === b.device_id) || {}).name })).sort((a, b) => b.starts_at - a.starts_at); },
      async cancelBooking(id) { const u = me(), db = DB.reload(), b = db.bookings.find(x => x.id === id && x.status === 'pending' && u && x.customer_id === u.id); if (b) { b.status = 'cancelled'; DB.save(); } return { ok: true }; }
    };
  }

  function supabaseAdapter() {
    const sb = g.supabase.createClient(C.backend.url, C.backend.anonKey);
    const ms = v => (v ? new Date(v).getTime() : null);
    return {
      mode: 'supabase', client: sb,
      subscribe(cb) {
        const ch = sb.channel('w-' + Math.random().toString(36).slice(2));
        ['bookings', 'sessions', 'cafe_orders', 'cafe_order_items', 'session_items', 'invoices', 'shifts'].forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, p => cb({ table: t, event: p.eventType, row: p.new })));
        ch.subscribe(); return () => sb.removeChannel(ch);
      },
      async currentUser() {
        const { data } = await sb.auth.getUser(); const u = data && data.user; if (!u) return null;
        const { data: p } = await sb.from('profiles').select('full_name,phone,role').eq('id', u.id).single();
        return { id: u.id, name: (p && p.full_name) || '', phone: (p && p.phone) || '', email: u.email || '', role: (p && p.role) || 'customer' };
      },
      async signUp({ name, phone, email, password }) {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name, phone } } });
        if (error) { const m = error.message || ''; return { ok: false, error: /registered|exists/i.test(m) ? 'البريد مسجّل بالفعل. سجّل الدخول' : /database error|unique|duplicate/i.test(m) ? 'رقم الهاتف مسجّل بالفعل. سجّل الدخول' : /rate|limit/i.test(m) ? 'محاولات كتير. استنى شوية وحاول تاني' : 'تعذر إنشاء الحساب. تأكد من البيانات' }; }
        if (data.user && data.user.identities && data.user.identities.length === 0) return { ok: false, error: 'البريد مسجّل بالفعل. سجّل الدخول' };
        return { ok: true, needsOtp: !data.session };
      },
      async verifySignup({ email, code }) { const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: String(code).trim(), type: 'signup' }); return error ? { ok: false, error: 'الرمز غير صحيح أو انتهت صلاحيته' } : { ok: true }; },
      async resendCode({ email }) { const { error } = await sb.auth.resend({ type: 'signup', email: email.trim() }); return error ? { ok: false, error: 'تعذر إعادة الإرسال. استنى شوية' } : { ok: true }; },
      async signIn({ login, password }) {
        let email = String(login).trim();
        if (!isEmail(email)) { const { data } = await sb.rpc('email_for_phone', { p_phone: P.normalize(email) }); if (!data) return { ok: false, error: BAD }; email = data; }
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return error ? { ok: false, error: /confirm/i.test(error.message || '') ? 'أكّد حسابك بالرمز الأول' : BAD } : { ok: true };
      },
      async requestReset({ email }) { await sb.auth.resetPasswordForEmail(email.trim()); return { ok: true }; },
      async resetPassword({ email, code, password }) {
        const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: String(code).trim(), type: 'recovery' }); if (error) return { ok: false, error: 'الرمز غير صحيح أو انتهت صلاحيته' };
        const { error: e2 } = await sb.auth.updateUser({ password }); return e2 ? { ok: false, error: 'تعذر تغيير كلمة السر. جرّب كلمة أقوى' } : { ok: true };
      },
      async signOut() { await sb.auth.signOut(); },
      async updateProfile({ name }) { const { data: u } = await sb.auth.getUser(); const { error } = await sb.from('profiles').update({ full_name: name }).eq('id', u.user.id); return { ok: !error }; },
      async changePassword({ password }) { const { error } = await sb.auth.updateUser({ password }); return error ? { ok: false, error: 'تعذر تغيير كلمة السر. جرّب كلمة أقوى' } : { ok: true }; },
      async myInvoices() { const { data } = await sb.from('invoices').select('id,total,minutes,paid_at,order_id,devices(name)').order('paid_at', { ascending: false }).limit(50);
        return (data || []).map(v => ({ id: v.id, title: (v.devices && v.devices.name) || 'كافيه', total: Number(v.total), minutes: v.minutes, paid_at: ms(v.paid_at), kind: v.order_id ? 'cafe' : 'session' })); },
      async settings() { const { data } = await sb.from('app_settings').select('*').eq('id', 1).single(); return data; },
      async menu() { const { data, error } = await sb.from('menu_items').select('*').eq('active', true).order('category'); if (error) throw error; return data.map(m => ({ id: m.id, name: m.name, desc: m.description, cat: m.category, price: Number(m.price), active: true })); },
      async categories() { const { data, error } = await sb.from('categories').select('*'); if (error) throw error; return data; },
      async publicDevices() { const { data, error } = await sb.from('device_status').select('*'); if (error) throw error; return data.map(d => ({ id: d.id, name: d.name, category: d.category, price_hour: Number(d.price_hour), state: d.state, endsAt: ms(d.busy_until), hours: null })); },
      async publicSlots(deviceId, dayStart, hours) {
        const { data, error } = await sb.from('device_slots').select('starts_at,ends_at').eq('device_id', deviceId); if (error) throw error;
        const bookings = data.map(r => ({ device_id: deviceId, status: 'confirmed', starts_at: ms(r.starts_at), ends_at: ms(r.ends_at) }));
        return Core.freeStarts(deviceId, dayStart, hours, [], bookings, Date.now(), C.booking);
      },
      async requestBooking({ deviceId, start, hours }) {
        const v = Core.validateRequest({ start, hours }, Date.now(), C.booking); if (!v.ok) return v;
        const { error } = await sb.from('bookings').insert({ device_id: deviceId, starts_at: new Date(start).toISOString(), ends_at: new Date(start + hours * H).toISOString() });
        return error ? { ok: false, error: ar(error) || 'تعذر إرسال الطلب. حاول مرة أخرى' } : { ok: true };
      },
      async myBookings() { const { data, error } = await sb.from('bookings').select('*, devices(name)').order('starts_at', { ascending: false }); if (error) throw error; return data.map(b => ({ ...b, starts_at: ms(b.starts_at), ends_at: ms(b.ends_at), device_name: b.devices && b.devices.name })); },
      async cancelBooking(id) { const { error } = await sb.rpc('cancel_my_booking', { p_id: id }); return { ok: !error }; }
    };
  }

  function brokenAdapter() {
    const no = { ok: false, error: 'تعذر الاتصال بالخادم' }, fail = async () => { throw new Error('supabase unavailable'); };
    return { mode: 'broken', subscribe: () => () => {}, currentUser: async () => null, signIn: async () => no, signUp: async () => no, verifySignup: async () => no, resendCode: async () => no, requestReset: async () => no, resetPassword: async () => no, signOut: async () => {},
      updateProfile: async () => no, changePassword: async () => no, myInvoices: async () => [], settings: fail, menu: fail, categories: fail, publicDevices: fail, publicSlots: fail, requestBooking: async () => no, myBookings: async () => [], cancelBooking: async () => no };
  }
  const S = C.backend.provider !== 'supabase' ? demoAdapter() : (g.supabase && C.backend.url && C.backend.anonKey) ? supabaseAdapter() : brokenAdapter();
  // قواعد الحجز وساعات العمل تتحمّل من قاعدة البيانات (المالك بيعدّلها من الإعدادات)
  S.loadSettings = async function () {
    try { const s = await S.settings(); if (!s) return;
      Object.assign(C.booking, { openHour: s.open_hour, closeHour: s.close_hour, minHours: Number(s.min_hours), maxHours: Number(s.max_hours), stepMin: s.step_min, leadMin: s.lead_min }); } catch (_) {}
  };
  g.WhiteStore = S;
})(window);
