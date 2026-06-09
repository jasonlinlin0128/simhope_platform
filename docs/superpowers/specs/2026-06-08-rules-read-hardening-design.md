# tools / painCards read 收緊 — 設計（audit S3）

> 日期：2026-06-08 ｜ 分支：`feature-rules-read-hardening`（從 main `e568a1a`）
> 來源：`docs/optimization-audit-2026-06-07.md` S3（資安 P2）+ 順手 painCards 同類洞

---

## 1. 背景 / 問題

`firestore.rules`：

- **tools read（L53）`allow read: if true`**（S3）：pending（未審）工具內容在**資料層**對任何知道 doc id 的人可讀；可見性 gating 全在 client（`getApprovedTools` 的 status filter）。
- **painCards read（L72）`allow read: if true`**：同類洞——pending（未核准）痛點卡同樣可被任何人讀（用 `approval` 欄位判公開）。

兩者都是「資料層對未審內容門戶大開、僅靠前端遮蔽」。

## 2. 目標 / 非目標

**目標**：把 tools / painCards 的 read 收緊成「公開狀態人人可讀；未公開者只有作者 / admin 可讀」，把可見性下沉到資料層。

**非目標**：

- 不改 create / update / delete 規則（S1/S2 已硬化，不動）。
- 不改任何**程式碼**（見 §4：現有查詢已相容）。
- 無 migration（純 rules）。

## 3. 架構（改 `firestore.rules`，2 條 read 規則 + 測試）

### 3.1 tools read（L53）

```
allow read: if resource.data.status in ['live', 'beta', 'new', 'dev', 'terminated']
  || (isSignedIn() && resource.data.authorUid == request.auth.uid)
  || isAdmin();
```

- 公開狀態（live/beta/new/dev/terminated）→ 人人可讀（含匿名）。
- 作者讀自己的（含 pending）。
- admin 讀全部。
- 其他人 GET 別人的 pending → 拒絕。

### 3.2 painCards read（L72）

```
allow read: if resource.data.approval == 'approved'
  || (isSignedIn() && resource.data.authorUid == request.auth.uid)
  || isAdmin();
```

- approved → 人人可讀。
- 作者讀自己的；admin 讀全部；其他人讀未核准 → 拒絕。

> `isAdmin()` / `isSignedIn()` 為既有 helper。painCards 正式資料（如 pc1）無 authorUid，但 approved → 第一條即 true，不受影響。

## 4. 相容性分析（為何不需改 code）

現有所有查詢模式都已與收緊後的規則相容（Firestore list 規則：query 回傳的每筆都須過 read 規則，OR 短路）：

| 呼叫端                                   | 查詢                                | 收緊後                                                                                |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| 首頁 / hub（公開，#10 後 isAdmin=false） | `where status in [public]`          | 每筆都過第一條 → anon 可跑 ✓                                                          |
| `/admin`                                 | `getDocs(collection(tools))` 無約束 | admin → 過 isAdmin() ✓                                                                |
| `/dashboard`                             | `where authorUid == uid`            | 每筆過作者條 ✓                                                                        |
| `getApprovedPainCards`（公開）           | `where approval == 'approved'`      | 過第一條 ✓                                                                            |
| 詳情頁 `/tool/[id]`                      | `getDoc(id)`                        | 公開→過；自己 pending→過；別人 pending→拒 → fetchTool catch → not-found（#30 已處理） |

**關鍵**：全庫**無任何非 admin 的「無約束 list」**（會因 pending doc 失敗整個 query）→ 收緊不破任何現有路徑。

> 非存在 doc 的 GET：收緊後 `resource` 為 null → 規則拒絕（原 `if true` 是允許並回「不存在」）。對 app 而言皆 → fetchTool catch → not-found 狀態頁（#30），UX 一致；差別僅一個被 catch 的 permission-denied（無使用者可見影響）。

## 5. 測試（`firestore.rules.test.mjs`，emulator）

沿用既有 `it()` + fixtures（`t_live`/`t_pending`[dev1]/`t_no_author`[live]、`pc1`[approved,無author]/`pc_dev1`[pending,dev1]），新增 read 段（`getDoc` 已 import）：

- anon 讀 `t_live` → ALLOW；anon 讀 `t_pending` → DENY。
- dev2（非作者非 admin）讀 `t_pending` → DENY；dev1（作者）讀自己 `t_pending` → ALLOW；admin 讀 `t_pending` → ALLOW；viewer 讀 `t_live` → ALLOW。
- anon 讀 `pc1`(approved) → ALLOW；anon 讀 `pc_dev1`(pending) → DENY；dev1（作者）讀 `pc_dev1` → ALLOW；admin 讀 `pc_dev1` → ALLOW。

`npm run test:rules`（emulator，需 Java）全綠；既有 1–27 條不受影響（read 收緊不動 create/update/delete）。

## 6. ⚠️ Console 發布 + P0 live 驗（Jason，唯一非自動步驟）

AGENTS.md 鐵則：本專案 SA 缺 `firebaserules.releases.create` → **rules 改完只能在 Firebase Console 手動貼上發布**。

1. merge PR 後，Jason 把 `firestore.rules` 內容貼到 Console → Firestore → Rules → 發布。
2. **發布後立即連 live 站驗**（2026-05-29 P0 教訓：build/test 過 ≠ runtime「資料×規則」對）：
   - 匿名開首頁 → 仍 **14 個工具**、痛點卡正常（公開可見性沒被收壞）。
   - 詳情頁開一個 live 工具 → 正常；開一個（猜得到 id 的）pending → 看到 not-found（洩漏已堵）。
   - admin 進 /admin → 仍看得到全部含 pending。

## 7. 交付 / 風險

- 分支 `feature-rules-read-hardening`（從 main）→ PR → 獨立 reviewer → CI/Vercel 綠 → 等 Jason merge + **Console 發布 + live 驗**。
- **最大風險＝收壞公開可見性（重演 P0）**：緩解＝(a) §4 相容性逐路徑分析；(b) emulator 測涵蓋公開 ALLOW + 未審 DENY；(c) Jason 發布後強制 live 驗首頁 14 工具。
- rules 改動**無法靠 PR merge 生效**（要 Console 發布）→ PR 描述標明「merge ≠ 生效，需 Jason 發布」。
- 可逆：發布舊版 rules 即回滾。

## 8. 完成定義（DoD）

- tools / painCards read 收緊（公開 || 作者 || admin）。
- `firestore.rules.test.mjs` 補 read 測試、`test:rules` 全綠（含既有 1–27）。
- PR 描述含 §4 相容性、§6 Console 發布步驟 + P0 live 驗清單。
- 獨立 reviewer READY。
