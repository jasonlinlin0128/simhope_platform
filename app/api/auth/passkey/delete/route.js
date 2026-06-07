import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/passkeyServer";
import { HttpError } from "@/lib/httpError.mjs";

/**
 * POST /api/auth/passkey/delete
 * 需登入。刪除自己的 passkey。
 * Body: { credentialID }
 */
export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    const { credentialID } = await request.json();
    if (!credentialID) throw new HttpError(400, "缺少 credentialID");

    const { adminDb } = getAdmin();
    const ref = adminDb.collection("passkeys").doc(credentialID);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "找不到此 passkey");
    if (snap.data().uid !== decoded.uid)
      throw new HttpError(403, "不能刪除別人的 passkey");

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
