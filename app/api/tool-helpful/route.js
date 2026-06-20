import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { getServerToolIdSet } from "@/lib/serverCatalog";
import { buildVoteDocId } from "@/lib/helpfulVote.mjs";
import { buildIncrements } from "@/lib/trackEvents.mjs";

/**
 * POST /api/tool-helpful — 「👍 有幫助」需登入版（取代匿名 /api/track tool_helpful）。
 * IP 限流 → 驗 idToken(uid) → 驗 toolId 存在 → per-(uid,toolId) 去重（helpfulVotes，
 * server-only collection）→ **首次才** increment analytics/toolHelpful + totals + daily。
 * body: { toolId }。回 { counted:true }（首次）/ { counted:false }（已投過，冪等）。
 * 公開 badge / #61 儀表板續讀同一個 analytics/toolHelpful，計數語意不變、只是不再可匿名灌水。
 */
export async function POST(req) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`tool-helpful:${ip}`, { limit: 30, windowMs: 60000 }).ok) {
      return NextResponse.json(
        { error: "操作過於頻繁，請稍後再試" },
        { status: 429 },
      );
    }

    const { adminDb, adminAuth } = getAdmin();

    // 需登入：驗 Bearer idToken 取可信 uid（防匿名灌水）。
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token)
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    let uid;
    try {
      uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch {
      return NextResponse.json({ error: "登入憑證無效" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";
    if (!toolId)
      return NextResponse.json({ error: "缺少工具 id" }, { status: 400 });

    // 驗 toolId 存在於目錄（fail-open：取目錄失敗/空 → 不擋，避免誤殺正常回饋）。
    const idSet = await getServerToolIdSet();
    if (idSet.size > 0 && !idSet.has(toolId)) {
      return NextResponse.json({ error: "工具不存在" }, { status: 404 });
    }

    const voteId = buildVoteDocId(toolId, uid);
    if (!voteId)
      return NextResponse.json({ error: "無效的請求" }, { status: 400 });

    const inc = buildIncrements("tool_helpful", toolId); // {field:'toolHelpful', helpfulToolKey:toolId}
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    const dayId = iso.replace(/-/g, "");
    const expireAt = new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000);

    const voteRef = adminDb.collection("helpfulVotes").doc(voteId);
    const totalsRef = adminDb.collection("analytics").doc("totals");
    const dailyRef = adminDb.collection("analytics_daily").doc(dayId);
    const toolHelpfulRef = adminDb.collection("analytics").doc("toolHelpful");

    // 交易：去重 + 計數原子化（防同一使用者連點 / 並發造成重複計）。
    const counted = await adminDb.runTransaction(async (tx) => {
      const vs = await tx.get(voteRef);
      if (vs.exists) return false; // 已投過 → 不重複計
      tx.set(voteRef, {
        toolId,
        uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(
        totalsRef,
        {
          [inc.field]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(
        dailyRef,
        { date: iso, expireAt, [inc.field]: FieldValue.increment(1) },
        { merge: true },
      );
      tx.set(
        toolHelpfulRef,
        {
          [inc.helpfulToolKey]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return true;
    });

    return NextResponse.json({ counted });
  } catch (e) {
    console.error("/api/tool-helpful 失敗：", e);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
