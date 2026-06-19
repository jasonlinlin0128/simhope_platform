# 飛輪決策儀表板（三訊號合表）— 設計 spec

- 日期：2026-06-19
- 分支：`feature-flywheel-insights`
- 狀態：設計已由 Jason 口頭確認，待 spec 過目 → writing-plans

## 1. 背景與目標

飛輪（內容 → 發現 → 使用 → 訊號 → 回饋發現）的**訊號收集已全部上線**：每工具瀏覽
（`analytics/toolViews`，全期）、有幫助（`analytics/toolHelpful`，全期）、開啟
（`analytics_daily.byTool`，dated）三種訊號都在累積，並已驅動首頁🔥熱門與 ToolCard 的
👍 badge。

但**operator（Jason）看不到這些訊號的全貌**。admin 後台 `📊 使用概況`
（`src/components/UsageDashboard.jsx`）目前只顯示 4 張累計數字卡 + 一個「工具開啟排名
（近 14 天）」單一清單。其中**瀏覽與有幫助這兩個花了 PR 收集的訊號，從未呈現給 operator**。

**目標**：在 `📊 使用概況` 分頁就地把開啟排名換成**一張三訊號合表**，讓 Jason 一眼看到
「哪個工具實際被看 / 被開 / 被覺得有幫助」，可點欄位排序自行比對。把已收集的訊號變成可讀的儀表。

## 2. 範圍

### 做

- 在現有 `UsageDashboard.jsx` 裡，把「工具開啟排名（近 14 天）」清單**換成**一張
  per-tool 三訊號合表（保留上方 4 張累計數字卡不動）。
- 表格欄位：**標題 · status · type · 👁 瀏覽（全期）· 📂 開啟（14d）· 👍 有幫助（全期）**。
- **可點欄位標題重新排序**，預設依「瀏覽（全期）」遞減。
- **列出全部目錄工具**（含 dev / pending / terminated）；零訊號工具自然沉到最底。
- join + 排序邏輯抽成**純函式 + TDD**（比照既有 `rankPopularTools` / `sortTools.mjs`）。

### 不做（YAGNI；Jason 這次明確只選「三訊號合表」）

- ❌ 零訊號 / 下架候選旗標
- ❌ 痛點供給缺口（painCard 無 relatedToolId）+ 規劃中推進旗標
- ❌ 高瀏覽低回饋軟訊號
- ❌ 新分頁（就地擴充 `📊 使用概況`，不新增 nav）
- ❌ 新 API route、❌ 新 npm 依賴、❌ 付費 API、❌ firestore.rules 變更、❌ 資料遷移、❌ SA 動作

## 3. 資料來源與權限（已驗證）

| 訊號     | 來源 doc                            | 形狀                                 | 視窗         | 權限（firestore.rules）                                      |
| -------- | ----------------------------------- | ------------------------------------ | ------------ | ------------------------------------------------------------ |
| 瀏覽     | `analytics/toolViews`               | `{ toolId: number, updatedAt? }`     | 全期         | `match /analytics/{docId}` → `allow read: if true` ✅        |
| 有幫助   | `analytics/toolHelpful`             | `{ toolId: number, updatedAt? }`     | 全期         | 同上（公開讀）✅                                             |
| 開啟     | `analytics_daily/{YYYYMMDD}.byTool` | `{ toolId: number }`                 | 近 14 天加總 | `allow read: if isAdmin()`（UsageDashboard 已以 admin 讀）✅ |
| 工具中繼 | `getAllTools()`（`src/lib/db.js`）  | `{ id, title, status, type, ... }[]` | —            | admin 既已讀                                                 |

- `analytics/totals`、`analytics_daily` UsageDashboard **現在就在 client 端讀**；新增讀
  `analytics/toolViews`、`analytics/toolHelpful` 是同一 collection、同一 `getDoc` 模式 →
  **零新權限、零新 route**。
- 讀 `toolViews` / `toolHelpful` 時要**濾掉非數值欄位**（如 `updatedAt`），比照
  `serverCatalog.js` 的 `getServerToolViews()` / `getServerToolHelpful()` 作法。

## 4. 元件與資料流

```
UsageDashboard (client, admin)
  useEffect:
    ├─ getDoc(analytics/totals)        → 4 張累計卡（沿用）
    ├─ getDoc(analytics/toolViews)     → viewsMap   { id: n }（新）
    ├─ getDoc(analytics/toolHelpful)   → helpfulMap { id: n }（新）
    ├─ getDocs(analytics_daily × 14)   → opensMap   { id: n }（沿用既有加總邏輯）
    └─ getAllTools()                   → tools[]（沿用）
  → buildToolSignalRows(tools, { viewsMap, opensMap, helpfulMap })  // 純函式
  → rows state；sortKey state（預設 "views"）
  → render：sortToolSignalRows(rows, sortKey) 套用後輸出表格
```

並行抓取（`Promise.all`）；任一 analytics doc 不存在 → 視為空 map（該訊號全 0），不擋整表。

## 5. 純函式契約（新檔 `src/lib/toolSignals.mjs`，TDD）

無 firebase / browser 依賴，可 `node --test`。比照 `helpfulBadge.mjs` / `sortTools.mjs` 風格。

### `buildToolSignalRows(tools, maps)`

