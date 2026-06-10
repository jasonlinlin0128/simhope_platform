# B-1 使用數據追蹤 + 首頁誠實數字 — 設計

> 日期：2026-06-10 ｜ branch：`feature-usage-analytics`
> 來源：2026-06-10 全平台體檢「B 區（可信度+數據）」拆出的第一個子專案。
> 後續：B-2（需求回饋迴路）另開 spec。

## 1. 問題

平台是「衝內部採用」用的，但目前有兩個互相加乘的缺口：

1. **看不到使用數據** — `src/lib/firebase.js:13` 設了 `measurementId` 但全 codebase 從未 `import getAnalytics` / `logEvent`，零追蹤。誰開了哪個工具、同事在搜什麼、需求漏斗如何，全靠猜，roadmap 沒有數據支撐。
2. **首頁假數字傷可信度** — `app/page.jsx:159-165` 的 MetricsBand 三個數字，只有「可用資源」是真的；「30+ 同仁每週使用」「10h 估計每週省下」是寫死的假數字。對**內部**受眾尤其傷——同事走廊就能 fact-check。其中「省下工時」本質上沒有資料可量。

## 2. 目標 / 非目標

**目標**

- 接上第一方使用追蹤，數據留在公司內部、不送第三方、不記錄個人行為。
- 首頁三個數字全部變成真的（一個來自追蹤、一個靜態真數、一個既有真數）。
- 給 admin 一個可決策的使用概況（哪些工具真被用、趨勢）。

**非目標（YAGNI，明確不做）**

- ❌ GA4 / 任何第三方 analytics（隱私 + 攻擊面 + 無法回餵首頁）。
- ❌ 個人行為 log（無 uid、無 IP 落地，只存匯總計數）。
- ❌ 即時 dashboard、圖表/sparkline（admin 先給排名表，圖表留後續）。
- ❌「省下工時」這類不可量的數字。
- ❌ 近 30 天滑動窗（首頁用累計就夠；daily docs 已建，未來要加窗很快）。

## 3. 追蹤方式決策（已與 Jason 確認）

- **第一方 Firestore 計數**（非 GA4）：數據留內部、無需 cookie 同意、貼合現有 stack、且首頁可直接讀回匯總顯示。
- **儲存模型 = 每日彙總 doc + 累計 doc**（方案 B）：一次 increment 同時寫「累計 doc」（首頁 O(1) 讀）與「當天每日 doc」（admin 趨勢/每工具排名）。

## 4. 資料模型

### 4.1 `analytics/totals`（單一 doc，累計）

```
{
  toolOpen: number,        // 工具被「打開/下載」總次數（核心採用信號）
  toolView: number,        // 工具詳情頁瀏覽總次數
  search: number,          // hub 搜尋總次數
  requestSubmit: number,   // 提需求 / 開發者申請送出總次數
  updatedAt: serverTimestamp
}
```

首頁只讀這一個 doc（O(1)）。累計＝單調成長，閃過冷啟動（不會出現「近期 0 次」的尷尬）。

### 4.2 `analytics_daily/{YYYYMMDD}`（每日一 doc）

```
{
  date: "YYYY-MM-DD",
  toolOpen: number,
  toolView: number,
  search: number,
  requestSubmit: number,
  byTool: { [toolId]: number },   // 當天各工具的 tool_open 次數 → admin 排名用
  expireAt: Timestamp             // TTL：保留約 400 天後自動清，控成長
}
```

- `byTool` 在現況 ~18 個工具下極小；若未來工具成長到數百個再考慮拆 subcollection（YAGNI）。
- `date` 用 **UTC** 的 `YYYYMMDD`（伺服器端 `FieldValue.serverTimestamp()` 寫入時刻換算；doc id 與 `date` 欄位一致），避免跨時區邊界歧義；admin 顯示時不糾結時區（內部工具，趨勢看相對值即可）。

> ⚠️ 與 `requests`/`webauthnChallenges` 同款 TTL：`analytics_daily` 需在 Firebase Console / GCloud 建一條 TTL policy（collection `analytics_daily`、欄位 `expireAt`）。屬 Jason 手動步驟（SA 無建 policy 權），列入 rollout。**未建 policy 不影響功能**，只是舊日 doc 不會自動清。

## 5. 寫入路徑（防灌水）

### 5.1 `POST /api/track`（新）

- body：`{ event: "tool_open"|"tool_view"|"search"|"request_submit", toolId?: string }`
- 驗證：`event` 必須在白名單 enum 內，否則 400；`toolId`（若有）`String().slice(0, 200)`。
- 限流：per-IP，`limit: 60, windowMs: 60000`（比 `/api/request` 的 5/min 寬，因正常瀏覽會頻繁觸發）。沿用 `src/lib/rateLimit.mjs`。
- 寫入：Admin SDK `batch`：
  - `analytics/totals` → `FieldValue.increment(1)` 對應事件欄位 + `updatedAt`
  - `analytics_daily/{今日}` → 對應事件欄位 `increment(1)`；若 `event==='tool_open' && toolId` 再 `byTool.{toolId}` `increment(1)`；`date` / `expireAt` 用 `set(..., {merge:true})` 確保 doc 存在。
