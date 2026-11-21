// White — منطق الوقت وحالة الأجهزة (دوال نقية بدون واجهة، قابلة للاختبار)
(function (g) {
  'use strict';
  const H = 36e5, MIN = 6e4;
  const overlaps = (aS, aE, bS, bE) => aS < bE && bS < aE;

  // حالة جهاز الآن. جلسة نشطة أولًا، ثم حجز مؤكد يغطي الوقت الحالي، وإلا متاح
  function deviceState(deviceId, sessions, bookings, now) {
    const s = sessions.find(x => x.device_id === deviceId && !x.ended_at);
    if (s) return s.planned_end
      ? { state: 'booked', endsAt: s.planned_end, hours: Math.round((s.planned_end - s.started_at) / H * 2) / 2 }
      : { state: 'open', endsAt: null, hours: null };
    const b = bookings.find(x => x.device_id === deviceId && x.status === 'confirmed' && x.starts_at <= now && x.ends_at > now);
    if (b) return { state: 'booked', endsAt: b.ends_at, hours: Math.round((b.ends_at - b.starts_at) / H * 2) / 2 };
    return { state: 'available', endsAt: null, hours: null };
  }

  // هل الفترة المطلوبة تتعارض مع حجز مؤكد أو جلسة شغالة؟ (الجلسة المفتوحة تمنع أي حجز قادم حتى تُقفل)
  function hasConflict(deviceId, start, end, sessions, bookings) {
    const sess = sessions.some(s => s.device_id === deviceId && !s.ended_at &&
      overlaps(start, end, s.started_at, s.planned_end || Infinity));
    const book = bookings.some(b => b.device_id === deviceId && b.status === 'confirmed' &&
      overlaps(start, end, b.starts_at, b.ends_at));
    return sess || book;
  }

  // التحقق من طلب حجز. يرجع {ok:true} أو {ok:false,error}
  function validateRequest(req, now, rules) {
    const { start, hours } = req;
    if (!Number.isFinite(start) || !Number.isFinite(hours)) return { ok: false, error: 'بيانات الحجز غير مكتملة' };
    if (hours < rules.minHours || hours > rules.maxHours) return { ok: false, error: `مدة الحجز من ${rules.minHours} إلى ${rules.maxHours} ساعات` };
    if ((hours * 60) % rules.stepMin !== 0) return { ok: false, error: 'المدة لازم تكون من مضاعفات ' + rules.stepMin + ' دقيقة' };
    if (start < now + rules.leadMin * MIN) return { ok: false, error: 'اختر موعدًا بعد الوقت الحالي بـ ' + rules.leadMin + ' دقيقة على الأقل' };
    return { ok: true };
  }

  // مواعيد البداية المتاحة في يوم معين (كل stepMin دقيقة) لمدة hours
  function freeStarts(deviceId, dayStart, hours, sessions, bookings, now, rules) {
    const out = [], span = hours * H;
    for (let t = dayStart; t < dayStart + 24 * H; t += rules.stepMin * MIN) {
      if (!validateRequest({ start: t, hours }, now, rules).ok) continue;
      if (!hasConflict(deviceId, t, t + span, sessions, bookings)) out.push(t);
    }
    return out;
  }

  g.WhiteCore = { overlaps, deviceState, hasConflict, validateRequest, freeStarts };
  if (typeof module !== 'undefined') module.exports = g.WhiteCore;
})(typeof window !== 'undefined' ? window : globalThis);
