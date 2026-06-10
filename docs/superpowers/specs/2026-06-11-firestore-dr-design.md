# Firestore 災難復原（DR）— 設計

> 日期：2026-06-11 ｜ branch：`feature-firestore-dr`
> 來源：平台體檢 Top-5 #2（最高保險價值）。

## 1. 問題

目前唯一的「備份」是 migration script 寫進**同一個 Firestore** 的 backup collection。實證 prod 有 **8 個 in-DB backup collection**（`tools-backup-2026-05-27/28/29×2/06-01`、`painCards-backup-2026-05-28/29`、`requests-backup-2026-06-08`）——專案級災難（誤刪 DB、勒索、region 故障）會同生共死，**等於沒有真正的 DR**。每次 `--apply` migration 都在走鋼索。

**現況**：project `simhope-platform`、database `(default)`、FIRESTORE_NATIVE、region **asia-east1**、**PITR 目前 DISABLED**。

## 2. 目標 / 非目標

**目標**：建立真正的 Firestore DR（資料存在 DB 之外、整庫被刪也救得回），讓 `--apply` 不再走鋼索。

**非目標（YAGNI）**：❌ GCS offsite export（第三層，內部低流量工具 overkill — Jason 已選不做）❌ weekly backup 層（Jason 選只 daily）❌ 多 region 複製。

## 3. 已確認的決策（Jason）

- **兩層**：PITR（7 天連續）+ managed daily scheduled backup。
- **保留期**：daily backup **14 天**（無 weekly）。
- **順帶 (a)**：清掉 8 個舊 in-DB backup collection。
- **順帶 (b)**：migration 慣例改靠 PITR（取代寫 in-DB backup collection）。

## 4. 設計

### 4.1 兩層保護（互補）

- **Layer 1 — PITR**：過去 7 天任一時間點，在**現有 DB** 內 granular 回滾。擋日常 `--apply` 誤寫/誤刪。
- **Layer 2 — Daily managed backup（留 14 天）**：每日全庫快照，存 Firestore 備份服務（DB 外）。**整個 DB 被刪也能 restore 到新 DB**。
- 兩者覆蓋不同失效模式：PITR = 近期精細回滾（但 DB 被刪就沒）；backup = 整庫災難復原。

### 4.2 設定指令（Jason 跑；SA 無權，已實證連 index 都建不了）

官方文件核對過（asia-east1 已填入）：

```bash
# Layer 1: 開 PITR（7 天連續）
gcloud firestore databases update --database='(default)' --enable-pitr --project=simhope-platform

# Layer 2: 建每日備份排程、留 14 天（備份落在 DB 同區 asia-east1）
gcloud firestore backups schedules create --database='(default)' \
  --recurrence=daily --retention=14d --project=simhope-platform

# 驗證
gcloud firestore databases describe --database='(default)' --project=simhope-platform   # pointInTimeRecoveryEnablement / earliestVersionTime
gcloud firestore backups schedules list --database='(default)' --project=simhope-platform
```

### 4.3 復原 runbook（我寫到 `docs/runbooks/firestore-dr.md`，Jason 照跑）

- **情境 A — 剛 `--apply` 改錯（7 天內）**：用 PITR clone 到新 DB 撈正確資料：
  ```bash
  gcloud firestore databases clone --source-database='(default)' \
    --snapshot-time='2026-06-11T10:20:00.00Z' \  # RFC3339 分鐘granularity，apply 前那一刻
    --destination-database='recover-20260611' --project=simhope-platform
  ```
  → 從 clone 出的 DB 撈回受影響的 doc（或整批比對覆寫回 (default)）。
- **情境 B — 整庫毀損/誤刪（14 天內）**：從最近 daily backup restore 到新 DB：
  ```bash
  gcloud firestore backups list --format="table(name, database, state)" --project=simhope-platform
  gcloud firestore databases restore \
    --source-backup=projects/simhope-platform/locations/asia-east1/backups/BACKUP_ID \
    --destination-database='DESTINATION' --project=simhope-platform
  ```
- **⚠️ restore/clone 後必做**（官方文件明載 restore **不含** Security Rules + TTL policies）：
  1. Console 重新發布 `firestore.rules`（repo 有全文）。
  2. 重建 TTL policy：`requests/expireAt`、`webauthnChallenges/expireAt`、`analytics_daily/expireAt`（Console）。
  3. 若 restore 到新 DB id：app 仍用 `(default)`，故整庫救援通常 restore 到 `(default)`（若被刪）或先到暫存 DB 驗證再處理。

### 4.4 我的交付物

- `docs/runbooks/firestore-dr.md` — 完整 runbook（設定 + 兩情境復原 + 確切指令 + restore 後 reapply 清單）。
- `scripts/dr-status.mjs` — 用 SA 查 PITR 啟用狀態 + backup schedule（我可代驗 Jason 設定完）。唯讀。
- `scripts/cleanup-backup-collections.mjs` — dry-run/`--apply` 刪 8 個舊 in-DB backup collection（idempotent；只刪 `*-backup-*` 命名；遞迴刪 doc）。
- `AGENTS.md` — migration 慣例更新（順帶 b）。

## 5. Rollout（順序重要 — 別在新 DR 確立前刪舊備份）

1. **Jason 跑 2 條 gcloud**（開 PITR + 建 backup schedule）。
2. 我跑 `dr-status.mjs` 驗 PITR=ENABLED + schedule 存在。
3. **等第一個 daily backup 跑出來**（或確認 schedule active）→ 確認 DB 外有真備份。
4. **才**跑 `cleanup-backup-collections.mjs --apply` 刪 8 個舊 in-DB backup（此時真 DR 已兜底）。
5. AGENTS.md 慣例更新（隨 PR）。

## 6. 影響檔案

**新增**：`docs/runbooks/firestore-dr.md`、`scripts/dr-status.mjs`、`scripts/cleanup-backup-collections.mjs`
**修改**：`AGENTS.md`（migration 慣例 → PITR）
**Jason 手動（非檔案）**：2 條 gcloud 設定 + 未來復原時照 runbook。
