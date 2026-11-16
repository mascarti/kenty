// кэш тяжёлых файлов (модели, движок), чтобы второй запуск был быстрым
const C = 'kenty-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const heavy = /\/(glb|vendor)\//.test(u.pathname);
  e.respondWith((async () => {
    const c = await caches.open(C);
    if (heavy) { const hit = await c.match(e.request); if (hit) return hit; }
    try { const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone()); return r; }
    catch (err) { const hit = await c.match(e.request); if (hit) return hit; throw err; }
  })());
});
