// src/lib/metrics.mjs
// analytics/totals 原始資料 → 固定四欄正規化（缺欄補 0）。純邏輯、可測。

/**
 * @param {object} [data]  analytics/totals doc 資料
 * @returns {{toolOpen:number, toolView:number, search:number, requestSubmit:number}}
 */
export function normalizeMetrics(data = {}) {
  return {
    toolOpen: data.toolOpen || 0,
    toolView: data.toolView || 0,
    search: data.search || 0,
    requestSubmit: data.requestSubmit || 0,
  };
}
