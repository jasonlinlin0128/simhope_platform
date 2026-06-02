// src/lib/rateLimit.js
// per-IP（或任意 key）記憶體滑動視窗限流。server-only。
// 注意：Vercel serverless 多實例 → 只在單一實例內計數（非全域精確），
// 足以擋住明顯洗版；嚴格全域限流需外部 store（YAGNI）。
const hits = new Map(); // key -> number[]（timestamps）

/**
 * @param {string} key  通常是 IP
 * @param {{limit:number, windowMs:number}} opts
 * @param {() => number} [clock]  注入時鐘（測試用），預設 Date.now
 * @returns {{ok: boolean, remaining: number}}
 */
export function rateLimit(key, { limit, windowMs }, clock = Date.now) {
  const now = clock();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return { ok: false, remaining: 0 };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true, remaining: limit - arr.length };
}

/** 從 Next request 取 client IP（Vercel 帶 x-forwarded-for）。 */
export function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}
