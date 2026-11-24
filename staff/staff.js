// White — لوحة الموظفين: كاشير (تشغيل + عملاء + شيفت) ومالك (كل شيء + حسابات + تقارير + إعدادات)
// ملاحظة: إخفاء الأقسام هنا للوضوح فقط. منع الوصول الحقيقي بقواعد RLS في قاعدة البيانات.
(function (g) {
  'use strict';
  const C = g.WHITE_CONFIG, S = g.WhiteStaff, Bill = g.WhiteBilling, ic = n => g.WhiteUI.icon(n), H = 36e5;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const nf = n => new Intl.NumberFormat(C.locale, { maximumFractionDigits: 2 }).format(n);
  const money = n => nf(n) + ' ' + C.currency;
  const clock = t => new Date(t).toLocaleTimeString(C.locale, { hour: 'numeric', minute: '2-digit' });
  const dtxt = t => new Date(t).toLocaleDateString(C.locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dshort = t => new Date(t).toLocaleDateString(C.locale, { day: 'numeric', month: 'short' });
  const p2 = n => String(n).padStart(2, '0');
  const hms = ms => { const s = Math.floor(Math.abs(ms) / 1000); return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s % 3600 / 60))}:${p2(s % 60)}`; };
  const durText = h => { const hh = Math.floor(h), m = Math.round((h - hh) * 60); return nf(hh) + ' ساعة' + (m ? ' و' + nf(m) + ' دقيقة' : ''); };
  const minText = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return (h ? nf(h) + ' ساعة' : '') + (h && r ? ' و' : '') + (r || !h ? nf(r) + ' دقيقة' : ''); };
  const sumItems = it => Math.round(it.reduce((s, i) => s + Number(i.unit_price) * (i.qty || 1), 0) * 100) / 100;
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('');
  const toLocalInput = t => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const TABS = { devices: ['الأجهزة', 'gamepad'], cafe: ['الكافيه', 'coffee'], bookings: ['الطلبات', 'inbox'], customers: ['العملاء', 'user'], more: ['المزيد', 'grid'] };
  const PERMS = {
    owner: '<b>صلاحياتك كمالك:</b> كل شيء. الأجهزة والكافيه والحجوزات والعملاء والشيفتات، والحسابات والتقارير الشهرية، وتعديل الأجهزة والأسعار والمنيو والفئات، وإدارة الكاشيرية.',
    cashier: '<b>صلاحياتك ككاشير:</b> تشغيل الأجهزة والكافيه، الحجوزات، العملاء (حجز وتشغيل وفاتورة باسمهم)، وشيفتك. الحسابات والتقارير والإعدادات للمالك فقط.'
  };
  const st = { user: null, tab: 'devices', board: [], bk: { pending: [], confirmed: [] }, menu: [], cafe: [], cats: [], devs: [], shift: null, today: null, sig: '',
    seg: { acc: 'invoices', manage: 'devices' }, more: null, cust: { q: '', list: [], id: null, d: null }, month: { y: new Date().getFullYear(), m: new Date().getMonth() },
    dur: 1, bdur: 1, sheet: null, busy: false, bound: false };
  let root;
  const toast = m => g.WhiteUI.toast(m);
  const chip = (k, txt) => `<span class="chip s-${k}">${esc(txt)}</span>`;
  const isOwner = () => st.user && st.user.role === 'owner';
  const backlink = (label, attr) => `<button class="backlink" ${attr}>${ic('back')}<span>${label}</span></button>`;

  function group(items) {
    const m = new Map();
    items.forEach(i => { const k = i.name + '|' + Number(i.unit_price); const e = m.get(k) || { name: i.name, price: Number(i.unit_price), qty: 0, ids: [] }; e.qty += i.qty || 1; e.ids.push(i.id); m.set(k, e); });
    return [...m.values()];
  }
  const itemsLine = items => group(items).map(x => esc(x.name) + (x.qty > 1 ? ' ×' + nf(x.qty) : '')).join('، ');

  // ---------- النافذة السفلية ----------
  function openSheet(html, keep) {
    const old = $('#sheetRoot .sheet'), top = keep && old ? old.scrollTop : 0;
    $('#sheetRoot').innerHTML = `<div class="sheet-bg" data-sheetbg><div class="glass sheet" role="dialog" aria-modal="true"><i class="grab"></i>${html}</div></div>`;
    const n = $('#sheetRoot .sheet'); if (n && top) n.scrollTop = top;
  }
  const sheetOpen = () => !!$('#sheetRoot').firstChild;
  function closeSheet() { $('#sheetRoot').innerHTML = ''; st.sheet = null; if (['devices', 'cafe'].includes(st.tab)) rerender(); }

  // ---------- التشغيل والتنقل (بدون قفز للأعلى عند التحديث التلقائي) ----------
  function mount(user) {
    st.user = user; st.tab = 'devices'; st.more = null; if (S.setUser) S.setUser(user);
    document.body.classList.add('is-staff');
    $('#staffRoot').innerHTML = `
      <header class="topbar"><button class="icon-btn" id="sLogout" aria-label="تسجيل الخروج">${ic('logout')}</button>
        <div class="top-title">${g.WhiteUI.brand()}<span class="roletag">${user.role === 'owner' ? 'المالك' : 'الكاشير'}</span></div>
        <button class="icon-btn" data-theme-toggle></button></header>
      <div class="rolebar"><span id="roleChip"></span><span class="who-name">${esc(user.name)}</span><button class="shiftpill" id="shiftPill" data-more="shift"></button></div>
      <main id="staffMain"></main>
      <nav class="bottomnav" id="sTabs" aria-label="أقسام لوحة التحكم">${Object.keys(TABS).map(t => `<button class="nav-item" data-tab="${t}">${ic(TABS[t][1])}<span>${TABS[t][0]}</span>${t === 'bookings' ? '<b class="badge" id="pendBadge" hidden></b>' : ''}${t === 'more' ? '<i class="dot" id="moreDot" hidden></i>' : ''}</button>`).join('')}</nav>
      <div id="sheetRoot"></div>`;
    $('#roleChip').outerHTML = chip(user.role === 'owner' ? 'confirmed' : 'booked', C.roles[user.role]);
    root = $('#staffMain'); if (g.WhiteTheme) g.WhiteTheme.paint();
    if (!st.bound) { bind(); st.bound = true; setInterval(tick, 1000);
      setInterval(async () => { if (!st.user || sheetOpen() || document.hidden) return; await reload(); }, 15000); }
    refresh().then(() => show('devices'));
  }
  async function refresh() {
    try {
      [st.board, st.bk, st.menu, st.cafe, st.cats, st.shift] = await Promise.all([S.board(), S.bookings(), S.menuAll(), S.cafeOrders(), S.categories(), S.myShift()]);
      st.today = isOwner() ? (await S.summary()).invoices.reduce((a, v) => a + Number(v.total), 0) : null;
    } catch (_) { toast('تعذر تحميل البيانات'); }
    paintHeader();
    const sig = JSON.stringify([st.board, st.bk, st.cafe, st.shift && st.shift.id, st.shift && st.shift.invoices, st.today]); const changed = sig !== st.sig; st.sig = sig; return changed;
  }
  function paintHeader() {
    const n = st.bk.pending.length, b = $('#pendBadge'); if (b) { b.hidden = !n; b.textContent = n; }
    const sp = $('#shiftPill'); if (sp) { sp.className = 'shiftpill ' + (st.shift ? 'on' : 'off'); sp.textContent = st.shift ? 'شيفت مفتوح' : 'لا يوجد شيفت'; }
    const d = $('#moreDot'); if (d) d.hidden = !!st.shift;
  }
  const FN = () => ({ devices: renderDevices, cafe: renderCafe, bookings: renderBookings, customers: renderCustomers, more: renderMore });
  function rerender() { const y = scrollY; FN()[st.tab](); scrollTo(0, y); }
  // التحديث التلقائي: يعيد الرسم فقط لو البيانات اتغيّرت، ويحافظ على مكان السكرول
  async function reload(force) { const ch = await refresh(); if ((ch || force) && ['devices', 'cafe', 'bookings'].includes(st.tab)) rerender(); }
  function show(tab) {
    st.tab = tab; if (tab === 'more') st.more = null; if (tab === 'customers') { st.cust.id = null; st.cust.d = null; }
    $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); scrollTo(0, 0);
    FN()[tab]();
  }

  // ---------- الأجهزة ----------
  function deviceCard(d) {
    const s = d.session, state = !s ? 'available' : (s.planned_end ? 'booked' : 'open');
    const label = { available: 'متاح', booked: 'محجوز بوقت محدد', open: 'محجوز مفتوح' }[state];
    const nb = st.bk.confirmed.find(b => b.device_id === d.id);
    let body;
    if (!s) {
      body = `${nb ? `<div class="mini">حجز مؤكد قادم: ${esc(dtxt(nb.starts_at))} من ${esc(clock(nb.starts_at))} إلى ${esc(clock(nb.ends_at))}${nb.customer_name ? ' · ' + esc(nb.customer_name) : ''}</div>` : ''}
        <div class="actions"><button class="btn-sm" data-timed="${esc(d.id)}">${ic('clock')} بوقت محدد</button><button class="btn-ghost" data-open="${esc(d.id)}">وقت مفتوح</button></div>`;
    } else {
      const total = sumItems(s.items);
      body = `<div class="timer" data-timer data-start="${s.started_at}" data-end="${s.planned_end || ''}">--:--:--</div>
        <div class="mini">${s.customer_name ? '<b>العميل:</b> ' + esc(s.customer_name) + ' · ' : ''}بدأت ${esc(clock(s.started_at))}${s.planned_end ? ' · حجز لحد ' + esc(clock(s.planned_end)) : ' · وقت مفتوح'}</div>
        <div class="mini items-line">${s.items.length ? '<b>الكافيه:</b> ' + itemsLine(s.items) + ' · ' + esc(money(total)) : 'مفيش طلبات كافيه'}</div>
        <div class="bill"><span>الحساب الحالي</span><b data-bill data-start="${s.started_at}" data-price="${Number(d.price_hour)}" data-itemsum="${total}">--</b></div>
        <div class="actions"><button class="btn-ghost" data-items="${esc(s.id)}" data-kind="session" data-title="${esc(d.name)}">${ic('coffee')} طلبات الكافيه</button><button class="btn-sm" data-close="${esc(s.id)}">إنهاء وحساب</button></div>`;
    }
    return `<article class="glass ad s-${state} ${s ? 'running' : ''}"><div class="dev-row"><div class="dev-ico">${ic('gamepad')}</div>
      <div class="dev-main"><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div>${chip(state, label)}</div>
      <div class="item-price">${esc(money(d.price_hour))}<small>/س</small></div></div>${body}</article>`;
  }
  const kpi = (label, val, sub) => `<div class="glass kpi"><small>${label}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  function renderDevices() {
    const busy = st.board.filter(d => d.session).length;
    root.innerHTML = `<div class="kpis">${kpi('شغّال الآن', nf(busy) + ' <span>من ' + nf(st.board.length) + '</span>')}${kpi('طلبات حجز', nf(st.bk.pending.length))}
      ${isOwner() ? kpi('إيراد اليوم', money(st.today || 0)) : kpi('كافيه مفتوح', nf(st.cafe.length))}</div>
      <div class="sec-title"><span>لوحة الأجهزة</span></div>
      <div class="dgrid">${st.board.map(deviceCard).join('') || '<div class="glass empty">لا توجد أجهزة.</div>'}</div>`;
    tick();
  }
  function tick() {
    const now = Date.now();
    $$('[data-timer]').forEach(el => { const s = +el.dataset.start, e = el.dataset.end ? +el.dataset.end : null;
      if (e) { const r = e - now; el.textContent = (r >= 0 ? 'متبقي ' : 'تجاوز ') + hms(r); el.classList.toggle('over', r < 0); } else el.textContent = hms(now - s); });
    $$('[data-bill]').forEach(el => { const d = el.dataset;
      el.textContent = money(Bill.invoice({ started_at: +d.start }, [{ unit_price: +d.itemsum, qty: 1 }], +d.price, now, C.billing).total); });
    $$('[data-elapsed]').forEach(el => { el.textContent = hms(now - +el.dataset.elapsed); });
  }

  // مدة التشغيل: تبدأ بساعة وتزيد نص ساعة حتى الحد الأقصى
  function stepper(val, prefix) {
    return `<div class="stepper"><button type="button" class="step" data-${prefix}step="-1" aria-label="أقل نص ساعة">−</button>
      <div class="step-val"><b id="${prefix}Val"></b><small id="${prefix}End"></small></div>
      <button type="button" class="step" data-${prefix}step="1" aria-label="أكتر نص ساعة">+</button></div>`;
  }
  function paintDur(prefix, key, fromNow) {
    const r = C.staffSession, v = st[key];
    $('#' + prefix + 'Val').textContent = durText(v); if (fromNow) $('#' + prefix + 'End').textContent = 'تنتهي الساعة ' + clock(Date.now() + v * H);
    $$(`[data-${prefix}step]`).forEach(b => { b.disabled = +b.dataset[prefix + 'step'] < 0 ? v <= r.minHours : v >= r.maxHours; });
    $$('[data-preset]').forEach(b => b.classList.toggle('on', +b.dataset.preset === v));
  }
  function durSheet(deviceId, customerId) {
    const r = C.staffSession; st.dur = r.minHours; st.sheet = { dur: true, customerId: customerId || null };
    openSheet(`<h3>تشغيل بوقت محدد</h3>${stepper(st.dur, '')}
      <div class="presets">${[1, 2, 3, 5, 10].filter(h => h >= r.minHours && h <= r.maxHours).map(h => `<button class="fchip" data-preset="${h}">${nf(h)} ساعة</button>`).join('')}</div>
      <p class="mini" style="margin:10px 2px">الزيادة والنقص بنص ساعة، من ${nf(r.minHours)} لحد ${nf(r.maxHours)} ساعات. والحساب بيكون على الوقت الفعلي.</p>
      <div class="actions"><button class="btn-primary" style="flex:1" data-startnow="${esc(deviceId)}">تشغيل</button>${customerId ? `<button class="btn-ghost" data-startopen="${esc(deviceId)}">وقت مفتوح</button>` : ''}<button class="btn-ghost" data-closesheet>إلغاء</button></div>`);
    paintDur('', 'dur', true);
  }

  // ---------- أصناف الكافيه (جلسة أو طلب مستقل): عرض + إضافة + إلغاء صنف راجع ----------
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
    const gs = group(v.items), noShift = C.requireShift && !st.shift; st.sheet = { preview: true, kind, id, groups: gs };
    openSheet(`<h3>فاتورة ${esc(v.title)}</h3>
      ${noShift ? '<div class="warn">لازم تفتح شيفت قبل التحصيل. افتحه من <b>المزيد › الشيفت</b>.</div>' : ''}
      ${kind === 'session' ? `<div class="line"><span>بدأ الساعة</span><span>${esc(clock(v.started_at))}</span></div>
        <div class="line"><span>الوقت الفعلي</span><span>${esc(minText(v.actual_minutes))}</span></div>
        <div class="line"><span>المحسوب (تقريب لأعلى)</span><span>${esc(minText(v.minutes))} · ${esc(money(v.time_amount))}</span></div>` : ''}
      <div class="sec-mini">الأصناف</div>
      ${gs.map((x, i) => `<div class="irow"><div class="iname"><b>${esc(x.name)}${x.qty > 1 ? ' ×' + nf(x.qty) : ''}</b><small>${esc(money(x.price * x.qty))}</small></div>
        <button class="btn-ghost btn-danger" data-pminus="${i}">${ic('x')} إلغاء واحد</button></div>`).join('') || '<p class="muted" style="padding:6px 2px">لا توجد أصناف.</p>'}
      <div class="line total-line"><span>الإجمالي</span><span>${esc(money(v.total))}</span></div>
      <p class="mini">الحساب النهائي لحظة التأكيد.</p>
      <div class="actions" style="margin-top:10px"><button class="btn-primary" style="flex:1" data-confirmclose="${kind}:${esc(id)}" ${noShift ? 'disabled' : ''}>تأكيد الدفع وإنهاء</button>
        ${kind === 'session' || v.items.length ? '<button class="btn-ghost" data-closesheet>رجوع</button>' : ''}</div>`, keep);
  }

  // ---------- تفاصيل فاتورة مقفولة ----------
  async function invoiceSheet(id) {
    let v; try { v = await S.invoiceDetail(id); } catch (_) { return toast('تعذر تحميل الفاتورة'); } if (!v) return toast('الفاتورة غير موجودة');
    const gs = group(v.items);
    openSheet(`<h3>${v.kind === 'cafe' ? 'فاتورة كافيه' : 'فاتورة جهاز'}: ${esc(v.title)}</h3>
      <div class="line"><span>التاريخ</span><span>${esc(dtxt(v.paid_at))} · ${esc(clock(v.paid_at))}</span></div>
      ${v.customer_name ? `<div class="line"><span>العميل</span><span>${esc(v.customer_name)}</span></div>` : ''}
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
    return `<article class="glass ad"><div class="item-head"><div><div class="item-name">${esc(o.label || o.customer_name || 'طلب بدون اسم')}</div><div class="item-sub">فُتح ${esc(clock(o.opened_at))}${o.customer_name && o.label !== o.customer_name ? ' · ' + esc(o.customer_name) : ''}</div></div><b class="item-price">${esc(money(total))}</b></div>
      <div class="mini items-line">${o.items.length ? itemsLine(o.items) : 'لسه مفيش أصناف'}</div>
      <div class="actions"><button class="btn-ghost" data-items="${esc(o.id)}" data-kind="cafe" data-title="${esc(o.label || o.customer_name || 'الطلب')}">${ic('plus')} الأصناف</button>
        <button class="btn-sm" data-cafeclose="${esc(o.id)}" ${o.items.length ? '' : 'disabled'}>تحصيل وإنهاء</button>
        ${o.items.length ? '' : `<button class="btn-ghost btn-danger" data-cafecancel="${esc(o.id)}">إلغاء</button>`}</div></article>`;
  }
  function renderCafe() {
    root.innerHTML = `<div class="sec-title"><span>الكافيه بدون جهاز</span><button class="btn-sm" data-newcafe>${ic('plus')} طلب جديد</button></div>
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
    root.innerHTML = `<div class="sec-title"><span>طلبات بانتظار الموافقة</span></div>
      <div class="dgrid">${pending.map(b => bookingLine(b, `<div class="actions"><button class="btn-sm" data-approve="${esc(b.id)}">${ic('check')} قبول</button><button class="btn-ghost btn-danger" data-reject="${esc(b.id)}">${ic('x')} رفض</button></div>`)).join('') || '<div class="glass empty">لا توجد طلبات جديدة.</div>'}</div>
      <div class="sec-title"><span>حجوزات مؤكدة قادمة</span></div>
      <div class="dgrid">${confirmed.map(b => bookingLine(b)).join('') || '<div class="glass empty">لا توجد حجوزات مؤكدة.</div>'}</div>`;
  }

  // ---------- العملاء ----------
  const norm = s => String(s || '').toLowerCase().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g, '');
  function custRows() {
    const q = norm(st.cust.q), l = st.cust.list.filter(c => !q || norm(c.name).includes(q) || norm(c.phone).includes(q));
    return l.map(c => `<button class="cust" data-cust="${esc(c.id)}"><span class="avatar">${esc(initials(c.name))}</span><span class="cust-main"><b>${esc(c.name)}</b><small class="ltr">${esc(c.phone)}</small></span><span class="chev">‹</span></button>`).join('') || '<div class="empty">لا يوجد عملاء مطابقين.</div>';
  }
  async function renderCustomers() {
    if (st.cust.id) return renderCustomerDetail();
    try { st.cust.list = await S.customers(); } catch (_) { return toast('تعذر تحميل العملاء'); }
    root.innerHTML = `<div class="sec-title"><span>العملاء المسجّلين</span><span class="muted small">${nf(st.cust.list.length)} عميل</span></div>
      <label class="searchbox">${ic('search')}<input id="custSearch" type="search" placeholder="ابحث بالاسم أو رقم الهاتف" value="${esc(st.cust.q)}" autocomplete="off"></label>
      <div class="glass list-card" id="custList">${custRows()}</div>`;
  }
  async function renderCustomerDetail() {
    let d; try { d = await S.customerDetail(st.cust.id); } catch (_) { return toast('تعذر تحميل العميل'); }
    if (!d) { st.cust.id = null; return renderCustomers(); }
    st.cust.d = d; const p = d.profile, spent = d.invoices ? d.invoices.reduce((a, v) => a + Number(v.total), 0) : null;
    root.innerHTML = `${backlink('العملاء', 'data-custback')}
      <div class="glass cust-head"><span class="avatar xl">${esc(initials(p.name))}</span><div class="cust-info"><h2>${esc(p.name)}</h2><a class="ltr phone" href="tel:${esc(p.phone)}">${esc(p.phone)}</a>
        <div class="row">${chip('booked', nf(d.bookings.length) + ' حجز')}${spent != null ? chip('confirmed', 'إجمالي ' + money(spent)) : ''}</div></div></div>
      <div class="actgrid">
        <button class="actbtn" data-cbook><span class="ico">${ic('calendar')}</span>حجز جهاز</button>
        <button class="actbtn" data-cstart><span class="ico">${ic('play')}</span>تشغيل جهاز</button>
        <button class="actbtn" data-ccafe><span class="ico">${ic('coffee')}</span>طلب كافيه</button>
        <a class="actbtn" href="tel:${esc(p.phone)}"><span class="ico">${ic('phone')}</span>اتصال</a></div>
      <div class="sec-title"><span>حجوزاته</span></div>
      <div class="list">${d.bookings.map(b => bookingLine(b)).join('').replace(/بانتظار الموافقة|مؤكد/g, m => m) || ''}${d.bookings.length ? '' : '<div class="glass empty">لا توجد حجوزات.</div>'}</div>
      ${d.invoices ? `<div class="sec-title"><span>فواتيره</span></div><div class="glass list-card">${d.invoices.map(v => `<button class="inv" data-inv="${esc(v.id)}"><span class="inv-main"><b>${esc(v.title)}</b><small>${v.kind === 'cafe' ? 'كافيه' : 'جهاز'} · ${esc(dshort(v.paid_at))} ${esc(clock(v.paid_at))}</small></span><span class="inv-amt">${esc(money(v.total))}</span></button>`).join('') || '<div class="empty">لا توجد فواتير.</div>'}</div>` : ''}`;
  }
  function bookForSheet() {
    const c = st.cust.d.profile, r = C.staffSession; st.bdur = r.minHours; st.sheet = { bookFor: c.id };
    const start = Math.ceil(Date.now() / (30 * 6e4)) * 30 * 6e4;
    openSheet(`<h3>حجز جهاز لـ ${esc(c.name)}</h3><form class="form" id="bookForm" novalidate><input type="hidden" name="cid" value="${esc(c.id)}">
      <label>الجهاز<select name="device">${st.board.map(d => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(money(d.price_hour))}</option>`).join('')}</select></label>
      <label>وقت البداية<input name="start" type="datetime-local" value="${toLocalInput(start)}" required></label>
      <div class="lbl" style="margin:4px 2px 0">المدة</div>${stepper(st.bdur, 'b')}
      <div class="err" id="fErr"></div><div class="actions"><button class="btn-primary" style="flex:1" type="submit">تأكيد الحجز</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
    paintDur('b', 'bdur', false);
  }
  function startForSheet() {
    const c = st.cust.d.profile, free = st.board.filter(d => !d.session); st.sheet = { startFor: c.id };
    openSheet(`<h3>تشغيل جهاز لـ ${esc(c.name)}</h3><p class="mini" style="margin:0 2px 12px">اختار جهاز متاح، والفاتورة هتتسجّل باسمه.</p>
      <div class="opts">${free.map(d => `<button class="opt" data-pickdev="${esc(d.id)}">${esc(d.name)}<small>${esc(money(d.price_hour))}/س</small></button>`).join('') || '<p class="muted">لا توجد أجهزة متاحة الآن.</p>'}</div>
      <div class="actions" style="margin-top:12px"><button class="btn-ghost" data-closesheet>إلغاء</button></div>`);
  }

  // ---------- المزيد: شيفت + حسابات + تقارير + إعدادات ----------
  function renderMore() {
    ({ shift: renderShift, accounts: renderAccounts, reports: renderReports, manage: renderManage })[st.more] ? ({ shift: renderShift, accounts: renderAccounts, reports: renderReports, manage: renderManage })[st.more]() : renderHub();
  }
  function renderHub() {
    const sh = st.shift;
    root.innerHTML = `<div class="glass perm"><div class="row" style="margin-bottom:8px"><span class="avatar">${esc(initials(st.user.name))}</span><div><div class="item-name">${esc(st.user.name)}</div>${chip(isOwner() ? 'confirmed' : 'booked', C.roles[st.user.role])}</div></div>${PERMS[st.user.role]}</div>
      <div class="hub">
        <button class="glass hubcard" data-more="shift"><span class="ico">${ic('clock')}</span><b>الشيفت</b><small>${sh ? 'مفتوح من ' + esc(clock(sh.opened_at)) : 'مغلق · اضغط للفتح'}</small></button>
        ${isOwner() ? `<button class="glass hubcard" data-more="accounts"><span class="ico">${ic('chart')}</span><b>حسابات اليوم</b><small>فواتير ومصروفات</small></button>
        <button class="glass hubcard" data-more="reports"><span class="ico">${ic('trend')}</span><b>التقارير الشهرية</b><small>الأرباح والتحليل</small></button>
        <button class="glass hubcard" data-more="manage"><span class="ico">${ic('settings')}</span><b>الإعدادات</b><small>أجهزة · منيو · فئات · فريق</small></button>` : ''}
      </div>`;
  }
  async function renderShift() {
    try { st.shift = await S.myShift(); } catch (_) {} paintHeader();
    const sh = st.shift; let html = backlink('المزيد', 'data-morehub');
    if (!sh) html += `<div class="glass shiftcard"><div class="item-name">لا يوجد شيفت مفتوح</div><p class="mini" style="margin:6px 0 12px">افتح شيفت قبل ما تبدأ التحصيل. اكتب المبلغ اللي في الدرج دلوقتي.</p>
      <form class="form" id="shiftOpenForm" novalidate style="padding:0"><label>المبلغ الافتتاحي في الدرج (${esc(C.currency)})<input name="opening" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" value="0"></label><button class="btn-primary" type="submit">فتح الشيفت</button></form></div>`;
    else html += `<div class="glass shiftcard"><div class="item-head"><div><div class="item-name">شيفت مفتوح</div><div class="item-sub">من ${esc(clock(sh.opened_at))} · <span class="tnum" data-elapsed="${sh.opened_at}">--:--:--</span></div></div>${chip('available', 'مفتوح')}</div>
      <div class="kpis4"><div><small>فواتير</small><b>${nf(sh.invoices || 0)}</b></div><div><small>إيراد الأجهزة</small><b>${esc(money(sh.device || 0))}</b></div><div><small>إيراد الكافيه</small><b>${esc(money(sh.cafe || 0))}</b></div><div><small>مصروفات الدرج</small><b>${esc(money(sh.expenses || 0))}</b></div></div>
      <div class="bill"><span>المتوقع في الدرج (افتتاحي ${esc(money(sh.opening_cash))})</span><b>${esc(money(sh.expected || 0))}</b></div>
      <div class="actions"><button class="btn-ghost" data-shiftexp>${ic('wallet')} مصروف من الدرج</button><button class="btn-sm" data-shiftclose>إنهاء الشيفت</button></div></div>`;
    let list = []; try { list = await S.shifts(Date.now() - 30 * 864e5, Date.now() + H); } catch (_) {}
    list = list.filter(x => x.closed_at);
    html += `<div class="sec-title"><span>${isOwner() ? 'شيفتات آخر 30 يوم' : 'شيفتاتك السابقة'}</span></div><div class="list">${list.map(x => {
      const diff = x.counted_cash != null && x.expected != null ? Math.round((x.counted_cash - x.expected) * 100) / 100 : null;
      return `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(x.staff_name || '')} · ${esc(dshort(x.opened_at))}</div><div class="item-sub">${esc(clock(x.opened_at))} ← ${esc(clock(x.closed_at))} · ${nf(x.invoices)} فاتورة · ${esc(money(x.total))}</div></div>
        ${diff == null ? '' : diff === 0 ? chip('available', 'مطابق') : chip(diff > 0 ? 'booked' : 'rejected', (diff > 0 ? 'زيادة ' : 'عجز ') + money(Math.abs(diff)))}</div>
        <div class="mini">افتتاحي ${esc(money(x.opening_cash))} · متوقع ${esc(money(x.expected || 0))} · في الدرج ${esc(money(x.counted_cash || 0))}${x.note ? ' · ' + esc(x.note) : ''}</div></article>`; }).join('') || '<div class="glass empty">لا توجد شيفتات مقفولة.</div>'}</div>`;
    root.innerHTML = html; tick();
  }
  function shiftCloseSheet() {
    const sh = st.shift; st.sheet = { shiftClose: sh.id };
    openSheet(`<h3>إنهاء الشيفت</h3><div class="line"><span>المتوقع في الدرج</span><span>${esc(money(sh.expected || 0))}</span></div>
      <form class="form" id="shiftCloseForm" novalidate style="padding:0;margin-top:10px"><input type="hidden" name="id" value="${esc(sh.id)}"><input type="hidden" id="expectedVal" value="${sh.expected || 0}">
        <label>المبلغ الفعلي اللي في الدرج (${esc(C.currency)})<input id="shiftCounted" name="counted" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" required></label>
        <div class="diff" id="shiftDiff">اكتب المبلغ لعرض الفرق</div>
        <label>ملاحظة (اختياري)<input name="note"></label><div class="err" id="fErr"></div>
        <div class="actions"><button class="btn-primary" style="flex:1" type="submit">تأكيد وإنهاء</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
  }

  // ---------- الحسابات اليومية (للمالك) ----------
  async function renderAccounts() {
    let sm; try { sm = await S.summary(); } catch (_) { return toast('تعذر تحميل الحسابات'); }
    const { invoices, expenses } = sm, sum = (a, k) => a.reduce((s, x) => s + Number(x[k]), 0), seg = st.seg.acc;
    const t = sum(invoices, 'time_amount'), c = sum(invoices, 'items_amount'), ex = sum(expenses, 'amount'), net = t + c - ex;
    root.innerHTML = `${backlink('المزيد', 'data-morehub')}<div class="sec-title"><span>حسابات اليوم</span><span class="muted small">${esc(dtxt(Date.now()))}</span></div>
      <div class="stats4"><div class="glass stat"><small>إيراد الأجهزة</small><b>${esc(money(t))}</b></div><div class="glass stat"><small>إيراد الكافيه</small><b>${esc(money(c))}</b></div>
        <div class="glass stat"><small>المصروفات</small><b>${esc(money(ex))}</b></div><div class="glass stat"><small>عدد الفواتير</small><b>${nf(invoices.length)}</b></div>
        <div class="glass stat net"><small>صافي اليوم (إيراد − مصروفات)</small><b>${esc(money(net))}</b></div></div>
      <div class="seg" style="margin-top:18px"><button class="${seg === 'invoices' ? 'on' : ''}" data-seg="acc:invoices">الفواتير (${nf(invoices.length)})</button><button class="${seg === 'expenses' ? 'on' : ''}" data-seg="acc:expenses">المصروفات (${nf(expenses.length)})</button></div>
      ${seg === 'invoices'
        ? `<div class="glass list-card">${invoices.map(v => `<button class="inv" data-inv="${esc(v.id)}"><span class="inv-main"><b>${esc(v.title)}</b><small>${v.kind === 'cafe' ? 'كافيه' : 'جهاز'}${v.customer_name ? ' · ' + esc(v.customer_name) : ''} · ${esc(clock(v.paid_at))}</small></span><span class="inv-amt">${esc(money(v.total))}</span></button>`).join('') || '<div class="empty">لا توجد فواتير بعد.</div>'}</div>
           <p class="note">اضغط على أي فاتورة لعرض تفاصيلها. اليوم يبدأ الساعة ${nf(C.dayStartHour)} صباحًا.</p>`
        : `<form class="glass form" id="expForm" novalidate><label>البند<input name="title" required></label>
             <label>المبلغ (${esc(C.currency)})<input name="amount" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" required></label><button class="btn-sm" type="submit" style="justify-self:start">${ic('plus')} إضافة مصروف</button></form>
           <div class="glass list-card" style="margin-top:14px">${expenses.map(x => `<div class="line"><span>${esc(x.title)} · ${esc(clock(x.spent_at))}</span><span>${esc(money(x.amount))}</span></div>`).join('') || '<div class="empty">لا توجد مصروفات اليوم.</div>'}</div>`}`;
  }

  // ---------- التقارير الشهرية (للمالك) ----------
  const delta = (cur, prev, bad) => { if (!prev) return cur > 0 ? '<em class="delta up">جديد</em>' : ''; const p = Math.round((cur - prev) / prev * 100); if (!p) return '<em class="delta">0٪</em>'; const good = bad ? p < 0 : p > 0;
    return `<em class="delta ${good ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${nf(Math.abs(p))}٪</em>`; };
  async function renderReports() {
    const { y, m } = st.month, py = m ? y : y - 1, pm = (m + 11) % 12; let r, pr;
    try { [r, pr] = await Promise.all([S.report(y, m), S.report(py, pm)]); } catch (_) { return toast('تعذر تحميل التقرير'); }
    const now = new Date(), isCur = y === now.getFullYear() && m === now.getMonth(), days = new Date(y, m + 1, 0).getDate();
    const map = {}; r.daily.forEach(d => { map[+d.day.slice(8, 10)] = d.revenue; }); const max = Math.max(1, ...Object.values(map));
    const best = r.daily.slice().sort((a, b) => b.revenue - a.revenue)[0], maxDev = Math.max(1, ...r.per_device.map(x => x.revenue)), maxItem = Math.max(1, ...r.top_items.map(x => x.amount));
    const margin = r.revenue ? Math.round(r.net / r.revenue * 100) : 0;
    root.innerHTML = `${backlink('المزيد', 'data-morehub')}
      <div class="monthbar"><button class="icon-btn" data-mprev aria-label="الشهر السابق">${ic('back')}</button><b>${esc(new Date(y, m, 1).toLocaleDateString(C.locale, { month: 'long', year: 'numeric' }))}</b><button class="icon-btn flip" data-mnext aria-label="الشهر التالي" ${isCur ? 'disabled' : ''}>${ic('back')}</button></div>
      <div class="glass bigkpi"><small>صافي الربح</small><b>${esc(money(r.net))}</b><div class="row">${delta(r.net, pr.net)}<span class="muted small">هامش ${nf(margin)}٪ · مقارنة بالشهر السابق</span></div></div>
      <div class="kpis2"><div class="glass kpi"><small>الإيراد</small><b>${esc(money(r.revenue))}</b>${delta(r.revenue, pr.revenue)}</div><div class="glass kpi"><small>المصروفات</small><b>${esc(money(r.expenses))}</b>${delta(r.expenses, pr.expenses, true)}</div>
        <div class="glass kpi"><small>عدد الفواتير</small><b>${nf(r.invoices)}</b>${delta(r.invoices, pr.invoices)}</div><div class="glass kpi"><small>متوسط الفاتورة</small><b>${esc(money(Math.round(r.avg_invoice)))}</b>${delta(r.avg_invoice, pr.avg_invoice)}</div>
        <div class="glass kpi"><small>إيراد الأجهزة</small><b>${esc(money(r.device_rev))}</b></div><div class="glass kpi"><small>إيراد الكافيه</small><b>${esc(money(r.cafe_rev))}</b></div></div>
      <div class="sec-title"><span>الإيراد اليومي</span>${best ? `<span class="muted small">أفضل يوم: ${nf(+best.day.slice(8, 10))} · ${esc(money(best.revenue))}</span>` : ''}</div>
      <div class="glass chart"><div class="bars">${Array.from({ length: days }, (_, i) => { const v = map[i + 1] || 0; return `<i class="bar${v ? '' : ' zero'}" style="height:${v ? Math.max(5, v / max * 100) : 2}%" title="${nf(i + 1)}: ${esc(money(v))}"></i>`; }).join('')}</div>
        <div class="axis">${Array.from({ length: days }, (_, i) => `<span>${i === 0 || (i + 1) % 5 === 0 ? nf(i + 1) : ''}</span>`).join('')}</div></div>
      <div class="sec-title"><span>حسب الجهاز</span></div>
      <div class="glass list-card">${r.per_device.map(x => `<div class="hrow"><div class="hrow-top"><b>${esc(x.name)}</b><span>${esc(money(x.revenue))} · ${esc(minText(x.minutes))}</span></div><div class="track"><i style="width:${Math.max(3, x.revenue / maxDev * 100)}%"></i></div></div>`).join('') || '<div class="empty">لا توجد بيانات.</div>'}</div>
      <div class="sec-title"><span>الأكثر مبيعًا في الكافيه</span></div>
      <div class="glass list-card">${r.top_items.map(x => `<div class="hrow"><div class="hrow-top"><b>${esc(x.name)} <small class="muted">×${nf(x.qty)}</small></b><span>${esc(money(x.amount))}</span></div><div class="track"><i style="width:${Math.max(3, x.amount / maxItem * 100)}%"></i></div></div>`).join('') || '<div class="empty">لا توجد بيانات.</div>'}</div>
      <div class="sec-title"><span>المصروفات</span></div>
      <div class="glass list-card">${r.expenses_by.map(x => `<div class="line"><span>${esc(x.title)}</span><span>${esc(money(x.amount))}</span></div>`).join('') || '<div class="empty">لا توجد مصروفات.</div>'}</div>
      <p class="note">اليوم محسوب من الساعة ${nf(C.dayStartHour)} صباحًا. الصافي = الإيراد − المصروفات.</p>`;
  }

  // ---------- الإعدادات (للمالك) ----------
  async function renderManage() {
    try { [st.devs, st.menu, st.cats] = await Promise.all([S.devicesAll(), S.menuAll(), S.categories()]); } catch (_) { return toast('تعذر تحميل الإعدادات'); }
    const seg = st.seg.manage, SEG = [['devices', 'الأجهزة'], ['menu', 'المنيو'], ['cats', 'الفئات'], ['team', 'الفريق']];
    let body = '';
    if (seg === 'devices') body = `<div class="sec-title"><span>الأجهزة والأسعار</span><button class="btn-sm" data-newdev>${ic('plus')} جهاز</button></div>
      <div class="dgrid">${st.devs.map(d => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)} · ${esc(money(d.price_hour))} للساعة</div></div>${chip(d.active === false ? 'done' : 'available', d.active === false ? 'مخفي' : 'ظاهر')}</div>
        <div class="row"><button class="btn-ghost" data-editdev="${esc(d.id)}">${ic('edit')} تعديل</button></div></article>`).join('')}</div>`;
    else if (seg === 'menu') body = `<div class="sec-title"><span>المنيو</span><button class="btn-sm" data-newmenu>${ic('plus')} صنف</button></div>
      <div class="dgrid">${st.menu.map(m => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(m.name)}</div><div class="item-sub">${esc(m.cat)} · ${esc(money(m.price))}</div></div>${chip(m.active === false ? 'done' : 'available', m.active === false ? 'مخفي' : 'ظاهر')}</div>
        <div class="row"><button class="btn-ghost" data-editmenu="${esc(m.id)}">${ic('edit')} تعديل</button></div></article>`).join('')}</div>`;
    else if (seg === 'cats') {
      const sec = (kind, title) => { const list = st.cats.filter(c => c.kind === kind), used = c => (kind === 'device' ? st.devs.filter(d => d.category === c.name) : st.menu.filter(m => m.cat === c.name)).length;
        return `<div class="sec-title"><span>${title}</span><button class="btn-sm" data-newcat="${kind}">${ic('plus')} فئة</button></div><div class="dgrid">${list.map(c => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(c.name)}</div>
          <div class="item-sub">${nf(used(c))} ${kind === 'device' ? 'جهاز' : 'صنف'}${c.description ? ' · ' + esc(c.description) : ''}</div></div></div>
          <div class="row"><button class="btn-ghost" data-editcat="${esc(c.id)}">${ic('edit')} تعديل</button><button class="btn-ghost btn-danger" data-delcat="${esc(c.id)}">${ic('x')} حذف</button></div></article>`).join('') || '<div class="glass empty">لا توجد فئات.</div>'}</div>`; };
      body = sec('device', 'فئات الأجهزة') + sec('menu', 'فئات المنيو') + '<p class="note">تعديل اسم فئة بينتقل تلقائيًا لكل الأجهزة أو الأصناف التابعة لها. والحذف مش بيتم لو فيها عناصر.</p>';
    } else {
      let team; try { team = await S.team(); } catch (_) { return toast('تعذر تحميل الفريق'); }
      body = `<div class="sec-title"><span>فريق العمل</span></div><div class="list">${team.map(u => `<article class="glass item"><div class="item-head"><div><div class="item-name">${esc(u.name)}</div><div class="item-sub ltr">${esc(u.phone)}</div></div>${chip(u.role === 'owner' ? 'confirmed' : 'booked', C.roles[u.role])}</div>
        ${u.role === 'cashier' ? `<div class="row"><button class="btn-ghost btn-danger" data-demote="${esc(u.phone)}">${ic('x')} إلغاء صلاحية الكاشير</button></div>` : ''}</article>`).join('')}</div>
        <div class="sec-title"><span>إضافة كاشير</span></div>
        <form class="glass form" id="teamForm" novalidate><p class="mini">الموظف لازم يسجّل حساب عميل برقم هاتفه الأول من التطبيق، وبعدين اكتب رقمه هنا.</p>
          <label>رقم هاتف الموظف<input name="phone" type="tel" inputmode="tel" dir="ltr" placeholder="01XXXXXXXXX" required></label>
          <div class="err" id="fErr"></div><button class="btn-primary" type="submit">تعيين ككاشير</button></form>`;
    }
    root.innerHTML = `${backlink('المزيد', 'data-morehub')}<div class="seg n4">${SEG.map(([k, t]) => `<button class="${seg === k ? 'on' : ''}" data-seg="manage:${k}">${t}</button>`).join('')}</div>${body}`;
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
  const goMore = sub => { st.more = sub; st.tab = 'more'; $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === 'more')); scrollTo(0, 0); renderMore(); };
  function bind() {
    document.addEventListener('click', e => {
      if (!st.user) return;
      const bg = e.target.closest('[data-sheetbg]'); if (bg && e.target === bg) return closeSheet();
      if (e.target.closest('#sLogout')) return act(async () => { await g.WhiteStore.signOut(); location.reload(); });
      const t = e.target.closest('#staffRoot button, #sheetRoot button, #staffRoot a'); if (!t || t.tagName === 'A') return; const d = t.dataset;
      if (d.tab) return show(d.tab);
      if (d.more) return goMore(d.more);
      if ('morehub' in d) return goMore(null);
      if (d.seg) { const [k, v] = d.seg.split(':'); st.seg[k] = v; return (k === 'acc' ? renderAccounts : renderManage)(); }
      if ('closesheet' in d) return closeSheet();
      // تشغيل الأجهزة
      if (d.timed) return durSheet(d.timed);
      if (d.step) { const r = C.staffSession; st.dur = Math.min(r.maxHours, Math.max(r.minHours, st.dur + (+d.step) * r.stepHours)); return paintDur('', 'dur', true); }
      if (d.bstep) { const r = C.staffSession; st.bdur = Math.min(r.maxHours, Math.max(r.minHours, st.bdur + (+d.bstep) * r.stepHours)); return paintDur('b', 'bdur', false); }
      if (d.preset) { st.dur = +d.preset; return paintDur('', 'dur', true); }
      if (d.startnow) return act(async () => { const cid = st.sheet && st.sheet.customerId; const r = await S.startSession(d.startnow, st.dur, cid); $('#sheetRoot').innerHTML = ''; st.sheet = null; toast(r.ok ? 'تم تشغيل الجهاز لمدة ' + durText(st.dur) : r.error); await reload(true); });
      if (d.startopen) return act(async () => { const cid = st.sheet && st.sheet.customerId; const r = await S.startSession(d.startopen, null, cid); $('#sheetRoot').innerHTML = ''; st.sheet = null; toast(r.ok ? 'تم تشغيل الجهاز بوقت مفتوح' : r.error); await reload(true); });
      if (d.open) return act(async () => { const r = await S.startSession(d.open, null); toast(r.ok ? 'تم تشغيل الجهاز بوقت مفتوح' : r.error); await reload(true); });
      // أصناف الكافيه
      if (d.items) return itemsSheet(d.kind, d.items, d.title);
      if (d.gadd) return act(async () => { const m = st.sheet.menu[+d.gadd]; if (!m) return; const r = await S.addItem(st.sheet.kind, st.sheet.id, { name: m.name, price: m.price }); if (!r.ok) toast(r.error); await stay(); });
      if (d.gplus) return act(async () => { const x = st.sheet.groups[+d.gplus]; const r = await S.addItem(st.sheet.kind, st.sheet.id, { name: x.name, price: x.price }); if (!r.ok) toast(r.error); await stay(); });
      if (d.gminus) return act(async () => { const x = st.sheet.groups[+d.gminus]; const r = await S.removeItem(st.sheet.kind, x.ids[x.ids.length - 1]); toast(r.ok ? 'تم إلغاء ' + x.name : r.error); await stay(); });
      // الفاتورة
      if (d.close) return previewSheet('session', d.close);
      if (d.cafeclose) return previewSheet('cafe', d.cafeclose);
      if (d.pminus) return act(async () => { const x = st.sheet.groups[+d.pminus], { kind, id } = st.sheet; const r = await S.removeItem(kind, x.ids[x.ids.length - 1]); toast(r.ok ? 'تم إلغاء ' + x.name + ' من الفاتورة' : r.error); await previewSheet(kind, id, true); });
      if (d.confirmclose) return act(async () => {
        if (C.requireShift && !st.shift) { closeSheet(); toast('افتح شيفت الأول من المزيد › الشيفت'); return goMore('shift'); }
        const [kind, id] = d.confirmclose.split(':'); const r = kind === 'cafe' ? await S.closeCafe(id) : await S.closeSession(id);
        $('#sheetRoot').innerHTML = ''; st.sheet = null; toast(r.ok ? (kind === 'cafe' ? 'تم تحصيل الطلب' : 'تم قفل الجلسة. الجهاز بقى متاح للعملاء') : r.error); await reload(true); });
      if (d.inv) return invoiceSheet(d.inv);
      // الكافيه المستقل
      if ('newcafe' in d) return openSheet(`<h3>طلب كافيه جديد</h3><form class="form" id="cafeForm" novalidate style="padding:0"><label>الاسم أو رقم الطاولة (اختياري)<input name="label" placeholder="مثال: طاولة 3"></label>
        <div class="actions"><button class="btn-primary" style="flex:1" type="submit">فتح الطلب</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
      if (d.cafecancel) return act(async () => { const r = await S.cancelCafe(d.cafecancel); toast(r.ok ? 'تم إلغاء الطلب' : r.error); await reload(true); });
      // الطلبات
      if (d.approve || d.reject) return act(async () => { const ok = !!d.approve, r = await S.decide(d.approve || d.reject, ok); toast(r.ok ? (ok ? 'تم قبول الحجز' : 'تم رفض الحجز') : r.error); await reload(true); });
      // العملاء
      if (d.cust) { st.cust.id = d.cust; return renderCustomers(); }
      if ('custback' in d) { st.cust.id = null; return renderCustomers(); }
      if ('cbook' in d) return bookForSheet();
      if ('cstart' in d) return startForSheet();
      if (d.pickdev) return durSheet(d.pickdev, st.cust.id);
      if ('ccafe' in d) return act(async () => { const p = st.cust.d.profile, r = await S.openCafe(p.name, p.id); if (!r.ok) return toast(r.error); await refresh(); toast('تم فتح طلب كافيه باسمه'); itemsSheet('cafe', r.id, p.name); });
      // الشيفت
      if ('shiftexp' in d) return openSheet(`<h3>مصروف من الدرج</h3><form class="form" id="shiftExpForm" novalidate style="padding:0"><label>البند<input name="title" required></label>
        <label>المبلغ (${esc(C.currency)})<input name="amount" type="number" inputmode="decimal" min="0" step="0.5" dir="ltr" required></label><div class="err" id="fErr"></div>
        <div class="actions"><button class="btn-primary" style="flex:1" type="submit">تسجيل</button><button class="btn-ghost" type="button" data-closesheet>إلغاء</button></div></form>`);
      if ('shiftclose' in d) return shiftCloseSheet();
      // للمالك فقط
      if (!isOwner()) return;
      if ('mprev' in d) { const { y, m } = st.month; st.month = m ? { y, m: m - 1 } : { y: y - 1, m: 11 }; return renderReports(); }
      if ('mnext' in d) { const { y, m } = st.month; st.month = m < 11 ? { y, m: m + 1 } : { y: y + 1, m: 0 }; return renderReports(); }
      if ('newdev' in d) return deviceForm();
      if (d.editdev) return deviceForm(st.devs.find(x => x.id === d.editdev));
      if ('newmenu' in d) return menuForm();
      if (d.editmenu) return menuForm(st.menu.find(x => String(x.id) === d.editmenu));
      if (d.newcat) return catForm(d.newcat);
      if (d.editcat) { const c = st.cats.find(x => x.id === d.editcat); return c && catForm(c.kind, c); }
      if (d.delcat) { const c = st.cats.find(x => x.id === d.delcat); if (!c) return; return g.WhiteUI.confirm({ title: 'حذف الفئة', text: 'هتتحذف الفئة "' + c.name + '". لو فيها عناصر مش هتتحذف.', ok: 'حذف', danger: true }).then(ok => ok && act(async () => { const r = await S.deleteCategory(c.id); toast(r.ok ? 'تم الحذف' : r.error); renderManage(); })); }
      if (d.demote) return act(async () => { const r = await S.setRole(d.demote, 'customer'); toast(r.ok ? 'تم إلغاء الصلاحية' : r.error); renderManage(); });
    });
    // بحث العملاء + فرق الدرج لحظيًا
    document.addEventListener('input', e => {
      if (!st.user) return;
      if (e.target.id === 'custSearch') { st.cust.q = e.target.value; const l = $('#custList'); if (l) l.innerHTML = custRows(); }
      if (e.target.id === 'shiftCounted') { const exp = +$('#expectedVal').value, v = parseFloat(e.target.value), el = $('#shiftDiff');
        if (!Number.isFinite(v)) { el.textContent = 'اكتب المبلغ لعرض الفرق'; el.className = 'diff'; return; }
        const df = Math.round((v - exp) * 100) / 100; el.textContent = df === 0 ? 'مطابق للمتوقع ✓' : (df > 0 ? 'زيادة ' : 'عجز ') + money(Math.abs(df)); el.className = 'diff ' + (df === 0 ? 'ok' : df > 0 ? 'plus' : 'minus'); }
    });
    document.addEventListener('submit', e => {
      if (!st.user) return; const f = e.target, id = f.getAttribute('id');  // لا نستخدم f.id لأن حقلًا اسمه id يحجب الخاصية
      const ALL = ['cafeForm', 'bookForm', 'shiftOpenForm', 'shiftExpForm', 'shiftCloseForm', 'expForm', 'devForm', 'menuForm', 'catForm', 'teamForm']; if (!ALL.includes(id)) return;
      e.preventDefault();
      const fd = new FormData(f), err = m => { const x = $('#fErr'); if (x) x.textContent = m; };
      if (id === 'cafeForm') return act(async () => { const r = await S.openCafe((fd.get('label') || '').trim()); if (!r.ok) return toast(r.error); await refresh(); renderCafe(); itemsSheet('cafe', r.id, (fd.get('label') || '').trim() || 'الطلب'); });
      if (id === 'bookForm') return act(async () => { const start = new Date(fd.get('start')).getTime(); if (!Number.isFinite(start)) return err('اختار وقت البداية');
        const r = await S.createBookingFor({ customerId: fd.get('cid'), deviceId: fd.get('device'), start, hours: st.bdur }); if (!r.ok) return err(r.error); $('#sheetRoot').innerHTML = ''; st.sheet = null; toast('تم تأكيد الحجز'); await refresh(); renderCustomerDetail(); });
      if (id === 'shiftOpenForm') return act(async () => { const r = await S.openShift(fd.get('opening')); toast(r.ok ? 'تم فتح الشيفت' : r.error); await refresh(); renderShift(); });
      if (id === 'shiftExpForm') return act(async () => { const title = (fd.get('title') || '').trim(), amount = parseFloat(fd.get('amount')); if (!title || !(amount > 0)) return err('اكتب البند ومبلغًا أكبر من صفر');
        const r = await S.addExpense({ title, amount }); if (!r.ok) return err(r.error || 'تعذر التسجيل'); $('#sheetRoot').innerHTML = ''; st.sheet = null; toast('تم تسجيل المصروف'); await refresh(); renderShift(); });
      if (id === 'shiftCloseForm') return act(async () => { const counted = parseFloat(fd.get('counted')); if (!Number.isFinite(counted) || counted < 0) return err('اكتب المبلغ اللي في الدرج');
        const r = await S.closeShift(fd.get('id'), counted, (fd.get('note') || '').trim()); if (!r.ok) return err(r.error); $('#sheetRoot').innerHTML = ''; st.sheet = null; toast('تم إنهاء الشيفت'); await refresh(); renderShift(); });
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
