# Firestore Rules 硬化 — tools/painCards 寫入欄位守門（設計）

- **日期**：2026-06-07
- **分支**：`fix-firestore-rules-hardening`
- **嚴重度**：P0（權限繞過）
- **來源**：2026-06-07 優化體檢 backlog 第 2 節 S1/S2（見 `docs/optimization-audit-2026-06-07.md`）
- **審查**：已過一輪人工 + 一支獨立 agent 對抗式審查（結論 GO-with-fixes，已併入本設計）

---

## 1. 問題

`firestore.rules` 目前 `tools` 與 `painCards` 的 `update` 規則只檢查「是作者或 admin」，**不驗證任何欄位**：

```
allow update, delete: if isSignedIn() && (
  resource.data.authorUid == request.auth.uid || isAdmin()
);
```

後果：

- **P0 — 自助上架繞過審核**：任何 `developer` 提交 pending 工具後，可對自己的 doc 直接發
  `updateDoc({ status: 'live' })`，繞過 admin 審核 wizard 直接上首頁（`getApprovedTools` 把
  `live/beta/new/dev/terminated` 全當公開）。後台審核流程在資料層形同裝飾。
- **P1 — authorUid 竄改**：作者可 `updateDoc({ authorUid: 任意 })`，把工具過繼他人、或把自己鎖在編輯權外、或設成不存在 uid 造成 DoS。
- painCards 有對稱的 `approval` 自核准漏洞（雖目前無 client 寫入路徑，仍應堵）。

根因：**create 規則有約束（強制 `status=='pending'`、`authorUid==uid`），update 規則零約束。**

---

## 2. 範圍

### 納入

- `tools` `update`：非 admin 不可改 `status`、不可改 `authorUid`、不可改 `createdAt`；作者仍可改自己工具的**內容**。
- `painCards` `update`/`delete`：收斂為**僅 admin**（理由見 §4 設計決策）。
- 上線前一支 dry-run **資料盤點腳本**（確認舊資料欄位完整，避免誤擋）。
- Firebase emulator 的 **rules 單元測試**（regression 保護）。

### 不納入（另案 / 暫緩）

- **S3 — `tools allow read: if true`**（pending 內容在資料層世界可讀）：改 read 模型需逐一驗證所有查詢站，風險與測試負擔較高，列為獨立 follow-up。
- 把 status 轉移收斂成 Admin SDK server endpoint（approach B）：YAGNI，rules 已能表達不變式。
- role 改 custom claims（approach C / 體檢 #26）：需 token refresh 配套，獨立議題。
- 作者刪除自己**已上架**工具的權限（既有行為，見 §7 已知限制）。

---

## 3. 現況查證（設計依據）

四條 client 寫入路徑（已讀檔確認）：

| 路徑              | 檔案                                          | 寫入欄位                                                                              | 角色            |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | --------------- |
| 工具建立          | `app/dashboard/page.jsx:142-162`              | `status:'pending'`, `authorUid:uid`, `createdAt:serverTimestamp()`, …                 | developer/admin |
| 作者改內容        | `app/tool/[id]/page.jsx:887-893`              | `blog`, `url`, `type`, `versions`, `updatedAt` —— **不含 status/authorUid/createdAt** | 作者            |
| admin 改狀態      | `app/admin/page.jsx:120-122`                  | `{ status }`                                                                          | admin           |
| admin 審核 wizard | `src/components/ReviewToolWizard.jsx:150-168` | 多欄位 + 條件 `payload.status`                                                        | admin           |

- painCards：**全 repo 無任何 client 寫入**（只 read：`app/page.jsx`、`app/admin/page.jsx:51`、`src/lib/db.js`）。
- 現存 24 張 painCard 由 migration script 種，**無 `authorUid` 欄位**（`scripts/apply-paincard-*.mjs` 未寫過）。

**關鍵結論：合法的作者寫入路徑從不碰 `status`/`authorUid`/`createdAt`，所以欄位守門對現有功能零破壞（純 rules 改動，不動任何 client code）。**

---

## 4. 設計

### 4.1 helper 函式（加在現有 `isAdmin()` 旁）

