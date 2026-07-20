/* Radarr service worker — offline shell + Web Push.
   Handles both classic push payloads and Declarative Web Push (iOS 18.4+),
   where the browser may render the notification without us. */
const CACHE = "radarr-v2";
const PRECACHE = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Put a copy in the cache, best-effort.
async function cachePut(req, res) {
  try {
    const c = await caches.open(CACHE);
    await c.put(req, res.clone());
  } catch {
    /* quota / opaque — ignore */
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App navigations: network-first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => cachePut(req, res))
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // Last-known state: network-first, but keep a copy so the app opens populated offline.
  if (url.pathname === "/api/state") {
    e.respondWith(
      fetch(req)
        .then((res) => cachePut(req, res))
        .catch(() => caches.match(req))
    );
    return;
  }

  // Other API calls are always live (no caching).
  if (url.pathname.startsWith("/api/")) return;

  // Static assets (Next build output, icons): cache-first, refresh in the background.
  if (url.pathname.startsWith("/_next/") || PRECACHE.includes(url.pathname) || url.pathname === "/icon.svg") {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => cachePut(req, res)).catch(() => hit);
        return hit || net;
      })
    );
  }
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Radar", body: e.data ? e.data.text() : "" }; }
  const n = data.notification || data;
  const title = n.title || "Radarr";
  const options = {
    body: n.body || "",
    tag: n.tag || "radar",
    // Re-alert when a same-tag notification is replaced (e.g. a throttled score bump on the
    // stable `score-<id>` tag) instead of updating the tray silently.
    renotify: true,
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
    (async () => {
      let sameOrigin = false;
      try { sameOrigin = new URL(target, self.location.origin).origin === self.location.origin; } catch { sameOrigin = false; }
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = list.find((c) => "focus" in c);
      if (client) {
        await client.focus();
        // Actually take the user to the target: navigate the focused tab for an in-app route,
        // or open a new window for an external watch link (cross-origin can't be navigated from a SW).
        if (target && target !== "/") {
          if (sameOrigin && "navigate" in client) {
            try { await client.navigate(target); return; } catch { /* fall through to openWindow */ }
          }
          if (self.clients.openWindow) { await self.clients.openWindow(target); return; }
        }
        return;
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});
