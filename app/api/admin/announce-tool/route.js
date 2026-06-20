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
 * IP 限流 → auth(admin) → 讀 tool → 權威去重(announcedAt/status) → notify →（成功才）寫 announcedAt。
 * 冪等：已公告 or 非公開狀態 → { announced:false } no-op（200）；notify 失敗也回 { announced:false } 且不標記。
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

    // 只有 Discord 真的送出成功才寫 announcedAt。
    // 暫時性 webhook 中斷（notify 回 false）→ 不標記 → 之後重新發布可再試，
    // 不會把「沒送成功」的工具誤記成已公告而永久遺失即時通知。
    const sent = await notify(buildAnnounceMessage({ ...data, id }));
    if (sent) {
      await ref.set(
        { announcedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    return NextResponse.json({ announced: sent });
  } catch (e) {
    return handleApiError(e, "/api/admin/announce-tool");
  }
}
