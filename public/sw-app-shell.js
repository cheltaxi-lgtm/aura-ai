/* Zovus app-shell service worker — native WebView only. Network-first HTML; cache decks/fonts offline. */
const CACHE = "zovus-shell-v5";

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApi(url) {
  return url.pathname.startsWith("/api/");
}

function isNextStatic(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isOfflineAsset(url) {
  return (
    url.pathname.startsWith("/decks/") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname === "/icon.svg"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url) || isApi(url)) return;

  /* Never cache HTML — stale shell breaks Next.js chunk URLs after deploy. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match("/?app=1");
        if (offline) return offline;
        return caches.match("/");
      })
    );
    return;
  }

  /* Next.js chunks are content-hashed; caching them caused stale UI after deploy. */
  if (isNextStatic(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (!isOfflineAsset(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.open(CACHE).then((cache) => cache.match(request));
        if (cached) return cached;
        return Response.error();
      })
  );
});
