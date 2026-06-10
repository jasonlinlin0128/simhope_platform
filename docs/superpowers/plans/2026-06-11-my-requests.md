# B-2b 需求迴路（我的需求）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 閉合 feature「提需求」迴路——登入時 server 端把 uid 連回需求，並在新 `/my-requests` 頁讓使用者看到自己需求的狀態。

**Architecture:** RequestCard 登入時送 Bearer token；`/api/request` feature 分支 `verifyIdToken` 取 uid 寫進 doc（匿名照舊）；firestore.rules 讓使用者讀自己的 request；`/my-requests` 用 `where uid==我` 等值查 + 純函式 client 排序（免 composite index）。

**Tech Stack:** Next.js 16 App Router / React 19 / firebase client + firebase-admin / node:test / @firebase/rules-unit-testing（emulator）。

**慣例：** Conventional Commits，每個 commit 結尾必加 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

### Task 1: firestore.rules — requests 讀自己 + emulator 測試（TDD）

**Files:**

- Modify: `firestore.rules`（requests match block read）
- Modify: `firestore.rules.test.mjs`（seed 加 3 筆 requests；檔末加 5 測試）

- [ ] **Step 1: seed 加 requests fixtures**

在 `firestore.rules.test.mjs` 的 `seed()` 內、`analytics_daily` setDoc 之後加：

```js
await setDoc(doc(db, "requests", "req_dev1"), {
  type: "feature",
  uid: "dev1",
  message: "m1",
  status: "pending",
  createdAt: 1000,
});
await setDoc(doc(db, "requests", "req_dev2"), {
  type: "feature",
  uid: "dev2",
  message: "m2",
  status: "pending",
  createdAt: 1000,
});
await setDoc(doc(db, "requests", "req_anon"), {
  type: "feature",
  message: "m3",
  status: "pending",
  createdAt: 1000, // 無 uid（匿名）
});
```

- [ ] **Step 2: 檔末加 5 測試**

在 `firestore.rules.test.mjs` 最後一個 `await it(...)` 之後、`// ===== TESTS END =====` 之前加：

```js
await it("48. dev1 讀自己的 request（uid 相符）→ ALLOW", async () => {
  await assertSucceeds(getDoc(doc(dev1, "requests", "req_dev1")));
});
await it("49. dev1 讀別人的 request → DENY", async () => {
  await assertFails(getDoc(doc(dev1, "requests", "req_dev2")));
});
await it("50. dev1 讀匿名 request（無 uid）→ DENY", async () => {
  await assertFails(getDoc(doc(dev1, "requests", "req_anon")));
});
await it("51. admin 讀任意 request → ALLOW", async () => {
  await assertSucceeds(getDoc(doc(admin, "requests", "req_dev2")));
  await assertSucceeds(getDoc(doc(admin, "requests", "req_anon")));
});
await it("52. anon（未登入）讀 request → DENY", async () => {
  await assertFails(getDoc(doc(anon, "requests", "req_dev1")));
});
```

- [ ] **Step 3: 跑 rules 測試確認新測試失敗**

Run: `npm run test:rules`
Expected: 既有 47 PASS；新測試中 **「48. dev1 讀自己」FAIL**（目前 read 僅 isAdmin → dev1 讀自己被擋）。其餘 deny 測試會 PASS（因目前更嚴格）。重點：48 FAIL。

- [ ] **Step 4: 改 rules**

把 `firestore.rules` 的 requests read：

```
    match /requests/{reqId} {
      allow read: if isAdmin();
      allow create: if false;
      allow update, delete: if isAdmin();
    }
```

改成：

```
    match /requests/{reqId} {
      allow read: if isAdmin()
        || (isSignedIn() && resource.data.uid == request.auth.uid);
      allow create: if false;
      allow update, delete: if isAdmin();
    }
```

- [ ] **Step 5: 跑 rules 測試確認全通過**

