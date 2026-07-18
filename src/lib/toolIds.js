import { getAdmin } from "@/lib/firebaseAdmin";

/**
 * 全部工具 id 的集合（Admin SDK，繞過 rules）。給 /api/track、/api/tool-helpful
 * 驗證 toolId 用——**不能**改用 serverCatalog 的匿名查詢：那支收斂後只看得到
 * visibility=PUBLIC_ALL，受限 app（BY_RULE）的瀏覽/開啟計數會被當成非法 id 靜默丟棄。
 *
 * 失敗 → 空 Set；呼叫端把「空 Set」視為「無法判定」而不過濾（fail-open，沿用既有語意）。
 * @returns {Promise<Set<string>>}
 */
export async function getAllToolIdSet() {
  try {
    const { adminDb } = getAdmin();
    const snap = await adminDb.collection("tools").select().get(); // 只取 id，不拉欄位
    return new Set(snap.docs.map((d) => d.id));
  } catch {
    return new Set();
  }
}
