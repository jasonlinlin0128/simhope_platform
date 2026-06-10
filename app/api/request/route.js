import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { notify } from "@/lib/notify";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";

/**
 * POST /api/request
 * - type='access'（開發者申請）：需 Authorization: Bearer <idToken>；uid 取自 token；
 *   寫 requests（reason）+ 設 users/{uid}.devStatus='pending'（Admin SDK）。
 * - type='feature'（提需求）：免登入；name 必填；寫 requests（無 uid）。
 * 兩者：寫入後呼叫 notify()（失敗不擋）；per-IP 限流。
 */
export async function POST(req) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`request:${ip}`, { limit: 5, windowMs: 60000 }).ok) {
      return NextResponse.json(
        { error: "操作過於頻繁，請稍後再試" },
        { status: 429 },
      );
    }

    const { adminDb, adminAuth } = getAdmin();
    const body = await req.json().catch(() => ({}));
    const type = body.type === "access" ? "access" : "feature";

    if (type === "access") {
      // 開發者申請：必須登入
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!token)
        return NextResponse.json({ error: "請先登入" }, { status: 401 });
      let decoded;
      try {
        decoded = await adminAuth.verifyIdToken(token);
      } catch {
        return NextResponse.json({ error: "登入憑證無效" }, { status: 401 });
      }
      const reason = String(body.reason || body.message || "").slice(0, 1000);
      if (!reason)
        return NextResponse.json({ error: "請填寫申請理由" }, { status: 400 });
      const name = String(decoded.name || "").slice(0, 100);
      const email = String(decoded.email || "").slice(0, 200);

      const ref = await adminDb.collection("requests").add({
        type: "access",
        uid: decoded.uid,
        email,
        name,
        reason,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });
      // 記錄申請狀態到 user 文件（Admin SDK，可信）
      await adminDb
        .collection("users")
        .doc(decoded.uid)
        .set({ devStatus: "pending" }, { merge: true });

      await notify(
        `🔑 開發者申請\n來自：${name || email || decoded.uid}\n理由：${reason}\nrequest id: ${ref.id}`,
      );
      return NextResponse.json({ ok: true });
    }

    // type === 'feature'：免登入提需求（登入則補可信 uid，讓使用者能在 /my-requests 看狀態）
    const name = String(body.name || "")
      .slice(0, 50)
      .trim();
    const contact = String(body.contact || "").slice(0, 100);
    const message = String(body.message || "")
      .slice(0, 1000)
      .trim();
    if (!name)
      return NextResponse.json({ error: "請填寫姓名" }, { status: 400 });
    if (!message)
      return NextResponse.json({ error: "請填寫需求內容" }, { status: 400 });

    // 有帶 Bearer token 且驗證通過 → 附上 server 端可信 uid；否則匿名（不拒絕）。
    let featureUid = null;
    const featAuth = req.headers.get("authorization") || "";
    const featToken = featAuth.startsWith("Bearer ") ? featAuth.slice(7) : "";
    if (featToken) {
      try {
        featureUid = (await adminAuth.verifyIdToken(featToken)).uid;
      } catch {
        featureUid = null; // 驗失敗 → 當匿名
      }
    }

    const featureDoc = {
      type: "feature",
      name,
      contact,
      message,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    };
    if (featureUid) featureDoc.uid = featureUid;
    const ref = await adminDb.collection("requests").add(featureDoc);
    await notify(
      `💡 提需求\n來自：${name}${contact ? `（${contact}）` : ""}\n內容：${message}\nrequest id: ${ref.id}`,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/request 失敗：", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