```
@param tools  object[]  // getAllTools() 結果
@param maps   { viewsMap?, opensMap?, helpfulMap? }  // 各為 { toolId: number }
@returns Row[]  Row = { id, title, status, type, views, opens, helpful }
```

- 一律回**新陣列 / 新物件**，不 mutate 輸入。
- 每個訊號數值：`Number.isFinite(n) && n > 0 ? n : 0`（缺 / 非數值 / 負 → 0），比照
  `attachHelpfulCounts`。
- `title` 缺 → 用 `id`；`status` / `type` 缺 → 空字串。
- `tools` 非陣列 → `[]`；`maps` 任一缺 → 當 `{}`。

### `sortToolSignalRows(rows, key)`

```
@param rows Row[]
@param key  "views" | "opens" | "helpful"
@returns Row[]  // 新陣列，依 key 數值遞減；穩定排序（相等保留原順序）
```

- **穩定排序**：用 index tiebreaker（比照 `rankPopularTools` 的穩定作法），相等值保留輸入順序。
- 比較子對非數值顯式視為 `-Infinity`，避免 `NaN` 比較 UB（rows 已 coerce，但仍防禦）。
- `rows` 非陣列 → `[]`；未知 / 缺 `key` → 回原順序的淺拷貝（不丟錯）。

> 註：`title` 不列為可排序 key（YAGNI，三訊號排序已足夠決策；要再加再說）。

## 6. UI 規格

- 位置：`UsageDashboard.jsx`，取代第 93–121 行的「工具開啟排名（近 14 天）」區塊。
- 標題改為：`工具訊號總表`（小字註：`瀏覽・有幫助為全期；開啟為近 14 天`）。
- 表格：用既有卡片風 className（`var(--color-card-bg)` / `--color-card-border)` / 圓角），
  深色相容（沿用既有 CSS 變數，不寫死色）。
- **欄位標題可點排序**：點擊 `👁 瀏覽` / `📂 開啟` / `👍 有幫助` 設 `sortKey`；
  當前排序欄位加視覺標示（如 ▼ 或粗體 / `--color-clay-purple`）。
  - 無障礙：排序鈕用 `<button>`，加 `aria-pressed`（當前排序欄位 `true`），比照
    HubExplorer sort toggle 的 `aria-pressed` 作法。
- **RWD**：窄螢幕水平捲動（`overflow-x-auto` 容器）或精簡欄位；標題欄 sticky 視情況。
  數值欄右對齊、`tabular-nums`、`toLocaleString()`。
- **狀態 chip**：status（live/beta/new/dev/pending/terminated）以小 pill 呈現，沿用站上既有顏色語彙
  （若無共用常數則就地簡單上色，不新增大抽象）。
- 空狀態：完全沒有任何工具 → 「目前沒有工具資料。」；有工具但全零訊號 → 照常顯示（全 0），
  不特別提示（零訊號能見度本就是目的）。
- 載入中：沿用現有 `載入中…`。

## 7. 測試計畫

- `src/lib/toolSignals.test.mjs`（`node --test`）：
  - `buildToolSignalRows`：正常 join；缺訊號 → 0；非數值 / 負值 → 0；`title` 缺用 `id`；
    `tools` 非陣列 → `[]`；`maps` 缺 → 全 0；不 mutate 輸入（凍結輸入驗證）。
  - `sortToolSignalRows`：依各 key 遞減；穩定排序（相等保序）；未知 key → 原順序；
    非陣列 → `[]`；含 0 值排到尾。
- 既有 `test:unit` 全綠（不破壞）。
- `npm run lint` 0 error、`npm run build` 通過。
- 元件層無自動化測試（沿用專案慣例，UI 由 Jason 部署後肉眼驗）。

## 8. 風險與非目標

- **混合視窗**：瀏覽 / 有幫助全期、開啟 14d，欄位標題與區塊小字明確標示，避免誤讀為同基準。
- **大整數精度**：內部站量級遠低於 `Number.MAX_SAFE_INTEGER`，不處理（YAGNI）。
- **讀取成本**：14 個 `analytics_daily` getDoc 是既有行為（不新增）；新增 2 個單 doc 讀，
  admin-only 頁面、可忽略。
- 非目標：任何寫入、任何排序持久化（URL / localStorage）、任何旗標 / 建議 / AI 分析
  （需求面已有 `💡 需求看板`）。

## 9. 部署後驗證（Jason）

1. 進 `/admin` → `📊 使用概況`：4 張累計卡照舊；下方出現三訊號合表，預設依瀏覽遞減。
2. 點「📂 開啟」「👍 有幫助」欄位標題 → 重新排序、當前欄位有標示。
3. 高瀏覽工具在預設視圖排在前；零訊號工具沉在最底且數值顯示 0。
4. 深色模式 + 窄螢幕（手機）表格可讀 / 可捲動。

## 10. 工作流程

subagent-driven：

- Task 1：`src/lib/toolSignals.mjs` 純函式 + `toolSignals.test.mjs`（TDD）
- Task 2：`UsageDashboard.jsx` 接純函式 + 三訊號合表 UI + 排序互動
- 每 task implementer → spec/quality review；最後整體 reviewer → 開 PR 等 Jason merge。

無 rules / 資料 / SA → merge 即部署。
