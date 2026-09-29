// SlideQuiz offline support.
// Always tries the internet first, so updates show straight away; if there's no connection,
// it uses the copy saved last time. Only SlideQuiz's own files are saved (not accounts or stats).
const CACHE = "slidequiz-v1";
const CORE = ["./", "index.html", "app.css", "assets/app.js", "favicon.svg", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req, { ignoreSearch: req.mode === "navigate" })) || (req.mode === "navigate" ? caches.match("index.html") : Response.error())),
  );
});
