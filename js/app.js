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

  // ---- الأجهزة من طبقة البيانات (حية كل 30 ثانية) ----
  const menu = [
    { name: 'قهوة تركي', desc: 'سادة أو مظبوط', cat: 'مشروبات ساخنة', price: 35 },
    { name: 'آيس لاتيه', desc: 'إسبريسو مع حليب مثلج', cat: 'مشروبات باردة', price: 55 },
    { name: 'عصير برتقال', desc: 'طازج', cat: 'عصائر', price: 40 },
    { name: 'بطاطس مقلية', desc: 'حصة كبيرة', cat: 'سناكس', price: 45 }
  ];

  function timeLine(d) {
    if (d.state === 'available') return 'جاهز للحجز الآن';
    if (d.state === 'booked') return (d.hours ? `محجوز ${d.hours} ساعة، و` : 'محجوز، و') + `يفضى الساعة ${clock(new Date(d.endsAt))}`;
    if (d.state === 'open') return 'محجوز مفتوح، بدون وقت انتهاء محدد';
    return '';
  }

  async function renderDevices() {
    try {
      const list = await window.WhiteStore.publicDevices();
      $('#deviceList').innerHTML = list.map(d => `
        <article class="card item device s-${esc(d.state)}">
          <div class="item-head">
            <div><div class="item-name">${esc(d.name)}</div><div class="item-sub">${esc(d.category)}</div></div>
            <div class="item-price">${money(d.price_hour)} <small>للساعة</small></div>
          </div>
          <div><span class="chip s-${esc(d.state)}">${esc(C.statuses[d.state])}</span></div>
          <div class="time-line">${esc(timeLine(d))}</div>
          ${d.state === 'available' ? '<button class="btn" data-book="' + esc(d.id) + '">احجز الآن</button>' : ''}
        </article>`).join('');
    } catch (_) { toast('تعذر تحميل حالة الأجهزة'); }
  }
  renderDevices(); setInterval(renderDevices, 30000);

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
