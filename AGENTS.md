<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# 部署與資料遷移的順序（重要 — 踩過坑）

**資料遷移 (Firestore migration script) 跟程式碼必須一起上，順序不能顛倒。**

2026-05-29 踩過一次：先跑了 `cleanup-approval-field.mjs --apply` 把正式
Firestore 的 `approval` 欄位移除，但移除 approval 依賴的新版
`getApprovedTools` 程式碼還沒 merge 到 main。結果 live 站舊碼的查詢
`status in [live,beta,new] OR approval=='approved'` 後半失效，首頁從
13 個工具掉到只剩 8 個（dev + terminated 全消失），破了一段時間才發現。

## 規則

1. **改變資料結構的 migration，要等「依賴新結構的程式碼」先 merge + deploy 後才跑**，
   或把 migration 跟 code 放同一個 PR、merge 後立刻依序執行。
2. **正確順序**：code merge → production deploy 成功 → 再跑 `--apply` migration。
3. 每個 migration script 都要：`--apply` 才寫入（預設 dry-run）、寫入前自動
   備份到 `<collection>-backup-YYYY-MM-DD/` collection、idempotent（可重跑）。
4. 跑完 prod migration 後，**一定要連 live 站驗證**（不是只看 build 過），
   因為 build 過不代表「資料 × 程式碼」組合在 runtime 正確。

## tools collection 欄位現況（2026-05-29 後）

- 狀態只看 `status`（pending/live/beta/new/dev/terminated），**`approval` 欄位已廢除**。
- 可見性：非 admin 看 `status in [live,beta,new,dev,terminated]`；pending 只有作者/admin 看得到。
- painCards 仍用 `approval`（pending/approved/rejected）— 跟 tools 的 status 不同系統，別搞混。
- 類型 `type`：webapp / download / doc / mcp / api（showcase 已廢除，用 status=dev 表達規劃中）。
- 類型專屬欄位放 `typeData` 子物件。
