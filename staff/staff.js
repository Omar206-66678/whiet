// White — لوحة الموظفين: كاشير (تشغيل) ومالك (تشغيل + حسابات + إعدادات + فريق)
// ملاحظة: إخفاء التبويبات هنا للوضوح فقط. منع الوصول الحقيقي بقواعد RLS في قاعدة البيانات.
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, S = g.WhiteStaff, Bill = g.WhiteBilling, ic = n => g.WhiteUI.icon(n), H = 36e5;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const money = n => new Intl.NumberFormat(C.locale, { maximumFractionDigits: 2 }).format(n) + ' ' + C.currency;
  const clock = t => new Date(t).toLocaleTimeString(C.locale, { hour: 'numeric', minute: '2-digit' });
  const dtxt = t => new Date(t).toLocaleDateString(C.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const p2 = n => String(n).padStart(2, '0');
  const hms = ms => { const s = Math.floor(Math.abs(ms) / 1000); return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s % 3600 / 60))}:${p2(s % 60)}`; };
  const TABS = { devices: ['الأجهزة', 'gamepad'], bookings: ['الطلبات', 'inbox'], accounts: ['الحسابات', 'chart'], manage: ['الإعدادات', 'settings'], team: ['الفريق', 'users'] };
  const ROLE_TABS = { owner: ['devices', 'bookings', 'accounts', 'manage', 'team'], cashier: ['devices', 'bookings'] };
  const PERMS = {
    owner: '<b>صلاحياتك كمالك:</b> كل شيء. تشغيل الأجهزة والحجوزات، الحسابات والمصروفات، تعديل الأجهزة والأسعار والمنيو، وإدارة الكاشيرية.',
    cashier: '<b>صلاحياتك ككاشير:</b> تشغيل الأجهزة، قبول ورفض الحجوزات، طلبات الكافيه، وإنهاء الجلسات. الحسابات والإعدادات والفريق للمالك فقط.'
  };
  const st = { user: null, tab: 'devices', board: [], bk: { pending: [], confirmed: [] }, menu: [], busy: false, bound: false };
  let root, tt;
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); };
  const chip = (k, txt) => `<span class="chip s-${k}">${esc(txt)}</span>`;
  const isOwner = () => st.user && st.user.role === 'owner';

  function openSheet(html) { $('#sheetRoot').innerHTML = `<div class="sheet-bg" data-sheetbg><div class="glass sheet" role="dialog" aria-modal="true">${html}</div></div>`; }
  const closeSheet = () => { $('#sheetRoot').innerHTML = ''; };
  const sheetOpen = () => !!$('#sheetRoot').firstChild;

  function mount(user) {
    st.user = user; st.tab = 'devices';
    document.body.classList.add('is-staff');
    const tabs = ROLE_TABS[user.role] || [];
    $('#staffRoot').innerHTML = `
      <header class="topbar"><button class="icon-btn" id="sLogout" aria-label="تسجيل الخروج">${ic('logout')}</button>
        <div class="top-title">White · ${user.role === 'owner' ? 'لوحة المالك' : 'لوحة الكاشير'}</div>
        <button class="icon-btn" id="sTheme" aria-label="تبديل الوضع الداكن">${ic('moon')}</button></header>
      <div class="rolebar">${chip(user.role === 'owner' ? 'confirmed' : 'booked', C.roles[user.role])}<span class="who-name">${esc(user.name)}</span></div>
      <main id="staffMain"></main>
      <nav class="bottomnav" id="sTabs" aria-label="أقسام لوحة التحكم">${tabs.map(t => `<button class="nav-item" data-tab="${t}">${ic(TABS[t][1])}<span>${TABS[t][0]}${t === 'bookings' ? '<b class="badge" id="pendBadge" hidden></b>' : ''}</span></button>`).join('')}</nav>
      <div id="sheetRoot"></div>`;
    root = $('#staffMain');
    if (!st.bound) { bind(); st.bound = true; setInterval(tick, 1000); setInterval(async () => { if (!st.user || sheetOpen() || ['accounts', 'manage', 'team'].includes(st.tab) || document.hidden) return; await reload(); }, 15000); }
    refresh().then(() => show('devices'));
  }

  async function refresh() {
    try { [st.board, st.bk, st.menu] = await Promise.all([S.board(), S.bookings(), S.menuAll()]); } catch (_) { toast('تعذر تحميل البيانات'); }
    const n = st.bk.pending.length, b = $('#pendBadge'); if (b) { b.hidden = !n; b.textContent = n; }
  }
  const reload = async () => { await refresh(); if (['devices', 'bookings'].includes(st.tab)) show(st.tab); };
  function show(tab) {
    if (!(ROLE_TABS[st.user.role] || []).includes(tab)) tab = 'devices';
    st.tab = tab; $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); scrollTo({ top: 0 });
    ({ devices: renderDevices, bookings: renderBookings, accounts: renderAccounts, manage: renderManage, team: renderTeam })[tab]();
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
    return `<article class="glass ad s-${state} ${s ? 'running' : ''}"><div class="dev-row"><div class="dev-ico">${ic('gamepad')}</div>
      <div class="dev-main"><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div>${chip(state, label)}</div>
      <div class="item-price">${esc(money(d.price_hour))}<small>/س</small></div></div>${body}</article>`;
  }
  function renderDevices() {
    const busy = st.board.filter(d => d.session).length;
    root.innerHTML = `<div class="glass perm">${PERMS[st.user.role]}</div>
      <div class="sec-title">لوحة الأجهزة <span class="muted" style="font-size:.85rem">${busy} شغّال من ${st.board.length}</span></div>
      <div class="dgrid">${st.board.map(deviceCard).join('') || '<div class="glass empty">لا توجد أجهزة.</div>'}</div>`;
    tick();
  }
  function tick() {
    const now = Date.now();
    $$('[data-timer]').forEach(el => { const s = +el.dataset.start, e = el.dataset.end ? +el.dataset.end : null;
      if (e) { const r = e - now; el.textContent = (r >= 0 ? 'متبقي ' : 'تجاوز ') + hms(r); el.classList.toggle('over', r < 0); } else el.textContent = hms(now - s); });
    $$('[data-bill]').forEach(el => { const d = el.dataset;
      el.textContent = money(Bill.invoice({ started_at: +d.start, planned_end: d.end ? +d.end : null }, [{ unit_price: +d.items, qty: 1 }], +d.price, now, C.billing).total); });
  }

  // ---------- الطلبات ----------
  function bookingLine(b, actions) {
    return `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(b.customer_name || 'عميل')}</div>
      <div class="item-sub" dir="ltr" style="text-align:right">${esc(b.customer_phone || '')}</div>
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

  // ---------- الحسابات (للمالك) ----------
  async function renderAccounts() {
    let sm; try { sm = await S.summary(); } catch (_) { return toast('تعذر تحميل الحسابات'); }
    const { invoices, expenses } = sm, sum = (a, k) => a.reduce((s, x) => s + Number(x[k]), 0);
    const t = sum(invoices, 'time_amount'), c = sum(invoices, 'items_amount'), ex = sum(expenses, 'amount'), net = t + c - ex;
    root.innerHTML = `<div class="sec-title">حسابات اليوم</div>
      <div class="stats4"><div class="glass stat"><small>إيراد الأجهزة</small><b>${esc(money(t))}</b></div><div class="glass stat"><small>إيراد الكافيه</small><b>${esc(money(c))}</b></div>
        <div class="glass stat"><small>المصروفات</small><b>${esc(money(ex))}</b></div><div class="glass stat"><small>عدد الفواتير</small><b>${invoices.length}</b></div>
        <div class="glass stat net"><small>صافي اليوم (إيراد − مصروفات)</small><b>${esc(money(net))}</b></div></div>
      <div class="sec-title">إضافة مصروف</div>
      <form class="glass formrow" id="expForm" novalidate><label class="field">البند<input name="title" required></label>
        <label class="field">المبلغ<input name="amount" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" required></label><button class="btn-sm" type="submit">إضافة</button></form>
      <div class="sec-title">فواتير اليوم</div>
      <div class="glass" style="padding:8px 16px">${invoices.map(v => `<div class="line"><span>${esc(v.device_name)} · ${esc(clock(v.paid_at))}</span><span>${esc(money(v.total))}</span></div>`).join('') || '<div class="empty">لا توجد فواتير بعد.</div>'}</div>
      <div class="sec-title">مصروفات اليوم</div>
      <div class="glass" style="padding:8px 16px">${expenses.map(x => `<div class="line"><span>${esc(x.title)} · ${esc(clock(x.spent_at))}</span><span>${esc(money(x.amount))}</span></div>`).join('') || '<div class="empty">لا توجد مصروفات.</div>'}</div>
      <p class="note">اليوم يبدأ الساعة ${C.dayStartHour} صباحًا.</p>`;
  }

  // ---------- الإعدادات (للمالك): الأجهزة والمنيو ----------
  async function renderManage() {
    let devs, menu; try { [devs, menu] = await Promise.all([S.devicesAll(), S.menuAll()]); } catch (_) { return toast('تعذر تحميل الإعدادات'); }
    st.devs = devs; st.menu = menu;
    root.innerHTML = `<div class="sec-title">الأجهزة والأسعار <button class="btn-sm" data-newdev>${ic('plus')} جهاز</button></div>
      <div class="dgrid">${devs.map(d => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)} · ${esc(money(d.price_hour))} للساعة</div></div>${chip(d.active === false ? 'done' : 'available', d.active === false ? 'مخفي' : 'ظاهر')}</div>
        <div class="row"><button class="btn-ghost" data-editdev="${esc(d.id)}">${ic('edit')} تعديل</button></div></article>`).join('')}</div>
      <div class="sec-title">المنيو <button class="btn-sm" data-newmenu>${ic('plus')} صنف</button></div>
      <div class="dgrid">${menu.map(m => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(m.name)}</div><div class="item-sub">${esc(m.cat)} · ${esc(money(m.price))}</div></div>${chip(m.active === false ? 'done' : 'available', m.active === false ? 'مخفي' : 'ظاهر')}</div>
        <div class="row"><button class="btn-ghost" data-editmenu="${esc(m.id)}">${ic('edit')} تعديل</button></div></article>`).join('')}</div>`;
  }
  function deviceForm(d) {
    d = d || { name: '', category: 'PS5', price_hour: '', active: true };
    openSheet(`<h3>${d.id ? 'تعديل جهاز' : 'جهاز جديد'}</h3><form class="form" id="devForm" novalidate><input type="hidden" name="id" value="${esc(d.id || '')}">
      <label>الاسم<input name="name" value="${esc(d.name)}" required></label>
      <label>الفئة<input name="category" list="cats" value="${esc(d.category)}" required><datalist id="cats"><option>PS5</option><option>PS4</option><option>VIP</option></datalist></label>
      <label>سعر الساعة (${esc(C.currency)})<input name="price" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" value="${esc(d.price_hour)}" required></label>
      <label class="chk"><input type="checkbox" name="active" ${d.active === false ? '' : 'checked'}> ظاهر للعملاء</label>
      <div class="err" id="fErr"></div><div class="actions"><button class="btn-primary" style="flex:1" type="submit">حفظ</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
  }
  function menuForm(m) {
    m = m || { name: '', desc: '', cat: '', price: '', active: true };
    openSheet(`<h3>${m.id ? 'تعديل صنف' : 'صنف جديد'}</h3><form class="form" id="menuForm" novalidate><input type="hidden" name="id" value="${esc(m.id || '')}">
      <label>الاسم<input name="name" value="${esc(m.name)}" required></label>
      <label>الوصف<input name="desc" value="${esc(m.desc)}"></label>
      <label>القسم<input name="cat" list="mcats" value="${esc(m.cat)}" required><datalist id="mcats">${[...new Set(st.menu.map(x => x.cat))].map(c => `<option>${esc(c)}</option>`).join('')}</datalist></label>
      <label>السعر (${esc(C.currency)})<input name="price" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" value="${esc(m.price)}" required></label>
      <label class="chk"><input type="checkbox" name="active" ${m.active === false ? '' : 'checked'}> ظاهر في المنيو</label>
      <div class="err" id="fErr"></div><div class="actions"><button class="btn-primary" style="flex:1" type="submit">حفظ</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
  }

  // ---------- الفريق (للمالك) ----------
  async function renderTeam() {
    let team; try { team = await S.team(); } catch (_) { return toast('تعذر تحميل الفريق'); }
    root.innerHTML = `<div class="sec-title">فريق العمل</div>
      <div class="list">${team.map(u => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(u.name)}</div><div class="item-sub" dir="ltr" style="text-align:right">${esc(u.phone)}</div></div>${chip(u.role === 'owner' ? 'confirmed' : 'booked', C.roles[u.role])}</div>
        ${u.role === 'cashier' ? `<div class="row"><button class="btn-ghost btn-danger" data-demote="${esc(u.phone)}">${ic('x')} إلغاء صلاحية الكاشير</button></div>` : ''}</article>`).join('')}</div>
      <div class="sec-title">إضافة كاشير</div>
      <form class="glass form" id="teamForm" novalidate><p class="mini">الموظف لازم يسجّل حساب عميل برقم هاتفه الأول من التطبيق، وبعدين اكتب رقمه هنا.</p>
        <label>رقم هاتف الموظف<input name="phone" type="tel" inputmode="tel" dir="ltr" placeholder="01XXXXXXXXX" required></label>
        <div class="err" id="fErr"></div><button class="btn-primary" type="submit">تعيين ككاشير</button></form>`;
  }

  // ---------- الأحداث ----------
  const act = async fn => { if (st.busy) return; st.busy = true; try { await fn(); } finally { st.busy = false; } };
  function bind() {
    document.addEventListener('click', e => {
      if (!st.user) return;
      const bg = e.target.closest('[data-sheetbg]'); if (bg && e.target === bg) return closeSheet();
      const lo = e.target.closest('#sLogout'); if (lo) return act(async () => { await g.WhiteStore.signOut(); location.reload(); });
      if (e.target.closest('#sTheme')) { const r = document.documentElement, n = r.dataset.theme === 'dark' ? 'light' : 'dark'; r.dataset.theme = n; try { localStorage.setItem('white-theme', n); } catch (_) {} return; }
      const t = e.target.closest('#staffRoot button, #sheetRoot button'); if (!t) return; const d = t.dataset;
      if (d.tab) return show(d.tab);
      if (d.timed) return openSheet(`<h3>تشغيل بوقت محدد</h3><div class="opts">${[1, 1.5, 2, 3, 4, 6].map(h => `<button class="opt" data-start="${esc(d.timed)}:${h}">${h}<small>ساعة</small></button>`).join('')}</div><div class="actions" style="margin-top:12px"><button class="btn-ghost" data-closesheet>إلغاء</button></div>`);
      if (d.start) return act(async () => { const [id, h] = d.start.split(':'); const r = await S.startSession(id, +h); closeSheet(); toast(r.ok ? 'تم تشغيل الجهاز' : r.error); await reload(); });
      if (d.open) return act(async () => { const r = await S.startSession(d.open, null); toast(r.ok ? 'تم تشغيل الجهاز بوقت مفتوح' : r.error); await reload(); });
      if (d.additem) { const items = st.menu.filter(m => m.active !== false);
        return openSheet(`<h3>طلب كافيه</h3><div class="opts">${items.map((m, i) => `<button class="opt" data-pick="${esc(d.additem)}:${esc(m.id)}">${esc(m.name)}<small>${esc(money(m.price))}</small></button>`).join('') || '<p class="muted">لا توجد أصناف.</p>'}</div><div class="actions" style="margin-top:12px"><button class="btn-sm" data-closesheet>تم</button></div>`); }
      if (d.pick) return act(async () => { const [sid, mid] = d.pick.split(':'), m = st.menu.find(x => String(x.id) === mid); if (!m) return; const r = await S.addItem(sid, { name: m.name, price: m.price }); toast(r.ok ? 'تمت إضافة ' + m.name : 'تعذر إضافة الطلب'); await refresh(); if (st.tab === 'devices') renderDevices(); });
      if ('closesheet' in d) return closeSheet();
      if (d.close) return act(async () => { const v = await S.previewInvoice(d.close);
        openSheet(`<h3>فاتورة ${esc(v.device_name)}</h3><div class="line"><span>الوقت (${v.minutes} دقيقة محسوبة)</span><span>${esc(money(v.time_amount))}</span></div>
          ${v.items.map(i => `<div class="line"><span>${esc(i.name)}</span><span>${esc(money(Number(i.unit_price) * (i.qty || 1)))}</span></div>`).join('')}
          <div class="line"><span>الإجمالي</span><span style="font-size:1.3rem;color:var(--primary)">${esc(money(v.total))}</span></div>
          <div class="actions" style="margin-top:14px"><button class="btn-primary" style="flex:1" data-confirmclose="${esc(d.close)}">تأكيد الدفع وإنهاء</button><button class="btn-ghost" data-closesheet>رجوع</button></div>`); });
      if (d.confirmclose) return act(async () => { const r = await S.closeSession(d.confirmclose); closeSheet(); toast(r.ok ? 'تم قفل الجلسة. الجهاز بقى متاح للعملاء' : r.error); await reload(); });
      if (d.approve || d.reject) return act(async () => { const ok = !!d.approve, r = await S.decide(d.approve || d.reject, ok); toast(r.ok ? (ok ? 'تم قبول الحجز' : 'تم رفض الحجز') : r.error); await reload(); });
      // للمالك فقط
      if (!isOwner()) return;
      if ('newdev' in d) return deviceForm();
      if (d.editdev) return deviceForm(st.devs.find(x => x.id === d.editdev));
      if ('newmenu' in d) return menuForm();
      if (d.editmenu) return menuForm(st.menu.find(x => String(x.id) === d.editmenu));
      if (d.demote) return act(async () => { const r = await S.setRole(d.demote, 'customer'); toast(r.ok ? 'تم إلغاء الصلاحية' : r.error); renderTeam(); });
    });
    document.addEventListener('submit', e => {
      if (!st.user) return; const f = e.target, id = f.getAttribute('id');  // لا نستخدم f.id لأن حقلًا اسمه id يحجب الخاصية if (!['expForm', 'devForm', 'menuForm', 'teamForm'].includes(id)) return;
      e.preventDefault(); if (!isOwner()) return;
      const fd = new FormData(f), err = m => { const x = $('#fErr'); if (x) x.textContent = m; };
      if (id === 'expForm') return act(async () => { const title = (fd.get('title') || '').trim(), amount = parseFloat(fd.get('amount'));
        if (!title || !(amount > 0)) return toast('اكتب البند ومبلغًا أكبر من صفر'); const r = await S.addExpense({ title, amount }); toast(r.ok ? 'تمت إضافة المصروف' : 'تعذر إضافة المصروف'); renderAccounts(); });
      if (id === 'devForm') return act(async () => { const name = (fd.get('name') || '').trim(), category = (fd.get('category') || '').trim(), price = parseFloat(fd.get('price'));
        if (!name || !category || !(price >= 0)) return err('اكمل الاسم والفئة والسعر');
        const r = await S.saveDevice({ id: fd.get('id') || null, name, category, price_hour: price, active: !!fd.get('active') }); if (!r.ok) return err(r.error || 'تعذر الحفظ'); closeSheet(); toast('تم الحفظ'); renderManage(); });
      if (id === 'menuForm') return act(async () => { const name = (fd.get('name') || '').trim(), cat = (fd.get('cat') || '').trim(), price = parseFloat(fd.get('price'));
        if (!name || !cat || !(price >= 0)) return err('اكمل الاسم والقسم والسعر');
        const r = await S.saveMenu({ id: fd.get('id') || null, name, desc: (fd.get('desc') || '').trim(), cat, price, active: !!fd.get('active') }); if (!r.ok) return err(r.error || 'تعذر الحفظ'); closeSheet(); toast('تم الحفظ'); renderManage(); });
      if (id === 'teamForm') return act(async () => { const phone = g.WhitePhone.normalize(fd.get('phone')); if (!g.WhitePhone.valid(phone)) return err('اكتب رقم هاتف صحيح');
        const r = await S.setRole(phone, 'cashier'); if (!r.ok) return err(r.error); toast('تم تعيين الكاشير'); renderTeam(); });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  }
  g.WhiteStaffApp = { mount };
})(window);
