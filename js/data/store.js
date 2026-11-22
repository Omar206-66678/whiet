// White — طبقة بيانات العميل. واجهة واحدة للشاشات، ومحوّلان: تجريبي و Supabase.
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, Core = g.WhiteCore, H = 36e5;

  function demoAdapter() {
    const DB = g.WhiteDemoDB, USER = 'white-demo-user';
    const me = () => { try { return JSON.parse(localStorage.getItem(USER) || 'null'); } catch (_) { return null; } };
    return {
      mode: 'demo',
      async currentUser() { return me(); },
      async signUp({ name, email }) { try { localStorage.setItem(USER, JSON.stringify({ id: 'demo-user', name, email })); } catch (_) {} return { ok: true }; },
      async signIn({ email }) { try { localStorage.setItem(USER, JSON.stringify({ id: 'demo-user', name: email.split('@')[0], email })); } catch (_) {} return { ok: true }; },
      async signOut() { try { localStorage.removeItem(USER); } catch (_) {} },
      async publicDevices() {
        const db = DB.reload(), now = Date.now();
        return db.devices.map(d => ({ ...d, ...Core.deviceState(d.id, db.sessions, db.bookings, now) }));
      },
      async publicSlots(deviceId, dayStart, hours) {
        const db = DB.reload();
        return Core.freeStarts(deviceId, dayStart, hours, db.sessions, db.bookings, Date.now(), C.booking);
      },
      async requestBooking({ deviceId, start, hours }) {
        const u = me(); if (!u) return { ok: false, error: 'سجّل دخولك أولًا' };
        const v = Core.validateRequest({ start, hours }, Date.now(), C.booking); if (!v.ok) return v;
        const db = DB.reload(), end = start + hours * H;
        if (Core.hasConflict(deviceId, start, end, db.sessions, db.bookings)) return { ok: false, error: 'الموعد ده محجوز. اختر وقتًا آخر' };
        db.bookings.push({ id: DB.uid('b'), device_id: deviceId, customer_id: u.id, customer_name: u.name, starts_at: start, ends_at: end, status: 'pending' });
        DB.save(); return { ok: true };
      },
      async myBookings() {
        const db = DB.reload();
        return db.bookings.filter(b => b.customer_id === 'demo-user')
          .map(b => ({ ...b, device_name: (db.devices.find(d => d.id === b.device_id) || {}).name })).sort((a, b) => b.starts_at - a.starts_at);
      },
      async cancelBooking(id) { const db = DB.reload(), b = db.bookings.find(x => x.id === id && x.status === 'pending'); if (b) { b.status = 'cancelled'; DB.save(); } return { ok: true }; }
    };
  }

  function supabaseAdapter() {
    const sb = g.supabase.createClient(C.backend.url, C.backend.anonKey);
    const ms = v => (v ? new Date(v).getTime() : null);
    return {
      mode: 'supabase', client: sb,
      async currentUser() { const { data } = await sb.auth.getUser(); const u = data && data.user; return u ? { id: u.id, name: (u.user_metadata || {}).full_name || u.email, email: u.email } : null; },
      async signUp({ name, email, password }) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
        return error ? { ok: false, error: 'تعذر إنشاء الحساب. جرّب بريدًا آخر أو كلمة سر أقوى' } : { ok: true, needsConfirm: !data.session };
      },
      async signIn({ email, password }) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return error ? { ok: false, error: 'البريد أو كلمة السر غير صحيحة' } : { ok: true };
      },
      async signOut() { await sb.auth.signOut(); },
      async publicDevices() {
        const { data, error } = await sb.from('device_status').select('*'); if (error) throw error;
        return data.map(d => ({ id: d.id, name: d.name, category: d.category, price_hour: d.price_hour, state: d.state, endsAt: ms(d.busy_until), hours: null }));
      },
      async publicSlots(deviceId, dayStart, hours) {
        const { data, error } = await sb.from('device_slots').select('starts_at,ends_at').eq('device_id', deviceId); if (error) throw error;
        const bookings = data.map(r => ({ device_id: deviceId, status: 'confirmed', starts_at: ms(r.starts_at), ends_at: ms(r.ends_at) }));
        return Core.freeStarts(deviceId, dayStart, hours, [], bookings, Date.now(), C.booking);
      },
      async requestBooking({ deviceId, start, hours }) {
        const v = Core.validateRequest({ start, hours }, Date.now(), C.booking); if (!v.ok) return v;
        const { error } = await sb.from('bookings').insert({ device_id: deviceId, starts_at: new Date(start).toISOString(), ends_at: new Date(start + hours * H).toISOString() });
        return error ? { ok: false, error: 'تعذر إرسال الطلب. حاول مرة أخرى' } : { ok: true };
      },
      async myBookings() {
        const { data, error } = await sb.from('bookings').select('*, devices(name)').order('starts_at', { ascending: false }); if (error) throw error;
        return data.map(b => ({ ...b, starts_at: ms(b.starts_at), ends_at: ms(b.ends_at), device_name: b.devices && b.devices.name }));
      },
      async cancelBooking(id) { const { error } = await sb.rpc('cancel_my_booking', { p_id: id }); return { ok: !error }; }
    };
  }

  g.WhiteStore = (C.backend.provider === 'supabase' && g.supabase && C.backend.url) ? supabaseAdapter() : demoAdapter();
})(window);
