# 飛輪決策儀表板（三訊號合表）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 admin `📊 使用概況` 分頁把「工具開啟排名」換成一張可排序的 per-tool 三訊號合表（瀏覽全期 / 開啟 14d / 有幫助全期），讓 operator 看到目前隱藏的 views / helpful 訊號。

**Architecture:** 新增一支無依賴純函式模組 `toolSignals.mjs`（join + sort，TDD），元件層 `UsageDashboard.jsx` 多讀兩個既有 analytics doc（`toolViews` / `toolHelpful`，client 公開可讀）、把資料餵給純函式、輸出可點欄位排序的表格。零新 route / 依賴 / rules / 遷移。

**Tech Stack:** Next.js 16 (App Router) client component、Firebase Web SDK (`getDoc`)、純 JS/ESM `node --test`、Tailwind 4。

---

## File Structure

- **Create** `src/lib/toolSignals.mjs` — 純函式：`buildToolSignalRows`（tools × 三 map → rows）、`sortToolSignalRows`（rows × key → 遞減排序）。無 firebase / browser 依賴。
- **Create** `src/lib/toolSignals.test.mjs` — `node --test` 單元測試。
- **Modify** `src/components/UsageDashboard.jsx` — 多讀 `analytics/toolViews`＋`analytics/toolHelpful`、聚合 opens、用純函式建 rows、把開啟排名清單換成三訊號合表 + 欄位排序互動。

參考既有模式（逐字對齊風格）：`src/lib/sortTools.mjs`（顯式 -Infinity 比較器 / 穩定排序 / 非陣列→[]）、`src/lib/helpfulBadge.mjs`（`Number.isFinite(n) && n > 0 ? n : 0` coercion）、`src/components/HubExplorer.jsx`（`role="group"` + `aria-pressed` 排序鈕）、`src/lib/serverCatalog.js`（濾非數值欄位）。

---

## Task 1: 純函式 `toolSignals.mjs` + TDD

**Files:**

- Create: `src/lib/toolSignals.test.mjs`
- Create: `src/lib/toolSignals.mjs`

- [ ] **Step 1: 寫失敗測試**

