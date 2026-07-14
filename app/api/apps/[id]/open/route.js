import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { getSubject } from "@/lib/portalSubject";
import { enforceRateLimit } from "@/lib/rateLimit.mjs";
import { canSeeApp, canOpenApp } from "@/lib/appAccess.mjs";
import { writeAudit } from "@/lib/auditLog.mjs";

export const dynamic = "force-dynamic";

/**
 * POST /api/apps/{id}/open — 開啟子系統：重新驗權 → 寫 APP_OPEN 稽核 → 回跳轉網址。
 *
 * 這裡是「前端竄改 application_id 無法繞過」的執行點：清單是伺服器過濾過的，但我們
 * **不信任**「你能送出這個 id 就代表你看得到它」——一律拿 subject 重跑一次 canOpenApp。
 *
 * 看不到的 app 回 **404**（不是 403）：403 會洩漏「這個 app 存在但你沒權限」，
 * 讓人可以用 id 枚舉出公司有哪些內部系統。
 */
export async function POST(request, { params }) {
  const { id } = await params;
  try {
    // 匿名可達 + 被拒路徑也會寫一筆 audit → 沒有限流就是「任何人都能無限灌稽核表」
    enforceRateLimit(request, "app-open", { limit: 30, windowMs: 60000 });
    const subject = await getSubject(request);
    const { adminDb } = getAdmin();

    const snap = await adminDb.collection("tools").doc(id).get();
    const app = snap.exists ? { id: snap.id, ...snap.data() } : null;

    // 不存在、看不到 → 一律 404（同一種回應，不區分）
    if (!app || !canSeeApp(subject, app)) {
      await writeAudit(adminDb, {
        action: "APP_OPEN",
        actorUid: subject.uid,
        actorEmployeeId: subject.employee_id,
        target: id,
        detail: { reason: app ? "not_visible" : "not_found" },
        result: "denied",
        request,
      });
      throw new HttpError(404, "找不到這個應用");
    }

    // 看得到但不能開（dev＝還沒東西可開、terminated＝已停用）
    if (!canOpenApp(subject, app)) {
      await writeAudit(adminDb, {
        action: "APP_OPEN",
        actorUid: subject.uid,
        actorEmployeeId: subject.employee_id,
        target: id,
        detail: { reason: "not_openable", status: app.status },
        result: "denied",
        request,
      });
      throw new HttpError(
        409,
        app.status === "terminated" ? "此系統已停用" : "此系統尚在規劃中",
      );
    }

    const url = app.url ?? app.production_url ?? null;
    if (!url) throw new HttpError(409, "此系統尚未設定連結");
    // 這是一條「經過認可的跳轉」——前端會直接把使用者送過去。url 由 developer 上架時
    // 自填，只允許 http(s)：`javascript:` 之類的 scheme 到了前端就是 XSS。
    if (!/^https?:\/\//i.test(url))
      throw new HttpError(409, "此系統的連結格式不正確");

    await writeAudit(adminDb, {
      action: "APP_OPEN",
      actorUid: subject.uid,
      actorEmployeeId: subject.employee_id,
      target: id,
      detail: { authentication_mode: app.authentication_mode ?? null },
      request,
    });

    return NextResponse.json({ url });
  } catch (e) {
    return handleApiError(e, "/api/apps/[id]/open");
  }
}
