// src/lib/serverCatalog.js
// Server-only 公開資料抓取（RSC 公開頁用）。Firestore REST + ISR 快取，
// 匿名讀（受 firestore.rules 約束，只回公開資料）；不用 firebase client SDK。
import { docToObject } from "./firestoreValue.mjs";
import { normalizeMetrics } from "./metrics.mjs";
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
 * 公開工具目錄（status in [live,beta,new,dev,terminated]）。shape 同 db.getCatalog()。
 * 失敗 → []（不 crash 頁面）。
 * @returns {Promise<object[]>}
 */
export async function getServerCatalog() {
  try {
    return await runQuery({
      from: [{ collectionId: "tools" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "IN",
          value: {
            arrayValue: {
              values: ["live", "beta", "new", "dev", "terminated"].map((s) => ({
                stringValue: s,
              })),
            },
          },
        },
      },
    });
  } catch {
    return [];
  }
}

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
    const obj = docToObject(await res.json());
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number") out[k] = v;
    }
    return out;
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
    const obj = docToObject(await res.json());
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
