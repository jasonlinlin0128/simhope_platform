# 需求迴路閉環 — 站內未讀通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 需求被 admin 標「已處理」後，提需求者於 Navbar「我的需求」看到未讀紅點，點進 `/my-requests` 後即時清除。

**Architecture:** 純函式 `requestNotify.mjs`（決定通知誰 + 是否顯示紅點）→ admin 標處理時寫提需求者 `users/{uid}.unreadHandledRequest=true` → Navbar 用 AuthContext 已載入的 `profile` 顯紅點 → `/my-requests` mount 清除 + `refreshProfile()`。站內、零外部 API、零付費、零 rules 變更。

**Tech Stack:** Next.js 16 App Router, React 19 (client components), Firebase Web SDK (Firestore setDoc/updateDoc), Tailwind 4, ESM, `node --test`。

**Spec:** `docs/superpowers/specs/2026-06-15-request-loop-notify-design.md`

**驗證指令**

- 單元測試：`npm run test:unit`
- Lint：`npm run lint`（會 parse JSX，可抓語法錯）
- Build：`npm run build`（若失敗訊息只有 `fonts.gstatic.com` / "Failed to fetch" 屬本機網路 flake，重跑即可，最多 2 次）

---

## File Structure

- `src/lib/requestNotify.mjs`（新）— `notifyUidForHandled` + `hasUnreadHandled` 純函式
- `src/lib/requestNotify.test.mjs`（新）— 測試
- `src/context/AuthContext.jsx`（改）— 暴露 `refreshProfile()`
- `src/components/RequestInbox.jsx`（改）— 標處理時寫 handledAt + 提需求者未讀旗標
- `src/components/Navbar.jsx`（改）— 「我的需求」未讀紅點（桌機 + 手機）
- `app/my-requests/page.jsx`（改）— mount 清除未讀 + refreshProfile

---

## Task 1: `requestNotify.mjs` 純函式（TDD）

**Files:**

- Create: `src/lib/requestNotify.mjs`
- Test: `src/lib/requestNotify.test.mjs`

- [ ] **Step 1: 寫測試（先紅）** — 建立 `src/lib/requestNotify.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyUidForHandled, hasUnreadHandled } from "./requestNotify.mjs";

test("notifyUidForHandled：有 uid → 回 uid", () => {
  assert.equal(notifyUidForHandled({ uid: "u1" }), "u1");
});

test("notifyUidForHandled：匿名（無 uid / 空字串）→ null", () => {
  assert.equal(notifyUidForHandled({ message: "x" }), null);
  assert.equal(notifyUidForHandled({ uid: "" }), null);
});

test("notifyUidForHandled：null / 非物件 → null（安全）", () => {
  assert.equal(notifyUidForHandled(null), null);
  assert.equal(notifyUidForHandled(undefined), null);
  assert.equal(notifyUidForHandled("x"), null);
});

test("hasUnreadHandled：unreadHandledRequest=true → true", () => {
  assert.equal(hasUnreadHandled({ unreadHandledRequest: true }), true);
});

test("hasUnreadHandled：false / 缺欄位 / null → false", () => {
  assert.equal(hasUnreadHandled({ unreadHandledRequest: false }), false);
  assert.equal(hasUnreadHandled({}), false);
  assert.equal(hasUnreadHandled(null), false);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/requestNotify.test.mjs`
Expected: FAIL（`Cannot find module './requestNotify.mjs'`）

- [ ] **Step 3: 寫實作** — 建立 `src/lib/requestNotify.mjs`：