Run: `npm run test:rules`
Expected: 全部 PASS（47 + 5 = 52 條）

- [ ] **Step 6: Commit**

```bash
git add firestore.rules firestore.rules.test.mjs
git commit -m "feat(requests): firestore.rules — 使用者可讀自己的 request（uid 相符）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: `requests.mjs` — createdAt 排序純邏輯（TDD）

**Files:**

- Create: `src/lib/requests.mjs`
- Test: `src/lib/requests.test.mjs`

- [ ] **Step 1: 寫失敗測試**

Create `src/lib/requests.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortByCreatedAtDesc } from "./requests.mjs";

// 模擬 Firestore Timestamp（有 toMillis()）。
const ts = (ms) => ({ toMillis: () => ms });

test("依 createdAt 由新到舊排序", () => {
  const rows = [
    { id: "a", createdAt: ts(100) },
    { id: "b", createdAt: ts(300) },
    { id: "c", createdAt: ts(200) },
  ];
  assert.deepEqual(
    sortByCreatedAtDesc(rows).map((r) => r.id),
    ["b", "c", "a"],
  );
});

test("缺 createdAt 視為 0（排最後）、不爆", () => {
  const rows = [
    { id: "a", createdAt: ts(100) },
    { id: "b" }, // 無 createdAt
  ];
  assert.deepEqual(
    sortByCreatedAtDesc(rows).map((r) => r.id),
    ["a", "b"],
  );
});

