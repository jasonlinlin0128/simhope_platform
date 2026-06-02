import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { notify } from "@/lib/notify";

/**
 * POST /api/request
 * Body: { type: 'access'|'feature', message: string, name?: string, email?: string }
 * Header: Authorization: Bearer <Firebase ID token>
 * 驗 token → 寫 requests（uid 取自 token，可信）→ Discord 通知。通知失敗不影響寫入結果。
 */
export async function POST(req) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "未登入" }, { status: 401 });

    const { adminAuth, adminDb } = getAdmin();
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "token 無效" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body.type === "feature" ? "feature" : "access";
    const message = String(body.message || "").slice(0, 2000);
    const name = String(body.name || decoded.name || "").slice(0, 100);
    const email = decoded.email || body.email || "";

    const ref = await adminDb.collection("requests").add({
      type,
      uid: decoded.uid,
      email,
      name,
      message,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    const label = type === "access" ? "🔑 申請開發者" : "💡 提需求";
    await notify(
      `${label}\n來自：${name || email || decoded.uid}\n內容：${message || "(無留言)"}\nrequest id: ${ref.id}`,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/request 失敗：", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
