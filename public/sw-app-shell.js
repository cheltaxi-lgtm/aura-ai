/* Zovus app-shell service worker — native WebView only. Network-first HTML; cache decks/fonts offline. */
const CACHE = "zovus-shell-v10";
const OFFLINE_URL = "/offline.html";

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
  event.waitUntil(
    Promise.all([
      self.skipWaiting(),
      caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)),
    ])
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNavigateWithRetry(request, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(request);
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await sleep(400 * (i + 1));
    }
  }
  throw lastError;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url) || isApi(url)) return;

  /* Never cache HTML — stale shell breaks Next.js chunk URLs after deploy.
     On network failure, show the offline page (not a cached home page). */
  if (request.mode === "navigate") {
    event.respondWith(
      fetchNavigateWithRetry(request).catch(async () => {
        const cache = await caches.open(CACHE);
        const offline = await cache.match(OFFLINE_URL);
        if (offline) return offline;
        return Response.error();
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

  /* Deck art is immutable (long Cache-Control). Cache-first avoids black/placeholder
     faces when a transient network error would otherwise become Response.error(). */
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          void cache.put(request, response.clone());
        }
        return response;
      } catch {
        return Response.error();
      }
    })
  );
});
