# 🔒 analytics 逐工具明細讀取收斂 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `firestore.rules` 對 `analytics/{docId}` 的萬用公開讀取規則拆成三條明確路徑，讓 `analytics/toolViews`/`toolHelpful`（含 pending 尚未審核工具的逐工具計數）收斂成 admin-only，同時把目前唯一合法的公開讀取（`HelpfulButton` 的單一數字）改走一支不會連帶洩漏整份 map 的新 API，並把伺服器端的匿名讀取（`serverCatalog.js`）換成 Admin SDK 以免被同一次規則收緊波及。

**Architecture:** 純規則收斂 + 兩處讀取路徑搬遷，零資料結構變更、零 migration、零新 collection。`analytics/totals`（聚合，無逐工具拆分）完全不動。

**Tech Stack:** Next.js 16 (App Router) / React 19 / Firebase (Firestore rules + Admin SDK) / `node --test`（純函式與 rules 皆用 node test runner）。

**Spec:** `docs/superpowers/specs/2026-07-18-analytics-read-lockdown-design.md`

## Global Constraints

- `firestore.rules` 的變更需 Jason 手動在 Firebase Console 發布（Admin SDK service account 沒有 `firebaserules.releases.create` 權限）——這個 plan 只負責把 rules 檔案改好、測試綠燈，發布本身是 code merge/deploy 之後的手動步驟（見 Task 6）。
  - ⚠️ **跨分支協調風險**：Console 發布會用送出的那份 ruleset **整份取代**正式環境現有規則。`feature-portal-registry`（PR #71，截至寫這份 plan 時仍未合併）也改了 `firestore.rules`（加 registry/員工相關規則）。若發布當下 PR #71 還沒 merge，**不可**只發布這條分支（`feature-analytics-read-lockdown`）孤立版本的 `firestore.rules`，否則會靜默蓋掉/漏掉 PR #71 那條分支的規則。正確做法：等本分支與 PR #71 都 merge 進 `main` 之後，用當時 `main` 上最終合併版的 `firestore.rules` 一次發布。
- 新 API 不驗證 `toolId` 是否存在——未知 id 一律回 `count:0`，不做額外的存在性查詢（見 spec「殘餘風險」段落，刻意決定）。
- 這個 repo 的 API route handler 一律沒有專屬的 route-level 單元測試——手動 curl 驗證 + `firestore.rules.test.mjs` 是既有的驗證方式，這個 plan 沿用，不新增 route-level test 框架。

---

## File Structure

| 檔案                                             | 責任                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `firestore.rules`（改）                          | `analytics/{docId}` 拆成 `analytics/totals`（公開不動）/ `analytics/toolViews`（admin-only）/ `analytics/toolHelpful`（admin-only） |
| `firestore.rules.test.mjs`（改）                 | seed 新增 `toolViews`/`toolHelpful` 種子資料；新增 6 條測試                                                                         |
| `src/lib/serverCatalog.js`（改）                 | `getServerToolViews()`/`getServerToolHelpful()` 從匿名 REST 改用 Admin SDK                                                          |
| `app/api/tool-helpful/[toolId]/route.js`（新增） | `GET`：限流 + 回單一 toolId 的 helpful count                                                                                        |
| `src/components/HelpfulButton.jsx`（改）         | 讀取來源從 `getDoc` 改成 `fetch` 新 API                                                                                             |

---

## Task 1: firestore.rules — 拆分 analytics 讀取規則

**Files:**

- Modify: `firestore.rules:176-185`

**Interfaces:**

- Produces: `analytics/toolViews`、`analytics/toolHelpful` 兩份文件的讀取權限收斂為 `isAdmin()`；`analytics/totals` 維持 `allow read: if true`。後續 Task 2 的 rules 測試、Task 3 的 Admin SDK 讀取都依賴這個收斂後的行為。

- [ ] **Step 1: 修改規則**

Old（`firestore.rules:176-185`）：

```
    // 使用數據：累計數公開可讀（首頁顯示）；每日明細僅 admin 讀；
    // 一律禁止 client 寫（只 Admin SDK 經 /api/track 寫，防灌水）。
    match /analytics/{docId} {
      allow read: if true;
      allow write: if false;
    }
    match /analytics_daily/{day} {
      allow read: if isAdmin();
      allow write: if false;
    }
```

New：

