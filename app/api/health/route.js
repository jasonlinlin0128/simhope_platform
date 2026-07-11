import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 系統存活探測（無認證、無資料庫依賴 — 只證明 serverless function 活著）。 */
export async function GET() {
  return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
}
