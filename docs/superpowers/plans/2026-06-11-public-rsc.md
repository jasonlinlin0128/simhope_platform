# C-2 公開頁 RSC 轉換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/` 與 `/hub` 從全 client-render 改 server-render——server 端用 Firestore REST 抓公開資料渲染進初始 HTML，互動留在 client island，首屏不閃。

**Architecture:** server component 抓資料（REST + 300s ISR 快取）→ 當 props 傳給 client island；island 初次渲染在 server SSR 即有卡片。新增純函式 REST value parser（TDD）+ server 資料層 + 兩個 client 島；既有 client `db.js` 不動邏輯。

**Tech Stack:** Next.js 16 App Router（RSC / `next/og` 無關）/ React 19 / Firestore REST API / Fuse.js / node:test。

**慣例：** Conventional Commits，每個 commit 結尾必加 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

### Task 1: `firestoreValue.mjs` — Firestore REST value 轉換（TDD）

**Files:**

- Create: `src/lib/firestoreValue.mjs`
- Test: `src/lib/firestoreValue.test.mjs`

- [ ] **Step 1: 寫失敗測試**

Create `src/lib/firestoreValue.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromFirestoreValue,
  fromFirestoreFields,
  docToObject,
} from "./firestoreValue.mjs";

test("純量型別轉換", () => {
  assert.equal(fromFirestoreValue({ stringValue: "hi" }), "hi");
  assert.equal(fromFirestoreValue({ integerValue: "42" }), 42); // REST 給字串 → Number
  assert.equal(fromFirestoreValue({ doubleValue: 1.5 }), 1.5);
  assert.equal(fromFirestoreValue({ booleanValue: true }), true);
  assert.equal(fromFirestoreValue({ nullValue: null }), null);
  assert.equal(
    fromFirestoreValue({ timestampValue: "2026-06-11T00:00:00Z" }),
    "2026-06-11T00:00:00Z",
  );
});

test("array 遞迴轉換（含空）", () => {
  assert.deepEqual(
    fromFirestoreValue({
      arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] },
    }),
    ["a", "b"],
  );
  assert.deepEqual(fromFirestoreValue({ arrayValue: {} }), []);
});

test("map 遞迴轉換", () => {
  assert.deepEqual(
    fromFirestoreValue({
      mapValue: {
        fields: { x: { integerValue: "1" }, y: { stringValue: "z" } },
      },
    }),
    { x: 1, y: "z" },
  );
});

test("docToObject：id 取 name 末段 + fields 展開", () => {
  const doc = {
    name: "projects/p/databases/(default)/documents/tools/abc123",
    fields: {
      title: { stringValue: "翻譯" },
      status: { stringValue: "live" },
      tags: { arrayValue: { values: [{ stringValue: "t1" }] } },
    },
  };
  assert.deepEqual(docToObject(doc), {
    id: "abc123",
    title: "翻譯",
    status: "live",
    tags: ["t1"],
  });
});

test("缺欄位安全", () => {
  assert.deepEqual(docToObject({ name: "x/y/tools/i" }), { id: "i" });
  assert.deepEqual(fromFirestoreFields(), {});
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './firestoreValue.mjs'`

- [ ] **Step 3: 寫實作**

Create `src/lib/firestoreValue.mjs`:

```js
// src/lib/firestoreValue.mjs
// Firestore REST API 回傳的是 typed value（{stringValue}/{integerValue}/...）。
// 這裡轉成一般 JS 值。純函式、無 I/O，node:test 可測。

/**
 * @param {object} v  Firestore REST typed value，例如 { stringValue: "x" }
 * @returns {*} 對應的 JS 值（未知型別 → undefined）
 */
export function fromFirestoreValue(v) {
  if (v == null) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue); // REST 以字串給整數
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue; // 保留 ISO 字串
  if ("arrayValue" in v)
    return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  return undefined;
}

/**
 * REST 的 fields 物件（{ key: typedValue }）→ 一般物件。
 * @param {object} [fields]
 * @returns {object}
 */
export function fromFirestoreFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
  return out;
}

/**
 * REST document（有 name + fields）→ { id, ...fields }。id = name 路徑末段。
 * @param {{name?: string, fields?: object}} doc
 * @returns {object}
 */
export function docToObject(doc) {
  const id = doc.name ? doc.name.split("/").pop() : undefined;
  return { id, ...fromFirestoreFields(doc.fields || {}) };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（既有 + 新 5 tests 全過）

- [ ] **Step 5: Commit**

```bash
git add src/lib/firestoreValue.mjs src/lib/firestoreValue.test.mjs
git commit -m "feat(rsc): firestoreValue — REST typed value → JS 轉換（純，TDD）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: `siteDefaults.js` — 抽出 `DEFAULT_SITE`（無 firebase 依賴）

