/**
 * Service Worker для «Охоты за жемчужинами».
 *
 * Стратегия:
 *  - install: префетчим статические файлы игры, кладём в кэш.
 *  - fetch: для GET-запросов с того же origin — «cache, falling back to network».
 *    Если сеть вернула валидный ответ — обновляем кэш (stale-while-revalidate).
 *  - activate: чистим старые версии кэша.
 *
 * Версия кэша — повышай, когда меняешь игру (иначе старые файлы останутся).
 */
const CACHE_NAME = "pearl-hunt-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./settings.js",
  "./i18n.js",
  "./touch-controls.js",
  "./audio.js",
  "./game.js",
  "./cover.png",
  "./manifest.webmanifest",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(PRECACHE).catch(function () {
          // Если какой-то файл не подтянулся (404), не ломаем установку.
        });
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (n) {
          if (n !== CACHE_NAME) return caches.delete(n);
          return null;
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Кэшируем только наш origin — внешние шрифты пусть идут напрямую.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      const networkFetch = fetch(req)
        .then(function (resp) {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return resp;
        })
        .catch(function () {
          return cached;
        });
      return cached || networkFetch;
    })
  );
});
