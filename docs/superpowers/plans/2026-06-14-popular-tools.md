# 使用訊號 → 首頁熱門工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已建好的第一方 analytics 變成首頁「🔥 熱門工具」——依詳情頁全期瀏覽數排序，只排序不露數字。

**Architecture:** 詳情頁的 `track("tool_view")` 已存在（session 去重）；新增 `analytics/toolViews` 全期 per-tool aggregate doc（Admin SDK 經 `/api/track` 累加），首頁 server component（ISR 5min）讀它 + catalog，用純函式 `rankPopularTools` 取 top N 渲染。daily `byTool` 維持只記 opens（保護 admin 開啟排名語意）。

**Tech Stack:** Next.js 16 App Router (RSC), React 19, Firebase Admin SDK (server write) + Firestore REST (server read), Tailwind 4, ESM, `node --test`。

**Spec:** `docs/superpowers/specs/2026-06-14-popular-tools-design.md`

**驗證指令**

- 單元測試：`npm run test:unit`
- Lint：`npm run lint`
- Build：`npm run build`（若失敗訊息只有 `Failed to fetch ... fonts.gstatic.com` 屬本機網路 flake，重跑即可）

---

## File Structure

- `src/lib/trackEvents.mjs`（改）— `buildIncrements` 增 `viewToolKey`
- `src/lib/trackEvents.test.mjs`（改）— 對應測試
- `app/api/track/route.js`（改）— 寫 `analytics/toolViews`
- `src/lib/popularTools.mjs`（新）— `rankPopularTools` 純函式
- `src/lib/popularTools.test.mjs`（新）— 測試
- `src/lib/serverCatalog.js`（改）— `getServerToolViews()`
- `app/tool/[id]/page.jsx`（改）— 自看灌水防護
- `app/page.jsx`（改）— 🔥 熱門工具 區塊

---

## Task 1: `buildIncrements` 增 `viewToolKey`（區分 opens / views）

**Files:**

- Modify: `src/lib/trackEvents.mjs:42-49`
- Test: `src/lib/trackEvents.test.mjs:40-63`

- [ ] **Step 1: 改測試（先紅）** — 把 `src/lib/trackEvents.test.mjs` 既有 4 個 `buildIncrements` 測試（第 40–63 行）整段換成新形狀：

```js
test("buildIncrements：tool_open + toolId → byToolKey（viewToolKey null）", () => {
  assert.deepEqual(buildIncrements("tool_open", "t1"), {
    field: "toolOpen",
    byToolKey: "t1",
    viewToolKey: null,
  });
});

test("buildIncrements：tool_view + toolId → viewToolKey（byToolKey null）", () => {
  assert.deepEqual(buildIncrements("tool_view", "t1"), {
    field: "toolView",
    byToolKey: null,
    viewToolKey: "t1",
  });
});

test("buildIncrements：search 無 toolId → 兩 key 皆 null", () => {
  assert.deepEqual(buildIncrements("search"), {
    field: "search",
    byToolKey: null,
    viewToolKey: null,
  });
});

test("buildIncrements：tool_view 無 toolId → 兩 key 皆 null", () => {
  assert.deepEqual(buildIncrements("tool_view"), {
    field: "toolView",
    byToolKey: null,
    viewToolKey: null,
  });
});

test("buildIncrements：未知事件回 null", () => {
  assert.equal(buildIncrements("evil", "t1"), null);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/trackEvents.test.mjs`
Expected: FAIL（現行 buildIncrements 回傳無 `viewToolKey` 欄位 → deepEqual 不符）

- [ ] **Step 3: 改實作** — 把 `src/lib/trackEvents.mjs` 的 `buildIncrements`（第 42–49 行）換成：

```js
export function buildIncrements(event, toolId) {
  const field = eventField(event);
  if (!field) return null;
  const id = toolId ? String(toolId).slice(0, 200) : null;
  return {
    field,
    // 開啟 → daily byTool（admin 開啟排名用）
    byToolKey: event === "tool_open" ? id : null,
    // 瀏覽 → 全期 analytics/toolViews（首頁熱門用）
    viewToolKey: event === "tool_view" ? id : null,
  };
}
```

同時把函式上方 JSDoc 的 `@returns` 從 `{field, byToolKey}` 更新為 `{field, byToolKey, viewToolKey}`（敘述可寫：byToolKey=開啟、viewToolKey=瀏覽）。

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/trackEvents.test.mjs`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackEvents.mjs src/lib/trackEvents.test.mjs
git commit -m "feat(track): buildIncrements 區分 byToolKey(開啟)/viewToolKey(瀏覽)

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `/api/track` 寫入 `analytics/toolViews`

**Files:**

- Modify: `app/api/track/route.js:31-52`

無純單元測試（Admin SDK 寫入）；以 `node --check` + build 驗證語法，行為於部署後驗。

- [ ] **Step 1: 加 toolViews 寫入** — 在 `app/api/track/route.js`：

(a) 在 `dailyRef` 宣告（約第 32 行）後面，加一個 ref：

```js
const toolViewsRef = adminDb.collection("analytics").doc("toolViews");
```

(b) 在 `batch.set(dailyRef, dailyUpdate, { merge: true });`（約第 51 行）之後、`await batch.commit();` 之前，插入：

```js
// 全期 per-tool 瀏覽累計（首頁熱門用；與 daily byTool=opens 分開，不混語意）
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
```

- [ ] **Step 2: 語法檢查**

Run: `node --check app/api/track/route.js`
Expected: 無輸出（通過）

- [ ] **Step 3: Commit**

```bash
git add app/api/track/route.js
git commit -m "feat(track): tool_view 累加 analytics/toolViews 全期 aggregate

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: `rankPopularTools` 純函式

