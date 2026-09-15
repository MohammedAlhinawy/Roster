// sw.js — caches the app shell so DutyRoster opens and works offline.
// Alarms/notifications are scheduled by the page itself (see js/notify.js);
// this worker's showNotification() is used to render them as real system
// notifications when the page has focus or is running as an installed PWA.

const CACHE = 'dutyroster-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/notify.js',
  './js/render/dashboard.js',
  './js/render/calendar.js',
  './js/render/roster.js',
  './js/render/alarms.js',
  './js/render/importpage.js',
  './js/render/settings.js',
  './vendor/dexie.min.js',
  './vendor/papaparse.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/tesseract.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        // Cache same-origin app files as we go; leave cross-origin (font/OCR data) alone.
        if (res.ok && event.request.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
