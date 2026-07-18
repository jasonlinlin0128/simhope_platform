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
3. 每個 migration script 都要：`--apply` 才寫入（預設 dry-run）、idempotent（可重跑）。
   ~~寫入前自動備份到 `<collection>-backup-YYYY-MM-DD/` collection~~ → **見第 5 點：PITR
   上線後不必再寫 in-DB 備份**。
4. 跑完 prod migration 後，**一定要連 live 站驗證**（不是只看 build 過），
   因為 build 過不代表「資料 × 程式碼」組合在 runtime 正確。
5. **PITR 上線後（2026-06-11）migration 安全網改靠 Firestore PITR**（7 天連續復原）+
   daily managed backup（留 14 天）——**新 migration 不必再寫「備份到
   `<collection>-backup-YYYY-MM-DD/`」的 in-DB 備份**（同庫備份對 DR 無效又累積垃圾）。
   改成：跑 `--apply` 前記下 UTC timestamp，出事照 `docs/runbooks/firestore-dr.md`
   情境 A 用 PITR clone 回滾。既有 script 的 in-DB 備份邏輯可保留（無害），新寫的不要再加。

## 多分支同時改 firestore.rules 的發布協調（重要 — 踩過坑）

**Firebase Console 發布 `firestore.rules` 是整份文件取代，不是逐行合併。** 若兩個以上
未合併的 feature branch 同時在改這個檔案，任一分支提前發布自己孤立版本的 rules，會
靜默蓋掉/漏掉另一個分支的規則變更——沒有任何錯誤訊息，直到有人發現受影響的功能
不受規則保護（或反過來被誤擋）才會發現。

2026-07-18 踩過一次（沒釀成事故，靠流程接住）：PR #73（analytics 逐工具明細收斂）跟
PR #71（Registry ACL）同時修改 `firestore.rules` 且同時未合併。

## 規則

1. **同時有 ≥2 個未合併分支都改了 `firestore.rules` 時**，一律等全部 merge 進 main
   之後才發布，且只發布「當時 main 上最終合併版」的 `firestore.rules`——不發布任何
   單一分支自己的版本。判斷方式與完整流程見 `docs/runbooks/firestore-rules-cross-branch.md`。
2. 若當下只有一個分支改了 rules，照該功能自己的 rollout 文件走（例如單分支的
   `docs/portal/pr4-rollout.md`），不受此規則限制。
3. 發布後一定要驗證：不能只看 build/deploy 綠燈，直接用匿名 curl 打 Firestore REST API
   比對規則是否真的生效（範例見上述 runbook 的驗收段落）。

## tools collection 欄位現況（2026-05-29 後）

- 狀態只看 `status`（pending/live/beta/new/dev/terminated），**`approval` 欄位已廢除**。
- 可見性：非 admin 看 `status in [live,beta,new,dev,terminated]`；pending 只有作者/admin 看得到。
- painCards 仍用 `approval`（pending/approved/rejected）— 跟 tools 的 status 不同系統，別搞混。
- 類型 `type`：webapp / download / doc / mcp / api / embedded（showcase 已廢除，用 status=dev 表達規劃中）。
- 類型專屬欄位放 `typeData` 子物件。

## 認證系統（v0.7，2026-05-29）

- Phase A 已上線：Google 登入（與密碼並存）+ firestore.rules 提權漏洞修補
  （`roleIsViewerOrAbsent` 擋自我提權）+ 首登自動建 viewer 文件。
- Phase B 已上線：passkey / Face ID（WebAuthn，usernameless）。後端 Admin SDK
  （`src/lib/firebaseAdmin.js`，吃 Vercel env `FIREBASE_SERVICE_ACCOUNT`）鑄 custom token。
  `passkeys` / `webauthnChallenges` collection 是 server-only（rules deny）。
- **Phase C（LINE 登入 + MCP/API 認證）暫緩（YAGNI）** — 觸發條件見
  `docs/superpowers/specs/2026-05-29-phase-c-deferred.md`，需求來了再 brainstorm。
- ⚠️ firestore.rules / storage.rules 發布：預設 Admin SDK SA 沒
  `firebaserules.releases.create` → `deploy-*-rules.mjs` 只能建 ruleset 不能發布（403）
  → 改用 Firebase Console 手動貼上發布（或授 SA `roles/firebaserules.admin`）。
