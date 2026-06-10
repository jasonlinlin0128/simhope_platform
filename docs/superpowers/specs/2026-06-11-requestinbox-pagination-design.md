# RequestInbox 待審分頁修正 + firestore.indexes.json — 設計

> 日期：2026-06-11 ｜ branch：`feature-requestinbox-pagination`
> 來源：平台體檢 2026-06-10 唯一的真 correctness bug（audit #1）+ #27（indexes 未版控）。Jason 選 **修法 A**。

## 1. 問題（確認）

`src/components/RequestInbox.jsx` 抓第一頁 = 50 筆 `orderBy createdAt desc`（**不分 status**，L33-49），再 client 端 filter 成 pending（L129-131）。預設 filter = `pending`。

→ 當最新 50 筆多是已結案（approved/handled/rejected），**待審項目若排在第 50 筆之後就從畫面消失**，admin 要狂點「載入更多」一次撈 50 筆結案才翻得到。`requests` 有 180 天 TTL 會累積，加上 B-2b 剛把提需求變「有去有回」→ 量會長 → bug 會咬。

**現況**：prod `requests` 僅 3 筆（approved/handled/pending 各 1），全在第一頁 → **目前潛伏不痛，但前瞻修掉**。

**順帶**：`firestore.indexes.json` 不存在、`firebase.json` 無 indexes 設定（#27）→ 複合索引無法版控/重建。

## 2. 目標 / 非目標

**目標**：pending 篩選改在 query 層，讓分頁在「已過濾集合」上翻 → 待審永不消失；順手把複合索引納入版控。

**非目標（YAGNI）**：❌ 不改 requests 寫入 / rules / 其他 collection 查詢 ❌ 不重構 RequestInbox 其他部分 ❌ 不加即時 listener。

## 3. 修法（A，Jason 已選）

### 3.1 `RequestInbox.jsx` — query 層 status 過濾

- `fetchPage(after, statusFilter)`：`statusFilter==='pending'` 時 query 加 `where("status","==","pending")`；`'all'` 時不加（如現在）。
- `load(statusFilter)`：fetchPage(null, statusFilter) → 重置 reqs/cursor/hasMore。
- `loadMore`：fetchPage(cursor, filter)（沿用目前 filter）。
- `useEffect`：deps 改 `[load, filter]` → **filter 變就從第一頁重新載入**（不同 query），取代原本只 client 重濾。
- `shown`：`filter==='pending' ? reqs.filter(r=>r.status==='pending') : reqs` —— pending 時 reqs 已被 query 過濾，但**保留 client filter 作第二層**，讓 admin 核准/標記後該筆即時掉出（毋需重抓）。access/feature 分組不變。
- catch 訊息補「（索引已建？）」提示。

### 3.2 複合索引版控

- 新 `firestore.indexes.json`：`requests` collection，欄位 `status ASC, createdAt DESC`。
- `firebase.json` firestore key 加 `"indexes": "firestore.indexes.json"`。

## 4. 測試 / 驗證

- **無新 unit test**：本修正是 firebase query + React state 的行為改動，無乾淨可抽的純邏輯（query 建構回傳 firebase 物件、無 emulator 整合測試框架）。誠實標明，靠 build/lint + 人工驗。
- **build / lint**：基準不變（2 warnings 0 errors）。
- **人工 / 我代驗（部署 + 建索引後）**：admin 收件匣切 pending/all、載入更多、核准一筆 → 該筆即時掉出 pending 視圖。現況 3 筆無法實測 >50 邊界，但 query 邏輯正確 + reviewer 逐行確認。

## 5. Rollout（有索引依賴，順序重要）

1. **先建索引**（索引獨立於程式碼、可先建）：`firebase deploy --only firestore:indexes`（或 Console；SA 可能無權→Console）→ 索引 build 數分鐘。
2. code merge → deploy。
3. （若索引尚未 ready，pending query 會 error → catch → console.error + 空清單；故**索引先建**較順。索引 ready 後 pending 視圖正常分頁。）
4. 無 migration / 無 rules / 無 Console rules。

## 6. 影響檔案

**新增**：`firestore.indexes.json`
**修改**：`src/components/RequestInbox.jsx`（fetchPage/load/loadMore/useEffect/shown）、`firebase.json`（+indexes key）
