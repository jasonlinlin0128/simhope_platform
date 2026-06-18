# /hub 排序（最熱門 + 最新）

- 日期：2026-06-16
- 狀態：設計定案（brainstorm 核可 → 待 writing-plans → review agent → 實作）
- 主題：/hub 資源中心加 sort control，把使用訊號（全期 views）帶進主瀏覽面，並用「最新」讓新工具浮上來。飛輪「訊號 → 回饋發現」延伸到主瀏覽頁（首頁🔥熱門 #51、ToolCard 👍 badge #58 之後）。

## 背景與問題

- 首頁有 🔥熱門（全期 views 排序，#51），ToolCard 有 👍 badge（#58），但 **/hub（主瀏覽面）完全不吃任何訊號**——`getServerCatalog` 的 runQuery 無 `orderBy`，目前是隨機 **Firestore document-id 序**（t1, t10, t11, t2…），無意義。
- 目標：① 把訊號（views）帶進 /hub ② 讓新工具有機會浮上來（全期排名偏袒老工具）。

## 決策（brainstorm 定案）

| 維度                 | 決定                                                          | 理由                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 排序模式             | **最熱門（全期 views，預設）+ 最新（createdAt）** 兩個 toggle | 最熱門＝訊號進主瀏覽面（本案核心）；最新＝直接達成「新工具浮上來」、零 dated-analytics 機制、涵蓋所有類型、資料全現成                                          |
| **不做** 30 天趨勢榜 | 排除                                                          | dated per-tool 訊號只有 opens（`analytics_daily.byTool`）→ mcp/embedded 無 opens 盲區、內部站窗內資料稀疏/雜訊、複雜度高；「新工具浮上來」由「最新」更簡單達成 |
| 預設                 | **最熱門**                                                    | 現有順序是隨機 id 序、不損失有意義排序；訊號直接進主瀏覽面；新工具可靠「最新」sort + 「新上線」status badge 補                                                 |
| 搜尋中               | **維持 Fuse 相關度**（sort 不套用）                           | 搜尋意圖下相關度 > 人氣；清除搜尋回到所選 sort                                                                                                                 |
| 持久化               | **client state，不做 URL `?sort=`**                           | sort 純前端、不需 server round-trip；YAGNI                                                                                                                     |

## 目標 / 非目標

**目標**

- /hub 加 sort toggle「🔥 最熱門 / 🆕 最新」，預設最熱門。
- 純函式 `sortTools(tools, mode, viewsMap)` + TDD。
- 零外部付費 API、零新 npm 依賴、零 firestore.rules 變更、無 migration / index / SA → merge 即部署。

**非目標（之後 / YAGNI）**

- 30 天 opens 趨勢榜、helpful 排序、URL `?sort=` 持久化、首頁/ToolCard 變更、「推薦」混合排序、排序持久化到 user profile。

## 架構與資料流

```
app/hub/page.jsx (server)
  Promise.all([ getServerCatalog(), getServerToolHelpful(), getServerToolViews() ])
    → tools = attachHelpfulCounts(catalog, helpfulMap)   // #58 既有，badge 用
    → <HubExplorer tools={tools} viewsMap={viewsMap} initialCat={initialCat} />

HubExplorer (client island)
  state: activeCat, searchQuery, sortMode("popular" 預設)
  pipeline（既有 filtered 末端加 sort）:
    base = activeTools (非 terminated)
    if search:  matches = fuse.search(q).map(item)   // 相關度序
      else:     matches = base
    if cat!=all: matches = matches.filter(category)
    ordered =  debouncedQuery ? matches            // 搜尋中：相關度
                              : sortTools(matches, sortMode, viewsMap)
  render: sort toggle UI + grid(ordered)

sortTools(tools, mode, viewsMap)  // 純函式
  "popular": (viewsMap[id]||0) desc, 穩定
  "recent" : Date.parse(createdAt) desc（NaN→最舊/排最後）, 穩定
```

## 元件