**Files:**

- Create: `src/lib/popularTools.mjs`
- Test: `src/lib/popularTools.test.mjs`

- [ ] **Step 1: 寫測試（先紅）** — 建立 `src/lib/popularTools.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankPopularTools } from "./popularTools.mjs";

const T = (id, status = "live") => ({ id, status, title: id });

test("依瀏覽數由大到小、截斷 top N", () => {
  const out = rankPopularTools(
    [T("a"), T("b"), T("c")],
    { a: 5, b: 20, c: 12 },
    {
      limit: 2,
      minWithViews: 1,
    },
  );
  assert.deepEqual(
    out.map((t) => t.id),
    ["b", "c"],
  );
});

test("未達 minWithViews → 回 []", () => {
  const out = rankPopularTools([T("a"), T("b")], { a: 3 }, { minWithViews: 3 });
  assert.deepEqual(out, []);
});

test("排除非 live/beta/new（terminated/dev/pending）", () => {
  const tools = [
    T("a", "terminated"),
    T("b", "dev"),
    T("c", "pending"),
    T("d", "live"),
  ];
  const out = rankPopularTools(
    tools,
    { a: 99, b: 99, c: 99, d: 5 },
    { minWithViews: 1 },
  );
  assert.deepEqual(
    out.map((t) => t.id),
    ["d"],
  );
});

test("瀏覽數為 0 / 缺鍵的工具不列入", () => {
  const out = rankPopularTools(
    [T("a"), T("b"), T("c")],
    { a: 4 },
    { minWithViews: 1 },
  );
  assert.deepEqual(
    out.map((t) => t.id),
    ["a"],
  );
});

test("同分維持原始順序（穩定排序）", () => {
  const out = rankPopularTools(
    [T("a"), T("b"), T("c")],
    { a: 7, b: 7, c: 7 },
    {
      minWithViews: 1,
      limit: 3,
    },
  );
  assert.deepEqual(
    out.map((t) => t.id),
    ["a", "b", "c"],
  );
});

test("空 / 缺參數安全", () => {
  assert.deepEqual(rankPopularTools(), []);
  assert.deepEqual(rankPopularTools([], {}), []);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/popularTools.test.mjs`
Expected: FAIL（`Cannot find module './popularTools.mjs'`）

- [ ] **Step 3: 寫實作** — 建立 `src/lib/popularTools.mjs`：

```js
// src/lib/popularTools.mjs
// 純函式：依全期瀏覽數挑首頁「熱門工具」。無 firebase/browser 依賴，可 node:test。

/**
 * @param {object[]} tools                  工具陣列（需有 id, status）
 * @param {Record<string, number>} viewsMap { toolId: 全期瀏覽數 }
 * @param {{limit?:number, minWithViews?:number, statuses?:string[]}} [opts]
 * @returns {object[]} 排序後 top N（只含 views>0 的合格工具）；未達門檻回 []
 */
export function rankPopularTools(tools = [], viewsMap = {}, opts = {}) {
  const {
    limit = 6,
    minWithViews = 3,
    statuses = ["live", "beta", "new"],
  } = opts;
  const allow = new Set(statuses);
  const eligible = (tools || [])
    .filter((t) => t && allow.has(t.status))
    .map((t) => ({ tool: t, views: Number(viewsMap[t.id]) || 0 }))
    .filter((x) => x.views > 0);
  if (eligible.length < minWithViews) return [];
  // Array.prototype.sort 在 V8 為穩定排序 → 同分維持原順序。
  return eligible
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
    .map((x) => x.tool);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/popularTools.test.mjs`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add src/lib/popularTools.mjs src/lib/popularTools.test.mjs
git commit -m "feat(popular): rankPopularTools 純函式（依瀏覽數排序 + 門檻）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: `getServerToolViews()` 讀 `analytics/toolViews`

**Files:**

- Modify: `src/lib/serverCatalog.js`（檔尾新增 export）

比照同檔 `getServerMetrics` 的 fail-soft REST 讀取模式；無獨立單元測試（與 metrics 一致），以 build 驗證。

- [ ] **Step 1: 新增函式** — 在 `src/lib/serverCatalog.js` 檔案最後（`getServerMetrics` 之後）新增：

