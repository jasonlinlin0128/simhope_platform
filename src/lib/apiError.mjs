import { NextResponse } from "next/server";
import { HttpError } from "./httpError.mjs";

export { HttpError };

/**
 * 把任何 throw 出來的東西映成「對外回應」。
 * HttpError → 用它的 status/message（預期錯誤）。其它 → 500 通用訊息 + server log。
 * @param {unknown} e
 * @param {string} label  route 名稱（給非預期錯誤的 server log 標註）
 */
export function handleApiError(e, label) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(`[${label}]`, e);
  return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
}
