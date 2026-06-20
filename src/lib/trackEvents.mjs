// src/lib/trackEvents.mjs
// 使用追蹤的純邏輯（runtime-agnostic、無 firebase/browser 依賴）。
// client (track.js) 與 server (api/track) 共用；node:test 可直接測。

/** 事件名（client 送的 snake_case）→ analytics doc 計數欄位（camelCase）。 */
export const TRACK_EVENTS = {
  tool_open: "toolOpen",
  tool_view: "toolView",
  tool_helpful: "toolHelpful",
  search: "search",
  request_submit: "requestSubmit",
};

/**
 * 允許走匿名 /api/track 的事件白名單。
 * tool_helpful 刻意排除：改走需登入 + 後端去重的 /api/tool-helpful（防公開 badge 被匿名灌水）。
 */
export const ANON_TRACK_EVENTS = new Set([
  "tool_open",
  "tool_view",
  "search",
  "request_submit",
]);

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
 * @param {Set<string>} [knownToolIds]  已知工具 id 集合。提供時：id 不在集合內 → 剔除 per-tool key
 *   （仍累計 field 總數），防匿名任意 toolId 在 aggregate doc 長出孤兒 key、逼近 Firestore 1MB 上限。
 *   不提供（undefined）→ 不過濾（fail-open，維持原行為）。
 * @returns {{field:string, byToolKey:string|null, viewToolKey:string|null, helpfulToolKey:string|null}|null}
 *   null = 不合法事件；byToolKey=開啟排名用，viewToolKey=瀏覽熱門用，helpfulToolKey=有幫助評分用
 */
export function buildIncrements(event, toolId, knownToolIds) {
  const field = eventField(event);
  if (!field) return null;
  const id = toolId ? String(toolId).slice(0, 200) : null;
  // id 為空 → 無 per-tool key；未給集合 → 不過濾；給了集合但 id 不在其中 → per-tool key 設 null。
  const known =
    !id || !(knownToolIds instanceof Set) || knownToolIds.has(id) ? id : null;
  return {
    field,
    // 開啟 → daily byTool（admin 開啟排名用）
    byToolKey: event === "tool_open" ? known : null,
    // 瀏覽 → 全期 analytics/toolViews（首頁熱門用）
    viewToolKey: event === "tool_view" ? known : null,
    // 有幫助 → 全期 analytics/toolHelpful（工具評分用）
    helpfulToolKey: event === "tool_helpful" ? known : null,
  };
}
