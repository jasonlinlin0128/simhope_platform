import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { requireRole } from "@/lib/apiAuth.mjs";
import { buildAuditEntry } from "@/lib/auditLog.mjs";

const ROLES = ["viewer", "developer", "admin"];

/**
 * POST /api/admin/set-role — admin 變更某人的角色（＋可選 devStatus）。
 * Body: { uid, role, devStatus? }
 *
 * 存在的唯一理由是稽核：權限變更必須留紀錄（規格明訂），而 client 直接 updateDoc
 * 到 users/{uid} 是繞過伺服器的——沒有 server hop 就不可能有可信的 audit。
 * 因此角色授予一律走這裡。
 *
 * 與其他 audit 不同，這裡的稽核寫入**不是 fail-soft**：稽核失敗＝整個權限變更失敗
 * （寧可授權沒生效，也不要有一筆沒人知道的提權）。
 */
export async function POST(request) {
  try {
    const actor = await requireRole(request, ["admin"], {
      forbiddenMessage: "需要管理員權限",
    });
    const { adminDb } = getAdmin();

    const body = await request.json().catch(() => ({}));
    const uid = typeof body.uid === "string" ? body.uid : "";
    const role = body.role;
    const devStatus = body.devStatus;
    if (!uid) throw new HttpError(400, "缺少 uid");
    if (!ROLES.includes(role)) throw new HttpError(400, "不支援的角色");
    if (
      devStatus !== undefined &&
      !["approved", "rejected"].includes(devStatus)
    ) {
      throw new HttpError(400, "不支援的 devStatus");
    }

    const ref = adminDb.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "查無此使用者");
    const before = snap.data().role ?? "viewer";

    const entry = buildAuditEntry({
      action: "PERMISSION_CHANGE",
      actorUid: actor.uid,
      actorEmployeeId: actor.employeeId ?? null,
      target: uid,
      detail: { before, after: role, devStatus: devStatus ?? null },
      request,
    });

    // 稽核與變更同一個 batch：要嘛兩者都成立，要嘛都不成立。
    const batch = adminDb.batch();
    batch.set(
      ref,
      { role, ...(devStatus !== undefined ? { devStatus } : {}) },
      { merge: true },
    );
    batch.set(adminDb.collection("audit_logs").doc(), entry);
    await batch.commit();

    return NextResponse.json({ ok: true, before, after: role });
  } catch (e) {
    return handleApiError(e, "/api/admin/set-role");
  }
}
