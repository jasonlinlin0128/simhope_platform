import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { handleApiError } from "@/lib/apiError.mjs";
import { requireRole } from "@/lib/apiAuth.mjs";
import { enforceRateLimit } from "@/lib/rateLimit.mjs";
import { buildAuditEntry, writeAudit } from "@/lib/auditLog.mjs";

/**
 * POST /api/auth/login-event — 登入成功後由 client 呼叫，寫 AUTH_LOGIN 稽核。
 *
 * actor 一律來自 Bearer ID token（requireRole 驗證），不信任 body——body 沒有任何欄位。
 * requireRole 同時會擋掉已停用的員工（母檔 status != active → 403），
 * 所以停用者不只登不進系統，連這筆「我登入了」都寫不進去。
 */
export async function POST(request) {
  try {
    enforceRateLimit(request, "login-event", { limit: 20, windowMs: 60000 });
    const { uid, role, employeeId } = await requireRole(request, [
      "viewer",
      "developer",
      "admin",
    ]);
    const { adminDb } = getAdmin();

    await writeAudit(
      adminDb,
      buildAuditEntry({
        action: "AUTH_LOGIN",
        actorUid: uid,
        actorEmployeeId: employeeId ?? null,
        target: uid,
        detail: { role },
        request,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e, "/api/auth/login-event");
  }
}
