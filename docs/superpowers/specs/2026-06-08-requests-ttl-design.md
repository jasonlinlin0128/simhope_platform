# requests 歸檔 / TTL 自動清理 — 設計（audit #9）

> 日期：2026-06-08 ｜ 分支：`feature-requests-ttl`（從 main `cd3f43b`）
> 來源：`docs/optimization-audit-2026-06-07.md` #9（唯一無上限成長的集合）

---

## 1. 背景

`requests`（開發者申請 access + 提需求 feature）是平台**唯一只增不減**的集合：每筆申請/需求結案後仍永久留存。PR #20（#9 前半）已把收件匣從全量下載改成 `orderBy+limit(50)+startAfter` 游標分頁，解決「讀取」面的成長壓力；但**儲存**面仍無限成長 —— 結案的舊 request 永遠不會被清掉。本案補上後半：**結案的 request 在保留期過後由 Firestore TTL 自動硬刪**。

## 2. 目標 / 非目標

**目標**

- 結案（approved / rejected / handled）的 request 在 **180 天**保留期後，由 Firestore TTL policy 自動刪除。
- **pending 永不自動刪**（沒結案就沒有 `expireAt`，TTL 不碰）。
- 既有「已結案但無 `expireAt`」的舊資料一次性回填。
- 兩種 request（`access` / `feature`）一視同仁。

**非目標**

- 不做「歸檔到別的 collection 再保留」（YAGNI；備份留在一次性 migration backup，正常營運直接硬刪）。
- 不改收件匣 UI / 分頁 / 業務邏輯（只在 3 個結案動作多寫一個欄位）。
- 不引入 Cloud Functions / 排程（用 Firestore 原生 TTL，零維運）。
- 不改 `api/request/route.js`（建立路徑不寫 `expireAt`，確保 pending 永不過期）。

## 3. 架構（改動點）

| #   | 檔案 / 設定                                     | 改動                                                                                                 | 由誰               |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | `src/components/RequestInbox.jsx`               | approve / reject / markHandled 三個 `updateDoc(requests/{id})` 各加 `expireAt`（import `Timestamp`） | 我（code）         |
| 2   | `scripts/backfill-request-expireat.mjs`（新增） | 一次性回填既有已結案 request 的 `expireAt`（dry-run / `--apply` / 自動備份 / idempotent）            | 我寫，**Jason 跑** |
| 3   | Firestore Console → TTL policy                  | collection `requests`、欄位 `expireAt`                                                               | **只能 Jason 做**  |
| 4   | `firestore.rules`                               | **免動**（見 §6）                                                                                    | —                  |
| 5   | `app/api/request/route.js`                      | **不動**（建立時不設 expireAt → pending 不過期）                                                     | —                  |

## 4. `expireAt` 語意（核心設計決策）

`expireAt` 是 Firestore `Timestamp`；TTL policy 會在「`expireAt` 時間點之後（Firestore 排程，通常 24–72h 內）」刪掉該 doc。**只有結案的 request 才有此欄位。**

- **新結案（RequestInbox）**：`expireAt = now + 180 天`。
  保留期從「結案當下」起算（reading：結案後再留 180 天供查詢/稽核，然後清掉）。實作 `Timestamp.fromMillis(Date.now() + RETENTION_MS)`。
- **回填（既有已結案舊資料）**：`expireAt = createdAt + 180 天`（`createdAt` 缺漏時 fallback `now + 180 天`）。
  舊資料沒有「結案時間」欄位（歷史上沒存 `resolvedAt`），用 `createdAt` 當錨點即「建立滿 180 天就清」。對目前平台（上線約 2 週、所有 request 皆 < 180 天）**回填後近期不會刪任何東西**，自然在各自建立滿 180 天後到期；對未來真正老舊（createdAt > 180 天前）的已結案 request，回填即標記為「已過期」→ 下次 TTL 掃描清掉，正是本案目的。備份 collection 仍保留原件兜底。

> 兩條路徑錨點不同（新=結案時 / 舊=建立時）是**刻意**：新案有明確結案當下可取；舊案無歷史結案時間、`createdAt` 是唯一可用且語意正確的下界（已結案 ⇒ 建立時間 ≤ 結案時間）。差異只在「曾長期 pending 才剛結案」的案子，而那類一定走新結案路徑（now+180d），不在回填集合內。不另存 `resolvedAt` 欄位（YAGNI）。

`RETENTION_MS = 180 * 24 * 60 * 60 * 1000`（code 與 script 各自定義同一常數，註明 180 天）。

## 5. 執行順序（AGENTS.md 鐵則：改資料結構的 migration 要等依賴新結構的 code 先上）

`expireAt` 是「新增欄位」、非破壞 schema，本身可安全先部署。真正的破壞性動作是 **TTL policy + 回填**，順序如下（寫進 PR 描述與交付清單）：

1. **code merge + production deploy**（RequestInbox 起，新結案開始寫 `expireAt`）。
2. **回填 dry-run**：`node scripts/backfill-request-expireat.mjs` → 看「幾筆要回填、各自 expireAt 落點」。
3. **回填 `--apply`**：寫入前自動備份 `requests` 全量到 `requests-backup-YYYY-MM-DD/`，idempotent（已有 `expireAt` 者跳過、可重跑）。
4. **Jason 建 Console TTL policy**（collection `requests`、欄位 `expireAt`）。
5. 1–3 天後 Firestore 自動清掉 `expireAt` 已過的；`requests-backup-*` 留著兜底，確認無誤後可自行刪備份。

