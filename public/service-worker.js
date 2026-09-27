/* Build tokens are replaced by scripts/build-sw.mjs. Do not register this template in dev. */
const VERSION = '__RFR_BUILD_VERSION__';
const FILES = __RFR_PRECACHE_MANIFEST__;
const SCOPE = self.registration.scope;
const PREFIX = `red-flag-rush:${encodeURIComponent(SCOPE)}:`;
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = new URL('index.html', SCOPE).href;
const ASSETS = FILES.map((file) => new URL(file, SCOPE).href);

self.addEventListener('install', (event) => {
  // A failed download aborts installation; the working version keeps control.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
  })());
  // Updates wait until the player explicitly accepts or every old tab closes.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const openApp = windows.some((client) => client.url.startsWith(SCOPE));
    // Explicit updates may leave another tab running older code. Keep its assets
    // until a later activation with no open clients; never invalidate a live tab.
    if (!openApp) {
      await Promise.all((await caches.keys())
        .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
        .map((key) => caches.delete(key)));
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

async function navigationResponse() {
  const cache = await caches.open(CACHE);
  const response = await cache.match(SHELL);
  if (!response) return fetch(SHELL);
  // Relative Vite assets also resolve at the installed scope for offline routes.
  const html = (await response.text()).replace(/<head>/i, `<head><base href="${SCOPE}">`);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(html, { status: 200, headers });
}

async function assetResponse(request) {
  const cache = await caches.open(CACHE);
  // The build is public static content. Preview/static hosts may add Vary: Origin;
  // module requests have an Origin header while install-time precaching does not.
  const current = await cache.match(request, { ignoreVary: true });
  if (current) return current;
  // A different open tab can still request its old content-hashed assets.
  for (const key of await caches.keys()) {
    if (!key.startsWith(PREFIX) || key === CACHE) continue;
    const previous = await (await caches.open(key)).match(request, { ignoreVary: true });
    if (previous) return previous;
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Room state and private votes always go to the live party server.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  if (event.request.mode === 'navigate') {
    // Keep HTML and its hashed assets on one release, even when online.
    event.respondWith(navigationResponse());
  } else {
    // Only build assets are cached. Arbitrary URLs are never added to storage.
    event.respondWith(assetResponse(event.request));
  }
});
