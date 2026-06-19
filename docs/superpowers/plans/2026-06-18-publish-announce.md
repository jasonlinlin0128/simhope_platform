# 即時新工具發布公告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin 把工具發布（非{live,beta,new} → live/beta/new）的當下，立刻發一則 Discord 公告，每工具一次。

**Architecture:** 新增純函式 `announcePublish.mjs`（`shouldAnnounce` gating + `buildAnnounceMessage`，TDD）。新增 admin-only `POST /api/admin/announce-tool`（鏡像 `/api/analyze-demand`：IP 限流 → `requireRole(["admin"])` → Admin SDK 讀 tool → `announcedAt`/status 權威去重 → `notify` + 寫 `announcedAt`）。`app/admin/page.jsx` 的 `handleUpdateToolStatus` 在既有 client `updateDoc` 成功後，依 `shouldAnnounce` 帶 admin Bearer 打 route（best-effort、不擋主流程）。

**Tech Stack:** Next.js 16 (App Router, Route Handler) · React 19 · 純 ESM JavaScript · node:test · firebase-admin (Admin SDK) · 既有 Discord webhook (`notify.js`)。

**Spec:** `docs/superpowers/specs/2026-06-18-publish-announce-design.md`

---

## File Structure

| 檔案                                   | 動作 | 責任                                                                 |
| -------------------------------------- | ---- | -------------------------------------------------------------------- |
| `src/lib/announcePublish.mjs`          | 新增 | 純函式 `ANNOUNCE_STATUSES`、`shouldAnnounce`、`buildAnnounceMessage` |
| `src/lib/announcePublish.test.mjs`     | 新增 | node:test                                                            |
| `app/api/admin/announce-tool/route.js` | 新增 | admin-only route：去重 + notify + 寫 announcedAt                     |
| `app/admin/page.jsx`                   | 改   | `handleUpdateToolStatus` 成功後依 `shouldAnnounce` 打 route          |

**不需改**：`src/lib/notify.js`、`src/lib/apiAuth.mjs`、firestore.rules（`announcedAt` 由 Admin SDK 寫）。

---

### Task 1: 純函式 `announcePublish` + TDD

**Files:**

- Create: `src/lib/announcePublish.mjs`
- Test: `src/lib/announcePublish.test.mjs`

- [ ] **Step 1: 先寫失敗的測試** — 建立 `src/lib/announcePublish.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANNOUNCE_STATUSES,
  shouldAnnounce,
  buildAnnounceMessage,
} from "./announcePublish.mjs";

test("ANNOUNCE_STATUSES = live/beta/new", () => {
  assert.deepEqual(ANNOUNCE_STATUSES, ["live", "beta", "new"]);
});

test("shouldAnnounce：非公開 → 公開（未公告）→ true", () => {
  assert.equal(shouldAnnounce("pending", "live", undefined), true);
  assert.equal(shouldAnnounce("dev", "live", undefined), true);
  assert.equal(shouldAnnounce("pending", "beta", undefined), true);
  assert.equal(shouldAnnounce("pending", "new", undefined), true);
  assert.equal(shouldAnnounce("terminated", "live", undefined), true);
});

test("shouldAnnounce：新狀態非公開 → false", () => {
  assert.equal(shouldAnnounce("pending", "dev", undefined), false);
  assert.equal(shouldAnnounce("pending", "terminated", undefined), false);
  assert.equal(shouldAnnounce("pending", "pending", undefined), false);
});

test("shouldAnnounce：舊狀態已公開 → false（不重發）", () => {
  assert.equal(shouldAnnounce("live", "beta", undefined), false);
  assert.equal(shouldAnnounce("new", "live", undefined), false);
  assert.equal(shouldAnnounce("beta", "new", undefined), false);
});

test("shouldAnnounce：已有 announcedAt → false", () => {
  assert.equal(
    shouldAnnounce("pending", "live", "2026-06-18T00:00:00Z"),
    false,
  );
  assert.equal(shouldAnnounce("pending", "live", 123), false);
  assert.equal(shouldAnnounce("dev", "live", { seconds: 1 }), false);
});

test("buildAnnounceMessage：含 title/tagline/連結", () => {
  const msg = buildAnnounceMessage({
    id: "t1",
    title: "翻譯工具",
    tagline: "即時翻譯",
  });
  assert.match(msg, /🎉 新工具上線：翻譯工具 — 即時翻譯/);
  assert.match(msg, /https:\/\/simhope-platform\.vercel\.app\/tool\/t1/);
});

test("buildAnnounceMessage：缺 tagline → 無 dash", () => {
  const msg = buildAnnounceMessage({ id: "t2", title: "工具A" });
  assert.match(msg, /🎉 新工具上線：工具A\n/);
  assert.ok(!msg.includes(" — "));
});

test("buildAnnounceMessage：缺 title → 後備名稱", () => {
  const msg = buildAnnounceMessage({ id: "t3" });
  assert.match(msg, /🎉 新工具上線：\(未命名工具\)/);
  assert.match(msg, /\/tool\/t3/);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test src/lib/announcePublish.test.mjs`
