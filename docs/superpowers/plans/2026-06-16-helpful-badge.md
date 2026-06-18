# 👍 訊號回饋發現（ToolCard helpful badge）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ToolCard 上加「👍 N」badge（helpfulCount ≥ 3 才顯示），讓 #57 收集中的 `analytics/toolHelpful` 訊號出現在首頁熱門 / /hub / chatbot 找工具結果三個發現面。

**Architecture:** 新增純函式模組 `helpfulBadge.mjs`（gating + enrich，TDD）與 server 讀取器 `getServerToolHelpful()`（鏡像 `getServerToolViews()`）。三個 server 資料源各自 `attachHelpfulCounts(tools, map)` 把 `helpfulCount` 附到 tool 物件上；`ToolCard` 讀該欄位、`shouldShowHelpfulBadge` 為真才 render。ToolCard 簽名不變，HubExplorer / ChatbotWidget 不需改。

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · 純 ESM JavaScript · node:test · Firestore REST（既有 serverCatalog 模式）· Tailwind 4。

**Spec:** `docs/superpowers/specs/2026-06-16-helpful-badge-design.md`

---

## File Structure

| 檔案                            | 動作 | 責任                                                                                            |
| ------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `src/lib/helpfulBadge.mjs`      | 新增 | 純函式：`HELPFUL_BADGE_MIN`、`shouldShowHelpfulBadge(count)`、`attachHelpfulCounts(tools, map)` |
| `src/lib/helpfulBadge.test.mjs` | 新增 | 上述純函式的 node:test                                                                          |
| `src/lib/serverCatalog.js`      | 改   | 加 `getServerToolHelpful()`（鏡像 `getServerToolViews()`）                                      |
| `src/components/ToolCard.jsx`   | 改   | 解構 `helpfulCount`；底部 meta 行 render「👍 N」badge                                           |
| `app/page.jsx`                  | 改   | `Promise.all` 加 helpful fetch；enrich 熱門卡                                                   |
| `app/hub/page.jsx`              | 改   | fetch + enrich → 傳 HubExplorer                                                                 |
| `app/api/find-tool/route.js`    | 改   | 回傳前 enrich tools                                                                             |

**不需改**：`HubExplorer.jsx`、`ChatbotWidget.jsx`（只是 `<ToolCard tool={t} />`，tool 已帶 `helpfulCount`）。

---

### Task 1: 純函式 + TDD（`helpfulBadge.mjs`）

**Files:**

- Create: `src/lib/helpfulBadge.mjs`
- Test: `src/lib/helpfulBadge.test.mjs`

- [ ] **Step 1: 先寫失敗的測試**

