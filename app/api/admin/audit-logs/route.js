import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { requireRole } from "@/lib/apiAuth.mjs";
import { AUDIT_ACTIONS } from "@/lib/auditLog.mjs";

const PAGE_SIZE = 50;

/**
 * GET /api/admin/audit-logs?action=&limit= — admin 檢視稽核記錄（時間新→舊）。
 *
 * audit_logs 是 server-only（rules 全 deny）→ 只能經這裡讀。唯讀：沒有任何 update/delete 路徑。
 * 需要複合索引 audit_logs(action ASC, ts DESC)（firestore.indexes.json 已列）。
 */
export async function GET(request) {
  try {
    await requireRole(request, ["admin"], {
      forbiddenMessage: "需要管理員權限",
    });
    const { adminDb } = getAdmin();

    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    if (action && !AUDIT_ACTIONS.includes(action)) {
      throw new HttpError(400, "不支援的 action");
    }
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit")) || PAGE_SIZE, 1),
      200,
    );

    let q = adminDb.collection("audit_logs");
    if (action) q = q.where("action", "==", action);
    const snap = await q.orderBy("ts", "desc").limit(limit).get();

    return NextResponse.json({
      logs: snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        expireAt: undefined,
      })),
    });
  } catch (e) {
    return handleApiError(e, "/api/admin/audit-logs");
  }
}
