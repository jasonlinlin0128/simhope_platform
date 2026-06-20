// src/lib/healthFlags.mjs
// 純函式：把 freshness × usage 訊號 join 成「待修問題」報告。
// 無 firebase/browser 依賴，可 node:test（比照 toolSignals.mjs：零依賴、回新物件不 mutate、缺值安全）。

export const STALE_DAYS = 180;
export const ZOMBIE_GRACE_DAYS = 90;
export const ZOMBIE_VIEW_MAX = 3;
export const PENDING_STUCK_DAYS = 14;

const DAY_MS = 86400000;
const PUBLIC_STATUSES = new Set(["live", "beta", "new"]);

/**
 * 多型時間 → epoch ms；無法判定 → null。
 * 支援 number(ms)、ISO/YYYY-MM-DD 字串、Firestore Timestamp(.toMillis())、{seconds}。
 */
export function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof v.toMillis === "function") {
    const n = v.toMillis();
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

/**
 * 最後實質更新時間 → ms：versions 末筆 date → updatedAt → createdAt；都無 → null。
 * 版本日期讀法內聯（鏡像 versions.js#lastUpdatedDate；草稿空字串用 || 視為未填），保持本檔零依賴。
 */
export function toolFreshnessMs(tool) {
  const vdate = tool?.versions?.at?.(-1)?.date || null;
  const fromVersion = vdate ? toMs(vdate) : null;
  if (fromVersion != null) return fromVersion;
  const u = toMs(tool?.updatedAt);
  if (u != null) return u;
  return toMs(tool?.createdAt);
}
