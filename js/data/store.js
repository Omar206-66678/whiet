// White — طبقة البيانات. واجهة واحدة للشاشات، ومحوّلان: تجريبي محلي و Supabase.
// الشاشات تستدعي WhiteStore فقط، ولا تعرف أي محوّل شغال.
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, Core = g.WhiteCore, H = 36e5;

  // ---------- محوّل تجريبي (يعمل بدون سيرفر) ----------
  function demoAdapter() {
    const KEY = 'white-demo-bookings-v1', n = Date.now();
    const devices = [
      { id: 'd1', name: 'PS5 - غرفة 1', category: 'PS5', price_hour: 40 },
      { id: 'd2', name: 'PS5 - غرفة 2', category: 'PS5', price_hour: 40 },
      { id: 'd3', name: 'PS4 - جهاز 3', category: 'PS4', price_hour: 25 },
      { id: 'd4', name: 'غرفة VIP', category: 'VIP', price_hour: 70 }
    ];
    const sessions = [
      { id: 's1', device_id: 'd2', started_at: n - 0.5 * H, planned_end: n + 1.5 * H, ended_at: null },
      { id: 's2', device_id: 'd3', started_at: n - H, planned_end: null, ended_at: null }
    ];
    let bookings = [];
    try { bookings = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(bookings)); } catch (_) {} };

    return {
      mode: 'demo',
      async publicDevices() {
        const now = Date.now();
        return devices.map(d => ({ ...d, ...Core.deviceState(d.id, sessions, bookings, now) }));
      },
      async publicSlots(deviceId, dayStart, hours) {
        return Core.freeStarts(deviceId, dayStart, hours, sessions, bookings, Date.now(), C.booking);
      },
      async requestBooking({ deviceId, start, hours }) {
        const v = Core.validateRequest({ start, hours }, Date.now(), C.booking);
        if (!v.ok) return v;
        const end = start + hours * H;
        if (Core.hasConflict(deviceId, start, end, sessions, bookings)) return { ok: false, error: 'الموعد ده محجوز. اختر وقتًا آخر' };
        bookings.push({ id: 'b' + Date.now(), device_id: deviceId, customer_id: 'demo-user', starts_at: start, ends_at: end, status: 'pending' });
        save(); return { ok: true };
      },
      async myBookings() {
        return bookings.filter(b => b.customer_id === 'demo-user')
          .map(b => ({ ...b, device_name: (devices.find(d => d.id === b.device_id) || {}).name }))
          .sort((a, b) => b.starts_at - a.starts_at);
      }
    };
  }

  // ---------- محوّل Supabase ----------
  // يعتمد على الـ views العامة (device_status, device_slots) وقواعد RLS في supabase/schema.sql
  function supabaseAdapter() {
    const sb = g.supabase.createClient(C.backend.url, C.backend.anonKey);
    const ms = v => (v ? new Date(v).getTime() : null);
    return {
      mode: 'supabase', client: sb,
      async publicDevices() {
        const { data, error } = await sb.from('device_status').select('*');
        if (error) throw error;
        return data.map(d => ({ id: d.id, name: d.name, category: d.category, price_hour: d.price_hour,
          state: d.state, endsAt: ms(d.busy_until), hours: null }));
      },
      async publicSlots(deviceId, dayStart, hours) {
        const { data, error } = await sb.from('device_slots').select('starts_at,ends_at').eq('device_id', deviceId);
        if (error) throw error;
        const bookings = data.map(r => ({ device_id: deviceId, status: 'confirmed', starts_at: ms(r.starts_at), ends_at: ms(r.ends_at) }));
        return Core.freeStarts(deviceId, dayStart, hours, [], bookings, Date.now(), C.booking);
      },
      async requestBooking({ deviceId, start, hours }) {
        const v = Core.validateRequest({ start, hours }, Date.now(), C.booking);
        if (!v.ok) return v;
        const { error } = await sb.from('bookings').insert({
          device_id: deviceId, starts_at: new Date(start).toISOString(), ends_at: new Date(start + hours * H).toISOString()
        });
        return error ? { ok: false, error: 'تعذر إرسال الطلب. حاول مرة أخرى' } : { ok: true };
      },
      async myBookings() {
        const { data, error } = await sb.from('bookings').select('*, devices(name)').order('starts_at', { ascending: false });
        if (error) throw error;
        return data.map(b => ({ ...b, starts_at: ms(b.starts_at), ends_at: ms(b.ends_at), device_name: b.devices && b.devices.name }));
      }
    };
  }

  const useSb = C.backend.provider === 'supabase' && g.supabase && C.backend.url;
  g.WhiteStore = useSb ? supabaseAdapter() : demoAdapter();
})(window);
