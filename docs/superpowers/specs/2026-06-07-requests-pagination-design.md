# requests 分頁（#9）— design（2026-06-07）

> 來源：`docs/optimization-audit-2026-06-07.md` #9（P2，DB；audit 點名「唯一無上限成長集合」、建議優先）。

## Context

`src/components/RequestInbox.jsx:15`（admin 收件匣）以
`getDocs(collection(db, "requests"))` **全量下載** requests，再 client 端排序。
requests 由匿名「提需求」+ 開發者「申請」server-side 建立（`/api/request`），
**無上限成長** → 收件匣每次載入都把整個集合抓下來。

- rules：requests `read: if isAdmin()`、`create: if false`、`update/delete: if isAdmin()`。
- 狀態：pending → approved/rejected（access）/ handled（feature）。
- `createdAt`：兩種 request 皆寫 `FieldValue.serverTimestamp()` → 每筆都有、型別一致。

## Decision: Approach A（純前端分頁，免 composite index/Console）

- query：`orderBy("createdAt","desc")` + `limit(50)`；「載入更多」用 `startAfter(lastDoc)` 游標往後翻。
- **單欄位 orderBy → Firestore 自動索引**，毋需 composite index、毋需 Console/deploy。
- 保留既有 client-side `pending | all` filter（預設 `pending` 已隱藏 resolved，收件匣不亂）。
- 動作（approve/reject/markHandled）後改**本地更新單筆 status**（毋需重抓整頁、保留已載入頁、即時反應）。

### 為何不用 Approach B（`where(status==pending)+orderBy`）

更精準只抓待處理，但 where+orderBy 跨欄位需 **composite index**（status, createdAt）→
要寫 `firestore.indexes.json` + Jason Console/deploy 建索引。對內部工具，A 的
「最近 50 + 載入更多 + client filter」已足夠且零外部依賴。

## Out of scope（defer，另案）

- **歸檔 / TTL**：bound 的是 _storage_ 成長（慢、便宜），非本案要解的 _download_。
  真做需 Firestore TTL policy（Console 動作，比照 rules 發布）或刻意的歸檔設計（archive
  collection / 排程清理）→ 獨立 follow-up。

## Changes

- `src/components/RequestInbox.jsx`：query + `limit` + `startAfter` 游標 + 「載入更多」按鈕；
  動作後本地 `setStatus` 取代整頁 `load()` 重抓。其餘 UI/markup 不動。

## Verification

- `npm run build` 綠、`npm run lint` 無新增 error（我可驗）。
- ⚠️ **runtime 需 Jason admin 登入驗**（preview 網域不在 Firebase authorized domains →
  需本機 `npm run dev` + admin 登入）。本 PR 我只擔保 build/lint。

### Test Plan（Jason，admin 登入收件匣）

- 收件匣首載只抓最近 50（不再全量）；底部「載入更多」載下一批、翻到底按鈕消失。
- `pending / 全部` filter 正常切換。
- 核准 / 拒絕 / 標記已處理後該筆**即時更新**、且在 pending 視圖中移除（毋需整頁刷新）。
