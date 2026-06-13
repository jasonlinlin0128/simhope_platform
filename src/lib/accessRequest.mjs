/**
 * 算出開發者申請（type='access'）時要寫進 users/{uid} 的欄位。
 * 一定設 devStatus='pending'；若該 user 文件不存在或缺 role，補上 role:'viewer'，
 * 以免後續 firestore.rules（讀 users.role）拿到 null 而把已核准的使用者擋在外面。
 * 已有 role（admin/developer/viewer）則不覆蓋。
 * @param {object|null|undefined} existing  現有 users/{uid} 文件資料（不存在傳 null）
 * @returns {{devStatus: string, role?: string}}
 */
export function buildAccessRequestUserUpdate(existing) {
  const update = { devStatus: "pending" };
  if (!existing || !existing.role) update.role = "viewer";
  return update;
}
