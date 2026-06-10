// src/lib/devStatus.mjs
// /access 開發者卡的 CTA 狀態決策（純邏輯、無 firebase/browser 依賴、node:test 可測）。
// 呼叫端（DevStatusCTA）已先過濾未登入 → role 只會是 admin/developer/viewer。

/**
 * @param {"admin"|"developer"|"viewer"} role
 * @param {string|null|undefined} devStatus  users/{uid}.devStatus
 * @returns {"apply"|"pending"|"rejected"|"none"}
 */
export function devCtaState(role, devStatus) {
  if (role === "developer" || role === "admin") return "none"; // 已有權限
  if (devStatus === "pending") return "pending";
  if (devStatus === "rejected") return "rejected";
  if (devStatus === "approved") return "none"; // 理論上 role 已 developer；防呆
  return "apply"; // viewer 無 devStatus：可申請
}