Create `src/lib/toolSignals.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildToolSignalRows, sortToolSignalRows } from "./toolSignals.mjs";

const T = (id, extra = {}) => ({
  id,
  title: id,
  status: "live",
  type: "webapp",
  ...extra,
});

// ---- buildToolSignalRows ----

test("build：正常 join 三訊號", () => {
  const tools = [T("a"), T("b")];
  const rows = buildToolSignalRows(tools, {
    viewsMap: { a: 10, b: 3 },
    opensMap: { a: 5 },
    helpfulMap: { b: 7 },
  });
  assert.deepEqual(rows, [
    {
      id: "a",
      title: "a",
      status: "live",
      type: "webapp",
      views: 10,
      opens: 5,
      helpful: 0,
    },
    {
      id: "b",
      title: "b",
      status: "live",
      type: "webapp",
      views: 3,
      opens: 0,
      helpful: 7,
    },
  ]);
});

test("build：缺訊號 / 非數值 / 負值 → 0", () => {
  const rows = buildToolSignalRows([T("a")], {
    viewsMap: { a: "nope" },
    opensMap: { a: -4 },
    helpfulMap: {},
  });
  assert.deepEqual(rows[0], {
    id: "a",
    title: "a",
    status: "live",
    type: "webapp",
    views: 0,
    opens: 0,
    helpful: 0,
  });
});

test("build：title 缺 → 用 id；status / type 缺 → 空字串", () => {
  const rows = buildToolSignalRows([{ id: "x" }], {});
  assert.deepEqual(rows[0], {
    id: "x",
    title: "x",
    status: "",
    type: "",
    views: 0,
    opens: 0,
    helpful: 0,
  });
});

test("build：tools 非陣列 → []", () => {
  assert.deepEqual(buildToolSignalRows(undefined, {}), []);
  assert.deepEqual(buildToolSignalRows(null), []);
  assert.deepEqual(buildToolSignalRows("nope", {}), []);
});

test("build：maps 全缺 → 三訊號皆 0", () => {
  const rows = buildToolSignalRows([T("a"), T("b")]);
  assert.deepEqual(
    rows.map((r) => [r.views, r.opens, r.helpful]),
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
  );
});

test("build：不 mutate 輸入 tools / maps", () => {
  const tools = Object.freeze([Object.freeze(T("a"))]);
  const maps = Object.freeze({ viewsMap: Object.freeze({ a: 9 }) });
  const rows = buildToolSignalRows(tools, maps); // 不應丟錯
  assert.equal(rows[0].views, 9);
  assert.notEqual(rows[0], tools[0]); // 回新物件
});

// ---- sortToolSignalRows ----

const R = (id, views, opens, helpful) => ({ id, views, opens, helpful });

test("sort：依 views 遞減", () => {
  const out = sortToolSignalRows(
    [R("a", 5, 0, 0), R("b", 20, 0, 0), R("c", 12, 0, 0)],
    "views",
  );
  assert.deepEqual(
    out.map((r) => r.id),
    ["b", "c", "a"],
  );
});

test("sort：依 opens 遞減", () => {
  const out = sortToolSignalRows(
    [R("a", 0, 1, 0), R("b", 0, 9, 0), R("c", 0, 4, 0)],
    "opens",
  );
  assert.deepEqual(
    out.map((r) => r.id),
    ["b", "c", "a"],
  );
});

test("sort：依 helpful 遞減", () => {
  const out = sortToolSignalRows(
    [R("a", 0, 0, 2), R("b", 0, 0, 8), R("c", 0, 0, 5)],
    "helpful",
  );
  assert.deepEqual(
    out.map((r) => r.id),
    ["b", "c", "a"],
  );
});

test("sort：同值穩定保序、0 沉底", () => {
  const out = sortToolSignalRows(
    [R("a", 0, 0, 0), R("b", 7, 0, 0), R("c", 7, 0, 0), R("d", 0, 0, 0)],
    "views",
  );
  assert.deepEqual(
    out.map((r) => r.id),
    ["b", "c", "a", "d"],
  );
});

test("sort：未知 / 缺 key → 原序淺拷貝（新陣列）", () => {
  const rows = [R("a", 1, 0, 0), R("b", 9, 0, 0)];
  const out = sortToolSignalRows(rows, "title");
  assert.deepEqual(
    out.map((r) => r.id),
    ["a", "b"],
  );
  assert.notEqual(out, rows);
});

test("sort：rows 非陣列 → []", () => {
  assert.deepEqual(sortToolSignalRows(undefined, "views"), []);
  assert.deepEqual(sortToolSignalRows(null, "opens"), []);
});

test("sort：不 mutate 輸入陣列", () => {
  const rows = [R("a", 1, 0, 0), R("b", 9, 0, 0), R("c", 4, 0, 0)];
  const before = rows.map((r) => r.id);
  sortToolSignalRows(rows, "views");
  assert.deepEqual(
    rows.map((r) => r.id),
    before,
  );
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/toolSignals.test.mjs`
Expected: FAIL —「Cannot find module './toolSignals.mjs'」（檔案還沒建）。

- [ ] **Step 3: 寫最小實作**

Create `src/lib/toolSignals.mjs`:

```js
// src/lib/toolSignals.mjs
// 純函式：把 per-tool 三訊號（瀏覽/開啟/有幫助）併成可排序的列。
// 無 firebase/browser 依賴，可 node:test。比照 sortTools.mjs / helpfulBadge.mjs 風格。

const SORT_KEYS = new Set(["views", "opens", "helpful"]);

/**
 * 缺/非數值/負值 → 0（比照 attachHelpfulCounts）。
 * @param {Record<string, number>|undefined} map
 * @param {string|undefined} id
 * @returns {number}
 */
function signal(map, id) {
  const n = Number(map && typeof map === "object" ? map[id] : undefined);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 把工具清單與三個訊號 map 併成列（回新陣列/新物件，不 mutate 輸入）。
 * @param {object[]} tools  getAllTools() 結果
 * @param {{viewsMap?:Record<string,number>, opensMap?:Record<string,number>, helpfulMap?:Record<string,number>}} [maps]
 * @returns {{id:string,title:string,status:string,type:string,views:number,opens:number,helpful:number}[]}
 */
export function buildToolSignalRows(tools, maps = {}) {
  if (!Array.isArray(tools)) return [];
  const { viewsMap, opensMap, helpfulMap } = maps || {};
  return tools.map((t) => {
    const id = t?.id;
    return {
      id,
      title: t?.title || id || "",
      status: t?.status || "",
      type: t?.type || "",
      views: signal(viewsMap, id),
      opens: signal(opensMap, id),
      helpful: signal(helpfulMap, id),
    };
  });
}

/**
 * 依指定訊號 key 由大到小排序（回新陣列、不 mutate、穩定排序）。
 * @param {object[]} rows  buildToolSignalRows 的結果
 * @param {"views"|"opens"|"helpful"} key
 * @returns {object[]}
 */
export function sortToolSignalRows(rows, key) {
  if (!Array.isArray(rows)) return [];
  const arr = rows.slice(); // 淺拷貝，不 mutate；V8 sort 為穩定排序
  if (!SORT_KEYS.has(key)) return arr; // 未知/缺 key → 原序淺拷貝（安全預設）
  const val = (r) => {
    const n = Number(r?.[key]);
    return Number.isFinite(n) ? n : -Infinity; // 防禦非數值，避免比較器 NaN UB
  };
  // 顯式比較避免 (-Infinity)-(-Infinity)=NaN 的比較器 UB
  return arr.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    return x === y ? 0 : y > x ? 1 : -1; // 遞減；同值→0→穩定保序
  });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/toolSignals.test.mjs`
