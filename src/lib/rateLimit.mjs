// src/lib/rateLimit.mjs
// per-IP（或任意 key）記憶體滑動視窗限流。server-only。
// 注意：Vercel serverless 多實例 → 只在單一實例內計數（非全域精確、best-effort），
// 足以擋住明顯洗版；嚴格全域限流需外部 store（YAGNI，見 audit §6）。
import { HttpError } from "./httpError.mjs";

/**
 * 模組級 store（單一實例內共用）。
 * `hits`: key -> number[]（timestamps）；`lastSweep`: 上次清掃時間（防孤兒 key 漏水）。
 */
const defaultStore = { hits: new Map(), lastSweep: 0 };

/**
 * @param {string} key  通常是 IP
 * @param {{limit:number, windowMs:number}} opts
 * @param {() => number} [clock]  注入時鐘（測試用），預設 Date.now
 * @param {{hits: Map<string, number[]>, lastSweep: number}} [store]  注入 store（測試用）
 * @returns {{ok: boolean, remaining: number}}
 */
export function rateLimit(
  key,
  { limit, windowMs },
  clock = Date.now,
  store = defaultStore,
) {
  const now = clock();
  // 週期性清掃：每過一個視窗掃一次，移除沒有窗內 timestamp 的孤兒 key（防漏水）。
  if (now - store.lastSweep >= windowMs) {
    for (const [k, ts] of store.hits) {
      const fresh = ts.filter((t) => now - t < windowMs);
      if (fresh.length === 0) store.hits.delete(k);
      else store.hits.set(k, fresh);
    }
    store.lastSweep = now;
  }
  const arr = (store.hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    store.hits.set(key, arr);
    return { ok: false, remaining: 0 };
  }
  arr.push(now);
  store.hits.set(key, arr);
  return { ok: true, remaining: limit - arr.length };
}

/** 從 Next request 取 client IP（Vercel 帶 x-forwarded-for）。 */
export function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}

/**
 * Route 便捷守門：超過限流就 throw HttpError(429)。
 * 給用 handleApiError 的 route 共用（find-tool / analyze-demand / announce-tool…），
 * 取代各自重複的 `if (!rateLimit(`x:${clientIp(req)}`,opts).ok) throw new HttpError(429,...)`。
 * @param {Request} req
 * @param {string} keyPrefix  限流鍵前綴（會接 `:${clientIp(req)}`）
 * @param {{limit:number, windowMs:number}} opts
 * @param {() => number} [clock]  注入時鐘（測試用）
 * @param {{hits: Map<string, number[]>, lastSweep: number}} [store]  注入 store（測試用）
 * @throws {HttpError} 429
 */
export function enforceRateLimit(req, keyPrefix, opts, clock = Date.now, store) {
  const ok = rateLimit(`${keyPrefix}:${clientIp(req)}`, opts, clock, store).ok;
  if (!ok) throw new HttpError(429, "操作過於頻繁，請稍後再試");
}
