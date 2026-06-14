# 使用訊號 → 首頁熱門工具（Popular Tools）

- 日期：2026-06-14
- 狀態：設計定案（待 writing-plans）
- 主題：把已建好的第一方 analytics 變成使用者看得到的「發現力」——首頁顯示熱門工具。

## 背景與問題

平台工程地基已穩（三輪體檢清空）。下一個價值點在**飛輪**：內容 → 發現 → 使用 → 訊號 → 回饋發現。
目前缺口：

- 使用訊號只有 `tool_open`（且只在 `ToolCard` 的 `cta.external` 觸發 → mcp/embedded 等 `external=false` 類型永遠不計）。
- `tool_view` 已定義於 `TRACK_EVENTS` 但**全站從未觸發**（詳情頁開啟未埋點）。
- 每工具計數（`byTool`）只存在 `analytics_daily/{day}`（每日、~400d TTL），且**只有 admin 後台（`UsageDashboard`）讀**，公開頁沒有任何熱門排序。

本案：新增詳情頁瀏覽埋點 + 全期 per-tool 累計，於**首頁**呈現「🔥 熱門工具」。

## 決策（brainstorm 定案）

| 維度       | 決定                               | 理由                                                       |
| ---------- | ---------------------------------- | ---------------------------------------------------------- |
| 排序訊號   | **詳情頁瀏覽 `tool_view`**         | 涵蓋所有工具類型（含 mcp/embedded）；公平、簡單            |
| 時間窗     | **全期累計**（O(1) aggregate doc） | 低流量期累積訊號最快；最便宜；每日資料仍收，未來可加趨勢榜 |
| 露出位置   | **首頁「🔥 熱門工具」區**（top N） | 曝光最高、落地即見，最能驅動發現                           |
| 數字可見度 | **只排序、不露原始數字**           | 符合平台「誘數字誠實、不美化」原則；避開早期小數字難看     |

## 目標 / 非目標

**目標**

- 詳情頁被瀏覽時記錄 per-tool 全期瀏覽數（匿名匯總、無個人行為）。
- 首頁顯示依瀏覽數排序的 top N 熱門工具，不顯示原始數字。
- 完全自我完整：無 rules/index/TTL/SA/Console 動作，merge 即部署。

**非目標（路線圖之後）**

- 近 30 天趨勢榜、/hub 熱門排序選項、👍「有幫助」回饋、露出原始數字。

## 架構與資料流

```
詳情頁載入（tool 成功載入、且非作者/admin 自看）
  → track("tool_view", { toolId })         // session 去重（既有）
  → POST /api/track（Admin SDK、60/min IP 限流，皆既有）
     → analytics/totals.toolView +1                         （既有）
     → analytics_daily/{day}: toolView +1, byTool.{id} +1   （byTool 為本案新增涵蓋 tool_view；留作未來趨勢榜）
     → analytics/toolViews.{id} +1                          （本案新增：全期 per-tool aggregate）

首頁 app/page.jsx（server component, revalidate=300）
  → getServerCatalog() + getServerToolViews()（REST，匿名、受 rules）
  → rankPopularTools(tools, viewsMap, opts) → top N
  → 渲染「🔥 熱門工具」區（既有 ToolCard，不露數字）
```

## 元件（邊界清楚、可獨立測）

