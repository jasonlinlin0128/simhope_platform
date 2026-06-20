// src/lib/helpfulVote.mjs
// 純函式：組「每位使用者對每個工具只計一次」的去重 doc id。
// 無 firebase/browser 依賴，可 node:test。helpfulVotes 為 server-only collection（rules deny client）。

/**
 * 組去重 doc id：`${toolId}__${uid}`。
 * Firestore doc id 不可含 "/"，且長度有限；toolId/uid 皆強制轉字串、去除斜線、截斷。
 * 壞輸入（缺 toolId 或 uid）→ 回 null（呼叫端應視為無效、不寫入）。
 * @param {unknown} toolId
 * @param {unknown} uid
 * @returns {string|null}
 */
export function buildVoteDocId(toolId, uid) {
  const t = sanitize(toolId);
  const u = sanitize(uid);
  if (!t || !u) return null;
  return `${t}__${u}`;
}

function sanitize(v) {
  if (typeof v !== "string") return "";
  // 去掉會破壞 doc path 的 "/"，截斷避免過長 doc id（Firestore 上限 1500 bytes）。
  return v.replace(/\//g, "_").slice(0, 200).trim();
}
