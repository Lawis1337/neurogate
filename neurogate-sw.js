/* NEUROGATE service worker: весь сайт живёт в кэше — открывается без интернета.
   Стендбай-политика: то, что скачал хоть раз — доступно офлайн навсегда. */

const CACHE = "neurogate-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon.svg"];

// сами веса PERCHI-1 WebLLM складывает в IndexedDB своим инсталлятором —
// воркеру их качать не нужно: модель уже офлайн-safe из коробки.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  // удаляем старые версии кэша
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // навигация: сначала кэш (работа офлайн), если там пусто — сеть
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put("./index.html", fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match("./index.html");
        return cached || new Response("офлайн: страница ещё не в кэше", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // остальное (css/js/шрифты/библиотеки/ммодели): кэш → сеть с записью в кэш
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      // кэшируем только полноценные ответы (CORS-модели/библиотеки тоже)
      if (fresh && fresh.status === 200 && (fresh.type === "basic" || fresh.type === "cors")) {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      throw new Error("offline");
    }
  })());
});