1. **`src/lib/sortTools.mjs`（新，純函式）**
   - `sortTools(tools, mode, viewsMap = {})` → 回新陣列、不 mutate、穩定排序。
     - `"popular"`：依 `Number(viewsMap?.[t.id]) || 0` 由大到小。
     - `"recent"`：依 `Date.parse(t.createdAt)`（NaN → `-Infinity` 視為最舊）由大到小。
     - `tools` 非陣列 → `[]`；未知 mode → 回原序淺拷貝（安全預設）。
2. **`src/lib/sortTools.test.mjs`（新，node:test）** — 見「測試」。
3. **`app/hub/page.jsx`（改）** — `Promise.all` 加 `getServerToolViews()`（已存在於 serverCatalog，首頁在用）；保留 #58 的 `getServerToolHelpful` + `attachHelpfulCounts`；把 `viewsMap` 當 prop 傳給 HubExplorer。
4. **`src/components/HubExplorer.jsx`（改）** — 新 prop `viewsMap`；新 state `sortMode`（預設 `"popular"`）；`filtered` pipeline 末端依「搜尋中?」決定相關度 or `sortTools`；加 sort toggle UI（搜尋框/CategoryTabs 附近，segmented「🔥 最熱門 / 🆕 最新」，clay 樣式 + 深色 + `aria`）。

> ToolCard / 首頁 / serverCatalog 既有函式不需改（`getServerToolViews` 已存在）。

## 誠實 / 邊界

- 「最熱門」= 真實全期 views aggregate（同首頁熱門訊號）；0 view 工具沉底但仍可見（不隱藏）。
- `createdAt` 經 REST `docToObject` 為 ISO 字串（`firestoreValue.mjs` timestampValue 保留 ISO）→ `Date.parse` 可比較；缺/壞值排最後、不 crash。
- 排序純展示，不影響後端資料、不參與其他頁面。

## 💰 成本 / 基礎設施

- **零新付費 API、零新 npm 依賴**；`analytics/toolViews` 已公開可讀（首頁在用）→ **無 firestore.rules 變更**、無 index（client 端排序、非 Firestore orderBy）/ TTL / SA。→ merge 即部署。

## 測試（TDD）

`src/lib/sortTools.test.mjs`（node:test）：

- `"popular"`：依 viewsMap 由大到小；缺 key / 0 view → 視為 0、沉底且保持原序（穩定）。
- `"recent"`：依 createdAt（ISO 字串）新到舊；缺 createdAt / 無法解析 → 排最後。
- 未知 mode（如 `"xxx"`）→ 回原序（淺拷貝、內容同序）。
- `tools` 非陣列 / `undefined` → `[]`。
- 不 mutate 原 `tools`（回新陣列、原序不變）。
- 穩定性：同 view 數 / 同 createdAt → 維持輸入順序。

其餘（hub/page.jsx fetch、HubExplorer sort UI/pipeline）：`npm run lint` + `npm run build` + 部署後人工驗。

## Rollout

1. merge → Vercel 部署（無前置 ops）。
2. 部署後人工驗：
   - /hub 預設「最熱門」：高 view 工具在前（與首頁🔥熱門 top 一致方向）。
   - 切「最新」：依 createdAt 新到舊（新工具在前）。
   - 搜尋打字：結果回相關度；清除後回所選 sort。
   - 分類 tab 切換後 sort 仍套用。
   - 深色模式 toggle 協調、窄螢幕不破版、鍵盤可操作。

## 風險 / 緩解

- **新工具（0 view）在預設最熱門下沉底** → 由「最新」sort + 卡片「新上線」status badge 補；屬已知取捨（預設＝訊號優先）。
- **`analytics/toolViews` 不存在 / 讀取失敗** → `getServerToolViews` fail-soft 回 `{}` → 所有 views=0 → 最熱門退化為原序（穩定）、不破頁。
- **createdAt 型別不一致**（部分舊資料可能無 createdAt）→ `Date.parse` NaN → 排最後、不 crash。
