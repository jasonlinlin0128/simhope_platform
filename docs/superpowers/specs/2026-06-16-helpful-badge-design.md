# 👍 訊號回饋發現（ToolCard helpful badge）

- 日期：2026-06-16
- 狀態：設計定案（brainstorm 核可 → 待 writing-plans → review agent → 實作）
- 主題：把 #57 收集中的 `analytics/toolHelpful` 訊號，從「只在詳情頁顯示」接進**發現面**——在 ToolCard 上加「👍 N」badge。閉合飛輪「訊號 → 回饋發現」最後一段。

## 背景與問題

飛輪 = 內容 → 發現 → 使用 → 訊號 → 回饋發現。目前最後一段只半接：

- 🔥 首頁熱門用 `tool_view`（被動瀏覽）排序（#51）。
- 👍 `analytics/toolHelpful`（#57，主動表態）**只在詳情頁顯示**，沒進任何發現面 → 是個孤兒訊號。
- /hub（主瀏覽面）完全不吃任何訊號。

把 helpful 訊號做成 **ToolCard badge**，讓「同仁覺得有用」在卡片層級到處可見，回饋進發現決策。

## 為什麼是 badge 而非 ranking row（brainstorm 定案）

| 維度   | 決定                                                                  | 理由                                                                                                                                                                                         |
| ------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 形式   | **ToolCard 上的 👍 badge**（非首頁獨立「最有幫助」排行區）            | 依**原始 helpful count** 排的 row 會跟 🔥熱門（views）高度重疊（同批熱門工具同時被多看＋多按）＝近乎重複的第二排。badge 改在卡片層級，一個元件改動就讓訊號**同時**出現在所有發現面、零重複。 |
| 樣式   | **「👍 N」，門檻 ≥3 才顯示**                                          | 沿用 `popularTools` 的 `minWithViews=3` 防噪哲學；≥3 才算「多人認可」，數字有意義；與詳情頁已露「N 人覺得有幫助」一致（誠實）。                                                              |
| 資料流 | **在資料源 enrich tool 物件**（加 `helpfulCount`），ToolCard 簽名不動 | 否決方案：ToolCard 自己 client `getDoc` → 每張卡讀一次同一 doc（首頁 6＋/hub 14+ = N 次重複讀）。資料層 enrich 每頁只讀 1 次、且 server-render 無 client 抖動。                              |
| 範圍   | 首頁熱門 / /hub / chatbot 找工具結果；**Dashboard 不做**              | 前三者是公開發現面；Dashboard 是作者管理面（非發現面）、且需額外 client read → YAGNI 排除。                                                                                                  |

## 目標 / 非目標

**目標**

- ToolCard 在 `helpfulCount >= 3` 時顯示「👍 N」小 pill；出現在首頁熱門、/hub、chatbot 找工具結果三個發現面的卡片上。
- 純函式 `attachHelpfulCounts` + gating 邏輯，TDD（node:test）。
- 零外部付費 API、零新 npm 依賴、零 firestore.rules 變更、無 migration / index / SA → merge 即部署。

**非目標（之後 / YAGNI）**

- 首頁「👍 最有幫助」獨立排行區、`rankHelpfulTools` ranking 函式。
- helpful/view **比率**「品質榜」（需雙資料集＋最小分母防噪）。
- Dashboard 卡片顯示作者自己工具的 👍 數。
- 防灌水強化（見「誠實 / 已知限制」）。

## 架構與資料流

```
analytics/toolHelpful  ({ toolId: count, updatedAt })   ← #57 已在累加
        │  (Firestore REST, ISR 5min, fail-soft {})
        ▼
getServerToolHelpful()                                   ← 鏡像 getServerToolViews()
        │
        ▼
attachHelpfulCounts(tools, helpfulMap)                   ← 純函式：每個 tool 補 helpfulCount（缺→0）
        │
        ├─ app/page.jsx         (server, Promise.all 加一項；attach 到熱門卡)
        ├─ app/hub/page.jsx     (server → 傳 enriched tools 給 HubExplorer 島)
        └─ app/api/find-tool/route.js (server route, 回傳前 attach)
        │
        ▼
ToolCard  讀 tool.helpfulCount → shouldShowHelpfulBadge(count) 為真才 render「👍 N」
```

## 元件

1. **`src/lib/helpfulBadge.mjs`（新，純函式）**
   - `export const HELPFUL_BADGE_MIN = 3;`
   - `shouldShowHelpfulBadge(count)` → `Number(count) >= HELPFUL_BADGE_MIN`（非數值/負/undefined → false）。
   - `attachHelpfulCounts(tools, helpfulMap)` → 回傳新陣列，每個 tool `{ ...t, helpfulCount: Number(helpfulMap?.[t.id]) || 0 }`；`tools` 非陣列 → `[]`；保留原物件其餘欄位。
