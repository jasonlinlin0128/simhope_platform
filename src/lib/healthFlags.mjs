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

/** 缺/非數值/負 → 0（比照 toolSignals.signal）。 */
function num(map, id) {
  const n = Number(map && typeof map === "object" ? map[id] : undefined);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 使用門檻 = 「views>0 的公開工具」views 中位數，地板 1。
 * 刻意排除零瀏覽工具：否則多數無瀏覽時 median=0、views≥0 恆真，使熱門但陳舊全觸發（噪音）。
 */
export function usageThreshold(tools, viewsMap) {
  if (!Array.isArray(tools)) return 1;
  const vals = tools
    .filter((t) => PUBLIC_STATUSES.has(t?.status))
    .map((t) => num(viewsMap, t?.id))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return 1;
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  return Math.max(1, median);
}
