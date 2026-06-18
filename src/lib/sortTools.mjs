// src/lib/sortTools.mjs
// 純函式：依排序模式排 /hub 工具清單。無 firebase/browser 依賴，可 node:test。

/**
 * 把工具清單依 mode 排序（回新陣列、不 mutate、穩定排序）。
 * @param {object[]} tools
 * @param {"popular"|"recent"} mode
 * @param {Record<string, number>} [viewsMap] { toolId: 全期瀏覽數 }（popular 用）
 * @returns {object[]}
 */
export function sortTools(tools, mode, viewsMap = {}) {
  if (!Array.isArray(tools)) return [];
  const arr = tools.slice(); // 淺拷貝，不 mutate 原陣列；V8 sort 為穩定排序
  if (mode === "popular") {
    const views = (t) => Number(viewsMap?.[t?.id]) || 0;
    return arr.sort((a, b) => views(b) - views(a)); // 同分 → 0 → 維持原序
  }
  if (mode === "recent") {
    const ms = (t) => {
      const n = Date.parse(t?.createdAt);
      return Number.isNaN(n) ? -Infinity : n; // 缺/壞 createdAt → 視為最舊
    };
    // 顯式比較避免 (-Infinity)-(-Infinity)=NaN 的比較器 UB
    return arr.sort((a, b) => {
      const x = ms(a);
      const y = ms(b);
      return x === y ? 0 : y > x ? 1 : -1;
    });
  }
  return arr; // 未知 mode → 原序淺拷貝（安全預設）
}