```js
// src/lib/requestNotify.mjs
// 需求閉環「站內未讀通知」的純邏輯。無 firebase/browser 依賴，可 node:test。

/**
 * 標「已處理」時要通知誰：回 request 的 uid（非空字串）否則 null（匿名請求不通知）。
 * @param {{uid?:unknown}|null|undefined} request
 * @returns {string|null}
 */
export function notifyUidForHandled(request) {
  const uid = request && typeof request === "object" ? request.uid : null;
  return typeof uid === "string" && uid ? uid : null;
}

/**
 * Navbar「我的需求」是否顯示未讀紅點。
 * @param {{unreadHandledRequest?:unknown}|null|undefined} profile
 * @returns {boolean}
 */
export function hasUnreadHandled(profile) {
  return !!(profile && profile.unreadHandledRequest);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/requestNotify.test.mjs`
Expected: PASS（全部 5 個）

- [ ] **Step 5: Commit**

```bash
git add src/lib/requestNotify.mjs src/lib/requestNotify.test.mjs
git commit -m "feat(notify): requestNotify 純函式（通知對象 + 未讀判定）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 2: AuthContext 暴露 `refreshProfile()`

**Files:**

- Modify: `src/context/AuthContext.jsx`（整檔替換）

- [ ] **Step 1: 整檔替換** — 把 `src/context/AuthContext.jsx` 全部內容換成：

```jsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getUserProfile, ensureUserDoc } from "@/lib/db";

const AuthContext = createContext(null);

/** Subscribes to Firebase Auth state and fetches the Firestore user profile on sign-in. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // 首次登入（含 Google）若無 users 文件 → 自動建無 role 的 viewer
        await ensureUserDoc(currentUser);
        const userProfile = await getUserProfile(currentUser.uid);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 重抓目前使用者的 profile（如清除未讀後即時更新 Navbar 紅點）。
  const refreshProfile = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const userProfile = await getUserProfile(current.uid);
    setProfile(userProfile);
  }, []);

  const isAdmin = profile?.role === "admin";
  const isDeveloper = profile?.role === "developer";

  return (
    <AuthContext.Provider
      value={{ user, profile, isAdmin, isDeveloper, loading, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * @returns {{ user: import('firebase/auth').User|null, profile: object|null, isAdmin: boolean, isDeveloper: boolean, loading: boolean, refreshProfile: () => Promise<void> }}
 */
export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors（2 個既有 `<img>` warning 不算）

- [ ] **Step 3: Commit**

```bash
git add src/context/AuthContext.jsx
git commit -m "feat(auth): AuthContext 暴露 refreshProfile()

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 3: RequestInbox 標處理時寫 handledAt + 未讀旗標

**Files:**

- Modify: `src/components/RequestInbox.jsx`（imports + `markHandled`）

- [ ] **Step 1: 補 imports** — 在 `src/components/RequestInbox.jsx`：

(a) 把 firestore import（第 5–16 行那組）裡加入 `setDoc` 與 `serverTimestamp`。改成：

```js
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from "firebase/firestore";
```

(b) 在 `import { INPUT_BOX } from "@/lib/uiClasses";` 之後加一行：

```js
import { notifyUidForHandled } from "@/lib/requestNotify.mjs";
```

- [ ] **Step 2: 改 `markHandled`** — 把現有的 `markHandled` 函式（`const markHandled = async (r) => { ... };`）整段換成：

```js
const markHandled = async (r) => {
  try {
    await updateDoc(doc(db, "requests", r.id), {
      status: "handled",
      handledAt: serverTimestamp(),
      expireAt: newExpireAt(),
    });
    // 站內未讀通知：標記提需求者 profile（匿名請求無 uid → 跳過；失敗不擋主流程）
    const uid = notifyUidForHandled(r);
    if (uid) {
      try {
        await setDoc(
          doc(db, "users", uid),
          { unreadHandledRequest: true },
          { merge: true },
        );
      } catch (e2) {
        console.error("標記未讀失敗（不擋主流程）：", e2);
      }
    }
    setStatus(r.id, "handled");
  } catch (e) {
    toast.error("操作失敗：" + (e.code || e.message));
  }
};
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/components/RequestInbox.jsx
git commit -m "feat(notify): 標需求已處理時寫 handledAt + 提需求者未讀旗標

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 4: Navbar「我的需求」未讀紅點

