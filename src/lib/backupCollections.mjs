// src/lib/backupCollections.mjs
// 安全判斷「這個 collection 是 migration 留下的舊 in-DB 備份」（破壞性清理用）。
// 規則：名稱含 `-backup-YYYY-MM-DD`（base-backup-日期[-suffix]）。
// fail-safe：沒有日期樣式的一律不命中 → 絕不誤刪真 collection。

/**
 * @param {string} name  collection id
 * @returns {boolean} true = 是可刪的舊 in-DB 備份
 */
export function isStaleBackupCollection(name) {
  return /-backup-\d{4}-\d{2}-\d{2}/.test(name);
}
