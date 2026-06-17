// src/lib/helpfulBadge.mjs
// 純函式：把 analytics/toolHelpful 的 per-tool count 接到工具物件上，
// 並決定 ToolCard 是否顯示「👍 N」badge。無 firebase/browser 依賴，可 node:test。

export const HELPFUL_BADGE_MIN = 3;

/**
 * 是否在卡片顯示 👍 badge：count 為有效數值且 >= 門檻。
 * @param {unknown} count
 * @returns {boolean}
 */
export function shouldShowHelpfulBadge(count) {
  const n = Number(count);
  return Number.isFinite(n) && n >= HELPFUL_BADGE_MIN;
}

/**
 * 把 helpfulMap 的 count 附到每個 tool 上（回傳新物件，不 mutate 原 tool）。
 * @param {object[]} tools
 * @param {Record<string, number>} [helpfulMap] { toolId: count }
 * @returns {object[]} 每個 tool 加 helpfulCount（缺/非數值/<=0 → 0）
 */
export function attachHelpfulCounts(tools = [], helpfulMap = {}) {
  if (!Array.isArray(tools)) return [];
  const map = helpfulMap && typeof helpfulMap === "object" ? helpfulMap : {};
  return tools.map((t) => {
    const n = Number(map[t?.id]);
    return { ...t, helpfulCount: Number.isFinite(n) && n > 0 ? n : 0 };
  });
}