```
    // 使用數據：totals 是聚合、無逐工具拆分，公開可讀（首頁顯示）；
    // toolViews/toolHelpful 是逐工具明細，收斂為 admin-only——否則任何人
    // 直接呼叫 Firestore SDK 就能得知 pending（尚未審核、不在公開 catalog 內）
    // 工具的存在與熱門度
    // （2026-07-18 安全性 review 找到，見 docs/superpowers/specs/2026-07-18-analytics-read-lockdown-design.md）。
    // 每日明細僅 admin 讀；一律禁止 client 寫（只 Admin SDK 經 /api/track 寫，防灌水）。
    match /analytics/totals {
      allow read: if true;
      allow write: if false;
    }
    match /analytics/toolViews {
      allow read: if isAdmin();
      allow write: if false;
    }
    match /analytics/toolHelpful {
      allow read: if isAdmin();
      allow write: if false;
    }
    match /analytics_daily/{day} {
      allow read: if isAdmin();
      allow write: if false;
    }
```

- [ ] **Step 2: 先不 commit**

這個檔案的變更要跟 Task 2 的測試一起 commit（沒有 emulator 測試綠燈就先 commit rules 很容易漏改），繼續進行 Task 2。

---

## Task 2: firestore.rules.test.mjs — 補測試

**Files:**

- Modify: `firestore.rules.test.mjs:67-69`（seed 新增文件）
- Modify: `firestore.rules.test.mjs`（在 `// ===== TESTS END =====` 之前插入新測試區塊，約在第 484 行前）

**Interfaces:**

- Consumes: Task 1 改好的 `firestore.rules`。
- Produces: 驗證 `analytics/toolViews`/`toolHelpful` 對 anon/非 admin DENY、admin ALLOW（read）且一律 DENY write；`analytics/totals` 的既有測試（#43-45）不受影響，作為回歸鎖。

- [ ] **Step 1: seed 新增種子文件**

Old（`firestore.rules.test.mjs:67-69`）：

```js
await setDoc(doc(db, "analytics", "totals"), {
  toolOpen: 5,
  toolView: 9,
});
```

New：

```js
await setDoc(doc(db, "analytics", "totals"), {
  toolOpen: 5,
  toolView: 9,
});
await setDoc(doc(db, "analytics", "toolViews"), {
  t_live: 5,
  t_hidden: 2, // t_hidden 模擬 pending（尚未審核，不在公開 catalog 內）但仍有計數的工具
});
await setDoc(doc(db, "analytics", "toolHelpful"), {
  t_live: 3,
  t_hidden: 1,
});
```

- [ ] **Step 2: 寫測試（先確認會 FAIL）**

在檔案裡 `// ===== TESTS END =====` 這一行**之前**插入：

```js
// ===== analytics 逐工具明細（收斂為 admin-only，2026-07-18）=====
console.log("analytics 逐工具明細（toolViews/toolHelpful 收斂為 admin-only）:");
await it("94. anon 不可讀 analytics/toolViews（收斂前可讀，現在不行）→ DENY", async () => {
  await assertFails(getDoc(doc(anon, "analytics", "toolViews")));
});
await it("95. dev1（一般登入非 admin）不可讀 analytics/toolViews → DENY", async () => {
  await assertFails(getDoc(doc(dev1, "analytics", "toolViews")));
});
await it("96. admin 可讀 analytics/toolViews、但仍不可寫", async () => {
  await assertSucceeds(getDoc(doc(admin, "analytics", "toolViews")));
  await assertFails(
    setDoc(doc(admin, "analytics", "toolViews"), { t_live: 999 }),
  );
});
await it("97. anon 不可讀 analytics/toolHelpful → DENY", async () => {
  await assertFails(getDoc(doc(anon, "analytics", "toolHelpful")));
});
await it("98. dev1 不可讀 analytics/toolHelpful → DENY", async () => {
  await assertFails(getDoc(doc(dev1, "analytics", "toolHelpful")));
});
await it("99. admin 可讀 analytics/toolHelpful、但仍不可寫", async () => {
  await assertSucceeds(getDoc(doc(admin, "analytics", "toolHelpful")));
  await assertFails(
    setDoc(doc(admin, "analytics", "toolHelpful"), { t_live: 999 }),
  );
});
```

Run: `npm run test:rules`
Expected（改 Task 1 之前跑，用 git stash 或直接照順序做）：在 `firestore.rules` 還沒改的狀態下，#94/#95/#97/#98 會 FAIL（因為舊規則 `allow read: if true` 讓 anon/dev1 都能讀到，`assertFails` 會抓不到失敗）；#96/#99 的 read 部分會 PASS、write 部分維持 PASS（因為舊規則本來就 `allow write: if false`）。