**Files:**

- Create: `src/lib/siteDefaults.js`
- Modify: `src/lib/db.js`（移除 inline DEFAULT_SITE、改 import + re-export）

`DEFAULT_SITE` 現住 `db.js`（line 35-107），而 db.js 頂部 import firebase client SDK。把它搬到無依賴的模組，server 資料層才能安全 import。

- [ ] **Step 1: 建 siteDefaults.js**

Create `src/lib/siteDefaults.js`，內容＝把 `db.js` 第 35-107 行的 `export const DEFAULT_SITE = { ... };` 整塊**原樣**搬過來（檔案開頭加一行註解）：

```js
// src/lib/siteDefaults.js
// 站台預設內容（無 firebase 依賴）。painCards 供「painCards 集合為空」時後備用。
// 從 db.js 抽出，讓 server 資料層（serverCatalog.js）可 import 而不拉進 client SDK。

export const DEFAULT_SITE = {
  heroEyebrow: "企業 AI 轉型解決方案",
  heroDesc:
    "為公司各部門量身打造的實用 AI 小工具，專注於解決重複性行政作業、翻譯溝通限制與資料整理的瓶頸。免安裝、免學習，即開即用！",
  painChips: [
    { emoji: "⏱️", text: "省下 80% 時間" },
    { emoji: "💡", text: "免寫程式" },
    { emoji: "🔗", text: "無縫整合" },
  ],
  painCards: [
    {
      id: "pc1",
      folder: "跨國溝通專案",
      scenarios: ["生產現場", "跨國溝通"],
      before: "泰籍員工溝通靠比手畫腳，品質問題說不清楚，主管也搞不定",
      after: "即時雙語翻譯，泰文中文一鍵切換，現場手機直接用",
    },
    {
      id: "pc2",
      folder: "法務專案",
      scenarios: ["法務合約", "風險控管"],
      before: "合約文件幾十頁，看完要好幾小時，還不確定有沒有問題條款",
      after: "上傳合約，5 分鐘內 AI 標出所有異常條款與風險點",
    },
    {
      id: "pc3",
      folder: "日報表專案",
      scenarios: ["專案管理", "主管稽核"],
      before: "工時用 LINE 回報，每次月底統計都要重新整理，錯誤一堆",
      after: "每人直接線上填，主管即時查看進度，月報一鍵匯出",
    },
    {
      id: "pc6",
      folder: "知識庫專案",
      scenarios: ["技術傳承", "教育訓練"],
      before: "內部 SOP、技術文件散落各處，問老師傅不一定問得到",
      after: "把文件全部上傳，建立私有知識庫，直接用中文問問題",
    },
    {
      id: "pc7",
      folder: "行政作業專案",
      scenarios: ["行政簽核"],
      before: "PDF 簽名要列印、蓋章、再掃描，一份文件來回 20 分鐘",
      after: "電子簽章工具直接在 PDF 上加簽，批量處理省三倍時間",
    },
    {
      id: "pc8",
      scenarios: ["行政簽核"],
      before: "出差單還在用紙本，要跑三個單位簽核，回來才能報帳",
      after: "線上填出差申請，主管線上審核，總務即時確認",
    },
    {
      id: "pc9",
      scenarios: ["機敏資料", "資安控管"],
      before: "機敏文件影印無法追蹤，不知道誰在什麼時候印了什麼",
      after: "影印自動加時間戳浮水印，所有文件可追溯",
    },
    {
      id: "pc10",
      folder: "文書作業專案",
      scenarios: ["文書處理"],
      before: "掃描的 PDF 一堆空白頁，手動一頁一頁刪很浪費時間",
      after: "一鍵自動偵測並清除所有空白頁，省下大量整理時間",
    },
    {
      id: "pc11",
      folder: "日報表專案",
      scenarios: ["生產現場", "報表轉換"],
      before: "MasterCAM 報表格式不符需求，每次都要手動重整資料",
      after: "外掛一鍵匯出客製化加工報表，格式直接對齊需求",
    },
  ],
};
```

