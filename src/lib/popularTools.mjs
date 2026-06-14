// src/lib/popularTools.mjs
// 純函式：依全期瀏覽數挑首頁「熱門工具」。無 firebase/browser 依賴，可 node:test。

/**
 * @param {object[]} tools                  工具陣列（需有 id, status）
 * @param {Record<string, number>} viewsMap { toolId: 全期瀏覽數 }
 * @param {{limit?:number, minWithViews?:number, statuses?:string[]}} [opts]
 * @returns {object[]} 排序後 top N（只含 views>0 的合格工具）；未達門檻回 []
 */
export function rankPopularTools(tools = [], viewsMap = {}, opts = {}) {
  const {
    limit = 6,
    minWithViews = 3,
    statuses = ["live", "beta", "new"],
  } = opts;
  const allow = new Set(statuses);
  const eligible = (tools || [])
    .filter((t) => t && allow.has(t.status))
    .map((t) => ({ tool: t, views: Number(viewsMap[t.id]) || 0 }))
    .filter((x) => x.views > 0);
  if (eligible.length < minWithViews) return [];
  // Array.prototype.sort 在 V8 為穩定排序 → 同分維持原順序。
  return eligible
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
    .map((x) => x.tool);
}
