import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireRole } from "@/lib/apiAuth.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { getAdmin } from "@/lib/firebaseAdmin";
import { notify } from "@/lib/notify";
import {
  ANNOUNCE_STATUSES,
  buildAnnounceMessage,
} from "@/lib/announcePublish.mjs";

/**
 * POST /api/admin/announce-tool — admin-only。工具發布（轉入 live/beta/new）即時發 Discord 公告。
 * IP 限流 → auth(admin) → 讀 tool → 權威去重(announcedAt/status) → notify + 寫 announcedAt。
 * 冪等：已公告 or 非公開狀態 → { announced:false } no-op（200）。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`announce-tool:${ip}`, { limit: 30, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["admin"], {
      forbiddenMessage: "需要管理員權限",
    });

    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new HttpError(400, "缺少工具 id");

    const { adminDb } = getAdmin();
    const ref = adminDb.collection("tools").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "工具不存在");

    const data = snap.data();
    // 權威去重：已公告 or 非公開狀態 → no-op
    if (data.announcedAt || !ANNOUNCE_STATUSES.includes(data.status)) {
      return NextResponse.json({ announced: false });
    }

    // best-effort 公告（notify 內部吞錯）；無論結果都寫 announcedAt 防重發。
    await notify(buildAnnounceMessage({ ...data, id }));
    await ref.set(
      { announcedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return NextResponse.json({ announced: true });
  } catch (e) {
    return handleApiError(e, "/api/admin/announce-tool");
  }
}
