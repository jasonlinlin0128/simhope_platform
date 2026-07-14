// src/lib/serverCatalog.js
// Server-only 公開資料抓取（RSC 公開頁用）。Firestore REST + ISR 快取，
// 匿名讀（受 firestore.rules 約束，只回公開資料）；不用 firebase client SDK。
import { docToObject } from "./firestoreValue.mjs";
import { normalizeMetrics } from "./metrics.mjs";
import { pickNumericFields } from "./numericMap.mjs";
import { DEFAULT_SITE } from "./siteDefaults";

const PROJECT_ID = "simhope-platform";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const REVALIDATE = 300; // 5 分鐘 ISR

// 跑一個 structuredQuery（:runQuery），回 docToObject 後的陣列。
async function runQuery(structuredQuery) {
  const res = await fetch(`${BASE}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`runQuery ${res.status}`);
  const rows = await res.json();
  return rows.filter((r) => r.document).map((r) => docToObject(r.document));
}

/**
 * 公開工具目錄（visibility=PUBLIC_ALL 且 status in [live,beta,new,dev,terminated]）。
 * 失敗 → []（不 crash 頁面）。
 *
 * ⚠️ 這是**匿名** REST 讀，受 firestore.rules 約束（不是 Admin SDK）。rules 只放行
 * PUBLIC_ALL，而 Firestore 對 query 的規則檢查要求「查詢條件本身可證明安全」——
 * 因此這裡**必須**帶 visibility 過濾，否則整個查詢會被拒（首頁直接變 0 個工具）。
 * 受限的 app（BY_RULE/HIDDEN）不經這裡：由 /api/apps 以 Admin SDK 按身分過濾後才下發。
 *
 * 相依：所有既有 tools 必須先跑 scripts/migrate-tools-portal-fields.mjs --apply
 * 補上 visibility（缺欄位的文件無法被等值查詢命中 → 會從清單消失）。
 * @returns {Promise<object[]>}
 */
export async function getServerCatalog() {
  try {
    return await runQuery({
      from: [{ collectionId: "tools" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "visibility" },
                op: "EQUAL",
                value: { stringValue: "PUBLIC_ALL" },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "status" },
                op: "IN",
                value: {
                  arrayValue: {
                    values: ["live", "beta", "new", "dev", "terminated"].map(
                      (s) => ({
                        stringValue: s,
                      }),
                    ),
                  },
                },
              },
            },
          ],
        },
      },
    });
  } catch {
    return [];
  }
}

// getServerToolIdSet 已移除（入口網 ACL 收斂後，這支只看得到 PUBLIC_ALL → 受限 app 的
// 計數會被當成非法 id 丟棄）。驗證 toolId 請用 src/lib/toolIds.js 的 getAllToolIdSet（Admin SDK）。

/**
 * 已核准痛點卡（approval == approved）。空 → DEFAULT_SITE.painCards 後備；失敗 → []。
 * @returns {Promise<object[]>}
 */
export async function getServerPainCards() {
  try {
    const cards = await runQuery({
      from: [{ collectionId: "painCards" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "approval" },
          op: "EQUAL",
          value: { stringValue: "approved" },
        },
      },
    });
    return cards.length === 0 ? DEFAULT_SITE.painCards || [] : cards;
  } catch {
    return [];
  }
}

/**
 * 使用累計數（analytics/totals doc）。doc 不存在 / 失敗 → 全 0。
 * @returns {Promise<{toolOpen:number,toolView:number,search:number,requestSubmit:number}>}
 */
export async function getServerMetrics() {
  try {
    const res = await fetch(`${BASE}/analytics/totals`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return normalizeMetrics({});
    return normalizeMetrics(docToObject(await res.json()));
  } catch {
    return normalizeMetrics({});
  }
}

/**
 * 全期 per-tool 瀏覽數（analytics/toolViews doc）。doc 不存在 / 失敗 → {}。
 * 只回數值欄位（濾掉 updatedAt 等非數值 key）。
 * @returns {Promise<Record<string, number>>}
 */
export async function getServerToolViews() {
  try {
    const res = await fetch(`${BASE}/analytics/toolViews`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return {};
    return pickNumericFields(docToObject(await res.json()));
  } catch {
    return {};
  }
}

/**
 * 全期 per-tool 有幫助數（analytics/toolHelpful doc）。doc 不存在 / 失敗 → {}。
 * 只回數值欄位（濾掉 updatedAt 等非數值 key）。鏡像 getServerToolViews()。
 * @returns {Promise<Record<string, number>>}
 */
export async function getServerToolHelpful() {
  try {
    const res = await fetch(`${BASE}/analytics/toolHelpful`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return {};
    return pickNumericFields(docToObject(await res.json()));
  } catch {
    return {};
  }
}