- 回應：`{ ok: true }`（極簡；client 不在意回應內容）。
- 錯誤：沿用 `handleApiError`/`HttpError` 風格保持一致（與其他 4 條 AI route 一致）；但本 route 無 auth、邏輯簡單，catch 後回 `{ ok: false }` 不洩漏細節即可。

### 5.2 `src/lib/track.js`（新，client helper）

```
export function track(event, payload = {}) { ... }
```

- `fetch("/api/track", { POST, keepalive: true })`，**fire-and-forget**：不 await UI、`.catch(()=>{})` 吞錯（追蹤失敗絕不影響使用者操作）。
- **同 session 去重（只限 `tool_open` / `tool_view`）**：`sessionStorage` 記 `${event}:${toolId}` 已送過則跳過（避免重整/來回灌同一工具，讓開啟/瀏覽數更誠實）。`search` 與 `request_submit` **不去重**（每次查詢、每筆需求都是真事件，同 session 兩筆需求都要算）。
- `keepalive: true` 讓「點外連結即離開」的 `tool_open` 仍送得出去。

## 6. 埋點（4 個事件）

| 事件             | 觸發點                                                                           | 檔案                                                              |
| ---------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `tool_open`      | **ToolCard CTA 的外部「開啟/下載」連結點擊**（卡片底部 `cta.external` 的 `<a>`） | `src/components/ToolCard.jsx`                                     |
| `tool_view`      | 詳情頁掛載（`fetchTool` 成功 `setTool` 後）                                      | `app/tool/[id]/page.jsx`                                          |
| `search`         | hub 搜尋框（重用既有 300ms `debouncedQuery`、非空才送）                          | `app/hub/page.jsx`                                                |
| `request_submit` | RequestCard 送出成功（feature）+ LoginModal 申請送出成功（access）               | `src/components/RequestCard.jsx`、`src/components/LoginModal.jsx` |

- **`tool_open` 只在「實際使用」時送，不含純導航**：ToolCard 底部 CTA 只有 `cta.external` 那條（外連 `<a target="_blank">`）才送；`cta.disabled`（terminated）與內部 `<Link>`（純導航）**不送**。
  - **實證 getCTA 的 external 真值**（`src/lib/taxonomy.js`）：`external:true` 僅 **webapp / download / doc / api**（L198 的陣列）＋ **skill（有 zip 時）**（L154）。**`mcp` 與 `embedded` external=false**（mcp L171-198 走內部 Link、embedded 走 `/tool/{id}`）→ **mcp/embedded 不送 `tool_open`**（reviewer nit A）。影響：MCP/場域工具的「開啟」首頁不計入累計數——honest-conservative，且 mcp 多半無 dlUrl 會落到「看詳情→」內部連結由 `tool_view` 捕捉。**若日後要讓 mcp 安裝連結也算開啟＋新分頁開啟，把 `"mcp"` 加進 getCTA 的 external 陣列**（屬 UX 行為變更，另案，不在 B-1 偷渡）。
- **範圍界定（B-1）**：`tool_open` 只埋在 **ToolCard CTA**（首頁 + hub 卡片格，使用者掃 marketplace 直接點開的主路徑、且為單一共用元件＝一處乾淨埋點）。**詳情頁內**的 5 個型別專屬開啟/下載連結（skill zip / mcpb / webapp url / download exe / api docsUrl，散在 1202 行檔的多個 top-level 子元件、`id` 不在其 scope）**本期不埋**——進詳情頁已由 `tool_view` 捕捉，且首頁累計數寧可少算（honest-conservative）不可多算。詳情頁開啟埋點列為 fast-follow（待 tool/[id] 拆分後再加）。
- **`search` 只計次、不存查詢字串**：`track("search")` 不帶 query text（隱私乾淨、與「只存匯總計數」一致）；「同事在搜什麼」的字串彙整較敏感且需另設計，列為後續。
  - **計數語意是「debounce 後的查詢變動數」非「相異搜尋數」**（reviewer nit B）：打字＋退格（abc→ab→a）會各記一次，故 admin「搜尋次數」偏高。本期當作粗略方向信號可接受；要精準再做 per-session 去重或只在查詢變長時送。
- 埋點一律呼叫 `track(...)`，單一 import 點，不散落 fetch。

## 7. 讀取路徑 / 首頁

### 7.1 `getMetrics()`（加進 `src/lib/db.js`）

- 讀 `analytics/totals` 單 doc，回 `{ toolOpen, toolView, search, requestSubmit }`；doc 不存在時回全 0（冷啟動 / 尚未有任何事件）。

### 7.2 首頁 MetricsBand（`app/page.jsx:159`）

三個 slot：

- **slot1 可用資源** = `activeCount`（既有真數，不動）
- **slot2 工具開啟** = `totals.toolOpen` 累計次數（追蹤來、單調成長）。label：`累計工具開啟`，cold-start 顯示 0 可接受（站已有真實使用者，部署後即開始累積）。
- **slot3 痛點解法** = `painCards.length`（既有真數，已在頁面 state）。label：`痛點解法`。
- `getMetrics()` 併入首頁既有的 `Promise.all([getCatalog(), getApprovedPainCards()])` → 加第三個 `getMetrics()`，不新增 round-trip 數量級（同批平行）。

