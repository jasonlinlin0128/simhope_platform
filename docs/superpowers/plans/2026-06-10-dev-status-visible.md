# B-2a 開發者申請狀態可見 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/access` 把使用者已維護但從未顯示的開發者申請狀態（pending/approved/rejected）渲染出來，關掉申請黑洞並擋掉重複送申請。

**Architecture:** 純函式 `devCtaState(role, devStatus)` 決定 CTA 狀態（client/server-agnostic、node:test 可測）；`<DevStatusCTA>` 元件吃 `useAuth()` 依狀態渲染 apply/pending/rejected/none；`/access` 把 inline 申請鈕換成這顆元件。零 rules / 零 uid / 零後端。

**Tech Stack:** Next.js 16 App Router / React 19 / firebase client（只讀自己的 users doc，已由 AuthContext profile 提供）/ node:test。

**慣例：** Conventional Commits，每個 commit 結尾必加 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

### Task 1: `devStatus.mjs` — CTA 狀態純邏輯（TDD）

**Files:**

- Create: `src/lib/devStatus.mjs`
- Test: `src/lib/devStatus.test.mjs`

- [ ] **Step 1: 寫失敗測試**

Create `src/lib/devStatus.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { devCtaState } from "./devStatus.mjs";

test("developer / admin → none（已有權限，角色卡已表達）", () => {
  assert.equal(devCtaState("developer", undefined), "none");
  assert.equal(devCtaState("developer", "approved"), "none");
  assert.equal(devCtaState("admin", undefined), "none");
});

test("viewer 無 devStatus → apply", () => {
  assert.equal(devCtaState("viewer", undefined), "apply");
  assert.equal(devCtaState("viewer", null), "apply");
  assert.equal(devCtaState("viewer", ""), "apply");
});

test("viewer + pending → pending", () => {
  assert.equal(devCtaState("viewer", "pending"), "pending");
});

test("viewer + rejected → rejected", () => {
  assert.equal(devCtaState("viewer", "rejected"), "rejected");
});

test("viewer + approved（防呆：role 尚未升級）→ none", () => {
  assert.equal(devCtaState("viewer", "approved"), "none");
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './devStatus.mjs'`

- [ ] **Step 3: 寫實作**

Create `src/lib/devStatus.mjs`:

```js
// src/lib/devStatus.mjs
// /access 開發者卡的 CTA 狀態決策（純邏輯、無 firebase/browser 依賴、node:test 可測）。
// 呼叫端（DevStatusCTA）已先過濾未登入 → role 只會是 admin/developer/viewer。

/**
 * @param {"admin"|"developer"|"viewer"} role
 * @param {string|null|undefined} devStatus  users/{uid}.devStatus
 * @returns {"apply"|"pending"|"rejected"|"none"}
 */
export function devCtaState(role, devStatus) {
  if (role === "developer" || role === "admin") return "none"; // 已有權限
  if (devStatus === "pending") return "pending";
  if (devStatus === "rejected") return "rejected";
  if (devStatus === "approved") return "none"; // 理論上 role 已 developer；防呆
  return "apply"; // viewer 無 devStatus：可申請
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（既有 42 + 新 5 = 47 tests pass）

- [ ] **Step 5: Commit**

```bash
git add src/lib/devStatus.mjs src/lib/devStatus.test.mjs
git commit -m "feat(access): devCtaState 純邏輯 — role×devStatus → CTA 狀態

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: `DevStatusCTA.jsx` — 狀態渲染元件

**Files:**

- Create: `src/components/DevStatusCTA.jsx`

無單元測試（純邏輯已在 `devStatus.mjs` 測過；本檔是 useAuth glue + JSX）。

- [ ] **Step 1: 寫實作**

Create `src/components/DevStatusCTA.jsx`:

```jsx
"use client";

import { useAuth } from "@/context/AuthContext";
import { devCtaState } from "@/lib/devStatus.mjs";

/**
 * /access 開發者角色卡的 CTA：依使用者 role + devStatus 顯示
 * 申請鈕 / 審核中 / 未通過(+重新申請) / 不顯示。
 * @param {{ onApply: () => void }} props  onApply：開 LoginModal 申請流程
 */
export default function DevStatusCTA({ onApply }) {
  const { user, isAdmin, isDeveloper, profile } = useAuth();
  if (!user) return null; // 未登入：頁面別處已有「登入後即可申請」

  const role = isAdmin ? "admin" : isDeveloper ? "developer" : "viewer";
  const state = devCtaState(role, profile?.devStatus);

  if (state === "none") return null;

  if (state === "apply") {
    return (
      <button
        onClick={onApply}
        className="mt-5 w-full py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
      >
        📩 申請成為開發者
      </button>
    );
  }

  if (state === "pending") {
    return (
      <div className="mt-5 w-full py-2.5 px-3 rounded-2xl bg-[var(--color-card-bg)] border border-[var(--color-card-border)] text-center text-sm font-bold text-[var(--color-text-mid)]">
        🕓 申請審核中，佳賢跟他的代理人評估後會通知你
      </div>
    );
  }

  // state === "rejected"
  return (
    <div className="mt-5 w-full flex flex-col gap-2">
      <div className="py-2.5 px-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center text-sm font-bold text-red-600 dark:text-red-400">
        ✕ 申請未通過
      </div>
      <p className="text-xs text-center text-[var(--color-text-mid)]">
        如需重新申請請聯絡佳賢
      </p>
      <button
        onClick={onApply}
        className="w-full py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
      >
        📩 重新申請
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 確認 build 通過**

Run: `npm run build`
Expected: 成功（元件尚未被引用也應 build 過）

- [ ] **Step 3: Commit**

```bash
git add src/components/DevStatusCTA.jsx
git commit -m "feat(access): DevStatusCTA 元件 — 申請/審核中/未通過(+重新申請)

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: `/access` 串接 + 驗證

**Files:**

- Modify: `app/access/page.jsx`（加 import；apply 鈕 → `<DevStatusCTA>`）

- [ ] **Step 1: 加 import**

`app/access/page.jsx` line 5 後加：

```js
import DevStatusCTA from "@/components/DevStatusCTA";
```

- [ ] **Step 2: 換掉 inline 申請鈕**

把 `app/access/page.jsx:104-111`：

```jsx
{
  r.key === "developer" && current === "viewer" && (
    <button
      onClick={() => setShowReq(true)}
      className="mt-5 w-full py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
    >
      📩 申請成為開發者
    </button>
  );
}
```

換成：

```jsx
{
  r.key === "developer" && <DevStatusCTA onApply={() => setShowReq(true)} />;
}
```

- [ ] **Step 3: 確認 build + lint 通過**

Run: `npm run build`
Expected: 成功

Run: `npm run lint`
Expected: 2 problems（0 errors, 2 warnings — 皆既有 tool/[id] `<img>`）

- [ ] **Step 4: 全套單元測試**

Run: `npm run test:unit`
Expected: PASS（47 tests）

- [ ] **Step 5: Commit**

```bash
git add app/access/page.jsx
git commit -m "feat(access): /access 申請鈕換成 DevStatusCTA — 顯示申請狀態

順手修：pending 申請者不再看到申請鈕（擋重複送）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## 完成後（不在本計畫的自動步驟內）

1. **獨立 reviewer subagent** 審實作（對抗式）。
2. 開 PR、等 Jason merge。
3. **部署後驗證（我代驗）**：Admin SDK 設 testdev `devStatus`=pending / rejected / 清空 → playwright 登入 /access 截三態、驗 rejected 有「重新申請」鈕、pending 無鈕、developer 帳號看自己卡無 CTA。無 rules / migration / Console 步驟。