1. **`src/lib/trackEvents.mjs`** — `buildIncrements(event, toolId)` 讓 `tool_view` 也回 `byToolKey`（目前只有 `tool_open`）。純邏輯。
2. **`app/api/track/route.js`** — 當 `event === "tool_view"` 且有 toolId，於同一 batch 多 `set(analytics/toolViews, { [id]: increment(1) }, { merge: true })`（巢狀 map + merge，與既有 byTool 寫法一致）。
3. **`app/tool/[id]/page.jsx`** — tool 成功載入後（`loading` 結束、`tool` 非 null）`track("tool_view", { toolId: id })`；**`canEdit`（作者/admin）為真時不送**（防自看灌水）。
4. **`src/lib/serverCatalog.js`** — 新增 `getServerToolViews()`：REST 讀 `analytics/toolViews`，回 `{ [toolId]: number }`；doc 不存在 / 失敗 → `{}`（沿用 `getServerMetrics` 的 fail-soft 模式 + `next: { revalidate: 300 }`）。
5. **`src/lib/popularTools.mjs`（新）** — 純函式 `rankPopularTools(tools, viewsMap, { limit = 6, minWithViews = 3, statuses = ["live","beta","new"] })`：
   - 篩選 `statuses` 內的工具；
   - 依 `viewsMap[id] || 0` 由大到小排序（穩定：同分維持原順序）；
   - 若「有瀏覽數（>0）的合格工具數 < minWithViews」→ 回 `[]`（首頁據此整區不顯示）；
   - 否則回前 `limit` 個（只取 views > 0 者）。
6. **`app/page.jsx`** — 在既有版面適當位置（資源列表上方）加「🔥 熱門工具」server 區塊；`rankPopularTools` 回空陣列時整區不渲染。

## 資料模型

新增單一 aggregate doc：`analytics/toolViews`

```
analytics/toolViews = { "<toolId>": <number>, ... , updatedAt: <serverTimestamp 可選> }
```

- 與 `analytics/totals` 同層，`analytics/{docId}` 規則已是「公開讀 / client 禁寫」→ **新 doc 自動涵蓋，無 rules 變更**。
- 單一 doc、map of ~18–50 個工具 → 讀寫 O(1)，無 N+1。
- 永久 aggregate，不需 TTL（每日明細才有 TTL）。

## 預設值（可於 plan/實作微調）

- Top N = **6**（對齊首頁網格）
- 顯示門檻 minWithViews = **3**（少於 3 個合格工具有瀏覽 → 整區不顯示）
- 排序範圍 statuses = **`live` / `beta` / `new`**（排除 `terminated` 已下架、`dev` 規劃中、`pending` 未公開）
- 作者/admin 自看不計數

## 誠實 / 隱私

- 僅匯總計數，無 per-user 行為（延續 B-1 原則）。
- 不露原始數字。
- 防灌水：session 去重（既有）+ IP 60/min（既有）+ 作者自看排除（新增）。

## 不需要的基礎設施動作

- 無 `firestore.rules` 變更（analytics 規則已涵蓋）
- 無新複合索引
- 無 TTL policy（aggregate doc 永久）
- 無 service account / Console 操作
- → **merge 即由 Vercel 部署生效**

## 測試（TDD）

- `trackEvents.test.mjs`：`buildIncrements("tool_view", id)` 現在回 `{ field:"toolView", byToolKey:id }`（原本 byToolKey 為 null）；無 toolId 時 byToolKey 仍 null；其餘事件不變。
- `popularTools.test.mjs`：依數排序、top N 截斷、未達門檻回 `[]`、排除非 live/beta/new、無瀏覽工具不混入、viewsMap 缺鍵當 0。
- `serverCatalog` 的 `getServerToolViews`：REST 回應解析 + fail-soft（可比照既有 metrics 測法；若 REST 解析已有 `firestoreValue` 覆蓋則複用）。
- 埋點呼叫（client）、首頁 JSX 區塊：build / lint + 部署後人工驗。

## Rollout

1. merge → Vercel 部署（無前置 ops）。
2. 部署後：開幾個工具詳情頁 → 隔 ISR 視窗（≤5 分）確認首頁出現熱門區、排序合理、不露數字、未達門檻時整區不顯示。
3. 驗 `analytics/toolViews` 有正確累加（admin 可讀；或 Admin SDK 查）。

## 風險 / 緩解

- **早期資料稀疏** → 門檻 minWithViews 整區隱藏，不顯示半空榜。
- **灌水** → session 去重 + IP 限流 + 作者自看排除；內部站風險本就低。
- **熱門固化（全期累計不換血）** → 已知取捨；未來趨勢榜（每日資料已在收）可補。
