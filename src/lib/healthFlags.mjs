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

function buildOrphanKeys(idSet, viewsMap, opensMap, helpfulMap) {
  const keys = new Set();
  for (const m of [viewsMap, opensMap, helpfulMap]) {
    if (m && typeof m === "object") for (const k of Object.keys(m)) keys.add(k);
  }
  const out = [];
  for (const k of keys) {
    if (idSet.has(k)) continue;
    out.push({ key: k, views: num(viewsMap, k), opens: num(opensMap, k), helpful: num(helpfulMap, k) });
  }
  return out;
}

function emptyReport() {
  return { staleHot: [], zombies: [], stuckPending: [], orphanKeys: [], counts: { staleHot: 0, zombies: 0, stuckPending: 0, orphanKeys: 0 } };
}

/**
 * 把工具 × 三訊號 join 成健檢報告。回新物件、不 mutate 輸入。
 * @param {object[]} tools getAllTools() 結果（含 pending）
 * @param {{viewsMap?:object, opensMap?:object, helpfulMap?:object, nowMs?:number}} opts
 */
export function buildHealthReport(tools, opts = {}) {
  const { viewsMap, opensMap, helpfulMap, nowMs } = opts || {};
  if (!Array.isArray(tools) || !Number.isFinite(nowMs)) return emptyReport();
  const now = nowMs;

  const threshold = usageThreshold(tools, viewsMap);
  const idSet = new Set(tools.map((t) => t?.id).filter(Boolean));

  const staleHot = [];
  const zombies = [];
  const stuckPending = [];

  for (const t of tools) {
    const id = t?.id;
    if (!id) continue;
    const status = t?.status || "";
    const views = num(viewsMap, id);
    const opens = num(opensMap, id);
    const helpful = num(helpfulMap, id);
    const base = { id, title: t?.title || id, status, type: t?.type || "", views, opens, helpful };

    if (status === "pending") {
      const created = toMs(t?.createdAt);
      if (created != null && now - created > PENDING_STUCK_DAYS * DAY_MS) {
        stuckPending.push({ ...base, ageDays: Math.floor((now - created) / DAY_MS) });
      }
      continue; // pending 不參與其他公開 flag
    }

    if (PUBLIC_STATUSES.has(status)) {
      const fresh = toolFreshnessMs(t);
      const isUsed = views >= threshold || opens >= 1;
      if (isUsed && fresh != null && now - fresh > STALE_DAYS * DAY_MS) {
        staleHot.push({ ...base, lastUpdatedMs: fresh, ageDays: Math.floor((now - fresh) / DAY_MS) });
        continue; // 與 zombie 互斥
      }
    }

    if (status === "live") {
      const created = toMs(t?.createdAt);
      const isCold = views < ZOMBIE_VIEW_MAX && opens === 0 && helpful === 0;
      const pastGrace = created != null && now - created > ZOMBIE_GRACE_DAYS * DAY_MS;
      if (isCold && pastGrace) {
        zombies.push({ ...base, ageDays: Math.floor((now - created) / DAY_MS) });
      }
    }
  }

  const orphanKeys = buildOrphanKeys(idSet, viewsMap, opensMap, helpfulMap);

  return {
    staleHot,
    zombies,
    stuckPending,
    orphanKeys,
    counts: {
      staleHot: staleHot.length,
      zombies: zombies.length,
      stuckPending: stuckPending.length,
      orphanKeys: orphanKeys.length,
    },
  };
}