```js
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
```

- [ ] **Step 2: 語法檢查**

Run: `node --check src/lib/serverCatalog.js`
Expected: 無輸出（通過）

- [ ] **Step 3: Commit**

```bash
git add src/lib/serverCatalog.js
git commit -m "feat(catalog): getServerToolViews REST 讀全期瀏覽數（fail-soft）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 詳情頁自看灌水防護

**Files:**

- Modify: `app/tool/[id]/page.jsx:850-851`

`fetchTool` 內第 848 行已有 `const isOwner = user && data.authorUid === user.uid;`，`isAdmin` 在 scope（見第 865 行 deps）。

- [ ] **Step 1: 加守門** — 把 `app/tool/[id]/page.jsx` 第 850–851 行：

```js
setTool(data);
track("tool_view", { toolId: id }); // 同 session 去重 → 重整/重抓不重複計
```

改為：

```js
setTool(data);
// 非作者且非 admin 才計（防自看灌水）；track 內仍 session 去重
if (!isOwner && !isAdmin) track("tool_view", { toolId: id });
```

- [ ] **Step 2: 語法檢查**

Run: `node --check "app/tool/[id]/page.jsx"`
Expected: 無輸出（通過）

- [ ] **Step 3: Commit**

```bash
git add "app/tool/[id]/page.jsx"
git commit -m "feat(track): 作者/admin 看自己工具不計 tool_view（防自看灌水）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: 首頁「🔥 熱門工具」區塊

**Files:**

- Modify: `app/page.jsx:1-11`（imports）、`app/page.jsx:62-69`（資料抓取）、`app/page.jsx:131-133`（HERO section 與 探索資源 section 之間插入新 section）

- [ ] **Step 1: 加 imports** — 把 `app/page.jsx` 第 1–11 行的 import 區塊改為（新增 `getServerToolViews`、`rankPopularTools`、`ToolCard`）：

```js
import {
  getServerCatalog,
  getServerPainCards,
  getServerMetrics,
  getServerToolViews,
} from "@/lib/serverCatalog";
import { rankPopularTools } from "@/lib/popularTools.mjs";
import { categoryCounts, CATEGORIES, CATEGORY_ORDER } from "@/lib/taxonomy";
import CategoryEntryCard from "@/components/CategoryEntryCard";
import MetricsBand from "@/components/MetricsBand";
import PainPointsExplorer from "@/components/PainPointsExplorer";
import ToolCard from "@/components/ToolCard";
import Link from "next/link";
import RequestButton from "@/components/RequestButton";
```

- [ ] **Step 2: 抓資料 + 算熱門** — 把 `Home()` 開頭（第 63–69 行）的 `Promise.all` 與後續改為：

```js
const [tools, painCards, metrics, toolViews] = await Promise.all([
  getServerCatalog(),
  getServerPainCards(),
  getServerMetrics(),
  getServerToolViews(),
]);
const counts = categoryCounts(tools);
const activeCount = counts.all;
const popular = rankPopularTools(tools, toolViews);
```

- [ ] **Step 3: 插入熱門區塊** — 在 HERO section 結束 `</section>`（第 131 行）之後、`{/* ── 5 類別入口 ── */}`（第 133 行）之前，插入：

```jsx
{
  /* ── 🔥 熱門工具 ── */
}
{
  popular.length > 0 && (
    <section id="popular" className="scroll-mt-32">
      <div className="mb-8 text-center">
        <h2 className="text-3xl md:text-4xl font-black text-[var(--color-text-dark)] mb-3">
          🔥 熱門工具
        </h2>
        <p className="text-[var(--color-text-mid)] font-semibold">
          同仁最常看的資源
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {popular.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Build + Lint**

Run: `npm run lint`
Expected: 0 errors（既有 2 個 `<img>` warning 不算）

Run: `npm run build`
Expected: `✓ Compiled successfully`（若只報 `fonts.gstatic.com` 連線錯 → 本機 flake，重跑）

- [ ] **Step 5: Commit**

```bash
git add app/page.jsx
git commit -m "feat(home): 首頁🔥熱門工具區（依全期瀏覽排序、不露數字、門檻內隱藏）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 7: 全量驗證

- [ ] **Step 1: 單元測試**

Run: `npm run test:unit`
Expected: 全綠（在原 79 基礎上 +：trackEvents 改寫不增減淨數、popularTools +6 → 85 上下；以實際輸出為準、0 fail）

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: 收尾** — 確認工作樹乾淨（`git status` 無未提交），推 branch、開 PR。PR 說明標註：**無 rules / 無 index / 無 TTL / 無 SA → merge 即部署**；部署後 Jason 驗：開幾個工具詳情頁 → ≤5 分後首頁出現熱門區、排序合理、不露數字、未達門檻時整區不顯示。

---

## 範圍外（路線圖）

近 30 天趨勢榜、/hub 熱門排序、👍 回饋、露出原始數字。
