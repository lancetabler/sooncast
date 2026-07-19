/* Radar service worker — offline cache + push handling
   ------------------------------------------------------------------
   Notes on notifications:
   - On Android/desktop Chromium, the app can schedule notifications that
     fire while closed via the Notification Triggers API (TimestampTrigger).
   - On iOS, that API does NOT exist. Background alerts on iOS require
     either (a) Web Push from a server, or (b) Apple Calendar alarms via
     the .ics export in the app. This worker handles the Web Push side so
     that if you deploy the included push server later, it "just works".
*/

const CACHE = 'radar-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Never cache cross-origin API calls (sources); let them hit the network.
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

/* Web Push: server sends { title, body, tag, url } */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { title: 'Radar', body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Radar';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || 'radar',
    icon: './icon.svg',
    badge: './icon.svg',
    data: { url: data.url || './index.html' },
    requireInteraction: false
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

/* Allow the page to ask the SW to schedule a triggered notification
   (Notification Triggers API — Android/desktop Chromium only). */
self.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'schedule' && 'showTrigger' in Notification.prototype) {
    const { title, options, timestamp } = msg;
    try {
      self.registration.showNotification(title, {
        ...options,
        icon: './icon.svg',
        badge: './icon.svg',
        showTrigger: new TimestampTrigger(timestamp)
      });
    } catch (_) {}
  }
  if (msg.type === 'clearScheduled') {
    self.registration.getNotifications({ includeTriggered: true }).then((ns) => {
      ns.forEach((n) => { if (!msg.tag || n.tag === msg.tag || (n.tag || '').startsWith(msg.prefix || '§')) n.close(); });
    });
  }
});