- [ ] **Step 3: 確認 Task 1 的規則改動讓測試全部通過**

Task 1 的 `firestore.rules` 改動應該已經在檔案裡（照上面順序，Task 1 Step 1 已經改完，只是還沒 commit）。

Run: `npm run test:rules`
Expected: 全部 PASS（含新增的 94-99，以及既有 #43-45 的 `analytics/totals` 測試維持 ALLOW/DENY 不變——這是回歸鎖，確認拆開三條規則後 totals 的公開讀取沒有被誤鎖）。

- [ ] **Step 4: Commit（Task 1 + Task 2 一起）**

```bash
git add firestore.rules firestore.rules.test.mjs
git commit -m "$(cat <<'EOF'
fix(rules): analytics 逐工具明細收斂為 admin-only

analytics/{docId} 原本是一條萬用 allow read:if true，連 toolViews/
toolHelpful 這兩份含逐工具計數（含 pending 尚未審核工具）的文件也一
起公開。任何人直接呼叫 Firestore SDK 就能得知 pending 工具的存在與熱門
度，等於在正式審核/上架之前就洩漏了它們。拆成三條明確規則：
totals（聚合、無逐工具拆分）維持公開，toolViews/toolHelpful 收斂為
isAdmin()。emulator 新增 6 條測試（94-99），既有 totals 測試（43-45）
作回歸鎖確認拆分後行為不變。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 3: serverCatalog.js — 改用 Admin SDK 讀取

**Files:**

- Modify: `src/lib/serverCatalog.js:1-10,119-152`

**Interfaces:**

- Consumes: `getAdmin` from `@/lib/firebaseAdmin`（這個 repo 既有的 Admin SDK 讀取函式共用的匯入）；`pickNumericFields` from `./numericMap.mjs`（既有匯入不變）。
- Produces: `getServerToolViews()`/`getServerToolHelpful()` 回傳值形狀不變（`Promise<Record<string,number>>`），`app/page.jsx`、`app/hub/page.jsx` 的呼叫端完全不用改。

- [ ] **Step 1: 加 import**

Old（`src/lib/serverCatalog.js:1-11`）：

```js
// src/lib/serverCatalog.js
// Server-only 公開資料抓取（RSC 公開頁用）。Firestore REST + ISR 快取，
// 匿名讀（受 firestore.rules 約束，只回公開資料）；不用 firebase client SDK。
import { docToObject } from "./firestoreValue.mjs";
import { normalizeMetrics } from "./metrics.mjs";
import { pickNumericFields } from "./numericMap.mjs";
import { DEFAULT_SITE } from "./siteDefaults";

const PROJECT_ID = "simhope-platform";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const REVALIDATE = 300; // 5 分鐘 ISR
```

New：

```js
// src/lib/serverCatalog.js
// Server-only 公開資料抓取（RSC 公開頁用）。多數走 Firestore REST + ISR 快取的
// 匿名讀（受 firestore.rules 約束，只回公開資料）；toolViews/toolHelpful 兩支
// 例外——2026-07-18 rules 收斂後這兩份文件變成 admin-only，改走 Admin SDK
// （伺服器對伺服器，繞過 rules，本來就是可信邊界內）。
import { docToObject } from "./firestoreValue.mjs";
import { normalizeMetrics } from "./metrics.mjs";
import { pickNumericFields } from "./numericMap.mjs";
import { DEFAULT_SITE } from "./siteDefaults";
import { getAdmin } from "./firebaseAdmin";

const PROJECT_ID = "simhope-platform";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const REVALIDATE = 300; // 5 分鐘 ISR
```

- [ ] **Step 2: 改 getServerToolViews / getServerToolHelpful**

Old（`src/lib/serverCatalog.js:119-151`，函式本體）：

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
    return pickNumericFields(docToObject(await res.json()));
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
    return pickNumericFields(docToObject(await res.json()));
  } catch {
    return {};
  }
}
```

New：

