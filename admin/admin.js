// White — لوحة الإدارة والكاشير (المرحلة 4)
(function () {
  'use strict';
  const C = window.WHITE_CONFIG, S = window.WhiteStaff, Bill = window.WhiteBilling, ic = n => window.WhiteUI.icon(n), H = 36e5;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const money = n => new Intl.NumberFormat(C.locale, { maximumFractionDigits: 2 }).format(n) + ' ' + C.currency;
  const clock = t => new Date(t).toLocaleTimeString(C.locale, { hour: 'numeric', minute: '2-digit' });
  const dtxt = t => new Date(t).toLocaleDateString(C.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const p2 = n => String(n).padStart(2, '0');
  const hms = ms => { const s = Math.floor(Math.abs(ms) / 1000); return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s % 3600 / 60))}:${p2(s % 60)}`; };
  const st = { user: null, tab: 'devices', board: [], bk: { pending: [], confirmed: [] }, sum: null, busy: false };
  const root = $('#admin');

  let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); }
  const chip = (k, txt) => `<span class="chip s-${k}">${esc(txt)}</span>`;

  // ---------- نافذة سفلية ----------
  function openSheet(html) { $('#sheetRoot').innerHTML = `<div class="sheet-bg" data-sheetbg><div class="glass sheet" role="dialog" aria-modal="true">${html}</div></div>`; }
  function closeSheet() { $('#sheetRoot').innerHTML = ''; }
  const sheetOpen = () => !!$('#sheetRoot').firstChild;

  // ---------- الدخول ----------
  function renderLogin() {
    $('#tabs').hidden = true; $('#logoutBtn').hidden = true;
    root.innerHTML = `<div style="max-width:420px;margin:30px auto 0">
      <div class="glass bubble" data-tilt style="padding:18px"><svg viewBox="0 0 160 110" aria-hidden="true" style="max-width:150px"><use href="#pad"/></svg></div>
      <div class="sec-title">دخول الإدارة والكاشير</div>
      <form class="glass form" id="loginForm" novalidate>
        <label>البريد الإلكتروني<input name="email" type="email" dir="ltr" autocomplete="username" required></label>
        <label>كلمة السر<input name="password" type="password" dir="ltr" autocomplete="current-password" required></label>
        <div class="err" id="loginErr"></div>
        <button class="btn-primary" type="submit">دخول</button>
      </form>
      ${S.mode === 'demo' ? '<p class="note">وضع تجريبي: الدخول هنا لا يحمي شيئًا. الحماية الحقيقية تبدأ بعد ربط Supabase في المرحلة 5.</p>' : ''}</div>`;
  }
  async function doLogin(form) {
    const f = new FormData(form), email = (f.get('email') || '').trim(), password = f.get('password') || '', err = m => { $('#loginErr').textContent = m; };
    if (!/^\S+@\S+\.\S+$/.test(email)) return err('اكتب بريدًا إلكترونيًا صحيحًا');
    if (password.length < 8) return err('كلمة السر 8 حروف على الأقل');
    const r = await S.signIn({ email, password }); if (!r.ok) return err(r.error);
    st.user = r.user; await enter();
  }
  async function enter() { $('#tabs').hidden = false; $('#logoutBtn').hidden = false; await refresh(); show(st.tab); }

  // ---------- البيانات ----------
  async function refresh() {
    try { [st.board, st.bk] = await Promise.all([S.board(), S.bookings()]); } catch (_) { toast('تعذر تحميل البيانات'); }
    const n = st.bk.pending.length, b = $('#pendBadge'); b.hidden = !n; b.textContent = n;
  }
  function show(tab) {
    st.tab = tab; $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    ({ devices: renderDevices, bookings: renderBookings, accounts: renderAccounts })[tab]();
  }

  // ---------- الأجهزة ----------
  function deviceCard(d) {
    const s = d.session, state = !s ? 'available' : (s.planned_end ? 'booked' : 'open');
    const label = { available: 'متاح', booked: 'محجوز بوقت محدد', open: 'محجوز مفتوح' }[state];
    const nb = st.bk.confirmed.find(b => b.device_id === d.id);
    let body;
    if (!s) {
      body = `${nb ? `<div class="mini">حجز مؤكد قادم: ${esc(dtxt(nb.starts_at))} من ${esc(clock(nb.starts_at))} إلى ${esc(clock(nb.ends_at))}</div>` : ''}
        <div class="actions"><button class="btn-sm" data-timed="${esc(d.id)}">${ic('clock')} بوقت محدد</button><button class="btn-ghost" data-open="${esc(d.id)}">وقت مفتوح</button></div>`;
    } else {
      const sum = s.items.reduce((a, i) => a + Number(i.unit_price) * (i.qty || 1), 0);
      body = `<div class="timer" data-timer data-start="${s.started_at}" data-end="${s.planned_end || ''}">--:--:--</div>
        <div class="mini">بدأت ${esc(clock(s.started_at))}${s.planned_end ? ' · تنتهي ' + esc(clock(s.planned_end)) : ' · وقت مفتوح'}${s.items.length ? '<br>الطلبات: ' + s.items.map(i => esc(i.name)).join('، ') : ''}</div>
        <div class="bill"><span>الحساب الحالي</span><b data-bill data-start="${s.started_at}" data-end="${s.planned_end || ''}" data-price="${Number(d.price_hour)}" data-items="${sum}">--</b></div>
        <div class="actions"><button class="btn-ghost" data-additem="${esc(s.id)}">${ic('plus')} طلب كافيه</button><button class="btn-sm" data-close="${esc(s.id)}">إنهاء وحساب</button></div>`;
    }
    return `<article class="glass ad s-${state} ${s ? 'running' : ''}">
      <div class="dev-row"><div class="dev-ico">${ic('gamepad')}</div>
        <div class="dev-main"><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div>${chip(state, label)}</div>
        <div class="item-price">${esc(money(d.price_hour))}<small>/س</small></div></div>${body}</article>`;
  }
  function renderDevices() {
    const busy = st.board.filter(d => d.session).length;
    root.innerHTML = `<div class="sec-title">لوحة الأجهزة <span class="muted" style="font-size:.85rem">${busy} شغّال من ${st.board.length}</span></div>
      <div class="dgrid">${st.board.map(deviceCard).join('') || '<div class="glass empty">لا توجد أجهزة.</div>'}</div>`;
    tick();
  }
  function tick() {
    const now = Date.now();
    $$('[data-timer]').forEach(el => { const s = +el.dataset.start, e = el.dataset.end ? +el.dataset.end : null;
      if (e) { const r = e - now; el.textContent = (r >= 0 ? 'متبقي ' : 'تجاوز ') + hms(r); el.classList.toggle('over', r < 0); } else { el.textContent = hms(now - s); } });
    $$('[data-bill]').forEach(el => { const d = el.dataset;
      el.textContent = money(Bill.invoice({ started_at: +d.start, planned_end: d.end ? +d.end : null }, [{ unit_price: +d.items, qty: 1 }], +d.price, now, C.billing).total); });
  }

  // ---------- الحجوزات ----------
  function bookingLine(b, actions) {
    return `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(b.customer_name || 'عميل')}</div>
      <div class="item-sub">${esc(b.device_name)} · ${esc(dtxt(b.starts_at))}</div></div>${chip(b.status, b.status === 'pending' ? 'بانتظار الموافقة' : 'مؤكد')}</div>
      <div class="time-line">من ${esc(clock(b.starts_at))} إلى ${esc(clock(b.ends_at))}</div>${actions || ''}</article>`;
  }
  function renderBookings() {
    const { pending, confirmed } = st.bk;
    root.innerHTML = `<div class="sec-title">طلبات بانتظار الموافقة</div>
      <div class="dgrid">${pending.map(b => bookingLine(b, `<div class="actions"><button class="btn-sm" data-approve="${esc(b.id)}">${ic('check')} قبول</button><button class="btn-ghost btn-danger" data-reject="${esc(b.id)}">${ic('x')} رفض</button></div>`)).join('') || '<div class="glass empty">لا توجد طلبات جديدة.</div>'}</div>
      <div class="sec-title">حجوزات مؤكدة قادمة</div>
      <div class="dgrid">${confirmed.map(b => bookingLine(b)).join('') || '<div class="glass empty">لا توجد حجوزات مؤكدة.</div>'}</div>`;
  }

  // ---------- الحسابات ----------
  async function renderAccounts() {
    try { st.sum = await S.summary(); } catch (_) { return toast('تعذر تحميل الحسابات'); }
    const { invoices, expenses } = st.sum, sum = (a, k) => a.reduce((s, x) => s + Number(x[k]), 0);
    const t = sum(invoices, 'time_amount'), c = sum(invoices, 'items_amount'), ex = sum(expenses, 'amount'), net = t + c - ex;
    root.innerHTML = `<div class="sec-title">حسابات اليوم</div>
      <div class="stats4">
        <div class="glass stat"><small>إيراد الأجهزة</small><b>${esc(money(t))}</b></div>
        <div class="glass stat"><small>إيراد الكافيه</small><b>${esc(money(c))}</b></div>
        <div class="glass stat"><small>المصروفات</small><b>${esc(money(ex))}</b></div>
        <div class="glass stat"><small>عدد الفواتير</small><b>${invoices.length}</b></div>
        <div class="glass stat net"><small>صافي اليوم (إيراد − مصروفات)</small><b>${esc(money(net))}</b></div>
      </div>
      <div class="sec-title">إضافة مصروف</div>
      <form class="glass formrow" id="expForm" novalidate>
        <label class="field">البند<input name="title" required></label>
        <label class="field">المبلغ<input name="amount" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" required></label>
        <button class="btn-sm" type="submit">إضافة</button></form>
      <div class="sec-title">فواتير اليوم</div>
      <div class="glass" style="padding:8px 16px">${invoices.map(v => `<div class="line"><span>${esc(v.device_name)} · ${esc(clock(v.paid_at))}</span><span>${esc(money(v.total))}</span></div>`).join('') || '<div class="empty">لا توجد فواتير بعد.</div>'}</div>
      <div class="sec-title">مصروفات اليوم</div>
      <div class="glass" style="padding:8px 16px">${expenses.map(x => `<div class="line"><span>${esc(x.title)} · ${esc(clock(x.spent_at))}</span><span>${esc(money(x.amount))}</span></div>`).join('') || '<div class="empty">لا توجد مصروفات.</div>'}</div>
      <p class="note">اليوم يبدأ الساعة ${C.dayStartHour} صباحًا.</p>`;
  }

  // ---------- الإجراءات ----------
  async function act(fn) { if (st.busy) return; st.busy = true; try { await fn(); } finally { st.busy = false; } }
  async function reload() { await refresh(); if (st.tab !== 'accounts') show(st.tab); }

  document.addEventListener('click', e => {
    const bg = e.target.closest('[data-sheetbg]'); if (bg && e.target === bg) return closeSheet();
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    if (d.tab) return show(d.tab);
    if (d.timed) return openSheet(`<h3>تشغيل بوقت محدد</h3><div class="opts">${[1, 1.5, 2, 3, 4, 6].map(h => `<button class="opt" data-start="${esc(d.timed)}:${h}">${h}<small>ساعة</small></button>`).join('')}</div><div class="actions" style="margin-top:12px"><button class="btn-ghost" data-closesheet>إلغاء</button></div>`);
    if (d.start) return act(async () => { const [id, h] = d.start.split(':'); const r = await S.startSession(id, +h); closeSheet(); toast(r.ok ? 'تم تشغيل الجهاز' : r.error); await reload(); });
    if (d.open) return act(async () => { const r = await S.startSession(d.open, null); toast(r.ok ? 'تم تشغيل الجهاز بوقت مفتوح' : r.error); await reload(); });
    if (d.additem) return openSheet(`<h3>طلب كافيه</h3><div class="opts">${C.menu.map((m, i) => `<button class="opt" data-pick="${esc(d.additem)}:${i}">${esc(m.name)}<small>${esc(money(m.price))}</small></button>`).join('')}</div><div class="actions" style="margin-top:12px"><button class="btn-sm" data-closesheet>تم</button></div>`);
    if (d.pick) return act(async () => { const [sid, i] = d.pick.split(':'), m = C.menu[+i]; const r = await S.addItem(sid, { name: m.name, price: m.price }); toast(r.ok ? 'تمت إضافة ' + m.name : 'تعذر إضافة الطلب'); await refresh(); if (st.tab === 'devices') renderDevices(); });
    if ('closesheet' in d) return closeSheet();
    if (d.close) return act(async () => { const v = await S.previewInvoice(d.close);
      openSheet(`<h3>فاتورة ${esc(v.device_name)}</h3>
        <div class="line"><span>الوقت (${v.minutes} دقيقة محسوبة)</span><span>${esc(money(v.time_amount))}</span></div>
        ${v.items.map(i => `<div class="line"><span>${esc(i.name)}</span><span>${esc(money(Number(i.unit_price) * (i.qty || 1)))}</span></div>`).join('')}
        <div class="line"><span>الإجمالي</span><span style="font-size:1.3rem;color:var(--primary)">${esc(money(v.total))}</span></div>
        <div class="actions" style="margin-top:14px"><button class="btn-primary" style="flex:1" data-confirmclose="${esc(d.close)}">تأكيد الدفع وإنهاء</button><button class="btn-ghost" data-closesheet>رجوع</button></div>`); });
    if (d.confirmclose) return act(async () => { const r = await S.closeSession(d.confirmclose); closeSheet(); toast(r.ok ? 'تم قفل الجلسة. الجهاز بقى متاح للعملاء' : r.error); await reload(); });
    if (d.approve || d.reject) return act(async () => { const ok = !!d.approve; const r = await S.decide(d.approve || d.reject, ok); toast(r.ok ? (ok ? 'تم قبول الحجز' : 'تم رفض الحجز') : r.error); await reload(); });
  });
  document.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'loginForm') return doLogin(e.target);
    if (e.target.id === 'expForm') return act(async () => {
      const f = new FormData(e.target), title = (f.get('title') || '').trim(), amount = parseFloat(f.get('amount'));
      if (!title || !(amount > 0)) return toast('اكتب البند ومبلغًا أكبر من صفر');
      const r = await S.addExpense({ title, amount }); toast(r.ok ? 'تمت إضافة المصروف' : 'تعذر إضافة المصروف'); renderAccounts(); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  $('#logoutBtn').addEventListener('click', async () => { await S.signOut(); st.user = null; closeSheet(); renderLogin(); });

  const rootEl = document.documentElement;
  try { rootEl.dataset.theme = localStorage.getItem('white-theme') || 'light'; } catch (_) {}
  $('#themeBtn').addEventListener('click', () => { const n = rootEl.dataset.theme === 'dark' ? 'light' : 'dark'; rootEl.dataset.theme = n; try { localStorage.setItem('white-theme', n); } catch (_) {} });

  // تشغيل
  (async () => {
    st.user = await S.current();
    if (st.user) await enter(); else renderLogin();
    setInterval(tick, 1000);
    setInterval(async () => { if (!st.user || sheetOpen() || st.tab === 'accounts' || document.hidden) return; await reload(); }, 15000);
  })();
})();
