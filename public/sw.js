/* Radar service worker — offline shell + Web Push.
   Handles both classic push payloads and Declarative Web Push (iOS 18.4+),
   where the browser may render the notification without us. */
const CACHE = "radar-v1";
const SHELL = ["/", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Network-first for pages & API; cache-first only for static shell assets.
  if (url.pathname.startsWith("/api/")) return;
  if (SHELL.includes(url.pathname) || url.pathname === "/icon.svg") {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
  }
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Radar", body: e.data ? e.data.text() : "" }; }
  // Declarative payloads carry a { notification: {...} } object; the browser
  // may already show it, but we also show it for classic-push browsers.
  const n = data.notification || data;
  const title = n.title || "Radar";
  const options = {
    body: n.body || "",
    tag: n.tag || "radar",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: n.navigate || n.url || "/" },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
