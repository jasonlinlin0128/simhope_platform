import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { enforceRateLimit } from "@/lib/rateLimit.mjs";
import { buildAuditEntry, writeAudit } from "@/lib/auditLog.mjs";
import {
  aliasEmail,
  checkPasswordPolicy,
  validateActivateInput,
  activationGate,
  applyFailedAttempt,
  checkLease,
} from "@/lib/activation.mjs";

/**
 * POST /api/auth/activate — 首次啟用：員編＋統編（一次性弱驗證）→ 設個人密碼 → 登入。
 * Body: { employee_id, tax_id, new_password }
 * 流程規格：docs/portal/authentication-flow.md §2。
 *
 * 安全設計（順序即防線）：
 * 1. per-IP 限流（best-effort；serverless 多實例下不是可靠防線）
 * 2. 統編先驗——統編錯不回應員編是否存在，防「只憑員編探測」；對存在的員編在
 *    transaction 內記失敗次數，5 次鎖 15 分（已鎖定不再延長，防可用性 DoS）
 *    ⚠️ 統編是全員共用的半公開值 → 這裡擋的是外部亂猜，不是知道統編的內部人
 * 3. gate + activating lease 在同一 transaction（CAS）：併發只有一個贏
 * 4. lease fencing：createUser 續跑與 finalize 前都再驗租約——慢請求不得在別人
 *    完成啟用後回頭重設「已啟用帳號」的密碼
 */
async function requireLease(adminDb, empRef, lease) {
  const snap = await empRef.get();
  const r = checkLease(snap.exists ? snap.data() : null, lease);
  if (!r.ok) throw new HttpError(r.code, r.error);
}
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
        if (!snap.exists) return;
        const penalty = applyFailedAttempt(snap.data(), now);
        if (penalty) tx.set(empRef, penalty, { merge: true }); // null＝已鎖定，不延長
      });
      await writeAudit(
        adminDb,
        buildAuditEntry({
          action: "AUTH_LOGIN_FAIL",
          actorEmployeeId: employee_id,
          target: employee_id,
          detail: { reason: "wrong_tax_id" },
          result: "denied",
          request,
          now,
        }),
      );
      throw new HttpError(401, "啟用資訊不正確");
    }

    const policy = checkPasswordPolicy(new_password, {
      employeeId: employee_id,
      taxId: tax_id,
    });
    if (!policy.ok) throw new HttpError(400, policy.error);

    // 閘門 + activating CAS：同一 transaction，併發只有一個贏（輸家 409）。
    // lease＝這一輪啟用的所有權憑證，後續每個破壞性動作前都要再驗一次（見 checkLease）。
    const lease = randomUUID();
    const gate = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(empRef);
      const g = activationGate(snap.exists ? snap.data() : null, now);
      if (g.ok) {
        tx.set(
          empRef,
          {
            activating_at: now,
            activating_lease: lease,
            activation_attempts: 0,
            locked_until: null,
          },
          { merge: true },
        );
        g.name = snap.data().name;
      }
      return g;
    });
    if (!gate.ok) throw new HttpError(gate.code, gate.error);

    const email = aliasEmail(employee_id);
    let uid;
    try {
      ({ uid } = await adminAuth.createUser({ email, password: new_password }));
    } catch (e) {
      if (e?.code !== "auth/email-already-exists") throw e;
      // 續跑路徑：alias 帳號已存在＝前次啟用在 createUser 之後中斷（帳號可能已可登入）。
      // 重設密碼前先驗租約——否則一個慢請求可能在別人 finalize 成 activated 之後，
      // 才回頭把「已啟用帳號」的密碼改掉（帳號接管）。
      await requireLease(adminDb, empRef, lease);
      ({ uid } = await adminAuth.getUserByEmail(email));
      await adminAuth.updateUser(uid, { password: new_password });
      await adminAuth.revokeRefreshTokens(uid); // 踢掉半殘 session
    }

    await adminDb
      .collection("users")
      .doc(uid)
      .set(
        {
          role: "viewer",
          employee_id,
          displayName: gate.name ?? employee_id,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    // finalize 也在 transaction 內驗租約：租約已被別人接手（或已被啟用）就不寫、不發 token。
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(empRef);
      const ok = checkLease(snap.exists ? snap.data() : null, lease);
      if (!ok.ok) throw new HttpError(ok.code, ok.error);
      tx.set(
        empRef,
        {
          activated: true,
          uid,
          activating_at: FieldValue.delete(),
          activating_lease: FieldValue.delete(),
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    await writeAudit(
      adminDb,
      buildAuditEntry({
        action: "AUTH_ACTIVATE",
        actorUid: uid,
        actorEmployeeId: employee_id,
        target: employee_id,
        detail: { resumed: gate.resume },
        request,
        now,
      }),
    );

    const customToken = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ customToken });
  } catch (e) {
    return handleApiError(e, "/api/auth/activate");
  }
}