Expected: FAIL — `Cannot find module './announcePublish.mjs'`。

- [ ] **Step 3: 寫最小實作** — 建立 `src/lib/announcePublish.mjs`：

```js
// src/lib/announcePublish.mjs
// 純函式：決定工具狀態轉換是否要發「上線公告」、組公告訊息。
// 無 firebase/browser 依賴，可 node:test。

/** 算「公開可用」的狀態（轉入這些＝上線）。 */
export const ANNOUNCE_STATUSES = ["live", "beta", "new"];

/**
 * 是否該發上線公告：未公告過 + 舊狀態非公開 + 新狀態公開。
 * @param {string} prevStatus
 * @param {string} newStatus
 * @param {unknown} announcedAt  已公告標記（truthy = 已公告）
 * @returns {boolean}
 */
export function shouldAnnounce(prevStatus, newStatus, announcedAt) {
  return (
    !announcedAt &&
    !ANNOUNCE_STATUSES.includes(prevStatus) &&
    ANNOUNCE_STATUSES.includes(newStatus)
  );
}

/**
 * 組 Discord 上線公告訊息。
 * @param {{id:string, title?:string, tagline?:string}} tool
 * @returns {string}
 */
export function buildAnnounceMessage(tool) {
  const title = tool?.title || "(未命名工具)";
  const tagline = tool?.tagline ? ` — ${tool.tagline}` : "";
  const url = `https://simhope-platform.vercel.app/tool/${tool?.id}`;
  return `🎉 新工具上線：${title}${tagline}\n${url}`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test src/lib/announcePublish.test.mjs`
Expected: PASS — 8 個 test 全綠。

- [ ] **Step 5: Commit**

```bash
git add src/lib/announcePublish.mjs src/lib/announcePublish.test.mjs
git commit -m "feat(publish-announce): announcePublish 純函式（gating + 訊息）+ TDD

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 2: `POST /api/admin/announce-tool` route

**Files:**

- Create: `app/api/admin/announce-tool/route.js`

鏡像 `app/api/analyze-demand/route.js` 的 import/限流/auth/錯誤處理結構。

- [ ] **Step 1: 建立 route** — 建立 `app/api/admin/announce-tool/route.js`：

```js
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireRole } from "@/lib/apiAuth.mjs";
import { HttpError, handleApiError } from "@/lib/apiError.mjs";
import { rateLimit, clientIp } from "@/lib/rateLimit.mjs";
import { getAdmin } from "@/lib/firebaseAdmin";
import { notify } from "@/lib/notify";
import {
  ANNOUNCE_STATUSES,
  buildAnnounceMessage,
} from "@/lib/announcePublish.mjs";

/**
 * POST /api/admin/announce-tool — admin-only。工具發布（轉入 live/beta/new）即時發 Discord 公告。
 * IP 限流 → auth(admin) → 讀 tool → 權威去重(announcedAt/status) → notify + 寫 announcedAt。
 * 冪等：已公告 or 非公開狀態 → { announced:false } no-op（200）。
 */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit(`announce-tool:${ip}`, { limit: 30, windowMs: 60000 }).ok)
      throw new HttpError(429, "操作過於頻繁，請稍後再試");

    await requireRole(request, ["admin"], {
      forbiddenMessage: "需要管理員權限",
    });

    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new HttpError(400, "缺少工具 id");

    const { adminDb } = getAdmin();
    const ref = adminDb.collection("tools").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "工具不存在");

    const data = snap.data();
    // 權威去重：已公告 or 非公開狀態 → no-op
    if (data.announcedAt || !ANNOUNCE_STATUSES.includes(data.status)) {
      return NextResponse.json({ announced: false });
    }

    // best-effort 公告（notify 內部吞錯）；無論結果都寫 announcedAt 防重發。
    await notify(buildAnnounceMessage({ ...data, id }));
    await ref.set(
      { announcedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return NextResponse.json({ announced: true });
  } catch (e) {
    return handleApiError(e, "/api/admin/announce-tool");
  }
}
```