test("不變動原陣列（回新陣列）", () => {
  const rows = [
    { id: "a", createdAt: ts(1) },
    { id: "b", createdAt: ts(2) },
  ];
  const out = sortByCreatedAtDesc(rows);
  assert.notEqual(out, rows);
  assert.equal(rows[0].id, "a"); // 原陣列順序不變
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './requests.mjs'`

- [ ] **Step 3: 寫實作**

Create `src/lib/requests.mjs`:

```js
// src/lib/requests.mjs
// requests 的純邏輯（無 firebase 依賴、node:test 可測）。

/**
 * 依 createdAt（Firestore Timestamp）由新到舊排序。缺 createdAt → 視為 0。
 * 回新陣列，不變動輸入。
 * @param {Array<{createdAt?: {toMillis: () => number}}>} rows
 */
export function sortByCreatedAtDesc(rows) {
  return [...rows].sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test:unit`
Expected: PASS（既有 49 + 新 3 = 52 tests pass）

- [ ] **Step 5: Commit**

```bash
git add src/lib/requests.mjs src/lib/requests.test.mjs
git commit -m "feat(requests): sortByCreatedAtDesc — client 端需求排序（純）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: `db.getMyRequests(uid)`

**Files:**

- Modify: `src/lib/db.js`（import requests.mjs；檔末加 getMyRequests）

- [ ] **Step 1: 加 import**

`src/lib/db.js` 頂部，`import { normalizeMetrics } from "./metrics.mjs";` 之後加：

```js
import { sortByCreatedAtDesc } from "./requests.mjs";
```

- [ ] **Step 2: 檔末加 getMyRequests**

`src/lib/db.js` 最末（`getMetrics` 之後）加：

```js
/**
 * 取目前使用者自己提的需求（feature requests），新→舊。
 * 用等值查 uid==X（免 composite index）+ client 排序。
 * @param {string} uid
 * @returns {Promise<object[]>}
 */
export async function getMyRequests(uid) {
  if (!uid) return [];
  const snap = await getDocs(
    query(collection(db, "requests"), where("uid", "==", uid)),
  );
  return sortByCreatedAtDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
```

（`collection`/`getDocs`/`query`/`where` 已在 db.js 既有 import 內。）

- [ ] **Step 3: 確認 build 通過**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.js
git commit -m "feat(requests): db.getMyRequests — 等值查自己的需求 + client 排序

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 4: `/api/request` feature 分支補 uid

**Files:**

- Modify: `app/api/request/route.js`（feature 分支：有有效 token 則寫 uid）

- [ ] **Step 1: 改 feature 分支**

把 `app/api/request/route.js` 的 feature 區塊（`// type === 'feature'：免登入提需求` 起，到 `add({...})` 為止）：

```js
// type === 'feature'：免登入提需求
const name = String(body.name || "")
  .slice(0, 50)
  .trim();
const contact = String(body.contact || "").slice(0, 100);
const message = String(body.message || "")
  .slice(0, 1000)
  .trim();
if (!name) return NextResponse.json({ error: "請填寫姓名" }, { status: 400 });
if (!message)
  return NextResponse.json({ error: "請填寫需求內容" }, { status: 400 });

const ref = await adminDb.collection("requests").add({
  type: "feature",
  name,
  contact,
  message,
  status: "pending",
  createdAt: FieldValue.serverTimestamp(),
});
```

改成（登入則從 Bearer token 補可信 uid，未登入/驗失敗則匿名）：

```js
// type === 'feature'：免登入提需求（登入則補可信 uid，讓使用者能在 /my-requests 看狀態）
const name = String(body.name || "")
  .slice(0, 50)
  .trim();
const contact = String(body.contact || "").slice(0, 100);
const message = String(body.message || "")
  .slice(0, 1000)
  .trim();
if (!name) return NextResponse.json({ error: "請填寫姓名" }, { status: 400 });
if (!message)
  return NextResponse.json({ error: "請填寫需求內容" }, { status: 400 });

// 有帶 Bearer token 且驗證通過 → 附上 server 端可信 uid；否則匿名（不拒絕）。
let featureUid = null;
const featAuth = req.headers.get("authorization") || "";
const featToken = featAuth.startsWith("Bearer ") ? featAuth.slice(7) : "";
if (featToken) {
  try {
    featureUid = (await adminAuth.verifyIdToken(featToken)).uid;
  } catch {
    featureUid = null; // 驗失敗 → 當匿名
  }
}

const featureDoc = {
  type: "feature",
  name,
  contact,
  message,
  status: "pending",
  createdAt: FieldValue.serverTimestamp(),
};
if (featureUid) featureDoc.uid = featureUid;
const ref = await adminDb.collection("requests").add(featureDoc);
```

- [ ] **Step 2: 確認 build 通過**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add app/api/request/route.js
git commit -m "feat(requests): /api/request feature 分支補可信 uid（登入時）

登入提需求帶 Bearer token → verifyIdToken 取 uid 寫進 doc；未登入 /
驗失敗則匿名照舊（維持免登入提需求）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 5: `RequestCard` 登入時帶 token

**Files:**

- Modify: `src/components/RequestCard.jsx`（import useAuth + auth；submit 帶 Authorization）

- [ ] **Step 1: 加 import**

`src/components/RequestCard.jsx` line 4（`import Modal from "@/components/Modal";`）之後加：

```js
import { useAuth } from "@/context/AuthContext";
```

- [ ] **Step 2: 元件內取 user**

把 `export default function RequestCard({ onClose }) {` 之後第一行（`const [name, setName] = useState("");`）前插入：

```js
const { user } = useAuth();
```

- [ ] **Step 3: submit 帶 token**

把 `submit` 內的 fetch（`const res = await fetch("/api/request", {...})`）改成：

```js
const headers = { "Content-Type": "application/json" };
if (user) {
  try {
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  } catch {
    /* 取 token 失敗 → 當匿名送 */
  }
}
const res = await fetch("/api/request", {
  method: "POST",
  headers,
  body: JSON.stringify({
    type: "feature",
    name: name.trim(),
    contact: contact.trim(),
    message: message.trim(),
  }),
});
```

- [ ] **Step 4: 確認 build 通過**

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: Commit**

```bash
git add src/components/RequestCard.jsx
git commit -m "feat(requests): RequestCard 登入時帶 Bearer token（補 uid）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 6: `/my-requests` 頁

**Files:**

- Create: `app/my-requests/page.jsx`

- [ ] **Step 1: 寫頁面**

Create `app/my-requests/page.jsx`:

```jsx
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { getMyRequests } from "@/lib/db";
import RequestCard from "@/components/RequestCard";
import LoginModal from "@/components/LoginModal";

const STATUS = {
  pending: {
    label: "🕓 評估中",
    cls: "bg-[var(--color-card-bg)] border border-[var(--color-card-border)] text-[var(--color-text-mid)]",
  },
  handled: {
    label: "✅ 已處理",
    cls: "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400",
  },
};

function fmtDate(createdAt) {
  const ms = createdAt?.toMillis?.();
  return ms ? new Date(ms).toLocaleDateString() : "";
}

export default function MyRequestsPage() {
  const { user, loading } = useAuth();
  const [reqs, setReqs] = useState([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [showReq, setShowReq] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setLoadingReqs(false);
      return;
    }
    getMyRequests(user.uid)
      .then(setReqs)
      .catch((e) => console.error("載入我的需求失敗:", e))
      .finally(() => setLoadingReqs(false));
  }, [user, loading]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-0 py-10">
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-black text-[var(--color-text-dark)] mb-3">
          我的需求
        </h1>
        <p className="text-[var(--color-text-mid)] font-semibold">
          你提過的需求與處理狀態。
        </p>
      </header>

      {loading || loadingReqs ? (
        <p className="text-center text-[var(--color-text-mid)]">載入中…</p>
      ) : !user ? (
        <div className="text-center py-12">
          <p className="text-[var(--color-text-mid)] font-semibold mb-4">
            請先登入查看你的需求。
          </p>
          <button
            onClick={() => setShowLogin(true)}
            className="px-6 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
          >
            登入👨‍💻 / 註冊🔑
          </button>
        </div>
      ) : reqs.length === 0 ? (
        <div className="text-center py-12 bg-[var(--color-card-bg)] border border-dashed border-[var(--color-card-border)] rounded-2xl">
          <p className="text-[var(--color-text-mid)] font-semibold mb-4">
            你還沒提過需求。
          </p>
          <button
            onClick={() => setShowReq(true)}
            className="px-6 py-2.5 rounded-full bg-[var(--color-clay-purple)] text-white font-extrabold text-sm"
          >
            💬 提需求
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reqs.map((r) => {
            const s = STATUS[r.status] || STATUS.pending;
            return (
              <div
                key={r.id}
                className="bg-[var(--color-card-bg)] border border-[var(--color-card-border)] rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${s.cls}`}
                  >
                    {s.label}
                  </span>
                  <span className="text-xs text-[var(--color-text-mid)] flex-shrink-0">
                    {fmtDate(r.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-dark)] whitespace-pre-wrap">
                  {r.message}
                </p>
              </div>
            );
          })}
          <button
            onClick={() => setShowReq(true)}
            className="self-center mt-2 px-5 py-2 rounded-full border border-[var(--color-card-border)] text-sm font-bold text-[var(--color-text-mid)] hover:bg-[var(--color-card-bg)]"
          >
            ＋ 再提一個需求
          </button>
        </div>
      )}

      {showReq && <RequestCard onClose={() => setShowReq(false)} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
```

> 註：依 spec，新提的需求需 reload 才出現（不加 submit 後自動 refetch；RequestCard 自身有「✅ 已送出」確認）。

- [ ] **Step 2: 確認 build 通過**

Run: `npm run build`
Expected: 成功，路由清單出現 `/my-requests`

- [ ] **Step 3: Commit**

```bash
git add app/my-requests/page.jsx
git commit -m "feat(requests): /my-requests 頁 — 列自己的需求 + 狀態徽章

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 7: Navbar 加「我的需求」入口

**Files:**

- Modify: `src/components/Navbar.jsx`（桌面 + 手機 登入後區塊各加 Link）

- [ ] **Step 1: 桌面登入後區塊加 Link**

把 `src/components/Navbar.jsx` 桌面的登入後區塊：

```jsx
          {!loading && user && (
            <>
              <Link
                href={isAdmin ? "/admin" : "/dashboard"}
                className="px-4 py-2 rounded-full bg-gradient-to-br from-violet-400 to-blue-400 text-white font-bold text-[0.82rem] shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                🛠️ {isAdmin ? "管理後台" : "我的工具"}
              </Link>
```

改成（在 🛠️ Link 前加「我的需求」文字連結）：

```jsx
          {!loading && user && (
            <>
              <Link
                href="/my-requests"
                className="hidden md:inline hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
              >
                我的需求
              </Link>
              <Link
                href={isAdmin ? "/admin" : "/dashboard"}
                className="px-4 py-2 rounded-full bg-gradient-to-br from-violet-400 to-blue-400 text-white font-bold text-[0.82rem] shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                🛠️ {isAdmin ? "管理後台" : "我的工具"}
              </Link>
```

- [ ] **Step 2: 手機選單登入後區塊加 Link**

把手機選單的登入後區塊：

```jsx
          {!loading && user && (
            <>
              <Link
                href={isAdmin ? "/admin" : "/dashboard"}
                onClick={() => setMenuOpen(false)}
              >
                🛠️ {isAdmin ? "管理後台" : "我的工具"}
              </Link>
```

改成：

```jsx
          {!loading && user && (
            <>
              <Link href="/my-requests" onClick={() => setMenuOpen(false)}>
                我的需求
              </Link>
              <Link
                href={isAdmin ? "/admin" : "/dashboard"}
                onClick={() => setMenuOpen(false)}
              >
                🛠️ {isAdmin ? "管理後台" : "我的工具"}
              </Link>
```

- [ ] **Step 3: 確認 build + lint 通過**

Run: `npm run build`
Expected: 成功

Run: `npm run lint`
Expected: 2 problems（0 errors, 2 warnings — 皆既有 tool/[id] `<img>`）

- [ ] **Step 4: Commit**

```bash
git add src/components/Navbar.jsx
git commit -m "feat(requests): Navbar 加「我的需求」入口（桌面 + 手機，登入後）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 8: 全套驗證

**Files:** 無（驗證 + 必要修正）

- [ ] **Step 1: 全部單元測試**

Run: `npm run test:unit`
Expected: PASS（52 tests：既有 49 + requests.mjs 3）

- [ ] **Step 2: rules 測試**

Run: `npm run test:rules`
Expected: PASS（52 條）

- [ ] **Step 3: build + lint**

Run: `npm run build`
Expected: 成功，路由含 `/my-requests`

Run: `npm run lint`
Expected: 2 warnings（皆既有）0 errors

- [ ] **Step 4: 最終 commit（若 step 1-3 有修正）**

```bash
git add -A
git commit -m "test(requests): 全套驗證綠（unit 52 / rules 52 / build / lint 基準）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

（若無修正則跳過。）

---

## 完成後（不在本計畫的自動步驟內）

1. **獨立 reviewer subagent** 審實作（對抗式）。
2. 開 PR、等 Jason merge。
3. **Jason 手動（merge + deploy 後）**：
   - 發布新 `firestore.rules`（requests read 加 own 分支；SA 無發布權→Console 手動貼）→ **立驗**：登入者讀自己的 request OK、讀別人擋、首頁/收件匣照常（P0 教訓）。
   - 無 migration / 無 TTL / 無 index。
4. **部署 + 發布後我代驗端到端**：登入提需求 → /my-requests 見 `🕓 評估中` → admin 後台標已處理 → reload 變 `✅ 已處理`；登出提需求不進 /my-requests。
