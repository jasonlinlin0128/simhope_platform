# 樂觀鎖（並發編輯防覆蓋）— 設計（audit #11）

> 日期：2026-06-08 ｜ 分支：`feature-optimistic-lock`（從 main `e568a1a`）
> 來源：`docs/optimization-audit-2026-06-07.md` #11（DB / 正確性）

---

## 1. 背景 / 問題

兩個「寫整個 payload（含 `versions[]` / `blog.blocks`）」的存檔路徑無樂觀鎖 → 兩人同時編輯同一工具會**互相無聲覆蓋**（後存的整段蓋掉先存的，資料遺失）：

- `app/tool/[id]/page.jsx` `handleSave`（L891）：`updateDoc(..., { blog, url, type, versions, updatedAt: new Date() })` — 且 `updatedAt` 用 **client `new Date()`**（audit 指定統一成 serverTimestamp）。
- `src/components/ReviewToolWizard.jsx` `handleSaveOnly`（L173）：`updateDoc(..., { ...大 payload, versions, blog, updatedAt: serverTimestamp() })`。

兩者都已有「載入時的 `tool.updatedAt`」可當基準版本，且存後都有刷新機制（tool/[id] 存後 `fetchTool()`、wizard 存後 `onSaved?.()` 由 parent 刷新）。

## 2. 目標 / 非目標

**目標**：存檔前以 `runTransaction` 比對「目前 DB 的 `updatedAt`」與「載入時的 `updatedAt`」——相同才寫、不同則中止並提示重新整理（不靜默覆蓋）。順帶統一 tool/[id] 的 `new Date()` → `serverTimestamp()`。

**非目標**：

- 不鎖 `handleReject`（=deleteDoc 刪工具）/ delete（非陣列覆寫；刪除是明確破壞動作）。
- 不做 auto-merge（YAGNI；衝突一律中止+提示重載）。
- 不動 rules / 無 migration / 不改可見性。

## 3. 架構

### 3.1 `src/lib/sameTimestamp.mjs`（新，可單元測試）

```js
/**
 * 比對兩個 Firestore updatedAt（樂觀鎖基準）。undefined-safe。
 * both 無 → true（legacy 無 marker 視為無衝突）；一有一無 → false；皆 Timestamp → isEqual（fallback toMillis）。
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

附 `src/lib/sameTimestamp.test.mjs`（node:test）：both-undefined→true、一有一無→false、isEqual true/false、toMillis fallback、皆覆蓋。

### 3.2 `app/tool/[id]/page.jsx` `handleSave`

- import：`{ doc, getDoc, updateDoc }` → `{ doc, getDoc, runTransaction, serverTimestamp }`（移除僅此處用的 `updateDoc`、加 `runTransaction`/`serverTimestamp`；`getDoc` 留給 fetchTool）；加 `import { sameTimestamp } from "@/lib/sameTimestamp.mjs"`。
- 改寫：
  ```js
  const ref = doc(db, "tools", id);
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
  ```
- catch：`error.code === "conflict"` → toast「這個工具在你編輯期間被其他人更新了。請重新整理載入最新版本後再編輯（避免覆蓋對方的修改）。」；否則維持原 permission-denied / 通用訊息。成功仍 `setIsEditMode(false)` + `fetchTool()`（刷新 base）。

### 3.3 `src/components/ReviewToolWizard.jsx` `handleSaveOnly`

- import：`updateDoc` → `runTransaction`（`serverTimestamp`/`deleteDoc`/`getDoc` 已有）；加 `sameTimestamp`。
- 改寫：payload 照舊組好後，
  ```js
  const ref = doc(db, "tools", tool.id);
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
    tx.update(ref, payload);
  });
  onSaved?.();
  ```
- catch：`err.code === "conflict"` → toast「這個工具在你開啟審核期間被其他人更新了，請關閉重開後再操作。」；否則維持「儲存失敗：」+ err.message。

## 4. 資料流 / 衝突情境

- A、B 同時開編輯（都載入 updatedAt=T0）。A 存 → tx 比對 T0==T0 → 寫 → updatedAt=T1。B 存 → tx 讀到 T1 ≠ B 的 T0 → 中止 → B 看到衝突 toast → 重新整理載入 T1 版 → 重做編輯 → 存（T1==T1 → 成功）。**A 的修改不被 B 蓋掉。**
- legacy 無 updatedAt 工具：兩人都 T0=undefined → 第一存（both-undefined→sameTimestamp true）寫入並產生 marker；之後鎖即生效。極端「兩人同時對無 marker 工具首存」仍可能覆蓋一次（可接受邊緣；首存後永遠有 marker）。
- 工具編輯途中被刪：`!snap.exists()` → 視為 conflict → 中止（不會 re-create）。

## 5. 測試 / 驗證

- `npm run test:unit`：新增 `sameTimestamp.test.mjs`（並既有 26 續綠）。
- `npm run build` 綠、`npm run lint` 基準 3（0 error）不增（`updateDoc` 移除無 unused、`runTransaction`/`serverTimestamp`/`sameTimestamp` 有用到）。
- transaction 並發行為：emulator 並發難自動測 → 靠 sameTimestamp 單元測 + 獨立 reviewer 核交易邏輯 + **Jason 手測（auth-gated）**：兩分頁開同一工具編輯，先後存檔 → 第二個跳衝突 toast、第一個的修改仍在。
- 公開頁不受影響（純存檔路徑）；可 MCP 確認 build 後公開頁仍正常（非必要）。

## 6. 交付 / 風險

- 分支 `feature-optimistic-lock`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge。
- 風險：動到 1109 行 tool/[id]（僅 handleSave）+ wizard handleSaveOnly；transaction 正確性（tx.get→比對→tx.update 同一交易內原子）靠 reviewer。無 rules/migration、可乾淨 revert。
- 不碰 #33（rules）/#34（passkey）的檔 → 與兩個 open PR 無衝突。

## 7. 完成定義（DoD）

- `sameTimestamp.mjs` + test；tool/[id] handleSave + wizard handleSaveOnly 改 runTransaction + 衝突中止/提示；tool/[id] updatedAt 統一 serverTimestamp。
- build 綠、lint 不增、test:unit（含新 sameTimestamp 測）綠。
- 獨立 reviewer READY。
- PR 描述含衝突情境說明 + Jason 兩分頁手測步驟。