- [ ] **Step 2: lint 不破**

Run: `npm run lint`
Expected: 0 error（既有 2 img warning 不算）。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/announce-tool/route.js
git commit -m "feat(publish-announce): /api/admin/announce-tool route（admin、冪等、notify）

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

### Task 3: admin 頁面接上 announce 呼叫

**Files:**

- Modify: `app/admin/page.jsx`

先 READ 確認現況：`import { db } from "@/lib/firebase";`（line ~6）；`const [tools, setTools] = useState([]);`（line ~32）；`handleUpdateToolStatus`（line ~128-136）為 `async (id, status) => { try { await updateDoc(doc(db,"tools",id),{status}); fetchAdminData(); } catch ... }`。

- [ ] **Step 1: import `auth` + `shouldAnnounce`**

把 `import { db } from "@/lib/firebase";` 改成（加 `auth`）：

```js
import { auth, db } from "@/lib/firebase";
```

在既有 import 區（`import { useConfirm } from "@/components/ConfirmDialog";` 之後）加：

```js
import { shouldAnnounce } from "@/lib/announcePublish.mjs";
```

- [ ] **Step 2: 改 `handleUpdateToolStatus`**

把現有：

```js
const handleUpdateToolStatus = async (id, status) => {
  try {
    await updateDoc(doc(db, "tools", id), { status });
    fetchAdminData();
  } catch (error) {
    console.error(error);
    toast.error("更新失敗，請重新整理後再試");
  }
};
```

改成：

```js
const handleUpdateToolStatus = async (id, status) => {
  // 抓舊狀態 + announcedAt（判斷是否為「發布」轉換）
  const prev = tools.find((t) => t.id === id);
  try {
    await updateDoc(doc(db, "tools", id), { status });
    fetchAdminData();
    // 發布（非公開 → live/beta/new）當下即時發 Discord 公告（best-effort、不擋主流程）
    if (prev && shouldAnnounce(prev.status, status, prev.announcedAt)) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        await fetch("/api/admin/announce-tool", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ id }),
        });
      } catch (e) {
        console.error("發布公告失敗（不影響狀態更新）：", e);
      }
    }
  } catch (error) {
    console.error(error);
    toast.error("更新失敗，請重新整理後再試");
  }
};
```

- [ ] **Step 3: 全套驗證**

Run: `npm run test:unit`
Expected: PASS — 既有測試 + 新 8 個 announcePublish 測試全綠。

Run: `npm run lint`
Expected: 0 error（既有 2 img warning 不算）。

Run: `npm run build`
Expected: build 成功；`/api/admin/announce-tool`（ƒ Dynamic）生成、`/admin` 正常。

> ⚠️ 本機 build 偶遇 `fonts.gstatic.com` flake（與本碼無關）；**僅當**錯誤是 Google Fonts fetch 時重試一次，其他錯誤不重試、回報。

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(publish-announce): admin 改狀態為公開時即時打 announce route

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## 完成後（plan 外，主 session 處理）

- 派獨立 reviewer 對照 codebase 端到端檢查。
- 開 PR（branch `feature-publish-announce`）。
- 部署後人工驗（spec「Rollout」）：pending→live 發一次、再 live→beta→live 不重發、改 dev/terminated 不發。

---

## Self-Review（plan 對照 spec）

**1. Spec coverage**

- 觸發 = 非{live,beta,new}→{live,beta,new} 一次 → `shouldAnnounce`（Task 1）+ Task 3 client gate + Task 2 route 去重 ✓
- 去重 `announcedAt` 雙層 → Task 2（route 寫 + 檢查）+ Task 3（client 檢查）✓
- 架構 = client updateDoc 不變 + 成功後打 route → Task 3 ✓
- 訊息格式 `🎉 新工具上線：{title} — {tagline}` + `/tool/{id}` → `buildAnnounceMessage`（Task 1）✓
- admin auth + 沿用 notify → Task 2 `requireRole` + `notify` ✓
- 零 rules/migration/付費/新 env → 全程無此類改動 ✓

**2. Placeholder scan** — 無 TBD/TODO；每個 code step 都有完整程式碼。✓

**3. Type consistency** — `ANNOUNCE_STATUSES`（陣列、`.includes`）、`shouldAnnounce(prev,new,announcedAt)`、`buildAnnounceMessage(tool)`、`announcedAt` 欄位、route `{announced:bool}` 跨 Task 命名一致。✓