- [ ] **Step 2: 改 db.js — 移除 inline、改 import + re-export**

在 `src/lib/db.js`：

1. 刪掉第 35-107 行的整個 `export const DEFAULT_SITE = { ... };` 區塊。
2. 在頂部 import 區（`import { sortByCreatedAtDesc } from "./requests.mjs";` 之後）加：

```js
import { DEFAULT_SITE } from "./siteDefaults";
export { DEFAULT_SITE }; // 對外 re-export，沿用 `import { DEFAULT_SITE } from "@/lib/db"`
```

（`getApprovedPainCards` 內 `DEFAULT_SITE.painCards` 的用法不變，靠 import 的 local binding。）

- [ ] **Step 3: build + 既有測試確認沒壞**

Run: `npm run build`
Expected: 成功（DEFAULT_SITE 仍解析得到）

Run: `npm run test:unit`
Expected: PASS（無回歸）

- [ ] **Step 4: Commit**

```bash
git add src/lib/siteDefaults.js src/lib/db.js
git commit -m "refactor(rsc): DEFAULT_SITE 抽到 siteDefaults（無 firebase 依賴）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: `serverCatalog.js` — server 端公開資料抓取（REST + ISR）

**Files:**

- Create: `src/lib/serverCatalog.js`

無乾淨純邏輯可單測（做 I/O）；靠 build + Task 7 的 dev 視覺驗。匿名 REST 已對 live prod 驗過（tools 18 / painCards 24 / analytics 可讀）。

- [ ] **Step 1: 寫實作**

Create `src/lib/serverCatalog.js`:

```js
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
```

- [ ] **Step 2: build 確認編得過**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add src/lib/serverCatalog.js
git commit -m "feat(rsc): serverCatalog — REST 抓公開 tools/painCards/metrics（300s ISR）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 4: `PainPointsExplorer.jsx` — 首頁痛點互動島

**Files:**

- Create: `src/components/PainPointsExplorer.jsx`

把首頁痛點區的互動（類別 chip 篩選 + 排序 + grid）抽成 client 島，吃 `painCards` props（移除 loading 判斷——資料由 server 傳入必有）。

- [ ] **Step 1: 寫元件**

Create `src/components/PainPointsExplorer.jsx`:

```jsx
"use client";

import { useState, useMemo } from "react";
import PainCard, { PAIN_CATEGORIES } from "@/components/PainCard";

/**
 * 痛點區互動島：類別 chip 篩選 + 卡片 grid。
 * @param {{painCards: object[]}} props  painCards 由 server 頁抓好傳入。
 */