Expected: PASS（13 tests）。

- [ ] **Step 5: 跑全套單元測試確認沒破壞既有**

Run: `npm run test:unit`
Expected: 全綠（既有 138 + 本檔新增，無 fail）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/toolSignals.mjs src/lib/toolSignals.test.mjs
git commit -m "$(cat <<'EOF'
feat(flywheel-insights): toolSignals 純函式（三訊號 join + 排序）+ TDD

buildToolSignalRows 把 per-tool 瀏覽/開啟/有幫助併成列、coerce 缺值為 0；
sortToolSignalRows 依訊號 key 遞減穩定排序。無 firebase 依賴，可 node:test。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 2: `UsageDashboard.jsx` 接純函式 + 三訊號合表 UI

**Files:**

- Modify: `src/components/UsageDashboard.jsx`（整檔改寫；現為 124 行）

無新增單元測試（UI 元件，沿用專案慣例：Jason 部署後肉眼驗）。本 task 以 lint / build / 全套 test:unit 把關。

- [ ] **Step 1: 改寫整支 `UsageDashboard.jsx`**

以下為完整新檔內容（取代既有）：

```jsx
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { normalizeMetrics } from "@/lib/metrics.mjs";
import { getAllTools } from "@/lib/db";
import { buildToolSignalRows, sortToolSignalRows } from "@/lib/toolSignals.mjs";

// 近 N 天的 daily doc id（UTC YYYYMMDD）。
function recentDayIds(n) {
  const ids = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    ids.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return ids;
}

// analytics doc → 純數值 map（濾掉 updatedAt 等非數值欄位）。比照 serverCatalog。
function numericMap(data) {
  const out = {};
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "number") out[k] = v;
    }
  }
  return out;
}

// status pill 配色（深色相容）。未知 status → fallback 灰。
const STATUS_PILL = {
  live: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  beta: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  new: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  dev: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  pending: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  terminated: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
};
const STATUS_FALLBACK =
  "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";

// 可排序欄位（順序＝表格資料欄順序）。
const SORT_COLS = [
  { key: "views", label: "👁 瀏覽" },
  { key: "opens", label: "📂 開啟" },
  { key: "helpful", label: "👍 有幫助" },
];

export default function UsageDashboard() {
  const [totals, setTotals] = useState(null);
  const [rows, setRows] = useState([]);
  const [sortKey, setSortKey] = useState("views");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [tSnap, vSnap, hSnap, daySnaps, tools] = await Promise.all([
          getDoc(doc(db, "analytics", "totals")),
          getDoc(doc(db, "analytics", "toolViews")),
          getDoc(doc(db, "analytics", "toolHelpful")),
          Promise.all(
            recentDayIds(14).map((id) =>
              getDoc(doc(db, "analytics_daily", id)),
            ),
          ),
          getAllTools(),
        ]);

        setTotals(normalizeMetrics(tSnap.exists() ? tSnap.data() : {}));

        const viewsMap = numericMap(vSnap.exists() ? vSnap.data() : {});
        const helpfulMap = numericMap(hSnap.exists() ? hSnap.data() : {});

        // 近 14 天 byTool 加總 → opensMap。
        const opensMap = {};
        for (const s of daySnaps) {
          if (!s.exists()) continue;
          const bt = s.data().byTool || {};
          for (const [tid, n] of Object.entries(bt)) {
            opensMap[tid] = (opensMap[tid] || 0) + (n || 0);
          }
        }

        setRows(buildToolSignalRows(tools, { viewsMap, opensMap, helpfulMap }));
      } catch (e) {
        console.error("UsageDashboard 載入失敗：", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-[var(--color-text-mid)]">載入中…</p>;

  const cards = [
    { label: "累計工具開啟", value: totals?.toolOpen ?? 0 },
    { label: "詳情頁瀏覽", value: totals?.toolView ?? 0 },
    { label: "搜尋次數", value: totals?.search ?? 0 },
    { label: "需求/申請送出", value: totals?.requestSubmit ?? 0 },
  ];

  const sorted = sortToolSignalRows(rows, sortKey);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-4 text-center"
          >
            <div className="text-2xl font-black text-[var(--color-text-dark)]">
              {c.value.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-[var(--color-text-mid)] mt-1">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-extrabold text-[var(--color-text-dark)]">
          工具訊號總表
        </h3>
        <p className="text-xs text-[var(--color-text-mid)] mb-2">
          瀏覽・有幫助為全期；開啟為近 14 天。點欄位標題可排序。
        </p>
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--color-text-mid)]">
            目前沒有工具資料。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
                  <th className="py-2 pr-3 font-bold">工具</th>
                  {SORT_COLS.map((col) => (
                    <th key={col.key} className="py-2 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => setSortKey(col.key)}
                        aria-pressed={sortKey === col.key}
                        className={`font-bold tabular-nums transition ${
                          sortKey === col.key
                            ? "text-[var(--color-clay-purple)]"
                            : "text-[var(--color-text-mid)] hover:text-[var(--color-text-dark)]"
                        }`}
                      >
                        {col.label}
                        {sortKey === col.key ? " ▼" : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-card-border)] last:border-0"
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[var(--color-text-dark)]">
                          {r.title}
                        </span>
                        {r.status && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                              STATUS_PILL[r.status] || STATUS_FALLBACK
                            }`}
                          >
                            {r.status}
                          </span>
                        )}
                        {r.type && (
                          <span className="text-[10px] text-[var(--color-text-mid)] flex-shrink-0">
                            {r.type}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[var(--color-text-dark)]">
                      {r.views.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[var(--color-text-dark)]">
                      {r.opens.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-[var(--color-text-dark)]">
                      {r.helpful.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 error（既有 2 個 `next/image` warning 與本檔無關、可留）。

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: 編譯成功。⚠️ 若遇 `fonts.gstatic.com` 偶發 flake，重跑一次即可（與本變更無關，見 memory）。

- [ ] **Step 4: 全套單元測試（確認元件改寫沒連帶破壞）**

Run: `npm run test:unit`
Expected: 全綠。

- [ ] **Step 5: Commit**

```bash
git add src/components/UsageDashboard.jsx
git commit -m "$(cat <<'EOF'
feat(flywheel-insights): 使用概況改成可排序三訊號合表

UsageDashboard 多讀 analytics/toolViews + toolHelpful（client 公開可讀），
聚合近 14 天開啟，經 toolSignals 純函式建列；把開啟排名清單換成
標題/status/type/瀏覽/開啟/有幫助表格，欄位標題可點排序（aria-pressed）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Self-Review

**1. Spec coverage**（對照 `2026-06-19-flywheel-insights-dashboard-design.md`）：

- §2 換掉開啟排名為三訊號合表 → Task 2 Step 1 ✅
- §2 欄位 標題/status/type/瀏覽/開啟/有幫助 → Task 2 表格 ✅
- §2 可點欄位排序、預設瀏覽遞減 → `sortKey` 預設 `"views"` + SORT_COLS 按鈕 ✅
- §2 列出全部工具 → `getAllTools()` + `buildToolSignalRows` 不過濾 ✅
- §2 join/sort 純函式 + TDD → Task 1 ✅
- §3 濾非數值欄位 → `numericMap` ✅；§3 不動 rules → 只讀既有 doc ✅
- §5 純函式契約（coercion / 不 mutate / 邊界 / 穩定排序 / 未知 key）→ Task 1 測試逐條覆蓋 ✅
- §6 aria-pressed / 當前欄位標示 / RWD overflow-x-auto / tabular-nums / status pill / 空狀態 / 載入中 → Task 2 ✅
- §7 測試計畫 → Task 1 Step 1（13 test）+ lint/build/test:unit ✅

**2. Placeholder scan：** 無 TBD / TODO；每個 code step 都有完整可貼上的內容。✅

**3. Type consistency：** `buildToolSignalRows(tools, maps)` 回 `{id,title,status,type,views,opens,helpful}`；`sortToolSignalRows(rows, key)` 吃同形列、key ∈ `views|opens|helpful`；元件 `SORT_COLS` 的 key 與資料欄一一對應、`numericMap` 回 `{id:number}` 餵 `viewsMap/helpfulMap`、`opensMap` 同形。命名一致 ✅。

無缺口，無需補 task。
