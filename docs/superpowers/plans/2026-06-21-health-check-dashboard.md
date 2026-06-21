# 🩺 健檢看板（Health-check Dashboard）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 給 admin 一個唯讀「🩺 健檢」分頁，把既有 freshness × usage 訊號 join 起來，揪出四種待修問題工具（熱門但陳舊 / 殭屍 / 卡關過久 / 孤兒 analytics key）。

**Architecture:** 完全比照 `UsageDashboard` 的 client 模式 —— 新純函式 `src/lib/healthFlags.mjs`（偵測邏輯、TDD）＋ 新 client 元件 `src/components/HealthDashboard.jsx`（讀同一組 analytics + tools、渲染四分區）＋ 在 `app/admin/page.jsx` 掛第 7 個 tab。零寫入、零 firestore.rules、零 migration、零付費、零新依賴。

**Tech Stack:** Next.js 16 (App Router) / React 19 / Firebase client SDK / Tailwind 4 / `node --test`（純函式單元測試）。

**Spec:** `docs/superpowers/specs/2026-06-21-health-check-dashboard-design.md`

---

## File Structure

| 檔案                                       | 責任                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/healthFlags.mjs`（新）            | 純函式偵測邏輯：`toMs` / `toolFreshnessMs` / `usageThreshold` / `buildHealthReport` ＋ 門檻常數。無 firebase/browser 依賴。 |
| `src/lib/healthFlags.test.mjs`（新）       | `node:test` 單元測試，覆蓋每 flag 邊界。                                                                                    |
| `src/components/HealthDashboard.jsx`（新） | client 島：讀 analytics + `getAllTools()` → 呼叫純函式 → 渲染四分區。                                                       |
| `app/admin/page.jsx`（改）                 | 掛 `health` tab（nav button ＋ panel block），mirror 既有 `usage` / `demand`。                                              |

## 刻意的工程決策（給 review 看）

1. **`healthFlags.mjs` 零外部依賴**：版本日期讀法（`versions.at(-1).date`）內聯，刻意不 `import` `versions.js`。原因：`versions.js` 無 `"type":"module"`，被 `.mjs` import 會在 `node --test` 噴 `MODULE_TYPELESS_PACKAGE_JSON` 警告污染測試輸出；且本檔比照 `toolSignals.mjs` 維持零依賴最易測。重複僅一行表達式，可接受。
2. **`recentDayIds` 在 `HealthDashboard` 局部重複一份**（與 `UsageDashboard` 同）：這是第 2 處出現、屬邊界；為避免動到正常運作的 `UsageDashboard`，v1 先各自持有，未來要 DRY 再抽 `analyticsDays.mjs`。
3. **時間多型容忍**：`getAllTools()` 走 client SDK → `createdAt`/`updatedAt` 是 Firestore `Timestamp`（`.toMillis()`）；`versions[].date` 是 `"YYYY-MM-DD"` 字串。`toMs` 同時吃 number / 字串 / `Timestamp` / `{seconds}`。
4. **門檻常數 export**：元件描述文字也 import 同一常數插值，避免「180/90/14」散落兩處。

---

## Task 1: `healthFlags.mjs` — 時間原語（`toMs` + `toolFreshnessMs`）

**Files:**

- Create: `src/lib/healthFlags.mjs`
- Test: `src/lib/healthFlags.test.mjs`

- [ ] **Step 1: 寫失敗測試**（建立測試檔，先只測時間原語）

```js
// src/lib/healthFlags.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { toMs, toolFreshnessMs } from "./healthFlags.mjs";

const ts = (ms) => ({ toMillis: () => ms }); // 模擬 Firestore Timestamp

test("toMs: number 原樣；非有限 → null", () => {
  assert.equal(toMs(1000), 1000);
  assert.equal(toMs(0), 0);
  assert.equal(toMs(NaN), null);
  assert.equal(toMs(Infinity), null);
});

test("toMs: ISO / YYYY-MM-DD 字串 → 解析；壞字串 → null", () => {
  assert.equal(
    toMs("2026-01-01T00:00:00Z"),
    Date.parse("2026-01-01T00:00:00Z"),
  );
  assert.equal(toMs("2026-06-01"), Date.parse("2026-06-01"));
  assert.equal(toMs("not-a-date"), null);
});

