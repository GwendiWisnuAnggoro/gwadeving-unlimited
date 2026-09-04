const CACHE_NAME = 'gwadeving-cloud-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './Script.js',
  './manifest.json',
  './logo.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    // Mengutamakan Network, jika gagal ambil dari Cache (Network First)
    fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
