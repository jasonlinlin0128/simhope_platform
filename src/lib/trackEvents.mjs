// src/lib/trackEvents.mjs
// 使用追蹤的純邏輯（runtime-agnostic、無 firebase/browser 依賴）。
// client (track.js) 與 server (api/track) 共用；node:test 可直接測。

/** 事件名（client 送的 snake_case）→ analytics doc 計數欄位（camelCase）。 */
export const TRACK_EVENTS = {
  tool_open: "toolOpen",
  tool_view: "toolView",
  search: "search",
  request_submit: "requestSubmit",
};

/**
 * @param {string} event
 * @returns {string|null} 對應計數欄位；未知事件回 null（= 不合法）。
 */
export function eventField(event) {
  return TRACK_EVENTS[event] || null;
}

/**
 * 決定這次事件要不要送（client 端同 session 去重）。
 * @param {string} event
 * @param {string|null} dedupKey  null = 不去重（如 search / request_submit）
 * @param {{has:(k:string)=>boolean, add:(k:string)=>void}} seen
 * @returns {boolean}
 */
export function shouldTrack(event, dedupKey, seen) {
  if (!eventField(event)) return false; // 未知事件不送
  if (!dedupKey) return true; // 不去重事件
  if (seen.has(dedupKey)) return false;
  seen.add(dedupKey);
  return true;
}

/**
 * 組裝要 increment 的欄位（server 端用）。
 * @param {string} event
 * @param {string} [toolId]
 * @returns {{field:string, byToolKey:string|null, viewToolKey:string|null}|null}
 *   null = 不合法事件；byToolKey=開啟排名用，viewToolKey=瀏覽熱門用
 */
export function buildIncrements(event, toolId) {
  const field = eventField(event);
  if (!field) return null;
  const id = toolId ? String(toolId).slice(0, 200) : null;
  return {
    field,
    // 開啟 → daily byTool（admin 開啟排名用）
    byToolKey: event === "tool_open" ? id : null,
    // 瀏覽 → 全期 analytics/toolViews（首頁熱門用）
    viewToolKey: event === "tool_view" ? id : null,
  };
}
