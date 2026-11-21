// White — المرحلة 1: التنقل، الثيم، الإشعارات، وعرض تجريبي للكروت
(function () {
  'use strict';
  const C = window.WHITE_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money = n => new Intl.NumberFormat(C.locale).format(n) + ' ' + C.currency;
  const clock = d => d.toLocaleTimeString(C.locale, { hour: 'numeric', minute: '2-digit' });

  // ---- إشعار سريع ----
  let tt;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400);
  }
  window.WhiteUI = { toast, esc, money, clock };

  // ---- التنقل بين الشاشات ----
  function go(name) {
    $$('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === name));
    $$('.nav-item').forEach(b => b.classList.toggle('is-active', b.dataset.go === name));
    scrollTo({ top: 0 });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go);
  });

  // ---- الوضع الداكن ----
  const root = document.documentElement;
  try { root.dataset.theme = localStorage.getItem('white-theme') || 'light'; } catch (_) {}
  $('#themeBtn').addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('white-theme', next); } catch (_) {}
  });

  // ---- مفتاح الحالات ----
  $('#legend').innerHTML = Object.entries(C.statuses)
    .filter(([k]) => ['available', 'booked', 'open', 'pending'].includes(k))
    .map(([k, v]) => `<span class="chip s-${k}">${esc(v)}</span>`).join('');

  // ---- بيانات تجريبية (تُستبدل بالبيانات الحية في المرحلة 5) ----
  const H = 3600e3, now = Date.now();
  const devices = [
    { name: 'PS5 - غرفة 1', cat: 'PS5', price: 40, unit: 'للساعة', state: 'available' },
    { name: 'PS5 - غرفة 2', cat: 'PS5', price: 40, unit: 'للساعة', state: 'booked', hours: 2, endsAt: now + 1.5 * H },
    { name: 'PS4 - جهاز 3', cat: 'PS4', price: 25, unit: 'للساعة', state: 'open' },
    { name: 'غرفة VIP', cat: 'VIP', price: 70, unit: 'للساعة', state: 'available' }
  ];
  const menu = [
    { name: 'قهوة تركي', desc: 'سادة أو مظبوط', cat: 'مشروبات ساخنة', price: 35 },
    { name: 'آيس لاتيه', desc: 'إسبريسو مع حليب مثلج', cat: 'مشروبات باردة', price: 55 },
    { name: 'عصير برتقال', desc: 'طازج', cat: 'عصائر', price: 40 },
    { name: 'بطاطس مقلية', desc: 'حصة كبيرة', cat: 'سناكس', price: 45 }
  ];

  function timeLine(d) {
    if (d.state === 'available') return 'جاهز للحجز الآن';
    if (d.state === 'booked') return `محجوز ${d.hours} ساعة، ويفضى الساعة ${clock(new Date(d.endsAt))}`;
    if (d.state === 'open') return 'محجوز مفتوح، بدون وقت انتهاء محدد';
    return '';
  }

  $('#deviceList').innerHTML = devices.map(d => `
    <article class="card item device s-${d.state}">
      <div class="item-head">
        <div><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.cat)}</div></div>
        <div class="item-price">${money(d.price)} <small>${esc(d.unit)}</small></div>
      </div>
      <div><span class="chip s-${d.state}">${esc(C.statuses[d.state])}</span></div>
      <div class="time-line">${esc(timeLine(d))}</div>
      ${d.state === 'available' ? '<button class="btn" data-book="' + esc(d.name) + '">احجز الآن</button>' : ''}
    </article>`).join('');

  $('#menuList').innerHTML = menu.map(m => `
    <article class="card item">
      <div class="item-head">
        <div><div class="item-name">${esc(m.name)}</div><div class="item-sub">${esc(m.desc)} · ${esc(m.cat)}</div></div>
        <div class="item-price">${money(m.price)}</div>
      </div>
    </article>`).join('');

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-book]');
    if (b) toast('شاشة الحجز تُبنى في المرحلة الثالثة');
  });
})();
