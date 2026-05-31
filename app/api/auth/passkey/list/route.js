import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/passkeyServer";

/**
 * POST /api/auth/passkey/list
 * 需登入。回該使用者已註冊的 passkeys（不含公鑰）。
 */
export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    const { adminDb } = getAdmin();
    const snap = await adminDb
      .collection("passkeys")
      .where("uid", "==", decoded.uid)
      .get();
    const passkeys = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        deviceName: x.deviceName || "未命名裝置",
        createdAt: x.createdAt || null,
        lastUsedAt: x.lastUsedAt || null,
      };
    });
    return NextResponse.json({ passkeys });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
