import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { enforceRateLimit } from "@/lib/rateLimit.mjs";
import {
  aliasEmail,
  checkPasswordPolicy,
  validateActivateInput,
  activationGate,
  applyFailedAttempt,
} from "@/lib/activation.mjs";

/**
 * POST /api/auth/activate — 首次啟用：員編＋統編（一次性弱驗證）→ 設個人密碼 → 登入。
 * Body: { employee_id, tax_id, new_password }
 * 流程規格：docs/portal/authentication-flow.md §2。
 *
 * 安全設計（順序即防線）：
 * 1. per-IP 限流（best-effort 輔助；主要防暴力是 transaction 內的 per-員編 attempts）
 * 2. 統編先驗——統編錯就不碰 employees 文件狀態回應，防「只憑員編探測存在/已啟用」
 *    （但仍在 transaction 內對存在的員編記失敗次數，達 5 次鎖 15 分）
 * 3. gate 與 activating 標記在同一 transaction（CAS）：併發雙請求只有一個贏
 * 4. createUser 冪等：alias email 已存在＝前次中斷的續跑（activating 標記是所有權證明）
 */
export async function POST(request) {
  try {
    enforceRateLimit(request, "activate", {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    const body = await request.json().catch(() => ({}));
    const input = validateActivateInput(body);
    if (!input.ok) throw new HttpError(401, input.error);
    const { employee_id, tax_id, new_password } = body;

    const TAX_ID = process.env.COMPANY_TAX_ID;
    if (!TAX_ID) throw new HttpError(503, "啟用服務尚未開通"); // fail-closed：env 未設不放行

    const { adminAuth, adminDb } = getAdmin();
    const empRef = adminDb.collection("employees").doc(employee_id);
    const now = Date.now();

    if (tax_id !== TAX_ID) {
      // 統編錯：對存在的員編記失敗（transaction 內 check-and-increment）；回應一律統一 401
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(empRef);
        if (snap.exists)
          tx.set(empRef, applyFailedAttempt(snap.data(), now), { merge: true });
      });
      throw new HttpError(401, "啟用資訊不正確");
    }

    const policy = checkPasswordPolicy(new_password, {
      employeeId: employee_id,
      taxId: tax_id,
    });
    if (!policy.ok) throw new HttpError(400, policy.error);

    // 閘門 + activating CAS：同一 transaction，併發只有一個贏（輸家 409）
    const gate = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(empRef);
      const g = activationGate(snap.exists ? snap.data() : null, now);
      if (g.ok) {
        tx.set(
          empRef,
          { activating_at: now, activation_attempts: 0, locked_until: null },
          { merge: true },
        );
      }
      return g;
    });
    if (!gate.ok) throw new HttpError(gate.code, gate.error);

    // createUser 冪等：email 已存在＝前次啟用在 createUser 後中斷 → 以本次密碼續跑。
    // 安全：能走到這裡代表統編正確＋贏得 activating CAS＋employees.activated 仍為 false，
    // 該 alias 帳號從未被使用過，重設密碼不影響任何真實使用者。
    const email = aliasEmail(employee_id);
    let uid;
    try {
      ({ uid } = await adminAuth.createUser({ email, password: new_password }));
    } catch (e) {
      if (e?.code !== "auth/email-already-exists") throw e;
      ({ uid } = await adminAuth.getUserByEmail(email));
      await adminAuth.updateUser(uid, { password: new_password });
    }

    const empData = (await empRef.get()).data();
    await adminDb
      .collection("users")
      .doc(uid)
      .set(
        {
          role: "viewer",
          employee_id,
          displayName: empData?.name ?? employee_id,
          createdAt: Date.now(),
        },
        { merge: true },
      );
    await empRef.set(
      {
        activated: true,
        uid,
        activating_at: FieldValue.delete(),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const customToken = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ customToken });
  } catch (e) {
    return handleApiError(e, "/api/auth/activate");
  }
}
