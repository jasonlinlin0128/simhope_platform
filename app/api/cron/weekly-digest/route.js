import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { notify } from "@/lib/notify";
import { selectRecentTools, buildDigestMessage } from "@/lib/weeklyDigest.mjs";

const PUBLIC_STATUSES = ["live", "beta", "new"];

/**
 * GET /api/cron/weekly-digest — Vercel cron 每週觸發。
 * 驗 CRON_SECRET → 讀公開工具 → 篩近 7 天 → Discord 摘要（空週不發）。
 */
export async function GET(request) {
  // Vercel cron 帶 Authorization: Bearer <CRON_SECRET>。未設 secret 一律 401（fail-safe）。
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const { adminDb } = getAdmin();
    const snap = await adminDb
      .collection("tools")
      .where("status", "in", PUBLIC_STATUSES)
      .get();
    const tools = [];
    snap.forEach((d) => {
      const data = d.data();
      tools.push({
        id: d.id,
        title: data.title,
        tagline: data.tagline,
        status: data.status,
        createdAtMs: data.createdAt?.toMillis?.() ?? null,
      });
    });

    const recent = selectRecentTools(tools, Date.now());
    const message = buildDigestMessage(recent);
    if (message) await notify(message);
    return NextResponse.json({ ok: true, count: recent.length });
  } catch (e) {
    console.error("/api/cron/weekly-digest 失敗：", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
