# 工具評分（👍 有幫助）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 詳情頁加「👍 有幫助」計數（沿用既有 analytics track 模式），顯示「N 人覺得有幫助」。

**Architecture:** 新 track 事件 `tool_helpful` → `buildIncrements` 回 `helpfulToolKey` → `/api/track` 累加 `analytics/toolHelpful.{id}`（鏡像 `tool_view`/`analytics/toolViews`）。`HelpfulButton`（client）讀 count（公開讀）+ localStorage 去重 + 樂觀更新，掛在詳情頁 view 模式。零 rules 變更、零依賴、零付費。

**Tech Stack:** Next.js 16 App Router, React 19, Firebase（Admin SDK 寫 / Web SDK 讀）, Tailwind 4, ESM, `node --test`。

**Spec:** `docs/superpowers/specs/2026-06-15-tool-helpful-design.md`

**驗證指令**

- 單元測試：`npm run test:unit`
- Lint：`npm run lint`
- Build：`npm run build`（若失敗訊息只有 `fonts.gstatic.com` / "Failed to fetch" 屬本機網路 flake，重跑即可，最多 2 次）

---

## File Structure

- `src/lib/trackEvents.mjs`（改）— 加 `tool_helpful` 事件 + `helpfulToolKey`
- `src/lib/trackEvents.test.mjs`（改）— 對應測試
- `app/api/track/route.js`（改）— 累加 `analytics/toolHelpful`
- `src/lib/track.js`（改）— `tool_helpful` 納入去重
- `src/components/HelpfulButton.jsx`（新）— 👍 元件
- `app/tool/[id]/page.jsx`（改）— 掛 `<HelpfulButton/>`

---

## Task 1: trackEvents 加 `tool_helpful`（TDD）

**Files:**

- Modify: `src/lib/trackEvents.mjs`, `src/lib/trackEvents.test.mjs`

- [ ] **Step 1: 改測試（先紅）** — 在 `src/lib/trackEvents.test.mjs`：

(a) 把 `eventField：已知事件回 camelCase 欄位` 測試改成（加一行 tool_helpful）：

```js
test("eventField：已知事件回 camelCase 欄位", () => {
  assert.equal(eventField("tool_open"), "toolOpen");
  assert.equal(eventField("tool_view"), "toolView");
  assert.equal(eventField("tool_helpful"), "toolHelpful");
  assert.equal(eventField("search"), "search");
  assert.equal(eventField("request_submit"), "requestSubmit");
});
```

(b) 把「`buildIncrements：...`」那 5 個測試（從 `tool_open + toolId` 到 `未知事件回 null`，檔尾整段）整段換成：

```js
test("buildIncrements：tool_open + toolId", () => {
  assert.deepEqual(buildIncrements("tool_open", "t1"), {
    field: "toolOpen",
    byToolKey: "t1",
    viewToolKey: null,
    helpfulToolKey: null,
  });
});

test("buildIncrements：tool_view + toolId", () => {
  assert.deepEqual(buildIncrements("tool_view", "t1"), {
    field: "toolView",
    byToolKey: null,
    viewToolKey: "t1",
    helpfulToolKey: null,
  });
});

test("buildIncrements：tool_helpful + toolId", () => {
  assert.deepEqual(buildIncrements("tool_helpful", "t1"), {
    field: "toolHelpful",
    byToolKey: null,
    viewToolKey: null,
    helpfulToolKey: "t1",
  });
});

test("buildIncrements：search 無 toolId → 三 key 皆 null", () => {
  assert.deepEqual(buildIncrements("search"), {
    field: "search",
    byToolKey: null,
    viewToolKey: null,
    helpfulToolKey: null,
  });
});

test("buildIncrements：未知事件回 null", () => {
  assert.equal(buildIncrements("evil", "t1"), null);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/trackEvents.test.mjs`
Expected: FAIL（現行無 `tool_helpful`、buildIncrements 無 `helpfulToolKey` → deepEqual 不符）

- [ ] **Step 3: 改實作** — 在 `src/lib/trackEvents.mjs`：

(a) `TRACK_EVENTS` 加一行：

```js
export const TRACK_EVENTS = {
  tool_open: "toolOpen",
  tool_view: "toolView",
  tool_helpful: "toolHelpful",
  search: "search",
  request_submit: "requestSubmit",
};
```

(b) `buildIncrements` 整段換成（加 `helpfulToolKey`）：

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
    // 有幫助 → 全期 analytics/toolHelpful（工具評分用）
    helpfulToolKey: event === "tool_helpful" ? id : null,
  };
}
```

（同時更新該函式上方 JSDoc `@returns` 提及 `helpfulToolKey`。）

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/trackEvents.test.mjs`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackEvents.mjs src/lib/trackEvents.test.mjs
git commit -m "feat(helpful): trackEvents 加 tool_helpful 事件 + helpfulToolKey

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: `/api/track` 累加 `analytics/toolHelpful`

**Files:**

- Modify: `app/api/track/route.js`

無純單元測試（Admin SDK）；`node --check` + build 驗。

- [ ] **Step 1: 加 ref** — 在 `app/api/track/route.js` 中，找到 `const toolViewsRef = adminDb.collection("analytics").doc("toolViews");`，在其後加一行：

```js
const toolHelpfulRef = adminDb.collection("analytics").doc("toolHelpful");
```

