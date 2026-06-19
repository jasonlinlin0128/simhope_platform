// src/lib/announcePublish.mjs
// 純函式：決定工具狀態轉換是否要發「上線公告」、組公告訊息。
// 無 firebase/browser 依賴，可 node:test。

/** 算「公開可用」的狀態（轉入這些＝上線）。 */
export const ANNOUNCE_STATUSES = ["live", "beta", "new"];

/**
 * 是否該發上線公告：未公告過 + 舊狀態非公開 + 新狀態公開。
 * @param {string} prevStatus
 * @param {string} newStatus
 * @param {unknown} announcedAt  已公告標記（truthy = 已公告）
 * @returns {boolean}
 */
export function shouldAnnounce(prevStatus, newStatus, announcedAt) {
  return (
    !announcedAt &&
    !ANNOUNCE_STATUSES.includes(prevStatus) &&
    ANNOUNCE_STATUSES.includes(newStatus)
  );
}

/**
 * 組 Discord 上線公告訊息。
 * @param {{id:string, title?:string, tagline?:string}} tool
 * @returns {string}
 */
export function buildAnnounceMessage(tool) {
  const title = tool?.title || "(未命名工具)";
  const tagline = tool?.tagline ? ` — ${tool.tagline}` : "";
  const url = `https://simhope-platform.vercel.app/tool/${tool?.id}`;
  return `🎉 新工具上線：${title}${tagline}\n${url}`;
}