export default function PainPointsExplorer({ painCards }) {
  const [selectedPainCategory, setSelectedPainCategory] = useState("all");

  const painCategoryCounts = useMemo(() => {
    const counts = { all: painCards.length };
    for (const key of Object.keys(PAIN_CATEGORIES)) {
      counts[key] = painCards.filter((c) => c.category === key).length;
    }
    return counts;
  }, [painCards]);

  const sortedPainCards = useMemo(() => {
    const filtered =
      selectedPainCategory === "all"
        ? painCards
        : painCards.filter((c) => c.category === selectedPainCategory);
    return [...filtered].sort((a, b) => {
      const aHas = !!a.relatedToolId;
      const bHas = !!b.relatedToolId;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return 0;
    });
  }, [painCards, selectedPainCategory]);

  return (
    <>
      {painCards.length > 0 && (
        <div className="mb-8 max-w-5xl mx-auto">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setSelectedPainCategory("all")}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-extrabold border-2 transition-all ${
                selectedPainCategory === "all"
                  ? "bg-[var(--color-clay-coral)] text-white border-[var(--color-clay-coral)] shadow-md"
                  : "bg-white dark:bg-gray-800 text-[var(--color-text-mid)] border-gray-200 dark:border-gray-700 hover:border-[var(--color-clay-coral)]/40"
              }`}
            >
              全部
              <span className="text-xs opacity-70">
                {painCategoryCounts.all}
              </span>
            </button>
            {Object.entries(PAIN_CATEGORIES).map(([key, cat]) => {
              const active = selectedPainCategory === key;
              const count = painCategoryCounts[key] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedPainCategory(key)}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-extrabold border-2 transition-all ${
                    active
                      ? "bg-[var(--color-clay-coral)] text-white border-[var(--color-clay-coral)] shadow-md"
                      : "bg-white dark:bg-gray-800 text-[var(--color-text-mid)] border-gray-200 dark:border-gray-700 hover:border-[var(--color-clay-coral)]/40 hover:-translate-y-0.5"
                  }`}
                >
                  <span>{cat.emoji}</span>
                  {cat.label}
                  <span className="text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedPainCards.map((c) => (
          <PainCard key={c.id} card={c} />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**（先建元件，下一 task 才接上）

```bash
git add src/components/PainPointsExplorer.jsx
git commit -m "feat(rsc): PainPointsExplorer client 島（痛點 chip 篩選 + grid）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 5: `app/page.jsx` → server component

**Files:**

- Modify: `app/page.jsx`（整檔改寫）

拿掉 `'use client'`/hooks，server 抓資料、渲染靜態 + `<PainPointsExplorer>`。`TESTIMONIALS`/`PAIN_CHIPS` 常數與所有靜態 JSX **原樣保留**，只把 `loading?"…":x` 改成 `x`、痛點互動段換成島。

- [ ] **Step 1: 整檔改寫**

把 `app/page.jsx` 整個替換為：

```jsx
import {
  getServerCatalog,
  getServerPainCards,
  getServerMetrics,
} from "@/lib/serverCatalog";
import { categoryCounts, CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";
import CategoryEntryCard from "@/components/CategoryEntryCard";
import MetricsBand from "@/components/MetricsBand";
import PainPointsExplorer from "@/components/PainPointsExplorer";
import Link from "next/link";
import RequestButton from "@/components/RequestButton";

export const revalidate = 300; // ISR 5 分鐘

const TESTIMONIALS = [
  {
    color: "var(--color-clay-purple)",
    stars: 5,
    quote:
      "以前跟泰籍同事講射料頭、鵝頸這些術語，翻譯軟體都翻不準，現在手機開連結直接用，師傅自己就操作，溝通順太多。",
    name: "壓鑄產線領班",
    dept: "生產現場",
    tool: "現場即時翻譯",
  },
  {
    color: "var(--color-clay-blue)",
    stars: 5,
    quote:
      "以前每天填報要 15 分鐘、月底還要人工彙整 Excel，現在 10 分鐘填完、月報自動產，我每天可以準時下班。",
    name: "加工部同仁",
    dept: "日報表",
    tool: "加工部日報表",
  },
  {
    color: "var(--color-clay-orange)",
    stars: 4,
    quote:
      "新進來查檢驗標準不用一直問老師傅了，手機直接看 SOP，主管審核後的版本一定準，照著做就對了。",
    name: "品保部新進",
    dept: "品保 / SOP",
    tool: "SOP-Interface APP",
  },
  {
    color: "var(--color-clay-coral)",
    stars: 5,
    quote:
      "PDF 合併拆分、Excel 清洗、QR Code 產生、檔案重命名⋯⋯以前要裝七八個工具，現在一個 app 全搞定，桌面乾淨多了。",
    name: "軍品業務部同仁",
    dept: "桌面工具",
    tool: "SimHope 工具箱",
  },
];

const PAIN_CHIPS = [
  { emoji: "📄", text: "文件找半天" },
  { emoji: "🌏", text: "語言溝通卡關" },
  { emoji: "📊", text: "報表要手動填" },
  { emoji: "🔍", text: "SOP 翻了找不到" },
  { emoji: "⏰", text: "工時統計耗時" },
];

export default async function Home() {
  const [tools, painCards, metrics] = await Promise.all([
    getServerCatalog(),
    getServerPainCards(),
    getServerMetrics(),
  ]);
  const counts = categoryCounts(tools);
  const activeCount = counts.all;

  return (
    <div className="flex flex-col gap-24 px-4 md:px-0">
      {/* ── HERO ── */}
      <section className="text-center pt-10 pb-4 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-clay-purple)]/10 text-[var(--color-clay-purple)] font-extrabold text-sm mb-6 border border-[var(--color-clay-purple)]/20 shadow-sm">
          🏭 專為公司同仁設計的 AI 工具中心
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-[var(--color-text-dark)] leading-tight mb-8">
          日常痛點太多？
          <br />
          這裡有
          <span className="bg-gradient-to-br from-[var(--color-clay-coral)] to-[var(--color-clay-orange)] bg-clip-text text-transparent">
            現成的 AI 解法
          </span>
        </h1>

        <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-2xl mx-auto">
          {PAIN_CHIPS.map((chip, idx) => (
            <span
              key={idx}
              className="flex items-center gap-1.5 bg-white/85 dark:bg-gray-800/85 border-2 border-black/7 dark:border-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-bold text-[var(--color-text-dark)] dark:text-gray-200 shadow-sm cursor-default hover:border-[var(--color-clay-purple)]/30 hover:shadow-md transition-all"
            >
              <span>{chip.emoji}</span> {chip.text}
            </span>
          ))}
        </div>

        <p className="text-lg md:text-xl text-[var(--color-text-mid)] font-semibold mb-10 max-w-2xl mx-auto leading-relaxed">
          這些工具都是根據公司實際流程開發的，不需要懂 AI，打開就能用。
          <br />
          目前收錄{" "}
          <strong className="text-[var(--color-text-dark)]">
            {activeCount} 個資源
          </strong>
          ，持續新增中。
        </p>

        <div className="flex gap-4 flex-wrap justify-center mb-16">
          <Link
            href="#catalog"
            className="px-8 py-4 rounded-full bg-gradient-to-br from-[var(--color-clay-coral)] to-[var(--color-clay-orange)] text-white font-extrabold text-lg shadow-[0_6px_20px_rgba(255,107,107,0.45)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(255,107,107,0.55)] transition-all"
          >
            🔧 馬上找工具
          </Link>
          <Link
            href="#painpoints"
            className="px-8 py-4 rounded-full bg-white dark:bg-gray-800 text-[var(--color-text-dark)] dark:text-gray-200 font-extrabold text-lg border-2 border-[#1e1b4b]/15 dark:border-white/10 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all"
          >
            👀 看看解決什麼問題
          </Link>
        </div>

        <MetricsBand
          stats={[
            { value: activeCount, label: "可用資源" },
            { value: metrics.toolOpen.toLocaleString(), label: "累計工具開啟" },
            { value: painCards.length, label: "痛點解法" },
          ]}
        />
      </section>

      {/* ── 5 類別入口 ── */}
      <section id="catalog" className="scroll-mt-32">
        <div className="mb-8 text-center">
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-3">
            探索資源
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold">
            依類別瀏覽，或到
            <Link
              href="/hub"
              className="text-[var(--color-clay-purple)] font-bold underline mx-1"
            >
              資源中心
            </Link>
            搜尋全部。
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {CATEGORY_ORDER.map((k) => (
            <CategoryEntryCard
              key={k}
              category={CATEGORIES[k]}
              count={counts[k]}
            />
          ))}
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section id="painpoints" className="scroll-mt-32">
        <div className="mb-10 text-center">
          <div className="inline-block px-3 py-1 rounded bg-red-100/50 dark:bg-red-900/20 text-[var(--color-clay-coral)] font-bold text-sm mb-4">
            😤 → 😌 解決真實痛點
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">
            這些問題，你每週遇到幾次？
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold">
            每個工具的出發點都是一個真實的工作痛點，不是為了用 AI 而用 AI。
          </p>
        </div>

        <PainPointsExplorer painCards={painCards} />
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="feedback" className="scroll-mt-32 mb-4">
        <div className="mb-10 text-center">
          <div className="inline-block px-3 py-1 rounded bg-purple-100/50 dark:bg-purple-900/20 text-[var(--color-clay-purple)] font-bold text-sm mb-4">
            💬 同仁回饋
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">
            用過的人說……
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold">
            這些是真實同仁的使用心得，不是業配。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-[var(--shadow-clay)] border border-white/80 dark:border-white/5"
              style={{ borderTop: `4px solid ${t.color}` }}
            >
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: 5 }).map((_, si) => (
                  <span
                    key={si}
                    className="text-lg"
                    style={{ color: si < t.stars ? "#FFD166" : "#D1D5DB" }}
                  >
                    ★
                  </span>
                ))}
              </div>
              <p className="text-[var(--color-text-dark)] dark:text-gray-100 font-semibold leading-relaxed mb-4">
                「{t.quote}」
              </p>
              <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                  style={{ background: t.color }}
                >
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="font-extrabold text-sm text-[var(--color-text-dark)]">
                    {t.name}
                  </div>
                  <div className="text-xs text-[var(--color-text-mid)]">
                    {t.dept}・使用{t.tool}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA HELP ── */}
      <section id="about" className="scroll-mt-32 mb-20">
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl p-10 md:p-14 text-center shadow-[var(--shadow-clay-lg)] border border-white/80 dark:border-white/5">
          <div className="text-6xl mb-6">🤝</div>
          <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-4">
            有工作上的困擾？
            <br />
            說出來，我來想辦法
          </h2>
          <p className="text-[var(--color-text-mid)] font-semibold mb-8 max-w-xl mx-auto leading-relaxed">
            不知道有沒有工具可以用？有個想法但不知道怎麼實現？
            <br />
            直接說，我會幫你找或幫你做。
          </p>
          <div className="flex gap-4 flex-wrap justify-center mb-6">
            <Link
              href="/hub"
              className="px-8 py-4 rounded-full bg-gradient-to-br from-[var(--color-clay-purple)] to-[var(--color-clay-blue)] text-white font-extrabold text-base shadow-[0_6px_20px_rgba(167,139,250,0.45)] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(167,139,250,0.55)] transition-all"
            >
              🔧 找現有工具
            </Link>
            <RequestButton className="px-8 py-4 rounded-full bg-white dark:bg-gray-700 text-[var(--color-text-dark)] dark:text-gray-100 font-extrabold text-base border-2 border-[#1e1b4b]/15 dark:border-white/10 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer">
              💬 提需求給我
            </RequestButton>
          </div>
          <p className="text-xs text-[var(--color-text-mid)] opacity-70">
            需求會由經企室評估，不保證每項都能實現，但每條都會看!
          </p>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: build + lint**

Run: `npm run build`
Expected: 成功（`/` 變 ○ Static、無 `loading` / `useState` 殘留）

Run: `npm run lint`
Expected: 0 error（基準不變）

- [ ] **Step 3: Commit**

```bash
git add app/page.jsx
git commit -m "feat(rsc): 首頁改 server component（server 抓資料 + PainPointsExplorer 島）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 6: `HubExplorer.jsx` 島 + `app/hub/page.jsx` → server

**Files:**

- Create: `src/components/HubExplorer.jsx`
- Modify: `app/hub/page.jsx`（整檔改寫）

把現 `HubInner` 的搜尋 / Fuse / tabs / grid / track 搬進 client 島，資料改吃 props、`initialCat` 吃 props（取代 `useSearchParams`、移除 `useEffect` 抓資料與 loading）。counts 在島內由 `tools` 算（自含）。

- [ ] **Step 1: 建 HubExplorer.jsx**

Create `src/components/HubExplorer.jsx`:

```jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import { categoryCounts, CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";
import ToolCard from "@/components/ToolCard";
import CategoryTabs from "@/components/CategoryTabs";
import { track } from "@/lib/track";

/**
 * 資源中心互動島：搜尋 + Fuse + 分類 tabs + grid。
 * @param {{tools: object[], initialCat?: string}} props  tools 由 server 抓好傳入。
 */
export default function HubExplorer({ tools, initialCat = "all" }) {
  const [activeCat, setActiveCat] = useState(initialCat);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 重用 300ms debouncedQuery 記 search（非空才送；不帶 query text）
  useEffect(() => {
    if (debouncedQuery) track("search");
  }, [debouncedQuery]);

  const activeTools = useMemo(
    () => tools.filter((t) => t.status !== "terminated"),
    [tools],
  );
  const counts = useMemo(() => categoryCounts(tools), [tools]);

  const fuse = useMemo(
    () =>
      new Fuse(activeTools, {
        keys: ["title", "tagline", "tags", "desc"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [activeTools],
  );

  const filtered = useMemo(() => {
    let result = activeTools;
    if (debouncedQuery) result = fuse.search(debouncedQuery).map((r) => r.item);
    if (activeCat !== "all")
      result = result.filter(
        (t) =>
          (CATEGORY_ORDER.includes(t.category) ? t.category : "tool") ===
          activeCat,
      );
    return result;
  }, [activeTools, debouncedQuery, fuse, activeCat]);

  return (
    <div className="px-4 md:px-0 max-w-6xl mx-auto py-10">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          資源中心
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          {activeCat === "all"
            ? "公司所有 AI 資源 — 工具、平臺、專案、MCP、Skill"
            : CATEGORIES[activeCat]?.desc}
        </p>
      </div>

      <div className="relative mb-5 max-w-2xl mx-auto">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="搜尋資源"
          placeholder="🔍 搜尋名稱、描述、關鍵字..."
          className="w-full pl-5 pr-12 py-3.5 rounded-2xl bg-white dark:bg-gray-800 border-2 border-[var(--color-card-border)] text-base font-medium focus:border-[var(--color-clay-purple)] focus:outline-none focus:ring-4 focus:ring-[var(--color-clay-purple)]/10 transition-all shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label="清除搜尋"
          >
            ✕
          </button>
        )}
      </div>

      <CategoryTabs
        active={activeCat}
        counts={counts}
        onChange={setActiveCat}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-20 text-center text-[var(--color-text-mid)] font-bold bg-white dark:bg-gray-800 rounded-[24px] border border-dashed border-gray-300 dark:border-gray-600">
            這個分類目前沒有項目
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 改寫 hub/page.jsx 成 server component**

把 `app/hub/page.jsx` 整個替換為：

```jsx
import { getServerCatalog } from "@/lib/serverCatalog";
import HubExplorer from "@/components/HubExplorer";

/**
 * 資源中心（公開頁）。server 端抓 catalog → 傳 client 島；讀 ?cat= 帶初始分類
 * （故為 dynamic render，但 REST fetch 有 300s 快取）。
 */
export default async function HubPage({ searchParams }) {
  const { cat } = await searchParams;
  const tools = await getServerCatalog();
  return <HubExplorer tools={tools} initialCat={cat || "all"} />;
}
```

- [ ] **Step 3: build + lint**

Run: `npm run build`
Expected: 成功（`/hub` 為 ƒ dynamic、無 `useSearchParams`/`Suspense` build 錯）

Run: `npm run lint`
Expected: 0 error

- [ ] **Step 4: Commit**

```bash
git add src/components/HubExplorer.jsx app/hub/page.jsx
git commit -m "feat(rsc): 資源中心改 server component + HubExplorer 島

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 7: 全套驗證（build + test + dev 視覺）

**Files:** 無（驗證）

- [ ] **Step 1: 靜態檢查**

```bash
npm run test:unit   # firestoreValue + 既有全過
npm run lint        # 0 error
npm run build       # 成功；/ 為 ○ Static、/hub 為 ƒ Dynamic
```

- [ ] **Step 2: dev 起站 + 代驗（playwright）**

Run: `npm run dev`，然後驗：

1. **初始 HTML 有內容**：`curl -s localhost:3000/ | grep -c "解決真實痛點\|可用資源"` > 0；`curl -s localhost:3000/hub | grep -c "資源中心"` > 0。關鍵：`curl -s localhost:3000/hub` 的 HTML 內**已含 ToolCard 文案**（非只有「載入中」）。
2. **首屏無「載入中」閃動**（playwright 載入後即見卡片）。
3. **hub 搜尋 / 分類 tab 正常**；`localhost:3000/hub?cat=platform` 初始即只顯示平臺類（view-source 即正確、無 flash）。
4. **首頁痛點 chip 篩選正常**、三個數字（資源數 / 累計開啟 / 痛點數）正確。
5. **0 console error**；亮/暗模式 OK。

- [ ] **Step 3: 收尾 commit（若驗證中有微調）**

```bash
git add -A
git commit -m "test(rsc): 公開頁 RSC 驗證微調

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

（無微調則略過。）

---

## 完成後

- 獨立 reviewer 審實作（RSC 邊界、REST parser、無回歸）。
- 開 PR 等 Jason merge。merge → Vercel 部署即生效（無 rules / 無資料 / 無 SA 動作）。