```
// 欄位不變式：非 admin 編輯自己文件時必須成立。
// status / authorUid / approval 用 plain equality（fail-closed）——
//   現值缺欄位時運算式 error → 作者分支 false → 落入 isAdmin()，安全方向。
// createdAt 用 guarded（不敏感、舊文件可能缺，避免誤擋內容編輯）。
function statusUnchanged()    { return request.resource.data.status   == resource.data.status; }
function authorUidUnchanged() { return request.resource.data.authorUid == resource.data.authorUid; }
function approvalUnchanged()  { return request.resource.data.approval == resource.data.approval; }
function createdAtUnchanged() {
  return !('createdAt' in resource.data.keys())
      || request.resource.data.createdAt == resource.data.createdAt;
}
```

### 4.2 tools

```
match /tools/{toolId} {
  allow read: if true;                       // 本次不動（S3 另案）

  allow create: if isSignedIn()
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['developer', 'admin']
    && request.resource.data.authorUid == request.auth.uid
    && request.resource.data.status == 'pending';

  // 作者分支在前 → 作者自編可短路掉 isAdmin() 的 get()（0 次讀）。
  allow update: if isSignedIn() && (
       ( resource.data.authorUid == request.auth.uid
         && authorUidUnchanged()
         && statusUnchanged()
         && createdAtUnchanged() )
    || isAdmin() );                          // admin 不受不變式限制（改 status/轉移 authorUid 皆可）

  allow delete: if isSignedIn() && (
    resource.data.authorUid == request.auth.uid || isAdmin()
  );
}
```

### 4.3 painCards（設計決策：update/delete 僅 admin）

獨立審查指出：對 painCards 加「作者 update 分支」會依賴 `authorUid`，但**現存 24 張卡無此欄位** →
對所有現存卡 fail-closed（作者永遠改不動），形同替不存在的前台編輯流程開死碼 + 破綻面。
依 YAGNI，收斂為僅 admin：

```
match /painCards/{cardId} {
  allow read: if true;

  allow create: if isSignedIn()
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['developer', 'admin']
    && request.resource.data.authorUid == request.auth.uid
    && request.resource.data.approval == 'pending';

  allow update, delete: if isAdmin();
}
```

> 若未來真要做「作者自助編輯 painCard」前台，再回頭加作者分支，並**同時**用 migration 替既有卡補
> `authorUid`（屆時 `approvalUnchanged()` helper 已備好可重用）。

### 4.4 邊界與資料前提

- `request.resource.data` 是寫入後的**完整文件**（非 delta）；未在 payload 的欄位取現值，故
  `statusUnchanged()` 對「只改內容」的作者寫入恆為 true。
- 安全欄位（status/authorUid/approval）**刻意用 plain equality（fail-closed）**：若現值缺欄位 →
  運算式 error → 作者分支 false → 只有 admin 能改該 doc。安全方向正確，但代價是「缺欄位的舊
  工具作者改不動」。**因此 §5 的資料盤點是必要前置。**
- `createdAt` guarded：舊文件缺 createdAt 時跳過比較、允許內容編輯，不 brick。

---

## 5. 上線前資料盤點（必要前置，依 AGENTS.md 資料×程式碼順序）

新增（或以一次性 node 指令執行）`scripts/__audit-tool-fields.mjs`（dry-run、唯讀）：

- 掃 `tools` 集合，列出**缺 `authorUid` / 缺 `status` / 缺 `createdAt`** 的 doc id 與其現況。
- 判斷準則：
  - 缺 `authorUid` 或 `status` 且「需要非 admin 作者能編輯」者 → 發規則前先 backfill。
  - 確認只由 admin 維護者（平台/專案工具）→ 缺 authorUid 可接受（fail-closed 正確）。
- 一併掃 `painCards` 是否如預期皆無 `authorUid`（佐證 §4.3 決策）。

> 無 schema 變更、無破壞性寫入；若需 backfill 才寫入，沿用 repo migration 慣例（`--apply` 才寫、
> 自動備份、idempotent）。

---

## 6. 驗證 — Firebase emulator rules 單元測試

新增 devDeps 與測試（repo 目前無測試框架；rules 無法用既有 `scripts/__verify-*.mjs` 純邏輯測，需 emulator）：

