// White — تسجيل التطبيق القابل للتثبيت (PWA)
(function () {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const base = document.currentScript.src.replace(/js\/ui\/pwa\.js.*$/, '');
  navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(() => {});
})();
