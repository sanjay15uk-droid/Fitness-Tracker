const CACHE_NAME = "matchday-cache-v1";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "data.js",
  "manifest.json",
  "assets/apple-touch-icon.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for app files, with a background refresh so updates still land
// next time you open the app (not mid-session, which would be jarring).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline — fall back to whatever's cached
      return cached || networkFetch;
    })
  );
});