**Files:**

- Modify: `src/components/Navbar.jsx`（useAuth 解構 + import + 桌機/手機連結）

- [ ] **Step 1: 加 import** — 在 `src/components/Navbar.jsx` 的 import 區（`import HubMark from "@/components/HubMark";` 之後）加一行：

```js
import { hasUnreadHandled } from "@/lib/requestNotify.mjs";
```

- [ ] **Step 2: 取 profile** — 把 `const { user, isAdmin, loading } = useAuth();` 改成：

```js
const { user, isAdmin, loading, profile } = useAuth();
```

- [ ] **Step 3: 桌機連結加紅點** — 把桌機版（`hidden md:inline`）的「我的需求」`<Link>`：

```jsx
<Link
  href="/my-requests"
  className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
>
  我的需求
</Link>
```

換成：

```jsx
<Link
  href="/my-requests"
  className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
>
  我的需求
  {hasUnreadHandled(profile) && (
    <span
      className="inline-block w-2 h-2 ml-1 rounded-full bg-red-500 align-middle"
      aria-label="有更新"
    />
  )}
</Link>
```

- [ ] **Step 4: 手機連結加紅點** — 把手機選單裡的「我的需求」`<Link>`：

```jsx
<Link href="/my-requests" onClick={() => setMenuOpen(false)}>
  我的需求
</Link>
```

換成：

```jsx
<Link href="/my-requests" onClick={() => setMenuOpen(false)}>
  我的需求
  {hasUnreadHandled(profile) && (
    <span
      className="inline-block w-2 h-2 ml-1 rounded-full bg-red-500 align-middle"
      aria-label="有更新"
    />
  )}
</Link>
```

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/Navbar.jsx
git commit -m "feat(notify): Navbar「我的需求」未讀紅點

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 5: /my-requests mount 清除未讀

**Files:**

- Modify: `app/my-requests/page.jsx`（imports + useAuth + 新 effect）

- [ ] **Step 1: 加 imports** — 在 `app/my-requests/page.jsx` 既有 import 後面加兩行：

```js
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
```

- [ ] **Step 2: 取 profile + refreshProfile** — 把 `const { user, loading } = useAuth();` 改成：

```js
const { user, loading, profile, refreshProfile } = useAuth();
```

- [ ] **Step 3: 加清除 effect** — 在現有「載入我的需求」的 `useEffect(...)` 之後，新增一個 effect：

```js
// 進來這頁就算「已讀」：清掉未讀旗標並即時刷新 profile（Navbar 紅點消失）
useEffect(() => {
  if (loading || !user || !profile?.unreadHandledRequest) return;
  let cancelled = false;
  setDoc(
    doc(db, "users", user.uid),
    { unreadHandledRequest: false },
    { merge: true },
  )
    .then(() => {
      if (!cancelled) refreshProfile();
    })
    .catch((e) => console.error("清除未讀失敗:", e));
  return () => {
    cancelled = true;
  };
}, [user, loading, profile, refreshProfile]);
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add app/my-requests/page.jsx
git commit -m "feat(notify): /my-requests 進入即清除未讀 + 刷新 profile

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## Task 6: 全量驗證

- [ ] **Step 1: 單元測試**

Run: `npm run test:unit`
Expected: 全綠（原 95 + 5 requestNotify = 100 上下；以實際輸出為準、0 fail）

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: 收尾** — `git status` 乾淨；推 branch、開 PR。PR 說明標註：**站內通知、零外部 API、零付費、無 rules/資料/SA → merge 即部署**；部署後 Jason 驗：①admin 標某登入者需求「已處理」→ 該帳號 Navbar「我的需求」出現紅點 ②點進 /my-requests → 紅點消失、該筆顯 ✅ ③匿名需求標處理 → 不報錯、無 user 寫入。

---

## 範圍外（路線圖）

email / LINE 推播、未讀數量與逐筆已讀、其它通知類型。