test("toMs: Firestore Timestamp(.toMillis) / {seconds}", () => {
  assert.equal(toMs(ts(12345)), 12345);
  assert.equal(toMs({ seconds: 10 }), 10000);
});

test("toMs: null / undefined / 無法判定物件 → null", () => {
  assert.equal(toMs(null), null);
  assert.equal(toMs(undefined), null);
  assert.equal(toMs({}), null);
});

test("toolFreshnessMs: versions 末筆 date 優先", () => {
  const t = {
    versions: [{ date: "2026-01-01" }, { date: "2026-05-01" }],
    updatedAt: ts(0),
  };
  assert.equal(toolFreshnessMs(t), Date.parse("2026-05-01"));
});

test("toolFreshnessMs: 無 versions → updatedAt", () => {
  assert.equal(toolFreshnessMs({ updatedAt: ts(777), createdAt: ts(1) }), 777);
});

test("toolFreshnessMs: 無 versions、無 updatedAt → createdAt", () => {
  assert.equal(toolFreshnessMs({ createdAt: ts(55) }), 55);
});

test("toolFreshnessMs: 草稿版本 date='' → 跳過 → updatedAt", () => {
  assert.equal(
    toolFreshnessMs({ versions: [{ date: "" }], updatedAt: ts(900) }),
    900,
  );
});

