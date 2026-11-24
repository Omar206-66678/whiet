// White — شاشات العميل (المرحلة 3)
(function () {
  'use strict';
  const C = window.WHITE_CONFIG, S = window.WhiteStore, H = 36e5;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const money = n => new Intl.NumberFormat(C.locale).format(n) + ' ' + C.currency;
  const clock = t => new Date(t).toLocaleTimeString(C.locale, { hour: 'numeric', minute: '2-digit' });
  const dateTxt = t => new Date(t).toLocaleDateString(C.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dayKey = i => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + i).getTime(); };

  const ic = n => window.WhiteUI.icon(n);
  const MAIN = ['home', 'devices', 'menu', 'account'];
  const TITLES = { home: 'White', devices: 'الأجهزة', menu: 'المنيو', account: 'حسابي', detail: 'تفاصيل الجهاز', booking: 'حجز جهاز' };
  const st = { view: 'home', stack: [], user: null, bookings: [], devices: [], cat: 'all', mcat: 'all',
    menu: [], cats: [], dev: null, book: { day: 0, hours: 1, start: null }, slots: null, authMode: 'login', afterLogin: false, busy: false };

  // ---------- أدوات ----------
  function toast(msg) { window.WhiteUI.toast(msg); }
  const label = k => C.statuses[k] || k;
  const chip = k => `<span class="chip s-${esc(k)}">${esc(label(k))}</span>`;

  function timeLine(d) {
    if (d.state === 'available') return 'جاهز للحجز الآن';
    if (d.state === 'booked') return (d.hours ? `محجوز ${d.hours} ساعة، و` : 'محجوز، و') + `يفضى الساعة ${clock(d.endsAt)}`;
    if (d.state === 'open') return 'محجوز مفتوح، بدون وقت انتهاء محدد';
    return '';
  }

  // ---------- التنقل ----------
  function go(name) { if (MAIN.includes(name)) st.stack = []; else st.stack.push(st.view); show(name); }
  function back() { show(st.stack.pop() || 'home'); }
  function show(name) {
    st.view = name;
    $$('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === name));
    const tab = MAIN.includes(name) ? name : (st.stack.includes('devices') ? 'devices' : st.stack[0] || 'home');
    $$('.nav-item').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
    $('#backBtn').hidden = MAIN.includes(name);
    const tt2 = $('#topTitle'); if (name === 'home') tt2.innerHTML = window.WhiteUI.brand(); else tt2.textContent = TITLES[name];
    $('#bottomNav').hidden = name === 'booking';
    scrollTo({ top: 0 });
    render(name);
  }
  function render(name) {
    ({ home: renderHome, devices: renderDevices, menu: renderMenu, account: renderAccount, detail: renderDetail, booking: renderBooking })[name]();
  }

  // ---------- الرئيسية ----------
  function bookingCard(b, withCancel) {
    return `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(b.device_name)}</div>
      <div class="item-sub">${esc(dateTxt(b.starts_at))}</div></div>${chip(b.status)}</div>
      <div class="time-line">من ${esc(clock(b.starts_at))} إلى ${esc(clock(b.ends_at))}</div>
      ${withCancel && b.status === 'pending' ? `<div class="row"><button class="btn-ghost" data-cancel="${esc(b.id)}">إلغاء الطلب</button></div>` : ''}</article>`;
  }
  function renderHome() {
    const cats = [...new Set(st.devices.map(d => d.category))];
    const next = st.bookings.filter(b => ['pending', 'confirmed'].includes(b.status) && b.ends_at > Date.now())
      .sort((a, b) => a.starts_at - b.starts_at)[0];
    $('[data-view="home"]').innerHTML = `
      <div class="glass hero" data-tilt>
        <div class="hero-text"><h2>العب براحتك،<br><span>احجز من مكانك</span></h2>
          <p>شوف الأجهزة المتاحة الآن واختر موعدك.</p>
          <button class="btn-sm" data-go="devices">احجز جهازك</button></div>
        <svg class="pad-hero" viewBox="0 0 160 110" aria-hidden="true"><use href="#pad"/></svg>
      </div>
      <div class="quick">
        <button class="tile" data-go="devices"><span class="ico">${ic('gamepad')}</span>الأجهزة المتاحة</button>
        <button class="tile" data-go="devices"><span class="ico">${ic('calendar')}</span>حجز جهاز</button>
        <button class="tile" data-go="menu"><span class="ico">${ic('coffee')}</span>المنيو</button>
        <button class="tile" data-go="account"><span class="ico">${ic('receipt')}</span>حجوزاتي</button>
      </div>
      <div class="sec-title">الجلسة القادمة <button class="link" data-go="account">عرض الكل</button></div>
      ${next ? bookingCard(next, false) : '<div class="glass empty">لا توجد حجوزات قادمة. اختر جهازًا لتبدأ.</div>'}
      <div class="sec-title">الفئات</div>
      <div class="cats">${cats.map(c => { const n = st.devices.filter(d => d.category === c && d.state === 'available').length;
        return `<button class="tile" data-cat="${esc(c)}"><span class="ico">${ic('gamepad')}</span>${esc(c)}<small>${n} متاح</small></button>`; }).join('')}</div>`;
  }

  // ---------- الأجهزة ----------
  function renderDevices() {
    const cats = ['all', ...new Set(st.devices.map(d => d.category))];
    const list = st.devices.filter(d => st.cat === 'all' || d.category === st.cat);
    $('[data-view="devices"]').innerHTML = `
      <div class="sec-title">حالة الأجهزة الآن</div>
      <div class="filters">${cats.map(c => `<button class="fchip ${st.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${c === 'all' ? 'الكل' : esc(c)}</button>`).join('')}</div>
      <div class="list">${list.map(d => `
        <article class="glass item device s-${esc(d.state)}">
          <div class="dev-row">
            <div class="dev-ico">${ic('gamepad')}</div>
            <div class="dev-main"><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div><div class="row">${chip(d.state)}</div></div>
            <div class="item-price">${money(d.price_hour)} <small>للساعة</small></div>
          </div>
          <div class="time-line">${esc(timeLine(d))}</div>
          <div class="row"><button class="btn-sm" data-dev="${esc(d.id)}">التفاصيل والحجز</button></div>
        </article>`).join('') || '<div class="glass empty">لا توجد أجهزة في هذه الفئة.</div>'}</div>
      ${S.mode === 'demo' ? '<p class="note">وضع تجريبي: البيانات محلية على جهازك.</p>' : ''}`;
  }

  // ---------- تفاصيل الجهاز ----------
  function renderDetail() {
    const d = st.dev; if (!d) return go('devices');
    const avail = d.state === 'available' ? 'الآن' : d.state === 'booked' ? clock(d.endsAt) : 'غير محدد';
    $('[data-view="detail"]').innerHTML = `
      <h2 class="d-title">${esc(d.name)}</h2><p class="d-sub">${esc(d.category)}</p>
      <div class="glass bubble" data-tilt><svg viewBox="0 0 160 110" aria-hidden="true"><use href="#pad"/></svg></div>
      <div class="glass stats">
        <div><small>سعر الساعة</small><b>${esc(money(d.price_hour))}</b></div>
        <div><small>الحالة</small><b>${esc(label(d.state))}</b></div>
        <div><small>متاح من</small><b>${esc(avail)}</b></div>
      </div>
      <div class="glass about"><h3>عن الجهاز</h3>
        <p>${esc(catDesc(d.category))}</p>
        <ul class="checks"><li>الحجز يتأكد بعد موافقة الكاشير</li><li>تشوف حالة طلبك مباشرة في حسابك</li><li>تقدر تلغي الطلب قبل الموافقة</li></ul></div>
      <button class="btn-primary" data-bookdev="${esc(d.id)}">احجز هذا الجهاز</button>`;
  }

  // ---------- الحجز ----------
  const catDesc = n => { const c = st.cats.find(x => x.kind === 'device' && x.name === n); return c ? c.description : ''; };
  const DURS = [1, 1.5, 2, 3];
  function renderBooking() {
    const d = st.dev; if (!d) return go('devices');
    const b = st.book;
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => { const t = dayKey(i), dt = new Date(t);
      return `<button class="day ${b.day === i ? 'on' : ''}" data-day="${i}"><small>${esc(dt.toLocaleDateString(C.locale, { weekday: 'short' }))}</small>
        <b>${esc(dt.toLocaleDateString(C.locale, { day: 'numeric' }))}</b><small>${esc(dt.toLocaleDateString(C.locale, { month: 'short' }))}</small></button>`; }).join('');
    const durs = DURS.filter(h => h >= C.booking.minHours && h <= C.booking.maxHours)
      .map(h => `<button class="dur ${b.hours === h ? 'on' : ''}" data-hours="${h}">${esc(new Intl.NumberFormat(C.locale).format(h))} ساعة</button>`).join('');
    $('[data-view="booking"]').innerHTML = `
      <div class="glass pick"><div><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div></div>
        <div class="item-price">${esc(money(d.price_hour))} <small>للساعة</small></div></div>
      <div class="lbl">اختر اليوم</div><div class="days">${days}</div>
      <div class="lbl">مدة الحجز</div><div class="durs">${durs}</div>
      <div class="lbl">اختر ساعة البداية</div><div id="slots" class="slots"></div>
      <div class="total"><span id="range" class="muted"></span><b>${esc(money(d.price_hour * b.hours))}</b></div>
      <button class="btn-primary" id="confirmBtn" data-confirm disabled>تأكيد الحجز</button>`;
    loadSlots();
  }
  async function loadSlots() {
    const b = st.book, d = st.dev, box = $('#slots'); if (!box) return;
    box.innerHTML = '<p class="muted" style="grid-column:1/-1">جاري تحميل المواعيد...</p>';
    const ds = dayKey(b.day);
    try {
      const all = await S.publicSlots(d.id, ds, b.hours);
      st.slots = all.filter(t => t >= ds + C.hours.open * H && t + b.hours * H <= ds + C.hours.close * H);
    } catch (_) { st.slots = []; toast('تعذر تحميل المواعيد'); }
    if (st.view !== 'booking') return;
    if (!st.slots.includes(b.start)) b.start = null;
    box.innerHTML = st.slots.length
      ? st.slots.map(t => `<button class="slot ${b.start === t ? 'on' : ''}" data-slot="${t}">${esc(clock(t))}</button>`).join('')
      : '<p class="muted" style="grid-column:1/-1">لا توجد مواعيد متاحة في هذا اليوم. جرّب يومًا آخر.</p>';
    $('#range').textContent = b.start ? `من ${clock(b.start)} إلى ${clock(b.start + b.hours * H)}` : 'اختر ساعة البداية';
    $('#confirmBtn').disabled = !b.start;
  }
  async function confirmBooking() {
    if (st.busy) return;
    if (!st.user) { st.afterLogin = true; st.authMode = 'login'; toast('سجّل دخولك أولًا لإرسال الطلب'); st.stack = []; return show('account'); }
    st.busy = true;
    const r = await S.requestBooking({ deviceId: st.dev.id, start: st.book.start, hours: st.book.hours });
    st.busy = false;
    if (!r.ok) { toast(r.error); loadSlots(); return; }
    toast('تم إرسال طلبك. بانتظار موافقة الكاشير');
    await refreshUser(); st.stack = []; show('account');
  }

  // ---------- المنيو ----------
  function renderMenu() {
    const cats = ['all', ...new Set(st.menu.map(m => m.cat))];
    $('[data-view="menu"]').innerHTML = `
      <div class="sec-title">منيو الكافيه</div>
      <div class="filters">${cats.map(c => `<button class="fchip ${st.mcat === c ? 'on' : ''}" data-mcat="${esc(c)}">${c === 'all' ? 'الكل' : esc(c)}</button>`).join('')}</div>
      <div class="list">${st.menu.filter(m => st.mcat === 'all' || m.cat === st.mcat).map(m => `
        <article class="glass item"><div class="item-head"><div><div class="item-name">${esc(m.name)}</div>
        <div class="item-sub">${esc(m.desc)}</div></div><div class="item-price">${esc(money(m.price))}</div></div></article>`).join('')}</div>`;
  }

  // ---------- حسابي ----------
  function renderAccount() {
    const el = $('[data-view="account"]');
    if (!st.user) {
      const su = st.authMode === 'signup';
      el.innerHTML = `
        <div class="sec-title">${su ? 'إنشاء حساب' : 'تسجيل الدخول'}</div>
        <div class="seg"><button class="${su ? '' : 'on'}" data-auth="login">دخول</button><button class="${su ? 'on' : ''}" data-auth="signup">حساب جديد</button></div>
        <form class="glass form" id="authForm" novalidate>
          ${su ? '<label>الاسم<input name="name" autocomplete="name" required></label>' : ''}
          <label>رقم الهاتف<input name="phone" type="tel" inputmode="tel" dir="ltr" autocomplete="tel" placeholder="01XXXXXXXXX" required></label>
          <label>كلمة السر<input name="password" type="password" dir="ltr" autocomplete="${su ? 'new-password' : 'current-password'}" minlength="${C.passwordMin}" required></label>
          <div class="err" id="authErr"></div>
          <button class="btn-primary" type="submit">${su ? 'إنشاء الحساب' : 'دخول'}</button>
        </form>
        ${S.mode === 'demo' ? '<p class="note">وضع تجريبي: البيانات محلية على جهازك. حسابات تجريبية بكلمة السر 123456: المالك 01000000000، الكاشير 01000000001.</p>' : ''}`;
      return;
    }
    const groups = [['pending', 'بانتظار الموافقة'], ['confirmed', 'مؤكدة'], ['rejected', 'مرفوضة'], ['cancelled', 'ملغية'], ['completed', 'مكتملة']];
    el.innerHTML = `
      <div class="glass who"><div><div class="item-name">${esc(st.user.name)}</div><div class="item-sub" dir="ltr" style="text-align:right">${esc(st.user.phone)}</div></div>
        <button class="btn-ghost" data-logout>تسجيل الخروج</button></div>
      <div class="sec-title">حجوزاتي</div>
      ${st.bookings.length ? groups.map(([k, t]) => { const l = st.bookings.filter(b => b.status === k);
        return l.length ? `<div class="lbl">${t}</div><div class="list">${l.map(b => bookingCard(b, true)).join('')}</div>` : ''; }).join('')
        : '<div class="glass empty">لا توجد حجوزات بعد.</div>'}`;
  }
  async function submitAuth(form) {
    const f = new FormData(form), name = (f.get('name') || '').trim(), phone = window.WhitePhone.normalize(f.get('phone')), password = f.get('password') || '';
    const err = m => { $('#authErr').textContent = m; };
    if (st.authMode === 'signup' && name.length < 2) return err('اكتب اسمك');
    if (!window.WhitePhone.valid(phone)) return err('اكتب رقم هاتف صحيح');
    if (password.length < C.passwordMin) return err('كلمة السر ' + C.passwordMin + ' حروف على الأقل');
    if (st.busy) return; st.busy = true;
    const r = st.authMode === 'signup' ? await S.signUp({ name, phone, password }) : await S.signIn({ phone, password });
    st.busy = false;
    if (!r.ok) return err(r.error || 'تعذر تنفيذ الطلب');
    st.authMode = 'login';
    await refreshUser();
    if (isStaff(st.user)) return enterStaff();
    if (st.afterLogin) { st.afterLogin = false; st.stack = ['detail']; show('booking'); } else { toast('أهلًا بيك'); show('account'); }
  }

  // ---------- لوحة الموظفين: لا تُحمَّل إلا بعد التحقق من الدور ----------
  const isStaff = u => !!u && ['cashier', 'owner'].includes(u.role);
  const load = (tag, props) => new Promise((res, rej) => { const el = document.createElement(tag); Object.assign(el, props, { onload: res, onerror: rej }); document.head.appendChild(el); });
  async function enterStaff() {
    try { await load('link', { rel: 'stylesheet', href: 'staff/staff.css' }); for (const src of ['js/core/billing.js', 'js/data/staff-store.js', 'staff/staff.js']) await load('script', { src }); }
    catch (_) { return toast('تعذر تحميل لوحة الموظفين'); }
    window.WhiteStaffApp.mount(st.user);
  }

  // ---------- بيانات ----------
  async function refreshUser() {
    try { st.user = await S.currentUser(); st.bookings = st.user ? await S.myBookings() : []; } catch (_) { st.user = null; st.bookings = []; }
  }
  async function loadMenu() { try { st.menu = await S.menu(); st.cats = await S.categories(); } catch (_) {} }
  async function loadDevices() {
    if (document.body.classList.contains('is-staff')) return;
    try { st.devices = await S.publicDevices(); } catch (_) { return toast('تعذر تحميل حالة الأجهزة'); }
    if (st.dev) st.dev = st.devices.find(d => d.id === st.dev.id) || st.dev;
    await loadMenu();
    if (['home', 'devices', 'detail', 'menu'].includes(st.view)) render(st.view);
  }

  // ---------- الأحداث ----------
  document.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.go) return go(d.go);
    if (d.cat) { st.cat = d.cat; return st.view === 'devices' ? renderDevices() : go('devices'); }
    if (d.mcat) { st.mcat = d.mcat; return renderMenu(); }
    if (d.dev) { st.dev = st.devices.find(x => x.id === d.dev); return go('detail'); }
    if (d.bookdev) { st.book = { day: 0, hours: C.booking.minHours, start: null }; return go('booking'); }
    if (d.day) { st.book.day = +d.day; st.book.start = null; return renderBooking(); }
    if (d.hours) { st.book.hours = +d.hours; st.book.start = null; return renderBooking(); }
    if (d.slot) { st.book.start = +d.slot; $$('.slot').forEach(s => s.classList.toggle('on', s === t)); $('#range').textContent = `من ${clock(st.book.start)} إلى ${clock(st.book.start + st.book.hours * H)}`; $('#confirmBtn').disabled = false; return; }
    if ('confirm' in d) return confirmBooking();
    if (d.auth) { st.authMode = d.auth; return renderAccount(); }
    if ('logout' in d) { await S.signOut(); st.authMode = 'login'; await refreshUser(); return renderAccount(); }
    if (d.cancel) { const r = await S.cancelBooking(d.cancel); toast(r.ok ? 'تم إلغاء الطلب' : 'تعذر إلغاء الطلب'); await refreshUser(); return renderAccount(); }
  });
  document.addEventListener('submit', e => { if (e.target.id === 'authForm') { e.preventDefault(); submitAuth(e.target); } });
  $('#backBtn').addEventListener('click', back);

  // شاشة الترحيب
  let seen = false; try { seen = !!localStorage.getItem('white-seen'); } catch (_) {}
  const closeSplash = () => { $('#splash').classList.add('hide'); try { localStorage.setItem('white-seen', '1'); } catch (_) {} };
  if (seen) closeSplash();
  $('#startBtn').addEventListener('click', closeSplash);
  $('#splashLogin').addEventListener('click', () => { closeSplash(); st.authMode = 'login'; go('account'); });

  // بداية التشغيل
  (async () => { await refreshUser(); if (isStaff(st.user)) { closeSplash(); return enterStaff(); } await loadDevices(); show('home'); setInterval(loadDevices, 30000); })();
})();
