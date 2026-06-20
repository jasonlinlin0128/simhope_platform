import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { buildIncrements, ANON_TRACK_EVENTS } from "@/lib/trackEvents.mjs";
import { getServerToolIdSet } from "@/lib/serverCatalog";

/**
 * POST /api/track — 第一方使用追蹤（匿名匯總計數，無個人行為記錄）。
 * body: { event, toolId? }
 * 寫 analytics/totals（累計，首頁 O(1) 讀）+ analytics_daily/{YYYYMMDD}（每日 + byTool）。
 * 只 Admin SDK 寫（firestore.rules client 一律 deny）；per-IP 60/min 限流防灌水。
 */
export async function POST(req) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`track:${ip}`, { limit: 60, windowMs: 60000 }).ok) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    // 只收匿名事件白名單；tool_helpful 已改走需登入的 /api/tool-helpful。
    if (!ANON_TRACK_EVENTS.has(body.event)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // C3：有 toolId 的事件（開啟/瀏覽）→ 驗證 id 存在於目錄，擋掉任意字串在
    // aggregate doc 長孤兒 key。取目錄失敗/空 → 空 Set → 不過濾（fail-open）。
    let knownToolIds;
    if (body.toolId) {
      const idSet = await getServerToolIdSet();
      if (idSet.size > 0) knownToolIds = idSet;
    }
    const inc = buildIncrements(body.event, body.toolId, knownToolIds);
    if (!inc) return NextResponse.json({ ok: false }, { status: 400 });

    const { adminDb } = getAdmin();
    const now = new Date();
    const iso = now.toISOString().slice(0, 10); // "2026-06-10"
    const dayId = iso.replace(/-/g, ""); // "20260610"
    // TTL：~400 天後自動清（Jason 在 Console 建 analytics_daily/expireAt policy 後生效）
    const expireAt = new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000);

    const totalsRef = adminDb.collection("analytics").doc("totals");
    const dailyRef = adminDb.collection("analytics_daily").doc(dayId);
    const toolViewsRef = adminDb.collection("analytics").doc("toolViews");

    const totalsUpdate = {
      [inc.field]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const dailyUpdate = {
      date: iso,
      expireAt,
      [inc.field]: FieldValue.increment(1),
    };
    // 巢狀 map + merge：byTool.{toolId} 累加（用巢狀物件而非 "byTool.x" dotted key，
    // 因 set({merge:true}) 會把含點的 key 當字面欄位名而非巢狀路徑）。
    if (inc.byToolKey) {
      dailyUpdate.byTool = { [inc.byToolKey]: FieldValue.increment(1) };
    }

    const batch = adminDb.batch();
    batch.set(totalsRef, totalsUpdate, { merge: true });
    batch.set(dailyRef, dailyUpdate, { merge: true });
    // 全期 per-tool 瀏覽累計（首頁熱門用；與 daily byTool=opens 分開，不混語意）。
    // 註：helpful 累計已移至需登入的 /api/tool-helpful（tool_helpful 不再經此 route）。
    if (inc.viewToolKey) {
      batch.set(
        toolViewsRef,
        {
          [inc.viewToolKey]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/track 失敗：", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