2. **`src/lib/helpfulBadge.test.mjs`（新，node:test）** — 見「測試」。
3. **`src/lib/serverCatalog.js`（改）** — 加 `getServerToolHelpful()`，**逐字鏡像** `getServerToolViews()`（fetch `${BASE}/analytics/toolHelpful`、`next:{revalidate:REVALIDATE}`、`!res.ok→{}`、`docToObject` 後濾數值欄位、catch→{}）。
4. **`src/components/ToolCard.jsx`（改）** — 從 `tool` 解構 `helpfulCount`；在底部 meta 行（狀態 badge 之後、`ml-auto` 日期之前）`shouldShowHelpfulBadge(helpfulCount)` 為真時 render `👍 {helpfulCount}` 小 pill（`px-2 py-0.5 rounded-md` + 淡色正向底 + 深色相容）。
5. **`app/page.jsx`（改）** — `Promise.all` 加 `getServerToolHelpful()`；`attachHelpfulCounts(popular, helpfulMap)`（只 enrich 要 render 的熱門卡即可）。
6. **`app/hub/page.jsx`（改）** — fetch `getServerToolHelpful()`、`attachHelpfulCounts(tools, helpfulMap)`、傳 enriched tools 給 HubExplorer。
7. **`app/api/find-tool/route.js`（改）** — 該 route 已 `import { getServerCatalog } from "@/lib/serverCatalog"`；比對出 tools 後、回傳 `{reply, tools}` 前，呼叫 **`getServerToolHelpful()`（同模組）** → `attachHelpfulCounts(tools, helpfulMap)`。**fail-soft**：`getServerToolHelpful` 本身 catch→`{}`，讀失敗 → 全 `helpfulCount=0`（badge 不顯示），不影響找工具主流程。

> HubExplorer.jsx / ChatbotWidget.jsx **不需改**——它們只是 `<ToolCard tool={t} />`，tool 已帶 helpfulCount。

## 誠實 / 已知限制

- 「👍 N」＝真實 aggregate count（與詳情頁同一 doc）；門檻 ≥3 才顯示，<3 的工具卡無 badge（不顯示「👍 0」「👍 1」）。
- **anti-gaming = 非目標（沿用 #57 spec）**：`tool_helpful` 不擋作者/admin 自按（詳情頁 `HelpfulButton` 對所有人記一筆，與 `tool_view` 的作者/admin gating 不同）。但 ≥3 門檻使**單次**自按無法單獨觸發 badge。記錄為已知限制、不在本案修。
- badge 為純展示、不參與任何排序（排序仍只看 views）。

## 💰 成本 / 基礎設施

- **零新付費 API、零新 npm 依賴**。
- `analytics/toolHelpful` 已存在且公開可讀（同 `toolViews`，#57 已用）→ **無 firestore.rules 變更**、無 index / TTL / SA 動作。
- 純前端 + server 讀取既有 doc → **merge 即 Vercel 部署生效**。

## 測試（TDD）

`src/lib/helpfulBadge.test.mjs`（node:test）：

- `HELPFUL_BADGE_MIN === 3`。
- `shouldShowHelpfulBadge`：`2→false`、`3→true`、`7→true`、`0→false`、`undefined→false`、`"5"→true`、`-1→false`、`NaN→false`。
- `attachHelpfulCounts`：
  - 正常 map → 每 tool 帶正確 `helpfulCount`，其餘欄位保留。
  - 缺 key / map 為 `{}` / `undefined` → `helpfulCount: 0`。
  - map 值非數值（如字串、null）→ `0`。
  - `tools` 非陣列 / `undefined` → `[]`。
  - 不 mutate 原 tools（回傳新物件）。

其餘（serverCatalog REST、ToolCard render、三個源 enrich）：`npm run lint` + `npm run build` + 部署後人工驗。

## Rollout

1. merge → Vercel 部署（無前置 ops：無 rules 發布 / 無 migration / 無 SA）。
2. 部署後人工驗：找一個 `analytics/toolHelpful` 已 ≥3 的工具（或先用 Admin SDK 把某工具 count 設 ≥3）：
   - 首頁 🔥熱門卡、/hub 該卡、chatbot 找工具結果卡 → 出現「👍 N」。
   - count <3 的工具卡 → 無 badge。
   - 深色模式 badge 協調、窄卡 flex-wrap 不破版。

## 風險 / 緩解

- **helpful 與 views 重疊（badge 看起來只貼在熱門卡）** → 預期內：badge 是卡片層級訊號、出現在所有發現面（含 /hub 全列、chatbot 結果），不限熱門；隨資料累積，niche 但被按 ≥3 的工具也會帶 badge。
- **`analytics/toolHelpful` doc 不存在 / 讀取失敗** → `getServerToolHelpful` fail-soft 回 `{}` → 所有 `helpfulCount=0` → 全無 badge（不破頁）。
- **find-tool 讀 helpful 失敗** → fail-soft 不附 count，找工具主流程不受影響。
