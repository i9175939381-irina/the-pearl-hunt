/**
 * Service Worker для «Охоты за жемчужинами».
 *
 * Стратегия:
 *  - install: префетчим статические файлы игры, кладём в кэш, сразу
 *    skipWaiting(), чтобы новая версия заменила старую без ручного ребута.
 *  - fetch: NETWORK-FIRST для нашего origin. Сеть всегда приоритетнее —
 *    значит любые свежие правки игры попадают к пользователю сразу.
 *    Если сети нет (offline) — отдаём кэш.
 *  - activate: чистим старые версии кэша.
 *
 * Версия кэша — обязательно повышай при любом изменении игры, иначе
 * часть пользователей будет видеть старый код (что и случилось).
 */
const CACHE_NAME = "pearl-hunt-v10";
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
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.map(function (n) {
            if (n !== CACHE_NAME) return caches.delete(n);
            return null;
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("message", function (event) {
  if (event && event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // NETWORK-FIRST: пытаемся взять актуальную версию из сети, при неудаче
  // откатываемся в кэш. Это гарантирует, что обновления игры доходят
  // сразу, а не «через раз» при разогретом кэше.
  event.respondWith(
    fetch(req)
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
        return caches.match(req).then(function (cached) {
          return cached || Response.error();
        });
      })
  );
});
