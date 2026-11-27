/* Service worker: بيخزّن ملفات الواجهة بس (التطبيق يفتح بسرعة). طلبات الـ API عمرها ما بتتخزن. */
const V = 'mcw-v7-1-3', SHELL = ['./', 'index.html', 'app.css', 'config.js', 'i18n.js', 'core.js', 'scanner.js', 'shell.js', 'views-main.js', 'views-scan.js', 'views-pick.js', 'views-extra.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || /script\.google(usercontent)?\.com$/.test(u.hostname)) return;
  const ok = u.origin === location.origin || /(fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net)$/.test(u.hostname);
  if (!ok) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
