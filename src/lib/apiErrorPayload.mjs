import { HttpError } from "./httpError.mjs";

/**
 * 把 throw 出來的東西映成「對外回應的純資料」（status + body）。
 * 不依賴 next/server → 可在 node --test 下單元測試。
 * HttpError → 用它的 status/message（預期錯誤）。其它 → 500 通用訊息 + logger.error。
 * @param {unknown} e
 * @param {string} label    route 名稱（給非預期錯誤的 server log 標註）
 * @param {{error: Function}} [logger=console]  注入點，方便測試
 * @returns {{status: number, body: {error: string}}}
 */
export function apiErrorPayload(e, label, logger = console) {
  if (e instanceof HttpError) {
    return { status: e.status, body: { error: e.message } };
  }
  logger.error(`[${label}]`, e);
  return { status: 500, body: { error: "伺服器錯誤" } };
}