```js
/**
 * 全期 per-tool 瀏覽數（analytics/toolViews doc）。doc 不存在 / 失敗 → {}。
 * 只回數值欄位（濾掉 updatedAt 等非數值 key）。
 *
 * ⚠️ 2026-07-18 起 analytics/toolViews 收斂為 admin-only（見 docs/superpowers/
 * specs/2026-07-18-analytics-read-lockdown-design.md），這裡**必須**用 Admin
 * SDK（伺服器對伺服器，繞過 rules）——舊的匿名 REST 讀法在收斂後會回 403。
 * 沒有 ISR 快取（Admin SDK 讀不支援 Next fetch cache，views 本來就是動態值）。
 * @returns {Promise<Record<string, number>>}
 */
export async function getServerToolViews() {
  try {
    const { adminDb } = getAdmin();
    const snap = await adminDb.collection("analytics").doc("toolViews").get();
    return pickNumericFields(snap.exists ? snap.data() : {});
  } catch {
    return {};
  }
}

/**
 * 全期 per-tool 有幫助數（analytics/toolHelpful doc）。doc 不存在 / 失敗 → {}。
 * 只回數值欄位（濾掉 updatedAt 等非數值 key）。鏡像 getServerToolViews()。
 * 同樣因 rules 收斂改走 Admin SDK，見上方註解。
 * @returns {Promise<Record<string, number>>}
 */
export async function getServerToolHelpful() {
  try {
    const { adminDb } = getAdmin();
    const snap = await adminDb.collection("analytics").doc("toolHelpful").get();
    return pickNumericFields(snap.exists ? snap.data() : {});
  } catch {
    return {};
  }
}
```

- [ ] **Step 3: 確認沒有語法/型別錯誤**

Run: `npm run lint`
Expected: 0 error（跟修改前基準一致）。

`getServerToolViews`/`getServerToolHelpful` 沒有專屬單元測試檔（原本就沒有——這支要嘛打真的 Firestore REST 嘛現在打 Admin SDK，兩者都需要真實環境才能測，跟專案裡其他 Admin SDK 讀取函式一致，靠 Task 6 的手動驗證清單覆蓋）。

- [ ] **Step 4: Commit**

```bash
git add src/lib/serverCatalog.js
git commit -m "$(cat <<'EOF'
fix(catalog): getServerToolViews/ToolHelpful 改用 Admin SDK

analytics/toolViews、toolHelpful 兩份文件的 rules 已收斂為 admin-only
（見上一個 commit），這兩支原本走匿名 REST 的伺服器函式在收斂後會被
擋 403，導致首頁熱門排行、/hub 排行、helpful badge 全部讀不到數字。
改用 Admin SDK 直接讀（伺服器對伺服器，繞過 rules）；回傳形狀不變，
呼叫端（app/page.jsx、app/hub/page.jsx）不用改。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 4: 新增 GET /api/tool-helpful/[toolId]

**Files:**

- Create: `app/api/tool-helpful/[toolId]/route.js`

**Interfaces:**

- Consumes: `getAdmin` from `@/lib/firebaseAdmin`；`enforceRateLimit` from `@/lib/rateLimit.mjs`；`HttpError`, `handleApiError` from `@/lib/apiError.mjs`（三者都是既有匯出，簽章不變）。
- Produces: `GET /api/tool-helpful/:toolId` → `200 { count: number }`（找不到/亂打的 id 一律回 `count:0`，不是 404）；`429`（超過限流）；`500`（`handleApiError` 統一格式）。Task 5 的 `HelpfulButton.jsx` 依賴這個回應形狀。

- [ ] **Step 1: 建立 route 檔案**

New（`app/api/tool-helpful/[toolId]/route.js`）：

```js
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { enforceRateLimit } from "@/lib/rateLimit.mjs";
import { handleApiError } from "@/lib/apiError.mjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/tool-helpful/{toolId} — 公開讀取單一工具的「👍 有幫助」計數。
 *
 * analytics/toolHelpful 這份文件本身已收斂為 admin-only（2026-07-18），因為
 * 它含所有工具的逐一計數，其中包含 pending（尚未審核、不在公開 catalog
 * 內）的工具——整份給任何人讀等於連帶洩漏這些未上架工具的存在與熱門度。
 * 但 HelpfulButton 這個公開元件仍然需要顯示「這一個」工具的數字——這支
 * route 用 Admin SDK 讀整份文件，只回傳呼叫者問的那個 toolId 對應的值，
 * 不回傳其他 key。
 *
 * 不存在 / 亂打的 toolId 一律回 count:0，不查工具是否存在——「查無此工具」
 * 跟「存在但目前 0 個讚」刻意回傳同一種結果，不主動幫忙分辨兩種情況。
 */
