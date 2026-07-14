import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { handleApiError } from "@/lib/apiError.mjs";
import { getSubject } from "@/lib/portalSubject";
import { filterVisibleApps, LISTABLE_STATUSES } from "@/lib/appAccess.mjs";

export const dynamic = "force-dynamic"; // 依身分而異 → 絕不可被快取共用

/** 只下發卡片需要的欄位——受限 app 的內部資訊（allowed_*、health_check_url…）不出門。 */
function toCard(app) {
  return {
    id: app.id,
    title: app.title ?? app.name ?? app.id,
    desc: app.desc ?? app.description ?? "",
    icon: app.icon ?? null,
    category: app.category ?? null,
    tags: app.tags ?? [],
    status: app.status,
    type: app.type ?? null,
    authentication_mode: app.authentication_mode ?? null,
    visibility: app.visibility ?? "PUBLIC_ALL",
  };
}

/**
 * GET /api/apps — 依身分過濾後的應用清單（入口網主清單）。
 *
 * 未登入＝匿名主體，只會拿到 PUBLIC_ALL；登入者另外拿到符合 ACL 的受限 app。
 * **過濾在伺服器端完成**：BY_RULE/HIDDEN 的 app 若不該給你看，連 id 都不會出現在 payload
 * （前端沒有東西可以竄改——這是規格「授權判斷不得只放前端」的執行點）。
 */
export async function GET(request) {
  try {
    const subject = await getSubject(request);
    const { adminDb } = getAdmin();

    const snap = await adminDb
      .collection("tools")
      .where("status", "in", LISTABLE_STATUSES)
      .get();
    const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({
      apps: filterVisibleApps(subject, apps).map(toCard),
    });
  } catch (e) {
    return handleApiError(e, "/api/apps");
  }
}
