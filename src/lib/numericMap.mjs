// src/lib/numericMap.mjs
// 純函式：從物件挑出「值為 number」的欄位（濾掉 updatedAt / serverTimestamp 等非數值欄位）。
// analytics aggregate doc（toolViews/toolHelpful…）讀出來後共用，避免三處重複同一迴圈。
// 無 firebase/browser 依賴，可 node:test。

/**
 * @param {unknown} data
 * @returns {Record<string, number>}  只含值為 number 的欄位的新物件；非物件 → {}。
 */
export function pickNumericFields(data) {
  const out = {};
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "number") out[k] = v;
    }
  }
  return out;
}
