// Offline cache. Po zmianie plików podnieś numer wersji, żeby telefon pobrał nową wersję.
const CACHE = 'english-trainer-v10';
const FILES = ['./', 'index.html', 'data.js', 'b2.js','manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Tylko pliki aplikacji (GET z tej samej domeny). Zapytania do serwera AI idą prosto do sieci.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Przypomnienia o nauce (wysyła server/push.js). Treść: { title, body, url }.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'English Trainer', {
    body: d.body || 'Czas na angielski!',
    icon: 'icon-192.png',
    tag: 'reminder', // nowe przypomnienie zastępuje poprzednie zamiast się piętrzyć
    renotify: true,
    data: { url: new URL(d.url || './?v=cards', self.registration.scope).href },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ go: new URL(url).searchParams.get('v') }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