- [ ] **Step 2: 加寫入** — 找到既有的 `if (inc.viewToolKey) { batch.set(toolViewsRef, ... ); }` 區塊，在它之後（`await batch.commit();` 之前）插入：

```js
// 全期 per-tool 有幫助累計（工具評分用；同 toolViews 寫法）
if (inc.helpfulToolKey) {
  batch.set(
    toolHelpfulRef,
    {
      [inc.helpfulToolKey]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
```

- [ ] **Step 3: 語法檢查**

Run: `node --check app/api/track/route.js`
Expected: 無輸出（通過）

- [ ] **Step 4: Commit**

```bash
git add app/api/track/route.js
git commit -m "feat(helpful): tool_helpful 累加 analytics/toolHelpful

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: `track.js` 將 tool_helpful 納入去重

**Files:**

- Modify: `src/lib/track.js`

- [ ] **Step 1: 改 dedup + JSDoc** —
      (a) 把 JSDoc 的 `@param {"tool_open"|"tool_view"|"search"|"request_submit"} event` 改為：

```js
 * @param {"tool_open"|"tool_view"|"tool_helpful"|"search"|"request_submit"} event
```

(b) 把這行：

```js
const dedup = event === "tool_open" || event === "tool_view";
```

改為：

```js
const dedup =
  event === "tool_open" || event === "tool_view" || event === "tool_helpful";
```

- [ ] **Step 2: 語法檢查**

Run: `node --check src/lib/track.js`
Expected: 無輸出（通過）

- [ ] **Step 3: Commit**

```bash
git add src/lib/track.js
git commit -m "feat(helpful): track.js 將 tool_helpful 納入 session 去重

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: HelpfulButton 元件 + 掛到詳情頁

**Files:**

- Create: `src/components/HelpfulButton.jsx`
- Modify: `app/tool/[id]/page.jsx`

- [ ] **Step 1: 建立元件** — 建立 `src/components/HelpfulButton.jsx`：

```jsx
"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { track } from "@/lib/track";

/**
 * 詳情頁「👍 有幫助」。匿名 + localStorage/session 去重；count 讀自公開 analytics/toolHelpful。
 * @param {{ toolId: string }} props
 */
export default function HelpfulButton({ toolId }) {
  const [count, setCount] = useState(null); // null = 載入中
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    if (!toolId) return;
    try {
      setMarked(localStorage.getItem(`simhope_helpful_${toolId}`) === "1");
    } catch {
      /* 無痕/停用 → 視為未標記 */
    }
    let cancelled = false;
    getDoc(doc(db, "analytics", "toolHelpful"))
      .then((s) => {
        if (cancelled) return;
        const v = s.exists() ? s.data()[toolId] : 0;
        setCount(typeof v === "number" ? v : 0);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [toolId]);

  const onClick = () => {
    if (marked) return;
    track("tool_helpful", { toolId });
    try {
      localStorage.setItem(`simhope_helpful_${toolId}`, "1");
    } catch {
      /* 忽略 */
    }
    setMarked(true);
    setCount((c) => (typeof c === "number" ? c + 1 : 1));
  };

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--color-card-border)] pt-6">
      <span className="text-sm font-bold text-[var(--color-text-mid)]">
        這個工具對你有幫助嗎？
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={marked}
        className="px-4 py-2 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm disabled:opacity-60 disabled:cursor-default"
      >
        👍 {marked ? "已標記有幫助" : "有幫助"}
      </button>
      {typeof count === "number" && count > 0 && (
        <span className="text-sm text-[var(--color-text-mid)]">
          {count} 人覺得有幫助
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 掛到詳情頁** — 在 `app/tool/[id]/page.jsx`：
      (a) 於既有 component import 區加：

```js
import HelpfulButton from "@/components/HelpfulButton";
```

(b) 找到 **view 模式**（非 `isEditMode`）的主要內容渲染區——即顯示 `<DetailTabs .../>`（或工具 blocks）的地方。在該內容區塊「結束之後、仍在 view 模式 JSX 內」render：

```jsx
<HelpfulButton toolId={id} />
```

（注意：只在 view 模式顯示，不要放進 edit 模式分支。`id` 為該頁既有的工具 id 變數——用 `use(params)` 取得的那個。實作時讀檔確認 view-mode 容器的確切收尾位置再插入。）

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors（2 既有 `<img>` warning）

- [ ] **Step 4: Commit**

```bash
git add src/components/HelpfulButton.jsx "app/tool/[id]/page.jsx"
git commit -m "feat(helpful): HelpfulButton（詳情頁 👍 有幫助）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: 全量驗證

- [ ] **Step 1: 單元測試**

Run: `npm run test:unit`
Expected: 全綠、0 fail（trackEvents 測試更新後仍全過）。

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors（2 既有 `<img>` warning）

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: 收尾** — `git status` 乾淨；推 branch、開 PR。PR 標註：**沿用既有 analytics（tool_view 同款）、零付費 API、零依賴、無 rules/資料/SA → merge 即部署**。部署後驗：詳情頁出現 👍 +「N 人覺得有幫助」；點一下 → 變「✓ 已標記」、count+1；重整仍已標記；`analytics/toolHelpful` 有累加。

---

## 範圍外（路線圖）

5 星 / 👎、依 helpful 排序首頁、ToolCard 顯數字、per-user 帳號級評分與取消。