export async function GET(request, { params }) {
  const { toolId } = await params;
  try {
    enforceRateLimit(request, "tool-helpful-count", {
      limit: 60,
      windowMs: 60000,
    });

    const { adminDb } = getAdmin();
    const snap = await adminDb.collection("analytics").doc("toolHelpful").get();
    const data = snap.exists ? snap.data() : {};
    const count = typeof data[toolId] === "number" ? data[toolId] : 0;

    return NextResponse.json({ count });
  } catch (e) {
    return handleApiError(e, "/api/tool-helpful/[toolId]");
  }
}
```

- [ ] **Step 2: 確認沒有語法/型別錯誤**

Run: `npm run lint`
Expected: 0 error。

Run: `npm run build`
Expected: 成功（新增一個 route，Next 會在 build 時做基本的路由/語法檢查）。

- [ ] **Step 3: Commit**

```bash
git add app/api/tool-helpful/[toolId]/route.js
git commit -m "$(cat <<'EOF'
feat(api): 新增 GET /api/tool-helpful/[toolId]

analytics/toolHelpful 收斂為 admin-only 後，公開的 HelpfulButton 沒辦法
再直接整份讀出來挑一個 key。這支 route 用 Admin SDK 讀該文件，只回傳
呼叫者問的那個 toolId 的計數，不洩漏其他工具（含 pending 尚未審核的）
的計數。60/分鐘限流；未知 toolId 一律回 count:0，不做存在性驗證（見
route 內註解）。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 5: HelpfulButton.jsx — 改讀新 API

**Files:**

- Modify: `src/components/HelpfulButton.jsx:1-47`

**Interfaces:**

- Consumes: `GET /api/tool-helpful/:toolId`（Task 4 產出）→ `{ count: number }`。

- [ ] **Step 1: 移除 Firestore client SDK 讀取，改用 fetch**

Old（`src/components/HelpfulButton.jsx:1-47`）：

```jsx
"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

/**
 * 詳情頁「👍 有幫助」。**需登入才能按**（防匿名灌水公開 badge）；後端 per-(uid,toolId) 去重。
 * count 讀自公開 analytics/toolHelpful（任何人都看得到數字，但只有登入者能 +1）。
 * @param {{ toolId: string }} props
 */
export default function HelpfulButton({ toolId }) {
  const { user, loading } = useAuth();
  const [count, setCount] = useState(null); // null = 載入中
  const [marked, setMarked] = useState(false); // 初值一律 false → SSR/hydration 一致
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!toolId || typeof window === "undefined") return;
    let cancelled = false;
    // async 邊界內 setState（非 effect 同步呼叫）→ 不觸發 set-state-in-effect；
    // 初次 render 標記態為 false，掛載後才從 localStorage 校正，避免 hydration mismatch。
    (async () => {
      try {
        if (
          localStorage.getItem(`simhope_helpful_${toolId}`) === "1" &&
          !cancelled
        )
          setMarked(true);
      } catch {
        /* 無痕/停用 → 視為未標記 */
      }
      try {
        const s = await getDoc(doc(db, "analytics", "toolHelpful"));
        if (cancelled) return;
        const v = s.exists() ? s.data()[toolId] : 0;
        setCount(typeof v === "number" ? v : 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toolId]);
```

New：

```jsx
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * 詳情頁「👍 有幫助」。**需登入才能按**（防匿名灌水公開 badge）；後端 per-(uid,toolId) 去重。
 * count 讀自 GET /api/tool-helpful/:toolId（任何人都看得到數字，但只有登入者能 +1）。
 * 2026-07-18 起改走這支 API 而非直接讀 analytics/toolHelpful——該文件已收斂
 * 為 admin-only（整份含所有工具計數，包含 pending 尚未審核的工具，直接讀
 * 會連帶洩漏這些未上架工具的存在）。
 * @param {{ toolId: string }} props
 */
export default function HelpfulButton({ toolId }) {
  const { user, loading } = useAuth();
  const [count, setCount] = useState(null); // null = 載入中
  const [marked, setMarked] = useState(false); // 初值一律 false → SSR/hydration 一致
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!toolId || typeof window === "undefined") return;
    let cancelled = false;
    // async 邊界內 setState（非 effect 同步呼叫）→ 不觸發 set-state-in-effect；
    // 初次 render 標記態為 false，掛載後才從 localStorage 校正，避免 hydration mismatch。
    (async () => {
      try {
        if (
          localStorage.getItem(`simhope_helpful_${toolId}`) === "1" &&
          !cancelled
        )
          setMarked(true);
      } catch {
        /* 無痕/停用 → 視為未標記 */
      }
      try {
        const res = await fetch(
          `/api/tool-helpful/${encodeURIComponent(toolId)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setCount(typeof data.count === "number" ? data.count : 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toolId]);
