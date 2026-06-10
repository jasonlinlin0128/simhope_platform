// src/lib/requests.mjs
// requests 的純邏輯（無 firebase 依賴、node:test 可測）。

/**
 * 依 createdAt（Firestore Timestamp）由新到舊排序。缺 createdAt → 視為 0。
 * 回新陣列，不變動輸入。
 * @param {Array<{createdAt?: {toMillis: () => number}}>} rows
 */
export function sortByCreatedAtDesc(rows) {
  return [...rows].sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );
}