建立 `src/lib/helpfulBadge.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HELPFUL_BADGE_MIN,
  shouldShowHelpfulBadge,
  attachHelpfulCounts,
} from "./helpfulBadge.mjs";

test("HELPFUL_BADGE_MIN 為 3", () => {
  assert.equal(HELPFUL_BADGE_MIN, 3);
});

test("shouldShowHelpfulBadge：>=3 才 true", () => {
  assert.equal(shouldShowHelpfulBadge(2), false);
  assert.equal(shouldShowHelpfulBadge(3), true);
  assert.equal(shouldShowHelpfulBadge(7), true);
  assert.equal(shouldShowHelpfulBadge(0), false);
  assert.equal(shouldShowHelpfulBadge(-1), false);
  assert.equal(shouldShowHelpfulBadge(undefined), false);
  assert.equal(shouldShowHelpfulBadge(NaN), false);
  assert.equal(shouldShowHelpfulBadge("5"), true); // 數值字串可轉
});

test("attachHelpfulCounts：正常 map 附 count、保留其餘欄位", () => {
  const tools = [
    { id: "a", title: "A", status: "live" },
    { id: "b", title: "B", status: "live" },
  ];
  const out = attachHelpfulCounts(tools, { a: 7, b: 2 });
  assert.deepEqual(out, [
    { id: "a", title: "A", status: "live", helpfulCount: 7 },
    { id: "b", title: "B", status: "live", helpfulCount: 2 },
  ]);
});

test("attachHelpfulCounts：缺 key / 空 map / undefined map → 0", () => {
  const tools = [{ id: "a" }];
  assert.equal(attachHelpfulCounts(tools, { x: 5 })[0].helpfulCount, 0);
  assert.equal(attachHelpfulCounts(tools, {})[0].helpfulCount, 0);
  assert.equal(attachHelpfulCounts(tools)[0].helpfulCount, 0);
});

test("attachHelpfulCounts：map 值非數值 → 0", () => {
  const out = attachHelpfulCounts([{ id: "a" }, { id: "b" }], {
    a: "abc",
    b: null,
  });
  assert.equal(out[0].helpfulCount, 0);
  assert.equal(out[1].helpfulCount, 0);
});

test("attachHelpfulCounts：tools 非陣列 / undefined → []", () => {
  assert.deepEqual(attachHelpfulCounts(undefined, {}), []);
  assert.deepEqual(attachHelpfulCounts(null, {}), []);
  assert.deepEqual(attachHelpfulCounts("nope", {}), []);
});

test("attachHelpfulCounts：不 mutate 原 tools", () => {
  const tools = [{ id: "a", title: "A" }];
  const out = attachHelpfulCounts(tools, { a: 5 });
  assert.equal(tools[0].helpfulCount, undefined); // 原物件不變
  assert.notEqual(out[0], tools[0]); // 回傳新物件
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/helpfulBadge.test.mjs`
Expected: FAIL — `Cannot find module './helpfulBadge.mjs'`（檔案尚未建立）。

- [ ] **Step 3: 寫最小實作**

建立 `src/lib/helpfulBadge.mjs`：

```js
// src/lib/helpfulBadge.mjs
// 純函式：把 analytics/toolHelpful 的 per-tool count 接到工具物件上，
// 並決定 ToolCard 是否顯示「👍 N」badge。無 firebase/browser 依賴，可 node:test。

export const HELPFUL_BADGE_MIN = 3;

/**
 * 是否在卡片顯示 👍 badge：count 為有效數值且 >= 門檻。
 * @param {unknown} count
 * @returns {boolean}
 */
export function shouldShowHelpfulBadge(count) {
  const n = Number(count);
  return Number.isFinite(n) && n >= HELPFUL_BADGE_MIN;
}

/**
 * 把 helpfulMap 的 count 附到每個 tool 上（回傳新物件，不 mutate 原 tool）。
 * @param {object[]} tools
 * @param {Record<string, number>} [helpfulMap] { toolId: count }
 * @returns {object[]} 每個 tool 加 helpfulCount（缺/非數值/<=0 → 0）
 */
export function attachHelpfulCounts(tools = [], helpfulMap = {}) {
  if (!Array.isArray(tools)) return [];
  const map = helpfulMap && typeof helpfulMap === "object" ? helpfulMap : {};
  return tools.map((t) => {
    const n = Number(map[t?.id]);
    return { ...t, helpfulCount: Number.isFinite(n) && n > 0 ? n : 0 };
  });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/helpfulBadge.test.mjs`
Expected: PASS — 7 個 test 全綠（`# pass 7`）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpfulBadge.mjs src/lib/helpfulBadge.test.mjs
git commit -m "feat(helpful-badge): helpfulBadge 純函式（gating + enrich）+ TDD

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: `getServerToolHelpful()`（serverCatalog 讀取器）

**Files:**

- Modify: `src/lib/serverCatalog.js`（在 `getServerToolViews()` 之後，約 line 111 後）

參考既有 `getServerToolViews()`（lines 96-111）逐字鏡像，只把 `toolViews` 換成 `toolHelpful`。

- [ ] **Step 1: 加 `getServerToolHelpful()`**

在 `src/lib/serverCatalog.js` 的 `getServerToolViews()` 函式**之後**，貼上：

```js
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
```

- [ ] **Step 2: 確認 lint + build 不破**

Run: `npm run lint`
Expected: 0 error（可有既有的 2 個 `no-img-element` warning，與本檔無關）。

