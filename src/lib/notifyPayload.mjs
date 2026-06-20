// src/lib/notifyPayload.mjs
// 純函式：組 Discord webhook 的 request body。無 firebase/browser 依賴，可 node:test。
// 抽出來最主要是為了釘住安全不變式：allowed_mentions.parse 一律為空陣列，
// 讓任何使用者可控文字（匿名 /api/request 的需求內容、工具標題等）都無法觸發
// @everyone / @here / <@&roleId> 群組提及。

/**
 * 組 Discord webhook body。
 * @param {unknown} text  通知內文（會強制轉字串）
 * @returns {{content:string, allowed_mentions:{parse:string[]}}}
 */
export function buildNotifyPayload(text) {
  return {
    content: typeof text === "string" ? text : String(text ?? ""),
    // parse:[] = 停用所有自動提及解析（@everyone/@here/role/user）。
    // 即使內文含 @everyone 也只會以純文字顯示，不會真的 ping。
    allowed_mentions: { parse: [] },
  };
}
