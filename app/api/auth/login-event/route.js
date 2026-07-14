import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { requireRole } from "@/lib/apiAuth.mjs";
import { rateLimit } from "@/lib/rateLimit.mjs";
import { writeAudit } from "@/lib/auditLog.mjs";

/**
 * POST /api/auth/login-event — 登入成功後由 client 呼叫，寫 AUTH_LOGIN 稽核。
 *
 * actor 一律來自 Bearer ID token（requireRole 驗證），不信任 body——body 沒有任何欄位。
 * requireRole 同時會擋掉已停用的員工（母檔 status != active → 403），
 * 所以停用者不只登不進系統，連這筆「我登入了」都寫不進去。
 */
export async function POST(request) {
  try {
    const { uid, role, employeeId } = await requireRole(request, [
      "viewer",
      "developer",
      "admin",
    ]);
    // 限流以 uid 為鍵，不用 IP——全公司從同一個對外 IP 出去，早上 08:30 的登入尖峰
    // 會直接把 per-IP 額度打爆，稽核在最該完整的時刻靜默消失。
    if (!rateLimit(`login-event:${uid}`, { limit: 10, windowMs: 60000 }).ok) {
      throw new HttpError(429, "操作過於頻繁，請稍後再試");
    }
    const { adminDb } = getAdmin();

    await writeAudit(adminDb, {
      action: "AUTH_LOGIN",
      actorUid: uid,
      actorEmployeeId: employeeId ?? null,
      target: uid,
      // authoritative:false —— 這筆是 client 自報的。密碼/Google 登入直接打 Firebase，
      // 不經過我們的伺服器，所以「沒有這筆」不代表沒登入（見 threat-model §3.7）。
      detail: { role, method: "client-reported", authoritative: false },
      request,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e, "/api/auth/login-event");
  }
}
