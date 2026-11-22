// White — لوحة الموظفين: كاشير (تشغيل + كافيه) ومالك (كل شيء + حسابات + إعدادات)
// ملاحظة: إخفاء التبويبات هنا للوضوح فقط. منع الوصول الحقيقي بقواعد RLS في قاعدة البيانات.
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, S = g.WhiteStaff, Bill = g.WhiteBilling, ic = n => g.WhiteUI.icon(n), H = 36e5;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const nf = n => new Intl.NumberFormat(C.locale, { maximumFractionDigits: 2 }).format(n);
  const money = n => nf(n) + ' ' + C.currency;
  const clock = t => new Date(t).toLocaleTimeString(C.locale, { hour: 'numeric', minute: '2-digit' });
  const dtxt = t => new Date(t).toLocaleDateString(C.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const p2 = n => String(n).padStart(2, '0');
  const hms = ms => { const s = Math.floor(Math.abs(ms) / 1000); return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s % 3600 / 60))}:${p2(s % 60)}`; };
  const durText = h => { const hh = Math.floor(h), m = Math.round((h - hh) * 60); return nf(hh) + ' ساعة' + (m ? ' و' + nf(m) + ' دقيقة' : ''); };
  const minText = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return (h ? nf(h) + ' ساعة' : '') + (h && r ? ' و' : '') + (r || !h ? nf(r) + ' دقيقة' : ''); };
  const sumItems = it => Math.round(it.reduce((s, i) => s + Number(i.unit_price) * (i.qty || 1), 0) * 100) / 100;
  const TABS = { devices: ['الأجهزة', 'gamepad'], cafe: ['الكافيه', 'coffee'], bookings: ['الطلبات', 'inbox'], accounts: ['الحسابات', 'chart'], manage: ['الإعدادات', 'settings'] };
  const ROLE_TABS = { owner: ['devices', 'cafe', 'bookings', 'accounts', 'manage'], cashier: ['devices', 'cafe', 'bookings'] };
  const PERMS = {
    owner: '<b>صلاحياتك كمالك:</b> كل شيء. تشغيل الأجهزة والكافيه والحجوزات، الحسابات والمصروفات، وتعديل الأجهزة والأسعار والمنيو والفئات، وإدارة الكاشيرية.',
    cashier: '<b>صلاحياتك ككاشير:</b> تشغيل الأجهزة، طلبات الكافيه (بجهاز وبدون جهاز)، قبول ورفض الحجوزات، وإنهاء الجلسات. الحسابات والإعدادات للمالك فقط.'
  };
  const st = { user: null, tab: 'devices', board: [], bk: { pending: [], confirmed: [] }, menu: [], cafe: [], cats: [], devs: [], seg: { acc: 'invoices', manage: 'devices' }, dur: 1, sheet: null, busy: false, bound: false };
  let root, tt;
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); };
  const chip = (k, txt) => `<span class="chip s-${k}">${esc(txt)}</span>`;
  const isOwner = () => st.user && st.user.role === 'owner';

  // تجميع الأصناف المتشابهة (نفس الاسم والسعر)
  function group(items) {
    const m = new Map();
    items.forEach(i => { const k = i.name + '|' + Number(i.unit_price); const e = m.get(k) || { name: i.name, price: Number(i.unit_price), qty: 0, ids: [] }; e.qty += i.qty || 1; e.ids.push(i.id); m.set(k, e); });
    return [...m.values()];
  }
  const itemsLine = items => group(items).map(x => esc(x.name) + (x.qty > 1 ? ' ×' + nf(x.qty) : '')).join('، ');

  // ---------- النافذة السفلية ----------
  function openSheet(html, keep) {
    const old = $('#sheetRoot .sheet'), top = keep && old ? old.scrollTop : 0;
    $('#sheetRoot').innerHTML = `<div class="sheet-bg" data-sheetbg><div class="glass sheet" role="dialog" aria-modal="true">${html}</div></div>`;
    const n = $('#sheetRoot .sheet'); if (n && top) n.scrollTop = top;
  }
  function closeSheet() { $('#sheetRoot').innerHTML = ''; st.sheet = null; if (['devices', 'cafe'].includes(st.tab)) { ({ devices: renderDevices, cafe: renderCafe })[st.tab](); } }
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
    if (!st.bound) { bind(); st.bound = true; setInterval(tick, 1000);
      setInterval(async () => { if (!st.user || sheetOpen() || ['accounts', 'manage'].includes(st.tab) || document.hidden) return; await reload(); }, 15000); }
    refresh().then(() => show('devices'));
  }

  async function refresh() {
    try { [st.board, st.bk, st.menu, st.cafe, st.cats] = await Promise.all([S.board(), S.bookings(), S.menuAll(), S.cafeOrders(), S.categories()]); } catch (_) { toast('تعذر تحميل البيانات'); }
    const n = st.bk.pending.length, b = $('#pendBadge'); if (b) { b.hidden = !n; b.textContent = n; }
  }
  const reload = async () => { await refresh(); if (['devices', 'cafe', 'bookings'].includes(st.tab)) show(st.tab); };
  const FN = () => ({ devices: renderDevices, cafe: renderCafe, bookings: renderBookings, accounts: renderAccounts, manage: renderManage });
  function show(tab) {
    if (!(ROLE_TABS[st.user.role] || []).includes(tab)) tab = 'devices';
    st.tab = tab; $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); scrollTo({ top: 0 });
    FN()[tab]();
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
      const total = sumItems(s.items);
      body = `<div class="timer" data-timer data-start="${s.started_at}" data-end="${s.planned_end || ''}">--:--:--</div>
        <div class="mini">بدأت ${esc(clock(s.started_at))}${s.planned_end ? ' · حجز لحد ' + esc(clock(s.planned_end)) : ' · وقت مفتوح'}</div>
        <div class="mini items-line">${s.items.length ? '<b>الكافيه:</b> ' + itemsLine(s.items) + ' · ' + esc(money(total)) : 'مفيش طلبات كافيه'}</div>
        <div class="bill"><span>الحساب الحالي</span><b data-bill data-start="${s.started_at}" data-price="${Number(d.price_hour)}" data-itemsum="${total}">--</b></div>
        <div class="actions"><button class="btn-ghost" data-items="${esc(s.id)}" data-kind="session" data-title="${esc(d.name)}">${ic('coffee')} طلبات الكافيه</button><button class="btn-sm" data-close="${esc(s.id)}">إنهاء وحساب</button></div>`;
    }
    return `<article class="glass ad s-${state} ${s ? 'running' : ''}"><div class="dev-row"><div class="dev-ico">${ic('gamepad')}</div>
      <div class="dev-main"><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div>${chip(state, label)}</div>
      <div class="item-price">${esc(money(d.price_hour))}<small>/س</small></div></div>${body}</article>`;
  }
  function renderDevices() {
    const busy = st.board.filter(d => d.session).length;
    root.innerHTML = `<div class="glass perm">${PERMS[st.user.role]}</div>
      <div class="sec-title">لوحة الأجهزة <span class="muted small">${nf(busy)} شغّال من ${nf(st.board.length)}</span></div>
      <div class="dgrid">${st.board.map(deviceCard).join('') || '<div class="glass empty">لا توجد أجهزة.</div>'}</div>`;
    tick();
  }
  function tick() {
    const now = Date.now();
    $$('[data-timer]').forEach(el => { const s = +el.dataset.start, e = el.dataset.end ? +el.dataset.end : null;
      if (e) { const r = e - now; el.textContent = (r >= 0 ? 'متبقي ' : 'تجاوز ') + hms(r); el.classList.toggle('over', r < 0); } else el.textContent = hms(now - s); });
    $$('[data-bill]').forEach(el => { const d = el.dataset;
      el.textContent = money(Bill.invoice({ started_at: +d.start }, [{ unit_price: +d.itemsum, qty: 1 }], +d.price, now, C.billing).total); });
  }

  // مدة التشغيل: تبدأ بساعة وتزيد نص ساعة حتى الحد الأقصى
  function paintDur() {
    const r = C.staffSession;
    $('#durVal').textContent = durText(st.dur); $('#durEnd').textContent = 'تنتهي الساعة ' + clock(Date.now() + st.dur * H);
    $$('[data-step]').forEach(b => { b.disabled = +b.dataset.step < 0 ? st.dur <= r.minHours : st.dur >= r.maxHours; });
    $$('[data-preset]').forEach(b => b.classList.toggle('on', +b.dataset.preset === st.dur));
  }
  function durSheet(deviceId) {
    const r = C.staffSession; st.dur = r.minHours; st.sheet = { dur: true };
    openSheet(`<h3>تشغيل بوقت محدد</h3>
      <div class="stepper"><button class="step" data-step="-1" aria-label="أقل نص ساعة">−</button>
        <div class="step-val"><b id="durVal"></b><small id="durEnd"></small></div>
        <button class="step" data-step="1" aria-label="أكتر نص ساعة">+</button></div>
      <div class="presets">${[1, 2, 3, 5, 10].filter(h => h >= r.minHours && h <= r.maxHours).map(h => `<button class="fchip" data-preset="${h}">${nf(h)} ساعة</button>`).join('')}</div>
      <p class="mini" style="margin:10px 2px">الزيادة والنقص بنص ساعة، من ${nf(r.minHours)} لحد ${nf(r.maxHours)} ساعات. والحساب بيكون على الوقت الفعلي.</p>
      <div class="actions"><button class="btn-primary" style="flex:1" data-startnow="${esc(deviceId)}">تشغيل</button><button class="btn-ghost" data-closesheet>إلغاء</button></div>`);
    paintDur();
  }

  // ---------- أصناف الكافيه (لجلسة جهاز أو طلب مستقل): عرض + إضافة + إلغاء صنف راجع ----------
  async function itemsSheet(kind, id, title, keep) {
    let items; try { items = await S.itemsOf(kind, id); } catch (_) { return toast('تعذر تحميل الطلبات'); }
    const gs = group(items), menu = st.menu.filter(m => m.active !== false);
    st.sheet = { kind, id, title, groups: gs, menu };
    const cnt = m => { const x = gs.find(y => y.name === m.name && y.price === Number(m.price)); return x ? x.qty : 0; };
    const cats = [...new Set(menu.map(m => m.cat))];
    openSheet(`<h3>${ic('coffee')} طلبات ${esc(title)}</h3>
      <div class="sec-mini">اللي اتطلب (${nf(items.length)})</div>
      <div class="ilist">${gs.map((x, i) => `<div class="irow"><div class="iname"><b>${esc(x.name)}</b><small>${esc(money(x.price))} للواحد · ${esc(money(x.price * x.qty))}</small></div>
        <div class="qty"><button class="qbtn" data-gminus="${i}" aria-label="إلغاء واحد (مرتجع)">−</button><span>${nf(x.qty)}</span><button class="qbtn" data-gplus="${i}" aria-label="زيادة واحد">+</button></div></div>`).join('') || '<p class="muted" style="padding:6px 2px">لسه مفيش طلبات. اضغط على صنف من تحت لإضافته.</p>'}</div>
      <div class="line total-line"><span>إجمالي الكافيه</span><span>${esc(money(sumItems(items)))}</span></div>
      <div class="sec-mini">أضف صنف</div>
      ${cats.map(c => `<div class="lbl">${esc(c)}</div><div class="opts">${menu.map((m, i) => ({ m, i })).filter(x => x.m.cat === c).map(({ m, i }) => `<button class="opt" data-gadd="${i}">${esc(m.name)}<small>${esc(money(m.price))}</small>${cnt(m) ? `<span class="cnt">${nf(cnt(m))}</span>` : ''}</button>`).join('')}</div>`).join('') || '<p class="muted">لا توجد أصناف في المنيو.</p>'}
      <div class="actions" style="margin-top:14px"><button class="btn-primary" style="flex:1" data-closesheet>تم</button></div>`, keep);
  }

  // ---------- معاينة الفاتورة قبل الإنهاء (مع إمكانية إلغاء صنف) ----------
  async function previewSheet(kind, id, keep) {
    let v; try { v = await S.previewInvoice(kind, id); } catch (_) { return toast('تعذر تحميل الفاتورة'); }
    const gs = group(v.items); st.sheet = { preview: true, kind, id, groups: gs };
    openSheet(`<h3>فاتورة ${esc(v.title)}</h3>
      ${kind === 'session' ? `<div class="line"><span>بدأ الساعة</span><span>${esc(clock(v.started_at))}</span></div>
        <div class="line"><span>الوقت الفعلي</span><span>${esc(minText(v.actual_minutes))}</span></div>
        <div class="line"><span>المحسوب (تقريب لأعلى)</span><span>${esc(minText(v.minutes))} · ${esc(money(v.time_amount))}</span></div>` : ''}
      <div class="sec-mini">الأصناف</div>
      ${gs.map((x, i) => `<div class="irow"><div class="iname"><b>${esc(x.name)}${x.qty > 1 ? ' ×' + nf(x.qty) : ''}</b><small>${esc(money(x.price * x.qty))}</small></div>
        <button class="btn-ghost btn-danger" data-pminus="${i}">${ic('x')} إلغاء واحد</button></div>`).join('') || '<p class="muted" style="padding:6px 2px">لا توجد أصناف.</p>'}
      <div class="line total-line"><span>الإجمالي</span><span>${esc(money(v.total))}</span></div>
      <p class="mini">الحساب النهائي لحظة التأكيد.</p>
      <div class="actions" style="margin-top:10px"><button class="btn-primary" style="flex:1" data-confirmclose="${kind}:${esc(id)}">تأكيد الدفع وإنهاء</button>
        ${kind === 'session' || v.items.length ? '<button class="btn-ghost" data-closesheet>رجوع</button>' : ''}</div>`, keep);
  }

  // ---------- تفاصيل فاتورة مقفولة ----------
  async function invoiceSheet(id) {
    let v; try { v = await S.invoiceDetail(id); } catch (_) { return toast('تعذر تحميل الفاتورة'); } if (!v) return toast('الفاتورة غير موجودة');
    const gs = group(v.items);
    openSheet(`<h3>${v.kind === 'cafe' ? 'فاتورة كافيه' : 'فاتورة جهاز'}: ${esc(v.title)}</h3>
      <div class="line"><span>التاريخ</span><span>${esc(dtxt(v.paid_at))} · ${esc(clock(v.paid_at))}</span></div>
      ${v.kind === 'session' ? `<div class="line"><span>من / إلى</span><span>${esc(clock(v.started_at))} ← ${esc(clock(v.ended_at))}</span></div>
        <div class="line"><span>الوقت الفعلي</span><span>${esc(minText(v.actual_minutes))}</span></div>
        <div class="line"><span>المحسوب</span><span>${esc(minText(v.minutes))}</span></div>
        <div class="line"><span>حساب الوقت</span><span>${esc(money(v.time_amount))}</span></div>` : ''}
      <div class="sec-mini">أصناف الكافيه</div>
      ${gs.map(x => `<div class="line"><span>${esc(x.name)}${x.qty > 1 ? ' ×' + nf(x.qty) : ''}</span><span>${esc(money(x.price * x.qty))}</span></div>`).join('') || '<p class="muted" style="padding:6px 2px">لا توجد أصناف.</p>'}
      <div class="line"><span>حساب الكافيه</span><span>${esc(money(v.items_amount))}</span></div>
      <div class="line total-line"><span>الإجمالي</span><span>${esc(money(v.total))}</span></div>
      <div class="actions" style="margin-top:14px"><button class="btn-ghost" data-closesheet>إغلاق</button></div>`);
  }

  // ---------- الكافيه المستقل ----------
  function cafeCard(o) {
    const total = sumItems(o.items);
    return `<article class="glass ad"><div class="item-head"><div><div class="item-name">${esc(o.label || 'طلب بدون اسم')}</div><div class="item-sub">فُتح ${esc(clock(o.opened_at))}</div></div><b class="item-price">${esc(money(total))}</b></div>
      <div class="mini items-line">${o.items.length ? itemsLine(o.items) : 'لسه مفيش أصناف'}</div>
      <div class="actions"><button class="btn-ghost" data-items="${esc(o.id)}" data-kind="cafe" data-title="${esc(o.label || 'الطلب')}">${ic('plus')} الأصناف</button>
        <button class="btn-sm" data-cafeclose="${esc(o.id)}" ${o.items.length ? '' : 'disabled'}>تحصيل وإنهاء</button>
        ${o.items.length ? '' : `<button class="btn-ghost btn-danger" data-cafecancel="${esc(o.id)}">إلغاء</button>`}</div></article>`;
  }
  function renderCafe() {
    root.innerHTML = `<div class="sec-title">الكافيه بدون جهاز <button class="btn-sm" data-newcafe>${ic('plus')} طلب جديد</button></div>
      <p class="mini" style="margin:0 4px 14px">لعملاء الكافيه اللي مش بيلعبوا بلايستيشن: افتح طلب، ضيف الأصناف، وحصّل.</p>
      <div class="dgrid">${st.cafe.map(cafeCard).join('') || '<div class="glass empty">لا توجد طلبات مفتوحة.</div>'}</div>`;
  }

  // ---------- الطلبات ----------
  function bookingLine(b, actions) {
    return `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(b.customer_name || 'عميل')}</div>
      <div class="item-sub ltr">${esc(b.customer_phone || '')}</div>
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
    const { invoices, expenses } = sm, sum = (a, k) => a.reduce((s, x) => s + Number(x[k]), 0), seg = st.seg.acc;
    const t = sum(invoices, 'time_amount'), c = sum(invoices, 'items_amount'), ex = sum(expenses, 'amount'), net = t + c - ex;
    root.innerHTML = `<div class="sec-title">حسابات اليوم <span class="muted small">${esc(dtxt(Date.now()))}</span></div>
      <div class="stats4"><div class="glass stat"><small>إيراد الأجهزة</small><b>${esc(money(t))}</b></div><div class="glass stat"><small>إيراد الكافيه</small><b>${esc(money(c))}</b></div>
        <div class="glass stat"><small>المصروفات</small><b>${esc(money(ex))}</b></div><div class="glass stat"><small>عدد الفواتير</small><b>${nf(invoices.length)}</b></div>
        <div class="glass stat net"><small>صافي اليوم (إيراد − مصروفات)</small><b>${esc(money(net))}</b></div></div>
      <div class="seg" style="margin-top:18px"><button class="${seg === 'invoices' ? 'on' : ''}" data-seg="acc:invoices">الفواتير (${nf(invoices.length)})</button><button class="${seg === 'expenses' ? 'on' : ''}" data-seg="acc:expenses">المصروفات (${nf(expenses.length)})</button></div>
      ${seg === 'invoices'
        ? `<div class="glass list-card">${invoices.map(v => `<button class="inv" data-inv="${esc(v.id)}"><span class="inv-main"><b>${esc(v.title)}</b><small>${v.kind === 'cafe' ? 'كافيه' : 'جهاز'} · ${esc(clock(v.paid_at))}</small></span><span class="inv-amt">${esc(money(v.total))}</span></button>`).join('') || '<div class="empty">لا توجد فواتير بعد.</div>'}</div>
           <p class="note">اضغط على أي فاتورة لعرض تفاصيلها. اليوم يبدأ الساعة ${nf(C.dayStartHour)} صباحًا.</p>`
        : `<form class="glass form" id="expForm" novalidate><label>البند<input name="title" required></label>
             <label>المبلغ (${esc(C.currency)})<input name="amount" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" required></label><button class="btn-sm" type="submit" style="justify-self:start">${ic('plus')} إضافة مصروف</button></form>
           <div class="glass list-card" style="margin-top:14px">${expenses.map(x => `<div class="line"><span>${esc(x.title)} · ${esc(clock(x.spent_at))}</span><span>${esc(money(x.amount))}</span></div>`).join('') || '<div class="empty">لا توجد مصروفات اليوم.</div>'}</div>`}`;
  }

  // ---------- الإعدادات (للمالك) ----------
  async function renderManage() {
    try { [st.devs, st.menu, st.cats] = await Promise.all([S.devicesAll(), S.menuAll(), S.categories()]); } catch (_) { return toast('تعذر تحميل الإعدادات'); }
    const seg = st.seg.manage, SEG = [['devices', 'الأجهزة'], ['menu', 'المنيو'], ['cats', 'الفئات'], ['team', 'الفريق']];
    let body = '';
    if (seg === 'devices') body = `<div class="sec-title">الأجهزة والأسعار <button class="btn-sm" data-newdev>${ic('plus')} جهاز</button></div>
      <div class="dgrid">${st.devs.map(d => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)} · ${esc(money(d.price_hour))} للساعة</div></div>${chip(d.active === false ? 'done' : 'available', d.active === false ? 'مخفي' : 'ظاهر')}</div>
        <div class="row"><button class="btn-ghost" data-editdev="${esc(d.id)}">${ic('edit')} تعديل</button></div></article>`).join('')}</div>`;
    else if (seg === 'menu') body = `<div class="sec-title">المنيو <button class="btn-sm" data-newmenu>${ic('plus')} صنف</button></div>
      <div class="dgrid">${st.menu.map(m => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(m.name)}</div><div class="item-sub">${esc(m.cat)} · ${esc(money(m.price))}</div></div>${chip(m.active === false ? 'done' : 'available', m.active === false ? 'مخفي' : 'ظاهر')}</div>
        <div class="row"><button class="btn-ghost" data-editmenu="${esc(m.id)}">${ic('edit')} تعديل</button></div></article>`).join('')}</div>`;
    else if (seg === 'cats') {
      const sec = (kind, title) => { const list = st.cats.filter(c => c.kind === kind), used = c => (kind === 'device' ? st.devs.filter(d => d.category === c.name) : st.menu.filter(m => m.cat === c.name)).length;
        return `<div class="sec-title">${title} <button class="btn-sm" data-newcat="${kind}">${ic('plus')} فئة</button></div><div class="dgrid">${list.map(c => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(c.name)}</div>
          <div class="item-sub">${nf(used(c))} ${kind === 'device' ? 'جهاز' : 'صنف'}${c.description ? ' · ' + esc(c.description) : ''}</div></div></div>
          <div class="row"><button class="btn-ghost" data-editcat="${esc(c.id)}">${ic('edit')} تعديل</button><button class="btn-ghost btn-danger" data-delcat="${esc(c.id)}">${ic('x')} حذف</button></div></article>`).join('') || '<div class="glass empty">لا توجد فئات.</div>'}</div>`; };
      body = sec('device', 'فئات الأجهزة') + sec('menu', 'فئات المنيو') + '<p class="note">تعديل اسم فئة بينتقل تلقائيًا لكل الأجهزة أو الأصناف التابعة لها. والحذف مش بيتم لو فيها عناصر.</p>';
    } else {
      let team; try { team = await S.team(); } catch (_) { return toast('تعذر تحميل الفريق'); }
      body = `<div class="sec-title">فريق العمل</div><div class="list">${team.map(u => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(u.name)}</div><div class="item-sub ltr">${esc(u.phone)}</div></div>${chip(u.role === 'owner' ? 'confirmed' : 'booked', C.roles[u.role])}</div>
        ${u.role === 'cashier' ? `<div class="row"><button class="btn-ghost btn-danger" data-demote="${esc(u.phone)}">${ic('x')} إلغاء صلاحية الكاشير</button></div>` : ''}</article>`).join('')}</div>
        <div class="sec-title">إضافة كاشير</div>
        <form class="glass form" id="teamForm" novalidate><p class="mini">الموظف لازم يسجّل حساب عميل برقم هاتفه الأول من التطبيق، وبعدين اكتب رقمه هنا.</p>
          <label>رقم هاتف الموظف<input name="phone" type="tel" inputmode="tel" dir="ltr" placeholder="01XXXXXXXXX" required></label>
          <div class="err" id="fErr"></div><button class="btn-primary" type="submit">تعيين ككاشير</button></form>`;
    }
    root.innerHTML = `<div class="seg n4">${SEG.map(([k, t]) => `<button class="${seg === k ? 'on' : ''}" data-seg="manage:${k}">${t}</button>`).join('')}</div>${body}`;
  }
  const catOptions = (kind, cur) => { const names = st.cats.filter(c => c.kind === kind).map(c => c.name); if (cur && !names.includes(cur)) names.push(cur);
    return names.length ? names.map(n => `<option ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('') : '<option value="">(أضف فئة من تبويب الفئات أولًا)</option>'; };
  function deviceForm(d) {
    d = d || { name: '', category: '', price_hour: '', active: true };
    openSheet(`<h3>${d.id ? 'تعديل جهاز' : 'جهاز جديد'}</h3><form class="form" id="devForm" novalidate><input type="hidden" name="id" value="${esc(d.id || '')}">
      <label>الاسم<input name="name" value="${esc(d.name)}" required></label>
      <label>الفئة<select name="category">${catOptions('device', d.category)}</select></label>
      <label>سعر الساعة (${esc(C.currency)})<input name="price" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" value="${esc(d.price_hour)}" required></label>
      <label class="chk"><input type="checkbox" name="active" ${d.active === false ? '' : 'checked'}> ظاهر للعملاء</label>
      <div class="err" id="fErr"></div><div class="actions"><button class="btn-primary" style="flex:1" type="submit">حفظ</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
  }
  function menuForm(m) {
    m = m || { name: '', desc: '', cat: '', price: '', active: true };
    openSheet(`<h3>${m.id ? 'تعديل صنف' : 'صنف جديد'}</h3><form class="form" id="menuForm" novalidate><input type="hidden" name="id" value="${esc(m.id || '')}">
      <label>الاسم<input name="name" value="${esc(m.name)}" required></label>
      <label>الوصف<input name="desc" value="${esc(m.desc)}"></label>
      <label>الفئة<select name="cat">${catOptions('menu', m.cat)}</select></label>
      <label>السعر (${esc(C.currency)})<input name="price" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" value="${esc(m.price)}" required></label>
      <label class="chk"><input type="checkbox" name="active" ${m.active === false ? '' : 'checked'}> ظاهر في المنيو</label>
      <div class="err" id="fErr"></div><div class="actions"><button class="btn-primary" style="flex:1" type="submit">حفظ</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
  }
  function catForm(kind, c) {
    c = c || { name: '', description: '' };
    openSheet(`<h3>${c.id ? 'تعديل فئة' : kind === 'device' ? 'فئة أجهزة جديدة' : 'فئة منيو جديدة'}</h3><form class="form" id="catForm" novalidate><input type="hidden" name="id" value="${esc(c.id || '')}"><input type="hidden" name="kind" value="${kind}">
      <label>الاسم<input name="name" value="${esc(c.name)}" required></label>
      ${kind === 'device' ? `<label>وصف يظهر للعميل في تفاصيل الجهاز<input name="description" value="${esc(c.description || '')}"></label>` : ''}
      <div class="err" id="fErr"></div><div class="actions"><button class="btn-primary" style="flex:1" type="submit">حفظ</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
  }

  // ---------- الأحداث ----------
  const act = async fn => { if (st.busy) return; st.busy = true; try { await fn(); } finally { st.busy = false; } };
  const stay = async () => { await refresh(); if (st.sheet && st.sheet.kind && !st.sheet.preview) return itemsSheet(st.sheet.kind, st.sheet.id, st.sheet.title, true); };
  function bind() {
    document.addEventListener('click', e => {
      if (!st.user) return;
      const bg = e.target.closest('[data-sheetbg]'); if (bg && e.target === bg) return closeSheet();
      if (e.target.closest('#sLogout')) return act(async () => { await g.WhiteStore.signOut(); location.reload(); });
      if (e.target.closest('#sTheme')) { const r = document.documentElement, n = r.dataset.theme === 'dark' ? 'light' : 'dark'; r.dataset.theme = n; try { localStorage.setItem('white-theme', n); } catch (_) {} return; }
      const t = e.target.closest('#staffRoot button, #sheetRoot button'); if (!t) return; const d = t.dataset;
      if (d.tab) return show(d.tab);
      if (d.seg) { const [k, v] = d.seg.split(':'); st.seg[k] = v; return FN()[k === 'acc' ? 'accounts' : 'manage'](); }
      if ('closesheet' in d) return closeSheet();
      // تشغيل الأجهزة
      if (d.timed) return durSheet(d.timed);
      if (d.step) { const r = C.staffSession; st.dur = Math.min(r.maxHours, Math.max(r.minHours, st.dur + (+d.step) * r.stepHours)); return paintDur(); }
      if (d.preset) { st.dur = +d.preset; return paintDur(); }
      if (d.startnow) return act(async () => { const r = await S.startSession(d.startnow, st.dur); $('#sheetRoot').innerHTML = ''; st.sheet = null; toast(r.ok ? 'تم تشغيل الجهاز لمدة ' + durText(st.dur) : r.error); await reload(); });
      if (d.open) return act(async () => { const r = await S.startSession(d.open, null); toast(r.ok ? 'تم تشغيل الجهاز بوقت مفتوح' : r.error); await reload(); });
      // أصناف الكافيه
      if (d.items) return itemsSheet(d.kind, d.items, d.title);
      if (d.gadd) return act(async () => { const m = st.sheet.menu[+d.gadd]; if (!m) return; const r = await S.addItem(st.sheet.kind, st.sheet.id, { name: m.name, price: m.price }); if (!r.ok) toast(r.error); await stay(); });
      if (d.gplus) return act(async () => { const x = st.sheet.groups[+d.gplus]; const r = await S.addItem(st.sheet.kind, st.sheet.id, { name: x.name, price: x.price }); if (!r.ok) toast(r.error); await stay(); });
      if (d.gminus) return act(async () => { const x = st.sheet.groups[+d.gminus]; const r = await S.removeItem(st.sheet.kind, x.ids[x.ids.length - 1]); toast(r.ok ? 'تم إلغاء ' + x.name : r.error); await stay(); });
      // الفاتورة
      if (d.close) return previewSheet('session', d.close);
      if (d.cafeclose) return previewSheet('cafe', d.cafeclose);
      if (d.pminus) return act(async () => { const x = st.sheet.groups[+d.pminus], { kind, id } = st.sheet; const r = await S.removeItem(kind, x.ids[x.ids.length - 1]); toast(r.ok ? 'تم إلغاء ' + x.name + ' من الفاتورة' : r.error); await previewSheet(kind, id, true); });
      if (d.confirmclose) return act(async () => { const [kind, id] = d.confirmclose.split(':'); const r = kind === 'cafe' ? await S.closeCafe(id) : await S.closeSession(id);
        $('#sheetRoot').innerHTML = ''; st.sheet = null; toast(r.ok ? (kind === 'cafe' ? 'تم تحصيل الطلب' : 'تم قفل الجلسة. الجهاز بقى متاح للعملاء') : r.error); await reload(); });
      if (d.inv) return invoiceSheet(d.inv);
      // الكافيه المستقل
      if ('newcafe' in d) return openSheet(`<h3>طلب كافيه جديد</h3><form class="form" id="cafeForm" novalidate><label>الاسم أو رقم الطاولة (اختياري)<input name="label" placeholder="مثال: طاولة 3"></label>
        <div class="actions"><button class="btn-primary" style="flex:1" type="submit">فتح الطلب</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
      if (d.cafecancel) return act(async () => { const r = await S.cancelCafe(d.cafecancel); toast(r.ok ? 'تم إلغاء الطلب' : r.error); await reload(); });
      // الطلبات
      if (d.approve || d.reject) return act(async () => { const ok = !!d.approve, r = await S.decide(d.approve || d.reject, ok); toast(r.ok ? (ok ? 'تم قبول الحجز' : 'تم رفض الحجز') : r.error); await reload(); });
      // للمالك فقط
      if (!isOwner()) return;
      if ('newdev' in d) return deviceForm();
      if (d.editdev) return deviceForm(st.devs.find(x => x.id === d.editdev));
      if ('newmenu' in d) return menuForm();
      if (d.editmenu) return menuForm(st.menu.find(x => String(x.id) === d.editmenu));
      if (d.newcat) return catForm(d.newcat);
      if (d.editcat) { const c = st.cats.find(x => x.id === d.editcat); return c && catForm(c.kind, c); }
      if (d.delcat) { const c = st.cats.find(x => x.id === d.delcat); if (!c || !confirm('حذف الفئة "' + c.name + '"؟')) return; return act(async () => { const r = await S.deleteCategory(c.id); toast(r.ok ? 'تم الحذف' : r.error); renderManage(); }); }
      if (d.demote) return act(async () => { const r = await S.setRole(d.demote, 'customer'); toast(r.ok ? 'تم إلغاء الصلاحية' : r.error); renderManage(); });
    });
    document.addEventListener('submit', e => {
      if (!st.user) return; const f = e.target, id = f.getAttribute('id');  // لا نستخدم f.id لأن حقلًا اسمه id يحجب الخاصية
      if (!['cafeForm', 'expForm', 'devForm', 'menuForm', 'catForm', 'teamForm'].includes(id)) return;
      e.preventDefault();
      const fd = new FormData(f), err = m => { const x = $('#fErr'); if (x) x.textContent = m; };
      if (id === 'cafeForm') return act(async () => { const r = await S.openCafe((fd.get('label') || '').trim()); if (!r.ok) return toast(r.error); await refresh(); renderCafe(); itemsSheet('cafe', r.id, (fd.get('label') || '').trim() || 'الطلب'); });
      if (!isOwner()) return;
      if (id === 'expForm') return act(async () => { const title = (fd.get('title') || '').trim(), amount = parseFloat(fd.get('amount'));
        if (!title || !(amount > 0)) return toast('اكتب البند ومبلغًا أكبر من صفر'); const r = await S.addExpense({ title, amount }); toast(r.ok ? 'تمت إضافة المصروف' : 'تعذر إضافة المصروف'); renderAccounts(); });
      if (id === 'devForm') return act(async () => { const name = (fd.get('name') || '').trim(), category = (fd.get('category') || '').trim(), price = parseFloat(fd.get('price'));
        if (!name || !category || !(price >= 0)) return err('اكمل الاسم والفئة والسعر');
        const r = await S.saveDevice({ id: fd.get('id') || null, name, category, price_hour: price, active: !!fd.get('active') }); if (!r.ok) return err(r.error || 'تعذر الحفظ'); closeSheet(); toast('تم الحفظ'); renderManage(); });
      if (id === 'menuForm') return act(async () => { const name = (fd.get('name') || '').trim(), cat = (fd.get('cat') || '').trim(), price = parseFloat(fd.get('price'));
        if (!name || !cat || !(price >= 0)) return err('اكمل الاسم والفئة والسعر');
        const r = await S.saveMenu({ id: fd.get('id') || null, name, desc: (fd.get('desc') || '').trim(), cat, price, active: !!fd.get('active') }); if (!r.ok) return err(r.error || 'تعذر الحفظ'); closeSheet(); toast('تم الحفظ'); renderManage(); });
      if (id === 'catForm') return act(async () => { const name = (fd.get('name') || '').trim(); if (!name) return err('اكتب اسم الفئة');
        const r = await S.saveCategory({ id: fd.get('id') || null, kind: fd.get('kind'), name, description: (fd.get('description') || '').trim() }); if (!r.ok) return err(r.error || 'تعذر الحفظ'); closeSheet(); toast('تم الحفظ'); renderManage(); });
      if (id === 'teamForm') return act(async () => { const phone = g.WhitePhone.normalize(fd.get('phone')); if (!g.WhitePhone.valid(phone)) return err('اكتب رقم هاتف صحيح');
        const r = await S.setRole(phone, 'cashier'); if (!r.ok) return err(r.error); toast('تم تعيين الكاشير'); renderManage(); });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  }
  g.WhiteStaffApp = { mount };
})(window);