```

其餘程式碼（`canVote`、`onClick` 投票邏輯、JSX render）完全不變，不用動。

- [ ] **Step 2: 確認沒有語法/型別錯誤**

Run: `npm run lint`
Expected: 0 error（`doc`/`getDoc`/`db` 的 import 已移除，確認沒有殘留未使用 import 造成的 warning）。

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/components/HelpfulButton.jsx
git commit -m "$(cat <<'EOF'
fix(helpful): HelpfulButton 改讀 /api/tool-helpful/:toolId

analytics/toolHelpful 收斂為 admin-only 後，這裡原本直接用 client SDK
整份讀取的寫法會被 rules 擋掉。改成打新的 GET /api/tool-helpful/:toolId，
只拿回這一個工具的計數，不再連帶下載其他工具（含 pending 尚未審核的）的計數。
投票邏輯（POST /api/tool-helpful）不變。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>
EOF
)"
```

---

## Task 6: 全套驗證 + 手動驗證清單

**Files:** 無（純驗證，不改檔案）

- [ ] **Step 1: 跑完整自動化驗證**

Run: `npm run test:unit`
Expected: PASS（Task 3/4/5 都沒有新增/修改純函式測試，這裡主要是確認沒有意外弄壞既有測試）。

Run: `npm run test:rules`
Expected: 全部 PASS（含 Task 2 新增的 94-99，總數比修正前多 6 條）。

Run: `npm run lint`
Expected: 0 error。

Run: `npm run build`
Expected: 成功。

- [ ] **Step 2: 檢視完整 diff**

Run: `git log --oneline -5` 確認 5 個 commit 都在（Task 1+2 合併成一個 commit，Task 3/4/5 各一個）。

Run: `git diff origin/main..HEAD --stat` 確認改動範圍只有 `firestore.rules`、`firestore.rules.test.mjs`、`src/lib/serverCatalog.js`、`app/api/tool-helpful/[toolId]/route.js`（新檔）、`src/components/HelpfulButton.jsx`，沒有意外改到不相關的檔案。

- [ ] **Step 3: 手動驗證清單（deploy 後才能做，先記錄步驟）**

這一步不是現在跑（要等這個 PR merge、deploy 到 Vercel、且 Jason 在 Firebase Console 手動發布新的 `firestore.rules` 之後才能做），照 spec 的「發布順序」建議：**code merge/deploy 先，rules 發布後**。deploy + rules 發布完成後，逐項確認：

1. 登入非 admin 帳號（例如 `porter.wu@simhope.com.tw`），開瀏覽器 devtools console，貼上：
   ```js
   import("firebase/firestore").then(({ getFirestore, doc, getDoc }) =>
     getDoc(doc(getFirestore(), "analytics", "toolViews")).then(
       (s) => console.log("should have thrown, but got:", s.data()),
       (e) => console.log("correctly denied:", e.code),
     ),
   );
   ```
   Expected: 印出 `correctly denied: permission-denied`（不是印出 data）。
2. 用瀏覽器（無痕視窗，未登入）開任一個公開工具的 `/tool/[id]` 詳情頁，確認「👍 N 人覺得有幫助」數字正常顯示（不是空白或一直轉圈）。
3. 開首頁，確認「熱門工具」排行榜跟收斂前的順序/數字一致（挑一個已知瀏覽數較高的工具核對）。
4. 開 `/hub`，確認工具卡片上的「👍 N」badge 數字跟收斂前一致。
5. 用 admin 帳號登入，開 `/admin` → 🩺 健檢分頁，確認殭屍/熱門陳舊等 flag 判定結果跟收斂前一致（數字來源沒變，只是換了讀取方式）。
6. 用 admin 帳號開 `/admin` → 使用概況（`UsageDashboard`），確認一樣正常顯示。

全部確認完才算這個 PR 真正驗證完畢——build 過、rules 測試綠燈不等於「資料 × 程式碼」組合在 runtime 正確（AGENTS.md 的既有教訓）。
