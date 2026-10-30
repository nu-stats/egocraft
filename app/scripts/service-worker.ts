// The service worker that lets EgoCraft open with no network (on an iPad
// in the field, or anywhere). The build writes it as dist/sw.js with the
// list of built files filled in (see vite.config.ts).
//
// Every built file is stored when the app is first opened. After that the
// app loads from the stored copy; a new build has a new cache name, so the
// next visit online brings the new version.

export function serviceWorkerSource(files: string[], version: string): string {
  return `// EgoCraft offline cache, written by the build. Do not edit.
// One cache per address (the app's folder), so copies of EgoCraft at two
// addresses on the same site never delete each other's files. Caches named
// the old way (egocraft-<hash>, before 0.4.0) are cleared.
const PREFIX = 'egocraft:' + new URL(self.registration.scope).pathname + ':';
const CACHE = PREFIX + ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith(PREFIX) && k !== CACHE) || /^egocraft-[0-9a-f]{12}$/.test(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (e) {
        // Offline and not stored: pages fall back to the app itself.
        if (req.mode === 'navigate') {
          const app = await cache.match('./index.html');
          if (app) return app;
        }
        throw e;
      }
    }),
  );
});
`;
}
