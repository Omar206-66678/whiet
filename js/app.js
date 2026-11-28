// White — شاشات العميل: الرئيسية، الأجهزة، الحجز، المنيو، والملف الشخصي (مع دخول برمز تحقق واسترداد كلمة السر)
(function () {
  'use strict';
  const C = window.WHITE_CONFIG, S = window.WhiteStore, FM = window.WhiteFmt, P = window.WhitePhone, U = window.WhiteUI, H = 36e5;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const ic = n => U.icon(n), money = n => FM.money(n), toast = m => U.toast(m);
  const clock = t => new Date(t).toLocaleTimeString(C.locale, { hour: 'numeric', minute: '2-digit' });
  const dateTxt = t => new Date(t).toLocaleDateString(C.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dshort = t => new Date(t).toLocaleDateString(C.locale, { day: 'numeric', month: 'short' });
  const dayKey = i => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + i).getTime(); };
  const hms = ms => { const s = Math.floor(Math.abs(ms) / 1000), p = n => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s % 3600 / 60))}:${p(s % 60)}`; };
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('');
  const isStaff = u => !!u && ['cashier', 'owner'].includes(u.role);

  const MAIN = ['home', 'devices', 'menu', 'account'];
  const TITLES = { home: '', devices: 'الأجهزة', menu: 'منيو الكافيه', account: 'حسابي', detail: 'تفاصيل الجهاز', booking: 'حجز جهاز' };
  const st = { view: 'home', stack: [], user: null, bookings: [], invoices: [], devices: [], cat: 'all', mcat: 'all', menu: [], cats: [], dev: null,
    book: { day: 0, hours: 1, start: null }, slots: null, auth: { mode: 'login', email: '', demoCode: '', coolUntil: 0 }, acct: 'bookings', busy: false, afterLogin: false };
  const label = k => C.statuses[k] || k;
  const chip = k => `<span class="chip s-${esc(k)}">${esc(label(k))}</span>`;

  function timeLine(d) {
    if (d.state === 'available') return 'جاهز للحجز الآن';
    if (d.state === 'booked') return (d.hours ? `محجوز ${FM.hours(d.hours)}، و` : 'محجوز، و') + `يفضى الساعة ${clock(d.endsAt)}`;
    if (d.state === 'open') return 'جلسة مفتوحة، بدون وقت انتهاء محدد';
    return '';
  }

  // ---------- التنقل ----------
  function go(name) { if (MAIN.includes(name)) st.stack = []; else st.stack.push(st.view); show(name); }
  function back() { show(st.stack.pop() || 'home'); }
  function show(name) {
    st.view = name; document.documentElement.dataset.sec = name === 'menu' ? 'cafe' : 'play';
    $$('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === name));
    const tab = MAIN.includes(name) ? name : (st.stack.includes('devices') ? 'devices' : st.stack[0] || 'home');
    $$('.nav-item').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
    $('#backBtn').hidden = MAIN.includes(name); const tt = $('#topTitle'); if (name === 'home') tt.innerHTML = U.brand(); else tt.textContent = TITLES[name];
    $('#bottomNav').hidden = name === 'booking'; scrollTo(0, 0); render(name);
  }
  function render(name) { ({ home: renderHome, devices: renderDevices, menu: renderMenu, account: renderAccount, detail: renderDetail, booking: renderBooking })[name](); }

  // ---------- الرئيسية ----------
  function bookingCard(b, withCancel) {
    return `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(b.device_name)}</div><div class="item-sub">${esc(dateTxt(b.starts_at))}</div></div>${chip(b.status)}</div>
      <div class="time-line">من ${esc(clock(b.starts_at))} إلى ${esc(clock(b.ends_at))} · ${esc(FM.hours((b.ends_at - b.starts_at) / H))}</div>
      ${withCancel && b.status === 'pending' ? `<div class="row"><button class="btn-ghost" data-cancel="${esc(b.id)}">إلغاء الطلب</button></div>` : ''}</article>`;
  }
  const nextBooking = () => st.bookings.filter(b => ['pending', 'confirmed'].includes(b.status) && b.ends_at > Date.now()).sort((a, b) => a.starts_at - b.starts_at)[0];
  function renderHome() {
    const cats = [...new Set(st.devices.map(d => d.category))], next = nextBooking();
    $('[data-view="home"]').innerHTML = `
      <div class="glass hero" data-tilt><div class="hero-text"><h2>العب براحتك،<br><span>احجز من مكانك</span></h2><p>شوف الأجهزة المتاحة الآن واختر موعدك.</p><button class="btn-sm" data-go="devices">احجز جهازك</button></div>
        <svg class="pad-hero" viewBox="0 0 160 110" aria-hidden="true"><use href="#pad"/></svg></div>
      <div class="quick">
        <button class="tile" data-go="devices"><span class="ico">${ic('gamepad')}</span>الأجهزة المتاحة</button>
        <button class="tile" data-go="devices"><span class="ico">${ic('calendar')}</span>حجز جهاز</button>
        <button class="tile" data-go="menu"><span class="ico">${ic('coffee')}</span>المنيو</button>
        <button class="tile" data-go="account"><span class="ico">${ic('user')}</span>حسابي</button></div>
      <div class="sec-title"><span>الجلسة القادمة</span><button class="link" data-go="account">عرض الكل</button></div>
      ${next ? bookingCard(next, false) : '<div class="glass empty">لا توجد حجوزات قادمة. اختر جهازًا لتبدأ.</div>'}
      <div class="sec-title"><span>الفئات</span></div>
      <div class="cats">${cats.map(c => { const n = st.devices.filter(d => d.category === c && d.state === 'available').length;
        return `<button class="tile" data-cat="${esc(c)}"><span class="ico">${ic('gamepad')}</span>${esc(c)}<small>${FM.num(n)} متاح</small></button>`; }).join('')}</div>`;
  }

  // ---------- الأجهزة ----------
  function renderDevices() {
    const cats = ['all', ...new Set(st.devices.map(d => d.category))], list = st.devices.filter(d => st.cat === 'all' || d.category === st.cat);
    $('[data-view="devices"]').innerHTML = `
      <div class="sec-title"><span>حالة الأجهزة الآن</span></div>
      <div class="filters">${cats.map(c => `<button class="fchip ${st.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${c === 'all' ? 'الكل' : esc(c)}</button>`).join('')}</div>
      <div class="list">${list.map(d => `
        <article class="glass item device s-${esc(d.state)}">
          <div class="dev-row"><div class="dev-ico">${ic('gamepad')}</div>
            <div class="dev-main"><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div><div class="row">${chip(d.state)}</div></div>
            <div class="item-price">${esc(money(d.price_hour))} <small>للساعة</small></div></div>
          <div class="time-line">${esc(timeLine(d))}</div>
          <div class="row"><button class="btn-sm" data-dev="${esc(d.id)}">التفاصيل والحجز</button></div></article>`).join('') || '<div class="glass empty">لا توجد أجهزة في هذه الفئة.</div>'}</div>`;
  }

  // ---------- تفاصيل الجهاز ----------
  const catDesc = n => { const c = st.cats.find(x => x.kind === 'device' && x.name === n); return c ? c.description : ''; };
  function renderDetail() {
    const d = st.dev; if (!d) return go('devices');
    const avail = d.state === 'available' ? 'الآن' : d.state === 'booked' ? clock(d.endsAt) : 'غير محدد';
    $('[data-view="detail"]').innerHTML = `
      <h2 class="d-title">${esc(d.name)}</h2><p class="d-sub">${esc(d.category)}</p>
      <div class="glass bubble" data-tilt><svg viewBox="0 0 160 110" aria-hidden="true"><use href="#pad"/></svg></div>
      <div class="glass stats"><div><small>سعر الساعة</small><b>${esc(money(d.price_hour))}</b></div><div><small>الحالة</small><b>${esc(label(d.state))}</b></div><div><small>متاح من</small><b>${esc(avail)}</b></div></div>
      <div class="glass about"><h3>عن الجهاز</h3><p>${esc(catDesc(d.category))}</p>
        <ul class="checks"><li>الحجز يتأكد بعد موافقة الكاشير</li><li>تشوف حالة طلبك مباشرة في حسابك</li><li>تقدر تلغي الطلب قبل الموافقة</li></ul></div>
      <button class="btn-primary" data-bookdev="${esc(d.id)}">احجز هذا الجهاز</button>`;
  }

  // ---------- الحجز: كل أوقات يوم العمل ومدة من ساعة لحد ١٠ ساعات ----------
  let slotTimer = 0;
  function renderBooking() {
    const d = st.dev; if (!d) return go('devices'); const b = st.book, r = C.booking;
    const days = Array.from({ length: 14 }, (_, i) => { const dt = new Date(dayKey(i));
      return `<button class="day ${b.day === i ? 'on' : ''}" data-day="${i}"><small>${esc(dt.toLocaleDateString(C.locale, { weekday: 'short' }))}</small><b>${esc(dt.toLocaleDateString(C.locale, { day: 'numeric' }))}</b><small>${esc(dt.toLocaleDateString(C.locale, { month: 'short' }))}</small></button>`; }).join('');
    const pre = [1, 2, 3, 5, 10].filter(h => h >= r.minHours && h <= r.maxHours).map(h => `<button class="fchip" data-bpre="${h}">${esc(FM.hours(h))}</button>`).join('');
    $('[data-view="booking"]').innerHTML = `
      <div class="glass pick"><div><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div></div><div class="item-price">${esc(money(d.price_hour))} <small>للساعة</small></div></div>
      <div class="lbl">اختر اليوم</div><div class="days">${days}</div>
      <div class="lbl">مدة الحجز</div>
      <div class="stepper"><button class="step" data-bstep="-1" aria-label="أقل">−</button><div class="step-val"><b id="bVal"></b><small>بالزيادة كل نص ساعة، لحد ${esc(FM.hours(r.maxHours))}</small></div><button class="step" data-bstep="1" aria-label="أكتر">+</button></div>
      <div class="presets">${pre}</div>
      <div class="lbl">اختر ساعة البداية</div><div id="slots" class="slots"></div>
      <div class="total"><span id="range" class="muted"></span><b id="bTotal"></b></div>
      <button class="btn-primary" id="confirmBtn" data-confirm disabled>تأكيد الحجز</button>`;
    paintBDur(); loadSlots();
  }
  function paintBDur() {
    const b = st.book, r = C.booking; $('#bVal').textContent = FM.hours(b.hours); $('#bTotal').textContent = money(st.dev.price_hour * b.hours);
    $$('[data-bstep]').forEach(x => { x.disabled = +x.dataset.bstep < 0 ? b.hours <= r.minHours : b.hours >= r.maxHours; }); $$('[data-bpre]').forEach(x => x.classList.toggle('on', +x.dataset.bpre === b.hours));
  }
  const setHours = h => { const r = C.booking; st.book.hours = Math.min(r.maxHours, Math.max(r.minHours, h)); st.book.start = null; paintBDur(); clearTimeout(slotTimer); slotTimer = setTimeout(loadSlots, 160); };
  async function loadSlots() {
    const b = st.book, d = st.dev, box = $('#slots'); if (!box) return;
    box.innerHTML = '<p class="muted" style="grid-column:1/-1">جاري تحميل المواعيد...</p>'; const ds = dayKey(b.day);
    try { st.slots = await S.publicSlots(d.id, ds, b.hours); } catch (_) { st.slots = []; toast('تعذر تحميل المواعيد'); }
    if (st.view !== 'booking') return; if (!st.slots.includes(b.start)) b.start = null;
    box.innerHTML = st.slots.length ? st.slots.map(t => `<button class="slot ${b.start === t ? 'on' : ''}" data-slot="${t}">${esc(clock(t))}${t >= ds + 24 * H ? '<small>بعد منتصف الليل</small>' : ''}</button>`).join('')
      : '<p class="muted" style="grid-column:1/-1">لا توجد مواعيد متاحة بالمدة دي في اليوم ده. جرّب يومًا آخر أو مدة أقصر.</p>';
    paintRange();
  }
  function paintRange() { const b = st.book; $('#range').textContent = b.start ? `من ${clock(b.start)} إلى ${clock(b.start + b.hours * H)}` : 'اختر ساعة البداية'; $('#confirmBtn').disabled = !b.start; }
  async function confirmBooking() {
    if (st.busy) return;
    if (!st.user) { st.afterLogin = true; st.auth.mode = 'login'; toast('سجّل دخولك أولًا لإرسال الطلب'); st.stack = []; return show('account'); }
    st.busy = true; const r = await S.requestBooking({ deviceId: st.dev.id, start: st.book.start, hours: st.book.hours }); st.busy = false;
    if (!r.ok) { toast(r.error); loadSlots(); return; }
    toast('تم إرسال طلبك. بانتظار موافقة الكاشير'); await refreshUser(); st.acct = 'bookings'; st.stack = []; show('account');
  }

  // ---------- المنيو (قسم الكافيه) ----------
  function renderMenu() {
    const cats = ['all', ...new Set(st.menu.map(m => m.cat))];
    $('[data-view="menu"]').innerHTML = `
      <div class="sec-title"><span>منيو الكافيه</span></div>
      <div class="filters">${cats.map(c => `<button class="fchip ${st.mcat === c ? 'on' : ''}" data-mcat="${esc(c)}">${c === 'all' ? 'الكل' : esc(c)}</button>`).join('')}</div>
      <div class="list">${st.menu.filter(m => st.mcat === 'all' || m.cat === st.mcat).map(m => `
        <article class="glass item menu-card"><div class="item-head"><div><div class="item-name">${esc(m.name)}</div><div class="item-sub">${esc(m.desc)}</div></div><div class="item-price">${esc(money(m.price))}</div></div></article>`).join('') || '<div class="glass empty">لا توجد أصناف.</div>'}</div>`;
  }

  // ---------- حسابي: دخول برمز تحقق + استرداد كلمة السر + ملف شخصي ----------
  const field = (name, lbl, attrs) => `<label>${lbl}<input name="${name}" ${attrs || ''}></label>`;
  const demoHint = () => (S.mode === 'demo' && st.auth.demoCode ? `<div class="hint">وضع تجريبي: الرمز هو <b>${esc(st.auth.demoCode)}</b></div>` : '');
  function renderAccount() { const el = $('[data-view="account"]'); if (!st.user) return renderAuth(el); renderProfile(el); }
  function renderAuth(el) {
    const m = st.auth.mode, seg = (on) => `<div class="seg"><button class="${on === 'login' ? 'on' : ''}" data-auth="login">دخول</button><button class="${on === 'signup' ? 'on' : ''}" data-auth="signup">حساب جديد</button></div>`;
    const pwHint = `minlength="${C.passwordMin}"`;
    if (m === 'login') el.innerHTML = `<div class="sec-title"><span>تسجيل الدخول</span></div>${seg('login')}
      <form class="glass form" id="loginForm" novalidate>${field('login', 'رقم الهاتف أو البريد', 'dir="ltr" autocomplete="username" required')}${field('password', 'كلمة السر', 'type="password" dir="ltr" autocomplete="current-password" required')}
        <div class="err" id="authErr"></div><button class="btn-primary" type="submit">دخول</button><div class="linkrow"><button type="button" class="linkbtn" data-auth="forgot">نسيت كلمة السر؟</button></div></form>
      ${S.mode === 'demo' ? '<p class="note">وضع تجريبي: حسابات تجريبية بكلمة السر 123456: المالك 01000000000، الكاشير 01000000001.</p>' : ''}`;
    else if (m === 'signup') el.innerHTML = `<div class="sec-title"><span>إنشاء حساب</span></div>${seg('signup')}
      <form class="glass form" id="signupForm" novalidate>${field('name', 'الاسم', 'autocomplete="name" required')}${field('phone', 'رقم الهاتف', 'type="tel" inputmode="tel" dir="ltr" autocomplete="tel" placeholder="01XXXXXXXXX" required')}
        ${field('email', 'البريد الإلكتروني (هنبعت عليه رمز التحقق)', 'type="email" dir="ltr" autocomplete="email" required')}${field('password', 'كلمة السر', `type="password" dir="ltr" autocomplete="new-password" ${pwHint} required`)}
        <div class="err" id="authErr"></div><button class="btn-primary" type="submit">إنشاء الحساب</button></form>`;
    else if (m === 'otp') el.innerHTML = `<div class="sec-title"><span>تأكيد الحساب</span></div>
      <form class="glass form" id="otpForm" novalidate><p class="hint" style="background:none;border:0;padding:0">بعتنا رمز من 6 أرقام على <b class="ltr">${esc(st.auth.email)}</b>. اكتبه هنا.</p>${demoHint()}
        <input class="otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required><div class="err" id="authErr"></div>
        <button class="btn-primary" type="submit">تأكيد</button><div class="linkrow"><button type="button" class="linkbtn" id="resendBtn" data-resend>إعادة إرسال الرمز</button><button type="button" class="linkbtn" data-auth="signup">تعديل البيانات</button></div></form>`;
    else if (m === 'forgot') el.innerHTML = `<div class="sec-title"><span>استرداد كلمة السر</span></div>
      <form class="glass form" id="forgotForm" novalidate><p class="hint" style="background:none;border:0;padding:0">اكتب بريدك وهنبعتلك رمز لتغيير كلمة السر.</p>${field('email', 'البريد الإلكتروني', 'type="email" dir="ltr" autocomplete="email" required')}
        <div class="err" id="authErr"></div><button class="btn-primary" type="submit">إرسال الرمز</button><div class="linkrow"><button type="button" class="linkbtn" data-auth="login">رجوع لتسجيل الدخول</button></div></form>`;
    else el.innerHTML = `<div class="sec-title"><span>كلمة سر جديدة</span></div>
      <form class="glass form" id="resetForm" novalidate><p class="hint" style="background:none;border:0;padding:0">اكتب الرمز اللي وصلك على <b class="ltr">${esc(st.auth.email)}</b> وكلمة السر الجديدة.</p>${demoHint()}
        <input class="otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required>${field('password', 'كلمة السر الجديدة', `type="password" dir="ltr" autocomplete="new-password" ${pwHint} required`)}${field('password2', 'أعد كتابة كلمة السر', 'type="password" dir="ltr" autocomplete="new-password" required')}
        <div class="err" id="authErr"></div><button class="btn-primary" type="submit">تغيير كلمة السر</button><div class="linkrow"><button type="button" class="linkbtn" data-auth="login">رجوع لتسجيل الدخول</button></div></form>`;
    paintResend();
  }
  function paintResend() { const b = $('#resendBtn'); if (!b) return; const left = Math.ceil((st.auth.coolUntil - Date.now()) / 1000); b.disabled = left > 0; b.textContent = left > 0 ? 'إعادة الإرسال بعد ' + FM.num(left) + ' ثانية' : 'إعادة إرسال الرمز'; }
  async function submitAuth(form) {
    const id = form.getAttribute('id'), f = new FormData(form), g = k => String(f.get(k) || '').trim(), err = m => { const x = $('#authErr'); if (x) x.textContent = m; };
    const pwOk = p => p.length >= C.passwordMin || (err('كلمة السر ' + FM.num(C.passwordMin) + ' حروف على الأقل'), false), emailOk = e => /^\S+@\S+\.\S+$/.test(e) || (err('اكتب بريدًا إلكترونيًا صحيحًا'), false);
    if (st.busy) return; let r;
    if (id === 'loginForm') { const login = g('login'), pw = f.get('password') || ''; if (!login) return err('اكتب رقم الهاتف أو البريد'); if (!pw) return err('اكتب كلمة السر'); st.busy = true; r = await S.signIn({ login, password: pw }); st.busy = false; if (!r.ok) return err(r.error); return finishAuth(); }
    if (id === 'signupForm') { const name = g('name'), phone = P.normalize(g('phone')), email = g('email'), pw = f.get('password') || '';
      if (name.length < 2) return err('اكتب اسمك'); if (!P.valid(phone)) return err('اكتب رقم هاتف صحيح'); if (!emailOk(email) || !pwOk(pw)) return;
      st.busy = true; r = await S.signUp({ name, phone, email, password: pw }); st.busy = false; if (!r.ok) return err(r.error);
      if (r.needsOtp) { st.auth = { mode: 'otp', email, demoCode: r.demoCode || '', coolUntil: Date.now() + 30000 }; return renderAccount(); } return finishAuth(); }
    if (id === 'otpForm') { st.busy = true; r = await S.verifySignup({ email: st.auth.email, code: g('code') }); st.busy = false; if (!r.ok) return err(r.error); return finishAuth(); }
    if (id === 'forgotForm') { const email = g('email'); if (!emailOk(email)) return; st.busy = true; r = await S.requestReset({ email }); st.busy = false; st.auth = { mode: 'reset', email, demoCode: r.demoCode || '', coolUntil: 0 }; toast('لو البريد مسجّل هيوصلك رمز'); return renderAccount(); }
    if (id === 'resetForm') { const pw = f.get('password') || '', pw2 = f.get('password2') || ''; if (!pwOk(pw)) return; if (pw !== pw2) return err('كلمتا السر غير متطابقتين');
      st.busy = true; r = await S.resetPassword({ email: st.auth.email, code: g('code'), password: pw }); st.busy = false; if (!r.ok) return err(r.error); toast('تم تغيير كلمة السر'); return finishAuth(); }
  }
  async function finishAuth() {
    st.auth = { mode: 'login', email: '', demoCode: '', coolUntil: 0 }; await refreshUser();
    if (isStaff(st.user)) return enterStaff();
    if (st.afterLogin) { st.afterLogin = false; st.stack = ['detail']; return show('booking'); } toast('أهلًا بيك'); st.acct = 'bookings'; show('account');
  }

  // الملف الشخصي
  function renderProfile(el) {
    const u = st.user, next = nextBooking(), spent = st.invoices.reduce((a, v) => a + Number(v.total), 0), tab = st.acct;
    let body = '';
    if (tab === 'bookings') { const groups = [['pending', 'بانتظار الموافقة'], ['confirmed', 'مؤكدة'], ['rejected', 'مرفوضة'], ['cancelled', 'ملغية'], ['completed', 'مكتملة']];
      body = st.bookings.length ? groups.map(([k, t]) => { const l = st.bookings.filter(b => b.status === k); return l.length ? `<div class="lbl">${t}</div><div class="list">${l.map(b => bookingCard(b, true)).join('')}</div>` : ''; }).join('') : '<div class="glass empty">لا توجد حجوزات بعد. احجز أول جهاز من تبويب الأجهزة.</div>'; }
    else if (tab === 'invoices') body = st.invoices.length ? `<div class="list">${st.invoices.map(v => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(v.title)}</div><div class="item-sub">${esc(dateTxt(v.paid_at))} · ${esc(clock(v.paid_at))}${v.kind === 'cafe' ? ' · كافيه' : ' · ' + esc(FM.duration(v.minutes))}</div></div><div class="item-price">${esc(money(v.total))}</div></div></article>`).join('')}</div>` : '<div class="glass empty">لا توجد فواتير بعد.</div>';
    else body = `<form class="glass form" id="nameForm" novalidate><h3>بياناتي</h3>${field('name', 'الاسم', `value="${esc(u.name)}" required`)}<div class="setrow" style="padding:0"><span>رقم الهاتف</span><span class="ltr">${esc(u.phone)}</span></div><div class="setrow" style="padding:0"><span>البريد</span><span class="ltr">${esc(u.email)}</span></div>
        <div class="err" id="fErr1"></div><button class="btn-sm" type="submit" style="justify-self:start">حفظ الاسم</button></form>
      <form class="glass form" id="pwForm" novalidate style="margin-top:14px"><h3>تغيير كلمة السر</h3>${field('password', 'كلمة السر الجديدة', `type="password" dir="ltr" autocomplete="new-password" minlength="${C.passwordMin}"`)}${field('password2', 'أعد كتابتها', 'type="password" dir="ltr" autocomplete="new-password"')}
        <div class="err" id="fErr2"></div><button class="btn-sm" type="submit" style="justify-self:start">تغيير</button></form>
      <div class="glass form" style="margin-top:14px"><h3>المظهر والأداء</h3>
        <div class="setrow" style="padding:0"><span>الوضع الفاتح / الداكن</span><button class="icon-btn" data-theme-toggle></button></div>
        <div class="setrow" style="padding:0;display:grid"><span>وضع الأداء <small class="muted">(لو التطبيق تقيل اختر خفيف)</small></span><div class="seg n3" style="margin:8px 0 0">${[['auto', 'تلقائي'], ['lite', 'خفيف'], ['full', 'كامل']].map(([k, t]) => `<button class="${window.WhitePerf.get() === k ? 'on' : ''}" data-perf="${k}">${t}</button>`).join('')}</div></div></div>
      <button class="btn-ghost btn-danger" data-logout style="margin-top:16px;width:100%;justify-content:center">تسجيل الخروج</button>`;
    el.innerHTML = `<div class="glass profile-head"><span class="avatar xl">${esc(initials(u.name))}</span><div class="pinfo"><h2>${esc(u.name)}</h2><span class="sub ltr">${esc(u.phone)}</span><span class="sub ltr">${esc(u.email)}</span>
        <div class="row">${chip('booked').replace(esc(label('booked')), FM.num(st.bookings.length) + ' حجز')}${chip('confirmed').replace(esc(label('confirmed')), FM.num(st.invoices.length) + ' فاتورة')}</div></div></div>
      ${next ? `<div class="glass nextcard"><div class="item-sub">حجزك القادم</div><div class="item-name">${esc(next.device_name)} · ${esc(dshort(next.starts_at))}</div><div class="time-line">${esc(clock(next.starts_at))} ← ${esc(clock(next.ends_at))} · ${chip(next.status)}</div><div class="cd" data-cd="${next.starts_at}">--:--:--</div></div>` : ''}
      <div class="seg n3" style="margin-top:18px"><button class="${tab === 'bookings' ? 'on' : ''}" data-acct="bookings">حجوزاتي</button><button class="${tab === 'invoices' ? 'on' : ''}" data-acct="invoices">فواتيري${st.invoices.length ? ' · ' + esc(money(spent)) : ''}</button><button class="${tab === 'settings' ? 'on' : ''}" data-acct="settings">الإعدادات</button></div>${body}`;
    if (window.WhiteTheme) window.WhiteTheme.paint();
  }
  async function submitProfile(form) {
    const id = form.getAttribute('id'), f = new FormData(form);
    if (id === 'nameForm') { const name = String(f.get('name') || '').trim(), e = $('#fErr1'); if (name.length < 2) return (e.textContent = 'اكتب اسمك'); const r = await S.updateProfile({ name }); if (!r.ok) return (e.textContent = 'تعذر الحفظ'); toast('تم حفظ الاسم'); await refreshUser(); renderAccount(); }
    if (id === 'pwForm') { const p = String(f.get('password') || ''), p2 = String(f.get('password2') || ''), e = $('#fErr2'); if (p.length < C.passwordMin) return (e.textContent = 'كلمة السر ' + FM.num(C.passwordMin) + ' حروف على الأقل'); if (p !== p2) return (e.textContent = 'كلمتا السر غير متطابقتين');
      const r = await S.changePassword({ password: p }); if (!r.ok) return (e.textContent = r.error || 'تعذر التغيير'); toast('تم تغيير كلمة السر'); form.reset(); e.textContent = ''; }
  }

  // ---------- لوحة الموظفين: لا تُحمَّل إلا بعد التحقق من الدور ----------
  const load = (tag, props) => new Promise((res, rej) => { const el = document.createElement(tag); Object.assign(el, props, { onload: res, onerror: rej }); document.head.appendChild(el); });
  async function enterStaff() {
    try { await load('link', { rel: 'stylesheet', href: 'staff/staff.css' }); for (const src of ['js/core/billing.js', 'js/data/staff-store.js', 'staff/staff.js']) await load('script', { src }); }
    catch (_) { return toast('تعذر تحميل لوحة الموظفين'); }
    if (unsub) unsub(); window.WhiteStaffApp.mount(st.user);
  }

  // ---------- بيانات ومزامنة ----------
  async function refreshUser() {
    try { st.user = await S.currentUser(); st.bookings = st.user ? await S.myBookings() : []; st.invoices = st.user ? await S.myInvoices() : []; } catch (_) { st.user = null; st.bookings = []; st.invoices = []; }
  }
  async function loadDevices() {
    if (document.body.classList.contains('is-staff')) return;
    try { st.devices = await S.publicDevices(); } catch (_) { return toast('تعذر تحميل حالة الأجهزة'); }
    try { st.menu = await S.menu(); st.cats = await S.categories(); } catch (_) {}
    if (st.dev) st.dev = st.devices.find(d => d.id === st.dev.id) || st.dev;
    if (['home', 'devices', 'detail', 'menu'].includes(st.view)) render(st.view);
  }
  let unsub = null;
  function startSync() {
    let t = 0;
    unsub = S.subscribe(() => { clearTimeout(t); t = setTimeout(async () => {
      if (document.body.classList.contains('is-staff')) return; const before = new Map(st.bookings.map(b => [b.id, b.status])); await refreshUser();
      st.bookings.forEach(b => { const p = before.get(b.id); if (p && p !== b.status) { if (b.status === 'confirmed') toast('تم قبول حجزك'); else if (b.status === 'rejected') toast('تم رفض حجزك'); } });
      await loadDevices(); if (st.view === 'account' && st.user) renderAccount(); }, 400); });
  }
  function demoBar() {
    const bar = document.createElement('div');
    if (S.mode === 'demo') { const local = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
      bar.className = 'demobar' + (local ? '' : ' warn'); bar.innerHTML = local ? '<b>وضع تجريبي:</b> البيانات محفوظة على هذا الجهاز فقط.' : '<b>تنبيه:</b> التطبيق في الوضع التجريبي، الطلبات لا تصل لأجهزة أخرى. اربطي قاعدة البيانات (ملف setup.html).'; }
    else if (S.mode === 'broken') { bar.className = 'demobar warn'; bar.innerHTML = '<b>تعذر الاتصال بالخادم.</b> تأكد من إعدادات الربط.'; }
    else return; document.body.prepend(bar);
  }

  // ---------- الأحداث ----------
  document.addEventListener('click', async e => {
    if (document.body.classList.contains('is-staff')) return; // لوحة الموظفين لها معالجها الخاص (نمنع التداخل)
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    if (d.go) return go(d.go);
    if (d.cat) { st.cat = d.cat; return st.view === 'devices' ? renderDevices() : go('devices'); }
    if (d.mcat) { st.mcat = d.mcat; return renderMenu(); }
    if (d.dev) { st.dev = st.devices.find(x => x.id === d.dev); return go('detail'); }
    if (d.bookdev) { st.book = { day: 0, hours: C.booking.minHours, start: null }; return go('booking'); }
    if (d.day) { st.book.day = +d.day; st.book.start = null; return renderBooking(); }
    if (d.bstep) return setHours(st.book.hours + (+d.bstep) * (C.booking.stepMin / 60));
    if (d.bpre) return setHours(+d.bpre);
    if (d.slot) { st.book.start = +d.slot; $$('.slot').forEach(s => s.classList.toggle('on', s === t)); return paintRange(); }
    if ('confirm' in d) return confirmBooking();
    if (d.auth) { st.auth = { mode: d.auth, email: st.auth.email, demoCode: '', coolUntil: 0 }; return renderAccount(); }
    if ('resend' in d) { const r = await S.resendCode({ email: st.auth.email }); if (r.ok) { st.auth.coolUntil = Date.now() + 30000; if (r.demoCode) st.auth.demoCode = r.demoCode; toast('تم إرسال الرمز من جديد'); renderAccount(); } else toast(r.error); return; }
    if (d.acct) { st.acct = d.acct; return renderAccount(); }
    if (d.perf) { window.WhitePerf.set(d.perf); return renderAccount(); }
    if ('logout' in d) { await S.signOut(); st.auth = { mode: 'login', email: '', demoCode: '', coolUntil: 0 }; await refreshUser(); return renderAccount(); }
    if (d.cancel) { const r = await S.cancelBooking(d.cancel); toast(r.ok ? 'تم إلغاء الطلب' : 'تعذر إلغاء الطلب'); await refreshUser(); return renderAccount(); }
  });
  document.addEventListener('submit', e => { if (document.body.classList.contains('is-staff')) return; const id = e.target.getAttribute('id'); if (['loginForm', 'signupForm', 'otpForm', 'forgotForm', 'resetForm'].includes(id)) { e.preventDefault(); submitAuth(e.target); } else if (['nameForm', 'pwForm'].includes(id)) { e.preventDefault(); submitProfile(e.target); } });
  $('#backBtn').addEventListener('click', back);
  setInterval(() => { $$('[data-cd]').forEach(el => { const dd = +el.dataset.cd - Date.now(); el.textContent = dd > 0 ? hms(dd) : 'الحجز شغّال'; }); paintResend(); }, 1000);

  // شاشة الترحيب
  let seen = false; try { seen = !!localStorage.getItem('white-seen'); } catch (_) {}
  const closeSplash = () => { $('#splash').classList.add('hide'); try { localStorage.setItem('white-seen', '1'); } catch (_) {} };
  if (seen) closeSplash();
  $('#startBtn').addEventListener('click', closeSplash);
  $('#splashLogin').addEventListener('click', () => { closeSplash(); st.auth.mode = 'login'; go('account'); });

  // البداية
  (async () => {
    demoBar(); await S.loadSettings(); await refreshUser();
    if (isStaff(st.user)) { closeSplash(); return enterStaff(); }
    await loadDevices(); show('home'); setInterval(loadDevices, 30000); startSync();
  })();
})();