test("toolFreshnessMs: 全無 → null", () => {
  assert.equal(toolFreshnessMs({}), null);
  assert.equal(toolFreshnessMs(null), null);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/healthFlags.test.mjs`
Expected: FAIL（`Cannot find module './healthFlags.mjs'` 或 `toMs is not a function`）

- [ ] **Step 3: 實作最小程式**（建立 `healthFlags.mjs`，含常數 + 兩個函式）

```js
// src/lib/healthFlags.mjs
// 純函式：把 freshness × usage 訊號 join 成「待修問題」報告。
// 無 firebase/browser 依賴，可 node:test（比照 toolSignals.mjs：零依賴、回新物件不 mutate、缺值安全）。

export const STALE_DAYS = 180;
export const ZOMBIE_GRACE_DAYS = 90;
export const ZOMBIE_VIEW_MAX = 3;
export const PENDING_STUCK_DAYS = 14;

const DAY_MS = 86400000;
const PUBLIC_STATUSES = new Set(["live", "beta", "new"]);

/**
 * 多型時間 → epoch ms；無法判定 → null。
 * 支援 number(ms)、ISO/YYYY-MM-DD 字串、Firestore Timestamp(.toMillis())、{seconds}。
 */
export function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof v.toMillis === "function") {
    const n = v.toMillis();
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

/**
 * 最後實質更新時間 → ms：versions 末筆 date → updatedAt → createdAt；都無 → null。
 * 版本日期讀法內聯（鏡像 versions.js#lastUpdatedDate；草稿空字串用 || 視為未填），保持本檔零依賴。
 */
export function toolFreshnessMs(tool) {
  const vdate = tool?.versions?.at?.(-1)?.date || null;
  const fromVersion = vdate ? toMs(vdate) : null;
  if (fromVersion != null) return fromVersion;
  const u = toMs(tool?.updatedAt);
  if (u != null) return u;
  return toMs(tool?.createdAt);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/healthFlags.test.mjs`
Expected: PASS（9 個 test）

- [ ] **Step 5: Commit**

```bash
git add src/lib/healthFlags.mjs src/lib/healthFlags.test.mjs
git commit -m "feat(health): healthFlags toMs + toolFreshnessMs（時間多型 + freshness fallback）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `usageThreshold`（使用門檻 = views>0 公開工具中位數，地板 1）

**Files:**

- Modify: `src/lib/healthFlags.mjs`
- Test: `src/lib/healthFlags.test.mjs`

- [ ] **Step 1: 加失敗測試**（append 到測試檔）

```js
import { usageThreshold } from "./healthFlags.mjs";

const P = (id, status = "live") => ({ id, status });

test("usageThreshold: 奇數筆 → 中位數", () => {
  assert.equal(
    usageThreshold([P("a"), P("b"), P("c")], { a: 10, b: 30, c: 20 }),
    20,
  );
});

test("usageThreshold: 偶數筆 → 中間兩值平均", () => {
  assert.equal(
    usageThreshold([P("a"), P("b"), P("c"), P("d")], {
      a: 10,
      b: 20,
      c: 30,
      d: 40,
    }),
    25,
  );
});

test("usageThreshold: 排除零瀏覽工具（median 只看 views>0）", () => {
  assert.equal(
    usageThreshold([P("a"), P("b"), P("c")], { a: 0, b: 20, c: 40 }),
    30,
  );
});

test("usageThreshold: 排除非公開工具", () => {
  assert.equal(
    usageThreshold([P("a"), P("x", "dev"), P("y", "pending")], {
      a: 8,
      x: 100,
      y: 100,
    }),
    8,
  );
});

test("usageThreshold: 全零瀏覽 → 地板 1", () => {
  assert.equal(usageThreshold([P("a"), P("b")], { a: 0, b: 0 }), 1);
  assert.equal(usageThreshold([P("a")], {}), 1);
});

test("usageThreshold: 非陣列 → 1", () => {
  assert.equal(usageThreshold(null, {}), 1);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/healthFlags.test.mjs`
Expected: FAIL（`usageThreshold is not a function`）

- [ ] **Step 3: 實作**（在 `healthFlags.mjs` 的 `toolFreshnessMs` 之後加入）

```js
/** 缺/非數值/負 → 0（比照 toolSignals.signal）。 */
function num(map, id) {
  const n = Number(map && typeof map === "object" ? map[id] : undefined);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 使用門檻 = 「views>0 的公開工具」views 中位數，地板 1。
 * 刻意排除零瀏覽工具：否則多數無瀏覽時 median=0、views≥0 恆真，使熱門但陳舊全觸發（噪音）。
 */
export function usageThreshold(tools, viewsMap) {
  if (!Array.isArray(tools)) return 1;
  const vals = tools
    .filter((t) => PUBLIC_STATUSES.has(t?.status))
    .map((t) => num(viewsMap, t?.id))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return 1;
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  return Math.max(1, median);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/healthFlags.test.mjs`
Expected: PASS（15 個 test）

- [ ] **Step 5: Commit**

```bash
git add src/lib/healthFlags.mjs src/lib/healthFlags.test.mjs
git commit -m "feat(health): usageThreshold（views>0 公開工具中位數，地板 1）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: `buildHealthReport`（四 flag + counts）

**Files:**

- Modify: `src/lib/healthFlags.mjs`
- Test: `src/lib/healthFlags.test.mjs`

- [ ] **Step 1: 加失敗測試**（append 到測試檔）

```js
import { buildHealthReport } from "./healthFlags.mjs";

const NOW = Date.parse("2026-06-21T00:00:00Z");
const DAY = 86400000;
const daysAgoTs = (d) => ts(NOW - d * DAY); // ts() 已在檔案上方定義
const T = (id, extra = {}) => ({
  id,
  title: id,
  status: "live",
  type: "webapp",
  ...extra,
});
const run = (tools, maps = {}) =>
  buildHealthReport(tools, { ...maps, nowMs: NOW });

// ---- 熱門但陳舊 ----
test("staleHot: 公開 + 有人用 + >180 天沒更新 → 命中", () => {
  const r = run([T("a", { updatedAt: daysAgoTs(200) })], {
    viewsMap: { a: 50 },
  });
  assert.equal(r.staleHot.length, 1);
  assert.equal(r.staleHot[0].id, "a");
  assert.equal(r.staleHot[0].ageDays, 200);
});

test("staleHot: 剛好 180 天（不 > 門檻）→ 不中；181 天 → 中", () => {
  assert.equal(
    run([T("a", { updatedAt: daysAgoTs(180) })], { viewsMap: { a: 50 } })
      .staleHot.length,
    0,
  );
  assert.equal(
    run([T("a", { updatedAt: daysAgoTs(181) })], { viewsMap: { a: 50 } })
      .staleHot.length,
    1,
  );
});

test("staleHot: fresh（近期更新）→ 不中", () => {
  assert.equal(
    run([T("a", { updatedAt: daysAgoTs(10) })], { viewsMap: { a: 50 } })
      .staleHot.length,
    0,
  );
});

test("staleHot: 沒人用（views<門檻 且 opens=0）→ 不中", () => {
  // 公開工具 a(0 view, 舊) + b(40 view, fresh) → 門檻=40；a 沒人用
  const r = run(
    [
      T("a", { updatedAt: daysAgoTs(300) }),
      T("b", { updatedAt: daysAgoTs(5) }),
    ],
    { viewsMap: { a: 0, b: 40 } },
  );
  assert.equal(r.staleHot.length, 0);
});

test("staleHot: opens>=1 也算有人用", () => {
  const r = run([T("a", { updatedAt: daysAgoTs(300) })], {
    viewsMap: { a: 0 },
    opensMap: { a: 2 },
  });
  assert.equal(r.staleHot.length, 1);
});

test("staleHot: import 工具只有 createdAt 又舊又被用 → 命中", () => {
  const r = run([T("a", { createdAt: daysAgoTs(400) })], {
    viewsMap: { a: 99 },
  });
  assert.equal(r.staleHot.length, 1);
});

// ---- 殭屍 ----
test("zombie: live + 近零使用 + >90 天 → 命中", () => {
  const r = run([T("z", { createdAt: daysAgoTs(120) })], {
    viewsMap: { z: 1 },
  });
  assert.equal(r.zombies.length, 1);
  assert.equal(r.zombies[0].id, "z");
});

test("zombie: 寬限期內（<90 天）→ 不中", () => {
  assert.equal(
    run([T("z", { createdAt: daysAgoTs(30) })], {}).zombies.length,
    0,
  );
});

test("zombie: 有 opens → 不中（fresh，避免落入 stale）", () => {
  const r = run(
    [T("z", { createdAt: daysAgoTs(200), updatedAt: daysAgoTs(5) })],
    { opensMap: { z: 1 } },
  );
  assert.equal(r.zombies.length, 0);
});

test("zombie: views >= 上限(3) → 不中（fresh）", () => {
  const r = run(
    [T("z", { createdAt: daysAgoTs(200), updatedAt: daysAgoTs(5) })],
    { viewsMap: { z: 3 } },
  );
  assert.equal(r.zombies.length, 0);
});

test("互斥: 被用又陳舊的公開工具進 staleHot、不進 zombie", () => {
  const r = run(
    [T("a", { createdAt: daysAgoTs(300), updatedAt: daysAgoTs(300) })],
    { viewsMap: { a: 80 } },
  );
  assert.equal(r.staleHot.length, 1);
  assert.equal(r.zombies.length, 0);
});

// ---- 卡關過久 ----
test("stuckPending: pending + >14 天 → 命中；<=14 天 → 不中", () => {
  const hit = run(
    [T("p", { status: "pending", createdAt: daysAgoTs(20) })],
    {},
  );
  assert.equal(hit.stuckPending.length, 1);
  assert.equal(hit.stuckPending[0].ageDays, 20);
  assert.equal(
    run([T("p", { status: "pending", createdAt: daysAgoTs(10) })], {})
      .stuckPending.length,
    0,
  );
});

test("stuckPending: pending 不參與 stale / zombie", () => {
  const r = run(
    [
      T("p", {
        status: "pending",
        createdAt: daysAgoTs(300),
        updatedAt: daysAgoTs(300),
      }),
    ],
    { viewsMap: { p: 99 } },
  );
  assert.equal(r.staleHot.length, 0);
  assert.equal(r.zombies.length, 0);
  assert.equal(r.stuckPending.length, 1);
});

// ---- 孤兒 key ----
test("orphanKeys: map 有 key 但無對應工具 → 列出（跨三 map union）", () => {
  const r = run([T("real", { createdAt: daysAgoTs(5) })], {
    viewsMap: { real: 5, ghost1: 9 },
    opensMap: { ghost2: 1 },
    helpfulMap: { ghost1: 2 },
  });
  assert.deepEqual(r.orphanKeys.map((o) => o.key).sort(), ["ghost1", "ghost2"]);
  const g1 = r.orphanKeys.find((o) => o.key === "ghost1");
  assert.equal(g1.views, 9);
  assert.equal(g1.helpful, 2);
});

test("orphanKeys: 對得上的工具不算孤兒", () => {
  assert.equal(
    run([T("real", { createdAt: daysAgoTs(5) })], { viewsMap: { real: 100 } })
      .orphanKeys.length,
    0,
  );
});

// ---- 整體 ----
test("nowMs 缺 / tools 非陣列 → 全空報告", () => {
  assert.deepEqual(buildHealthReport([T("a")], {}).counts, {
    staleHot: 0,
    zombies: 0,
    stuckPending: 0,
    orphanKeys: 0,
  });
  assert.deepEqual(buildHealthReport(null, { nowMs: NOW }).staleHot, []);
});

test("counts 與陣列長度一致", () => {
  const r = run(
    [
      T("s", { updatedAt: daysAgoTs(300) }),
      T("p", { status: "pending", createdAt: daysAgoTs(40) }),
    ],
    { viewsMap: { s: 50 } },
  );
  assert.equal(r.counts.staleHot, r.staleHot.length);
  assert.equal(r.counts.stuckPending, r.stuckPending.length);
});

test("不 mutate 輸入 tools", () => {
  const tools = Object.freeze([
    Object.freeze(T("a", { updatedAt: daysAgoTs(300) })),
  ]);
  assert.doesNotThrow(() => run(tools, { viewsMap: { a: 9 } }));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/healthFlags.test.mjs`
Expected: FAIL（`buildHealthReport is not a function`）

- [ ] **Step 3: 實作**（在 `healthFlags.mjs` 的 `usageThreshold` 之後加入）

```js
function buildOrphanKeys(idSet, viewsMap, opensMap, helpfulMap) {
  const keys = new Set();
  for (const m of [viewsMap, opensMap, helpfulMap]) {
    if (m && typeof m === "object") for (const k of Object.keys(m)) keys.add(k);
  }
  const out = [];
  for (const k of keys) {
    if (idSet.has(k)) continue;
    out.push({
      key: k,
      views: num(viewsMap, k),
      opens: num(opensMap, k),
      helpful: num(helpfulMap, k),
    });
  }
  return out;
}

function emptyReport() {
  return {
    staleHot: [],
    zombies: [],
    stuckPending: [],
    orphanKeys: [],
    counts: { staleHot: 0, zombies: 0, stuckPending: 0, orphanKeys: 0 },
  };
}

/**
 * 把工具 × 三訊號 join 成健檢報告。回新物件、不 mutate 輸入。
 * @param {object[]} tools getAllTools() 結果（含 pending）
 * @param {{viewsMap?:object, opensMap?:object, helpfulMap?:object, nowMs?:number}} opts
 */
export function buildHealthReport(tools, opts = {}) {
  const { viewsMap, opensMap, helpfulMap, nowMs } = opts || {};
  if (!Array.isArray(tools) || !Number.isFinite(nowMs)) return emptyReport();
  const now = nowMs;

  const threshold = usageThreshold(tools, viewsMap);
  const idSet = new Set(tools.map((t) => t?.id).filter(Boolean));

  const staleHot = [];
  const zombies = [];
  const stuckPending = [];

  for (const t of tools) {
    const id = t?.id;
    if (!id) continue;
    const status = t?.status || "";
    const views = num(viewsMap, id);
    const opens = num(opensMap, id);
    const helpful = num(helpfulMap, id);
    const base = {
      id,
      title: t?.title || id,
      status,
      type: t?.type || "",
      views,
      opens,
      helpful,
    };

    if (status === "pending") {
      const created = toMs(t?.createdAt);
      if (created != null && now - created > PENDING_STUCK_DAYS * DAY_MS) {
        stuckPending.push({
          ...base,
          ageDays: Math.floor((now - created) / DAY_MS),
        });
      }
      continue; // pending 不參與其他公開 flag
    }

    if (PUBLIC_STATUSES.has(status)) {
      const fresh = toolFreshnessMs(t);
      const isUsed = views >= threshold || opens >= 1;
      if (isUsed && fresh != null && now - fresh > STALE_DAYS * DAY_MS) {
        staleHot.push({
          ...base,
          lastUpdatedMs: fresh,
          ageDays: Math.floor((now - fresh) / DAY_MS),
        });
        continue; // 與 zombie 互斥
      }
    }

    if (status === "live") {
      const created = toMs(t?.createdAt);
      const isCold = views < ZOMBIE_VIEW_MAX && opens === 0 && helpful === 0;
      const pastGrace =
        created != null && now - created > ZOMBIE_GRACE_DAYS * DAY_MS;
      if (isCold && pastGrace) {
        zombies.push({
          ...base,
          ageDays: Math.floor((now - created) / DAY_MS),
        });
      }
    }
  }

  const orphanKeys = buildOrphanKeys(idSet, viewsMap, opensMap, helpfulMap);

  return {
    staleHot,
    zombies,
    stuckPending,
    orphanKeys,
    counts: {
      staleHot: staleHot.length,
      zombies: zombies.length,
      stuckPending: stuckPending.length,
      orphanKeys: orphanKeys.length,
    },
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/healthFlags.test.mjs`
Expected: PASS（全部，約 33 個 test）

- [ ] **Step 5: 跑全套單元測試確認沒打壞別的**

Run: `npm run test:unit`
Expected: PASS（既有測試 + 新 healthFlags 測試全綠）

- [ ] **Step 6: Commit**

```bash
git add src/lib/healthFlags.mjs src/lib/healthFlags.test.mjs
git commit -m "feat(health): buildHealthReport 四 flag（熱門陳舊/殭屍/卡關/孤兒 key）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: `HealthDashboard.jsx`（client 元件）

**Files:**

- Create: `src/components/HealthDashboard.jsx`

> 無單元測試（純 UI）；驗證走 `npm run lint` + `npm run build`。

- [ ] **Step 1: 建立元件檔（完整內容）**

```jsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAllTools } from "@/lib/db";
import { pickNumericFields } from "@/lib/numericMap.mjs";
import {
  buildHealthReport,
  STALE_DAYS,
  ZOMBIE_GRACE_DAYS,
  PENDING_STUCK_DAYS,
} from "@/lib/healthFlags.mjs";

// 近 N 天的 daily doc id（UTC YYYYMMDD）。比照 UsageDashboard（v1 刻意各持一份，見 plan 決策 2）。
function recentDayIds(n) {
  const ids = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    ids.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return ids;
}

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
const TH =
  "py-2 px-2 text-right font-bold text-xs text-[var(--color-text-mid)]";
const TD = "py-2 px-2 text-right tabular-nums text-[var(--color-text-dark)]";

function StatusPill({ status }) {
  if (!status) return null;
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_PILL[status] || STATUS_FALLBACK}`}
    >
      {status}
    </span>
  );
}

function ToolNameCell({ id, title, status }) {
  return (
    <td className="py-2 pr-3">
      <Link
        href={`/tool/${id}`}
        className="flex items-center gap-2 flex-wrap hover:underline"
      >
        <span className="font-bold text-[var(--color-text-dark)]">{title}</span>
        <StatusPill status={status} />
      </Link>
    </td>
  );
}

function FlagSection({ icon, title, desc, count, children }) {
  return (
    <div>
      <h3 className="font-extrabold text-[var(--color-text-dark)] flex items-center gap-2">
        <span>
          {icon} {title}
        </span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-card-border)] text-[var(--color-text-mid)]">
          {count}
        </span>
      </h3>
      <p className="text-xs text-[var(--color-text-mid)] mb-2">{desc}</p>
      {count === 0 ? (
        <p className="text-sm font-semibold text-green-600 dark:text-green-400">
          ✓ 沒有問題
        </p>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

export default function HealthDashboard() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [vSnap, hSnap, daySnaps, tools] = await Promise.all([
          getDoc(doc(db, "analytics", "toolViews")),
          getDoc(doc(db, "analytics", "toolHelpful")),
          Promise.all(
            recentDayIds(14).map((id) =>
              getDoc(doc(db, "analytics_daily", id)),
            ),
          ),
          getAllTools(),
        ]);

        const viewsMap = pickNumericFields(vSnap.exists() ? vSnap.data() : {});
        const helpfulMap = pickNumericFields(
          hSnap.exists() ? hSnap.data() : {},
        );

        const opensMap = {};
        for (const s of daySnaps) {
          if (!s.exists()) continue;
          const bt = s.data().byTool || {};
          for (const [tid, n] of Object.entries(bt)) {
            opensMap[tid] = (opensMap[tid] || 0) + (n || 0);
          }
        }

        setReport(
          buildHealthReport(tools, {
            viewsMap,
            opensMap,
            helpfulMap,
            nowMs: Date.now(),
          }),
        );
      } catch (e) {
        console.error("HealthDashboard 載入失敗：", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-[var(--color-text-mid)]">載入中…</p>;
  if (!report)
    return (
      <p className="text-[var(--color-text-mid)]">載入失敗，請重整頁面。</p>
    );

  const { staleHot, zombies, stuckPending, orphanKeys, counts } = report;

  return (
    <div className="flex flex-col gap-8">
      <FlagSection
        icon="🔥🕸"
        title="熱門但陳舊"
        count={counts.staleHot}
        desc={`有人在用、但超過 ${STALE_DAYS} 天沒更新 — 優先找人確認還能用。`}
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
              <th scope="col" className="py-2 pr-3 font-bold">
                工具
              </th>
              <th scope="col" className={TH}>
                👁 瀏覽
              </th>
              <th scope="col" className={TH}>
                📂 14d 開啟
              </th>
              <th scope="col" className={TH}>
                沒更新天數
              </th>
            </tr>
          </thead>
          <tbody>
            {staleHot.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--color-card-border)] last:border-0"
              >
                <ToolNameCell id={r.id} title={r.title} status={r.status} />
                <td className={TD}>{r.views.toLocaleString()}</td>
                <td className={TD}>{r.opens.toLocaleString()}</td>
                <td className={TD}>{r.ageDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FlagSection>

      <FlagSection
        icon="🧟"
        title="殭屍工具"
        count={counts.zombies}
        desc={`掛 live 但幾乎沒人用、上架已超過 ${ZOMBIE_GRACE_DAYS} 天 — 考慮推廣或下架。`}
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
              <th scope="col" className="py-2 pr-3 font-bold">
                工具
              </th>
              <th scope="col" className={TH}>
                👁 瀏覽
              </th>
              <th scope="col" className={TH}>
                👍 有幫助
              </th>
              <th scope="col" className={TH}>
                上架天數
              </th>
            </tr>
          </thead>
          <tbody>
            {zombies.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--color-card-border)] last:border-0"
              >
                <ToolNameCell id={r.id} title={r.title} status={r.status} />
                <td className={TD}>{r.views.toLocaleString()}</td>
                <td className={TD}>{r.helpful.toLocaleString()}</td>
                <td className={TD}>{r.ageDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FlagSection>

      <FlagSection
        icon="🐌"
        title="卡關過久"
        count={counts.stuckPending}
        desc={`送審後超過 ${PENDING_STUCK_DAYS} 天還是 pending — 該審核 / 處理。`}
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
              <th scope="col" className="py-2 pr-3 font-bold">
                工具
              </th>
              <th scope="col" className={TH}>
                等待天數
              </th>
            </tr>
          </thead>
          <tbody>
            {stuckPending.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--color-card-border)] last:border-0"
              >
                <ToolNameCell id={r.id} title={r.title} status={r.status} />
                <td className={TD}>{r.ageDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FlagSection>

      <FlagSection
        icon="👻"
        title="孤兒 analytics key"
        count={counts.orphanKeys}
        desc="analytics 殘留、對不到任何現存工具（工具被刪）— 純列出供核對。"
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-mid)] border-b border-[var(--color-card-border)]">
              <th scope="col" className="py-2 pr-3 font-bold">
                key
              </th>
              <th scope="col" className={TH}>
                👁 瀏覽
              </th>
              <th scope="col" className={TH}>
                📂 14d 開啟
              </th>
              <th scope="col" className={TH}>
                👍 有幫助
              </th>
            </tr>
          </thead>
          <tbody>
            {orphanKeys.map((r) => (
              <tr
                key={r.key}
                className="border-b border-[var(--color-card-border)] last:border-0"
              >
                <td className="py-2 pr-3 font-mono text-xs text-[var(--color-text-dark)] break-all">
                  {r.key}
                </td>
                <td className={TD}>{r.views.toLocaleString()}</td>
                <td className={TD}>{r.opens.toLocaleString()}</td>
                <td className={TD}>{r.helpful.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FlagSection>
    </div>
  );
}
```

- [ ] **Step 2: lint 確認無錯**

Run: `npm run lint`
Expected: 0 error（既有 2 個 img warning 不算；本檔不應新增 error）

- [ ] **Step 3: Commit**

```bash
git add src/components/HealthDashboard.jsx
git commit -m "feat(health): HealthDashboard 元件（四 flag 分區 + 空態正向回饋）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 掛 `health` tab 進 admin

**Files:**

- Modify: `app/admin/page.jsx`

- [ ] **Step 1: 加 import**

在 `import DemandBoard from "@/components/DemandBoard";`（約 line 21）下一行加：

```jsx
import HealthDashboard from "@/components/HealthDashboard";
```

- [ ] **Step 2: 加 nav button**

找到「📊 使用概況」按鈕的 `</button>`（約 line 229）與「💡 需求看板」按鈕（約 line 230）之間，插入：

```jsx
<button
  onClick={() => setActiveTab("health")}
  className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === "health" ? "bg-[var(--color-clay-purple)] text-white shadow-md" : "text-[var(--color-text-mid)] hover:bg-gray-100 dark:hover:bg-gray-700"}`}
>
  🩺 健檢
</button>
```

- [ ] **Step 3: 加 panel block**

找到 `{activeTab === "usage" && ( … <UsageDashboard /> … )}` 區塊的結尾（約 line 564）與 `{activeTab === "demand" && (`（約 line 565）之間，插入：

```jsx
{
  activeTab === "health" && (
    <div className="bg-[var(--color-card-bg)] rounded-[24px] shadow-sm border border-[var(--color-card-border)] p-8">
      <HealthDashboard />
    </div>
  );
}
```

- [ ] **Step 4: build 確認整合無誤**

Run: `npm run build`
Expected: 成功（admin 路由照常編譯；若遇 `fonts.gstatic.com` flake 重試即可，與本變更無關）

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(health): admin 掛載 🩺 健檢 分頁

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: 全套驗證 + 收尾

- [ ] **Step 1: 全套單元測試**

Run: `npm run test:unit`
Expected: 全綠（既有 + healthFlags 全部）

- [ ] **Step 2: lint**

Run: `npm run lint`
Expected: 0 error（僅既有 2 img warning）

- [ ] **Step 3: build**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: 推分支、開 PR**（依專案慣例；實際 review 由使用者派 `/codex:review`）

```bash
git push -u origin feature-health-dashboard
```

開 PR 後在描述列出：四 flag 定義、零 rules/migration/付費/依賴、Jason 部署後驗：admin 開「🩺 健檢」分頁 → 四分區出現、空區顯「✓ 沒有問題」、有問題的列連到 `/tool/{id}`、深色/窄螢幕可捲。

---

## Self-Review（plan 對照 spec）

- **Spec coverage**：四 flag（熱門陳舊/殭屍/卡關/孤兒）= Task 3 全覆蓋；freshness fallback = Task 1；median 地板 = Task 2；UI 四分區 + 空態 = Task 4；admin tab = Task 5；TDD = Task 1-3；零寫入/rules/付費 = 全程未碰。✅
- **getAllTools 含 pending**：已於 plan 撰寫前驗證（`getDocs(collection(db,"tools"))` 無 status 過濾）→ 卡關 flag 可用，spec 的「實作前確認」已結案。✅
- **Placeholder scan**：無 TBD/TODO；每步含完整 code/命令/預期輸出。✅
- **Type consistency**：`buildHealthReport` 回傳 `{staleHot,zombies,stuckPending,orphanKeys,counts}` 與元件解構一致；row 欄位（id/title/status/views/opens/helpful/ageDays、orphan 的 key/views/opens/helpful）與 Task 4 渲染一致；常數名（STALE_DAYS/ZOMBIE_GRACE_DAYS/PENDING_STUCK_DAYS）跨 Task 2/3/4 一致。✅
