# 樂觀鎖（並發編輯防覆蓋）— 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tool/[id] handleSave 與 wizard handleSaveOnly 改用 `runTransaction` 比對 `updatedAt`，並發編輯時中止+提示而非無聲覆蓋。

**Architecture:** 新增可測 `sameTimestamp` helper；兩存檔路徑包進 transaction（tx.get→比對→tx.update with serverTimestamp）；tool/[id] 的 `new Date()` 統一 serverTimestamp。

**Tech Stack:** Firebase modular SDK `runTransaction`/`serverTimestamp`；node:test。

**設計來源：** [spec](../specs/2026-06-08-optimistic-lock-design.md)。

**驗證慣例：** `npm run lint` 基準 3（0 error）不增、`npm run test:unit` 綠（含新測）；commit Conventional + 結尾 `Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>`。

---

## Task 1: 新增 sameTimestamp helper + test

**Files:** Create `src/lib/sameTimestamp.mjs`、`src/lib/sameTimestamp.test.mjs`

- [ ] **Step 1: 建 `src/lib/sameTimestamp.mjs`**

```js
/**
 * 比對兩個 Firestore updatedAt（樂觀鎖基準版本）。undefined-safe。
 * - both 無 → true（legacy 無 marker，視為無衝突）
 * - 一有一無 → false
 * - 皆 Firestore Timestamp → isEqual（fallback toMillis）
 */
export function sameTimestamp(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (typeof a.isEqual === "function") return a.isEqual(b);
  if (typeof a.toMillis === "function" && typeof b.toMillis === "function")
    return a.toMillis() === b.toMillis();
  return a === b;
}
```

- [ ] **Step 2: 建 `src/lib/sameTimestamp.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameTimestamp } from "./sameTimestamp.mjs";

const ts = (ms) => ({
  toMillis: () => ms,
  isEqual(o) {
    return o && typeof o.toMillis === "function" && o.toMillis() === ms;
  },
});

test("both undefined → true（legacy 無 marker）", () => {
  assert.equal(sameTimestamp(undefined, undefined), true);
  assert.equal(sameTimestamp(null, null), true);
});

test("一有一無 → false", () => {
  assert.equal(sameTimestamp(ts(1000), undefined), false);
  assert.equal(sameTimestamp(undefined, ts(1000)), false);
});

test("isEqual 相同 → true", () => {
  assert.equal(sameTimestamp(ts(1700000000000), ts(1700000000000)), true);
});

test("isEqual 不同 → false", () => {
  assert.equal(sameTimestamp(ts(1700000000000), ts(1700000000001)), false);
});

test("toMillis fallback（無 isEqual）→ 比 toMillis", () => {
  const a = { toMillis: () => 5 };
  const b = { toMillis: () => 5 };
  const c = { toMillis: () => 6 };
  assert.equal(sameTimestamp(a, b), true);
  assert.equal(sameTimestamp(a, c), false);
});
```

- [ ] **Step 3: 跑測試**

Run: `npm run test:unit`
Expected: 既有 26 + 新 5 條（sameTimestamp）全綠。

---

## Task 2: tool/[id] handleSave 改 runTransaction

**Files:** Modify `app/tool/[id]/page.jsx`

- [ ] **Step 1: import 調整（L7）**

old：

```jsx
import { doc, getDoc, updateDoc } from "firebase/firestore";
```

new：

```jsx
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
```

- [ ] **Step 2: 加 sameTimestamp import（在 `import { db } from "@/lib/firebase";` 後）**

old：

```jsx
import { db } from "@/lib/firebase";
```

new：

```jsx
import { db } from "@/lib/firebase";
import { sameTimestamp } from "@/lib/sameTimestamp.mjs";
```

- [ ] **Step 3: 改寫 handleSave（L891-914）**

old：

```jsx
const handleSave = async () => {
  if (!canEdit) return;
  setIsSaving(true);
  try {
    await updateDoc(doc(db, "tools", id), {
      blog: { ...tool.blog, blocks: localBlocks },
      url: localExtras.url,
      type: localExtras.type,
      versions: localVersions,
      updatedAt: new Date(),
    });
    toast.success("儲存成功！");
    setIsEditMode(false);
    fetchTool();
  } catch (error) {
    console.error(error);
    toast.error(
      error.code === "permission-denied"
        ? "儲存失敗：你沒有編輯此工具的權限"
        : "儲存失敗，請稍後再試",
    );
  }
  setIsSaving(false);
};
```

new：

```jsx
const handleSave = async () => {
  if (!canEdit) return;
  setIsSaving(true);
  try {
    const ref = doc(db, "tools", id);
    // 樂觀鎖：交易內比對 updatedAt，期間被別人改過就中止（不靜默覆蓋）。
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (
        !snap.exists() ||
        !sameTimestamp(snap.data().updatedAt, tool.updatedAt)
      ) {
        const e = new Error("CONFLICT");
        e.code = "conflict";
        throw e;
      }
      tx.update(ref, {
        blog: { ...tool.blog, blocks: localBlocks },
        url: localExtras.url,
        type: localExtras.type,
        versions: localVersions,
        updatedAt: serverTimestamp(),
      });
    });
    toast.success("儲存成功！");
    setIsEditMode(false);
    fetchTool();
  } catch (error) {
    console.error(error);
    toast.error(
      error.code === "conflict"
        ? "這個工具在你編輯期間被其他人更新了。請重新整理載入最新版本後再編輯（避免覆蓋對方的修改）。"
        : error.code === "permission-denied"
          ? "儲存失敗：你沒有編輯此工具的權限"
          : "儲存失敗，請稍後再試",
    );
  }
  setIsSaving(false);
};
```

