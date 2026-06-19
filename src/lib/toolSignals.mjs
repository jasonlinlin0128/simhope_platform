// src/lib/toolSignals.mjs
// 純函式：把 per-tool 三訊號（瀏覽/開啟/有幫助）併成可排序的列。
// 無 firebase/browser 依賴，可 node:test。比照 sortTools.mjs / helpfulBadge.mjs 風格。

const SORT_KEYS = new Set(["views", "opens", "helpful"]);

/**
 * 缺/非數值/負值 → 0（比照 attachHelpfulCounts）。
 * @param {Record<string, number>|undefined} map
 * @param {string|undefined} id
 * @returns {number}
 */
function signal(map, id) {
  const n = Number(map && typeof map === "object" ? map[id] : undefined);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 把工具清單與三個訊號 map 併成列（回新陣列/新物件，不 mutate 輸入）。
 * @param {object[]} tools  getAllTools() 結果
 * @param {{viewsMap?:Record<string,number>, opensMap?:Record<string,number>, helpfulMap?:Record<string,number>}} [maps]
 * @returns {{id:string,title:string,status:string,type:string,views:number,opens:number,helpful:number}[]}
 */
export function buildToolSignalRows(tools, maps = {}) {
  if (!Array.isArray(tools)) return [];
  const { viewsMap, opensMap, helpfulMap } = maps || {};
  return tools.map((t) => {
    const id = t?.id;
    return {
      id,
      title: t?.title || id || "",
      status: t?.status || "",
      type: t?.type || "",
      views: signal(viewsMap, id),
      opens: signal(opensMap, id),
      helpful: signal(helpfulMap, id),
    };
  });
}

/**
 * 依指定訊號 key 由大到小排序（回新陣列、不 mutate、穩定排序）。
 * @param {object[]} rows  buildToolSignalRows 的結果
 * @param {"views"|"opens"|"helpful"} key
 * @returns {object[]}
 */
export function sortToolSignalRows(rows, key) {
  if (!Array.isArray(rows)) return [];
  const arr = rows.slice(); // 淺拷貝，不 mutate；V8 sort 為穩定排序
  if (!SORT_KEYS.has(key)) return arr; // 未知/缺 key → 原序淺拷貝（安全預設）
  const val = (r) => {
    const n = Number(r?.[key]);
    return Number.isFinite(n) ? n : -Infinity; // 防禦非數值，避免比較器 NaN UB
  };
  // 顯式比較避免 (-Infinity)-(-Infinity)=NaN 的比較器 UB
  return arr.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    return x === y ? 0 : y > x ? 1 : -1; // 遞減；同值→0→穩定保序
  });
}