- devDependencies：`@firebase/rules-unit-testing`、`firebase-tools`。
- `firebase.json` 補 emulator 設定（firestore emulator）。
- 測試檔 `firestore.rules.test.mjs`（package.json 無 `"type":"module"`，`.mjs` 可直接跑）。
- npm script：`"test:rules": "firebase emulators:exec --only firestore \"node firestore.rules.test.mjs\""`。

### 測試矩陣（每條斷言 allow / deny）

| #   | 角色           | 動作                                              | 期望      |
| --- | -------------- | ------------------------------------------------- | --------- |
| 1   | 作者           | 改自己 pending 工具內容（blog/url/type/versions） | **ALLOW** |
| 2   | 作者           | 對自己工具 `{status:'live'}`（原始 P0）           | **DENY**  |
| 3   | 作者           | 對自己工具改 `authorUid`                          | **DENY**  |
| 4   | 作者           | 對自己工具改 `createdAt`                          | **DENY**  |
| 5   | admin          | 改任一工具 `status`                               | **ALLOW** |
| 6   | admin          | 改任一工具 `authorUid`（轉移）                    | **ALLOW** |
| 7   | 非作者非 admin | 改別人的工具                                      | **DENY**  |
| 8   | developer      | create `status:'live'`（regression 守門）         | **DENY**  |
| 9   | developer      | create `status:'pending'`、authorUid==自己        | **ALLOW** |
| 10  | 作者           | 編輯缺 `createdAt` 的舊工具內容（不 brick）       | **ALLOW** |
| 11  | 作者           | 刪自己工具                                        | **ALLOW** |
| 12  | 非作者         | 刪別人工具                                        | **DENY**  |
| 13  | developer      | painCards `{approval:'approved'}`                 | **DENY**  |
| 14  | admin          | painCards 改 approval                             | **ALLOW** |
| 15  | developer      | painCards create `approval:'pending'`             | **ALLOW** |

---

## 7. Rollout

純 rules 改動，**無資料遷移**（除非 §5 盤點發現需 backfill），client code 不動 → 無 deploy 順序風險。

1. 分支 `fix-firestore-rules-hardening`：改 `firestore.rules` + 加 emulator 測試 + devDeps + 盤點腳本。
2. 本機/CI 跑 `npm run test:rules` 綠燈、`npm run lint`/`build` 不破。
3. 跑 §5 盤點腳本（dry-run）；若有缺欄位需 backfill，先依慣例 `--apply` 補齊並驗證。
4. PR → review → merge。
5. **手動發布規則**：本專案 SA 缺 `firebaserules.releases.create`，`deploy-*-rules.mjs` 只能建
   ruleset 不能發布 → 用 Firebase Console「Rules」貼上發布（AGENTS.md 已記）。
6. **連 live 站驗證**（build 過 ≠ runtime 對）：
   - 用 developer 帳號嘗試把自己 pending 工具改 live → 應失敗（permission-denied）。
   - admin 後台改 status / 跑 wizard → 應正常。
   - 作者編輯自己工具內容 → 應正常。

---

## 8. 已知限制（明確標註，非缺陷）

- **作者仍可刪除自己已上架（live）的工具** —— 既有行為，本次 P0 不處理；若在意，未來可在
  `tools` delete 加 `&& resource.data.status == 'pending'`。
- **現存 24 張 painCard 不可被作者編輯** —— intended（無前台編輯流程；update/delete 僅 admin）。
- **作者無法自行調整自己工具的 status**（含「下架自己的工具」）—— intended，狀態轉移一律經 admin。
- 缺 `authorUid`/`status` 的舊工具會變成「僅 admin 可編輯」—— 由 §5 盤點確認可接受或先 backfill。

---

## 9. 完成定義（DoD）

- [ ] `firestore.rules` tools/painCards update 守門到位（§4）。
- [ ] §6 測試矩陣 15 條全綠（emulator）。
- [ ] §5 盤點腳本跑過，缺欄位情形已確認/backfill。
- [ ] Console 手動發布 + live 站三項手動驗證（§7.6）通過。
- [ ] backlog 文件 S1/S2 標記為已修。