---

## Task 3: wizard handleSaveOnly 改 runTransaction

**Files:** Modify `src/components/ReviewToolWizard.jsx`

- [ ] **Step 1: import 調整（L4-10）**

old：

```jsx
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
```

new：

```jsx
import {
  doc,
  getDoc,
  runTransaction,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
```

- [ ] **Step 2: 加 sameTimestamp import（在 `import { db, auth } from "@/lib/firebase";` 後）**

old：

```jsx
import { db, auth } from "@/lib/firebase";
```

new：

```jsx
import { db, auth } from "@/lib/firebase";
import { sameTimestamp } from "@/lib/sameTimestamp.mjs";
```

- [ ] **Step 3: 把 updateDoc 換成 transaction（L203）**

old：

```jsx
await updateDoc(doc(db, "tools", tool.id), payload);
onSaved?.();
```

new：

```jsx
const ref = doc(db, "tools", tool.id);
// 樂觀鎖：交易內比對 updatedAt，期間被別人改過就中止（不靜默覆蓋）。
await runTransaction(db, async (tx) => {
  const snap = await tx.get(ref);
  if (!snap.exists() || !sameTimestamp(snap.data().updatedAt, tool.updatedAt)) {
    const e = new Error("CONFLICT");
    e.code = "conflict";
    throw e;
  }
  tx.update(ref, payload);
});
onSaved?.();
```

- [ ] **Step 4: catch 加衝突訊息**

old：

```jsx
    } catch (err) {
      console.error(err);
      toast.error("儲存失敗：" + err.message);
    } finally {
```

new：

```jsx
    } catch (err) {
      console.error(err);
      toast.error(
        err.code === "conflict"
          ? "這個工具在你開啟審核期間被其他人更新了，請關閉重開後再操作。"
          : "儲存失敗：" + err.message,
      );
    } finally {
```

---

## Task 4: 驗證 + commit

**Files:** 無（驗證）+ commit T1/T2/T3

- [ ] **Step 1: build + lint + unit**

Run: `npm run build`（綠）、`npm run lint`（基準 3、0 error；`updateDoc` 兩處移除無 unused）、`npm run test:unit`（既有 26 + sameTimestamp 5 = 31 綠）。

- [ ] **Step 2: grep 複核**

Run: `grep -nE "runTransaction|sameTimestamp|updateDoc|serverTimestamp|new Date" "app/tool/[id]/page.jsx" src/components/ReviewToolWizard.jsx`
Expected: 兩檔皆有 runTransaction + sameTimestamp；tool/[id] handleSave 無 `new Date()`（updatedAt 改 serverTimestamp）；無殘留 updateDoc。

- [ ] **Step 3: commit**

```bash
git add src/lib/sameTimestamp.mjs src/lib/sameTimestamp.test.mjs "app/tool/[id]/page.jsx" src/components/ReviewToolWizard.jsx
git commit -m "feat(tool): 樂觀鎖防並發編輯覆蓋 (audit #11)

tool/[id] handleSave + wizard handleSaveOnly 原以 updateDoc 寫整 payload
（versions/blog）無鎖→兩人同編互相無聲覆蓋。改 runTransaction：交易內比對
updatedAt 與載入時相同才寫(serverTimestamp)，不同則中止+提示重載。tool/[id]
updatedAt 從 new Date() 統一成 serverTimestamp。新增可測 sameTimestamp helper
（undefined-safe，5 node:test）。不鎖 reject/delete、不 auto-merge、不動 rules。

Co-Authored-By: Jason simhope ai agent <jasonlin@simhope.com.tw>"
```

---

## 完成後

- 推 `feature-optimistic-lock` → 開 PR（base main；body：衝突情境、Jason 兩分頁手測步驟、與 #33/#34 無檔案重疊）。
- 獨立 reviewer subagent（聚焦：tx.get→比對→tx.update 原子性、sameTimestamp undefined/legacy 分支、衝突 toast、updateDoc 移除無殘留、serverTimestamp 統一）→ CI/Vercel 綠 → 等 Jason merge。

---

## Self-Review（plan vs spec）

- **Spec coverage**：§3.1 helper→T1；§3.2 tool/[id]→T2；§3.3 wizard→T3；§5 測試→T1S3 + T4。✓
- **Placeholder scan**：完整 old/new 碼、exact 指令；無 TBD。✓
- **一致性**：兩處 conflict 用 `new Error("CONFLICT"); e.code="conflict"` + catch 比對 `code==="conflict"`；sameTimestamp import 路徑 `@/lib/sameTimestamp.mjs` 一致；tool/[id] serverTimestamp 取代 new Date()。✓
