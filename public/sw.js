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
  event.respondWith(
    fetch(req).catch(async () => {
      // 離線：回快取的 /offline；若 precache 失敗導致 cache miss（undefined），
      // 回一個合成 Response，避免 respondWith(undefined) 變成瀏覽器原生硬錯誤。
      const cached = await caches.match(OFFLINE_URL);
      return (
        cached ||
        new Response(
          "<!doctype html><meta charset=utf-8><title>離線</title>" +
            '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
            "<h1>目前離線</h1><p>請恢復網路連線後再試。</p>",
          {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        )
      );
    }),
  );
});
