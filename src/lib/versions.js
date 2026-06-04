// src/lib/versions.js
// versions[] 純函式（無 React / 無 Firebase，可被 node 斷言）。
// 單一真相：tool.versions 陣列，順序舊→新，at(-1)=目前版。

/** 目前版（陣列最後一筆）。無版本回 null。 */
export function latestVersion(tool) {
  const vs = tool?.versions;
  return Array.isArray(vs) && vs.length ? vs.at(-1) : null;
}

/**
 * 目前版號字串（給「版本：」標籤）。fallback 舊 typeData.version；都無回空字串。
 * 註：草稿列（version === ""）視為「未填」，會 fall through 到 typeData.version
 * — 此處刻意用 ||（非 ??），別改成 ??。
 */
export function latestVersionLabel(tool) {
  return latestVersion(tool)?.version || tool?.typeData?.version || "";
}

/** 最後更新日期（YYYY-MM-DD）。無則回 null（呼叫端可再退 updatedAt）。 */
export function lastUpdatedDate(tool) {
  return latestVersion(tool)?.date || null;
}

/** 新版本列的預設值；date 由呼叫端傳今天（避免在純函式裡用 new Date 不可測）。 */
export function blankVersionRow(todayYMD) {
  return { version: "", date: todayYMD || "", notes: "", fileUrl: "" };
}
