/* 牟牟工作台 Service Worker：缓存核心文件，支持离线打开与自动更新（stale-while-revalidate） */
const CACHE = 'mumu-v3';
const ASSETS = ['index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(a => c.add(a)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    const network = fetch(e.request).then(resp => { if (resp && resp.status === 200) cache.put(e.request, resp.clone()); return resp; }).catch(() => null);
    if (cached) { network; return cached; }
    return (await network) || caches.match('index.html');
  })());
});
