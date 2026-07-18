import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { enforceRateLimit } from "@/lib/rateLimit.mjs";
import { handleApiError } from "@/lib/apiError.mjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/tool-helpful/{toolId} — 公開讀取單一工具的「👍 有幫助」計數。
 *
 * analytics/toolHelpful 這份文件本身已收斂為 admin-only（2026-07-18），因為
 * 它含所有工具的逐一計數，其中包含 `status:pending`（尚未審核、不在公開
 * catalog 內）的工具——整份給任何人讀等於連帶洩漏這些未上架工具的存在與
 * 熱門度。但 HelpfulButton 這個公開元件仍然需要顯示「這一個」工具的數字——
 * 這支 route 用 Admin SDK 讀整份文件，只回傳呼叫者問的那個 toolId 對應的
 * 值，不回傳其他 key。
 *
 * 不存在 / 亂打的 toolId 一律回 count:0，不查工具是否存在——「查無此工具」
 * 跟「存在但目前 0 個讚」刻意回傳同一種結果，不主動幫忙分辨兩種情況。
 */
export async function GET(request, { params }) {
  try {
    const { toolId } = await params;
    enforceRateLimit(request, "tool-helpful-count", {
      limit: 60,
      windowMs: 60000,
    });

    const { adminDb } = getAdmin();
    const snap = await adminDb.collection("analytics").doc("toolHelpful").get();
    const data = snap.exists ? snap.data() : {};
    const count = typeof data[toolId] === "number" ? data[toolId] : 0;

    return NextResponse.json({ count });
  } catch (e) {
    return handleApiError(e, "/api/tool-helpful/[toolId]");
  }
}