> 為何回填可在 TTL policy 之前：policy 未建時 `expireAt` 只是普通欄位，不觸發刪除；建 policy 後才開始依 `expireAt` 清。順序 3→4 或 4→3 皆安全（policy 對沒 `expireAt` 的 doc 不動作），採 3→4 是為了「先備份再開刪」。

## 6. firestore.rules（確認免動）

`firestore.rules:89-93`：

```
match /requests/{reqId} {
  allow read: if isAdmin();
  allow create: if false;          // 只有 Admin SDK（api/request）能建
  allow update, delete: if isAdmin();
}
```

`update` 是**欄位無關**的 `isAdmin()`，admin 在收件匣結案時本就在 `updateDoc` 寫 `status`，多寫一個 `expireAt` 同樣放行。**rules 不需改、不需重新發布。** 回填 script 走 Admin SDK，繞過 rules。

## 7. 回填 script 設計（`scripts/backfill-request-expireat.mjs`）

依 `scripts/cleanup-approval-field.mjs` 既有範式：

- `initializeApp({ credential: cert(sa) })`，`sa` 讀 repo 根 `serviceAccountKey.json`。
- `DRY_RUN = !process.argv.includes("--apply")`。
- 取 `requests` 全量 → 篩 `status ∈ {approved,rejected,handled}` **且** 無 `expireAt`（idempotent：已回填者跳過）。
- 每筆計算 `expireAt = (createdAt ? createdAt.toMillis() : Date.now()) + RETENTION_MS`。
- dry-run：印每筆 `id / type / status / createdAt / 算出的 expireAt`，與「共 N 筆」。
- `--apply`：`db.batch()`，每筆先 `backupRef.doc(id).set({...original, _backupAt, _migrationVersion})` 再 `requestsRef.doc(id).update({ expireAt })`；以 ≤200 筆/批分塊 commit（Firestore batch 上限 500 ops、每筆 2 ops），未來集合變大也安全。
- 備份 collection：`requests-backup-2026-06-08`。
- 失敗 `process.exit(1)` + stack（同範式）。

## 8. Console TTL policy（Jason 手動，唯一非自動步驟）

Admin SDK / rules 都**無法**設定 TTL policy（Firestore 限定 Console 或 gcloud）。Jason：

1. Firebase Console → 該專案 → **Firestore Database** → 上方 **TTL**（或「存留時間」）分頁。
2. **建立政策（Create policy）**：Collection group = `requests`、Timestamp field = `expireAt`。
3. 儲存。政策狀態會先 `Building` 再 `Active`（通常數分鐘）。
4. 啟用後 Firestore 會定期（非即時，常 24–72h）刪除 `expireAt < 現在` 的 doc。

> gcloud 等價：`gcloud firestore fields ttls update expireAt --collection-group=requests --enable-ttl`（若偏好 CLI）。

## 9. 測試 / 驗證

**我可做**

- `npm run build` 綠、`npm run lint` 基準 5 不增。
- 回填 script **dry-run**（若 repo 根有 `serviceAccountKey.json`）：實跑只讀不寫，列出實際筆數與 expireAt 落點給 Jason 過目；驗證 idempotent 篩選（已有 expireAt 者不列入）。
- code 靜態核對：3 結案路徑都帶 `expireAt`、建立路徑不帶、pending 路徑不存在。

**Jason 做（auth-gated / Console / 寫入）**

- 部署後 admin 結案一筆 → Firestore Console 看該 doc 多了 `expireAt`（≈ 結案時 +180 天）；pending 的沒有。
- 跑回填 dry-run → `--apply`；確認 `requests-backup-2026-06-08` 有備份。
- 建 TTL policy；1–3 天後抽查老舊已結案 request 被清、pending 與近期結案仍在。

**獨立 reviewer（對抗式，因 TTL 會刪資料）**

- 「pending 會不會誤刪」「expireAt 算錯/單位錯（秒 vs 毫秒）」「batch 漏 backup 或順序顛倒」「idempotent 是否真跳過」「rules 真的不需改」「migration 順序是否安全」逐項挑戰。

## 10. 交付 / 風險

- 分支 `feature-requests-ttl`（從 main `cd3f43b`）→ PR → 獨立 reviewer → CI/Vercel 綠 → **等 Jason merge**。
- **最大風險＝資料誤刪**：緩解＝(a) pending 無 expireAt 永不刪；(b) 回填寫入前全量備份 + idempotent；(c) TTL 啟用前先驗 dry-run 數字；(d) 嚴格執行 §5 順序（code 先上 → 備份回填 → 才建 policy）。
- 次要風險＝毫秒/秒單位（Firestore TTL 讀 Timestamp，`Timestamp.fromMillis` 正確）→ reviewer + dry-run 核對落點年份。
- code 部分（RequestInbox + script）無 migration 鎖死、可乾淨 `git revert`；TTL policy 與已刪資料**不可逆**（故靠備份 + 分階段）。

## 11. 完成定義（DoD）

- RequestInbox 三結案路徑寫入 `expireAt`（now+180d）；建立路徑不寫；pending 不寫。
- `scripts/backfill-request-expireat.mjs` 就緒：dry-run/`--apply`/自動備份/idempotent/分批。
- build 綠、lint 不增、（可行則）dry-run 數字合理。
- 獨立 reviewer READY。
- PR 描述含 §5 執行順序 + §8 Console 步驟 + Jason 待辦清單。
