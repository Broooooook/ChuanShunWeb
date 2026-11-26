// 離線快取：先用網路拿最新版，沒網路時用快取（所以更新會自動生效，斷線也能打卡）
const CACHE = 'chuanshun-v1.2.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'css/android.css',
  'js/app.js', 'js/store.js', 'js/defaults.js',
  'js/core/date.js', 'js/core/shift.js', 'js/core/trips.js', 'js/core/billing.js', 'js/core/labor.js', 'js/core/validation.js',
  'js/core/salary.js', 'js/core/backup.js', 'js/core/zip.js', 'js/core/statement.js', 'js/core/actions.js',
  'js/ui/dom.js', 'js/ui/files.js', 'js/ui/home.js', 'js/ui/history.js', 'js/ui/stats.js', 'js/ui/settings.js', 'js/ui/tripDialog.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // cache: 'no-cache' → 每次都向伺服器確認有沒有新版（GitHub Pages 預設讓瀏覽器快取 10 分鐘）
    fetch(e.request.url, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
