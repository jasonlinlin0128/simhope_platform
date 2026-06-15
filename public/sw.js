// SimHope PWA 最小 service worker：可安裝 + 離線殼。
// 只快取離線 fallback 頁；導覽請求 network-first，離線時回 /offline。不快取動態資料。
const CACHE = "simhope-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return; // 只接管導覽，其餘放行（不快取動態資料）
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});
