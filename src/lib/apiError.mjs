import { NextResponse } from "next/server";
import { HttpError } from "./httpError.mjs";
import { apiErrorPayload } from "./apiErrorPayload.mjs";

export { HttpError };

/**
 * 把任何 throw 出來的東西映成 NextResponse。
 * 純映射邏輯（HttpError vs 非預期 + log）抽到 apiErrorPayload（可單元測試）；
 * 這裡只負責包成 NextResponse.json。
 * @param {unknown} e
 * @param {string} label  route 名稱（給非預期錯誤的 server log 標註）
 */
export function handleApiError(e, label) {
  const { status, body } = apiErrorPayload(e, label);
  return NextResponse.json(body, { status });
}