## 8. Admin 使用概況（MVP）

- `app/admin/page.jsx` 加 `activeTab === "usage"` 分頁「📊 使用概況」（沿用既有側欄 button + 條件 render 模式）。
- 新 `src/components/UsageDashboard.jsx`：
  - 頂部 4 張數字卡：totals 的 toolOpen / toolView / search / requestSubmit。
  - **每工具開啟排名表**：彙整最近 N 天（預設 14）`analytics_daily` docs 的 `byTool`，join `tools` 取標題，由高到低列出「工具名 — 開啟次數」。
  - 純讀、admin-only；無圖表（後續再加 sparkline）。
- 讀取走 client SDK（admin 已登入、rules 允許 admin 讀 `analytics_daily`）。

## 9. 安全 / 隱私 / rules

### 9.1 firestore.rules 新增

```
// 使用數據：累計數公開可讀（首頁顯示）；每日明細僅 admin 讀；
// 一律禁止 client 寫（只 Admin SDK 經 /api/track 寫，防灌水）。
match /analytics/{docId} {
  allow read: if true;            // totals 首頁要讀；analytics 集合只放 totals
  allow write: if false;
}
match /analytics_daily/{day} {
  allow read: if isAdmin();
  allow write: if false;
}
```

- 與 `passkeys`/`webauthnChallenges` 同款「client deny、只 Admin SDK」模式。
- **隱私**：只存匯總計數，無 uid、無 IP 落地 → 免 cookie 同意、免員工行為追蹤疑慮。
- **防濫用**：寫入只走 rate-limited（60/min/IP）Admin SDK API；前端無法直接 `increment`。即便有人手動灌，數字是「工具開啟次數」非完整性敏感值，且 session 去重 + 限流已收斂；可接受。
- 補 `firestore.rules.test.mjs`：analytics client write 被 deny、`analytics/totals` 公開可讀、`analytics_daily` 僅 admin 讀。

### 9.2 P0 教訓對齊（部署順序）

本 PR **不改任何既有讀取的可見性**（只新增 collection + 新增首頁一個讀），無「資料 × 程式碼」順序風險。rules 仍須 Jason Console 手動發布（SA 無發布權），發布後驗首頁照常 + analytics 寫得進去。

## 10. 測試

- **unit（node:test）**：把可測純邏輯抽到不依賴 firebase 的 `.mjs`（同 rateLimit/apiAuth 慣例），client/server 共用：
  - `src/lib/trackEvents.mjs`：`eventField`（事件→欄位映射 / 未知→null）、`shouldTrack`（去重 + 未知事件不送，注入 seen）、`buildIncrements`（tool_open+toolId→含 byToolKey、tool_view 不記 byTool、未知→null）。
  - `src/lib/metrics.mjs`：`normalizeMetrics`（缺欄補 0）。
- **rules（emulator）**：analytics write deny、totals 公開讀、daily 僅 admin 讀（5 條）。
- `/api/track` route 與 `track.js` client glue 屬薄包裝（核心邏輯已在上述純 `.mjs` 測過）→ 靠 build/lint + rules 測 + 部署後手動驗，不另 mock Admin SDK/fetch。
- **build / lint**：基準不變（lint 目前 2 warnings 0 errors）。
- **手動 / MCP**：部署後驗首頁三數字皆真、點工具→ `totals.toolOpen` 增加、admin 使用概況顯示排名。

## 11. Rollout 順序（對齊 AGENTS.md P0 鐵則）

1. code merge → production deploy 成功。
2. Jason Console：發布新 firestore.rules → **立即驗**首頁照常 + 點工具後 `analytics/totals` 有寫入。
3. Jason Console / GCloud：建 TTL policy（`analytics_daily` / `expireAt`，可與既有兩條一起）。**非阻塞**，只影響舊日清理。
4. 無 migration script（純新增 collection，首寫即建 doc）。

## 12. 影響檔案清單

**新增**：`src/lib/trackEvents.mjs` + `.test.mjs`、`src/lib/metrics.mjs` + `.test.mjs`、`src/lib/track.js`（client glue）、`app/api/track/route.js`、`src/components/UsageDashboard.jsx`
**修改**：`src/lib/db.js`（+`getMetrics`，import `metrics.mjs`）、`app/page.jsx`（MetricsBand 三 slot + 讀 `getMetrics`）、`src/components/ToolCard.jsx`（CTA `cta.external` 埋 `tool_open`）、`app/tool/[id]/page.jsx`（`tool_view` on load）、`app/hub/page.jsx`（`search` 埋點）、`src/components/RequestCard.jsx`（`request_submit` feature）、`src/components/LoginModal.jsx`（`request_submit` access）、`app/admin/page.jsx`（+usage tab）、`firestore.rules`（+analytics 兩 match）、`firestore.rules.test.mjs`（+analytics 測試）