- [ ] **Step 3: Commit**

```bash
git add src/lib/serverCatalog.js
git commit -m "feat(helpful-badge): getServerToolHelpful() REST 讀取器（鏡像 toolViews）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: ToolCard 渲染 👍 badge

**Files:**

- Modify: `src/components/ToolCard.jsx`

此時尚無資料源 enrich → 卡片不會出現 badge（`helpfulCount` 為 undefined → `shouldShowHelpfulBadge` false），build 安全。Task 4 接上資料後才顯示。

- [ ] **Step 1: import gating helper**

在 `src/components/ToolCard.jsx` 頂部 import 區（line 1-3 附近）加：

```js
import { shouldShowHelpfulBadge } from "@/lib/helpfulBadge.mjs";
```

- [ ] **Step 2: 解構 `helpfulCount`**

把 `ToolCard` 的解構（現為 lines 59-70）改成加入 `helpfulCount`：

```js
const {
  id,
  title,
  tagline,
  icon,
  color,
  dept,
  scenarios,
  status,
  type = "webapp",
  updatedAt,
  helpfulCount,
} = tool;
```

- [ ] **Step 3: 在底部 meta 行插入 badge**

在底部 meta 行裡，**狀態 badge `<span>` 之後、`updatedAt` 區塊之前**插入 badge。即把現有這段（lines 129-138）：

```jsx
          <span className={`px-2 py-0.5 rounded-md border ${sObj.cls}`}>
            {sObj.label}
          </span>
          {updatedAt && (
```

改成：

```jsx
          <span className={`px-2 py-0.5 rounded-md border ${sObj.cls}`}>
            {sObj.label}
          </span>
          {shouldShowHelpfulBadge(helpfulCount) && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-700">
              👍 {helpfulCount}
            </span>
          )}
          {updatedAt && (
```

- [ ] **Step 4: 確認 lint + build**

Run: `npm run lint`
Expected: 0 error（既有 2 img warning 不算）。

- [ ] **Step 5: Commit**

```bash
git add src/components/ToolCard.jsx
git commit -m "feat(helpful-badge): ToolCard 底部加「👍 N」badge（helpfulCount>=3）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 4: 三個發現面資料源接上 enrich

**Files:**

- Modify: `app/page.jsx`
- Modify: `app/hub/page.jsx`
- Modify: `app/api/find-tool/route.js`

- [ ] **Step 1: 首頁 `app/page.jsx` enrich 熱門卡**

(a) import 區（lines 1-7）：`getServerToolViews` 那行之後補 `getServerToolHelpful`，並 import `attachHelpfulCounts`：

```js
import {
  getServerCatalog,
  getServerPainCards,
  getServerMetrics,
  getServerToolViews,
  getServerToolHelpful,
} from "@/lib/serverCatalog";
import { rankPopularTools } from "@/lib/popularTools.mjs";
import { attachHelpfulCounts } from "@/lib/helpfulBadge.mjs";
```

(b) `Home()` 內（現 lines 66-74）改成：

```js
const [tools, painCards, metrics, toolViews, toolHelpful] = await Promise.all([
  getServerCatalog(),
  getServerPainCards(),
  getServerMetrics(),
  getServerToolViews(),
  getServerToolHelpful(),
]);
const counts = categoryCounts(tools);
const activeCount = counts.all;
const popular = attachHelpfulCounts(
  rankPopularTools(tools, toolViews),
  toolHelpful,
);
```

> `rankPopularTools` 回傳的是 `tools` 內部物件的參照；`attachHelpfulCounts` 回傳**新物件**故不 mutate `tools`（`activeCount`/`counts` 不受影響）。

- [ ] **Step 2: /hub `app/hub/page.jsx` enrich 全列**

整檔改成：

```jsx
import { getServerCatalog, getServerToolHelpful } from "@/lib/serverCatalog";
import { attachHelpfulCounts } from "@/lib/helpfulBadge.mjs";
import HubExplorer from "@/components/HubExplorer";

/**
 * 資源中心（公開頁）。server 端抓 catalog → 傳 client 島；讀 ?cat= 帶初始分類
 * （故為 dynamic render，但 REST fetch 有 300s 快取）。
 */
export default async function HubPage({ searchParams }) {
  const { cat } = await searchParams;
  const [tools, toolHelpful] = await Promise.all([
    getServerCatalog(),
    getServerToolHelpful(),
  ]);
  const enriched = attachHelpfulCounts(tools, toolHelpful);
  // ?cat= 重複時 Next 給陣列；取首值，與舊 useSearchParams().get() 行為一致。
  const initialCat = (Array.isArray(cat) ? cat[0] : cat) || "all";
  return <HubExplorer tools={enriched} initialCat={initialCat} />;
}
```

- [ ] **Step 3: chatbot `app/api/find-tool/route.js` enrich 結果**

(a) import 區（lines 5-6）：`getServerCatalog` 那行加上 `getServerToolHelpful`，並 import `attachHelpfulCounts`：

```js
import { getServerCatalog, getServerToolHelpful } from "@/lib/serverCatalog";
import { buildFindToolPrompt, validateToolMatches } from "@/lib/findTool.mjs";
import { attachHelpfulCounts } from "@/lib/helpfulBadge.mjs";
```

(b) 回傳前（現 lines 43-44）改成：

```js
const { reply, tools } = validateToolMatches(parsed, catalog, 4);
const helpfulMap = await getServerToolHelpful(); // fail-soft：catch→{}，讀失敗則無 badge
return NextResponse.json({
  reply,
  tools: attachHelpfulCounts(tools, helpfulMap),
});
```

- [ ] **Step 4: 全套驗證**

Run: `npm run test:unit`
Expected: PASS — 既有測試全綠 + 新增 7 個 helpfulBadge 測試（總數 = 既有 + 7）。

Run: `npm run lint`
Expected: 0 error（既有 2 img warning 不算）。

Run: `npm run build`
Expected: build 成功；`/`（Static, revalidate 300）、`/hub`（ƒ Dynamic）、`/api/find-tool` 正常生成。

> ⚠️ 本機 build 偶遇 `fonts.gstatic.com` flake（與本碼無關），重試即過。

- [ ] **Step 5: Commit**

```bash
git add app/page.jsx app/hub/page.jsx app/api/find-tool/route.js
git commit -m "feat(helpful-badge): 首頁熱門 / hub / find-tool 三發現面接上 helpful enrich

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## 完成後（plan 外，主 session 處理）

- 派獨立 reviewer 對照 codebase 檢查。
- 開 PR（branch `feature-helpful-badge`）。
- 部署後人工驗（spec「Rollout」）：找一個 `analytics/toolHelpful` ≥3 的工具（或 Admin SDK 暫設某工具 count ≥3）→ 首頁熱門卡 / /hub 該卡 / chatbot 找工具結果卡出現「👍 N」；<3 無 badge；深色協調、窄卡不破版。

---

## Self-Review（plan 對照 spec）

**1. Spec coverage**

- 形式＝ToolCard badge → Task 3 ✓
- 門檻 ≥3 顯示「👍 N」→ `HELPFUL_BADGE_MIN`/`shouldShowHelpfulBadge`（Task 1）+ Task 3 render ✓
- 資料層 enrich（不改 ToolCard 簽名）→ `attachHelpfulCounts`（Task 1）+ Task 4 三源 ✓
- `getServerToolHelpful` 鏡像 → Task 2 ✓
- 範圍：首頁熱門 / hub / chatbot；Dashboard 排除 → Task 4 三源、未動 dashboard ✓
- 純函式 TDD → Task 1 ✓
- 零 rules/依賴/付費/migration → 全程無此類改動 ✓

**2. Placeholder scan** — 無 TBD/TODO；每個 code step 都有完整程式碼。✓

**3. Type consistency** — `helpfulCount`（欄位）、`shouldShowHelpfulBadge`、`attachHelpfulCounts`、`getServerToolHelpful`、`HELPFUL_BADGE_MIN` 跨 Task 命名一致。✓
