// PLC Tester service worker — makes the app installable and loads fast offline.
// Strategy:
//   - /api/*  -> always go to network (live PLC data, never cache)
//   - navigation (pages) -> network first, fall back to cache
//   - static assets -> cache first
const CACHE = "plc-tester-v1";
const SHELL = ["/"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // never cache API / live data
  if (url.pathname.startsWith("/api/")) return;
  if (request.method !== "GET") return;

  // page navigations: network first
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => { caches.open(CACHE).then((c) => c.put(request, res.clone())); return res; })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // static assets: cache first, then network
  e.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((res) => {
        if (res && res.status === 200 && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
