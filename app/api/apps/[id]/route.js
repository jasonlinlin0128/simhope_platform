import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { getSubject } from "@/lib/portalSubject";
import { enforceRateLimit } from "@/lib/rateLimit.mjs";
import { canSeeApp } from "@/lib/appAccess.mjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps/{id} — 單一應用（詳情頁用）。
 *
 * 受限 app（BY_RULE）的 client SDK 直讀會被 firestore.rules 擋掉——那是刻意的。
 * 有權限的人改由這裡取得：伺服器以 canSeeApp 判斷後才回內容。
 * 看不到／不存在 → 404（不用 403，避免用 id 枚舉出公司有哪些內部系統）。
 */
export async function GET(request, { params }) {
  const { id } = await params;
  try {
    enforceRateLimit(request, "apps-get", { limit: 60, windowMs: 60000 });
    const subject = await getSubject(request);
    const { adminDb } = getAdmin();

    const snap = await adminDb.collection("tools").doc(id).get();
    const app = snap.exists ? { id: snap.id, ...snap.data() } : null;
    if (!app || !canSeeApp(subject, app))
      throw new HttpError(404, "找不到這個應用");

    // 內部欄位不出門（ACL 名單、健檢網址、擁有者員編都不該給前端）。
    // url 也拿掉——要開啟一律走 POST /api/apps/{id}/open，那裡才會重驗 canOpenApp
    // 並寫 APP_OPEN 稽核。若這裡直接給 url，等於提供一條「開了但沒紀錄」的旁路。
    const {
      allowed_users,
      allowed_departments,
      allowed_roles,
      health_check_url,
      owner_employee_id,
      url,
      ...safe
    } = app;
    return NextResponse.json({ app: safe });
  } catch (e) {
    return handleApiError(e, "/api/apps/[id]");
  }
}
