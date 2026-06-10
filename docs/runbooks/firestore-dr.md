# Firestore 災難復原 Runbook

> project `simhope-platform` · database `(default)` · FIRESTORE_NATIVE · region **asia-east1**
> 兩層：PITR（7 天連續）+ managed daily backup（留 14 天）。指令對照官方文件（2026-06-11）。

## 一次性設定（Jason 跑 gcloud；SA 無權）

```bash
# Layer 1：開 PITR（過去 7 天任一時間點可在現有 DB 復原）
gcloud firestore databases update --database='(default)' --enable-pitr --project=simhope-platform

# Layer 2：每日備份排程、留 14 天（備份落在 DB 同區 asia-east1）
gcloud firestore backups schedules create --database='(default)' \
  --recurrence=daily --retention=14d --project=simhope-platform

# 驗證
gcloud firestore databases describe --database='(default)' --project=simhope-platform
gcloud firestore backups schedules list --database='(default)' --project=simhope-platform
```

> `--retention=14d` 是 daily 排程的上限（14 天）。
> Claude 可跑 `node scripts/dr-status.mjs` 代驗 **PITR**（SA 讀得到）；**backup schedules/backups SA 無權（403）**，請用上面的 gcloud 自行確認。

## 復原

### 情境 A — 剛 `--apply` migration 改錯（7 天內，用 PITR）

PITR clone 到一個新 DB，從中撈回正確資料：

```bash
gcloud firestore databases clone --source-database='(default)' \
  --snapshot-time='2026-06-11T10:20:00.00Z' \
  --destination-database='recover-20260611' --project=simhope-platform
```

- `snapshot-time`：RFC3339、**分鐘** granularity、要在「apply 之前」那一刻。
- 完成後 clone 出 `recover-20260611`，從它撈回受影響的 doc（或比對覆寫回 `(default)`）。確認無誤後刪掉 clone DB。

### 情境 B — 整庫毀損 / 誤刪（14 天內，用 daily backup）

```bash
gcloud firestore backups list --format="table(name, database, state)" --project=simhope-platform
gcloud firestore databases restore \
  --source-backup=projects/simhope-platform/locations/asia-east1/backups/BACKUP_ID \
  --destination-database='DESTINATION' --project=simhope-platform
```

- `BACKUP_ID`：上一行 list 裡挑最近一個 state=READY 的。
- `DESTINATION`：若 `(default)` 被刪 → 填 `(default)`；否則先 restore 到暫存 DB 驗證再處理。

### ⚠️ restore / clone 後**必做**（官方：restore 不含 Security Rules + TTL）

1. Console 重新發布 `firestore.rules`（repo 有全文：`firestore.rules`）。
2. 重建 TTL policy（Console / GCloud）：`requests`/`expireAt`、`webauthnChallenges`/`expireAt`、`analytics_daily`/`expireAt`。
3. 確認複合索引在（`firestore.indexes.json`：requests status+createdAt）。

## 清理舊 in-DB 備份（DR 確立後）

真 DR 上線 + 第一個 daily backup 跑出來後，舊的 8 個 `*-backup-*` collection 冗餘（migration 留下的同庫備份，對 DR 無效）：

```bash
node scripts/cleanup-backup-collections.mjs           # dry-run 確認清單（恰 8 個）
node scripts/cleanup-backup-collections.mjs --apply   # 刪
```
