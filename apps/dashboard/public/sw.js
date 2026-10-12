// Minimal service worker: makes the app installable and keeps the shell available offline.
// It never touches API calls (those go to another origin) and holds no user data.
// v3 drops caches from v2, which could hold the HTML page under a JS file name (see the fetch handler).
const CACHE = "shell-v3";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }
  // Built assets have hashed names, so cache-first is safe.
  event.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        // After a deploy the host answers a missing old file with the HTML page (status 200). Caching that under
        // the file's URL would break the import for good, so only keep responses that are not HTML.
        const type = res.headers.get("content-type") ?? "";
        if (res.ok && !type.includes("text/html")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
    ),
  );
});
