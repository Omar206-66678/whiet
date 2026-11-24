// White — التنبيهات (Toast) والنوافذ المنبثقة للتأكيد (Dialog) بنفس هوية التصميم
(function (g) {
  'use strict';
  const ic = n => g.WhiteUI.icon(n);
  let tt;
  // نوع التنبيه يتحدد من نص الرسالة: نجاح / تحذير-خطأ / معلومة
  function kind(m) {
    if (/^(تم|تمت|أهلًا|اهلا)/.test(m)) return 'ok';
    if (/(تعذر|لازم|اكتب|افتح|اكمل|اختار|الجهاز عليه|مقفول|غير |مرفوض|خارج|عندك|مفيش|فيه عناصر|لا يمكن|الطلب فيه|الطلب اتغيّر|الفاتورة مقفولة)/.test(m)) return 'err';
    return 'info';
  }
  function toast(msg, type) {
    const el = document.getElementById('toast'); if (!el) return; msg = String(msg == null ? '' : msg); type = type || kind(msg);
    el.className = 'toast ' + type;
    el.innerHTML = `<span class="t-ico">${ic({ ok: 'check', err: 'alert', info: 'info' }[type])}</span><span class="t-msg"></span>`;
    el.querySelector('.t-msg').textContent = msg;
    void el.offsetWidth; el.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function confirmDialog(o) {
    o = o || {};
    return new Promise(res => {
      const bg = document.createElement('div'); bg.className = 'dlg-bg';
      bg.innerHTML = `<div class="glass dlg" role="alertdialog" aria-modal="true"><div class="dlg-ico ${o.danger ? 'danger' : ''}">${ic(o.danger ? 'alert' : 'info')}</div><h3></h3><p></p>
        <div class="actions"><button class="btn-primary ${o.danger ? 'danger' : ''}" data-ok></button><button class="btn-ghost" data-no></button></div></div>`;
      bg.querySelector('h3').textContent = o.title || 'تأكيد'; bg.querySelector('p').textContent = o.text || '';
      bg.querySelector('[data-ok]').textContent = o.ok || 'تأكيد'; bg.querySelector('[data-no]').textContent = o.cancel || 'إلغاء';
      const done = v => { document.removeEventListener('keydown', key); bg.remove(); res(v); };
      const key = e => { if (e.key === 'Escape') done(false); };
      bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-no]')) done(false); else if (e.target.closest('[data-ok]')) done(true); });
      document.addEventListener('keydown', key); document.body.appendChild(bg); bg.querySelector('[data-no]').focus();
    });
  }
  g.WhiteUI.toast = toast; g.WhiteUI.confirm = confirmDialog;
})(window);
