/* 牟牟工作台 Service Worker：仅缓存同源核心文件，导航走网络优先，避免手机端缓存到旧版本白屏 */
const CACHE = 'mumu-v4';
const ASSETS = ['index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 跨域请求（新闻接口等）直接放行，不缓存、不拦截，避免 opaque 响应写入缓存导致异常
  if (url.origin !== self.location.origin) return;
  // 页面导航：网络优先，保证永远拿到最新 HTML；离线时才用缓存兜底
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }
  // 同源静态资源：stale-while-revalidate
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(resp => {
      if (resp && resp.status === 200) cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);
    return cached || (await network) || (await caches.match('index.html'));
  })());
});
