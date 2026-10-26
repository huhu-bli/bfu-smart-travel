/* 导航网络优先，离线回退；只缓存本应用成功返回的同源静态资源。 */
const CACHE_PREFIX = 'beijing-travel-';
const CACHE = CACHE_PREFIX + 'v10';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;
  const relativePath = url.pathname.slice(scope.length);
  if (relativePath.startsWith('api/') || relativePath.startsWith('_AMapService/')) return;

  function remember(response) {
    const html = (response.headers.get('content-type') || '').includes('text/html');
    // 部署期间失效的 JS URL 可能被托管平台回退成 HTML，不能把它保存成脚本。
    if (response.ok && !(html && ['script', 'style'].includes(request.destination))) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-cache' }).then(remember).catch(async () => {
      const cached = await caches.match(request, { ignoreSearch: true }) ||
        await caches.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true }) ||
        await caches.match(self.registration.scope, { ignoreSearch: true });
      return cached || new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>北京智能旅行</h1><p>当前网络不可用，请连接网络后重新打开页面。</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(remember)));
});
