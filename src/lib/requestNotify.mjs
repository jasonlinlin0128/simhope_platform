// src/lib/requestNotify.mjs
// 需求閉環「站內未讀通知」的純邏輯。無 firebase/browser 依賴，可 node:test。

/**
 * 標「已處理」時要通知誰：回 request 的 uid（非空字串）否則 null（匿名請求不通知）。
 * @param {{uid?:unknown}|null|undefined} request
 * @returns {string|null}
 */
export function notifyUidForHandled(request) {
  const uid = request && typeof request === "object" ? request.uid : null;
  return typeof uid === "string" && uid ? uid : null;
}

/**
 * Navbar「我的需求」是否顯示未讀紅點。
 * @param {{unreadHandledRequest?:unknown}|null|undefined} profile
 * @returns {boolean}
 */
export function hasUnreadHandled(profile) {
  return !!(profile && profile.unreadHandledRequest);
}
